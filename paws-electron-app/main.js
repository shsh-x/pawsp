const { app, BrowserWindow, ipcMain, Menu, net, protocol, dialog } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const fs = require('node:fs');
const Store = require('electron-store').default;

// --- Auto-update and Logging Setup ---
autoUpdater.logger = log;
log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.autoDownload = false; // We'll prompt the user first in the future
autoUpdater.autoInstallOnAppQuit = true;

// --- Global Variables ---
const isDev = !app.isPackaged;
const store = new Store();

const WIDE_WIDTH = 1200;
const COMPACT_WIDTH = 672;
const WINDOW_HEIGHT = 800;

let mainWindow;
let splashWindow;
let csharpProc = null;

// --- State Flags for Startup Sequence ---
let mainAppStructureReady = false;
let csharpHostReady = false;
let updateProcessFinished = false;

// --- C# Backend Host Path ---
const csharpHostPath = isDev
    ? path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'Paws.Host.exe')
    : path.join(path.dirname(app.getPath('exe')), 'Paws.DotNet', 'Paws.Host.exe');

// --- Window Creation and Management ---

function sendToSplash(channel, data) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send(channel, data);
    }
}

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 360,
        height: 400,
        frame: false,
        resizable: false,
        center: true,
        alwaysOnTop: !isDev,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload-splash.js'),
            contextIsolation: true,
        },
    });
    splashWindow.loadFile('splash.html');
    splashWindow.once('ready-to-show', () => splashWindow.show());
    splashWindow.on('closed', () => splashWindow = null);
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: store.get('isCompact', false) ? COMPACT_WIDTH : WIDE_WIDTH,
        height: WINDOW_HEIGHT,
        resizable: false,
        frame: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('index.html');
    Menu.setApplicationMenu(null);
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.on('closed', () => mainWindow = null);
}

function attemptShowMainWindow() {
    // This function ensures all critical async startup tasks are complete before showing the main window.
    if (mainAppStructureReady && csharpHostReady && updateProcessFinished && splashWindow) {
        sendToSplash('splash-status-update', 'Launching Paws...');
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                mainWindow.show();
            }
            splashWindow?.close();
        }, 500);
    }
}

// --- C# Backend Management ---

function startCSharpHost() {
    sendToSplash('splash-status-update', 'Starting backend services...');
    log.info(`Attempting to start C# host from: ${csharpHostPath}`);

    // Pass the list of approved plugin GUIDs to the backend on startup.
    const approvedGuids = store.get('approvedPlugins', []);
    const args = [JSON.stringify(approvedGuids)];

    try {
        csharpProc = spawn(csharpHostPath, args);
        let hostSignaledReady = false;
        
        csharpProc.stdout.on('data', (data) => {
            const logMessage = data.toString().trim();
            log.info(`C# Host STDOUT: ${logMessage}`);
            // Forward logs to the main window's dev console for easier debugging.
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('csharp-log', logMessage);
            }
            // Listen for the magic string that ASP.NET Core emits when it's ready to accept connections.
            if (!hostSignaledReady && logMessage.includes("Application started.")) {
                hostSignaledReady = true;
                log.info("C# Host signaled readiness.");
                sendToSplash('splash-status-update', 'Backend services started.');
                csharpHostReady = true;
                attemptShowMainWindow();
            }
        });

        csharpProc.stderr.on('data', (data) => log.error(`C# Host STDERR: ${data.toString().trim()}`));
        csharpProc.on('close', (code) => {
            log.info(`C# host process exited with code ${code}.`);
            csharpProc = null;
        });
        csharpProc.on('error', (err) => log.error('Failed to start C# Host process.', err));

    } catch (error) {
        log.error('Error spawning C# Host process:', error);
        // If the backend fails, we should probably show an error and quit. For now, we continue.
        csharpHostReady = true; 
        attemptShowMainWindow();
    }
}

// --- Electron App Lifecycle & Auto-Update Events ---

app.whenReady().then(async () => {
    // The base directory where all plugins are stored.
    const pluginsBaseDir = isDev
        ? path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'plugins')
        : path.join(path.dirname(app.getPath('exe')), 'plugins');

    // Create the plugins directory if it doesn't exist.
    if (!fs.existsSync(pluginsBaseDir)) {
        fs.mkdirSync(pluginsBaseDir, { recursive: true });
    }

    const pluginGuidToFolderMap = new Map();

    // Scan for all plugins and map their GUIDs to their folder names for the custom protocol.
    try {
        const pluginFolders = fs.readdirSync(pluginsBaseDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const folderName of pluginFolders) {
            const manifestPath = path.join(pluginsBaseDir, folderName, 'plugin.json');
            if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                if (manifest.id) {
                    pluginGuidToFolderMap.set(manifest.id.toLowerCase(), folderName);
                }
            }
        }
    } catch (e) {
        log.error('Failed to build plugin folder map:', e);
    }
    
    // --- NEW: Register `paws-app://` protocol for internal app files ---
    protocol.handle('paws-app', (request) => {
        try {
            const url = new URL(request.url);
            
            // --- THIS IS THE FIX ---
            // For a URL like `paws-app://settings.html`, the resource name is in the 'hostname'.
            // For a URL like `paws-app://assets/icon.png`, the hostname is 'assets' and pathname is '/icon.png'.
            // We must combine them to get the correct relative path.
            const requestedPath = decodeURIComponent(url.hostname + url.pathname).replace(/^\//, ''); // Combine and remove leading slash

            // All app files are relative to the app's root directory (__dirname)
            const absolutePath = path.join(__dirname, requestedPath);

            // Security check: ensure we don't accidentally serve files from outside the app directory
            if (!path.normalize(absolutePath).startsWith(path.normalize(__dirname))) {
                 log.error(`Security violation: Attempt to access file outside of app directory. Request: ${request.url}`);
                return new Response(null, { status: 403 });
            }

            return net.fetch(encodeURI(`file://${absolutePath.replace(/\\/g, '/')}`));
        } catch (error) {
            log.error(`Error in 'paws-app' protocol handler for ${request.url}: ${error}`);
            return new Response(null, { status: 500 });
        }
    });

    // Register `paws-plugin://` protocol to serve UI files securely from plugin folders.
    protocol.handle('paws-plugin', (request) => {
        try {
            const url = new URL(request.url);
            const pluginId = url.hostname.toLowerCase();
            const folderName = pluginGuidToFolderMap.get(pluginId);

            if (!folderName) {
                log.error(`Protocol Error: Could not find a folder for plugin GUID ${pluginId}.`);
                return new Response(null, { status: 404 });
            }

            const requestedPath = decodeURIComponent(url.pathname).substring(1);
            const safeBaseDir = path.join(pluginsBaseDir, folderName, 'ui');
            const absolutePath = path.join(safeBaseDir, requestedPath);
            
            // Security check: ensure the request is not trying to access files outside its designated UI folder.
            if (!path.normalize(absolutePath).startsWith(path.normalize(safeBaseDir))) {
                log.error(`Security violation: Attempt to access file outside of allowed directory. Request: ${request.url}`);
                return new Response(null, { status: 403 });
            }
            
            return net.fetch(encodeURI(`file://${absolutePath.replace(/\\/g, '/')}`));
        } catch (error) {
            log.error(`Error in custom protocol handler for ${request.url}: ${error}`);
            return new Response(null, { status: 500 });
        }
    });

    createSplashWindow();
    
    // Reset flags for startup sequence
    mainAppStructureReady = false;
    csharpHostReady = false;
    updateProcessFinished = false;

    // Check for updates unless in development mode.
    if (!isDev) {
        autoUpdater.checkForUpdates();
    } else {
        sendToSplash('splash-status-update', 'Update check skipped (Dev Mode).');
        setTimeout(() => {
            updateProcessFinished = true;
            attemptShowMainWindow();
        }, 1500);
    }

    createMainWindow();
    startCSharpHost();
});

autoUpdater.on('checking-for-update', () => sendToSplash('splash-status-update', 'Checking for updates...'));
autoUpdater.on('update-available', (info) => {
    sendToSplash('splash-status-update', `Update v${info.version} found. Downloading...`);
    autoUpdater.downloadUpdate();
});
autoUpdater.on('update-not-available', (info) => {
    sendToSplash('splash-status-update', 'Paws is up to date.');
    setTimeout(() => { updateProcessFinished = true; attemptShowMainWindow(); }, 1500);
});
autoUpdater.on('error', (err) => {
    sendToSplash('splash-status-update', `Update error: ${err.message.split('\n')[0]}`);
    setTimeout(() => { updateProcessFinished = true; attemptShowMainWindow(); }, 3000);
});
autoUpdater.on('download-progress', (progressObj) => sendToSplash('splash-progress-update', { percent: progressObj.percent }));
autoUpdater.on('update-downloaded', (info) => {
    sendToSplash('splash-status-update', `Update v${info.version} downloaded. Will install on restart.`);
    setTimeout(() => { updateProcessFinished = true; attemptShowMainWindow(); }, 3000);
});

app.on('window-all-closed', () => {
    if (csharpProc) {
        log.info('Killing C# host process...');
        csharpProc.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers (The bridge between renderer and main processes) ---

ipcMain.on('renderer-ready', () => {
    log.info("Main renderer is ready. Attempting to show window.");
    mainAppStructureReady = true;
    attemptShowMainWindow();
});

ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('close-window', () => mainWindow?.close());

ipcMain.on('resize-window', (event, isCompact) => {
    if (mainWindow) {
        const newWidth = isCompact ? COMPACT_WIDTH : WIDE_WIDTH;
        mainWindow.setResizable(true);
        mainWindow.setSize(newWidth, WINDOW_HEIGHT, true);
        mainWindow.setResizable(false);
    }
});

ipcMain.handle('get-api-base-url', () => 'http://localhost:5088');

// --- API passthrough handlers ---
// These handlers simply forward requests from the renderer to the C# backend.
// This creates a secure boundary; the renderer never talks to the backend directly.
async function forwardRequest(endpoint, options = {}) {
    const baseUrl = 'http://localhost:5088';
    try {
        const response = await net.fetch(`${baseUrl}${endpoint}`, options);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `API Error ${response.status}`);
        }
        const responseText = await response.text();
        return responseText ? JSON.parse(responseText) : null;
    } catch (error) {
        log.error(`API request to ${endpoint} failed:`, error.message);
        throw error;
    }
}

ipcMain.handle('api-get', (event, endpoint) => forwardRequest(endpoint));

ipcMain.handle('api-post', (event, { endpoint, body }) => {
    return forwardRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
});

// --- Local Electron Functionality ---

ipcMain.handle('show-open-dialog', (event, options) => {
    if (mainWindow) return dialog.showOpenDialog(mainWindow, options);
    return { canceled: true, filePaths: [] };
});

ipcMain.handle('get-store-value', (event, key) => store.get(key));

ipcMain.handle('set-store-value', (event, { key, value }) => {
    store.set(key, value);
});

ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.quit();
});
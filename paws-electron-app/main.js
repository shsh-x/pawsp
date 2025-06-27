const { app, BrowserWindow, ipcMain, Menu, net, protocol, dialog } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const fs = require('node:fs');
const Store = require('electron-store').default;

// --- Auto-update and Logging Setup ---
log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// --- Global Variables ---
const isDev = !app.isPackaged;
const store = new Store();

let mainWindow;
let splashWindow;
let csharpProc = null;
let mainAppStructureReady = false;
let csharpHostReady = false;
let updateProcessFinished = false;

// --- Path to the C# Backend Host ---
const csharpHostPath = isDev
    ? path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'Paws.Host.exe')
    : path.join(path.dirname(app.getPath('exe')), 'resources', 'Paws.DotNet', 'Paws.Host', 'Paws.Host.exe');

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
        width: 1200,
        height: 800,
        resizable: false,
        frame: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Allows the use of the <iframe> tag for plugins
            webviewTag: true, 
        },
        icon: path.join(__dirname, 'assets', 'paws_logo_splash.png') // Assuming you want to keep the logo as the icon
    });

    mainWindow.loadFile('index.html');
    Menu.setApplicationMenu(null);
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.on('closed', () => mainWindow = null);
}

function attemptShowMainWindow() {
    // This function ensures all startup tasks are complete before showing the main window.
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

    // Get the list of approved plugin GUIDs from storage. This is the generic way.
    const approvedGuids = store.get('approvedPlugins', []);
    const args = [JSON.stringify(approvedGuids)];

    try {
        csharpProc = spawn(csharpHostPath, args);
        let hostSignaledReady = false;
        
        // Generic log forwarder. It no longer looks for plugin-specific messages.
        csharpProc.stdout.on('data', (data) => {
            const logMessage = data.toString();
            log.info(`C# Host STDOUT: ${logMessage.trim()}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('csharp-log', logMessage);
            }
            if (!hostSignaledReady && (logMessage.includes("Listening on http://localhost:5088") || logMessage.includes("Application started."))) {
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
        csharpHostReady = true;
        attemptShowMainWindow();
    }
}

// --- Electron App Lifecycle Events ---

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

app.whenReady().then(async () => {
    const pluginsBaseDir = isDev
        ? path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'plugins')
        : path.join(path.dirname(csharpHostPath), 'plugins');

    const pluginGuidToFolderMap = new Map();

    try {
        if (fs.existsSync(pluginsBaseDir)) {
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
        }
    } catch (e) {
        log.error('Failed to build plugin folder map:', e);
    }

    // This custom protocol allows plugins to load their own UI files securely.
    protocol.handle('paws-plugin', (request) => {
        try {
            const url = new URL(request.url);
            const pluginId = url.hostname.toLowerCase();
            const folderName = pluginGuidToFolderMap.get(pluginId);

            if (!folderName) {
                log.error(`Protocol Error: Could not find a folder for plugin GUID ${pluginId}.`);
                return new Response(null, { status: 404 });
            }

            const requestedPath = decodeURIComponent(url.pathname);
            const absolutePath = path.join(pluginsBaseDir, folderName, 'ui', requestedPath);
            const safeBaseDir = path.join(pluginsBaseDir, folderName, 'ui');
            
            if (!path.normalize(absolutePath).startsWith(path.normalize(safeBaseDir))) {
                log.error(`Security violation: Attempt to access file outside of allowed directory. Request: ${request.url}`);
                return new Response(null, { status: 403 });
            }
            return net.fetch(`file://${absolutePath}`);
        } catch (error) {
            log.error(`Error in custom protocol handler for ${request.url}: ${error}`);
            return new Response(null, { status: 500 });
        }
    });

    createSplashWindow();
    
    mainAppStructureReady = false;
    csharpHostReady = false;
    updateProcessFinished = false;

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

app.on('window-all-closed', () => {
    if (csharpProc) csharpProc.kill();
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers (The bridge between renderer and main processes) ---

ipcMain.on('renderer-ready', () => {
    log.info("Renderer is ready.");
    mainAppStructureReady = true;
    attemptShowMainWindow();
});

ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('close-window', () => mainWindow?.close());

// --- Generic Handlers for Framework Features ---

ipcMain.handle('get-api-base-url', () => 'http://localhost:5088');

ipcMain.handle('show-open-dialog', (event, options) => {
    if (mainWindow) return dialog.showOpenDialog(mainWindow, options);
    return { canceled: true, filePaths: [] };
});

ipcMain.handle('get-store-value', (event, key) => {
    return store.get(key);
});

ipcMain.handle('set-store-value', (event, { key, value }) => {
    store.set(key, value);
});

ipcMain.handle('get-approved-plugins', () => store.get('approvedPlugins', []));

ipcMain.handle('set-approved-plugins', (event, guids) => {
    store.set('approvedPlugins', guids);
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Restart Required',
        message: 'Plugin changes have been saved. Please restart Paws for the changes to take effect.',
        buttons: ['OK']
    });
});

ipcMain.handle('resolve-path', (event, filePath) => {
    return path.resolve(__dirname, filePath);
});

ipcMain.handle('execute-plugin-command', async (event, pluginId, command, payload) => {
    const baseUrl = 'http://localhost:5088';
    try {
        const response = await net.fetch(`${baseUrl}/api/plugins/${pluginId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandName: command, payload: payload }),
        });
        if (response.ok) {
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } else {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
    } catch (error) {
        log.error(`Failed to execute plugin command '${command}':`, error);
        throw error;
    }
});
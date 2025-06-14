const { app, BrowserWindow, ipcMain, Menu, net, protocol, dialog } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const fs = require('node:fs');
const Store = require('electron-store').default;

log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const isDev = !app.isPackaged;
const store = new Store();

let mainWindow;
let splashWindow;
let csharpProc = null;
let mainAppStructureReady = false;
let csharpHostReady = false;
let updateProcessFinished = false;

const csharpHostPath = isDev
    ? path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'Paws.Host.exe')
    : path.join(path.dirname(app.getPath('exe')), 'resources', 'Paws.DotNet', 'Paws.Host', 'Paws.Host.exe');

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
            webviewTag: true,
            // The incorrect 'csp' key has been REMOVED from here.
            // The <meta> tag in index.html now handles this.
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('index.html');
    Menu.setApplicationMenu(null);
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.on('closed', () => mainWindow = null);
}

function attemptShowMainWindow() {
    if (mainAppStructureReady && csharpHostReady && updateProcessFinished && splashWindow) {
        log.info("All conditions met. Showing main window and closing splash.");
        sendToSplash('splash-status-update', 'Launching Paws...');
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                mainWindow.show();
            }
            splashWindow?.close();
        }, 500);
    }
}

function startCSharpHost() {
    sendToSplash('splash-status-update', 'Starting backend services...');
    log.info(`Attempting to start C# host from: ${csharpHostPath}`);
    const approvedGuids = store.get('approvedPlugins', []);
    const args = [JSON.stringify(approvedGuids)];
    log.info(`Spawning C# Host with args: ${args[0]}`);
    try {
        csharpProc = spawn(csharpHostPath, args);
        let hostSignaledReady = false;
        const readyTimeout = setTimeout(() => {
            if (!hostSignaledReady) {
                log.error("C# Host did not signal readiness in 15s.");
                csharpHostReady = true;
                attemptShowMainWindow();
            }
        }, 15000);

        csharpProc.stdout.on('data', (data) => {
            const logMessage = data.toString();
            log.info(`C# Host STDOUT: ${logMessage.trim()}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (logMessage.includes("[PROGRESS]")) {
                    const progressMatch = logMessage.match(/\[PROGRESS\] ([\d\.]+)/);
                    if (progressMatch && progressMatch[1]) {
                        mainWindow.webContents.send('cleaner-progress-update', parseFloat(progressMatch[1]));
                    }
                } else {
                    mainWindow.webContents.send('csharp-log', logMessage);
                }
            }
            if (!hostSignaledReady && (logMessage.includes("Listening on http://localhost:5088") || logMessage.includes("Application started."))) {
                hostSignaledReady = true;
                clearTimeout(readyTimeout);
                log.info("C# Host signaled readiness.");
                sendToSplash('splash-status-update', 'Backend services started.');
                csharpHostReady = true;
                attemptShowMainWindow();
            }
        });

        csharpProc.stderr.on('data', (data) => log.error(`C# Host STDERR: ${data.toString().trim()}`));
        csharpProc.on('close', (code) => {
            log.info(`C# host process exited with code ${code}.`);
            clearTimeout(readyTimeout);
            csharpProc = null;
        });
        csharpProc.on('error', (err) => log.error('Failed to start C# Host process.', err));

    } catch (error) {
        log.error('Error spawning C# Host process:', error);
        csharpHostReady = true;
        attemptShowMainWindow();
    }
}

// All auto-updater event handlers remain the same and are correct
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
    protocol.handle('paws-plugin', (request) => {
        try {
            const url = new URL(request.url);
            const pluginId = url.hostname.toLowerCase();
            const requestedPath = decodeURIComponent(url.pathname);
            const pluginsBaseDir = isDev ?
                path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'plugins') :
                path.join(path.dirname(csharpHostPath), 'plugins');
            const absolutePath = path.join(pluginsBaseDir, pluginId, 'ui', requestedPath);
            const safeBaseDir = path.join(pluginsBaseDir, pluginId, 'ui');
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
    sendToSplash('splash-status-update', 'Paws is starting...');
    mainAppStructureReady = false;
    csharpHostReady = false;
    updateProcessFinished = false;

    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            log.error('Error during update check:', err);
            updateProcessFinished = true;
            attemptShowMainWindow();
        });
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

ipcMain.on('renderer-ready', () => {
    log.info("Renderer is ready.");
    mainAppStructureReady = true;
    attemptShowMainWindow();
});

ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('close-window', () => mainWindow?.close());

// --- ALL IPC 'handle' calls ---
ipcMain.handle('get-api-base-url', () => 'http://localhost:5088');

ipcMain.handle('show-open-dialog', (event, options) => {
    if (mainWindow) return dialog.showOpenDialog(mainWindow, options);
    return { canceled: true, filePaths: [] };
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

// THIS HANDLER WAS MISSING
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
    
ipcMain.on('webview-message', (event, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('webview-message', message);
    }
});
});
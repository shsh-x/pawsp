const { app, BrowserWindow, ipcMain, Menu, net } = require('electron'); // Added net
const path = require('node:path');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater'); // << ADDED
const log = require('electron-log'); // For better logging from autoUpdater
const fs = require('node:fs');
const Store = require('electron-store').default;


// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // We want to show progress, so we'll trigger download manually
autoUpdater.autoInstallOnAppQuit = true; // Default, good.

const isDev = !app.isPackaged;
const store = new Store();

let mainWindow;
let splashWindow;
let csharpProc = null;
let mainAppStructureReady = false;
let csharpHostReady = false;
let updateProcessFinished = false; // << New flag

const csharpHostPath = isDev
    ? path.join(__dirname, '..', 'Paws.DotNet', 'Paws.Host', 'bin', 'Debug', 'net8.0', 'Paws.Host.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'Paws.DotNet', 'Paws.Host', 'Paws.Host.exe');

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
    splashWindow.once('ready-to-show', () => {
        splashWindow.show();
    });
    splashWindow.on('closed', () => {
        splashWindow = null;
    });
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
            webSecurity: true,
            contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:5088;",
        },
        icon: path.join(__dirname, 'assets', 'icon.png') // Make sure this exists
    });

    mainWindow.loadFile('index.html');
    Menu.setApplicationMenu(null);

    mainWindow.on('ready-to-show', () => {
        log.info("Main window structure is ready-to-show.");
    });

    if (isDev) {
        // DevTools for main window can be opened when it's shown
    }
    mainWindow.on('closed', () => mainWindow = null);
}

function attemptShowMainWindow() {
    if (mainAppStructureReady && csharpHostReady && updateProcessFinished && splashWindow) {
        log.info("All conditions met. Showing main window and closing splash.");
        sendToSplash('splash-status-update', 'Launching Paws...');
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                mainWindow.show();
                if (isDev && !mainWindow.webContents.isDevToolsOpened()) {
                    mainWindow.webContents.openDevTools();
                }
            }
            splashWindow?.close();
        }, 500);
    } else if (mainAppStructureReady && csharpHostReady && updateProcessFinished && !splashWindow && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()){
        log.info("Splash closed, but conditions met for main window.");
         if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
            if (isDev && !mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.openDevTools();
            }
        }
    } else {
        log.info(`AttemptShowMainWindow: MainAppStructureReady=${mainAppStructureReady}, CSharpHostReady=${csharpHostReady}, UpdateProcessFinished=${updateProcessFinished}, SplashWindowExists=${!!splashWindow}`);
    }
}


function startCSharpHost() {
    sendToSplash('splash-status-update', 'Starting backend services...');
    log.info(`Attempting to start C# host from: ${csharpHostPath}`);

    try {
        csharpProc = spawn(csharpHostPath);
        let hostSignaledReady = false;

        const readyTimeout = setTimeout(() => {
            if (!hostSignaledReady) {
                log.error("C# Host did not signal readiness in 15s.");
                sendToSplash('splash-status-update', 'Backend timeout. Check logs.');
                csharpHostReady = true;
                attemptShowMainWindow();
            }
        }, 15000);

        csharpProc.stdout.on('data', (data) => {
            const logMessage = data.toString();
            log.info(`C# Host STDOUT: ${logMessage.trim()}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                // Check for our special progress message
                if (logMessage.includes("[PROGRESS]")) {
                    const progressMatch = logMessage.match(/\[PROGRESS\] ([\d\.]+)/);
                    if (progressMatch && progressMatch[1]) {
                        const progress = parseFloat(progressMatch[1]);
                        // Send to a specific channel for the cleaner UI
                        mainWindow.webContents.send('cleaner-progress-update', progress);
                    }
                } else {
                    // Forward normal logs
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

        csharpProc.stderr.on('data', (data) => {
            const errorMessage = data.toString();
            log.error(`C# Host STDERR: ${errorMessage.trim()}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('csharp-error', errorMessage);
            }
            if (!hostSignaledReady) {
                sendToSplash('splash-status-update', 'Backend error during startup.');
            }
        });

        csharpProc.on('close', (code) => {
            log.info(`C# Host process exited with code ${code}`);
            clearTimeout(readyTimeout);
            csharpProc = null;
            if (!hostSignaledReady) {
                sendToSplash('splash-status-update', 'Backend failed to start.');
            }
            csharpHostReady = true;
            attemptShowMainWindow();
        });

        csharpProc.on('error', (err) => {
            log.error('Failed to start C# Host process.', err);
            clearTimeout(readyTimeout);
            sendToSplash('splash-status-update', 'Failed to start backend.');
            csharpHostReady = true;
            attemptShowMainWindow();
        });

    } catch (error) {
        log.error('Error spawning C# Host process:', error);
        sendToSplash('splash-status-update', `Error starting backend.`);
        csharpHostReady = true;
        attemptShowMainWindow();
    }
}

// --- AutoUpdater Event Handlers ---
autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendToSplash('splash-status-update', 'Checking for updates...');
    sendToSplash('splash-progress-update', { percent: 0 }); // Show indeterminate
});

autoUpdater.on('update-available', (info) => {
    log.info('Update available.', info);
    sendToSplash('splash-status-update', `Update v${info.version} found. Downloading...`);
    // autoUpdater.downloadUpdate(); // Start download
    // If autoDownload = true (default), this is not needed.
    // If autoDownload = false, then call it here.
    // Since we set autoDownload = false, we need to explicitly call it.
    autoUpdater.downloadUpdate();
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.', info);
    sendToSplash('splash-status-update', 'Paws is up to date.');
    sendToSplash('splash-progress-update', null); // Hide progress
    setTimeout(() => {
        updateProcessFinished = true;
        attemptShowMainWindow();
    }, 1500); // Give user time to read "up to date"
});

autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater. ' + err);
    sendToSplash('splash-status-update', `Update error: ${err.message.split('\n')[0]}`); // Show first line of error
    sendToSplash('splash-progress-update', null);
    setTimeout(() => {
        updateProcessFinished = true;
        attemptShowMainWindow();
    }, 3000); // Longer delay on error
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = `Download speed: ${Math.round(progressObj.bytesPerSecond / 1024)} KB/s`;
    log_message = log_message + ' - Downloaded ' + Math.round(progressObj.percent) + '%';
    log_message = log_message + ' (' + Math.round(progressObj.transferred / 1024) + '/' + Math.round(progressObj.total / 1024) + ' KB)';
    log.info(log_message);
    sendToSplash('splash-status-update', `Downloading update: ${Math.round(progressObj.percent)}%`);
    sendToSplash('splash-progress-update', { percent: progressObj.percent });
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded; will install on next quit.', info);
    sendToSplash('splash-status-update', `Update v${info.version} downloaded. Will install on restart.`);
    sendToSplash('splash-progress-update', null);
    // No need to call autoUpdater.quitAndInstall() here for the "seamless" experience
    // described. It will install when the app is normally closed and reopened.
    setTimeout(() => {
        updateProcessFinished = true;
        attemptShowMainWindow();
    }, 3000); // Give user time to read "downloaded"
});


app.whenReady().then(async () => {
    createSplashWindow();
    sendToSplash('splash-status-update', 'Paws is starting...');

    // Check for internet connection before attempting update check
    const isOnline = await net.isOnline();
    log.info(`Online status: ${isOnline}`);

    if (!isDev && isOnline) { // Only check for updates if packaged and online
        // autoUpdater.checkForUpdates(); // This will trigger the events above
        // For immediate check and download if available:
        autoUpdater.checkForUpdatesAndNotify()
            .then(result => {
                if (!result || !result.updateInfo) { // No update found or error occurred before 'update-available'
                    if (!updateProcessFinished) { // If an error didn't already set it
                        log.info('checkForUpdatesAndNotify resolved but no update found or an early error.');
                        // Handlers 'update-not-available' or 'error' should cover this,
                        // but as a fallback:
                        sendToSplash('splash-status-update', 'Paws is up to date or offline check failed.');
                        sendToSplash('splash-progress-update', null);
                        setTimeout(() => {
                            updateProcessFinished = true;
                            attemptShowMainWindow();
                        }, 2000);
                    }
                }
                // Actual download and handling is done via the event listeners.
            })
            .catch(err => {
                log.error('Error during checkForUpdatesAndNotify: ', err);
                sendToSplash('splash-status-update', 'Could not check for updates.');
                sendToSplash('splash-progress-update', null);
                setTimeout(() => {
                    updateProcessFinished = true;
                    attemptShowMainWindow();
                }, 2000);
            });
    } else {
        if (isDev) {
            sendToSplash('splash-status-update', 'Update check skipped (Dev Mode).');
            log.info("Running in development mode, skipping update check.");
        } else if (!isOnline) {
            sendToSplash('splash-status-update', 'Offline. Skipping update check.');
            log.info("App is offline, skipping update check.");
        }
        setTimeout(() => {
            updateProcessFinished = true;
            attemptShowMainWindow();
        }, 2000); // Give time to read the message
    }

    createMainWindow();
    startCSharpHost();

    // Safety net timeout
    setTimeout(() => {
        if (splashWindow && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            log.warn("Global safety timeout: Forcing main window display.");
            sendToSplash('splash-status-update', 'Loading timed out, launching anyway...');
            csharpHostReady = true;
            mainAppStructureReady = true;
            updateProcessFinished = true; // Force this too
            attemptShowMainWindow();
        } else if (splashWindow && (!mainWindow || mainWindow.isDestroyed())) {
             log.warn("Global safety timeout: Main window not created/destroyed, closing splash.");
             splashWindow.close();
             app.quit();
        }
    }, 30000);
});

ipcMain.on('renderer-ready', () => {
    log.info("Main window renderer is ready.");
    mainAppStructureReady = true;
    attemptShowMainWindow();
});

app.on('window-all-closed', () => {
    if (csharpProc) {
        log.info('Killing C# host process before quitting...');
        csharpProc.kill();
        csharpProc = null;
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        log.info("App activated with no windows, relaunching.");
        // This simple relaunch is okay for now.
        // If the app was quit during an update, autoUpdater handles the install on next launch.
        if (app.relaunch) { // Check if relaunch is available
            app.relaunch();
            app.exit();
        } else { // Fallback for older Electron or specific environments
            createSplashWindow(); // Restart the sequence manually
             // (Logic for updates and main window would need to be re-triggered here too)
        }

    } else if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        log.info("App activated, main window exists but hidden, showing it.");
        mainWindow.show();
    }
});

ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('close-window', () => mainWindow?.close());
ipcMain.handle('get-api-base-url', async () => 'http://localhost:5088');
ipcMain.handle('load-html', async (event, htmlPath) => {
    // Basic security check
    const allowedFiles = ['cleaner.html'];
    if (mainWindow && allowedFiles.includes(path.basename(htmlPath))) {
        const fullPath = path.join(__dirname, htmlPath);
        return fs.readFileSync(fullPath, 'utf-8');
    }
    return null;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    if (mainWindow) {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, options);
        return result;
    }
    return { canceled: true, filePaths: [] };
});

ipcMain.handle('execute-plugin-command', async (event, pluginId, command, payload) => {
    // Forward the command to the C# backend
    const baseUrl = 'http://localhost:5088'; // Assuming this is your API base
    try {
        const response = await net.fetch(`${baseUrl}/api/plugins/${pluginId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandName: command, payload: payload }),
        });
        
        if (response.ok) {
            // Check if response has content before trying to parse JSON
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        } else {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
    } catch (error) {
        log.error(`Failed to execute plugin command '${command}':`, error);
        throw error; // Re-throw to send error back to renderer
    }
});

ipcMain.handle('get-store-value', (event, key) => {
    return store.get(key);
});

ipcMain.handle('set-store-value', (event, key, value) => {
    store.set(key, value);
});
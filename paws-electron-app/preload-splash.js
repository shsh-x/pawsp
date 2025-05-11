const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
    onStatusUpdate: (callback) => ipcRenderer.on('splash-status-update', (_event, message) => callback(message)),
    // onTipUpdate: (callback) => ipcRenderer.on('splash-tip-update', (_event, tip) => callback(tip)), // We'll do tips client-side for now
    onProgressUpdate: (callback) => ipcRenderer.on('splash-progress-update', (_event, progress) => callback(progress)),
    // progress is expected to be an object like { percent: number, message?: string } or null to hide
});
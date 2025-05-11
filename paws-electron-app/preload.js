const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
    onCSharpLog: (callback) => ipcRenderer.on('csharp-log', (_event, value) => callback(value)),
    onCSharpError: (callback) => ipcRenderer.on('csharp-error', (_event, value) => callback(value)),
    signalRendererReady: () => ipcRenderer.send('renderer-ready'),
});
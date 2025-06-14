const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
    onCSharpLog: (callback) => ipcRenderer.on('csharp-log', (_event, value) => callback(value)),
    onCSharpError: (callback) => ipcRenderer.on('csharp-error', (_event, value) => callback(value)),
    signalRendererReady: () => ipcRenderer.send('renderer-ready'),
    loadHtml: (htmlPath) => ipcRenderer.invoke('load-html', htmlPath),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    executePluginCommand: (pluginId, command, payload) => ipcRenderer.invoke('execute-plugin-command', pluginId, command, payload),
    getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
    onCleanerProgressUpdate: (callback) => ipcRenderer.on('cleaner-progress-update', (_event, value) => callback(value)),

});

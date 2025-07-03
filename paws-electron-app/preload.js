const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setLazerPath: (path) => ipcRenderer.invoke('set-lazer-path', path),
    testLazerConnection: () => ipcRenderer.invoke('test-lazer-connection'),
    testLazerWrite: () => ipcRenderer.invoke('test-lazer-write'),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    resizeWindow: (isCompact) => ipcRenderer.send('resize-window', isCompact),
    getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
    onCSharpLog: (callback) => ipcRenderer.on('csharp-log', (_event, value) => callback(value)),
    onCSharpError: (callback) => ipcRenderer.on('csharp-error', (_event, value) => callback(value)),
    signalRendererReady: () => ipcRenderer.send('renderer-ready'),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', { key, value }),
    executePluginCommand: (pluginId, command, payload) => ipcRenderer.invoke('execute-plugin-command', pluginId, command, payload),
    onCleanerProgressUpdate: (callback) => ipcRenderer.on('cleaner-progress-update', (_event, value) => callback(value)),
    getApprovedPlugins: () => ipcRenderer.invoke('get-approved-plugins'),
    setApprovedPlugins: (guids) => ipcRenderer.invoke('set-approved-plugins', guids),
    resolvePath: (filePath) => ipcRenderer.invoke('resolve-path', filePath),
});
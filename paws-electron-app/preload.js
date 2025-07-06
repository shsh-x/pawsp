const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, limited API to the renderer process.
contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    resizeWindow: (isCompact) => ipcRenderer.send('resize-window', isCompact),
    restartApp: () => ipcRenderer.invoke('restart-app'),

    // Backend communication (generic GET/POST)
    get: (endpoint) => ipcRenderer.invoke('api-get', endpoint),
    post: (endpoint, body) => ipcRenderer.invoke('api-post', { endpoint, body }),
    
    // Renderer lifecycle
    signalRendererReady: () => ipcRenderer.send('renderer-ready'),
    onCSharpLog: (callback) => ipcRenderer.on('csharp-log', (_event, value) => callback(value)),

    // System and file dialogs
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

    // Persistent storage (electron-store)
    getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', { key, value }),

    // Plugin Iframe communication
    onMessageFromPlugin: (callback) => ipcRenderer.on('message-from-plugin', (_event, value) => callback(value)),
    sendMessageToPlugin: (message) => ipcRenderer.send('message-to-plugin', message),
});
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    resizeWindow: (isCompact) => ipcRenderer.send('resize-window', isCompact),

    // Backend communication
    getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
    onCSharpLog: (callback) => ipcRenderer.on('csharp-log', (_event, value) => callback(value)),
    onCSharpError: (callback) => ipcRenderer.on('csharp-error', (_event, value) => callback(value)),
    signalRendererReady: () => ipcRenderer.send('renderer-ready'),

    // System and file dialogs
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    resolvePath: (filePath) => ipcRenderer.invoke('resolve-path', filePath),

    // Persistent storage (electron-store)
    getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', { key, value }),

    // Plugin management and execution
    executePluginCommand: (pluginId, command, payload) => ipcRenderer.invoke('execute-plugin-command', pluginId, command, payload),
    getApprovedPlugins: () => ipcRenderer.invoke('get-approved-plugins'),
    setApprovedPlugins: (guids) => ipcRenderer.invoke('set-approved-plugins', guids),
    onCleanerProgressUpdate: (callback) => ipcRenderer.on('cleaner-progress-update', (_event, value) => callback(value)),

    // Database path configuration
    setLazerPath: (path) => ipcRenderer.invoke('set-lazer-path', path),
    setStablePath: (path) => ipcRenderer.invoke('set-stable-path', path),

    // --- TEST FUNCTIONS ---
    // These can be removed later if desired, but are useful for debugging.
    testLazerConnection: () => ipcRenderer.invoke('test-lazer-connection'),
    testLazerWrite: () => ipcRenderer.invoke('test-lazer-write'),
});
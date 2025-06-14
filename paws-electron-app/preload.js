const { contextBridge, ipcRenderer } = require('electron');

// This script safely exposes specific IPC functions to the renderer process (both the main one and the webview).
// It acts as a secure bridge and does not contain any complex logic or Node.js module imports.
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Window Controls ---
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),

    // --- API and Logging ---
    getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
    onCSharpLog: (callback) => ipcRenderer.on('csharp-log', (_event, value) => callback(value)),
    onCSharpError: (callback) => ipcRenderer.on('csharp-error', (_event, value) => callback(value)),
    
    // --- App Lifecycle ---
    signalRendererReady: () => ipcRenderer.send('renderer-ready'),
    
    // --- Dialogs and Storage (Proxied through main process) ---
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    getStoreValue: (key) => ipcRenderer.invoke('get-store-value', key),
    setStoreValue: (key, value) => ipcRenderer.invoke('set-store-value', key, value),
    
    // --- Plugin Commands ---
    executePluginCommand: (pluginId, command, payload) => ipcRenderer.invoke('execute-plugin-command', pluginId, command, payload),
    onCleanerProgressUpdate: (callback) => ipcRenderer.on('cleaner-progress-update', (_event, value) => callback(value)),
    
    // --- Plugin Management ---
    getApprovedPlugins: () => ipcRenderer.invoke('get-approved-plugins'),
    setApprovedPlugins: (guids) => ipcRenderer.invoke('set-approved-plugins', guids),

    // --- Path Resolving ---
    resolvePath: (filePath) => ipcRenderer.invoke('resolve-path', filePath),

    // --- Webview Communication Bridge ---
    // From Webview -> Host Renderer
    postToHost: (message) => ipcRenderer.send('webview-message', message),
    // From Host Renderer -> Webview
    onHostResponse: (callback) => ipcRenderer.on('host-response', (event, message) => callback(message)),
});
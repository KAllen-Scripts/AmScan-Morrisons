const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    clearConfig: () => ipcRenderer.invoke('clear-config'),
    
    // File operations
    writeFile: (filePath, content, options) => ipcRenderer.invoke('write-file', filePath, content, options),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    
    // Credentials management
    saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),
    loadCredentials: () => ipcRenderer.invoke('load-credentials'),
    clearCredentials: () => ipcRenderer.invoke('clear-credentials'),
    
    // Window focus management (for fixing Electron focus issues)
    focusWindow: () => ipcRenderer.invoke('focus-window'),
    
    // Optional: Add more utility functions
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options)
});
const { ipcMain, dialog, app, BrowserWindow } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const EncryptionUtils = require('./encryption-utils');

let store;
let encryptionUtils;

// Initialize the store with dynamic import
async function initializeStore() {
    if (!store) {
        const { default: Store } = await import('electron-store');
        
        store = new Store({
            name: 'sync-tool-config',
            // Note: We're handling encryption manually now for better control
        });
        
        // Initialize encryption utilities
        encryptionUtils = new EncryptionUtils();
    }
    return store;
}

// Set up IPC handlers for the renderer process
async function setupIPCHandlers() {
    // Ensure store is initialized
    await initializeStore();
    
    // Save configuration
    ipcMain.handle('save-config', async (event, config) => {
        try {
            if (!store) await initializeStore();
            
            store.set('formConfig', config);
            store.set('lastSaved', new Date().toISOString());
            return { success: true };
        } catch (error) {
            console.error('Error saving configuration:', error);
            throw error;
        }
    });

    // Load configuration
    ipcMain.handle('load-config', async (event) => {
        try {
            if (!store) await initializeStore();
            
            const config = store.get('formConfig', {});
            return config;
        } catch (error) {
            console.error('Error loading configuration:', error);
            throw error;
        }
    });

    // Clear configuration
    ipcMain.handle('clear-config', async (event) => {
        try {
            if (!store) await initializeStore();
            
            store.delete('formConfig');
            store.delete('lastSaved');
            return { success: true };
        } catch (error) {
            console.error('Error clearing configuration:', error);
            throw error;
        }
    });

    // Write file
    ipcMain.handle('write-file', async (event, filePath, content, options = {}) => {
        try {
            // Resolve path relative to app directory
            const fullPath = path.resolve(app.getPath('userData'), filePath);
            
            // Ensure directory exists
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            
            // Write file
            if (options.flag === 'a') {
                // Append mode
                await fs.appendFile(fullPath, content, 'utf8');
            } else {
                // Write mode (default)
                await fs.writeFile(fullPath, content, 'utf8');
            }
            
            return { success: true, path: fullPath };
        } catch (error) {
            console.error('Error writing file:', error);
            throw error;
        }
    });

    // Read file
    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const fullPath = path.resolve(app.getPath('userData'), filePath);
            const content = await fs.readFile(fullPath, 'utf8');
            return { success: true, content };
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    });

    // Get app version
    ipcMain.handle('get-app-version', async (event) => {
        return app.getVersion();
    });

    // Show message box
    ipcMain.handle('show-message-box', async (event, options) => {
        const result = await dialog.showMessageBox(options);
        return result;
    });

    // Save encrypted credentials
    ipcMain.handle('save-credentials', async (event, credentialsType, credentials) => {
        try {
            if (!store) await initializeStore();
            
            const storageKey = credentialsType;
            
            // Encrypt the credentials using AES-256-GCM
            const encryptedCredentials = encryptionUtils.encryptCredentials(credentials);
            
            // Store the encrypted data
            store.set(storageKey, encryptedCredentials);
            
            return { success: true };
        } catch (error) {
            console.error('Error saving credentials:', error);
            throw error;
        }
    });

    // Load encrypted credentials
    ipcMain.handle('load-credentials', async (event, credentialsType) => {
        try {
            if (!store) await initializeStore();
            
            const storageKey = credentialsType;
            
            const encryptedCredentials = store.get(storageKey);
            if (!encryptedCredentials) {
                return null;
            }
            
            // Decrypt the credentials
            const decryptedCredentials = encryptionUtils.decryptCredentials(encryptedCredentials);
            
            return decryptedCredentials;
        } catch (error) {
            console.error('Error loading credentials:', error);
            // If decryption fails, the data might be corrupted or tampered with
            throw new Error('Failed to decrypt credentials - data may be corrupted');
        }
    });

    // Clear encrypted credentials
    ipcMain.handle('clear-credentials', async (event, credentialsType) => {
        try {
            if (!store) await initializeStore();
            
            const storageKey = credentialsType;
            
            store.delete(storageKey);
            
            return { success: true };
        } catch (error) {
            console.error('Error clearing credentials:', error);
            throw error;
        }
    });

    // Force window focus
    ipcMain.handle('focus-window', async (event) => {
        try {
            // Try to get window from the event sender
            let win = BrowserWindow.fromWebContents(event.sender);
            
            // Fallback to global reference if available
            if (!win && global.mainWindow) {
                win = global.mainWindow;
            }
            
            // Final fallback to first available window
            if (!win) {
                const windows = BrowserWindow.getAllWindows();
                if (windows.length > 0) {
                    win = windows[0];
                }
            }
            
            if (win) {
                // Check if window is minimized and restore if needed
                if (win.isMinimized()) {
                    win.restore();
                }
                
                // Only use gentle focus methods that don't affect window positioning
                if (process.platform === 'win32') {
                    win.focusOnWebView();
                    
                    if (!win.isFocused()) {
                        win.focus();
                    }
                } else if (process.platform === 'darwin') {
                    app.focus({ steal: true });
                    win.focus();
                } else {
                    win.focus();
                }
                
                // Ensure the window is visible without changing its position/size
                if (!win.isVisible()) {
                    win.show();
                }
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error focusing window:', error);
            return { success: false, error: error.message };
        }
    });
}

// Alternative: Get store instance (for other uses in main process)
async function getStore() {
    if (!store) {
        await initializeStore();
    }
    return store;
}

// Export functions for use in main.js
module.exports = {
    setupIPCHandlers,
    getStore
};
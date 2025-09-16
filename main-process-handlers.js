const { ipcMain, dialog, app, BrowserWindow } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const EncryptionUtils = require('./encryption-utils');

let store;
let encryptionUtils;
let sftpClient; // Load SFTP client once at startup

// Initialize the store and required modules with dynamic import
async function initializeStore() {
    if (!store) {
        const { default: Store } = await import('electron-store');
        
        store = new Store({
            name: 'sync-tool-config',
            // Note: We're handling encryption manually now for better control
        });
        
        // Initialize encryption utilities
        encryptionUtils = new EncryptionUtils();
        
        // Initialize SFTP client once at startup
        try {
            sftpClient = require('ssh2-sftp-client');
            console.log('SFTP client loaded successfully');
        } catch (error) {
            console.warn('SFTP client not available:', error.message);
            sftpClient = null;
        }
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

    // CSV parsing handler
    ipcMain.handle('parse-csv', async (event, csvText) => {
        try {
            const Papa = require('papaparse');
            
            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    delimitersToGuess: [',', '\t', '|', ';'],
                    complete: (results) => {
                        if (results.errors && results.errors.length > 0) {
                            console.warn('CSV parsing warnings:', results.errors);
                        }
                        
                        // Clean headers (strip whitespace)
                        const cleanedData = results.data.map(row => {
                            const cleanedRow = {};
                            Object.keys(row).forEach(key => {
                                const cleanKey = key.trim();
                                cleanedRow[cleanKey] = row[key];
                            });
                            return cleanedRow;
                        });
                        
                        resolve(cleanedData);
                    },
                    error: (error) => {
                        reject(new Error(`CSV parsing error: ${error.message}`));
                    }
                });
            });
        } catch (error) {
            console.error('Error in CSV parsing handler:', error);
            throw error;
        }
    });

    // File transmission handler using pre-loaded SFTP client
    ipcMain.handle('transmit-file', async (event, filename, content, ftpCredentials) => {
        // Check if SFTP client is available
        if (!sftpClient) {
            throw new Error('SFTP client not available. Please install ssh2-sftp-client: npm install ssh2-sftp-client');
        }

        // Create new SFTP instance
        const sftp = new sftpClient();
        
        console.log(`📤 SFTP: Connecting to ${ftpCredentials.host}:${ftpCredentials.port}`);
        
        // Connect to SFTP server - let this crash if it fails
        await sftp.connect({
            host: ftpCredentials.host,
            port: ftpCredentials.port || 22,
            username: ftpCredentials.username,
            password: ftpCredentials.password,
            algorithms: {
                serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'],
                cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
                hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
                compress: ['none', 'zlib@openssh.com', 'zlib']
            },
            readyTimeout: 30000,
            strictVendor: false
        });
        
        console.log(`📤 SFTP: Connected successfully`);
        
        // Determine target directory and remote path
        const targetDirectory = ftpCredentials.directory || '/';
        const remotePath = targetDirectory.endsWith('/') ? 
            `${targetDirectory}${filename}` : 
            `${targetDirectory}/${filename}`;
        
        console.log(`📤 SFTP: Uploading to ${remotePath}`);
        console.log(`📤 SFTP: File size: ${content.length} bytes`);
        
        // Create directory if needed - let minor errors slide
        await sftp.mkdir(targetDirectory, true).catch(() => {
            // Directory might already exist, which is fine
            console.log(`📤 SFTP: Directory creation skipped (may already exist)`);
        });
        
        // Upload the file - let this crash if it fails
        await sftp.put(Buffer.from(content, 'utf8'), remotePath);
        
        // Verify upload by checking file exists and size - let this crash if it fails
        const fileStats = await sftp.stat(remotePath);
        const uploadedSize = fileStats.size;
        
        if (uploadedSize !== content.length) {
            throw new Error(`Upload verification failed: expected ${content.length} bytes, got ${uploadedSize} bytes`);
        }
        
        await sftp.end();
        
        console.log(`✅ SFTP: Successfully uploaded ${filename}`);
        
        return {
            success: true,
            filename: filename,
            remotePath: remotePath,
            size: content.length,
            uploadedSize: uploadedSize,
            host: ftpCredentials.host,
            directory: targetDirectory,
            protocol: 'SFTP',
            timestamp: new Date().toISOString()
        };
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
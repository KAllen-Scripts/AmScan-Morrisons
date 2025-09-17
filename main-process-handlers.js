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

// NEW: Invoice tracking functionality
async function setupInvoiceTracking() {
    if (!store) await initializeStore();
    
    // Initialize processed invoices set if it doesn't exist
    if (!store.has('processedInvoices')) {
        store.set('processedInvoices', {
            invoiceIds: [],
            lastCleanup: new Date().toISOString(),
            version: '1.0'
        });
        console.log('📋 Initialized invoice tracking system');
    }
    
    // Run cleanup on startup (remove old entries if needed)
    await cleanupOldProcessedInvoices();
}

// NEW: Get processed invoice IDs
async function getProcessedInvoiceIds() {
    if (!store) await initializeStore();
    
    const processedData = store.get('processedInvoices', {
        invoiceIds: [],
        lastCleanup: new Date().toISOString(),
        version: '1.0'
    });
    
    return new Set(processedData.invoiceIds);
}

// NEW: Mark invoice as processed
async function markInvoiceAsProcessed(saleInvoiceId) {
    if (!store) await initializeStore();
    
    const processedData = store.get('processedInvoices', {
        invoiceIds: [],
        lastCleanup: new Date().toISOString(),
        version: '1.0'
    });
    
    // Add to set (avoid duplicates)
    const invoiceSet = new Set(processedData.invoiceIds);
    const wasAlreadyProcessed = invoiceSet.has(saleInvoiceId);
    invoiceSet.add(saleInvoiceId);
    
    // Convert back to array and save
    processedData.invoiceIds = Array.from(invoiceSet);
    processedData.lastUpdated = new Date().toISOString();
    
    store.set('processedInvoices', processedData);
    
    console.log(`📋 Marked invoice ${saleInvoiceId} as processed (${invoiceSet.size} total)`);
    
    return !wasAlreadyProcessed; // Return true if this was a new addition
}

// NEW: Check if invoice has been processed
async function isInvoiceProcessed(saleInvoiceId) {
    const processedIds = await getProcessedInvoiceIds();
    return processedIds.has(saleInvoiceId);
}

// NEW: Get invoice processing statistics
async function getInvoiceProcessingStats() {
    if (!store) await initializeStore();
    
    const processedData = store.get('processedInvoices', {
        invoiceIds: [],
        lastCleanup: new Date().toISOString(),
        version: '1.0'
    });
    
    return {
        totalProcessed: processedData.invoiceIds.length,
        lastUpdated: processedData.lastUpdated || 'Never',
        lastCleanup: processedData.lastCleanup || 'Never',
        version: processedData.version || '1.0',
        storageLocation: store.path,
        firstProcessedId: processedData.invoiceIds.length > 0 ? processedData.invoiceIds[0] : null,
        lastProcessedId: processedData.invoiceIds.length > 0 ? processedData.invoiceIds[processedData.invoiceIds.length - 1] : null
    };
}

// NEW: Clear processed invoice history (for debugging)
async function clearProcessedInvoiceHistory(keepRecent = 0) {
    if (!store) await initializeStore();
    
    const processedData = store.get('processedInvoices', {
        invoiceIds: [],
        lastCleanup: new Date().toISOString(),
        version: '1.0'
    });
    
    const originalCount = processedData.invoiceIds.length;
    
    if (keepRecent > 0 && processedData.invoiceIds.length > keepRecent) {
        // Keep only the most recent N entries
        processedData.invoiceIds = processedData.invoiceIds.slice(-keepRecent);
    } else {
        // Clear all
        processedData.invoiceIds = [];
    }
    
    processedData.lastCleanup = new Date().toISOString();
    processedData.lastUpdated = new Date().toISOString();
    
    store.set('processedInvoices', processedData);
    
    const clearedCount = originalCount - processedData.invoiceIds.length;
    console.log(`📋 Cleared ${clearedCount} processed invoice records (kept ${processedData.invoiceIds.length})`);
    
    return {
        cleared: clearedCount,
        remaining: processedData.invoiceIds.length,
        originalCount: originalCount
    };
}

// NEW: Cleanup old processed invoices (run periodically)
async function cleanupOldProcessedInvoices(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days default
    if (!store) await initializeStore();
    
    const processedData = store.get('processedInvoices', {
        invoiceIds: [],
        lastCleanup: new Date().toISOString(),
        version: '1.0'
    });
    
    const lastCleanup = new Date(processedData.lastCleanup || '1970-01-01');
    const now = new Date();
    const timeSinceCleanup = now.getTime() - lastCleanup.getTime();
    
    // Only run cleanup once per day
    if (timeSinceCleanup < 24 * 60 * 60 * 1000) {
        return { skipped: true, reason: 'Recently cleaned' };
    }
    
    const originalCount = processedData.invoiceIds.length;
    
    // For now, just update the cleanup timestamp - we keep all records
    // In the future, you could implement logic to remove very old entries
    // based on timestamps if you start storing processing dates
    
    processedData.lastCleanup = now.toISOString();
    store.set('processedInvoices', processedData);
    
    console.log(`📋 Ran invoice cleanup check (${originalCount} records maintained)`);
    
    return {
        skipped: false,
        maintained: originalCount,
        lastCleanup: now.toISOString()
    };
}

// NEW: Export processed invoice list (for debugging)
async function exportProcessedInvoiceList() {
    const stats = await getInvoiceProcessingStats();
    const processedIds = await getProcessedInvoiceIds();
    
    const exportData = {
        meta: stats,
        processedInvoiceIds: Array.from(processedIds).sort(),
        exportedAt: new Date().toISOString()
    };
    
    return exportData;
}

// Set up IPC handlers for the renderer process
async function setupIPCHandlers() {
    // Ensure store is initialized
    await initializeStore();
    
    // Initialize invoice tracking
    await setupInvoiceTracking();
    
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

    // NEW: Invoice tracking IPC handlers
    ipcMain.handle('get-processed-invoices', async (event) => {
        try {
            const processedIds = await getProcessedInvoiceIds();
            return Array.from(processedIds);
        } catch (error) {
            console.error('Error getting processed invoices:', error);
            throw error;
        }
    });

    ipcMain.handle('is-invoice-processed', async (event, saleInvoiceId) => {
        try {
            return await isInvoiceProcessed(saleInvoiceId);
        } catch (error) {
            console.error('Error checking if invoice is processed:', error);
            throw error;
        }
    });

    ipcMain.handle('mark-invoice-processed', async (event, saleInvoiceId) => {
        try {
            return await markInvoiceAsProcessed(saleInvoiceId);
        } catch (error) {
            console.error('Error marking invoice as processed:', error);
            throw error;
        }
    });

    ipcMain.handle('get-invoice-stats', async (event) => {
        try {
            return await getInvoiceProcessingStats();
        } catch (error) {
            console.error('Error getting invoice stats:', error);
            throw error;
        }
    });

    ipcMain.handle('clear-processed-invoices', async (event, keepRecent = 0) => {
        try {
            return await clearProcessedInvoiceHistory(keepRecent);
        } catch (error) {
            console.error('Error clearing processed invoices:', error);
            throw error;
        }
    });

    ipcMain.handle('export-processed-invoices', async (event) => {
        try {
            return await exportProcessedInvoiceList();
        } catch (error) {
            console.error('Error exporting processed invoices:', error);
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
        
        console.log(`🔤 SFTP: Connecting to ${ftpCredentials.host}:${ftpCredentials.port}`);
        
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
        
        console.log(`🔤 SFTP: Connected successfully`);
        
        // Determine target directory and remote path
        const targetDirectory = ftpCredentials.directory || '/';
        const remotePath = targetDirectory.endsWith('/') ? 
            `${targetDirectory}${filename}` : 
            `${targetDirectory}/${filename}`;
        
        console.log(`🔤 SFTP: Uploading to ${remotePath}`);
        console.log(`🔤 SFTP: File size: ${content.length} bytes`);
        
        // Create directory if needed - let minor errors slide
        await sftp.mkdir(targetDirectory, true).catch(() => {
            // Directory might already exist, which is fine
            console.log(`🔤 SFTP: Directory creation skipped (may already exist)`);
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

// NEW: Get storage path for debugging
function getStoragePath() {
    if (!store) {
        return null;
    }
    return store.path;
}

// Export functions for use in main.js
module.exports = {
    setupIPCHandlers,
    getStore,
    getStoragePath,
    // Export invoice tracking functions for direct use in main process if needed
    getProcessedInvoiceIds,
    markInvoiceAsProcessed,
    isInvoiceProcessed,
    getInvoiceProcessingStats,
    clearProcessedInvoiceHistory
};
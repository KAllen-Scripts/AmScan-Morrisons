// Enhanced Credentials Handler for Sync Tool
// Manages both API and FTP credentials with unique storage keys to avoid conflicts

class SecureCredentialsManager {
    constructor() {
        this.credentials = new Map();
        this.accessLog = new Map();
        this.isLocked = false;
        
        // Bind cleanup to process events only
        this.bindCleanupEvents();
    }

    /**
     * Store credentials permanently (no expiration)
     */
    store(key, value, options = {}) {
        if (this.isLocked) {
            throw new Error('Credentials manager is locked');
        }

        // Create secure wrapper for the credential (no expiration)
        const secureValue = {
            data: value,
            created: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            sensitive: options.sensitive !== false // Default to sensitive
        };

        this.credentials.set(key, secureValue);
        this.accessLog.set(key, []);
    }

    /**
     * Retrieve credentials with access logging (no expiration check)
     */
    get(key) {
        if (this.isLocked) {
            throw new Error('Credentials manager is locked');
        }

        const wrapper = this.credentials.get(key);
        if (!wrapper) {
            return null;
        }

        // Update access tracking
        wrapper.lastAccessed = Date.now();
        wrapper.accessCount++;
        
        // Log access (keep last 10 accesses)
        const log = this.accessLog.get(key) || [];
        log.push({ timestamp: Date.now(), action: 'access' });
        if (log.length > 10) {
            log.shift();
        }
        this.accessLog.set(key, log);

        return wrapper.data;
    }

    /**
     * Check if credentials exist (always valid if they exist)
     */
    has(key) {
        return this.credentials.has(key);
    }

    /**
     * Securely remove a specific credential
     */
    remove(key) {
        const wrapper = this.credentials.get(key);
        if (!wrapper) return false;

        // Overwrite sensitive data before deletion
        if (wrapper.sensitive && typeof wrapper.data === 'object') {
            this.overwriteObject(wrapper.data);
        } else if (wrapper.sensitive && typeof wrapper.data === 'string') {
            wrapper.data = this.generateOverwriteString(wrapper.data.length);
        }

        this.credentials.delete(key);
        this.accessLog.delete(key);
        
        return true;
    }

    /**
     * Get credential status without exposing data (no expiration info)
     */
    getStatus(key) {
        const wrapper = this.credentials.get(key);
        if (!wrapper) {
            return { exists: false };
        }

        const now = Date.now();
        const age = now - wrapper.created;
        const timeSinceAccess = now - wrapper.lastAccessed;

        return {
            exists: true,
            age: age,
            lastAccessed: timeSinceAccess,
            accessCount: wrapper.accessCount,
            isExpired: false, // Never expires
            isIdle: false, // Never considered idle
            expiresIn: null // Never expires
        };
    }

    /**
     * Lock the credentials manager (emergency security measure)
     */
    lock(reason = 'Manual lock') {
        this.isLocked = true;
        this.clearAll(true);
    }

    /**
     * Unlock the credentials manager
     */
    unlock(reason = 'Manual unlock') {
        this.isLocked = false;
    }

    /**
     * Clear all credentials securely
     */
    clearAll(force = false) {
        if (this.isLocked && !force) {
            throw new Error('Cannot clear credentials: manager is locked');
        }
        
        // Securely overwrite all credential data
        for (const [key, wrapper] of this.credentials) {
            if (wrapper.sensitive && typeof wrapper.data === 'object') {
                this.overwriteObject(wrapper.data);
            } else if (wrapper.sensitive && typeof wrapper.data === 'string') {
                wrapper.data = this.generateOverwriteString(wrapper.data.length);
            }
        }

        this.credentials.clear();
        this.accessLog.clear();
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
    }

    /**
     * Securely overwrite object properties
     */
    overwriteObject(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'string') {
                    obj[key] = this.generateOverwriteString(obj[key].length);
                } else if (typeof obj[key] === 'object') {
                    this.overwriteObject(obj[key]);
                } else {
                    obj[key] = null;
                }
            }
        }
    }

    /**
     * Generate random string to overwrite sensitive data
     */
    generateOverwriteString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Bind cleanup to process events
     */
    bindCleanupEvents() {
        // Clean up on process exit
        const cleanup = () => {
            this.clearAll(true);
        };

        if (typeof process !== 'undefined') {
            process.on('exit', cleanup);
            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
            process.on('uncaughtException', (err) => {
                cleanup();
            });
        }

        // Handle window/app events in browser/Electron renderer
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', cleanup);
        }
    }

    /**
     * Get statistics about credential usage
     */
    getStatistics() {
        const stats = {
            totalCredentials: this.credentials.size,
            locked: this.isLocked,
            credentials: {}
        };

        for (const [key, wrapper] of this.credentials) {
            const now = Date.now();
            stats.credentials[key] = {
                age: now - wrapper.created,
                lastAccessed: now - wrapper.lastAccessed,
                accessCount: wrapper.accessCount,
                sensitive: wrapper.sensitive
            };
        }

        return stats;
    }

    /**
     * Cleanup and destroy the credentials manager
     */
    destroy() {
        this.clearAll(true);
    }
}

class CredentialsHandler {
    constructor() {
        // API Credentials elements
        this.credentialsBtn = document.getElementById('credentialsBtn');
        this.credentialsModal = document.getElementById('credentialsModal');
        this.closeModal = document.getElementById('closeModal');
        this.credentialsForm = document.getElementById('credentialsForm');
        this.saveCredentials = document.getElementById('saveCredentials');
        this.clearCredentials = document.getElementById('clearCredentials');
        this.showPassword = document.getElementById('showPassword');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        // FTP Credentials elements
        this.ftpCredentialsBtn = document.getElementById('ftpCredentialsBtn');
        this.ftpCredentialsModal = document.getElementById('ftpCredentialsModal');
        this.closeFtpModal = document.getElementById('closeFtpModal');
        this.ftpCredentialsForm = document.getElementById('ftpCredentialsForm');
        this.saveFtpCredentials = document.getElementById('saveFtpCredentials');
        this.clearFtpCredentials = document.getElementById('clearFtpCredentials');
        this.showFtpPassword = document.getElementById('showFtpPassword');
        this.ftpStatusIndicator = document.getElementById('ftpStatusIndicator');
        this.ftpStatusText = document.getElementById('ftpStatusText');
        
        // Initialize secure credentials manager (no expiration)
        this.secureManager = new SecureCredentialsManager();
        this.failureCount = 0;
        
        // Create secure proxy for global credentials access
        window.appCredentials = new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'isLoaded') {
                    return this.secureManager.has('syncTool_apiCredentials');
                }
                
                const creds = this.secureManager.get('syncTool_apiCredentials');
                return creds ? creds[prop] : null;
            },
            
            set: (target, prop, value) => {
                return false;
            }
        });
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadCredentialsOnStartup();
    }

    setupEventListeners() {
        // API Credentials Modal
        this.credentialsBtn.addEventListener('click', () => this.openApiModal());
        this.closeModal.addEventListener('click', () => this.closeApiModalHandler());
        this.credentialsModal.addEventListener('click', (e) => {
            if (e.target === this.credentialsModal) {
                this.closeApiModalHandler();
            }
        });
        
        // FTP Credentials Modal
        this.ftpCredentialsBtn.addEventListener('click', () => this.openFtpModal());
        this.closeFtpModal.addEventListener('click', () => this.closeFtpModalHandler());
        this.ftpCredentialsModal.addEventListener('click', (e) => {
            if (e.target === this.ftpCredentialsModal) {
                this.closeFtpModalHandler();
            }
        });
        
        // Handle Escape key for both modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.credentialsModal.classList.contains('show')) {
                    this.closeApiModalHandler();
                }
                if (this.ftpCredentialsModal.classList.contains('show')) {
                    this.closeFtpModalHandler();
                }
            }
        });
        
        // API Credentials form handlers
        this.saveCredentials.addEventListener('click', () => this.handleSaveApiCredentials());
        this.clearCredentials.addEventListener('click', () => this.handleClearApiCredentials());
        this.showPassword.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('password');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        this.credentialsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveApiCredentials();
        });
        
        // FTP Credentials form handlers
        this.saveFtpCredentials.addEventListener('click', () => this.handleSaveFtpCredentials());
        this.clearFtpCredentials.addEventListener('click', () => this.handleClearFtpCredentials());
        this.showFtpPassword.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('ftpPassword');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        this.ftpCredentialsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveFtpCredentials();
        });
    }

    async openApiModal() {
        if (this.secureManager.isLocked) {
            this.showNotification('Credentials are locked. Please restart the application.', 'error');
            return;
        }

        this.credentialsModal.classList.add('show');
        
        if (window.electronAPI && window.electronAPI.focusWindow) {
            await window.electronAPI.focusWindow();
        }
        
        setTimeout(() => {
            this.recreateApiInputs();
        }, 50);
        
        this.loadApiCredentialsToForm().catch(error => {
            console.error('Error loading API credentials to form:', error);
        });
    }

    async openFtpModal() {
        if (this.secureManager.isLocked) {
            this.showNotification('Credentials are locked. Please restart the application.', 'error');
            return;
        }

        this.ftpCredentialsModal.classList.add('show');
        
        if (window.electronAPI && window.electronAPI.focusWindow) {
            await window.electronAPI.focusWindow();
        }
        
        setTimeout(() => {
            this.recreateFtpInputs();
        }, 50);
        
        this.loadFtpCredentialsToForm().catch(error => {
            console.error('Error loading FTP credentials to form:', error);
        });
    }

    recreateApiInputs() {
        const usernameValue = document.getElementById('username').value;
        const passwordValue = document.getElementById('password').value;
        const accountKeyValue = document.getElementById('accountKey').value;
        const showPasswordChecked = document.getElementById('showPassword').checked;
        
        this.recreateInput('username', usernameValue);
        this.recreateInput('password', passwordValue, showPasswordChecked ? 'text' : 'password');
        this.recreateInput('accountKey', accountKeyValue);
        
        const showPasswordCheckbox = document.getElementById('showPassword');
        showPasswordCheckbox.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('password');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        
        this.addInputHandlers('username');
        this.addInputHandlers('password');
        this.addInputHandlers('accountKey');
        
        setTimeout(() => {
            document.getElementById('username').focus();
        }, 10);
    }

    recreateFtpInputs() {
        const hostValue = document.getElementById('ftpHost').value;
        const portValue = document.getElementById('ftpPort').value;
        const usernameValue = document.getElementById('ftpUsername').value;
        const passwordValue = document.getElementById('ftpPassword').value;
        const directoryValue = document.getElementById('ftpDirectory').value;
        const secureChecked = document.getElementById('ftpSecure').checked;
        const showPasswordChecked = document.getElementById('showFtpPassword').checked;
        
        this.recreateInput('ftpHost', hostValue);
        this.recreateInput('ftpPort', portValue);
        this.recreateInput('ftpUsername', usernameValue);
        this.recreateInput('ftpPassword', passwordValue, showPasswordChecked ? 'text' : 'password');
        this.recreateInput('ftpDirectory', directoryValue);
        
        document.getElementById('ftpSecure').checked = secureChecked;
        
        const showPasswordCheckbox = document.getElementById('showFtpPassword');
        showPasswordCheckbox.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('ftpPassword');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        
        this.addInputHandlers('ftpHost');
        this.addInputHandlers('ftpPort');
        this.addInputHandlers('ftpUsername');
        this.addInputHandlers('ftpPassword');
        this.addInputHandlers('ftpDirectory');
        
        setTimeout(() => {
            document.getElementById('ftpHost').focus();
        }, 10);
    }

    recreateInput(inputId, value, type = null) {
        const oldInput = document.getElementById(inputId);
        const newInput = oldInput.cloneNode(true);
        newInput.value = value;
        if (type) newInput.type = type;
        oldInput.parentNode.replaceChild(newInput, oldInput);
    }

    addInputHandlers(inputId) {
        const input = document.getElementById(inputId);
        
        input.addEventListener('keydown', (e) => {
            if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                const newValue = currentValue.substring(0, start) + e.key + currentValue.substring(end);
                input.value = newValue;
                
                input.setSelectionRange(start + 1, start + 1);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            else if (e.key === 'Backspace') {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                if (start === end && start > 0) {
                    const newValue = currentValue.substring(0, start - 1) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start - 1, start - 1);
                } else if (start !== end) {
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                }
                
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            else if (e.key === 'Delete') {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                if (start === end && start < currentValue.length) {
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end + 1);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                } else if (start !== end) {
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                }
                
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }

    closeApiModalHandler() {
        this.credentialsModal.classList.remove('show');
        this.credentialsForm.reset();
        document.getElementById('password').type = 'password';
        document.getElementById('showPassword').checked = false;
    }

    closeFtpModalHandler() {
        this.ftpCredentialsModal.classList.remove('show');
        this.ftpCredentialsForm.reset();
        document.getElementById('ftpPassword').type = 'password';
        document.getElementById('showFtpPassword').checked = false;
    }

    async loadApiCredentialsToForm() {
        try {
            const credentials = await this.getDecryptedCredentials('syncTool_apiCredentials');
            
            if (credentials) {
                if (credentials.clientId) {
                    document.getElementById('username').value = credentials.clientId;
                    document.getElementById('password').value = credentials.secretKey || '';
                    document.getElementById('accountKey').value = credentials.accountKey || '';
                } else if (credentials.username) {
                    document.getElementById('username').value = credentials.username;
                    document.getElementById('password').value = credentials.password || '';
                    document.getElementById('accountKey').value = '';
                }
            }
        } catch (error) {
            console.error('Error loading API credentials to form:', error);
        }
    }

    async loadFtpCredentialsToForm() {
        try {
            const credentials = await this.getDecryptedCredentials('syncTool_ftpCredentials');
            
            if (credentials) {
                document.getElementById('ftpHost').value = credentials.host || '';
                document.getElementById('ftpPort').value = credentials.port || '22';
                document.getElementById('ftpUsername').value = credentials.username || '';
                document.getElementById('ftpPassword').value = credentials.password || '';
                document.getElementById('ftpDirectory').value = credentials.directory || '';
                document.getElementById('ftpSecure').checked = credentials.secure || false;
            }
        } catch (error) {
            console.error('Error loading FTP credentials to form:', error);
        }
    }

    async handleSaveApiCredentials() {
        const clientId = document.getElementById('username').value.trim();
        const secretKey = document.getElementById('password').value;
        const accountKey = document.getElementById('accountKey').value.trim();

        if (!this.validateApiCredentialFormat(clientId, secretKey, accountKey)) {
            return;
        }

        try {
            await this.saveEncryptedCredentials('syncTool_apiCredentials', clientId, secretKey, accountKey);
            
            this.secureManager.store('syncTool_apiCredentials', {
                clientId: clientId,
                secretKey: secretKey,
                accountKey: accountKey
            }, {
                sensitive: true
            });
            
            this.updateApiCredentialsStatus(true);
            this.closeApiModalHandler();
            this.showNotification('API credentials saved permanently!', 'success');
            this.failureCount = 0;
            
        } catch (error) {
            console.error('Error saving API credentials:', error);
            this.showNotification('Error saving API credentials', 'error');
            this.failureCount++;
        }
    }

    async handleSaveFtpCredentials() {
        const host = document.getElementById('ftpHost').value.trim();
        const port = document.getElementById('ftpPort').value.trim() || '22';
        const username = document.getElementById('ftpUsername').value.trim();
        const password = document.getElementById('ftpPassword').value;
        const directory = document.getElementById('ftpDirectory').value.trim();
        const secure = document.getElementById('ftpSecure').checked;

        if (!this.validateFtpCredentialFormat(host, port, username, password)) {
            return;
        }

        try {
            await this.saveEncryptedCredentials('syncTool_ftpCredentials', host, port, username, password, directory, secure);
            
            const credentialData = {
                host: host,
                port: parseInt(port),
                username: username,
                password: password,
                directory: directory,
                secure: secure
            };
            
            this.secureManager.store('syncTool_ftpCredentials', credentialData, {
                sensitive: true
            });
            
            this.updateFtpCredentialsStatus(true);
            this.closeFtpModalHandler();
            this.showNotification('FTP credentials saved permanently!', 'success');
            
        } catch (error) {
            console.error('Error saving FTP credentials:', error);
            this.showNotification('Error saving FTP credentials', 'error');
        }
    }

    validateApiCredentialFormat(clientId, secretKey, accountKey) {
        const errors = [];
        
        if (!clientId || clientId.length < 8) {
            errors.push('Client ID must be at least 8 characters');
        }
        
        if (!secretKey || secretKey.length < 16) {
            errors.push('Secret Key must be at least 16 characters');
        }
        
        if (!accountKey || accountKey.length < 8) {
            errors.push('Account Key must be at least 8 characters');
        }
        
        if (secretKey && (secretKey.toLowerCase().includes('password') || secretKey.includes('123456'))) {
            errors.push('Secret Key appears to be weak');
        }
        
        if (errors.length > 0) {
            this.showNotification(errors.join('; '), 'error');
            return false;
        }
        
        return true;
    }

    validateFtpCredentialFormat(host, port, username, password) {
        const errors = [];
        
        if (!host || host.length < 3) {
            errors.push('Host is required');
        }
        
        const portNum = parseInt(port);
        if (!portNum || portNum < 1 || portNum > 65535) {
            errors.push('Port must be between 1 and 65535');
        }
        
        if (!username || username.length < 1) {
            errors.push('Username is required');
        }
        
        if (!password || password.length < 1) {
            errors.push('Password is required');
        }
        
        if (errors.length > 0) {
            this.showNotification(errors.join('; '), 'error');
            return false;
        }
        
        return true;
    }

    async handleClearApiCredentials() {
        if (confirm('Are you sure you want to clear stored API credentials?')) {
            try {
                await this.clearStoredCredentials('syncTool_apiCredentials');
                this.secureManager.remove('syncTool_apiCredentials');
                
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
                document.getElementById('accountKey').value = '';
                
                this.updateApiCredentialsStatus(false);
                this.closeApiModalHandler();
                this.showNotification('API credentials cleared successfully!', 'success');
                
            } catch (error) {
                console.error('Error clearing API credentials:', error);
                this.showNotification('Error clearing API credentials', 'error');
            }
        }
    }

    async handleClearFtpCredentials() {
        if (confirm('Are you sure you want to clear stored FTP credentials?')) {
            try {
                await this.clearStoredCredentials('syncTool_ftpCredentials');
                this.secureManager.remove('syncTool_ftpCredentials');
                
                document.getElementById('ftpHost').value = '';
                document.getElementById('ftpPort').value = '22';
                document.getElementById('ftpUsername').value = '';
                document.getElementById('ftpPassword').value = '';
                document.getElementById('ftpDirectory').value = '';
                document.getElementById('ftpSecure').checked = false;
                
                this.updateFtpCredentialsStatus(false);
                this.closeFtpModalHandler();
                this.showNotification('FTP credentials cleared successfully!', 'success');
                
            } catch (error) {
                console.error('Error clearing FTP credentials:', error);
                this.showNotification('Error clearing FTP credentials', 'error');
            }
        }
    }

    async saveEncryptedCredentials(credentialType, ...args) {
        let credentials;
        
        if (credentialType === 'syncTool_apiCredentials') {
            const [clientId, secretKey, accountKey] = args;
            credentials = {
                clientId: clientId,
                secretKey: secretKey,
                accountKey: accountKey,
                timestamp: new Date().toISOString()
            };
        } else if (credentialType === 'syncTool_ftpCredentials') {
            const [host, port, username, password, directory, secure] = args;
            credentials = {
                host: host,
                port: parseInt(port),
                username: username,
                password: password,
                directory: directory,
                secure: secure,
                timestamp: new Date().toISOString()
            };
        } else {
            throw new Error('Unknown credential type: ' + credentialType);
        }

        if (window.electronAPI && window.electronAPI.saveCredentials) {
            await window.electronAPI.saveCredentials(credentialType, credentials);
        } else {
            const encoded = btoa(JSON.stringify(credentials));
            localStorage.setItem(credentialType, encoded);
        }
    }

    async getDecryptedCredentials(credentialType) {
        try {
            let credentials = null;
            
            if (window.electronAPI && window.electronAPI.loadCredentials) {
                credentials = await window.electronAPI.loadCredentials(credentialType);
            } else {
                const stored = localStorage.getItem(credentialType);
                if (stored) {
                    credentials = JSON.parse(atob(stored));
                }
            }
            
            return credentials;
        } catch (error) {
            console.error('Error getting decrypted credentials:', error);
            return null;
        }
    }

    async clearStoredCredentials(credentialType) {
        if (window.electronAPI && window.electronAPI.clearCredentials) {
            await window.electronAPI.clearCredentials(credentialType);
        } else {
            localStorage.removeItem(credentialType);
        }
    }

    async loadCredentialsOnStartup() {
        try {
            // Load API credentials
            const apiCredentials = await this.getDecryptedCredentials('syncTool_apiCredentials');
            
            if (apiCredentials) {
                let credentialData;
                if (apiCredentials.clientId) {
                    credentialData = {
                        clientId: apiCredentials.clientId,
                        secretKey: apiCredentials.secretKey || '',
                        accountKey: apiCredentials.accountKey || ''
                    };
                } else if (apiCredentials.username) {
                    credentialData = {
                        clientId: apiCredentials.username,
                        secretKey: apiCredentials.password || '',
                        accountKey: ''
                    };
                }
                
                if (credentialData && credentialData.clientId && credentialData.secretKey && credentialData.accountKey) {
                    this.secureManager.store('syncTool_apiCredentials', credentialData, {
                        sensitive: true
                    });
                    
                    this.updateApiCredentialsStatus(true);
                    this.failureCount = 0;
                } else {
                    this.updateApiCredentialsStatus(false);
                }
            } else {
                this.updateApiCredentialsStatus(false);
            }

            // Load FTP credentials
            const ftpCredentials = await this.getDecryptedCredentials('syncTool_ftpCredentials');
            
            if (ftpCredentials && ftpCredentials.host && ftpCredentials.username && ftpCredentials.password) {
                const completeCredentials = {
                    host: ftpCredentials.host,
                    port: ftpCredentials.port || 22,
                    username: ftpCredentials.username,
                    password: ftpCredentials.password,
                    directory: ftpCredentials.directory || '',
                    secure: ftpCredentials.secure || false,
                    timestamp: ftpCredentials.timestamp || new Date().toISOString()
                };
                
                this.secureManager.store('syncTool_ftpCredentials', completeCredentials, {
                    sensitive: true
                });
                
                this.updateFtpCredentialsStatus(true);
            } else {
                this.updateFtpCredentialsStatus(false);
            }
            
        } catch (error) {
            console.error('Error loading credentials on startup:', error);
            this.updateApiCredentialsStatus(false);
            this.updateFtpCredentialsStatus(false);
            this.failureCount++;
            
            if (this.failureCount > 3) {
                this.secureManager.lock('Repeated credential loading failures');
            }
        }
    }

    updateApiCredentialsStatus(hasCredentials) {
        if (hasCredentials && this.secureManager.has('syncTool_apiCredentials')) {
            this.statusIndicator.className = 'status-indicator stored';
            this.statusText.textContent = 'API credentials stored permanently';
            this.credentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Update API Credentials';
        } else {
            this.statusIndicator.className = 'status-indicator empty';
            this.statusText.textContent = 'No API credentials stored';
            this.credentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Manage API Credentials';
        }
    }

    updateFtpCredentialsStatus(hasCredentials) {
        if (hasCredentials && this.secureManager.has('syncTool_ftpCredentials')) {
            this.ftpStatusIndicator.className = 'status-indicator stored';
            this.ftpStatusText.textContent = 'FTP credentials stored permanently';
            this.ftpCredentialsBtn.innerHTML = '<span class="btn-icon">📁</span>Update FTP Credentials';
        } else {
            this.ftpStatusIndicator.className = 'status-indicator empty';
            this.ftpStatusText.textContent = 'No FTP credentials stored';
            this.ftpCredentialsBtn.innerHTML = '<span class="btn-icon">📁</span>Manage FTP Credentials';
        }
    }

    showNotification(message, type = 'info') {
        const resultElement = document.getElementById('result');
        const resultContentElement = document.getElementById('resultContent');
        
        if (resultContentElement) {
            resultContentElement.innerHTML = `<p class="${type}">${message}</p>`;
        }
        
        if (resultElement) {
            resultElement.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    resultElement.style.display = 'none';
                }, 3000);
            }
        }
    }

    getCredentialStatus(credentialType) {
        return this.secureManager.getStatus(credentialType);
    }

    getSecurityStats() {
        return this.secureManager.getStatistics();
    }

    async getApiCredentials() {
        return this.secureManager.get('syncTool_apiCredentials');
    }

    async getFtpCredentials() {
        return this.secureManager.get('syncTool_ftpCredentials');
    }

    static getStoredCredentials() {
        return window.appCredentials;
    }

    static hasCredentials() {
        return window.appCredentials && window.appCredentials.isLoaded && 
               window.appCredentials.clientId && window.appCredentials.secretKey && 
               window.appCredentials.accountKey;
    }
}

// Initialize the credentials handler
const credentialsHandler = new CredentialsHandler();

// Export for use in other modules
window.credentialsHandler = credentialsHandler;
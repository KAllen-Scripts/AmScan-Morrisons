// Permanent Credentials Handler for Electron App
// Credentials stored permanently until manually cleared - no expiration

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
        
        // Clear all credentials when locked
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
        this.credentialsBtn = document.getElementById('credentialsBtn');
        this.credentialsModal = document.getElementById('credentialsModal');
        this.closeModal = document.getElementById('closeModal');
        this.credentialsForm = document.getElementById('credentialsForm');
        this.saveCredentials = document.getElementById('saveCredentials');
        this.clearCredentials = document.getElementById('clearCredentials');
        this.showPassword = document.getElementById('showPassword');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        
        // Initialize secure credentials manager (no expiration)
        this.secureManager = new SecureCredentialsManager();
        this.failureCount = 0;
        
        // Create secure proxy for global credentials access
        window.appCredentials = new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'isLoaded') {
                    return this.secureManager.has('apiCredentials');
                }
                
                const creds = this.secureManager.get('apiCredentials');
                return creds ? creds[prop] : null;
            },
            
            set: (target, prop, value) => {
                // Don't allow direct setting, must go through secure methods
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
        // Open modal
        this.credentialsBtn.addEventListener('click', () => this.openModal());
        
        // Close modal
        this.closeModal.addEventListener('click', () => this.closeModalHandler());
        this.credentialsModal.addEventListener('click', (e) => {
            if (e.target === this.credentialsModal) {
                this.closeModalHandler();
            }
        });
        
        // Handle Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.credentialsModal.classList.contains('show')) {
                this.closeModalHandler();
            }
        });
        
        // Save credentials
        this.saveCredentials.addEventListener('click', () => this.handleSaveCredentials());
        
        // Clear credentials
        this.clearCredentials.addEventListener('click', () => this.handleClearCredentials());
        
        // Show/hide password
        this.showPassword.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('password');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        
        // Handle form submission
        this.credentialsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveCredentials();
        });
    }

    async openModal() {
        // Check if credentials manager is locked
        if (this.secureManager.isLocked) {
            this.showNotification('Credentials are locked. Please restart the application.', 'error');
            return;
        }

        // Show modal
        this.credentialsModal.classList.add('show');
        
        // Force window focus to fix Electron focus issues
        if (window.electronAPI && window.electronAPI.focusWindow) {
            await window.electronAPI.focusWindow();
        }
        
        // Recreate inputs to ensure they work properly in Electron
        setTimeout(() => {
            this.recreateInputs();
        }, 50);
        
        // Load existing credentials
        this.loadCredentialsToForm().catch(error => {
            console.error('Error loading credentials to form:', error);
        });
    }

    recreateInputs() {
        // Get current values before recreating
        const usernameValue = document.getElementById('username').value;
        const passwordValue = document.getElementById('password').value;
        const accountKeyValue = document.getElementById('accountKey').value;
        const showPasswordChecked = document.getElementById('showPassword').checked;
        
        // Recreate each input to reset Electron's internal state
        this.recreateInput('username', usernameValue);
        this.recreateInput('password', passwordValue, showPasswordChecked ? 'text' : 'password');
        this.recreateInput('accountKey', accountKeyValue);
        
        // Reattach show password functionality
        const showPasswordCheckbox = document.getElementById('showPassword');
        showPasswordCheckbox.addEventListener('change', (e) => {
            const passwordInput = document.getElementById('password');
            passwordInput.type = e.target.checked ? 'text' : 'password';
        });
        
        // Add manual input handling for Electron compatibility
        this.addInputHandlers('username');
        this.addInputHandlers('password');
        this.addInputHandlers('accountKey');
        
        // Focus on the first input
        setTimeout(() => {
            document.getElementById('username').focus();
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
        
        // Handle character input manually for Electron compatibility
        input.addEventListener('keydown', (e) => {
            // Handle printable characters
            if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                // Insert character at cursor position
                const newValue = currentValue.substring(0, start) + e.key + currentValue.substring(end);
                input.value = newValue;
                
                // Set cursor position after the inserted character
                input.setSelectionRange(start + 1, start + 1);
                
                // Trigger input event
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Handle backspace
            else if (e.key === 'Backspace') {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                if (start === end && start > 0) {
                    // Delete character before cursor
                    const newValue = currentValue.substring(0, start - 1) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start - 1, start - 1);
                } else if (start !== end) {
                    // Delete selected text
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                }
                
                // Trigger input event
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // Handle delete
            else if (e.key === 'Delete') {
                e.preventDefault();
                
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const currentValue = input.value;
                
                if (start === end && start < currentValue.length) {
                    // Delete character after cursor
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end + 1);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                } else if (start !== end) {
                    // Delete selected text
                    const newValue = currentValue.substring(0, start) + currentValue.substring(end);
                    input.value = newValue;
                    input.setSelectionRange(start, start);
                }
                
                // Trigger input event
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }

    closeModalHandler() {
        this.credentialsModal.classList.remove('show');
        this.credentialsForm.reset();
        document.getElementById('password').type = 'password';
        document.getElementById('showPassword').checked = false;
    }

    async loadCredentialsToForm() {
        try {
            const credentials = await this.getDecryptedCredentials();
            
            if (credentials) {
                // Handle both old format (username/password) and new format (clientId/secretKey/accountKey)
                if (credentials.clientId) {
                    // New format
                    document.getElementById('username').value = credentials.clientId;
                    document.getElementById('password').value = credentials.secretKey || '';
                    document.getElementById('accountKey').value = credentials.accountKey || '';
                } else if (credentials.username) {
                    // Old format - migrate to new format
                    document.getElementById('username').value = credentials.username;
                    document.getElementById('password').value = credentials.password || '';
                    document.getElementById('accountKey').value = '';
                }
            }
        } catch (error) {
            console.error('Error loading credentials to form:', error);
        }
    }

    async handleSaveCredentials() {
        const clientId = document.getElementById('username').value.trim();
        const secretKey = document.getElementById('password').value;
        const accountKey = document.getElementById('accountKey').value.trim();

        // Enhanced validation
        if (!this.validateCredentialFormat(clientId, secretKey, accountKey)) {
            return;
        }

        try {
            // Save to persistent storage
            await this.saveEncryptedCredentials(clientId, secretKey, accountKey);
            
            // Store in secure memory manager permanently (no expiration)
            this.secureManager.store('apiCredentials', {
                clientId: clientId,
                secretKey: secretKey,
                accountKey: accountKey
            }, {
                sensitive: true
            });
            
            this.updateCredentialsStatus(true);
            this.closeModalHandler();
            this.showNotification('Credentials saved permanently!', 'success');
            this.failureCount = 0; // Reset failure count on success
            
        } catch (error) {
            console.error('Error saving credentials:', error);
            this.showNotification('Error saving credentials', 'error');
            this.failureCount++;
        }
    }

    validateCredentialFormat(clientId, secretKey, accountKey) {
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
        
        // Check for common weak patterns
        if (secretKey && (secretKey.toLowerCase().includes('password') || secretKey.includes('123456'))) {
            errors.push('Secret Key appears to be weak');
        }
        
        if (errors.length > 0) {
            this.showNotification(errors.join('; '), 'error');
            return false;
        }
        
        return true;
    }

    async handleClearCredentials() {
        if (confirm('Are you sure you want to clear stored credentials?')) {
            try {
                await this.clearStoredCredentials();
                
                // Clear from secure manager
                this.secureManager.clearAll();
                
                // Clear form inputs
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
                document.getElementById('accountKey').value = '';
                
                this.updateCredentialsStatus(false);
                this.closeModalHandler();
                this.showNotification('Credentials cleared successfully!', 'success');
                
            } catch (error) {
                console.error('Error clearing credentials:', error);
                this.showNotification('Error clearing credentials', 'error');
            }
        }
    }

    async saveEncryptedCredentials(clientId, secretKey, accountKey) {
        const credentials = {
            clientId: clientId,
            secretKey: secretKey,
            accountKey: accountKey,
            timestamp: new Date().toISOString()
        };

        if (window.electronAPI && window.electronAPI.saveCredentials) {
            // Use Electron's secure storage
            await window.electronAPI.saveCredentials(credentials);
        } else {
            // Fallback to localStorage with basic encoding (not truly secure)
            const encoded = btoa(JSON.stringify(credentials));
            localStorage.setItem('appCredentials', encoded);
        }
    }

    async getDecryptedCredentials() {
        try {
            let credentials = null;
            
            if (window.electronAPI && window.electronAPI.loadCredentials) {
                // Use Electron's secure storage
                credentials = await window.electronAPI.loadCredentials();
            } else {
                // Fallback to localStorage
                const stored = localStorage.getItem('appCredentials');
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

    async clearStoredCredentials() {
        if (window.electronAPI && window.electronAPI.clearCredentials) {
            await window.electronAPI.clearCredentials();
        } else {
            localStorage.removeItem('appCredentials');
        }
    }

    async loadCredentialsOnStartup() {
        try {
            const credentials = await this.getDecryptedCredentials();
            
            if (credentials) {
                // Handle both old format and new format
                let credentialData;
                if (credentials.clientId) {
                    // New format
                    credentialData = {
                        clientId: credentials.clientId,
                        secretKey: credentials.secretKey || '',
                        accountKey: credentials.accountKey || ''
                    };
                } else if (credentials.username) {
                    // Old format - convert to new format for backward compatibility
                    credentialData = {
                        clientId: credentials.username,
                        secretKey: credentials.password || '',
                        accountKey: ''
                    };
                }
                
                if (credentialData && credentialData.clientId && credentialData.secretKey && credentialData.accountKey) {
                    // Store in secure manager permanently (no expiration)
                    this.secureManager.store('apiCredentials', credentialData, {
                        sensitive: true
                    });
                    
                    this.updateCredentialsStatus(true);
                    this.failureCount = 0;
                } else {
                    this.updateCredentialsStatus(false);
                }
            } else {
                this.updateCredentialsStatus(false);
            }
        } catch (error) {
            console.error('Error loading credentials on startup:', error);
            this.updateCredentialsStatus(false);
            this.failureCount++;
            
            // Lock manager on repeated failures
            if (this.failureCount > 3) {
                this.secureManager.lock('Repeated credential loading failures');
            }
        }
    }

    updateCredentialsStatus(hasCredentials) {
        if (hasCredentials && this.secureManager.has('apiCredentials')) {
            this.statusIndicator.className = 'status-indicator stored';
            this.statusText.textContent = 'Credentials stored permanently';
            this.credentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Update Credentials';
        } else {
            this.statusIndicator.className = 'status-indicator empty';
            this.statusText.textContent = 'No credentials stored';
            this.credentialsBtn.innerHTML = '<span class="btn-icon">🔐</span>Manage Credentials';
        }
    }

    showNotification(message, type = 'info') {
        // Reuse the existing result display system
        const resultElement = document.getElementById('result');
        const resultContentElement = document.getElementById('resultContent');
        
        if (resultContentElement) {
            resultContentElement.innerHTML = `<p class="${type}">${message}</p>`;
        }
        
        if (resultElement) {
            resultElement.style.display = 'block';
            
            // Auto-hide success messages after 3 seconds
            if (type === 'success') {
                setTimeout(() => {
                    resultElement.style.display = 'none';
                }, 3000);
            }
        }
    }

    // Enhanced utility methods for external access
    getCredentialStatus() {
        return this.secureManager.getStatus('apiCredentials');
    }

    getSecurityStats() {
        return this.secureManager.getStatistics();
    }

    // Static utility methods for backward compatibility
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
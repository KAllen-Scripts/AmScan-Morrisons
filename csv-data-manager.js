// Enhanced CSV Data Manager with better initialization and debugging
// Replace the existing csv-data-manager.js with this version

class CSVDataManager {
    constructor() {
        this.csvData = [];
        this.csvHeaders = [];
        this.fileName = '';
        this.importDate = null;
        this.isInitialized = false;
        this.initializationPromise = null;
        
        // Start initialization but don't wait for it
        this.initializationPromise = this.initialize();
    }

    async initialize() {
        console.log('CSV Manager: Starting initialization...');
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        this.initializeElements();
        this.setupEventListeners();
        
        // Wait a bit for Electron API to be ready
        await this.waitForElectronAPI();
        
        // Load saved data
        await this.loadSavedCSVData();
        
        this.isInitialized = true;
        console.log('CSV Manager: Initialization completed');
    }

    async waitForElectronAPI(maxWait = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            if (window.electronAPI && window.electronAPI.loadConfig) {
                console.log('CSV Manager: Electron API ready');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('CSV Manager: Electron API not available, using localStorage fallback');
        return false;
    }

    async ensureInitialized() {
        if (!this.isInitialized && this.initializationPromise) {
            await this.initializationPromise;
        }
    }

    initializeElements() {
        this.importBtn = document.getElementById('importCSVBtn');
        this.fileInput = document.getElementById('csvFileInput');
        this.csvStatus = document.getElementById('csvStatus');
        this.csvInfo = document.getElementById('csvInfo');
        this.clearCSVBtn = document.getElementById('clearCSVBtn');
        this.exportCSVBtn = document.getElementById('exportCSVBtn');
        
        // Show CSV controls section
        const csvControls = document.getElementById('csvControls');
        if (csvControls) {
            csvControls.style.display = 'block';
        }
    }

    setupEventListeners() {
        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => this.triggerFileInput());
        }

        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        if (this.clearCSVBtn) {
            this.clearCSVBtn.addEventListener('click', () => this.clearCSVData());
        }

        if (this.exportCSVBtn) {
            this.exportCSVBtn.addEventListener('click', () => this.exportCSVData());
        }
    }

    triggerFileInput() {
        if (this.fileInput) {
            this.fileInput.click();
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showStatus('Please select a CSV file', 'error');
            return;
        }

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            this.showStatus('File too large. Maximum size is 10MB', 'error');
            return;
        }

        try {
            this.showStatus('Processing CSV file...', 'processing');
            
            const csvText = await this.readFileAsText(file);
            const parsedData = await this.parseCSV(csvText);
            
            if (parsedData && parsedData.length > 0) {
                this.csvData = parsedData;
                this.csvHeaders = Object.keys(parsedData[0]);
                this.fileName = file.name;
                this.importDate = new Date().toISOString();
                
                console.log('CSV Manager: Data parsed successfully:', {
                    rows: this.csvData.length,
                    headers: this.csvHeaders,
                    fileName: this.fileName
                });
                
                await this.saveCSVData();
                this.updateUI();
                this.showStatus(`Successfully imported ${parsedData.length} rows from ${file.name}`, 'success');
            } else {
                this.showStatus('No valid data found in CSV file', 'error');
            }
            
        } catch (error) {
            console.error('Error processing CSV:', error);
            this.showStatus(`Error processing CSV: ${error.message}`, 'error');
        } finally {
            event.target.value = '';
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    async parseCSV(csvText) {
        if (window.electronAPI && window.electronAPI.parseCSV) {
            return await window.electronAPI.parseCSV(csvText);
        } else {
            throw new Error('CSV parsing not available - Electron API not ready');
        }
    }

    async saveCSVData() {
        try {
            const csvDataToSave = {
                data: this.csvData,
                headers: this.csvHeaders,
                fileName: this.fileName,
                importDate: this.importDate,
                rowCount: this.csvData.length,
                version: '1.0'
            };

            console.log('CSV Manager: Saving CSV data...', {
                rows: csvDataToSave.rowCount,
                fileName: csvDataToSave.fileName
            });

            if (window.electronAPI && window.electronAPI.saveConfig) {
                // Save using Electron's secure storage
                const currentConfig = await window.electronAPI.loadConfig();
                currentConfig.csvData = csvDataToSave;
                await window.electronAPI.saveConfig(currentConfig);
                console.log('CSV Manager: Data saved to Electron store');
            } else {
                // Fallback to localStorage
                localStorage.setItem('syncTool_csvData', JSON.stringify(csvDataToSave));
                console.log('CSV Manager: Data saved to localStorage');
            }

        } catch (error) {
            console.error('Error saving CSV data:', error);
            throw new Error('Failed to save CSV data');
        }
    }

    async loadSavedCSVData() {
        try {
            let savedData = null;

            if (window.electronAPI && window.electronAPI.loadConfig) {
                console.log('CSV Manager: Loading CSV data from Electron store...');
                const config = await window.electronAPI.loadConfig();
                savedData = config.csvData;
                console.log('CSV Manager: Config loaded, csvData exists:', !!savedData);
            } else {
                console.log('CSV Manager: Loading CSV data from localStorage...');
                const stored = localStorage.getItem('syncTool_csvData');
                if (stored) {
                    savedData = JSON.parse(stored);
                }
                console.log('CSV Manager: LocalStorage data exists:', !!savedData);
            }

            if (savedData && savedData.data && Array.isArray(savedData.data)) {
                this.csvData = savedData.data;
                this.csvHeaders = savedData.headers || [];
                this.fileName = savedData.fileName || 'Unknown';
                this.importDate = savedData.importDate;
                
                console.log(`CSV Manager: Successfully loaded ${this.csvData.length} rows from saved CSV data`);
                console.log('CSV Manager: Headers:', this.csvHeaders);
                console.log('CSV Manager: File name:', this.fileName);
                
                this.updateUI();
            } else {
                console.log('CSV Manager: No saved CSV data found or invalid structure');
                if (savedData) {
                    console.log('CSV Manager: Invalid data structure:', Object.keys(savedData));
                }
            }

        } catch (error) {
            console.error('CSV Manager: Error loading saved CSV data:', error);
        }
    }

    async clearCSVData() {
        if (!this.csvData || this.csvData.length === 0) {
            this.showStatus('No CSV data to clear', 'info');
            return;
        }

        if (confirm(`Are you sure you want to clear the imported CSV data? (${this.csvData.length} rows from ${this.fileName})`)) {
            try {
                this.csvData = [];
                this.csvHeaders = [];
                this.fileName = '';
                this.importDate = null;

                if (window.electronAPI && window.electronAPI.saveConfig) {
                    const currentConfig = await window.electronAPI.loadConfig();
                    delete currentConfig.csvData;
                    await window.electronAPI.saveConfig(currentConfig);
                } else {
                    localStorage.removeItem('syncTool_csvData');
                }

                this.updateUI();
                this.showStatus('CSV data cleared successfully', 'success');
                console.log('CSV Manager: Data cleared successfully');

            } catch (error) {
                console.error('Error clearing CSV data:', error);
                this.showStatus('Error clearing CSV data', 'error');
            }
        }
    }

    updateUI() {
        if (this.csvInfo) {
            if (this.csvData && this.csvData.length > 0) {
                const importDateStr = this.importDate ? 
                    new Date(this.importDate).toLocaleString() : 'Unknown';
                
                this.csvInfo.innerHTML = `
                    <div class="csv-info-details">
                        <div><strong>File:</strong> ${this.fileName}</div>
                        <div><strong>Rows:</strong> ${this.csvData.length}</div>
                        <div><strong>Columns:</strong> ${this.csvHeaders.length}</div>
                        <div><strong>Imported:</strong> ${importDateStr}</div>
                        <div><strong>Headers:</strong> ${this.csvHeaders.join(', ')}</div>
                    </div>
                `;
                this.csvInfo.style.display = 'block';
            } else {
                this.csvInfo.style.display = 'none';
            }
        }

        if (this.clearCSVBtn) {
            this.clearCSVBtn.style.display = 
                (this.csvData && this.csvData.length > 0) ? 'inline-block' : 'none';
        }
        
        if (this.exportCSVBtn) {
            this.exportCSVBtn.style.display = 
                (this.csvData && this.csvData.length > 0) ? 'inline-block' : 'none';
        }

        if (this.importBtn) {
            if (this.csvData && this.csvData.length > 0) {
                this.importBtn.innerHTML = '<span class="btn-icon">🔄</span>Replace CSV Data';
            } else {
                this.importBtn.innerHTML = '<span class="btn-icon">📁</span>Import CSV File';
            }
        }
    }

    showStatus(message, type = 'info') {
        if (this.csvStatus) {
            this.csvStatus.textContent = message;
            this.csvStatus.className = `csv-status ${type}`;
            this.csvStatus.style.display = 'block';

            if (type === 'success' || type === 'info') {
                setTimeout(() => {
                    if (this.csvStatus) {
                        this.csvStatus.style.display = 'none';
                    }
                }, 3000);
            }
        }
    }

    exportCSVData() {
        if (!this.csvData || this.csvData.length === 0) {
            this.showStatus('No CSV data to export', 'info');
            return;
        }

        try {
            // Simple CSV conversion (since Papa.unparse may not be available)
            let csvContent = this.csvHeaders.join(',') + '\n';
            csvContent += this.csvData.map(row => 
                this.csvHeaders.map(header => {
                    const value = row[header] || '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            ).join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `exported_${this.fileName || 'data.csv'}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            this.showStatus('CSV data exported successfully', 'success');

        } catch (error) {
            console.error('Error exporting CSV:', error);
            this.showStatus('Error exporting CSV data', 'error');
        }
    }

    // Public API methods with initialization check
    async getCSVData() {
        await this.ensureInitialized();
        console.log('CSV Manager: getCSVData called, returning', this.csvData.length, 'rows');
        
        // Helper function to find header key case-insensitively
        const findHeader = (row, targetHeader) => {
            const keys = Object.keys(row);
            const foundKey = keys.find(key => 
                key.toLowerCase().trim() === targetHeader.toLowerCase().trim()
            );
            return foundKey || targetHeader; // fallback to original if not found
        };
        
        // Helper function to get value case-insensitively
        const getValue = (row, targetHeader) => {
            const actualKey = findHeader(row, targetHeader);
            return row[actualKey];
        };
        
        let csvParsedObject = {};
        
        for (const row of this.csvData) {
            // Get values using case-insensitive lookup
            const storeNumber = getValue(row, 'Store Number');
            const address = getValue(row, 'address');
            const gln = getValue(row, 'gln');
            
            // Only add to object if Store Number exists
            if (storeNumber !== undefined && storeNumber !== null && storeNumber !== '') {
                csvParsedObject[storeNumber] = {
                    address: address || '',
                    GLN: gln || ''
                };
            }
        }
        
        console.log('CSV Manager: Parsed', Object.keys(csvParsedObject).length, 'store records');
        return csvParsedObject;
    }

    async getCSVHeaders() {
        await this.ensureInitialized();
        return [...this.csvHeaders];
    }

    async getCSVMetadata() {
        await this.ensureInitialized();
        return {
            fileName: this.fileName,
            importDate: this.importDate,
            rowCount: this.csvData.length,
            columnCount: this.csvHeaders.length,
            headers: this.getCSVHeaders()
        };
    }

    async hasCSVData() {
        await this.ensureInitialized();
        return this.csvData && this.csvData.length > 0;
    }

    async searchCSVData(column, value) {
        await this.ensureInitialized();
        if (!this.hasCSVData()) return [];
        
        return this.csvData.filter(row => {
            return row[column] && row[column].toString().toLowerCase().includes(value.toString().toLowerCase());
        });
    }

    async filterCSVData(filterFn) {
        await this.ensureInitialized();
        if (!this.hasCSVData()) return [];
        return this.csvData.filter(filterFn);
    }

    async getUniqueValues(column) {
        await this.ensureInitialized();
        if (!this.hasCSVData()) return [];
        
        const values = this.csvData.map(row => row[column]).filter(val => val !== null && val !== undefined);
        return [...new Set(values)];
    }
}

// Initialize the CSV data manager
const csvDataManager = new CSVDataManager();

// Export for use in other modules
window.csvDataManager = csvDataManager;

// Utility functions with async support
window.getCSVData = async function() {
    return await csvDataManager.getCSVData();
};

window.getCSVHeaders = async function() {
    return await csvDataManager.getCSVHeaders();
};

window.hasCSVData = async function() {
    return await csvDataManager.hasCSVData();
};

window.getCSVMetadata = async function() {
    return await csvDataManager.getCSVMetadata();
};

console.log('Enhanced CSV Data Manager loaded with async initialization');
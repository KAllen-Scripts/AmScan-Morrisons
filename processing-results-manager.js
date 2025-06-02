// Processing Results Manager - Minimal Logging Version

class ProcessingResultsManager {
    constructor() {
        // Use a plain object instead of Map to avoid potential Map corruption issues
        this.results = {};
        this.processingQueue = new Set();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        
        this.initializeElements();
        this.setupEventListeners();
        this.updateDisplay();
    }

    initializeElements() {
        this.sidebar = document.getElementById('processingsidebar');
        this.sidebarContent = document.getElementById('sidebarContent');
        this.resultsList = document.getElementById('resultsList');
        this.noResults = document.getElementById('noResults');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.floatingSidebarToggle = document.getElementById('floatingSidebarToggle');
        this.clearResults = document.getElementById('clearResults');
        
        // EDI Modal elements
        this.ediModal = document.getElementById('ediModal');
        this.closeEdiModal = document.getElementById('closeEdiModal');
        this.ediInvoiceNumber = document.getElementById('ediInvoiceNumber');
        this.ediPayload = document.getElementById('ediPayload');
        this.copyEdi = document.getElementById('copyEdi');
        this.downloadEdi = document.getElementById('downloadEdi');
        
        // Initialize the sidebar state
        this.initializeSidebarState();
    }
    
    initializeSidebarState() {
        const appContainer = document.querySelector('.app-container');
        
        // Set initial state based on sidebar classes
        const isCollapsed = this.sidebar.classList.contains('collapsed');
        
        if (isCollapsed) {
            appContainer.classList.add('sidebar-collapsed');
            this.sidebarToggle.textContent = 'Show';
        } else {
            appContainer.classList.remove('sidebar-collapsed');
            this.sidebarToggle.textContent = 'Hide';
        }
    }

    setupEventListeners() {
        // Sidebar controls
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        if (this.floatingSidebarToggle) {
            this.floatingSidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        if (this.clearResults) {
            this.clearResults.addEventListener('click', () => this.clearAllResults());
        }
        
        // EDI Modal controls
        if (this.closeEdiModal) {
            this.closeEdiModal.addEventListener('click', () => this.closeEdiModal());
        }
        
        if (this.ediModal) {
            this.ediModal.addEventListener('click', (e) => {
                if (e.target === this.ediModal) {
                    this.closeEdiModal();
                }
            });
        }
        
        if (this.copyEdi) {
            this.copyEdi.addEventListener('click', () => this.copyEdiToClipboard());
        }
        
        if (this.downloadEdi) {
            this.downloadEdi.addEventListener('click', () => this.downloadEdiFile());
        }
        
        // Handle Escape key for EDI modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.ediModal && this.ediModal.classList.contains('show')) {
                this.closeEdiModal();
            }
        });
    }

    // Get current count of results
    getResultsCount() {
        return Object.keys(this.results).length;
    }

    // Get all results as array
    getAllResults() {
        return Object.values(this.results);
    }

    // Start processing an invoice
    startInvoiceProcessing(invoiceId, invoiceData = {}) {
        // Create a unique key that includes timestamp to avoid overwriting duplicates
        const timestamp = Date.now();
        const uniqueKey = `${invoiceId}_${timestamp}`;
        
        this.processingQueue.add(uniqueKey);
        
        const result = {
            invoiceId: invoiceId,
            uniqueKey: uniqueKey,
            invoiceData: invoiceData,
            status: 'processing',
            startTime: new Date(),
            steps: [
                { id: 'invoice', name: 'Invoice data retrieved', status: 'pending' },
                { id: 'items', name: 'Items data retrieved', status: 'pending' },
                { id: 'saleorder', name: 'Sale order data retrieved', status: 'pending' },
                { id: 'edi', name: 'EDI payload generated', status: 'pending' },
                { id: 'transmission', name: 'EDI transmission', status: 'pending' }
            ],
            currentStep: 0,
            ediPayload: null,
            error: null
        };
        
        // Store using unique key instead of just invoice ID
        this.results[uniqueKey] = result;
        
        // Only update display at the end, not on every step
        this.debouncedUpdateDisplay();
        
        return result;
    }

    // Debounced update display to prevent excessive updates
    debouncedUpdateDisplay() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        this.updateTimeout = setTimeout(() => {
            this.updateDisplay();
        }, 100); // Wait 100ms before updating display
    }

    // Update step status
    updateStepStatus(invoiceId, stepId, status, errorMessage = null, data = null) {
        // Find the result by invoice ID (may have multiple with same ID but different timestamps)
        const results = this.getAllResults();
        const result = results.find(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (!result) {
            return;
        }

        const step = result.steps.find(s => s.id === stepId);
        if (!step) {
            return;
        }

        step.status = status;
        step.completedAt = new Date();
        
        if (status === 'error') {
            step.error = errorMessage;
            result.status = 'error';
            result.error = errorMessage;
            this.processingQueue.delete(result.uniqueKey);
        } else if (status === 'success') {
            step.data = data;
            
            if (stepId === 'edi' && data) {
                result.ediPayload = data;
            }
            
            const allStepsComplete = result.steps.every(s => s.status === 'success');
            if (allStepsComplete) {
                result.status = 'success';
                result.completedAt = new Date();
                this.processingQueue.delete(result.uniqueKey);
            }
        } else if (status === 'processing') {
            result.status = 'processing';
        }

        // Use debounced update to prevent excessive DOM manipulation
        this.debouncedUpdateDisplay();
    }

    // Complete invoice processing successfully
    completeInvoiceProcessing(invoiceId, ediPayload) {
        // Find the result by invoice ID (currently processing)
        const results = this.getAllResults();
        const result = results.find(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (!result) {
            return;
        }

        result.status = 'success';
        result.completedAt = new Date();
        result.ediPayload = ediPayload;
        
        result.steps.forEach(step => {
            if (step.status === 'pending' || step.status === 'processing') {
                step.status = 'success';
                step.completedAt = new Date();
            }
        });

        this.processingQueue.delete(result.uniqueKey);
        this.debouncedUpdateDisplay();
    }

    // Fail invoice processing
    failInvoiceProcessing(invoiceId, stepId, errorMessage) {
        // Find the result by invoice ID (currently processing)
        const results = this.getAllResults();
        const result = results.find(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (!result) {
            return;
        }

        this.updateStepStatus(invoiceId, stepId, 'error', errorMessage);
        
        const stepIndex = result.steps.findIndex(s => s.id === stepId);
        for (let i = stepIndex + 1; i < result.steps.length; i++) {
            result.steps[i].status = 'not-attempted';
        }

        this.processingQueue.delete(result.uniqueKey);
        this.debouncedUpdateDisplay();
    }

    // Update the display
    updateDisplay() {
        if (!this.resultsList || !this.noResults) {
            return;
        }
        
        // Clear existing results
        this.resultsList.innerHTML = '';
        
        const resultsCount = this.getResultsCount();
        
        // Show/hide no results message
        if (resultsCount === 0) {
            this.noResults.style.display = 'block';
            this.resultsList.style.display = 'none';
            return;
        } else {
            this.noResults.style.display = 'none';
            this.resultsList.style.display = 'block';
        }

        // Get all results and sort by start time (newest first)
        const allResults = this.getAllResults();
        const sortedResults = allResults.sort((a, b) => b.startTime - a.startTime);

        // Create and append all result elements
        const fragment = document.createDocumentFragment();
        
        sortedResults.forEach((result) => {
            const resultElement = this.createResultElement(result);
            fragment.appendChild(resultElement);
        });
        
        this.resultsList.appendChild(fragment);
    }

    // Create a result element
    createResultElement(result) {
        const div = document.createElement('div');
        div.className = `result-item ${result.status}`;
        div.setAttribute('data-invoice-id', result.uniqueKey);

        const retryCount = this.getRetryCount(result.invoiceId);
        const retryText = retryCount > 0 ? `(Retry ${retryCount}/${this.maxRetries})` : '';

        div.innerHTML = `
            <div class="result-header" data-action="toggle-details" data-unique-key="${result.uniqueKey}">
                <div class="result-title">
                    <span class="result-icon">${this.getStatusIcon(result.status)}</span>
                    <span class="result-label">Invoice #${result.invoiceId}</span>
                    <span class="result-timestamp">${this.formatTime(result.startTime)}</span>
                    ${retryText ? `<span class="retry-count">${retryText}</span>` : ''}
                </div>
                <div class="result-actions">
                    ${result.status === 'success' && result.ediPayload ? 
                        `<button class="btn-icon view-edi" data-action="view-edi" data-unique-key="${result.uniqueKey}" title="View EDI Payload">📄</button>` : ''}
                    ${result.status === 'error' && retryCount < this.maxRetries ? 
                        `<button class="btn-icon retry-now" data-action="retry" data-invoice-id="${result.invoiceId}" title="Retry Now">🔄</button>` : ''}
                    <button class="btn-icon collapse-toggle" data-action="collapse-toggle" title="Collapse">−</button>
                </div>
            </div>
            <div class="result-details">
                <div class="step-list">
                    ${result.steps.map(step => this.createStepHTML(step)).join('')}
                </div>
            </div>
        `;

        // Add event listeners to the created element
        this.attachResultEventListeners(div);

        return div;
    }

    // Attach event listeners to result elements
    attachResultEventListeners(resultElement) {
        // Toggle details on header click
        const header = resultElement.querySelector('.result-header');
        if (header) {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking on action buttons
                if (e.target.closest('.result-actions')) {
                    return;
                }
                const uniqueKey = header.getAttribute('data-unique-key');
                this.toggleResultDetails(uniqueKey);
            });
        }

        // View EDI button
        const viewEdiBtn = resultElement.querySelector('[data-action="view-edi"]');
        if (viewEdiBtn) {
            viewEdiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const uniqueKey = viewEdiBtn.getAttribute('data-unique-key');
                this.showEdiModal(uniqueKey);
            });
        }

        // Retry button
        const retryBtn = resultElement.querySelector('[data-action="retry"]');
        if (retryBtn) {
            retryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const invoiceId = retryBtn.getAttribute('data-invoice-id');
                this.retryInvoiceProcessing(invoiceId);
            });
        }

        // Collapse toggle button
        const collapseBtn = resultElement.querySelector('[data-action="collapse-toggle"]');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const resultItem = collapseBtn.closest('.result-item');
                if (resultItem) {
                    resultItem.classList.toggle('collapsed');
                    collapseBtn.textContent = resultItem.classList.contains('collapsed') ? '+' : '−';
                }
            });
        }
    }

    // Create step HTML
    createStepHTML(step) {
        const icon = this.getStepIcon(step.status);
        const errorHtml = step.error ? `<div class="error-details">${step.error}</div>` : '';
        
        return `
            <div class="step ${step.status}">
                <span class="step-icon">${icon}</span>
                <span class="step-text">${step.name}</span>
                ${errorHtml}
            </div>
        `;
    }

    // Retry invoice processing
    async retryInvoiceProcessing(invoiceId) {
        const currentRetries = this.retryAttempts.get(invoiceId) || 0;
        
        if (currentRetries >= this.maxRetries) {
            return false;
        }

        this.retryAttempts.set(invoiceId, currentRetries + 1);
        
        // Find and reset the result status
        const results = this.getAllResults();
        const result = results.find(r => r.invoiceId === invoiceId && r.status === 'error');
        
        if (result) {
            result.status = 'processing';
            result.error = null;
            result.steps.forEach(step => {
                if (step.status === 'error' || step.status === 'not-attempted') {
                    step.status = 'pending';
                    step.error = null;
                }
            });
        }

        this.processingQueue.add(result ? result.uniqueKey : invoiceId);
        this.updateDisplay();
        
        // Trigger the actual retry processing
        if (window.processInvoice) {
            try {
                await window.processInvoice(invoiceId, result ? result.invoiceData : {});
                return true;
            } catch (error) {
                return false;
            }
        }
        
        return true;
    }

    // Get retry count for an invoice
    getRetryCount(invoiceId) {
        return this.retryAttempts.get(invoiceId) || 0;
    }

    // Get status icon
    getStatusIcon(status) {
        switch (status) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'processing': return '🔄';
            case 'warning': return '⚠️';
            default: return '⏳';
        }
    }

    // Get step icon
    getStepIcon(status) {
        switch (status) {
            case 'success': return '✓';
            case 'error': return '✗';
            case 'processing': return '⏳';
            case 'pending': return '−';
            case 'not-attempted': return '−';
            default: return '−';
        }
    }

    // Format time for display
    formatTime(date) {
        return date.toLocaleTimeString('en-GB', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // Toggle result details
    toggleResultDetails(uniqueKey) {
        const element = document.querySelector(`[data-invoice-id="${uniqueKey}"]`);
        if (element) {
            element.classList.toggle('collapsed');
            const toggle = element.querySelector('.collapse-toggle');
            if (toggle) {
                toggle.textContent = element.classList.contains('collapsed') ? '+' : '−';
            }
        }
    }

    // Show EDI modal
    showEdiModal(uniqueKey) {
        const result = this.results[uniqueKey];
        if (!result || !result.ediPayload) {
            return;
        }

        this.ediInvoiceNumber.textContent = result.invoiceId;
        this.ediPayload.textContent = result.ediPayload;
        this.ediModal.classList.add('show');
        
        this.currentEdiUniqueKey = uniqueKey;
    }

    // Close EDI modal
    closeEdiModal() {
        this.ediModal.classList.remove('show');
        this.currentEdiUniqueKey = null;
    }

    // Copy EDI to clipboard
    async copyEdiToClipboard() {
        if (!this.currentEdiUniqueKey) return;
        
        const result = this.results[this.currentEdiUniqueKey];
        if (!result || !result.ediPayload) return;

        try {
            await navigator.clipboard.writeText(result.ediPayload);
            
            const originalText = this.copyEdi.textContent;
            this.copyEdi.textContent = 'Copied!';
            this.copyEdi.style.background = 'var(--light-success)';
            this.copyEdi.style.color = 'var(--success-green)';
            
            setTimeout(() => {
                this.copyEdi.textContent = originalText;
                this.copyEdi.style.background = '';
                this.copyEdi.style.color = '';
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy EDI payload:', error);
            alert('Failed to copy to clipboard');
        }
    }

    // Download EDI file
    downloadEdiFile() {
        if (!this.currentEdiUniqueKey) return;
        
        const result = this.results[this.currentEdiUniqueKey];
        if (!result || !result.ediPayload) return;

        const blob = new Blob([result.ediPayload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice_${result.invoiceId}_edi.txt`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    // Toggle sidebar
    toggleSidebar() {
        const appContainer = document.querySelector('.app-container');
        if (!appContainer || !this.sidebar) {
            return;
        }
        
        // Toggle sidebar collapsed class
        this.sidebar.classList.toggle('collapsed');
        const isCollapsed = this.sidebar.classList.contains('collapsed');
        
        // Update app container class to adjust padding
        if (isCollapsed) {
            appContainer.classList.add('sidebar-collapsed');
        } else {
            appContainer.classList.remove('sidebar-collapsed');
        }
        
        // Update the sidebar toggle button text
        if (this.sidebarToggle) {
            this.sidebarToggle.textContent = isCollapsed ? 'Show' : 'Hide';
        }
    }

    // Clear all results
    clearAllResults() {
        if (this.getResultsCount() === 0) return;
        
        if (confirm('Are you sure you want to clear all processing results?')) {
            this.results = {};
            this.retryAttempts.clear();
            this.processingQueue.clear();
            this.updateDisplay();
        }
    }

    // Get current statistics
    getStatistics() {
        const allResults = this.getAllResults();
        const total = allResults.length;
        const successful = allResults.filter(r => r.status === 'success').length;
        const failed = allResults.filter(r => r.status === 'error').length;
        const processing = this.processingQueue.size;
        
        return {
            total,
            successful,
            failed,
            processing,
            successRate: total > 0 ? (successful / total * 100).toFixed(1) : 0
        };
    }
}

// Initialize the processing results manager
const processingResults = new ProcessingResultsManager();

// Export for use in other modules
window.processingResults = processingResults;

// Test function for debugging
window.addTestResult = function(invoiceId) {
    const testId = invoiceId || 'TEST' + Date.now();
    processingResults.startInvoiceProcessing(testId, { test: true });
    
    setTimeout(() => {
        processingResults.updateStepStatus(testId, 'invoice', 'success');
        processingResults.updateStepStatus(testId, 'items', 'success');
        processingResults.updateStepStatus(testId, 'saleorder', 'success');
        processingResults.updateStepStatus(testId, 'edi', 'success');
        processingResults.completeInvoiceProcessing(testId, 'TEST EDI PAYLOAD');
    }, 1000);
};
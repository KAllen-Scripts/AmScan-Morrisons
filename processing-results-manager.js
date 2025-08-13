// Processing Results Manager - Complete with Enhanced Animations and Better Error Handling

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
        this.injectEnhancedAnimationStyles();
        this.optimizeAnimations();
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
            this.closeEdiModal.addEventListener('click', () => this.closeEdiModalHandler());
        }
        
        if (this.ediModal) {
            this.ediModal.addEventListener('click', (e) => {
                if (e.target === this.ediModal) {
                    this.closeEdiModalHandler();
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
                this.closeEdiModalHandler();
            }
        });
    }

    // Enhanced toggle sidebar with graceful animations
    toggleSidebar() {
        const appContainer = document.querySelector('.app-container');
        if (!appContainer || !this.sidebar) {
            return;
        }
        
        // Check current state
        const isCollapsed = this.sidebar.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Showing sidebar - immediate floating button hide, then show sidebar
            this.hideFloatingButtonGracefully();
            
            setTimeout(() => {
                this.sidebar.classList.remove('collapsed');
                appContainer.classList.remove('sidebar-collapsed');
                
                if (this.sidebarToggle) {
                    this.sidebarToggle.textContent = 'Hide';
                }
            }, 50); // Small delay to ensure floating button starts hiding first
            
        } else {
            // Hiding sidebar - sidebar hides first, then floating button appears
            this.sidebar.classList.add('collapsed');
            appContainer.classList.add('sidebar-collapsed');
            
            if (this.sidebarToggle) {
                this.sidebarToggle.textContent = 'Show';
            }
            
            // Floating button will appear automatically due to CSS transitions
            // with the built-in delay
        }
    }

    // Add this new method to handle graceful floating button hiding
    hideFloatingButtonGracefully() {
        const floatingButton = this.floatingSidebarToggle || document.getElementById('floatingSidebarToggle');
        if (floatingButton) {
            // Add a temporary class to speed up the hiding animation
            floatingButton.classList.add('quick-hide');
            
            // Remove the class after animation completes
            setTimeout(() => {
                floatingButton.classList.remove('quick-hide');
            }, 200);
        }
    }

    // Inject enhanced animation styles
    injectEnhancedAnimationStyles() {
        if (!document.getElementById('enhanced-sidebar-animations')) {
            const enhancedAnimationStyles = `
            .floating-sidebar-toggle.quick-hide {
                opacity: 0 !important;
                visibility: hidden !important;
                transform: translateX(100px) scale(0.8) !important;
                transition: all 0.2s ease-out !important;
                transition-delay: 0s !important;
            }

            /* Enhanced staggered animation for multiple elements */
            .sidebar-content > * {
                transition: opacity 0.3s ease-out, transform 0.3s ease-out;
            }

            .sidebar.collapsed .sidebar-content > * {
                opacity: 0;
                transform: translateX(20px);
            }

            .sidebar.collapsed .sidebar-content > *:nth-child(1) { transition-delay: 0s; }
            .sidebar.collapsed .sidebar-content > *:nth-child(2) { transition-delay: 0.05s; }
            .sidebar.collapsed .sidebar-content > *:nth-child(3) { transition-delay: 0.1s; }
            .sidebar.collapsed .sidebar-content > *:nth-child(4) { transition-delay: 0.15s; }

            /* Smooth appearance when sidebar shows */
            .sidebar:not(.collapsed) .sidebar-content > * {
                opacity: 1;
                transform: translateX(0);
            }

            .sidebar:not(.collapsed) .sidebar-content > *:nth-child(1) { transition-delay: 0.1s; }
            .sidebar:not(.collapsed) .sidebar-content > *:nth-child(2) { transition-delay: 0.15s; }
            .sidebar:not(.collapsed) .sidebar-content > *:nth-child(3) { transition-delay: 0.2s; }
            .sidebar:not(.collapsed) .sidebar-content > *:nth-child(4) { transition-delay: 0.25s; }
            `;

            const styleSheet = document.createElement('style');
            styleSheet.id = 'enhanced-sidebar-animations';
            styleSheet.textContent = enhancedAnimationStyles;
            document.head.appendChild(styleSheet);
        }
    }

    // Optimize animations for better performance
    optimizeAnimations() {
        if (this.sidebar) {
            // Use will-change for better performance during animations
            this.sidebar.style.willChange = 'transform, opacity';
            
            // Remove will-change after animation completes to save memory
            this.sidebar.addEventListener('transitionend', () => {
                this.sidebar.style.willChange = 'auto';
            });
        }
        
        if (this.floatingSidebarToggle) {
            this.floatingSidebarToggle.style.willChange = 'transform, opacity';
            
            this.floatingSidebarToggle.addEventListener('transitionend', () => {
                this.floatingSidebarToggle.style.willChange = 'auto';
            });
        }
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
            console.warn(`No processing result found for invoice ${invoiceId} and step ${stepId}`);
            return;
        }

        const step = result.steps.find(s => s.id === stepId);
        if (!step) {
            console.warn(`Step ${stepId} not found for invoice ${invoiceId}`);
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
            console.warn(`No processing result found for invoice ${invoiceId} to complete`);
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
            console.warn(`No processing result found for invoice ${invoiceId} to fail`);
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
            console.warn(`Maximum retries (${this.maxRetries}) reached for invoice ${invoiceId}`);
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
                console.error(`Retry failed for invoice ${invoiceId}:`, error);
                return false;
            }
        }
        
        console.warn('processInvoice function not available for retry');
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
        try {
            return date.toLocaleTimeString('en-GB', { 
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            console.warn('Error formatting time:', error);
            return new Date(date).toTimeString().substr(0, 8);
        }
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
            console.warn(`No EDI payload found for result ${uniqueKey}`);
            return;
        }

        if (this.ediInvoiceNumber) {
            this.ediInvoiceNumber.textContent = result.invoiceId;
        }
        
        if (this.ediPayload) {
            this.ediPayload.textContent = result.ediPayload;
        }
        
        if (this.ediModal) {
            this.ediModal.classList.add('show');
        }
        
        this.currentEdiUniqueKey = uniqueKey;
    }

    // Close EDI modal
    closeEdiModalHandler() {
        if (this.ediModal) {
            this.ediModal.classList.remove('show');
        }
        this.currentEdiUniqueKey = null;
    }

    // Copy EDI to clipboard
    async copyEdiToClipboard() {
        if (!this.currentEdiUniqueKey) {
            console.warn('No EDI content selected for copying');
            return;
        }
        
        const result = this.results[this.currentEdiUniqueKey];
        if (!result || !result.ediPayload) {
            console.warn('No EDI payload available for copying');
            return;
        }

        try {
            await navigator.clipboard.writeText(result.ediPayload);
            
            if (this.copyEdi) {
                const originalText = this.copyEdi.textContent;
                this.copyEdi.textContent = 'Copied!';
                this.copyEdi.style.background = 'var(--light-success)';
                this.copyEdi.style.color = 'var(--success-green)';
                
                setTimeout(() => {
                    this.copyEdi.textContent = originalText;
                    this.copyEdi.style.background = '';
                    this.copyEdi.style.color = '';
                }, 2000);
            }
            
        } catch (error) {
            console.error('Failed to copy EDI payload:', error);
            alert('Failed to copy to clipboard. Please select and copy manually.');
        }
    }

    // Download EDI file
    downloadEdiFile() {
        if (!this.currentEdiUniqueKey) {
            console.warn('No EDI content selected for download');
            return;
        }
        
        const result = this.results[this.currentEdiUniqueKey];
        if (!result || !result.ediPayload) {
            console.warn('No EDI payload available for download');
            return;
        }

        try {
            const blob = new Blob([result.ediPayload], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `invoice_${result.invoiceId}_edi.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download EDI file:', error);
            alert('Failed to download file');
        }
    }

    // Clear all results
    clearAllResults() {
        if (this.getResultsCount() === 0) {
            console.log('No results to clear');
            return;
        }
        
        if (confirm('Are you sure you want to clear all processing results?')) {
            this.results = {};
            this.retryAttempts.clear();
            this.processingQueue.clear();
            this.updateDisplay();
            console.log('All processing results cleared');
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

// Enhanced sidebar toggle function for external use
window.enhancedSidebarToggle = function() {
    if (window.processingResults && window.processingResults.toggleSidebar) {
        window.processingResults.toggleSidebar();
    }
};

// Test function for debugging
window.addTestResult = function(invoiceId) {
    const testId = invoiceId || 'TEST' + Date.now();
    processingResults.startInvoiceProcessing(testId, { test: true });
    
    setTimeout(() => {
        processingResults.updateStepStatus(testId, 'invoice', 'success');
        processingResults.updateStepStatus(testId, 'items', 'success');
        processingResults.updateStepStatus(testId, 'saleorder', 'success');
        processingResults.updateStepStatus(testId, 'edi', 'success');
        processingResults.completeInvoiceProcessing(testId, 'TEST EDI PAYLOAD\nNAD+SU+5060089601212::9+TEST SUPPLIER LTD:Address Line:Address Line:Address Line:POSTCODE\'');
    }, 1000);
};
// Processing Results Manager - Complete with Enhanced Animations, Error Handling, Filtering, and State Management Fixes

class ProcessingResultsManager {
    constructor() {
        // Use a plain object instead of Map to avoid potential Map corruption issues
        this.results = {};
        this.processingQueue = new Set();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        
        // Filter state management
        this.activeFilters = new Set(['success', 'error', 'manual']); // Start with all active
        this.filterCounts = {
            success: 0,
            error: 0,
            manual: 0
        };
        
        // Modal state
        this.currentEdiUniqueKey = null;
        this.isEditMode = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.updateDisplay();
        this.injectEnhancedAnimationStyles();
        this.optimizeAnimations();
        
        // Initialize filter buttons after DOM is ready
        setTimeout(() => {
            this.updateFilterButtons();
        }, 100);
    }

    initializeElements() {
        this.sidebar = document.getElementById('processingsidebar');
        this.sidebarContent = document.getElementById('sidebarContent');
        this.resultsList = document.getElementById('resultsList');
        this.noResults = document.getElementById('noResults');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.floatingSidebarToggle = document.getElementById('floatingSidebarToggle');
        this.clearResults = document.getElementById('clearResults');
        
        // Filter elements
        this.filterSuccess = document.getElementById('filterSuccess');
        this.filterError = document.getElementById('filterError');
        this.filterManual = document.getElementById('filterManual');
        this.countSuccess = document.getElementById('countSuccess');
        this.countError = document.getElementById('countError');
        this.countManual = document.getElementById('countManual');
        
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
        
        // Filter button event listeners - now toggle style
        if (this.filterSuccess) {
            this.filterSuccess.addEventListener('click', () => this.toggleFilter('success'));
        }
        
        if (this.filterError) {
            this.filterError.addEventListener('click', () => this.toggleFilter('error'));
        }
        
        if (this.filterManual) {
            this.filterManual.addEventListener('click', () => this.toggleFilter('manual'));
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
        
        // Manual transmission event listeners (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="edit-edi"]')) {
                e.stopPropagation();
                const uniqueKey = e.target.getAttribute('data-unique-key');
                this.showEditEdiModal(uniqueKey);
            }
            
            if (e.target.matches('[data-action="resend-edi"]')) {
                e.stopPropagation();
                const uniqueKey = e.target.getAttribute('data-unique-key');
                this.resendEdiPayload(uniqueKey);
            }
            
            if (e.target.matches('[data-action="dismiss"]')) {
                e.stopPropagation();
                const uniqueKey = e.target.getAttribute('data-unique-key');
                this.dismissResult(uniqueKey);
            }
        });
        
        // Handle Escape key for EDI modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.ediModal && this.ediModal.classList.contains('show')) {
                this.closeEdiModalHandler();
            }
        });
    }

    // NEW: Cleanup method to remove old processing attempts
    cleanupOldProcessingAttempts(invoiceId) {
        const keysToRemove = [];
        
        for (const [key, result] of Object.entries(this.results)) {
            if (result.invoiceId === invoiceId && result.status !== 'processing') {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => {
            console.log(`Cleaning up old result for invoice ${invoiceId}: ${key}`);
            delete this.results[key];
            this.processingQueue.delete(key);
            this.retryAttempts.delete(invoiceId);
        });
        
        if (keysToRemove.length > 0) {
            this.debouncedUpdateDisplay();
        }
    }

    // NEW: Clean up stuck processing states
    cleanupStuckProcessing() {
        let cleanedCount = 0;
        const now = Date.now();
        const maxProcessingTime = 10 * 60 * 1000; // 10 minutes
        
        for (const [key, result] of Object.entries(this.results)) {
            if (result.status === 'processing') {
                const processingTime = now - result.startTime.getTime();
                
                // Check if not in processing queue or has been processing too long
                if (!this.processingQueue.has(result.uniqueKey) || processingTime > maxProcessingTime) {
                    console.warn(`Found stuck processing result, cleaning up: ${result.uniqueKey}`);
                    result.status = 'error';
                    result.error = 'Processing was reset due to stuck state';
                    result.completedAt = new Date();
                    this.processingQueue.delete(result.uniqueKey);
                    cleanedCount++;
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`Cleaned up ${cleanedCount} stuck processing results`);
            this.debouncedUpdateDisplay();
        }
        
        return cleanedCount;
    }

    // Toggle filter on/off
    toggleFilter(filterType) {
        if (this.activeFilters.has(filterType)) {
            this.activeFilters.delete(filterType);
        } else {
            this.activeFilters.add(filterType);
        }
        
        this.updateFilterButtons();
        this.updateDisplay();
        
        console.log(`Active filters:`, Array.from(this.activeFilters));
    }
    
    // Update filter button states
    updateFilterButtons() {
        const buttons = [this.filterSuccess, this.filterError, this.filterManual];
        const filterTypes = ['success', 'error', 'manual'];
        
        buttons.forEach((btn, index) => {
            if (btn) {
                const filterType = filterTypes[index];
                if (this.activeFilters.has(filterType)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
    }
    
    // Update filter counts
    updateFilterCounts() {
        const allResults = this.getAllResults();
        
        this.filterCounts.success = allResults.filter(r => this.getResultCategory(r) === 'success').length;
        this.filterCounts.error = allResults.filter(r => this.getResultCategory(r) === 'error').length;
        this.filterCounts.manual = allResults.filter(r => this.getResultCategory(r) === 'manual').length;
        
        // Update count displays
        if (this.countSuccess) this.countSuccess.textContent = this.filterCounts.success;
        if (this.countError) this.countError.textContent = this.filterCounts.error;
        if (this.countManual) this.countManual.textContent = this.filterCounts.manual;
    }
    
    // Determine result category (success, error, or manual)
    getResultCategory(result) {
        // Manual takes precedence - if manually edited or manually transmitted
        if (result.isManuallyEdited || result.manualTransmissionStatus === 'success') {
            return 'manual';
        }
        
        // Then check original processing status
        if (result.status === 'success') {
            return 'success';
        } else if (result.status === 'error') {
            return 'error';
        }
        
        // Default fallback
        return 'error';
    }
    
    // Get filtered results based on active filters
    getFilteredResults() {
        const allResults = this.getAllResults();
        
        // If no filters active, show nothing
        if (this.activeFilters.size === 0) {
            return [];
        }
        
        // Return results that match any of the active filters (OR logic)
        return allResults.filter(result => {
            const category = this.getResultCategory(result);
            return this.activeFilters.has(category);
        });
    }
    
    // Update no results message based on current filters
    updateNoResultsMessage() {
        if (!this.noResults) return;
        
        const allResults = this.getAllResults();
        const filteredResults = this.getFilteredResults();
        
        if (allResults.length === 0) {
            // No results at all
            this.noResults.innerHTML = `
                <p>No processing results yet.</p>
                <p class="help-text">Results will appear here when invoices are processed.</p>
            `;
        } else if (this.activeFilters.size === 0) {
            // No filters active
            this.noResults.innerHTML = `
                <p>No filters selected.</p>
                <p class="help-text">Toggle filters above to view results.</p>
            `;
        } else if (filteredResults.length === 0) {
            // Results exist but none match current filters
            const activeFilterNames = Array.from(this.activeFilters).map(f => {
                switch(f) {
                    case 'success': return 'successful';
                    case 'error': return 'failed';
                    case 'manual': return 'manually resolved';
                    default: return f;
                }
            });
            
            this.noResults.innerHTML = `
                <p>No ${activeFilterNames.join(' or ')} results found.</p>
                <p class="help-text">Try toggling different filters to see other results.</p>
            `;
        }
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
        // Clean up any old results for this invoice first
        this.cleanupOldProcessingAttempts(invoiceId);
        
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
        
        console.log(`Started processing for invoice ${invoiceId} with key ${uniqueKey}`);
        
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

    // FIXED: Update step status with better result finding
    updateStepStatus(invoiceId, stepId, status, errorMessage = null, data = null) {
        // Find the most recent processing result by invoiceId
        const results = this.getAllResults();
        const processingResults = results.filter(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (processingResults.length === 0) {
            console.warn(`No processing result found for invoice ${invoiceId} and step ${stepId}`);
            return;
        }
        
        // Get the most recent one (highest timestamp)
        const result = processingResults.reduce((latest, current) => {
            return current.startTime > latest.startTime ? current : latest;
        });

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
        // Find the most recent processing result by invoiceId
        const results = this.getAllResults();
        const processingResults = results.filter(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (processingResults.length === 0) {
            console.warn(`No processing result found for invoice ${invoiceId} to complete`);
            return;
        }

        // Get the most recent one
        const result = processingResults.reduce((latest, current) => {
            return current.startTime > latest.startTime ? current : latest;
        });

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

    // Store failed EDI payload (for validation failures)
    storeFailedEdiPayload(invoiceId, ediPayload, validationResult) {
        // Find the most recent processing result by invoiceId
        const results = this.getAllResults();
        const processingResults = results.filter(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (processingResults.length === 0) {
            console.warn(`No processing result found for invoice ${invoiceId} to store failed EDI`);
            return;
        }

        // Get the most recent one
        const result = processingResults.reduce((latest, current) => {
            return current.startTime > latest.startTime ? current : latest;
        });

        result.ediPayload = ediPayload;
        result.validationResult = validationResult;
        result.status = 'error';
        result.completedAt = new Date();
        result.error = `EDI validation failed: ${validationResult.invalidFieldCount} undefined fields`;
        
        this.processingQueue.delete(result.uniqueKey);
        this.debouncedUpdateDisplay();
    }

    // Fail invoice processing
    failInvoiceProcessing(invoiceId, stepId, errorMessage) {
        // Find the most recent processing result by invoiceId
        const results = this.getAllResults();
        const processingResults = results.filter(r => r.invoiceId === invoiceId && r.status === 'processing');
        
        if (processingResults.length === 0) {
            console.warn(`No processing result found for invoice ${invoiceId} to fail`);
            return;
        }

        // Get the most recent one
        const result = processingResults.reduce((latest, current) => {
            return current.startTime > latest.startTime ? current : latest;
        });

        this.updateStepStatus(invoiceId, stepId, 'error', errorMessage);
        
        const stepIndex = result.steps.findIndex(s => s.id === stepId);
        for (let i = stepIndex + 1; i < result.steps.length; i++) {
            result.steps[i].status = 'not-attempted';
        }

        this.processingQueue.delete(result.uniqueKey);
        this.debouncedUpdateDisplay();
    }

    // Modified updateDisplay to include filtering
    updateDisplay() {
        if (!this.resultsList || !this.noResults) {
            return;
        }
        
        // Clean up any stuck processing first
        this.cleanupStuckProcessing();
        
        // Update filter counts first
        this.updateFilterCounts();
        
        // Clear existing results
        this.resultsList.innerHTML = '';
        
        // Get filtered results instead of all results
        const filteredResults = this.getFilteredResults();
        const totalResults = this.getResultsCount();
        
        // Show/hide no results message
        if (totalResults === 0 || filteredResults.length === 0) {
            this.noResults.style.display = 'block';
            this.resultsList.style.display = 'none';
            this.updateNoResultsMessage();
            return;
        } else {
            this.noResults.style.display = 'none';
            this.resultsList.style.display = 'block';
        }

        // Sort filtered results by start time (newest first)
        const sortedResults = filteredResults.sort((a, b) => b.startTime - a.startTime);

        // Create and append all result elements
        const fragment = document.createDocumentFragment();
        
        sortedResults.forEach((result, index) => {
            const resultElement = this.createResultElement(result);
            // Add staggered animation class
            resultElement.classList.add('filtered-in');
            resultElement.style.animationDelay = `${index * 0.05}s`;
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
                    ${this.getManualActionBadges(result)}
                </div>
                <div class="result-actions">
                    ${result.ediPayload ? 
                        `<button class="btn-icon edit-edi" data-action="edit-edi" data-unique-key="${result.uniqueKey}" title="View/Edit EDI Payload">✏️</button>` : ''}
                    ${result.ediPayload && result.status === 'success' ? 
                        `<button class="btn-icon resend-edi" data-action="resend-edi" data-unique-key="${result.uniqueKey}" title="Resend EDI">📤</button>` : ''}
                    ${result.status === 'error' && retryCount < this.maxRetries && !result.ediPayload ? 
                        `<button class="btn-icon retry-now" data-action="retry" data-invoice-id="${result.invoiceId}" title="Retry Now">🔄</button>` : ''}
                    <button class="btn-icon dismiss-item" data-action="dismiss" data-unique-key="${result.uniqueKey}" title="Dismiss this result">🗑️</button>
                    <button class="btn-icon collapse-toggle" data-action="collapse-toggle" title="Collapse">−</button>
                </div>
            </div>
            <div class="result-details">
                <div class="step-list">
                    ${result.steps.map(step => this.createStepHTML(step)).join('')}
                </div>
                ${result.validationResult ? this.createValidationSummaryHTML(result.validationResult) : ''}
                ${this.getManualActionSummaryHTML(result)}
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

        // Dismiss button
        const dismissBtn = resultElement.querySelector('[data-action="dismiss"]');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const uniqueKey = dismissBtn.getAttribute('data-unique-key');
                this.dismissResult(uniqueKey);
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

    // Create validation summary HTML for failed EDI
    createValidationSummaryHTML(validationResult) {
        if (!validationResult || !validationResult.hasUndefinedData) {
            return '';
        }

        const fieldsList = validationResult.invalidFields.map(field => 
            `<li><strong>${field.field}:</strong> ${field.originalValue || 'N/A'} → "${field.replacedWith}"</li>`
        ).join('');

        return `
            <div class="validation-summary">
                <div class="validation-header">
                    <span class="validation-icon">⚠️</span>
                    <span class="validation-title">EDI Validation Issues (${validationResult.invalidFieldCount} fields)</span>
                </div>
                <div class="validation-details">
                    <p>The following fields contained undefined values and were replaced:</p>
                    <ul class="validation-fields">${fieldsList}</ul>
                    ${validationResult.warnings && validationResult.warnings.length > 0 ? 
                        `<div class="validation-warnings">
                            <strong>Warnings:</strong>
                            <ul>${validationResult.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
                        </div>` : ''}
                </div>
            </div>
        `;
    }

    // Get manual action badges for result header
    getManualActionBadges(result) {
        const badges = [];
        
        if (result.isManuallyEdited) {
            badges.push(`<span class="manual-badge edited" title="Manually edited on ${this.formatDateTime(result.lastEditedAt)}">✏️ EDITED</span>`);
        }
        
        if (result.manualTransmissionStatus === 'success') {
            badges.push(`<span class="manual-badge transmitted" title="Manually transmitted on ${this.formatDateTime(result.manualTransmissionCompleted)}">📤 SENT</span>`);
        }
        
        if (result.manualTransmissionStatus === 'processing') {
            badges.push(`<span class="manual-badge transmitting" title="Manual transmission in progress">📤 SENDING...</span>`);
        }
        
        if (result.manualTransmissionStatus === 'error') {
            badges.push(`<span class="manual-badge failed" title="Manual transmission failed: ${result.manualTransmissionError}">📤 FAILED</span>`);
        }
        
        return badges.join(' ');
    }

    // Get manual action summary for result details
    getManualActionSummaryHTML(result) {
        const actions = [];
        
        if (result.isManuallyEdited) {
            actions.push({
                icon: '✏️',
                text: 'EDI manually edited',
                time: result.lastEditedAt,
                type: 'edit'
            });
        }
        
        if (result.manualTransmissionCompleted) {
            const status = result.manualTransmissionStatus;
            const icon = status === 'success' ? '✅' : status === 'error' ? '❌' : '📤';
            const text = status === 'success' ? 'EDI manually transmitted' : 
                        status === 'error' ? `Manual transmission failed: ${result.manualTransmissionError}` : 
                        'Manual transmission in progress';
            
            actions.push({
                icon: icon,
                text: text,
                time: result.manualTransmissionCompleted,
                type: status
            });
        }
        
        if (actions.length === 0) {
            return '';
        }
        
        const actionsHTML = actions.map(action => `
            <div class="manual-action ${action.type}">
                <span class="manual-action-icon">${action.icon}</span>
                <span class="manual-action-text">${action.text}</span>
                <span class="manual-action-time">${this.formatDateTime(action.time)}</span>
            </div>
        `).join('');
        
        return `
            <div class="manual-actions-summary">
                <div class="manual-actions-header">Manual Actions</div>
                <div class="manual-actions-list">
                    ${actionsHTML}
                </div>
            </div>
        `;
    }

    // Format date and time for display
    formatDateTime(date) {
        if (!date) return 'Unknown';
        
        try {
            return new Date(date).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        } catch (error) {
            return 'Invalid date';
        }
    }

    // Retry invoice processing
    async retryInvoiceProcessing(invoiceId) {
        const currentRetries = this.retryAttempts.get(invoiceId) || 0;
        
        if (currentRetries >= this.maxRetries) {
            console.warn(`Maximum retries (${this.maxRetries}) reached for invoice ${invoiceId}`);
            return false;
        }

        this.retryAttempts.set(invoiceId, currentRetries + 1);
        
        // Find the most recent failed result
        const results = this.getAllResults();
        const failedResults = results.filter(r => r.invoiceId === invoiceId && r.status === 'error');
        
        let result = null;
        if (failedResults.length > 0) {
            result = failedResults.reduce((latest, current) => {
                return current.startTime > latest.startTime ? current : latest;
            });
            
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
            case 'pending': return '∘';
            case 'not-attempted': return '∘';
            default: return '∘';
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
        
        // Update modal toolbar to show view-only mode
        this.updateEdiModalToolbar(false, uniqueKey);
        
        if (this.ediModal) {
            this.ediModal.classList.add('show');
        }
        
        this.currentEdiUniqueKey = uniqueKey;
        this.isEditMode = false;
    }

    // Show EDI edit modal
    showEditEdiModal(uniqueKey) {
        const result = this.results[uniqueKey];
        if (!result || !result.ediPayload) {
            console.warn(`No EDI payload found for result ${uniqueKey}`);
            return;
        }

        if (this.ediInvoiceNumber) {
            this.ediInvoiceNumber.textContent = result.invoiceId;
        }
        
        // Convert payload display to editable textarea
        if (this.ediPayload) {
            const currentPayload = result.ediPayload;
            this.ediPayload.innerHTML = ''; // Clear existing content
            
            const textarea = document.createElement('textarea');
            textarea.className = 'edi-payload-editor';
            textarea.value = currentPayload;
            textarea.spellcheck = false;
            textarea.autocomplete = 'off';
            
            this.ediPayload.appendChild(textarea);
        }
        
        // Update modal toolbar to show edit mode
        this.updateEdiModalToolbar(true, uniqueKey);
        
        if (this.ediModal) {
            this.ediModal.classList.add('show');
        }
        
        this.currentEdiUniqueKey = uniqueKey;
        this.isEditMode = true;
    }

    // Update EDI modal toolbar based on mode
    updateEdiModalToolbar(isEditMode, uniqueKey) {
        const toolbar = this.ediModal.querySelector('.edi-toolbar');
        if (!toolbar) return;

        if (isEditMode) {
            toolbar.innerHTML = `
                <button type="button" class="btn btn-small" id="copyEdi">Copy to Clipboard</button>
                <button type="button" class="btn btn-small" id="downloadEdi">Download</button>
                <button type="button" class="btn btn-small btn-secondary" id="cancelEditEdi">Cancel</button>
                <button type="button" class="btn btn-small btn-orange" id="saveEdiOnly">Save Only</button>
                <button type="button" class="btn btn-small" id="saveAndTransmitEdi">Save & Transmit</button>
            `;
            
            // Add event listeners for all buttons
            document.getElementById('copyEdi').addEventListener('click', () => this.copyEdiToClipboard());
            document.getElementById('downloadEdi').addEventListener('click', () => this.downloadEdiFile());
            document.getElementById('cancelEditEdi').addEventListener('click', () => {
                this.closeEdiModalHandler();
            });
            document.getElementById('saveEdiOnly').addEventListener('click', () => {
                this.saveEditedEdi(uniqueKey);
            });
            document.getElementById('saveAndTransmitEdi').addEventListener('click', () => {
                this.saveAndTransmitEditedEdi(uniqueKey);
            });
            
        } else {
            toolbar.innerHTML = `
                <button type="button" class="btn btn-small" id="copyEdi">Copy to Clipboard</button>
                <button type="button" class="btn btn-small" id="downloadEdi">Download</button>
            `;
            
            // Add event listeners for view mode buttons
            document.getElementById('copyEdi').addEventListener('click', () => this.copyEdiToClipboard());
            document.getElementById('downloadEdi').addEventListener('click', () => this.downloadEdiFile());
        }
    }

    // Save edited EDI payload
    saveEditedEdi(uniqueKey) {
        const result = this.results[uniqueKey];
        if (!result) {
            console.warn(`No result found for ${uniqueKey}`);
            return;
        }

        const textarea = this.ediPayload.querySelector('.edi-payload-editor');
        if (!textarea) {
            console.warn('No editor found');
            return;
        }

        const editedPayload = textarea.value;
        result.ediPayload = editedPayload;
        result.isManuallyEdited = true;
        result.lastEditedAt = new Date();

        // Switch back to view mode
        this.showEdiModal(uniqueKey);
        this.updateDisplay();
        
        console.log(`EDI payload saved for invoice ${result.invoiceId}`);
    }

    // Save and transmit edited EDI payload
    async saveAndTransmitEditedEdi(uniqueKey) {
        const result = this.results[uniqueKey];
        if (!result) {
            console.warn(`No result found for ${uniqueKey}`);
            return;
        }

        const textarea = this.ediPayload.querySelector('.edi-payload-editor');
        if (!textarea) {
            console.warn('No editor found');
            return;
        }

        const editedPayload = textarea.value;
        
        try {
            // Save the edited payload
            result.ediPayload = editedPayload;
            result.isManuallyEdited = true;
            result.lastEditedAt = new Date();

            // Close modal and show progress
            this.closeEdiModalHandler();
            
            // Attempt manual transmission
            await this.transmitEdiManually(uniqueKey, editedPayload);
            
        } catch (error) {
            console.error(`Failed to save and transmit edited EDI:`, error);
            alert(`Failed to transmit EDI: ${error.message}`);
        }
    }

    // Resend existing EDI payload
    async resendEdiPayload(uniqueKey) {
        const result = this.results[uniqueKey];
        if (!result || !result.ediPayload) {
            console.warn(`No EDI payload found for result ${uniqueKey}`);
            return;
        }

        if (confirm(`Resend EDI for Invoice #${result.invoiceId}?`)) {
            try {
                await this.transmitEdiManually(uniqueKey, result.ediPayload);
            } catch (error) {
                console.error(`Failed to resend EDI:`, error);
                alert(`Failed to resend EDI: ${error.message}`);
            }
        }
    }

    // Manual EDI transmission with status tracking
    async transmitEdiManually(uniqueKey, ediPayload) {
        const result = this.results[uniqueKey];
        if (!result) return;

        console.log(`📤 Manual transmission started for invoice ${result.invoiceId}`);
        
        try {
            // Update result to show manual transmission in progress
            result.manualTransmissionStatus = 'processing';
            result.manualTransmissionStarted = new Date();
            this.updateDisplay();

            // Call the manual transmission function
            const transmissionResult = await window.manuallyTransmitEdi(result.invoiceId, ediPayload);
            
            if (transmissionResult.success) {
                result.manualTransmissionStatus = 'success';
                result.manualTransmissionCompleted = new Date();
                result.lastTransmissionResult = transmissionResult;
                
                console.log(`✅ Manual transmission successful for invoice ${result.invoiceId}`);
                alert(`EDI successfully transmitted for Invoice #${result.invoiceId}`);
            } else {
                throw new Error(transmissionResult.error || 'Manual transmission failed');
            }
            
        } catch (error) {
            result.manualTransmissionStatus = 'error';
            result.manualTransmissionError = error.message;
            result.manualTransmissionCompleted = new Date();
            
            console.error(`❌ Manual transmission failed for invoice ${result.invoiceId}:`, error);
            throw error;
        } finally {
            this.updateDisplay();
        }
    }

    // Close EDI modal
    closeEdiModalHandler() {
        if (this.ediModal) {
            this.ediModal.classList.remove('show');
        }
        this.currentEdiUniqueKey = null;
        this.isEditMode = false;
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
            
            const copyBtn = document.getElementById('copyEdi');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.style.background = 'var(--light-success)';
                copyBtn.style.color = 'var(--success-green)';
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = '';
                    copyBtn.style.color = '';
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

    // Clear filtered results only
    clearAllResults() {
        const filteredResults = this.getFilteredResults();
        const totalResults = this.getResultsCount();
        
        if (totalResults === 0) {
            console.log('No results to clear');
            return;
        }
        
        if (filteredResults.length === 0) {
            console.log('No filtered results to clear');
            return;
        }
        
        const filterNames = Array.from(this.activeFilters).map(f => {
            switch(f) {
                case 'success': return 'successful';
                case 'error': return 'failed';
                case 'manual': return 'manually resolved';
                default: return f;
            }
        });
        
        const confirmMessage = filteredResults.length === totalResults 
            ? 'Are you sure you want to clear all processing results?'
            : `Are you sure you want to clear ${filteredResults.length} ${filterNames.join(' and ')} results?`;
        
        if (confirm(confirmMessage)) {
            // Remove only the filtered results
            filteredResults.forEach(result => {
                delete this.results[result.uniqueKey];
                this.retryAttempts.delete(result.invoiceId);
                this.processingQueue.delete(result.uniqueKey);
            });
            
            this.updateDisplay();
            console.log(`Cleared ${filteredResults.length} filtered results`);
        }
    }

    // NEW: Dismiss individual result
    dismissResult(uniqueKey) {
        const result = this.results[uniqueKey];
        if (!result) {
            console.warn(`Result ${uniqueKey} not found for dismissal`);
            return;
        }
        
        if (confirm(`Dismiss result for Invoice #${result.invoiceId}?`)) {
            // Clean up associated data
            this.retryAttempts.delete(result.invoiceId);
            this.processingQueue.delete(uniqueKey);
            
            // Remove the result
            delete this.results[uniqueKey];
            
            this.updateDisplay();
            console.log(`Dismissed result for invoice ${result.invoiceId}`);
        }
    }

    // Get current statistics with filter information
    getStatistics() {
        const allResults = this.getAllResults();
        const filteredResults = this.getFilteredResults();
        
        const total = allResults.length;
        const successful = allResults.filter(r => this.getResultCategory(r) === 'success').length;
        const failed = allResults.filter(r => this.getResultCategory(r) === 'error').length;
        const manual = allResults.filter(r => this.getResultCategory(r) === 'manual').length;
        const processing = this.processingQueue.size;
        
        return {
            total,
            successful,
            failed,
            manual,
            processing,
            successRate: total > 0 ? (successful / total * 100).toFixed(1) : 0,
            activeFilters: Array.from(this.activeFilters),
            filteredCount: filteredResults.length,
            filterCounts: { ...this.filterCounts }
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

// Filter control functions for external use
window.setResultsFilter = function(filterType) {
    if (window.processingResults && window.processingResults.setFilter) {
        window.processingResults.setFilter(filterType);
    }
};

// Test function for debugging (enhanced with filter testing)
window.addTestResult = function(invoiceId, forceStatus = null) {
    const testId = invoiceId || 'TEST' + Date.now();
    const result = processingResults.startInvoiceProcessing(testId, { test: true });
    
    setTimeout(() => {
        if (forceStatus === 'error') {
            // Create a test error
            processingResults.updateStepStatus(testId, 'invoice', 'success');
            processingResults.failInvoiceProcessing(testId, 'items', 'Test error for filtering demo');
        } else {
            // Create a successful result
            processingResults.updateStepStatus(testId, 'invoice', 'success');
            processingResults.updateStepStatus(testId, 'items', 'success');
            processingResults.updateStepStatus(testId, 'saleorder', 'success');
            processingResults.updateStepStatus(testId, 'edi', 'success');
            processingResults.completeInvoiceProcessing(testId, 'TEST EDI PAYLOAD\nNAD+SU+5060089601212::9+TEST SUPPLIER LTD:Address Line:Address Line:Address Line:POSTCODE\'');
        }
    }, 1000);
};

// Test function to create multiple results for filter testing
window.addTestResultsForFiltering = function() {
    // Add 3 successful results
    for (let i = 1; i <= 3; i++) {
        setTimeout(() => {
            window.addTestResult(`SUCCESS_${i}`);
        }, i * 500);
    }
    
    // Add 2 failed results
    for (let i = 1; i <= 2; i++) {
        setTimeout(() => {
            window.addTestResult(`ERROR_${i}`, 'error');
        }, (i + 3) * 500);
    }
};
// Enhanced Timer Task with credential management and error resilience
// No expiration checks - credentials are permanent until manually cleared
// Added processing lock to prevent concurrent executions

// Use a different variable name to avoid conflicts
const apiEnvironment = 'api.stok.ly';
let isApiInitialized = false;
let consecutiveFailures = 0;
const maxConsecutiveFailures = 5;
let backoffMultiplier = 1;
const maxBackoffMultiplier = 8;

// PROCESSING LOCK - Prevent concurrent executions
let isProcessingActive = false;
let processingStartTime = null;
const maxProcessingTime = 10 * 60 * 1000; // 10 minutes max processing time

// Task execution statistics (sliding window approach)
const taskStats = {
    recentRuns: [], // Keep last 100 runs only
    maxRecentRuns: 100,
    lastSuccessTime: null,
    lastFailureTime: null,
    avgExecutionTime: 0,
    lastExecutionTime: 0
};

// Function to update UI indicator with enhanced status
function updateTaskStatus(isRunning, message = '', details = {}) {
    const statusElement = document.getElementById('taskStatus');
    if (statusElement) {
        if (isRunning) {
            statusElement.textContent = '🔄 Running...';
            statusElement.className = 'task-status running';
        } else {
            statusElement.textContent = message || '⏸️ Idle';
            statusElement.className = getStatusClass(message);
        }
        
        // Add tooltip with additional details
        if (details.tooltip) {
            statusElement.title = details.tooltip;
        }
    }
    
    // Update statistics display if available
    updateStatisticsDisplay();
}

function getStatusClass(message) {
    if (message.includes('✅')) return 'task-status idle success';
    if (message.includes('❌')) return 'task-status idle error';
    if (message.includes('🔒') || message.includes('⚠️')) return 'task-status idle warning';
    return 'task-status idle';
}

function updateStatisticsDisplay() {
    const statsElement = document.getElementById('taskStats');
    if (statsElement && taskStats.recentRuns.length > 0) {
        const successfulRuns = taskStats.recentRuns.filter(run => run.success).length;
        const totalRuns = taskStats.recentRuns.length;
        const successRate = ((successfulRuns / totalRuns) * 100).toFixed(1);
        const avgTime = taskStats.avgExecutionTime > 0 ? (taskStats.avgExecutionTime / 1000).toFixed(1) : 'N/A';
        
        statsElement.innerHTML = `
            <small>
                Success: ${successRate}% | 
                Avg Time: ${avgTime}s
            </small>
        `;
    }
}

// Check if processing has been stuck for too long
function checkForStuckProcessing() {
    if (isProcessingActive && processingStartTime) {
        const processingDuration = Date.now() - processingStartTime;
        if (processingDuration > maxProcessingTime) {
            console.warn(`Processing appears stuck for ${processingDuration / 1000}s, resetting lock`);
            resetProcessingLock();
            return true;
        }
    }
    return false;
}

// Reset processing lock (for recovery from stuck states)
function resetProcessingLock() {
    isProcessingActive = false;
    processingStartTime = null;
    updateTaskStatus(false, '⚠️ Reset from stuck state', {
        tooltip: 'Processing was reset due to timeout'
    });
}

async function handleData() {
    // Check if processing is already active
    if (isProcessingActive) {
        // Check if it's been stuck for too long
        if (!checkForStuckProcessing()) {
            // Quietly skip - no UI updates or logging
            return;
        }
    }
    
    // Set processing lock
    isProcessingActive = true;
    processingStartTime = Date.now();
    
    const startTime = Date.now();
    
    // Set status to running
    updateTaskStatus(true, '', { tooltip: `Task execution started` });
    
    try {
        // Step 1: Wait for credentials to be loaded (FIXED)
        const credentialValidation = await waitForCredentialsAndValidate();
        if (!credentialValidation.isValid) {
            updateTaskStatus(false, credentialValidation.status, {
                tooltip: credentialValidation.message
            });
            recordFailure(credentialValidation.message);
            return;
        }
        
        // Step 2: Check if API functions are available
        if (!window.stoklyAPI) {
            const errorMsg = 'Stokly API not available';
            updateTaskStatus(false, '❌ API unavailable', {
                tooltip: 'API scripts not loaded properly'
            });
            recordFailure(errorMsg);
            return;
        }

        // Step 3: Initialize API if not already done or if we need to re-initialize
        const initResult = await initializeApiIfNeeded();
        if (!initResult.success) {
            updateTaskStatus(false, initResult.status, {
                tooltip: initResult.message
            });
            recordFailure(initResult.message);
            return;
        }
        
        // Step 4: Execute the main task with retry logic
        await executeMainTaskWithRetry();
        
        // Step 5: Record success
        const executionTime = Date.now() - startTime;
        recordSuccess(executionTime);
        
        // Set status to completed
        updateTaskStatus(false, '✅ Complete', {
            tooltip: `Completed in ${(executionTime / 1000).toFixed(1)}s`
        });
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Determine error type and appropriate response
        const errorResponse = categorizeError(error);
        updateTaskStatus(false, errorResponse.status, {
            tooltip: errorResponse.tooltip
        });
        
        recordFailure(error.message, executionTime);
        
        // Handle specific error types
        await handleErrorRecovery(error, errorResponse);
    } finally {
        // Always clear processing lock when done
        isProcessingActive = false;
        processingStartTime = null;
    }
}

// FIXED: Wait for credentials to be properly loaded before validating
async function waitForCredentialsAndValidate(maxAttempts = 10, delayMs = 500) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Check if credentials handler is available
        if (!window.credentialsHandler) {
            if (attempt === maxAttempts) {
                return {
                    isValid: false,
                    status: '❌ No credentials handler',
                    message: 'Credentials handler not initialized'
                };
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
        }
        
        // Try to get API credentials directly from the secure manager
        const apiCredentials = await window.credentialsHandler.getApiCredentials();
        
        if (!apiCredentials) {
            if (attempt === maxAttempts) {
                return {
                    isValid: false,
                    status: '🔒 No credentials',
                    message: 'Please configure API credentials first'
                };
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
        }

        // Validate that we have all required API credential fields
        if (!apiCredentials.clientId || !apiCredentials.secretKey || !apiCredentials.accountKey) {
            if (attempt === maxAttempts) {
                return {
                    isValid: false,
                    status: '🔒 Incomplete credentials',
                    message: 'API credentials are missing required fields'
                };
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
        }

        // Store credentials in the global proxy for compatibility
        if (window.appCredentials) {
            try {
                // This will trigger the proxy to load the credentials
                const isLoaded = window.appCredentials.isLoaded;
                if (!isLoaded) {
                    if (attempt === maxAttempts) {
                        return {
                            isValid: false,
                            status: '🔒 Proxy not ready',
                            message: 'Global credentials proxy not ready'
                        };
                    }
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                }
            } catch (error) {
                if (attempt === maxAttempts) {
                    return {
                        isValid: false,
                        status: '🔒 Proxy error',
                        message: `Credentials proxy error: ${error.message}`
                    };
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
        }

        // All checks passed
        return {
            isValid: true,
            status: '✓ Credentials valid',
            message: 'Credentials are valid and ready'
        };
    }

    // If we get here, all attempts failed
    return {
        isValid: false,
        status: '🔒 Timeout',
        message: 'Timed out waiting for credentials to load'
    };
}

async function initializeApiIfNeeded() {
    try {
        // Check if we need to initialize or re-initialize
        if (!isApiInitialized || consecutiveFailures > 2) {
            
            // Get credentials again to ensure they're fresh
            const apiCredentials = await window.credentialsHandler.getApiCredentials();
            
            if (!apiCredentials) {
                return {
                    success: false,
                    status: '❌ No credentials',
                    message: 'API credentials not available for initialization'
                };
            }

            const initSuccess = await window.stoklyAPI.initializeStoklyAPI({
                accountKey: apiCredentials.accountKey,
                clientId: apiCredentials.clientId,
                secretKey: apiCredentials.secretKey,
                environment: apiEnvironment
            });
            
            if (!initSuccess) {
                return {
                    success: false,
                    status: '❌ Init failed',
                    message: 'Failed to initialize Stokly API'
                };
            }
            
            isApiInitialized = true;
        }
        
        return {
            success: true,
            status: '✓ API ready',
            message: 'API initialized and ready'
        };
        
    } catch (error) {
        isApiInitialized = false;
        
        return {
            success: false,
            status: '❌ Init error',
            message: `API initialization failed: ${error.message}`
        };
    }
}

async function executeMainTaskWithRetry() {
    let retryCount = 0;
    const maxRetries = 3;
    let lastError;
    
    while (retryCount <= maxRetries) {
        try {
            // Execute the main sync task
            await sendData();
            return; // Success, exit retry loop
            
        } catch (error) {
            lastError = error;
            retryCount++;
            
            if (retryCount <= maxRetries) {
                // Calculate exponential backoff delay
                const baseDelay = 1000; // 1 second
                const delay = baseDelay * Math.pow(2, retryCount - 1) * backoffMultiplier;
                const maxDelay = 30000; // 30 seconds max
                const actualDelay = Math.min(delay, maxDelay);
                
                updateTaskStatus(true, `🔄 Retry ${retryCount}/${maxRetries}`, {
                    tooltip: `Retrying after ${actualDelay / 1000}s delay`
                });
                
                await new Promise(resolve => setTimeout(resolve, actualDelay));
            }
        }
    }
    
    // All retries exhausted, throw the last error
    throw new Error(`Task failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

function categorizeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('auth')) {
        return {
            status: '🔒 Auth failed',
            tooltip: 'Authentication failed - credentials may be invalid',
            category: 'auth',
            severity: 'high'
        };
    }
    
    if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
        return {
            status: '🚫 Access denied',
            tooltip: 'Access forbidden - check permissions',
            category: 'permission',
            severity: 'high'
        };
    }
    
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        return {
            status: '⏳ Rate limited',
            tooltip: 'API rate limit exceeded - will retry with backoff',
            category: 'rate_limit',
            severity: 'medium'
        };
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
        return {
            status: '🌐 Network error',
            tooltip: 'Network connectivity issue',
            category: 'network',
            severity: 'medium'
        };
    }
    
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
        return {
            status: '🔧 Server error',
            tooltip: 'Server-side error - will retry',
            category: 'server',
            severity: 'medium'
        };
    }
    
    return {
        status: '❌ Failed',
        tooltip: `Unknown error: ${error.message}`,
        category: 'unknown',
        severity: 'high'
    };
}

async function handleErrorRecovery(error, errorResponse) {
    switch (errorResponse.category) {
        case 'auth':
            // Reset initialization flag to force re-auth
            isApiInitialized = false;
            if (consecutiveFailures > 3) {
                console.warn('Repeated authentication failures - check credentials manually');
            }
            break;
            
        case 'rate_limit':
            // Increase backoff multiplier for future requests
            backoffMultiplier = Math.min(backoffMultiplier * 1.5, maxBackoffMultiplier);
            break;
            
        case 'network':
            // Could implement network connectivity checks here
            break;
            
        case 'server':
            // Server errors are usually temporary
            break;
            
        default:
            // Unknown error category, standard retry logic applies
            break;
    }
}

function recordSuccess(executionTime) {
    // Add to recent runs (sliding window)
    taskStats.recentRuns.push({
        timestamp: Date.now(),
        success: true,
        executionTime: executionTime
    });
    
    // Keep only recent runs
    if (taskStats.recentRuns.length > taskStats.maxRecentRuns) {
        taskStats.recentRuns.shift();
    }
    
    taskStats.lastSuccessTime = Date.now();
    taskStats.lastExecutionTime = executionTime;
    
    // Update average execution time
    if (taskStats.avgExecutionTime === 0) {
        taskStats.avgExecutionTime = executionTime;
    } else {
        taskStats.avgExecutionTime = (taskStats.avgExecutionTime + executionTime) / 2;
    }
    
    // Reset failure tracking on success
    consecutiveFailures = 0;
    backoffMultiplier = 1;
}

function recordFailure(errorMessage, executionTime = 0) {
    // Add to recent runs (sliding window)
    taskStats.recentRuns.push({
        timestamp: Date.now(),
        success: false,
        executionTime: executionTime,
        error: errorMessage
    });
    
    // Keep only recent runs
    if (taskStats.recentRuns.length > taskStats.maxRecentRuns) {
        taskStats.recentRuns.shift();
    }
    
    taskStats.lastFailureTime = Date.now();
    taskStats.lastExecutionTime = executionTime;
    
    consecutiveFailures++;
    
    // If too many consecutive failures, increase backoff and potentially notify
    if (consecutiveFailures >= maxConsecutiveFailures) {
        backoffMultiplier = Math.min(backoffMultiplier * 2, maxBackoffMultiplier);
        
        // Optionally notify user of persistent issues
        if (window.credentialsHandler) {
            window.credentialsHandler.showNotification(
                `Task has failed ${consecutiveFailures} times in a row. Please check credentials and network.`,
                'error'
            );
        }
    }
}

// Enhanced status reporting for debugging
function getTaskHealthStatus() {
    const now = Date.now();
    const health = {
        isHealthy: true,
        issues: [],
        stats: { ...taskStats },
        processing: {
            isActive: isProcessingActive,
            startTime: processingStartTime,
            duration: processingStartTime ? now - processingStartTime : 0
        },
        credentials: {
            available: !!window.appCredentials?.isLoaded,
            status: null
        },
        api: {
            initialized: isApiInitialized,
            consecutiveFailures: consecutiveFailures,
            backoffMultiplier: backoffMultiplier
        }
    };
    
    // Check credential status (no expiration checks)
    if (window.credentialsHandler) {
        health.credentials.status = window.credentialsHandler.getCredentialStatus();
        
        if (!health.credentials.status.exists) {
            health.isHealthy = false;
            health.issues.push('No credentials available');
        }
    }
    
    // Check for high failure rate
    if (taskStats.recentRuns.length > 5) {
        const failedRuns = taskStats.recentRuns.filter(run => !run.success).length;
        const failureRate = failedRuns / taskStats.recentRuns.length;
        if (failureRate > 0.5) {
            health.isHealthy = false;
            health.issues.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
        }
    }
    
    // Check for consecutive failures
    if (consecutiveFailures >= 3) {
        health.isHealthy = false;
        health.issues.push(`${consecutiveFailures} consecutive failures`);
    }
    
    // Check last success time
    if (health.stats.lastSuccessTime) {
        const timeSinceSuccess = now - health.stats.lastSuccessTime;
        if (timeSinceSuccess > 2 * 60 * 60 * 1000) { // 2 hours
            health.isHealthy = false;
            health.issues.push('No successful runs in over 2 hours');
        }
    }
    
    // Check if processing has been running too long
    if (isProcessingActive && processingStartTime) {
        const processingDuration = now - processingStartTime;
        if (processingDuration > maxProcessingTime) {
            health.isHealthy = false;
            health.issues.push('Processing appears stuck');
        }
    }
    
    return health;
}

// Manual control functions for debugging
function forceResetProcessingLock() {
    if (isProcessingActive) {
        console.log('Manually resetting processing lock');
        resetProcessingLock();
        return true;
    }
    return false;
}

function getProcessingStatus() {
    return {
        isActive: isProcessingActive,
        startTime: processingStartTime,
        duration: processingStartTime ? Date.now() - processingStartTime : 0
    };
}

// Expose functions for monitoring and debugging
window.getTaskHealthStatus = getTaskHealthStatus;
window.forceResetProcessingLock = forceResetProcessingLock;
window.getProcessingStatus = getProcessingStatus;

// Export enhanced task execution function
window.handleData = handleData;
// Invoice Tracking Debug Functions
// Add this file to your project or paste into browser console for testing and debugging

// === INVOICE TRACKING DEBUG FUNCTIONS ===

// Get comprehensive tracking statistics
async function getTrackingStats() {
    try {
        const stats = await window.debugInvoiceTracking.getStats();
        const storageInfo = await window.debugInvoiceTracking.getStorageInfo();
        
        console.group('📋 Invoice Tracking Statistics');
        console.log('Memory Stats:', stats);
        console.log('Storage Info:', storageInfo);
        console.log('Debug Flags:', window.debugInvoiceTracking.getDebugFlags());
        console.groupEnd();
        
        return { stats, storageInfo };
    } catch (error) {
        console.error('Failed to get tracking stats:', error);
        return null;
    }
}

// Show where data is stored on the system
async function showStorageLocation() {
    try {
        const info = await window.debugInvoiceTracking.getStorageInfo();
        
        console.group('💾 Invoice Tracking Storage Location');
        
        if (info.storageLocation) {
            console.log('📁 File Location:', info.storageLocation);
            console.log('📊 Total Processed:', info.totalProcessed);
            console.log('🕒 Last Updated:', info.lastUpdated);
            console.log('🧹 Last Cleanup:', info.lastCleanup);
            
            console.log('\n📂 Platform Storage Locations:');
            console.log('  Windows: %APPDATA%\\sync-tool-config\\config.json');
            console.log('  macOS: ~/Library/Application Support/sync-tool-config/config.json');
            console.log('  Linux: ~/.config/sync-tool-config/config.json');
            
            console.log('\n🔍 To find your actual location:');
            console.log('  1. Open your file explorer');
            console.log('  2. Navigate to the path shown above');
            console.log('  3. Look for the "processedInvoices" section in config.json');
        } else if (info.error) {
            console.log('❌ Error getting storage info:', info.error);
            console.log('📝 Data may be stored in memory only');
        } else {
            console.log('📝 Storage location not available - using memory only');
        }
        
        console.groupEnd();
        return info;
    } catch (error) {
        console.error('Failed to show storage location:', error);
        return null;
    }
}

// Export tracking data for inspection
async function exportTrackingData() {
    try {
        const data = await window.debugInvoiceTracking.exportData();
        
        console.group('📤 Exported Invoice Tracking Data');
        console.log('Export Data:', data);
        
        // Also save to file if possible
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-tracking-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        console.log('✅ Data exported to download folder');
        console.groupEnd();
        
        return data;
    } catch (error) {
        console.error('Failed to export tracking data:', error);
        return null;
    }
}

// Check if specific invoices are processed
async function checkInvoiceStatus(...saleInvoiceIds) {
    console.group(`🔍 Checking Status for ${saleInvoiceIds.length} Invoice(s)`);
    
    for (const id of saleInvoiceIds) {
        try {
            const isProcessed = await window.debugInvoiceTracking.isProcessed(id);
            console.log(`Invoice ${id}: ${isProcessed ? '✅ PROCESSED' : '❌ NOT PROCESSED'}`);
        } catch (error) {
            console.log(`Invoice ${id}: ❌ ERROR - ${error.message}`);
        }
    }
    
    console.groupEnd();
}

// Clear tracking history with options
async function clearTrackingHistory(keepRecent = 0) {
    const confirmMessage = keepRecent > 0 
        ? `Clear tracking history, keeping ${keepRecent} most recent entries?`
        : 'Clear ALL tracking history?';
    
    if (confirm(confirmMessage)) {
        try {
            const result = await window.debugInvoiceTracking.clearHistory(keepRecent);
            
            console.group('🧹 Cleared Invoice Tracking History');
            console.log('Cleared:', result.cleared);
            console.log('Remaining:', result.remaining);
            console.log('Original Count:', result.originalCount);
            console.groupEnd();
            
            return result;
        } catch (error) {
            console.error('Failed to clear tracking history:', error);
            return null;
        }
    } else {
        console.log('Clear operation cancelled');
        return null;
    }
}

// Manually mark invoices as processed (for testing)
async function markInvoicesAsProcessed(...saleInvoiceIds) {
    console.group(`📝 Marking ${saleInvoiceIds.length} Invoice(s) as Processed`);
    
    for (const id of saleInvoiceIds) {
        try {
            const wasNew = await window.debugInvoiceTracking.markProcessed(id);
            console.log(`Invoice ${id}: ${wasNew ? '✅ NEWLY MARKED' : '⚠️ ALREADY MARKED'}`);
        } catch (error) {
            console.log(`Invoice ${id}: ❌ ERROR - ${error.message}`);
        }
    }
    
    console.groupEnd();
}

// Show current debug flags and allow modification
function showDebugFlags() {
    const flags = window.debugInvoiceTracking.getDebugFlags();
    
    console.group('🚩 Current Debug Flags');
    Object.entries(flags).forEach(([key, value]) => {
        const icon = typeof value === 'boolean' ? (value ? '✅' : '❌') : '📊';
        console.log(`${icon} ${key}:`, value);
    });
    
    console.log('\n📝 To modify flags, edit DEBUG_FLAGS in sale-invoice-handler.js');
    console.log('🔄 Important flags:');
    console.log('   SKIP_PROCESSED_INVOICES: Controls whether to skip already processed invoices');
    console.log('   LOG_INVOICE_TRACKING: Shows detailed tracking decisions');
    console.log('   FORCE_REPROCESS_COUNT: Forces reprocessing of recent invoices');
    console.log('   ACTUALLY_SEND_TO_FTP: Controls real vs debug mode transmission');
    
    console.groupEnd();
    
    return flags;
}

// Quick test to add some sample processed invoices
async function addTestProcessedInvoices() {
    const testIds = [
        'TEST_INVOICE_001',
        'TEST_INVOICE_002', 
        'TEST_INVOICE_003',
        `SAMPLE_${Date.now()}`
    ];
    
    console.log('🧪 Adding test processed invoices...');
    await markInvoicesAsProcessed(...testIds);
    
    const stats = await getTrackingStats();
    console.log('✅ Test invoices added, updated stats:', stats);
}

// Show help for all debug functions
function showInvoiceTrackingHelp() {
    console.group('📚 Invoice Tracking Debug Help');
    
    console.log('🔧 Available Functions:');
    console.log('');
    console.log('📊 getTrackingStats()');
    console.log('   - Shows comprehensive tracking statistics');
    console.log('');
    console.log('💾 showStorageLocation()');
    console.log('   - Shows where data is stored on your system');
    console.log('');
    console.log('📤 exportTrackingData()');
    console.log('   - Exports all tracking data to JSON file');
    console.log('');
    console.log('🔍 checkInvoiceStatus("ID1", "ID2", ...)');
    console.log('   - Check if specific invoices are processed');
    console.log('   - Example: checkInvoiceStatus("INV001", "INV002")');
    console.log('');
    console.log('🧹 clearTrackingHistory(keepRecent?)');
    console.log('   - Clear tracking history, optionally keep recent N entries');
    console.log('   - Example: clearTrackingHistory(10) // Keep 10 most recent');
    console.log('');
    console.log('📝 markInvoicesAsProcessed("ID1", "ID2", ...)');
    console.log('   - Manually mark invoices as processed (for testing)');
    console.log('   - Example: markInvoicesAsProcessed("TEST001")');
    console.log('');
    console.log('🚩 showDebugFlags()');
    console.log('   - Show current debug flags and their meanings');
    console.log('');
    console.log('🧪 addTestProcessedInvoices()');
    console.log('   - Add some test processed invoices for testing');
    console.log('');
    console.log('💡 Quick Start:');
    console.log('   1. Run showStorageLocation() to see where data is stored');
    console.log('   2. Run getTrackingStats() to see current status'); 
    console.log('   3. Run showDebugFlags() to see processing behavior');
    console.log('   4. Modify DEBUG_FLAGS in sale-invoice-handler.js as needed');
    
    console.groupEnd();
}

// Make functions available globally
window.getTrackingStats = getTrackingStats;
window.showStorageLocation = showStorageLocation;
window.exportTrackingData = exportTrackingData;
window.checkInvoiceStatus = checkInvoiceStatus;
window.clearTrackingHistory = clearTrackingHistory;
window.markInvoicesAsProcessed = markInvoicesAsProcessed;
window.showDebugFlags = showDebugFlags;
window.addTestProcessedInvoices = addTestProcessedInvoices;
window.showInvoiceTrackingHelp = showInvoiceTrackingHelp;

// Show help on load
console.log('📋 Invoice Tracking Debug Functions Loaded!');
console.log('💡 Type showInvoiceTrackingHelp() for help');

// Auto-run basic info
setTimeout(() => {
    console.log('\n🚀 Auto-running basic tracking info...');
    getTrackingStats();
}, 1000);
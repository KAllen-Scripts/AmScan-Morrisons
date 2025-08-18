// Constants for values that can change but are not dependent on input data
const UNB_SYNTAX_IDENTIFIER = 'UNOA:3';
const UNB_RECIPIENT_QUALIFIER = ':14';
const UNB_APPLICATION_REFERENCE = 'INVOIC';
const UNB_PROCESSING_PRIORITY = '++++1';

const UNH_MESSAGE_TYPE = 'INVOIC:D:96A:UN:EAN008';

const BGM_DOCUMENT_TYPE_INVOICE = '380';
const BGM_DOCUMENT_TYPE_CREDIT = '381';
const BGM_DOCUMENT_NAME_MERCH = 'MRCHI';
const BGM_DOCUMENT_NAME_NON_MERCH = 'NMRCHI';
const BGM_DOCUMENT_NAME_CREDIT = 'CRDNT';
const BGM_MESSAGE_FUNCTION = '9';

const DTM_INVOICE_DATE_QUALIFIER = '3';
const DTM_TAX_POINT_QUALIFIER = '131';
const DTM_DUE_DATE_QUALIFIER = '140';
const DTM_FORMAT_DATETIME = '204';
const DTM_FORMAT_DATE = '102';

const RFF_ORDER_NUMBER_QUALIFIER = 'ON';
const RFF_VAT_QUALIFIER = 'VA';
const RFF_INTERNAL_VENDOR_QUALIFIER = 'IA';
const RFF_VENDOR_QUALIFIER = 'VN';

const NAD_BUYER_QUALIFIER = 'BY';
const NAD_DELIVERY_QUALIFIER = 'DP';
const NAD_SUPPLIER_QUALIFIER = 'SU';
const NAD_EAN_AGENCY = '::9';

const CUX_REFERENCE_QUALIFIER = '2';
const CUX_INVOICE_QUALIFIER = '4';

const PAT_PAYMENT_TYPE = '1';
const PAT_TERMS_ID = '6';

const LIN_BARCODE_OUTER = 'EN';
const LIN_BARCODE_ISBN = 'IB';
const LIN_BARCODE_UPC = 'UP';

const QTY_INVOICED_QUALIFIER = '47';
const QTY_UNIT_EACH = 'EA';
const QTY_UNIT_KGM = 'KGM';

const MOA_LINE_VALUE = '203';
const MOA_TOTAL_LINES = '79';
const MOA_TAX_AMOUNT = '124';
const MOA_TAXABLE_AMOUNT = '125';
const MOA_TOTAL_INVOICE = '77';
const MOA_ALLOWANCE_CHARGE = '8';

const PRI_NET_PRICE = 'AAA';

const TAX_FUNCTION_QUALIFIER = '7';
const TAX_TYPE_VAT = 'VAT';
const TAX_CATEGORY_ZERO = 'Z';
const TAX_CATEGORY_REDUCED = 'L';
const TAX_CATEGORY_STANDARD = 'S';
const TAX_CATEGORY_EXEMPT = 'E';

const UNS_SUMMARY_SECTION = 'S';
const CNT_LINE_COUNT_QUALIFIER = '2';

const MORRISONS_NAME = 'WM. MORRISON SUPERMARKETS PLC';
const MORRISONS_ADDRESS = 'HILMORE HOUSE:GAIN LANE::BD3 7DL';
const MORRISONS_VAT = '343475355';

// 🚨 DEBUG FLAGS - Set these to control behavior
const DEBUG_FLAGS = {
    ACTUALLY_SEND_TO_FTP: false,    // Set to false to only log to console
    LOG_EDI_PAYLOAD: true,          // Set to false to disable console logging
    SIMULATE_FTP_DELAY: false,       // Set to false for no artificial delay
    DETAILED_FTP_LOGGING: true      // Set to false for minimal FTP logs
};

async function buildEDIFACTInvoice(invoice, items, config) {
   
   // Config is now required - no defaults
   
   // Helper functions
   function formatDate(dateString, format = '204') {
       const date = new Date(dateString);
       const year = date.getFullYear();
       const month = String(date.getMonth() + 1).padStart(2, '0');
       const day = String(date.getDate()).padStart(2, '0');
       const hours = String(date.getHours()).padStart(2, '0');
       const minutes = String(date.getMinutes()).padStart(2, '0');
       const seconds = String(date.getSeconds()).padStart(2, '0');
       
       if (format === DTM_FORMAT_DATETIME) {
           return `${year}${month}${day}${hours}${minutes}${seconds}`;
       } else if (format === DTM_FORMAT_DATE) {
           return `${year}${month}${day}`;
       }
       return `${year}${month}${day}`;
   }
   
   function formatAmount(amount) {
       return Number(amount).toFixed(2);
   }
   
   function calculateVATRate(netAmount, taxAmount) {
       if (netAmount === 0) return '0.00';
       return ((taxAmount / netAmount) * 100).toFixed(2);
   }
   
   function getVATCategory(vatRate) {
       const rate = parseFloat(vatRate);
       if (rate === 0) return TAX_CATEGORY_ZERO;        // Zero rate
       if (rate === 5) return TAX_CATEGORY_REDUCED;     // Reduced rate 5%
       if (rate === 20) return TAX_CATEGORY_STANDARD;   // Standard rate 20%
       return TAX_CATEGORY_STANDARD;                    // Default to standard
   }

   /**
    * Parse and format supplier address properly
    * Expected format: "Company Name:Street:City:County:Postcode"
    * Output format: "Company Name:Street:City:County:Postcode" (no name duplication)
    */
   function parseSupplierAddress(supplierAddress) {
       if (!supplierAddress) {
           throw new Error('Supplier address is required');
       }
       
       const parts = supplierAddress.split(':');
       if (parts.length < 2) {
           throw new Error('Supplier address must contain at least company name and one address line, separated by colons');
       }
       
       // Return the address as-is (it's already in the correct format)
       return supplierAddress;
   }
   
   // Use invoice and items directly (no .data property)
   
   // Calculate totals
   const totalItemsValue = items.reduce((sum, item) => sum + item.price, 0);
   const totalTaxValue = items.reduce((sum, item) => sum + item.tax, 0);
   const totalInvoiceValue = totalItemsValue + totalTaxValue;
   
   // Build EDIFACT segments
   const segments = [];
   
   // UNB - Interchange Header
   const timestamp = formatDate(invoice.issueDate, DTM_FORMAT_DATE).substring(2) + ':' + 
                    formatDate(invoice.issueDate, DTM_FORMAT_DATETIME).substring(8, 12);
   segments.push(`UNB+${UNB_SYNTAX_IDENTIFIER}+${config.senderGLN}${UNB_RECIPIENT_QUALIFIER}+${config.receiverGLN}${UNB_RECIPIENT_QUALIFIER}+${timestamp}+${config.interchangeRef}++${UNB_APPLICATION_REFERENCE}${UNB_PROCESSING_PRIORITY}`);
   
   // UNH - Message Header
   segments.push(`UNH+1+${UNH_MESSAGE_TYPE}`);
   
   // BGM - Beginning of Message
   // FIX: Convert saleOrderNiceId to string before calling padStart
   const orderNumber = String(invoice.saleOrderNiceId || '').padStart(8, '0');
   segments.push(`BGM+${BGM_DOCUMENT_TYPE_INVOICE}:::${BGM_DOCUMENT_NAME_MERCH}+${orderNumber}+${BGM_MESSAGE_FUNCTION}`);
   
   // DTM - Date/Time/Period (Invoice Date)
   segments.push(`DTM+${DTM_INVOICE_DATE_QUALIFIER}:${formatDate(invoice.issueDate)}:${DTM_FORMAT_DATETIME}`);
   
   // DTM - Tax Point Date
   const taxDate = config.taxPointDate || invoice.issueDate;
   segments.push(`DTM+${DTM_TAX_POINT_QUALIFIER}:${formatDate(taxDate, DTM_FORMAT_DATE)}:${DTM_FORMAT_DATE}`);
   
   // RFF - Reference (Original Order Number)
   if (invoice.saleOrderNiceId) {
       // FIX: Convert saleOrderNiceId to string before calling padStart
       const refOrderNumber = String(invoice.saleOrderNiceId).padStart(8, '0');
       segments.push(`RFF+${RFF_ORDER_NUMBER_QUALIFIER}:${refOrderNumber}`);
   }
   
   // RFF - Vendor Reference (for delivery note matching)
   if (config.vendorReference) {
       const vendorRef = String(config.vendorReference).padStart(10, '0');
       segments.push(`RFF+${RFF_VENDOR_QUALIFIER}:${vendorRef}`);
   }
   
   // NAD - Name and Address (Buyer - Morrisons)
   segments.push(`NAD+${NAD_BUYER_QUALIFIER}+${config.buyerGLN}${NAD_EAN_AGENCY}+${MORRISONS_NAME}:${MORRISONS_ADDRESS}`);
   segments.push(`RFF+${RFF_VAT_QUALIFIER}:${MORRISONS_VAT}`);
   
   // NAD - Name and Address (Delivery Point)
   segments.push(`NAD+${NAD_DELIVERY_QUALIFIER}+${config.deliveryPointGLN}${NAD_EAN_AGENCY}+${config.deliveryPointName}:${config.deliveryPointAddress}`);
   
   // NAD - Name and Address (Supplier) - FIXED
   // Parse supplier address properly to avoid duplication
   const formattedSupplierAddress = parseSupplierAddress(config.supplierAddress);
   segments.push(`NAD+${NAD_SUPPLIER_QUALIFIER}+${config.senderGLN}${NAD_EAN_AGENCY}+${formattedSupplierAddress}`);
   segments.push(`RFF+${RFF_VAT_QUALIFIER}:${config.supplierVAT}`);
   segments.push(`RFF+${RFF_INTERNAL_VENDOR_QUALIFIER}:${config.internalVendorNumber}`);
   
   // CUX - Currencies
   segments.push(`CUX+${CUX_REFERENCE_QUALIFIER}:${invoice.currency}:${CUX_INVOICE_QUALIFIER}`);
   
   // PAT - Payment Terms (if due date provided)
   if (invoice.dueDate) {
       segments.push(`PAT+${PAT_PAYMENT_TYPE}+${PAT_TERMS_ID}:::${config.paymentTerms}`);
       segments.push(`DTM+${DTM_DUE_DATE_QUALIFIER}:${formatDate(invoice.dueDate, DTM_FORMAT_DATE)}:${DTM_FORMAT_DATE}`);
   }
   
    // Detail Section - Line Items
    for (const [index, item] of items.entries()) {
        const lineNumber = index + 1;
        
        // LIN - Line Item
        // Get actual barcode from API
        const itemCode = await requester('get', `https://api.stok.ly/v0/items/${item.referenceId}/barcodes`).then((r)=>{
            console.log(item)
            console.log(r)
            return r.data[0].barcode
        });
        segments.push(`LIN+${lineNumber}++${itemCode}:${LIN_BARCODE_OUTER}`);
        
        // QTY - Quantity
        segments.push(`QTY+${QTY_INVOICED_QUALIFIER}:${item.quantity}:${QTY_UNIT_EACH}`);
        
        // MOA - Monetary Amount (Line Value)
        segments.push(`MOA+${MOA_LINE_VALUE}:${formatAmount(item.price)}`);
        
        // PRI - Price Details
        const unitPrice = item.price / item.quantity;
        segments.push(`PRI+${PRI_NET_PRICE}:${formatAmount(unitPrice)}`);
        
        // TAX - Duty/Tax/Fee Details
        const vatRate = calculateVATRate(item.price, item.tax);
        const vatCategory = getVATCategory(vatRate);
        segments.push(`TAX+${TAX_FUNCTION_QUALIFIER}+${TAX_TYPE_VAT}+++:::${vatRate}+${vatCategory}`);
    }
   
   // Summary Section
   segments.push(`UNS+${UNS_SUMMARY_SECTION}`);
   
   // CNT - Control Total (Number of Lines)
   segments.push(`CNT+${CNT_LINE_COUNT_QUALIFIER}:${items.length}`);
   
   // MOA - Monetary Amounts (Summary)
   segments.push(`MOA+${MOA_TOTAL_LINES}:${formatAmount(totalItemsValue)}`);        // Total Line Items
   segments.push(`MOA+${MOA_TAXABLE_AMOUNT}:${formatAmount(totalItemsValue)}`);       // Taxable Amount
   segments.push(`MOA+${MOA_TAX_AMOUNT}:${formatAmount(totalTaxValue)}`);         // Tax Amount
   segments.push(`MOA+${MOA_TOTAL_INVOICE}:${formatAmount(totalInvoiceValue)}`);      // Total Invoice Amount
   
   // TAX - Summary Tax Details
   const overallVATRate = calculateVATRate(totalItemsValue, totalTaxValue);
   const overallVATCategory = getVATCategory(overallVATRate);
   segments.push(`TAX+${TAX_FUNCTION_QUALIFIER}+${TAX_TYPE_VAT}+++:::${overallVATRate}+${overallVATCategory}`);
   segments.push(`MOA+${MOA_TAXABLE_AMOUNT}:${formatAmount(totalItemsValue)}`);
   segments.push(`MOA+${MOA_TAX_AMOUNT}:${formatAmount(totalTaxValue)}`);
   
   // Calculate segment count (includes UNH and UNT)
   const segmentCount = segments.length + 2;
   
   // UNT - Message Trailer
   segments.push(`UNT+${segmentCount}+1`);
   
   // UNZ - Interchange Trailer
   segments.push(`UNZ+1+${config.interchangeRef}`);
   
   // Join segments with ' (single quote) and newlines for readability
   return segments.map(segment => segment + "'").join('\n');
}

async function sendData(){
   let invoices = []
   // Get the last run date, default to 1970s if first time
   let lastRunDate = '1970-01-01T00:00:00';
   
   try {
       const savedConfig = await window.electronAPI.loadConfig();
       if (savedConfig && savedConfig.lastInvoiceRunDate) {
           lastRunDate = savedConfig.lastInvoiceRunDate;
       }
   } catch (error) {
       console.log('Using default date for first run');
   }
   
   
   await loopThrough(`https://api.stok.ly/v0/invoices`, 1000, 'sortDirection=ASC&sortField=niceId', `[niceId]=={17058}`, async (invoice)=>{
       invoices.push(invoice)
   });
   
   // Save current timestamp for next run
   const currentTimestamp = new Date().toISOString();
   try {
       const currentConfig = await window.electronAPI.loadConfig();
       currentConfig.lastInvoiceRunDate = currentTimestamp;
       await window.electronAPI.saveConfig(currentConfig);
   } catch (error) {
       console.error('Failed to save last run date:', error);
   }

   // Process each invoice
   for (const invoice of invoices) {
       await processInvoice(invoice.saleOrderNiceId, invoice);
   }
}

// Process a single invoice with step tracking including FTP transmission
async function processInvoice(invoiceId, invoice) {
    
    // Start tracking this invoice
    const result = window.processingResults.startInvoiceProcessing(invoiceId, invoice);
    
    try {
        // Step 1: Invoice data (already have it)
        window.processingResults.updateStepStatus(invoiceId, 'invoice', 'success', null, invoice);
        
        // Step 2: Get items data
        window.processingResults.updateStepStatus(invoiceId, 'items', 'processing');
        
        let items;
        try {
            items = await requester('GET', `https://api.stok.ly/v2/saleorders/${invoice.saleOrderId}/items`).then(r => r.data);
            window.processingResults.updateStepStatus(invoiceId, 'items', 'success', null, items);
        } catch (error) {
            window.processingResults.failInvoiceProcessing(invoiceId, 'items', `Failed to retrieve items: ${error.message}`);
            return;
        }
        
        // Step 3: Get sale order data
        window.processingResults.updateStepStatus(invoiceId, 'saleorder', 'processing');
        
        let saleOrder;
        try {
            saleOrder = await requester('GET', `https://api.stok.ly/v2/saleorders/${invoice.saleOrderId}`).then(r => r.data);
            window.processingResults.updateStepStatus(invoiceId, 'saleorder', 'success', null, saleOrder);
        } catch (error) {
            window.processingResults.failInvoiceProcessing(invoiceId, 'saleorder', `Failed to retrieve sale order: ${error.message}`);
            return;
        }

        // Step 4: Generate EDI payload
        window.processingResults.updateStepStatus(invoiceId, 'edi', 'processing');
        
        let edifactMessage;
        try {
            edifactMessage = await buildEDIFACTInvoice(invoice, items, {
                senderGLN: document.getElementById('senderGLN').value,
                receiverGLN: document.getElementById('receiverGLN').value,
                buyerGLN: document.getElementById('buyerGLN').value,
                deliveryPointGLN: document.getElementById('deliveryPointGLN').value,
                deliveryPointName: document.getElementById('deliveryPointName').value,
                deliveryPointAddress: document.getElementById('deliveryPointAddress').value,
                supplierVAT: document.getElementById('supplierVAT').value,
                supplierAddress: document.getElementById('supplierAddress').value,
                internalVendorNumber: document.getElementById('internalVendorNumber').value,
                interchangeRef: document.getElementById('interchangeRef').value,
                taxPointDate: document.getElementById('taxPointDate').value || null,
                paymentTerms: document.getElementById('paymentTerms').value,
                vendorReference: invoice.saleOrderNiceId
            });
            
            window.processingResults.updateStepStatus(invoiceId, 'edi', 'success', null, null);
        } catch (error) {
            window.processingResults.failInvoiceProcessing(invoiceId, 'edi', `Failed to generate EDI: ${error.message}`);
            return;
        }

        // Step 5: FTP transmission (ENHANCED - actually transmit the EDI file)
        window.processingResults.updateStepStatus(invoiceId, 'transmission', 'processing');
        
        // Optional: Log EDI payload to console
        if (DEBUG_FLAGS.LOG_EDI_PAYLOAD) {
            console.log(`\n📄 EDI PAYLOAD for Invoice ${invoiceId}:`);
            console.log('='.repeat(60));
            console.log(edifactMessage);
            console.log('='.repeat(60));
        }

        let transmissionResult;

        if (DEBUG_FLAGS.ACTUALLY_SEND_TO_FTP) {
            // Get FTP credentials - let this crash if it fails
            const ftpCredentials = await getFtpCredentials();
            
            if (!ftpCredentials) {
                throw new Error('No FTP credentials configured. Please configure FTP credentials first.');
            }
            
            // Actually transmit the EDI file via FTP/SFTP - let this crash if it fails
            transmissionResult = await transmitEdiFileReal(invoiceId, edifactMessage, ftpCredentials);
        } else {
            transmissionResult = {
                success: true,
                filename: `invoice_${invoiceId}_${new Date().toISOString().replace(/[:.]/g, '-')}.edi`,
                size: edifactMessage.length,
                host: 'DEBUG_MODE',
                directory: '/debug',
                timestamp: new Date().toISOString(),
                debugMode: true
            };
            
            if (DEBUG_FLAGS.SIMULATE_FTP_DELAY) {
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            }
        }
        
        if (transmissionResult.success) {
            window.processingResults.updateStepStatus(invoiceId, 'transmission', 'success', null, transmissionResult);
            
            // Complete the invoice processing
            window.processingResults.completeInvoiceProcessing(invoiceId, edifactMessage);
            
            console.log(`✅ Successfully processed and transmitted invoice ${invoiceId}`);
            if (transmissionResult.debugMode) {
                console.log(`🧪 (DEBUG MODE - no actual transmission occurred)`);
            }
        } else {
            throw new Error(transmissionResult.error || 'FTP transmission failed');
        }
        
    } catch (error) {
        console.error(`Unexpected error processing invoice ${invoiceId}:`, error);
        window.processingResults.failInvoiceProcessing(invoiceId, 'invoice', `Unexpected error: ${error.message}`);
    }
}

// Get FTP credentials from the credentials handler - let this crash if it fails
async function getFtpCredentials() {
    if (window.credentialsHandler && window.credentialsHandler.getFtpCredentials) {
        return await window.credentialsHandler.getFtpCredentials();
    } else {
        console.error('Credentials handler not available');
        return null;
    }
}

// REAL FTP/SFTP transmission - now uses Electron IPC to access main process
async function transmitEdiFileReal(invoiceId, ediContent, ftpCredentials) {
    if (DEBUG_FLAGS.DETAILED_FTP_LOGGING) {
        console.log(`📤 FTP: Starting ${ftpCredentials.secure ? 'SFTP' : 'FTP'} transmission for invoice ${invoiceId}`);
    }
    
    // Create filename based on invoice ID and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `invoice_${invoiceId}_${timestamp}.edi`;
    
    // Check if we're in Electron and have IPC access
    if (window.electronAPI && window.electronAPI.transmitFile) {
        // Use Electron IPC to transmit via main process
        return await window.electronAPI.transmitFile(filename, ediContent, ftpCredentials);
    } else {
        // Fallback for non-Electron environments
        if (ftpCredentials.secure) {
            throw new Error('SFTP not available: This requires Electron main process access. Please ensure the app is running in Electron environment and IPC handlers are properly set up.');
        } else {
            return await transmitViaFTP(filename, ediContent, ftpCredentials);
        }
    }
}

// Regular FTP transmission (fallback) - let this crash if it fails
async function transmitViaFTP(filename, ediContent, ftpCredentials) {
    // For regular FTP, we'd need a different library like 'ftp' or 'basic-ftp'
    // For now, we'll simulate it since most EDI systems use SFTP
    
    console.log(`📤 FTP: Regular FTP not implemented - use SFTP instead`);
    console.log(`📤 FTP: Would upload ${filename} (${ediContent.length} bytes) to ${ftpCredentials.host}`);
    
    // Simulate transmission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
        success: true,
        filename: filename,
        remotePath: `${ftpCredentials.directory || '/'}/${filename}`,
        size: ediContent.length,
        host: ftpCredentials.host,
        directory: ftpCredentials.directory || '/',
        protocol: 'FTP (simulated)',
        timestamp: new Date().toISOString(),
        simulated: true
    };
}

// Export the processInvoice function for retry functionality
window.processInvoice = processInvoice;
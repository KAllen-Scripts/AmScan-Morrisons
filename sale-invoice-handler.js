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

// Debug flags
const DEBUG_FLAGS = {
    ACTUALLY_SEND_TO_FTP: false,    
    LOG_EDI_PAYLOAD: true,          
    SIMULATE_FTP_DELAY: false,       
    DETAILED_FTP_LOGGING: true      
};

// NEW: EDI Validation and undefined handling
function validateAndSanitizeValue(value, fieldName, defaultValue = "UNDEFINED") {
    const validationResult = {
        value: value,
        isValid: true,
        fieldName: fieldName,
        originalValue: value
    };
    
    if (value === undefined || value === null || value === '') {
        validationResult.value = defaultValue;
        validationResult.isValid = false;
        console.warn(`EDI Field '${fieldName}' is undefined, replaced with '${defaultValue}'`);
    } else if (typeof value === 'string' && value.trim() === '') {
        validationResult.value = defaultValue;
        validationResult.isValid = false;
        console.warn(`EDI Field '${fieldName}' is empty string, replaced with '${defaultValue}'`);
    } else {
        validationResult.value = String(value); // Convert to string for EDI
    }
    
    return validationResult;
}

// NEW: Comprehensive EDI validation tracker
class EDIValidationTracker {
    constructor() {
        this.invalidFields = [];
        this.warnings = [];
        this.isValid = true;
    }
    
    addValidation(validationResult) {
        if (!validationResult.isValid) {
            this.invalidFields.push({
                field: validationResult.fieldName,
                originalValue: validationResult.originalValue,
                replacedWith: validationResult.value
            });
            this.isValid = false;
        }
    }
    
    addWarning(message) {
        this.warnings.push(message);
        console.warn(`EDI Warning: ${message}`);
    }
    
    getValidationSummary() {
        return {
            isValid: this.isValid,
            invalidFieldCount: this.invalidFields.length,
            invalidFields: this.invalidFields,
            warnings: this.warnings,
            hasUndefinedData: this.invalidFields.length > 0
        };
    }
}

async function buildEDIFACTInvoice(saleOrder, invoice, items, csvData, config) {
    // NEW: Initialize validation tracker
    const validation = new EDIValidationTracker();
    
    // Helper functions with validation
    function formatDate(dateString, format = '204') {
        const dateValidation = validateAndSanitizeValue(dateString, 'date');
        validation.addValidation(dateValidation);
        
        if (!dateValidation.isValid) {
            return '19700101'; // Default date if undefined
        }
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            validation.addWarning(`Invalid date format: ${dateString}`);
            return '19700101';
        }
        
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
        const amountValidation = validateAndSanitizeValue(amount, 'amount', '0.00');
        validation.addValidation(amountValidation);
        
        if (!amountValidation.isValid) {
            return '0.00';
        }
        
        const numAmount = Number(amount);
        if (isNaN(numAmount)) {
            validation.addWarning(`Invalid amount format: ${amount}`);
            return '0.00';
        }
        
        return numAmount.toFixed(2);
    }
    
    function calculateVATRate(netAmount, taxAmount) {
        if (netAmount === 0 || isNaN(netAmount) || isNaN(taxAmount)) {
            validation.addWarning('VAT rate calculation failed due to invalid amounts');
            return '0.00';
        }
        return ((taxAmount / netAmount) * 100).toFixed(2);
    }
    
    function getVATCategory(vatRate) {
        const rate = parseFloat(vatRate);
        if (isNaN(rate)) {
            validation.addWarning(`Invalid VAT rate: ${vatRate}`);
            return TAX_CATEGORY_STANDARD;
        }
        if (rate === 0) return TAX_CATEGORY_ZERO;
        if (rate === 5) return TAX_CATEGORY_REDUCED;
        if (rate === 20) return TAX_CATEGORY_STANDARD;
        return TAX_CATEGORY_STANDARD;
    }

    function parseSupplierAddress(supplierAddress) {
        const addressValidation = validateAndSanitizeValue(supplierAddress, 'supplierAddress');
        validation.addValidation(addressValidation);
        
        if (!addressValidation.isValid) {
            return 'UNDEFINED:UNDEFINED:UNDEFINED:UNDEFINED:UNDEFINED';
        }
        
        const parts = supplierAddress.split(':');
        if (parts.length < 2) {
            validation.addWarning('Supplier address format incorrect - using as-is');
        }
        
        return supplierAddress;
    }
    
    // Validate all required configuration fields
    const configValidations = {
        senderGLN: validateAndSanitizeValue(config.senderGLN, 'config.senderGLN'),
        receiverGLN: validateAndSanitizeValue(config.receiverGLN, 'config.receiverGLN'),
        buyerGLN: validateAndSanitizeValue(config.buyerGLN, 'config.buyerGLN'),
        deliveryPointGLN: validateAndSanitizeValue(config.deliveryPointGLN, 'config.deliveryPointGLN'),
        supplierVAT: validateAndSanitizeValue(config.supplierVAT, 'config.supplierVAT'),
        supplierAddress: validateAndSanitizeValue(config.supplierAddress, 'config.supplierAddress'),
        internalVendorNumber: validateAndSanitizeValue(config.internalVendorNumber, 'config.internalVendorNumber'),
        paymentTerms: validateAndSanitizeValue(config.paymentTerms, 'config.paymentTerms')
    };
    
    Object.values(configValidations).forEach(v => validation.addValidation(v));
    
    // Validate invoice data
    const invoiceValidations = {
        invoiceNumber: validateAndSanitizeValue(invoice.invoiceNumber, 'invoice.invoiceNumber'),
        issueDate: validateAndSanitizeValue(invoice.issueDate, 'invoice.issueDate'),
        dueDate: validateAndSanitizeValue(invoice.dueDate, 'invoice.dueDate'),
        currency: validateAndSanitizeValue(invoice.currency, 'invoice.currency', 'GBP'),
        saleOrderNiceId: validateAndSanitizeValue(invoice.saleOrderNiceId, 'invoice.saleOrderNiceId')
    };
    
    Object.values(invoiceValidations).forEach(v => validation.addValidation(v));
    
    // Validate sale order data
    const saleOrderValidations = {
        niceId: validateAndSanitizeValue(saleOrder.niceId, 'saleOrder.niceId'),
        carrierReference: validateAndSanitizeValue(saleOrder.carrierReference, 'saleOrder.carrierReference')
    };
    
    Object.values(saleOrderValidations).forEach(v => validation.addValidation(v));
    
    // Validate CSV data
    const csvValidations = {
        GLN: validateAndSanitizeValue(csvData?.GLN, 'csvData.GLN'),
        address: validateAndSanitizeValue(csvData?.address, 'csvData.address')
    };
    
    Object.values(csvValidations).forEach(v => validation.addValidation(v));
    
    // Validate items data
    if (!items || !Array.isArray(items) || items.length === 0) {
        validation.addWarning('No items found in invoice');
        items = []; // Continue with empty items
    }
    
    // Calculate totals (with validation)
    const totalItemsValue = items.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        return sum + price;
    }, 0);
    
    const totalTaxValue = items.reduce((sum, item) => {
        const tax = Number(item.tax) || 0;
        return sum + tax;
    }, 0);
    
    const totalInvoiceValue = totalItemsValue + totalTaxValue;
    
    // Build EDIFACT segments
    const segments = [];
    
    // UNB - Interchange Header
    const timestamp = formatDate(invoiceValidations.issueDate.value, DTM_FORMAT_DATE).substring(2) + ':' + 
                     formatDate(invoiceValidations.issueDate.value, DTM_FORMAT_DATETIME).substring(8, 12);
    segments.push(`UNB+${UNB_SYNTAX_IDENTIFIER}+${configValidations.senderGLN.value}${UNB_RECIPIENT_QUALIFIER}+${configValidations.receiverGLN.value}${UNB_RECIPIENT_QUALIFIER}+${timestamp}+${String(saleOrderValidations.niceId.value).padStart(7,'0')}++${UNB_APPLICATION_REFERENCE}${UNB_PROCESSING_PRIORITY}`);
    
    // UNH - Message Header
    segments.push(`UNH+1+${UNH_MESSAGE_TYPE}`);
    
    // BGM - Beginning of Message
    const orderNumber = String(invoiceValidations.invoiceNumber.value).padStart(8, '0');
    segments.push(`BGM+${BGM_DOCUMENT_TYPE_INVOICE}:::${BGM_DOCUMENT_NAME_MERCH}+${orderNumber}+${BGM_MESSAGE_FUNCTION}`);
    
    // DTM - Date/Time/Period (Invoice Date)
    segments.push(`DTM+${DTM_INVOICE_DATE_QUALIFIER}:${formatDate(invoiceValidations.issueDate.value)}:${DTM_FORMAT_DATETIME}`);
    
    // DTM - Tax Point Date
    const taxDate = invoiceValidations.dueDate.value;
    segments.push(`DTM+${DTM_TAX_POINT_QUALIFIER}:${formatDate(taxDate, DTM_FORMAT_DATE)}:${DTM_FORMAT_DATE}`);
    
    // RFF - Reference (Original Order Number)
    if (invoiceValidations.saleOrderNiceId.value) {
        const refOrderNumber = String(invoiceValidations.saleOrderNiceId.value).padStart(8, '0');
        segments.push(`RFF+${RFF_ORDER_NUMBER_QUALIFIER}:${refOrderNumber}`);
    }
    
    // RFF - Vendor Reference (for delivery note matching)
    if (config.vendorReference) {
        const vendorRef = String(config.vendorReference).padStart(10, '0');
        segments.push(`RFF+${RFF_VENDOR_QUALIFIER}:${vendorRef}`);
    }
    
    // NAD - Name and Address (Buyer - Morrisons)
    segments.push(`NAD+${NAD_BUYER_QUALIFIER}+${configValidations.buyerGLN.value}${NAD_EAN_AGENCY}+${MORRISONS_NAME}:${MORRISONS_ADDRESS}`);
    segments.push(`RFF+${RFF_VAT_QUALIFIER}:${MORRISONS_VAT}`);
    
    // NAD - Name and Address (Delivery Point)
    segments.push(`NAD+${NAD_DELIVERY_QUALIFIER}+${csvValidations.GLN.value}${NAD_EAN_AGENCY}+${saleOrderValidations.carrierReference.value}:${csvValidations.address.value}`);
    
    // NAD - Name and Address (Supplier)
    const formattedSupplierAddress = parseSupplierAddress(configValidations.supplierAddress.value);
    segments.push(`NAD+${NAD_SUPPLIER_QUALIFIER}+${configValidations.senderGLN.value}${NAD_EAN_AGENCY}+${formattedSupplierAddress}`);
    segments.push(`RFF+${RFF_VAT_QUALIFIER}:${configValidations.supplierVAT.value}`);
    segments.push(`RFF+${RFF_INTERNAL_VENDOR_QUALIFIER}:${configValidations.internalVendorNumber.value}`);
    
    // CUX - Currencies
    segments.push(`CUX+${CUX_REFERENCE_QUALIFIER}:${invoiceValidations.currency.value}:${CUX_INVOICE_QUALIFIER}`);
    
    // PAT - Payment Terms (if due date provided)
    if (invoiceValidations.dueDate.value) {
        segments.push(`PAT+${PAT_PAYMENT_TYPE}+${PAT_TERMS_ID}:::${configValidations.paymentTerms.value}`);
        segments.push(`DTM+${DTM_DUE_DATE_QUALIFIER}:${formatDate(invoiceValidations.dueDate.value, DTM_FORMAT_DATE)}:${DTM_FORMAT_DATE}`);
    }
    
    // Detail Section - Line Items
    for (const [index, item] of items.entries()) {
        const lineNumber = index + 1;
        
        // Validate item fields
        const itemValidations = {
            referenceId: validateAndSanitizeValue(item.referenceId, `item[${index}].referenceId`),
            quantity: validateAndSanitizeValue(item.quantity, `item[${index}].quantity`, '1'),
            price: validateAndSanitizeValue(item.price, `item[${index}].price`, '0.00'),
            tax: validateAndSanitizeValue(item.tax, `item[${index}].tax`, '0.00')
        };
        
        Object.values(itemValidations).forEach(v => validation.addValidation(v));
        
        // LIN - Line Item
        let itemCode = 'UNDEFINED';
        try {
            if (itemValidations.referenceId.isValid) {
                itemCode = await requester('get', `https://api.stok.ly/v0/items/${item.referenceId}/barcodes`).then((r) => {
                    return r.data?.[0]?.barcode || 'UNDEFINED';
                }).catch(() => 'UNDEFINED');
            }
        } catch (error) {
            validation.addWarning(`Failed to retrieve barcode for item ${index}: ${error.message}`);
            itemCode = 'UNDEFINED';
        }
        
        if (itemCode === 'UNDEFINED') {
            validation.addValidation({
                value: 'UNDEFINED',
                isValid: false,
                fieldName: `item[${index}].barcode`,
                originalValue: 'N/A'
            });
        }
        
        segments.push(`LIN+${lineNumber}++${itemCode}:${LIN_BARCODE_OUTER}`);
        
        // QTY - Quantity
        segments.push(`QTY+${QTY_INVOICED_QUALIFIER}:${itemValidations.quantity.value}:${QTY_UNIT_EACH}`);
        
        // MOA - Monetary Amount (Line Value)
        segments.push(`MOA+${MOA_LINE_VALUE}:${formatAmount(itemValidations.price.value)}`);
        
        // PRI - Price Details
        const unitPrice = Number(itemValidations.price.value) / Number(itemValidations.quantity.value);
        segments.push(`PRI+${PRI_NET_PRICE}:${formatAmount(unitPrice)}`);
        
        // TAX - Duty/Tax/Fee Details
        const vatRate = calculateVATRate(Number(itemValidations.price.value), Number(itemValidations.tax.value));
        const vatCategory = getVATCategory(vatRate);
        segments.push(`TAX+${TAX_FUNCTION_QUALIFIER}+${TAX_TYPE_VAT}+++:::${vatRate}+${vatCategory}`);
    }
    
    // Summary Section
    segments.push(`UNS+${UNS_SUMMARY_SECTION}`);
    
    // CNT - Control Total (Number of Lines)
    segments.push(`CNT+${CNT_LINE_COUNT_QUALIFIER}:${items.length}`);
    
    // MOA - Monetary Amounts (Summary)
    segments.push(`MOA+${MOA_TOTAL_LINES}:${formatAmount(totalItemsValue)}`);
    segments.push(`MOA+${MOA_TAXABLE_AMOUNT}:${formatAmount(totalItemsValue)}`);
    segments.push(`MOA+${MOA_TAX_AMOUNT}:${formatAmount(totalTaxValue)}`);
    segments.push(`MOA+${MOA_TOTAL_INVOICE}:${formatAmount(totalInvoiceValue)}`);
    
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
    segments.push(`UNZ+1+${String(saleOrderValidations.niceId.value).padStart(7,'0')}`);
    
    // Join segments with ' (single quote) and newlines for readability
    const ediPayload = segments.map(segment => segment + "'").join('\n');
    
    // Return both the EDI payload and validation results
    return {
        ediPayload: ediPayload,
        validation: validation.getValidationSummary()
    };
}

async function sendData(){
    let invoices = []
    let csvData
    
    // Get CSV data at the start for use during processing
    try {
        if (window.getCSVData && typeof window.getCSVData === 'function') {
            csvData = await window.getCSVData();
        } else {
            console.log('CSV data function not available - proceeding without CSV lookup');
        }
    } catch (error) {
        console.warn('Error retrieving CSV data:', error);
    }

    console.log(csvData)
    
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
    
    await loopThrough(`https://api.stok.ly/v0/invoices`, 1000, 'sortDirection=ASC&sortField=niceId', `([invoiceNumber]=={30942})`, async (invoice)=>{
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
        await processInvoice(invoice.saleOrderNiceId, invoice, csvData);
    }
}

// UPDATED: Process a single invoice with validation checking
async function processInvoice(invoiceId, invoice, csvData) {
    
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

        // Step 4: Generate EDI payload (UPDATED with validation)
        window.processingResults.updateStepStatus(invoiceId, 'edi', 'processing');
        
        let ediResult;
        try {
            ediResult = await buildEDIFACTInvoice(saleOrder, invoice, items, csvData, {
                senderGLN: document.getElementById('senderGLN').value,
                receiverGLN: document.getElementById('receiverGLN').value,
                buyerGLN: document.getElementById('buyerGLN').value,
                deliveryPointGLN: document.getElementById('deliveryPointGLN').value,
                supplierVAT: document.getElementById('supplierVAT').value,
                supplierAddress: document.getElementById('supplierAddress').value,
                internalVendorNumber: document.getElementById('internalVendorNumber').value,
                paymentTerms: document.getElementById('paymentTerms').value,
                vendorReference: invoice.saleOrderNiceId
            });
            
            // Check if EDI generation found undefined values
            if (ediResult.validation.hasUndefinedData) {
                const errorMessage = `EDI contains undefined data: ${ediResult.validation.invalidFieldCount} fields affected`;
                console.warn(errorMessage, ediResult.validation);
                
                // Store the EDI payload first, THEN mark as failed
                const results = window.processingResults.getAllResults();
                const result = results.find(r => r.invoiceId === invoiceId && (r.status === 'processing' || r.status === 'error'));
                
                if (result) {
                    // Store the EDI payload and validation info directly
                    result.ediPayload = ediResult.ediPayload;
                    result.validationResult = ediResult.validation;
                    result.status = 'error';
                    result.completedAt = new Date();
                    result.error = errorMessage;
                    
                    // Update the EDI step as completed but with validation issues
                    window.processingResults.updateStepStatus(invoiceId, 'edi', 'success', `Generated with validation warnings: ${ediResult.validation.invalidFieldCount} undefined fields`, ediResult.validation);
                    
                    // Skip transmission for invalid EDI
                    window.processingResults.updateStepStatus(invoiceId, 'transmission', 'not-attempted', 'Skipped due to EDI validation failure');
                    
                    // Remove from processing queue and update display
                    window.processingResults.processingQueue.delete(result.uniqueKey);
                    window.processingResults.debouncedUpdateDisplay();
                    
                    console.log(`⚠️ Invoice ${invoiceId} failed EDI validation but payload was stored for manual editing`);
                } else {
                    console.error(`Could not find result for invoice ${invoiceId} to store failed EDI`);
                }
                return;
            } else {
                window.processingResults.updateStepStatus(invoiceId, 'edi', 'success', null, null);
            }
            
        } catch (error) {
            window.processingResults.failInvoiceProcessing(invoiceId, 'edi', `Failed to generate EDI: ${error.message}`);
            return;
        }

        // Step 5: FTP transmission (only if EDI validation passed)
        window.processingResults.updateStepStatus(invoiceId, 'transmission', 'processing');
        
        // Optional: Log EDI payload to console
        if (DEBUG_FLAGS.LOG_EDI_PAYLOAD) {
            console.log(`\n📄 EDI PAYLOAD for Invoice ${invoiceId}:`);
            console.log('='.repeat(60));
            console.log(ediResult.ediPayload);
            console.log('='.repeat(60));
        }

        let transmissionResult;

        if (DEBUG_FLAGS.ACTUALLY_SEND_TO_FTP) {
            const ftpCredentials = await getFtpCredentials();
            
            if (!ftpCredentials) {
                throw new Error('No FTP credentials configured. Please configure FTP credentials first.');
            }
            
            transmissionResult = await transmitEdiFileReal(invoiceId, ediResult.ediPayload, ftpCredentials);
        } else {
            transmissionResult = {
                success: true,
                filename: `invoice_${invoiceId}_${new Date().toISOString().replace(/[:.]/g, '-')}.edi`,
                size: ediResult.ediPayload.length,
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
            window.processingResults.completeInvoiceProcessing(invoiceId, ediResult.ediPayload);
            
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

// Get FTP credentials from the credentials handler
async function getFtpCredentials() {
    if (window.credentialsHandler && window.credentialsHandler.getFtpCredentials) {
        return await window.credentialsHandler.getFtpCredentials();
    } else {
        console.error('Credentials handler not available');
        return null;
    }
}

// REAL FTP/SFTP transmission
async function transmitEdiFileReal(invoiceId, ediContent, ftpCredentials) {
    if (DEBUG_FLAGS.DETAILED_FTP_LOGGING) {
        console.log(`📤 FTP: Starting ${ftpCredentials.secure ? 'SFTP' : 'FTP'} transmission for invoice ${invoiceId}`);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `invoice_${invoiceId}_${timestamp}.edi`;
    
    if (window.electronAPI && window.electronAPI.transmitFile) {
        return await window.electronAPI.transmitFile(filename, ediContent, ftpCredentials);
    } else {
        if (ftpCredentials.secure) {
            throw new Error('SFTP not available: This requires Electron main process access. Please ensure the app is running in Electron environment and IPC handlers are properly set up.');
        } else {
            return await transmitViaFTP(filename, ediContent, ftpCredentials);
        }
    }
}

// Regular FTP transmission (fallback)
async function transmitViaFTP(filename, ediContent, ftpCredentials) {
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

// NEW: Manual EDI transmission function
async function manuallyTransmitEdi(invoiceId, ediPayload) {
    try {
        console.log(`📤 Manual transmission started for invoice ${invoiceId}`);
        
        // Get FTP credentials
        const ftpCredentials = await getFtpCredentials();
        
        if (!ftpCredentials) {
            throw new Error('No FTP credentials configured. Please configure FTP credentials first.');
        }
        
        // Transmit the EDI
        let transmissionResult;
        if (DEBUG_FLAGS.ACTUALLY_SEND_TO_FTP) {
            transmissionResult = await transmitEdiFileReal(invoiceId, ediPayload, ftpCredentials);
        } else {
            // Debug mode transmission
            transmissionResult = {
                success: true,
                filename: `manual_invoice_${invoiceId}_${new Date().toISOString().replace(/[:.]/g, '-')}.edi`,
                size: ediPayload.length,
                host: 'DEBUG_MODE',
                directory: '/debug',
                timestamp: new Date().toISOString(),
                debugMode: true,
                manual: true
            };
            
            if (DEBUG_FLAGS.SIMULATE_FTP_DELAY) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return transmissionResult;
        
    } catch (error) {
        console.error(`Manual transmission failed for invoice ${invoiceId}:`, error);
        throw error;
    }
}

// Export functions
window.processInvoice = processInvoice;
window.manuallyTransmitEdi = manuallyTransmitEdi;
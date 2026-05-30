// ─────────────────────────────────────────────────────────────────────────────
// Ink & Seal Notary Pros — Apostille Review Intake
//
// SETUP (one time only):
//   1. Paste this entire file into your existing Code.gs, replacing all content.
//   2. Save (Ctrl+S).
//   3. In the function dropdown, select  setupNewSheet  and click Run.
//   4. Open Execution Log — copy the Sheet ID printed there.
//   5. Paste that Sheet ID into SHEET_ID below, replacing PASTE_NEW_SHEET_ID_HERE.
//   6. Save again.
//   7. Deploy → Manage Deployments → pencil → Version: New version → Deploy.
//      (Your Web App URL does not change.)
// ─────────────────────────────────────────────────────────────────────────────

var SHEET_ID   = 'PASTE_NEW_SHEET_ID_HERE';   // ← fill in after running setupNewSheet
var SHEET_NAME = 'Sheet1';

// 32 columns in exact order — shared by setupNewSheet and doPost
var HEADERS = [
  'Order Number',              'Intake Date',               'Client First Name',
  'Client Last Name',          'Email Address',             'Phone Number',
  'State',                     'Destination Country',       'Issuing State',
  'Document Type',             'Document Count',            'Certified Vital Record',
  'Certified Original Required','Already Notarized',        'RON Needed',
  'Review Type',               'Notes',                     'Signature',
  'Status',                    'Quote Amount',              'Quote Sent Date',
  'Payment Status',            'Payment Received Date',     'Payment Link Sent',
  'Processing Start Date',     'Completion Date',           'Return Shipping Method',
  'Tracking Number',           'Delivery Status',           'Delivery Date',
  'Delivery Confirmed',        'Dropbox Folder Link'
];

// Columns populated from the form.  Admin columns (Status, Quote Amount, etc.)
// are intentionally absent — they stay blank for manual entry in the sheet.
var FIELD_MAP = {
  'Order Number':                function (p, m) { return m.orderNum; },
  'Intake Date':                 function (p, m) { return m.intakeDate; },
  'Client First Name':           function (p, m) { return m.firstName; },
  'Client Last Name':            function (p, m) { return m.lastName; },
  'Email Address':               function (p)    { return p.email                || ''; },
  'Phone Number':                function (p)    { return p.phone                || ''; },
  'State':                       function (p)    { return p.state                || ''; },
  'Destination Country':         function (p)    { return p.destinationCountry   || ''; },
  'Issuing State':               function (p)    { return p.issuingState         || ''; },
  'Document Type':               function (p)    { return p.documentType         || ''; },
  'Document Count':              function (p)    { return p.documentCount        || ''; },
  'Certified Vital Record':      function (p)    { return p.isVitalRecord        || ''; },
  'Certified Original Required': function (p)    { return p.hasCertifiedOriginal || ''; },
  'Already Notarized':           function (p)    { return p.isAlreadyNotarized   || ''; },
  'Review Type':                 function (p, m) { return m.reviewLabel; },
  'Notes':                       function (p)    { return p.notes                || ''; },
  'Signature':                   function (p, m) { return m.sigValue; }
  // Dropbox Folder Link — reserved, not yet implemented
};

// ─────────────────────────────────────────────────────────────────────────────
// doPost — receives form submissions
// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var p     = e.parameter;

    var tz         = Session.getScriptTimeZone();
    var intakeDate = Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy hh:mm a');

    var orderNum = (p.orderNumber || '').trim();
    if (!orderNum) orderNum = generateOrderNumber(sheet);

    var fullName  = (p.fullName || '').trim();
    var spaceIdx  = fullName.indexOf(' ');
    var firstName = spaceIdx > -1 ? fullName.slice(0, spaceIdx)  : fullName;
    var lastName  = spaceIdx > -1 ? fullName.slice(spaceIdx + 1) : '';

    var reviewLabel = (p.sameDayReview || '').toLowerCase().trim() === 'same-day'
      ? 'Same-Day Review'
      : 'Standard Review';

    var sigValue = (p.signature && p.signature.length > 10)
      ? 'Captured — ' + intakeDate
      : '';

    var meta = { orderNum: orderNum, intakeDate: intakeDate,
                 firstName: firstName, lastName: lastName,
                 reviewLabel: reviewLabel, sigValue: sigValue };

    var headers = getHeaders(sheet);
    sheet.appendRow(headers.map(function (h) {
      return FIELD_MAP.hasOwnProperty(h) ? FIELD_MAP[h](p, meta) : '';
    }));

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', order: orderNum }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput('Ink & Seal Notary Pros — script is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ─────────────────────────────────────────────────────────────────────────────
// setupNewSheet — run ONCE from the GAS editor to create the spreadsheet
// ─────────────────────────────────────────────────────────────────────────────
function setupNewSheet() {
  var ss    = SpreadsheetApp.create('Ink & Seal Apostille Tracker');
  var sheet = ss.getActiveSheet();
  sheet.setName(SHEET_NAME);

  // ── Headers ──────────────────────────────────────────────────────────────
  var numCols = HEADERS.length;
  sheet.getRange(1, 1, 1, numCols).setValues([HEADERS]);

  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange
    .setBackground('#0B1829')
    .setFontColor('#C49A4A')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(false);
  sheet.setRowHeight(1, 36);

  // ── Freeze & filter ───────────────────────────────────────────────────────
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, numCols).createFilter();

  // ── Alternating row colors ────────────────────────────────────────────────
  var bandRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=MOD(ROW(),2)=0')
    .setBackground('#F7F4EE')
    .setRanges([sheet.getRange(2, 1, 1000, numCols)])
    .build();
  sheet.setConditionalFormatRules([bandRule]);

  // ── Column widths ─────────────────────────────────────────────────────────
  var widths = {
    1: 160, 2: 150, 3: 120, 4: 120, 5: 210, 6: 130,
    7: 120, 8: 160, 9: 150, 10: 160, 11: 110, 12: 130,
    13: 165, 14: 130, 15: 110, 16: 140, 17: 220, 18: 140,
    19: 140, 20: 110, 21: 130, 22: 130, 23: 150, 24: 140,
    25: 150, 26: 130, 27: 170, 28: 160, 29: 150, 30: 120,
    31: 130, 32: 200
  };
  Object.keys(widths).forEach(function (col) {
    sheet.setColumnWidth(Number(col), widths[col]);
  });

  // ── Data validation dropdowns ─────────────────────────────────────────────
  addDropdown(sheet, 'RON Needed',
    ['Yes', 'No', 'Not Sure']);

  addDropdown(sheet, 'Review Type',
    ['Standard Review', 'Same-Day Review']);

  addDropdown(sheet, 'Status',
    ['Review Pending', 'Quote Sent', 'Awaiting Documents', 'Awaiting Payment',
     'Processing', 'Completed', 'Shipped', 'Delivered', 'Closed', 'Cancelled']);

  addDropdown(sheet, 'Payment Status',
    ['Unpaid', 'Invoice Sent', 'Partially Paid', 'Paid', 'Refunded']);

  addDropdown(sheet, 'Return Shipping Method',
    ['USPS Priority', 'USPS Express', 'FedEx Overnight', 'UPS Overnight',
     'Client Provided Label', 'International Shipping', 'Local Pickup']);

  addDropdown(sheet, 'Delivery Status',
    ['Pending Shipment', 'Shipped', 'In Transit', 'Delivered',
     'Returned', 'Delivery Exception']);

  addDropdown(sheet, 'Delivery Confirmed', ['Yes', 'No']);

  // ── Currency formatting ───────────────────────────────────────────────────
  setColumnFormat(sheet, 'Quote Amount', '$#,##0.00');

  // ── Date formatting ───────────────────────────────────────────────────────
  ['Quote Sent Date', 'Payment Received Date', 'Payment Link Sent',
   'Processing Start Date', 'Completion Date', 'Delivery Date'].forEach(function (col) {
    setColumnFormat(sheet, col, 'MM/dd/yyyy');
  });

  // ── Log the result ────────────────────────────────────────────────────────
  Logger.log('Sheet created: ' + ss.getName());
  Logger.log('URL: '          + ss.getUrl());
  Logger.log('');
  Logger.log('>>> SHEET ID — paste this into SHEET_ID at the top of Code.gs:');
  Logger.log(ss.getId());
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getHeaders(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return HEADERS;
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

function addDropdown(sheet, colName, options) {
  var col = HEADERS.indexOf(colName) + 1;
  if (!col) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, col, 1000, 1).setDataValidation(rule);
}

function setColumnFormat(sheet, colName, format) {
  var col = HEADERS.indexOf(colName) + 1;
  if (!col) return;
  sheet.getRange(2, col, 1000, 1).setNumberFormat(format);
}

function generateOrderNumber(sheet) {
  var tz   = Session.getScriptTimeZone();
  var yymm = Utilities.formatDate(new Date(), tz, 'yyyyMM');
  var seq  = String(Math.max(sheet.getLastRow(), 1)).padStart(4, '0');
  return 'INS-' + yymm + '-' + seq;
}

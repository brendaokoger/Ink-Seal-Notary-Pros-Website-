// ─────────────────────────────────────────────────────────────────────────────
// Ink & Seal Notary Pros — Apostille Review Intake
//
// doPost / doGet — live Web App (do NOT redeploy unless doPost changes)
//
// One-time setup functions:
//   setupNewSheet()         — creates a brand-new spreadsheet (first time only)
//   setupApostilleTracker() — enhances an existing sheet: adds columns,
//                             dropdowns, conditional colors, dashboard, etc.
//
// To run setupApostilleTracker:
//   1. Open your Google Apps Script project.
//   2. In the function dropdown (top toolbar), select  setupApostilleTracker.
//   3. Click Run.  Authorize if prompted.
//   4. Check Execution Log for completion message.
//   No redeployment needed — this function does not affect the Web App.
// ─────────────────────────────────────────────────────────────────────────────

var SHEET_ID   = '1qf9R3QLeL8gGCcFuWa0BrVIGmPm_uBqft4cDkuaZ7gI';
var SHEET_NAME = 'Sheet1';

// 32 base columns — shared by setupNewSheet and doPost
var HEADERS = [
  'Order Number',               'Intake Date',                'Client First Name',
  'Client Last Name',           'Email Address',              'Phone Number',
  'State',                      'Destination Country',        'Issuing State',
  'Document Type',              'Document Count',             'Certified Vital Record',
  'Certified Original Required','Already Notarized',          'RON Needed',
  'Review Type',                'Notes',                      'Signature',
  'Status',                     'Quote Amount',               'Quote Sent Date',
  'Payment Status',             'Payment Received Date',      'Payment Link Sent',
  'Processing Start Date',      'Completion Date',            'Return Shipping Method',
  'Tracking Number',            'Delivery Status',            'Delivery Date',
  'Delivery Confirmed',         'Dropbox Folder Link'
];

// Columns populated from the form.  Admin columns stay blank for manual entry.
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
// setupNewSheet — run ONCE to create a brand-new spreadsheet
// ─────────────────────────────────────────────────────────────────────────────
function setupNewSheet() {
  var ss    = SpreadsheetApp.create('Ink & Seal Apostille Tracker');
  var sheet = ss.getActiveSheet();
  sheet.setName(SHEET_NAME);

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

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, numCols).createFilter();

  var bandRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=MOD(ROW(),2)=0')
    .setBackground('#F7F4EE')
    .setRanges([sheet.getRange(2, 1, 1000, numCols)])
    .build();
  sheet.setConditionalFormatRules([bandRule]);

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

  addDropdown(sheet, 'RON Needed',           ['Yes', 'No', 'Not Sure']);
  addDropdown(sheet, 'Review Type',          ['Standard Review', 'Same-Day Review']);
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

  setColumnFormat(sheet, 'Quote Amount', '$#,##0.00');
  ['Quote Sent Date', 'Payment Received Date', 'Payment Link Sent',
   'Processing Start Date', 'Completion Date', 'Delivery Date'].forEach(function (col) {
    setColumnFormat(sheet, col, 'MM/dd/yyyy');
  });

  Logger.log('Sheet created: ' + ss.getName());
  Logger.log('URL: '          + ss.getUrl());
  Logger.log('');
  Logger.log('>>> SHEET ID — paste into SHEET_ID at the top of Code.gs:');
  Logger.log(ss.getId());
}

// ─────────────────────────────────────────────────────────────────────────────
// setupApostilleTracker — enhances the existing sheet (safe to re-run)
//   • Adds Review Outcome, Assigned To, Last Updated, Internal Notes columns
//   • Applies all dropdowns, conditional colors, date/currency formats
//   • Protects the header row (warning-only)
//   • Creates / refreshes the Dashboard tab
// ─────────────────────────────────────────────────────────────────────────────
function setupApostilleTracker() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

  // ── Add new columns at the far right if they don't exist ─────────────
  var newCols = [
    { name: 'Review Outcome', width: 180 },
    { name: 'Assigned To',    width: 120 },
    { name: 'Last Updated',   width: 150 },
    { name: 'Internal Notes', width: 240 }
  ];
  var liveHeaders = getHeaders(sheet);
  newCols.forEach(function (c) {
    if (liveHeaders.indexOf(c.name) === -1) {
      var col = (sheet.getLastColumn() || 0) + 1;
      sheet.getRange(1, col).setValue(c.name);
      sheet.setColumnWidth(col, c.width);
      liveHeaders.push(c.name);
    }
  });
  var numCols = liveHeaders.length;

  // Column index (1-based) from the live header row
  function colOf(name) {
    var i = liveHeaders.indexOf(name);
    return i === -1 ? 0 : i + 1;
  }

  // ── Header row formatting ─────────────────────────────────────────────
  var hRange = sheet.getRange(1, 1, 1, numCols);
  hRange
    .setBackground('#0B1829')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(false);
  sheet.setRowHeight(1, 36);

  // ── Freeze row 1 and rebuild filter ──────────────────────────────────
  sheet.setFrozenRows(1);
  var existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, 1, numCols).createFilter();

  // ── Dropdowns ─────────────────────────────────────────────────────────
  function setDV(colName, options) {
    var col = colOf(colName);
    if (!col) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(options, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, col, 1000, 1).setDataValidation(rule);
  }

  setDV('Document Type', [
    'Birth Certificate', 'Marriage Certificate', 'Death Certificate',
    'Divorce Decree', 'Court Document', 'FBI Background Check',
    'Diploma', 'Transcript', 'Passport Copy', "Driver's License Copy",
    'Power of Attorney', 'Affidavit', 'Business Document',
    'Articles of Incorporation', 'Certificate of Good Standing',
    'Adoption Document', 'Medical Document', 'Other'
  ]);
  setDV('Document Count',             ['1','2','3','4','5','6+']);
  setDV('Certified Vital Record',     ['Yes','No','Not Sure']);
  setDV('Certified Original Required',['Yes','No','Not Sure']);
  setDV('Already Notarized',          ['Yes','No','Not Sure']);
  setDV('RON Needed',                 ['Yes','No','Not Sure']);
  setDV('Review Type',                ['Standard Review','Same-Day Review']);
  setDV('Status', [
    'Review Pending','Quote Sent','Awaiting Documents','Awaiting Payment',
    'Processing','Completed','Shipped','Delivered','Closed','Cancelled'
  ]);
  setDV('Payment Status',
    ['Unpaid','Invoice Sent','Partially Paid','Paid','Refunded']);
  setDV('Return Shipping Method', [
    'USPS Priority','USPS Express','FedEx Overnight','UPS Overnight',
    'Client Provided Label','International Shipping','Local Pickup'
  ]);
  setDV('Delivery Status', [
    'Pending Shipment','Shipped','In Transit','Delivered','Returned','Delivery Exception'
  ]);
  setDV('Delivery Confirmed', ['Yes','No']);
  setDV('Review Outcome', [
    'Pending Review','Approved for Apostille','Additional Documents Needed',
    'RON Required','Certified Original Required','Not Eligible'
  ]);
  setDV('Assigned To', ['Brenda','VA 1','VA 2','Unassigned']);

  // ── Conditional formatting ─────────────────────────────────────────────
  // Column-specific color rules listed first (highest priority).
  // Alternating row rule is last so column colors override it.
  var rules = [];
  var DATA_ROWS = 1000;

  function colorRule(col, text, bg) {
    if (!col) return;
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(text)
        .setBackground(bg)
        .setRanges([sheet.getRange(2, col, DATA_ROWS, 1)])
        .build()
    );
  }

  // Status
  var sCol = colOf('Status');
  colorRule(sCol, 'Review Pending',     '#FFF9C4');  // yellow
  colorRule(sCol, 'Quote Sent',         '#BBDEFB');  // blue
  colorRule(sCol, 'Awaiting Documents', '#FFE0B2');  // orange
  colorRule(sCol, 'Awaiting Payment',   '#FFE0B2');  // orange
  colorRule(sCol, 'Processing',         '#E1BEE7');  // purple
  colorRule(sCol, 'Completed',          '#C8E6C9');  // green
  colorRule(sCol, 'Shipped',            '#BBDEFB');  // blue
  colorRule(sCol, 'Delivered',          '#A5D6A7');  // dark green
  colorRule(sCol, 'Closed',             '#C8E6C9');  // green
  colorRule(sCol, 'Cancelled',          '#FFCDD2');  // red

  // Payment Status
  var pCol = colOf('Payment Status');
  colorRule(pCol, 'Unpaid',         '#FFCDD2');  // red
  colorRule(pCol, 'Invoice Sent',   '#FFF9C4');  // yellow
  colorRule(pCol, 'Partially Paid', '#FFE0B2');  // orange
  colorRule(pCol, 'Paid',           '#C8E6C9');  // green
  colorRule(pCol, 'Refunded',       '#F5F5F5');  // gray

  // Review Outcome
  var rCol = colOf('Review Outcome');
  colorRule(rCol, 'Pending Review',              '#FFF9C4');  // yellow
  colorRule(rCol, 'Approved for Apostille',      '#C8E6C9');  // green
  colorRule(rCol, 'Additional Documents Needed', '#FFE0B2');  // orange
  colorRule(rCol, 'RON Required',                '#E1BEE7');  // purple
  colorRule(rCol, 'Certified Original Required', '#BBDEFB');  // blue
  colorRule(rCol, 'Not Eligible',                '#FFCDD2');  // red

  // Delivery Status
  var dCol = colOf('Delivery Status');
  colorRule(dCol, 'Pending Shipment',   '#FFF9C4');  // yellow
  colorRule(dCol, 'Shipped',            '#BBDEFB');  // blue
  colorRule(dCol, 'In Transit',         '#E1BEE7');  // purple
  colorRule(dCol, 'Delivered',          '#C8E6C9');  // green
  colorRule(dCol, 'Returned',           '#FFE0B2');  // orange
  colorRule(dCol, 'Delivery Exception', '#FFCDD2');  // red

  // Alternating rows (lowest priority — overridden by column rules above)
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=MOD(ROW(),2)=0')
      .setBackground('#F7F4EE')
      .setRanges([sheet.getRange(2, 1, DATA_ROWS, numCols)])
      .build()
  );

  sheet.setConditionalFormatRules(rules);

  // ── Currency and date formats ──────────────────────────────────────────
  function setFmt(colName, fmt) {
    var col = colOf(colName);
    if (!col) return;
    sheet.getRange(2, col, 1000, 1).setNumberFormat(fmt);
  }

  setFmt('Quote Amount', '$#,##0.00');
  [
    'Intake Date', 'Quote Sent Date', 'Payment Received Date',
    'Payment Link Sent', 'Processing Start Date', 'Completion Date',
    'Delivery Date', 'Last Updated'
  ].forEach(function (c) { setFmt(c, 'MM/dd/yyyy'); });

  // ── Protect header row (warning only — won't lock out editors) ────────
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  protections.forEach(function (p) {
    if (p.getRange().getRow() === 1 && p.getRange().getNumRows() === 1) p.remove();
  });
  sheet.getRange(1, 1, 1, numCols)
    .protect()
    .setDescription('Header row — do not edit')
    .setWarningOnly(true);

  // ── Dashboard tab ─────────────────────────────────────────────────────
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) {
    dash = ss.insertSheet('Dashboard');
  } else {
    dash.clearContents();
    dash.clearFormats();
  }

  // Title banner
  dash.getRange(1, 1, 1, 3).merge()
    .setValue('Ink & Seal Apostille Tracker — Dashboard')
    .setBackground('#0B1829')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(13)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  dash.setRowHeight(1, 44);

  // Spacer row
  dash.setRowHeight(2, 8);

  // Column headers (row 3)
  dash.getRange('A3').setValue('Metric');
  dash.getRange('B3').setValue('Count');
  dash.getRange(3, 1, 1, 2)
    .setBackground('#0B1829')
    .setFontColor('#C49A4A')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle');
  dash.setRowHeight(3, 30);

  // Metric rows (starting at row 4)
  var SN  = SHEET_NAME;            // 'Sheet1'
  var SC  = columnLetter(colOf('Status'));       // status column letter
  var RTC = columnLetter(colOf('Review Type'));  // review type column letter

  var metrics = [
    ['Total Orders',     '=COUNTA(' + SN + '!A:A)-1'],
    ['Pending Reviews',  '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Review Pending")'],
    ['Same-Day Reviews', '=COUNTIF(' + SN + '!' + RTC + ':' + RTC + ',"Same-Day Review")'],
    ['Awaiting Payment', '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Awaiting Payment")'],
    ['Processing',       '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Processing")'],
    ['Completed',        '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Completed")'],
    ['Shipped',          '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Shipped")'],
    ['Delivered',        '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Delivered")'],
    ['Cancelled',        '=COUNTIF(' + SN + '!' + SC  + ':' + SC  + ',"Cancelled")']
  ];

  metrics.forEach(function (row, i) {
    var r = i + 4;
    dash.getRange(r, 1).setValue(row[0]);
    dash.getRange(r, 2).setFormula(row[1]);
    dash.setRowHeight(r, 28);
    if (i % 2 === 1) {
      dash.getRange(r, 1, 1, 2).setBackground('#F7F4EE');
    }
  });

  // Format count column as integer
  dash.getRange(4, 2, metrics.length, 1).setNumberFormat('0');

  // Column widths and freeze
  dash.setColumnWidth(1, 200);
  dash.setColumnWidth(2, 80);
  dash.setFrozenRows(3);

  // ── Done ──────────────────────────────────────────────────────────────
  Logger.log('setupApostilleTracker complete.');
  Logger.log('Sheet: ' + sheet.getName() + ' — ' + numCols + ' columns');
  Logger.log('Dashboard formulas use Status col: ' + SC + ', Review Type col: ' + RTC);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getHeaders(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return HEADERS.slice();
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

// Converts a 1-based column index to a spreadsheet letter (1→A, 27→AA, etc.)
function columnLetter(col) {
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter  = String.fromCharCode(65 + rem) + letter;
    col     = Math.floor((col - 1) / 26);
  }
  return letter;
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

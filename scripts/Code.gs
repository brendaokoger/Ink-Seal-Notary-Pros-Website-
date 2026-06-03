// ─────────────────────────────────────────────────────────────────────────────
// Ink & Seal Notary Pros — Apostille Review Intake
//
// LIVE WEB APP FUNCTIONS  (do NOT redeploy unless doPost changes)
//   doPost()   — receives form submissions from apostille-review.html
//   doGet()    — health-check endpoint
//
// SETUP FUNCTIONS  (run once from the GAS editor — no redeployment needed)
//   setupNewSheet()         — creates a brand-new spreadsheet
//   setupApostilleTracker() — enhances an existing sheet
//
// ── How to run setupApostilleTracker ─────────────────────────────────────────
//   1. Paste this file into your Apps Script project (replace all).
//   2. Save  (Ctrl+S / Cmd+S).
//   3. In the function dropdown at the top, choose  setupApostilleTracker.
//   4. Click Run.  Approve any permission prompt.
//   5. Check Execution Log — look for "setupApostilleTracker complete."
//   No redeployment required.  doPost and the Web App URL are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

var SHEET_ID   = '1qf9R3QLeL8gGCcFuWa0BrVIGmPm_uBqft4cDkuaZ7gI';
var SHEET_NAME = 'ink_seal_apostille_tracker (1)';

// 32 base columns — order must match the Google Sheet header row
var HEADERS = [
  'Order Number',                'Intake Date',                 'Client First Name',
  'Client Last Name',            'Email Address',               'Phone Number',
  'State',                       'Destination Country',         'Issuing State',
  'Document Type',               'Document Count',              'Certified Vital Record',
  'Certified Original Required', 'Already Notarized',           'RON Needed',
  'Review Type',                 'Notes',                       'Signature',
  'Status',                      'Quote Amount',                'Quote Sent Date',
  'Payment Status',              'Payment Received Date',       'Payment Link Sent',
  'Processing Start Date',       'Completion Date',             'Return Shipping Method',
  'Tracking Number',             'Delivery Status',             'Delivery Date',
  'Delivery Confirmed',          'Dropbox Folder Link'
];

// Maps form field names → sheet values.  Admin-only columns are left blank.
var FIELD_MAP = {
  'Order Number':                function (p, m) { return m.orderNum;               },
  'Intake Date':                 function (p, m) { return m.intakeDate;             },
  'Client First Name':           function (p, m) { return m.firstName;              },
  'Client Last Name':            function (p, m) { return m.lastName;               },
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
  'Review Type':                 function (p, m) { return m.reviewLabel;             },
  'Notes':                       function (p)    { return p.notes                || ''; },
  'Signature':                   function (p, m) { return m.sigValue;               },
  'Dropbox Folder Link':         function (p)    { return p.dropboxFolderLink    || ''; }
};

// ─────────────────────────────────────────────────────────────────────────────
// doPost — receives apostille review form submissions
// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  // Route JSON payloads (Google Drive file uploads) to handleFileUpload.
  // URL-encoded payloads (normal form submissions) fall through to the existing handler below.
  if (e.postData && e.postData.type === 'application/json') {
    try {
      var jsonBody = JSON.parse(e.postData.contents);
      if (jsonBody.action === 'upload_files') return handleFileUpload(jsonBody);
    } catch (_) { /* invalid JSON — fall through to form handler */ }
  }

  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var p     = e.parameter;

    Logger.log('=== doPost called ===');
    Logger.log('Spreadsheet ID   : ' + SHEET_ID);
    Logger.log('Spreadsheet name : ' + ss.getName());
    Logger.log('SHEET_NAME const : ' + SHEET_NAME);
    Logger.log('Worksheet opened : ' + sheet.getName());
    Logger.log('Rows before append: ' + sheet.getLastRow());

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

    var meta = {
      orderNum: orderNum, intakeDate: intakeDate,
      firstName: firstName, lastName: lastName,
      reviewLabel: reviewLabel, sigValue: sigValue
    };

    var headers = getHeaders(sheet);
    sheet.appendRow(headers.map(function (h) {
      return FIELD_MAP.hasOwnProperty(h) ? FIELD_MAP[h](p, meta) : '';
    }));

    Logger.log('appendRow complete — row number: ' + sheet.getLastRow());
    Logger.log('Order: ' + orderNum + ' | Name: ' + fullName);

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
// handleFileUpload — called by doPost when the JSON body contains action:'upload_files'
//
// 1. Finds (or creates) the shared parent folder "Ink & Seal Apostille Uploads" in Drive.
// 2. Creates a per-order subfolder: "INS-YYYYMM-#### - Client Full Name"
// 3. Decodes each base64 file and saves it inside the order folder.
// 4. Writes the folder URL back to the matching row in the Google Sheet
//    (searches the "Order Number" column; writes to "Dropbox Folder Link" or
//    "Document Upload Folder Link" — whichever header is present in the live sheet).
// ─────────────────────────────────────────────────────────────────────────────
function handleFileUpload(p) {
  try {
    var orderNumber = (p.orderNumber || '').trim();
    var clientName  = (p.clientName  || 'Unknown Client').trim();
    var files       = p.files || [];

    // 1. Find or create the shared parent folder
    var parentName   = 'Ink & Seal Apostille Uploads';
    var parentIter   = DriveApp.getFoldersByName(parentName);
    var parentFolder = parentIter.hasNext()
                       ? parentIter.next()
                       : DriveApp.createFolder(parentName);

    // 2. Create the per-order subfolder: "INS-YYYYMM-#### - Client Full Name"
    var folderName  = orderNumber ? (orderNumber + ' - ' + clientName) : clientName;
    var orderFolder = parentFolder.createFolder(folderName);

    // 3. Decode and save each file
    var uploadCount = 0;
    files.forEach(function (f) {
      var dataUrl = f.data || '';
      var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;
      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], f.name);
      orderFolder.createFile(blob);
      uploadCount++;
    });

    // 4. Get the Drive folder URL
    var folderUrl = orderFolder.getUrl();

    // 5. Write the folder URL back to the matching sheet row
    if (orderNumber) {
      var ss    = SpreadsheetApp.openById(SHEET_ID);
      var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
      var hdrs  = getHeaders(sheet);

      var oCol = hdrs.indexOf('Order Number') + 1;
      // Accept both the old Dropbox column name and a renamed column
      var lColIdx = hdrs.indexOf('Document Upload Folder Link');
      if (lColIdx === -1) lColIdx = hdrs.indexOf('Dropbox Folder Link');
      var lCol = lColIdx + 1;

      if (oCol > 0 && lCol > 0 && sheet.getLastRow() > 1) {
        var orderVals = sheet.getRange(2, oCol, sheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < orderVals.length; i++) {
          if (String(orderVals[i][0]).trim() === orderNumber) {
            sheet.getRange(i + 2, lCol).setValue(folderUrl);
            break;
          }
        }
      }
    }

    Logger.log('handleFileUpload: order=' + orderNumber + ' client=' + clientName +
               ' uploads=' + uploadCount + ' url=' + folderUrl);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, folderLink: folderUrl, uploadCount: uploadCount }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleFileUpload error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// setupNewSheet — run ONCE to create a brand-new spreadsheet from scratch
// ─────────────────────────────────────────────────────────────────────────────
function setupNewSheet() {
  var ss    = SpreadsheetApp.create('Ink & Seal Apostille Tracker');
  var sheet = ss.getActiveSheet();
  sheet.setName(SHEET_NAME);

  var numCols = HEADERS.length;
  sheet.getRange(1, 1, 1, numCols).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, numCols)
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
    1:160, 2:150, 3:120, 4:120, 5:210, 6:130,
    7:120, 8:160, 9:150, 10:160, 11:110, 12:130,
    13:165, 14:130, 15:110, 16:140, 17:220, 18:140,
    19:140, 20:110, 21:130, 22:130, 23:150, 24:140,
    25:150, 26:130, 27:170, 28:160, 29:150, 30:120,
    31:130, 32:200
  };
  Object.keys(widths).forEach(function (col) {
    sheet.setColumnWidth(Number(col), widths[col]);
  });

  addDropdown(sheet, 'RON Needed',           ['Yes','No','Not Sure']);
  addDropdown(sheet, 'Review Type',          ['Standard Review','Same-Day Review']);
  addDropdown(sheet, 'Status', [
    'Review Pending','Quote Sent','Awaiting Documents','Awaiting Payment',
    'Processing','Completed','Shipped','Delivered','Closed','Cancelled'
  ]);
  addDropdown(sheet, 'Payment Status',
    ['Unpaid','Invoice Sent','Partially Paid','Paid','Refunded']);
  addDropdown(sheet, 'Return Shipping Method', [
    'USPS Priority','USPS Express','FedEx Overnight','UPS Overnight',
    'Client Provided Label','International Shipping','Local Pickup'
  ]);
  addDropdown(sheet, 'Delivery Status', [
    'Pending Shipment','Shipped','In Transit','Delivered','Returned','Delivery Exception'
  ]);
  addDropdown(sheet, 'Delivery Confirmed', ['Yes','No']);

  setColumnFormat(sheet, 'Quote Amount', '$#,##0.00');
  ['Quote Sent Date','Payment Received Date','Payment Link Sent',
   'Processing Start Date','Completion Date','Delivery Date'].forEach(function (c) {
    setColumnFormat(sheet, c, 'MM/dd/yyyy');
  });

  Logger.log('Sheet created: ' + ss.getName());
  Logger.log('URL: '          + ss.getUrl());
  Logger.log('>>> Paste this Sheet ID into SHEET_ID at the top of Code.gs:');
  Logger.log(ss.getId());
}

// ─────────────────────────────────────────────────────────────────────────────
// setupApostilleTracker — enhances an existing sheet (safe to re-run)
//
//  What it does:
//   1. Adds Review Outcome, Assigned To, Last Updated, Internal Notes columns
//      at the far right (skips any that already exist — no data is lost).
//   2. Creates dropdowns for Review Outcome and Assigned To only.
//   3. Applies conditional color rules for Status, Payment Status,
//      Review Outcome, and Delivery Status columns.
//   4. Formats the header row (navy / white / bold), freezes row 1,
//      rebuilds the column filter, and applies alternating ivory row banding.
//   5. Formats Quote Amount as currency; formats date columns.
//   6. Applies a warning-only protection to the header row.
//   7. Creates (or refreshes) a Dashboard tab with 9 live COUNTIF metrics.
// ─────────────────────────────────────────────────────────────────────────────
function setupApostilleTracker() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

  // ── 1. Add new columns at the far right if missing ───────────────────
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

  // Returns the 1-based column number for a header name, or 0 if missing
  function colOf(name) {
    var i = liveHeaders.indexOf(name);
    return i === -1 ? 0 : i + 1;
  }

  // ── 2. Header row formatting ──────────────────────────────────────────
  sheet.getRange(1, 1, 1, numCols)
    .setBackground('#0B1829')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(false);
  sheet.setRowHeight(1, 36);

  // ── 3. Freeze row 1 and rebuild filter ───────────────────────────────
  sheet.setFrozenRows(1);
  var existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, 1, numCols).createFilter();

  // ── 4. Dropdowns — new columns only ──────────────────────────────────
  function dropdown(colName, options) {
    var col = colOf(colName);
    if (!col) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(options, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, col, 1000, 1).setDataValidation(rule);
  }

  dropdown('Review Outcome', [
    'Pending Review',
    'Approved for Apostille',
    'Additional Documents Needed',
    'RON Required',
    'Certified Original Required',
    'Not Eligible'
  ]);

  dropdown('Assigned To', ['Brenda', 'VA 1', 'VA 2', 'Unassigned']);

  // ── 5. Conditional formatting ─────────────────────────────────────────
  // Rules added first have the highest priority.
  // Column-specific color rules come before the row-banding rule so they win.
  var rules  = [];
  var ROWS   = 1000;

  function colorRule(col, text, bg) {
    if (!col) return;
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(text)
        .setBackground(bg)
        .setRanges([sheet.getRange(2, col, ROWS, 1)])
        .build()
    );
  }

  // Status column
  var sCol = colOf('Status');
  colorRule(sCol, 'Review Pending',     '#FFF9C4'); // yellow
  colorRule(sCol, 'Quote Sent',         '#BBDEFB'); // blue
  colorRule(sCol, 'Awaiting Documents', '#FFE0B2'); // orange
  colorRule(sCol, 'Awaiting Payment',   '#FFE0B2'); // orange
  colorRule(sCol, 'Processing',         '#E1BEE7'); // purple
  colorRule(sCol, 'Completed',          '#C8E6C9'); // green
  colorRule(sCol, 'Shipped',            '#BBDEFB'); // blue
  colorRule(sCol, 'Delivered',          '#A5D6A7'); // dark green
  colorRule(sCol, 'Closed',             '#C8E6C9'); // green
  colorRule(sCol, 'Cancelled',          '#FFCDD2'); // red

  // Payment Status column
  var pCol = colOf('Payment Status');
  colorRule(pCol, 'Unpaid',         '#FFCDD2'); // red
  colorRule(pCol, 'Invoice Sent',   '#FFF9C4'); // yellow
  colorRule(pCol, 'Partially Paid', '#FFE0B2'); // orange
  colorRule(pCol, 'Paid',           '#C8E6C9'); // green
  colorRule(pCol, 'Refunded',       '#F5F5F5'); // gray

  // Review Outcome column
  var rCol = colOf('Review Outcome');
  colorRule(rCol, 'Pending Review',              '#FFF9C4'); // yellow
  colorRule(rCol, 'Approved for Apostille',      '#C8E6C9'); // green
  colorRule(rCol, 'Additional Documents Needed', '#FFE0B2'); // orange
  colorRule(rCol, 'RON Required',                '#E1BEE7'); // purple
  colorRule(rCol, 'Certified Original Required', '#BBDEFB'); // blue
  colorRule(rCol, 'Not Eligible',                '#FFCDD2'); // red

  // Delivery Status column
  var dCol = colOf('Delivery Status');
  colorRule(dCol, 'Pending Shipment',   '#FFF9C4'); // yellow
  colorRule(dCol, 'Shipped',            '#BBDEFB'); // blue
  colorRule(dCol, 'In Transit',         '#E1BEE7'); // purple
  colorRule(dCol, 'Delivered',          '#C8E6C9'); // green
  colorRule(dCol, 'Returned',           '#FFE0B2'); // orange
  colorRule(dCol, 'Delivery Exception', '#FFCDD2'); // red

  // Alternating ivory rows — lowest priority (column colors override it)
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=MOD(ROW(),2)=0')
      .setBackground('#F7F4EE')
      .setRanges([sheet.getRange(2, 1, ROWS, numCols)])
      .build()
  );

  sheet.setConditionalFormatRules(rules);

  // ── 6. Currency and date formats ──────────────────────────────────────
  function setFmt(colName, fmt) {
    var col = colOf(colName);
    if (col) sheet.getRange(2, col, 1000, 1).setNumberFormat(fmt);
  }

  setFmt('Quote Amount', '$#,##0.00');
  ['Intake Date', 'Quote Sent Date', 'Payment Received Date',
   'Processing Start Date', 'Completion Date', 'Delivery Date',
   'Last Updated'].forEach(function (c) { setFmt(c, 'MM/dd/yyyy'); });

  // ── 7. Protect header row (warning-only) ─────────────────────────────
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  protections.forEach(function (p) {
    if (p.getRange().getRow() === 1 && p.getRange().getNumRows() === 1) p.remove();
  });
  sheet.getRange(1, 1, 1, numCols)
    .protect()
    .setDescription('Header row — do not edit')
    .setWarningOnly(true);

  // ── 8. Dashboard tab ──────────────────────────────────────────────────
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
  dash.setRowHeight(2, 8); // thin spacer

  // Sub-header row
  dash.getRange(3, 1).setValue('Metric');
  dash.getRange(3, 2).setValue('Count');
  dash.getRange(3, 1, 1, 2)
    .setBackground('#0B1829')
    .setFontColor('#C49A4A')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle');
  dash.setRowHeight(3, 30);
  dash.setFrozenRows(3);

  // Build COUNTIF formulas using the actual column letters
  var SN  = SHEET_NAME;
  var SC  = colLetter(colOf('Status'));
  var RC  = colLetter(colOf('Review Type'));

  var metrics = [
    ['Total Orders',     '=COUNTA(' + SN + '!A:A)-1'],
    ['Pending Reviews',  '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Review Pending")'],
    ['Same-Day Reviews', '=COUNTIF(' + SN + '!' + RC + ':' + RC + ',"Same-Day Review")'],
    ['Awaiting Payment', '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Awaiting Payment")'],
    ['Processing',       '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Processing")'],
    ['Completed',        '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Completed")'],
    ['Shipped',          '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Shipped")'],
    ['Delivered',        '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Delivered")'],
    ['Cancelled',        '=COUNTIF(' + SN + '!' + SC + ':' + SC + ',"Cancelled")']
  ];

  metrics.forEach(function (row, i) {
    var r = i + 4;
    dash.getRange(r, 1).setValue(row[0]);
    dash.getRange(r, 2).setFormula(row[1]);
    dash.setRowHeight(r, 28);
    if (i % 2 === 1) dash.getRange(r, 1, 1, 2).setBackground('#F7F4EE');
  });

  dash.getRange(4, 2, metrics.length, 1).setNumberFormat('0');
  dash.setColumnWidth(1, 200);
  dash.setColumnWidth(2, 80);

  // ── Done ──────────────────────────────────────────────────────────────
  Logger.log('setupApostilleTracker complete.');
  Logger.log('Tracker sheet : ' + sheet.getName() + ' (' + numCols + ' columns)');
  Logger.log('Status col    : ' + SC + '   Review Type col: ' + RC);
  Logger.log('Dashboard     : ' + dash.getName());
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboard — run from the GAS editor to refresh the Dashboard tab
// ─────────────────────────────────────────────────────────────────────────────
function buildDashboard() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

  var liveHeaders = getHeaders(sheet);
  function colOf(name) {
    var i = liveHeaders.indexOf(name);
    return i === -1 ? 0 : i + 1;
  }
  function cl(name) { return colLetter(colOf(name)); }

  var SN = SHEET_NAME;
  var SC  = cl('Status');
  var PC  = cl('Payment Status');
  var QC  = cl('Quote Amount');
  var RC  = cl('Review Type');
  var OC  = cl('RON Needed');
  var PSC = cl('Processing Start Date');
  var CC  = cl('Completion Date');
  var HC  = cl('Destination Country');
  var GC  = cl('State');
  var DC  = cl('Document Type');
  var FNC = cl('Client First Name');
  var LNC = cl('Client Last Name');
  var AC  = cl('Order Number');

  var dash = ss.getSheetByName('Dashboard');
  if (!dash) {
    dash = ss.insertSheet('Dashboard');
    ss.setActiveSheet(dash);
    ss.moveActiveSheet(ss.getNumSheets());
  } else {
    dash.clearContents();
    dash.clearFormats();
    dash.clearNotes();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function navy(range) {
    range.setBackground('#0B1829').setFontColor('#FFFFFF').setFontWeight('bold');
  }
  function gold(range) {
    range.setBackground('#0B1829').setFontColor('#C49A4A').setFontWeight('bold');
  }
  function sectionHdr(row, col, span, label) {
    var r = dash.getRange(row, col, 1, span).merge();
    r.setValue(label)
     .setBackground('#0B1829')
     .setFontColor('#FFFFFF')
     .setFontWeight('bold')
     .setFontSize(11)
     .setVerticalAlignment('middle')
     .setHorizontalAlignment('left');
    dash.setRowHeight(row, 36);
    return row + 1;
  }
  function colHdr(row, col, labels) {
    labels.forEach(function(lbl, i) {
      dash.getRange(row, col + i).setValue(lbl);
    });
    gold(dash.getRange(row, col, 1, labels.length));
    dash.setRowHeight(row, 28);
    return row + 1;
  }
  function dataRow(row, col, values, isFormula, shade) {
    values.forEach(function(v, i) {
      var cell = dash.getRange(row, col + i);
      if (isFormula && typeof v === 'string' && v.charAt(0) === '=') {
        cell.setFormula(v);
      } else {
        cell.setValue(v);
      }
    });
    if (shade) dash.getRange(row, col, 1, values.length).setBackground('#F7F4EE');
    dash.setRowHeight(row, 26);
    return row + 1;
  }
  function spacer(row) {
    dash.setRowHeight(row, 10);
    return row + 1;
  }

  // ── Column widths ────────────────────────────────────────────────────────
  dash.setColumnWidth(1, 220);
  dash.setColumnWidth(2, 110);
  dash.setColumnWidth(3, 30);
  dash.setColumnWidth(4, 220);
  dash.setColumnWidth(5, 110);

  // ── Title bar ────────────────────────────────────────────────────────────
  dash.getRange(1, 1, 1, 5).merge()
    .setValue('Ink & Seal Notary Pros — Apostille Operations Dashboard')
    .setBackground('#0B1829')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(14)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  dash.setRowHeight(1, 48);

  var r = 2;
  r = spacer(r);

  // ════════════════════════════════════════════════════════════════════════
  // SECTION A — Executive Summary (cols 1-2)  |  SECTION B — Order Workload (cols 4-5)
  // ════════════════════════════════════════════════════════════════════════
  var rA = r;
  var rB = r;

  // Section A header
  dash.getRange(rA, 1, 1, 2).merge()
    .setValue('Executive Summary')
    .setBackground('#0B1829').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setVerticalAlignment('middle').setHorizontalAlignment('left');
  dash.setRowHeight(rA, 36);
  rA++;

  gold(dash.getRange(rA, 1, 1, 2));
  dash.getRange(rA, 1).setValue('Metric');
  dash.getRange(rA, 2).setValue('Value');
  dash.setRowHeight(rA, 28);
  rA++;

  var sumExec = [
    ['Total Orders',      '=IFERROR(COUNTA(' + SN + '!' + AC + ':' + AC + ')-1,0)'],
    ['Total Revenue',     '=IFERROR(SUM(' + SN + '!' + QC + ':' + QC + '),0)'],
    ['Paid Revenue',      '=IFERROR(SUMIF(' + SN + '!' + PC + ':' + PC + ',"Paid",' + SN + '!' + QC + ':' + QC + '),0)'],
    ['Unpaid Revenue',    '=IFERROR(SUMIF(' + SN + '!' + PC + ':' + PC + ',"Unpaid",' + SN + '!' + QC + ':' + QC + '),0)']
  ];
  sumExec.forEach(function(row, i) {
    dash.getRange(rA, 1).setValue(row[0]);
    dash.getRange(rA, 2).setFormula(row[1]);
    if (i > 0) dash.getRange(rA, 2).setNumberFormat('$#,##0.00');
    if (i % 2 === 1) dash.getRange(rA, 1, 1, 2).setBackground('#F7F4EE');
    dash.setRowHeight(rA, 26);
    rA++;
  });

  // Section B header
  dash.getRange(rB, 4, 1, 2).merge()
    .setValue('Order Workload')
    .setBackground('#0B1829').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(11).setVerticalAlignment('middle').setHorizontalAlignment('left');
  dash.setRowHeight(rB, 36);
  rB++;

  gold(dash.getRange(rB, 4, 1, 2));
  dash.getRange(rB, 4).setValue('Status');
  dash.getRange(rB, 5).setValue('Count');
  dash.setRowHeight(rB, 28);
  rB++;

  var workload = [
    'Review Pending','Quote Sent','Awaiting Documents',
    'Awaiting Payment','Processing','Completed','Shipped',
    'Delivered','Closed','Cancelled'
  ];
  workload.forEach(function(status, i) {
    dash.getRange(rB, 4).setValue(status);
    dash.getRange(rB, 5).setFormula(
      '=IFERROR(COUNTIF(' + SN + '!' + SC + ':' + SC + ',"' + status + '"),0)'
    );
    if (i % 2 === 1) dash.getRange(rB, 4, 1, 2).setBackground('#F7F4EE');
    dash.setRowHeight(rB, 26);
    rB++;
  });

  r = Math.max(rA, rB);
  r = spacer(r);

  // ════════════════════════════════════════════════════════════════════════
  // SECTION C — Operations
  // ════════════════════════════════════════════════════════════════════════
  r = sectionHdr(r, 1, 5, 'Operations');
  gold(dash.getRange(r, 1, 1, 2));
  dash.getRange(r, 1).setValue('Metric');
  dash.getRange(r, 2).setValue('Value');
  dash.setRowHeight(r, 28);
  r++;

  var ops = [
    ['Requiring RON',
      '=IFERROR(COUNTIF(' + SN + '!' + OC + ':' + OC + ',"Yes"),0)'],
    ['Avg Processing Time (days)',
      '=IFERROR(AVERAGEIF(' + SN + '!' + CC + ':' + CC + ','
      + '">"&DATE(2000,1,1),' + SN + '!' + CC + ':' + CC + '-' + SN + '!' + PSC + ':' + PSC + '),"—")'],
    ['Avg Quote Amount',
      '=IFERROR(AVERAGEIF(' + SN + '!' + QC + ':' + QC + ','
      + '">"&0,' + SN + '!' + QC + ':' + QC + '),"—")'],
    ['Outstanding Balance',
      '=IFERROR(SUMIF(' + SN + '!' + PC + ':' + PC + ',"Unpaid",' + SN + '!' + QC + ':' + QC + ')'
      + '+SUMIF(' + SN + '!' + PC + ':' + PC + ',"Invoice Sent",' + SN + '!' + QC + ':' + QC + ')'
      + '+SUMIF(' + SN + '!' + PC + ':' + PC + ',"Partially Paid",' + SN + '!' + QC + ':' + QC + '),0)']
  ];
  ops.forEach(function(row, i) {
    dash.getRange(r, 1).setValue(row[0]);
    var cell = dash.getRange(r, 2);
    cell.setFormula(row[1]);
    if (i === 2 || i === 3) cell.setNumberFormat('$#,##0.00');
    if (i % 2 === 1) dash.getRange(r, 1, 1, 2).setBackground('#F7F4EE');
    dash.setRowHeight(r, 26);
    r++;
  });

  r = spacer(r);

  // ════════════════════════════════════════════════════════════════════════
  // SECTION D — Business Intelligence (3 QUERY tables side-by-side)
  // ════════════════════════════════════════════════════════════════════════
  r = sectionHdr(r, 1, 5, 'Business Intelligence');

  // BI table helper — places a 2-col QUERY table at (startRow, col)
  function biTable(startRow, col, title, qFormula, colALabel, colBLabel) {
    dash.getRange(startRow, col, 1, 2).merge()
      .setValue(title)
      .setBackground('#1A2E4A').setFontColor('#C49A4A')
      .setFontWeight('bold').setFontSize(10)
      .setVerticalAlignment('middle');
    dash.setRowHeight(startRow, 30);

    gold(dash.getRange(startRow + 1, col, 1, 2));
    dash.getRange(startRow + 1, col).setValue(colALabel);
    dash.getRange(startRow + 1, col + 1).setValue(colBLabel);
    dash.setRowHeight(startRow + 1, 26);

    dash.getRange(startRow + 2, col).setFormula(qFormula);
    return startRow;
  }

  var biRow = r;
  biTable(biRow, 1, 'Orders by Country',
    '=IFERROR(QUERY(' + SN + '!' + HC + ':' + HC + ',"SELECT ' + HC + ', COUNT(' + HC + ') WHERE ' + HC + ' <> \'\' GROUP BY ' + HC + ' ORDER BY COUNT(' + HC + ') DESC LABEL ' + HC + ' \'Country\', COUNT(' + HC + ') \'Orders\'",0),"No data")',
    'Country', 'Orders'
  );
  biTable(biRow, 4, 'Orders by State',
    '=IFERROR(QUERY(' + SN + '!' + GC + ':' + GC + ',"SELECT ' + GC + ', COUNT(' + GC + ') WHERE ' + GC + ' <> \'\' GROUP BY ' + GC + ' ORDER BY COUNT(' + GC + ') DESC LABEL ' + GC + ' \'State\', COUNT(' + GC + ') \'Orders\'",0),"No data")',
    'State', 'Orders'
  );

  // Top document types on its own row below
  r = biRow + 12;
  r = spacer(r);
  sectionHdr(r, 1, 5, '');
  dash.getRange(r, 1, 1, 4).merge()
    .setValue('Top Document Types')
    .setBackground('#1A2E4A').setFontColor('#C49A4A')
    .setFontWeight('bold').setFontSize(10)
    .setVerticalAlignment('middle');
  dash.setRowHeight(r, 30);
  r++;

  gold(dash.getRange(r, 1, 1, 2));
  dash.getRange(r, 1).setValue('Document Type');
  dash.getRange(r, 2).setValue('Orders');
  dash.setRowHeight(r, 26);
  r++;

  dash.getRange(r, 1).setFormula(
    '=IFERROR(QUERY(' + SN + '!' + DC + ':' + DC + ',"SELECT ' + DC + ', COUNT(' + DC + ') WHERE ' + DC + ' <> \'\' GROUP BY ' + DC + ' ORDER BY COUNT(' + DC + ') DESC LABEL ' + DC + ' \'Document Type\', COUNT(' + DC + ') \'Orders\'",0),"No data")'
  );

  r = r + 12;
  r = spacer(r);

  // ════════════════════════════════════════════════════════════════════════
  // SECTION E — Recent Activity (last 10 orders)
  // ════════════════════════════════════════════════════════════════════════
  r = sectionHdr(r, 1, 6, 'Recent Activity (Last 10 Orders)');

  dash.setColumnWidth(6, 100);

  gold(dash.getRange(r, 1, 1, 6));
  ['Order #', 'Client Name', 'Country', 'Status', 'Payment', 'Quote'].forEach(function(h, i) {
    dash.getRange(r, i + 1).setValue(h);
  });
  dash.setRowHeight(r, 28);
  r++;

  for (var i = 0; i < 10; i++) {
    // Row offset from bottom: 1 = most recent
    var offset = i + 1;
    var shade  = i % 2 === 1;
    var dataR  = String(offset); // used in formula string

    var fA  = '=IFERROR(IF(COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '>=2,INDEX(' + SN + '!' + AC + ':' + AC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1),""),"")';
    var fNm = '=IFERROR(IF(COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '>=2,INDEX(' + SN + '!' + FNC + ':' + FNC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1)&" "&INDEX(' + SN + '!' + LNC + ':' + LNC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1),""),"")';
    var fH  = '=IFERROR(IF(COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '>=2,INDEX(' + SN + '!' + HC + ':' + HC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1),""),"")';
    var fS  = '=IFERROR(IF(COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '>=2,INDEX(' + SN + '!' + SC + ':' + SC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1),""),"")';
    var fP  = '=IFERROR(IF(COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '>=2,INDEX(' + SN + '!' + PC + ':' + PC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1),""),"")';
    var fQ  = '=IFERROR(IF(COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '>=2,INDEX(' + SN + '!' + QC + ':' + QC + ',COUNTA(' + SN + '!' + AC + ':' + AC + ')-' + dataR + '+1),""),"")';

    [fA, fNm, fH, fS, fP, fQ].forEach(function(f, ci) {
      dash.getRange(r, ci + 1).setFormula(f);
    });
    dash.getRange(r, 6).setNumberFormat('$#,##0.00');
    if (shade) dash.getRange(r, 1, 1, 6).setBackground('#F7F4EE');
    dash.setRowHeight(r, 26);
    r++;
  }

  Logger.log('buildDashboard complete — ' + dash.getName());
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

// Reads the actual header row from the sheet (supports columns added after deploy)
function getHeaders(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return HEADERS.slice();
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

// Converts a 1-based column number to a spreadsheet letter (1→A, 27→AA …)
function colLetter(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Used by setupNewSheet for the original 32 columns
function addDropdown(sheet, colName, options) {
  var col = HEADERS.indexOf(colName) + 1;
  if (!col) return;
  sheet.getRange(2, col, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(options, true)
      .setAllowInvalid(false)
      .build()
  );
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

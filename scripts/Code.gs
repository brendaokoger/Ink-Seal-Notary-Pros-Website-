/**
 * Ink & Seal Notary Pros — Apostille Review Intake
 * Last updated: 2026-05-30
 *
 * HOW TO USE
 * 1. In your Google Sheet, go to Extensions → Apps Script.
 * 2. Select everything in Code.gs and delete it.
 * 3. Paste this entire file.
 * 4. Click Save (Ctrl+S).
 * 5. Click Deploy → Manage Deployments.
 * 6. Click the pencil icon on your existing deployment, set Version
 *    to "New version", then click Deploy.
 *    (The web app URL stays the same — no form changes needed.)
 *
 * Sheet: https://docs.google.com/spreadsheets/d/1Kt9KsGlYnpzcjoCYNUBvkWnBxSW5MfJi41gfzP_wYlE
 * Tab:   Sheet1  (change SHEET_NAME below if your tab is named differently)
 */

var SHEET_ID   = '1Kt9KsGlYnpzcjoCYNUBvkWnBxSW5MfJi41gfzP_wYlE';
var SHEET_NAME = 'Sheet1';

// ─────────────────────────────────────────────────────────────────────────────
// FIELD MAP
//
// Keys   = exact Google Sheet column headers (case-sensitive).
// Values = functions that return the cell value for each submitted row.
//
// NOTES ON SPECIFIC FIELDS
// ─────────────────────────────────────────────────────────────────────────────
// Document Count
//   Form field name: documentCount
//   Source: Step 3 radio group — "How many documents are being submitted?"
//   Values: 1, 2, 3, 4, or 5
//   Note: The form also submits uploadedFileCount (Step 4 file count).
//         That field is intentionally NOT mapped here — only the client's
//         stated document count (documentCount) goes to Google Sheets.
//
// Same-Day Review
//   Form field name: sameDayReview
//   Raw values submitted: "standard" or "same-day"
//   Stored as: "Standard Review" or "Same-Day Review"
//
// Already Notarized
//   Form field name: isAlreadyNotarized
//   Values: Yes / No / Not Sure
//
// Upload Files (UploadFile1 – UploadFile5)
//   NOT mapped. File inputs have no name attribute so they are never
//   submitted to GAS. File storage will use Dropbox (added later).
// ─────────────────────────────────────────────────────────────────────────────
var FIELD_MAP = {
  'Order Number':                function (p, m) { return m.orderNum; },
  'Intake Date':                 function (p, m) { return m.intakeDate; },
  'Client First Name':           function (p, m) { return m.firstName; },
  'Client Last Name':            function (p, m) { return m.lastName; },
  'Email Address':               function (p)    { return p.email               || ''; },
  'Phone Number':                function (p)    { return p.phone               || ''; },
  'Destination Country':         function (p)    { return p.destinationCountry  || ''; },
  'Document Type':               function (p)    { return p.documentType        || ''; },
  'Certified Vital Record':      function (p)    { return p.isVitalRecord       || ''; },
  'Certified Original Required': function (p)    { return p.hasCertifiedOriginal|| ''; },
  'Already Notarized':           function (p)    { return p.isAlreadyNotarized  || ''; },
  'Document Count':              function (p)    { return p.documentCount       || ''; },
  'Same-Day Review':             function (p, m) { return m.reviewLabel; },
  'Notes':                       function (p)    { return p.notes               || ''; },
  'Signature':                   function (p, m) { return m.sigValue; }
};

// ─────────────────────────────────────────────────────────────────────────────
// doPost — receives form submission
// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var p     = e.parameter;

    var tz         = Session.getScriptTimeZone();
    var now        = new Date();
    var intakeDate = Utilities.formatDate(now, tz, 'MM/dd/yyyy hh:mm a');

    // Order number — auto-generate when the form leaves it blank
    var orderNum = (p.orderNumber || '').trim();
    if (!orderNum) orderNum = generateOrderNumber(sheet);

    // Split "John Doe" → firstName: "John", lastName: "Doe"
    var fullName  = (p.fullName || '').trim();
    var spaceIdx  = fullName.indexOf(' ');
    var firstName = spaceIdx > -1 ? fullName.slice(0, spaceIdx)  : fullName;
    var lastName  = spaceIdx > -1 ? fullName.slice(spaceIdx + 1) : '';

    // "standard" → "Standard Review", "same-day" → "Same-Day Review"
    var reviewLabel = (p.sameDayReview || '').toLowerCase().trim() === 'same-day'
      ? 'Same-Day Review'
      : 'Standard Review';

    // Store a timestamped note instead of raw base64 canvas data
    var sigValue = (p.signature && p.signature.length > 10)
      ? 'Captured — ' + intakeDate
      : '';

    var meta = {
      orderNum:    orderNum,
      intakeDate:  intakeDate,
      firstName:   firstName,
      lastName:    lastName,
      reviewLabel: reviewLabel,
      sigValue:    sigValue
    };

    // Ensure all required columns exist in row 1, then write the data row
    var headers = resolveHeaders(sheet);
    var row     = buildRow(headers, p, meta);
    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', order: orderNum }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// doGet — smoke-test: open the deployment URL in a browser tab
function doGet() {
  return ContentService
    .createTextOutput('Ink & Seal Notary Pros — Apostille Intake script is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the header row from the sheet.
 * Any column in FIELD_MAP that is missing from row 1 is appended
 * to the far right — existing columns and data are never moved.
 */
function resolveHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers;

  if (sheet.getLastRow() === 0 || lastCol === 0) {
    // Empty sheet — write all headers at once
    headers = Object.keys(FIELD_MAP);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return headers;
  }

  headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  // Add any mapped column that doesn't already exist
  Object.keys(FIELD_MAP).forEach(function (colName) {
    if (headers.indexOf(colName) === -1) {
      headers.push(colName);
      sheet.getRange(1, headers.length).setValue(colName).setFontWeight('bold');
    }
  });

  return headers;
}

/**
 * Builds a data row aligned to the full header array.
 * Columns outside FIELD_MAP receive an empty string so that
 * manually maintained columns (status, notes, etc.) are not overwritten.
 */
function buildRow(headers, p, meta) {
  return headers.map(function (h) {
    return FIELD_MAP.hasOwnProperty(h) ? FIELD_MAP[h](p, meta) : '';
  });
}

/**
 * Generates ISN-YYYYMM-NNNN where NNNN is the current row count,
 * zero-padded to 4 digits.  Always unique within the sheet.
 */
function generateOrderNumber(sheet) {
  var tz       = Session.getScriptTimeZone();
  var yymm     = Utilities.formatDate(new Date(), tz, 'yyyyMM');
  var dataRows = Math.max(sheet.getLastRow(), 1);
  var seq      = String(dataRows).padStart(4, '0');
  return 'ISN-' + yymm + '-' + seq;
}

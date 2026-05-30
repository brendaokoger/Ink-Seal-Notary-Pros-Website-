/**
 * Ink & Seal Notary Pros — Apostille Review Intake
 *
 * Paste this entire file into your Google Apps Script editor
 * (Extensions → Apps Script), replacing any existing code.
 * Then click Deploy → Manage Deployments → create a new deployment
 * as a Web App (Execute as: Me, Who has access: Anyone).
 * Copy the new deployment URL and update the form action in
 * apostille-review.html if it changes.
 *
 * Sheet:  https://docs.google.com/spreadsheets/d/1Kt9KsGlYnpzcjoCYNUBvkWnBxSW5MfJi41gfzP_wYlE
 * Tab:    Sheet1  (change SHEET_NAME below if your tab has a different name)
 */

var SHEET_ID   = '1Kt9KsGlYnpzcjoCYNUBvkWnBxSW5MfJi41gfzP_wYlE';
var SHEET_NAME = 'Sheet1';

// ─────────────────────────────────────────────────────────────────────────────
// Column name → form field mapping
//
// Keys are the EXACT column headers in your Google Sheet (case-sensitive).
// The value function receives (params, meta) and returns the cell value.
//
// "Certified Original Required" is the existing column name in your sheet.
// The form field hasCertifiedOriginal maps to it.  Rename the column in the
// sheet to "Certified Original" if you prefer that label — the script will
// follow whatever the header row says.
// ─────────────────────────────────────────────────────────────────────────────
var FIELD_MAP = {
  'Order Number':                function (p, m) { return m.orderNum; },
  'Intake Date':                 function (p, m) { return m.intakeDate; },
  'Client First Name':           function (p, m) { return m.firstName; },
  'Client Last Name':            function (p, m) { return m.lastName; },
  'Email Address':               function (p)    { return p.email || ''; },
  'Phone Number':                function (p)    { return p.phone || ''; },
  'Destination Country':         function (p)    { return p.destinationCountry || ''; },
  'Document Type':               function (p)    { return p.documentType || ''; },
  'Certified Vital Record':      function (p)    { return p.isVitalRecord || ''; },
  'Certified Original Required': function (p)    { return p.hasCertifiedOriginal || ''; },
  'Already Notarized':           function (p)    { return p.isAlreadyNotarized || ''; },
  'Document Count':              function (p)    { return p.documentCount || ''; },
  'Same-Day Review':             function (p, m) { return m.reviewLabel; },
  'Notes':                       function (p)    { return p.notes || ''; },
  'Signature':                   function (p, m) { return m.sigValue; }
};

// ─────────────────────────────────────────────────────────────────────────────
// doPost — called when the intake form submits
// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var p     = e.parameter;

    var tz         = Session.getScriptTimeZone();
    var now        = new Date();
    var intakeDate = Utilities.formatDate(now, tz, 'MM/dd/yyyy hh:mm a');

    // Order number — auto-generate when blank
    var orderNum = (p.orderNumber || '').trim();
    if (!orderNum) orderNum = generateOrderNumber(sheet);

    // Split full name into first / last
    var fullName  = (p.fullName || '').trim();
    var spaceIdx  = fullName.indexOf(' ');
    var firstName = spaceIdx > -1 ? fullName.slice(0, spaceIdx)  : fullName;
    var lastName  = spaceIdx > -1 ? fullName.slice(spaceIdx + 1) : '';

    // Service label
    var reviewLabel = (p.sameDayReview || '').toLowerCase().trim() === 'same-day'
      ? 'Same-Day Review'
      : 'Standard Review';

    // Signature — store confirmation note, not raw base64
    var sigValue = (p.signature && p.signature.length > 10)
      ? 'Captured — ' + intakeDate
      : '';

    var meta = { orderNum: orderNum, intakeDate: intakeDate,
                 firstName: firstName, lastName: lastName,
                 reviewLabel: reviewLabel, sigValue: sigValue };

    // Resolve headers (adds missing columns automatically)
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

// doGet — quick smoke-test: open the deployment URL in a browser
function doGet() {
  return ContentService
    .createTextOutput('Ink & Seal Notary Pros — Apostille Intake script is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full header row array.
 * Columns that are in FIELD_MAP but not yet in the sheet are appended
 * to the end of row 1 so existing data is never shifted.
 */
function resolveHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers;

  if (sheet.getLastRow() === 0 || lastCol === 0) {
    headers = Object.keys(FIELD_MAP);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return headers;
  }

  headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  Object.keys(FIELD_MAP).forEach(function (colName) {
    if (headers.indexOf(colName) === -1) {
      headers.push(colName);
      sheet.getRange(1, headers.length).setValue(colName).setFontWeight('bold');
    }
  });

  return headers;
}

/**
 * Builds a row array aligned to the header positions.
 * Columns not in FIELD_MAP get an empty string so existing
 * manually-entered data in those columns is left untouched.
 */
function buildRow(headers, p, meta) {
  return headers.map(function (h) {
    if (FIELD_MAP.hasOwnProperty(h)) {
      return FIELD_MAP[h](p, meta);
    }
    return '';
  });
}

/**
 * Generates a sequential order number: ISN-YYYYMM-NNNN
 * The sequence is based on the current row count so it is
 * always unique within the sheet.
 */
function generateOrderNumber(sheet) {
  var tz      = Session.getScriptTimeZone();
  var now     = new Date();
  var yymm    = Utilities.formatDate(now, tz, 'yyyyMM');
  var dataRows = Math.max(sheet.getLastRow(), 1); // includes header row
  var seq      = String(dataRows).padStart(4, '0');
  return 'ISN-' + yymm + '-' + seq;
}

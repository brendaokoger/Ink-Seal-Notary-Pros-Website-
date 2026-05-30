var SHEET_ID   = '1Kt9KsGlYnpzcjoCYNUBvkWnBxSW5MfJi41gfzP_wYlE';
var SHEET_NAME = 'Sheet1';

// Column header → value mapping (keys must match your sheet headers exactly)
var FIELD_MAP = {
  'Order Number':                function (p, m) { return m.orderNum; },
  'Intake Date':                 function (p, m) { return m.intakeDate; },
  'Client First Name':           function (p, m) { return m.firstName; },
  'Client Last Name':            function (p, m) { return m.lastName; },
  'Email Address':               function (p)    { return p.email                || ''; },
  'Phone Number':                function (p)    { return p.phone                || ''; },
  'Destination Country':         function (p)    { return p.destinationCountry   || ''; },
  'Document Type':               function (p)    { return p.documentType         || ''; },
  'Certified Vital Record':      function (p)    { return p.isVitalRecord        || ''; },
  'Certified Original Required': function (p)    { return p.hasCertifiedOriginal || ''; },
  'Already Notarized':           function (p)    { return p.isAlreadyNotarized   || ''; },
  'Document Count':              function (p)    { return p.documentCount        || ''; },
  'Same-Day Review':             function (p, m) { return m.reviewLabel; },
  'Notes':                       function (p)    { return p.notes                || ''; },
  'Signature':                   function (p, m) { return m.sigValue; }
};

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

    var headers = resolveHeaders(sheet);
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

function resolveHeaders(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    var h = Object.keys(FIELD_MAP);
    sheet.appendRow(h);
    sheet.getRange(1, 1, 1, h.length).setFontWeight('bold');
    return h;
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  Object.keys(FIELD_MAP).forEach(function (col) {
    if (headers.indexOf(col) === -1) {
      headers.push(col);
      sheet.getRange(1, headers.length).setValue(col).setFontWeight('bold');
    }
  });
  return headers;
}

function generateOrderNumber(sheet) {
  var tz   = Session.getScriptTimeZone();
  var yymm = Utilities.formatDate(new Date(), tz, 'yyyyMM');
  var seq  = String(Math.max(sheet.getLastRow(), 1)).padStart(4, '0');
  return 'INS-' + yymm + '-' + seq;
}

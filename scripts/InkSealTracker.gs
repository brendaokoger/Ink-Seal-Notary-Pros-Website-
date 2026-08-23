// ═════════════════════════════════════════════════════════════════════════════
// Ink & Seal Notary Pros — MASTER TRACKER (proposed rebuild)
//
// STATUS: NOT YET CONNECTED TO ANY LIVE FORM. This file provisions a brand
// new, standalone Google Sheet ("Ink & Seal Tracker") and a brand new Apps
// Script surface. It does NOT touch, read, write, or replace the currently
// deployed scripts/Code.gs, the currently live Apostille/Translation
// spreadsheet(s), or any of the four live website forms.
//
// Per the explicit instruction this file was built under: review and approve
// the schema first (createInkSealTracker() + auditTrackerSchema() below), THEN
// connect the live forms one at a time — Apostille first, tested, then RON,
// then Fingerprinting, then Translation — updating api/submit-intake.js and
// api/upload-to-drive.js's GAS_URL only once this project is deployed and each
// service has been individually verified.
//
// LIVE WEB APP FUNCTIONS (only meaningful once this project is deployed AND
// its /exec URL is wired into the website — neither has happened yet)
//   doPost(e) — routes by e.parameter.formType:
//                 - JSON action:'upload_files'        -> handleFileUpload()
//                 - formType === 'ron'                  -> handleRonSubmission()
//                 - formType contains 'fingerprint'      -> handleFingerprintingSubmission()
//                 - formType contains 'translation'      -> handleTranslationSubmission()
//                 - everything else (default)            -> handleApostilleSubmission()
//                   (matches the current live Apostille form, which sends no
//                   formType at all — same default-branch convention already
//                   used in scripts/Code.gs)
//   doGet()  — health-check endpoint
//
// SETUP / VERIFICATION FUNCTIONS (run manually from the Apps Script editor)
//   createInkSealTracker()  — builds the ENTIRE spreadsheet from scratch: all
//                             8 tabs, headers, formatting, dropdowns. Run this
//                             ONCE. Logs the new spreadsheet's URL and Sheet ID
//                             — paste that ID into INK_SEAL_TRACKER_ID below.
//   auditTrackerSchema()    — logs every tab name and every header in row 1,
//                             so the schema can be verified against this
//                             report before anything is connected live.
//
// ── How to use this file ─────────────────────────────────────────────────────
//   1. Create a SEPARATE, NEW Apps Script project (Extensions > Apps Script,
//      from a blank Google Sheet, or script.google.com > New Project). Do NOT
//      paste this into the project currently serving the live Apostille form.
//   2. Paste this entire file in, save.
//   3. Run createInkSealTracker() once. Approve permissions. Check the log for
//      the new Sheet ID and URL.
//   4. Paste that Sheet ID into INK_SEAL_TRACKER_ID below, save again.
//   5. Run auditTrackerSchema() and compare its log output against the
//      field-by-field audit document — confirm every tab and column matches
//      before doing anything else.
//   6. STOP. Do not deploy as a Web App yet, do not touch any live form's
//      submission endpoint. Get explicit approval on the schema first.
//   7. Once approved: deploy this project as a Web App, connect ONE service
//      at a time (Apostille first) by pointing that form's submission at the
//      new /exec URL, test it live, verify the row in the sheet, THEN move to
//      the next service.
// ═════════════════════════════════════════════════════════════════════════════

// ── Master spreadsheet ID — filled in by createInkSealTracker() ────────────
// Every handler below refuses to run (clear error, no silent misfire) until
// this is a real ID.
var INK_SEAL_TRACKER_ID = 'PASTE_NEW_TRACKER_SHEET_ID_HERE';

// ── Tab names (single source of truth — used everywhere below) ─────────────
var TAB_APOSTILLE      = 'Apostille Intake';
var TAB_RON             = 'RON Requests';
var TAB_FINGERPRINTING  = 'Fingerprinting Requests';
var TAB_TRANSLATION     = 'Translation Requests';
var TAB_CUSTOMERS       = 'Customers';
var TAB_PAYMENTS        = 'Payments';
var TAB_COMMUNICATIONS  = 'Communications';
var TAB_DASHBOARD       = 'Dashboard';


// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA — one HEADERS array + one FIELD_MAP per service, built ONLY from
// fields that actually exist in the live forms (see the accompanying
// field-by-field audit). Apostille and RON schemas are copied verbatim from
// the already-audited, already-live scripts/Code.gs (unchanged — same 28 and
// 27 columns respectively). Fingerprinting and Translation are newly audited
// here from services/fingerprinting/index.html and services/translation/index.html.
// ═════════════════════════════════════════════════════════════════════════════

// ── APOSTILLE (28 columns — identical to the live scripts/Code.gs schema) ──
var AP_HEADERS = [
  'Request ID',                  'Submission Date/Time',        'Full Name',
  'Email',                       'Phone',                       'State',
  'Preferred Contact Method',    'Destination Country',         'Destination Eligibility',
  'Issuing Jurisdiction',        'Issuing State',                'Document Type',
  'Other Document Type',         'Certified Copy / Original',   'Already Notarized',
  'Corporate Status',            'Academic Document Type',      'Document Count',
  'Review Speed',                'Processing Speed',            'Return Delivery',
  'Estimated Total',             'Documents Provided Later',    'Upload Folder / File Link',
  'Additional Notes',            'Acknowledgment Accepted',     'Acknowledgment Timestamp',
  'Status'
];
var AP_FIELD_MAP = {
  'Request ID':                  function (p, m) { return m.requestId;              },
  'Submission Date/Time':        function (p, m) { return m.submittedAt;            },
  'Full Name':                   function (p)    { return p.fullName              || ''; },
  'Email':                       function (p)    { return p.email                 || ''; },
  'Phone':                       function (p)    { return p.phone                 || ''; },
  'State':                       function (p)    { return p.state                 || ''; },
  'Preferred Contact Method':    function (p)    { return p.preferredContactMethod|| ''; },
  'Destination Country':         function (p)    { return p.destinationCountry    || ''; },
  'Destination Eligibility':     function (p)    { return p.destinationEligibility|| ''; },
  'Issuing Jurisdiction':        function (p)    { return p.issuingJurisdiction   || ''; },
  'Issuing State':               function (p)    { return p.issuingState          || ''; },
  'Document Type':               function (p)    { return p.documentType          || ''; },
  'Other Document Type':         function (p)    { return p.documentTypeOther     || ''; },
  'Certified Copy / Original':   function (p)    { return p.hasCertifiedOriginal  || ''; },
  'Already Notarized':           function (p)    { return p.isAlreadyNotarized    || ''; },
  'Corporate Status':            function (p)    { return p.corporateStatus       || ''; },
  'Academic Document Type':      function (p)    { return p.academicDocumentType  || ''; },
  'Document Count':              function (p)    { return p.documentCount         || ''; },
  'Review Speed':                function (p, m) { return m.reviewLabel;              },
  'Processing Speed':            function (p, m) { return m.processingLabel;          },
  'Return Delivery':             function (p, m) { return m.deliveryLabel;            },
  'Estimated Total':             function (p)    { var n = parseFloat(p.estimatedTotal); return isNaN(n) ? (p.estimatedTotal || '') : n; },
  'Documents Provided Later':    function (p)    { return p.documentsLater ? 'Yes' : 'No'; },
  'Upload Folder / File Link':   function (p)    { return p.uploadFolderLink      || ''; },
  'Additional Notes':            function (p)    { return p.notes                 || ''; },
  'Acknowledgment Accepted':     function (p)    { return p.ack1 ? 'Yes' : 'No';        },
  'Acknowledgment Timestamp':    function (p, m) { return p.ack1 ? m.submittedAt : '';  },
  'Status':                      function ()     { return 'New';                        }
};

// ── RON (27 columns — identical to the live scripts/Code.gs schema) ────────
var RON_HEADERS = [
  'Request ID',                  'Submission Date/Time',        'Full Name',
  'Email',                       'Phone',                       'State',
  'Preferred Contact Method',    'Document Type',               'Number of Documents',
  'Number of Notarial Seals',    'Additional Signers',          'Witness Required',
  'Witness Source',              'Preferred Appointment Date',  'Preferred Appointment Time',
  'Time Zone',                   'ASAP Requested',               'Documents Provided Later',
  'Upload Folder / File Link',   'Estimated Total',             'Additional Notes',
  'Acknowledgment Accepted',     'Acknowledgment Timestamp',    'BlueNotary Invitation Sent',
  'Payment Status',              'Session Status',              'Status'
];
function ronSummarizeSigners_(p) {
  if ((p.signerCount || '').toLowerCase() !== 'yes') return 'None';
  var countLabel = p.addlSignersCount || '';
  var n = countLabel === '4+' ? 4 : (parseInt(countLabel, 10) || 0);
  var parts = [];
  for (var i = 1; i <= n; i++) {
    var name  = p['additionalSigner' + i + 'Name'];
    var email = p['additionalSigner' + i + 'Email'];
    if (name || email) parts.push((name || 'Unnamed signer') + (email ? ' (' + email + ')' : ''));
  }
  return (countLabel || String(n) || '0') + (parts.length ? ' — ' + parts.join('; ') : '');
}
var RON_FIELD_MAP = {
  'Request ID':                 function (p, m) { return m.requestId;             },
  'Submission Date/Time':       function (p, m) { return m.submittedAt;           },
  'Full Name':                  function (p)    { return p.fullName              || ''; },
  'Email':                      function (p)    { return p.email                 || ''; },
  'Phone':                      function (p)    { return p.phone                 || ''; },
  'State':                      function (p)    { return p.signerState           || ''; },
  'Preferred Contact Method':   function (p)    { return p.preferredContactMethod|| ''; },
  'Document Type':              function (p)    { return p.documentType          || ''; },
  'Number of Documents':        function (p)    { return p.numDocs               || ''; },
  'Number of Notarial Seals':   function (p)    { return p.sealCount             || ''; },
  'Additional Signers':         function (p)    { return ronSummarizeSigners_(p);         },
  'Witness Required':           function (p)    { return (p.witnessRequired === 'own' || p.witnessRequired === 'was') ? 'Yes' : 'No'; },
  'Witness Source':             function (p)    {
    return p.witnessRequired === 'own' ? 'Client-Provided'
         : p.witnessRequired === 'was' ? 'Ink & Seal Assistance (+$10)'
         : '';
  },
  'Preferred Appointment Date': function (p)    { return p.asapPreferred ? '' : (p.appointmentDate || ''); },
  'Preferred Appointment Time': function (p)    { return p.asapPreferred ? '' : (p.appointmentTime || ''); },
  'Time Zone':                  function (p)    { return p.timezone              || ''; },
  'ASAP Requested':             function (p)    { return p.asapPreferred ? 'Yes' : 'No'; },
  'Documents Provided Later':   function (p)    { return (parseInt(p.uploadedFileCount, 10) || 0) > 0 ? 'No' : 'Yes'; },
  'Upload Folder / File Link':  function (p)    { return p.uploadFolderLink      || ''; },
  'Estimated Total':            function (p)    { var n = parseFloat(p.estimatedTotal); return isNaN(n) ? (p.estimatedTotal || '') : n; },
  'Additional Notes':           function (p)    { return p.notes                 || ''; },
  'Acknowledgment Accepted':    function (p)    { return p.ronTermsAck ? 'Yes' : 'No';   },
  'Acknowledgment Timestamp':   function (p, m) { return p.ronTermsAck ? m.submittedAt : ''; },
  'BlueNotary Invitation Sent': function ()     { return 'No';             },
  'Payment Status':             function ()     { return 'Not Started';    },
  'Session Status':             function ()     { return 'Not Scheduled';  },
  'Status':                     function ()     { return 'New';            }
};

// ── FINGERPRINTING (24 columns — audited from services/fingerprinting/index.html) ──
// The live form has NO upload/file field at all, and NO hidden estimatedTotal
// field — the fee estimate (Step 6) is display-only in the browser, never
// submitted. Estimated Total below is computed server-side from numCards,
// using the SAME $55 base + $10/additional-card figures already published on
// that page (on-pricing-item text), not invented numbers. Because there is no
// upload field, there is no Drive folder logic for this service and no
// 'Upload Folder / File Link' column — consistent with "use the exact fields
// from the live forms."
var FP_HEADERS = [
  'Request ID',                  'Submission Date/Time',                    'Full Name',
  'Email',                       'Phone',                                   'State',
  'Purpose',                     'Purpose Other',                           'Appointment Date',
  'Appointment Time',            'Number of FD-258 Cards',                  'Submitting Agency / Employer',
  'Card Provider',               'Agency Notes',                            'ID Type Presented',
  'Estimated Total',             'Consent - Valid ID Provided',             'Consent - Blank FD-258 Cards',
  'Consent - Appointment Only',  'Consent - Confirmation Understood',       'Consent - Fingerprint & Terms',
  'Signature',                   'Signature Date',                          'Status'
];
function fpEstimateTotal_(p) {
  var raw = (p.numCards || '').trim();
  var count = raw === '5+' ? 5 : (parseInt(raw, 10) || 1);
  var addl = Math.max(0, count - 1);
  return 55 + (addl * 10);
}
var FP_FIELD_MAP = {
  'Request ID':                  function (p, m) { return m.requestId;              },
  'Submission Date/Time':        function (p, m) { return m.submittedAt;            },
  'Full Name':                   function (p)    { return p.fullName              || ''; },
  'Email':                       function (p)    { return p.email                 || ''; },
  'Phone':                       function (p)    { return p.phone                 || ''; },
  'State':                       function (p)    { return p.signerState           || ''; },
  'Purpose':                     function (p)    { return p.fingerprintPurpose    || ''; },
  'Purpose Other':               function (p)    { return p.purposeOtherText      || ''; },
  'Appointment Date':            function (p)    { return p.appointmentDate       || ''; },
  'Appointment Time':            function (p)    { return p.appointmentTime       || ''; },
  'Number of FD-258 Cards':      function (p)    { return p.numCards              || ''; },
  'Submitting Agency / Employer':function (p)    { return p.agencyName            || ''; },
  'Card Provider':                function (p)    { return p.cardProvider          || ''; },
  'Agency Notes':                function (p)    { return p.agencyNotes           || ''; },
  'ID Type Presented':           function (p)    { return p.idType                || ''; },
  'Estimated Total':             function (p)    { return fpEstimateTotal_(p);            },
  'Consent - Valid ID Provided': function (p)    { return p.consent1 ? 'Yes' : 'No';      },
  'Consent - Blank FD-258 Cards':function (p)    { return p.consent2 ? 'Yes' : 'No';      },
  'Consent - Appointment Only':  function (p)    { return p.consent3 ? 'Yes' : 'No';      },
  'Consent - Confirmation Understood': function (p) { return p.consent4 ? 'Yes' : 'No';   },
  'Consent - Fingerprint & Terms': function (p)  { return p.consent5 ? 'Yes' : 'No';      },
  'Signature':                   function (p)    { return p.eSignature            || ''; },
  'Signature Date':              function (p)    { return p.sigDate               || ''; },
  'Status':                      function ()     { return 'New';                         }
};

// ── TRANSLATION (18 columns — re-audited from services/translation/index.html) ──
// The live form already POSTs JSON to /api/submit-intake with formType
// 'Certified Translation Quote', and already has an (empty-at-submit-time)
// driveFolderLink field populated later by the same upload-writeback pattern
// as Apostille/RON. There is no acknowledgment/consent checkbox on this form
// at all — no Acknowledgment columns are included here, since none exist to
// capture.
var TR_HEADERS = [
  'Request ID',                  'Submission Date/Time',        'Full Name',
  'Email',                       'Phone',                       'Source Language',
  'Target Language',             'Document Type',               'Number of Pages',
  'Add-on: Notarization',        'Add-on: Apostille',           'Add-on: Rush',
  'Add-on: Hard Copy',           'Special Instructions',        'Files Uploaded',
  'Upload Folder / File Link',   'Estimated Total',             'Status'
];
var TR_FIELD_MAP = {
  'Request ID':               function (p, m) { return m.requestId;              },
  'Submission Date/Time':     function (p, m) { return m.submittedAt;            },
  'Full Name':                function (p)    { return p.fullName              || ''; },
  'Email':                    function (p)    { return p.email                 || ''; },
  'Phone':                    function (p)    { return p.phone                 || ''; },
  'Source Language':          function (p)    { return p.sourceLanguage        || ''; },
  'Target Language':          function (p)    { return p.targetLanguage        || ''; },
  'Document Type':            function (p)    { return p.documentType          || ''; },
  'Number of Pages':          function (p)    { return p.numberOfPages         || ''; },
  'Add-on: Notarization':     function (p)    { return p.addonNotarization ? 'Yes' : 'No'; },
  'Add-on: Apostille':        function (p)    { return p.addonApostille    ? 'Yes' : 'No'; },
  'Add-on: Rush':             function (p)    { return p.addonRush         ? 'Yes' : 'No'; },
  'Add-on: Hard Copy':        function (p)    { return p.addonHardCopy     ? 'Yes' : 'No'; },
  'Special Instructions':     function (p)    { return p.specialInstructions   || ''; },
  'Files Uploaded':           function (p)    { return p.uploadedFileCount     || '0'; },
  // Blank at initial submit — the live form always sends this empty; the
  // real value is written back later by the async Drive-upload step (same
  // pattern as Apostille/RON), matched by Request ID.
  'Upload Folder / File Link':function (p)    { return p.uploadFolderLink || p.driveFolderLink || ''; },
  'Estimated Total':          function (p)    { var n = parseFloat(p.estimatedTotal); return isNaN(n) ? (p.estimatedTotal || '') : n; },
  'Status':                   function ()     { return 'New';                        }
};

// ── CUSTOMERS / PAYMENTS / COMMUNICATIONS ───────────────────────────────────
// These three tabs are provisioned (headers + formatting) by
// createInkSealTracker() below, but are NOT auto-populated by doPost. Cross-
// service customer matching/deduplication and payment/communication logging
// are operational workflows that weren't specified field-by-field the way
// the four intake forms were, so this file deliberately does not invent that
// logic — these are ready for staff to use manually, or for a follow-up,
// explicitly-scoped automation pass once you've decided how you want
// customers matched/deduped across services. Flagged clearly in the report.
var CUSTOMERS_HEADERS = [
  'Customer ID', 'Full Name', 'Email', 'Phone', 'State',
  'Services Used', 'Request IDs', 'First Request Date',
  'Total Requests', 'Total Estimated Value', 'Notes'
];
var PAYMENTS_HEADERS = [
  'Request ID', 'Service', 'Customer Name', 'Amount',
  'Payment Method', 'Payment Status', 'Payment Date',
  'Invoice / Reference Number', 'Notes'
];
var COMMUNICATIONS_HEADERS = [
  'Request ID', 'Service', 'Customer Name', 'Date/Time',
  'Channel', 'Direction', 'Summary', 'Staff Member'
];


// ═════════════════════════════════════════════════════════════════════════════
// doPost / doGet — router. NOT wired to any live form yet (see file header).
// ═════════════════════════════════════════════════════════════════════════════
function doPost(e) {
  if (e.postData && e.postData.type === 'application/json') {
    try {
      var jsonBody = JSON.parse(e.postData.contents);
      if (jsonBody.action === 'upload_files') return handleFileUpload(jsonBody);
    } catch (_) { /* invalid JSON — fall through */ }
  }

  var ep = e.parameter || {};
  var formType = (ep.formType || '').toLowerCase();

  if (formType === 'ron') return handleRonSubmission(e);
  if (formType.indexOf('fingerprint') !== -1) return handleFingerprintingSubmission(e);
  if (formType.indexOf('translation') !== -1) return handleTranslationSubmission(e);

  // Default: Apostille. The live Apostille form currently sends no formType
  // at all, matching this fallback — same convention as scripts/Code.gs.
  return handleApostilleSubmission(e);
}

function doGet() {
  return ContentService
    .createTextOutput('Ink & Seal Notary Pros — Master Tracker script is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}


// ═════════════════════════════════════════════════════════════════════════════
// Per-service submission handlers — each: opens the ONE shared spreadsheet,
// gets (or idempotently auto-creates) its own tab, generates its own
// lock-protected Request ID, appends a row by header NAME, returns
// {status:'ok', requestId, order}. Reliability contract mirrors the already-
// proven Apostille/RON pattern: no success is reported unless appendRow
// actually completed.
// ═════════════════════════════════════════════════════════════════════════════

function handleApostilleSubmission(e) {
  return handleServiceSubmission_(e, TAB_APOSTILLE, tabDef_(TAB_APOSTILLE), AP_HEADERS, AP_FIELD_MAP, generateApostilleRequestId, 'Apostille');
}
function handleRonSubmission(e) {
  return handleServiceSubmission_(e, TAB_RON, tabDef_(TAB_RON), RON_HEADERS, RON_FIELD_MAP, generateRonRequestId, 'RON');
}
function handleFingerprintingSubmission(e) {
  return handleServiceSubmission_(e, TAB_FINGERPRINTING, tabDef_(TAB_FINGERPRINTING), FP_HEADERS, FP_FIELD_MAP, generateFingerprintingRequestId, 'Fingerprinting');
}
function handleTranslationSubmission(e) {
  return handleServiceSubmission_(e, TAB_TRANSLATION, tabDef_(TAB_TRANSLATION), TR_HEADERS, TR_FIELD_MAP, generateTranslationRequestId, 'Translation');
}

// Shared implementation for all four handlers above — behavior is identical
// across services; only the tab, header/field-map pair, and ID generator
// differ, which is exactly what's passed in.
function handleServiceSubmission_(e, tabName, tabDefFn, headersConst, fieldMap, idGeneratorFn, serviceLabel) {
  try {
    if (!INK_SEAL_TRACKER_ID || INK_SEAL_TRACKER_ID === 'PASTE_NEW_TRACKER_SHEET_ID_HERE') {
      throw new Error('INK_SEAL_TRACKER_ID is not configured — run createInkSealTracker() ' +
        'and paste the resulting Sheet ID at the top of this file first.');
    }

    var ss    = SpreadsheetApp.openById(INK_SEAL_TRACKER_ID);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) sheet = tabDefFn(ss); // idempotent auto-create fallback

    var p = e.parameter;
    var submittedAt = new Date(); // real Date object — correct Sheets sort/filter/format
    var requestId = idGeneratorFn();

    var meta = { requestId: requestId, submittedAt: submittedAt };
    if (serviceLabel === 'Apostille') {
      meta.reviewLabel = (p.sameDayReview || '').toLowerCase().trim() === 'same-day' ? 'Same-Day Review' : 'Standard Review';
      meta.processingLabel = (p.processingSpeed || '').toLowerCase().trim() === 'rush' ? 'Rush Processing' : 'Standard Processing';
      var deliveryRaw = (p.returnShipping || '').toLowerCase().trim();
      meta.deliveryLabel = deliveryRaw === 'overnight' ? 'Overnight' : deliveryRaw === 'international' ? 'International' : 'USPS Priority';
    }

    Logger.log('=== ' + serviceLabel + ' submission ===');
    Logger.log('Tab: ' + sheet.getName() + ' | Rows before append: ' + sheet.getLastRow());

    var liveHeaders = getHeaders_(sheet, headersConst);
    sheet.appendRow(liveHeaders.map(function (h) {
      return fieldMap.hasOwnProperty(h) ? fieldMap[h](p, meta) : '';
    }));

    Logger.log(serviceLabel + ' Request: ' + requestId + ' | Rows after append: ' + sheet.getLastRow());

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', requestId: requestId, order: requestId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleServiceSubmission_ (' + serviceLabel + ') error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// handleFileUpload — routes by Request ID prefix to the matching service's
// Drive subfolder and sheet tab. Only Apostille, RON, and Translation have a
// real upload field on their live forms; Fingerprinting does not, so 'IS-FP-'
// is intentionally not a recognized prefix here.
// ═════════════════════════════════════════════════════════════════════════════
var UPLOAD_ALLOWED_MIME = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png'
];
var UPLOAD_ALLOWED_EXT  = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
var UPLOAD_MAX_BYTES    = 100 * 1024 * 1024; // 100MB — matches the live Translation form's own client-side limit

var SERVICE_BY_PREFIX_ = {
  'IS-AP-':  { folder: 'Apostille Requests',   tab: TAB_APOSTILLE   },
  'IS-RON-': { folder: 'RON Requests',          tab: TAB_RON          },
  'IS-TR-':  { folder: 'Translation Requests',  tab: TAB_TRANSLATION  }
};

function handleFileUpload(p) {
  try {
    var orderNumber = (p.orderNumber || '').trim();
    var clientName  = (p.clientName  || 'Unknown Client').trim();
    var files       = p.files || [];

    var route = null;
    for (var prefix in SERVICE_BY_PREFIX_) {
      if (orderNumber.indexOf(prefix) === 0) { route = SERVICE_BY_PREFIX_[prefix]; break; }
    }
    if (!route) {
      throw new Error('handleFileUpload: unrecognized Request ID prefix for "' + orderNumber + '" — no matching service.');
    }

    var topName   = 'Ink & Seal Notary Pros';
    var topIter   = DriveApp.getFoldersByName(topName);
    var topFolder = topIter.hasNext() ? topIter.next() : DriveApp.createFolder(topName);

    var reqsIter   = topFolder.getFoldersByName(route.folder);
    var reqsFolder = reqsIter.hasNext() ? reqsIter.next() : topFolder.createFolder(route.folder);

    var leafName    = orderNumber || clientName;
    var leafIter    = reqsFolder.getFoldersByName(leafName);
    var orderFolder = leafIter.hasNext() ? leafIter.next() : reqsFolder.createFolder(leafName);

    var uploadCount = 0;
    var skipped = [];
    files.forEach(function (f) {
      var dataUrl = f.data || '';
      var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;

      var mime = m[1];
      var ext  = (f.name || '').split('.').pop().toLowerCase();
      var typeOk = UPLOAD_ALLOWED_MIME.indexOf(mime) !== -1 || UPLOAD_ALLOWED_EXT.indexOf(ext) !== -1;
      if (!typeOk) { skipped.push((f.name || 'file') + ' — unsupported file type'); return; }
      var approxBytes = Math.floor((m[2].length * 3) / 4);
      if (approxBytes > UPLOAD_MAX_BYTES) { skipped.push((f.name || 'file') + ' — file too large (100MB limit)'); return; }

      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], f.name);
      orderFolder.createFile(blob);
      uploadCount++;
    });

    var folderUrl = orderFolder.getUrl();

    if (orderNumber && INK_SEAL_TRACKER_ID && INK_SEAL_TRACKER_ID !== 'PASTE_NEW_TRACKER_SHEET_ID_HERE') {
      try {
        var ss = SpreadsheetApp.openById(INK_SEAL_TRACKER_ID);
        writeFolderLinkToSheet_(ss, route.tab, 'Upload Folder / File Link', orderNumber, folderUrl);
      } catch (writeErr) {
        Logger.log('handleFileUpload: could not write folder link back to ' + route.tab + ' — ' + writeErr.toString());
      }
    }

    Logger.log('handleFileUpload: order=' + orderNumber + ' service=' + route.tab +
               ' uploads=' + uploadCount + ' skipped=' + skipped.length + ' url=' + folderUrl);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, folderLink: folderUrl, uploadCount: uploadCount, skipped: skipped }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleFileUpload error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Writes a Drive folder URL back to the matching Request ID's row.
function writeFolderLinkToSheet_(ss, sheetName, linkColName, orderNumber, url) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;
  var hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  var oCol = hdrs.indexOf('Request ID') + 1;
  var lCol = hdrs.indexOf(linkColName) + 1;
  if (oCol < 1 || lCol < 1) return false;
  var vals = sheet.getRange(2, oCol, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === orderNumber) {
      sheet.getRange(i + 2, lCol).setValue(url);
      return true;
    }
  }
  return false;
}


// ═════════════════════════════════════════════════════════════════════════════
// Request ID generators — one independent, lock-protected, per-day counter
// per service. Same principle for all four: LockService.getScriptLock() +
// a date-scoped PropertiesService key, NOT row count (which is not safe
// under concurrent submissions). Each service has its OWN property-key
// namespace, so no two services' sequences can ever collide or influence
// each other, even though they briefly share the same script-wide mutex
// while incrementing their own counter.
// ═════════════════════════════════════════════════════════════════════════════
function generateApostilleRequestId()     { return generateServiceRequestId_('IS-AP-',  'reqSeq_ap_');  }
function generateRonRequestId()            { return generateServiceRequestId_('IS-RON-', 'reqSeq_ron_'); }
function generateFingerprintingRequestId() { return generateServiceRequestId_('IS-FP-',  'reqSeq_fp_');  }
function generateTranslationRequestId()    { return generateServiceRequestId_('IS-TR-',  'reqSeq_tr_');  }

function generateServiceRequestId_(prefix, propertyKeyPrefix) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tz  = Session.getScriptTimeZone();
    var ymd = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
    var props = PropertiesService.getScriptProperties();
    var key = propertyKeyPrefix + ymd;
    var seq = parseInt(props.getProperty(key) || '0', 10) + 1;
    props.setProperty(key, String(seq));
    return prefix + ymd + '-' + String(seq).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// createInkSealTracker — run ONCE to build the entire spreadsheet from
// scratch: all 8 tabs, headers, navy/gold formatting, frozen header row,
// filters, alternating row banding, currency/date formats, status dropdowns.
// Logs the new spreadsheet's URL and Sheet ID — paste the ID into
// INK_SEAL_TRACKER_ID above afterward.
// ═════════════════════════════════════════════════════════════════════════════
function createInkSealTracker() {
  var ss = SpreadsheetApp.create('Ink & Seal Tracker');

  // Rename the default first sheet into the first real tab instead of
  // leaving a stray "Sheet1" behind.
  var first = ss.getSheets()[0];
  first.setName(TAB_APOSTILLE);
  buildTab_(first, AP_HEADERS, apostilleTabOpts_());

  var ron = ss.insertSheet(TAB_RON);
  buildTab_(ron, RON_HEADERS, ronTabOpts_());

  var fp = ss.insertSheet(TAB_FINGERPRINTING);
  buildTab_(fp, FP_HEADERS, fingerprintingTabOpts_());

  var tr = ss.insertSheet(TAB_TRANSLATION);
  buildTab_(tr, TR_HEADERS, translationTabOpts_());

  var cust = ss.insertSheet(TAB_CUSTOMERS);
  buildTab_(cust, CUSTOMERS_HEADERS, customersTabOpts_());

  var pay = ss.insertSheet(TAB_PAYMENTS);
  buildTab_(pay, PAYMENTS_HEADERS, paymentsTabOpts_());

  var comm = ss.insertSheet(TAB_COMMUNICATIONS);
  buildTab_(comm, COMMUNICATIONS_HEADERS, communicationsTabOpts_());

  var dash = ss.insertSheet(TAB_DASHBOARD);
  buildDashboardTab_(dash, ss);
  ss.setActiveSheet(dash);
  ss.moveActiveSheet(1); // Dashboard first, most useful landing tab

  Logger.log('=== Ink & Seal Tracker created ===');
  Logger.log('Name: ' + ss.getName());
  Logger.log('URL:  ' + ss.getUrl());
  Logger.log('>>> Paste this Sheet ID into INK_SEAL_TRACKER_ID at the top of this file:');
  Logger.log(ss.getId());
  Logger.log('Tabs created: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
}

// Returns (creating if necessary) the sheet for a given tab name, matching
// this file's own schema — used as the auto-create fallback inside
// handleServiceSubmission_ if a service's tab somehow doesn't exist yet
// when a submission arrives (mirrors the idempotent-tab-creation pattern
// already proven for RON in scripts/Code.gs).
function tabDef_(tabName) {
  return function (ss) {
    var existing = ss.getSheetByName(tabName);
    if (existing) return existing;
    var sheet = ss.insertSheet(tabName);
    var map = {};
    map[TAB_APOSTILLE]     = [AP_HEADERS,  apostilleTabOpts_];
    map[TAB_RON]            = [RON_HEADERS, ronTabOpts_];
    map[TAB_FINGERPRINTING] = [FP_HEADERS,  fingerprintingTabOpts_];
    map[TAB_TRANSLATION]    = [TR_HEADERS,  translationTabOpts_];
    var entry = map[tabName];
    if (entry) buildTab_(sheet, entry[0], entry[1]());
    return sheet;
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// buildTab_ — generic, reusable tab builder. Applies the required formatting
// uniformly: navy #0B1829 header background, gold #C49A4A header text, bold,
// frozen row 1, filter, alternating light row banding, plus whatever
// currency/date-time/text/dropdown formatting is passed in opts.
// ═════════════════════════════════════════════════════════════════════════════
function buildTab_(sheet, headers, opts) {
  opts = opts || {};
  var numCols = headers.length;

  sheet.getRange(1, 1, 1, numCols).setValues([headers]);
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

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=MOD(ROW(),2)=0')
      .setBackground('#F7F4EE')
      .setRanges([sheet.getRange(2, 1, 1000, numCols)])
      .build()
  ]);

  // Column widths — sensible default from header length, overridable per column
  headers.forEach(function (h, i) {
    var w = (opts.widths && opts.widths[h]) || Math.max(120, Math.min(260, h.length * 9 + 40));
    sheet.setColumnWidth(i + 1, w);
  });

  function colOf(name) { return headers.indexOf(name) + 1; }

  (opts.textCols || []).forEach(function (name) {
    var col = colOf(name);
    if (col) sheet.getRange(2, col, 1000, 1).setNumberFormat('@');
  });
  (opts.dateTimeCols || []).forEach(function (name) {
    var col = colOf(name);
    if (col) sheet.getRange(2, col, 1000, 1).setNumberFormat('MM/dd/yyyy hh:mm a');
  });
  (opts.dateCols || []).forEach(function (name) {
    var col = colOf(name);
    if (col) sheet.getRange(2, col, 1000, 1).setNumberFormat('MM/dd/yyyy');
  });
  (opts.currencyCols || []).forEach(function (name) {
    var col = colOf(name);
    if (col) sheet.getRange(2, col, 1000, 1).setNumberFormat('$#,##0.00');
  });
  Object.keys(opts.dropdowns || {}).forEach(function (name) {
    var col = colOf(name);
    if (!col) return;
    sheet.getRange(2, col, 1000, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(opts.dropdowns[name], true)
        .setAllowInvalid(false)
        .build()
    );
  });
}

// ── Per-tab formatting options ──────────────────────────────────────────────
var STATUS_OPTIONS_INTAKE = ['New', 'Reviewing', 'Awaiting Documents', 'Quote Sent', 'Approved', 'Processing', 'Completed', 'Cancelled'];

function apostilleTabOpts_() {
  return {
    textCols: ['Request ID'],
    dateTimeCols: ['Submission Date/Time', 'Acknowledgment Timestamp'],
    currencyCols: ['Estimated Total'],
    dropdowns: {
      'Review Speed':              ['Standard Review', 'Same-Day Review'],
      'Processing Speed':          ['Standard Processing', 'Rush Processing'],
      'Return Delivery':           ['USPS Priority', 'Overnight', 'International'],
      'Certified Copy / Original': ['Yes', 'No', 'Not Sure'],
      'Already Notarized':         ['Yes', 'No', 'Not Sure'],
      'Corporate Status':          ['Yes', 'No', 'Not Sure', 'Not Applicable'],
      'Documents Provided Later':  ['Yes', 'No'],
      'Acknowledgment Accepted':   ['Yes', 'No'],
      'Status': STATUS_OPTIONS_INTAKE
    }
  };
}

function ronTabOpts_() {
  return {
    textCols: ['Request ID'],
    dateTimeCols: ['Submission Date/Time', 'Acknowledgment Timestamp'],
    dateCols: ['Preferred Appointment Date'],
    currencyCols: ['Estimated Total'],
    dropdowns: {
      'Witness Required':          ['Yes', 'No'],
      'ASAP Requested':            ['Yes', 'No'],
      'Documents Provided Later':  ['Yes', 'No'],
      'Acknowledgment Accepted':   ['Yes', 'No'],
      'BlueNotary Invitation Sent':['Yes', 'No'],
      'Payment Status':            ['Not Started', 'Invitation Sent', 'Paid', 'Refunded'],
      'Session Status':            ['Not Scheduled', 'Scheduled', 'Completed', 'No Show', 'Cancelled'],
      'Status': ['New', 'Reviewing', 'Documents Requested', 'Ready for Invitation', 'Invitation Sent', 'Completed', 'Cancelled']
    }
  };
}

function fingerprintingTabOpts_() {
  var consentCols = ['Consent - Valid ID Provided', 'Consent - Blank FD-258 Cards',
    'Consent - Appointment Only', 'Consent - Confirmation Understood', 'Consent - Fingerprint & Terms'];
  var dropdowns = { 'Status': ['New', 'Confirmed', 'Rescheduled', 'Completed', 'No Show', 'Cancelled'] };
  consentCols.forEach(function (c) { dropdowns[c] = ['Yes', 'No']; });
  return {
    textCols: ['Request ID'],
    dateTimeCols: ['Submission Date/Time'],
    dateCols: ['Appointment Date'],
    currencyCols: ['Estimated Total'],
    dropdowns: dropdowns
  };
}

function translationTabOpts_() {
  var dropdowns = { 'Status': STATUS_OPTIONS_INTAKE };
  ['Add-on: Notarization', 'Add-on: Apostille', 'Add-on: Rush', 'Add-on: Hard Copy'].forEach(function (c) {
    dropdowns[c] = ['Yes', 'No'];
  });
  return {
    textCols: ['Request ID'],
    dateTimeCols: ['Submission Date/Time'],
    currencyCols: ['Estimated Total'],
    dropdowns: dropdowns
  };
}

function customersTabOpts_() {
  return {
    currencyCols: ['Total Estimated Value'],
    dateCols: ['First Request Date']
  };
}
function paymentsTabOpts_() {
  return {
    currencyCols: ['Amount'],
    dateCols: ['Payment Date'],
    dropdowns: { 'Payment Status': ['Not Started', 'Invoice Sent', 'Partially Paid', 'Paid', 'Refunded'] }
  };
}
function communicationsTabOpts_() {
  return {
    dateTimeCols: ['Date/Time'],
    dropdowns: {
      'Channel':   ['Email', 'Phone', 'Text', 'In-Person', 'Other'],
      'Direction': ['Inbound', 'Outbound']
    }
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// buildDashboardTab_ — cross-service summary. Total requests and status
// breakdown per service tab, using COUNTIF against each tab's own Request ID
// and Status columns. Kept intentionally simpler than the older, single-
// service dashboard pattern in scripts/Code.gs — this one is meant to give a
// one-glance view across all four services from a single tab.
// ═════════════════════════════════════════════════════════════════════════════
// Converts a 1-based column number to a spreadsheet letter (1→A, 27→AA …)
function colLetter_(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function buildDashboardTab_(dash, ss) {
  dash.getRange(1, 1, 1, 4).merge()
    .setValue('Ink & Seal Tracker — Dashboard')
    .setBackground('#0B1829').setFontColor('#FFFFFF').setFontWeight('bold')
    .setFontSize(14).setVerticalAlignment('middle').setHorizontalAlignment('left');
  dash.setRowHeight(1, 48);
  dash.setRowHeight(2, 10);

  var services = [
    { label: 'Apostille',      tab: TAB_APOSTILLE,      headers: AP_HEADERS,  statuses: STATUS_OPTIONS_INTAKE },
    { label: 'RON',             tab: TAB_RON,             headers: RON_HEADERS, statuses: ['New', 'Reviewing', 'Documents Requested', 'Ready for Invitation', 'Invitation Sent', 'Completed', 'Cancelled'] },
    { label: 'Fingerprinting',  tab: TAB_FINGERPRINTING,  headers: FP_HEADERS,  statuses: ['New', 'Confirmed', 'Rescheduled', 'Completed', 'No Show', 'Cancelled'] },
    { label: 'Translation',     tab: TAB_TRANSLATION,     headers: TR_HEADERS,  statuses: STATUS_OPTIONS_INTAKE }
  ];

  var r = 3;
  dash.getRange(r, 1).setValue('Service');
  dash.getRange(r, 2).setValue('Total Requests');
  dash.getRange(r, 3).setValue('Status');
  dash.getRange(r, 4).setValue('Count');
  dash.getRange(r, 1, 1, 4).setBackground('#0B1829').setFontColor('#C49A4A').setFontWeight('bold').setFontSize(10);
  dash.setRowHeight(r, 28);
  r++;

  services.forEach(function (svc, si) {
    var reqIdCol = colLetter_(svc.headers.indexOf('Request ID') + 1);
    var statusCol = colLetter_(svc.headers.indexOf('Status') + 1);

    var startRow = r;
    dash.getRange(r, 1).setValue(svc.label);
    dash.getRange(r, 2).setFormula('=IFERROR(COUNTA(\'' + svc.tab + '\'!' + reqIdCol + ':' + reqIdCol + ')-1,0)');

    svc.statuses.forEach(function (status, i) {
      dash.getRange(r, 3).setValue(status);
      dash.getRange(r, 4).setFormula(
        '=IFERROR(COUNTIF(\'' + svc.tab + '\'!' + statusCol + ':' + statusCol + ',"' + status + '"),0)'
      );
      if (i % 2 === 1) dash.getRange(r, 3, 1, 2).setBackground('#F7F4EE');
      dash.setRowHeight(r, 24);
      r++;
    });

    // Merge the service name + total-requests cells down across their status rows
    dash.getRange(startRow, 1, svc.statuses.length, 1).merge().setVerticalAlignment('middle').setFontWeight('bold');
    dash.getRange(startRow, 2, svc.statuses.length, 1).merge().setVerticalAlignment('middle');
    if (si % 2 === 1) dash.getRange(startRow, 1, svc.statuses.length, 2).setBackground('#F7F4EE');

    r++; // spacer row between services
  });

  dash.setColumnWidth(1, 150);
  dash.setColumnWidth(2, 130);
  dash.setColumnWidth(3, 200);
  dash.setColumnWidth(4, 90);
  dash.setFrozenRows(3);
}


// ═════════════════════════════════════════════════════════════════════════════
// auditTrackerSchema — verification function. Logs every tab name and every
// header in row 1, so the live schema can be checked against the approved
// field-by-field audit before anything is connected.
// ═════════════════════════════════════════════════════════════════════════════
function auditTrackerSchema() {
  if (!INK_SEAL_TRACKER_ID || INK_SEAL_TRACKER_ID === 'PASTE_NEW_TRACKER_SHEET_ID_HERE') {
    throw new Error('auditTrackerSchema: INK_SEAL_TRACKER_ID is not configured — run createInkSealTracker() first.');
  }
  var ss = SpreadsheetApp.openById(INK_SEAL_TRACKER_ID);
  Logger.log('=== Ink & Seal Tracker schema audit ===');
  Logger.log('Spreadsheet: ' + ss.getName() + ' | ' + ss.getUrl());
  ss.getSheets().forEach(function (sheet) {
    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    Logger.log('');
    Logger.log('── Tab: "' + sheet.getName() + '" (' + headers.length + ' columns) ──');
    headers.forEach(function (h, i) {
      Logger.log('  ' + (i + 1) + '. ' + h);
    });
  });
  Logger.log('');
  Logger.log('=== Audit complete — ' + ss.getSheets().length + ' tabs total ===');
}


// ═════════════════════════════════════════════════════════════════════════════
// getHeaders_ — reads the sheet's actual live row 1 (so appendRow places
// values by NAME, not position, matching the pattern already proven in
// scripts/Code.gs); falls back to the passed-in constant only if the sheet
// is completely empty.
// ═════════════════════════════════════════════════════════════════════════════
function getHeaders_(sheet, fallbackHeaders) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return fallbackHeaders.slice();
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

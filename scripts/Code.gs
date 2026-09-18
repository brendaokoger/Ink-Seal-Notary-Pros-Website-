// ─────────────────────────────────────────────────────────────────────────────
// Ink & Seal Notary Pros — Apostille + RON Intake
//
// LIVE WEB APP FUNCTIONS  (do NOT redeploy unless doPost changes)
//   doPost()   — routes each submission by type:
//                  - JSON action:'upload_files'      -> handleFileUpload()
//                  - formType containing 'translation' -> handleTranslationSubmission()
//                    (writes to SHEET_ID — the ORIGINAL spreadsheet, untouched)
//                  - formType === 'ron'               -> handleRonSubmission()
//                    (writes to the RON Requests tab in the SAME spreadsheet
//                    as Apostille — see INK_SEAL_SPREADSHEET_ID below)
//                  - everything else (default)         -> Apostille intake,
//                    writes to the Apostille Intake tab (APOSTILLE_SHEET_NAME)
//                    — THIS BRANCH IS UNCHANGED by the RON work below.
//   doGet()    — health-check endpoint
//
// SETUP / MIGRATION FUNCTIONS  (run once from the GAS editor — no redeployment needed)
//   createApostilleIntakeSheet()      — creates a NEW spreadsheet from
//                                       scratch. Already run once for the
//                                       live Apostille Intake Tracker — do
//                                       NOT re-run this against the live
//                                       spreadsheet; it is only for
//                                       provisioning a brand-new workbook.
//   addDestinationEligibilityColumn() — safe, idempotent migration for the
//                                       Apostille Intake tab. Already applied
//                                       to the live sheet if you're reading
//                                       this after that rollout.
//   createRONRequestsTab()            — safe, idempotent: adds the "RON
//                                       Requests" tab to the SAME spreadsheet
//                                       used by Apostille, if it doesn't
//                                       already exist. Never touches the
//                                       Apostille Intake tab. Run this once.
//   setupApostilleTracker()           — legacy admin utility for the OLD/
//                                       ORIGINAL spreadsheet only (SHEET_ID)
//                                       — unrelated to the Apostille Intake
//                                       Tracker or RON Requests, left as-is.
//   buildDashboard()                  — same: legacy dashboard builder for
//                                       the OLD spreadsheet (SHEET_ID) only.
//
// ── How to run createRONRequestsTab ──────────────────────────────────────────
//   1. Paste this file into your Apps Script project (replace all).
//   2. Save  (Ctrl+S / Cmd+S).
//   3. In the function dropdown at the top, choose  createRONRequestsTab.
//   4. Click Run.  Approve any permission prompt.
//   5. Check Execution Log for confirmation. No redeployment is required
//      for this step alone — but see the note on doPost/handleFileUpload
//      changes below: THOSE require a new Web App deployment version
//      before RON submissions will actually reach this code.
// ─────────────────────────────────────────────────────────────────────────────

// SHEET_ID / SHEET_NAME point at the ORIGINAL spreadsheet. It hosts the
// "Translation Requests" tab and is used ONLY by handleTranslationSubmission
// below — the Apostille flow no longer reads or writes this spreadsheet.
var SHEET_ID   = '1qf9R3QLeL8gGCcFuWa0BrVIGmPm_uBqft4cDkuaZ7gI';
var SHEET_NAME = 'ink_seal_apostille_tracker (1)';

// The Apostille 5-step form writes to its OWN, separate spreadsheet — created
// by createApostilleIntakeSheet() below. Run that function once from the Apps
// Script editor, then paste the Sheet ID it logs into APOSTILLE_SHEET_ID here
// and save. Until this is set to a real ID, Apostille submissions will fail
// with a clear error rather than silently writing to the wrong spreadsheet.
//
// This is UNCHANGED — variable name and value both kept exactly as-is so
// nothing about the live, working Apostille flow is disturbed. The owner is
// renaming this spreadsheet's display name to "Ink & Seal Tracker" — that
// does NOT change its Sheet ID, so no code change is needed for that rename.
var APOSTILLE_SHEET_ID   = 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE';
var APOSTILLE_SHEET_NAME = 'Apostille Intake';

// RON now shares the SAME spreadsheet as Apostille (per this rollout) rather
// than being a separate workbook. This alias exists purely so RON-specific
// code below reads clearly as "the shared Ink & Seal spreadsheet" instead of
// implying it's Apostille-only — it is always exactly equal to
// APOSTILLE_SHEET_ID and never diverges from it. Nothing about
// APOSTILLE_SHEET_ID itself changes.
var INK_SEAL_SPREADSHEET_ID = APOSTILLE_SHEET_ID;
var RON_SHEET_NAME = 'RON Requests';

// Translation Requests — separate tab in the same spreadsheet
var TRANSLATION_SHEET_NAME = 'Translation Requests';
var TRANSLATION_HEADERS = [
  'Order Number',           'Intake Date',            'Full Name',
  'Email Address',          'Phone Number',           'Source Language',
  'Target Language',        'Document Type',          'Number of Pages',
  'Add-on: Notarization',   'Add-on: Apostille',      'Add-on: Rush',
  'Add-on: Hard Copy',      'Special Instructions',   'Files Uploaded',
  'Estimated Total',        'Status',                 'Quote Amount',
  'Payment Status',         'Drive Folder Link'
];

// 28 columns — order must match the Google Sheet header row. Reflects the
// CURRENT 5-step Apostille form. getHeaders() reads the sheet's actual
// live row 1 at runtime (see below), so appendRow places each value by
// NAME, not position — the live sheet's column order does not need to
// match this array exactly, only the column NAMES need to match.
//
// Replaces the older 32-column layout: dropped 'Order Number' (renamed
// 'Request ID'), 'Certified Vital Record' (the isVitalRecord question no
// longer exists in the form), 'RON Needed' (never asked in this form),
// 'Signature' (the draw/type-to-sign UI was removed — no valid source
// remains), 'Dropbox Folder Link' (renamed 'Upload Folder / File Link'),
// and the admin-only Quote/Payment/Shipment-tracking columns that were
// never populated from form data in the first place (Status is kept —
// it's set to a default on every new row; the rest can still be added
// back manually in the live sheet as admin-only columns if wanted, they
// just won't be auto-populated by doPost).
//
// 'Destination Eligibility' added alongside 'Destination Country' — the
// Step-1 Hague Apostille Convention eligibility check (see
// /js/hague-apostille-data.js on the website) blocks submission entirely
// for a non-eligible destination, so this column is always populated with
// 'Hague Apostille — Eligible' on every row that reaches the sheet.
var HEADERS = [
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

// Maps sheet column names → form field values. Only 'Status' has no form
// source (defaulted below) and no admin-only columns remain unmapped —
// every column here is populated from the actual current form.
var FIELD_MAP = {
  'Request ID':                  function (p, m) { return m.requestId;              },
  'Submission Date/Time':        function (p, m) { return m.submittedAt;            },
  'Full Name':                   function (p)    { return p.fullName              || ''; },
  'Email':                       function (p)    { return p.email                 || ''; },
  'Phone':                       function (p)    { return p.phone                 || ''; },
  'State':                       function (p)    { return p.state                 || ''; },
  'Preferred Contact Method':    function (p)    { return p.preferredContactMethod|| ''; },
  'Destination Country':         function (p)    { return p.destinationCountry    || ''; },
  // Populated client-side only for a destination the Hague eligibility
  // check (Step 1) approved — see /js/hague-apostille-data.js. A
  // non-eligible destination can't reach Submit at all, so this is
  // expected to be 'Hague Apostille — Eligible' on every row; it's read
  // through rather than hard-coded here so a row is never mis-labeled if
  // the client-side field is ever empty for an unexpected reason.
  'Destination Eligibility':     function (p)    { return p.destinationEligibility || ''; },
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
  // Stored as a real number (not the raw string) so the sheet's currency
  // number format actually applies to it, per this column's "$#,##0.00" format.
  'Estimated Total':             function (p)    { var n = parseFloat(p.estimatedTotal); return isNaN(n) ? (p.estimatedTotal || '') : n; },
  'Documents Provided Later':    function (p)    { return p.documentsLater ? 'Yes' : 'No'; },
  'Upload Folder / File Link':   function (p)    { return p.uploadFolderLink      || ''; },
  'Additional Notes':            function (p)    { return p.notes                 || ''; },
  'Acknowledgment Accepted':     function (p)    { return p.ack1 ? 'Yes' : 'No';        },
  // m.submittedAt is a real Date object (see doPost) so Sheets date/time
  // formatting, sorting, and filtering work correctly on this column.
  'Acknowledgment Timestamp':    function (p, m) { return p.ack1 ? m.submittedAt : '';  },
  'Status':                      function ()     { return 'New';                        }
};

// ─────────────────────────────────────────────────────────────────────────────
// RON (Remote Online Notarization) — separate tab, separate Request ID
// sequence, separate field map. Lives in the SAME spreadsheet as Apostille
// (INK_SEAL_SPREADSHEET_ID) but in its own "RON Requests" tab — entirely
// additive, does not read or write anything in the Apostille Intake tab.
//
// 27 columns, order must match the RON Requests sheet's header row.
// getHeaders() reads the sheet's actual live row 1 at runtime (same as the
// Apostille path), so appendRow places each value by NAME, not position.
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

// Summarizes the RON form's dynamic additional-signer fields
// (additionalSigner1Name/Email, additionalSigner2Name/Email, ...) into the
// single "Additional Signers" column, since the sheet tracks one column for
// this rather than a variable number of per-signer columns. Returns
// 'None' when signerCount !== 'yes'.
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

// Maps RON sheet column names -> form field values. Field names on the left
// of each `p.<name>` match the RON form's actual current input `name`
// attributes (services/notary/index.html) — see the audit note in the
// accompanying report for the full list.
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
  // witnessRequired on the form is a single field with three values
  // (no / own / was) — split here into the two columns the sheet tracks.
  'Witness Required':           function (p)    { return (p.witnessRequired === 'own' || p.witnessRequired === 'was') ? 'Yes' : 'No'; },
  'Witness Source':             function (p)    {
    return p.witnessRequired === 'own' ? 'Client-Provided'
         : p.witnessRequired === 'was' ? 'Ink & Seal Assistance (+$10)'
         : '';
  },
  // Blank when "As Soon As Possible" was selected — the form makes these two
  // fields optional (and clears them) in that case; see updateAsap() client-side.
  'Preferred Appointment Date': function (p)    { return p.asapPreferred ? '' : (p.appointmentDate || ''); },
  'Preferred Appointment Time': function (p)    { return p.asapPreferred ? '' : (p.appointmentTime || ''); },
  'Time Zone':                  function (p)    { return p.timezone              || ''; },
  'ASAP Requested':             function (p)    { return p.asapPreferred ? 'Yes' : 'No'; },
  // Derived from whether any files actually accompanied this submission
  // (uploadedFileCount is sent by the client alongside the intake row,
  // mirroring the Apostille form's same pattern) — the RON form has no
  // separate "I'll provide documents later" toggle of its own; upload is
  // simply optional, so "provided later" is true exactly when 0 files were
  // selected at submission time.
  'Documents Provided Later':   function (p)    { return (parseInt(p.uploadedFileCount, 10) || 0) > 0 ? 'No' : 'Yes'; },
  'Upload Folder / File Link':  function (p)    { return p.uploadFolderLink      || ''; },
  'Estimated Total':            function (p)    { var n = parseFloat(p.estimatedTotal); return isNaN(n) ? (p.estimatedTotal || '') : n; },
  'Additional Notes':           function (p)    { return p.notes                 || ''; },
  'Acknowledgment Accepted':    function (p)    { return p.ronTermsAck ? 'Yes' : 'No';   },
  'Acknowledgment Timestamp':   function (p, m) { return p.ronTermsAck ? m.submittedAt : ''; },
  // Admin/operational columns — not populated by the form itself, default
  // to their "nothing has happened yet" state on every new row. Staff
  // update these manually (or future BlueNotary automation will, per the
  // architecture note on handleRonSubmission below) as a request progresses.
  'BlueNotary Invitation Sent': function ()     { return 'No';             },
  'Payment Status':             function ()     { return 'Not Started';    },
  'Session Status':             function ()     { return 'Not Scheduled';  },
  'Status':                     function ()     { return 'New';            }
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

  // Route translation form submissions to the Translation Requests tab
  var ep = e.parameter || {};
  if (ep.formType && ep.formType.toLowerCase().indexOf('translation') !== -1) {
    return handleTranslationSubmission(e);
  }

  // Route RON (Remote Online Notarization) submissions to the RON Requests
  // tab. Checked with an EXACT match ('ron'), not .indexOf(), so it can
  // never accidentally intercept anything else — everything below this
  // check, including the entire Apostille try block, is unchanged and
  // still runs exactly as before for every non-RON, non-translation,
  // non-upload submission.
  if (ep.formType && ep.formType.toLowerCase() === 'ron') {
    return handleRonSubmission(e);
  }

  try {
    if (!APOSTILLE_SHEET_ID || APOSTILLE_SHEET_ID === 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE') {
      throw new Error('APOSTILLE_SHEET_ID is not configured — run createApostilleIntakeSheet() ' +
        'and paste the resulting Sheet ID into APOSTILLE_SHEET_ID at the top of Code.gs.');
    }

    var ss    = SpreadsheetApp.openById(APOSTILLE_SHEET_ID);
    var sheet = ss.getSheetByName(APOSTILLE_SHEET_NAME) || ss.getSheets()[0];
    var p     = e.parameter;

    Logger.log('=== doPost called ===');
    Logger.log('Spreadsheet ID   : ' + APOSTILLE_SHEET_ID);
    Logger.log('Spreadsheet name : ' + ss.getName());
    Logger.log('APOSTILLE_SHEET_NAME const : ' + APOSTILLE_SHEET_NAME);
    Logger.log('Worksheet opened : ' + sheet.getName());
    Logger.log('Rows before append: ' + sheet.getLastRow());

    var tz = Session.getScriptTimeZone();
    // A real Date object — not a pre-formatted string — so "Submission
    // Date/Time" and "Acknowledgment Timestamp" behave as true date/time
    // cells in Sheets (sortable, filterable, formattable).
    var submittedAt = new Date();

    // Request ID is always generated here — the client never sends one,
    // since none exists until a save is actually confirmed. Uses a
    // lock-protected, per-day persistent counter (see generateRequestId),
    // not row count, so concurrent submissions can't collide.
    var requestId = generateRequestId();

    var fullName = (p.fullName || '').trim();

    var reviewLabel = (p.sameDayReview || '').toLowerCase().trim() === 'same-day'
      ? 'Same-Day Review'
      : 'Standard Review';

    var processingLabel = (p.processingSpeed || '').toLowerCase().trim() === 'rush'
      ? 'Rush Processing'
      : 'Standard Processing';

    var deliveryRaw   = (p.returnShipping || '').toLowerCase().trim();
    var deliveryLabel = deliveryRaw === 'overnight'    ? 'Overnight'
                       : deliveryRaw === 'international' ? 'International'
                       : 'USPS Priority';

    var meta = {
      requestId: requestId, submittedAt: submittedAt,
      reviewLabel: reviewLabel, processingLabel: processingLabel,
      deliveryLabel: deliveryLabel
    };

    var headers = getHeaders(sheet);
    sheet.appendRow(headers.map(function (h) {
      return FIELD_MAP.hasOwnProperty(h) ? FIELD_MAP[h](p, meta) : '';
    }));

    Logger.log('appendRow complete — row number: ' + sheet.getLastRow());
    Logger.log('Request: ' + requestId + ' | Name: ' + fullName);

    // 'order' kept alongside 'requestId' for backward compatibility with
    // any code still reading the old key name (e.g. the Drive-upload
    // hand-off) — both carry the same value.
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', requestId: requestId, order: requestId }))
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
// handleRonSubmission — receives RON (Remote Online Notarization) form
// submissions, routed here from doPost() when formType === 'ron'. Mirrors
// the Apostille intake branch's structure and reliability guarantees
// (lock-protected Request ID generated server-side, real Date objects for
// timestamp columns, append-by-header-name) but is fully self-contained —
// it does not call, share state with, or depend on anything in the
// Apostille branch above, and never touches the Apostille Intake tab.
//
// Writes to the "RON Requests" tab inside the SAME spreadsheet as
// Apostille (INK_SEAL_SPREADSHEET_ID). If that tab doesn't exist yet (i.e.
// createRONRequestsTab() hasn't been run), it is created automatically
// here on first submission — safe because the creation logic itself is
// idempotent (see createRonRequestsTab_ below), so this can never
// duplicate or clobber an existing tab even under concurrent requests.
//
// ── Future BlueNotary automation hook point ──
// This function intentionally does NOT call any BlueNotary API — none is
// wired up, and no BlueNotary credentials are referenced anywhere in this
// project. When that integration is built, the natural point to add it is
// right after the row is appended below (e.g. queue a session-creation
// job keyed by requestId) — no changes to the Request ID generation, the
// sheet routing, or the response contract would be needed to add that.
// ─────────────────────────────────────────────────────────────────────────────
function handleRonSubmission(e) {
  try {
    if (!INK_SEAL_SPREADSHEET_ID || INK_SEAL_SPREADSHEET_ID === 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE') {
      throw new Error('INK_SEAL_SPREADSHEET_ID is not configured — set APOSTILLE_SHEET_ID at the top of Code.gs.');
    }

    var ss    = SpreadsheetApp.openById(INK_SEAL_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(RON_SHEET_NAME);
    if (!sheet) {
      // Auto-provision on first use — idempotent, see createRonRequestsTab_.
      // Re-checks for the tab's existence itself, so a race between two
      // concurrent first-ever RON submissions can't create it twice.
      sheet = createRonRequestsTab_(ss);
    }

    var p = e.parameter;

    Logger.log('=== handleRonSubmission called ===');
    Logger.log('Spreadsheet ID : ' + INK_SEAL_SPREADSHEET_ID);
    Logger.log('Worksheet      : ' + sheet.getName());
    Logger.log('Rows before append: ' + sheet.getLastRow());

    // Real Date object — not a pre-formatted string — same reasoning as
    // the Apostille branch: correct Sheets date/time sort/filter/format.
    var submittedAt = new Date();

    // RON's own lock-protected, per-day counter — fully independent of
    // the Apostille Request ID sequence (see generateRonRequestId).
    var requestId = generateRonRequestId();

    var fullName = (p.fullName || '').trim();

    var meta = { requestId: requestId, submittedAt: submittedAt };

    var headers = getHeaders(sheet);
    sheet.appendRow(headers.map(function (h) {
      return RON_FIELD_MAP.hasOwnProperty(h) ? RON_FIELD_MAP[h](p, meta) : '';
    }));

    Logger.log('appendRow complete — row number: ' + sheet.getLastRow());
    Logger.log('RON Request: ' + requestId + ' | Name: ' + fullName);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', requestId: requestId, order: requestId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleRonSubmission error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// File-type/size limits for RON uploads only (server-side validation, per
// the RON GOOGLE DRIVE UPLOAD requirement). The Apostille upload path below
// deliberately does NOT apply these — its existing, live behavior (accept
// whatever the client sends) is left completely unchanged.
var RON_ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png'
];
var RON_ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
var RON_MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file

// ─────────────────────────────────────────────────────────────────────────────
// handleFileUpload — called by doPost when the JSON body contains action:'upload_files'
//
// Routes by Request ID prefix so ONE function safely serves both flows
// without duplicating the folder/file-save logic:
//   - orderNumber starts with 'IS-RON-'  -> RON path (new)
//   - anything else (incl. 'IS-AP-...')  -> Apostille path (UNCHANGED —
//     identical folder names, identical sheet-writeback logic, identical
//     response shape to before this RON work existed)
//
// 1. Finds (or creates) "Ink & Seal Notary Pros" in Drive.
// 2. Finds (or creates) "Apostille Requests" or "RON Requests" inside it,
//    depending on the route above.
// 3. Finds (or creates) a leaf folder named EXACTLY the Request ID inside
//    that — idempotent (find-or-create, never always-create), so retrying
//    an upload for the same Request ID reuses the same folder instead of
//    creating a duplicate. This is the mechanism that satisfies "do NOT
//    create another RON request on retry" for uploads.
// 4. RON only: validates each file's type (PDF/Word/JPG/PNG) and size
//    (<=15MB) before saving; anything rejected is skipped and listed in
//    the response rather than silently dropped or silently saved anyway.
// 5. Decodes each accepted base64 file and saves it inside the request folder.
// 6. Writes the folder URL back to the matching row — Apostille writes to
//    the Apostille Intake tab (falling back to the Translation Requests
//    spreadsheet, exactly as before); RON writes to the RON Requests tab in
//    the same shared spreadsheet (INK_SEAL_SPREADSHEET_ID).
// ─────────────────────────────────────────────────────────────────────────────
function handleFileUpload(p) {
  try {
    var orderNumber = (p.orderNumber || '').trim();
    var clientName  = (p.clientName  || 'Unknown Client').trim();
    var files       = p.files || [];
    var isRon       = orderNumber.indexOf('IS-RON-') === 0;

    // 1. Find or create the top-level company folder (shared by both flows)
    var topName   = 'Ink & Seal Notary Pros';
    var topIter   = DriveApp.getFoldersByName(topName);
    var topFolder = topIter.hasNext() ? topIter.next() : DriveApp.createFolder(topName);

    // 2. Find or create the type-specific requests folder inside it
    var subfolderName = isRon ? 'RON Requests' : 'Apostille Requests';
    var reqsIter   = topFolder.getFoldersByName(subfolderName);
    var reqsFolder = reqsIter.hasNext() ? reqsIter.next() : topFolder.createFolder(subfolderName);

    // 3. Find or create the per-request leaf folder, named exactly the Request ID
    var leafName    = orderNumber || clientName;
    var leafIter    = reqsFolder.getFoldersByName(leafName);
    var orderFolder = leafIter.hasNext() ? leafIter.next() : reqsFolder.createFolder(leafName);

    // 4-5. Decode and save each file (RON: validate type/size first)
    var uploadCount = 0;
    var skipped = [];
    files.forEach(function (f) {
      var dataUrl = f.data || '';
      var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;

      if (isRon) {
        var mime = m[1];
        var ext  = (f.name || '').split('.').pop().toLowerCase();
        var typeOk = RON_ALLOWED_MIME.indexOf(mime) !== -1 || RON_ALLOWED_EXT.indexOf(ext) !== -1;
        if (!typeOk) { skipped.push((f.name || 'file') + ' — unsupported file type'); return; }
        var approxBytes = Math.floor((m[2].length * 3) / 4); // base64 length -> approx decoded bytes
        if (approxBytes > RON_MAX_FILE_BYTES) { skipped.push((f.name || 'file') + ' — file too large (15MB limit)'); return; }
      }

      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], f.name);
      orderFolder.createFile(blob);
      uploadCount++;
    });

    // 6. Get the Drive folder URL
    var folderUrl = orderFolder.getUrl();

    // 7. Write the folder URL back to the matching sheet row.
    if (orderNumber) {
      var wrote = false;
      if (isRon) {
        // RON path: write to the RON Requests tab in the shared spreadsheet.
        if (INK_SEAL_SPREADSHEET_ID && INK_SEAL_SPREADSHEET_ID !== 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE') {
          try {
            var ronSs = SpreadsheetApp.openById(INK_SEAL_SPREADSHEET_ID);
            wrote = writeFolderLinkToSheet_(ronSs, RON_SHEET_NAME, 'Upload Folder / File Link', orderNumber, folderUrl);
          } catch (ronErr) {
            Logger.log('handleFileUpload: could not open RON Requests tab — ' + ronErr.toString());
          }
        }
      } else {
        // Apostille path — UNCHANGED from before this RON work: try the
        // Apostille Intake Tracker first, then fall back to the (separate,
        // untouched) Translation Requests spreadsheet.
        if (APOSTILLE_SHEET_ID && APOSTILLE_SHEET_ID !== 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE') {
          try {
            var apoSs = SpreadsheetApp.openById(APOSTILLE_SHEET_ID);
            wrote = writeFolderLinkToSheet_(apoSs, APOSTILLE_SHEET_NAME, 'Upload Folder / File Link', orderNumber, folderUrl);
          } catch (apoErr) {
            Logger.log('handleFileUpload: could not open APOSTILLE_SHEET_ID — ' + apoErr.toString());
          }
        }
        if (!wrote) {
          try {
            var transSs = SpreadsheetApp.openById(SHEET_ID);
            writeFolderLinkToSheet_(transSs, TRANSLATION_SHEET_NAME, 'Drive Folder Link', orderNumber, folderUrl);
          } catch (transErr) {
            Logger.log('handleFileUpload: could not open SHEET_ID (translation) — ' + transErr.toString());
          }
        }
      }
    }

    Logger.log('handleFileUpload: order=' + orderNumber + ' client=' + clientName +
               ' isRon=' + isRon + ' uploads=' + uploadCount +
               ' skipped=' + skipped.length + ' url=' + folderUrl);

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

// ─────────────────────────────────────────────────────────────────────────────
// createApostilleIntakeSheet — run ONCE to create the NEW, separate Apostille
// Intake spreadsheet. Does NOT touch the original spreadsheet (SHEET_ID) in
// any way. After running, paste the logged Sheet ID into APOSTILLE_SHEET_ID
// at the top of this file.
// ─────────────────────────────────────────────────────────────────────────────
function createApostilleIntakeSheet() {
  var ss    = SpreadsheetApp.create('Ink & Seal — Apostille Intake Tracker');
  var sheet = ss.getActiveSheet();
  sheet.setName(APOSTILLE_SHEET_NAME);

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
    1:160, 2:150, 3:160, 4:200, 5:120, 6:100,
    7:170, 8:160, 9:190, 10:170, 11:140, 12:180,
    13:190, 14:180, 15:150, 16:150, 17:180, 18:120,
    19:150, 20:160, 21:140, 22:130, 23:170, 24:220,
    25:240, 26:160, 27:170, 28:150
  };
  Object.keys(widths).forEach(function (col) {
    sheet.setColumnWidth(Number(col), widths[col]);
  });

  addDropdown(sheet, 'Review Speed',              ['Standard Review','Same-Day Review']);
  addDropdown(sheet, 'Processing Speed',          ['Standard Processing','Rush Processing']);
  addDropdown(sheet, 'Return Delivery',           ['USPS Priority','Overnight','International']);
  addDropdown(sheet, 'Certified Copy / Original', ['Yes','No','Not Sure']);
  addDropdown(sheet, 'Already Notarized',         ['Yes','No','Not Sure']);
  addDropdown(sheet, 'Corporate Status',          ['Yes','No','Not Sure','Not Applicable']);
  addDropdown(sheet, 'Documents Provided Later',  ['Yes','No']);
  addDropdown(sheet, 'Acknowledgment Accepted',   ['Yes','No']);
  addDropdown(sheet, 'Status', [
    'New','Reviewing','Awaiting Documents','Quote Sent',
    'Approved','Processing','Completed','Cancelled'
  ]);

  // Request ID must stay plain text — never auto-convert to a number
  setColumnFormat(sheet, 'Request ID', '@');
  // Real date/time values (see doPost) so these format, sort, and filter correctly
  setColumnFormat(sheet, 'Submission Date/Time',     'MM/dd/yyyy hh:mm a');
  setColumnFormat(sheet, 'Acknowledgment Timestamp', 'MM/dd/yyyy hh:mm a');
  setColumnFormat(sheet, 'Estimated Total', '$#,##0.00');

  Logger.log('Apostille Intake Tracker created: ' + ss.getName());
  Logger.log('URL: '                             + ss.getUrl());
  Logger.log('>>> Paste this Sheet ID into APOSTILLE_SHEET_ID at the top of Code.gs:');
  Logger.log(ss.getId());
}

// ─────────────────────────────────────────────────────────────────────────────
// addDestinationEligibilityColumn — SAFE, IDEMPOTENT migration for the LIVE
// Apostille Intake Tracker (APOSTILLE_SHEET_ID). Run ONCE, manually, from the
// Apps Script editor's function dropdown. Safe to re-run any number of times.
//
// What it does:
//   1. Opens the EXISTING spreadsheet at APOSTILLE_SHEET_ID. Never creates a
//      new spreadsheet, never touches SHEET_ID (the original/Translation
//      spreadsheet).
//   2. Reads the sheet's live header row (row 1) — not the hard-coded
//      HEADERS array — so this reflects whatever the real sheet has today.
//   3. If 'Destination Eligibility' is already a header, makes NO changes
//      and logs that it already exists. This is what makes it safe to run
//      more than once.
//   4. Otherwise, inserts exactly ONE new column immediately after the
//      existing 'Destination Country' column, via Sheet.insertColumnAfter()
//      — the same operation as the Sheets UI's "Insert 1 column right".
//      This shifts every column at or after that position — its data,
//      formulas, data validation rules, and conditional-formatting ranges
//      — one position to the right automatically, without loss. Nothing
//      to the left of the insertion point is touched, and no existing
//      column's contents, order, or formatting is modified or deleted.
//   5. Writes the header 'Destination Eligibility' into the new column's
//      row-1 cell, and copies the 'Destination Country' header cell's
//      formatting onto it (format only — not its text) so the new header
//      cell matches the rest of the header row visually, then sets a
//      column width consistent with the one used by
//      createApostilleIntakeSheet() for this column.
//   6. Does not rebuild the sheet's active filter. Google Sheets natively
//      extends an existing filter's range to include a column inserted
//      inside its bounds (the same mechanism that shifts data and
//      validation on insert) — rebuilding it here would risk discarding
//      any column-specific filter criteria staff may already have set, so
//      this function deliberately leaves the filter alone. If the new
//      column doesn't show a filter control after running this, re-apply
//      the filter once by hand (Data > Create a filter) — no data is at
//      risk either way.
//
// Requires APOSTILLE_SHEET_ID to already be set to the live sheet's ID
// (see the constant near the top of this file). Throws — and makes no
// changes — if it is still the placeholder, or if 'Destination Country'
// can't be found in the live header row (refuses to guess where to insert).
// ─────────────────────────────────────────────────────────────────────────────
function addDestinationEligibilityColumn() {
  if (!APOSTILLE_SHEET_ID || APOSTILLE_SHEET_ID === 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE') {
    throw new Error('addDestinationEligibilityColumn: APOSTILLE_SHEET_ID is not configured — ' +
      'set it to the live Apostille Intake Tracker\'s Sheet ID before running this migration.');
  }

  var ss    = SpreadsheetApp.openById(APOSTILLE_SHEET_ID);
  var sheet = ss.getSheetByName(APOSTILLE_SHEET_NAME) || ss.getSheets()[0];

  var liveHeaders = getHeaders(sheet);
  var existingIdx = liveHeaders.indexOf('Destination Eligibility');
  if (existingIdx !== -1) {
    Logger.log('addDestinationEligibilityColumn: "Destination Eligibility" already exists ' +
      '(column ' + (existingIdx + 1) + ') — no changes made.');
    return;
  }

  var destCol = liveHeaders.indexOf('Destination Country') + 1; // 1-based; 0 if not found
  if (!destCol) {
    throw new Error('addDestinationEligibilityColumn: "Destination Country" column was not found in the ' +
      'live header row — refusing to guess where to insert "Destination Eligibility". No changes made.');
  }

  // Insert ONE new column immediately after "Destination Country". Sheets
  // shifts every column at or after this position — including data,
  // formulas, data validation, and conditional-format ranges anchored
  // there — one position to the right automatically.
  sheet.insertColumnAfter(destCol);
  var newCol = destCol + 1;

  var newHeaderCell = sheet.getRange(1, newCol);
  newHeaderCell.setValue('Destination Eligibility');
  // Copies formatting ONLY (background, font, weight, etc.) — does not
  // touch the value just set above — from the 'Destination Country'
  // header cell onto the new header cell, so it matches visually.
  sheet.getRange(1, destCol).copyFormatToRange(sheet, newCol, newCol, 1, 1);
  sheet.setColumnWidth(newCol, 190);

  Logger.log('addDestinationEligibilityColumn: inserted "Destination Eligibility" as column ' + newCol +
    ' (immediately after "Destination Country", column ' + destCol + ').');
  Logger.log('All existing columns, data, formatting, and data validation were preserved via ' +
    'Sheets\' native column-insert shifting. No existing column was modified or deleted.');
}

// ─────────────────────────────────────────────────────────────────────────────
// createRONRequestsTab — SAFE, IDEMPOTENT setup for the "RON Requests" tab.
// Run ONCE, manually, from the Apps Script editor's function dropdown.
// Safe to re-run any number of times.
//
// What it does:
//   1. Opens the EXISTING spreadsheet at INK_SEAL_SPREADSHEET_ID (the same
//      one Apostille already uses) — never creates a new spreadsheet.
//   2. Checks whether a "RON Requests" tab already exists.
//   3. If it exists: does NOT delete, clear, rebuild, or duplicate it —
//      logs that it already exists and returns.
//   4. If it does not exist: creates it via createRonRequestsTab_() below —
//      headers, header formatting, frozen row 1, filter, alternating row
//      banding, dropdowns, and number formats, matching the same visual
//      system as the Apostille Intake tab.
//   5. Never touches the Apostille Intake tab in any way — this function
//      does not open, read, or write it.
// ─────────────────────────────────────────────────────────────────────────────
function createRONRequestsTab() {
  if (!INK_SEAL_SPREADSHEET_ID || INK_SEAL_SPREADSHEET_ID === 'PASTE_NEW_APOSTILLE_SHEET_ID_HERE') {
    throw new Error('createRONRequestsTab: INK_SEAL_SPREADSHEET_ID is not configured — ' +
      'set APOSTILLE_SHEET_ID at the top of Code.gs to the shared spreadsheet\'s ID first.');
  }

  var ss = SpreadsheetApp.openById(INK_SEAL_SPREADSHEET_ID);
  var existing = ss.getSheetByName(RON_SHEET_NAME);
  if (existing) {
    Logger.log('createRONRequestsTab: "' + RON_SHEET_NAME + '" already exists — no changes made.');
    return;
  }

  createRonRequestsTab_(ss);
  Logger.log('createRONRequestsTab: created "' + RON_SHEET_NAME + '" in ' + ss.getName() + '.');
  Logger.log('The Apostille Intake tab was not opened, read, or modified by this function.');
}

// Internal builder — actually creates and formats the RON Requests sheet.
// Shared by createRONRequestsTab() (explicit, manual setup) and
// handleRonSubmission()'s auto-create-on-first-use fallback. Callers are
// responsible for checking whether the tab already exists first — this
// function always creates a new sheet via ss.insertSheet(), so calling it
// without that check would duplicate the tab.
function createRonRequestsTab_(ss) {
  var sheet = ss.insertSheet(RON_SHEET_NAME);
  var numCols = RON_HEADERS.length;

  sheet.getRange(1, 1, 1, numCols).setValues([RON_HEADERS]);
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
    1:160, 2:150, 3:160, 4:200, 5:120, 6:100,
    7:170, 8:180, 9:150, 10:170, 11:260, 12:140,
    13:210, 14:170, 15:170, 16:120, 17:140, 18:170,
    19:220, 20:130, 21:240, 22:160, 23:170, 24:190,
    25:150, 26:150, 27:150
  };
  Object.keys(widths).forEach(function (col) {
    sheet.setColumnWidth(Number(col), widths[col]);
  });

  ronAddDropdown_(sheet, 'Witness Required',           ['Yes', 'No']);
  ronAddDropdown_(sheet, 'ASAP Requested',              ['Yes', 'No']);
  ronAddDropdown_(sheet, 'Documents Provided Later',    ['Yes', 'No']);
  ronAddDropdown_(sheet, 'Acknowledgment Accepted',     ['Yes', 'No']);
  ronAddDropdown_(sheet, 'BlueNotary Invitation Sent',  ['Yes', 'No']);
  ronAddDropdown_(sheet, 'Payment Status',              ['Not Started', 'Invitation Sent', 'Paid', 'Refunded']);
  ronAddDropdown_(sheet, 'Session Status',              ['Not Scheduled', 'Scheduled', 'Completed', 'No Show', 'Cancelled']);
  ronAddDropdown_(sheet, 'Status', [
    'New', 'Reviewing', 'Documents Requested', 'Ready for Invitation',
    'Invitation Sent', 'Completed', 'Cancelled'
  ]);

  // Request ID must stay plain text — never auto-convert to a number
  ronSetColumnFormat_(sheet, 'Request ID', '@');
  ronSetColumnFormat_(sheet, 'Submission Date/Time',       'MM/dd/yyyy hh:mm a');
  ronSetColumnFormat_(sheet, 'Acknowledgment Timestamp',   'MM/dd/yyyy hh:mm a');
  ronSetColumnFormat_(sheet, 'Preferred Appointment Date', 'MM/dd/yyyy');
  ronSetColumnFormat_(sheet, 'Estimated Total',            '$#,##0.00');

  return sheet;
}

// RON-specific equivalents of addDropdown()/setColumnFormat() further down
// this file — those two look up column positions in the Apostille HEADERS
// array, so they must NOT be reused for the RON sheet (doing so would look
// up the wrong array and silently target the wrong column, or no column).
// These do the same job against RON_HEADERS instead.
function ronAddDropdown_(sheet, colName, options) {
  var col = RON_HEADERS.indexOf(colName) + 1;
  if (!col) return;
  sheet.getRange(2, col, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(options, true)
      .setAllowInvalid(false)
      .build()
  );
}

function ronSetColumnFormat_(sheet, colName, format) {
  var col = RON_HEADERS.indexOf(colName) + 1;
  if (!col) return;
  sheet.getRange(2, col, 1000, 1).setNumberFormat(format);
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
  var RC  = colLetter(colOf('Review Speed')); // was 'Review Type'

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
  var PC  = cl('Payment Status');       // admin-only column — not written by doPost, kept for manual staff use
  var QC  = cl('Quote Amount');         // admin-only column — not written by doPost, kept for manual staff use
  var RC  = cl('Review Speed');         // was 'Review Type'
  var OC  = cl('RON Needed');           // no longer a form field — formulas using this are IFERROR-wrapped
  var PSC = cl('Processing Start Date');
  var CC  = cl('Completion Date');
  var HC  = cl('Destination Country');
  var GC  = cl('State');
  var DC  = cl('Document Type');
  var FNC = cl('Full Name');            // was split 'Client First Name' + 'Client Last Name' — now a single column
  var LNC = cl('Client Last Name');     // no longer exists — resolves empty; the "First + Last" formula below degrades to showing Full Name plus a trailing blank, not a crash
  var AC  = cl('Request ID');           // was 'Order Number'

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
// TRANSLATION REQUESTS — separate sheet/tab
// ─────────────────────────────────────────────────────────────────────────────
function handleTranslationSubmission(e) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(TRANSLATION_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(TRANSLATION_SHEET_NAME);
      setupTranslationSheet_(sheet);
    }

    var p          = e.parameter;
    var tz         = Session.getScriptTimeZone();
    var intakeDate = Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy hh:mm a');
    var orderNum   = (p.orderNumber || '').trim();
    if (!orderNum) orderNum = generateTranslationOrderNumber_(sheet);

    var row = [
      orderNum,
      intakeDate,
      p.fullName            || '',
      p.email               || '',
      p.phone               || '',
      p.sourceLanguage      || '',
      p.targetLanguage      || '',
      p.documentType        || '',
      p.numberOfPages       || '',
      p.addonNotarization   ? 'Yes' : '',
      p.addonApostille      ? 'Yes' : '',
      p.addonRush           ? 'Yes' : '',
      p.addonHardCopy       ? 'Yes' : '',
      p.specialInstructions || '',
      p.uploadedFileCount   || '0',
      p.estimatedTotal      ? '$' + p.estimatedTotal : '',
      'Review Pending',
      '',  // Quote Amount — filled in by admin after review
      '',  // Payment Status
      p.driveFolderLink     || ''
    ];

    sheet.appendRow(row);

    Logger.log('Translation submission: order=' + orderNum + ' | name=' + (p.fullName || '') +
               ' | total=' + (p.estimatedTotal || ''));

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', order: orderNum }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleTranslationSubmission error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function setupTranslationSheet_(sheet) {
  var numCols = TRANSLATION_HEADERS.length;
  sheet.getRange(1, 1, 1, numCols).setValues([TRANSLATION_HEADERS]);
  sheet.getRange(1, 1, 1, numCols)
    .setBackground('#0B1829')
    .setFontColor('#C49A4A')
    .setFontWeight('bold')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrap(false);
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);

  var widths = [140,150,150,200,130,150,150,160,90,
                130,130,90,130,240,90,120,140,120,130,220];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  // Status dropdown
  sheet.getRange(2, 17, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([
        'Review Pending','Quote Sent','Awaiting Documents',
        'Awaiting Payment','Processing','Completed','Cancelled'
      ], true)
      .setAllowInvalid(false)
      .build()
  );

  // Alternating ivory rows
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=MOD(ROW(),2)=0')
      .setBackground('#F7F4EE')
      .setRanges([sheet.getRange(2, 1, 1000, numCols)])
      .build()
  ]);

  Logger.log('Translation Requests sheet created with ' + numCols + ' columns.');
}

function generateTranslationOrderNumber_(sheet) {
  var tz   = Session.getScriptTimeZone();
  var yymm = Utilities.formatDate(new Date(), tz, 'yyyyMM');
  var seq  = String(Math.max(sheet.getLastRow(), 1)).padStart(4, '0');
  return 'TR-' + yymm + '-' + seq;
}

// Writes a Drive folder URL back to the Order Number's row in any sheet.
// Returns true if the row was found and updated, false otherwise.
function writeFolderLinkToSheet_(ss, sheetName, linkColName, orderNumber, url) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;

  var hdrs = getHeaders(sheet);
  // 'Request ID' is the current apostille column name; 'Order Number' is
  // kept as a fallback both for the (unrelated, untouched) Translation
  // Requests tab and for a live apostille sheet not yet migrated.
  var oColIdx = hdrs.indexOf('Request ID');
  if (oColIdx === -1) oColIdx = hdrs.indexOf('Order Number');
  var oCol = oColIdx + 1;
  // Accept legacy apostille column names too
  var lColIdx = hdrs.indexOf(linkColName);
  if (lColIdx === -1) lColIdx = hdrs.indexOf('Document Upload Folder Link');
  if (lColIdx === -1) lColIdx = hdrs.indexOf('Dropbox Folder Link');
  var lCol = lColIdx + 1;

  if (oCol < 1 || lCol < 1) return false;

  var orderVals = sheet.getRange(2, oCol, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < orderVals.length; i++) {
    if (String(orderVals[i][0]).trim() === orderNumber) {
      sheet.getRange(i + 2, lCol).setValue(url);
      return true;
    }
  }
  return false;
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

// Used by createApostilleIntakeSheet — matches against HEADERS by name
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

// Generates IS-AP-YYYYMMDD-XXXX. Uses a script-wide lock plus a
// PropertiesService counter keyed per-day, NOT sheet.getLastRow() — row
// count is not a safe uniqueness source on its own (two submissions
// arriving close together could read the same row count before either
// has appended, producing duplicate IDs). The lock serializes access to
// the counter across concurrent executions; the counter persists
// independently of the sheet and resets naturally each new day since
// the property key itself is date-scoped.
function generateRequestId() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tz  = Session.getScriptTimeZone();
    var ymd = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
    var props = PropertiesService.getScriptProperties();
    var key = 'reqSeq_' + ymd;
    var seq = parseInt(props.getProperty(key) || '0', 10) + 1;
    props.setProperty(key, String(seq));
    return 'IS-AP-' + ymd + '-' + String(seq).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

// Generates IS-RON-YYYYMMDD-XXXX. Same concurrency-safe principle as
// generateRequestId() above (LockService + a date-scoped PropertiesService
// counter, not row count) — but with its OWN property key namespace
// ('ronReqSeq_' vs 'reqSeq_'), so the RON and Apostille sequences are
// fully independent: neither ever influences the other's numbering, and a
// busy day for one doesn't skip or collide with the other's IDs. Both
// generators do briefly share the same script-wide LockService mutex
// while incrementing their own counter — that's the intended, safe use of
// a single mutex to guard two independent counters, not a shared sequence.
function generateRonRequestId() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tz  = Session.getScriptTimeZone();
    var ymd = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
    var props = PropertiesService.getScriptProperties();
    var key = 'ronReqSeq_' + ymd;
    var seq = parseInt(props.getProperty(key) || '0', 10) + 1;
    props.setProperty(key, String(seq));
    return 'IS-RON-' + ymd + '-' + String(seq).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

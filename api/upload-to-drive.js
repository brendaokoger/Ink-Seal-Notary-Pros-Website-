// Vercel serverless function — forwards client files to Google Apps Script for Drive storage
// Browser → /api/upload-to-drive → Google Apps Script (handleFileUpload) → Google Drive
//
// GAS creates:  Ink & Seal Apostille Uploads / INS-YYYYMM-#### - Client Name / file.pdf
// GAS then writes the folder URL back to the "Dropbox Folder Link" column in Google Sheets.
//
// /api/submit-intake (text fields) and this function (files) are independent calls.
// The thank-you page is shown after submit-intake succeeds; this runs in the background.

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwVEacv0z5nAtA1Fs9LOoNJPVENyrM_py0Qnc9ZtoIgoJ5iwwJYI9mKB2FQOQFrw7Eq/exec';

const handler = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files provided' });
  }

  console.log('[upload-to-drive] order:', body.orderNumber, '| client:', body.clientName, '| files:', body.files.length);
  body.files.forEach(function (f, i) {
    console.log('[upload-to-drive] file[' + i + ']:', f.name, '| data length:', (f.data || '').length);
  });

  const payload = {
    action:      'upload_files',
    orderNumber: body.orderNumber || '',
    clientName:  body.clientName  || '',
    files:       body.files
  };

  try {
    const gasRes = await fetch(GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'application/json' },
      body:     JSON.stringify(payload),
      redirect: 'follow'
    });

    const rawText = await gasRes.text();
    console.log('[upload-to-drive] GAS HTTP', gasRes.status, '—', rawText.slice(0, 500));

    let gasJson;
    try {
      gasJson = JSON.parse(rawText);
    } catch (_) {
      gasJson = { success: false, error: 'Non-JSON GAS response: ' + rawText.slice(0, 300) };
    }

    const success = gasJson.success === true;
    console.log('[upload-to-drive] success:', success,
                '| folder:', gasJson.folderLink || '(none)',
                '| uploads:', gasJson.uploadCount || 0);

    return res.status(success ? 200 : 500).json(gasJson);

  } catch (err) {
    console.error('[upload-to-drive] Network error reaching GAS:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 50 MB limit — documents (PDFs, scanned images) encoded as base64 add ~33% overhead
handler.config = { api: { bodyParser: { sizeLimit: '50mb' } } };
module.exports = handler;

// Vercel serverless function — Dropbox upload handler
// Secrets are read from Vercel Environment Variables only (never the frontend).
//
// POST /api/upload-to-dropbox
//   multipart/form-data fields:
//     clientName   — full name of the submitting client
//     orderNumber  — pre-existing order number (optional; generated here if blank)
//     files        — 0-5 document files

const formidable = require('formidable');
const fs         = require('fs');

const ROOT_FOLDER = process.env.DROPBOX_ROOT_FOLDER || '/Ink & Seal Apostille Orders';

// ── Disable Vercel's built-in body parser so formidable can parse multipart ──
const handler = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Sanity-check env vars before making any network calls
  const missingVars = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']
    .filter(k => !process.env[k]);
  if (missingVars.length) {
    console.error('[upload-to-dropbox] Missing env vars:', missingVars.join(', '));
    return res.status(500).json({ success: false, error: 'Server misconfiguration: missing env vars: ' + missingVars.join(', ') });
  }

  try {
    const { fields, files } = await parseForm(req);

    const clientName = str(fields.clientName) || 'Client';
    const orderNum   = str(fields.orderNumber) || generateOrderNumber();
    const folderPath = `${ROOT_FOLDER}/${orderNum} - ${clientName}`;

    const token = await getAccessToken();

    await createFolder(token, folderPath);

    const fileArray = normalizeFiles(files.files);
    let uploadCount = 0;
    for (const file of fileArray) {
      if (!file || !file.filepath) continue;
      const buf      = fs.readFileSync(file.filepath);
      const safeName = sanitize(file.originalFilename || file.newFilename || `document-${uploadCount + 1}`);
      await uploadFile(token, `${folderPath}/${safeName}`, buf);
      uploadCount++;
    }

    const folderLink = await getSharedLink(token, folderPath);

    return res.status(200).json({ success: true, orderNumber: orderNum, folderLink, uploadCount });

  } catch (err) {
    console.error('[upload-to-dropbox] Fatal:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
};

handler.config = { api: { bodyParser: false } };
module.exports  = handler;

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir:      '/tmp',
      keepExtensions: true,
      multiples:      true,
      maxFiles:       5,
      maxFileSize:    25 * 1024 * 1024  // 25 MB per file
    });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else     resolve({ fields, files });
    });
  });
}

function str(v) {
  if (Array.isArray(v)) v = v[0];
  return (v || '').toString().trim();
}

function normalizeFiles(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

function generateOrderNumber() {
  const now    = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const suffix = String(Date.now()).slice(-4);
  return `INS-${yyyymm}-${suffix}`;
}

// ── Safe Dropbox response reader ───────────────────────────────────────────────
// Always reads raw text first, then parses JSON — never blindly calls .json().
// Logs the HTTP status and raw body for every Dropbox call so failures are
// immediately visible in Vercel Function Logs.

async function dropboxRead(label, response) {
  const status = response.status;
  const raw    = await response.text();

  console.log(`[dropbox:${label}] HTTP ${status} — ${raw.slice(0, 400)}`);

  if (!raw || raw.trim() === '') {
    return { _status: status, _raw: '' };
  }

  try {
    const parsed = JSON.parse(raw);
    parsed._status = status;
    return parsed;
  } catch (_) {
    // Dropbox returned HTML or plain text (e.g. 5xx maintenance page, bad credentials)
    throw new Error(`[dropbox:${label}] HTTP ${status} — non-JSON response: ${raw.slice(0, 300)}`);
  }
}

// ── Dropbox API calls ──────────────────────────────────────────────────────────

async function getAccessToken() {
  const res  = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN.trim(),
      client_id:     process.env.DROPBOX_APP_KEY.trim(),
      client_secret: process.env.DROPBOX_APP_SECRET.trim()
    }).toString()
  });
  const data = await dropboxRead('oauth2/token', res);

  if (!data.access_token) {
    throw new Error(`[dropbox:oauth2/token] Token refresh failed — error: ${data.error || ''} ${data.error_description || ''}`);
  }
  return data.access_token;
}

async function createFolder(token, path) {
  const res  = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path, autorename: false })
  });
  const data = await dropboxRead('files/create_folder_v2', res);

  // "path/conflict/folder" means the folder already exists — safe to continue
  const summary = data.error_summary || '';
  if (data._status !== 200 && !summary.startsWith('path/conflict')) {
    throw new Error(`[dropbox:files/create_folder_v2] ${summary || JSON.stringify(data)}`);
  }
  return path;
}

async function uploadFile(token, path, buffer) {
  const res  = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method:  'POST',
    headers: {
      'Authorization':   `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true }),
      'Content-Type':    'application/octet-stream'
    },
    body: buffer
  });
  const data = await dropboxRead('files/upload', res);

  if (data._status !== 200 && data.error_summary) {
    throw new Error(`[dropbox:files/upload] ${data.error_summary}`);
  }
  return data;
}

async function getSharedLink(token, path) {
  const res  = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path })
  });
  const data = await dropboxRead('sharing/create_shared_link_with_settings', res);

  if (data.url) return data.url;

  // Link already exists — Dropbox returns the existing URL inside the error payload
  if (data.error && data.error['.tag'] === 'shared_link_already_exists') {
    const existing = data.error.shared_link_already_exists;
    if (existing && existing.metadata && existing.metadata.url) {
      return existing.metadata.url;
    }
    // Fall back: list existing shared links for this path
    const listRes  = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path, direct_only: true })
    });
    const listData = await dropboxRead('sharing/list_shared_links', listRes);
    return (listData.links && listData.links[0]) ? listData.links[0].url : '';
  }

  // Non-fatal — return empty string so the rest of the submission still works
  console.warn('[dropbox:sharing] Could not obtain shared link:', JSON.stringify(data).slice(0, 200));
  return '';
}

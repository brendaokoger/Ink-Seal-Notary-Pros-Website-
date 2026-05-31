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
    console.error('[upload-to-dropbox]', err);
    return res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
};

handler.config = { api: { bodyParser: false } };
module.exports  = handler;

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      uploadDir:       '/tmp',
      keepExtensions:  true,
      multiples:       true,
      maxFiles:        5,
      maxFileSize:     25 * 1024 * 1024   // 25 MB per file
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

// ── Dropbox API calls ──────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id:     process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET
    }).toString()
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Dropbox token refresh failed: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function createFolder(token, path) {
  const res  = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path, autorename: false })
  });
  const data = await res.json();
  // Ignore "folder already exists" error — safe to continue
  if (data.error_summary && !data.error_summary.startsWith('path/conflict')) {
    throw new Error('Create folder failed: ' + data.error_summary);
  }
  return path;
}

async function uploadFile(token, path, buffer) {
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method:  'POST',
    headers: {
      'Authorization':   `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true }),
      'Content-Type':    'application/octet-stream'
    },
    body: buffer
  });
  return res.json();
}

async function getSharedLink(token, path) {
  // Attempt to create a new shared link
  const res  = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path })
  });
  const data = await res.json();

  if (data.url) return data.url;

  // Link already exists — Dropbox returns it in the error payload
  if (data.error && data.error['.tag'] === 'shared_link_already_exists') {
    const existing = data.error.shared_link_already_exists;
    if (existing && existing.metadata && existing.metadata.url) {
      return existing.metadata.url;
    }
    // Fall back to listing existing links
    const listRes  = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path, direct_only: true })
    });
    const listData = await listRes.json();
    return (listData.links && listData.links[0]) ? listData.links[0].url : '';
  }

  return '';
}

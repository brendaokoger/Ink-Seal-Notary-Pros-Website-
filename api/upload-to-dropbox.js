// Vercel serverless function — Dropbox upload handler
// Receives JSON body with base64-encoded files (no multipart parser needed).
// Secrets read from Vercel Environment Variables only.
//
// POST /api/upload-to-dropbox
//   Content-Type: application/json
//   { clientName, orderNumber, files: [{ name, data: "data:...;base64,..." }] }

const ROOT_FOLDER = process.env.DROPBOX_ROOT_FOLDER || '/Ink & Seal Apostille Orders';

const handler = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Check env vars before touching Dropbox
  const missingVars = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']
    .filter(function (k) { return !process.env[k]; });
  if (missingVars.length) {
    console.error('[upload-to-dropbox] Missing env vars:', missingVars.join(', '));
    return res.status(500).json({ success: false, error: 'Missing env vars: ' + missingVars.join(', ') });
  }

  try {
    const body       = req.body || {};
    const clientName = (body.clientName  || 'Client').trim();
    const orderNum   = (body.orderNumber || '').trim() || generateOrderNumber();
    const files      = Array.isArray(body.files) ? body.files : [];
    const folderPath = ROOT_FOLDER + '/' + orderNum + ' - ' + clientName;

    console.log('[upload-to-dropbox] Order:', orderNum, '| Files:', files.length, '| Folder:', folderPath);

    const token = await getAccessToken();
    console.log('[upload-to-dropbox] Access token obtained');

    await createFolder(token, folderPath);
    console.log('[upload-to-dropbox] Folder ready:', folderPath);

    let uploadCount = 0;
    for (const file of files) {
      if (!file || !file.data || !file.name) continue;
      const base64   = file.data.includes(',') ? file.data.split(',')[1] : file.data;
      const buffer   = Buffer.from(base64, 'base64');
      const safeName = sanitize(file.name);
      await uploadFile(token, folderPath + '/' + safeName, buffer);
      uploadCount++;
      console.log('[upload-to-dropbox] Uploaded:', safeName, '(' + buffer.length + ' bytes)');
    }

    const folderLink = await getSharedLink(token, folderPath);
    console.log('[upload-to-dropbox] Done | link:', folderLink, '| uploaded:', uploadCount);

    return res.status(200).json({ success: true, orderNumber: orderNum, folderLink, uploadCount });

  } catch (err) {
    console.error('[upload-to-dropbox] Fatal:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 50 MB allows up to ~5 documents of 7 MB each (base64 adds ~33% overhead)
handler.config = { api: { bodyParser: { sizeLimit: '50mb' } } };
module.exports  = handler;

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateOrderNumber() {
  const now    = new Date();
  const yyyymm = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0');
  const suffix = String(Date.now()).slice(-4);
  return 'INS-' + yyyymm + '-' + suffix;
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

// ── Safe Dropbox response reader ───────────────────────────────────────────────
// Always reads text first. Logs HTTP status + raw body. Parses JSON safely.
// Throws a labelled error naming the exact endpoint that failed.

async function dbxRead(label, response) {
  const status = response.status;
  const raw    = await response.text();
  console.log('[dropbox:' + label + '] HTTP ' + status + ' — ' + raw.slice(0, 400));

  if (!raw || !raw.trim()) return { _status: status };

  try {
    const parsed   = JSON.parse(raw);
    parsed._status = status;
    return parsed;
  } catch (_) {
    throw new Error('[dropbox:' + label + '] HTTP ' + status + ' — non-JSON: ' + raw.slice(0, 200));
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
  const data = await dbxRead('oauth2/token', res);
  if (!data.access_token) {
    throw new Error('[dropbox:oauth2/token] Token refresh failed — ' + (data.error_description || data.error || JSON.stringify(data)));
  }
  return data.access_token;
}

async function createFolder(token, path) {
  const res  = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path, autorename: false })
  });
  const data = await dbxRead('files/create_folder_v2', res);
  const summary = data.error_summary || '';
  if (data._status !== 200 && !summary.startsWith('path/conflict')) {
    throw new Error('[dropbox:files/create_folder_v2] ' + (summary || JSON.stringify(data)));
  }
}

async function uploadFile(token, path, buffer) {
  const res  = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method:  'POST',
    headers: {
      'Authorization':   'Bearer ' + token,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true }),
      'Content-Type':    'application/octet-stream'
    },
    body: buffer
  });
  const data = await dbxRead('files/upload', res);
  if (data._status !== 200 && data.error_summary) {
    throw new Error('[dropbox:files/upload] ' + data.error_summary);
  }
}

async function getSharedLink(token, path) {
  const res  = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path })
  });
  const data = await dbxRead('sharing/create_shared_link_with_settings', res);

  if (data.url) return data.url;

  if (data.error && data.error['.tag'] === 'shared_link_already_exists') {
    const existing = data.error.shared_link_already_exists;
    if (existing && existing.metadata && existing.metadata.url) return existing.metadata.url;

    const listRes  = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path, direct_only: true })
    });
    const listData = await dbxRead('sharing/list_shared_links', listRes);
    return (listData.links && listData.links[0]) ? listData.links[0].url : '';
  }

  console.warn('[dropbox:sharing] No link obtained:', JSON.stringify(data).slice(0, 200));
  return '';
}

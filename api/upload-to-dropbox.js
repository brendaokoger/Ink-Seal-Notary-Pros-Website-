// Vercel serverless function — Dropbox upload handler
// Receives JSON body with base64-encoded files (no multipart parser needed).
// Secrets read from Vercel Environment Variables only.
//
// POST /api/upload-to-dropbox
//   Content-Type: application/json
//   { clientName, orderNumber, files: [{ name, data: "data:...;base64,..." }] }
//
// GET  /api/upload-to-dropbox  →  diagnostic JSON (env var presence, no secrets exposed)

const ROOT_FOLDER = process.env.DROPBOX_ROOT_FOLDER || '/Ink & Seal Apostille Orders';

const handler = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: diagnostic — confirms function is reachable and env vars are present ──
  if (req.method === 'GET') {
    const rt = process.env.DROPBOX_REFRESH_TOKEN || '';
    return res.status(200).json({
      status:              'reachable',
      DROPBOX_APP_KEY:     !!process.env.DROPBOX_APP_KEY,
      DROPBOX_APP_SECRET:  !!process.env.DROPBOX_APP_SECRET,
      DROPBOX_REFRESH_TOKEN_present: !!rt,
      DROPBOX_REFRESH_TOKEN_length:  rt.length,
      DROPBOX_REFRESH_TOKEN_prefix:  rt.slice(0, 6) || '(empty)',
      DROPBOX_ROOT_FOLDER: ROOT_FOLDER,
      node_version:        process.version,
      timestamp:           new Date().toISOString()
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Startup log ───────────────────────────────────────────────────────────────
  console.log('[upload-to-dropbox] ===== REQUEST RECEIVED =====');
  console.log('[upload-to-dropbox] Node:', process.version, '| Time:', new Date().toISOString());
  console.log('[upload-to-dropbox] ROOT_FOLDER:', ROOT_FOLDER);
  console.log('[upload-to-dropbox] Env check — APP_KEY:', !!process.env.DROPBOX_APP_KEY,
    '| APP_SECRET:', !!process.env.DROPBOX_APP_SECRET,
    '| REFRESH_TOKEN:', !!process.env.DROPBOX_REFRESH_TOKEN,
    '| token length:', (process.env.DROPBOX_REFRESH_TOKEN || '').length);

  // Check env vars before touching Dropbox
  const missingVars = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']
    .filter(function (k) { return !process.env[k]; });
  if (missingVars.length) {
    console.error('[upload-to-dropbox] MISSING ENV VARS:', missingVars.join(', '));
    return res.status(500).json({ success: false, error: 'Missing env vars: ' + missingVars.join(', ') });
  }

  try {
    const body       = req.body || {};
    const clientName = (body.clientName  || 'Client').trim();
    const orderNum   = (body.orderNumber || '').trim() || generateOrderNumber();
    const files      = Array.isArray(body.files) ? body.files : [];
    const folderPath = ROOT_FOLDER + '/' + orderNum + ' - ' + clientName;

    console.log('[upload-to-dropbox] clientName:', clientName);
    console.log('[upload-to-dropbox] orderNumber:', orderNum);
    console.log('[upload-to-dropbox] folderPath:', folderPath);
    console.log('[upload-to-dropbox] files received:', files.length);
    files.forEach(function (f, i) {
      const dataLen = f && f.data ? f.data.length : 0;
      console.log('[upload-to-dropbox] file[' + i + ']:', (f && f.name) || '(no name)', '| data length:', dataLen);
    });

    // ── Step 1: Token exchange ────────────────────────────────────────────────
    console.log('[upload-to-dropbox] Step 1: requesting access token...');
    const token = await getAccessToken();
    console.log('[upload-to-dropbox] Step 1 DONE: access token obtained (length ' + token.length + ')');

    // ── Step 2: Create folder ─────────────────────────────────────────────────
    console.log('[upload-to-dropbox] Step 2: creating folder:', folderPath);
    await createFolder(token, folderPath);
    console.log('[upload-to-dropbox] Step 2 DONE: folder ready');

    // ── Step 3: Upload files ──────────────────────────────────────────────────
    let uploadCount = 0;
    console.log('[upload-to-dropbox] Step 3: uploading', files.length, 'file(s)...');
    for (const file of files) {
      if (!file || !file.data || !file.name) {
        console.warn('[upload-to-dropbox] Skipping invalid file entry:', JSON.stringify(file).slice(0, 100));
        continue;
      }
      const base64   = file.data.includes(',') ? file.data.split(',')[1] : file.data;
      const buffer   = Buffer.from(base64, 'base64');
      const safeName = sanitize(file.name);
      console.log('[upload-to-dropbox] Uploading:', safeName, '(' + buffer.length + ' bytes)');
      await uploadFile(token, folderPath + '/' + safeName, buffer);
      uploadCount++;
      console.log('[upload-to-dropbox] Upload complete:', safeName);
    }
    console.log('[upload-to-dropbox] Step 3 DONE:', uploadCount, 'file(s) uploaded');

    // ── Step 4: Shared link ───────────────────────────────────────────────────
    console.log('[upload-to-dropbox] Step 4: getting shared link...');
    const folderLink = await getSharedLink(token, folderPath);
    console.log('[upload-to-dropbox] Step 4 DONE: link =', folderLink || '(empty — no link returned)');

    console.log('[upload-to-dropbox] ===== SUCCESS =====');
    return res.status(200).json({ success: true, orderNumber: orderNum, folderLink, uploadCount });

  } catch (err) {
    console.error('[upload-to-dropbox] ===== FATAL ERROR =====');
    console.error('[upload-to-dropbox] Message:', err.message);
    console.error('[upload-to-dropbox] Stack:', err.stack ? err.stack.slice(0, 600) : '(no stack)');
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 50 MB — allows ~5 documents of 7 MB each (base64 adds ~33% overhead)
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
// Reads text first, logs HTTP status + full raw body, then parses JSON safely.

async function dbxRead(label, response) {
  const status = response.status;
  const raw    = await response.text();
  console.log('[dropbox:' + label + '] HTTP ' + status + ' | body: ' + raw.slice(0, 600));

  if (!raw || !raw.trim()) return { _status: status };

  try {
    const parsed   = JSON.parse(raw);
    parsed._status = status;
    return parsed;
  } catch (_) {
    throw new Error('[dropbox:' + label + '] HTTP ' + status + ' — non-JSON response: ' + raw.slice(0, 300));
  }
}

// ── Dropbox API calls ──────────────────────────────────────────────────────────

async function getAccessToken() {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN.trim();
  const appKey       = process.env.DROPBOX_APP_KEY.trim();
  const appSecret    = process.env.DROPBOX_APP_SECRET.trim();

  console.log('[dropbox:oauth2/token] Exchanging refresh token (prefix: ' + refreshToken.slice(0, 6) + '...) for access token');

  const res  = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     appKey,
      client_secret: appSecret
    }).toString()
  });

  const data = await dbxRead('oauth2/token', res);

  if (!data.access_token) {
    throw new Error('[dropbox:oauth2/token] No access_token in response — error: ' +
      (data.error_description || data.error || JSON.stringify(data)));
  }
  return data.access_token;
}

async function createFolder(token, path) {
  console.log('[dropbox:files/create_folder_v2] path: "' + path + '"');
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
  if (summary.startsWith('path/conflict')) {
    console.log('[dropbox:files/create_folder_v2] Folder already exists — continuing');
  }
}

async function uploadFile(token, path, buffer) {
  console.log('[dropbox:files/upload] path: "' + path + '" | size: ' + buffer.length + ' bytes');
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
  console.log('[dropbox:sharing] Creating shared link for: "' + path + '"');
  const res  = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path })
  });
  const data = await dbxRead('sharing/create_shared_link_with_settings', res);

  if (data.url) {
    console.log('[dropbox:sharing] Link created:', data.url);
    return data.url;
  }

  if (data.error && data.error['.tag'] === 'shared_link_already_exists') {
    console.log('[dropbox:sharing] Link already exists — retrieving');
    const existing = data.error.shared_link_already_exists;
    if (existing && existing.metadata && existing.metadata.url) {
      console.log('[dropbox:sharing] Retrieved from error payload:', existing.metadata.url);
      return existing.metadata.url;
    }
    const listRes  = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path, direct_only: true })
    });
    const listData = await dbxRead('sharing/list_shared_links', listRes);
    const url = (listData.links && listData.links[0]) ? listData.links[0].url : '';
    console.log('[dropbox:sharing] Retrieved from list:', url || '(none found)');
    return url;
  }

  console.warn('[dropbox:sharing] Could not get link. Full response:', JSON.stringify(data).slice(0, 300));
  return '';
}

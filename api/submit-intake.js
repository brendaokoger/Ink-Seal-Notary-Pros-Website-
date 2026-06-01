// Vercel serverless proxy — forwards form data to Google Apps Script
// Running GAS through Vercel lets us read the actual response and log errors.
// Browser → /api/submit-intake → Google Apps Script → row saved in Google Sheets

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxhDJlWUrATk95m8J2Evgpn6ZDmBUkwwQUhQyXv7D8bOtSbkBYG3HbYJri_gsmvyO5t/exec';

const handler = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const keys = Object.keys(body);

  console.log('[submit-intake] Fields received:', keys.join(', '));
  console.log('[submit-intake] fullName:', body.fullName, '| email:', body.email, '| documentType:', body.documentType);

  if (keys.length === 0) {
    console.error('[submit-intake] Empty body — no fields received');
    return res.status(400).json({ success: false, error: 'No form data received' });
  }

  // Build URL-encoded params for GAS (what e.parameter expects)
  // Signature is a large base64 PNG — GAS only checks length > 10, so replace with a marker
  const params = new URLSearchParams();
  keys.forEach(function (key) {
    if (key === 'signature') {
      params.append('signature', body[key] && body[key].length > 10 ? 'CAPTURED' : '');
    } else {
      const val = body[key];
      if (val !== undefined && val !== null) params.append(key, String(val));
    }
  });

  console.log('[submit-intake] Forwarding to GAS — param count:', keys.length);

  try {
    const gasRes = await fetch(GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:     params.toString(),
      redirect: 'follow'
    });

    const rawText = await gasRes.text();
    console.log('[submit-intake] GAS HTTP', gasRes.status, '—', rawText.slice(0, 500));

    let gasJson;
    try {
      gasJson = JSON.parse(rawText);
    } catch (_) {
      gasJson = { status: 'error', raw: rawText.slice(0, 300) };
    }

    const success = (gasRes.status === 200 && gasJson.status === 'ok');
    console.log('[submit-intake] Row saved:', success, '| order:', gasJson.order || '(none)');

    return res.status(200).json({
      success,
      order:       gasJson.order   || null,
      gasStatus:   gasRes.status,
      gasResponse: gasJson
    });

  } catch (err) {
    console.error('[submit-intake] Network error reaching GAS:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 4 MB — enough for all form fields including base64 signature (~50-200 KB)
handler.config = { api: { bodyParser: { sizeLimit: '4mb' } } };
module.exports  = handler;

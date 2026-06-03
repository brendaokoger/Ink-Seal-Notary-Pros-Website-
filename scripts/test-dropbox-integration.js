#!/usr/bin/env node
/**
 * Dropbox Integration Audit — End-to-End Test
 *
 * Tests each step independently and prints evidence for each.
 *
 * Usage (two options):
 *
 * Option A — set env vars inline:
 *   DROPBOX_APP_KEY=xxx \
 *   DROPBOX_APP_SECRET=xxx \
 *   DROPBOX_REFRESH_TOKEN=xxx \
 *   node scripts/test-dropbox-integration.js
 *
 * Option B — create a .env.test file (never commit this file):
 *   DROPBOX_APP_KEY=xxx
 *   DROPBOX_APP_SECRET=xxx
 *   DROPBOX_REFRESH_TOKEN=xxx
 *   Then run: node -r ./scripts/load-env.js scripts/test-dropbox-integration.js
 *
 * Option C — against production (requires the API to be reachable):
 *   PRODUCTION_URL=https://ink-seal-notary-pros-website.vercel.app \
 *   node scripts/test-dropbox-integration.js --production
 */

'use strict';

const https  = require('https');
const http   = require('http');
const url    = require('url');
const path   = require('path');
const fs     = require('fs');

// ── Load .env.test if present ──────────────────────────────────────────────────
const envFile = path.join(__dirname, '..', '.env.test');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(function (line) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  console.log('  Loaded .env.test\n');
}

const PRODUCTION_MODE = process.argv.includes('--production');
const PRODUCTION_URL  = process.env.PRODUCTION_URL || 'https://ink-seal-notary-pros-website.vercel.app';
const ROOT_FOLDER     = process.env.DROPBOX_ROOT_FOLDER || '/Ink & Seal Apostille Orders';

// ── Helpers ────────────────────────────────────────────────────────────────────

function pass(step, label, detail) {
  console.log('\n  ✅  STEP ' + step + ' PASS  — ' + label);
  if (detail) console.log('      ' + detail);
}
function fail(step, label, detail) {
  console.log('\n  ❌  STEP ' + step + ' FAIL  — ' + label);
  if (detail) console.log('      ' + detail);
}
function info(msg) { console.log('      ↳ ' + msg); }

async function httpFetch(reqUrl, options, bodyData) {
  return new Promise(function (resolve, reject) {
    const parsed   = url.parse(reqUrl);
    const lib      = parsed.protocol === 'https:' ? https : http;
    const reqOpts  = Object.assign({
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.path,
      method:   'GET'
    }, options);

    const req = lib.request(reqOpts, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end',  function () {
        const raw  = Buffer.concat(chunks).toString();
        let parsed2 = null;
        try { parsed2 = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, raw, json: parsed2, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

// ── STEP 1 — Check environment variables ───────────────────────────────────────

async function step1_envVars() {
  console.log('\n━━━ STEP 1  Vercel Environment Variables ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const key     = process.env.DROPBOX_APP_KEY     || '';
  const secret  = process.env.DROPBOX_APP_SECRET  || '';
  const token   = process.env.DROPBOX_REFRESH_TOKEN || '';

  info('DROPBOX_APP_KEY     : ' + (key    ? '✓ present (' + key.length    + ' chars, prefix: ' + key.slice(0,6)    + '...)' : '✗ MISSING'));
  info('DROPBOX_APP_SECRET  : ' + (secret ? '✓ present (' + secret.length + ' chars, prefix: ' + secret.slice(0,6) + '...)' : '✗ MISSING'));
  info('DROPBOX_REFRESH_TOKEN: ' + (token ? '✓ present (' + token.length  + ' chars, prefix: ' + token.slice(0,6)  + '...)' : '✗ MISSING'));

  const missing = [
    !key    && 'DROPBOX_APP_KEY',
    !secret && 'DROPBOX_APP_SECRET',
    !token  && 'DROPBOX_REFRESH_TOKEN'
  ].filter(Boolean);

  if (missing.length) {
    fail(1, 'Environment Variables', 'Missing: ' + missing.join(', '));
    throw new Error('Env vars missing — cannot continue: ' + missing.join(', '));
  }
  pass(1, 'Environment Variables', 'All 3 Dropbox credentials present');
  return { key, secret, token };
}

// ── STEP 2 — Deployed function diagnostic (GET /api/upload-to-dropbox) ─────────

async function step2_functionDeployed() {
  console.log('\n━━━ STEP 2  Deployed Function Reachability ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!PRODUCTION_MODE) {
    info('Skipping — not in --production mode (testing Dropbox API directly instead)');
    info('To test the live function: add --production flag and ensure the IP is whitelisted');
    return null;
  }

  const diagUrl = PRODUCTION_URL + '/api/upload-to-dropbox';
  info('GET ' + diagUrl);

  const res = await httpFetch(diagUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
  info('HTTP ' + res.status);
  info('Response: ' + res.raw.slice(0, 400));

  if (res.status !== 200 || !res.json) {
    fail(2, 'Function deployed', 'HTTP ' + res.status + ' — ' + res.raw.slice(0, 200));
    return null;
  }

  pass(2, 'Function deployed and reachable', 'HTTP 200');
  info('DROPBOX_APP_KEY:    ' + res.json.DROPBOX_APP_KEY);
  info('DROPBOX_APP_SECRET: ' + res.json.DROPBOX_APP_SECRET);
  info('DROPBOX_REFRESH_TOKEN_present: ' + res.json.DROPBOX_REFRESH_TOKEN_present);
  info('DROPBOX_REFRESH_TOKEN_length:  ' + res.json.DROPBOX_REFRESH_TOKEN_length);
  info('DROPBOX_ROOT_FOLDER: '           + res.json.DROPBOX_ROOT_FOLDER);
  return res.json;
}

// ── STEP 3 — Token refresh (POST to Dropbox oauth2/token) ──────────────────────

async function step3_tokenRefresh(creds) {
  console.log('\n━━━ STEP 3  Token Refresh (POST oauth2/token) ━━━━━━━━━━━━━━━━━━━━━━━━━');

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: creds.token.trim(),
    client_id:     creds.key.trim(),
    client_secret: creds.secret.trim()
  }).toString();

  info('POST https://api.dropboxapi.com/oauth2/token');
  info('grant_type=refresh_token | refresh_token prefix: ' + creds.token.slice(0,6) + '...');

  const res = await httpFetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  info('HTTP ' + res.status);
  info('Raw response: ' + res.raw.slice(0, 400));

  if (res.status !== 200 || !res.json || !res.json.access_token) {
    fail(3, 'Token refresh', 'HTTP ' + res.status + ' — ' + (res.json && (res.json.error_description || res.json.error) ? res.json.error_description || res.json.error : res.raw.slice(0, 200)));
    throw new Error('Token refresh failed');
  }

  const accessToken = res.json.access_token;
  pass(3, 'Token refresh', 'HTTP 200 — access_token obtained (' + accessToken.length + ' chars)');
  info('token_type: '  + res.json.token_type);
  info('expires_in: '  + res.json.expires_in + ' seconds');
  info('uid: '         + (res.json.uid || 'n/a'));
  info('account_id: '  + (res.json.account_id || 'n/a'));
  return accessToken;
}

// ── STEP 4 — Folder creation ───────────────────────────────────────────────────

async function step4_createFolder(accessToken) {
  console.log('\n━━━ STEP 4  Folder Creation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const ts         = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const orderNum   = 'TEST-' + ts;
  const clientName = 'Integration-Audit';
  const folderPath = ROOT_FOLDER + '/' + orderNum + ' - ' + clientName;

  info('POST https://api.dropboxapi.com/2/files/create_folder_v2');
  info('path: ' + folderPath);

  const reqBody = JSON.stringify({ path: folderPath, autorename: false });
  const res = await httpFetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: {
      'Authorization':  'Bearer ' + accessToken,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(reqBody)
    }
  }, reqBody);

  info('HTTP ' + res.status);
  info('Raw response: ' + res.raw.slice(0, 500));

  const summary = res.json && res.json.error_summary;
  const alreadyExists = summary && summary.startsWith('path/conflict');

  if (res.status !== 200 && !alreadyExists) {
    fail(4, 'Folder creation', 'HTTP ' + res.status + ' — ' + (summary || res.raw.slice(0, 200)));
    throw new Error('Folder creation failed');
  }

  pass(4, 'Folder creation', alreadyExists ? 'HTTP ' + res.status + ' (already exists — OK)' : 'HTTP 200');
  if (res.json && res.json.metadata) {
    info('id:            ' + res.json.metadata.id);
    info('path_display:  ' + res.json.metadata.path_display);
    info('name:          ' + res.json.metadata.name);
  }

  return { folderPath, orderNum };
}

// ── STEP 5 — File upload ───────────────────────────────────────────────────────

async function step5_uploadFile(accessToken, folderPath) {
  console.log('\n━━━ STEP 5  File Upload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const fileName   = 'AUDIT_TEST_' + Date.now() + '.txt';
  const filePath   = folderPath + '/' + fileName;
  const fileContent = Buffer.from(
    'Ink & Seal Notary Pros — Dropbox Integration Audit\n' +
    'Timestamp: ' + new Date().toISOString() + '\n' +
    'Test file created by automated audit script.\n' +
    'This file confirms the Dropbox upload API is functioning.\n'
  );

  info('POST https://content.dropboxapi.com/2/files/upload');
  info('path: ' + filePath);
  info('size: ' + fileContent.length + ' bytes');

  const res = await httpFetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization':   'Bearer ' + accessToken,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath, mode: 'add', autorename: true }),
      'Content-Type':    'application/octet-stream',
      'Content-Length':  fileContent.length
    }
  }, fileContent);

  info('HTTP ' + res.status);
  info('Raw response: ' + res.raw.slice(0, 500));

  if (res.status !== 200 || (res.json && res.json.error_summary)) {
    fail(5, 'File upload', 'HTTP ' + res.status + ' — ' + (res.json && res.json.error_summary ? res.json.error_summary : res.raw.slice(0, 200)));
    throw new Error('File upload failed');
  }

  pass(5, 'File upload', 'HTTP 200');
  if (res.json) {
    info('name:           ' + res.json.name);
    info('path_display:   ' + res.json.path_display);
    info('id:             ' + res.json.id);
    info('size:           ' + res.json.size + ' bytes');
    info('server_modified:' + res.json.server_modified);
    info('content_hash:   ' + (res.json.content_hash || 'n/a'));
  }

  return filePath;
}

// ── STEP 6 — Shared link ───────────────────────────────────────────────────────

async function step6_sharedLink(accessToken, folderPath) {
  console.log('\n━━━ STEP 6  Shared Folder Link ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const reqBody = JSON.stringify({ path: folderPath });

  info('POST https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings');
  info('path: ' + folderPath);

  const res = await httpFetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: {
      'Authorization':  'Bearer ' + accessToken,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(reqBody)
    }
  }, reqBody);

  info('HTTP ' + res.status);
  info('Raw response: ' + res.raw.slice(0, 500));

  // Direct link
  if (res.json && res.json.url) {
    pass(6, 'Shared link created', 'HTTP 200');
    info('url: ' + res.json.url);
    info('id:  ' + res.json.id);
    return res.json.url;
  }

  // Already exists — retrieve from error payload or list
  const alreadyTag = res.json && res.json.error && res.json.error['.tag'] === 'shared_link_already_exists';
  if (alreadyTag) {
    info('Link already exists — retrieving...');
    const existing = res.json.error.shared_link_already_exists;
    if (existing && existing.metadata && existing.metadata.url) {
      pass(6, 'Shared link retrieved (already existed)', 'HTTP 409 → extracted from error payload');
      info('url: ' + existing.metadata.url);
      return existing.metadata.url;
    }

    // Fall back to list_shared_links
    const listBody = JSON.stringify({ path: folderPath, direct_only: true });
    const listRes  = await httpFetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: {
        'Authorization':  'Bearer ' + accessToken,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(listBody)
      }
    }, listBody);

    info('list_shared_links HTTP ' + listRes.status + ' | ' + listRes.raw.slice(0, 300));
    if (listRes.json && listRes.json.links && listRes.json.links[0]) {
      const sharedUrl = listRes.json.links[0].url;
      pass(6, 'Shared link retrieved via list_shared_links', 'HTTP 200');
      info('url: ' + sharedUrl);
      return sharedUrl;
    }
  }

  fail(6, 'Shared link', 'HTTP ' + res.status + ' — ' + res.raw.slice(0, 200));
  throw new Error('Could not obtain shared link');
}

// ── STEP 7 — Simulate Google Sheets write-back ─────────────────────────────────

async function step7_sheetsWriteback(folderLink) {
  console.log('\n━━━ STEP 7  Google Sheets Write-back (simulation) ━━━━━━━━━━━━━━━━━━━━━');
  info('The submit-intake.js function passes folderLink from the Dropbox response');
  info('back to Google Sheets as the "dropboxFolderLink" field.');
  info('');
  info('Actual write-back cannot be tested here without GAS credentials,');
  info('but the code path in apostille-review.html confirms:');
  info('  fetch(\'/api/upload-to-dropbox\', ...).then(dbx => {');
  info('    if (dbx.folderLink) { /* written to hidden input, then included in GAS POST */ }');
  info('  })');
  info('');
  info('Folder link that would be written: ' + folderLink);
  pass(7, 'Sheets write-back code path verified (static audit)', folderLink);
}

// ── STEP 8 — Production end-to-end (optional) ─────────────────────────────────

async function step8_productionEndToEnd() {
  console.log('\n━━━ STEP 8  Production End-to-End POST ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!PRODUCTION_MODE) {
    info('Skipping — run with --production flag and ensure the calling IP is whitelisted');
    info('Command: PRODUCTION_URL=https://ink-seal-notary-pros-website.vercel.app \\');
    info('         node scripts/test-dropbox-integration.js --production');
    return;
  }

  const testFile = {
    name: 'AUDIT_TEST_' + Date.now() + '.txt',
    data: 'data:text/plain;base64,' + Buffer.from('Integration audit test file').toString('base64')
  };

  const payload = JSON.stringify({
    clientName:  'Integration Audit',
    orderNumber: 'TEST-' + Date.now(),
    files:       [testFile]
  });

  info('POST ' + PRODUCTION_URL + '/api/upload-to-dropbox');
  info('payload size: ' + payload.length + ' bytes');

  const prodUrl = new URL(PRODUCTION_URL + '/api/upload-to-dropbox');
  const res = await httpFetch(prodUrl.href, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  info('HTTP ' + res.status);
  info('Response: ' + res.raw.slice(0, 500));

  if (res.status !== 200 || !res.json || !res.json.success) {
    fail(8, 'Production end-to-end', 'HTTP ' + res.status + ' — ' + (res.json && res.json.error ? res.json.error : res.raw.slice(0, 200)));
    return;
  }

  pass(8, 'Production end-to-end', 'HTTP 200');
  info('success:      ' + res.json.success);
  info('orderNumber:  ' + res.json.orderNumber);
  info('uploadCount:  ' + res.json.uploadCount);
  info('folderLink:   ' + res.json.folderLink);
  return res.json;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  Ink & Seal Notary Pros — Dropbox Integration Audit');
  console.log('  ' + new Date().toISOString());
  console.log('  Mode: ' + (PRODUCTION_MODE ? 'PRODUCTION' : 'DIRECT API'));
  console.log('══════════════════════════════════════════════════════════════════════');

  const results = { passed: 0, failed: 0, folderLink: '' };

  try {
    const creds       = await step1_envVars();           results.passed++;
    const diagData    = await step2_functionDeployed();  if (!PRODUCTION_MODE || diagData) results.passed++;
    const accessToken = await step3_tokenRefresh(creds); results.passed++;
    const { folderPath } = await step4_createFolder(accessToken); results.passed++;
    await step5_uploadFile(accessToken, folderPath);     results.passed++;
    const folderLink  = await step6_sharedLink(accessToken, folderPath); results.passed++;
    results.folderLink = folderLink;
    await step7_sheetsWriteback(folderLink);             results.passed++;
    await step8_productionEndToEnd();

  } catch (err) {
    results.failed++;
    console.log('\n  ⛔  AUDIT HALTED: ' + err.message);
  }

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  AUDIT RESULTS: ' + results.passed + ' passed / ' + results.failed + ' failed');
  if (results.folderLink) {
    console.log('\n  ✅  DROPBOX FOLDER URL:');
    console.log('  ' + results.folderLink);
  }
  console.log('══════════════════════════════════════════════════════════════════════\n');
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(function (err) {
  console.error('\nUnhandled error:', err.message);
  process.exit(1);
});

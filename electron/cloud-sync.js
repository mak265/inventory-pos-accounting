/**
 * Cloud Sync Service (v2 — safe upsert)
 *
 * Runs in the Electron main process. When the internet is available, it pushes
 * locally-created data (from the local SQLite backend) up to the cloud server.
 *
 * WHY THIS WAS REWRITTEN
 * ----------------------
 * The old version logged in to the cloud with the wrong password and used
 * POST /api/sync/batch with operation "CREATE". On the cloud that path STRIPS
 * the _id and inserts a brand-new document, so every run DUPLICATED all data
 * (there is no unique index on drNumber). It also failed silently.
 *
 * NEW STRATEGY (idempotent, no duplicates)
 * ----------------------------------------
 *  1. Pull a full snapshot from the LOCAL backend:  GET /api/sync/full
 *     (already returns rows in the exact shape the cloud expects, with JSON
 *      columns parsed to objects).
 *  2. Push it to the cloud:  POST /api/sync/apply-full
 *     The cloud upserts BY _id — existing rows are updated, new rows inserted.
 *     Running repeatedly is safe.
 *  3. Push per entity, in small chunks, so each cloud mongo transaction stays
 *     small (large batches 500-crash the server). On a hard failure, the chunk
 *     is split in half and retried down to single rows.                      
 *
 * NOTES
 *  - Asset accounts are intentionally EXCLUDED: the cloud recomputes balances
 *    from payments and holds the authoritative totals. Pushing local (partial)
 *    asset accounts would corrupt cloud balances.
 *  - users / systemConfigurations are excluded (cloud manages its own admin;
 *    local system config is empty).
 *  - Everything is logged to <userData>/sync.log so runs are auditable.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CLOUD_URL = process.env.CLOUD_URL || '';
const LOCAL_PORT = 3000;
const SYNC_INTERVAL = 5 * 60 * 1000; // every 5 minutes
const CHUNK = 25;

const CLOUD_USER = process.env.CLOUD_SYNC_USER || '';
const CLOUD_PASS = process.env.CLOUD_SYNC_PASS || '';
// Local backend credentials (offline default admin).
const LOCAL_USER = 'admin';
const LOCAL_PASS = 'admin123';

// Which snapshot entities to push, and in what order (reference data first).
// assetAccounts, users, systemConfigurations are intentionally omitted.
const PUSH_ENTITIES = [
  'uoms',
  'vendors',
  'customers',
  'products',
  'purchaseOrders',
  'deliveryReceipts',
  'sales',
  'payments',
  'checkRecords',
  'expenses',
  'dailyCashDrawer',
];

let syncInterval = null;
let firstRunTimeout = null;
let isSyncing = false;
let logFilePath = null;

function init(userDataPath) {
  try {
    logFilePath = path.join(userDataPath, 'sync.log');
  } catch { /* ignore */ }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log('[Sync]', msg);
  try {
    if (logFilePath) {
      // keep the log from growing unbounded
      let prev = '';
      try { prev = fs.readFileSync(logFilePath, 'utf8'); } catch { /* new file */ }
      const combined = (prev + line + '\n').slice(-200000); // last ~200KB
      fs.writeFileSync(logFilePath, combined);
    }
  } catch { /* ignore */ }
}

function checkCloudReachable() {
  return new Promise((resolve) => {
    const url = new URL(CLOUD_URL);
    const req = https.request({
      hostname: url.hostname, port: 443, path: '/api', method: 'GET',
      timeout: 5000, rejectUnauthorized: false,
    }, (res) => resolve(res.statusCode >= 200 && res.statusCode < 500));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function localApiCall(method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port: LOCAL_PORT, path: `/api/${endpoint}`, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, data: buf }); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function cloudApiCall(method, endpoint, body, token) {
  return new Promise((resolve) => {
    const url = new URL(CLOUD_URL);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname, port: 443, path: `/api/${endpoint}`, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      rejectUnauthorized: false, timeout: 120000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, data: buf }); } });
    });
    req.on('error', (e) => resolve({ status: 0, data: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function getCloudToken() {
  const r = await cloudApiCall('POST', 'auth/login', { username: CLOUD_USER, password: CLOUD_PASS });
  if (r.status === 200 && r.data && r.data.token) return r.data.token;
  log(`Cloud login failed (status ${r.status})`);
  return null;
}

async function getLocalToken() {
  try {
    const r = await localApiCall('POST', 'auth/login', { username: LOCAL_USER, password: LOCAL_PASS });
    if (r.data && r.data.token) return r.data.token;
  } catch (e) {
    log(`Local login error: ${e.message}`);
  }
  return null;
}

// Push one entity's rows to the cloud, splitting on hard failure.
async function pushEntity(key, rows, cloudToken) {
  const totals = { up: 0, sk: 0, er: 0 };

  async function push(slice) {
    if (!slice.length) return;
    const payload = {
      meta: { generatedAt: new Date().toISOString(), source: 'offline-app' },
      entities: { [key]: slice },
      counts: { [key]: slice.length },
    };
    const r = await cloudApiCall('POST', 'sync/apply-full', payload, cloudToken);
    if (r.status === 200 && r.data && r.data.applied) {
      const a = r.data.applied[key] || { upserted: 0, skipped: 0, errors: 0 };
      totals.up += a.upserted; totals.sk += a.skipped; totals.er += a.errors;
      return;
    }
    if (slice.length === 1) { totals.er += 1; return; }
    const mid = Math.floor(slice.length / 2);
    await push(slice.slice(0, mid));
    await push(slice.slice(mid));
  }

  for (const batch of chunk(rows, CHUNK)) {
    await push(batch);
  }
  return totals;
}

async function syncToCloud() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const reachable = await checkCloudReachable();
    if (!reachable) { return; } // offline — quietly skip

    const cloudToken = await getCloudToken();
    if (!cloudToken) return;

    const localToken = await getLocalToken();
    if (!localToken) { log('Local backend not ready'); return; }

    // Pull the full local snapshot (rows already shaped for apply-full).
    const snapRes = await localApiCall('GET', 'sync/full', null, localToken);
    if (snapRes.status !== 200 || !snapRes.data || !snapRes.data.entities) {
      log(`Could not read local snapshot (status ${snapRes.status})`);
      return;
    }
    const entities = snapRes.data.entities;

    let grandUp = 0, grandErr = 0;
    for (const key of PUSH_ENTITIES) {
      const rows = Array.isArray(entities[key]) ? entities[key] : [];
      if (!rows.length) continue;
      const t = await pushEntity(key, rows, cloudToken);
      grandUp += t.up; grandErr += t.er;
    }

    log(`Sync complete. synced=${grandUp} errors=${grandErr}`);
  } catch (err) {
    log(`Sync error: ${err && err.message ? err.message : err}`);
  } finally {
    isSyncing = false;
  }
}

function start(userDataPath) {
  init(userDataPath);
  if (!CLOUD_URL || !CLOUD_USER || !CLOUD_PASS) {
    log('Cloud sync disabled: configure CLOUD_URL, CLOUD_SYNC_USER, and CLOUD_SYNC_PASS to enable it.');
    return;
  }
  syncInterval = setInterval(syncToCloud, SYNC_INTERVAL);
  firstRunTimeout = setTimeout(syncToCloud, 8000); // first run shortly after boot
  log(`Cloud sync service started (every ${SYNC_INTERVAL / 60000} min, upsert mode)`);
}

function stop() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if (firstRunTimeout) { clearTimeout(firstRunTimeout); firstRunTimeout = null; }
}

module.exports = { start, stop, syncToCloud };

/**
 * Cloud Push Service (server-side, on the LOCAL SQLite desktop backend)
 * -------------------------------------------------------------------
 * Pushes offline data up to the cloud via the cloud's POST /api/sync/apply-full
 * (upsert BY _id — safe, idempotent, no duplicates).
 *
 * This powers the in-app "Sync to Cloud" button. Unlike the old queue-based
 * frontend sync, it sends a full snapshot so edits/voids are reflected:
 *  - A voided sale (status='CANCELLED', isDeleted=0) IS included → cloud row
 *    is updated to CANCELLED by _id.
 *  - Deleted rows (isDeleted=1) ARE included too so deletions propagate.
 *
 * Excludes assetAccounts (cloud recomputes balances from payments and is
 * authoritative) and users/systemConfigurations (cloud manages its own).
 *
 * Only runs when DB_MODE=sqlite (i.e. the offline desktop app).
 */

import https from 'https';
import { getFullSnapshotIncludingDeleted } from './snapshotAll.js';

const CLOUD_URL = process.env.CLOUD_URL || '';
const CLOUD_USER = process.env.CLOUD_SYNC_USER || '';
const CLOUD_PASS = process.env.CLOUD_SYNC_PASS || '';
const CHUNK = 25;

// Entities to push, in dependency order. assetAccounts/users/systemConfigurations excluded.
const PUSH_ENTITIES = [
  'uoms', 'vendors', 'customers', 'products', 'purchaseOrders',
  'deliveryReceipts', 'sales', 'payments', 'checkRecords', 'expenses', 'dailyCashDrawer',
];

function cloudCall(method: string, apiPath: string, body: any, token?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve) => {
    const url = new URL(CLOUD_URL);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: `/api/${apiPath}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      rejectUnauthorized: false,
      timeout: 120000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode || 0, data: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode || 0, data: buf }); } });
    });
    req.on('error', (e) => resolve({ status: 0, data: (e as Error).message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export type PushResult = {
  ok: boolean;
  reachable: boolean;
  totalUpserted: number;
  totalErrors: number;
  perEntity: Record<string, { upserted: number; errors: number }>;
  message?: string;
};

export async function pushToCloud(): Promise<PushResult> {
  const perEntity: Record<string, { upserted: number; errors: number }> = {};
  let totalUpserted = 0;
  let totalErrors = 0;

  if ((process.env.DB_MODE || 'mongodb') !== 'sqlite') {
    return { ok: false, reachable: false, totalUpserted: 0, totalErrors: 0, perEntity, message: 'Push only runs on the local offline app.' };
  }
  if (!CLOUD_URL || !CLOUD_USER || !CLOUD_PASS) {
    return { ok: false, reachable: false, totalUpserted: 0, totalErrors: 0, perEntity, message: 'Cloud sync is not configured.' };
  }

  // 1. Login to cloud
  const login = await cloudCall('POST', 'auth/login', { username: CLOUD_USER, password: CLOUD_PASS });
  if (login.status === 0) {
    return { ok: false, reachable: false, totalUpserted: 0, totalErrors: 0, perEntity, message: 'Cloud not reachable (no internet).' };
  }
  if (login.status !== 200 || !login.data || !login.data.token) {
    return { ok: false, reachable: true, totalUpserted: 0, totalErrors: 0, perEntity, message: 'Cloud login failed.' };
  }
  const token = login.data.token;

  // 2. Build full snapshot from local SQLite (INCLUDING deleted/voided rows)
  const snapshot = await getFullSnapshotIncludingDeleted();

  // 3. Push each entity in small chunks, several chunks CONCURRENTLY.
  //    The cloud is high-latency per request, so sequential upload of ~600
  //    chunks is very slow. Running CONCURRENCY chunks in parallel cuts the
  //    wall-clock time dramatically while keeping each mongo transaction small.
  for (const key of PUSH_ENTITIES) {
    const rows: any[] = (snapshot.entities && snapshot.entities[key]) || [];
    perEntity[key] = { upserted: 0, errors: 0 };
    if (!rows.length) continue;

    const push = async (slice: any[]): Promise<void> => {
      if (!slice.length) return;
      const payload = { meta: { generatedAt: new Date().toISOString(), source: 'in-app-sync' }, entities: { [key]: slice }, counts: { [key]: slice.length } };
      const r = await cloudCall('POST', 'sync/apply-full', payload, token);
      if (r.status === 200 && r.data && r.data.applied) {
        const a = r.data.applied[key] || { upserted: 0, errors: 0 };
        perEntity[key].upserted += a.upserted; perEntity[key].errors += a.errors;
        return;
      }
      if (slice.length === 1) { perEntity[key].errors += 1; return; }
      const mid = Math.floor(slice.length / 2);
      await push(slice.slice(0, mid));
      await push(slice.slice(mid));
    };

    const batches = chunk(rows, CHUNK);
    const CONCURRENCY = 6;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const wave = batches.slice(i, i + CONCURRENCY).map((b) => push(b));
      await Promise.all(wave);
    }
    totalUpserted += perEntity[key].upserted;
    totalErrors += perEntity[key].errors;
  }

  return { ok: true, reachable: true, totalUpserted, totalErrors, perEntity };
}

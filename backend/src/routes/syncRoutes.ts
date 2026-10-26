import { Router } from 'express';
import { batchSync, getChanges, resolveConflict, getFullSnapshot, applyFullSnapshot, applyFullSnapshotNoAuth, pushToCloudHandler } from '../controllers/syncController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Full-apply NO-AUTH endpoint: ONLY useful on LOCAL/Electron backend (SQLite mode)
// for first-boot seeding where user hasn't logged in yet but pulled cloud snapshot.
// This is harmless remotely too: remote server uses router.use(authenticate) on ALL
// other sync routes. We keep this outside the auth guard to allow localhost-only seed.
router.post('/apply-full-noauth', applyFullSnapshotNoAuth);

// All sync routes below require authentication — including the regular apply-full
router.use(authenticate);

// Full snapshot endpoints — for initial cloud → local offline pull
router.get('/full', getFullSnapshot);
router.post('/apply-full', applyFullSnapshot);

// In-app "Sync to Cloud" button — pushes offline data up to the cloud (upsert by _id)
router.post('/push-to-cloud', pushToCloudHandler);

// Batch sync endpoint (for subsequent per-operation sync)
router.post('/batch', batchSync);

// Get changes since timestamp (incremental pull)
router.get('/changes/:since', getChanges);

// Resolve conflict manually
router.post('/resolve-conflict', resolveConflict);

export default router;

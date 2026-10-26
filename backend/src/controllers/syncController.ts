import { Request, Response } from 'express';
import { syncService } from '../services/syncService.js';
import type { BatchSyncRequest, BatchSyncResponse } from '../types/sync.js';
import { pushToCloud } from '../services/cloudPushService.js';

/**
 * POST /api/sync/push-to-cloud
 * Pushes offline data up to the cloud (upsert by _id). Powers the in-app
 * "Sync to Cloud" button. Local SQLite desktop app only.
 */
export async function pushToCloudHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pushToCloud();
    res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    console.error('[Sync] pushToCloud error:', error);
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * GET a FULL database snapshot — used for first-time cloud -> local full pull.
 * Auth protected. Returns non-deleted rows across all entities.
 */
export async function getFullSnapshot(_req: Request, res: Response): Promise<void> {
  try {
    const snap = await syncService.getFullSnapshot();
    res.json(snap);
  } catch (error) {
    console.error('[Sync] getFullSnapshot error:', error);
    res.status(500).json({ error: 'Failed to create full snapshot', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * POST body: { meta, entities, counts } — apply a full snapshot to local DB.
 * Auth protected. Used after a cloud pull has finished.
 */
export async function applyFullSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const snapshot = req.body;
    if (!snapshot || !snapshot.entities) {
      res.status(400).json({ error: 'Invalid snapshot.entities is required' });
      return;
    }
    const result = await syncService.applyFullSnapshot(snapshot);
    res.json(result);
  } catch (error) {
    console.error('[Sync] applyFullSnapshot error:', error);
    res.status(500).json({ error: 'Failed to apply full snapshot', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * No-auth variant of applyFullSnapshot. ONLY permitted on the LOCAL SQLite desktop
 * backend (DB_MODE=sqlite) for first-boot seeding before the user has logged in.
 * On the remote cloud (DB_MODE=mongodb) it is hard-refused.
 */
export async function applyFullSnapshotNoAuth(req: Request, res: Response): Promise<void> {
  try {
    if ((process.env.DB_MODE || 'mongodb') !== 'sqlite') {
      res.status(403).json({ error: 'apply-full-noauth endpoint is ONLY permitted on LOCAL SQLite desktop backend mode.', dbMode: process.env.DB_MODE || 'mongodb' });
      return;
    }
    const snapshot = req.body;
    if (!snapshot || !snapshot.entities) {
      res.status(400).json({ error: 'Invalid snapshot.entities is required' });
      return;
    }
    const result = await syncService.applyFullSnapshot(snapshot);
    res.json(result);
  } catch (error) {
    console.error('[Sync] applyFullSnapshotNoAuth error:', error);
    res.status(500).json({ error: 'Failed to apply full snapshot', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Handle batch sync operations
 */
export async function batchSync(req: Request, res: Response): Promise<void> {
  try {
    const { operations } = req.body as BatchSyncRequest;

    if (!operations || !Array.isArray(operations)) {
      res.status(400).json({
        error: 'Invalid request: operations array is required'
      });
      return;
    }

    // Process the batch
    const results = await syncService.processBatch(operations);

    const response: BatchSyncResponse = {
      results,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('Batch sync error:', error);
    res.status(500).json({
      error: 'Internal server error during sync',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get changes since a specific timestamp
 */
export async function getChanges(req: Request, res: Response): Promise<void> {
  try {
    const { since } = req.params;
    const { collection } = req.query;

    if (!since) {
      res.status(400).json({
        error: 'Missing required parameter: since'
      });
      return;
    }

    if (!collection || typeof collection !== 'string') {
      res.status(400).json({
        error: 'Missing required query parameter: collection'
      });
      return;
    }

    const changes = await syncService.getChangesSince(collection, since);

    res.json({
      changes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get changes error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Resolve a sync conflict manually
 */
export async function resolveConflict(req: Request, res: Response): Promise<void> {
  try {
    const { collection, recordId, resolution } = req.body;

    if (!collection || !recordId || !resolution) {
      res.status(400).json({
        error: 'Missing required fields: collection, recordId, resolution'
      });
      return;
    }

    // For now, we'll use the sync service to handle the resolution
    // In a real implementation, this would have more sophisticated conflict resolution
    const result = await syncService.processBatch([
      {
        id: `conflict-resolution-${Date.now()}`,
        operation: 'UPDATE',
        collection,
        data: {
          _id: recordId,
          ...resolution
        },
        timestamp: new Date().toISOString(),
        userId: (req as any).user?.id || 'system'
      }
    ]);

    res.json({
      success: result[0].success,
      result: result[0]
    });
  } catch (error) {
    console.error('Resolve conflict error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

import { syncQueueService } from './syncQueue';
import { retryService } from './retryService';
import { db, type SyncQueueItem } from '../db/database';
import { getValidToken, handleSyncAuthError } from './tokenService';
import axios from 'axios';

const getSyncStore = async () => {
  const { useSyncStore } = await import('../stores/syncStore');
  return useSyncStore();
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || '') + '/api';

interface SyncResult {
  id: string;
  success: boolean;
  serverId?: string;
  error?: string;
  conflict?: {
    localVersion: number;
    serverVersion: number;
    serverData: any;
  };
}

interface BatchSyncResponse {
  results: SyncResult[];
  timestamp: string;
}

export class SyncService {
  private _syncStore: any = null;
  private isProcessing = false;

  private async getSyncStoreInstance() {
    if (!this._syncStore) {
      this._syncStore = await getSyncStore();
    }
    return this._syncStore;
  }

  /**
   * Start the sync process
   */
  async startSync(): Promise<void> {
    if (this.isProcessing) {
      console.log('Sync already in progress');
      return;
    }

    const store = await this.getSyncStoreInstance();
    if (!store.isOnline) {
      console.log('Cannot sync while offline');
      return;
    }

    this.isProcessing = true;
    store.setSyncingStatus(true);
    store.clearSyncError();

    try {
      await this.processQueue();
      store.setLastSyncTime(new Date());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      console.error('Sync error:', errorMessage);
      store.setSyncError(errorMessage);
    } finally {
      this.isProcessing = false;
      store.setSyncingStatus(false);
      await store.updateCounts();
    }
  }

  /**
   * Process the sync queue in chronological order
   */
  private async processQueue(): Promise<void> {
    const pendingItems = await syncQueueService.getAllPending();

    if (pendingItems.length === 0) {
      console.log('No pending items to sync');
      return;
    }

    console.log(`Processing ${pendingItems.length} pending sync operations`);
    const store = await this.getSyncStoreInstance();
    store.setSyncProgress(0, pendingItems.length);

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < pendingItems.length; i += batchSize) {
      const batch = pendingItems.slice(i, i + batchSize);
      await this.processBatch(batch);
      store.setSyncProgress(Math.min(i + batchSize, pendingItems.length), pendingItems.length);
    }
  }

  /**
   * Process a batch of sync operations
   */
  private async processBatch(items: SyncQueueItem[]): Promise<void> {
    try {
      // Mark all items as syncing
      for (const item of items) {
        await syncQueueService.updateStatus(item.id, 'SYNCING');
      }

      // Get a valid (refreshed if needed) token
      const token = await this.getAuthToken();

      // Send batch to server
      let response;
      try {
        response = await axios.post<BatchSyncResponse>(
          `${API_BASE_URL}/sync/batch`,
          {
            operations: items.map(item => ({
              id: item.id,
              operation: item.operation,
              collection: item.collection,
              data: item.data,
              timestamp: item.timestamp,
              userId: item.userId
            }))
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
      } catch (axiosError: any) {
        // Handle 401 — attempt token refresh and retry once
        if (axiosError.response?.status === 401) {
          const refreshed = await handleSyncAuthError();
          if (refreshed) {
            const newToken = await this.getAuthToken();
            response = await axios.post<BatchSyncResponse>(
              `${API_BASE_URL}/sync/batch`,
              {
                operations: items.map(item => ({
                  id: item.id,
                  operation: item.operation,
                  collection: item.collection,
                  data: item.data,
                  timestamp: item.timestamp,
                  userId: item.userId
                }))
              },
              {
                headers: {
                  'Authorization': `Bearer ${newToken}`
                }
              }
            );
          } else {
            throw axiosError;
          }
        } else {
          throw axiosError;
        }
      }

      // Process results
      for (const result of response.data.results) {
        await this.handleSyncResult(result);
      }
    } catch (error) {
      console.error('Batch sync failed:', error);

      // Mark all items as failed and schedule retries
      for (const item of items) {
        const errorMessage = error instanceof Error ? error.message : 'Network error';
        await syncQueueService.updateStatus(item.id, 'FAILED', errorMessage);

        // Schedule retry with exponential backoff
        await retryService.scheduleRetry(item.id);
      }

      throw error;
    }
  }

  /**
   * Handle the result of a sync operation
   */
  private async handleSyncResult(result: SyncResult): Promise<void> {
    if (result.success) {
      // Update local record with server ID if it's a CREATE operation
      if (result.serverId) {
        const item = await db.syncQueue.get(result.id);
        if (item && item.operation === 'CREATE') {
          await this.updateLocalRecordId(item.collection, item.data._id, result.serverId);
        }
      }

      // Mark as completed and remove from queue
      await syncQueueService.updateStatus(result.id, 'COMPLETED');
      await syncQueueService.remove(result.id);

      // Log success
      await this.logSync(result.id, 'SUCCESS');
    } else if (result.conflict) {
      // Handle conflict using last-write-wins
      await this.resolveConflict(result);
    } else {
      // Mark as failed and schedule retry
      await syncQueueService.updateStatus(result.id, 'FAILED', result.error);
      await this.logSync(result.id, 'ERROR', result.error);

      // Schedule retry with exponential backoff
      await retryService.scheduleRetry(result.id);
    }
  }

  /**
   * Resolve sync conflict using last-write-wins strategy
   */
  private async resolveConflict(result: SyncResult): Promise<void> {
    const item = await db.syncQueue.get(result.id);
    if (!item || !result.conflict) return;

    console.log('Conflict detected:', result);

    // Compare timestamps - last write wins
    const localTimestamp = new Date(item.timestamp).getTime();
    const serverTimestamp = new Date(result.conflict.serverData.updatedAt).getTime();

    if (localTimestamp > serverTimestamp) {
      // Local version is newer - retry the sync
      console.log('Local version is newer, retrying sync');
      await syncQueueService.updateStatus(item.id, 'PENDING');
    } else {
      // Server version is newer - update local data
      console.log('Server version is newer, updating local data');
      await this.updateLocalRecord(item.collection, result.conflict.serverData);

      // Mark as completed and remove from queue
      await syncQueueService.updateStatus(item.id, 'COMPLETED');
      await syncQueueService.remove(item.id);

      // Log conflict resolution
      await this.logSync(result.id, 'CONFLICT', undefined, result.conflict);
    }
  }

  /**
   * Update local record ID after successful CREATE
   */
  private async updateLocalRecordId(
    collection: string,
    localId: string,
    serverId: string
  ): Promise<void> {
    const table = (db as any)[collection];
    if (!table) return;

    const record = await table.get(localId);
    if (record) {
      await table.delete(localId);
      record._id = serverId;
      await table.add(record);
    }
  }

  /**
   * Update local record with server data
   */
  private async updateLocalRecord(collection: string, serverData: any): Promise<void> {
    const table = (db as any)[collection];
    if (!table) return;

    await table.put(serverData);
  }

  /**
   * Log sync operation
   */
  private async logSync(
    queueId: string,
    status: 'SUCCESS' | 'CONFLICT' | 'ERROR',
    errorMessage?: string,
    conflictData?: any
  ): Promise<void> {
    await db.syncLog.add({
      id: `${queueId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      operation: 'SYNC',
      collection: 'syncQueue',
      recordId: queueId,
      status,
      conflictData,
      errorMessage
    });
  }

  /**
   * Get authentication token (with auto-refresh)
   */
  private async getAuthToken(): Promise<string> {
    const token = await getValidToken();
    return token || localStorage.getItem('auth_token') || '';
  }

  /**
   * Schedule automatic sync when online
   */
  startAutoSync(intervalMs: number = 30000): void {
    setInterval(async () => {
      const store = await this.getSyncStoreInstance();
      if (store.isOnline && !this.isProcessing) {
        this.startSync().catch(console.error);
      }
    }, intervalMs);
  }
}

export const syncService = new SyncService();

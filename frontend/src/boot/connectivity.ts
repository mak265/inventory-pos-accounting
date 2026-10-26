import { boot } from 'quasar/wrappers';
import { Notify } from 'quasar';
import { getValidToken, handleSyncAuthError } from '../services/tokenService';

/**
 * Probes actual server reachability (navigator.onLine can lie on weak connections).
 * Returns true if the backend API is reachable.
 */
async function isServerReachable(): Promise<boolean> {
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_URL}/api/health`, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

export async function processOfflineQueue(silent = false) {
  try {
    const { db, isDbAvailable } = await import('../db/database');
    
    // Skip if IndexedDB is not available (e.g., Electron with remote URL)
    if (!isDbAvailable) return 0;
    
    // Process PENDING items
    const pendingItems = await db.syncQueue.where('status').equals('PENDING').sortBy('timestamp');
    if (pendingItems.length === 0) return 0;

    // Verify server is actually reachable before attempting sync
    const reachable = await isServerReachable();
    if (!reachable) {
      if (!silent) console.log('Server not reachable, skipping sync attempt');
      return 0;
    }

    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = await getValidToken();
    if (!token) return 0;
    
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const endpointMap: Record<string, string> = {
      uoms: 'uoms', customers: 'customers', vendors: 'vendors',
      purchaseOrders: 'purchase-orders', deliveryReceipts: 'deliveries',
      sales: 'sales', products: 'products', payments: 'payments',
      expenses: 'expenses', assetAccounts: 'asset-accounts'
    };

    let synced = 0;
    for (const item of pendingItems) {
      try {
        const endpoint = endpointMap[item.collection] || item.collection;
        const { _id, adminPassword, ...cleanData } = item.data || {};

        let res: Response | null = null;
        if (item.operation === 'CREATE') {
          res = await fetch(`${API_URL}/api/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(cleanData) });
        } else if (item.operation === 'UPDATE' && _id) {
          res = await fetch(`${API_URL}/api/${endpoint}/${_id}`, { method: 'PUT', headers, body: JSON.stringify(cleanData) });
        } else if (item.operation === 'DELETE' && _id) {
          res = await fetch(`${API_URL}/api/${endpoint}/${_id}`, { method: 'DELETE', headers, body: JSON.stringify({ adminPassword: adminPassword || '' }) });
        }

        if (res && res.ok) {
          await db.syncQueue.update(item.id!, { status: 'COMPLETED' });
          synced++;
        } else if (res && res.status === 401) {
          // Token expired during sync — attempt refresh and retry this item
          const refreshed = await handleSyncAuthError();
          if (refreshed) {
            // Update headers with new token and retry this item
            const newToken = localStorage.getItem('auth_token');
            headers['Authorization'] = `Bearer ${newToken}`;
            // Retry the same request
            let retryRes: Response | null = null;
            if (item.operation === 'CREATE') {
              retryRes = await fetch(`${API_URL}/api/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(cleanData) });
            } else if (item.operation === 'UPDATE' && _id) {
              retryRes = await fetch(`${API_URL}/api/${endpoint}/${_id}`, { method: 'PUT', headers, body: JSON.stringify(cleanData) });
            } else if (item.operation === 'DELETE' && _id) {
              retryRes = await fetch(`${API_URL}/api/${endpoint}/${_id}`, { method: 'DELETE', headers, body: JSON.stringify({ adminPassword: adminPassword || '' }) });
            }
            if (retryRes && retryRes.ok) {
              await db.syncQueue.update(item.id!, { status: 'COMPLETED' });
              synced++;
            } else {
              await db.syncQueue.update(item.id!, { status: 'FAILED', retryCount: (item.retryCount || 0) + 1 });
            }
          } else {
            // Cannot refresh — mark as failed, will retry later
            await db.syncQueue.update(item.id!, { status: 'FAILED', retryCount: (item.retryCount || 0) + 1 });
          }
        } else {
          console.error('Sync API error:', res?.status, await res?.text().catch(() => ''));
          await db.syncQueue.update(item.id!, { status: 'FAILED', retryCount: (item.retryCount || 0) + 1 });
        }
      } catch (e) {
        console.error('Sync item failed:', e);
        await db.syncQueue.update(item.id!, { status: 'FAILED', retryCount: (item.retryCount || 0) + 1 });
      }
    }

    // Clean up completed items
    await db.syncQueue.where('status').equals('COMPLETED').delete();

    // Move items that failed too many times to dead letter queue (NEVER permanently delete)
    const failedItems = await db.syncQueue.where('status').equals('FAILED').toArray();
    for (const f of failedItems) {
      if ((f.retryCount || 0) > 5) {
        // Move to dead letter queue for manual review — data is preserved
        await db.deadLetterQueue.add({
          id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          originalId: f.id,
          operation: f.operation,
          collection: f.collection,
          data: f.data,
          timestamp: f.timestamp,
          userId: f.userId,
          retryCount: f.retryCount,
          lastError: f.error,
          movedAt: new Date().toISOString()
        });
        await db.syncQueue.delete(f.id);
      }
    }

    // Also retry FAILED items that still have retries left (reset to PENDING)
    const retryableItems = await db.syncQueue.where('status').equals('FAILED').toArray();
    for (const f of retryableItems) {
      if ((f.retryCount || 0) <= 5) {
        await db.syncQueue.update(f.id, { status: 'PENDING' });
      }
    }

    if (synced > 0 && !silent) {
      Notify.create({ type: 'positive', message: `Synced ${synced} offline change${synced > 1 ? 's' : ''}`, position: 'top-right', timeout: 2000 });
    }
    return synced;
  } catch (e) {
    console.error('processOfflineQueue error:', e);
    return 0;
  }
}

/**
 * Periodic sync interval — checks for pending items and pushes them automatically.
 * Runs every 30 seconds when online. Handles intermittent connections gracefully.
 */
let periodicSyncInterval: ReturnType<typeof setInterval> | null = null;

function startPeriodicSync() {
  if (periodicSyncInterval) return; // Already running
  periodicSyncInterval = setInterval(async () => {
    if (navigator.onLine) {
      await processOfflineQueue(true);
    }
  }, 30000); // Every 30 seconds
}

function stopPeriodicSync() {
  if (periodicSyncInterval) {
    clearInterval(periodicSyncInterval);
    periodicSyncInterval = null;
  }
}

export default boot(async ({ store }) => {
  // Initialize IndexedDB (or patch it to no-op if unavailable)
  const { initializeDatabase } = await import('../db/database');
  await initializeDatabase();

  const { useSyncStore } = await import('../stores/syncStore');
  const syncStore = useSyncStore(store);

  syncStore.initConnectivityDetection();

  // Process any pending queue items on startup if online
  if (navigator.onLine) {
    setTimeout(() => processOfflineQueue(true), 2000);
  }

  // Start periodic sync to catch items missed by event-based sync
  startPeriodicSync();

  window.addEventListener('online', async () => {
    syncStore.setOnlineStatus(true);
    syncStore.clearSyncError();
    Notify.create({ type: 'positive', message: 'Connection restored. Syncing…', icon: 'wifi', position: 'top-right', timeout: 3000 });

    // Wait a moment for connection to stabilize, then aggressively sync
    setTimeout(async () => {
      await processOfflineQueue();
      await syncStore.updateCounts();

      // Second pass after 5s to catch any items that were mid-retry
      setTimeout(async () => {
        await processOfflineQueue(true);
        await syncStore.updateCounts();
      }, 5000);
    }, 2000);

    // Ensure periodic sync is running
    startPeriodicSync();
  });

  window.addEventListener('offline', () => {
    syncStore.setOnlineStatus(false);
    Notify.create({ type: 'warning', message: 'You are offline. Changes will be saved locally.', icon: 'wifi_off', position: 'top-right', timeout: 5000, textColor: 'dark' });
    // Stop periodic sync to avoid wasted requests
    stopPeriodicSync();
  });

  // Also listen for visibility change — sync when user returns to the app
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      await processOfflineQueue(true);
      await syncStore.updateCounts();
    }
  });
});

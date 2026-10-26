/**
 * Background Sync integration for the app-level sync queue.
 *
 * With GenerateSW mode, Workbox handles low-level request replay via its
 * BackgroundSync plugin (configured in quasar.config.js).
 *
 * This module complements that by:
 *  1. Requesting a periodic / one-shot background sync tag so the browser
 *     wakes the SW when connectivity returns.
 *  2. Listening for online events at the application layer and triggering
 *     the app's own syncStore / syncService processing.
 */

const SYNC_TAG = 'pos-sync-queue';

const getSyncStore = async () => {
  const { useSyncStore } = await import('../stores/syncStore');
  return useSyncStore();
};

/**
 * Register a one-shot background sync with the service worker.
 * Falls back silently when the API is unavailable.
 */
export async function requestBackgroundSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration && 'sync' in registration) {
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG);
      console.log(`Background sync registered: ${SYNC_TAG}`);
    }
  } catch (err) {
    // Background Sync API not supported or permission denied – not critical
    console.warn('Background sync registration failed:', err);
  }
}

/**
 * Process the application-level sync queue.
 * Called when connectivity is restored (either via SW sync event or online listener).
 */
export async function processSyncQueue(): Promise<void> {
  try {
    const syncStore = await getSyncStore();

    if (!syncStore.isOnline) return;
    if (syncStore.isSyncing) return;

    await syncStore.updateCounts();

    if (syncStore.pendingCount === 0) return;

    // Dynamically import to avoid circular deps
    const { syncService } = await import('./syncService');
    await syncService.startSync();
  } catch (err) {
    console.error('Background sync queue processing failed:', err);
  }
}

/**
 * Initialize background sync listeners.
 * Should be called once during app startup (e.g. from a boot file).
 */
export function initBackgroundSync(): void {
  // When the browser comes back online, process the queue
  window.addEventListener('online', () => {
    // Small delay to let the network stabilise
    setTimeout(() => {
      processSyncQueue();
    }, 2000);
  });

  // Also request a SW-level sync tag whenever items are queued
  // (consumers call requestBackgroundSync() after enqueue)
}

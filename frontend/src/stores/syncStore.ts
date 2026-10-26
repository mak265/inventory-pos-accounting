import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { syncQueueService } from '../services/syncQueue';
import type { SyncQueueItem } from '../db/database';

export type ConnectivityStatus = 'online' | 'offline' | 'syncing';

export const useSyncStore = defineStore('sync', () => {
  // State — default to true if on localhost (local backend is always available)
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isOnline = ref<boolean>(isLocalhost || navigator.onLine);
  const isSyncing = ref<boolean>(false);
  const pendingCount = ref<number>(0);
  const failedCount = ref<number>(0);
  const lastSyncTime = ref<Date | null>(null);
  const syncError = ref<string | null>(null);
  const syncProgress = ref<{ current: number; total: number }>({ current: 0, total: 0 });

  // Computed
  const connectivityStatus = computed<ConnectivityStatus>(() => {
    if (isSyncing.value) return 'syncing';
    return isOnline.value ? 'online' : 'offline';
  });

  const hasPendingChanges = computed(() => pendingCount.value > 0);
  const hasFailedChanges = computed(() => failedCount.value > 0);

  // Actions
  function setOnlineStatus(status: boolean) {
    isOnline.value = status;
  }

  function setSyncingStatus(status: boolean) {
    isSyncing.value = status;
  }

  async function updateCounts() {
    pendingCount.value = await syncQueueService.getPendingCount();
    failedCount.value = await syncQueueService.getFailedCount();
  }

  function setSyncProgress(current: number, total: number) {
    syncProgress.value = { current, total };
  }

  function setSyncError(error: string | null) {
    syncError.value = error;
  }

  function setLastSyncTime(time: Date) {
    lastSyncTime.value = time;
  }

  function clearSyncError() {
    syncError.value = null;
  }

  /**
   * Initialize connectivity detection
   */
  function initConnectivityDetection() {
    // Check if API is reachable (works for both cloud and local backend)
    checkApiReachable();

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  /**
   * Check if the API is reachable at the current origin.
   * If the page loaded successfully, the API should be reachable too.
   */
  async function checkApiReachable() {
    try {
      const res = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
      if (res.ok || res.status === 404 || res.status === 301) {
        // API is reachable (even 404 means server is up)
        setOnlineStatus(true);
      } else {
        setOnlineStatus(navigator.onLine);
      }
    } catch {
      // If fetch fails but page loaded, we're still "online" to the local backend
      // The page wouldn't have loaded if the server wasn't running
      setOnlineStatus(true);
    }
  }

  function handleOnline() {
    console.log('Connection restored - going online');
    setOnlineStatus(true);
    clearSyncError();
  }

  function handleOffline() {
    // Don't go offline if we're running on localhost (local backend is always available)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      // Local backend is still running — stay "online" for API purposes
      console.log('Browser says offline but local backend is available — staying online');
      return;
    }
    console.log('Connection lost - going offline');
    setOnlineStatus(false);
  }

  /**
   * Cleanup event listeners
   */
  function cleanup() {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  }

  /**
   * Add an operation to the sync queue
   */
  async function queueOperation(
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    collection: string,
    data: any,
    userId: string
  ): Promise<string> {
    const id = await syncQueueService.enqueue(operation, collection, data, userId);
    await updateCounts();
    return id;
  }

  /**
   * Add to sync queue (convenience wrapper used by entity stores)
   */
  async function addToQueue(item: { operation: 'CREATE' | 'UPDATE' | 'DELETE'; collection: string; data: any }) {
    const user = localStorage.getItem('auth_user');
    const userId = user ? JSON.parse(user)._id || 'unknown' : 'unknown';
    return await queueOperation(item.operation, item.collection, item.data, userId);
  }

  /**
   * Process the sync queue now (convenience wrapper)
   */
  async function processQueue() {
    try {
      const { syncService } = await import('../services/syncService');
      await syncService.startSync();
    } catch (err) {
      console.error('processQueue failed:', err);
    }
  }

  /**
   * Alias for processQueue
   */
  const syncNow = processQueue;

  /**
   * Retry failed sync operations
   */
  async function retryFailed() {
    await syncQueueService.resetFailed();
    await updateCounts();
  }

  /**
   * Clear completed sync operations
   */
  async function clearCompleted() {
    await syncQueueService.clearCompleted();
    await updateCounts();
  }

  /**
   * Get all queue items (for debugging)
   */
  async function getAllQueueItems(): Promise<SyncQueueItem[]> {
    return await syncQueueService.getAll();
  }

  /**
   * Push all offline pending data to the cloud server.
   * This is the user-facing "Sync Now" action that processes the offline queue.
   * Returns number of items successfully synced.
   */
  async function pushOfflineToCloud(showNotifications = true): Promise<number> {
    try {
      setSyncingStatus(true);
      clearSyncError();
      const { processOfflineQueue } = await import('../boot/connectivity');
      const synced = await processOfflineQueue(!showNotifications);
      await updateCounts();
      if (synced > 0) setLastSyncTime(new Date());
      return synced;
    } catch (e: any) {
      const msg = e?.message || 'Push to cloud failed';
      setSyncError(msg);
      return 0;
    } finally {
      setSyncingStatus(false);
      await updateCounts();
    }
  }

  return {
    // State
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    lastSyncTime,
    syncError,
    syncProgress,

    // Computed
    connectivityStatus,
    hasPendingChanges,
    hasFailedChanges,

    // Actions
    setOnlineStatus,
    setSyncingStatus,
    updateCounts,
    setSyncProgress,
    setSyncError,
    setLastSyncTime,
    clearSyncError,
    initConnectivityDetection,
    cleanup,
    queueOperation,
    addToQueue,
    processQueue,
    syncNow,
    retryFailed,
    clearCompleted,
    getAllQueueItems,
    pushOfflineToCloud
  };
});

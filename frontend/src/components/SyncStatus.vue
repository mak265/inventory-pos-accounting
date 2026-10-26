<template>
  <div class="sync-status-indicator">
    <q-btn
      flat
      round
      dense
      :icon="syncing ? 'sync' : statusIcon"
      :color="statusColor"
      class="sync-btn"
      :class="{ 'sync-pulse': pendingCount > 0 && !syncing, 'sync-failed': failedCount > 0 && !syncing }"
      :loading="syncing"
      @click="onOpenMenu"
    >
      <q-badge v-if="totalBadge > 0" :color="pendingCount > 0 ? 'orange' : 'negative'" floating>{{ totalBadge }}</q-badge>
      <q-menu anchor="bottom right" self="top right" :offset="[0, 8]" v-model="menuOpen">
        <q-list style="min-width: 240px">
          <q-item>
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ statusLabel }}</q-item-label>
              <q-item-label caption v-if="pendingCount > 0">{{ pendingCount }} pending change{{ pendingCount !== 1 ? 's' : '' }} queued</q-item-label>
              <q-item-label caption v-if="failedCount > 0 && pendingCount === 0">{{ failedCount }} failed - needs retry</q-item-label>
              <q-item-label caption v-if="lastSyncText">Last sync: {{ lastSyncText }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-separator />
          <q-item clickable v-close-popup @click="onSyncNow" :disable="syncing || !isOnline">
            <q-item-section avatar><q-icon name="cloud_upload" color="primary" size="20px" /></q-item-section>
            <q-item-section>
              <q-item-label>Sync Offline Data</q-item-label>
              <q-item-label caption>Push local changes to cloud server</q-item-label>
            </q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="onRetryFailed" v-if="failedCount > 0" :disable="syncing">
            <q-item-section avatar><q-icon name="refresh" color="warning" size="20px" /></q-item-section>
            <q-item-section>
              <q-item-label>Retry Failed</q-item-label>
              <q-item-label caption>{{ failedCount }} item{{ failedCount !== 1 ? 's' : '' }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="onClearQueue" v-if="pendingCount + failedCount > 0">
            <q-item-section avatar><q-icon name="delete_sweep" color="negative" size="20px" /></q-item-section>
            <q-item-section class="text-negative">Clear Queue</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Notify } from 'quasar';
import { useSyncStore } from '../stores/syncStore';

const syncStore = useSyncStore();

const menuOpen = ref(false);
const lastSyncText = ref('');

const syncing = computed(() => syncStore.isSyncing);
const pendingCount = computed(() => syncStore.pendingCount);
const failedCount = computed(() => syncStore.failedCount);
const isOnline = computed(() => syncStore.isOnline);
const totalBadge = computed(() => pendingCount.value + failedCount.value);

const statusIcon = computed(() => {
  if (syncStore.isSyncing) return 'sync';
  if (!isOnline.value) return 'cloud_off';
  if (failedCount.value > 0) return 'error_outline';
  if (pendingCount.value > 0) return 'sync_problem';
  return 'cloud_done';
});
const statusColor = computed(() => {
  if (!isOnline.value) return 'warning';
  if (failedCount.value > 0) return 'negative';
  if (pendingCount.value > 0) return 'orange';
  return 'white';
});
const statusLabel = computed(() => {
  if (syncStore.isSyncing) return 'Syncing to cloud…';
  if (!isOnline.value) return 'Offline - changes saved locally';
  if (failedCount.value > 0) return `${failedCount.value} failed - tap to retry`;
  if (pendingCount.value > 0) return `${pendingCount.value} offline changes waiting`;
  return 'Online - All data synced';
});

function onOpenMenu() {
  menuOpen.value = !menuOpen.value;
}

async function onSyncNow() {
  if (!syncStore.isOnline) {
    Notify.create({ type: 'warning', message: 'No internet connection. Try again when online.', icon: 'wifi_off', position: 'top-right', timeout: 3000 });
    return;
  }
  const total = pendingCount.value + failedCount.value;
  if (total === 0) {
    Notify.create({ type: 'info', message: 'No offline changes to sync', icon: 'cloud_done', position: 'top-right', timeout: 2000 });
    return;
  }
  try {
    if (failedCount.value > 0) {
      await syncStore.retryFailed();
    }
    const synced = await syncStore.pushOfflineToCloud(true);
    lastSyncText.value = new Date().toLocaleTimeString();
    if (synced > 0) {
      Notify.create({ type: 'positive', message: `Synced ${synced} offline change${synced > 1 ? 's' : ''} to cloud ✓`, icon: 'cloud_done', position: 'top-right', timeout: 3000 });
    } else if (pendingCount.value > 0 || failedCount.value > 0) {
      Notify.create({ type: 'warning', message: 'Some items could not sync. Check connection and retry.', icon: 'sync_problem', position: 'top-right', timeout: 4000 });
    } else {
      Notify.create({ type: 'info', message: 'All items already synced', position: 'top-right', timeout: 2000 });
    }
  } catch (e) {
    Notify.create({ type: 'negative', message: 'Sync error: ' + (e as Error).message, position: 'top-right', timeout: 4000 });
  }
}

async function onRetryFailed() {
  try {
    await syncStore.retryFailed();
    const synced = await syncStore.pushOfflineToCloud(true);
    Notify.create({ type: synced > 0 ? 'positive' : 'info', message: synced > 0 ? `Retried and synced ${synced} item${synced > 1 ? 's' : ''}` : 'No items retried successfully', position: 'top-right', timeout: 3000 });
  } catch (e) {
    Notify.create({ type: 'negative', message: 'Retry failed: ' + (e as Error).message, position: 'top-right', timeout: 4000 });
  }
}

async function onClearQueue() {
  try {
    const { db } = await import('../db/database');
    await db.syncQueue.clear();
    await syncStore.updateCounts();
    Notify.create({ type: 'info', message: 'Sync queue cleared', position: 'top-right', timeout: 2000 });
  } catch { /* silent */ }
}

const onlineHandler = () => { syncStore.setOnlineStatus(true); };
const offlineHandler = () => { syncStore.setOnlineStatus(false); };

watch(
  () => syncStore.lastSyncTime,
  (t) => { if (t) lastSyncText.value = new Date(t).toLocaleTimeString(); },
  { immediate: true }
);

onMounted(async () => {
  await syncStore.updateCounts();
  setInterval(() => syncStore.updateCounts(), 10000);
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  // After mount / page refresh, flash the indicator if there are pending items
  // so the user notices there's offline data waiting to sync
  if (pendingCount.value > 0) {
    Notify.create({
      type: 'info',
      message: `${pendingCount.value} offline change${pendingCount.value > 1 ? 's' : ''} ready to sync — tap the cloud icon to upload`,
      icon: 'cloud_upload',
      position: 'top-right',
      timeout: 5000,
      actions: [{
        label: 'Sync Now',
        color: 'primary',
        handler: () => onSyncNow()
      }]
    });
  }
});
onUnmounted(() => {
  window.removeEventListener('online', onlineHandler);
  window.removeEventListener('offline', offlineHandler);
});
</script>

<style scoped lang="scss">
.sync-status-indicator { position: relative; display: inline-flex; align-items: center; }
.sync-btn .q-icon { font-size: 22px; }
.sync-btn {
  transition: transform 0.2s ease;
}
.sync-pulse {
  animation: syncPulse 1.8s ease-in-out infinite;
  position: relative;
}
.sync-pulse::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(255, 152, 0, 0.6);
  animation: syncRing 1.8s ease-out infinite;
}
.sync-failed {
  position: relative;
}
.sync-failed::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(245, 67, 54, 0.6);
  animation: syncRing 1.2s ease-out infinite;
}
@keyframes syncPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
@keyframes syncRing {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.35); opacity: 0; }
}
</style>

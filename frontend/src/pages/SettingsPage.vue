<template>
  <q-page padding>
    <div class="text-h5 q-mb-md">Settings</div>

    <q-tabs v-model="activeTab" dense align="left" class="text-grey" active-color="primary" indicator-color="primary">
      <q-tab v-if="isAdmin" name="branding" label="Branding" icon="palette" />
      <q-tab name="appearance" label="Appearance" icon="brightness_6" />
      <q-tab v-if="isAdmin" name="users" label="User Management" icon="manage_accounts" />
      <q-tab name="system" label="System" icon="settings" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" animated>
      <!-- Branding Tab -->
      <q-tab-panel v-if="isAdmin" name="branding">
        <div class="q-gutter-md" style="max-width: 500px">
          <q-input v-model="brandForm.companyName" label="Company Name" outlined dense
            :rules="[(v: string) => !!v || 'Required', (v: string) => v.length <= 100 || 'Max 100 characters']" />
          <q-input v-model="brandForm.tagline" label="Tagline" outlined dense
            :rules="[(v: string) => v.length <= 200 || 'Max 200 characters']" />

          <div class="q-mt-md">
            <div class="text-subtitle2 q-mb-sm">Company Logo</div>
            <div v-if="settingsStore.logoUrl" class="q-mb-sm">
              <img :src="logoFullUrl" alt="Company logo" style="max-height: 80px; max-width: 200px" />
            </div>
            <q-file v-model="logoFile" label="Upload Logo" outlined dense accept="image/png,image/jpeg,image/svg+xml"
              :max-file-size="2097152" @rejected="onLogoRejected">
              <template #prepend><q-icon name="attach_file" /></template>
            </q-file>
            <q-btn v-if="logoFile" label="Upload Logo" color="secondary" class="q-mt-sm" :loading="settingsStore.loading"
              @click="onUploadLogo" />
          </div>

          <q-btn label="Save Branding" color="primary" :loading="settingsStore.loading" @click="onSaveBranding" />
        </div>
      </q-tab-panel>

      <!-- Appearance Tab -->
      <q-tab-panel name="appearance">
        <div style="max-width: 400px">
          <div class="text-subtitle1 q-mb-md">Theme</div>
          <q-item>
            <q-item-section avatar>
              <q-icon :name="uiStore.darkMode ? 'light_mode' : 'dark_mode'" size="md" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ uiStore.darkMode ? 'Dark Mode' : 'Light Mode' }}</q-item-label>
              <q-item-label caption>Toggle between dark and light theme</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-toggle :model-value="uiStore.darkMode" @update:model-value="uiStore.toggleDarkMode()" />
            </q-item-section>
          </q-item>
        </div>
      </q-tab-panel>

      <!-- User Management Tab -->
      <q-tab-panel v-if="isAdmin" name="users">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-sm-6">
            <q-input v-model="userSearch" label="Search users" outlined dense clearable debounce="300"
              @update:model-value="onSearchUsers">
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-12 col-sm-3">
            <q-select v-model="userRoleFilter" label="Filter by role" outlined dense clearable
              :options="['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']" @update:model-value="onSearchUsers" />
          </div>
          <div class="col-12 col-sm-3 flex items-center">
            <q-btn label="Add User" color="primary" icon="person_add" @click="openCreateDialog" />
          </div>
        </div>

        <q-table :rows="userStore.users" :columns="userColumns" row-key="_id" :loading="userStore.loading" flat bordered>
          <template #body-cell-role="props">
            <q-td :props="props">
              <q-badge :color="getRoleBadgeColor(props.row.role)" :label="props.row.role" />
            </q-td>
          </template>
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'negative'" :label="props.row.isActive ? 'Active' : 'Inactive'" />
            </q-td>
          </template>
          <template #body-cell-lastLogin="props">
            <q-td :props="props">
              {{ props.row.lastLogin ? new Date(props.row.lastLogin).toLocaleString() : 'Never' }}
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense icon="edit" color="primary" @click="openEditDialog(props.row)" />
              <q-btn flat dense icon="delete" color="negative" :disable="props.row._id === currentUserId"
                @click="openDeleteDialog(props.row)" />
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- System Tab -->
      <q-tab-panel name="system">
        <div style="max-width: 500px">
          <div class="text-subtitle1 q-mb-md">Data Management</div>

          <!-- PUSH: Offline Data to Cloud -->
          <q-card
            flat
            bordered
            class="q-mb-md"
            :style="{ borderLeft: '4px solid ' + (syncStore.hasFailedChanges ? '#f44336' : syncStore.hasPendingChanges ? '#ff9800' : '#4caf50') }"
          >
            <q-card-section>
              <div class="row items-center q-mb-sm">
                <div class="text-subtitle2 col">Push Offline Data to Cloud</div>
                <q-badge
                  v-if="syncStore.pendingCount + syncStore.failedCount > 0"
                  :color="syncStore.hasFailedChanges ? 'negative' : 'orange'"
                  :label="`${syncStore.pendingCount + syncStore.failedCount} item${syncStore.pendingCount + syncStore.failedCount !== 1 ? 's' : ''}`"
                />
                <q-badge
                  v-else
                  color="green"
                  label="All synced"
                  outline
                />
              </div>
              <div class="text-caption text-grey q-mb-sm">
                Uploads all transactions done while offline (sales, customers, products, expenses, etc.) to the cloud server.
                Tap this after reconnecting to the internet to make sure your changes are backed up.
              </div>

              <div v-if="syncStore.hasPendingChanges || syncStore.hasFailedChanges" class="q-mb-sm">
                <template v-if="syncStore.pendingCount > 0">
                  <q-chip size="xs" color="orange" text-color="white" class="q-mr-xs">
                    {{ syncStore.pendingCount }} pending
                  </q-chip>
                </template>
                <template v-if="syncStore.failedCount > 0">
                  <q-chip size="xs" color="negative" text-color="white" class="q-mr-xs">
                    {{ syncStore.failedCount }} failed
                  </q-chip>
                </template>
                <span v-if="lastPushSync" class="text-caption text-grey q-ml-xs">
                  Last pushed: {{ lastPushSync }}
                </span>
              </div>

              <div class="row q-gutter-sm items-center q-mb-sm">
                <q-btn
                  label="Sync to Cloud now"
                  :color="syncStore.hasFailedChanges ? 'negative' : 'orange'"
                  icon="cloud_upload"
                  :loading="pushingCloud"
                  :disable="syncStore.isSyncing || !syncStore.isOnline"
                  unelevated
                  @click="triggerCloudPush"
                />
                <q-btn
                  v-if="syncStore.failedCount > 0"
                  label="Retry failed"
                  color="warning"
                  icon="refresh"
                  outline
                  dense
                  :loading="pushingCloud"
                  @click="triggerCloudPush(true)"
                />
                <q-btn
                  v-if="syncStore.pendingCount + syncStore.failedCount > 0"
                  label="Clear queue"
                  color="grey"
                  icon="delete_sweep"
                  outline
                  dense
                  @click="clearSyncQueue"
                />
              </div>

              <div v-if="!syncStore.isOnline" class="text-caption text-warning q-mb-sm">
                ⚠ You are currently offline — sync will be available when internet returns.
              </div>

              <div v-if="pushResultSummary" class="text-caption" :class="pushResultOk ? 'text-positive' : 'text-warning'">
                {{ pushResultSummary }}
              </div>
            </q-card-section>
          </q-card>

          <!-- PULL: Cloud Data to Local (existing) -->
          <q-card flat bordered class="q-mb-md" style="border-left: 4px solid #0984e3">
            <q-card-section>
              <div class="text-subtitle2">Pull latest data from Cloud</div>
              <div class="text-caption text-grey q-mb-sm">Downloads all records (customers, products, sales, payments, etc.) from the cloud server and saves them to your local offline database. Use this BEFORE going offline for long periods (days/weeks).</div>
              <div class="row q-gutter-sm items-center q-mb-sm">
                <q-btn label="Pull now" color="primary" icon="cloud_download" :loading="pullingCloud" @click="triggerFullPull" />
                <span v-if="lastPullStatus" class="text-caption" :class="lastPullStatusOk ? 'text-positive' : 'text-warning'">
                  {{ lastPullText }}
                </span>
              </div>
              <div v-if="pullResultSummary" class="text-caption">{{ pullResultSummary }}</div>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle2">Refresh All Data</div>
              <div class="text-caption text-grey q-mb-sm">Clears local browser cache and re-fetches all data from the local SQLite backend (offline-safe).</div>
              <q-btn label="Refresh Data" color="primary" icon="refresh" :loading="refreshing" @click="refreshAllData" />
            </q-card-section>
          </q-card>
          <q-card flat bordered class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle2">Clear Local Cache</div>
              <div class="text-caption text-grey q-mb-sm">Removes browser IndexedDB cache (not the local SQLite DB). POS still works offline after reload.</div>
              <q-btn label="Clear Cache" color="orange" icon="delete_sweep" outline @click="clearCache" />
            </q-card-section>
          </q-card>
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle2">Migrate Check Records</div>
              <div class="text-caption text-grey q-mb-sm">Creates check approval records for existing bank payments (BPI, AUB, etc.)</div>
              <q-btn label="Run Migration" color="teal" icon="sync" outline :loading="migrating" @click="migrateChecks" />
              <div v-if="migrateResult" class="text-caption q-mt-sm">{{ migrateResult }}</div>
            </q-card-section>
          </q-card>

          <!-- Stock Repair Tool -->
          <q-card flat bordered class="q-mt-md" v-if="isAdmin">
            <q-card-section>
              <div class="text-subtitle2">Repair Stock from Sales History</div>
              <div class="text-caption text-grey q-mb-sm">
                Scans all completed sales and re-applies missing stock deductions for products that were not updated correctly.
                Run <strong>Dry Run</strong> first to preview changes without writing anything.
              </div>
              <div class="row q-gutter-sm items-center q-mb-sm">
                <q-input
                  v-model="repairAdminPassword"
                  label="Admin Password"
                  type="password"
                  outlined
                  dense
                  style="width: 200px"
                />
              </div>
              <div class="row q-gutter-sm">
                <q-btn
                  label="Dry Run (Preview)"
                  color="primary"
                  icon="preview"
                  outline
                  :loading="repairing"
                  @click="runRepairStock(true)"
                />
                <q-btn
                  label="Apply Repair"
                  color="negative"
                  icon="build"
                  unelevated
                  :loading="repairing"
                  :disable="!repairPreviewDone"
                  @click="runRepairStock(false)"
                >
                  <q-tooltip v-if="!repairPreviewDone">Run Dry Run first to enable</q-tooltip>
                </q-btn>
              </div>

              <!-- Summary -->
              <div v-if="repairResult" class="q-mt-md">
                <q-banner
                  :class="repairResult.dryRun ? 'bg-blue-1' : 'bg-green-1'"
                  rounded
                  class="q-mb-sm"
                >
                  <template v-slot:avatar>
                    <q-icon :name="repairResult.dryRun ? 'info' : 'check_circle'" :color="repairResult.dryRun ? 'blue' : 'positive'" />
                  </template>
                  <div>
                    <strong>{{ repairResult.dryRun ? 'DRY RUN RESULT' : 'REPAIR COMPLETE' }}</strong>
                    &nbsp;—&nbsp;
                    Sales scanned: <strong>{{ repairResult.salesScanned }}</strong>,
                    Items scanned: <strong>{{ repairResult.itemsScanned }}</strong>,
                    Already OK: <strong>{{ repairResult.itemsAlreadyOk }}</strong>,
                    {{ repairResult.dryRun ? 'Would repair' : 'Repaired' }}: <strong class="text-positive">{{ repairResult.itemsRepaired }}</strong>,
                    Skipped (product not found): <strong class="text-negative">{{ repairResult.itemsSkipped }}</strong>
                  </div>
                </q-banner>

                <!-- Detail table — only show actionable rows -->
                <q-table
                  v-if="repairDetails.length > 0"
                  :rows="repairDetails"
                  :columns="repairColumns"
                  row-key="saleId"
                  flat
                  bordered
                  dense
                  :rows-per-page-options="[10, 20, 50, 0]"
                  style="max-height: 300px"
                  virtual-scroll
                >
                  <template v-slot:body-cell-action="props">
                    <q-td :props="props">
                      <span :class="props.row.action.startsWith('REPAIRED') ? 'text-positive text-bold' : props.row.action.startsWith('SKIPPED') ? 'text-negative' : 'text-blue'">
                        {{ props.row.action }}
                      </span>
                    </q-td>
                  </template>
                </q-table>
                <div v-else class="text-caption text-positive q-mt-xs">All stock deductions are already up to date.</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Create/Edit User Dialog -->
    <q-dialog v-model="userDialogVisible" persistent>
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">{{ editingUser ? 'Edit User' : 'Create User' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-if="!editingUser" v-model="userForm.username" label="Username" outlined dense
            :rules="[(v: string) => /^[a-z0-9]{3,30}$/.test(v) || 'Lowercase letters/numbers, 3-30 chars']" />
          <q-input v-model="userForm.fullName" label="Full Name" outlined dense
            :rules="[(v: string) => v.length >= 2 && v.length <= 100 || '2-100 characters']" />
          <q-input v-model="userForm.password" label="Password" type="password" outlined dense
            :rules="editingUser ? [] : [(v: string) => v.length >= 6 || 'Min 6 characters']"
            :hint="editingUser ? 'Leave empty to keep current password' : ''" />
          <q-select v-model="userForm.role" label="Role" outlined dense
            :options="['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']" />
          <q-toggle v-if="editingUser" v-model="userForm.isActive" label="Active" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="userDialogVisible = false" />
          <q-btn color="primary" :label="editingUser ? 'Update' : 'Create'" :loading="userStore.loading"
            @click="onSaveUser" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Delete User Dialog -->
    <q-dialog v-model="deleteDialogVisible" persistent>
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">Delete User</div>
          <div class="q-mt-sm">Are you sure you want to delete <strong>{{ deletingUser?.username }}</strong>?</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="adminPassword" label="Admin Password" type="password" outlined dense
            :rules="[(v: string) => !!v || 'Required']" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="deleteDialogVisible = false" />
          <q-btn color="negative" label="Delete" :loading="userStore.loading" @click="onDeleteUser" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserManagementStore, type User } from '../stores/userManagementStore';
import { useUiStore } from '../stores/uiStore';
import { useSyncStore } from '../stores/syncStore';

const $q = useQuasar();
const settingsStore = useSettingsStore();
const userStore = useUserManagementStore();
const uiStore = useUiStore();
const syncStore = useSyncStore();

const currentUser = computed(() => {
  try { return JSON.parse(localStorage.getItem('auth_user') || '{}'); }
  catch { return {}; }
});
const isAdmin = computed(() => currentUser.value.role === 'ADMIN');
const currentUserId = computed(() => currentUser.value._id || currentUser.value.userId || '');

const activeTab = ref(isAdmin.value ? 'branding' : 'appearance');

// Branding form
const brandForm = ref({ companyName: '', tagline: '' });
const logoFile = ref<File | null>(null);

const logoFullUrl = computed(() => {
  if (!settingsStore.logoUrl) return '';
  if (settingsStore.logoUrl.startsWith('http')) return settingsStore.logoUrl;
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return base + settingsStore.logoUrl;
});

// User management
const userSearch = ref('');
const userRoleFilter = ref<string | null>(null);
const userDialogVisible = ref(false);
const deleteDialogVisible = ref(false);
const editingUser = ref<User | null>(null);
const deletingUser = ref<User | null>(null);
const adminPassword = ref('');
const userForm = ref({ username: '', fullName: '', password: '', role: 'CASHIER', isActive: true });

const userColumns = [
  { name: 'username', label: 'Username', field: 'username', align: 'left' as const, sortable: true },
  { name: 'fullName', label: 'Full Name', field: 'fullName', align: 'left' as const, sortable: true },
  { name: 'role', label: 'Role', field: 'role', align: 'left' as const, sortable: true },
  { name: 'isActive', label: 'Status', field: 'isActive', align: 'center' as const },
  { name: 'lastLogin', label: 'Last Login', field: 'lastLogin', align: 'left' as const },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const },
];

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'ADMIN': return 'negative';
    case 'MANAGER': return 'primary';
    case 'CASHIER': return 'secondary';
    default: return 'grey';
  }
}

async function onSaveBranding() {
  try {
    await settingsStore.updateBranding({ companyName: brandForm.value.companyName, tagline: brandForm.value.tagline });
    $q.notify({ type: 'positive', message: 'Branding saved successfully' });
  } catch { $q.notify({ type: 'negative', message: 'Failed to save branding' }); }
}

async function onUploadLogo() {
  if (!logoFile.value) return;
  try {
    await settingsStore.uploadLogo(logoFile.value);
    logoFile.value = null;
    $q.notify({ type: 'positive', message: 'Logo uploaded successfully' });
  } catch { $q.notify({ type: 'negative', message: 'Failed to upload logo' }); }
}

function onLogoRejected() {
  $q.notify({ type: 'negative', message: 'Logo must be PNG, JPEG, or SVG and under 2 MB' });
}

function onSearchUsers() {
  userStore.fetchUsers(userSearch.value || undefined, userRoleFilter.value || undefined);
}

function openCreateDialog() {
  editingUser.value = null;
  userForm.value = { username: '', fullName: '', password: '', role: 'CASHIER', isActive: true };
  userDialogVisible.value = true;
}

function openEditDialog(user: User) {
  editingUser.value = user;
  userForm.value = { username: user.username, fullName: user.fullName, password: '', role: user.role, isActive: user.isActive };
  userDialogVisible.value = true;
}

function openDeleteDialog(user: User) {
  deletingUser.value = user;
  adminPassword.value = '';
  deleteDialogVisible.value = true;
}

async function onSaveUser() {
  try {
    if (editingUser.value) {
      const data: Record<string, unknown> = { fullName: userForm.value.fullName, role: userForm.value.role, isActive: userForm.value.isActive };
      if (userForm.value.password) data.password = userForm.value.password;
      await userStore.updateUser(editingUser.value._id, data as { fullName?: string; role?: string; isActive?: boolean; password?: string });
      $q.notify({ type: 'positive', message: 'User updated' });
    } else {
      await userStore.createUser({ username: userForm.value.username, fullName: userForm.value.fullName, password: userForm.value.password, role: userForm.value.role });
      $q.notify({ type: 'positive', message: 'User created' });
    }
    userDialogVisible.value = false;
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Operation failed';
    $q.notify({ type: 'negative', message: msg });
  }
}

async function onDeleteUser() {
  if (!deletingUser.value) return;
  try {
    await userStore.deleteUser(deletingUser.value._id, adminPassword.value);
    deleteDialogVisible.value = false;
    $q.notify({ type: 'positive', message: 'User deleted' });
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Delete failed';
    $q.notify({ type: 'negative', message: msg });
  }
}

// System tab
const refreshing = ref(false);
const migrating = ref(false);
const migrateResult = ref('');
const API_URL = import.meta.env.VITE_API_URL || '';

// Cloud PUSH (local offline data to cloud)
const pushingCloud = ref(false);
const pushResultSummary = ref('');
const pushResultOk = ref(false);
const lastPushSync = ref('');

watch(
  () => syncStore.lastSyncTime,
  (t) => { if (t) lastPushSync.value = new Date(t).toLocaleString(); },
  { immediate: true }
);

async function triggerCloudPush(withRetry = false) {
  if (!syncStore.isOnline) {
    $q.notify({ type: 'warning', message: 'No internet connection — connect first, then try again.', icon: 'wifi_off', timeout: 4000, textColor: 'dark' });
    return;
  }
  pushingCloud.value = true;
  pushResultSummary.value = '';
  pushResultOk.value = false;
  try {
    let initialPending = syncStore.pendingCount + syncStore.failedCount;
    if (withRetry || syncStore.failedCount > 0) {
      await syncStore.retryFailed();
      initialPending = syncStore.pendingCount + syncStore.failedCount;
    }
    if (initialPending === 0) {
      pushResultSummary.value = 'No offline changes to sync — everything is already backed up ✓';
      pushResultOk.value = true;
      $q.notify({ type: 'info', message: pushResultSummary.value, icon: 'cloud_done', timeout: 2500 });
      return;
    }
    const synced = await syncStore.pushOfflineToCloud(false);
    const remaining = syncStore.pendingCount + syncStore.failedCount;
    pushResultOk.value = remaining === 0;
    if (synced > 0 && remaining === 0) {
      pushResultSummary.value = `Synced ${synced} item${synced > 1 ? 's' : ''} to cloud successfully ✓ All offline data is backed up.`;
      $q.notify({ type: 'positive', message: pushResultSummary.value, icon: 'cloud_done', timeout: 5000 });
    } else if (synced > 0) {
      pushResultSummary.value = `Synced ${synced} item${synced > 1 ? 's' : ''} — ${remaining} still waiting. Tap "Retry failed" or try again.`;
      $q.notify({ type: 'warning', message: pushResultSummary.value, icon: 'sync_problem', timeout: 5000, textColor: 'dark' });
    } else {
      pushResultSummary.value = `Could not sync ${initialPending} item${initialPending > 1 ? 's' : ''}. Check internet and retry.`;
      $q.notify({ type: 'warning', message: pushResultSummary.value, icon: 'error_outline', timeout: 5000, textColor: 'dark' });
    }
  } catch (e: any) {
    pushResultOk.value = false;
    pushResultSummary.value = 'Sync error: ' + (e?.message || 'Unknown error');
    $q.notify({ type: 'negative', message: pushResultSummary.value, timeout: 5000 });
  } finally {
    pushingCloud.value = false;
  }
}

async function clearSyncQueue() {
  $q.dialog({
    title: 'Clear Offline Sync Queue',
    message: 'This will permanently delete ALL unsynced offline changes that are waiting to be uploaded. This data will NEVER reach the cloud. Continue?',
    cancel: true,
    persistent: true,
    ok: { label: 'Delete All', color: 'negative' },
  }).onOk(async () => {
    try {
      const { db } = await import('../db/database');
      await db.syncQueue.clear();
      await syncStore.updateCounts();
      $q.notify({ type: 'info', message: 'Offline sync queue cleared', timeout: 2500 });
    } catch (e: any) {
      $q.notify({ type: 'negative', message: 'Failed to clear queue: ' + (e.message || 'Unknown error') });
    }
  });
}

// Full Cloud Pull (offline sync)
const pullingCloud = ref(false);
const pullResultSummary = ref('');

function getLastPullStatus(): string {
  return localStorage.getItem('last_full_pull_status') || '';
}
function getLastPullAt(): number {
  return Number(localStorage.getItem('last_full_pull_at') || '0');
}
const lastPullStatus = computed(() => getLastPullStatus());
const lastPullStatusOk = computed(() => getLastPullStatus() === 'OK');
const lastPullText = computed(() => {
  const s = getLastPullStatus();
  const t = getLastPullAt();
  if (!t) return s ? `Last: ${s}` : 'Never pulled yet';
  const d = new Date(t);
  const nice = d.toLocaleString();
  if (s === 'OK') return `Last sync OK · ${nice}`;
  if (s === 'OFFLINE') return `Last attempt: offline · ${nice}`;
  return `Last: ${s || 'Unknown'} · ${nice}`;
});

async function triggerFullPull() {
  pullingCloud.value = true;
  pullResultSummary.value = '';
  try {
    const { runFullPull } = await import('../boot/fullSync');
    const r = await runFullPull(true);
    pullResultSummary.value = r.message;
    if (r.ok) {
      $q.notify({ type: 'positive', message: `Pull complete · ${r.totalApplied?.toLocaleString() || 0} records saved offline`, icon: 'cloud_done', timeout: 6000 });
    } else if (r.stage === 'Connectivity') {
      $q.notify({ type: 'warning', message: r.message, icon: 'wifi_off', timeout: 6000, textColor: 'dark' });
    } else {
      $q.notify({ type: 'warning', message: r.message, icon: 'error_outline', timeout: 6000, textColor: 'dark' });
    }
  } catch (e: any) {
    pullResultSummary.value = 'Failed: ' + (e.message || 'Unknown error');
    $q.notify({ type: 'negative', message: pullResultSummary.value });
  } finally { pullingCloud.value = false; }
}

const refreshAllData = async () => {
  refreshing.value = true;
  try {
    const { db } = await import('../db/database');
    // Clear all IndexedDB tables
    await db.products.clear();
    await db.customers.clear();
    await db.sales.clear();
    await db.payments.clear();
    await db.expenses.clear();
    await db.vendors.clear();
    await db.purchaseOrders.clear();
    await db.deliveries.clear();
    await db.assetAccounts.clear();
    await db.checkRecords.clear();
    await db.uoms.clear();
    await db.syncQueue.where('status').equals('COMPLETED').delete();

    $q.notify({ type: 'positive', message: 'Local cache cleared. Reloading...' });
    setTimeout(() => window.location.reload(), 500);
  } catch (e: any) {
    $q.notify({ type: 'negative', message: 'Failed: ' + (e.message || 'Unknown error') });
  } finally { refreshing.value = false; }
};

const clearCache = async () => {
  $q.dialog({ title: 'Clear Cache', message: 'This will remove all locally stored data. Continue?', cancel: true, persistent: true })
    .onOk(async () => {
      const { db } = await import('../db/database');
      await db.delete();
      $q.notify({ type: 'positive', message: 'Cache cleared. Reloading...' });
      setTimeout(() => window.location.reload(), 500);
    });
};

const migrateChecks = async () => {
  migrating.value = true;
  migrateResult.value = '';
  try {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/check-approvals/migrate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    migrateResult.value = data.message || `Created: ${data.count}`;
    $q.notify({ type: 'positive', message: migrateResult.value });
  } catch (e: any) {
    migrateResult.value = 'Failed: ' + (e.message || 'Unknown error');
    $q.notify({ type: 'negative', message: migrateResult.value });
  } finally { migrating.value = false; }
};

// Stock repair tool
const repairing = ref(false);
const repairAdminPassword = ref('');
const repairResult = ref<any>(null);
const repairPreviewDone = ref(false);

const repairColumns = [
  { name: 'drNumber',    label: 'Sale',        field: 'drNumber',    align: 'left' as const },
  { name: 'productCode', label: 'Code',        field: 'productCode', align: 'left' as const },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
  { name: 'qtyDeducted', label: 'Qty',         field: 'qtyDeducted', align: 'right' as const },
  { name: 'action',      label: 'Action',      field: 'action',      align: 'left' as const },
];

const repairDetails = computed(() =>
  (repairResult.value?.details || []).filter((d: any) => !d.action.startsWith('TAGGED'))
);

const runRepairStock = async (isDryRun: boolean) => {
  if (!repairAdminPassword.value) {
    $q.notify({ type: 'warning', message: 'Admin password is required' });
    return;
  }

  if (!isDryRun) {
    const confirmed = await new Promise<boolean>(resolve => {
      $q.dialog({
        title: 'Apply Stock Repair',
        message: `This will permanently adjust stock for ${repairResult.value?.itemsRepaired ?? 'N/A'} item(s). This cannot be undone automatically. Continue?`,
        cancel: true,
        persistent: true,
        ok: { label: 'Apply', color: 'negative' }
      }).onOk(() => resolve(true)).onCancel(() => resolve(false));
    });
    if (!confirmed) return;
  }

  repairing.value = true;
  repairResult.value = null;
  try {
    const token = localStorage.getItem('auth_token');
    const url = `${API_URL}/api/sales/repair-stock${isDryRun ? '?dryRun=true' : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword: repairAdminPassword.value })
    });

    // Parse response safely — backend may return HTML on error (NGINX/404 page)
    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        data = { error: `Non-JSON response (status ${res.status}): ${text.slice(0, 400)}` };
      }
    } catch (e) {
      data = { error: `Failed to parse response (status ${res.status})` };
    }

    if (!res.ok) {
      const errMsg = data?.error || `Repair failed (status ${res.status})`;
      throw new Error(errMsg);
    }

    repairResult.value = data;
    if (isDryRun) repairPreviewDone.value = true;
    $q.notify({
      type: isDryRun ? 'info' : 'positive',
      message: isDryRun
        ? `Dry run: ${data.itemsRepaired} item(s) would be repaired`
        : `Repair complete: ${data.itemsRepaired} item(s) fixed`
    });
  } catch (e: any) {
    $q.notify({ type: 'negative', message: e.message || 'Repair failed' });
  } finally {
    repairing.value = false;
  }
};

onMounted(async () => {
  brandForm.value.companyName = settingsStore.companyName;
  brandForm.value.tagline = settingsStore.tagline;
  // Update sync counts on page load so the settings card shows accurate numbers after refresh
  await syncStore.updateCounts();
  if (isAdmin.value) {
    await userStore.fetchUsers();
  }
});
</script>

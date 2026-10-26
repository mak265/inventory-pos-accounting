<template>
  <q-layout view="hHh LpR fFf">
    <!-- Top Header Bar -->
    <q-header class="myob-header" :elevated="false">
      <q-toolbar>
        <q-btn flat dense round icon="menu" color="grey-7" @click="toggleLeftDrawer" />

        <q-space />

        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-btn flat dense round :icon="uiStore.darkMode ? 'light_mode' : 'dark_mode'" color="grey-7" @click="uiStore.toggleDarkMode()" />
          <q-btn flat dense round icon="fullscreen" color="grey-7" @click="goFullscreen"><q-tooltip>Fullscreen</q-tooltip></q-btn>

          <SyncStatus />

          <q-separator vertical inset class="q-mx-xs" style="height: 24px" />

          <!-- User avatar menu -->
          <q-btn flat dense round class="q-ml-xs">
            <q-avatar size="32px" color="deep-purple-2" text-color="deep-purple-9" style="font-size: 13px; font-weight: 600">
              {{ userInitials }}
            </q-avatar>
            <q-menu anchor="bottom right" self="top right" :offset="[0, 8]">
              <q-list style="min-width: 200px">
                <q-item>
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{ currentUser?.fullName || currentUser?.username || 'User' }}</q-item-label>
                    <q-item-label caption>
                      <q-badge :color="roleColor" :label="currentUser?.role || 'User'" class="q-mt-xs" />
                    </q-item-label>
                  </q-item-section>
                </q-item>
                <q-separator />
                <q-item clickable v-close-popup @click="$router.push({ name: 'settings' })">
                  <q-item-section avatar><q-icon name="settings" size="20px" /></q-item-section>
                  <q-item-section>Settings</q-item-section>
                </q-item>
                <q-item clickable v-close-popup @click="onLogout">
                  <q-item-section avatar><q-icon name="logout" size="20px" color="negative" /></q-item-section>
                  <q-item-section class="text-negative">Logout</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <!-- Sidebar -->
    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      :width="240"
      :breakpoint="1024"
      class="myob-sidebar"
    >
      <q-scroll-area class="fit">
        <!-- Brand -->
        <div class="sidebar-brand">
          <div class="brand-icon">
            <q-icon v-if="!settingsStore.logoUrl" name="storefront" />
            <img v-else :src="logoFullUrl" alt="Logo" style="height: 24px" />
          </div>
          <div>
            <div class="brand-text">{{ settingsStore.companyName || 'Aberin' }}</div>
            <div class="brand-sub">Inventory &amp; POS</div>
          </div>
        </div>

        <!-- Navigation -->
        <template v-if="filteredMainLinks.length">
          <div class="sidebar-section-label">Main</div>
          <NavItem v-for="link in filteredMainLinks" :key="link.link" v-bind="link" />
        </template>

        <template v-if="filteredPurchasingLinks.length">
          <div class="sidebar-section-label">Purchasing</div>
          <NavItem v-for="link in filteredPurchasingLinks" :key="link.link" v-bind="link" />
        </template>

        <template v-if="filteredSalesLinks.length">
          <div class="sidebar-section-label">Sales</div>
          <NavItem v-for="link in filteredSalesLinks" :key="link.link" v-bind="link" />
        </template>

        <template v-if="filteredReportLinks.length">
          <div class="sidebar-section-label">Reports</div>
          <NavItem v-for="link in filteredReportLinks" :key="link.link" v-bind="link" />
        </template>

        <template v-if="filteredSystemLinks.length">
          <div class="sidebar-section-label">System</div>
          <NavItem v-for="link in filteredSystemLinks" :key="link.link" v-bind="link" />
        </template>
      </q-scroll-area>
    </q-drawer>

    <q-page-container class="myob-content">
      <router-view />
    </q-page-container>
    <ConfirmDialog
      ref="confirmRef"
      :model-value="uiStore.confirmDialogVisible"
      @update:model-value="(v) => uiStore.confirmDialogVisible = v"
      :title="uiStore.confirmDialog?.title"
      :message="uiStore.confirmDialog?.message"
      :confirmLabel="uiStore.confirmDialog?.confirmLabel"
      :confirmColor="uiStore.confirmDialog?.confirmColor"
      :requiresAdminPassword="uiStore.confirmDialog?.requiresAdminPassword"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import NavItem from 'components/EssentialLink.vue';
import SyncStatus from 'components/SyncStatus.vue';
import ConfirmDialog from 'components/ConfirmDialog.vue';
import { useSettingsStore } from '../stores/settingsStore';
import { useUiStore } from '../stores/uiStore';
import { hasPermission } from '../router/permissions';

interface AuthUser {
  username?: string;
  fullName?: string;
  role?: string;
}

const router = useRouter();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const linkToRouteName: Record<string, string> = {
  '/': 'dashboard',
  '/products': 'products',
  '/uoms': 'uoms',
  '/customers': 'customers',
  '/vendors': 'vendors',
  '/purchase-orders': 'purchase-orders',
  '/deliveries': 'deliveries',
  '/sales/new': 'sale-create',
  '/sales': 'sales',
  '/sales/journal': 'sales-journal',
  '/expenses': 'expenses',
  '/check-approvals': 'check-approvals',
  '/reports': 'reports',
  '/settings': 'settings',
};

const mainLinks = [
  { title: 'Dashboard', icon: 'dashboard', link: '/' },
  { title: 'Products', icon: 'inventory_2', link: '/products' },
  { title: 'Units of Measure', icon: 'straighten', link: '/uoms' },
  { title: 'Customers', icon: 'people', link: '/customers' },
];

const purchasingLinks = [
  { title: 'Vendors', icon: 'store', link: '/vendors' },
  { title: 'Purchase Orders', icon: 'shopping_cart', link: '/purchase-orders' },
  { title: 'Deliveries', icon: 'local_shipping', link: '/deliveries' },
];

const salesLinks = [
  { title: 'Point of Sale', icon: 'point_of_sale', link: '/sales/new' },
  { title: 'Sales History', icon: 'receipt_long', link: '/sales' },
  { title: 'Sales Journal', icon: 'menu_book', link: '/sales/journal' },
  { title: 'Expenses', icon: 'money_off', link: '/expenses' },
  { title: 'Check Approvals', icon: 'fact_check', link: '/check-approvals' },
];

const reportLinks = [
  { title: 'Reports', icon: 'assessment', link: '/reports' },
];

const systemLinks = [
  { title: 'Settings', icon: 'settings', link: '/settings' },
];

const leftDrawerOpen = ref(false);
const confirmRef = ref<any>(null);

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}

const currentUser = computed<AuthUser | null>(() => {
  try {
    const raw = localStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
});

const userRole = computed(() => currentUser.value?.role || '');

const userInitials = computed(() => {
  const name = currentUser.value?.fullName || currentUser.value?.username || 'U';
  return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
});

function filterLinksByPermission(links: typeof mainLinks) {
  return links.filter((link) => {
    const routeName = linkToRouteName[link.link];
    if (!routeName) return true;
    return hasPermission(routeName, userRole.value);
  });
}

const filteredMainLinks = computed(() => filterLinksByPermission(mainLinks));
const filteredPurchasingLinks = computed(() => filterLinksByPermission(purchasingLinks));
const filteredSalesLinks = computed(() => filterLinksByPermission(salesLinks));
const filteredReportLinks = computed(() => filterLinksByPermission(reportLinks));
const filteredSystemLinks = computed(() => filterLinksByPermission(systemLinks));

const logoFullUrl = computed(() => {
  if (!settingsStore.logoUrl) return '';
  if (settingsStore.logoUrl.startsWith('http')) return settingsStore.logoUrl;
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return base + settingsStore.logoUrl;
});

const roleColor = computed(() => {
  switch (currentUser.value?.role) {
    case 'ADMIN': return 'deep-purple';
    case 'MANAGER': return 'primary';
    case 'CASHIER': return 'teal';
    default: return 'grey';
  }
});

function onLogout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  router.push({ name: 'login' });
}

// Auto-enter fullscreen when app loads (hides address bar)
const goFullscreen = () => {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
};

onMounted(() => {
  // Request fullscreen on first user interaction (browsers require user gesture)
  const requestFS = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    document.removeEventListener('click', requestFS);
  };
  // Only if not already in standalone/fullscreen mode
  if (!window.matchMedia('(display-mode: standalone)').matches && !document.fullscreenElement) {
    document.addEventListener('click', requestFS, { once: true });
  }
});

/** Confirm dialog handlers wired to `uiStore` */
const handleConfirm = async (adminPassword?: string) => {
  try {
    const cb = uiStore.confirmDialog?.onConfirm;
    if (!cb) {
      uiStore.hideConfirmDialog();
      return;
    }

    const result = cb(adminPassword);
    if (result && typeof (result as Promise<any>).then === 'function') {
      await result;
    }
    uiStore.hideConfirmDialog();
  } catch (err: any) {
    // If parent callback threw (e.g., invalid admin password), show error on dialog
    confirmRef.value?.setPasswordError?.(err?.message || 'Operation failed');
  } finally {
    confirmRef.value?.stopLoading?.();
  }
};

const handleCancel = () => {
  uiStore.hideConfirmDialog();
};
</script>

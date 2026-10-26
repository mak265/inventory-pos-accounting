<template>
  <q-page class="responsive-padding">
    <!-- Offline Sync Banner - visible when there are pending/failed items, even after refresh -->
    <q-banner
      v-if="syncStore.hasPendingChanges || syncStore.hasFailedChanges"
      :class="syncStore.hasFailedChanges ? 'bg-negative-1' : 'bg-orange-1'"
      rounded
      class="q-mb-md"
      inline-actions
    >
      <template #avatar>
        <q-spinner-dots
          v-if="syncStore.isSyncing"
          :color="syncStore.hasFailedChanges ? 'negative' : 'orange'"
          size="sm"
        />
        <q-icon
          v-else
          :name="syncStore.hasFailedChanges ? 'error_outline' : 'cloud_upload'"
          :color="syncStore.hasFailedChanges ? 'negative' : 'orange'"
          size="28px"
        />
      </template>

      <div class="text-weight-medium" :class="syncStore.hasFailedChanges ? 'text-negative-9' : 'text-orange-10'">
        <template v-if="syncStore.isSyncing">
          Syncing {{ syncStore.pendingCount }} offline change{{ syncStore.pendingCount !== 1 ? 's' : '' }} to cloud…
        </template>
        <template v-else-if="syncStore.hasFailedChanges">
          {{ syncStore.failedCount }} offline change{{ syncStore.failedCount !== 1 ? 's' : '' }} failed to sync.
        </template>
        <template v-else>
          {{ syncStore.pendingCount }} offline change{{ syncStore.pendingCount !== 1 ? 's' : '' }} waiting to be uploaded to cloud.
        </template>
      </div>
      <div
        v-if="syncStore.lastSyncTime && !syncStore.isSyncing"
        class="text-caption q-mt-xs"
        :class="syncStore.hasFailedChanges ? 'text-negative-8' : 'text-orange-9'"
      >
        Last successful sync: {{ formatDateTime(syncStore.lastSyncTime) }}
      </div>

      <template #action>
        <div class="row q-gutter-sm items-center">
          <q-btn
            v-if="syncStore.hasFailedChanges && !syncStore.isSyncing"
            flat dense color="negative"
            label="Retry"
            icon="refresh"
            @click="retryThenSync"
          />
          <q-btn
            :loading="syncStore.isSyncing"
            :disable="!syncStore.isOnline || syncStore.isSyncing"
            :color="syncStore.hasFailedChanges ? 'negative' : 'orange'"
            unelevated
            dense
            no-caps
            :label="syncStore.isSyncing ? 'Syncing…' : 'Sync Now'"
            :icon="syncStore.isSyncing ? 'sync' : 'cloud_upload'"
            @click="syncOfflineToCloud"
          />
        </div>
      </template>
    </q-banner>

    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Welcome back, {{ userName }}. Here's your business overview.</p>
      </div>
      <div class="row items-center q-gutter-sm no-wrap">
        <q-btn
          outline
          dense
          no-caps
          :color="syncStore.hasPendingChanges || syncStore.hasFailedChanges ? 'orange' : 'grey-7'"
          :icon="syncStore.isSyncing ? 'sync' : (syncStore.hasPendingChanges || syncStore.hasFailedChanges ? 'cloud_upload' : 'cloud_done')"
          :loading="syncStore.isSyncing"
          :disable="syncStore.isSyncing || !syncStore.isOnline"
          :label="syncStore.hasPendingChanges || syncStore.hasFailedChanges
            ? `Sync (${syncStore.pendingCount + syncStore.failedCount})`
            : 'Synced'"
          @click="syncOfflineToCloud"
        >
          <q-tooltip>
            <span v-if="!syncStore.isOnline">Offline - cannot sync</span>
            <span v-else-if="syncStore.hasPendingChanges || syncStore.hasFailedChanges">Push offline data to cloud server</span>
            <span v-else>All data is synced ✓</span>
          </q-tooltip>
        </q-btn>
        <q-btn color="deep-purple" icon="point_of_sale" label="New Sale" unelevated no-caps @click="$router.push('/sales/new')" style="font-weight: 600" />
      </div>
    </div>

    <!-- Date Filter Bar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn-toggle v-model="activePreset" no-caps unelevated rounded toggle-color="deep-purple" text-color="grey-8" size="sm"
        :options="[
          { label: 'Today', value: 'today' },
          { label: 'This Week', value: 'week' },
          { label: 'This Month', value: 'month' },
          { label: 'This Year', value: 'year' },
          { label: 'Custom', value: 'custom' }
        ]"
        @update:model-value="onPresetChange"
      />
      <template v-if="activePreset === 'custom'">
        <q-input v-model="customStart" type="date" outlined dense style="max-width: 160px" />
        <q-input v-model="customEnd" type="date" outlined dense style="max-width: 160px" />
        <q-btn icon="search" color="deep-purple" unelevated dense round @click="loadDashboard" />
      </template>
      <q-space />
      <q-btn flat dense icon="refresh" color="grey-7" @click="loadDashboard" :loading="loading">
        <q-tooltip>Refresh</q-tooltip>
      </q-btn>
    </div>

    <div v-if="loading" class="text-center q-pa-xl">
      <q-spinner-dots size="40px" color="primary" />
      <div class="q-mt-sm text-grey">Loading dashboard...</div>
    </div>

    <template v-else>
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-sm-6 col-md-3">
          <div class="stat-card">
            <div class="stat-icon green"><q-icon name="payments" size="24px" /></div>
            <div class="stat-content">
              <div class="stat-label">Today's Revenue</div>
              <div class="stat-value">{{ formatCurrency(data.revenue.today) }}</div>
              <div class="stat-sub">{{ data.sales.todayCount }} transaction{{ data.sales.todayCount !== 1 ? 's' : '' }}</div>
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <div class="stat-card">
            <div class="stat-icon purple"><q-icon name="trending_up" size="24px" /></div>
            <div class="stat-content">
              <div class="stat-label">{{ rangeLabel }} Revenue</div>
              <div class="stat-value">{{ formatCurrency(data.revenue.thisRange) }}</div>
              <div class="stat-sub" :class="data.revenue.changePercent >= 0 ? 'text-positive' : 'text-negative'">
                <q-icon :name="data.revenue.changePercent >= 0 ? 'arrow_upward' : 'arrow_downward'" size="14px" />
                {{ Math.abs(data.revenue.changePercent) }}% vs prev period
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <div class="stat-card">
            <div class="stat-icon orange"><q-icon name="account_balance_wallet" size="24px" /></div>
            <div class="stat-content">
              <div class="stat-label">Receivables</div>
              <div class="stat-value">{{ formatCurrency(data.receivable) }}</div>
              <div class="stat-sub">Outstanding balance</div>
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <div class="stat-card">
            <div class="stat-icon blue"><q-icon name="savings" size="24px" /></div>
            <div class="stat-content">
              <div class="stat-label">Net Income ({{ rangeLabel }})</div>
              <div class="stat-value" :class="(data.financials?.netIncome || 0) >= 0 ? 'text-positive' : 'text-negative'">{{ formatCurrency(data.financials?.netIncome || 0) }}</div>
              <div class="stat-sub">Revenue - Cost - Expenses</div>
            </div>
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-6 col-sm-3">
          <div class="mini-stat"><q-icon name="inventory_2" color="teal" size="20px" /><span>{{ data.counts.products }} Products</span></div>
        </div>
        <div class="col-6 col-sm-3">
          <div class="mini-stat"><q-icon name="category" color="indigo" size="20px" /><span>{{ (data.counts.totalItems || 0).toLocaleString() }} Total Items</span></div>
        </div>
        <div class="col-6 col-sm-3">
          <div class="mini-stat"><q-icon name="warehouse" color="brown" size="20px" /><span>{{ formatCurrency(data.inventory?.inventoryValue || 0) }} Inventory</span></div>
        </div>
        <div class="col-6 col-sm-3">
          <div class="mini-stat"><q-icon name="people" color="blue" size="20px" /><span>{{ data.counts.customers }} Customers</span></div>
        </div>
      </div>

      <!-- Financial Summary -->
      <div class="row q-col-gutter-md q-mb-lg" v-if="data.financials">
        <div class="col-12">
          <q-card flat bordered class="dashboard-card">
            <q-card-section>
              <div class="text-weight-medium" style="font-size: 1rem">Financial Summary ({{ rangeLabel }})</div>
            </q-card-section>
            <q-card-section class="q-pt-none">
              <div class="row q-col-gutter-md">
                <div class="col-6 col-md-2"><div class="text-caption">Gross Revenue</div><div class="text-h6 text-positive">{{ formatCurrency(data.financials.grossRevenue) }}</div></div>
                <div class="col-6 col-md-2"><div class="text-caption">Cost of Goods</div><div class="text-h6 text-negative">{{ formatCurrency(data.financials.cogs) }}</div></div>
                <div class="col-6 col-md-2"><div class="text-caption">Gross Profit</div><div class="text-h6 text-info">{{ formatCurrency(data.financials.grossProfit) }}</div></div>
                <div class="col-6 col-md-2"><div class="text-caption">Expenses</div><div class="text-h6 text-orange">{{ formatCurrency(data.financials.expenses) }}</div></div>
                <div class="col-12 col-md-4"><div class="text-caption text-weight-bold">Net Income</div><div class="text-h4" :class="data.financials.netIncome >= 0 ? 'text-positive' : 'text-negative'">{{ formatCurrency(data.financials.netIncome) }}</div></div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-8">
          <q-card flat bordered class="dashboard-card">
            <q-card-section>
              <div class="text-weight-medium" style="font-size: 1rem">Daily Sales ({{ rangeLabel }})</div>
              <div class="text-caption text-grey">Revenue per day</div>
            </q-card-section>
            <q-card-section class="q-pt-none">
              <div class="chart-container">
                <div class="chart-bars">
                  <div v-for="(day, i) in data.dailySales" :key="i" class="chart-bar-wrapper" :title="`${day.date}: ${formatCurrency(day.revenue)} (${day.count} sales)`">
                    <div class="chart-bar" :style="{ height: getBarHeight(day.revenue) + '%' }" :class="{ 'today-bar': isToday(day.date) }"></div>
                    <div class="chart-bar-label" v-if="i % 5 === 0 || isToday(day.date)">{{ getDayNum(day.date) }}</div>
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered class="dashboard-card">
            <q-card-section>
              <div class="text-weight-medium" style="font-size: 1rem">{{ rangeLabel }} Breakdown</div>
              <div class="text-caption text-grey">Financials for selected period</div>
            </q-card-section>
            <q-card-section class="q-pt-none">
              <div class="breakdown-item">
                <div class="breakdown-label"><q-icon name="arrow_upward" color="positive" size="16px" /> Revenue</div>
                <div class="breakdown-value text-positive">{{ formatCurrency(data.revenue.thisRange) }}</div>
              </div>
              <div class="breakdown-item">
                <div class="breakdown-label"><q-icon name="arrow_downward" color="negative" size="16px" /> Expenses</div>
                <div class="breakdown-value text-negative">{{ formatCurrency(data.expenses.thisRange) }}</div>
              </div>
              <q-separator class="q-my-sm" />
              <div class="breakdown-item">
                <div class="breakdown-label"><q-icon name="savings" color="primary" size="16px" /> Net Profit</div>
                <div class="breakdown-value" :class="data.profit.thisRange >= 0 ? 'text-positive' : 'text-negative'">{{ formatCurrency(data.profit.thisRange) }}</div>
              </div>
              <q-separator class="q-my-sm" />
              <div class="breakdown-item">
                <div class="breakdown-label"><q-icon name="receipt_long" color="grey" size="16px" /> Sales Count</div>
                <div class="breakdown-value">{{ data.sales.rangeCount }}</div>
              </div>
              <div class="breakdown-item">
                <div class="breakdown-label"><q-icon name="history" color="grey" size="16px" /> Prev Period</div>
                <div class="breakdown-value">{{ formatCurrency(data.revenue.prevRange) }}</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-6">
          <q-card flat bordered class="dashboard-card">
            <q-card-section>
              <div class="text-weight-medium" style="font-size: 1rem">Top Selling Items</div>
              <div class="text-caption text-grey">{{ rangeLabel }} by revenue</div>
            </q-card-section>
            <q-card-section class="q-pt-none">
              <div v-if="data.topSelling.length === 0" class="text-center text-grey q-pa-md">No sales data yet</div>
              <div v-for="(item, i) in data.topSelling.slice(0, 5)" :key="i" class="top-item">
                <div class="top-item-rank">#{{ i + 1 }}</div>
                <div class="top-item-info">
                  <div class="top-item-name">{{ item.description }}</div>
                  <div class="top-item-qty">{{ item.quantity }} sold</div>
                </div>
                <div class="top-item-revenue">{{ formatCurrency(item.revenue) }}</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-6">
          <q-card flat bordered class="dashboard-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="text-weight-medium" style="font-size: 1rem">Low Stock Alert</div>
                  <div class="text-caption text-grey">Products with 5 or fewer units</div>
                </div>
                <q-icon v-if="data.lowStockProducts.length > 0" name="warning" color="warning" size="24px" />
              </div>
            </q-card-section>
            <q-card-section class="q-pt-none">
              <div v-if="data.lowStockProducts.length === 0" class="text-center text-grey q-pa-md">All products well stocked</div>
              <div v-for="(p, i) in data.lowStockProducts" :key="i" class="low-stock-item">
                <div class="low-stock-info">
                  <div class="low-stock-code">{{ p.code }}</div>
                  <div class="low-stock-desc">{{ p.description }}</div>
                </div>
                <q-badge text-color="black" :color="p.availableStock === 0 ? 'negative' : 'warning'" :label="`${p.availableStock} ${p.uom}`" />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12">
          <q-card flat bordered class="dashboard-card">
            <q-card-section>
              <div class="text-weight-medium" style="font-size: 1rem">Recent Sales</div>
              <div class="text-caption text-grey">Last 5 completed transactions</div>
            </q-card-section>
            <q-card-section class="q-pt-none">
              <div v-if="data.recentSales.length === 0" class="text-center text-grey q-pa-md">No completed sales yet</div>
              <q-list separator v-else>
                <q-item v-for="(sale, i) in data.recentSales" :key="i" clickable @click="$router.push('/sales')">
                  <q-item-section avatar><q-icon name="receipt" color="primary" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ sale.drNumber }}</q-item-label>
                    <q-item-label caption>{{ sale.customerName }} · {{ formatDate(sale.saleDate) }}</q-item-label>
                  </q-item-section>
                  <q-item-section side><span class="text-weight-medium">{{ formatCurrency(sale.totalAmount) }}</span></q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <div class="q-mb-md">
        <div class="text-weight-medium q-mb-sm" style="font-size: 1rem; color: var(--text-primary)">Quick Actions</div>
      </div>
      <div class="row q-col-gutter-md q-mb-lg">
        <!-- Sync Offline Data Quick Action Card - always visible -->
        <div class="col-6 col-sm-4 col-md-3">
          <div
            class="quick-action sync-quick-action"
            :class="{
              'sync-action-pending': syncStore.hasPendingChanges,
              'sync-action-failed': syncStore.hasFailedChanges,
              'sync-action-syncing': syncStore.isSyncing
            }"
            @click="syncOfflineToCloud"
          >
            <div
              class="action-icon"
              :style="{ background: syncStore.hasFailedChanges ? 'rgba(245,67,54,0.1)' : syncStore.hasPendingChanges ? 'rgba(255,152,0,0.15)' : 'rgba(76,175,80,0.1)' }"
            >
              <q-spinner-dots
                v-if="syncStore.isSyncing"
                :color="syncStore.hasFailedChanges ? 'negative' : 'orange'"
                size="24px"
              />
              <q-icon
                v-else
                :name="syncStore.hasFailedChanges ? 'error_outline' : syncStore.hasPendingChanges ? 'cloud_upload' : 'cloud_done'"
                :color="syncStore.hasFailedChanges ? 'negative' : syncStore.hasPendingChanges ? 'orange' : 'green'"
                size="24px"
              />
            </div>
            <div class="action-title">
              {{ syncStore.isSyncing ? 'Syncing…' : syncStore.hasFailedChanges ? 'Retry Sync' : 'Sync Offline Data' }}
            </div>
            <div class="action-desc">
              <template v-if="syncStore.isSyncing">
                Uploading to cloud…
              </template>
              <template v-else-if="syncStore.hasFailedChanges">
                {{ syncStore.failedCount }} failed - tap to retry
              </template>
              <template v-else-if="syncStore.hasPendingChanges">
                {{ syncStore.pendingCount }} change{{ syncStore.pendingCount !== 1 ? 's' : '' }} to upload
              </template>
              <template v-else>
                All data synced ✓
              </template>
            </div>
          </div>
        </div>
        <div v-for="action in quickActions" :key="action.title" class="col-6 col-sm-4 col-md-3">
          <div class="quick-action" @click="$router.push(action.link)">
            <div class="action-icon" :style="{ background: action.bg }">
              <q-icon :name="action.icon" :color="action.color" size="24px" />
            </div>
            <div class="action-title">{{ action.title }}</div>
            <div class="action-desc">{{ action.desc }}</div>
          </div>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { Notify } from 'quasar';
import { useSyncStore } from '../stores/syncStore';

const syncStore = useSyncStore();

const API_URL = import.meta.env.VITE_API_URL || '';
const loading = ref(true);
const activePreset = ref('month');
const customStart = ref('');
const customEnd = ref('');

const data = ref({
  counts: { products: 0, customers: 0, purchaseOrders: 0, pendingPOs: 0 },
  revenue: { today: 0, thisRange: 0, prevRange: 0, total: 0, changePercent: 0 },
  sales: { todayCount: 0, rangeCount: 0, totalCount: 0 },
  receivable: 0,
  expenses: { thisRange: 0 },
  profit: { thisRange: 0 },
  lowStockProducts: [] as any[],
  topSelling: [] as any[],
  dailySales: [] as any[],
  recentSales: [] as any[],
});

const userName = computed(() => {
  try {
    const raw = localStorage.getItem('auth_user');
    const user = raw ? JSON.parse(raw) : null;
    return user?.fullName || user?.username || 'there';
  } catch { return 'there'; }
});

const quickActions = [
  { title: 'Point of Sale', desc: 'New transaction', icon: 'point_of_sale', color: 'deep-purple', bg: 'rgba(108,92,231,0.1)', link: '/sales/new' },
  { title: 'Products', desc: 'Manage inventory', icon: 'inventory_2', color: 'teal', bg: 'rgba(0,184,148,0.1)', link: '/products' },
  { title: 'Customers', desc: 'Customer records', icon: 'people', color: 'blue', bg: 'rgba(9,132,227,0.1)', link: '/customers' },
  { title: 'Vendors', desc: 'Manage suppliers', icon: 'store', color: 'orange', bg: 'rgba(253,203,110,0.15)', link: '/vendors' },
  { title: 'Purchase Orders', desc: 'Manage POs', icon: 'shopping_cart', color: 'deep-purple', bg: 'rgba(108,92,231,0.1)', link: '/purchase-orders' },
  { title: 'Deliveries', desc: 'Track deliveries', icon: 'local_shipping', color: 'blue-grey', bg: 'rgba(96,125,139,0.1)', link: '/deliveries' },
  { title: 'Sales History', desc: 'Past transactions', icon: 'receipt_long', color: 'indigo', bg: 'rgba(63,81,181,0.1)', link: '/sales' },
  { title: 'Reports', desc: 'Analytics', icon: 'assessment', color: 'green', bg: 'rgba(0,184,148,0.1)', link: '/reports' },
];

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
const formatDate = (date: string) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const maxDailyRevenue = computed(() => Math.max(...data.value.dailySales.map((d: any) => d.revenue), 1));
const getBarHeight = (revenue: number) => Math.max((revenue / maxDailyRevenue.value) * 100, 2);
const getDayNum = (date: string) => new Date(date).getDate().toString();
const isToday = (date: string) => date === new Date().toISOString().split('T')[0];

const rangeLabel = computed(() => {
  const labels: Record<string, string> = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', custom: 'Custom Range' };
  return labels[activePreset.value] || 'This Month';
});

const getDateRange = () => {
  const now = new Date();
  switch (activePreset.value) {
    case 'today': {
      const d = now.toISOString().split('T')[0];
      return { startDate: d, endDate: d };
    }
    case 'week': {
      const day = now.getDay();
      const start = new Date(now); start.setDate(now.getDate() - day);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
    }
    case 'month': return {};
    case 'year': {
      return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
    }
    case 'custom':
      if (customStart.value && customEnd.value) return { startDate: customStart.value, endDate: customEnd.value };
      return {};
    default: return {};
  }
};

const onPresetChange = () => { if (activePreset.value !== 'custom') loadDashboard(); };

const formatDateTime = (d: Date | string) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const syncOfflineToCloud = async () => {
  if (!syncStore.isOnline) {
    Notify.create({ type: 'warning', message: 'No internet connection. Try again when online.', icon: 'wifi_off', position: 'top-right', timeout: 3000 });
    return;
  }
  const total = syncStore.pendingCount + syncStore.failedCount;
  if (total === 0) {
    Notify.create({ type: 'info', message: 'No offline changes to sync — all data is up to date ✓', icon: 'cloud_done', position: 'top-right', timeout: 2000 });
    return;
  }
  try {
    if (syncStore.failedCount > 0) {
      await syncStore.retryFailed();
    }
    const synced = await syncStore.pushOfflineToCloud(true);
    if (synced > 0) {
      Notify.create({ type: 'positive', message: `Successfully synced ${synced} offline change${synced > 1 ? 's' : ''} to cloud ✓`, icon: 'cloud_done', position: 'top-right', timeout: 3000 });
    } else if (syncStore.pendingCount > 0 || syncStore.failedCount > 0) {
      Notify.create({ type: 'warning', message: 'Some items could not be synced. Check your internet and try again.', icon: 'sync_problem', position: 'top-right', timeout: 4000 });
    }
  } catch (e: any) {
    Notify.create({ type: 'negative', message: 'Sync failed: ' + (e?.message || 'Unknown error'), icon: 'error_outline', position: 'top-right', timeout: 4000 });
  }
};

const retryThenSync = async () => {
  try {
    await syncStore.retryFailed();
    await syncOfflineToCloud();
  } catch (e) {
    Notify.create({ type: 'negative', message: 'Retry failed: ' + (e as Error).message, position: 'top-right', timeout: 4000 });
  }
};

const loadDashboard = async () => {
  loading.value = true;
  try {
    const token = localStorage.getItem('auth_token');
    const params = getDateRange();
    const res = await axios.get(`${API_URL}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      params
    });
    data.value = res.data;
    // Cache dashboard data for offline use
    localStorage.setItem('cached_dashboard', JSON.stringify(res.data));
  } catch (e) {
    console.error('Dashboard load error:', e);
    // Try cached dashboard data first
    const cached = localStorage.getItem('cached_dashboard');
    if (cached) {
      try { data.value = JSON.parse(cached); } catch { /* ignore */ }
    }
    // Also try loading counts from local stores
    try {
      const [{ useProductStore }, { useSalesStore }, { useCustomerStore }, { usePOStore }] = await Promise.all([
        import('../stores/productStore'), import('../stores/salesStore'),
        import('../stores/customerStore'), import('../stores/poStore')
      ]);
      const ps = useProductStore(), ss = useSalesStore(), cs = useCustomerStore(), po = usePOStore();
      await Promise.allSettled([ps.fetchProducts({ limit: 500 }), ss.fetchSales(), cs.fetchCustomers(), po.fetchPurchaseOrders()]);
      data.value.counts.products = ps.products.length;
      data.value.sales.totalCount = ss.sales.length;
      data.value.counts.customers = cs.customers.length;
      data.value.counts.purchaseOrders = po.purchaseOrders.length;
    } catch { /* silent */ }
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  // Refresh sync counts immediately on page load/refresh
  // so the user sees pending items right after opening the app
  await syncStore.updateCounts();
  loadDashboard();
});
</script>

<style scoped lang="scss">
.dashboard-card { border-radius: 12px; height: 100%; }
.mini-stat { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: white; border-radius: 10px; border: 1px solid #eee; font-size: 0.9rem; font-weight: 500; color: #444; }
.stat-sub { font-size: 0.75rem; color: #888; margin-top: 2px; display: flex; align-items: center; gap: 2px; }
.chart-container { height: 200px; display: flex; align-items: flex-end; }
.chart-bars { display: flex; align-items: flex-end; gap: 2px; width: 100%; height: 100%; }
.chart-bar-wrapper { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; cursor: pointer; }
.chart-bar { width: 100%; max-width: 20px; background: #6c5ce7; border-radius: 3px 3px 0 0; transition: height 0.3s ease; opacity: 0.7; min-height: 2px; }
.chart-bar:hover { opacity: 1; }
.today-bar { background: #00b894; opacity: 1; }
.chart-bar-label { font-size: 0.6rem; color: #999; margin-top: 4px; }
.breakdown-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
.breakdown-label { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #666; }
.breakdown-value { font-weight: 600; font-size: 0.9rem; }
.top-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.top-item:last-child { border-bottom: none; }
.top-item-rank { font-weight: 700; color: #6c5ce7; font-size: 0.85rem; min-width: 28px; }
.top-item-info { flex: 1; }
.top-item-name { font-weight: 500; font-size: 0.9rem; }
.top-item-qty { font-size: 0.75rem; color: #999; }
.top-item-revenue { font-weight: 600; color: #333; }
.low-stock-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
.low-stock-item:last-child { border-bottom: none; }
.low-stock-code { font-weight: 600; font-size: 0.85rem; }
.low-stock-desc { font-size: 0.75rem; color: #888; }

.sync-quick-action {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}
.sync-quick-action.sync-action-pending {
  border: 2px solid rgba(255, 152, 0, 0.4);
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.05) 0%, transparent 60%);
  animation: syncCardPulse 2s ease-in-out infinite;
}
.sync-quick-action.sync-action-failed {
  border: 2px solid rgba(245, 67, 54, 0.4);
  background: linear-gradient(135deg, rgba(245, 67, 54, 0.05) 0%, transparent 60%);
  animation: syncCardPulse 1.2s ease-in-out infinite;
}
.sync-quick-action.sync-action-syncing {
  opacity: 0.75;
  border: 2px solid rgba(108, 92, 231, 0.35);
}
@keyframes syncCardPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }
  50% { box-shadow: 0 0 0 6px rgba(255, 152, 0, 0.08); }
}
.sync-quick-action.sync-action-failed {
  animation-name: syncCardPulseFail;
}
@keyframes syncCardPulseFail {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 67, 54, 0); }
  50% { box-shadow: 0 0 0 6px rgba(245, 67, 54, 0.08); }
}
</style>

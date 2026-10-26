import { RouteRecordRaw } from 'vue-router'
import { defineAsyncComponent, h } from 'vue'

// Wrap page imports with error boundary to catch initialization errors
function asyncPage(loader: () => Promise<any>) {
  return defineAsyncComponent({
    loader,
    errorComponent: {
      setup(props: any) {
        return () => h('div', { class: 'q-pa-xl text-center' }, [
          h('div', { class: 'text-h6 text-negative q-mb-md' }, 'Page failed to load'),
          h('div', { class: 'text-body2 text-grey q-mb-md' }, props?.error?.message || 'Unknown error'),
          h('button', {
            class: 'q-btn q-btn--unelevated q-btn--rectangle bg-primary text-white',
            onClick: () => window.location.reload()
          }, 'Reload Page')
        ])
      }
    },
    onError(error, retry, fail) {
      console.error('Page load error:', error);
      fail();
    }
  })
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'dashboard', component: asyncPage(() => import('pages/IndexPage.vue')) },
      { path: 'products', name: 'products', component: asyncPage(() => import('pages/ProductList.vue')) },
      { path: 'uoms', name: 'uoms', component: asyncPage(() => import('pages/UOMList.vue')) },
      { path: 'vendors', name: 'vendors', component: asyncPage(() => import('pages/VendorList.vue')) },
      { path: 'purchase-orders', name: 'purchase-orders', component: asyncPage(() => import('pages/POList.vue')) },
      { path: 'purchase-orders/new', name: 'po-create', component: asyncPage(() => import('components/POForm.vue')) },
      { path: 'purchase-orders/:id/edit', name: 'po-edit', component: asyncPage(() => import('components/POForm.vue')) },
      { path: 'deliveries', name: 'deliveries', component: asyncPage(() => import('pages/DeliveryList.vue')) },
      { path: 'deliveries/new', name: 'delivery-create', component: asyncPage(() => import('components/DeliveryReceiptForm.vue')) },
      { path: 'deliveries/:id/edit', name: 'delivery-edit', component: asyncPage(() => import('components/DeliveryReceiptForm.vue')) },
      { path: 'customers', name: 'customers', component: asyncPage(() => import('pages/CustomerList.vue')) },
      { path: 'sales', name: 'sales', component: asyncPage(() => import('pages/SalesList.vue')) },
      { path: 'sales/new', name: 'sale-create', component: asyncPage(() => import('components/SalesTransaction.vue')) },
      { path: 'sales/journal', name: 'sales-journal', component: asyncPage(() => import('pages/SalesJournal.vue')) },
      { path: 'expenses', name: 'expenses', component: asyncPage(() => import('pages/ExpensesList.vue')) },
      { path: 'reports', name: 'reports', component: asyncPage(() => import('pages/ReportsPage.vue')) },
      { path: 'reports/sales-summary', name: 'report-sales-summary', component: asyncPage(() => import('components/SalesSummary.vue')) },
      { path: 'reports/customer-report', name: 'report-customer', component: asyncPage(() => import('components/CustomerReport.vue')) },
      { path: 'reports/top-selling', name: 'report-top-selling', component: asyncPage(() => import('components/TopSellingItems.vue')) },
      { path: 'reports/cash-drawer', name: 'report-cash-drawer', component: asyncPage(() => import('components/CashDrawer.vue')) },
      { path: 'reports/expenses', name: 'report-expenses', component: asyncPage(() => import('components/ExpenseReport.vue')) },
      { path: 'reports/assets', name: 'report-assets', component: asyncPage(() => import('components/AssetAccounts.vue')) },
      { path: 'reports/si-report', name: 'report-si', component: asyncPage(() => import('components/SIReport.vue')) },
      { path: 'reports/vendor-si', name: 'report-vendor-si', component: asyncPage(() => import('components/VendorSIReport.vue')) },
      { path: 'reports/low-stock', name: 'report-low-stock', component: asyncPage(() => import('components/LowStockReport.vue')) },
      { path: 'reports/vendor-report', name: 'report-vendor', component: asyncPage(() => import('components/VendorReport.vue')) },
      { path: 'reports/payment-journal', name: 'report-payment-journal', component: asyncPage(() => import('components/PaymentJournal.vue')) },
      { path: 'reports/stock-in-journal', name: 'report-stock-in', component: asyncPage(() => import('components/StockInJournal.vue')) },
      { path: 'check-approvals', name: 'check-approvals', component: asyncPage(() => import('components/CheckApproval.vue')) },
      { path: 'settings', name: 'settings', component: asyncPage(() => import('pages/SettingsPage.vue')) },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    name: 'not-found',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes

<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Products</h5>
        </div>
        <div class="col-auto">
          <q-btn color="primary" label="Add Product" icon="add" @click="showProductForm = true" />
        </div>
      </div>

      <div class="row q-mb-md q-gutter-sm">
        <div class="col-12 col-md-6">
          <q-input v-model="search" outlined dense placeholder="Search by code or description" debounce="300" @update:model-value="loadProducts">
            <template v-slot:prepend><q-icon name="search" /></template>
            <template v-slot:append v-if="search">
              <q-icon name="clear" class="cursor-pointer" @click="search = ''; loadProducts()" />
            </template>
          </q-input>
        </div>
        <div class="col-12 col-md-3">
          <q-select v-model="statusFilter" :options="[{label:'All',value:'all'},{label:'Active',value:'active'},{label:'Inactive',value:'inactive'}]" label="Status" outlined dense emit-value map-options @update:model-value="loadProducts" />
        </div>
      </div>

      <q-banner v-if="!isOnline" class="bg-warning text-white q-mb-md">
        <template v-slot:avatar><q-icon name="cloud_off" /></template>
        You are currently offline. Changes will be synced when connection is restored.
      </q-banner>

      <q-table :rows="products" :columns="columns" :loading="loading" v-model:pagination="pagination" @request="onRequest" row-key="_id" flat bordered>
        <template v-slot:body-cell-discounts="props">
          <q-td :props="props">
            <template v-if="props.row.lastDiscounts">
              <div class="text-caption" style="line-height:1.2">
                <span v-if="props.row.lastDiscounts.grossCost" class="text-grey-6">P{{ props.row.lastDiscounts.grossCost.toFixed(2) }} →</span>
                <span v-for="d in [1,2,3,4]" :key="d">
                  <span v-if="props.row.lastDiscounts['discount'+d]" :class="props.row.lastDiscounts['discount'+d+'Mode'] === 'add' ? 'text-orange' : 'text-blue'">
                    {{ props.row.lastDiscounts['discount'+d+'Mode'] === 'add' ? '+' : '-' }}{{ props.row.lastDiscounts['discount'+d] }}%
                  </span>
                </span>
              </div>
            </template>
            <span v-else class="text-grey-5">—</span>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense round icon="edit" color="primary" @click="editProduct(props.row)"><q-tooltip>Edit</q-tooltip></q-btn>
            <q-btn flat dense round icon="menu_book" color="deep-purple" @click="viewJournal(props.row)"><q-tooltip>Sales Journal</q-tooltip></q-btn>
            <q-btn flat dense round icon="local_shipping" color="teal" @click="viewVendorJournal(props.row)"><q-tooltip>Vendor/Purchase Journal</q-tooltip></q-btn>
            <q-btn flat dense round icon="history" color="info" @click="viewHistory(props.row)"><q-tooltip>View History</q-tooltip></q-btn>
            <q-btn flat dense round icon="swap_vert" color="orange" @click="openStockAdjust(props.row)"><q-tooltip>Stock Adjustment</q-tooltip></q-btn>
            <q-btn flat dense round icon="warning" :color="props.row.minStock > 0 ? (props.row.availableStock <= props.row.minStock ? 'negative' : 'amber') : 'grey-5'" @click="setMinStock(props.row)"><q-tooltip>Stock Alert (Min: {{ props.row.minStock || 0 }})</q-tooltip></q-btn>
            <q-btn flat dense round :icon="props.row.isActive === false ? 'toggle_off' : 'toggle_on'" :color="props.row.isActive === false ? 'grey' : 'positive'" @click="toggleActive(props.row)"><q-tooltip>{{ props.row.isActive === false ? 'Activate' : 'Deactivate' }}</q-tooltip></q-btn>
            <q-btn flat dense round icon="delete" color="negative" @click="confirmDelete(props.row)"><q-tooltip>Delete</q-tooltip></q-btn>
          </q-td>
        </template>
        <template v-slot:body-cell-availableStock="props">
          <q-td :props="props">
            <q-badge :color="props.row.minStock > 0 && props.row.availableStock <= props.row.minStock ? 'negative' : props.row.availableStock > 0 ? 'positive' : 'grey'">{{ props.row.availableStock }}</q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-sellingUoms="props">
          <q-td :props="props">
            <template v-if="props.row.sellingUoms && props.row.sellingUoms.length > 0">
              <div v-for="su in props.row.sellingUoms" :key="su.uomAbbreviation" class="text-caption" style="line-height:1.3">
                <span class="text-weight-medium text-primary">{{ su.uomAbbreviation }}</span>
                <span class="text-grey-7"> (×{{ su.conversionFactor }})</span>
                <span class="text-weight-bold"> P{{ (su.sellingPrice || 0).toFixed(2) }}</span>
              </div>
            </template>
            <span v-else class="text-grey-5">—</span>
          </q-td>
        </template>
      </q-table>
    </div>

    <q-dialog v-model="showProductForm" persistent>
      <product-form :product="selectedProduct" @saved="onProductSaved" @cancelled="showProductForm = false" />
    </q-dialog>

    <q-dialog v-model="showDeleteDialog" persistent>
      <q-card style="min-width: 350px">
        <q-card-section><div class="text-h6">Confirm Delete</div></q-card-section>
        <q-card-section>
          Are you sure you want to delete product "{{ productToDelete?.code }}"?
          <q-input v-model="adminPassword" type="password" label="Admin Password" outlined dense class="q-mt-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="primary" @click="showDeleteDialog = false" />
          <q-btn flat label="Delete" color="negative" @click="deleteProduct" :loading="deleting" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showStockAdjust" persistent>
      <stock-adjustment-dialog v-if="stockAdjustProduct" :product="stockAdjustProduct" @save="handleStockAdjust" @cancel="showStockAdjust = false" />
    </q-dialog>

    <!-- Product Sales Journal Dialog -->
    <q-dialog v-model="showJournal" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">📖 Sales Journal — {{ journalProduct?.code }} {{ journalProduct?.description }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-table :rows="journalData" :columns="journalColumns" row-key="drNumber" flat bordered dense :loading="journalLoading" :rows-per-page-options="[0]">
            <template v-slot:body-cell-date="props"><q-td :props="props">{{ new Date(props.row.date).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) }}</q-td></template>
            <template v-slot:body-cell-sellingPrice="props"><q-td :props="props">P{{ (props.row.sellingPrice||0).toFixed(2) }}</q-td></template>
            <template v-slot:body-cell-discount="props"><q-td :props="props">P{{ (props.row.discount||0).toFixed(2) }}</q-td></template>
            <template v-slot:body-cell-lineTotal="props"><q-td :props="props" class="text-weight-bold text-positive">P{{ (props.row.lineTotal||0).toFixed(2) }}</q-td></template>
          </q-table>
          <div v-if="journalData.length" class="q-mt-md text-right text-h6 text-positive">
            Total Sales: P{{ journalData.reduce((s, r) => s + (r.lineTotal || 0), 0).toFixed(2) }} ({{ journalData.length }} transactions)
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Vendor/Purchase Journal Dialog -->
    <q-dialog v-model="showVendorJournal" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">🚚 Purchase Journal — {{ vendorJournalProduct?.code }} {{ vendorJournalProduct?.description }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-table :rows="vendorJournalData" :columns="vendorJournalColumns" row-key="drNumber" flat bordered dense :loading="vendorJournalLoading" :rows-per-page-options="[0]">
            <template v-slot:body-cell-date="props"><q-td :props="props">{{ new Date(props.row.date).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) }}</q-td></template>
            <template v-slot:body-cell-grossCost="props"><q-td :props="props">P{{ (props.row.grossCost||0).toFixed(2) }}</q-td></template>
            <template v-slot:body-cell-discounts="props">
              <q-td :props="props">
                <span v-for="d in [1,2,3,4]" :key="d">
                  <span v-if="props.row['discount'+d]" :class="props.row['discount'+d+'Mode'] === 'add' ? 'text-orange' : 'text-blue'" class="q-mr-xs">
                    {{ props.row['discount'+d+'Mode'] === 'add' ? '+' : '-' }}{{ props.row['discount'+d] }}%
                  </span>
                </span>
                <span v-if="!props.row.discount1 && !props.row.discount2 && !props.row.discount3 && !props.row.discount4" class="text-grey-5">—</span>
              </q-td>
            </template>
            <template v-slot:body-cell-netCost="props"><q-td :props="props" class="text-weight-bold">P{{ (props.row.netCost||0).toFixed(2) }}</q-td></template>
            <template v-slot:body-cell-lineTotal="props"><q-td :props="props" class="text-weight-bold text-positive">P{{ (props.row.lineTotal||0).toFixed(2) }}</q-td></template>
          </q-table>
          <div v-if="vendorJournalData.length" class="q-mt-md text-right text-h6 text-teal">
            Total Purchases: P{{ vendorJournalData.reduce((s, r) => s + (r.lineTotal || 0), 0).toFixed(2) }} ({{ vendorJournalData.length }} deliveries)
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import ProductForm from '../components/ProductForm.vue';
import StockAdjustmentDialog from '../components/StockAdjustmentDialog.vue';


const $q = useQuasar();
const errMsg = (e: any): string => e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
let _productStore: any = null;
let _syncStore: any = null;
const isOnline = ref(true);

const products = ref<any[]>([]);
const loading = ref(false);
const search = ref('');
const statusFilter = ref('active');
const showProductForm = ref(false);
const selectedProduct = ref<any>(null);
const showDeleteDialog = ref(false);
const productToDelete = ref<any>(null);
const adminPassword = ref('');
const deleting = ref(false);
const showStockAdjust = ref(false);
const stockAdjustProduct = ref<any>(null);
const showJournal = ref(false);
const journalProduct = ref<any>(null);
const journalData = ref<any[]>([]);
const journalLoading = ref(false);
const showVendorJournal = ref(false);
const vendorJournalProduct = ref<any>(null);
const vendorJournalData = ref<any[]>([]);
const vendorJournalLoading = ref(false);
const journalColumns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' as const, sortable: true },
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const },
  { name: 'customerName', label: 'Customer', field: 'customerName', align: 'left' as const },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'center' as const },
  { name: 'sellingPrice', label: 'Price', field: 'sellingPrice', align: 'right' as const },
  { name: 'discount', label: 'Disc', field: 'discount', align: 'right' as const },
  { name: 'lineTotal', label: 'Total', field: 'lineTotal', align: 'right' as const }
];
const pagination = ref({ page: 1, rowsPerPage: 25, rowsNumber: 0 });

const columns = [
  { name: 'code', label: 'Code', field: 'code', align: 'left' as const, sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const, sortable: true },
  { name: 'availableStock', label: 'Stock', field: 'availableStock', align: 'center' as const, sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center' as const },
  { name: 'lastCost', label: 'Last Cost', field: 'lastCost', align: 'right' as const, format: (val: number) => val ? `P${val.toFixed(2)}` : '-' },
  { name: 'discounts', label: 'Discounts', field: 'lastDiscounts', align: 'center' as const },
  { name: 'averageCost', label: 'Avg Cost', field: 'averageCost', align: 'right' as const, format: (val: number) => val ? `P${val.toFixed(2)}` : '-' },
  { name: 'sellingPrice', label: 'Selling Price', field: 'sellingPrice', align: 'right' as const, format: (val: number) => val ? `P${val.toFixed(2)}` : '-' },
  { name: 'sellingUoms', label: 'Retail Price', field: 'sellingUoms', align: 'left' as const },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const }
];

const getProductStore = async () => {
  if (!_productStore) {
    const { useProductStore } = await import('../stores/productStore');
    _productStore = useProductStore();
  }
  return _productStore;
};

const getSyncStore = async () => {
  if (!_syncStore) {
    const { useSyncStore } = await import('../stores/syncStore');
    _syncStore = useSyncStore();
  }
  return _syncStore;
};

const loadProducts = async () => {
  loading.value = true;
  try {
    const store = await getProductStore();
    const result = await store.fetchProducts({ page: pagination.value.page, limit: pagination.value.rowsPerPage, search: search.value, isActive: statusFilter.value === 'all' ? undefined : statusFilter.value === 'active' });
    products.value = result.products;
    pagination.value.rowsNumber = result.pagination.total;
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to load products: ' + errMsg(error) });
  } finally {
    loading.value = false;
  }
};

const onRequest = (props: any) => { pagination.value = props.pagination; loadProducts(); };

const editProduct = (product: any) => { selectedProduct.value = { ...product }; showProductForm.value = true; };

const toggleActive = async (product: any) => {
  try {
    const store = await getProductStore();
    await store.updateProduct(product._id, { isActive: !product.isActive });
    $q.notify({ type: 'positive', message: product.isActive ? 'Product deactivated' : 'Product activated' });
    loadProducts();
  } catch (error: any) {
    $q.notify({ type: 'negative', message: error.message || 'Failed to toggle status' });
  }
};

const setMinStock = (product: any) => {
  $q.dialog({
    title: 'Set Stock Alert',
    message: `Set minimum stock for ${product.code} — ${product.description}. Current stock: ${product.availableStock}`,
    prompt: { model: String(product.minStock || 0), type: 'number', label: 'Min Stock Qty', isValid: (v: string) => Number(v) >= 0 },
    cancel: true
  }).onOk(async (val: string) => {
    try {
      const store = await getProductStore();
      await store.updateProduct(product._id, { minStock: Number(val) });
      $q.notify({ type: 'positive', message: `Stock alert set to ${val}` });
      await loadProducts();
    } catch (e: any) { $q.notify({ type: 'negative', message: e.message }); }
  });
};

const viewJournal = async (product: any) => {
  journalProduct.value = product;
  journalLoading.value = true;
  journalData.value = [];
  showJournal.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/products/${product._id}/journal`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) journalData.value = await res.json();
  } catch { /* silent */ }
  finally { journalLoading.value = false; }
};

const vendorJournalColumns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' as const, sortable: true },
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const },
  { name: 'vendorName', label: 'Vendor', field: 'vendorName', align: 'left' as const },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'center' as const },
  { name: 'grossCost', label: 'Gross Cost', field: 'grossCost', align: 'right' as const },
  { name: 'discounts', label: 'Discounts', field: '', align: 'center' as const },
  { name: 'netCost', label: 'Net Cost', field: 'netCost', align: 'right' as const },
  { name: 'lineTotal', label: 'Total', field: 'lineTotal', align: 'right' as const }
];

const viewVendorJournal = async (product: any) => {
  vendorJournalProduct.value = product;
  vendorJournalLoading.value = true;
  vendorJournalData.value = [];
  showVendorJournal.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/products/${product._id}/vendor-journal`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) vendorJournalData.value = await res.json();
  } catch { /* silent */ }
  finally { vendorJournalLoading.value = false; }
};

const viewHistory = async (product: any) => {
  try {
    const store = await getProductStore();
    const data = await store.getProductHistory(product._id);
    const history = (data.history || []).slice(-20).reverse();
    const rows = history.map((h: any) =>
      `<tr><td>${new Date(h.date).toLocaleDateString()}</td><td>${h.quantityIn || 0}</td><td>${h.quantityOut || 0}</td><td>${h.balance}</td><td>${h.reason || '-'}</td></tr>`
    ).join('');
    $q.dialog({
      title: `Stock History: ${product.code}`,
      html: true,
      message: rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">Date</th><th style="border-bottom:1px solid #ddd;padding:4px">In</th><th style="border-bottom:1px solid #ddd;padding:4px">Out</th><th style="border-bottom:1px solid #ddd;padding:4px">Balance</th><th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">Reason</th></tr></thead><tbody>${rows}</tbody></table>` : 'No history available',
      style: 'min-width: 500px'
    });
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to load history' });
  }
};

const openStockAdjust = (product: any) => { stockAdjustProduct.value = { ...product }; showStockAdjust.value = true; };

const handleStockAdjust = async (payload: { type: 'IN' | 'OUT'; quantity: number; reason: string; notes?: string }) => {
  try {
    const store = await getProductStore();
    await store.stockAdjust(stockAdjustProduct.value._id, payload.type, payload.quantity, payload.reason, payload.notes);
    $q.notify({ type: 'positive', message: 'Stock adjusted successfully' });
    showStockAdjust.value = false;
    stockAdjustProduct.value = null;
    loadProducts();
  } catch (error: any) {
    $q.notify({ type: 'negative', message: error?.response?.data?.error || error?.message || 'Failed to adjust stock' });
  }
};

const confirmDelete = (product: any) => { productToDelete.value = product; adminPassword.value = ''; showDeleteDialog.value = true; };

const deleteProduct = async () => {
  if (!adminPassword.value) { $q.notify({ type: 'warning', message: 'Please enter admin password' }); return; }
  deleting.value = true;
  try {
    const store = await getProductStore();
    await store.deleteProduct(productToDelete.value._id, adminPassword.value);
    $q.notify({ type: 'positive', message: 'Product deleted successfully' });
    showDeleteDialog.value = false;
    loadProducts();
  } catch (error: any) {
    $q.notify({ type: 'negative', message: error.message || 'Failed to delete product' });
  } finally {
    deleting.value = false;
  }
};

const onProductSaved = () => {
  showProductForm.value = false;
  selectedProduct.value = null;
  loadProducts();
  $q.notify({ type: 'positive', message: 'Product saved successfully' });
};

onMounted(async () => {
  loadProducts();
  try {
    const sync = await getSyncStore();
    isOnline.value = sync.isOnline;
  } catch { /* silent */ }
});
</script>

<style scoped>
:deep(.q-table tbody td) {
  padding: 1px 6px !important;
  line-height: 1.2 !important;
}
:deep(.q-table thead th) {
  padding: 3px 6px !important;
}
:deep(.q-table tbody .q-btn--dense) {
  min-height: 24px !important;
  min-width: 24px !important;
  padding: 0 !important;
}
:deep(.low-stock-row td) {
  background: #ffebee !important;
  color: #c62828;
}
</style>


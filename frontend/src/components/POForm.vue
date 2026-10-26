<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width:1400px;margin:0 auto">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">{{ isEdit ? 'Edit Purchase Order' : 'New Purchase Order' }}</h5></div>
        <div class="col-auto"><q-badge :color="form.status === 'COMPLETED' ? 'positive' : 'warning'" :label="form.status" /></div>
      </div>

      <!-- Header -->
      <q-card flat bordered class="q-mb-sm">
        <q-card-section class="q-py-sm">
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-4">
              <div class="row q-gutter-xs items-end">
                <div class="col">
                  <q-select v-model="form.vendorId" :options="vendors" option-value="_id" option-label="name" label="Vendor *" outlined dense use-input input-debounce="200" @filter="filterVendors" />
                </div>
                <div class="col-auto"><q-btn dense icon="person_add" color="primary" @click="showNewVendor = true"><q-tooltip>New Vendor</q-tooltip></q-btn></div>
              </div>
            </div>
            <div class="col-6 col-md-2"><q-input v-model="form.poNumber" label="PO Number" outlined dense readonly bg-color="grey-2" /></div>
            <div class="col-6 col-md-2"><q-input v-model="form.poDate" label="Date" type="date" outlined dense /></div>
            <div class="col-6 col-md-2"><q-select v-model="form.status" :options="['DRAFT','SUBMITTED','PARTIAL','COMPLETED','CANCELLED']" label="Status" outlined dense /></div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Entry Row -->
      <q-card flat bordered class="q-mb-sm">
        <q-card-section class="q-py-sm">
          <div class="text-caption text-grey-7 q-mb-xs">Add Item — type code/name, Tab, Enter to add</div>
          <div class="row q-col-gutter-xs items-end">
            <div class="col-3" style="position:relative">
              <q-input ref="searchRef" v-model="entry.search" label="Product Code / Name" outlined dense @keydown.enter="onEntryEnter" @update:model-value="onSearchChange" />
              <div v-if="suggestions.length > 0 && entry.search.length > 0" class="entry-suggestions">
                <div v-for="(s, i) in suggestions" :key="s._id" class="entry-suggestion-item" :class="{ 'entry-suggestion-active': i === 0 }" @mousedown.prevent="pickProduct(s)">
                  <span class="text-weight-medium">{{ s.code }}</span> — {{ s.description }} <span class="text-grey-6">| {{ s.uom }}</span>
                </div>
              </div>
            </div>
            <div class="col-1"><q-input :model-value="entry.product?.uom || ''" label="UOM" outlined dense readonly tabindex="-1" bg-color="grey-2" /></div>
            <div class="col-1"><q-input v-model.number="entry.qty" label="Qty" type="number" outlined dense step="0.01" ref="qtyRef" @keydown.enter="addEntry" /></div>
            <div class="col-2"><q-input v-model.number="entry.unitCost" label="Unit Cost" type="number" outlined dense prefix="P" step="0.01" @keydown.enter="addEntry" /></div>
            <div class="col-1"><q-input v-model.number="entry.discount" label="Disc" type="number" outlined dense prefix="P" step="0.01" @keydown.enter="addEntry" /></div>
            <div class="col-2"><q-input :model-value="'P' + entryTotal.toFixed(2)" label="Total" outlined dense readonly bg-color="green-1" /></div>
            <div class="col-auto"><q-btn color="primary" icon="add" dense unelevated style="height:40px" @click="addEntry" :disable="!entry.product" /></div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Items Table -->
      <q-card flat bordered class="q-mb-sm">
        <q-table :rows="form.lineItems" :columns="poColumns" row-key="_idx" flat bordered dense :rows-per-page-options="[0]">
          <template v-slot:body-cell-no="props"><q-td :props="props">{{ props.rowIndex + 1 }}</q-td></template>
          <template v-slot:body-cell-quantity="props">
            <q-td :props="props"><q-input v-model.number="props.row.quantity" type="number" dense outlined style="width:80px" step="0.01" /></q-td>
          </template>
          <template v-slot:body-cell-unitCost="props">
            <q-td :props="props"><q-input v-model.number="props.row.unitCost" type="number" dense outlined prefix="P" style="width:100px" step="0.01" /></q-td>
          </template>
          <template v-slot:body-cell-supplierDiscount="props">
            <q-td :props="props"><q-input v-model.number="props.row.supplierDiscount" type="number" dense outlined prefix="P" style="width:80px" step="0.01" /></q-td>
          </template>
          <template v-slot:body-cell-lineTotal="props">
            <q-td :props="props"><span class="text-weight-bold text-positive">P{{ (((props.row.quantity||0) * (props.row.unitCost||0)) - (props.row.supplierDiscount||0)).toFixed(2) }}</span></q-td>
          </template>
          <template v-slot:body-cell-actions="props">
            <q-td :props="props"><q-btn flat dense round icon="delete" color="negative" @click="form.lineItems.splice(props.rowIndex, 1)" /></q-td>
          </template>
          <template v-slot:bottom-row>
            <q-tr><q-td colspan="6" class="text-right text-bold">TOTAL:</q-td><q-td class="text-right text-bold text-positive">P{{ grandTotal.toFixed(2) }}</q-td><q-td></q-td></q-tr>
          </template>
        </q-table>
      </q-card>

      <!-- Actions -->
      <div class="row q-gutter-sm justify-end">
        <q-btn flat label="Cancel" color="primary" @click="$router.push('/purchase-orders')" />
        <q-btn v-if="isEdit" flat label="Print PO" icon="print" color="deep-purple" @click="printPO" />
        <q-btn label="Save" color="primary" @click="onSubmit" />
      </div>
    </div>
    <q-dialog v-model="showNewVendor" persistent>
      <q-card style="min-width:400px">
        <q-card-section><div class="text-h6">New Vendor</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="newVendor.name" label="Vendor Name *" outlined dense />
          <q-input v-model="newVendor.address" label="Address" outlined dense />
          <q-input v-model="newVendor.phone" label="Phone" outlined dense />
          <q-input v-model="newVendor.contactPerson" label="Contact Person" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showNewVendor = false" />
          <q-btn label="Save & Select" color="primary" @click="saveNewVendor" :loading="savingVendor" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { usePOStore } from '../stores/poStore';
import { useVendorStore } from '../stores/vendorStore';
import { useProductStore } from '../stores/productStore';
import { useQuasar } from 'quasar';

const router = useRouter();
const route = useRoute();
const poStore = usePOStore();
const vendorStore = useVendorStore();
const productStore = useProductStore();
const $q = useQuasar();

const isEdit = computed(() => !!route.params.id && route.params.id !== 'new');
const searchRef = ref<any>(null);
const qtyRef = ref<any>(null);

const form = ref<any>({ poNumber: '', poDate: new Date().toISOString().split('T')[0], vendorId: null, status: 'DRAFT', lineItems: [] });
const vendors = ref<any[]>([]);
const allProducts = ref<any[]>([]);
const suggestions = ref<any[]>([]);
const showNewVendor = ref(false);
const savingVendor = ref(false);
const newVendor = ref({ name: '', address: '', phone: '', contactPerson: '' });
const entry = ref<any>({ search: '', product: null, qty: 1, unitCost: 0, discount: 0 });

const entryTotal = computed(() => Math.max(0, ((entry.value.qty || 0) * (entry.value.unitCost || 0)) - (entry.value.discount || 0)));
const grandTotal = computed(() => form.value.lineItems.reduce((s: number, i: any) => s + Math.max(0, ((i.quantity||0) * (i.unitCost||0)) - (i.supplierDiscount||0)), 0));

const poColumns = [
  { name: 'no', label: 'No.', field: '', align: 'center' as const },
  { name: 'description', label: 'Product', field: 'description', align: 'left' as const },
  { name: 'uomCode', label: 'UOM', field: 'uomCode', align: 'center' as const },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'center' as const },
  { name: 'unitCost', label: 'Unit Cost', field: 'unitCost', align: 'right' as const },
  { name: 'supplierDiscount', label: 'Disc', field: 'supplierDiscount', align: 'right' as const },
  { name: 'lineTotal', label: 'Total', field: '', align: 'right' as const },
  { name: 'actions', label: '', field: '', align: 'center' as const }
];

const onSearchChange = (val: any) => {
  entry.value.product = null;
  const v = String(val || '');
  if (v.length < 1) { suggestions.value = []; return; }
  const needle = v.toLowerCase();
  suggestions.value = allProducts.value.filter((p: any) => p.code?.toLowerCase().includes(needle) || p.description?.toLowerCase().includes(needle)).slice(0, 8);
};

const pickProduct = (p: any) => {
  entry.value.product = p;
  entry.value.search = `${p.code} — ${p.description}`;
  entry.value.unitCost = p.lastCost || p.averageCost || 0;
  entry.value.qty = 1;
  entry.value.discount = 0;
  suggestions.value = [];
  setTimeout(() => qtyRef.value?.focus(), 50);
};

const onEntryEnter = () => {
  if (suggestions.value.length > 0) { pickProduct(suggestions.value[0]); return; }
  if (entry.value.product) addEntry();
};

const addEntry = () => {
  if (!entry.value.product) return;
  const p = entry.value.product;
  form.value.lineItems.push({
    productId: p._id, description: p.description, uomCode: p.uom || '', uomValue: p.uom || '',
    quantity: entry.value.qty || 1, unitCost: entry.value.unitCost || 0,
    supplierDiscount: entry.value.discount || 0,
    lineTotal: entryTotal.value
  });
  entry.value = { search: '', product: null, qty: 1, unitCost: 0, discount: 0 };
  suggestions.value = [];
  setTimeout(() => searchRef.value?.focus(), 50);
};

const filterVendors = (val: string, update: Function) => {
  update(() => {
    const needle = val.toLowerCase();
    vendors.value = needle ? vendorStore.vendors.filter(v => v.name.toLowerCase().includes(needle)) : vendorStore.vendors;
  });
};

const saveNewVendor = async () => {
  if (!newVendor.value.name) { $q.notify({ type: 'warning', message: 'Vendor name required' }); return; }
  savingVendor.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/vendors`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newVendor.value)
    });
    if (!res.ok) throw new Error('Failed');
    const created = await res.json();
    await vendorStore.fetchVendors();
    vendors.value = vendorStore.vendors;
    form.value.vendorId = created;
    showNewVendor.value = false;
    newVendor.value = { name: '', address: '', phone: '', contactPerson: '' };
    $q.notify({ type: 'positive', message: 'Vendor created and selected' });
  } catch { $q.notify({ type: 'negative', message: 'Failed to create vendor' }); }
  finally { savingVendor.value = false; }
};

const fmtCur = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);

const onSubmit = async () => {
  if (form.value.lineItems.length === 0) { $q.notify({ type: 'warning', message: 'Add at least one item' }); return; }
  try {
    const data = {
      ...form.value,
      vendorId: form.value.vendorId?._id || form.value.vendorId,
      totalAmount: grandTotal.value,
      lineItems: form.value.lineItems.map((i: any) => ({
        productId: i.productId, description: i.description, quantity: i.quantity,
        uomCode: i.uomCode, uomValue: i.uomValue, unitCost: i.unitCost,
        supplierDiscount: i.supplierDiscount, lineTotal: ((i.quantity||0)*(i.unitCost||0))-(i.supplierDiscount||0)
      }))
    };
    if (isEdit.value) { await poStore.updatePurchaseOrder(route.params.id as string, data); $q.notify({ type: 'positive', message: 'Updated' }); }
    else { await poStore.createPurchaseOrder(data); $q.notify({ type: 'positive', message: 'Created' }); }
    router.push('/purchase-orders');
  } catch (e: any) { $q.notify({ type: 'negative', message: e?.message || 'Failed to save' }); }
};

const printPO = () => {
  const vendorName = form.value.vendorId?.name || '';
  const rows = form.value.lineItems.map((item: any, i: number) =>
    `<tr><td>${i+1}</td><td>${item.description}</td><td>${item.uomCode}</td><td>${item.quantity}</td><td style="text-align:right">${fmtCur(item.unitCost)}</td><td style="text-align:right">${fmtCur(item.supplierDiscount)}</td><td style="text-align:right">${fmtCur(((item.quantity||0)*(item.unitCost||0))-(item.supplierDiscount||0))}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><title>PO ${form.value.poNumber}</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px}th{background:#f0f0f0}.total{text-align:right;font-size:14px;font-weight:700;margin-top:10px}@media print{body{padding:0}}</style></head><body>
  <h2 style="text-align:center;margin:0">Aberin Hardware</h2><p style="text-align:center;margin:2px 0">PURCHASE ORDER</p>
  <div style="display:flex;justify-content:space-between;margin:10px 0"><div><b>PO#:</b> ${form.value.poNumber}<br><b>Date:</b> ${form.value.poDate}</div><div><b>Vendor:</b> ${vendorName}<br><b>Status:</b> ${form.value.status}</div></div>
  <table><thead><tr><th>#</th><th>Product</th><th>UOM</th><th>Qty</th><th>Unit Cost</th><th>Disc</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="total">Grand Total: ${fmtCur(grandTotal.value)}</div>
  <script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

onMounted(async () => {
  await vendorStore.fetchVendors();
  vendors.value = vendorStore.vendors;
  await productStore.fetchProducts({ limit: 10000 });
  allProducts.value = productStore.products;
  if (isEdit.value) {
    try {
      const po = await poStore.getPurchaseOrderById(route.params.id as string);
      form.value = { poNumber: po.poNumber, poDate: new Date(po.poDate).toISOString().split('T')[0], vendorId: po.vendorId, status: po.status,
        lineItems: po.lineItems.map((item: any) => ({ ...item, productId: item.productId?._id || item.productId }))
      };
    } catch { $q.notify({ type: 'negative', message: 'Failed to load PO' }); router.push('/purchase-orders'); }
  }
});
</script>

<style scoped>
.entry-suggestions { position: absolute; z-index: 9999; background: #fff; border: 2px solid #1976d2; border-top: none; border-radius: 0 0 6px 6px; max-height: 180px; overflow-y: auto; width: 100%; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.entry-suggestion-item { padding: 6px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
.entry-suggestion-item:hover, .entry-suggestion-active { background: #e3f2fd; }
</style>

<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Sales Transactions</h5>
        </div>

        <div class="col-auto">
          <q-btn
            color="primary"
            label="New Sale"
            icon="add"
            @click="$router.push('/sales/new')"
          />
        </div>

        <div class="col-auto">
          <q-btn
            color="deep-purple"
            label="Print Sales Summary"
            icon="picture_as_pdf"
            outline
            @click="showPrintDialog = true"
          />
        </div>

        <div class="col-auto">
          <q-btn
            color="teal"
            label="Sync to Cloud"
            icon="cloud_upload"
            :loading="syncingToCloud"
            @click="syncToCloud"
          />
        </div>
      </div>

      <!-- FILTERS -->
      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-auto">
          <div class="text-caption text-grey-7 q-mb-xs">
            Status
          </div>

          <q-btn-toggle
            v-model="filters.status"
            :options="statusToggleOptions"
            unelevated
            rounded
            dense
            toggle-color="primary"
            color="grey-3"
            text-color="grey-8"
          />
        </div>

        <div class="col-6 col-md-2">
          <q-select
            v-model="filters.paymentFilter"
            :options="paymentOptions"
            label="Payment"
            outlined
            dense
            clearable
            emit-value
            map-options
          />
        </div>

        <div class="col-6 col-md-3">
          <q-input
            v-model="filters.startDate"
            label="Start Date"
            type="date"
            outlined
            dense
            clearable
            @update:model-value="onDateFilterChange"
          />
        </div>

        <div class="col-6 col-md-3">
          <q-input
            v-model="filters.endDate"
            label="End Date"
            type="date"
            outlined
            dense
            clearable
            @update:model-value="onDateFilterChange"
          />
        </div>

        <div class="col-12 col-md-2">
          <q-input
            v-model="searchQuery"
            outlined
            dense
            placeholder="Search DR# / Customer..."
            clearable
            :loading="searchLoading"
            @update:model-value="onSearchInput"
            @clear="onSearchInput"
          >
            <template #prepend>
              <q-icon name="search" />
            </template>
          </q-input>
        </div>
      </div>

      <!-- Payment loading indicator -->
      <q-linear-progress v-if="loadingMore" indeterminate color="primary" size="3px" class="q-mb-xs" />

<!-- TABLE -->
      <q-table
        v-model:pagination="pagination"
        :rows="filteredSales"
        :columns="columns"
        row-key="_id"
        :loading="loading"
        :rows-per-page-options="[10,15,25,50,100]"
        flat
        bordered
      >
        <!-- DATE -->
        <template #body-cell-saleDate="props">
          <q-td :props="props">
            {{ fmtDate(props.row.saleDate) }}
          </q-td>
        </template>

        <!-- TOTAL -->
        <template #body-cell-totalAmount="props">
          <q-td :props="props">
            {{ fmtCur(props.row.totalAmount) }}
          </q-td>
        </template>

        <!-- DELIVERY -->
        <template #body-cell-deliveryFee="props">
          <q-td :props="props">
            {{ fmtCur(props.row.deliveryFee) }}
          </q-td>
        </template>

        <!-- TOLL -->
        <template #body-cell-tollFee="props">
          <q-td :props="props">
            {{ fmtCur(props.row.tollFee) }}
          </q-td>
        </template>

        <!-- STATUS -->
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="statusClr(props.row.status)"
              :label="props.row.status"
            />
          </q-td>
        </template>

        <!-- PAYMENT -->
        <template #body-cell-paymentStatus="props">
          <q-td :props="props">
            <q-badge
              v-if="paymentMeta(props.row).status === 'PAID'"
              color="positive"
              label="PAID"
            />

            <q-badge
              v-else-if="paymentMeta(props.row).status === 'PARTIAL'"
              color="orange"
              :label="'PARTIAL BAL P' + paymentMeta(props.row).balance.toFixed(0)"
            />

            <q-badge
              v-else-if="paymentMeta(props.row).status === 'UNPAID'"
              color="negative"
              label="UNPAID"
            />
          </q-td>
        </template>

        <!-- ACTIONS -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              @click="viewSale(props.row)"
            >
              <q-tooltip>View</q-tooltip>
            </q-btn>

            <q-btn
              flat
              dense
              round
              icon="edit"
              color="orange"
              @click="editSale(props.row)"
            >
              <q-tooltip>Edit (Admin)</q-tooltip>
            </q-btn>

            <q-btn
              v-if="props.row.status === 'COMPLETED'"
              flat
              dense
              round
              icon="undo"
              color="deep-purple"
              @click="returnItems(props.row)"
            >
              <q-tooltip>Return Items</q-tooltip>
            </q-btn>

            <q-btn
              v-if="props.row.status === 'DRAFT'"
              flat
              dense
              round
              icon="check"
              color="positive"
              @click="postSale(props.row)"
            >
              <q-tooltip>Post</q-tooltip>
            </q-btn>

            <q-btn
              v-if="props.row._unpaid"
              flat
              dense
              round
              icon="payment"
              color="teal"
              @click="viewSale(props.row)"
            >
              <q-tooltip>Pay Now</q-tooltip>
            </q-btn>

            <q-btn
              v-if="props.row.status === 'DRAFT'"
              flat
              dense
              round
              icon="delete"
              color="negative"
              @click="confirmDelete(props.row)"
            />
            <q-btn
              v-if="props.row.status === 'DRAFT'"
              flat
              dense
              round
              icon="arrow_forward"
              color="primary"
              @click="continueDraft(props.row)"
            >
              <q-tooltip>Continue (open in POS)</q-tooltip>
            </q-btn>
          </q-td>
        </template>

        <!-- NO DATA -->
        <template #no-data>
          <div class="full-width row flex-center text-grey q-gutter-sm q-pa-lg">
            <q-icon size="2em" name="inbox" />
            <span>No sales found</span>
          </div>
        </template>
      </q-table>
    </div>

    <!-- VIEW RECEIPT -->
    <q-dialog v-model="showViewDialog">
      <sales-receipt
        :sale="selectedSale"
        @close="closeView"
        @voided="loadSales"
        @paid="onPaid"
      />
    </q-dialog>

    <!-- PRINT DIALOG -->
    <q-dialog v-model="showPrintDialog">
      <q-card style="min-width: 380px">
        <q-card-section>
          <div class="text-h6">Print Sales Summary</div>
        </q-card-section>

        <q-card-section>
          <div class="q-gutter-md">
            <q-input v-model="printStartDate" label="Start Date" type="date" outlined dense />
            <q-input v-model="printEndDate" label="End Date" type="date" outlined dense />
            <q-select
              v-model="printPaymentFilter"
              :options="[{label:'All',value:null},{label:'Paid',value:'PAID'},{label:'Unpaid',value:'UNPAID'},{label:'Partial',value:'PARTIAL'}]"
              label="Payment Status"
              outlined
              dense
              emit-value
              map-options
            />
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" :loading="printing" label="Print" @click="confirmPrint" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- EDIT SALE DIALOG -->
    <q-dialog v-model="showEditDialog" persistent>
      <q-card style="width:95vw;max-width:1000px;max-height:90vh">
        <q-card-section class="row items-center q-pb-sm">
          <div class="text-h6">Edit Sale - {{ editForm.drNumber }}</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showEditDialog = false" />
        </q-card-section>
        <q-separator />
        <q-card-section style="max-height:70vh;overflow-y:auto">
          <!-- Header fields -->
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-6 col-md-3"><q-input v-model="editForm.drNumber" label="DR Number" outlined dense /></div>
            <div class="col-6 col-md-3">
              <q-select v-model="editCustomerSelected" :options="editCustomerOptions" option-label="name" option-value="_id" label="Customer" outlined dense use-input input-debounce="200" @filter="filterEditCustomers" @update:model-value="onEditCustomerSelected" />
            </div>
            <div class="col-6 col-md-3"><q-input v-model="editForm.saleDate" label="Sale Date" type="date" outlined dense /></div>
            <div class="col-6 col-md-3"><q-select v-model="editForm.documentType" :options="['DR','SI','PU','DL','POS']" label="Type" outlined dense /></div>
          </div>

          <!-- Add product row -->
          <div class="row q-col-gutter-xs q-mb-sm items-end" style="position:relative">
            <div class="col-4" style="position:relative">
              <q-input v-model="editNewItem.search" label="Search product to add..." outlined dense @update:model-value="onEditProductSearch" @keydown.enter="pickEditProduct(editProductSuggestions[0])" />
              <div v-if="editProductSuggestions.length > 0 && editNewItem.search.length > 0" style="position:absolute;z-index:9999;background:#fff;border:2px solid #1976d2;border-top:none;border-radius:0 0 6px 6px;max-height:150px;overflow-y:auto;width:100%;box-shadow:0 4px 16px rgba(0,0,0,0.15)">
                <div v-for="s in editProductSuggestions" :key="s._id" style="padding:5px 8px;cursor:pointer;font-size:12px;border-bottom:1px solid #f0f0f0" @mousedown.prevent="pickEditProduct(s)">
                  <span class="text-weight-medium">{{ s.code }}</span> - {{ s.description }} <span class="text-blue-8">P{{ (s.sellingPrice||0).toFixed(2) }}</span>
                </div>
              </div>
            </div>
            <div class="col-2"><q-select v-model="editNewItem.uom" :options="editNewItem.uomOptions" label="UOM" outlined dense emit-value map-options @update:model-value="onEditUomChange" /></div>
            <div class="col-1"><q-input v-model.number="editNewItem.qty" label="Qty" type="number" outlined dense step="0.01" /></div>
            <div class="col-2"><q-input v-model.number="editNewItem.price" label="Price" type="number" outlined dense prefix="P" /></div>
            <div class="col-1"><q-input v-model.number="editNewItem.discount" label="Disc" type="number" outlined dense prefix="P" /></div>
            <div class="col-2"><q-btn color="primary" icon="add" label="Add" dense unelevated @click="addEditLine" :disable="!editNewItem.description" /></div>
          </div>

          <q-separator class="q-mb-sm" />

          <!-- Line items -->
          <div class="text-subtitle2 q-mb-xs">Line Items ({{ editForm.lineItems.length }})</div>
          <div v-for="(item, idx) in editForm.lineItems" :key="idx" class="row q-col-gutter-xs q-mb-xs items-center">
            <div class="col-3"><q-input v-model="item.description" label="Description" outlined dense /></div>
            <div class="col-1"><q-input :model-value="item.uom || ''" label="UOM" outlined dense readonly bg-color="grey-2" /></div>
            <div class="col-1"><q-input v-model.number="item.quantity" label="Qty" type="number" outlined dense min="0.01" step="0.01" @update:model-value="recalcEditLine(idx)" /></div>
            <div class="col-2"><q-input v-model.number="item.sellingPrice" label="Price" type="number" outlined dense prefix="P" @update:model-value="recalcEditLine(idx)" /></div>
            <div class="col-1"><q-input v-model.number="item.discount" label="Disc" type="number" outlined dense prefix="P" @update:model-value="recalcEditLine(idx)" /></div>
            <div class="col-2"><q-input :model-value="item.lineTotal?.toFixed(2)" label="Total" outlined dense readonly prefix="P" bg-color="grey-2" /></div>
            <div class="col-1"><q-btn flat dense round icon="delete" color="negative" @click="editForm.lineItems.splice(idx, 1)" /></div>
          </div>

          <!-- Fees & Total -->
          <div class="row q-col-gutter-sm q-mt-sm items-center">
            <div class="col-auto"><q-input v-model.number="editForm.deliveryFee" label="Delivery" type="number" outlined dense prefix="P" style="width:110px" /></div>
            <div class="col-auto"><q-input v-model.number="editForm.tollFee" label="Toll" type="number" outlined dense prefix="P" style="width:110px" /></div>
            <div class="col text-right text-h6 text-positive">Total: {{ fmtEditTotal }}</div>
          </div>
          <q-input v-model="editForm.notes" label="Notes" outlined dense class="q-mt-sm" />
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-sm">
          <q-btn flat label="Cancel" @click="showEditDialog = false" />
          <q-btn unelevated label="Save Changes" color="primary" icon="save" :loading="editSaving" @click="saveEdit" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../boot/axios';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import SalesReceipt from '../components/SalesReceipt.vue';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

let _store: any = null;

const errMsg = (e: any): string =>
  e?.response?.data?.error ||
  e?.message ||
  'Unknown error';

const searchQuery = ref('');
const loadingMore = ref(false);
const showPrintDialog = ref(false);
const syncingToCloud = ref(false);

async function syncToCloud() {
  syncingToCloud.value = true;
  const notif = $q.notify({
    group: false,
    spinner: true,
    message: 'Syncing to cloud...',
    caption: 'Uploading offline changes',
    timeout: 0,
    position: 'top-right',
  });
  try {
    const { data } = await api.post('/api/sync/push-to-cloud');
    if (data && data.ok) {
      notif({
        spinner: false,
        type: 'positive',
        icon: 'cloud_done',
        message: 'Synced to cloud',
        caption: `${data.totalUpserted} record(s) uploaded${data.totalErrors ? `, ${data.totalErrors} skipped` : ''}`,
        timeout: 3500,
      });
    } else {
      notif({
        spinner: false,
        type: 'warning',
        icon: 'cloud_off',
        message: 'Sync not completed',
        caption: (data && data.message) || 'Check your internet connection.',
        timeout: 4500,
      });
    }
  } catch (e: any) {
    notif({
      spinner: false,
      type: 'negative',
      icon: 'error',
      message: 'Sync failed',
      caption: e?.response?.data?.message || e?.message || 'Could not reach the local server.',
      timeout: 4500,
    });
  } finally {
    syncingToCloud.value = false;
  }
}
const printStartDate = ref<string | null>(null);
const printEndDate = ref<string | null>(null);
const printPaymentFilter = ref<string | null>(null);
const printing = ref(false);

const showViewDialog = ref(false);
const selectedSale = ref<any>(null);

// Edit dialog state
const showEditDialog = ref(false);
const editSaleId = ref('');
const editAdminPw = ref('');
const editSaving = ref(false);
const editForm = ref<any>({ drNumber: '', customerName: '', customerId: '', saleDate: '', documentType: 'DR', lineItems: [], deliveryFee: 0, tollFee: 0, notes: '' });
const editCustomerSelected = ref<any>(null);
const editCustomerOptions = ref<any[]>([]);
const allEditCustomers = ref<any[]>([]);
const editAllProducts = ref<any[]>([]);
const editProductSuggestions = ref<any[]>([]);
const editNewItem = ref<any>({ search: '', description: '', productId: '', qty: 1, price: 0, discount: 0, uom: '', uomOptions: [] });

const fmtEditTotal = computed(() => {
  const items = (editForm.value.lineItems || []).reduce((s: number, i: any) => s + (i.lineTotal || 0), 0);
  const total = items + (editForm.value.deliveryFee || 0) + (editForm.value.tollFee || 0);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(total);
});

const recalcEditLine = (idx: number) => {
  const item = editForm.value.lineItems[idx];
  if (item) item.lineTotal = Math.max(0, (item.quantity * item.sellingPrice) - (item.discount || 0));
};

const filterEditCustomers = (val: string, update: Function) => {
  update(() => {
    const needle = val.toLowerCase();
    editCustomerOptions.value = needle
      ? allEditCustomers.value.filter((c: any) => c.name.toLowerCase().includes(needle))
      : allEditCustomers.value;
  });
};

const onEditCustomerSelected = (customer: any) => {
  if (customer) {
    editForm.value.customerName = customer.name;
    editForm.value.customerId = customer._id;
  }
};

const onEditProductSearch = (val: any) => {
  const v = String(val || '');
  if (v.length < 1) { editProductSuggestions.value = []; return; }
  const needle = v.toLowerCase();
  editProductSuggestions.value = editAllProducts.value
    .filter((p: any) => p.code?.toLowerCase().includes(needle) || p.description?.toLowerCase().includes(needle))
    .sort((a: any, b: any) => {
      const aCode = (a.code || '').toLowerCase();
      const bCode = (b.code || '').toLowerCase();
      if (aCode.startsWith(needle) && !bCode.startsWith(needle)) return -1;
      if (!aCode.startsWith(needle) && bCode.startsWith(needle)) return 1;
      return aCode.localeCompare(bCode);
    })
    .slice(0, 8);
};

const pickEditProduct = (p: any) => {
  if (!p) return;
  editNewItem.value.description = p.description;
  editNewItem.value.productId = p._id;
  editNewItem.value.search = `${p.code} - ${p.description}`;
  editNewItem.value.price = p.sellingPrice || 0;
  editNewItem.value.qty = 1;
  editNewItem.value.discount = 0;
  // Build UOM options: base + selling UOMs
  const uomOpts: any[] = [{ label: p.uom || 'PC', value: p.uom || 'PC', price: p.sellingPrice || 0, conversionFactor: 1 }];
  if (p.sellingUoms && p.sellingUoms.length > 0) {
    for (const su of p.sellingUoms) {
      const uomName = su.uomAbbreviation || su.uomCode || su.uomName || '';
      const cf = su.conversionFactor || 1;
      const uomPrice = su.sellingPrice || ((p.sellingPrice || 0) * cf);
      uomOpts.push({ label: uomName, value: uomName, price: uomPrice, conversionFactor: cf });
    }
  }
  editNewItem.value.uomOptions = uomOpts;
  editNewItem.value.uom = uomOpts[0]?.value || '';
  editProductSuggestions.value = [];
};

const onEditUomChange = (uomValue: string) => {
  const opt = (editNewItem.value.uomOptions || []).find((o: any) => o.value === uomValue);
  if (opt && opt.price) editNewItem.value.price = opt.price;
};

const addEditLine = () => {
  if (!editNewItem.value.description) return;
  const selectedUomOpt = (editNewItem.value.uomOptions || []).find((o: any) => o.value === editNewItem.value.uom);
  const cf = selectedUomOpt?.conversionFactor || 1;
  const lt = Math.max(0, (editNewItem.value.qty * editNewItem.value.price) - (editNewItem.value.discount || 0));
  editForm.value.lineItems.push({
    productId: editNewItem.value.productId,
    description: editNewItem.value.description,
    uom: editNewItem.value.uom || '',
    quantity: editNewItem.value.qty || 1,
    sellingPrice: editNewItem.value.price || 0,
    discount: editNewItem.value.discount || 0,
    lineTotal: lt,
    conversionFactor: cf
  });
  editNewItem.value = { search: '', description: '', productId: '', qty: 1, price: 0, discount: 0, uom: '', uomOptions: [] };
  editProductSuggestions.value = [];
};

const saveEdit = async () => {
  editSaving.value = true;
  try {
    const totalAmount = editForm.value.lineItems.reduce((s: number, i: any) => s + (i.lineTotal || 0), 0) + (editForm.value.deliveryFee || 0) + (editForm.value.tollFee || 0);
    const res = await api.put(`/sales/${editSaleId.value}/admin-edit`, {
      ...editForm.value,
      totalAmount,
      adminPassword: editAdminPw.value
    });
    if (res.status >= 400) throw new Error(res.data?.error || 'Failed to save');
    $q.notify({ type: 'positive', message: 'Sale updated' });
    showEditDialog.value = false;
    await loadSales();
  } catch (e: any) {
    $q.notify({ type: 'negative', message: errMsg(e) });
  } finally {
    editSaving.value = false;
  }
};

const loading = ref(false);

const salesList = ref<any[]>([]);

const filters = ref({
  status: 'COMPLETED' as string | null,
  paymentFilter: null as string | null,
  startDate: null as string | null,
  endDate: null as string | null
});

const statusToggleOptions = [
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Draft', value: 'DRAFT' }
];

const paymentOptions = [
  { label: 'All', value: null },
  { label: 'Unpaid', value: 'UNPAID' },
  { label: 'Partial', value: 'PARTIAL' },
  { label: 'Paid', value: 'PAID' }
];

/* FIXED PAGINATION */
const pagination = ref({
  page: 1,
  rowsPerPage: 25,
  sortBy: 'saleDate',
  descending: true
});

const columns = [
  {
    name: 'drNumber',
    label: 'DR#',
    field: 'drNumber',
    align: 'left' as const,
    sortable: true
  },

  {
    name: 'saleDate',
    label: 'Date',
    field: 'saleDate',
    align: 'left' as const,
    sortable: true
  },

  {
    name: 'customerName',
    label: 'Customer',
    field: 'customerName',
    align: 'left' as const,
    sortable: true
  },

  {
    name: 'deliveryFee',
    label: 'Delivery',
    field: 'deliveryFee',
    align: 'right' as const
  },

  {
    name: 'tollFee',
    label: 'Toll',
    field: 'tollFee',
    align: 'right' as const
  },

  {
    name: 'totalAmount',
    label: 'Total Amount',
    field: 'totalAmount',
    align: 'right' as const,
    sortable: true
  },

  {
    name: 'status',
    label: 'Status',
    field: 'status',
    align: 'center' as const,
    sortable: true
  },

  {
    name: 'paymentStatus',
    label: 'Payment',
    field: '_paymentStatus',
    align: 'center' as const
  },

  {
    name: 'actions',
    label: 'Actions',
    field: 'actions',
    align: 'center' as const
  }
];

const getStore = async () => {
  if (!_store) {
    const { useSalesStore } = await import('../stores/salesStore');
    _store = useSalesStore();
  }

  return _store;
};

const fmtCur = (v: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(v || 0);

const fmtDate = (d: any) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '';

const statusClr = (s: string) => {
  switch (s) {
    case 'COMPLETED':
      return 'positive';

    case 'DRAFT':
      return 'warning';

    case 'CANCELLED':
      return 'negative';

    default:
      return 'grey';
  }
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const derivePaymentProgress = (
  saleTotal: number,
  payments: Array<{ amountDue?: number; totalPaid?: number; paymentDate?: string; createdAt?: string }>
) => {
  const grossTotal = round2(Number(saleTotal || 0));
  if (!payments || payments.length === 0) {
    return { paid: 0, effectiveDue: grossTotal, balance: grossTotal };
  }

  const sorted = [...payments].sort((a, b) => {
    const at = new Date(a.paymentDate || a.createdAt || 0).getTime();
    const bt = new Date(b.paymentDate || b.createdAt || 0).getTime();
    return at - bt;
  });

  let paidBefore = 0;
  let latestImpliedDue = 0;
  for (const p of sorted) {
    const rowPaid = Number(p.totalPaid || 0);
    const amountDue = Number(p.amountDue);
    if (rowPaid > 0 && Number.isFinite(amountDue) && amountDue >= 0) {
      latestImpliedDue = round2(amountDue + paidBefore);
    }
    paidBefore = round2(paidBefore + rowPaid);
  }

  const paid = round2(paidBefore);
  const effectiveDue = round2(latestImpliedDue > 0 ? Math.max(latestImpliedDue, paid) : Math.max(grossTotal, paid));
  const balance = round2(Math.max(0, effectiveDue - paid));
  return { paid, effectiveDue, balance };
};

const normalizeSalePayment = (
  sale: any,
  payments: Array<{ amountDue?: number; totalPaid?: number; paymentDate?: string; createdAt?: string }>
) => {
  if (!sale || sale.status !== 'COMPLETED') {
    return { ...sale, _paid: 0, _effectiveDue: Number(sale?.totalAmount || 0), _balance: 0, _paymentStatus: '', _unpaid: false };
  }

  const progress = derivePaymentProgress(Number(sale.totalAmount || 0), payments || []);
  const status = progress.paid <= 0.005 ? 'UNPAID' : progress.balance <= 0.005 ? 'PAID' : 'PARTIAL';
  return {
    ...sale,
    _paid: progress.paid,
    _effectiveDue: progress.effectiveDue,
    _balance: progress.balance,
    _paymentStatus: status,
    _unpaid: progress.balance > 0.005
  };
};

const paymentMeta = (sale: any) => {
  if (!sale || sale.status !== 'COMPLETED') {
    return { status: '', due: 0, paid: 0, balance: 0 };
  }

  const paid = round2(Number(sale._paid || 0));
  const fallbackDue = Number(sale.totalAmount || 0);
  const effectiveDue = Number.isFinite(Number(sale._effectiveDue)) ? Number(sale._effectiveDue) : fallbackDue;
  const due = round2(Math.max(0, effectiveDue));
  const balance = round2(Math.max(0, due - paid));

  if (paid <= 0.005) return { status: 'UNPAID', due, paid, balance };
  if (balance <= 0.005) return { status: 'PAID', due, paid, balance: 0 };
  return { status: 'PARTIAL', due, paid, balance };
};

const filteredSales = computed(() => {
  let list = salesList.value;

  // When searching, show results across ALL statuses (ignore status filter)
  if (searchQuery.value && searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(s => {
      const dr = String(s.drNumber || '').toLowerCase();
      const cust = String(s.customerName || '').toLowerCase();
      return dr.includes(q) || cust.includes(q);
    });
  } else {
    // No search — apply status filter normally
    if (filters.value.status) {
      list = list.filter(s => s.status === filters.value.status);
    }
  }

  if (filters.value.paymentFilter) {
    list = list.filter(s => paymentMeta(s).status === filters.value.paymentFilter);
  }
  return list;
});

let searchDebounceTimer: any = null;
const searchLoading = ref(false);
let lastSearchValue: string | null = null;
const onSearchInput = () => {
  // Don't reload if value hasn't actually changed
  const currentVal = searchQuery.value || '';
  if (currentVal === (lastSearchValue || '')) return;
  lastSearchValue = currentVal;

  searchLoading.value = true;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchLoading.value = false;
  }, 300);
};

// Debounced date filter change — prevents double-load on mount
let dateFilterTimer: any = null;
let dateFilterReady = false;
const onDateFilterChange = () => {
  if (!dateFilterReady) {
    // Skip initial emissions from Quasar on mount
    setTimeout(() => { dateFilterReady = true; }, 500);
    return;
  }
  clearTimeout(dateFilterTimer);
  dateFilterTimer = setTimeout(() => {
    loadSales();
  }, 300);
};

// AbortController to cancel stale requests when filters change rapidly
let currentLoadController: AbortController | null = null;

const loadSales = async (skipFilters = false) => {
  // Guard: if called from Vue event handlers, the first arg might be the event value (string/object)
  // Only treat as skipFilters if it's explicitly boolean true
  const shouldSkipFilters = skipFilters === true;
  // Cancel any in-flight request from a previous filter change
  if (currentLoadController) {
    currentLoadController.abort();
  }
  const controller = new AbortController();
  currentLoadController = controller;

  loading.value = true;

  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');

    const params: Record<string, string> = { limit: '200', page: '1' };
    // Always fetch all statuses — status filtering is done client-side in filteredSales
    // Only apply date filters to the backend query
    if (!shouldSkipFilters) {
      if (filters.value.startDate) params.startDate = filters.value.startDate;
      if (filters.value.endDate) params.endDate = filters.value.endDate;
    }

    // Fetch first page
    const queryStr = new URLSearchParams(params).toString();
    // #region debug-point D:sales-request
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'web-proxy-404',
        runId: 'post-fix',
        hypothesisId: 'D',
        location: 'frontend/src/pages/SalesList.vue:loadSales-request',
        msg: '[DEBUG] sales list request starting',
        data: {
          href: typeof window !== 'undefined' ? window.location.href : null,
          apiUrl: API_URL,
          requestUrl: `${API_URL}/api/sales?${queryStr}`,
          hasToken: !!token,
          params,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const res = await fetch(`${API_URL}/api/sales?${queryStr}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal
    });
    // #region debug-point D:sales-response
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'web-proxy-404',
        runId: 'post-fix',
        hypothesisId: 'D',
        location: 'frontend/src/pages/SalesList.vue:loadSales-response',
        msg: '[DEBUG] sales list first response received',
        data: {
          status: res.status,
          ok: res.ok,
          requestUrl: `${API_URL}/api/sales?${queryStr}`,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!res.ok) throw new Error('Failed to fetch sales');
    const payload = await res.json();
    let allSales: any[] = payload.data || payload.sales || (Array.isArray(payload) ? payload : []);

    // Check if this request was cancelled while waiting for response
    if (controller.signal.aborted) return;

    let totalPages = 1;
    if (payload.total && payload.limit) {
      totalPages = Math.ceil(payload.total / payload.limit);
    }

    // Show first page immediately — user sees data right away
    for (const sale of allSales) {
      sale._paid = Number(sale._paid || 0);
      sale._paymentStatus = sale._paymentStatus || '';
      sale._unpaid = false;
      sale._effectiveDue = Number((sale._effectiveDue ?? sale.totalAmount) || 0);
      sale._balance = Number(sale._balance || 0);
    }
    salesList.value = allSales;
    loading.value = false;
    loadingMore.value = totalPages > 1;

    // Fetch remaining pages in background
    if (totalPages > 1) {
      for (let p = 2; p <= totalPages; p++) {
        if (controller.signal.aborted) return; // Stop if filters changed
        const nextParams = new URLSearchParams({ ...params, page: String(p) }).toString();
        const nextRes = await fetch(`${API_URL}/api/sales?${nextParams}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        if (nextRes.ok) {
          const nextPayload = await nextRes.json();
          const nextSales = nextPayload.data || nextPayload.sales || [];
          for (const sale of nextSales) {
            sale._paid = Number(sale._paid || 0);
            sale._paymentStatus = sale._paymentStatus || '';
            sale._unpaid = false;
            sale._effectiveDue = Number((sale._effectiveDue ?? sale.totalAmount) || 0);
            sale._balance = Number(sale._balance || 0);
          }
          allSales = allSales.concat(nextSales);
          if (!controller.signal.aborted) {
            salesList.value = [...allSales];
          }
        }
      }
    }

    // Recompute payment status from payment records to avoid stale backend status/balance.
    if (!controller.signal.aborted && allSales.length > 0) {
      try {
        const saleIds = new Set(allSales.map((s: any) => String(s._id || '')));
        const payRes = await fetch(`${API_URL}/api/payments`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        if (payRes.ok) {
          const payPayload = await payRes.json();
          const allPayments = Array.isArray(payPayload)
            ? payPayload
            : (Array.isArray(payPayload?.data) ? payPayload.data : (Array.isArray(payPayload?.payments) ? payPayload.payments : []));

          const paymentMap: Record<string, Array<{ amountDue?: number; totalPaid?: number; paymentDate?: string; createdAt?: string }>> = {};
          for (const p of allPayments) {
            const sid = String(p?.saleId?._id || p?.saleId || '');
            if (!sid || !saleIds.has(sid)) continue;
            if (!paymentMap[sid]) paymentMap[sid] = [];
            paymentMap[sid].push({
              amountDue: typeof p.amountDue === 'number' ? p.amountDue : undefined,
              totalPaid: Number(p.totalPaid || 0),
              paymentDate: p.paymentDate,
              createdAt: p.createdAt
            });
          }

          const normalized = allSales.map((sale: any) => normalizeSalePayment(sale, paymentMap[String(sale._id || '')] || []));
          if (!controller.signal.aborted) {
            salesList.value = normalized;
          }
        }
      } catch {
        // Keep existing rows if payments API fails.
      }
    }

    if (controller.signal.aborted) return;
    loadingMore.value = false;

  } catch (error: any) {
    if (error.name === 'AbortError') return; // Cancelled — ignore
    console.error('Failed to load sales:', error);
    // DON'T clear salesList on error — keep whatever data we already have
  } finally {
    if (!controller.signal.aborted) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
};


const viewSale = async (sale: any) => {
  const store = await getStore();

  selectedSale.value =
    await store.getSaleById(sale._id);

  showViewDialog.value = true;
};

const closeView = () => {
  showViewDialog.value = false;
  selectedSale.value = null;
};

const onPaid = () => {
  closeView();
  loadSales();
};

const postSale = async (sale: any) => {
  $q.dialog({
    title: 'Post Sale',
    message: `Post ${sale.drNumber}? Stock will be reduced.`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      const store = await getStore();

      await store.postSale(sale._id);

      $q.notify({
        type: 'positive',
        message: 'Sale posted'
      });

      await loadSales();
    } catch (e: any) {
      $q.notify({
        type: 'negative',
        message: errMsg(e)
      });
    }
  });
};

const confirmDelete = (sale: any) => {
  $q.dialog({
    title: 'Delete Sale',
    message: `Delete ${sale.drNumber}?`,
    cancel: true,
    persistent: true,
    prompt: {
      model: '',
      type: 'password',
      label: 'Admin Password',
      isValid: (v: string) => v.length > 0
    }
  }).onOk(async (pw: string) => {
    try {
      const store = await getStore();

      await store.deleteSale(sale._id, pw);

      $q.notify({
        type: 'positive',
        message: 'Deleted'
      });

      await loadSales();
    } catch (e: any) {
      $q.notify({
        type: 'negative',
        message: errMsg(e)
      });
    }
  });
};

const editSale = (sale: any) => {
  $q.dialog({
    title: 'Admin Password Required',
    message: `Edit sale ${sale.drNumber}? Enter admin password.`,
    prompt: { model: '', type: 'password', label: 'Admin Password', isValid: (v: string) => v.length > 0 },
    cancel: true,
    persistent: true
  }).onOk(async (pw: string) => {
    try {
      const store = await getStore();
      const fullSale = await store.getSaleById(sale._id);
      editSaleId.value = sale._id;
      editAdminPw.value = pw;

      // Load products for search (use productStore to avoid huge single-request payloads)
      try {
        const { useProductStore } = await import('../stores/productStore');
        const productStore = useProductStore();
        const pRes = await productStore.fetchProducts({ limit: 1000 });
        editAllProducts.value = pRes?.products || [];
      } catch (err) {
        console.error('Failed to load products for edit dialog', err);
        editAllProducts.value = [];
      }

      editForm.value = {
        drNumber: fullSale.drNumber,
        customerName: fullSale.customerName,
        customerId: fullSale.customerId?._id || fullSale.customerId,
        saleDate: new Date(fullSale.saleDate).toISOString().split('T')[0],
        documentType: fullSale.documentType || 'DR',
        deliveryFee: fullSale.deliveryFee || 0,
        tollFee: fullSale.tollFee || 0,
        notes: fullSale.notes || '',
        lineItems: fullSale.lineItems.map((i: any) => {
          const pid = i.productId?._id || i.productId;
          const product = editAllProducts.value.find((p: any) => p._id === pid);
          let uomName = i.uom || '';
          if (!uomName && product) {
            if (i.sellingUomId && product.sellingUoms?.length) {
              const su = product.sellingUoms.find((s: any) => (s.uomId?._id || s.uomId)?.toString() === i.sellingUomId?.toString());
              uomName = su?.uomAbbreviation || product.uom || '';
            } else {
              uomName = product.uom || '';
            }
          }
          return {
            productId: pid,
            description: i.description,
            uom: uomName,
            quantity: i.quantity,
            sellingPrice: i.sellingPrice,
            discount: i.discount || 0,
            lineTotal: i.lineTotal,
            conversionFactor: i.conversionFactor || 1
          };
        })
      };

      // Load customers
      try {
        const custRes = await api.get('/customers');
        allEditCustomers.value = custRes.data || [];
      } catch { /* silent */ }
      editCustomerOptions.value = allEditCustomers.value;
      editCustomerSelected.value = allEditCustomers.value.find((c: any) => c._id === editForm.value.customerId) || { _id: '', name: fullSale.customerName };
      editNewItem.value = { search: '', description: '', productId: '', qty: 1, price: 0, discount: 0, uom: '', uomOptions: [] };
      editProductSuggestions.value = [];
      showEditDialog.value = true;
    } catch (e: any) {
      $q.notify({ type: 'negative', message: errMsg(e) });
    }
  });
};

const continueDraft = (sale: any) => {
  try {
    localStorage.setItem('sales_edit', JSON.stringify({ id: sale._id }));
    router.push('/sales/new');
  } catch (e) {
    console.error('Failed to continue draft:', e);
    $q.notify({ type: 'negative', message: 'Failed to continue draft' });
  }
};

const returnItems = (sale: any) => {
  console.log('Return items', sale);
};

const confirmPrint = async () => {
  printing.value = true;
  try {
    const sDate = printStartDate.value || filters.value.startDate;
    const eDate = printEndDate.value || filters.value.endDate;

    // Use already-loaded data — no need to fetch again
    let sales = [...salesList.value];

    // Apply date filter if print dates differ from page filters
    if (sDate) {
      const start = new Date(sDate);
      sales = sales.filter(s => new Date(s.saleDate) >= start);
    }
    if (eDate) {
      const end = new Date(eDate);
      sales = sales.filter(s => new Date(s.saleDate) <= end);
    }

    const filteredForPrint = sales.filter((s: any) => {
      if (printPaymentFilter.value && paymentMeta(s).status !== printPaymentFilter.value) return false;
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        const dr = (s.drNumber || '').toString().toLowerCase();
        const cust = (s.customerName || s.customerId?.name || '').toString().toLowerCase();
        if (!dr.includes(q) && !cust.includes(q)) return false;
      }
      return true;
    });

    let rows = '';
    let totalAmount = 0; let totalPaid = 0; let totalBalance = 0;
    filteredForPrint.forEach((s: any, idx: number) => {
      const meta = paymentMeta(s);
      const amt = meta.due || 0;
      const paid = meta.paid || 0;
      const balance = meta.balance || 0;
      totalAmount += amt; totalPaid += paid; totalBalance += balance > 0 ? balance : 0;
      const hasBalance = balance > 0.01;
      const rowStyle = hasBalance ? 'color:#c62828;background:#fff5f5' : '';
      const date = s.saleDate ? new Date(s.saleDate).toLocaleDateString('en-PH') : '';
      const modeTxt = s._modeOfPayment || (paid > 0.005 ? (hasBalance ? 'PARTIAL' : 'PAID') : 'UNPAID') || '—';
      rows += `<tr style="${rowStyle}"><td style="text-align:center">${idx+1}</td><td>${date}</td><td>${s.drNumber||''}</td><td>${s.customerName||s.customerId?.name||'Walk-in'}</td><td style="text-align:right">P${amt.toFixed(2)}</td><td style="text-align:right">P${paid.toFixed(2)}</td><td>${modeTxt}</td><td style="text-align:right;font-weight:${hasBalance?'bold':'normal'}">${hasBalance?'P'+balance.toFixed(2):''}</td></tr>`;
    });

    const period = `${sDate || 'All'} to ${eDate || 'All'}`;
    const filterLabel = printPaymentFilter.value ? ` | Payment: ${printPaymentFilter.value}` : '';
    const html = `<!DOCTYPE html><html><head><title>Sales Summary</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:15px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 6px;font-size:11px}th{background:#f0f0f0;font-weight:bold}.header{text-align:center;margin-bottom:8px}.total-row{font-weight:bold;font-size:12px;background:#f0f0f0}.print-btn{text-align:center;margin:10px 0}@media print{body{margin:0}.print-btn{display:none}}</style></head><body><div class="header"><h2 style="margin:0">Aberin Hardware</h2><p style="margin:2px 0">Sales Summary Report</p><p style="margin:2px 0;font-size:11px">Period: ${period}${filterLabel} | Count: ${filteredForPrint.length}</p></div><table><thead><tr><th>No.</th><th>Date</th><th>DR#</th><th>Customer</th><th>Total Amount</th><th>Payments</th><th>Mode of Payment</th><th>Balance</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="total-row"><td colspan="4" style="text-align:right">OVERALL TOTAL:</td><td style="text-align:right">P${totalAmount.toFixed(2)}</td><td style="text-align:right">P${totalPaid.toFixed(2)}</td><td></td><td style="text-align:right;color:#c62828">P${totalBalance.toFixed(2)}</td></tr></tfoot></table><div class="print-btn"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">Print</button></div></body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    showPrintDialog.value = false;
  } catch (e) {
    console.error('Failed to print sales summary:', e);
    $q.notify({ type: 'negative', message: 'Failed to print: ' + ((e as any)?.message || (e as any)) });
  } finally {
    printing.value = false;
  }
};

onMounted(async () => {
  await loadSales();

  const payForId = route.query.payFor as string;

  if (payForId) {
    try {
      const store = await getStore();

      const sale =
        await store.getSaleById(payForId);

      if (sale) {
        selectedSale.value = sale;
        showViewDialog.value = true;
      }
    } catch {
      //
    }
  }
});
</script>

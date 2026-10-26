﻿<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Delivery Receipts</h5>
        </div>
        <div class="col-auto">
          <q-btn color="primary" label="Create Delivery Receipt" icon="add" @click="createDelivery" />
        </div>
      </div>

      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-6 col-md-3">
          <q-select v-model="statusFilter" :options="statusOptions" label="Status" outlined dense clearable @update:model-value="loadDeliveryReceipts" />
        </div>
        <div class="col-6 col-md-3">
          <q-select v-model="paymentFilter" :options="paymentOptions" label="Payment" outlined dense clearable emit-value map-options @update:model-value="loadDeliveryReceipts" />
        </div>
        <div class="col-6 col-md-3">
          <q-input v-model="startDate" label="Start Date" outlined dense type="date" clearable @update:model-value="loadDeliveryReceipts" />
        </div>
        <div class="col-6 col-md-3">
          <q-input v-model="endDate" label="End Date" outlined dense type="date" clearable @update:model-value="loadDeliveryReceipts" />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="searchQuery" outlined dense placeholder="Search vendor name / DR number..." clearable>
            <template v-slot:prepend><q-icon name="search" /></template>
          </q-input>
        </div>
      </div>

      <q-table :rows="filteredDeliveries" :columns="columns" row-key="_id" :loading="loading" flat bordered :pagination="{ rowsPerPage: 25, sortBy: 'deliveryDate', descending: true }">
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-badge :color="getStatusColor(props.row.status)">{{ props.row.status }}</q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-paymentStatus="props">
          <q-td :props="props">
            <q-badge :color="(props.row.paymentStatus || 'UNPAID') === 'PAID' ? 'positive' : (props.row.paymentStatus || 'UNPAID') === 'PARTIAL' ? 'orange' : 'negative'">{{ props.row.paymentStatus || 'UNPAID' }}</q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense round icon="visibility" color="primary" @click="viewDelivery(props.row)" />
            <q-btn flat dense round icon="edit" color="primary" @click="editDelivery(props.row)" />
            <q-btn v-if="props.row.status === 'PENDING'" flat dense round icon="check_circle" color="positive" @click="confirmPost(props.row)">
              <q-tooltip>Post Delivery</q-tooltip>
            </q-btn>
            <q-btn flat dense round icon="delete" color="negative" @click="confirmDelete(props.row)" />
            <q-btn v-if="props.row.status === 'POSTED'" flat dense round icon="payment" color="teal" @click="openPayDialog(props.row)">
              <q-tooltip>Pay Vendor</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <q-dialog v-model="showViewDialog" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">Delivery Details — {{ selectedDelivery?.drNumber || 'N/A' }}</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showViewDialog = false" />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-3"><q-input :model-value="selectedDelivery?.drNumber || ''" label="DR Number" outlined dense readonly /></div>
            <div class="col-12 col-md-3"><q-input :model-value="selectedDelivery?.siNumber || ''" label="SI Number" outlined dense readonly /></div>
            <div class="col-12 col-md-3"><q-input :model-value="selectedDelivery?.deliveryDate ? new Date(selectedDelivery.deliveryDate).toLocaleDateString() : ''" label="Date" outlined dense readonly /></div>
            <div class="col-12 col-md-3"><q-input :model-value="selectedDelivery?.vendorName || ''" label="Vendor" outlined dense readonly /></div>
            <div class="col-12 col-md-3"><q-input :model-value="`P${Number(selectedDelivery?.totalAmount || 0).toFixed(2)}`" label="Total Amount" outlined dense readonly /></div>
            <div class="col-12 col-md-3"><q-input :model-value="selectedDelivery?.status || ''" label="Status" outlined dense readonly /></div>
            <div class="col-12 col-md-3"><q-input :model-value="selectedDelivery?.paymentStatus || 'UNPAID'" label="Payment" outlined dense readonly /></div>
          </div>

          <q-table
            :rows="selectedDelivery?.lineItems || []"
            :columns="viewColumns"
            row-key="_id"
            flat
            bordered
            dense
            :loading="viewLoading"
            :pagination="{ rowsPerPage: 25 }"
          >
            <template v-slot:body-cell-unitCost="props">
              <q-td :props="props">P{{ Number(props.row.unitCost || 0).toFixed(2) }}</q-td>
            </template>
            <template v-slot:body-cell-netCost="props">
              <q-td :props="props">P{{ Number((props.row.netCost ?? props.row.unitCost) || 0).toFixed(2) }}</q-td>
            </template>
            <template v-slot:body-cell-lineTotal="props">
              <q-td :props="props" class="text-weight-bold">P{{ (Number(props.row.quantityReceived || 0) * Number((props.row.netCost ?? props.row.unitCost) || 0)).toFixed(2) }}</q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Vendor Payment Dialog â€” Split Bills (like POS) -->
    <q-dialog v-model="showPayDialog" persistent maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6 text-teal">Pay Vendor â€” DR {{ payDR?.drNumber }}</div>
          <q-space />
          <div class="text-h5 text-weight-bold text-positive">P{{ payDRBalance.toFixed(2) }}</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showPayDialog = false" />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-3"><q-input :model-value="'P' + (payDR?.totalAmount || 0).toFixed(2)" label="Total" outlined dense readonly bg-color="grey-2" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="'P' + (payDR?.amountPaid || 0).toFixed(2)" label="Already Paid" outlined dense readonly bg-color="grey-2" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="'P' + payDRBalance.toFixed(2)" label="Amount Due" outlined dense readonly bg-color="amber-1" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="'P' + payListTotalPaid.toFixed(2)" label="Paying Now" outlined dense readonly bg-color="green-1" /></div>
          </div>

          <!-- Cash -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="payForm.cashEnabled" label="Cash" /></div>
              <div class="col-3" v-if="payForm.cashEnabled"><q-input v-model.number="payForm.cashAmount" label="Cash Amount" type="number" outlined dense prefix="P" /></div>
            </div>
          </q-card-section></q-card>

          <!-- Check/Bank -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="payForm.checkEnabled" label="Check/Bank" /></div>
              <div class="col-2" v-if="payForm.checkEnabled"><q-input v-model.number="payForm.checkAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
              <div class="col-2" v-if="payForm.checkEnabled"><q-select v-model="payForm.checkBank" :options="['BPI','AUB','BDO','Metrobank','Landbank','PNB','Other']" label="Bank" outlined dense /></div>
              <div class="col-2" v-if="payForm.checkEnabled"><q-input v-model="payForm.checkNumber" label="Effective Date" type="date" outlined dense /></div>
            </div>
          </q-card-section></q-card>

          <!-- Online -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="payForm.onlineEnabled" label="Online" /></div>
              <div class="col-2" v-if="payForm.onlineEnabled"><q-input v-model.number="payForm.onlineAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
              <div class="col-2" v-if="payForm.onlineEnabled"><q-select v-model="payForm.onlineChannel" :options="['GCash','BPI Online','AUB Online','Maya','Other']" label="Channel" outlined dense /></div>
              <div class="col-2" v-if="payForm.onlineEnabled"><q-input v-model="payForm.onlineRefNo" label="Reference No." outlined dense /></div>
            </div>
          </q-card-section></q-card>

          <q-banner v-if="payListTotalPaid > 0 && payListTotalPaid < payDRBalance" class="bg-orange-1 q-mt-sm" rounded>
            <template v-slot:avatar><q-icon name="info" color="orange" /></template>
            Partial payment of P{{ payListTotalPaid.toFixed(2) }}. Remaining P{{ (payDRBalance - payListTotalPaid).toFixed(2) }} will be balance.
          </q-banner>

          <q-input v-model="payForm.notes" label="Notes" outlined dense class="q-mt-sm" />
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" @click="showPayDialog = false" />
          <q-btn unelevated label="Record Payment" color="teal" icon="check" @click="submitPayment" :loading="paying" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { currentYearRange } from '../utils/date';

const $q = useQuasar();
const router = useRouter();
const errMsg = (e: any): string => {
  // Check for server response first
  const data = e?.response?.data || e?.cause?.response?.data;
  const serverMsg = typeof data === 'string' ? data : (data?.error || data?.message);
                   
  // If it's a generic "Failed to post..." error from the store, but we have a more specific server message, use that.
  const message = serverMsg || e?.message || 'Unknown error';
  
  // Log detailed error to console for debugging the 400 Bad Request
  if (e?.response || e?.cause?.response) {
    console.error('Server error details:', data);
  }
  
  return message;
};
let _store: any = null;

const statusFilter = ref(null);
const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const loading = ref(false);
const showPayDialog = ref(false);
const showViewDialog = ref(false);
const viewLoading = ref(false);
const payDR = ref<any>(null);
const selectedDelivery = ref<any>(null);
const payForm = ref({
  cashEnabled: true, cashAmount: 0,
  checkEnabled: false, checkAmount: 0, checkBank: '', checkNumber: '',
  onlineEnabled: false, onlineAmount: 0, onlineChannel: '', onlineRefNo: '',
  notes: ''
});
const paying = ref(false);

const payDRBalance = computed(() => {
  if (!payDR.value) return 0;
  return Math.max(0, (payDR.value.totalAmount || 0) - (payDR.value.amountPaid || 0));
});

const payListTotalPaid = computed(() => {
  let total = 0;
  if (payForm.value.cashEnabled) total += payForm.value.cashAmount || 0;
  if (payForm.value.checkEnabled) total += payForm.value.checkAmount || 0;
  if (payForm.value.onlineEnabled) total += payForm.value.onlineAmount || 0;
  return total;
});
const statusOptions = ['PENDING', 'POSTED'];
const paymentOptions = [{ label: 'All', value: null }, { label: 'Unpaid', value: 'UNPAID' }, { label: 'Partial', value: 'PARTIAL' }, { label: 'Paid', value: 'PAID' }];
const paymentFilter = ref<string | null>(null);
const searchQuery = ref('');
const deliveryReceipts = ref<any[]>([]);

const filteredDeliveries = computed(() => {
  let list = deliveryReceipts.value;
  if (paymentFilter.value) list = list.filter((dr: any) => (dr.paymentStatus || 'UNPAID') === paymentFilter.value);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((dr: any) =>
      dr.drNumber?.toLowerCase().includes(q) ||
      dr.vendorName?.toLowerCase().includes(q)
    );
  }
  return list;
});

const columns = [
  { name: 'drNumber', label: 'DR Number', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'siNumber', label: 'SI Number', field: 'siNumber', align: 'left' as const, sortable: true },
  { name: 'deliveryDate', label: 'Date', field: 'deliveryDate', align: 'left' as const, sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'vendor', label: 'Vendor', field: 'vendorName', align: 'left' as const, sortable: true },
  { name: 'totalAmount', label: 'Total Amount', field: 'totalAmount', align: 'right' as const, sortable: true, format: (val: number) => typeof val === 'number' ? `P${val.toFixed(2)}` : 'P0.00' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const, sortable: true },
  { name: 'paymentStatus', label: 'Payment', field: 'paymentStatus', align: 'center' as const, sortable: true, format: (val: string) => val || 'UNPAID' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const }
];

const viewColumns = [
  { name: 'code', label: 'Code', field: 'code', align: 'left' as const },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center' as const },
  { name: 'quantityReceived', label: 'Qty', field: 'quantityReceived', align: 'right' as const },
  { name: 'unitCost', label: 'Unit Cost', field: 'unitCost', align: 'right' as const },
  { name: 'netCost', label: 'Net Cost', field: 'netCost', align: 'right' as const },
  { name: 'lineTotal', label: 'Line Total', field: 'lineTotal', align: 'right' as const }
];

const getStore = async () => {
  if (!_store) {
    const { useDeliveryStore } = await import('../stores/deliveryStore');
    _store = useDeliveryStore();
  }
  return _store;
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = { PENDING: 'warning', POSTED: 'positive' };
  return colors[status] || 'grey';
};

const loadDeliveryReceipts = async () => {
  loading.value = true;
  try {
    const store = await getStore();
    const filters: any = {};
    if (statusFilter.value) filters.status = statusFilter.value;
    if (startDate.value) filters.startDate = startDate.value;
    if (endDate.value) filters.endDate = endDate.value;
    await store.fetchDeliveryReceipts(filters);
    deliveryReceipts.value = store.deliveryReceipts;
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to load delivery receipts: ' + errMsg(error) });
  } finally {
    loading.value = false;
  }
};

const createDelivery = () => { router.push('/deliveries/new'); };
const viewDelivery = async (delivery: any) => {
  selectedDelivery.value = delivery;
  showViewDialog.value = true;

  // If list payload did not include line items, fetch full DR detail lazily.
  if (!Array.isArray(delivery?.lineItems) || delivery.lineItems.length === 0) {
    viewLoading.value = true;
    try {
      const store = await getStore();
      const full = await store.getDeliveryReceiptById(delivery._id);
      selectedDelivery.value = { ...delivery, ...full };
    } catch (error) {
      $q.notify({ type: 'warning', message: 'Unable to load full details. Showing available data only.' });
    } finally {
      viewLoading.value = false;
    }
  }
};
const editDelivery = (delivery: any) => { router.push(`/deliveries/${delivery._id}/edit`); };

const confirmPost = (delivery: any) => {
  $q.dialog({
    title: 'Confirm Post',
    message: `Are you sure you want to post delivery receipt "${delivery.drNumber}"? This will update inventory and cannot be undone.`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      const store = await getStore();
      await store.postDeliveryReceipt(delivery._id);
      $q.notify({ type: 'positive', message: 'Delivery receipt posted successfully' });
      await loadDeliveryReceipts();
    } catch (error: any) {
      console.error('Post delivery error details:', error?.response?.data || error);
      const message = errMsg(error);
      $q.dialog({
        title: 'Unable to Post Delivery',
        message: message || 'Unknown posting error',
        ok: { label: 'OK', color: 'primary' },
        persistent: true
      });
    }
  });
};

const confirmDelete = (delivery: any) => {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete delivery receipt "${delivery.drNumber}"?`,
    cancel: true,
    persistent: true,
    prompt: { model: '', type: 'password', label: 'Admin Password', isValid: (val: string) => val.length > 0 }
  }).onOk(async (adminPassword: string) => {
    try {
      const store = await getStore();
      await store.deleteDeliveryReceipt(delivery._id, adminPassword);
      $q.notify({ type: 'positive', message: 'Delivery receipt deleted successfully' });
      await loadDeliveryReceipts();
    } catch (error) {
      $q.notify({ type: 'negative', message: 'Failed to delete delivery receipt: ' + errMsg(error) });
    }
  });
};

const openPayDialog = (dr: any) => {
  payDR.value = dr;
  // Calculate total if not set
  if (!dr.totalAmount) {
    dr.totalAmount = (dr.lineItems || []).reduce((s: number, i: any) => s + ((i.quantityReceived || 0) * (i.netCost || i.unitCost || 0)), 0);
  }
  const balance = Math.max(0, (dr.totalAmount || 0) - (dr.amountPaid || 0));
  payForm.value = {
    cashEnabled: true, cashAmount: balance,
    checkEnabled: false, checkAmount: 0, checkBank: '', checkNumber: '',
    onlineEnabled: false, onlineAmount: 0, onlineChannel: '', onlineRefNo: '',
    notes: ''
  };
  showPayDialog.value = true;
};

const submitPayment = async () => {
  if (!payDR.value) return;
  const totalPay = payListTotalPaid.value;
  if (totalPay <= 0) { $q.notify({ type: 'warning', message: 'Enter payment amount' }); return; }
  paying.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    // Send each payment method separately
    if (payForm.value.cashEnabled && payForm.value.cashAmount > 0) {
      const res = await fetch(`${API_URL}/api/deliveries/${payDR.value._id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payForm.value.cashAmount, method: 'CASH', notes: payForm.value.notes || 'Cash payment' })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
    }
    if (payForm.value.checkEnabled && payForm.value.checkAmount > 0) {
      const res = await fetch(`${API_URL}/api/deliveries/${payDR.value._id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payForm.value.checkAmount, method: 'CHECK', effectiveDate: payForm.value.checkNumber || undefined, notes: payForm.value.notes || 'Check payment' })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
    }
    if (payForm.value.onlineEnabled && payForm.value.onlineAmount > 0) {
      const res = await fetch(`${API_URL}/api/deliveries/${payDR.value._id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payForm.value.onlineAmount, method: 'ONLINE', reference: `${payForm.value.onlineChannel || ''} ${payForm.value.onlineRefNo || ''}`.trim(), notes: payForm.value.notes || 'Online payment' })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
    }
    $q.notify({ type: 'positive', message: 'Payment recorded' });
    showPayDialog.value = false;
    await loadDeliveryReceipts();
  } catch (e: any) { 
    console.error('Payment recording error:', e);
    $q.notify({ type: 'negative', message: 'Payment failed: ' + errMsg(e) }); 
  }
  finally { paying.value = false; }
};

onMounted(() => { loadDeliveryReceipts(); });
</script>

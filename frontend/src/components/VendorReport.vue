<template>
  <q-page padding>
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Vendor Report</h4>

      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-select v-model="selectedVendor" :options="vendorOptions" label="Vendor (All)" outlined dense option-value="value" option-label="label" emit-value map-options clearable @update:model-value="() => loadReport({ resetPage: true })" />
            </div>
            <div class="col-6 col-md-2"><q-input v-model="startDate" label="Start Date" type="date" outlined dense clearable @update:model-value="() => loadReport({ resetPage: true })" /></div>
            <div class="col-6 col-md-2"><q-input v-model="endDate" label="End Date" type="date" outlined dense clearable @update:model-value="() => loadReport({ resetPage: true })" /></div>
            <div class="col-6 col-md-2">
              <q-select v-model="paymentFilter" :options="paymentFilterOptions" label="Payment" outlined dense clearable emit-value map-options @update:model-value="() => loadReport({ resetPage: true })" />
            </div>
            <div class="col-6 col-md-3 flex items-end"><q-btn label="Generate" color="primary" @click="loadReport({ resetPage: true })" :loading="loading" class="full-width" /></div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Summary -->
      <div v-if="report" class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-4"><q-card flat bordered><q-card-section><div class="text-h6">Total Deliveries</div><div class="text-h4 text-primary">{{ fmtCur(report.grandTotal) }}</div></q-card-section></q-card></div>
        <div class="col-12 col-md-4"><q-card flat bordered><q-card-section><div class="text-h6">Total Paid</div><div class="text-h4 text-positive">{{ fmtCur(report.totalPaid) }}</div></q-card-section></q-card></div>
        <div class="col-12 col-md-4"><q-card flat bordered><q-card-section><div class="text-h6">Balance</div><div class="text-h4 text-negative">{{ fmtCur(report.totalBalance) }}</div></q-card-section></q-card></div>
      </div>

      <!-- Deliveries Table -->
      <q-card v-if="report" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6 q-mb-md">Delivery Receipts ({{ report.count }})</div>
          <q-table :rows="filteredDeliveries" :columns="columns" row-key="_id" flat bordered dense selection="multiple" v-model:selected="selectedForPay" v-model:pagination="pagination" @request="onRequest">
            <template v-slot:body-cell-deliveryDate="props"><q-td :props="props">{{ new Date(props.row.deliveryDate).toLocaleDateString('en-PH') }}</q-td></template>
            <template v-slot:body-cell-totalAmount="props"><q-td :props="props">{{ fmtCur(props.row.totalAmount) }}</q-td></template>
            <template v-slot:body-cell-amountPaid="props"><q-td :props="props" class="text-positive">{{ fmtCur(props.row.amountPaid) }}</q-td></template>
            <template v-slot:body-cell-balance="props">
              <q-td :props="props"><span :class="props.row.balance > 0 ? 'text-negative text-weight-bold' : ''">{{ fmtCur(props.row.balance) }}</span></q-td>
            </template>
            <template v-slot:body-cell-paymentStatus="props">
              <q-td :props="props"><q-badge :color="props.row.paymentStatus === 'PAID' ? 'positive' : props.row.paymentStatus === 'PARTIAL' ? 'orange' : 'negative'">{{ props.row.paymentStatus }}</q-badge></q-td>
            </template>
            <template v-slot:body-cell-actions="props">
              <q-td :props="props">
                <q-btn flat dense icon="payment" color="teal" size="sm" @click="payDelivery(props.row)" v-if="props.row.paymentStatus !== 'PAID'"><q-tooltip>Pay</q-tooltip></q-btn>
              </q-td>
            </template>
          </q-table>
          <div class="row justify-between items-center q-mt-sm">
            <div>
              <q-btn flat color="primary" label="Select All Unpaid" @click="selectAllUnpaid" class="q-mr-sm" />
              <q-btn flat label="Clear" @click="selectedForPay = []" />
            </div>
            <div class="text-h6 text-negative">Selected: {{ fmtCur(selectedForPay.reduce((s, r) => s + (r.balance || 0), 0)) }}</div>
            <q-btn unelevated color="teal" icon="payment" label="Pay Selected" @click="payBulk" :disable="selectedForPay.length === 0" />
          </div>
        </q-card-section>
      </q-card>

      <div v-if="report" class="q-mt-md row q-gutter-sm print-hide">
        <q-btn label="Print Report" color="deep-purple" outline icon="print" @click="printReport" />
        <q-btn
          v-if="selectedForPay.length > 0"
          label="Print Selected DRs"
          color="teal"
          icon="print"
          @click="printSelectedDRs"
        >
          <q-badge color="orange" floating>{{ selectedForPay.length }}</q-badge>
        </q-btn>
      </div>
    </div>

    <!-- Pay Dialog -->
    <q-dialog v-model="showPay" persistent>
      <q-card style="min-width:420px; max-width:760px; width:100%;">
        <q-card-section class="row items-center">
          <div class="text-h6 text-teal">Payment for {{ payRow?.drNumber }}</div>
          <q-space />
          <div class="text-h5 text-positive">{{ fmtCur(payRow?.balance || 0) }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-3"><q-input v-model="paymentDate" label="Payment Date" type="date" outlined dense /></div>
            <div class="col-12 col-md-3"><q-input :model-value="fmtCur(payRow?.balance || 0)" label="Amount Due" outlined dense readonly bg-color="amber-1" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="fmtCur(paymentTotalPaid)" label="Total Paid" outlined dense readonly bg-color="green-1" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="fmtCur(paymentBalance)" label="Balance" outlined dense readonly :bg-color="paymentBalance > 0 ? 'red-1' : 'green-1'" /></div>
          </div>

          <q-card flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <div class="row q-col-gutter-md items-center">
                <div class="col-auto"><q-checkbox v-model="paymentSplit.cashEnabled" label="Cash" /></div>
                <div class="col-4" v-if="paymentSplit.cashEnabled"><q-input v-model.number="paymentSplit.cashAmount" label="Cash Amount" type="number" outlined dense prefix="P" /></div>
                <div class="col-4" v-if="paymentSplit.cashEnabled"><q-input :model-value="fmtCur(Math.max(0, (paymentSplit.cashAmount || 0) - (payRow?.balance || 0)))" label="Change" outlined dense readonly bg-color="green-1" /></div>
              </div>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <div class="row q-col-gutter-md items-center">
                <div class="col-auto"><q-checkbox v-model="paymentSplit.checkEnabled" label="Check/Bank" /></div>
                <div class="col-3" v-if="paymentSplit.checkEnabled"><q-input v-model.number="paymentSplit.checkAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
                <div class="col-3" v-if="paymentSplit.checkEnabled"><q-select v-model="paymentSplit.checkBank" :options="['BPI','AUB','BDO','Metrobank','Landbank','PNB','Other']" label="Bank" outlined dense /></div>
                <div class="col-3" v-if="paymentSplit.checkEnabled"><q-input v-model="paymentSplit.checkNumber" label="Effective Date" type="date" outlined dense /></div>
                <div class="col-3" v-if="paymentSplit.checkEnabled"><q-input v-model="paymentSplit.checkAccountName" label="Account Number" outlined dense /></div>
              </div>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <div class="row q-col-gutter-md items-center">
                <div class="col-auto"><q-checkbox v-model="paymentSplit.onlineEnabled" label="Online" /></div>
                <div class="col-3" v-if="paymentSplit.onlineEnabled"><q-input v-model.number="paymentSplit.onlineAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
                <div class="col-3" v-if="paymentSplit.onlineEnabled"><q-select v-model="paymentSplit.onlineChannel" :options="['GCash','BPI Online','AUB Online','Maya','Other']" label="Channel" outlined dense /></div>
                <div class="col-3" v-if="paymentSplit.onlineEnabled"><q-input v-model="paymentSplit.onlineRefNo" label="Reference Number" outlined dense /></div>
              </div>
            </q-card-section>
          </q-card>

          <q-input v-model="payNotes" label="Notes" outlined dense class="q-mt-sm" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showPay = false" />
          <q-btn label="Pay" color="teal" @click="submitPay" :loading="paying" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../boot/axios';
import { Notify } from 'quasar';
import { currentYearRange } from '../utils/date';

const selectedVendor = ref('');
const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const loading = ref(false);
const report = ref<any>(null);
const vendorOptions = ref<{ label: string; value: string }[]>([]);
const paymentFilter = ref<string | null>(null);
const paymentFilterOptions = [{ label: 'All', value: null }, { label: 'Unpaid', value: 'UNPAID' }, { label: 'Partial', value: 'PARTIAL' }, { label: 'Paid', value: 'PAID' }];

const selectedForPay = ref<any[]>([]);

const unpaidDeliveries = computed(() => report.value?.deliveries || []);

const filteredDeliveries = computed(() => {
  let list = unpaidDeliveries.value;
  if (paymentFilter.value) list = list.filter((d: any) => d.paymentStatus === paymentFilter.value);
  return list;
});

// Pagination state for QTable (server-side pagination)
const pagination = ref({ page: 1, rowsPerPage: 25, rowsNumber: 0, sortBy: 'deliveryDate', descending: true, rowsPerPageOptions: [25, 50, 100, 0] });

const updatePaginationCount = () => {
  pagination.value.rowsNumber = report.value?.count ?? filteredDeliveries.value.length;
  const maxPage = Math.max(1, Math.ceil(pagination.value.rowsNumber / Math.max(1, pagination.value.rowsPerPage)));
  if (pagination.value.page > maxPage) pagination.value.page = maxPage;
};

watch(report, updatePaginationCount);
watch(filteredDeliveries, (val) => {
  if (!report.value) {
    pagination.value.rowsNumber = Array.isArray(val) ? val.length : 0;
    const maxPage = Math.max(1, Math.ceil(pagination.value.rowsNumber / Math.max(1, pagination.value.rowsPerPage)));
    if (pagination.value.page > maxPage) pagination.value.page = maxPage;
  }
});

const onRequest = (props: any) => {
  pagination.value = props.pagination;
  loadReport({ page: props.pagination.page, limit: props.pagination.rowsPerPage });
};

const showPay = ref(false);
const payRow = ref<any>(null);
const paymentDate = ref(new Date().toISOString().split('T')[0]);
const payNotes = ref('');
const paying = ref(false);
const paymentSplit = ref({
  cashEnabled: false, cashAmount: 0,
  checkEnabled: false, checkAmount: 0, checkBank: '', checkNumber: '', checkAccountName: '',
  onlineEnabled: false, onlineAmount: 0, onlineChannel: '', onlineRefNo: ''
});
const paymentTotalPaid = computed(() => {
  let total = 0;
  if (paymentSplit.value.cashEnabled) total += paymentSplit.value.cashAmount || 0;
  if (paymentSplit.value.checkEnabled) total += paymentSplit.value.checkAmount || 0;
  if (paymentSplit.value.onlineEnabled) total += paymentSplit.value.onlineAmount || 0;
  return total;
});
const paymentBalance = computed(() => Math.max(0, (payRow.value?.balance || 0) - paymentTotalPaid.value));

const fmtCur = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }) : '';

const columns = [
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'siNumber', label: 'SI#', field: 'siNumber', align: 'left' as const },
  { name: 'deliveryDate', label: 'Date', field: 'deliveryDate', align: 'left' as const, sortable: true },
  { name: 'vendorName', label: 'Vendor', field: 'vendorName', align: 'left' as const, sortable: true },
  { name: 'totalAmount', label: 'Total', field: 'totalAmount', align: 'right' as const, sortable: true },
  { name: 'amountPaid', label: 'Paid', field: 'amountPaid', align: 'right' as const },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right' as const },
  { name: 'paymentStatus', label: 'Status', field: 'paymentStatus', align: 'center' as const },
  { name: 'actions', label: '', field: '', align: 'center' as const },
];

const loadVendors = async () => {
  try { const r = await api.get('/vendors'); vendorOptions.value = r.data.map((v: any) => ({ label: v.name, value: v._id })); } catch {}
};

const loadReport = async (opts: { page?: number; limit?: number; resetPage?: boolean } = {}) => {
  loading.value = true;
  try {
    if (opts.resetPage) pagination.value.page = 1;
    if (typeof opts.limit === 'number') pagination.value.rowsPerPage = opts.limit;
    if (typeof opts.page === 'number') pagination.value.page = opts.page;

    const params: any = {
      page: pagination.value.page,
      limit: pagination.value.rowsPerPage
    };
    if (selectedVendor.value) params.vendorId = selectedVendor.value;
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;
    const r = await api.get('/reports/vendor-payments', { params });
    report.value = r.data;
    pagination.value.rowsNumber = r.data.count || 0;
    selectedForPay.value = [];
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const selectAllUnpaid = () => {
  selectedForPay.value = filteredDeliveries.value.filter((d: any) => d.paymentStatus !== 'PAID');
};

const resetPaymentSplit = () => {
  paymentSplit.value.cashEnabled = false;
  paymentSplit.value.cashAmount = 0;
  paymentSplit.value.checkEnabled = false;
  paymentSplit.value.checkAmount = 0;
  paymentSplit.value.checkBank = '';
  paymentSplit.value.checkNumber = '';
  paymentSplit.value.checkAccountName = '';
  paymentSplit.value.onlineEnabled = false;
  paymentSplit.value.onlineAmount = 0;
  paymentSplit.value.onlineChannel = '';
  paymentSplit.value.onlineRefNo = '';
};

const openPayDialog = (row: any) => {
  payRow.value = row;
  paymentDate.value = new Date().toISOString().split('T')[0];
  resetPaymentSplit();
  payNotes.value = '';
  showPay.value = true;
};

const payDelivery = (row: any) => {
  openPayDialog(row);
};

const payBulk = () => {
  const totalBalance = selectedForPay.value.reduce((s: number, r: any) => s + (r.balance || 0), 0);
  payRow.value = { _id: 'BULK', drNumber: selectedForPay.value.map((d: any) => d.drNumber).join(', '), balance: totalBalance };
  paymentDate.value = new Date().toISOString().split('T')[0];
  resetPaymentSplit();
  payNotes.value = '';
  showPay.value = true;
};

const submitPay = async () => {
  if (!payRow.value || paymentTotalPaid.value <= 0) return;
  paying.value = true;
  const channels: Array<{ method: string; amount: number; reference?: string; effectiveDate?: string }> = [];
  if (paymentSplit.value.cashEnabled && paymentSplit.value.cashAmount > 0) {
    channels.push({ method: 'CASH', amount: paymentSplit.value.cashAmount });
  }
  if (paymentSplit.value.checkEnabled && paymentSplit.value.checkAmount > 0) {
    const reference = [paymentSplit.value.checkBank, paymentSplit.value.checkNumber].filter(Boolean).join(' - ');
    channels.push({ method: 'CHECK', amount: paymentSplit.value.checkAmount, reference, effectiveDate: paymentSplit.value.checkNumber || undefined });
  }
  if (paymentSplit.value.onlineEnabled && paymentSplit.value.onlineAmount > 0) {
    channels.push({ method: 'ONLINE', amount: paymentSplit.value.onlineAmount, reference: paymentSplit.value.onlineRefNo || undefined });
  }

  if (channels.length === 0) {
    Notify.create({ type: 'negative', message: 'Please enter at least one payment amount.' });
    paying.value = false;
    return;
  }

  const dispatchPayment = async (deliveryId: string, amount: number, channel: typeof channels[0]) => {
    await api.post(`/deliveries/${deliveryId}/pay`, {
      amount,
      method: channel.method,
      reference: channel.reference,
      effectiveDate: channel.effectiveDate,
      notes: payNotes.value
    });
  };

  try {
    if (payRow.value._id === 'BULK') {
      const totalPaid = paymentTotalPaid.value;
      for (const dr of selectedForPay.value) {
        if (dr.balance <= 0) continue;
        const ratio = Math.min(1, (dr.balance || 0) / totalPaid);
        for (const channel of channels) {
          const channelAmount = +(channel.amount * ratio).toFixed(2);
          if (channelAmount <= 0) continue;
          await dispatchPayment(dr._id, channelAmount, channel);
        }
      }
      selectedForPay.value = [];
    } else {
      for (const channel of channels) {
        await dispatchPayment(payRow.value._id, channel.amount, channel);
      }
    }
    Notify.create({ type: 'positive', message: 'Payment recorded' });
    showPay.value = false;
    await loadReport();
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e?.response?.data?.error || 'Failed' });
  } finally {
    paying.value = false;
  }
};

const printSelectedDRs = async () => {
  if (!selectedForPay.value.length) return;

  const checkRecordsRes = await api.get('/check-approvals');
  const checkRecords = Array.isArray(checkRecordsRes.data) ? checkRecordsRes.data : [];

  const parseCheckRef = (ref: string) => {
    const knownBanks = ['BPI', 'AUB', 'BDO', 'Metrobank', 'Landbank', 'PNB', 'Other'];
    if (!ref) return { bankName: '', checkNumber: '' };
    const parts = ref.split(' - ');
    if (parts.length >= 2 && knownBanks.some(b => b.toLowerCase() === parts[0].trim().toLowerCase())) {
      return { bankName: parts[0].trim(), checkNumber: parts.slice(1).join(' - ').trim() };
    }
    return { bankName: '', checkNumber: ref.trim() };
  };

  // Fetch full DR details (with line items) for each selected DR
  const fullDRs: any[] = [];
  for (const dr of selectedForPay.value) {
    try {
      const r = await api.get(`/deliveries/${dr._id}`);
      fullDRs.push(r.data);
    } catch {
      fullDRs.push(dr);
    }
  }

  // Sort by date
  fullDRs.sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime());

  const vendorName = fullDRs[0]?.vendorName || selectedVendor.value || 'Vendor';

  // Build one combined table body — all items from all DRs
  let allRows = '';
  let rowNo = 0;
  let overallTotal = 0;
  let overallPaid = 0;

  const checkEntries: any[] = [];

  fullDRs.forEach((dr: any) => {
    const items = dr.lineItems || [];
    const drTotal = items.reduce((s: number, i: any) => s + ((i.quantityReceived || 0) * (i.netCost || i.unitCost || 0)), 0) || dr.totalAmount || 0;
    const amtPaid = dr.amountPaid || 0;
    const balance = drTotal - amtPaid;
    const date = dr.deliveryDate ? new Date(dr.deliveryDate).toLocaleDateString('en-PH') : '';
    const payStatus = dr.paymentStatus || (balance <= 0 ? 'PAID' : amtPaid > 0 ? 'PARTIAL' : 'UNPAID');
    const statusColor = payStatus === 'PAID' ? '#2e7d32' : payStatus === 'PARTIAL' ? '#e65100' : '#c62828';

    (dr.paymentHistory || [])
      .filter((p: any) => p.method === 'CHECK')
      .forEach((p: any) => {
        const parsed = parseCheckRef(p.reference || '');

        const matchedCheck = checkRecords.find((cr: any) => {
          const crRef = (cr.referenceNumber || '').toString().trim().toLowerCase();
          const phRef = (p.reference || '').toString().trim().toLowerCase();
          const parsedNo = (parsed.checkNumber || '').toString().trim().toLowerCase();
          const compactCrRef = crRef.replace(/\s+/g, '');
          const compactParsedNo = parsedNo.replace(/\s+/g, '');
          const compactPhRef = phRef.replace(/\s+/g, '');
          return (
            (compactParsedNo && (compactCrRef === compactParsedNo || compactCrRef.includes(compactParsedNo) || compactParsedNo.includes(compactCrRef))) ||
            (compactPhRef && (compactCrRef === compactPhRef || compactCrRef.includes(compactPhRef) || compactPhRef.includes(compactCrRef)))
          );
        });

        const fallbackCheckNo = (p.reference || '').split(' - ').pop()?.trim() || '';

        checkEntries.push({
          drNumber: dr.drNumber || '',
          bankName: parsed.bankName || matchedCheck?.bankAccount || '',
          checkNumber: parsed.checkNumber || fallbackCheckNo,
          effectiveDate: p.effectiveDate || matchedCheck?.effectiveDate || p.date || dr.deliveryDate,
          amount: p.amount || 0
        });
      });

    // DR header row spanning all columns
    allRows += `<tr class="dr-header-row">
      <td colspan="9" style="background:#e8eaf6;font-weight:bold;font-size:9px;padding:3px 6px">
        DR# <b>${dr.drNumber || 'N/A'}</b>
        ${dr.siNumber ? `&nbsp;|&nbsp; SI# ${dr.siNumber}` : ''}
        &nbsp;|&nbsp; Date: ${date}
        &nbsp;|&nbsp; <span style="color:${statusColor}">${payStatus}</span>
        ${amtPaid > 0 ? `&nbsp;|&nbsp; Paid: P${amtPaid.toFixed(2)}` : ''}
        ${balance > 0 ? `&nbsp;|&nbsp; <span style="color:#c62828">Balance: P${balance.toFixed(2)}</span>` : ''}
      </td>
    </tr>`;

    items.forEach((item: any) => {
      rowNo++;
      const qty = item.quantityReceived || item.quantityOrdered || 0;
      const cost = item.unitCost || 0;
      const net = item.netCost || item.unitCost || 0;
      const sub = (qty * cost).toFixed(2);
      const discParts = [1,2,3,4].map(d => item[`discount${d}`] ? `${item[`discount${d}Mode`]==='add'?'+':'-'}${item[`discount${d}`]}%` : '').filter(Boolean);
      const discStr = discParts.join(' ') || '—';
      const total = (qty * net).toFixed(2);
      allRows += `<tr>
        <td style="text-align:center">${rowNo}</td>
        <td style="text-align:center">${qty}</td>
        <td style="font-family:monospace">${item.code||''}</td>
        <td>${item.description||''}</td>
        <td style="text-align:center">${item.uom||''}</td>
        <td style="text-align:right">${cost.toFixed(2)}</td>
        <td style="text-align:right">${sub}</td>
        <td style="text-align:center;font-size:8px">${discStr}</td>
        <td style="text-align:right;font-weight:bold">${total}</td>
      </tr>`;
    });

    // DR subtotal row
    allRows += `<tr class="subtotal-row">
      <td colspan="8" style="text-align:right;font-weight:bold;background:#f5f5f5">DR ${dr.drNumber} Subtotal:</td>
      <td style="text-align:right;font-weight:bold;background:#f5f5f5">P${drTotal.toFixed(2)}</td>
    </tr>`;

    overallTotal += drTotal;
    overallPaid += amtPaid;
  });

  const overallBalance = overallTotal - overallPaid;

  const tableHtml = `
    <table>
      <thead><tr>
        <th>No.</th><th>Qty</th><th>Code</th><th>Description</th>
        <th>UOM</th><th style="text-align:right">Unit Cost</th>
        <th style="text-align:right">Sub Total</th><th>Disc</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${allRows}</tbody>
      <tfoot>
        <tr class="grand-total-row">
          <td colspan="8" style="text-align:right">GRAND TOTAL (${fullDRs.length} DRs):</td>
          <td style="text-align:right">P${overallTotal.toFixed(2)}</td>
        </tr>
        ${overallPaid > 0 ? `<tr><td colspan="8" style="text-align:right">Total Paid:</td><td style="text-align:right;color:#2e7d32">P${overallPaid.toFixed(2)}</td></tr>` : ''}
        ${overallBalance > 0 ? `<tr><td colspan="8" style="text-align:right;color:#c62828">Total Balance:</td><td style="text-align:right;color:#c62828;font-weight:bold">P${overallBalance.toFixed(2)}</td></tr>` : ''}
      </tfoot>
    </table>`;

  const checkRows = checkEntries.map((c: any, i: number) => `<tr>
    <td style="text-align:center">${i + 1}</td>
    <td>${c.drNumber}</td>
    <td>${c.checkNumber || ''}</td>
    <td>${c.bankName || ''}</td>
    <td>${c.effectiveDate ? fmtDate(c.effectiveDate) : ''}</td>
    <td style="text-align:right">P${Number(c.amount || 0).toFixed(2)}</td>
  </tr>`).join('');

  const checkSection = checkEntries.length > 0 ? `
    <div style="margin-top:8px;margin-bottom:4px;font-weight:bold;font-size:10px;color:#1565c0;border-bottom:1px solid #1565c0;padding-bottom:2px">Check Details</div>
    <table>
      <thead>
        <tr><th>#</th><th>DR#</th><th>Check #</th><th>Bank</th><th>Effective Date</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>${checkRows}</tbody>
    </table>` : '';

  const slip = (label: string) => `<div class="slip">
    <div class="copy-label">${label}</div>
    <div class="slip-header">
      <div style="text-align:center">
        <div style="font-size:14px;font-weight:bold">Aberin Hardware</div>
        <div style="font-size:10px">Delivery Receipts Summary</div>
      <div style="font-size:10px;color:#555">Vendor: <b style="font-size:11px">${vendorName}</b></div>
      </div>
    </div>
    ${tableHtml}
    ${checkSection}
    <div class="sig-row">
      <div class="sig"><div>Received by</div></div>
      <div class="sig"><div>Prepared by</div></div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html><html><head><title>DR Summary — ${vendorName}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 0; }
    .slip { padding: 8px 15px; position: relative; box-sizing: border-box; }
    .copy-label { position: absolute; top: 4px; right: 10px; font-size: 8px; color: #999; font-style: italic; }
    .slip-header { margin-bottom: 8px; }
    .divider { border-top: 2px dashed #999; text-align: center; font-size: 8px; color: #999; padding: 2px 0; margin: 0 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    th, td { border: 1px solid #ccc; padding: 3px 5px; font-size: 9px; }
    th { background: #e8eaf6; font-weight: bold; }
    .dr-header-row td { font-size: 10px; }
    .subtotal-row td { font-size: 8px; border-top: 1px solid #999; }
    .grand-total-row td { font-weight: bold; font-size: 10px; background: #e8eaf6; border-top: 2px solid #333; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 12px; padding: 0 20px; }
    .sig { text-align: center; width: 150px; font-size: 10px; }
    .sig div { border-top: 1px solid #333; padding-top: 2px; margin-top: 20px; }
    @media print { body { margin: 0; } @page { margin: 4mm; } }
  </style></head><body>
  ${slip('ORIGINAL COPY')}
  <div class="divider">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
  ${slip('VENDOR COPY')}
  <div style="text-align:center;margin:8px 0">
    <button onclick="window.print()" style="padding:6px 18px;cursor:pointer;font-size:11px">🖨️ Print (${fullDRs.length} DRs)</button>
  </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

const printReport = async () => {
  if (!report.value) return;
  const vendorName = vendorOptions.value.find(v => v.value === selectedVendor.value)?.label || 'All Vendors';
  let rows = '';
  const checkEntries: any[] = [];

  const checkRecordsRes = await api.get('/check-approvals');
  const checkRecords = Array.isArray(checkRecordsRes.data) ? checkRecordsRes.data : [];

  const parseCheckRef = (ref: string) => {
    const knownBanks = ['BPI', 'AUB', 'BDO', 'Metrobank', 'Landbank', 'PNB', 'Other'];
    if (!ref) return { bankName: '', checkNumber: '' };
    const parts = ref.split(' - ');
    if (parts.length >= 2 && knownBanks.some(b => b.toLowerCase() === parts[0].trim().toLowerCase())) {
      return { bankName: parts[0].trim(), checkNumber: parts.slice(1).join(' - ').trim() };
    }
    return { bankName: '', checkNumber: ref.trim() };
  };

  report.value.deliveries.forEach((d: any, i: number) => {
    const unpaid = d.balance > 0;
    rows += `<tr style="${unpaid ? 'color:#c62828;background:#fff5f5' : ''}"><td>${i+1}</td><td>${d.drNumber}</td><td>${d.vendorName||''}</td><td>${new Date(d.deliveryDate).toLocaleDateString('en-PH')}</td><td style="text-align:right">P${d.totalAmount.toFixed(2)}</td><td style="text-align:right">P${d.amountPaid.toFixed(2)}</td><td style="text-align:right;font-weight:bold">P${d.balance.toFixed(2)}</td></tr>`;

    (d.paymentHistory || [])
      .filter((p: any) => p.method === 'CHECK')
      .forEach((p: any) => {
        const parsed = parseCheckRef(p.reference || '');

        const matchedCheck = checkRecords.find((cr: any) => {
          const crRef = (cr.referenceNumber || '').toString().trim().toLowerCase();
          const phRef = (p.reference || '').toString().trim().toLowerCase();
          const parsedNo = (parsed.checkNumber || '').toString().trim().toLowerCase();
          const compactCrRef = crRef.replace(/\s+/g, '');
          const compactParsedNo = parsedNo.replace(/\s+/g, '');
          const compactPhRef = phRef.replace(/\s+/g, '');
          return (
            (compactParsedNo && (compactCrRef === compactParsedNo || compactCrRef.includes(compactParsedNo) || compactParsedNo.includes(compactCrRef))) ||
            (compactPhRef && (compactCrRef === compactPhRef || compactCrRef.includes(compactPhRef) || compactPhRef.includes(compactCrRef)))
          );
        });

        const fallbackCheckNo = (p.reference || '').split(' - ').pop()?.trim() || '';

        checkEntries.push({
          drNumber: d.drNumber || '',
          checkNumber: parsed.checkNumber || fallbackCheckNo,
          bankName: parsed.bankName || matchedCheck?.bankAccount || '',
          effectiveDate: p.effectiveDate || matchedCheck?.effectiveDate || p.date || d.deliveryDate,
          amount: p.amount || 0
        });
      });
  });

  const checkRows = checkEntries.map((c: any, i: number) => `<tr>
    <td style="text-align:center">${i + 1}</td>
    <td>${c.drNumber}</td>
    <td>${c.checkNumber || ''}</td>
    <td>${c.bankName || ''}</td>
    <td>${c.effectiveDate ? fmtDate(c.effectiveDate) : ''}</td>
    <td style="text-align:right">P${Number(c.amount || 0).toFixed(2)}</td>
  </tr>`).join('');

  const checkSection = checkEntries.length > 0
    ? `<div style="margin-top:8px;margin-bottom:4px;font-weight:bold;font-size:10px;color:#1565c0;border-bottom:1px solid #1565c0;padding-bottom:2px">Check Details</div>
       <table>
         <thead><tr><th>#</th><th>DR#</th><th>Check #</th><th>Bank</th><th>Effective Date</th><th style="text-align:right">Amount</th></tr></thead>
         <tbody>${checkRows}</tbody>
       </table>`
    : '';

  const slipBlock = (label: string) => `<div class="slip"><div class="copy-label">${label}</div>
    <div class="header"><h2 style="margin:0">Aberin Hardware</h2><p class="vendor-name">Vendor Report — ${vendorName}</p></div>
    <table><thead><tr><th>#</th><th>DR#</th><th>Vendor</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="4" style="text-align:right">TOTAL:</td><td style="text-align:right">P${report.value.grandTotal.toFixed(2)}</td><td style="text-align:right">P${report.value.totalPaid.toFixed(2)}</td><td style="text-align:right;color:#c62828">P${report.value.totalBalance.toFixed(2)}</td></tr></tfoot></table>
    ${checkSection}
    <div class="sig-row"><div class="sig"><div>Received by</div></div><div class="sig"><div>Prepared by</div></div></div></div>`;

  const html = `<!DOCTYPE html><html><head><title>Vendor Report</title><style>body{font-family:Arial;font-size:10px;margin:0;padding:0}.slip{padding:8px 16px;height:48vh;overflow:hidden;position:relative;box-sizing:border-box}.copy-label{position:absolute;top:3px;right:10px;font-size:8px;color:#999;font-style:italic}.divider{border-top:2px dashed #999;text-align:center;font-size:9px;color:#999;padding:2px 0}.header{text-align:center;margin-bottom:6px}.header h2{margin:0;font-size:14px}.header p{margin:2px 0;font-size:10px}.vendor-name{font-size:11px;font-weight:600}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 5px;font-size:10px}th{background:#f0f0f0}.total-row{font-weight:bold;font-size:11px;background:#f0f0f0}.sig-row{display:flex;justify-content:space-between;margin-top:10px}.sig{text-align:center;width:170px;font-size:10px}.sig div{border-top:1px solid #333;padding-top:2px;margin-top:18px}@media print{body{margin:0}@page{margin:3mm}}</style></head><body>
  ${slipBlock('ORIGINAL COPY')}
  <div class="divider">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
  ${slipBlock('VENDOR COPY')}
  <div style="text-align:center;margin:5px 0"><button onclick="window.print()" style="padding:5px 15px;cursor:pointer">🖨️ Print</button></div></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};


onMounted(() => {
  loadVendors();
  loadReport();
});
</script>

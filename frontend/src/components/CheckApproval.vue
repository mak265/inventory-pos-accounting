<template>
  <div class="q-pa-md">
    <div class="text-h5 q-mb-md">Check Approvals</div>

    <!-- Filters -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-md-2 col-sm-6 col-xs-12">
        <q-select v-model="filters.status" :options="statusOptions" label="Status" outlined dense emit-value map-options />
      </div>
      <div class="col-md-2 col-sm-6 col-xs-12">
        <q-input v-model="filters.startDate" label="Start Date" outlined dense type="date" />
      </div>
      <div class="col-md-2 col-sm-6 col-xs-12">
        <q-input v-model="filters.endDate" label="End Date" outlined dense type="date" />
      </div>
      <div class="col-md-3 col-sm-6 col-xs-12">
        <q-input v-model="filters.search" label="Search customer..." outlined dense clearable />
      </div>
      <div class="col-md-3 col-sm-12 col-xs-12">
        <q-btn color="primary" label="Apply" @click="loadRecords" class="q-mr-sm" />
        <q-btn flat label="Reset" @click="resetFilters" class="q-mr-sm" />
        <q-btn outline color="deep-purple" label="Print Report" icon="print" @click="printReport" />
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-md-3 col-sm-6 col-xs-12">
        <q-card flat bordered class="bg-orange-1"><q-card-section>
          <div class="text-caption">Pending</div>
          <div class="text-h5 text-orange">{{ fmt(pendingTotal) }}</div>
          <div class="text-caption">{{ pendingCount }} check(s)</div>
        </q-card-section></q-card>
      </div>
      <div class="col-md-3 col-sm-6 col-xs-12">
        <q-card flat bordered class="bg-green-1"><q-card-section>
          <div class="text-caption">Cleared</div>
          <div class="text-h5 text-positive">{{ fmt(clearedTotal) }}</div>
          <div class="text-caption">{{ clearedCount }} check(s)</div>
        </q-card-section></q-card>
      </div>
      <div class="col-md-3 col-sm-6 col-xs-12">
        <q-card flat bordered class="bg-red-1"><q-card-section>
          <div class="text-caption">Bounced</div>
          <div class="text-h5 text-negative">{{ fmt(bouncedTotal) }}</div>
          <div class="text-caption">{{ bouncedCount }} check(s)</div>
        </q-card-section></q-card>
      </div>
      <div class="col-md-3 col-sm-6 col-xs-12">
        <q-card flat bordered class="bg-blue-1"><q-card-section>
          <div class="text-caption">Total</div>
          <div class="text-h5 text-primary">{{ fmt(grandTotal) }}</div>
          <div class="text-caption">{{ filteredRecords.length }} record(s)</div>
        </q-card-section></q-card>
      </div>
    </div>

    <!-- Table -->
    <q-table :rows="filteredRecords" :columns="columns" row-key="_id" :loading="checkStore.loading" flat bordered :pagination="{rowsPerPage:20}">
      <template v-slot:body="props">
        <q-tr :props="props" class="cursor-pointer" @click="openDetail(props.row)">
          <q-td key="receivedDate" :props="props">{{ fmtDate(props.row.receivedDate) }}</q-td>
          <q-td key="effectiveDate" :props="props">
            <span v-if="props.row.effectiveDate" class="text-weight-medium text-primary">{{ fmtDate(props.row.effectiveDate) }}</span>
            <span v-else class="text-grey-4">—</span>
          </q-td>
          <q-td key="customerName" :props="props">{{ props.row.customerName }}</q-td>
          <q-td key="referenceNumber" :props="props">{{ props.row.referenceNumber || '-' }}</q-td>
          <q-td key="accountName" :props="props">{{ props.row.accountName || '-' }}</q-td>
          <q-td key="amount" :props="props">{{ fmt(props.row.amount) }}</q-td>
          <q-td key="status" :props="props"><q-badge :color="statusColor(props.row.status)" :label="props.row.status" /></q-td>
          <q-td key="actions" :props="props" @click.stop>
            <template v-if="props.row.status === 'PENDING'">
              <q-btn flat dense size="sm" color="positive" icon="check_circle" label="Approve" @click.stop="openApproveDialog(props.row)" class="q-mr-xs" />
              <q-btn flat dense size="sm" color="negative" icon="cancel" label="Bounce" @click.stop="openBounceDialog(props.row)" />
            </template>
            <span v-else-if="props.row.status === 'CLEARED'" class="text-caption text-positive">✓ {{ props.row.bankAccount }}</span>
            <span v-else-if="props.row.status === 'BOUNCED'" class="text-caption text-negative">✗ Bounced</span>
          </q-td>
        </q-tr>
      </template>
    </q-table>

    <!-- Detail Modal -->
    <q-dialog v-model="showDetail">
      <q-card style="min-width:500px;max-width:600px">
        <q-card-section>
          <div class="text-h6">Check Details</div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="row"><div class="col-5 text-weight-bold">Customer:</div><div class="col-7">{{ detailCheck?.customerName }}</div></div>
          <div class="row"><div class="col-5 text-weight-bold">Amount:</div><div class="col-7 text-h6" :class="detailCheck?.status === 'BOUNCED' ? 'text-negative' : 'text-primary'">{{ fmt(detailCheck?.amount || 0) }}</div></div>
          <div class="row"><div class="col-5 text-weight-bold">Reference #:</div><div class="col-7">{{ detailCheck?.referenceNumber || '-' }}</div></div>
          <div class="row"><div class="col-5 text-weight-bold">Account Number:</div><div class="col-7">{{ detailCheck?.accountName || '-' }}</div></div>
          <div class="row"><div class="col-5 text-weight-bold">Date Received:</div><div class="col-7">{{ fmtDate(detailCheck?.receivedDate) }}</div></div>
          <div class="row"><div class="col-5 text-weight-bold">Effective Date:</div><div class="col-7">{{ detailCheck?.effectiveDate ? fmtDate(detailCheck.effectiveDate) : '-' }}</div></div>
          <q-separator class="q-my-sm" />
          <div class="row"><div class="col-5 text-weight-bold">Status:</div><div class="col-7"><q-badge :color="statusColor(detailCheck?.status)" :label="detailCheck?.status" /></div></div>
          <div v-if="detailCheck?.bankAccount" class="row"><div class="col-5 text-weight-bold">Bank:</div><div class="col-7">{{ detailCheck.bankAccount }}</div></div>
          <div v-if="detailCheck?.approvedDate" class="row"><div class="col-5 text-weight-bold">Approved:</div><div class="col-7">{{ fmtDate(detailCheck.approvedDate) }}</div></div>
          <div v-if="detailCheck?.bouncedDate" class="row"><div class="col-5 text-weight-bold">Bounced:</div><div class="col-7">{{ fmtDate(detailCheck.bouncedDate) }}</div></div>
        </q-card-section>
        <q-card-actions align="right">
          <template v-if="detailCheck?.status === 'PENDING'">
            <q-btn flat color="positive" label="Approve" icon="check_circle" @click="showDetail = false; openApproveDialog(detailCheck)" />
            <q-btn flat color="negative" label="Bounce" icon="cancel" @click="showDetail = false; openBounceDialog(detailCheck)" />
          </template>
          <q-btn flat label="Close" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Approve Dialog -->
    <q-dialog v-model="showApproveDialog">
      <q-card style="min-width:400px">
        <q-card-section>
          <div class="text-h6">Approve Check</div>
          <div class="text-subtitle2 text-grey-7 q-mt-sm">{{ selectedCheck?.customerName }}</div>
          <div class="text-body2">Ref: {{ selectedCheck?.referenceNumber || 'N/R' }} | Acct: {{ selectedCheck?.accountName || '-' }}</div>
          <div class="text-h5 text-positive q-mt-sm">{{ fmt(selectedCheck?.amount || 0) }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-select v-model="selectedBank" :options="bankOptions" label="Deposit to Bank *" outlined dense emit-value map-options />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="Approve" color="positive" :disable="!selectedBank" :loading="processing" @click="doApprove" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Bounce Dialog -->
    <q-dialog v-model="showBounceDialog">
      <q-card style="min-width:400px">
        <q-card-section>
          <div class="text-h6">Mark Check as Bounced</div>
          <div class="text-subtitle2 text-grey-7 q-mt-sm">{{ selectedCheck?.customerName }}</div>
          <div class="text-body2">Ref: {{ selectedCheck?.referenceNumber || 'N/R' }} | {{ fmt(selectedCheck?.amount || 0) }}</div>
          <div class="text-body2 q-mt-md text-negative text-weight-bold">This will reverse the CHECK account credit.</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="Mark Bounced" color="negative" :loading="processing" @click="doBounce" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCheckStore } from '../stores/checkStore';
import { Notify } from 'quasar';

const checkStore = useCheckStore();
const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

const filters = ref({ status: 'ALL', startDate: '', endDate: '', search: '' });
const statusOptions = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Cleared', value: 'CLEARED' },
  { label: 'Bounced', value: 'BOUNCED' }
];

const columns = [
  { name: 'receivedDate', label: 'Date Received', field: 'receivedDate', align: 'left' as const, sortable: true },
  { name: 'effectiveDate', label: 'Effective Date', field: 'effectiveDate', align: 'left' as const, sortable: true },
  { name: 'customerName', label: 'Customer/Vendor', field: 'customerName', align: 'left' as const, sortable: true },
  { name: 'referenceNumber', label: 'Reference #', field: 'referenceNumber', align: 'left' as const },
  { name: 'accountName', label: 'Account Name', field: 'accountName', align: 'left' as const },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const, sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const },
  { name: 'actions', label: 'Actions', field: '', align: 'center' as const }
];

// Filtered records (client-side search on top of API filter)
const filteredRecords = computed(() => {
  if (!filters.value.search) return checkStore.checkRecords;
  const s = filters.value.search.toLowerCase();
  return checkStore.checkRecords.filter((r: any) =>
    (r.customerName || '').toLowerCase().includes(s) ||
    (r.referenceNumber || '').toLowerCase().includes(s) ||
    (r.accountName || '').toLowerCase().includes(s)
  );
});

// Summary counts
const pendingRecords = computed(() => filteredRecords.value.filter(r => r.status === 'PENDING'));
const clearedRecords = computed(() => filteredRecords.value.filter(r => r.status === 'CLEARED'));
const bouncedRecords = computed(() => filteredRecords.value.filter(r => r.status === 'BOUNCED'));
const pendingTotal = computed(() => pendingRecords.value.reduce((s, r) => s + (r.amount || 0), 0));
const clearedTotal = computed(() => clearedRecords.value.reduce((s, r) => s + (r.amount || 0), 0));
const bouncedTotal = computed(() => bouncedRecords.value.reduce((s, r) => s + (r.amount || 0), 0));
const grandTotal = computed(() => filteredRecords.value.reduce((s, r) => s + (r.amount || 0), 0));
const pendingCount = computed(() => pendingRecords.value.length);
const clearedCount = computed(() => clearedRecords.value.length);
const bouncedCount = computed(() => bouncedRecords.value.length);

const statusColor = (s: string) => ({ PENDING: 'orange', CLEARED: 'green', BOUNCED: 'red' }[s] || 'grey');

// Detail modal
const showDetail = ref(false);
const detailCheck = ref<any>(null);
const openDetail = (check: any) => { detailCheck.value = check; showDetail.value = true; };

// Approve
const showApproveDialog = ref(false);
const selectedCheck = ref<any>(null);
const selectedBank = ref('');
const processing = ref(false);
const bankOptions = computed(() => checkStore.availableBanks.map(b => ({ label: b, value: b })));

const openApproveDialog = (check: any) => { selectedCheck.value = check; selectedBank.value = ''; showApproveDialog.value = true; };

const doApprove = async () => {
  if (!selectedCheck.value || !selectedBank.value) return;
  processing.value = true;
  try {
    await checkStore.approveCheck(selectedCheck.value._id, selectedBank.value);
    Notify.create({ type: 'positive', message: 'Check approved → ' + selectedBank.value });
    showApproveDialog.value = false;
    await loadRecords();
  } catch (e: any) { Notify.create({ type: 'negative', message: e.message || 'Failed' }); }
  finally { processing.value = false; }
};

// Bounce
const showBounceDialog = ref(false);
const openBounceDialog = (check: any) => { selectedCheck.value = check; showBounceDialog.value = true; };

const doBounce = async () => {
  if (!selectedCheck.value) return;
  processing.value = true;
  try {
    await checkStore.bounceCheck(selectedCheck.value._id);
    Notify.create({ type: 'positive', message: 'Check marked as bounced' });
    showBounceDialog.value = false;
    await loadRecords();
  } catch (e: any) { Notify.create({ type: 'negative', message: e.message || 'Failed' }); }
  finally { processing.value = false; }
};

const loadRecords = () => checkStore.fetchCheckRecords({ status: filters.value.status, startDate: filters.value.startDate, endDate: filters.value.endDate });
const resetFilters = () => { filters.value = { status: 'ALL', startDate: '', endDate: '', search: '' }; loadRecords(); };

const printReport = () => {
  const rows = filteredRecords.value;
  if (!rows.length) return;

  let bodyRows = '';
  rows.forEach((r: any, i: number) => {
    bodyRows += `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${fmtDate(r.receivedDate)}</td>
      <td>${r.effectiveDate ? fmtDate(r.effectiveDate) : ''}</td>
      <td>${r.customerName || ''}</td>
      <td>${r.referenceNumber || ''}</td>
      <td>${r.accountName || ''}</td>
      <td style="text-align:right">P${Number(r.amount || 0).toFixed(2)}</td>
      <td style="text-align:center">${r.status || ''}</td>
    </tr>`;
  });

  const html = `<!DOCTYPE html><html><head><title>Check Approvals Report</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 10px; }
    .header { text-align: center; margin-bottom: 8px; }
    .header h2 { margin: 0; font-size: 14px; }
    .header .sub { margin-top: 2px; font-size: 10px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; font-size: 10px; }
    th { background: #e8eaf6; font-weight: bold; }
    .totals { margin-top: 8px; font-size: 10px; text-align: right; }
    .totals div { margin-top: 2px; }
    @media print { body { margin: 0; padding: 6mm; } @page { margin: 4mm; } .no-print { display: none; } }
  </style></head><body>
    <div class="header">
      <h2>Aberin Hardware</h2>
      <div class="sub">Check Approvals Report</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Date Received</th>
          <th>Effective Date</th>
          <th>Customer/Vendor</th>
          <th>Reference #</th>
          <th>Account Name</th>
          <th style="text-align:right">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="totals">
      <div>Pending: <b>${fmt(pendingTotal.value)}</b></div>
      <div>Cleared: <b>${fmt(clearedTotal.value)}</b></div>
      <div>Bounced: <b>${fmt(bouncedTotal.value)}</b></div>
      <div>Total: <b>${fmt(grandTotal.value)}</b></div>
    </div>
    <div class="no-print" style="text-align:center;margin-top:10px">
      <button onclick="window.print()" style="padding:6px 18px;cursor:pointer">🖨️ Print</button>
    </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

onMounted(async () => {
  await checkStore.fetchAvailableBanks();
  await loadRecords();
});
</script>

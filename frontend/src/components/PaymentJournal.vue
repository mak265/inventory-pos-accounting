<template>
  <q-page padding>
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Payment Voucher</h4>

      <!-- Filters -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-select v-model="selectedVendor" :options="vendorOptions" label="Vendor (All)" outlined dense option-value="value" option-label="label" emit-value map-options clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="startDate" label="Start Date" type="date" outlined dense clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="endDate" label="End Date" type="date" outlined dense clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-6 col-md-2">
              <q-select v-model="methodFilter" :options="methodOptions" label="Method" outlined dense clearable emit-value map-options @update:model-value="applyFilter" />
            </div>
            <div class="col-6 col-md-3 flex items-end">
              <q-btn label="Generate" color="primary" @click="loadJournal" :loading="loading" class="full-width" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Summary cards -->
      <div v-if="journalRows.length > 0" class="row q-col-gutter-md q-mb-md">
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Cash</div>
            <div class="text-h6 text-positive">{{ fmtCur(totals.cash) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Check</div>
            <div class="text-h6 text-blue">{{ fmtCur(totals.check) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Online</div>
            <div class="text-h6 text-purple">{{ fmtCur(totals.online) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Total Payments</div>
            <div class="text-h6 text-primary">{{ fmtCur(totals.total) }}</div>
          </q-card-section></q-card>
        </div>
      </div>

      <!-- Journal Table -->
      <q-card v-if="journalRows.length > 0" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center q-mb-sm">
            <div class="col text-h6">Entries ({{ filteredRows.length }})</div>
            <div class="col-auto row q-gutter-sm items-center">
              <span v-if="selectedRows.length > 0" class="text-caption text-grey-7">{{ selectedRows.length }} selected</span>
              <q-btn flat dense label="Select All" color="primary" size="sm" @click="selectedRows = [...filteredRows]" />
              <q-btn flat dense label="Clear" color="grey" size="sm" @click="selectedRows = []" v-if="selectedRows.length > 0" />
              <q-btn
                :label="selectedRows.length > 0 ? `Print Selected (${selectedRows.length})` : 'Print All'"
                color="indigo" icon="receipt_long"
                @click="printPaymentJournal"
              />
            </div>
          </div>

          <!-- Main table -->
          <q-table
            :rows="filteredRows"
            :columns="columns"
            row-key="_key"
            flat bordered dense
            selection="multiple"
            v-model:selected="selectedRows"
            :pagination="{ rowsPerPage: 25, sortBy: 'date', descending: true }"
          >
            <template v-slot:body-cell-date="props">
              <q-td :props="props">{{ fmtDate(props.row.date) }}</q-td>
            </template>
            <template v-slot:body-cell-amount="props">
              <q-td :props="props" class="text-positive text-weight-bold">{{ fmtCur(props.row.amount) }}</q-td>
            </template>
            <template v-slot:body-cell-method="props">
              <q-td :props="props">
                <q-badge :color="props.row.method === 'CHECK' ? 'blue' : props.row.method === 'ONLINE' ? 'purple' : 'green'">
                  {{ props.row.method }}
                </q-badge>
              </q-td>
            </template>
            <template v-slot:body-cell-checkRef="props">
              <q-td :props="props">
                <span v-if="props.row.method === 'CHECK'" class="text-blue-8 text-caption">
                  {{ [props.row.bankName, props.row.checkNumber].filter(Boolean).join(' - ') }}
                </span>
              </q-td>
            </template>
          </q-table>

          <!-- Unique Check Details — one row per unique check number -->
          <div v-if="uniqueChecks(rowsForPrint).length > 0" class="q-mt-md">
            <div class="text-subtitle2 q-mb-xs text-blue-8" style="border-bottom:2px solid #1565c0;padding-bottom:4px">
              Check Details
            </div>
            <q-table
              :rows="uniqueChecks(rowsForPrint)"
              :columns="checkSummaryColumns"
              row-key="checkNumber"
              flat bordered dense
              hide-pagination
              :rows-per-page-options="[0]"
            >
              <template v-slot:body-cell-effectiveDate="props">
                <q-td :props="props">{{ props.row.effectiveDate ? fmtDate(props.row.effectiveDate) : '' }}</q-td>
              </template>
              <template v-slot:body-cell-totalAmount="props">
                <q-td :props="props" class="text-blue text-weight-bold">{{ fmtCur(props.row.totalAmount) }}</q-td>
              </template>
            </q-table>
          </div>
        </q-card-section>
      </q-card>

      <div v-else-if="!loading" class="text-center text-grey q-pa-xl">
        No payment entries found. Adjust filters and click Generate.
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../boot/axios';
import { currentYearRange } from '../utils/date';

const selectedVendor = ref('');
const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const loading = ref(false);
const vendorOptions = ref<{ label: string; value: string }[]>([]);
const methodFilter = ref<string | null>(null);
const methodOptions = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Check/Bank', value: 'CHECK' },
  { label: 'Online', value: 'ONLINE' }
];

const journalRows = ref<any[]>([]);
const selectedRows = ref<any[]>([]);

const filteredRows = computed(() => {
  if (!methodFilter.value) return journalRows.value;
  return journalRows.value.filter(r => r.method === methodFilter.value);
});

// Rows that will be printed (selected or all)
const rowsForPrint = computed(() =>
  selectedRows.value.length > 0 ? selectedRows.value : filteredRows.value
);

const totals = computed(() => ({
  cash: journalRows.value.filter(r => r.method === 'CASH').reduce((s, r) => s + r.amount, 0),
  check: journalRows.value.filter(r => r.method === 'CHECK').reduce((s, r) => s + r.amount, 0),
  online: journalRows.value.filter(r => r.method === 'ONLINE').reduce((s, r) => s + r.amount, 0),
  total: journalRows.value.reduce((s, r) => s + r.amount, 0)
}));

const fmtCur = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }) : '';

// Build unique check summary — one row per unique check number
const uniqueChecks = (rows: any[]) => {
  const map = new Map<string, any>();
  for (const r of rows) {
    if (r.method !== 'CHECK') continue;
    const key = r.checkNumber || r.reference || '(no check #)';
    if (map.has(key)) {
      map.get(key).totalAmount += r.amount;
      map.get(key).drNumbers.push(r.drNumber);
    } else {
      map.set(key, {
        checkNumber: r.checkNumber || '',
        bankName: r.bankName || '',
        effectiveDate: r.effectiveDate,
        totalAmount: r.amount,
        drNumbers: [r.drNumber]
      });
    }
  }
  return Array.from(map.values());
};

// Main table columns
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' as const, sortable: true },
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'vendorName', label: 'Vendor', field: 'vendorName', align: 'left' as const, sortable: true },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const, sortable: true },
  { name: 'method', label: 'Method', field: 'method', align: 'center' as const },
  { name: 'checkRef', label: 'Check Ref', field: '', align: 'left' as const },
];

// Check summary columns — one row per unique check
const checkSummaryColumns = [
  { name: 'checkNumber', label: 'Check #', field: 'checkNumber', align: 'left' as const },
  { name: 'bankName', label: 'Bank', field: 'bankName', align: 'left' as const },
  { name: 'effectiveDate', label: 'Effective Date', field: 'effectiveDate', align: 'left' as const },
  { name: 'totalAmount', label: 'Total Amount', field: 'totalAmount', align: 'right' as const },
];

const loadVendors = async () => {
  try {
    const r = await api.get('/vendors');
    vendorOptions.value = r.data.map((v: any) => ({ label: v.name, value: v._id }));
  } catch {}
};

const loadJournal = async () => {
  loading.value = true;
  try {
    const params: any = {};
    if (selectedVendor.value) params.vendorId = selectedVendor.value;
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    const r = await api.get('/reports/vendor-payments', { params });
    const deliveries = r.data.deliveries || [];

    const rows: any[] = [];
    for (const dr of deliveries) {
      for (const p of (dr.paymentHistory || [])) {
        let bankName = '';
        let checkNumber = '';
        if (p.method === 'CHECK' && p.reference) {
          const knownBanks = ['BPI', 'AUB', 'BDO', 'Metrobank', 'Landbank', 'PNB', 'Other'];
          const parts = p.reference.split(' - ');
          if (parts.length >= 2 && knownBanks.some(b => b.toLowerCase() === parts[0].trim().toLowerCase())) {
            bankName = parts[0].trim();
            checkNumber = parts.slice(1).join(' - ').trim();
          } else {
            checkNumber = p.reference.trim();
          }
        }
        rows.push({
          _key: `${dr._id}-${p.date}-${p.amount}-${Math.random()}`,
          date: p.date,
          drNumber: dr.drNumber,
          vendorName: dr.vendorName,
          amount: p.amount,
          method: p.method || 'CASH',
          checkNumber,
          bankName,
          effectiveDate: p.effectiveDate,
          reference: p.reference || '',
          notes: p.notes || ''
        });
      }
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    journalRows.value = rows;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const applyFilter = () => { /* reactive via computed */ };

const printPaymentJournal = () => {
  const rows = rowsForPrint.value;
  if (!rows.length) return;


  const t = {
    cash: rows.filter((r: any) => r.method === 'CASH').reduce((s: number, r: any) => s + r.amount, 0),
    check: rows.filter((r: any) => r.method === 'CHECK').reduce((s: number, r: any) => s + r.amount, 0),
    online: rows.filter((r: any) => r.method === 'ONLINE').reduce((s: number, r: any) => s + r.amount, 0),
    total: rows.reduce((s: number, r: any) => s + r.amount, 0)
  };

  // Main table rows
  let mainRows = '';
  rows.forEach((p: any, i: number) => {
    const methodLabel = p.method === 'CHECK' ? 'CHK' : p.method === 'ONLINE' ? 'ONL' : 'CSH';
    const checkRef = p.method === 'CHECK' ? [p.bankName, p.checkNumber].filter(Boolean).join(' - ') : '';
    mainRows += `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${fmtDate(p.date)}</td>
      <td>${p.drNumber}</td>
      <td>${p.vendorName || ''}</td>
      <td style="text-align:right;font-weight:bold">&#8369;${p.amount.toFixed(2)}</td>
      <td style="text-align:center">${methodLabel}</td>
      <td style="font-size:10px;color:#1565c0">${checkRef}</td>
    </tr>`;
  });

  // Unique check details — one row per check number
  const checks = uniqueChecks(rows);
  let checkRows = '';
  checks.forEach((c: any) => {
    checkRows += `<tr>
      <td>${c.checkNumber}</td>
      <td>${c.bankName}</td>
      <td>${c.effectiveDate ? fmtDate(c.effectiveDate) : ''}</td>
      <td style="text-align:right;font-weight:bold;color:#1565c0">&#8369;${c.totalAmount.toFixed(2)}</td>
    </tr>`;
  });

  const checkSection = checks.length > 0 ? `
    <div style="margin-top:8px;margin-bottom:3px;font-weight:bold;font-size:9px;color:#1565c0;border-bottom:1px solid #1565c0;padding-bottom:2px">Check Details</div>
    <table>
      <thead><tr><th>Check #</th><th>Bank</th><th>Effective Date</th><th style="text-align:right">Total Amount</th></tr></thead>
      <tbody>${checkRows}</tbody>
    </table>` : '';

  const totalsHtml = `
    <div style="margin-top:6px;text-align:right;font-size:9px">
      ${t.cash > 0 ? `<div>Cash: <b style="color:#2e7d32">&#8369;${t.cash.toFixed(2)}</b></div>` : ''}
      ${t.check > 0 ? `<div>Check: <b style="color:#1565c0">&#8369;${t.check.toFixed(2)}</b></div>` : ''}
      ${t.online > 0 ? `<div>Online: <b style="color:#6a1b9a">&#8369;${t.online.toFixed(2)}</b></div>` : ''}
      <div style="font-size:11px;font-weight:bold;border-top:2px solid #333;margin-top:3px;padding-top:3px">TOTAL PAYMENTS: &#8369;${t.total.toFixed(2)}</div>
    </div>`;

  const slipContent = `
    <table>
      <thead><tr>
        <th>#</th><th>Date</th><th>DR#</th><th>Vendor</th>
        <th style="text-align:right">Amount</th><th>Method</th><th>Check Ref</th>
      </tr></thead>
      <tbody>${mainRows}</tbody>
    </table>
    ${checkSection}
    ${totalsHtml}`;

  const slip = (label: string) => `
    <div class="slip">
      <div class="copy-label">${label}</div>
      <div class="slip-header">
        <div style="font-size:14px;font-weight:bold">Aberin Hardware</div>
        <div style="font-size:11px;font-weight:bold">PAYMENT VOUCHER</div>
      </div>
      ${slipContent}
      <div class="sig-row">
        <div class="sig"><div>Prepared by</div></div>
        <div class="sig"><div>Approved by</div></div>
      </div>
    </div>`;

  const html = `<!DOCTYPE html><html><head><title>Payment Voucher</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10px; }
    .page { width: 100%; height: 100vh; display: flex; flex-direction: column; }
    .slip { flex: 1; padding: 8px 15px; position: relative; overflow: hidden; display: flex; flex-direction: column; }
    .copy-label { position: absolute; top: 4px; right: 10px; font-size: 9px; color: #999; font-style: italic; }
    .slip-header { margin-bottom: 6px; text-align: center; }
    .divider { height: 0; border-top: 2px dashed #999; text-align: center; font-size: 9px; color: #999; line-height: 0; overflow: visible; }
    .divider span { background: #fff; padding: 0 6px; position: relative; top: -6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; font-size: 10px; }
    th { background: #e8eaf6; font-weight: bold; }
    .sig-row { display: flex; justify-content: space-between; margin-top: auto; padding: 0 20px; padding-top: 10px; }
    .sig { text-align: center; width: 140px; font-size: 10px; }
    .sig div { border-top: 1px solid #333; padding-top: 2px; margin-top: 15px; }
    @media print {
      body { margin: 0; }
      @page { margin: 4mm; size: A4; }
      .page { height: 100vh; page-break-inside: avoid; }
      .no-print { display: none; }
    }
  </style></head><body>
  <div class="page">
    ${slip('ORIGINAL COPY')}
    <div class="divider"><span>&#9988; cut here &#9988;</span></div>
    ${slip('VENDOR COPY')}
  </div>
  <div style="text-align:center;margin:8px 0" class="no-print">
    <button onclick="window.print()" style="padding:6px 18px;cursor:pointer;font-size:11px">&#128424; Print Payment Voucher</button>
  </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

onMounted(() => {
  loadVendors();
  loadJournal();
});
</script>


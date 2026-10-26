<template>
  <PrintLayout title="Asset Accounts">
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="col"><div class="text-h5">Asset Accounts</div></div>
      <div class="col-auto print-hide">
        <q-btn color="primary" label="Initialize Accounts" icon="add_circle" flat @click="initAccounts" />
      </div>
    </div>
    <q-card flat bordered class="q-mb-md bg-grey-1">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-sm">Total Assets Summary</div>
        <div class="row q-col-gutter-md">
          <div class="col-6 col-md"><div class="text-caption">Cash on Hand</div><div class="text-h5 text-positive">{{ fmt(cashBalance) }}</div></div>
          <div class="col-6 col-md"><div class="text-caption">Checks Receivable</div><div class="text-h5 text-info">{{ fmt(checkBalance) }}</div></div>
          <div class="col-6 col-md"><div class="text-caption">Online / E-Wallet</div><div class="text-h5 text-accent">{{ fmt(onlineBalance) }}</div></div>
          <div class="col-6 col-md"><div class="text-caption">Remitted to Bank</div><div class="text-h5 text-deep-purple">{{ fmt(bankBalance) }}</div></div>
          <div class="col-12 col-md"><div class="text-caption text-weight-bold">Grand Total</div><div class="text-h4 text-primary">{{ fmt(grandTotal) }}</div></div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Per-Channel Totals -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-sm">Per-Channel Breakdown</div>
        <div class="row q-col-gutter-md">
          <div class="col-6 col-md-2"><div class="text-caption">BPI</div><div class="text-h6 text-blue">{{ fmt(channelTotals.BPI) }}</div></div>
          <div class="col-6 col-md-2"><div class="text-caption">GCash</div><div class="text-h6 text-blue-8">{{ fmt(channelTotals.GCash) }}</div></div>
          <div class="col-6 col-md-2"><div class="text-caption">AUB</div><div class="text-h6 text-teal">{{ fmt(channelTotals.AUB) }}</div></div>
          <div class="col-6 col-md-2"><div class="text-caption">Cash</div><div class="text-h6 text-positive">{{ fmt(channelTotals.Cash) }}</div></div>
          <div class="col-6 col-md-2"><div class="text-caption">Check</div><div class="text-h6 text-orange">{{ fmt(channelTotals.Check) }}</div></div>
          <div class="col-6 col-md-2"><div class="text-caption">Other</div><div class="text-h6 text-grey">{{ fmt(channelTotals.Other) }}</div></div>
        </div>
      </q-card-section>
    </q-card>

    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="account in accounts" :key="account.accountType" class="col-md-4 col-sm-6 col-xs-12">
        <q-card>
          <q-card-section>
            <div class="row items-center">
              <q-icon :name="accountIcon(account.accountType)" size="28px" :color="accountColor(account.accountType)" class="q-mr-sm" />
              <div class="text-h6">{{ accountLabel(account.accountType) }}</div>
            </div>
            <div class="text-h4 q-mt-sm" :class="'text-' + accountColor(account.accountType)">{{ fmt(account.balance) }}</div>
            <div class="text-caption q-mt-xs">Last updated: {{ new Date(account.updatedAt).toLocaleString() }}</div>
          </q-card-section>
          <q-card-actions>
            <q-btn flat color="primary" label="View Transactions" @click="viewTransactions(account.accountType)" />
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Pending Checks -->
    <q-card flat bordered class="q-mb-md" v-if="pendingChecks.length > 0">
      <q-card-section>
        <div class="row items-center">
          <div class="text-subtitle1 text-weight-bold">Pending Checks ({{ pendingChecks.length }})</div>
          <q-space />
          <q-btn flat color="primary" label="Manage in Check Approvals" to="/check-approvals" size="sm" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Transactions Dialog -->
    <q-dialog v-model="showTransactions" maximized>
      <q-card style="display:flex;flex-direction:column;height:100%;">

        <!-- Sticky header with filters — never scrolls away -->
        <div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e0e0e0;padding:12px 16px;">
          <div class="row items-center q-mb-sm">
            <div class="text-h6">{{ accountLabel(selectedAccount) }} Transactions</div>
            <q-space />
            <q-btn
              icon="print" flat round dense color="primary"
              title="Print filtered transactions"
              @click="printTransactions"
              class="q-mr-sm"
            />
            <q-btn icon="close" flat round dense v-close-popup />
          </div>

          <!-- Date + customer -->
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-md-2 col-sm-4 col-xs-6">
              <q-input v-model="txFilters.startDate" label="Start Date" outlined dense type="date" />
            </div>
            <div class="col-md-2 col-sm-4 col-xs-6">
              <q-input v-model="txFilters.endDate" label="End Date" outlined dense type="date" />
            </div>
            <div class="col-md-4 col-sm-8 col-xs-12">
              <q-input v-model="txFilters.customer" label="Search customer..." outlined dense clearable />
            </div>
            <div class="col-md-2 col-sm-4 col-xs-12 flex items-end">
              <q-btn color="primary" label="Apply" @click="loadTransactions" dense unelevated class="full-width" />
            </div>
          </div>

          <!-- Channel filter as inline chips (no dropdown = no z-index issues) -->
          <div v-if="channelOptions.length" class="q-mb-xs">
            <span class="text-caption text-grey-7 q-mr-sm">Channel:</span>
            <q-chip
              v-for="ch in channelOptions" :key="ch"
              :color="txFilters.channel === ch ? 'primary' : 'grey-3'"
              :text-color="txFilters.channel === ch ? 'white' : 'grey-9'"
              clickable dense
              @click="onChannelClick(ch)"
              class="q-mr-xs"
            >{{ ch }}</q-chip>
          </div>

          <!-- GCash account name filter (only for GCASH) -->
          <div v-if="selectedAccount === 'GCASH' && gcashAccountOptions.length && (!txFilters.channel || txFilters.channel === 'GCash')" class="q-mb-xs">
            <span class="text-caption text-grey-7 q-mr-sm">GCash Account:</span>
            <q-chip
              v-for="acct in gcashAccountOptions" :key="acct"
              :color="txFilters.gcashAccount === acct ? 'deep-purple' : 'grey-3'"
              :text-color="txFilters.gcashAccount === acct ? 'white' : 'grey-9'"
              clickable dense
              @click="txFilters = { ...txFilters, gcashAccount: txFilters.gcashAccount === acct ? '' : acct }"
              class="q-mr-xs"
            >{{ acct }}</q-chip>
          </div>

          <!-- Result count + Grand Total — always visible above table -->
          <div class="row items-center q-mt-xs" v-if="!loadingTx">
            <div class="text-caption text-grey-7">
              {{ filteredTransactions.length }} record(s)
            </div>
            <q-space />
            <div v-if="filteredTransactions.length > 0"
                 style="background:#e8f5e9;padding:4px 12px;border-radius:6px;font-weight:700;color:#1b5e20;font-size:13px;">
              Grand Total: {{ fmt(filteredTotal) }}
            </div>
          </div>
        </div>

        <!-- Scrollable table -->
        <div style="flex:1;overflow:auto;padding:0 16px 16px;">
          <q-table
            :key="tableKey"
            :rows="displayRows"
            :columns="currentColumns"
            row-key="_rowKey"
            :loading="loadingTx"
            flat bordered
            :pagination="{ rowsPerPage: 50 }"
            style="min-width:600px;"
          >
            <template v-slot:no-data>
              <div class="full-width row flex-center q-pa-md text-grey">
                <q-icon name="warning" size="20px" class="q-mr-sm" /> No data available
              </div>
            </template>
            <template v-slot:body-cell-drNumber="props">
              <q-td :props="props">
                <span v-if="props.row.drNumber" class="text-primary text-weight-medium">{{ props.row.drNumber }}</span>
                <span v-else class="text-grey-5">—</span>
              </q-td>
            </template>
            <template v-slot:body-cell-amount="props">
              <q-td :props="props" class="text-right">{{ fmt(props.row.amount) }}</q-td>
            </template>

          </q-table>
        </div>
      </q-card>
    </q-dialog>

    <div class="q-mt-md print-hide"><PrintButton /></div>
  </div>
  </PrintLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAssetStore } from '../stores/assetStore';
import { useCheckStore } from '../stores/checkStore';
import { Notify } from 'quasar';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';

const assetStore = useAssetStore();
const checkStore = useCheckStore();
const accounts = ref<any[]>([]);
const transactions = ref<any[]>([]);
const selectedAccount = ref('');
const showTransactions = ref(false);
const loadingTx = ref(false);
const txFilters = ref({
  startDate: '',
  endDate: '',
  customer: '',
  channel: '' as string,
  gcashAccount: '' as string,
});

const pendingChecks = computed(() => checkStore.checkRecords.filter((r: any) => r.status === 'PENDING'));

// ── Channel options depending on which account is open ───────────────────
const GCASH_CHANNELS = ['GCash', 'BPI Online', 'AUB Online', 'Maya', 'Other'];
const CHECK_CHANNELS = ['BPI', 'AUB', 'BDO', 'Metrobank', 'Check', 'Other'];

const channelOptions = computed(() => {
  if (selectedAccount.value === 'GCASH') return GCASH_CHANNELS;
  if (selectedAccount.value === 'CHECK') return CHECK_CHANNELS;
  return [];
});

// ── Known GCash account names (canonical, case-insensitive mapping) ────────
// Maps all variants found in data to a clean display name.
// Add new accounts here when needed.
const GCASH_ACCOUNT_ALIASES: Record<string, string> = {
  'katrina': 'Katrina', 'kat': 'Katrina', 'kAt': 'Katrina',
  'louie': 'Louie', 'louie ': 'Louie', 'loie': 'Louie',
  'anicia': 'Anicia', 'anica': 'Anicia',
  'mom': 'Mom', 'mommy': 'Mom',
  'anjo': 'Anjo',
};

const extractAcctName = (description: string): string => {
  // Try "Acct: NAME" first (preferred format)
  const acctMatch = description.match(/[-–]\s*Acct:\s*([^-\n]+?)(?:\s*[-–]|$)/i);
  if (acctMatch) {
    const raw = acctMatch[1].trim();
    return GCASH_ACCOUNT_ALIASES[raw.toLowerCase()] || (raw.length > 20 ? '' : raw);
  }
  // Fallback: "Ref: NAME" — only use if it looks like a person name (not a date/number)
  const refMatch = description.match(/[-–]\s*Ref:\s*([^-\n]+?)(?:\s*[-–]|$)/i);
  if (refMatch) {
    const raw = refMatch[1].trim();
    // Skip if it looks like a date (contains /) or is purely numeric
    if (/\//.test(raw) || /^\d+$/.test(raw)) return '';
    const mapped = GCASH_ACCOUNT_ALIASES[raw.toLowerCase()];
    // Only return if we have a known mapping (avoid random ref numbers becoming chips)
    return mapped || '';
  }
  return '';
};

// Deduplicated + normalized account options from actual transactions
const gcashAccountOptions = computed(() => {
  if (selectedAccount.value !== 'GCASH') return [];
  const names = new Set<string>();
  for (const tx of transactions.value) {
    const name = extractAcctName(tx.description || '');
    if (name) names.add(name);
  }
  return Array.from(names).sort();
});

// ── Filtered transactions (client-side) ──────────────────────────────────
const filteredTransactions = computed(() => {
  // Deduplicate: prefer drNumber key (DR#+amount+desc) when available,
  // otherwise fall back to referenceId+amount+desc.
  // This handles cases where multiple payment records share the same DR.
  const seenKeys = new Set<string>();
  let rows = transactions.value.filter((t: any) => {
    const desc = String(t.description || '').trim().toLowerCase();
    const amt = String(t.amount || 0);
    // Use drNumber as primary key if available (most reliable dedup for AUB/BPI)
    const key = t.drNumber
      ? String(t.drNumber) + '|' + amt + '|' + desc
      : String(t.referenceId || '') + '|' + amt + '|' + desc;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Date range filter
  if (txFilters.value.startDate) {
    const from = new Date(txFilters.value.startDate);
    rows = rows.filter((t: any) => new Date(t.date) >= from);
  }
  if (txFilters.value.endDate) {
    const to = new Date(txFilters.value.endDate);
    to.setHours(23, 59, 59, 999);
    rows = rows.filter((t: any) => new Date(t.date) <= to);
  }

  // Customer search
  if (txFilters.value.customer) {
    const s = txFilters.value.customer.toLowerCase();
    rows = rows.filter((t: any) => (t.description || '').toLowerCase().includes(s));
  }

  // Channel filter — match channel name at start of description
  // When gcashAccount is selected but no channel, implicitly filter to GCash
  const effectiveChannel = txFilters.value.channel ||
    (txFilters.value.gcashAccount && selectedAccount.value === 'GCASH' ? 'GCash' : '');
  if (effectiveChannel) {
    const chUpper = effectiveChannel.toUpperCase();
    rows = rows.filter((t: any) =>
      (t.description || '').toUpperCase().startsWith(chUpper + ' ')
    );
  }

  // GCash account name filter
  if (txFilters.value.gcashAccount && selectedAccount.value === 'GCASH') {
    const acct = txFilters.value.gcashAccount.toLowerCase().trim();
    rows = rows.filter((t: any) => {
      const name = extractAcctName(t.description || '').toLowerCase().trim();
      // Compare canonical names (both already mapped through GCASH_ACCOUNT_ALIASES)
      return name === acct;
    });
  }

  // Sort newest first
  rows = [...rows].sort((a: any, b: any) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return rows;
});

// Clear gcashAccount when switching away from GCash channel
const onChannelClick = (ch: string) => {
  if (txFilters.value.channel === ch) {
    txFilters.value = { ...txFilters.value, channel: '' };
  } else {
    txFilters.value = {
      ...txFilters.value,
      channel: ch,
      gcashAccount: ch !== 'GCash' ? '' : txFilters.value.gcashAccount,
    };
  }
};

// tableKey forces q-table to fully re-render when filter changes
// (prevents stale row display due to row-key reuse with duplicate dates)
const tableKey = computed(() =>
  (txFilters.value.channel || '') + '|' + (txFilters.value.gcashAccount || '') + '|' + filteredTransactions.value.length
);

// Extract customer name from description: "GCash payment from Mac Orbano - Acct: Louie" → "Mac Orbano"
const extractCustomerName = (description: string): string => {
  const m = description.match(/payment from (.+?)(?:\s*[-–]|$)/i);
  return m ? m[1].trim() : description;
};

// displayRows adds a unique _rowKey + customerName to each row
const displayRows = computed(() =>
  filteredTransactions.value.map((row: any, idx: number) => ({
    ...row,
    customerName: extractCustomerName(row.description || ''),
    _rowKey: String(row.referenceId || '') + '_' + String(row.amount || '') + '_' + idx,
  }))
);

const filteredTotal = computed(() =>
  filteredTransactions.value
    .filter((t: any) => t.type === 'CREDIT')
    .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
);

// ── Per-channel totals ────────────────────────────────────────────────────
const channelTotals = computed(() => {
  const totals = { BPI: 0, GCash: 0, AUB: 0, Cash: 0, Check: 0, Other: 0 };
  totals.Cash = accounts.value.find(a => a.accountType === 'CASH')?.balance || 0;
  totals.Check = accounts.value.find(a => a.accountType === 'CHECK')?.balance || 0;
  totals.GCash = accounts.value.find(a => a.accountType === 'GCASH')?.balance || 0;
  const checkAcct = accounts.value.find(a => a.accountType === 'CHECK');
  for (const tx of checkAcct?.transactions || []) {
    if (tx.type !== 'CREDIT') continue;
    const desc = (tx.description || '').toUpperCase();
    if (desc.startsWith('BPI')) totals.BPI += tx.amount;
    else if (desc.startsWith('AUB')) totals.AUB += tx.amount;
  }
  totals.Other = Math.max(0, totals.Check - totals.BPI - totals.AUB);
  return totals;
});

const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const cashBalance  = computed(() => accounts.value.find(a => a.accountType === 'CASH')?.balance  || 0);
const checkBalance = computed(() => accounts.value.find(a => a.accountType === 'CHECK')?.balance || 0);
const onlineBalance = computed(() => accounts.value.find(a => a.accountType === 'GCASH')?.balance || 0);
const bankBalance  = computed(() => accounts.value.find(a => a.accountType === 'BANK')?.balance  || 0);
const grandTotal = computed(() => accounts.value.reduce((sum, a) => sum + (a.balance || 0), 0));

const accountIcon  = (t: string) => ({ CASH:'payments', CHECK:'receipt', GCASH:'phone_android', BANK:'account_balance' }[t] || 'account_balance_wallet');
const accountColor = (t: string) => ({ CASH:'positive', CHECK:'info', GCASH:'blue', BANK:'deep-purple' }[t] || 'grey');
const accountLabel = (t: string) => ({ CASH:'Cash on Hand', CHECK:'Checks / Bank Payments', GCASH:'Online / E-Wallet', BANK:'Remitted to Bank' }[t] || t);

const checkColumns = [
  { name:'receivedDate', label:'Date Received', field:'receivedDate', align:'left' as const, sortable:true, format:(v:string) => new Date(v).toLocaleDateString() },
  { name:'customerName', label:'Customer',      field:'customerName', align:'left' as const },
  { name:'referenceNumber', label:'Reference #', field:'referenceNumber', align:'left' as const },
  { name:'amount',  label:'Amount', field:'amount', align:'right' as const, sortable:true },
  { name:'status',  label:'Status', field:'status', align:'center' as const },
  { name:'actions', label:'Actions', field:'',     align:'center' as const },
];

const baseCols = [
  { name:'date',         label:'Date',          field:'date',         align:'left'  as const, sortable:true, format:(v:string) => new Date(v).toLocaleDateString('en-PH') },
  { name:'drNumber',     label:'DR#',           field:'drNumber',     align:'left'  as const, sortable:true },
  { name:'customerName', label:'Customer Name', field:'customerName', align:'left'  as const, sortable:true },
  { name:'amount',       label:'Amount',        field:'amount',       align:'right' as const, sortable:true },
];
const currentColumns = computed(() => baseCols);

const loadAccounts = async () => {
  accounts.value = await assetStore.fetchAssetAccounts();
};

const viewTransactions = async (at: string) => {
  selectedAccount.value = at;
  // Reset filters when switching accounts
  txFilters.value = { startDate: '', endDate: '', customer: '', channel: '', gcashAccount: '' };
  showTransactions.value = true;
  await loadTransactions();
};

const loadTransactions = async () => {
  if (!selectedAccount.value) return;
  loadingTx.value = true;
  try {
    transactions.value = await assetStore.fetchAccountTransactions(selectedAccount.value, txFilters.value);
  } finally {
    loadingTx.value = false;
  }
};

const initAccounts = async () => {
  try {
    await assetStore.initializeAccounts();
    Notify.create({ type: 'positive', message: 'Initialized' });
    await loadAccounts();
  } catch {
    Notify.create({ type: 'negative', message: 'Failed' });
  }
};

const printTransactions = () => {
  const rows = filteredTransactions.value;
  const acctLabel = accountLabel(selectedAccount.value);

  // Build filter summary line
  const filterParts: string[] = [];
  if (txFilters.value.startDate) filterParts.push(`From: ${txFilters.value.startDate}`);
  if (txFilters.value.endDate)   filterParts.push(`To: ${txFilters.value.endDate}`);
  if (txFilters.value.channel)   filterParts.push(`Channel: ${txFilters.value.channel}`);
  if (txFilters.value.gcashAccount) filterParts.push(`Account: ${txFilters.value.gcashAccount}`);
  if (txFilters.value.customer)  filterParts.push(`Customer: ${txFilters.value.customer}`);
  const filterLine = filterParts.length ? filterParts.join('  |  ') : 'All transactions';

  const total = rows
    .filter((r: any) => r.type === 'CREDIT')
    .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  const fmtAmt = (v: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);

  const fmtDate = (v: string) => {
    try { return new Date(v).toLocaleDateString('en-PH'); } catch { return v || ''; }
  };

  const extractCust = (desc: string) => {
    const m = desc.match(/payment from (.+?)(?:\s*[-–]|$)/i);
    return m ? m[1].trim() : desc;
  };

  const trs = rows.map((r: any, i: number) => `
    <tr>
      <td>${i + 1}</td>
      <td>${fmtDate(r.date)}</td>
      <td>${r.drNumber || '—'}</td>
      <td>${extractCust(r.description || '')}</td>
      <td class="amt">${fmtAmt(Number(r.amount || 0))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${acctLabel} Transactions</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 10mm; color: #111; }
  h2 { margin: 0; font-size: 16px; } h3 { margin: 2px 0; font-size: 12px; font-weight: normal; }
  .sub { font-size: 10px; color: #555; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f0f0f0; font-size: 10px; padding: 4px 6px; text-align: left; border: 1px solid #ccc; }
  td { padding: 3px 6px; border: 1px solid #ddd; vertical-align: top; }
  .amt { text-align: right; font-family: monospace; }
  tr:nth-child(even) { background: #fafafa; }
  .badge { padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: bold; color: #fff; }
  .credit { background: #2e7d32; } .debit { background: #c62828; }
  .total-row { background: #e8f5e9; font-weight: bold; }
  .print-btn { text-align: center; margin: 10px 0; }
  @media print { .print-btn { display: none; } body { padding: 4mm; } @page { margin: 6mm; size: A4; } }
</style></head><body>
<h2>Aberin Hardware</h2>
<h3>${acctLabel} Transaction Report</h3>
<div class="sub">${filterLine}</div>
<div class="sub">Records: ${rows.length}  |  Total Credits: ${fmtAmt(total)}</div>
<div class="print-btn"><button onclick="window.print()" style="padding:6px 20px;cursor:pointer;font-size:12px">&#128424; Print</button></div>
<table>
  <thead><tr><th>#</th><th>Date</th><th>DR#</th><th>Customer Name</th><th>Amount</th></tr></thead>
  <tbody>${trs}</tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="4" style="text-align:right">GRAND TOTAL:</td>
      <td class="amt">${fmtAmt(total)}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

</body></html>`;

  // Use Blob URL instead of document.write — avoids hanging in Electron
  // because document.write blocks the calling window's event loop.
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    // Revoke after a delay to free memory (print dialog needs time to load)
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60000);
    else {
      // Fallback if popup blocked
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch {
    // Last resort — document.write
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }
};

onMounted(async () => {
  await loadAccounts();
  await checkStore.fetchCheckRecords({ status: 'PENDING' });
});
</script>













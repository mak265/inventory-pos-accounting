<template>
  <q-page padding>
    <PrintLayout title="Cash Drawer Report">
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Cash Drawer Report</h4>

      <!-- Filters -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-select v-model="selectedCashier" :options="cashierOptions" label="Select Cashier" emit-value map-options outlined dense @update:model-value="onCashierChanged" />
            </div>
            <div class="col-12 col-md-2">
              <q-input v-model="selectedDate" label="Date" type="date" outlined dense />
            </div>
            <div class="col-12 col-md-2">
              <q-input v-model.number="openingBalance" label="Opening Bal." type="number" outlined dense prefix="P" step="0.01" />
            </div>
            <div class="col-6 col-md-2 flex items-end">
              <q-btn label="Generate" color="primary" @click="loadReport" :loading="loading" :disable="!selectedCashier" class="full-width" />
            </div>
            <div class="col-6 col-md-1 flex items-end print-hide">
              <q-btn label="Remit" color="teal" icon="send" @click="showRemitDialog = true" :disable="!selectedCashier" class="full-width" dense />
            </div>
            <div class="col-12 col-md-2 flex items-end print-hide">
              <q-btn label="Close Day" color="orange" icon="lock" @click="showCloseDialog = true" :disable="!report" class="full-width" dense />
            </div>
          </div>
          <div class="row q-col-gutter-sm q-mt-xs print-hide">
            <div class="col-auto"><q-btn label="Advance Payment" color="deep-purple" icon="account_balance_wallet" dense @click="showAdvanceDialog = true" :disable="!selectedCashier" /></div>
            <div class="col-auto"><q-btn label="Adjust Opening" color="blue-grey" icon="add_circle" dense @click="showAdjustDialog = true" :disable="!selectedCashier" /></div>
            <div class="col-auto"><q-btn label="Override Opening" color="pink" icon="edit_calendar" dense outline @click="openOverrideDialog" :disable="!selectedCashier" /></div>
            <div class="col-auto"><q-btn label="Reset History" color="negative" icon="restart_alt" dense outline @click="resetHistoryAction" :disable="!selectedCashier" /></div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Simplified Report Display -->
      <q-card v-if="report" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6 q-mb-md">Simple Cash Drawer</div>

          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">Opening</div><div class="text-h6 text-primary">{{ fmt(simpleOpening) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">All Collections</div><div class="text-h6 text-positive">{{ fmt(totalCollectionsAllMethods) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">Receivables Collected</div><div class="text-h6 text-deep-purple">{{ fmt(receivableCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">Cash on Hand Collections</div><div class="text-h6 text-primary">{{ fmt(cashOnHandCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">GCash Louie</div><div class="text-h6 text-teal">{{ fmt(gcashLouieCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">GCash Katrina</div><div class="text-h6 text-teal">{{ fmt(gcashKatrinaCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">GCash Anicia</div><div class="text-h6 text-teal">{{ fmt(gcashAniciaCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">BPI Online</div><div class="text-h6 text-indigo">{{ fmt(bpiOnlineCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">AUB Online</div><div class="text-h6 text-indigo">{{ fmt(aubOnlineCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">Maya</div><div class="text-h6 text-indigo">{{ fmt(mayaCollections) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered><q-card-section><div class="text-caption">Total Cash Out</div><div class="text-h6 text-negative">{{ fmt(totalCashOut) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-card flat bordered class="bg-amber-1"><q-card-section><div class="text-caption text-weight-bold">Expected Cash</div><div class="text-h6 text-weight-bold">{{ fmt(expectedCash) }}</div></q-card-section></q-card></div>
            <div class="col-6 col-md-2"><q-input v-model.number="actualCashCount" label="Actual Cash Count" type="number" outlined dense prefix="P" step="0.01" /></div>
            <div class="col-6 col-md-2"><q-card flat bordered :class="overShort >= 0 ? 'bg-green-1' : 'bg-red-1'"><q-card-section><div class="text-caption text-weight-bold">Over / Short</div><div class="text-h6 text-weight-bold" :class="overShort >= 0 ? 'text-positive' : 'text-negative'">{{ fmt(overShort) }}</div></q-card-section></q-card></div>
          </div>

          <q-table
            :rows="ledgerRows"
            :columns="ledgerColumns"
            row-key="_idx"
            flat
            bordered
            dense
            :pagination="{ rowsPerPage: 100 }"
          >
            <template v-slot:body-cell-amountIn="props"><q-td :props="props">{{ props.row.amountIn ? fmt(props.row.amountIn) : '-' }}</q-td></template>
            <template v-slot:body-cell-amountOut="props"><q-td :props="props">{{ props.row.amountOut ? fmt(props.row.amountOut) : '-' }}</q-td></template>
            <template v-slot:body-cell-runningBalance="props"><q-td :props="props" class="text-weight-bold">{{ fmt(props.row.runningBalance) }}</q-td></template>
          </q-table>

          <q-separator class="q-my-md" />

          <div class="text-subtitle1 q-mb-sm">Receivables Details Today</div>
          <q-table
            :rows="report.receivableDetails || []"
            :columns="receivableDetailColumns"
            row-key="paymentId"
            flat
            bordered
            dense
            :pagination="{ rowsPerPage: 50 }"
          >
            <template v-slot:body-cell-date="props"><q-td :props="props">{{ fmtDateTime(props.row.date) }}</q-td></template>
            <template v-slot:body-cell-amount="props"><q-td :props="props">{{ fmt(props.row.amount) }}</q-td></template>
          </q-table>

          <q-separator class="q-my-md" />

          <div class="text-subtitle1 q-mb-sm">Matched Source Debug</div>
          <q-expansion-item icon="bug_report" label="Show raw matched rows" dense>
            <q-banner v-if="report.debugSources?.meta" dense inline-actions class="bg-grey-2 q-mb-sm">
              Day: {{ report.debugSources.meta.targetDay }} |
              Payments fetched/matched: {{ report.debugSources.meta.fetchedPayments }}/{{ report.debugSources.meta.matchedPayments }} |
              Checks fetched/matched: {{ report.debugSources.meta.fetchedChecks }}/{{ report.debugSources.meta.matchedChecks }} |
              Asset accounts fetched: {{ report.debugSources.meta.fetchedAssetAccounts }}
            </q-banner>
            <div class="text-caption q-mb-sm">Payments matched by day</div>
            <q-table :rows="report.debugSources?.payments || []" :columns="debugPaymentColumns" row-key="paymentId" flat bordered dense :pagination="{ rowsPerPage: 20 }">
              <template v-slot:body-cell-paymentDate="props"><q-td :props="props">{{ fmtDateTime(props.row.paymentDate) }}</q-td></template>
            </q-table>

            <div class="text-caption q-my-sm">Check records matched by day</div>
            <q-table :rows="report.debugSources?.checks || []" :columns="debugCheckColumns" row-key="paymentId" flat bordered dense :pagination="{ rowsPerPage: 20 }">
              <template v-slot:body-cell-receivedDate="props"><q-td :props="props">{{ fmtDateTime(props.row.receivedDate) }}</q-td></template>
              <template v-slot:body-cell-amount="props"><q-td :props="props">{{ fmt(props.row.amount) }}</q-td></template>
            </q-table>

            <div class="text-caption q-my-sm">Asset account transactions matched by day</div>
            <q-table :rows="report.debugSources?.assetTransactions || []" :columns="debugAssetColumns" row-key="description" flat bordered dense :pagination="{ rowsPerPage: 20 }">
              <template v-slot:body-cell-date="props"><q-td :props="props">{{ fmtDateTime(props.row.date) }}</q-td></template>
              <template v-slot:body-cell-amount="props"><q-td :props="props">{{ fmt(props.row.amount) }}</q-td></template>
            </q-table>
          </q-expansion-item>
        </q-card-section>
      </q-card>

      <!-- History -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6 q-mb-md">Remittance & Closing History</div>
          <q-table :rows="dailyRecords" :columns="historyColumns" row-key="_id" flat bordered :loading="loadingHistory" :pagination="{ rowsPerPage: 25, sortBy: 'date', descending: true }">
            <template v-slot:body-cell-date="props"><q-td :props="props">{{ new Date(props.row.date).toLocaleString() }}</q-td></template>
            <template v-slot:body-cell-type="props"><q-td :props="props"><q-badge :color="props.row.type === 'CLOSE_DAY' ? 'orange' : props.row.type === 'ADVANCE_PAYMENT' ? 'deep-purple' : props.row.type === 'OPENING_ADJUST' ? 'blue-grey' : 'teal'" :label="props.row.type === 'CLOSE_DAY' ? 'Close Day' : props.row.type === 'ADVANCE_PAYMENT' ? 'Advance' : props.row.type === 'OPENING_ADJUST' ? 'Opening Adj.' : 'Remittance'" /></q-td></template>
            <template v-slot:body-cell-remittedAmount="props"><q-td :props="props">{{ fmt(props.row.remittedAmount) }}</q-td></template>
            <template v-slot:body-cell-closingBalance="props"><q-td :props="props">{{ props.row.closingBalance ? fmt(props.row.closingBalance) : '-' }}</q-td></template>
            <template v-slot:body-cell-carryOver="props"><q-td :props="props"><span v-if="props.row.carryOver !== undefined" class="text-weight-bold text-positive">{{ fmt(props.row.carryOver) }}</span><span v-else>-</span></q-td></template>
            <template v-slot:body-cell-actions="props">
              <q-td :props="props">
                <q-btn v-if="props.row.type === 'ADVANCE_PAYMENT' || props.row.type === 'OPENING_ADJUST'" flat dense round icon="delete" color="negative" @click="deleteRecord(props.row)"><q-tooltip>Delete</q-tooltip></q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

      <div v-if="report" class="q-mt-md row q-gutter-sm print-hide">
        <q-btn label="Export PDF" color="primary" outline icon="picture_as_pdf" @click="exportToPDF" />
        <q-btn label="Export Excel" color="positive" outline icon="table_chart" @click="exportToExcel" />
        <q-btn label="Print Report" color="deep-purple" outline icon="receipt_long" @click="printCashDrawer" :loading="printLoading" />
        <PrintButton />
      </div>
    </div>
    </PrintLayout>

    <!-- Remit Cash Dialog -->
    <q-dialog v-model="showRemitDialog" persistent>
      <q-card style="min-width: 400px">
        <q-card-section><div class="text-h6 text-teal">Remit Cash</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-body2">You can remit cash up to 5 times per day.</div>
          <q-input v-model.number="remitForm.amount" label="Amount to Remit *" type="number" outlined dense prefix="P" :rules="[v => v > 0 || 'Must be > 0']" autofocus />
          <q-input v-model="remitForm.notes" label="Notes (optional)" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showRemitDialog = false" />
          <q-btn label="Remit" color="teal" @click="remitCashAction" :loading="remitting" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Close Day Dialog -->
    <q-dialog v-model="showCloseDialog" persistent>
      <q-card style="min-width: 460px">
        <q-card-section><div class="text-h6 text-orange">Close Day</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-body2">This saves the day's snapshot. Carry-over becomes tomorrow's opening balance.</div>
          <div class="row q-col-gutter-md q-mt-sm">
            <div class="col-6">
              <div class="text-caption">Expected Closing (Math)</div>
              <div class="text-weight-bold" style="font-size:16px">{{ fmt(report?.closingBalance || 0) }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption">Actual Cash Count (Physical)</div>
              <div class="text-weight-bold text-primary" style="font-size:16px">{{ fmt(actualCashCount) }}</div>
            </div>
          </div>
          <div class="q-mt-md">
            <div class="text-caption">Over / Short</div>
            <div class="text-weight-bold" :style="{ fontSize: '18px', color: overShort < -0.01 ? '#c62828' : overShort > 0.01 ? '#2e7d32' : '#2e7d32' }">
              {{ overShort === 0 ? '— zero —' : (overShort < 0 ? '-' : '+') }} {{ fmt(Math.abs(overShort)) }}
            </div>
            <div class="text-caption q-mt-xs text-italic" :style="{ color: overShort < -0.01 ? '#c62828' : '#666' }">
              {{ overShort < -0.01 ? '⚠️ SHORT: physical cash is LESS than expected (investigate).' : overShort > 0.01 ? '✅ OVER: physical cash is MORE than expected.' : '✅ Matches expected exactly.' }}
            </div>
          </div>
          <div class="q-mt-md">
            <q-checkbox v-model="closeForm.zeroCarryOver" label="Zero opening bukas (alisin lahat ng cash sa drawer)" dense />
            <div v-if="closeForm.zeroCarryOver" class="text-caption text-rose q-ml-md">→ Carry-over = 0 (bukas ang opening balance ay zero)</div>
            <div v-else class="text-caption text-grey-8 q-ml-md">→ Carry-over = {{ fmt(actualCashCount) }} (physical cash left in drawer)</div>
          </div>
          <q-input v-model="closeForm.notes" label="Notes (optional)" outlined dense class="q-mt-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showCloseDialog = false" />
          <q-btn label="Close Day" color="orange" @click="closeDayAction" :loading="closing" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Advance Payment Dialog -->
    <q-dialog v-model="showAdvanceDialog" persistent>
      <q-card style="min-width: 450px">
        <q-card-section><div class="text-h6 text-deep-purple">Accept Advance Payment</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-select v-model="advanceForm.customerId" :options="customerOptions" option-value="value" option-label="label" emit-value map-options label="Customer *" outlined dense use-input input-debounce="200" @filter="filterCustomers" />
          <q-input v-model.number="advanceForm.amount" label="Amount *" type="number" outlined dense prefix="P" :rules="[v => v > 0 || 'Must be > 0']" autofocus />
          <q-select
            v-model="advanceForm.paymentChannel"
            :options="['CASH','GCASH','BPI ONLINE','AUB ONLINE','MAYA','CHECK']"
            label="Payment Channel *"
            outlined
            dense
          />
          <q-input
            v-if="advanceForm.paymentChannel === 'GCASH'"
            v-model="advanceForm.paymentAccountName"
            label="GCash Account (Louie/Katrina/Anicia)"
            outlined
            dense
          />
          <q-input v-model="advanceForm.paymentReference" label="Reference Number (optional)" outlined dense />
          <q-input v-model="advanceForm.notes" label="Notes" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showAdvanceDialog = false" />
          <q-btn label="Accept Payment" color="deep-purple" @click="acceptAdvance" :loading="advanceProcessing" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Adjust Opening Balance Dialog -->
    <q-dialog v-model="showAdjustDialog" persistent>
      <q-card style="min-width: 400px">
        <q-card-section><div class="text-h6 text-blue-grey">Adjust Opening Balance</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-body2">Current opening: {{ fmt(openingBalance) }}</div>
          <q-input v-model.number="adjustForm.amount" label="Additional Amount *" type="number" outlined dense prefix="P" :rules="[v => v > 0 || 'Must be > 0']" autofocus />
          <q-input v-model="adjustForm.notes" label="Notes / Reason *" outlined dense placeholder="e.g. Extra cash from owner" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showAdjustDialog = false" />
          <q-btn label="Add to Opening" color="blue-grey" @click="adjustOpening" :loading="adjustProcessing" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Override Opening Balance Dialog (TEMP WORKAROUND) -->
    <q-dialog v-model="showOverrideDialog" persistent>
      <q-card style="min-width: 400px">
        <q-card-section><div class="text-h6 text-pink">Override Opening Balance (Local Fix)</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="text-body2 q-mb-sm text-pink-10">
            ⚠️ This sets opening balance ONLY on YOUR browser via localStorage (per cashier + date).
            <br />Use only if the Adjust Opening button continues to fail saving to the database.
            <br />For: {{ selectedCashier }} @ {{ selectedDate }}
          </div>
          <q-input v-model.number="overrideForm.amount" label="Override Opening Amount" type="number" outlined dense prefix="P" step="0.01" :rules="[v => (v >= 0) || 'Must be >= 0 (set 0 to clear override)']" autofocus />
          <div class="text-caption text-grey-6">Current override: {{ fmt(currentOpeningOverride) }} — set 0 to remove</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showOverrideDialog = false" />
          <q-btn label="Clear Override" flat color="grey" @click="submitOverride(0)" />
          <q-btn label="Apply Override" color="pink" @click="submitOverride(overrideForm.amount)" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../boot/axios';
import { Notify, useQuasar } from 'quasar';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';
import { formatDateYYYYMMDDLocal } from '../utils/date';

const $q = useQuasar();

const selectedCashier = ref('');
const selectedDate = ref('');
const openingBalance = ref(0);
const loading = ref(false);
const report = ref<any>(null);
const cashierOptions = ref<{ label: string; value: string }[]>([]);
const dailyRecords = ref<any[]>([]);
const loadingHistory = ref(false);
const showRemitDialog = ref(false);
const showCloseDialog = ref(false);
const showAdvanceDialog = ref(false);
const showAdjustDialog = ref(false);
const remitting = ref(false);
const closing = ref(false);
const advanceProcessing = ref(false);
const adjustProcessing = ref(false);
const printLoading = ref(false);
const remitForm = ref({ amount: 0, notes: '' });
const closeForm = ref({ notes: '', zeroCarryOver: false });
const advanceForm = ref({
  customerId: '',
  amount: 0,
  paymentChannel: 'CASH',
  paymentAccountName: '',
  paymentReference: '',
  notes: ''
});
const adjustForm = ref({ amount: 0, notes: '' });
const customerOptions = ref<{ label: string; value: string }[]>([]);
const allCustomers = ref<any[]>([]);
const actualCashCount = ref(0);
const CASH_DRAWER_STATE_KEY = 'cash-drawer-state-v1';

const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-PH') : '';
const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString('en-PH') : '';

const pad2 = (n: number) => n < 10 ? `0${n}` : String(n);
const manilaDayKey = (input: Date | string | number | undefined | null): string => {
  if (!input) return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';
  const ms = d.getTime() + 8 * 60 * 60 * 1000;
  const shifted = new Date(ms);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
};
const OPENING_OVERRIDE_KEY = 'cash-drawer-opening-override-v1';
type OpeningOverrideMap = Record<string, number>;
const loadOpeningOverrideMap = (): OpeningOverrideMap => {
  try {
    const raw = localStorage.getItem(OPENING_OVERRIDE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch { return {}; }
};
const saveOpeningOverrideMap = (m: OpeningOverrideMap) => {
  try { localStorage.setItem(OPENING_OVERRIDE_KEY, JSON.stringify(m)); } catch {}
};
const openingOverrideKey = computed(() => `${String(selectedCashier.value || '')}@${String(selectedDate.value || '')}`);
const currentOpeningOverride = ref(0);
const refreshOverride = () => {
  const m = loadOpeningOverrideMap();
  currentOpeningOverride.value = Number(m[openingOverrideKey.value] || 0);
};
const setOpeningOverride = (v: number) => {
  const m = loadOpeningOverrideMap();
  if (v > 0) { m[openingOverrideKey.value] = v; } else { delete m[openingOverrideKey.value]; }
  saveOpeningOverrideMap(m);
  refreshOverride();
};
const showOverrideDialog = ref(false);
const overrideForm = ref({ amount: 0 });

const todayAdjustments = computed(() => {
  return dailyRecords.value.filter((r: any) => {
    if (r.type !== 'ADVANCE_PAYMENT' && r.type !== 'OPENING_ADJUST') return false;
    if (!selectedDate.value) return false;
    const recKey = manilaDayKey(r.date);
    return recKey === selectedDate.value;
  });
});
const todayAdjustTotal = computed(() => todayAdjustments.value.reduce((s: number, r: any) => s + (r.remittedAmount || 0), 0));
const todayAdvancePaymentTotal = computed(() => {
  return dailyRecords.value.reduce((s: number, r: any) => {
    if (r.type !== 'ADVANCE_PAYMENT') return s;
    if (!selectedDate.value) return s;
    if (manilaDayKey(r.date) !== selectedDate.value) return s;
    return s + Number(r.remittedAmount || 0);
  }, 0);
});

const todayRemittances = computed(() => {
  return dailyRecords.value.filter((r: any) => {
    if (r.type !== 'REMITTANCE') return false;
    if (!selectedDate.value) return false;
    const recKey = manilaDayKey(r.date);
    return recKey === selectedDate.value;
  });
});
const todayRemitTotal = computed(() => todayRemittances.value.reduce((s: number, r: any) => s + (r.remittedAmount || 0), 0));

const computeManualOpeningFromHistory = (records: any[], dateStr: string): { opening: number; carryOver: number; adjTotal: number; lastClose: any; lastRemit: any; debug: string[] } => {
  const debugs: string[] = [];
  if (!dateStr) return { opening: 0, carryOver: 0, adjTotal: 0, lastClose: null, lastRemit: null, debug: ['no date'] };
  const targetStart = new Date(`${dateStr}T00:00:00`).getTime();

  // 1. Find the MOST RECENT CLOSE_DAY record BEFORE target date
  const allCloses = records
    .filter((r: any) => r.type === 'CLOSE_DAY')
    .map((r: any) => ({ ...r, _t: new Date(r.date).getTime(), _k: manilaDayKey(r.date) }))
    .sort((a: any, b: any) => b._t - a._t);
  debugs.push(`[MANUAL-OPEN] allCloses found=${allCloses.length}`);
  allCloses.slice(0, 5).forEach((c: any, i: number) => {
    debugs.push(`[MANUAL-OPEN]   close[${i}] manilaKey=${c._k} t=${c._t} carryOver=${c.carryOver} opening=${c.openingBalance} closing=${c.closingBalance}`);
  });
  const lastClose = allCloses.find((c: any) => c._k < dateStr) || null;
  debugs.push(`[MANUAL-OPEN] lastClose before ${dateStr}: ${lastClose ? `manilaKey=${lastClose._k} carryOver=${lastClose.carryOver} closing=${lastClose.closingBalance}` : 'NULL'}`);

  // 2. Find the MOST RECENT REMITTANCE with carryOver field BEFORE target date
  const allRemits = records
    .filter((r: any) => r.type === 'REMITTANCE' && (r.carryOver !== undefined && r.carryOver !== null))
    .map((r: any) => ({ ...r, _t: new Date(r.date).getTime(), _k: manilaDayKey(r.date) }))
    .sort((a: any, b: any) => b._t - a._t);
  debugs.push(`[MANUAL-OPEN] remitsWithCarryOver found=${allRemits.length}`);
  allRemits.slice(0, 3).forEach((rm: any, i: number) => {
    debugs.push(`[MANUAL-OPEN]   remit[${i}] manilaKey=${rm._k} carryOver=${rm.carryOver}`);
  });
  const lastRemit = allRemits.find((rm: any) => rm._k < dateStr) || null;
  debugs.push(`[MANUAL-OPEN] lastRemit before ${dateStr}: ${lastRemit ? `manilaKey=${lastRemit._k} carryOver=${lastRemit.carryOver}` : 'NULL'}`);

  // 3. Resolve previous day carry-over: prefer CLOSE_DAY (latest by date), else REMIT
  let carryOver = 0;
  const cands: any[] = [];
  if (lastClose && lastClose.carryOver !== undefined && lastClose.carryOver !== null) cands.push(lastClose);
  if (lastRemit && lastRemit.carryOver !== undefined && lastRemit.carryOver !== null) cands.push(lastRemit);
  cands.sort((a, b) => b._t - a._t);
  if (cands.length > 0) {
    carryOver = Number(cands[0].carryOver || 0);
  } else if (lastClose && lastClose.closingBalance) {
    carryOver = Number(lastClose.closingBalance || 0);
    debugs.push(`[MANUAL-OPEN] carryOver fallback: lastClose has NO carryOver field, using closingBalance=${carryOver}`);
  }
  debugs.push(`[MANUAL-OPEN] carryOverFinal=${carryOver} (from candidates=${cands.length} types=${cands.map((c) => c.type).join(',')})`);

  // 4. Today's OPENING_ADJUST records — use manilaDayKey for exact match
  const todaysAdjs = records.filter((r: any) => {
    if (r.type !== 'OPENING_ADJUST') return false;
    return manilaDayKey(r.date) === dateStr;
  });
  const adjTotal = todaysAdjs.reduce((s: number, a: any) => s + Number(a.remittedAmount || 0), 0);
  debugs.push(`[MANUAL-OPEN] todaysOpeningAdjusts=${todaysAdjs.length} total=${adjTotal}`);
  todaysAdjs.forEach((a: any, i: number) => {
    debugs.push(`[MANUAL-OPEN]   adj[${i}] manilaKey=${manilaDayKey(a.date)} amount=${a.remittedAmount} embedded_openingBalance=${a.openingBalance}`);
  });

  const opening = carryOver + adjTotal;
  debugs.push(`[MANUAL-OPEN] FINAL_MANUAL_OPENING=${opening}  (carryOver=${carryOver} + adjusts=${adjTotal})`);
  return { opening, carryOver, adjTotal, lastClose, lastRemit, debug: debugs };
};

const manualOpeningDiagnostic = computed(() => {
  return computeManualOpeningFromHistory(dailyRecords.value || [], selectedDate.value || '');
});

const simpleOpening = computed(() => {
  refreshOverride();
  const fromReport = Number(report.value?.openingBalance || 0);
  const fromInput = Number(openingBalance.value || 0);
  const latestAdj = [...todayAdjustments.value]
    .filter((r: any) => r.type === 'OPENING_ADJUST')
    .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
  const fromLatestAdjust = latestAdj ? Number(latestAdj.openingBalance || 0) : 0;
  const todaySumAdj = Number(todayAdjustTotal.value || 0);
  const baseFromReport = fromReport > 0 ? fromReport : fromInput;
  const fromHistoryCalc = Number(manualOpeningDiagnostic.value.opening || 0);
  const fromOverride = Number(currentOpeningOverride.value || 0);
  const withAdjFallBack = Math.max(
    fromReport,
    fromInput,
    fromLatestAdjust,
    fromHistoryCalc,
    fromOverride,
    baseFromReport + (todaySumAdj && fromLatestAdjust === 0 ? todaySumAdj : 0)
  );
  console.log(`[DEBUG-FRONT] simpleOpening breakdown: fromReport=${fromReport} fromInput=${fromInput} fromLatestAdj=${fromLatestAdjust} fromHistory=${fromHistoryCalc} fromOverride=${fromOverride} todaySumAdj=${todaySumAdj} -> FINAL=${withAdjFallBack}  [manilaKey=${selectedDate.value}]`);
  return withAdjFallBack || 0;
});
const simpleCashSales = computed(() => report.value?.cashSales || 0);
const simpleRepayments = computed(() => report.value?.repayments || 0);
const simpleExpenses = computed(() => report.value?.expenses || 0);
const receivableCollections = computed(() => report.value?.receivableCollections || 0);

const cashOnHandCollections = computed(() => report.value?.channelBreakdown?.cashOnHand || simpleCashSales.value);
const gcashCollections = computed(() => report.value?.channelBreakdown?.gcash || 0);
const gcashLouieCollections = computed(() => report.value?.channelBreakdown?.gcashLouie || 0);
const gcashKatrinaCollections = computed(() => report.value?.channelBreakdown?.gcashKatrina || 0);
const gcashAniciaCollections = computed(() => report.value?.channelBreakdown?.gcashAnicia || 0);
const bpiOnlineCollections = computed(() => report.value?.channelBreakdown?.bpiOnline || 0);
const aubOnlineCollections = computed(() => report.value?.channelBreakdown?.aubOnline || 0);
const mayaCollections = computed(() => report.value?.channelBreakdown?.maya || 0);
const checkCollections = computed(() => report.value?.channelBreakdown?.bankAndCheck ?? report.value?.channelBreakdown?.onlineBanking ?? 0);
const onlineOtherCollections = computed(() => report.value?.channelBreakdown?.onlineOther || 0);
const totalCollectionsAllMethods = computed(() => {
  // Sum visible collection buckets exactly once.
  return cashOnHandCollections.value
    + checkCollections.value
    + gcashCollections.value
    + bpiOnlineCollections.value
    + aubOnlineCollections.value
    + mayaCollections.value;
});

const totalCashIn = computed(() => cashOnHandCollections.value + simpleRepayments.value + todayAdvancePaymentTotal.value);
const totalCashOut = computed(() => simpleExpenses.value + todayRemitTotal.value);
const expectedCash = computed(() => simpleOpening.value + totalCashIn.value - totalCashOut.value);
const overShort = computed(() => (actualCashCount.value || 0) - expectedCash.value);

const ledgerColumns = [
  { name: 'time', label: 'Time', field: 'time', align: 'left' as const },
  { name: 'type', label: 'Type', field: 'type', align: 'center' as const },
  { name: 'source', label: 'Source', field: 'source', align: 'left' as const },
  { name: 'reference', label: 'Reference', field: 'reference', align: 'left' as const },
  { name: 'amountIn', label: 'Amount In', field: 'amountIn', align: 'right' as const },
  { name: 'amountOut', label: 'Amount Out', field: 'amountOut', align: 'right' as const },
  { name: 'runningBalance', label: 'Running Balance', field: 'runningBalance', align: 'right' as const },
];

const receivableDetailColumns = [
  { name: 'source', label: 'Source', field: 'source', align: 'left' as const },
  { name: 'date', label: 'Date/Time', field: 'date', align: 'left' as const },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const },
  { name: 'reference', label: 'Reference', field: 'reference', align: 'left' as const },
  { name: 'accountName', label: 'Account', field: 'accountName', align: 'left' as const },
  { name: 'paymentId', label: 'Payment ID', field: 'paymentId', align: 'left' as const },
  { name: 'note', label: 'Note', field: 'note', align: 'left' as const },
];

const debugPaymentColumns = [
  { name: 'paymentId', label: 'Payment ID', field: 'paymentId', align: 'left' as const },
  { name: 'paymentDate', label: 'Payment Date', field: 'paymentDate', align: 'left' as const },
  { name: 'totalPaid', label: 'Total Paid', field: 'totalPaid', align: 'right' as const },
  { name: 'cashPayment', label: 'Cash', field: 'cashPayment', align: 'right' as const },
];

const debugCheckColumns = [
  { name: 'paymentId', label: 'Payment ID', field: 'paymentId', align: 'left' as const },
  { name: 'receivedDate', label: 'Received Date', field: 'receivedDate', align: 'left' as const },
  { name: 'customerName', label: 'Customer/Vendor', field: 'customerName', align: 'left' as const },
  { name: 'referenceNumber', label: 'Reference', field: 'referenceNumber', align: 'left' as const },
  { name: 'accountName', label: 'Account', field: 'accountName', align: 'left' as const },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const },
];

const debugAssetColumns = [
  { name: 'accountType', label: 'Account Type', field: 'accountType', align: 'left' as const },
  { name: 'date', label: 'Date/Time', field: 'date', align: 'left' as const },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const },
  { name: 'referenceType', label: 'Reference Type', field: 'referenceType', align: 'left' as const },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
];

const ledgerRows = computed(() => {
  if (!report.value) return [];

  const rows: any[] = [];
  let running = 0;
  let idx = 0;

  const pushIn = (source: string, reference: string, amount: number, time = '08:00') => {
    if (!amount || amount <= 0) return;
    running += amount;
    rows.push({ _idx: idx++, time, type: 'IN', source, reference, amountIn: amount, amountOut: 0, runningBalance: running });
  };
  const pushOut = (source: string, reference: string, amount: number, time = '17:00') => {
    if (!amount || amount <= 0) return;
    running -= amount;
    rows.push({ _idx: idx++, time, type: 'OUT', source, reference, amountIn: 0, amountOut: amount, runningBalance: running });
  };

  pushIn('Opening', 'Opening Balance', simpleOpening.value, '08:00');
  pushIn('Sales', 'Cash on Hand Collections', cashOnHandCollections.value, '12:00');
  pushIn('Payment Collection', 'Repayments', simpleRepayments.value, '12:30');

  todayAdjustments.value.forEach((adj: any) => {
    const source = adj.type === 'ADVANCE_PAYMENT' ? 'Advance Payment' : 'Opening Adjustment';
    const ref = adj.type === 'ADVANCE_PAYMENT' ? (adj.customerName || 'Customer') : (adj.notes || 'Adjustment');
    const time = adj.date ? new Date(adj.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '13:00';
    const amt = Number(adj.remittedAmount || 0);
    if (adj.type === 'ADVANCE_PAYMENT') {
      pushIn(source, ref, amt, time);
    }
  });

  const expenseBreakdown = report.value?.expenseBreakdown || [];
  if (expenseBreakdown.length > 0) {
    expenseBreakdown.forEach((exp: any) => {
      const ref = `${exp.description || 'Expense'}${exp.category ? ' (' + exp.category + ')' : ''}`;
      const time = exp.date ? new Date(exp.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '15:00';
      pushOut('Expense', ref, exp.amount || 0, time);
    });
  } else {
    pushOut('Expense', 'Daily Expenses', simpleExpenses.value, '15:00');
  }

  todayRemittances.value.forEach((rem: any, i: number) => {
    const time = rem.date ? new Date(rem.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '16:00';
    pushOut('Cash Out', `Remittance #${i + 1}`, rem.remittedAmount || 0, time);
  });

  return rows;
});

const historyColumns = [
  { name: 'date', label: 'Date/Time', field: 'date', align: 'left' as const, sortable: true },
  { name: 'type', label: 'Type', field: 'type', align: 'center' as const },
  { name: 'cashierName', label: 'Cashier', field: 'cashierName', align: 'left' as const },
  { name: 'remittedAmount', label: 'Amount', field: 'remittedAmount', align: 'right' as const },
  { name: 'closingBalance', label: 'Closing', field: 'closingBalance', align: 'right' as const },
  { name: 'carryOver', label: 'Carry-Over', field: 'carryOver', align: 'right' as const },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' as const },
  { name: 'actions', label: '', field: '', align: 'center' as const },
];

const persistCashDrawerState = () => {
  try {
    const state = {
      selectedCashier: selectedCashier.value,
      selectedDate: selectedDate.value,
      openingBalance: openingBalance.value,
      actualCashCount: actualCashCount.value,
      report: report.value
    };
    localStorage.setItem(CASH_DRAWER_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage failures.
  }
};

const loadOpeningBalance = async () => {
  if (!selectedCashier.value) {
    openingBalance.value = 0;
    return 0;
  }

  try {
    const r = await api.get(`/daily-cash-drawer/opening-balance/${selectedCashier.value}`, {
      params: selectedDate.value ? { date: selectedDate.value } : {}
    });
    const balance = Number(r.data?.openingBalance || 0);
    console.log(`[DEBUG-FRONT] loadOpeningBalance cashier=${selectedCashier.value} date=${selectedDate.value} => API balance=${balance}`);
    console.log(`[DEBUG-FRONT] loadOpeningBalance API fields: keys=${Object.keys(r.data || {}).join(',')}`);
    if (r.data?._debug) {
      console.log(`[DEBUG-FRONT] loadOpeningBalance _debug payload:`, JSON.parse(JSON.stringify(r.data._debug)));
    } else {
      console.log(`[DEBUG-FRONT] loadOpeningBalance NO _debug in response (backend may need restart)`);
    }
    openingBalance.value = balance;
    return balance;
  } catch (e) {
    console.error(`[DEBUG-FRONT] loadOpeningBalance FAILED:`, e);
    openingBalance.value = 0;
    return 0;
  }
};

const restoreCashDrawerState = () => {
  try {
    const raw = localStorage.getItem(CASH_DRAWER_STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object') return;

    selectedCashier.value = state.selectedCashier || '';
    const savedDate = state.selectedDate || '';
    if (savedDate && savedDate === selectedDate.value) {
      openingBalance.value = Number(state.openingBalance || 0);
      actualCashCount.value = Number(state.actualCashCount || 0);
      report.value = state.report || null;
    } else {
      openingBalance.value = 0;
      actualCashCount.value = 0;
      report.value = null;
    }
    if (savedDate) selectedDate.value = savedDate;
  } catch {
    // Ignore invalid cached state.
  }
};

const loadCashiers = async () => {
  try { const r = await api.get('/users'); cashierOptions.value = r.data.map((u: any) => ({ label: u.fullName || u.username, value: u._id })); } catch { cashierOptions.value = []; }
};

const onCashierChanged = async () => {
  if (!selectedCashier.value) return;
  report.value = null;
  actualCashCount.value = 0;
  openingBalance.value = 0;
  refreshOverride();
  try {
    const carryOver = await loadOpeningBalance();
    if (carryOver > 0) {
      $q.dialog({
        title: 'Opening Balance',
        message: `Carry-over from last session: P${carryOver.toFixed(2)}. Do you want to add more cash to the opening balance?`,
        prompt: { model: '0', type: 'number', label: 'Additional Cash (P)', hint: 'Enter 0 to keep as is' },
        cancel: true, persistent: false
      }).onOk((val: string) => {
        const extra = parseFloat(val) || 0;
        if (extra > 0) openingBalance.value = carryOver + extra;
      });
    }
  } catch { openingBalance.value = 0; }
  await loadDailyRecords();
  if (selectedDate.value) {
    await loadReport();
  }
};

const loadReport = async () => {
  if (!selectedCashier.value || !selectedDate.value) return;
  loading.value = true;
  try {
    await loadDailyRecords();
    console.log(`[DEBUG-FRONT] ============ FULL dailyRecords inventory (${dailyRecords.value.length} records) ============`);
    if (dailyRecords.value.length === 0) {
      console.log(`[DEBUG-FRONT] dailyRecords is EMPTY! No cashier records at all for this cashier.`);
    } else {
      const inv = dailyRecords.value.map((r: any, i: number) => ({
        idx: i,
        type: r.type,
        dateIso: new Date(r.date).toISOString(),
        dateLocal: formatDateYYYYMMDDLocal(r.date),
        remittedAmount: r.remittedAmount,
        carryOver: r.carryOver,
        openingBalance: r.openingBalance,
        closingBalance: r.closingBalance,
        notes: (r.notes || '').slice(0, 40)
      }));
      console.table(inv);
      inv.forEach((row: any) => {
        if (row.type === 'OPENING_ADJUST') {
          console.log(`[DEBUG-FRONT]   OPENING_ADJUST @ ${row.dateLocal} (${row.dateIso}) => remittedAmount=${row.remittedAmount} opens=${row.openingBalance}  matchesToday? ${row.dateLocal === selectedDate.value}`);
        }
      });
    }
    console.log(`[DEBUG-FRONT] =========================================================================`);
    await loadOpeningBalance();
    console.log(`[DEBUG-FRONT] loadReport BEFORE API: cashier=${selectedCashier.value} date=${selectedDate.value} openingInput=${openingBalance.value}`);
    console.log(`[DEBUG-FRONT] Manual opening diagnostic (from History):`);
    manualOpeningDiagnostic.value.debug.forEach((line) => console.log(`  ${line}`));
    console.log(`[DEBUG-FRONT] Manual FINAL=${manualOpeningDiagnostic.value.opening} carryOver=${manualOpeningDiagnostic.value.carryOver} adjusts=${manualOpeningDiagnostic.value.adjTotal}`);
    const r = await api.get(`/reports/cash-drawer/${selectedCashier.value}`, { params: { date: selectedDate.value } });
    console.log(`[DEBUG-FRONT] loadReport API returned: report.openingBalance=${r.data?.openingBalance} report.cashOnHand=${r.data?.cashOnHand} report.closingBalance=${r.data?.closingBalance}`);
    console.log(`[DEBUG-FRONT] loadReport API fields: keys=${Object.keys(r.data || {}).join(',')}`);
    if (r.data?._openingDebug) {
      console.log(`[DEBUG-FRONT] loadReport _openingDebug.payload.top:`);
      console.log(`[DEBUG-FRONT]   targetKey=${r.data._openingDebug.targetKey}`);
      console.log(`[DEBUG-FRONT]   targetRangeStart=${r.data._openingDebug.targetRangeStart}`);
      console.log(`[DEBUG-FRONT]   targetRangeEnd=${r.data._openingDebug.targetRangeEnd}`);
      console.log(`[DEBUG-FRONT]   lastClose=${JSON.stringify(r.data._openingDebug.lastClose)}`);
      console.log(`[DEBUG-FRONT]   lastRemit=${JSON.stringify(r.data._openingDebug.lastRemit)}`);
      console.log(`[DEBUG-FRONT]   carryOver=${r.data._openingDebug.carryOver}  candidates=${r.data._openingDebug.carryOverCandidates?.length || 0}`);
      console.log(`[DEBUG-FRONT]   FINAL_OPENING_fromDebug=${r.data._openingDebug.finalOpening}`);
      console.log(`[DEBUG-FRONT]   last20Close (${r.data._openingDebug.last20Close?.length || 0}):`, JSON.parse(JSON.stringify(r.data._openingDebug.last20Close || [])));
      console.log(`[DEBUG-FRONT]   last20RemitWithCarryOver (${r.data._openingDebug.last20RemitWithCarryOver?.length || 0}):`, JSON.parse(JSON.stringify(r.data._openingDebug.last20RemitWithCarryOver || [])));
      console.log(`[DEBUG-FRONT]   allOpeningAdjustmentsLast50 (${r.data._openingDebug.allOpeningAdjustmentsLast50?.length || 0}):`, JSON.parse(JSON.stringify(r.data._openingDebug.allOpeningAdjustmentsLast50 || [])));
      console.log(`[DEBUG-FRONT]   todayOpeningAdjustsCount=${r.data._openingDebug.todayOpeningAdjustmentsCount} total=${r.data._openingDebug.todayOpeningAdjustmentsTotal}`);
    } else {
      console.log(`[DEBUG-FRONT] loadReport NO _openingDebug in response (backend may need restart)`);
    }
    report.value = r.data;
    if (r.data?.openingBalance !== undefined) {
      openingBalance.value = Number(r.data.openingBalance || 0);
      console.log(`[DEBUG-FRONT] loadReport: openingBalance.value updated from API to ${openingBalance.value}`);
    }
    console.log(`[DEBUG-FRONT] loadReport AFTER: simpleOpening=${simpleOpening.value} fromReport=${Number(report.value?.openingBalance || 0)} fromInput=${Number(openingBalance.value || 0)} fromHistory=${Number(manualOpeningDiagnostic.value.opening || 0)} todayAdjustTotal=${todayAdjustTotal.value} todayAdjustments.length=${todayAdjustments.value.length}`);
    actualCashCount.value = report.value?.cashOnHand || report.value?.closingBalance || expectedCash.value;
  }
  catch (e: any) {
    console.error('[DEBUG-FRONT] loadReport FAILED:', e);
    Notify.create({
      type: 'negative',
      message: e?.response?.data?.error || e?.message || 'Failed to load cash drawer report'
    });
  }
  finally { loading.value = false; }
};

const loadDailyRecords = async () => {
  loadingHistory.value = true;
  try { const p: any = {}; if (selectedCashier.value) p.cashierId = selectedCashier.value; const r = await api.get('/daily-cash-drawer', { params: p }); dailyRecords.value = r.data; }
  catch { dailyRecords.value = []; }
  finally { loadingHistory.value = false; }
};

const remitCashAction = async () => {
  if (!selectedCashier.value || !remitForm.value.amount || remitForm.value.amount <= 0) return;
  if (!report.value) {
    Notify.create({ type: 'warning', message: 'Generate report first before remittance.' });
    return;
  }
  if (remitForm.value.amount > expectedCash.value) {
    Notify.create({ type: 'warning', message: 'Remit amount cannot exceed expected cash.' });
    return;
  }
  remitting.value = true;
  try {
    const result = await api.post('/daily-cash-drawer/remit', { cashierId: selectedCashier.value, amount: remitForm.value.amount, notes: remitForm.value.notes });
    const carryOver = result.data?.carryOver;
    Notify.create({ type: 'positive', message: `Cash remitted. Carry-over: P${(carryOver || 0).toFixed(2)}` });
    showRemitDialog.value = false;
    remitForm.value = { amount: 0, notes: '' };
    await loadDailyRecords();
    await loadOpeningBalance();
    await loadReport();
  } catch (e: any) { Notify.create({ type: 'negative', message: e?.response?.data?.error || 'Failed to remit' }); }
  finally { remitting.value = false; }
};

const closeDayAction = async () => {
  if (!report.value || !selectedCashier.value || !selectedDate.value) return;
  if (selectedDate.value !== formatDateYYYYMMDDLocal(new Date())) {
    Notify.create({ type: 'warning', message: 'Close Day is only allowed for today\'s date.' });
    return;
  }
  closing.value = true;
  try {
    const payload: Record<string, any> = {
      cashierId: selectedCashier.value,
      date: selectedDate.value,
      openingBalance: Number(openingBalance.value || 0),
      notes: closeForm.value.notes,
      actualCashCount: Number(actualCashCount.value || 0),
      overShort: Number(overShort.value || 0),
      zeroCarryOver: !!closeForm.value.zeroCarryOver,
    };
    console.log('[DEBUG-FRONT] closeDay POST:', JSON.stringify(payload));
    const r = await api.post('/daily-cash-drawer/close', payload);
    console.log('[DEBUG-FRONT] closeDay SUCCESS! saved record:', r.data);
    Notify.create({ type: 'positive', message: 'Day closed successfully. Carry-over bukas: ₱' + Number(r.data?.carryOver || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }) });
    showCloseDialog.value = false;
    await loadDailyRecords();
    await loadOpeningBalance();
  } catch (e: any) { console.error(e); Notify.create({ type: 'negative', message: e?.response?.data?.error || 'Failed to close day' }); }
  finally { closing.value = false; }
};

const exportToPDF = async () => {
  const { jsPDF } = await import('jspdf'); const doc = new jsPDF(); if (!report.value) return;
  doc.setFontSize(18); doc.text('Cash Drawer Report', 14, 20); doc.setFontSize(12);
  doc.text(`Cashier: ${report.value.cashierName}`, 14, 35); doc.text(`Date: ${fmtDate(report.value.date)}`, 14, 42);
  doc.text(`Opening: ${fmt(report.value.openingBalance)}`, 14, 49); doc.text(`Cash Sales: ${fmt(report.value.cashSales)}`, 14, 56);
  doc.text(`Closing: ${fmt(report.value.closingBalance)}`, 14, 63); doc.save(`cash-drawer-${selectedDate.value}.pdf`);
};
const exportToExcel = async () => {
  const XLSX = await import('xlsx'); if (!report.value) return;
  const ws = XLSX.utils.json_to_sheet([{ Cashier: report.value.cashierName, Date: fmtDate(report.value.date), Opening: report.value.openingBalance, 'Cash Sales': report.value.cashSales, Checks: report.value.checkPayments || 0, Online: report.value.onlinePayments || 0, Expenses: report.value.expenses || 0, Closing: report.value.closingBalance }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Cash Drawer'); XLSX.writeFile(wb, `cash-drawer-${selectedDate.value}.xlsx`);
};

const P = (n: number | string | null | undefined) => {
  const v = Number(n || 0);
  return 'P' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const printCashDrawer = async () => {
  printLoading.value = true;
  try {
    const cashierName = report.value?.cashierName || (selectedCashier.value ? (cashierOptions.value.find(c => c.value === selectedCashier.value)?.label || '') : '');
    const dateStr = selectedDate.value || fmtDate(report.value?.date);
    const opening = Number(simpleOpening.value || 0);
    const allColl = Number(totalCollectionsAllMethods.value || 0);
    const collCash = Number(cashOnHandCollections.value || 0);
    const collGLouie = Number(gcashLouieCollections.value || 0);
    const collGKat = Number(gcashKatrinaCollections.value || 0);
    const collGAnic = Number(gcashAniciaCollections.value || 0);
    const collBPI = Number(bpiOnlineCollections.value || 0);
    const collAUB = Number(aubOnlineCollections.value || 0);
    const collMaya = Number(mayaCollections.value || 0);
    const collOther = Number(onlineOtherCollections.value || 0);
    const receivables = Number(receivableCollections.value || 0);
    const repayments = Number(simpleRepayments.value || 0);
    const advances = Number(todayAdvancePaymentTotal.value || 0);
    const expenses = Number(simpleExpenses.value || 0);
    const remits = Number(todayRemitTotal.value || 0);
    const cashInTotal = collCash + repayments + advances;
    const cashOutTotal = expenses + remits;
    const expected = Number(expectedCash.value || 0);
    const actual = Number(actualCashCount.value || 0);
    const overShortVal = Number(overShort.value || 0);
    const overShortClass = overShortVal < 0 ? 'color:#c62828;font-weight:bold' : overShortVal > 0.01 ? 'color:#2e7d32;font-weight:bold' : 'color:#2e7d32';
    const overShortTxt = overShortVal === 0 ? 'P0.00' : (overShortVal < 0 ? '-' : '') + P(Math.abs(overShortVal)).replace('P', 'P');

    // SECTION 1: Summary rows table
    const summaryRows = `
      <tr><td style="width:50%">Opening Balance</td><td style="text-align:right;font-weight:bold">${P(opening)}</td></tr>
      <tr><td>All Collections</td><td style="text-align:right">${P(allColl)}</td></tr>
      <tr><td>&nbsp;&nbsp;Cash on Hand Collections</td><td style="text-align:right">${P(collCash)}</td></tr>
      <tr><td>&nbsp;&nbsp;GCash Louie</td><td style="text-align:right">${P(collGLouie)}</td></tr>
      <tr><td>&nbsp;&nbsp;GCash Katrina</td><td style="text-align:right">${P(collGKat)}</td></tr>
      <tr><td>&nbsp;&nbsp;GCash Anicia</td><td style="text-align:right">${P(collGAnic)}</td></tr>
      <tr><td>&nbsp;&nbsp;BPI Online</td><td style="text-align:right">${P(collBPI)}</td></tr>
      <tr><td>&nbsp;&nbsp;AUB Online</td><td style="text-align:right">${P(collAUB)}</td></tr>
      <tr><td>&nbsp;&nbsp;Maya</td><td style="text-align:right">${P(collMaya)}</td></tr>
      <tr><td>&nbsp;&nbsp;Other Online</td><td style="text-align:right">${P(collOther)}</td></tr>
      <tr><td>Receivables Collected (non-cash above + checks)</td><td style="text-align:right">${P(receivables)}</td></tr>
      <tr><td>Repayments (additional cash-in)</td><td style="text-align:right">${P(repayments)}</td></tr>
      <tr><td>Advance Payments (additional cash-in)</td><td style="text-align:right">${P(advances)}</td></tr>
      <tr style="background:#f9f9f9"><td style="font-weight:bold">Total Cash In</td><td style="text-align:right;font-weight:bold">${P(cashInTotal)}</td></tr>
      <tr><td>Expenses (cash-out)</td><td style="text-align:right">${P(expenses)}</td></tr>
      <tr><td>Remittances (cash-out)</td><td style="text-align:right">${P(remits)}</td></tr>
      <tr style="background:#f9f9f9"><td style="font-weight:bold">Total Cash Out</td><td style="text-align:right;font-weight:bold">${P(cashOutTotal)}</td></tr>
      <tr style="background:#f0f4ff"><td style="font-weight:bold">Expected Cash on Hand</td><td style="text-align:right;font-weight:bold">${P(expected)}</td></tr>
      <tr><td>Actual Cash Count</td><td style="text-align:right">${P(actual)}</td></tr>
      <tr style="background:#fff5f5"><td style="font-weight:bold">Over / Short</td><td style="text-align:right;${overShortClass}">${overShortTxt}</td></tr>
    `;

    // SECTION 2: Collections detail table (per channel, numbered if any)
    const collRowsRaw = [
      { label: 'Cash on Hand', value: collCash },
      { label: 'GCash Louie', value: collGLouie },
      { label: 'GCash Katrina', value: collGKat },
      { label: 'GCash Anicia', value: collGAnic },
      { label: 'BPI Online', value: collBPI },
      { label: 'AUB Online', value: collAUB },
      { label: 'Maya', value: collMaya },
      { label: 'Other Online', value: collOther },
      { label: 'Receivables Collected (incl checks)', value: receivables },
    ].filter((c) => c.value > 0.001);
    let collRows = ''; let collTotal = 0;
    collRowsRaw.forEach((c, idx) => {
      collTotal += c.value;
      collRows += `<tr><td style="text-align:center">${idx+1}</td><td>${c.label}</td><td style="text-align:right">${P(c.value)}</td></tr>`;
    });
    const collTable = collRowsRaw.length ? `
      <h3 style="margin:18px 0 6px">Collections Breakdown</h3>
      <table><thead><tr><th>No.</th><th>Channel</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${collRows}</tbody>
      <tfoot><tr class="total-row"><td colspan="2" style="text-align:right">TOTAL COLLECTIONS:</td><td style="text-align:right">${P(collTotal)}</td></tr></tfoot></table>
    ` : '';

    // SECTION 3: Ledger rows table (IN / OUT type ONLY — INFO removed, source, ref, running)
    let ledgerHtml = ''; let running = 0; let ledgerNo = 0;
    (ledgerRows.value || []).forEach((r: any) => {
      const isIn = r.type === 'IN';
      const isOut = r.type === 'OUT';
      if (!isIn && !isOut) return;
      ledgerNo += 1;
      if (isIn) running += Number(r.amountIn || 0);
      if (isOut) running -= Number(r.amountOut || 0);
      const typeCls = isIn ? 'color:#2e7d32;font-weight:bold' : 'color:#c62828;font-weight:bold';
      const typeLabel = isIn ? 'IN' : 'OUT';
      ledgerHtml += `<tr>
        <td style="text-align:center">${ledgerNo}</td>
        <td style="text-align:center">${r.time || ''}</td>
        <td style="text-align:center;${typeCls}">${typeLabel}</td>
        <td>${r.source || ''}</td>
        <td>${r.reference || ''}</td>
        <td style="text-align:right">${Number(r.amountIn || 0) > 0 ? P(r.amountIn) : '—'}</td>
        <td style="text-align:right">${Number(r.amountOut || 0) > 0 ? P(r.amountOut) : '—'}</td>
        <td style="text-align:right;font-weight:bold">${P(running)}</td>
      </tr>`;
    });
    const filteredLedgerCount = (ledgerRows.value || []).filter((r: any) => r.type === 'IN' || r.type === 'OUT').length;
    const ledgerTable = filteredLedgerCount > 0 ? `
      <h3 style="margin:18px 0 6px">Ledger / Running Balance</h3>
      <table><thead><tr><th>No.</th><th>Time</th><th>Type</th><th>Source</th><th>Reference</th><th style="text-align:right">Amount In</th><th style="text-align:right">Amount Out</th><th style="text-align:right">Running</th></tr></thead>
      <tbody>${ledgerHtml}</tbody></table>
    ` : '';

    // SECTION 4: History (Adjust / Remit / Close / Advance records)
    const hist = (dailyRecords.value || []).filter((r: any) => {
      if (!r.date) return false;
      return manilaDayKey(r.date) === selectedDate.value;
    }).sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    let histRows = '';
    hist.forEach((r: any, idx: number) => {
      const time = r.date ? new Date(r.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
      const typeColors: Record<string, string> = {
        OPENING_ADJUST: 'color:#455a64;background:#eceff1',
        ADVANCE_PAYMENT: 'color:#4a148c;background:#f3e5f5',
        REMITTANCE: 'color:#004d40;background:#e0f2f1',
        CLOSE_DAY: 'color:#e65100;background:#fff3e0',
      };
      const style = typeColors[r.type] || '';
      const typeLabel: Record<string, string> = {
        OPENING_ADJUST: 'Opening Adjust',
        ADVANCE_PAYMENT: 'Advance Pay',
        REMITTANCE: 'Remittance',
        CLOSE_DAY: 'Close Day',
      };
      histRows += `<tr>
        <td style="text-align:center">${idx+1}</td>
        <td style="text-align:center">${time}</td>
        <td style="text-align:center;${style}">${typeLabel[r.type] || r.type || ''}</td>
        <td>${r.cashierName || ''}</td>
        <td style="text-align:right">${Number(r.remittedAmount || 0) > 0 ? P(r.remittedAmount) : '—'}</td>
        <td style="text-align:right">${Number(r.closingBalance || 0) > 0 ? P(r.closingBalance) : '—'}</td>
        <td style="text-align:right">${Number(r.carryOver || 0) > 0 ? P(r.carryOver) : '—'}</td>
        <td>${String(r.notes || '').slice(0, 80)}</td>
      </tr>`;
    });
    const histTable = hist.length ? `
      <h3 style="margin:18px 0 6px">Daily Cash Drawer History (${selectedDate.value})</h3>
      <table><thead><tr><th>No.</th><th>Time</th><th>Type</th><th>Cashier</th><th style="text-align:right">Amount</th><th style="text-align:right">Closing</th><th style="text-align:right">Carry-Over</th><th>Notes</th></tr></thead>
      <tbody>${histRows}</tbody></table>
    ` : '';

    // FINAL HTML: exact same style as Sales Summary print (clean Arial, bordered tables, th grey bg, tfoot bold)
    const html = `<!DOCTYPE html><html><head><title>Cash Drawer Report</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:15px;color:#111}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border:1px solid #ccc;padding:3px 6px;font-size:11px;vertical-align:top}
      th{background:#f0f0f0;font-weight:bold;text-align:left}
      .header{text-align:center;margin-bottom:10px}
      .total-row{font-weight:bold;font-size:12px;background:#f0f0f0}
      .print-btn{text-align:center;margin:14px 0}
      .subtle{color:#666}
      h2{margin:0}
      h3{margin:16px 0 4px;padding:0;border-bottom:1px solid #ddd;padding-bottom:3px}
      @media print{body{margin:0}.print-btn{display:none}}
    </style></head>
    <body>
      <div class="header">
        <h2>Aberin Hardware</h2>
        <p style="margin:3px 0 0;font-size:13px;font-weight:bold">Cash Drawer Report</p>
        <p style="margin:3px 0 0;font-size:11px">Cashier: ${cashierName || '—'} | Date: ${dateStr || '—'} | Printed: ${new Date().toLocaleString('en-PH')}</p>
      </div>

      <h3>Summary</h3>
      <table><tbody>${summaryRows}</tbody></table>

      ${collTable}
      ${ledgerTable}
      ${histTable}

      <div class="print-btn"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">🖨️ Print</button></div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  } catch (e: any) {
    console.error('printCashDrawer failed:', e);
    Notify.create({ type: 'negative', message: 'Failed to prepare print view' });
  } finally {
    printLoading.value = false;
  }
};

const loadCustomers = async () => {
  try { const r = await api.get('/customers'); allCustomers.value = r.data; customerOptions.value = r.data.map((c: any) => ({ label: c.name, value: c._id })); } catch { allCustomers.value = []; }
};

const filterCustomers = (val: string, update: Function) => {
  update(() => {
    const needle = val.toLowerCase();
    customerOptions.value = needle
      ? allCustomers.value.filter((c: any) => c.name.toLowerCase().includes(needle)).map((c: any) => ({ label: c.name, value: c._id }))
      : allCustomers.value.map((c: any) => ({ label: c.name, value: c._id }));
  });
};

const deleteRecord = async (record: any) => {
  if (!record._id) return;
  $q.dialog({
    title: 'Delete Record',
    message: `Delete this ${record.type === 'ADVANCE_PAYMENT' ? 'advance payment' : 'opening adjustment'} of ${fmt(record.remittedAmount)}?`,
    cancel: true, persistent: true
  }).onOk(async () => {
    try {
      await api.delete(`/daily-cash-drawer/${record._id}`);
      Notify.create({ type: 'positive', message: 'Record deleted' });
      await loadDailyRecords();
      await loadOpeningBalance();
      await loadReport();
    } catch (e: any) { Notify.create({ type: 'negative', message: e?.response?.data?.error || 'Failed to delete' }); }
  });
};

const acceptAdvance = async () => {
  if (!advanceForm.value.customerId || !advanceForm.value.amount || advanceForm.value.amount <= 0) return;
  advanceProcessing.value = true;
  try {
    await api.post('/daily-cash-drawer/advance-payment', {
      cashierId: selectedCashier.value,
      customerId: advanceForm.value.customerId,
      amount: advanceForm.value.amount,
      paymentChannel: advanceForm.value.paymentChannel,
      paymentAccountName: advanceForm.value.paymentAccountName,
      paymentReference: advanceForm.value.paymentReference,
      notes: advanceForm.value.notes
    });
    Notify.create({ type: 'positive', message: `Advance payment of ${fmt(advanceForm.value.amount)} accepted` });
    showAdvanceDialog.value = false;
    advanceForm.value = {
      customerId: '',
      amount: 0,
      paymentChannel: 'CASH',
      paymentAccountName: '',
      paymentReference: '',
      notes: ''
    };
    await loadDailyRecords();
    if (report.value) await loadReport();
  } catch (e: any) { Notify.create({ type: 'negative', message: e?.response?.data?.error || 'Failed' }); }
  finally { advanceProcessing.value = false; }
};

const adjustOpening = async () => {
  console.log(`[DEBUG-FRONT] adjustOpening() FUNCTION WAS CALLED!  adjustForm.amount=${adjustForm.value.amount} typeof=${typeof adjustForm.value.amount} falsy?=${!adjustForm.value.amount}   adjustForm.notes=("${String(adjustForm.value.notes || '').slice(0,40)}") falsy?=${!adjustForm.value.notes}`);
  if (!adjustForm.value.amount || adjustForm.value.amount <= 0 || !adjustForm.value.notes) {
    console.error(`[DEBUG-FRONT] adjustOpening VALIDATION FAILED -> EARLY RETURN (before axios POST!). Required: amount>0 AND notes non-empty.  amount=${adjustForm.value.amount} notes=${adjustForm.value.notes}`);
    Notify.create({ type: 'warning', message: '⚠️ REQUIRED: Both amount AND notes! Please fill in Amount (positive) AND Notes.' });
    return;
  }
  adjustProcessing.value = true;
  try {
    console.log(`[DEBUG-FRONT] adjustOpening POST: date=${selectedDate.value} amount=${adjustForm.value.amount} notes=${adjustForm.value.notes}`);
    const r = await api.post('/daily-cash-drawer/adjust-opening', {
      cashierId: selectedCashier.value,
      amount: adjustForm.value.amount,
      notes: adjustForm.value.notes,
      date: selectedDate.value,
    });
    console.log(`[DEBUG-FRONT] adjustOpening SUCCESS! SAVED RECORD:`, JSON.parse(JSON.stringify(r.data)));
    Notify.create({ type: 'positive', message: `Opening balance adjusted by ${fmt(adjustForm.value.amount)}` });
    showAdjustDialog.value = false;
    adjustForm.value = { amount: 0, notes: '' };
    await loadDailyRecords();
    console.log(`[DEBUG-FRONT] after adjust -> loadDailyRecords returned ${dailyRecords.value.length} rows`);
    dailyRecords.value.forEach((rec: any, i: number) => {
      if (rec.type === 'OPENING_ADJUST') {
        console.log(`[DEBUG-FRONT]   HISTORY OPENING_ADJUST[${i}]: dateIso=${new Date(rec.date).toISOString()} manilaDay=${manilaDayKey(rec.date)} matchesToday? ${manilaDayKey(rec.date)===selectedDate.value}  remittedAmount=${rec.remittedAmount} openingBalance=${rec.openingBalance}`);
      }
    });
    await loadOpeningBalance();
    await loadReport();
  } catch (e: any) {
    console.error(`[DEBUG-FRONT] adjustOpening FAILED:`, { status: e?.response?.status, data: e?.response?.data, message: e?.message });
    Notify.create({ type: 'negative', message: e?.response?.data?._error ? JSON.stringify(e.response.data._error).slice(0,200) : (e?.response?.data?.error || 'Failed') });
  }
  finally { adjustProcessing.value = false; }
};

const openOverrideDialog = () => {
  refreshOverride();
  overrideForm.value.amount = Math.max(0, Number(currentOpeningOverride.value) || Number(simpleOpening.value) || 0);
  showOverrideDialog.value = true;
};
const submitOverride = async (v: number) => {
  const amount = Math.max(0, Number(v || 0));
  const prev = Number(currentOpeningOverride.value || 0);
  setOpeningOverride(amount);
  const newOv = Number(currentOpeningOverride.value || 0);
  console.log(`[DEBUG-FRONT] Override Opening: prev(${prev}) -> set(${amount}) -> applied(${newOv}) for key=${openingOverrideKey.value}`);
  Notify.create({
    type: 'positive',
    message: amount > 0 ? `Opening override applied: ${fmt(amount)} for ${selectedDate.value}` : 'Opening override cleared'
  });
  showOverrideDialog.value = false;
  refreshOverride();
  // Force reactivity recomputation of simpleOpening (already in computed but bump for good measure)
  dailyRecords.value = [...dailyRecords.value];
  await loadReport();
};

const resetHistoryAction = async () => {
  if (!selectedCashier.value) return;

  $q.dialog({
    title: 'Reset Cash Drawer History',
    message: 'This will remove all Remittance and Close Day records for this cashier and set opening balance to zero. Continue?',
    cancel: true,
    persistent: true,
    ok: { label: 'Reset', color: 'negative' }
  }).onOk(async () => {
    loadingHistory.value = true;
    try {
      const result = await api.post('/daily-cash-drawer/reset-history', { cashierId: selectedCashier.value });
      openingBalance.value = 0;
      report.value = null;
      actualCashCount.value = 0;
      persistCashDrawerState();
      await loadDailyRecords();
      Notify.create({
        type: 'positive',
        message: `History reset complete. Deleted ${result.data?.deletedCount || 0} record(s). Opening balance is now P0.00.`
      });
    } catch (e: any) {
      if (e?.response?.status === 404) {
        Notify.create({
          type: 'warning',
          message: 'Reset endpoint not found on server. Please deploy/restart latest backend API first.'
        });
      } else {
        Notify.create({ type: 'negative', message: e?.response?.data?.error || 'Failed to reset history' });
      }
    } finally {
      loadingHistory.value = false;
    }
  });
};

watch(
  [selectedCashier, selectedDate, openingBalance, actualCashCount, report],
  () => {
    persistCashDrawerState();
  },
  { deep: true }
);

watch(
  selectedDate,
  async (newDate, oldDate) => {
    if (!newDate || newDate === oldDate) return;
    report.value = null;
    actualCashCount.value = 0;
    openingBalance.value = 0;
    refreshOverride();
    if (!selectedCashier.value) return;
    await loadOpeningBalance();
    await loadReport();
  }
);

onMounted(async () => {
  selectedDate.value = formatDateYYYYMMDDLocal(new Date());
  restoreCashDrawerState();
  await loadCashiers();
  await loadCustomers();
  if (selectedCashier.value) {
    await onCashierChanged();
  } else {
    await loadDailyRecords();
  }
});
</script>


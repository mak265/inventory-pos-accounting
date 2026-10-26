<template>
  <q-card style="min-width: 600px; max-width: 800px">
    <q-card-section>
      <div class="text-h6">Customer Details</div>
    </q-card-section>

    <q-card-section>
      <div class="q-gutter-md">
        <div class="row">
          <div class="col-4 text-weight-bold">Name:</div>
          <div class="col-8">{{ customer?.name }}</div>
        </div>

        <div class="row" v-if="customer?.phone">
          <div class="col-4 text-weight-bold">Phone:</div>
          <div class="col-8">{{ customer?.phone }}</div>
        </div>

        <div class="row" v-if="customer?.tin">
          <div class="col-4 text-weight-bold">TIN:</div>
          <div class="col-8">{{ customer?.tin }}</div>
        </div>

        <div class="row" v-if="customer?.officeAddress">
          <div class="col-4 text-weight-bold">Office Address:</div>
          <div class="col-8">{{ customer?.officeAddress }}</div>
        </div>

        <div class="row" v-if="customer?.deliveryAddress">
          <div class="col-4 text-weight-bold">Delivery Address:</div>
          <div class="col-8">{{ customer?.deliveryAddress }}</div>
        </div>

        <q-separator />

        <div class="row">
          <div class="col-4 text-weight-bold">Current Balance:</div>
          <div class="col-8">
            <span :class="customer?.balance > 0 ? 'text-negative text-weight-bold' : 'text-positive'">
              {{ formatCurrency(customer?.balance || 0) }}
            </span>
          </div>
        </div>

        <!-- Per-Channel Payment Totals -->
        <div v-if="channelTotals" class="q-mt-sm">
          <q-separator class="q-mb-sm" />
          <div class="text-subtitle2 text-weight-bold q-mb-xs">Payment Channel Totals</div>
          <div class="row q-col-gutter-sm">
            <div class="col-4" v-if="channelTotals.BPI > 0"><span class="text-caption">BPI:</span> <span class="text-blue text-weight-bold">{{ formatCurrency(channelTotals.BPI) }}</span></div>
            <div class="col-4" v-if="channelTotals.GCash > 0"><span class="text-caption">GCash:</span> <span class="text-blue-8 text-weight-bold">{{ formatCurrency(channelTotals.GCash) }}</span></div>
            <div class="col-4" v-if="channelTotals.AUB > 0"><span class="text-caption">AUB:</span> <span class="text-teal text-weight-bold">{{ formatCurrency(channelTotals.AUB) }}</span></div>
            <div class="col-4" v-if="channelTotals.Cash > 0"><span class="text-caption">Cash:</span> <span class="text-positive text-weight-bold">{{ formatCurrency(channelTotals.Cash) }}</span></div>
            <div class="col-4" v-if="channelTotals.Check > 0"><span class="text-caption">Check:</span> <span class="text-orange text-weight-bold">{{ formatCurrency(channelTotals.Check) }}</span></div>
            <div class="col-4" v-if="channelTotals.Other > 0"><span class="text-caption">Other:</span> <span class="text-grey text-weight-bold">{{ formatCurrency(channelTotals.Other) }}</span></div>
          </div>
        </div>

        <q-separator />

        <!-- Bounced Checks Section -->
        <div v-if="bouncedChecks.length > 0" class="q-mt-md">
          <div class="text-h6 text-negative">Bounced Checks ({{ bouncedChecks.length }})</div>
          <q-table
            :rows="bouncedChecks"
            :columns="bouncedColumns"
            row-key="_id"
            flat
            bordered
            dense
            :pagination="{ rowsPerPage: 5 }"
          >
            <template v-slot:body-cell-amount="props">
              <q-td :props="props">
                <span class="text-negative text-weight-bold">{{ formatCurrency(props.row.amount) }}</span>
              </q-td>
            </template>
            <template v-slot:body-cell-bouncedDate="props">
              <q-td :props="props">{{ formatDate(props.row.bouncedDate) }}</q-td>
            </template>
            <template v-slot:body-cell-actions="props">
              <q-td :props="props">
                <q-btn flat dense size="sm" color="primary" icon="payment" label="Repay" @click="openRepayDialog(props.row)" />
              </q-td>
            </template>
          </q-table>
        </div>

        <q-separator class="q-mt-md" />

        <div class="text-h6 q-mt-md">Transaction History</div>

        <q-table
          :rows="transactions"
          :columns="transactionColumns"
          row-key="id"
          :loading="loadingHistory"
          flat
          bordered
          :pagination="{ rowsPerPage: 10 }"
        >
          <template v-slot:body-cell-totalAmount="props">
            <q-td :props="props">
              {{ formatCurrency(props.row.totalAmount) }}
            </q-td>
          </template>

          <template v-slot:body-cell-totalPaid="props">
            <q-td :props="props">
              <span class="text-positive">{{ formatCurrency(props.row.totalPaid) }}</span>
            </q-td>
          </template>

          <template v-slot:body-cell-unpaid="props">
            <q-td :props="props">
              <span :class="props.row.unpaid > 0 ? 'text-negative text-weight-bold' : 'text-grey'">{{ formatCurrency(props.row.unpaid) }}</span>
            </q-td>
          </template>

          <template v-slot:body-cell-date="props">
            <q-td :props="props">
              {{ formatDate(props.row.date) }}
            </q-td>
          </template>
        </q-table>

        <div v-if="transactions.length === 0 && !loadingHistory" class="text-center text-grey q-pa-md">
          No transaction history available
        </div>
      </div>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat label="Close" color="primary" @click="$emit('close')" />
    </q-card-actions>

    <!-- Repay Bounced Check Dialog -->
    <q-dialog v-model="showRepayDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Repay Bounced Check</div>
          <div class="text-subtitle2 text-grey-7 q-mt-sm">{{ repayCheck?.customerName }} - Ref: {{ repayCheck?.referenceNumber || 'N/R' }}</div>
          <div class="text-h5 text-negative q-mt-sm">{{ formatCurrency(repayCheck?.amount || 0) }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-select v-model="repayChannel" :options="channelOptions" label="Payment Channel *" outlined dense emit-value map-options class="q-mb-md" />
          <q-select
            v-if="repayChannel === 'GCASH'"
            v-model="repayGcashAccount"
            :options="['Katrina','Louie','Anicia']"
            label="GCash Account *"
            outlined
            dense
            clearable
            class="q-mb-md"
          />
          <q-input v-model="repayRef" label="Reference Number" outlined dense class="q-mb-md" />
          <q-input v-model="repayNotes" label="Notes" outlined dense type="textarea" rows="2" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="Record Repayment" color="primary" :disable="!repayChannel" :loading="repaying" @click="doRepay" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useCustomerStore } from '../stores/customerStore';
import { Notify } from 'quasar';

interface Props {
  customer: any;
}

const props = defineProps<Props>();
const emit = defineEmits(['close']);

const customerStore = useCustomerStore();
const transactions = ref<any[]>([]);
const bouncedChecks = ref<any[]>([]);
const channelTotals = ref<any>(null);
const loadingHistory = ref(false);

const showRepayDialog = ref(false);
const repayCheck = ref<any>(null);
const repayChannel = ref('');
const repayRef = ref('');
const repayNotes = ref('');
const repayGcashAccount = ref('');
const repaying = ref(false);

const API = (import.meta.env.VITE_API_URL || '') + '/api';
const token = () => localStorage.getItem('auth_token') || '';

const channelOptions = [
  { label: 'Cash', value: 'CASH' },
  { label: 'GCash', value: 'GCASH' },
  { label: 'BPI', value: 'BPI' },
  { label: 'AUB', value: 'AUB' },
  { label: 'Check', value: 'CHECK' },
  { label: 'Other Bank', value: 'OTHER_BANK' }
];

const transactionColumns = [
  { name: 'drNumber', label: 'DR Number', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left' as const, sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
  { name: 'totalAmount', label: 'Total', field: 'totalAmount', align: 'right' as const },
  { name: 'totalPaid', label: 'Paid', field: 'totalPaid', align: 'right' as const },
  { name: 'unpaid', label: 'Unpaid', field: 'unpaid', align: 'right' as const }
];

const bouncedColumns = [
  { name: 'receivedDate', label: 'Received', field: 'receivedDate', align: 'left' as const, format: (v: string) => v ? new Date(v).toLocaleDateString() : '' },
  { name: 'referenceNumber', label: 'Reference #', field: 'referenceNumber', align: 'left' as const },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const },
  { name: 'bouncedDate', label: 'Bounced Date', field: 'bouncedDate', align: 'left' as const },
  { name: 'actions', label: '', field: '', align: 'center' as const }
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
};

const formatDate = (date: string | Date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const openRepayDialog = (check: any) => {
  repayCheck.value = check;
  repayChannel.value = '';
  repayRef.value = '';
  repayNotes.value = '';
  repayGcashAccount.value = '';
  showRepayDialog.value = true;
};

const doRepay = async () => {
  if (!repayCheck.value || !repayChannel.value) return;
  repaying.value = true;
  try {
    const r = await fetch(API + '/check-approvals/repay-bounced', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkRecordId: repayCheck.value._id,
        amount: repayCheck.value.amount,
        channel: repayChannel.value,
        referenceNumber: repayRef.value,
        accountName: repayChannel.value === 'GCASH' ? (repayGcashAccount.value || undefined) : undefined,
        notes: repayNotes.value
      })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed'); }
    Notify.create({ type: 'positive', message: 'Repayment recorded' });
    showRepayDialog.value = false;
    await loadHistory();
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e.message || 'Failed to record repayment' });
  } finally {
    repaying.value = false;
  }
};

const loadHistory = async () => {
  if (!props.customer?._id) return;
  loadingHistory.value = true;
  try {
    const history = await customerStore.getCustomerHistory(props.customer._id);
    transactions.value = history.transactions || [];
    bouncedChecks.value = history.bouncedChecks || [];
    channelTotals.value = history.channelTotals || null;
  } catch (error) {
    console.error('Error loading customer history:', error);
  } finally {
    loadingHistory.value = false;
  }
};

onMounted(() => { loadHistory(); });
</script>

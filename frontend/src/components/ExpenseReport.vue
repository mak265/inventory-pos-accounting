<template>
  <PrintLayout title="Expense Report">
  <div class="q-pa-md">
    <div class="row q-mb-md items-center print-hide">
      <div class="col">
        <div class="text-h5">Expense Report</div>
      </div>
      <div class="col-auto">
        <q-btn color="primary" label="Add Expense" @click="showExpenseForm = true" />
      </div>
    </div>

    <!-- Petty Cash Status -->
    <q-card class="q-mb-md" v-if="pettyCashStatus">
      <q-card-section>
        <div class="text-h6">Petty Cash Status</div>
        <div class="row q-mt-sm">
          <div class="col">
            <div class="text-caption">Current Balance</div>
            <div class="text-h6">{{ formatCurrency(pettyCashStatus.balance) }}</div>
          </div>
          <div class="col">
            <div class="text-caption">Threshold</div>
            <div class="text-body1">{{ formatCurrency(pettyCashStatus.threshold) }}</div>
          </div>
        </div>
        <q-banner v-if="pettyCashStatus.isLow" class="bg-warning text-white q-mt-md" rounded>
          <template v-slot:avatar>
            <q-icon name="warning" />
          </template>
          Petty cash balance is below threshold. Replenishment needed.
        </q-banner>
      </q-card-section>
    </q-card>

    <!-- Filters -->
    <q-card class="q-mb-md">
      <q-card-section>
        <div class="row q-col-gutter-md">
          <div class="col-md-3 col-sm-6 col-xs-12">
            <q-input
              v-model="filters.startDate"
              label="Start Date"
              outlined
              dense
              type="date"
            />
          </div>
          <div class="col-md-3 col-sm-6 col-xs-12">
            <q-input
              v-model="filters.endDate"
              label="End Date"
              outlined
              dense
              type="date"
            />
          </div>
          <div class="col-md-3 col-sm-6 col-xs-12">
            <q-input
              v-model="filters.category"
              label="Category"
              outlined
              dense
              clearable
            />
          </div>
          <div class="col-md-3 col-sm-6 col-xs-12">
            <q-select
              v-model="filters.isPettyCash"
              label="Type"
              outlined
              dense
              clearable
              :options="[
                { label: 'All', value: undefined },
                { label: 'Petty Cash', value: true },
                { label: 'Regular', value: false }
              ]"
              option-label="label"
              option-value="value"
              emit-value
              map-options
            />
          </div>
        </div>
        <div class="row q-mt-sm">
          <q-btn color="primary" label="Apply Filters" @click="loadExpenses" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Expenses Table -->
    <q-table
      :rows="expenses"
      :columns="columns"
      row-key="_id"
      :loading="loading"
      flat
      bordered
    >
      <template v-slot:body-cell-amount="props">
        <q-td :props="props">
          {{ formatCurrency(props.row.amount) }}
        </q-td>
      </template>
      <template v-slot:body-cell-isPettyCash="props">
        <q-td :props="props">
          <q-badge v-if="props.row.isPettyCash" color="orange" label="Petty Cash" />
          <span v-else>Regular</span>
        </q-td>
      </template>
      <template v-slot:body-cell-paymentStatus="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.paymentStatus === 'PAID' ? 'green' : 'red'"
            :label="props.row.paymentStatus"
          />
        </q-td>
      </template>
    </q-table>

    <!-- Expense Form Dialog -->
    <q-dialog v-model="showExpenseForm">
      <expense-form @save="handleSaveExpense" @cancel="showExpenseForm = false" />
    </q-dialog>

    <!-- Print Button -->
    <div class="q-mt-md print-hide">
      <PrintButton />
    </div>
  </div>
  </PrintLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useExpenseStore } from '../stores/expenseStore';
import ExpenseForm from './ExpenseForm.vue';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';

const expenseStore = useExpenseStore();

const expenses = ref<any[]>([]);
const pettyCashStatus = ref<any>(null);
const loading = ref(false);
const showExpenseForm = ref(false);

const filters = ref({
  startDate: '',
  endDate: '',
  category: '',
  isPettyCash: undefined as boolean | undefined
});

const columns = [
  { name: 'expenseDate', label: 'Date', field: 'expenseDate', align: 'left', sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left' },
  { name: 'isPettyCash', label: 'Type', field: 'isPettyCash', align: 'center' },
  { name: 'paymentStatus', label: 'Status', field: 'paymentStatus', align: 'center' },
  { name: 'paidFrom', label: 'Paid From', field: 'paidFrom', align: 'center' }
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
};

const loadExpenses = async () => {
  loading.value = true;
  try {
    expenses.value = await expenseStore.fetchExpenses(filters.value);
  } finally {
    loading.value = false;
  }
};

const loadPettyCashStatus = async () => {
  pettyCashStatus.value = await expenseStore.fetchPettyCashStatus();
};

const handleSaveExpense = async (expenseData: any) => {
  await expenseStore.createExpense(expenseData);
  showExpenseForm.value = false;
  await loadExpenses();
  await loadPettyCashStatus();
};

onMounted(() => {
  loadExpenses();
  loadPettyCashStatus();
});
</script>

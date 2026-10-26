<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">Expenses & Petty Cash</h5></div>
        <div class="col-auto"><q-btn color="primary" label="Add Expense" icon="add" @click="showAdd = true" /></div>
      </div>

      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-4">
          <q-input v-model="startDate" label="Start Date" type="date" outlined dense @update:model-value="loadExpenses" />
        </div>
        <div class="col-12 col-md-4">
          <q-input v-model="endDate" label="End Date" type="date" outlined dense @update:model-value="loadExpenses" />
        </div>
        <div class="col-12 col-md-4">
          <q-select v-model="categoryFilter" :options="['All', 'Office Supplies', 'Transportation', 'Utilities', 'Food', 'Maintenance', 'Petty Cash', 'Other']" label="Category" outlined dense @update:model-value="loadExpenses" />
        </div>
      </div>

      <q-table :rows="expenses" :columns="columns" row-key="_id" :loading="loading" flat bordered :pagination="{ rowsPerPage: 25, sortBy: 'expenseDate', descending: true }">
        <template v-slot:body-cell-amount="props"><q-td :props="props">{{ fmt(props.row.amount) }}</q-td></template>
        <template v-slot:body-cell-expenseDate="props"><q-td :props="props">{{ new Date(props.row.expenseDate).toLocaleDateString() }}</q-td></template>
        <template v-slot:body-cell-isPettyCash="props"><q-td :props="props"><q-badge :color="props.row.isPettyCash ? 'orange' : 'grey'" :label="props.row.isPettyCash ? 'Petty Cash' : 'Regular'" /></q-td></template>
        <template v-slot:body-cell-paymentStatus="props"><q-td :props="props"><q-badge :color="props.row.paymentStatus === 'PAID' ? 'positive' : 'negative'" :label="props.row.paymentStatus" /></q-td></template>
      </q-table>

      <div class="row q-mt-md q-gutter-md">
        <q-card flat bordered class="col"><q-card-section><div class="text-caption">Total Expenses</div><div class="text-h5 text-negative">{{ fmt(totalExpenses) }}</div></q-card-section></q-card>
      </div>
    </div>

    <q-dialog v-model="showAdd" persistent>
      <q-card style="min-width: 450px">
        <q-card-section><div class="text-h6">Add Expense</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="form.expenseDate" label="Date *" type="date" outlined dense />
          <q-input v-model="form.description" label="Description *" outlined dense />
          <q-input v-model.number="form.amount" label="Amount *" type="number" outlined dense prefix="P" />
          <q-select v-model="form.category" :options="['Office Supplies', 'Transportation', 'Utilities', 'Food', 'Maintenance', 'Petty Cash', 'Other']" label="Category" outlined dense />
          <q-toggle v-model="form.isPettyCash" label="Petty Cash" />
          <q-select v-model="form.paymentStatus" :options="['PAID', 'UNPAID']" label="Payment Status" outlined dense />
          <q-select
            v-model="form.paidFrom"
            :options="['CASH', 'GCASH LOUIE', 'GCASH KATRINA', 'GCASH ANICIA', 'MAYA', 'BPI ONLINE', 'AUB ONLINE']"
            label="Paid From"
            outlined
            dense
            clearable
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showAdd = false" />
          <q-btn label="Save" color="primary" @click="saveExpense" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useExpenseStore } from '../stores/expenseStore';
import { Notify } from 'quasar';

const expenseStore = useExpenseStore();
const expenses = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showAdd = ref(false);
const startDate = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
const endDate = ref(new Date().toISOString().split('T')[0]);
const categoryFilter = ref('All');

const form = ref({
  expenseDate: new Date().toISOString().split('T')[0],
  description: '', amount: 0, category: 'Other',
  isPettyCash: false, paymentStatus: 'PAID', paidFrom: 'CASH'
});

const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const totalExpenses = computed(() => expenses.value.reduce((s, e) => s + (e.amount || 0), 0));

const columns = [
  { name: 'expenseDate', label: 'Date', field: 'expenseDate', align: 'left' as const, sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
  { name: 'category', label: 'Category', field: 'category', align: 'left' as const },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' as const, sortable: true },
  { name: 'isPettyCash', label: 'Type', field: 'isPettyCash', align: 'center' as const },
  { name: 'paymentStatus', label: 'Status', field: 'paymentStatus', align: 'center' as const },
  { name: 'paidFrom', label: 'Paid From', field: 'paidFrom', align: 'center' as const },
];

const loadExpenses = async () => {
  loading.value = true;
  try {
    const params: any = {};
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;
    if (categoryFilter.value && categoryFilter.value !== 'All') params.category = categoryFilter.value;
    const result = await expenseStore.fetchExpenses(params);
    expenses.value = Array.isArray(result) ? result : [];
  } catch (e) { console.error('Failed to load expenses:', e); }
  finally { loading.value = false; }
};

const saveExpense = async () => {
  if (!form.value.description || !form.value.amount) { Notify.create({ type: 'warning', message: 'Description and amount required' }); return; }
  saving.value = true;
  try {
    await expenseStore.createExpense(form.value);
    Notify.create({ type: 'positive', message: 'Expense saved' });
    showAdd.value = false;
    form.value = { expenseDate: new Date().toISOString().split('T')[0], description: '', amount: 0, category: 'Other', isPettyCash: false, paymentStatus: 'PAID', paidFrom: 'CASH' };
    await loadExpenses();
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e?.message || 'Failed to save expense' });
  } finally { saving.value = false; }
};

onMounted(() => loadExpenses());
</script>


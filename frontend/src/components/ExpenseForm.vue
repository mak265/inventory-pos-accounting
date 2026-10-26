<template>
  <q-card style="min-width: 500px">
    <q-card-section>
      <div class="text-h6">Record Expense</div>
    </q-card-section>

    <q-card-section>
      <q-form @submit="onSubmit" class="q-gutter-md">
        <q-input
          v-model="form.expenseDate"
          label="Expense Date *"
          outlined
          dense
          type="date"
          :rules="[val => !!val || 'Date is required']"
        />

        <q-input
          v-model="form.description"
          label="Description *"
          outlined
          dense
          type="textarea"
          rows="2"
          :rules="[val => !!val || 'Description is required']"
        />

        <q-input
          v-model.number="form.amount"
          label="Amount *"
          outlined
          dense
          type="number"
          step="0.01"
          min="0"
          :rules="[
            val => val !== null && val !== '' || 'Amount is required',
            val => val > 0 || 'Amount must be greater than 0'
          ]"
        />

        <q-input
          v-model="form.category"
          label="Category"
          outlined
          dense
        />

        <q-checkbox
          v-model="form.isPettyCash"
          label="Petty Cash Expense"
        />

        <q-select
          v-model="form.paymentStatus"
          label="Payment Status *"
          outlined
          dense
          :options="['PAID', 'UNPAID']"
          :rules="[val => !!val || 'Payment status is required']"
        />

        <q-select
          v-if="form.paymentStatus === 'PAID'"
          v-model="form.paidFrom"
          label="Paid From"
          outlined
          dense
          :options="['CASH', 'GCASH LOUIE', 'GCASH KATRINA', 'GCASH ANICIA', 'MAYA', 'BPI ONLINE', 'AUB ONLINE']"
          :rules="[val => !!val || 'Payment source is required for paid expenses']"
        />
      </q-form>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat label="Cancel" color="primary" @click="$emit('cancel')" />
      <q-btn label="Save" color="primary" @click="onSubmit" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits(['save', 'cancel']);

const form = ref({
  expenseDate: new Date().toISOString().split('T')[0],
  description: '',
  amount: 0,
  category: '',
  isPettyCash: false,
  paymentStatus: 'PAID' as 'PAID' | 'UNPAID',
  paidFrom: undefined as 'CASH' | 'GCASH LOUIE' | 'GCASH KATRINA' | 'GCASH ANICIA' | 'MAYA' | 'BPI ONLINE' | 'AUB ONLINE' | undefined
});

const resetForm = () => {
  form.value = {
    expenseDate: new Date().toISOString().split('T')[0],
    description: '',
    amount: 0,
    category: '',
    isPettyCash: false,
    paymentStatus: 'PAID',
    paidFrom: undefined
  };
};

const onSubmit = () => {
  if (!form.value.expenseDate || !form.value.description || !form.value.amount || !form.value.paymentStatus) {
    return;
  }

  if (form.value.paymentStatus === 'PAID' && !form.value.paidFrom) {
    return;
  }

  emit('save', { ...form.value });
  resetForm();
};
</script>

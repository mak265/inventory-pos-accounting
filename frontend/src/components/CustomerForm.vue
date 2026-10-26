<template>
  <q-card style="min-width: 500px">
    <q-card-section>
      <div class="text-h6">{{ isEdit ? 'Edit Customer' : 'Add Customer' }}</div>
    </q-card-section>

    <q-card-section>
      <q-form @submit="onSubmit" class="q-gutter-md">
        <q-input
          v-model="form.name"
          label="Customer Name *"
          outlined
          dense
          :rules="[val => !!val || 'Name is required']"
        />

        <q-input
          v-model="form.officeAddress"
          label="Office Address"
          outlined
          dense
          type="textarea"
          rows="2"
        />

        <q-input
          v-model="form.deliveryAddress"
          label="Delivery Address"
          outlined
          dense
          type="textarea"
          rows="2"
        />

        <q-input
          v-model="form.phone"
          label="Phone"
          outlined
          dense
        />

        <q-input
          v-model="form.tin"
          label="TIN"
          outlined
          dense
        />

        <q-input
          v-if="isEdit"
          v-model="form.balance"
          label="Balance"
          outlined
          dense
          type="number"
          readonly
          hint="Balance is automatically calculated from sales and payments"
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
import { ref, computed, watch } from 'vue';

interface Props {
  customer?: any;
}

const props = defineProps<Props>();
const emit = defineEmits(['save', 'cancel']);

const form = ref({
  name: '',
  officeAddress: '',
  deliveryAddress: '',
  phone: '',
  tin: '',
  balance: 0
});

const isEdit = computed(() => !!props.customer);

const resetForm = () => {
  form.value = {
    name: '',
    officeAddress: '',
    deliveryAddress: '',
    phone: '',
    tin: '',
    balance: 0
  };
};

watch(() => props.customer, (newCustomer) => {
  if (newCustomer) {
    form.value = {
      name: newCustomer.name || '',
      officeAddress: newCustomer.officeAddress || '',
      deliveryAddress: newCustomer.deliveryAddress || '',
      phone: newCustomer.phone || '',
      tin: newCustomer.tin || '',
      balance: newCustomer.balance || 0
    };
  } else {
    resetForm();
  }
}, { immediate: true });

const onSubmit = () => {
  if (!form.value.name) {
    return;
  }

  // Don't send balance in the update - it's managed by the system
  const { balance, ...customerData } = form.value;
  emit('save', customerData);
};
</script>

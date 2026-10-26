<template>
  <q-card style="min-width: 500px">
    <q-card-section>
      <div class="text-h6">{{ isEdit ? 'Edit Vendor' : 'Add Vendor' }}</div>
    </q-card-section>

    <q-card-section>
      <q-form @submit="onSubmit" class="q-gutter-md">
        <q-input
          v-model="form.name"
          label="Vendor Name *"
          outlined
          dense
          :rules="[val => !!val || 'Name is required']"
        />

        <q-input
          v-model="form.address"
          label="Address"
          outlined
          dense
          type="textarea"
          rows="2"
        />

        <q-input
          v-model="form.termsOfPayment"
          label="Terms of Payment"
          outlined
          dense
        />

        <q-input
          v-model="form.contactPerson"
          label="Contact Person"
          outlined
          dense
        />

        <q-input
          v-model="form.phone"
          label="Phone"
          outlined
          dense
        />

        <q-input
          v-model="form.email"
          label="Email"
          outlined
          dense
          type="email"
        />

        <q-input
          v-model="form.tin"
          label="TIN"
          outlined
          dense
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
  vendor?: any;
}

const props = defineProps<Props>();
const emit = defineEmits(['save', 'cancel']);

const form = ref({
  name: '',
  address: '',
  termsOfPayment: '',
  contactPerson: '',
  phone: '',
  email: '',
  tin: ''
});

const isEdit = computed(() => !!props.vendor);

const resetForm = () => {
  form.value = {
    name: '',
    address: '',
    termsOfPayment: '',
    contactPerson: '',
    phone: '',
    email: '',
    tin: ''
  };
};

watch(() => props.vendor, (newVendor) => {
  if (newVendor) {
    form.value = {
      name: newVendor.name || '',
      address: newVendor.address || '',
      termsOfPayment: newVendor.termsOfPayment || '',
      contactPerson: newVendor.contactPerson || '',
      phone: newVendor.phone || '',
      email: newVendor.email || '',
      tin: newVendor.tin || ''
    };
  } else {
    resetForm();
  }
}, { immediate: true });

const onSubmit = () => {
  if (!form.value.name) {
    return;
  }
  emit('save', form.value);
};
</script>

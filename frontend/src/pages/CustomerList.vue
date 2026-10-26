<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Customers</h5>
        </div>
        <div class="col-auto">
          <q-btn
            color="primary"
            label="Add Customer"
            icon="add"
            @click="showAddDialog = true"
          />
        </div>
      </div>

      <q-input
        v-model="searchQuery"
        outlined
        dense
        placeholder="Search customers..."
        class="q-mb-md"
      >
        <template v-slot:prepend>
          <q-icon name="search" />
        </template>
      </q-input>

      <q-table
        :rows="filteredCustomers"
        :columns="columns"
        row-key="_id"
        :loading="loading"
        flat
        bordered
      >
        <template v-slot:body-cell-balance="props">
          <q-td :props="props">
            <span :class="props.row.balance > 0 ? 'text-negative' : ''">
              {{ formatCurrency(props.row.balance) }}
            </span>
          </q-td>
        </template>

        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense round icon="visibility" color="primary" @click="viewCustomer(props.row)" />
            <q-btn flat dense round icon="edit" color="primary" @click="editCustomer(props.row)" />
            <q-btn flat dense round icon="delete" color="negative" @click="confirmDelete(props.row)" />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Add/Edit Dialog -->
    <q-dialog v-model="showAddDialog" persistent>
      <customer-form
        :customer="selectedCustomer"
        @save="handleSave"
        @cancel="closeDialog"
      />
    </q-dialog>

    <!-- View Customer Dialog -->
    <q-dialog v-model="showViewDialog" persistent>
      <customer-detail
        :customer="selectedCustomer"
        @close="closeViewDialog"
      />
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import CustomerForm from '../components/CustomerForm.vue';
import CustomerDetail from '../components/CustomerDetail.vue';

const errMsg = (e: any) => e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';

const $q = useQuasar();
let _store: any = null;

const searchQuery = ref('');
const showAddDialog = ref(false);
const showViewDialog = ref(false);
const selectedCustomer = ref(null);
const loading = ref(false);
const customerList = ref<any[]>([]);

const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left' as const, sortable: true },
  { name: 'phone', label: 'Phone', field: 'phone', align: 'left' as const },
  { name: 'officeAddress', label: 'Office Address', field: 'officeAddress', align: 'left' as const },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right' as const, sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const }
];

const getStore = async () => {
  if (!_store) {
    const { useCustomerStore } = await import('../stores/customerStore');
    _store = useCustomerStore();
  }
  return _store;
};

const filteredCustomers = computed(() => {
  const items = customerList.value;
  if (!searchQuery.value) return items;
  const query = searchQuery.value.toLowerCase();
  return items.filter((customer: any) =>
    customer.name?.toLowerCase().includes(query) ||
    customer.phone?.toLowerCase().includes(query) ||
    customer.officeAddress?.toLowerCase().includes(query)
  );
});

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
};

const loadCustomers = async () => {
  loading.value = true;
  try {
    const store = await getStore();
    await store.fetchCustomers();
    customerList.value = store.customers;
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to load customers: ' + errMsg(error) });
  } finally {
    loading.value = false;
  }
};

const viewCustomer = (customer: any) => {
  selectedCustomer.value = { ...customer };
  showViewDialog.value = true;
};

const editCustomer = (customer: any) => {
  selectedCustomer.value = { ...customer };
  showAddDialog.value = true;
};

const confirmDelete = (customer: any) => {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete customer "${customer.name}"?`,
    cancel: true,
    persistent: true,
    prompt: { model: '', type: 'password', label: 'Admin Password', isValid: (val: string) => val.length > 0 }
  }).onOk(async (adminPassword: string) => {
    try {
      const store = await getStore();
      await store.deleteCustomer(customer._id, adminPassword);
      $q.notify({ type: 'positive', message: 'Customer deleted successfully' });
      await loadCustomers();
    } catch (error) {
      $q.notify({ type: 'negative', message: 'Failed to delete customer: ' + errMsg(error) });
    }
  });
};

const handleSave = async (customerData: any) => {
  try {
    const store = await getStore();
    if (selectedCustomer.value) {
      await store.updateCustomer((selectedCustomer.value as any)._id, customerData);
      $q.notify({ type: 'positive', message: 'Customer updated successfully' });
    } else {
      const newCustomer = await store.createCustomer(customerData);
      $q.notify({ type: 'positive', message: 'Customer created successfully' });
    }
    closeDialog();
    await loadCustomers();
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to save customer: ' + errMsg(error) });
  }
};

const closeDialog = () => { showAddDialog.value = false; selectedCustomer.value = null; };
const closeViewDialog = () => { showViewDialog.value = false; selectedCustomer.value = null; };

onMounted(() => { loadCustomers(); });
</script>

<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Vendors</h5>
        </div>
        <div class="col-auto">
          <q-btn color="primary" label="Add Vendor" icon="add" @click="showAddDialog = true" />
        </div>
      </div>

      <q-input v-model="searchQuery" outlined dense placeholder="Search vendors..." class="q-mb-md">
        <template v-slot:prepend><q-icon name="search" /></template>
      </q-input>

      <q-table :rows="filteredVendors" :columns="columns" row-key="_id" :loading="loading" flat bordered>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense round icon="edit" color="primary" @click="editVendor(props.row)" />
            <q-btn flat dense round icon="delete" color="negative" @click="confirmDelete(props.row)" />
          </q-td>
        </template>
      </q-table>
    </div>

    <q-dialog v-model="showAddDialog" persistent>
      <vendor-form :vendor="selectedVendor" @save="handleSave" @cancel="closeDialog" />
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import VendorForm from '../components/VendorForm.vue';


const $q = useQuasar();
const errMsg = (e: any): string => e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
let _store: any = null;
const searchQuery = ref('');
const showAddDialog = ref(false);
const selectedVendor = ref(null);
const loading = ref(false);
const vendorList = ref<any[]>([]);

const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left' as const, sortable: true },
  { name: 'contactPerson', label: 'Contact Person', field: 'contactPerson', align: 'left' as const, sortable: true },
  { name: 'phone', label: 'Phone', field: 'phone', align: 'left' as const },
  { name: 'email', label: 'Email', field: 'email', align: 'left' as const },
  { name: 'tin', label: 'TIN', field: 'tin', align: 'left' as const },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const }
];

const getStore = async () => {
  if (!_store) {
    const { useVendorStore } = await import('../stores/vendorStore');
    _store = useVendorStore();
  }
  return _store;
};

const filteredVendors = computed(() => {
  const items = vendorList.value;
  if (!searchQuery.value) return items;
  const query = searchQuery.value.toLowerCase();
  return items.filter((vendor: any) =>
    vendor.name?.toLowerCase().includes(query) ||
    vendor.contactPerson?.toLowerCase().includes(query)
  );
});

const loadVendors = async () => {
  loading.value = true;
  try {
    const store = await getStore();
    await store.fetchVendors();
    vendorList.value = store.vendors;
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to load vendors: ' + errMsg(error) });
  } finally {
    loading.value = false;
  }
};

const editVendor = (vendor: any) => { selectedVendor.value = { ...vendor }; showAddDialog.value = true; };

const confirmDelete = (vendor: any) => {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete vendor "${vendor.name}"?`,
    cancel: true, persistent: true,
    prompt: { model: '', type: 'password', label: 'Admin Password', isValid: (val: string) => val.length > 0 }
  }).onOk(async (adminPassword: string) => {
    try {
      const store = await getStore();
      await store.deleteVendor(vendor._id, adminPassword);
      $q.notify({ type: 'positive', message: 'Vendor deleted successfully' });
      await loadVendors();
    } catch (error) {
      $q.notify({ type: 'negative', message: 'Failed to delete vendor: ' + errMsg(error) });
    }
  });
};

const handleSave = async (vendorData: any) => {
  try {
    const store = await getStore();
    if (selectedVendor.value) {
      await store.updateVendor((selectedVendor.value as any)._id, vendorData);
      $q.notify({ type: 'positive', message: 'Vendor updated successfully' });
    } else {
      const newVendor = await store.createVendor(vendorData);
      $q.notify({ type: 'positive', message: 'Vendor created successfully' });
    }
    closeDialog();
    await loadVendors();
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to save vendor: ' + errMsg(error) });
  }
};

const closeDialog = () => { showAddDialog.value = false; selectedVendor.value = null; };

onMounted(() => { loadVendors(); });
</script>

<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Units of Measure</h5>
        </div>
        <div class="col-auto">
          <q-btn
            color="primary"
            label="Add UOM"
            icon="add"
            @click="showAddDialog = true"
          />
        </div>
      </div>

      <q-input
        v-model="searchQuery"
        outlined
        dense
        placeholder="Search UOMs..."
        class="q-mb-md"
      >
        <template v-slot:prepend>
          <q-icon name="search" />
        </template>
      </q-input>

      <q-table
        :rows="filteredUoms"
        :columns="columns"
        row-key="_id"
        :loading="loading"
        flat
        bordered
      >
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="edit"
              color="primary"
              @click="editUom(props.row)"
            />
            <q-btn
              flat
              dense
              round
              icon="delete"
              color="negative"
              @click="confirmDelete(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Add/Edit Dialog -->
    <q-dialog v-model="showAddDialog" persistent>
      <u-o-m-form
        :uom="selectedUom"
        @save="handleSave"
        @cancel="closeDialog"
      />
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import UOMForm from '../components/UOMForm.vue';

const errMsg = (e: any) => e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';

const $q = useQuasar();

const searchQuery = ref('');
const showAddDialog = ref(false);
const selectedUom = ref(null);
const loading = ref(false);
const uomList = ref<any[]>([]);
let _store: any = null;

const columns = [
  {
    name: 'name',
    label: 'Name',
    field: 'name',
    align: 'left' as const,
    sortable: true
  },
  {
    name: 'abbreviation',
    label: 'Abbreviation',
    field: 'abbreviation',
    align: 'left' as const,
    sortable: true
  },
  {
    name: 'actions',
    label: 'Actions',
    field: 'actions',
    align: 'center' as const
  }
];

const filteredUoms = computed(() => {
  if (!searchQuery.value) {
    return uomList.value;
  }
  const query = searchQuery.value.toLowerCase();
  return uomList.value.filter((uom: any) =>
    uom.name?.toLowerCase().includes(query) ||
    uom.abbreviation?.toLowerCase().includes(query)
  );
});

const getStore = async () => {
  if (!_store) {
    const { useUomStore } = await import('../stores/uomStore');
    _store = useUomStore();
  }
  return _store;
};

const loadUoms = async () => {
  loading.value = true;
  try {
    const store = await getStore();
    await store.fetchUoms();
    uomList.value = store.uoms;
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: 'Failed to load UOMs: ' + errMsg(error)
    });
  } finally {
    loading.value = false;
  }
};

const editUom = (uom: any) => {
  selectedUom.value = { ...uom };
  showAddDialog.value = true;
};

const confirmDelete = (uom: any) => {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete UOM "${uom.name}"?`,
    cancel: true,
    persistent: true,
    prompt: {
      model: '',
      type: 'password',
      label: 'Admin Password',
      isValid: (val: string) => val.length > 0
    }
  }).onOk(async (adminPassword: string) => {
    try {
      const store = await getStore();
      await store.deleteUom(uom._id, adminPassword);
      $q.notify({
        type: 'positive',
        message: 'UOM deleted successfully'
      });
      await loadUoms();
    } catch (error: any) {
      $q.notify({
        type: 'negative',
        message: error?.response?.data?.error || error?.message || 'Failed to delete UOM'
      });
    }
  });
};

const handleSave = async (uomData: any) => {
  try {
    const store = await getStore();
    if (selectedUom.value) {
      await store.updateUom((selectedUom.value as any)._id, uomData);
      $q.notify({ type: 'positive', message: 'UOM updated successfully' });
    } else {
      await store.createUom(uomData);
      $q.notify({ type: 'positive', message: 'UOM created successfully' });
    }
    closeDialog();
    await loadUoms();
  } catch (error: any) {
    $q.notify({
      type: 'negative',
      message: error?.response?.data?.error || error?.message || 'Failed to save UOM'
    });
  }
};

const closeDialog = () => {
  showAddDialog.value = false;
  selectedUom.value = null;
};

onMounted(() => {
  loadUoms();
});
</script>

<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Purchase Orders</h5>
        </div>
        <div class="col-auto">
          <q-btn color="primary" label="Create PO" icon="add" @click="createPO" />
        </div>
      </div>

      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-6">
          <q-select v-model="statusFilter" :options="statusOptions" label="Filter by Status" outlined dense clearable @update:model-value="loadPurchaseOrders" />
        </div>
      </div>

      <q-table :rows="purchaseOrders" :columns="columns" row-key="_id" :loading="loading" flat bordered :pagination="{ rowsPerPage: 25, sortBy: 'poDate', descending: true }">
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-badge :color="getStatusColor(props.row.status)">{{ props.row.status }}</q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-totalAmount="props">
          <q-td :props="props">{{ formatCurrency(props.row.totalAmount) }}</q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense round icon="visibility" color="primary" @click="viewPO(props.row)" />
            <q-btn flat dense round icon="edit" color="primary" @click="editPO(props.row)" :disable="props.row.status === 'COMPLETED' || props.row.status === 'CANCELLED'" />
            <q-btn flat dense round icon="delete" color="negative" @click="confirmDelete(props.row)" />
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';


const $q = useQuasar();
const router = useRouter();
const errMsg = (e: any): string => e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Unknown error';
let _store: any = null;
const statusFilter = ref(null);
const loading = ref(false);
const statusOptions = ['DRAFT', 'SUBMITTED', 'PARTIAL', 'COMPLETED', 'CANCELLED'];
const purchaseOrders = ref<any[]>([]);

const columns = [
  { name: 'poNumber', label: 'PO Number', field: 'poNumber', align: 'left' as const, sortable: true },
  { name: 'vendor', label: 'Vendor', field: 'vendorName', align: 'left' as const, sortable: true },
  { name: 'orderDate', label: 'Order Date', field: 'orderDate', align: 'left' as const, sortable: true, format: (val: string) => new Date(val).toLocaleDateString() },
  { name: 'totalAmount', label: 'Total Amount', field: 'totalAmount', align: 'right' as const, sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const, sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' as const }
];

const getStore = async () => {
  if (!_store) {
    const { usePOStore } = await import('../stores/poStore');
    _store = usePOStore();
  }
  return _store;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'grey',
    SUBMITTED: 'primary',
    PARTIAL: 'warning',
    COMPLETED: 'positive',
    CANCELLED: 'negative'
  };
  return colors[status] || 'grey';
};

const loadPurchaseOrders = async () => {
  loading.value = true;
  try {
    const store = await getStore();
    const filters: any = {};
    if (statusFilter.value) filters.status = statusFilter.value;
    await store.fetchPurchaseOrders(filters);
    purchaseOrders.value = store.purchaseOrders;
  } catch (error) {
    $q.notify({ type: 'negative', message: 'Failed to load purchase orders: ' + errMsg(error) });
  } finally {
    loading.value = false;
  }
};

const createPO = () => { router.push('/purchase-orders/new'); };
const viewPO = (po: any) => { router.push(`/purchase-orders/${po._id}/edit`); };
const editPO = (po: any) => { router.push(`/purchase-orders/${po._id}/edit`); };

const confirmDelete = (po: any) => {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete PO "${po.poNumber}"?`,
    cancel: true,
    persistent: true,
    prompt: { model: '', type: 'password', label: 'Admin Password', isValid: (val: string) => val.length > 0 }
  }).onOk(async (adminPassword: string) => {
    try {
      const store = await getStore();
      await store.deletePurchaseOrder(po._id, adminPassword);
      $q.notify({ type: 'positive', message: 'Purchase order deleted successfully' });
      await loadPurchaseOrders();
    } catch (error) {
      $q.notify({ type: 'negative', message: 'Failed to delete purchase order: ' + errMsg(error) });
    }
  });
};

onMounted(() => { loadPurchaseOrders(); });
</script>


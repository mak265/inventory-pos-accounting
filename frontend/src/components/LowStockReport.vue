<template>
  <div>
    <div class="text-h6 q-mb-md">âš ï¸ Low Stock Alert</div>
    <q-table :rows="products" :columns="columns" row-key="_id" flat bordered :loading="loading" :pagination="{ rowsPerPage: 25, sortBy: 'description', descending: false }">
      <template v-slot:body-cell-availableStock="props">
        <q-td :props="props"><q-badge text-color="black" :color="props.row.availableStock <= 0 ? 'negative' : 'warning'">{{ props.row.availableStock }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-sellingPrice="props"><q-td :props="props">P{{ (props.row.sellingPrice||0).toFixed(2) }}</q-td></template>
    </q-table>
    <div v-if="!loading && products.length === 0" class="text-center text-grey-6 q-pa-lg">No low stock items. All products are above their minimum stock levels.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const loading = ref(false);
const products = ref<any[]>([]);

const columns = [
  { name: 'code', label: 'Code', field: 'code', align: 'left' as const, sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const, sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center' as const },
  { name: 'availableStock', label: 'Stock', field: 'availableStock', align: 'center' as const, sortable: true },
  { name: 'minStock', label: 'Min Stock', field: 'minStock', align: 'center' as const },
  { name: 'sellingPrice', label: 'Selling Price', field: 'sellingPrice', align: 'right' as const },
];

onMounted(async () => {
  loading.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/reports/low-stock`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) products.value = await res.json();
  } catch { /* silent */ }
  finally { loading.value = false; }
});
</script>


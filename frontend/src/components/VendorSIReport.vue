<template>
  <div>
    <div class="text-h6 q-mb-md">Vendor SI Report</div>
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-6 col-md-3"><q-input v-model="startDate" label="Start Date" type="date" outlined dense /></div>
      <div class="col-6 col-md-3"><q-input v-model="endDate" label="End Date" type="date" outlined dense /></div>
      <div class="col-6 col-md-3"><q-btn color="primary" label="Filter" @click="load" /></div>
      <div class="col-6 col-md-3"><q-btn flat color="positive" icon="download" label="Export" @click="exportCSV" /></div>
    </div>

    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-md-4"><q-card flat bordered class="bg-blue-1"><q-card-section><div class="text-caption">Total Gross</div><div class="text-h5 text-primary">{{ fmt(data.grandTotalGross) }}</div></q-card-section></q-card></div>
      <div class="col-md-4"><q-card flat bordered class="bg-green-1"><q-card-section><div class="text-caption">Total Net</div><div class="text-h5 text-positive">{{ fmt(data.grandTotalNet) }}</div></q-card-section></q-card></div>
      <div class="col-md-4"><q-card flat bordered><q-card-section><div class="text-caption">Deliveries with SI</div><div class="text-h5">{{ data.count }}</div></q-card-section></q-card></div>
    </div>

    <q-table :rows="data.deliveries" :columns="columns" row-key="_id" flat bordered :loading="loading" :pagination="{ rowsPerPage: 25 }">
      <template v-slot:body-cell-deliveryDate="props"><q-td :props="props">{{ fmtDate(props.row.deliveryDate) }}</q-td></template>
      <template v-slot:body-cell-totalGross="props"><q-td :props="props">{{ fmt(props.row.totalGross) }}</q-td></template>
      <template v-slot:body-cell-totalNet="props"><q-td :props="props"><span class="text-positive text-weight-bold">{{ fmt(props.row.totalNet) }}</span></q-td></template>
      <template v-slot:body-cell-status="props"><q-td :props="props"><q-badge :color="props.row.status === 'POSTED' ? 'positive' : 'warning'" :label="props.row.status" /></q-td></template>
    </q-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { currentYearRange } from '../utils/date';

const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const loading = ref(false);
const data = ref<any>({ deliveries: [], grandTotalGross: 0, grandTotalNet: 0, count: 0 });

const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

const columns = [
  { name: 'siNumber', label: 'SI Number', field: 'siNumber', align: 'left' as const, sortable: true },
  { name: 'drNumber', label: 'DR Number', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'deliveryDate', label: 'Date', field: 'deliveryDate', align: 'left' as const, sortable: true },
  { name: 'vendorName', label: 'Vendor', field: 'vendorName', align: 'left' as const, sortable: true },
  { name: 'itemCount', label: 'Items', field: 'itemCount', align: 'center' as const },
  { name: 'totalGross', label: 'Gross Total', field: 'totalGross', align: 'right' as const, sortable: true },
  { name: 'totalNet', label: 'Net Total', field: 'totalNet', align: 'right' as const, sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const }
];

const load = async () => {
  loading.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const params = new URLSearchParams();
    if (startDate.value) params.set('startDate', startDate.value);
    if (endDate.value) params.set('endDate', endDate.value);
    const res = await fetch(`${API_URL}/api/reports/vendor-si?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) data.value = await res.json();
  } catch { /* silent */ }
  finally { loading.value = false; }
};

const exportCSV = () => {
  const rows = data.value.deliveries;
  if (!rows.length) return;
  const header = 'SI Number,DR Number,Date,Vendor,Items,Gross Total,Net Total,Status\n';
  const csv = header + rows.map((r: any) => `"${r.siNumber}","${r.drNumber}","${fmtDate(r.deliveryDate)}","${r.vendorName}",${r.itemCount},${r.totalGross},${r.totalNet},${r.status}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `vendor-si-report.csv`; a.click();
};

onMounted(() => load());
</script>


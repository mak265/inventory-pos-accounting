<template>
  <q-page padding>
    <PrintLayout title="SI Report">
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Sales Invoice (SI) Report</h4>

      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-input v-model="startDate" label="Start Date" type="date" outlined dense />
            </div>
            <div class="col-12 col-md-3">
              <q-input v-model="endDate" label="End Date" type="date" outlined dense />
            </div>
            <div class="col-12 col-md-2 flex items-end">
              <q-btn label="Generate" color="primary" @click="loadReport" :loading="loading" class="full-width" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <q-card v-if="report" flat bordered class="q-mb-md bg-blue-1">
        <q-card-section class="row items-center q-col-gutter-md">
          <div><span class="text-caption">Total Value:</span><div class="text-h5 text-primary">{{ fmt(report.totalValue) }}</div></div>
          <div><span class="text-caption">Total Paid:</span><div class="text-h5 text-positive">{{ fmt(report.totalPaid) }}</div></div>
          <q-space />
          <span class="text-caption">{{ report.count }} invoice(s)</span>
        </q-card-section>
      </q-card>

      <q-table v-if="report" :rows="report.sales" :columns="columns" row-key="drNumber" flat bordered :pagination="{rowsPerPage:20}">
        <template v-slot:body-cell-saleDate="props">
          <q-td :props="props">{{ fmtDate(props.row.saleDate) }}</q-td>
        </template>
        <template v-slot:body-cell-totalAmount="props">
          <q-td :props="props">{{ fmt(props.row.totalAmount) }}</q-td>
        </template>
        <template v-slot:body-cell-totalPaid="props">
          <q-td :props="props"><span class="text-positive">{{ fmt(props.row.totalPaid) }}</span></q-td>
        </template>
        <template v-slot:body-cell-balance="props">
          <q-td :props="props"><span :class="props.row.balance > 0 ? 'text-negative' : 'text-grey'">{{ fmt(props.row.balance) }}</span></q-td>
        </template>
      </q-table>

      <div v-if="report" class="q-mt-md row q-gutter-sm print-hide">
        <q-btn label="Export Excel" color="positive" outline icon="table_chart" @click="exportExcel" />
        <PrintButton />
      </div>
    </div>
    </PrintLayout>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../boot/axios';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';
import { currentYearRange } from '../utils/date';

const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const loading = ref(false);
const report = ref<any>(null);

const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-PH') : '';

const columns = [
  { name: 'drNumber', label: 'SI Number', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'saleDate', label: 'Date', field: 'saleDate', align: 'left' as const, sortable: true },
  { name: 'customerName', label: 'Customer', field: 'customerName', align: 'left' as const },
  { name: 'totalAmount', label: 'Amount', field: 'totalAmount', align: 'right' as const, sortable: true },
  { name: 'totalPaid', label: 'Paid', field: 'totalPaid', align: 'right' as const },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right' as const },
];

const loadReport = async () => {
  loading.value = true;
  try {
    const params: any = {};
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;
    const res = await api.get('/reports/si-report', { params });
    report.value = res.data;
  } catch (e) { console.error('Failed:', e); }
  finally { loading.value = false; }
};

const exportExcel = async () => {
  if (!report.value) return;
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(report.value.sales.map((s: any) => ({
    'SI Number': s.drNumber,
    'Date': fmtDate(s.saleDate),
    'Customer': s.customerName,
    'Amount': s.totalAmount,
    'Paid': s.totalPaid,
    'Balance': s.balance,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SI Report');
  XLSX.writeFile(wb, `si-report-${startDate.value || 'all'}.xlsx`);
};

onMounted(() => {
  const now = new Date();
  startDate.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  endDate.value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
});
</script>

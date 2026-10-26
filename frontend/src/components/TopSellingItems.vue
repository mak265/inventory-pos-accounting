<template>
  <q-page padding>
    <PrintLayout title="Top Selling Items Report">
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Top Selling Items Report</h4>

      <!-- Filters -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-input
                v-model="startDate"
                label="Start Date"
                type="date"
                outlined
                dense
              />
            </div>
            <div class="col-12 col-md-3">
              <q-input
                v-model="endDate"
                label="End Date"
                type="date"
                outlined
                dense
              />
            </div>
            <div class="col-12 col-md-2">
              <q-select
                v-model="sortBy"
                :options="sortOptions"
                label="Sort By"
                outlined
                dense
              />
            </div>
            <div class="col-12 col-md-2">
              <q-input
                v-model.number="limit"
                label="Top N Items"
                type="number"
                outlined
                dense
                min="5"
                max="50"
              />
            </div>
            <div class="col-12 col-md-2 flex items-end">
              <q-btn
                label="Generate"
                color="primary"
                @click="loadReport"
                :loading="loading"
                class="full-width"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Chart -->
      <q-card v-if="items.length > 0" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6 q-mb-md">
            Top {{ items.length }} Selling Items by {{ sortBy === 'quantity' ? 'Quantity' : 'Revenue' }}
          </div>
          <canvas ref="chartCanvas" style="max-height: 400px"></canvas>
        </q-card-section>
      </q-card>

      <!-- Table -->
      <q-card v-if="items.length > 0" flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Details</div>
          <q-table
            :rows="items"
            :columns="columns"
            row-key="productId"
            flat
            bordered
            :pagination="{ rowsPerPage: 20 }"
          >
            <template v-slot:body-cell-rank="props">
              <q-td :props="props">
                <q-badge
                  :color="getRankColor(props.row.rank)"
                  :label="props.row.rank"
                />
              </q-td>
            </template>
            <template v-slot:body-cell-revenue="props">
              <q-td :props="props">
                {{ formatCurrency(props.row.revenue) }}
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

      <!-- Export Buttons -->
      <div v-if="items.length > 0" class="q-mt-md row q-gutter-sm print-hide">
        <q-btn
          label="Export to PDF"
          color="primary"
          outline
          icon="picture_as_pdf"
          @click="exportToPDF"
        />
        <q-btn
          label="Export to Excel"
          color="positive"
          outline
          icon="table_chart"
          @click="exportToExcel"
        />
        <PrintButton />
      </div>
    </div>
    </PrintLayout>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { Chart, registerables } from 'chart.js';
import { api } from '../boot/axios';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';
import { currentYearRange } from '../utils/date';

Chart.register(...registerables);

interface TopSellingItem {
  productId: string;
  description: string;
  quantitySold: number;
  revenue: number;
  rank: number;
}

const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const sortBy = ref('quantity');
const limit = ref(10);
const loading = ref(false);
const items = ref<TopSellingItem[]>([]);
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

const sortOptions = ['quantity', 'revenue'];

const columns = [
  {
    name: 'rank',
    label: 'Rank',
    field: 'rank',
    align: 'center' as const,
    sortable: true,
  },
  {
    name: 'description',
    label: 'Product Description',
    field: 'description',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'quantitySold',
    label: 'Quantity Sold',
    field: 'quantitySold',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'revenue',
    label: 'Revenue',
    field: 'revenue',
    align: 'right' as const,
    sortable: true,
  },
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
};

const getRankColor = (rank: number) => {
  if (rank === 1) return 'amber';
  if (rank === 2) return 'grey-6';
  if (rank === 3) return 'orange-8';
  return 'primary';
};

const loadReport = async () => {
  loading.value = true;
  try {
    const params: any = {
      sortBy: sortBy.value,
      limit: limit.value,
    };
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    const response = await api.get('/reports/top-selling', { params });
    items.value = response.data;

    await nextTick();
    renderChart();
  } catch (error) {
    console.error('Failed to load top selling items:', error);
  } finally {
    loading.value = false;
  }
};

const renderChart = () => {
  if (!chartCanvas.value || items.value.length === 0) return;

  if (chartInstance) {
    chartInstance.destroy();
  }

  const ctx = chartCanvas.value.getContext('2d');
  if (!ctx) return;

  const labels = items.value.map((item) => item.description);
  const data = items.value.map((item) =>
    sortBy.value === 'quantity' ? item.quantitySold : item.revenue
  );

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: sortBy.value === 'quantity' ? 'Quantity Sold' : 'Revenue (PHP)',
          data,
          backgroundColor: 'rgba(33, 150, 243, 0.5)',
          borderColor: 'rgba(33, 150, 243, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: {
          beginAtZero: true,
        },
      },
    },
  });
};

const exportToPDF = async () => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text('Top Selling Items Report', 14, 20);

  doc.setFontSize(12);
  let y = 35;

  if (startDate.value || endDate.value) {
    doc.text(`Period: ${startDate.value || 'Start'} to ${endDate.value || 'End'}`, 14, y);
    y += 10;
  }

  doc.text(`Sorted by: ${sortBy.value === 'quantity' ? 'Quantity' : 'Revenue'}`, 14, y);
  y += 15;

  items.value.forEach((item) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.text(`${item.rank}. ${item.description}`, 14, y);
    doc.text(`Qty: ${item.quantitySold}`, 120, y);
    doc.text(`${formatCurrency(item.revenue)}`, 160, y);
    y += 7;
  });

  doc.save('top-selling-items.pdf');
};

const exportToExcel = async () => {
  const XLSX = await import('xlsx');

  const ws = XLSX.utils.json_to_sheet(
    items.value.map((item) => ({
      Rank: item.rank,
      'Product Description': item.description,
      'Quantity Sold': item.quantitySold,
      Revenue: item.revenue,
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Top Selling Items');

  XLSX.writeFile(wb, 'top-selling-items.xlsx');
};

onMounted(() => {
  // Set default date range to current month
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  startDate.value = firstDay.toISOString().split('T')[0];
  endDate.value = lastDay.toISOString().split('T')[0];

  loadReport();
});
</script>


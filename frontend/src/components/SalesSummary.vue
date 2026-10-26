<template>
  <q-page padding class="sales-summary-page">
    <PrintLayout title="Sales Summary Report">
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Sales Summary Report</h4>

      <!-- Filters -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-input v-model="startDate" label="Start Date" type="date" outlined dense clearable />
            </div>
            <div class="col-12 col-md-3">
              <q-input v-model="endDate" label="End Date" type="date" outlined dense clearable />
            </div>
            <div class="col-12 col-md-3">
              <q-select
                v-model="paymentFilter"
                :options="paymentFilterOptions"
                label="Payment Status"
                outlined
                dense
                clearable
                emit-value
                map-options
              />
            </div>
            <div class="col-12 col-md-3 flex items-end">
              <q-btn label="Generate Report" color="primary" @click="loadReport" :loading="loading" class="full-width" />
            </div>
          </div>
        </q-card-section>
      </q-card>

<!-- Summary Cards -->
      <div class="row q-col-gutter-md q-mb-md">
        <div class="col-12 col-md-4">
          <q-card flat bordered><q-card-section>
            <div class="text-h6">Total Sales</div>
            <div class="text-h4 text-primary">{{ formatCurrency(receiptSummary.totalSales) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered><q-card-section>
            <div class="text-h6">Total Paid</div>
            <div class="text-h4 text-positive">{{ formatCurrency(receiptSummary.totalPaid) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered><q-card-section>
            <div class="text-h6">Total Receivable</div>
            <div class="text-h4 text-negative">{{ formatCurrency(receiptSummary.totalReceivable) }}</div>
          </q-card-section></q-card>
        </div>
      </div>

<!-- Individual Receipts Table -->
      <q-card v-if="allReceipts.length > 0" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6 q-mb-md">Individual Receipts</div>
<q-table 
            v-model:pagination="receiptPagination"
            :rows="filteredReceipts" 
            :columns="receiptColumns" 
            row-key="_id" 
            flat 
            bordered 
            :rows-per-page-options="[15, 25, 50, 100]"
            :filter="receiptSearch"
          >
            <template #top-right>
              <q-input v-model="receiptSearch" dense outlined placeholder="Search DR#...">
                <template #prepend><q-icon name="search" /></template>
              </q-input>
            </template>
            <template v-slot:body-cell-saleDate="props">
              <q-td :props="props">{{ props.row.saleDate ? new Date(props.row.saleDate).toLocaleDateString('en-PH') : '' }}</q-td>
            </template>
            <template v-slot:body-cell-totalAmount="props"><q-td :props="props">{{ formatCurrency(props.row.totalAmount) }}</q-td></template>
            <template v-slot:body-cell-paid="props"><q-td :props="props">{{ formatCurrency(props.row._paid || 0) }}</q-td></template>
            <template v-slot:body-cell-modeOfPayment="props"><q-td :props="props">{{ props.row._modeOfPayment || (props.row._paid ? paymentMeta(props.row).status : 'UNPAID') || '—' }}</q-td></template>
            <template v-slot:body-cell-balance="props">
              <q-td :props="props">
                <span :class="paymentMeta(props.row).balance > 0.01 ? 'text-negative text-bold' : 'text-positive'">
                  {{ paymentMeta(props.row).balance > 0.01 ? formatCurrency(paymentMeta(props.row).balance) : 'PAID' }}
                </span>
              </q-td>
            </template>
            <template v-slot:body-cell-paymentStatus="props">
              <q-td :props="props">
                <q-badge 
                  :color="paymentMeta(props.row).status === 'PAID' ? 'positive' : paymentMeta(props.row).status === 'PARTIAL' ? 'orange' : 'negative'"
                  :label="paymentMeta(props.row).status || 'UNPAID'"
                />
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

<!-- Export Buttons -->
      <div v-if="allReceipts.length > 0" class="q-mt-md row q-gutter-sm print-hide">
        <q-btn label="Print Sales List" color="deep-purple" outline icon="receipt_long" @click="printSalesList" :loading="printLoading" />
        <PrintButton />
      </div>
    </div>
    </PrintLayout>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { Chart, registerables } from 'chart.js';
import { api } from '../boot/axios';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';
import { currentYearRange } from '../utils/date';

Chart.register(...registerables);

interface CustomerSummary { customerId: string; customerName: string; totalAmount: number; totalPaid: number; totalReceivable: number; }
interface SalesSummary { totalSales: number; totalPaid: number; totalReceivable: number; customerSummaries: CustomerSummary[]; }

const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const paymentFilter = ref<string | null>(null);
const loading = ref(false);
const printLoading = ref(false);
const summary = ref<SalesSummary | null>(null);

// Individual receipts
const allReceipts = ref<any[]>([]);
const receiptSearch = ref('');
const receiptPagination = ref({ page: 1, rowsPerPage: 15, sortBy: 'saleDate', descending: true });

const paymentFilterOptions = [
  { label: 'All', value: null },
  { label: 'Paid', value: 'PAID' },
  { label: 'Unpaid', value: 'UNPAID' },
  { label: 'Partial', value: 'PARTIAL' }
];
const dailySalesData = ref<{ date: string; total: number; count: number }[]>([]);
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

const columns = [
  { name: 'customerName', label: 'Customer Name', field: 'customerName', align: 'left' as const, sortable: true },
  { name: 'totalAmount', label: 'Total Amount', field: 'totalAmount', align: 'right' as const, sortable: true },
  { name: 'totalPaid', label: 'Total Paid', field: 'totalPaid', align: 'right' as const, sortable: true },
  { name: 'totalReceivable', label: 'Total Receivable', field: 'totalReceivable', align: 'right' as const, sortable: true },
];

// Column definitions for individual receipts table
const receiptColumns = [
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'saleDate', label: 'Date', field: 'saleDate', align: 'left' as const, sortable: true },
  { name: 'customerName', label: 'Customer', field: 'customerName', align: 'left' as const, sortable: true },
  { name: 'totalAmount', label: 'Total', field: 'totalAmount', align: 'right' as const, sortable: true },
  { name: 'paid', label: 'Paid', field: '_paid', align: 'right' as const },
  { name: 'modeOfPayment', label: 'Mode of Payment', field: '_modeOfPayment', align: 'left' as const },
  { name: 'balance', label: 'Balance', field: '_balance', align: 'right' as const },
  { name: 'paymentStatus', label: 'Status', field: '_paymentStatus', align: 'center' as const },
];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const paymentMeta = (row: any) => {
  const paid = round2(Number(row?._paid || row?.totalPaid || 0));
  const fallbackDue = Number(row?.totalAmount || 0);
  const effectiveDue = Number.isFinite(Number(row?._effectiveDue)) ? Number(row._effectiveDue) : fallbackDue;
  const due = round2(Math.max(0, effectiveDue));
  const fallbackBalance = round2(Math.max(0, due - paid));
  const balance = round2(Math.max(0, Number.isFinite(Number(row?._balance)) ? Number(row._balance) : fallbackBalance));

  if (paid <= 0.005) return { status: 'UNPAID', due, paid, balance };
  if (balance <= 0.005) return { status: 'PAID', due, paid, balance: 0 };
  return { status: 'PARTIAL', due, paid, balance };
};

// Filtered receipts based on payment filter and search
const filteredReceipts = computed(() => {
  let receipts = allReceipts.value;
  
  // Apply payment filter
  if (paymentFilter.value) {
    receipts = receipts.filter(r => paymentMeta(r).status === paymentFilter.value);
  }
  
  // Apply search filter
  if (receiptSearch.value) {
    const q = receiptSearch.value.toLowerCase();
    receipts = receipts.filter(r => 
      r.drNumber?.toLowerCase().includes(q) || 
      r.customerName?.toLowerCase().includes(q)
    );
  }
  
  return receipts;
});

// Summary calculated from filtered receipts
const receiptSummary = computed(() => {
  const receipts = filteredReceipts.value;
  const totalSales = receipts.reduce((sum, r) => sum + paymentMeta(r).due, 0);
  const totalPaid = receipts.reduce((sum, r) => sum + paymentMeta(r).paid, 0);
  const totalReceivable = receipts.reduce((sum, r) => sum + (paymentMeta(r).balance > 0.01 ? paymentMeta(r).balance : 0), 0);
  return { totalSales, totalPaid, totalReceivable };
});

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

const loadReport = async () => {
  loading.value = true;
  try {
    const params: any = {};
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    const [summaryRes] = await Promise.all([
      api.get('/reports/sales-summary', { params }),
    ]);
    summary.value = summaryRes.data;

    // Fetch ALL sales by paginating through all pages
    let allSales: any[] = [];
    let page = 1;
    let totalPages = 1;
    const salesParams = { ...params, status: 'COMPLETED', limit: '200', page: '1' };
    const firstRes = await api.get('/sales', { params: salesParams });
    const firstPayload = firstRes.data;
    if (firstPayload?.data && Array.isArray(firstPayload.data)) {
      allSales = firstPayload.data;
      if (firstPayload.total && firstPayload.limit) {
        totalPages = Math.ceil(firstPayload.total / firstPayload.limit);
      }
    } else if (Array.isArray(firstPayload)) {
      allSales = firstPayload;
    } else if (firstPayload?.sales) {
      allSales = firstPayload.sales;
    }
    // Fetch remaining pages
    for (page = 2; page <= totalPages; page++) {
      const nextRes = await api.get('/sales', { params: { ...salesParams, page: String(page) } });
      const nextData = nextRes.data?.data || nextRes.data?.sales || [];
      allSales = allSales.concat(nextData);
    }
    const sales = allSales;
    
    // Build individual receipts. Payment metadata comes from /sales enrichment
    // and is normalized by paymentMeta() when rendered/filtered.
    allReceipts.value = sales.map((s: any) => {
      return {
        ...s,
        _paid: Number(s._paid || 0),
        _effectiveDue: Number((s._effectiveDue ?? s.totalAmount) || 0),
        _balance: Number(s._balance || 0),
        _paymentStatus: s._paymentStatus || ''
      };
    });
    
    // Group sales by date for daily chart — use line items total only (exclude fees)
    const dayMap: Record<string, { total: number; count: number }> = {};
    for (const s of sales) {
      if (s.status === 'CANCELLED') continue;
      const d = s.saleDate ? new Date(s.saleDate).toISOString().split('T')[0] : 'Unknown';
      if (!dayMap[d]) dayMap[d] = { total: 0, count: 0 };
      // Use line items total only — exclude delivery/toll fees from sales tally
      const lineItemsTotal = (s.lineItems || []).reduce((sum: number, li: any) => sum + (li.lineTotal || 0), 0);
      dayMap[d].total += lineItemsTotal;
      dayMap[d].count += 1;
    }
    dailySalesData.value = Object.entries(dayMap)
      .map(([date, v]) => ({ date, total: v.total, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    await nextTick();
    renderChart();
  } catch (error) {
    console.error('Failed to load sales summary:', error);
  } finally {
    loading.value = false;
  }
};

const renderChart = () => {
  if (!chartCanvas.value || dailySalesData.value.length === 0) return;
  if (chartInstance) chartInstance.destroy();

  const ctx = chartCanvas.value.getContext('2d');
  if (!ctx) return;

  const labels = dailySalesData.value.map(d => {
    const dt = new Date(d.date);
    return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  });

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Daily Sales (P)',
          data: dailySalesData.value.map(d => d.total),
          backgroundColor: 'rgba(33, 150, 243, 0.6)',
          borderColor: 'rgba(33, 150, 243, 1)',
          borderWidth: 1,
        },
        {
          label: 'Transactions',
          data: dailySalesData.value.map(d => d.count),
          type: 'line' as any,
          borderColor: 'rgba(76, 175, 80, 1)',
          backgroundColor: 'rgba(76, 175, 80, 0.2)',
          yAxisID: 'y1',
          tension: 0.3,
        }
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Sales (P)' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Transactions' } },
      },
    },
  });
};

const exportToPDF = async () => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  doc.setFontSize(18); doc.text('Sales Summary Report', 14, 20);
  doc.setFontSize(12); let y = 35;
  if (startDate.value || endDate.value) { doc.text(`Period: ${startDate.value || 'Start'} to ${endDate.value || 'End'}`, 14, y); y += 10; }
  if (summary.value) {
    doc.text(`Total Sales: ${formatCurrency(summary.value.totalSales)}`, 14, y); y += 7;
    doc.text(`Total Paid: ${formatCurrency(summary.value.totalPaid)}`, 14, y); y += 7;
    doc.text(`Total Receivable: ${formatCurrency(summary.value.totalReceivable)}`, 14, y); y += 15;
    doc.text('Per-Customer Summary:', 14, y); y += 10;
    summary.value.customerSummaries.forEach((c) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.text(c.customerName, 14, y); doc.text(formatCurrency(c.totalAmount), 80, y);
      doc.text(formatCurrency(c.totalPaid), 120, y); doc.text(formatCurrency(c.totalReceivable), 160, y); y += 7;
    });
  }
  doc.save('sales-summary.pdf');
};

const exportToExcel = async () => {
  const XLSX = await import('xlsx');
  if (!summary.value) return;
  const ws = XLSX.utils.json_to_sheet(summary.value.customerSummaries.map((c) => ({
    'Customer Name': c.customerName, 'Total Amount': c.totalAmount, 'Total Paid': c.totalPaid, 'Total Receivable': c.totalReceivable,
  })));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sales Summary');
  XLSX.writeFile(wb, 'sales-summary.xlsx');
};

const printSalesList = async () => {
  printLoading.value = true;
  try {
    const params: any = {};
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;
    // Use client-side filtered receipts so printing honors the table filters and ignores pagination
    const filteredSales = filteredReceipts.value.slice();

    let rows = ''; let totalAmount = 0; let totalPaid = 0; let totalBalance = 0;
    filteredSales.forEach((s: any, idx: number) => {
      const amt = s.totalAmount || 0; 
      const paid = s._paid || 0; 
      const balance = s._balance || 0;
      totalAmount += amt; totalPaid += paid; totalBalance += balance > 0 ? balance : 0;
      const hasBalance = balance > 0.01;
      const rowStyle = hasBalance ? 'color:#c62828;background:#fff5f5' : '';
      const date = s.saleDate ? new Date(s.saleDate).toLocaleDateString('en-PH') : '';
      const modeTxt = s._modeOfPayment || (s._paid ? paymentMeta(s).status : 'UNPAID') || '—';
      rows += `<tr style="${rowStyle}"><td style="text-align:center">${idx+1}</td><td>${date}</td><td>${s.drNumber||''}</td><td>${s.customerName||s.customerId?.name||'Walk-in'}</td><td style="text-align:right">P${amt.toFixed(2)}</td><td style="text-align:right">P${paid.toFixed(2)}</td><td>${modeTxt}</td><td style="text-align:right;font-weight:${hasBalance?'bold':'normal'}">${hasBalance?'P'+balance.toFixed(2):'—'}</td></tr>`;
    });
    
    const period = `${startDate.value || 'All'} to ${endDate.value || 'All'}`;
    const filterLabel = paymentFilter.value ? ` | Payment: ${paymentFilter.value}` : '';
    const html = `<!DOCTYPE html><html><head><title>Sales List</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:15px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 6px;font-size:11px}th{background:#f0f0f0;font-weight:bold}.header{text-align:center;margin-bottom:8px}.total-row{font-weight:bold;font-size:12px;background:#f0f0f0}.print-btn{text-align:center;margin:10px 0}@media print{body{margin:0}.print-btn{display:none}}</style></head><body><div class="header"><h2 style="margin:0">Aberin Hardware</h2><p style="margin:2px 0">Sales List Report</p><p style="margin:2px 0;font-size:11px">Period: ${period}${filterLabel} | Count: ${filteredSales.length}</p></div><table><thead><tr><th>No.</th><th>Date</th><th>DR#</th><th>Customer</th><th>Total Amount</th><th>Payments</th><th>Mode of Payment</th><th>Balance</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="total-row"><td colspan="4" style="text-align:right">OVERALL TOTAL:</td><td style="text-align:right">P${totalAmount.toFixed(2)}</td><td style="text-align:right">P${totalPaid.toFixed(2)}</td><td></td><td style="text-align:right;color:#c62828">P${totalBalance.toFixed(2)}</td></tr></tfoot></table><div class="print-btn"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">🖨️ Print</button></div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  } catch (e) { console.error('Failed to print sales list:', e); }
  finally { printLoading.value = false; }
};

onMounted(() => {
  const today = new Date().toISOString().split('T')[0];
  startDate.value = today;
  endDate.value = today;
  loadReport();
});
</script>

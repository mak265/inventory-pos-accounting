<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width:1600px;margin:0 auto">
      <div class="row items-center q-mb-md">
        <div class="col">
          <h5 class="q-my-none">Sales Journal</h5>
          <div class="text-caption text-grey-6">Stock movement per sale — shows stock before and after each transaction</div>
        </div>
        <div class="col-auto q-gutter-sm">
          <q-btn flat icon="print" label="Print" color="grey-8" @click="printJournal" :disable="!filteredRows.length" />
        </div>
      </div>

      <!-- Filters -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="q-py-sm">
          <div class="row q-col-gutter-sm items-end">
            <div class="col-6 col-md-2">
              <q-input v-model="filters.startDate" label="From" type="date" outlined dense clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="filters.endDate" label="To" type="date" outlined dense clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-12 col-md-3">
              <q-input v-model="searchQuery" outlined dense placeholder="Search DR#, customer, product..." clearable @update:model-value="applySearch">
                <template v-slot:prepend><q-icon name="search" /></template>
              </q-input>
            </div>
            <div class="col-auto">
              <q-btn unelevated color="primary" label="Load" icon="refresh" @click="loadJournal" :loading="loading" />
            </div>
            <div class="col-auto" v-if="filteredRows.length">
              <q-badge color="teal" :label="filteredRows.length + ' entries'" style="font-size:13px;padding:6px 10px" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Journal Table -->
      <q-card flat bordered>
        <q-table
          :rows="filteredRows"
          :columns="columns"
          row-key="_rowKey"
          flat
          dense
          :loading="loading"
          :pagination="saleJournalPagination"
          :rows-per-page-options="[15, 25, 50, 100]"
        >
          <!-- Sale date cell — show only on first row of each sale -->
          <template v-slot:body-cell-saleDate="props">
            <q-td :props="props" :class="props.row._firstRow ? 'text-weight-medium' : 'text-grey-5'">
              <span v-if="props.row._firstRow">{{ fmtDate(props.row.saleDate) }}</span>
            </q-td>
          </template>

          <!-- DR number — show only on first row -->
          <template v-slot:body-cell-drNumber="props">
            <q-td :props="props">
              <span v-if="props.row._firstRow" class="text-weight-bold text-primary">{{ props.row.drNumber }}</span>
            </q-td>
          </template>

          <!-- Customer — show only on first row -->
          <template v-slot:body-cell-customer="props">
            <q-td :props="props">
              <span v-if="props.row._firstRow" class="text-weight-medium">{{ props.row.customerName }}</span>
            </q-td>
          </template>

          <!-- Product code -->
          <template v-slot:body-cell-code="props">
            <q-td :props="props">
              <span class="text-mono text-caption">{{ props.row._item?.code || props.row._item?.productId?.code || '' }}</span>
            </q-td>
          </template>

          <!-- Description -->
          <template v-slot:body-cell-description="props">
            <q-td :props="props">{{ props.row._item?.description }}</q-td>
          </template>

          <!-- UOM -->
          <template v-slot:body-cell-uom="props">
            <q-td :props="props" class="text-center">{{ props.row._item?.uom || props.row._item?.productId?.uom || '' }}</q-td>
          </template>

          <!-- Qty sold -->
          <template v-slot:body-cell-qty="props">
            <q-td :props="props" class="text-center text-weight-medium">
              {{ props.row._item?.quantity }}
            </q-td>
          </template>

          <!-- Stock Before -->
          <template v-slot:body-cell-stockBefore="props">
            <q-td :props="props" class="text-right">
              <span v-if="props.row._item?.stockBefore != null" class="text-blue-8 text-weight-medium">
                {{ fmtQty(props.row._item.stockBefore) }}
              </span>
              <span v-else class="text-grey-4">—</span>
            </q-td>
          </template>

          <!-- Stock After -->
          <template v-slot:body-cell-stockAfter="props">
            <q-td :props="props" class="text-right">
              <span
                v-if="props.row._item?.stockAfter != null"
                :class="props.row._item.stockAfter < 0 ? 'text-negative text-weight-bold' : props.row._item.stockAfter === 0 ? 'text-orange text-weight-bold' : 'text-positive text-weight-medium'"
              >
                {{ fmtQty(props.row._item.stockAfter) }}
              </span>
              <span v-else class="text-grey-4">—</span>
            </q-td>
          </template>

          <!-- Selling price -->
          <template v-slot:body-cell-price="props">
            <q-td :props="props" class="text-right">P{{ (props.row._item?.sellingPrice || 0).toFixed(2) }}</q-td>
          </template>

          <!-- Line total -->
          <template v-slot:body-cell-lineTotal="props">
            <q-td :props="props" class="text-right text-weight-medium">P{{ (props.row._item?.lineTotal || 0).toFixed(2) }}</q-td>
          </template>

          <!-- Sale total — show only on first row -->
          <template v-slot:body-cell-saleTotal="props">
            <q-td :props="props" class="text-right">
              <span v-if="props.row._firstRow" class="text-weight-bold text-positive">P{{ (props.row.totalAmount || 0).toFixed(2) }}</span>
            </q-td>
          </template>

          <!-- Row styling: add separator between sales -->
          <template v-slot:body="props">
            <q-tr
              :props="props"
              :class="[
                props.row._firstRow && props.row._rowIndex > 0 ? 'journal-sale-separator' : '',
                props.row._lastRow ? 'journal-sale-last' : ''
              ]"
            >
              <q-td v-for="col in props.cols" :key="col.name" :props="props">
                <!-- Sale date -->
                <template v-if="col.name === 'saleDate'">
                  <span v-if="props.row._firstRow" class="text-weight-medium">{{ fmtDate(props.row.saleDate) }}</span>
                </template>
                <!-- DR number -->
                <template v-else-if="col.name === 'drNumber'">
                  <span v-if="props.row._firstRow" class="text-weight-bold text-primary">{{ props.row.drNumber }}</span>
                </template>
                <!-- Customer -->
                <template v-else-if="col.name === 'customer'">
                  <span v-if="props.row._firstRow" class="text-weight-medium">{{ props.row.customerName }}</span>
                </template>
                <!-- Code -->
                <template v-else-if="col.name === 'code'">
                  <span class="text-mono" style="font-size:12px">{{ props.row._item?.code || props.row._item?.productId?.code || '' }}</span>
                </template>
                <!-- Description -->
                <template v-else-if="col.name === 'description'">
                  {{ props.row._item?.description }}
                </template>
                <!-- UOM -->
                <template v-else-if="col.name === 'uom'">
                  <span class="text-grey-7">{{ props.row._item?.uom || props.row._item?.productId?.uom || '' }}</span>
                </template>
                <!-- Qty -->
                <template v-else-if="col.name === 'qty'">
                  <span class="text-weight-medium">{{ props.row._item?.quantity }}</span>
                </template>
                <!-- Stock Before -->
                <template v-else-if="col.name === 'stockBefore'">
                  <span v-if="props.row._item?.stockBefore != null" class="text-blue-8 text-weight-medium">
                    {{ fmtQty(props.row._item.stockBefore) }}
                  </span>
                  <span v-else class="text-grey-4">—</span>
                </template>
                <!-- Stock After -->
                <template v-else-if="col.name === 'stockAfter'">
                  <span
                    v-if="props.row._item?.stockAfter != null"
                    :class="props.row._item.stockAfter < 0 ? 'text-negative text-weight-bold' : props.row._item.stockAfter === 0 ? 'text-orange text-weight-bold' : 'text-positive text-weight-medium'"
                  >
                    {{ fmtQty(props.row._item.stockAfter) }}
                  </span>
                  <span v-else class="text-grey-4">—</span>
                </template>
                <!-- Price -->
                <template v-else-if="col.name === 'price'">
                  P{{ (props.row._item?.sellingPrice || 0).toFixed(2) }}
                </template>
                <!-- Line total -->
                <template v-else-if="col.name === 'lineTotal'">
                  <span class="text-weight-medium">P{{ (props.row._item?.lineTotal || 0).toFixed(2) }}</span>
                </template>
                <!-- Sale total -->
                <template v-else-if="col.name === 'saleTotal'">
                  <span v-if="props.row._firstRow" class="text-weight-bold text-positive">P{{ (props.row.totalAmount || 0).toFixed(2) }}</span>
                </template>
              </q-td>
            </q-tr>
          </template>

          <template v-slot:no-data>
            <div class="full-width text-center q-pa-xl text-grey-5">
              <q-icon name="receipt_long" size="48px" class="q-mb-sm" /><br>
              {{ loading ? 'Loading...' : 'No journal entries. Select a date range and click Load.' }}
            </div>
          </template>
        </q-table>
      </q-card>

      <!-- Summary footer -->
      <div v-if="filteredRows.length" class="row q-mt-md q-col-gutter-md">
        <div class="col-auto">
          <q-card flat bordered class="q-pa-sm text-center" style="min-width:140px">
            <div class="text-caption text-grey-6">Total Sales</div>
            <div class="text-h6 text-positive">P{{ totalSalesAmount.toFixed(2) }}</div>
          </q-card>
        </div>
        <div class="col-auto">
          <q-card flat bordered class="q-pa-sm text-center" style="min-width:140px">
            <div class="text-caption text-grey-6">Transactions</div>
            <div class="text-h6 text-primary">{{ uniqueSaleCount }}</div>
          </q-card>
        </div>
        <div class="col-auto">
          <q-card flat bordered class="q-pa-sm text-center" style="min-width:140px">
            <div class="text-caption text-grey-6">Line Items</div>
            <div class="text-h6 text-teal">{{ filteredRows.length }}</div>
          </q-card>
        </div>
        <div class="col-auto">
          <q-card flat bordered class="q-pa-sm text-center" style="min-width:140px">
            <div class="text-caption text-grey-6">Items w/ Stock Data</div>
            <div class="text-h6 text-blue-8">{{ itemsWithStockData }}</div>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';

const $q = useQuasar();

const loading = ref(false);
const rawSales = ref<any[]>([]);
const searchQuery = ref('');

const today = new Date().toISOString().split('T')[0];
const filters = ref({
  startDate: today,
  endDate: today
});

const saleJournalPagination = ref<Record<string, any>>({ rowsPerPage: 15, sortBy: 'saleDate', descending: true });

// Flatten sales into per-line-item rows for the table
const allRows = computed(() => {
  const rows: any[] = [];
  rawSales.value.forEach((sale, saleIdx) => {
    const items = sale.lineItems || [];
    items.forEach((item: any, itemIdx: number) => {
      rows.push({
        _rowKey: `${sale._id}-${itemIdx}`,
        _rowIndex: rows.length,
        _firstRow: itemIdx === 0,
        _lastRow: itemIdx === items.length - 1,
        _item: item,
        // Sale-level fields
        _id: sale._id,
        drNumber: sale.drNumber,
        documentType: sale.documentType,
        saleDate: sale.saleDate,
        customerName: sale.customerName,
        totalAmount: sale.totalAmount,
        status: sale.status
      });
    });
  });
  return rows;
});

const filteredRows = computed(() => {
  if (!searchQuery.value) return allRows.value;
  const q = searchQuery.value.toLowerCase();
  // Get matching sale IDs first
  const matchingSaleIds = new Set<string>();
  rawSales.value.forEach(sale => {
    const matchesSale =
      (sale.drNumber || '').toLowerCase().includes(q) ||
      (sale.customerName || '').toLowerCase().includes(q);
    const matchesItem = (sale.lineItems || []).some((item: any) =>
      (item.description || '').toLowerCase().includes(q) ||
      (item.code || '').toLowerCase().includes(q) ||
      (item.productId?.code || '').toLowerCase().includes(q)
    );
    if (matchesSale || matchesItem) matchingSaleIds.add(sale._id);
  });
  return allRows.value.filter(row => matchingSaleIds.has(row._id));
});

const totalSalesAmount = computed(() => {
  const seen = new Set<string>();
  let total = 0;
  filteredRows.value.forEach(row => {
    if (row._firstRow && !seen.has(row._id)) {
      seen.add(row._id);
      total += row.totalAmount || 0;
    }
  });
  return total;
});

const uniqueSaleCount = computed(() => {
  return new Set(filteredRows.value.map(r => r._id)).size;
});

const itemsWithStockData = computed(() => {
  return filteredRows.value.filter(r => r._item?.stockBefore != null).length;
});

const columns = [
  { name: 'saleDate', label: 'Date', field: 'saleDate', align: 'left' as const, style: 'width:90px' },
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const, style: 'width:80px' },
  { name: 'customer', label: 'Customer', field: 'customerName', align: 'left' as const, style: 'width:140px' },
  { name: 'code', label: 'Code', field: '', align: 'left' as const, style: 'width:80px' },
  { name: 'description', label: 'Description', field: '', align: 'left' as const },
  { name: 'uom', label: 'UOM', field: '', align: 'center' as const, style: 'width:60px' },
  { name: 'qty', label: 'Qty Sold', field: '', align: 'center' as const, style: 'width:80px' },
  { name: 'stockBefore', label: 'Stock Before', field: '', align: 'right' as const, style: 'width:100px' },
  { name: 'stockAfter', label: 'Stock After', field: '', align: 'right' as const, style: 'width:100px' },
  { name: 'price', label: 'Unit Price', field: '', align: 'right' as const, style: 'width:90px' },
  { name: 'lineTotal', label: 'Line Total', field: '', align: 'right' as const, style: 'width:100px' },
  { name: 'saleTotal', label: 'Sale Total', field: '', align: 'right' as const, style: 'width:110px' },
];

const fmtDate = (d: any) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
};

const fmtQty = (n: number) => {
  if (n == null) return '—';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
};

const applySearch = () => { /* reactive */ };

const loadJournal = async () => {
  loading.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const params = new URLSearchParams();
    if (filters.value.startDate) params.append('startDate', filters.value.startDate);
    if (filters.value.endDate) params.append('endDate', filters.value.endDate);
    const res = await fetch(`${API_URL}/api/sales/journal?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load journal');
    rawSales.value = await res.json();
  } catch (e: any) {
    $q.notify({ type: 'negative', message: e.message || 'Failed to load journal' });
  } finally {
    loading.value = false;
  }
};

const printJournal = () => {
  const rows = filteredRows.value;
  if (!rows.length) return;

  let tableRows = '';
  rows.forEach(row => {
    const item = row._item || {};
    const code = item.code || item.productId?.code || '';
    const uom = item.uom || item.productId?.uom || '';
    const stockBefore = item.stockBefore != null ? fmtQty(item.stockBefore) : '—';
    const stockAfter = item.stockAfter != null ? fmtQty(item.stockAfter) : '—';
    const stockAfterClass = item.stockAfter != null && item.stockAfter < 0 ? 'color:red;font-weight:bold' : item.stockAfter === 0 ? 'color:orange;font-weight:bold' : 'color:green';
    const borderTop = row._firstRow && row._rowIndex > 0 ? 'border-top:2px solid #333' : '';

    tableRows += `<tr style="${borderTop}">
      <td>${row._firstRow ? fmtDate(row.saleDate) : ''}</td>
      <td style="font-weight:${row._firstRow ? 'bold' : 'normal'}">${row._firstRow ? row.drNumber : ''}</td>
      <td>${row._firstRow ? row.customerName : ''}</td>
      <td style="font-family:monospace">${code}</td>
      <td>${item.description || ''}</td>
      <td style="text-align:center">${uom}</td>
      <td style="text-align:center;font-weight:bold">${item.quantity || ''}</td>
      <td style="text-align:right;color:#1565c0">${stockBefore}</td>
      <td style="text-align:right;${stockAfterClass}">${stockAfter}</td>
      <td style="text-align:right">P${(item.sellingPrice || 0).toFixed(2)}</td>
      <td style="text-align:right">P${(item.lineTotal || 0).toFixed(2)}</td>
      <td style="text-align:right;font-weight:${row._firstRow ? 'bold' : 'normal'};color:${row._firstRow ? 'green' : 'transparent'}">
        ${row._firstRow ? 'P' + (row.totalAmount || 0).toFixed(2) : ''}
      </td>
    </tr>`;
  });

  const dateRange = filters.value.startDate === filters.value.endDate
    ? fmtDate(filters.value.startDate)
    : `${fmtDate(filters.value.startDate)} – ${fmtDate(filters.value.endDate)}`;

  const html = `<!DOCTYPE html><html><head><title>Sales Journal</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 15px; }
    h2 { margin: 0 0 4px; font-size: 16px; }
    .sub { color: #666; margin-bottom: 10px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; border: 1px solid #ccc; padding: 4px 6px; font-size: 10px; text-align: left; }
    td { border: 1px solid #e0e0e0; padding: 3px 6px; }
    .summary { margin-top: 12px; display: flex; gap: 20px; }
    .summary-box { border: 1px solid #ccc; padding: 6px 12px; border-radius: 4px; }
    @media print { body { margin: 0; } }
  </style></head><body>
  <h2>Sales Journal</h2>
  <div class="sub">Period: ${dateRange} &nbsp;|&nbsp; ${uniqueSaleCount.value} transactions &nbsp;|&nbsp; ${rows.length} line items</div>
  <table>
    <thead><tr>
      <th>Date</th><th>DR#</th><th>Customer</th><th>Code</th><th>Description</th>
      <th>UOM</th><th style="text-align:center">Qty</th>
      <th style="text-align:right">Stock Before</th><th style="text-align:right">Stock After</th>
      <th style="text-align:right">Unit Price</th><th style="text-align:right">Line Total</th>
      <th style="text-align:right">Sale Total</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="summary">
    <div class="summary-box"><b>Total Sales:</b> P${totalSalesAmount.value.toFixed(2)}</div>
    <div class="summary-box"><b>Transactions:</b> ${uniqueSaleCount.value}</div>
    <div class="summary-box"><b>Line Items:</b> ${rows.length}</div>
  </div>
  <script>window.onload=function(){window.print()}<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

onMounted(() => {
  loadJournal();
});
</script>

<style scoped>
.journal-sale-separator td {
  border-top: 2px solid #90caf9 !important;
}
.journal-sale-last td {
  border-bottom: 1px solid #e3f2fd;
}
.text-mono {
  font-family: 'Courier New', monospace;
}
</style>

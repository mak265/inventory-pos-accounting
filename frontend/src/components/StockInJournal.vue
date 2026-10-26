<template>
  <q-page padding>
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Stock In Journal</h4>

      <!-- Filters -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-select v-model="selectedVendor" :options="vendorOptions" label="Vendor (All)" outlined dense option-value="value" option-label="label" emit-value map-options clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="startDate" label="Start Date" type="date" outlined dense clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="endDate" label="End Date" type="date" outlined dense clearable @update:model-value="loadJournal" />
            </div>
            <div class="col-12 col-md-2">
              <q-input v-model="searchQuery" outlined dense placeholder="Search product..." clearable>
                <template #prepend><q-icon name="search" /></template>
              </q-input>
            </div>
            <div class="col-6 col-md-3 flex items-end">
              <q-btn label="Generate" color="primary" @click="loadJournal" :loading="loading" class="full-width" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Summary -->
      <div v-if="journalRows.length > 0" class="row q-col-gutter-md q-mb-md">
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Total Deliveries</div>
            <div class="text-h6 text-primary">{{ totalDeliveries }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Total Items Received</div>
            <div class="text-h6 text-positive">{{ totalQty.toFixed(2) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Total Value</div>
            <div class="text-h6 text-blue">{{ fmtCur(totalValue) }}</div>
          </q-card-section></q-card>
        </div>
        <div class="col-6 col-md-3">
          <q-card flat bordered><q-card-section class="q-py-sm">
            <div class="text-caption text-grey-7">Unique Products</div>
            <div class="text-h6 text-purple">{{ uniqueProducts }}</div>
          </q-card-section></q-card>
        </div>
      </div>

      <!-- Table -->
      <q-card v-if="journalRows.length > 0" flat bordered>
        <q-card-section>
          <div class="row items-center q-mb-sm">
            <div class="col text-h6">Stock In Entries ({{ filteredRows.length }})</div>
            <div class="col-auto">
              <q-btn label="Print" color="deep-purple" icon="print" outline @click="printJournal" />
            </div>
          </div>
          <q-table
            :rows="filteredRows"
            :columns="columns"
            row-key="_key"
            flat bordered dense
            :pagination="{ rowsPerPage: 50, sortBy: 'date', descending: true }"
          >
            <template v-slot:body-cell-date="props">
              <q-td :props="props">{{ fmtDate(props.row.date) }}</q-td>
            </template>
            <template v-slot:body-cell-qty="props">
              <q-td :props="props" class="text-positive text-weight-bold">{{ props.row.qty }}</q-td>
            </template>
            <template v-slot:body-cell-totalCost="props">
              <q-td :props="props">{{ fmtCur(props.row.totalCost) }}</q-td>
            </template>
            <template v-slot:body-cell-netCost="props">
              <q-td :props="props">{{ fmtCur(props.row.netCost) }}</q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

      <div v-else-if="!loading" class="text-center text-grey q-pa-xl">
        No stock in entries found. Adjust filters and click Generate.
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../boot/axios';
import { currentYearRange } from '../utils/date';

const selectedVendor = ref('');
const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const searchQuery = ref('');
const loading = ref(false);
const vendorOptions = ref<{ label: string; value: string }[]>([]);
const journalRows = ref<any[]>([]);

const filteredRows = computed(() => {
  if (!searchQuery.value) return journalRows.value;
  const q = searchQuery.value.toLowerCase().trim();
  return journalRows.value.filter(r =>
    r.description?.toLowerCase().includes(q) ||
    r.code?.toLowerCase().includes(q) ||
    r.drNumber?.toLowerCase().includes(q) ||
    r.vendorName?.toLowerCase().includes(q)
  );
});

const totalDeliveries = computed(() => {
  const drSet = new Set(journalRows.value.map(r => r.drNumber));
  return drSet.size;
});
const totalQty = computed(() => journalRows.value.reduce((s, r) => s + (r.qty || 0), 0));
const totalValue = computed(() => journalRows.value.reduce((s, r) => s + (r.totalCost || 0), 0));
const uniqueProducts = computed(() => {
  const set = new Set(journalRows.value.map(r => r.productId || r.description));
  return set.size;
});

const fmtCur = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }) : '';

const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' as const, sortable: true },
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const, sortable: true },
  { name: 'vendorName', label: 'Vendor', field: 'vendorName', align: 'left' as const, sortable: true },
  { name: 'code', label: 'Code', field: 'code', align: 'left' as const, sortable: true },
  { name: 'description', label: 'Product', field: 'description', align: 'left' as const, sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center' as const },
  { name: 'qty', label: 'Qty In', field: 'qty', align: 'center' as const, sortable: true },
  { name: 'netCost', label: 'Net Cost', field: 'netCost', align: 'right' as const },
  { name: 'totalCost', label: 'Total', field: 'totalCost', align: 'right' as const, sortable: true },
];

const loadVendors = async () => {
  try {
    const r = await api.get('/vendors');
    vendorOptions.value = r.data.map((v: any) => ({ label: v.name, value: v._id }));
  } catch {}
};

const loadJournal = async () => {
  loading.value = true;
  try {
    const params: any = { status: 'POSTED' };
    if (selectedVendor.value) params.vendorId = selectedVendor.value;
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    const r = await api.get('/deliveries', { params });
    const deliveries = Array.isArray(r.data) ? r.data : (r.data.data || r.data.deliveries || []);

    // Flatten line items from all deliveries
    const rows: any[] = [];
    for (const dr of deliveries) {
      for (const item of (dr.lineItems || [])) {
        if ((item.quantityReceived || 0) <= 0) continue;
        const netCost = item.netCost || item.unitCost || 0;
        rows.push({
          _key: `${dr._id}-${item.productId || item.description}-${Math.random()}`,
          date: dr.deliveryDate,
          drNumber: dr.drNumber || '',
          vendorName: dr.vendorName || dr.vendorId?.name || '',
          productId: item.productId?._id || item.productId || '',
          code: item.code || '',
          description: item.description || '',
          uom: item.uom || '',
          qty: item.quantityReceived || 0,
          netCost,
          totalCost: (item.quantityReceived || 0) * netCost
        });
      }
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    journalRows.value = rows;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const printJournal = () => {
  const rows = filteredRows.value;
  if (!rows.length) return;
  const vendorName = vendorOptions.value.find(v => v.value === selectedVendor.value)?.label || 'All Vendors';
  const period = `${startDate.value || 'All'} to ${endDate.value || 'All'}`;
  const printDate = new Date().toLocaleDateString('en-PH');

  let tableRows = '';
  rows.forEach((r: any, i: number) => {
    tableRows += `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${fmtDate(r.date)}</td>
      <td>${r.drNumber}</td>
      <td>${r.vendorName}</td>
      <td style="font-family:monospace">${r.code}</td>
      <td>${r.description}</td>
      <td style="text-align:center">${r.uom}</td>
      <td style="text-align:center;font-weight:bold;color:#2e7d32">${r.qty}</td>
      <td style="text-align:right">P${r.netCost.toFixed(2)}</td>
      <td style="text-align:right;font-weight:bold">P${r.totalCost.toFixed(2)}</td>
    </tr>`;
  });

  const html = `<!DOCTYPE html><html><head><title>Stock In Journal</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #ccc; padding: 3px 6px; font-size: 9px; }
    th { background: #e8eaf6; font-weight: bold; }
    .header { text-align: center; margin-bottom: 10px; }
    .total-row td { font-weight: bold; background: #e8eaf6; border-top: 2px solid #333; }
    @media print { body { margin: 0; } @page { margin: 5mm; } }
  </style></head><body>
  <div class="header">
    <div style="font-size:14px;font-weight:bold">Aberin Hardware</div>
    <div style="font-size:11px;font-weight:bold">STOCK IN JOURNAL</div>
    <div style="font-size:9px;color:#555">Vendor: ${vendorName} | Period: ${period} | Printed: ${printDate}</div>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Date</th><th>DR#</th><th>Vendor</th><th>Code</th><th>Product</th><th>UOM</th><th>Qty In</th><th>Net Cost</th><th>Total</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="7" style="text-align:right">TOTALS:</td>
        <td style="text-align:center">${totalQty.value.toFixed(2)}</td>
        <td></td>
        <td style="text-align:right">P${totalValue.value.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <div style="text-align:center;margin:10px 0">
    <button onclick="window.print()" style="padding:6px 18px;cursor:pointer">Print</button>
  </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

onMounted(() => {
  loadVendors();
  loadJournal();
});
</script>

<template>
  <q-page padding>
    <PrintLayout title="Customer Sales Report">
    <div class="q-pa-md">
      <h4 class="q-mt-none q-mb-md">Customer Sales Report</h4>

      <!-- Customer Selection and Date Range -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-3">
              <q-select v-model="selectedCustomer" :options="customerOptions" label="Customer (All)" outlined dense option-value="value" option-label="label" emit-value map-options clearable @update:model-value="loadReport" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="startDate" label="Start Date" type="date" outlined dense clearable @update:model-value="loadReport" />
            </div>
            <div class="col-6 col-md-2">
              <q-input v-model="endDate" label="End Date" type="date" outlined dense clearable @update:model-value="loadReport" />
            </div>
            <div class="col-6 col-md-2">
              <q-select v-model="paymentFilter" :options="paymentFilterOptions" label="Payment" outlined dense clearable emit-value map-options />
            </div>
            <div class="col-6 col-md-3 flex items-end">
              <q-btn label="Generate" color="primary" @click="loadReport" :loading="loading" class="full-width" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Report Summary -->
      <div v-if="report" class="row q-col-gutter-md q-mb-md">
        <div class="col-12">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6">{{ displayCustomerName }}</div>
              <div class="row q-col-gutter-md q-mt-sm">
                <div class="col-4">
                  <div class="text-caption">Total Amount</div>
                  <div class="text-h6 text-primary">
                    {{ formatCurrency(report.totalAmount) }}
                  </div>
                </div>
                <div class="col-4">
                  <div class="text-caption">Total Paid</div>
                  <div class="text-h6 text-positive">
                    {{ formatCurrency(report.totalPaid) }}
                  </div>
                </div>
                <div class="col-4">
                  <div class="text-caption">Total Receivable</div>
                  <div class="text-h6 text-negative">
                    {{ formatCurrency(report.totalReceivable) }}
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Section Toggles -->
      <div v-if="report" class="q-mb-md row q-gutter-sm print-hide">
        <q-btn :color="showSalesTable ? 'primary' : 'grey'" :outline="!showSalesTable" label="Sales Transactions" icon="receipt" dense @click="showSalesTable = !showSalesTable" />
        <q-btn :color="showItemsTable ? 'deep-purple' : 'grey'" :outline="!showItemsTable" label="Purchased Items" icon="list" dense @click="showItemsTable = !showItemsTable" />
        <q-btn :color="showUnpaid ? 'negative' : 'grey'" :outline="!showUnpaid" label="Unpaid / Repayment" icon="payment" dense @click="showUnpaid = !showUnpaid" />
      </div>

      <!-- Sales Details Table -->
      <q-card v-if="report && showSalesTable" flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Sales Transactions</div>
          <q-table
            :rows="filteredSales"
            :columns="columns"
            row-key="drNumber"
            flat
            bordered
            :pagination="{ rowsPerPage: 10 }"
          >
            <template v-slot:body-cell-saleDate="props">
              <q-td :props="props">
                {{ formatDate(props.row.saleDate) }}
              </q-td>
            </template>
            <template v-slot:body-cell-totalAmount="props">
              <q-td :props="props">
                {{ formatCurrency(props.row.totalAmount) }}
              </q-td>
            </template>
            <template v-slot:body-cell-totalPaid="props">
              <q-td :props="props">
                <span class="text-positive">{{ formatCurrency(props.row.totalPaid || 0) }}</span>
              </q-td>
            </template>
            <template v-slot:body-cell-balance="props">
              <q-td :props="props">
                <span :class="props.value > 0 ? 'text-negative text-weight-bold' : 'text-grey'">
                  {{ formatCurrency(props.value) }}
                </span>
              </q-td>
            </template>
            <template v-slot:body-cell-actions="props">
              <q-td :props="props">
                <q-btn
                  flat
                  dense
                  icon="visibility"
                  color="primary"
                  @click="viewSaleDetails(props.row)"
                >
                  <q-tooltip>View Details</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

      <!-- Detailed Line Items -->
      <q-card v-if="report && showItemsTable && allLineItems.length > 0" flat bordered class="q-mt-md">
        <q-card-section>
          <div class="text-h6 q-mb-md">Purchased Items Detail</div>
          <q-table :rows="allLineItems" :columns="lineItemColumns" row-key="_idx" flat bordered dense :pagination="{ rowsPerPage: 25 }">
            <template v-slot:body-cell-sellingPrice="props"><q-td :props="props">{{ formatCurrency(props.row.sellingPrice) }}</q-td></template>
            <template v-slot:body-cell-lineTotal="props"><q-td :props="props" class="text-weight-bold">{{ formatCurrency(props.row.lineTotal) }}</q-td></template>
            <template v-slot:body-cell-saleDate="props"><q-td :props="props">{{ formatDate(props.row.saleDate) }}</q-td></template>
            <template v-slot:bottom-row>
              <q-tr><q-td colspan="4" class="text-right text-bold">TOTAL:</q-td><q-td></q-td><q-td class="text-bold text-positive">{{ formatCurrency(allLineItems.reduce((s, i) => s + (i.lineTotal || 0), 0)) }}</q-td></q-tr>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

      <!-- Export Buttons -->
      <div v-if="report" class="q-mt-md row q-gutter-sm print-hide">
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
        <q-btn
          label="Print Ledger"
          color="deep-purple"
          outline
          icon="receipt_long"
          @click="printLedger"
        />
        <PrintButton />
      </div>

      <!-- Repayment Section -->
      <div v-if="showUnpaid && unpaidSales.length > 0" class="q-mt-lg">
        <div class="text-h6 q-mb-sm">Unpaid Sales — Select to Pay</div>
<q-table :rows="unpaidSales" :columns="unpaidColumns" row-key="_id" flat bordered dense selection="multiple" v-model:selected="selectedForPayment" :pagination="{ rowsPerPage: 50 }">
          <template v-slot:body-cell-balance="props"><q-td :props="props" class="text-negative text-weight-bold">{{ fmtCur(props.row._balance) }}</q-td></template>
          <template v-slot:body-cell-totalAmount="props"><q-td :props="props">{{ fmtCur(props.row.totalAmount) }}</q-td></template>
          <template v-slot:body-cell-totalPaid="props"><q-td :props="props">{{ fmtCur(props.row._paid) }}</q-td></template>
          <template v-slot:body-cell-payNow="props">
            <q-td :props="props">
              <q-btn flat dense color="positive" icon="payment" label="Pay" size="sm" @click="goToPayment(props.row)" />
            </q-td>
          </template>
        </q-table>
        <div class="row justify-between items-center q-mt-sm">
          <div>
            <q-btn flat color="primary" label="Select All" @click="selectedForPayment = [...unpaidSales]" class="q-mr-sm" />
            <q-btn flat label="Clear" @click="selectedForPayment = []" />
          </div>
          <div class="text-h6 text-negative" v-if="selectedForPayment.length">
            Selected: {{ fmtCur(selectedForPayment.reduce((s, r) => s + (r._balance || 0), 0)) }}
          </div>
          <q-btn v-if="selectedForPayment.length" unelevated color="positive" icon="payment" label="Proceed Payment" @click="openRepaymentDialog" />
        </div>
      </div>
    </div>
    </PrintLayout>

    <!-- Repayment Dialog â€” POS-style split payment -->
    <q-dialog v-model="showRepayDialog" persistent>
      <q-card style="min-width:420px; max-width:760px; width:100%;">
        <q-card-section class="row items-center">
          <div class="text-h6">Payment for {{ selectedForPayment.map(s => s.drNumber).join(', ') }}</div>
          <q-space />
          <div class="text-h5 text-weight-bold text-positive">{{ fmtCur(repayTotalDue) }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-2"><q-input v-model="repayDate" label="Payment Date" type="date" outlined dense /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmtCur(repayTotalDue)" label="Gross Due" outlined dense readonly bg-color="blue-1" /></div>
            <div class="col-12 col-md-2"><q-input v-model.number="repayLessVat" label="Less VAT (Optional)" type="number" min="0" step="0.01" prefix="P" outlined dense /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmtCur(repayNetDue)" label="Amount Due" outlined dense readonly bg-color="amber-1" /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmtCur(repaySplitTotalPaid)" label="Total Paid" outlined dense readonly bg-color="green-1" /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmtCur(repaySplitBalance)" label="Balance" outlined dense readonly :bg-color="repaySplitBalance > 0 ? 'red-1' : 'green-1'" /></div>
          </div>
          <div class="col-12 col-md-4 q-mb-md"><q-input v-model="repaySiNumber" label="SI Number (optional)" outlined dense /></div>

          <!-- Cash -->
          <q-card flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <div class="row q-col-gutter-md items-center">
                <div class="col-auto"><q-checkbox v-model="repaySplit.cashEnabled" label="Cash" /></div>
                <div class="col-3"><q-input v-if="repaySplit.cashEnabled" v-model.number="repaySplit.cashAmount" label="Cash Amount" type="number" outlined dense prefix="P" /></div>
                <div class="col-3" v-if="repaySplit.cashEnabled">
                  <q-input :model-value="fmtCur(Math.max(0, (repaySplit.cashAmount || 0) - repayNetDue))" label="Change" outlined dense readonly bg-color="green-1" />
                </div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Check/Bank -->
          <q-card flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <div class="row q-col-gutter-md items-center">
                <div class="col-auto"><q-checkbox v-model="repaySplit.checkEnabled" label="Check/Bank" /></div>
                <div class="col-2"><q-input v-if="repaySplit.checkEnabled" v-model.number="repaySplit.checkAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
                <div class="col-2"><q-select v-if="repaySplit.checkEnabled" v-model="repaySplit.checkBank" :options="['BPI','AUB','BDO','Metrobank','Landbank','PNB','Other']" label="Bank" outlined dense /></div>
                <div class="col-2"><q-input v-if="repaySplit.checkEnabled" v-model="repaySplit.checkNumber" label="Effective Date" type="date" outlined dense /></div>
                <div class="col-2"><q-input v-if="repaySplit.checkEnabled" v-model="repaySplit.checkAccountName" label="Account Number" outlined dense /></div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Online -->
          <q-card flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <div class="row q-col-gutter-md items-center">
                <div class="col-auto"><q-checkbox v-model="repaySplit.onlineEnabled" label="Online" /></div>
                <div class="col-2"><q-input v-if="repaySplit.onlineEnabled" v-model.number="repaySplit.onlineAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
                <div class="col-2"><q-select v-if="repaySplit.onlineEnabled" v-model="repaySplit.onlineChannel" :options="['GCash','BPI Online','AUB Online','Maya','Other']" label="Channel" outlined dense /></div>
                <div class="col-2" v-if="repaySplit.onlineEnabled && repaySplit.onlineChannel === 'GCash'"><q-select v-model="repaySplit.onlineGcashAccount" :options="['Katrina','Louie','Anicia']" label="GCash Account *" outlined dense clearable /></div>
                <div class="col-2"><q-input v-if="repaySplit.onlineEnabled" v-model="repaySplit.onlineRefNo" label="Reference Number" outlined dense /></div>
              </div>
            </q-card-section>
          </q-card>

          <q-banner v-if="repaySplitBalance > 0" class="bg-orange-1 q-mt-sm" rounded>
            <template v-slot:avatar><q-icon name="info" color="orange" /></template>
            Remaining {{ fmtCur(repaySplitBalance) }} will be added as customer balance (receivable)
          </q-banner>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn unelevated label="Complete Payment" color="positive" icon="check" :loading="repayProcessing" @click="processRepayment" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Sale Details Dialog -->
    <q-dialog v-model="showDetailsDialog">
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">Sale Details - {{ selectedSale?.drNumber }}</div>
        </q-card-section>
        <q-card-section v-if="selectedSale">
          <div class="text-subtitle2 q-mb-sm">Line Items:</div>
          <q-list bordered separator>
            <q-item v-for="(item, index) in selectedSale.lineItems" :key="index">
              <q-item-section>
                <q-item-label>{{ item.description }}</q-item-label>
                <q-item-label caption>
                  Qty: {{ item.quantity }} Ã— {{ formatCurrency(item.sellingPrice) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                {{ formatCurrency(item.lineTotal || item.quantity * item.sellingPrice) }}
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Close" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../boot/axios';
import { useCustomerStore } from '../stores/customerStore';
import PrintLayout from './PrintLayout.vue';
import PrintButton from './PrintButton.vue';
import { currentYearRange } from '../utils/date';

const router = useRouter();

interface Sale {
  drNumber: string;
  saleDate: Date;
  totalAmount: number;
  lineItems: any[];
}

interface CustomerReport {
  customerId: string;
  customerName: string;
  totalAmount: number;
  totalPaid: number;
  totalReceivable: number;
  sales: Sale[];
}

const customerStore = useCustomerStore();

const selectedCustomer = ref('');
const { startDate: defaultStartDate, endDate: defaultEndDate } = currentYearRange();
const startDate = ref(defaultStartDate);
const endDate = ref(defaultEndDate);
const loading = ref(false);
const showSalesTable = ref(true);
const showItemsTable = ref(false);
const showUnpaid = ref(true);
const report = ref<CustomerReport | null>(null);
const customerOptions = ref<{ label: string; value: string }[]>([]);
const showDetailsDialog = ref(false);
const selectedSale = ref<Sale | null>(null);

// Repayment
const unpaidSales = ref<any[]>([]);
const selectedForPayment = ref<any[]>([]);
const showRepayDialog = ref(false);
const repayDate = ref(new Date().toISOString().split('T')[0]);
const repayProcessing = ref(false);
const repaySiNumber = ref('');
const repayLessVat = ref(0);
const repayTotalDue = computed(() => selectedForPayment.value.reduce((s: number, r: any) => s + (r._balance || 0), 0));
const repayNormalizedLessVat = computed(() => {
  const value = Number(repayLessVat.value || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, repayTotalDue.value);
});
const repayNetDue = computed(() => Math.max(0, repayTotalDue.value - repayNormalizedLessVat.value));

// POS-style split payment for repayment
const repaySplit = ref({
  cashEnabled: false, cashAmount: 0,
  checkEnabled: false, checkAmount: 0, checkBank: '', checkNumber: '', checkAccountName: '',
  onlineEnabled: false, onlineAmount: 0, onlineChannel: '', onlineRefNo: '', onlineGcashAccount: ''
});
const repaySplitTotalPaid = computed(() => {
  let t = 0;
  if (repaySplit.value.cashEnabled) t += repaySplit.value.cashAmount || 0;
  if (repaySplit.value.checkEnabled) t += repaySplit.value.checkAmount || 0;
  if (repaySplit.value.onlineEnabled) t += repaySplit.value.onlineAmount || 0;
  return t;
});
const repaySplitBalance = computed(() => Math.max(0, repayNetDue.value - repaySplitTotalPaid.value));
const fmtCur = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);

const unpaidColumns = [
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const },
  { name: 'saleDate', label: 'Date', field: 'saleDate', align: 'left' as const, format: (v: string) => v ? new Date(v).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '' },
  { name: 'totalAmount', label: 'Total', field: 'totalAmount', align: 'right' as const },
  { name: 'totalPaid', label: 'Paid', field: '_paid', align: 'right' as const },
  { name: 'balance', label: 'Balance', field: '_balance', align: 'right' as const },
  { name: 'payNow', label: 'Action', field: '', align: 'center' as const }
];

const columns = [
  {
    name: 'drNumber',
    label: 'DR Number',
    field: 'drNumber',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'saleDate',
    label: 'Date',
    field: 'saleDate',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'totalAmount',
    label: 'Total Amount',
    field: 'totalAmount',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'totalPaid',
    label: 'Paid',
    field: 'totalPaid',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'balance',
    label: 'Balance',
    field: (row: any) => row.totalAmount - (row.totalPaid || 0),
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'actions',
    label: 'Actions',
    field: 'actions',
    align: 'center' as const,
  },
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
};

const lineItemColumns = [
  { name: 'description', label: 'Item Description', field: 'description', align: 'left' as const },
  { name: 'drNumber', label: 'DR#', field: 'drNumber', align: 'left' as const },
  { name: 'saleDate', label: 'Date', field: 'saleDate', align: 'left' as const },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'center' as const },
  { name: 'sellingPrice', label: 'Selling Price', field: 'sellingPrice', align: 'right' as const },
  { name: 'lineTotal', label: 'Total', field: 'lineTotal', align: 'right' as const },
];

const filteredSales = computed(() => {
  if (!report.value?.sales) return [];
  let list = report.value.sales;
  if (paymentFilter.value) {
    list = list.filter((s: any) => {
      const paid = Number(s.totalPaid || 0);
      const total = Number((s._effectiveDue ?? s.totalAmount) || 0);
      const balance = Math.max(0, +(total - paid).toFixed(2));
      const status = s._paymentStatus || (paid <= 0 ? 'UNPAID' : balance > 0 ? 'PARTIAL' : 'PAID');
      return status === paymentFilter.value;
    });
  }
  return list;
});

const allLineItems = computed(() => {
  if (!report.value?.sales) return [];
  const items: any[] = [];
  for (const sale of report.value.sales) {
    for (const item of (sale.lineItems || [])) {
      items.push({
        description: item.description || '',
        drNumber: sale.drNumber || '',
        saleDate: sale.saleDate,
        quantity: item.quantity || 0,
        sellingPrice: item.sellingPrice || 0,
        lineTotal: item.lineTotal || (item.quantity * item.sellingPrice) || 0,
      });
    }
  }
  // Sort alphabetically by description for better readability
  items.sort((a, b) => (a.description || '').toString().localeCompare((b.description || '').toString(), undefined, { sensitivity: 'base' }));
  return items;
});

const displayCustomerName = computed(() => {
  if (report.value?.customerName) return report.value.customerName;
  const selected = customerOptions.value.find(c => c.value === selectedCustomer.value);
  return selected?.label || 'All Customers';
});

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('en-PH');
};

const loadCustomers = async () => {
  await customerStore.fetchCustomers();
  customerOptions.value = customerStore.customers.map((c) => ({
    label: c.name,
    value: c._id,
  }));
};

onMounted(() => {
  loadCustomers();
});

const paymentFilter = ref<string | null>(null);
const paymentFilterOptions = [{ label: 'All', value: null }, { label: 'Unpaid', value: 'UNPAID' }, { label: 'Partial', value: 'PARTIAL' }, { label: 'Paid', value: 'PAID' }];

const loadReport = async () => {
  loading.value = true;
  try {
    const params: any = {};
    if (startDate.value) params.startDate = startDate.value;
    if (endDate.value) params.endDate = endDate.value;

    if (selectedCustomer.value) {
      // Single customer mode
      const response = await api.get(`/reports/customer-sales/${selectedCustomer.value}`, { params });
      report.value = response.data;
    } else {
      // All customers mode â€” use sales summary
      const response = await api.get('/reports/sales-summary', { params });
      const summaryData = response.data;
      // Build report format from summary
      report.value = {
        customerId: 'all',
        customerName: 'All Customers',
        totalAmount: summaryData.totalSales,
        totalPaid: summaryData.totalPaid,
        totalReceivable: summaryData.totalReceivable,
        sales: []
      };
// Fetch individual sales for the table
      const salesRes = await api.get('/sales', { params: { ...params, status: 'COMPLETED', limit: '10000' } });
      // Handle paginated response format
      let sales: any[] = [];
      if (salesRes.data?.data && Array.isArray(salesRes.data.data)) {
        sales = salesRes.data.data;
      } else if (salesRes.data?.sales && Array.isArray(salesRes.data.sales)) {
        sales = salesRes.data.sales;
      } else if (Array.isArray(salesRes.data)) {
        sales = salesRes.data;
      }
      const payRes = await api.get('/payments');
      const payments = payRes.data || [];
      const paidMap: Record<string, number> = {};
      const dueMap: Record<string, number> = {};
      for (const p of payments) {
        const sid = String(p.saleId?._id || p.saleId || '');
        if (!sid) continue;
        paidMap[sid] = +(Number(paidMap[sid] || 0) + Number(p.totalPaid || 0)).toFixed(2);
        const due = Number(p.amountDue || 0);
        if (Number.isFinite(due) && due > 0) {
          dueMap[sid] = Math.max(Number(dueMap[sid] || 0), due);
        }
      }
      report.value.sales = sales.map((s: any) => {
        const sid = String(s._id || '');
        const paid = Number(paidMap[sid] || 0);
        const effectiveDue = Number(dueMap[sid] || s.totalAmount || 0);
        const balance = Math.max(0, +(effectiveDue - paid).toFixed(2));
        return {
          drNumber: s.drNumber,
          saleDate: s.saleDate,
          totalAmount: s.totalAmount,
          totalPaid: paid,
          _effectiveDue: effectiveDue,
          _balance: balance,
          lineItems: s.lineItems || [],
          customerName: s.customerName || s.customerId?.name || 'Walk-in',
          _paymentStatus: paid <= 0 ? 'UNPAID' : balance > 0 ? 'PARTIAL' : 'PAID'
        };
      });
    }

    await loadUnpaidSales();
  } catch (error) {
    console.error('Failed to load customer report:', error);
  } finally {
    loading.value = false;
  }
};

const goToPayment = (sale: any) => {
  // Redirect to Sales History with payFor param â€” auto-opens receipt/payment dialog
  router.push({ path: '/sales', query: { payFor: sale._id } });
};

const normalizeSalesResponse = (payload: any) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  if (payload?.sales && Array.isArray(payload.sales)) return payload.sales;
  return [];
};

const loadUnpaidSales = async () => {
  if (!selectedCustomer.value) { unpaidSales.value = []; return; }
  try {
    // Use report.value.sales which already has all sales with _id and totalPaid from the customer report API
    const sales = report.value?.sales || [];
    unpaidSales.value = sales
      .filter((s: any) => {
        const paid = Number(s.totalPaid || 0);
        const effectiveDue = Number((s._effectiveDue ?? s.totalAmount) || 0);
        const balance = Number(s._balance ?? Math.max(0, +(effectiveDue - paid).toFixed(2)));
        return balance > 0;
      })
      .map((s: any, idx: number) => ({
        ...s,
        _id: String(s._id || s.id || `unpaid-${idx}`),
        _paid: Number(s.totalPaid || 0),
        _balance: Number(s._balance ?? Math.max(0, +(((s._effectiveDue ?? s.totalAmount) || 0) - (s.totalPaid || 0)).toFixed(2)))
      }));
    selectedForPayment.value = [];
  } catch (e) {
    console.error('loadUnpaidSales error:', e);
    unpaidSales.value = [];
  }
};

const openRepaymentDialog = () => {
  repayDate.value = new Date().toISOString().split('T')[0];
  repayLessVat.value = 0;
  repaySplit.value.cashEnabled = false;
  repaySplit.value.cashAmount = 0;
  repaySplit.value.checkEnabled = false;
  repaySplit.value.checkAmount = 0;
  repaySplit.value.checkBank = '';
  repaySplit.value.checkNumber = '';
  repaySplit.value.checkAccountName = '';
  repaySplit.value.onlineEnabled = false;
  repaySplit.value.onlineAmount = 0;
  repaySplit.value.onlineChannel = '';
  repaySplit.value.onlineRefNo = '';
  repaySplit.value.onlineGcashAccount = '';
  repaySiNumber.value = '';
  showRepayDialog.value = true;
};

const processRepayment = async () => {
  if (selectedForPayment.value.length === 0) return;
  repayProcessing.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');

    const s = repaySplit.value;
    let totalPaid = 0;
    let cashPayment = 0;
    const paymentChannels: any[] = [];

    if (s.cashEnabled && s.cashAmount > 0) {
      cashPayment = s.cashAmount;
      totalPaid += cashPayment;
    }
    if (s.checkEnabled && s.checkAmount > 0) {
      totalPaid += s.checkAmount;
      const bankUp = String(s.checkBank || 'OTHER').toUpperCase();
      paymentChannels.push({ channel: bankUp, amount: s.checkAmount, effectiveDate: s.checkNumber || undefined, accountName: s.checkAccountName || undefined });
    }
    if (s.onlineEnabled && s.onlineAmount > 0) {
      totalPaid += s.onlineAmount;
      let chName = String(s.onlineChannel || 'GCash').trim();
      // Match to standard uppercase channel names
      const chMap: Record<string, string> = {
        'GCash': 'GCASH', 'gcash': 'GCASH', 'GCASH': 'GCASH',
        'BPI Online': 'BPI ONLINE', 'BPI online': 'BPI ONLINE', 'BPI ONLINE': 'BPI ONLINE',
        'AUB Online': 'AUB ONLINE', 'AUB ONLINE': 'AUB ONLINE',
        'Maya': 'MAYA', 'MAYA': 'MAYA', 'maya': 'MAYA',
      };
      const channelUp = chMap[chName] || chName.toUpperCase();
      paymentChannels.push({
        channel: channelUp,
        amount: s.onlineAmount,
        referenceNumber: s.onlineRefNo || undefined,
        accountName: (channelUp === 'GCASH') ? (s.onlineGcashAccount || undefined) : undefined,
      });
    }

    const grossDue = repayTotalDue.value;
    const lessVat = repayNormalizedLessVat.value;
    const netDue = Math.max(0, grossDue - lessVat);

    if (totalPaid <= 0) {
      alert('Please enter a payment amount.');
      repayProcessing.value = false;
      return;
    }

    totalPaid = Math.min(totalPaid, netDue);

    // Compute per-sale net due after proportional Less VAT distribution.
    const perSale = selectedForPayment.value.map((sale: any) => {
      const balance = Number(sale._balance || 0);
      const lessVatShare = grossDue > 0 ? +(lessVat * (balance / grossDue)).toFixed(2) : 0;
      const netBalance = Math.max(0, +(balance - lessVatShare).toFixed(2));
      return { sale, balance, netBalance };
    });

    // Fix rounding residue so total net equals desired netDue.
    const netSum = perSale.reduce((s: number, r: any) => s + r.netBalance, 0);
    const residue = +(netDue - netSum).toFixed(2);
    if (perSale.length > 0 && residue !== 0) {
      perSale[0].netBalance = Math.max(0, +(perSale[0].netBalance + residue).toFixed(2));
    }

    let remaining = totalPaid;
    for (const row of perSale) {
      if (remaining <= 0) break;
      const sale = row.sale;
      const payAmount = Math.min(remaining, row.netBalance || 0);
      remaining -= payAmount;

      // Resolve _id
      const saleId = sale._id || sale.id;
      if (!saleId) { console.error('Sale missing _id', sale); continue; }

      // For each sale, allocate payment proportionally across methods
      let saleCash = 0;
      const saleChannels: any[] = [];

      if (totalPaid === payAmount) {
        // Single sale or exact match — use full amounts
        saleCash = cashPayment;
        saleChannels.push(...paymentChannels);
      } else {
        // Multiple sales — scale proportionally
        const ratio = payAmount / totalPaid;
        saleCash = +(cashPayment * ratio).toFixed(2);
        for (const ch of paymentChannels) {
          saleChannels.push({ ...ch, amount: +(ch.amount * ratio).toFixed(2) });
        }
      }

      const res = await fetch(`${API_URL}/api/payments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          customerId: selectedCustomer.value || undefined,
          paymentDate: repayDate.value,
          amountDue: row.netBalance,
          totalPaid: payAmount,
          cashPayment: saleCash,
          paymentChannels: saleChannels,
          siNumber: repaySiNumber.value || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details?.map((d: any) => d.message).join(', ') || `Payment failed for ${sale.drNumber}`);
      }
    }

    showRepayDialog.value = false;
    selectedForPayment.value = [];
    await loadReport();
  } catch (e: any) {
    alert('Payment failed: ' + (e?.message || 'Unknown error'));
    console.error('processRepayment error:', e);
  } finally {
    repayProcessing.value = false;
  }
};


const viewSaleDetails = (sale: Sale) => {
  selectedSale.value = sale;
  showDetailsDialog.value = true;
};

const exportToPDF = async () => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();

  if (!report.value) return;

  doc.setFontSize(18);
  doc.text('Customer Sales Report', 14, 20);

  doc.setFontSize(12);
  doc.text(`Customer: ${displayCustomerName.value}`, 14, 35);
  doc.text(`Total Amount: ${formatCurrency(report.value.totalAmount)}`, 14, 42);
  doc.text(`Total Paid: ${formatCurrency(report.value.totalPaid)}`, 14, 49);
  doc.text(`Total Receivable: ${formatCurrency(report.value.totalReceivable)}`, 14, 56);

  let y = 70;
  doc.text('Sales Transactions:', 14, y);
  y += 10;

  report.value.sales.forEach((sale) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.text(`${sale.drNumber}`, 14, y);
    doc.text(`${formatDate(sale.saleDate)}`, 80, y);
    doc.text(`${formatCurrency(sale.totalAmount)}`, 140, y);
    y += 7;
  });

  doc.save(`customer-report-${report.value.customerName}.pdf`);
};

const exportToExcel = async () => {
  const XLSX = await import('xlsx');

  if (!report.value) return;

  const ws = XLSX.utils.json_to_sheet(
    report.value.sales.map((s) => ({
      'DR Number': s.drNumber,
      Date: formatDate(s.saleDate),
      'Total Amount': s.totalAmount,
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customer Sales');

  XLSX.writeFile(wb, `customer-report-${displayCustomerName.value}.xlsx`);
};

const printLedger = () => {
  if (!report.value) return;
  const sales = (filteredSales.value || []).filter((s: any) => ((s.totalAmount || 0) - (s.totalPaid || 0)) > 0.01);
  let rows = '';
  let totalUnpaid = 0;

  sales.forEach((s: any, idx: number) => {
    const amt = s.totalAmount || 0;
    const paid = s.totalPaid || 0;
    const balance = amt - paid;
    totalUnpaid += balance;
    const date = s.saleDate ? new Date(s.saleDate).toLocaleDateString('en-PH') : '';
    rows += `<tr style="color:#c62828;background:#fff5f5"><td>${idx + 1}</td><td>${date}</td><td>${s.drNumber || ''}</td><td style="text-align:right">P${amt.toFixed(2)}</td><td style="text-align:center;font-weight:bold">UNPAID</td></tr>`;
  });

  const custName = displayCustomerName.value;
  const slipBlock = (label: string) => `<div class="slip"><div class="copy-label">${label}</div>
    <div class="header"><h2 style="margin:0">Aberin Hardware</h2><p class="cust-name">Customer Ledger — ${custName}</p></div>
    <table><thead><tr><th>#</th><th>Date</th><th>DR#</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row" style="color:#c62828"><td colspan="3" style="text-align:right">UNPAID TOTAL:</td><td style="text-align:right">P${totalUnpaid.toFixed(2)}</td><td></td></tr>
    </tfoot></table>
    <div class="sig-row"><div class="sig"><div>Customer Signature</div></div><div class="sig"><div>Prepared by</div></div></div></div>`;

  const html = `<!DOCTYPE html><html><head><title>Customer Ledger</title><style>body{font-family:Arial;font-size:10px;margin:0;padding:0}.slip{padding:8px 16px;height:48vh;overflow:hidden;position:relative;box-sizing:border-box}.copy-label{position:absolute;top:3px;right:10px;font-size:8px;color:#999;font-style:italic}.divider{border-top:2px dashed #999;text-align:center;font-size:9px;color:#999;padding:2px 0}.header{text-align:center;margin-bottom:6px}.header h2{margin:0;font-size:14px}.header p{margin:2px 0;font-size:10px}.cust-name{font-size:11px;font-weight:600}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 5px;font-size:10px}th{background:#f0f0f0}.total-row{font-weight:bold;font-size:11px;background:#f0f0f0}.sig-row{display:flex;justify-content:space-between;margin-top:10px}.sig{text-align:center;width:170px;font-size:10px}.sig div{border-top:1px solid #333;padding-top:2px;margin-top:18px}@media print{body{margin:0}@page{margin:3mm}}</style></head><body>
  ${slipBlock('ORIGINAL COPY')}
  <div class="divider">✔ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
  ${slipBlock('CUSTOMER COPY')}
  <div style="text-align:center;margin:6px 0"><button onclick="window.print()" style="padding:6px 16px;cursor:pointer">Print</button></div></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};
</script>



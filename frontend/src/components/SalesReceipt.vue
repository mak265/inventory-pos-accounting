<template>
  <div class="sales-receipt">
    <q-card class="sales-receipt-card">
      <!-- Header -->
      <q-card-section class="q-pb-none">
        <div class="text-center q-mb-sm">
          <div class="text-h6 text-bold" style="letter-spacing:1px">{{ companyName }}</div>
          <div class="text-caption text-grey-7" style="font-size:11px">SALES RECEIPT</div>
        </div>
        <div class="row q-mt-sm" style="font-size:13px">
          <div class="col-6"><strong>{{ sale?.documentType || 'DR' }}#:</strong> {{ sale?.drNumber || 'N/A' }}</div>
          <div class="col-6 text-right"><strong>Date:</strong> {{ fmtD(sale?.saleDate) }}</div>
        </div>
        <div style="font-size:13px"><strong>Customer:</strong> {{ sale?.customerName || '' }}</div>
        <div v-if="sale?.deliveryAddress" style="font-size:12px; color:#555"><strong>Address:</strong> {{ sale.deliveryAddress }}</div>
      </q-card-section>

      <!-- Line Items -->
      <q-card-section class="q-pt-sm q-pb-none">
        <q-table :rows="sale?.lineItems || []" :columns="cols" row-key="productId" flat bordered hide-pagination :rows-per-page-options="[0]" dense>
          <template v-slot:body-cell-sellingPrice="props"><q-td :props="props">{{ fmt(props.row.sellingPrice) }}</q-td></template>
          <template v-slot:body-cell-lineTotal="props"><q-td :props="props">{{ fmt(props.row.lineTotal) }}</q-td></template>
          <template v-slot:bottom-row>
            <q-tr v-if="sale?.deliveryFee || sale?.tollFee">
              <q-td colspan="3" class="text-right text-caption">Subtotal:</q-td>
              <q-td class="text-right">{{ fmt(sale?.lineItems?.reduce((s: number, i: any) => s + (i.lineTotal || 0), 0) || 0) }}</q-td>
            </q-tr>
            <q-tr v-if="sale?.deliveryFee"><q-td colspan="3" class="text-right text-caption">Delivery Fee:</q-td><q-td class="text-right">{{ fmt(sale.deliveryFee) }}</q-td></q-tr>
            <q-tr v-if="sale?.tollFee"><q-td colspan="3" class="text-right text-caption">Toll Fee:</q-td><q-td class="text-right">{{ fmt(sale.tollFee) }}</q-td></q-tr>
            <q-tr v-if="appliedLessVat > 0"><q-td colspan="3" class="text-right text-caption">Less VAT:</q-td><q-td class="text-right text-negative">-{{ fmt(appliedLessVat) }}</q-td></q-tr>
            <q-tr><q-td colspan="3" class="text-right text-bold">TOTAL:</q-td><q-td class="text-bold text-h6">{{ fmt(sale?.totalAmount) }}</q-td></q-tr>
            <q-tr v-if="appliedLessVat > 0"><q-td colspan="3" class="text-right text-caption">Net Due:</q-td><q-td class="text-right text-weight-bold">{{ fmt(displayTotalDue) }}</q-td></q-tr>
          </template>
        </q-table>
      </q-card-section>

      <!-- Status & Payment -->
      <q-card-section class="q-pt-sm">
        <div class="row items-center q-mb-xs">
          <div class="col-6"><q-badge :color="statusColor" :label="sale?.status" /> <span v-if="sale?.postedAt" class="text-caption text-grey q-ml-sm">{{ fmtDT(sale.postedAt) }}</span></div>
          <div class="col-6 text-right"><q-badge v-if="bal <= 0 && paymentData" color="positive" label="FULLY PAID" /><q-badge v-else-if="paymentData" color="orange" :label="'Balance: ' + fmt(bal)" /></div>
        </div>
        <!-- Payment info -->
        <div v-if="allPayments.length > 0" class="q-mt-md">
          <div class="row items-center q-mb-xs">
            <div class="col text-subtitle2">Payments</div>
            <div class="col-auto text-caption text-grey-6">{{ allPayments.length }} record{{ allPayments.length > 1 ? 's' : '' }}</div>
          </div>
          <div v-for="(pmt, idx) in allPayments" :key="pmt._id" class="q-pa-sm bg-grey-1 rounded-borders q-mb-xs">
            <div class="row items-center">
              <div class="col">
                <span class="text-caption text-grey-7">{{ fmtD(pmt.paymentDate) }}</span>
                <span class="q-ml-sm text-weight-medium">{{ fmt(pmt.totalPaid) }}</span>
                <span v-if="pmt.referenceNumber" class="text-caption text-grey-6 q-ml-sm">Ref: {{ pmt.referenceNumber }}</span>
                <div v-for="(ch, i) in (pmt.paymentChannels || [])" :key="i" class="text-caption text-grey-7">
                  {{ ch.channel }} — {{ fmt(ch.amount) }}
                  <span v-if="ch.referenceNumber" class="q-ml-xs">Ref: {{ ch.referenceNumber }}</span>
                </div>
              </div>
              <div class="col-auto no-print">
                <q-btn flat round dense size="xs" icon="delete" color="negative"
                  @click="removePayment(pmt)"
                  :title="'Remove this payment'"
                />
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="sale?.status === 'COMPLETED'" class="q-mt-md">
          <q-banner class="bg-orange-1" rounded>
            <template v-slot:avatar><q-icon name="warning" color="orange" /></template>
            No payment — <span class="text-bold text-negative">UNPAID ({{ fmt(sale?.totalAmount) }})</span>
          </q-banner>
        </div>
        <div v-if="sale?.status === 'CANCELLED'" class="q-mt-md">
          <q-banner class="bg-red-1" rounded><template v-slot:avatar><q-icon name="block" color="negative" /></template><span class="text-bold text-negative">VOIDED</span></q-banner>
        </div>
        <!-- Bounced Check Warning -->
        <div v-if="bouncedChecks.length > 0" class="q-mt-md">
          <q-banner class="bg-red-1" rounded>
            <template v-slot:avatar><q-icon name="warning" color="negative" /></template>
            <div class="text-bold text-negative">BOUNCED CHECK{{ bouncedChecks.length > 1 ? 'S' : '' }}</div>
            <div v-for="bc in bouncedChecks" :key="bc._id" class="q-mt-xs">
              {{ bc.referenceNumber || 'N/R' }} — {{ fmt(bc.amount) }} ({{ bc.customerName }})
            </div>
            <div class="text-caption q-mt-sm">The customer needs to repay this amount.</div>
          </q-banner>
        </div>
      </q-card-section>
      <q-card-actions align="right" class="no-print">
        <q-btn v-if="isUnpaid" unelevated label="Pay Now" color="positive" icon="payment" @click="openPayDialog" />
        <q-btn flat label="Delivery Slip" color="teal" icon="local_shipping" @click="printDeliverySlip" />
        <q-btn v-if="sale?.status !== 'CANCELLED' && sale?.status !== 'DRAFT'" flat label="Void" color="negative" icon="block" @click="showVoid = true" />
        <q-btn flat label="Close" color="primary" @click="$emit('close')" />
        <q-btn flat label="Print Receipt" color="primary" icon="print" @click="printReceipt" />
      </q-card-actions>
    </q-card>

    <!-- Pay Now Dialog — Split Bills -->
    <q-dialog v-model="showPay" persistent>
      <q-card style="min-width: 420px; max-width: 760px; width: 100%;">
        <q-card-section class="row items-center">
          <div class="text-h6">Payment for {{ sale?.drNumber }}</div>
          <q-space />
          <div class="text-h5 text-weight-bold text-positive">{{ fmt(payNetDue) }}</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showPay = false" />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-2"><q-input v-model="pay.paymentDate" label="Payment Date" type="date" outlined dense /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmt(unpaidAmount)" label="Gross Due" outlined dense readonly bg-color="blue-1" /></div>
            <div class="col-12 col-md-2"><q-input v-model.number="pay.lessVat" label="Less VAT (Optional)" type="number" min="0" step="0.01" prefix="P" outlined dense /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmt(payNetDue)" label="Amount Due" outlined dense readonly bg-color="amber-1" /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmt(payTotalPaid)" label="Total Paid" outlined dense readonly bg-color="green-1" /></div>
            <div class="col-12 col-md-2"><q-input :model-value="fmt(Math.max(0, payNetDue - payTotalPaid))" label="Balance" outlined dense readonly :bg-color="payTotalPaid < payNetDue ? 'red-1' : 'green-1'" /></div>
          </div>

          <!-- Cash -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="pay.cashEnabled" label="Cash" /></div>
              <div class="col-3" v-if="pay.cashEnabled"><q-input v-model.number="pay.cashAmount" label="Cash Amount" type="number" outlined dense prefix="P" /></div>
            </div>
          </q-card-section></q-card>

          <!-- Check/Bank -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="pay.checkEnabled" label="Check/Bank" /></div>
              <div class="col-2" v-if="pay.checkEnabled"><q-input v-model.number="pay.chargeAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
              <div class="col-2" v-if="pay.checkEnabled"><q-select v-model="pay.channel" :options="['BPI','AUB','BDO','Metrobank','Landbank','PNB','Other']" label="Bank" outlined dense /></div>
              <div class="col-2" v-if="pay.checkEnabled"><q-input v-model="pay.refNo" label="Effective Date" type="date" outlined dense /></div>
              <div class="col-2" v-if="pay.checkEnabled"><q-input v-model="pay.accountName" label="Account Number" outlined dense /></div>
            </div>
          </q-card-section></q-card>

          <!-- Online -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="pay.onlineEnabled" label="Online" /></div>
              <div class="col-2" v-if="pay.onlineEnabled"><q-input v-model.number="pay.onlineAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
              <div class="col-2" v-if="pay.onlineEnabled"><q-select v-model="pay.onlineChannel" :options="['GCash','BPI Online','AUB Online','Maya','Other']" label="Channel" outlined dense /></div>
              <div class="col-2" v-if="pay.onlineEnabled && pay.onlineChannel === 'GCash'"><q-select v-model="pay.onlineGcashAccount" :options="['Katrina','Louie','Anicia']" label="GCash Account *" outlined dense clearable /></div>
              <div class="col-2" v-if="pay.onlineEnabled"><q-input v-model="pay.onlineRefNo" label="Reference No." outlined dense /></div>
            </div>
          </q-card-section></q-card>

          <q-banner v-if="payTotalPaid < payNetDue && payTotalPaid > 0" class="bg-orange-1 q-mt-sm" rounded>
            <template v-slot:avatar><q-icon name="info" color="orange" /></template>
            Partial payment of {{ fmt(payTotalPaid) }}. Remaining {{ fmt(payNetDue - payTotalPaid) }} will be balance.
          </q-banner>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" @click="showPay = false" />
          <q-btn unelevated label="Complete Payment" color="positive" icon="check" @click="submitPayment" :loading="paying" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Void Dialog -->
    <q-dialog v-model="showVoid" persistent>
      <q-card style="min-width: 400px">
        <q-card-section><div class="text-h6 text-negative">Void Sale</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-select v-model="voidReason" :options="voidReasons" label="Reason *" outlined dense />
          <q-input v-if="voidReason === 'Other'" v-model="voidReasonOther" label="Specify" outlined dense />
          <q-input v-model="voidPassword" label="Admin Password *" type="password" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showVoid = false" />
          <q-btn label="Void Sale" color="negative" @click="voidSale" :loading="voiding" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settingsStore';
import { Notify, useQuasar } from 'quasar';

const props = defineProps<{ sale: any }>();
const emit = defineEmits(['close', 'voided', 'paid']);

const $q = useQuasar();

const API_URL = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('auth_token') || '';
const settingsStore = useSettingsStore();
const companyName = computed(() => settingsStore.companyName || 'Inventory & POS System');
const paymentData = ref<any>(null);
const allPayments = ref<any[]>([]);
const bouncedChecks = ref<any[]>([]);

const showPay = ref(false);
const paying = ref(false);
const showVoid = ref(false);
const voiding = ref(false);
const voidReason = ref('');
const voidReasonOther = ref('');
const voidPassword = ref('');
const voidReasons = ['Wrong item','Wrong price','Wrong customer','Customer returned','Duplicate entry','System error','Other'];

const pay = ref({
  paymentDate: new Date().toISOString().split('T')[0],
  lessVat: 0,
  siNumber: '',
  method: 'CASH' as 'CASH'|'CHARGE'|'ONLINE',
  cashEnabled: false, cashAmount: 0,
  checkEnabled: false, chargeAmount: 0,
  channel: null as string|null, refNo: '', accountName: '', effectiveDate: '',
  onlineEnabled: false, onlineChannel: null as string|null, onlineRefNo: '', onlineAmount: 0, onlineDate: '', onlineGcashAccount: '' as string
});

const payTotalPaid = computed(() => {
  let total = 0;
  if (pay.value.cashEnabled) total += pay.value.cashAmount || 0;
  if (pay.value.checkEnabled) total += pay.value.chargeAmount || 0;
  if (pay.value.onlineEnabled) total += pay.value.onlineAmount || 0;
  return total;
});

const normalizedLessVat = computed(() => {
  const value = Number(pay.value.lessVat || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, unpaidAmount.value);
});

const payNetDue = computed(() => Math.max(0, unpaidAmount.value - normalizedLessVat.value));

const cols = [
  { name: 'description', label: 'Product', field: 'description', align: 'left' as const },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'center' as const },
  { name: 'sellingPrice', label: 'Price', field: 'sellingPrice', align: 'right' as const },
  { name: 'lineTotal', label: 'Total', field: 'lineTotal', align: 'right' as const }
];

const fmt = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const fmtD = (d: any) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
const fmtDT = (d: any) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const statusColor = computed(() => { switch(props.sale?.status) { case 'COMPLETED': return 'positive'; case 'DRAFT': return 'warning'; case 'CANCELLED': return 'negative'; default: return 'grey'; } });
const paymentEffectiveDue = computed(() => {
  const grossTotal = Number(props.sale?.totalAmount || 0);
  const maxAmountDue = allPayments.value.reduce((max, p) => {
    const due = Number(p?.amountDue || 0);
    if (!Number.isFinite(due) || due <= 0) return max;
    return Math.max(max, due);
  }, 0);
  if (maxAmountDue <= 0) return grossTotal;
  return Math.max(0, maxAmountDue);
});
const appliedLessVat = computed(() => {
  const grossTotal = Number(props.sale?.totalAmount || 0);
  const netDue = Number(paymentEffectiveDue.value || 0);
  const diff = Math.max(0, +(grossTotal - netDue).toFixed(2));
  return diff;
});
const displayTotalDue = computed(() => Number(paymentEffectiveDue.value || 0));
const bal = computed(() => {
  const due = paymentEffectiveDue.value;
  const paid = allPayments.value.reduce((sum, p) => sum + Number(p?.totalPaid || 0), 0);
  return Math.max(0, +(due - paid).toFixed(2));
});
const isUnpaid = computed(() => props.sale?.status === 'COMPLETED' && bal.value > 0);
const unpaidAmount = computed(() => bal.value);

const openPayDialog = () => {
  pay.value.paymentDate = new Date().toISOString().split('T')[0];
  pay.value.cashAmount = 0;
  pay.value.cashEnabled = false;
  pay.value.checkEnabled = false;
  pay.value.onlineEnabled = false;
  pay.value.chargeAmount = 0;
  pay.value.onlineAmount = 0;
  pay.value.channel = null;
  pay.value.onlineChannel = null;
  pay.value.refNo = '';
  pay.value.accountName = '';
  pay.value.onlineRefNo = '';
  pay.value.onlineGcashAccount = '';
  pay.value.lessVat = 0;
  showPay.value = true;
};

const printReceipt = () => {
  const items = (props.sale?.lineItems || []).map((item: any) =>
    `<tr><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${(item.lineTotal||0).toFixed(2)}</td></tr>`
  ).join('');
  const company = settingsStore.companyName || 'Aberin Hardware';
  const drNum = props.sale?.drNumber || '';
  const docType = props.sale?.documentType || 'DR';
  const date = fmtD(props.sale?.saleDate);
  const customer = props.sale?.customerName || '';
  const address = props.sale?.deliveryAddress || '';
  const grossTotal = Number(props.sale?.totalAmount || 0);
  const total = Number(paymentEffectiveDue.value || grossTotal);
  const lessVat = Math.max(0, +(grossTotal - total).toFixed(2));
  const delFee = props.sale?.deliveryFee || 0;
  const tolFee = props.sale?.tollFee || 0;
  const itemsTotal = (props.sale?.lineItems || []).reduce((s: number, i: any) => s + (i.lineTotal || 0), 0);

  const html = `<!DOCTYPE html><html><head><title>Receipt</title>
<style>
  @page { margin: 0; size: 58mm auto; }
  body { font-family: 'Courier New', monospace; font-size: 10px; width: 46mm; margin: 0 auto; padding: 1.5mm 1mm; color: #000; line-height: 1.25; font-weight: bold; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; font-size: 9.5px; vertical-align: top; font-weight: bold; }
  .total-row td { font-size: 12px; font-weight: bold; }
  .footer { font-size: 10px; color: #000; margin-top: 3px; text-align: center; font-weight: bold; }
  .no-print { display: block; }
  @media print { .no-print { display: none !important; } }
</style></head><body>
  <div class="center bold" style="font-size:13px">SALES RECEIPT</div>
  <div class="line"></div>
  <div>${docType}#: ${drNum} | ${date}</div>
  ${customer ? `<div>${customer}</div>` : ''}
  ${address ? `<div style="font-size:9px">${address}</div>` : ''}
  <div class="line"></div>
  <table>
    <tr style="font-weight:bold"><td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Amt</td></tr>
    ${items}
  </table>
  <div class="line"></div>
  ${delFee > 0 ? `<div class="right">Del: P${delFee.toFixed(2)}</div>` : ''}
  ${tolFee > 0 ? `<div class="right">Toll: P${tolFee.toFixed(2)}</div>` : ''}
  ${lessVat > 0 ? `<div class="right">Less VAT: -P${lessVat.toFixed(2)}</div>` : ''}
  <div class="right bold" style="font-size:14px">TOTAL: P${total.toFixed(2)}</div>
  <div class="line"></div>
  <div class="footer">Not valid as official receipt<br>for tax purposes.<br>Thank you!</div>
  <div class="no-print" style="text-align:center;margin-top:5px"><button onclick="window.print()" style="padding:4px 12px;cursor:pointer">🖨️ Print</button></div>
</body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

const printDeliverySlip = () => {
  const items = (props.sale?.lineItems || []).map((item: any, i: number) =>
    `<tr><td>${i + 1}</td><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">P${(item.sellingPrice || 0).toFixed(2)}</td><td style="text-align:right">P${(item.lineTotal || 0).toFixed(2)}</td></tr>`
  ).join('');
  const company = settingsStore.companyName || 'Aberin Hardware';
  const drNum = props.sale?.drNumber || 'N/A';
  const date = fmtD(props.sale?.saleDate);
  const customer = props.sale?.customerName || 'Walk-in';
  const deliveryAddr = props.sale?.deliveryAddress || '';
  const total = (props.sale?.totalAmount || 0).toFixed(2);
  const delFee = props.sale?.deliveryFee || 0;
  const tolFee = props.sale?.tollFee || 0;
  const notes = props.sale?.notes || '';
  const itemsSubtotal = (props.sale?.lineItems || []).reduce((s: number, i: any) => s + (i.lineTotal || 0), 0);

  const slipBlock = (copyLabel: string) => `
    <div class="slip">
      <div class="copy-label">${copyLabel}</div>
      <div class="header"><h1>${company}</h1><p>DELIVERY RECEIPT</p></div>
      <div class="info">
        <div><strong>Customer:</strong> <span style="font-size:13px;font-weight:bold">${customer}</span>${deliveryAddr ? `<br><strong>Deliver to:</strong> <span style="font-size:12px">${deliveryAddr}</span>` : ''}</div>
        <div style="text-align:right"><strong>DR #:</strong> ${drNum}<br><strong>Date:</strong> ${date}</div>
      </div>
      <table><thead><tr><th>#</th><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${items}</tbody></table>
      <div class="totals">
        <div style="text-align:right;font-size:11px">Subtotal: P${itemsSubtotal.toFixed(2)}</div>
        ${delFee > 0 ? `<div style="text-align:right;font-size:11px">Delivery Fee: P${delFee.toFixed(2)}</div>` : ''}
        ${tolFee > 0 ? `<div style="text-align:right;font-size:11px">Toll Fee: P${tolFee.toFixed(2)}</div>` : ''}
        <div class="total">GRAND TOTAL: P${total}</div>
      </div>
      ${notes ? `<div class="notes"><strong>Notes:</strong> ${notes}</div>` : ''}
      <div class="remarks">Received the above goods in good order and condition.</div>
      <div class="footer">
        <div class="sig"><div>Received by / Signature</div></div>
        <div class="sig"><div>Authorized by</div></div>
      </div>
      <div class="notes-lines"><strong>Notes:</strong><div class="line"></div><div class="line"></div></div>
    </div>`;

  const html = `<!DOCTYPE html><html><head><title>DR ${drNum}</title>
<style>
  body{font-family:Arial,sans-serif;padding:0;margin:0;color:#333}
  .slip{padding:6px 12px;height:46vh;overflow:hidden;position:relative;box-sizing:border-box}
  .copy-label{position:absolute;top:4px;right:12px;font-size:8px;color:#999;font-style:italic}
  .divider{border-top:2px dashed #999;margin:0;text-align:center;font-size:8px;color:#999;padding:2px 0}
  .header{text-align:center;margin-bottom:4px}
  .header h1{margin:0;font-size:14px;font-weight:bold}
  .header p{margin:1px 0;color:#666;font-size:10px}
  .info{display:flex;justify-content:space-between;margin-bottom:4px;font-size:10px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  th,td{border:1px solid #ddd;padding:2px 4px;text-align:left}
  th{background:#f5f5f5;font-weight:600}
  .total{text-align:right;font-size:12px;font-weight:700;margin-top:2px;padding:2px;border-top:1px solid #333}
  .remarks{font-size:8px;font-style:italic;color:#555;margin-top:4px}
  .notes{font-size:9px;margin-top:3px;padding:3px 5px;background:#f9f9f9;border-left:3px solid #1976d2}
  .notes-lines{font-size:8px;margin-top:4px}
  .notes-lines .line{border-bottom:1px solid #999;height:10px;margin-top:2px}
  .footer{margin-top:6px;display:flex;justify-content:space-between;font-size:9px}
  .sig{text-align:center;width:160px}
  .sig div{border-top:1px solid #333;padding-top:3px;margin-top:16px}
  @media print{body{margin:0}@page{margin:4mm}}
</style></head><body>
${slipBlock('ORIGINAL COPY')}
<div class="divider">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
${slipBlock('DUPLICATE COPY')}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

const submitPayment = async () => {
  paying.value = true;
  try {
    const channels: any[] = [];
    let cashPayment = 0;
    let totalPaid = 0;

    if (pay.value.cashEnabled && pay.value.cashAmount > 0) {
      cashPayment = Math.min(pay.value.cashAmount, payNetDue.value);
      totalPaid += cashPayment;
    }
    if (pay.value.checkEnabled && pay.value.chargeAmount > 0) {
      const amt = pay.value.chargeAmount;
      totalPaid += amt;
      channels.push({ channel: pay.value.channel || 'OTHER', amount: amt, effectiveDate: pay.value.refNo || undefined, accountName: pay.value.accountName });
    }
    if (pay.value.onlineEnabled && pay.value.onlineAmount > 0) {
      const amt = pay.value.onlineAmount;
      totalPaid += amt;
      channels.push({ channel: pay.value.onlineChannel || 'GCASH', amount: amt, referenceNumber: pay.value.onlineRefNo, accountName: pay.value.onlineGcashAccount || undefined });
    }

    totalPaid = Math.min(totalPaid, payNetDue.value);

    const customerId = props.sale?.customerId?._id || props.sale?.customerId;
    await fetch(`${API_URL}/api/payments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saleId: props.sale._id,
        customerId: customerId && customerId !== 'walk-in' ? customerId : undefined,
        paymentDate: pay.value.paymentDate,
        amountDue: payNetDue.value,
        cashPayment,
        chargePayment: 0,
        paymentChannels: channels
      })
    });
    showPay.value = false;
    Notify.create({ type: 'positive', message: 'Payment recorded successfully' });
    await loadPayment();
    emit('paid');
  } catch (e: any) {
    Notify.create({ type: 'negative', message: 'Failed to record payment' });
  } finally { paying.value = false; }
};

const voidSale = async () => {
  if (!voidReason.value || !voidPassword.value) { Notify.create({ type: 'warning', message: 'Reason and password required' }); return; }
  voiding.value = true;
  const reason = voidReason.value === 'Other' ? (voidReasonOther.value || 'Other') : voidReason.value;
  try {
    const res = await fetch(`${API_URL}/api/sales/${props.sale._id}/void`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword: voidPassword.value, reason })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
    showVoid.value = false;
    Notify.create({ type: 'positive', message: 'Sale voided — stock restored' });
    emit('voided'); emit('close');
  } catch (e: any) { Notify.create({ type: 'negative', message: e.message }); }
  finally { voiding.value = false; }
};

const loadPayment = async () => {
  if (!props.sale?._id) return;
  try {
    const res = await fetch(`${API_URL}/api/payments?saleId=${props.sale._id}`, { headers: { 'Authorization': `Bearer ${token()}` } });
    if (res.ok) {
      const payments = await res.json();
      const list = Array.isArray(payments) ? payments : payments ? [payments] : [];
      allPayments.value = list;
      paymentData.value = list.length > 0 ? list[list.length - 1] : null;
      // Check for bounced checks linked to these payments
      const paymentIds = list.map((p: any) => p._id).filter(Boolean);
      if (paymentIds.length > 0) {
        try {
          const checkRes = await fetch(`${API_URL}/api/check-approvals?status=BOUNCED`, { headers: { 'Authorization': `Bearer ${token()}` } });
          if (checkRes.ok) {
            const allChecks = await checkRes.json();
            bouncedChecks.value = allChecks.filter((c: any) => paymentIds.includes(c.paymentId));
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* no payment */ }
};

onMounted(() => loadPayment());

const removePayment = async (pmt: any) => {
  $q.dialog({
    title: 'Remove Payment',
    message: `Remove payment of ${fmt(pmt.totalPaid)} dated ${fmtD(pmt.paymentDate)}? This will revert the sale to UNPAID.`,
    prompt: {
      model: '',
      type: 'password',
      label: 'Admin Password',
      isValid: (val: string) => val.length > 0
    },
    cancel: true,
    persistent: true
  }).onOk(async (adminPassword: string) => {
    try {
      const res = await fetch(`${API_URL}/api/payments/${pmt._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove payment');
      }
      Notify.create({ type: 'positive', message: 'Payment removed successfully' });
      await loadPayment();
    } catch (e: any) {
      Notify.create({ type: 'negative', message: e.message });
    }
  });
};
</script>

<style scoped>
.sales-receipt { max-width: 720px; margin: 0 auto; }
.sales-receipt-card { min-width: min(520px, 95vw); width: 95vw; max-width: 720px; border: 1px solid rgba(0,0,0,0.16); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
@media print { .no-print { display: none !important; } .sales-receipt { max-width: 100%; } }
</style>

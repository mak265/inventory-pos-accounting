<template>
  <div class="pos-fullscreen">
    <q-card class="pos-card">
      <q-card-section class="q-py-sm">
        <div class="row items-center justify-between">
          <div class="text-h5">Point of Sale</div>
          <div class="row items-center q-gutter-xs">
            <q-chip v-if="form.drNumber" color="primary" text-color="white" dense icon="receipt">{{ form.drNumber }}</q-chip>
            <q-btn flat round dense :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'" @click="toggleFullscreen">
              <q-tooltip>{{ isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen (F11)' }}</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="close" @click="exitPOS" />
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <!-- Customer Selection -->
      <q-card-section>
        <div class="row q-col-gutter-md">
          <!-- Row 1: Customer + Address -->
          <div class="col-12 col-md-4">
            <div class="row q-gutter-xs">
              <div class="col">
                <q-select
                  ref="customerSelectRef"
                  autofocus
                  v-model="selectedCustomer"
                  :options="customerOptions"
                  option-label="name"
                  option-value="_id"
                  label="Customer"
                  outlined
                  dense
                  use-input
                  fill-input
                  hide-selected
                  clearable
                  input-debounce="0"
                  @filter="filterCustomers"
                  @update:model-value="onCustomerSelectedAndMove"
                  @keydown.enter.prevent="selectFirstCustomer"
                  hint=""
                >
                  <template v-slot:no-option>
                    <q-item><q-item-section class="text-grey">No customers found</q-item-section></q-item>
                  </template>
                </q-select>
              </div>
              <div class="col-auto" style="padding-top: 4px">
                <q-btn dense icon="person_add" color="primary" @click="showNewCustomerDialog = true">
                  <q-tooltip>New Customer</q-tooltip>
                </q-btn>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-8">
            <q-input
              v-model="form.address"
              label="Delivery Address (optional)"
              outlined
              dense
              clearable
              hint=""
              @keydown.enter.prevent="productSearchRef?.focus()"
            >
              <template v-slot:prepend><q-icon name="place" size="xs" /></template>
            </q-input>
          </div>
          <!-- Row 2: Type + Number + Date -->
          <div class="col-12 col-md-2">
            <q-select
              v-model="form.documentType"
              :options="[{label:'DR',value:'DR'},{label:'SI',value:'SI'},{label:'PU',value:'PU'},{label:'DL',value:'DL'},{label:'POS',value:'POS'}]"
              label="Type"
              outlined
              dense
              emit-value
              map-options
              @update:model-value="() => { fetchNextDRNumber(); customerSelectRef?.focus && customerSelectRef?.focus(); }"
            />
          </div>
          <div class="col-12 col-md-3">
            <q-input
              ref="drNumberInputRef"
              v-model="form.drNumber"
              :label="form.documentType + ' Number'"
              outlined
              dense
              @keydown.enter.prevent="productSearchRef?.focus()"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-input
              v-model="form.saleDate"
              label="Sale Date *"
              type="date"
              outlined
              dense
              :rules="[val => !!val || 'Sale date is required']"
            />
          </div>
        </div>

      </q-card-section>

      <q-separator />

      <!-- Product Entry Row (like old POS) -->
      <q-card-section class="q-py-sm">
        <div class="text-caption text-grey-7 q-mb-xs">Add Item — type code/name, Tab to qty, Enter to add</div>
        <div class="row q-col-gutter-xs items-end">
          <div class="col-5" style="position:relative">
            <q-input
              ref="productSearchRef"
              v-model="entrySearch"
              label="Description / Code"
              outlined
              dense
              @keydown.enter="onEntryEnter"
              @update:model-value="onEntrySearchChange"
            >
              <template v-slot:prepend><q-icon name="search" size="xs" /></template>
            </q-input>
            <!-- Suggestion list (absolute, doesn't push content) -->
            <div v-if="entrySuggestions.length > 0 && entrySearch.length > 0" class="entry-suggestions">
              <div
                v-for="(s, i) in entrySuggestions"
                :key="s._id"
                class="entry-suggestion-item"
                :class="{ 'entry-suggestion-active': i === entryHighlight }"
                @mousedown.prevent="pickSuggestion(s)"
              >
                <span class="text-weight-medium">{{ s.code }}</span> — {{ s.description }}
                <span class="text-blue-8 q-ml-sm">P{{ s.sellingPrice?.toFixed(2) }}</span>
                <span class="text-grey-6 q-ml-xs">{{ s.uom }}</span>
                <span :class="(s.availableStock || 0) <= (s.minStock || 0) && s.minStock > 0 ? 'text-red text-weight-bold' : 'text-green-8'" class="q-ml-xs">Stk:{{ s.availableStock || 0 }}</span>
              </div>
            </div>
          </div>
          <div class="col-1">
            <q-input v-model.number="entryQty" label="Qty" type="number" outlined dense step="0.01" ref="entryQtyRef" @keydown.enter="addEntryToCart" />
          </div>
          <div class="col-1">
            <q-select
              v-if="entryUomOptions.length > 1"
              v-model="entrySelectedUom"
              :options="entryUomOptions"
              option-label="label"
              option-value="value"
              emit-value
              map-options
              label="UOM"
              outlined
              dense
              @update:model-value="onEntryUomChange"
            />
            <q-input v-else :model-value="entryProduct?.uom || ''" label="UOM" outlined dense readonly tabindex="-1" bg-color="grey-2" />
          </div>
          <div class="col-auto" v-if="entryProduct" style="min-width:60px">
            <q-badge :color="(entryProduct?.availableStock || 0) <= 0 ? 'negative' : (entryProduct?.availableStock || 0) <= (entryProduct?.minStock || 0) ? 'warning' : 'positive'" class="q-pa-xs" style="font-size:13px">
              Stk: {{ entryProduct?.availableStock || 0 }}
            </q-badge>
          </div>
          <div class="col-2">
            <q-input v-model.number="entryPrice" label="Price" type="number" outlined dense prefix="P" min="0" step="0.01" ref="entryPriceRef" @keydown.enter="addEntryToCart" />
          </div>
          <div class="col-1">
            <q-input v-model.number="entryDiscount" label="Disc" type="number" outlined dense prefix="P" min="0" step="0.01" @keydown.enter="addEntryToCart" />
          </div>
          <div class="col-1">
            <q-input :model-value="entryTotal" label="Total" outlined dense readonly prefix="P" tabindex="-1" bg-color="grey-2" />
          </div>
          <div class="col-1">
            <q-btn color="primary" icon="add" dense unelevated class="full-width" style="height:40px" @click="addEntryToCart" :disable="!entryProduct">
              <q-tooltip>Add to cart (Enter)</q-tooltip>
            </q-btn>
          </div>
        </div>
      </q-card-section>

      <!-- Cart Items -->
      <q-card-section class="q-py-xs">
        <q-table
          :rows="salesStore.cart"
          :columns="columns"
          row-key="_lineKey"
          flat
          bordered
          :rows-per-page-options="[0]"
        >
          <template v-slot:body-cell-no="props">
            <q-td :props="props">{{ props.rowIndex + 1 }}</q-td>
          </template>

          <template v-slot:body-cell-code="props">
            <q-td :props="props">{{ props.row.code || props.row.productId?.code || '' }}</q-td>
          </template>

          <template v-slot:body-cell-sellingUom="props">
            <q-td :props="props">
              <q-select
                v-if="props.row.sellingUoms && props.row.sellingUoms.length > 0"
                v-model="props.row.selectedSellingUom"
                :options="getSellingUomOptions(props.row)"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                dense
                outlined
                style="width: 120px"
                @update:model-value="updateLineItem(props.rowIndex)"
              />
              <span v-else>{{ props.row.uom || '-' }}</span>
            </q-td>
          </template>

          <template v-slot:body-cell-quantity="props">
            <q-td :props="props">
              <q-input
                v-model.number="props.row.quantity"
                type="number"
                dense
                outlined
                min="0.01"
                step="0.01"
                @update:model-value="updateLineItem(props.rowIndex)"
                style="width: 100px"
              />
            </q-td>
          </template>

          <template v-slot:body-cell-sellingPrice="props">
            <q-td :props="props">
              <q-input
                v-model.number="props.row.sellingPrice"
                type="number"
                dense
                outlined
                min="0"
                step="0.01"
                prefix="P"
                @update:model-value="updateLineItem(props.rowIndex)"
                style="width: 120px"
              />
            </q-td>
          </template>

          <template v-slot:body-cell-subTotal="props">
            <q-td :props="props">
              P{{ ((props.row.quantity || 0) * (props.row.sellingPrice || 0)).toFixed(2) }}
            </q-td>
          </template>

          <template v-slot:body-cell-discount="props">
            <q-td :props="props">
              <q-input
                v-model.number="props.row.discount"
                type="number"
                dense
                outlined
                min="0"
                step="0.01"
                prefix="P"
                @update:model-value="updateLineItem(props.rowIndex)"
                style="width: 100px"
              />
            </q-td>
          </template>

          <template v-slot:body-cell-lineTotal="props">
            <q-td :props="props">
              P{{ props.row.lineTotal.toFixed(2) }}
            </q-td>
          </template>

          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                flat
                round
                dense
                icon="delete"
                color="negative"
                @click="salesStore.removeFromCart(props.rowIndex)"
              />
            </q-td>
          </template>

          <template v-slot:bottom-row>
            <q-tr>
              <q-td colspan="8" class="text-right text-bold">
                Total:
              </q-td>
              <q-td class="text-bold">
                P{{ salesStore.cartTotal.toFixed(2) }}
              </q-td>
              <q-td></q-td>
            </q-tr>
          </template>
        </q-table>

        <!-- Delivery & Toll Fee (optional) -->
        <div class="row q-col-gutter-sm q-mt-xs items-center">
          <div class="col-auto"><q-input v-model.number="form.deliveryFee" label="Delivery Fee" type="number" outlined dense prefix="P" style="width:130px" min="0" step="0.01" /></div>
          <div class="col-auto"><q-input v-model.number="form.tollFee" label="Toll Fee" type="number" outlined dense prefix="P" style="width:130px" min="0" step="0.01" /></div>
          <div class="col text-right text-h6 text-positive">Grand Total: P{{ grandTotal.toFixed(2) }}</div>
        </div>
      </q-card-section>

      <q-separator />

      <!-- Actions -->
      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Clear"
          color="negative"
          @click="clearTransaction"
          :disable="salesStore.cart.length === 0"
        />
        <q-btn
          flat
          label="Save Draft"
          color="primary"
          @click="saveDraft"
          :loading="saving"
          :disable="!canSave"
        />
        <q-btn
          unelevated
          label="Post Sale (Unpaid)"
          icon="receipt_long"
          color="orange"
          @click="postSaleUnpaid"
          :loading="saving"
          :disable="!canSave"
        />
        <q-btn
          unelevated
          label="Proceed to Payment"
          icon="payment"
          color="positive"
          @click="openPaymentDialog"
          :disable="!canSave"
        />
        <q-btn
          flat
          label="Print Receipt"
          icon="print"
          color="grey-8"
          @click="printReceipt"
          :disable="salesStore.cart.length === 0"
        />
      </q-card-actions>
    </q-card>

    <!-- New Customer Dialog -->
    <q-dialog v-model="showNewCustomerDialog" persistent>
      <q-card style="min-width: 400px">
        <q-card-section><div class="text-h6">New Customer</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="newCust.name" label="Customer Name *" outlined dense :rules="[v => !!v || 'Required']" />
          <q-input v-model="newCust.officeAddress" label="Office Address" outlined dense />
          <q-input v-model="newCust.deliveryAddress" label="Delivery Address" outlined dense />
          <q-input v-model="newCust.tin" label="TIN" outlined dense />
          <q-input v-model="newCust.phone" label="Phone" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showNewCustomerDialog = false" />
          <q-btn label="Save & Select" color="primary" @click="saveNewCustomer" :loading="savingCustomer" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Payment Dialog — Split Bills -->
    <q-dialog v-model="showPaymentDialog" persistent>
      <q-card style="min-width: 420px; max-width: 760px; width: 100%;">
        <q-card-section class="row items-center">
          <div class="text-h6">Payment</div>
          <q-space />
          <div class="text-h5 text-weight-bold text-positive">{{ formatPeso(grandTotal) }}</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showPaymentDialog = false" />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-2"><q-input v-model="payment.paymentDate" label="Payment Date" type="date" outlined dense /></div>
            <div class="col-12 col-md-2"><q-input :model-value="formatPeso(grandTotal)" label="Gross Total" outlined dense readonly bg-color="blue-1" /></div>
            <div class="col-12 col-md-2"><q-input v-model.number="payment.lessVat" label="Less VAT (Optional)" type="number" min="0" step="0.01" prefix="P" outlined dense /></div>
            <div class="col-12 col-md-2"><q-input :model-value="formatPeso(netAmountDue)" label="Amount Due" outlined dense readonly bg-color="amber-1" /></div>
            <div class="col-12 col-md-2"><q-input :model-value="formatPeso(splitTotalPaid)" label="Total Paid" outlined dense readonly bg-color="green-1" /></div>
            <div class="col-12 col-md-2"><q-input :model-value="formatPeso(splitBalance)" label="Balance" outlined dense readonly :bg-color="splitBalance > 0 ? 'red-1' : 'green-1'" /></div>
          </div>

          <!-- Cash -->
          <div class="row q-col-gutter-md items-center q-mb-sm">
            <div class="col-auto"><q-checkbox v-model="split.cashEnabled" label="Cash" /></div>
            <div class="col-4" v-if="split.cashEnabled"><q-input ref="cashAmountRef" v-model.number="split.cashAmount" label="Cash Amount" type="number" outlined dense prefix="P" @keydown.enter.prevent="handleCashEnter" /></div>
            <div class="col-4" v-if="split.cashEnabled"><q-input :model-value="formatPeso(Math.max(0, (split.cashAmount || 0) - netAmountDue))" label="Change" outlined dense readonly bg-color="green-1" /></div>
          </div>

          <!-- Check/Bank -->
          <div class="row q-col-gutter-md items-center q-mb-sm">
            <div class="col-auto"><q-checkbox v-model="split.checkEnabled" label="Check/Bank" /></div>
            <div class="col-3" v-if="split.checkEnabled"><q-input ref="checkAmountRef" v-model.number="split.checkAmount" label="Amount" type="number" outlined dense prefix="P" @keydown.enter.prevent="handleCheckEnter" /></div>
            <div class="col-3" v-if="split.checkEnabled"><q-select v-model="split.checkBank" :options="['BPI','AUB','BDO','Metrobank','Landbank','PNB','Other']" label="Bank" outlined dense /></div>
            <div class="col-3" v-if="split.checkEnabled"><q-input v-model="split.checkNumber" label="Effective Date" type="date" outlined dense /></div>
            <div class="col-3" v-if="split.checkEnabled"><q-input v-model="split.checkAccountName" label="Account Number" outlined dense /></div>
          </div>

          <!-- Online (GCash, etc) -->
          <div class="row q-col-gutter-md items-center q-mb-sm">
            <div class="col-auto"><q-checkbox v-model="split.onlineEnabled" label="Online" /></div>
            <div class="col-3" v-if="split.onlineEnabled"><q-input ref="onlineAmountRef" v-model.number="split.onlineAmount" label="Amount" type="number" outlined dense prefix="P" @keydown.enter.prevent="handleOnlineEnter" /></div>
            <div class="col-3" v-if="split.onlineEnabled"><q-select v-model="split.onlineChannel" :options="['GCash','BPI Online','AUB Online','Maya','Other']" label="Channel" outlined dense /></div>
            <div class="col-3" v-if="split.onlineEnabled && split.onlineChannel === 'GCash'"><q-select v-model="split.onlineGcashAccount" :options="['Katrina','Louie','Anicia']" label="GCash Account *" outlined dense clearable /></div>
            <div class="col-3" v-if="split.onlineEnabled"><q-input v-model="split.onlineRefNo" label="Reference Number" outlined dense /></div>
          </div>

          <q-banner v-if="splitBalance > 0" class="bg-orange-1 q-mt-sm" rounded>
            <template v-slot:avatar><q-icon name="info" color="orange" /></template>
            Remaining {{ formatPeso(splitBalance) }} will be added as customer balance (receivable)
          </q-banner>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" @click="showPaymentDialog = false" />
          <q-btn ref="completeButtonRef" unelevated label="Complete Sale" color="positive" icon="check" @click="completeSaleWithPayment" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useSalesStore } from '../stores/salesStore';
import { useCustomerStore } from '../stores/customerStore';
import { useProductStore } from '../stores/productStore';
import { Notify } from 'quasar';

const router = useRouter();
const salesStore = useSalesStore();
const customerStore = useCustomerStore();
const productStore = useProductStore();

const exitPOS = () => {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().then(() => router.push('/sales')).catch(() => router.push('/sales'));
  } else {
    router.push('/sales');
  }
};

const printReceipt = () => {
  const cart = salesStore.cart;
  if (cart.length === 0) return;
  const customer = selectedCustomer.value?.name || 'Walk-in Customer';
  const drNum = form.value.drNumber || 'N/A';
  const date = form.value.saleDate || new Date().toISOString().split('T')[0];
  const total = salesStore.cartTotal;
  const address = form.value.address || '';

  let rows = '';
  cart.forEach((item: any, idx: number) => {
    const sub = ((item.quantity || 0) * (item.sellingPrice || 0)).toFixed(2);
    const disc = (item.discount || 0).toFixed(2);
    const lt = (item.lineTotal || 0).toFixed(2);
    rows += `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td style="text-align:center">${item.quantity || 0}</td>
      <td>${item.code || ''}</td>
      <td>${item.description || ''}</td>
      <td style="text-align:center">${item.uom || ''}</td>
      <td style="text-align:right">${(item.sellingPrice || 0).toFixed(2)}</td>
      <td style="text-align:right">${sub}</td>
      <td style="text-align:right">${disc}</td>
      <td style="text-align:right">${lt}</td>
    </tr>`;
  });

  const html = `<!DOCTYPE html><html><head><title>Receipt ${drNum}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;font-size:11px}
    th{background:#f0f0f0;font-weight:bold}.header{text-align:center;margin-bottom:10px}
    .total-row{font-weight:bold;font-size:14px}@media print{body{margin:0}}</style>
    </head><body>
    <div class="header"><h2 style="margin:0">Aberin Hardware</h2><p style="margin:2px 0">Sales Receipt</p></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <div><b>Customer:</b> ${customer}${address ? `<br><b>Address:</b> ${address}` : ''}</div>
      <div><b>DR#:</b> ${drNum}</div>
      <div><b>Date:</b> ${date}</div>
    </div>
    <table><thead><tr><th>No.</th><th>Qty</th><th>Code</th><th>Description</th><th>UOM</th><th>Unit Cost</th><th>Sub Total</th><th>Disc</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="8" style="text-align:right">TOTAL AMOUNT:</td><td style="text-align:right">P${total.toFixed(2)}</td></tr></tfoot>
    </table>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

// Fullscreen on document.documentElement — address bar disappears, Quasar portals still work
const isFullscreen = ref(false);

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
};

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

const POS_DRAFT_KEY = 'pos-draft-sale';

const walkInCustomer = { _id: 'walk-in', name: '', officeAddress: '', deliveryAddress: '', tin: '', balance: 0 };

const form = ref({
  drNumber: '',
  documentType: 'DR' as 'DR' | 'SI' | 'PU' | 'DL' | 'POS',
  saleDate: new Date().toISOString().split('T')[0],
  deliveryFee: 0,
  tollFee: 0,
  customerName: '',
  customerId: null as string | null,
  notes: '',
  address: ''
});

const isEditing = ref(false);
const editingId = ref<string | null>(null);
const editingAdminPassword = ref('');

const grandTotal = computed(() => salesStore.cartTotal + (form.value.deliveryFee || 0) + (form.value.tollFee || 0));

const selectedCustomer = ref<any>(walkInCustomer);
const customerOptions = ref<any[]>([]);
const customerSearchText = ref('');
const customerSelectRef = ref<any>(null);
const drNumberInputRef = ref<any>(null);

const filteredCustomerOptions = computed(() => {
  const needle = customerSearchText.value.toLowerCase();
  if (!needle) return customerOptions.value;
  return customerOptions.value.filter(c => c.name.toLowerCase().includes(needle));
});
const productSearchRef = ref<any>(null);
const entryQtyRef = ref<any>(null);
const entryPriceRef = ref<any>(null);
const entrySearch = ref('');
const entryQty = ref<number>(0);
const entryPrice = ref<number>(0);
const entryDiscount = ref<number>(0);
const entryProduct = ref<any>(null);
const entrySuggestions = ref<any[]>([]);
const entryHighlight = ref(0);
const entrySelectedUom = ref<string | null>(null);
const allProducts = ref<any[]>([]);

// UOM options for the entry row
const entryUomOptions = computed(() => {
  if (!entryProduct.value) return [];
  const opts: Array<{ label: string; value: string | null }> = [
    { label: entryProduct.value.uom || 'Base', value: null }
  ];
  if (entryProduct.value.sellingUoms) {
    for (const su of entryProduct.value.sellingUoms) {
      opts.push({
        label: su.uomAbbreviation || su.uomName || 'UOM',
        value: su.uomId
      });
    }
  }
  return opts;
});

// When UOM changes in entry row, update price
const onEntryUomChange = (uomId: string | null) => {
  if (!entryProduct.value) return;
  if (uomId && entryProduct.value.sellingUoms) {
    const su = entryProduct.value.sellingUoms.find((s: any) => s.uomId === uomId);
    if (su && su.sellingPrice > 0) {
      entryPrice.value = su.sellingPrice;
      return;
    }
  }
  // Back to base price
  entryPrice.value = entryProduct.value.sellingPrice || 0;
};
const showNewCustomerDialog = ref(false);
const showPaymentDialog = ref(false);
const savingCustomer = ref(false);
const newCust = ref({ name: '', officeAddress: '', deliveryAddress: '', tin: '', phone: '' });
const payment = ref({
  paymentDate: new Date().toISOString().split('T')[0],
  lessVat: 0,
  refNo: '',
  method: 'CASH' as 'CASH' | 'CHARGE' | 'ONLINE',
  cashAmount: 0,
  chargeAmount: 0,
  channel: null as string | null,
  channelRefNo: '',
  accountName: '',
  effectiveDate: '',
  onlineChannel: null as string | null,
  onlineRefNo: '',
  onlineAmount: 0,
  onlineDate: ''
});

const split = ref({
  cashEnabled: false, cashAmount: 0,
  checkEnabled: false, checkAmount: 0, checkBank: '', checkNumber: '', checkAccountName: '',
  onlineEnabled: false, onlineAmount: 0, onlineChannel: '', onlineRefNo: '', onlineGcashAccount: ''
});

const cashAmountRef = ref<any>(null);
const checkAmountRef = ref<any>(null);
const onlineAmountRef = ref<any>(null);
const completeButtonRef = ref<any>(null);

watch(() => split.value.cashEnabled, (enabled) => {
  if (enabled && !(split.value.cashAmount > 0)) {
    split.value.cashAmount = splitBalance.value;
    setTimeout(() => cashAmountRef.value?.focus?.(), 120);
  }
  if (!enabled) {
    split.value.cashAmount = 0;
  }
});

watch(() => split.value.checkEnabled, (enabled) => {
  if (enabled && !(split.value.checkAmount > 0)) {
    split.value.checkAmount = splitBalance.value;
    setTimeout(() => checkAmountRef.value?.focus?.(), 120);
  }
  if (!enabled) {
    split.value.checkAmount = 0;
  }
});

watch(() => split.value.onlineEnabled, (enabled) => {
  if (enabled && !(split.value.onlineAmount > 0)) {
    split.value.onlineAmount = splitBalance.value;
    setTimeout(() => onlineAmountRef.value?.focus?.(), 120);
  }
  if (!enabled) {
    split.value.onlineAmount = 0;
  }
});

const focusCheckAmount = () => {
  if (split.value.checkEnabled && checkAmountRef.value) {
    checkAmountRef.value.focus();
  } else if (split.value.onlineEnabled && onlineAmountRef.value) {
    onlineAmountRef.value.focus();
  } else if (completeButtonRef.value) {
    completeButtonRef.value.focus?.();
  }
};

const focusOnlineAmount = () => {
  if (split.value.onlineEnabled && onlineAmountRef.value) {
    onlineAmountRef.value.focus();
  } else if (completeButtonRef.value) {
    completeButtonRef.value.focus?.();
  }
};

const focusCompleteButton = () => {
  completeButtonRef.value?.focus?.();
};

const handleCashEnter = () => {
  if (split.value.checkEnabled) {
    focusCheckAmount();
  } else if (split.value.onlineEnabled) {
    focusOnlineAmount();
  } else {
    completeSaleWithPayment();
  }
};

const handleCheckEnter = () => {
  if (split.value.onlineEnabled) {
    focusOnlineAmount();
  } else {
    completeSaleWithPayment();
  }
};

const handleOnlineEnter = () => {
  completeSaleWithPayment();
};

const openPaymentDialog = () => {
  split.value.cashEnabled = false;
  split.value.cashAmount = 0;
  split.value.checkEnabled = false;
  split.value.checkAmount = 0;
  split.value.checkBank = '';
  split.value.checkNumber = '';
  split.value.checkAccountName = '';
  split.value.onlineEnabled = false;
  split.value.onlineAmount = 0;
  split.value.onlineChannel = '';
  split.value.onlineRefNo = '';
  split.value.onlineGcashAccount = '';
  payment.value.paymentDate = new Date().toISOString().split('T')[0];
  payment.value.lessVat = 0;
  showPaymentDialog.value = true;
};

const normalizedLessVat = computed(() => {
  const value = Number(payment.value.lessVat || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, grandTotal.value);
});

const netAmountDue = computed(() => {
  return Math.max(0, grandTotal.value - normalizedLessVat.value);
});

const splitTotalPaid = computed(() => {
  let total = 0;
  if (split.value.cashEnabled) total += split.value.cashAmount || 0;
  if (split.value.checkEnabled) total += split.value.checkAmount || 0;
  if (split.value.onlineEnabled) total += split.value.onlineAmount || 0;
  return total;
});

const splitBalance = computed(() => Math.max(0, netAmountDue.value - splitTotalPaid.value));

const unpaidBalance = computed(() => splitBalance.value);

const formatPeso = (v: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v || 0);
const entryTotal = computed(() => (((entryQty.value || 0) * (entryPrice.value || 0)) - (entryDiscount.value || 0)).toFixed(2));
const saving = ref(false);

const columns = [
  { name: 'no', label: 'No.', field: '', align: 'center' as const },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'center' as const },
  { name: 'code', label: 'Code', field: 'code', align: 'left' as const },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
  { name: 'sellingUom', label: 'UOM', field: 'sellingUom', align: 'center' as const },
  { name: 'sellingPrice', label: 'Unit Cost', field: 'sellingPrice', align: 'right' as const },
  { name: 'subTotal', label: 'Sub Total', field: '', align: 'right' as const },
  { name: 'discount', label: 'Disc', field: 'discount', align: 'right' as const },
  { name: 'lineTotal', label: 'Total Amount', field: 'lineTotal', align: 'right' as const },
  { name: 'actions', label: '', field: 'actions', align: 'center' as const }
];

const canSave = computed(() => {
  return selectedCustomer.value &&
         form.value.saleDate &&
         salesStore.cart.length > 0;
});

const filterCustomers = (val: string, update: Function) => {
  update(() => {
    const all = [...customerStore.customers];
    if (val === '') {
      customerOptions.value = all;
    } else {
      const needle = val.toLowerCase();
      customerOptions.value = all.filter(c => c.name.toLowerCase().includes(needle));
    }
  });
};

const onCustomerSearch = (val: string) => {
  customerSearchText.value = val;
};

const onCustomerSelected = (customer: any) => {
  salesStore.setCurrentCustomer(customer);
};

const onCustomerSelectedAndMove = (customer: any) => {
  salesStore.setCurrentCustomer(customer);
  customerSearchText.value = '';
  // Pre-fill address from customer's delivery address (still editable)
  if (customer && customer._id !== 'walk-in') {
    form.value.address = customer.deliveryAddress || customer.officeAddress || '';
  } else {
    form.value.address = '';
  }
  setTimeout(() => drNumberInputRef.value?.focus(), 100);
};

const selectFirstCustomer = () => {
  if (customerOptions.value.length > 0) {
    const first = customerOptions.value[0];
    selectedCustomer.value = first;
    salesStore.setCurrentCustomer(first);
    customerSelectRef.value?.updateInputValue(first.name, true);
    customerSelectRef.value?.hidePopup();
    customerSelectRef.value?.blur();
    customerSearchText.value = '';
    if (first && first._id !== 'walk-in') {
      form.value.address = first.deliveryAddress || first.officeAddress || '';
    } else {
      form.value.address = '';
    }
    setTimeout(() => drNumberInputRef.value?.focus(), 150);
  }
};

const saveNewCustomer = async () => {
  if (!newCust.value.name) { Notify.create({ type: 'warning', message: 'Customer name is required' }); return; }
  savingCustomer.value = true;
  try {
    const created = await customerStore.createCustomer(newCust.value);
    await customerStore.fetchCustomers();
    customerOptions.value = [walkInCustomer, ...customerStore.customers];
    selectedCustomer.value = created;
    salesStore.setCurrentCustomer(created);
    showNewCustomerDialog.value = false;
    newCust.value = { name: '', officeAddress: '', deliveryAddress: '', tin: '', phone: '' };
    Notify.create({ type: 'positive', message: 'Customer saved and selected' });
  } catch (e: any) {
    Notify.create({ type: 'negative', message: e?.message || 'Failed to save customer' });
  } finally {
    savingCustomer.value = false;
  }
};

// Entry-based product search (like old POS)
const onEntrySearchChange = async (val: any) => {
  const v = String(val || '');
  entryProduct.value = null;
  entryHighlight.value = 0;
  if (!v || v.length < 1) {
    entrySuggestions.value = [];
    return;
  }
  const needle = v.toLowerCase();
  // Search from preloaded products — rank by relevance
  let results = allProducts.value
    .filter((p: any) => p.code?.toLowerCase().includes(needle) || p.description?.toLowerCase().includes(needle))
    .sort((a: any, b: any) => {
      const aCode = (a.code || '').toLowerCase();
      const bCode = (b.code || '').toLowerCase();
      const aDesc = (a.description || '').toLowerCase();
      const bDesc = (b.description || '').toLowerCase();
      // Priority: code starts with > code equals > code contains > description starts with > description contains
      const aCodeStarts = aCode.startsWith(needle) ? 0 : aCode.includes(needle) ? 1 : 2;
      const bCodeStarts = bCode.startsWith(needle) ? 0 : bCode.includes(needle) ? 1 : 2;
      if (aCodeStarts !== bCodeStarts) return aCodeStarts - bCodeStarts;
      const aDescStarts = aDesc.startsWith(needle) ? 0 : 1;
      const bDescStarts = bDesc.startsWith(needle) ? 0 : 1;
      if (aDescStarts !== bDescStarts) return aDescStarts - bDescStarts;
      return aCode.localeCompare(bCode);
    })
    .slice(0, 8);

  // If few local results, also search from server
  if (results.length < 3 && v.length >= 2) {
    try {
      await productStore.fetchProducts({ limit: 50, search: v });
      const serverResults = productStore.products
        .filter((p: any) => p.code?.toLowerCase().includes(needle) || p.description?.toLowerCase().includes(needle));
      // Merge, deduplicate by _id
      const existingIds = new Set(results.map((r: any) => r._id));
      for (const p of serverResults) {
        if (!existingIds.has(p._id)) {
          results.push(p);
          existingIds.add(p._id);
        }
      }
      results = results.slice(0, 10);
    } catch { /* silent */ }
  }

  entrySuggestions.value = results;
};

const pickSuggestion = (product: any) => {
  entryProduct.value = product;
  entrySearch.value = `${product.code} — ${product.description}`;
  entryPrice.value = product.sellingPrice || 0;
  entryQty.value = 0;
  entryDiscount.value = 0;
  entrySelectedUom.value = null;
  entrySuggestions.value = [];
  // Focus qty field
  setTimeout(() => entryQtyRef.value?.focus(), 50);
};

const onEntryEnter = () => {
  // If suggestions visible, pick the highlighted one
  if (entrySuggestions.value.length > 0) {
    pickSuggestion(entrySuggestions.value[entryHighlight.value] || entrySuggestions.value[0]);
    return;
  }
  // If product already selected, add to cart
  if (entryProduct.value) {
    addEntryToCart();
  }
};

const addEntryToCart = () => {
  if (!entryProduct.value || !entryQty.value || entryQty.value === 0) return;

  const product = entryProduct.value;
  const selectedUom = entrySelectedUom.value || null;

  // Always create a NEW line from entry row to prevent unintended merging
  salesStore.addToCart(product, entryQty.value);
  const lastItem = salesStore.cart[salesStore.cart.length - 1];
  if (lastItem) {
    lastItem.sellingUoms = product.sellingUoms || [];
    lastItem.uom = selectedUom
      ? ((product.sellingUoms || []).find((s: any) => s.uomId === selectedUom)?.uomAbbreviation || product.uom || '')
      : (product.uom || '');
    lastItem.code = product.code || '';
    lastItem.availableStock = product.availableStock || 0;
    lastItem.selectedSellingUom = selectedUom;
    lastItem.baseSellingPrice = product.sellingPrice || 0;
    lastItem.sellingPrice = entryPrice.value;
    lastItem.discount = entryDiscount.value || 0;
    lastItem.lineTotal = (entryQty.value * entryPrice.value) - (entryDiscount.value || 0);
  }

  // Reset entry fields
  entrySearch.value = '';
  entryQty.value = 0;
  entryPrice.value = 0;
  entryDiscount.value = 0;
  entryProduct.value = null;
  entrySelectedUom.value = null;
  entrySuggestions.value = [];
  // Focus back to search
  setTimeout(() => productSearchRef.value?.focus(), 50);
};

const getSellingUomOptions = (cartItem: any) => {
  const options: Array<{ label: string; value: string | null }> = [
    { label: cartItem.uom || 'Base', value: null }
  ];
  if (cartItem.sellingUoms) {
    for (const su of cartItem.sellingUoms) {
      options.push({
        label: su.uomAbbreviation || su.uomName || 'UOM',
        value: su.uomId
      });
    }
  }
  return options;
};

const updateLineItem = (index: number) => {
  const item = salesStore.cart[index];
  if (item) {
    // If a selling UOM is selected, use its price; otherwise use base price
    if (item.selectedSellingUom && item.sellingUoms) {
      const su = item.sellingUoms.find((s: any) => s.uomId === item.selectedSellingUom);
      if (su && su.sellingPrice > 0) {
        item.sellingPrice = su.sellingPrice;
      }
    } else if (item.baseSellingPrice) {
      // Switched back to base UOM — restore base price
      item.sellingPrice = item.baseSellingPrice;
    }
    salesStore.updateCartItem(index, item.quantity, item.sellingPrice, item.discount || 0);
  }
};

const clearDraftFromLocalStorage = () => {
  localStorage.removeItem(POS_DRAFT_KEY);
};

const saveDraftToLocalStorage = () => {
  try {
    const draft = {
      form: { ...form.value },
      selectedCustomer: {
        _id: selectedCustomer.value?._id || null,
        name: selectedCustomer.value?.name || ''
      },
      cart: salesStore.cart.map(item => ({ ...item })),
      entrySearch: entrySearch.value,
      entryQty: entryQty.value,
      entryPrice: entryPrice.value,
      entryDiscount: entryDiscount.value,
      entrySelectedUom: entrySelectedUom.value,
      entryProduct: entryProduct.value ? {
        _id: entryProduct.value._id,
        code: entryProduct.value.code,
        description: entryProduct.value.description,
        sellingPrice: entryProduct.value.sellingPrice,
        uom: entryProduct.value.uom,
        sellingUoms: entryProduct.value.sellingUoms || []
      } : null
    };
    localStorage.setItem(POS_DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    // ignore localStorage write errors
  }
};

const loadDraftFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(POS_DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);

    if (draft?.form) {
      Object.assign(form.value, {
        drNumber: draft.form.drNumber || '',
        documentType: draft.form.documentType || 'DR',
        saleDate: draft.form.saleDate || new Date().toISOString().split('T')[0],
        deliveryFee: draft.form.deliveryFee || 0,
        tollFee: draft.form.tollFee || 0,
        customerName: draft.form.customerName || '',
        customerId: draft.form.customerId || null,
        notes: draft.form.notes || '',
        address: draft.form.address || ''
      });
    }

    if (draft?.selectedCustomer) {
      const existingCustomer = customerStore.customers.find((c: any) => c._id === draft.selectedCustomer._id);
      selectedCustomer.value = existingCustomer || (draft.selectedCustomer._id === 'walk-in' ? walkInCustomer : {
        _id: draft.selectedCustomer._id || 'walk-in',
        name: draft.selectedCustomer.name || ''
      });
      salesStore.setCurrentCustomer(selectedCustomer.value);
    }

    if (Array.isArray(draft?.cart)) {
      salesStore.clearCart();
      for (const item of draft.cart) {
        salesStore.cart.push({
          _lineKey: item._lineKey || `${item.productId || 'item'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          productId: item.productId,
          description: item.description || '',
          quantity: item.quantity || 0,
          sellingPrice: item.sellingPrice || 0,
          discount: item.discount || 0,
          lineTotal: typeof item.lineTotal === 'number' ? item.lineTotal : ((item.quantity || 0) * (item.sellingPrice || 0) - (item.discount || 0)),
          availableStock: item.availableStock || 0,
          uom: item.uom || '',
          code: item.code || '',
          baseSellingPrice: item.baseSellingPrice || item.sellingPrice || 0,
          sellingUoms: item.sellingUoms || [],
          selectedSellingUom: item.selectedSellingUom || null
        });
      }
    }

    entrySearch.value = draft.entrySearch || '';
    entryQty.value = typeof draft.entryQty === 'number' ? draft.entryQty : 0;
    entryPrice.value = typeof draft.entryPrice === 'number' ? draft.entryPrice : 0;
    entryDiscount.value = typeof draft.entryDiscount === 'number' ? draft.entryDiscount : 0;
    entrySelectedUom.value = draft.entrySelectedUom || null;
    if (draft?.entryProduct) {
      entryProduct.value = { ...draft.entryProduct };
    }
  } catch (e) {
    // ignore invalid draft data
  }
};

const clearTransaction = () => {
  salesStore.clearCart();
  selectedCustomer.value = walkInCustomer;
  salesStore.setCurrentCustomer(walkInCustomer);
  form.value.drNumber = '';
  form.value.documentType = 'DR';
  form.value.saleDate = new Date().toISOString().split('T')[0];
  form.value.customerName = '';
  form.value.customerId = null;
  form.value.address = '';
  clearDraftFromLocalStorage();
};

// Fetch next DR number from backend
const fetchNextDRNumber = async () => {
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/sales/next-number?docType=${form.value.documentType}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      form.value.drNumber = data.nextNumber || '';
    } else {
      form.value.drNumber = '';
    }
  } catch {
    form.value.drNumber = '';
  }
};

// Reset POS for next sale — stay on POS, auto-generate next DR number
const resetForNextSale = async () => {
  clearDraftFromLocalStorage();
  salesStore.clearCart();
  selectedCustomer.value = walkInCustomer;
  salesStore.setCurrentCustomer(walkInCustomer);
  form.value.customerName = '';
  form.value.customerId = null;
  form.value.saleDate = new Date().toISOString().split('T')[0];
  // Fetch next DR number
  await fetchNextDRNumber();
  // Reset payment
  payment.value = {
    paymentDate: new Date().toISOString().split('T')[0],
    lessVat: 0,
    refNo: '',
    method: 'CASH',
    cashAmount: 0,
    chargeAmount: 0,
    channel: null,
    channelRefNo: '',
    accountName: '',
    effectiveDate: '',
    onlineChannel: null,
    onlineRefNo: '',
    onlineAmount: 0,
    onlineDate: ''
  };
  // Clear customer input and return focus to the customer field
  customerSearchText.value = '';
  customerSelectRef.value?.updateInputValue?.('', true);
  setTimeout(() => customerSelectRef.value?.focus(), 100);
  entrySearch.value = '';
  entryQty.value = 0;
  entryPrice.value = 0;
  entryDiscount.value = 0;
  entryProduct.value = null;
  entrySelectedUom.value = null;
  entrySuggestions.value = [];
};

const saveDraft = async () => {
  if (!canSave.value) return;
  saving.value = true;
  try {
    // If editing an existing sale, perform update/admin-edit
    if (isEditing.value && editingId.value) {
      // Build sale payload similar to createSaleFromCart
      const saleData: any = {
        drNumber: form.value.drNumber,
        documentType: form.value.documentType,
        saleDate: new Date(form.value.saleDate),
        customerName: form.value.customerName || selectedCustomer.value?.name || 'Walk-in Customer',
        deliveryFee: form.value.deliveryFee || 0,
        tollFee: form.value.tollFee || 0,
        notes: form.value.notes || '',
        deliveryAddress: form.value.address || '',
        lineItems: salesStore.cart.map((item: any) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          discount: item.discount || 0,
          lineTotal: item.lineTotal,
          conversionFactor: item.conversionFactor || 1
        })),
        totalAmount: salesStore.cartTotal + (form.value.deliveryFee || 0) + (form.value.tollFee || 0)
      };

      if (selectedCustomer.value && selectedCustomer.value._id && selectedCustomer.value._id !== 'walk-in') {
        saleData.customerId = selectedCustomer.value._id;
      }

      if (editingAdminPassword.value) {
        await salesStore.adminEditSale(editingId.value, saleData, editingAdminPassword.value);
      } else {
        await salesStore.updateSale(editingId.value, saleData);
      }

      Notify.create({ type: 'positive', message: 'Sale updated successfully' });
      // clear editing flags
      isEditing.value = false;
      editingId.value = null;
      editingAdminPassword.value = '';
      clearTransaction();
      router.push('/sales');
    } else {
      await salesStore.createSaleFromCart(form.value.drNumber, new Date(form.value.saleDate), form.value.documentType, { deliveryFee: form.value.deliveryFee || 0, tollFee: form.value.tollFee || 0, address: form.value.address || '' });
      Notify.create({ type: 'positive', message: 'Sale draft saved successfully' });
      clearTransaction();
      router.push('/sales');
    }
  } catch (error: any) {
    Notify.create({ type: 'negative', message: error.message || 'Failed to save sale' });
  } finally {
    saving.value = false;
  }
};

const postSaleUnpaid = async () => {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const sale = await salesStore.createSaleFromCart(form.value.drNumber || '', new Date(form.value.saleDate), form.value.documentType, { deliveryFee: form.value.deliveryFee || 0, tollFee: form.value.tollFee || 0, address: form.value.address || '' });
    await salesStore.postSale(sale._id);
    // No payment created — sale is posted but unpaid (receivable)
    Notify.create({ type: 'positive', message: 'Sale posted as UNPAID. Amount added to customer receivable.' });
    await resetForNextSale();
  } catch (error: any) {
    Notify.create({ type: 'negative', message: error.message || 'Failed to post sale' });
  } finally {
    saving.value = false;
  }
};

const printPOSReceipt = (w: Window, sale: any, payInfo: { cashPayment: number; totalPaid: number; saleTotal: number; lessVat: number; amountDue: number }) => {

  const items = (sale.lineItems || []).map((item: any) =>
    `<tr><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${(item.lineTotal || 0).toFixed(2)}</td></tr>`
  ).join('');
  const drNum = sale.drNumber || '';
  const date = new Date(sale.saleDate || new Date()).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
  const customer = sale.customerName || '';
  const address = sale.deliveryAddress || form.value.address || '';
  const total = payInfo.amountDue || sale.totalAmount || payInfo.saleTotal || 0;
  const lessVat = payInfo.lessVat || 0;
  const delFee = sale.deliveryFee || 0;
  const tolFee = sale.tollFee || 0;

  // Payment method summary
  let payLine = '';
  if (split.value.cashEnabled && split.value.cashAmount > 0) payLine += `Cash: P${split.value.cashAmount.toFixed(2)}  `;
  if (split.value.checkEnabled && split.value.checkAmount > 0) payLine += `Check: P${split.value.checkAmount.toFixed(2)}  `;
  if (split.value.onlineEnabled && split.value.onlineAmount > 0) payLine += `Online: P${split.value.onlineAmount.toFixed(2)}  `;
  const change = Math.max(0, payInfo.cashPayment - total);

  const html = `<!DOCTYPE html><html><head><title>Receipt</title>
<style>
  @page { margin: 0; size: 58mm auto; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 48mm; margin: 0 auto; padding: 2mm 1mm; color: #000; line-height: 1.3; font-weight: bold; }
  .center { text-align: center; }
  .right { text-align: right; }
  .line { border-top: 1px dashed #000; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; font-size: 10px; vertical-align: top; font-weight: bold; }
  .footer { font-size: 10px; color: #000; margin-top: 3px; text-align: center; font-weight: bold; }
  @media print { body { margin: 0; } }
</style></head><body>
  <div class="center" style="font-size:13px">SALES RECEIPT</div>
  <div class="line"></div>
  <div>POS#: ${drNum} | ${date}</div>
  ${customer && customer !== 'Walk-in Customer' ? `<div>${customer}</div>` : ''}
  ${address ? `<div style="font-size:9px">${address}</div>` : ''}
  ${payLine ? `<div>${payLine.trim()}</div>` : ''}
  <div class="line"></div>
  <table>
    <tr style="font-weight:bold"><td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Amt</td></tr>
    ${items}
  </table>
  <div class="line"></div>
  ${delFee > 0 ? `<div class="right">Del: P${delFee.toFixed(2)}</div>` : ''}
  ${tolFee > 0 ? `<div class="right">Toll: P${tolFee.toFixed(2)}</div>` : ''}
  ${lessVat > 0 ? `<div class="right">Less VAT: -P${lessVat.toFixed(2)}</div>` : ''}
  <div class="right" style="font-size:14px">TOTAL: P${total.toFixed(2)}</div>
  ${change > 0 ? `<div class="right">Change: P${change.toFixed(2)}</div>` : ''}
  <div class="line"></div>
  <div class="footer">Not valid as official receipt<br>for tax purposes.<br>Thank you!</div>
</body></html>`;

  w.document.write(html);
  w.document.close();
  // Use setTimeout instead of onload to avoid popup blocker issues
  setTimeout(() => { try { w.print(); } catch { /* silent */ } }, 500);
};

const completeSaleWithPayment = async () => {
  if (!canSave.value) return;
  saving.value = true;
  const saleTotal = netAmountDue.value; // Net payable after optional Less VAT

  // Open the print window NOW — synchronously while still inside the user-gesture
  // context. Any await before window.open() causes browsers to treat it as a
  // programmatic popup and block it.
  const isPOS = form.value.documentType === 'POS';
  const printWindow = isPOS ? window.open('', '_blank') : null;
  if (isPOS && !printWindow) {
    Notify.create({ type: 'warning', message: 'Popup blocked. Please allow popups for this site to auto-print receipts.' });
  }

  try {
    const sale = await salesStore.createSaleFromCart(
      form.value.drNumber || '',
      new Date(form.value.saleDate),
      form.value.documentType,
      { deliveryFee: form.value.deliveryFee || 0, tollFee: form.value.tollFee || 0, address: form.value.address || '' }
    );

    // Post the sale
    await salesStore.postSale(sale._id);

    // Create payment record if the user entered any payment amount
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const paymentChannels: any[] = [];
    let totalPaid = 0;

    // Build split payment data
    let cashPayment = 0;
    if (split.value.cashEnabled && split.value.cashAmount > 0) {
      cashPayment = Math.min(split.value.cashAmount, saleTotal);
      totalPaid += cashPayment;
    }
    if (split.value.checkEnabled && split.value.checkAmount > 0) {
      const amt = split.value.checkAmount;
      totalPaid += amt;
      paymentChannels.push({ channel: split.value.checkBank || 'OTHER', amount: amt, effectiveDate: split.value.checkNumber || undefined, accountName: split.value.checkAccountName });
    }
    if (split.value.onlineEnabled && split.value.onlineAmount > 0) {
      const amt = split.value.onlineAmount;
      totalPaid += amt;
      paymentChannels.push({ channel: split.value.onlineChannel || 'GCASH', amount: amt, referenceNumber: split.value.onlineRefNo, accountName: split.value.onlineGcashAccount || undefined });
    }

    totalPaid = Math.min(totalPaid, saleTotal);

    if (totalPaid > 0) {
      try {
        const payRes = await fetch(`${API_URL}/api/payments`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saleId: sale._id,
            customerId: selectedCustomer.value?._id !== 'walk-in' ? selectedCustomer.value?._id : undefined,
            paymentDate: payment.value.paymentDate,
            amountDue: saleTotal,
            totalPaid,
            cashPayment,
            paymentChannels
          })
        });
        if (!payRes.ok) {
          const err = await payRes.json().catch(() => ({}));
          console.error('Payment API error:', err);
          Notify.create({ type: 'warning', message: 'Sale posted but payment may not have saved. Check payment status.' });
        }
      } catch {
        // Network error — queue for sync
        const { useSyncStore } = await import('../stores/syncStore');
        const syncStore = useSyncStore();
        await syncStore.addToQueue({
          operation: 'CREATE', collection: 'payments',
          data: {
            saleId: sale._id,
            customerId: selectedCustomer.value?._id !== 'walk-in' ? selectedCustomer.value?._id : undefined,
            paymentDate: payment.value.paymentDate,
            amountDue: saleTotal,
            totalPaid,
            cashPayment,
            paymentChannels
          }
        });
        Notify.create({ type: 'warning', message: 'Payment queued for sync (offline).' });
      }
    } else {
      Notify.create({ type: 'info', message: 'Sale completed without payment. Record payment manually when ready.' });
    }

    showPaymentDialog.value = false;
    Notify.create({ type: 'positive', message: 'Sale completed successfully' });

    // Auto-print receipt for POS type — use the window we opened before the awaits
    if (isPOS && printWindow) {
      printPOSReceipt(printWindow, sale, {
        cashPayment,
        totalPaid,
        saleTotal,
        lessVat: normalizedLessVat.value,
        amountDue: saleTotal
      });
    }

    await resetForNextSale();
  } catch (error: any) {
    Notify.create({ type: 'negative', message: error.message || 'Failed to complete sale' });
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  // Fullscreen listener
  document.addEventListener('fullscreenchange', onFullscreenChange);
  // Auto-enter fullscreen (on document — portals still work)
  setTimeout(() => document.documentElement.requestFullscreen?.().catch(() => {}), 200);

  await customerStore.fetchCustomers();
  customerOptions.value = [...customerStore.customers];
  selectedCustomer.value = walkInCustomer;
  salesStore.setCurrentCustomer(walkInCustomer);

  // Focus customer field on open
  setTimeout(() => customerSelectRef.value?.focus(), 300);
  // Check if an edit was requested
  try {
    const editJson = localStorage.getItem('sales_edit');
    if (editJson) {
      const edit = JSON.parse(editJson || '{}');
      if (edit?.id) {
        // Ensure sale is loaded in store
        await salesStore.getSaleById(edit.id);
        const s = salesStore.currentSale;
        if (s) {
          isEditing.value = true;
          editingId.value = s._id;
          editingAdminPassword.value = edit.adminPassword || '';
          form.value.drNumber = s.drNumber || '';
          form.value.customerName = s.customerName || '';
          form.value.customerId = s.customerId?._id || s.customerId || null;
          form.value.saleDate = s.saleDate ? new Date(s.saleDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          form.value.documentType = s.documentType || 'DR';
          form.value.deliveryFee = s.deliveryFee || 0;
          form.value.tollFee = s.tollFee || 0;
          form.value.notes = s.notes || '';
          form.value.address = s.deliveryAddress || '';
          // Populate cart from sale line items
          salesStore.clearCart();
          for (const li of s.lineItems || []) {
            salesStore.addToCart({ _id: li.productId?._id || li.productId, description: li.description || '', sellingPrice: li.sellingPrice || 0, availableStock: 0, uom: li.uom || '' }, li.quantity || 0);
            // adjust last added item's price/discount/lineTotal
            const idx = salesStore.cart.length - 1;
            if (idx >= 0) {
              salesStore.cart[idx].sellingPrice = li.sellingPrice || 0;
              salesStore.cart[idx].discount = li.discount || 0;
              salesStore.cart[idx].lineTotal = li.lineTotal || ((li.quantity || 0) * (li.sellingPrice || 0) - (li.discount || 0));
            }
          }
        }
      }
      localStorage.removeItem('sales_edit');
    }
  } catch (e) {
    // ignore parse errors
  }
  form.value.documentType = 'DR';
  form.value.saleDate = new Date().toISOString().split('T')[0];
  salesStore.clearCart();

  // Preload products for search
  await productStore.fetchProducts({ limit: 10000 });
  allProducts.value = productStore.products.filter((p: any) => p.isActive !== false);

  // Fetch next DR number
  await fetchNextDRNumber();

  loadDraftFromLocalStorage();

  // sync draft state changes to localStorage
  watch(() => form.value, saveDraftToLocalStorage, { deep: true });
  watch(() => salesStore.cart, saveDraftToLocalStorage, { deep: true });
  watch(() => selectedCustomer.value, saveDraftToLocalStorage, { deep: true });
  watch([
    () => entrySearch.value,
    () => entryQty.value,
    () => entryPrice.value,
    () => entryDiscount.value,
    () => entrySelectedUom.value,
    () => entryProduct.value
  ], saveDraftToLocalStorage, { deep: true });

const onDocumentTypeChange = () => {
  fetchNextDRNumber();
  setTimeout(() => customerSelectRef.value?.focus(), 100);
};
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
});
</script>

<style scoped>
/* CSS fullscreen overlay */
.pos-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6000;
  background: #f0f2f5;
  overflow-y: auto;
  padding: 8px;
}
.pos-card {
  max-width: 1100px;
  margin: 0 auto;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}

/* ===== SUPER VISIBLE TAB/FOCUS HIGHLIGHT ===== */
:deep(.q-field--focused .q-field__control) {
  box-shadow: 0 0 0 3px #1976d2, 0 0 16px rgba(25, 118, 210, 0.4) !important;
  border-color: #1976d2 !important;
  background: #e3f2fd !important;
}
:deep(.q-field--focused .q-field__label) {
  color: #1976d2 !important;
  font-weight: 700 !important;
}
:deep(.q-btn:focus-visible) {
  box-shadow: 0 0 0 3px #1976d2 !important;
  outline: none;
}
/* Table row inputs — orange highlight */
:deep(.q-table .q-field--focused .q-field__control) {
  box-shadow: 0 0 0 3px #ff6f00, 0 0 12px rgba(255, 111, 0, 0.35) !important;
  border-color: #ff6f00 !important;
  background: #fff8e1 !important;
}

/* Suggestion dropdown (absolute positioned, doesn't push content) */
.entry-suggestions {
  position: absolute;
  z-index: 9999;
  background: #fff;
  border: 2px solid #1976d2;
  border-top: none;
  border-radius: 0 0 6px 6px;
  max-height: 180px;
  overflow-y: auto;
  width: 100%;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.entry-suggestion-item {
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid #f0f0f0;
}
.entry-suggestion-item:hover,
.entry-suggestion-active {
  background: #e3f2fd;
}
</style>

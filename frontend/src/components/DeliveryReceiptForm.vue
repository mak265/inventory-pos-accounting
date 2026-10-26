<template>
  <q-page padding>
    <div class="q-pa-md" style="max-width:1400px;margin:0 auto">
      <div class="row items-center q-mb-md">
        <div class="col"><h5 class="q-my-none">{{ isEdit ? 'Edit Delivery Receipt' : 'New Delivery Receipt' }}</h5></div>
        <div class="col-auto"><q-badge :color="form.status === 'POSTED' ? 'positive' : 'warning'" :label="form.status" /></div>
      </div>

      <!-- Header: Vendor, DR Number, Date, Terms -->
      <q-card flat bordered class="q-mb-sm">
        <q-card-section class="q-py-sm">
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-4">
              <div class="row q-gutter-xs items-end">
                <div class="col">
                  <q-select ref="vendorSelectRef" v-model="form.vendorId" :options="vendors" option-value="_id" option-label="name" label="Vendor *" outlined dense use-input fill-input hide-selected input-debounce="0" @filter="filterVendors" @update:model-value="onVendorSelectedAndMove" @keydown.enter.prevent="selectFirstVendor" />
                </div>
                <div class="col-auto"><q-btn dense icon="person_add" color="primary" @click="showNewVendor = true"><q-tooltip>New Vendor</q-tooltip></q-btn></div>
              </div>
            </div>
            <div class="col-6 col-md-2"><q-input ref="drNumberRef" v-model="form.drNumber" label="DR Number" outlined dense hint="Auto if blank" @keydown.enter.prevent="siNumberRef?.focus()" /></div>
            <div class="col-6 col-md-2"><q-input ref="siNumberRef" v-model="form.siNumber" label="SI Number (optional)" outlined dense @keydown.enter.prevent="dateRef?.focus()" /></div>
            <div class="col-6 col-md-2"><q-input ref="dateRef" v-model="form.deliveryDate" label="Date" type="date" outlined dense @keydown.enter.prevent="searchRef?.focus()" /></div>
          </div>
          <!-- Payment Split Bills -->
          <div class="row q-col-gutter-xs q-mt-xs items-center">
            <div class="col-auto"><q-checkbox v-model="form.payCash" label="Cash" dense /></div>
            <div class="col-auto" v-if="form.payCash"><q-input v-model.number="form.payCashAmt" label="P" type="number" outlined dense style="width:100px" prefix="P" /></div>
            <div class="col-auto"><q-checkbox v-model="form.payCheck" label="Check" dense /></div>
            <div class="col-auto" v-if="form.payCheck"><q-input v-model.number="form.payCheckAmt" label="P" type="number" outlined dense style="width:100px" prefix="P" /></div>
            <div class="col-auto" v-if="form.payCheck"><q-input v-model="form.payCheckRef" label="Effective Date" type="date" outlined dense style="width:130px" /></div>
            <div class="col-auto"><q-checkbox v-model="form.payOnline" label="Online" dense /></div>
            <div class="col-auto" v-if="form.payOnline"><q-input v-model.number="form.payOnlineAmt" label="P" type="number" outlined dense style="width:100px" prefix="P" /></div>
            <div class="col-auto" v-if="form.payOnline"><q-input v-model="form.payOnlineRef" label="Ref#" outlined dense style="width:100px" /></div>
          </div>
          <!-- Live balance row — always visible when any payment is entered -->
          <div v-if="form.payCash || form.payCheck || form.payOnline" class="row q-mt-xs items-center q-gutter-sm">
            <div class="col-auto text-caption text-grey-7">Total: P{{ grandTotal.toFixed(2) }}</div>
            <div class="col-auto text-caption text-grey-7">Payment: P{{ inlinePaymentTotal.toFixed(2) }}</div>
            <div class="col-auto">
              <q-badge :color="inlineBalance <= 0 ? 'positive' : 'orange'" style="font-size:13px;padding:4px 10px">
                {{ inlineBalance <= 0 ? '✓ FULLY PAID' : 'Balance: P' + inlineBalance.toFixed(2) }}
              </q-badge>
            </div>
          </div>
        </q-card-section>
      </q-card>
      <!-- New Product Dialog -->
      <q-dialog v-model="showNewProduct" persistent>
        <q-card style="min-width:420px">
          <q-card-section><div class="text-h6">New Product</div></q-card-section>
          <q-card-section class="q-gutter-sm">
            <q-input v-model="newProduct.code" label="Product Code *" outlined dense />
            <q-input v-model="newProduct.description" label="Description *" outlined dense />
            <q-select v-model="newProduct.uom" :options="uomOptions" label="UOM" outlined dense emit-value map-options clearable />
            <q-input v-model.number="newProduct.lastCost" label="Last Cost" outlined dense prefix="P" type="number" />
            <q-input v-model.number="newProduct.availableStock" label="Opening Stock" outlined dense type="number" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat label="Cancel" @click="showNewProduct = false" />
            <q-btn label="Create Product" color="primary" @click="saveNewProduct" :loading="savingProduct" />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Entry Row -->
      <q-card flat bordered class="q-mb-sm">
        <q-card-section class="q-py-sm">
          <div class="text-caption text-grey-7 q-mb-xs">Add Item — type code/name, Tab through fields, Enter to add</div>
          <div class="row q-col-gutter-xs items-end">
            <div class="col-2" style="position:relative">
              <q-input ref="searchRef" v-model="entry.search" label="Product Code / Name" outlined dense @keydown.enter="onEntryEnter" @update:model-value="onSearchChange" />
              <div v-if="suggestions.length > 0 && entry.search.length > 0" class="entry-suggestions">
                <div v-for="(s, i) in suggestions" :key="s._id" class="entry-suggestion-item" :class="{ 'entry-suggestion-active': i === 0 }" @mousedown.prevent="pickProduct(s)">
                  <span class="text-weight-medium">{{ s.code }}</span> — {{ s.description }} <span class="text-grey-6">| {{ s.uom }}</span>
                  <span v-if="getVendorPrice(s)" class="text-blue-8 q-ml-sm">Last: P{{ getVendorPrice(s) }}</span>
                </div>
              </div>
            </div>
            <div class="col-auto">
              <q-btn dense icon="add_box" color="primary" @click="showNewProduct = true"><q-tooltip>New Product</q-tooltip></q-btn>
            </div>
            <div class="col-1"><q-input :model-value="entry.product?.uom || ''" label="UOM" outlined dense readonly tabindex="-1" bg-color="grey-2" /></div>
            <div class="col-auto" style="width:50px"><q-input :model-value="entry.product?.availableStock || 0" label="Stk" outlined dense readonly tabindex="-1" bg-color="grey-2" /></div>
            <div class="col-1"><q-input v-model.number="entry.qty" label="Qty" type="number" outlined dense min="0" step="0.01" ref="qtyRef" @keydown.enter="addEntry" /></div>
            <div class="col-1"><q-input v-model="entryPriceDisplay" label="Price" outlined dense prefix="P" @focus="onPriceFocus" @blur="onPriceBlur" @keydown.enter="addEntry" @update:model-value="onPriceInput" /></div>
            <div class="col-4">
              <div class="row q-gutter-xs no-wrap items-center">
                <template v-for="d in ['d1','d2','d3','d4']" :key="d">
                  <q-input v-model.number="entry[d]" :label="d.toUpperCase()+'%'" type="number" outlined dense style="width:75px" min="0" max="100" step="0.1" @update:model-value="calcNet" @keydown.enter="addEntry" />
                  <q-btn :icon="entry[d+'Mode'] === 'add' ? 'add' : 'remove'" :color="entry[d+'Mode'] === 'add' ? 'orange' : 'blue'" dense flat size="xs" @click="entry[d+'Mode'] = entry[d+'Mode'] === 'add' ? 'subtract' : 'add'; calcNet()" />
                </template>
              </div>
            </div>
            <div class="col-1"><q-input :model-value="entry.netCost.toFixed(2)" label="Net" outlined dense readonly prefix="P" bg-color="green-1" /></div>
            <div class="col-1"><q-input :model-value="((entry.qty || 0) * entry.netCost).toFixed(2)" label="Total" outlined dense readonly prefix="P" bg-color="blue-1" /></div>
            <div class="col-auto"><q-btn color="primary" icon="add" dense unelevated style="height:40px" @click="addEntry" :disable="!entry.product" /></div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Items Table -->
      <q-card flat bordered class="q-mb-sm">
        <q-table :rows="form.lineItems" :columns="drColumns" row-key="_idx" flat bordered dense :rows-per-page-options="[0]">
          <template v-slot:body-cell-no="props">
            <q-td :props="props">{{ props.rowIndex + 1 }}</q-td>
          </template>
          <template v-slot:body-cell-quantityReceived="props">
            <q-td :props="props">
              <q-input v-model.number="props.row.quantityReceived" type="number" dense outlined min="0" step="0.01" style="width:80px" @update:model-value="recalcRow(props.row)" />
            </q-td>
          </template>
          <template v-slot:body-cell-code="props">
            <q-td :props="props">{{ props.row.code || '' }}</q-td>
          </template>
          <template v-slot:body-cell-unitCost="props">
            <q-td :props="props">
              <q-input :model-value="props.row._priceEdit ? String(props.row.unitCost || '') : (props.row.unitCost||0).toFixed(2)" prefix="P" dense outlined style="width:110px" @focus="props.row._priceEdit = true" @blur="props.row._priceEdit = false; props.row.unitCost = parseFloat(props.row.unitCost) || 0; recalcRow(props.row)" @update:model-value="(v: any) => { props.row.unitCost = parseFloat(v) || 0; recalcRow(props.row) }" />
            </q-td>
          </template>
          <template v-slot:body-cell-subTotal="props">
            <q-td :props="props">P{{ ((props.row.quantityReceived || 0) * (props.row.unitCost || 0)).toFixed(2) }}</q-td>
          </template>
          <template v-slot:body-cell-discounts="props">
            <q-td :props="props">
              <div class="row q-gutter-xs no-wrap items-center">
                <template v-for="d in [1,2,3,4]" :key="d">
                  <q-input v-model.number="props.row['discount'+d]" type="number" dense outlined style="width:70px" min="0" max="100" step="0.1" @update:model-value="recalcRow(props.row)" @keydown.enter.prevent />
                  <q-btn :icon="props.row['discount'+d+'Mode'] === 'add' ? 'add' : 'remove'" :color="props.row['discount'+d+'Mode'] === 'add' ? 'orange' : 'blue'" dense flat size="xs" @click="props.row['discount'+d+'Mode'] = props.row['discount'+d+'Mode'] === 'add' ? 'subtract' : 'add'; recalcRow(props.row)" />
                </template>
              </div>
            </q-td>
          </template>
          <template v-slot:body-cell-lineTotal="props">
            <q-td :props="props"><span class="text-weight-bold text-positive">P{{ ((props.row.quantityReceived || 0) * (props.row.netCost || props.row.unitCost || 0)).toFixed(2) }}</span></q-td>
          </template>
          <template v-slot:body-cell-actions="props">
            <q-td :props="props"><q-btn flat dense round icon="delete" color="negative" @click="form.lineItems.splice(props.rowIndex, 1)" /></q-td>
          </template>
          <template v-slot:bottom-row>
            <q-tr>
              <q-td colspan="8" class="text-right text-bold">TOTAL:</q-td>
              <q-td class="text-right text-bold text-positive">P{{ grandTotal.toFixed(2) }}</q-td>
              <q-td></q-td>
            </q-tr>
          </template>
        </q-table>
      </q-card>

      <!-- Actions -->
      <div class="row q-gutter-sm justify-end">
        <q-btn flat label="Cancel" color="primary" @click="$router.push('/deliveries')" />
        <q-btn flat label="Print" icon="print" color="grey-8" @click="printDR" :disable="form.lineItems.length === 0" />
        <q-btn label="Save" color="primary" @click="onSubmit" />
        <q-btn v-if="form.status === 'PENDING' && isEdit" label="Post Delivery" color="positive" icon="check" @click="onPost" />
        <q-btn v-if="form.status === 'POSTED' && isEdit" label="Pay Now" color="teal" icon="payment" @click="payForm.cashAmount = payBalance; payForm.cashEnabled = true; payForm.checkEnabled = false; payForm.onlineEnabled = false; payForm.checkAmount = 0; payForm.onlineAmount = 0; showPayNow = true" />
      </div>
    </div>
    <!-- New Vendor Dialog -->
    <q-dialog v-model="showNewVendor" persistent>
      <q-card style="min-width:400px">
        <q-card-section><div class="text-h6">New Vendor</div></q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="newVendor.name" label="Vendor Name *" outlined dense />
          <q-input v-model="newVendor.address" label="Address" outlined dense />
          <q-input v-model="newVendor.phone" label="Phone" outlined dense />
          <q-input v-model="newVendor.contactPerson" label="Contact Person" outlined dense />
          <q-input v-model="newVendor.email" label="Email" outlined dense />
          <q-input v-model="newVendor.tin" label="TIN" outlined dense />
          <q-input v-model="newVendor.termsOfPayment" label="Terms of Payment" outlined dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="showNewVendor = false" />
          <q-btn label="Save & Select" color="primary" @click="saveNewVendor" :loading="savingVendor" />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <!-- Pay Now Dialog — Split Bills (like POS) -->
    <q-dialog v-model="showPayNow" persistent maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6 text-teal">Pay Vendor — DR {{ form.drNumber }}</div>
          <q-space />
          <div class="text-h5 text-weight-bold text-positive">{{ 'P' + payBalance.toFixed(2) }}</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showPayNow = false" />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-3"><q-input :model-value="'P' + payBalance.toFixed(2)" label="Amount Due" outlined dense readonly bg-color="amber-1" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="'P' + payNowTotalPaid.toFixed(2)" label="Total Paid" outlined dense readonly bg-color="green-1" /></div>
            <div class="col-12 col-md-3"><q-input :model-value="'P' + Math.max(0, payBalance - payNowTotalPaid).toFixed(2)" label="Balance" outlined dense readonly :bg-color="payNowTotalPaid < payBalance ? 'red-1' : 'green-1'" /></div>
          </div>

          <!-- Cash -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="payForm.cashEnabled" label="Cash" /></div>
              <div class="col-3" v-if="payForm.cashEnabled"><q-input v-model.number="payForm.cashAmount" label="Cash Amount" type="number" outlined dense prefix="P" /></div>
            </div>
          </q-card-section></q-card>

          <!-- Check/Bank -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="payForm.checkEnabled" label="Check/Bank" /></div>
              <div class="col-2" v-if="payForm.checkEnabled"><q-input v-model.number="payForm.checkAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
              <div class="col-2" v-if="payForm.checkEnabled"><q-select v-model="payForm.checkBank" :options="['BPI','AUB','BDO','Metrobank','Landbank','PNB','Other']" label="Bank" outlined dense /></div>
              <div class="col-2" v-if="payForm.checkEnabled"><q-input v-model="payForm.checkNumber" label="Effective Date" type="date" outlined dense /></div>
            </div>
          </q-card-section></q-card>

          <!-- Online -->
          <q-card flat bordered class="q-mb-sm"><q-card-section class="q-py-sm">
            <div class="row q-col-gutter-md items-center">
              <div class="col-auto"><q-checkbox v-model="payForm.onlineEnabled" label="Online" /></div>
              <div class="col-2" v-if="payForm.onlineEnabled"><q-input v-model.number="payForm.onlineAmount" label="Amount" type="number" outlined dense prefix="P" /></div>
              <div class="col-2" v-if="payForm.onlineEnabled"><q-select v-model="payForm.onlineChannel" :options="['GCash','BPI Online','AUB Online','Maya','Other']" label="Channel" outlined dense /></div>
              <div class="col-2" v-if="payForm.onlineEnabled"><q-input v-model="payForm.onlineRefNo" label="Reference No." outlined dense /></div>
            </div>
          </q-card-section></q-card>

          <q-banner v-if="payNowTotalPaid > 0 && payNowTotalPaid < payBalance" class="bg-orange-1 q-mt-sm" rounded>
            <template v-slot:avatar><q-icon name="info" color="orange" /></template>
            Partial payment of P{{ payNowTotalPaid.toFixed(2) }}. Remaining P{{ (payBalance - payNowTotalPaid).toFixed(2) }} will be balance.
          </q-banner>

          <q-input v-model="payForm.notes" label="Notes" outlined dense class="q-mt-sm" />
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" @click="showPayNow = false" />
          <q-btn unelevated label="Record Payment" color="teal" icon="check" @click="submitPayNow" :loading="payingNow" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useDeliveryStore } from '../stores/deliveryStore';
import { useVendorStore } from '../stores/vendorStore';
import { useProductStore } from '../stores/productStore';
import { useUomStore } from '../stores/uomStore';
import { useQuasar } from 'quasar';

const router = useRouter();
const route = useRoute();
const deliveryStore = useDeliveryStore();
const vendorStore = useVendorStore();
const productStore = useProductStore();
const uomStore = useUomStore();

const uomOptions = computed(() => (uomStore.uoms || []).map((u: any) => ({ label: `${u.abbreviation} — ${u.name}`, value: u.abbreviation })));
const $q = useQuasar();

const isEdit = computed(() => !!route.params.id && route.params.id !== 'new');
const grandTotal = computed(() => form.value.lineItems.reduce((s: number, i: any) => s + ((i.quantityReceived || 0) * (i.netCost || i.unitCost || 0)), 0));
const inlinePaymentTotal = computed(() => {
  let total = 0;
  if (form.value.payCash) total += form.value.payCashAmt || 0;
  if (form.value.payCheck) total += form.value.payCheckAmt || 0;
  if (form.value.payOnline) total += form.value.payOnlineAmt || 0;
  return total;
});
const inlineBalance = computed(() => Math.max(0, grandTotal.value - inlinePaymentTotal.value));
const searchRef = ref<any>(null);
const qtyRef = ref<any>(null);

const form = ref<any>({
  drNumber: '', deliveryDate: new Date().toISOString().split('T')[0],
  vendorId: null, vendorName: '', vendorAddress: '', siNumber: '',
  payCash: false, payCashAmt: 0,
  payCheck: false, payCheckAmt: 0, payCheckRef: '',
  payOnline: false, payOnlineAmt: 0, payOnlineRef: '',
  status: 'PENDING', lineItems: [], amountPaid: 0
});

const vendors = ref<any[]>([]);
const vendorSelectRef = ref<any>(null);
const drNumberRef = ref<any>(null);
const siNumberRef = ref<any>(null);
const dateRef = ref<any>(null);
const allProducts = ref<any[]>([]);
const productSearchBusy = ref(false);
let productSearchTimer: any = null;
const suggestions = ref<any[]>([]);
const showNewVendor = ref(false);
const savingVendor = ref(false);
const newVendor = ref({ name: '', address: '', phone: '', contactPerson: '', email: '', tin: '', termsOfPayment: '' });
const showNewProduct = ref(false);
const savingProduct = ref(false);
const newProduct = ref({ code: '', description: '', uom: '', lastCost: 0, availableStock: 0 });
const showPayNow = ref(false);
const payingNow = ref(false);
const payForm = ref({
  cashEnabled: true, cashAmount: 0,
  checkEnabled: false, checkAmount: 0, checkBank: '', checkNumber: '',
  onlineEnabled: false, onlineAmount: 0, onlineChannel: '', onlineRefNo: '',
  notes: ''
});
const payNowTotalPaid = computed(() => {
  let total = 0;
  if (payForm.value.cashEnabled) total += payForm.value.cashAmount || 0;
  if (payForm.value.checkEnabled) total += payForm.value.checkAmount || 0;
  if (payForm.value.onlineEnabled) total += payForm.value.onlineAmount || 0;
  return total;
});
const payBalance = computed(() => {
  const total = grandTotal.value;
  const paid = form.value.amountPaid || 0;
  return Math.max(0, total - paid);
});

const resetForNextDelivery = () => {
  form.value = {
    drNumber: '',
    deliveryDate: new Date().toISOString().split('T')[0],
    vendorId: null,
    vendorName: '',
    vendorAddress: '',
    siNumber: '',
    payCash: false,
    payCashAmt: 0,
    payCheck: false,
    payCheckAmt: 0,
    payCheckRef: '',
    payOnline: false,
    payOnlineAmt: 0,
    payOnlineRef: '',
    status: 'PENDING',
    lineItems: [],
    amountPaid: 0
  };

  entry.value = {
    search: '', product: null,
    qty: 0, unitCost: 0,
    d1: 0, d1Mode: 'subtract', d2: 0, d2Mode: 'subtract',
    d3: 0, d3Mode: 'subtract', d4: 0, d4Mode: 'subtract', netCost: 0
  };
  entryPriceDisplay.value = '0.00';
  suggestions.value = [];

  setTimeout(() => vendorSelectRef.value?.focus(), 50);
};

const entry = ref<any>({
  search: '', product: null,
  qty: 0, unitCost: 0,
  d1: 0, d1Mode: 'subtract', d2: 0, d2Mode: 'subtract',
  d3: 0, d3Mode: 'subtract', d4: 0, d4Mode: 'subtract', netCost: 0
});

const entryPriceDisplay = ref('0.00');
const priceEditing = ref(false);

const onPriceFocus = () => {
  priceEditing.value = true;
  entryPriceDisplay.value = entry.value.unitCost ? String(entry.value.unitCost) : '';
};
const onPriceBlur = () => {
  priceEditing.value = false;
  const num = parseFloat(entryPriceDisplay.value) || 0;
  entry.value.unitCost = num;
  entryPriceDisplay.value = num.toFixed(2);
  calcNet();
};
const onPriceInput = (val: any) => {
  const num = parseFloat(val) || 0;
  entry.value.unitCost = num;
  calcNet();
};

const drColumns = [
  { name: 'no', label: 'No.', field: '', align: 'center' as const },
  { name: 'quantityReceived', label: 'Qty', field: 'quantityReceived', align: 'center' as const },
  { name: 'code', label: 'Code', field: '', align: 'left' as const },
  { name: 'description', label: 'Description', field: 'description', align: 'left' as const },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center' as const },
  { name: 'unitCost', label: 'Unit Cost', field: 'unitCost', align: 'right' as const, format: (v: number) => `P${(v||0).toFixed(2)}` },
  { name: 'subTotal', label: 'Sub Total', field: '', align: 'right' as const },
  { name: 'discounts', label: 'Disc', field: '', align: 'center' as const },
  { name: 'lineTotal', label: 'Total Amount', field: '', align: 'right' as const },
  { name: 'actions', label: '', field: '', align: 'center' as const }
];

// Get last vendor price for a product (shown in suggestions)
const getVendorPrice = (product: any): string => {
  const vid = form.value.vendorId?._id || form.value.vendorId;
  if (vid && product.vendorCosts) {
    const vc = product.vendorCosts.find((v: any) => (v.vendorId?._id || v.vendorId)?.toString() === vid?.toString());
    if (vc) return (vc.netCost || vc.unitCost || 0).toFixed(2);
  }
  // Fallback: show product's lastCost if no vendor-specific cost
  if (product.lastCost) return product.lastCost.toFixed(2);
  return '';
};

const onSearchChange = (val: any) => {
  const v = String(val || '').trim();
  entry.value.product = null;
  if (v.length < 1) {
    suggestions.value = [];
    return;
  }

  if (productSearchTimer) clearTimeout(productSearchTimer);
  productSearchTimer = setTimeout(async () => {
    const needle = v.toLowerCase();
    try {
      productSearchBusy.value = true;
      // Fetch only matching products to avoid freezing edit page with huge preload.
      await productStore.fetchProducts({ search: needle, limit: 200, page: 1 });
      allProducts.value = productStore.products || [];
    } catch (e) {
      console.error('Product search fetch failed:', e);
    } finally {
      productSearchBusy.value = false;
    }

    suggestions.value = allProducts.value
      .filter((p: any) => p.code?.toLowerCase().includes(needle) || p.description?.toLowerCase().includes(needle))
      .sort((a: any, b: any) => {
        const aCode = (a.code || '').toLowerCase();
        const bCode = (b.code || '').toLowerCase();
        const aCodeStarts = aCode.startsWith(needle) ? 0 : aCode.includes(needle) ? 1 : 2;
        const bCodeStarts = bCode.startsWith(needle) ? 0 : bCode.includes(needle) ? 1 : 2;
        if (aCodeStarts !== bCodeStarts) return aCodeStarts - bCodeStarts;
        const aDesc = (a.description || '').toLowerCase();
        const bDesc = (b.description || '').toLowerCase();
        const aDescStarts = aDesc.startsWith(needle) ? 0 : 1;
        const bDescStarts = bDesc.startsWith(needle) ? 0 : 1;
        if (aDescStarts !== bDescStarts) return aDescStarts - bDescStarts;
        return aCode.localeCompare(bCode);
      })
      .slice(0, 8);
  }, 200);
};

const pickProduct = (p: any) => {
  entry.value.product = p;
  entry.value.search = `${p.code} — ${p.description}`;
  entry.value.qty = null;

  // Check if current vendor has a cost entry for this product
  const vid = form.value.vendorId?._id || form.value.vendorId;
  let prefilled = false;
  if (vid && p.vendorCosts && p.vendorCosts.length > 0) {
    const vc = p.vendorCosts.find((v: any) => (v.vendorId?._id || v.vendorId)?.toString() === vid?.toString());
    if (vc) {
      entry.value.unitCost = vc.grossCost || vc.unitCost || 0;
      entryPriceDisplay.value = entry.value.unitCost.toFixed(2);
      entry.value.d1 = vc.discount1 || 0; entry.value.d1Mode = vc.discount1Mode || 'subtract';
      entry.value.d2 = vc.discount2 || 0; entry.value.d2Mode = vc.discount2Mode || 'subtract';
      entry.value.d3 = vc.discount3 || 0; entry.value.d3Mode = vc.discount3Mode || 'subtract';
      entry.value.d4 = vc.discount4 || 0; entry.value.d4Mode = vc.discount4Mode || 'subtract';
      prefilled = true;
    }
  }
  if (!prefilled) {
    // Fall back to product's lastCost if no vendor-specific cost found
    const fallbackCost = p.lastCost || 0;
    entry.value.unitCost = fallbackCost;
    entryPriceDisplay.value = fallbackCost.toFixed(2);
    // Also pre-fill last discounts if available
    if (p.lastDiscounts) {
      entry.value.d1 = p.lastDiscounts.discount1 || 0; entry.value.d1Mode = p.lastDiscounts.discount1Mode || 'subtract';
      entry.value.d2 = p.lastDiscounts.discount2 || 0; entry.value.d2Mode = p.lastDiscounts.discount2Mode || 'subtract';
      entry.value.d3 = p.lastDiscounts.discount3 || 0; entry.value.d3Mode = p.lastDiscounts.discount3Mode || 'subtract';
      entry.value.d4 = p.lastDiscounts.discount4 || 0; entry.value.d4Mode = p.lastDiscounts.discount4Mode || 'subtract';
    } else {
      entry.value.d1 = 0; entry.value.d1Mode = 'subtract';
      entry.value.d2 = 0; entry.value.d2Mode = 'subtract';
      entry.value.d3 = 0; entry.value.d3Mode = 'subtract';
      entry.value.d4 = 0; entry.value.d4Mode = 'subtract';
    }
  }
  calcNet();
  suggestions.value = [];
  setTimeout(() => qtyRef.value?.focus(), 50);
};

const onEntryEnter = () => {
  if (suggestions.value.length > 0) { pickProduct(suggestions.value[0]); return; }
  if (entry.value.product) addEntry();
};

const calcNet = () => {
  let price = entry.value.unitCost || 0;
  for (const d of ['d1','d2','d3','d4']) {
    const pct = entry.value[d] || 0;
    if (pct > 0) {
      const mode = entry.value[d + 'Mode'] || 'subtract';
      price = mode === 'add' ? price * (1 + pct / 100) : price * (1 - pct / 100);
    }
  }
  entry.value.netCost = Math.round(price * 100) / 100;
};

const recalcRow = (row: any) => {
  let price = row.unitCost || 0;
  for (const d of [1,2,3,4]) {
    const pct = row[`discount${d}`] || 0;
    if (pct > 0) {
      const mode = row[`discount${d}Mode`] || 'subtract';
      price = mode === 'add' ? price * (1 + pct / 100) : price * (1 - pct / 100);
    }
  }
  row.netCost = Math.round(price * 100) / 100;
};

const addEntry = () => {
  if (!entry.value.product) return;
  const p = entry.value.product;
  const qty = Number(entry.value.qty) || 0;
  const unitCost = Number(entry.value.unitCost) || 0;
  const netCost = Number(entry.value.netCost) || 0;

  form.value.lineItems.push({
    productId: p._id, code: p.code || '', description: p.description, uom: p.uom || '',
    quantityOrdered: qty,
    quantityReceived: qty,
    unitCost,
    discount1: Number(entry.value.d1) || 0, discount1Mode: entry.value.d1Mode,
    discount2: Number(entry.value.d2) || 0, discount2Mode: entry.value.d2Mode,
    discount3: Number(entry.value.d3) || 0, discount3Mode: entry.value.d3Mode,
    discount4: Number(entry.value.d4) || 0, discount4Mode: entry.value.d4Mode,
    netCost
  });
  entry.value = { search: '', product: null, qty: 0, unitCost: 0, d1: 0, d1Mode: 'subtract', d2: 0, d2Mode: 'subtract', d3: 0, d3Mode: 'subtract', d4: 0, d4Mode: 'subtract', netCost: 0 };
  entryPriceDisplay.value = '0.00';
  suggestions.value = [];
  setTimeout(() => searchRef.value?.focus(), 50);
};

const filterVendors = (val: string, update: Function) => {
  update(() => {
    const needle = val.toLowerCase();
    vendors.value = needle ? vendorStore.vendors.filter(v => v.name.toLowerCase().includes(needle)) : vendorStore.vendors;
  });
};

const onVendorSelected = (vendor: any) => {
  if (vendor) { form.value.vendorName = vendor.name || ''; form.value.vendorAddress = vendor.address || ''; }
};

const onVendorSelectedAndMove = (vendor: any) => {
  onVendorSelected(vendor);
  setTimeout(() => drNumberRef.value?.focus(), 100);
};

const selectFirstVendor = () => {
  if (vendors.value.length > 0) {
    form.value.vendorId = vendors.value[0];
    onVendorSelected(vendors.value[0]);
    vendorSelectRef.value?.updateInputValue(vendors.value[0].name, true);
    vendorSelectRef.value?.hidePopup();
    vendorSelectRef.value?.blur();
    setTimeout(() => drNumberRef.value?.focus(), 150);
  }
};

const saveNewVendor = async () => {
  if (!newVendor.value.name) { $q.notify({ type: 'warning', message: 'Vendor name required' }); return; }
  savingVendor.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}/api/vendors`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(newVendor.value)
    });
    if (!res.ok) throw new Error('Failed');
    const created = await res.json();
    await vendorStore.fetchVendors();
    vendors.value = vendorStore.vendors;
    form.value.vendorId = created;
    form.value.vendorName = created.name;
    showNewVendor.value = false;
    newVendor.value = { name: '', address: '', phone: '', contactPerson: '', email: '', tin: '', termsOfPayment: '' };
    $q.notify({ type: 'positive', message: 'Vendor created and selected' });
  } catch { $q.notify({ type: 'negative', message: 'Failed to create vendor' }); }
  finally { savingVendor.value = false; }
};

const saveNewProduct = async () => {
  if (!newProduct.value.code || !newProduct.value.description) { $q.notify({ type: 'warning', message: 'Product code and description are required' }); return; }
  savingProduct.value = true;
  try {
    const created = await productStore.createProduct({
      code: newProduct.value.code,
      description: newProduct.value.description,
      uom: newProduct.value.uom || 'pc',
      lastCost: Number(newProduct.value.lastCost) || 0,
      availableStock: Number(newProduct.value.availableStock) || 0
    } as any);

    // Keep local suggestion pool updated without forcing a huge refetch.
    allProducts.value = [created, ...allProducts.value.filter((p: any) => p._id !== created._id)];

    // Select created product into current entry
    entry.product = created as any;
    entry.search = `${created.code} — ${created.description}`;
    entry.unitCost = created.lastCost || 0;
    entry.netCost = created.lastCost || 0;

    showNewProduct.value = false;
    newProduct.value = { code: '', description: '', uom: '', lastCost: 0, availableStock: 0 };
    $q.notify({ type: 'positive', message: 'Product created and selected' });
  } catch (e: any) {
    console.error('Failed to create product', e);
    $q.notify({ type: 'negative', message: 'Failed to create product' });
  } finally { savingProduct.value = false; }
};

const onSubmit = async () => {
  if (form.value.lineItems.length === 0) { $q.notify({ type: 'warning', message: 'Add at least one item' }); return; }
  const vid = form.value.vendorId?._id || form.value.vendorId;
  if (!vid) { $q.notify({ type: 'warning', message: 'Please select a vendor' }); return; }
  const vname = form.value.vendorName || form.value.vendorId?.name || '';
  if (!vname) { $q.notify({ type: 'warning', message: 'Vendor name is missing' }); return; }
  try {
    // Build clean data — only send fields the backend expects
    const data: any = {
      vendorId: vid,
      vendorName: vname,
      vendorAddress: form.value.vendorAddress || form.value.vendorId?.address || '',
      drNumber: form.value.drNumber || '',
      siNumber: form.value.siNumber || '',
      deliveryDate: form.value.deliveryDate,
      status: form.value.status || 'PENDING',
      lineItems: form.value.lineItems.map((item: any) => ({
        productId: item.productId,
        code: item.code || '',
        description: item.description || '',
        uom: item.uom || '',
        quantityOrdered: Number(item.quantityOrdered) || 0,
        quantityReceived: Number(item.quantityReceived) || 0,
        unitCost: Number(item.unitCost) || 0,
        discount1: Number(item.discount1) || 0, discount1Mode: item.discount1Mode || 'subtract',
        discount2: Number(item.discount2) || 0, discount2Mode: item.discount2Mode || 'subtract',
        discount3: Number(item.discount3) || 0, discount3Mode: item.discount3Mode || 'subtract',
        discount4: Number(item.discount4) || 0, discount4Mode: item.discount4Mode || 'subtract',
        netCost: Number(item.netCost || item.unitCost) || 0
      }))
    };
    let drId = route.params.id as string;
    if (isEdit.value) {
      await deliveryStore.updateDeliveryReceipt(drId, data);
      $q.notify({ type: 'positive', message: form.value.status === 'POSTED' ? 'Updated & inventory re-applied' : 'Updated' });
    } else {
      const created = await deliveryStore.createDeliveryReceipt(data);
      drId = created?._id || created?.id;
      $q.notify({ type: 'positive', message: 'Created' });
    }
    // Auto-post only for new (PENDING) DRs — editing a POSTED DR already re-applies inventory via the service
    if (drId && form.value.status !== 'POSTED') {
      try {
        await deliveryStore.postDeliveryReceipt(drId);
        // Record split payments
        const totalPayment = (form.value.payCash ? form.value.payCashAmt || 0 : 0) + (form.value.payCheck ? form.value.payCheckAmt || 0 : 0) + (form.value.payOnline ? form.value.payOnlineAmt || 0 : 0);
        if (totalPayment > 0) {
          const API_URL = import.meta.env.VITE_API_URL || '';
          const token = localStorage.getItem('auth_token');
          // Pay each method separately or combined
          if (form.value.payCash && form.value.payCashAmt > 0) {
            await fetch(`${API_URL}/api/deliveries/${drId}/pay`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: form.value.payCashAmt, method: 'CASH', notes: 'Payment on save' }) });
          }
          if (form.value.payCheck && form.value.payCheckAmt > 0) {
            await fetch(`${API_URL}/api/deliveries/${drId}/pay`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: form.value.payCheckAmt, method: 'CHECK', effectiveDate: form.value.payCheckRef || undefined, notes: 'Check payment on save' }) });
          }
          if (form.value.payOnline && form.value.payOnlineAmt > 0) {
            await fetch(`${API_URL}/api/deliveries/${drId}/pay`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: form.value.payOnlineAmt, method: 'ONLINE', reference: form.value.payOnlineRef, notes: 'Online payment on save' }) });
          }
        }
        $q.notify({ type: 'positive', message: 'Posted & inventory updated' });
      } catch { /* post failed silently */ }
    }
    // For new DR flow: remain on page and clear fields for fast next entry.
    if (!isEdit.value) {
      resetForNextDelivery();
      router.replace('/deliveries/new');
      $q.notify({ type: 'positive', message: 'Saved. Ready for next delivery.' });
    }
  } catch (e: any) {
    const msg = e?.message || 'Failed to save';
    $q.notify({ type: 'negative', message: msg, timeout: 5000 });
    console.error('DR save error:', e);
  }
};

const onPost = () => {
  $q.dialog({ title: 'Post Delivery', message: 'Post this DR? Inventory will be updated.', cancel: true, persistent: true }).onOk(async () => {
    try {
      await deliveryStore.postDeliveryReceipt(route.params.id as string);
      $q.notify({ type: 'positive', message: 'Posted' });
      // Stay on the delivery form after posting
    } catch {
      $q.notify({ type: 'negative', message: 'Failed to post' });
    }
  });
};

const printDR = () => {
  const items = form.value.lineItems;
  if (items.length === 0) return;
  const vendor = form.value.vendorName || form.value.vendorId?.name || '';
  const drNum = form.value.drNumber || 'N/A';
  const siNum = form.value.siNumber || '';
  const date = form.value.deliveryDate || '';

  let rows = '';
  items.forEach((item: any, idx: number) => {
    const sub = ((item.quantityReceived || 0) * (item.unitCost || 0)).toFixed(2);
    const discStr = [1,2,3,4].map(d => item[`discount${d}`] ? `${item[`discount${d}Mode`]==='add'?'+':'-'}${item[`discount${d}`]}%` : '').filter(Boolean).join(' ') || '—';
    const total = ((item.quantityReceived || 0) * (item.netCost || item.unitCost || 0)).toFixed(2);
    rows += `<tr><td style="text-align:center">${idx+1}</td><td style="text-align:center">${item.quantityReceived||0}</td><td>${item.code||''}</td><td>${item.description||''}</td><td style="text-align:center">${item.uom||''}</td><td style="text-align:right">${(item.unitCost||0).toFixed(2)}</td><td style="text-align:right">${sub}</td><td style="text-align:center">${discStr}</td><td style="text-align:right">${total}</td></tr>`;
  });

  const html = `<!DOCTYPE html><html><head><title>DR ${drNum}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;font-size:11px}th{background:#f0f0f0;font-weight:bold}.header{text-align:center;margin-bottom:10px}.total-row{font-weight:bold;font-size:14px}@media print{body{margin:0}}</style>
    </head><body>
    <div class="header"><h2 style="margin:0">Aberin Hardware</h2><p style="margin:2px 0">Delivery Receipt</p></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <div><b>Vendor:</b> ${vendor}</div><div><b>DR#:</b> ${drNum}</div>${siNum ? `<div><b>SI#:</b> ${siNum}</div>` : ''}<div><b>Date:</b> ${date}</div>
    </div>
    <table><thead><tr><th>No.</th><th>Qty</th><th>Code</th><th>Description</th><th>UOM</th><th>Unit Cost</th><th>Sub Total</th><th>Disc</th><th>Total Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="8" style="text-align:right">TOTAL:</td><td style="text-align:right">P${grandTotal.value.toFixed(2)}</td></tr></tfoot>
    </table><script>window.onload=function(){window.print()}<\/script></body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

const submitPayNow = async () => {
  const totalPay = payNowTotalPaid.value;
  if (totalPay <= 0) { $q.notify({ type: 'warning', message: 'Enter payment amount' }); return; }
  payingNow.value = true;
  try {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('auth_token');
    // Send each payment method separately
    if (payForm.value.cashEnabled && payForm.value.cashAmount > 0) {
      const res = await fetch(`${API_URL}/api/deliveries/${route.params.id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payForm.value.cashAmount, method: 'CASH', notes: payForm.value.notes || 'Cash payment' })
      });
      if (!res.ok) throw new Error('Failed to record cash payment');
    }
    if (payForm.value.checkEnabled && payForm.value.checkAmount > 0) {
      const res = await fetch(`${API_URL}/api/deliveries/${route.params.id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payForm.value.checkAmount, method: 'CHECK', effectiveDate: payForm.value.checkNumber || undefined, notes: payForm.value.notes || 'Check payment' })
      });
      if (!res.ok) throw new Error('Failed to record check payment');
    }
    if (payForm.value.onlineEnabled && payForm.value.onlineAmount > 0) {
      const res = await fetch(`${API_URL}/api/deliveries/${route.params.id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payForm.value.onlineAmount, method: 'ONLINE', reference: `${payForm.value.onlineChannel || ''} ${payForm.value.onlineRefNo || ''}`.trim(), notes: payForm.value.notes || 'Online payment' })
      });
      if (!res.ok) throw new Error('Failed to record online payment');
    }
    // Refresh DR data
    const drRes = await fetch(`${API_URL}/api/deliveries/${route.params.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (drRes.ok) {
      const updated = await drRes.json();
      form.value.amountPaid = updated.amountPaid || 0;
      form.value.paymentStatus = updated.paymentStatus || 'UNPAID';
    }
    $q.notify({ type: 'positive', message: 'Payment recorded' });
    showPayNow.value = false;
  } catch (e: any) { $q.notify({ type: 'negative', message: e.message || 'Failed to record payment' }); }
  finally { payingNow.value = false; }
};

onMounted(async () => {
  // Do not block page rendering on auxiliary lookups.
  vendors.value = vendorStore.vendors || [];
  vendorStore.fetchVendors()
    .then(() => { vendors.value = vendorStore.vendors; })
    .catch((e: any) => { console.warn('Vendor preload failed:', e); });

  uomStore.fetchUoms().catch((e: any) => { console.warn('UOM preload failed:', e); });

  allProducts.value = [];
  if (isEdit.value) {
    try {
      const dr = await deliveryStore.getDeliveryReceiptById(route.params.id as string);
      if (!dr) throw new Error('Delivery record not found');

      const parsedDate = dr.deliveryDate ? new Date(dr.deliveryDate) : new Date();
      const safeDate = Number.isNaN(parsedDate.getTime())
        ? new Date().toISOString().split('T')[0]
        : parsedDate.toISOString().split('T')[0];

      const safeLineItems = Array.isArray(dr.lineItems) ? dr.lineItems : [];

      form.value = {
        drNumber: dr.drNumber || '',
        deliveryDate: safeDate,
        vendorId: dr.vendorId || null,
        vendorName: dr.vendorName || dr.vendorId?.name || '',
        vendorAddress: dr.vendorAddress || dr.vendorId?.address || '',
        terms: dr.terms || '',
        siNumber: dr.siNumber || '',
        status: dr.status || 'PENDING',
        amountPaid: Number(dr.amountPaid) || 0,
        paymentStatus: dr.paymentStatus || 'UNPAID',
        lineItems: safeLineItems.map((item: any) => ({
          ...item, productId: item.productId?._id || item.productId, code: item.code || '',
          discount1: item.discount1 || 0, discount1Mode: item.discount1Mode || 'subtract',
          discount2: item.discount2 || 0, discount2Mode: item.discount2Mode || 'subtract',
          discount3: item.discount3 || 0, discount3Mode: item.discount3Mode || 'subtract',
          discount4: item.discount4 || 0, discount4Mode: item.discount4Mode || 'subtract',
          netCost: item.netCost || item.unitCost
        }))
      };
    } catch (e: any) {
      console.error('Failed to load DR for edit:', e);
      $q.notify({ type: 'negative', message: e?.message || 'Failed to load DR' });
      router.push('/deliveries');
    }
  }
});
</script>

<style scoped>
.entry-suggestions { position: absolute; z-index: 9999; background: #fff; border: 2px solid #1976d2; border-top: none; border-radius: 0 0 6px 6px; max-height: 180px; overflow-y: auto; width: 100%; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.entry-suggestion-item { padding: 6px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
.entry-suggestion-item:hover, .entry-suggestion-active { background: #e3f2fd; }
</style>

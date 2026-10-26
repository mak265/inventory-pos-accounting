<template>
  <q-card style="min-width: 600px; max-width: 700px">
    <q-card-section>
      <div class="text-h6">Record Payment</div>
      <div class="text-subtitle2 text-grey-7" v-if="sale">
        DR #{{ sale.drNumber }} - {{ sale.customerName }}
      </div>
    </q-card-section>

    <q-card-section>
      <q-form @submit="onSubmit" class="q-gutter-md">
        <!-- Amount Due -->
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <q-input
              v-model.number="form.amountDue"
              label="Amount Due *"
              type="number"
              outlined
              dense
              step="0.01"
              prefix="P"
              readonly
              :rules="[val => val > 0 || 'Amount due must be greater than zero']"
            />
          </div>
          <div class="col-6">
            <q-input
              v-model="form.paymentDate"
              label="Payment Date *"
              type="date"
              outlined
              dense
              :rules="[val => !!val || 'Payment date is required']"
            />
          </div>
        </div>

        <!-- Reference Number -->
        <q-input
          v-model="form.referenceNumber"
          label="Reference Number"
          outlined
          dense
        />

        <!-- Cash and Charge Payment -->
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <q-input
              v-model.number="form.cashPayment"
              label="Cash Payment"
              type="number"
              outlined
              dense
              step="0.01"
              prefix="P"
              :rules="[val => !val || val >= 0 || 'Cannot be negative']"
              @update:model-value="calculateTotals"
            />
          </div>
          <div class="col-6">
            <q-input
              v-model.number="form.chargePayment"
              label="Charge Payment (Credit)"
              type="number"
              outlined
              dense
              step="0.01"
              prefix="P"
              :rules="[val => !val || val >= 0 || 'Cannot be negative']"
              @update:model-value="calculateTotals"
            />
          </div>
        </div>

        <!-- Payment Channels -->
        <div class="q-mt-md">
          <div class="text-subtitle2 q-mb-sm">Payment Channels</div>
          
          <div v-for="(channel, index) in form.paymentChannels" :key="index" class="q-mb-md q-pa-md" style="border: 1px solid #e0e0e0; border-radius: 4px;">
            <div class="row q-col-gutter-md">
              <div class="col-4">
                <q-select
                  v-model="channel.channel"
                  label="Channel *"
                  :options="channelOptions"
                  outlined
                  dense
                  :rules="[val => !!val || 'Channel is required']"
                />
              </div>
              <div class="col-4">
                <q-input
                  v-model.number="channel.amount"
                  label="Amount *"
                  type="number"
                  outlined
                  dense
                  step="0.01"
                  prefix="P"
                  :rules="[val => val > 0 || 'Amount must be greater than zero']"
                  @update:model-value="calculateTotals"
                />
              </div>
              <div class="col-4">
                <q-btn
                  flat
                  round
                  dense
                  icon="delete"
                  color="negative"
                  @click="removeChannel(index)"
                />
              </div>
            </div>
            
            <div class="row q-col-gutter-md q-mt-xs" v-if="channel.channel !== 'CASH'">
              <div class="col-6">
                <q-input
                  v-model="channel.referenceNumber"
                  label="Reference Number"
                  outlined
                  dense
                />
              </div>
              <div class="col-6">
                <!-- GCash: pick from the 3 accounts; all others: free-text -->
                <q-select
                  v-if="channel.channel === 'GCASH'"
                  v-model="channel.accountName"
                  :options="['Katrina','Louie','Anicia']"
                  label="GCash Account *"
                  outlined
                  dense
                  clearable
                />
                <q-input
                  v-else
                  v-model="channel.accountName"
                  label="Account Number"
                  outlined
                  dense
                />
              </div>
            </div>
            
            <div class="row q-col-gutter-md q-mt-xs" v-if="channel.channel !== 'CASH'">
              <div class="col-6">
                <q-input
                  v-model="channel.effectiveDate"
                  label="Effective Date"
                  type="date"
                  outlined
                  dense
                />
              </div>
            </div>
          </div>

          <q-btn
            flat
            icon="add"
            label="Add Payment Channel"
            color="primary"
            @click="addChannel"
          />
        </div>

        <!-- Payment Summary -->
        <q-separator class="q-my-md" />
        
        <div class="q-pa-md bg-grey-2 rounded-borders">
          <div class="row justify-between q-mb-sm">
            <span class="text-weight-medium">Total Paid:</span>
            <span class="text-weight-bold text-positive">P{{ totalPaid.toFixed(2) }}</span>
          </div>
          <div class="row justify-between">
            <span class="text-weight-medium">Unpaid Amount:</span>
            <span class="text-weight-bold" :class="unpaidAmount > 0 ? 'text-negative' : 'text-grey'">
              P{{ unpaidAmount.toFixed(2) }}
            </span>
          </div>
        </div>
      </q-form>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat label="Cancel" color="primary" @click="$emit('cancelled')" />
      <q-btn
        flat
        label="Record Payment"
        color="primary"
        @click="onSubmit"
        :loading="saving"
        :disable="totalPaid === 0"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePaymentStore } from '../stores/paymentStore';

interface Props {
  sale: any;
}

const props = defineProps<Props>();
const emit = defineEmits(['saved', 'cancelled']);

const paymentStore = usePaymentStore();
const saving = ref(false);

const channelOptions = [
  { label: 'Cash', value: 'CASH' },
  { label: 'GCash', value: 'GCASH' },
  { label: 'BPI', value: 'BPI' },
  { label: 'AUB', value: 'AUB' },
  { label: 'BPI Online', value: 'BPI ONLINE' },
  { label: 'AUB Online', value: 'AUB ONLINE' },
  { label: 'Maya', value: 'MAYA' },
  { label: 'Check', value: 'CHECK' },
  { label: 'Other Bank', value: 'OTHER_BANK' }
];

const form = ref({
  saleId: '',
  customerId: '',
  paymentDate: new Date().toISOString().split('T')[0],
  referenceNumber: '',
  amountDue: 0,
  cashPayment: 0,
  chargePayment: 0,
  paymentChannels: [] as Array<{
    channel: string;
    amount: number;
    referenceNumber?: string;
    accountName?: string;
    effectiveDate?: string;
  }>
});

const totalPaid = computed(() => {
  const cashAndCharge = (form.value.cashPayment || 0) + (form.value.chargePayment || 0);
  const channelsTotal = form.value.paymentChannels.reduce((sum, ch) => sum + (ch.amount || 0), 0);
  return cashAndCharge + channelsTotal;
});

const unpaidAmount = computed(() => {
  const unpaid = form.value.amountDue - totalPaid.value;
  return unpaid > 0 ? unpaid : 0;
});

const calculateTotals = () => {
  // Trigger reactivity
};

const addChannel = () => {
  form.value.paymentChannels.push({
    channel: 'GCASH',
    amount: 0
  });
};

const removeChannel = (index: number) => {
  form.value.paymentChannels.splice(index, 1);
};

const onSubmit = async () => {
  // Validate required fields
  if (!form.value.paymentDate || form.value.amountDue <= 0) {
    return;
  }

  if (totalPaid.value === 0) {
    return;
  }

  saving.value = true;
  try {
    await paymentStore.createPayment(form.value);
    emit('saved');
  } catch (error) {
    console.error('Error recording payment:', error);
    // Error notification is handled by the store
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  if (props.sale) {
    form.value.saleId = props.sale._id;
    form.value.customerId = props.sale.customerId;
    form.value.amountDue = props.sale.totalAmount;
  }
});
</script>

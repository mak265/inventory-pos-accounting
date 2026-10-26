<template>
  <q-card>
    <q-card-section>
      <div class="text-h6">Payment History</div>
      <div class="text-subtitle2 text-grey-7" v-if="customer">
        {{ customer.name }}
      </div>
    </q-card-section>

    <q-card-section>
      <q-table
        :rows="payments"
        :columns="columns"
        row-key="_id"
        :loading="loading"
        flat
        bordered
        :pagination="{ rowsPerPage: 10 }"
      >
        <template v-slot:body-cell-paymentDate="props">
          <q-td :props="props">
            {{ formatDate(props.row.paymentDate) }}
          </q-td>
        </template>

        <template v-slot:body-cell-amountDue="props">
          <q-td :props="props">
            P{{ props.row.amountDue.toFixed(2) }}
          </q-td>
        </template>

        <template v-slot:body-cell-totalPaid="props">
          <q-td :props="props">
            <span class="text-positive text-weight-medium">
              P{{ props.row.totalPaid.toFixed(2) }}
            </span>
          </q-td>
        </template>

        <template v-slot:body-cell-unpaidAmount="props">
          <q-td :props="props">
            <span :class="props.row.unpaidAmount > 0 ? 'text-negative text-weight-medium' : 'text-grey'">
              P{{ props.row.unpaidAmount.toFixed(2) }}
            </span>
          </q-td>
        </template>

        <template v-slot:body-cell-channels="props">
          <q-td :props="props">
            <div v-if="props.row.cashPayment > 0" class="text-caption">
              Cash: P{{ props.row.cashPayment.toFixed(2) }}
            </div>
            <div v-if="props.row.chargePayment > 0" class="text-caption">
              Charge: P{{ props.row.chargePayment.toFixed(2) }}
            </div>
            <div v-for="(channel, idx) in props.row.paymentChannels" :key="idx" class="text-caption">
              {{ channel.channel }}: P{{ channel.amount.toFixed(2) }}
              <span v-if="channel.referenceNumber" class="text-grey-7">
                ({{ channel.referenceNumber }})
              </span>
            </div>
          </q-td>
        </template>

        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              @click="viewPayment(props.row)"
            >
              <q-tooltip>View Details</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { usePaymentStore } from '../stores/paymentStore';
import { date } from 'quasar';

interface Props {
  customerId?: string;
  customer?: any;
}

const props = defineProps<Props>();

const paymentStore = usePaymentStore();
const loading = ref(false);

const columns = [
  {
    name: 'paymentDate',
    label: 'Date',
    field: 'paymentDate',
    align: 'left' as const,
    sortable: true
  },
  {
    name: 'referenceNumber',
    label: 'Reference',
    field: 'referenceNumber',
    align: 'left' as const
  },
  {
    name: 'amountDue',
    label: 'Amount Due',
    field: 'amountDue',
    align: 'right' as const,
    sortable: true
  },
  {
    name: 'totalPaid',
    label: 'Total Paid',
    field: 'totalPaid',
    align: 'right' as const,
    sortable: true
  },
  {
    name: 'unpaidAmount',
    label: 'Unpaid',
    field: 'unpaidAmount',
    align: 'right' as const,
    sortable: true
  },
  {
    name: 'channels',
    label: 'Payment Channels',
    field: 'paymentChannels',
    align: 'left' as const
  },
  {
    name: 'actions',
    label: 'Actions',
    field: 'actions',
    align: 'center' as const
  }
];

const payments = computed(() => {
  if (props.customerId) {
    return paymentStore.payments.filter(p => p.customerId === props.customerId);
  }
  return paymentStore.payments;
});

const formatDate = (dateString: string) => {
  return date.formatDate(dateString, 'MMM DD, YYYY');
};

const viewPayment = (payment: any) => {
  // Emit event or navigate to payment details
  console.log('View payment:', payment);
};

const loadPayments = async () => {
  loading.value = true;
  try {
    const filters: any = {};
    if (props.customerId) {
      filters.customerId = props.customerId;
    }
    await paymentStore.fetchPayments(filters);
  } catch (error) {
    console.error('Error loading payments:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadPayments();
});
</script>

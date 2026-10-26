<template>
  <q-card style="min-width: 450px">
    <q-card-section>
      <div class="text-h6">Stock Adjustment</div>
      <div class="text-caption">{{ product.code }} — {{ product.description }}</div>
      <div class="text-caption">Available Stock: {{ product.availableStock }}</div>
    </q-card-section>

    <q-card-section>
      <q-form class="q-gutter-md">
        <q-btn-toggle
          v-model="form.type"
          spread
          no-caps
          toggle-color="primary"
          :options="[
            { label: 'Stock In', value: 'IN' },
            { label: 'Stock Out', value: 'OUT' }
          ]"
          outlined
          dense
        />

        <q-input
          v-model.number="form.quantity"
          label="Quantity *"
          type="number"
          min="1"
          outlined
          dense
          :rules="[
            (val: number) => (val !== null && val !== undefined && val > 0) || 'Quantity must be greater than 0'
          ]"
        />

        <q-select
          v-model="form.reason"
          label="Reason *"
          :options="reasonOptions"
          outlined
          dense
          emit-value
          map-options
          :rules="[(val: string) => !!val || 'Reason is required']"
        />

        <q-input
          v-if="form.reason === 'OTHER'"
          v-model="form.customReason"
          label="Custom Reason *"
          outlined
          dense
          :rules="[(val: string) => !!val?.trim() || 'Custom reason is required']"
        />

        <q-input
          v-model="form.notes"
          label="Notes"
          type="textarea"
          rows="2"
          outlined
          dense
        />

        <div v-if="stockError" class="text-negative text-caption">{{ stockError }}</div>
      </q-form>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat label="Cancel" @click="$emit('cancel')" />
      <q-btn label="Apply" color="primary" @click="onSubmit" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface ProductProp {
  _id: string;
  code: string;
  description: string;
  availableStock: number;
}

interface Props {
  product: ProductProp;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  save: [payload: { type: 'IN' | 'OUT'; quantity: number; reason: string; notes?: string }];
  cancel: [];
}>();

const reasonOptions = [
  { label: 'Damage', value: 'DAMAGE' },
  { label: 'Return', value: 'RETURN' },
  { label: 'Correction', value: 'CORRECTION' },
  { label: 'Transfer', value: 'TRANSFER' },
  { label: 'Initial Count', value: 'INITIAL_COUNT' },
  { label: 'Other', value: 'OTHER' },
];

const form = ref({
  type: 'IN' as 'IN' | 'OUT',
  quantity: null as number | null,
  reason: '' as string,
  customReason: '',
  notes: '',
});

const stockError = computed(() => {
  if (
    form.value.type === 'OUT' &&
    form.value.quantity !== null &&
    form.value.quantity > 0 &&
    form.value.quantity > props.product.availableStock
  ) {
    return `Stock out cannot exceed available stock (${props.product.availableStock})`;
  }
  return '';
});

const onSubmit = () => {
  const { type, quantity, reason, customReason, notes } = form.value;

  // Validate quantity
  if (quantity === null || quantity <= 0) return;

  // Validate reason
  if (!reason) return;
  if (reason === 'OTHER' && !customReason.trim()) return;

  // Validate stock-out does not exceed available
  if (type === 'OUT' && quantity > props.product.availableStock) return;

  const finalReason = reason === 'OTHER' ? customReason.trim() : reason;

  emit('save', {
    type,
    quantity,
    reason: finalReason,
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  });
};
</script>

<template>
  <div>
    <div class="text-subtitle2 q-mb-sm">Vendor Costs</div>
    <div
      v-for="(item, index) in localItems"
      :key="index"
      class="q-mb-sm"
    >
      <div class="row q-gutter-sm items-center">
        <q-select
          v-model="item.vendorId"
          :options="vendorOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          label="Vendor"
          outlined
          dense
          class="col"
          :rules="[val => !!val || 'Required']"
          @update:model-value="(val: string) => onVendorSelected(index, val)"
        />
        <q-input
          v-model.number="item.unitCost"
          label="Net Cost"
          type="number"
          outlined
          dense
          class="col-2"
          :min="0"
          step="0.01"
          prefix="P"
          :rules="[val => val >= 0 || 'Must be ≥ 0']"
          @update:model-value="emitUpdate"
        />
        <q-toggle
          v-model="item.isPreferred"
          label="Preferred"
          dense
          @update:model-value="emitUpdate"
        />
        <q-input
          v-model="item.notes"
          label="Notes"
          outlined
          dense
          class="col"
          @update:model-value="emitUpdate"
        />
        <q-btn
          flat
          round
          dense
          icon="delete"
          color="negative"
          @click="removeRow(index)"
        />
      </div>
      <!-- Discount info (read-only, from last DR) -->
      <div v-if="item.grossCost && (item.discount1 || item.discount2 || item.discount3 || item.discount4)" class="q-ml-md q-mt-xs text-caption" style="line-height:1.4">
        <span class="text-grey-7">Gross: P{{ (item.grossCost || 0).toFixed(2) }}</span>
        <span v-for="d in [1,2,3,4]" :key="d" class="q-ml-sm">
          <span v-if="item['discount'+d]" :class="item['discount'+d+'Mode'] === 'add' ? 'text-orange-8 text-weight-bold' : 'text-blue-8 text-weight-bold'">
            {{ item['discount'+d+'Mode'] === 'add' ? '+' : '−' }}{{ item['discount'+d] }}%
          </span>
        </span>
        <span class="q-ml-sm text-positive text-weight-bold">→ P{{ (item.netCost || item.unitCost || 0).toFixed(2) }}</span>
        <span v-if="item.lastPurchaseQty" class="q-ml-sm text-grey-6">(Last qty: {{ item.lastPurchaseQty }})</span>
      </div>
    </div>
    <q-btn
      flat
      color="primary"
      icon="add"
      label="Add Vendor Cost"
      @click="addRow"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useVendorStore } from '../stores/vendorStore';
import type { VendorCost } from '../db/database';

const props = defineProps<{
  modelValue: VendorCost[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: VendorCost[]];
}>();

const vendorStore = useVendorStore();

const vendorOptions = computed(() =>
  vendorStore.vendors.map(v => ({
    label: v.name,
    value: v._id!,
  }))
);

const localItems = ref<VendorCost[]>([]);

watch(
  () => props.modelValue,
  (val) => {
    localItems.value = val.map(item => ({ ...item }));
  },
  { immediate: true, deep: true }
);

function onVendorSelected(index: number, vendorId: string) {
  const vendor = vendorStore.vendors.find(v => v._id === vendorId);
  if (vendor) {
    localItems.value[index].vendorName = vendor.name;
  }
  emitUpdate();
}

function addRow() {
  localItems.value.push({
    vendorId: '',
    vendorName: '',
    unitCost: 0,
    isPreferred: false,
    lastUpdated: new Date().toISOString(),
  });
  emitUpdate();
}

function removeRow(index: number) {
  localItems.value.splice(index, 1);
  emitUpdate();
}

function emitUpdate() {
  emit('update:modelValue', localItems.value.map(item => ({ ...item })));
}
</script>

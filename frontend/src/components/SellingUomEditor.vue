<template>
  <div>
    <div class="text-subtitle2 q-mb-sm">Other UOMs & Retail Prices</div>
    <div
      v-for="(item, index) in localItems"
      :key="index"
      class="row q-gutter-sm q-mb-sm items-center"
    >
      <q-select
        v-model="item.uomId"
        :options="uomOptions"
        option-value="value"
        option-label="label"
        emit-value
        map-options
        label="UOM"
        outlined
        dense
        class="col"
        :rules="[val => !!val || 'Required']"
        @update:model-value="(val: string) => onUomSelected(index, val)"
      />
      <q-input
        v-model.number="item.conversionFactor"
        label="Conversion Factor"
        type="number"
        outlined
        dense
        class="col"
        :min="0.001"
        step="0.001"
        :rules="[val => val > 0 || 'Must be > 0']"
        @update:model-value="emitUpdate"
      />
      <q-input
        v-model.number="item.sellingPrice"
        label="Retail Price"
        type="number"
        outlined
        dense
        class="col"
        :min="0.01"
        step="0.01"
        prefix="P"
        :rules="[val => val > 0 || 'Must be > 0']"
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
    <q-btn
      flat
      color="primary"
      icon="add"
      label="Add Selling UOM"
      @click="addRow"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useUomStore } from '../stores/uomStore';
import type { SellingUom } from '../db/database';

const props = defineProps<{
  modelValue: SellingUom[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SellingUom[]];
}>();

const uomStore = useUomStore();

const uomOptions = computed(() =>
  uomStore.uoms.map(u => ({
    label: u.abbreviation,
    value: u._id!,
  }))
);

const localItems = ref<SellingUom[]>([]);

watch(
  () => props.modelValue,
  (val) => {
    localItems.value = val.map(item => ({ ...item }));
  },
  { immediate: true, deep: true }
);

function onUomSelected(index: number, uomId: string) {
  const uom = uomStore.uoms.find(u => u._id === uomId);
  if (uom) {
    localItems.value[index].uomAbbreviation = uom.abbreviation;
  }
  emitUpdate();
}

function addRow() {
  localItems.value.push({
    uomId: '',
    uomAbbreviation: '',
    conversionFactor: 1,
    sellingPrice: 0,
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

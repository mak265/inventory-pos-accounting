<template>
  <q-card :style="cardStyle" class="product-form-card" :class="{ 'product-form-minimized': isMinimized }">
    <q-card-section
      class="row items-center q-pb-none product-form-header"
      @mousedown="startDrag"
      @touchstart.passive="startDragTouch"
      @dblclick="toggleMinimize"
    >
      <div class="text-h6">{{ isEditMode ? 'Edit Product' : 'Add Product' }}</div>
      <q-space />
      <q-btn
        flat
        round
        dense
        :icon="isMinimized ? 'open_in_full' : 'remove'"
        @click.stop="toggleMinimize"
      >
        <q-tooltip>{{ isMinimized ? 'Restore' : 'Minimize' }}</q-tooltip>
      </q-btn>
      <q-btn flat round dense icon="close" @click.stop="$emit('cancelled')" />
    </q-card-section>
    <q-separator class="q-mt-sm" />
    <q-card-section v-show="!isMinimized" class="q-pt-md">
      <q-form @submit="onSubmit">
        <div class="row q-col-gutter-md">
          <!-- Left Column: Basic Info -->
          <div class="col-12 col-md-4">
            <div class="text-subtitle2 q-mb-sm">Basic Information</div>
            <q-input v-model="form.code" label="Product Code *" outlined dense class="q-mb-sm" :rules="[val => !!val || 'Required']" />
            <q-input v-model="form.description" label="Description *" outlined dense class="q-mb-sm" :rules="[val => !!val || 'Required']" />
            <q-select v-model="form.uomId" :options="uomOptions" option-value="value" option-label="label" emit-value map-options label="Base UOM" outlined dense clearable class="q-mb-sm" :hint="form.uom && !form.uomId ? 'Current: ' + form.uom : ''" @update:model-value="onBaseUomSelected" />
            <q-input v-model.number="form.availableStock" label="Available Stock" type="number" outlined dense class="q-mb-sm" :readonly="isEditMode" />
            <q-input v-model.number="form.minStock" label="Min Stock (Alert)" type="number" outlined dense class="q-mb-sm" min="0" hint="Alert when stock falls below" />
            <q-toggle v-model="form.isActive" label="Active" color="positive" class="q-mb-sm" />
          </div>

          <!-- Middle Column: Pricing -->
          <div class="col-12 col-md-4">
            <div class="text-subtitle2 q-mb-sm">Pricing</div>
            <q-input v-model.number="form.lastCost" label="Last Cost" type="number" outlined dense step="0.01" prefix="P" class="q-mb-sm" />
            <q-input v-model.number="form.averageCost" label="Average Cost" type="number" outlined dense step="0.01" prefix="P" class="q-mb-sm" :readonly="isEditMode" />
            <q-input v-model.number="form.sellingPrice" label="Selling Price" type="number" outlined dense step="0.01" prefix="P" class="q-mb-sm" />

            <q-separator class="q-my-sm" />
            <div class="text-subtitle2 q-mb-sm">Markup</div>
            <q-btn-toggle v-model="form.markupType" toggle-color="primary" :options="[{label:'%',value:'percentage'},{label:'P Fixed',value:'fixed'}]" class="q-mb-sm" spread no-caps unelevated dense />
            <q-input v-if="form.markupType === 'percentage'" v-model.number="form.markupPercentage" label="Markup %" type="number" outlined dense step="0.01" suffix="%" class="q-mb-sm" @update:model-value="applyCalculatedPrice" />
            <q-input v-if="form.markupType === 'fixed'" v-model.number="form.fixedMarkupAmount" label="Fixed Markup" type="number" outlined dense step="0.01" prefix="P" class="q-mb-sm" @update:model-value="applyCalculatedPrice" />
            <div v-if="calculatedPrice > 0" class="q-pa-sm bg-blue-1 rounded-borders q-mb-sm">
              <div><span class="text-caption">Calculated Selling Price:</span> <span class="text-weight-bold text-primary">P{{ calculatedPrice }}</span></div>
              <div v-if="priceBreakdown" class="text-caption">
                <div v-for="(line, index) in priceBreakdown" :key="index">{{ line }}</div>
              </div>
            </div>
          </div>

          <!-- Right Column: Selling UOMs & Vendor Costs -->
          <div class="col-12 col-md-4">
            <div class="text-subtitle2 q-mb-sm">Other UOMs & Retail Prices</div>
            <SellingUomEditor v-model="form.sellingUoms" />
            <q-separator class="q-my-sm" />
            <div class="text-subtitle2 q-mb-sm">Vendor Costs</div>
            <VendorCostEditor v-model="form.vendorCosts" />
          </div>
        </div>
      </q-form>
    </q-card-section>
    <q-separator v-show="!isMinimized" />
    <q-card-actions v-show="!isMinimized" align="right" class="q-pa-md">
      <q-btn flat label="Cancel" color="grey" @click="$emit('cancelled')" />
      <q-btn unelevated label="Save Product" color="primary" icon="save" @click="onSubmit" :loading="saving" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useProductStore } from '../stores/productStore';
import { useUomStore } from '../stores/uomStore';
import { useVendorStore } from '../stores/vendorStore';
import { Notify } from 'quasar';
import SellingUomEditor from './SellingUomEditor.vue';
import VendorCostEditor from './VendorCostEditor.vue';
import type { SellingUom, VendorCost } from '../db/database';

interface Props { product?: any; }
const props = defineProps<Props>();
const emit = defineEmits(['saved', 'cancelled']);

const productStore = useProductStore();
const uomStore = useUomStore();
const vendorStore = useVendorStore();
const saving = ref(false);
const isMinimized = ref(false);
const dragPosition = ref({ x: 0, y: 0 });

const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const cardStyle = computed(() => {
  if (isMinimized.value) {
    return {
      width: '360px',
      maxWidth: '92vw',
      transform: `translate(${dragPosition.value.x}px, ${dragPosition.value.y}px)`,
      transition: isDragging.value ? 'none' : 'transform 120ms ease, width 120ms ease'
    };
  }

  return {
    width: '95vw',
    maxWidth: '1100px',
    transform: `translate(${dragPosition.value.x}px, ${dragPosition.value.y}px)`,
    transition: isDragging.value ? 'none' : 'transform 120ms ease, width 120ms ease'
  };
});

const form = ref({
  code: '', description: '', uom: '', uomId: undefined as string | undefined,
  availableStock: 0, minStock: 0, isActive: true,
  lastCost: undefined as number | undefined, averageCost: undefined as number | undefined,
  sellingPrice: undefined as number | undefined,
  markupType: 'percentage' as 'percentage' | 'fixed',
  markupPercentage: undefined as number | undefined, fixedMarkupAmount: undefined as number | undefined,
  sellingUoms: [] as SellingUom[], vendorCosts: [] as VendorCost[],
});

const isEditMode = computed(() => !!props.product?._id);
const uomOptions = computed(() => uomStore.uoms.map(u => ({ label: `${u.abbreviation} — ${u.name}`, value: u._id! })));

function onBaseUomSelected(uomId: string) {
  const uom = uomStore.uoms.find(u => u._id === uomId);
  if (uom) form.value.uom = uom.abbreviation;
}

const calculatedPrice = computed(() => {
  const baseCost = form.value.lastCost || form.value.averageCost || 0;
  if (baseCost === 0) return 0;
  if (form.value.markupType === 'percentage' && form.value.markupPercentage && form.value.markupPercentage > 0)
    return Math.round(baseCost * (1 + form.value.markupPercentage / 100));
  if (form.value.markupType === 'fixed' && form.value.fixedMarkupAmount && form.value.fixedMarkupAmount > 0)
    return Math.round(baseCost + form.value.fixedMarkupAmount);
  return baseCost;
});

const priceBreakdown = computed(() => {
  const baseCost = form.value.lastCost || form.value.averageCost || 0;
  if (baseCost === 0) return null;
  const b: string[] = [`Base: P${baseCost.toFixed(2)}`];
  if (form.value.markupType === 'percentage' && form.value.markupPercentage && form.value.markupPercentage > 0)
    b.push(`+${form.value.markupPercentage}% = P${(baseCost * (1 + form.value.markupPercentage / 100)).toFixed(2)}`);
  else if (form.value.markupType === 'fixed' && form.value.fixedMarkupAmount && form.value.fixedMarkupAmount > 0)
    b.push(`+P${form.value.fixedMarkupAmount.toFixed(2)} = P${(baseCost + form.value.fixedMarkupAmount).toFixed(2)}`);
  return b;
});

const applyCalculatedPrice = () => { if (calculatedPrice.value > 0) form.value.sellingPrice = calculatedPrice.value; };

const clampDragPosition = (x: number, y: number) => {
  const maxX = Math.max(0, Math.floor(window.innerWidth * 0.35));
  const maxY = Math.max(0, Math.floor(window.innerHeight * 0.35));
  return {
    x: Math.min(Math.max(x, -maxX), maxX),
    y: Math.min(Math.max(y, -maxY), maxY)
  };
};

const startDrag = (event: MouseEvent) => {
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX - dragPosition.value.x,
    y: event.clientY - dragPosition.value.y
  };
};

const startDragTouch = (event: TouchEvent) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  isDragging.value = true;
  dragStart.value = {
    x: touch.clientX - dragPosition.value.x,
    y: touch.clientY - dragPosition.value.y
  };
};

const moveDrag = (clientX: number, clientY: number) => {
  if (!isDragging.value) return;
  const next = clampDragPosition(clientX - dragStart.value.x, clientY - dragStart.value.y);
  dragPosition.value = next;
};

const onMouseMove = (event: MouseEvent) => moveDrag(event.clientX, event.clientY);

const onTouchMove = (event: TouchEvent) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  moveDrag(touch.clientX, touch.clientY);
};

const stopDrag = () => {
  isDragging.value = false;
};

const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value;
  if (isMinimized.value) {
    dragPosition.value = clampDragPosition(dragPosition.value.x + 240, dragPosition.value.y + 220);
  }
};

// Auto-apply markup to selling price whenever markup changes
watch(calculatedPrice, (newPrice) => {
  if (newPrice > 0) form.value.sellingPrice = newPrice;
});

const onSubmit = async () => {
  if (!form.value.code || !form.value.description) return;
  if (!form.value.uom && form.value.uomId) {
    const match = uomStore.uoms.find(u => u._id === form.value.uomId);
    if (match) form.value.uom = match.abbreviation;
  }
  if (!form.value.uom) form.value.uom = 'PC';
  saving.value = true;
  try {
    if (isEditMode.value) await productStore.updateProduct(props.product._id, form.value);
    else await productStore.createProduct(form.value);
    emit('saved');
  } catch (error: any) {
    const msg = error?.response?.data?.error || error?.response?.data?.details?.[0]?.message || error?.message || 'Failed to save';
    Notify.create({ type: 'negative', message: msg });
  } finally { saving.value = false; }
};

onMounted(async () => {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', stopDrag);

  await Promise.all([uomStore.fetchUoms(), vendorStore.fetchVendors()]);
  if (props.product) {
    form.value = {
      code: props.product.code || '', description: props.product.description || '',
      uom: props.product.uom || '', uomId: props.product.uomId,
      availableStock: props.product.availableStock || 0, minStock: props.product.minStock || 0,
      isActive: props.product.isActive !== false,
      lastCost: props.product.lastCost, averageCost: props.product.averageCost,
      sellingPrice: props.product.sellingPrice,
      markupType: props.product.markupType || 'percentage',
      markupPercentage: props.product.markupPercentage, fixedMarkupAmount: props.product.fixedMarkupAmount,
      sellingUoms: props.product.sellingUoms || [], vendorCosts: props.product.vendorCosts || [],
    };
    if (!form.value.uomId && form.value.uom) {
      const match = uomStore.uoms.find(u => u.abbreviation === form.value.uom);
      if (match) form.value.uomId = match._id;
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', stopDrag);
});
</script>

<style scoped>
.product-form-card {
  position: relative;
}

.product-form-header {
  cursor: move;
  user-select: none;
}

.product-form-minimized .product-form-header {
  padding-bottom: 8px;
}
</style>

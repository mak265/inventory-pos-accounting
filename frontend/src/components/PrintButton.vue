<template>
  <q-btn
    :label="label"
    :color="color"
    :outline="outline"
    icon="print"
    class="print-hide"
    @click="handlePrint"
  >
    <q-tooltip>{{ tooltip }} (Ctrl+P)</q-tooltip>
  </q-btn>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

interface Props {
  label?: string;
  color?: string;
  outline?: boolean;
  tooltip?: string;
}

withDefaults(defineProps<Props>(), {
  label: 'Print',
  color: 'secondary',
  outline: true,
  tooltip: 'Print Report',
});

const handlePrint = () => {
  window.print();
};

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
    event.preventDefault();
    handlePrint();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

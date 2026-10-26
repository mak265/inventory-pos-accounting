<template>
  <div class="print-layout">
    <!-- Print header: visible only in print -->
    <div class="print-header" style="display: none">
      <img v-if="settingsStore.logoUrl" :src="logoFullUrl" alt="Logo" style="max-height: 48px; max-width: 150px" class="print-header__logo" />
      <div class="print-header__company">{{ settingsStore.companyName }}</div>
      <div v-if="settingsStore.tagline" class="print-header__tagline">{{ settingsStore.tagline }}</div>
      <h1 class="print-header__title">{{ title }}</h1>
      <div class="print-header__date">Generated: {{ generationDate }}</div>
    </div>

    <!-- Report content -->
    <slot />

    <!-- Print footer: visible only in print, fixed to bottom -->
    <div class="print-footer" style="display: none">
      Page <span class="print-page-number"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../stores/settingsStore';

interface Props {
  title: string;
}

const props = defineProps<Props>();
const settingsStore = useSettingsStore();

const logoFullUrl = computed(() => {
  const url = settingsStore.logoUrl;
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const baseUrl = (process.env.VUE_APP_API_URL || '/api').replace(/\/api\/?$/, '');
  return `${baseUrl}${url}`;
});

const generationDate = computed(() => {
  return new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});
</script>

<style scoped>
/* Screen: hide print-only elements */
.print-header,
.print-footer {
  display: none;
}

@media print {
  @page {
    size: A4 portrait;
  }

  .print-header {
    display: block !important;
  }

  .print-footer {
    display: block !important;
  }
}
</style>

<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from './stores/settingsStore';
import { useUiStore } from './stores/uiStore';

const settingsStore = useSettingsStore();
const uiStore = useUiStore();

onMounted(() => {
  settingsStore.fetchSettings();
  uiStore.initTheme();
});
</script>

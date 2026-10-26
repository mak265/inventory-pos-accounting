import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../boot/axios';

export const useSettingsStore = defineStore('settings', () => {
  // State
  const companyName = ref<string>('Inventory & POS System');
  const logoUrl = ref<string>('');
  const tagline = ref<string>('');
  const loading = ref<boolean>(false);

  // Actions
  async function fetchSettings() {
    loading.value = true;
    try {
      const response = await api.get('/settings');
      companyName.value = response.data.companyName ?? 'Inventory & POS System';
      logoUrl.value = response.data.logoUrl ?? '';
      tagline.value = response.data.tagline ?? '';
    } catch (error: unknown) {
      // Silently catch 401 errors so the login page can still show branding
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status !== 401) {
        throw error;
      }
    } finally {
      loading.value = false;
    }
  }

  async function updateBranding(data: { companyName?: string; tagline?: string }) {
    loading.value = true;
    try {
      const response = await api.put('/settings', data);
      companyName.value = response.data.companyName ?? companyName.value;
      tagline.value = response.data.tagline ?? tagline.value;
    } finally {
      loading.value = false;
    }
  }

  async function uploadLogo(file: File) {
    loading.value = true;
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await api.post('/settings/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      logoUrl.value = response.data.logoUrl ?? logoUrl.value;
    } finally {
      loading.value = false;
    }
  }

  return {
    // State
    companyName,
    logoUrl,
    tagline,
    loading,

    // Actions
    fetchSettings,
    updateBranding,
    uploadLogo,
  };
});

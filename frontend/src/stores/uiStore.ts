import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Dark } from 'quasar';

export interface AppNotification {
  id: string;
  message: string;
  type: 'positive' | 'negative' | 'warning' | 'info';
  timeout?: number;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  requiresAdminPassword?: boolean;
  onConfirm?: (adminPassword?: string) => void | Promise<void>;
  onCancel?: () => void;
}

export const useUiStore = defineStore('ui', () => {
  // State
  const isLoading = ref(false);
  const loadingMessage = ref('');
  const sidebarOpen = ref(true);
  const darkMode = ref(false);
  const notifications = ref<AppNotification[]>([]);
  const confirmDialog = ref<ConfirmDialogOptions | null>(null);
  const confirmDialogVisible = ref(false);

  // Computed
  const hasNotifications = computed(() => notifications.value.length > 0);

  // Actions
  function setLoading(loading: boolean, message = '') {
    isLoading.value = loading;
    loadingMessage.value = message;
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
  }

  function setSidebarOpen(open: boolean) {
    sidebarOpen.value = open;
  }

  function toggleDarkMode() {
    darkMode.value = !darkMode.value;
    Dark.set(darkMode.value);
    localStorage.setItem('theme_preference', darkMode.value ? 'dark' : 'light');
  }

  function initTheme() {
    const preference = localStorage.getItem('theme_preference');
    if (preference === 'dark') {
      darkMode.value = true;
      Dark.set(true);
    } else {
      darkMode.value = false;
      Dark.set(false);
    }
  }

  function addNotification(notification: Omit<AppNotification, 'id'>) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    notifications.value.push({ ...notification, id });

    // Auto-remove after timeout
    const timeout = notification.timeout ?? 5000;
    if (timeout > 0) {
      setTimeout(() => removeNotification(id), timeout);
    }
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  function clearNotifications() {
    notifications.value = [];
  }

  function showConfirmDialog(options: ConfirmDialogOptions) {
    confirmDialog.value = options;
    confirmDialogVisible.value = true;
  }

  function hideConfirmDialog() {
    confirmDialogVisible.value = false;
    confirmDialog.value = null;
  }

  function notify(message: string, type: AppNotification['type'] = 'info') {
    addNotification({ message, type });
  }

  return {
    // State
    isLoading,
    loadingMessage,
    sidebarOpen,
    darkMode,
    notifications,
    confirmDialog,
    confirmDialogVisible,

    // Computed
    hasNotifications,

    // Actions
    setLoading,
    toggleSidebar,
    setSidebarOpen,
    toggleDarkMode,
    initTheme,
    addNotification,
    removeNotification,
    clearNotifications,
    showConfirmDialog,
    hideConfirmDialog,
    notify,
  };
});

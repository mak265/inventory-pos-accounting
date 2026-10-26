import { boot } from 'quasar/wrappers';
import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { handleApiError, showWarning } from '../services/errorHandler';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const baseUrl = import.meta.env.VITE_API_URL || '';
const api = axios.create({
  baseURL: `${baseUrl}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function clearAuthAndGoLogin(reason?: string) {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  localStorage.removeItem('auth_roles');
  const cur = String(window.location.hash || '').toLowerCase();
  if (!cur.includes('/login')) {
    setTimeout(() => { window.location.hash = '#/login'; }, 0);
  }
  if (reason) {
    try {
      showWarning(`Session cleared: ${reason}. Please login again.`);
    } catch { /* ignore */ }
  }
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearAuthAndGoLogin('token expired or invalid');
    } else if (!error.response && !navigator.onLine) {
      showWarning('You are offline. Changes will sync when connection is restored.');
    } else {
      handleApiError(error as AxiosError<{ message?: string }>);
    }
    return Promise.reject(error);
  },
);

const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  if (response.status === 401) {
    clearAuthAndGoLogin('HTTP 401 auth failed');
  }
  return response;
};

export default boot(({ app }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };

import { Notify } from 'quasar';
import type { AxiosError } from 'axios';

interface ApiErrorResponse {
  message?: string;
  errors?: Record<string, string[]>;
  error?: string;
}

/**
 * Display a user-friendly error notification
 */
export function showError(message: string) {
  Notify.create({
    type: 'negative',
    message,
    position: 'top-right',
    timeout: 5000,
    actions: [{ icon: 'close', color: 'white', round: true }],
  });
}

/**
 * Display a success notification
 */
export function showSuccess(message: string) {
  Notify.create({
    type: 'positive',
    message,
    position: 'top-right',
    timeout: 3000,
  });
}

/**
 * Display a warning notification
 */
export function showWarning(message: string) {
  Notify.create({
    type: 'warning',
    message,
    position: 'top-right',
    timeout: 4000,
    textColor: 'dark',
  });
}

/**
 * Handle Axios API errors and display appropriate messages
 */
export function handleApiError(error: AxiosError<ApiErrorResponse>): string {
  // Network error (offline, DNS failure, etc.)
  if (!error.response) {
    const message = navigator.onLine
      ? 'Unable to reach the server. Please try again.'
      : 'You are offline. Changes will sync when connection is restored.';
    showError(message);
    logError('Network Error', error);
    return message;
  }

  const status = error.response.status;
  const data = error.response.data;
  let message: string;

  switch (status) {
    case 400:
      message = data?.error || data?.message || 'Invalid request. Please check your input.';
      break;
    case 401:
      message = 'Session expired. Please log in again.';
      break;
    case 403:
      message = data?.error || data?.message || 'You do not have permission for this action.';
      break;
    case 404:
      message = data?.error || data?.message || 'The requested resource was not found.';
      break;
    case 409:
      message = data?.error || data?.message || 'A conflict occurred. Please refresh and try again.';
      break;
    case 422:
      message = data?.error || data?.message || 'Validation failed. Please check your input.';
      break;
    case 500:
      message = data?.error || data?.message || 'An unexpected server error occurred. Please try again later.';
      break;
    default:
      message = data?.error || data?.message || `An error occurred (${status}).`;
  }

  showError(message);
  logError(`API Error ${status}`, error);
  return message;
}

/**
 * Extract a readable error message from any error (Axios, generic, string)
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  const e = error as any;
  // Axios error with response
  if (e.response?.data) {
    const d = e.response.data;
    return d.error || d.message || d.msg || JSON.stringify(d);
  }
  // Regular Error
  if (e.message) return e.message;
  return String(error);
}

/**
 * Log errors for debugging purposes
 */
export function logError(context: string, error: unknown) {
  console.error(`[${context}]`, error);
}

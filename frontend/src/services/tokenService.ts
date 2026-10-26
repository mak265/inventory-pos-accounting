/**
 * Token Service — handles automatic token refresh for sync operations.
 * 
 * Ensures that sync operations don't fail due to expired tokens by:
 * 1. Proactively refreshing tokens before they expire
 * 2. Re-authenticating using cached credentials when tokens are fully expired
 * 3. Providing a valid token getter for all API calls
 */

const API_URL = (import.meta.env.VITE_API_URL || '') + '/api';

/**
 * Attempts to refresh the auth token. Tries multiple strategies:
 * 1. Use current token to get a fresh one (if still valid or recently expired)
 * 2. Use cached credentials to re-authenticate
 * 
 * Returns the new token or null if refresh failed.
 */
export async function refreshAuthToken(): Promise<string | null> {
  const currentToken = localStorage.getItem('auth_token');

  // Strategy 1: Refresh using current token
  if (currentToken) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('auth_token', data.token);
        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify(data.user));
        }
        return data.token;
      }
    } catch {
      // Network error or timeout — try next strategy
    }
  }

  // Strategy 2: Re-authenticate using cached credentials
  try {
    const cachedUsers = JSON.parse(localStorage.getItem('cached_users') || '{}');
    const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
    const username = authUser.username;

    if (username && cachedUsers[username]) {
      const cached = cachedUsers[username];
      // Decode the cached password (stored as btoa)
      const password = atob(cached.passwordHash);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('auth_token', data.token);
        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify(data.user));
        }
        // Update cached token
        cachedUsers[username].token = data.token;
        localStorage.setItem('cached_users', JSON.stringify(cachedUsers));
        return data.token;
      }
    }
  } catch {
    // Re-auth failed — token cannot be refreshed
  }

  return null;
}

/**
 * Gets a valid auth token, refreshing if necessary.
 * Call this before making API requests during sync.
 */
export async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;

  // Check if token looks expired (decode JWT payload without verification)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp) {
      const expiresAt = payload.exp * 1000; // Convert to ms
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      // If token expires within 5 minutes, refresh proactively
      if (expiresAt - now < fiveMinutes) {
        const newToken = await refreshAuthToken();
        return newToken || token; // Fall back to current token if refresh fails
      }
    }
  } catch {
    // Token decode failed — use as-is and let the server decide
  }

  return token;
}

/**
 * Handles a 401 response during sync by attempting token refresh.
 * Returns true if token was successfully refreshed (caller should retry).
 * Returns false if refresh failed (caller should queue for later).
 */
export async function handleSyncAuthError(): Promise<boolean> {
  const newToken = await refreshAuthToken();
  return newToken !== null;
}

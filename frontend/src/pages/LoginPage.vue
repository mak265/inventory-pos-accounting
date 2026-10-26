<template>
  <q-layout>
    <q-page-container>
      <q-page class="login-page">
        <div class="login-container">
          <!-- Left branding panel -->
          <div class="login-brand hide-on-mobile">
            <div class="brand-content">
              <q-icon name="storefront" size="48px" color="white" />
              <h2>{{ settingsStore.companyName }}</h2>
              <p>Inventory &amp; Point of Sale System</p>
            </div>
          </div>

          <!-- Right form panel -->
          <div class="login-form-panel">
            <div class="login-form-inner">
              <!-- ====================================== BUILD VERSION STAMP ====================================== -->
              <!-- Visually confirms user opened the correct install version BEFORE they even type credentials -->
              <div class="text-center q-mb-md" style="padding: 10px 12px; border-radius: 10px; background: linear-gradient(135deg, #ede9fe, #ddd6fe); border: 1px solid #c4b5fd;">
                <div style="font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #5b21b6;">
                  Aberin POS Build
                  <span v-if="!runtimeDiag" style="color:#4338ca;">v{{ buildVersion }}</span>
                  <span v-else-if="runtimeBackendOk" style="color:#166534;">v{{ buildVersion }} ✅</span>
                  <span v-else style="color:#b91c1c;">v{{ buildVersion }} ⚠️ BACKEND MISMATCH</span>
                </div>
                <div v-if="runtimeDiag" class="text-caption q-mt-xs" style="color:#334155;">
                  Backend:
                  <span v-if="runtimeDiag.build?.desktop" style="font-weight:700">
                    v{{ runtimeDiag.build.desktop }} ({{ runtimeDiag.env?.DB_MODE || '?' }})
                  </span>
                  <span v-else style="color:#b91c1c; font-weight:700">NOT MATCHING</span>
                </div>
                <div v-if="runtimeDiag && !runtimeBackendOk" class="text-caption q-mt-sm" style="color:#b91c1c; font-weight:600;">
                  WARNING: Backend running is v{{ runtimeDiag.build?.desktop || 'OLD UNSTAMPED' }}.
                  Reboot your PC then uninstall ALL old Aberin POS versions to clean up.
                </div>
                <div class="text-caption q-mt-xs" style="color:#475569;">
                  Click: <a href="http://localhost:3000/_runtime_diag" target="_blank" style="color:#4f46e5; text-decoration:none;">Verify backend paths</a>
                </div>
              </div>
              <!-- =================================== END BUILD VERSION STAMP ==================================== -->

              <div class="text-center q-mb-lg">
                <div class="mobile-brand hide-on-desktop q-mb-md">
                  <q-icon name="storefront" size="40px" color="deep-purple" />
                </div>
                <h4 class="q-my-none" style="font-weight: 700; color: var(--text-primary)">Welcome back</h4>
                <p style="color: var(--text-secondary); margin-top: 4px">Sign in to your account</p>
              </div>

              <q-form @submit.prevent="onLogin" class="q-gutter-md">
                <div>
                  <label class="field-label">Username</label>
                  <q-input
                    v-model="username"
                    outlined
                    dense
                    placeholder="Enter your username"
                    :rules="[(v: string) => !!v || 'Username is required']"
                    autofocus
                  >
                    <template #prepend>
                      <q-icon name="person_outline" size="20px" color="grey-5" />
                    </template>
                  </q-input>
                </div>

                <div>
                  <label class="field-label">Password</label>
                  <q-input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    outlined
                    dense
                    placeholder="Enter your password"
                    :rules="[(v: string) => !!v || 'Password is required']"
                  >
                    <template #prepend>
                      <q-icon name="lock_outline" size="20px" color="grey-5" />
                    </template>
                    <template #append>
                      <q-icon
                        :name="showPassword ? 'visibility_off' : 'visibility'"
                        class="cursor-pointer"
                        size="20px"
                        color="grey-5"
                        @click="showPassword = !showPassword"
                      />
                    </template>
                  </q-input>
                </div>

                <q-btn
                  type="submit"
                  label="Sign In"
                  color="deep-purple"
                  class="full-width q-mt-md"
                  :loading="loading"
                  unelevated
                  no-caps
                  size="md"
                  style="height: 44px; font-weight: 600; border-radius: 10px"
                />

                <div v-if="errorMsg" class="text-negative text-center text-caption q-mt-sm">
                  {{ errorMsg }}
                </div>
              </q-form>
            </div>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '../stores/settingsStore';
import { DESKTOP_BUILD_VERSION } from '../boot/fullSync';

const router = useRouter();
const settingsStore = useSettingsStore();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const errorMsg = ref('');
const buildVersion = DESKTOP_BUILD_VERSION;
const runtimeDiag = ref<any>(null);
const runtimeBackendOk = computed(() => {
  if (!runtimeDiag.value) return false;
  const be = String(runtimeDiag.value?.build?.desktop || '');
  return be === buildVersion && runtimeDiag.value?.routes?.cloudProxyMounted === true;
});

onMounted(async () => {
  settingsStore.fetchSettings();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('/_runtime_diag', { method: 'GET', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) runtimeDiag.value = await res.json();
    console.log('[LoginPage:_runtime_diag] status=' + res.status + ' ok=' + res.ok, runtimeDiag.value);
  } catch (e) { console.warn('[LoginPage:_runtime_diag] fetch failed:', e); }
});

async function onLogin() {
  loading.value = true;
  errorMsg.value = '';
  let loginSucceededOnline = false;
  try {
    const { api } = await import('../boot/axios');
    const response = await api.post('/auth/login', {
      username: username.value,
      password: password.value,
    });
    const { token, user } = response.data;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    // Cache credentials for offline login
    const cachedUsers = JSON.parse(localStorage.getItem('cached_users') || '{}');
    cachedUsers[username.value] = { passwordHash: btoa(password.value), user, token };
    localStorage.setItem('cached_users', JSON.stringify(cachedUsers));
    loginSucceededOnline = true;
  } catch (err: unknown) {
    // Try offline login if network fails
    if (!navigator.onLine || (err as any)?.code === 'ERR_NETWORK') {
      const cachedUsers = JSON.parse(localStorage.getItem('cached_users') || '{}');
      const cached = cachedUsers[username.value];
      if (cached && btoa(password.value) === cached.passwordHash) {
        localStorage.setItem('auth_token', cached.token);
        localStorage.setItem('auth_user', JSON.stringify(cached.user));
        router.push({ name: 'dashboard' });
        return;
      }
    }
    const axiosErr = err as { response?: { data?: { message?: string } } };
    errorMsg.value = axiosErr?.response?.data?.message || (!navigator.onLine ? 'Offline — login with previously used credentials' : 'Login failed. Please try again.');
    loading.value = false;
    return;
  } finally {
    // loading cleared in both branches above
  }

  // After successful ONLINE login, trigger a full cloud pull to seed/update local SQLite
  // before navigating to dashboard. Keep it best-effort — never block login.
  // NOTE: session debounce removed — EVERY login success runs full cloud pull, always.
  let pullMessage: string | null = null;
  try {
    const { runFullPull } = await import('../boot/fullSync');
    const res = await runFullPull(loginSucceededOnline);
    pullMessage = res?.message || null;
  } catch { /* ignore */ }

  router.push({ name: 'dashboard' });

  if (pullMessage) {
    try {
      const { Notify } = await import('quasar');
      Notify.create({
        type: pullMessage.includes('Synced') ? 'positive' : 'info',
        message: pullMessage,
        icon: pullMessage.includes('Synced') ? 'cloud_done' : 'info',
        timeout: 7000,
        textColor: 'dark',
      });
    } catch { /* ignore */ }
  }
  loading.value = false;
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
}

.login-container {
  display: flex;
  width: 100%;
  min-height: 100vh;
}

.login-brand {
  flex: 0 0 420px;
  background: linear-gradient(135deg, #1a1f36 0%, #6c5ce7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;

  .brand-content {
    text-align: center;
    color: #fff;

    h2 {
      font-size: 1.8rem;
      font-weight: 700;
      margin: 16px 0 8px;
    }

    p {
      opacity: 0.7;
      font-size: 1rem;
    }
  }
}

.login-form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #f4f5f7;
}

.login-form-inner {
  width: 100%;
  max-width: 380px;
}

.field-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  display: block;
}
</style>

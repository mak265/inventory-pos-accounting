import { boot } from 'quasar/wrappers';
import { Loading, Notify } from 'quasar';

export const DESKTOP_BUILD_VERSION = '2.0.14';
const CLOUD_URL = import.meta.env.VITE_CLOUD_URL || '';
const LOCAL_API_URL = import.meta.env.VITE_API_URL || '';
const LS_LAST_PULL_AT = 'last_full_pull_at';
const LS_LAST_PULL_STATUS = 'last_full_pull_status';
const WATCHDOG_TIMEOUT_MS = 25000;

// #region debug-point A:web-runtime
const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event';
const DEBUG_SESSION_ID = 'web-proxy-404';
const reportDebug = (hypothesisId: string, location: string, msg: string, data: Record<string, unknown> = {}) =>
  fetch(DEBUG_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: 'post-fix', hypothesisId, location, msg, data, ts: Date.now() }),
  }).catch(() => {});
// #endregion

console.log(`[fullSync:init] VITE_API_URL="${LOCAL_API_URL}" VITE_CLOUD_URL="${CLOUD_URL}"`);
// #region debug-point A:web-runtime-init
reportDebug('A', 'frontend/src/boot/fullSync.ts:init', '[DEBUG] fullSync init observed in runtime', {
  href: typeof window !== 'undefined' ? window.location.href : null,
  origin: typeof window !== 'undefined' ? window.location.origin : null,
  apiUrl: LOCAL_API_URL,
  cloudUrl: CLOUD_URL,
  hasElectronMarker: typeof window !== 'undefined' ? !!(window as any)?.process?.versions?.electron : false,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
});
// #endregion

function attachBearerHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function cloudViaProxy(subPath: string): string {
  const cleaned = subPath.startsWith('/') ? subPath.slice(1) : subPath;
  const url = `${LOCAL_API_URL}/api/_cloud_proxy/${cleaned}`;
  console.log(`[fullSync:cloudUrl] → ${url}`);
  return url;
}

export type FullPullResult = {
  ok: boolean;
  stage: string;
  message: string;
  counts?: Record<string, number>;
  totalApplied?: number;
};

async function probeOnlineViaProxy(): Promise<{ online: boolean; lastError?: string }> {
  console.log('[fullSync:probe] Step 1: _diag router mount check');
  try {
    const diagCtrl = new AbortController();
    const dt = setTimeout(() => diagCtrl.abort(), 4000);
    const diagUrl = `${LOCAL_API_URL}/api/_cloud_proxy/_diag`;
    console.log(`[fullSync:probe] → GET ${diagUrl}`);
    // #region debug-point B:diag-url
    reportDebug('B', 'frontend/src/boot/fullSync.ts:probe-diag-url', '[DEBUG] requesting proxy diag endpoint', {
      diagUrl,
      apiUrl: LOCAL_API_URL,
      href: typeof window !== 'undefined' ? window.location.href : null,
    });
    // #endregion
    const diag = await fetch(diagUrl, {
      method: 'GET', signal: diagCtrl.signal, cache: 'no-store',
    });
    clearTimeout(dt);
    console.log(`[fullSync:probe] _diag status=${diag.status} ok=${diag.ok}`);
    if (diag.status === 404) {
      return { online: false, lastError: 'proxy router NOT installed in backend! (404 _diag) — stale packaged build dist' };
    }
    if (diag.status === 403) {
      let body = '';
      try { body = JSON.stringify(await diag.json()); } catch { /* ignore */ }
      return { online: false, lastError: `proxy DB_MODE guard active (403). env DB_MODE != sqlite. body=${body.substring(0, 120)}` };
    }
    if (!diag.ok) {
      return { online: false, lastError: `proxy router _diag HTTP ${diag.status}` };
    }
    try {
      const d = await diag.json();
      console.log('[fullSync:probe] _diag payload:', JSON.stringify(d));
      // #region debug-point C:diag-payload
      reportDebug('C', 'frontend/src/boot/fullSync.ts:probe-diag-payload', '[DEBUG] proxy diag payload received', {
        status: diag.status,
        ok: diag.ok,
        payload: d,
      });
      if (!d?.cloudUrl) {
        return { online: false, lastError: 'Cloud endpoint is not configured.' };
      }
      // #endregion
    } catch { /* ignore */ }
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'proxy _diag timeout' : (e?.message || String(e));
    console.error(`[fullSync:probe] _diag fetch EXCEPTION: ${msg}`);
    return { online: false, lastError: 'proxy _diag fetch: ' + msg };
  }

  console.log('[fullSync:probe] Step 2: actual cloud /health via localhost proxy');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const url = cloudViaProxy('/health');
    console.log(`[fullSync:probe] → GET ${url}`);
    // #region debug-point C:proxy-health-url
    reportDebug('C', 'frontend/src/boot/fullSync.ts:probe-health-url', '[DEBUG] requesting proxy health endpoint', {
      url,
      apiUrl: LOCAL_API_URL,
      cloudUrl: CLOUD_URL,
    });
    // #endregion
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    console.log(`[fullSync:probe] cloud health status=${res.status} ok=${res.ok}`);
    // #region debug-point C:proxy-health-response
    reportDebug('C', 'frontend/src/boot/fullSync.ts:probe-health-response', '[DEBUG] proxy health response received', {
      status: res.status,
      ok: res.ok,
      url,
    });
    // #endregion
    if (res.ok) return { online: true };
    try {
      const d = (await res.json()) as any;
      const msg = d?.code ? `${d.code} ${d.message}` : d?.error || `proxy HTTP ${res.status}`;
      console.error(`[fullSync:probe] cloud health NOK detail=${msg}`);
      return { online: false, lastError: msg };
    } catch {
      return { online: false, lastError: `proxy HTTP ${res.status}` };
    }
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'proxy timeout' : (e?.message || String(e));
    console.error(`[fullSync:probe] cloud proxy fetch EXCEPTION: ${msg}`);
    return { online: false, lastError: 'proxy fetch: ' + msg };
  }
}

export async function runFullPull(showUI = true): Promise<FullPullResult> {
  let stage = 'Preparing';
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let loadingHidden = false;
  const ensureHide = () => {
    if (!loadingHidden && showUI) { try { Loading.hide(); } catch { /* ignore */ } loadingHidden = true; }
  };

  try {
    console.log(`[fullSync:run] START showUI=${showUI} (session debounce REMOVED: every open = attempt full cloud pull)`);
    // #region debug-point A:run-start
    reportDebug('A', 'frontend/src/boot/fullSync.ts:run-start', '[DEBUG] runFullPull started', {
      showUI,
      href: typeof window !== 'undefined' ? window.location.href : null,
      origin: typeof window !== 'undefined' ? window.location.origin : null,
      apiUrl: LOCAL_API_URL,
      cloudUrl: CLOUD_URL,
    });
    // #endregion

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      console.log('[fullSync:run] navigator.onLine === false → offline skip');
      localStorage.setItem(LS_LAST_PULL_AT, String(Date.now()));
      localStorage.setItem(LS_LAST_PULL_STATUS, 'OFFLINE');
      return { ok: false, stage: 'Connectivity', message: 'No internet detected (navigator offline). Using existing local data — all POS functions work offline.' };
    }

    console.log('[fullSync:run] Step: local backend reachable? HEAD /api/health');
    try {
      const localCtrl = new AbortController();
      const lt = setTimeout(() => localCtrl.abort(), 3500);
      const lres = await fetch(`${LOCAL_API_URL}/api/health`, { method: 'HEAD', signal: localCtrl.signal, cache: 'no-store' });
      clearTimeout(lt);
      console.log(`[fullSync:run] local backend status=${lres.status} ok=${lres.ok}`);
      if (!lres.ok) {
        return { ok: false, stage: 'Local Server', message: 'Local backend not ready yet. Cloud pull skipped — try again from Settings → Pull now button in a few seconds.' };
      }
    } catch (e: any) {
      console.error(`[fullSync:run] local backend reach EXCEPTION: ${e?.message || e}`);
      return { ok: false, stage: 'Local Server', message: 'Local backend not reachable. Cloud pull skipped — reopen the app.' };
    }

    if (showUI) {
      console.log('[fullSync:run] Loading.show("Fetching all data from cloud…")');
      Loading.show({
        message: 'Fetching all data from cloud…',
        spinnerSize: 64,
        spinnerColor: 'primary',
        messageColor: 'white',
        backgroundColor: '#1a1f36',
        customClass: 'full-sync-loading',
      });
    }

    watchdogTimer = setTimeout(() => {
      ensureHide();
      Notify.create({
        type: 'warning',
        message: 'Cloud pull took too long — auto-cancelled. Using existing local data. (Retry from Settings → Pull now later.)',
        icon: 'timer_off',
        timeout: 7000,
        textColor: 'dark',
      });
    }, WATCHDOG_TIMEOUT_MS);

    console.log('[fullSync:run] Step: PROBE_ONLINE via proxy only');
    const probe = await probeOnlineViaProxy();
    if (!probe.online) {
      localStorage.setItem(LS_LAST_PULL_AT, String(Date.now()));
      localStorage.setItem(LS_LAST_PULL_STATUS, 'OFFLINE');
      const suffix = probe.lastError ? `\n\nDetail — proxy error: ${probe.lastError.substring(0, 180)}\nCloud endpoint: ${CLOUD_URL}\n\nIf error is "stale packaged build dist" — uninstall then reinstall the latest EXE.\nIf error is "ECONNREFUSED / EAI_AGAIN" — Windows Firewall or DNS issue.` : '';
      return {
        ok: false,
        stage: 'Connectivity',
        message: `Cloud server unreachable right now. Using existing local data — all POS functions still work offline.${suffix}`,
      };
    }

    stage = 'Downloading full snapshot from cloud';
    console.log(`[fullSync:run] Stage: ${stage}`);
    if (showUI && !loadingHidden) Loading.show({ message: `Fetching all data from cloud…\n${stage}`, spinnerSize: 64, messageColor: 'white', backgroundColor: '#1a1f36' });

    const pullHeaders = attachBearerHeaders();
    const pullCtrl = new AbortController();
    const pullT = setTimeout(() => pullCtrl.abort(), 90000);
    const pullUrl = cloudViaProxy('sync/full');
    console.log(`[fullSync:run] GET ${pullUrl}  token_present=${!!pullHeaders.Authorization}`);
    const pullRes = await fetch(pullUrl, {
      method: 'GET',
      headers: pullHeaders,
      signal: pullCtrl.signal,
    });
    clearTimeout(pullT);
    console.log(`[fullSync:run] sync/full status=${pullRes.status} ok=${pullRes.ok}`);

    if (pullRes.status === 401) {
      return { ok: false, stage, message: 'Auth needed. Latest cloud data will be pulled automatically right after you sign in.' };
    }
    if (!pullRes.ok) {
      let detail = '';
      try {
        const d = (await pullRes.json()) as any;
        if (d?.code && d?.message) detail = ` (${d.code}: ${String(d.message).substring(0, 120)})`;
      } catch { /* ignore */ }
      return { ok: false, stage, message: `Cloud pull failed (HTTP ${pullRes.status}).${detail} Using existing local data.` };
    }
    const snapshot = (await pullRes.json()) as { entities?: Record<string, any[]>; counts?: Record<string, number> };
    if (!snapshot?.entities) return { ok: false, stage, message: 'Cloud returned empty snapshot (no entities).' };
    const totalPulled = Object.values(snapshot.counts || {}).reduce((a: number, b) => a + (Number(b) || 0), 0);
    console.log(`[fullSync:run] snapshot pulled totalPulled=${totalPulled} entities=${Object.keys(snapshot.entities).length}`);

    stage = `Applying ${totalPulled.toLocaleString()} records to offline database`;
    console.log(`[fullSync:run] Stage: ${stage}`);
    if (showUI && !loadingHidden) Loading.show({ message: `Fetching all data from cloud…\n${stage}`, spinnerSize: 64, messageColor: 'white', backgroundColor: '#1a1f36' });

    const applyCtrl = new AbortController();
    const applyT = setTimeout(() => applyCtrl.abort(), 60000);
    const applyHeaders = attachBearerHeaders();

    const applyRes = await fetch(`${LOCAL_API_URL}/api/sync/apply-full-noauth`, {
      method: 'POST',
      headers: applyHeaders,
      body: JSON.stringify(snapshot),
      signal: applyCtrl.signal,
    }).catch((e) => {
      console.warn(`[fullSync:run] apply-full-noauth fail fallback to /apply-full: ${e?.message || e}`);
      return fetch(`${LOCAL_API_URL}/api/sync/apply-full`, {
        method: 'POST',
        headers: applyHeaders,
        body: JSON.stringify(snapshot),
        signal: applyCtrl.signal,
      });
    });
    clearTimeout(applyT);
    console.log(`[fullSync:run] apply status=${applyRes.status} ok=${applyRes.ok}`);
    let totalApplied = 0;
    if (applyRes.ok) {
      try {
        const applyData = (await applyRes.json()) as { total?: number };
        totalApplied = Number(applyData?.total || 0);
      } catch { /* ignore */ }
    }

    localStorage.setItem(LS_LAST_PULL_AT, String(Date.now()));
    localStorage.setItem(LS_LAST_PULL_STATUS, applyRes.ok ? 'OK' : `APPLY_HTTP_${applyRes.status}`);

    if (!applyRes.ok) {
      return { ok: false, stage, message: `Local apply failed (HTTP ${applyRes.status}). Data was pulled but not fully saved locally — you can retry from Settings.` };
    }

    console.log(`[fullSync:run] DONE — totalApplied=${totalApplied}`);
    return {
      ok: true,
      stage: 'Done',
      message: `Synced ${totalApplied.toLocaleString()} records. Work fully offline now: sales, customers, reports, printing — all ready without internet.`,
      counts: snapshot.counts,
      totalApplied,
    };
  } catch (e: any) {
    console.error(`[fullSync:run] TOP-LEVEL CATCH stage=${stage} err=${e?.name}: ${e?.message || e}`);
    localStorage.setItem(LS_LAST_PULL_AT, String(Date.now()));
    localStorage.setItem(LS_LAST_PULL_STATUS, `ERR_${e?.name || 'UNKNOWN'}`);
    return {
      ok: false,
      stage: stage || 'Unexpected',
      message: (e?.name === 'AbortError' || e?.message?.includes('Aborted'))
        ? 'Cloud pull cancelled (network timeout). Using existing local data.'
        : `Unexpected error during full pull: ${e?.name || ''} ${e?.message || String(e).substring(0, 120)}. App continues with local data.`,
    };
  } finally {
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    ensureHide();
  }
}

export default boot(async () => {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isDesktopLocalRuntime = /^(http:\/\/localhost:3000|http:\/\/127\.0\.0\.1:3000)$/i.test(origin);
    if (!isDesktopLocalRuntime) {
      // #region debug-point A:web-skip
      reportDebug('A', 'frontend/src/boot/fullSync.ts:boot-skip', '[DEBUG] skipping desktop-only fullSync on non-localhost runtime', {
        origin,
        href: typeof window !== 'undefined' ? window.location.href : null,
        apiUrl: LOCAL_API_URL,
        cloudUrl: CLOUD_URL,
      });
      // #endregion
      console.log(`[fullSync:boot] SKIP — non-desktop runtime origin=${origin}`);
      return;
    }
    console.log('[fullSync:boot] boot hook INVOKED — running runFullPull(showUI=true) — every boot attempts full cloud pull');
    const result = await runFullPull(true);
    console.log(`[fullSync:boot] runFullPull FINISHED ok=${result.ok} stage="${result.stage}" msg_prefix="${result.message.substring(0, 100)}"`);
    try {
      if (result.ok) {
        Notify.create({ type: 'positive', message: result.message, icon: 'cloud_done', timeout: 7000 });
      } else {
        Notify.create({
          type: result.stage === 'Debounce' ? 'info' : (result.stage === 'Auth' || result.stage === 'Local Server' ? 'info' : 'warning'),
          message: result.message,
          icon: (result.stage === 'Connectivity' || result.stage === 'Unexpected') ? 'wifi_off' : 'info',
          timeout: 15000,
          textColor: 'dark',
          multiLine: true,
          html: false,
          closeBtn: true,
          actions: [{
            label: 'Copy Error',
            color: 'primary',
            flat: true,
            handler: () => {
              try {
                const full = `STAGE: ${result.stage}\n\n${result.message}\n\nBuild: v${DESKTOP_BUILD_VERSION}\nTimestamp: ${new Date().toISOString()}\nDB_MODE: sqlite\nCloud: ${CLOUD_URL}`;
                navigator.clipboard.writeText(full);
                Notify.create({ type: 'info', message: 'Error copied to clipboard — paste to developer for diagnosis.', timeout: 3500, icon: 'content_copy' });
              } catch (e) {
                try { Notify.create({ type: 'negative', message: 'Clipboard copy failed: ' + String(e?.message || e) }); } catch { /* ignore */ }
              }
            },
          }],
        });
      }
    } catch (ne: any) { console.warn('[fullSync:boot] Notify failed:', ne?.message || ne); }
  } catch (e: any) {
    try { Loading.hide(); } catch { /* ignore */ }
    console.warn('[fullSync:boot] outer boundary caught:', e?.message || e);
  }
});

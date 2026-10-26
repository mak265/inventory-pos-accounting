const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');
const cloudSync = require('./cloud-sync');

let mainWindow;
let serverProcess;
let serverLogTail = '';
const LOCAL_PORT = 3000;

function getBackendPaths() {
  const isPackaged = app.isPackaged;
  const basePath = isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const dbPath = path.join(app.getPath('userData'), 'aberin-pos.db');
  const seedDb = isPackaged
    ? path.join(process.resourcesPath, 'backend', 'aberin-pos.db')
    : path.join(basePath, 'backend', 'aberin-pos.db');
  // Packaged: resources/backend/dist, resources/frontend/dist/spa (copied from extraResources)
  // Unpackaged dev: ../backend and ../frontend siblings
  const backendDist = isPackaged
    ? path.join(process.resourcesPath, 'backend', 'dist')
    : path.join(basePath, 'backend', 'dist');
  const frontendDist = isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist', 'spa')
    : path.join(basePath, 'frontend', 'dist', 'spa');
  const backendNodeModules = isPackaged
    ? path.join(process.resourcesPath, 'backend', 'node_modules')
    : path.join(basePath, 'backend', 'node_modules');
  const backendSrc = isPackaged
    ? null
    : path.join(basePath, 'backend', 'src');
  return {
    isPackaged,
    basePath,
    dbPath,
    seedDb,
    backendDist,
    frontendDist,
    backendNodeModules,
    backendSrc,
  };
}

function copySeedDbIfNeeded() {
  const { dbPath, seedDb } = getBackendPaths();
  try {
    if (!fs.existsSync(dbPath) && fs.existsSync(seedDb)) {
      fs.copyFileSync(seedDb, dbPath);
      console.log('[DB] Copied seed database to', dbPath);
    }
  } catch (e) {
    console.error('[DB] Seed copy failed:', e.message);
  }
}

/**
 * Windows-only: find and kill any process currently listening on LOCAL_PORT (TCP).
 * This cleanly removes stale backend/node.exe instances left behind by a crashed
 * or incorrectly-uninstalled previous version of the app (otherwise the newly
 * launched frontend would talk to an old backend on the same port, giving 404s
 * on new endpoints like /api/_cloud_proxy/_diag).
 */
function killExistingProcessOnPort(port, callback) {
  if (process.platform !== 'win32') {
    try { callback && callback(); } catch (_) {}
    return;
  }
  try {
    const { exec } = require('child_process');
    // 1. Find PID owning the port
    exec(`netstat -ano | findstr :${port}`, { windowsHide: true }, (err1, stdout) => {
      try {
        const pids = new Set();
        String(stdout || '').split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const cols = trimmed.split(/\s+/);
          // Line looks like:  TCP    0.0.0.0:3000           LISTENING       <PID>
          if (/LISTENING/i.test(trimmed)) {
            const pid = cols[cols.length - 1];
            if (pid && /^\d+$/.test(pid)) pids.add(Number(pid));
          } else if (cols.find(c => String(c).endsWith(':' + port)) && /:\d+\s*$/.test(trimmed)) {
            const pid = cols[cols.length - 1];
            if (pid && /^\d+$/.test(pid)) pids.add(Number(pid));
          }
        });
        if (pids.size === 0) { try { callback && callback(); } catch (_) {} return; }
        let remaining = pids.size;
        pids.forEach(pid => {
          try {
            console.log(`[Server] Killing stale PID ${pid} listening on port ${port}`);
            serverLogTail += `[main] kill pre-existing PID=${pid} on :${port}\n`;
            exec(`taskkill /F /PID ${pid}`, { windowsHide: true }, () => {
              remaining--;
              if (remaining <= 0) setTimeout(() => { try { callback && callback(); } catch (_) {} }, 400);
            });
          } catch (_) {
            remaining--;
            if (remaining <= 0) setTimeout(() => { try { callback && callback(); } catch (_) {} }, 400);
          }
        });
      } catch (e) {
        console.warn('[Server] killExistingProcessOnPort parse failed:', e.message);
        try { callback && callback(); } catch (_) {}
      }
    });
  } catch (e) {
    console.warn('[Server] Could not kill process on port', port, e.message);
    try { callback && callback(); } catch (_) {}
  }
}

function startLocalServer() {
  // IMPORTANT: Before any spawn, ensure port 3000 is free from stale previous-install backends.
  // Otherwise the new 2.0.8+ frontend will talk to an old backend that doesn't know about
  // the /_cloud_proxy/_diag, /_cloud_proxy/* or apply-full-noauth routes and returns 404.
  killExistingProcessOnPort(LOCAL_PORT, () => {
    startLocalServerReal();
  });
}

function startLocalServerReal() {
  const paths = getBackendPaths();
  copySeedDbIfNeeded();

  let nodeExe = null;
  if (paths.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, 'node.exe'),
      path.join(paths.backendNodeModules, '.bin', 'node.exe'),
      process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : 'node',
      process.platform === 'win32' ? 'C:\\Program Files (x86)\\nodejs\\node.exe' : null,
      'node',
    ].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(c) || c === 'node') { nodeExe = c; break; }
    }
  } else {
    nodeExe = 'node';
  }
  if (!nodeExe) {
    console.error('[Server] FATAL: Could not find node.exe on this system.');
    setTimeout(() => {
      if (!mainWindow) return;
      mainWindow.setTitle('Aberin Hardware - Setup Required');
      mainWindow.loadURL(errorScreenHtml(
        'Node.js is required to run this app',
        'Aberin POS needs Node.js installed locally to run its backend. Please install Node.js v22 LTS (64-bit) then restart the app.<br><br>' +
        '<b>Download:</b> <a href="https://nodejs.org/en/download" style="color:#6c5ce7">https://nodejs.org/en/download</a><br>' +
        '<i>Windows x64 MSI installer recommended</i>'
      ));
    }, 1500);
    return;
  }

  const packageJsonPath = path.join(__dirname, 'package.json');
  let pkgVersion = 'UNKNOWN';
  try { pkgVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version || 'UNKNOWN'; } catch { /* ignore */ }

  const env = {
    ...process.env,
    PORT: String(LOCAL_PORT),
    DB_MODE: 'sqlite',
    NODE_ENV: 'production',
    CORS_ORIGIN: '*',
    JWT_SECRET: 'aberin-offline-secret-key-2026',
    DB_PATH: paths.dbPath,
    FRONTEND_DIST: paths.frontendDist,
    // Ensure node can find packaged backend deps
    NODE_PATH: paths.backendNodeModules,
    DESKTOP_BUILD_VERSION: pkgVersion,
  };
  console.log(`[main] Desktop build version = v${pkgVersion}`);

  let spawnArgs = [];
  let spawnCwd = paths.isPackaged ? paths.backendDist : path.join(paths.basePath, 'backend');

  if (paths.isPackaged) {
    const loaderAbs = path.join(paths.backendDist, 'config', 'register-loader.js');
    const entryAbs  = path.join(paths.backendDist, 'index.js');
    if (!fs.existsSync(entryAbs) || !fs.existsSync(loaderAbs)) {
      console.error('[Server] FATAL: Packaged backend files missing. entry=', entryAbs, 'exists:', fs.existsSync(entryAbs), 'loader=', loaderAbs, 'exists:', fs.existsSync(loaderAbs));
      setTimeout(() => {
        if (!mainWindow) return;
        const info = [
          'entry exists:  ' + fs.existsSync(entryAbs) + '  (' + entryAbs + ')',
          'loader exists: ' + fs.existsSync(loaderAbs) + '  (' + loaderAbs + ')',
          'frontend exists: ' + fs.existsSync(paths.frontendDist) + '  (' + paths.frontendDist + ')',
          'resourcesPath: ' + process.resourcesPath,
        ].join('\n');
        mainWindow.setTitle('Aberin Hardware - Installation Error');
        mainWindow.loadURL(errorScreenHtml(
          'Installation is incomplete',
          'The application was installed without its bundled backend files.<br><br>' +
          '<b>Fixes to try:</b><br>' +
          '• Uninstall the app from Control Panel<br>' +
          '• Download the latest Setup EXE from your source<br>' +
          '• Run the installer again (do not interrupt it)'
        ));
        setTimeout(() => {
          try { mainWindow.webContents.executeJavaScript(`document.getElementById('info').textContent = ${JSON.stringify(info)}`); } catch(e){}
        }, 500);
      }, 1500);
      return;
    }
    const loaderUrl = 'file:///' + loaderAbs.replace(/\\/g, '/');
    console.log('[Server] Packaged mode: using compiled JS from backend/dist');
    console.log('  entry :', entryAbs);
    console.log('  loader:', loaderAbs);
    console.log('  FRONTEND_DIST:', paths.frontendDist, 'exists:', fs.existsSync(paths.frontendDist));
    spawnArgs = ['--import', loaderUrl, entryAbs];
  } else {
    // DEV MODE: Try tsx first (faster for dev) → compiled JS fallback
    const tsxCmd = process.platform === 'win32'
      ? path.join(paths.basePath, 'backend', 'node_modules', '.bin', 'tsx.cmd')
      : path.join(paths.basePath, 'backend', 'node_modules', '.bin', 'tsx');
    if (fs.existsSync(tsxCmd)) {
      spawnArgs = ['--import', path.join(paths.backendSrc, 'config', 'register-loader.ts'), path.join(paths.backendSrc, 'index.ts')];
      spawnCwd = path.join(paths.basePath, 'backend');
      // tsx.cmd self-boots via shell on Windows
      nodeExe = process.platform === 'win32' ? null : 'node';
      if (!nodeExe) {
        // Use direct .cmd path as command (shell resolves it)
        spawnArgs = [tsxCmd, ...spawnArgs];
      }
    } else {
      const loaderJs = path.join(paths.backendDist, 'config', 'register-loader.js');
      const entryJs  = path.join(paths.backendDist, 'index.js');
      const loaderUrl = 'file:///' + loaderJs.replace(/\\/g, '/');
      spawnArgs = ['--import', loaderUrl, entryJs];
      spawnCwd = path.join(paths.basePath, 'backend');
    }
  }

  try {
    const spawnOpts = {
      env, cwd: spawnCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsVerbatimArguments: false,
    };
    let cmd;
    let args;
    if (nodeExe) {
      cmd = nodeExe;
      args = spawnArgs;
    } else {
      cmd = spawnArgs[0];
      args = spawnArgs.slice(1);
    }
    if (process.platform === 'win32' && spawnOpts.shell) {
      const cmdQuoted = /^[A-Za-z]:\\/.test(cmd) || cmd.includes(' ') ? `"${cmd}"` : cmd;
      const argsQuoted = args.map(a => {
        if (typeof a !== 'string') return a;
        if (/^[A-Za-z]:\\/.test(a) || a.includes(' ') || a.includes('&') || a.includes('^')) {
          return `"${a.replace(/"/g, '\\"')}"`;
        }
        return a;
      });
      const fullCmd = `${cmdQuoted} ${argsQuoted.join(' ')}`;
      const { spawn: cpSpawn } = require('child_process');
      serverProcess = cpSpawn(fullCmd, [], {
        env, cwd: spawnCwd, stdio: ['pipe', 'pipe', 'pipe'], shell: true,
        windowsVerbatimArguments: false,
      });
    } else if (nodeExe) {
      serverProcess = spawn(cmd, args, spawnOpts);
    } else {
      serverProcess = spawn(cmd, args, spawnOpts);
    }
    serverProcess.stdout.on('data', (d) => {
      const s = d.toString();
      console.log('[Server]', s.trim());
      serverLogTail = (serverLogTail + '\n' + s).slice(-4000);
    });
    serverProcess.stderr.on('data', (d) => {
      const s = d.toString();
      console.error('[ServerErr]', s.trim());
      serverLogTail = (serverLogTail + '\n' + s).slice(-4000);
    });
    serverProcess.on('error', (err) => console.error('[Server] Spawn error:', err.message));
    serverProcess.on('close', (code) => console.log('[Server] exited with code', code));
  } catch (e) {
    console.error('[Server] Failed to spawn:', e.message);
  }
}

function waitForLocalServer(timeoutMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${LOCAL_PORT}/health`, (res) => {
        if (res.statusCode === 200) { resolve(true); return; }
        if (Date.now() - start > timeoutMs) { resolve(false); return; }
        setTimeout(check, 500);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) { resolve(false); return; }
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Aberin Hardware - POS System',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
    autoHideMenuBar: true,
    backgroundColor: '#1a1f36',
  });

  mainWindow.loadURL(loadingScreenHtml('Starting system...'));

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase();
    const isPrintShortcut = (input.control || input.meta) && input.shift && key === 'r';
    if (!isPrintShortcut) return;
    event.preventDefault();
    mainWindow?.webContents.print({ printBackground: true }, (success, failureReason) => {
      if (!success && failureReason) console.error('[Print] Failed:', failureReason);
    });
  });
}

function loadingScreenHtml(message) {
  return `data:text/html,` + encodeURIComponent(`
    <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Arial;background:#1a1f36;color:white">
      <div style="text-align:center">
        <h1>Aberin Hardware</h1>
        <p>${message}</p>
        <div style="width:200px;height:4px;background:#333;border-radius:2px;margin:20px auto">
          <div style="width:60%;height:100%;background:#6c5ce7;border-radius:2px;animation:loading 1.5s infinite"></div>
        </div>
      </div>
      <style>@keyframes loading{0%{width:20%}50%{width:80%}100%{width:20%}}</style>
    </body></html>`);
}

function errorScreenHtml(title, details) {
  return `data:text/html;charset=utf-8,` + encodeURIComponent(`
    <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Arial;background:#2d1b1b;color:white;padding:20px">
      <div style="text-align:center;max-width:700px">
        <h1 style="color:#ff6b6b">[!] ${title}</h1>
        <p style="font-size:14px;opacity:0.9">${details}</p>
        <div style="margin-top:30px;padding:16px;background:#1a1f36;border-radius:6px;text-align:left;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;opacity:0.9" id="info"></div>
        <p style="margin-top:20px;font-size:12px;opacity:0.7">Try restarting the app, or contact support if the error continues.</p>
      </div>
    </body></html>`);
}

async function loadApp() {
  // ALWAYS run local backend first and as ONLY source of truth for offline work
  startLocalServer();

  const ready = await waitForLocalServer(30000);
  if (ready) {
    try {
      mainWindow.setTitle('Aberin Hardware - POS System [OFFLINE-SAFE]');
      // Local backend is up → load local frontend (100% offline, no internet)
      mainWindow.loadURL(`http://localhost:${LOCAL_PORT}`);
      // Background cloud push (best-effort only; never reads from cloud)
      try { cloudSync.start(app.getPath('userData')); } catch (e) { /* ignore */ }
      return;
    } catch (e) {
      console.error('[Load] local loadURL failed:', e.message);
    }
  }

  // ⛔ DO NOT FALL BACK TO CLOUD URL — would cause white screen offline.
  // Show RED diagnostic screen instead so user knows to restart / reinstall
  const paths = getBackendPaths();
  const info = [
    'Mode: ' + (paths.isPackaged ? 'PACKAGED EXE' : 'DEV'),
    'Backend dist: ' + paths.backendDist + '  exists=' + fs.existsSync(paths.backendDist),
    'Frontend dist: ' + paths.frontendDist + '  exists=' + fs.existsSync(paths.frontendDist),
    'DB path: ' + paths.dbPath + '  exists=' + fs.existsSync(paths.dbPath),
    'ResourcesPath: ' + process.resourcesPath,
    'AppData: ' + app.getPath('userData'),
    'Local server started: ' + (!!serverProcess),
    'Local health reached: ' + ready,
    '',
    '=== Backend log tail (last 4KB) ===',
    serverLogTail || '(no output captured)',
  ].join('\n');
  mainWindow.setTitle('Aberin Hardware - Local Backend did not start');
  mainWindow.loadURL(errorScreenHtml(
    'Cannot start local server (offline mode failed to initialize)',
    'The app tried to start its built-in local backend on port ' + LOCAL_PORT + ' but could not reach it after 30 seconds.<br><br>' +
    '<b>No internet fallback loaded (to prevent white screen offline).</b><br><br>' +
    '<b>Fixes to try:</b><br>' +
    '  * Reboot your PC and try again (frees port ' + LOCAL_PORT + ')<br>' +
    '  * Close any other program using port ' + LOCAL_PORT + '<br>' +
    '  * Uninstall and re-install the latest Aberin POS Setup EXE<br>' +
    '  * Ensure Node.exe exists (look inside installation folder\\resources)<br>' +
    '<br>Check the log tail below for the exact error.'
  ));
  setTimeout(() => {
    try { mainWindow.webContents.executeJavaScript(`document.getElementById('info').textContent = ${JSON.stringify(info)}`); } catch(e){}
  }, 500);
}

app.whenReady().then(async () => {
  createWindow();
  await loadApp();
});

app.on('window-all-closed', () => {
  try { cloudSync.stop(); } catch {}
  try { if (serverProcess) serverProcess.kill(); } catch {}
  app.quit();
});

app.on('before-quit', () => {
  try { cloudSync.stop(); } catch {}
  try { if (serverProcess) serverProcess.kill(); } catch {}
});

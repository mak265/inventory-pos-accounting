/**
 * fetch-node-portable.cjs
 * -----------------------
 * Downloads a PORTABLE (no-install) Node.js win-x64 ZIP from the
 * official nodejs.org CDN, extracts ONLY node.exe, and stores it at:
 *     <project>/electron/portable/node.exe
 *
 * This file is then bundled into the installed EXE via electron-builder's
 * extraResources (see package.json), ending up at:
 *     %INSTALL_DIR%/resources/node.exe
 *
 * The spawn logic in main.js looks for resources/node.exe FIRST on
 * packaged mode, so even client PCs WITHOUT Node.js installed will
 * run Aberin POS fully offline.
 *
 * Skips download if portable/node.exe already exists AND matches the
 * target version hash.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const crypto = require('crypto');

// ---- CONFIG ----
const NODE_VERSION = process.env.NODE_PKG_VERSION || 'v22.14.0'; // LTS win-x64
const PLATFORM_ARCH = 'win-x64';
const BASE_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${PLATFORM_ARCH}.zip`;
// SHA256 for node.exe (from node-v<ver>-win-x64.zip/node.exe) can be set via env or empty for skip-check
const EXPECTED_EXE_SHA256 = process.env.NODE_EXE_SHA256 || '';

const OUT_DIR = path.join(__dirname, 'portable');
const OUT_EXE = path.join(OUT_DIR, 'node.exe');
const TEMP_ZIP = path.join(OUT_DIR, `node-${NODE_VERSION}-${PLATFORM_ARCH}.zip`);
const VERSION_FILE = path.join(OUT_DIR, '.node-version');

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  const s = fs.readFileSync(p);
  h.update(s);
  return h.digest('hex');
}

function ensureDir(p) {
  if (!fileExists(p)) fs.mkdirSync(p, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  ↓ Downloading ${url} ...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(dest);
      });
    }).on('error', (err) => {
      try { file.close(); fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

function getSystemDir() {
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return path.join(windir, 'System32');
}

function whichOrFullPath(cmdName) {
  const candidates = [];
  const systemDir = getSystemDir();
  // Full known-absolute path first
  if (cmdName === 'powershell.exe') {
    candidates.push(path.join(systemDir, 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  } else if (cmdName === 'tar.exe' || cmdName === 'cmd.exe') {
    candidates.push(path.join(systemDir, cmdName));
  }
  // Then plain name (rely on PATH)
  candidates.push(cmdName);
  for (const p of candidates) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* not found */ }
    // Also try: "just name" via where-like check
    if (p === cmdName) {
      try {
        const r = require('child_process').execSync(
          `${process.env.comspec || 'cmd.exe'} /C "where ${cmdName}"`,
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
        if (r) return r;
      } catch { /* ignore */ }
    }
  }
  return cmdName;
}

function locateNodeExeInTree(baseDir) {
  const arch = PLATFORM_ARCH; // win-x64
  // Preferred candidate: nested subfolder node-<ver>-win-x64/node.exe
  const preferred = path.join(baseDir, `node-${NODE_VERSION}-${arch}`, 'node.exe');
  if (fileExists(preferred)) return preferred;
  // Plain base dir
  const flat = path.join(baseDir, 'node.exe');
  if (fileExists(flat)) return flat;
  // Recursive scan fallback (max depth 3)
  const stack = [baseDir];
  let depth = 0;
  while (stack.length && depth++ < 3) {
    const dir = stack.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(fp);
      else if (ent.isFile() && ent.name.toLowerCase() === 'node.exe') return fp;
    }
  }
  return null;
}

function tryExtractVia(cmdPath, args, zipPath, tmpDir, destExe) {
  try {
    const { execFileSync } = require('child_process');
    console.log(`  ↔ Extracting via ${path.basename(cmdPath)} ${args.join(' ').slice(0, 60)} ...`);
    execFileSync(cmdPath, args, { stdio: 'inherit', windowsHide: true });
    const found = locateNodeExeInTree(tmpDir);
    if (!found) throw new Error(`no node.exe inside extracted dir`);
    fs.copyFileSync(found, destExe);
    return true;
  } catch (e) {
    console.log(`  ℹ️  ${path.basename(cmdPath)} fallback skipped: ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function extractViaPureNodeZip(zipPath, tmpDir, destExe) {
  // Strategy: install-adjacent, or use existing 'extract-zip' package if present.
  // Use a tiny embedded unzip: list central directory entries, inflate only the node.exe one.
  // For maintainability, we prefer 'extract-zip' npm (used by electron-builder internally) if available.
  let extract = null;
  try { extract = require('extract-zip'); } catch { /* not present */ }
  if (!extract) {
    try {
      // Try to resolve from electron-builder dependencies.
      const { execSync } = require('child_process');
      try {
        execSync(
          `"${process.execPath}" -e "require('child_process').execSync('npm install extract-zip@2.0.1 --no-save --no-audit --no-fund', { stdio: 'inherit' })"`,
          { cwd: __dirname, stdio: 'inherit', windowsHide: true }
        );
      } catch { /* ignore install failure; fallback to built-in */ }
      try { extract = require('extract-zip'); } catch { extract = null; }
    } catch { extract = null; }
  }
  if (extract) {
    console.log(`  ↔ Extracting node.exe via extract-zip (pure Node)...`);
    await extract(zipPath, { dir: tmpDir });
    const found = locateNodeExeInTree(tmpDir);
    if (!found) throw new Error(`extract-zip produced no node.exe`);
    fs.copyFileSync(found, destExe);
    return true;
  }

  // ---------- FINAL FALLBACK: pure Node.js ZIP parser (no deps) ----------
  console.log(`  ↔ Extracting node.exe via pure Node.js embedded ZIP reader...`);
  const zlib = require('zlib');
  const data = fs.readFileSync(zipPath);
  // Find End of Central Directory Record (EOCD) — 0x06054b50
  let eocdPos = -1;
  for (let i = data.length - 22; i >= 0 && eocdPos === -1; i--) {
    if (data[i] === 0x50 && data[i+1] === 0x4b && data[i+2] === 0x05 && data[i+3] === 0x06) eocdPos = i;
  }
  if (eocdPos === -1) throw new Error('ZIP EOCD signature not found');
  const centralDirEntriesTotal = data.readUInt16LE(eocdPos + 10);
  const centralDirSize = data.readUInt32LE(eocdPos + 12);
  const centralDirOffset = data.readUInt32LE(eocdPos + 16);
  let cdirPos = centralDirOffset;
  const targets = [];
  for (let i = 0; i < centralDirEntriesTotal; i++) {
    if (data.readUInt32LE(cdirPos) !== 0x02014b50) break;
    const compMethod = data.readUInt16LE(cdirPos + 10);
    const compSize = data.readUInt32LE(cdirPos + 20);
    const uncompSize = data.readUInt32LE(cdirPos + 24);
    const nameLen = data.readUInt16LE(cdirPos + 28);
    const extraLen = data.readUInt16LE(cdirPos + 30);
    const commentLen = data.readUInt16LE(cdirPos + 32);
    const localHeaderRelOffset = data.readUInt32LE(cdirPos + 42);
    const entryName = data.toString('utf8', cdirPos + 46, cdirPos + 46 + nameLen);
    if (String(entryName).replace(/\\/g, '/').split('/').pop().toLowerCase() === 'node.exe') {
      targets.push({ name: entryName, compMethod, compSize, uncompSize, localHeaderRelOffset });
    }
    cdirPos += 46 + nameLen + extraLen + commentLen;
  }
  if (!targets.length) throw new Error('pureNode extract: no node.exe entry found in ZIP central dir');
  // Pick smallest (should be only one node.exe)
  const t = targets[0];
  // Local file header: sig 4 bytes + 26 fixed + nameLen + extraLen -> data starts after
  const lh = t.localHeaderRelOffset;
  if (data.readUInt32LE(lh) !== 0x04034b50) throw new Error('ZIP local file header signature mismatch');
  const lhNameLen = data.readUInt16LE(lh + 26);
  const lhExtraLen = data.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + lhNameLen + lhExtraLen;
  const compressed = Buffer.allocUnsafe(t.compSize);
  data.copy(compressed, 0, dataStart, dataStart + t.compSize);
  let decompressed;
  if (t.compMethod === 0) decompressed = compressed;
  else if (t.compMethod === 8) decompressed = zlib.inflateRawSync(compressed);
  else throw new Error(`Unsupported ZIP compression method=${t.compMethod} for node.exe`);
  if (decompressed.length !== t.uncompSize) throw new Error(`decompressed size mismatch ${decompressed.length} != ${t.uncompSize}`);
  fs.writeFileSync(destExe, decompressed);
  return true;
}

async function extractNodeExeFromZip(zipPath, destExe) {
  // Try 3 strategies; any success wins.
  const tmp = path.join(OUT_DIR, `_extract_${Date.now()}`);
  ensureDir(tmp);
  try {
    // Strategy 1: PowerShell via FULL absolute path (most reliable if present)
    const psExe = whichOrFullPath('powershell.exe');
    const psCmd = `$ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmp}' -Force; if (!(Test-Path '${tmp}')) { throw 'extract dir missing' }`;
    if (tryExtractVia(psExe, ['-NoProfile', '-NonInteractive', '-Command', psCmd], zipPath, tmp, destExe)) return destExe;
    // Clean tmp between retries
    try { fs.rmSync(tmp, { recursive: true, force: true }); ensureDir(tmp); } catch {}
    // Strategy 2: tar.exe (built-in to Win10+ 1803, win11 always)
    const tarExe = whichOrFullPath('tar.exe');
    if (tryExtractVia(tarExe, ['-xf', zipPath, '-C', tmp], zipPath, tmp, destExe)) return destExe;
    try { fs.rmSync(tmp, { recursive: true, force: true }); ensureDir(tmp); } catch {}
    // Strategy 3: Pure Node.js extract (no shell, no external deps)
    if (await extractViaPureNodeZip(zipPath, tmp, destExe)) return destExe;
    throw new Error('All 3 extraction methods failed. Please use manual procedure from troubleshooting output.');
  } finally {
    // Cleanup extracted temp dir (keep zip for cache)
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  ensureDir(OUT_DIR);

  // Already correct version cached?
  const cachedOk =
    fileExists(OUT_EXE) &&
    fileExists(VERSION_FILE) &&
    (fs.readFileSync(VERSION_FILE, 'utf8').trim() === NODE_VERSION);

  if (cachedOk) {
    console.log(`✅ Portable node.exe already cached (${NODE_VERSION}). Using existing: ${OUT_EXE}`);
    console.log(`   size: ${(fs.statSync(OUT_EXE).size / 1024 / 1024).toFixed(1)} MB`);
    process.exit(0);
  }

  console.log(`⬇️  Portable Node.js ${NODE_VERSION} (${PLATFORM_ARCH}) not cached locally — fetching from nodejs.org...`);

  // Download ZIP
  await download(BASE_URL, TEMP_ZIP);
  console.log(`   ZIP saved (${(fs.statSync(TEMP_ZIP).size / 1024 / 1024).toFixed(1)} MB)`);

  // Extract node.exe only (async fallback chain: PowerShell -> tar -> pure Node)
  await extractNodeExeFromZip(TEMP_ZIP, OUT_EXE);
  if (!fileExists(OUT_EXE)) throw new Error('Extraction failed: ' + OUT_EXE);
  console.log(`✅ Extracted node.exe OK (${(fs.statSync(OUT_EXE).size / 1024 / 1024).toFixed(1)} MB)`);

  // Optional SHA verify
  if (EXPECTED_EXE_SHA256) {
    const actual = sha256File(OUT_EXE);
    if (actual.toLowerCase() !== EXPECTED_EXE_SHA256.toLowerCase()) {
      console.error(`❌ SHA256 mismatch for extracted node.exe!\n   expected: ${EXPECTED_EXE_SHA256}\n   actual:   ${actual}`);
      process.exit(2);
    }
    console.log(`   SHA256 verified OK.`);
  }

  // Stamp version file
  fs.writeFileSync(VERSION_FILE, NODE_VERSION, 'utf8');

  // Delete ZIP? Keep it as cache to avoid repeat dl on rebuilds.
  console.log(`\n✅ Portable Node.js ready at: ${OUT_EXE}`);
  console.log(`   It will be bundled inside the EXE as resources/node.exe.\n`);
}

main().catch((e) => {
  console.error('\n❌ fetch-node-portable FAILED: ', e.message);
  console.error('\nTroubleshooting:');
  console.error('  • Check internet connectivity (nodejs.org must be reachable during build)');
  console.error(`  • Or manually download ${BASE_URL}`);
  console.error(`    → extract node.exe → place it at ${OUT_EXE}`);
  console.error(`    → create ${VERSION_FILE} with content "${NODE_VERSION}"`);
  process.exit(1);
});

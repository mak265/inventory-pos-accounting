/**
 * Pre-flight check: ensure backend and frontend builds exist
 * BEFORE electron-builder packages the EXE. Otherwise we ship
 * an installer with empty extraResources → white screen on first run.
 *
 * Called by `npm run build:all` before electron-builder.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const checks = [
  {
    label: 'Backend compiled entry (index.js)',
    file: path.join(ROOT, 'backend', 'dist', 'index.js'),
  },
  {
    label: 'Backend register-loader (register-loader.js)',
    file: path.join(ROOT, 'backend', 'dist', 'config', 'register-loader.js'),
  },
  {
    label: 'Frontend SPA (index.html)',
    file: path.join(ROOT, 'frontend', 'dist', 'spa', 'index.html'),
  },
  {
    label: 'Backend node_modules (better-sqlite3 + express + etc)',
    file: path.join(ROOT, 'backend', 'node_modules', 'better-sqlite3'),
  },
  {
    label: 'Portable node.exe (fully offline EXE)',
    file: path.join(__dirname, 'portable', 'node.exe'),
    optional: true, // Warn only — user can skip but then client PC needs Node installed
  },
];

console.log('=== PRE-BUILD ASSET CHECK ===');
let ok = true;
let portableWarn = null;
for (const c of checks) {
  const exists = fs.existsSync(c.file);
  const mark = exists ? '✓' : (c.optional ? '⚠' : '✗');
  console.log(`  ${mark} ${c.label.padEnd(48)} ${exists ? 'OK' : (c.optional ? 'OPTIONAL MISSING' : 'MISSING')}`);
  if (!exists) {
    console.log(`        path: ${c.file}`);
    if (c.optional) {
      portableWarn = `Portable node.exe not bundled — CLIENT PCs WILL NEED Node.js installed separately.\n` +
        `   To auto-fetch: run  cd electron && npm run fetch-node-portable`;
    } else {
      ok = false;
    }
  }
}

if (portableWarn) console.warn('\n⚠️  NOTICE: ' + portableWarn + '\n');

if (!ok) {
  console.error('\n❌ Build aborted. Required assets are MISSING.');
  console.error('   Run these BEFORE building the EXE (from project root):');
  console.error('     cd backend  && npm run build   (compiles TypeScript to dist/)');
  console.error('     cd frontend && npm run build   (compiles Quasar SPA to dist/spa/)');
  console.error('     cd electron && npm run fetch-node-portable  (downloads portable Node.js for offline EXE)');
  console.error('   Then retry:  cd electron && npm run build-win\n');
  process.exit(1);
}

console.log('\n✅ All required assets present. Proceeding to electron-builder...\n');

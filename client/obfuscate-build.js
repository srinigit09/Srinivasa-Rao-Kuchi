'use strict';
/**
 * Build wrapper: obfuscates the app's JavaScript (and the inline <script> blocks of the HTML windows)
 * IN PLACE, runs the given build command, then ALWAYS restores the readable source.
 *
 *   node obfuscate-build.js electron-builder --win --x64
 *
 * Your source files are never left obfuscated: originals are copied to .src-backup/ first and put back
 * when the build ends (success, failure or Ctrl+C). If a previous run was killed hard, the leftovers in
 * .src-backup/ are restored automatically at the start of the next run (or use `git checkout`).
 */
const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT   = __dirname;
const BACKUP = path.join(ROOT, '.src-backup');
const SKIP_JS = new Set(['afterPack.js', 'obfuscate-build.js']);

// Conservative settings: names of top-level functions are kept (HTML onclick="..." handlers call them),
// object property names are kept (JSON fields, IPC channel names, DOM ids). Strings are moved into an
// encoded table. No self-defending / debug-protection tricks that could break Electron.
const BASE_OPTIONS = {
  compact: true,
  renameGlobals: false,
  renameProperties: false,
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  sourceMap: false,
};

function listFiles() {
  const files = [];
  for (const n of fs.readdirSync(ROOT)) {
    if (n.endsWith('.js') && !SKIP_JS.has(n) && fs.statSync(path.join(ROOT, n)).isFile()) files.push(n);
  }
  for (const dir of ['renderer', 'public']) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const n of fs.readdirSync(d)) if (n.endsWith('.html')) files.push(path.join(dir, n));
  }
  return files;
}

function restore() {
  if (!fs.existsSync(BACKUP)) return;
  const walk = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else {
        const rel = path.relative(BACKUP, p);
        fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
        fs.copyFileSync(p, path.join(ROOT, rel));
      }
    }
  };
  walk(BACKUP);
  fs.rmSync(BACKUP, { recursive: true, force: true });
  console.log('[obfuscate] Original source restored.');
}

const obfuscate = (code, target) =>
  JavaScriptObfuscator.obfuscate(code, { ...BASE_OPTIONS, target }).getObfuscatedCode();

function run() {
  const cmd = process.argv.slice(2);
  if (!cmd.length) { console.error('Usage: node obfuscate-build.js <build command ...>'); process.exit(2); }

  restore();   // leftover from a killed run
  const files = listFiles();
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(BACKUP, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(BACKUP, rel));
  }

  let status = 1;
  try {
    for (const rel of files) {
      const abs = path.join(ROOT, rel);
      const src = fs.readFileSync(abs, 'utf8');
      if (rel.endsWith('.js')) {
        fs.writeFileSync(abs, obfuscate(src, 'node'));
      } else {
        // inline <script> blocks only (not <script src=...>)
        fs.writeFileSync(abs, src.replace(/<script>([\s\S]*?)<\/script>/g,
          (_m, js) => `<script>${obfuscate(js, 'browser')}</script>`));
      }
      console.log(`[obfuscate] ${rel}`);
    }
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: 'inherit' });
    status = r.status === null ? 1 : r.status;
  } catch (e) {
    console.error('[obfuscate] Failed:', e.message);
  } finally {
    restore();
  }
  process.exit(status);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });
run();

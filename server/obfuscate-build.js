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

// After a build: every native module must be for the target platform, and the packaged code must be obfuscated.
function verifyPackage(platform) {
  const problems = [];
  const res = platform === 'win'
    ? path.join(ROOT, 'dist', 'win-unpacked', 'resources')
    : fs.readdirSync(path.join(ROOT, 'dist')).filter(n => n.startsWith('mac'))
        .map(n => fs.readdirSync(path.join(ROOT, 'dist', n)).filter(a => a.endsWith('.app'))
          .map(a => path.join(ROOT, 'dist', n, a, 'Contents', 'Resources'))).flat()[0];
  if (!res || !fs.existsSync(path.join(res, 'app.asar'))) return ['packaged app.asar not found'];
  const walkNative = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) walkNative(p);
      else if (n.endsWith('.node')) {
        const head = Buffer.alloc(4); const fd = fs.openSync(p, 'r'); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
        const isWin = head[0] === 0x4d && head[1] === 0x5a;                       // "MZ"
        const isMac = head.readUInt32LE(0) === 0xfeedfacf || head.readUInt32BE(0) === 0xcafebabe;
        if (platform === 'win' && !isWin) problems.push(`${path.relative(res, p)} is not a Windows binary`);
        if (platform === 'mac' && !isMac) problems.push(`${path.relative(res, p)} is not a macOS binary`);
      }
    }
  };
  const unpacked = path.join(res, 'app.asar.unpacked');
  if (fs.existsSync(unpacked)) walkNative(unpacked);
  const asar = require('@electron/asar');
  for (const rel of files0) {
    let src;
    try { src = asar.extractFile(path.join(res, 'app.asar'), rel.split(path.sep).join('/')).toString('utf8'); }
    catch { problems.push(`${rel} is missing from the package`); continue; }
    if (!/_0x[0-9a-f]{4,}/.test(src) && (rel.endsWith('.js') || /<script>[\s\S]{200,}<\/script>/.test(src))) problems.push(`${rel} is NOT obfuscated`);
  }
  return problems;
}

let files0 = [];
function run() {
  const cmd = process.argv.slice(2);
  if (!cmd.length) { console.error('Usage: node obfuscate-build.js <build command ...>'); process.exit(2); }

  restore();   // leftover from a killed run
  const files = listFiles();
  files0 = files;
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
    // Never reuse a previous build's unpacked folder: a stale one can end up in the installer
    // (wrong-platform native modules, un-obfuscated code).
    const platform = cmd.includes('--win') ? 'win' : cmd.includes('--mac') ? 'mac' : null;
    const dist = path.join(ROOT, 'dist');
    for (const d of platform === 'win' ? ['win-unpacked'] : platform === 'mac' ? ['mac-arm64', 'mac'] : [])
      fs.rmSync(path.join(dist, d), { recursive: true, force: true });
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: 'inherit' });
    status = r.status === null ? 1 : r.status;
    if (status === 0 && platform) {
      const problems = verifyPackage(platform);
      if (problems.length) {
        console.error('[verify] BUILD REJECTED - the package is wrong, do not ship it:');
        for (const m of problems) console.error('  - ' + m);
        status = 1;
      } else console.log('[verify] Package OK: native modules match the platform, code is obfuscated.');
    }
  } catch (e) {
    console.error('[obfuscate] Failed:', e.message);
  } finally {
    restore();
  }
  process.exit(status);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });
run();

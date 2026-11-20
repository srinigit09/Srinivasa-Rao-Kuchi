'use strict';

/**
 * Server Electron Wrapper
 * ──────────────────────────────────────────────────────────────
 * This wraps the Node.js panic alarm server in a desktop app.
 * On launch:
 *  1. Starts the built-in HTTP/Socket.IO server in the background (no window is opened)
 *  2. If "Auto Login" was chosen at the last admin sign-in, marks the server active silently
 *     (Auto Login only starts the server - the Admin UI ALWAYS asks for admin credentials)
 *  3. The system tray menu offers Admin Login, Start Server, Edit IP Address, Restart / Quit Application
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, powerMonitor, safeStorage, Notification } = require('electron');
const brand = require('./brand');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const os     = require('os');
const net    = require('net');

// ── Load Environment Variables (Properties) ──────────────────────────────────
try {
  const dotenv = require('dotenv');
  const execDir = path.dirname(process.execPath);
  const cwdDir = process.cwd();

  const loadEnvFile = (filename) => {
    const p1 = path.join(execDir, filename);
    const p2 = path.join(cwdDir, filename);
    if (fs.existsSync(p1)) {
      dotenv.config({ path: p1 });
      console.log(`[Server] Loaded properties from: ${p1}`);
      return true;
    } else if (fs.existsSync(p2)) {
      dotenv.config({ path: p2 });
      console.log(`[Server] Loaded properties from: ${p2}`);
      return true;
    }
    return false;
  };

  // Load both property files (with .env as fallback for backwards compatibility)
  const loadedServer = loadEnvFile('server.env');
  const loadedBootstrap = loadEnvFile('bootstrap.env');

  if (!loadedServer && !loadedBootstrap) {
    loadEnvFile('.env');
  }
} catch (err) {
  console.warn('[Server] Could not load dotenv configuration:', err.message);
}

// ── Paths ─────────────────────────────────────────────────────────────────────
// USER_DATA is per OS user (login prefs live here — a saved password must never be shared).
// SHARED_DATA is per computer: database, license, JWT secret, port and install marker live there so
// the server behaves identically whichever OS user is logged in (and survives user switches).
const USER_DATA = app.getPath('userData');

function getSharedDataDir() {
  let dir;
  if (process.platform === 'win32') {
    dir = path.join(process.env.ProgramData || process.env.ALLUSERSPROFILE || 'C:\\ProgramData', 'PanicAlarmServer');
  } else if (process.platform === 'darwin') {
    dir = '/Users/Shared/PanicAlarmServer';
  } else {
    dir = '/var/lib/panic-alarm-server';
  }
  try {
    const existed = fs.existsSync(dir);
    if (!existed) fs.mkdirSync(dir, { recursive: true });
    // Open the folder to every OS user on every launch (repairs folders made by older builds)
    try {
      if (process.platform === 'win32') {
        // *S-1-5-32-545 = BUILTIN\Users — Modify, inherited by files created later
        if (!existed) require('child_process').execFileSync('icacls', [dir, '/grant', '*S-1-5-32-545:(OI)(CI)M'],
          { timeout: 5000, stdio: 'ignore', windowsHide: true });
      } else {
        fs.chmodSync(dir, 0o777);
      }
    } catch (e) { console.warn('[Server] Could not open shared data folder to all users:', e.message); }
    const probe = path.join(dir, '.perm_test');
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
    return dir;
  } catch (e) {
    console.warn('[Server] Shared data folder not writable, using per-user folder:', e.message);
    return USER_DATA;
  }
}
const SHARED_DATA = getSharedDataDir();
// Event log lives next to the shared database so every OS user's server writes to one history
if (!process.env.LOG_DIR) process.env.LOG_DIR = path.join(SHARED_DATA, 'logs');
const eventLog = require('./event-log');
eventLog.info('app_launched', { pid: process.pid, osUser: os.userInfo().username, version: app.getVersion() });
// Files created by this process (SQLite database, -wal, -shm) must stay writable by other OS users
if (process.platform !== 'win32') process.umask(0o000);

// ── Single instance — a newer installed build replaces an old one still running in the tray ──
function getBuildStamp() {
  try {
    const f = path.join(process.resourcesPath, 'install-id');
    const id = fs.readFileSync(f, 'utf8').trim();
    if (!id) return null;
    // Must change on EVERY (re)install, even of the same installer. Windows keeps old file
    // times for re-created files (NTFS tunneling), so use the uninstaller the installer
    // writes fresh each time; elsewhere use the stamp file's creation time.
    let t = 0;
    if (process.platform === 'win32') {
      try {
        const dir  = path.dirname(process.execPath);
        const unin = fs.readdirSync(dir).find(n => /^Uninstall .*\.exe$/i.test(n));
        if (unin) t = Math.max(fs.statSync(path.join(dir, unin)).mtimeMs, fs.statSync(path.join(dir, unin)).birthtimeMs);
      } catch { /* fall through */ }
    }
    // The Windows installer writes a new install-stamp on every run: the most reliable "this is a new install" signal
    try { const s = fs.readFileSync(path.join(process.resourcesPath, 'install-stamp'), 'utf8').trim(); if (s) return `${id}:${s}`; } catch { /* older install / not Windows */ }
    if (!t) { const st = fs.statSync(f); t = st.birthtimeMs || st.mtimeMs; }
    return `${id}:${Math.floor(t)}`;
  } catch { return null; }   // dev mode
}
const MY_BUILD_STAMP = getBuildStamp();
const gotLock = app.requestSingleInstanceLock({ buildStamp: MY_BUILD_STAMP });
if (!gotLock) app.quit();
app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
  const otherStamp = additionalData && additionalData.buildStamp;
  if (otherStamp && otherStamp !== MY_BUILD_STAMP) {
    console.log('[Server] Newer build detected — restarting');
    app.relaunch();
    app.quit();
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show(); mainWindow.focus();
  } else if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show(); loginWindow.focus();
  } else if (app.isReady()) {
    createLoginWindow();   // the Admin UI always needs admin credentials
  }
});

// When packaged, all server files sit alongside server-main.js in app.asar (__dirname)
// In dev, __dirname is the server/ folder itself — same path either way
function getServerRoot() {
  return __dirname;
}

// ── Window + state refs ───────────────────────────────────────────────────────
let loginWindow   = null;
let mainWindow    = null;
let portPromptWindow = null;
let tray          = null;
let serverPort         = 0;
let serverStarted      = false;
let httpServerInstance = null;
let serverModule       = null;
let networkWindow      = null;
let startupDone        = false;   // no window may open by itself before the background start has finished

const LOGIN_PREFS_FILE = path.join(USER_DATA, 'server-login-prefs.json');

// The remembered password is encrypted with the OS keychain (Electron safeStorage), never stored as plain text.
// Older plain-text files are still read, and are rewritten encrypted the next time the admin signs in.
function getLoginPrefs() {
  const defaults = { username: 'admin', password: '', rememberPassword: false, autoLogin: false };
  try {
    if (fs.existsSync(LOGIN_PREFS_FILE)) {
      const p = { ...defaults, ...JSON.parse(fs.readFileSync(LOGIN_PREFS_FILE, 'utf8')) };
      if (p.passwordEnc) {
        try { p.password = safeStorage.decryptString(Buffer.from(p.passwordEnc, 'base64')); } catch { p.password = ''; }
      }
      delete p.passwordEnc;
      return p;
    }
  } catch {}
  return defaults;
}

function saveLoginPrefs(prefs) {
  try {
    const username = String((prefs && prefs.username) || 'admin');
    const out = { username, rememberPassword: !!(prefs && prefs.rememberPassword), autoLogin: !!(prefs && prefs.autoLogin) };
    if (out.rememberPassword) {
      // The sign-in form never shows the saved password, so an empty field means "keep the saved one"
      const existing = getLoginPrefs();
      const password = (prefs && prefs.password) || (existing.username === username ? existing.password : '');
      if (password && safeStorage.isEncryptionAvailable()) {
        out.passwordEnc = safeStorage.encryptString(password).toString('base64');
      } else {
        out.rememberPassword = false;   // cannot be stored safely - do not store it
      }
    }
    if (!out.rememberPassword) out.autoLogin = false;   // Auto Login needs the saved credentials
    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(LOGIN_PREFS_FILE, JSON.stringify(out, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    console.error('[Server] Failed to save login prefs:', e.message);
  }
}

// ── Windows Firewall rule verification (Requirement 7) ────────────────────────
function ensureWindowsFirewallRule() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const { exec } = require('child_process');
    const exe = process.execPath;
    const port = serverPort || parseInt(process.env.PORT || '5000', 10) || 5000;
    exec(`netsh advfirewall firewall show rule name="Panic Alarm Server"`, (err, stdout) => {
      if (err || !stdout.includes('Panic Alarm Server')) {
        exec(`netsh advfirewall firewall add rule name="Panic Alarm Server" dir=in action=allow program="${exe}" enable=yes profile=any`, () => {});
        exec(`netsh advfirewall firewall add rule name="Panic Alarm Server Outbound" dir=out action=allow program="${exe}" enable=yes profile=any`, () => {});
      }
    });
    exec(`netsh advfirewall firewall show rule name="Panic Alarm Server Port ${port}"`, (err, stdout) => {
      if (err || !stdout.includes(`Panic Alarm Server Port ${port}`)) {
        exec(`netsh advfirewall firewall add rule name="Panic Alarm Server Port ${port}" dir=in action=allow protocol=TCP localport=${port} enable=yes profile=any`, () => {});
      }
    });
  } catch {}
}

function setAutoLaunch(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
    });
  } catch {}
}

// ── New-install handling ──────────────────────────────────────────────────────
// afterPack.js stamps a new UUID into resources/install-id for every build; the file
// is also re-created each time the installer runs. If the stamp differs from the one seen on
// the previous launch, this is a new installation (first install, re-install or upgrade). When an old
// database exists the user ALWAYS chooses: keep it or start fresh. Starting fresh first backs the old
// database up, then creates a new one that carries over only the license (key validation).
const KEEP_SETTINGS = ['license_code', 'license_nonce', 'reset_nonce', 'machine_fallback_id'];
function isFreshInstall() {
  try {
    const currentId = MY_BUILD_STAMP;
    if (!currentId) return false;                          // dev mode → never reset

    const seenFile = path.join(SHARED_DATA, 'seen-install-id');
    let seenId = null;
    try { seenId = fs.readFileSync(seenFile, 'utf8').trim(); } catch { /* first launch */ }
    if (seenId === currentId) return false;

    if (!fs.existsSync(SHARED_DATA)) fs.mkdirSync(SHARED_DATA, { recursive: true });
    fs.writeFileSync(seenFile, currentId, 'utf8');
    return true;
  } catch (e) {
    console.error('[Server] Fresh-install check failed:', e.message);
    return false;
  }
}

function chooseKeepOrFresh() {
  const { dialog } = require('electron');
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Panic Alarm Server — Existing data found',
    message: 'Existing server data was found from a previous installation.',
    detail: 'Keep data (upgrade): clinics, users, alarm logs and settings are kept, and registered clients keep working.\n\n' +
            'Start fresh: all data is cleared (only the license activation is kept). The old database is saved as a backup file first, and clients must register again.',
    buttons: ['Keep data (upgrade)', 'Start fresh'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return choice === 1 ? 'fresh' : 'keep';
}

function resetDatabaseKeepingLicense(dbPath) {
  const Database = require('better-sqlite3');
  const kept = [];
  if (fs.existsSync(dbPath)) {
    try {
      const old = new Database(dbPath, { readonly: true, fileMustExist: true });
      for (const k of KEEP_SETTINGS) {
        const r = old.prepare('SELECT value FROM settings WHERE key=?').get(k);
        if (r) kept.push([k, r.value]);
      }
      old.close();
    } catch (e) { console.warn('[Server] Could not read license settings from old DB:', e.message); }
  }
  // Back up (rename together so the files stay consistent) instead of deleting
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { fs.renameSync(dbPath + suffix, `${dbPath}.backup-${stamp}${suffix}`); } catch { /* not present */ }
  }
  console.log(`[Server] Old database backed up as ${dbPath}.backup-${stamp}`);
  if (kept.length) {
    const fresh = new Database(dbPath);
    fresh.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const ins = fresh.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of kept) ins.run(k, v);
    fresh.close();
  }
  console.log(`[Server] Fresh install: database reset (kept ${kept.length} license setting(s))`);
}

// ── Global Server Process Lifecycle Handlers ──────────────────────────────────
global.__restartServerApp = () => {
  console.log('[Server] Restarting Panic Alarm Server application...');
  // --was-active: the server was active before this restart, so it comes back active by itself (no credentials needed)
  const args = process.argv.slice(1).filter(a => a !== '--was-active');
  if (serverModule && serverModule.getServerLoggedIn && serverModule.getServerLoggedIn()) args.push('--was-active');
  app.relaunch({ args });
  app.quit();
};

// Emergency system: stopping or restarting must be deliberate. Menu/tray actions ask first.
function confirmStop() {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Panic Alarm Server',
    message: 'Quit the Panic Alarm Server application?',
    detail: 'While the application is closed, NO panic alarms can be sent or received by any client. Only quit if you really mean to.',
    buttons: ['Keep Running', 'Quit Application'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return choice === 1;
}
const stopWithConfirm = () => { if (confirmStop()) global.__stopServerApp(); };

function confirmRestart() {
  // A saved-but-not-yet-applied address change makes this restart a client-affecting one: say so
  let notice = null;
  try { notice = serverModule && serverModule.getClientUrlNotice ? serverModule.getClientUrlNotice() : null; } catch { /* ignore */ }
  const urlWarning = notice && !notice.applied
    ? `\n\n⚠ The server address will change from ${notice.from} to ${notice.to}.\nThe same must be updated in ALL clients, otherwise they cannot connect.`
    : '';
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Panic Alarm Server',
    message: 'Restart the Panic Alarm Server application?',
    detail: 'The server is offline while it restarts - NO panic alarms can be sent or received by any client for a short time.' + urlWarning,
    buttons: ['Cancel', 'Restart Application'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return choice === 1;
}
const restartWithConfirm = () => { if (confirmRestart()) global.__restartServerApp(); };

// Windows watchdog (watchdog.vbs) restarts the server after a crash but must NOT after a deliberate stop.
const STOP_FLAG = process.platform === 'win32' && process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'PanicAlarm', 'server-stopped.flag') : null;
function setStopFlag(on) {
  if (!STOP_FLAG) return;
  try {
    if (on) { fs.mkdirSync(path.dirname(STOP_FLAG), { recursive: true }); fs.writeFileSync(STOP_FLAG, new Date().toISOString()); }
    else if (fs.existsSync(STOP_FLAG)) fs.unlinkSync(STOP_FLAG);
  } catch { /* best effort */ }
}
setStopFlag(false);   // every normal start clears a previous deliberate-stop marker

global.__stopServerApp = () => {
  console.log('[Server] Stopping and quitting Panic Alarm Server...');
  eventLog.info('server_stop_requested');
  setStopFlag(true);
  app.quit();
};

// ── Port Unavailable Conflict Handler (Requirement 6) ────────────────────────
// Is the busy port held by another Panic Alarm Server? (e.g. the same server already running in
// another OS user's session after a fast user switch) — resolves true only for our own /health reply.
function isPanicAlarmServerOn(port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { const j = JSON.parse(body); resolve(j.status === 'ok' && 'serverReady' in j); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Standby: another session already serves this computer. Stay quiet, and take over automatically
// the moment that session ends and the port frees up.
let standbyMode = false;
let portBusy = false;   // set synchronously when listen() fails with EADDRINUSE
function enterStandby(busyPort) {
  if (standbyMode) return;
  standbyMode = true;
  console.log(`[Server] Port ${busyPort} is served by another user session — standing by to take over`);
  rebuildTrayMenu(false);
  const timer = setInterval(async () => {
    if (await isPanicAlarmServerOn(busyPort)) return;
    clearInterval(timer);
    console.log('[Server] Other session ended — taking over the server');
    app.relaunch();
    app.quit();
  }, 5000);
}

global.__onServerPortError = (busyPort, err) => {
  console.error(`[Server] Port ${busyPort} unavailable callback triggered:`, err.message);
  portBusy = true;
  const handle = async () => {
    if (await isPanicAlarmServerOn(busyPort)) return enterStandby(busyPort);
    promptPortUnavailable(busyPort);
  };
  if (!app.isReady()) {
    app.whenReady().then(handle);
  } else {
    handle();
  }
};

function promptPortUnavailable(busyPort) {
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Panic Alarm Server — Port Unavailable',
    message: `Server Port ${busyPort} is currently unavailable because it is in use by another program on this computer.`,
    detail: 'The server requires an open network port to communicate with Panic Alarm clients.\n\nPlease choose an action below:',
    buttons: ['Auto-find Available Port', 'Change Port', 'Retry', 'Quit Server'],
    defaultId: 0,
    cancelId: 3,
    noLink: true,
  });

  if (choice === 0) {
    // Auto-find available port
    if (serverModule && serverModule.findAvailablePort) {
      serverModule.findAvailablePort(5000).then((freePort) => {
        if (serverModule.savePortSetting) serverModule.savePortSetting(freePort);
        dialog.showMessageBoxSync({
          type: 'info',
          title: 'Port Updated',
          message: `Found available port ${freePort}.`,
          detail: 'The server will now restart using this new port.',
          buttons: ['OK'],
        });
        app.relaunch();
        app.quit();
      });
    }
  } else if (choice === 1) {
    // Custom port prompt window
    showPortPromptWindow(busyPort);
  } else if (choice === 2) {
    // Retry
    app.relaunch();
    app.quit();
  } else {
    setStopFlag(true);   // user chose "Quit Server" — don't let the watchdog re-prompt every minute
    app.quit();
  }
}

function showPortPromptWindow(currentPort) {
  if (portPromptWindow && !portPromptWindow.isDestroyed()) {
    portPromptWindow.focus();
    return;
  }
  portPromptWindow = new BrowserWindow({
    width: 420, height: 260,
    resizable: false, center: true,
    title: 'Change Server Port',
    icon: path.join(__dirname, 'assets', 'server-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'server-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  portPromptWindow.setMenu(null);
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: -apple-system, "Segoe UI", sans-serif; background: #fff; padding: 20px; color: #1e293b; margin:0; }
h3 { margin: 0 0 8px 0; font-size: 15px; }
p { font-size: 12px; color: #64748b; margin: 0 0 14px 0; }
label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
input { width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 14px; border: 1.5px solid #cbd5e1; border-radius: 6px; margin: 6px 0 14px 0; outline: none; }
input:focus { border-color: #3b82d4; }
.btns { display: flex; gap: 8px; justify-content: flex-end; }
button { padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; border: none; }
.btn-save { background: #3b82d4; color: #fff; }
.btn-auto { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
</style>
</head>
<body>
<h3>Change Server Port</h3>
<p>Enter a port between 1024 and 65535 for the Panic Alarm Server.</p>
<label>Port Number</label>
<input type="number" id="portInput" value="${currentPort || 5000}" min="1024" max="65535">
<div class="btns">
  <button class="btn-auto" id="btnAuto">Auto-Find Port</button>
  <button class="btn-save" id="btnSave">Save & Restart</button>
</div>
<script>
document.getElementById('btnAuto').onclick = async () => {
  await window.serverAPI.autoFindPort();
};
document.getElementById('btnSave').onclick = async () => {
  const p = parseInt(document.getElementById('portInput').value, 10);
  if (!p || p < 1024 || p > 65535) {
    alert('Please enter a valid port between 1024 and 65535');
    return;
  }
  await window.serverAPI.changeServerPort(p);
};
</script>
</body>
</html>`;
  portPromptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  portPromptWindow.on('closed', () => { portPromptWindow = null; });
}
// ── Edit IP Address / Port window (tray + Server menu) ────────────────────────
// Changing where the whole alarm system listens is sensitive, so the window asks for the admin credentials
// before saving. It is NOT the Admin UI and never opens it.
function showNetworkWindow() {
  if (!app.isReady()) return;
  if (networkWindow && !networkWindow.isDestroyed()) { networkWindow.show(); networkWindow.focus(); return; }
  networkWindow = new BrowserWindow({
    width: 460, height: 640,
    resizable: false, center: true,
    title: 'Panic Alarm Server — Edit IP Address',
    icon: path.join(__dirname, 'assets', 'server-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'server-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  networkWindow.setMenu(null);
  networkWindow.loadFile(path.join(__dirname, 'renderer', 'server-network.html'));
  networkWindow.on('closed', () => { networkWindow = null; });
}



// ── Start embedded server ─────────────────────────────────────────────────────
function startEmbeddedServer() {
  if (serverStarted) return;
  serverStarted = true;
  try {
    // Port: use configured value from server.env if present
    if (process.env.PORT) {
      const configuredPort = parseInt(process.env.PORT, 10) || 0;
      process.env.PORT = String(configuredPort);
    }

    // Host
    if (!process.env.HOST) {
      process.env.HOST = '0.0.0.0';
    }

    // Database path: check if user provided DB_PATH, otherwise fall back to AppData folder
    if (!process.env.DB_PATH) {
      const dbDir = path.join(SHARED_DATA, 'data');
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
      process.env.DB_PATH = path.join(dbDir, 'panic_alarm.db');

      // One-time migration: builds before the shared folder kept the database under the OS user's profile
      const legacyDb = path.join(USER_DATA, 'data', 'panic_alarm.db');
      if (!fs.existsSync(process.env.DB_PATH) && fs.existsSync(legacyDb)) {
        try {
          for (const suffix of ['', '-wal', '-shm']) {
            if (fs.existsSync(legacyDb + suffix)) fs.copyFileSync(legacyDb + suffix, process.env.DB_PATH + suffix);
          }
          console.log('[Server] Migrated existing database to the shared data folder');
        } catch (e) { console.error('[Server] Database migration failed:', e.message); }
      }
    }

    // Every (re)install / upgrade: if data from a previous install exists, the user chooses keep or start fresh.
    if (isFreshInstall()) {
      const dbFile = path.resolve(process.env.DB_PATH);
      if (fs.existsSync(dbFile) && chooseKeepOrFresh() === 'fresh') {
        resetDatabaseKeepingLicense(dbFile);
      } else {
        console.log('[Server] New install: keeping existing data');
      }
    }

    const serverRoot = getServerRoot();
    const serverJs   = path.join(serverRoot, 'server.js');
    if (!fs.existsSync(serverJs)) {
      console.error('[Server] Cannot find server.js at:', serverJs);
      return;
    }
    // Load server module inline (same process — clean for desktop app).
    serverModule = require(serverJs);
    httpServerInstance = serverModule.server;

    const readPort = () => {
      if (httpServerInstance && httpServerInstance.address()) {
        const addr = httpServerInstance.address();
        if (addr && typeof addr === 'object' && addr.port) {
          serverPort = addr.port;
          return true;
        }
      }
      return false;
    };

    if (!readPort()) {
      // If listen callback hasn't fired yet, check again on next tick
      setTimeout(() => {
        readPort();
        console.log('[Server] Embedded server bound on port:', serverPort || process.env.PORT);
      }, 50);
    } else {
      console.log('[Server] Embedded server started on port:', serverPort);
    }
  } catch (e) {
    console.error('[Server] Failed to start embedded server:', e.message);
    eventLog.error('server_start_failed', { code: e.code || 'ERR', message: e.message });
    // Database upgrade problems must never be silent: the data is untouched (see db-migrate.js), so say so and stop.
    if (e.code === 'DB_TOO_NEW' || e.code === 'DB_MIGRATION_FAILED' || e.code === 'DB_BACKUP_FAILED') {
      const show = () => {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'Panic Alarm Server — Database upgrade',
          message: 'The server could not start because the database could not be upgraded safely.',
          detail: e.message + '\n\nNo data was lost or changed. Contact support before reinstalling.',
          buttons: ['Close'], noLink: true,
        });
        setStopFlag(true);   // do not let the watchdog restart-loop on this error
        app.exit(1);
      };
      if (app.isReady()) show(); else app.whenReady().then(show);
    }
  }
}

// ── Get local IP addresses ────────────────────────────────────────────────────
// Only addresses the server can really be reached on right now (re-checked by server.js every few seconds), so a
// disabled / unplugged adapter's IP never stays on screen. Never the raw OS list: that can still list dead adapters.
function getLocalIPs() {
  try { return serverModule && serverModule.getListeningIPs ? serverModule.getListeningIPs() : []; } catch { return []; }
}
// Address the server's own windows use to reach it (a server bound to one IP does not answer on localhost)
function getLocalHost() {
  try { return serverModule && serverModule.getLocalHost ? serverModule.getLocalHost() : 'localhost'; } catch { return 'localhost'; }
}

// ── Create login window ───────────────────────────────────────────────────────
function createLoginWindow() {
  if (!app.isReady() || standbyMode) return;
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }

  loginWindow = new BrowserWindow({
    width: 440, height: 680,
    resizable: false, center: true,
    title: 'Panic Alarm Server — Login',
    icon: path.join(__dirname, 'assets', 'server-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'server-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  loginWindow.setMenu(null);
  loginWindow.loadFile(path.join(__dirname, 'renderer', 'server-login.html'));
  loginWindow.on('closed', () => { loginWindow = null; });
}

// ── Create main admin window ──────────────────────────────────────────────────
function createMainWindow(adminToken) {
  if (!app.isReady() || standbyMode) return;
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.focus(); return; }
  if (!adminToken) return;   // the Admin UI is only ever opened right after a successful admin sign-in

  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width - 40),
    height: Math.min(860, height - 40),
    minWidth: 900, minHeight: 600,
    center: true,
    title: 'Panic Alarm — Admin Panel | Ciana Technologies',
    icon: path.join(__dirname, 'assets', 'server-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'server-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWindow.setMenu(buildAppMenu());

  const adminUrl = `http://${getLocalHost()}:${serverPort}/admin/#adminToken=${encodeURIComponent(adminToken)}`;
  mainWindow.loadURL(adminUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Forget the admin session: the Admin UI must ask for credentials every time it is opened
    require('electron').session.defaultSession.clearStorageData({ storages: ['localstorage'] }).catch(() => {});
    rebuildTrayMenu(true);
  });

  // Update tray menu
  rebuildTrayMenu(true);
}

// ── App menu (for macOS menu bar & Windows window menu) ───────────────────────
function buildAppMenu() {
  const ips   = getLocalIPs();
  const isLoggedIn = serverModule && serverModule.getServerLoggedIn ? serverModule.getServerLoggedIn() : false;

  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{
      label: 'Panic Alarm Server',
      submenu: [
        { label: 'About Panic Alarm Server', click: () => brand.showAbout(mainWindow) },
        { type: 'separator' },
        { label: '🔄 Restart Application', accelerator: 'CmdOrCtrl+Shift+R', click: restartWithConfirm },
        { label: '⏻ Quit Application', click: stopWithConfirm },
        { type: 'separator' },
        { label: 'Hide Panic Alarm Server', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: '🔄 Restart Application', accelerator: 'CmdOrCtrl+R', click: restartWithConfirm },
        { label: '⏻ Quit Application', click: stopWithConfirm },
      ],
    },
    {
      label: 'Server',
      submenu: [
        { label: `Status: ${isLoggedIn ? 'Active' : 'Awaiting Start'}`, enabled: false },
        { label: `Port: ${serverPort}`, enabled: false },
        { label: `IP: ${ipSummary(ips)}`, enabled: false },
        { type: 'separator' },
        { label: '📋 Copy Server URL', click: () => {
            const url = `http://${ips[0] || 'localhost'}:${serverPort}`;
            require('electron').clipboard.writeText(url);
          }
        },
        { label: '🌐 Edit IP Address...', click: showNetworkWindow },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ]
    },
    { label: 'About Us',   submenu: [{ label: `About ${brand.BRAND.name}`,   click: () => brand.showAbout(mainWindow) }] },
    { label: 'Contact Us', submenu: [{ label: `Contact ${brand.BRAND.name}`, click: () => brand.showContact(mainWindow) }] },
  ]);
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  if (process.platform === 'win32') {
    // Windows: use .ico — blue circle, visible in system tray
    tray = new Tray(path.join(__dirname, 'assets', 'server-icon.ico'));
  } else {
    // macOS: empty image + emoji label — single clean entry in menu bar
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('🖥️');
  }
  rebuildTrayMenu(false);
  // The Admin UI is never opened by a click on the tray icon: show the menu (Admin Login asks for credentials)
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
    else tray.popUpContextMenu();
  });
}

function isServerActive() {
  return serverModule && serverModule.getServerLoggedIn ? serverModule.getServerLoggedIn() : false;
}

// The admin chose "Auto Login" at the last sign-in, so the server may be started without credentials
function canStartWithoutLogin() {
  const p = getLoginPrefs();
  return !!(p.autoLogin && p.username && p.password);
}

// Start the server (mark it active) with the saved Auto Login credentials. NEVER opens the Admin UI.
async function startServerWithSavedLogin() {
  const prefs = getLoginPrefs();
  if (!prefs.autoLogin || !prefs.username || !prefs.password) return { ok: false, error: 'Auto Login is not set up. Use Admin Login and tick "Auto Login".' };
  const r = await attemptAutoLogin(prefs.username, prefs.password);
  if (r && r.ok && r.token) {
    if (serverModule && serverModule.setServerLoggedIn) serverModule.setServerLoggedIn(true);
    refreshMenus();
    return { ok: true };
  }
  return { ok: false, error: (r && r.error) || 'Sign-in with the saved credentials failed.' };
}

function openAdminLogin() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return; }
  createLoginWindow();   // always asks for admin credentials
}

let _menuSig = '';
function refreshMenus(force) {
  currentPort();   // pick up the bound port before comparing

  const w = activeIpWait();
  const sig = JSON.stringify([getLocalIPs(), serverPort, activeClientNotice(), isServerActive(), standbyMode, startupDone, canStartWithoutLogin(), !!(mainWindow && !mainWindow.isDestroyed()), w && [w.ip, w.ips, Math.floor(w.remainingSec / 15)]]);
  if (!force && sig === _menuSig) return;
  _menuSig = sig;
  rebuildTrayMenu(startupDone && !standbyMode);
  if (app.isReady()) Menu.setApplicationMenu(buildAppMenu());
}

// A short summary for menus: the main IP and how many others exist (the full list is in Edit IP Address)
function ipSummary(ips) {
  if (!ips.length) return 'N/A';
  return ips.length === 1 ? ips[0] : `${ips[0]}  (+${ips.length - 1} more)`;
}

// An IP appeared or disappeared (adapter enabled / disabled): tell whoever is at the server computer
global.__onNetworkChange = ({ added, removed, ips, port, boundHost }) => {
  refreshMenus(true);
  const lines = [];
  if (removed.length) {
    lines.push(`No longer available: ${removed.join(', ')}`);
    if (boundHost !== '0.0.0.0' && removed.includes(boundHost)) lines.push('The server is bound to this address and will restart on the remaining ones.');
    else lines.push(`Clients using http://${removed[0]}:${port} can no longer connect.`);
  }
  if (added.length) lines.push(`Now available: ${added.join(', ')}`);
  try {
    if (Notification.isSupported()) new Notification({ title: 'Panic Alarm Server — network change', body: lines.join('\n') }).show();
  } catch { /* notifications are best effort */ }
};

function activeClientNotice() {
  try { return serverModule && serverModule.getClientUrlNotice ? serverModule.getClientUrlNotice() : null; } catch { return null; }
}

// ── Waiting for the saved IP ──────────────────────────────────────────────────
// The server never moves to another IP by itself right away. While its saved IP is missing it tells the admin and
// offers: keep waiting / use the next available address / enter an IP. After 180 s without an answer it moves on.
function activeIpWait() {
  try { return serverModule && serverModule.getIpWaitInfo ? serverModule.getIpWaitInfo() : null; } catch { return null; }
}
let ipWaitDialog = null;   // AbortController of the question that is on screen
function closeIpWaitDialog() { if (ipWaitDialog) { try { ipWaitDialog.abort(); } catch { /* already closed */ } ipWaitDialog = null; } }

async function askIpWait() {
  const w = activeIpWait();
  if (!w || ipWaitDialog) return;
  const ctl = new AbortController();
  ipWaitDialog = ctl;
  const mins = Math.round(w.waitSec / 60 * 10) / 10;
  const buttons = [`Keep waiting for ${w.ip} (${mins} more min)`];
  const useNextIdx = w.nextIp ? buttons.push(`Use ${w.nextIp}:${w.port} now`) - 1 : -1;
  const enterIdx = buttons.push(w.ips.length > 1 ? `Choose from ${w.ips.length} available addresses…` : 'Enter another IP address…') - 1;
  buttons.push('Decide later');
  let res;
  try {
    res = await dialog.showMessageBox({
      type: 'warning',
      title: 'Panic Alarm Server — waiting for IP address',
      message: `Reconnecting to ${w.ip}:${w.port} …`,
      detail:
        `The saved server address ${w.ip}:${w.port} is not available on this computer right now. ` +
        `Clients keep using that address, so the server is waiting for it instead of changing it.\n\n` +
        (w.nextIp ? `Next available address: ${w.nextIp}:${w.port}\n\n` : 'No other IP address is available at the moment.\n\n') +
        `If you do nothing, in about ${Math.max(1, Math.round(w.remainingSec))} seconds the server will start listening on all available addresses.\n` +
        `Running clients are told the new address automatically; any that cannot follow must be updated by hand (Edit User Details).`,
      buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true, signal: ctl.signal,
    });
  } catch { res = null; }
  if (ipWaitDialog === ctl) ipWaitDialog = null;
  if (!res || ctl.signal.aborted) return;
  if (res.response === 0 && serverModule.ipWaitAction) await serverModule.ipWaitAction('wait');
  else if (res.response === useNextIdx && serverModule.ipWaitAction) {
    const r = await serverModule.ipWaitAction('use-next');
    if (!r.ok) dialog.showMessageBox({ type: 'error', title: 'Panic Alarm Server', message: 'Could not switch the address.', detail: r.error, buttons: ['OK'], noLink: true });
  } else if (res.response === enterIdx) showNetworkWindow();
  refreshMenus(true);
}

// The admin picked an available address while the server waits: confirm (clients are affected), then switch right now
async function useIpDuringWait(ip) {
  const w = activeIpWait();
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Panic Alarm Server — change address',
    message: `Use ${ip}:${w ? w.port : currentPort()} now?`,
    detail: `Clients currently use ${w ? w.ip + ':' + w.port : 'the saved address'}.\n\nRunning clients are told the new address automatically. Any client that is not running, or has an old version, must be updated by hand (Edit User Details).`,
    buttons: ['Cancel', `Use ${ip}`], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (choice !== 1) return;
  const r = serverModule.ipWaitAction ? await serverModule.ipWaitAction('use', ip) : { ok: false, error: 'Server is not ready yet' };
  if (!r.ok) dialog.showMessageBox({ type: 'error', title: 'Panic Alarm Server', message: 'Could not switch the address.', detail: r.error, buttons: ['OK'], noLink: true });
  refreshMenus(true);
}

function showIpNotification(title, body, onClick) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    if (onClick) n.on('click', onClick);
    n.show();
  } catch { /* notifications are best effort */ }
}

// An address change moves the Admin window's origin: point an open Admin window at the new one (sign-in is asked again)
function reloadAdminWindow(port) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(`http://${getLocalHost()}:${port || currentPort()}/admin/`).catch(() => {});
  }, 1500);
}

// The admin changed the port / address and the server moved to it without a restart: follow it here (tray text, the
// Admin window's address, the Windows firewall rule for the new port)
global.__onPortChanged = (port) => {
  if (port) serverPort = port;
  ensureWindowsFirewallRule();
  refreshMenus(true);
};

global.__onNetworkFailed = (host, port) => {
  showIpNotification('Panic Alarm Server — address change failed',
    `Could not start listening on ${host === '0.0.0.0' ? 'all interfaces' : host}:${port}. The server is back on its previous address; nothing changed for the clients.`);
  refreshMenus(true);
};

global.__onIpWait = (kind, info) => {
  if (kind === 'started' || kind === 'reminder') {
    showIpNotification('Panic Alarm Server — waiting for IP address',
      `Reconnecting to ${info.ip}:${info.port}. Next available: ${info.nextIp || 'none'}. Choose what to do in the dialog.`, askIpWait);
    askIpWait();
  } else if (kind === 'returned') {
    closeIpWaitDialog();
    showIpNotification('Panic Alarm Server — IP address is back', `${info.ip} is available again. Nothing changed for the clients.`);
    reloadAdminWindow(info.port);
  } else if (kind === 'resolved') {
    closeIpWaitDialog();
    showIpNotification('Panic Alarm Server — address changed', `Now using ${info.ip}:${info.port} (was ${info.oldIp}). Running clients were told the new address.`, showClientNoticeDialog);
    reloadAdminWindow(info.port);
  } else if (kind === 'timeout') {
    closeIpWaitDialog();
    showIpNotification('Panic Alarm Server — address changed', `${info.ip} did not come back. The server now listens on all available addresses. Running clients were told the new address; update the rest.`, showClientNoticeDialog);
    reloadAdminWindow(info.port);
  }
  refreshMenus(true);
};

function showClientNoticeDialog() {
  const n = activeClientNotice();
  if (!n) return;
  const r = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Panic Alarm Server — update all clients',
    message: 'The server address changed. Update it in ALL clients.',
    detail: `Old address: ${n.from}\nNew address: ${n.to}\n\nOn each client computer: right-click the Panic Alarm tray icon → Edit User Details → enter the new server address.\n\nClients that are not updated cannot receive or send alarms.`,
    buttons: ['Remind me later', 'All clients updated'],
    defaultId: 0, cancelId: 0, noLink: true,
  });
  if (r === 1 && serverModule.clearClientUrlNotice) { serverModule.clearClientUrlNotice(); refreshMenus(true); }
}

function rebuildTrayMenu(running) {
  if (!tray) return;
  const ips = getLocalIPs();
  const waitInfo = activeIpWait();   // while waiting, clients still use the saved address
  const clientUrl = waitInfo ? `http://${waitInfo.ip}:${waitInfo.port}` : `http://${ips[0] || 'localhost'}:${serverPort}`;
  const isLoggedIn = isServerActive();

  tray.setToolTip(running
    ? `Panic Alarm Server — ${isLoggedIn ? 'Active' : 'Not started'} (Port ${serverPort})`
    : (standbyMode ? 'Panic Alarm Server — Standby (running in another user session)' : 'Panic Alarm Server — Starting…'));

  const items = [
    { label: running ? (isLoggedIn ? `🟢 Server Active — Port ${serverPort}` : `🟡 Server Not Started — Port ${serverPort}`) : (standbyMode ? '⏸ Standby — server is running in another user session' : '⏳ Starting server…'), enabled: false },
    ...(running ? [
      { label: `IP: ${ipSummary(ips)}`, enabled: false },
      ...(activeClientNotice() ? [
        { label: `⚠ Address changed - update ALL clients  (${activeClientNotice().to})`, click: showClientNoticeDialog },
      ] : []),
      ...(waitInfo ? [
        { label: `⚠ Reconnecting to ${waitInfo.ip}:${waitInfo.port} (${waitInfo.remainingSec}s left)`, submenu: [
          { label: `Keep waiting for ${waitInfo.ip}`, click: () => { if (serverModule.ipWaitAction) serverModule.ipWaitAction('wait').then(() => refreshMenus(true)); } },
          { type: 'separator' },
          { label: waitInfo.ips.length ? 'Use an available address now:' : 'No other address is available right now', enabled: false },
          ...waitInfo.ips.slice(0, 8).map(ip => ({ label: `${ip}:${waitInfo.port}`, click: () => useIpDuringWait(ip) })),
          ...(waitInfo.ips.length > 8 ? [{ label: `+ ${waitInfo.ips.length - 8} more - use Edit IP Address`, click: showNetworkWindow }] : []),
          { type: 'separator' },
          { label: 'Enter another IP address…', click: showNetworkWindow },
        ] },
      ] : []),
      { type: 'separator' },
      { label: '🔑 Admin Login', click: openAdminLogin },
      ...(!isLoggedIn && canStartWithoutLogin() ? [
        { label: '▶  Start Server', click: async () => {
            const r = await startServerWithSavedLogin();
            if (!r.ok) dialog.showMessageBox({ type: 'error', title: 'Panic Alarm Server', message: 'The server could not be started.', detail: r.error, buttons: ['OK'], noLink: true });
          }
        },
      ] : []),
      { label: `📋 Copy Client URL  (${clientUrl})`, click: () => {
          require('electron').clipboard.writeText(clientUrl);
        }
      },
      { label: '🌐 Edit IP Address', click: showNetworkWindow },
      { type: 'separator' },
      { label: 'About Us', click: () => brand.showAbout(mainWindow) },
      { label: 'Contact Us', click: () => brand.showContact(mainWindow) },
      { type: 'separator' },
      { label: '🔄 Restart Application', click: restartWithConfirm },
      { label: '⏻ Quit Application', click: stopWithConfirm },
    ] : [
      { label: '⏻ Quit Application', click: stopWithConfirm }
    ]),
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ── Helper: attempt one HTTP login POST ───────────────────────────────────────
function currentPort() {
  if ((!serverPort || serverPort === 0) && httpServerInstance && httpServerInstance.address()) {
    const addr = httpServerInstance.address();
    if (addr && typeof addr === 'object' && addr.port) serverPort = addr.port;
  }
  return serverPort;
}

function attemptLogin(username, password) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ username, password });
    const req = http.request({
      hostname: getLocalHost(),
      port: currentPort(),
      path: '/api/admin/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 3000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode === 200 && json.token) {
            resolve({ ok: true, token: json.token });
          } else {
            resolve({ ok: false, error: json.error || 'Login failed', retry: false });
          }
        } catch {
          resolve({ ok: false, error: 'Invalid server response', retry: false });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, retry: true }));   // connection refused → retry
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, retry: true }); });
    req.write(postData);
    req.end();
  });
}

// ── IPC: login from login window — retries until server is ready ──────────────
ipcMain.handle('server-login', async (_, { username, password }) => {
  const RETRY_DELAYS = [300, 600, 1000, 1500, 2000, 2000, 2000, 1600]; // total ≈ 12 s
  let attempt = 0;

  while (attempt <= RETRY_DELAYS.length) {
    const result = await attemptLogin(username, password);
    if (!result.retry) return result;   // got a real response (ok or bad credentials)

    if (attempt >= RETRY_DELAYS.length) break;
    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    attempt++;
  }

  return { ok: false, error: 'Server did not start in time. Please quit and relaunch the app.' };
});

ipcMain.handle('login-success', (_, { token }) => {
  if (serverModule && serverModule.setServerLoggedIn) {
    serverModule.setServerLoggedIn(true);
  }
  // Close login window and open admin panel
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  // Token is passed in the URL hash so the admin panel logs in on first load
  createMainWindow(token);
  refreshMenus(true);
});

// The admin panel's session ran out (long uptime / PC slept). The Admin UI always asks for credentials, so the
// saved Auto Login credentials are NOT used to reopen it: the panel falls back to the login window.
ipcMain.handle('admin-relogin', async () => ({ ok: false }));

// Signing out only closes the Admin UI. The server itself keeps running (and stays active) so alarms keep working.
ipcMain.handle('admin-logout', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  createLoginWindow();
  refreshMenus(true);
});

ipcMain.handle('restart-server', () => { restartWithConfirm(); });

ipcMain.handle('stop-server', () => { stopWithConfirm(); });

ipcMain.handle('get-login-prefs', () => {
  const p = getLoginPrefs();
  // The saved password never leaves the main process; the form only needs to know one is saved
  return { username: p.username, rememberPassword: !!p.rememberPassword, autoLogin: !!p.autoLogin, hasSavedPassword: !!p.password };
});

ipcMain.handle('save-login-prefs', (_, prefs) => {
  saveLoginPrefs(prefs);
  refreshMenus(true);
  return { ok: true };
});

// ── Edit IP Address window ────────────────────────────────────────────────────
ipcMain.handle('network-get', async () => {
  if (!serverModule || !serverModule.getNetworkInfo) return { error: 'Server is not ready yet' };
  return serverModule.getNetworkInfo();
});

// Credentials are verified again here: changing the listening address is an admin-only action
ipcMain.handle('network-save', async (_, { host, port, username, password }) => {
  if (!serverModule || !serverModule.applyNetworkConfig) return { ok: false, error: 'Server is not ready yet' };
  const auth = await attemptLogin(String(username || ''), String(password || ''));
  if (!auth.ok) return { ok: false, error: auth.retry ? 'Server is not ready yet' : 'Invalid admin credentials' };
  const r = await serverModule.applyNetworkConfig({ host, port });
  if (!r.ok) return r;
  eventLog.info('network_config_changed_from_tray', { host: r.host, port: r.port });
  if (r.live) reloadAdminWindow(r.port);
  return { ok: true, host: r.host, port: r.port, urlChanged: r.urlChanged, oldUrl: r.oldUrl, newUrl: r.newUrl, live: !!r.live };
});

ipcMain.handle('network-dismiss-notice', () => {
  if (serverModule && serverModule.clearClientUrlNotice) serverModule.clearClientUrlNotice();
  refreshMenus(true);
  return { ok: true };
});

// The new IP / port are already saved; they take effect after a restart, which is confirmed first
ipcMain.handle('network-apply-restart', () => {
  if (!confirmRestart()) return { ok: false };
  if (networkWindow && !networkWindow.isDestroyed()) networkWindow.close();
  global.__restartServerApp();
  return { ok: true };
});

ipcMain.handle('auto-find-port', async () => {
  if (serverModule && serverModule.findAvailablePort) {
    const freePort = await serverModule.findAvailablePort(5000);
    if (serverModule.savePortSetting) serverModule.savePortSetting(freePort);
    if (portPromptWindow && !portPromptWindow.isDestroyed()) portPromptWindow.close();
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Port Updated',
      message: `Found available port ${freePort}.`,
      detail: 'The server will restart with the new port.',
      buttons: ['OK'],
    });
    app.relaunch();
    app.quit();
  }
});

ipcMain.handle('change-server-port', async (_, port) => {
  const p = parseInt(port, 10);
  if (serverModule && serverModule.savePortSetting) {
    serverModule.savePortSetting(p);
  }
  if (portPromptWindow && !portPromptWindow.isDestroyed()) portPromptWindow.close();
  dialog.showMessageBoxSync({
    type: 'info',
    title: 'Port Updated',
    message: `Server port set to ${p}.`,
    detail: 'The server will restart with the new port.',
    buttons: ['OK'],
  });
  app.relaunch();
  app.quit();
});

ipcMain.handle('get-server-info', () => {
  const ips = getLocalIPs();
  let port = serverPort;
  if ((!port || port === 0) && httpServerInstance && httpServerInstance.address()) {
    const addr = httpServerInstance.address();
    if (addr && typeof addr === 'object' && addr.port) {
      port = addr.port;
      serverPort = port;
    }
  }
  if (!port || port === 0) {
    const p = parseInt(process.env.PORT || '0', 10);
    if (p > 0) {
      port = p;
      serverPort = port;
    }
  }
  return { port: port || 0, ips, host: getLocalHost() };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
async function attemptAutoLogin(username, password) {
  const RETRY_DELAYS = [300, 600, 1000, 1500, 2000, 2000, 2000];
  let attempt = 0;
  while (attempt <= RETRY_DELAYS.length) {
    const result = await attemptLogin(username, password);
    if (!result.retry) return result;
    if (attempt >= RETRY_DELAYS.length) break;
    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    attempt++;
  }
  return { ok: false, error: 'Server not ready' };
}

app.whenReady().then(async () => {
  if (!gotLock) return;   // another instance owns the server — this one is quitting
  // Start embedded server immediately (before showing any window)
  startEmbeddedServer();
  createTray();
  ensureWindowsFirewallRule();
  setAutoLaunch(true);

  // Set global application menu for OS menu bar
  Menu.setApplicationMenu(buildAppMenu());

  // Wait for the port to bind (or fail). If another user session already owns the port,
  // this one stands by.
  if (httpServerInstance && !httpServerInstance.listening) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      const done = () => { clearTimeout(t); resolve(); };
      httpServerInstance.once('listening', done);
      httpServerInstance.once('error', done);
    });
  }
  if (portBusy) return;

  // The server runs in the background by default and NO window opens. If "Auto Login" is on (or the admin just
  // restarted with a saved password) the server is marked active silently with the saved credentials; the
  // Admin UI is only ever opened from the tray "Admin Login", which always asks for credentials.
  const prefs = getLoginPrefs();
  if (process.argv.includes('--was-active') && serverModule && serverModule.setServerLoggedIn) {
    serverModule.setServerLoggedIn(true);   // an admin-requested restart keeps the server active
  } else if (prefs.autoLogin && prefs.username && prefs.password) {
    console.log('[Server] Auto Login is enabled. Starting the server silently...');
    const result = await attemptAutoLogin(prefs.username, prefs.password);
    if (result.ok && result.token) {
      console.log('[Server] Server started with Auto Login');
      if (serverModule && serverModule.setServerLoggedIn) serverModule.setServerLoggedIn(true);
    } else {
      console.warn('[Server] Auto Login could not complete:', result.error);
    }
  }
  if (!isServerActive() && serverModule && serverModule.setServerLoggedIn) serverModule.setServerLoggedIn(false);

  startupDone = true;

  // The address clients use changed (by the admin's earlier edit, or by itself while the app was off): tell the
  // person at this computer once per start, without opening any window. The tray keeps the warning until dismissed.
  const notice = activeClientNotice();
  if (notice && notice.applied) {
    try {
      if (Notification.isSupported()) {
        const n = new Notification({
          title: 'Panic Alarm Server — update ALL clients',
          body: `The server address is now ${notice.to} (was ${notice.from}). The same must be updated in all clients.`,
        });
        n.on('click', showClientNoticeDialog);
        n.show();
      }
    } catch { /* notifications are best effort */ }
  }

  refreshMenus(true);
  // The IP list changes when an adapter is enabled/disabled: keep the tray and menus in step with it
  setInterval(() => refreshMenus(), 5000).unref();
});

// Always On: Handle system resume / unlock
if (powerMonitor) {
  powerMonitor.on('resume', () => {
    console.log('[Server] System resumed from sleep');
  });
  powerMonitor.on('unlock-screen', () => {
    console.log('[Server] Screen unlocked');
  });
}

// Global crash resilience & self-healing for Always-On server operation
let isExplicitQuit = false;
app.on('before-quit', () => {
  isExplicitQuit = true;
});

// The application was uninstalled / deleted while still running (e.g. dragged to the Trash on macOS):
// stop completely and stop starting at login. Packaged builds only.
if (app.isPackaged) {
  setInterval(() => {
    if (isExplicitQuit || fs.existsSync(process.execPath)) return;
    console.log('[Server] Application files were removed — exiting');
    try { app.setLoginItemSettings({ openAtLogin: false }); } catch {}
    isExplicitQuit = true;
    app.exit(0);
  }, 5000).unref();
}

app.on('render-process-gone', (event, webContents, details) => {
  console.error('[Server Crash Guard] Renderer process crashed:', details.reason);
  eventLog.error('renderer_crashed', { reason: details.reason });
  if (!isExplicitQuit) {
    if (mainWindow && mainWindow.webContents === webContents) {
      mainWindow = null;   // the Admin UI needs a fresh sign-in; the server itself is not affected
      refreshMenus(true);
    } else if (loginWindow && loginWindow.webContents === webContents) {
      loginWindow = null;
      setTimeout(createLoginWindow, 1000);
    }
  }
});

app.on('child-process-gone', (event, details) => {
  console.error('[Server Crash Guard] Child process exited:', details.reason);
  eventLog.error('child_process_gone', { reason: details.reason, type: details.type });
});

process.on('uncaughtException', (err) => {
  console.error('[Server Crash Guard] Uncaught exception:', err);
  eventLog.error('uncaught_exception', { message: err && err.message });
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server Crash Guard] Unhandled rejection:', reason);
  eventLog.error('unhandled_rejection', { message: reason && reason.message ? reason.message : String(reason) });
});

app.on('window-all-closed', () => {
  // Server stays running in tray — do NOT quit
});

// macOS: clicking the Dock icon is a deliberate request - it shows the admin sign-in, never the Admin UI directly
app.on('activate', () => {
  if (!app.isReady() || !startupDone) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show(); mainWindow.focus();
    return;
  }
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show(); loginWindow.focus();
    return;
  }
  createLoginWindow();
});

app.on('before-quit', () => {
  console.log('[Server] Shutting down…');
  eventLog.info('server_stopping', { explicit: isExplicitQuit });
});

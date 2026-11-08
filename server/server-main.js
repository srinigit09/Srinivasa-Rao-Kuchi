'use strict';

/**
 * Server Electron Wrapper
 * ──────────────────────────────────────────────────────────────
 * This wraps the Node.js panic alarm server in a desktop app.
 * On launch:
 *  1. Shows a login screen (username + password)
 *  2. Starts the built-in HTTP/Socket.IO server (port read from server.env)
 *  3. Opens the admin panel in a BrowserWindow after login
 *  4. System tray icon keeps the server running even when window is closed
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, powerMonitor } = require('electron');
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
const USER_DATA = app.getPath('userData');

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
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  else if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.show(); loginWindow.focus(); }
  else if (app.isReady()) createLoginWindow();
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
let suppressAutoLogin  = false;

const LOGIN_PREFS_FILE = path.join(USER_DATA, 'server-login-prefs.json');

function getLoginPrefs() {
  try {
    if (fs.existsSync(LOGIN_PREFS_FILE)) {
      return JSON.parse(fs.readFileSync(LOGIN_PREFS_FILE, 'utf8'));
    }
  } catch {}
  return { username: 'admin', password: '', rememberPassword: false, autoLogin: false };
}

function saveLoginPrefs(prefs) {
  try {
    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });
    fs.writeFileSync(LOGIN_PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8');
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
    exec(`netsh advfirewall firewall show rule name="Panic Alarm Server"`, (err, stdout) => {
      if (err || !stdout.includes('Panic Alarm Server')) {
        exec(`netsh advfirewall firewall add rule name="Panic Alarm Server" dir=in action=allow program="${exe}" enable=yes profile=any`, () => {});
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
// is also re-created each time the installer runs. If the stamp differs from the one
// seen on the previous launch, this is a new installation. When an old database exists
// the user chooses: keep it (upgrade) or start fresh. Starting fresh first backs the old
// database up, then creates a new one that carries over only the license (key validation).
const KEEP_SETTINGS = ['license_code', 'license_nonce', 'reset_nonce', 'machine_fallback_id'];

function isFreshInstall() {
  try {
    const currentId = MY_BUILD_STAMP;
    if (!currentId) return false;                          // dev mode → never reset

    const seenFile = path.join(USER_DATA, 'seen-install-id');
    let seenId = null;
    try { seenId = fs.readFileSync(seenFile, 'utf8').trim(); } catch { /* first launch */ }
    if (seenId === currentId) return false;

    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });
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
    detail: 'Keep data (upgrade): hospitals, users, alarm logs and settings are kept, and registered clients keep working.\n\n' +
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

// ── Port Unavailable Conflict Handler (Requirement 6) ────────────────────────
global.__onServerPortError = (busyPort, err) => {
  console.error(`[Server] Port ${busyPort} unavailable callback triggered:`, err.message);
  if (!app.isReady()) {
    app.whenReady().then(() => promptPortUnavailable(busyPort));
  } else {
    promptPortUnavailable(busyPort);
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
      const dbDir = path.join(USER_DATA, 'data');
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
      process.env.DB_PATH = path.join(dbDir, 'panic_alarm.db');
    }

    if (isFreshInstall()) {
      const dbFile = path.resolve(process.env.DB_PATH);
      // First ever install (no DB yet) → nothing to ask. Otherwise let the user decide.
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
  }
}

// ── Get local IP addresses ────────────────────────────────────────────────────
function getLocalIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

// ── Create login window ───────────────────────────────────────────────────────
function createLoginWindow() {
  if (!app.isReady()) return;
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
function createMainWindow() {
  if (!app.isReady()) return;
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.focus(); return; }

  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width - 40),
    height: Math.min(860, height - 40),
    minWidth: 900, minHeight: 600,
    center: true,
    title: 'Panic Alarm — Admin Panel',
    icon: path.join(__dirname, 'assets', 'server-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'server-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWindow.setMenu(buildAppMenu());

  const adminUrl = `http://localhost:${serverPort}/admin/`;
  mainWindow.loadURL(adminUrl);

  mainWindow.on('closed', () => { mainWindow = null; });

  // Update tray menu
  rebuildTrayMenu(true);
}

// ── App menu (for the main admin window) ─────────────────────────────────────
function buildAppMenu() {
  const ips   = getLocalIPs();
  const ipStr = ips.length ? ips.join(', ') : 'N/A';
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Quit Server', click: () => app.quit() },
      ],
    },
    {
      label: 'Server',
      submenu: [
        { label: `Running on port: ${serverPort}`, enabled: false },
        { label: `Server IP: ${ipStr}`, enabled: false },
        { type: 'separator' },
        { label: 'Copy Server URL', click: () => {
            const url = `http://${ips[0] || 'localhost'}:${serverPort}`;
            require('electron').clipboard.writeText(url);
          }
        },
      ],
    },
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
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show(); mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

function rebuildTrayMenu(running) {
  if (!tray) return;
  const ips = getLocalIPs();
  const clientUrl = `http://${ips[0] || 'localhost'}:${serverPort}`;
  tray.setToolTip(running
    ? `Panic Alarm Server — ${clientUrl}`
    : 'Panic Alarm Server — Starting…');
  const items = [
    { label: running ? `🟢 Server Running — Port ${serverPort}` : '⏳ Starting server…', enabled: false },
    ...(running ? [
      { label: `IP: ${ips.join(', ') || 'N/A'}`, enabled: false },
      { type: 'separator' },
      { label: `📋 Copy Client URL  (${clientUrl})`, click: () => {
          require('electron').clipboard.writeText(clientUrl);
        }
      },
    ] : []),
    { type: 'separator' },
    { label: 'Quit Server', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ── Helper: attempt one HTTP login POST ───────────────────────────────────────
function attemptLogin(username, password) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ username, password });
    const req = http.request({
      hostname: 'localhost',
      port: serverPort,
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
  // Close login window and open admin panel
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  // Pass admin token to the main window via session storage (injected via executeJavaScript after load)
  createMainWindow();
  // Inject the admin token into the admin panel page so it auto-logs in
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(
        `localStorage.setItem('adminToken', ${JSON.stringify(token)}); location.reload();`
      );
    });
  }
});

ipcMain.handle('admin-logout', () => {
  // Close the admin panel window and reopen the login window, suppressing auto-login
  suppressAutoLogin = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  createLoginWindow();
});

ipcMain.handle('get-login-prefs', () => {
  return getLoginPrefs();
});

ipcMain.handle('save-login-prefs', (_, prefs) => {
  saveLoginPrefs(prefs);
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
  return { port: port || 0, ips };
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

  // Check if Auto Login is enabled (Requirement 5 & 8)
  const prefs = getLoginPrefs();
  if (!suppressAutoLogin && prefs.autoLogin && prefs.username && prefs.password) {
    console.log('[Server] Auto Login is enabled. Attempting automatic sign-in...');
    const result = await attemptAutoLogin(prefs.username, prefs.password);
    if (result.ok && result.token) {
      console.log('[Server] Auto Login successful');
      createMainWindow();
      if (mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents.executeJavaScript(
            `localStorage.setItem('adminToken', ${JSON.stringify(result.token)}); location.reload();`
          );
        });
      }
      return;
    } else {
      console.warn('[Server] Auto Login could not complete:', result.error);
    }
  }

  // Show login window promptly if auto-login is not active
  setTimeout(createLoginWindow, 400);
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

// Global crash resilience for Always-On operation
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

app.on('window-all-closed', () => {
  // Server stays running in tray — do NOT quit
});

app.on('activate', () => {
  if (!app.isReady()) return;
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
  if (mainWindow && !mainWindow.isDestroyed())   { mainWindow.focus(); return; }
  createLoginWindow();
});

app.on('before-quit', () => {
  console.log('[Server] Shutting down…');
});

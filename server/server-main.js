'use strict';

/**
 * Server Electron Wrapper
 * ──────────────────────────────────────────────────────────────
 * This wraps the Node.js panic alarm server in a desktop app.
 * On launch:
 *  1. Shows a login screen (username + password)
 *  2. Starts the built-in HTTP/Socket.IO server on port 4000
 *  3. Opens the admin panel in a BrowserWindow after login
 *  4. System tray icon keeps the server running even when window is closed
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const os     = require('os');

// ── Paths ─────────────────────────────────────────────────────────────────────
const USER_DATA   = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA, 'server-config.json');

// When packaged, all server files sit alongside server-main.js in app.asar (__dirname)
// In dev, __dirname is the server/ folder itself — same path either way
function getServerRoot() {
  return __dirname;
}

// ── Window + state refs ───────────────────────────────────────────────────────
let loginWindow  = null;
let mainWindow   = null;
let tray         = null;
let serverProcess = null;   // child process (when running packaged)
let embeddedApp  = null;    // embedded express app (dev mode)
let serverPort   = 4000;
let serverStarted = false;

// ── Config persistence ────────────────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── Start embedded server ─────────────────────────────────────────────────────
function startEmbeddedServer() {
  if (serverStarted) return;
  serverStarted = true;
  try {
    // Set environment so server.js picks up our userData as DB path
    const dbDir = path.join(USER_DATA, 'data');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    process.env.DB_PATH = path.join(dbDir, 'panic_alarm.db');
    process.env.PORT    = String(serverPort);
    process.env.HOST    = '0.0.0.0';

    const serverRoot = getServerRoot();
    const serverJs   = path.join(serverRoot, 'server.js');
    if (!fs.existsSync(serverJs)) {
      console.error('[Server] Cannot find server.js at:', serverJs);
      return;
    }
    // Load server module inline (same process — clean for desktop app)
    require(serverJs);
    console.log('[Server] Embedded server started on port', serverPort);
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
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }

  loginWindow = new BrowserWindow({
    width: 400, height: 560,
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
  const img = nativeImage.createEmpty();

  tray = new Tray(img);
  tray.setTitle('🖥️');
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
  tray.setToolTip(running
    ? `Panic Alarm Server — Running on port ${serverPort}`
    : 'Panic Alarm Server — Starting…');
  const items = [
    { label: running ? `🟢 Server Running — Port ${serverPort}` : '⏳ Starting server…', enabled: false },
    ...(running ? [{ label: `IP: ${ips.join(', ') || 'N/A'}`, enabled: false }] : []),
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
  const MAX_WAIT_MS  = 12000;   // give up after 12 s
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
  // Close the admin panel window and reopen the login window
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  createLoginWindow();
});

ipcMain.handle('get-server-info', () => {
  const ips = getLocalIPs();
  return { port: serverPort, ips };
});

// ── IPC: download client installer ────────────────────────────────────────────
ipcMain.handle('download-client-installer', async () => {
  // Find the client installer in the sibling client/dist directory
  // or alongside the server dist folder (for packaged builds)
  const possibleDirs = [
    path.join(__dirname, '..', 'client', 'dist'),
    path.join(__dirname, 'client-dist'),
    path.join(process.resourcesPath || '', '..', '..', 'client', 'dist'),
  ];
  const extensions = ['.exe', '.dmg'];
  let installerPath = null;
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const ext of extensions) {
        const found = files.find(f => f.endsWith(ext) && f.toLowerCase().includes('panicalarmclient'));
        if (found) { installerPath = path.join(dir, found); break; }
      }
    }
    if (installerPath) break;
  }
  if (installerPath && fs.existsSync(installerPath)) {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: path.basename(installerPath),
      title: 'Save Client Installer',
    });
    if (filePath) {
      fs.copyFileSync(installerPath, filePath);
      shell.showItemInFolder(filePath);
      return { ok: true, path: filePath };
    }
  }
  return { ok: false, error: 'Client installer not found. Build the client first.' };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Start embedded server immediately (before showing any window)
  startEmbeddedServer();
  createTray();
  // Show login window promptly — the login IPC handler now retries automatically
  setTimeout(createLoginWindow, 400);
});

app.on('window-all-closed', () => {
  // Server stays running in tray — do NOT quit
});

app.on('activate', () => {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
  if (mainWindow && !mainWindow.isDestroyed())   { mainWindow.focus(); return; }
  createLoginWindow();
});

app.on('before-quit', () => {
  console.log('[Server] Shutting down…');
});

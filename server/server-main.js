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
    width: 400, height: 520,
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
      // Admin panel is served from the local HTTP server — no preload needed
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
        { label: 'Open Admin Panel', click: () => createMainWindow() },
        { type: 'separator' },
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
  const iconPath = path.join(__dirname, 'assets', 'server-icon.png');
  let img;
  try {
    img = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();
  } catch { img = nativeImage.createEmpty(); }

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
    { label: '📊 Open Admin Panel', click: createMainWindow },
    { type: 'separator' },
    { label: 'Quit Server', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ── IPC: login from login window ──────────────────────────────────────────────
ipcMain.handle('server-login', async (_, { username, password }) => {
  // Call our own running server's login API
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
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode === 200 && json.token) {
            resolve({ ok: true, token: json.token });
          } else {
            resolve({ ok: false, error: json.error || 'Login failed' });
          }
        } catch {
          resolve({ ok: false, error: 'Invalid server response' });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'Server not ready yet — please wait a moment and try again' }));
    req.write(postData);
    req.end();
  });
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

ipcMain.handle('get-server-info', () => {
  const ips = getLocalIPs();
  return { port: serverPort, ips };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Start embedded server immediately (before showing any window)
  startEmbeddedServer();
  createTray();
  // Small delay to let server initialize, then show login
  setTimeout(createLoginWindow, 800);
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

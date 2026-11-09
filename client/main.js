'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog, powerMonitor, Notification, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { io } = require('socket.io-client');

// ── Notification Helper ───────────────────────────────────────────────────────
let lastNotificationType = null;
function notifyClientUser(type, title, message) {
  if (lastNotificationType === type) return;
  lastNotificationType = type;
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: title || 'Panic Alarm',
        body: message || '',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        silent: false,
      }).show();
    }
  } catch (e) {
    console.warn('[Notify] Failed to display notification:', e.message);
  }
}

// ── Device-Based Shared Config Directory (Device-wide for all users) ──────────
function getSharedConfigDir() {
  if (process.platform === 'win32') {
    // Windows: C:\ProgramData\PanicAlarmClient (accessible to all Windows users on this device)
    const progData = process.env.ProgramData || process.env.ALLUSERSPROFILE || 'C:\\ProgramData';
    const sharedDir = path.join(progData, 'PanicAlarmClient');
    try {
      if (!fs.existsSync(sharedDir)) fs.mkdirSync(sharedDir, { recursive: true });
      const testFile = path.join(sharedDir, '.perm_test');
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
      return sharedDir;
    } catch (e) {
      console.warn('[Config] Shared ProgramData not writable, using userData fallback:', e.message);
      return app.getPath('userData');
    }
  } else if (process.platform === 'darwin') {
    // macOS: /Users/Shared/PanicAlarmClient (accessible to all macOS users without root)
    const sharedDir = '/Users/Shared/PanicAlarmClient';
    try {
      if (!fs.existsSync(sharedDir)) fs.mkdirSync(sharedDir, { recursive: true });
      return sharedDir;
    } catch {
      return app.getPath('userData');
    }
  } else {
    // Linux: /var/lib/panic-alarm-client or fallback
    const sharedDir = '/var/lib/panic-alarm-client';
    try {
      if (!fs.existsSync(sharedDir)) fs.mkdirSync(sharedDir, { recursive: true });
      return sharedDir;
    } catch {
      return app.getPath('userData');
    }
  }
}

const CONFIG_DIR        = getSharedConfigDir();
const CONFIG_FILE       = path.join(CONFIG_DIR, 'panic-alarm-config.json');
const LAST_SERVER_FILE  = path.join(CONFIG_DIR, 'last-server-url');   // survives config wipe
const LAST_HINT_FILE    = path.join(CONFIG_DIR, 'last-server-hint');  // serverUrl|hospitalCode
const SEEN_INSTALL_FILE = path.join(CONFIG_DIR, 'seen-install-id');   // tracks last seen install stamp

// Ensure config dir exists, migrate per-user legacy data if present, and seed hint
function initConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  // Migrate legacy per-user config from app.getPath('userData') to device-wide CONFIG_DIR
  try {
    const userDir = app.getPath('userData');
    if (userDir !== CONFIG_DIR && fs.existsSync(userDir)) {
      const userConfigFile = path.join(userDir, 'panic-alarm-config.json');
      if (fs.existsSync(userConfigFile) && !fs.existsSync(CONFIG_FILE)) {
        fs.copyFileSync(userConfigFile, CONFIG_FILE);
      }
      const userDeviceId = path.join(userDir, 'device-id');
      const sharedDeviceId = path.join(CONFIG_DIR, 'device-id');
      if (fs.existsSync(userDeviceId) && !fs.existsSync(sharedDeviceId)) {
        fs.copyFileSync(userDeviceId, sharedDeviceId);
      }
    }
  } catch (err) {
    console.warn('[Config] Migration check notice:', err.message);
  }

  // Seed last-server-hint from .bak if hint file doesn't exist yet
  if (!fs.existsSync(LAST_HINT_FILE)) {
    const bakFile = CONFIG_FILE + '.bak';
    try {
      const bak = JSON.parse(fs.readFileSync(bakFile, 'utf8'));
      if (bak.serverUrl) {
        const hint = JSON.stringify({ serverUrl: bak.serverUrl, hospitalCode: bak.hospitalCode || '' });
        fs.writeFileSync(LAST_HINT_FILE, hint, 'utf8');
        fs.writeFileSync(LAST_SERVER_FILE, bak.serverUrl, 'utf8');
      }
    } catch { /* no bak — first ever install */ }
  }

  // Remove legacy installed-version file if present
  const legacyVer = path.join(CONFIG_DIR, 'installed-version');
  if (fs.existsSync(legacyVer)) fs.unlinkSync(legacyVer);
}

// ── Windows Firewall rule verification (Requirement 7) ────────────────────────
function ensureWindowsFirewallRule() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const { exec } = require('child_process');
    const exe = process.execPath;
    exec(`netsh advfirewall firewall show rule name="Panic Alarm Client"`, (err, stdout) => {
      if (err || !stdout.includes('Panic Alarm Client')) {
        exec(`netsh advfirewall firewall add rule name="Panic Alarm Client" dir=in action=allow program="${exe}" enable=yes profile=any`, () => {});
        exec(`netsh advfirewall firewall add rule name="Panic Alarm Client Outbound" dir=out action=allow program="${exe}" enable=yes profile=any`, () => {});
      }
    });
  } catch {}
}

/**
 * Detect whether this is a fresh installation or just a reopen.
 *
 * How it works:
 *   - At build time, afterPack.js stamps a unique UUID into resources/install-id
 *     inside the packaged app bundle. This file IS replaced on every reinstall.
 *   - On first launch after any install we read that UUID and save it to
 *     userData/seen-install-id (which survives reopens but NOT reinstalls,
 *     because userData persists across reopens).
 *   - Wait — userData is NOT wiped by the installer, so seen-install-id also
 *     survives reinstall. The key is: resources/install-id CHANGES each build
 *     (new UUID), so comparing the two reveals a reinstall.
 *
 * Returns true if this is a fresh install (config should be wiped).
 */
function isFreshInstall() {
  // The build-time UUID is identical when the same installer is run twice, so the stamp also
  // includes the file's creation time — it is new every time the installer writes the file.
  const currentId = getBuildStamp();
  if (!currentId) return false;  // dev mode / no stamp → treat as reopen

  let seenId = null;
  try { seenId = fs.readFileSync(SEEN_INSTALL_FILE, 'utf8').trim(); } catch { /* not yet written */ }

  if (seenId === currentId) return false;  // same install — just a reopen

  // New install-id → fresh install. Save it so subsequent reopens pass through.
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SEEN_INSTALL_FILE, currentId, 'utf8');
  return true;
}

/** Fresh install = full reset: registration, saved server address, device identity. */
function wipeConfigForFreshInstall() {
  for (const f of [CONFIG_FILE, CONFIG_FILE + '.bak', LAST_SERVER_FILE, LAST_HINT_FILE,
                   path.join(CONFIG_DIR, 'device-id')]) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
}

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return null; }
}
function saveConfig(cfg) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  // Persist server hint so it survives future config wipes
  if (cfg.serverUrl) {
    fs.writeFileSync(LAST_SERVER_FILE, cfg.serverUrl, 'utf8');
    const hint = JSON.stringify({ serverUrl: cfg.serverUrl, hospitalCode: cfg.hospitalCode || '' });
    fs.writeFileSync(LAST_HINT_FILE, hint, 'utf8');
  }
}
function getLastServerHint() {
  try {
    const raw = fs.readFileSync(LAST_HINT_FILE, 'utf8').trim();
    return JSON.parse(raw);   // { serverUrl, hospitalCode }
  } catch {
    // Fall back to plain last-server-url file
    try { return { serverUrl: fs.readFileSync(LAST_SERVER_FILE, 'utf8').trim(), hospitalCode: '' }; }
    catch { return null; }
  }
}
function getOrCreateDeviceId() {
  const f = path.join(CONFIG_DIR, 'device-id');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const id = require('crypto').randomUUID();
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(f, id);
  return id;
}

// ── Window refs ────────────────────────────────────────────────────────────────
let setupWindow    = null;   // first-run wizard (closes after setup)
let alarmButton    = null;   // floating round ALERT button (all roles)
let alertPopup     = null;   // alert notification popup (all roles)
let settingsWindow = null;   // tray → My Details
let activeAlarmData = null;  // currently active alarm payload
let tray           = null;
let socket         = null;   // Socket.IO connection in main process
let isQuitting     = false;  // true once the user has quit — suppresses disconnect dialog
let isServerReadyState = false; // true when server has reported authenticated ready state

// ── Single instance lock — prevents multiple tray icons ──────────────────────
// Identifies THIS build/install (read once at startup, so a running old process keeps its old id
// even after the installer has replaced the files on disk).
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
if (!gotLock) {
  // Another instance is already running — quit this one immediately.
  // If that instance is an OLDER build it will notice and restart itself with the new code.
  app.quit();
}
app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
  // A newer build was launched while this old one was still running in the tray:
  // restart so the freshly installed code is the one that runs.
  const otherStamp = additionalData && additionalData.buildStamp;
  if (otherStamp && otherStamp !== MY_BUILD_STAMP) {
    console.log('[App] Newer build detected — restarting');
    isQuitting = true;
    app.relaunch();
    app.quit();
    return;
  }

  const config = loadConfig();
  if (!config || !config.token) {
    // Unconfigured — show setup wizard
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.show(); setupWindow.focus(); setupWindow.moveTop();
    } else {
      createSetupWindow();
    }
    return;
  }

  // Configured client: clicking application icon brings Panic Alarm button to top
  if (!alarmButton || alarmButton.isDestroyed()) {
    createAlarmButton(config);
  } else {
    alarmButton.show();
    alarmButton.setAlwaysOnTop(true, 'screen-saver');
    alarmButton.focus();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO — runs in main process, no renderer window needed
// ═══════════════════════════════════════════════════════════════════════════════
function connectSocket(config) {
  if (socket) {
    socket.off();          // remove all listeners before disconnecting to prevent spurious events
    socket.disconnect();
    socket = null;
  }

  if (!config.serverUrl || !config.token) {
    console.error('[Socket] Cannot connect — missing serverUrl or token in config');
    return;
  }

  console.log('[Socket] Connecting to', config.serverUrl);
  socket = io(config.serverUrl, {
    transports        : ['websocket', 'polling'],
    reconnection      : true,
    reconnectionAttempts: Infinity,
    reconnectionDelay : 2000,
    reconnectionDelayMax: 5000,
    timeout           : 10000,
    auth              : { token: config.token },
  });
  let wasConnected = false;

  socket.on('connect', () => {
    console.log('[Socket] Connected to server transport');
    wasConnected = true;
    socket.emit('join', {
      hospitalCode: (config.hospitalCode || '').toUpperCase(),
      userName    : config.user_name || config.role,
      deviceId    : config.deviceId,
    });
  });

  socket.on('server_state', (state) => {
    console.log('[Socket] Server readiness state:', state);
    isServerReadyState = !!(state && state.ready);
    if (isServerReadyState) {
      rebuildTrayMenu(config, 'connected');
      if (!alarmButton || alarmButton.isDestroyed()) {
        createAlarmButton(config);
      }
      // No popup on (re)connect — only record the state so a later failure is notified again
      lastNotificationType = 'connected';
    } else {
      // Server is running but Admin is not logged in yet — do not show button
      if (alarmButton && !alarmButton.isDestroyed()) {
        alarmButton.close();
      }
      rebuildTrayMenu(config, 'awaiting_login');
      notifyClientUser('awaiting_login', 'Server Awaiting Admin Login', 'Panic Alarm server is running but awaiting administrator sign-in. Alarm button will appear once Admin logs in.');
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected from server (${reason}) — retrying automatically in background...`);
    wasConnected = false;
    isServerReadyState = false;
    rebuildTrayMenu(config, 'disconnected');
    if (alarmButton && !alarmButton.isDestroyed()) alarmButton.close();
    if (shell && shell.beep) shell.beep();
    notifyClientUser('disconnected', 'Panic Alarm Server Unavailable', `Cannot connect to Panic Alarm Server at ${config.serverUrl}. Reconnecting automatically...`);
  });

  socket.on('connect_error', (err) => {
    console.log('[Socket] Connection attempt error:', err.message, '— will keep retrying...');
    isServerReadyState = false;
    rebuildTrayMenu(config, 'disconnected');
    if (alarmButton && !alarmButton.isDestroyed()) alarmButton.close();
    notifyClientUser('disconnected', 'Panic Alarm Server Unavailable', `Panic Alarm Server at ${config.serverUrl} is currently unreachable. Reconnecting automatically in background...`);
  });

  // ── This is the key event — show popup on every registered PC ────────────────
  socket.on('panic_alarm', (alarmData) => {
    console.log('[Alarm] Received:', alarmData.triggeredBy, alarmData.locationLabel || alarmData.roomNumber);
    showAlertPopup(alarmData);
  });

  socket.on('alarm_acknowledged', ({ alarmId, ackBy }) => {
    // Update the popup if it's showing the same alarm
    if (alertPopup && !alertPopup.isDestroyed()) {
      alertPopup.webContents.send('alarm-acked', { alarmId, ackBy });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WINDOWS
// ═══════════════════════════════════════════════════════════════════════════════

// ── First-run setup wizard ─────────────────────────────────────────────────────
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 500, height: 680,
    resizable: false, center: true,
    title: 'Panic Alarm — New User Registration',
    show: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  setupWindow.setMenu(null);
  setupWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  setupWindow.show();
  setupWindow.focus();
  setupWindow.moveTop();
  setupWindow.on('closed', () => { setupWindow = null; hideDock(); });
}

// ── Doctor: floating round red ALERT button ────────────────────────────────────
function createAlarmButton(config) {
  // Close existing button first — ensures only one ever exists
  if (alarmButton && !alarmButton.isDestroyed()) {
    alarmButton.close();
    alarmButton = null;
  }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  alarmButton = new BrowserWindow({
    width: 90, height: 90,
    x: sw - 106, y: sh - 106,
    frame: false, transparent: true,
    alwaysOnTop: true, resizable: false, skipTaskbar: true,
    title: 'PANIC ALARM',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  alarmButton.setMenu(null);
  alarmButton.loadFile(path.join(__dirname, 'renderer', 'alarm_button.html'));
  alarmButton.webContents.once('did-finish-load', () => {
    alarmButton.webContents.send('client-config', config);
  });
  alarmButton.on('closed', () => {
    alarmButton = null;
    rebuildTrayMenu(loadConfig(), socket?.connected || false);
  });
}

// ── Alert popup — shown when a panic alarm is received ────────────────────────
function showAlertPopup(alarmData) {
  activeAlarmData = alarmData;
  // If a popup is already open, just update it with the new alarm
  if (alertPopup && !alertPopup.isDestroyed()) {
    alertPopup.webContents.send('new-alarm', alarmData);
    alertPopup.show();
    alertPopup.focus();
    alertPopup.setAlwaysOnTop(true, 'screen-saver');
    alertPopup.moveTop();
    return;
  }

  const primary = screen.getPrimaryDisplay();

  alertPopup = new BrowserWindow({
    width: 580, height: 260, useContentSize: true,
    x: Math.round((primary.workAreaSize.width - 580) / 2),
    y: 20,
    frame: false, alwaysOnTop: true, resizable: false,
    skipTaskbar: false,
    title: 'PANIC ALARM',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  alertPopup.setMenu(null);
  alertPopup.setAlwaysOnTop(true, 'screen-saver');
  alertPopup.loadFile(path.join(__dirname, 'renderer', 'alert_popup.html'));
  alertPopup.webContents.once('did-finish-load', () => {
    alertPopup.show();
    alertPopup.focus();
    alertPopup.setAlwaysOnTop(true, 'screen-saver');
    alertPopup.moveTop();
    alertPopup.webContents.send('new-alarm', alarmData);
  });
  alertPopup.on('closed', () => { alertPopup = null; activeAlarmData = null; });
}

// ── Settings window (Edit My Profile) ────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  const config = loadConfig();
  settingsWindow = new BrowserWindow({
    width: 500, height: 680,
    resizable: false, center: true,
    title: 'Panic Alarm — User Details',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.webContents.once('did-finish-load', () => {
    settingsWindow.webContents.send('client-config', config);
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TRAY
// ═══════════════════════════════════════════════════════════════════════════════
function createTray(config) {
  // Destroy any existing tray first — prevents duplicate icons on re-launch
  if (tray) { try { tray.destroy(); } catch { /* already gone */ } tray = null; }
  if (process.platform === 'win32') {
    // Windows: use .ico — teal circle, visible in system tray
    tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'));
  } else {
    // macOS: empty image + emoji label — single clean entry in menu bar
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('🏥');
  }
  rebuildTrayMenu(config, false);

  tray.on('click', () => {
    const currentCfg = loadConfig();
    if (!currentCfg || !currentCfg.token) {
      if (!setupWindow || setupWindow.isDestroyed()) createSetupWindow();
      else { setupWindow.show(); setupWindow.focus(); }
      return;
    }
    // Left-clicking tray icon brings Panic Alarm button to top
    if (!alarmButton || alarmButton.isDestroyed()) {
      createAlarmButton(currentCfg);
    } else {
      alarmButton.show();
      alarmButton.setAlwaysOnTop(true, 'screen-saver');
      alarmButton.focus();
    }
  });
}

function rebuildTrayMenu(config, state) {
  if (!tray) return;
  const isConnected = state === 'connected' || state === true;
  const isAwaitingLogin = state === 'awaiting_login';

  const statusLabel = isConnected
    ? '🟢 Connected & Active'
    : (isAwaitingLogin ? '🟡 Server Awaiting Admin Login' : '🔴 Server Unavailable (Retrying...)');

  const roleLabel = config
    ? (config.role === 'doctor' ? '👨‍⚕️ Doctor' : config.role === 'nurse' ? '🩺 Nurse' : '👤 Staff')
    : '';
  const roomField = config && config.role === 'doctor' ? 'Consulting Room'
    : config && config.role === 'nurse' ? 'Treatment Room' : '';
  const roomLine  = config ? (roomField ? `${roomField}: ${config.room_number || '—'}` : (config.room_number || '—')) : '';
  const serverInfo = config && config.serverUrl ? `Server: ${config.serverUrl}` : '⚠️ Server URL not set — open My Details';
  const items = config ? [
    { label: roleLabel, enabled: false },
    { label: roomLine, enabled: false },
    { label: `Hospital: ${config.clientName || config.hospitalCode}`, enabled: false },
    { label: serverInfo, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: '✏️  Edit User Details', click: createSettingsWindow },
    {
      label: alarmButton && !alarmButton.isDestroyed()
        ? '🔴  Panic Alarm: ON'
        : '▶  Show Panic Alarm',
      click: () => {
        if (!alarmButton || alarmButton.isDestroyed()) createAlarmButton(loadConfig());
      },
      enabled: isConnected && (!alarmButton || alarmButton.isDestroyed()),
    },
    { type: 'separator' },
    { label: '🔄 Reconnect Now', click: () => { connectSocket(loadConfig()); } },
    { label: 'Quit Panic Alarm', click: () => app.quit() },
  ] : [
    { label: '🚨 Panic Alarm — Click to Setup', enabled: false },
    { type: 'separator' },
    { label: '▶  Open Setup Wizard', click: () => {
        if (app.dock) app.dock.show();
        if (!setupWindow || setupWindow.isDestroyed()) createSetupWindow();
        else { setupWindow.show(); setupWindow.focus(); setupWindow.moveTop(); }
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(config
    ? `Panic Alarm — ${statusLabel} (${config.serverUrl || ''})`
    : 'Panic Alarm — Click to Setup');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('get-config',           () => loadConfig());
ipcMain.handle('get-current-alarm',    () => activeAlarmData);
// Alert popup reports its content height so the window can fit it exactly
ipcMain.on('resize-alert', (_e, h) => {
  const height = Math.min(Math.max(Math.round(Number(h)) || 0, 150), 500);
  if (alertPopup && !alertPopup.isDestroyed()) alertPopup.setContentSize(580, height);
});
ipcMain.handle('get-device-id',        () => getOrCreateDeviceId());
ipcMain.handle('get-last-server-hint', () => getLastServerHint());
ipcMain.handle('get-connection-status',() => ({ connected: socket?.connected || false }));

// Called by setup.html after successful registration
ipcMain.handle('setup-complete', (_, config) => {
  saveConfig(config);
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  launchAfterSetup(config);  // hides dock inside
});

// Called by settings.html after saving changes
ipcMain.handle('settings-updated', (_, newConfig) => {
  saveConfig(newConfig);
  rebuildTrayMenu(newConfig, socket?.connected || false);
  // Reconnect socket with new token
  connectSocket(newConfig);
  // Update alarm button if open
  if (alarmButton && !alarmButton.isDestroyed()) {
    alarmButton.webContents.send('client-config', newConfig);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

// Alert popup dismiss (called from alert_popup.html)
ipcMain.handle('dismiss-alert', () => {
  if (alertPopup && !alertPopup.isDestroyed()) alertPopup.close();
});

// Alarm transmission failure alert
ipcMain.on('alarm-delivery-failed', () => {
  if (shell && shell.beep) shell.beep();
  notifyClientUser(
    'alarm_failed',
    '🚨 CRITICAL: Panic Alarm Transmission Failed!',
    'The panic alarm could not reach the server. Please check your network connection immediately!'
  );
});

// Drag the frameless alarm button
ipcMain.on('move-alarm-window', (_, { dx, dy }) => {
  if (!alarmButton || alarmButton.isDestroyed()) return;
  const [x, y] = alarmButton.getPosition();
  alarmButton.setPosition(x + dx, y + dy);
});

// ── Alert button colour ────────────────────────────────────────────────────────
const COLOUR_LABELS = [
  '🔴 Red', '🟠 Orange', '🟡 Yellow',
  '🟢 Green (default)', '🔵 Blue', '🟣 Purple', '⚫ Dark',
];

// Right-click on alarm button → colour picker + solid toggle + Quit
ipcMain.on('show-colour-menu', () => {
  if (!alarmButton || alarmButton.isDestroyed()) return;
  const config  = loadConfig();
  const current = config?.alertButtonColour ?? 3;
  const solid   = config?.alertButtonSolid  ?? false;
  const menu = Menu.buildFromTemplate([
    {
      label: '🎨  Change Colour',
      submenu: COLOUR_LABELS.map((label, idx) => ({
        label,
        type   : 'radio',
        checked: idx === current,
        click  : () => {
          if (alarmButton && !alarmButton.isDestroyed()) {
            alarmButton.webContents.send('alert-colour-change', idx);
          }
        },
      })),
    },
    {
      label  : solid ? '◑  Solid (on) — click to make transparent' : '◑  Transparent (on) — click to make solid',
      type   : 'normal',
      click  : () => {
        if (alarmButton && !alarmButton.isDestroyed()) {
          alarmButton.webContents.send('alert-solid-change', !solid);
        }
      },
    },
    { type: 'separator' },
    { label: '✖  Quit Alarm Button', click: () => {
        if (alarmButton && !alarmButton.isDestroyed()) alarmButton.close();
      }
    },
  ]);
  menu.popup({ window: alarmButton });
});

// Persist colour selection from renderer
ipcMain.handle('set-alert-colour', (_, idx) => {
  const config = loadConfig();
  if (!config) return;
  config.alertButtonColour = idx;
  saveConfig(config);
});

// Persist solid toggle from renderer
ipcMain.handle('set-alert-solid', (_, solid) => {
  const config = loadConfig();
  if (!config) return;
  config.alertButtonSolid = solid;
  saveConfig(config);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTO-LAUNCH (login item) — silent, no macOS popup notification
// ═══════════════════════════════════════════════════════════════════════════════
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin : enabled,
    // openAsHidden intentionally omitted — it triggers macOS "added to login items" popup
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════════════
function hideDock() {
  // On macOS hide the dock icon — app lives entirely in the system tray
  if (app.dock) app.dock.hide();
}

let reconnectWatchdogTimer = null;
function startReconnectWatchdog(config) {
  if (reconnectWatchdogTimer) clearInterval(reconnectWatchdogTimer);
  reconnectWatchdogTimer = setInterval(async () => {
    if (isQuitting) return;
    const currentConfig = loadConfig() || config;
    if (!currentConfig || !currentConfig.token || !currentConfig.serverUrl) return;

    // 1. Ensure socket stays connected
    if (socket && !socket.connected) {
      console.log('[Watchdog] Socket disconnected — connecting to server...');
      socket.connect();
    }

    // 2. Redundant HTTP health check: ensures instant auto-start as soon as server is ready
    try {
      const resp = await fetch(`${currentConfig.serverUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data && data.serverReady && !isServerReadyState) {
          console.log('[Watchdog] Server ready detected via health probe — autostarting alarm button');
          isServerReadyState = true;
          rebuildTrayMenu(currentConfig, 'connected');
          if (!alarmButton || alarmButton.isDestroyed()) {
            createAlarmButton(currentConfig);
          }
          if (socket && !socket.connected) socket.connect();
        } else if (data && data.serverReady === false && isServerReadyState) {
          isServerReadyState = false;
          if (alarmButton && !alarmButton.isDestroyed()) alarmButton.close();
          rebuildTrayMenu(currentConfig, 'awaiting_login');
        }
      }
    } catch {
      // Server currently unreachable
    }

    // 3. Ensure Panic Alarm button automatically appears and stays on top whenever server is ready
    if (isServerReadyState) {
      if (!alarmButton || alarmButton.isDestroyed()) {
        console.log('[Watchdog] Autostarting Panic Alarm button...');
        createAlarmButton(currentConfig);
      } else {
        alarmButton.setAlwaysOnTop(true, 'screen-saver');
      }
    }
  }, 2500);
}

function launchAfterSetup(config) {
  hideDock();
  setAutoLaunch(true);
  rebuildTrayMenu(config, false);
  // Alarm button only appears once socket connects — see socket.on('connect')
  connectSocket(config);
  startReconnectWatchdog(config);
}

app.whenReady().then(() => {
  if (!gotLock) return;   // duplicate instance is quitting — must not touch config or create a tray
  initConfigDir();
  hideDock();
  ensureWindowsFirewallRule();

  // Detect reinstall: if resources/install-id changed since last launch, wipe config
  if (isFreshInstall()) {
    wipeConfigForFreshInstall();
  }

  const config = loadConfig();
  if (config && config.token) {
    // Existing registration found — reopen, go straight to running
    createTray(config);
    launchAfterSetup(config);
  } else {
    // Fresh install or no config — show registration form
    createTray(null);
    createSetupWindow();
  }
});

// Always On: Reconnect on system wake / unlock
if (powerMonitor) {
  powerMonitor.on('resume', () => {
    const config = loadConfig();
    if (config && socket && !socket.connected) {
      console.log('[App] System resumed from sleep — reconnecting socket');
      socket.connect();
    }
  });
  powerMonitor.on('unlock-screen', () => {
    const config = loadConfig();
    if (config && socket && !socket.connected) {
      console.log('[App] Screen unlocked — reconnecting socket');
      socket.connect();
    }
  });
}

// Global crash resilience & self-healing for Always-On operation
app.on('render-process-gone', (event, webContents, details) => {
  console.error('[Client Crash Guard] Renderer process crashed:', details.reason);
  const config = loadConfig();
  if (alarmButton && alarmButton.webContents === webContents) {
    alarmButton = null;
    if (isServerReadyState && config) {
      setTimeout(() => createAlarmButton(config), 600);
    }
  }
});

app.on('child-process-gone', (event, details) => {
  console.error('[Client Crash Guard] Child process exited:', details.reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Client Crash Guard] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Client Crash Guard] Unhandled rejection:', reason);
});

// On macOS activate / click on icon
app.on('activate', () => {
  if (!app.isReady()) return;
  const config = loadConfig();
  if (!config || !config.token) {
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.show(); setupWindow.focus(); setupWindow.moveTop();
    } else {
      createSetupWindow();
    }
    return;
  }
  if (!alarmButton || alarmButton.isDestroyed()) {
    createAlarmButton(config);
  } else {
    alarmButton.show();
    alarmButton.setAlwaysOnTop(true, 'screen-saver');
    alarmButton.focus();
  }
});

// Keep alive in tray even when all windows are closed
app.on('window-all-closed', () => { /* intentionally empty — stay in tray */ });

app.on('before-quit', () => {
  isQuitting = true;              // prevent disconnect dialog when we initiated the quit
  if (socket) { socket.off(); socket.disconnect(); socket = null; }
});

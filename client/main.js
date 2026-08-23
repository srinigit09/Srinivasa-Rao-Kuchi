'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog, Notification } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { io } = require('socket.io-client');

// ── Config (persisted in user data dir, survives app updates) ─────────────────
const CONFIG_DIR  = app.getPath('userData');
const CONFIG_FILE = path.join(CONFIG_DIR, 'panic-alarm-config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return null; }
}
function saveConfig(cfg) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
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
let alarmButton    = null;   // doctor only: floating round ALERT button
let alertPopup     = null;   // alert notification popup (all roles)
let settingsWindow = null;   // tray → My Details
let tray           = null;
let socket         = null;   // Socket.IO connection in main process

// ── Single instance lock — disabled so multiple roles can run on same machine ─
// (doctor + staff can both be installed/tested on the same machine simultaneously)
// app.requestSingleInstanceLock() intentionally NOT called here.
app.on('second-instance', () => {
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.show(); setupWindow.focus(); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO — runs in main process, no renderer window needed
// ═══════════════════════════════════════════════════════════════════════════════
function connectSocket(config) {
  if (socket) { socket.disconnect(); socket = null; }

  socket = io(config.serverUrl, {
    transports      : ['websocket', 'polling'],
    reconnectionDelay: 3000,
    auth            : { token: config.token },
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected');
    // Always send hospitalCode in uppercase so it matches the broadcast room name
    socket.emit('join', {
      hospitalCode: (config.hospitalCode || '').toUpperCase(),
      userName    : config.user_name,
    });
    rebuildTrayMenu(config, true);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    rebuildTrayMenu(config, false);
  });

  socket.on('connect_error', (err) => {
    console.log('[Socket] Error:', err.message);
    rebuildTrayMenu(config, false);
  });

  // ── This is the key event — show popup on every registered PC ────────────────
  socket.on('panic_alarm', (alarmData) => {
    console.log('[Alarm] Received:', alarmData.triggeredBy, alarmData.roomNumber);
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
    width: 500, height: 700,
    resizable: false, center: true,
    title: 'Panic Alarm — Setup',
    show: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  setupWindow.setMenu(null);
  setupWindow.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  setupWindow.show();
  setupWindow.focus();
  setupWindow.moveTop();
  setupWindow.on('closed', () => { setupWindow = null; });
}

// ── Doctor: floating round red ALERT button ────────────────────────────────────
function createAlarmButton(config) {
  if (alarmButton && !alarmButton.isDestroyed()) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  alarmButton = new BrowserWindow({
    width: 130, height: 130,
    x: sw - 150, y: sh - 160,
    frame: false, transparent: true,
    alwaysOnTop: true, resizable: false, skipTaskbar: false,
    title: 'ALERT',
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
  alarmButton.on('closed', () => { alarmButton = null; });
}

// ── Alert popup — shown when a panic alarm is received ────────────────────────
function showAlertPopup(alarmData) {
  // If a popup is already open, just update it with the new alarm
  if (alertPopup && !alertPopup.isDestroyed()) {
    alertPopup.webContents.send('new-alarm', alarmData);
    alertPopup.show();
    alertPopup.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  const primary  = screen.getPrimaryDisplay();

  alertPopup = new BrowserWindow({
    width: 580, height: 340,
    x: Math.round((primary.workAreaSize.width - 580) / 2),
    y: 20,
    frame: false, alwaysOnTop: true, resizable: false,
    skipTaskbar: false,
    title: 'ALERT',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  alertPopup.setMenu(null);
  alertPopup.loadFile(path.join(__dirname, 'renderer', 'alert_popup.html'));
  alertPopup.webContents.once('did-finish-load', () => {
    alertPopup.webContents.send('new-alarm', alarmData);
  });
  alertPopup.on('closed', () => { alertPopup = null; });
}

// ── Settings window (My Details — editable) ───────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  const config = loadConfig();
  settingsWindow = new BrowserWindow({
    width: 480, height: 520,
    resizable: false, center: true,
    title: 'Panic Alarm — My Details',
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
  // Build a simple 16x16 tray icon from raw PNG bytes — no file dependency
  // This is a small red/white circle encoded as base64 PNG
  const TRAY_ICON_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAA' +
    'AklEQVQ4y2NgGAWkAgABBAABnV5q6QAAAABJRU5ErkJggg==';
  // Use a simple approach: create from the png file, fall back to createEmpty
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  let img;
  try {
    if (fs.existsSync(pngPath)) {
      img = nativeImage.createFromPath(pngPath).resize({ width: 16, height: 16 });
    } else {
      // Fallback: create a simple colored native image
      img = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAA' +
        'BVBMVEX/AAD///+nxH5EAAAAAnRSTlP/AOW3MEoAAAAaSURBVBjTY2BgYGBkYGBiYGBg' +
        'YGBgYGBgAAACAAFJRxGNAAAAAElFTkSuQmCC'
      );
    }
  } catch(e) {
    img = nativeImage.createEmpty();
  }
  tray = new Tray(img);
  tray.setTitle('🚨'); // macOS: show emoji text next to icon as fallback
  rebuildTrayMenu(config, false);
}

function rebuildTrayMenu(config, connected) {
  if (!tray) return;
  const statusLabel = connected ? '🟢 Connected' : '🔴 Disconnected';
  const roleLabel = config
    ? (config.role === 'doctor' ? '👨‍⚕️ Doctor' : config.role === 'other' ? '👤 Other' : '🩺 Staff/Nurse')
    : '';
  const items = config ? [
    { label: `${config.user_name}  ·  ${roleLabel}`, enabled: false },
    { label: `Room: ${config.room_number}  ·  System: ${config.system_number}`, enabled: false },
    { label: `Hospital: ${config.clientName || config.hospitalCode}`, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: '✏️  My Details', click: createSettingsWindow },
    { type: 'separator' },
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
  // Also open context menu on left-click when not configured
  if (!config) {
    tray.on('click', () => tray.popUpContextMenu());
  }
  tray.setToolTip(config
    ? `Panic Alarm — ${config.user_name} ${connected ? '(Connected)' : '(Disconnected)'}`
    : 'Panic Alarm — Click to Setup');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
ipcMain.handle('get-config',    () => loadConfig());
ipcMain.handle('get-device-id', () => getOrCreateDeviceId());

// Called by setup.html after successful registration
ipcMain.handle('setup-complete', (_, config) => {
  saveConfig(config);
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  launchAfterSetup(config);
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

// Show alert popup from renderer (e.g. viewer window forwarding a socket event)
ipcMain.handle('show-alert-popup', (_, alarmData) => {
  showAlertPopup(alarmData);
});

// Drag the frameless alarm button
ipcMain.on('move-alarm-window', (_, { dx, dy }) => {
  if (!alarmButton || alarmButton.isDestroyed()) return;
  const [x, y] = alarmButton.getPosition();
  alarmButton.setPosition(x + dx, y + dy);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════════════
function launchAfterSetup(config) {
  createTray(config);
  // Doctor gets the floating ALERT button
  if (config.role === 'doctor') createAlarmButton(config);
  // Everyone connects to the socket silently in background
  connectSocket(config);
}

app.whenReady().then(() => {
  const config = loadConfig();
  if (config && config.token) {
    launchAfterSetup(config);
  } else {
    if (app.dock) app.dock.show();
    createTray(null);
    // Open setup immediately, and again after 1s as safety net
    createSetupWindow();
    setTimeout(() => {
      if (!setupWindow || setupWindow.isDestroyed()) {
        createSetupWindow();
      } else {
        setupWindow.show();
        setupWindow.focus();
        setupWindow.moveTop();
      }
    }, 1000);
  }
});

// Clicking dock icon when no window open → show setup or settings
app.on('activate', () => {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show(); setupWindow.focus(); setupWindow.moveTop();
  } else if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus();
  } else {
    const config = loadConfig();
    if (!config || !config.token) createSetupWindow();
    else createSettingsWindow();
  }
});

// Keep alive in tray even when all windows are closed
app.on('window-all-closed', () => { /* intentionally empty — stay in tray */ });

app.on('before-quit', () => {
  if (socket) { socket.disconnect(); socket = null; }
});

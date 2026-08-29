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

// ── Single instance lock — prevents multiple tray icons ──────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running — quit this one immediately
  app.quit();
}
app.on('second-instance', () => {
  // Someone tried to open a second instance — bring existing window to front
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show(); setupWindow.focus(); setupWindow.moveTop();
  } else if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO — runs in main process, no renderer window needed
// ═══════════════════════════════════════════════════════════════════════════════
function connectSocket(config) {
  if (socket) { socket.disconnect(); socket = null; }

  if (!config.serverUrl || !config.token) {
    console.error('[Socket] Cannot connect — missing serverUrl or token in config');
    return;
  }

  console.log('[Socket] Connecting to', config.serverUrl);
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
      deviceId    : config.deviceId,
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
    width: 580, height: 300,
    x: Math.round((primary.workAreaSize.width - 580) / 2),
    y: 20,
    frame: false, alwaysOnTop: true, resizable: false,
    skipTaskbar: true,
    title: 'PANIC ALARM',
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

// ── Settings window (Edit My Profile) ────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  const config = loadConfig();
  settingsWindow = new BrowserWindow({
    width: 500, height: 560,
    resizable: false, center: true,
    title: 'Panic Alarm — Edit My Profile',
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
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🏥');  // hospital emoji — distinguishes client from server (🖥️)
  rebuildTrayMenu(config, false);
}

function rebuildTrayMenu(config, connected) {
  if (!tray) return;
  const statusLabel = connected ? '🟢 Connected' : '🔴 Disconnected';
  const roleLabel = config
    ? (config.role === 'doctor' ? '👨‍⚕️ Doctor' : config.role === 'other' ? '👤 Other' : '🩺 Staff/Nurse')
    : '';
  const serverInfo = config && config.serverUrl ? `Server: ${config.serverUrl}` : '⚠️ Server URL not set — open My Details';
  const items = config ? [
    { label: `${config.user_name}  ·  ${roleLabel}`, enabled: false },
    { label: `Room: ${config.room_number}  ·  System: ${config.system_number}`, enabled: false },
    { label: `Hospital: ${config.clientName || config.hospitalCode}`, enabled: false },
    { label: serverInfo, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    ...(config.role === 'doctor' ? [{
      label: alarmButton && !alarmButton.isDestroyed()
        ? '🔴  Alarm Button: ON'
        : '▶  Show Alarm Button',
      click: () => {
        if (!alarmButton || alarmButton.isDestroyed()) createAlarmButton(loadConfig());
      },
      enabled: !alarmButton || alarmButton.isDestroyed(),
    }] : []),
    { label: '✏️  Edit User Details', click: createSettingsWindow },
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

// ── Alert button colour ────────────────────────────────────────────────────────
const COLOUR_LABELS = [
  '🔴 Red (default)', '🟠 Orange', '🟡 Yellow',
  '🟢 Green', '🔵 Blue', '🟣 Purple', '⚫ Dark',
];

// Right-click on alarm button → colour picker + Quit Alarm Button
ipcMain.on('show-colour-menu', () => {
  if (!alarmButton || alarmButton.isDestroyed()) return;
  const config  = loadConfig();
  const current = config?.alertButtonColour ?? 0;
  const menu = Menu.buildFromTemplate([
    ...COLOUR_LABELS.map((label, idx) => ({
      label,
      type : 'radio',
      checked: idx === current,
      click: () => {
        if (alarmButton && !alarmButton.isDestroyed()) {
          alarmButton.webContents.send('alert-colour-change', idx);
        }
      },
    })),
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

// ═══════════════════════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════════════════════
function hideDock() {
  // On macOS hide the dock icon — app lives entirely in the system tray
  if (app.dock) app.dock.hide();
}

function launchAfterSetup(config) {
  hideDock();
  createTray(config);
  // Doctor gets the floating ALERT button
  if (config.role === 'doctor') createAlarmButton(config);
  // Everyone connects to the socket silently in background
  connectSocket(config);
}

app.whenReady().then(() => {
  hideDock();   // hide immediately — before any window opens
  const config = loadConfig();
  if (config && config.token) {
    launchAfterSetup(config);
  } else {
    createTray(null);
    createSetupWindow();
  }
});

// On macOS activate — do NOT show dock icon; open settings via tray instead
app.on('activate', () => {
  if (!app.isReady()) return;
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show(); setupWindow.focus(); setupWindow.moveTop();
    return;
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus();
    return;
  }
});

// Keep alive in tray even when all windows are closed
app.on('window-all-closed', () => { /* intentionally empty — stay in tray */ });

app.on('before-quit', () => {
  if (socket) { socket.disconnect(); socket = null; }
});

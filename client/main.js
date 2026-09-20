'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { io } = require('socket.io-client');

// ── Config (stored in user data dir) ──────────────────────────────────────────
const CONFIG_DIR        = app.getPath('userData');
const CONFIG_FILE       = path.join(CONFIG_DIR, 'panic-alarm-config.json');
const LAST_SERVER_FILE  = path.join(CONFIG_DIR, 'last-server-url');   // survives config wipe
const LAST_HINT_FILE    = path.join(CONFIG_DIR, 'last-server-hint');  // serverUrl|hospitalCode
const SEEN_INSTALL_FILE = path.join(CONFIG_DIR, 'seen-install-id');   // tracks last seen install stamp

// Ensure config dir exists and seed hint from backup on very first run
function initConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

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
  const installIdFile = path.join(process.resourcesPath, 'install-id');
  if (!fs.existsSync(installIdFile)) return false;  // dev mode / no stamp → treat as reopen

  const currentId = fs.readFileSync(installIdFile, 'utf8').trim();
  if (!currentId) return false;

  let seenId = null;
  try { seenId = fs.readFileSync(SEEN_INSTALL_FILE, 'utf8').trim(); } catch { /* not yet written */ }

  if (seenId === currentId) return false;  // same install — just a reopen

  // New install-id → fresh install. Save it so subsequent reopens pass through.
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SEEN_INSTALL_FILE, currentId, 'utf8');
  return true;
}

/** Wipe user config (but keep server hint so new-install form is pre-filled). */
function wipeConfigForFreshInstall() {
  try { fs.unlinkSync(CONFIG_FILE); } catch { /* already gone */ }
  // Keep LAST_HINT_FILE and LAST_SERVER_FILE so the server URL field is pre-filled
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
let tray           = null;
let socket         = null;   // Socket.IO connection in main process
let isQuitting     = false;  // true once the user has quit — suppresses disconnect dialog

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
    transports      : ['websocket', 'polling'],
    reconnectionDelay: 3000,
    auth            : { token: config.token },
  });
  let wasConnected = false;

  // Show "server not reachable" dialog if no connection within 10s on launch
  let launchTimer = setTimeout(() => {
    if (!socket.connected) {
      dialog.showMessageBox({
        type   : 'warning',
        title  : 'Server Not Reachable',
        message: 'Cannot connect to the Panic Alarm Server.',
        detail : `The Panic Alarm app is running in the tray and will keep retrying automatically.\n\nThe alarm button will appear as soon as the server becomes reachable.\n\nServer: ${config.serverUrl}\n\nTo change the server address: right-click tray icon → Edit User Details.`,
        buttons: ['OK'],
      });
    }
  }, 10000);

  socket.on('connect', () => {
    console.log('[Socket] Connected');
    wasConnected = true;
    clearTimeout(launchTimer);
    launchTimer = null;
    socket.emit('join', {
      hospitalCode: (config.hospitalCode || '').toUpperCase(),
      userName    : config.user_name,
      deviceId    : config.deviceId,
    });
    rebuildTrayMenu(config, true);
    // Show alarm button only when connected
    if (!alarmButton || alarmButton.isDestroyed()) createAlarmButton(config);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    if (alarmButton && !alarmButton.isDestroyed()) alarmButton.close();
    // Only show dialog if we had an established connection AND the user did not already quit
    if (wasConnected && !isQuitting) {
      wasConnected = false;
      isQuitting = true;  // tentatively set — cleared if user chooses Reconnect
      rebuildTrayMenu(config, false);
      dialog.showMessageBox({
        type      : 'warning',
        title     : 'Panic Alarm Server Disconnected',
        message   : 'The Panic Alarm Server has stopped or is unreachable.',
        detail    : `The alarm button has been disabled.\n\nIf the server has been restarted, click "Try Reconnect".\nOtherwise click "Close App" and reopen once the server is running.\n\nServer: ${config.serverUrl}`,
        buttons   : ['Try Reconnect', 'Close App'],
        defaultId : 0,
        cancelId  : 1,
      }).then(({ response }) => {
        if (response === 0) {
          // User chose Reconnect — reset state and reconnect socket
          isQuitting = false;
          wasConnected = false;
          connectSocket(config);
        } else {
          app.quit();
        }
      });
    }
  });

  socket.on('connect_error', (err) => {
    console.log('[Socket] Error:', err.message);
    rebuildTrayMenu(config, false);
    if (alarmButton && !alarmButton.isDestroyed()) alarmButton.close();
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
  // If a popup is already open, just update it with the new alarm
  if (alertPopup && !alertPopup.isDestroyed()) {
    alertPopup.webContents.send('new-alarm', alarmData);
    alertPopup.show();
    alertPopup.focus();
    return;
  }

  const primary = screen.getPrimaryDisplay();

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
    { label: '✏️  Edit User Details', click: createSettingsWindow },
    {
      label: alarmButton && !alarmButton.isDestroyed()
        ? '🔴  Panic Alarm: ON'
        : '▶  Show Panic Alarm',
      click: () => {
        if (!alarmButton || alarmButton.isDestroyed()) createAlarmButton(loadConfig());
      },
      enabled: !alarmButton || alarmButton.isDestroyed(),
    },
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
ipcMain.handle('get-config',           () => loadConfig());
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

function launchAfterSetup(config) {
  hideDock();
  setAutoLaunch(true);
  rebuildTrayMenu(config, false);
  // Alarm button only appears once socket connects — see socket.on('connect')
  connectSocket(config);
}

app.whenReady().then(() => {
  initConfigDir();
  hideDock();

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
  isQuitting = true;              // prevent disconnect dialog when we initiated the quit
  if (socket) { socket.off(); socket.disconnect(); socket = null; }
});

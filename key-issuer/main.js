'use strict';

/**
 * Panic Alarm Key Issuer (vendor tool).
 * Private keys never leave this process: the window only receives public information.
 */

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const vaultLib = require('./vault');

const VAULT_FILE = path.join(app.getPath('userData'), 'vault.json');
const AUTO_LOCK_MS = 15 * 60 * 1000;

let win = null;
let vault = null;        // decrypted-structure vault (private keys stay encrypted inside it)
let passphrase = null;   // kept in memory only while unlocked
let lockTimer = null;

function vaultExists() { return fs.existsSync(VAULT_FILE); }

function saveVault() {
  const tmp = VAULT_FILE + '.tmp';
  fs.mkdirSync(path.dirname(VAULT_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(vault, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, VAULT_FILE);
}

function lock() {
  vault = null; passphrase = null;
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
  if (win && !win.isDestroyed()) win.webContents.send('locked');
}

function touch() {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(lock, AUTO_LOCK_MS);
}

function publicState() {
  if (!vault) return { exists: vaultExists(), unlocked: false };
  return {
    exists: true, unlocked: true, activeKeyId: vault.activeKeyId,
    keys: vault.keys.map(k => ({ id: k.id, publicKey: k.publicKey, hasPrivate: !!k.private, createdAt: k.createdAt })),
    issued: vault.issued.slice(-200).reverse(),
  };
}

// Wraps a handler so thrown errors reach the window as { error } with the real message.
function handle(name, fn, { needsUnlock = true } = {}) {
  ipcMain.handle(name, async (_e, arg) => {
    try {
      if (needsUnlock) {
        if (!vault) return { error: 'Locked. Unlock with your passphrase first.' };
        touch();
      }
      return { ok: true, ...(await fn(arg || {})) };
    } catch (e) {
      return { error: e.message || 'Failed' };
    }
  });
}

handle('state', () => ({ state: publicState() }), { needsUnlock: false });

handle('create', ({ passphrase: p }) => {
  if (vaultExists()) throw new Error('Keys already exist on this computer');
  vault = vaultLib.createVault(p);
  passphrase = p;
  saveVault(); touch();
  return { state: publicState() };
}, { needsUnlock: false });

handle('unlock', ({ passphrase: p }) => {
  if (!vaultExists()) throw new Error('No keys found. Create them first.');
  const v = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
  vaultLib.verifyPassphrase(v, p);
  vault = v; passphrase = p; touch();
  return { state: publicState() };
}, { needsUnlock: false });

handle('lock', () => { lock(); return { state: publicState() }; }, { needsUnlock: false });

handle('issue', (args) => {
  const code = vaultLib.issue(vault, passphrase, args);
  saveVault();
  return { code, state: publicState() };
});

handle('setActive', ({ id }) => { vaultLib.setActiveKey(vault, id); saveVault(); return { state: publicState() }; });

handle('copy', ({ text }) => { clipboard.writeText(String(text || '')); return {}; });

async function saveAs(defaultName, content) {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName });
  if (r.canceled || !r.filePath) return { saved: false };
  fs.writeFileSync(r.filePath, content, { mode: 0o600 });
  return { saved: true, file: r.filePath };
}

handle('exportLicenseKeys', () => saveAs('license-keys.js', vaultLib.exportLicenseKeysJs(vault)));
handle('backupKey', ({ id }) => saveAs(`panic-alarm-key-${id}-backup.json`, vaultLib.exportKeyBackup(vault, id)));

handle('removePrivate', async ({ id }) => {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Cancel', 'Remove'], defaultId: 0, cancelId: 0,
    message: `Remove the private part of key ${id} from this computer?`,
    detail: 'Only do this after you saved its backup file somewhere safe and offline. You can restore it later from that file.',
  });
  if (r.response !== 1) return { removed: false, state: publicState() };
  vaultLib.removePrivate(vault, id); saveVault();
  return { removed: true, state: publicState() };
});

handle('importBackup', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return { imported: false, state: publicState() };
  vaultLib.importKeyBackup(vault, fs.readFileSync(r.filePaths[0], 'utf8'), passphrase);
  saveVault();
  return { imported: true, state: publicState() };
});

function createWindow() {
  win = new BrowserWindow({
    width: 760, height: 760, minWidth: 640, minHeight: 600,
    title: 'Panic Alarm Key Issuer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; lock(); });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

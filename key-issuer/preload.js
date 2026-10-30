'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => (arg) => ipcRenderer.invoke(name, arg);

contextBridge.exposeInMainWorld('issuer', {
  state: call('state'),
  create: call('create'),
  unlock: call('unlock'),
  lock: call('lock'),
  issue: call('issue'),
  setActive: call('setActive'),
  copy: call('copy'),
  exportLicenseKeys: call('exportLicenseKeys'),
  backupKey: call('backupKey'),
  removePrivate: call('removePrivate'),
  importBackup: call('importBackup'),
  onLocked: (fn) => ipcRenderer.on('locked', () => fn()),
});

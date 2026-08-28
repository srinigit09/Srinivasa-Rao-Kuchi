'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig           : ()      => ipcRenderer.invoke('get-config'),
  getDeviceId         : ()      => ipcRenderer.invoke('get-device-id'),
  setupComplete       : (cfg)   => ipcRenderer.invoke('setup-complete', cfg),
  settingsUpdated     : (cfg)   => ipcRenderer.invoke('settings-updated', cfg),
  dismissAlert        : ()      => ipcRenderer.invoke('dismiss-alert'),
  showAlertPopup      : (data)  => ipcRenderer.invoke('show-alert-popup', data),
  moveAlarmWindow     : (delta) => ipcRenderer.send('move-alarm-window', delta),
  showColourMenu      : ()      => ipcRenderer.send('show-colour-menu'),
  setAlertButtonColour: (idx)   => ipcRenderer.invoke('set-alert-colour', idx),
  onClientConfig  : (cb)  => ipcRenderer.on('client-config',    (_, d) => cb(d)),
  onNewAlarm      : (cb)  => ipcRenderer.on('new-alarm',         (_, d) => cb(d)),
  onAlarmAcked    : (cb)  => ipcRenderer.on('alarm-acked',       (_, d) => cb(d)),
  onColourChange  : (cb)  => ipcRenderer.on('alert-colour-change',(_, d) => cb(d)),
});

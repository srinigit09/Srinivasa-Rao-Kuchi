'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serverAPI', {
  login           : (creds) => ipcRenderer.invoke('server-login', creds),
  loginSuccess    : (data)  => ipcRenderer.invoke('login-success', data),
  logout          : ()      => ipcRenderer.invoke('admin-logout'),
  getServerInfo   : ()      => ipcRenderer.invoke('get-server-info'),
  getLoginPrefs   : ()      => ipcRenderer.invoke('get-login-prefs'),
  saveLoginPrefs  : (prefs) => ipcRenderer.invoke('save-login-prefs', prefs),
  autoFindPort    : ()      => ipcRenderer.invoke('auto-find-port'),
  changeServerPort: (port)  => ipcRenderer.invoke('change-server-port', port),
  restartServer   : ()      => ipcRenderer.invoke('restart-server'),
  stopServer      : ()      => ipcRenderer.invoke('stop-server'),
});

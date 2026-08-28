'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serverAPI', {
  login                 : (creds)  => ipcRenderer.invoke('server-login', creds),
  loginSuccess          : (data)   => ipcRenderer.invoke('login-success', data),
  logout                : ()       => ipcRenderer.invoke('admin-logout'),
  getServerInfo         : ()       => ipcRenderer.invoke('get-server-info'),
  downloadClientInstaller: ()      => ipcRenderer.invoke('download-client-installer'),
});

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serverAPI', {
  login         : (creds)  => ipcRenderer.invoke('server-login', creds),
  loginSuccess  : (data)   => ipcRenderer.invoke('login-success', data),
  getServerInfo : ()       => ipcRenderer.invoke('get-server-info'),
});

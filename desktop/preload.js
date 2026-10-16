const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shocoDesktop', {
  askConsent: (name) => ipcRenderer.invoke('consent', String(name)),
  input: (e) => ipcRenderer.send('input', e),
  version: process.env.npm_package_version || '',
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', (_e, v) => cb(String(v))),
  installUpdate: () => ipcRenderer.send('install-update'),
});

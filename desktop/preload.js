const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shocoDesktop', {
  askConsent: (name) => ipcRenderer.invoke('consent', String(name)),
  input: (e) => ipcRenderer.send('input', e),
  controlEnded: () => ipcRenderer.send('control-ended'),
  getVersion: () => ipcRenderer.invoke('version'),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', (_e, v) => cb(String(v))),
  installUpdate: () => ipcRenderer.send('install-update'),
});

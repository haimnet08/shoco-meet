const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shocoDesktop', {
  askConsent: (name) => ipcRenderer.invoke('consent', String(name)),
  input: (e) => ipcRenderer.send('input', e),
});

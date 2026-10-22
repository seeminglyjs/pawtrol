// 화면 쪽에 열어 주는 기능만 골라 내보낸다.
const { contextBridge, ipcRenderer } = require('electron');

const on = ch => cb => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('paw', {
  ready: () => ipcRenderer.send('pet-ready'),
  setIgnore: ignore => ipcRenderer.send('set-ignore', ignore),
  onNotify: on('notify'),
  onNotifyRemove: on('notify-remove'),
  onWorking: on('working'),
  onSys: on('sys'),
  onSettings: on('settings'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: patch => ipcRenderer.invoke('set-settings', patch),
  hookStatus: () => ipcRenderer.invoke('hook-status'),
  installHooks: () => ipcRenderer.invoke('install-hooks'),
  removeHooks: () => ipcRenderer.invoke('remove-hooks'),
});

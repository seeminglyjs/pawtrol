// 화면 쪽에 열어 주는 기능만 골라 내보낸다.
const { contextBridge, ipcRenderer } = require('electron');

const on = ch => cb => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('paw', {
  ready: () => ipcRenderer.send('pet-ready'),
  setIgnore: ignore => ipcRenderer.send('set-ignore', ignore),
  onLayout: on('layout'),
  onEnter: on('enter'),
  onLeave: on('leave'),
  onDrop: on('drop'),
  onDragState: on('drag-state'),
  onDragMove: on('drag-move'),
  onAlert: on('alert'),
  onStretch: on('stretch'),
  onBubble: on('bubble'),
  onShowCard: on('show-card'),
  onWorking: on('working'),
  onSys: on('sys'),
  onSettings: on('settings'),
  bubbleNext: () => ipcRenderer.send('bubble-next'),
  bubbleClose: () => ipcRenderer.send('bubble-close'),
  bubbleOpen: () => ipcRenderer.send('bubble-open'),
  handoff: h => ipcRenderer.send('handoff', h),
  dragStart: grab => ipcRenderer.send('drag-start', grab),
  dragEnd: () => ipcRenderer.send('drag-end'),
  status: () => ipcRenderer.invoke('status'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: patch => ipcRenderer.invoke('set-settings', patch),
  hookStatus: () => ipcRenderer.invoke('hook-status'),
  installHooks: () => ipcRenderer.invoke('install-hooks'),
  removeHooks: () => ipcRenderer.invoke('remove-hooks'),
});

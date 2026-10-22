// pawtrol 메인 프로세스: 투명 펫 창 · 훅 이벤트 서버 · CPU·RAM 감시 · 트레이 · 설정 창.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path = require('node:path');
const { createSettingsStore } = require('./settings-store');
const { startEventServer } = require('./event-server');
const { startSysmon } = require('./sysmon');
const { readSessionTitle, shortTitle } = require('./session-title');
const { installHooks, removeHooks, hookStatus } = require('./hook-installer');
const { createTrayIcon } = require('./tray-icon');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let pet, settingsWin, tray, store, server, sysmon;
let mutedUntil = 0;
const working = new Map(); // sessionId → 요청을 보낸 시각

// 응답 끝 신호를 못 받은 세션(창을 닫음 · 강제 종료)이 영원히 "일하는 중"으로 남지 않게 지우는 시간. 가정(검증 필요).
const WORKING_EXPIRE_MS = 30 * 60 * 1000;
// "알림 잠시 끄기" 길이. 가정(검증 필요).
const MUTE_MS = 60 * 60 * 1000;

const send = (ch, data) => { if (pet && !pet.isDestroyed()) pet.webContents.send(ch, data); };
const sendWorking = () => send('working', { count: working.size });

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  pet = new BrowserWindow({
    ...workArea,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js') },
  });
  pet.setAlwaysOnTop(true, 'screen-saver');
  // 기본은 클릭이 뒤 창으로 그대로 지나가고, 고양이·말풍선 위에 마우스가 오면 화면 쪽에서 잡도록 바꾼다
  pet.setIgnoreMouseEvents(true, { forward: true });
  pet.loadFile(path.join(__dirname, '..', 'renderer', 'pet.html'));
  // 개발 중 확인용: PAWTROL_DEBUG=1 이면 펫 화면의 콘솔·오류를 터미널로 내보낸다
  if (process.env.PAWTROL_DEBUG) pet.webContents.on('console-message', e => console.log('[pet]', e.level, e.message, e.sourceId + ':' + e.lineNumber));
  screen.on('display-metrics-changed', () => pet.setBounds(screen.getPrimaryDisplay().workArea));
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 520, height: 640, title: 'pawtrol 설정', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js') },
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
}

function buildTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('pawtrol');
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: pet.isVisible() ? '숨기기' : '보이기', click: () => { pet.isVisible() ? pet.hide() : pet.showInactive(); refresh(); } },
    { label: '알림 1시간 끄기', type: 'checkbox', checked: Date.now() < mutedUntil,
      click: i => { mutedUntil = i.checked ? Date.now() + MUTE_MS : 0; refresh(); } },
    { type: 'separator' },
    { label: '설정', click: openSettings },
    { label: '종료', click: () => app.quit() },
  ]));
  refresh();
  tray.on('click', openSettings);
}

async function onHookEvent(event, payload) {
  if (process.env.PAWTROL_DEBUG) console.log('[hook]', event, JSON.stringify(payload).slice(0, 200));
  const s = store.get();
  const sid = payload.session_id || payload.transcript_path || 'unknown';
  if (event === 'UserPromptSubmit') {
    working.set(sid, Date.now());
    sendWorking();
    send('notify-remove', { key: sid });
    return;
  }
  if (event !== 'Stop' && event !== 'Notification') return;
  if (event === 'Stop') { working.delete(sid); sendWorking(); }
  if (Date.now() < mutedUntil) return;
  const name = shortTitle(await readSessionTitle({ transcriptPath: payload.transcript_path, cwd: payload.cwd }));
  if (event === 'Stop') {
    if (!s.notify.done) return;
    send('notify', { key: sid, kind: 'done', text: `「${name}」 작업이 끝난 것 같아요. 확인해 보세요!` });
  } else {
    if (!s.notify.waiting) return;
    const permission = /permission/i.test(payload.message || '');
    send('notify', {
      key: sid, kind: permission ? 'permission' : 'idle',
      text: permission ? `「${name}」 세션이 권한 승인을 기다리고 있어요.` : `「${name}」 세션이 입력을 기다리고 있어요.`,
    });
  }
}

function startServer() {
  if (server) server.close();
  server = startEventServer(store.get().port, (ev, p) => { onHookEvent(ev, p).catch(() => {}); },
    err => send('notify', { key: 'server', kind: 'error', text: `알림을 받을 포트(${store.get().port})를 열지 못했어요. 설정에서 다른 포트를 골라 주세요. (${err.code})` }));
}

let lastSys = { cpuHigh: false, ramHigh: false };
function onSys(st) {
  send('sys', st);
  const s = store.get();
  if (!s.notify.system || Date.now() < mutedUntil) { lastSys = st; return; }
  // 넘어서는 순간 한 번만 말풍선을 띄운다
  if (st.cpuHigh && !lastSys.cpuHigh) send('notify', { key: 'cpu', kind: 'cpu', text: `CPU 사용률이 ${s.cpuSeconds}초 넘게 ${s.cpuThreshold}% 이상이에요. 열심히 일하는 중!` });
  if (st.ramHigh && !lastSys.ramHigh) send('notify', { key: 'ram', kind: 'ram', text: `메모리를 ${Math.round(st.ram)}% 쓰고 있어요. 좀 피곤해요…` });
  lastSys = st;
}

function applySettings(s) {
  send('settings', s);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings', s);
  sysmon.setOptions({ cpuThreshold: s.cpuThreshold, cpuSeconds: s.cpuSeconds, ramThreshold: s.ramThreshold });
  app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin });
}

app.whenReady().then(() => {
  store = createSettingsStore(app.getPath('userData'));
  const s = store.get();
  createPetWindow();
  buildTray();
  startServer();
  sysmon = startSysmon({ cpuThreshold: s.cpuThreshold, cpuSeconds: s.cpuSeconds, ramThreshold: s.ramThreshold }, onSys);
  // 처음 실행이면 훅을 넣는다. 사용자가 설정 창에서 뺐으면 다시 넣지 않는다
  if (!s.hooksOptOut && hookStatus({ port: s.port }) !== 'installed') {
    try { installHooks({ port: s.port }); } catch (e) {
      send('notify', { key: 'hooks', kind: 'error', text: `Claude 설정 파일을 읽지 못해 연동하지 못했어요. (${e.message})` });
    }
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of working) if (now - t > WORKING_EXPIRE_MS) working.delete(k);
    sendWorking();
  }, 60 * 1000);

  ipcMain.on('set-ignore', (_e, ignore) => pet.setIgnoreMouseEvents(ignore, { forward: true }));
  ipcMain.handle('get-settings', () => store.get());
  ipcMain.handle('set-settings', (_e, patch) => {
    const prevPort = store.get().port;
    const next = store.set(patch);
    applySettings(next);
    if (next.port !== prevPort) {
      startServer();
      if (hookStatus({ port: prevPort }) !== 'missing') installHooks({ port: next.port });
    }
    return next;
  });
  ipcMain.handle('hook-status', () => hookStatus({ port: store.get().port }));
  ipcMain.handle('install-hooks', () => { installHooks({ port: store.get().port }); store.set({ hooksOptOut: false }); return hookStatus({ port: store.get().port }); });
  ipcMain.handle('remove-hooks', () => { removeHooks({}); store.set({ hooksOptOut: true }); return hookStatus({ port: store.get().port }); });
  ipcMain.on('pet-ready', () => { send('settings', store.get()); sendWorking(); });
});

app.on('second-instance', openSettings);
app.on('window-all-closed', e => e.preventDefault());

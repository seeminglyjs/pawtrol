// pawtrol 메인 프로세스: 모니터마다 투명 펫 창 · 훅 이벤트 서버 · 알림 대기열 · CPU·RAM 감시 · 트레이 · 설정 창.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSettingsStore } = require('./settings-store');
const { startEventServer } = require('./event-server');
const { startSysmon } = require('./sysmon');
const { readSessionTitle, shortTitle } = require('./session-title');
const { installHooks, removeHooks, hookStatus } = require('./hook-installer');
const { createSessionIndex, sessionLink } = require('./claude-sessions');
const { catIcon, trayIcon } = require('./icon');
const { createQueue } = require('../renderer/queue');

// 화면 전체를 덮는 투명 고양이 창 뒤에 있는 창(설정 창)을 "가려졌다"고 보고 그리기를 멈추는 크로미엄 기능을 끈다.
// 설정 창이 빈 화면으로 보인 원인 후보다(2026-10-22 사용자 제보, 재현은 못 함).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setAppUserModelId('pawtrol');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const DEBUG = !!process.env.PAWTROL_DEBUG;
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const RENDERER = path.join(__dirname, '..', 'renderer');

let settingsWin, tray, store, server, sysmon;
let mutedUntil = 0;
const working = new Map(); // CLI 세션 ID → 요청을 보낸 시각
const queue = createQueue();
const sessions = createSessionIndex();
const waitingFocus = new Map(); // 알림 key → { session, at } : 사용자가 그 세션을 열어 보면 알림을 지운다
let lastStatus = { cpu: 0, ram: 0, cpuHigh: false, ramHigh: false };
let diskFreeGB = null;

// 응답 끝 신호를 못 받은 세션(창을 닫음 · 강제 종료)이 영원히 "일하는 중"으로 남지 않게 지우는 시간. 가정(검증 필요).
const WORKING_EXPIRE_MS = 30 * 60 * 1000;
// "알림 잠시 끄기" 길이. 가정(검증 필요).
const MUTE_MS = 60 * 60 * 1000;
// 세션을 열어 봤는지 확인하는 간격. 알림이 남은 세션 파일만 읽는다. 가정(체감 확인).
const FOCUS_POLL_MS = 3000;

// ── 모니터마다 펫 창 ─────────────────────────────────────
const pets = new Map(); // displayId → BrowserWindow
let activeId = null; // 고양이가 지금 있는 모니터
let dragging = false, dragTimer = null;

const petWin = id => { const w = pets.get(id); return w && !w.isDestroyed() ? w : null; };
const sendTo = (id, ch, data) => { const w = petWin(id); if (w) w.webContents.send(ch, data); };
const sendActive = (ch, data) => sendTo(activeId, ch, data);
const broadcast = (ch, data) => { for (const id of pets.keys()) sendTo(id, ch, data); };

// 옆 모니터: 가장자리가 맞닿고(2px 이내) 위아래로 겹치는 모니터
function neighborOf(d, side, all) {
  return all.find(e => e.id !== d.id
    && Math.abs(side === 'right' ? e.bounds.x - (d.bounds.x + d.bounds.width) : (e.bounds.x + e.bounds.width) - d.bounds.x) <= 2
    && e.bounds.y < d.bounds.y + d.bounds.height && d.bounds.y < e.bounds.y + e.bounds.height) || null;
}

function sendLayouts() {
  const all = screen.getAllDisplays();
  for (const d of all) {
    sendTo(d.id, 'layout', {
      workArea: d.workArea, active: d.id === activeId,
      neighbors: { left: !!neighborOf(d, 'left', all), right: !!neighborOf(d, 'right', all) },
    });
  }
}

function createPetWindows() {
  for (const w of pets.values()) if (!w.isDestroyed()) w.destroy();
  pets.clear();
  const all = screen.getAllDisplays();
  if (!all.some(d => d.id === activeId)) activeId = screen.getPrimaryDisplay().id;
  for (const d of all) {
    const w = new BrowserWindow({
      ...d.workArea,
      transparent: true, frame: false, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: { preload: PRELOAD },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    // 기본은 클릭이 뒤 창으로 그대로 지나가고, 고양이·말풍선 위에 마우스가 오면 화면 쪽에서 잡도록 바꾼다
    w.setIgnoreMouseEvents(true, { forward: true });
    w.loadFile(path.join(RENDERER, 'pet.html'));
    if (DEBUG) w.webContents.on('console-message', e => console.log('[pet ' + d.id + ']', e.level, e.message, e.sourceId + ':' + e.lineNumber));
    pets.set(d.id, w);
  }
}

// 고양이를 옆 모니터로 넘긴다. 걸어서 넘어갈 때는 같은 화면 높이에서 나타나 바닥이 낮으면 떨어진다.
function moveCatTo(targetId, enter) {
  if (targetId === activeId || !petWin(targetId)) return;
  sendActive('leave');
  activeId = targetId;
  sendActive('enter', enter);
  sendLayouts();
  pushBubble();
}

function endDrag() {
  if (!dragging) return;
  dragging = false;
  clearInterval(dragTimer);
  for (const w of pets.values()) if (!w.isDestroyed()) w.setIgnoreMouseEvents(true, { forward: true });
  broadcast('drag-state', false);
  sendActive('drop');
}

// ── 알림 대기열(모든 모니터가 같은 대기열을 본다) ─────────
function pushBubble() {
  const cur = queue.current();
  broadcast('bubble', cur ? { item: cur, pos: queue.position() } : null);
}
function notify(item) {
  item.at = Date.now();
  queue.add(item);
  pushBubble();
  sendActive('alert');
}
function removeNotify(key) {
  waitingFocus.delete(key);
  queue.remove(key);
  pushBubble();
}

function openAction(item) {
  if (!item || !item.action) return;
  if (item.action.type === 'session') {
    const link = sessionLink(item.action.localId);
    if (link) shell.openExternal(link);
    removeNotify(item.key);
  } else if (item.action.type === 'taskmgr') {
    spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function onHookEvent(event, payload) {
  if (DEBUG) console.log('[hook]', event, JSON.stringify(payload).slice(0, 200));
  const s = store.get();
  const sid = payload.session_id || payload.transcript_path || 'unknown';
  if (event === 'UserPromptSubmit') {
    working.set(sid, Date.now());
    sendWorking();
    removeNotify(sid);
    return;
  }
  if (event !== 'Stop' && event !== 'Notification') return;
  if (event === 'Stop') { working.delete(sid); sendWorking(); }
  if (Date.now() < mutedUntil) return;
  if (event === 'Stop' && !s.notify.done) return;
  if (event === 'Notification' && !s.notify.waiting) return;

  // 이름은 Claude 앱 사이드바 제목 → 기록 파일의 제목 줄 → 작업 폴더 이름 순으로 찾는다
  let session = null, title = null;
  try { session = await sessions.find(payload.session_id); title = session && (await sessions.meta(session))?.title; } catch { session = null; }
  const name = shortTitle(title || await readSessionTitle({ transcriptPath: payload.transcript_path, cwd: payload.cwd }));
  const action = session ? { type: 'session', localId: session.localId } : null;
  let item;
  if (event === 'Stop') {
    item = { key: sid, kind: 'done', action, text: `「${name}」 작업이 끝난 것 같아요. 확인해 보세요!` };
  } else {
    const permission = /permission/i.test(payload.message || '');
    item = {
      key: sid, kind: permission ? 'permission' : 'idle', action,
      text: permission ? `「${name}」 세션이 권한 승인을 기다리고 있어요.` : `「${name}」 세션이 입력을 기다리고 있어요.`,
    };
  }
  notify(item);
  if (session) waitingFocus.set(sid, { session, at: item.at });
}

async function checkFocus() {
  for (const [key, w] of waitingFocus) {
    const m = await sessions.meta(w.session);
    if (m && m.lastFocusedAt > w.at) removeNotify(key);
  }
}

const sendWorking = () => broadcast('working', { count: working.size });

function startServer() {
  if (server) server.close();
  server = startEventServer(store.get().port, (ev, p) => { onHookEvent(ev, p).catch(e => DEBUG && console.log('[hook] 처리 실패', e)); },
    err => notify({ key: 'server', kind: 'error', text: `알림을 받을 포트(${store.get().port})를 열지 못했어요. 설정에서 다른 포트를 골라 주세요. (${err.code})` }));
}

function onSys(st) {
  const s = store.get();
  const prev = lastStatus;
  lastStatus = st;
  broadcast('sys', st);
  if (!s.notify.system || Date.now() < mutedUntil) return;
  // 넘어서는 순간 한 번만 말풍선을 띄운다. 누르면 작업 관리자가 열린다
  const tm = { type: 'taskmgr' };
  if (st.cpuHigh && !prev.cpuHigh) notify({ key: 'cpu', kind: 'cpu', action: tm, text: `CPU 사용률이 ${s.cpuSeconds}초 넘게 ${s.cpuThreshold}% 이상이에요. 열심히 일하는 중!` });
  if (st.ramHigh && !prev.ramHigh) notify({ key: 'ram', kind: 'ram', action: tm, text: `메모리를 ${Math.round(st.ram)}% 쓰고 있어요. 좀 피곤해요…` });
}

async function updateDisk() {
  try {
    const st = await fs.promises.statfs(path.parse(os.homedir()).root);
    diskFreeGB = st.bavail * st.bsize / 1024 ** 3;
  } catch { diskFreeGB = null; }
}

function statusSnapshot() {
  return {
    cpu: lastStatus.cpu, ram: lastStatus.ram,
    ramTotalGB: os.totalmem() / 1024 ** 3, diskFreeGB, diskName: path.parse(os.homedir()).root.replace(/\\$/, ''),
    working: working.size,
  };
}

// ── 트레이 · 설정 창 · 아이콘 ────────────────────────────
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 520, height: 700, title: 'pawtrol 설정', autoHideMenuBar: true,
    show: false, backgroundColor: '#fff8ee', icon: catIcon(store.get(), 64),
    webPreferences: { preload: PRELOAD, backgroundThrottling: false },
  });
  // 다 그려진 뒤에 띄운다(빈 화면이 먼저 보이지 않게)
  settingsWin.once('ready-to-show', () => { settingsWin.show(); settingsWin.focus(); });
  settingsWin.loadFile(path.join(RENDERER, 'settings.html'));
  if (DEBUG) settingsWin.webContents.on('console-message', e => console.log('[settings]', e.level, e.message, e.sourceId + ':' + e.lineNumber));
}

function anyPetVisible() { return [...pets.values()].some(w => !w.isDestroyed() && w.isVisible()); }

function refreshTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: anyPetVisible() ? '숨기기' : '보이기', click: () => {
      const show = !anyPetVisible();
      for (const w of pets.values()) if (!w.isDestroyed()) (show ? w.showInactive() : w.hide());
      refreshTray();
    } },
    { label: '알림 1시간 끄기', type: 'checkbox', checked: Date.now() < mutedUntil,
      click: i => { mutedUntil = i.checked ? Date.now() + MUTE_MS : 0; refreshTray(); } },
    { type: 'separator' },
    { label: '설정', click: openSettings },
    { label: '종료', click: () => app.quit() },
  ]));
}

function applySettings(s) {
  broadcast('settings', s);
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings', s);
    settingsWin.setIcon(catIcon(s, 64));
  }
  tray.setImage(trayIcon(s));
  sysmon.setOptions({ cpuThreshold: s.cpuThreshold, cpuSeconds: s.cpuSeconds, ramThreshold: s.ramThreshold });
  app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin });
}

app.whenReady().then(() => {
  store = createSettingsStore(app.getPath('userData'));
  const s = store.get();
  createPetWindows();
  tray = new Tray(trayIcon(s));
  tray.setToolTip('pawtrol');
  tray.on('click', openSettings);
  refreshTray();
  startServer();
  sysmon = startSysmon({ cpuThreshold: s.cpuThreshold, cpuSeconds: s.cpuSeconds, ramThreshold: s.ramThreshold }, onSys);
  updateDisk();
  // 디스크 여유 공간은 천천히 변하므로 1분마다 잰다
  setInterval(updateDisk, 60 * 1000);
  // 처음 실행이면 훅을 넣는다. 사용자가 설정 창에서 뺐으면 다시 넣지 않는다
  if (!s.hooksOptOut && hookStatus({ port: s.port }) !== 'installed') {
    try { installHooks({ port: s.port }); } catch (e) {
      notify({ key: 'hooks', kind: 'error', text: `Claude 설정 파일을 읽지 못해 연동하지 못했어요. (${e.message})` });
    }
  }
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of working) if (now - t > WORKING_EXPIRE_MS) working.delete(k);
    sendWorking();
  }, 60 * 1000);
  setInterval(() => { checkFocus().catch(() => {}); }, FOCUS_POLL_MS);
  // 정기 상태 알림: 설정한 간격(분)마다 상태 카드를 띄운다. 0 이면 끔
  let lastCardAt = Date.now();
  setInterval(() => {
    const m = store.get().statusInterval;
    if (m > 0 && Date.now() - lastCardAt >= m * 60 * 1000 && Date.now() >= mutedUntil) { lastCardAt = Date.now(); sendActive('show-card'); }
  }, 30 * 1000);

  // 모니터를 꽂거나 빼면 창을 다시 깔고, 크기·작업 표시줄만 바뀌면 창 크기만 맞춘다(고양이 위치 유지)
  screen.on('display-added', createPetWindows);
  screen.on('display-removed', createPetWindows);
  screen.on('display-metrics-changed', (_e, d) => { const w = petWin(d.id); if (w) w.setBounds(d.workArea); sendLayouts(); });

  ipcMain.on('pet-ready', e => {
    e.sender.send('settings', store.get());
    sendLayouts();
    e.sender.send('working', { count: working.size });
    const cur = queue.current();
    e.sender.send('bubble', cur ? { item: cur, pos: queue.position() } : null);
  });
  ipcMain.on('set-ignore', (e, ignore) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w && !dragging) w.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on('bubble-next', () => { queue.next(); pushBubble(); });
  ipcMain.on('bubble-close', () => { const cur = queue.current(); if (cur) waitingFocus.delete(cur.key); queue.dismissCurrent(); pushBubble(); });
  ipcMain.on('bubble-open', () => openAction(queue.current()));
  ipcMain.handle('status', () => statusSnapshot());
  ipcMain.on('handoff', (e, h) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const from = screen.getAllDisplays().find(d => petWin(d.id) === w);
    if (!from || from.id !== activeId) return;
    const to = neighborOf(from, h.side, screen.getAllDisplays());
    if (to) moveCatTo(to.id, { mode: 'walk', from: h.side === 'right' ? 'left' : 'right', screenY: h.screenY, dir: h.dir });
  });
  // 끄는 동안 커서 위치는 여기서 재서 고양이가 있는 창에 보낸다. 마우스를 누른 창이 마우스를 붙잡고 있어
  // 옆 모니터 창에는 마우스 신호가 오지 않기 때문이다(2026-10-22 사용자 제보: 옆 모니터 왼쪽 끝에 멈춤).
  // 놓는 신호(mouseup)는 처음 누른 창이 받아 drag-end 로 알린다. 16ms 는 화면 갱신 1번(60Hz) 간격.
  ipcMain.on('drag-start', (_e, grab) => {
    if (dragging) return;
    dragging = true;
    for (const w of pets.values()) if (!w.isDestroyed()) w.setIgnoreMouseEvents(false);
    broadcast('drag-state', true);
    dragTimer = setInterval(() => {
      const p = screen.getCursorScreenPoint();
      const d = screen.getDisplayNearestPoint(p);
      if (d.id !== activeId) moveCatTo(d.id, { mode: 'drag', grabX: grab.x, grabY: grab.y, cursor: p });
      sendActive('drag-move', p);
    }, 16);
  });
  ipcMain.on('drag-end', endDrag);

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
});

app.on('second-instance', openSettings);
app.on('window-all-closed', e => e.preventDefault());

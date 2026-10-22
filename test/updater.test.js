const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { createUpdater, FIRST_CHECK_MS, CHECK_EVERY_MS } = require('../src/main/updater.js');

function fakeUpdater(result) {
  const u = new EventEmitter();
  u.checks = 0; u.installs = [];
  u.checkForUpdates = async () => { u.checks++; if (result instanceof Error) throw result; return result; };
  u.quitAndInstall = (...a) => u.installs.push(a);
  return u;
}

test('다 받으면 그 버전을 한 번만 알리고, 더 새 버전은 또 알린다', () => {
  const u = fakeUpdater(null), got = [];
  createUpdater({ updater: u, enabled: false, onReady: v => got.push(v) });
  assert.strictEqual(u.autoDownload, true);
  assert.strictEqual(u.autoInstallOnAppQuit, true);
  u.emit('update-downloaded', { version: '0.2.0' });
  u.emit('update-downloaded', { version: '0.2.0' });
  u.emit('update-downloaded', { version: '0.3.0' });
  assert.deepStrictEqual(got, ['0.2.0', '0.3.0']);
});

test('받아 두기 전에는 설치하지 않고, 받은 뒤에는 조용히 설치하고 다시 켠다', () => {
  const u = fakeUpdater(null);
  const up = createUpdater({ updater: u, enabled: false, onReady: () => {} });
  up.install();
  assert.deepStrictEqual(u.installs, []);
  u.emit('update-downloaded', { version: '0.2.0' });
  assert.strictEqual(up.readyVersion(), '0.2.0');
  up.install();
  assert.deepStrictEqual(u.installs, [[true, true]]);
});

test('확인 결과: 새 버전 있음 · 없음 · 실패', async () => {
  const yes = createUpdater({ updater: fakeUpdater({ isUpdateAvailable: true, updateInfo: { version: '0.2.0' } }), enabled: false, onReady: () => {} });
  assert.deepStrictEqual(await yes.check(), { ok: true, available: true, version: '0.2.0' });
  const no = createUpdater({ updater: fakeUpdater({ isUpdateAvailable: false, updateInfo: { version: '0.1.0' } }), enabled: false, onReady: () => {} });
  assert.deepStrictEqual(await no.check(), { ok: true, available: false, version: '0.1.0' });
  const bad = createUpdater({ updater: fakeUpdater(new Error('net')), enabled: false, onReady: () => {} });
  assert.deepStrictEqual(await bad.check(), { ok: false, error: 'net' });
});

test('오류 신호가 와도 앱을 멈추지 않는다', () => {
  const u = fakeUpdater(null);
  createUpdater({ updater: u, enabled: false, onReady: () => {} });
  assert.doesNotThrow(() => u.emit('error', new Error('offline')));
});

test('켜 두면 조금 뒤 처음 확인하고 그 뒤로 주기마다 확인한다. 끄면 멈춘다', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const u = fakeUpdater(null);
  const up = createUpdater({ updater: u, enabled: true, onReady: () => {} });
  t.mock.timers.tick(FIRST_CHECK_MS - 1);
  assert.strictEqual(u.checks, 0);
  t.mock.timers.tick(1);
  assert.strictEqual(u.checks, 1);
  t.mock.timers.tick(CHECK_EVERY_MS);
  assert.strictEqual(u.checks, 2);
  up.setEnabled(false);
  t.mock.timers.tick(CHECK_EVERY_MS * 3);
  assert.strictEqual(u.checks, 2);
});

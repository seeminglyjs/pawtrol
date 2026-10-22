const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installHooks, removeHooks, hookStatus, HOOK_EVENTS } = require('../src/main/hook-installer.js');

function tmpSettings(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtrol-'));
  const file = path.join(dir, 'settings.json');
  if (content !== undefined) fs.writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
}
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

test('훅을 설치하면 세 이벤트에 펫 훅이 들어가고 기존 설정은 그대로 남는다', () => {
  const existing = {
    permissions: { allow: ['WebFetch'] },
    theme: 'dark',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] },
  };
  const f = tmpSettings(existing);
  installHooks({ settingsPath: f, port: 47321 });
  const after = read(f);
  assert.deepStrictEqual(after.permissions, existing.permissions);
  assert.strictEqual(after.theme, 'dark');
  assert.strictEqual(after.hooks.Stop[0].hooks[0].command, 'echo mine', '사용자 훅을 지우지 않는다');
  for (const ev of HOOK_EVENTS) {
    const cmds = after.hooks[ev].flatMap(h => h.hooks.map(x => x.command));
    assert.ok(cmds.some(c => c.includes('127.0.0.1:47321/hook/' + ev)), ev + ' 훅이 있어야 한다');
  }
  assert.strictEqual(hookStatus({ settingsPath: f, port: 47321 }), 'installed');
});

test('두 번 설치해도 펫 훅은 한 벌만 남고, 포트가 바뀌면 새 포트로 바뀐다', () => {
  const f = tmpSettings({});
  installHooks({ settingsPath: f, port: 47321 });
  installHooks({ settingsPath: f, port: 47400 });
  const after = read(f);
  const cmds = after.hooks.Stop.flatMap(h => h.hooks.map(x => x.command));
  assert.strictEqual(cmds.length, 1);
  assert.ok(cmds[0].includes(':47400/'));
  assert.strictEqual(hookStatus({ settingsPath: f, port: 47321 }), 'other-port');
});

test('설정 파일이 없어도 설치되고, 제거하면 펫 훅만 빠진다', () => {
  const f = tmpSettings();
  installHooks({ settingsPath: f, port: 47321 });
  assert.strictEqual(hookStatus({ settingsPath: f, port: 47321 }), 'installed');
  const withMine = read(f);
  withMine.hooks.Stop.push({ hooks: [{ type: 'command', command: 'echo mine' }] });
  fs.writeFileSync(f, JSON.stringify(withMine));
  removeHooks({ settingsPath: f });
  const after = read(f);
  assert.deepStrictEqual(Object.keys(after.hooks), ['Stop']);
  assert.strictEqual(after.hooks.Stop.length, 1);
  assert.strictEqual(after.hooks.Stop[0].hooks[0].command, 'echo mine');
  assert.strictEqual(hookStatus({ settingsPath: f, port: 47321 }), 'missing');
});

test('설치 전에 원래 설정 파일을 백업한다', () => {
  const f = tmpSettings({ theme: 'dark' });
  const { backupPath } = installHooks({ settingsPath: f, port: 47321 });
  assert.deepStrictEqual(read(backupPath), { theme: 'dark' });
});

test('설정 파일이 깨진 JSON 이면 고치지 않고 오류를 낸다', () => {
  const f = tmpSettings();
  fs.writeFileSync(f, '{ broken');
  assert.throws(() => installHooks({ settingsPath: f, port: 47321 }));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '{ broken');
});

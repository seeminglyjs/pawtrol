const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSessionIndex, sessionLink } = require('../src/main/claude-sessions.js');

function fixture(sessions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawtrol-cs-'));
  const dir = path.join(root, 'claude_x', 'claude-code-sessions', 'acc', 'org');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of sessions) {
    fs.writeFileSync(path.join(dir, s.sessionId + '.json'), JSON.stringify({ sessionId: s.sessionId, cliSessionId: s.cli, cwd: 'C:\\x', title: s.title, lastFocusedAt: s.focused, padding: 'x'.repeat(5000) }));
  }
  return { root, dir };
}

test('훅의 세션 ID 로 Claude 앱 세션(local_…)과 사이드바 제목을 찾는다', async () => {
  const { root } = fixture([
    { sessionId: 'local_aaa', cli: '11111111-1111-1111-1111-111111111111', title: '첫 세션', focused: 100 },
    { sessionId: 'local_bbb', cli: '22222222-2222-2222-2222-222222222222', title: '클로드/PC 상태 동기화 도트 동물', focused: 200 },
  ]);
  const idx = createSessionIndex([path.join(root, 'claude_x', 'claude-code-sessions')]);
  const s = await idx.find('22222222-2222-2222-2222-222222222222');
  assert.strictEqual(s.localId, 'local_bbb');
  const meta = await idx.meta(s);
  assert.strictEqual(meta.title, '클로드/PC 상태 동기화 도트 동물');
  assert.strictEqual(meta.lastFocusedAt, 200);
});

test('없는 세션이나 없는 폴더면 null 을 돌려주고 오류를 내지 않는다', async () => {
  const { root } = fixture([]);
  const idx = createSessionIndex([path.join(root, 'claude_x', 'claude-code-sessions'), path.join(root, '없는-폴더')]);
  assert.strictEqual(await idx.find('33333333-3333-3333-3333-333333333333'), null);
});

test('나중에 생긴 세션 파일도 다시 찾는다', async () => {
  const { root, dir } = fixture([]);
  const idx = createSessionIndex([path.join(root, 'claude_x', 'claude-code-sessions')]);
  assert.strictEqual(await idx.find('44444444-4444-4444-4444-444444444444'), null);
  fs.writeFileSync(path.join(dir, 'local_ccc.json'), JSON.stringify({ sessionId: 'local_ccc', cliSessionId: '44444444-4444-4444-4444-444444444444' }));
  assert.strictEqual((await idx.find('44444444-4444-4444-4444-444444444444')).localId, 'local_ccc');
});

test('세션 열기 주소는 Claude 앱 형식이고, 형식에 맞지 않는 ID 는 만들지 않는다', () => {
  assert.strictEqual(sessionLink('local_0ac351a6-9364-461b-a572-73a67e50a1b5'), 'claude://code/continue?session=local_0ac351a6-9364-461b-a572-73a67e50a1b5');
  assert.strictEqual(sessionLink('local_../../x'), null);
  assert.strictEqual(sessionLink('6dbde444-11cb-4a9b-9822-7cbf02c1196e'), null);
});

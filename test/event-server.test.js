const test = require('node:test');
const assert = require('node:assert');
const { startEventServer, parseNotify, decodeBody } = require('../src/main/event-server.js');

function post(port, path, body, type) {
  return fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: type ? { 'Content-Type': type } : {}, body });
}

test('훅 주소와 범용 알림 주소를 나눠 받는다', async () => {
  const got = [];
  const server = startEventServer(47391, { onHook: (ev, p) => got.push(['hook', ev, p.session_id]), onNotify: n => got.push(['notify', n.text]) }, () => {});
  await new Promise(r => server.once('listening', r));
  try {
    assert.strictEqual((await post(47391, '/hook/Stop', JSON.stringify({ session_id: 's1' }), 'application/json')).status, 204);
    assert.strictEqual((await post(47391, '/notify', '빌드 끝났어요')).status, 204);
    assert.strictEqual((await post(47391, '/other', 'x')).status, 404);
    await new Promise(r => setTimeout(r, 20));
    assert.deepStrictEqual(got, [['hook', 'Stop', 's1'], ['notify', '빌드 끝났어요']]);
  } finally { server.close(); }
});

test('범용 알림은 글만 보내도 되고, JSON 이면 이름표와 열 주소를 받는다', () => {
  assert.deepStrictEqual(parseNotify('테스트 끝났어요'), { text: '테스트 끝났어요', key: null, link: null });
  assert.deepStrictEqual(parseNotify(JSON.stringify({ text: '배포 끝', key: 'deploy', link: 'https://github.com/x' })),
    { text: '배포 끝', key: 'deploy', link: 'https://github.com/x' });
});

test('누를 때 열 주소는 http·https 만 받고, 빈 글은 버린다', () => {
  assert.strictEqual(parseNotify(JSON.stringify({ text: 'a', link: 'file:///C:/Windows/system32/calc.exe' })).link, null);
  assert.strictEqual(parseNotify(JSON.stringify({ text: 'a', link: 'javascript:alert(1)' })).link, null);
  assert.strictEqual(parseNotify('   '), null);
  assert.strictEqual(parseNotify(JSON.stringify({ text: '' })), null);
});

test('한글 윈도우 명령줄이 보내는 CP949 글도 UTF-8 글과 똑같이 읽는다', () => {
  // Git Bash 의 curl -d "테스트" 가 실제로 보낸 바이트(2026-10-22 이 PC 실측)
  assert.strictEqual(decodeBody(Buffer.from('c5d7bdbac6ae', 'hex')), '테스트');
  assert.strictEqual(decodeBody(Buffer.from('테스트', 'utf8')), '테스트');
});

test('긴 글은 말풍선에 맞게 200자로 자른다', () => {
  assert.strictEqual(Array.from(parseNotify('가'.repeat(500)).text).length, 200);
});

const test = require('node:test');
const assert = require('node:assert');
const { createQueue } = require('../src/renderer/queue.js');

test('알림이 여러 건이면 덮지 않고 쌓이고, 다음으로 넘기면 차례로 보인다', () => {
  const q = createQueue();
  q.add({ key: 'a', kind: 'done', text: 'A 끝' });
  q.add({ key: 'b', kind: 'done', text: 'B 끝' });
  q.add({ key: 'cpu', kind: 'cpu', text: 'CPU 높음' });
  assert.strictEqual(q.size(), 3);
  assert.strictEqual(q.current().text, 'A 끝');
  assert.deepStrictEqual(q.position(), { index: 1, total: 3 });
  q.next();
  assert.strictEqual(q.current().text, 'B 끝');
  q.next();
  assert.strictEqual(q.current().text, 'CPU 높음');
  q.next();
  assert.strictEqual(q.current().text, 'A 끝', '마지막 다음은 처음으로 돌아간다');
});

test('같은 세션 알림은 하나로 합치고 새 문구로 바꾼다', () => {
  const q = createQueue();
  q.add({ key: 's1', kind: 'done', text: '첫 응답 끝' });
  q.add({ key: 's2', kind: 'done', text: '다른 세션' });
  q.add({ key: 's1', kind: 'permission', text: '권한 대기' });
  assert.strictEqual(q.size(), 2);
  assert.strictEqual(q.current().text, '권한 대기');
});

test('응답 끝 알림이 남아 있으면 같은 세션의 입력 대기 알림은 끝 알림을 덮지 않는다', () => {
  const q = createQueue();
  q.add({ key: 's1', kind: 'done', text: '끝났어요' });
  q.add({ key: 's1', kind: 'idle', text: '입력 대기' });
  assert.strictEqual(q.current().text, '끝났어요');
});

test('세션에서 새 요청을 보내면 그 세션 알림은 지운다', () => {
  const q = createQueue();
  q.add({ key: 's1', kind: 'done', text: 'A' });
  q.add({ key: 's2', kind: 'done', text: 'B' });
  q.next();
  q.remove('s1');
  assert.strictEqual(q.size(), 1);
  assert.strictEqual(q.current().text, 'B');
});

test('맨 앞에 넣은 알림(자리 비움 요약)이 먼저 보이고, 나머지는 그 뒤로 이어진다', () => {
  const q = createQueue();
  q.add({ key: 'a', kind: 'done', text: 'A' });
  q.add({ key: 'b', kind: 'done', text: 'B' });
  q.next();
  q.add({ key: 'away', kind: 'away', text: '다녀왔어요' }, { front: true });
  assert.strictEqual(q.current().text, '다녀왔어요');
  assert.deepStrictEqual(q.position(), { index: 1, total: 3 });
  q.next();
  assert.strictEqual(q.current().text, 'A');
});

test('지금 보는 알림을 닫으면 다음 알림이 보이고, 다 닫으면 비어 있다', () => {
  const q = createQueue();
  q.add({ key: 'a', kind: 'done', text: 'A' });
  q.add({ key: 'b', kind: 'done', text: 'B' });
  q.dismissCurrent();
  assert.strictEqual(q.current().text, 'B');
  q.dismissCurrent();
  assert.strictEqual(q.current(), null);
  assert.deepStrictEqual(q.position(), { index: 0, total: 0 });
});

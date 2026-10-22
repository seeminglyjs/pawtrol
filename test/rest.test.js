const test = require('node:test');
const assert = require('node:assert');
const { createRestTracker } = require('../src/main/rest.js');

const MIN = 60 * 1000;

test('쉬지 않고 50분 쓰면 한 번 알리고, 다시 50분 지나면 또 알린다', () => {
  const t = createRestTracker({ restMinutes: 50, breakMinutes: 5 });
  assert.strictEqual(t.update({ idleSec: 0, at: 0 }), false);
  assert.strictEqual(t.update({ idleSec: 10, at: 49 * MIN }), false);
  assert.strictEqual(t.update({ idleSec: 10, at: 50 * MIN }), true);
  assert.strictEqual(t.update({ idleSec: 10, at: 51 * MIN }), false, '알린 직후에는 다시 알리지 않는다');
  assert.strictEqual(t.update({ idleSec: 10, at: 100 * MIN }), true);
});

test('5분 넘게 손을 떼면 쉰 것으로 보고 처음부터 다시 센다', () => {
  const t = createRestTracker({ restMinutes: 50, breakMinutes: 5 });
  t.update({ idleSec: 0, at: 0 });
  t.update({ idleSec: 0, at: 40 * MIN });
  assert.strictEqual(t.update({ idleSec: 6 * 60, at: 46 * MIN }), false);
  assert.strictEqual(t.update({ idleSec: 0, at: 47 * MIN }), false);
  assert.strictEqual(t.update({ idleSec: 0, at: 96 * MIN }), false, '쉰 뒤 49분째');
  assert.strictEqual(t.update({ idleSec: 0, at: 97 * MIN }), true);
});

test('기준을 바꾸면 새 기준으로 판정한다', () => {
  const t = createRestTracker({ restMinutes: 50, breakMinutes: 5 });
  t.update({ idleSec: 0, at: 0 });
  t.setOptions({ restMinutes: 30 });
  assert.strictEqual(t.update({ idleSec: 0, at: 30 * MIN }), true);
});

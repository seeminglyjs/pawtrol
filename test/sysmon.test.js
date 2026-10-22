const test = require('node:test');
const assert = require('node:assert');
const { cpuPercent, createLoadTracker } = require('../src/main/sysmon.js');

test('CPU 사용률은 두 시점의 유휴·전체 시간 차이로 구한다', () => {
  const a = [{ times: { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 } }];
  const b = [{ times: { user: 400, nice: 0, sys: 200, idle: 900, irq: 0 } }];
  assert.strictEqual(Math.round(cpuPercent(a, b)), 80);
});

test('CPU 는 기준 이상이 정한 시간 넘게 이어져야 과부하로 본다', () => {
  const t = createLoadTracker({ cpuThreshold: 85, cpuSeconds: 10, ramThreshold: 90 });
  assert.strictEqual(t.update({ cpu: 95, ram: 50, at: 0 }).cpuHigh, false);
  assert.strictEqual(t.update({ cpu: 95, ram: 50, at: 6000 }).cpuHigh, false);
  assert.strictEqual(t.update({ cpu: 95, ram: 50, at: 10000 }).cpuHigh, true);
  assert.strictEqual(t.update({ cpu: 60, ram: 50, at: 12000 }).cpuHigh, false, '기준 아래로 내려가면 풀린다');
  assert.strictEqual(t.update({ cpu: 95, ram: 50, at: 14000 }).cpuHigh, false, '다시 처음부터 센다');
});

test('RAM 은 기준 이상이면 바로 과부하이고, 기준보다 3%p 낮아져야 풀린다', () => {
  const t = createLoadTracker({ cpuThreshold: 85, cpuSeconds: 10, ramThreshold: 90 });
  assert.strictEqual(t.update({ cpu: 10, ram: 91, at: 0 }).ramHigh, true);
  assert.strictEqual(t.update({ cpu: 10, ram: 89, at: 2000 }).ramHigh, true);
  assert.strictEqual(t.update({ cpu: 10, ram: 86, at: 4000 }).ramHigh, false);
});

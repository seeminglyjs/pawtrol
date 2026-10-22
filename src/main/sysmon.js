// CPU·RAM 사용률을 재고 과부하 여부를 정한다.
const os = require('node:os');

function cpuPercent(prev, curr) {
  let idle = 0, total = 0;
  curr.forEach((c, i) => {
    const p = prev[i] || { times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } };
    const sum = t => t.user + t.nice + t.sys + t.idle + t.irq;
    idle += c.times.idle - p.times.idle;
    total += sum(c.times) - sum(p.times);
  });
  return total > 0 ? (1 - idle / total) * 100 : 0;
}

// RAM 이 기준 바로 위아래를 오갈 때 고양이 표정이 깜빡이지 않도록, 풀리는 선은 기준보다 3%p 낮게 둔다(가정, 검증 필요).
const RAM_RELEASE_GAP = 3;

function createLoadTracker(opts) {
  let o = { ...opts };
  let cpuSince = null, ramHigh = false;
  return {
    setOptions(next) { o = { ...o, ...next }; },
    update({ cpu, ram, at }) {
      if (cpu >= o.cpuThreshold) { if (cpuSince === null) cpuSince = at; } else cpuSince = null;
      const cpuHigh = cpuSince !== null && at - cpuSince >= o.cpuSeconds * 1000;
      if (ram >= o.ramThreshold) ramHigh = true;
      else if (ram < o.ramThreshold - RAM_RELEASE_GAP) ramHigh = false;
      return { cpu, ram, cpuHigh, ramHigh };
    },
  };
}

// 2초는 작업 관리자의 기본 갱신 주기(1초)보다 느슨하게 잡아 펫 자체 부하를 줄인 값(가정).
const SAMPLE_MS = 2000;

function startSysmon(opts, onStatus) {
  const tracker = createLoadTracker(opts);
  let prev = os.cpus();
  const timer = setInterval(() => {
    const curr = os.cpus();
    const cpu = cpuPercent(prev, curr);
    prev = curr;
    const ram = (1 - os.freemem() / os.totalmem()) * 100;
    onStatus(tracker.update({ cpu, ram, at: Date.now() }));
  }, SAMPLE_MS);
  return { stop: () => clearInterval(timer), setOptions: o => tracker.setOptions(o) };
}

module.exports = { cpuPercent, createLoadTracker, startSysmon };

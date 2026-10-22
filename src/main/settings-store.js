// 사용자 설정을 userData/settings.json 에 저장한다. 없는 항목은 기본값으로 채운다.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  preset: 'gray',
  colors: null, // null 이면 프리셋 색을 그대로 쓴다. { f, d, g } 를 넣으면 그 칸만 바꾼다
  scale: 3, // 도트 1칸 = 화면 3px. 40×34칸 고양이가 120×102px 로 보인다
  sticker: false,
  notify: { done: true, waiting: true, working: true, system: true },
  cpuThreshold: 85, // 가정(검증 필요) · 2026-10-22 사용자 승인
  cpuSeconds: 10, // 짧게 튀는 사용률에 반응하지 않도록 거는 지속 시간. 가정(검증 필요)
  ramThreshold: 90, // 가정(검증 필요)
  sleepMinutes: 5, // 가정(검증 필요)
  port: 47321, // 플레이스홀더(미확정, 근거 필요): 흔한 개발 포트와 겹치지 않는 높은 번호에서 고름
  openAtLogin: false,
  statusCard: { cpu: true, ram: true, disk: true, battery: true, claude: true }, // 고양이를 누르면 보이는 상태 카드 항목
  statusInterval: 0, // 정기 상태 알림 간격(분). 0 = 끄기 · 2026-10-22 사용자 결정
  headBars: false, // 머리 위 CPU·RAM 막대 상시 표시 · 2026-10-22 사용자 결정
  hooksOptOut: false, // 사용자가 설정 창에서 훅을 제거하면 true. 그 뒤로는 자동으로 다시 설치하지 않는다
};

function merge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object'
      ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

function createSettingsStore(dir) {
  const file = path.join(dir, 'settings.json');
  let data = DEFAULTS;
  try { data = merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* 처음 실행 · 깨진 파일이면 기본값 */ }
  return {
    get: () => data,
    set(patch) {
      data = merge(data, patch);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
      fs.renameSync(file + '.tmp', file);
      return data;
    },
  };
}

module.exports = { createSettingsStore, DEFAULTS };

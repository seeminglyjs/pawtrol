// Claude Code 전역 설정(~/.claude/settings.json)에 펫 훅을 넣고 빼는 일.
// 펫 훅은 명령 끝의 표식(MARK)으로 알아보며, 사용자가 넣은 다른 훅과 설정은 건드리지 않는다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK_EVENTS = ['UserPromptSubmit', 'Stop', 'Notification'];
const MARK = '# pawtrol-hook';
const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

// 훅이 받은 JSON 을 그대로 펫에 넘긴다. 출력은 버리고 늘 성공으로 끝낸다.
// 윈도우에서는 펫이 꺼져 닫힌 포트에 붙을 때 거절까지 약 1.1초가 걸린다(2026-10-22 이 PC 실측).
// 연결 대기를 0.3초로 끊으면 약 0.4초로 줄어든다. 켜져 있을 때 127.0.0.1 연결은 즉시 붙으므로 0.3초로 충분하다.
function hookCommand(event, port) {
  return `curl -s --connect-timeout 0.3 -m 1 -H "Content-Type: application/json" --data-binary @- http://127.0.0.1:${port}/hook/${event} >/dev/null 2>&1; exit 0 ${MARK}`;
}

function isOurs(entry) {
  return (entry.hooks || []).some(h => typeof h.command === 'string' && h.command.includes(MARK));
}

function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return { data: {}, raw: null };
  const raw = fs.readFileSync(settingsPath, 'utf8');
  // 깨진 JSON 을 덮어쓰면 사용자 설정이 사라지므로 손대지 않고 오류를 낸다
  return { data: raw.trim() ? JSON.parse(raw) : {}, raw };
}

function writeSettings(settingsPath, data) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const tmp = settingsPath + '.pawtrol-tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, settingsPath);
}

function stripOurs(hooks) {
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    hooks[ev] = hooks[ev].filter(e => !isOurs(e));
    if (!hooks[ev].length) delete hooks[ev];
  }
}

function installHooks({ settingsPath = DEFAULT_SETTINGS_PATH, port }) {
  const { data, raw } = readSettings(settingsPath);
  let backupPath = null;
  if (raw !== null) {
    backupPath = settingsPath + '.pawtrol-backup';
    fs.writeFileSync(backupPath, raw);
  }
  data.hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : {};
  stripOurs(data.hooks);
  for (const ev of HOOK_EVENTS) {
    data.hooks[ev] = data.hooks[ev] || [];
    data.hooks[ev].push({ hooks: [{ type: 'command', command: hookCommand(ev, port), timeout: 3 }] });
  }
  writeSettings(settingsPath, data);
  return { backupPath };
}

function removeHooks({ settingsPath = DEFAULT_SETTINGS_PATH }) {
  if (!fs.existsSync(settingsPath)) return;
  const { data } = readSettings(settingsPath);
  if (!data.hooks) return;
  stripOurs(data.hooks);
  if (!Object.keys(data.hooks).length) delete data.hooks;
  writeSettings(settingsPath, data);
}

// 'installed' · 'other-port'(다른 포트로 설치됨) · 'partial'(일부만 있음) · 'missing' · 'unreadable'
function hookStatus({ settingsPath = DEFAULT_SETTINGS_PATH, port }) {
  let data;
  try { data = readSettings(settingsPath).data; } catch { return 'unreadable'; }
  const hooks = data.hooks || {};
  const cmds = HOOK_EVENTS.map(ev => (hooks[ev] || []).filter(isOurs).flatMap(e => e.hooks.map(h => h.command)));
  const present = cmds.filter(c => c.length).length;
  if (!present) return 'missing';
  if (present < HOOK_EVENTS.length) return 'partial';
  return cmds.every((c, i) => c.some(x => x.includes(`127.0.0.1:${port}/hook/${HOOK_EVENTS[i]}`))) ? 'installed' : 'other-port';
}

module.exports = { installHooks, removeHooks, hookStatus, HOOK_EVENTS, DEFAULT_SETTINGS_PATH };

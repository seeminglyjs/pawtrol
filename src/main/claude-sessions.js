// Claude 데스크톱 앱의 세션 파일 읽기.
// 훅이 주는 세션 ID(CLI 세션, uuid)와 앱 세션 ID(local_…)는 다르고, 둘을 잇는 값은 앱 세션 파일의 cliSessionId 에 있다.
// 같은 파일에 사이드바 제목(title)과 그 세션을 마지막으로 본 시각(lastFocusedAt)도 있다.
// 위치·형식은 앱 내부 구조라 앱이 바뀌면 못 찾을 수 있다. 그때는 null 을 돌려주고 부르는 쪽이 예전 방식으로 돌아간다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 2026-10-22 이 PC 실측: 스토어(MSIX) 설치본은 %LOCALAPPDATA%\Claude-Data\claude_<게시자>\claude-code-sessions\<계정>\<조직>\local_*.json
// 설치 파일본은 userData(%APPDATA%\Claude) 아래 같은 이름 폴더를 쓴다(앱 코드의 userData 판별 함수 기준).
function defaultRoots() {
  const roots = [];
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const dataDir = path.join(local, 'Claude-Data');
  try {
    for (const d of fs.readdirSync(dataDir)) roots.push(path.join(dataDir, d, 'claude-code-sessions'));
  } catch { /* 스토어 설치본이 아님 */ }
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  roots.push(path.join(roaming, 'Claude', 'claude-code-sessions'));
  return roots;
}

// 앱이 받는 세션 ID 형식(앱 코드의 검증식과 같다)
const LOCAL_ID_RE = /^local_[A-Za-z0-9-]{1,64}$/;
const CLI_ID_RE = /"cliSessionId":"([^"]+)"/;
// cliSessionId 는 파일 앞쪽 두 번째 칸에 있어 앞부분만 읽는다
const HEAD_BYTES = 2048;

function sessionLink(localId) {
  return LOCAL_ID_RE.test(localId || '') ? `claude://code/continue?session=${localId}` : null;
}

async function listSessionFiles(roots) {
  const out = [];
  async function walk(dir, depth) {
    let ents;
    try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) await walk(p, depth + 1);
      else if (e.isFile() && /^local_.*\.json$/.test(e.name)) out.push(p);
    }
  }
  for (const r of roots) await walk(r, 0);
  return out;
}

async function readHead(file) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally { await fh.close(); }
}

function createSessionIndex(roots = defaultRoots()) {
  const byCli = new Map(); // cliSessionId → 파일 경로
  const seen = new Set();
  return {
    // 처음 보는 파일만 앞부분을 읽어 색인에 넣는다. 세션 파일은 수백 개라 매번 다 읽지 않는다.
    async find(cliId) {
      if (!cliId) return null;
      if (!byCli.has(cliId)) {
        for (const f of await listSessionFiles(roots)) {
          if (seen.has(f)) continue;
          try {
            const m = CLI_ID_RE.exec(await readHead(f));
            seen.add(f);
            if (m) byCli.set(m[1], f);
          } catch { /* 쓰는 중인 파일은 다음에 다시 본다 */ }
          if (byCli.has(cliId)) break;
        }
      }
      const file = byCli.get(cliId);
      if (!file) return null;
      return { file, localId: path.basename(file, '.json') };
    },
    async meta(session) {
      try {
        const d = JSON.parse(await fs.promises.readFile(session.file, 'utf8'));
        return { title: d.title || null, lastFocusedAt: Number(d.lastFocusedAt) || 0 };
      } catch { return null; }
    },
  };
}

module.exports = { createSessionIndex, sessionLink };

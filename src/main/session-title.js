// 세션 이름 찾기. 데스크톱 앱이 붙인 세션 제목은 훅 입력에 없고 기록 파일(transcript)의
// {"type":"custom-title","customTitle":...} 줄에 남는다(제목이 바뀔 때마다 새 줄이 붙으므로 마지막 줄이 지금 제목).
const fs = require('node:fs');
const path = require('node:path');

// 제목 줄은 대화 중간중간 다시 붙으므로 파일 끝 512KB 만 먼저 본다. 못 찾으면 처음부터 끝까지 본다.
const TAIL_BYTES = 512 * 1024;
const TITLE_RE = /"type":"custom-title"[^\n]*/g;

function lastTitleIn(text) {
  let found = null;
  for (const m of text.matchAll(TITLE_RE)) {
    const line = text.slice(text.lastIndexOf('\n', m.index) + 1, text.indexOf('\n', m.index) < 0 ? undefined : text.indexOf('\n', m.index));
    try { const d = JSON.parse(line); if (d.customTitle) found = d.customTitle; } catch { /* 잘린 줄은 건너뛴다 */ }
  }
  return found;
}

async function readSessionTitle({ transcriptPath, cwd }) {
  const fallback = cwd ? path.basename(String(cwd).replace(/[\\/]+$/, '').replace(/\\/g, '/')) : 'Claude';
  if (!transcriptPath) return fallback;
  try {
    const fh = await fs.promises.open(transcriptPath, 'r');
    try {
      const { size } = await fh.stat();
      const start = Math.max(0, size - TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      await fh.read(buf, 0, buf.length, start);
      let title = lastTitleIn(buf.toString('utf8'));
      if (!title && start > 0) title = lastTitleIn(await fs.promises.readFile(transcriptPath, 'utf8'));
      return title || fallback;
    } finally { await fh.close(); }
  } catch {
    return fallback;
  }
}

// 말풍선 한 줄에 들어가도록 줄인다. 15자는 말풍선 폭(약 240px · 13px 글자)에서 문장 앞부분이 한 줄에 남는 길이(가정, 화면 확인).
const TITLE_MAX = 15;
function shortTitle(title) {
  const chars = Array.from(title);
  return chars.length <= TITLE_MAX ? title : chars.slice(0, TITLE_MAX).join('').trimEnd() + '…';
}

module.exports = { readSessionTitle, shortTitle };

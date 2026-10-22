// 로컬 HTTP 서버. 이 PC 안(127.0.0.1)에서만 받는다.
//   POST /hook/<이벤트> : Claude Code 훅이 보내는 JSON
//   POST /notify        : 아무 프로그램이나 보내는 범용 알림(글 그대로, 또는 {"text","key","link"} JSON)
const http = require('node:http');

// 훅 입력에는 마지막 답변 전문이 들어갈 수 있어 넉넉히 받되, 끝없이 받지는 않는다.
const MAX_BODY = 4 * 1024 * 1024;
// 말풍선 한 칸에 담을 글 길이. 240px 폭에 13px 글자로 약 8줄(가정, 화면 확인)
const NOTIFY_MAX_CHARS = 200;

// 누르면 열 주소는 웹 주소만 받는다. 이 PC 의 다른 프로그램도 보낼 수 있어 파일·스크립트 주소는 막는다.
function safeLink(v) {
  if (typeof v !== 'string') return null;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

// 한글 윈도우의 명령줄(Git Bash 의 curl -d "…" 등)은 글을 UTF-8 이 아닌 CP949 로 보낸다(2026-10-22 이 PC 실측).
// UTF-8 로 읽어 깨지면 CP949(euc-kr)로 다시 읽는다.
function decodeBody(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch {
    try { return new TextDecoder('euc-kr').decode(buf); } catch { return buf.toString('utf8'); }
  }
}

function parseNotify(body) {
  let text = body, key = null, link = null;
  const trimmed = (body || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const d = JSON.parse(trimmed);
      text = d.text; key = typeof d.key === 'string' && d.key.trim() ? d.key.trim().slice(0, 64) : null; link = safeLink(d.link);
    } catch { /* JSON 이 아니면 글 그대로 */ }
  }
  text = typeof text === 'string' ? text.trim() : '';
  if (!text) return null;
  const chars = Array.from(text);
  return { text: chars.length > NOTIFY_MAX_CHARS ? chars.slice(0, NOTIFY_MAX_CHARS).join('') : text, key, link };
}

function startEventServer(port, { onHook, onNotify }, onError) {
  const server = http.createServer((req, res) => {
    const hook = /^\/hook\/([A-Za-z]+)$/.exec(req.url || '');
    const isNotify = req.url === '/notify';
    if (req.method !== 'POST' || !(hook || isNotify)) { res.writeHead(404).end(); return; }
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      // 보낸 쪽이 기다리지 않도록 먼저 답하고 처리한다
      res.writeHead(204).end();
      const body = decodeBody(Buffer.concat(chunks));
      if (isNotify) {
        const n = parseNotify(body);
        if (n) onNotify(n);
        return;
      }
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch (e) {
        if (process.env.PAWTROL_DEBUG) console.log('[hook] 몸통 해석 실패', e.message, body.slice(0, 200));
      }
      onHook(hook[1], payload);
    });
  });
  server.on('error', onError);
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { startEventServer, parseNotify, decodeBody };

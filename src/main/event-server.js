// Claude Code 훅이 보내는 JSON 을 받는 로컬 HTTP 서버. 이 PC 안(127.0.0.1)에서만 받는다.
const http = require('node:http');

// 훅 입력에는 마지막 답변 전문이 들어갈 수 있어 넉넉히 받되, 끝없이 받지는 않는다.
const MAX_BODY = 4 * 1024 * 1024;

function startEventServer(port, onEvent, onError) {
  const server = http.createServer((req, res) => {
    const m = /^\/hook\/([A-Za-z]+)$/.exec(req.url || '');
    if (req.method !== 'POST' || !m) { res.writeHead(404).end(); return; }
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      // 훅이 기다리지 않도록 먼저 답하고 처리한다
      res.writeHead(204).end();
      let payload = {};
      const body = Buffer.concat(chunks).toString('utf8');
      try { payload = JSON.parse(body || '{}'); } catch (e) {
        if (process.env.PAWTROL_DEBUG) console.log('[hook] 몸통 해석 실패', e.message, body.slice(0, 200));
      }
      onEvent(m[1], payload);
    });
  });
  server.on('error', onError);
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { startEventServer };

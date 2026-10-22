const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSessionTitle, shortTitle } = require('../src/main/session-title.js');

function transcript(lines) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pawtrol-')), 's.jsonl');
  fs.writeFileSync(f, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return f;
}

test('기록 파일의 마지막 세션 제목(custom-title)을 읽는다', async () => {
  const f = transcript([
    { type: 'user', message: { content: 'hi' } },
    { type: 'custom-title', customTitle: '옛 제목' },
    { type: 'assistant', message: { content: [] } },
    { type: 'custom-title', customTitle: '롯데 내부 변수와 외부 변수 상관관계 분석' },
  ]);
  assert.strictEqual(await readSessionTitle({ transcriptPath: f, cwd: 'C:\\project\\root-ontology' }), '롯데 내부 변수와 외부 변수 상관관계 분석');
});

test('제목이 없으면 작업 폴더 이름을 쓰고, 기록 파일이 없어도 폴더 이름을 쓴다', async () => {
  const f = transcript([{ type: 'user', message: { content: 'hi' } }]);
  assert.strictEqual(await readSessionTitle({ transcriptPath: f, cwd: 'C:\\project\\root-ontology' }), 'root-ontology');
  assert.strictEqual(await readSessionTitle({ transcriptPath: 'C:\\없는\\파일.jsonl', cwd: '/home/me/pawtrol' }), 'pawtrol');
});

test('긴 제목은 말풍선에 맞게 줄이고 말줄임표를 붙인다', () => {
  assert.strictEqual(shortTitle('짧은 제목'), '짧은 제목');
  assert.strictEqual(shortTitle('롯데 내부 변수와 외부 변수 상관관계 분석'), '롯데 내부 변수와 외부 변수…');
});

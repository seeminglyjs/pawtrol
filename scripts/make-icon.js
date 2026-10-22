// 설치 파일 아이콘(build/icon.png, 256px)을 고양이 머리 도트로 만든다. 앱 안 아이콘(src/main/icon.js)과 같은 잘라내기를 쓴다.
// 색은 기본 프리셋. 고양이 그림을 바꾸면 `npm run icon` 으로 다시 만든다.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const C = require('../src/renderer/sprite-cat.js');

const SIZE = 256;

function headGrid() {
  const g = C.drawCat({ headOnly: true });
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  g.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '.') return;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }));
  const n = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  return { g, n, ox: x0 - Math.floor((n - (x1 - x0 + 1)) / 2), oy: y0 - Math.floor((n - (y1 - y0 + 1)) / 2) };
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

function catPng(size) {
  const { g, n, ox, oy } = headGrid();
  const pal = C.makePalette('gray', null);
  // 줄마다 앞에 필터 0(없음) 1바이트, 뒤로 RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ch = (g[oy + Math.floor(y * n / size)] || [])[ox + Math.floor(x * n / size)];
    if (!ch || ch === '.') continue;
    const [r, gg, b] = C.hex(pal[ch]);
    const o = y * (size * 4 + 1) + 1 + x * 4;
    raw[o] = r; raw[o + 1] = gg; raw[o + 2] = b; raw[o + 3] = 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8비트 RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, catPng(SIZE));
console.log('만듦:', out);

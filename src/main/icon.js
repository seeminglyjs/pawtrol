// 앱 아이콘: 고양이 머리 도트를 정사각형으로 잘라 원하는 크기로 키운다(그림 파일 없이, 지금 고른 색으로).
const { nativeImage } = require('electron');
const C = require('../renderer/sprite-cat.js');

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

function catIcon(settings, size) {
  const { g, n, ox, oy } = headGrid();
  const pal = C.makePalette(settings.preset, settings.colors);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ch = (g[oy + Math.floor(y * n / size)] || [])[ox + Math.floor(x * n / size)];
    if (!ch || ch === '.') continue;
    const [r, gg, b] = C.hex(pal[ch]);
    const o = (y * size + x) * 4;
    buf[o] = b; buf[o + 1] = gg; buf[o + 2] = r; buf[o + 3] = 255; // createFromBitmap 은 BGRA 순서
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// 알림 영역은 화면 배율에 따라 16px · 32px 를 골라 쓰도록 두 장을 넣는다
function trayIcon(settings) {
  const img = catIcon(settings, 16);
  img.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: catIcon(settings, 32).toPNG() });
  return img;
}

module.exports = { catIcon, trayIcon };

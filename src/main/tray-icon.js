// 알림 영역 아이콘: 16×16 발바닥 도트를 그려 만든다(그림 파일 없이).
const { nativeImage } = require('electron');

const PAW = [
  '................',
  '....##....##....',
  '...#pp#..#pp#...',
  '...#pp#..#pp#...',
  '.##.##....##.##.',
  '#pp#........#pp#',
  '#pp#..####..#pp#',
  '.##..#pppp#..##.',
  '....#pppppp#....',
  '...#pppppppp#...',
  '...#pppppppp#...',
  '...#pppppppp#...',
  '....#pp##pp#....',
  '.....##..##.....',
  '................',
  '................',
];

function createTrayIcon() {
  const buf = Buffer.alloc(16 * 16 * 4);
  const col = { '#': [0x5a, 0x34, 0x20, 255], p: [0xf8, 0xb4, 0xaa, 255], '.': [0, 0, 0, 0] };
  PAW.forEach((row, y) => [...row].forEach((ch, x) => {
    const [r, g, b, a] = col[ch];
    const o = (y * 16 + x) * 4;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; buf[o + 3] = a; // createFromBitmap 은 BGRA 순서
  }));
  return nativeImage.createFromBitmap(buf, { width: 16, height: 16 });
}

module.exports = { createTrayIcon };

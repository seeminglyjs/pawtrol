// 아기 비율 고양이 도트. 칸을 직접 찍고, 외곽선만 실루엣 바깥에 자동으로 두른다.
// 칸 기호(f·l·s·d·w …)마다 색표(palette)에서 색을 찾으므로 색표만 바꾸면 전체 색이 바뀐다.
//
// pose 값
//   lift(0|1) 걷기 중 몸 들림 · chest(0|1) 숨 내쉼 · head(0|1) 머리 내려옴 · puff(0|1) 볼 부풂
//   tail(-2..2) 꼬리 흔들림 · blink(0 뜸 · 1 반쯤 · 2 감음) · legs([4]) 다리별 들림 · ear(0|1) 귀 까딱
//   laptop(0 없음 · 1 · 2 두드리는 두 장) · sweat(bool) · loaf(bool) 식빵 자세 · dangle(bool) 매달림 · sticker(bool)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PawCat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var W = 40, H = 36, OX = 2, OY = 3;

  function drawCat(pose) {
    pose = pose || {};
    var g = [], y, x;
    for (y = 0; y < H; y++) { g.push([]); for (x = 0; x < W; x++) g[y].push('.'); }
    var put = function (x, y, ch) { x += OX; y += OY; if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = ch; };
    var span = function (y, a, b, ch) { for (var x = a; x <= b; x++) put(x, y, ch); };
    var paint = function (y, a, b, ch) { for (var x = a; x <= b; x++) { var yy = y + OY, xx = x + OX; if (g[yy] && g[yy][xx] && g[yy][xx] !== '.') put(x, y, ch); } };
    var rows = function (list, dy, ch) { list.forEach(function (s) { span(s[0] + dy, s[1], s[2], ch); }); };

    var loaf = !!pose.loaf, dangle = !!pose.dangle, headOnly = !!pose.headOnly;
    var bY = loaf ? 3 : -(pose.lift || 0);
    var ta = pose.tail || 0;

    // 아이콘용(headOnly)은 머리만 그린다
    if (!headOnly) {
    // 꼬리
    if (loaf) {
      // 바닥을 따라 앞으로 감은 꼬리
      span(26, 27, 34, 'f'); span(25, 33, 35, 'f'); span(24, 34, 35, 'f');
      paint(26, 29, 29, 'd'); paint(26, 32, 32, 'd'); paint(24, 34, 35, 'l');
    } else if (dangle) {
      // 축 늘어진 꼬리
      for (y = 19; y <= 30; y++) { var o2 = Math.round(ta * ((y - 19) / 11)); span(y, 29 + o2, 30 + o2, 'f'); if (y === 23 || y === 27) paint(y, 29 + o2, 30 + o2, 'd'); }
    } else {
      // 뿌리는 고정, 끝으로 갈수록 크게 흔들린다
      for (y = 7; y <= 19; y++) {
        var k = (19 - y) / 12, off = Math.round(ta * k * k);
        var w = y <= 8 ? [31, 32] : y >= 17 ? [29, 31] : [30, 32];
        span(y + bY, w[0] + off, w[1] + off, 'f');
        if (y === 10 || y === 13 || y === 16) paint(y + bY, w[0] + off, w[1] + off, 'd');
        if (y <= 8) paint(y + bY, w[0] + off, w[0] + off + 1, 'l');
      }
    }

    // 몸통(둥글고 짧게). 숨 내쉴 때 등이 1칸 내려온다
    var ch0 = pose.chest || 0;
    rows([[16 + ch0, 17, 27], [17 + ch0, 15, 28]], bY, 'f');
    for (y = 18; y <= 23; y++) span(y + bY, 13, 29, 'f');
    span(24 + bY, 14, 28, 'f');

    // 다리: 짧고 뭉툭하게. 먼 쪽 다리는 한 단 어둡게. 식빵 자세에서는 몸 밑에 숨긴다
    if (!loaf) {
      var legs = [[12, 15, 'f'], [17, 19, 's'], [22, 24, 's'], [25, 28, 'f']], up = pose.legs || [0, 0, 0, 0];
      legs.forEach(function (L, i) {
        var top = 23 + bY, bot = dangle ? 29 : 27 - up[i];
        for (var yy = top; yy < bot; yy++) span(yy, L[0], L[1], L[2]);
        span(bot, L[0] + 1, L[1] - (L[1] - L[0] > 2 ? 1 : 0), L[2]);
      });
      var sockTop = dangle ? 27 : 25, sockBot = dangle ? 29 : 27;
      for (y = sockTop; y <= sockBot; y++) paint(y, 12, 15, 'w');
    }
    // 몸 음영 · 밝은 면 · 줄무늬
    paint(16 + ch0 + bY, 19, 25, 'l'); paint(17 + ch0 + bY, 18, 26, 'l');
    for (y = 22; y <= 24; y++) paint(y + bY, 14, 29, 's');
    for (y = 18; y <= 21; y++) paint(y + bY, 29, 29, 's');
    [[20, 21], [24, 25]].forEach(function (p) { for (var yy = 17 + ch0; yy <= 20; yy++) paint(yy + bY, p[0], p[1], 'd'); });
    if (!loaf) paint(25, 26, 27, 'd');
    }

    // 머리: 둥근 찹쌀떡 모양, 볼에 털 뭉치
    var hY = bY + (pose.head || 0) + (loaf ? 1 : 0), pf = pose.puff || 0;
    var head = [[3, 8, 17], [4, 6, 19], [5, 5, 20], [6, 4, 21]];
    for (y = 7; y <= 13; y++) head.push([y, 3, 22]);
    head.push([14, 3 - pf, 22 + pf], [15, 2 - pf, 23 + pf], [16, 3 - pf, 22 + pf], [17, 4, 21], [18, 6, 19]);
    rows(head, hY, 'f');
    var e = pose.ear || 0;
    rows([[0 + e, 5, 6], [1 + e, 4, 7], [2, 4, 8], [3, 4, 9]], hY, 'f');
    rows([[0, 19, 20], [1, 18, 21], [2, 17, 21], [3, 16, 21]], hY, 'f');
    rows([[1 + e, 5, 6], [2, 5, 7], [3, 5, 7]], hY, 'p');
    rows([[1, 19, 20], [2, 18, 20], [3, 18, 20]], hY, 'p');
    rows([[4, 7, 10], [5, 6, 9], [6, 5, 7]], hY, 'l');
    for (y = 11; y <= 16; y++) { var sx = 22 + (y >= 14 && y <= 16 ? pf : 0); span(y + hY, sx, sx, 's'); }
    rows([[17, 18, 21], [18, 17, 19]], hY, 's');
    rows([[4, 10, 10], [5, 10, 10], [4, 12, 13], [5, 12, 13], [6, 12, 13], [4, 15, 15], [5, 15, 15]], hY, 'd');
    rows([[8, 3, 4], [9, 3, 3], [8, 21, 22], [9, 22, 22]], hY, 'd');
    rows([[13, 10, 15], [14, 9, 16], [15, 8, 17], [16, 8, 17], [17, 9, 16]], hY, 'w');
    rows([[18, 9, 16]], hY, 'c');
    // 가슴 털 뭉치(턱 아래로 삐죽)
    if (!headOnly) {
      rows([[19, 11, 16], [20, 12, 16], [21, 13, 15]], bY, 'w');
      put(11, 20 + bY, 'w'); put(16, 21 + bY, 'c'); rows([[19, 11, 16]], bY, 'c'); rows([[19, 12, 15]], bY, 'w');
    }

    // 눈: 크고 까만 눈 + 반짝임. 반쯤 감으면 윗눈꺼풀 선, 감으면 ◡
    var bl = pose.blink || 0;
    [6, 16].forEach(function (cx) {
      if (bl === 2) { put(cx, 11 + hY, 'o'); put(cx + 3, 11 + hY, 'o'); span(12 + hY, cx + 1, cx + 2, 'o'); return; }
      if (bl === 1) span(11 + hY, cx, cx + 3, 'o');
      else { span(9 + hY, cx + 1, cx + 2, 'e'); span(10 + hY, cx, cx + 3, 'e'); span(11 + hY, cx, cx + 3, 'e'); }
      span(12 + hY, cx, cx + 3, 'e'); span(13 + hY, cx + 1, cx + 2, 'g');
      if (bl === 0) { put(cx + 1, 10 + hY, 'h'); put(cx + 2, 10 + hY, 'h'); put(cx + 1, 11 + hY, 'h'); put(cx + 3, 12 + hY, 'h'); }
      else put(cx + 1, 12 + hY, 'h');
    });
    span(13 + hY, 12, 13, 'n');
    if (dangle) { span(14 + hY, 12, 13, 'o'); span(15 + hY, 12, 13, 'o'); }
    else [[10, 14], [11, 15], [12, 14], [13, 14], [14, 15], [15, 14]].forEach(function (q) { put(q[0], q[1] + hY, 'o'); });
    rows([[13, 4, 5], [14, 4, 5], [13, 20, 21], [14, 20, 21]], hY, 'p');

    // 노트북: 뚜껑 뒷면이 보이고, 앞발이 뚜껑 위로 올라와 번갈아 두드린다
    if (pose.laptop) {
      var lt = 18;
      for (y = lt; y <= 26; y++) span(y, 3, 19, 'm');
      span(lt, 3, 19, 'k'); span(26, 3, 19, 'k');
      for (y = lt; y <= 26; y++) { put(3, y, 'k'); put(19, y, 'k'); }
      span(lt + 1, 4, 10, 'M');
      // 뚜껑 가운데 발자국 무늬
      put(10, 22, 'M'); put(12, 22, 'M'); put(11, 21, 'M'); put(10, 23, 'M'); put(11, 23, 'M'); put(12, 23, 'M');
      span(27, 1, 21, 'k');
      // 앞발은 흰 주둥이와 겹치므로 자기 테두리를 직접 그린다. 한쪽이 올라가면 다른 쪽은 내려간다
      var a = pose.laptop === 1 ? 0 : 1;
      var paw = function (x0, top) {
        span(top, x0 + 1, x0 + 3, 'o');
        put(x0, top + 1, 'o'); span(top + 1, x0 + 1, x0 + 3, 'w'); put(x0 + 4, top + 1, 'o');
        put(x0, top + 2, 'o'); span(top + 2, x0 + 1, x0 + 3, 'c'); put(x0 + 4, top + 2, 'o');
      };
      paw(4, lt - 3 + a);
      paw(12, lt - 2 - a);
    }
    // 땀방울
    if (pose.sweat) { put(24, 2 + hY, 'Q'); span(3 + hY, 24, 25, 'q'); span(4 + hY, 24, 25, 'q'); }

    // 바깥 외곽선
    var solid = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '.' && g[y][x] !== 'O'; };
    for (y = 0; y < H; y++) for (x = 0; x < W; x++)
      if (g[y][x] === '.' && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g[y][x] = 'O';
    // 수염(얼굴 밖으로)
    rows([[13, 0, 2], [15, 0, 2], [13, 23, 25], [15, 24, 26]], hY, 'o');
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (g[y][x] === 'O') g[y][x] = 'o';
    if (pose.sticker) {
      var any = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '.' && g[y][x] !== 'B'; };
      for (y = 0; y < H; y++) for (x = 0; x < W; x++)
        if (g[y][x] === '.' && (any(x - 1, y) || any(x + 1, y) || any(x, y - 1) || any(x, y + 1))) g[y][x] = 'B';
    }
    return g;
  }

  var COMMON = { h: '#ffffff', p: '#f8b4aa', n: '#ee8f93', B: '#ffffff', k: '#4a4d57', m: '#b9bec9', M: '#d9dde4', q: '#7cc0ef', Q: '#d6eefc' };
  var PRESETS = {
    gray: { f: '#c4c0bc', l: '#d8d5d1', s: '#aaa5a1', d: '#7a7069', w: '#fffaf2', c: '#f3e2d4', g: '#6b8f5a', e: '#3a2418', o: '#5a3420' },
    cheese: { f: '#f5c27a', l: '#fad79f', s: '#e6a95e', d: '#d98b44', w: '#fffaf2', c: '#f3e2d4', g: '#a0682e', e: '#3a2418', o: '#5a3420' },
    black: { f: '#45404b', l: '#5c5762', s: '#34303a', d: '#34303a', w: '#faf5ed', c: '#e7dace', g: '#c9a640', e: '#1d161b', o: '#1d161b' },
  };

  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function toHex(a) { return '#' + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return toHex(A.map(function (v, i) { return v + (B[i] - v) * t; })); }

  // 프리셋 위에 사용자가 고른 털(f) · 무늬(d) · 눈동자(g) 색을 얹는다. 밝은 면·그늘은 털 색에서 만든다.
  function makePalette(preset, colors) {
    var p = Object.assign({}, COMMON, PRESETS[preset] || PRESETS.gray);
    if (colors && colors.f) { p.f = colors.f; p.l = mix(colors.f, '#ffffff', 0.3); p.s = mix(colors.f, '#3a2a40', 0.14); }
    if (colors && colors.d) p.d = colors.d;
    if (colors && colors.g) p.g = colors.g;
    return p;
  }

  return { drawCat: drawCat, makePalette: makePalette, PRESETS: PRESETS, hex: hex, W: W, H: H };
});

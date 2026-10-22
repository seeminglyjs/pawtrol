// 펫 화면: 고양이의 행동(걷기 · 쉬기 · 잠 · 노트북 · 매달림 · 폴짝)과 말풍선, 마우스 상호작용.
/* global PawCat, PawQueue, paw */
(function () {
  var C = PawCat, W = C.W, H = C.H;
  // 스프라이트에서 발바닥 외곽선이 놓이는 줄(OY 3 + 다리 끝 27 + 외곽선 1). 이 줄이 바닥에 닿는다
  var FOOT_ROW = 31;

  var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  var catEl = document.getElementById('cat'), bubble = document.getElementById('bubble');
  var msgEl = document.getElementById('msg'), posEl = document.getElementById('pos');
  var nextBtn = document.getElementById('next'), closeBtn = document.getElementById('close');
  cv.width = W; cv.height = H;

  var settings = null, palette = null, colorCache = {};
  var queue = PawQueue.createQueue();
  var S = {
    x: 200, y: 0, dir: -1, mode: 'idle', modeUntil: 0,
    blink: 0, ear: 0, workingCount: 0, sys: { cpuHigh: false, ramHigh: false },
    lastActivity: Date.now(), hopAt: 0, petUntil: 0,
    drag: null, fallV: 0, landAt: 0, grid: null, ignoring: true,
  };

  function scale() { return settings ? settings.scale : 3; }
  function floorY() { return window.innerHeight - (FOOT_ROW + 1) * scale(); }

  // ── 그리기 ──────────────────────────────────────────────
  var lastKey = '';
  function render(pose) {
    var key = JSON.stringify(pose);
    if (key === lastKey) return;
    lastKey = key;
    var g = C.drawCat(pose);
    S.grid = g;
    var id = ctx.createImageData(W, H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var ch = g[y][x];
      if (ch === '.') continue;
      var c = colorCache[ch] || (colorCache[ch] = C.hex(palette[ch]));
      var o = (y * W + x) * 4;
      id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
  }

  function applySettings(s) {
    settings = s;
    palette = C.makePalette(s.preset, s.colors);
    colorCache = {}; lastKey = '';
    cv.style.width = W * s.scale + 'px';
    cv.style.height = H * s.scale + 'px';
    if (!S.drag) S.y = floorY();
  }

  // ── 행동 정하기 ─────────────────────────────────────────
  function rand(a, b) { return a + Math.random() * (b - a); }
  function decide(now) {
    var r = Math.random();
    // 걷기·서 있기·식빵 비율과 지속 시간은 화면에서 보며 정한 값(가정, 조정 가능)
    if (r < 0.4) { S.mode = 'walk'; S.dir = Math.random() < 0.5 ? -1 : 1; S.modeUntil = now + rand(2500, 6000); }
    else if (r < 0.8) { S.mode = 'idle'; S.modeUntil = now + rand(3000, 8000); }
    else { S.mode = 'loaf'; S.modeUntil = now + rand(6000, 15000); }
  }
  function wantsWork() {
    return (S.workingCount > 0 && settings.notify.working) || S.sys.cpuHigh;
  }
  function sleepy(now) {
    return !queue.size() && now - S.lastActivity > settings.sleepMinutes * 60 * 1000;
  }
  function touch() { S.lastActivity = Date.now(); }

  // ── 매 프레임 ──────────────────────────────────────────
  var last = performance.now(), walkT = 0, typeT = 0, zzzAt = 0;
  function frame(now) {
    var dt = Math.min(50, now - last); last = now;
    if (!settings) { requestAnimationFrame(frame); return; }
    var wall = Date.now(), sc = scale();
    var br = Math.sin(now / 3000 * 2 * Math.PI);
    var pose = { tail: Math.round(2 * Math.sin(now / 2400 * 2 * Math.PI)), blink: S.blink, ear: S.ear, sticker: settings.sticker };
    var tired = S.sys.ramHigh;
    var maxX = window.innerWidth - W * sc;

    if (S.drag) {
      pose.dangle = true;
      pose.tail = Math.round(Math.max(-2, Math.min(2, S.drag.vx / 3)));
    } else if (S.y < floorY() - 0.5) {
      // 떨어지는 중: 중력 가속. 2400px/s² 는 화면에서 가볍게 떨어져 보이는 값(가정)
      S.fallV += 2400 * dt / 1000;
      S.y = Math.min(floorY(), S.y + S.fallV * dt / 1000);
      pose.dangle = true;
      if (S.y >= floorY()) { S.fallV = 0; S.landAt = now; }
    } else if (wantsWork()) {
      S.mode = 'work';
      typeT += dt;
      var fast = S.sys.cpuHigh;
      // 두드리는 간격: 보통 180ms, CPU 과부하면 90ms(가정, 화면 확인)
      pose.laptop = Math.floor(typeT / (fast ? 90 : 180)) % 2 + 1;
      pose.head = 1; pose.sweat = fast;
      if (tired) pose.blink = Math.max(1, pose.blink);
    } else if (sleepy(wall)) {
      S.mode = 'sleep';
      pose.loaf = true; pose.blink = 2; pose.chest = br < 0 ? 1 : 0; pose.tail = 0;
      if (now - zzzAt > 1600) { zzzAt = now; spawn('zzz', 'z', S.x + (S.dir < 0 ? 20 : W - 14) * sc, S.y + 4 * sc); }
    } else {
      if (S.mode === 'work' || S.mode === 'sleep' || wall > S.modeUntil) decide(wall);
      if (S.mode === 'walk') {
        walkT += dt;
        var f = Math.floor(walkT / (tired ? 180 : 120)) % 4;
        pose.legs = [[1, 0, 0, 1], [0, 0, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]][f];
        pose.lift = (f === 0 || f === 2) ? 1 : 0;
        pose.head = (f === 1 || f === 3) ? 1 : 0;
        pose.tail = Math.round(1.5 * Math.sin(now / 700 * 2 * Math.PI));
        // 걷는 속도: 도트 1칸 크기의 7배/초(3배 크기면 21px/s). 피곤하면 60%
        S.x += S.dir * dt / 1000 * 7 * sc * (tired ? 0.6 : 1);
        if (S.x < 0 || S.x > maxX) { S.x = Math.max(0, Math.min(maxX, S.x)); S.dir *= -1; }
      } else if (S.mode === 'loaf') {
        pose.loaf = true; pose.chest = br < -0.1 ? 1 : 0;
        if (tired) pose.blink = Math.max(1, pose.blink);
      } else {
        pose.chest = br < -0.1 ? 1 : 0; pose.head = br < -0.45 ? 1 : 0; pose.puff = br < -0.8 ? 1 : 0;
      }
      if (tired) { pose.blink = Math.max(1, pose.blink); pose.head = 1; }
    }
    if (wall < S.petUntil) { pose.blink = 2; pose.puff = 1; }
    render(pose);

    // 위치와 눌림(폴짝 · 착지 · 쓰다듬기)
    var hopY = 0, sx = 1, sy = 1;
    if (S.hopAt) {
      var p = (now - S.hopAt) / 520;
      if (p >= 1) S.hopAt = 0;
      else if (p < 0.18) { var q = p / 0.18; sx = 1 + 0.08 * q; sy = 1 - 0.08 * q; }
      else if (p < 0.7) { var q2 = (p - 0.18) / 0.52; hopY = -Math.sin(q2 * Math.PI) * 15 * sc; sx = 0.95; sy = 1.06; }
      else { var a = Math.sin((p - 0.7) / 0.3 * Math.PI); sx = 1 + 0.1 * a; sy = 1 - 0.1 * a; }
    } else if (S.landAt && now - S.landAt < 260) {
      var a2 = Math.sin((now - S.landAt) / 260 * Math.PI); sx = 1 + 0.14 * a2; sy = 1 - 0.14 * a2;
    } else if (wall < S.petUntil) {
      var a3 = 0.5 + 0.5 * Math.sin(now / 120); sx = 1 + 0.03 * a3; sy = 1 - 0.03 * a3;
    }
    S.x = Math.max(0, Math.min(maxX, S.x));
    catEl.style.left = S.x + 'px';
    catEl.style.top = S.y + 'px';
    catEl.style.transform = 'translateY(' + hopY + 'px) scale(' + sx + ',' + sy + ')';
    cv.style.transform = S.dir > 0 ? 'scaleX(-1)' : 'none';
    placeBubble();
    requestAnimationFrame(frame);
  }

  // ── 눈 깜빡임 · 귀 까딱(무작위 간격) ───────────────────
  function blinkLoop() {
    setTimeout(function () {
      var seq = [1, 2, 1, 0], d = [70, 110, 70], i = 0;
      (function step() { S.blink = seq[i]; if (i < 3) setTimeout(step, d[i++]); else blinkLoop(); })();
    }, rand(2600, 5200));
  }
  function earLoop() {
    setTimeout(function () {
      S.ear = 1;
      setTimeout(function () { S.ear = 0; setTimeout(function () { S.ear = 1; setTimeout(function () { S.ear = 0; earLoop(); }, 90); }, 90); }, 110);
    }, rand(4000, 8000));
  }

  // ── 말풍선 ─────────────────────────────────────────────
  function showBubble() {
    var cur = queue.current();
    if (!cur) { bubble.hidden = true; return; }
    bubble.hidden = false;
    msgEl.textContent = cur.text;
    var pos = queue.position();
    posEl.textContent = pos.total > 1 ? '더 있어요 ' + pos.index + ' / ' + pos.total : '';
    nextBtn.hidden = pos.total < 2;
  }
  function placeBubble() {
    if (bubble.hidden) return;
    var sc = scale(), bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    var catCenter = S.x + W * sc / 2;
    var left = Math.max(4, Math.min(window.innerWidth - bw - 4, catCenter - bw / 2));
    var top = S.y + 2 * sc - bh - 12;
    if (top < 4) top = S.y + (FOOT_ROW + 2) * sc;
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
    bubble.style.setProperty('--tail-x', Math.max(14, Math.min(bw - 14, catCenter - left)) + 'px');
  }
  nextBtn.addEventListener('click', function () { queue.next(); showBubble(); touch(); });
  closeBtn.addEventListener('click', function () { queue.dismissCurrent(); showBubble(); touch(); });

  // ── 마우스: 고양이 · 말풍선 위에서만 잡고 나머지는 뒤 창으로 통과 ──
  function onCat(e) {
    var r = cv.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom || !S.grid) return false;
    var gx = Math.floor((e.clientX - r.left) / r.width * W), gy = Math.floor((e.clientY - r.top) / r.height * H);
    if (S.dir > 0) gx = W - 1 - gx;
    return S.grid[gy] && S.grid[gy][gx] !== '.';
  }
  function onBubble(e) {
    if (bubble.hidden) return false;
    var r = bubble.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
  }
  function setIgnore(v) { if (S.ignoring !== v) { S.ignoring = v; paw.setIgnore(v); } }

  var down = null, rub = { lastX: null, dir: 0, n: 0 };
  window.addEventListener('mousemove', function (e) {
    if (down && !S.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
      // 끌기 시작: 잡은 자리를 기억해 고양이가 손끝에 매달려 따라온다
      S.drag = { ox: e.clientX - S.x, oy: e.clientY - S.y, vx: 0, lx: e.clientX };
      S.hopAt = 0;
    }
    if (S.drag) {
      S.drag.vx = e.clientX - S.drag.lx; S.drag.lx = e.clientX;
      S.x = e.clientX - S.drag.ox;
      S.y = Math.min(floorY(), e.clientY - S.drag.oy);
      touch();
      return;
    }
    var hit = onCat(e), hitB = onBubble(e);
    setIgnore(!(hit || hitB));
    // 머리 위(스프라이트 위쪽 절반)에서 좌우로 세 번 문지르면 쓰다듬기
    var r = cv.getBoundingClientRect();
    if (hit && (e.clientY - r.top) / r.height * H < 20) {
      if (rub.lastX !== null) {
        var d = Math.sign(e.clientX - rub.lastX);
        if (d && d !== rub.dir) {
          rub.dir = d; rub.n++;
          if (rub.n >= 3) { rub.n = 0; S.petUntil = Date.now() + 1300; spawn('heart', '♥', e.clientX - 8, e.clientY - 26); touch(); }
        }
      }
      rub.lastX = e.clientX;
    } else { rub.lastX = null; rub.n = 0; }
  });
  window.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !onCat(e)) return;
    down = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', function () {
    if (S.drag) { S.drag = null; S.fallV = 0; }
    else if (down) { if (!S.hopAt) S.hopAt = performance.now(); touch(); }
    down = null;
  });

  function spawn(cls, text, x, y) {
    var el = document.createElement('div');
    el.className = cls; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, cls === 'zzz' ? 2400 : 900);
  }

  // ── 메인 프로세스에서 오는 신호 ─────────────────────────
  paw.onSettings(applySettings);
  paw.onNotify(function (n) {
    queue.add(n);
    showBubble();
    touch();
    if (!S.drag) S.hopAt = performance.now();
  });
  paw.onNotifyRemove(function (n) { queue.remove(n.key); showBubble(); });
  paw.onWorking(function (w) { S.workingCount = w.count; if (w.count) touch(); });
  paw.onSys(function (st) { S.sys = st; });
  window.addEventListener('resize', function () { if (!S.drag) S.y = floorY(); });

  blinkLoop(); earLoop();
  S.x = Math.max(0, window.innerWidth - 360);
  paw.ready();
  requestAnimationFrame(frame);
})();

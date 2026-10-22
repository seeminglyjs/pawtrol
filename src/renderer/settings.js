// 설정 창: 바꾸는 즉시 저장하고 펫에 반영한다.
/* global PawCat, paw */
(function () {
  var C = PawCat, $ = function (id) { return document.getElementById(id); };
  var s = null;
  var pv = $('preview'), pctx = pv.getContext('2d');
  pv.width = C.W; pv.height = C.H;

  function drawPreview() {
    var pal = C.makePalette(s.preset, s.colors), g = C.drawCat({ sticker: s.sticker });
    var id = pctx.createImageData(C.W, C.H);
    for (var y = 0; y < C.H; y++) for (var x = 0; x < C.W; x++) {
      var ch = g[y][x]; if (ch === '.') continue;
      var c = C.hex(pal[ch]), o = (y * C.W + x) * 4;
      id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255;
    }
    pctx.putImageData(id, 0, 0);
  }

  function fill() {
    var pal = C.makePalette(s.preset, s.colors);
    $('cf').value = pal.f; $('cd').value = pal.d; $('cg').value = pal.g;
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.classList.toggle('on', b.dataset.preset === s.preset && !s.colors); });
    document.querySelectorAll('[data-scale]').forEach(function (b) { b.classList.toggle('on', +b.dataset.scale === s.scale); });
    $('sticker').checked = s.sticker;
    $('nDone').checked = s.notify.done; $('nWaiting').checked = s.notify.waiting;
    $('nWorking').checked = s.notify.working; $('nSystem').checked = s.notify.system;
    $('cpuT').value = s.cpuThreshold; $('cpuS').value = s.cpuSeconds; $('ramT').value = s.ramThreshold;
    $('sleepM').value = s.sleepMinutes; $('port').value = s.port; $('login').checked = s.openAtLogin;
    drawPreview();
  }

  function save(patch) { return paw.setSettings(patch).then(function (n) { s = n; fill(); }); }
  function num(id, min, max) {
    var v = Math.round(+$(id).value);
    return isFinite(v) ? Math.max(min, Math.min(max, v)) : null;
  }
  function refreshHook() {
    paw.hookStatus().then(function (st) {
      $('hookState').textContent = { installed: '설치됨', missing: '설치 안 됨', partial: '일부만 설치됨', 'other-port': '다른 포트로 설치됨', unreadable: '설정 파일을 읽지 못함' }[st] || st;
    });
  }

  document.querySelectorAll('[data-preset]').forEach(function (b) { b.onclick = function () { save({ preset: b.dataset.preset, colors: null }); }; });
  document.querySelectorAll('[data-scale]').forEach(function (b) { b.onclick = function () { save({ scale: +b.dataset.scale }); }; });
  ['cf', 'cd', 'cg'].forEach(function (id) {
    $(id).addEventListener('input', function () { save({ colors: { f: $('cf').value, d: $('cd').value, g: $('cg').value } }); });
  });
  $('sticker').onchange = function () { save({ sticker: $('sticker').checked }); };
  [['nDone', 'done'], ['nWaiting', 'waiting'], ['nWorking', 'working'], ['nSystem', 'system']].forEach(function (p) {
    $(p[0]).onchange = function () { var n = {}; n[p[1]] = $(p[0]).checked; save({ notify: n }); };
  });
  [['cpuT', 'cpuThreshold', 50, 100], ['cpuS', 'cpuSeconds', 1, 120], ['ramT', 'ramThreshold', 50, 100], ['sleepM', 'sleepMinutes', 1, 120], ['port', 'port', 1024, 65535]]
    .forEach(function (p) {
      $(p[0]).onchange = function () { var v = num(p[0], p[2], p[3]); if (v === null) { fill(); return; } var n = {}; n[p[1]] = v; save(n).then(refreshHook); };
    });
  $('login').onchange = function () { save({ openAtLogin: $('login').checked }); };
  $('hookInstall').onclick = function () { paw.installHooks().then(refreshHook); };
  $('hookRemove').onclick = function () { paw.removeHooks().then(refreshHook); };
  paw.onSettings(function (n) { s = n; fill(); });

  paw.getSettings().then(function (n) { s = n; fill(); refreshHook(); });
})();

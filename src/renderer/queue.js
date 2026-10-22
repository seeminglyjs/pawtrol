// 말풍선 알림 대기열. 새 알림이 와도 지금 보는 알림을 덮지 않고 뒤에 쌓는다.
// key 가 같은 알림(같은 세션 · 같은 경보)은 한 칸으로 합치고 문구만 새것으로 바꾼다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PawQueue = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createQueue() {
    var items = [];
    var idx = 0;
    return {
      // opts.front: 맨 앞에 넣고 그 칸을 보여 준다(자리 비움 요약처럼 먼저 읽어야 하는 알림)
      add: function (item, opts) {
        var i = items.findIndex(function (x) { return x.key === item.key; });
        if (opts && opts.front) {
          if (i >= 0) items.splice(i, 1);
          items.unshift(item);
          idx = 0;
          return;
        }
        if (i >= 0) {
          // 응답 끝 알림이 아직 남아 있으면, 그 뒤에 오는 "입력을 기다림" 알림은 같은 말이라 덮지 않는다
          if (items[i].kind === 'done' && item.kind === 'idle') return;
          items[i] = item;
        } else {
          items.push(item);
        }
      },
      remove: function (key) {
        var i = items.findIndex(function (x) { return x.key === key; });
        if (i < 0) return;
        items.splice(i, 1);
        if (idx > i || idx >= items.length) idx = Math.max(0, idx - 1);
      },
      next: function () { if (items.length) idx = (idx + 1) % items.length; },
      dismissCurrent: function () {
        if (!items.length) return;
        items.splice(idx, 1);
        if (idx >= items.length) idx = 0;
      },
      clear: function () { items = []; idx = 0; },
      current: function () { return items.length ? items[idx] : null; },
      size: function () { return items.length; },
      position: function () { return { index: items.length ? idx + 1 : 0, total: items.length }; },
    };
  }
  return { createQueue: createQueue };
});

// 휴식 알림 판정: 마우스·키보드를 쉬지 않고 쓴 시간을 센다.
// 손을 뗀 시간(idleSec)이 breakMinutes 를 넘으면 쉰 것으로 보고 처음부터 다시 센다.
function createRestTracker(opts) {
  let o = { ...opts };
  let since = null; // 이어서 쓰기 시작한 시각
  return {
    setOptions(next) { o = { ...o, ...next }; },
    // 알릴 때가 되면 true. 알린 뒤에는 그 시각부터 다시 센다
    update({ idleSec, at }) {
      if (idleSec * 1000 >= o.breakMinutes * 60 * 1000) { since = null; return false; }
      if (since === null) { since = at - idleSec * 1000; return false; }
      if (at - since >= o.restMinutes * 60 * 1000) { since = at; return true; }
      return false;
    },
  };
}

module.exports = { createRestTracker };

// 새 버전 확인: GitHub Releases 에 올린 설치 파일을 electron-updater 가 뒤에서 받아 두고, 다 받으면 onReady 로 알린다.
// 설치는 사용자가 말풍선을 누를 때(install) 하거나, 그냥 두면 다음에 앱을 끌 때 저절로 된다.
// updater 를 밖에서 넣을 수 있게 둔 것은 검사에서 가짜로 바꾸기 위해서다.

// 켜자마자 확인하면 첫 화면 그리기와 겹치므로 조금 기다린다. 확인 간격은 가정(릴리스가 드물어 하루 몇 번이면 충분).
const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function createUpdater({ updater, enabled, onReady, log = () => {} }) {
  let on = !!enabled;
  let announced = null; // 이번 실행에서 이미 알린 버전. 다시 확인해도 같은 버전은 또 알리지 않는다
  let ready = null;
  let firstTimer = null, everyTimer = null;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', info => {
    ready = info.version;
    if (announced === info.version) return;
    announced = info.version;
    onReady(info.version);
  });
  // 인터넷이 없거나 릴리스가 아직 없을 때도 조용히 넘어간다
  updater.on('error', e => log('[update] 실패', e && e.message));

  async function check() {
    try {
      const r = await updater.checkForUpdates();
      // 개발 실행(설치 안 함)이면 r 이 null 이다
      return { ok: true, available: !!(r && r.isUpdateAvailable), version: r && r.updateInfo ? r.updateInfo.version : null };
    } catch (e) {
      // 같은 실패가 'error' 신호로도 오므로 여기서는 기록하지 않는다
      return { ok: false, error: e && e.message };
    }
  }

  function schedule() {
    clearTimeout(firstTimer); clearInterval(everyTimer);
    firstTimer = everyTimer = null;
    if (!on) return;
    firstTimer = setTimeout(check, FIRST_CHECK_MS);
    everyTimer = setInterval(check, CHECK_EVERY_MS);
  }
  schedule();

  return {
    check,
    setEnabled(v) { if (on === !!v) return; on = !!v; schedule(); },
    readyVersion: () => ready,
    // 앱을 끄고 받아 둔 설치 파일을 조용히 돌린 뒤 다시 켠다
    install() { if (ready) updater.quitAndInstall(true, true); },
    stop() { on = false; schedule(); },
  };
}

module.exports = { createUpdater, FIRST_CHECK_MS, CHECK_EVERY_MS };

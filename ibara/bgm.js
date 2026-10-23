/* Scene-aware Gemini recordings; the original ambient music remains selectable. */
(function () {
'use strict';
var A = window.IBARA.SFX;
var originalMusic = A.music, originalUnlock = A.unlock, originalSetMusic = A.setMusic;
var tracks = {
  map: { title: '灰の塔、灯る道', file: 'ibara-map' },
  combat: { title: '塔を穿つ一手', file: 'ibara-combat' },
  boss: { title: '塔の主、最後の賭け', file: 'ibara-boss' }
};
var scene = null, mode = 'gemini', volume = 0.25, enabled = true, unlocked = false;
var audio = null, current = null, revision = 0, failed = false, pending = false, leaving = false;
function trackForScene() { return scene ? tracks[scene] || tracks.map : null; }
function notify() { document.dispatchEvent(new CustomEvent('ibara-bgm-change')); }
function stopRecording() { revision++; if (audio) audio.pause(); }
function useOriginal() {
  return mode === 'original' || failed;
}
function sync() {
  var track = trackForScene();
  if (useOriginal()) {
    stopRecording();
    originalSetMusic(enabled && !document.hidden && !leaving);
    originalMusic(scene);
    notify(); return;
  }
  originalMusic(null);
  if (!track || !enabled || !unlocked || volume === 0 || document.hidden || leaving) {
    stopRecording(); notify(); return;
  }
  if (current !== track.file) {
    stopRecording();
    audio = new Audio('../assets/bgm/gemini/' + track.file + '.mp3');
    audio.preload = 'none'; audio.loop = true;
    current = track.file; pending = false;
  }
  audio.volume = volume;
  if (!audio.paused || pending) { notify(); return; }
  var playing = audio, ticket = revision;
  pending = true;
  playing.play().then(function () {
    if (playing !== audio || ticket !== revision) {
      playing.pause();
      if (playing === audio) { pending = false; sync(); }
      return;
    }
    pending = false; notify();
  }).catch(function (error) {
    if (playing !== audio) return;
    pending = false;
    if (ticket !== revision) return sync();
    // Autoplay denial can be retried by the next gesture; network errors use the ambient track.
    if (error && error.name === 'NotAllowedError') { unlocked = false; notify(); return; }
    failed = true; sync();
  });
}
A.music = function (next) {
  if (scene !== next) { scene = next; failed = false; }
  sync();
};
A.unlock = function () { originalUnlock(); unlocked = true; leaving = false; sync(); };
A.setMusic = function (on) { enabled = on !== false; originalSetMusic(enabled); sync(); };
A.configureBgm = function (options) {
  var next = options.mode === 'original' ? 'original' : 'gemini';
  if (mode !== next) { mode = next; failed = false; }
  volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : 0.25;
  sync();
};
A.bgmInfo = function () {
  var track = trackForScene();
  return { title: useOriginal() ? 'これまでのBGM' : track ? track.title : '',
    playing: useOriginal() ? !!scene && enabled && !document.hidden && !leaving : !!audio && !audio.paused,
    fallback: failed };
};
document.addEventListener('pointerdown', function () { if (!unlocked) A.unlock(); }, { capture: true, passive: true });
document.addEventListener('keydown', function () { if (!unlocked) A.unlock(); }, { capture: true });
document.addEventListener('visibilitychange', sync);
window.addEventListener('pagehide', function () { leaving = true; sync(); });
window.addEventListener('pageshow', function () { leaving = false; sync(); });
})();

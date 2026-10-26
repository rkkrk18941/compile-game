/* Scene playlists for completed Gemini recordings, with the original ambience as fallback. */
(function () {
'use strict';
var A = window.IBARA.SFX;
var originalMusic = A.music, originalUnlock = A.unlock, originalSetMusic = A.setMusic;
var originalExternalAudio = A.setExternalAudio, externalAudio = true;
// Use a mixable session where supported; silent startup also protects browsers without this API.
try { if (window.navigator && window.navigator.audioSession) window.navigator.audioSession.type = 'ambient'; } catch (e) {}
var library = window.IBARA_BGM_LIBRARY || [], byId = {};
library.forEach(function (t) { byId[t.id] = t; });
var defaults = { explore: 'ibara-map', combat: 'ibara-combat' };
function zoneOf(s) { return s === 'combat' || s === 'boss' ? 'combat' : 'explore'; }
function normalize(input) {
  var out = {};
  Object.keys(defaults).forEach(function (zone) {
    var raw = input && input[zone] || {}, ids = [];
    (Array.isArray(raw.tracks) ? raw.tracks : []).forEach(function (id) { if (byId[id] && ids.indexOf(id) < 0) ids.push(id); });
    if (!ids.length) ids = [defaults[zone]];
    out[zone] = { mode: ['single', 'random'].indexOf(raw.mode) >= 0 ? raw.mode : 'auto', tracks: ids };
  });
  return out;
}
var playlists = normalize(), scene = null, mode = 'gemini', volume = 0.25, enabled = true, unlocked = false;
var audio = null, current = null, revision = 0, failed = false, pending = false, leaving = false;
var selectionKey = '', selected = null, preview = null, last = {};
function choose(ids, previous) {
  var pool = ids.length > 1 ? ids.filter(function (id) { return id !== previous; }) : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}
function trackForScene() {
  if (preview) return byId[preview];
  if (!scene) return null;
  var zone = zoneOf(scene), list = playlists[zone];
  var autoId = scene === 'boss' ? 'ibara-boss' : defaults[zone];
  var key = zone + ':' + list.mode + ':' + (list.mode === 'auto' ? autoId : list.tracks.join(','));
  if (key !== selectionKey) {
    selectionKey = key;
    selected = list.mode === 'auto' ? autoId : list.mode === 'single' ? list.tracks[0] : choose(list.tracks, last[zone]);
    last[zone] = selected;
  }
  return byId[selected];
}
function notify() { document.dispatchEvent(new CustomEvent('ibara-bgm-change')); }
function stopRecording() { revision++; if (audio) audio.pause(); }
function useOriginal() { return (!preview && mode === 'original') || failed; }
function sync() {
  var track = trackForScene(), active = !externalAudio && enabled && volume > 0 && unlocked && !document.hidden && !leaving;
  if (A.setMusicVolume) A.setMusicVolume(volume);
  if (useOriginal()) {
    stopRecording();
    originalSetMusic(active);
    originalMusic(active ? scene : null);
    notify(); return;
  }
  originalMusic(null);
  if (!track || !active) { stopRecording(); notify(); return; }
  if (current !== track.id) {
    stopRecording();
    audio = new Audio('../assets/bgm/gemini/' + track.id + '.mp3');
    audio.preload = 'none';
    current = track.id; pending = false;
    var created = audio;
    audio.addEventListener('ended', function () {
      if (audio !== created) return;
      if (preview) { preview = null; failed = false; sync(); return; }
      if (!scene || playlists[zoneOf(scene)].mode !== 'random') return;
      var zone = zoneOf(scene);
      selected = choose(playlists[zone].tracks, current); last[zone] = selected;
      sync();
    });
    audio.addEventListener('error', function () { if (audio === created) { failed = true; sync(); } });
  }
  audio.loop = !preview && (playlists[zoneOf(scene)].mode !== 'random' || playlists[zoneOf(scene)].tracks.length === 1);
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
    if (error && error.name === 'NotAllowedError') { unlocked = false; notify(); return; }
    failed = true; sync();
  });
}
A.music = function (next) { if (scene !== next) { scene = next; failed = false; } sync(); };
A.unlock = function () {
  if (externalAudio) return;
  if (A.on !== false || enabled && volume > 0) originalUnlock();
  unlocked = true; leaving = false; sync();
};
A.setExternalAudio = function (on) {
  externalAudio = on !== false;
  if (externalAudio) { unlocked = false; preview = null; }
  if (originalExternalAudio) originalExternalAudio(externalAudio);
  sync();
};
A.setMusic = function (on) { enabled = on !== false; sync(); };
A.normalizeBgm = normalize;
A.configureBgm = function (options) {
  options = options || {};
  var next = options.mode === 'original' ? 'original' : 'gemini';
  var lists = options.scenes ? normalize(options.scenes) : playlists;
  if (mode !== next || JSON.stringify(lists) !== JSON.stringify(playlists)) failed = false;
  mode = next; playlists = lists;
  if (Number.isFinite(options.volume)) volume = Math.max(0, Math.min(1, options.volume));
  sync();
};
A.previewBgm = function (id) {
  if (externalAudio) return;
  if (id && !byId[id]) return;
  preview = preview === id ? null : id || null;
  failed = false; unlocked = true; leaving = false; originalUnlock(); sync();
};
A.stopBgmPreview = function () { if (preview) { preview = null; failed = false; sync(); } };
A.nextBgm = function () {
  if (!scene || preview || mode === 'original') return;
  var zone = zoneOf(scene), list = playlists[zone];
  if (list.mode !== 'random') return;
  selected = choose(list.tracks, current); last[zone] = selected; failed = false; sync();
};
A.bgmInfo = function () {
  var track = trackForScene();
  return { title: useOriginal() ? 'これまでのBGM' : track ? track.title : '', id: track && track.id, preview: preview,
    playing: useOriginal() ? !!scene && enabled && volume > 0 && unlocked && !document.hidden && !leaving : !!track && !!audio && !audio.paused,
    fallback: failed, volume: volume, externalAudio: externalAudio, random: !!scene && mode !== 'original' && playlists[zoneOf(scene)].mode === 'random' };
};
document.addEventListener('pointerdown', function () { if (!unlocked) A.unlock(); }, { capture: true, passive: true });
document.addEventListener('keydown', function () { if (!unlocked) A.unlock(); }, { capture: true });
document.addEventListener('visibilitychange', sync);
window.addEventListener('pagehide', function () { leaving = true; sync(); });
window.addEventListener('pageshow', function () { leaving = false; sync(); });
})();

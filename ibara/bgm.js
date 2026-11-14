/* Scene playlists for completed Gemini recordings, with the original ambience as fallback. */
(function () {
'use strict';
var A = window.IBARA.SFX;
var originalMusic = A.music, originalUnlock = A.unlock, originalSetMusic = A.setMusic;
var originalExternalAudio = A.setExternalAudio, externalAudio = false;
// Playback yields to later media; interruptions stay muted until explicit re-enable.
try { if (window.navigator && window.navigator.audioSession) window.navigator.audioSession.type = 'playback'; } catch (e) {}
var library = window.IBARA_BGM_LIBRARY || [], byId = {};
library.forEach(function (t) { byId[t.id] = t; });
var defaults = { explore: 'ibara-map', combat: 'ibara-combat' };
/* 「おまかせ」: the tower's own three pieces, plus fitting pieces of the library for Elites and the quiet rooms. */
/* The campfire keeps 「灰の塔、灯る道」, which was written for exploring and resting. */
var AUTO = { boss: 'ibara-boss', elite: 'pursuit', shop: 'hashikko-seven', event: 'depth' };
function zoneOf(s) { return s === 'combat' || s === 'boss' || s === 'elite' ? 'combat' : 'explore'; }
function autoFor(s) { var id = AUTO[s]; return id && byId[id] ? id : defaults[zoneOf(s)]; }
/* Crossfades (0.6 s), ducking during big moments, and returning to a piece where it was left (so walking from the
   map into a room and back does not restart the map's music). iOS ignores volume: there the change is immediate. */
var FADE_MS = 600, duck = 1, fades = [], positions = {};
var TIMERS = typeof setInterval === 'function' && typeof clearInterval === 'function';
function ramp(player, from, to, ms, done) {
  fades = fades.filter(function (f) { if (f.player === player) { clearInterval(f.timer); return false; } return true; });
  // Without timers (some test harnesses) the change is immediate.
  if (!TIMERS) { try { player.volume = Math.max(0, Math.min(1, to)); } catch (e) {} if (done) done(); return; }
  var t0 = Date.now(), entry = { player: player };
  try { player.volume = Math.max(0, Math.min(1, from)); } catch (e) {}
  entry.timer = setInterval(function () {
    var k = Math.min(1, (Date.now() - t0) / Math.max(1, ms));
    try { player.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {}
    if (k >= 1) { clearInterval(entry.timer); fades = fades.filter(function (f) { return f !== entry; }); if (done) done(); }
  }, 40);
  fades.push(entry);
}
function fading(player) { return fades.some(function (f) { return f.player === player; }); }
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
  var autoId = autoFor(scene);
  var key = zone + ':' + list.mode + ':' + (list.mode === 'auto' ? autoId : list.tracks.join(','));
  if (key !== selectionKey) {
    selectionKey = key;
    selected = list.mode === 'auto' ? autoId : list.mode === 'single' ? list.tracks[0] : choose(list.tracks, last[zone]);
    last[zone] = selected;
  }
  return byId[selected];
}
function notify() { document.dispatchEvent(new CustomEvent('ibara-bgm-change')); }
var expectedPauses = new WeakSet();
function pauseRecording(player) {
  if (!player || player.paused) return;
  expectedPauses.add(player);
  player.pause();
}
function stopRecording(fade) {
  revision++;
  var old = audio;
  if (!old) return;
  if (current && !old.paused) positions[current] = { t: old.currentTime || 0, at: Date.now() };
  if (fade && !old.paused) ramp(old, old.volume, 0, FADE_MS, function () { pauseRecording(old); });
  else pauseRecording(old);
}
function interruptAudio() {
  if (externalAudio) return;
  A.setExternalAudio(true);
  document.dispatchEvent(new CustomEvent('ibara-audio-interrupted'));
}
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
  if (!track || !active) { stopRecording(active && !!audio && !audio.paused); notify(); return; }
  if (current === track.id && audio && !audio.paused && fading(audio)) ramp(audio, audio.volume, volume * duck, 300); // asked again while fading out
  if (current !== track.id) {
    stopRecording(true);
    audio = new Audio('../assets/bgm/gemini/' + track.id + '.mp3');
    audio.preload = 'none';
    current = track.id; pending = false;
    var created = audio, resumeAt = positions[track.id];
    // Back to a piece left less than three minutes ago: continue where it was.
    if (resumeAt && Date.now() - resumeAt.at < 180000 && resumeAt.t > 1) {
      created.addEventListener('loadedmetadata', function () { try { if (created.duration && resumeAt.t < created.duration - 2) created.currentTime = resumeAt.t; } catch (e) {} }, { once: true });
    }
    created.fadeIn = true; try { created.volume = 0; } catch (e) {}
    audio.addEventListener('pause', function () {
      if (expectedPauses.has(created)) { expectedPauses.delete(created); return; }
      if (audio === created && created.paused && !created.ended && !created.error) interruptAudio();
    });
    audio.addEventListener('play', function () { if (externalAudio) pauseRecording(created); });
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
  if (!fading(audio) && !audio.fadeIn) audio.volume = volume * duck;
  if (!audio.paused || pending) { notify(); return; }
  var playing = audio, ticket = revision;
  pending = true;
  playing.play().then(function () {
    if (playing !== audio || ticket !== revision) {
      pauseRecording(playing);
      if (playing === audio) { pending = false; sync(); }
      return;
    }
    pending = false;
    if (playing.fadeIn) { playing.fadeIn = false; ramp(playing, 0, volume * duck, FADE_MS); }
    notify();
  }).catch(function (error) {
    if (playing !== audio) return;
    pending = false;
    if (ticket !== revision) return sync();
    if (error && error.name === 'NotAllowedError') { unlocked = false; notify(); return; }
    failed = true; sync();
  });
}
A.music = function (next) { if (scene !== next) { scene = next; failed = false; } sync(); };
/* Lower the music for a moment (Boss entrance and fall): duckBgm(0.35, 1800) ... restores itself. */
A.duckBgm = function (level, ms) {
  duck = Math.max(0, Math.min(1, level == null ? 1 : level));
  if (TIMERS) clearTimeout(A.duckT);
  if (audio && !audio.paused) ramp(audio, audio.volume, volume * duck, 300);
  if (originalSetMusic && A.setMusicVolume) A.setMusicVolume(volume * duck);
  if (ms && duck < 1 && TIMERS) A.duckT = setTimeout(function () { A.duckBgm(1); }, ms);
};
A.startBgm = function () {
  if (externalAudio) return;
  unlocked = true;
  if (mode === 'original' && enabled && volume > 0) originalUnlock();
  sync();
};
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
    playing: useOriginal() ? !externalAudio && !!scene && enabled && volume > 0 && unlocked && !document.hidden && !leaving : !!track && !!audio && !audio.paused,
    fallback: failed, volume: volume, externalAudio: externalAudio, random: !!scene && mode !== 'original' && playlists[zoneOf(scene)].mode === 'random' };
};
document.addEventListener('pointerdown', function () { if (!externalAudio) A.unlock(); }, { capture: true, passive: true });
document.addEventListener('keydown', function () { if (!externalAudio) A.unlock(); }, { capture: true });
document.addEventListener('ibara-audio-focus-lost', interruptAudio);
document.addEventListener('visibilitychange', function () { if (document.hidden) interruptAudio(); else sync(); });
window.addEventListener('pagehide', function () { leaving = true; interruptAudio(); sync(); });
try {
  var nav = window.navigator;
  if (nav && nav.mediaSession) nav.mediaSession.setActionHandler('pause', interruptAudio);
  if (nav && nav.audioSession) nav.audioSession.addEventListener('statechange', function () {
    if (nav.audioSession.state === 'interrupted') interruptAudio();
  });
} catch (e) {}
window.addEventListener('pageshow', function () { leaving = false; sync(); });
})();

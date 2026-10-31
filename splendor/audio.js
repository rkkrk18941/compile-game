/* 宝石の煌めき — sound. Effects are synthesized on the device (no files). Music: every completed recording in the
   PLAYROOM soundtrack catalog (../assets/gemini-catalog.mjs), one entry per recording, so tracks added to the catalog
   later appear here by themselves. Playback starts after the first tap (browsers require a gesture).
   window.SPL_AUDIO: { settings, update(patch), sfx(name), tracks(): Promise<list>, current(), unlock(), setActive(on) } */
(function (root) {
  'use strict';
  var KEY = 'splendor.audio.v1';
  var CATALOG = '../assets/gemini-catalog.mjs?v=20261031-splendor';
  var DEFAULT_TRACK = 'garden';                    // 夜明けの庭: piano and glittering bells
  // which PLAYROOM game each recording was made for (shown under the title)
  var SOURCE = {
    'sk-': 'スカルキング', garden: 'NOTE', depth: 'NOTE', battle: 'NOTE', 'gensou-seven': 'ファンタジーレルムズ', cryptid: 'クリプティッド',
    compile: 'COMPILE', 'black-friday': 'ブラックフライデー', 'nurie-rush': 'おばけキャッチ', 'ticket-to-ride': 'チケット・トゥ・ライド',
    'hitomoji-battle': 'ヒトモジ・バトル', 'asshuku-eight': 'アッシュク・エイト', nanafushigi: 'ナナフシギ・デュエル', 'quo-vadis': 'クォ・ヴァディス',
    'hashikko-seven': 'ハシッコ・セブン', 'hatatori-nine': 'バトルライン', '80percent': '80%', xing: '×ing', noclip: 'NOCLIP',
    'mienai-five': 'ミエナイ・ファイブ', 'kosodoro-mine': 'こそどろ鉱山', 'shady-lady': 'シェディー・レディー', 'ibara-': 'スレイザスパイア',
    splendor: '宝石の煌めき'
  };
  function sourceOf(id) {
    if (SOURCE[id]) return SOURCE[id];
    for (var k in SOURCE) if (k.slice(-1) === '-' && id.indexOf(k) === 0) return SOURCE[k];
    return '';
  }
  function load() { try { return JSON.parse(root.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } }
  function clamp(v, d) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d; }
  var raw = load();
  var settings = {
    bgm: typeof raw.bgm === 'boolean' ? raw.bgm : true,
    track: typeof raw.track === 'string' ? raw.track : null,
    mode: raw.mode === 'shuffle' ? 'shuffle' : 'one',
    bgmVol: clamp(raw.bgmVol, 0.32),
    sfx: typeof raw.sfx === 'boolean' ? raw.sfx : true,
    sfxVol: clamp(raw.sfxVol, 0.55)
  };

  /* ---------- music ---------- */
  var list = null, loading = null, audio = null, playingId = null, unlocked = false, active = true, hidden = false, listeners = [];
  function tracks() {
    if (list) return Promise.resolve(list);
    if (loading) return loading;
    loading = import(CATALOG).then(function (m) {
      var seen = {}, out = [];
      Object.keys(m.RECORDINGS).forEach(function (id) {
        var t = m.RECORDINGS[id];
        if (seen[t.file]) { var prev = seen[t.file], src = sourceOf(id); if (src && prev.games.indexOf(src) < 0) prev.games.push(src); return; }
        var e = { id: id, title: t.title, style: t.style, tempo: t.tempo, duration: t.duration, url: t.url, file: t.file, games: [] };
        var s = sourceOf(id); if (s) e.games.push(s);
        seen[t.file] = e; out.push(e);
      });
      list = out;
      if (!settings.track || !find(settings.track)) settings.track = find('splendor') ? 'splendor' : (find(DEFAULT_TRACK) ? DEFAULT_TRACK : (out[0] && out[0].id));
      return list;
    }).catch(function () { list = []; return list; });
    return loading;
  }
  function find(id) { if (!list) return null; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function current() { return find(settings.track); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); }
  function wanted() { return settings.bgm && active && !hidden && unlocked && settings.bgmVol > 0; }
  function pickNext() {
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    var t; do { t = list[Math.floor(Math.random() * list.length)]; } while (t.id === playingId);
    return t;
  }
  function sync() {
    if (!wanted()) { if (audio && !audio.paused) audio.pause(); emit(); return; }
    tracks().then(function () {
      var t = current(); if (!t || !wanted()) return;
      if (!audio) {
        audio = new Audio(); audio.preload = 'none';
        audio.addEventListener('ended', function () {
          if (settings.mode === 'shuffle') { var n = pickNext(); if (n) { settings.track = n.id; save(); } }
          playingId = null; sync();
        });
      }
      audio.loop = settings.mode !== 'shuffle';
      audio.volume = settings.bgmVol;
      if (playingId !== t.id) { audio.src = t.url; playingId = t.id; }
      if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () { emit(); }); }
      emit();
    });
  }
  function playing() { return !!(audio && !audio.paused); }

  /* ---------- effects ---------- */
  var ctx = null, out = null;
  function context() {
    if (!ctx) {
      var C = root.AudioContext || root.webkitAudioContext; if (!C) return null;
      ctx = new C(); out = ctx.createGain(); out.gain.value = settings.sfxVol;
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
      out.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }
  function tone(f, dur, vol, at, type, to) {
    var c = ctx, t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, at) {
    var c = ctx, t = c.currentTime + (at || 0), n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + dur);
  }
  function sfx(name, n) {
    if (!settings.sfx || settings.sfxVol <= 0 || hidden) return;
    var c; try { c = context(); } catch (e) { return; } if (!c) return;
    n = n || 1;
    if (name === 'chip') {
      // stone tokens clicking together, one click per token
      for (var i = 0; i < n; i++) { var at = i * 0.07; tone(2350 + i * 160, 0.07, 0.06, at, 'triangle'); tone(3900 + i * 90, 0.045, 0.025, at + 0.004); noise(0.03, 0.035, 5200, at); }
    } else if (name === 'card') { noise(0.16, 0.08, 1800); tone(320, 0.09, 0.03, 0.02, 'sine', 210); }
    else if (name === 'reserve') { noise(0.12, 0.06, 1400); tone(660, 0.18, 0.04, 0.05); tone(990, 0.22, 0.025, 0.1); }
    else if (name === 'buy') { noise(0.14, 0.07, 1600); tone(784, 0.16, 0.045, 0.04); tone(1175, 0.24, 0.035, 0.11); }
    else if (name === 'noble') { [523, 659, 784, 1047].forEach(function (f, k) { tone(f, 0.5, 0.05, k * 0.09, 'triangle'); }); tone(2093, 0.6, 0.02, 0.36); }
    else if (name === 'turn') { tone(880, 0.14, 0.035); tone(1320, 0.2, 0.025, 0.07); }
    else if (name === 'tap') tone(1500, 0.035, 0.025, 0, 'triangle');
    else if (name === 'deny') tone(220, 0.12, 0.04, 0, 'square', 180);
    else if (name === 'win') { [523, 659, 784, 1047, 1319].forEach(function (f, k) { tone(f, 0.7, 0.05, k * 0.11, 'triangle'); }); }
    else if (name === 'lose') { [392, 349, 311, 262].forEach(function (f, k) { tone(f, 0.45, 0.04, k * 0.14); }); }
    else if (name === 'final') { tone(587, 0.4, 0.05, 0, 'triangle'); tone(880, 0.6, 0.04, 0.16, 'triangle'); }
  }

  function unlock() {
    unlocked = true;
    if (settings.sfx) try { context(); } catch (e) { /* no audio */ }
    sync();
  }
  function update(patch) {
    for (var k in patch) if (k in settings) settings[k] = patch[k];
    settings.bgmVol = clamp(settings.bgmVol, 0.32); settings.sfxVol = clamp(settings.sfxVol, 0.55);
    if (out) out.gain.value = settings.sfxVol;
    if (audio) { audio.volume = settings.bgmVol; audio.loop = settings.mode !== 'shuffle'; }
    save(); sync();
  }
  function choose(id) { if (find(id)) { settings.track = id; save(); playingId = playingId === id ? id : null; sync(); } }

  // a gesture unlocks audio; a later gesture retries music the browser refused to start
  ['pointerdown', 'pointerup', 'keydown', 'click'].forEach(function (ev) {
    root.addEventListener(ev, function () { if (!unlocked) unlock(); else if (wanted() && audio && audio.paused) sync(); }, { capture: true, passive: true });
  });
  if (root.document) root.document.addEventListener('visibilitychange', function () {
    hidden = root.document.hidden;
    if (hidden && ctx && ctx.state === 'running') ctx.suspend().catch(function () {});
    sync();
  });
  root.addEventListener('pagehide', function () { if (audio) audio.pause(); });

  root.SPL_AUDIO = {
    get settings() { return settings; },
    update: update, choose: choose, tracks: tracks, current: current, find: find, sfx: sfx, unlock: unlock,
    setActive: function (v) { active = !!v; sync(); }, playing: playing,
    onChange: function (f) { listeners.push(f); }, sourceOf: sourceOf, next: function () { var n = pickNext(); if (n) choose(n.id); }
  };
})(typeof window !== 'undefined' ? window : this);

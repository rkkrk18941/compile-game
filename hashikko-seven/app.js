/* ハシッコ・セブン — the app: screens, the action bar, turn flow, CPU and online play.
   Solo: the engine runs here and the CPUs (cpu-worker.js) play the other seats, one reveal at a time.
   Online: the host's browser runs the engine and the CPUs; every guest sends its reveals and gets back its own view.
   Whatever happens arrives as (events, view): the presenter replays the events one by one on the 3D table
   (engine.reduceView), then settles on the view. */
import { loadThree, createScene, NUM_COLORS, SEAT_COLORS } from './scene.js';

const E = window.HSV_ENG, AI = window.HSV_AI, N = window.HSV_NET;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const store = {
  get(k, d) { try { const v = localStorage.getItem('hsv.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hsv.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const prefs = {
  name: store.get('name', ''), level: store.get('level', 2), count: store.get('count', 4),
  sound: store.get('sound', true), bgm: store.get('bgm', true), felt: store.get('felt', 'teal'), speed: store.get('speed', 1), quality: store.get('quality', 'high')
};
if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;
if (TEST && params.get('q')) prefs.quality = params.get('q') === 'low' ? 'low' : 'high';
const LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
const CPU_NAMES = ['ミケ', 'ソラ', 'ハル', 'ナツ', 'モモ'];
const MAX_SEATS = 5;
const SETUP_NOTE = {
  2: '2人：1〜10を使います。手札10枚、場札10枚。',
  3: '3人：1〜11を使います。手札8枚、場札9枚。',
  4: '4人：1〜12を使います。手札7枚、場札8枚。',
  5: '5人：1〜12を使います。手札6枚、場札6枚。'
};
const WIN_SHORT = { seven: '7のトリオ', three: 'トリオ3組', sum7: '足して7', diff7: '引いて7' };
function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('hsv.cid'); } catch (e) { /* ignore */ }
  if (!c || !/^[A-Za-z0-9]{6,32}$/.test(c)) { c = N.makeCid(); try { sessionStorage.setItem('hsv.cid', c); } catch (e) { /* ignore */ } }
  return c;
}
const CID = myCid();

let scene = null;
let match = null;      // the game on the table
let lobby = null;      // an online room (outlives rematches)
let view = null;       // what the table shows right now
let presenting = false;
let badCard = null;    // the card that broke the current challenge, while it is still on show
let stageN = 4;        // players at the table (the panel under it needs a row each)
const queue = [];

/* ================================================================ small UI helpers */
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(html, cls = '', ms = 2600) {
  const box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast ' + cls; t.innerHTML = html;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 320); }, ms / Math.max(1, prefs.speed * 0.8));
}
function stamp(text, cls, sub) {
  const s = $('#stamp');
  s.className = ''; void s.offsetWidth;
  s.innerHTML = esc(text) + (sub ? '<small>' + sub + '</small>' : '');
  s.style.animationDuration = (1.6 / Math.max(0.5, prefs.speed)) + 's';
  s.className = 'show ' + cls;
}
function openLayer(html, onClose) {
  const L = $('#layer');
  L.innerHTML = html;
  L.onclick = (e) => { if (e.target === L || e.target.closest('[data-close]')) closeLayer(); };
  closeLayer.cb = onClose || null;
  return L.firstElementChild;
}
function closeLayer() { $('#layer').innerHTML = ''; const f = closeLayer.cb; closeLayer.cb = null; if (f) f(); }
function sheet(title, body) {
  return '<div class="sheet" role="dialog" aria-label="' + esc(title) + '"><div class="sheet-h"><h3>' + esc(title) + '</h3><button class="iconbtn" data-close aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="sheet-b">' + body + '</div></div>';
}
function mini(v, cls = '') { return '<span class="mc' + (v === 7 ? ' gold' : '') + (cls ? ' ' + cls : '') + '" style="--c:' + NUM_COLORS[v] + '">' + v + '</span>'; }
function trioMini(v, cls = '') { return '<span class="tri' + (v === 7 ? ' gold' : '') + (cls ? ' ' + cls : '') + '" style="--c:' + NUM_COLORS[v] + '"><i></i><i></i><b>' + v + '</b></span>'; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (s) => new Promise((r) => setTimeout(r, Math.max(0, s) * 1000 / prefs.speed));

/* names as this player sees them */
function nameOf(p) { if (!match || !view) return ''; return p === view.me ? 'あなた' : (match.players[p] ? match.players[p].nm : 'P' + (p + 1)); }
function nameHtml(p) { return '<b class="pn" style="--pc:' + SEAT_COLORS[p % SEAT_COLORS.length] + '">' + esc(nameOf(p)) + '</b>'; }
function whoSub(p) {
  const pl = match && match.players[p];
  if (!pl || p === view.me) return '';
  if (pl.kind === 'cpu') return 'CPU' + LEVEL_NAME[pl.cpu || 2];
  if (pl.sub) return 'CPUが代打';
  if (pl.here === false) return '接続待ち';
  return '';
}

/* ================================================================ sound (synthesized) */
const sfx = (() => {
  let ac = null, master = null;
  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); } catch (e) { ac = null; }
  }
  function tone(f, d, type, vol, when = 0, slide = 0) {
    if (!ac || !prefs.sound) return;
    const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, freq, vol, when = 0, q = 1) {
    if (!ac || !prefs.sound) return;
    const t = ac.currentTime + when, n = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const S = {
    tap: () => tone(880, 0.06, 'triangle', 0.08),
    flip: () => { noise(0.09, 2600, 0.35, 0, 0.7); tone(520, 0.05, 'triangle', 0.05, 0.02); },
    match: () => { tone(660, 0.12, 'triangle', 0.1); tone(880, 0.16, 'triangle', 0.09, 0.08); },
    trio: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, 'triangle', 0.13, i * 0.07)); },
    seven: () => { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, i * 0.06)); noise(0.8, 6000, 0.12, 0.1, 0.4); },
    fail: () => { tone(220, 0.16, 'sawtooth', 0.07); tone(175, 0.24, 'sawtooth', 0.07, 0.13); },
    back: () => noise(0.18, 1400, 0.22, 0, 0.6),
    deny: () => tone(140, 0.18, 'sawtooth', 0.07),
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 0.7 : 0.3, 'triangle', 0.14, i * 0.12)); },
    lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.34, 'triangle', 0.11, i * 0.16)); },
    turn: () => tone(1180, 0.09, 'sine', 0.06)
  };
  return { unlock, play: (k) => { try { S[k] && S[k](); } catch (e) { /* audio is optional */ } }, ctx: () => ac, master: () => master };
})();

/* ================================================================ background music
   The site's own synthesized tracks (../assets/music.js, made for COMPILE) are borrowed as they are:
   a relaxed one on the title, another in play, the finale when someone holds two trios. */
const bgm = (() => {
  let loading = null, bus = null, mood = 'title';
  const TRACK = { title: 'lounge', game: 'boot', clutch: 'lastcompile' };
  function load() {
    if (globalThis.COMPILE_MUSIC) return Promise.resolve();
    if (!loading) loading = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '../assets/music.js'; sc.onload = res; sc.onerror = () => { loading = null; rej(); }; document.head.appendChild(sc); });
    return loading;
  }
  async function apply() {
    const ac = sfx.ctx();
    if (!ac) return;
    const M = globalThis.COMPILE_MUSIC;
    if (!prefs.sound || !prefs.bgm || TEST) { if (M) M.stop(); return; }
    try { await load(); } catch (e) { return; }
    const MM = globalThis.COMPILE_MUSIC;
    if (!MM) return;
    if (!bus) { bus = ac.createGain(); bus.gain.value = 0.45; bus.connect(sfx.master()); }
    MM.attach(ac, bus); MM.setChoice(TRACK[mood]); MM.start();
  }
  function setMood(m) {
    if (m === mood) return;
    mood = m;
    if (globalThis.COMPILE_MUSIC && prefs.sound && prefs.bgm) globalThis.COMPILE_MUSIC.setChoice(TRACK[m]);
  }
  return { apply, setMood };
})();
let audioStarted = false;
function audioOn() { sfx.unlock(); if (!audioStarted && sfx.ctx()) { audioStarted = true; bgm.apply(); } }
document.addEventListener('visibilitychange', () => { const ac = sfx.ctx(); if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });

/* ================================================================ CPU */
let worker = null, workerFailed = false, workerSeq = 0;
const workerWait = new Map();
function cpuChoose(v, level, mind) {
  const seed = (Math.random() * 4294967296) >>> 0;
  if (!workerFailed && typeof Worker !== 'undefined') {
    try {
      if (!worker) {
        worker = new Worker('cpu-worker.js');
        worker.onmessage = (e) => { const r = workerWait.get(e.data.id); if (r) { workerWait.delete(e.data.id); r(e.data.a); } };
        worker.onerror = () => { workerFailed = true; workerWait.forEach((r) => r(undefined)); workerWait.clear(); };
      }
      const id = ++workerSeq;
      return new Promise((res) => {
        let done = false;
        const finish = (a) => { if (done) return; done = true; workerWait.delete(id); res(a == null ? AI.choose(v, level, E.mulberry32(seed), mind) : a); };
        workerWait.set(id, finish);
        setTimeout(() => finish(undefined), 8000);   // a stuck worker never stalls the game
        worker.postMessage({ id, view: v, level, seed, mind });
      });
    } catch (e) { workerFailed = true; }
  }
  return new Promise((res) => setTimeout(() => res(AI.choose(v, level, E.mulberry32(seed), mind)), 0));
}

/* ================================================================ matches */
let matchSeq = 0;
function myName() { return prefs.name || 'あなた'; }
function newSeries(n) { return { games: 0, wins: new Array(n).fill(0), first: -1 }; }
function nextFirst(series, n) { series.first = series.first < 0 ? Math.floor(Math.random() * n) : (series.first + 1) % n; return series.first; }
function mindSeed() { return (Math.random() * 4294967296) >>> 0; }
function startSolo(again) {
  const old = again && match && match.mode === 'cpu' ? match : null;
  const n = old ? old.players.length : prefs.count;
  const level = old ? old.level : prefs.level;
  const players = [{ nm: myName(), kind: 'me', cpu: 0 }];
  for (let i = 1; i < n; i++) players.push({ nm: CPU_NAMES[i - 1], kind: 'cpu', cpu: level, mind: { seed: mindSeed() } });
  const series = old ? old.series : newSeries(n);
  const s = E.newGame({ n, first: nextFirst(series, n) });
  beginMatch({ mode: 'cpu', id: ++matchSeq, s, me: 0, players, level, series, alive: true, cpuBusy: false }, E.viewFor(s, 0));
}
function beginMatch(m, v) {
  if (match && match !== m) { match.alive = false; clearTimeout(match.awayTimer); }
  match = m; queue.length = 0; presenting = false; badCard = null;
  closeLayer(); hideScreens();
  stageN = v.n;
  document.body.classList.add('ingame'); onResize();
  bgm.setMood('game');
  scene.setAttract(false);
  scene.clear();
  view = v;
  scene.setView(v, { instant: true });
  buildTags();
  renderAll();
  toast(nameHtml(v.turn) + 'から始めます', v.turn === v.me ? 'me' : '', 2200);
  afterIdle();
}

/* the local player reveals a card */
function act(a) {
  const m = match;
  if (!myTurn()) return;
  sfx.unlock();
  if (m.mode === 'guest') {
    m.waiting = true; renderPanel(); renderTags();
    m.link.send({ k: 'act', a, ply: view.ply });
    clearTimeout(m.waitTo);
    m.waitTo = setTimeout(() => { if (match === m && m.waiting) { m.waiting = false; renderAll(); toast('ホストからの応答がありません', 'warn'); } }, 9000);
    return;
  }
  const r = E.apply(m.s, Object.assign({}, a, { p: m.me }));
  if (!r.ok) { sfx.play('deny'); toast('その手は打てません', 'warn'); return; }
  deliver(m, r.ev);
}
function deliver(m, ev) {
  if (m.s.phase === 'over' && !m.scored) scoreGame(m);
  enqueue(m, E.viewFor(m.s, m.me), ev);
  if (m.mode === 'host') sendUpdates(m, ev);
}
function scoreGame(m) {
  m.scored = true;
  m.series.games++;
  if (m.s.winner >= 0) m.series.wins[m.s.winner]++;
}
function metaOf(m) {
  return {
    names: m.players.map((pl) => pl.nm), kinds: m.players.map((pl) => (pl.kind === 'me' ? 'host' : pl.kind)),
    levels: m.players.map((pl) => pl.cpu || 0), here: m.players.map((pl) => pl.here !== false), sub: m.players.map((pl) => !!pl.sub),
    series: m.series
  };
}
function sendUpdates(m, ev) {
  const L = m.lobby;
  if (!L) return;
  const meta = metaOf(m);
  m.players.forEach((pl, p) => { if (pl.kind === 'guest' && pl.cid) L.link.send(pl.cid, { k: 'upd', view: E.viewFor(m.s, p), ev, meta }); });
}
function playersFromMeta(meta, me) {
  return meta.names.map((nm, p) => ({ nm: p === me ? myName() : nm, kind: p === me ? 'me' : meta.kinds[p], cpu: meta.levels[p], here: meta.here[p], sub: meta.sub[p] }));
}

/* CPUs (and players who dropped out of an online game) move one reveal at a time */
function afterIdle() {
  const m = match;
  if (!m || !m.alive || presenting || !view || view.phase !== 'play' || m.mode === 'guest') return;
  const p = m.s.turn, pl = m.players[p];
  if (p === m.me) return;
  if (pl.kind === 'cpu') cpuStep(m);
  else if (pl.kind === 'guest' && (pl.here === false || pl.sub)) awayStep(m, p);
}
async function cpuStep(m, levelFor) {
  if (m.cpuBusy || !m.alive || m.s.phase !== 'play') return;
  const p = m.s.turn, pl = m.players[p];
  m.cpuBusy = true;
  const t0 = performance.now();
  if (!pl.mind) pl.mind = { seed: mindSeed() };
  const a = await cpuChoose(E.viewFor(m.s, p), levelFor || pl.cpu || 2, pl.mind);
  const left = (m.s.chal.length ? 620 : 980) / prefs.speed - (performance.now() - t0);
  if (left > 0) await sleep(left);
  m.cpuBusy = false;
  if (match !== m || !m.alive || m.s.phase !== 'play' || m.s.turn !== p) return;
  if (pl.kind === 'guest' && pl.here !== false && !pl.sub) return;      // the player came back
  let r = a ? E.apply(m.s, Object.assign({}, a, { p })) : { ok: false };
  if (!r.ok) {   // never stall: fall back to the first legal reveal
    console.warn('CPU move rejected', a, r.err);
    r = E.apply(m.s, Object.assign({}, E.legalActions(m.s)[0], { p }));
  }
  deliver(m, r.ev);
}
function awayStep(m, p) {
  const pl = m.players[p];
  if (pl.sub) { cpuStep(m, 2); return; }
  if (m.awayTimer) return;
  m.awayTimer = setTimeout(() => {
    m.awayTimer = null;
    if (match !== m || !m.alive || pl.here !== false) return;
    pl.sub = true;
    toast(esc(pl.nm) + ' さんの番はCPUが代わりに打ちます', 'warn', 3200);
    sendUpdates(m, []);
    renderAll(); afterIdle();
  }, TEST ? 1500 : 9000);
  renderPanel();
}

/* ================================================================ presenter */
function enqueue(m, finalView, ev, reset) {
  queue.push({ m, finalView, ev, reset });
  if (!presenting) pump();
}
async function pump() {
  presenting = true; renderPanel(); renderTags();
  while (queue.length) {
    const u = queue.shift();
    if (u.m !== match) continue;
    try { await presentOne(u); } catch (e) { console.error(e); view = u.finalView; badCard = null; scene.setView(view, { instant: true }); }
  }
  presenting = false;
  renderAll();
  afterIdle();
}
async function presentOne(u) {
  if (!view || u.reset) { view = u.finalView; badCard = null; scene.setView(view, { instant: true }); renderAll(); return; }
  let v = view;
  for (const e of u.ev) {
    const before = v;
    const hints = hintsFor(e, v);
    v = E.reduceView(v, e);
    view = v;
    if (e.k === 'fail' || e.k === 'trio') badCard = null;
    scene.setView(v, hints);
    renderTags(); renderHud(); renderDock(); renderPanel();
    await wait(effectFor(e, before, v));
  }
  badCard = null;
  view = u.finalView;
  scene.setView(view, {});
  renderAll();
  if (view.phase === 'over') await showOver();
}
function hintsFor(e, v) {
  const h = {};
  if (e.k === 'reveal') {
    if (e.src === 'hand' && e.who !== v.me) h.from = { [e.c]: { seat: e.who, end: e.end } };
    else if (e.src === 'field') h.from = { [e.c]: { field: e.i } };
  } else if (e.k === 'fail') {
    h.to = {};
    const cnt = {};
    v.chal.forEach((x) => {
      if (x.src === 'field') h.to[x.c] = { field: x.i };
      else if (x.who !== v.me) { const key = x.who + x.end, k = cnt[key] || 0; cnt[key] = k + 1; h.to[x.c] = { seat: x.who, end: x.end, k }; }
    });
  }
  return h;
}
function whereText(x, v) {
  if (x.src === 'field') return '場' + (x.i + 1);
  return (x.who === v.me ? 'あなた' : esc(nameOf(x.who))) + 'の' + (x.end === 'min' ? '小' : '大');
}
function effectFor(e, before, after) {
  const mine = e.p === after.me;
  switch (e.k) {
    case 'reveal': {
      sfx.play('flip');
      const n = after.chal.length, first = E.num(after.chal[0].c);
      if (n >= 2 && e.v !== first) {     // it broke: leave it on show for a moment
        badCard = e.c; renderPanel();
        scene.shake(e.c);
        setTimeout(() => sfx.play('fail'), 120 / prefs.speed);
        return 1.35;
      }
      if (n === 2) { sfx.play('match'); return 0.72; }
      return n === 1 ? 0.62 : 0.45;
    }
    case 'fail': {
      sfx.play('back');
      const last = after.last;
      if (mine) stamp('ざんねん', 'no', esc(String(last.v)) + ' のあとに ' + esc(String(last.bad)));
      else toast(nameHtml(e.p) + '：' + mini(last.v, 'sm') + ' のあと ' + mini(last.bad, 'sm') + ' で失敗', '', 2400);
      return 0.62;
    }
    case 'trio': {
      scene.celebrate(e.p, e.v);
      const vals = E.trioVals(after, e.p), win = E.winHow(vals);
      sfx.play(e.v === 7 ? 'seven' : 'trio');
      const label = e.v === 7 ? 'セブン！' : 'トリオ！';
      const sub = mini(e.v, 'sm') + ' を3枚そろえた' + (win ? '' : '（' + vals.length + '組目）');
      if (mine) stamp(label, 'yes', sub); else stamp(nameOf(e.p) + ' ' + label, e.v === 7 ? 'gold' : 'info', sub);
      return 1.35;
    }
    case 'turn': if (e.p === after.me) sfx.play('turn'); return 0.12;
    case 'over': return 0.35;
  }
  return 0.1;
}
async function showOver() {
  const v = view, m = match;
  if (!m) return;
  const won = v.winner === v.me;
  scene.winner(v.winner);
  if (won) { stamp('勝利！', 'yes', esc(E.WIN_TEXT[v.win] || '')); sfx.play('win'); }
  else { stamp(nameOf(v.winner) + 'の勝ち', 'no', esc(E.WIN_TEXT[v.win] || '')); sfx.play('lose'); }
  renderHud();
  await wait(1.7);
  if (match === m && !$('#layer .sheet')) openResult();
}

/* ================================================================ the action bar and the table highlights */
function myTurn() {
  return !!(view && match && match.alive && view.phase === 'play' && view.turn === view.me && !presenting && !(match.mode === 'guest' && match.waiting));
}
function tableHighlights() {
  if (!scene) return;
  const hl = {};
  if (!view || !match) { scene.setHighlights(hl); return; }
  const v = view;
  hl.turn = v.phase === 'play' ? v.turn : -1;
  if (v.chal.length) {
    const first = E.num(v.chal[0].c);
    hl.match = v.chal.map((x) => x.c).filter((c) => E.num(c) === first);
  }
  if (badCard != null) hl.bad = badCard;
  if (myTurn()) {
    hl.mine = true;
    hl.field = v.field.map((c, i) => (c === -1 ? i : -1)).filter((i) => i >= 0);
    hl.ends = [];
    for (let p = 0; p < v.n; p++) if (v.counts[p] > 0) { hl.ends.push({ who: p, end: 'min' }); if (v.counts[p] > 1) hl.ends.push({ who: p, end: 'max' }); }
  }
  scene.setHighlights(hl);
}
function renderPanel() {
  const P = $('#prompt'), A = $('#actions');
  A.innerHTML = '';
  tableHighlights();
  if (!match || !view) { P.innerHTML = ''; return; }
  const m = match, v = view;
  if (v.phase === 'over') {
    P.innerHTML = '<div class="pt">' + (v.winner === v.me ? '勝ちました！' : esc(nameOf(v.winner)) + 'の勝ちです') + '</div>';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm primary'; b.textContent = '結果を見る';
    b.onclick = () => { sfx.play('tap'); openResult(); }; A.appendChild(b);
    return;
  }
  const tg = E.target(v), ch = chalHtml(v);
  let text;
  if (v.turn !== v.me) {
    const pl = m.players[v.turn];
    const away = pl && pl.kind === 'guest' && pl.here === false && !pl.sub ? '<small>接続が切れています。戻らなければCPUが代わりに打ちます</small>' : '';
    text = '<span class="thinking">' + nameHtml(v.turn) + 'の番</span>' + (tg.v ? '<small>' + tg.v + ' をあと' + tg.need + '枚さがしています</small>' : away);
  } else if (m.mode === 'guest' && m.waiting) text = '<span class="thinking">送信中</span>';
  else if (!tg.v) text = '<b>あなたの番</b>：めくるカードを選んでください<small>場札か、だれかの手札の 小／大（ハシッコ）</small>';
  else text = (badCard != null ? 'ちがう数字…' : '<b>' + tg.v + '</b> をあと<b>' + tg.need + '</b>枚') + '<small>ちがう数字が出たら失敗</small>';
  P.innerHTML = '<div class="pt">' + text + '</div>' + ch;
}
/* the cards of the challenge on the table, with where each one came from */
function chalHtml(v) {
  if (!v.chal.length) return '';
  const first = E.num(v.chal[0].c);
  const cells = v.chal.map((x) => {
    const val = E.num(x.c), bad = val !== first;
    return '<span class="cc' + (bad ? ' bad' : '') + '">' + mini(val) + '<i>' + whereText(x, v) + '</i></span>';
  });
  if (!v.chal.some((x) => E.num(x.c) !== first)) for (let k = v.chal.length; k < 3; k++) cells.push('<span class="cc"><span class="mc slot">?</span><i>&nbsp;</i></span>');
  return '<div class="chal">' + cells.join('') + '</div>';
}
function renderHud() {
  const chip = $('#turnChip'), tx = $('#turnText');
  if (!view || !match) { tx.textContent = '準備中'; chip.className = 'chip'; return; }
  const v = view;
  if (v.phase === 'over') { tx.textContent = '対戦終了'; chip.className = 'chip'; chip.style.removeProperty('--pc'); }
  else {
    tx.textContent = v.turn === v.me ? 'あなたの番' : nameOf(v.turn) + 'の番';
    chip.className = 'chip ' + (v.turn === v.me ? 'mine' : 'theirs');
    chip.style.setProperty('--pc', SEAT_COLORS[v.turn % SEAT_COLORS.length]);
  }
  const clutch = v.phase === 'play' && v.trios.some((ts) => ts.length >= 2);
  bgm.setMood(clutch ? 'clutch' : 'game');
  $('#btnSound').classList.toggle('off', !prefs.sound);
}
function renderAll() { renderHud(); renderPanel(); renderTags(); renderDock(); }

/* the players: hand size, trios, what would make them win, and the 小／大 buttons */
function renderDock() {
  const D = $('#dock');
  if (!view || !match) { D.innerHTML = ''; return; }
  const v = view, taken = E.takenOf(v.trios), can = myTurn();
  const order = []; for (let k = 0; k < v.n; k++) order.push((v.me + k) % v.n);
  const rows = order.map((p) => {
    const vals = E.trioVals(v, p);
    const wins = E.winNumbers(vals, v.top, taken);
    const trios = vals.length ? vals.map((x) => trioMini(x)).join('') : '<span class="none">トリオなし</span>';
    const winTxt = vals.length >= 2 ? 'どれでも' : wins.map((x) => mini(x, 'xs')).join('');
    const sub = whoSub(p);
    const cnt = v.counts[p], dis = !can || cnt === 0 ? ' disabled' : '';
    return '<div class="pl' + (v.turn === p && v.phase === 'play' ? ' turn' : '') + (p === v.me ? ' me' : '') + '" style="--pc:' + SEAT_COLORS[p % SEAT_COLORS.length] + '">' +
      '<span class="av">' + esc((nameOf(p) || '?').slice(0, 1)) + '</span>' +
      '<span class="nm"><b>' + esc(nameOf(p)) + '</b><small>手札 ' + cnt + (v.front[p].length ? '＋' + v.front[p].length : '') + (sub ? '・' + esc(sub) : '') + '</small></span>' +
      '<span class="tr">' + trios + '<span class="wn" title="この数字のトリオで勝ち">' + (wins.length || vals.length >= 2 ? '<em>勝ち</em>' + winTxt : '') + '</span></span>' +
      '<span class="ends"><button type="button" data-w="' + p + '" data-e="min"' + dis + ' aria-label="' + esc(nameOf(p)) + 'の小さい方">小</button><button type="button" data-w="' + p + '" data-e="max"' + (cnt > 1 ? dis : ' disabled') + ' aria-label="' + esc(nameOf(p)) + 'の大きい方">大</button></span>' +
      '</div>';
  });
  D.innerHTML = rows.join('') + '<div class="dock-f"><button type="button" class="link" data-log>これまでの記録</button></div>';
  D.querySelectorAll('.ends button').forEach((b) => { b.onclick = () => { sfx.play('tap'); act({ t: 'hand', who: Number(b.dataset.w), end: b.dataset.e }); }; });
  D.querySelector('[data-log]').onclick = openLog;
}

/* ================================================================ labels on the table */
const tags = { seats: [], ends: [] };
function buildTags() {
  const box = $('#tags'); box.innerHTML = '';
  tags.seats = []; tags.ends = [];
  if (!view) return;
  for (let p = 0; p < view.n; p++) {
    const t = document.createElement('div'); t.className = 'tag who'; box.appendChild(t); tags.seats.push(t);
    const a = document.createElement('button'), b = document.createElement('button');
    a.type = b.type = 'button'; a.className = b.className = 'tag end'; a.textContent = '小'; b.textContent = '大';
    a.onclick = () => { sfx.play('tap'); act({ t: 'hand', who: p, end: 'min' }); };
    b.onclick = () => { sfx.play('tap'); act({ t: 'hand', who: p, end: 'max' }); };
    box.appendChild(a); box.appendChild(b);
    tags.ends.push({ min: a, max: b });
  }
}
function renderTags() {
  if (!view || !tags.seats.length) return;
  const v = view, can = myTurn();
  for (let p = 0; p < v.n; p++) {
    const t = tags.seats[p];
    if (p === v.me) { t.hidden = true; }
    else {
      t.hidden = false;
      const sub = whoSub(p);
      t.innerHTML = '<span class="av" style="background:' + SEAT_COLORS[p % SEAT_COLORS.length] + '">' + esc((nameOf(p) || '?').slice(0, 1)) + '</span>' + esc(nameOf(p)) +
        '<span class="st">' + v.counts[p] + '枚' + (v.trios[p].length ? '・トリオ' + v.trios[p].length : '') + (sub && sub.indexOf('CPU') !== 0 ? '・' + esc(sub) : '') + '</span>';
      t.classList.toggle('turn', v.turn === p && v.phase === 'play');
      t.style.setProperty('--pc', SEAT_COLORS[p % SEAT_COLORS.length]);
    }
    const e = tags.ends[p];
    e.min.hidden = !can || v.counts[p] < 1;
    e.max.hidden = !can || v.counts[p] < 2;
    e.min.classList.toggle('mid', p !== v.me); e.max.classList.toggle('mid', p !== v.me);
  }
}
function placeTags() {
  if (!scene || !view || !tags.seats.length) return;
  const a = scene.anchors(), W = $('#stageWrap').clientWidth;
  const put = (el, p, clampX) => {
    if (!el || !p) return;
    let x = p[0];
    if (clampX && !el.hidden) { const hw = el.offsetWidth / 2 + 4; x = Math.max(hw, Math.min(W - hw, x)); }
    el.style.left = x.toFixed(1) + 'px'; el.style.top = Math.max(clampX ? el.offsetHeight + 2 : 0, p[1]).toFixed(1) + 'px';
  };
  for (let p = 0; p < view.n && p < tags.seats.length; p++) {
    put(tags.seats[p], a.seats[p], true);
    const e = a.ends[p] || {};
    let mn = e.min, mx = e.max;
    if (mn && mx && Math.abs(mn[0] - mx[0]) < 40 && Math.abs(mn[1] - mx[1]) < 30) { const c = (mn[0] + mx[0]) / 2; mn = [c - 20, mn[1]]; mx = [c + 20, mx[1]]; }
    put(tags.ends[p].min, mn); put(tags.ends[p].max, mx);
  }
}
/* ================================================================ taps on the table */
function onTap(x, y) {
  if (!scene || !match || !view) return;
  sfx.unlock();
  const hit = scene.pick(x, y);
  if (!myTurn()) {
    if (hit.seat != null && hit.seat !== view.me) toast(nameHtml(hit.seat) + '：手札 ' + view.counts[hit.seat] + '枚', '', 1600);
    return;
  }
  if (hit.field != null) { act({ t: 'field', i: hit.field }); return; }
  if (hit.end) { act({ t: 'hand', who: hit.end.who, end: hit.end.end }); return; }
  if (hit.mid != null) { sfx.play('deny'); toast('出せるのは手札のハシッコ（いちばん小さい・大きいカード）だけです', 'warn', 3000); return; }
  if (hit.faceUp != null) { sfx.play('deny'); toast('そのカードはもうめくってあります', 'warn'); }
}
function bindStage() {
  const el = $('#stage');
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  el.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 12) return;
    const r = el.getBoundingClientRect();
    onTap(e.clientX - r.left, e.clientY - r.top);
  });
  el.addEventListener('pointercancel', () => { down = null; });
}

/* ================================================================ sheets */
function openRules() {
  const tpl = $('#tplRules').content.cloneNode(true);
  const L = $('#layer'); L.innerHTML = ''; L.appendChild(tpl);
  L.onclick = (e) => { if (e.target === L || e.target.closest('[data-close]')) closeLayer(); };
  L.querySelectorAll('[data-mini]').forEach((el) => { el.innerHTML = el.dataset.mini.split(',').map((x) => (x === '?' ? '<span class="mc back"></span>' : mini(Number(x)))).join(''); });
  L.querySelectorAll('[data-trio]').forEach((el) => { el.insertAdjacentHTML('afterbegin', '<span class="hand">' + el.dataset.trio.split(',').map((x) => trioMini(Number(x))).join('<span class="plus">＋</span>') + '</span>'); });
}
function openMenu() {
  const inGame = !!(match && match.alive);
  const el = openLayer(sheet('メニュー', '<div class="menu-list">' +
    '<button class="btn" data-m="rules">あそびかた</button>' +
    (inGame ? '<button class="btn" data-m="log">これまでの記録</button>' : '') +
    '<button class="btn" data-m="settings">設定</button>' +
    (inGame ? '<button class="btn danger" data-m="quit">タイトルへ戻る</button>' : '') +
    '<button class="btn ghost" data-m="home">PLAYROOMへ戻る</button></div>'));
  el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    const k = b.dataset.m;
    if (k === 'rules') openRules();
    else if (k === 'log') openLog();
    else if (k === 'settings') openSettings();
    else if (k === 'quit') confirmQuit();
    else if (k === 'home') { if (match && match.alive && view && view.phase === 'play') confirmQuit(true); else location.href = '../games/'; }
  });
}
function confirmQuit(home) {
  const online = match && match.mode !== 'cpu' && view && view.phase !== 'over';
  const where = home ? 'PLAYROOMに戻りますか' : 'タイトルに戻りますか';
  const el = openLayer(sheet(home ? 'PLAYROOMへ戻る' : 'タイトルへ戻る', '<p>ゲームをやめて' + where + '？' + (online ? '（部屋との接続も切れます）' : '') + '</p><div class="row"><button class="btn ghost" data-close>続ける</button><button class="btn danger" id="qYes">やめる</button></div>'));
  el.querySelector('#qYes').onclick = () => { closeLayer(); if (home) { if (lobby) closeLobby(); location.href = '../games/'; } else quitToTitle(); };
}
function openSettings() {
  const seg = (id, opts, cur) => '<div class="seg" id="' + id + '">' + opts.map((o) => '<button data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>').join('') + '</div>';
  const el = openLayer(sheet('設定',
    '<div class="field"><span>音（効果音とBGM）</span>' + seg('sSound', [['1', 'オン'], ['0', 'オフ']], prefs.sound ? 1 : 0) + '</div>' +
    '<div class="field"><span>BGM</span>' + seg('sBgm', [['1', 'オン'], ['0', 'オフ']], prefs.bgm ? 1 : 0) + '</div>' +
    '<div class="field"><span>テーブルの色</span>' + seg('sFelt', [['teal', 'あお緑'], ['green', 'みどり'], ['wine', 'ワイン']], prefs.felt) + '</div>' +
    '<div class="field"><span>演出の速さ</span>' + seg('sSpeed', [['0.7', 'ゆっくり'], ['1', 'ふつう'], ['1.7', 'はやい']], prefs.speed) + '</div>' +
    '<div class="field"><span>画質</span>' + seg('sQuality', [['high', 'きれい'], ['low', '軽い']], prefs.quality) + '</div>' +
    '<p class="note">「ゆっくり」にすると、めくったカードを覚える時間が長くなります。</p>'));
  const bind = (id, fn) => el.querySelectorAll('#' + id + ' button').forEach((b) => b.onclick = () => {
    el.querySelectorAll('#' + id + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fn(b.dataset.v);
  });
  bind('sSound', (v) => { prefs.sound = v === '1'; store.set('sound', prefs.sound); audioOn(); bgm.apply(); renderHud(); });
  bind('sBgm', (v) => { prefs.bgm = v === '1'; store.set('bgm', prefs.bgm); audioOn(); bgm.apply(); });
  bind('sFelt', (v) => { prefs.felt = v; store.set('felt', v); scene.setFelt(v); });
  bind('sSpeed', (v) => { prefs.speed = Number(v); store.set('speed', prefs.speed); scene.speed = prefs.speed; });
  bind('sQuality', (v) => { prefs.quality = v; store.set('quality', v); scene.setQuality(v); onResize(); });
}
/* every challenge so far, newest first: who, what was shown from where, and how it ended */
function openLog() {
  if (!view || !match) return;
  const v = view;
  const where = (r) => (r.i != null ? '場' + (r.i + 1) : esc(nameOf(r.w)) + 'の' + (r.e === 0 ? '小' : '大'));
  const rows = v.log.slice().reverse().map((L) => '<div class="lg' + (L.ok ? ' ok' : '') + '"><span class="lt">' + nameHtml(L.p) + '</span><span class="lr">' +
    L.r.map((r) => '<span class="lc">' + mini(r.v, 'sm') + '<i>' + where(r) + '</i></span>').join('') + '</span><span class="lo">' + (L.ok ? 'トリオ' : '失敗') + '</span></div>');
  openLayer(sheet('これまでの記録', (rows.length ? rows.join('') : '<p class="note">まだだれもめくっていません。</p>') +
    '<p class="note">「場3」は場札の左上から数えて3枚目、「小／大」はその人の手札のいちばん小さい／大きいカードです。覚えるのが楽しいゲームなので、見るのはほどほどに。</p>'));
}
function openResult() {
  if (!view || !match) return;
  const v = view, m = match;
  const won = v.winner === v.me;
  const order = []; for (let k = 0; k < v.n; k++) order.push((v.winner + k) % v.n);
  const series = m.mode === 'guest' ? (m.meta && m.meta.series) : m.series;
  const rows = order.map((p) => '<div class="rs' + (p === v.winner ? ' win' : '') + '" style="--pc:' + SEAT_COLORS[p % SEAT_COLORS.length] + '"><span class="av">' + esc(nameOf(p).slice(0, 1)) + '</span><b>' + esc(nameOf(p)) + '</b>' +
    '<span class="tr">' + (v.trios[p].length ? v.trios[p].map((t) => trioMini(t.v)).join('') : '<span class="none">トリオなし</span>') + '</span>' +
    (series && series.games ? '<span class="wn">' + series.wins[p] + '勝</span>' : '') + '</div>');
  const canAgain = m.mode === 'cpu' || (m.mode === 'host' && lobby);
  const body = '<p class="result-big ' + (won ? 'win' : 'lose') + '">' + (won ? '勝利！' : esc(nameOf(v.winner)) + 'の勝ち') + '</p>' +
    '<p style="text-align:center;margin:0">' + esc(E.WIN_TEXT[v.win] || '') + '（' + v.turnNo + '手番目）</p>' +
    '<div class="rlist">' + rows.join('') + '</div>' +
    (series && series.games > 1 ? '<p class="note" style="text-align:center">通算 ' + series.games + '戦の勝ち数</p>' : '') +
    '<div class="row">' + (canAgain ? '<button class="btn primary" id="rAgain">もう一度</button>' : m.mode === 'guest' ? '<p class="note" style="flex:1 1 100%;text-align:center">ホストが次のゲームを始めるのを待っています</p>' : '') +
    (m.mode === 'host' && lobby ? '<button class="btn" id="rLobby">部屋に戻る</button>' : '') +
    '<button class="btn ghost" id="rTable">盤面を見る</button><button class="btn" id="rTitle">タイトルへ</button></div>';
  const el = openLayer(sheet('結果', body));
  const again = el.querySelector('#rAgain');
  if (again) again.onclick = () => { closeLayer(); if (m.mode === 'cpu') startSolo(true); else if (lobby) startHostMatch(lobby, true); };
  const lob = el.querySelector('#rLobby');
  if (lob) lob.onclick = () => { closeLayer(); hostBackToLobby(); };
  el.querySelector('#rTable').onclick = closeLayer;
  el.querySelector('#rTitle').onclick = () => { closeLayer(); quitToTitle(); };
}

/* ================================================================ screens */
const SCREENS = ['#scrTitle', '#scrSolo', '#scrOnline', '#scrLobby'];
function hideScreens() { SCREENS.forEach((s) => { $(s).hidden = true; }); }
function showScreen(id) { hideScreens(); $(id).hidden = false; }
function leaveGame() {
  if (match) { match.alive = false; clearTimeout(match.awayTimer); }
  match = null; queue.length = 0; presenting = false; view = null; badCard = null;
  closeLayer();
  document.body.classList.remove('ingame'); onResize();
  bgm.setMood('title');
}
function quitToTitle() {
  leaveGame();
  if (lobby) { closeLobby(); }
  resetOnlineUI();
  attractTable();
  showScreen('#scrTitle');
}
/* a frozen game for the title screen */
function attractTable() {
  if (!scene) return;
  const s = E.newGame({ n: 4, seed: 20261015, first: 1 });
  const v = E.viewFor(s, 0);
  // make it look like a game well under way
  const tk = (num, k) => (num - 1) * 3 + k;
  v.trios[1] = [{ v: 3, cards: [tk(3, 0), tk(3, 1), tk(3, 2)], t: 2 }];
  v.trios[0] = [{ v: 11, cards: [tk(11, 0), tk(11, 1), tk(11, 2)], t: 4 }];
  v.hand = [tk(1, 0), tk(2, 0), tk(5, 0), tk(7, 0), tk(9, 1), tk(12, 0)];
  v.counts = [6, 5, 7, 6];
  v.front[2] = [tk(7, 1)];
  v.field = v.field.map((c, i) => (i === 2 ? tk(7, 2) : i === 6 ? null : -1));
  v.chal = [{ src: 'hand', who: 2, end: 'max', c: tk(7, 1) }, { src: 'field', i: 2, c: tk(7, 2) }];
  v.turn = 1;
  scene.clear();
  scene.setView(v, { instant: true });
  scene.setHighlights({ match: [tk(7, 1), tk(7, 2)], turn: 1 });
  scene.setAttract(true);
}

/* ================================================================ online: host */
function netErr(e) {
  const c = e && e.code;
  if (c === 'lib') return '通信ライブラリを読み込めませんでした。通信状況を確認してください。';
  if (c === 'notfound') return 'その部屋が見つかりません。コードを確かめてください。';
  if (c === 'taken') return '部屋を作れませんでした。もう一度試してください。';
  return '接続できませんでした。少し待ってからもう一度試してください。';
}
function onlineErr(msg) { const e = $('#onErr'); e.textContent = msg || ''; e.hidden = !msg; }
function resetOnlineUI() { $('#onCreate').disabled = false; $('#onJoin').disabled = false; onlineErr(''); }
function rememberName() { const n = N.cleanName($('#onName').value); prefs.name = n; store.set('name', n); return n; }
function closeLobby() {
  const L = lobby;
  if (!L) return;
  lobby = null;
  try { if (L.role === 'host') L.link.broadcast({ k: 'bye' }); else L.link.send({ k: 'bye' }); } catch (e) { /* ignore */ }
  L.link.close();
}
async function hostRoom() {
  onlineErr('');
  const name = rememberName();
  if (!name) { onlineErr('名前を入れてください'); $('#onName').focus(); return; }
  $('#onCreate').disabled = true;
  const link = N.makeHost(NETKIND);
  let code = null, lastErr = null;
  for (let i = 0; i < 4 && !code; i++) {
    const c = N.makeCode();
    try { await link.host(c); code = c; } catch (e) { lastErr = e; if (e.code !== 'taken') break; }
  }
  if (!code) { $('#onCreate').disabled = false; onlineErr(netErr(lastErr)); return; }
  const L = lobby = { role: 'host', link, code, seats: [{ kind: 'host', nm: name, cid: CID }] };
  link.on('msg', (cid, msg) => onHostMsg(L, cid, msg));
  link.on('leave', (cid) => onGuestGone(L, cid));
  showLobby();
}
function lobbySeats(L) { return L.seats.map((s) => ({ nm: s.nm, kind: s.kind, level: s.level || 0, here: s.here !== false })); }
function pushLobby(L) {
  const seats = lobbySeats(L);
  L.seats.forEach((s, i) => { if (s.kind === 'guest') L.link.send(s.cid, { k: 'lobby', seats, you: i, code: L.code }); });
  if (lobby === L && !match) renderLobby({ seats, you: 0, code: L.code, host: true });
}
function onHostMsg(L, cid, msg) {
  if (lobby !== L) return;
  if (msg.k === 'hello') {
    if (msg.v !== N.PROTOCOL) { L.link.send(cid, { k: 'old' }); return; }
    const nm = N.cleanName(msg.nm) || 'ゲスト';
    const m = match && match.mode === 'host' && match.lobby === L && match.alive ? match : null;
    if (m) {
      const p = m.players.findIndex((pl) => pl.kind === 'guest' && pl.cid === cid);
      if (p < 0) { L.link.send(cid, { k: 'busy' }); L.link.drop(cid); return; }
      const pl = m.players[p];
      pl.here = true; pl.sub = false; clearTimeout(m.awayTimer); m.awayTimer = null;
      L.link.send(cid, { k: 'start', view: E.viewFor(m.s, p), meta: metaOf(m), resume: true });
      sendUpdates(m, []);
      toast(esc(pl.nm) + ' さんが戻ってきました', 'me');
      renderAll();
      return;
    }
    const seat = L.seats.find((s) => s.kind === 'guest' && s.cid === cid);
    if (seat) { seat.nm = nm; seat.here = true; }
    else if (L.seats.length >= MAX_SEATS) { L.link.send(cid, { k: 'full' }); L.link.drop(cid); return; }
    else { L.seats.push({ kind: 'guest', nm, cid, here: true }); toast(esc(nm) + ' さんが入室しました', 'me'); sfx.play('match'); }
    pushLobby(L);
    return;
  }
  if (msg.k === 'act') {
    const m = match;
    if (!m || m.mode !== 'host' || m.lobby !== L || !m.alive) return;
    const p = m.players.findIndex((pl) => pl.kind === 'guest' && pl.cid === cid);
    if (p < 0) return;
    const a = msg.a && typeof msg.a === 'object' ? msg.a : null;
    if (!a || m.s.turn !== p || msg.ply !== m.s.ply || m.players[p].sub) { L.link.send(cid, { k: 'err', err: 'stale', view: E.viewFor(m.s, p), meta: metaOf(m) }); return; }
    const r = E.apply(m.s, { t: a.t, who: a.who, end: a.end, i: a.i, p });
    if (!r.ok) { L.link.send(cid, { k: 'err', err: r.err, view: E.viewFor(m.s, p), meta: metaOf(m) }); return; }
    deliver(m, r.ev);
    return;
  }
  if (msg.k === 'bye') onGuestGone(L, cid);
}
function onGuestGone(L, cid) {
  if (lobby !== L) return;
  const m = match && match.mode === 'host' && match.lobby === L && match.alive ? match : null;
  if (m) {
    const pl = m.players.find((x) => x.kind === 'guest' && x.cid === cid);
    if (pl && pl.here !== false) {
      pl.here = false;
      if (m.s.phase === 'play') toast(esc(pl.nm) + ' さんの接続が切れました', 'warn', 3200);
      sendUpdates(m, []);
      renderAll(); afterIdle();
    }
    return;
  }
  const i = L.seats.findIndex((s) => s.kind === 'guest' && s.cid === cid);
  if (i > 0) { const nm = L.seats[i].nm; L.seats.splice(i, 1); toast(esc(nm) + ' さんが退出しました', 'warn'); pushLobby(L); }
}
function addCpu(L) {
  if (L.seats.length >= MAX_SEATS) return;
  const used = L.seats.map((s) => s.nm);
  const nm = CPU_NAMES.find((x) => !used.includes(x)) || 'CPU';
  L.seats.push({ kind: 'cpu', nm, level: prefs.level || 2 });
  pushLobby(L);
}
function startHostMatch(L, again) {
  if (lobby !== L) return;
  const prev = again && match && match.mode === 'host' && match.lobby === L ? match : null;
  if (prev) {
    // the same table again; players who left are dropped
    L.seats = [L.seats[0]].concat(prev.players.filter((pl, p) => p !== prev.me && (pl.kind === 'cpu' || pl.here !== false)).map((pl) => (pl.kind === 'cpu' ? { kind: 'cpu', nm: pl.nm, level: pl.cpu } : { kind: 'guest', nm: pl.nm, cid: pl.cid, here: true })));
    if (L.seats.length < 2) L.seats.push({ kind: 'cpu', nm: CPU_NAMES[0], level: 2 });
  }
  const seats = L.seats.slice(0, MAX_SEATS);
  if (seats.length < 2) return;
  const n = seats.length;
  const players = seats.map((s) => (s.kind === 'host' ? { nm: s.nm, kind: 'me', cpu: 0 } : s.kind === 'cpu' ? { nm: s.nm, kind: 'cpu', cpu: s.level || 2, mind: { seed: mindSeed() } } : { nm: s.nm, kind: 'guest', cpu: 0, cid: s.cid, here: true }));
  const series = prev && prev.players.length === n ? prev.series : newSeries(n);
  const s = E.newGame({ n, first: nextFirst(series, n) });
  const m = { mode: 'host', id: ++matchSeq, s, me: 0, players, series, alive: true, lobby: L, link: L.link, cpuBusy: false };
  beginMatch(m, E.viewFor(s, 0));
  const meta = metaOf(m);
  players.forEach((pl, p) => { if (pl.kind === 'guest') L.link.send(pl.cid, { k: 'start', view: E.viewFor(s, p), meta }); });
}
function hostBackToLobby() {
  const L = lobby, m = match;
  if (!L || L.role !== 'host') return;
  if (m && m.lobby === L) {
    L.seats = [L.seats[0]].concat(m.players.filter((pl, p) => p !== m.me && (pl.kind === 'cpu' || pl.here !== false)).map((pl) => (pl.kind === 'cpu' ? { kind: 'cpu', nm: pl.nm, level: pl.cpu } : { kind: 'guest', nm: pl.nm, cid: pl.cid, here: true })));
  }
  leaveGame();
  attractTable();
  showLobby();
}
function showLobby() {
  const L = lobby;
  if (!L) return;
  showScreen('#scrLobby');
  if (L.role === 'host') pushLobby(L);
  else if (L.last) renderLobby(L.last);
}
function renderLobby(d) {
  const L = lobby;
  if (!L) return;
  const host = L.role === 'host';
  $('#lobCode').textContent = d.code || L.code;
  $('#lobNote').textContent = host ? '友だちにこのコードか招待リンクを送ってください。2〜5人で遊べます（CPUも入れられます）。' : 'ホストが始めるのを待っています…';
  $('#lobSeats').innerHTML = d.seats.map((s, i) => '<div class="seat" style="--pc:' + SEAT_COLORS[i % SEAT_COLORS.length] + '"><span class="dot"></span><span class="nm">' + esc(s.nm) + (i === d.you ? '（あなた）' : '') + '</span>' +
    '<span class="who">' + (s.kind === 'host' ? 'ホスト' : s.kind === 'cpu' ? 'CPU' : 'ゲスト') + '</span>' +
    (host && s.kind === 'cpu' ? '<select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3].map((lv) => '<option value="' + lv + '"' + (lv === s.level ? ' selected' : '') + '>' + LEVEL_NAME[lv] + '</option>').join('') + '</select>' : s.kind === 'cpu' ? '<span class="who">' + LEVEL_NAME[s.level || 2] + '</span>' : '') +
    (host && i > 0 ? '<button class="x" data-rm="' + i + '" aria-label="外す">✕</button>' : '') + '</div>').join('');
  $('#lobRule').textContent = SETUP_NOTE[d.seats.length] || '2人以上で始められます。';
  $('#lobAddCpu').hidden = !host || d.seats.length >= MAX_SEATS;
  $('#lobStart').hidden = !host;
  $('#lobStart').disabled = d.seats.length < 2;
  $('#lobInvite').hidden = !host;
  if (host) {
    $('#lobSeats').querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.rm), s = L.seats[i];
      if (!s) return;
      L.seats.splice(i, 1);
      if (s.kind === 'guest') { L.link.send(s.cid, { k: 'kick' }); L.link.drop(s.cid); }
      pushLobby(L);
    });
    $('#lobSeats').querySelectorAll('[data-lv]').forEach((sel) => sel.onchange = () => { const s = L.seats[Number(sel.dataset.lv)]; if (s) { s.level = Number(sel.value); pushLobby(L); } });
  }
}

/* ================================================================ online: guest */
async function joinRoom(codeArg) {
  onlineErr('');
  const name = rememberName();
  if (!name) { onlineErr('名前を入れてください'); $('#onName').focus(); return; }
  const code = N.cleanCode(codeArg || $('#onCode').value);
  if (code.length !== 4) { onlineErr('4文字の部屋コードを入れてください'); return; }
  $('#onJoin').disabled = true;
  const link = N.makeGuest(NETKIND);
  try { await link.join(code); } catch (e) { $('#onJoin').disabled = false; onlineErr(netErr(e)); return; }
  const L = lobby = { role: 'guest', link, code, last: null };
  link.on('msg', (msg) => onGuestMsg(L, msg));
  link.on('close', () => onHostGone(L));
  link.send({ k: 'hello', cid: CID, nm: name, v: N.PROTOCOL });
  showScreen('#scrLobby');
  renderLobby({ seats: [{ nm: name, kind: 'guest', here: true }], you: 0, code });
  $('#lobNote').textContent = '接続しました。ホストからの返事を待っています…';
}
function onGuestMsg(L, msg) {
  if (lobby !== L) return;
  if (msg.k === 'full') { failGuest(L, 'この部屋はもういっぱいです'); return; }
  if (msg.k === 'busy') { failGuest(L, 'この部屋はいま対戦中です。終わってからもう一度入ってください'); return; }
  if (msg.k === 'old') { failGuest(L, 'ホストのページと版がちがいます。両方とも再読み込みしてください'); return; }
  if (msg.k === 'kick') { failGuest(L, 'ホストが席を外しました'); return; }
  if (msg.k === 'bye') { onHostGone(L); return; }
  if (msg.k === 'lobby') {
    L.last = { seats: msg.seats, you: msg.you, code: msg.code };
    if (match && match.lobby === L) { if (view && view.phase === 'over' && !$('#layer .sheet')) { /* still looking at the table */ } leaveGame(); attractTable(); }
    showScreen('#scrLobby'); renderLobby(L.last);
    return;
  }
  if (msg.k === 'start' && msg.view) {
    const v = msg.view;
    const m = { mode: 'guest', id: ++matchSeq, me: v.me, players: playersFromMeta(msg.meta, v.me), meta: msg.meta, alive: true, lobby: L, link: L.link, waiting: false };
    beginMatch(m, v);
    if (msg.resume) toast('ゲームに戻りました', 'me');
    return;
  }
  const m = match;
  if (!m || m.mode !== 'guest' || m.lobby !== L) return;
  if (msg.k === 'upd' && msg.view) {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.meta) { m.meta = msg.meta; m.players = playersFromMeta(msg.meta, m.me); }
    enqueue(m, msg.view, Array.isArray(msg.ev) ? msg.ev : []);
    if (!msg.ev || !msg.ev.length) renderAll();
    return;
  }
  if (msg.k === 'err') {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.err !== 'stale') toast('その手は打てません', 'warn');
    if (msg.meta) { m.meta = msg.meta; m.players = playersFromMeta(msg.meta, m.me); }
    if (msg.view) enqueue(m, msg.view, [], true); else renderAll();
  }
}
function failGuest(L, text) {
  if (lobby !== L) return;
  lobby = null; L.link.close();
  if (match && match.lobby === L) leaveGame();
  attractTable();
  showScreen('#scrOnline'); resetOnlineUI(); onlineErr(text);
}
function onHostGone(L) {
  if (lobby !== L || L.gone) return;
  L.gone = true;
  if (match && match.lobby === L && view && view.phase === 'play') {
    const el = openLayer(sheet('接続が切れました', '<p>ホストとの接続が切れました。</p><button class="btn primary" id="hQuit">タイトルへ</button>'));
    el.querySelector('#hQuit').onclick = () => { closeLayer(); quitToTitle(); };
    return;
  }
  failGuest(L, 'ホストとの接続が切れました');
}

/* ================================================================ wiring and boot */
function segInit(id, cur, fn) {
  const box = $(id);
  box.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(String(cur) === b.dataset.v));
    b.onclick = () => { box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v); };
  });
}
function wire() {
  $('#goSolo').onclick = () => { sfx.unlock(); showScreen('#scrSolo'); };
  $('#goOnline').onclick = () => { sfx.unlock(); resetOnlineUI(); showScreen('#scrOnline'); };
  $('#goRules').onclick = openRules;
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { if (lobby && !match) closeLobby(); resetOnlineUI(); showScreen('#scrTitle'); }; });
  segInit('#segCount', prefs.count, (v) => { prefs.count = Number(v); store.set('count', prefs.count); $('#soloNote').textContent = SETUP_NOTE[prefs.count]; });
  segInit('#segLevel', prefs.level, (v) => { prefs.level = Number(v); store.set('level', prefs.level); });
  $('#soloNote').textContent = SETUP_NOTE[prefs.count] || '';
  $('#soloStart').onclick = () => {
    sfx.unlock(); startSolo(false);
    if (!store.get('seenTips', false)) { store.set('seenTips', true); setTimeout(() => toast('手札は小さい順。出せるのは両はしの 小／大 だけです', '', 4200), 2400); }
  };
  $('#onName').value = prefs.name;
  $('#onCreate').onclick = () => { sfx.unlock(); hostRoom(); };
  $('#onJoin').onclick = () => { sfx.unlock(); joinRoom(); };
  $('#onCode').addEventListener('input', (e) => { e.target.value = N.cleanCode(e.target.value); });
  $('#onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('#lobAddCpu').onclick = () => { if (lobby && lobby.role === 'host') { sfx.play('tap'); addCpu(lobby); } };
  $('#lobStart').onclick = () => { if (lobby && lobby.role === 'host') { sfx.unlock(); startHostMatch(lobby, false); } };
  $('#lobLeave').onclick = () => { closeLobby(); resetOnlineUI(); attractTable(); showScreen('#scrOnline'); };
  $('#lobInvite').onclick = async () => {
    if (!lobby) return;
    const url = location.origin + location.pathname + '?room=' + lobby.code;
    try { if (navigator.share) { await navigator.share({ title: 'ハシッコ・セブン', text: '部屋コード ' + lobby.code, url }); return; } } catch (e) { /* fall through */ }
    try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました', 'me'); } catch (e) { toast(esc(url), '', 6000); }
  };
  $('#btnMenu').onclick = () => { sfx.unlock(); openMenu(); };
  $('#btnSound').onclick = () => { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); audioOn(); bgm.apply(); renderHud(); if (prefs.sound) sfx.play('match'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });
  // leaving the page tells the room at once (a reload comes back into the same seat)
  window.addEventListener('pagehide', () => { if (lobby) closeLobby(); });
  document.addEventListener('pointerdown', audioOn, { capture: true, passive: true });
  bindStage();
  // logo: a sorted hand with its two ends lit
  $('#logoCards').innerHTML = [2, 4, 7, 9, 12].map((v, i) => mini(v, i === 0 || i === 4 ? 'lit' : '')).join('');
}
function sizeStage() {
  const app = $('#app'), playing = document.body.classList.contains('ingame');
  const wide = window.matchMedia('(min-aspect-ratio: 5/4)').matches;
  if (!playing || wide) { app.style.removeProperty('--stageH'); return; }
  const W = app.clientWidth, H = app.clientHeight - $('#topbar').offsetHeight - $('#bar').offsetHeight;
  const n = stageN, reserve = n >= 5 ? 205 : n === 4 ? 178 : 150;   // room for the players panel
  const want = Math.round(W * 1.3), stageH = Math.max(Math.min(want, H - reserve), Math.min(H, 280));
  app.style.setProperty('--stageH', stageH + 'px');
}
function onResize() {
  if (!scene) return;
  sizeStage();
  const r = $('#stageWrap').getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  const playing = document.body.classList.contains('ingame');
  scene.resize(w, h, playing ? Math.min(34, h * 0.06) : 0, playing ? 10 : 0);
  if (playing) renderTags();
}
async function boot() {
  wire();
  try { await Promise.race([Promise.all([document.fonts.load('700 40px "Fredoka"'), document.fonts.load('900 30px "Zen Maru Gothic"'), document.fonts.load('400 30px "Mochiy Pop One"')]), new Promise((r) => setTimeout(r, 2200))]); } catch (e) { /* fonts are optional */ }
  try {
    await loadThree();
    scene = createScene($('#stage'), { felt: prefs.felt, quality: prefs.quality, keep: TEST });
  } catch (e) {
    console.error(e);
    $('#loader').classList.add('err');
    $('#loaderMsg').textContent = '3D表示を準備できませんでした。通信状況を確認して、ページを再読み込みしてください。';
    return;
  }
  scene.speed = prefs.speed;
  if (prefs.quality !== 'high') scene.setQuality(prefs.quality);
  scene.onFrame = placeTags;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scene.refreshFonts());
  const ro = new ResizeObserver(onResize); ro.observe($('#stageWrap'));
  window.addEventListener('resize', onResize);
  onResize();
  $('#loader').hidden = true;
  attractTable();
  showScreen('#scrTitle');
  const room = N.cleanCode(params.get('room') || '');
  if (room) { showScreen('#scrOnline'); $('#onCode').value = room; }
  if (TEST) window.__hsv = {
    scene, E, AI, get match() { return match; }, get view() { return view; }, get presenting() { return presenting; }, get lobby() { return lobby; }, act, onTap, startSolo, prefs,
    load(state, players) {   // tests: continue a solo game from a given engine state
      const n = state.n;
      const pl = players || [{ nm: 'あなた', kind: 'me', cpu: 0 }].concat(CPU_NAMES.slice(0, n - 1).map((nm) => ({ nm, kind: 'cpu', cpu: 2, mind: { seed: 7 } })));
      beginMatch({ mode: 'cpu', id: ++matchSeq, s: JSON.parse(JSON.stringify(state)), me: 0, players: pl, level: 2, series: newSeries(n), alive: true, cpuBusy: false }, E.viewFor(state, 0));
    }
  };
}
boot();

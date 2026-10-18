/* チケット・トゥ・ライド — the app: screens, the action bar, turn flow, CPU and online play.
   Solo: the engine runs here and the CPUs (cpu-worker.js) play the other seats.
   Online: the host's browser runs the engine and the CPUs; every guest sends its moves and gets back its own view.
   Whatever happens arrives as (events, view): the presenter replays the events one by one on the table
   (engine.reduceView), then settles on the view. */
import { loadThree, createScene, CARD_HEX, COLOR_NAME, SEATS, paintTicket } from './scene.js';

const M = window.TTR_MAP, E = window.TTR_ENG, AI = window.TTR_AI, N = window.TTR_NET;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const store = {
  get(k, d) { try { const v = localStorage.getItem('ttr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ttr.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem('ttr.' + k); } catch (e) { /* ignore */ } }
};
const prefs = {
  name: store.get('name', ''), level: store.get('level', 2), count: store.get('count', 3), color: store.get('color', 0),
  sound: store.get('sound', true), bgm: store.get('bgm', true), speed: store.get('speed', 1),
  quality: store.get('quality', navigator.deviceMemory && navigator.deviceMemory < 4 ? 'low' : 'high'),
  glow: store.get('glow', true), rings: store.get('rings', true)
};
if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;
if (TEST && params.get('q')) prefs.quality = params.get('q') === 'low' ? 'low' : 'high';
const LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
const CPU_NAMES = ['ミケ', 'ソラ', 'ハル', 'ナツ', 'モモ'];
const MAX_SEATS = 5;
const COUNT_NOTE = { 2: '2人：複線（2本並んだルート）は片方しか使えません。', 3: '3人：複線は片方しか使えません。', 4: '4人：複線は2本とも使えます（同じ人が両方は不可）。', 5: '5人：複線は2本とも使えます（同じ人が両方は不可）。' };
const LOCO = 8, GRAY = 9, DECK = 5;

function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('ttr.cid'); } catch (e) { /* ignore */ }
  if (!c || !/^[A-Za-z0-9]{6,32}$/.test(c)) { c = N.makeCid(); try { sessionStorage.setItem('ttr.cid', c); } catch (e) { /* ignore */ } }
  return c;
}
const CID = myCid();

/* ================================================================ state */
let scene = null, match = null, view = null, lobby = null;
let presenting = false, presentStep = '';
const queue = [];
let ui = { sel: -1, pay: 0, color: -1, confirm: null, tixFocus: -1 };
let logLines = [];

/* ================================================================ little helpers */
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dur = (ms) => ms / (prefs.speed || 1);
function toast(html, cls = '', ms = 2600) {
  const box = $('#toasts');
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = html;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, dur(ms));
}
function banner(text, sub, ms = 2200) {
  const b = $('#banner');
  b.innerHTML = '<div>' + text + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  return sleep(dur(ms)).then(() => { b.innerHTML = ''; });
}
function openLayer(html, onClose, peek) {
  const layer = $('#layer');
  layer.innerHTML = html;
  layer.classList.toggle('peek', !!peek);
  closeLayer.cb = onClose || null;
  layer.onclick = (e) => { if (e.target === layer) closeLayer(); };
  layer.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeLayer(); });
  return layer;
}
function closeLayer() { const layer = $('#layer'); layer.innerHTML = ''; layer.classList.remove('peek'); const f = closeLayer.cb; closeLayer.cb = null; if (f) f(); }
function sheet(title, body, foot) {
  return '<div class="sheet" role="dialog" aria-label="' + esc(title) + '"><div class="sheet-h"><h3>' + title + '</h3><button class="iconbtn" data-close aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="sheet-b">' + body + '</div>' + (foot ? '<div class="sheet-f">' + foot + '</div>' : '') + '</div>';
}
function cc(c, n) {
  if (c === LOCO) return '<span class="cc loco">SL' + (n != null ? '×' + n : '') + '</span>';
  const dark = c === 5 || c === 2 || c === 6 || c === 7 || c === 0;
  return '<span class="cc" style="--c:' + CARD_HEX[c] + ';--t:' + (dark ? '#fff' : '#2a2116') + '">' + COLOR_NAME[c][0] + (n != null ? '×' + n : '') + '</span>';
}
function routeColorHtml(col) {
  if (col === GRAY) return '<span class="cc" style="--c:#a9a8a2;--t:#2a2116">灰</span>';
  return cc(col);
}
const cityName = (i) => M.cities[i].ja;
function routeName(r) { const R = M.routes[r]; return cityName(R.a) + '–' + cityName(R.b); }
function seatHex(p) { const pl = match && match.players[p]; return SEATS[pl ? pl.color : p].hex; }
function seatInk(p) { const pl = match && match.players[p]; return SEATS[pl ? pl.color : p].ink; }
function nameOf(p) { if (!match || !view) return ''; return p === view.me ? 'あなた' : (match.players[p] ? match.players[p].nm : 'P' + (p + 1)); }
function nameHtml(p) { return '<b class="pn" style="--pc:' + seatInk(p) + '">' + esc(nameOf(p)) + '</b>'; }
function addLog(text) { logLines.unshift(text); if (logLines.length > 120) logLines.length = 120; }
function ticketImg(t) {
  ticketImg.cache = ticketImg.cache || {};
  if (!ticketImg.cache[t]) ticketImg.cache[t] = paintTicket(t).toDataURL('image/png');
  return ticketImg.cache[t];
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
  function whistle(when = 0) {
    if (!ac || !prefs.sound) return;
    [[587, 0.0], [740, 0.0], [880, 0.0]].forEach(([f]) => {
      const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = 'sine'; o.frequency.value = f; lfo.frequency.value = 6; lg.gain.value = f * 0.012; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.08); g.gain.setValueAtTime(0.07, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 0.95); lfo.stop(t + 0.95);
    });
    noise(0.9, 2400, 0.05, when, 0.4);
  }
  const S = {
    tap: () => tone(880, 0.06, 'triangle', 0.08),
    draw: () => { noise(0.08, 2800, 0.3, 0, 0.7); tone(620, 0.05, 'triangle', 0.05, 0.02); },
    flip: () => { noise(0.06, 3400, 0.22, 0, 0.8); },
    clack: () => { noise(0.05, 900, 0.5, 0, 1.4); tone(160, 0.07, 'square', 0.05); },
    score: () => { tone(784, 0.12, 'triangle', 0.1); tone(1175, 0.18, 'triangle', 0.09, 0.08); },
    ticket: () => { noise(0.14, 1800, 0.22, 0, 0.5); tone(520, 0.08, 'sine', 0.05, 0.05); },
    done: () => { [659, 831, 988, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.11, i * 0.07)); },
    fail: () => { tone(220, 0.16, 'sawtooth', 0.07); tone(175, 0.24, 'sawtooth', 0.07, 0.13); },
    deny: () => tone(140, 0.18, 'sawtooth', 0.07),
    turn: () => { tone(1046, 0.09, 'sine', 0.07); tone(1318, 0.12, 'sine', 0.06, 0.08); },
    whistle: () => whistle(),
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 0.7 : 0.3, 'triangle', 0.14, i * 0.12)); },
    lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.34, 'triangle', 0.11, i * 0.16)); }
  };
  return { unlock, play: (k) => { try { S[k] && S[k](); } catch (e) { /* audio is optional */ } }, ctx: () => ac, master: () => master };
})();
/* background music: the site's own synthesized tracks (../assets/music.js, made for COMPILE) */
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
    const MM0 = globalThis.COMPILE_MUSIC;
    if (!prefs.sound || !prefs.bgm || TEST) { if (MM0) MM0.stop(); return; }
    try { await load(); } catch (e) { return; }
    const MM = globalThis.COMPILE_MUSIC;
    if (!MM) return;
    if (!bus) { bus = ac.createGain(); bus.gain.value = 0.38; bus.connect(sfx.master()); }
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
function cpuChoose(v, level) {
  const seed = (Math.random() * 4294967296) >>> 0;
  if (!workerFailed && typeof Worker !== 'undefined') {
    try {
      if (!worker) {
        worker = new Worker('cpu-worker.js?v=1');
        worker.onmessage = (e) => { const r = workerWait.get(e.data.id); if (r) { workerWait.delete(e.data.id); r(e.data.a); } };
        worker.onerror = () => { workerFailed = true; workerWait.forEach((r) => r(undefined)); workerWait.clear(); };
      }
      const id = ++workerSeq;
      return new Promise((res) => {
        let done = false;
        const finish = (a) => { if (done) return; done = true; workerWait.delete(id); res(a == null ? AI.choose(v, level, E.mulberry32(seed)) : a); };
        workerWait.set(id, finish);
        setTimeout(() => finish(undefined), 8000);
        worker.postMessage({ id, view: v, level, seed });
      });
    } catch (e) { workerFailed = true; }
  }
  return new Promise((res) => setTimeout(() => res(AI.choose(v, level, E.mulberry32(seed))), 0));
}

/* ================================================================ matches */
let matchSeq = 0;
function myName() { return prefs.name || 'あなた'; }
function newSeries(n) { return { games: 0, wins: new Array(n).fill(0), first: -1 }; }
function nextFirst(series, n) { series.first = series.first < 0 ? Math.floor(Math.random() * n) : (series.first + 1) % n; return series.first; }
function colorsFor(n, mine) {
  const out = [mine];
  for (let c = 0; out.length < n; c++) if (c !== mine) out.push(c);
  return out;
}
function startSolo(again) {
  const old = again && match && match.mode === 'cpu' ? match : null;
  const n = old ? old.players.length : prefs.count;
  const level = old ? old.level : prefs.level;
  const colors = old ? old.players.map((p) => p.color) : colorsFor(n, prefs.color);
  const players = [{ nm: myName(), kind: 'me', cpu: 0, color: colors[0] }];
  for (let i = 1; i < n; i++) players.push({ nm: CPU_NAMES[i - 1], kind: 'cpu', cpu: level, color: colors[i] });
  const series = old ? old.series : newSeries(n);
  const s = E.newGame({ n, first: nextFirst(series, n) });
  logLines = [];
  beginMatch({ mode: 'cpu', id: ++matchSeq, s, me: 0, players, level, series, alive: true, cpuBusy: false }, E.viewFor(s, 0));
  saveSolo();
}
function resumeSolo() {
  const d = store.get('save', null);
  if (!d || !d.s || d.s.phase === 'over') { store.del('save'); return false; }
  logLines = d.log || [];
  beginMatch({ mode: 'cpu', id: ++matchSeq, s: d.s, me: 0, players: d.players, level: d.level, series: d.series || newSeries(d.s.n), alive: true, cpuBusy: false }, E.viewFor(d.s, 0));
  toast('前回の続きから始めます', 'me');
  return true;
}
function saveSolo() {
  const m = match;
  if (!m || m.mode !== 'cpu') return;
  if (m.s.phase === 'over') { store.del('save'); return; }
  store.set('save', { v: 1, s: m.s, players: m.players.map((p) => ({ nm: p.nm, kind: p.kind, cpu: p.cpu, color: p.color })), level: m.level, series: m.series, log: logLines.slice(0, 40), at: Date.now() });
}
function beginMatch(m, v) {
  if (match && match !== m) { match.alive = false; clearTimeout(match.awayTimer); }
  match = m; queue.length = 0; presenting = false;
  ui = { sel: -1, pay: 0, color: -1, confirm: null, tixFocus: -1 };
  closeLayer(); hideScreens();
  document.body.classList.add('ingame');
  bgm.setMood('game');
  scene.setSeatColors(m.players.map((pl) => SEATS[pl.color].hex));
  view = v;
  renderPlayers();
  onResize();
  scene.setView(v, { force: true });
  scene.setMarks({ claimable: [], selected: -1, path: [], cities: [], cities2: [] });
  renderAll();
  if (v.phase === 'setup') toast('行き先チケットを2枚以上選んでください', 'me', 3200);
  if (!store.get('seenTips', false)) { store.set('seenTips', true); setTimeout(() => toast('ボードは指でずらせて、2本指で拡大できます。右上の□で全体を表示', '', 5200), 1800); }
  afterIdle();
}

/* the local player acts */
function act(a) {
  const m = match;
  if (!m || !view) return;
  sfx.unlock();
  ui.sel = -1; ui.confirm = null; ui.color = -1;
  renderPanel();
  if (m.mode === 'guest') {
    m.waiting = true; renderAll();
    m.link.send({ k: 'act', a, ply: view.ply });
    clearTimeout(m.waitTo);
    m.waitTo = setTimeout(() => { if (match === m && m.waiting) { m.waiting = false; renderAll(); toast('ホストからの応答がありません', 'warn'); } }, 9000);
    return;
  }
  const r = E.apply(m.s, Object.assign({}, a, { p: m.me }));
  if (!r.ok) { sfx.play('deny'); toast('その手は打てません', 'warn'); renderAll(); return; }
  deliver(m, r.ev);
}
function deliver(m, ev) {
  if (m.s.phase === 'over' && !m.scored) scoreGame(m);
  enqueue(m, E.viewFor(m.s, m.me), E.eventsFor(ev, m.me));
  if (m.mode === 'host') sendUpdates(m, ev);
  if (m.mode === 'cpu') saveSolo();
}
function scoreGame(m) {
  m.scored = true;
  m.series.games++;
  m.s.result.winners.forEach((p) => { m.series.wins[p] += 1 / m.s.result.winners.length; });
}
function metaOf(m) {
  return {
    names: m.players.map((pl) => pl.nm), kinds: m.players.map((pl) => (pl.kind === 'me' ? 'host' : pl.kind)),
    levels: m.players.map((pl) => pl.cpu || 0), here: m.players.map((pl) => pl.here !== false), sub: m.players.map((pl) => !!pl.sub),
    colors: m.players.map((pl) => pl.color), series: m.series
  };
}
function sendUpdates(m, ev) {
  const L = m.lobby;
  if (!L) return;
  const meta = metaOf(m);
  m.players.forEach((pl, p) => { if (pl.kind === 'guest' && pl.cid) L.link.send(pl.cid, { k: 'upd', view: E.viewFor(m.s, p), ev: E.eventsFor(ev, p), meta }); });
}
function playersFromMeta(meta, me) {
  return meta.names.map((nm, p) => ({ nm: p === me ? myName() : nm, kind: p === me ? 'me' : meta.kinds[p], cpu: meta.levels[p], here: meta.here[p], sub: meta.sub[p], color: meta.colors[p] }));
}

/* CPUs (and players who dropped out of an online game) move */
function afterIdle() {
  const m = match;
  if (!m || !m.alive || presenting || !view || m.mode === 'guest') return;
  if (m.s.phase === 'setup') {
    // the CPUs choose their tickets at once (the human takes their time)
    m.players.forEach((pl, p) => {
      if (p === m.me || m.s.pl[p].ready) return;
      if (pl.kind === 'cpu' || (pl.kind === 'guest' && (pl.here === false || pl.sub))) setupStep(m, p);
    });
    return;
  }
  if (m.s.phase !== 'play') return;
  const p = m.s.turn, pl = m.players[p];
  if (p === m.me) return;
  if (pl.kind === 'cpu') cpuStep(m);
  else if (pl.kind === 'guest' && (pl.here === false || pl.sub)) awayStep(m, p);
}
async function setupStep(m, p) {
  m.setupBusy = m.setupBusy || {};
  if (m.setupBusy[p]) return;
  m.setupBusy[p] = true;
  const pl = m.players[p];
  const a = await cpuChoose(E.viewFor(m.s, p), pl.cpu || 2);
  await sleep(dur(500 + p * 350));
  m.setupBusy[p] = false;
  if (match !== m || !m.alive || m.s.phase !== 'setup' || m.s.pl[p].ready) return;
  let r = a ? E.apply(m.s, Object.assign({}, a, { p })) : { ok: false };
  if (!r.ok) r = E.apply(m.s, { p, t: 'keep', keep: m.s.pl[p].offer.slice(0, 2) });
  deliver(m, r.ev);
}
async function cpuStep(m, levelFor) {
  if (m.cpuBusy || !m.alive || m.s.phase !== 'play') return;
  const p = m.s.turn, pl = m.players[p];
  m.cpuBusy = true;
  renderPrompt();
  const t0 = performance.now();
  const a = await cpuChoose(E.viewFor(m.s, p), levelFor || pl.cpu || 2);
  const think = (m.s.step ? 520 : 900) / (prefs.speed || 1) - (performance.now() - t0);
  if (think > 0) await sleep(think);
  m.cpuBusy = false;
  if (match !== m || !m.alive || m.s.phase !== 'play' || m.s.turn !== p) return;
  if (pl.kind === 'guest' && pl.here !== false && !pl.sub) return;
  let r = a ? E.apply(m.s, Object.assign({}, a, { p })) : { ok: false };
  if (!r.ok) { console.warn('CPU move rejected', a, r.err); r = E.apply(m.s, Object.assign({}, E.legalActions(m.s)[0], { p })); }
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
  }, TEST ? 1500 : 12000);
  renderPrompt();
}

/* ================================================================ presenter */
function enqueue(m, finalView, ev, reset) {
  queue.push({ m, finalView, ev, reset });
  if (!presenting) pump();
}
async function pump() {
  presenting = true; renderPrompt();
  while (queue.length) {
    const u = queue.shift();
    if (u.m !== match) continue;
    try { await presentOne(u); } catch (e) { console.error(e); view = u.finalView; scene.setView(view, { force: true }); }
  }
  presenting = false;
  renderAll();
  maybeOpenTickets();
  afterIdle();
}
async function presentOne(u) {
  if (!view || u.reset) { view = u.finalView; scene.setView(view, { force: true }); renderAll(); return; }
  let v = view;
  for (const e of u.ev) {
    const before = v;
    presentStep = e.k + ' ' + JSON.stringify(e).slice(0, 80);
    await animate(e, before);
    presentStep = 'after ' + e.k;
    v = E.reduceView(v, e);
    view = v;
    scene.setView(v);
    renderAll();
  }
  view = u.finalView;
  scene.setView(view);
  renderAll();
  if (view.phase === 'over' && !u.m.shownOver) { u.m.shownOver = true; await showOver(); }
}
/* where a player's chip is, in stage coordinates (cards fly there) */
function seatPos(p) {
  const el = document.querySelector('.pl[data-p="' + p + '"]');
  const st = $('#stageWrap').getBoundingClientRect();
  if (!el) return { x: st.width / 2, y: 20, w: 20 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - st.left, y: r.top + r.height / 2 - st.top, w: Math.min(26, r.height * 0.6) };
}
async function animate(e, v) {
  const A = scene.anchors(), me = v.me, fast = dur(1) < 0.6;
  switch (e.k) {
    case 'take': {
      const f0 = e.i === DECK ? A.deck : A.face[e.i];
      const from = { x: f0.x, y: f0.y, w: f0.w };
      const mine = e.p === me;
      const to = mine ? scene.handTarget(e.c) : seatPos(e.p);
      if (e.i !== DECK) scene.hideFace(e.i, true);
      sfx.play('draw');
      if (!mine) addLog(nameOf(e.p) + '：' + (e.i === DECK ? '山札から1枚' : COLOR_NAME[e.c] + 'を表から'));
      await scene.flyCard({ from, to, val: e.c >= 0 ? e.c : null, faceUp0: e.i !== DECK, faceUp1: mine || e.i !== DECK, fadeOut: !mine, dur: 520 });
      if (mine) scene.showHandCount(e.c, (v.hand ? v.hand[e.c] : 0) + 1);
      if (!mine && e.i !== DECK && e.c === LOCO) toast(nameHtml(e.p) + ' が表のSLを取りました');
      break;
    }
    case 'refill': {
      scene.hideFace(e.i, true);
      sfx.play('flip');
      await scene.flyCard({ from: A.deck, to: A.face[e.i], val: e.c, faceUp0: false, faceUp1: true, dur: 380, arc: 12 });
      scene.hideFace(e.i, false);
      break;
    }
    case 'wipe': {
      toast('表に<span class="cc loco">SL</span>が3枚並んだので、5枚とも流して並べ直します', '', 3000);
      const fl = [];
      for (let i = 0; i < 5; i++) if (v.face[i] >= 0) { scene.hideFace(i, true); fl.push(scene.flyCard({ from: A.face[i], to: A.disc, val: v.face[i], dur: 480, fadeOut: true })); }
      await Promise.all(fl);
      break;
    }
    case 'reshuffle': {
      toast('山札がなくなったので、捨て札を切り直して山札にしました', '', 2800);
      sfx.play('ticket');
      await scene.flyCard({ from: A.disc, to: A.deck, val: null, faceUp0: false, faceUp1: false, dur: 420 });
      break;
    }
    case 'claim': {
      const R = M.routes[e.r], mine = e.p === me;
      // the cards go to the discards
      const fl = [];
      let shown = v.hand ? v.hand.slice() : null;
      // where each card starts, taken before the hand closes up behind them
      const starts = e.cards.map((c) => { const h = mine && A.hand[c]; return h ? { x: h.x, y: h.y, w: h.w } : seatPos(e.p); });
      const to = { x: A.disc.x, y: A.disc.y, w: A.disc.w };
      e.cards.forEach((c, i) => {
        fl.push(sleep(dur(i * 70)).then(() => {
          if (mine && shown) { shown[c]--; scene.showHandCount(c, shown[c]); }
          return scene.flyCard({ from: starts[i], to, val: c, faceUp0: true, faceUp1: true, dur: 460, fadeOut: true, fadeIn: !mine });
        }));
      });
      await Promise.all(fl);
      // the trains roll in
      const mid = scene.routeMid(e.r);
      if (ui.tixFocus < 0) await scene.focus(mid.x, mid.z);
      await scene.dropTrains(e.r, e.p, () => sfx.play('clack'));
      sfx.play('score');
      popAt(scene.screenOfRoute(e.r), '+' + e.pts);
      const text = nameHtml(e.p) + ' が <b>' + esc(routeName(e.r)) + '</b> を取った（' + R.len + '両・+' + e.pts + '点）';
      addLog(nameOf(e.p) + '：' + routeName(e.r) + '（' + R.len + '両・+' + e.pts + '点）');
      toast(text, mine ? 'me' : '', 3000);
      await sleep(dur(fast ? 150 : 420));
      break;
    }
    case 'tdraw': {
      const mine = e.p === me, n = e.ids ? e.ids.length : e.n;
      sfx.play('ticket');
      const to = mine ? A.myTix : seatPos(e.p);
      const fl = [];
      for (let i = 0; i < n; i++) fl.push(sleep(dur(i * 110)).then(() => scene.flyCard({ kind: 'ticket', from: A.tix, to, val: null, faceUp0: false, faceUp1: false, dur: 520, rot0: Math.PI / 2, rot1: Math.PI / 2, fadeOut: !mine })));
      await Promise.all(fl);
      if (!mine) { toast(nameHtml(e.p) + ' が行き先チケットを' + n + '枚引きました'); addLog(nameOf(e.p) + '：行き先チケットを' + n + '枚引いた'); }
      break;
    }
    case 'tkeep': {
      const mine = e.p === me, kept = e.ids ? e.ids.length : e.n;
      if (e.back > 0) {
        const fl = [];
        for (let i = 0; i < e.back; i++) fl.push(sleep(dur(i * 100)).then(() => scene.flyCard({ kind: 'ticket', from: mine ? A.myTix : seatPos(e.p), to: A.tix, val: null, faceUp0: false, faceUp1: false, dur: 460, rot0: Math.PI / 2, rot1: Math.PI / 2 })));
        await Promise.all(fl);
      }
      if (!mine) { if (v.phase !== 'setup') toast(nameHtml(e.p) + ' はチケットを' + kept + '枚残しました'); addLog(nameOf(e.p) + '：チケットを' + kept + '枚残した'); }
      else addLog('あなた：チケットを' + kept + '枚残した');
      break;
    }
    case 'start':
      addLog(nameOf(e.p) + 'から始める');
      toast(nameHtml(e.p) + ' から始めます', e.p === me ? 'me' : '', 2400);
      break;
    case 'final':
      sfx.play('whistle');
      addLog('最終ラウンド（' + nameOf(e.p) + 'の列車コマが' + v.pl[e.p].trains + '両）');
      await banner('最終ラウンド！', esc(nameOf(e.p)) + 'の列車コマが2両以下になりました。全員あと1回ずつです。', 2600);
      break;
    case 'turn':
      if (e.p === me) sfx.play('turn');
      break;
    case 'pass':
      toast(nameHtml(e.p) + ' は何もできないのでパスしました');
      addLog(nameOf(e.p) + '：パス');
      break;
    case 'more':
      break;
    case 'over':
      break;
  }
}
function popAt(p, text) {
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'tag pop'; el.textContent = text;
  el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
  $('#tags').appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

/* ================================================================ what the local player may do */
function myTurn() { return !!(match && view && view.phase === 'play' && view.turn === view.me && !presenting && !(match.waiting)); }
function myPlayer() { return view ? view.pl[view.me] : null; }
function claimInfo(r) {
  const R = M.routes[r], v = view;
  const why = E.laneBlock({ owner: v.owner, n: v.n, pl: v.pl }, v.me, r);
  const pays = why ? [] : E.payments(v.hand, R);
  // the useful choices: per colour the fewest locomotives, plus all locomotives
  const list = [], seen = {};
  pays.forEach((p) => { if (p.c === LOCO) { list.push(p); return; } if (seen[p.c]) return; seen[p.c] = true; list.push(p); });
  list.sort((a, b) => a.k - b.k || v.hand[b.c] - v.hand[a.c]);
  return { R, why, pays: list };
}
const WHY = {
  taken: 'もう取られています', closed: '2〜3人戦では複線の片方しか使えません', both: '同じ人は複線を2本とも取れません',
  trains: '列車コマが足りません'
};
function claimableNow() {
  if (!myTurn() || view.step) return [];
  const out = [];
  for (let r = 0; r < M.routes.length; r++) { const ci = claimInfo(r); if (!ci.why && ci.pays.length) out.push(r); }
  return out;
}
function claimableWithColor(c) {
  if (!myTurn() || view.step) return [];
  const out = [];
  for (let r = 0; r < M.routes.length; r++) {
    const ci = claimInfo(r);
    if (ci.why) continue;
    if (c === LOCO ? ci.pays.some((p) => p.k > 0) : ci.pays.some((p) => p.c === c)) out.push(r);
  }
  return out;
}

/* ================================================================ rendering */
function renderAll() { renderTop(); renderPlayers(); renderPrompt(); renderMarks(); renderTags(); renderPanel(); }
function renderTop() {
  if (!view) return;
  const chip = $('#turnChip');
  let text = '', mine = false, pc = '';
  if (view.phase === 'setup') text = 'チケット選び';
  else if (view.phase === 'over') text = 'ゲーム終了';
  else { mine = view.turn === view.me; text = mine ? 'あなたの番' : nameOf(view.turn) + 'の番'; pc = seatHex(view.turn); }
  chip.classList.toggle('mine', mine);
  chip.style.setProperty('--pc', pc || 'transparent');
  $('#turnText').textContent = text;
  $('#finalChip').hidden = !(view.endIn > 0 && view.phase === 'play');
  $('#btnSound').classList.toggle('off', !prefs.sound);
}
const TRAIN_SVG = '<svg viewBox="0 0 13 10"><rect x="0" y="1" width="13" height="6.5" rx="1.5"/><circle cx="3.2" cy="8.4" r="1.6"/><circle cx="9.8" cy="8.4" r="1.6"/></svg>';
const CARD_SVG = '<svg viewBox="0 0 10 13"><rect x=".8" y=".8" width="8.4" height="11.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const TIX_SVG = '<svg viewBox="0 0 14 10"><path d="M1 1.2h12v2.4a1.4 1.4 0 0 0 0 2.8v2.4H1V6.4a1.4 1.4 0 0 0 0-2.8z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
function renderPlayers() {
  if (!view || !match) return;
  const box = $('#players');
  const n = view.n;
  box.classList.toggle('compact', n >= 4);
  let html = '';
  for (let p = 0; p < n; p++) {
    const Q = view.pl[p], pl = match.players[p] || {};
    const turn = view.phase === 'play' && view.turn === p;
    let badge = '';
    if (view.phase === 'setup') badge = Q.ready ? '<span class="badge">選んだ</span>' : '<span class="badge go">選び中</span>';
    else if (pl.kind === 'cpu') badge = '<span class="badge">CPU</span>';
    else if (pl.sub) badge = '<span class="badge">代打</span>';
    else if (pl.here === false) badge = '<span class="badge">切断</span>';
    html += '<div class="pl' + (turn ? ' turn' : '') + (Q.trains <= 6 ? ' low' : '') + '" data-p="' + p + '" style="--pc:' + seatHex(p) + '">' +
      '<div class="nm"><span class="seat-no">' + (p + 1) + '</span>' + esc(p === view.me ? (prefs.name && n <= 3 ? prefs.name + '（あなた）' : 'あなた') : (pl.nm || 'P' + (p + 1))) + '</div>' +
      '<div class="train-color">列車：' + SEATS[pl.color != null ? pl.color : p].name + '</div><div class="st"><span class="sc">' + Q.pts + '<small>点</small></span><span class="tr">' + TRAIN_SVG + Q.trains + '</span></div>' +
      '<div class="mini"><span>カード<b>' + Q.cards + '</b></span><span>チケット<b>' + (Q.tixN + (Q.offerN && view.phase === 'play' ? '+' + Q.offerN : '')) + '</b></span></div>' +
      '<div class="cnt" aria-label="カード' + Q.cards + '枚・チケット' + Q.tixN + '枚"><span>' + CARD_SVG + Q.cards + '</span><span>' + TIX_SVG + (Q.tixN + (Q.offerN && view.phase === 'play' ? '+' + Q.offerN : '')) + '</span></div>' + badge + '</div>';
  }
  box.innerHTML = html;
  box.onclick = (e) => {
    const el = e.target.closest('.pl');
    if (!el || !view) return;
    const p = Number(el.dataset.p), Q = view.pl[p];
    toast(nameHtml(p) + '：' + Q.pts + '点・列車コマ' + Q.trains + '両・カード' + Q.cards + '枚・チケット' + Q.tixN + '枚', '', 3000);
  };
}
function setPrompt(html, buttons) {
  $('#prompt').innerHTML = html;
  const box = $('#actions');
  box.innerHTML = '';
  (buttons || []).forEach((b) => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.innerHTML = b.label;
    if (b.pressed != null) el.setAttribute('aria-pressed', String(!!b.pressed));
    if (b.disabled) el.disabled = true;
    el.onclick = () => { sfx.unlock(); b.fn(); };
    box.appendChild(el);
  });
}
function renderPrompt() {
  if (!view || !match) return;
  const v = view, m = match;
  if (v.phase === 'over') { setPrompt('ゲーム終了', [{ label: '結果を見る', cls: 'primary', fn: openResult }]); return; }
  if (m.waiting) { setPrompt('<span class="thinking">送っています</span>'); return; }
  if (v.phase === 'setup') {
    if (v.offer) setPrompt('行き先チケットを<b>2枚以上</b>選んでください<small>ほかの人も同時に選んでいます</small>', [{ label: '選ぶ', cls: 'primary', fn: openChooseTickets }]);
    else setPrompt('<span class="thinking">ほかの人がチケットを選んでいます</span>', [{ label: 'チケット', cls: 'sm', fn: openMyTickets }]);
    return;
  }
  if (presenting) { setPrompt(v.turn === v.me ? 'あなたの番' : nameHtml(v.turn) + 'の番'); return; }
  if (v.turn !== v.me) {
    const pl = m.players[v.turn] || {};
    const who = nameHtml(v.turn);
    if (pl.kind === 'cpu' || pl.sub) setPrompt('<span class="thinking">' + who + ' が考えています</span>');
    else if (pl.here === false) setPrompt(who + ' の接続を待っています…<small>しばらく戻らなければCPUが代わりに打ちます</small>');
    else setPrompt('<span class="thinking">' + who + ' の番です</span>');
    return;
  }
  // my turn
  if (v.step && v.step.k === 'tix') { setPrompt('残す行き先チケットを<b>1枚以上</b>選んでください', [{ label: '選ぶ', cls: 'primary', fn: openChooseTickets }]); return; }
  if (ui.confirm === 'card') {
    const i = ui.confirmI, c = ui.confirmC, second = !!(v.step && v.step.k === 'draw2');
    const what = i === DECK ? '山札から1枚' : cc(c) + 'の列車カード';
    setPrompt(what + 'を取りますか？<small>' + (i !== DECK && c === LOCO ? '表のSLはこの1枚で手番終了' : second ? '2枚目の取得で手番終了' : '取得したあと、もう1枚引けます') + '</small>', [
      { label: 'やめる', cls: 'ghost sm', fn: () => { ui.confirm = null; renderPrompt(); } },
      { label: '取る', cls: 'primary', fn: () => {
        if (!myTurn() || view.ply !== ui.confirmPly || (i !== DECK && view.face[i] !== c)) { ui.confirm = null; renderPrompt(); return; }
        ui.confirm = null; act({ t: 'card', i });
      } }
    ]);
    return;
  }
  if (v.step && v.step.k === 'draw2') {
    setPrompt('<b>もう1枚</b>引いてください<small>表のSLは2枚目には取れません。山札からならSLでもOK</small>');
    return;
  }
  if (ui.confirm === 'tickets') {
    setPrompt('行き先チケットを' + Math.min(3, v.tdeckN) + '枚引きますか？<small>1枚以上は必ず残します（つなげられないと最後にマイナス）</small>', [
      { label: 'やめる', cls: 'ghost sm', fn: () => { ui.confirm = null; renderPrompt(); } },
      { label: '引く', cls: 'primary', fn: () => { ui.confirm = null; act({ t: 'tickets' }); } }
    ]);
    return;
  }
  if (ui.sel >= 0 && myTurn() && !v.step) {
    setPrompt('<b>' + esc(routeName(ui.sel)) + '</b><small>払い方を選んで、確認へ進んでください</small>');
    return;
  }
  const can = claimableNow().length;
  const canCards = v.deckN + v.discN > 0 || v.face.some((c) => c >= 0);
  if (!can && !canCards && v.tdeckN <= 0) {
    setPrompt('<b>何もできません</b><small>カードも、取れるルートも、行き先チケットもないのでパスします</small>', [{ label: 'パス', cls: 'primary', fn: () => act({ t: 'pass' }) }]);
    return;
  }
  setPrompt('<b>あなたの番</b><small>' + (can ? 'カードを引くか、光っているルートを取る' : 'カードを引く（表の5枚か山札から2枚）') + '</small>', v.tdeckN > 0 ? [{ label: 'チケットを引く', cls: 'sm', fn: () => { ui.confirm = 'tickets'; renderPrompt(); } }] : []);
}
function clearSel() { ui.sel = -1; ui.pay = 0; renderPrompt(); renderMarks(); renderTags(); renderPanel(); }
/* the route panel: what the selected route is, why it can't be taken, or how to pay for it */
function renderPanel() {
  const el = $('#panel');
  if (!view || !match || ui.sel < 0 || view.phase === 'over') { el.hidden = true; el.innerHTML = ''; return; }
  const r = ui.sel, ci = claimInfo(r), R = ci.R, owner = view.owner[r];
  const head = '<div class="ph"><b>' + esc(routeName(r)) + '</b><span class="meta">' + routeColorHtml(R.col) + ' ' + R.len + '両 <em>' + E.SCORE[R.len] + '点</em></span><button class="x" id="pnX" aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  let body = '';
  const mine = myTurn() && !view.step;
  if (owner >= 0) body = '<div class="why ok">' + nameHtml(owner) + ' のルートです</div>';
  else if (ci.why) body = '<div class="why">' + WHY[ci.why] + '</div>';
  else if (!ci.pays.length) {
    const need = R.col === GRAY ? '同じ色のカード' : COLOR_NAME[R.col] + 'のカード';
    const have = R.col === GRAY ? Math.max(...view.hand.slice(0, 8)) : view.hand[R.col];
    body = '<div class="why">カードが足りません：' + need + 'を' + R.len + '枚（いま' + have + '枚＋SL' + view.hand[LOCO] + '枚）</div>';
  } else if (!mine) body = '<div class="why ok">' + (myTurn() && view.step ? 'いまはカードを引いている途中です' : view.phase === 'play' ? 'あなたの番になったら取れます' : '') + '</div>';
  else {
    const sel = Math.min(ui.pay, ci.pays.length - 1);
    body = (ci.pays.length > 1 ? '<div class="pays">' + ci.pays.slice(0, 9).map((p, i) => '<button class="btn pay" data-i="' + i + '" aria-pressed="' + (i === sel) + '">' + (p.c === LOCO ? cc(LOCO, p.k) : cc(p.c, R.len - p.k) + (p.k ? cc(LOCO, p.k) : '')) + '</button>').join('') + '</div>' : '<div class="why ok">払うカード：' + (ci.pays[0].c === LOCO ? cc(LOCO, ci.pays[0].k) : cc(ci.pays[0].c, R.len - ci.pays[0].k) + (ci.pays[0].k ? cc(LOCO, ci.pays[0].k) : '')) + '</div>') +
      '<div class="go"><button class="btn primary" id="pnGo">内容を確認する（+' + E.SCORE[R.len] + '点）</button></div>';
  }
  el.innerHTML = head + body;
  el.hidden = false;
  placePanel();
  el.querySelector('#pnX').onclick = () => { sfx.play('tap'); clearSel(); };
  el.querySelectorAll('.pay').forEach((b) => { b.onclick = () => { ui.pay = Number(b.dataset.i); sfx.play('tap'); renderPanel(); }; });
  const go = el.querySelector('#pnGo');
  if (go) go.onclick = () => { const p = ci.pays[Math.min(ui.pay, ci.pays.length - 1)]; confirmClaim(r, p); };
}
function confirmClaim(r, pay) {
  if (!myTurn() || view.step) return;
  const R = M.routes[r], ply = view.ply, currentMatch = match;
  const cards = pay.c === LOCO ? cc(LOCO, pay.k) : cc(pay.c, R.len - pay.k) + (pay.k ? ' ＋ ' + cc(LOCO, pay.k) : '');
  const completed = view.tix.filter((t) => {
    const T0 = M.tickets[t], owned = myPlayer().routes;
    return !E.connected(owned, T0.a, T0.b) && E.connected(owned.concat(r), T0.a, T0.b);
  });
  const body = '<p class="claim-cities">' + esc(cityName(R.a)) + '<span>↔</span>' + esc(cityName(R.b)) + '</p>' +
    '<div class="claim-review"><div>払うカード<b>' + cards + '</b></div><div>置く列車<b>' + R.len + '両（残り' + (myPlayer().trains - R.len) + '両）</b></div><div>獲得する点<b>＋' + E.SCORE[R.len] + '点</b></div></div>' +
    (completed.length ? '<p class="note">この区間でチケット達成：' + completed.map((t) => esc(cityName(M.tickets[t].a) + ' ↔ ' + cityName(M.tickets[t].b))).join('、') + '</p>' : '') +
    '<p class="note">確定するとカードを払い、この手番が終わります。</p>';
  const layer = openLayer(sheet('この区間に列車を置きますか？', body, '<button class="btn" data-close>戻る</button><button class="btn primary" id="claimConfirm">列車を置く・確定</button>'));
  layer.querySelector('#claimConfirm').onclick = () => {
    const ci = claimInfo(r);
    if (match !== currentMatch || !myTurn() || view.step || view.ply !== ply || ci.why || !ci.pays.some((p) => p.c === pay.c && p.k === pay.k)) {
      closeLayer(); toast('状況が変わったため、区間を選び直してください', 'warn'); renderAll(); return;
    }
    closeLayer(); act({ t: 'claim', r, c: pay.c, k: pay.k });
  };
}
function reviewCard(i, c) {
  ui.confirm = 'card'; ui.confirmI = i; ui.confirmC = c; ui.confirmPly = view.ply;
  ui.sel = -1; renderPanel(); renderPrompt(); renderMarks();
}
function placeToasts() {
  const st = $('#stageWrap').getBoundingClientRect(), b = $('#slotBoard').getBoundingClientRect();
  const t = $('#toasts');
  t.style.top = (b.top - st.top + 8) + 'px';
  t.style.left = (b.left - st.left + b.width / 2) + 'px';
  t.style.width = Math.min(520, b.width * 0.94) + 'px';
}
function placePanel() {
  const el = $('#panel');
  if (el.hidden) return;
  const st = $('#stageWrap').getBoundingClientRect(), b = $('#slotBoard').getBoundingClientRect();
  const w = Math.min(460, b.width - 16);
  el.style.width = w + 'px';
  el.style.left = (b.left - st.left + (b.width - w) / 2) + 'px';
  el.style.top = 'auto';
  el.style.bottom = (st.bottom - b.bottom + 8) + 'px';
}
function myTicketCities() {
  if (!view || !prefs.rings) return [];
  const out = [];
  const routes = view.pl[view.me].routes;
  view.tix.forEach((t) => { const T0 = M.tickets[t]; if (!E.connected(routes, T0.a, T0.b)) out.push(T0.a, T0.b); });
  return [...new Set(out)];
}
function renderMarks() {
  if (!scene || !view) return;
  let claim = [];
  if (myTurn() && !view.step && prefs.glow) claim = ui.color >= 0 ? claimableWithColor(ui.color) : claimableNow();
  if (ui.sel >= 0) claim = claim.filter((r) => r !== ui.sel);
  let cities = [], cities2 = myTicketCities();
  if (ui.tixFocus >= 0) { const T0 = M.tickets[ui.tixFocus]; cities = [T0.a, T0.b]; cities2 = []; }
  let path = [], pathColor = null;
  if (view.phase === 'over' && view.result) {
    view.result.rows.forEach((row) => { if (row.bonus) path = path.concat(row.path); });
  }
  scene.setMarks({ claimable: claim, selected: ui.sel, cities, cities2, path, pathColor });
  renderTicketFocus(); renderDestinationLabels();
}
function renderTags() {
  if (!scene || !view) return;
  const A = scene.anchors(), box = $('#tags');
  box.querySelectorAll('.tag.count,.tag.small').forEach((e) => e.remove());
  if (!A.deck) return;
  const add = (cls, text, x, y) => { const el = document.createElement('div'); el.className = 'tag ' + cls; el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px'; box.appendChild(el); };
  if (view.hand) { const xs = []; for (let c = 0; c < 9; c++) if (A.hand[c]) xs.push(A.hand[c].x); const step = xs.length > 1 ? xs[1] - xs[0] : 99; for (let c = 0; c < 9; c++) { const a = A.hand[c]; if (a && view.hand[c] > 0) add('count', String(view.hand[c]), a.x - a.w / 2 + Math.min(step, a.w) * 0.72, a.y - a.w * 0.66); } }
  add('count', String(view.deckN), A.deck.x + A.deck.w * 0.4, A.deck.y - A.deck.w * 0.66);
  add('count', String(view.tdeckN), A.tix.x + A.tix.w * 0.4, A.tix.y - A.tix.w * 0.66);
  if (A.myTix && view.tix.length) add('count', String(view.tix.length), A.myTix.x + A.myTix.w * 0.46, A.myTix.y - A.myTix.w * 0.32);
  add('small', '山札', A.deck.x, A.deck.y + A.deck.w * 0.62);
  add('small', 'チケット', A.tix.x, A.tix.y + A.tix.w * 0.62);
  if (A.myTix) add('small', view.tix.length ? '手元のチケット' : 'チケットなし', A.myTix.x, A.myTix.y + A.myTix.w * 0.42);
}

/* ================================================================ input */
function onBoardTap(hit) {
  if (!view || !match) return;
  sfx.unlock();
  removeCityTag();
  if (!hit) { if (ui.sel >= 0) clearSel(); return; }
  if (hit.kind === 'city') { showCityTag(hit.i); return; }
  if (hit.kind === 'route') {
    let r = hit.r;
    // a double route: tapping the claimable lane first
    const R = M.routes[r];
    if (R.twin >= 0 && myTurn() && !view.step) {
      const a = claimInfo(r), b = claimInfo(R.twin);
      if ((a.why || !a.pays.length) && !b.why && b.pays.length) r = R.twin;
    }
    if (ui.sel === r) { clearSel(); return; }
    ui.sel = r; ui.pay = 0; ui.confirm = null;
    sfx.play('tap');
    renderPrompt(); renderMarks(); renderPanel();
  }
}
let cityTagEl = null;
function showCityTag(i) {
  removeCityTag();
  const p = scene.screenOfCity(i);
  const el = document.createElement('div'); el.className = 'tag city';
  el.innerHTML = esc(M.cities[i].ja) + '<small>' + esc(M.cities[i].en) + '</small>';
  el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
  $('#tags').appendChild(el); cityTagEl = { el, i };
  clearTimeout(showCityTag.t); showCityTag.t = setTimeout(removeCityTag, 2600);
}
function removeCityTag() { if (cityTagEl) { cityTagEl.el.remove(); cityTagEl = null; } }
function onTrayTap(hit) {
  if (!view || !match || !hit) return;
  sfx.unlock();
  if (hit.kind === 'mytix') { openMyTickets(); return; }
  if (hit.kind === 'hand') {
    if (!view.hand || !view.hand[hit.c]) return;
    ui.color = ui.color === hit.c ? -1 : hit.c;
    ui.sel = -1;
    sfx.play('tap');
    ui.sel = -1; renderPanel();
    if (ui.color >= 0 && myTurn() && !view.step) {
      const n = claimableWithColor(ui.color).length;
      toast(cc(ui.color) + (n ? ' で取れるルートを光らせました（' + n + '本）' : ' だけで今取れるルートはありません'));
    }
    renderPrompt(); renderMarks();
    return;
  }
  if (view.phase === 'setup' && view.offer && hit.kind === 'tickets') { openChooseTickets(); return; }
  if (!myTurn()) { if (hit.kind === 'face' || hit.kind === 'deck' || hit.kind === 'tickets') toast('いまは' + nameHtml(view.turn) + 'の番です'); return; }
  if (view.step && view.step.k === 'tix') { openChooseTickets(); return; }
  const second = !!(view.step && view.step.k === 'draw2');
  if (hit.kind === 'face') {
    const c = view.face[hit.i];
    if (c < 0) return;
    if (c === LOCO && second) { sfx.play('deny'); toast('2枚目に表のSLは取れません', 'warn'); return; }
    reviewCard(hit.i, c);
    return;
  }
  if (hit.kind === 'deck') {
    if (view.deckN + view.discN <= 0) { sfx.play('deny'); toast('山札も捨て札もありません', 'warn'); return; }
    reviewCard(DECK, null);
    return;
  }
  if (hit.kind === 'tickets') {
    if (second) { sfx.play('deny'); toast('カードをもう1枚引いてください', 'warn'); return; }
    if (view.tdeckN <= 0) { sfx.play('deny'); toast('行き先チケットはもう残っていません', 'warn'); return; }
    ui.confirm = 'tickets'; ui.sel = -1; renderPrompt(); renderMarks();
  }
}

/* ================================================================ tickets */
function maybeOpenTickets() {
  if (!view || !match) return;
  if ($('#layer .sheet')) return;
  if (view.offer && (view.phase === 'setup' || (view.step && view.step.k === 'tix' && view.turn === view.me))) openChooseTickets();
}
function ticketCard(t, selected, choosing, done) {
  const T0 = M.tickets[t];
  return '<button class="tk readable' + (choosing ? '' : ' view') + (ui.tixFocus === t ? ' focus' : '') + '" data-t="' + t + '" aria-pressed="' + selected + '">' +
    '<img src="' + ticketImg(t) + '" alt="">' +
    '<span class="tk-info"><span class="tk-city"><i>A</i>' + esc(cityName(T0.a)) + '</span><span class="tk-city"><i>B</i>' + esc(cityName(T0.b)) + '</span><span class="tk-status">' + (choosing ? (selected ? '✓ 残す' : 'タップして選ぶ') + (done ? '・達成済み' : '') : done ? '✓ 達成' : '未達成') + ' ・ <b>' + T0.pts + '点</b></span></span>' +
    (choosing ? '<span class="mark">✓</span>' : '<span class="tk-map">地図で確認</span>') + '</button>';
}
function focusTicket(t) {
  ui.tixFocus = t;
  renderMarks();
  const T0 = M.tickets[t], st = $('#stageWrap').getBoundingClientRect(), sheetEl = $('#layer .sheet');
  // Keep both labelled endpoints above the ticket sheet and below the focus strip.
  scene.focusCities([T0.a, T0.b], sheetEl ? sheetEl.getBoundingClientRect().top - st.top : null);
}
function renderTicketFocus() {
  const el = $('#ticketFocus');
  if (!view || ui.tixFocus < 0) { el.hidden = true; return; }
  const T0 = M.tickets[ui.tixFocus];
  el.hidden = false;
  el.querySelector('span').textContent = 'A ' + cityName(T0.a) + ' ↔ B ' + cityName(T0.b) + '（' + T0.pts + '点）';
  const st = $('#stageWrap').getBoundingClientRect(), b = $('#slotBoard').getBoundingClientRect();
  el.style.top = (b.top - st.top + 6) + 'px'; el.style.left = (b.left - st.left + 8) + 'px'; el.style.width = (b.width - 16) + 'px';
}
function renderDestinationLabels() {
  const box = $('#destinationLabels');
  if (!scene || !view || ui.tixFocus < 0) { box.replaceChildren(); return; }
  const T0 = M.tickets[ui.tixFocus], ids = [T0.a, T0.b];
  if (box.dataset.ticket !== String(ui.tixFocus) || box.children.length !== 2) {
    box.innerHTML = ids.map((id, n) => '<div class="tag destination"><b>' + (n ? 'B' : 'A') + '</b>' + esc(cityName(id)) + '</div>').join('');
    box.dataset.ticket = String(ui.tixFocus);
  }
  const st = $('#stageWrap').getBoundingClientRect(), b = $('#slotBoard').getBoundingClientRect();
  ids.forEach((id, n) => {
    const p = scene.screenOfCity(id), el = box.children[n], half = el.offsetWidth / 2;
    el.style.left = Math.max(b.left - st.left + half + 4, Math.min(b.right - st.left - half - 4, p[0])) + 'px';
    el.style.top = p[1] + (n ? 25 : -22) + 'px';
    el.hidden = !scene.cityOnScreen(id);
  });
}
function openChooseTickets() {
  if (!view || !view.offer) return;
  const offer = view.offer.slice(), min = Math.min(view.keepMin || 1, offer.length);
  const pick = new Set();
  const draw = () => {
    const done = (t) => E.connected(view.pl[view.me].routes, M.tickets[t].a, M.tickets[t].b);
    const body = '<p class="note">' + (view.phase === 'setup' ? '<b>2枚以上</b>残します。' : '<b>1枚以上</b>残します。') + 'タップした2都市がボードで光ります。残さない分は山の一番下へ。</p>' +
      '<div class="tix">' + offer.map((t) => ticketCard(t, pick.has(t), true, done(t))).join('') + '</div>';
    const left = Math.max(0, min - pick.size);
    const foot = '<span class="note">' + (left ? 'あと<b>' + left + '枚</b>選んでください' : pick.size + '枚を残します') + '</span><button class="btn primary" id="tkOk"' + (left ? ' disabled' : '') + '>決める</button>';
    const layer = openLayer(sheet(view.phase === 'setup' ? '行き先チケットを選ぶ' : '残すチケットを選ぶ', body, foot), () => { renderMarks(); if (ui.tixFocus >= 0) focusTicket(ui.tixFocus); }, true);
    layer.querySelector('.sheet').classList.add('ticket-sheet');
    layer.querySelector('[data-close]').onclick = () => { closeLayer(); };
    layer.querySelectorAll('.tk').forEach((b) => {
      b.onclick = () => {
        const t = Number(b.dataset.t);
        if (pick.has(t)) pick.delete(t); else pick.add(t);
        ui.tixFocus = t;
        sfx.play('tap');
        draw();
        focusTicket(t);
      };
    });
    layer.querySelector('#tkOk').onclick = () => {
      if (pick.size < min) return;
      const keep = offer.filter((t) => pick.has(t));
      closeLayer();
      ui.tixFocus = -1;
      act({ t: 'keep', keep });
    };
  };
  draw();
}
function openMyTickets() {
  if (!view) return;
  const routes = view.pl[view.me].routes;
  const list = view.tix.slice();
  const body = list.length
    ? '<div class="tix">' + list.map((t) => { const T0 = M.tickets[t]; return ticketCard(t, ui.tixFocus === t, false, E.connected(routes, T0.a, T0.b)); }).join('') + '</div>' +
      '<p class="note">タップするとA・Bの2都市を地図で表示します。閉じても目印は残ります。達成で加点、未達成で減点です。</p>'
    : '<p class="note">まだ行き先チケットはありません。</p>';
  const done = list.filter((t) => E.connected(routes, M.tickets[t].a, M.tickets[t].b));
  const plus = done.reduce((s, t) => s + M.tickets[t].pts, 0), minus = list.filter((t) => !done.includes(t)).reduce((s, t) => s + M.tickets[t].pts, 0);
  const layer = openLayer(sheet('あなたの行き先チケット', body, '<span class="note">達成 ' + done.length + '/' + list.length + '　<b>+' + plus + '</b>' + (minus ? '　未達成 −' + minus : '') + '</span><button class="btn" data-close>とじる</button>'), () => { renderMarks(); if (ui.tixFocus >= 0) focusTicket(ui.tixFocus); }, true);
  layer.querySelector('.sheet').classList.add('ticket-sheet');
  layer.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeLayer(); });
  layer.querySelectorAll('.tk').forEach((b) => {
    b.onclick = () => {
      const t = Number(b.dataset.t);
      ui.tixFocus = ui.tixFocus === t ? -1 : t;
      layer.querySelectorAll('.tk').forEach((x) => { const selected = Number(x.dataset.t) === ui.tixFocus; x.classList.toggle('focus', selected); x.setAttribute('aria-pressed', String(selected)); });
      renderMarks();
      if (ui.tixFocus >= 0) focusTicket(t);
    };
  });
}

/* ================================================================ the end */
async function showOver() {
  const res = view.result;
  if (!res) return;
  bgm.setMood('title');
  await banner('ゲーム終了', res.why === 'stuck' ? '全員が続けてパスしたので、ここで終わります' : '行き先チケットを公開します', 1800);
  renderMarks();
  for (const p of res.order.slice().reverse()) {
    const row = res.rows[p];
    const ok = row.tix.filter((t) => t.done).length;
    toast(nameHtml(p) + '：チケット ' + ok + '/' + row.tix.length + ' 達成（<b>+' + row.plus + '</b>' + (row.minus ? ' −' + row.minus : '') + '）' + (row.bonus ? '・最長路線 +10' : ''), p === view.me ? 'me' : '', 2600);
    await sleep(dur(900));
  }
  const iWin = res.winners.includes(view.me);
  sfx.play(iWin ? 'win' : 'lose');
  openResult();
}
function openResult() {
  const res = view && view.result;
  if (!res) return;
  const rows = res.order.map((p) => {
    const r = res.rows[p];
    const tl = r.tix.map((t) => '<span class="' + (t.done ? 'ok' : 'ng') + '">' + (t.done ? '✓ ' : '✗ ') + esc(cityName(M.tickets[t.id].a)) + '–' + esc(cityName(M.tickets[t.id].b)) + ' ' + (t.done ? '+' : '−') + t.pts + '</span>').join('');
    return '<div class="rs' + (r.rank === 1 ? ' win' : '') + '"><div class="top"><span class="rk">' + r.rank + '</span><span class="nm" style="color:' + seatHex(p) + '">' + esc(nameOf(p)) + '</span><span class="tot">' + r.total + '</span></div>' +
      '<div class="brk"><span>ルート <b>' + r.route + '</b></span><span>チケット <b>+' + r.plus + '</b></span>' + (r.minus ? '<span class="minus">未達成 <b>−' + r.minus + '</b></span>' : '') + '<span>最長路線 <b>' + r.longest + '両</b>' + (r.bonus ? ' <b>+10</b>' : '') + '</span></div>' +
      (tl ? '<div class="tl">' + tl + '</div>' : '') + '</div>';
  }).join('');
  const w = res.winners.map((p) => nameOf(p)).join('・');
  const tie = res.winners.length > 1 ? '（引き分け）' : '';
  const m = match;
  const series = m && m.series && m.series.games > 1 ? '<p class="note">通算 ' + m.series.games + '回：' + m.players.map((pl, p) => esc(nameOf(p)) + ' ' + (Math.round(m.series.wins[p] * 10) / 10) + '勝').join('　') + '</p>' : '';
  const tied = res.order.some((p, i) => i > 0 && res.rows[res.order[i - 1]].total === res.rows[p].total);
  const tieNote = tied ? '<p class="note">同点のときは、達成したチケットの多い人、次に最長路線ボーナスの人が上になります。</p>' : '';
  const canAgain = m && (m.mode === 'cpu' || m.mode === 'host');
  const foot = '<button class="btn ghost" id="rsBoard">ボードを見る</button>' + (canAgain ? '<button class="btn" id="rsTitle">タイトルへ</button><button class="btn primary" id="rsAgain">もう一度</button>' : '<button class="btn" id="rsTitle">タイトルへ</button>');
  const layer = openLayer(sheet((res.winners.includes(view.me) ? 'あなたの勝ち！' : esc(w) + 'の勝ち') + tie, '<div class="res">' + rows + '</div>' + tieNote + series, foot));
  layer.querySelector('#rsBoard').onclick = () => { closeLayer(); scene.resetCamera(true); };
  layer.querySelector('#rsTitle').onclick = () => { closeLayer(); confirmQuit(true); };
  const again = layer.querySelector('#rsAgain');
  if (again) again.onclick = () => { closeLayer(); if (m.mode === 'cpu') startSolo(true); else startHostMatch(lobby, true); };
}

/* ================================================================ menus */
function openRules() {
  const t = document.getElementById('tplRules');
  const layer = openLayer(t.innerHTML);
  layer.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeLayer(); });
}
function openMenu() {
  const inGame = !!(match && view);
  const body = '<div class="stack">' +
    (inGame ? '<button class="btn" id="mnTix">あなたの行き先チケット</button><button class="btn" id="mnLog">できごと</button>' : '') +
    '<button class="btn" id="mnRules">あそびかた</button><button class="btn" id="mnSet">設定</button>' +
    (inGame ? '<button class="btn" id="mnQuit">タイトルへもどる</button>' : '') + '</div>';
  const layer = openLayer(sheet('メニュー', body));
  const on = (id, f) => { const el = layer.querySelector(id); if (el) el.onclick = f; };
  on('#mnTix', () => { closeLayer(); openMyTickets(); });
  on('#mnLog', () => { closeLayer(); openLog(); });
  on('#mnRules', () => { closeLayer(); openRules(); });
  on('#mnSet', () => { closeLayer(); openSettings(); });
  on('#mnQuit', () => { closeLayer(); confirmQuit(false); });
}
function confirmQuit(fromResult) {
  const m = match;
  if (!m || m.mode !== 'cpu' || fromResult || (view && view.phase === 'over')) { quitToTitle(); return; }
  const layer = openLayer(sheet('タイトルへもどる', '<p>今のゲームは保存されています。タイトルの「続きから」で再開できます。</p>', '<button class="btn ghost" data-close>やめる</button><button class="btn primary" id="qOk">もどる</button>'));
  layer.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeLayer(); });
  layer.querySelector('#qOk').onclick = () => { closeLayer(); quitToTitle(); };
}
function openSettings() {
  const seg = (id, opts, cur) => '<div class="seg" id="' + id + '">' + opts.map(([v, t]) => '<button data-v="' + v + '" aria-pressed="' + (String(v) === String(cur)) + '">' + t + '</button>').join('') + '</div>';
  const body = '<div class="field"><span>動きの速さ</span>' + seg('stSpeed', [[0.6, 'ゆっくり'], [1, 'ふつう'], [1.6, 'はやい']], prefs.speed) + '</div>' +
    '<div class="field"><span>効果音</span>' + seg('stSound', [[1, 'オン'], [0, 'オフ']], prefs.sound ? 1 : 0) + '</div>' +
    '<div class="field"><span>BGM</span>' + seg('stBgm', [[1, 'オン'], [0, 'オフ']], prefs.bgm ? 1 : 0) + '</div>' +
    '<div class="field"><span>取れるルートを光らせる</span>' + seg('stGlow', [[1, 'オン'], [0, 'オフ']], prefs.glow ? 1 : 0) + '</div>' +
    '<div class="field"><span>未達成チケットの都市に印</span>' + seg('stRings', [[1, 'オン'], [0, 'オフ']], prefs.rings ? 1 : 0) + '</div>' +
    '<div class="field"><span>画質</span>' + seg('stQ', [['high', 'きれい'], ['low', '軽い']], prefs.quality) + '</div>';
  const layer = openLayer(sheet('設定', body));
  const bind = (id, fn) => layer.querySelectorAll('#' + id + ' button').forEach((b) => { b.onclick = () => { layer.querySelectorAll('#' + id + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v); }; });
  bind('stSpeed', (v) => { prefs.speed = Number(v); store.set('speed', prefs.speed); scene.setSpeed(prefs.speed); });
  bind('stSound', (v) => { prefs.sound = v === '1'; store.set('sound', prefs.sound); audioOn(); bgm.apply(); renderTop(); });
  bind('stBgm', (v) => { prefs.bgm = v === '1'; store.set('bgm', prefs.bgm); audioOn(); bgm.apply(); });
  bind('stGlow', (v) => { prefs.glow = v === '1'; store.set('glow', prefs.glow); renderMarks(); });
  bind('stRings', (v) => { prefs.rings = v === '1'; store.set('rings', prefs.rings); renderMarks(); });
  bind('stQ', (v) => { prefs.quality = v; store.set('quality', v); scene.setQuality(v); setTimeout(onResize, 50); });
}
function openLog() {
  const body = logLines.length ? '<div class="log">' + logLines.map((t) => '<div>' + esc(t) + '</div>').join('') + '</div>' : '<p class="note">まだ何も起きていません。</p>';
  const layer = openLayer(sheet('できごと', body));
  layer.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeLayer(); });
}

/* ================================================================ screens */
const SCREENS = ['#scrTitle', '#scrSolo', '#scrOnline', '#scrLobby'];
function hideScreens() { SCREENS.forEach((s) => { $(s).hidden = true; }); }
function showScreen(id) { hideScreens(); $(id).hidden = false; }
function leaveGame() {
  if (match) { match.alive = false; clearTimeout(match.awayTimer); }
  match = null; view = null; queue.length = 0; presenting = false;
  document.body.classList.remove('ingame');
  $('#ticketFocus').hidden = true; $('#destinationLabels').replaceChildren();
  $('#tags').innerHTML = ''; $('#toasts').innerHTML = ''; $('#banner').innerHTML = '';
  closeLayer();
}
function quitToTitle() {
  if (lobby) closeLobby();
  leaveGame();
  attractTable();
  showTitle();
}
function showTitle() {
  const d = store.get('save', null);
  $('#goResume').hidden = !(d && d.s && d.s.phase !== 'over');
  showScreen('#scrTitle');
  bgm.setMood('title');
}
/* the board behind the title: a game half played by CPUs */
let attract = null;
function attractTable() {
  if (!scene) return;
  if (!attract) {
    const s = E.newGame({ n: 4, seed: 20261018, first: 0 });
    for (let p = 0; p < 4; p++) E.apply(s, Object.assign({ p }, AI.choose(E.viewFor(s, p), 3, E.mulberry32(p + 1))));
    for (let i = 0; i < 150 && s.phase === 'play'; i++) { const p = s.turn; E.apply(s, Object.assign({ p }, AI.choose(E.viewFor(s, p), 3, E.mulberry32(100 + i)))); }
    attract = E.viewFor(s, 0);
  }
  scene.setSeatColors(SEATS.map((x) => x.hex));
  onResize();
  scene.setView(Object.assign({}, attract, { hand: [0, 0, 0, 0, 0, 0, 0, 0, 0], tix: [] }), { force: true });
  scene.setMarks({ claimable: [], selected: -1, path: [], cities: [], cities2: [] });
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
  if (lobby === L && !match) renderLobby({ seats, you: 0, code: L.code });
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
    else { L.seats.push({ kind: 'guest', nm, cid, here: true }); toast(esc(nm) + ' さんが入室しました', 'me'); sfx.play('score'); }
    pushLobby(L);
    return;
  }
  if (msg.k === 'act') {
    const m = match;
    if (!m || m.mode !== 'host' || m.lobby !== L || !m.alive) return;
    const p = m.players.findIndex((pl) => pl.kind === 'guest' && pl.cid === cid);
    if (p < 0) return;
    const a = msg.a && typeof msg.a === 'object' ? msg.a : null;
    const setupKeep = a && a.t === 'keep' && m.s.phase === 'setup';
    if (!a || m.players[p].sub || (!setupKeep && (m.s.turn !== p || msg.ply !== m.s.ply))) { L.link.send(cid, { k: 'err', err: 'stale', view: E.viewFor(m.s, p), meta: metaOf(m) }); return; }
    const clean = { t: a.t, i: a.i, r: a.r, c: a.c, k: a.k, keep: Array.isArray(a.keep) ? a.keep.slice(0, 3) : undefined, p };
    const r = E.apply(m.s, clean);
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
      if (m.s.phase !== 'over') toast(esc(pl.nm) + ' さんの接続が切れました', 'warn', 3200);
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
  if (!L || lobby !== L) return;
  const prev = again && match && match.mode === 'host' && match.lobby === L ? match : null;
  if (prev) {
    L.seats = [L.seats[0]].concat(prev.players.filter((pl, p) => p !== prev.me && (pl.kind === 'cpu' || pl.here !== false)).map((pl) => (pl.kind === 'cpu' ? { kind: 'cpu', nm: pl.nm, level: pl.cpu } : { kind: 'guest', nm: pl.nm, cid: pl.cid, here: true })));
    if (L.seats.length < 2) L.seats.push({ kind: 'cpu', nm: CPU_NAMES[0], level: 2 });
  }
  const seats = L.seats.slice(0, MAX_SEATS);
  if (seats.length < 2) return;
  const n = seats.length, colors = colorsFor(n, prefs.color);
  const players = seats.map((s, i) => (s.kind === 'host' ? { nm: s.nm, kind: 'me', cpu: 0, color: colors[i] } : s.kind === 'cpu' ? { nm: s.nm, kind: 'cpu', cpu: s.level || 2, color: colors[i] } : { nm: s.nm, kind: 'guest', cpu: 0, cid: s.cid, here: true, color: colors[i] }));
  const series = prev && prev.players.length === n ? prev.series : newSeries(n);
  const s = E.newGame({ n, first: nextFirst(series, n) });
  logLines = [];
  const m = { mode: 'host', id: ++matchSeq, s, me: 0, players, series, alive: true, lobby: L, link: L.link, cpuBusy: false };
  beginMatch(m, E.viewFor(s, 0));
  const meta = metaOf(m);
  players.forEach((pl, p) => { if (pl.kind === 'guest') L.link.send(pl.cid, { k: 'start', view: E.viewFor(s, p), meta }); });
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
  const colors = colorsFor(Math.max(2, d.seats.length), host ? prefs.color : 0);
  $('#lobSeats').innerHTML = d.seats.map((s, i) => '<div class="seat" style="--pc:' + SEATS[colors[i] != null ? colors[i] : i].hex + '"><span class="dot"></span><span class="nm">' + esc(s.nm) + (i === d.you ? '（あなた）' : '') + '</span>' +
    '<span class="who">' + (s.kind === 'host' ? 'ホスト' : s.kind === 'cpu' ? 'CPU' : 'ゲスト') + '</span>' +
    (host && s.kind === 'cpu' ? '<select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3].map((lv) => '<option value="' + lv + '"' + (lv === s.level ? ' selected' : '') + '>' + LEVEL_NAME[lv] + '</option>').join('') + '</select>' : s.kind === 'cpu' ? '<span class="who">' + LEVEL_NAME[s.level || 2] + '</span>' : '') +
    (host && i > 0 ? '<button class="x" data-rm="' + i + '" aria-label="外す">✕</button>' : '') + '</div>').join('');
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
    if (match && match.lobby === L) { leaveGame(); attractTable(); }
    showScreen('#scrLobby'); renderLobby(L.last);
    return;
  }
  if (msg.k === 'start' && msg.view) {
    const v = msg.view;
    logLines = [];
    const m = { mode: 'guest', id: ++matchSeq, me: v.me, players: playersFromMeta(msg.meta, v.me), meta: msg.meta, alive: true, lobby: L, link: L.link, waiting: false, series: msg.meta.series };
    beginMatch(m, v);
    if (msg.resume) toast('ゲームに戻りました', 'me');
    return;
  }
  const m = match;
  if (!m || m.mode !== 'guest' || m.lobby !== L) return;
  if (msg.k === 'upd' && msg.view) {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.meta) { m.meta = msg.meta; m.players = playersFromMeta(msg.meta, m.me); m.series = msg.meta.series; }
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
  if (match && match.lobby === L && view && view.phase !== 'over') {
    const el = openLayer(sheet('接続が切れました', '<p>ホストとの接続が切れました。</p>', '<button class="btn primary" id="hQuit">タイトルへ</button>'));
    el.querySelector('#hQuit').onclick = () => { closeLayer(); quitToTitle(); };
    return;
  }
  failGuest(L, 'ホストとの接続が切れました');
}

/* ================================================================ layout */
function sizeStage() {
  const app = $('#app');
  const wide = window.matchMedia('(min-aspect-ratio: 5/4)').matches;
  const W = app.clientWidth, H = app.clientHeight;
  document.body.classList.toggle('short', wide && H < 560);
  if (wide) {
    const side = Math.round(Math.max(H < 560 ? 296 : 250, Math.min(360, W * (H < 560 ? 0.36 : 0.34))));
    app.style.setProperty('--side', side + 'px');
    const handW = Math.min(H > 700 ? 62 : 46, (W - side - 24) / 10.6);
    app.style.setProperty('--hdH', Math.round(Math.max(64, handW * 1.406 + 18)) + 'px');
    app.style.setProperty('--mkH', 'auto');
  } else {
    const cw = Math.min(66, (W - 16 - 6 * 8) / 7), hw = Math.min(58, (W - 100) / 6.4);
    app.style.setProperty('--mkH', Math.round(cw * 1.406 + 12) + 'px');
    app.style.setProperty('--hdH', Math.round(hw * 1.406 + 18) + 'px');
  }
  return wide;
}
function onResize() {
  if (!scene) return;
  const wide = sizeStage();
  const st = $('#stageWrap').getBoundingClientRect();
  const rect = (sel) => { const r = $(sel).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; };
  const playing = document.body.classList.contains('ingame');
  const w = Math.max(1, Math.round(st.width)), h = Math.max(1, Math.round(st.height));
  let board, market = null, hand = null;
  if (playing) { board = rect('#slotBoard'); market = rect('#slotMarket'); hand = rect('#slotHand'); }
  else board = { x: 0, y: 0, w, h };
  scene.resize({ w, h, orient: wide ? 'wide' : 'tall', board, market, hand, keepCamera: false });
  if (playing) { renderTags(); placePanel(); renderTicketFocus(); if (ui.tixFocus >= 0) focusTicket(ui.tixFocus); }
  placeToasts();
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
  $('#segColor').innerHTML = SEATS.map((s, i) => '<button data-v="' + i + '" aria-label="' + s.name + '"><i style="--c:' + s.hex + '"></i></button>').join('');
  $('#logoTrain').innerHTML = SEATS.map((s) => '<i style="--c:' + s.hex + '"></i>').join('');
  $('#goSolo').onclick = () => { sfx.unlock(); showScreen('#scrSolo'); };
  $('#goResume').onclick = () => { sfx.unlock(); audioOn(); if (!resumeSolo()) showTitle(); };
  $('#goOnline').onclick = () => { sfx.unlock(); resetOnlineUI(); showScreen('#scrOnline'); };
  $('#goRules').onclick = openRules;
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { if (lobby && !match) closeLobby(); resetOnlineUI(); showTitle(); }; });
  segInit('#segCount', prefs.count, (v) => { prefs.count = Number(v); store.set('count', prefs.count); $('#countNote').textContent = COUNT_NOTE[prefs.count]; });
  segInit('#segLevel', prefs.level, (v) => { prefs.level = Number(v); store.set('level', prefs.level); });
  segInit('#segColor', prefs.color, (v) => { prefs.color = Number(v); store.set('color', prefs.color); });
  $('#countNote').textContent = COUNT_NOTE[prefs.count] || '';
  $('#soloStart').onclick = () => {
    sfx.unlock(); audioOn();
    const d = store.get('save', null);
    if (d && d.s && d.s.phase !== 'over') {
      const layer = openLayer(sheet('新しく始める', '<p>保存中のゲームがあります。新しく始めると、保存中のゲームは消えます。</p>', '<button class="btn ghost" id="nsResume">続きから</button><button class="btn primary" id="nsNew">新しく始める</button>'));
      layer.querySelector('#nsResume').onclick = () => { closeLayer(); resumeSolo(); };
      layer.querySelector('#nsNew').onclick = () => { closeLayer(); store.del('save'); startSolo(false); };
      return;
    }
    startSolo(false);
  };
  $('#onName').value = prefs.name;
  $('#onCreate').onclick = () => { sfx.unlock(); hostRoom(); };
  $('#onJoin').onclick = () => { sfx.unlock(); joinRoom(); };
  $('#onCode').addEventListener('input', (e) => { e.target.value = N.cleanCode(e.target.value); });
  $('#onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('#lobAddCpu').onclick = () => { if (lobby && lobby.role === 'host') { sfx.play('tap'); addCpu(lobby); } };
  $('#lobStart').onclick = () => { if (lobby && lobby.role === 'host') { sfx.unlock(); audioOn(); startHostMatch(lobby, false); } };
  $('#lobLeave').onclick = () => { closeLobby(); resetOnlineUI(); attractTable(); showScreen('#scrOnline'); };
  $('#lobInvite').onclick = async () => {
    if (!lobby) return;
    const url = location.origin + location.pathname + '?room=' + lobby.code;
    try { if (navigator.share) { await navigator.share({ title: 'チケット・トゥ・ライド', text: '部屋コード ' + lobby.code, url }); return; } } catch (e) { /* fall through */ }
    try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました', 'me'); } catch (e) { toast(esc(url), '', 6000); }
  };
  $('#btnMenu').onclick = () => { sfx.unlock(); openMenu(); };
  $('#btnView').onclick = () => { sfx.unlock(); scene.toggleOverview(); };
  $('#btnTickets').onclick = openMyTickets;
  $('#ticketFocus button').onclick = () => { ui.tixFocus = -1; renderMarks(); };
  $('#btnSound').onclick = () => { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); audioOn(); bgm.apply(); renderTop(); if (prefs.sound) sfx.play('score'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });
  window.addEventListener('pagehide', () => { if (lobby) closeLobby(); saveSolo(); });
  document.addEventListener('pointerdown', audioOn, { capture: true, passive: true });
  window.addEventListener('resize', () => { clearTimeout(onResize.t); onResize.t = setTimeout(onResize, 60); });
  // the panels around the board change size (more players, a longer prompt): keep the tray where the slots are
  if (window.ResizeObserver) {
    let last = '';
    const ro = new ResizeObserver(() => {
      const key = ['#slotBoard', '#slotMarket', '#slotHand'].map((s) => { const r = $(s).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); }).join('|');
      if (key === last) return;
      last = key;
      clearTimeout(onResize.t); onResize.t = setTimeout(onResize, 30);
    });
    ['#slotBoard', '#slotMarket', '#slotHand'].forEach((s) => ro.observe($(s)));
  }
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
}
async function boot() {
  wire();
  try { await Promise.race([Promise.all([document.fonts.load('700 40px "Fredoka"'), document.fonts.load('900 30px "Zen Maru Gothic"'), document.fonts.load('400 30px "Mochiy Pop One"')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts are optional */ }
  const fontsOk = !document.fonts || document.fonts.check('900 20px "Zen Maru Gothic"');
  try {
    await loadThree();
    scene = createScene($('#stage'), { quality: prefs.quality, speed: prefs.speed, keepFrame: TEST && params.get('keep') === '1', still: TEST && params.get('still') === '1' });
  } catch (e) {
    console.error(e);
    $('#loader').classList.add('err');
    $('#loaderMsg').innerHTML = '3Dの表示を始められませんでした。<br>ブラウザを新しくするか、別のブラウザで開いてください。';
    return;
  }
  scene.on('tap', (hit) => onBoardTap(hit));
  scene.on('hudTap', (hit) => onTrayTap(hit));
  scene.on('gesture', () => { removeCityTag(); });
  scene.on('frame', renderDestinationLabels);
  scene.on('doubleTap', () => scene.resetCamera(true));
  attractTable();
  $('#loader').hidden = true;
  const room = N.cleanCode(params.get('room') || '');
  if (room.length === 4) {
    showScreen('#scrOnline');
    $('#onCode').value = room;
    if (prefs.name) joinRoom(room); else { onlineErr('名前を入れて「入る」を押してください'); $('#onName').focus(); }
  } else showTitle();
  // fonts that arrived after the board was painted: redraw its names once
  if (!fontsOk && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (scene && document.fonts.check('900 20px "Zen Maru Gothic"')) scene.refreshFonts(); });
}

/* hooks for the browser test */
window.__ttr = {
  get view() { return view; }, get match() { return match; }, get presenting() { return presenting; }, get presentStep() { return presentStep; }, get queueN() { return queue.length; }, get scene() { return scene; }, get ui() { return ui; },
  act, onTrayTap, onBoardTap, startSolo, openMyTickets, quitToTitle
};
boot();

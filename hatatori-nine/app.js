/* ハタトリ・ナイン — the app: screens, the action bar, turn flow, CPU and online play.
   Solo: the engine runs here and the CPU (cpu-worker.js) plays the other seat.
   Online: the host's browser runs the engine; the guest sends actions and gets back its own view.
   Whatever happens arrives as (events, view): the presenter replays the events one by one on the 3D table
   (engine.reduceView), then settles on the view. */
import { loadThree, createScene, sortHand, COLORS, UNIT_NAME, paintCard } from './scene.js';
import { createFx } from './fx.js';
import { createTournaments } from './tournaments.js';

const E = window.HTN_ENG, AI = window.HTN_AI, N = window.HTN_NET;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const store = {
  get(k, d) { try { const v = localStorage.getItem('htn.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('htn.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const prefs = {
  name: store.get('name', ''), level: store.get('level', 2), tactics: store.get('tactics', true), onTactics: store.get('onTactics', true),
  sound: store.get('sound', true), bgm: store.get('bgm', true), fx: store.get('fx', 'full'), felt: store.get('felt', 'green'), speed: store.get('speed', 1), quality: store.get('quality', 'high'), format: store.get('format', 'league')
};
if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;
const LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい', 4: 'もっとつよい' };
const FORM_SHORT = ['合計', '散兵', '大隊', '密集', '楔形'];

let scene = null;
let fx = null;         // the formation scenes over the table
let match = null;      // the game on the table
let lobby = null;      // an online room (outlives rematches)
let view = null;       // what the table shows right now
let ui = { sel: null, step: null, x: null, ret: [] };
let focus = 4;         // the flag shown in the inspector
let presenting = false;
const queue = [];

/* ================================================================ small UI helpers */
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(html, cls = '', ms = 2600) {
  const box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast ' + cls; t.innerHTML = html;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 320); }, ms);
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
const GLYPH = [
  'M12 3 22 20H2z',
  'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
  'M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z',
  'M12 2.4a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8zM6.6 9.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8zM17.4 9.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8zM10.6 14.5h2.8l1.3 8H9.3z',
  'M12 1.5 21 12 12 22.5 3 12z',
  'M15.6 3.1A9.3 9.3 0 1 0 20.9 17a7.6 7.6 0 0 1-5.3-13.9z'
];
const TAC_HINT = { 60: '1〜10', 61: '1〜10', 62: '8', 63: '1〜3' };
const TAC_CHAR = { 60: '将', 61: '将', 62: '騎', 63: '盾', 64: '霧', 65: '泥', 66: '偵', 67: '再', 68: '脱', 69: '寝' };
function mini(c, lg, wild) {
  if (c == null) return '<span class="mc slot' + (lg ? ' lg' : '') + '"></span>';
  if (wild) {   // a tactics card that has become a troop (colour and value fixed when the flag is decided)
    return '<span class="mc wild' + (lg ? ' lg' : '') + '" style="background:' + COLORS[wild.color] + '" title="' + esc(E.TAC_NAME[c]) + '">' + wild.value + '<b>' + TAC_CHAR[c] + '</b></span>';
  }
  if (c >= 60) return '<span class="mc tac' + (lg ? ' lg' : '') + '" title="' + esc(E.TAC_NAME[c]) + '">' + (lg ? esc(E.TAC_NAME[c]) : '<em>' + TAC_CHAR[c] + '</em>') + (TAC_HINT[c] ? '<i>' + TAC_HINT[c] + '</i>' : '') + '</span>';
  const ci = E.colorOf(c);
  return '<span class="mc' + (lg ? ' lg' : '') + '" style="background:' + COLORS[ci] + '">' + E.valueOf(c) + '<svg viewBox="0 0 24 24"><path d="' + GLYPH[ci] + '"/></svg></span>';
}
function cardLabel(c) { return c >= 60 ? '<span class="tc">' + esc(E.TAC_NAME[c]) + '</span>' : '<b>' + esc(E.cardName(c)) + '</b>'; }
function shortLabel(strength, fog) { return strength < 0 ? '' : fog ? '霧' + strength : FORM_SHORT[E.rankOf(strength)] + (strength % 100); }
function tinyLabel(strength, fog) { return strength < 0 ? '' : fog ? '霧' + strength : ['計', '散', '隊', '密', '楔'][E.rankOf(strength)] + (strength % 100); }

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
    sel: () => { tone(660, 0.07, 'triangle', 0.09); tone(990, 0.08, 'triangle', 0.06, 0.04); },
    place: () => { noise(0.08, 900, 0.5, 0, 0.8); tone(150, 0.12, 'sine', 0.2, 0, 0.6); },
    draw: () => noise(0.16, 2400, 0.22, 0, 0.6),
    claim: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.07)); },
    lost: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.24, 'triangle', 0.1, i * 0.09)); },
    fog: () => noise(0.9, 500, 0.35, 0, 0.4),
    mud: () => { tone(110, 0.3, 'sine', 0.22, 0, 0.5); tone(90, 0.3, 'sine', 0.18, 0.12, 0.5); },
    guile: () => { tone(740, 0.12, 'square', 0.05); tone(554, 0.16, 'square', 0.05, 0.08); },
    swish: () => noise(0.25, 1800, 0.3, 0, 0.7),
    deny: () => tone(140, 0.18, 'sawtooth', 0.07),
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 0.7 : 0.3, 'triangle', 0.14, i * 0.12)); },
    lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.34, 'triangle', 0.11, i * 0.16)); },
    turn: () => tone(1180, 0.09, 'sine', 0.06),
    /* a formation stands: a drum hit and a chord that grows with the formation */
    formation: (rank, mine) => {
      noise(0.5, 120, 0.7, 0, 0.6); tone(70, 0.5, 'sine', 0.35, 0, 0.5);
      const roots = mine ? [261.6, 329.6, 392, 523.3, 659.3] : [233.1, 277.2, 349.2, 466.2, 554.4];
      const n = 2 + rank;
      for (let i = 0; i < n && i < roots.length; i++) { tone(roots[i], 0.9, 'sawtooth', 0.03, 0.12 + i * 0.05); tone(roots[i] * 2, 0.7, 'triangle', 0.05, 0.12 + i * 0.05); }
      if (rank >= 3) { noise(0.9, 4000, 0.18, 0.12, 0.4); tone(rank === 4 ? 1046.5 : 784, 1.1, 'triangle', 0.08, 0.35); }
    }
  };
  return { unlock, play: (k, ...a) => { try { S[k] && S[k](...a); } catch (e) { /* audio is optional */ } }, ctx: () => ac, master: () => master };
})();

/* ================================================================ background music
   The site's own synthesized tracks (../assets/music.js, made for COMPILE) are borrowed as they are:
   a relaxed one on the title, a tense one in play, the finale when someone holds four flags. */
const bgm = (() => {
  let loading = null, bus = null, mood = 'title';
  const TRACK = { title: 'lounge', game: 'select', clutch: 'lastcompile' };
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
    if (!bus) { bus = ac.createGain(); bus.gain.value = 0.5; bus.connect(sfx.master()); }
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
        worker = new Worker('cpu-worker.js');
        worker.onmessage = (e) => { const r = workerWait.get(e.data.id); if (r) { workerWait.delete(e.data.id); r(e.data.a); } };
        worker.onerror = () => { workerFailed = true; workerWait.forEach((r) => r(undefined)); workerWait.clear(); };
      }
      const id = ++workerSeq;
      return new Promise((res) => {
        let done = false;
        const finish = (a) => { if (done) return; done = true; workerWait.delete(id); res(a === undefined ? AI.choose(v, level, E.mulberry32(seed)) : a); };
        workerWait.set(id, finish);
        setTimeout(() => finish(undefined), 12000);   // a stuck worker never stalls the game
        worker.postMessage({ id, view: v, level, seed });
      });
    } catch (e) { workerFailed = true; }
  }
  return new Promise((res) => setTimeout(() => res(AI.choose(v, level, E.mulberry32(seed))), 0));
}

/* ================================================================ matches */
let matchSeq = 0;
function myName() { return prefs.name || 'あなた'; }
function newSeries(names) { return { names, pts: [0, 0], wins: [0, 0], games: 0, lastWinner: -1 }; }
function startSolo(again) {
  tournaments.leave();
  const level = prefs.level, tactics = prefs.tactics;
  const series = again && match && match.mode === 'cpu' ? match.series : newSeries([myName(), 'CPU']);
  const first = series.lastWinner === 0 || series.lastWinner === 1 ? series.lastWinner : (Math.random() < 0.5 ? 0 : 1);
  const s = E.newGame({ tactics, first, claims: 'manual' });
  const m = { mode: 'cpu', id: ++matchSeq, s, me: 0, level, tactics, alive: true, series, oppName: 'CPU', cpuBusy: false };
  beginMatch(m, E.viewFor(s, 0));
}
function beginMatch(m, v) {
  if (match && match !== m) match.alive = false;
  match = m; queue.length = 0; presenting = false;
  ui = { sel: null, step: null, x: null, ret: [] };
  closeLayer(); hideScreens();
  document.body.classList.add('ingame'); onResize();
  bgm.setMood('game');
  scene.setAttract(false);
  scene.clear();
  view = v;
  scene.setView(v, { instant: true });
  focus = 4; scene.setFocus(4);
  buildTags();
  renderAll();
  const first = m.tournament ? m.names[v.turn] + 'が先手です' : v.turn === v.me ? 'あなたが先手です' : (m.oppName || '相手') + 'が先手です';
  toast(first, v.turn === v.me ? 'me' : 'op', 2200);
  afterIdle();
}

/* the local player acts */
function act(a) {
  const m = match;
  if (!m || !m.alive || presenting) return;
  sfx.unlock();
  if (m.tournament) { tournaments.act(a); return; }
  if (m.mode === 'guest') {
    if (m.waiting) return;
    m.waiting = true; renderPanel();
    m.link.send({ k: 'act', a });
    clearTimeout(m.waitTo); m.waitTo = setTimeout(() => { if (match === m && m.waiting) { m.waiting = false; renderPanel(); toast('ホストからの応答がありません', 'warn'); } }, 9000);
    return;
  }
  const r = E.apply(m.s, Object.assign({}, a, { p: m.me }));
  if (!r.ok) { sfx.play('deny'); toast(errText(r.err), 'warn'); return; }
  ui = { sel: null, step: null, x: null, ret: [] };
  deliver(m, r.ev);
}
const CLAIM_ERR = {
  incomplete: 'あなたの側がまだそろっていません',
  claimed: 'その旗はもう取られています',
  declared: '宣言は1ターンに1回だけです',
  claim: '宣言できるのは自分のターンのはじめ（カードを出す前）だけです'
};
function errText(err) { return CLAIM_ERR[err] || esc(err && err.length > 12 ? err : 'その手は打てません'); }
/* a flag the local player may declare now: the start of their turn, not yet used, their side complete and the
   other side still open (whether the claim holds is for the player to see, so nothing here tests it) */
function canDeclare(v, f) {
  if (!v || v.claims !== 'manual' || v.turn !== v.me || presenting || v.phase !== 'play' || v.declared) return false;
  const fl = v.flags[f], cap = E.capOf(fl);
  return fl.claimed === -1 && fl.side[v.me].length >= cap && fl.side[1 - v.me].length < cap;
}
function declarable(v) { const out = []; if (v) for (let f = 0; f < 9; f++) if (canDeclare(v, f)) out.push(f); return out; }
function deliver(m, ev) {
  enqueue(m, E.viewFor(m.s, m.me), E.redact(ev, m.me));
  if (m.s.phase === 'over' && !m.scored) scoreGame(m, m.s.winner, m.s.flags);
}
function scoreGame(m, winner, flags) {
  m.scored = true;
  const se = m.series;
  se.games++;
  if (winner === 0 || winner === 1) {
    se.wins[winner]++; se.pts[winner] += 5;
    se.pts[1 - winner] += flags.filter((fl) => fl.claimed === 1 - winner).length;
    se.lastWinner = winner;
  }
}
async function cpuTurn(m) {
  if (m.cpuBusy || !m.alive || m.s.phase === 'over' || m.s.turn === m.me) return;
  m.cpuBusy = true; renderPanel();
  const t0 = performance.now();
  const v = E.viewFor(m.s, 1 - m.me);
  let a = await cpuChoose(v, m.level);
  const minWait = (m.s.phase === 'play' ? 650 : 280) / prefs.speed;
  const left = minWait - (performance.now() - t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  m.cpuBusy = false;
  if (match !== m || !m.alive) return;
  let r = a ? E.apply(m.s, Object.assign({}, a, { p: 1 - m.me })) : { ok: false };
  if (!r.ok) {   // never stall: fall back to the first legal move
    console.warn('CPU move rejected', a, r.err);
    const acts = E.legalActions(m.s);
    r = E.apply(m.s, Object.assign({}, acts[0], { p: 1 - m.me }));
  }
  deliver(m, r.ev);
}
function afterIdle() {
  const m = match;
  if (!m || !m.alive || presenting || !view) return;
  if (m.tournament) { tournaments.idle(); if (tournaments.canAct() && view.phase !== 'over') autoStep(m); return; }
  if (m.mode === 'cpu' && view.phase !== 'over' && view.turn !== view.me) cpuTurn(m);
  if (view.phase !== 'over' && view.turn === view.me) autoStep(m);
}
/* steps that need no decision: a single possible draw, or the basic game's draw */
function autoStep(m) {
  const v = view;
  if (!v || v.turn !== v.me || m.autoPending || (m.mode === 'guest' && m.waiting)) return;
  let a = null;
  if (v.phase === 'draw') { const opts = ['T', 'X'].filter((d) => v.deck[d] > 0); if (opts.length === 1) a = { t: 'draw', d: opts[0] }; }
  else if (v.phase === 'scout' && v.scout && v.scout.left === 0 && v.scout.ret === 0) a = { t: 'sret', cards: [] };
  if (!a) return;
  m.autoPending = true;
  setTimeout(() => { m.autoPending = false; if (match === m && view === v && !presenting) act(a); }, 260 / prefs.speed);
}

/* ================================================================ presenter */
function enqueue(m, finalView, ev, reset) {
  queue.push({ m, finalView, ev, reset });
  if (!presenting) pump();
}
async function pump() {
  presenting = true; renderPanel();
  while (queue.length) {
    const u = queue.shift();
    if (u.m !== match) continue;
    try { await presentOne(u); } catch (e) { console.error(e); view = u.finalView; scene.setView(view, {}); }
  }
  presenting = false;
  renderAll();
  afterIdle();
}
let watchSpeed = 1;
const wait = (s) => new Promise((r) => setTimeout(r, Math.max(0, s) * 1000 / (prefs.speed * watchSpeed)));
async function presentOne(u) {
  if (!view || u.reset) { view = u.finalView; scene.setView(view, { instant: true }); renderAll(); return; }
  let v = view;
  for (const e of u.ev) {
    if (match !== u.m || !u.m.alive) return;
    const hints = hintsFor(e, v);
    const before = v;
    v = E.reduceView(v, e);
    view = v;
    scene.setView(v, hints);
    if (e.k === 'card' || e.k === 'env') { scene.setHighlights({ last: e.c }); setFocus(e.f, true); }
    else if (e.k === 'move') { scene.setHighlights({ last: e.c }); if (e.to >= 0) setFocus(e.to, true); }
    else if (e.k === 'claim') setFocus(e.f, true);
    renderTags(); renderHud(); renderDock();
    await wait(effectFor(e, v));
    for (const done of newlyFormed(before, v)) await showFormation(done, v);
  }
  await tournaments.beforeSettle(u);
  if (match !== u.m || !u.m.alive) return;
  view = u.finalView;
  scene.setView(view, {});
  if (view.phase === 'over') await showOver();
}
/* sides that became complete between two views */
function newlyFormed(a, b) {
  const out = [];
  if (!a || !b) return out;
  b.flags.forEach((fl, f) => {
    if (fl.claimed !== -1) return;
    const capB = E.capOf(fl), capA = E.capOf(a.flags[f]);
    for (let p = 0; p < 2; p++) {
      const nb = fl.side[p].length, na = a.flags[f].side[p].length;
      const was = na >= capA, now = nb >= capB;
      const changed = !was || fl.side[p].map((e) => e.c).join() !== a.flags[f].side[p].map((e) => e.c).join();
      if (now && changed) out.push({ f, p });
    }
  });
  return out;
}
async function showFormation(done, v) {
  const fl = v.flags[done.f], cap = E.capOf(fl), fog = fl.fog >= 0, cards = fl.side[done.p].map((e) => e.c);
  const ex = E.explain(cards, fog), mine = done.p === v.me, rank = E.rankOf(ex.strength, fog);
  const wilds = {}; ex.wilds.forEach((w) => { wilds[w.c] = w; });
  sfx.play('formation', fog ? 0 : rank, mine);
  if (prefs.fx === 'off' || !fx) {
    scene.formationFx(done.f, mine, fog ? 0 : rank);
    toast((match && match.tournament ? who(done.p) : mine ? 'あなた' : who(done.p)) + 'の陣形：<b>' + esc(E.strengthLabel(ex.strength, fog)) + '</b>（旗' + (done.f + 1) + '）', mine ? 'me' : 'op', 2200);
    await wait(0.5);
    return;
  }
  const colors = cards.map((c) => c < 60 ? COLORS[E.colorOf(c)] : wilds[c] ? COLORS[wilds[c].color] : '#e8c46a');
  await fx.formation({ mine, rank, fog, sum: E.sumOf(ex.strength), cards, wilds, colors, mode: prefs.fx, speed: prefs.speed * watchSpeed, mineName: match && match.tournament ? match.names[v.me] : null, oppName: match && match.mode === 'cpu' ? 'CPU' : (match && match.oppName) || '相手', cap,
    onEnd: () => scene.formationFx(done.f, mine, fog ? 0 : rank) });
}
function hintsFor(e, v) {
  const mine = e.p === v.me, h = {};
  if ((e.k === 'card' || e.k === 'env' || e.k === 'guile') && !mine) { h.from = { [e.c]: 'opp' }; h.oppPlayed = true; }
  if ((e.k === 'draw' || e.k === 'sdraw') && mine && e.c != null) h.from = { [e.c]: e.d === 'T' ? 'deckT' : 'deckX' };
  if (e.k === 'sret' && mine && e.c != null) h.to = { [e.c]: e.d === 'T' ? 'deckT' : 'deckX' };
  return h;
}
function who(p) { if (match && match.tournament) return esc(match.names[p]); return p === view.me ? 'あなた' : (match && match.oppName ? esc(match.oppName) : '相手'); }
function effectFor(e, v) {
  const mine = e.p === v.me;
  switch (e.k) {
    case 'card':
      sfx.play('place');
      if (e.c >= 60 && !mine) toast(who(e.p) + 'が ' + cardLabel(e.c) + ' を旗' + (e.f + 1) + 'に出した', 'op');
      return 0.5;
    case 'env':
      sfx.play(e.c === E.FOG ? 'fog' : 'mud');
      toast(who(e.p) + 'が旗' + (e.f + 1) + 'に ' + cardLabel(e.c) + (e.c === E.FOG ? '（役なし・合計勝負）' : '（4枚勝負）'), mine ? 'me' : 'op', 3200);
      return 0.8;
    case 'guile':
      sfx.play('guile');
      toast(who(e.p) + 'が ' + cardLabel(e.c) + ' を使った', mine ? 'me' : 'op');
      return 0.55;
    case 'move': {
      sfx.play('swish');
      const card = cardLabel(e.c);
      let t;
      if (e.steal) t = '寝返り！ ' + card + ' が' + who(e.p) + 'の旗' + (e.to + 1) + 'へ';
      else if (e.owner !== e.p) t = '脱走！ ' + who(e.owner) + 'の ' + card + ' が捨て札へ';
      else if (e.to === -1) t = who(e.p) + 'が ' + card + ' を捨て札にした';
      else t = '再配置：' + card + ' を旗' + (e.from + 1) + 'から旗' + (e.to + 1) + 'へ';
      toast(t, mine ? 'me' : 'op', 3200);
      return 0.75;
    }
    case 'mudDrop':
      toast('泥沼が消えて、' + who(e.p) + 'の ' + esc(E.cardName(e.c)) + ' が捨て札へ', 'warn', 3000);
      return 0.5;
    case 'claimfail':
      sfx.play('deny');
      if (mine) stamp('宣言 却下', 'no', '旗' + (e.f + 1) + '：場のカードだけでは、相手が追いつけないと言い切れません');
      else toast(who(e.p) + 'が旗' + (e.f + 1) + 'を宣言 → 却下されました', 'op', 3200);
      return mine ? 1.2 : 0.7;
    case 'claim': {
      const fog = !!e.fog, ml = E.strengthLabel(e.ms, fog), tl = e.ts >= 0 ? E.strengthLabel(e.ts, fog) : '';
      let sub;
      if (e.how === 'proof') sub = (e.decl ? '宣言どおり ' : '') + esc(ml) + (e.ts >= 0 ? '（相手は最高でも ' + esc(tl) + '）' : '（相手はもうそろわない）');
      else if (e.how === 'tie') sub = esc(ml) + ' 同点・先にそろえた';
      else if (e.how === 'end') sub = 'そろっていた側が取った';
      else sub = esc(ml) + ' ＞ ' + esc(tl);
      if (mine) { stamp('旗' + (e.f + 1) + ' 確保！', 'yes', sub); sfx.play('claim'); }
      else { stamp('旗' + (e.f + 1) + ' を取られた', 'no', sub); sfx.play('lost'); }
      return 1.15;
    }
    case 'draw': sfx.play('draw'); return mine ? 0.32 : 0.28;
    case 'sdraw': sfx.play('draw'); return 0.42;
    case 'sret': sfx.play('draw'); return 0.36;
    case 'pass': toast(who(e.p) + 'はパス', mine ? 'me' : 'op'); return 0.6;
    case 'turn': if (e.p === v.me) sfx.play('turn'); return 0.06;
    case 'over': return 0.3;
  }
  return 0.1;
}
async function showOver() {
  const v = view, m = match;
  if (!m) return;
  if (m.mode === 'guest' && v.winner >= 0 && !m.scored) { m.scored = true; }
  const won = v.winner === v.me, draw = v.winner === 2;
  if (m.tournament) {
    stamp(draw ? '引き分け' : m.names[v.winner] + 'の勝利！', draw ? 'info' : 'yes'); sfx.play(draw ? 'tap' : 'win');
    renderHud(); await wait(1.5); if (match === m) tournaments.result(); return;
  }
  if (draw) stamp('引き分け', 'info'); else if (won) { stamp('勝利！', 'yes'); sfx.play('win'); } else { stamp('敗北…', 'no'); sfx.play('lose'); }
  renderHud();
  await wait(1.5);
  if (match === m) openResult();
}

/* ================================================================ the action bar */
function st() { return view ? AI.stateFromView(view) : null; }
function myTurn() { return !!(view && match && (!match.tournament || tournaments.canAct()) && view.turn === view.me && view.phase !== 'over' && !(match.mode === 'guest' && match.waiting)); }
function playable(s, c) { return E.whyNot(s, view.me, c) === ''; }
function targetsFor(s, c) {
  const me = view.me;
  if (c < 60 || E.isMorale(c)) return { flags: E.openFlags(s, me) };
  if (c === E.FOG || c === E.MUD) { const key = c === E.FOG ? 'fog' : 'mud'; return { flags: s.flags.map((fl, f) => (fl.claimed === -1 && fl[key] < 0 ? f : -1)).filter((f) => f >= 0), env: true }; }
  return {};
}
/* fog and mud of one side that can still be moved or removed, as [card, button label]: they are small on the table, so the panel offers them too */
function envButtons(s, owner) {
  return E.movableCards(s, owner, false).filter((x) => E.isEnv(x)).map((x) => {
    const at = E.locate(s, x);
    return [x, (x === E.FOG ? '霧' : '泥沼') + '（旗' + (at.f + 1) + '）'];
  });
}
function redeployDest(s, x) {
  const me = view.me, at = E.locate(s, x);
  return s.flags.map((fl, f) => {
    if (f === at.f || fl.claimed !== -1) return -1;
    if (E.isEnv(x)) return fl[x === E.FOG ? 'fog' : 'mud'] < 0 ? f : -1;
    return fl.side[me].length < E.capOf(fl) ? f : -1;
  }).filter((f) => f >= 0);
}
function button(label, fn, cls = '', disabled = false) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ' + cls; b.innerHTML = label; b.disabled = disabled;
  b.onclick = () => { sfx.unlock(); sfx.play('tap'); fn(); };
  return b;
}
function renderPanel() {
  const P = $('#prompt'), A = $('#actions');
  A.innerHTML = '';
  const hl = {};
  if (!match || !view) { P.innerHTML = ''; scene && scene.setHighlights(hl); return; }
  if (view.last) hl.last = view.last.c;
  const m = match, v = view;
  if (m.tournament && m.intro) { P.innerHTML = '対戦を準備しています'; scene.setHighlights(hl); return; }
  if (m.tournament && !m.ctrl.includes(v.me) && v.phase !== 'over') { P.innerHTML = '<span class="thinking">' + esc(m.names[v.turn]) + 'の番です（観戦中）</span>'; scene.setHighlights(hl); return; }
  if (v.phase === 'over') {
    P.innerHTML = m.tournament ? (v.winner === 2 ? '引き分けです' : esc(m.names[v.winner]) + 'の勝利！') : v.winner === v.me ? '勝ちました！' : v.winner === 2 ? '引き分けです' : '負けました…';
    A.appendChild(button('結果を見る', openResult, 'primary'));
    scene.setHighlights(hl); return;
  }
  if (v.turn !== v.me) {
    const nm = m.mode === 'cpu' ? 'CPU' : esc(m.oppName || '相手');
    P.innerHTML = '<span class="thinking">' + nm + 'の番です</span>';
    scene.setHighlights(hl); return;
  }
  if ((m.mode === 'guest' || m.tournament) && m.waiting) { P.innerHTML = '<span class="thinking">送信中</span>'; scene.setHighlights(hl); return; }
  if (presenting) { P.innerHTML = ''; scene.setHighlights(hl); return; }
  const s = st(), me = v.me;
  const decl = declarable(v);
  if (v.phase === 'draw') {
    P.innerHTML = '山札から1枚引きます<small>どちらの山から引くか選んでください</small>';
    hl.decks = ['T', 'X'].filter((d) => v.deck[d] > 0);
    if (v.deck.T > 0) A.appendChild(button('兵の山 <span class="n">' + v.deck.T + '</span>', () => act({ t: 'draw', d: 'T' }), 'primary'));
    if (v.deck.X > 0) A.appendChild(button('戦術の山 <span class="n">' + v.deck.X + '</span>', () => act({ t: 'draw', d: 'X' })));
    scene.setHighlights(hl); return;
  }
  if (v.phase === 'scout') {
    if (v.scout && v.scout.left > 0 && v.deck.T + v.deck.X > 0) {
      P.innerHTML = '偵察：山札から引く（あと<b>' + v.scout.left + '</b>枚）';
      hl.decks = ['T', 'X'].filter((d) => v.deck[d] > 0);
      if (v.deck.T > 0) A.appendChild(button('兵の山 <span class="n">' + v.deck.T + '</span>', () => act({ t: 'sdraw', d: 'T' }), 'primary'));
      if (v.deck.X > 0) A.appendChild(button('戦術の山 <span class="n">' + v.deck.X + '</span>', () => act({ t: 'sdraw', d: 'X' })));
    } else {
      const need = v.scout ? v.scout.ret : 0;
      ui.ret = ui.ret.filter((c) => v.hand.includes(c)).slice(0, need);
      P.innerHTML = '偵察：山札の上に戻すカードを<b>' + need + '</b>枚選ぶ<small>手札をタップ（' + ui.ret.length + '/' + need + '）</small>';
      hl.picked = ui.ret.slice();
      A.appendChild(button('戻す', () => { const cards = ui.ret.slice(); ui.ret = []; act({ t: 'sret', cards }); }, 'primary', ui.ret.length !== need));
    }
    scene.setHighlights(hl); return;
  }
  // phase play
  const hand = v.hand;
  if (ui.step === 'declare') {   // a flag tapped at the start of the turn: declare it?
    if (!canDeclare(v, ui.f)) ui = { sel: null, step: null, x: null, ret: [] };
    else {
      const f = ui.f;
      P.innerHTML = '旗' + (f + 1) + ' を取ると宣言しますか？<small>宣言はターンのはじめに1回だけ。場のカードで証明できないと却下され、このターンはもう宣言できません</small>';
      A.appendChild(button('宣言する', () => act({ t: 'claim', f }), 'primary'));
      A.appendChild(button('やめる', () => { ui = { sel: null, step: null, x: null, ret: [] }; renderPanel(); }, 'ghost'));
      hl.flags = []; scene.setHighlights(hl); return;
    }
  }
  if (ui.sel != null && !hand.includes(ui.sel)) ui = { sel: null, step: null, x: null, ret: [] };
  const c = ui.sel;
  if (c == null) {
    const ok = hand.filter((x) => playable(s, x));
    hl.dimHand = true; hl.hand = ok;
    if (E.canPass(s, me)) {
      P.innerHTML = '出せる兵カードがありません<small>戦術カードを使うか、パスできます</small>';
      A.appendChild(button('パス', () => act({ t: 'pass' }), ok.length ? '' : 'primary'));
    } else P.innerHTML = '出すカードを選んでください<small>' + (decl.length ? '手札をタップ → 置く旗をタップ ・ 取れると思う旗は、先に旗をタップして宣言（1回）' : '手札をタップ → 置く旗をタップ') + '</small>';
    scene.setHighlights(hl); return;
  }
  hl.sel = c;
  const cancel = () => { ui = { sel: null, step: null, x: null, ret: [] }; renderPanel(); };
  const t = targetsFor(s, c);
  if (t.flags) {
    hl.flags = t.flags; if (t.env) hl.ghostMode = 'env';
    P.innerHTML = cardLabel(c) + ' を置く旗をタップ' + (c >= 60 ? '<small>' + esc(E.TAC_TEXT[c]) + '</small>' : '');
    A.appendChild(button('やめる', cancel, 'ghost'));
  } else if (c === E.SCOUT) {
    P.innerHTML = cardLabel(c) + ' を使いますか？<small>' + esc(E.TAC_TEXT[c]) + '</small>';
    A.appendChild(button('使う', () => act({ t: 'scout', c }), 'primary'));
    A.appendChild(button('やめる', cancel, 'ghost'));
  } else if (c === E.REDEPLOY) {
    if (ui.step !== 'to') {
      hl.cards = E.movableCards(s, me, false);
      P.innerHTML = cardLabel(c) + '：動かす<b>自分のカード</b>をタップ<small>旗を取っていない列のカード（霧・泥沼も可）</small>';
      envButtons(s, me).forEach(([x, label]) => A.appendChild(button(label, () => { ui.x = x; ui.step = 'to'; sfx.play('sel'); renderPanel(); })));
    } else {
      hl.cards = [ui.x]; hl.flags = redeployDest(s, ui.x); if (E.isEnv(ui.x)) hl.ghostMode = 'env';
      P.innerHTML = '移す旗をタップ<small>または捨て札にする</small>';
      A.appendChild(button('捨てる', () => act({ t: 'redeploy', c, x: ui.x, to: -1 })));
    }
    A.appendChild(button('やめる', cancel, 'ghost'));
  } else if (c === E.DESERTER) {
    hl.cards = E.movableCards(s, 1 - me, false);
    P.innerHTML = cardLabel(c) + '：捨てさせる<b>相手のカード</b>をタップ<small>旗を取っていない列のカード（霧・泥沼も可）</small>';
    envButtons(s, 1 - me).forEach(([x, label]) => A.appendChild(button(label, () => act({ t: 'deserter', c, x }))));
    A.appendChild(button('やめる', cancel, 'ghost'));
  } else if (c === E.TRAITOR) {
    if (ui.step !== 'to') {
      hl.cards = E.movableCards(s, 1 - me, true);
      P.innerHTML = cardLabel(c) + '：寝返らせる<b>相手の兵カード</b>をタップ';
    } else {
      hl.cards = [ui.x]; hl.flags = E.openFlags(s, me);
      P.innerHTML = 'あなたの側の置き場所（旗）をタップ';
    }
    A.appendChild(button('やめる', cancel, 'ghost'));
  }
  scene.setHighlights(hl);
}
function renderHud() {
  const chip = $('#turnChip'), tx = $('#turnText');
  if (!view || !match) { tx.textContent = '準備中'; chip.className = 'chip'; return; }
  const v = view;
  if (v.phase === 'over') { tx.textContent = '対戦終了'; chip.className = 'chip'; }
  else if (match.tournament) { tx.textContent = match.names[v.turn] + 'の番'; chip.className = 'chip' + (tournaments.canAct() ? ' mine' : ' theirs'); }
  else if (v.turn === v.me) { tx.textContent = 'あなたの番'; chip.className = 'chip mine'; }
  else { tx.textContent = (match.mode === 'cpu' ? 'CPU' : match.oppName || '相手') + 'の番'; chip.className = 'chip theirs'; }
  const nMe = v.flags.filter((fl) => fl.claimed === v.me).length, nOp = v.flags.filter((fl) => fl.claimed === 1 - v.me).length;
  $('#scoreMe').textContent = nMe; $('#scoreOp').textContent = nOp;
  bgm.setMood(v.phase !== 'over' && (nMe >= 4 || nOp >= 4) ? 'clutch' : 'game');
  $('#btnSound').classList.toggle('off', !prefs.sound);
}
function renderAll() { renderHud(); renderPanel(); renderTags(); renderDock(); if (match && match.tournament) tournaments.renderWatch(); }
function setFocus(f, quiet) {
  if (f == null || f < 0 || f > 8) return;
  focus = f;
  if (scene) scene.setFocus(f);
  if (!quiet) sfx.play('tap');
  renderDock();
}
/* the inspector: one flag, both sides, what each side still can make */
function renderDock() {
  const D = $('#dock');
  if (!view || !match) { D.innerHTML = ''; return; }
  const v = view, me = v.me, f = focus, fl = v.flags[f], cap = E.capOf(fl), fog = fl.fog >= 0;
  const s = st();
  const oppNm = match.mode === 'cpu' ? 'CPU' : (match.oppName || '相手');
  const unseen = E.unseenMask(s); v.hand.forEach((c) => { if (c < 60) unseen[c] = 0; });
  const myPool = new Uint8Array(unseen); v.hand.forEach((c) => { if (c < 60) myPool[c] = 1; });
  const row = (p) => {
    const cards = fl.side[p].map((e) => e.c);
    let slots = cards.map((c) => mini(c));
    let lbl;
    if (cards.length >= cap) {
      const ex = E.explain(cards, fog), wild = {};
      ex.wilds.forEach((x) => { wild[x.c] = x; });
      slots = cards.map((c) => mini(c, false, wild[c]));
      const w = ex.wilds.map((x) => E.TAC_NAME[x.c] + '＝' + E.COLOR_NAME[x.color] + 'の' + x.value);
      lbl = esc(E.strengthLabel(ex.strength, fog)) + (w.length ? '<small>' + esc(w.join(' ')) + '</small>' : '');
    } else {
      // the other side's best is exactly what a claim has to rule out: once our side is complete, we leave it to the player
      const ourDone = fl.side[me].length >= cap && v.claims === 'manual';
      const best = E.bestStrength(cards, cap, fog, p === me ? myPool : unseen);
      lbl = 'あと' + (cap - cards.length) + '枚' + (fl.claimed === -1 && !(p !== me && ourDone) ? '<small>最強なら ' + esc(E.strengthLabel(best, fog)) + '</small>' : '');
    }
    while (slots.length < cap) slots.push(mini(null));
    return '<div class="insp-r ' + (p === me ? 'me' : 'op') + '"><span class="who">' + (match.tournament ? esc(match.names[p]) : p === me ? 'あなた' : esc(oppNm.slice(0, 5))) + '</span><span class="mcrow">' + slots.join('') + '</span><span class="lbl">' + lbl + '</span></div>';
  };
  let st0 = '<span class="st">勝負中</span>';
  if (fl.claimed === me) st0 = '<span class="st me">あなたが確保</span>';
  else if (fl.claimed === 1 - me) st0 = '<span class="st op">相手が確保</span>';
  const wx = (fog ? '<span class="wx">霧：合計勝負</span>' : '') + (fl.mud >= 0 ? '<span class="wx mud">泥沼：4枚</span>' : '');
  let hint = '';
  if (fl.claimed === -1) {
    const mine = fl.side[me].map((e) => e.c), theirs = fl.side[1 - me].map((e) => e.c);
    if (mine.length >= cap && theirs.length < cap) {
      if (v.claims === 'manual') hint = 'あなたはそろいました。場に見えているカードから「相手がどうやっても追いつけない」と言えるなら、自分のターンのはじめに旗をタップして宣言すると取れます（1ターンに1回・手札は証明に使えません）。';
      else {
        const ms = E.bestStrength(mine, cap, fog, null), ob = E.bestStrength(theirs, cap, fog, unseen);
        const obProof = E.bestStrength(theirs, cap, fog, E.unseenMask(s));   // what the rules let us prove (our hand stays hidden)
        if (obProof <= ms) hint = '相手はもう追いつけません。次のあなたの手番で自動的に取れます。';
        else if (ob <= ms) hint = '逆転に必要なカードはあなたの手札にあるので、相手はもう追いつけません。ただし手札は証明に使えないので、そのカードを場に出すか相手がそろえるまで旗は取れません。';
        else hint = '相手が <b>' + esc(E.strengthLabel(ob, fog)) + '</b> までそろえると逆転されます。';
      }
    } else if (theirs.length >= cap && mine.length < cap) {
      const ts = E.bestStrength(theirs, cap, fog, null), mb = E.bestStrength(mine, cap, fog, myPool);
      hint = mb > ts ? '相手は <b>' + esc(E.strengthLabel(ts, fog)) + '</b>。これを超える役ができれば逆転できます。' : 'ここはもう相手を超えられません。弱いカードの置き場に使えます。';
    } else if (mine.length >= cap && theirs.length >= cap) hint = v.claims === 'manual' ? 'どちらもそろいました。強い方が取ります。' : 'どちらもそろいました。次に手番が来た強い方が取ります。';
    else hint = '旗をタップすると、ここに表示する旗を切り替えられます。';
  } else if (fl.claim) {
    const how = { direct: 'そろった役の比べ合い', proof: '相手が追いつけないと分かった', tie: '同点で、先にそろえた', end: '動けなくなった時にそろっていた' }[fl.claim.how] || '';
    hint = (fl.claimed === me ? 'あなた' : '相手') + 'が確保（' + how + '）';
  }
  D.innerHTML = '<div class="insp-h"><span class="fn">旗 ' + (f + 1) + '</span>' + st0 + wx +
    '<span class="nav"><button type="button" data-d="-1" aria-label="左の旗"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button type="button" data-d="1" aria-label="右の旗"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></span></div>' +
    row(1 - me) + row(me) + (hint ? '<div class="insp-hint">' + hint + '</div>' : '') +
    '<div class="insp-ref" data-rules>役の強さ：<b>楔形</b>(同色の連番)＞<b>密集</b>(同じ数)＞<b>大隊</b>(同色)＞<b>散兵</b>(連番)＞<b>合計</b> ・同じ役は合計で勝負</div>';
  D.querySelectorAll('.nav button').forEach((b) => { b.onclick = () => setFocus((focus + Number(b.dataset.d) + 9) % 9); });
  D.querySelector('[data-rules]').onclick = openRules;
}

/* ================================================================ labels on the table */
const tags = {};
function buildTags() {
  const box = $('#tags'); box.innerHTML = '';
  const mk = (cls) => { const d = document.createElement('div'); d.className = 'tag ' + cls; box.appendChild(d); return d; };
  tags.deckT = mk('deck'); tags.deckX = mk('deck'); tags.disc = mk('deck'); tags.opp = mk('who');
  tags.form = [];
  for (let f = 0; f < 9; f++) tags.form.push([mk('form'), mk('form')]);
}
function renderTags() {
  if (!view || !tags.deckT) return;
  const v = view, me = v.me;
  tags.deckT.innerHTML = '兵 <b>' + v.deck.T + '</b>';
  tags.deckX.innerHTML = '戦術 <b>' + v.deck.X + '</b>';
  tags.deckX.hidden = !v.tactics;
  const nd = v.discard[0].length + v.discard[1].length;
  tags.disc.innerHTML = '捨て札 <b>' + nd + '</b>'; tags.disc.hidden = nd === 0;
  const nm = match ? (match.mode === 'cpu' ? 'CPU（' + LEVEL_NAME[match.level] + '）' : match.oppName || '相手') : '相手';
  const tacInfo = v.tactics ? ' · 戦術' + v.tac[1 - me] + '枚使用' : '';
  tags.opp.innerHTML = '<span class="av">' + esc((nm || '?').slice(0, 1)) + '</span>' + esc(nm) + '<span class="st">手札' + v.opp.length + tacInfo + '</span>';
  tags.opp.classList.toggle('turn', v.turn !== me && v.phase !== 'over');
  v.flags.forEach((fl, f) => {
    const cap = E.capOf(fl), fog = fl.fog >= 0;
    [me, 1 - me].forEach((p, k) => {
      const el = tags.form[f][k], side = fl.side[p];
      if (side.length < cap) { el.hidden = true; return; }
      const sv = E.bestStrength(side.map((e) => e.c), cap, fog, null);
      const narrow = scene && (scene.mode === 'tall' || tagRoom() < 56);
      if (narrow && fl.claimed !== -1) { el.hidden = true; return; }   // phones held upright: no room, the inspector has it
      el.hidden = false; el.textContent = narrow ? tinyLabel(sv, fog) : shortLabel(sv, fog);
      el.className = 'tag form ' + (k === 0 ? 'me' : 'op') + (fl.claimed === p ? ' win' : fl.claimed === 1 - p ? ' lose' : '');
    });
  });
}
function tagRoom() {   // px between two neighbouring flags on screen
  if (!scene) return 99;
  const a = scene.flagAnchor(3, true), b = scene.flagAnchor(4, true);
  return Math.abs(b[0] - a[0]);
}
function placeTags() {
  if (!scene || !view || !tags.deckT) return;
  const a = scene.anchors();
  const put = (el, p) => { if (!el) return; el.style.left = p[0].toFixed(1) + 'px'; el.style.top = p[1].toFixed(1) + 'px'; };
  put(tags.deckT, a.deckT); put(tags.deckX, a.deckX); put(tags.disc, a.disc); put(tags.opp, a.opp);
  for (let f = 0; f < 9; f++) { put(tags.form[f][0], scene.flagAnchor(f, true)); put(tags.form[f][1], scene.flagAnchor(f, false)); }
}

/* ================================================================ taps on the table */
function flagOf(hit) {
  if (hit.lane) return hit.lane.f;
  if (hit.flag != null) return hit.flag;
  if (hit.card != null && view) { const at = E.locate(st(), hit.card); if (at) return at.f; }
  return null;
}
function onTap(x, y) {
  if (!scene || !match || !view) return;
  sfx.unlock();
  const hit = scene.pick(x, y);
  const v = view;
  if (hit.disc) { openDiscards(); return; }
  if (!myTurn() || presenting) {
    if (hit.hand != null) cardTip(hit.hand);
    else { const f = flagOf(hit); if (f != null) setFocus(f); }
    return;
  }
  if (v.phase === 'draw') {
    if (hit.deck) act({ t: 'draw', d: hit.deck });
    else if (hit.hand != null) cardTip(hit.hand);
    else { const f = flagOf(hit); if (f != null) setFocus(f); }
    return;
  }
  if (v.phase === 'scout') {
    if (v.scout && v.scout.left > 0 && v.deck.T + v.deck.X > 0) { if (hit.deck) act({ t: 'sdraw', d: hit.deck }); return; }
    if (hit.hand != null) {
      const need = v.scout ? v.scout.ret : 0, i = ui.ret.indexOf(hit.hand);
      if (i >= 0) ui.ret.splice(i, 1); else if (ui.ret.length < need) ui.ret.push(hit.hand); else { ui.ret.shift(); ui.ret.push(hit.hand); }
      sfx.play('sel'); renderPanel();
    }
    return;
  }
  const s = st(), me = v.me;
  // declaring: at the start of the turn, tap the flag itself (tap it again, or press the button, to declare)
  if (ui.sel == null && hit.flag != null) {
    const f = hit.flag;
    if (canDeclare(v, f)) {
      if (ui.step === 'declare' && ui.f === f) { act({ t: 'claim', f }); return; }
      ui = { sel: null, step: 'declare', f, x: null, ret: [] };
      setFocus(f, true); sfx.play('sel'); renderPanel();
      return;
    }
  }
  if (ui.step === 'declare') ui = { sel: null, step: null, x: null, ret: [] };
  if (hit.hand != null) {
    const c = hit.hand;
    if (ui.sel === c) { if (c === E.SCOUT) { act({ t: 'scout', c }); return; } ui = { sel: null, step: null, x: null, ret: [] }; renderPanel(); return; }
    const why = E.whyNot(s, me, c);
    if (why) { sfx.play('deny'); toast(esc(why), 'warn'); cardTip(c, true); return; }
    ui = { sel: c, step: c === E.REDEPLOY || c === E.TRAITOR ? 'pick' : null, x: null, ret: [] };
    sfx.play('sel'); renderPanel();
    return;
  }
  const c = ui.sel;
  const f = flagOf(hit);
  if (c == null) { if (f != null) setFocus(f); return; }
  const t = targetsFor(s, c);
  if (t.flags) {
    if (f == null) return;
    if (!t.flags.includes(f)) { sfx.play('deny'); toast('その旗には置けません', 'warn'); return; }
    setFocus(f, true);
    act(t.env ? { t: 'env', c, f } : { t: 'card', c, f });
    return;
  }
  if (c === E.REDEPLOY) {
    const mine = E.movableCards(s, me, false);
    if (hit.card != null && mine.includes(hit.card) && hit.card !== ui.x) { ui.x = hit.card; ui.step = 'to'; sfx.play('sel'); renderPanel(); return; }
    if (ui.step === 'to' && f != null) {
      const ok = redeployDest(s, ui.x);
      if (ok.includes(f)) act({ t: 'redeploy', c, x: ui.x, to: f });
      else { sfx.play('deny'); toast('そこには移せません', 'warn'); }
    }
    return;
  }
  if (c === E.DESERTER) {
    if (hit.card != null && E.movableCards(s, 1 - me, false).includes(hit.card)) act({ t: 'deserter', c, x: hit.card });
    else if (hit.card != null || f != null) { sfx.play('deny'); toast('相手のカード（旗を取っていない列）を選んでください', 'warn'); }
    return;
  }
  if (c === E.TRAITOR) {
    const theirs = E.movableCards(s, 1 - me, true);
    if (hit.card != null && theirs.includes(hit.card)) { ui.x = hit.card; ui.step = 'to'; sfx.play('sel'); renderPanel(); return; }
    if (ui.step === 'to' && f != null) {
      if (E.openFlags(s, me).includes(f)) act({ t: 'traitor', c, x: ui.x, to: f });
      else { sfx.play('deny'); toast('その旗には置けません', 'warn'); }
    }
  }
}
function cardTip(c, quiet) {
  if (c >= 60) toast(cardLabel(c) + '：' + esc(E.TAC_TEXT[c]), '', 4200);
  else if (!quiet) toast(cardLabel(c), '', 1400);
}
function bindStage() {
  const el = $('#stage');
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
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
  const forms = [
    ['楔形', '同じ色の連番', [32, 33, 34]], ['密集', '同じ数字', [6, 26, 46]], ['大隊', '同じ色', [41, 44, 49]], ['散兵', '数字の連番', [3, 14, 25]], ['寄せ集め', 'そのほか（合計で勝負）', [9, 21, 57]]
  ];
  $('#rulesForms').innerHTML = forms.map((r) => '<div class="mcrow">' + r[2].map((c) => mini(c)).join('') + '</div><div class="nm">' + r[0] + '<small>' + r[1] + '</small></div>').join('');
  $('#rulesTactics').innerHTML = [60, 62, 63, 64, 65, 66, 67, 68, 69].map((c) => mini(c) + '<p><b>' + esc(E.TAC_NAME[c]) + (c === 60 ? '（2枚）' : '') + '</b>　' + esc(E.TAC_TEXT[c]) + '</p>').join('');
  // the ten troops, one of each value, in turning colors
  const roster = $('#rulesUnits');
  if (roster) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(76 * dpr), H = Math.round(76 * dpr * 286 / 204);
    for (let v = 1; v <= 10; v++) {
      const fig = document.createElement('figure'), cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      try { paintCard(cv.getContext('2d'), ((v - 1) % 6) * 10 + v - 1, 0, 0, W, H); } catch (e) { /* drawing is decoration only */ }
      const cap = document.createElement('figcaption');
      cap.innerHTML = '<b>' + v + '</b>' + esc(UNIT_NAME[v - 1]);
      fig.append(cv, cap); roster.appendChild(fig);
    }
  }
}
function openMenu() {
  const inGame = !!(match && match.alive);
  const el = openLayer(sheet('メニュー', '<div class="menu-list">' +
    '<button class="btn" data-m="rules">あそびかた</button>' +
    (inGame ? '<button class="btn" data-m="disc">捨て札を見る</button>' : '') +
    '<button class="btn" data-m="settings">設定</button>' +
    (inGame ? '<button class="btn danger" data-m="quit">タイトルへ戻る</button>' : '') + '</div>'));
  el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    const k = b.dataset.m;
    if (k === 'rules') openRules();
    else if (k === 'disc') openDiscards();
    else if (k === 'settings') openSettings();
    else if (k === 'quit') confirmQuit();
  });
}
function confirmQuit() {
  const online = match && match.mode !== 'cpu' && view && view.phase !== 'over';
  const el = openLayer(sheet('タイトルへ戻る', '<p>' + (online ? 'ゲームをやめてタイトルに戻りますか？（相手との接続も切れます）' : 'ゲームをやめてタイトルに戻りますか？') + '</p><div class="row"><button class="btn ghost" data-close>続ける</button><button class="btn danger" id="qYes">やめる</button></div>'));
  el.querySelector('#qYes').onclick = () => { closeLayer(); quitToTitle(); };
}
function openSettings() {
  const seg = (id, opts, cur) => '<div class="seg" id="' + id + '">' + opts.map((o) => '<button data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>').join('') + '</div>';
  const el = openLayer(sheet('設定',
    '<div class="field"><span>音（効果音とBGM）</span>' + seg('sSound', [['1', 'オン'], ['0', 'オフ']], prefs.sound ? 1 : 0) + '</div>' +
    '<div class="field"><span>BGM</span>' + seg('sBgm', [['1', 'オン'], ['0', 'オフ']], prefs.bgm ? 1 : 0) + '</div>' +
    '<div class="field"><span>テーブルの色</span>' + seg('sFelt', [['green', 'みどり'], ['navy', 'あお'], ['wine', 'ワイン']], prefs.felt) + '</div>' +
    '<div class="field"><span>演出の速さ</span>' + seg('sSpeed', [['1', 'ふつう'], ['1.8', 'はやい']], prefs.speed) + '</div>' +
    '<div class="field"><span>陣形がそろった時の演出</span>' + seg('sFx', [['full', 'フル'], ['short', '短め'], ['off', 'オフ']], prefs.fx) + '</div>' +
    '<div class="field"><span>画質</span>' + seg('sQuality', [['high', 'きれい'], ['low', '軽い']], prefs.quality) + '</div>'));
  const bind = (id, fn) => el.querySelectorAll('#' + id + ' button').forEach((b) => b.onclick = () => {
    el.querySelectorAll('#' + id + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fn(b.dataset.v);
  });
  bind('sSound', (v) => { prefs.sound = v === '1'; store.set('sound', prefs.sound); audioOn(); bgm.apply(); renderHud(); });
  bind('sBgm', (v) => { prefs.bgm = v === '1'; store.set('bgm', prefs.bgm); audioOn(); bgm.apply(); });
  bind('sFelt', (v) => { prefs.felt = v; store.set('felt', v); scene.setFelt(v); });
  bind('sSpeed', (v) => { prefs.speed = Number(v); store.set('speed', prefs.speed); scene.speed = prefs.speed; });
  bind('sQuality', (v) => { prefs.quality = v; store.set('quality', v); scene.setQuality(v); onResize(); });
  bind('sFx', (v) => { prefs.fx = v; store.set('fx', v); });
}
function openDiscards() {
  if (!view) return;
  const v = view, row = (arr) => arr.length ? '<div class="mcrow">' + arr.map((c) => mini(c)).join('') + '</div>' : '<p class="note">まだありません</p>';
  openLayer(sheet('捨て札', '<h4>' + (match && match.mode === 'cpu' ? 'CPU' : esc(match ? match.oppName || '相手' : '相手')) + '</h4>' + row(v.discard[1 - v.me]) + '<h4>あなた</h4>' + row(v.discard[v.me]) +
    '<p class="note">使った偵察・再配置・脱走・寝返りと、捨て札になったカードです。</p>'));
}
function openFlag(f) {
  if (!view) return;
  const v = view, me = v.me, fl = v.flags[f], cap = E.capOf(fl), fog = fl.fog >= 0;
  const s = st();
  const sideHtml = (p) => {
    const side = fl.side[p], cards = side.map((e) => e.c);
    const slots = cards.map((c) => mini(c, true)); while (slots.length < cap) slots.push(mini(null, true));
    let lbl = '';
    if (cards.length >= cap) { const ex = E.explain(cards, fog); lbl = E.strengthLabel(ex.strength, fog); const w = ex.wilds.filter((x) => x.c >= 60).map((x) => E.TAC_NAME[x.c] + '＝' + E.COLOR_NAME[x.color] + 'の' + x.value); if (w.length) lbl += '（' + w.join('、') + '）'; }
    else lbl = 'あと' + (cap - cards.length) + '枚';
    const won = fl.claimed === p;
    return '<div class="fside ' + (p === me ? 'me' : 'op') + (won ? ' won' : '') + '"><div class="who">' + (p === me ? 'あなた' : esc(match && match.mode === 'cpu' ? 'CPU' : (match && match.oppName) || '相手')) + (won ? ' ⚑' : '') + '<span class="lbl">' + esc(lbl) + '</span></div><div class="mcrow">' + slots.join('') + '</div></div>';
  };
  let mid = '<div class="fmid">' + (fog ? '<span class="wx">霧：合計で勝負</span>' : '') + (fl.mud >= 0 ? '<span class="wx mud">泥沼：4枚ずつ</span>' : '') + (!fog && fl.mud < 0 ? '旗 ' + (f + 1) : '') + '</div>';
  let hint = '';
  if (fl.claimed === -1) {
    // what the other side could still finish, using only what is visible to us
    const unseen = E.unseenMask(s); v.hand.forEach((c) => { if (c < 60) unseen[c] = 0; });
    const theirs = fl.side[1 - me].map((e) => e.c), mine = fl.side[me].map((e) => e.c);
    const oppBest = E.bestStrength(theirs, cap, fog, theirs.length >= cap ? null : unseen);
    const myPool = new Uint8Array(unseen); v.hand.forEach((c) => { if (c < 60) myPool[c] = 1; });
    const myBest = E.bestStrength(mine, cap, fog, mine.length >= cap ? null : myPool);
    const lines = [];
    if (theirs.length < cap) lines.push('相手がまだ作れる最強：<b>' + esc(E.strengthLabel(oppBest, fog)) + '</b>');
    if (mine.length < cap) lines.push('あなたが作れる最強（手札＋見えていないカード）：<b>' + esc(E.strengthLabel(myBest, fog)) + '</b>');
    if (mine.length >= cap && theirs.length < cap) lines.push(oppBest <= E.bestStrength(mine, cap, fog, null) ? 'もう相手は追いつけません。次のあなたの手番で取れます。' : '相手にまだ逆転の可能性があります。');
    if (lines.length) hint = '<p class="hint">' + lines.join('<br>') + '</p>';
  } else if (fl.claim) {
    const how = { direct: 'そろった役の比べ合い', proof: '相手が追いつけないと分かった', tie: '同点で、先にそろえた', end: '動けなくなった時にそろっていた' }[fl.claim.how] || '';
    hint = '<p class="hint">' + (fl.claimed === me ? 'あなた' : '相手') + 'が確保（' + how + '）</p>';
  }
  openLayer(sheet('旗 ' + (f + 1), sideHtml(1 - me) + mid + sideHtml(me) + hint));
}
function openResult() {
  if (match && match.tournament) { tournaments.result(); return; }
  if (!view || !match) return;
  const v = view, m = match, se = m.mode === 'guest' ? (m.series || null) : m.series;
  const won = v.winner === v.me, draw = v.winner === 2;
  const howTxt = { breakthrough: 'となり合う3本の旗を取った（突破）', envelopment: '5本の旗を取った（包囲）', count: '動けなくなり、旗の数で決着', draw: '旗の数も同じでした' }[v.win] || '';
  const mf = v.flags.filter((fl) => fl.claimed === v.me).length, of = v.flags.filter((fl) => fl.claimed === 1 - v.me).length;
  const oppNm = m.mode === 'cpu' ? 'CPU（' + LEVEL_NAME[m.level] + '）' : esc(m.oppName || '相手');
  let series = '';
  if (se && se.games) {
    const mi = m.mode === 'guest' ? 0 : 0;   // series are always stored from our side
    series = '<p class="note" style="text-align:center">通算 ' + se.games + '戦：あなた ' + se.wins[mi] + '勝（' + se.pts[mi] + '点）／ ' + oppNm + ' ' + se.wins[1 - mi] + '勝（' + se.pts[1 - mi] + '点）<br>勝つと5点、負けても取った旗1本につき1点</p>';
  }
  const canAgain = m.mode === 'cpu';
  const body = '<p class="result-big ' + (won ? 'win' : draw ? '' : 'lose') + '">' + (won ? '勝利！' : draw ? '引き分け' : '敗北…') + '</p>' +
    '<p style="text-align:center;margin:0">' + esc((v.winner === v.me ? 'あなたが' : draw ? '' : '相手が') + howTxt) + '</p>' +
    '<div class="scoreline"><span>あなた <b style="color:var(--brass)">' + mf + '</b>本</span><span>' + oppNm + ' <b style="color:var(--them)">' + of + '</b>本</span></div>' + series +
    '<div class="row">' + (canAgain ? '<button class="btn primary" id="rAgain">もう一度</button>' : m.mode === 'guest' ? '<p class="note" style="flex:1 1 100%;text-align:center">ホストが次のゲームを始めるのを待っています</p>' : '') +
    '<button class="btn ghost" id="rTable">盤面を見る</button><button class="btn" id="rTitle">タイトルへ</button></div>';
  const el = openLayer(sheet('結果', body));
  const again = el.querySelector('#rAgain');
  if (again) again.onclick = () => { closeLayer(); if (m.mode === 'cpu') startSolo(true);  };
  el.querySelector('#rTable').onclick = closeLayer;
  el.querySelector('#rTitle').onclick = () => { closeLayer(); quitToTitle(); };
}

/* ================================================================ screens */
function hideScreens() { ['#scrTitle', '#scrSolo', '#scrTour', '#scrOnline'].forEach((s) => { $(s).hidden = true; }); }
function showScreen(id) { hideScreens(); $(id).hidden = false; }
function quitToTitle() {
  tournaments.leave(); watchSpeed = 1;
  if (match) match.alive = false;
  match = null; queue.length = 0; presenting = false; view = null;
  if (lobby) { try { lobby.link.send({ k: 'bye' }); } catch (e) { /* ignore */ } lobby.link.close(); lobby = null; }
  resetOnlineUI();
  closeLayer();
  document.body.classList.remove('ingame'); onResize();
  bgm.setMood('title');
  attractTable();
  showScreen('#scrTitle');
}
function attractTable() {
  if (!scene) return;
  const s = E.newGame({ seed: 20261015, tactics: true });
  // a frozen mid-game picture for the title screen
  const plan = [[0, 4, 33], [1, 4, 5], [0, 4, 34], [1, 2, 47], [0, 3, 22], [1, 4, 6], [0, 6, 9], [1, 6, 19], [0, 2, 41], [1, 1, 56]];
  plan.forEach(([p, f, c]) => { s.clock++; s.flags[f].side[p].push({ c, t: s.clock }); });
  s.flags[4].side[0].push({ c: 32, t: ++s.clock }); s.flags[4].claimed = 0;
  s.flags[6].fog = 1;
  s.hands[0] = [12, 13, 27, 44, 51, 60, 66]; s.hands[1] = [0, 1, 2, 3, 62, 7, 8];
  s.deck.T.length = 30; s.deck.X.length = 7;
  scene.clear();
  scene.setView(E.viewFor(s, 0), { instant: true });
  scene.setAttract(true);
}

/* ================================================================ online */
function resetOnlineUI() {
  $('#onPick').hidden = false; $('#onLobby').hidden = true; $('#lobStart').hidden = true;
  $('#onCreate').disabled = false; $('#onJoin').disabled = false; $('#onErr').hidden = true;
}

/* ================================================================ wiring and boot */
function segInit(id, cur, fn) {
  const box = $(id);
  box.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(String(cur) === b.dataset.v));
    b.onclick = () => { box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v); };
  });
}
const LEVEL_NOTE = {
  1: 'のんびり打ちます。はじめての方に。',
  2: 'これから引くカードまで考えて打ちます。',
  3: '何通りもの展開を読み比べて打ちます。',
  4: '旗を1本ずつ見きわめて打つ最強のCPU。「つよい」に5戦4勝するくらいの腕前です。'
};
function levelNote() { const el = $('#levelNote'); if (el) el.textContent = LEVEL_NOTE[prefs.level] || ''; }
function rulesNote() { $('#rulesNote').textContent = prefs.tactics ? '指揮官や霧などの戦術カード10枚も使う、元のゲームの上級ルールです。' : '兵カード60枚だけで遊ぶ基本ルールです。はじめての方におすすめ。'; }
function wire() {
  $('#goSolo').onclick = () => { sfx.unlock(); showScreen('#scrSolo'); };
  $('#goOnline').onclick = () => { sfx.unlock(); resetOnlineUI(); showScreen('#scrOnline'); };
  $('#goRules').onclick = openRules;
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { if (!match) tournaments.leave(); if (lobby && !match) { try { lobby.link.send({ k: 'bye' }); } catch (e) { /* ignore */ } lobby.link.close(); lobby = null; } resetOnlineUI(); showScreen('#scrTitle'); }; });
  segInit('#segLevel', prefs.level, (v) => { prefs.level = Number(v); store.set('level', prefs.level); levelNote(); });
  segInit('#segRules', prefs.tactics ? 1 : 0, (v) => { prefs.tactics = v === '1'; store.set('tactics', prefs.tactics); rulesNote(); });
  segInit('#segOnRules', prefs.onTactics ? 1 : 0, (v) => { prefs.onTactics = v === '1'; store.set('onTactics', prefs.onTactics); });
  rulesNote(); levelNote();
  $('#soloStart').onclick = () => { sfx.unlock(); startSolo(false); if (!store.get('seenTips', false)) { store.set('seenTips', true); setTimeout(() => toast('旗をタップすると、その列の詳しい様子が見られます', '', 4200), 2600); } };
  $('#onName').value = prefs.name;
  $('#onCreate').onclick = () => { sfx.unlock(); tournaments.createRoom(); };
  $('#onJoin').onclick = () => { sfx.unlock(); tournaments.joinRoom(); };
  $('#onCode').addEventListener('input', (e) => { e.target.value = N.cleanCode(e.target.value); });
  $('#btnMenu').onclick = () => { sfx.unlock(); openMenu(); };
  $('#btnSound').onclick = () => { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); audioOn(); bgm.apply(); renderHud(); if (prefs.sound) sfx.play('sel'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });
  document.addEventListener('pointerdown', audioOn, { capture: true, passive: true });
  tournaments.wire();
  bindStage();
  // logo: nine little flags
  $('#logoFlags').innerHTML = Array.from({ length: 9 }, (_, i) => '<svg viewBox="0 0 24 30"><path d="M5 29V2" stroke="#c99a3a" stroke-width="2.4" stroke-linecap="round"/><path d="M6 3l15 5-15 6z" fill="' + (i === 3 || i === 4 || i === 5 ? '#f2c14e' : i === 1 || i === 7 ? '#e0566a' : '#f5ecd6') + '"/></svg>').join('');
}
function sizeStage() {
  const app = $('#app'), playing = document.body.classList.contains('ingame');
  const wide = window.matchMedia('(min-aspect-ratio: 5/4)').matches;
  if (!playing || wide) { app.style.removeProperty('--stageH'); return; }
  const W = app.clientWidth, H = app.clientHeight - $('#topbar').offsetHeight - $('#bar').offsetHeight;
  const want = Math.round(W * 1.2), stageH = Math.max(Math.min(want, H - 110), Math.min(H, 260));
  app.style.setProperty('--stageH', stageH + 'px');
}
function onResize() {
  if (!scene) return;
  sizeStage();
  const r = $('#stageWrap').getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  const playing = document.body.classList.contains('ingame');
  scene.resize(w, h, playing ? Math.min(44, h * 0.07) : 0, playing ? 4 : 0);
  if (fx) fx.resize();
  if (playing) renderTags();
}
async function boot() {
  wire();
  try { await Promise.race([Promise.all([document.fonts.load('700 40px "Fredoka"'), document.fonts.load('900 30px "Zen Maru Gothic"'), document.fonts.load('400 30px "Mochiy Pop One"')]), new Promise((r) => setTimeout(r, 2200))]); } catch (e) { /* fonts are optional */ }
  try {
    await loadThree();
    scene = createScene($('#stage'), { felt: prefs.felt, quality: prefs.quality });
    fx = createFx($('#stageWrap'));
  } catch (e) {
    console.error(e);
    $('#loader').classList.add('err');
    $('#loaderMsg').textContent = '3D表示を準備できませんでした。通信状況を確認して、ページを再読み込みしてください。';
    return;
  }
  scene.speed = prefs.speed;
  if (prefs.quality !== 'high') scene.setQuality(prefs.quality);
  scene.onFrame = placeTags;
  // fonts that arrive late are redrawn onto the cards
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scene.refreshFonts());
  const ro = new ResizeObserver(onResize); ro.observe($('#stageWrap'));
  window.addEventListener('resize', onResize);
  onResize();
  $('#loader').hidden = true;
  attractTable();
  showScreen('#scrTitle');
  const room = N.cleanCode(params.get('room') || '');
  if (room) { showScreen('#scrOnline'); $('#onCode').value = room; }
  if (TEST) window.__htn = {
    scene, E, AI, get match() { return match; }, get view() { return view; }, get presenting() { return presenting; }, get lobby() { return lobby; }, act, onTap, startSolo, prefs,
    tournaments, get ui() { return ui; }, get fx() { return fx; },
    load(state, level) {   // tests: continue a solo game from a given engine state
      const m = { mode: 'cpu', id: ++matchSeq, s: JSON.parse(JSON.stringify(state)), me: 0, level: level || 2, tactics: state.tactics, alive: true, series: newSeries([myName(), 'CPU']), oppName: 'CPU', cpuBusy: false };
      beginMatch(m, E.viewFor(m.s, 0));
    }
  };
}
const tournaments = createTournaments({
  E, AI, $, prefs, store, esc, sheet, openLayer, closeLayer, toast, sfx, showScreen, cpuChoose, mini,
  myName, segInit, netkind: NETKIND, begin: beginMatch, enqueue, render: renderAll, quit: quitToTitle, stamp,
  match: () => match, view: () => view, presenting: () => presenting,
  setWatchSpeed: (v) => { watchSpeed = v; },
  replaceView: (v) => { view = v; if (match) { match.me = v.me; match.oppName = match.names[1 - v.me]; } scene.setView(v, { instant: true }); renderAll(); },
  clearMatch: () => { if (match) match.alive = false; match = null; queue.length = 0; view = null; document.body.classList.remove('ingame'); $('#btnTour').hidden = true; $('#watchBar').hidden = true; attractTable(); }
});
boot();

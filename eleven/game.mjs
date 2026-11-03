// イレブン — table UI. Rules and CPU live in engine.mjs; this file only draws the table and drives turns.
import {COLORS, newGame, sequence, canScore, takeAction, cpuAction, deck} from './engine.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const KEY = 'playroom.eleven.v1', PREFS = 'playroom.eleven.prefs.v2';
const params = new URLSearchParams(location.search);
const FAST = params.get('test') === '1';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 15) : reduceMotion ? Math.min(ms, 260) : ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const LABEL = {blue: '青', green: '緑', purple: '紫', orange: '橙', red: '赤', wild: '無色'};
const GEM = {blue: 'サファイア', green: 'エメラルド', purple: 'アメジスト', orange: 'トパーズ', red: 'ルビー', wild: 'ダイヤ'};
const CPU_AV = [
  {name: 'ジェイド', c: '#62D2A2', i: '#06261A'},
  {name: 'オパール', c: '#D8E6F6', i: '#1B2252'},
  {name: 'ガーネット', c: '#D0515F', i: '#FFFFFF'},
  {name: 'アンバー', c: '#F2AE46', i: '#2B1D04'},
  {name: 'オニキス', c: '#5A6286', i: '#FFFFFF'},
];
const PLAYER_AV = ['#F6D27B', '#7FB6FF', '#7ADBA8', '#C9A2FF', '#FF9FB0', '#FFB870'];

/* ================================================================ preferences & sound */
const prefs = Object.assign({sound: true, sort: 'number', count: 3, localCount: 3, level: 'normal', names: []}, (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } })());
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };

const Sound = {
  ctx: null, out: null,
  context() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      this.ctx = new C(); this.out = this.ctx.createGain(); this.out.gain.value = .55;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 5;
      this.out.connect(lp); lp.connect(comp); comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  tone(f, d, v, {at = 0, to = f, type = 'sine'} = {}) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(.00001, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.00001, t + d);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + d + .03); o.onended = () => { o.disconnect(); g.disconnect(); };
  },
  noise(d, v, freq = 1000, at = 0) {
    const c = this.ctx, t = c.currentTime + at, n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = .7;
    g.gain.setValueAtTime(.00001, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.00001, t + d);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + d); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  },
  play(name) {
    if (!prefs.sound || FAST || document.hidden) return;
    let c; try { c = this.context(); } catch { return; } if (!c) return;
    const T = this.tone.bind(this), N = this.noise.bind(this);
    switch (name) {
      case 'tap': T(1180, .045, .028, {type: 'triangle'}); break;
      case 'card': T(210, .13, .07, {to: 140}); N(.08, .03, 700); break;
      case 'draw': N(.16, .05, 2200); T(520, .07, .012, {to: 760}); break;
      case 'run': T(523, .15, .05); T(659, .17, .04, {at: .07}); T(784, .22, .035, {at: .14}); break;
      case 'flip': N(.07, .05, 3000); T(880, .06, .015); break;
      case 'score': [523, 659, 784, 1046].forEach((f, i) => T(f, .3, .05, {at: i * .08})); T(1568, .5, .02, {at: .34}); break;
      case 'win': [523, 659, 784].forEach((f, i) => T(f, .2, .06, {at: i * .12})); T(1046, .8, .07, {at: .36}); T(784, .8, .035, {at: .36}); T(1318, .7, .025, {at: .48}); break;
      case 'turn': T(988, .22, .028); T(1318, .3, .016, {at: .06}); break;
      case 'thump': T(110, .22, .16, {to: 62}); N(.09, .05, 420); break;
      case 'error': T(240, .14, .04, {to: 180, type: 'square'}); break;
    }
  },
};
document.addEventListener('pointerdown', () => { if (prefs.sound) try { Sound.context(); } catch {} }, {once: true});

/* ================================================================ cards */
const gemSvg = color => `<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#gem-${color}"/></svg>`;
function cardName(c, as) { return c.color === 'wild' ? (as == null ? '10/0' : `10/0（${as}）`) : `${LABEL[c.color]}${c.n}`; }
function cardHTML(c, o = {}) {
  const tag = o.tag || 'div', wild = c.color === 'wild', as = o.as;
  const shown = wild ? (as == null ? null : String(as)) : String(c.n);
  const u = !wild && (c.n === 6 || c.n === 9) ? ' class="u"' : '';
  const idx = shown ? `<b${u}>${shown}</b>` : '<b>10</b><i>0</i>';
  const big = shown ? (u ? `<u>${shown}</u>` : shown) : '10<small>/0</small>';
  const cls = `card c-${c.color}${o.mini ? ' mini' : ''}${wild && as != null ? ' as' : ''}${o.cls ? ' ' + o.cls : ''}`;
  const label = esc(o.label || cardName(c, as));
  const a11y = tag === 'button' ? ` type="button" aria-label="${label}"` : ` role="img" aria-label="${label}"`;
  return `<${tag} class="${cls}"${o.noId ? '' : ` data-cid="${c.id}"`}${a11y}${o.attrs ? ' ' + o.attrs : ''}${o.style ? ` style="${o.style}"` : ''}>`
    + `<span class="idx">${idx}${gemSvg(c.color)}</span><span class="face">${o.mini ? '' : gemSvg(c.color)}<b class="big">${big}</b></span>`
    + (o.mini ? '' : `<span class="idx r">${idx}${gemSvg(c.color)}</span>`) + (o.tag2 ? `<span class="tag">${o.tag2}</span>` : '') + `</${tag}>`;
}
const backHTML = (cls = '') => `<div class="card back${cls ? ' ' + cls : ''}" aria-hidden="true"></div>`;
const chip = (c, as) => `<span class="chip c-${c.color}">${c.color === 'wild' ? (as == null ? '10/0' : as) : c.n}</span>`;
// a wild in a run sits at an end: first = 0, last = 10 (alone it is ambiguous)
const runValue = (run, k) => run[k].color !== 'wild' ? run[k].n : run.length === 1 ? null : k === 0 ? 0 : 10;
const runChips = run => run.map((c, k) => chip(c, runValue(run, k))).join('');

/* ================================================================ state */
let state = null, viewSeat = 0, ready = false, selected = [], busy = false, cpuTimer = null, gen = 0;
let hint = null, freshIds = new Set(), lastNote = null, sheet = null, toastTimer = null, lastConfig = null;
const dispScore = new Map();

function savedGame() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function valid(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.players) || s.players.length < 2 || s.players.length > 6 || !Number.isInteger(s.turn) || s.turn < 0 || s.turn >= s.players.length || !['cpu', 'local'].includes(s.mode)) return false;
  try {
    const all = [...s.pile, ...s.discard, s.exchange, ...s.players.flatMap(p => [...p.hand, ...p.run, ...p.points])], ref = deck();
    return all.length === 100 && new Set(all.map(c => c.id)).size === 100 && all.every(c => ref[c.id]?.n === c.n && ref[c.id]?.color === c.color)
      && s.players.every(p => p.hand.length <= 11 && Number.isFinite(p.score) && typeof p.name === 'string')
      && (s.winner === null || Number.isInteger(s.winner) && s.winner >= 0 && s.winner < s.players.length);
  } catch { return false; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

const seatName = i => state.mode === 'cpu' && i === 0 ? 'あなた' : state.players[i].name;
const shownScore = i => dispScore.has(i) ? dispScore.get(i) : state.players[i].score;
function avatar(i) {
  const p = state.players[i];
  if (state.mode === 'cpu') {
    if (i === 0) return {ch: 'あ', c: '#F6D27B', i: '#2B1D04'};
    const a = CPU_AV.find(x => x.name === p.name) || CPU_AV[(i - 1) % CPU_AV.length];
    return {ch: [...p.name][0] || 'C', c: a.c, i: a.i};
  }
  const m = /^プレイヤー(\d+)$/.exec(p.name);
  return {ch: m ? m[1] : [...p.name][0] || '?', c: PLAYER_AV[i % PLAYER_AV.length], i: '#10162E'};
}
function avHTML(i) { const a = avatar(i); return `<span class="av" style="--avc:${a.c};--avi:${a.i}">${esc(a.ch)}</span>`; }
function hcHTML(i) { const n = state.players[i].hand.length; return `<span class="hc" aria-label="手札${n}枚"><i></i>${n}</span>`; }
const pipsHTML = (score, cls = 'pips') => `<span class="${cls}" aria-label="${score}点／11点">${Array.from({length: 11}, (_, k) => `<i${k < score ? ' class="on"' : ''}></i>`).join('')}</span>`;
const isMyTurn = () => !!state && ready && !busy && state.winner === null && !state.players[state.turn].cpu && state.turn === viewSeat;
const canPick = () => isMyTurn() && selected.length === 1;
const chosen = () => selected.map(id => state.players[viewSeat].hand.find(c => c.id === id)).filter(Boolean);
function others() { const n = state.players.length; return Array.from({length: n - 1}, (_, k) => (viewSeat + 1 + k) % n); }
function sortHand(hand) {
  const ci = c => c.color === 'wild' ? 9 : COLORS.indexOf(c.color);
  return [...hand].sort((a, b) => prefs.sort === 'number' ? (a.n - b.n || ci(a) - ci(b) || a.id - b.id) : (ci(a) - ci(b) || a.n - b.n || a.id - b.id));
}

/* ================================================================ screens */
const SCREENS = ['scrTitle', 'scrSetup'];
function showScreen(id) {
  SCREENS.forEach(s => { $('#' + s).hidden = s !== id; });
  document.body.classList.toggle('ingame', !id);
  if (id) { $('#' + id).scrollTop = 0; }
}
function drawSparks() {
  if (reduceMotion) return;
  let h = '';
  for (let i = 0; i < 18; i++) h += `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--s:${(6 + Math.random() * 10).toFixed(1)}px;--d:${(4 + Math.random() * 5).toFixed(1)}s;--w:${(Math.random() * 7).toFixed(1)}s;--o:${(.3 + Math.random() * .5).toFixed(2)}"></i>`;
  $('#bg').innerHTML = h;
}
function drawHeroFan() {
  const fan = [['wild', 10, 0], ['red', 1], ['orange', 2], ['green', 3], ['blue', 4], ['purple', 5], ['red', 6]];
  const step = Math.min(34, Math.max(16, (Math.min(innerWidth, 560) - 180) / 8));
  $('#heroFan').innerHTML = fan.map(([color, n, as], i) => cardHTML({id: 'hero' + i, color, n}, {as, style: `transform:translateX(calc(-50% + ${((i - 3) * step).toFixed(1)}px)) rotate(${(i - 3) * 7}deg);z-index:${i + 1};animation-delay:${i * 70}ms`})).join('');
}
function refreshResume() {
  const s = savedGame(), ok = valid(s) && s.winner === null, b = $('#goResume');
  b.hidden = !ok;
  if (ok) b.innerHTML = `続きから<small>${s.mode === 'local' ? 'みんなで' : 'CPU戦'}・${s.players.length}人・TURN ${s.moves + 1}</small>`;
  $('#goCpu').className = ok ? 'btn big' : 'btn primary big';
}
function syncSoundLabels() {
  $('#goSound').textContent = `効果音：${prefs.sound ? 'ON' : 'OFF'}`;
}
function goTitle() {
  gen++; clearTimeout(cpuTimer); busy = false; dispScore.clear();
  closeSheet(true); $('#handoff')?.remove(); $('#confetti')?.remove(); $('#stamp').innerHTML = ''; $('#fly').innerHTML = '';
  if (state) save();
  state = null;
  showScreen('scrTitle'); refreshResume(); drawHeroFan();
}

/* setup */
let setupMode = 'cpu';
function openSetup(mode) { setupMode = mode; showScreen('scrSetup'); syncSetup(); }
function syncSetup() {
  const cpu = setupMode === 'cpu', count = cpu ? prefs.count : prefs.localCount;
  $('#setupTitle').textContent = cpu ? 'CPUと対戦' : 'みんなで対戦';
  $('#countLabel').textContent = cpu ? '人数（あなた＋CPU）' : '人数（1台を順番に回します）';
  $$('#segCount button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === count)));
  $$('#segLevel button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.level)));
  $('#fieldLevel').hidden = $('#fieldRivals').hidden = !cpu;
  $('#fieldNames').hidden = cpu;
  if (cpu) $('#rivalPreview').innerHTML = CPU_AV.slice(0, count - 1).map(a => `<span class="rp"><span class="av" style="--avc:${a.c};--avi:${a.i}">${a.name[0]}</span>${a.name}</span>`).join('');
  else $('#nameList').innerHTML = Array.from({length: count}, (_, i) => `<label>${`<span class="av" style="--avc:${PLAYER_AV[i]};--avi:#10162E">${i + 1}</span>`}<input class="input" data-name="${i}" maxlength="10" autocomplete="off" placeholder="プレイヤー${i + 1}" value="${esc(prefs.names[i] || '')}" aria-label="プレイヤー${i + 1}の名前"></label>`).join('');
  $('#setupNote').textContent = cpu
    ? (prefs.level === 'easy' ? 'やさしい：ときどき遠回りな手を選びます。' : 'ふつう：手札の色と並びを読んで、補充の少ない連番を狙ってきます。')
    : '手番が来たら端末を受け取り、「手札を見る」を押してから遊びます。ほかの人の手札は見えません。';
}

/* ================================================================ game flow */
function startGame(cfg) {
  const s = newGame({count: cfg.count, difficulty: cfg.level, mode: cfg.mode});
  s.players.forEach((p, i) => {
    if (cfg.mode === 'cpu' && i > 0) p.name = CPU_AV[(i - 1) % CPU_AV.length].name;
    if (cfg.mode === 'local') p.name = (cfg.names[i] || '').trim().slice(0, 10) || `プレイヤー${i + 1}`;
  });
  lastConfig = cfg;
  openGame(s, true);
}
function configOf(s) { return {mode: s.mode, count: s.players.length, level: s.difficulty || 'normal', names: s.mode === 'local' ? s.players.map(p => p.name) : []}; }
function openGame(s, fresh) {
  gen++; clearTimeout(cpuTimer); closeSheet(true); $('#handoff')?.remove(); dispScore.clear();
  state = s; selected = []; hint = null; freshIds = new Set(); busy = false;
  lastConfig = lastConfig && fresh ? lastConfig : configOf(s);
  viewSeat = state.mode === 'cpu' ? 0 : state.turn;
  ready = state.mode === 'cpu';
  lastNote = plainNote(fresh ? '11枚ずつ配りました。<b>先に11点</b>を目指しましょう。' : (state.log[0] ? esc(state.log[0]) : ''));
  showScreen(null); setCols(); save();
  render({deal: fresh && ready});
  if (state.winner !== null) { showResult(); return; }
  if (fresh && ready && !FAST) Sound.play('draw');
  schedule(fresh ? 900 : 300);
}
function schedule(delay = 0) {
  clearTimeout(cpuTimer);
  if (!state || state.winner !== null || busy || sheet) return;
  const p = state.players[state.turn];
  if (p.cpu) { render(); cpuTimer = setTimeout(cpuStep, FAST ? 5 : delay + (state.difficulty === 'easy' ? 700 : 850)); }
  else if (state.mode === 'local' && (viewSeat !== state.turn || !ready)) showHandoff();
  else { render(); Sound.play('turn'); }
}
function cpuStep() {
  if (!state || busy || sheet || state.winner !== null || !state.players[state.turn].cpu) return;
  if (document.hidden) return; // resumed on visibilitychange
  act(cpuAction(state));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state && !busy && !sheet && state.winner === null && state.players[state.turn].cpu) schedule(250);
});

function describeBefore(actor, action) {
  const p = state.players[actor], info = {cards: (action.ids || []).map(id => p.hand.find(c => c.id === id)).filter(Boolean)};
  if (action.type === 'exchange') info.ex = state.exchange;
  if (action.type === 'discard' && action.source === 'run') { info.target = action.player; info.card = state.players[action.player]?.run.find(c => c.id === action.card); }
  return info;
}
function noteFor(actor, action, info) {
  const who = `<span class="who">${esc(seatName(actor))}</span>`, p = state.players[actor], key = state.moves;
  if (action.type === 'play') {
    const run = sequence(p.run), fin = state.lastScore && state.lastScore.player === actor, cards = [{run: p.run}];
    return fin ? {key, cards, full: `${who} が ${runChips(p.run)} で<b>出し切り！</b>`, short: `${who} が同じ色で<b>出し切り！</b>`}
      : {key, cards, full: `${who} が ${runChips(p.run)} を出して <b>${run ? run.colors : 0}枚補充</b>`, short: `${who} が${p.run.length}枚の連番を出して <b>${run ? run.colors : 0}枚補充</b>`};
  }
  const d = info.cards[0];
  if (action.type === 'exchange') return {key, cards: [{c: d, tag: '交換札へ'}, {arrow: '⇄'}, {c: info.ex, tag: '手札へ'}], full: `${who} が ${chip(d)} と交換札 ${chip(info.ex)} を入れ替え`, short: `${who} が交換札と入れ替えた`};
  if (action.source === 'run') return {key, cards: [{c: d, tag: '捨てた'}, {arrow: '→'}, {c: info.card, tag: '取った'}], full: `${who} が ${chip(d)} を捨てて、${esc(seatName(info.target))}の場札 ${chip(info.card)} を取った`, short: `${who} が1枚捨てて、${esc(seatName(info.target))}の場札から取った`};
  return {key, cards: [{c: d, tag: '捨てた'}, {arrow: '→'}, {back: true}], full: `${who} が ${chip(d)} を捨てて、山札から1枚引いた`, short: `${who} が1枚捨てて、山札から引いた`};
}
const plainNote = (html, key = -1) => ({key, cards: [], full: html, short: html});
async function act(action) {
  if (busy || !state || state.winner !== null) return;
  const g = gen, actor = state.turn, before = capture(), info = describeBefore(actor, action);
  const handBefore = new Set(state.players[viewSeat].hand.map(c => c.id)), prevScore = state.players[actor].score;
  try { takeAction(state, action); }
  catch (err) { toast(err.message); Sound.play('error'); render(); return; }
  busy = true; selected = []; hint = null;
  if (actor === viewSeat) freshIds = new Set();
  for (const c of state.players[viewSeat].hand) if (!handBefore.has(c.id)) freshIds.add(c.id);
  const score = state.lastScore && state.lastScore.player === actor ? state.lastScore : null;
  if (score) dispScore.set(actor, prevScore);
  lastNote = noteFor(actor, action, info);
  save();
  render();
  animateFrom(before, actor);
  flashPlate(actor);
  if (action.type === 'play') Sound.play('run'); else { Sound.play('card'); if (action.type === 'discard') setTimeout(() => Sound.play('draw'), 140); }
  if (action.type === 'play' && !score && info.cards.length >= 4) stamp(`${info.cards.length}連番！`, 'small');
  await sleep(score ? 560 : 440);
  if (g !== gen) return;
  if (score) {
    await stamp('出し切り！');
    if (g !== gen) return;
    await showScoring(score, prevScore);
    if (g !== gen) return;
    dispScore.delete(actor);
  }
  busy = false;
  render();
  if (state.winner !== null) { await sleep(300); if (g === gen) showResult(); return; }
  if (state.mode === 'local' && !score) { await sleep(700); if (g !== gen) return; }
  schedule();
}

/* local multiplayer: pass the device */
function showHandoff() {
  ready = false; viewSeat = state.turn; selected = []; hint = null; freshIds = new Set();
  render();
  $('#handoff')?.remove();
  const name = seatName(viewSeat), host = document.createElement('div');
  host.className = 'handoff'; host.id = 'handoff';
  host.innerHTML = `<div class="inner">${backHTML()}<p class="kicker">PASS THE DEVICE</p>${avHTML(viewSeat)}<h2>${esc(name)}の番</h2>`
    + `<p>端末を渡したら、ボタンを押して<br>自分の手札を見てください。</p>${lastNote && lastNote.key >= 0 ? `<p class="note" style="font-size:12px">直前：${lastNote.full}</p>` : ''}`
    + `<button class="btn primary big" id="reveal">手札を見る</button><button class="btn ghost" id="handoffMenu">メニュー</button></div>`;
  document.body.appendChild(host);
  $('#reveal').onclick = () => { host.remove(); ready = true; render({deal: true}); Sound.play('turn'); };
  $('#handoffMenu').onclick = () => openMenu();
  setTimeout(() => { try { $('#reveal')?.focus({preventScroll: true}); } catch {} }, 40);
}

/* ================================================================ rendering */
function setCols() {
  if (!state) return;
  const n = state.players.length - 1, wide = innerWidth >= 700 || (innerHeight <= 560 && innerWidth > innerHeight);
  const cols = wide ? n : n === 4 ? 2 : Math.min(n, 3);
  $('#rivals').style.setProperty('--cols', cols);
  $('#rivals').classList.toggle('compact', (cols >= 3 && innerWidth < 520) || cols >= 4);
}
function render(o = {}) {
  if (!state) return;
  $('#tTurn').textContent = `TURN ${state.moves + 1}`;
  $('#tInfo').textContent = `${state.mode === 'local' ? 'みんなで' : 'CPU戦'}・${state.players.length}人・先に11点`;
  $('#sortLabel').textContent = prefs.sort === 'number' ? '数字順' : '色順';
  renderRivals(); renderTable(); renderPrompt(); renderMe(); renderActions(); renderHand(o.deal);
  fitTable();
}
// The table takes whatever height is left; shrink the piles and drop the spotlight when it gets short.
function fitTable() {
  const t = $('#table'); if (!t || !state) return;
  const land = matchMedia('(max-height:560px) and (orientation:landscape)').matches, vw = innerWidth, vh = innerHeight, H = t.clientHeight;
  let pw = land ? Math.min(52, Math.max(38, vw * .054)) : Math.min(96, Math.max(50, Math.min(vw * .21, vh * .104)));
  const sw = Math.min(50, Math.max(30, Math.min(vw * .10, vh * .054))), caps = 22, pad = 14;
  let cap = land ? 20 : 44, spot = !land;
  const need = () => pw * 1.4 + caps + pad + cap + (spot ? sw * 1.4 + 16 : 0);
  if (need() > H) spot = false;
  if (need() > H) pw = Math.max(34, (H - caps - pad - cap) / 1.4);
  const nocap = need() > H + 8;
  t.style.setProperty('--pile-w', pw.toFixed(1) + 'px');
  t.classList.toggle('nospot', !spot);
  t.classList.toggle('nocap', nocap);
}
function runCardsHTML(run, seat, pick) {
  if (!run.length) return '<span class="norun">場札なし</span>';
  return run.map((c, k) => {
    const as = runValue(run, k), take = pick && seat !== viewSeat, hinted = hint && hint.target === 'run' && hint.card === c.id;
    return cardHTML(c, {tag: take ? 'button' : 'div', mini: true, as, cls: (take ? 'pick' : '') + (hinted ? ' hinted' : ''),
      attrs: take ? `data-pick="${c.id}" data-player="${seat}"` : '', label: take ? `${seatName(seat)}の場札 ${cardName(c, as)} を取る` : `${seatName(seat)}の場札 ${cardName(c, as)}`});
  }).join('');
}
function renderRivals() {
  const pick = canPick();
  $('#rivals').innerHTML = others().map(i => {
    const p = state.players[i], turn = i === state.turn && state.winner === null, sc = shownScore(i);
    return `<div class="plate${turn ? ' turn' : ''}${state.winner === i ? ' won' : ''}" data-seat="${i}" style="--plc:${avatar(i).c}">`
      + `<div class="ph">${avHTML(i)}<span class="nm">${esc(seatName(i))}${turn && p.cpu && !busy ? '<span class="thinking"><i></i><i></i><i></i></span>' : ''}</span>${hcHTML(i)}</div>`
      + `<div class="ps">${pipsHTML(Math.min(sc, 11))}<span class="sc">${sc}<small>/11</small></span></div>`
      + `<div class="prun">${runCardsHTML(p.run, i, pick)}</div>`
      + (state.winner === i ? '<span class="flag">優勝</span>' : turn ? '<span class="flag">手番</span>' : '') + `</div>`;
  }).join('');
  $$('#rivals .prun').forEach(el => layoutRow(el));
}
function renderTable() {
  const pick = canPick(), deckEl = $('#deck'), n = state.pile.length;
  deckEl.disabled = !pick;
  deckEl.classList.toggle('pick', pick);
  deckEl.classList.toggle('low', n < 10);
  deckEl.classList.toggle('hinted', !!hint && hint.target === 'deck');
  deckEl.setAttribute('aria-label', pick ? `選んだ1枚を捨てて山札から引く（残り${n}枚）` : `山札 残り${n}枚`);
  $('#deckN').textContent = n;
  const ex = state.exchange;
  $('#exSlot').innerHTML = ex ? cardHTML(ex, {tag: 'button', cls: (pick ? 'pick' : '') + (hint && hint.target === 'exchange' ? ' hinted' : ''),
    attrs: `id="exCard"${pick ? '' : ' disabled'}`, label: pick ? `交換札 ${cardName(ex)} と入れ替える` : `交換札 ${cardName(ex)}`}) : '<div class="empty-slot">なし</div>';
  const top = state.discard[state.discard.length - 1];
  $('#discSlot').innerHTML = top ? cardHTML(top) : '<div class="empty-slot">なし</div>';
  $('#discN').textContent = state.discard.length;
  renderSpot();
}
let spotKey = null;
function renderSpot() {
  const note = lastNote || plainNote('');
  $('#caption').innerHTML = note.full === note.short ? note.full : `<span class="cap-short">${note.short}</span><span class="cap-full">${note.full}</span>`;
  if (spotKey === note.key && $('#spot').childElementCount === note.cards.length) { $$('#spot .run').forEach(el => layoutRow(el, .62)); return; }
  spotKey = note.key;
  const el = $('#spot');
  el.innerHTML = note.cards.map(x => x.run ? `<div class="run">${x.run.map((c, k) => cardHTML(c, {mini: true, noId: true, as: runValue(x.run, k)})).join('')}</div>`
    : x.arrow ? `<span class="arrow" aria-hidden="true">${x.arrow}</span>` : x.back ? backHTML() : cardHTML(x.c, {mini: true, noId: true, tag2: x.tag})).join('');
  el.classList.remove('new'); void el.offsetWidth; if (note.cards.length) el.classList.add('new');
  $$('#spot .run').forEach(r => layoutRow(r, .62));
}
function renderPrompt() {
  const el = $('#prompt'), p = state.players[state.turn];
  let main = '', sub = '', good = false;
  if (state.winner !== null) main = `${esc(seatName(state.winner))}の勝利！`;
  else if (!isMyTurn()) {
    if (p.cpu) { main = `${esc(p.name)}の番`; sub = '手を考えています…'; }
    else if (!ready) { main = `${esc(seatName(state.turn))}の番`; sub = '端末を渡してください'; }
    else { main = `${esc(seatName(state.turn))}の番`; }
  } else {
    const cards = chosen(), n = cards.length, run = sequence(cards), hand = state.players[viewSeat].hand;
    const finish = !!run && n === hand.length && run.colors <= 1;
    if (!n) {
      main = state.mode === 'local' ? `${esc(seatName(viewSeat))}の番` : 'あなたの番';
      if (canScore(hand)) { sub = '<b style="color:var(--gold-2)">出し切りチャンス！</b> 手札を全部選んで得点しよう'; }
      else sub = '2枚以上の連番を出すか、1枚選んで交換しましょう';
    }
    else if (finish) { main = '同じ色で出し切れます！'; sub = '「出し切って得点」で山札をめくって得点'; good = true; }
    else if (n === 1) { main = '1枚選択中'; sub = '山札から引く／交換札と入れ替え／ほかの人の場札をタップ'; }
    else if (run) { main = `<span class="seq">${run.values.join(' → ')}</span>`; sub = `${run.colors}色なので${run.colors}枚補充 → 手札${hand.length - n + run.colors}枚`; good = true; }
    else { main = 'この組み合わせは連番になりません'; sub = '数字が1つずつ続くように選んでください（10/0は両端だけ）'; }
  }
  el.className = good ? 'good' : '';
  el.innerHTML = `<span>${main}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
}
function renderMe() {
  const me = state.players[viewSeat], sc = shownScore(viewSeat), turn = state.turn === viewSeat && state.winner === null;
  const el = $('#me');
  el.className = turn ? 'turn' : '';
  el.innerHTML = `<div class="mine-info">${avHTML(viewSeat)}<span class="nmrow"><span class="nm">${esc(seatName(viewSeat))}</span>${hcHTML(viewSeat)}</span><span class="sc">${sc}<small>/11</small></span>`
    + `<span class="sub">${pipsHTML(Math.min(sc, 11))}</span></div>`
    + `<div class="myrun"><span class="lbl">場札</span><div class="prun">${runCardsHTML(me.run, viewSeat, false)}</div></div>`;
  layoutRow($('#me .prun'));
}
function renderActions() {
  const el = $('#actions');
  if (!isMyTurn()) { el.innerHTML = ''; return; }
  const cards = chosen(), n = cards.length, run = sequence(cards), hand = state.players[viewSeat].hand;
  const finish = !!run && n === hand.length && run.colors <= 1;
  let h = '<button class="btn small ghost" data-act="hint">ヒント</button>';
  if (n) h += '<button class="btn small ghost" data-act="clear">解除</button>';
  if (n === 1 && !finish) h += '<button class="btn small" data-act="deck">山札から引く</button><button class="btn small" data-act="exchange">交換札と交換</button>';
  else {
    const ok = !!run && (n >= 2 || finish);
    h += `<button class="btn primary grow${finish ? ' glow' : ''}" data-act="play"${ok ? '' : ' disabled'}>${finish ? '出し切って得点！' : ok ? `連番を出す <small>${run.colors}枚補充</small>` : '連番を出す'}</button>`;
  }
  el.innerHTML = h;
}
function renderHand(deal) {
  const el = $('#hand'), me = state.players[viewSeat];
  el.classList.remove('dealing');
  if (!ready) { el.innerHTML = me.hand.map(() => backHTML()).join(''); layoutHand(); return; }
  const mine = isMyTurn();
  el.innerHTML = sortHand(me.hand).map((c, k) => cardHTML(c, {tag: 'button', cls: selected.includes(c.id) ? 'sel' : '',
    attrs: `data-hand="${c.id}" aria-pressed="${selected.includes(c.id)}"${mine ? '' : ' disabled'}`, style: deal ? `animation-delay:${k * 55}ms` : '', tag2: freshIds.has(c.id) ? 'NEW' : ''})).join('') || '<p class="none">手札なし</p>';
  if (deal && !FAST && !reduceMotion) { void el.offsetWidth; el.classList.add('dealing'); setTimeout(() => el.classList.remove('dealing'), 55 * me.hand.length + 520); }
  layoutHand();
}
function refreshSelection() {
  $$('#hand [data-hand]').forEach(b => { const on = selected.includes(+b.dataset.hand); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
  renderRivals(); renderTable(); renderPrompt(); renderActions();
}
function layoutRow(el, ratio = .56) {
  if (!el) return;
  const cards = $$('.card', el); if (!cards.length) return;
  const cw = cards[0].offsetWidth, W = el.clientWidth, n = cards.length;
  const step = n > 1 ? Math.max(4, Math.min(cw * ratio, (W - cw) / (n - 1))) : 0;
  cards.forEach((c, i) => { c.style.marginLeft = i ? (step - cw) + 'px' : '0'; c.style.zIndex = String(i + 1); });
}
function layoutHand() {
  const el = $('#hand'), cards = $$('.card', el); if (!cards.length) return;
  const cw = cards[0].offsetWidth, n = cards.length, mid = (n - 1) / 2, k = Math.min(2.4, 16 / Math.max(n, 1));
  const spill = Math.sin(mid * k * Math.PI / 180) * cw * 1.4 * 1.2 + 6, W = el.clientWidth - 12 - 2 * spill;
  const step = n > 1 ? Math.min(cw + 6, (W - cw) / (n - 1)) : 0;
  cards.forEach((c, i) => {
    const o = i - mid;
    c.style.marginLeft = i ? (step - cw) + 'px' : '0'; c.style.zIndex = String(i + 1);
    c.style.setProperty('--rot', (o * k).toFixed(2) + 'deg');
    c.style.setProperty('--lift', (o * o * .36 * (k / 2.4)).toFixed(1) + 'px');
  });
}
function flashPlate(i) {
  const el = $(`#rivals .plate[data-seat="${i}"]`); if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

/* ================================================================ motion: every card that changes place flies there */
function geom(el) {
  const r = el.getBoundingClientRect();
  return {cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: el.offsetWidth || r.width, h: el.offsetHeight || r.height, rot: parseFloat(el.style.getPropertyValue('--rot')) || 0};
}
function capture() {
  const m = new Map();
  for (const el of $$('#app [data-cid]')) { if (el.offsetWidth < 2) continue; m.set(el.dataset.cid, {...geom(el), html: el.outerHTML}); }
  return m;
}
function seatGeom(i) {
  if (i === viewSeat) { const el = $('#me .hc') || $('#me'); return el ? {...geom(el), w: 14, h: 20} : null; }
  const el = $(`#rivals .plate[data-seat="${i}"] .hc`) || $(`#rivals .plate[data-seat="${i}"]`);
  return el ? {...geom(el), w: 12, h: 17, rot: 0} : null;
}
function locate() {
  const m = new Map(), put = (c, v) => m.set(String(c.id), v);
  state.players.forEach((p, i) => { p.hand.forEach(c => put(c, {zone: 'hand', seat: i})); p.run.forEach(c => put(c, {zone: 'run', seat: i})); p.points.forEach(c => put(c, {zone: 'points', seat: i})); });
  state.discard.forEach(c => put(c, {zone: 'discard'})); state.pile.forEach(c => put(c, {zone: 'pile'}));
  if (state.exchange) put(state.exchange, {zone: 'exchange'});
  return m;
}
function fly(html, from, to, {dur = 440, delay = 0, fade = false, startOpacity = 1} = {}) {
  return new Promise(res => {
    const g = document.createElement('div');
    g.className = 'ghost'; g.innerHTML = html;
    const card = g.firstElementChild;
    if (card) { card.classList.remove('sel', 'pick', 'hinted'); card.style.cssText = `--cw:${to.w}px;margin:0;transform:none;animation:none;visibility:visible`; card.querySelector('.tag')?.remove(); }
    g.style.width = to.w + 'px'; g.style.height = to.h + 'px'; g.style.transformOrigin = '50% 50%';
    $('#fly').appendChild(g);
    const t0 = `translate(${from.cx - to.w / 2}px,${from.cy - to.h / 2}px) rotate(${from.rot || 0}deg) scale(${(from.w / to.w).toFixed(3)})`;
    const t1 = `translate(${to.cx - to.w / 2}px,${to.cy - to.h / 2}px) rotate(${to.rot || 0}deg) scale(1)`;
    const a = g.animate([{transform: t0, opacity: startOpacity}, {transform: t1, opacity: fade ? 0 : 1}], {duration: dur, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both'});
    const done = () => { g.remove(); res(); };
    a.onfinish = done; a.oncancel = done;
  });
}
function animateFrom(prev, actor) {
  if (FAST || reduceMotion) return;
  const where = locate(), deckG = $('#deck') ? geom($('#deck')) : null;
  const now = new Map($$('#app [data-cid]').map(el => [el.dataset.cid, el]));
  let k = 0;
  for (const [cid, el] of now) {
    if (el.offsetWidth < 2) continue;
    const to = geom(el), old = prev.get(cid), w = where.get(cid);
    let from = old, opts = {};
    if (!from) {
      if (w && w.zone === 'hand' && w.seat === viewSeat) { from = deckG; opts = {startOpacity: .4}; }
      else { from = seatGeom(actor); opts = {startOpacity: .3}; }
    }
    if (!from) continue;
    if (Math.abs(from.cx - to.cx) < 2 && Math.abs(from.cy - to.cy) < 2 && Math.abs(from.w - to.w) < 2) continue;
    el.style.visibility = 'hidden';
    fly(el.outerHTML, from, to, {...opts, delay: Math.min(k++, 8) * 45}).then(() => { el.style.visibility = ''; });
  }
  for (const [cid, old] of prev) {
    if (now.has(cid)) continue;
    const w = where.get(cid); if (!w) continue;
    let to = null;
    if (w.zone === 'hand' && w.seat !== viewSeat) to = seatGeom(w.seat);
    else if (w.zone === 'pile') to = deckG;
    if (!to) continue;
    fly(old.html, old, {...to, w: old.w, h: old.h, rot: 0}, {fade: true, dur: 480});
  }
}
function stamp(text, cls = '') {
  if (FAST) return Promise.resolve();
  const host = $('#stamp'), small = cls.includes('small');
  host.innerHTML = `<div class="word ${cls}">${esc(text)}</div>`;
  if (!small) { Sound.play('thump'); const a = $('#app'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); }
  return sleep(small ? 760 : 820).then(() => { if (host.firstElementChild?.textContent === text) host.innerHTML = ''; });
}

/* ================================================================ scoring & results */
function showScoring(score, prevScore) {
  return new Promise(resolve => {
    const i = score.player, p = state.players[i], cards = p.points.slice(-score.revealed.length), won = state.winner === i;
    const box = openSheet(`<div class="scorebox"><p class="kicker">PERFECT RUN</p><h3>${esc(seatName(i))} 出し切り！</h3>`
      + `<div class="reveal"></div><div class="gain" hidden></div><div class="bigpips">${Array.from({length: 11}, (_, k) => `<i${k < prevScore ? ' class="on"' : ''}></i>`).join('')}</div>`
      + `<p class="scoreline">山札をめくって得点を決めます</p><div class="rowbtns"><button class="btn primary big" id="scoreGo" hidden>${won ? '結果を見る' : 'つづける'}</button></div></div>`, {center: true, sticky: true});
    const reveal = $('.reveal', box), pips = $$('.bigpips i', box);
    let total = prevScore;
    (async () => {
      for (let k = 0; k < cards.length; k++) {
        await sleep(k ? 620 : 300);
        if (!box.isConnected) return resolve();
        const c = cards[k];
        reveal.insertAdjacentHTML('beforeend', `<div class="flip">${cardHTML(c)}${backHTML()}<span class="pts">+${c.n}</span></div>`);
        Sound.play('flip');
        await sleep(380);
        const from = total; total += c.n;
        pips.forEach((pi, j) => { if (j >= from && j < Math.min(total, 11)) { pi.classList.add('on', 'new'); } });
        if (c.n === 1 && k < cards.length - 1) $('.scoreline', box).textContent = '「1」はもう1枚めくれる！';
      }
      await sleep(280);
      if (!box.isConnected) return resolve();
      const gain = $('.gain', box);
      gain.hidden = false; gain.innerHTML = `+${score.gained}<small>点</small>`;
      Sound.play('score');
      $('.scoreline', box).innerHTML = won ? `合計 <b>${p.score}</b> 点 — 11点に到達！`
        : `合計 <b>${p.score}</b> 点${score.revealed.length > 1 ? '（1のボーナスあり）' : ''}・手札を${score.refill}枚補充して続行`;
      const go = $('#scoreGo', box); go.hidden = false;
      const finish = () => { closeSheet(true); resolve(); };
      go.onclick = finish;
      if (FAST) finish(); else setTimeout(() => { try { go.focus({preventScroll: true}); } catch {} }, 30);
    })();
  });
}
function confetti() {
  if (FAST || reduceMotion) return;
  $('#confetti')?.remove();
  const host = document.createElement('div'); host.id = 'confetti';
  const cols = ['#4E95F2', '#33C27F', '#A56EEC', '#FFAE40', '#F24F6A', '#F6D27B', '#FFFFFF'];
  host.innerHTML = Array.from({length: 60}, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;--s:${(8 + Math.random() * 10).toFixed(0)}px;--c:${cols[Math.floor(Math.random() * cols.length)]};--d:${(2.4 + Math.random() * 2.2).toFixed(2)}s;--w:${(Math.random() * 1.2).toFixed(2)}s;--x:${(Math.random() * 160 - 80).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg"></i>`).join('');
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 5200);
}
function showResult() {
  if (!state || state.winner === null) return;
  const w = state.winner, order = state.players.map((p, i) => ({p, i})).sort((a, b) => (b.i === w) - (a.i === w) || b.p.score - a.p.score);
  const youWin = state.mode !== 'cpu' || w === 0;
  confetti(); Sound.play('win');
  const head = state.mode === 'cpu' ? (w === 0 ? 'あなたの勝ち！' : `${esc(seatName(w))}の勝ち`) : `${esc(seatName(w))}の勝ち！`;
  const box = openSheet(`<p class="kicker" style="margin:0;font-size:11px;font-weight:900;letter-spacing:.3em;color:var(--gold-2)">${youWin ? 'WINNER' : 'GAME OVER'}</p><div class="winner-word${[...head].length > 8 ? ' long' : ''}">${head}</div>`
    + `<p class="note">${state.moves}手で決着しました。</p><div class="podium">${order.map(({p, i}, k) => `<div class="pl${k === 0 ? ' first' : ''}"><span class="place">${k === 0 ? '★' : k + 1}</span>${avHTML(i)}<span class="nm">${esc(seatName(i))}</span><span class="sc">${p.score}<small> 点</small></span></div>`).join('')}</div>`
    + `<div class="rowbtns"><button class="btn ghost" data-r="title">タイトルへ</button><button class="btn primary" data-r="again">もう一度</button></div>`, {center: true, sticky: true});
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'again') { const cfg = lastConfig || configOf(state); closeSheet(true); startGame(cfg); }
    else goTitle();
  });
}

/* ================================================================ sheets, menu, rules */
function openSheet(html, {center = false, sticky = false, onClose = null} = {}) {
  closeSheet(true);
  const veil = document.createElement('div');
  veil.className = 'veil' + (center ? ' center' : '');
  veil.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${sticky ? '' : '<button class="sheet-x" data-close aria-label="閉じる">×</button>'}${html}</div>`;
  $('#sheetHost').appendChild(veil);
  veil.addEventListener('click', e => { if ((e.target === veil && !sticky) || e.target.closest('[data-close]')) closeSheet(); });
  sheet = {veil, onClose, sticky};
  return veil.firstElementChild;
}
function closeSheet(silent) {
  if (!sheet) return;
  const {veil, onClose} = sheet; sheet = null; veil.remove();
  if (silent) return;
  onClose?.();
  if (state && document.body.classList.contains('ingame') && !busy && !$('#handoff')) schedule(350);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && !sheet.sticky) closeSheet(); });

function openMenu() {
  clearTimeout(cpuTimer);
  const box = openSheet(`<h3>メニュー</h3><div class="menu-list">`
    + `<button class="btn" data-m="rules"><svg class="ic"><use href="#i-book"/></svg>あそびかた</button>`
    + `<button class="btn" data-m="log"><svg class="ic"><use href="#i-log"/></svg>プレイ履歴</button>`
    + `<button class="btn" data-m="sound"><svg class="ic"><use href="#${prefs.sound ? 'i-sound' : 'i-mute'}"/></svg>効果音：${prefs.sound ? 'ON' : 'OFF'}</button>`
    + `<button class="btn" data-m="title"><svg class="ic"><use href="#i-home"/></svg>タイトルへ（続きはあとで遊べます）</button>`
    + `<a class="btn ghost" href="../games/"><svg class="ic"><use href="#i-shelf"/></svg>PLAYROOMへ戻る</a></div>`);
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const m = b.dataset.m;
    if (m === 'rules') openRules();
    else if (m === 'log') openLog();
    else if (m === 'sound') { prefs.sound = !prefs.sound; savePrefs(); syncSoundLabels(); if (prefs.sound) { try { Sound.context(); } catch {} Sound.play('tap'); } openMenu(); }
    else if (m === 'title') goTitle();
  });
}
function openLog() {
  if (!state) return;
  openSheet(`<h3>プレイ履歴</h3><ol class="loglist">${state.log.map(m => `<li>${esc(m)}</li>`).join('')}</ol>`);
}
function rulesHTML(tab) {
  const C = (color, n, as) => cardHTML({id: 'r' + color + n, color, n}, {as});
  if (tab === 'score') return `<div class="rules"><h4>出し切ったら得点</h4><p>手札がすべて<b>1色の連番</b>になったら、まとめて出し切れます（残り1枚でもOK）。</p>`
    + `<ol><li>山札を1枚めくり、その数字が得点。<b>10/0は10点</b>。</li><li><b>「1」</b>が出たら1点を足して、もう1枚めくります（何度でも）。</li><li>最後にめくった数字と同じ枚数を山札から引いて、ゲームを続けます。</li></ol>`
    + `<div class="box"><b>合計11点以上</b>になった瞬間に勝利です。</div><p class="note">山札がなくなったら、捨て札を混ぜて新しい山札にします。</p></div>`;
  if (tab === 'cards') return `<div class="rules"><p>カードは全100枚。5色の宝石カード（1〜9が各2枚）と、無色のダイヤ「10/0」が10枚です。</p><div class="cardlist">`
    + COLORS.map(c => `<div class="item">${C(c, 7)}<div><b>${LABEL[c]}・${GEM[c]}</b><small>1〜9 各2枚（18枚）</small></div></div>`).join('')
    + `<div class="item">${C('wild', 10)}<div><b>無色・ダイヤ 10/0</b><small>10枚。0か10として連番の端に使えます。色数に数えません</small></div></div></div>`
    + `<p class="note" style="margin-top:12px">絵柄はこのブラウザ版のオリジナルです。色ごとに宝石の形が違うので、形でも見分けられます。</p></div>`;
  return `<div class="rules"><p>全員11枚の手札からスタート。手番では次のどれか1つを行います。</p>`
    + `<h4>① 連番を出す（2枚以上）</h4><p>数字が1つずつ続くカードを出します。色が混ざってもOK。出した後、<b>連番に含まれる色の数だけ</b>山札から引きます。</p>`
    + `<div class="ex">${C('blue', 3)}${C('blue', 4)}${C('red', 5)}<span class="arrow">2色 → 2枚引く</span></div>`
    + `<p>10/0は0か10として、連番の<b>端にだけ</b>使えます（0-1-2、8-9-10など）。</p>`
    + `<h4>② 1枚捨てて、1枚取る</h4><p>手札を1枚選んで捨て、<b>山札</b>か<b>ほかの人の場札</b>から1枚取ります（自分の場札は取れません）。または<b>交換札</b>と入れ替えます。</p>`
    + `<h4>③ 同じ色で出し切る</h4><p>手札すべてが1色の連番なら出し切って得点（→「得点」タブ）。</p>`
    + `<div class="box">出した連番は自分の<b>場札</b>として残ります。次に連番を出すと、古い場札は捨て札へ。<br>コツ：少ない色で長くつなぐほど、手札が一気に減ります。</div></div>`;
}
function openRules(tab = 'play') {
  const tabs = [['play', 'あそびかた'], ['score', '得点'], ['cards', 'カード']];
  const box = openSheet(`<div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}</div><div id="rulesBody">${rulesHTML(tab)}</div>`);
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    $$('[data-tab]', box).forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('#rulesBody', box).innerHTML = rulesHTML(b.dataset.tab);
  });
}
function toast(msg, ms = 2800) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, FAST ? 300 : ms);
}

/* ================================================================ input */
function doHint() {
  if (!isMyTurn()) return;
  const a = cpuAction(state, () => .5), p = state.players[viewSeat];
  selected = [...a.ids];
  if (a.type === 'play') { hint = {}; toast(a.ids.length === p.hand.length ? '出し切れます！「出し切って得点」を押してください' : 'この連番がおすすめです。「連番を出す」で決定'); }
  else if (a.type === 'exchange') { hint = {target: 'exchange'}; toast('選んだ1枚を、光っている交換札と入れ替えるのがおすすめ'); }
  else if (a.source === 'run') { hint = {target: 'run', card: a.card}; const c = state.players[a.player].run.find(x => x.id === a.card); toast(`${seatName(a.player)}の場札「${cardName(c)}」を取るのがおすすめ`); }
  else { hint = {target: 'deck'}; toast('選んだ1枚を捨てて、山札から引くのがおすすめ'); }
  Sound.play('tap');
  render();
}
$('#hand').addEventListener('click', e => {
  const b = e.target.closest('[data-hand]'); if (!b || !isMyTurn()) return;
  const id = +b.dataset.hand;
  selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
  hint = null; Sound.play('tap'); refreshSelection();
});
$('#rivals').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]'); if (!b || !canPick()) return;
  act({type: 'discard', ids: [...selected], source: 'run', player: +b.dataset.player, card: +b.dataset.pick});
});
$('#deck').addEventListener('click', () => { if (canPick()) act({type: 'discard', ids: [...selected], source: 'deck'}); });
$('#exSlot').addEventListener('click', e => { if (e.target.closest('#exCard') && canPick()) act({type: 'exchange', ids: [...selected]}); });
$('#actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled || !isMyTurn()) return;
  const a = b.dataset.act;
  if (a === 'hint') doHint();
  else if (a === 'clear') { selected = []; hint = null; refreshSelection(); }
  else if (a === 'deck' && selected.length === 1) act({type: 'discard', ids: [...selected], source: 'deck'});
  else if (a === 'exchange' && selected.length === 1) act({type: 'exchange', ids: [...selected]});
  else if (a === 'play') act({type: 'play', ids: [...selected]});
});
$('#btnMenu').addEventListener('click', openMenu);
$('#btnRules').addEventListener('click', () => { clearTimeout(cpuTimer); openRules(); });
$('#btnSort').addEventListener('click', () => { prefs.sort = prefs.sort === 'number' ? 'color' : 'number'; savePrefs(); Sound.play('tap'); if (state) render(); });

$('#goCpu').addEventListener('click', () => openSetup('cpu'));
$('#goLocal').addEventListener('click', () => openSetup('local'));
$('#goResume').addEventListener('click', () => { const s = savedGame(); if (valid(s) && s.winner === null) { lastConfig = null; openGame(s, false); } else { refreshResume(); toast('保存データを読み込めませんでした'); } });
$('#goRules').addEventListener('click', () => openRules());
$('#goSound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); syncSoundLabels(); if (prefs.sound) { try { Sound.context(); } catch {} Sound.play('tap'); } });
$$('[data-back]').forEach(b => b.addEventListener('click', () => showScreen('scrTitle')));
$('#segCount').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (setupMode === 'cpu') prefs.count = +b.dataset.v; else prefs.localCount = +b.dataset.v; savePrefs(); syncSetup(); });
$('#segLevel').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; prefs.level = b.dataset.v; savePrefs(); syncSetup(); });
$('#nameList').addEventListener('input', e => { const i = e.target.dataset.name; if (i == null) return; prefs.names[+i] = e.target.value.slice(0, 10); savePrefs(); });
$('#startBtn').addEventListener('click', () => {
  const cpu = setupMode === 'cpu';
  startGame({mode: cpu ? 'cpu' : 'local', count: cpu ? prefs.count : prefs.localCount, level: prefs.level, names: [...prefs.names]});
});

let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state && document.body.classList.contains('ingame')) { setCols(); render(); }
    else if (!$('#scrTitle').hidden) drawHeroFan();
  }, 140);
});

/* ================================================================ boot */
drawSparks(); syncSoundLabels(); refreshResume(); drawHeroFan(); showScreen('scrTitle');
const hideLoader = () => $('#loader')?.remove();
Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(hideLoader, hideLoader);
if (FAST || params.has('debug')) window.__eleven = {get state() { return state; }, act, isMyTurn, cpuAction, get busy() { return busy; }, get ready() { return ready; }};

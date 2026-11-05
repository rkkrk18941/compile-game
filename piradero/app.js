/* 風の怪物ピラデロ — the page: title and setup screens, the table overlay (name tags, labels, the dock), the turn
   flow with CPU turns, animations, the round summary, saving, and online play: the host's browser runs the game
   and the CPUs; guests send their moves and get back only what their seat may see. */
import { loadThree, createScene } from './scene.js?v=20261105-look2';

import { createFlatScene } from './flat-scene.js?v=20261105-look2';

const E = window.PD_ENG, AI = window.PD_AI, NET = window.PD_NET, CARDS = window.PD_CARDS;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CPU_NAMES = ['ボルト', 'ゼンマイ', 'スパナ', 'リベット', 'ナット'];
const SEAT_COLORS = ['#f0b44c', '#5cc0ff', '#ff7a9a'];
const LEVEL_NAME = AI.LEVEL_NAME;
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const HOLD = params.get('hold') === '1';   // tests: keep the round summary open for a screenshot

/* ------------------------------------------------------------------ storage and settings */
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const saved = store.get('piradero.settings') || {};
const settings = Object.assign({ sound: true, speed: 'normal', name: '' }, saved);
settings.solo = Object.assign({ n: 2, level: 2, gears: 5, first: 'random' }, saved.solo || {});
settings.lobby = Object.assign({ level: 2, gears: 5 }, saved.lobby || {});
function saveSettings() { store.set('piradero.settings', settings); }
const SPEED = { slow: 1.45, normal: 1, fast: 0.6 };
const spd = () => (TEST ? 0.25 : SPEED[settings.speed] || 1);

/* ------------------------------------------------------------------ sound (synthesised; no files) */
const SFX = (() => {
  let ac = null, noise = null;
  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function noiseBuf(c) {
    if (noise) return noise;
    noise = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function hiss(freq, dur, gain, q, delay, type, sweep) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf(c); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.08, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, gain, type, delay, slide) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function clank(base, delay, gain) {
    // a metal part: a few inharmonic partials that ring and fade
    [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(base * m, 0.5 - i * 0.08, (gain || 0.06) / (i + 1), 'sine', delay));
    hiss(3200, 0.05, 0.05, 2, delay);
  }
  return {
    click() { tone(880, 0.06, 0.05, 'triangle'); },
    deal() { hiss(2400, 0.07, 0.05, 1.4); },
    flip() { hiss(1700, 0.09, 0.08, 1.1); tone(420, 0.05, 0.02, 'triangle', 0.02); },
    peek() { hiss(2600, 0.12, 0.05, 1.5); tone(1320, 0.12, 0.03, 'sine', 0.05); },
    take() { hiss(1400, 0.14, 0.08, 0.9); },
    turn() { tone(660, 0.12, 0.05, 'sine'); tone(990, 0.18, 0.05, 'sine', 0.1); },
    gear() { clank(520, 0, 0.08); clank(380, 0.18, 0.05); },
    key() { [1568, 2093, 2637, 2093].forEach((f, i) => tone(f, 0.18, 0.035, 'sine', i * 0.07)); },
    wind() { hiss(300, 1.4, 0.16, 0.7, 0, 'bandpass', 2400); hiss(900, 1.1, 0.07, 3, 0.25, 'bandpass', 260); },
    fight() { tone(196, 0.3, 0.07, 'sawtooth', 0, 392); clank(300, 0.05, 0.05); },
    flee() { tone(392, 0.25, 0.05, 'triangle', 0, 196); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, 0.06, 'triangle', i * 0.11)); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.32, 0.05, 'triangle', i * 0.13)); },
    monster() { tone(110, 0.9, 0.1, 'sawtooth', 0, 55); hiss(180, 0.9, 0.12, 0.6); }
  };
})();
function sfx(name) { if (settings.sound && !TEST) { try { SFX[name](); } catch (e) { /* audio blocked */ } } }

/* ------------------------------------------------------------------ small UI helpers */
let bannerTimer = 0;
function banner(html, opt = {}) {
  const b = $('#banner'); b.innerHTML = html; b.className = 'on' + (opt.cls ? ' ' + opt.cls : '');
  // while cards at the top are turning over, the message sits just above the dock instead
  if (opt.low) { const d = $('#dockWrap'); b.style.top = 'auto'; b.style.bottom = ((d ? d.getBoundingClientRect().height : 120) + 10) + 'px'; }
  else { b.style.top = ''; b.style.bottom = ''; }
  clearTimeout(bannerTimer);
  if (!opt.hold) bannerTimer = setTimeout(() => b.classList.remove('on'), (opt.ms || 1900) * Math.max(0.8, spd()));
}
function hideBanner() { clearTimeout(bannerTimer); $('#banner').classList.remove('on'); }
function toast(msg, ms) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms || 3000);
}
function sheet(html, opts = {}) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg' + (opts.cls ? ' ' + opts.cls : '');
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${opts.noClose ? '' : '<button class="x" data-a="close" aria-label="閉じる">×</button>'}${html}</div>`;
  $('#layer').appendChild(bg);
  const close = () => { if (!bg.isConnected) return; bg.remove(); if (opts.onClose) opts.onClose(); };
  bg.addEventListener('click', (e) => {
    if (e.target === bg && !opts.modal) { close(); return; }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'close') { close(); return; }
    if (opts.onAction) opts.onAction(a.dataset.a, a, close);
  });
  return { el: bg, close };
}
function closeSheets(cls) { $$('#layer .sheet-bg' + (cls ? '.' + cls : '')).forEach((b) => b.remove()); }
function showScreen(id) {
  $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
  if (!scene) return;
  if (id) { scene.setHost($('#titleBg')); scene.setTitleMode(true); }
}
const mini = (v, cls) => `<img class="mini ${cls || ''}" src="${v === null || v === undefined ? CARDS.backURL(90) : CARDS.faceURL(v, 90)}" alt="${v === null || v === undefined ? '伏せ札' : v}" draggable="false">`;
const gearIcons = (n, max) => { let h = ''; for (let i = 0; i < max; i++) h += `<svg class="gi${i < n ? '' : ' off'}" viewBox="0 0 24 24"><use href="#g"/></svg>`; return h; };
const vName = (v) => (v === 0 ? '0（蒼き眼）' : v === 9 ? '9（紅き眼）' : String(v));

/* ------------------------------------------------------------------ session state */
let scene = null;
let S = null;     // { kind: 'solo'|'host'|'guest', st (solo/host), me, cfg, log, rnd, cids, online }
let V = null;     // what my seat may see
const U = { wait: false, seen: {}, hands: {}, known: {}, status: {}, labels: {}, won: -1, lowWin: null };
let busy = false;
let L = null;     // online: { role, link, code, players, me, level, gears }
let chain = Promise.resolve();          // guests: presentations in order
let hostChain = Promise.resolve();      // solo/host: every change to the game in order

const pname = (p) => (V && V.players[p] ? V.players[p].name : '?');
const pcol = (p) => SEAT_COLORS[p % SEAT_COLORS.length];
const who = (p) => `<b class="who" style="--c:${pcol(p)}">${esc(p === (S && S.me) ? 'あなた' : pname(p))}</b>`;
const isHostish = () => S && (S.kind === 'solo' || S.kind === 'host');
function canAct() { return !!(S && V && !busy && !U.wait && V.phase !== 'over' && V.waiting.indexOf(V.me) >= 0); }
function logLine(html) {
  if (!S) return;
  S.log.unshift({ r: V ? V.round : 0, html });
  if (S.log.length > 240) S.log.length = 240;
  if ($('#logList')) renderLog();
}
function setStatus(p, text) {
  if (!S) return;
  U.think = text ? p : -1;
  if (S.kind === 'host') broadcast({ k: 'status', p, text });
  renderTags();
}

/* ------------------------------------------------------------------ what this screen remembers about the round */
function resetRound() { U.seen = {}; U.hands = {}; U.known = {}; U.status = {}; U.labels = {}; U.won = -1; U.lowWin = null; U.think = -1; U.myHand = []; renderLabels(); }
function rebuildMemo(v) {
  resetRound();
  v.slots.forEach((S0, i) => {
    if (S0.seen.length) U.seen[i] = S0.seen.slice();
    if (S0.v !== null) U.known[i] = S0.v;
  });
  v.players.forEach((P, p) => { U.hands[p] = P.slots.slice(); });
  U.myHand = E.myHand(v);
  v.choice.forEach((c, p) => { if (c) U.status[p] = c; });
}

/* ------------------------------------------------------------------ presenting what happened */
async function present(evs, view) {
  const sess = S;
  busy = true;
  renderDock();
  scene.setPickable(null);
  try {
    for (const e of evs) { if (S !== sess) break; await showEvent(e, view); }
  } catch (err) { console.error(err); }
  if (S !== sess) return;
  V = view;
  scene.remember(V);
  gearsNow = V.players.map((P) => P.gears); outNow = V.players.map((P) => P.out); keyNow = V.key;
  busy = false;
  renderAll();
  if (V.phase === 'over') finishGame();
  else if (V.waiting.indexOf(V.me) >= 0 && !TEST) sfx('turn');
}

async function showEvent(e, view) {
  const k = spd();
  switch (e.t) {
    case 'round': {
      closeSheets('result');
      resetRound();
      $('#roundChip').textContent = 'ラウンド ' + e.round;
      setRuleChip(null);
      const keyName = e.key === S.me ? 'あなた' : esc(pname(e.key));
      banner(`ラウンド <b class="num">${e.round}</b>　鍵を持つ${keyName}から`, { ms: 2000 });
      logLine(`— ラウンド ${e.round}（鍵：${who(e.key)}） —`);
      sfx('deal');
      await scene.deal(view);
      renderTags();
      await sleep(250 * k);
      break;
    }
    case 'peek': {
      const list = U.seen[e.slot] || (U.seen[e.slot] = []);
      if (list.indexOf(e.p) < 0) list.push(e.p);
      if (e.p === S.me && e.v !== undefined) U.known[e.slot] = e.v;
      setAct(e.p, '場札を見ている…');
      sfx('peek');
      await scene.peek(e.p, e.slot, e.p === S.me ? e.v : null);
      scene.markSeen(e.slot, U.seen[e.slot], U.known[e.slot] !== undefined ? U.known[e.slot] : null);
      logLine(e.p === S.me ? `あなたは場札を見た：<b class="num">${vName(e.v)}</b>` : `${who(e.p)}が場札を1枚見た`);
      break;
    }
    case 'take': {
      const h = U.hands[e.p] || (U.hands[e.p] = []);
      const idx = h.length;
      h.push(e.slot);
      if (e.v !== undefined) U.known[e.slot] = e.v;
      if (e.p === S.me) U.myHand.push(e.v);
      setAct(e.p, e.peek === e.slot ? '見たカードを取った' : 'ほかのカードを取った');
      sfx('take');
      await scene.take(e.p, e.slot, e.v === undefined ? null : e.v, idx);
      const same = e.peek === e.slot;
      if (e.p === S.me) logLine(`あなたは${same ? '見たカード' : 'ほかのカード'}を取った：<b class="num">${vName(e.v)}</b>`);
      else logLine(`${who(e.p)}は${same ? '<b>見たカード</b>' : '<b>見たのとは別のカード</b>'}を取った${e.v !== undefined ? `（あなたが見た <b class="num">${vName(e.v)}</b>）` : ''}`);
      renderDock();
      await sleep(160 * k);
      break;
    }
    case 'reveal': {
      setAct(-1, null);
      banner('手札がそろいました。残りの場札をオープン！', { ms: 1600 });
      await sleep(500 * k);
      e.slots.forEach((r) => { U.known[r.slot] = r.v; });
      await scene.reveal(e.slots);
      logLine(`場札オープン：${e.slots.map((r) => `<b class="num">${vName(r.v)}</b>`).join('・')}`);
      banner('<span class="kw f">戦う</span>か、<span class="kw r">逃げる</span>か。鍵を持つ人から順に決めます', { ms: 2400 });
      await sleep(700 * k);
      break;
    }
    case 'choose': {
      U.status[e.p] = e.c;
      setAct(e.p, null);
      if (e.c === 'fight') {
        sfx('fight');
        banner(e.auto ? `ほかの全員が逃げたので、${who(e.p)}は戦うだけ` : `${who(e.p)}は <span class="kw f">戦う！</span>`, { ms: 1500 });
        logLine(e.auto ? `${who(e.p)}は最後の1人（自動で戦う）` : `${who(e.p)}は<b>戦う</b>`);
      } else {
        sfx('flee');
        banner(`${who(e.p)}は <span class="kw r">逃げた</span>（歯車 −1）`, { ms: 1500 });
        logLine(`${who(e.p)}は<b>逃げた</b>（歯車 −1）`);
      }
      renderTags();
      await sleep(900 * k);
      break;
    }
    case 'gear': {
      await scene.loseGears(e.p, -e.d);
      gearsNow[e.p] = e.left;
      renderTags();
      if (e.why === 'lose') logLine(`${who(e.p)}は歯車を2個失った（残り ${e.left}）`);
      break;
    }
    case 'default': {
      U.won = e.p;
      sfx(e.p === S.me ? 'win' : 'lose');
      banner(`${who(e.p)}の <b>不戦勝！</b>`, { cls: 'big', ms: 2000 });
      logLine(`${who(e.p)}の不戦勝`);
      renderTags();
      await sleep(1100 * k);
      break;
    }
    case 'show': {
      const per = {};
      Object.keys(e.hands).forEach((p) => {
        const slots = U.hands[p] || [];
        per[p] = e.hands[p].map((v, i) => ({ slot: slots[i], v }));
        slots.forEach((s, i) => { U.known[s] = e.hands[p][i]; });
        U.labels[p] = { before: E.sum(e.hands[p]) };
      });
      banner('戦う人は手札を公開！', { ms: 1400, low: true });
      await scene.showHands(per);
      renderLabels();
      Object.keys(e.hands).forEach((p) => logLine(`${who(+p)}の手札：${e.hands[p].map((v) => `<b class="num">${v}</b>`).join(' + ')} = <b class="num">${E.sum(e.hands[p])}</b>`));
      await sleep(900 * k);
      break;
    }
    case 'recv': {
      U.labels[e.p] = { before: e.before, add: e.v, total: e.total };
      if (e.p === S.me) { U.myHand.push(e.v); renderDock(); }
      sfx('take');
      await scene.recv(e.p, e.slot, e.v);
      renderLabels();
      logLine(`${who(e.p)}は場札 <b class="num">${vName(e.v)}</b> を受け取る → 合計 <b class="num">${e.total}</b>`);
      await sleep(380 * k);
      break;
    }
    case 'wind': {
      U.lowWin = e.low;
      banner('風向き判定カードをめくります…', { ms: 1200, low: true });
      await sleep(600 * k);
      await scene.wind(e.v, e.low);
      if (e.low) sfx('monster');
      setRuleChip(e.low);
      banner(e.low ? `風向き <b class="num v9">${e.v}</b> 怪物の眼！ <b>合計の小さい人が勝ち</b>` : `風向き <b class="num">${e.v}</b>　<b>合計の大きい人が勝ち</b>`, { cls: 'big ' + (e.low ? 'low' : 'high'), ms: 2600, low: true });
      logLine(`風向き判定カード：<b class="num">${vName(e.v)}</b> → ${e.low ? '小さい方が勝ち' : '大きい方が勝ち'}`);
      await sleep(1500 * k);
      break;
    }
    case 'win': {
      U.won = e.p;
      renderLabels(); renderTags();
      sfx(e.p === S.me ? 'win' : 'lose');
      banner(`${who(e.p)}の勝ち！（合計 <b class="num">${e.total[e.p]}</b>）`, { cls: 'big', ms: 2200, low: true });
      logLine(`${who(e.p)}の勝ち`);
      await sleep(1000 * k);
      break;
    }
    case 'out': {
      banner(`${who(e.p)}は歯車がなくなって脱落…`, { ms: 2000 });
      logLine(`${who(e.p)}は脱落`);
      outNow[e.p] = true;
      renderTags();
      await sleep(900 * k);
      break;
    }
    case 'key': {
      await scene.moveKey(e.p);
      keyNow = e.p;
      renderTags();
      await showResult(view.last, view);
      break;
    }
    case 'over': break;
  }
}
// numbers shown while the round is played out (the view only catches up at the end)
let gearsNow = [], outNow = [], keyNow = 0;
function setAct(p, text) { U.act = text ? { p, text } : null; renderTags(); }
function setRuleChip(low) {
  const c = $('#ruleChip');
  c.classList.toggle('lowwin', low === true);
  c.classList.toggle('highwin', low === false);
}

/* ------------------------------------------------------------------ the round summary */
function showResult(sum, view) {
  if (!sum) return Promise.resolve();
  return new Promise((resolve) => {
    const over = view.phase === 'over';
    const rows = sum.order.map((p) => {
      const fled = sum.flee.indexOf(p) >= 0, won = sum.winner === p, lost = sum.loss[p] || 0;
      const nm = `<span class="nm" style="color:${pcol(p)}">${esc(p === S.me ? 'あなた' : view.players[p].name)}</span>`;
      let det = '', right = '';
      if (fled) { det = '逃げた（手札は伏せたまま）'; right = ''; }
      else if (sum.kind === 'battle') {
        const h = sum.hands[p];
        det = `<span class="hand-mini">${h.map((v) => mini(v)).join('')}</span><span>＋</span><span class="hand-mini">${mini(sum.recv[p], 'recv')}</span>`;
        right = `<span class="sum">${sum.total[p]}</span>`;
      } else det = '戦った（相手はみんな逃げた）';
      const res = won ? `<span class="ok">勝ち・鍵を受け取る</span>` : lost ? `<span class="g">歯車 −${lost}</span>` : '';
      const out = sum.out.indexOf(p) >= 0 ? ' <span class="g">脱落</span>' : '';
      return `<div class="res-row${won ? ' w' : ''}"><div>${nm}　${res}${out}</div>${right}<div class="det">${det}</div></div>`;
    }).join('');
    let windHtml;
    if (sum.kind === 'battle') {
      windHtml = `<div class="res-wind ${sum.low ? 'low' : 'high'}">${mini(sum.wind, 'big')}<div class="t">風向き ${vName(sum.wind)}<br>${sum.low ? '怪物の眼 → 合計の<b>小さい</b>人が勝ち' : '合計の<b>大きい</b>人が勝ち'}</div></div>`;
    } else {
      windHtml = `<div class="res-wind high"><div class="t">戦ったのは${esc(sum.winner === S.me ? 'あなた' : view.players[sum.winner].name)}だけ → 不戦勝<br><small class="note">風向き判定カードはめくりません</small></div></div>`;
    }
    let why = '';
    if (sum.kind === 'battle') {
      const asc = sum.fight.slice().sort((a, b) => sum.before[a] - sum.before[b] || sum.order.indexOf(a) - sum.order.indexOf(b));
      why = `<p class="why">手札の合計が小さい人から、場札の大きいカードを受け取ります：${asc.map((p) => `${esc(p === S.me ? 'あなた' : view.players[p].name)}（${sum.before[p]}）← <b class="num">${sum.recv[p]}</b>`).join('、')}`;
      const tot = sum.fight.map((p) => sum.total[p]);
      if (new Set(tot).size < tot.length) why += '<br>合計が同じときは、手番が先の人を「大きい」とみなします。';
      why += '</p>';
    }
    const gearsLine = view.players.map((P, p) => `<span style="color:${pcol(p)}">${esc(p === S.me ? 'あなた' : P.name)}</span> ${P.out ? '<span class="g">脱落</span>' : gearIcons(P.gears, view.startGears)}`).join('<br>');
    const html = `<h2>ラウンド ${sum.round} の結果</h2>${windHtml}${rows}${why}<h3>歯車の残り</h3><p style="line-height:1.9">${gearsLine}</p><div class="menu-actions"><button class="btn primary" data-a="next">${over ? '結果へ' : '次のラウンドへ'}</button></div>`;
    let timer = 0;
    const sh = sheet(html, {
      cls: 'result soft', modal: true, noClose: true,
      onAction(a, b, close) { if (a === 'next') { clearTimeout(timer); close(); resolve(); } }
    });
    // online, a round summary closes by itself so nobody keeps the table waiting
    if (S && S.kind !== 'solo') {
      let left = 15;
      const btn = $('[data-a="next"]', sh.el);
      const tick = () => { if (!sh.el.isConnected) return; left--; btn.textContent = (over ? '結果へ' : '次のラウンドへ') + `（${left}）`; if (left <= 0) { sh.close(); resolve(); } else timer = setTimeout(tick, 1000); };
      timer = setTimeout(tick, 1000);
    }
    if (TEST && !HOLD) setTimeout(() => { if (sh.el.isConnected) { sh.close(); resolve(); } }, 60);
  });
}

/* ------------------------------------------------------------------ the game loop (solo and host) */
function hostDo(fn) { hostChain = hostChain.then(fn).catch((e) => console.error(e)); return hostChain; }
async function commitNow(p, act) {
  if (!S || !isHostish()) return false;
  const r = E.apply(S.st, p, act);
  if (p === S.me) U.wait = false;
  if (!r.ok) { if (p === S.me) toast(errText(r.err)); return false; }
  const view = E.viewFor(S.st, S.me);
  if (S.kind === 'host') broadcastState(r.ev);
  saveGame();
  await present(E.evFor(r.ev, S.me), view);
  return true;
}
function thinkTime(phase, step) { return phase === 'escape' ? 1300 : step === 'peek' ? 800 : 900; }
let worker = null, wid = 0;
const pending = new Map();
function cpuDecide(view, level) {
  const seed = (S.rnd() * 4294967296) >>> 0;
  if (!worker && typeof Worker !== 'undefined' && !TEST) {
    try {
      worker = new Worker('cpu-worker.js?v=20261105a');
      worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data.act); } };
      worker.onerror = () => { worker = null; pending.forEach((p) => p(null)); pending.clear(); };
    } catch (e) { worker = null; }
  }
  if (!worker) return Promise.resolve(AI.decide(view, level, E.mulberry32(seed)));
  return new Promise((res) => {
    const id = ++wid;
    const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); res(AI.decide(view, level, E.mulberry32(seed))); } }, 6000);
    pending.set(id, (act) => { clearTimeout(t); res(act || AI.decide(view, level, E.mulberry32(seed))); });
    worker.postMessage({ id, view, level, seed });
  });
}
async function pumpNow() {
  while (S && isHostish()) {
    const st = S.st;
    if (st.phase === 'over') break;
    const w = E.waitingFor(st), cpu = w.find((p) => st.players[p].kind === 'cpu');
    if (cpu === undefined) { renderAll(); break; }
    setStatus(cpu, 'think');
    const t0 = performance.now();
    const view = E.viewFor(st, cpu);
    const act = await cpuDecide(view, st.players[cpu].level || 2);
    const rest = thinkTime(st.phase, st.step) * spd() * (0.75 + Math.random() * 0.5) - (performance.now() - t0);
    if (rest > 0) await sleep(rest);
    if (!S || S.st !== st) break;
    setStatus(cpu, null);
    if (!act) { console.error('CPU found no move'); break; }
    const ok = await commitNow(cpu, act);
    if (!ok) { console.error('CPU move refused', act); break; }
  }
}
function errText(err) { return ({ turn: '今はその操作はできません', bad: 'その操作はできません', over: 'ゲームは終わっています' })[err] || 'その操作はできません'; }

/* my move: run here (solo/host) or send to the host (guest) */
function submit(act) {
  if (!canAct()) return;
  sfx('click');
  U.wait = true; renderDock(); scene.setPickable(null);
  if (S.kind === 'guest') {
    if (L) L.link.send({ k: 'act', act, mv: V.moves });
    return;
  }
  hostDo(async () => { const ok = await commitNow(S.me, act); if (!ok) renderAll(); await pumpNow(); });
}

/* ------------------------------------------------------------------ rendering */
function renderAll() { renderTop(); renderTags(); renderDock(); renderPick(); renderLabels(); }
function renderTop() {
  if (!V) return;
  $('#roundChip').textContent = 'ラウンド ' + V.round;
}
let tagEls = [];
function renderTags() {
  const box = $('#tags');
  if (!V || !S) { box.innerHTML = ''; tagEls = []; return; }
  if (tagEls.length !== V.n) {
    box.innerHTML = ''; tagEls = [];
    for (let p = 0; p < V.n; p++) {
      const t = document.createElement('div'); t.className = 'tag'; t.dataset.p = p;
      t.innerHTML = '<div class="tn"><svg class="kk" viewBox="0 0 24 24"><use href="#k"/></svg><b></b><span class="lv"></span></div><div class="gw"></div><div class="ta"></div>';
      box.appendChild(t); tagEls.push(t);
    }
  }
  for (let p = 0; p < V.n; p++) {
    const t = tagEls[p], P = V.players[p];
    t.style.setProperty('--c', pcol(p));
    $('b', t).textContent = p === S.me ? 'あなた' : P.name;
    $('.lv', t).textContent = P.kind === 'cpu' ? 'CPU' : '';
    const g = gearsNow[p] !== undefined ? gearsNow[p] : P.gears;
    const out = outNow[p] || P.out;
    $('.gw', t).innerHTML = out ? '' : gearIcons(g, V.startGears);
    const key = (busy ? keyNow : V.key) === p;
    t.classList.toggle('key', key);
    t.classList.toggle('out', !!out);
    t.classList.toggle('me', p === S.me);
    const turn = !busy && V.phase !== 'over' && V.turn === p;
    const acting = busy && U.act && U.act.p === p;
    t.classList.toggle('turn', turn || acting);
    t.classList.toggle('won', U.won === p);
    let a = '';
    if (out) a = '脱落';
    else if (U.think === p) a = '考え中…';
    else if (acting) a = U.act.text;
    else if (turn && V.phase === 'pick') a = V.step === 'peek' ? '場札を見る番' : '場札を取る番';
    else if (turn && V.phase === 'escape') a = '戦うか逃げるか…';
    else if (U.status[p] === 'fight') a = '⚔ 戦う';
    else if (U.status[p] === 'flee') a = '逃げた';
    else if (U.act && U.act.p === p) a = U.act.text;   // what they just did stays readable (kept the peeked card or not)
    else if (V.phase === 'pick') { const n = (U.hands[p] || []).length; a = n ? `手札 ${n}枚` : ''; }
    $('.ta', t).textContent = a;
  }
}
// the other players' name tags sit in a strip under the top bar, above their seat; mine is in the dock
function tagStripTop() { const t = $('#topbar'); return t ? t.getBoundingClientRect().bottom + 6 : 54; }
function placeTags() {
  if (!scene || !V || $('#app').hidden) return;
  const a = scene.anchors();
  const W = window.innerWidth, top = tagStripTop();
  const xs = [];
  tagEls.forEach((t, p) => {
    if (S && p === S.me) return;
    const q = a.seats[p]; if (!q) return;
    const w = t.offsetWidth;
    let x = Math.max(6, Math.min(W - w - 6, q.x - w / 2));
    // two tags never overlap
    xs.forEach((o) => { if (x < o.x + o.w + 6 && x + w + 6 > o.x) x = q.x < o.x + o.w / 2 ? Math.max(6, o.x - w - 6) : Math.min(W - w - 6, o.x + o.w + 6); });
    xs.push({ x, w });
    t.style.transform = `translate(${x | 0}px,${top | 0}px)`;
  });
  labelEls.forEach((el) => {
    const p = +el.dataset.p, q = a.hands[p]; if (!q) return;
    el.style.transform = `translate(${(q.x - el.offsetWidth / 2) | 0}px,${(q.y - el.offsetHeight / 2) | 0}px)`;
  });
  // small names for the wind card and the unused cards
  [['#dialLbl', a.dial, '風向き判定カード'], ['#unusedLbl', a.unused, '使わない3枚']].forEach(([id, q, text]) => {
    let el = $(id);
    if (!el) { el = document.createElement('div'); el.id = id.slice(1); el.className = 'lbl side'; el.textContent = text; $('#tags').appendChild(el); }
    el.hidden = !q;
    if (q) el.style.transform = `translate(${(q.x - el.offsetWidth / 2) | 0}px,${(q.y - el.offsetHeight / 2) | 0}px)`;
  });
}
let labelEls = [];
function renderLabels() {
  const box = $('#labels');
  box.innerHTML = ''; labelEls = [];
  if (!V) return;
  Object.keys(U.labels).forEach((k) => {
    const p = +k, l = U.labels[p];
    const el = document.createElement('div');
    el.className = 'lbl' + (U.won === p ? ' w' : '');
    el.dataset.p = p;
    el.innerHTML = l.total !== undefined ? `<small>${l.before}＋${l.add}＝</small>${l.total}` : `<small>合計</small>${l.before}`;
    box.appendChild(el); labelEls.push(el);
  });
  placeTags();
}
function myHandVals() { return busy && U.myHand ? U.myHand : V ? E.myHand(V) : []; }
function renderDock() {
  const dock = $('#dock'), hint = $('#hint');
  if (!V || !S) { dock.innerHTML = ''; hint.textContent = ''; return; }
  const h = myHandVals();
  const meOut = (outNow[S.me] || V.players[S.me].out);
  const g = gearsNow[S.me] !== undefined ? gearsNow[S.me] : V.players[S.me].gears;
  const keyMine = (busy ? keyNow : V.key) === S.me;
  const head = `<div class="me-line"><b style="color:${pcol(S.me)}">あなた</b>${keyMine ? '<svg class="gi" viewBox="0 0 24 24" aria-label="鍵"><use href="#k"/></svg>' : ''}<span class="gw">${meOut ? '' : gearIcons(g, V.startGears)}</span></div>`;
  const mine = head + (meOut ? '<span>脱落しました。観戦中…</span>'
    : h.length ? `<span class="hand-mini">${h.map((v) => mini(v)).join('')}</span><span>合計 <b class="num">${E.sum(h)}</b></span>`
      : '<span>手札はまだありません</span>');
  let acts = '', hn = '';
  if (busy) { hn = ''; }
  else if (V.phase === 'over') { hn = 'ゲーム終了'; }
  else if (E.canPeek(V)) { hn = '見たい場札をタップ（数字はあなたにだけ見えます）'; }
  else if (E.canTake(V)) {
    hn = '手札にする場札をタップ（見たカード以外でもOK）';
    const ps = V.peekSlot, pv = ps >= 0 ? V.slots[ps].v : null;
    if (ps >= 0 && V.slots[ps].by < 0) acts = `<button class="btn primary" data-a="takePeek">見た <b class="num">${pv}</b> を取る</button>`;
  } else if (E.mustChoose(V)) {
    const field = V.slots.filter((s) => s.by < 0).map((s) => s.v);
    hn = `場札 ${field.map((v) => vName(v)).join('・')}　あなたの合計 ${E.sum(h)}。戦う？`;
    acts = `<button class="btn flee" data-a="flee">逃げる<small>歯車 −1</small></button><button class="btn fight" data-a="fight">戦う<small>負けると −2</small></button>`;
  } else if (V.turn >= 0) {
    const t = V.turn;
    hn = `${t === S.me ? 'あなた' : esc(pname(t))}の番です` + (V.phase === 'escape' ? '（戦うか逃げるか）' : '');
  }
  if (U.wait) acts = '';
  hint.innerHTML = hn;
  dock.innerHTML = `<div class="mine">${mine}</div><div class="acts">${acts}</div>`;
}
function renderPick() {
  if (!scene || !V) return;
  if (busy || U.wait) { scene.setPickable(null); return; }
  if (E.canPeek(V)) scene.setPickable(E.openSlots(V), 'peek');
  else if (E.canTake(V)) scene.setPickable(E.openSlots(V), 'take', V.peekSlot);
  else scene.setPickable(null);
}
function onPick(slot) {
  if (!canAct()) return;
  if (E.canPeek(V)) {
    if (V.slots[slot].by >= 0) return;
    if (V.slots[slot].mine && U.confirmPeek !== slot) {
      U.confirmPeek = slot;
      toast(`そのカード（${vName(V.slots[slot].v)}）はもう見ています。もう一度タップすると見直します`);
      return;
    }
    U.confirmPeek = -1;
    submit({ t: 'peek', slot });
  } else if (E.canTake(V)) {
    if (V.slots[slot].by >= 0) return;
    submit({ t: 'take', slot });
  }
}
function onDock(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  if (b.dataset.a === 'takePeek' && V && V.peekSlot >= 0) submit({ t: 'take', slot: V.peekSlot });
  if (b.dataset.a === 'fight') submit({ t: 'fight' });
  if (b.dataset.a === 'flee') {
    if (V.players[S.me].gears <= 1) {
      sheet('<h2>逃げると脱落します</h2><p>歯車が残り1個なので、逃げると0個になって脱落します。それでも逃げますか？</p><div class="menu-actions"><button class="btn" data-a="close">やめる</button><button class="btn primary" data-a="go">逃げる</button></div>', { onAction(a, bb, close) { if (a === 'go') { close(); submit({ t: 'flee' }); } } });
      return;
    }
    submit({ t: 'flee' });
  }
}

/* ------------------------------------------------------------------ menu, rules, log */
function openMenu() {
  sheet(`<h2>メニュー</h2>
    <div class="field"><span>動きの速さ</span><div class="seg" id="mSpeed"><button data-v="slow">ゆっくり</button><button data-v="normal">ふつう</button><button data-v="fast">はやい</button></div></div>
    <div class="menu-actions"><button class="btn" data-a="rules">ルール</button><button class="btn" data-a="log">記録</button></div>
    <div class="menu-actions"><button class="btn ghost" data-a="quit">${S && S.kind === 'solo' ? 'タイトルへ（続きから再開できます）' : 'ゲームをやめる'}</button></div>`,
  { onAction(a, b, close) { if (a === 'rules') { close(); openRules(); } if (a === 'log') { close(); openLog(); } if (a === 'quit') { close(); confirmQuit(); } } });
  segInit('mSpeed', settings.speed, (v) => { settings.speed = v; saveSettings(); scene.setSpeed(spd()); });
}
const RULES_HTML = `<h2>ルール</h2><div class="rules">
  <p>カードは<b>0〜9が1枚ずつ</b>の10枚。<b class="v0">0は蒼き眼</b>、<b class="v9">9は紅き眼</b>の怪物です。歯車（ライフ）は各自5個。<b>自分以外の歯車を全部なくした人</b>の勝ち。</p>
  <h3>準備</h3>
  <ul><li>2人：6枚を場に伏せ、1枚を<b>風向き判定カード</b>として離して伏せる。残り3枚は使わない。</li><li>3人：9枚を場に伏せ、残り1枚が風向き判定カード。</li><li>風向き判定カードはだれも見られない。鍵を持つ人からラウンドを始める。</li></ul>
  <h3>1. 手札を選ぶ（2周）</h3>
  <ol><li>手番では、場札を<b>1枚見る</b>（自分だけ）。</li><li>それから場札を<b>1枚取る</b>（見たカードでも、別のカードでもよい）。</li></ol>
  <p class="note">だれがどのカードを見たかは全員にわかります（目の印）。数字は見た人だけが知っています。</p>
  <h3>2. 戦うか、逃げるか</h3>
  <p>残った場札を表にします。鍵を持つ人から順に「戦う」か「逃げる」。逃げると<b>歯車 −1</b>でそのラウンドは終わり。戦う人が1人だけなら<b>不戦勝</b>。</p>
  <h3>3. 戦闘</h3>
  <p>戦う人は手札を公開。<b>合計が小さい人から順に、場札の大きいカード</b>を受け取って3枚にします（合計が同じなら手番が先の人から）。3人中2人で戦うときは、一番大きいカードと一番小さいカードを受け取り、真ん中は残します。</p>
  <div class="box ex">${'<span>例：</span>'}<span>3+7=10</span><span>6+2=8</span><span>4+5=9</span><span>場札 0・8・1 →</span><span>8の人が<b>8</b>、9の人が<b>1</b>、10の人が<b>0</b></span></div>
  <h3 id="rWind">4. 風向き判定</h3>
  <div class="box wind"><b class="num">1〜8</b><span>手札の合計が<b>大きい</b>人の勝ち</span><b class="num v9">0・9</b><span>手札の合計が<b>小さい</b>人の勝ち（怪物の眼が風向きを変える）</span></div>
  <p>合計が同じなら、手番が先の人を「大きい」とみなします。負けた人は<b>歯車 −2</b>。0個になったら脱落。勝った人が<b>鍵</b>を受け取り、次のラウンドの最初の手番になります。</p>
  <h3>コツ</h3>
  <ul><li>合計が小さい人ほど大きい場札をもらえるので、強すぎる手札は逆転されることがあります。</li><li>自分が0や9を持っている・場に出ているなら、風向きが0か9になる確率は下がります。</li></ul>
  <p class="note">ボードゲーム「風の怪物ピラデロ」（Dragon Create／ゲームデザイン：桃居土 竜）のルールで遊べる、個人で遊ぶための非公式版です。</p>
</div>`;
function openRules(anchor) {
  const sh = sheet(RULES_HTML);
  if (anchor) { const el = $('#' + anchor, sh.el); if (el) el.scrollIntoView({ block: 'start' }); }
}
function openLog() {
  sheet('<h2>記録</h2><ul class="log" id="logList"></ul>');
  renderLog();
}
function renderLog() {
  const ul = $('#logList'); if (!ul || !S) return;
  ul.innerHTML = S.log.map((l) => `<li><span class="t">R${l.r}</span><span>${l.html}</span></li>`).join('') || '<li>まだ何もありません</li>';
}
function confirmQuit() {
  if (S && S.kind === 'solo') { saveGame(); toTitle(); return; }
  sheet('<h2>ゲームをやめますか？</h2><p>オンラインの部屋からも抜けます。</p><div class="menu-actions"><button class="btn" data-a="close">もどる</button><button class="btn primary" data-a="go">やめる</button></div>', { onAction(a, b, close) { if (a === 'go') { close(); leaveRoom(); toTitle(); } } });
}
function finishGame() {
  if (!S || !V) return;
  if (S.kind === 'solo') store.del('piradero.save');
  const w = V.winner;
  const meWon = w === S.me;
  sfx(meWon ? 'win' : 'lose');
  const rounds = V.round;
  const rows = V.players.map((P, p) => `<div class="res-row${p === w ? ' w' : ''}"><div><span class="nm" style="color:${pcol(p)}">${esc(p === S.me ? 'あなた' : P.name)}</span>　${p === w ? '<span class="ok">優勝</span>' : '<span class="g">脱落</span>'}</div><div class="sum">${P.gears}</div><div class="det">${P.out ? '' : gearIcons(P.gears, V.startGears)}</div></div>`).join('');
  const again = S.kind !== 'guest';
  sheet(`<h2 class="end-title">${meWon ? 'あなたの勝ち！' : esc(V.players[w].name) + 'の勝ち'}</h2><p style="text-align:center" class="note">${rounds}ラウンドで決着</p>${rows}
    <div class="menu-actions">${again ? '<button class="btn primary" data-a="again">もう一度</button>' : ''}<button class="btn" data-a="title">タイトルへ</button></div>`,
  { modal: true, noClose: true, onAction(a, b, close) { if (a === 'again') { close(); playAgain(); } if (a === 'title') { close(); if (S && S.kind !== 'solo') leaveRoom(); toTitle(); } } });
}

/* ------------------------------------------------------------------ starting, saving and leaving */
function cpuPlayers(k, level, used) {
  const names = CPU_NAMES.filter((n) => !used.has(n));
  return Array.from({ length: k }, (_, i) => ({ name: names[i] || 'CPU' + (i + 1), kind: 'cpu', level }));
}
function startSolo(cfg) {
  const me = { name: cfg.name || 'あなた', kind: 'human', level: 0 };
  const players = [me].concat(cpuPlayers(cfg.n - 1, cfg.level, new Set([me.name])));
  const seed = (Math.random() * 4294967296) >>> 0;
  const st = E.newGame({ players, seed, gears: cfg.gears, key: cfg.first === 'me' ? 0 : -1 });
  S = { kind: 'solo', st, me: 0, cfg, log: [], rnd: E.mulberry32(seed ^ 0x5bd1e995) };
  V = E.viewFor(st, 0);
  beginGame(true);
}
function saveGame() { if (S && S.kind === 'solo' && S.st.phase !== 'over') store.set('piradero.save', { v: 1, st: S.st, cfg: S.cfg, log: S.log.slice(0, 80) }); }
function resumeSolo() {
  const sv = store.get('piradero.save');
  if (!sv || !sv.st || sv.v !== 1) { store.del('piradero.save'); showTitle(); return; }
  S = { kind: 'solo', st: sv.st, me: 0, cfg: sv.cfg, log: sv.log || [], rnd: E.mulberry32((Math.random() * 4294967296) >>> 0) };
  V = E.viewFor(S.st, 0);
  beginGame(false);
}
function beginGame(fresh) {
  closeSheets();
  showScreen(null);
  $('#app').hidden = false;
  hideBanner();
  scene.setHost($('#stage'));
  scene.setTitleMode(false);
  scene.setSpeed(spd());
  gearsNow = V.players.map((P) => P.gears); outNow = V.players.map((P) => P.out); keyNow = V.key;
  U.wait = false; busy = false; tagEls = []; $('#tags').innerHTML = '';
  rebuildMemo(V);
  if (fresh) {
    const first = V.rps && V.rps.random ? `ジャンケンで${V.key === S.me ? 'あなた' : esc(pname(V.key))}が鍵を受け取りました` : null;
    if (first) setTimeout(() => toast(first, 2600), 300);
    const go = () => present([{ t: 'round', round: V.round, key: V.key, order: V.order }], V).then(() => { if (isHostish()) hostDo(pumpNow); });
    if (isHostish()) hostDo(go); else chain = chain.then(go);
  } else {
    scene.sync(V);
    renderAll();
    if (isHostish()) hostDo(pumpNow);
  }
}
function playAgain() {
  if (!S) return;
  if (S.kind === 'solo') { startSolo(S.cfg); return; }
  if (S.kind === 'host') startOnlineGame(true);
}
function toTitle() {
  S = null; V = null; busy = false; U.wait = false;
  $('#app').hidden = true;
  closeSheets();
  hideBanner();
  showTitle();
}
function showTitle() {
  $('#tResume').hidden = !store.get('piradero.save');
  showScreen('scrTitle');
}
function segInit(id, value, onPick) {
  const el = document.getElementById(id);
  $$('button', el).forEach((b) => { b.classList.toggle('on', b.dataset.v === String(value)); b.onclick = () => { sfx('click'); $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); }; });
}
function openSolo() {
  $('#soName').value = settings.name || '';
  segInit('soN', settings.solo.n, (v) => { settings.solo.n = +v; saveSettings(); });
  segInit('soLevel', settings.solo.level, (v) => { settings.solo.level = +v; saveSettings(); });
  segInit('soGears', settings.solo.gears, (v) => { settings.solo.gears = +v; saveSettings(); });
  segInit('soFirst', settings.solo.first, (v) => { settings.solo.first = v; saveSettings(); });
  showScreen('scrSolo');
}
function initScreens() {
  $('#tCards').onclick = () => {
    const names = ['蒼き眼の怪物','ルナスピア','オパコグ','ギアプテリス','ワリセレア','アノモトリス','ブラスレピス','アモナリリス','ダンクレオギア','紅き眼の怪物'];
    const h = sheet('<h2>10枚のカード</h2><div class="card-gallery">' + names.map((name,v) => `<figure><img src="${CARDS.faceURL(v,320)}" alt="${v} ${name}"><figcaption><b>${v}</b>${name}</figcaption></figure>`).join('') + '</div>');
    h.el.querySelector('.sheet').classList.add('card-sheet');
  };
  $('#tSolo').onclick = () => { sfx('click'); openSolo(); };
  $('#tResume').onclick = () => { sfx('click'); resumeSolo(); };
  $('#tOnline').onclick = () => { sfx('click'); openOnline(); };
  $('#tRules').onclick = () => { sfx('click'); openRules(); };
  $('#soBack').onclick = () => { sfx('click'); showTitle(); };
  $('#onBack').onclick = () => { sfx('click'); showTitle(); };
  $('#soStart').onclick = () => {
    sfx('click');
    settings.name = NET.cleanName($('#soName').value); saveSettings();
    store.del('piradero.save');
    startSolo({ name: settings.name, n: settings.solo.n, level: settings.solo.level, gears: settings.solo.gears, first: settings.solo.first });
  };
  $('#btnMenu').onclick = () => { sfx('click'); openMenu(); };
  $('#btnLog').onclick = () => { sfx('click'); openLog(); };
  $('#ruleChip').onclick = () => { sfx('click'); openRules('rWind'); };
  $('#btnSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); syncSoundBtn(); sfx('click'); };
  $('#dock').addEventListener('click', onDock);
  syncSoundBtn();
}
function syncSoundBtn() {
  if (globalThis.GEMINI_BGM && globalThis.GEMINI_BGM.setEnabled) globalThis.GEMINI_BGM.setEnabled(settings.sound);
  $('#btnSound').classList.toggle('off', !settings.sound);
  $('#btnSound').setAttribute('aria-pressed', String(settings.sound));
}
document.addEventListener('gemini-bgm-change', syncSoundBtn);

/* ------------------------------------------------------------------ online */
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('piradero.cid'); } catch (e) { /* ignore */ }
  if (!c) { c = NET.makeCid(); try { sessionStorage.setItem('piradero.cid', c); } catch (e) { /* ignore */ } }
  return c;
}
function netErr(e) {
  const c = e && e.code;
  return c === 'notfound' ? 'その部屋が見つかりませんでした。コードを確かめてください。' : c === 'taken' ? '部屋コードが重なりました。もう一度つくってください。' : c === 'lib' ? '通信の部品を読みこめませんでした。電波のよい所でもう一度。' : '接続できませんでした。少し待ってもう一度。';
}
function openOnline(code) {
  $('#onName').value = settings.name || '';
  if (code) $('#onCode').value = NET.cleanCode(code);
  $('#onErr').hidden = true;
  showScreen('scrOnline');
}
function onlineError(msg) { const e = $('#onErr'); e.textContent = msg; e.hidden = false; }
function takeName() {
  const n = NET.cleanName($('#onName').value);
  if (!n) { onlineError('名前を入れてください。'); return null; }
  settings.name = n; saveSettings();
  return n;
}
async function createRoom() {
  const name = takeName(); if (!name) return;
  $('#onCreate').disabled = true;
  try {
    let code = null, link = null;
    for (let k = 0; k < 4 && !link; k++) {
      code = NET.makeCode();
      const l = NET.makeHost(NETKIND);
      try { await l.host(code); link = l; } catch (e) { if (!(e && e.code === 'taken')) throw e; }
    }
    if (!link) throw { code: 'taken' };
    L = { role: 'host', link, code, players: [{ name, kind: 'host', online: true }], level: settings.lobby.level, gears: settings.lobby.gears };
    link.on('msg', onHostMsg);
    link.on('leave', onHostLeave);
    showLobby();
  } catch (e) { onlineError(netErr(e)); } finally { $('#onCreate').disabled = false; }
}
async function joinRoom() {
  const name = takeName(); if (!name) return;
  const code = NET.cleanCode($('#onCode').value);
  if (code.length !== 4) { onlineError('4文字の部屋コードを入れてください。'); return; }
  $('#onJoin').disabled = true;
  try {
    const link = NET.makeGuest(NETKIND);
    await link.join(code);
    L = { role: 'guest', link, code, players: [], me: -1, level: 2, gears: 5 };
    link.on('msg', onGuestMsg);
    link.on('close', lostHost);
    link.send({ k: 'hello', cid: myCid(), name, v: NET.PROTOCOL });
    showLobby();
  } catch (e) { onlineError(netErr(e)); } finally { $('#onJoin').disabled = false; }
}
function showLobby() { renderLobby(); showScreen('scrLobby'); }
function renderLobby() {
  if (!L) return;
  $('#lobCode').textContent = L.code;
  const host = L.role === 'host';
  $('#lobNote').textContent = host ? '部屋コードか招待リンクを送ってください。2〜3人で遊べます。空いた席はCPUを加えられます。' : '進行役がはじめるのを待っています。';
  $('#lobSeats').innerHTML = L.players.map((p, i) => `<div class="seat-row"><span class="dotc" style="background:${pcol(i)}"></span><b>${esc(p.name)}</b><span class="note">${p.kind === 'host' ? '進行役' : p.kind === 'cpu' ? 'CPU・' + (LEVEL_NAME[p.level || L.level] || '') : p.online === false ? '接続待ち' : ''}${i === L.me ? '（あなた）' : ''}</span>${host && i > 0 ? `<button class="btn small ghost" data-rm="${i}">外す</button>` : ''}</div>`).join('');
  $('#lobHost').hidden = !host;
  if (host) {
    segInit('lobLevel', L.level, (v) => { L.level = +v; settings.lobby.level = L.level; saveSettings(); L.players.forEach((p) => { if (p.kind === 'cpu') p.level = L.level; }); sendLobby(); renderLobby(); });
    segInit('lobGears', L.gears, (v) => { L.gears = +v; settings.lobby.gears = L.gears; saveSettings(); sendLobby(); });
    $('#lobStart').disabled = L.players.length < 2;
    $('#lobAddCpu').disabled = L.players.length >= 3;
  } else {
    $('#lobGuestInfo').textContent = `歯車${L.gears}個・CPUの強さ：${LEVEL_NAME[L.level] || ''}`;
  }
  $('#lobGuestInfo').hidden = host;
}
function sendLobby() {
  if (!L || L.role !== 'host') return;
  const pub = L.players.map((p) => ({ name: p.name, kind: p.kind, level: p.level || L.level, online: p.online !== false }));
  L.players.forEach((p, i) => { if (p.cid) L.link.send(p.cid, { k: 'lobby', code: L.code, players: pub, you: i, level: L.level, gears: L.gears }); });
}
function broadcast(m) { if (S && S.kind === 'host' && L) S.cids.forEach((cid, o) => { if (cid && S.online[o]) L.link.send(cid, m); }); }
function onHostMsg(cid, m) {
  if (!m || typeof m !== 'object' || !L) return;
  if (m.k === 'hello') {
    const name = NET.cleanName(m.name) || 'ゲスト';
    if (m.v !== NET.PROTOCOL) { L.link.send(cid, { k: 'bye', why: 'version' }); L.link.drop(cid); return; }
    if (S && S.kind === 'host') {
      const o = S.cids.indexOf(cid);
      if (o >= 0) { S.online[o] = true; if (L.players[o]) L.players[o].online = true; sendFull(o); toast(esc(S.st.players[o].name) + 'がもどりました'); renderTags(); }
      else { L.link.send(cid, { k: 'bye', why: 'started' }); L.link.drop(cid); }
      return;
    }
    let p = L.players.find((x) => x.cid === cid);
    if (!p) {
      if (L.players.length >= 3) { L.link.send(cid, { k: 'bye', why: 'full' }); L.link.drop(cid); return; }
      p = { name, kind: 'guest', cid, online: true };
      L.players.push(p);
      sfx('click');
    } else { p.name = name; p.online = true; }
    sendLobby(); renderLobby();
    return;
  }
  if (m.k === 'leave') { onHostLeave(cid); return; }
  if (!S || S.kind !== 'host') return;
  const o = S.cids.indexOf(cid);
  if (o < 0) return;
  if (m.k === 'act') {
    const act = cleanAct(m.act);
    hostDo(async () => {
      if (!S || S.kind !== 'host') return;
      if (!act || E.waitingFor(S.st).indexOf(o) < 0) { L.link.send(cid, { k: 'err', err: 'turn', view: E.viewFor(S.st, o) }); return; }
      const ok = await commitNow(o, act);
      if (!ok && S) L.link.send(cid, { k: 'err', err: 'bad', view: E.viewFor(S.st, o) });
      await pumpNow();
    });
  }
}
function cleanAct(a) {
  if (!a || typeof a !== 'object') return null;
  const int = (x) => (Number.isInteger(x) ? x : -1);
  switch (a.t) {
    case 'peek': case 'take': return { t: a.t, slot: int(a.slot) };
    case 'fight': case 'flee': return { t: a.t };
  }
  return null;
}
function onHostLeave(cid) {
  if (S && S.kind === 'host') {
    const o = S.cids.indexOf(cid);
    if (o >= 0 && S.online[o]) {
      S.online[o] = false; if (L && L.players[o]) L.players[o].online = false;
      toast(esc(S.st.players[o].name) + 'の接続が切れました');
      offerTakeover(o);
      renderTags();
    }
    return;
  }
  if (!L) return;
  L.players = L.players.filter((p) => p.cid !== cid);
  sendLobby(); renderLobby();
}
function offerTakeover(o) {
  sheet(`<h2>${esc(S.st.players[o].name)}の接続が切れました</h2><p>もどってくるのを待つか、CPUに代わりにやってもらえます。</p><div class="menu-actions"><button class="btn primary" data-a="cpu">CPUに任せる</button><button class="btn" data-a="close">待つ</button></div>`,
    { onAction(a, b, close) {
      if (a === 'cpu' && S && S.kind === 'host') {
        close();
        hostDo(async () => { S.st.players[o].kind = 'cpu'; S.st.players[o].level = 2; V = E.viewFor(S.st, S.me); broadcastState([]); renderAll(); await pumpNow(); });
      }
    } });
}
function startOnlineGame() {
  if (!L || L.role !== 'host' || L.players.length < 2) return;
  const players = L.players.map((p) => ({ name: p.name, kind: p.kind === 'cpu' ? 'cpu' : 'human', level: p.kind === 'cpu' ? (p.level || L.level) : 0 }));
  const seed = (Math.random() * 4294967296) >>> 0;
  const st = E.newGame({ players, seed, gears: L.gears, key: -1 });
  S = { kind: 'host', st, me: 0, log: [], rnd: E.mulberry32(seed ^ 0x2545f491), cids: L.players.map((p) => p.cid || null), online: L.players.map((p) => p.kind !== 'guest' || p.online !== false) };
  V = E.viewFor(st, 0);
  S.cids.forEach((cid, o) => { if (cid) L.link.send(cid, { k: 'state', full: true, fresh: true, view: E.viewFor(st, o), log: [] }); });
  beginGame(true);
}
function sendFull(o) { const cid = S.cids[o]; if (cid) L.link.send(cid, { k: 'state', full: true, view: E.viewFor(S.st, o), log: S.log.slice(0, 40) }); }
function broadcastState(ev) { S.cids.forEach((cid, o) => { if (cid && S.online[o]) L.link.send(cid, { k: 'state', view: E.viewFor(S.st, o), ev: E.evFor(ev, o) }); }); }
function onGuestMsg(m) {
  if (!m || typeof m !== 'object' || !L) return;
  if (m.k === 'lobby') { L.players = m.players; L.me = m.you; L.level = m.level; L.gears = m.gears; if (!S) renderLobby(); return; }
  if (m.k === 'state') {
    if (!m.view) return;
    if (!S || m.full || S.kind !== 'guest' || m.view.me !== S.me) {
      chain = Promise.resolve();
      S = { kind: 'guest', me: m.view.me, log: Array.isArray(m.log) ? m.log : [] };
      V = m.view;
      beginGame(!!m.fresh);
      return;
    }
    const view = m.view, ev = Array.isArray(m.ev) ? m.ev : [];
    chain = chain.then(() => { U.wait = false; return present(ev, view); });
    return;
  }
  if (!S || S.kind !== 'guest') return;
  if (m.k === 'status') { U.think = m.text ? m.p : -1; renderTags(); return; }
  if (m.k === 'err') { U.wait = false; if (m.view && !busy) { V = m.view; scene.sync(V); } toast('その操作はできませんでした'); renderAll(); return; }
  if (m.k === 'bye') {
    const why = { full: '部屋がいっぱいでした（3人まで）。', started: 'その部屋はもう始まっています。', version: 'アプリの版がちがいます。ページを読みこみ直してください。' }[m.why] || '進行役が部屋を閉じました。';
    leaveRoom(); S = null; V = null; $('#app').hidden = true; closeSheets(); openOnline(); onlineError(why);
  }
}
function lostHost() {
  const inGame = !!S;
  leaveRoom();
  if (inGame) {
    sheet(`<h2>接続が切れました</h2><p>進行役との接続が切れました。進行役の画面が閉じたか、電波が弱くなったのかもしれません。</p><div class="menu-actions"><button class="btn primary" data-a="t">タイトルへ</button></div>`,
      { modal: true, noClose: true, onAction(a, b, close) { close(); S = null; V = null; $('#app').hidden = true; showTitle(); } });
  } else { openOnline(); onlineError('進行役との接続が切れました。'); }
}
function leaveRoom() {
  if (!L) return;
  try {
    if (L.role === 'host') L.players.forEach((p) => { if (p.cid) L.link.send(p.cid, { k: 'bye', why: 'closed' }); });
    else L.link.send({ k: 'leave' });
  } catch (e) { /* closing anyway */ }
  const link = L.link;
  L = null;
  setTimeout(() => { try { link.close(); } catch (e) { /* ignore */ } }, 300);
}
function initOnline() {
  $('#onCreate').onclick = () => { sfx('click'); createRoom(); };
  $('#onJoin').onclick = () => { sfx('click'); joinRoom(); };
  $('#onCode').addEventListener('input', (e) => { e.target.value = NET.cleanCode(e.target.value); });
  $('#lobLeave').onclick = () => { sfx('click'); leaveRoom(); showTitle(); };
  $('#lobAddCpu').onclick = () => {
    if (!L || L.players.length >= 3) return;
    sfx('click');
    const used = new Set(L.players.map((p) => p.name));
    const name = CPU_NAMES.find((x) => !used.has(x)) || 'CPU';
    L.players.push({ name, kind: 'cpu', level: L.level });
    sendLobby(); renderLobby();
  };
  $('#lobSeats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b || !L || L.role !== 'host') return;
    const p = L.players[+b.dataset.rm];
    if (p && p.cid) { L.link.send(p.cid, { k: 'bye', why: 'closed' }); L.link.drop(p.cid); }
    L.players.splice(+b.dataset.rm, 1);
    sendLobby(); renderLobby();
  });
  $('#lobStart').onclick = () => { sfx('click'); startOnlineGame(); };
  $('#lobInvite').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + (L ? L.code : '');
    const done = () => toast('招待リンクをコピーしました');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(esc(url), 6000));
    else toast(esc(url), 6000);
  };
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  initScreens();
  initOnline();
  const fontWait = CARDS.fontsReady(2500);
  try {
    await Promise.all([fontWait, CARDS.ready()]);
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    const hasGL = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (hasGL) await loadThree();
    const renderScene = hasGL ? createScene : createFlatScene;
    scene = renderScene($('#titleBg'), {
      onPick,
      onFrame: placeTags,
      barPx: () => { const d = $('#dockWrap'); return d && !$('#app').hidden ? d.getBoundingClientRect().height + 4 : 120; },
      topPx: () => { const t = $('#topbar'); return t && !$('#app').hidden ? tagStripTop() + 60 : 60; }
    });
    if (!scene) scene = createFlatScene($('#titleBg'), { onPick, onFrame: placeTags });
    scene.setSfx(sfx);
  } catch (e) {
    console.error(e);
    $('#loaderMsg').textContent = '画面を準備できませんでした。再読み込みしてください。';
    return;
  }
  $('#loader').hidden = true;
  window.addEventListener('resize', () => { if (scene) scene.fit(); });
  const room = params.get('room');
  if (room) openOnline(room);
  else showTitle();
}
window.PD_APP = { get S() { return S; }, get V() { return V; }, get busy() { return busy; }, get scene() { return scene; }, submit, startSolo, onPick };
boot();

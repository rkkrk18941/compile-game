/* クリプティッド — the page: title and setup screens, the field book beside the board, the turn flow, CPU turns,
   animations, the deduction memo, hints, saving, and online play (the host's browser runs the game; guests send
   their moves and get back only what they may see). */
import { loadThree, createScene, PIECE_HEX } from './scene.js?v=20261020a';

const D = window.CRY_DATA, E = window.CRY_ENG, AI = window.CRY_AI, NET = window.CRY_NET;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const N = D.N;
const COLOR = {}; D.PLAYER_COLORS.forEach((c) => { COLOR[c.key] = c; });
const LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
const TERR_HEX = ['#2f8c45', '#efc23a', '#3a86c6', '#4a2d5b', '#9c9b96'];
const TERR_ONE = ['森', '砂', '水', '沼', '山'];
const STRUCT_SW = { white: '#ecebe4', green: '#2f9a4c', blue: '#2f6cc4', black: '#2e2f33' };
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

/* ------------------------------------------------------------------ storage and settings */
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const settings = Object.assign({ sound: true, speed: 'normal', legal: true, autoMemo: false, top: false, name: '',
  solo: { n: 4, mode: 'normal', level: 2, color: 'red', first: 'random' }, lobby: { mode: 'normal', level: 2 } }, store.get('cryptid.settings') || {});
function saveSettings() { store.set('cryptid.settings', settings); }
const SPEED = { slow: 1.6, normal: 1, fast: 0.5 };
const spd = () => SPEED[settings.speed] || 1;

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
    noise = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function knock(freq, dur, gain, q) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf(c); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, gain, type, delay) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    unlock() { ctx(); },
    disc() { knock(2300, 0.06, 0.55, 7); tone(210, 0.09, 0.22); },
    cube() { knock(1250, 0.09, 0.7, 5); tone(120, 0.13, 0.35); },
    pawn() { knock(700, 0.05, 0.25, 2); },
    click() { knock(3200, 0.025, 0.18, 9); },
    turn() { tone(660, 0.16, 0.12, 'triangle'); tone(990, 0.22, 0.1, 'triangle', 0.1); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 0.12, 'triangle', i * 0.11)); },
    fail() { tone(330, 0.22, 0.12, 'triangle'); tone(247, 0.3, 0.12, 'triangle', 0.14); },
    hint() { tone(880, 0.2, 0.09, 'sine'); tone(1320, 0.3, 0.07, 'sine', 0.12); }
  };
})();
function sfx(name) { if (settings.sound) { try { SFX[name](); } catch (e) { /* audio blocked */ } } }

/* ------------------------------------------------------------------ small UI helpers */
let bannerTimer = 0;
function banner(html, hold) {
  const b = $('#banner');
  b.innerHTML = html; b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), hold || 2600 * spd());
}
function toast(msg, ms) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms || 3000);
}
function showScreen(id) {
  $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
  if (scene) {
    if (id) { scene.setHost($('#titleBg')); if (id === 'scrTitle' || !S) scene.setOrbit(true); }
    else { scene.setOrbit(false); scene.setHost($('#stage')); }
  }
}
function sheet(html, opts = {}) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  const sh = document.createElement('div');
  sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
  sh.innerHTML = (opts.noClose ? '' : '<button class="x" aria-label="閉じる" data-a="close">×</button>') + html;
  bg.append(sh); $('#layer').append(bg);
  function close() { if (!bg.isConnected) return; bg.remove(); if (opts.onClose) opts.onClose(); }
  bg.addEventListener('click', (e) => { if (e.target === bg && !opts.modal) close(); });
  sh.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    if (b.dataset.a === 'close') { close(); return; }
    if (opts.onAction) opts.onAction(b.dataset.a, b, close);
  });
  const f = sh.querySelector('button:not(.x)') || sh.querySelector('.x');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  return { el: sh, close };
}
function closeSheets() { $$('#layer .sheet-bg').forEach((b) => b.remove()); }
function dot(color, sq) { return `<span class="dot${sq ? ' sq' : ''}" style="background:${PIECE_HEX[color]}"></span>`; }

/* ------------------------------------------------------------------ session state */
let scene = null, boardInfo = null;
let S = null;          // the session: { kind: 'solo'|'host'|'guest', st (solo/host), me, memo, memoTab, log, lastHex, ... }
let V = null;          // the view the screen currently shows (catches up with the game after each animation)
let busy = 0, chain = Promise.resolve();
const ui = { sel: -1, info: -1, confirm: false, ct: 0, peek: null, eyes: {} };

const owner = (s) => V.seats[s].owner;
const oname = (o) => (V.players[o] ? V.players[o].name : '?');
const odots = (o) => V.ownerSeats[o].map((s) => dot(V.seats[s].color)).join('');
const who = (o) => `<span class="who">${odots(o)}${esc(oname(o))}</span>`;
function swho(s) {
  const o = owner(s);
  return V.twoP ? `<span class="who">${dot(V.seats[s].color)}${esc(oname(o))}（${COLOR[V.seats[s].color].name}）</span>` : who(o);
}
function mySeats() { return V.ownerSeats[S.me]; }
function regionOf(c) { const m = E.context(V.spec).masks[c].arr, out = []; for (let h = 0; h < N; h++) if (m[h]) out.push(h); return out; }
function hexInfo(h) {
  const b = boardInfo, parts = [D.TERRAIN[b.terrain[h]].name];
  if (b.animal[h]) parts.push(D.ANIMAL[b.animal[h]].name + 'の縄張り');
  if (b.struct[h] >= 0) { const st = b.structs[b.struct[h]]; parts.push(D.COLOR_ADJ[st.color] + D.STRUCT_NAME[st.type]); }
  return parts.join('・');
}
function piecesHtml(h) {
  const out = [];
  if (V.discs[h].length) out.push('ディスク ' + V.discs[h].map((s) => dot(V.seats[s].color)).join(''));
  if (V.cube[h] >= 0) out.push('キューブ ' + dot(V.seats[V.cube[h]].color, true));
  return out.join('　');
}
function selcard(h, tag) {
  const p = piecesHtml(h);
  return `<div class="selcard"><span class="tag">${tag || '選択中'}</span><span>${esc(hexInfo(h))}${p ? '<br>' + p : ''}</span></div>`;
}
function myInput() {
  if (!S || !V || busy || S.wait || V.phase === 'over') return null;
  const p = V.pending;
  return p && p.o === S.me ? p.k : null;
}

/* ------------------------------------------------------------------ the game loop */
function enqueue(ev, viewAfter) {
  busy++;
  renderAct();
  chain = chain.then(() => playEvents(ev)).catch((e) => console.error(e)).then(() => {
    V = viewAfter;
    busy--;
    if (!busy) { boardInfo = E.buildBoard(V.spec); scene.setPieces(V.cube, V.discs); renderAll(); afterSettle(); }
  });
}
function commit(o, act) {
  const r = E.apply(S.st, o, act);
  if (r.ok) afterApply(r.ev);
  return r;
}
function afterApply(ev) {
  if (S.kind === 'host') broadcastState(ev);
  if (S.kind === 'solo') saveGame();
  enqueue(ev, E.viewFor(S.st, S.me));
}
function afterSettle() {
  if (!S) return;
  if (V.phase === 'over') {
    if (S.kind === 'solo') store.del('cryptid.save');
    if (!S.endShown) { S.endShown = true; setTimeout(() => { if (S && V.phase === 'over') showEnd(); }, 1300 * spd()); }
    return;
  }
  if (S.kind !== 'guest') pump();
}

/* CPU players think in a worker */
let worker = null, wid = 0;
const waiters = new Map();
function cpuLocal(msg) {
  const rng = E.mulberry32(msg.seed);
  return msg.kind === 'vote' ? { vote: AI.voteHint(msg.view, msg.level, rng) } : { act: AI.choose(msg.view, msg.level, rng) };
}
function cpuCall(msg) {
  msg.seed = (Math.random() * 4294967296) >>> 0;
  if (worker === null) {
    try {
      worker = new Worker('cpu-worker.js?v=20261020a');
      worker.onmessage = (e) => { const w = waiters.get(e.data.id); if (w) { waiters.delete(e.data.id); w(e.data); } };
      worker.onerror = () => { worker = false; waiters.forEach((w, id) => { waiters.delete(id); w(null); }); };
    } catch (e) { worker = false; }
  }
  if (!worker) return Promise.resolve(cpuLocal(msg));
  return new Promise((res) => {
    const id = ++wid;
    waiters.set(id, (d) => res(d && !d.err ? d : cpuLocal(msg)));
    worker.postMessage(Object.assign({ id }, msg));
    setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); res(cpuLocal(msg)); } }, 9000);
  });
}
function randomLegal(st, o) {
  const p = st.pending;
  if (p.k === 'setup' || p.k === 'penalty') { const L = E.legalCubes(st, o); if (!L.length) return null; const c = L[Math.floor(Math.random() * L.length)]; return { t: 'cube', h: c.h, s: c.seats[0] }; }
  if (p.k === 'extra') { const s = p.seats[0], L = E.legalExtraDiscs(st, s, p.h); return L.length ? { t: 'disc', s, h: L[0] } : null; }
  if (p.k === 'color') return { t: 'color', s: st.ownerSeats[o].find((s) => !E.fits(st, s, p.h)) };
  for (let i = 0; i < 600; i++) { const h = Math.floor(Math.random() * N), to = Math.floor(Math.random() * st.k); if (E.canAsk(st, o, to, h)) return { t: 'question', h, to }; }
  for (let h = 0; h < N; h++) if (E.canSearch(st, o, h)) return { t: 'search', h };
  return null;
}
let pumping = false;
async function pump() {
  if (!S || S.kind === 'guest' || pumping || busy) return;
  const st = S.st;
  if (st.phase === 'over' || !st.pending) return;
  const o = st.pending.o, pl = st.players[o];
  if (pl.kind !== 'cpu') return;
  pumping = true; S.thinking = o; renderSeats(); renderAct();
  const t0 = performance.now();
  const view = E.viewFor(st, o);
  const res = await cpuCall({ kind: 'move', view, level: pl.level });
  const minThink = (st.pending.k === 'turn' ? 1100 : 600) * spd();
  const left = minThink - (performance.now() - t0);
  if (left > 0) await sleep(left);
  pumping = false;
  if (!S || S.st !== st) return;
  S.thinking = -1;
  let act = res && res.act;
  let r = act ? E.apply(st, o, act) : { ok: false };
  if (!r.ok) { act = randomLegal(st, o); r = act ? E.apply(st, o, act) : { ok: false }; }
  if (!r.ok) { console.error('CPU could not move', st.pending); return; }
  afterApply(r.ev);
}

function submit(act) {
  if (!S || busy || S.wait) return;
  clearTimeout(ui.ct);
  if (S.kind === 'guest') { S.wait = true; S.link.send({ k: 'act', act }); ui.sel = -1; ui.confirm = false; renderAct(); return; }
  const r = commit(S.me, act);
  if (!r.ok) { toast(errText(r.err)); renderAll(); return; }
  ui.sel = -1; ui.confirm = false; ui.info = -1;
}
function errText(err) {
  return ({ illegal: 'そこでは、それはできません', color: 'キューブの色を選んでください', notyou: 'いまはあなたの番ではありません', over: 'このゲームは終わっています', bad: 'その操作はできません' })[err] || 'その操作はできません';
}

/* ------------------------------------------------------------------ playing back what happened */
function logLine(html) {
  S.log = S.log || [];
  S.log.unshift(html);
  if (S.log.length > 120) S.log.length = 120;
}
async function step(html, ms, log) {
  if (html) banner(html, Math.max(1800, ms * 2.2) * spd());
  if (log !== false && html) logLine(html);
  renderLog();
  if (ms) await scene.wait(ms);
}
async function playEvents(ev) {
  for (const e of ev) {
    switch (e.e) {
      case 'cube': {
        S.lastHex = e.h;
        scene.setLast(e.h);
        const sound = scene.dropPiece('cube', e.s, e.h);
        setTimeout(() => sfx('cube'), 370 * spd());
        const txt = e.why === 'setup' ? `${swho(e.s)}：最初のキューブ` : e.why === 'penalty' ? `${swho(e.s)}：キューブを置いた` : `${swho(e.s)}：キューブ（ここではない）`;
        await sound;
        await step(txt, e.why === 'answer' ? 650 : 420);
        break;
      }
      case 'disc': {
        if (e.why === 'search') { scene.dropPiece('disc', e.s, e.h); setTimeout(() => sfx('disc'), 370 * spd()); await scene.wait(380); break; }
        S.lastHex = e.h;
        const p = scene.dropPiece('disc', e.s, e.h);
        setTimeout(() => sfx('disc'), 370 * spd());
        await p;
        await step(e.why === 'extra' ? `${swho(e.s)}：別のマスにもディスク` : `${swho(e.s)}：ディスク（いるかも）`, 600);
        break;
      }
      case 'ask':
        S.lastHex = e.h; scene.setLast(e.h);
        sfx('pawn');
        await scene.movePawn(e.h);
        await step(`${who(e.o)} → ${who(e.to)}「ここにいる？」`, 650);
        break;
      case 'search':
        S.lastHex = e.h; scene.setLast(e.h);
        sfx('pawn');
        await scene.movePawn(e.h);
        await step(`${who(e.o)}が探索！`, 700);
        break;
      case 'pass': await step(`${swho(e.s)}：もうディスクがあるので、とばす`, 500); break;
      case 'stop': sfx('fail'); await step(`${who(e.o)}の探索は失敗`, 650); break;
      case 'penalty': await step(`${who(e.o)}もキューブを1個置きます`, 350); break;
      case 'noPenalty': await step(`${who(e.o)}はキューブを置けるマスがないので、置かずに終わり`, 700); break;
      case 'extra': await step(`${who(e.o)}：このマスにはもうディスクがあるので、別のマスにもディスクを置きます`, 500); break;
      case 'noExtra': await step(`${swho(e.s)}：ディスクを置ける別のマスがないので、置かずに続ける`, 600); break;
      case 'choose': await step(`${who(e.o)}がキューブの色を選んでいます`, 200); break;
      case 'setupTurn': renderTopFor(e.o, 'setup'); break;
      case 'turn':
        renderTopFor(e.o, 'turn');
        if (e.o === S.me) { sfx('turn'); banner('あなたの番です'); }
        break;
      case 'hint': {
        sfx('hint');
        const t = D.HINT_BY_KEY[e.key] ? D.HINT_BY_KEY[e.key].text : '';
        await step(`追加の手がかり：${esc(t)}`, 900);
        break;
      }
      case 'win':
        sfx('win');
        await scene.reveal(e.h);
        await step(`${who(e.o)}が生息地を見つけた！`, 900);
        break;
      default: break;
    }
  }
}

/* ------------------------------------------------------------------ rendering the field book */
function renderAll() {
  if (!V || !S) return;
  renderTop(); renderAct(); renderMine(); renderHint(); renderSeats(); renderMemo(); renderLog();
}
function renderTopFor(o, k) {
  const mine = o === S.me;
  const verb = { setup: '最初のキューブ', turn: 'の番', penalty: 'キューブを置く', extra: 'ディスクを置く', color: 'キューブの色' }[k] || '';
  $('#turnDots').innerHTML = odots(o);
  $('#turnText').textContent = k === 'turn' ? (mine ? 'あなたの番' : oname(o) + 'の番') : (mine ? 'あなた' : oname(o)) + '：' + verb;
  $('#turnChip').classList.toggle('mine', mine);
}
function renderTop() {
  if (V.phase === 'over') {
    $('#turnDots').innerHTML = odots(V.winner);
    $('#turnText').textContent = V.winner === S.me ? 'あなたの勝ち' : oname(V.winner) + 'の勝ち';
    $('#turnChip').classList.remove('mine');
    return;
  }
  const p = V.pending;
  if (p) renderTopFor(p.o, p.k);
}
function cubesPlaced(o) { let n = 0; for (let h = 0; h < N; h++) if (V.cube[h] >= 0 && owner(V.cube[h]) === o) n++; return n; }
function discsPlaced(o) { let n = 0; for (let h = 0; h < N; h++) V.discs[h].forEach((s) => { if (owner(s) === o) n++; }); return n; }
function lastCubeCause() {
  // who answered with a cube on my turn (for the penalty prompt)
  if (S.kind === 'guest' || !S.st) return '';
  for (let i = S.st.log.length - 1; i >= 0; i--) {
    const e = S.st.log[i];
    if (e.e === 'cube' && e.why === 'answer') return swho(e.s) + 'がキューブを置いたので、';
    if (e.e === 'turn') break;
  }
  return '';
}
function renderAct() {
  const box = $('#act');
  if (!V || !S) return;
  const mode = myInput();
  box.classList.toggle('mine', !!mode);
  let html = '';
  if (V.phase === 'over' && !busy) {
    html = `<p class="prompt"><b>${V.winner === S.me ? 'あなたの勝ち！' : esc(oname(V.winner)) + 'の勝ち'}</b>生息地が見つかりました。</p>
      <div class="row"><button class="btn primary wide" data-a="result">結果を見る</button>${S.kind !== 'guest' ? '<button class="btn wide" data-a="again">もう一度</button>' : ''}</div>`;
  } else if (!mode) {
    html = waitingHtml();
  } else if (mode === 'setup' || mode === 'penalty') {
    const n = cubesPlaced(S.me) + 1;
    html = mode === 'setup'
      ? `<p class="prompt"><b>最初のキューブ（${n}個目 / 2個）</b>あなたの手がかりで「生息地ではない」マスをタップして、キューブを置きます。</p>`
      : `<p class="prompt"><b>キューブを1個置く</b>${lastCubeCause()}あなたもキューブを置きます。あなたの手がかりで「生息地ではない」マスをタップ。</p>`;
    if (ui.sel >= 0) {
      const seats = E.cubeSeats(V, S.me, ui.sel);
      html += selcard(ui.sel);
      if (seats.length > 1) html += `<div class="row">${seats.map((s) => `<button class="btn primary wide" data-a="cube" data-s="${s}">${dot(V.seats[s].color, true)}${COLOR[V.seats[s].color].name}のキューブを置く</button>`).join('')}</div>`;
      else if (seats.length === 1) html += `<div class="row"><button class="btn primary wide" data-a="cube" data-s="${seats[0]}">${dot(V.seats[seats[0]].color, true)}ここに置く</button><button class="btn ghost" data-a="unsel">やめる</button></div>`;
    } else if (settings.legal) html += `<p class="note">明るくなっているマスに置けます。</p>`;
  } else if (mode === 'turn') {
    html = ui.sel >= 0 ? `<p class="prompt"><b>あなたの番</b></p>` : `<p class="prompt"><b>あなたの番</b>マスをタップして、「質問」か「探索」をします。</p>`;
    if (ui.sel >= 0) {
      const h = ui.sel, others = [];
      for (let i = 1; i < V.k; i++) others.push((S.me + i) % V.k);
      html += selcard(h);
      html += `<p class="label">質問：「ここにいる？」と聞く相手</p><div class="askrow">${others.map((o) => `<button class="btn" data-a="ask" data-o="${o}"${E.canAsk(V, S.me, o, h) ? '' : ' disabled'}>${who(o)}</button>`).join('')}</div>`;
      if (others.some((o) => !E.canAsk(V, S.me, o, h))) html += `<p class="note" style="margin:-4px 0 8px">ここにディスクを置いている人には聞けません。</p>`;
      const can = E.canSearch(V, S.me, h);
      html += `<button class="btn tape${ui.confirm ? ' confirm' : ''}" style="width:100%" data-a="search"${can ? '' : ' disabled'}>${ui.confirm ? 'もう一度押すと探索します' : 'ここを探索する'}</button>`;
      if (!can) html += `<p class="note">あなたの手がかりでは、ここは生息地ではないので探索できません。</p>`;
      else if (V.discs[h].some((s) => mySeats().includes(s))) html += `<p class="note">ここにはもうあなたのディスクがあるので、探索すると手がかりに合う別のマスにもディスクを置きます。</p>`;
      else html += `<p class="note">探索に失敗すると、あなたもキューブを1個置きます。</p>`;
    }
  } else if (mode === 'extra') {
    const p = V.pending;
    html = `<p class="prompt"><b>ディスクをもう1枚</b>探索したマスにはもうあなたのディスクがあったので、あなたの手がかりに合う別のマスにディスクを置きます。</p>`;
    if (ui.sel >= 0) {
      const seats = p.seats.filter((s) => E.extraDiscOK(V, s, ui.sel, p.h));
      html += selcard(ui.sel);
      html += `<div class="row">${seats.map((s) => `<button class="btn primary wide" data-a="disc" data-s="${s}">${dot(V.seats[s].color)}${V.twoP ? COLOR[V.seats[s].color].name + 'の' : 'ここに'}ディスクを置く</button>`).join('')}<button class="btn ghost" data-a="unsel">やめる</button></div>`;
    } else if (settings.legal) html += `<p class="note">明るくなっているマスに置けます。</p>`;
  } else if (mode === 'color') {
    const p = V.pending;
    html = `<p class="prompt"><b>キューブの色を選ぶ</b>${who(p.by)}の${p.t === 'q' ? '質問' : '探索'}：このマスは、あなたの2つの手がかりのどちらでも生息地ではありません。置くキューブの色を選んでください。<span class="sub">どちらでも選べたことは、相手には伝わりません。</span></p>
      <div class="row">${mySeats().map((s) => `<button class="btn primary wide" data-a="color" data-s="${s}">${dot(V.seats[s].color, true)}${COLOR[V.seats[s].color].name}のキューブ</button>`).join('')}</div>`;
  }
  box.innerHTML = html;
  updateHighlights();
  // on short screens the action box scrolls with the notebook: bring it back into view when it needs the player
  if (mode && mode !== S.lastMode) { const book = $('#book'); if (book.scrollTop > box.offsetTop + 20) book.scrollTo({ top: 0, behavior: 'smooth' }); }
  S.lastMode = mode;
}
function revealAct() { const book = $('#book'), box = $('#act'); if (book.scrollTop > box.offsetTop + 20) book.scrollTo({ top: 0, behavior: 'smooth' }); }
function waitingHtml() {
  if (S.wait) return `<p class="prompt"><b>送信中…</b><span class="sub">進行役の画面で処理しています。</span></p>`;
  const p = V.pending;
  if (!p) return '';
  const o = p.o;
  const doing = { setup: '最初のキューブを置いています', turn: '質問か探索を選んでいます', penalty: 'キューブを置いています', extra: 'ディスクを置いています', color: 'キューブの色を選んでいます' }[p.k] || '';
  let html;
  if (busy) html = `<p class="prompt"><b>${who(o)}の番</b><span class="sub">進行中…</span></p>`;
  else if (S.thinking === o) html = `<p class="prompt"><b>${who(o)}が考えています <span class="spin"></span></b><span class="sub">${doing}</span></p>`;
  else {
    html = `<p class="prompt"><b>${who(o)}の番</b><span class="sub">${doing}</span></p>`;
    if (S.kind === 'host' && V.players[o].kind === 'remote' && !S.online[o]) html += `<p class="note warn">${esc(oname(o))}の接続が切れています。</p><div class="row"><button class="btn wide" data-a="takeover" data-o="${o}">CPUに交代する</button></div>`;
  }
  if (ui.info >= 0) html += selcard(ui.info, 'マス');
  else html += `<p class="note">マスをタップすると、地形やコマの様子を確かめられます。</p>`;
  return html;
}
function renderMine() {
  const seats = mySeats();
  $('#mine').innerHTML = `<h3>あなたの手がかり${V.twoP ? '（2つ）' : ''}</h3>` + seats.map((s) => {
    const c = V.clues[s];
    return `<div class="cluecard">${V.twoP ? dot(V.seats[s].color) : ''}<div class="body"><p class="clue">${esc(D.clueText(c))}</p><div class="hint">${esc(D.clueNote(c))}</div></div><button class="eye${ui.eyes[s] ? ' on' : ''}" data-eye="${s}" aria-pressed="${!!ui.eyes[s]}" aria-label="範囲を地図に表示">${EYE}</button></div>`;
  }).join('');
}
function renderHint() {
  const box = $('#hintBox');
  if (!V.hintShown || !V.hint) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h3>追加の手がかり</h3><p>${esc(D.HINT_BY_KEY[V.hint].text)}</p>`;
}
function renderSeats() {
  if (!V || !S) return;
  const rows = [];
  for (let i = 0; i < V.k; i++) {
    const o = (S.me + i) % V.k, pl = V.players[o], first = V.seats[V.ownerSeats[o][0]].color;
    const cur = V.phase !== 'over' && V.pending && V.pending.o === o;
    let tag = o === S.me ? (pl.name === 'あなた' ? '' : 'あなた') : pl.kind === 'cpu' ? 'CPU・' + LEVEL_NAME[pl.level] : 'オンライン';
    let st = '';
    if (S.thinking === o) st = '考え中…';
    else if (S.kind === 'host' && pl.kind === 'remote' && !S.online[o]) st = '接続待ち';
    else if (V.phase === 'over' && V.winner === o) st = '勝ち';
    rows.push(`<div class="seat${cur ? ' cur' : ''}"><span class="dots">${odots(o)}</span><span class="nm">${esc(pl.name)}<span class="lv">${tag}</span></span>
      <span class="cnt"><span class="mini" title="ディスク"><i style="--c:${PIECE_HEX[first]}"></i>${discsPlaced(o)}</span><span class="mini" title="キューブ"><i class="sq" style="--c:${PIECE_HEX[first]}"></i>${cubesPlaced(o)}</span></span>${st ? `<span class="st">${st}</span>` : ''}</div>`);
  }
  const order = V.phase === 'setup' || V.turn < V.k ? `<span class="grow"></span><span style="font-weight:500">上から時計回り</span>` : '';
  $('#seatsBox').innerHTML = `<h3>プレイヤー${order}</h3><div class="seats">${rows.join('')}</div>`;
}

/* the deduction memo */
function memoGroups() {
  const pos = [
    { name: '地形2つ', ids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { name: '1マス以内', ids: [10, 11, 12, 13, 14, 15] },
    { name: '2マス以内', ids: [16, 17, 18, 19] },
    { name: '3マス以内', ids: V.advanced ? [20, 21, 22, 23] : [20, 21, 22] }
  ];
  if (!V.advanced) return pos;
  return pos.concat(pos.map((g) => ({ name: g.name + ' ではない', neg: true, ids: g.ids.map((i) => i + D.POS) })));
}
function chipLabel(c) {
  const k = D.CLUES[c];
  const sw = (col) => `<span class="sw" style="background:${col}"></span>`;
  switch (k.kind) {
    case 'on': return sw(TERR_HEX[k.a]) + sw(TERR_HEX[k.b]) + TERR_ONE[k.a] + 'か' + TERR_ONE[k.b];
    case 'nearT': return sw(TERR_HEX[k.t]) + D.TERRAIN[k.t].name;
    case 'nearAnimal': return '動物';
    case 'nearS': return D.STRUCT_NAME[k.s];
    case 'nearA': return D.ANIMAL[k.a].name;
    case 'nearC': return sw(STRUCT_SW[k.c]) + D.COLOR_NAME[k.c];
  }
  return '';
}
function renderMemo() {
  const box = $('#memo');
  const others = [];
  V.seats.forEach((s, i) => { if (s.owner !== S.me) others.push(i); });
  if (others.indexOf(S.memoTab) < 0) S.memoTab = others[0];
  const seat = S.memoTab, marks = (S.memo[seat] = S.memo[seat] || {});
  const hintKey = V.hintShown ? V.hint : null;
  const mine = new Set(mySeats().map((s) => V.clues[s]));
  const autoOn = settings.autoMemo;
  const pubOf = (s) => new Set(E.publicCandidates(V, s, hintKey));
  const groups = memoGroups();
  const all = [].concat(...groups.map((g) => g.ids));
  const left = (s) => { const pub = autoOn ? pubOf(s) : null, mk = S.memo[s] || {}; return all.filter((c) => !mine.has(c) && mk[c] !== 1 && (!pub || pub.has(c))).length; };
  const pub = autoOn ? pubOf(seat) : null;
  let html = `<h3>推理メモ<span class="grow"></span><label class="switch"><input type="checkbox" id="autoMemo"${autoOn ? ' checked' : ''}>自動で消す</label></h3>`;
  html += `<div class="tabs" role="tablist">${others.map((s) => `<button class="tab${s === seat ? ' on' : ''}" role="tab" aria-selected="${s === seat}" data-tab="${s}">${dot(V.seats[s].color)}${esc(oname(owner(s)))}${V.twoP ? '（' + COLOR[V.seats[s].color].name + '）' : ''}<span class="left">残り${left(s)}</span></button>`).join('')}</div>`;
  groups.forEach((g) => {
    html += `<div class="mgroup${g.neg ? ' neg' : ''}">${g.name}</div><div class="chips">`;
    g.ids.forEach((c) => {
      const isMine = mine.has(c);
      let cls = D.CLUES[c].neg ? ' neg' : '';
      if (isMine) cls += ' mine';
      else if (marks[c] === 1) cls += ' x';
      else if (marks[c] === 2) cls += ' o';
      else if (pub && !pub.has(c)) cls += ' auto';
      if (ui.peek === c) cls += ' peek';
      const title = D.clueText(c) + (isMine ? '（あなたの手がかり）' : '');
      html += `<button class="mc${cls}" data-c="${c}" title="${esc(title)}" aria-label="${esc(title)}">${chipLabel(c)}</button>`;
    });
    html += '</div>';
  });
  html += `<p class="note">タップで ✕ → ○ → 消す。長押しでその手がかりの範囲を地図に表示。${autoOn ? '「自動で消す」は、その人のコマと合わない手がかりを点線で消します。' : ''}</p>`;
  box.innerHTML = html;
}
function renderLog() {
  if (!S) return;
  const lines = (S.log || []).slice(0, 40);
  $('#logBox').innerHTML = `<h3>記録</h3>${lines.length ? `<ul class="log">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '<p class="note" style="margin:0">まだ何も起きていません。</p>'}`;
}

function updateHighlights() {
  if (!scene || !V || !S) return;
  const mode = myInput();
  let legal = [];
  if (settings.legal && (mode === 'setup' || mode === 'penalty')) legal = E.legalCubes(V, S.me).map((c) => c.h);
  else if (settings.legal && mode === 'extra') { const p = V.pending; for (let h = 0; h < N; h++) if (p.seats.some((s) => E.extraDiscOK(V, s, h, p.h))) legal.push(h); }
  scene.setLegal(legal);
  scene.setSelected(ui.sel >= 0 ? ui.sel : ui.info);
  const map = new Map();
  if (ui.peek != null) regionOf(ui.peek).forEach((h) => map.set(h, 0x2f6cc4));
  else Object.keys(ui.eyes).forEach((s) => { if (ui.eyes[s]) regionOf(V.clues[s]).forEach((h) => map.set(h, 0xff3d8b)); });
  scene.setRegionMap(map);
  scene.setLast(S.lastHex != null ? S.lastHex : -1);
}

/* ------------------------------------------------------------------ input */
function onHexTap(h) {
  if (!V || !S || $('#app').hidden) return;
  if (h < 0) { ui.sel = -1; ui.info = -1; ui.confirm = false; renderAct(); return; }
  const mode = myInput();
  if (mode === 'setup' || mode === 'penalty') {
    if (V.cube[h] >= 0) { toast('キューブがあるマスには置けません'); return; }
    if (!E.cubeSeats(V, S.me, h).length) {
      toast(mySeats().some((s) => V.discs[h].includes(s)) ? 'ここにはもうあなたのコマがあります' : 'あなたの手がかりでは、ここは生息地になりえるので、キューブは置けません');
      return;
    }
    ui.sel = h;
  } else if (mode === 'turn') {
    if (V.cube[h] >= 0) { toast('キューブがあるマスは、質問も探索もできません'); return; }
    ui.sel = h; ui.confirm = false;
    scene.movePawn(h);
  } else if (mode === 'extra') {
    const p = V.pending;
    if (!p.seats.some((s) => E.extraDiscOK(V, s, h, p.h))) {
      toast(h === p.h ? '探索したマスとは別のマスを選んでください' : 'そこにはディスクを置けません（あなたの手がかりで×・キューブがある・もうディスクがある）');
      return;
    }
    ui.sel = h;
  } else {
    ui.info = ui.info === h ? -1 : h;
  }
  sfx('click');
  renderAct();
  if (mode) revealAct();
}
function initInput() {
  $('#act').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    sfx('click');
    if (a === 'cube') submit({ t: 'cube', h: ui.sel, s: +b.dataset.s });
    else if (a === 'disc') submit({ t: 'disc', h: ui.sel, s: +b.dataset.s });
    else if (a === 'ask') submit({ t: 'question', h: ui.sel, to: +b.dataset.o });
    else if (a === 'search') {
      if (!ui.confirm) {
        ui.confirm = true; renderAct();
        clearTimeout(ui.ct); ui.ct = setTimeout(() => { if (ui.confirm) { ui.confirm = false; renderAct(); } }, 4000);
      } else submit({ t: 'search', h: ui.sel });
    } else if (a === 'color') submit({ t: 'color', s: +b.dataset.s });
    else if (a === 'unsel') { ui.sel = -1; ui.confirm = false; renderAct(); }
    else if (a === 'result') showEnd();
    else if (a === 'again') playAgain();
    else if (a === 'takeover') takeover(+b.dataset.o);
  });
  $('#mine').addEventListener('click', (e) => {
    const b = e.target.closest('[data-eye]');
    if (!b) return;
    const s = b.dataset.eye;
    ui.eyes[s] = !ui.eyes[s];
    renderMine(); updateHighlights();
  });
  // memo: tap to cycle a mark, long-press to see the clue's area on the map
  const memo = $('#memo');
  let press = null;
  memo.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.mc');
    if (!b) return;
    const c = +b.dataset.c;
    press = { c, fired: false, timer: setTimeout(() => { press.fired = true; ui.peek = c; b.classList.add('peek'); updateHighlights(); if (navigator.vibrate) navigator.vibrate(12); }, 380) };
  });
  const endPress = () => {
    if (!press) return;
    clearTimeout(press.timer);
    if (press.fired) { ui.peek = null; updateHighlights(); $$('.mc.peek', memo).forEach((x) => x.classList.remove('peek')); }
    setTimeout(() => { press = null; }, 0);
  };
  memo.addEventListener('pointerup', endPress);
  memo.addEventListener('pointercancel', endPress);
  memo.addEventListener('pointerleave', endPress);
  memo.addEventListener('contextmenu', (e) => { if (e.target.closest('.mc')) e.preventDefault(); });
  memo.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { S.memoTab = +t.dataset.tab; sfx('click'); renderMemo(); return; }
    const b = e.target.closest('.mc');
    if (!b || b.classList.contains('mine')) return;
    if (press && press.fired) return;
    const c = +b.dataset.c, mk = (S.memo[S.memoTab] = S.memo[S.memoTab] || {});
    mk[c] = ((mk[c] || 0) + 1) % 3;
    if (!mk[c]) delete mk[c];
    sfx('click');
    renderMemo();
    if (S.kind === 'solo') saveGame();
  });
  memo.addEventListener('change', (e) => {
    if (e.target.id === 'autoMemo') { settings.autoMemo = e.target.checked; saveSettings(); renderMemo(); }
  });
  $('#btnView').addEventListener('click', () => { settings.top = !scene.isTop(); saveSettings(); scene.setTopView(settings.top); sfx('click'); });
  $('#btnFit').addEventListener('click', () => { scene.resetView(); sfx('click'); });
  $('#btnSound').addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); syncSoundBtn(); if (settings.sound) sfx('click'); });
  $('#btnMenu').addEventListener('click', () => { sfx('click'); openMenu(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const bgs = $$('#layer .sheet-bg'); if (bgs.length) bgs[bgs.length - 1].remove(); else if (ui.sel >= 0) { ui.sel = -1; ui.confirm = false; renderAct(); } }
  });
}
function syncSoundBtn() { $('#btnSound').classList.toggle('off', !settings.sound); $('#btnSound').setAttribute('aria-pressed', String(settings.sound)); }

/* ------------------------------------------------------------------ menus and overlays */
function openMenu() {
  const canHint = V && S && V.phase === 'play' && V.hasHint && !V.hintShown;
  const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, t]) => `<button data-a="seg" data-k="${name}" data-v="${v}" class="${cur === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const sw = (name, on) => `<label class="switch"><input type="checkbox" data-sw="${name}"${on ? ' checked' : ''}></label>`;
  const sh = sheet(`<h2>メニュー</h2>
    <div class="opt"><span>進む速さ</span>${seg('speed', [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'はやい']], settings.speed)}</div>
    <div class="opt"><span>置けるマスを明るくする</span>${sw('legal', settings.legal)}</div>
    <div class="opt"><span>推理メモを自動で消す</span>${sw('autoMemo', settings.autoMemo)}</div>
    <div class="opt"><span>音</span>${sw('sound', settings.sound)}</div>
    <div class="menu-actions">
      <button class="btn" data-a="rules">あそびかた</button>
      ${canHint ? '<button class="btn" data-a="hint">追加の手がかりを提案する</button>' : ''}
      <button class="btn ghost" data-a="quit">${S && S.kind !== 'solo' ? '部屋を出てタイトルへ' : 'タイトルへもどる'}</button>
    </div>`, {
    onAction(a, b, close) {
      if (a === 'seg') { settings[b.dataset.k] = b.dataset.v; saveSettings(); $$('[data-seg] button', sh.el).forEach((x) => x.classList.toggle('on', x.dataset.k === b.dataset.k ? x.dataset.v === b.dataset.v : x.classList.contains('on'))); scene.setSpeed(1 / spd()); }
      else if (a === 'rules') { close(); openRules(); }
      else if (a === 'hint') { close(); requestHint(); }
      else if (a === 'quit') { close(); confirmQuit(); }
    }
  });
  sh.el.addEventListener('change', (e) => {
    const k = e.target.dataset.sw;
    if (!k) return;
    settings[k] = e.target.checked; saveSettings();
    if (k === 'sound') syncSoundBtn();
    if (k === 'autoMemo' && V) renderMemo();
    if (k === 'legal' && V) updateHighlights();
  });
}
function openRules() {
  const sh = sheet($('#tplRules').innerHTML);
  // the "within one space" picture: a desert space and its six neighbours
  const g = $('#diagHex', sh.el), R = 15, cx0 = 150, cy0 = 46;
  if (g) {
    let svg = '';
    const centres = [[0, 0], [1.5, -0.866], [1.5, 0.866], [0, -1.732], [0, 1.732], [-1.5, -0.866], [-1.5, 0.866], [3, 0], [-3, 0], [3, -1.732], [-3, 1.732]];
    centres.forEach(([x, y], i) => {
      const px = cx0 + x * R, py = cy0 + y * R;
      const pts = [0, 1, 2, 3, 4, 5].map((k) => `${(px + R * Math.cos(Math.PI / 3 * k)).toFixed(1)},${(py + R * Math.sin(Math.PI / 3 * k)).toFixed(1)}`).join(' ');
      const fill = i === 0 ? TERR_HEX[1] : i < 7 ? '#ffd3e4' : '#d9dfd0';
      svg += `<polygon points="${pts}" fill="${fill}" stroke="#55635a" stroke-width="1.2"/>`;
    });
    svg += `<text x="${cx0}" y="${cy0 + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#1e2a24">砂漠</text>`;
    g.innerHTML = svg;
  }
}
function confirmQuit() {
  sheet(`<h2>${S && S.kind === 'solo' ? 'タイトルへもどりますか？' : '部屋を出ますか？'}</h2><p>${S && S.kind === 'solo' ? 'このゲームは保存されているので、タイトルの「続きから」で再開できます。' : 'オンラインの対戦からぬけます。'}</p>
    <div class="menu-actions"><button class="btn primary" data-a="yes">${S && S.kind === 'solo' ? 'タイトルへ' : '部屋を出る'}</button><button class="btn ghost" data-a="close">やめる</button></div>`, {
    onAction(a, b, close) { if (a === 'yes') { close(); toTitle(); } }
  });
}
function showEnd() {
  if (!V || V.phase !== 'over') return;
  closeSheets();
  const items = V.seats.map((st, s) => `<li>${dot(st.color)}<div class="body"><div class="nm">${esc(oname(st.owner))}${V.twoP ? '（' + COLOR[st.color].name + '）' : ''}${st.owner === V.winner ? '・発見！' : ''}</div><p class="clue">${esc(D.clueText(V.clues[s]))}</p></div><button class="eye" data-a="peek" data-c="${V.clues[s]}" aria-label="範囲を地図に表示">${EYE}</button></li>`).join('');
  const sh = sheet(`<h2>${V.winner === S.me ? 'あなたの勝ち！' : esc(oname(V.winner)) + 'が生息地を見つけた'}</h2>
    <p>生息地は「${esc(hexInfo(V.target))}」のマスでした。みんなの手がかりはこちら（目のボタンで範囲を表示）。</p>
    <ul class="result-list">${items}</ul>
    ${V.hint ? `<p class="note">この盤の追加の手がかり：${esc(D.HINT_BY_KEY[V.hint].text)}</p>` : ''}
    <div class="menu-actions">
      ${S.kind !== 'guest' ? '<button class="btn primary" data-a="again">もう一度</button>' : '<p class="note">進行役が「もう一度」を押すと、同じメンバーで次のゲームが始まります。</p>'}
      <button class="btn" data-a="close">地図を見る</button>
      <button class="btn ghost" data-a="title">タイトルへ</button>
    </div>`, {
    onAction(a, b, close) {
      if (a === 'again') { close(); playAgain(); }
      else if (a === 'title') { close(); toTitle(); }
      else if (a === 'peek') {
        const c = +b.dataset.c, on = !b.classList.contains('on');
        $$('.eye', sh.el).forEach((x) => x.classList.remove('on'));
        ui.peek = on ? c : null; if (on) b.classList.add('on');
        updateHighlights();
      }
    },
    onClose() { ui.peek = null; updateHighlights(); }
  });
}

/* hints: everyone (or all but one with four or five players) must agree */
async function requestHint() {
  if (!S || !V || V.phase !== 'play' || V.hintShown || !V.hasHint) return;
  if (S.kind === 'guest') { S.link.send({ k: 'hintReq' }); toast('追加の手がかりを提案しました'); return; }
  runHintVote(S.me);
}
async function runHintVote(from) {
  if (S.voting) return;
  const st = S.st, k = st.k, need = k <= 3 ? k : k - 1;
  S.voting = true;
  banner(`${who(from)}が「追加の手がかり」を提案`);
  const votes = await Promise.all(st.players.map((pl, o) => {
    if (o === from) return Promise.resolve(true);
    if (pl.kind === 'cpu') return cpuCall({ kind: 'vote', view: E.viewFor(st, o), level: pl.level }).then((r) => !!(r && r.vote));
    if (o === S.me) return askVoteLocal(from);
    return askVoteRemote(o, from);
  }));
  S.voting = false;
  if (!S || S.st !== st) return;
  const yes = votes.filter(Boolean).length;
  const names = st.players.map((pl, o) => (votes[o] ? '○' : '×') + pl.name).join('　');
  if (yes >= need && !st.hintShown && st.phase === 'play') {
    const ev = E.revealHint(st);
    if (ev.length) { toast(`賛成 ${yes}/${k}：${names}`, 4000); afterApply(ev); }
  } else {
    toast(`賛成 ${yes}/${k}（${need}人必要）：${names}`, 4500);
    if (S.kind === 'host') S.cids.forEach((cid) => { if (cid) L.link.send(cid, { k: 'hintNo', text: `賛成 ${yes}/${k}（${need}人必要）` }); });
  }
}
function askVoteLocal(from) {
  return new Promise((res) => {
    let done = false;
    const sh = sheet(`<h2>追加の手がかり</h2><p>${who(from)}が「追加の手がかり」を提案しています。全員${V.k >= 4 ? '（1人を除く）' : ''}が賛成すると、だれも持っていない種類の手がかりが1つ公開されます。</p>
      <div class="menu-actions"><button class="btn primary" data-a="y">賛成</button><button class="btn" data-a="n">反対</button></div>`, {
      modal: true, noClose: true,
      onAction(a, b, close) { done = true; close(); res(a === 'y'); }
    });
    setTimeout(() => { if (!done) { sh.close(); res(false); } }, 30000);
  });
}
const voteWait = new Map();
function askVoteRemote(o, from) {
  const cid = S.cids[o];
  if (!cid || !S.online[o]) return Promise.resolve(false);
  return new Promise((res) => {
    voteWait.set(cid, res);
    L.link.send(cid, { k: 'hintAsk', from });
    setTimeout(() => { if (voteWait.get(cid) === res) { voteWait.delete(cid); res(false); } }, 32000);
  });
}

/* ------------------------------------------------------------------ starting, saving and leaving games */
function colorsFor(n, first) {
  const keys = D.PLAYER_COLORS.map((c) => c.key), out = [first];
  keys.forEach((k) => { if (out.indexOf(k) < 0) out.push(k); });
  return out;
}
function startSolo(cfg) {
  const n = cfg.n, twoP = n === 2, cols = colorsFor(n, cfg.color);
  const players = [];
  for (let i = 0; i < n; i++) {
    const colors = twoP ? [cols[i * 2], cols[i * 2 + 1]] : [cols[i]];
    if (i === 0) players.push({ name: 'あなた', kind: 'human', colors });
    else players.push({ name: twoP ? 'CPU' : COLOR[colors[0]].name, kind: 'cpu', level: cfg.level, colors });
  }
  const st = E.newGame({ advanced: cfg.mode === 'advanced', players, first: cfg.first === 'me' ? 0 : -1, seed: (Math.random() * 4294967296) >>> 0 });
  S = { kind: 'solo', st, me: 0, cfg, memo: {}, memoTab: null, log: [], lastHex: -1, thinking: -1 };
  V = E.viewFor(st, 0);
  saveGame();
  beginGame();
}
function saveGame() {
  if (!S || S.kind !== 'solo') return;
  store.set('cryptid.save', { v: 1, st: S.st, me: S.me, memo: S.memo, memoTab: S.memoTab, log: (S.log || []).slice(0, 60), cfg: S.cfg, lastHex: S.lastHex });
}
function resumeSolo() {
  const sv = store.get('cryptid.save');
  if (!sv || !sv.st || sv.st.phase === 'over') return false;
  S = { kind: 'solo', st: sv.st, me: sv.me || 0, cfg: sv.cfg, memo: sv.memo || {}, memoTab: sv.memoTab, log: sv.log || [], lastHex: sv.lastHex, thinking: -1 };
  V = E.viewFor(S.st, S.me);
  beginGame();
  return true;
}
function beginGame() {
  closeSheets();
  ui.sel = -1; ui.info = -1; ui.confirm = false; ui.peek = null; ui.eyes = {};
  busy = 0; chain = Promise.resolve(); pumping = false;
  boardInfo = E.buildBoard(V.spec);
  showScreen(null);
  $('#app').hidden = false;
  scene.setHost($('#stage'));
  scene.setBoard(V.spec, boardInfo);
  scene.setSeatColors(V.seats.map((s) => s.color));
  scene.setPieces(V.cube, V.discs);
  scene.clearReveal(); scene.setMarks(null);
  scene.movePawn(-1);
  scene.setTopView(settings.top);
  scene.setSpeed(1 / spd());
  scene.resize();
  if (V.phase === 'over' && V.target >= 0) scene.reveal(V.target);
  renderAll();
  if (V.phase === 'over') { S.endShown = true; showEnd(); return; }
  if (myInput()) { banner(V.phase === 'setup' ? 'まず、生息地ではないマスにキューブを2個置きます' : 'あなたの番です'); }
  afterSettle();
}
function playAgain() {
  if (!S) return;
  if (S.kind === 'solo') startSolo(S.cfg);
  else if (S.kind === 'host') startOnlineGame();
}
function toTitle() {
  closeSheets();
  if (S && S.kind !== 'solo') leaveRoom();
  S = null; V = null; busy = 0; pumping = false;
  $('#app').hidden = true;
  $('#banner').classList.remove('on');
  showTitle();
}
function takeover(o) {
  if (!S || S.kind !== 'host') return;
  S.st.players[o].kind = 'cpu';
  S.st.players[o].level = L ? L.level : 2;
  S.st.players[o].name += '（CPU）';
  V = E.viewFor(S.st, S.me);
  broadcastState([]);
  renderAll();
  pump();
}

/* ------------------------------------------------------------------ screens */
function showTitle() {
  $('#goResume').hidden = !(store.get('cryptid.save') && store.get('cryptid.save').st && store.get('cryptid.save').st.phase !== 'over');
  showScreen('scrTitle');
  if (scene) {
    const st = E.newGame({ advanced: Math.random() < 0.5, players: [{ name: 'a', kind: 'cpu', colors: ['yellow'] }, { name: 'b', kind: 'cpu', colors: ['red'] }, { name: 'c', kind: 'cpu', colors: ['green'] }], seed: (Math.random() * 1e9) >>> 0 });
    scene.setBoard(st.spec, E.buildBoard(st.spec));
    scene.setSeatColors(st.seats.map((s) => s.color));
    scene.setPieces(st.cube, st.discs); scene.movePawn(-1); scene.clearReveal(); scene.setLegal([]); scene.setRegion(null); scene.setSelected(-1); scene.setLast(-1);
    scene.setOrbit(true);
  }
}
function segInit(id, value, onPick) {
  const box = $(id);
  $$('button', box).forEach((b) => {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => { $$('button', box).forEach((x) => x.classList.toggle('on', x === b)); sfx('click'); onPick(b.dataset.v); };
  });
}
function openSolo() {
  const c = settings.solo;
  const box = $('#segColor');
  box.innerHTML = D.PLAYER_COLORS.map((pc) => `<button data-v="${pc.key}" aria-label="${pc.name}">${dot(pc.key)}</button>`).join('');
  const notes = () => {
    $('#countNote').textContent = c.n === 2 ? '2人のときは公式の2人用ルール：ひとり2色・手がかり2つずつ。あなたの2色目は自動で決まります。' : '';
    $('#modeNote').textContent = c.mode === 'advanced' ? '上級：黒い建造物が加わり、「〜ではない」手がかりも配られます。' : '通常：はじめての人におすすめ。';
  };
  segInit('#segCount', c.n, (v) => { c.n = +v; notes(); saveSettings(); });
  segInit('#segMode', c.mode, (v) => { c.mode = v; notes(); saveSettings(); });
  segInit('#segLevel', c.level, (v) => { c.level = +v; saveSettings(); });
  segInit('#segColor', c.color, (v) => { c.color = v; saveSettings(); });
  segInit('#segFirst', c.first, (v) => { c.first = v; saveSettings(); });
  notes();
  showScreen('scrSolo');
}
function initScreens() {
  $('#goSolo').onclick = () => { sfx('click'); openSolo(); };
  $('#goResume').onclick = () => { sfx('click'); if (!resumeSolo()) { toast('続きのデータがありません'); showTitle(); } };
  $('#goOnline').onclick = () => { sfx('click'); openOnline(); };
  $('#goRules').onclick = () => { sfx('click'); openRules(); };
  $('#soloStart').onclick = () => { sfx('click'); startSolo(Object.assign({}, settings.solo)); };
  $$('[data-back]').forEach((b) => { b.onclick = () => { sfx('click'); showTitle(); }; });
  document.addEventListener('pointerdown', () => SFX.unlock(), { once: true, capture: true });
}

/* ------------------------------------------------------------------ online play */
const netKind = new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer';
let L = null; // the room: { role, link, code, players: [{ name, kind: 'host'|'guest'|'cpu', cid, level, online }], mode, level, me }
function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('cryptid.cid'); } catch (e) { c = null; }
  if (!c) { c = NET.makeCid(); try { sessionStorage.setItem('cryptid.cid', c); } catch (e) { /* ignore */ } }
  return c;
}
function netErr(e) {
  const c = e && e.code;
  return c === 'notfound' ? 'その部屋が見つかりません。コードを確かめてください。' : c === 'lib' ? '通信の準備ができませんでした。電波のよいところで、もう一度。' : c === 'taken' ? 'もう一度「部屋をつくる」を押してください。' : '接続できませんでした。もう一度お試しください。';
}
function openOnline(code) {
  $('#onName').value = settings.name || '';
  if (code) $('#onCode').value = code;
  $('#onErr').hidden = true;
  showScreen('scrOnline');
}
function onlineError(msg) { const e = $('#onErr'); e.textContent = msg; e.hidden = false; }
function takeName() {
  const n = NET.cleanName($('#onName').value);
  if (!n) { onlineError('名前を入れてください'); $('#onName').focus(); return null; }
  settings.name = n; saveSettings();
  return n;
}
async function createRoom() {
  const name = takeName();
  if (!name) return;
  $('#onCreate').disabled = true;
  try {
    for (let i = 0; i < 4; i++) {
      const code = NET.makeCode(), link = NET.makeHost(netKind);
      try {
        await link.host(code);
        L = { role: 'host', link, code, players: [{ name, kind: 'host', online: true }], mode: settings.lobby.mode, level: settings.lobby.level };
        link.on('msg', onHostMsg); link.on('leave', onHostLeave);
        break;
      } catch (e) { if (e.code !== 'taken') { onlineError(netErr(e)); return; } }
    }
    if (L) showLobby(); else onlineError('部屋をつくれませんでした。もう一度お試しください。');
  } finally { $('#onCreate').disabled = false; }
}
async function joinRoom() {
  const name = takeName();
  if (!name) return;
  const code = NET.cleanCode($('#onCode').value);
  if (code.length !== 4) { onlineError('4文字のコードを入れてください'); return; }
  $('#onJoin').disabled = true;
  const link = NET.makeGuest(netKind);
  try { await link.join(code); } catch (e) { onlineError(netErr(e)); $('#onJoin').disabled = false; return; }
  $('#onJoin').disabled = false;
  L = { role: 'guest', link, code, players: [], me: -1, mode: 'normal', level: 2 };
  link.on('msg', onGuestMsg);
  link.on('close', () => { if (L && L.link === link) lostHost(); });
  link.send({ k: 'hello', cid: myCid(), name, v: NET.PROTOCOL });
  showLobby();
}
function showLobby() { renderLobby(); showScreen('scrLobby'); }
function seatColorsFor(i, n) { const keys = D.PLAYER_COLORS.map((c) => c.key); return n === 2 ? [keys[i * 2], keys[i * 2 + 1]] : [keys[i]]; }
function renderLobby() {
  if (!L) return;
  const host = L.role === 'host', n = L.players.length;
  $('#lobCode').textContent = L.code;
  $('#lobHost').hidden = !host;
  $('#lobNote').textContent = host ? 'このコードを友だちに伝えるか、招待リンクを送ってください。そろったら「はじめる」。' : (L.players.length ? '進行役がはじめるのを待っています。' : '部屋に入っています…');
  $('#lobSeats').innerHTML = L.players.map((p, i) => {
    const cols = n >= 2 ? seatColorsFor(i, n) : seatColorsFor(i, 3);
    const tag = p.kind === 'host' ? '進行役' : p.kind === 'cpu' ? 'CPU・' + LEVEL_NAME[p.level || L.level] : (p.online === false ? '接続待ち' : 'オンライン');
    const you = (host && i === 0) || (!host && i === L.me);
    return `<div class="lseat"><span class="dots">${cols.map((c) => dot(c)).join('')}</span><span class="grow">${esc(p.name)}${you ? '（あなた）' : ''}</span><span class="tagx">${tag}</span>${host && p.kind === 'cpu' ? `<button class="btn small ghost" data-rm="${i}">外す</button>` : ''}</div>`;
  }).join('') + (n === 2 ? '<p class="note">2人のときは公式の2人用ルール（ひとり2色）で遊びます。</p>' : '');
  if (host) {
    segInit('#lobMode', L.mode, (v) => { L.mode = v; settings.lobby.mode = v; saveSettings(); sendLobby(); });
    segInit('#lobLevel', L.level, (v) => { L.level = +v; settings.lobby.level = +v; L.players.forEach((p) => { if (p.kind === 'cpu') p.level = +v; }); saveSettings(); sendLobby(); renderLobby(); });
    $('#lobStart').disabled = n < 2;
    $('#lobStart').textContent = n < 2 ? 'あと1人以上（CPUでも可）' : `${n}人ではじめる`;
    $('#lobAddCpu').disabled = n >= 5;
  }
}
function sendLobby() {
  if (!L || L.role !== 'host') return;
  const pub = L.players.map((p) => ({ name: p.name, kind: p.kind, level: p.level || L.level, online: p.online !== false }));
  L.players.forEach((p, i) => { if (p.cid) L.link.send(p.cid, { k: 'lobby', code: L.code, players: pub, you: i, mode: L.mode, level: L.level }); });
}
function onHostMsg(cid, m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'hello') {
    const name = NET.cleanName(m.name) || 'ゲスト';
    if (m.v !== NET.PROTOCOL) { L.link.send(cid, { k: 'bye', why: 'version' }); L.link.drop(cid); return; }
    if (S && S.kind === 'host') {
      const o = S.cids.indexOf(cid);
      if (o >= 0) { S.online[o] = true; if (L.players[o]) L.players[o].online = true; sendFull(o); toast(oname(o) + 'がもどりました'); renderAll(); }
      else { L.link.send(cid, { k: 'bye', why: 'started' }); L.link.drop(cid); }
      return;
    }
    let p = L.players.find((x) => x.cid === cid);
    if (!p) {
      if (L.players.length >= 5) { L.link.send(cid, { k: 'bye', why: 'full' }); L.link.drop(cid); return; }
      p = { name, kind: 'guest', cid, online: true };
      L.players.push(p);
      sfx('click');
    } else { p.name = name; p.online = true; }
    sendLobby(); renderLobby();
    return;
  }
  if (!S || S.kind !== 'host') return;
  const o = S.cids.indexOf(cid);
  if (o < 0) return;
  if (m.k === 'act') {
    const r = E.apply(S.st, o, m.act);
    if (!r.ok) { L.link.send(cid, { k: 'err', err: r.err, view: E.viewFor(S.st, o) }); return; }
    afterApply(r.ev);
  } else if (m.k === 'hintReq') { runHintVote(o); }
  else if (m.k === 'vote') { const w = voteWait.get(cid); if (w) { voteWait.delete(cid); w(!!m.yes); } }
}
function onHostLeave(cid) {
  if (S && S.kind === 'host') {
    const o = S.cids.indexOf(cid);
    if (o >= 0) { S.online[o] = false; if (L && L.players[o]) L.players[o].online = false; toast(oname(o) + 'の接続が切れました'); renderAll(); }
    return;
  }
  if (!L) return;
  L.players = L.players.filter((p) => p.cid !== cid);
  sendLobby(); renderLobby();
}
function startOnlineGame() {
  if (!L || L.role !== 'host' || L.players.length < 2) return;
  const n = L.players.length;
  const players = L.players.map((p, i) => ({
    name: p.name, kind: p.kind === 'host' ? 'human' : p.kind === 'guest' ? 'remote' : 'cpu',
    level: p.kind === 'cpu' ? (p.level || L.level) : 0, colors: seatColorsFor(i, n)
  }));
  const st = E.newGame({ advanced: L.mode === 'advanced', players, seed: (Math.random() * 4294967296) >>> 0 });
  S = { kind: 'host', st, me: 0, cids: L.players.map((p) => p.cid || null), online: L.players.map((p) => p.kind !== 'guest' || p.online !== false),
    memo: {}, memoTab: null, log: [], lastHex: -1, thinking: -1 };
  V = E.viewFor(st, 0);
  S.cids.forEach((cid, o) => { if (cid) sendFull(o); });
  beginGame();
}
function sendFull(o) { const cid = S.cids[o]; if (cid) L.link.send(cid, { k: 'state', full: true, view: E.viewFor(S.st, o) }); }
function broadcastState(ev) {
  S.cids.forEach((cid, o) => { if (cid && S.online[o]) L.link.send(cid, { k: 'state', view: E.viewFor(S.st, o), ev }); });
}
function onGuestMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'lobby') { L.players = m.players; L.me = m.you; L.mode = m.mode; L.level = m.level; if (!S) renderLobby(); return; }
  if (m.k === 'state') {
    if (!S || m.full || S.kind !== 'guest' || m.view.me !== S.me) {
      const keep = S && S.kind === 'guest' && S.me === m.view.me && m.view.spec && V && JSON.stringify(V.spec) === JSON.stringify(m.view.spec);
      S = { kind: 'guest', me: m.view.me, link: L.link, memo: keep ? S.memo : {}, memoTab: keep ? S.memoTab : null, log: keep ? S.log : [], lastHex: -1, thinking: -1, wait: false };
      V = m.view;
      beginGame();
      return;
    }
    S.wait = false;
    enqueue(m.ev || [], m.view);
    return;
  }
  if (m.k === 'err') { if (S) { S.wait = false; if (m.view && !busy) V = m.view; } toast(errText(m.err)); renderAll(); return; }
  if (m.k === 'hintAsk') { if (S && V) askVoteLocal(m.from).then((yes) => L && L.link.send({ k: 'vote', yes })); return; }
  if (m.k === 'hintNo') { toast('追加の手がかりは見送り：' + m.text, 4000); return; }
  if (m.k === 'bye') {
    const why = { full: '部屋がいっぱいでした（5人まで）。', started: 'その部屋はもう始まっています。', version: 'アプリの版がちがいます。ページを読みこみ直してください。' }[m.why] || '部屋から出ました。';
    leaveRoom(); S = null; V = null; $('#app').hidden = true; openOnline(); onlineError(why);
  }
}
function lostHost() {
  const inGame = !!S;
  leaveRoom();
  if (inGame) {
    sheet(`<h2>接続が切れました</h2><p>進行役との接続が切れました。進行役の画面が閉じたか、電波が弱くなったのかもしれません。</p><div class="menu-actions"><button class="btn primary" data-a="t">タイトルへ</button></div>`, { modal: true, noClose: true, onAction(a, b, close) { close(); S = null; V = null; $('#app').hidden = true; showTitle(); } });
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
    if (!L || L.players.length >= 5) return;
    sfx('click');
    const used = new Set(L.players.filter((p) => p.kind === 'cpu').map((p) => p.name));
    let i = 1; while (used.has('CPU' + i)) i++;
    L.players.push({ name: 'CPU' + i, kind: 'cpu', level: L.level });
    sendLobby(); renderLobby();
  };
  $('#lobSeats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b || !L || L.role !== 'host') return;
    L.players.splice(+b.dataset.rm, 1);
    sendLobby(); renderLobby();
  });
  $('#lobStart').onclick = () => { sfx('click'); startOnlineGame(); };
  $('#lobInvite').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + (L ? L.code : '');
    const done = () => toast('招待リンクをコピーしました');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(url, 6000));
    else toast(url, 6000);
  };
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  initScreens(); initInput(); initOnline(); syncSoundBtn();
  const params = new URLSearchParams(location.search);
  try {
    await loadThree();
    scene = createScene($('#titleBg'), { keepFrame: params.has('shot') });
    scene.onTap(onHexTap);
  } catch (e) {
    $('#loaderMsg').textContent = '3D表示を読みこめませんでした。通信のよいところでページを読みこみ直してください。';
    console.error(e);
    return;
  }
  $('#loader').classList.add('done');
  setTimeout(() => $('#loader').remove(), 400);
  const room = NET.cleanCode(params.get('room') || '');
  if (room.length === 4) { showTitle(); openOnline(room); }
  else showTitle();
  window.__cry = { get S() { return S; }, get V() { return V; }, get busy() { return busy; }, submit, startSolo, onHexTap, settings, scene: () => scene, E, AI, requestHint, showEnd, resumeSolo };
  window.__ready = true;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && scene) scene.kick(); });
boot();

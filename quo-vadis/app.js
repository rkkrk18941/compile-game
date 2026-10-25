/* クォ・ヴァディス — the page: title and setup screens, the tablet beside the board, the turn flow, CPU turns,
   the negotiations (asking for consent, answering, naming a price), animations, saving, and online play (the host's
   browser runs the game; guests send their moves and answers and get back only what they may see). */
import { loadThree, createScene } from './scene.js?v=20261025a';

const H = window.QV_HELP, term = H.term;
const D = window.QV_DATA, E = window.QV_ENG, AI = window.QV_AI, NET = window.QV_NET;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLOR = {}; D.PLAYER_COLORS.forEach((c) => { COLOR[c.key] = c; });
const LEVEL_NAME = AI.LEVEL_NAME;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const CPU_NAMES = ['キケロ', 'カトー', 'ブルトゥス', 'クラッスス', 'ポンペイウス', 'カッシウス'];
const ASK_TIMEOUT = 60000;

/* ------------------------------------------------------------------ storage and settings */
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const settings = Object.assign({ sound: true, speed: 'normal', name: '',
  solo: { n: 4, level: 2, color: 'red', first: 'random', open: '0', variant: 'none' },
  lobby: { level: 2, open: '0', variant: 'none' } }, store.get('quovadis.settings') || {});
function saveSettings() { store.set('quovadis.settings', settings); }
const SPEED = { slow: 1.5, normal: 1, fast: 0.55 };
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
  function knock(freq, dur, gain, q, delay) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf(c); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, gain, type, delay, slide) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    click() { knock(2400, 0.04, 0.12, 4); },
    place() { knock(820, 0.09, 0.5, 6); knock(1300, 0.05, 0.2, 8, 0.03); },
    move() { knock(700, 0.07, 0.35, 6); knock(980, 0.07, 0.35, 6, 0.16); },
    laurel() { tone(988, 0.25, 0.12, 'triangle'); tone(1319, 0.32, 0.1, 'triangle', 0.08); tone(1976, 0.35, 0.05, 'sine', 0.15); },
    consent() { knock(380, 0.12, 0.45, 3); tone(523, 0.2, 0.06, 'sine', 0.02); },
    refuse() { tone(150, 0.32, 0.18, 'sine', 0, 95); knock(220, 0.12, 0.25, 2); },
    coin() { tone(1568, 0.12, 0.08, 'square'); tone(2093, 0.18, 0.06, 'square', 0.06); },
    caesar() { tone(220, 0.35, 0.09, 'sawtooth'); tone(330, 0.45, 0.08, 'sawtooth', 0.12); tone(440, 0.5, 0.06, 'sawtooth', 0.24); },
    senate() { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.45, 0.09, 'triangle', i * 0.11)); tone(784, 0.9, 0.06, 'sine', 0.5); },
    turn() { tone(659, 0.16, 0.07, 'sine'); tone(880, 0.22, 0.07, 'sine', 0.09); },
    ask() { tone(587, 0.14, 0.08, 'triangle'); tone(740, 0.2, 0.08, 'triangle', 0.1); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 0.1, 'triangle', i * 0.13)); },
    lose() { [440, 392, 330].forEach((f, i) => tone(f, 0.5, 0.08, 'sine', i * 0.18)); }
  };
})();
function sfx(name) { if (settings.sound) { try { SFX[name](); } catch (e) { /* audio blocked */ } } }

/* ------------------------------------------------------------------ small UI helpers */
let bannerTimer = 0;
function banner(html, hold) {
  const b = $('#banner'); b.innerHTML = html; b.classList.add('on');
  clearTimeout(bannerTimer);
  if (!hold) bannerTimer = setTimeout(() => b.classList.remove('on'), 1900 * Math.max(0.7, spd()));
}
function toast(msg, ms) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms || 3200);
}
function showScreen(id) {
  $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
  if (!scene) return;
  if (id) { scene.setHost($('#titleBg')); scene.setTitleMode(!S); }
  else { scene.setTitleMode(false); scene.setHost($('#stage')); }
}
function sheet(html, opts = {}) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${opts.noClose ? '' : '<button class="x" data-a="close" aria-label="閉じる">×</button>'}${html}</div>`;
  $('#layer').appendChild(bg);
  const close = () => { bg.remove(); if (opts.onClose) opts.onClose(); };
  bg.addEventListener('click', (e) => {
    if (e.target === bg && !opts.modal) { close(); return; }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'close') { close(); return; }
    if (opts.onAction) opts.onAction(a.dataset.a, a, close);
  });
  return { el: bg, close };
}
function closeSheets() { $$('#layer .sheet-bg').forEach((b) => b.remove()); }
const dot = (color) => `<span class="dot" style="background:${(COLOR[color] || COLOR.red).hex}"></span>`;
const cn = (cid) => `「${esc(D.COM[cid].name)}」`;
const lt = (t) => (t ? `<span class="lt${t.c ? ' c' : ''}" title="${t.c ? 'カエサル付き' : ''}">${ROMAN[t.v]}${t.c ? '<small>☆</small>' : ''}</span>` : '<span class="lt none">なし</span>');

/* ------------------------------------------------------------------ session state */
let scene = null;
let S = null;          // { kind: 'solo'|'host'|'guest', st (solo/host only), me, cfg, log, deals, status, rnd, ... }
let V = null;          // what I may see
let U = { sel: null, req: null, nego: null };
let busy = false, pumping = false, chain = Promise.resolve();
const pname = (p) => (V && V.players[p] ? V.players[p].name : '?');
const pcolor = (p) => (V && V.players[p] ? V.players[p].color : 'red');
const who = (p) => `<span class="who">${dot(pcolor(p))}${esc(pname(p))}</span>`;
const isHostish = () => S && (S.kind === 'solo' || S.kind === 'host');
function canAct() {
  if (!V || busy || !S || S.wait || V.phase === 'over' || U.req) return false;
  return V.phase === 'bonus' ? V.bonus.by === V.me : V.turn === V.me;
}
function committeeOf(sid) {
  for (const c of D.COMMITTEES) if (V.occ[c.id].indexOf(sid) >= 0) return c.id;
  return V.senate.indexOf(sid) >= 0 ? 'S' : null;
}
function setStatus(p, text) { if (S) { S.status = { p, text }; if (S.kind === 'host') broadcast({ k: 'status', p, text }); renderAct(); } }

/* ------------------------------------------------------------------ the log */
function logLine(html, no) {
  if (!S) return;
  S.log.unshift({ t: no || (V ? V.turnNo : 0), html });
  if (S.log.length > 160) S.log.length = 160;
  renderLog();
}
/* a line everyone at the table should read (the host also sends it to the guests) */
function talk(html) { logLine(html); if (S && S.kind === 'host') broadcast({ k: 'note', html, t: V ? V.turnNo : 0 }); }

/* ------------------------------------------------------------------ playing back what happened */
async function present(ev, view) {
  busy = true;
  renderAct();
  try {
    for (const e of ev) await showEvent(e);
  } catch (err) { console.error(err); }
  V = view;
  scene.setView(V);
  busy = false;
  if (U.sel && !stillValid(U.sel)) U.sel = null;
  renderAll();
  if (canAct() && V.phase === 'play') { sfx('turn'); banner('あなたの番です'); }
  if (canAct() && V.phase === 'bonus') { sfx('caesar'); banner('カエサルを動かせます'); }
  if (V.phase === 'over') finishGame();
}
function votesText(votes) {
  const ks = Object.keys(votes || {});
  return ks.length ? '賛成：' + ks.map((q) => `${esc(pname(+q))}${votes[q] > 1 ? '×' + votes[q] : ''}`).join('・') : '';
}
async function showEvent(e) {
  const pace = spd();
  switch (e.e) {
    case 'place':
      logLine(`${who(e.p)}が${cn(e.c)}に議員を置いた`);
      sfx('place');
      await scene.play(e);
      break;
    case 'move': {
      const how = e.caesar ? '（カエサルの道。月桂冠は取れない）' : e.free ? (D.COM[e.from].seats === 1 ? '' : '（自分の議員で過半数）') : `（${votesText(e.votes)}）`;
      logLine(`${who(e.p)}が${cn(e.from)}→${e.to === 'S' ? '<b>元老院</b>' : cn(e.to)}${how}`);
      sfx('move');
      await scene.play(e);
      break;
    }
    case 'laurel':
      logLine(`${who(e.p)}は月桂冠 ${lt(e.tile)} を手に入れた`);
      sfx('laurel');
      await scene.play(e);
      break;
    case 'refill': await scene.play(e); if (!e.tile) logLine('月桂冠の山がなくなった（この道にはもう補充されない）'); break;
    case 'consent':
      if (e.ones) logLine(`${who(e.p)}は賛成のお礼に「I」を${e.ones > 1 ? e.ones + '枚' : '1枚'}受け取った`);
      else logLine(`${who(e.p)}が賛成した（「I」はもう残っていない）`);
      sfx('consent');
      await scene.play(e);
      break;
    case 'pay': logLine(`${who(e.from)}から${who(e.to)}へ月桂冠 ${e.pts}点`); sfx('coin'); await sleep(260 * pace); break;
    case 'promise': logLine(`${who(e.from)}は${who(e.to)}に「次に賛成する」と約束した`); break;
    case 'kept': logLine(`${who(e.from)}は約束どおり${who(e.to)}に賛成した`); break;
    case 'broken': logLine(`${who(e.from)}は${who(e.to)}との約束を破った`); break;
    case 'caesar':
      logLine(`${who(e.p)}がカエサルを${cn(D.PATH[e.to].from)}の上の道へ${e.bonus ? '（II・カエサルの力で）' : ''}`);
      sfx('caesar');
      await scene.play(e);
      break;
    case 'nobonus': logLine(`${who(e.p)}はカエサルを動かさなかった`); break;
    case 'bonus': if (e.by !== e.mover) logLine(`取り決めどおり、カエサルの行き先は${who(e.by)}が決める`); break;
    case 'senate':
      logLine(`<b>${who(e.p)}の議員が元老院に入った（${e.idx + 1}人目）</b>`);
      sfx('senate');
      banner(`${who(e.p)}が元老院へ（${e.idx + 1}/5）`);
      await scene.play(e);
      break;
    case 'reveal': showReveal(e); break;
    case 'over': break;
    default: break;
  }
}
function showReveal(e) {
  const rows = e.pts.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  logLine(`途中公開（${e.idx}人目が元老院に入ったので、全員が月桂冠を見せ合った）`);
  sheet(`<h2>途中公開</h2><p>${e.idx}人目が元老院に入りました。全員の月桂冠です（記録には残りません）。</p>
    <table class="res"><tr><th>人</th><th class="num">月桂冠</th></tr>${rows.map((r) => `<tr><td>${who(r.i)}</td><td class="num">${r.v}</td></tr>`).join('')}</table>
    <div class="menu-actions"><button class="btn primary" data-a="close">覚えた</button></div>`);
}
function stillValid(sel) {
  if (!canAct()) return false;
  if (sel.k === 'place') return E.placeTargets(V, V.me).indexOf(sel.c) >= 0;
  if (sel.k === 'move' || sel.k === 'pick') return E.countIn(V, sel.from, V.me) > 0;
  return true;
}

/* ------------------------------------------------------------------ the game loop (solo and host) */
async function commit(p, act) {
  const r = E.apply(S.st, p, act);
  if (!r.ok) { console.warn('rejected', p, act, r.err); return false; }
  S.deals = {}; S.status = null;
  if (p === S.me) { U.sel = null; U.nego = null; }
  const view = E.viewFor(S.st, S.me);
  if (S.kind === 'host') broadcastState(r.ev);
  saveGame();
  await present(r.ev, view);
  if (S.queue && S.queue.length) { const q = S.queue.splice(0); q.forEach((fn) => fn()); }
  return true;
}
async function pump() {
  if (pumping || !isHostish()) return;
  pumping = true;
  try {
    while (S && isHostish() && !busy) {
      const st = S.st;
      if (st.phase === 'over') { finishGame(); break; }
      const p = st.phase === 'bonus' ? st.bonus.by : st.turn;
      if (st.players[p].kind !== 'cpu') { renderAll(); break; }
      await cpuAct(p);
    }
  } catch (err) { console.error(err); } finally { pumping = false; }
}
const lvl = (p) => S.st.players[p].level || 2;
async function cpuAct(p) {
  const st = S.st;
  setStatus(p, 'thinking');
  await sleep((380 + Math.random() * 420) * spd());
  if (!S || S.st !== st) return;
  if (st.phase === 'bonus') { await commit(p, { t: 'bonus', to: AI.bonus(st, p, lvl(p), S.rnd) }); return; }
  const cands = AI.decide(st, p, lvl(p), S.rnd);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (!c.asks) { if (await commit(p, c.act)) return; continue; }
    const rest = cands.slice(i + 1).find((x) => !x.asks);
    const act = await cpuNegotiate(p, c, rest);
    if (!S || S.st !== st) return;
    if (act && await commit(p, act)) return;
  }
  await commit(p, { t: 'caesar', to: E.caesarTargets(st)[0] });
}
/* a CPU asks the voters it planned for; people get a sheet (or a message), CPUs answer at once */
async function cpuNegotiate(p, c, rest) {
  let act = E.clone(c.act);
  for (const a of c.asks) {
    const q = a.q, st = S.st;
    const req = { mover: p, from: act.from, to: act.to, votes: a.k, pay: (act.pay && act.pay[q]) || 0, promise: false, caesar: false };
    let ans;
    if (st.players[q].kind === 'cpu') {
      ans = AI.respond(st, q, req, lvl(q), S.rnd);
      await sleep(240 * spd());
    } else {
      setStatus(p, 'asking:' + q);
      ans = await askPerson(q, req);
    }
    if (!S || S.st !== st) return null;
    const offer = req.pay ? `（${req.pay}点を払う）` : '';
    if (ans.ok) { talk(`${who(p)}が${who(q)}に賛成を求めた${offer} → <b>賛成</b>`); continue; }
    if (ans.ask !== undefined) {
      const acc = AI.acceptCounter(st, p, { act }, q, ans.ask, lvl(p), rest ? rest.val : undefined);
      if (acc) { act = acc; talk(`${who(q)}は「${ans.ask}点なら」と答え、${who(p)}はそれをのんだ`); if (st.players[q].kind !== 'cpu') notifyPerson(q, `${esc(pname(p))}はあなたの条件（${ans.ask}点）をのみました`); continue; }
      talk(`${who(q)}は「${ans.ask}点なら」と答えたが、${who(p)}はことわった`);
      if (st.players[q].kind !== 'cpu') notifyPerson(q, `${esc(pname(p))}はあなたの条件をことわりました`);
    } else talk(`${who(p)}が${who(q)}に賛成を求めた${offer} → <span class="warn">ことわられた</span>`);
    sfx('refuse');
    if (E.owes(st, q, p)) { const ev = E.breakPromise(st, q, p); if (ev.length) { await showEvent(ev[0]); if (S.kind === 'host') broadcast({ k: 'note', html: `${who(q)}は${who(p)}との約束を破った` }); } }
    return null;
  }
  return act;
}

/* ------------------------------------------------------------------ asking a person (me, or a guest) */
let askSeq = 1;
const pending = new Map();           // id → resolve (answers from guests)
function askPerson(q, req) {
  if (q === S.me) return askMe(req);
  const cid = S.cids && S.cids[q];
  if (!cid || !S.online[q]) return Promise.resolve({ ok: false, offline: true });
  const id = askSeq++;
  return new Promise((res) => {
    const to = setTimeout(() => { pending.delete(id); res({ ok: false, timeout: true }); talk(`${who(q)}の返事がなかった（ことわった扱い）`); }, ASK_TIMEOUT);
    pending.set(id, (ans) => { clearTimeout(to); res(cleanAnswer(ans)); });
    L.link.send(cid, { k: 'ask', id, req, owed: E.owes(S.st, q, req.mover) });
  });
}
function cleanAnswer(a) {
  if (!a || typeof a !== 'object') return { ok: false };
  if (a.ok) return { ok: true };
  const x = Math.floor(+a.ask);
  return isFinite(x) && x > 0 && x < 200 ? { ok: false, ask: x } : { ok: false };
}
function askMe(req, extra) {
  if (U.req) { const old = U.req; U.req = null; old.resolve({ ok: false }); }   // a newer request replaces an unanswered one
  return new Promise((res) => {
    U.req = Object.assign({ req, pay: (req.pay || 0) + 1, resolve: res, t0: Date.now() }, extra || {});
    U.sel = null;
    sfx('ask');
    banner(`${esc(pname(req.mover))}があなたの賛成を求めています`);
    renderAll();
    revealAct();
  });
}
function answerMe(ans) {
  const r = U.req;
  if (!r) return;
  U.req = null;
  sfx(ans.ok ? 'consent' : ans.ask ? 'click' : 'refuse');
  r.resolve(ans);
  renderAll();
}
function notifyPerson(q, text) {
  if (q === S.me) { toast(text); return; }
  if (S.kind === 'host' && S.cids[q]) L.link.send(S.cids[q], { k: 'toast', text });
}

/* ------------------------------------------------------------------ my negotiations */
let negoSeq = 1;
function startNego(info) {
  const rows = {};
  const qs = Object.keys(info.avail).map(Number);
  qs.forEach((q) => { rows[q] = { use: true, votes: Math.min(info.avail[q], qs.length === 1 ? info.ext : 1), pay: 0, promise: false, caesar: false, st: 'idle', ask: 0 }; });
  U.nego = { id: negoSeq++, from: info.from, to: info.to, rows };
}
function negoInfo() { return U.nego ? E.moveInfo(V, V.me, U.nego.from, U.nego.to) : null; }
function negoBudget() { const info = negoInfo(); return info ? E.budget(V, V.me, info) : 0; }
/* the accepted consents to use: cheapest first, until enough votes */
function negoPlan() {
  const N = U.nego, info = negoInfo();
  if (!N || !info) return null;
  const ok = Object.keys(N.rows).map(Number).filter((q) => N.rows[q].st === 'ok').sort((a, b) => N.rows[a].pay - N.rows[b].pay);
  let need = info.ext;
  const use = [];
  for (const q of ok) { if (need <= 0) break; const k = Math.min(N.rows[q].votes, need); use.push({ q, k }); need -= k; }
  if (need > 0) return null;
  const pay = use.reduce((s, u) => s + N.rows[u.q].pay, 0);
  return pay <= negoBudget() ? { use, pay } : null;
}
async function askAll(only) {
  const N = U.nego, info = negoInfo();
  if (!N || !info) return;
  const ask = (only || Object.keys(N.rows).map(Number).filter((q) => N.rows[q].use && N.rows[q].st !== 'ok' && N.rows[q].st !== 'wait'));
  if (!ask.length) { toast(Object.values(N.rows).some((r) => r.st === 'ok') ? 'もう賛成をもらっています' : '頼む相手を選んでください'); return; }
  const total = Object.keys(N.rows).map(Number).filter((q) => ask.indexOf(q) >= 0 || N.rows[q].st === 'ok').reduce((s, q) => s + N.rows[q].pay, 0);
  if (total > negoBudget()) { toast(`払える月桂冠は${negoBudget()}点までです`); return; }
  ask.forEach((q) => { N.rows[q].st = 'wait'; });
  sfx('click');
  renderAct();
  if (S.kind === 'guest') {
    const rows = {}; ask.forEach((q) => { const r = N.rows[q]; rows[q] = { votes: r.votes, pay: r.pay, promise: r.promise, caesar: r.caesar }; });
    S.link.send({ k: 'req', id: N.id, from: N.from, to: N.to, rows });
    return;
  }
  await Promise.all(ask.map(async (q) => {
    const r = N.rows[q];
    const ans = await resolveAsk(S.me, N.from, N.to, q, r);
    if (U.nego !== N) return;
    r.st = ans.ok ? 'ok' : ans.ask ? 'ask' : ans.never ? 'never' : 'no'; r.ask = ans.ask || 0;
    renderAct();
  }));
}
/* solo/host: the voter q answers mover m's offer; an accepted offer becomes this turn's deal */
async function resolveAsk(m, from, to, q, r) {
  const st = S.st;
  const req = { mover: m, from, to, votes: r.votes, pay: r.pay, promise: r.promise, caesar: r.caesar };
  let ans;
  if (st.players[q].kind === 'cpu') { await sleep(320 * spd()); ans = AI.respond(st, q, req, lvl(q), S.rnd); }
  else { ans = await askPerson(q, req); }
  if (S.st !== st) return { ok: false };
  const offer = [r.pay ? `${r.pay}点` : '', r.promise ? '約束' : '', r.caesar ? 'カエサルの行き先' : ''].filter(Boolean).join('＋');
  if (ans.ok) {
    (S.deals[m] = S.deals[m] || {})[q] = { votes: r.votes, pay: r.pay, promise: r.promise, caesar: r.caesar };
    talk(`${who(m)}が${who(q)}に賛成を求めた${offer ? '（' + offer + '）' : ''} → <b>賛成</b>`);
    sfx('consent');
  } else if (ans.ask) { talk(`${who(m)}が${who(q)}に賛成を求めた → 「${ans.ask}点なら賛成」`); sfx('click'); }
  else {
    talk(`${who(m)}が${who(q)}に賛成を求めた → <span class="warn">ことわられた</span>`);
    sfx('refuse');
    if (E.owes(st, q, m)) { const ev = E.breakPromise(st, q, m); if (ev.length) { logLine(`${who(q)}は${who(m)}との約束を破った`); if (S.kind === 'host') broadcast({ k: 'note', html: `${who(q)}は${who(m)}との約束を破った` }); } }
  }
  return ans;
}
/* the move, built from the deals made this turn */
function buildMove(m, from, to, use) {
  const deals = (S.deals && S.deals[m]) || {}, info = E.moveInfo(S.st, m, from, to);
  if (!info.ok) return null;
  const votes = {}, pay = {}, promise = [];
  let caesarBy;
  let need = info.ext;
  for (const u of use) {
    const d = deals[u.q];
    if (!d) return null;
    const k = Math.min(u.k, d.votes, info.avail[u.q] || 0, need);
    if (k <= 0) continue;
    votes[u.q] = k; need -= k;
    if (d.pay) pay[u.q] = d.pay;
    if (d.promise) promise.push(u.q);
    if (d.caesar && info.laurel && info.laurel.c) caesarBy = u.q;
  }
  if (need > 0) return null;
  return { t: 'move', from, to, votes, pay, promise, caesarBy };
}
function goMove() {
  const N = U.nego, plan = negoPlan();
  if (!N || !plan) return;
  if (S.kind === 'guest') { S.wait = true; S.link.send({ k: 'go', id: N.id, from: N.from, to: N.to, use: plan.use }); renderAct(); return; }
  const act = buildMove(S.me, N.from, N.to, plan.use);
  if (!act) { toast('取り決めが成り立っていません'); return; }
  submitMine(act);
}
function submitMine(act) {
  if (!canAct()) return;
  sfx('click');
  if (S.kind === 'guest') { S.wait = true; S.link.send({ k: 'act', act }); renderAct(); return; }
  commit(S.me, act).then(() => pump());
}

/* ------------------------------------------------------------------ rendering the tablet */
function renderAll() {
  if (!V) return;
  renderTop(); renderAct(); renderMine(); renderSeats(); renderProms(); renderLog(); updateHighlights();
}
function renderTop() {
  const chip = $('#turnChip');
  $('#senateCount').textContent = `元老院 ${V.senate.length}/5`;
  if (V.phase === 'over') { chip.innerHTML = 'ゲーム終了'; chip.classList.remove('mine'); return; }
  const p = V.phase === 'bonus' ? V.bonus.by : V.turn;
  chip.innerHTML = p === V.me ? (V.phase === 'bonus' ? 'あなた：カエサル' : 'あなたの番') : `${dot(pcolor(p))}${esc(pname(p))}の番`;
  chip.classList.toggle('mine', p === V.me);
  $('#senateCount').textContent = `元老院 ${V.senate.length}/5`;
}
function revealAct() { const book = $('#book'), box = $('#act'); if (book.scrollTop > box.offsetTop + 20) book.scrollTo({ top: 0, behavior: 'smooth' }); }
function moveDesc(info) {
  const c = D.COM[info.from];
  if (!info.ok) return info.why === 'full' ? '<span>上が満員</span>' : info.why === 'fewvoters' ? '<span>賛成できる議員がいない</span>' : '';
  if (c.seats === 1) return '<b>自由に</b>（1人議会・月桂冠なし）';
  if (info.caesar) return '<b>カエサルの道</b>（賛成いらず・月桂冠なし）';
  const l = info.laurel ? `月桂冠${lt(info.laurel)}` : '月桂冠なし';
  if (info.free) return `<b>自分の議員で過半数</b>・${l}`;
  return `<b>賛成あと${info.ext}票</b>・${l}`;
}
function renderAct() {
  const box = $('#act');
  if (!V) { box.innerHTML = ''; return; }
  box.classList.remove('mine', 'asked');
  if (U.req) { renderRequest(box); return; }
  if (V.phase === 'over') {
    box.innerHTML = `<p class="prompt"><b>ゲーム終了</b></p><div class="row"><button class="btn primary wide" id="aEnd">結果を見る</button></div>`;
    $('#aEnd').onclick = showEnd;
    return;
  }
  const p = V.phase === 'bonus' ? V.bonus.by : V.turn;
  if (busy || p !== V.me || S.wait) {
    let line = '';
    const stt = S.status && S.status.p === p ? S.status.text : '';
    if (S.wait) line = '<span class="spin"></span> 送信中…';
    else if (busy) line = '…';
    else if (stt === 'thinking') line = `<span class="spin"></span> ${who(p)}が考えています`;
    else if (stt && stt.indexOf('asking:') === 0) { const q = +stt.slice(7); line = `<span class="spin"></span> ${who(p)}が${who(q)}に賛成を求めています`; }
    else if (V.players[p].kind !== 'cpu') line = `<span class="spin"></span> ${who(p)}の番です`;
    else line = `<span class="spin"></span> ${who(p)}の番`;
    box.innerHTML = `<p class="prompt"><b>${p === V.me ? 'あなたの番' : esc(pname(p)) + 'の番'}</b><span class="sub">${line}</span></p>`;
    return;
  }
  box.classList.add('mine');
  if (V.phase === 'bonus') { renderBonus(box); return; }
  const sel = U.sel;
  if (sel && sel.k === 'move') { renderMoveSel(box, sel); return; }
  if (sel && sel.k === 'place') {
    box.innerHTML = `<p class="prompt"><b>議員を置く</b><span class="sub">${cn(sel.c)}の空いた席に、手元の議員を1人置きます。</span></p>
      <div class="row"><button class="btn gold wide" id="aGo">置く</button><button class="btn ghost" id="aCancel">やめる</button></div>`;
    $('#aGo').onclick = () => submitMine({ t: 'place', c: sel.c });
    $('#aCancel').onclick = () => { U.sel = null; renderAll(); };
    return;
  }
  if (sel && sel.k === 'caesar') {
    const t = V.spaces[sel.to];
    box.innerHTML = `<p class="prompt"><b>カエサルを動かす</b><span class="sub">${cn(D.PATH[sel.to].from)}の上の道（月桂冠${lt(t)}の上）へ。その議会からは賛成なしで上がれるようになり、この月桂冠はカエサルがいる間だれも取れません。</span></p>
      <div class="row"><button class="btn gold wide" id="aGo">ここへ動かす</button><button class="btn ghost" id="aCancel">やめる</button></div>`;
    $('#aGo').onclick = () => submitMine({ t: 'caesar', to: sel.to });
    $('#aCancel').onclick = () => { U.sel = null; renderAll(); };
    return;
  }
  // the three actions
  const me = V.players[V.me];
  const places = E.placeTargets(V, V.me);
  const moves = E.moveOptions(V, V.me);
  const pick = sel && sel.k === 'pick' ? sel.from : null;
  let h = `<p class="prompt"><b>あなたの番</b><span class="sub">どれか1つ。盤面をタップしても選べます。</span></p>`;
  h += `<div class="grp"><div class="lab">${term("議員")}を置く <span class="n">（手元に${me.left}人）</span></div><div class="opts">`;
  h += D.ENTRY.map((cid) => {
    const free = V.occ[cid].filter((x) => x < 0).length;
    const ok = places.indexOf(cid) >= 0;
    return `<button class="opt" data-place="${cid}" ${ok ? '' : 'disabled'}><span class="t">${esc(D.COM[cid].name)}</span><span class="d">${me.left <= 0 ? '手元にいない' : free ? '空き' + free : '満員'}</span></button>`;
  }).join('') + '</div></div>';
  const movable = moves.filter((m) => !pick || m.from === pick);
  h += `<div class="grp"><div class="lab">${term("移動")}する${pick ? ` <span class="n">（${cn(pick)}から）</span>` : ''}</div>`;
  if (!movable.length) h += '<p class="note">動かせる議員はまだいません。</p>';
  else h += '<div class="opts">' + movable.map((m) => `<button class="opt ${m.ok && (m.free) ? 'free' : 'need'}" data-from="${m.from}" data-to="${m.to}" ${m.ok ? '' : 'disabled'}><span class="t">${esc(D.COM[m.from].name.replace(/（.*）/, ''))} → ${m.to === 'S' ? '元老院' : esc(D.COM[m.to].name)}</span><span class="d">${moveDesc(m)}</span></button>`).join('') + '</div>';
  h += '</div>';
  h += `<div class="grp"><div class="lab">${term("カエサル")}を動かす <span class="n">（月桂冠をタップ）</span></div><div class="opts">` +
    D.LAUREL_PATHS.filter((pid) => pid !== V.caesar).map((pid) => `<button class="opt" data-caesar="${pid}"><span class="t">${esc(D.COM[D.PATH[pid].from].name.replace(/（.*）/, ''))}の上</span><span class="d">月桂冠${lt(V.spaces[pid])}</span></button>`).join('') + '</div></div>';
  box.innerHTML = h;
  $$('[data-place]', box).forEach((b) => { b.onclick = () => { sfx('click'); U.sel = { k: 'place', c: b.dataset.place }; renderAll(); }; });
  $$('[data-from]', box).forEach((b) => { b.onclick = () => { sfx('click'); selectMove(b.dataset.from, b.dataset.to); }; });
  $$('[data-caesar]', box).forEach((b) => { b.onclick = () => { sfx('click'); U.sel = { k: 'caesar', to: b.dataset.caesar }; renderAll(); }; });
}
function selectMove(from, to) {
  const info = E.moveInfo(V, V.me, from, to);
  if (!info.ok) { toast(info.why === 'full' ? '行き先の議会が満員です' : info.why === 'fewvoters' ? 'この議会には、賛成できる議員が足りません' : 'その道は進めません'); return; }
  U.sel = { k: 'move', from, to };
  U.nego = null;
  if (!info.free) startNego(info);
  renderAll();
  revealAct();
}
function renderMoveSel(box, sel) {
  const info = E.moveInfo(V, V.me, sel.from, sel.to);
  if (!info.ok) { U.sel = null; renderAct(); return; }
  const dest = sel.to === 'S' ? `<b>元老院</b>（${V.senate.length + 1}人目${V.senate.length === 4 ? '・これでゲーム終了' : ''}）` : cn(sel.to);
  let h = `<p class="prompt"><b>議員を動かす</b><span class="sub">${cn(sel.from)} → ${dest}</span></p>`;
  if (info.free) {
    const why = D.COM[sel.from].seats === 1 ? '1人議会からは、だれの賛成もいりません（月桂冠はありません）。' : info.caesar ? 'カエサルの道なので賛成はいりません。ただし月桂冠は取れません。' : `あなたの議員だけで過半数です。月桂冠${lt(info.laurel)}を取ります。`;
    h += `<p class="note">${why}</p><div class="row" style="margin-top:8px"><button class="btn gold wide" id="aGo">動かす</button><button class="btn ghost" id="aCancel">やめる</button></div>`;
    box.innerHTML = h;
    $('#aGo').onclick = () => submitMine({ t: 'move', from: sel.from, to: sel.to });
    $('#aCancel').onclick = () => { U.sel = null; U.nego = null; renderAll(); };
    return;
  }
  if (!U.nego || U.nego.from !== sel.from || U.nego.to !== sel.to) startNego(info);
  const N = U.nego, budget = E.budget(V, V.me, info);
  h += `<div class="card2"><div class="l">この道の${term("月桂冠")}：${lt(info.laurel)}（動けばあなたのもの）</div><div class="l">賛成があと<b>${info.ext}票</b>いります${info.own ? `（あなたの議員の賛成${info.own}票は済み）` : ''}。賛成した人は「I」を1枚もらえます（あと${V.ones}枚）。</div><div class="l">払える月桂冠：${budget}点まで（手持ち${V.players[V.me].pts}${info.laurel ? '＋この道の' + info.laurel.v : ''}）</div></div>`;
  h += '<div class="nego">';
  Object.keys(N.rows).map(Number).forEach((q) => {
    const r = N.rows[q], k = info.avail[q];
    const ans = r.st === 'ok' ? '<span class="ans ok">賛成</span>' : r.st === 'ask' ? `<span class="ans no">${r.ask}点なら賛成</span>` : r.st === 'never' ? '<span class="ans no">どんな条件でも断る</span>' : r.st === 'no' ? '<span class="ans no">断られた</span>' : r.st === 'wait' ? '<span class="ans"><span class="spin"></span></span>' : '';
    const owes = V.promises.some((pr) => pr.from === q && pr.to === V.me && !pr.done);
    h += `<div class="nrow ${r.st === 'ok' ? 'ok' : (r.st === 'no' || r.st === 'never') ? 'no' : ''} ${r.use ? '' : 'off'}" data-q="${q}">
      <div class="top"><label class="tick"><input type="checkbox" data-use ${r.use ? 'checked' : ''}>${who(q)}</label><span class="pill">議員${k}人</span>${owes ? '<span class="pill">あなたに約束あり</span>' : ''}<span class="grow"></span>${ans}</div>
      <div class="ctrl">${k > 1 && info.ext > 1 ? `<span>票</span><span class="step"><button data-v="-1">−</button><span>${r.votes}</span><button data-v="1">＋</button></span>` : ''}
        <span>${term("渡す月桂冠")}</span><span class="step"><button data-p="-1">−</button><span>${r.pay}</span><button data-p="1">＋</button></span>
        ${r.st === 'ask' ? `<button class="btn small gold" data-take>${r.ask}点にする</button>` : ''}</div>
      <div class="ctrl"><label class="tick"><input type="checkbox" data-prom ${r.promise ? 'checked' : ''}>次に賛成すると約束する</label>
        ${info.laurel && info.laurel.c ? `<label class="tick"><input type="checkbox" data-caes ${r.caesar ? 'checked' : ''}>カエサルの行き先を任せる</label>` : ''}</div>
    </div>`;
  });
  h += '</div>';
  const plan = negoPlan();
  const waiting = Object.values(N.rows).some((r) => r.st === 'wait');
  h += `<div class="row"><button class="btn primary wide" id="aAsk" ${waiting ? 'disabled' : ''}>${waiting ? '返事を待っています…' : '賛成を頼む'}</button>
    <button class="btn gold wide" id="aGo" ${plan ? '' : 'disabled'}>${plan ? `動かす${plan.pay ? `（${plan.use.map((u) => esc(pname(u.q)) + 'に' + N.rows[u.q].pay + '点').filter((x) => !/に0点/.test(x)).join('・')}）` : ''}` : '動かす'}</button>
    <button class="btn ghost" id="aCancel">やめる</button></div>
    <p class="note">その場でできる取り決め（月桂冠を渡す）は必ず守られます。「次に賛成する」約束は守らなくてもかまいません。</p>`;
  box.innerHTML = h;
  $$('.nrow', box).forEach((row) => {
    const q = +row.dataset.q, r = N.rows[q];
    const reset = () => { if (r.st !== 'wait') { r.st = 'idle'; r.ask = 0; } };
    row.querySelector('[data-use]').onchange = (e) => { r.use = e.target.checked; renderAct(); };
    $$('[data-v]', row).forEach((b) => { b.onclick = () => { r.votes = Math.max(1, Math.min(info.avail[q], info.ext, r.votes + +b.dataset.v)); reset(); renderAct(); }; });
    $$('[data-p]', row).forEach((b) => { b.onclick = () => { r.pay = Math.max(0, Math.min(budget, r.pay + +b.dataset.p)); reset(); renderAct(); }; });
    const take = row.querySelector('[data-take]'); if (take) take.onclick = () => { r.pay = Math.min(budget, r.ask); r.st = 'idle'; askOne(q); };
    row.querySelector('[data-prom]').onchange = (e) => { r.promise = e.target.checked; reset(); renderAct(); };
    const ce = row.querySelector('[data-caes]'); if (ce) ce.onchange = (e) => { r.caesar = e.target.checked; reset(); renderAct(); };
  });
  $('#aAsk').onclick = () => askAll();
  $('#aGo').onclick = () => goMove();
  $('#aCancel').onclick = () => { U.sel = null; U.nego = null; renderAll(); };
}
/* take a voter's price and ask that voter again */
function askOne(q) {
  const N = U.nego;
  if (!N) return;
  N.rows[q].use = true;
  askAll([q]);
}
function renderBonus(box) {
  const sel = U.sel && U.sel.k === 'bonus' ? U.sel.to : null;
  let h = `<p class="prompt"><b>カエサルを動かせます</b><span class="sub">「II・カエサル」の月桂冠を取ったので、好きな月桂冠の上へカエサルを動かせます（動かさなくてもよい）。盤面の月桂冠をタップしても選べます。</span></p>`;
  h += '<div class="opts">' + D.LAUREL_PATHS.filter((pid) => pid !== V.caesar).map((pid) => `<button class="opt ${sel === pid ? 'on' : ''}" data-b="${pid}"><span class="t">${esc(D.COM[D.PATH[pid].from].name.replace(/（.*）/, ''))}の上</span><span class="d">月桂冠${lt(V.spaces[pid])}</span></button>`).join('') + '</div>';
  h += `<div class="row" style="margin-top:10px"><button class="btn gold wide" id="aGo" ${sel ? '' : 'disabled'}>ここへ動かす</button><button class="btn wide" id="aSkip">動かさない</button></div>`;
  box.innerHTML = h;
  $$('[data-b]', box).forEach((b) => { b.onclick = () => { sfx('click'); U.sel = { k: 'bonus', to: b.dataset.b }; renderAll(); }; });
  $('#aGo').onclick = () => submitMine({ t: 'bonus', to: sel });
  $('#aSkip').onclick = () => submitMine({ t: 'bonus', to: null });
}
function renderRequest(box) {
  const r = U.req, q = r.req;
  box.classList.add('asked');
  const info = E.moveInfo(V, q.mover, q.from, q.to);
  const dest = q.to === 'S' ? `<b>元老院</b>（${V.senate.length + 1}人目${V.senate.length === 4 ? '・これでゲーム終了' : ''}）` : cn(q.to);
  const gets = [`「I」を${q.votes > 1 ? q.votes + '枚' : '1枚'}${V.ones ? '' : '（もう残っていない）'}`];
  if (q.pay) gets.push(`${esc(pname(q.mover))}から月桂冠${q.pay}点`);
  const owed = r.owed !== undefined ? r.owed : V.promises.some((pr) => pr.from === V.me && pr.to === q.mover && !pr.done);
  const left = r.remote ? Math.max(0, Math.ceil((ASK_TIMEOUT - (Date.now() - r.t0)) / 1000)) : null;
  let h = `<p class="prompt"><b>${esc(pname(q.mover))}が賛成を求めています</b><span class="sub">${who(q.mover)}の議員：${cn(q.from)} → ${dest}</span></p>
    <div class="card2"><div class="l">この道の月桂冠：${lt(info.ok ? info.laurel : null)}（${esc(pname(q.mover))}のものに）</div>
    <div class="l">あなたが賛成すると：${gets.join('＋')}</div>
    ${q.promise ? `<div class="l">${esc(pname(q.mover))}は「次にあなたが頼んだら賛成する」と約束します（守られるとは限りません）。</div>` : ''}
    ${q.caesar ? '<div class="l">このあとのカエサルの行き先を、あなたが決められます。</div>' : ''}
    ${owed ? `<div class="l warn">あなたは${esc(pname(q.mover))}に「次に賛成する」と約束しています。</div>` : ''}</div>
    <div class="row"><button class="btn green wide" id="rYes">賛成する</button><button class="btn wide" id="rNo">断る</button></div>
    <div class="ctrl" style="margin-top:10px"><span>条件を出す：</span><span class="step"><button data-p="-1">−</button><span>${r.pay}</span><button data-p="1">＋</button></span><span>点なら賛成</span><button class="btn small" id="rAsk">この条件で返事</button></div>
    ${left !== null ? `<p class="note">あと${left}秒で「断った」扱いになります。</p>` : ''}`;
  box.innerHTML = h;
  $('#rYes').onclick = () => answerMe({ ok: true });
  $('#rNo').onclick = () => answerMe({ ok: false });
  $('#rAsk').onclick = () => answerMe({ ok: false, ask: r.pay });
  $$('[data-p]', box).forEach((b) => { b.onclick = () => { r.pay = Math.max(1, Math.min(99, r.pay + +b.dataset.p)); renderAct(); }; });
}
function renderMine() {
  const me = V.players[V.me];
  if (!me) { $('#mineSec').hidden = true; return; }
  $('#mineSec').hidden = false;
  const inS = E.senateCount(V, V.me), onBoard = E.senatorsOf(V, V.me).filter((s) => s.cid !== 'S').length;
  $('#mine').innerHTML = `<div class="mine-box"><span class="big">${me.pts}</span><span>月桂冠（${me.tiles || 0}枚）</span><span class="grow"></span>${dot(me.color)}<span class="note" style="margin:0">手元${me.left}・盤上${onBoard}・元老院${inS}</span></div>
    ${inS ? '' : '<p class="note">元老院に議員が1人もいないまま終わると、月桂冠がいくら多くても勝てません。</p>'}`;
}
function renderSeats() {
  const order = [];
  for (let k = 0; k < V.n; k++) order.push((V.first + k) % V.n);
  const p = V.phase === 'bonus' ? V.bonus.by : V.turn;
  $('#seats').innerHTML = order.map((i) => {
    const pl = V.players[i], inS = E.senateCount(V, i), onBoard = E.senatorsOf(V, i).filter((s) => s.cid !== 'S').length;
    const pts = pl.pts === null || pl.pts === undefined ? '<span class="pts hid">？</span>' : `<span class="pts">${pl.pts}</span>`;
    const tag = pl.kind === 'cpu' ? `<span class="lv">CPU・${LEVEL_NAME[pl.level] || ''}</span>` : i === V.me ? '<span class="lv">あなた</span>' : '';
    return `<div class="seat ${i === p && V.phase !== 'over' ? 'cur' : ''}">${dot(pl.color)}<span class="nm">${esc(pl.name)}${tag}</span>
      <span class="cnt"><span title="手元">手${pl.left}</span><span title="盤上">盤${onBoard}</span><span title="元老院">元${inS}</span><span title="月桂冠の枚数">札${pl.tiles || 0}</span></span>${pts}</div>`;
  }).join('');
}
function renderProms() {
  const open = (V.promises || []).filter((pr) => !pr.done);
  $('#promSec').hidden = !open.length;
  $('#proms').innerHTML = open.map((pr) => `<div>${who(pr.from)} → ${who(pr.to)}：次に賛成する</div>`).join('');
}
function renderLog() { $('#log').innerHTML = (S ? S.log : []).slice(0, 80).map((l) => `<li><span class="t">${l.t}</span><span>${l.html}</span></li>`).join(''); }
function updateHighlights() {
  if (!scene || !V) return;
  const spec = { committees: [], laurels: [], senators: [] };
  if (U.req) {
    const q = U.req.req;
    spec.committees.push(q.from, q.to);
    if (D.PATH[q.from + '-' + q.to].laurel) spec.laurels.push(q.from + '-' + q.to);
    V.occ[q.from].forEach((sid) => { if (sid >= 0 && E.owner(sid) === q.mover) spec.senators.push(sid); });
  } else if (U.sel && canAct()) {
    const s = U.sel;
    if (s.k === 'place') spec.committees.push(s.c);
    else if (s.k === 'pick') { spec.committees.push(s.from); (D.OUT[s.from] || []).forEach((p) => spec.committees.push(p.to)); }
    else if (s.k === 'move') { spec.committees.push(s.from, s.to); if (D.PATH[s.from + '-' + s.to].laurel) spec.laurels.push(s.from + '-' + s.to); }
    else if (s.k === 'caesar' || s.k === 'bonus') { if (s.to) spec.laurels.push(s.to); }
    if (s.from) V.occ[s.from].forEach((sid) => { if (sid >= 0 && E.owner(sid) === V.me) spec.senators.push(sid); });
  }
  scene.highlight(spec);
}

/* ------------------------------------------------------------------ the board */
function onBoardTap(hit) {
  if (!hit || !V) return;
  if (!canAct()) {
    if (hit.kind === 'laurel') toast(`月桂冠${lt(V.spaces[hit.id])}（${cn(D.PATH[hit.id].from)}の上）${hit.id === V.caesar ? '・カエサルがいる' : ''}`, 2200);
    return;
  }
  if (V.phase === 'bonus') { if (hit.kind === 'laurel' && hit.id !== V.caesar) { sfx('click'); U.sel = { k: 'bonus', to: hit.id }; renderAll(); } return; }
  if (hit.kind === 'laurel') {
    if (hit.id === V.caesar) { toast('カエサルはもうここにいます'); return; }
    sfx('click'); U.sel = { k: 'caesar', to: hit.id }; renderAll(); revealAct(); return;
  }
  const cid = hit.kind === 'senator' ? committeeOf(hit.sid) : hit.id;
  if (!cid) return;
  if (U.sel && (U.sel.k === 'pick' || U.sel.k === 'move') && D.PATH[U.sel.from + '-' + cid]) { sfx('click'); selectMove(U.sel.from, cid); return; }
  if (cid !== 'S' && E.countIn(V, cid, V.me) > 0 && D.OUT[cid]) {
    sfx('click');
    const outs = D.OUT[cid];
    if (outs.length === 1) selectMove(cid, outs[0].to);
    else { U.sel = { k: 'pick', from: cid }; U.nego = null; renderAll(); revealAct(); }
    return;
  }
  if (D.COM[cid].entry && E.placeTargets(V, V.me).indexOf(cid) >= 0) { sfx('click'); U.sel = { k: 'place', c: cid }; renderAll(); revealAct(); return; }
  if (cid === 'S') toast('元老院の席：' + V.senate.length + '/5');
}

/* ------------------------------------------------------------------ menus and overlays */
function openMenu() {
  sheet(`<h2>メニュー</h2>
    <div class="field"><span class="note">アニメーションの速さ</span><div class="seg" id="mSpeed"><button data-v="slow">ゆっくり</button><button data-v="normal">ふつう</button><button data-v="fast">はやい</button></div></div>
    <div class="menu-actions"><button class="btn" data-a="rules">ルール</button><button class="btn" data-a="glossary">用語説明</button><button class="btn" data-a="view">盤面全体を表示</button></div>
    <div class="menu-actions"><a class="btn" href="tutorial.html" target="_blank" rel="noopener" style="text-decoration:none">操作チュートリアル（別画面）</a></div>
    <div class="menu-actions"><button class="btn primary" data-a="quit">${S && S.kind === 'solo' ? 'タイトルへ（続きから再開できます）' : 'タイトルへ'}</button></div>`, {
    onAction(a, b, close) {
      if (a === 'rules') { close(); openRules(); }
      else if (a === 'glossary') { close(); H.openGlossary(); }
      else if (a === 'view') { close(); scene.resetCamera(true); }
      else if (a === 'quit') { close(); confirmQuit(); }
    }
  });
  const seg = $('#mSpeed');
  $$('button', seg).forEach((b) => { b.classList.toggle('on', b.dataset.v === settings.speed); b.onclick = () => { settings.speed = b.dataset.v; saveSettings(); scene.setSpeed(spd()); $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); }; });
}
function openRules() {
  sheet(`<h2>ルール</h2>
    <div class="learn-links"><a class="btn small" href="tutorial.html" target="_blank" rel="noopener">操作で覚えるチュートリアル</a>${term("言葉を調べる", "")}</div>
    <p>ライナー・クニツィアの交渉ゲーム（Hans im Glück 1992年／AMIGO 2005年）。3〜5人。古代ローマの名家となって、一族の議員を議会から議会へ上げ、元老院をめざします。</p>
    <h4>手番（どれか1つ）</h4>
    <ul><li><b>議員を置く</b>：手元の議員（ひとり8人）を、いちばん下の4つの議会の空いた席に置く。</li>
    <li><b>議員を動かす</b>：自分の議員1人を、道でつながった1つ上の議会へ（空席が必要。とばしたり下がったりはできない）。</li>
    <li><b>カエサルを動かす</b>：カエサルを、いまと別の月桂冠の上へ。</li></ul>
    <h4>上がるのに要る${term("賛成・票")}</h4>
    <ul><li>1人議会：だれの賛成もいらない（その道に月桂冠はない）。</li>
    <li>3人議会：同じ議会のほかの議員1人の賛成。5人議会：ほかの議員2人の賛成。自分の議員の賛成でもよい。足りなければ上がれない。</li>
    <li>ほかの色の議員が賛成すると、その持ち主は賛成のお礼に「I」の月桂冠を1枚もらえる（なくなるまで）。</li>
    <li>3人・5人議会から上がると、その道の月桂冠を取る（取った月桂冠は伏せて、合計は秘密）。すぐ山から1枚、表向きに補充。</li>
    <li>カエサルがいる道は、賛成なしで上がれる。ただしカエサルの下の月桂冠はだれも取れない。</li>
    <li>「II・カエサル」の月桂冠を取った人は、そのあとカエサルを動かしてもよい。</li></ul>
    <h4>${term("交渉")}</h4>
    <ul><li>賛成のかわりに月桂冠を渡す・取り分を分ける・次の賛成を約束する・カエサルの行き先を任せる、など何でも。</li>
    <li>その手番の中でできる取り決めは必ず守る（このアプリでは自動で払われます）。先の約束は守らなくてもよい。</li></ul>
    <h4>終わりと勝ち負け</h4>
    <ul><li>元老院の5つの席が埋まった瞬間に終わり。</li>
    <li>元老院に議員が1人もいない人は、月桂冠がいくら多くても勝てない。元老院に議員がいる人のうち、月桂冠の合計がいちばん多い人の勝ち。同点なら、先に元老院に入った人。</li></ul>
    <h4>追加ルール（原作の変種）</h4>
    <ul><li>途中公開：1・2・3人目が元老院に入るたび、全員の月桂冠を見せ合う。</li><li>「I」を減らす：3人なら10枚、4人なら14枚。</li></ul>
    <h4>このアプリについて</h4>
    <p class="note">個人で遊ぶための非公式版です。内容物は2005年版（月桂冠「I」18枚・「II」8枚・「II・カエサル」6枚・「III」15枚・「IV」9枚・「V」6枚）。盤面の議会の数・大きさ・最下段の並び・月桂冠の置き場（10か所）・元老院への3本の道はルールブックとレビューに合わせ、途中の段のつながり方は資料から組み立てたものです。交渉は「賛成を頼む／条件を出す」の形にまとめています。</p>
    <div class="menu-actions"><button class="btn primary" data-a="close">閉じる</button></div>`);
}
function confirmQuit() {
  if (!S) { showTitle(); return; }
  if (S.kind === 'solo') { saveGame(); toTitle(); return; }
  sheet(`<h2>部屋を出ますか？</h2><p>${S.kind === 'host' ? 'あなたは進行役です。出ると、この部屋のゲームは終わります。' : '出ると、このゲームにはもどれません。'}</p><div class="menu-actions"><button class="btn primary" data-a="y">出る</button><button class="btn" data-a="close">もどる</button></div>`,
    { onAction(a, b, close) { if (a === 'y') { close(); toTitle(); } } });
}
function showEnd() {
  if (!V || V.phase !== 'over') return;
  const res = V.over || E.result(V);
  const meRow = res.rows.find((r) => r.p === V.me);
  const iWon = res.winner === V.me;
  sfx(iWon ? 'win' : 'lose');
  const head = res.winner < 0 ? 'だれも勝てませんでした' : iWon ? 'あなたの勝ち！' : `${esc(pname(res.winner))}の勝ち`;
  sheet(`<h2>${head}</h2>
    <table class="res"><tr><th>順位</th><th>人</th><th>元老院</th><th class="num">月桂冠</th></tr>
    ${res.rows.map((r) => `<tr class="${r.p === res.winner ? 'win' : ''} ${r.qualified ? '' : 'out'}"><td>${r.qualified ? r.rank : '—'}</td><td>${who(r.p)}</td><td class="s">${r.qualified ? r.senate + '人・' + (r.first + 1) + '番目' : 'いない（失格）'}</td><td class="num">${r.pts}</td></tr>`).join('')}</table>
    ${meRow && !meRow.qualified ? '<p class="note">元老院に議員がいないので、月桂冠の数にかかわらず勝てませんでした。</p>' : ''}
    <div class="menu-actions">${isHostish() ? '<button class="btn primary" data-a="again">もう一度</button>' : ''}<button class="btn" data-a="title">タイトルへ</button><button class="btn ghost" data-a="close">盤面を見る</button></div>`, {
    onAction(a, b, close) { close(); if (a === 'again') playAgain(); else if (a === 'title') toTitle(); }
  });
}
function finishGame() {
  if (!S || S.endShown) return;
  S.endShown = true;
  if (S.kind === 'solo') store.del('quovadis.save');
  setTimeout(showEnd, 700 * spd());
}

/* ------------------------------------------------------------------ starting, saving and leaving games */
function variantOpts(open, variant) { return { open: open === '1', reveal: variant === 'reveal' || variant === 'both', oneLimit: variant === 'limit' || variant === 'both' }; }
function startSolo(cfg) {
  const n = cfg.n, myColor = cfg.color;
  const others = D.PLAYER_COLORS.map((c) => c.key).filter((k) => k !== myColor);
  const names = CPU_NAMES.slice().sort(() => Math.random() - 0.5);
  const players = [{ name: settings.name || 'あなた', kind: 'human', color: myColor }];
  for (let i = 1; i < n; i++) players.push({ name: names[i - 1], kind: 'cpu', level: cfg.level, color: others[i - 1] });
  const seed = (Math.random() * 4294967296) >>> 0;
  const st = E.newGame({ players, seed, first: cfg.first === 'me' ? 0 : undefined, opts: variantOpts(cfg.open, cfg.variant) });
  S = { kind: 'solo', st, me: 0, cfg, log: [], deals: {}, rnd: E.mulberry32(seed ^ 0x5bd1e995), status: null };
  V = E.viewFor(st, 0);
  logLine(`ゲーム開始。${who(st.first)}から。`);
  beginGame();
}
function saveGame() { if (S && S.kind === 'solo') store.set('quovadis.save', { st: S.st, cfg: S.cfg, log: S.log.slice(0, 60), v: 1 }); }
function resumeSolo() {
  const sv = store.get('quovadis.save');
  if (!sv || !sv.st || sv.st.phase === 'over') { store.del('quovadis.save'); showTitle(); return; }
  S = { kind: 'solo', st: sv.st, me: 0, cfg: sv.cfg, log: sv.log || [], deals: {}, rnd: E.mulberry32((Date.now() >>> 0) ^ 0x9e37), status: null };
  V = E.viewFor(S.st, 0);
  beginGame();
}
function beginGame() {
  closeSheets();
  U = { sel: null, req: null, nego: null };
  busy = false; pumping = false; chain = Promise.resolve();
  showScreen(null);
  $('#app').hidden = false;
  scene.setHost($('#stage'));
  scene.setSpeed(spd());
  scene.setView(V);
  scene.resize();
  renderAll();
  if (V.phase === 'over') { finishGame(); return; }
  if (canAct()) { sfx('turn'); banner(V.phase === 'bonus' ? 'カエサルを動かせます' : 'あなたの番です'); }
  pump();
}
function playAgain() {
  if (!S) return;
  if (S.kind === 'solo') startSolo(S.cfg);
  else if (S.kind === 'host') startOnlineGame();
}
function toTitle() {
  closeSheets();
  if (U.req) { const r = U.req; U.req = null; r.resolve({ ok: false }); }
  if (S && S.kind !== 'solo') leaveRoom();
  S = null; V = null; U = { sel: null, req: null, nego: null };
  $('#app').hidden = true;
  showTitle();
}
function showTitle() {
  $('#tResume').hidden = !store.get('quovadis.save');
  showScreen('scrTitle');
}
function segInit(id, value, onPick) {
  const seg = $(id);
  $$('button', seg).forEach((b) => {
    b.classList.toggle('on', String(b.dataset.v) === String(value));
    b.onclick = () => { sfx('click'); $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); };
  });
}
function openSolo() {
  const c = settings.solo;
  $('#soColor').innerHTML = D.PLAYER_COLORS.map((x) => `<button data-v="${x.key}" aria-label="${x.name}">${dot(x.key)}</button>`).join('');
  segInit('#soN', c.n, (v) => { c.n = +v; saveSettings(); });
  segInit('#soLevel', c.level, (v) => { c.level = +v; saveSettings(); });
  segInit('#soColor', c.color, (v) => { c.color = v; saveSettings(); });
  segInit('#soFirst', c.first, (v) => { c.first = v; saveSettings(); });
  segInit('#soOpen', c.open, (v) => { c.open = v; saveSettings(); });
  segInit('#soVar', c.variant, (v) => { c.variant = v; saveSettings(); });
  showScreen('scrSolo');
}
function initScreens() {
  H.init();
  $('#tGlossary').onclick = () => H.openGlossary();
  $('#btnGlossary').onclick = () => H.openGlossary();
  $('#tSolo').onclick = () => { sfx('click'); openSolo(); };
  $('#tResume').onclick = () => { sfx('click'); resumeSolo(); };
  $('#tOnline').onclick = () => { sfx('click'); openOnline(); };
  $('#tRules').onclick = () => { sfx('click'); openRules(); };
  $('#soBack').onclick = () => { sfx('click'); showTitle(); };
  $('#soStart').onclick = () => { sfx('click'); startSolo(Object.assign({}, settings.solo)); };
  $('#onBack').onclick = () => { sfx('click'); showTitle(); };
  $('#btnMenu').onclick = () => { sfx('click'); openMenu(); };
  $('#btnView').onclick = () => { sfx('click'); scene.resetCamera(true); };
  $('#btnSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); syncSoundBtn(); sfx('click'); };
}
function syncSoundBtn() { if (globalThis.GEMINI_BGM) globalThis.GEMINI_BGM.setEnabled(settings.sound); $('#btnSound').classList.toggle('off', !settings.sound); $('#btnSound').setAttribute('aria-pressed', String(settings.sound)); }
document.addEventListener('gemini-bgm-change', syncSoundBtn);

/* ------------------------------------------------------------------ online play */
const netKind = new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer';
let L = null;      // the room: { role, link, code, players: [{ name, kind: 'host'|'guest'|'cpu', cid, level, online }], level, open, variant, me }
function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('quovadis.cid'); } catch (e) { c = null; }
  if (!c) { c = NET.makeCid(); try { sessionStorage.setItem('quovadis.cid', c); } catch (e) { /* ignore */ } }
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
        L = { role: 'host', link, code, players: [{ name, kind: 'host', online: true }], level: settings.lobby.level, open: settings.lobby.open, variant: settings.lobby.variant };
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
  L = { role: 'guest', link, code, players: [], me: -1, level: 2, open: '0', variant: 'none' };
  link.on('msg', onGuestMsg);
  link.on('close', () => { if (L && L.link === link) lostHost(); });
  link.send({ k: 'hello', cid: myCid(), name, v: NET.PROTOCOL });
  showLobby();
}
function showLobby() { renderLobby(); showScreen('scrLobby'); }
function lobbyColor(i) { return D.PLAYER_COLORS[i].key; }
function renderLobby() {
  if (!L) return;
  const host = L.role === 'host', n = L.players.length;
  $('#lobCode').textContent = L.code;
  $('#lobHost').hidden = !host;
  $('#lobNote').textContent = host ? 'このコードを友だちに伝えるか、招待リンクを送ってください。3〜5人（CPUを入れてもよい）がそろったら「はじめる」。' : (L.players.length ? '進行役がはじめるのを待っています。' : '部屋に入っています…');
  $('#lobSeats').innerHTML = L.players.map((p, i) => {
    const tag = p.kind === 'host' ? '進行役' : p.kind === 'cpu' ? 'CPU・' + LEVEL_NAME[p.level || L.level] : (p.online === false ? '接続待ち' : 'オンライン');
    const you = (host && i === 0) || (!host && i === L.me);
    return `<div class="lseat">${dot(lobbyColor(i))}<span class="grow">${esc(p.name)}${you ? '（あなた）' : ''}</span><span class="tagx">${tag}</span>${host && p.kind === 'cpu' ? `<button class="btn small ghost" data-rm="${i}">外す</button>` : ''}</div>`;
  }).join('');
  if (host) {
    segInit('#lobLevel', L.level, (v) => { L.level = +v; settings.lobby.level = +v; L.players.forEach((p) => { if (p.kind === 'cpu') p.level = +v; }); saveSettings(); sendLobby(); renderLobby(); });
    segInit('#lobOpen', L.open, (v) => { L.open = v; settings.lobby.open = v; saveSettings(); sendLobby(); });
    segInit('#lobVar', L.variant, (v) => { L.variant = v; settings.lobby.variant = v; saveSettings(); sendLobby(); });
    $('#lobStart').disabled = n < 3;
    $('#lobStart').textContent = n < 3 ? `あと${3 - n}人（CPUでも可）` : `${n}人ではじめる`;
    $('#lobAddCpu').disabled = n >= 5;
  }
}
function sendLobby() {
  if (!L || L.role !== 'host') return;
  const pub = L.players.map((p) => ({ name: p.name, kind: p.kind, level: p.level || L.level, online: p.online !== false }));
  L.players.forEach((p, i) => { if (p.cid) L.link.send(p.cid, { k: 'lobby', code: L.code, players: pub, you: i, level: L.level, open: L.open, variant: L.variant }); });
}
function broadcast(m) { if (S && S.kind === 'host' && L) S.cids.forEach((cid, o) => { if (cid && S.online[o]) L.link.send(cid, m); }); }
function onHostMsg(cid, m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'hello') {
    const name = NET.cleanName(m.name) || 'ゲスト';
    if (m.v !== NET.PROTOCOL) { L.link.send(cid, { k: 'bye', why: 'version' }); L.link.drop(cid); return; }
    if (S && S.kind === 'host') {
      const o = S.cids.indexOf(cid);
      if (o >= 0) { S.online[o] = true; if (L.players[o]) L.players[o].online = true; sendFull(o); toast(esc(pname(o)) + 'がもどりました'); renderAll(); }
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
  if (m.k === 'answer') { const f = pending.get(m.id); if (f) { pending.delete(m.id); f(m.ans); } return; }
  if (m.k === 'leave') { onHostLeave(cid); return; }
  const run = () => {
    if (!S || S.kind !== 'host') return;
    const st = S.st, who0 = st.phase === 'bonus' ? st.bonus.by : st.turn;
    if (who0 !== o || st.phase === 'over') { L.link.send(cid, { k: 'err', err: 'turn', view: E.viewFor(st, o) }); return; }
    if (m.k === 'act') {
      if (!m.act || typeof m.act !== 'object' || (m.act.t === 'move' && !E.moveInfo(st, o, m.act.from, m.act.to).free)) { L.link.send(cid, { k: 'err', err: 'bad', view: E.viewFor(st, o) }); return; }
      commit(o, { t: m.act.t, c: m.act.c, from: m.act.from, to: m.act.to === undefined ? undefined : m.act.to }).then((ok) => { if (!ok) L.link.send(cid, { k: 'err', err: 'bad', view: E.viewFor(S.st, o) }); pump(); });
    } else if (m.k === 'req') hostReq(o, cid, m);
    else if (m.k === 'go') {
      const use = Array.isArray(m.use) ? m.use.filter((u) => u && Number.isInteger(u.q) && Number.isInteger(u.k)).slice(0, 4) : [];
      const act = typeof m.from === 'string' && typeof m.to === 'string' ? buildMove(o, m.from, m.to, use) : null;
      if (!act) { L.link.send(cid, { k: 'err', err: 'deal', view: E.viewFor(st, o) }); return; }
      commit(o, act).then(() => pump());
    }
  };
  if (busy) (S.queue = S.queue || []).push(run); else run();
}
/* a guest asks for consent: CPUs answer here, people are asked; each answer goes back as it arrives */
function hostReq(o, cid, m) {
  const st = S.st, info = E.moveInfo(st, o, m.from, m.to);
  if (!info.ok || info.free || !m.rows || typeof m.rows !== 'object') { L.link.send(cid, { k: 'err', err: 'bad', view: E.viewFor(st, o) }); return; }
  S.reqs = S.reqs || {};
  S.reqs[o] = { from: m.from, to: m.to };
  setStatus(o, 'asking:' + (Object.keys(m.rows)[0] || ''));
  Object.keys(m.rows).forEach(async (k) => {
    const q = +k, r = m.rows[k] || {};
    if (!(info.avail[q] > 0)) return;
    const row = { votes: Math.max(1, Math.min(info.avail[q], info.ext, Math.floor(+r.votes) || 1)), pay: Math.max(0, Math.min(E.budget(st, o, info), Math.floor(+r.pay) || 0)), promise: !!r.promise, caesar: !!r.caesar };
    const ans = await resolveAsk(o, m.from, m.to, q, row);
    if (S && S.st === st) L.link.send(cid, { k: 'answers', id: m.id, q, st: ans.ok ? 'ok' : ans.ask ? 'ask' : ans.never ? 'never' : 'no', ask: ans.ask || 0 });
  });
}
function onHostLeave(cid) {
  if (S && S.kind === 'host') {
    const o = S.cids.indexOf(cid);
    if (o >= 0 && S.online[o]) {
      S.online[o] = false; if (L && L.players[o]) L.players[o].online = false;
      toast(esc(pname(o)) + 'の接続が切れました');
      offerTakeover(o);
      renderAll();
    }
    return;
  }
  if (!L) return;
  L.players = L.players.filter((p) => p.cid !== cid);
  sendLobby(); renderLobby();
}
/* a person who left can be replaced by a CPU so the table can go on */
function offerTakeover(o) {
  sheet(`<h2>${esc(pname(o))}の接続が切れました</h2><p>もどってくるのを待つか、CPUに代わりに打たせることができます。</p><div class="menu-actions"><button class="btn primary" data-a="cpu">CPUに任せる</button><button class="btn" data-a="close">待つ</button></div>`,
    { onAction(a, b, close) { if (a === 'cpu' && S && S.kind === 'host') { close(); S.st.players[o].kind = 'cpu'; S.st.players[o].level = 2; V = E.viewFor(S.st, S.me); broadcastState([]); renderAll(); pump(); } } });
}
function startOnlineGame() {
  if (!L || L.role !== 'host' || L.players.length < 3) return;
  const players = L.players.map((p, i) => ({ name: p.name, kind: p.kind === 'cpu' ? 'cpu' : 'human', level: p.kind === 'cpu' ? (p.level || L.level) : 0, color: lobbyColor(i) }));
  const seed = (Math.random() * 4294967296) >>> 0;
  const st = E.newGame({ players, seed, opts: variantOpts(L.open, L.variant) });
  S = { kind: 'host', st, me: 0, log: [], deals: {}, rnd: E.mulberry32(seed ^ 0x2545f491), cids: L.players.map((p) => p.cid || null), online: L.players.map((p) => p.kind !== 'guest' || p.online !== false), status: null };
  V = E.viewFor(st, 0);
  S.cids.forEach((cid, o) => { if (cid) sendFull(o); });
  logLine(`ゲーム開始。${who(st.first)}から。`);
  beginGame();
}
function sendFull(o) { const cid = S.cids[o]; if (cid) L.link.send(cid, { k: 'state', full: true, view: E.viewFor(S.st, o), log: S.log.slice(0, 40) }); }
function broadcastState(ev) { S.cids.forEach((cid, o) => { if (cid && S.online[o]) L.link.send(cid, { k: 'state', view: E.viewFor(S.st, o), ev }); }); }
function onGuestMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'lobby') { L.players = m.players; L.me = m.you; L.level = m.level; L.open = m.open; L.variant = m.variant; if (!S) renderLobby(); return; }
  if (m.k === 'state') {
    if (!S || m.full || S.kind !== 'guest' || m.view.me !== S.me) {
      S = { kind: 'guest', me: m.view.me, link: L.link, log: Array.isArray(m.log) ? m.log : [], status: null, wait: false };
      V = m.view;
      beginGame();
      return;
    }
    S.wait = false;
    const view = m.view, ev = Array.isArray(m.ev) ? m.ev : [];
    chain = chain.then(() => present(ev, view)).then(() => { if (S && S.kind === 'guest') { U.sel = U.sel && stillValid(U.sel) ? U.sel : null; renderAll(); } });
    return;
  }
  if (!S || S.kind !== 'guest') return;
  if (m.k === 'status') { S.status = { p: m.p, text: m.text }; renderAct(); return; }
  if (m.k === 'note') { logLine(m.html, m.t); return; }
  if (m.k === 'toast') { toast(esc(m.text)); return; }
  if (m.k === 'ask') {
    const id = m.id;
    chain.then(() => askMe(m.req, { remote: true, owed: !!m.owed })).then((ans) => { if (L) L.link.send({ k: 'answer', id, ans }); });
    return;
  }
  if (m.k === 'answers') {
    const N = U.nego;
    if (N && N.id === m.id && N.rows[m.q]) { N.rows[m.q].st = m.st; N.rows[m.q].ask = m.ask || 0; renderAct(); }
    return;
  }
  if (m.k === 'err') { S.wait = false; if (m.view && !busy) { V = m.view; scene.setView(V); } toast(m.err === 'deal' ? '取り決めが成り立っていません。もう一度頼んでください。' : 'その手は打てません'); renderAll(); return; }
  if (m.k === 'bye') {
    const why = { full: '部屋がいっぱいでした（5人まで）。', started: 'その部屋はもう始まっています。', version: 'アプリの版がちがいます。ページを読みこみ直してください。' }[m.why] || '部屋から出ました。';
    leaveRoom(); S = null; V = null; $('#app').hidden = true; openOnline(); onlineError(why);
  }
}
function lostHost() {
  const inGame = !!S;
  leaveRoom();
  if (U.req) { const r = U.req; U.req = null; r.resolve({ ok: false }); }
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
    const used = new Set(L.players.map((p) => p.name));
    const name = CPU_NAMES.find((x) => !used.has(x)) || 'CPU';
    L.players.push({ name, kind: 'cpu', level: L.level });
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
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(esc(url), 6000));
    else toast(esc(url), 6000);
  };
}
/* the countdown on a remote request */
setInterval(() => {
  if (!U.req || !U.req.remote) return;
  if (Date.now() - U.req.t0 > ASK_TIMEOUT) answerMe({ ok: false }); else renderAct();
}, 1000);

/* ------------------------------------------------------------------ boot */
async function boot() {
  initScreens(); initOnline(); syncSoundBtn();
  const params = new URLSearchParams(location.search);
  try {
    await loadThree();
    if (document.fonts && document.fonts.load) { try { await Promise.race([document.fonts.load('700 40px Cinzel'), sleep(1500)]); } catch (e) { /* fall back to serif */ } }
    scene = createScene($('#titleBg'), { keepFrame: params.has('shot') });
    scene.onTap(onBoardTap);
  } catch (e) {
    $('#loaderMsg').innerHTML = '3D表示を読みこめませんでした。通信のよいところでページを読みこみ直してください。<div class="menu-actions"><a class="btn gold" href="tutorial.html">操作チュートリアルを開く</a><button class="btn" id="loadHelp" type="button">用語説明</button></div>';
    $('#loadHelp').onclick = () => H.openGlossary();
    console.error(e);
    return;
  }
  $('#loader').classList.add('done');
  setTimeout(() => { const l = $('#loader'); if (l) l.remove(); }, 400);
  const room = NET.cleanCode(params.get('room') || '');
  if (room.length === 4) { showTitle(); openOnline(room); }
  else if (params.get('practice') === '1') { showTitle(); openSolo(); }
  else showTitle();
  window.__qv = { get S() { return S; }, get V() { return V; }, get U() { return U; }, get busy() { return busy; }, scene: () => scene,
    E, AI, D, startSolo, submitMine, selectMove, askAll, goMove, answerMe, onBoardTap, settings, showEnd, resumeSolo, canAct };
  window.__ready = true;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); else if (scene) scene.kick(); });
boot();

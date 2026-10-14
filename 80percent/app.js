/* 80% — the app: screens, the control panel, and the match flow.
   Solo: a local Referee plays the CPU. Online: the host's Referee owns the game and streams its events
   to the guest. Both players watch the same event list, so the presentation code is shared. */
import { createScene } from './scene.js';

const E = window.EIGHTY_ENG, N = window.EIGHTY_NET;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const yen = (n) => (n < 0 ? '−¥' : '¥') + Math.abs(Math.round(n)).toLocaleString('ja-JP');
const store = {
  get(k, d) { try { const v = localStorage.getItem('eighty.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('eighty.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const prefs = {
  speed: store.get('speed', 1), sound: store.get('sound', true), name: store.get('name', ''),
  rounds: store.get('rounds', 10), opp: store.get('opp', 'calc'), onRounds: store.get('onRounds', 10)
};
if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;

let scene = null;
let match = null;   // the game being shown
let lobby = null;   // an online room (lives across rematches)

/* ================================================================ little UI helpers */
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.tm); toast.tm = setTimeout(() => { t.hidden = true; }, ms);
}
function dialog(text, buttons) {
  $('#dlgText').textContent = text;
  const box = $('#dlgBtns'); box.innerHTML = '';
  buttons.forEach(([label, fn, cls]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = label;
    b.onclick = () => { $('#dlg').hidden = true; if (fn) fn(); };
    box.appendChild(b);
  });
  $('#dlg').hidden = false;
}
function banner(text, cls = '', sub = '', hold = 1.0) {
  const b = $('#banner');
  b.className = ''; void b.offsetWidth;
  b.querySelector('.b1').textContent = text; b.querySelector('.b2').textContent = sub;
  b.style.animationDuration = (1.15 / Math.max(0.5, scene.speed)) + 's';
  b.className = 'show ' + cls;
  return scene.wait(hold * 0.85);
}
function animNum(el, to, fmt = yen, dur = 650) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = String(to);
  const id = (el._aid = (el._aid || 0) + 1);
  if (from === to || dur <= 0) { el.textContent = fmt(to); return; }
  el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(to > from ? 'up' : 'down');
  const t0 = performance.now();
  const step = (now) => {
    if (el._aid !== id) return;
    const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (u < 1) requestAnimationFrame(step); else setTimeout(() => { if (el._aid === id) el.classList.remove('up', 'down'); }, 700);
  };
  requestAnimationFrame(step);
}
function setFill(input) { const mx = Number(input.max) || 1; input.style.setProperty('--fill', (Number(input.value) - Number(input.min)) / Math.max(1, mx - Number(input.min)) * 100 + '%'); }
function pressSeg(container, value) { $$(container + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(value)))); }
function getName() { return N.cleanName($('#nmInput').value || prefs.name); }

/* ================================================================ HUD */
const hud = {
  names(a, b) { $('#hudNm0').textContent = a; $('#hudNm1').textContent = b; },
  round(r, n) {
    const el = $('#hudRound');
    el.innerHTML = (r >= n ? 'FINAL' : 'ROUND ' + r) + `<small> / ${n}</small>`;
    el.classList.toggle('final', r >= n);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  },
  vals: [{ cash: 0, debt: 0 }, { cash: 0, debt: 0 }],
  set(side, cash, debt, anim = true) {
    const v = this.vals[side];
    if (cash != null) v.cash = cash;
    if (debt != null) v.debt = debt;
    animNum($('#hudCash' + side), v.cash, yen, anim ? 650 : 0);
    animNum($('#hudNet' + side), v.cash - v.debt, yen, anim ? 650 : 0);
    $('#hudDebt' + side).textContent = v.debt > 0 ? '借金 ' + yen(v.debt) + ' /' : '';
  }
};

/* ================================================================ control panel */
const panel = {
  mode: null, res: null, cash: 0, sel: new Set(), opDebt: 0, atkJ: 0, limit: 0,
  lock(msg, wait = true) {
    this.mode = null; this.res = null;
    $('#panel').classList.add('locked');
    $('#btnGo').disabled = true;
    $('#pMsg').textContent = msg || '';
    $('#pMsg').classList.toggle('wait', wait);
    if (scene) scene.setTapEnabled(false);
  },
  idle(msg) {
    this.lock(msg);
    $('#secBorrow').hidden = true; $('#btnGo').hidden = false;
  },
  unlock() { $('#panel').classList.remove('locked'); $('#btnGo').disabled = false; $('#pMsg').classList.remove('wait'); },
  askBorrow(limit) {
    this.mode = 'borrow'; this.limit = limit;
    $('#secBorrow').hidden = false; $('#secBet').hidden = true; $('#secAtk').hidden = true; $('#btnGo').hidden = true;
    $('#borrowMax').textContent = yen(limit);
    $('#borrowRange').value = 10;
    this.unlock();
    $('#pMsg').textContent = '所持金が0になりました';
    this.renderBorrow();
    return new Promise((res) => { this.res = res; });
  },
  borrowAmt() { return E.stepOf(this.limit, Number($('#borrowRange').value)); },
  renderBorrow() {
    const r = $('#borrowRange'), amt = this.borrowAmt();
    $('#borrowAmt').textContent = yen(amt); $('#borrowPct').textContent = r.value * 10 + '%';
    $('#btnBorrow').disabled = amt <= 0; setFill(r);
  },
  askDecision(s, seat) {
    const me = s.P[seat], op = s.P[1 - seat];
    this.mode = 'decide'; this.cash = me.cash; this.opDebt = op.debt; this.sel = new Set(); this.atkJ = 0;
    $('#secBorrow').hidden = true; $('#btnGo').hidden = false;
    $('#secBet').hidden = false; $('#secAtk').hidden = op.debt <= 0;
    const live = E.liveCount(me.cash);
    $('#betRange').max = String(Math.max(1, live)); $('#betRange').disabled = live === 0;
    $('#atkRange').value = 0;
    this.unlock();
    $('#pMsg').textContent = me.cash > 0 ? (op.debt > 0 ? '賭け金と、アタックする額を選ぶ' : '賭けるお金を選んでください')
      : op.debt > 0 ? '所持金がありません（アタックはできます）' : '所持金がないので、このラウンドは見送りです';
    this.render();
    scene.select(0, []);
    scene.setTapEnabled(me.cash > 0);
    return new Promise((res) => { this.res = res; });
  },
  setSel(list) {
    this.sel = new Set(list);
    scene.select(0, [...this.sel]);
    this.render();
  },
  setCount(k) { this.setSel(E.selByCount(this.cash, Math.max(0, Math.min(10, k)))); },
  render() {
    const sel = [...this.sel], bet = E.betOf(this.cash, sel), k = sel.length, live = E.liveCount(this.cash);
    const pct = this.cash >= 100 ? k * 10 : this.cash > 0 ? Math.round(bet / this.cash * 100) : 0;
    $('#betAmt').textContent = yen(bet);
    $('#betPct').textContent = k > 0 && k === live ? '全額' : pct + '%';
    const br = $('#betRange'); br.value = String(k); setFill(br);
    const atk = E.stepOf(this.opDebt, this.atkJ);
    $('#opDebt').textContent = yen(this.opDebt);
    $('#atkAmt').textContent = yen(atk); $('#atkPct').textContent = this.atkJ * 10 + '%';
    $('#atkRange').value = String(this.atkJ); setFill($('#atkRange'));
    $('#atkRisk').innerHTML = atk > 0
      ? `成功 80%：相手の借金 <b>+${yen(atk)}</b><br>失敗 20%：<b>${yen(atk)}</b> の借金があなたに移る`
      : '相手の借金のうち、倍にする額を選ぶ（任意）';
    const go = $('#btnGo');
    if (bet === 0 && atk === 0) { go.textContent = 'このラウンドは見送る'; go.classList.add('pass'); }
    else { go.textContent = '勝負！'; go.classList.remove('pass'); }
  },
  go() {
    if (this.mode !== 'decide' || !this.res) return;
    const d = { sel: [...this.sel].sort((a, b) => a - b), atk: E.stepOf(this.opDebt, this.atkJ) };
    const res = this.res; this.lock('');
    scene.sfx.unlock();
    res(d);
  },
  borrow(take) {
    if (this.mode !== 'borrow' || !this.res) return;
    const amt = take ? this.borrowAmt() : 0, res = this.res;
    this.lock('');
    $('#secBorrow').hidden = true; $('#secBet').hidden = false; $('#btnGo').hidden = false;
    res(amt);
  }
};
function onPileTap(i) {
  if (panel.mode !== 'decide') return;
  const s = new Set(panel.sel);
  if (s.has(i)) s.delete(i); else s.add(i);
  panel.setSel([...s]);
}

/* ================================================================ screens */
function showMenu(id) {
  $('#menuMain').hidden = id !== 'main'; $('#menuCpu').hidden = id !== 'cpu'; $('#menuOnline').hidden = id !== 'online';
}
function showTitle(menu = 'main') {
  $('#app').classList.add('no-panel'); $('#hud').hidden = true; $('#tools').hidden = true; $('#result').hidden = true;
  $('#title').hidden = false; showMenu(menu);
  if (scene) scene.setMode('title');
  renderRecord();
}
function enterGame() {
  $('#title').hidden = true; $('#result').hidden = true; $('#dlg').hidden = true;
  $('#app').classList.remove('no-panel'); $('#hud').hidden = false; $('#tools').hidden = false;
  scene.setMode('game');
}
function renderRecord() {
  const R = store.get('rec', null);
  $('#recLine').textContent = R && R.played ? `戦績 ${R.win}勝 ${R.lose}敗${R.draw ? ' ' + R.draw + '分' : ''}　最高純資産 ${yen(R.bestNet)}` : '';
}
function quitToTitle() {
  if (match) { match.alive = false; match = null; }
  if (lobby) { try { lobby.link.send({ k: 'bye' }); } catch (e) { /* ignore */ } lobby.link.close(); lobby = null; }
  $('#dlg').hidden = true;
  if (scene) scene.reset();
  panel.idle('');
  resetOnlineUI();
  showTitle('main');
}

/* ================================================================ matches */
function newMatch(mode, extra) { return Object.assign({ mode, mySeat: 0, q: [], busy: false, s: null, alive: true, over: false, bannerRound: 0, link: null, cpuSeat: null }, extra || {}); }
function setMatch(m) { if (match && match !== m) match.alive = false; match = m; }
function rng() { return (TEST && window.__eightyRolls && window.__eightyRolls.length) ? window.__eightyRolls.shift() : E.cryptoRng(); }
function makeReferee(m, s) {
  m.ref = new E.Referee({
    state: s, rng,
    onEvent: (ev) => {
      if (m.link) m.link.send({ k: 'ev', ev });
      feed(m, ev);
      if (ev.t === 'phase' && m.cpuSeat != null) setTimeout(() => cpuAct(m), 30);
    }
  });
}
function cpuAct(m) {
  if (!m.alive || m.cpuSeat == null || !m.ref) return;
  const r = m.ref, seat = m.cpuSeat;
  if (!r.waitingFor(seat)) return;
  if (r.s.ph === 'borrow') r.borrow(seat, E.cpuBorrow(r.s, seat, m.cpuType));
  else if (r.s.ph === 'decide') {
    const force = TEST && window.__eightyCpu;   // test hook: script the CPU's choice
    r.decide(seat, force ? force(r.s, seat) : E.cpuDecide(r.s, seat, m.cpuType));
  }
}
function startCpu() {
  // "random" (おまかせ) also includes the moody player 宮, who has no button of his own
  const type = E.CPU_TYPES[prefs.opp] ? prefs.opp : E.CPU_KEYS[Math.floor(Math.random() * E.CPU_KEYS.length)];
  const T = E.CPU_TYPES[type];
  const s = E.newGame({ rounds: prefs.rounds, players: [{ id: 'me', nm: 'あなた' }, { id: 'cpu', nm: T.nm, cpu: type }] });
  const m = newMatch('cpu', { cpuSeat: 1, cpuType: type });
  makeReferee(m, s);
  setMatch(m);
  m.ref.start();
}
function feed(m, ev) { if (!m.alive) return; m.q.push(ev); pump(m); }
async function pump(m) {
  if (m.busy) return;
  m.busy = true;
  try { while (m.alive && m.q.length) await present(m, m.q.shift()); }
  catch (e) { console.error(e); }
  finally { m.busy = false; }
}
function present(m, ev) {
  if (ev.t === 'start') return presentStart(m, ev);
  if (ev.t === 'phase') return presentPhase(m, ev);
  if (ev.t === 'borrows') return presentBorrows(m, ev);
  if (ev.t === 'resolve') return presentResolve(m, ev);
  if (ev.t === 'over') return presentOver(m, ev);
  return Promise.resolve();
}
const sideOf = (m, seat) => (seat === m.mySeat ? 0 : 1);
function opLabel(m, p) {
  if (m.mode === 'cpu' && p.cpu && E.CPU_TYPES[p.cpu]) return `${p.nm}（${E.CPU_TYPES[p.cpu].title}）`;
  return p.nm || '相手';
}
function lookFor(m, p) {
  const looks = { careful: { tie: 0x2c4a7a, shades: false }, calc: { tie: 0x5b5f66, shades: true }, mad: { tie: 0x8a1c1c, shades: true, hairTall: true, suit: 0x1d1414 }, whim: { tie: 0x2f6a3a, shades: false, suit: 0x1a1d24 } };
  return (p.cpu && looks[p.cpu]) || { tie: 0x1f3a6a, shades: true };
}

async function presentStart(m, ev) {
  const s = ev.s; m.s = s; m.over = false; m.bannerRound = 0;
  const me = s.P[m.mySeat], op = s.P[1 - m.mySeat];
  enterGame();
  scene.reset();
  scene.setNames(me.nm || 'あなた', op.nm || '相手', s.rnd);
  scene.setOpponentStyle(lookFor(m, op));
  scene.setDebt(0, 0, 0); scene.setDebt(1, 0, 0);
  hud.names(m.mode === 'cpu' ? 'あなた' : `${me.nm}（あなた）`, opLabel(m, op));
  hud.round(s.rnd, s.rounds);
  hud.set(0, 0, 0, false); hud.set(1, 0, 0, false);
  panel.idle('');
  $('#secAtk').hidden = true;
  await scene.intro(E.piles(me.cash), E.piles(op.cash));
  hud.set(0, me.cash, me.debt); hud.set(1, op.cash, op.debt);
}

async function presentPhase(m, ev) {
  const s = ev.s; m.s = s;
  const me = m.mySeat, op = 1 - me, P = s.P[me], O = s.P[op];
  hud.round(ev.r, s.rounds); scene.setRound(ev.r);
  if (m.bannerRound !== ev.r) {
    m.bannerRound = ev.r;
    const fin = ev.r >= s.rounds;
    await banner(fin ? 'FINAL ROUND' : `ROUND ${ev.r}`, fin ? 'neon' : '', fin ? '最終ラウンド' : `${ev.r} / ${s.rounds}`, 1.0);
    if (!m.alive) return;
  }
  if (ev.ph === 'borrow') {
    if (ev.need[me]) {
      scene.opp('watch', 30);
      const amt = await panel.askBorrow(P.limit);
      if (!m.alive) return;
      sendBorrow(m, amt);
      panel.idle(ev.need[op] ? `${O.nm} の返事を待っています…` : '');
    } else panel.idle(`${O.nm} が借金するか考えています…`);
    return;
  }
  scene.opp('think', 120);
  const d = await panel.askDecision(s, me);
  if (!m.alive) return;
  sendDecision(m, d);
  if (m.mode !== 'cpu') panel.idle(`${O.nm} の決断を待っています…`);
}
function sendBorrow(m, amt) {
  if (m.ref) m.ref.borrow(m.mySeat, amt);
  else if (m.link) m.link.send({ k: 'borrow', r: m.s.rnd, amt });
}
function sendDecision(m, d) {
  if (m.ref) m.ref.decide(m.mySeat, d);
  else if (m.link) m.link.send({ k: 'decide', r: m.s.rnd, sel: d.sel, atk: d.atk });
}

async function presentBorrows(m, ev) {
  for (const b of ev.list) {
    const side = sideOf(m, b.seat), p = ev.s.P[b.seat];
    if (b.amt > 0) {
      scene.pop(side, 'home', `借金 ${yen(b.amt)}`, 'red');
      if (side === 1) scene.opp('watch', 1.5);
      await scene.borrow(side, E.piles(p.cash), p.debt);
      hud.set(side, p.cash, p.debt);
    } else {
      scene.pop(side, 'home', '借りない', 'white small');
      await scene.wait(0.6);
    }
    if (!m.alive) return;
  }
  m.s = ev.s;
}

async function presentResolve(m, ev) {
  const res = ev.res, s1 = ev.s, s0 = m.s, me = m.mySeat, op = 1 - me, D = res.d, O = res.out;
  const names = [s0.P[me].nm, s0.P[op].nm];
  panel.idle('');
  await scene.select(0, D[me].sel);
  if (D[op].bet > 0) scene.opp('push', 1.1);
  await Promise.all([scene.select(1, D[op].sel), scene.wait(0.35)]);
  if (!m.alive) return;
  scene.pop(1, 'tray', D[op].bet > 0 ? yen(D[op].bet) : '見送り', 'white' + (D[op].bet > 0 ? '' : ' small'), 1.4);
  scene.pop(0, 'tray', D[me].bet > 0 ? yen(D[me].bet) : '見送り', 'white' + (D[me].bet > 0 ? '' : ' small'), 1.4);
  if (D[me].atk > 0) { scene.mark(1, true); scene.pop(1, 'iou', `倍化 ${yen(D[me].atk)}?`, 'red small', 2.2); }
  if (D[op].atk > 0) { scene.mark(0, true); scene.opp('point', 1.6); scene.pop(0, 'iou', `倍化 ${yen(D[op].atk)}?`, 'red small', 2.2); }
  await scene.wait(0.8);
  // both lamp rings spin together; ours stops first
  const cash = [s0.P[me].cash, s0.P[op].cash], debt = [s0.P[me].debt, s0.P[op].debt];
  const settle = async (side, win, bet, delay, dur) => {
    await scene.wait(delay);
    await scene.spin(side, win, { dur });
    if (!m.alive) return;
    if (win) {
      scene.pop(side, 'tray', `×2　+${yen(bet)}`, 'gold big', 1.8);
      scene.sfx.win();
      if (side === 1) scene.opp('win', 1.8);
      await scene.payout(side);
      cash[side] += bet;
    } else {
      scene.pop(side, 'tray', `没収　−${yen(bet)}`, 'red big', 1.8);
      scene.sfx.lose();
      if (side === 0) scene.shake(0.35); else scene.opp('lose', 2.2);
      await scene.lose(side);
      cash[side] -= bet;
    }
    hud.set(side, cash[side], debt[side]);
  };
  const jobs = [];
  if (D[me].bet > 0) jobs.push(settle(0, O.bet[me], D[me].bet, 0, 2.1));
  if (D[op].bet > 0) jobs.push(settle(1, O.bet[op], D[op].bet, 0.35, 2.35));
  await Promise.all(jobs);
  if (!m.alive) return;
  // debt attacks, ours first
  const attack = async (side, ok, x) => {
    const tgt = 1 - side;
    await banner(side === 0 ? '借金倍化アタック' : `${names[1]} のアタック`, 'red', `${side === 0 ? names[1] : 'あなた'}の借金 ${yen(x)} を倍に`, 0.9);
    await scene.spin(side, ok, { dur: 1.9 });
    if (!m.alive) return;
    if (ok) {
      debt[tgt] += x;
      scene.pop(tgt, 'iou', `借金 +${yen(x)}`, 'red big', 1.8);
      if (tgt === 1) scene.opp('shock', 1.4); else scene.shake(0.3);
      await scene.stamp(tgt, debt[tgt]);
    } else {
      debt[tgt] -= x; debt[side] += x;
      scene.pop(side, 'iou', `失敗… ${yen(x)} を肩代わり`, 'red', 2);
      if (side === 1) scene.opp('lose', 1.5);
      await scene.transfer(tgt, side, x, debt.slice());
    }
    scene.mark(tgt, false);
    hud.set(0, cash[0], debt[0]); hud.set(1, cash[1], debt[1]);
  };
  if (D[me].atk > 0) await attack(0, O.atk[me], D[me].atk);
  if (D[op].atk > 0 && m.alive) await attack(1, O.atk[op], D[op].atk);
  if (!m.alive) return;
  scene.mark(0, false); scene.mark(1, false);
  await Promise.all([scene.collect(0, E.piles(s1.P[me].cash)), scene.collect(1, E.piles(s1.P[op].cash))]);
  scene.setDebt(0, s1.P[me].debt, 0.3); scene.setDebt(1, s1.P[op].debt, 0.3);
  hud.set(0, s1.P[me].cash, s1.P[me].debt); hud.set(1, s1.P[op].cash, s1.P[op].debt);
  m.s = s1;
  await scene.wait(0.35);
}

async function presentOver(m, ev) {
  m.s = ev.s; m.over = true;
  panel.idle('');
  const r = ev.result, w = r.winner, me = m.mySeat;
  const kind = w < 0 ? 'draw' : w === me ? 'win' : 'lose';
  await scene.wait(0.5);
  if (kind === 'win') { scene.burst(0, 90); scene.sfx.win(); scene.opp('lose', 5); }
  else if (kind === 'lose') { scene.opp('win', 5); scene.sfx.lose(); }
  await banner(kind === 'win' ? '勝利' : kind === 'lose' ? '敗北' : '引き分け', kind === 'win' ? 'gold' : kind === 'lose' ? 'red' : '', '', 1.3);
  if (!m.alive) return;
  record(m, ev, kind);
  showResult(m, ev, kind);
}
function record(m, ev, kind) {
  const R = store.get('rec', { played: 0, win: 0, lose: 0, draw: 0, bestNet: -Infinity, bestCash: 0 });
  const p = ev.s.P[m.mySeat];
  R.played++; R[kind]++;
  R.bestNet = Math.max(R.bestNet == null ? -Infinity : R.bestNet, E.net(p));
  R.bestCash = Math.max(R.bestCash || 0, p.st.maxCash);
  store.set('rec', R);
}
function showResult(m, ev, kind) {
  const s = ev.s, me = s.P[m.mySeat], op = s.P[1 - m.mySeat];
  $('#resKicker').textContent = `${s.rounds} ROUNDS — FINAL`;
  const t = $('#resTitle');
  t.textContent = kind === 'win' ? '勝利' : kind === 'lose' ? '敗北' : '引き分け';
  t.className = kind;
  $('#resSub').textContent = `純資産　あなた ${yen(E.net(me))}　／　${op.nm} ${yen(E.net(op))}`;
  $('#lgMeNm').textContent = 'あなた'; $('#lgOpNm').textContent = op.nm;
  const rows = [
    ['所持金', yen(me.cash), yen(op.cash)],
    ['借金', yen(me.debt), yen(op.debt)],
    ['勝負（勝-負）', `${me.st.win}-${me.st.lose}`, `${op.st.win}-${op.st.lose}`],
    ['見送り', me.st.pass, op.st.pass],
    ['最大所持金', yen(me.st.maxCash), yen(op.st.maxCash)],
    ['借りた総額', yen(me.st.borrowed), yen(op.st.borrowed)],
    ['アタック 成功/失敗', `${me.st.atkOk}/${me.st.atkNg}`, `${op.st.atkOk}/${op.st.atkNg}`]
  ];
  $('#resStats').innerHTML = `<span></span><span class="h">あなた</span><span class="h">${escapeHtml(op.nm)}</span>` +
    rows.map((r) => `<span class="k">${r[0]}</span><span>${r[1]}</span><span>${r[2]}</span>`).join('');
  const again = $('#btnAgain');
  again.disabled = false;
  if (m.mode === 'guest') { again.textContent = 'ホストの再戦を待つ'; again.disabled = true; }
  else if (m.mode === 'host') { again.textContent = 'もう一度（同じ相手）'; again.disabled = !(lobby && lobby.guest); }
  else again.textContent = 'もう一度';
  $('#result').hidden = false;
  requestAnimationFrame(() => drawChart($('#chart'), s.hist, m.mySeat));
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function drawChart(cv, hist, me) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 500, h = cv.clientHeight || 180;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const nets = hist.map((r) => [r.cash[0] - r.debt[0], r.cash[1] - r.debt[1]]);
  const f = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v) / 100);   // symmetric log: debt and fortunes both fit
  let lo = 0, hi = f(1000);
  nets.forEach((n) => n.forEach((v) => { lo = Math.min(lo, f(v)); hi = Math.max(hi, f(v)); }));
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const L = 52, R = 12, Tp = 10, B = 22;
  const X = (i) => L + (w - L - R) * (i / Math.max(1, nets.length - 1));
  const Y = (v) => Tp + (h - Tp - B) * (1 - (f(v) - lo) / (hi - lo));
  x.font = '10px "Zen Kaku Gothic New",sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'right';
  const ticks = [0];
  for (const t of [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10]) { ticks.push(t, -t); }
  const lab = (v) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; if (a === 0) return '0'; if (a >= 1e8) return s + a / 1e8 + '億'; if (a >= 1e4) return s + a / 1e4 + '万'; return s + a / 1e3 + '千'; };
  for (const t of ticks) {
    const fy = f(t); if (fy < lo || fy > hi) continue;
    const y = Y(t);
    x.strokeStyle = t === 0 ? 'rgba(241,236,226,.35)' : 'rgba(241,236,226,.08)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(L, y); x.lineTo(w - R, y); x.stroke();
    x.fillStyle = 'rgba(241,236,226,.55)'; x.fillText(lab(t), L - 6, y);
  }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const every = Math.ceil(nets.length / 11);
  nets.forEach((_, i) => { if (i % every === 0 || i === nets.length - 1) x.fillText(i === 0 ? '開始' : String(i), X(i), h - 6); });
  const line = (seat, col, wd) => {
    x.strokeStyle = col; x.lineWidth = wd; x.lineJoin = 'round'; x.beginPath();
    nets.forEach((n, i) => { const px = X(i), py = Y(n[seat]); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
    x.fillStyle = col; nets.forEach((n, i) => { x.beginPath(); x.arc(X(i), Y(n[seat]), wd + 0.6, 0, Math.PI * 2); x.fill(); });
  };
  line(1 - me, '#8fb3ff', 2); line(me, '#e3b95e', 2.6);
  $('#lgMe').style.background = '#e3b95e'; $('#lgOp').style.background = '#8fb3ff';
}

/* ================================================================ online */
function netErr(e) {
  const c = e && e.code;
  if (c === 'lib') return '通信ライブラリを読み込めませんでした。通信状況を確認してください。';
  if (c === 'notfound') return 'その部屋が見つかりません。コードを確かめてください。';
  if (c === 'taken') return '部屋を作れませんでした。もう一度試してください。';
  return '接続できませんでした。少し待ってからもう一度試してください。';
}
function onlineErr(msg) { $('#onErr').textContent = msg || ''; }
function resetOnlineUI() {
  $('#lobbyBox').hidden = true; $('#btnHostStart').hidden = true; $('#onErr').textContent = '';
  $('#btnHost').disabled = false; $('#btnJoin').disabled = false;
  setTab(store.get('tab', 'host'));
  $$('#menuOnline .tabs button').forEach((b) => { b.disabled = false; });
}
function setTab(t) {
  $$('#menuOnline .tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
  $('#tabHost').hidden = t !== 'host'; $('#tabJoin').hidden = t !== 'join';
}
function rememberName() { const n = getName(); if (n) { prefs.name = n; store.set('name', n); } return n; }
function lobbyLocked() { $('#tabHost').hidden = true; $('#tabJoin').hidden = true; $$('#menuOnline .tabs button').forEach((b) => { b.disabled = true; }); $('#lobbyBox').hidden = false; }
async function hostRoom() {
  onlineErr('');
  const name = rememberName();
  if (!name) { onlineErr('名前を入れてください'); $('#nmInput').focus(); return; }
  $('#btnHost').disabled = true;
  const link = N.makeLink(NETKIND);
  let code = null, lastErr = null;
  for (let i = 0; i < 4 && !code; i++) {
    const c = N.makeCode();
    try { await link.host(c); code = c; } catch (e) { lastErr = e; if (e.code !== 'taken') break; }
  }
  if (!code) { $('#btnHost').disabled = false; onlineErr(netErr(lastErr)); return; }
  const L = lobby = { role: 'host', link, code, rounds: prefs.onRounds, guest: null };
  link.on('msg', (msg) => onHostMsg(L, msg));
  link.on('close', () => onPeerGone(L));
  lobbyLocked();
  $('#roomCode').textContent = code;
  $('#btnInvite').hidden = false;
  $('#lobbyStatus').textContent = '相手の参加を待っています…（このページを開いたままにしてください）';
}
function onHostMsg(L, msg) {
  if (lobby !== L) return;
  if (msg.k === 'hello') {
    if (msg.v !== N.PROTOCOL) { L.link.send({ k: 'old' }); return; }
    L.guest = { nm: N.cleanName(msg.nm) || 'ゲスト' };
    L.link.send({ k: 'lobby', host: getName(), rounds: L.rounds });
    $('#lobbyStatus').textContent = `${L.guest.nm} さんが入室しました`;
    $('#btnHostStart').hidden = false;
    if (match && match.lobby === L && match.over) $('#btnAgain').disabled = false;
    toast(`${L.guest.nm} さんが入室しました`);
  } else if (match && match.lobby === L && match.ref) {
    if (msg.k === 'borrow') match.ref.borrow(1, msg.amt);
    else if (msg.k === 'decide') match.ref.decide(1, { sel: msg.sel, atk: msg.atk });
  }
  if (msg.k === 'bye') onPeerGone(L);
}
function startHostMatch(L) {
  if (!L.guest) return;
  const s = E.newGame({ rounds: L.rounds, players: [{ id: 'h', nm: getName() || 'ホスト' }, { id: 'g', nm: L.guest.nm }] });
  const m = newMatch('host', { mySeat: 0, lobby: L, link: L.link });
  makeReferee(m, s);
  setMatch(m);
  m.ref.start();
}
async function joinRoom() {
  onlineErr('');
  const name = rememberName();
  if (!name) { onlineErr('名前を入れてください'); $('#nmInput').focus(); return; }
  const code = N.cleanCode($('#codeInput').value);
  if (code.length !== 4) { onlineErr('4文字の部屋コードを入れてください'); return; }
  $('#btnJoin').disabled = true;
  const link = N.makeLink(NETKIND);
  try { await link.join(code); } catch (e) { $('#btnJoin').disabled = false; onlineErr(netErr(e)); return; }
  const L = lobby = { role: 'guest', link, code };
  link.on('msg', (msg) => onGuestMsg(L, msg));
  link.on('close', () => onPeerGone(L));
  link.send({ k: 'hello', nm: name, v: N.PROTOCOL });
  lobbyLocked();
  $('#roomCode').textContent = code; $('#btnInvite').hidden = true;
  $('#lobbyStatus').textContent = '接続しました。ホストの開始を待っています…';
}
function onGuestMsg(L, msg) {
  if (lobby !== L) return;
  if (msg.k === 'full') { onlineErr('この部屋はもういっぱいです'); L.link.close(); lobby = null; resetOnlineUI(); return; }
  if (msg.k === 'old') { onlineErr('相手のページが古いようです。両方とも再読み込みしてください。'); return; }
  if (msg.k === 'lobby') { L.host = N.cleanName(msg.host); $('#lobbyStatus').textContent = `${L.host || 'ホスト'} さんの部屋（${msg.rounds}ラウンド）。開始を待っています…`; return; }
  if (msg.k === 'ev' && msg.ev) {
    if (msg.ev.t === 'start') setMatch(newMatch('guest', { mySeat: 1, lobby: L, link: L.link }));
    if (match && match.lobby === L) feed(match, msg.ev);
    return;
  }
  if (msg.k === 'bye') onPeerGone(L);
}
function onPeerGone(L) {
  if (lobby !== L || L.gone) return;
  const playing = match && match.lobby === L && match.alive && !match.over;
  if (L.role === 'host') {
    L.guest = null;
    if (playing) {
      dialog('相手との接続が切れました。', [['CPUと続ける', () => convertToCpu(match), 'gold'], ['タイトルへ', quitToTitle]]);
    } else {
      $('#lobbyStatus').textContent = '相手が退出しました。新しい相手を待っています…';
      $('#btnHostStart').hidden = true;
      if (match && match.over) { $('#btnAgain').disabled = true; toast('相手が退出しました'); }
    }
  } else {
    L.gone = true;
    if (playing) dialog('ホストとの接続が切れました。', [['タイトルへ', quitToTitle, 'gold']]);
    else if (match && match.lobby === L) toast('ホストとの接続が切れました');
    else { L.link.close(); lobby = null; resetOnlineUI(); onlineErr('ホストとの接続が切れました。もう一度コードを入れてください。'); }
  }
}
function convertToCpu(m) {
  if (!m || !m.alive) return;
  m.cpuSeat = 1 - m.mySeat; m.cpuType = 'calc'; m.link = null;
  $('#hudNm1').textContent = `${m.s.P[m.cpuSeat].nm}（CPU代打ち）`;
  cpuAct(m);
}

/* ================================================================ wiring */
function wire() {
  $('#btnCpu').onclick = () => showMenu('cpu');
  $('#btnOnline').onclick = () => openOnline();
  $('#btnRules').onclick = () => { $('#rules').hidden = false; };
  $('#btnRulesClose').onclick = () => { $('#rules').hidden = true; store.set('seenRules', true); };
  $('#rules').addEventListener('click', (e) => { if (e.target.id === 'rules') $('#rules').hidden = true; });
  $$('[data-back]').forEach((b) => { b.onclick = () => { if (lobby && !match) { lobby.link.close(); lobby = null; } resetOnlineUI(); showMenu('main'); }; });
  $$('#cpuRounds button').forEach((b) => { b.onclick = () => { prefs.rounds = Number(b.dataset.v); store.set('rounds', prefs.rounds); pressSeg('#cpuRounds', prefs.rounds); }; });
  $$('#onRounds button').forEach((b) => { b.onclick = () => { prefs.onRounds = Number(b.dataset.v); store.set('onRounds', prefs.onRounds); pressSeg('#onRounds', prefs.onRounds); }; });
  $$('#cpuOpp button').forEach((b) => { b.onclick = () => { prefs.opp = b.dataset.v; store.set('opp', prefs.opp); pressSeg('#cpuOpp', prefs.opp); }; });
  $('#btnCpuStart').onclick = () => { scene.sfx.unlock(); startCpu(); if (!store.get('seenRules', false)) toast('はじめての方は ? ボタンであそびかたを確認できます', 3600); };
  $$('#menuOnline .tabs button').forEach((b) => { b.onclick = () => { store.set('tab', b.dataset.tab); setTab(b.dataset.tab); onlineErr(''); }; });
  $('#btnHost').onclick = () => { scene.sfx.unlock(); hostRoom(); };
  $('#btnJoin').onclick = () => { scene.sfx.unlock(); joinRoom(); };
  $('#codeInput').addEventListener('input', (e) => { e.target.value = N.cleanCode(e.target.value); });
  $('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('#btnHostStart').onclick = () => { if (lobby && lobby.role === 'host') startHostMatch(lobby); };
  $('#btnInvite').onclick = async () => {
    if (!lobby) return;
    const url = location.origin + location.pathname + '?room=' + lobby.code;
    try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました'); } catch (e) { toast(url, 6000); }
  };
  // panel
  $('#betRange').addEventListener('input', (e) => { if (panel.mode === 'decide') panel.setCount(Number(e.target.value)); });
  $('#betMinus').onclick = () => { if (panel.mode === 'decide') panel.setCount(panel.sel.size - 1); };
  $('#betPlus').onclick = () => { if (panel.mode === 'decide') panel.setCount(panel.sel.size + 1); };
  $$('#secBet .quick button').forEach((b) => { b.onclick = () => { if (panel.mode === 'decide') panel.setCount(Number(b.dataset.k)); }; });
  $('#atkRange').addEventListener('input', (e) => { if (panel.mode === 'decide') { panel.atkJ = Number(e.target.value); panel.render(); } });
  $('#borrowRange').addEventListener('input', () => panel.renderBorrow());
  $('#btnBorrow').onclick = () => panel.borrow(true);
  $('#btnNoBorrow').onclick = () => panel.borrow(false);
  $('#btnGo').onclick = () => panel.go();
  // tools
  const paintTools = () => {
    $('#btnSound').setAttribute('aria-pressed', String(prefs.sound));
    $('#btnSpeed .lbl').textContent = '×' + prefs.speed;
  };
  $('#btnSound').onclick = () => { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); scene.sfx.unlock(); scene.sfx.setEnabled(prefs.sound); paintTools(); };
  $('#btnSpeed').onclick = () => { prefs.speed = prefs.speed >= 2 ? 1 : 2; store.set('speed', prefs.speed); scene.setSpeed(prefs.speed); paintTools(); toast(prefs.speed > 1 ? '演出を速くしました' : '演出を元の速さにしました', 1400); };
  $('#btnHelp').onclick = () => { $('#rules').hidden = false; };
  $('#btnQuit').onclick = () => dialog(match && match.mode !== 'cpu' && !match.over ? 'ゲームをやめてタイトルに戻りますか？（相手との接続も切れます）' : 'ゲームをやめてタイトルに戻りますか？', [['やめる', quitToTitle, 'red'], ['続ける', null]]);
  $('#btnAgain').onclick = () => {
    if (!match) return;
    if (match.mode === 'cpu') startCpu();
    else if (match.mode === 'host' && lobby && lobby.guest) startHostMatch(lobby);
  };
  $('#btnToTitle').onclick = quitToTitle;
  paintTools();
  pressSeg('#cpuRounds', prefs.rounds); pressSeg('#onRounds', prefs.onRounds); pressSeg('#cpuOpp', prefs.opp);
  $('#nmInput').value = prefs.name;
  // keyboard (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
    if (panel.mode === 'decide') {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { panel.setCount(panel.sel.size + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { panel.setCount(panel.sel.size - 1); e.preventDefault(); }
      else if (e.key === 'Enter') { panel.go(); e.preventDefault(); }
    }
    if (e.key === 'Escape') { $('#rules').hidden = true; }
  });
  document.addEventListener('pointerdown', () => { if (scene) scene.sfx.unlock(); }, { capture: true });
}
function openOnline(tab) {
  showMenu('online');
  resetOnlineUI();
  if (tab) setTab(tab);
  if (lobby) lobbyLocked();
}

async function boot() {
  wire();
  try { await Promise.race([document.fonts.load('400 100px "Dela Gothic One"'), new Promise((r) => setTimeout(r, 1800))]); } catch (e) { /* fonts are optional */ }
  try {
    scene = await createScene($('#view'), { maxDt: TEST ? 0.5 : 0.1 });
  } catch (e) {
    console.error(e);
    $('#loader').classList.add('err');
    $('#loaderMsg').textContent = '3D表示を準備できませんでした。通信状況を確認して、ページを再読み込みしてください。';
    return;
  }
  scene.setSpeed(prefs.speed);
  scene.sfx.setEnabled(prefs.sound);
  scene.onTap = onPileTap;
  panel.idle('');
  $('#loader').hidden = true;
  showTitle('main');
  const room = N.cleanCode(params.get('room'));
  if (room) { openOnline('join'); $('#codeInput').value = room; }
  if (TEST) window.__eighty = { scene, E, panel, get match() { return match; }, get lobby() { return lobby; }, setRolls(a) { window.__eightyRolls = a.slice(); } };
}
boot();

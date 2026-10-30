/* シェディー・レディー — the page: title and setup screens, the table overlay (name tags, the dock with the
   actions, the reveal panel), the turn flow with CPU turns, animations, saving, and online play: the host's
   browser runs the game and the CPUs; guests send their moves and get back only what their seat may see. */
import { loadThree, createScene } from './scene.js?v=20261030b';

const E = window.SL_ENG, AI = window.SL_AI, NET = window.SL_NET, CARDS = window.SL_CARDS;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CPU_NAMES = ['ローズ', 'ジン', 'カシス', 'ミント', 'オリーブ', 'ルビー', 'ベルベット'];
const SEAT_COLORS = ['#e2c06f', '#ff7ad9', '#55b6ff', '#35e0c2', '#ff9f43', '#ad8dff'];
const LEVEL_NAME = AI.LEVEL_NAME;
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';

/* ------------------------------------------------------------------ storage and settings */
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const saved = store.get('shadylady.settings') || {};
const settings = Object.assign({ sound: true, speed: 'normal', name: '', order: 'pick' }, saved);
settings.solo = Object.assign({ n: 4, level: 2, first: 'random', target: 3, handSize: 3 }, saved.solo || {});
settings.lobby = Object.assign({ level: 2, target: 3, handSize: 3 }, saved.lobby || {});
function saveSettings() { store.set('shadylady.settings', settings); }
const SPEED = { slow: 1.6, normal: 1, fast: 0.55 };
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
    noise = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  function hiss(freq, dur, gain, q, delay, type) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf(c); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
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
    click() { hiss(2600, 0.04, 0.12, 5); },
    slide() { hiss(3200, 0.16, 0.18, 0.8, 0, 'highpass'); },
    place() { hiss(900, 0.07, 0.4, 5); hiss(1700, 0.05, 0.16, 6, 0.02); },
    chip() { tone(2093, 0.18, 0.07, 'triangle'); tone(2637, 0.22, 0.05, 'triangle', 0.05); tone(3136, 0.3, 0.03, 'sine', 0.1); },
    turn() { tone(659, 0.16, 0.06, 'sine'); tone(988, 0.24, 0.06, 'sine', 0.1); },
    trycall() { [392, 523, 659].forEach((f, i) => tone(f, 0.32, 0.08, 'triangle', i * 0.08)); },
    reveal() { hiss(1800, 0.25, 0.2, 0.7, 0, 'highpass'); tone(784, 0.3, 0.05, 'sine', 0.05); },
    jack() { tone(110, 0.5, 0.16, 'sawtooth', 0, 70); hiss(300, 0.3, 0.3, 1.2); tone(220, 0.4, 0.06, 'square', 0.12, 440); },
    good() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.38, 0.08, 'triangle', i * 0.09)); },
    bad() { tone(330, 0.3, 0.09, 'sine', 0, 260); tone(247, 0.45, 0.09, 'sine', 0.18, 196); },
    pass() { tone(440, 0.12, 0.04, 'sine'); },
    shuffle() { for (let i = 0; i < 6; i++) hiss(2500 + i * 200, 0.08, 0.12, 1.5, i * 0.05, 'highpass'); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.55, 0.09, 'triangle', i * 0.12)); },
    lose() { [440, 392, 330, 262].forEach((f, i) => tone(f, 0.5, 0.07, 'sine', i * 0.16)); }
  };
})();
function sfx(name) { if (settings.sound && !TEST) { try { SFX[name](); } catch (e) { /* audio blocked */ } } }

/* ------------------------------------------------------------------ small UI helpers */
let bannerTimer = 0;
function banner(html, hold) {
  const b = $('#banner'); b.innerHTML = html; b.classList.add('on');
  clearTimeout(bannerTimer);
  if (!hold) bannerTimer = setTimeout(() => b.classList.remove('on'), 1800 * Math.max(0.75, spd()));
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
const cardImg = (n, cls) => `<img class="mini ${cls || ''}" src="${CARDS.faceURL(n, 120)}" alt="${n}" draggable="false">`;
const setLabel = (c) => (c ? `<span class="set ${c.k}">${esc(E.comboName(c))}</span>` : '<span class="set none">役なし</span>');

/* ------------------------------------------------------------------ session state */
let scene = null;
let S = null;     // { kind: 'solo'|'host'|'guest', st (solo/host), me, cfg, log, rnd, cids, online, status }
let V = null;     // what my seat may see
const U = { sel: null, jack: false, jackPick: null, rev: [], acts: {}, wait: false };
let busy = false;
let L = null;     // online: { role, link, code, players, me, level, target }
let chain = Promise.resolve();          // guests: presentations in order
let hostChain = Promise.resolve();      // solo/host: every change to the game in order

const pname = (p) => (V && V.players[p] ? V.players[p].name : '?');
const pcol = (p) => SEAT_COLORS[p % SEAT_COLORS.length];
const who = (p) => `<b class="who" style="--c:${pcol(p)}">${esc(p === (S && S.me) ? 'あなた' : pname(p))}</b>`;
const isHostish = () => S && (S.kind === 'solo' || S.kind === 'host');
function canAct() { return !!(S && V && !busy && !U.wait && V.phase !== 'over' && V.waiting.indexOf(V.me) >= 0); }
function logLine(html) {
  if (!S) return;
  S.log.unshift({ t: V ? V.turnNo : 0, html });
  if (S.log.length > 200) S.log.length = 200;
  if ($('#logList')) renderLog();
}
function setAct(p, text) { U.acts[p] = text; renderTags(); }
function setStatus(p, text) {
  if (!S) return;
  S.status = text ? { p, text } : null;
  if (S.kind === 'host') broadcast({ k: 'status', p, text });
  renderTags();
}

/* ------------------------------------------------------------------ presenting what happened */
async function present(evs, view) {
  const sess = S;
  busy = true;
  renderAct();
  try {
    const mem = {};
    for (const e of evs) { if (S !== sess) break; await showEvent(e, mem); }
  } catch (err) { console.error(err); }
  if (S !== sess) return;          // the game was left (or a new one started) while this was being shown
  V = view;
  // the table is laid out from the view whenever the animated steps and the view disagree
  if (scene && !tableMatches(V)) scene.sync(V);
  busy = false;
  if (V.phase !== 'try' && V.phase !== 'order') { U.rev = []; renderReveal(); }
  renderAll();
  if (V.phase === 'over') finishGame();
}
function tableMatches(v) {
  const c = scene.counts();
  if (c.deck !== v.deck) return false;
  for (let s = 0; s < v.n; s++) {
    const P = v.players[s], T = c.seats[s];
    if (!T || T.chips !== P.pts || T.pile.join() !== P.pile.join()) return false;
    if (s !== v.me && T.hand !== P.count) return false;
  }
  const mine = (v.players[v.me].hand || []).map((h) => h.id).sort().join();
  return c.mine.slice().sort().join() === mine;
}
async function showEvent(e, mem) {
  const k = spd();
  switch (e.t) {
    case 'draw':
      sfx('slide');
      mem[e.p] = { src: -1 };
      setAct(e.p, '山札から1枚');
      await scene.draw(e.p, e.priv ? { id: e.priv.id, n: e.priv.n } : null);
      break;
    case 'take':
      sfx('slide');
      mem[e.p] = { src: e.from, n: e.n };
      setAct(e.p, `${e.from === e.p ? '自分' : esc(short(e.from))}の${e.n}を取った`);
      await scene.take(e.p, e.from, e.n, e.priv ? e.priv.id : null);
      break;
    case 'discard': {
      sfx('place');
      const m = mem[e.p] || {};
      await scene.discard(e.p, e.n, e.priv ? e.priv.id : null);
      const how = m.src >= 0 ? `${m.src === e.p ? '自分' : who(m.src)}の捨て札から <b class="num">${m.n}</b> を取り` : '山札から引いて';
      logLine(`${who(e.p)}は${how}、<b class="num">${e.n}</b> を捨てた`);
      setAct(e.p, (m.src >= 0 ? `${m.src === e.p ? '自分' : esc(short(m.src))}の${m.n}を取り` : '山札から引き') + ` → ${e.n}を捨て`);
      await sleep(120 * k);
      break;
    }
    case 'turn':
      U.jack = false; U.sel = null;
      scene.setTurn(e.p);
      if (S && e.p === S.me) { sfx('turn'); banner('あなたの番'); }
      break;
    case 'try':
      sfx('trycall');
      U.rev = [{ p: e.p, ns: e.hand, c: e.c }];
      banner(`${who(e.p)}が<b class="kw try">トライ！</b>`, true);
      setAct(e.p, 'トライ！');
      await sleep(500 * k);
      sfx('reveal');
      await scene.reveal(e.p, e.hand);
      renderReveal();
      banner(`${who(e.p)}のトライ：${setLabel(e.c)}`, true);
      logLine(`${who(e.p)}が<b class="kw try">トライ</b>：${setLabel(e.c)}`);
      await sleep(900 * k);
      break;
    case 'respond':
      if (e.reveal) {
        sfx('reveal');
        U.rev.push({ p: e.p, ns: e.hand, c: e.c });
        await scene.reveal(e.p, e.hand);
        renderReveal();
        banner(`${who(e.p)}がもっと強い役を公開！ ${setLabel(e.c)}`, true);
        setAct(e.p, '公開！');
        logLine(`${who(e.p)}が公開：${setLabel(e.c)}`);
        await sleep(1000 * k);
      } else {
        sfx('pass');
        setAct(e.p, 'パス');
        await sleep(260 * k);
      }
      break;
    case 'tryEnd': {
      const best = U.rev.find((r) => r.p === e.winner);
      U.rev.forEach((r) => { r.win = r.p === e.winner; });
      renderReveal();
      banner(`${who(e.winner)}の${best ? setLabel(best.c) : '役'}が一番強い！ <b class="plus">+1点</b>`, true);
      logLine(`トライの勝者：${who(e.winner)}（+1点）`);
      if (S && e.winner === S.me) sfx('good'); else if (S && e.by === S.me) sfx('bad');
      await sleep(700 * k);
      break;
    }
    case 'point':
      sfx('chip');
      await scene.point(e.p);
      renderTags();
      await sleep(250 * k);
      break;
    case 'jack': {
      sfx('jack');
      banner(`${who(e.p)}が ${who(e.target)} に<b class="kw jack">ジャック！</b>`, true);
      setAct(e.p, `${esc(short(e.target))}にジャック！`);
      await sleep(1000 * k);
      sfx('reveal');
      U.rev = [{ p: e.target, ns: e.hand, c: e.c, jack: true, win: !e.ok }];
      await scene.reveal(e.target, e.hand);
      renderReveal();
      if (e.ok) banner(`${who(e.target)}は ${setLabel(e.c)}！ ジャック成功、${who(e.p)}に<b class="plus">+1点</b>`, true);
      else banner(`${who(e.target)}は役なし。ジャック失敗、${who(e.target)}に<b class="plus">+1点</b>`, true);
      logLine(`${who(e.p)}が${who(e.target)}にジャック → ${e.ok ? '成功（' + setLabel(e.c) + '）' : '失敗（役なし）'}`);
      if (S && (e.ok ? e.p : e.target) === S.me) sfx('good'); else if (S && (e.p === S.me || e.target === S.me)) sfx('bad');
      await sleep(1300 * k);
      break;
    }
    case 'ordered':
      setAct(e.p, '捨て札に置く順番を決めた');
      break;
    case 'shed':
      hideBanner();
      U.rev = U.rev.filter((r) => r.p !== e.p);
      renderReveal();
      sfx('place');
      await scene.shed(e.p, e.ns, e.priv ? e.priv.ids : null);
      break;
    case 'refill':
      setAct(e.p, `新しく${V.handSize || 3}枚引いた`);
      await scene.refill(e.p, e.priv ? e.priv.ids.map((id, i) => ({ id, n: e.priv.ns[i] })) : null, V.handSize || 3);

      break;
    case 'reshuffle':
      sfx('shuffle');
      banner('山札がなくなりました。捨て札を一番上だけ残して切り直します', true);
      logLine('山札を作り直した（各捨て札は一番上だけ残る）');
      await scene.reshuffle(e.deck);
      hideBanner();
      break;
    case 'over':
      break;
  }
}
function short(p) { const n = pname(p); return p === (S && S.me) ? 'あなた' : n.length > 5 ? n.slice(0, 5) : n; }

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
function thinkTime(phase) { return ({ turn: 900, discard: 520, try: 650, order: 350 })[phase] || 600; }
async function pumpNow() {
  while (S && isHostish()) {
    const st = S.st;
    if (st.phase === 'over') break;
    const w = E.waitingFor(st), cpu = w.find((p) => st.players[p].kind === 'cpu');
    if (cpu === undefined) { renderAll(); break; }
    setStatus(cpu, 'think');
    await sleep(thinkTime(st.phase) * spd() * (0.75 + Math.random() * 0.5));
    if (!S || S.st !== st) break;
    const act = AI.decide(E.viewFor(st, cpu), st.players[cpu].level || 2, S.rnd);
    setStatus(cpu, null);
    if (!act) break;
    const ok = await commitNow(cpu, act);
    if (!ok) { console.error('CPU move refused', act); break; }
  }
}
function errText(err) { return ({ turn: '今はその操作はできません', noset: '役がそろっていません', weak: 'もっと強い役でないと公開できません', bad: 'その操作はできません', empty: '山札がありません' })[err] || 'その操作はできません'; }

/* my move: run here (solo/host) or send to the host (guest) */
function submit(act) {
  if (!canAct()) return;
  sfx('click');
  U.sel = null; U.jack = false;
  U.wait = true; renderAct();       // one move at a time, even with a double tap
  if (S.kind === 'guest') {
    if (L) L.link.send({ k: 'act', act, mv: V.moves });
    return;
  }
  hostDo(async () => { const ok = await commitNow(S.me, act); if (!ok) renderAll(); await pumpNow(); });
}

/* ------------------------------------------------------------------ rendering */
function renderAll() { renderTop(); renderTags(); renderAct(); renderPickable(); }
function renderTop() {
  if (!V) return;
  const tc = $('#turnChip');
  if (V.phase === 'over') { tc.textContent = `${V.winner === V.me ? 'あなた' : pname(V.winner)}の勝ち`; tc.className = 'chip'; }
  else if (V.phase === 'try') { tc.innerHTML = `トライ中：${esc(V.tr.by === V.me ? 'あなた' : pname(V.tr.by))}`; tc.className = 'chip hot'; }
  else if (V.phase === 'order') { tc.textContent = '捨て札に置く順番'; tc.className = 'chip'; }
  else { const mine = V.turn === V.me; tc.textContent = mine ? 'あなたの番' : `${pname(V.turn)}の番`; tc.className = 'chip' + (mine ? ' mine' : ''); }
  $('#targetChip').textContent = `${V.handSize || 3}枚版・${V.target}点先取`;
}
function ptsHtml(p) {
  const P = V.players[p], out = [];
  for (let i = 0; i < V.target; i++) out.push(`<i class="pt${i < P.pts ? ' on' : ''}"></i>`);
  return out.join('');
}
function renderTags() {
  if (!V) return;
  const box = $('#tags');
  if (box.childElementCount !== V.n) {
    box.innerHTML = V.players.map((P, s) => `<div class="tag${s === V.me ? ' me' : ''}" data-seat="${s}" style="--c:${pcol(s)}"><div class="tn"><b></b><span class="lv"></span><span class="tp"></span></div><div class="ta"></div><button class="tj" type="button" data-jack="${s}" tabindex="-1">ジャック</button></div>`).join('');
    box.onclick = (ev) => { const t = ev.target.closest('.tag'); if (t) onTagTap(+t.dataset.seat); };
  }
  V.players.forEach((P, s) => {
    const el = box.children[s];
    const offline = S && S.kind === 'host' && S.online && S.cids && S.cids[s] && !S.online[s];
    el.querySelector('.tn b').textContent = s === V.me ? 'あなた' : P.name;
    el.querySelector('.lv').textContent = P.kind === 'cpu' ? 'CPU' : (s === V.me ? '' : offline ? '接続待ち' : '');
    el.querySelector('.tp').innerHTML = ptsHtml(s);
    const thinking = S && S.status && S.status.p === s && S.status.text === 'think';
    let act = U.acts[s] || '';
    if (thinking) act = '考え中…';
    if (V.phase === 'try' && V.tr && V.tr.q[0] === s) act = thinking ? '考え中…' : '公開するか考え中…';
    if (V.phase === 'order' && V.ord && V.ord.pend.indexOf(s) >= 0 && V.ord.done.indexOf(s) < 0) act = '置く順番を考え中…';
    el.querySelector('.ta').textContent = act;
    const turn = V.phase !== 'over' && V.waiting.indexOf(s) >= 0;
    el.classList.toggle('turn', turn);
    el.classList.toggle('target', U.jack && s !== V.me && canAct());
    el.classList.toggle('picked', U.jackPick === s);
    el.classList.toggle('lead', P.pts === V.target - 1);
  });
}
function placeTags(a) {
  if (!V) return;
  const box = $('#tags'), W = box.clientWidth, H = box.clientHeight;
  const topMin = ($('#topbar').getBoundingClientRect().bottom || 50) + 4;
  [...box.children].forEach((el, s) => {
    const p = a[s] && a[s].tag;
    if (!p) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = p.x - w / 2, y = s === V.me ? p.y - h / 2 : p.y;
    x = Math.max(6, Math.min(W - w - 6, x));
    y = Math.max(topMin, Math.min(H - h - 6, y));
    el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  });
  const dc = $('#deckChip');
  if (a.deck && V) {
    dc.textContent = `山札 ${V.deck}`;
    dc.style.transform = `translate(${Math.round(a.deck.x - dc.offsetWidth / 2)}px,${Math.round(a.deck.y + 30)}px)`;
  }
}
function renderPickable() {
  if (!scene || !V) return;
  const myTurn = canAct() && V.phase === 'turn' && !U.jack;
  scene.setPickable({ deck: myTurn, piles: myTurn ? E.takeable(V) : [], hand: canAct() && V.phase === 'discard' });
}
function myCombo() { return V && E.myNums(V).length === (V.handSize || 3) ? E.combo(E.myNums(V)) : null; }
function renderAct() {
  const dock = $('#dock'), hint = $('#hint');
  if (!V || !S) { dock.innerHTML = ''; return; }
  const c = myCombo(), mineLine = `<div class="mine"><span class="mpts" title="あなたの点数">${ptsHtml(V.me)}</span>${setLabel(c)}</div>`;
  let html = '', h = '';
  if (V.phase === 'over') {
    html = `<div class="acts"><button class="btn primary" data-act="end">結果を見る</button></div>`;
  } else if (busy) {
    html = '';
  } else if (U.wait) {
    h = '進行役に送信中…';
  } else if (V.waiting.indexOf(V.me) < 0) {
    if (V.phase === 'try') h = `トライの勝負中…`;
    else if (V.phase === 'order') h = '公開した人が捨て札に置く順番を決めています';
    else h = `${esc(pname(V.turn))}の番です`;
  } else if (V.phase === 'turn') {
    if (U.jack) {
      h = U.jackPick != null ? `${esc(pname(U.jackPick))}にジャックしますか？` : 'ジャックする相手の名前をタップ';
      html = `<div class="acts">${U.jackPick != null ? `<button class="btn jack" data-act="jackGo">ジャック！</button>` : ''}<button class="btn ghost" data-act="jackCancel">やめる</button></div>`;
    } else {
      h = c ? '役がそろっています。トライするか、カードを取って続けるか' : '山札か、だれかの捨て札の一番上をタップして1枚取る';
      html = `<div class="acts"><button class="btn try" data-act="try"${c ? '' : ' disabled'}>トライ${c ? '' : '<small>役が必要</small>'}</button><button class="btn jack" data-act="jack">ジャック</button></div>`;
    }
  } else if (V.phase === 'discard') {
    h = U.sel != null ? 'もう一度タップするか「捨てる」で決定' : '捨てるカードをタップ（水色の光が今取ったカード）';
    html = `<div class="acts"><button class="btn primary" data-act="discard"${U.sel != null ? '' : ' disabled'}>捨てる</button></div>`;
  } else if (V.phase === 'try') {
    const best = V.tr.best, bc = U.rev.find((r) => r.p === best);
    if (E.canBeat(V)) {
      h = `${esc(best === V.me ? 'あなた' : pname(best))}の${bc ? esc(E.comboName(bc.c)) : '役'}より、あなたの${esc(E.comboName(c))}が強い`;
      html = `<div class="acts"><button class="btn try" data-act="reveal">公開して勝負</button><button class="btn ghost" data-act="pass">パス</button></div>`;
    } else {
      h = c ? '同じ強さ以下の役では勝負できません。「パス」で進みます' : '役がないため勝負できません。「パス」で進みます';
      html = '<div class="acts"><button class="btn try" disabled>公開して勝負<small>より強い役が必要</small></button><button class="btn ghost" data-act="pass">パス</button></div>';
    }
  } else if (V.phase === 'order') {
    h = '公開したカードを捨て札に置く順番を決めてください';
    html = `<div class="acts"><button class="btn primary" data-act="order">順番を決める</button></div>`;
  }
  dock.innerHTML = mineLine + html;
  hint.innerHTML = h; hint.hidden = !h;
  renderPickable();
  if (V.phase === 'order' && E.mustOrder(V) && canAct()) maybeOrder();
}
let orderOpen = null;
function maybeOrder() {
  const key = 'o' + V.turnNo;      // the turn number stays the same for the whole ordering
  if (orderOpen === key) return;
  orderOpen = key;
  if (settings.order === 'auto') { setTimeout(() => { if (V && E.mustOrder(V) && canAct()) submit(AI.decideOrder(V, 2, Math.random)); }, 300 * spd()); return; }
  openOrder();
}
function openOrder() {
  if (!V || !E.mustOrder(V)) return;
  closeSheets('order');
  const hand = V.players[V.me].hand.slice();
  const nx = (V.ord.by + 1) % V.n;
  const chosen = [];
  const d = sheet(`<h2>捨て札に置く順番</h2>
    <p class="note">公開したカードは、あなたの捨て札に置きます。<b>一番上のカードは次の人が取れます</b>（次の手番は${esc(nx === V.me ? 'あなた' : pname(nx))}）。上に置くカードから順にタップしてください。</p>
    <div class="order-row">${hand.map((c) => `<button class="ocard" data-a="pick" data-id="${c.id}">${cardImg(c.n, 'big')}<span class="ob"></span></button>`).join('')}</div>
    <div class="menu-actions"><button class="btn" data-a="auto">おまかせ</button></div>
    <label class="check"><input type="checkbox" id="orderAuto"> 次からはおまかせにする</label>`,
  { modal: true, noClose: true, cls: 'order', onAction(a, b, close) {
    const keep = () => { if ($('#orderAuto') && $('#orderAuto').checked) { settings.order = 'auto'; saveSettings(); } };
    if (a === 'auto') { keep(); close(); submit(AI.decideOrder(V, 2, Math.random)); return; }
    if (a === 'pick') {
      const id = +b.dataset.id;
      if (chosen.indexOf(id) >= 0) return;
      chosen.push(id); sfx('click');
      b.classList.add('on'); b.querySelector('.ob').textContent = chosen.length === 1 ? '一番上' : chosen.length + '番目';
      if (chosen.length === hand.length - 1) {
        const rest = hand.find((c) => chosen.indexOf(c.id) < 0);
        chosen.push(rest.id);
        const el = d.el.querySelector(`[data-id="${rest.id}"]`); el.classList.add('on'); el.querySelector('.ob').textContent = '一番下';
        keep();
        setTimeout(() => { close(); submit({ t: 'order', cards: chosen.slice() }); }, 380);
      }
    }
  } });
}
function renderReveal() {
  const box = $('#reveal');
  if (!U.rev.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = U.rev.map((r) => `<div class="rrow${r.win ? ' win' : ''}${r.jack ? ' jack' : ''}"><span class="rn" style="--c:${pcol(r.p)}">${esc(r.p === V.me ? 'あなた' : pname(r.p))}</span><span class="rc">${r.ns.slice().sort((a, b) => a - b).map((n) => cardImg(n)).join('')}</span>${setLabel(r.c)}</div>`).join('');
}
function renderLog() {
  const el = $('#logList');
  if (el) el.innerHTML = (S ? S.log : []).slice(0, 120).map((l) => `<li><span class="t">${l.t}</span><span>${l.html}</span></li>`).join('');
}

/* ------------------------------------------------------------------ input */
function onPick(hit) {
  if (!canAct() || !hit) return;
  if (V.phase === 'turn' && !U.jack) {
    if (hit.kind === 'deck') submit({ t: 'draw' });
    else if (hit.kind === 'pile' && V.players[hit.seat].pile.length) submit({ t: 'take', from: hit.seat });
    return;
  }
  if (V.phase === 'discard' && hit.kind === 'hand') {
    if (U.sel === hit.id) { submit({ t: 'discard', card: hit.id }); return; }
    U.sel = hit.id; sfx('click');
    scene.setSelected(hit.id);
    renderAct();
  }
}
function onTagTap(s) {
  if (!V) return;
  if (U.jack && canAct() && s !== V.me) { U.jackPick = s; sfx('click'); renderTags(); renderAct(); return; }
  openSeat(s);
}
function openSeat(s) {
  const P = V.players[s];
  const hist = P.hist.slice(-6).reverse().map((h) => `<li>${h.src >= 0 ? `${esc(h.src === s ? '自分' : pname(h.src))}の捨て札から <b class="num">${h.n}</b> を取り` : '山札から引き'}、<b class="num">${h.d}</b> を捨てた</li>`).join('');
  sheet(`<h2>${esc(s === V.me ? 'あなた' : P.name)}</h2>
    <p>${P.kind === 'cpu' ? 'CPU（' + esc(LEVEL_NAME[P.level] || '') + '）・' : ''}${P.pts}点</p>
    <h3>捨て札（上から）</h3><div class="pile-row">${P.pile.slice().reverse().map((n) => cardImg(n)).join('') || '<span class="note">まだありません</span>'}</div>
    ${P.known.length ? `<p class="note">手札にあるとわかっているカード：${P.known.map((n) => `<b class="num">${n}</b>`).join(' ')}（捨て札から取ったもの）</p>` : ''}
    ${hist ? `<h3>新しい手札になってからの動き</h3><ul class="hist">${hist}</ul>` : ''}`);
}
function onDock(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'end') { finishGame(true); return; }
  if (!canAct()) return;
  if (a === 'try') submit({ t: 'try' });
  else if (a === 'jack') { U.jack = true; U.jackPick = null; sfx('click'); renderAll(); }
  else if (a === 'jackCancel') { U.jack = false; U.jackPick = null; renderAll(); }
  else if (a === 'jackGo' && U.jackPick != null) { const t = U.jackPick; U.jackPick = null; submit({ t: 'jack', target: t }); }
  else if (a === 'discard' && U.sel != null) submit({ t: 'discard', card: U.sel });
  else if (a === 'reveal') submit({ t: 'respond', reveal: true });
  else if (a === 'pass') submit({ t: 'respond', reveal: false });
  else if (a === 'order') { orderOpen = null; openOrder(); }
}

/* ------------------------------------------------------------------ menu, rules, log, end */
function openMenu() {
  const seg = (name, cur, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const d = sheet(`<h2>メニュー</h2>
    <div class="field"><span>速さ</span>${seg('speed', settings.speed, [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'はやい']])}</div>
    <div class="field"><span>公開したカードを捨てる順番</span>${seg('order', settings.order, [['pick', '自分で選ぶ'], ['auto', 'おまかせ']])}</div>
    <div class="menu-actions col"><button class="btn" data-a="rules">ルール</button><button class="btn" data-a="log">記録</button><button class="btn ghost" data-a="quit">タイトルへもどる</button></div>`,
  { onAction(a, b, close) {
    if (a === 'rules') { close(); openRules(); }
    else if (a === 'log') { close(); openLog(); }
    else if (a === 'quit') { close(); confirmQuit(); }
  } });
  d.el.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const g = b.parentElement.dataset.seg;
    settings[g] = b.dataset.v; saveSettings();
    $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
    if (g === 'speed' && scene) scene.setSpeed(spd());
  });
}
function openRules() {
  const size = V ? (V.handSize || 3) : (settings.solo.handSize || 3);
  sheet(`<h2>ルール</h2>
  <div class="rules">
  <p><b>先に3点</b>取った人の勝ち（設定で4点・5点にもできます）。</p>
  <h3>カード</h3><p>1〜4と6〜9が各10枚、全80枚。<b>5はありません</b>。手札は<b>${size}枚</b>です。${size === 4 ? '4枚版はこのアプリ独自の追加ルールです。' : '3枚版は原作ルールです。'}</p>
  <h3>役</h3><p><b>ゾロ目</b>（同じ数字${size}枚）と<b>連番</b>（続いた数字${size}枚）。5がないので連番は ${size === 4 ? '1-2-3-4・6-7-8-9 の2つだけ。4枚すべてで役を作ります（3枚だけでは役になりません）。' : '1-2-3・2-3-4・6-7-8・7-8-9 の4つだけ。'}<br>ゾロ目はどの連番より強く、同じ種類なら数字が大きいほうが強い。</p>
  <div class="ladder">${E.setsFor(size).map((c) => `<span class="set ${c.k}">${esc(c.nums.join(''))}</span>`).join('<i>＜</i>')}</div>
  <h3>手番（時計回り）</h3><p>次のどれか1つをします。</p>
  <ul>
  <li><b>引く</b>：山札から1枚引き、手札から1枚を自分の捨て札に捨てる。</li>
  <li><b>取る</b>：だれかの捨て札（自分のも可）の一番上を取り、1枚捨てる。何を取ったかはみんなに見えます。</li>
  <li><b>トライ</b>（役があるとき）：手札を見せる。時計回りに、ほかの人はもっと強い役なら見せてもよい。<b>一番強い役の人が1点</b>。見せた人は全員、そのカードを好きな順で自分の捨て札に置き、新しく${size}枚引く。</li>
  <li><b>ジャック</b>：1人を指名して手札を見せてもらう。<b>役があれば自分が1点</b>、<b>なければ指名した人が1点</b>。指名された人は好きな順で捨て、新しく${size}枚引く。</li>
  </ul>
  <p>トライへの応答は<b>より強い役があるときだけ勝負できます</b>。役なし・同じ強さ以下ではパスのみです。強い役があってもパスできます。</p><p>トライやジャックのあとは、それをした人の次の人の番です。</p>
  <h3>山札がなくなったら</h3><p>みんなの捨て札を一番上の1枚だけ残して集め、切って新しい山札にします。</p>
  <h3>このアプリでは</h3><p>捨て札は上の5枚が見えるようにずらして置いています。名前をタップすると、その人の捨て札と最近の動きが見られます。</p>
  <p class="note">ボードゲーム「シェディー・レディー」（ゲームデザイン：宮野華也）のルールで遊べる、個人で遊ぶための非公式版です。画面とカードのデザインはこのアプリ用です。</p>
  </div>`);
}
function openLog() {
  sheet(`<h2>記録</h2><ul class="log" id="logList"></ul>`, { onClose() {} });
  renderLog();
}
function confirmQuit() {
  const online = S && S.kind !== 'solo';
  sheet(`<h2>タイトルへもどりますか？</h2><p>${online ? 'オンラインの部屋から出ます。' : 'このゲームは「続きから」で再開できます。'}</p><div class="menu-actions"><button class="btn primary" data-a="yes">もどる</button><button class="btn" data-a="close">続ける</button></div>`,
    { onAction(a, b, close) { if (a === 'yes') { close(); toTitle(); } } });
}
let endShown = false;
function finishGame(force) {
  if (!V || V.phase !== 'over') return;
  if (endShown && !force) return;
  endShown = true;
  if (S && S.kind === 'solo') store.del('shadylady.save');
  const w = V.winner, mine = w === V.me;
  sfx(mine ? 'win' : 'lose');
  const rows = V.players.map((P, s) => ({ s, P })).sort((a, b) => b.P.pts - a.P.pts);
  const host = S && (S.kind === 'solo' || S.kind === 'host');
  closeSheets('end');
  sheet(`<h2 class="end-title">${mine ? 'あなたの勝ち！' : esc(pname(w)) + 'の勝ち'}</h2>
    <table class="res">${rows.map((r) => `<tr class="${r.s === w ? 'w' : ''}"><td><span class="dotc" style="background:${pcol(r.s)}"></span>${esc(r.s === V.me ? 'あなた' : r.P.name)}</td><td>${'<i class="pt on"></i>'.repeat(r.P.pts)}${'<i class="pt"></i>'.repeat(Math.max(0, V.target - r.P.pts))}</td><td>${r.P.pts}点</td></tr>`).join('')}</table>
    <div class="menu-actions">${host ? '<button class="btn primary" data-a="again">もう一度</button>' : '<p class="note">進行役が次のゲームを始めるのを待っています。</p>'}<button class="btn" data-a="title">タイトルへ</button></div>`,
  { cls: 'end', onAction(a, b, close) { if (a === 'again') { close(); playAgain(); } else if (a === 'title') { close(); toTitle(); } } });
}

/* ------------------------------------------------------------------ starting, saving, leaving */
function cpuPlayers(k, level, used) {
  const out = [], names = CPU_NAMES.filter((n) => !used.has(n));
  for (let i = 0; i < k; i++) out.push({ name: names[i % names.length] || 'CPU' + (i + 1), kind: 'cpu', level });
  return out;
}
function startSolo(cfg) {
  const me = { name: settings.name || 'あなた', kind: 'human', level: 0 };
  const players = [me].concat(cpuPlayers(cfg.n - 1, cfg.level, new Set([me.name])));
  const seed = (Math.random() * 4294967296) >>> 0;
  const st = E.newGame({ players, seed, first: cfg.first === 'me' ? 0 : -1, target: cfg.target, handSize: cfg.handSize });
  S = { kind: 'solo', st, me: 0, cfg, log: [], rnd: E.mulberry32(seed ^ 0x51ad1e), status: null };
  V = E.viewFor(st, 0);
  beginGame(true);
}
function saveGame() { if (S && S.kind === 'solo' && S.st.phase !== 'over') store.set('shadylady.save', { v: 1, st: S.st, cfg: S.cfg, log: S.log.slice(0, 60) }); }
function resumeSolo() {
  const g = store.get('shadylady.save');
  if (!g || g.v !== 1 || !g.st) return;
  S = { kind: 'solo', st: g.st, me: 0, cfg: g.cfg, log: g.log || [], rnd: E.mulberry32((Math.random() * 4294967296) >>> 0), status: null };
  V = E.viewFor(S.st, 0);
  beginGame(false);
}
function beginGame(fresh) {
  closeSheets();
  endShown = false;
  U.rev = []; U.acts = {}; U.sel = null; U.jack = false; U.wait = false;
  $$('.screen').forEach((s) => { s.hidden = true; });
  $('#app').hidden = false;
  scene.setTitleMode(false);
  scene.setHost($('#stage'));
  scene.setSpeed(spd());
  scene.sync(V);
  scene.setTurn(V.phase === 'turn' || V.phase === 'discard' ? V.turn : -1);
  if (V.open && V.open.length) {    // a resumed game in the middle of a Try or Jack: show what is open
    U.rev = V.open.map((p) => ({ p, ns: V.players[p].shown, c: E.combo(V.players[p].shown) }));
    renderReveal();
  } else renderReveal();
  $('#tags').innerHTML = '';
  renderAll();
  if (fresh) {
    logLine(`ゲーム開始。${who(V.turn)}から。`);
    banner(V.turn === V.me ? 'あなたから始めます' : `${esc(pname(V.turn))}から始めます`);
  }
  if (isHostish()) hostDo(pumpNow);
  if (V.phase === 'over') finishGame();
}
function playAgain() {
  if (!S) return;
  if (S.kind === 'solo') { startSolo(S.cfg); return; }
  if (S.kind === 'host' && L) startOnlineGame(true);
}
function toTitle() {
  if (S && S.kind !== 'solo') leaveRoom();
  S = null; V = null;
  closeSheets();
  $('#app').hidden = true;
  showTitle();
}
function showTitle() {
  $('#tResume').hidden = !(store.get('shadylady.save') || {}).st;
  showScreen('scrTitle');
}

/* ------------------------------------------------------------------ setup screens */
function segInit(id, value, onPick) {
  const el = $('#' + id);
  $$('button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === String(value)));
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sfx('click'); $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); };
}
function openSolo() {
  const c = settings.solo;
  segInit('soN', c.n, (v) => { c.n = +v; saveSettings(); });
  segInit('soLevel', c.level, (v) => { c.level = +v; saveSettings(); });
  segInit('soFirst', c.first, (v) => { c.first = v; saveSettings(); });
  segInit('soHandSize', c.handSize, (v) => { c.handSize = +v; saveSettings(); });
  segInit('soTarget', c.target, (v) => { c.target = +v; saveSettings(); });
  $('#soName').value = settings.name || '';
  showScreen('scrSolo');
}
function initScreens() {
  $('#tSolo').onclick = () => { sfx('click'); openSolo(); };
  $('#tResume').onclick = () => { sfx('click'); resumeSolo(); };
  $('#tOnline').onclick = () => { sfx('click'); openOnline(); };
  $('#tRules').onclick = () => { sfx('click'); openRules(); };
  $('#soBack').onclick = () => { sfx('click'); showTitle(); };
  $('#soStart').onclick = () => { sfx('click'); settings.name = NET.cleanName($('#soName').value) || ''; saveSettings(); startSolo(Object.assign({}, settings.solo)); };
  $('#onBack').onclick = () => { sfx('click'); leaveRoom(); showTitle(); };
  $('#btnMenu').onclick = () => { sfx('click'); openMenu(); };
  $('#btnLog').onclick = () => { sfx('click'); openLog(); };
  $('#btnSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); syncSoundBtn(); sfx('click'); };
  $('#dock').addEventListener('click', onDock);
  syncSoundBtn();
}
function syncSoundBtn() {
  if (globalThis.GEMINI_BGM && globalThis.GEMINI_BGM.setEnabled) globalThis.GEMINI_BGM.setEnabled(settings.sound);
  $('#btnSound').classList.toggle('off', !settings.sound);
  $('#btnSound').setAttribute('aria-pressed', String(settings.sound));
}

/* ------------------------------------------------------------------ online */
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('shadylady.cid'); } catch (e) { /* ignore */ }
  if (!c) { c = NET.makeCid(); try { sessionStorage.setItem('shadylady.cid', c); } catch (e) { /* ignore */ } }
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
    L = { role: 'host', link, code, players: [{ name, kind: 'host', online: true }], level: settings.lobby.level, target: settings.lobby.target, handSize: settings.lobby.handSize };
    link.on('msg', onHostMsg);
    link.on('leave', onHostLeave);
    showLobby();
  } catch (e) { onlineError(netErr(e)); } finally { $('#onCreate').disabled = false; }
}
async function joinRoom(auto) {
  const name = takeName(); if (!name) return;
  const code = NET.cleanCode($('#onCode').value);
  if (code.length !== 4) { onlineError('4文字の部屋コードを入れてください。'); return; }
  $('#onJoin').disabled = true;
  try {
    const link = NET.makeGuest(NETKIND);
    await link.join(code);
    L = { role: 'guest', link, code, players: [], me: -1, level: 2, target: 3 };
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
  $('#lobNote').textContent = host ? '部屋コードか招待リンクを送ってください。2〜6人で遊べます。空いた席はCPUを加えられます。' : '進行役がはじめるのを待っています。';
  $('#lobSeats').innerHTML = L.players.map((p, i) => `<div class="seat-row"><span class="dotc" style="background:${pcol(i)}"></span><b>${esc(p.name)}</b><span class="note">${p.kind === 'host' ? '進行役' : p.kind === 'cpu' ? 'CPU・' + (LEVEL_NAME[p.level || L.level] || '') : p.online === false ? '接続待ち' : ''}${i === L.me ? '（あなた）' : ''}</span>${host && i > 0 ? `<button class="btn small ghost" data-rm="${i}">外す</button>` : ''}</div>`).join('');
  $('#lobHost').hidden = !host;
  if (host) {
    segInit('lobLevel', L.level, (v) => { L.level = +v; settings.lobby.level = L.level; saveSettings(); L.players.forEach((p) => { if (p.kind === 'cpu') p.level = L.level; }); sendLobby(); renderLobby(); });
    segInit('lobHandSize', L.handSize || 3, (v) => { L.handSize = +v; settings.lobby.handSize = L.handSize; saveSettings(); sendLobby(); });
    segInit('lobTarget', L.target, (v) => { L.target = +v; settings.lobby.target = L.target; saveSettings(); sendLobby(); });
    $('#lobStart').disabled = L.players.length < 2;
    $('#lobAddCpu').disabled = L.players.length >= 6;
  } else {
    $('#lobGuestInfo').textContent = `手札${L.handSize || 3}枚・CPUの強さ：${LEVEL_NAME[L.level] || ''}・${L.target}点先取`;
  }
  $('#lobGuestInfo').hidden = host;
}
function sendLobby() {
  if (!L || L.role !== 'host') return;
  const pub = L.players.map((p) => ({ name: p.name, kind: p.kind, level: p.level || L.level, online: p.online !== false }));
  L.players.forEach((p, i) => { if (p.cid) L.link.send(p.cid, { k: 'lobby', code: L.code, players: pub, you: i, level: L.level, target: L.target, handSize: L.handSize || 3 }); });
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
      if (L.players.length >= 6) { L.link.send(cid, { k: 'bye', why: 'full' }); L.link.drop(cid); return; }
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
    case 'draw': case 'try': return { t: a.t };
    case 'take': return { t: 'take', from: int(a.from) };
    case 'discard': return { t: 'discard', card: int(a.card) };
    case 'jack': return { t: 'jack', target: int(a.target) };
    case 'respond': return { t: 'respond', reveal: a.reveal === true };
    case 'order': return Array.isArray(a.cards) ? { t: 'order', cards: a.cards.slice(0, 4).map(int) } : null;
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
function startOnlineGame(again) {
  if (!L || L.role !== 'host' || L.players.length < 2) return;
  const players = L.players.map((p) => ({ name: p.name, kind: p.kind === 'cpu' ? 'cpu' : 'human', level: p.kind === 'cpu' ? (p.level || L.level) : 0 }));
  const seed = (Math.random() * 4294967296) >>> 0;
  const st = E.newGame({ players, seed, first: -1, target: L.target, handSize: L.handSize });
  S = { kind: 'host', st, me: 0, log: [], rnd: E.mulberry32(seed ^ 0x2545f491), cids: L.players.map((p) => p.cid || null), online: L.players.map((p) => p.kind !== 'guest' || p.online !== false), status: null };
  V = E.viewFor(st, 0);
  S.cids.forEach((cid, o) => { if (cid) sendFull(o); });
  beginGame(true);
}
function sendFull(o) { const cid = S.cids[o]; if (cid) L.link.send(cid, { k: 'state', full: true, view: E.viewFor(S.st, o), log: S.log.slice(0, 40) }); }
function broadcastState(ev) { S.cids.forEach((cid, o) => { if (cid && S.online[o]) L.link.send(cid, { k: 'state', view: E.viewFor(S.st, o), ev: E.evFor(ev, o) }); }); }
function onGuestMsg(m) {
  if (!m || typeof m !== 'object' || !L) return;
  if (m.k === 'lobby') { L.players = m.players; L.me = m.you; L.level = m.level; L.target = m.target; L.handSize = m.handSize || 3; if (!S) renderLobby(); return; }
  if (m.k === 'state') {
    if (!m.view) return;
    if (!S || m.full || S.kind !== 'guest' || m.view.me !== S.me) {
      chain = Promise.resolve();
      S = { kind: 'guest', me: m.view.me, log: Array.isArray(m.log) ? m.log : [], status: null };
      V = m.view;
      beginGame(false);
      return;
    }
    const view = m.view, ev = Array.isArray(m.ev) ? m.ev : [];
    chain = chain.then(() => { U.wait = false; return present(ev, view); });
    return;
  }
  if (!S || S.kind !== 'guest') return;
  if (m.k === 'status') { S.status = m.text ? { p: m.p, text: m.text } : null; renderTags(); return; }
  if (m.k === 'err') { U.wait = false; if (m.view && !busy) { V = m.view; scene.sync(V); } toast('その操作はできませんでした'); renderAll(); return; }
  if (m.k === 'bye') {
    const why = { full: '部屋がいっぱいでした（6人まで）。', started: 'その部屋はもう始まっています。', version: 'アプリの版がちがいます。ページを読みこみ直してください。' }[m.why] || '進行役が部屋を閉じました。';
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
    if (!L || L.players.length >= 6) return;
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
    await loadThree();
    await fontWait;
    scene = createScene($('#titleBg'), {
      onPick,
      barPx: () => { const d = $('#dockWrap'); return d && !$('#app').hidden ? d.getBoundingClientRect().height + 2 : 96; },
      topPx: () => { const t = $('#topbar'); return t && !$('#app').hidden ? t.getBoundingClientRect().bottom + 6 : 56; }
    });
  } catch (e) { console.error(e); scene = null; }
  if (!scene) {
    $('#loaderMsg').innerHTML = '3D表示を始められませんでした。<br>ページを読みこみ直すか、別のブラウザで開いてください。';
    return;
  }
  scene.onFrame(placeTags);
  if (window.ResizeObserver) new ResizeObserver(() => { if (scene && !$('#app').hidden) scene.resize(); }).observe($('#dockWrap'));
  scene.setSpeed(spd());
  fontWait.then((ok) => { if (ok) { CARDS.clearCache(); scene.refreshFaces(); } });
  $('#loader').hidden = true;
  const room = params.get('room');
  if (room) { openOnline(room); if (settings.name) joinRoom(true); }
  else showTitle();
  setTimeout(syncSoundBtn, 900);    // the BGM module starts after this one
  window.__ready = true;
}
window.__sl = { get S() { return S; }, get V() { return V; }, U, settings, canAct, submit, get busy() { return busy; }, E, AI, get scene() { return scene; }, startSolo, resumeSolo, toTitle };
boot();

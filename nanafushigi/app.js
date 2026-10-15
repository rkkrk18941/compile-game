/* ナナフシギ・デュエル — the app: screens, the presenter, CPU pacing, online rooms and tournaments.
   One shape for every mode: a Host owns a Director (who plays whom) and the live engine state, and sends each
   client a payload { view, events, ctrl, omni } — ctrl lists the seats that client may move, omni means it is a
   spectator and sees everything. Offline the only client is this screen; online the host's browser is the Host and
   guests get payloads over PeerJS. The presenter replays the events with animations, then settles on the view. */
import { createScene } from './scene.js';
import * as A from './art.js';
import { createFX, createSound } from './fx.js';

const E = window.NFD_ENG, AI = window.NFD_AI, DIR = window.NFD_DIR, N = window.NFD_NET;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const store = {
  get(k, d) { try { const v = localStorage.getItem('nfd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nfd.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const prefs = {
  name: store.get('name', ''), level: store.get('level', 2), speed: store.get('speed', 1), sfx: store.get('sfx', true), bgm: store.get('bgm', true),
  quality: store.get('quality', 'high'), format: store.get('format', 'league'), tourList: store.get('tourList', null)
};
if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;
const LEVEL = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい', 4: '達人' };
const CPU_NAMES = ['クレオ', 'アトラス', 'ネフェル', 'ダリオ', 'ゼノア', 'ルクス', 'オリオン', 'ミラ', 'イシス', 'カシウス', 'ソフィア', 'レオン'];
const HOW = { military: '軍事的勝利', science: '科学的勝利', civil: '繁栄による勝利' };
const TYPE_JP = { brown: '茶', grey: '灰', blue: '青', green: '緑', red: '赤', yellow: '黄', purple: '紫' };
const AGE_JP = ['', '第一時代', '第二時代', '第三時代'];
const ROMAN = ['', 'I', 'II', 'III'];

let scene = null, fx = null;
const snd = createSound();
snd.sfx = prefs.sfx;

/* ================================================================ helpers */
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function myName() { return N.cleanName(prefs.name) || 'あなた'; }
let spd = () => prefs.speed * (client.watchSpeed || 1) * (queue.length > 2 ? 2.5 : 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / spd()));
function toast(html, color, ms) {
  const box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = (color ? '<i style="background:' + color + '"></i>' : '') + html;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 320); }, (ms || 2600) / Math.min(2, spd()));
}
function banner(text, sub) {
  const b = $('#banner');
  b.className = ''; void b.offsetWidth;
  b.innerHTML = '<span>' + esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>';
  b.style.animationDuration = (1.5 / Math.min(2, spd())) + 's';
  b.className = 'show';
}
const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function sheet(title, body, cls) {
  return '<div class="sheet ' + (cls || '') + '" role="dialog" aria-label="' + esc(title) + '"><div class="sheet-h"><h3>' + esc(title) + '</h3>' +
    (cls && cls.indexOf('noclose') >= 0 ? '' : '<button class="iconbtn" data-close aria-label="閉じる">' + CLOSE_SVG + '</button>') + '</div><div class="sheet-b">' + body + '</div></div>';
}
function openLayer(html, onClose, sticky) {
  const L = $('#layer');
  L.innerHTML = html;
  L.onclick = (e) => { if ((e.target === L && !sticky) || e.target.closest('[data-close]')) closeLayer(); };
  closeLayer.cb = onClose || null;
  return L.firstElementChild;
}
function closeLayer() { $('#layer').innerHTML = ''; const f = closeLayer.cb; closeLayer.cb = null; if (f) f(); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
  document.body.classList.toggle('title', id === 'scrTitle' || ((id === 'scrSolo' || id === 'scrTour' || id === 'scrOnline') && client.mid < 0));
  if (scene) setTimeout(() => scene.resize(), 0);
}
function seatColor(s) { return A.SEAT_COL[s]; }
function icon(kind, v, cls) { return '<img ' + (cls ? 'class="' + cls + '" ' : '') + 'src="' + A.iconURL(kind, v) + '" alt="">'; }
function typeColor(t) { return A.TYPE_COL[t][0]; }
function rect(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function stageRect() { return $('#stage').getBoundingClientRect(); }
function sceneToPage(p) { const r = stageRect(); return { x: r.left + p.x, y: r.top + p.y }; }

/* ================================================================ client (what this screen shows) */
const client = {
  cid: 'local', mid: -1, view: null, disp: null, ctrl: [], omni: false, names: ['', ''], cpu: [0, 0], tour: null,
  persp: 0, watchPersp: 0, watchSpeed: 1, log: [], role: 'local', lock: false, resultShown: false, ended: false
};
const queue = [];
let presenting = false, idleWaiters = [];
function receive(p) { queue.push(p); if (!presenting) drain(); }
async function drain() {
  presenting = true;
  while (queue.length) {
    const p = queue.shift();
    try { await present(p); } catch (e) { console.error(e); settle(p.view); }
  }
  presenting = false;
  if (client.mid >= 0 && client.disp) renderAll();
  const w = idleWaiters; idleWaiters = []; w.forEach((r) => r());
}
function idle() { return presenting ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve(); }

function perspFor(v) {
  if (client.ctrl.length === 1) return client.ctrl[0];
  if (client.ctrl.length === 2) return v.pend ? v.pend.seat : v.active;
  return client.watchPersp;
}
function canAct(v) {
  v = v || client.view;
  if (!v || v.phase === 'over' || client.lock || presenting) return false;
  const s = v.pend ? v.pend.seat : v.active;
  return client.ctrl.indexOf(s) >= 0;
}
function actingSeat(v) { v = v || client.view; return v.pend ? v.pend.seat : v.active; }
function nameOf(seat) { return client.names[seat] || (seat ? 'B' : 'A'); }
function isMe(seat) { return client.ctrl.length === 1 && client.ctrl[0] === seat; }
function who(seat) { return isMe(seat) ? 'あなた' : nameOf(seat); }
function addLog(s) { client.log.push(s); if (client.log.length > 200) client.log.shift(); }

async function present(p) {
  const fresh = p.fresh || p.mid !== client.mid;
  client.ctrl = p.ctrl; client.omni = p.omni; client.names = p.names; client.cpu = p.cpu; client.tour = p.tour;
  $('#btnTour').hidden = !p.tour || p.tour.format === 'duel';
  if (fresh) {
    client.mid = p.mid; client.log = []; client.resultShown = false; client.ended = false;
    ownedW[0].clear(); ownedW[1].clear();
    hideResult(); closeLayer(); showScreen(null);
    client.persp = perspFor(p.view);
    setupMatch(p.view);
    renderAll();
    if (p.view.phase === 'draft' && p.view.turn === 0 && p.view.draft && p.view.draft.i === 0) await vsIntro(p);
    if (p.events && p.events.length) await playEvents(p.events, p.view);
    settle(p.view);
    return;
  }
  await playEvents(p.events || [], p.view);
  settle(p.view);
}
async function playEvents(evs, v) {
  for (const ev of evs) {
    try { await playEvent(ev, v); } catch (e) { console.error(e); }
  }
}
function settle(v) {
  client.view = v;
  client.lock = false;
  client.disp = E.clone(v);
  const np = perspFor(v);
  if (np !== client.persp) { client.persp = np; scene.setPersp(np); }
  scene.syncSlots(v);
  scene.setLoot(v.loot);
  scene.pawnTo(v.mil, false);
  if (v.phase !== 'draft') scene.setTokens(v.boardTok, false);
  renderAll();
  if (v.phase === 'over' && !client.ended) { client.ended = true; finale(v); }
}
function setupMatch(v) {
  client.disp = E.clone(v);
  client.view = v;
  scene.setPersp(client.persp);
  scene.setLoot(v.loot);
  scene.pawnTo(v.mil, false);
  scene.setTokens(v.boardTok || [], true);
  scene.setAge(v.age);
  if (v.slots && v.slots.length) scene.dealAge(v, false); else scene.syncSlots({ slots: [] });
}

/* ================================================================ rendering: panels, HUD, draft, badges */
const lastNums = {};
function renderAll() { renderPanels(); renderHud(); renderDraft(); renderPrompt(); updateHighlights(); }
function renderPanels() {
  const d = client.disp; if (!d) return;
  const near = client.persp, far = 1 - near;
  $('#me').innerHTML = panelHTML(near); $('#me').style.setProperty('--sc', seatColor(near));
  $('#opp').innerHTML = panelHTML(far); $('#opp').style.setProperty('--sc', seatColor(far));
  $('#me').dataset.seat = near; $('#opp').dataset.seat = far;
  const act = d.phase === 'over' ? -1 : d.pend ? d.pend.seat : d.active;
  $('#me').classList.toggle('active', act === near);
  $('#opp').classList.toggle('active', act === far);
}
function panelHTML(seat) {
  const d = client.disp, pl = d.p[seat], sc = E.score(d)[seat], pr = E.production(pl);
  const nm = nameOf(seat), lv = client.cpu[seat];
  pl.wonders.forEach((w) => ownedW[seat].add(w.w));
  const tag = lv ? 'CPU・' + LEVEL[lv] : isMe(seat) ? 'あなた' : client.ctrl.length === 2 ? '' : '';
  const prev = lastNums[seat] || {};
  const bump = (k, v) => (prev[k] != null && prev[k] !== v ? ' class="bump"' : '');
  const m = seat === 0 ? d.mil : -d.mil;
  let h = '<div class="ph"><div class="emb">' + esc(nm.slice(0, 1)) + '</div><div class="nm">' + esc(nm) + (tag ? '<small>' + esc(tag) + '</small>' : '') + '</div>';
  if (m > 0) h += '<div class="mil" title="軍事で優勢">' + icon('shield') + '+' + m + '</div>';
  h += '<div class="stat coin" data-stat="coin" title="コイン">' + icon('coin') + '<span' + bump('c', pl.coins) + '>' + pl.coins + '</span></div>';
  h += '<div class="stat vp" title="今の勝利点">' + icon('vp', '') + '<span' + bump('v', sc.total) + '>' + sc.total + '</span></div></div>';
  h += '<div class="res">';
  E.RES.forEach((k) => { const n = pr.fixed[k]; h += '<span class="rc' + (n ? '' : ' zero') + (pr.trade[k] ? ' trade' : '') + '" title="' + E.RES_NAME[k] + '">' + icon('res', k) + n + '</span>'; });
  pr.choices.forEach((c) => { h += '<span class="choice">＋' + c.split('').map((k) => icon('res', k)).join('') + '</span>'; });
  h += '</div><div class="sci" data-sci>';
  const sn = E.sciCounts(pl);
  E.SCI.forEach((s) => { if (s === 'law' && !sn.law) return; h += '<span class="sy' + (sn[s] ? ' on' : '') + (sn[s] >= 2 ? ' pair' : '') + '" title="' + E.SCI_NAME[s] + '">' + icon('sci', s) + '</span>'; });
  if (pl.tok.length) h += '<span class="toks">' + pl.tok.map((t) => '<img data-tok="' + t + '" src="' + A.iconURL('tok', t) + '" alt="' + esc(E.TOKENS[t].name) + '">').join('') + '</span>';
  h += '</div><div class="won">';
  pl.wonders.forEach((w) => {
    const built = w.card >= 0;
    let can = false;
    if (!built && isMe(seat) && canAct() && d.phase === 'play' && !d.pend && d.built < 7) can = E.wonderCost(d, seat, w.w).ok;
    h += '<div class="wt' + (built ? ' built' : '') + (can ? ' can' : '') + '" data-w="' + w.w + '" data-seat="' + seat + '" title="' + esc(E.WONDERS[w.w].name) + '"><img src="' + A.wonderURL(w.w) + '" alt=""></div>';
  });
  (d.outW || []).forEach((w) => { if (wasOwned(seat, w)) h += '<div class="wt gone" data-w="' + w + '" data-seat="' + seat + '"><img src="' + A.wonderURL(w) + '" alt=""></div>'; });
  h += '</div><div class="cards" data-city="' + seat + '" title="都市を見る">';
  ['brown', 'grey', 'blue', 'green', 'red', 'yellow', 'purple'].forEach((t) => { const n = E.countType(pl, t); h += '<span class="cp' + (n ? '' : ' z') + '" style="background:' + typeColor(t) + '">' + n + '</span>'; });
  h += '</div><div class="city" data-city="' + seat + '">' + ['brown', 'grey', 'yellow', 'blue', 'green', 'red', 'purple'].map((t) => pl.cards.filter((c) => E.CARDS[c].type === t).map((c) => '<span style="--c:' + typeColor(t) + '">' + esc(E.CARDS[c].name) + '</span>').join('')).join('') + '</div>';
  if (E.distinctSci(pl) >= 5) setTimeout(() => { const el = document.querySelector('.pnl[data-seat="' + seat + '"] .sci'); if (el) el.classList.add('danger'); });
  lastNums[seat] = { c: pl.coins, v: sc.total };
  return h;
}
const ownedW = [new Set(), new Set()];
function wasOwned(seat, w) { return ownedW[seat].has(w); }
function renderHud() {
  const d = client.disp; if (!d) return;
  $('#ageText').textContent = d.phase === 'draft' ? '✦' : ROMAN[d.age];
  $('#ageLabel').textContent = d.phase === 'draft' ? '不思議の選択' : AGE_JP[d.age];
  const s = d.pend ? d.pend.seat : d.active, chip = $('#turnChip');
  const mine = canAct(d) && client.ctrl.length > 0;
  chip.classList.toggle('mine', mine);
  $('#turnDot').style.background = seatColor(s);
  $('#turnText').textContent = d.phase === 'over' ? '決着' : mine && client.ctrl.length === 1 ? 'あなたの番' : nameOf(s) + 'の番';
  $('#watchBar').hidden = !(client.omni && client.ctrl.length === 0);
  if (!$('#watchBar').hidden) renderWatchBar();
  $('#emotes').hidden = !(session.kind === 'host' || session.kind === 'guest');
}
function renderWatchBar() {
  const canFF = !!host && session.kind !== 'guest' && host.allCpu();
  $('#watchBar').innerHTML = '<span class="chip eyechip">👁 観戦中・伏せ札は青く表示</span>' +
    '<button class="chip" data-wb="flip">⇅ 視点</button>' +
    [1, 2, 4].map((x) => '<button class="chip' + (client.watchSpeed === x ? ' on' : '') + '" data-wb="spd" data-v="' + x + '">×' + x + '</button>').join('') +
    (canFF ? '<button class="chip" data-wb="ff">⏭ 結果へ</button>' : '');
}
function renderDraft() {
  const d = client.disp, el = $('#draft');
  if (!d || d.phase !== 'draft' || !d.draft) { el.hidden = true; return; }
  el.hidden = false;
  const D = d.draft, mine = canAct(d);
  let h = '<h2>不思議を選ぶ <small style="font-size:.6em;color:var(--muted)">' + (D.i < 4 ? '1' : '2') + ' / 2</small></h2>';
  h += '<div class="dorder">' + D.order.map((s, i) => '<i class="s' + s + (i === D.i ? ' now' : '') + (i < D.i ? ' done' : '') + '"></i>').join('') + '</div>';
  h += '<p>' + (mine ? '<b style="color:#ffe7a6">あなたが選ぶ番です</b>' : esc(nameOf(d.active)) + 'が選んでいます…') + '　4つずつ選び、時代の中で建てていきます。</p>';
  h += '<div class="dpicks">' + [client.persp, 1 - client.persp].map((s) => '<div class="dpick"><span class="who" style="color:' + seatColor(s) + '">' + esc(nameOf(s)) + '</span>' + [0, 1, 2, 3].map((k) => { const w = d.p[s].wonders[k]; return w ? '<img src="' + A.wonderURL(w.w) + '" alt="" title="' + esc(E.WONDERS[w.w].name) + '">' : '<span class="slot"></span>'; }).join('') + '</div>').join('') + '</div>';
  h += '<div class="dgrid">' + D.pool.map((w) => '<button class="dw' + (mine ? ' mine' : '') + '" data-dw="' + w + '"' + (mine ? '' : ' disabled') + '><img src="' + A.wonderURL(w) + '" alt=""><div class="tx">' + esc(E.wonderText(w).join('・')) + '</div></button>').join('') + '</div>';
  el.innerHTML = h;
}
function renderPrompt() {
  const d = client.disp, p = $('#prompt');
  if (!d || d.phase === 'over' || d.phase === 'draft') { p.textContent = ''; return; }
  if (client.ctrl.length === 0) { p.textContent = ''; return; }
  const s = actingSeat(d);
  if (presenting && client.ctrl.indexOf(s) >= 0) { p.textContent = ''; return; }
  if (canAct(d)) {
    const P = d.pend;
    const prefix = client.ctrl.length === 2 ? nameOf(s) + '：' : '';
    p.textContent = prefix + (!P ? 'カードを選んでください' : P.k === 'progress' ? '進歩トークンを選んでください' : P.k === 'library' ? '大図書館：トークンを選んでください' : P.k === 'destroy' ? '捨てさせるカードを選んでください' : P.k === 'mausoleum' ? '霊廟：捨て札から1枚選んでください' : '次の時代の先手を決めてください');
    p.style.pointerEvents = P ? 'auto' : 'none';
    p.style.cursor = P ? 'pointer' : '';
  } else { p.textContent = nameOf(s) + 'が考えています…'; p.style.pointerEvents = 'none'; }
}
let costCache = null;
function updateHighlights() {
  const d = client.disp; costCache = null;
  if (!d || d.phase !== 'play' || d.pend || !canAct(d)) { scene.highlight([]); scene.highlightTokens([]); return; }
  const me = actingSeat(d), list = E.accessibleSlots(d);
  scene.highlight(list);
  costCache = {};
  list.forEach((i) => { const id = d.slots[i].card; if (id != null) costCache[i] = E.cardCost(d, me, id); });
}
function updateBadges() {
  const box = $('#badges');
  if (!costCache || presenting) { if (box.childElementCount) box.innerHTML = ''; return; }
  const keys = Object.keys(costCache);
  if (box.childElementCount !== keys.length) {
    box.innerHTML = keys.map((i) => {
      const c = costCache[i];
      const cls = c.chain ? 'chain' : !c.ok ? 'no' : c.coins === 0 ? 'free' : '';
      const t = c.chain ? '🔗連鎖' : c.coins === 0 ? '無料' : icon('coin') + c.coins;
      return '<div class="badge ' + cls + '" data-b="' + i + '">' + t + '</div>';
    }).join('');
  }
  box.querySelectorAll('.badge').forEach((b) => {
    const p = scene.slotScreen(+b.dataset.b, true);
    if (p) { b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; }
  });
}

/* ================================================================ event animations */
function panelEl(seat) { return document.querySelector('.pnl[data-seat="' + seat + '"]'); }
function statPos(seat, k) { const el = panelEl(seat); const s = el && el.querySelector(k === 'coin' ? '[data-stat="coin"]' : k === 'sci' ? '[data-sci]' : k === 'won' ? '.won' : '.cards'); return s ? rect(s) : { x: innerWidth / 2, y: seat === client.persp ? innerHeight - 40 : 40 }; }
function slotPage(i) { const p = scene.slotScreen(i); return p ? sceneToPage(p) : rect($('#stage')); }
async function playEvent(ev, fin) {
  const d = client.disp, near = (s) => s === client.persp;
  switch (ev.t) {
    case 'draft': {
      const tile = document.querySelector('[data-dw="' + ev.w + '"]');
      d.p[ev.seat].wonders.push({ w: ev.w, card: -1 }); ownedW[ev.seat].add(ev.w);
      d.draft.pool = d.draft.pool.filter((w) => w !== ev.w); d.draft.i++;
      snd.play('token');
      addLog(who(ev.seat) + '：不思議「' + E.WONDERS[ev.w].name + '」を選んだ');
      if (tile) { const r = rect(tile); fx.burst(r.x, r.y, { n: 30, colors: [seatColor(ev.seat), '#fff'] }); tile.classList.add('taken'); }
      await sleep(520);
      if (ev.seat !== client.persp || client.ctrl.length !== 1) toast('<b>' + esc(nameOf(ev.seat)) + '</b>：' + esc(E.WONDERS[ev.w].name), seatColor(ev.seat));
      d.active = d.draft.order[d.draft.i] != null ? d.draft.order[d.draft.i] : d.active;
      renderPanels(); renderDraft(); renderHud();
      const wt = panelEl(ev.seat) && panelEl(ev.seat).querySelector('[data-w="' + ev.w + '"]');
      if (wt) { const r = rect(wt); fx.ring(r.x, r.y, seatColor(ev.seat), 60, 6); }
      return;
    }
    case 'draftPool': d.draft.pool = ev.pool.slice(); renderDraft(); snd.play('reveal'); await sleep(350); return;
    case 'turn': {
      d.active = ev.seat; d.pend = null;
      if (d.phase === 'start') d.phase = 'play';
      renderHud(); renderPanels();
      if (client.ctrl.indexOf(ev.seat) >= 0 && client.ctrl.length > 0 && fin.phase !== 'over') {
        snd.play('turn');
        if (client.ctrl.length === 2) { client.persp = ev.seat; scene.setPersp(ev.seat); renderPanels(); banner(nameOf(ev.seat) + 'の番'); await sleep(500); }
      }
      return;
    }
    case 'age': {
      d.age = ev.age; d.phase = 'play'; d.draft = null;
      $('#draft').hidden = true;
      d.slots = fin.slots.map((s) => Object.assign({}, s, { taken: false }));
      // the final view may already hold the next age's face-down cards; deal from it as it stands now
      await ageCinematic(ev.age);
      scene.setAge(ev.age);
      renderHud();
      await scene.dealAge({ age: ev.age, slots: fin.age === ev.age ? fin.slots : d.slots }, true);
      return;
    }
    case 'ageEnd': snd.play('drum'); toast(AGE_JP[ev.age] + 'が終わった'); addLog('── ' + AGE_JP[ev.age] + ' 終了 ──'); await sleep(500); return;
    case 'take': {
      if (d.slots[ev.slot]) d.slots[ev.slot].taken = true;
      const c = E.CARDS[ev.card], col = typeColor(c.type), p = slotPage(ev.slot);
      if (ev.how === 'build') {
        addLog(who(ev.seat) + '：「' + c.name + '」を建設');
        if (!isMe(ev.seat)) toast('<b>' + esc(nameOf(ev.seat)) + '</b> が「' + esc(c.name) + '」を建設', col);
        snd.play('swish');
        fx.burst(p.x, p.y, { n: 18, colors: [col, '#fff6dc'], max: 260 });
        await scene.takeCard(ev.slot, 'build', near(ev.seat), ev.card);
      } else if (ev.how === 'discard') {
        addLog(who(ev.seat) + '：「' + c.name + '」を売却');
        if (!isMe(ev.seat)) toast('<b>' + esc(nameOf(ev.seat)) + '</b> が「' + esc(c.name) + '」を売った', '#888');
        snd.play('discard');
        fx.embers(p.x, p.y, 40);
        await scene.takeCard(ev.slot, 'discard', near(ev.seat), ev.card);
      } else {
        addLog(who(ev.seat) + '：「' + c.name + '」で不思議を建造');
        snd.play('swish');
        await scene.takeCard(ev.slot, 'wonder', near(ev.seat), ev.card);
      }
      renderPrompt();
      return;
    }
    case 'build': {
      d.p[ev.seat].cards.push(ev.card);
      renderPanels();
      const c = E.CARDS[ev.card], col = typeColor(c.type), r = statPos(ev.seat, 'cards');
      fx.burst(r.x, r.y, { n: 26, colors: [col, '#fff6dc', col], max: 300 });
      fx.ring(r.x, r.y, col, 90, 8);
      snd.play('build');
      const pip = panelEl(ev.seat) && panelEl(ev.seat).querySelectorAll('.cp')[['brown', 'grey', 'blue', 'green', 'red', 'yellow', 'purple'].indexOf(c.type)];
      if (pip) pip.classList.add('flash');
      if (c.prod || c.choice || c.trade) panelEl(ev.seat).querySelectorAll('.rc').forEach((el) => el.classList.add('flash'));
      await sleep(260);
      return;
    }
    case 'chain': {
      const r = statPos(ev.seat, 'cards');
      fx.text(r.x, r.y - 30, '🔗 連鎖で無料！', '#b8ffd4', 22);
      snd.play('again'); await sleep(250); return;
    }
    case 'coins': {
      d.p[ev.seat].coins += ev.d;
      const to = statPos(ev.seat, 'coin');
      if (ev.d > 0) {
        const from = ev.why === '売却' || ev.why === '建設' ? rect($('#stage')) : sceneToPage(scene.centerScreen());
        fx.coins(from, to, Math.max(2, ev.d), () => {});
        snd.play(ev.d >= 5 ? 'coins' : 'coin');
        await sleep(420);
        fx.text(to.x, to.y - 18, '+' + ev.d, '#ffe48a', 22);
      } else {
        fx.shower(to.x, to.y, Math.min(16, -ev.d * 2));
        fx.text(to.x, to.y - 18, String(ev.d), '#ff9a8a', 22);
        snd.play('coin');
        await sleep(200);
      }
      renderPanels();
      return;
    }
    case 'mil': {
      d.mil = ev.to;
      snd.play('sword'); setTimeout(() => snd.play('drum'), 120);
      const bad = (ev.seat !== client.persp);
      await scene.pawnTo(ev.to, true);
      scene.shake(0.05 + ev.sh * 0.04);
      fx.vignette(bad ? '#ff2a10' : '#ffb340', 700);
      const pp = sceneToPage(scene.pawnScreen());
      fx.burst(pp.x, pp.y, { n: 22, colors: ['#ff6d5c', '#ffd27a'], max: 280 });
      fx.text(pp.x, pp.y - 30, '⚔ ' + ev.sh, '#ffb3a8', 26);
      addLog(who(ev.seat) + '：軍事 +' + ev.sh + '（コマ ' + Math.abs(ev.to) + '）');
      if (Math.abs(ev.to) >= 6 && Math.abs(ev.to) < 9) { snd.play('warn'); toast('⚠ ' + esc(nameOf(1 - ev.seat)) + 'の首都まであと' + (9 - Math.abs(ev.to)) + 'マス', '#ff6d5c'); }
      renderPanels();
      await sleep(250);
      return;
    }
    case 'loot': {
      d.loot[ev.key] = false;
      snd.play('loot');
      const lp = sceneToPage(scene.lootScreen(ev.key));
      fx.burst(lp.x, lp.y, { n: 30, colors: ['#ffd05a', '#ff6d5c'] });
      await scene.lootGone(ev.key);
      if (ev.lost) {
        d.p[ev.seat].coins -= ev.lost;
        const r = statPos(ev.seat, 'coin');
        fx.shower(r.x, r.y, ev.lost * 3);
        fx.text(r.x, r.y - 20, '略奪 −' + ev.lost, '#ff9a8a', 26);
      }
      addLog(who(ev.seat) + '：略奪で ' + ev.lost + 'コインを失った');
      renderPanels();
      await sleep(350);
      return;
    }
    case 'sci': {
      renderPanels();
      const r = statPos(ev.seat, 'sci');
      fx.burst(r.x, r.y, { n: 24, colors: ['#7dffb0', '#e9ffef'], max: 240 });
      snd.play(ev.n === 2 ? 'pair' : 'science');
      if (ev.n === 2 && ev.sym !== 'law') fx.text(r.x, r.y - 24, E.SCI_NAME[ev.sym] + 'のペア！', '#b8ffd4', 22);
      const dn = E.distinctSci(d.p[ev.seat]);
      if (dn === 5) { snd.play('warn'); toast('⚠ ' + esc(nameOf(ev.seat)) + 'は科学勝利まであと1種', '#7dffb0', 3200); }
      await sleep(300);
      return;
    }
    case 'pend': d.pend = { k: ev.k, seat: ev.seat }; if (ev.k === 'start') d.phase = 'start'; renderPrompt(); return;
    case 'token': {
      d.p[ev.seat].tok.push(ev.tok);
      snd.play('token');
      addLog(who(ev.seat) + '：進歩トークン「' + E.TOKENS[ev.tok].name + '」');
      if (ev.how === 'board') { d.boardTok = d.boardTok.filter((t) => t !== ev.tok); await scene.tokenTaken(ev.tok, near(ev.seat)); }
      renderPanels();
      const r = statPos(ev.seat, 'sci');
      fx.burst(r.x, r.y, { n: 30, colors: ['#7dffb0', '#ffe7a6'] });
      fx.text(r.x, r.y - 26, E.TOKENS[ev.tok].name, '#b8ffd4', 24);
      if (!isMe(ev.seat)) toast('<b>' + esc(nameOf(ev.seat)) + '</b> が進歩「' + esc(E.TOKENS[ev.tok].name) + '」', '#3aa462');
      await sleep(350);
      return;
    }
    case 'reveal': if (d.slots[ev.slot]) { d.slots[ev.slot].up = true; d.slots[ev.slot].card = ev.card; } snd.play('reveal'); await scene.reveal(ev.slot, ev.card); return;
    case 'wonder': {
      d.p[ev.seat].wonders.forEach((w) => { if (w.w === ev.w) w.card = 0; });
      d.built = (d.built || 0) + 1;
      await wonderCinematic(ev.seat, ev.w);
      renderPanels();
      const wt = panelEl(ev.seat) && panelEl(ev.seat).querySelector('[data-w="' + ev.w + '"]');
      if (wt) { const r = rect(wt); fx.burst(r.x, r.y, { n: 40, colors: ['#ffe7a6', '#ffd05a', '#fff'] }); fx.ring(r.x, r.y, '#ffd27a', 120, 10); }
      return;
    }
    case 'again': {
      const r = statPos(ev.seat, 'won');
      fx.text(r.x, r.y - 30, '↻ もう一度！', '#ffe7a6', 28);
      snd.play('again'); await sleep(350); return;
    }
    case 'wonderOut': {
      d.p[ev.seat].wonders = d.p[ev.seat].wonders.filter((w) => w.w !== ev.w);
      d.outW = (d.outW || []).concat([ev.w]);
      toast('7つ目の不思議が建った。「' + esc(E.WONDERS[ev.w].name) + '」は失われた', '#888', 3400);
      addLog('「' + E.WONDERS[ev.w].name + '」は建てられなくなった');
      snd.play('destroy'); renderPanels(); await sleep(400); return;
    }
    case 'destroy': {
      const pl = d.p[ev.seat]; pl.cards = pl.cards.filter((c) => c !== ev.card);
      const r = statPos(ev.seat, 'cards');
      fx.embers(r.x, r.y, 60, '#ff6d2a'); fx.burst(r.x, r.y, { n: 20, colors: ['#ff6d5c', '#333'] });
      snd.play('destroy');
      toast('<b>' + esc(nameOf(ev.seat)) + '</b> の「' + esc(E.CARDS[ev.card].name) + '」が壊された', '#ff6d5c');
      addLog(who(ev.seat) + '：「' + E.CARDS[ev.card].name + '」を失った');
      renderPanels(); await sleep(450); return;
    }
    case 'revive': {
      snd.play('revive');
      const c = sceneToPage(scene.centerScreen());
      fx.burst(c.x, c.y, { n: 40, colors: ['#c79bff', '#fff'], g: -60 });
      toast('霊廟から「' + esc(E.CARDS[ev.card].name) + '」がよみがえる', '#9a63d4');
      addLog(who(ev.seat) + '：捨て札から「' + E.CARDS[ev.card].name + '」を建設');
      await sleep(450); return;
    }
    case 'end': return;
  }
}

/* ================================================================ cinematics */
let cineSkip = null;
function cineWait(ms) {
  return new Promise((res) => {
    const el = $('#cine');
    const done = () => { clearTimeout(t); el.onclick = null; cineSkip = null; res(); };
    const t = setTimeout(done, ms / Math.min(3, spd()));
    el.onclick = done; cineSkip = done;
  });
}
async function cineHide() { const el = $('#cine'); el.style.transition = 'opacity .35s'; el.style.opacity = '0'; await new Promise((r) => setTimeout(r, 320)); el.hidden = true; el.style.opacity = ''; el.innerHTML = ''; }
async function wonderCinematic(seat, w) {
  const W = E.WONDERS[w], el = $('#cine');
  el.innerHTML = '<div class="bk"></div><div class="rays"></div><div class="wbox"><div class="who" style="color:' + seatColor(seat) + '">' + esc(nameOf(seat)) + ' が建造</div><img class="wart" src="' + A.wonderArtURL(w) + '" alt=""><div class="wkick">七不思議</div><div class="wname">' + esc(W.name) + '</div><div class="weff">' + esc(E.wonderText(w).join('　・　')) + '</div></div>';
  el.hidden = false;
  snd.play('wonder');
  scene.pillar('#ffd27a'); scene.shake(0.08);
  const burst = () => { for (let i = 0; i < 3; i++) setTimeout(() => fx.burst(innerWidth * (0.25 + Math.random() * 0.5), innerHeight * (0.3 + Math.random() * 0.3), { n: 50, colors: ['#ffe7a6', '#ffd05a', '#fff'], max: 520 }), i * 220); };
  setTimeout(burst, 500 / Math.min(3, spd()));
  addLog(who(seat) + '：不思議「' + W.name + '」を建造！');
  await cineWait(2700);
  await cineHide();
}
async function ageCinematic(age) {
  const el = $('#cine');
  el.innerHTML = '<div class="bk"></div><div class="rays" style="opacity:.6"></div><div class="agebox"><div class="sweep"></div><div class="agenum">' + ROMAN[age] + '</div><div class="agett">' + AGE_JP[age] + '</div><div class="agesub">' + (age === 1 ? '都市の礎を築け' : age === 2 ? '力をたくわえ、技を磨け' : 'ギルドが現れる。決着の時代') + '</div></div>';
  el.hidden = false;
  snd.play('age');
  await cineWait(1900);
  await cineHide();
}
async function vsIntro(p) {
  const el = $('#cine'), t = p.tour;
  let sub = '';
  if (t && t.format !== 'duel') { const m = t.matches[t.cur]; sub = (t.format === 'league' ? '総当たり 第' + m.round + '節' : roundName(t, m.round)); }
  el.innerHTML = '<div class="bk"></div><div class="rays" style="opacity:.5"></div><div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:14px">' +
    (sub ? '<div class="wkick">' + esc(sub) + '</div>' : '<div class="wkick">文明対決</div>') +
    '<div class="vs"><span class="a">' + esc(p.names[0]) + '</span><span class="x">VS</span><span class="b">' + esc(p.names[1]) + '</span></div>' +
    '<div class="agesub">' + (p.ctrl.length === 0 ? '観戦モード：伏せ札も含めてすべて見えます' : '最初に、建てる不思議を4つずつ選びます') + '</div></div>';
  el.hidden = false;
  snd.play('age');
  await cineWait(2000);
  await cineHide();
}
function roundName(t, r) {
  const total = t.rounds.length ? Math.ceil(Math.log2(Math.max(2, t.entrants.length))) : 1;
  const left = total - r;
  return left === 0 ? '決勝' : left === 1 ? '準決勝' : left === 2 ? '準々決勝' : r + '回戦';
}

/* ================================================================ finale & result */
async function finale(v) {
  const R = v.result;
  await idleFx(300);
  if (R.how === 'military') {
    scene.shake(0.4); snd.play('boom'); fx.vignette('#ff2a10', 1200);
    const pp = sceneToPage(scene.pawnScreen());
    for (let i = 0; i < 4; i++) setTimeout(() => fx.burst(pp.x + (Math.random() - 0.5) * 80, pp.y + (Math.random() - 0.5) * 60, { n: 60, colors: ['#ff6d5c', '#ffd27a', '#fff'], max: 600 }), i * 180);
    banner('首都陥落', nameOf(R.winner) + 'の軍事的勝利');
  } else if (R.how === 'science') {
    const r = statPos(R.winner, 'sci');
    for (let i = 0; i < 5; i++) setTimeout(() => { fx.burst(r.x, r.y, { n: 50, colors: ['#7dffb0', '#e9ffef', '#ffe7a6'], max: 600 }); fx.ring(r.x, r.y, '#7dffb0', 260, 12); }, i * 200);
    snd.play('pair'); scene.pillar('#7dffb0');
    banner('知の極み', nameOf(R.winner) + 'の科学的勝利');
  } else {
    snd.play('age');
    banner('決着', '勝利点で勝負');
  }
  await new Promise((r) => setTimeout(r, 1700));
  showResult(v);
}
function idleFx(ms) { return new Promise((r) => setTimeout(r, ms)); }
function hideResult() { $('#scrResult').hidden = true; }
function showResult(v) {
  const R = v.result, sc = R.score || E.score(v);
  client.resultShown = true;
  const el = $('#scrResult');
  const mineSeat = client.ctrl.length === 1 ? client.ctrl[0] : -1;
  let title, cls;
  if (R.winner === -1) { title = '引き分け'; cls = 'draw'; }
  else if (mineSeat >= 0) { title = R.winner === mineSeat ? '勝利' : '敗北'; cls = R.winner === mineSeat ? 'win' : 'lose'; }
  else { title = nameOf(R.winner) + 'の勝利'; cls = 'win'; }
  $('#resHow').textContent = R.winner === -1 ? '同点・青カードも同点' : HOW[R.how] + (R.how === 'civil' && R.tie ? '（青カードの点で決着）' : '');
  const tt = $('#resTitle'); tt.textContent = title; tt.className = 'res-title ' + cls; tt.style.fontSize = title.length > 5 ? 'clamp(30px,9vw,60px)' : '';
  $('#resSub').textContent = R.how === 'civil' ? sc[0].total + ' 対 ' + sc[1].total : R.how === 'military' ? '軍事コマが首都に届いた' : '6種類の科学シンボルがそろった';
  const rows = [['blue', '市民施設', 'blue'], ['green', '科学施設', 'green'], ['yellow', '商業施設', 'yellow'], ['guild', 'ギルド', 'purple'], ['wonder', '不思議', null], ['tok', '進歩トークン', null], ['mil', '軍事', 'red'], ['coin', 'コイン（3枚で1点）', null]];
  let h = '<thead><tr><th></th><th style="color:' + seatColor(0) + '">' + esc(nameOf(0)) + '</th><th style="color:' + seatColor(1) + '">' + esc(nameOf(1)) + '</th></tr></thead><tbody>';
  rows.forEach(([k, label, col]) => { h += '<tr><td>' + (col ? '<i style="background:' + typeColor(col) + '"></i>' : '') + label + '</td><td class="' + (sc[0][k] > sc[1][k] ? 'hi' : '') + '">' + sc[0][k] + '</td><td class="' + (sc[1][k] > sc[0][k] ? 'hi' : '') + '">' + sc[1][k] + '</td></tr>'; });
  h += '<tr class="total"><td>合計</td><td data-count="' + sc[0].total + '">0</td><td data-count="' + sc[1].total + '">0</td></tr></tbody>';
  $('#resTable').innerHTML = h;
  $('#resBtns').innerHTML = recordLine(recordSolo(v)) + resultButtons();
  el.hidden = false;
  // count up
  const cells = el.querySelectorAll('[data-count]'), t0 = performance.now();
  (function tick(now) { const k = Math.min(1, (now - t0) / 1200); cells.forEach((c) => { c.textContent = Math.round(+c.dataset.count * (1 - Math.pow(1 - k, 3))); }); if (k < 1) requestAnimationFrame(tick); })(t0);
  if (cls === 'win') {
    snd.play('win');
    fx.confetti(140);
    for (let i = 0; i < 7; i++) setTimeout(() => fx.firework(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.12 + Math.random() * 0.3)), 300 + i * 420);
  } else if (cls === 'lose') { snd.play('lose'); fx.embers(innerWidth / 2, innerHeight * 0.3, 60, '#8aa0ff'); }
  else snd.play('token');
  const tour = client.tour;
  if (tour && tour.over && tour.format !== 'duel') setTimeout(() => championCelebration(tour), 600);
}
/* a running record against each CPU level, so there is always a next goal */
function soloContext() {
  if (session.kind !== 'local' || client.ctrl.length !== 1) return null;
  const me = client.ctrl[0], lv = client.cpu[1 - me];
  if (!lv || !client.tour || client.tour.format !== 'duel') return null;
  return { me, lv };
}
function recordSolo(v) {
  const c = soloContext(); if (!c || client.recorded === client.mid) return null;
  client.recorded = client.mid;
  const rec = store.get('rec', {}), r = rec[c.lv] || { w: 0, l: 0, d: 0, streak: 0, best: 0 };
  const R = v.result, first = r.w === 0;
  if (R.winner === -1) { r.d++; r.streak = 0; } else if (R.winner === c.me) { r.w++; r.streak++; r.best = Math.max(r.best, r.streak); } else { r.l++; r.streak = 0; }
  rec[c.lv] = r; store.set('rec', rec);
  return { r, lv: c.lv, won: R.winner === c.me, firstWin: first && R.winner === c.me };
}
function recordLine(x) {
  if (!x) return '';
  const r = x.r;
  let t = '対「' + LEVEL[x.lv] + '」通算 ' + r.w + '勝' + r.l + '敗' + (r.d ? r.d + '分' : '');
  if (r.streak >= 2) t += '・' + r.streak + '連勝中🔥';
  if (x.firstWin) t += (x.lv < 4 ? '　初勝利！ 次は「' + LEVEL[x.lv + 1] + '」へ' : '　達人を初撃破！');
  return '<p class="note" style="text-align:center;font-size:13px;color:#ffe7a6;margin:0">' + esc(t) + '</p>';
}
function resultButtons() {
  const t = client.tour, b = [];
  const ctl = session.kind !== 'guest';
  if (ctl) {
    if (!t || t.format === 'duel') {
      b.push('<button class="btn primary big again" data-r="rematch">もう一度！</button>');
      const sc = soloContext(), v = client.view;
      if (sc && v && v.result && v.result.winner === sc.me && sc.lv < 4) b.push('<button class="btn green" data-r="harder">ひとつ上の「' + LEVEL[sc.lv + 1] + '」に挑戦</button>');
    }
    else if (!t.over) b.push('<button class="btn primary big again" data-r="next">次の試合へ</button>');
    else b.push('<button class="btn primary big" data-r="board">大会の結果を見る</button>');
  } else b.push('<p class="note" style="text-align:center">ホストが次を始めるのを待っています…</p>');
  if (t && t.format !== 'duel' && !(t.over && ctl)) b.push('<button class="btn" data-r="board">大会表</button>');
  b.push('<div class="row"><button class="btn ghost" data-r="look">盤面を見る</button>' + (session.kind === 'host' ? '<button class="btn ghost" data-r="lobby">部屋にもどる</button>' : '<button class="btn ghost" data-r="title">タイトルへ</button>') + '</div>');
  return b.join('');
}
function championCelebration(t) {
  const e = t.entrants.find((x) => x.eid === t.champion);
  if (!e) return;
  banner('優勝 ' + e.name, t.format === 'league' ? '総当たり 1位' : 'トーナメント制覇');
  fx.confetti(200);
  for (let i = 0; i < 10; i++) setTimeout(() => fx.firework(innerWidth * (0.1 + Math.random() * 0.8), innerHeight * (0.1 + Math.random() * 0.35)), i * 300);
  snd.play('win');
}

/* ================================================================ sheets: cards, wonders, city, pendings */
function cardInfoHTML(id) {
  const c = E.CARDS[id];
  return '<div class="tname">' + esc(c.name) + '</div><div class="ttype" style="color:' + typeColor(c.type) + '">' + E.TYPE_NAME[c.type] + '（' + TYPE_JP[c.type] + '）・' + (c.age === 4 ? 'ギルド' : AGE_JP[c.age]) + '</div>' +
    '<div class="costline">コスト：' + (c.$ ? icon('coin', c.$) : '') + c.cost.split('').map((k) => icon('res', k)).join('') + (c.$ || c.cost ? '' : '無料') + '</div>' +
    '<ul>' + E.cardText(id).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>';
}
function buyText(pay) {
  const parts = Object.keys(pay.buy || {}).map((k) => E.RES_NAME[k] + '×' + pay.buy[k]);
  return parts.length ? '交易：' + parts.join('・') + '（' + pay.trade + 'コイン）' : '';
}
function openCardSheet(i) {
  const d = client.disp, s = d.slots[i];
  if (!s || s.taken) return;
  snd.play('tap');
  if (s.card == null) {
    openLayer(sheet('伏せられたカード', '<div class="cardsheet"><img class="big" src="' + A.backCanvas(s.guild ? 'guild' : d.age).toDataURL() + '" alt=""><div><p>' + (s.guild ? '紫の裏面：<b>ギルド</b>のどれかです。' : AGE_JP[d.age] + 'のカード。') + '</p><p class="note">上に重なるカードがすべて取られると表になります。</p></div></div>'));
    return;
  }
  const acc = E.accessible(d, i), mine = canAct(d) && d.phase === 'play' && !d.pend && acc, me = actingSeat(d);
  let h = '<div class="cardsheet"><img class="big" src="' + A.cardURL(s.card) + '" alt=""><div>' + cardInfoHTML(s.card);
  if (mine) {
    const pay = E.cardCost(d, me, s.card), dv = E.discardValue(d.p[me]);
    const sub = pay.chain ? '連鎖で無料' : pay.coins === 0 ? '無料' : pay.coins + 'コイン';
    h += '<div class="acts"><button class="btn primary" data-act="build"' + (pay.ok ? '' : ' disabled') + '>建てる <span class="sub">' + (pay.ok ? sub : 'コイン不足（' + pay.coins + '必要）') + '</span></button>';
    if (buyText(pay) && pay.ok && !pay.chain) h += '<div class="note" style="text-align:center;margin-top:-4px">' + esc(buyText(pay)) + (E.hasTok(d.p[1 - me], E.T.ECON) ? '・相手の「経済」で相手に入ります' : '') + '</div>';
    h += '<button class="btn" data-act="discard">売る <span class="sub">＋' + dv + 'コイン</span></button></div>';
    const ws = d.p[me].wonders.filter((w) => w.card < 0);
    if (ws.length && d.built < 7) {
      h += '<div class="ctitle">このカードで不思議を建てる</div><div class="wlist">';
      ws.forEach((w) => {
        const pay2 = E.wonderCost(d, me, w.w);
        h += '<button class="wopt" data-act="wonder" data-w="' + w.w + '"' + (pay2.ok ? '' : ' disabled') + '><img src="' + A.wonderURL(w.w) + '" alt=""><div><b>' + esc(E.WONDERS[w.w].name) + '</b><small>' + esc(E.wonderText(w.w).join('・')) + '</small><small style="color:' + (pay2.ok ? '#ffe7a6' : '#ffb3a8') + '">' + (pay2.coins ? pay2.coins + 'コイン' : '資源だけで建つ') + (pay2.ok ? '' : '（不足）') + (pay2.trade ? ' ' + esc(buyText(pay2)) : '') + '</small></div></button>';
      });
      h += '</div>';
    }
  } else if (!acc) h += '<p class="note">ほかのカードに隠れているので、まだ取れません。</p>';
  else if (client.ctrl.length && !canAct(d)) h += '<p class="note">相手の番です。</p>';
  h += '</div></div>';
  const el = openLayer(sheet(E.CARDS[s.card].name, h));
  el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.act;
    closeLayer();
    sendAct(k === 'wonder' ? { k: 'wonder', slot: i, w: +b.dataset.w } : { k, slot: i });
  }));
}
function openWonderSheet(w, seat) {
  const d = client.disp, W = E.WONDERS[w];
  const owner = d.p[seat], ow = owner.wonders.find((x) => x.w === w);
  let h = '<img src="' + A.wonderURL(w, true) + '" alt="" style="width:100%;border-radius:12px;margin-bottom:8px">';
  h += '<div class="costline">コスト：' + W.cost.split('').map((k) => icon('res', k)).join('') + '</div><ul>' + E.wonderText(w).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>';
  if (!ow) h += '<p class="note warn">7つ目の不思議が建ったため、もう建てられません。</p>';
  else if (ow.card >= 0) h += '<p class="note">建造済み ✦</p>';
  else if (d.phase === 'play') { const pay = E.wonderCost(d, seat, w); h += '<p class="note">' + esc(nameOf(seat)) + 'が今建てると：' + (pay.coins ? pay.coins + 'コイン' : '資源だけで建つ') + (pay.ok ? '' : '（足りない）') + '</p><p class="note">建てるには、場のカードを1枚タップして「このカードで不思議を建てる」を選びます。</p>'; }
  openLayer(sheet(W.name, h));
}
function openTokenSheet(t) {
  openLayer(sheet('進歩トークン「' + E.TOKENS[t].name + '」', '<div style="display:flex;gap:14px;align-items:center"><img src="' + A.iconURL('tok', t, 128) + '" style="width:90px;height:90px" alt=""><p>' + esc(E.TOKENS[t].text) + '</p></div><p class="note">同じ科学シンボルを2つそろえると、場の進歩トークンを1つもらえます。</p>'));
}
function openCitySheet(seat) {
  const d = client.disp, pl = d.p[seat];
  let h = '';
  ['brown', 'grey', 'blue', 'green', 'red', 'yellow', 'purple'].forEach((t) => {
    const cs = pl.cards.filter((c) => E.CARDS[c].type === t);
    if (!cs.length) return;
    h += '<div class="ctitle" style="color:' + typeColor(t) + '">' + E.TYPE_NAME[t] + '（' + cs.length + '）</div><div class="citygrid">' + cs.map((c) => '<img src="' + A.cardURL(c) + '" data-c="' + c + '" alt="' + esc(E.CARDS[c].name) + '">').join('') + '</div>';
  });
  if (!h) h = '<p class="note">まだ建物がありません。</p>';
  const sc = E.score(d)[seat], pr = E.prices(d, seat);
  h += '<div class="ctitle">交易の値段（' + esc(nameOf(seat)) + 'が買う場合）</div><div class="costline">' + E.RES.map((k) => icon('res', k) + pr[k]).join('　') + '</div>';
  h += '<div class="ctitle">今の勝利点の内訳</div><p class="note">青' + sc.blue + '・緑' + sc.green + '・黄' + sc.yellow + '・ギルド' + sc.guild + '・不思議' + sc.wonder + '・進歩' + sc.tok + '・軍事' + sc.mil + '・コイン' + sc.coin + ' ＝ <b style="color:#ffe7a6">' + sc.total + '</b></p>';
  if (d.discard && d.discard.length) h += '<div class="ctitle">捨て札（' + d.discard.length + '）</div><div class="citygrid">' + d.discard.map((c) => '<img src="' + A.cardURL(c) + '" data-c="' + c + '" alt="">').join('') + '</div>';
  const el = openLayer(sheet(nameOf(seat) + 'の都市', h));
  el.querySelectorAll('[data-c]').forEach((im) => im.addEventListener('click', () => { const c = +im.dataset.c; openLayer(sheet(E.CARDS[c].name, '<div class="cardsheet"><img class="big" src="' + A.cardURL(c) + '" alt=""><div>' + cardInfoHTML(c) + '</div></div>')); }));
}
function openPending() {
  const d = client.view;
  if (!d || !d.pend || !canAct(d)) return;
  const P = d.pend, me = P.seat;
  let title = '', body = '';
  const back = '<button class="btn ghost" data-peek style="margin-top:12px;width:100%">盤面を見る（あとで選ぶ）</button>';
  if (P.k === 'progress' || P.k === 'library') {
    title = P.k === 'library' ? '大図書館：1つ選ぶ' : '科学のペア！ 進歩トークンを選ぶ';
    body = '<div class="opts">' + P.opts.map((t) => t < 0 ? '' : '<button class="opt" data-o="' + t + '"><img class="tk" src="' + A.iconURL('tok', t, 128) + '" alt=""><b>' + esc(E.TOKENS[t].name) + '</b><small>' + esc(E.TOKENS[t].text) + '</small></button>').join('') + '</div>';
    snd.play('pair');
  } else if (P.k === 'destroy') {
    title = '相手のカードを1枚捨てさせる';
    body = '<div class="opts">' + P.opts.map((c) => '<button class="opt" data-o="' + c + '"><img class="cd" src="' + A.cardURL(c) + '" alt=""><b>' + esc(E.CARDS[c].name) + '</b></button>').join('') + '</div>';
  } else if (P.k === 'mausoleum') {
    title = '霊廟：捨て札から1枚を無料で建てる';
    body = '<div class="opts">' + P.opts.map((c) => '<button class="opt" data-o="' + c + '"><img class="cd" src="' + A.cardURL(c) + '" alt=""><b>' + esc(E.CARDS[c].name) + '</b><small>' + esc(E.cardText(c).slice(0, 2).join('・')) + '</small></button>').join('') + '</div>';
  } else if (P.k === 'start') {
    title = AGE_JP[d.age] + 'の先手';
    const why = d.mil === 0 ? '最後にカードを取ったので' : '軍事で押されているので';
    body = '<p>' + why + '、次の時代をどちらから始めるか決められます。</p><div class="row"><button class="btn primary big" data-o="' + me + '">自分から</button><button class="btn big" data-o="' + (1 - me) + '">相手から</button></div>';
  }
  const el = openLayer(sheet(title, body + back, 'center noclose'), null, true);
  el.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => {
    const o = +b.dataset.o; closeLayer();
    sendAct(P.k === 'start' ? { k: 'start', who: o } : P.k === 'progress' || P.k === 'library' ? { k: P.k, tok: o } : { k: P.k, card: o });
  }));
  el.querySelector('[data-peek]').addEventListener('click', () => { client.peek = pendSig(d); closeLayer(); });
}
function pendSig(v) { return v && v.pend ? client.mid + ':' + v.turn + ':' + v.pend.k + ':' + v.pend.seat + ':' + v.age : ''; }
function sendAct(a) {
  if (client.lock) return;
  client.lock = true;
  scene.highlight([]); costCache = null;
  renderPrompt();
  if (session.kind === 'guest') session.link.send({ k: 'act', mid: client.mid, a });
  else if (host) host.act(session.myCid, a);
  setTimeout(() => { if (client.lock && !presenting) { client.lock = false; renderAll(); } }, 4000);
}

/* ================================================================ Host: runs the director and the engine */
let host = null;
const cpuWorker = (() => { try { return new Worker('cpu-worker.js'); } catch (e) { return null; } })();
let cpuSeq = 0;
const cpuWait = {};
if (cpuWorker) cpuWorker.onmessage = (e) => { const f = cpuWait[e.data.id]; delete cpuWait[e.data.id]; if (f) f(e.data.a); };
function cpuChoose(state, level) {
  const seed = (Math.random() * 4294967295) >>> 0;
  if (!cpuWorker) return Promise.resolve(AI.choose(state, level, E.mulberry32(seed)));
  return new Promise((res) => {
    const id = ++cpuSeq;
    const to = setTimeout(() => { if (cpuWait[id]) { delete cpuWait[id]; res(AI.choose(state, level, E.mulberry32(seed))); } }, 8000);
    cpuWait[id] = (a) => { clearTimeout(to); res(a || AI.choose(state, level, E.mulberry32(seed))); };
    cpuWorker.postMessage({ id, state, level, seed });
  });
}
class Host {
  constructor(director, online) { this.d = director; this.online = online; this.cpuBusy = false; this.gen = 0; }
  get match() { return this.d.cur != null ? this.d.matches[this.d.cur] : null; }
  ent(seat) { const m = this.match; return this.d.byId(m.seats[seat]); }
  allCpu() { const m = this.match; return !!(m && m.state && this.ent(0).cpu && this.ent(1).cpu); }
  ctrlFor(cid) { const m = this.match, out = []; if (!m || !m.seats) return out; [0, 1].forEach((s) => { const e = this.ent(s); if (!e.cpu && e.owner === cid) out.push(s); }); return out; }
  payload(cid, events, fresh) {
    const m = this.match, st = m.state || m.final, ctrl = this.ctrlFor(cid), omni = ctrl.length === 0;
    const seatArg = ctrl.length === 1 ? ctrl[0] : (st.pend ? st.pend.seat : st.active);
    return { mid: m.id, view: E.viewFor(st, seatArg, omni), events: events || [], ctrl, omni, fresh: !!fresh,
      names: [this.ent(0).name, this.ent(1).name], cpu: [this.ent(0).cpu || 0, this.ent(1).cpu || 0], tour: this.d.summary() };
  }
  send(events, fresh) {
    receive(this.payload(session.myCid, events, fresh));
    if (this.online && session.link) {
      room.members.forEach((mb) => { if (mb.cid !== 'h') session.link.send(mb.cid, { k: 'match', p: this.payload(mb.cid, events, fresh) }); });
    }
  }
  sendTo(cid) { if (this.match && session.link) session.link.send(cid, { k: 'match', p: this.payload(cid, [], true) }); }
  startNext() { const m = this.d.start(); if (!m) return false; this.gen++; this.send([], true); this.pump(); return true; }
  rematch() { this.d.rematch(); this.gen++; this.send([], true); this.pump(); }
  act(cid, a) {
    const m = this.match; if (!m || !m.state) return;
    const st = m.state, seat = st.pend ? st.pend.seat : st.active;
    if (st.phase === 'over' || this.ctrlFor(cid).indexOf(seat) < 0) return;
    const r = E.apply(st, seat, a);
    if (!r.ok) { if (cid === session.myCid) { client.lock = false; renderAll(); } return; }
    this.after(r.events);
  }
  after(events) {
    const m = this.match, st = m.state;
    if (st.phase === 'over') { m.final = st; this.d.finish(m, st.result); m.final = st; }
    this.send(events, false);
    this.pump();
  }
  async pump() {
    const m = this.match; if (!m || !m.state || m.state.phase === 'over' || this.cpuBusy) return;
    const st = m.state, seat = st.pend ? st.pend.seat : st.active, e = this.ent(seat);
    if (!e.cpu) return;
    this.cpuBusy = true;
    const gen = this.gen;
    await idle();
    await new Promise((r) => setTimeout(r, (380 + Math.random() * 380) / spd()));
    await idle();
    const a = await cpuChoose(st, e.cpu);
    this.cpuBusy = false;
    if (gen !== this.gen || this.match !== m || !m.state || m.state.phase === 'over') return;
    const s2 = st.pend ? st.pend.seat : st.active;
    if (s2 !== seat) return;
    const r = E.apply(st, seat, a);
    if (r.ok) this.after(r.events); else console.warn('cpu move rejected', a, r.why);
  }
  fastForward() {
    const m = this.match; if (!m || !m.state || !this.allCpu()) return;
    this.gen++; this.cpuBusy = false;
    const st = m.state, rng = E.mulberry32(m.seed ^ 0x9e37);
    let guard = 0;
    while (st.phase !== 'over' && guard++ < 400) { const s = st.pend ? st.pend.seat : st.active; E.apply(st, s, AI.choose(st, Math.min(2, this.ent(s).cpu), rng)); }
    m.final = st; this.d.finish(m, st.result); m.final = st;
    this.send([], true);
  }
  playerLeft(cid) {
    let changed = false;
    this.d.entrants.forEach((e) => { if (!e.cpu && e.owner === cid) { e.cpu = 2; e.owner = null; e.name = e.name + '(CPU)'; changed = true; } });
    if (changed) { this.send([], false); this.pump(); }
  }
}

/* ================================================================ sessions: offline, host, guest */
const session = { kind: 'none', myCid: 'local', link: null };
let room = null;
function startOffline(entrants, format) {
  leaveOnline();
  session.kind = 'local'; session.myCid = 'local';
  const d = new DIR.Director(entrants, format, (Math.random() * 4294967295) >>> 0);
  host = new Host(d, false);
  client.watchSpeed = 1;
  host.startNext();
}
function leaveOnline() {
  if (session.link) { try { session.link.close(); } catch (e) { /* gone */ } }
  session.link = null; room = null;
  if (session.kind === 'host' || session.kind === 'guest') session.kind = 'none';
}

/* ---- online host ---- */
async function createRoom() {
  showErr('');
  const link = N.makeHost(NETKIND);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code = TEST && params.get('code') ? params.get('code') : N.makeCode();
    try { await link.host(code); break; } catch (e) { if (e.code !== 'taken' || i === 3) { showErr(netErr(e)); return; } }
  }
  leaveOnline();
  session.kind = 'host'; session.myCid = 'h'; session.link = link;
  room = { code, format: 'duel', members: [{ cid: 'h', name: myName(), play: true, host: true }], cpus: [], started: false };
  host = null;
  link.on('join', () => {});
  link.on('msg', (cid, m) => hostMsg(cid, m));
  link.on('leave', (cid) => {
    const mb = room.members.find((x) => x.cid === cid);
    room.members = room.members.filter((x) => x.cid !== cid);
    if (mb) toast(esc(mb.name) + ' が退出しました');
    if (host) host.playerLeft(cid);
    pushRoom();
  });
  showLobby();
}
function hostMsg(cid, m) {
  if (!room) return;
  if (m.k === 'hello') {
    if (m.proto !== N.PROTOCOL) { session.link.send(cid, { k: 'err', text: 'バージョンが違います。ページを再読み込みしてください。' }); return; }
    if (!room.members.find((x) => x.cid === cid)) room.members.push({ cid, name: N.cleanName(m.name) || 'ゲスト', play: !room.started });
    session.link.send(cid, { k: 'welcome', cid });
    toast(esc(N.cleanName(m.name) || 'ゲスト') + ' が入室しました');
    pushRoom();
    if (room.started && host && host.match) host.sendTo(cid);
  } else if (m.k === 'act') { if (host && host.match && m.mid === host.match.id) host.act(cid, m.a); }
  else if (m.k === 'role') { const mb = room.members.find((x) => x.cid === cid); if (mb && !room.started) { mb.play = !!m.play; pushRoom(); } }
  else if (m.k === 'emote') { const mb = room.members.find((x) => x.cid === cid); relayEmote(mb ? mb.name : '?', m.e); }
}
function relayEmote(name, e) {
  if (!/^[\u{1F300}-\u{1FAFF}☀-➿]{1,2}$/u.test(e)) return;
  showEmote(name, e);
  if (session.link) session.link.broadcast({ k: 'emote', from: name, e });
}
function roomSummary() { return { code: room.code, format: room.format, started: room.started, members: room.members.map((x) => ({ cid: x.cid, name: x.name, play: x.play, host: !!x.host })), cpus: room.cpus.slice() }; }
function pushRoom() { if (!room || !session.link) return; session.link.broadcast({ k: 'room', room: roomSummary() }); if (!$('#scrOnline').hidden) renderLobby(); }
function hostStart() {
  const players = room.members.filter((x) => x.play).map((x) => ({ name: x.name, cpu: 0, owner: x.cid })).concat(room.cpus.map((c) => ({ name: c.name, cpu: c.level, owner: null })));
  if (players.length < 2) { showErr('参加者が2人以上必要です（CPUを足せます）'); return; }
  const fmt = players.length === 2 ? 'duel' : room.format === 'duel' ? 'duel' : room.format;
  const ent = fmt === 'duel' ? players.slice(0, 2) : players;
  room.started = true; pushRoom();
  const d = new DIR.Director(ent, fmt, (Math.random() * 4294967295) >>> 0);
  host = new Host(d, true);
  host.startNext();
}
function backToLobby() {
  if (session.kind !== 'host') return;
  host = null; room.started = false; pushRoom();
  session.link.broadcast({ k: 'lobby' });
  hideResult(); showLobby();
}

/* ---- online guest ---- */
async function joinRoom(code) {
  showErr('');
  code = N.cleanCode(code);
  if (code.length !== 4) { showErr('4文字の部屋コードを入れてください'); return; }
  const link = N.makeGuest(NETKIND);
  try { await link.join(code); } catch (e) { showErr(netErr(e)); return; }
  leaveOnline();
  session.kind = 'guest'; session.link = link; session.myCid = null; host = null;
  room = { code, members: [], cpus: [], started: false, format: 'duel' };
  link.on('msg', (m) => guestMsg(m));
  link.on('close', () => { if (session.link === link) { toast('ホストとの接続が切れました', '#ff6d5c', 5000); session.kind = 'none'; session.link = null; setTimeout(() => toTitle(), 1600); } });
  link.send({ k: 'hello', name: myName(), proto: N.PROTOCOL });
  showLobby();
}
function guestMsg(m) {
  if (m.k === 'welcome') session.myCid = m.cid;
  else if (m.k === 'room') { room = m.room; if (!$('#scrOnline').hidden) renderLobby(); }
  else if (m.k === 'match') { $('#scrOnline').hidden = true; receive(m.p); }
  else if (m.k === 'emote') showEmote(m.from, m.e);
  else if (m.k === 'lobby') { hideResult(); showLobby(); }
  else if (m.k === 'err') showErr(m.text);
  else if (m.k === 'full') showErr('部屋がいっぱいです');
}
function netErr(e) {
  const c = e && e.code;
  return c === 'notfound' ? 'その部屋が見つかりません。コードを確かめてください。' : c === 'lib' ? '通信ライブラリを読み込めませんでした。' : c === 'taken' ? '部屋を作れませんでした。もう一度お試しください。' : '接続できませんでした。電波の良い所でもう一度お試しください。';
}
function showErr(t) { const e = $('#onErr'); e.hidden = !t; e.textContent = t || ''; }

/* ---- lobby screen ---- */
function showLobby() {
  showScreen('scrOnline');
  $('#onPick').hidden = true; $('#onLobby').hidden = false;
  renderLobby();
}
function renderLobby() {
  if (!room) return;
  const isHost = session.kind === 'host';
  $('#lobCode').textContent = room.code;
  $('#lobFmtField').style.pointerEvents = isHost ? '' : 'none';
  $('#lobFmtField').style.opacity = isHost ? '' : '.7';
  document.querySelectorAll('#segOnFormat button').forEach((b) => b.classList.toggle('on', b.dataset.v === room.format));
  const total = room.members.length;
  $('#lobCount').textContent = total + '人' + (room.cpus.length ? '＋CPU' + room.cpus.length : '');
  let h = '';
  room.members.forEach((mb) => {
    const me = mb.cid === (isHost ? 'h' : session.myCid);
    h += '<div class="ent"><div class="emb" style="--sc:' + (mb.play ? 'var(--gold)' : '#6b7a99') + '">' + esc(mb.name.slice(0, 1)) + '</div><span class="nmx">' + esc(mb.name) + (mb.host ? ' 👑' : '') + (me ? '（あなた）' : '') + '</span>' +
      (isHost && !room.started ? '<button class="tag ' + (mb.play ? 'play' : '') + '" data-toggle="' + esc(mb.cid) + '">' + (mb.play ? '参加' : '観戦') + '</button>' : '<span class="tag ' + (mb.play ? 'play' : '') + '">' + (mb.play ? '参加' : '観戦') + '</span>') + '</div>';
  });
  room.cpus.forEach((c, i) => {
    h += '<div class="ent"><div class="emb" style="--sc:#5fc6ff">' + esc(c.name.slice(0, 1)) + '</div><span class="nmx">' + esc(c.name) + '</span>' +
      (isHost && !room.started ? '<select data-cpulv="' + i + '">' + [1, 2, 3, 4].map((l) => '<option value="' + l + '"' + (l === c.level ? ' selected' : '') + '>' + LEVEL[l] + '</option>').join('') + '</select><button class="x" data-cpux="' + i + '">✕</button>' : '<span class="tag cpu">CPU・' + LEVEL[c.level] + '</span>') + '</div>';
  });
  $('#lobList').innerHTML = h;
  $('#lobCpuRow').hidden = !isHost || room.started;
  $('#lobStart').hidden = !isHost || room.started;
  const meMb = room.members.find((x) => x.cid === session.myCid);
  $('#lobWatchToggle').hidden = isHost || room.started || !meMb;
  if (meMb) $('#lobWatchToggle').textContent = meMb.play ? '観戦だけにする' : '参加する';
  const players = room.members.filter((x) => x.play).length + room.cpus.length;
  $('#lobNote').textContent = room.started ? '対戦中です。始まると自動で画面が切り替わります。' :
    isHost ? (room.format === 'duel' ? '「参加」の先頭2人が対戦し、ほかの人は観戦します。' : '「参加」の全員で' + (room.format === 'league' ? '総当たり' : 'トーナメント') + '。試合に出ていない人は観戦します。') + '（参加 ' + players + '）' :
      'ホストが始めるのを待っています。観戦者は伏せ札も含めてすべて見られます。';
}

/* ================================================================ emotes */
const EMOTES = ['👏', '😲', '🔥', '😭', '🤔', '👑'];
function showEmote(name, e) {
  const el = document.createElement('div');
  el.className = 'floatemo';
  el.innerHTML = esc(e) + '<small>' + esc(name) + '</small>';
  const r = stageRect();
  el.style.left = (r.width * (0.55 + Math.random() * 0.35)) + 'px';
  el.style.top = (r.height * 0.75) + 'px';
  $('#stageWrap').appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

/* ================================================================ tournament board */
function tourBoardHTML(t) {
  const name = (eid) => { const e = t.entrants.find((x) => x.eid === eid); return e ? e.name : '—'; };
  let h = '';
  if (t.over && t.champion != null) h += '<div class="champ">👑 優勝 ' + esc(name(t.champion)) + '</div>';
  if (t.format === 'league') {
    h += '<table class="stand"><thead><tr><th></th><th>名前</th><th>勝点</th><th>勝</th><th>分</th><th>負</th><th>点差</th></tr></thead><tbody>';
    t.standings.forEach((r, i) => { h += '<tr class="' + (i === 0 && r.played ? 'top' : '') + '"><td class="rk">' + (i + 1) + '</td><td class="n">' + esc(r.name) + (r.cpu ? ' <small style="color:var(--dim)">CPU</small>' : '') + '</td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + (r.vp > 0 ? '+' : '') + r.vp + '</td></tr>'; });
    h += '</tbody></table><div class="ctitle">試合</div><div class="mlist">';
    let nextMarked = false;
    t.matches.forEach((m) => {
      const live = m.status === 'live', done = m.status === 'done';
      const isNext = !nextMarked && m.status === 'wait'; if (isNext) nextMarked = true;
      const sc = done && m.score ? (m.seats[0] === m.a ? m.score[0] + '-' + m.score[1] : m.score[1] + '-' + m.score[0]) : live ? '対戦中' : '—';
      const cls = (eid) => (done ? (m.winner === eid ? 'w' : m.winner === -1 ? '' : 'l') : '');
      h += '<div class="mrow' + (live ? ' live' : isNext ? ' next' : '') + '"><span class="r">第' + m.round + '節</span><span class="p ' + cls(m.a) + '">' + esc(name(m.a)) + '</span><span class="sc">' + sc + (done && m.how && m.how !== 'civil' ? '<br><small>' + (m.how === 'military' ? '軍事' : '科学') + '</small>' : '') + '</span><span class="p ' + cls(m.b) + '">' + esc(name(m.b)) + '</span></div>';
    });
    h += '</div>';
  } else if (t.format === 'cup') {
    h += '<div class="bracket">';
    t.rounds.forEach((ids, r) => {
      h += '<div class="bcol"><h5>' + esc(roundName(t, r + 1)) + '</h5>';
      ids.forEach((id) => {
        const m = t.matches[id];
        const row = (eid, s) => { const done = m.status === 'done'; const c = done ? (m.winner === eid ? 'w' : 'l') : ''; return '<div class="' + c + '"><span>' + (eid == null ? (m.bye ? '（不戦）' : '…') : esc(name(eid))) + '</span><b>' + (s != null ? s : '') + '</b></div>'; };
        const sa = m.score && m.seats ? (m.seats[0] === m.a ? m.score[0] : m.score[1]) : null, sb = m.score && m.seats ? (m.seats[0] === m.a ? m.score[1] : m.score[0]) : null;
        h += '<div class="bm' + (m.status === 'live' ? ' live' : '') + '">' + row(m.a, sa) + row(m.b, sb) + '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="ctitle">勝敗</div><table class="stand"><tbody>' + t.standings.map((r) => '<tr><td class="n" style="color:' + (r.alive ? '#ffe7a6' : 'var(--dim)') + '">' + esc(r.name) + '</td><td>' + r.w + '勝' + r.l + '敗</td></tr>').join('') + '</tbody></table>';
  }
  return h;
}
function openTourBoard() {
  const t = client.tour; if (!t) return;
  const ctl = session.kind !== 'guest';
  let foot = '';
  if (ctl && client.ended && !t.over) foot = '<button class="btn primary big" data-tb="next" style="margin-top:12px;width:100%">次の試合へ</button>';
  if (ctl && t.over) foot = '<div class="row" style="margin-top:12px"><button class="btn primary" data-tb="' + (session.kind === 'host' ? 'lobby' : 'again') + '">' + (session.kind === 'host' ? '部屋にもどる' : '同じ顔ぶれでもう一度') + '</button><button class="btn" data-tb="title">タイトルへ</button></div>';
  const el = openLayer(sheet(t.format === 'league' ? '総当たり表' : 'トーナメント表', tourBoardHTML(t) + foot));
  el.querySelectorAll('[data-tb]').forEach((b) => b.addEventListener('click', () => { closeLayer(); resultAction(b.dataset.tb); }));
}

/* ================================================================ result actions / navigation */
function resultAction(k) {
  if (k === 'rematch') { if (host) { hideResult(); host.rematch(); } }
  else if (k === 'harder') {
    const sc = soloContext(); if (!sc) return;
    prefs.level = sc.lv + 1; store.set('level', prefs.level);
    startOffline([{ name: myName(), cpu: 0, owner: 'local' }, { name: CPU_NAMES[(Math.random() * CPU_NAMES.length) | 0], cpu: prefs.level, owner: null }], 'duel');
  }
  else if (k === 'next') { if (host) { hideResult(); if (!host.startNext()) openTourBoard(); } }
  else if (k === 'board') openTourBoard();
  else if (k === 'look') { hideResult(); showReopen(); }
  else if (k === 'lobby') backToLobby();
  else if (k === 'title') toTitle();
  else if (k === 'again') {
    const t = client.tour;
    startOffline(t.entrants.map((e) => ({ name: e.name, cpu: e.cpu, owner: e.cpu ? null : 'local' })), t.format);
  }
}
function showReopen() {
  const p = $('#prompt');
  p.innerHTML = '<span style="pointer-events:auto;cursor:pointer">🏁 結果を見る</span>';
  p.style.pointerEvents = 'auto';
  p.onclick = () => { p.onclick = null; p.textContent = ''; if (client.view && client.view.phase === 'over') showResult(client.view); };
}
function toTitle() {
  leaveOnline();
  host = null; session.kind = 'none';
  queue.length = 0;
  hideResult(); closeLayer();
  $('#cine').hidden = true;
  attract();
  showScreen('scrTitle');
}

/* ================================================================ title attract: a table that deals itself */
function attract() {
  client.ctrl = []; client.omni = true; client.names = ['', '']; client.mid = -1; client.tour = null;
  const st = E.newGame((Math.random() * 1e9) >>> 0);
  const rng = E.mulberry32(7);
  while (st.phase === 'draft') E.apply(st, st.active, AI.choose(st, 1, rng));
  const v = E.viewFor(st, 0, true);
  client.disp = E.clone(v); client.view = v;
  scene.setLoot(v.loot); scene.pawnTo(0, false); scene.setTokens(v.boardTok, true);
  scene.setAge(1); scene.highlight([]);
  scene.dealAge(v, true);
  $('#opp').innerHTML = ''; $('#me').innerHTML = ''; $('#draft').hidden = true; $('#watchBar').hidden = true; $('#prompt').textContent = '';
}

/* ================================================================ setup screens */
function seg(id, value, onPick) {
  const el = $(id);
  el.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', String(b.dataset.v) === String(value));
    b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); snd.play('tap'); };
  });
}
function defaultTourList() {
  return [{ name: myName(), cpu: 0 }, { name: CPU_NAMES[0], cpu: 2 }, { name: CPU_NAMES[1], cpu: 3 }, { name: CPU_NAMES[2], cpu: 1 }];
}
let tourList = prefs.tourList || defaultTourList();
function renderTourList() {
  $('#tourList').innerHTML = tourList.map((e, i) => '<div class="ent"><div class="emb" style="--sc:' + (e.cpu ? '#5fc6ff' : 'var(--gold)') + '">' + esc((e.name || '?').slice(0, 1)) + '</div><input value="' + esc(e.name) + '" maxlength="10" data-tn="' + i + '">' +
    (e.cpu ? '<select data-tl="' + i + '">' + [1, 2, 3, 4].map((l) => '<option value="' + l + '"' + (l === e.cpu ? ' selected' : '') + '>CPU・' + LEVEL[l] + '</option>').join('') + '</select>' : '<span class="tag play">人</span>') +
    '<button class="x" data-tx="' + i + '" aria-label="外す">✕</button></div>').join('');
  $('#tourAddHuman').disabled = $('#tourAddCpu').disabled = tourList.length >= 12;
  $('#tourStart').disabled = tourList.length < 2;
}
function saveTour() { store.set('tourList', tourList); }

/* ================================================================ input wiring */
function wire() {
  // canvas picking
  const cv = $('#stage');
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; snd.unlock(); });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; }
    down = null;
    if (!client.disp || !$('#scrTitle').hidden) return;
    const hit = scene.pick(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.tok != null) openTokenSheet(hit.tok);
    else if (hit.slot != null) openCardSheet(hit.slot);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !client.disp) return;
    const hit = scene.pick(e.clientX, e.clientY);
    scene.setHover(hit && hit.slot != null ? hit.slot : null);
    cv.style.cursor = hit ? 'pointer' : '';
  });
  // panels
  ['#me', '#opp'].forEach((sel) => $(sel).addEventListener('click', (e) => {
    const w = e.target.closest('[data-w]'); if (w) { openWonderSheet(+w.dataset.w, +w.dataset.seat); return; }
    const t = e.target.closest('[data-tok]'); if (t) { openTokenSheet(+t.dataset.tok); return; }
    const c = e.target.closest('[data-city]'); if (c) { openCitySheet(+c.dataset.city); return; }
    if (e.target.closest('.sci,.res')) openCitySheet(+$(sel).dataset.seat);
  }));
  // draft
  $('#draft').addEventListener('click', (e) => { const b = e.target.closest('[data-dw]'); if (b && !b.disabled && canAct()) { snd.play('tap'); sendAct({ k: 'draft', w: +b.dataset.dw }); } });
  // prompt (re-open a pending choice)
  $('#prompt').addEventListener('click', () => { if (client.view && client.view.pend && canAct()) { client.peek = ''; openPending(); } });
  // HUD
  $('#btnSound').addEventListener('click', () => { const on = !(prefs.sfx || prefs.bgm); prefs.sfx = on; prefs.bgm = on; snd.sfx = on; snd.bgm = on; store.set('sfx', on); store.set('bgm', on); $('#btnSound').classList.toggle('off', !on); });
  $('#btnSound').classList.toggle('off', !(prefs.sfx || prefs.bgm));
  $('#btnLog').addEventListener('click', () => openLayer(sheet('これまでの流れ', client.log.length ? '<ol style="padding-left:1.4em">' + client.log.slice(-120).map((l) => '<li>' + esc(l) + '</li>').join('') + '</ol>' : '<p class="note">まだ何も起きていません。</p>')));
  $('#btnTour').addEventListener('click', openTourBoard);
  $('#btnMenu').addEventListener('click', openMenu);
  $('#watchBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wb]'); if (!b) return;
    if (b.dataset.wb === 'flip') { client.watchPersp = 1 - client.watchPersp; client.persp = client.watchPersp; scene.setPersp(client.persp); renderAll(); }
    else if (b.dataset.wb === 'spd') { client.watchSpeed = +b.dataset.v; scene.speed = spd(); renderWatchBar(); }
    else if (b.dataset.wb === 'ff' && host) { queue.length = 0; host.fastForward(); }
  });
  $('#emotes').innerHTML = EMOTES.map((e) => '<button data-emo="' + e + '">' + e + '</button>').join('');
  $('#emotes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emo]'); if (!b) return;
    if (session.kind === 'host') relayEmote(myName(), b.dataset.emo);
    else if (session.link) session.link.send({ k: 'emote', e: b.dataset.emo });
  });
  // result buttons
  $('#resBtns').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { snd.play('tap'); resultAction(b.dataset.r); } });
  // title
  const nameIn = $('#inName');
  nameIn.value = prefs.name;
  nameIn.addEventListener('input', () => { prefs.name = N.cleanName(nameIn.value); store.set('name', prefs.name); });
  const unlockAudio = () => { snd.unlock(); if (prefs.bgm && !snd.bgm) snd.bgm = true; };
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  $('#goSolo').addEventListener('click', () => { showScreen('scrSolo'); });
  $('#goLocal2').addEventListener('click', () => startOffline([{ name: myName(), cpu: 0, owner: 'local' }, { name: 'ふたりめ', cpu: 0, owner: 'local' }], 'duel'));
  $('#goTour').addEventListener('click', () => { showScreen('scrTour'); seg('#segFormat', prefs.format, (v) => { prefs.format = v; store.set('format', v); }); renderTourList(); });
  $('#goOnline').addEventListener('click', () => { showScreen('scrOnline'); $('#onPick').hidden = false; $('#onLobby').hidden = true; showErr(''); });
  $('#goRules').addEventListener('click', () => openLayer($('#tplRules').innerHTML));
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { if (session.kind === 'host' || session.kind === 'guest') leaveOnline(); showScreen('scrTitle'); }));
  seg('#segLevel', prefs.level, (v) => { prefs.level = +v; store.set('level', +v); });
  seg('#segSpeed', prefs.speed, (v) => { prefs.speed = +v; store.set('speed', +v); });
  $('#soloStart').addEventListener('click', () => {
    const lv = prefs.level;
    startOffline([{ name: myName(), cpu: 0, owner: 'local' }, { name: CPU_NAMES[(Math.random() * CPU_NAMES.length) | 0], cpu: lv, owner: null }], 'duel');
  });
  // tournament setup
  $('#tourList').addEventListener('input', (e) => { const i = e.target.dataset.tn; if (i != null) { tourList[+i].name = N.cleanName(e.target.value); saveTour(); } });
  $('#tourList').addEventListener('change', (e) => { const i = e.target.dataset.tl; if (i != null) { tourList[+i].cpu = +e.target.value; saveTour(); } });
  $('#tourList').addEventListener('click', (e) => { const i = e.target.dataset.tx; if (i != null) { tourList.splice(+i, 1); saveTour(); renderTourList(); } });
  $('#tourAddHuman').addEventListener('click', () => { tourList.push({ name: 'プレイヤー' + (tourList.filter((x) => !x.cpu).length + 1), cpu: 0 }); saveTour(); renderTourList(); });
  $('#tourAddCpu').addEventListener('click', () => { const used = new Set(tourList.map((x) => x.name)); const nm = CPU_NAMES.find((n) => !used.has(n)) || 'CPU' + tourList.length; tourList.push({ name: nm, cpu: 2 }); saveTour(); renderTourList(); });
  $('#tourStart').addEventListener('click', () => {
    if (tourList.length < 2) return;
    const ents = tourList.map((e, i) => ({ name: N.cleanName(e.name) || (e.cpu ? 'CPU' : 'プレイヤー') + (i + 1), cpu: e.cpu, owner: e.cpu ? null : 'local' }));
    startOffline(ents, ents.length === 2 ? 'duel' : prefs.format);
  });
  // online
  $('#onCreate').addEventListener('click', createRoom);
  $('#onJoin').addEventListener('click', () => joinRoom($('#onCode').value));
  $('#onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('#onCode').value); });
  $('#lobInvite').addEventListener('click', () => {
    const url = location.origin + location.pathname + '?room=' + room.code;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('招待リンクをコピーしました'), () => toast(esc(url)));
    else toast(esc(url));
  });
  $('#segOnFormat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && session.kind === 'host' && room && !room.started) { room.format = b.dataset.v; pushRoom(); } });
  $('#lobList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]'); if (t && session.kind === 'host') { const mb = room.members.find((x) => x.cid === t.dataset.toggle); if (mb) { mb.play = !mb.play; pushRoom(); } }
    const x = e.target.closest('[data-cpux]'); if (x && session.kind === 'host') { room.cpus.splice(+x.dataset.cpux, 1); pushRoom(); }
  });
  $('#lobList').addEventListener('change', (e) => { const s = e.target.dataset.cpulv; if (s != null && session.kind === 'host') { room.cpus[+s].level = +e.target.value; pushRoom(); } });
  $('#lobAddCpu').addEventListener('click', () => { if (!room || room.cpus.length >= 11) return; const used = new Set(room.cpus.map((c) => c.name).concat(room.members.map((m) => m.name))); room.cpus.push({ name: CPU_NAMES.find((n) => !used.has(n)) || 'CPU', level: 2 }); pushRoom(); });
  $('#lobStart').addEventListener('click', hostStart);
  $('#lobWatchToggle').addEventListener('click', () => { const mb = room && room.members.find((x) => x.cid === session.myCid); if (mb && session.link) session.link.send({ k: 'role', play: !mb.play }); });
  // keyboard
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (cineSkip) cineSkip(); else closeLayer(); } });
}
function openMenu() {
  const inGame = session.kind !== 'none' && client.mid >= 0;
  const q = (v) => '<button data-v="' + v + '"' + (prefs.quality === v ? ' class="on"' : '') + '>' + { high: '高', mid: '中', low: '低' }[v] + '</button>';
  const sp = (v, l) => '<button data-v="' + v + '"' + (prefs.speed === v ? ' class="on"' : '') + '>' + l + '</button>';
  const h = '<div class="stack">' +
    '<div class="field"><span>BGM</span><div class="seg" id="mBgm"><button data-v="1"' + (prefs.bgm ? ' class="on"' : '') + '>オン</button><button data-v="0"' + (!prefs.bgm ? ' class="on"' : '') + '>オフ</button></div></div>' +
    '<div class="field"><span>効果音</span><div class="seg" id="mSfx"><button data-v="1"' + (prefs.sfx ? ' class="on"' : '') + '>オン</button><button data-v="0"' + (!prefs.sfx ? ' class="on"' : '') + '>オフ</button></div></div>' +
    '<div class="field"><span>演出の速さ</span><div class="seg" id="mSpeed">' + sp(0.75, 'じっくり') + sp(1, 'ふつう') + sp(1.6, 'はやい') + '</div></div>' +
    '<div class="field"><span>画質（再読み込みで反映）</span><div class="seg" id="mQ">' + q('high') + q('mid') + q('low') + '</div></div>' +
    '<a class="btn" href="tutorial.html" target="_blank" rel="noopener" style="text-decoration:none">チュートリアル（別タブ）</a><button class="btn" id="mRules">あそびかた</button><button class="btn" id="mCards">カード一覧</button>' +
    (inGame ? '<button class="btn ghost" id="mTitle">' + (session.kind === 'host' ? '部屋を閉じてタイトルへ' : session.kind === 'guest' ? '退出してタイトルへ' : 'やめてタイトルへ') + '</button>' : '') + '</div>';
  const el = openLayer(sheet('メニュー', h));
  const segb = (id, f) => el.querySelector(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll(id + ' button').forEach((x) => x.classList.toggle('on', x === b)); f(b.dataset.v); });
  segb('#mBgm', (v) => { prefs.bgm = v === '1'; store.set('bgm', prefs.bgm); snd.bgm = prefs.bgm; $('#btnSound').classList.toggle('off', !(prefs.sfx || prefs.bgm)); });
  segb('#mSfx', (v) => { prefs.sfx = v === '1'; store.set('sfx', prefs.sfx); snd.sfx = prefs.sfx; $('#btnSound').classList.toggle('off', !(prefs.sfx || prefs.bgm)); });
  segb('#mSpeed', (v) => { prefs.speed = +v; store.set('speed', +v); scene.speed = spd(); });
  segb('#mQ', (v) => { prefs.quality = v; store.set('quality', v); });
  el.querySelector('#mRules').addEventListener('click', () => openLayer($('#tplRules').innerHTML));
  el.querySelector('#mCards').addEventListener('click', openCatalog);
  const t = el.querySelector('#mTitle'); if (t) t.addEventListener('click', () => { closeLayer(); toTitle(); });
}
function openCatalog() {
  let h = '';
  [[1, AGE_JP[1]], [2, AGE_JP[2]], [3, AGE_JP[3]], [4, 'ギルド']].forEach(([age, label]) => {
    h += '<div class="ctitle">' + label + '</div><div class="citygrid">' + E.CARDS.filter((c) => c.age === age).map((c) => '<img src="' + A.cardURL(c.id) + '" data-c="' + c.id + '" alt="' + esc(c.name) + '">').join('') + '</div>';
  });
  h += '<div class="ctitle">不思議</div><div class="citygrid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">' + E.WONDERS.map((w) => '<img src="' + A.wonderURL(w.id) + '" data-wd="' + w.id + '" alt="">').join('') + '</div>';
  h += '<div class="ctitle">進歩トークン</div>' + E.TOKENS.map((t) => '<p style="display:flex;gap:10px;align-items:center;margin:4px 0"><img src="' + A.iconURL('tok', t.id) + '" style="width:36px;height:36px" alt=""><span><b>' + esc(t.name) + '</b>：' + esc(t.text) + '</span></p>').join('');
  const el = openLayer(sheet('カード一覧', h));
  el.querySelectorAll('[data-c]').forEach((im) => im.addEventListener('click', () => { const c = +im.dataset.c; openLayer(sheet(E.CARDS[c].name, '<div class="cardsheet"><img class="big" src="' + A.cardURL(c) + '" alt=""><div>' + cardInfoHTML(c) + '</div></div>')); }));
  el.querySelectorAll('[data-wd]').forEach((im) => im.addEventListener('click', () => { const w = +im.dataset.wd; openLayer(sheet(E.WONDERS[w].name, '<img src="' + A.wonderURL(w, true) + '" style="width:100%;border-radius:12px" alt=""><ul>' + E.wonderText(w).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul><div class="costline">コスト：' + E.WONDERS[w].cost.split('').map((k) => icon('res', k)).join('') + '</div>')); }));
}

/* ================================================================ boot */
async function boot() {
  try {
    await A.loadFonts();
    fx = createFX($('#fx'));
    fx.sound = (n) => snd.play(n);
    fx.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scene = await createScene($('#stage'), { quality: prefs.quality, sfx: (n) => snd.play(n), onFrame: updateBadges });
    scene.speed = prefs.speed;
  } catch (e) {
    console.error(e);
    $('#loaderMsg').textContent = '3D表示を準備できませんでした。別のブラウザで開くか、通信環境を確かめてください。';
    return;
  }
  // keep scene speed in step with the presenter
  setInterval(() => { if (scene) scene.speed = spd(); }, 200);
  wire();
  attract();
  showScreen('scrTitle');
  $('#loader').classList.add('done');
  setTimeout(() => { $('#loader').hidden = true; }, 600);
  const rc = params.get('room');
  if (rc) { showScreen('scrOnline'); $('#onCode').value = N.cleanCode(rc); }
  else if (params.get('mode') === 'solo') showScreen('scrSolo');
  if (TEST) window.__nfd = { wonderCinematic, ageCinematic, get presenting() { return presenting || queue.length > 0; }, client, get host() { return host; }, session, E, AI, startOffline, sendAct, openCardSheet, openPending, createRoom, joinRoom, hostStart, room: () => room, fx, scene };
}
/* pending choices pop up by themselves once the table has settled */
setInterval(() => {
  if (!presenting && client.view && client.view.pend && canAct() && !$('#layer').innerHTML && $('#scrResult').hidden && $('#cine').hidden && client.mid >= 0 && client.peek !== pendSig(client.view)) openPending();
}, 300);
boot();

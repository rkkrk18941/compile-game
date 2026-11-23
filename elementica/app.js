/* エレメンティカ — the page: title, set-up, the turn panels, the boards, the CPU loop, saving and online play.
   The rules live in engine.js (EL_ENG), the CPU in ai.js (EL_AI, run in cpu-worker.js), the map in scene.js.
   In a CPU game or as the host this page owns the game state; a guest only shows the host's state and sends moves.
   A move is one of { k:'prep', hex } { k:'action', move:{ slots, choices } } { k:'produce', plan } { k:'free', a }. */
import { createMap, createFlatMap, SEAT_COLORS, SEAT_NAMES, tokenMark } from './scene.js?v=20261123a';

const E = window.EL_ENG, AI = window.EL_AI, NET = window.EL_NET;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1', AUTO = params.get('auto') === '1', NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const SAVE_KEY = 'elementica.save.v1', NAME_KEY = 'elementica.name', SETUP_KEY = 'elementica.setup';
const VER = '20261123a';

const st = {
  mode: null, S: null, me: 0, tab: 'turn', view: 0, draft: null, flow: null, flowSel: null, flowPick: null, prod: null,
  map: null, logSeen: 0, cpuBusy: false, reqId: 0, setup: null, worker: null, waitingHost: false,
  net: null, code: '', seats: [], cid: null, level: 2, infoHex: null
};
window.__EL = { st, E };

/* ------------------------------------------------------------------ small helpers */
function show(id) { $$('.screen').forEach((s) => { s.hidden = s.id !== id; }); $('#titleBg').hidden = !id; }
function seg(sel, val, onChange) {
  const el = $(sel);
  const set = (v) => { el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); };
  set(val);
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; set(b.dataset.v); onChange(b.dataset.v); };
}
function toast(text, ms) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms || 3200);
}
function pname(pid) { const p = st.S.players[pid]; return p.name + (pid === st.me && st.mode !== 'spectate' ? '（あなた）' : ''); }
function sw(pid) { return '<span class="cdot" style="background:' + SEAT_COLORS[pid] + '"></span>'; }
function fx(atoms) { return esc(E.fxText(atoms)); }
function plantShort(key) { const P = E.PLANTS[key]; return E.COLORS[P.color].name + ['', 'I', 'II', 'III'][P.lv]; }
function isCpu(pid) { return st.S && st.S.players[pid] && st.S.players[pid].cpu > 0; }
function myTurn() { const w = E.who(st.S); return !!w && w.pid === st.me && !isCpu(st.me); }
function save() {
  if (st.mode !== 'solo' || !st.S) return;
  try {
    if (st.S.phase === 'end') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ S: st.S, me: st.me, setup: st.setup }));
  } catch (e) { /* storage full or off */ }
}

/* ------------------------------------------------------------------ boot */
function boot() {
  $('#loader').hidden = true;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
  $('#tResume').hidden = !(saved && saved.S && saved.S.phase !== 'end');
  $('#tResume').onclick = () => { st.mode = 'solo'; st.S = saved.S; st.me = saved.me || 0; st.setup = saved.setup; st.logSeen = st.S.log.length; enterGame(); };
  $('#tSolo').onclick = () => openSolo();
  $('#tOnline').onclick = () => openOnline();
  $('#tRules').onclick = () => openRules();
  const room = params.get('room');
  if (room) { openOnline(); $('#onCode').value = NET.cleanCode(room); }
  else show('scrTitle');
  if (TEST && params.get('start')) {
    const n = +params.get('start') || 3;
    startSolo({ name: 'テスト', n, level: +(params.get('level') || 1), first: 'me', seed: +(params.get('seed') || 7) });
  }
}

function openSolo() {
  let setup = { name: '', n: 3, level: 2, first: 'random' };
  try { setup = Object.assign(setup, JSON.parse(localStorage.getItem(SETUP_KEY) || '{}')); } catch (e) {}
  $('#soName').value = setup.name || localStorage.getItem(NAME_KEY) || '';
  seg('#soN', setup.n, (v) => { setup.n = +v; });
  seg('#soLevel', setup.level, (v) => { setup.level = +v; });
  seg('#soFirst', setup.first, (v) => { setup.first = v; });
  $('#soBack').onclick = () => show('scrTitle');
  $('#soStart').onclick = () => {
    setup.name = NET.cleanName($('#soName').value);
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); if (setup.name) localStorage.setItem(NAME_KEY, setup.name); } catch (e) {}
    startSolo(setup);
  };
  show('scrSolo');
}
const CPU_NAMES = ['ルーメン', 'ヴェルダ', 'イグニス', 'ノクス', 'アクア'];
function startSolo(setup) {
  const players = [{ name: setup.name || 'あなた', cpu: 0 }];
  const names = CPU_NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 1; i < setup.n; i++) players.push({ name: names[i - 1] + '（CPU）', cpu: setup.level });
  const seed = setup.seed || (Math.floor(Math.random() * 1e9) + 1);
  st.mode = 'solo'; st.me = 0; st.setup = setup;
  st.S = E.newGame({ players, seed, first: setup.first === 'me' ? 0 : null });
  st.logSeen = st.S.log.length;
  enterGame();
}

/* ------------------------------------------------------------------ the game screen */
async function enterGame() {
  show(null);
  $('#app').hidden = false;
  st.tab = 'turn'; st.view = st.me; st.draft = null; st.flow = null; st.prod = null; st.cpuBusy = false;
  if (!st.map) {
    const host = $('#mapHost');
    try { st.map = params.get('flat') === '1' ? createFlatMap(host) : await createMap(host, { keepFrame: TEST }); }
    catch (e) { st.map = createFlatMap(host); }
    st.map.onHex(onHex);
    $('#zoomIn').onclick = () => st.map.zoom(0.85);
    $('#zoomOut').onclick = () => st.map.zoom(1.15);
    $('#zoomReset').onclick = () => st.map.resetView();
  }
  $('#tabs').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; st.tab = b.dataset.tab; if (st.tab === 'me') st.view = st.me; renderPanel(); renderTabs(); };
  $('#btnLog').onclick = openLog;
  $('#btnRules').onclick = openRules;
  $('#btnMenu').onclick = openMenu;
  render();
  tick();
}

function render() {
  if (!st.S) return;
  renderTop(); renderPlayers(); renderTabs(); renderPanel(); renderMap();
}
function renderTop() {
  const S = st.S;
  const w = E.who(S);
  const round = S.phase === 'prep' ? '準備' : S.phase === 'end' ? '終了' : (S.final === S.round ? '最終ラウンド' : 'ラウンド' + S.round);
  $('#roundChip').textContent = round + (w && w.kind !== 'prep' ? '・' + ({ action: 'アクション', produce: '魔力生産' }[w.kind]) : '');
  $('#envChip').textContent = '環境 ' + S.env;
}
function renderTabs() { $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab))); }
function renderPlayers() {
  const S = st.S, w = E.who(S);
  $('#players').innerHTML = S.order.map((pid, i) => {
    const p = S.players[pid];
    return '<button type="button" class="pl' + (w && w.pid === pid ? ' on' : '') + '" data-pid="' + pid + '">' +
      '<span class="ord">' + (i + 1) + '番</span>' +
      '<div class="row1"><span class="sw" style="background:' + SEAT_COLORS[pid] + '"></span>' + esc(p.name) + (pid === st.me ? '' : '') + '</div>' +
      '<div class="row2"><span class="vp">' + p.vp + 'VP</span><span>¢' + p.coins + '</span><span>◆' + p.gems + '</span><span>魔' + S.mana[pid].pos + '</span></div></button>';
  }).join('');
  $('#players').onclick = (e) => { const b = e.target.closest('.pl'); if (!b) return; st.view = +b.dataset.pid; st.tab = 'me'; renderTabs(); renderPanel(); };
}
function renderMap() {
  if (!st.map) return;
  const view = { highlight: null, selected: st.infoHex };
  if (st.flow && st.flow.req.k === 'hex') {
    view.highlight = {};
    // only the costs that differ from the usual 2 coins get a label, so the map stays readable
    st.flow.req.options.forEach((o) => { view.highlight[o.hex] = { label: o.cost.total !== 2 ? o.cost.total + '¢' : '' }; });
    view.selected = st.flowSel;
  }
  st.map.update(st.S, view);
  const hint = $('#mapHint');
  if (st.flow && st.flow.req.k === 'hex') { hint.hidden = false; $('#mapHintText').textContent = '光っているマスをタップして選ぶ'; }
  else hint.hidden = true;
}

/* ------------------------------------------------------------------ the turn panel */
function renderPanel() {
  const S = st.S, el = $('#panel');
  if (!S) return;
  if (st.tab === 'me') el.innerHTML = boardHTML(st.view);
  else if (st.tab === 'board') el.innerHTML = commonHTML();
  else if (st.tab === 'all') el.innerHTML = allHTML();
  else el.innerHTML = turnHTML();
  bindPanel();
}
function turnHTML() {
  const S = st.S;
  if (S.phase === 'end') return '<div class="box"><div class="h">ゲーム終了</div><p>' + esc(pname(S.result.order[0])) + 'の勝ちです。</p><button class="btn primary" type="button" data-act="result">結果を見る</button></div>' + recentLog();
  if (st.flow) return flowHTML();
  const w = E.who(S);
  if (st.waitingHost) return '<div class="box waiting"><span class="spin"></span>送信中…</div>';
  if (w.pid === st.me && !isCpu(st.me)) {
    if (w.kind === 'prep') return prepHTML();
    if (w.kind === 'action') return actionHTML(w);
    if (w.kind === 'produce') return produceHTML();
  }
  const who = pname(w.pid), what = { prep: '最初の拠点を置いています', action: 'アクション中（残り' + w.left + '回）', produce: '魔力を生産しています' }[w.kind];
  return '<div class="box waiting">' + (isCpu(w.pid) || st.mode === 'guest' ? '<span class="spin"></span>' : '') + sw(w.pid) + '<span><b>' + esc(who) + '</b>が' + what + '</span></div>' + recentLog();
}
function recentLog() {
  const items = st.S.log.slice(-8).reverse().map((l) => '<li>' + (l.p >= 0 ? sw(l.p) + ' ' : '') + esc(l.t) + '</li>').join('');
  return '<div class="box log"><div class="h">最近のできごと</div><ul>' + items + '</ul></div>';
}

/* ---------- prep ---------- */
function prepHTML() {
  return '<div class="box"><div class="h">最初の拠点を置く</div><p class="small">マップのマスを1つ選んで拠点を置きます。2コイン＋隣の相手の拠点1つにつき1コイン（その人へ）。マスのボーナスと、そこにある計画書チップがもらえます。</p>' +
    '<button class="btn primary" type="button" data-act="prep">マスを選ぶ</button></div>';
}

/* ---------- action ---------- */
function newDraft() { return { slots: [null, null, null], sel: null }; }
function actionHTML(w) {
  const S = st.S, p = S.players[st.me];
  if (!st.draft) st.draft = newDraft();
  const d = st.draft, inDraft = d.slots.filter((s) => s && s.tok).map((s) => s.tok);
  let html = '<div class="box"><div class="h">あなたのアクション <span class="sub">このターン残り' + w.left + '回' + (S.round === 1 ? '（第1ラウンドは1回）' : '') + '</span></div>';
  html += '<div class="slots">' + d.slots.map((s, k) => {
    const sel = d.sel === k ? ' sel' : '';
    if (s && s.tok) {
      const t = S.toks[s.tok];
      return '<div class="slot' + sel + '" data-slot="' + k + '"><span class="num">' + (k + 1) + '</span>' + tokHTML(s.tok, s.face) +
        '<div class="chipline"><button class="btn small" type="button" data-flip="' + k + '">' + (s.face === 'f' ? '裏にする' : '表にする') + '</button>' +
        '<button class="btn small" type="button" data-unset="' + k + '">戻す</button></div></div>';
    }
    const skip = s && s.skip;
    return '<button type="button" class="slot' + sel + (skip ? ' skip' : '') + '" data-slot="' + k + '"><span class="num">' + (k + 1) + '</span>' +
      '<span class="small">空きマス</span><span class="print">' + fx(E.SLOT_PRINT[k]) + '</span>' + (skip ? '<span class="off">使わない</span>' : '<span class="small">タップで使わない</span>') + '</button>';
  }).join('') + '</div>';
  const chips = d.slots.filter((s) => s && s.tok);
  if (chips.length === 3) {
    const rows = E.matchRows(p, chips.map((s) => S.toks[s.tok].color));
    html += rows.length ? '<div class="match">色が' + rows.map((r) => (r + 1) + '行目').join('・') + 'とそろう：' + rows.map((r) => fx(E.FORGE_ROW[r])).join('／') + '</div>'
      : '<div class="small" style="margin-bottom:8px">3枚の色の並びが、自分のプラントの行（左→右）とそろうとボーナス</div>';
  } else html += '<div class="small" style="margin-bottom:8px">左から順に実行。チップを置いたマスは、空きマスの効果のかわりにチップの効果になります。</div>';
  html += '<div class="h">手元の計画書チップ <span class="sub">タップで置く</span></div><div class="toks">';
  const avail = p.standby.filter((id) => inDraft.indexOf(id) < 0);
  html += avail.length ? avail.map((id) => '<button type="button" class="tok" data-tok="' + id + '">' + tokInner(id, 'f') + '</button>').join('') : '<span class="small">手元にチップがありません（このアクションの後、捨て場から戻ります）</span>';
  html += '</div><p class="small">捨て場 ' + p.used.length + '枚・除外 ' + p.removed.length + '枚　¢' + p.coins + '・◆' + p.gems + '</p>';
  html += '<div class="row-actions"><button class="btn primary" type="button" data-act="go">実行する</button><button class="btn" type="button" data-act="reset">リセット</button></div>';
  html += freeHTML() + '</div>';
  if (p.used.length) html += '<details class="box"><summary class="h">捨て場のチップ（' + p.used.length + '枚）</summary><div class="toks">' + p.used.map((id) => '<span class="tok">' + tokInner(id, 'f') + '</span>').join('') + '</div></details>';
  return html;
}
function tokInner(id, face) {
  const t = st.S.toks[id], m = tokenMark(t.type);
  return '<span class="disc ' + t.color + '" style="' + (t.color !== 'W' ? 'background:var(--' + t.color + ')' : '') + '">' + esc(m[0] + m[1]) + '</span>' +
    '<span class="ft">' + esc(E.tokenText(st.S, id, face)) + '</span>' + (face === 'f' ? '<span class="bk">裏：' + esc(E.tokenText(st.S, id, 'b')) + '</span>' : '<span class="bk">（裏向き）</span>');
}
function tokHTML(id, face) { return '<span class="tok' + (face === 'b' ? ' back' : '') + '">' + tokInner(id, face) + '</span>'; }
function freeHTML() {
  const S = st.S, p = S.players[st.me], price = E.gemPrice(S.env);
  const colored = p.standby.concat(p.used).filter((id) => S.toks[id].color !== 'N');
  const light = p.objs.some((o) => !o.dark);
  return '<div class="free">' +
    '<button class="btn small" type="button" data-free="g2c"' + (p.gems < 3 ? ' disabled' : '') + '>3ジェム→1コイン</button>' +
    '<button class="btn small" type="button" data-free="buy"' + (p.coins < price ? ' disabled' : '') + '>ジェムを買う（' + price + 'コイン）</button>' +
    '<button class="btn small" type="button" data-free="rm2"' + (colored.length < 2 ? ' disabled' : '') + '>同じ色2枚を除外</button>' +
    '<button class="btn small" type="button" data-free="flip"' + (!light || !colored.length ? ' disabled' : '') + '>目標を裏返して1枚除外</button></div>';
}

/* ---------- production ---------- */
function produceHTML() {
  const S = st.S, p = S.players[st.me], info = E.produceInfo(S, st.me);
  if (!st.prod || st.prod.seq !== S.seq) st.prod = defaultProduce(info, p);
  const plan = { fire: st.prod.fire, dark: st.prod.dark, disc: st.prod.disc };
  const r = E.produceResult(S, st.me, plan);
  let html = '<div class="box"><div class="h">魔力生産</div>';
  if (!info.parts.length && !info.fire.length && !info.dark.length) html += '<p class="small">まだ魔力を生むプラントがありません。</p>';
  info.parts.forEach((x) => {
    const label = x.kind === 'gaia' ? plantShort(p.forge[x.space].key) + '（環境ボーナス込み）' : x.kind === 'water' ? '水のプラント（水利権' + p.water + 'を割り振り）' : 'アーティファクト（対応する色のチップ）';
    html += '<div class="opt" style="cursor:default"><span class="k">' + esc(label) + '</span><span class="r">魔力' + x.mana + '</span></div>';
  });
  info.fire.forEach((t, i) => { html += stepper('fire', i, plantShort(p.forge[t.space].key), t.gem + 'ジェム→魔力' + t.mana, st.prod.fire[i], t.uses); });
  info.dark.forEach((t, i) => { html += stepper('dark', i, plantShort(p.forge[t.space].key), t.coin + 'コイン→魔力' + t.mana, st.prod.dark[i], t.uses); });
  html += '<div class="box" style="margin:10px 0 6px;background:#121a2b"><div class="kv"><span>合計 <b>魔力' + r.total + '</b></span><span>支払い ' + (r.gems ? r.gems + 'ジェム ' : '') + (r.coins ? r.coins + 'コイン' : '') + (!r.gems && !r.coins ? 'なし' : '') + '</span></div>';
  html += '<div class="field" style="margin:8px 0 0"><span>魔力トラックに置く位置（低くすると次のラウンドで先に動けます）</span>' +
    '<input type="range" id="discRange" min="0" max="' + r.total + '" value="' + r.disc + '"><div class="kv"><span>位置 <b>' + r.disc + '</b></span><span>もらえる <b>' + r.vp + 'VP・' + r.gain + 'コイン</b></span></div></div></div>';
  if (!r.ok) html += '<p class="note warn">ジェムかコインが足りません。</p>';
  html += '<div class="row-actions"><button class="btn primary" type="button" data-act="produce"' + (r.ok ? '' : ' disabled') + '>生産する</button></div>';
  html += freeHTML() + '</div>';
  html += '<p class="small">このあと収入（めくった収入タイル）と給料（労働力' + p.work + '：' + E.SALARY[p.work] + 'コイン）があります。</p>';
  return html;
}
function stepper(kind, i, name, text, val, max) {
  return '<div class="opt" style="cursor:default"><span><span class="k">' + esc(name) + '</span><br><span class="d">' + esc(text) + '（最大' + max + '回）</span></span>' +
    '<span class="r chipline"><button class="btn small" type="button" data-step="' + kind + ':' + i + ':-1">−</button><b style="min-width:2ch;text-align:center">' + val + '</b><button class="btn small" type="button" data-step="' + kind + ':' + i + ':1">＋</button></span></div>';
}
function defaultProduce(info, p) {
  let gems = p.gems, coins = Math.max(0, p.coins - E.SALARY[p.work]);
  const fire = info.fire.map((t) => { const u = Math.min(t.uses, Math.floor(gems / t.gem)); gems -= u * t.gem; return u; });
  const dark = info.dark.map((t) => { const u = Math.min(t.uses, Math.floor(coins / t.coin)); coins -= u * t.coin; return u; });
  return { seq: st.S.seq, fire, dark, disc: null };
}

/* ---------- choices inside an action (hex / build / objective) ---------- */
function startFlow(gen, clone, done) {
  const answers = [];
  const step = (input, first) => {
    let r;
    try { r = first ? gen.next() : gen.next(input); }
    catch (e) { st.flow = null; toast('その手は打てません（' + e.message + '）'); render(); return; }
    if (r.done) { st.flow = null; st.flowSel = null; st.flowPick = null; done(answers); return; }
    st.flow = { req: r.value, clone, answer: (a) => { answers.push(a == null ? null : a); st.flowSel = null; st.flowPick = null; step(a == null ? null : a); } };
    st.flowSel = null; st.flowPick = null;
    st.tab = 'turn';
    render();
  };
  step(undefined, true);
}
function flowHTML() {
  const f = st.flow, req = f.req, C = f.clone, p = C.players[st.me];
  let html = '<div class="prompt">';
  if (req.k === 'hex') {
    html += '<div class="q">' + (req.prep ? '最初の拠点を置くマスを選んでください' : '拠点を置くマスを選んでください') + '</div>';
    html += '<p class="small">マップの光っているマスをタップするか、下のリストから選びます。手持ち ¢' + p.coins + '</p>';
    if (st.flowSel != null) {
      const o = req.options.find((x) => x.hex === st.flowSel), h = C.hexes[st.flowSel];
      html += '<div class="box" style="background:#141c2e">' + hexInfoHTML(C, h) + '<p class="small">費用：' + o.cost.supply + 'コイン' + (o.cost.rivals.length ? '＋相手へ' + o.cost.rivals.length + 'コイン' : '') + '</p>' +
        '<button class="btn primary" type="button" data-answer="hex">ここに置く</button></div>';
    }
    const opts = req.options.slice().sort((a, b) => a.cost.total - b.cost.total || C.hexes[a.hex].area - C.hexes[b.hex].area);
    html += '<details' + (st.flowSel == null ? ' open' : '') + '><summary class="small">マスの一覧（' + opts.length + '）</summary><div class="opts" style="margin-top:6px">' + opts.map((o) => {
      const h = C.hexes[o.hex], t = h.token ? C.toks[h.token] : null;
      return '<button class="opt" type="button" data-hex="' + o.hex + '"><span><span class="k">' + E.AREAS[h.area].name + 'エリア ' + fx(h.bonus) + '</span><br><span class="d">' +
        (t ? 'チップ：<span class="cdot c' + t.color + '"></span> ' + esc(E.tokenText(C, h.token, 'f')) : 'チップなし') + (h.ring === 4 ? '・外周' : '') + '</span></span><span class="r">' + o.cost.total + 'コイン</span></button>';
    }).join('') + '</div></details>';
    if (!req.prep) html += '<div class="row-actions" style="margin-top:8px"><button class="btn" type="button" data-answer="skip">拠点を置かない</button></div>';
  } else if (req.k === 'build') {
    html += '<div class="q">建てるプラントを選んでください</div><p class="small">手持ち ¢' + p.coins + '・◆' + p.gems + '</p>';
    if (!st.flowPick) {
      html += '<div class="opts">' + req.options.map((o) => {
        if (o.art) {
          const A = E.artifactDef(C.artifact.id);
          return '<button class="opt" type="button" data-pick="ART"><span><span class="k">アーティファクト「' + esc(A.name) + '」</span><br><span class="d">' + A.colors.map((c) => '<span class="cdot c' + c + '"></span>').join('') +
            ' 横2マスを使う。2色の計画書チップ1枚につき魔力1。どちらの色としても数える</span></span><span class="r">' + o.cost + 'ジェム</span></button>';
        }
        const P = E.PLANTS[o.key];
        return '<button class="opt" type="button" data-pick="' + o.key + '"><span><span class="k"><span class="cdot c' + P.color + '"></span> ' + esc(E.plantName(o.key)) + '</span><br><span class="d">' + esc(E.prodText(o.key)) +
          (P.env ? '・環境' + (P.env > 0 ? '+' : '') + P.env : '') + '</span></span><span class="r">' + o.cost + 'コイン</span></button>';
      }).join('') + '</div>';
    } else {
      const art = st.flowPick === 'ART';
      html += '<p><b>' + (art ? 'アーティファクト' : esc(E.plantName(st.flowPick))) + '</b>を置く場所を選んでください（マスのボーナスがもらえます）</p>';
      html += forgeHTML(p, { pick: art ? req.pairs : req.spaces, pair: art, sel: st.flowSel });
      html += '<div class="row-actions" style="margin-top:8px"><button class="btn primary" type="button" data-answer="build"' + (st.flowSel == null ? ' disabled' : '') + '>ここに建てる</button><button class="btn" type="button" data-act="unpick">選び直す</button></div>';
    }
    html += '<div class="row-actions" style="margin-top:8px"><button class="btn" type="button" data-answer="skip">建てない</button></div>';
  } else if (req.k === 'obj') {
    html += '<div class="q">目標タイルを1枚選んでください</div><p class="small">ゲーム終了時に条件に応じて得点します（1人2枚まで）。</p><div class="opts">' +
      req.options.map((id) => '<button class="opt" type="button" data-obj="' + id + '"><span class="k">' + esc(E.objDef(id).text) + '</span><span class="r">今' + E.objectiveVp(C, st.me, id) + 'VP</span></button>').join('') +
      '</div><div class="row-actions" style="margin-top:8px"><button class="btn" type="button" data-answer="skip">取らない</button></div>';
  }
  html += '</div>';
  return html;
}
function hexInfoHTML(S, h) {
  const t = h.token ? S.toks[h.token] : null;
  let s = '<div class="h">' + E.AREAS[h.area].name + 'エリアのマス' + (h.x ? '（チップなしのマス）' : '') + (h.ring === 4 ? '・外周' : '') + '</div>';
  if (h.covered) return s + '<p class="small">カバータイルでふさがれています（この人数では使いません）。</p>';
  s += '<p>ボーナス：<b>' + fx(h.bonus) + '</b></p>';
  if (t) s += '<p>計画書チップ：<span class="cdot c' + t.color + '"></span> ' + E.COLORS[t.color].name + '　表「' + esc(E.tokenText(S, h.token, 'f')) + '」／裏「' + esc(E.tokenText(S, h.token, 'b')) + '」</p>';
  if (h.base != null) s += '<p>' + sw(h.base) + ' ' + esc(S.players[h.base].name) + 'の拠点</p>';
  return s;
}

/* ---------- boards ---------- */
function forgeHTML(p, opt) {
  opt = opt || {};
  let html = '<div class="forge">';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const s = r * 3 + c, f = p.forge[s];
      const can = opt.pick && opt.pick.indexOf(opt.pair ? s : s) >= 0;
      const inSel = opt.sel != null && (s === opt.sel || (opt.pair && s === opt.sel + 1));
      if (f) {
        const colors = f.art ? E.artifactDef(f.art).colors : [E.PLANTS[f.key].color];
        const bg = colors.length > 1 ? 'linear-gradient(135deg,var(--' + colors[0] + ') 50%,var(--' + colors[1] + ') 50%)' : 'var(--' + colors[0] + ')';
        html += '<div class="cell" style="background:' + bg + ';border-color:rgba(255,255,255,.4)"><span class="pn">' + (f.art ? (f.part === 0 ? 'アーティ' : 'ファクト') : esc(plantShort(f.key))) + '</span>' +
          (f.art ? '' : '<span style="font-size:10px;color:#fff;opacity:.9">' + esc(shortProd(f.key)) + '</span>') + '</div>';
      } else if (can || inSel) {
        html += '<button type="button" class="cell empty' + (inSel ? ' pick' : '') + '" data-space="' + s + '"' + (opt.pair && !can && !inSel ? ' disabled' : '') + '>' + fx(E.FORGE_SPACE[s]) + '</button>';
      } else html += '<div class="cell empty">' + fx(E.FORGE_SPACE[s]) + '</div>';
    }
    html += '<div class="rowb">行' + (r + 1) + '<br>' + fx(E.FORGE_ROW[r]) + '</div>';
  }
  html += E.FORGE_COL_VP.map((v) => '<div class="colv">列完成 ' + v + 'VP</div>').join('') + '<div></div></div>';
  return html;
}
function shortProd(key) {
  const pr = E.PLANTS[key].prod;
  if (pr.k === 'gaia') return '魔力' + pr.base + '＋環境';
  if (pr.k === 'water') return '水→魔力（最大' + pr.cap + '）' + (pr.flat ? '+' + pr.flat : '');
  if (pr.k === 'fire') return '◆' + pr.gem + '→魔力' + pr.mana + '×' + pr.uses;
  return '¢' + pr.coin + '→魔力' + pr.mana + '×' + pr.uses;
}
function pips(val, min, max, opts) {
  opts = opts || {};
  let s = '<span class="pips">';
  for (let i = min; i <= max; i++) s += '<i class="' + (i <= val && (opts.fillAll || i === val || i <= val) ? 'on' : '') + (opts.hands && opts.hands.indexOf(i) >= 0 ? ' hand' : '') + '">' + i + '</i>';
  return s + '</span>';
}
function boardHTML(pid) {
  const S = st.S, p = S.players[pid];
  let html = '<div class="chipline" style="margin-bottom:8px">' + S.players.map((x, i) => '<button class="btn small" type="button" data-view="' + i + '"' + (i === pid ? ' style="border-color:var(--gold)"' : '') + '>' + sw(i) + ' ' + esc(x.name) + '</button>').join('') + '</div>';
  html += '<div class="box"><div class="h">' + sw(pid) + esc(pname(pid)) + ' <span class="sub">' + SEAT_NAMES[pid] + '</span></div><div class="kv">' +
    '<span><b>' + p.vp + '</b> VP</span><span>コイン <b>' + p.coins + '</b></span><span>ジェム <b>' + p.gems + '</b></span><span>拠点 残り<b>' + p.bases + '</b></span><span>キューブ 残り<b>' + p.cubes + '</b></span>' +
    '<span>次の魔力 <b>' + E.produceInfo(S, pid).fixed + '</b>＋支払い分</span></div></div>';
  html += '<div class="box"><div class="h">トラック</div><div class="tracks">' +
    '<div class="track"><span>労働力</span>' + pips(p.work, 1, E.WORK_MAX) + '<span class="small">給料' + E.SALARY[p.work] + '</span></div>' +
    '<div class="track"><span>採掘権</span>' + pips(p.mine, 0, E.MINE_MAX, { hands: E.MINE_HANDS }) + '<span class="small">◆収入' + ((p.gemInc[0] ? 1 : 0) + (p.gemInc[1] ? 1 : 0)) + '</span></div>' +
    '<div class="track"><span>水利権</span>' + pips(p.water, 0, E.WATER_MAX, { hands: [E.WATER_HAND] }) + '<span class="small">¢収入' + (p.coinInc ? 2 : 0) + '</span></div>' +
    '<div class="track"><span>研究</span>' + pips(p.res, 0, E.RES_MAX) + '<span class="small">段' + E.resRow(p.res) + '</span></div>' +
    '</div><p class="small">緑の線＝ここに届くと収入タイルが表になる。研究5で2段目（レベルII・アーティファクト）、10で3段目（レベルIII）、13以上で終了時2VP。</p></div>';
  html += '<div class="box"><div class="h">魔力プラントエリア</div>' + forgeHTML(p) + '</div>';
  html += '<div class="box"><div class="h">目標タイル <span class="sub">' + p.objs.length + '/2</span></div>' + (p.objs.length ? p.objs.map((o) => '<div class="opt" style="cursor:default"><span class="k">' + esc(E.objDef(o.id).text) + (o.dark ? '（裏）' : '') + '</span><span class="r">今' + E.objectiveVp(S, pid, o.id) + 'VP</span></div>').join('') : '<p class="small">研究トラックの目標マスで取れます。</p>') + '</div>';
  html += '<div class="box"><div class="h">計画書チップ</div><p class="small">手元（' + p.standby.length + '）</p><div class="toks">' + p.standby.map((id) => '<span class="tok">' + tokInner(id, 'f') + '</span>').join('') + '</div>' +
    '<p class="small">捨て場（' + p.used.length + '）</p><div class="toks">' + p.used.map((id) => '<span class="tok">' + tokInner(id, 'f') + '</span>').join('') + '</div>' +
    (p.removed.length ? '<p class="small">除外（' + p.removed.length + '）</p><div class="toks">' + p.removed.map((id) => '<span class="tok dim">' + tokInner(id, 'f') + '</span>').join('') + '</div>' : '') + '</div>';
  return html;
}
function commonHTML() {
  const S = st.S;
  let html = '<div class="box"><div class="h">環境 <span class="sub">いま ' + S.env + '</span></div>' + pips(S.env, 0, E.ENV_MAX) +
    '<p class="small">0〜2：ジェム1コイン・ガイア+0／3〜7：ジェム2コイン・ガイア+1／8〜10：ジェム3コイン・ガイア+2。緑のプラントで上がり、紫で下がる。</p></div>';
  html += '<div class="box"><div class="h">開発エリア（建てられるプラント）</div><div class="dev">';
  ['G', 'B', 'O', 'P'].forEach((c) => {
    [1, 2, 3].forEach((lv) => {
      const key = c + lv, P = E.PLANTS[key], d = S.dev[key];
      html += '<div class="pile' + (d.left ? '' : ' off') + '" style="border-left:4px solid var(--' + c + ')"><div class="t"><span>' + esc(plantShort(key)) + '</span><span>' + E.plantCost(S, key) + '¢</span></div>' +
        '<div>' + esc(E.prodText(key)) + '</div><div class="small">条件：研究' + lv + '段' + (E.reqText(P.req) ? '・' + esc(E.reqText(P.req)) : '') + (P.env ? '・環境' + (P.env > 0 ? '+' : '') + P.env : '') + '</div>' +
        '<div class="small">残り' + d.left + '枚</div><div class="cubes">' + d.cubes.map((pid) => '<i style="background:' + SEAT_COLORS[pid] + '"></i>').join('') + '</div></div>';
    });
  });
  const A = E.artifactDef(S.artifact.id);
  html += '</div><div class="pile" style="margin-top:6px;border-left:4px solid var(--gold)"><div class="t"><span>アーティファクト「' + esc(A.name) + '」</span><span>' + E.artifactCost(S) + '◆</span></div>' +
    '<div>' + A.colors.map((c) => '<span class="cdot c' + c + '"></span> ' + E.COLORS[c].name).join('・') + '：この2色の計画書チップ1枚につき魔力1。横2マスに置き、どちらの色としても数える。</div>' +
    '<div class="small">条件：研究2段・労働力2。1人1回。ジェムで払う。</div><div class="cubes">' + S.artifact.cubes.map((pid) => '<i style="background:' + SEAT_COLORS[pid] + '"></i>').join('') + '</div></div></div>';
  // research
  html += '<div class="box"><div class="h">研究トラック</div><div class="lane">';
  for (let i = 0; i <= E.RES_MAX; i++) {
    const b = E.RESEARCH[i], cls = i >= E.RES_END ? ' end' : i >= E.RES_ROWS[2] ? ' row3' : i >= E.RES_ROWS[1] ? ' row2' : '';
    const label = b === 'objA' ? '目標A' : b === 'objB' ? '目標B' : b ? fx(b) : 'スタート';
    html += '<div class="sp' + cls + '"><b>' + i + '</b>' + label + '<div class="marks">' + S.players.map((p, pid) => p.res === i ? '<i style="background:' + SEAT_COLORS[pid] + '"></i>' : '').join('') + '</div></div>';
  }
  html += '</div><p class="small">青線＝2段目、紫線＝3段目、茶色＝終了時2VP。</p></div>';
  // mana
  html += '<div class="box"><div class="h">魔力トラック</div><div class="lane">';
  for (let m = 0; m <= E.MANA_MAX; m++) {
    const r = E.MANA[m];
    html += '<div class="sp"><b>' + m + '</b>' + r[0] + 'VP<br>' + r[1] + '¢<div class="marks">' + S.players.map((p, pid) => S.mana[pid].pos === m ? '<i style="background:' + SEAT_COLORS[pid] + '"></i>' : '').join('') + '</div></div>';
  }
  html += '</div></div>';
  // area scoring
  const areas = E.areaScores(S);
  html += '<div class="box"><div class="h">エリア得点タイル <span class="sub">いま終わったら</span></div>';
  areas.forEach((a) => {
    const T = E.areaDef(a.tile);
    html += '<div style="margin-bottom:8px"><div><b>' + E.AREAS[a.area].name + 'エリア：' + esc(T.name) + '</b> <span class="small">' + esc(T.text) + '　1位 ' + rateText(T.r1) + '／2位 ' + rateText(T.r2) + '</span></div><div class="kv">' +
      a.rows.map((r) => '<span>' + sw(r.pid) + (r.eligible ? r.count + '→<b>' + r.vp + 'VP</b>' : '拠点なし') + '</span>').join('') + '</div></div>';
  });
  html += '<p class="small">数えるのはマップ全体。そのエリアに拠点がない人は点を取れません。1位タイは全員2位の点、2位タイは0点。</p></div>';
  html += '<div class="box"><div class="h">目標エリア</div>' + ['A', 'B'].map((k, i) => '<p class="small">目標' + k + '（研究' + (i ? 7 : 2) + 'のマスで取る）</p>' + (S.objAreas[i].length ? S.objAreas[i].map((id) => '<div class="opt" style="cursor:default">' + esc(E.objDef(id).text) + '</div>').join('') : '<p class="small">なし</p>')).join('') + '</div>';
  return html;
}
function rateText(r) { return r[1] === 1 ? '1つにつき' + r[0] + 'VP' : r[1] + 'つにつき' + r[0] + 'VP'; }
function allHTML() {
  const S = st.S;
  return S.order.map((pid) => {
    const p = S.players[pid], sc = E.scoreOf(S, pid);
    return '<div class="box"><div class="h">' + sw(pid) + esc(pname(pid)) + '</div><div class="kv"><span><b>' + p.vp + '</b>VP</span><span>¢' + p.coins + '</span><span>◆' + p.gems + '</span><span>魔力' + S.mana[pid].pos + '</span>' +
      '<span>労' + p.work + '・採' + p.mine + '・水' + p.water + '・研' + p.res + '</span><span>拠点' + (15 - p.bases) + '</span><span>プラント' + p.forge.filter((f) => f && !(f.art && f.part === 1)).length + '</span></div>' +
      '<p class="small">いま終わったら ' + sc.total + '点（マップ' + sc.map + '・目標' + sc.objectives + '・列' + sc.columns + '・研究' + sc.research + '）</p>' +
      '<button class="btn small" type="button" data-view="' + pid + '">ボードを見る</button></div>';
  }).join('');
}

/* ------------------------------------------------------------------ panel events */
function bindPanel() {
  const el = $('#panel');
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.view != null) { st.view = +d.view; st.tab = 'me'; renderTabs(); renderPanel(); return; }
    if (d.act === 'result') { openResult(); return; }
    if (st.flow) { flowClick(b); return; }
    if (d.act === 'prep') {
      const C = E.clone(st.S);
      startFlow(E.prepGen(C, st.me), C, (ans) => submit({ k: 'prep', hex: ans[0] }));
      return;
    }
    if (d.tok) { placeTok(d.tok); return; }
    if (d.flip != null) { const s = st.draft.slots[+d.flip]; s.face = s.face === 'f' ? 'b' : 'f'; renderPanel(); return; }
    if (d.unset != null) { st.draft.slots[+d.unset] = null; renderPanel(); return; }
    if (d.slot != null) {
      const k = +d.slot, s = st.draft.slots[k];
      if (!s || s.skip) st.draft.slots[k] = s && s.skip ? null : { skip: true };
      st.draft.sel = k;
      renderPanel(); return;
    }
    if (d.act === 'reset') { st.draft = newDraft(); renderPanel(); return; }
    if (d.act === 'go') { goAction(); return; }
    if (d.step) {
      const [kind, i, delta] = d.step.split(':'), info = E.produceInfo(st.S, st.me), t = info[kind][+i];
      st.prod[kind][+i] = Math.max(0, Math.min(t.uses, st.prod[kind][+i] + (+delta)));
      st.prod.disc = null;
      renderPanel(); return;
    }
    if (d.act === 'produce') {
      const r = E.produceResult(st.S, st.me, { fire: st.prod.fire, dark: st.prod.dark, disc: st.prod.disc });
      submit({ k: 'produce', plan: { fire: st.prod.fire, dark: st.prod.dark, disc: r.disc } });
      return;
    }
    if (d.free) { freeAction(d.free); return; }
  };
  const range = $('#discRange');
  if (range) range.oninput = () => { st.prod.disc = +range.value; const keep = range.value; renderPanel(); const r2 = $('#discRange'); if (r2) { r2.value = keep; r2.focus(); } };
}
function placeTok(id) {
  const d = st.draft;
  let k = d.slots.findIndex((s) => !(s && s.tok));
  if (d.sel != null && !(d.slots[d.sel] && d.slots[d.sel].tok)) k = d.sel;
  if (k < 0) k = d.sel != null ? d.sel : 2;
  d.slots[k] = { tok: id, face: 'f' };
  d.sel = null;
  renderPanel();
}
function goAction() {
  const slots = st.draft.slots.map((s) => (s && s.tok ? { tok: s.tok, face: s.face } : s && s.skip ? { skip: true } : null));
  const C = E.clone(st.S);
  startFlow(E.actionGen(C, st.me, slots), C, (choices) => submit({ k: 'action', move: { slots, choices } }));
}
function flowClick(b) {
  const d = b.dataset, f = st.flow, req = f.req;
  if (d.hex != null) { st.flowSel = +d.hex; render(); return; }
  if (d.pick) { st.flowPick = d.pick; st.flowSel = null; renderPanel(); return; }
  if (d.act === 'unpick') { st.flowPick = null; st.flowSel = null; renderPanel(); return; }
  if (d.space != null) {
    const s = +d.space;
    if (st.flowPick === 'ART' && req.pairs.indexOf(s) < 0) { if (req.pairs.indexOf(s - 1) >= 0) st.flowSel = s - 1; }
    else st.flowSel = s;
    renderPanel(); return;
  }
  if (d.obj) { f.answer(d.obj); return; }
  if (d.answer === 'skip') { f.answer(null); return; }
  if (d.answer === 'hex' && st.flowSel != null) { f.answer(st.flowSel); return; }
  if (d.answer === 'build' && st.flowSel != null && st.flowPick) { f.answer({ key: st.flowPick, space: st.flowSel }); return; }
}
function onHex(hid) {
  if (st.flow && st.flow.req.k === 'hex') {
    if (st.flow.req.options.some((o) => o.hex === hid)) { st.flowSel = hid; render(); }
    else toast('そのマスには置けません');
    return;
  }
  st.infoHex = hid;
  renderMap();
  openSheet('<button class="btn small close" type="button" data-close>閉じる</button>' + hexInfoHTML(st.S, st.S.hexes[hid]), () => { st.infoHex = null; renderMap(); });
}

/* ---------- free actions ---------- */
function freeAction(kind) {
  const S = st.S, p = S.players[st.me];
  if (kind === 'g2c' || kind === 'buy') { submit({ k: 'free', a: { k: kind } }); return; }
  const colored = p.standby.concat(p.used).filter((id) => S.toks[id].color !== 'N');
  if (kind === 'rm2') {
    let picked = [];
    const draw = () => '<button class="btn small close" type="button" data-close>やめる</button><h3>同じ色の計画書チップを2枚除外</h3><p class="small">虹色はどの色ともそろいます。白い初期チップは除外できません。除外したチップは戻りません。</p><div class="toks">' +
      colored.map((id) => '<button type="button" class="tok' + (picked.indexOf(id) >= 0 ? ' pick' : '') + '" data-rm="' + id + '">' + tokInner(id, 'f') + '</button>').join('') +
      '</div><div class="row-actions" style="margin-top:12px"><button class="btn primary" type="button" data-rmgo' + (picked.length === 2 ? '' : ' disabled') + '>この2枚を除外</button></div>';
    openSheet(draw(), null, (b) => {
      if (b.dataset.rm) {
        const id = b.dataset.rm;
        picked = picked.indexOf(id) >= 0 ? picked.filter((x) => x !== id) : picked.concat([id]).slice(-2);
        if (picked.length === 2) { const ca = S.toks[picked[0]].color, cb = S.toks[picked[1]].color; if (!(ca === cb || ca === 'W' || cb === 'W')) { toast('同じ色（か虹色）の2枚を選んでください'); picked = [id]; } }
        $('#sheet').innerHTML = draw(); return;
      }
      if (b.dataset.rmgo != null && picked.length === 2) { closeSheet(); submit({ k: 'free', a: { k: 'rm2', a: picked[0], b: picked[1] } }); }
    });
    return;
  }
  if (kind === 'flip') {
    const oi = p.objs.findIndex((o) => !o.dark);
    let pick = null;
    const draw = () => '<button class="btn small close" type="button" data-close>やめる</button><h3>目標タイルを裏返して1枚除外</h3><p class="small">目標「' + esc(E.objDef(p.objs[oi].id).text) + '」を裏返します（得点の条件は変わりません）。除外するチップを選んでください。</p><div class="toks">' +
      colored.map((id) => '<button type="button" class="tok' + (pick === id ? ' pick' : '') + '" data-fl="' + id + '">' + tokInner(id, 'f') + '</button>').join('') +
      '</div><div class="row-actions" style="margin-top:12px"><button class="btn primary" type="button" data-flgo' + (pick ? '' : ' disabled') + '>裏返して除外</button></div>';
    openSheet(draw(), null, (b) => {
      if (b.dataset.fl) { pick = b.dataset.fl; $('#sheet').innerHTML = draw(); return; }
      if (b.dataset.flgo != null && pick) { closeSheet(); submit({ k: 'free', a: { k: 'flip', obj: oi, tok: pick } }); }
    });
  }
}

/* ------------------------------------------------------------------ applying moves */
function applyMove(S, pid, m) {
  if (m.k === 'prep') E.applyPrep(S, pid, m.hex);
  else if (m.k === 'action') E.applyAction(S, pid, m.move);
  else if (m.k === 'produce') E.applyProduce(S, pid, m.plan);
  else if (m.k === 'free') E.applyFree(S, pid, m.a);
  else throw new Error('move?');
}
function submit(m) {
  if (st.mode === 'guest') {
    st.waitingHost = true;
    st.net.send({ k: 'act', seq: st.S.seq, m });
    renderPanel();
    setTimeout(() => { if (st.waitingHost) { st.waitingHost = false; renderPanel(); } }, 8000);
    return;
  }
  try { applyMove(st.S, st.me, m); }
  catch (e) { toast('その手は打てません（' + e.message + '）'); render(); return; }
  if (m.k !== 'free') { st.draft = null; st.prod = null; }
  afterChange();
}
function afterChange() {
  const S = st.S;
  const fresh = S.log.slice(st.logSeen);
  st.logSeen = S.log.length;
  fresh.slice(-3).forEach((l) => toast((l.p >= 0 ? S.players[l.p].name + '：' : '') + l.t));
  save();
  if (st.mode === 'host') broadcastState();
  render();
  if (S.phase === 'end') { setTimeout(openResult, 700); return; }
  tick();
}

/* ------------------------------------------------------------------ the CPU */
function ensureWorker() {
  if (st.worker !== null) return st.worker;
  try {
    st.worker = new Worker('cpu-worker.js?v=' + VER);
    st.worker.onerror = () => { st.worker = false; };
  } catch (e) { st.worker = false; }
  return st.worker;
}
function think(S, level) {
  return new Promise((res) => {
    const seed = (S.seed + S.seq * 7919) >>> 0;
    const w = ensureWorker();
    if (w) {
      const id = ++st.reqId;
      const done = (e) => { if (!e.data || e.data.id !== id) return; w.removeEventListener('message', done); res(e.data.dec); };
      w.addEventListener('message', done);
      w.postMessage({ id, state: S, level, seed });
      setTimeout(() => { w.removeEventListener('message', done); res(undefined); }, 30000);
    } else setTimeout(() => res(AI.decide(S, level, E.mulberry32(seed))), 10);
  });
}
async function tick() {
  const S = st.S;
  if (!S || S.phase === 'end' || st.mode === 'guest') return;
  const w = E.who(S);
  const auto = AUTO && w.pid === st.me;
  if (!isCpu(w.pid) && !auto) return;
  if (st.cpuBusy) return;
  st.cpuBusy = true;
  const seq = S.seq, t0 = performance.now();
  let dec = await think(S, auto ? 2 : S.players[w.pid].cpu);
  if (dec === undefined || dec === null) dec = AI.decide(S, 1, E.mulberry32(S.seq + 1));
  const wait = TEST ? 0 : Math.max(0, (w.kind === 'produce' ? 450 : 850) - (performance.now() - t0));
  setTimeout(() => {
    st.cpuBusy = false;
    if (st.S !== S || S.seq !== seq) { tick(); return; }
    try {
      (dec.free || []).forEach((a) => { try { E.applyFree(S, w.pid, a); } catch (e) { /* skip */ } });
      if (dec.k === 'prep') E.applyPrep(S, w.pid, dec.hex);
      else if (dec.k === 'produce') E.applyProduce(S, w.pid, dec.plan);
      else E.applyAction(S, w.pid, dec.move);
    } catch (e) {
      // a stale or refused CPU move: fall back to the simplest legal one
      try {
        if (w.kind === 'prep') E.applyPrep(S, w.pid, E.legalHexes(S, w.pid, true)[0].hex);
        else if (w.kind === 'produce') E.applyProduce(S, w.pid, {});
        else E.applyAction(S, w.pid, { slots: [{ skip: true }, { skip: true }, { skip: true }], choices: [] });
      } catch (e2) { console.error(e2); }
    }
    afterChange();
  }, wait);
}

/* ------------------------------------------------------------------ sheets: rules, log, menu, result */
let sheetClose = null, sheetClick = null;
function openSheet(html, onClose, onClick) {
  $('#sheet').innerHTML = html;
  $('#modal').hidden = false;
  sheetClose = onClose || null; sheetClick = onClick || null;
}
function closeSheet() { $('#modal').hidden = true; const f = sheetClose; sheetClose = null; sheetClick = null; if (f) f(); }
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') { closeSheet(); return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.close != null) { closeSheet(); return; }
  if (sheetClick) sheetClick(b);
});
function openLog() {
  const items = st.S.log.slice().reverse().map((l) => '<li>' + (l.r ? '<span class="small">R' + l.r + '</span> ' : '') + (l.p >= 0 ? sw(l.p) + ' ' + esc(st.S.players[l.p].name) + '：' : '') + esc(l.t) + '</li>').join('');
  openSheet('<button class="btn small close" type="button" data-close>閉じる</button><h3>記録</h3><div class="log"><ul>' + items + '</ul></div>');
}
function openMenu() {
  const solo = st.mode === 'solo';
  openSheet('<button class="btn small close" type="button" data-close>閉じる</button><h3>メニュー</h3><div class="menu">' +
    '<button class="btn" type="button" data-m="rules">ルール</button>' +
    (st.map && st.map.kind === '3d' ? '<button class="btn" type="button" data-m="flat">平面のマップにする（軽くなる）</button>' : '') +
    (solo ? '<button class="btn" type="button" data-m="restart">同じ設定で最初から</button>' : '') +
    '<button class="btn" type="button" data-m="title">タイトルにもどる' + (solo ? '（続きから再開できます）' : '') + '</button></div>', null, (b) => {
    const m = b.dataset.m;
    if (m === 'rules') { openRules(); return; }
    if (m === 'flat') { closeSheet(); st.map.dispose(); st.map = createFlatMap($('#mapHost')); st.map.onHex(onHex); renderMap(); return; }
    if (m === 'restart') { closeSheet(); try { localStorage.removeItem(SAVE_KEY); } catch (e) {} startSolo(Object.assign({}, st.setup, { seed: 0 })); return; }
    if (m === 'title') { closeSheet(); leaveGame(); }
  });
}
function leaveGame() {
  if (st.net) { try { st.net.close(); } catch (e) {} st.net = null; }
  st.S = null; st.mode = null; st.flow = null;
  $('#app').hidden = true;
  location.href = location.pathname;
}
function openResult() {
  const S = st.S, R = S.result;
  const rows = R.order.map((pid) => R.rows[pid]);
  const win = rows[0];
  let html = '<button class="btn small close" type="button" data-close>閉じる</button><h3>結果</h3><div class="res-top place1">' + sw(win.pid) + ' ' + esc(pname(win.pid)) + 'の勝ち！</div>';
  html += '<div class="tblwrap"><table class="tbl"><tr><th>順位</th><th>合計</th><th>途中</th><th>マップ</th><th>研究</th><th>列</th><th>目標</th></tr>' +
    rows.map((r) => '<tr><td>' + r.place + '位 ' + sw(r.pid) + esc(S.players[r.pid].name.replace('（CPU）', '')) + '</td><td><b>' + r.total + '</b></td><td>' + r.game + '</td><td>' + r.map + '</td><td>' + r.research + '</td><td>' + r.columns + '</td><td>' + r.objectives + '</td></tr>').join('') + '</table></div>';
  html += '<div class="box" style="margin-top:10px"><div class="h">エリア得点</div>' + R.areas.map((a) => '<p class="small">' + E.AREAS[a.area].name + '：' + esc(E.areaDef(a.tile).name) + '　' + a.rows.map((r) => S.players[r.pid].name + ' ' + r.count + '→' + r.vp + 'VP').join('、') + '</p>').join('') + '</div>';
  html += '<div class="menu" style="margin-top:12px">' + (st.mode === 'solo' ? '<button class="btn primary" type="button" data-m="again">もう一度遊ぶ</button>' : '') + '<button class="btn" type="button" data-m="title">タイトルにもどる</button></div>';
  openSheet(html, null, (b) => {
    if (b.dataset.m === 'again') { closeSheet(); startSolo(Object.assign({}, st.setup, { seed: 0 })); }
    if (b.dataset.m === 'title') { closeSheet(); leaveGame(); }
  });
}
function openRules() {
  openSheet('<button class="btn small close" type="button" data-close>閉じる</button><h3>エレメンティカのルール</h3><div class="rules">' + RULES + '</div>');
}
const RULES = `
<p>魔法技師になって魔力を生むプラントを建て、勝利点（VP）を集めます。誰かが<b>15VP</b>以上でラウンドを終えると、次が最終ラウンド。終了時の得点を足して、いちばん点の多い人の勝ちです。</p>
<h4>準備ラウンド</h4>
<p>手番の逆順に、マップへ拠点を1つずつ置きます（2コイン＋隣の相手の拠点1つにつき1コインをその人へ）。マスのボーナスと、マスの計画書チップがもらえます。</p>
<h4>1ラウンドの流れ</h4>
<ol><li><b>アクション</b>：手番順に1人ずつ2回続けてアクション（第1ラウンドだけ1回）。</li><li><b>魔力生産</b>：プラントを動かし、魔力トラックの位置に応じてVPとコインをもらう。</li><li><b>収入</b>：表になった収入タイルからジェム・コイン。</li><li><b>給料</b>：労働力に応じたコインを払う。足りない1コインにつき1VPを失う（マイナスにもなる）。</li><li><b>手番順の更新</b>：魔力の少ない人から。同じなら後から置いた（上の）ディスクが先。</li></ol>
<h4>アクション</h4>
<ol><li>手元の計画書チップを0〜3枚、アクション欄の3マスに置く（表か裏かは自由）。</li>
<li>ちょうど3枚置いたとき、色の並び（左→右）が自分のプラントのどれかの行の色とそろえば、その行のボーナスをもらう（虹色チップは1枚だけ好きな色、アーティファクトは2色のどちらでもよい）。</li>
<li>左から順に実行。チップを置いたマスはチップの効果、空いたマスは印刷された効果（左から「研究+1」「拠点を置く」「プラント建設」）。使わないこともできる。</li>
<li>使ったチップは捨て場へ。手元が空になったら捨て場のチップが全部戻る。新しく手に入れたチップは捨て場に入る。</li></ol>
<h4>拠点を置く</h4>
<p>2コイン。隣に自分の拠点があれば1つにつき1コイン安くなる（0まで）。隣の相手の拠点1つにつき1コインをその人に払う。マスのボーナスと計画書チップがもらえる。</p>
<h4>プラントを建てる</h4>
<p>開発エリアから、労働力・採掘権・水利権の条件を満たし、研究の段が足りているプラントを選ぶ（条件の値は払わない）。費用はコイン＋そのプラントに置かれたキューブ1個につき1コイン（2人なら2コイン）。自分の魔力プラントエリアの空きマスに置き、マスのボーナスをもらう。行がそろうと行ボーナス。緑を建てると環境が上がり、紫で下がる。アーティファクトは1人1回、ジェムで払って横2マスに置く。</p>
<h4>プラントの魔力</h4>
<ul><li><b>ガイア（緑）</b>：決まった魔力＋環境ボーナス（環境3〜7で+1、8以上で+2）。</li><li><b>水（青）</b>：自分の水利権の値を水のプラントに割り振る（減らない）。</li><li><b>火（橙）</b>：ジェムを払って魔力。</li><li><b>闇（紫）</b>：コインを払って魔力。</li><li><b>アーティファクト</b>：その2色の計画書チップ（手元・捨て場）1枚につき魔力1。</li></ul>
<h4>フリーアクション（自分の番に何度でも）</h4>
<ul><li>3ジェムを1コインに。</li><li>コインでジェムを買う（環境0〜2は1コイン、3〜7は2、8以上は3）。</li><li>同じ色の計画書チップ2枚を除外。</li><li>目標タイルを裏返して計画書チップを1枚除外。</li></ul>
<h4>トラック</h4>
<p>労働力・採掘権・水利権は上がるだけ。採掘権2と4でジェム収入、水利権3でコイン収入のタイルが表になる。端を越えた分は1マス1VP。研究は5で2段目、10で3段目。研究2と7のマスで目標タイルを1枚取れる（1人2枚まで）。研究13以上でゲーム終了時に2VP。</p>
<h4>ゲーム終了時の得点</h4>
<ol><li>ゲーム中のVP。</li><li>マップ：3つのエリアのエリア得点タイルごとに、マップ全体で数えて1位・2位が得点（そのエリアに拠点がない人は対象外。1位タイは全員2位の点、2位タイは0点）。</li><li>研究13以上：2VP。</li><li>魔力プラントエリアの縦の列がそろうと、その列のVP。</li><li>目標タイル。</li></ol>
<p>同点なら、最終ラウンドの魔力が多い人、それも同じなら上のディスクの人の勝ち。</p>
<p class="small">チップ・プラント・マップなどの数値はこのアプリで決めたもので、製品とは違うことがあります。<a href="../games/elementica-research/" target="_blank" rel="noopener" style="color:var(--gold)">原作の調べたことはこちら</a>。</p>`;

/* ------------------------------------------------------------------ online */
function openOnline() {
  $('#onName').value = localStorage.getItem(NAME_KEY) || '';
  $('#onErr').hidden = true;
  $('#onBack').onclick = () => show('scrTitle');
  $('#onCreate').onclick = () => hostRoom();
  $('#onJoin').onclick = () => joinRoom(NET.cleanCode($('#onCode').value));
  show('scrOnline');
}
function onlineName() {
  const n = NET.cleanName($('#onName').value) || 'ゲスト';
  try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
  return n;
}
function netErr(e) {
  const code = e && e.code;
  $('#onErr').hidden = false;
  $('#onErr').textContent = code === 'notfound' ? 'その部屋は見つかりませんでした。' : code === 'taken' ? '部屋コードが重なりました。もう一度つくってください。' : code === 'lib' ? '通信の準備ができませんでした。' : '通信できませんでした。少しして試してください。';
  show('scrOnline');
}
async function hostRoom() {
  const name = onlineName();
  st.mode = 'host'; st.code = NET.makeCode();
  st.seats = [{ name, cid: 'host', cpu: 0, host: true }];
  const h = NET.makeHost(NETKIND);
  st.net = h;
  $('#lobCode').textContent = st.code; $('#lobNote').textContent = '部屋をつくっています…';
  show('scrLobby');
  try { await h.host(st.code); } catch (e) { st.net = null; netErr(e); return; }
  h.on('msg', (cid, m) => hostMsg(cid, m));
  h.on('leave', (cid) => hostLeave(cid));
  renderLobby();
}
function renderLobby() {
  const host = st.mode === 'host';
  $('#lobNote').textContent = host ? '友だちに部屋コード「' + st.code + '」か招待リンクを送ってください（2〜4人）。' : '部屋に入りました。';
  $('#lobSeats').innerHTML = st.seats.map((s, i) => '<div class="seat"><span class="dot" style="background:' + SEAT_COLORS[i] + '"></span><span class="nm">' + esc(s.name) + '</span><span class="tag">' + (s.host ? 'ホスト' : s.cpu ? 'CPU' : 'プレイヤー') + '</span>' +
    (host && s.cpu ? '<button class="btn small" type="button" data-rmseat="' + i + '">外す</button>' : '') + '</div>').join('');
  $('#lobHost').hidden = !host; $('#lobGuestInfo').hidden = host;
  if (host) {
    seg('#lobLevel', st.level, (v) => { st.level = +v; });
    $('#lobAddCpu').disabled = st.seats.length >= 4;
    $('#lobStart').disabled = st.seats.length < 2;
    $('#lobAddCpu').onclick = () => { if (st.seats.length < 4) { st.seats.push({ name: CPU_NAMES[st.seats.length] + '（CPU）', cpu: st.level }); renderLobby(); lobbyBroadcast(); } };
    $('#lobInvite').onclick = () => { const url = location.origin + location.pathname + '?room=' + st.code; try { navigator.clipboard.writeText(url); toast('招待リンクをコピーしました'); } catch (e) { toast(url, 6000); } };
    $('#lobStart').onclick = () => hostStart();
    $('#lobSeats').onclick = (e) => { const b = e.target.closest('[data-rmseat]'); if (!b) return; st.seats.splice(+b.dataset.rmseat, 1); renderLobby(); lobbyBroadcast(); };
  }
  $('#lobLeave').onclick = () => leaveGame();
}
function lobbyBroadcast() { if (st.net) st.net.broadcast({ k: 'lobby', seats: st.seats.map((s) => ({ name: s.name, cpu: s.cpu, host: !!s.host, cid: s.cid || null })), code: st.code }); }
function hostMsg(cid, m) {
  if (m.k === 'hello') {
    const seat = st.seats.findIndex((s) => s.cid === cid);
    if (st.S) {
      if (seat >= 0) { st.S.players[seat].cpu = 0; st.net.send(cid, { k: 'state', S: st.S, me: seat }); toast(st.seats[seat].name + 'さんが戻りました'); }
      else st.net.send(cid, { k: 'full' });
      return;
    }
    if (seat < 0) {
      if (st.seats.length >= 4) { st.net.send(cid, { k: 'full' }); return; }
      st.seats.push({ name: NET.cleanName(m.name) || 'ゲスト', cid, cpu: 0 });
    }
    renderLobby(); lobbyBroadcast();
    return;
  }
  if (m.k === 'act' && st.S) {
    const pid = st.seats.findIndex((s) => s.cid === cid);
    if (pid < 0) return;
    try { applyMove(st.S, pid, m.m); }
    catch (e) { st.net.send(cid, { k: 'refused', why: String(e.message || e) }); st.net.send(cid, { k: 'state', S: st.S, me: pid }); return; }
    afterChange();
  }
}
function hostLeave(cid) {
  const i = st.seats.findIndex((s) => s.cid === cid);
  if (i < 0) return;
  if (!st.S) { st.seats.splice(i, 1); renderLobby(); lobbyBroadcast(); return; }
  st.S.players[i].cpu = 2;
  toast(st.seats[i].name + 'さんの通信が切れたので、CPUが代わりに遊びます');
  afterChange();
}
function hostStart() {
  if (st.seats.length < 2) return;
  const players = st.seats.map((s) => ({ name: s.name, cpu: s.cpu || 0 }));
  st.S = E.newGame({ players, seed: (Math.random() * 1e9 | 0) + 1 });
  st.me = 0; st.logSeen = st.S.log.length;
  broadcastState();
  enterGame();
}
function broadcastState() {
  if (!st.net) return;
  st.seats.forEach((s, i) => { if (s.cid && s.cid !== 'host' && !s.cpu) st.net.send(s.cid, { k: 'state', S: st.S, me: i }); });
}
async function joinRoom(code) {
  if (!code || code.length !== 4) { $('#onErr').hidden = false; $('#onErr').textContent = '4文字の部屋コードを入れてください。'; return; }
  const name = onlineName();
  st.mode = 'guest'; st.code = code;
  try { st.cid = sessionStorage.getItem('elementica.cid') || NET.makeCid(); sessionStorage.setItem('elementica.cid', st.cid); } catch (e) { st.cid = NET.makeCid(); }
  const g = NET.makeGuest(NETKIND);
  st.net = g;
  $('#lobCode').textContent = code; $('#lobNote').textContent = '接続しています…';
  st.seats = []; show('scrLobby'); renderLobby();
  try { await g.join(code); } catch (e) { st.net = null; netErr(e); return; }
  g.on('msg', (m) => guestMsg(m));
  g.on('close', () => { toast('ホストとの接続が切れました', 6000); });
  g.send({ k: 'hello', cid: st.cid, name, proto: NET.PROTOCOL });
}
function guestMsg(m) {
  if (m.k === 'lobby') { st.seats = m.seats; if (!st.S) renderLobby(); return; }
  if (m.k === 'full') { netErr({ code: 'full' }); $('#onErr').textContent = 'その部屋はいっぱいか、もう始まっています。'; return; }
  if (m.k === 'refused') { toast('その手は打てませんでした'); return; }
  if (m.k === 'state') {
    const first = !st.S;
    st.S = m.S; st.me = m.me; st.waitingHost = false;
    if (first) { st.logSeen = st.S.log.length; enterGame(); return; }
    const fresh = st.S.log.slice(st.logSeen); st.logSeen = st.S.log.length;
    fresh.slice(-3).forEach((l) => toast((l.p >= 0 ? st.S.players[l.p].name + '：' : '') + l.t));
    if (st.flow) st.flow = null;
    const w = E.who(st.S), mine = st.S.players[st.me];
    if (!w || w.pid !== st.me || (st.draft && st.draft.slots.some((s) => s && s.tok && mine.standby.indexOf(s.tok) < 0))) st.draft = null;
    render();
    if (st.S.phase === 'end') setTimeout(openResult, 700);
  }
}

window.addEventListener('beforeunload', save);
document.fonts && document.fonts.ready.then(() => { if (st.S) renderMap(); });
boot();

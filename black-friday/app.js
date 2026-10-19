/* ブラックフライデー — the app: screens, the board, action sheets, the price change cinematic, turn flow, CPU and
   online play.
   vs CPU / one device: the engine runs here; the CPUs (ai.js, in a worker) and the M.I.B.S. take their turns.
   Online: the host's browser runs the engine, the CPUs and the M.I.B.S.; each guest sends its moves and gets back
   its own view (other screens stay closed). Whatever happens arrives as (events, view): the presenter plays the
   events one by one on the table, then settles on the view. */

const E = window.BF_ENG, AI = window.BF_AI, N = window.BF_NET, FX = window.BF_FX;
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const store = {
  get(k, d) { try { const v = localStorage.getItem('bf.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bf.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem('bf.' + k); } catch (e) { /* ignore */ } }
};
const prefs = {
  name: store.get('name', ''), count: store.get('count', 3), mibs: store.get('mibs', true), level: store.get('level', 2),
  speed: store.get('speed', 1), fx: store.get('fx', 2), sound: store.get('sound', true), bgm: store.get('bgm', true),
  pub: store.get('pub', true), risk: store.get('risk', true), names: store.get('names', ['', '', '', '', '']), localCount: store.get('localCount', 3), localMibs: store.get('localMibs', false)
};
if (TEST) { prefs.speed = Number(params.get('speed')) || 6; prefs.fx = Number(params.get('fx') || 0); prefs.sound = false; prefs.bgm = false; }
const SPEEDS = [[0.7, 'ゆっくり'], [1, 'ふつう'], [1.6, 'はやい'], [2.6, 'とてもはやい']];
const LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい', 4: '最強' };
const LEVEL_NOTE = {
  1: 'やさしい：気まぐれに売り買いします。ルールを覚えながら遊ぶのに。',
  2: 'ふつう：損得をその場で計算して動きます。',
  3: 'つよい：見えない手札と袋の中身を想像し、何手か先まで試してから動きます。',
  4: '最強：「つよい」よりずっと多くの未来を試します。考える時間が少し長くなります。'
};
const CN = ['イオン', 'マクドナルド', '三菱UFJ', 'パナソニック', 'ソフトバンク'];
const STOCK_COLORS = ['紫', '黄', '緑', '青', '白'];
const STOCK_LOGOS = ['aeon.png', 'mcdonalds.svg', 'mufg.png', 'panasonic.svg', 'softbank.svg'];
const STOCK_CODE = ['AEON', 'McD', 'MUFG', 'Pana', 'SB'];
const CPU_PROFILES = [['ブル', 'bull'], ['ベア', 'bear'], ['キツネ', 'fox'], ['タカ', 'hawk']];
const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const WIDE = '(min-width:640px) and (min-aspect-ratio:5/4)';     // board on the left, everything else on the right
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let skipping = false;                                  // a tap during a cinematic hurries the rest of it
const wait = (ms) => (skipping ? sleep(0) : sleep(ms / prefs.speed));
const dur = (ms) => (skipping ? 1 : Math.max(1, ms / prefs.speed));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = (a) => a.reduce((s, x) => s + x, 0);
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const priceOf = (v, c) => E.cellPrice(v.price[c]);

function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('bf.cid'); } catch (e) { /* ignore */ }
  if (!c || !/^[A-Za-z0-9]{6,32}$/.test(c)) { c = N.makeCid(); try { sessionStorage.setItem('bf.cid', c); } catch (e) { /* ignore */ } }
  return c;
}
const CID = myCid();

/* ================================================================ little pictures */
function brandLogo(c, compact = false) {
  const file = compact && c === 4 ? 'softbank-mark.svg' : STOCK_LOGOS[c];
  return '<img class="brand-logo" src="brands/' + file + '" alt="' + CN[c] + '" draggable="false">';
}
function shIcon(c, cls = '') {
  if (c >= 0 && c < 5) return '<span class="sh brand-case ' + cls + '" data-c="' + c + '" title="' + CN[c] + '">' + brandLogo(c, !cls.includes('lg')) + '</span>';

  return '<span class="sh ' + cls + '" data-c="' + c + '"><svg viewBox="0 0 22 18" aria-hidden="true"><use href="#i-case"/></svg>' + (cls.includes('sm') || c === 5 ? '' : '<span class="g">' + CN[c] + '</span>') + '</span>';
}
const barIcon = (w = 20) => '<svg class="gbar" style="width:' + w + 'px;height:' + Math.round(w * 0.55) + 'px" aria-hidden="true"><use href="#i-bar"/></svg>';
const bagIcon = (cls = 'bag') => '<svg class="' + cls + '" viewBox="0 0 40 40" aria-hidden="true"><use href="#i-bag"/></svg>';
const AVATARS = {
  bull: '<svg viewBox="0 0 28 28"><path d="M6 10C2 9 1 6 2 3c2 3 5 4 7 4M22 10c4-1 5-4 4-7-2 3-5 4-7 4" fill="none" stroke="#efe2c4" stroke-width="2.2" stroke-linecap="round"/><path d="M8 8h12c2 0 3.2 1.8 3.2 4v4c0 5.3-4.2 9.4-9.2 9.4S4.8 21.3 4.8 16v-4C4.8 9.8 6 8 8 8z" fill="#9a5432"/><ellipse cx="14" cy="20.4" rx="5.3" ry="3.7" fill="#e3ab84"/><circle cx="12" cy="20.4" r="1" fill="#3b1d0e"/><circle cx="16" cy="20.4" r="1" fill="#3b1d0e"/><circle cx="10.4" cy="13.6" r="1.4" fill="#1b0d05"/><circle cx="17.6" cy="13.6" r="1.4" fill="#1b0d05"/><path d="M11 10.4h6" stroke="#6b3518" stroke-width="1.6" stroke-linecap="round"/></svg>',
  bear: '<svg viewBox="0 0 28 28"><circle cx="7" cy="7.5" r="4" fill="#5b3a26"/><circle cx="21" cy="7.5" r="4" fill="#5b3a26"/><circle cx="7" cy="7.5" r="1.8" fill="#c99a76"/><circle cx="21" cy="7.5" r="1.8" fill="#c99a76"/><circle cx="14" cy="15.5" r="10" fill="#6e4a33"/><ellipse cx="14" cy="19" rx="4.6" ry="3.6" fill="#d3a983"/><ellipse cx="14" cy="17.4" rx="1.8" ry="1.3" fill="#1d120a"/><circle cx="10" cy="13" r="1.3" fill="#1d120a"/><circle cx="18" cy="13" r="1.3" fill="#1d120a"/></svg>',
  fox: '<svg viewBox="0 0 28 28"><path d="M4 3l6 7h8l6-7 .5 10.5C24 20 19.5 25 14 25S4 20 3.5 13.5z" fill="#e0752e"/><path d="M7 6.5l3.2 4M21 6.5l-3.2 4" stroke="#3a1a06" stroke-width="1.4" stroke-linecap="round"/><path d="M6 15c2.5 1 5 1.5 8 6 3-4.5 5.5-5 8-6-.4 5.6-3.8 10-8 10s-7.6-4.4-8-10z" fill="#fbf3e8"/><circle cx="10" cy="14" r="1.3" fill="#1d0f05"/><circle cx="18" cy="14" r="1.3" fill="#1d0f05"/><circle cx="14" cy="20.6" r="1.4" fill="#1d0f05"/></svg>',
  hawk: '<svg viewBox="0 0 28 28"><path d="M5 22c0-9 4-17 11-17 5 0 8 3.4 8 8 0 2-1 3.5-2.4 4.6l-3.6-1.2 1.6 4.4C17 24 10 25 5 22z" fill="#5d6a7a"/><path d="M16 5c4.6.4 8 3.4 8 8 0 2-1 3.5-2.4 4.6L18 16.4" fill="#e8edf2"/><path d="M21.6 17.6 25.4 19l-2.6 2.8z" fill="#f2b23a"/><circle cx="19.4" cy="11" r="1.6" fill="#141a20"/><circle cx="19.9" cy="10.5" r=".5" fill="#fff"/><path d="M6 19c3 1 7 1 10-1" stroke="#3b4552" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>',
  mibs: '<svg viewBox="0 0 28 28"><rect x="3" y="5" width="22" height="15" rx="2.6" fill="#1b2b33" stroke="#7fd6c2" stroke-width="1.4"/><path d="M7 15l3.5-3.5 3 2.5 5-5" fill="none" stroke="#ffb43f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="10.5" y="20" width="7" height="3" fill="#7fd6c2"/><rect x="7.5" y="23" width="13" height="1.8" rx=".9" fill="#7fd6c2"/></svg>'
};
const HUMAN_TINTS = ['#3e8fd8', '#c9653c', '#6a9e3f', '#a356c4', '#c49a2c'];
function avatarHtml(seat, i) {
  if (seat.av && AVATARS[seat.av]) return '<span class="av">' + AVATARS[seat.av] + '</span>';
  const ch = Array.from(seat.nm || '?')[0] || '?';
  return '<span class="av" style="background:' + HUMAN_TINTS[i % HUMAN_TINTS.length] + ';font-weight:900;font-size:16px;color:#fff">' + esc(ch) + '</span>';
}

/* ================================================================ sound */
const sfx = (name, o) => { if (prefs.sound) FX.sfx(name, o); };
function applySound() {
  FX.setMuted(!prefs.sound);
  FX.music.enable(prefs.bgm);
  $('#btnSound').classList.toggle('off', !prefs.sound);
  $('#btnSound').innerHTML = '<svg><use href="#' + (prefs.sound ? 'i-sound' : 'i-mute') + '"/></svg>';
}
let audioStarted = false;
function audioOn() { FX.unlock(); if (!audioStarted && FX.audio()) { audioStarted = true; applySound(); } }

/* ================================================================ state */
let match = null;          // the game being shown
let view = null;           // the last settled view
let dv = null;             // the view as the presenter has played it so far
let presenting = false;
let lobby = null;
let matchSeq = 0;
const queue = [];

function seatOf(p) { return match && match.seats[p]; }
function nameOf(p) {
  if (!match) return '';
  const s = match.seats[p];
  if (!s) return 'P' + (p + 1);
  if (match.mode !== 'local' && p === match.me) return 'あなた';
  return s.nm;
}
function viewerSeat() { return match ? match.viewer : -1; }
function isHumanHere(p) {
  const s = seatOf(p);
  if (!s) return false;
  if (match.mode === 'guest') return p === match.me;
  return s.kind === 'me' || s.kind === 'local';
}

/* ================================================================ the board */
const TOKEN_SLOT = [[1 / 6, 0], [1 / 2, 0], [5 / 6, 0], [1 / 3, 1], [2 / 3, 1]];
let geo = { cw: 44, ch: 24 };
let identifiedStock = -1;
function boardTokenLogo(c) {
  const label = ['AEON', '', 'UFJ', 'Pana', ''][c];
  const mini = ['A', '', 'U', 'P', ''][c];
  if (c === 1 || c === 4) return brandLogo(c, true);
  return (c === 0 ? '<span class="token-wordmark">' + brandLogo(c) + '</span>' : '<span class="token-wordmark token-abbr">' + label + '</span>') + '<span class="token-mini token-abbr">' + mini + '</span>';
}
function identifyStock(c) {
  identifiedStock = c;
  $$('#boardQuotes .board-quote').forEach((el) => el.setAttribute('aria-pressed', String(Number(el.dataset.c) === c)));
  $$('#tokens .tok').forEach((el) => el.classList.toggle('identified', Number(el.dataset.c) === c));
  $$('.cell.located').forEach((el) => el.classList.remove('located'));
  if (dv && c >= 0) $('#cl' + dv.price[c])?.classList.add('located');
  $('#boardSelection').textContent = c >= 0 ? CN[c] + ' ' + $('#quote' + c + ' .quote-price').textContent + ' のコマを強調中' : 'ロゴを押すとコマを強調';
}
function updateBoardQuote(c, price) {
  const label = CN[c] + '・現在株価 $' + price;
  const token = $('#tk' + c), quote = $('#quote' + c);
  token.querySelector('.tp').textContent = CN[c] + ' $' + price;
  token.setAttribute('aria-label', label + '。株価コマを強調');
  quote.querySelector('.quote-price').textContent = '$' + price;
  quote.setAttribute('aria-label', label + '。対応するコマを強調');
  if (identifiedStock === c) $('#boardSelection').textContent = CN[c] + ' $' + price + ' のコマを強調中';
}
function buildBoard() {
  const grid = $('#grid');
  let h = '';
  for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++) {
    const cell = r * E.COLS + c, a = E.AREA[r][c];
    h += '<div class="cell' + (a % 2 ? ' odd' : '') + (cell === E.START_CELL ? ' start' : '') + '" id="cl' + cell + '"><span class="cell-price">' + E.GRID[r][c] + '</span></div>';
  }
  grid.innerHTML = h;
  // the black share of each level sits on the right edge, in that level's lowest right-column space
  let mk = '';
  for (let L = 0; L <= 9; L++) {
    let row = -1;
    for (let r = E.ROWS - 1; r >= 0; r--) if (E.AREA[r][E.COLS - 1] === L) { row = r; break; }
    mk += '<div class="areaMark" id="am' + L + '" data-row="' + row + '"><span>' + L + '</span>' + (L ? '<span class="sh sm bk" data-c="5"><svg viewBox="0 0 22 18"><use href="#i-case"/></svg></span>' : '') + '</div>';
  }
  $('#marks').innerHTML = mk;
  $('#tokens').innerHTML = [0, 1, 2, 3, 4].map((c) => '<button type="button" class="tok" id="tk' + c + '" data-c="' + c + '"><span class="token-code">' + boardTokenLogo(c) + '</span><span class="tp" aria-hidden="true"></span></button>').join('');
  $('#boardQuotes').innerHTML = '<div class="board-quote-heading"><b>現在の株価</b><span id="boardSelection" aria-live="polite">ロゴを押すとコマを強調</span></div><div class="board-quote-list">' + CN.map((name, c) => '<button type="button" class="board-quote" id="quote' + c + '" data-c="' + c + '" aria-pressed="false"><span class="quote-logo">' + brandLogo(c) + '</span><span class="quote-name"><span class="quote-token" aria-hidden="true">' + boardTokenLogo(c) + '</span>' + name + '</span><b class="quote-price num"></b></button>').join('') + '</div>';
  identifiedStock = -1;
  $$('#boardQuotes .board-quote, #tokens .tok').forEach((el) => { el.onclick = () => identifyStock(Number(el.dataset.c)); });
  let gt = '';
  E.GOLD_TRACK.forEach((g, i) => { gt += '<div class="gt' + (i === E.GOLD_END ? ' end' : '') + '" id="gt' + i + '">' + g + '</div>'; });
  $('#goldTrack').innerHTML = gt;
}
function layoutBoard() {
  if (!document.body.classList.contains('ingame')) return;
  const wide = window.matchMedia(WIDE).matches;
  const wrap = $('#boardWrap');
  wrap.style.paddingTop = Math.ceil($('#boardQuotes').offsetHeight + 24) + 'px';
  const wrapW = wrap.clientWidth - 16 - 34 - 6 - 30;
  let cw, ch;
  if (wide) {
    const top = wrap.getBoundingClientRect().top + parseFloat(getComputedStyle(wrap).paddingTop || '0');
    const availH = window.innerHeight - top - 10;
    ch = Math.floor(availH / 13);
    cw = Math.floor(Math.min(wrapW / 7, ch * 1.75));
    ch = Math.min(ch, Math.floor(cw * 0.75));
  } else {
    cw = Math.floor(Math.min(wrapW / 7, 74));
    ch = Math.floor(clamp(cw * 0.8, 48, 54));
  }
  geo = { cw, ch };
  document.documentElement.style.setProperty('--cw', cw + 'px');
  document.documentElement.style.setProperty('--ch', ch + 'px');
  const priceBand = Math.ceil(clamp(ch * 0.28, 10, 15)) + 6;
  document.documentElement.style.setProperty('--price-band', priceBand + 'px');
  document.documentElement.style.setProperty('--piece-h', Math.max(3, Math.min(17, (ch - priceBand - 6) / 2)) + 'px');
  wrap.classList.toggle('compact-pieces', cw < 75);
  $('#goldTrack').style.height = ch * 13 + 'px';
  $$('.areaMark').forEach((m) => { m.style.top = (Number(m.dataset.row) + 0.5) * ch + 'px'; m.style.right = '0px'; });
  if (dv) placeTokens(dv, true);
  const dock = $('#dock');
  if (dock) document.documentElement.style.setProperty('--dockH', dock.offsetHeight + 'px');
}
function tokenXY(cell, c) {
  const r = E.cellRow(cell), col = E.cellCol(cell);
  const priceBand = Math.ceil(clamp(geo.ch * 0.28, 10, 15)) + 6;
  const room = geo.ch - priceBand;
  return [(col + TOKEN_SLOT[c][0]) * geo.cw, r * geo.ch + priceBand + room * (TOKEN_SLOT[c][1] ? 0.75 : 0.25)];
}
function placeTokens(v, instant) {
  for (let c = 0; c < 5; c++) {
    const el = $('#tk' + c), [x, y] = tokenXY(v.price[c], c);
    el.getAnimations().forEach((a) => a.cancel());
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    updateBoardQuote(c, priceOf(v, c));
  }
  $$('.cell.cur').forEach((x) => x.classList.remove('cur'));
  v.price.forEach((cell) => { const el = $('#cl' + cell); if (el) el.classList.add('cur'); });
  $$('.cell.located').forEach((el) => el.classList.remove('located'));
  if (identifiedStock >= 0) $('#cl' + v.price[identifiedStock])?.classList.add('located');
}
async function moveToken(c, path, stepMs, dir) {
  const el = $('#tk' + c);
  if (path.length < 2) { const [x, y] = tokenXY(path[0], c); el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; return; }
  const frames = path.map((cell) => { const [x, y] = tokenXY(cell, c); return { transform: 'translate(' + x + 'px,' + y + 'px)' }; });
  el.classList.add('hl');
  updateBoardQuote(c, E.cellPrice(path[path.length - 1]));
  const total = dur(stepMs * (path.length - 1));
  const anim = el.animate(frames, { duration: total, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
  // a little trail of light behind the token
  if (FX.getLevel() && !skipping) {
    path.slice(1).forEach((cell, i) => setTimeout(() => {
      const [x, y] = tokenXY(cell, c), b = $('#tokens').getBoundingClientRect();
      FX.burst({ x: b.left + x, y: b.top + y }, 'spark', { n: 5, color: dir > 0 ? '#7dffbe' : dir < 0 ? '#ff8a84' : '#ffd27a', speed: 60, life: 0.5, g: 0 });
    }, total * (i + 1) / (path.length - 1)));
  }
  try { await anim.finished; } catch (e) { /* cancelled */ }
  const [x, y] = tokenXY(path[path.length - 1], c);
  el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  anim.cancel();
  const cellEl = $('#cl' + path[path.length - 1]);
  if (cellEl && dir) { cellEl.classList.remove('lit-up', 'lit-dn'); void cellEl.offsetWidth; cellEl.classList.add(dir > 0 ? 'lit-up' : 'lit-dn'); }
  setTimeout(() => el.classList.remove('hl'), dur(900));
}

/* ================================================================ rendering */
function renderTop(v) {
  const L = E.LEVELS[v.level];
  $('#lvNum').textContent = 'Lv ' + v.level;
  $('#lvLim').innerHTML = '<span>売買<b>' + L.s + '</b></span><span>金<b>' + L.g + '</b></span><span>袋<b>' + L.d + '</b></span>';
  $('#goldVal').textContent = '$' + E.GOLD_TRACK[v.gold];
  $('#goldBought').innerHTML = '購入 <b>' + v.bought + '</b><span>次の変動で+' + Math.floor(v.bought / 3) + '</span>';
  E.GOLD_TRACK.forEach((g, i) => { const el = $('#gt' + i); el.classList.toggle('now', i === v.gold); el.classList.toggle('past', i < v.gold); });
  for (let L2 = 0; L2 <= 9; L2++) { const m = $('#am' + L2); m.classList.toggle('gone', L2 > 0 && !v.levelBlack[L2]); m.classList.toggle('now', L2 === v.level); }
}
function knownShares(q) { return q.open ? q.sh : q.known; }
function seatCard(v, p) {
  const q = v.players[p], s = seatOf(p) || { nm: q.nm };
  const turn = v.phase === 'play' && v.turn === p;
  const tile = q.tile ? '<span class="tile' + (q.tileUsed ? ' used' : '') + '" title="ボーナスタイル">' + q.tile + '.</span>' : '';
  const show = q.open || prefs.pub;
  const ks = knownShares(q);
  let shs = '';
  for (let c = 0; c < 5; c++) if (ks[c] > 0) shs += shIcon(c, 'sm') + ks[c];
  if (!q.open && q.unknown > 0) shs += '<span class="q">?' + q.unknown + '</span>';
  if (!show) shs = '<span class="q">株 ' + q.shCount + '</span>';
  return '<button class="seat' + (turn ? ' turn' : '') + (s.here === false ? ' away' : '') + '" id="seat' + p + '" data-p="' + p + '">' + avatarHtml(s, p) +
    '<span class="nm">' + esc(nameOf(p)) + tile + '</span>' +
    '<span class="st">' + (show ? '<b class="num">' + money(q.cash) + '</b><span class="g">' + barIcon(14) + '<b class="num g">' + q.gold + '</b></span>' : '<span>資産は非公開</span>') + '</span>' +
    '<span class="shs">' + (shs || '<span class="q">株なし</span>') + '</span>' +
    (match && match.thinking === p ? '<span class="think"><i></i><i></i><i></i></span>' : '') + '</button>';
}
function renderSeats(v) {
  const me = viewerSeat();
  let h = '';
  for (let p = 0; p < v.n; p++) if (p !== me) h += seatCard(v, p);
  $('#seats').innerHTML = h;
  $$('#seats .seat').forEach((b) => { b.onclick = () => openSeatInfo(Number(b.dataset.p)); });
}
function renderMarket(v) {
  const me = viewerSeat(), mine = me >= 0 ? v.players[me].sh : null;
  let h = '<div class="mrow">';
  for (let c = 0; c < 5; c++) {
    const pr = priceOf(v, c), was = v.last && v.last.before ? v.last.before[c] : pr;
    const chg = pr > was ? '<span class="chg up">▲' + (pr - was) + '</span>' : pr < was ? '<span class="chg dn">▼' + (was - pr) + '</span>' : '';
    h += '<div class="mcol' + (v.market[c] ? '' : ' empty') + '" id="mc' + c + '" data-c="' + c + '" role="button" tabindex="0" aria-label="' + CN[c] + ' ' + money(pr) + ' 市場に' + v.market[c] + '株">' +
      '<span class="market-name">' + CN[c] + '<small>' + STOCK_CODE[c] + '</small></span>' + shIcon(c, 'lg') + '<span class="px"><small>$</small>' + pr + '</span><span class="cnt">市場 <b>' + v.market[c] + '</b></span>' + chg +
      (mine ? '<span class="own">保有 ' + mine[c] + '株 · ' + money(mine[c] * pr) + '</span>' : '') + '</div>';
  }
  h += '</div><div class="tracks">';
  // purchase tracks
  const trk = (name, id, arr, icon) => {
    let s = '<div class="trk" id="' + id + '"><div class="tt"><span>' + icon + ' ' + name + '</span><em class="' + (arr.length === v.cap - 1 ? 'hot' : '') + '">' + (arr.length === v.cap - 1 ? 'あと1つで相場変動' : 'あと' + (v.cap - arr.length) + 'つで変動') + '</em></div><div class="slots">';
    for (let i = 0; i < v.cap; i++) s += '<span class="slot" id="' + id + 's' + i + '">' + (arr[i] != null ? shIcon(arr[i]) : '') + '</span>';
    return s + '</div></div>';
  };
  h += trk('株の購入', 'tB', v.buyTrack, '<b style="color:var(--rise)">＋</b>');
  h += trk('金の購入', 'tG', v.goldTrack, barIcon(16));
  // the current sale track
  const t = v.sale.tracks[v.sale.cur], left = sum(t.c);
  let s = '<div class="trk sale" id="tS"><div class="tt"><span><b style="color:var(--fall)">－</b> 株の売却</span><em class="' + (left === v.saleLeft + 1 ? 'hot' : '') + '">' + (left <= v.saleLeft ? '補充待ち' : left === v.saleLeft + 1 ? 'あと1つで相場変動' : 'あと' + (left - v.saleLeft) + 'つ外すと変動') + '</em></div><div class="grid2"><div class="blk">';
  for (let k = 0; k < Math.max(t.k, 1); k++) s += k < t.k ? shIcon(5) : '<span class="slot" style="width:22px"></span>';
  s += '</div>';
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < 5; c++) s += '<span class="slot" id="tSs' + c + '_' + row + '">' + (t.c[c] > row ? shIcon(c) : '') + '</span>';
    if (row === 0) {
      s += '<span class="stages">';
      [1, 2, 3].forEach((n) => {
        const st = v.sale.stage, cur = (st === 1 && n === 1) || (st === 2 && n === 2) || (st === 3 && n === 3) || (st >= 4 && n === 2);
        const done = (n === 1 && st > 1) || (n === 3 && st > 3);
        s += '<span class="stg' + (cur ? ' cur' : '') + (done ? ' done' : '') + '">' + (n === 2 && st >= 4 ? '2/' + (st) : n) + '</span>';
      });
      s += '</span>';
    }
  }
  s += '</div></div>';
  h += s + '</div>';
  // the bag
  const risk = AI._cpu.pTwoBlack(v.bagCount, v.bagBlack, Math.min(E.LEVELS[v.level].d, v.bagCount));
  const est = v.bagEst, mx = Math.max(1, ...est);
  h += '<div class="bagbox" id="bagbox" role="button" tabindex="0" aria-label="袋">' + bagIcon() +
    '<span class="bi"><span>袋の中 <b>' + v.bagCount + '</b>個</span><span>黒 <b style="color:' + (v.bagBlack >= 2 ? 'var(--fall)' : 'var(--ink)') + '">' + v.bagBlack + '</b>個</span></span>' +
    '<span class="bars" title="袋の中身の見込み">' + est.map((x, c) => '<i style="--c:var(--c' + c + ');height:' + Math.max(2, Math.round(22 * x / mx)) + 'px"></i>').join('') + '</span>' +
    (prefs.risk ? '<span class="risk">次の変動で暴落<b style="color:' + (risk > 0.35 ? 'var(--fall)' : risk > 0.12 ? 'var(--amber)' : 'var(--rise)') + '">' + Math.round(risk * 100) + '%</b></span>' : '') + '</div>';
  $('#mkt').innerHTML = h;
  $$('#mkt .mcol').forEach((el) => { el.onclick = () => openColorInfo(Number(el.dataset.c)); });
  $('#bagbox').onclick = () => openBagInfo();
}
function portfolioValues(v, q) {
  const rows = CN.map((name, c) => ({ c, name, count: q.sh[c], price: priceOf(v, c), value: q.sh[c] * priceOf(v, c) }));
  const stockValue = rows.reduce((n, r) => n + r.value, 0);
  const goldValue = q.gold * E.GOLD_VALUE;
  return { rows, stockValue, goldValue, count: sum(q.sh), total: q.cash + stockValue + goldValue };
}
function portfolioStrip(v, q) {
  const a = portfolioValues(v, q);
  let h = '<div class="portfolio-heading"><span>あなたの資産</span><span class="portfolio-total">合計 <b class="num">' + money(a.total) + '</b></span><button id="aAssets" type="button" aria-label="自分の保有数と資産の内訳">内訳を見る</button></div>';
  h += '<div class="mine asset-summary"><span><small>現金</small><b class="num cash">' + money(q.cash) + '</b></span><span><small>金 <strong>' + q.gold + '本</strong></small><b class="num gold">' + money(a.goldValue) + '</b></span><span><small>株 <strong>' + a.count + '株</strong></small><b class="num">' + money(a.stockValue) + '</b></span></div>';
  h += '<div class="portfolio-holdings" aria-label="自分の株：保有数・現在の株価・評価額">';
  for (const r of a.rows) {
    h += '<div class="holding-card' + (r.count ? '' : ' zero') + '" data-c="' + r.c + '"><span class="holding-title">' + shIcon(r.c, 'sm') + '<span>' + r.name + '</span></span><strong class="holding-count num">' + r.count + '<small>株</small></strong><span class="holding-unit">単価 ' + money(r.price) + '</span><b class="holding-value num">' + money(r.value) + '</b></div>';
  }
  return h + '</div><p class="portfolio-note">株は現在の株価、金は終了時の1本$' + E.GOLD_VALUE + 'で評価</p>';
}
function portfolioDetail(v) {
  const me = viewerSeat();
  if (me < 0 || !v.players[me].sh) return '';
  const q = v.players[me], a = portfolioValues(v, q);
  let h = '<div class="portfolio-grand"><span>資産合計</span><strong class="num">' + money(a.total) + '</strong></div><p class="hint">現金＋保有株の現在評価額＋金の終了時価値です。株価が動くと評価額も更新されます。</p>';
  h += '<table class="portfolio-table"><caption>保有株の内訳</caption><thead><tr><th scope="col">株の種類</th><th scope="col">保有数</th><th scope="col">1株の価値</th><th scope="col">評価額</th></tr></thead><tbody>';
  for (const r of a.rows) h += '<tr data-c="' + r.c + '"><th scope="row">' + shIcon(r.c) + ' ' + r.name + '株</th><td><b>' + r.count + '</b>株</td><td class="num">' + money(r.price) + '</td><td class="num">' + money(r.value) + '</td></tr>';
  h += '</tbody><tfoot><tr><th scope="row">株の合計</th><td>' + a.count + '株</td><td></td><td class="num">' + money(a.stockValue) + '</td></tr></tfoot></table>';
  h += '<div class="portfolio-breakdown"><div><span>現金</span><b class="num">' + money(q.cash) + '</b></div><div><span>株の評価額 <small>保有数 × 現在の株価</small></span><b class="num">' + money(a.stockValue) + '</b></div><div><span>金 <small>' + q.gold + '本 × $' + E.GOLD_VALUE + '（終了時価値）</small></span><b class="num">' + money(a.goldValue) + '</b></div><div class="grand"><span>資産合計</span><b class="num">' + money(a.total) + '</b></div></div>';
  return h + '<p class="portfolio-explanation">金の「いま買う価格」と、この表の「終了時価値」は異なります。ルールに合わせ、金は1本$100で集計しています。</p>';
}
function openPortfolio() {
  if (!dv || viewerSeat() < 0) return;
  const el = openLayer('<h2>あなたの保有資産</h2>' + xBtn + '<div id="portfolioContent"></div>', 'portfolio-sheet');
  $('#portfolioContent', el).innerHTML = portfolioDetail(dv);
}

function renderDock(v) {
  const me = viewerSeat();
  const dock = $('#dock');
  if (me < 0) {
    const tp = v.phase === 'play' ? v.turn : -1;
    dock.innerHTML = '<div class="wait">' + (tp >= 0 ? '<b>' + esc(nameOf(tp)) + '</b> の番です' : 'ゲーム終了') + '</div>';
    return;
  }
  const q = v.players[me];
  let h = portfolioStrip(v, q);
  const L = E.LEVELS[v.level];
  const my = v.phase === 'play' && v.turn === me && !presenting && !match.waiting;
  if (v.phase !== 'play') h += '<div class="wait">ゲーム終了</div>';
  else if (my && v.step === 'post') {
    h += '<div class="post"><button class="act bon" id="aPost">ボーナスで操作<small>このあと1回</small></button><button class="act" id="aEnd">手番を終える<small>ボーナスは使わない</small></button></div>';
  } else if (my || v.turn === me) {
    const tile = q.tile && !q.tileUsed ? q.tile : 0;
    h += '<div class="acts">' +
      '<button class="act buy" id="aBuy"' + (my ? '' : ' disabled') + '>株を買う<small>最大' + (L.s + (tile >= 5 ? 1 : 0)) + '株</small></button>' +
      '<button class="act sell" id="aSell"' + (my ? '' : ' disabled') + '>株を売る<small>最大' + (L.s + (tile >= 3 ? 1 : 0)) + '株</small></button>' +
      '<button class="act gld" id="aGold"' + (my ? '' : ' disabled') + '>金を買う<small>$' + E.GOLD_TRACK[v.gold] + '・最大' + (L.g + (tile >= 4 ? 1 : 0)) + '本</small></button>' +
      (tile ? '<button class="act bon" id="aBonus"' + (my ? '' : ' disabled') + '><b>' + tile + '.</b>ボーナス</button>' : '') + '</div>';
  } else {
    const tp = v.turn;
    h += '<div class="wait">' + (match.thinking === tp ? '<b>' + esc(nameOf(tp)) + '</b> が考えています…' : '<b>' + esc(nameOf(tp)) + '</b> の番です') + '</div>';
  }
  dock.innerHTML = h;
  const detail = $('#portfolioContent'); if (detail) detail.innerHTML = portfolioDetail(v);
  const on = (id, f) => { const b = $('#' + id); if (b) b.onclick = () => { audioOn(); sfx('open'); f(); }; };
  on('aAssets', openPortfolio);
  on('aBuy', openBuy); on('aSell', openSell); on('aGold', openGold); on('aBonus', () => openBonus(false));
  on('aPost', () => openBonus(true)); on('aEnd', () => act({ t: 'end' }));
  document.documentElement.style.setProperty('--dockH', dock.offsetHeight + 'px');
}
function renderAll(v) {
  v = v || dv;
  if (!v) return;
  renderTop(v); renderSeats(v); renderMarket(v); renderDock(v);
  if (!presenting) placeTokens(v);
}

/* ================================================================ sheets */
function openLayer(html, cls = '') {
  const layer = $('#layer');
  layer.innerHTML = '<div class="scrim"></div><div class="sheet ' + cls + '" role="dialog" aria-modal="true">' + html + '</div>';
  layer.querySelector('.scrim').onclick = closeLayer;
  const x = layer.querySelector('[data-close]');
  if (x) x.onclick = closeLayer;
  return layer.querySelector('.sheet');
}
function closeLayer() { $('#layer').innerHTML = ''; const f = closeLayer.cb; closeLayer.cb = null; if (f) f(); }
const xBtn = '<button class="iconbtn x" data-close aria-label="閉じる"><svg><use href="#i-x"/></svg></button>';

function picks(id, options, cur, label) {
  return '<div class="lbl">' + label + '</div><div class="pickrow" id="' + id + '">' + options.map((o) =>
    '<button class="pick" data-c="' + o.v + '" data-v="' + o.v + '" aria-pressed="' + (o.v === cur) + '" aria-label="' + CN[o.v] + '株を選ぶ' + (o.disabled ? '（選択できません）' : '') + '"' + (o.disabled ? ' disabled' : '') + '>' + o.html + '<span class="pick-status">' + (o.disabled ? '対象外' : o.v === cur ? '✓ 選択中' : '選ぶ') + '</span></button>').join('') + '</div>';
}
function bindPicks(root, id, fn) { $$('#' + id + ' .pick', root).forEach((b) => { b.onclick = () => { sfx('tap'); fn(Number(b.dataset.v)); }; }); }

// The same names and letter codes identify every stock on the board, in the market and in orders.
function stockEmblem(c) {
  return '<span class="stock-emblem" data-c="' + c + '" aria-hidden="true">' + shIcon(c, 'lg') + '<i>' + STOCK_CODE[c] + '</i></span>';
}
function stockPickHtml(c, note = '') {
  return stockEmblem(c) + '<span class="pick-info"><strong>' + CN[c] + '</strong><small>' + money(priceOf(dv, c)) + (note ? ' · ' + note : '') + '</small></span>';
}
function tradeRow(v, q, c, n, plus, selling) {
  const pr = priceOf(v, c), minus = n > 0, empty = selling ? !q.sh[c] : !v.market[c];
  return '<div class="qrow trade-row' + (n ? ' selected' : '') + (empty ? ' unavailable' : '') + '" data-c="' + c + '">' + stockEmblem(c) +
    '<span class="info"><strong>' + CN[c] + ' <em>' + STOCK_CODE[c] + '</em></strong><span class="stock-price">' + money(pr) + '<small> / 1株</small></span><span>保有 ' + q.sh[c] + '株' + (selling ? '' : ' · 市場 ' + v.market[c] + '株') + '</span></span>' +
    '<span class="step"><button data-c="' + c + '" data-d="-1" aria-label="' + CN[c] + '株を1株減らす"' + (minus ? '' : ' disabled') + '>−</button><span class="v" aria-label="' + CN[c] + '株の選択数">' + n + '<small>株</small></span><button data-c="' + c + '" data-d="1" aria-label="' + CN[c] + '株を1株増やす"' + (plus ? '' : ' disabled') + '>＋</button></span></div>';
}
function orderStep(num, title, note = '') {
  return '<div class="order-step"><span>' + num + '</span><strong>' + title + '</strong>' + (note ? '<small>' + note + '</small>' : '') + '</div>';
}
function orderRecap(n, c, verb, track) {
  const items = n.map((k, i) => k ? CN[i] + '株 × ' + k : '').filter(Boolean);
  return '<div class="order-recap" aria-live="polite"><div><span>' + verb + '内容</span><strong>' + (items.join('、') || '売買なし（市場のみ操作）') + '</strong></div><div><span>市場の操作</span><strong>' + (c == null ? '対象の株なし' : CN[c] + '株を1つ ' + track) + '</strong><button type="button" class="review-market">確認・変更</button></div></div>';
}
function bindTradeRows(el, id, st, draw) {
  $$('#' + id + ' .step button', el).forEach((b) => { b.onclick = () => {
    sfx('tap'); const c = Number(b.dataset.c), d = Number(b.dataset.d), top = el.scrollTop;
    st.n[c] = clamp(st.n[c] + d, 0, 9); draw(); el.scrollTop = top;
    const next = $('#' + id + ' .step button[data-c="' + c + '"][data-d="' + d + '"]', el);
    if (next && !next.disabled) next.focus({ preventScroll: true });
  }; });
}

/* what a purchase-track placement would do (third share, emptied market, trigger) */
function placeEffects(v, track, n, place) {
  const out = [];
  const after = v.market.map((m, c) => m - (n ? n[c] : 0) - (place === c ? 1 : 0));
  for (let c = 0; c < 5; c++) if (v.market[c] > 0 && after[c] === 0) out.push('<div class="up">▲ ' + CN[c] + 'の在庫が市場からなくなる → ' + CN[c] + 'が1マス上がる</div>');
  if (place != null) {
    const arr = track === 'buy' ? v.buyTrack : v.goldTrack;
    if (arr.filter((x) => x === place).length === 2) out.push('<div class="up">▲ ' + CN[place] + 'がトラックに3つ並ぶ → ' + CN[place] + 'が1マス上がる</div>');
    if (arr.length + 1 >= v.cap) out.push('<div class="pc">★ トラックが埋まる → 相場変動（袋から' + E.LEVELS[v.level].d + '個引く）</div>');
  }
  return out.join('');
}
function trackPreview(v, track, place) {
  const arr = (track === 'buy' ? v.buyTrack : v.goldTrack).slice();
  let s = '<div class="slots" style="margin-top:6px">';
  for (let i = 0; i < v.cap; i++) {
    const c = i < arr.length ? arr[i] : i === arr.length && place != null ? place : null;
    s += '<span class="slot"' + (i === arr.length && place != null ? ' style="border-color:var(--amber);border-style:solid"' : '') + '>' + (c != null ? shIcon(c) : '') + '</span>';
  }
  return s + '</div>';
}
function placeChoicesV(v, n) { return AI.placeChoicesV(v, n); }
function removeChoicesV(v, n) { return AI.removeChoicesV(v, n); }
function defaultPlace(v, choices, mine, n) {
  if (!choices.length) return null;
  let best = choices[0], bv = -1;
  choices.forEach((c) => { const val = (mine[c] + (n ? n[c] : 0)) * priceOf(v, c) + (n && n[c] ? 1000 : 0); if (val > bv) { bv = val; best = c; } });
  return best;
}
function defaultRemove(v, choices, mine, n) {
  if (!choices.length) return null;
  let best = choices[0], bv = Infinity;
  choices.forEach((c) => { const val = (mine[c] - (n ? n[c] : 0)) * 1000 - priceOf(v, c); if (val < bv) { bv = val; best = c; } });
  return best;
}
function bonusTileText(tile) {
  const adv = ['手番中に1回だけ、市場の株をトラックに置く／売却トラックから外す'];
  if (tile >= 3) adv.push('株を売るとき1株多く');
  if (tile >= 4) adv.push('金を買うとき1本多く');
  if (tile >= 5) adv.push('株を買うとき1株多く');
  return adv;
}

function openBuy() {
  const v = dv, me = viewerSeat(), q = v.players[me], L = E.LEVELS[v.level];
  const tile = q.tile && !q.tileUsed ? q.tile : 0, max = L.s + (tile >= 5 ? 1 : 0);
  const st = { n: [0, 0, 0, 0, 0], place: null, then: false };
  const el = openLayer('<h2>株を買う <span class="lim">上限 ' + L.s + '株' + (tile >= 5 ? '（ボーナスで+1）' : '') + '</span></h2>' + xBtn +
    '<p class="hint">買う株と数を選び、そのあと市場からトラックへ置く株を選びます。</p><div id="bq"></div>', 'order-sheet');
  const draw = () => {
    const cost = st.n.reduce((s, k, c) => s + k * priceOf(v, c), 0), tot = sum(st.n);
    const choices = placeChoicesV(v, st.n);
    if (!choices.includes(st.place)) st.place = defaultPlace(v, choices, q.sh, st.n);
    let h = '<div class="order-layout"><section class="order-block">' + orderStep(1, '買う株を選ぶ', tot + ' / ' + max + '株') + '<div class="rows trade-rows">';
    for (let c = 0; c < 5; c++) {
      const pr = priceOf(v, c);
      const canPlus = tot < max && st.n[c] < v.market[c] && cost + pr <= q.cash;
      h += tradeRow(v, q, c, st.n[c], canPlus, false);
    }
    h += '</div></section><section class="order-block">';
    h += orderStep(2, '市場からトラックへ置く株');
    h += '<p class="order-help">追加で市場から1株を移します。手持ちの株は減りません。</p>';
    h += picks('bp', [0, 1, 2, 3, 4].map((c) => ({ v: c, html: stockPickHtml(c), disabled: !choices.includes(c) })), st.place, tot ? (choices.some((c) => st.n[c]) ? '買った色から選択してください。' : '買った色が市場に残らないため、好きな色を選べます。') : '0株でも市場の操作だけ行えます。');
    h += trackPreview(v, 'buy', st.place);
    let ef = placeEffects(v, 'buy', st.n, st.place);
    if (tot > L.s) ef = '<div>ボーナスタイル（' + q.tile + '.）を使って1株多く買います</div>' + ef;
    h += '<div class="effects">' + ef + '</div>';
    h += '</section></div>';
    h += '<div class="order-footer">' + orderRecap(st.n, st.place, '購入', '→ 株の購入トラック');
    h += '<div class="total"><span>支払い（残り ' + money(q.cash - cost) + '）</span><b>' + money(cost) + '</b></div>';
    if (tile >= 2 && tot <= L.s) h += '<label class="chk"><input type="checkbox" id="bThen"' + (st.then ? ' checked' : '') + '>このあとボーナスで市場をもう1回操作する</label>';
    h += '<button class="btn primary big go" id="bGo">' + (tot ? tot + '株買う（' + money(cost) + '）' : choices.length ? '買わずに1株置くだけ' : '何もしない（市場が空）') + '</button>';
    h += '</div>';
    $('#bq', el).innerHTML = h;
    bindTradeRows(el, 'bq', st, draw);
    bindPicks(el, 'bp', (c) => { st.place = c; draw(); });
    $('.review-market', el).onclick = () => { $('#bp', el).scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' }); };
    const th = $('#bThen', el); if (th) th.onchange = () => { st.then = th.checked; };
    $('#bGo', el).onclick = () => { closeLayer(); act({ t: 'buy', n: st.n.slice(), place: st.place, then: st.then && sum(st.n) <= L.s }); };
  };
  draw();
}
function openSell() {
  const v = dv, me = viewerSeat(), q = v.players[me], L = E.LEVELS[v.level];
  const tile = q.tile && !q.tileUsed ? q.tile : 0, max = L.s + (tile >= 3 ? 1 : 0);
  const st = { n: [0, 0, 0, 0, 0], rm: null, then: false };
  const el = openLayer('<h2>株を売る <span class="lim">上限 ' + L.s + '株' + (tile >= 3 ? '（ボーナスで+1）' : '') + '</span></h2>' + xBtn +
    '<p class="hint">売る株と数を選び、そのあと売却トラックから市場へ戻す株を選びます。</p><div id="sq"></div>', 'order-sheet');
  const draw = () => {
    const gain = st.n.reduce((s, k, c) => s + k * priceOf(v, c), 0), tot = sum(st.n);
    const choices = removeChoicesV(v, st.n);
    if (!choices.includes(st.rm)) st.rm = defaultRemove(v, choices, q.sh, st.n);
    let h = '<div class="order-layout"><section class="order-block">' + orderStep(1, '売る株を選ぶ', tot + ' / ' + max + '株') + '<div class="rows trade-rows">';
    for (let c = 0; c < 5; c++) {
      const pr = priceOf(v, c);
      h += tradeRow(v, q, c, st.n[c], tot < max && st.n[c] < q.sh[c], true);
    }
    h += '</div></section><section class="order-block">';
    const t = v.sale.tracks[v.sale.cur];
    h += orderStep(2, '売却トラックから市場へ戻す株');
    h += '<p class="order-help">この色の株価が1マス下がります。この操作で手持ちの株は減りません。</p>';
    h += picks('sp', [0, 1, 2, 3, 4].map((c) => ({ v: c, html: stockPickHtml(c, '残り' + t.c[c] + '株'), disabled: !choices.includes(c) })), st.rm, tot ? (choices.some((c) => st.n[c]) ? '売った色から選択してください。' : '売った色がトラックにないため、好きな色を選べます。') : '0株でも市場の操作だけ行えます。');
    let ef = '';
    if (st.rm != null) {
      const from = v.price[st.rm], to = E.stepLeft(from);
      ef += '<div class="dn">▼ ' + CN[st.rm] + 'が1マス下がる（$' + E.cellPrice(from) + ' → $' + E.cellPrice(to) + '）</div>';
      if (sum(t.c) - 1 <= v.saleLeft) ef += '<div class="pc">★ 売却トラックの残りが' + v.saleLeft + 'つに → 相場変動（袋から' + L.d + '個引く）</div>';
    }
    if (tot > L.s) ef = '<div>ボーナスタイル（' + q.tile + '.）を使って1株多く売ります</div>' + ef;
    h += '<div class="effects">' + ef + '</div>';
    h += '</section></div>';
    h += '<div class="order-footer">' + orderRecap(st.n, st.rm, '売却', '→ 市場へ戻す');
    h += '<div class="total"><span>受け取り</span><b>' + money(gain) + '</b></div>';
    if (tile >= 2 && tot <= L.s) h += '<label class="chk"><input type="checkbox" id="sThen"' + (st.then ? ' checked' : '') + '>このあとボーナスで市場をもう1回操作する</label>';
    h += '<button class="btn primary big go" id="sGo">' + (tot ? tot + '株売る（' + money(gain) + '）' : '売らずに1株外すだけ') + '</button>';
    h += '</div>';
    $('#sq', el).innerHTML = h;
    bindTradeRows(el, 'sq', st, draw);
    bindPicks(el, 'sp', (c) => { st.rm = c; draw(); });
    $('.review-market', el).onclick = () => { $('#sp', el).scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' }); };
    const th = $('#sThen', el); if (th) th.onchange = () => { st.then = th.checked; };
    $('#sGo', el).onclick = () => { closeLayer(); act({ t: 'sell', n: st.n.slice(), remove: st.rm, then: st.then && sum(st.n) <= L.s }); };
  };
  draw();
}
function openGold() {
  const v = dv, me = viewerSeat(), q = v.players[me], L = E.LEVELS[v.level];
  const tile = q.tile && !q.tileUsed ? q.tile : 0, gp = E.GOLD_TRACK[v.gold];
  const max = Math.min(L.g + (tile >= 4 ? 1 : 0), Math.floor(q.cash / gp));
  const st = { k: Math.max(0, Math.min(max, L.g)), place: null, then: false };
  const el = openLayer('<h2>金を買う <span class="lim">1本 $' + gp + '・上限 ' + L.g + '本' + (tile >= 4 ? '（ボーナスで+1）' : '') + '</span></h2>' + xBtn +
    '<p class="hint">金はゲームの終わりに1本$100。いま買えば差額がもうけです。さらに好きな色を1株、市場から「金の購入」トラックに置きます。3本買うごとに次の相場変動で金価格が1段上がります。</p><div id="gq"></div>', 'order-sheet');
  const draw = () => {
    const choices = placeChoicesV(v, null);
    if (!choices.includes(st.place)) st.place = defaultPlace(v, choices, q.sh, null);
    let h = orderStep(1, '買う金の本数') + '<div class="rows"><div class="qrow gold-order-row">' + barIcon(30) + '<span class="info"><strong>金（ゴールド）</strong><b>$' + gp + '</b><span>終わりに$100・手元' + q.gold + '本</span></span><span class="step"><button id="gm" aria-label="金を1本減らす"' + (st.k ? '' : ' disabled') + '>−</button><span class="v">' + st.k + '</span><button id="gpb" aria-label="金を1本増やす"' + (st.k < max ? '' : ' disabled') + '>＋</button></span></div></div>';
    h += orderStep(2, '市場からトラックへ置く株');
    h += '<p class="order-help">金の購入とは別に、選んだ色の株を市場から1つ移します。</p>';
    h += picks('gpk', [0, 1, 2, 3, 4].map((c) => ({ v: c, html: stockPickHtml(c), disabled: !choices.includes(c) })), st.place, '金の購入トラックに置く株（どの色でも）');
    h += trackPreview(v, 'gold', st.place);
    let ef = placeEffects(v, 'gold', null, st.place);
    const bars = v.bought + st.k;
    if (st.k) ef += '<div>購入済み ' + v.bought + ' → ' + bars + '本（次の相場変動で金価格 +' + Math.floor(bars / 3) + '段）</div>';
    if (st.k > L.g) ef = '<div>ボーナスタイル（' + q.tile + '.）を使って1本多く買います</div>' + ef;
    h += '<div class="effects">' + ef + '</div>';
    h += '<div class="total"><span>支払い（残り ' + money(q.cash - st.k * gp) + '）</span><b>' + money(st.k * gp) + '</b></div>';
    if (tile >= 2 && st.k <= L.g) h += '<label class="chk"><input type="checkbox" id="gThen"' + (st.then ? ' checked' : '') + '>このあとボーナスで市場をもう1回操作する</label>';
    h += '<button class="btn primary big go" id="gGo">' + (st.k ? st.k + '本買う（' + money(st.k * gp) + '）' : '買わずに1株置くだけ') + '</button>';
    $('#gq', el).innerHTML = h;
    $('#gm', el).onclick = () => { sfx('tap'); st.k = Math.max(0, st.k - 1); draw(); };
    $('#gpb', el).onclick = () => { sfx('tap'); st.k = Math.min(max, st.k + 1); draw(); };
    bindPicks(el, 'gpk', (c) => { st.place = c; draw(); });
    const th = $('#gThen', el); if (th) th.onchange = () => { st.then = th.checked; };
    $('#gGo', el).onclick = () => { closeLayer(); act({ t: 'gold', k: st.k, place: st.place, then: st.then && st.k <= L.g }); };
  };
  draw();
}
function openBonus(post) {
  const v = dv, me = viewerSeat(), q = v.players[me];
  if (!q.tile || q.tileUsed) return;
  const st = { track: 'buy', c: null };
  const el = openLayer('<h2>ボーナスタイル ' + q.tile + '. <span class="lim">1回だけ</span></h2>' + xBtn +
    '<p class="hint">このタイルでできること：' + bonusTileText(q.tile).map(esc).join('／') + '。' + (post ? '' : '「1多く」は各アクションの画面で選べます。ここでは市場の操作をします（手番のアクションはこのあと続けて行います）。') + '</p><div id="oq"></div>', 'order-sheet');
  const draw = () => {
    const t = v.sale.tracks[v.sale.cur];
    const can = (c) => (st.track === 'sale' ? t.c[c] > 0 : v.market[c] > 0);
    if (st.c == null || !can(st.c)) st.c = [0, 1, 2, 3, 4].find(can);
    let h = '<div class="seg" id="otk"><button data-v="buy" aria-pressed="' + (st.track === 'buy') + '">株の購入トラックに置く</button><button data-v="gold" aria-pressed="' + (st.track === 'gold') + '">金の購入トラックに置く</button><button data-v="sale" aria-pressed="' + (st.track === 'sale') + '">売却トラックから外す</button></div>';
    h += picks('ock', [0, 1, 2, 3, 4].map((c) => ({ v: c, html: stockPickHtml(c), disabled: !can(c) })), st.c, st.track === 'sale' ? '外す株' : '置く株');
    let ef = '';
    if (st.c != null) {
      if (st.track === 'sale') {
        ef += '<div class="dn">▼ ' + CN[st.c] + 'が1マス下がる</div>';
        if (sum(t.c) - 1 <= v.saleLeft) ef += '<div class="pc">★ 相場変動が起きます</div>';
      } else ef += placeEffects(v, st.track, null, st.c);
    }
    h += '<div class="effects">' + ef + '</div>';
    h += '<button class="btn primary big go" id="oGo">ボーナスを使う</button>';
    if (post) h += '<div style="height:8px"></div><button class="btn ghost" id="oSkip">使わずに手番を終える</button>';
    $('#oq', el).innerHTML = h;
    $$('#otk button', el).forEach((b) => { b.onclick = () => { sfx('tap'); st.track = b.dataset.v; draw(); }; });
    bindPicks(el, 'ock', (c) => { st.c = c; draw(); });
    $('#oGo', el).onclick = () => { if (st.c == null) return; closeLayer(); act({ t: 'bonus', track: st.track, c: st.c }); };
    const sk = $('#oSkip', el); if (sk) sk.onclick = () => { closeLayer(); act({ t: 'end' }); };
  };
  draw();
}

/* information sheets */
function openSeatInfo(p) {
  const v = dv, q = v.players[p], s = seatOf(p) || {};
  const ks = knownShares(q);
  let rows = '';
  for (let c = 0; c < 5; c++) rows += '<tr><td>' + shIcon(c) + ' ' + CN[c] + '</td><td class="n">' + (ks[c] || 0) + '</td><td class="n">' + q.bought[c] + '</td><td class="n">' + q.sold[c] + '</td></tr>';
  openLayer('<h2>' + avatarHtml(s, p) + esc(nameOf(p)) + '</h2>' + xBtn +
    (q.mibs ? '<p class="hint">M.I.B.S.（最低限の知能の株式仲買サービス）。ついたてを使わず、資産はいつも公開。決まった手順で動きます：上限まで買えるうちは株と金の安いほうを買い、足りなくなったら高い株から売ります。</p>' : '') +
    '<p>' + (q.open || prefs.pub ? '現金 <b class="num">' + money(q.cash) + '</b>　金 <b class="num">' + q.gold + '</b>本' : '資産は非公開') + (q.tile ? '　ボーナス ' + q.tile + '.' + (q.tileUsed ? '（使用済み）' : '') : '') + '</p>' +
    '<table class="res"><tr><th>色</th><th>' + (q.open ? '持ち株' : 'わかっている株') + '</th><th>買った</th><th>売った</th></tr>' + rows + '</table>' +
    (q.open ? '' : '<p class="hint">はじめに引いた5株の色は見えません（いま見えていない株 ' + q.unknown + '株）。現金と金は、すべての支払いが公開なので正確です。</p>'));
}
function openColorInfo(c) {
  const v = dv;
  const pr = priceOf(v, c), cell = v.price[c];
  let rows = '';
  for (let p = 0; p < v.n; p++) { const q = v.players[p], ks = knownShares(q); rows += '<tr><td>' + esc(nameOf(p)) + '</td><td class="n">' + (ks[c] || 0) + (!q.open && q.unknown ? '<small style="color:var(--ink3)"> +?</small>' : '') + '</td></tr>'; }
  const up = E.cellPrice(E.stepRight(cell)), dn = E.cellPrice(E.stepLeft(cell));
  openLayer('<h2>' + shIcon(c, 'lg') + CN[c] + ' <span class="num" style="font-size:24px">$' + pr + '</span></h2>' + xBtn +
    (viewerSeat() >= 0 ? '<div class="color-own">あなたの保有 <strong>' + v.players[viewerSeat()].sh[c] + '株</strong> × ' + money(pr) + ' = <strong>' + money(v.players[viewerSeat()].sh[c] * pr) + '</strong></div>' : '') +
    '<p class="hint">1マス上がると $' + up + '、1マス下がると $' + dn + '。市場に ' + v.market[c] + '株、袋の中に約 ' + v.bagEst[c].toFixed(1) + '株（見込み）。</p>' +
    '<table class="res"><tr><th>プレイヤー</th><th>持ち株（わかる分）</th></tr>' + rows + '</table>');
}
function openBagInfo() {
  const v = dv, L = E.LEVELS[v.level];
  const risk = AI._cpu.pTwoBlack(v.bagCount, v.bagBlack, Math.min(L.d, v.bagCount));
  let bars = '';
  for (let c = 0; c < 5; c++) bars += '<div class="qrow" style="grid-template-columns:auto 1fr auto">' + shIcon(c) + '<span style="height:10px;border-radius:5px;background:var(--c' + c + ');width:' + Math.round(100 * v.bagEst[c] / Math.max(1, v.bagCount)) + '%"></span><b class="num">' + v.bagEst[c].toFixed(1) + '</b></div>';
  openLayer('<h2>' + bagIcon('bag" style="width:30px;height:30px') + '袋の中</h2>' + xBtn +
    '<p>全部で <b class="num">' + v.bagCount + '</b>個、そのうち黒 <b class="num">' + v.bagBlack + '</b>個。次の相場変動では <b class="num">' + Math.min(L.d, v.bagCount) + '</b>個引きます。</p>' +
    '<p>黒が2個以上出る（暴落する）確率 <b class="num" style="font-size:18px">' + Math.round(risk * 100) + '%</b></p>' +
    '<div class="rows">' + bars + '</div><p class="hint">色ごとの数は、場に出たもの・トラックから入ったもの・公開された取引から計算した見込みです（ほかの人が最初に引いた5株の色は見えないため）。</p>');
}

/* ================================================================ news ticker and log */
function headline(html, cls) {
  if (!match) return;
  match.news.unshift({ html, cls });
  match.news.length = Math.min(match.news.length, 6);
  $('#tickerInner').innerHTML = match.news.map((n) => '<span class="' + (n.cls || '') + '">' + n.html + '</span>').join('');
  match.log.push({ html, cls, t: dv ? dv.turnNo : 0 });
}
function openLog() {
  const items = (match ? match.log : []).slice(-120).reverse();
  openLayer('<h2>取引の記録</h2>' + xBtn + '<div class="log">' + (items.map((x) => '<div class="' + (x.cls === 'pc' ? 'pcl' : '') + '">' + x.html + '</div>').join('') || '<div>まだ何もありません</div>') + '</div>');
}
function openChart() {
  const v = dv;
  const hist = (v.hist || []).filter((h, i, a) => i === 0 || h.t !== a[i - 1].t || h.pc !== a[i - 1].pc);
  if (hist.length < 2) { openLayer('<h2>値動き</h2>' + xBtn + '<p>まだ値動きがありません。</p>'); return; }
  const Wd = 340, Ht = 200, pad = 26, maxT = hist[hist.length - 1].t || 1;
  const ly = (p) => Ht - pad - (Math.log(p) - Math.log(4)) / (Math.log(240) - Math.log(4)) * (Ht - 2 * pad);
  const lx = (t) => pad + t / Math.max(1, maxT) * (Wd - 2 * pad);
  let s = '<svg viewBox="0 0 ' + Wd + ' ' + Ht + '" role="img" aria-label="株価の推移">';
  [5, 10, 20, 50, 100, 200].forEach((p) => { s += '<line x1="' + pad + '" x2="' + (Wd - pad) + '" y1="' + ly(p) + '" y2="' + ly(p) + '" stroke="rgba(255,255,255,.08)"/><text x="' + (pad - 4) + '" y="' + (ly(p) + 3) + '" fill="#6f9089" font-size="8" text-anchor="end" font-family="Oswald">' + p + '</text>'; });
  hist.filter((h, i) => i && h.pc !== hist[i - 1].pc).forEach((h) => { s += '<line x1="' + lx(h.t) + '" x2="' + lx(h.t) + '" y1="' + pad + '" y2="' + (Ht - pad) + '" stroke="rgba(255,180,63,.18)" stroke-dasharray="2 3"/>'; });
  for (let c = 0; c < 5; c++) {
    const pts = hist.map((h) => lx(h.t).toFixed(1) + ',' + ly(h.p[c]).toFixed(1)).join(' ');
    s += '<polyline points="' + pts + '" fill="none" stroke="' + FX.COLORS[c] + '" stroke-width="2" stroke-linejoin="round"/>';
  }
  const gpts = hist.map((h) => lx(h.t).toFixed(1) + ',' + ly(h.g).toFixed(1)).join(' ');
  s += '<polyline points="' + gpts + '" fill="none" stroke="#f6c64a" stroke-width="1.5" stroke-dasharray="4 3"/>';
  s += '</svg>';
  openLayer('<h2>値動き</h2>' + xBtn + '<div class="chartbox">' + s + '</div><p class="legend">' + CN.map((n, c) => '<span><i style="background:' + FX.COLORS[c] + '"></i>' + n + '</span>').join('') + '<span><i style="background:#f6c64a"></i>金</span></p><p class="hint">縦の点線が相場変動。縦軸は対数目盛りです。</p>');
}

/* ================================================================ the presenter */
function enqueue(ev, finalView) {
  queue.push({ ev, view: finalView });
  if (!presenting) pump();
}
let pumpGen = 0;                                       // leaving a game orphans its presenter
async function pump() {
  const gen = pumpGen;
  presenting = true;
  if (dv || view) renderDock(dv || view);
  while (queue.length) {
    const u = queue.shift();
    if (!dv) dv = E.clone(u.view);
    for (const e of u.ev) {
      try { await playEvent(e); } catch (err) { console.warn('present', err); }
      if (gen !== pumpGen) return;
    }
    if (TEST) { const bad = diffView(dv, u.view); if (bad) console.error('presenter drift: ' + bad); }
    view = u.view; dv = E.clone(u.view);
    placeTokens(dv);
    renderAll(dv);
    if (queue.length > 2) skipping = true;
  }
  skipping = false;
  presenting = false;
  $('#cine').classList.remove('on');
  renderAll(dv);
  if (match && match.mode === 'guest') match.link.send({ k: 'seen', no: dv.turnNo });
  afterIdle();
}
/* test builds: does the view the presenter built event by event match the one the engine sent? */
function diffView(a, b) {
  for (const k of ['phase', 'turn', 'step', 'turnNo', 'pcNo', 'gold', 'bought', 'level', 'bank', 'bagCount', 'bagBlack']) if (a[k] !== b[k]) return k + ' ' + a[k] + '≠' + b[k];
  for (const k of ['price', 'market', 'buyTrack', 'goldTrack', 'levelBlack', 'sale']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return k + ' ' + JSON.stringify(a[k]) + '≠' + JSON.stringify(b[k]);
  for (let i = 0; i < b.players.length; i++) {
    const x = a.players[i], y = b.players[i];
    for (const k of ['cash', 'gold', 'shCount', 'tileUsed']) if (x[k] !== y[k]) return 'p' + i + '.' + k + ' ' + x[k] + '≠' + y[k];
    if (x.open === y.open && JSON.stringify(x.known) !== JSON.stringify(y.known)) return 'p' + i + '.known';
    if (x.sh && y.sh && JSON.stringify(x.sh) !== JSON.stringify(y.sh)) return 'p' + i + '.sh';
    for (const k of ['bought', 'sold']) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return 'p' + i + '.' + k;
  }
  return '';
}
function applyEv(v, e) {
  const q = e.p != null ? v.players[e.p] : null;
  switch (e.k) {
    case 'buy': q.cash -= e.cost; for (let c = 0; c < 5; c++) { v.market[c] -= e.n[c]; if (q.sh) q.sh[c] += e.n[c]; q.known[c] += e.n[c]; q.bought[c] += e.n[c]; } q.shCount += sum(e.n); break;
    case 'place': v.market[e.c]--; (e.track === 'buy' ? v.buyTrack : v.goldTrack).push(e.c); break;
    case 'move': v.price[e.c] = e.path[e.path.length - 1]; break;
    case 'sell': q.cash += e.gain; for (let c = 0; c < 5; c++) { v.market[c] += e.n[c]; if (q.sh) q.sh[c] -= e.n[c]; q.known[c] = Math.max(0, q.known[c] - e.n[c]); q.sold[c] += e.n[c]; } q.shCount -= sum(e.n); break;
    case 'unsale': v.sale.tracks[e.track].c[e.c]--; v.market[e.c]++; break;
    case 'gold': q.cash -= e.cost; q.gold += e.n; v.bought = e.bought; break;
    case 'bonus': q.tileUsed = true; break;
    case 'pc': v.pcNo = e.no; v.bagCount -= e.drawn.length; v.bagBlack -= e.black; v.last = { before: v.price.map((x) => E.cellPrice(x)) }; break;
    case 'gold-up': v.gold = e.to; v.bought = 0; break;
    case 'pc-move': e.moves.forEach((m) => { v.price[m.c] = m.path[m.path.length - 1]; }); break;
    case 'pc-clean':
      for (let c = 0; c < 5; c++) v.market[c] += e.toMarket[c];
      if (e.blackTo === 'bag') { v.bagCount += 1; v.bagBlack += 1; } else if (e.blackTo === 'bank') v.bank += e.black;
      if (e.trig === 'buy') v.buyTrack = []; else if (e.trig === 'gold') v.goldTrack = [];
      else { v.sale.tracks[e.sale].c = [0, 0, 0, 0, 0]; v.sale.tracks[e.sale].k = 0; }
      v.bagCount += sum(e.toBag) + e.toBagBlack; v.bagBlack += e.toBagBlack;
      break;
    case 'level': v.level = e.to; e.blacks.forEach((L) => { v.levelBlack[L] = false; }); v.bagCount += e.blacks.length; v.bagBlack += e.blacks.length; break;
    case 'sale-next':
      v.sale.cur = e.cur; v.sale.stage = e.stage;
      if (e.refill) { for (let c = 0; c < 5; c++) { v.sale.tracks[1].c[c] += e.refill[c]; v.market[c] -= e.refill[c]; } v.sale.tracks[1].k += e.black || 0; v.bank -= e.black || 0; }
      break;
    case 'turn': v.turn = e.p; v.step = 'pre'; v.turnNo = e.no; break;
    case 'await-bonus': v.step = 'post'; break;
    case 'end':
      v.phase = 'over'; v.result = e.result;
      // the shares are sold to the market at the final prices
      e.result.rows.forEach((r) => {
        const pq = v.players[r.p];
        pq.cash = r.cash + r.shareValue; pq.open = true; pq.unknown = 0; pq.shCount = 0;
        pq.sh = [0, 0, 0, 0, 0]; pq.known = [0, 0, 0, 0, 0];
        for (let c = 0; c < 5; c++) v.market[c] += r.shares[c];
      });
      break;
  }
}
function seatEl(p) {
  if (p === viewerSeat()) return $('#dock .mine') || $('#dock');
  return $('#seat' + p) || $('#top');
}
function bankEl() { return $('#goldPlate'); }
const TRIG_TEXT = { buy: '株の購入トラックが埋まった', gold: '金の購入トラックが埋まった', sale: '株の売却トラックの残りが' + 5 + 'つになった' };
const WHY = { emptied: '市場の在庫切れ', third: 'トラックに3つ', sale: '売却トラックから外れた', refill: '補充で在庫切れ', empty: '市場に在庫なし' };

const bubbles = {};
function say(p, text) {
  if (p === viewerSeat() || skipping) return;
  const el = $('#seat' + p);
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
  if (bubbles[p]) bubbles[p].remove();
  const b = document.createElement('div'); b.className = 'say'; b.textContent = text;
  b.style.left = clamp(r.left + r.width / 2, 80, innerWidth - 80) + 'px';
  b.style.top = Math.max(r.top - 2, 40) + 'px';
  document.body.appendChild(b);
  bubbles[p] = b;
  setTimeout(() => { b.remove(); if (bubbles[p] === b) delete bubbles[p]; }, dur(1700));
}
async function banner(text, sub, cls, ms) {
  const el = document.createElement('div');
  el.className = 'banner ' + (cls || '');
  el.innerHTML = '<div class="bx"><div class="b1">' + text + '</div>' + (sub ? '<div class="b2">' + sub + '</div>' : '') + '</div>';
  $('#cine').appendChild(el);
  el.animate([{ transform: 'translateX(60vw) skewX(-20deg)', opacity: 0 }, { transform: 'translateX(-2vw)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: dur(380), easing: 'cubic-bezier(.2,.9,.3,1)' });
  await wait(ms || 900);
  const a = el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-40vw)' }], { duration: dur(260), easing: 'ease-in', fill: 'forwards' });
  try { await a.finished; } catch (e) { /* ignore */ }
  el.remove();
}
function boardVisible() {
  if (window.matchMedia(WIDE).matches) return;
  const b = $('#board').getBoundingClientRect(), topH = $('#top').getBoundingClientRect().bottom + 24;
  if (b.top < topH || b.bottom > window.innerHeight - 160) window.scrollTo({ top: window.scrollY + b.top - topH - 4, behavior: REDUCE ? 'auto' : 'smooth' });
}

async function playEvent(e) {
  if (!dv) return;
  const nm = (p) => esc(nameOf(p));
  switch (e.k) {
    case 'turn': {
      applyEv(dv, e);
      renderSeats(dv); renderDock(dv);
      if (match.mode !== 'local' && e.p === match.me) { sfx('myturn'); }
      else sfx('turn');
      await wait(120);
      return;
    }
    case 'bonus': {
      applyEv(dv, e);
      const t = dv.players[e.p].tile;
      const what = e.adv === 'manip' ? (e.track === 'sale' ? '売却トラックから' + CN[e.c] + 'を外す' : CN[e.c] + 'を' + (e.track === 'buy' ? '株' : '金') + 'の購入トラックへ')
        : e.adv === 'buy' ? '1株多く買う' : e.adv === 'sell' ? '1株多く売る' : '金を1本多く買う';
      say(e.p, 'ボーナス' + t + '.：' + what);
      headline(nm(e.p) + ' がボーナス' + t + '.を使用（' + what + '）');
      sfx('alert');
      FX.burst(seatEl(e.p), 'spark', { n: 18, color: '#7fc8ff', g: 0, speed: 160 });
      renderSeats(dv);
      await wait(600);
      return;
    }
    case 'buy': {
      const tot = sum(e.n);
      if (tot) {
        say(e.p, e.n.map((k, c) => (k ? CN[c] + k : '')).filter(Boolean).join('・') + 'を買う');
        for (let c = 0; c < 5; c++) if (e.n[c]) FX.fly($('#mc' + c), seatEl(e.p), 'case', { n: e.n[c], color: FX.COLORS[c], ms: 620 });
        FX.fly(seatEl(e.p), bankEl(), 'coin', { n: Math.min(10, 2 + Math.round(e.cost / 15)), ms: 560, stagger: 0.03 });
        sfx('coins', { n: Math.min(8, 2 + tot) });
        headline(nm(e.p) + ' が ' + e.n.map((k, c) => (k ? CN[c] + k + '株' : '')).filter(Boolean).join('と') + 'を買った（' + money(e.cost) + '）', 'up');
      } else {
        say(e.p, '買わずに置くだけ');
        headline(nm(e.p) + ' は株を買わずに市場を操作');
      }
      applyEv(dv, e);
      renderMarket(dv); renderSeats(dv); if (e.p === viewerSeat()) renderDock(dv);
      await wait(tot ? 650 : 400);
      return;
    }
    case 'place': {
      const id = e.track === 'buy' ? 'tB' : 'tG';
      FX.fly($('#mc' + e.c), $('#' + id + 's' + e.slot) || $('#' + id), 'case', { color: FX.COLORS[e.c], ms: 480 });
      await wait(430);
      applyEv(dv, e);
      sfx('place');
      renderMarket(dv);
      const slot = $('#' + id + 's' + e.slot);
      if (slot) FX.ring(slot, '#ffb43f', 16, 0.45);
      await wait(260);
      return;
    }
    case 'move': {
      const from = E.cellPrice(e.path[0]), to = E.cellPrice(e.path[e.path.length - 1]);
      const dir = to > from ? 1 : to < from ? -1 : 0;
      applyEv(dv, e);
      await moveToken(e.c, e.path, 260, dir);
      const tk = $('#tk' + e.c);
      if (dir) {
        FX.floatText(tk, (dir > 0 ? '▲' : '▼') + ' $' + to, dir > 0 ? '#7dffbe' : '#ff8a84', 15);
        sfx(dir > 0 ? 'rise' : 'fall', { k: 1 });
        headline(CN[e.c] + ' ' + (dir > 0 ? '▲' : '▼') + ' $' + from + '→$' + to + '（' + (WHY[e.why] || '') + '）', dir > 0 ? 'up' : 'dn');
      }
      renderMarket(dv);
      await wait(320);
      return;
    }
    case 'sell': {
      const tot = sum(e.n);
      if (tot) {
        say(e.p, e.n.map((k, c) => (k ? CN[c] + k : '')).filter(Boolean).join('・') + 'を売る');
        for (let c = 0; c < 5; c++) if (e.n[c]) FX.fly(seatEl(e.p), $('#mc' + c), 'case', { n: e.n[c], color: FX.COLORS[c], ms: 600 });
        FX.fly(bankEl(), seatEl(e.p), 'coin', { n: Math.min(12, 2 + Math.round(e.gain / 15)), ms: 620, stagger: 0.03 });
        sfx('register');
        headline(nm(e.p) + ' が ' + e.n.map((k, c) => (k ? CN[c] + k + '株' : '')).filter(Boolean).join('と') + 'を売った（' + money(e.gain) + '）', 'dn');
      } else {
        say(e.p, '売らずに外すだけ');
        headline(nm(e.p) + ' は株を売らずに市場を操作');
      }
      applyEv(dv, e);
      renderMarket(dv); renderSeats(dv); if (e.p === viewerSeat()) renderDock(dv);
      await wait(tot ? 650 : 380);
      return;
    }
    case 'unsale': {
      const slot = $('#tSs' + e.c + '_' + (dv.sale.tracks[e.track].c[e.c] - 1)) || $('#tS');
      FX.fly(slot, $('#mc' + e.c), 'case', { color: FX.COLORS[e.c], ms: 460 });
      await wait(400);
      applyEv(dv, e);
      sfx('place');
      renderMarket(dv);
      await wait(160);
      return;
    }
    case 'gold': {
      if (e.n) {
        say(e.p, '金を' + e.n + '本');
        FX.fly(bankEl(), seatEl(e.p), 'bar', { n: e.n, ms: 700, stagger: 0.09 });
        FX.fly(seatEl(e.p), bankEl(), 'coin', { n: Math.min(10, 2 + e.n * 2), ms: 560, stagger: 0.03 });
        sfx('gold');
        headline(nm(e.p) + ' が金を' + e.n + '本買った（1本' + money(e.price) + '）', 'up');
      } else {
        say(e.p, '金は買わずに置くだけ');
        headline(nm(e.p) + ' は金を買わずに市場を操作');
      }
      applyEv(dv, e);
      renderTop(dv); renderSeats(dv); if (e.p === viewerSeat()) renderDock(dv);
      await wait(e.n ? 700 : 380);
      return;
    }
    case 'await-bonus': {
      applyEv(dv, e);
      renderDock(dv);
      return;
    }
    case 'pc': return playPriceChange(e);
    case 'gold-up': return playGoldUp(e);
    case 'pc-move': return playMoves(e);
    case 'pc-clean': return playClean(e);
    case 'level': return playLevel(e);
    case 'sale-next': return playSaleNext(e);
    case 'end': return playEnd(e);
  }
}

/* ---------------------------------------------------------------- the price change */
let drawPanel = null;
async function playPriceChange(e) {
  $('#cine').classList.add('on');
  boardVisible();
  applyEv(dv, e);
  headline('相場変動 #' + e.no + '：' + TRIG_TEXT[e.trig].replace('5つ', dv.saleLeft + 'つ'), 'pc');
  sfx('bell');
  FX.flash('#ffb43f', 260, 0.18);
  await banner('相場変動', TRIG_TEXT[e.trig].replace('5つ', dv.saleLeft + 'つ') + '　袋から' + e.drawn.length + '個', '', 950);
  // the draw panel
  const el = document.createElement('div');
  el.className = 'drawp';
  el.innerHTML = '<div class="hd"><span>袋から ' + e.drawn.length + '個</span><em>Lv ' + e.level + '・相場変動 #' + e.no + '</em></div><div class="row1">' + bagIcon('pouch') + '<div class="out"></div></div><div class="tally"></div><div class="gl"></div>';
  $('#cine').appendChild(el);
  drawPanel = el;
  el.animate([{ transform: 'translate(-50%,30px)', opacity: 0 }, { transform: 'translate(-50%,0)', opacity: 1 }], { duration: dur(260), easing: 'ease-out' });
  const pouch = $('.pouch', el);
  pouch.classList.add('shake'); sfx('rustle');
  await wait(700);
  const outEl = $('.out', el);
  let blacks = 0;
  for (let i = 0; i < e.drawn.length; i++) {
    const x = e.drawn[i];
    outEl.insertAdjacentHTML('beforeend', shIcon(x));
    const chip = outEl.lastElementChild;
    if (x === 5) {
      blacks++;
      sfx('black');
      FX.ring(chip, '#ff5a52', 30, 0.7);
      FX.flash('#000', 220, blacks >= 2 ? 0.45 : 0.25);
      if (blacks >= 2) FX.shake($('#app'), 1);
      await wait(460);
    } else {
      sfx('pop', { i });
      FX.burst(chip, 'spark', { n: 6, color: FX.COLORS[x], g: 0, speed: 90, life: 0.5 });
      await wait(230);
    }
  }
  pouch.classList.remove('shake');
  // tally per colour
  const tally = $('.tally', el);
  const crash = e.black >= 2;
  let th = '';
  for (let c = 0; c < 5; c++) {
    const eff = crash ? e.counts[c] - e.black : e.counts[c];
    const o = E.chart(eff), dir = o.v > 0 || (o.v === 0 && o.h > 0) ? 'up' : 'dn';
    const path = E.chartPath(dv.price[c], eff), to = E.cellPrice(path[path.length - 1]);
    th += '<div class="' + dir + '">' + shIcon(c, 'sm') + '<b>' + (eff > 0 ? '+' : '') + eff + '</b>' + (crash ? '<span class="ar">' + e.counts[c] + '−' + e.black + '</span>' : '') + '<span>$' + E.cellPrice(dv.price[c]) + '→$' + to + '</span></div>';
  }
  tally.innerHTML = th;
  sfx('tally');
  tally.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: dur(240) });
  if (crash) {
    sfx('siren');
    const al = document.createElement('div'); al.className = 'alarm'; document.body.appendChild(al);
    setTimeout(() => al.remove(), dur(2000));
    await banner('暴落', '黒が' + e.black + '個！ 各色から ' + e.black + ' を引く', 'red', 1100);
  } else if (e.black === 1) {
    await wait(300);
    $('.gl', el).innerHTML = '<span style="color:var(--ink2)">黒が1個：袋に戻す（引き算なし）</span>';
    await wait(700);
  } else await wait(650);
}
async function playGoldUp(e) {
  const el = drawPanel;
  const steps = e.to - e.from;
  if (el) $('.gl', el).innerHTML = barIcon(18) + (steps ? '金価格 ' + money(E.GOLD_TRACK[e.from]) + ' → <b class="num">' + money(E.GOLD_TRACK[e.to]) + '</b>（黒' + e.black + '段・購入' + e.boughtWas + '本で' + e.bars + '段）' : '金価格はそのまま ' + money(E.GOLD_TRACK[e.from]) + '（購入' + e.boughtWas + '本）');
  for (let g = e.from + 1; g <= e.to; g++) {
    dv.gold = g;
    renderTop(dv);
    sfx('goldup');
    FX.burst($('#gt' + g), 'coin', { n: 4, up: true, speed: 160, size: 4 });
    await wait(220);
  }
  applyEv(dv, e);
  renderTop(dv);
  FX.music.mood(dv.gold >= 20 ? 'clutch' : 'game');
  if (steps) headline('金価格 ' + money(E.GOLD_TRACK[e.from]) + ' → ' + money(E.GOLD_TRACK[e.to]), 'pc');
  await wait(steps ? 380 : 200);
}
async function playMoves(e) {
  boardVisible();
  const jobs = [];
  let ups = 0, downs = 0, maxDrop = 0;
  e.moves.forEach((m) => {
    const from = E.cellPrice(m.path[0]), to = E.cellPrice(m.path[m.path.length - 1]);
    const dir = to > from ? 1 : to < from ? -1 : 0;
    if (dir > 0) ups++; else if (dir < 0) { downs++; maxDrop = Math.max(maxDrop, (from - to) / from); }
    jobs.push(moveToken(m.c, m.path, 200, dir).then(() => {
      if (dir) FX.floatText($('#tk' + m.c), (dir > 0 ? '▲' : '▼') + ' $' + to, dir > 0 ? '#7dffbe' : '#ff8a84', 15);
    }));
  });
  if (e.black >= 2) { sfx('crash'); FX.shake($('#board'), 1.4); FX.burst($('#board'), 'shard', { n: 30, color: ['#ff5a52', '#16191b', '#7a1f1f'], speed: 420 }); }
  else if (ups >= downs) sfx('rise', { k: 3 }); else sfx('fall', { k: 3 });
  await Promise.all(jobs);
  applyEv(dv, e);
  placeTokens(dv);
  renderMarket(dv);
  const parts = e.moves.map((m) => { const a = E.cellPrice(m.path[0]), b = E.cellPrice(m.path[m.path.length - 1]); return CN[m.c] + (b > a ? '▲' : b < a ? '▼' : '→') + '$' + b; });
  headline('相場変動の結果：' + parts.join('　'), 'pc');
  await wait(650);
}
async function playClean(e) {
  const el = drawPanel;
  if (el) {
    const chips = $$('.out .sh', el);
    chips.forEach((ch, i) => {
      const c = Number(ch.dataset.c);
      if (c === 5) { FX.fly(ch, e.blackTo === 'bag' ? $('#bagbox') : bankEl(), 'case', { color: '#16191b', ms: 520 }); }
      else FX.fly(ch, $('#mc' + c), 'case', { color: FX.COLORS[c], ms: 560 });
      ch.style.opacity = '0';
    });
    sfx('place');
  }
  const src = e.trig === 'buy' ? $('#tB') : e.trig === 'gold' ? $('#tG') : $('#tS');
  const toBag = [];
  for (let c = 0; c < 5; c++) for (let k = 0; k < e.toBag[c]; k++) toBag.push(FX.COLORS[c]);
  for (let k = 0; k < e.toBagBlack; k++) toBag.push('#16191b');
  if (toBag.length) FX.fly(src, $('#bagbox'), 'case', { n: toBag.length, color: toBag, ms: 640, stagger: 0.05 });
  await wait(560);
  applyEv(dv, e);
  renderMarket(dv);
  if (el) { el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,24px)' }], { duration: dur(240), fill: 'forwards' }); setTimeout(() => el.remove(), dur(260)); drawPanel = null; }
  sfx('rustle');
  await wait(320);
}
async function playLevel(e) {
  applyEv(dv, e);
  const L = E.LEVELS[e.to];
  sfx('level');
  FX.burst($('#lvPlate'), 'spark', { n: 26, color: ['#7dffbe', '#ffcf7a'], g: 0, speed: 220 });
  renderTop(dv);
  await banner('レベル ' + e.to, '売買 ' + L.s + '株・金 ' + L.g + '本・相場変動で袋から ' + L.d + '個', 'lvl', 1100);
  headline('レベル' + e.to + 'に上昇（売買' + L.s + '・金' + L.g + '・袋' + L.d + '）／黒' + e.blacks.length + '個が袋へ', 'pc');
  for (const lv of e.blacks) {
    FX.fly($('#am' + lv), $('#bagbox'), 'case', { color: '#16191b', ms: 600 });
    sfx('black');
    await wait(260);
  }
  renderMarket(dv);
  await wait(300);
}
async function playSaleNext(e) {
  applyEv(dv, e);
  if (e.refill) {
    for (let c = 0; c < 5; c++) if (e.refill[c]) FX.fly($('#mc' + c), $('#tS'), 'case', { n: e.refill[c], color: FX.COLORS[c], ms: 520 });
    sfx('place');
    headline('売却トラックを市場から補充（黒' + (e.black || 0) + '個）', 'pc');
  } else headline('次の売却トラックへ', 'pc');
  await wait(520);
  renderMarket(dv);
  FX.ring($('#tS'), '#ffb43f', 60, 0.6);
  await wait(300);
}

/* ---------------------------------------------------------------- the end */
async function playEnd(e) {
  applyEv(dv, e);
  $('#cine').classList.add('on');
  FX.music.mood('off');
  sfx('crash'); setTimeout(() => sfx('glass'), dur(250));
  FX.flash('#ff2a2a', 700, 0.55);
  FX.shake($('#app'), 2);
  FX.burst({ x: innerWidth / 2, y: innerHeight * 0.4 }, 'shard', { n: 60, color: ['#ff5a52', '#16191b', '#f2f6f7'], speed: 620 });
  await banner('取引停止', '金価格が $100 に達した', 'red', 1300);
  await showExtra(e.result);
  await showResult(e.result);
}
function showExtra(res) {
  return new Promise((resolve) => {
    const pr = res.prices;
    const d = new Date();
    const el = document.createElement('div');
    el.className = 'extra';
    el.innerHTML = '<div class="paper" role="dialog" aria-label="号外"><div class="mast"><span class="t">号外</span><span class="d">取引所新報　' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）</span></div>' +
      '<div class="hl">金、ついに100ドル<br>暗黒の金曜日</div><div class="sub">相場は乱高下の末に崩れ、取引所は全銘柄の取引を停止した。投資家は手持ちの株を最後の値で清算し、勝負は現金と金の山で決まる。</div>' +
      '<div class="bar">' + pr.map((p, c) => '<span>' + CN[c] + ' $' + p + '</span>').join('') + '</div><div class="tap">タップして結果へ</div></div>';
    document.body.appendChild(el);
    sfx('paper');
    let done = false;
    const go = () => { if (done) return; done = true; el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(250), fill: 'forwards' }); setTimeout(() => { el.remove(); resolve(); }, dur(260)); };
    el.onclick = go;
    setTimeout(go, TEST ? 1500 : 9000);
  });
}
async function showResult(res) {
  const rows = res.order.map((p) => res.rows[p]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const me = match.mode === 'local' ? -1 : match.me;
  const winners = rows.filter((r) => r.rank === 1).map((r) => r.p);
  const iWon = winners.includes(me);
  let h = '<h2>結果</h2>' + xBtn + '<div class="podium">';
  rows.forEach((r) => {
    const s = seatOf(r.p) || {};
    h += '<div class="prow' + (r.rank === 1 ? ' win' : '') + '"><span class="rk">' + r.rank + '</span>' + avatarHtml(s, r.p) +
      '<span class="nm">' + esc(nameOf(r.p)) + '<small>現金 ' + money(r.cash) + '・株 ' + money(r.shareValue) + '・金 ' + r.gold + '本</small></span><span class="tot num" data-to="' + r.total + '">$0</span>' +
      '<span class="bar"><i class="bc" style="width:' + (100 * r.cash / max) + '%"></i><i class="bs" style="width:' + (100 * r.shareValue / max) + '%"></i><i class="bg" style="width:' + (100 * r.goldValue / max) + '%"></i></span></div>';
  });
  h += '</div><p class="legend"><span><i style="background:#7fb5a9"></i>現金</span><span><i style="background:var(--c3)"></i>株の清算</span><span><i style="background:var(--gold)"></i>金（1本$100）</span></p>';
  h += '<p class="hint">同点なら、金を多く持っている人が上。</p><div class="row">';
  if (match.mode === 'cpu' || match.mode === 'local') h += '<button class="btn primary" id="rAgain">もう一度</button>';
  if (match.mode === 'host') h += '<button class="btn primary" id="rLobby">部屋に戻る</button>';
  h += '<button class="btn" id="rTitle">タイトルへ</button></div><div style="height:8px"></div><div class="row"><button class="btn ghost" id="rChart">値動きを見る</button><button class="btn ghost" id="rLog">記録を見る</button></div>';
  const el = openLayer(h);
  $('#cine').classList.remove('on');
  if (iWon || match.mode === 'local') { sfx('win'); FX.music.jingle('champion'); FX.rain('tape', 3500); FX.rain('confetti', 2500); }
  else sfx('lose');
  $$('.tot', el).forEach((t) => {
    const to = Number(t.dataset.to), t0 = performance.now(), D = dur(1200);
    (function f(now) { const k = Math.min(1, (now - t0) / D); t.textContent = money(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(t0);
  });
  const b = (id, fn) => { const x = $('#' + id, el); if (x) x.onclick = fn; };
  b('rAgain', () => { closeLayer(); again(); });
  b('rLobby', () => { closeLayer(); hostBackToLobby(); });
  b('rTitle', () => { closeLayer(); quitToTitle(); });
  b('rChart', () => openChart());
  b('rLog', () => openLog());
  if (match.mode === 'cpu') store.del('save');
}

/* ================================================================ moves and turn flow */
function act(a) {
  const m = match;
  if (!m || !dv || dv.phase !== 'play' || presenting || m.waiting) return;
  if (m.mode === 'guest' ? dv.turn !== m.me : (m.st.turn !== m.viewer || !isHumanHere(m.st.turn))) return;
  if (a.t !== 'end' && a.t !== 'bonus' && dv.step !== 'pre') return;
  audioOn();
  if (m.mode === 'guest') {
    m.waiting = true;
    m.link.send({ k: 'act', a, no: dv.turnNo });
    clearTimeout(m.waitTo);
    m.waitTo = setTimeout(() => { m.waiting = false; renderDock(dv); }, 8000);
    renderDock(dv);
    return;
  }
  const p = m.st.turn;
  const r = E.apply(m.st, p, a);
  if (!r.ok) { sfx('deny'); toast(errText(r.err), 'warn'); return; }
  deliver(m, r.ev);
}
function errText(err) {
  return { cash: 'お金が足りません', limit: '上限をこえています', market: '市場にその数の株がありません', own: 'その株を持っていません', place: 'その色はトラックに置けません', remove: 'その色は外せません', nobonus: 'ボーナスは使えません', step: 'いまはその操作はできません', turn: 'あなたの番ではありません' }[err] || 'その手は打てません';
}
function deliver(m, ev) {
  if (m.mode === 'host') sendUpdates(m, ev);
  if (m.mode === 'cpu') saveGame(m);
  if (m.mode === 'local') {
    // after a human's move the screen goes back to the table's view (no private info) until the next human takes it
    if (m.viewer >= 0 && isHumanHere(m.viewer) && m.st.turn !== m.viewer) m.viewer = -1;
  }
  enqueue(ev, E.viewFor(m.st, m.viewer));
}
function saveGame(m) {
  if (m.st.phase !== 'play') { store.del('save'); return; }
  store.set('save', { v: 1, st: m.st, seats: m.seats, at: Date.now() });
}
let cpuTimer = null;
async function afterIdle() {
  const m = match;
  if (!m || !dv || presenting || m.dead) return;
  renderDock(dv);
  if (dv.phase !== 'play') return;
  if (m.mode === 'guest') { if (dv.turn === m.me && dv.step === 'post' && !$('#layer .sheet')) openBonus(true); return; }
  const p = m.st.turn, s = m.seats[p];
  const needsBot = s.kind === 'cpu' || s.kind === 'mibs' || (s.kind === 'guest' && s.here === false);
  if (needsBot) {
    if (m.thinking === p) return;
    m.thinking = p;
    renderSeats(dv); renderDock(dv);
    const v = E.viewFor(m.st, p);
    const t0 = performance.now();
    let a;
    if (s.kind === 'mibs') a = AI.mibsAction(v);
    else a = await cpuChoose(v, s.kind === 'guest' ? 2 : s.level || 2);
    // online: wait until the guests have seen the last move (at most a few seconds)
    if (m.mode === 'host') await guestsCaughtUp(m);
    const minThink = TEST ? 0 : (s.kind === 'mibs' ? 700 : 900) / prefs.speed;
    const spent = performance.now() - t0;
    if (spent < minThink) await sleep(minThink - spent);
    if (match !== m || m.dead) return;
    m.thinking = null;
    if (!a) a = AI.randomAction(v, Math.random);
    let r = E.apply(m.st, p, a);
    if (!r.ok) r = E.apply(m.st, p, m.st.step === 'post' ? { t: 'end' } : AI.mibsAction(v));
    if (!r.ok) r = E.apply(m.st, p, { t: 'gold', k: 0, place: E.placeChoices(m.st, null)[0] });
    if (r.ok) deliver(m, r.ev);
    return;
  }
  if (m.mode === 'local') {
    if (m.viewer !== p) { await curtain(p); if (match !== m) return; m.viewer = p; dv = E.viewFor(m.st, p); view = dv; renderAll(dv); }
  }
  if (isHumanHere(p) && m.viewer === p) {
    if (dv.step === 'post' && !$('#layer .sheet')) openBonus(true);
  }
}
function curtain(p) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'curtain';
    el.innerHTML = '<div class="cc">' + avatarHtml(match.seats[p], p) + '<h2>' + esc(match.seats[p].nm) + ' さんの番</h2><p class="note">端末を受け取ったら、まわりに画面が見えないようにしてタップ</p><button class="btn primary big" style="max-width:280px">見る</button></div>';
    document.body.appendChild(el);
    sfx('turn');
    el.querySelector('button').onclick = () => { audioOn(); el.remove(); resolve(); };
  });
}
async function guestsCaughtUp(m) {
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    const behind = m.seats.some((s) => s.kind === 'guest' && s.here !== false && (s.seen || 0) < m.st.turnNo);
    if (!behind) return;
    await sleep(150);
  }
}

/* CPU in a worker */
let worker = null, workerFailed = false, workerSeq = 0;
const workerWait = new Map();
function cpuChoose(v, level) {
  const seed = (Math.random() * 4294967296) >>> 0;
  const local = () => AI.choose(v, level, AI._cpu.mulberry32(seed));
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
        const finish = (a) => { if (done) return; done = true; workerWait.delete(id); res(a == null ? local() : a); };
        workerWait.set(id, finish);
        setTimeout(() => finish(undefined), 9000);
        worker.postMessage({ id, view: v, level, seed });
      });
    } catch (e) { workerFailed = true; }
  }
  return new Promise((res) => setTimeout(() => res(local()), 0));
}

/* ================================================================ starting games */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function beginMatch(m, v) {
  closeLayer();
  match = m;
  match.news = []; match.log = [];
  match.thinking = null;
  queue.length = 0;
  presenting = false;
  dv = E.clone(v); view = v;
  hideScreens();
  document.body.classList.add('ingame');
  buildBoard();
  layoutBoard();
  placeTokens(dv, true);
  renderAll(dv);
  window.scrollTo(0, 0);
  FX.music.mood(dv.gold >= 20 ? 'clutch' : 'game');
  headline('取引開始！ 金価格 $' + E.GOLD_TRACK[dv.gold] + '、全銘柄 $6〜$10 からスタート', 'pc');
  if (!m.resumed) { sfx('bell'); FX.rain('tape', 1800); banner('取引開始', seatOf(dv.turn) ? esc(nameOf(dv.turn)) + ' から' : '', '', 1000); }
  setTimeout(afterIdle, TEST ? 50 : 1300 / prefs.speed);
}
function seatsFor(players, mibs) {
  // players: [{nm, kind, level, av}] in table order; the starting player is random (the M.I.B.S. always starts)
  const rot = Math.floor(Math.random() * players.length);
  const order = players.slice(rot).concat(players.slice(0, rot));
  return mibs ? [{ nm: 'M.I.B.S.', kind: 'mibs', av: 'mibs' }].concat(order) : order;
}
function startCpu() {
  const count = clamp(prefs.count, 2, 5);
  const mibs = count === 2 ? true : count === 5 ? false : !!prefs.mibs;
  const players = [{ nm: prefs.name || 'あなた', kind: 'me' }];
  shuffle(CPU_PROFILES.slice()).slice(0, count - 1).forEach(([nm, av]) => players.push({ nm, kind: 'cpu', level: prefs.level, av }));
  const seats = seatsFor(players, mibs);
  const st = E.newGame({ seats: seats.map((s) => ({ nm: s.nm, mibs: s.kind === 'mibs' })) });
  const me = seats.findIndex((s) => s.kind === 'me');
  const m = { mode: 'cpu', id: ++matchSeq, st, seats, me, viewer: me };
  m.again = startCpu;
  beginMatch(m, E.viewFor(st, me));
  saveGame(m);
}
function startLocal() {
  const count = clamp(prefs.localCount, 2, 5);
  const mibs = count === 2 ? true : count === 5 ? false : !!prefs.localMibs;
  const players = [];
  for (let i = 0; i < count; i++) players.push({ nm: (prefs.names[i] || '').trim() || 'プレイヤー' + (i + 1), kind: 'local' });
  const seats = seatsFor(players, mibs);
  const st = E.newGame({ seats: seats.map((s) => ({ nm: s.nm, mibs: s.kind === 'mibs' })) });
  const m = { mode: 'local', id: ++matchSeq, st, seats, me: -1, viewer: -1 };
  m.again = startLocal;
  beginMatch(m, E.viewFor(st, -1));
}
function resumeGame() {
  const s = store.get('save', null);
  if (!s || !s.st || s.st.phase !== 'play') { store.del('save'); renderTitle(); return; }
  const me = s.seats.findIndex((x) => x.kind === 'me');
  const m = { mode: 'cpu', id: ++matchSeq, st: s.st, seats: s.seats, me, viewer: me, resumed: true };
  m.again = startCpu;
  beginMatch(m, E.viewFor(s.st, me));
  toast('前回の続きから', 'good');
}
function again() { if (match && match.again) { const f = match.again; leaveGame(); f(); } }
function leaveGame() {
  pumpGen++;
  if (match) match.dead = true;
  match = null; view = null; dv = null;
  queue.length = 0; presenting = false; skipping = false;
  $('#cine').innerHTML = ''; $('#cine').classList.remove('on');
  $$('.extra,.curtain,.alarm').forEach((x) => x.remove());
  document.body.classList.remove('ingame');
}
function quitToTitle() {
  if (lobby) closeLobby();
  leaveGame();
  showTitle();
}

/* ================================================================ menu, settings, rules */
function toast(html, cls = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.innerHTML = html;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}
function openMenu() {
  const el = openLayer('<h2>メニュー</h2>' + xBtn + '<div class="stack">' +
    '<button class="btn" id="mRules">あそびかた</button><button class="btn" id="mLog">取引の記録</button><button class="btn" id="mChart">値動きグラフ</button><button class="btn" id="mSet">設定</button>' +
    (match && match.mode === 'host' && dv && dv.phase === 'play' ? '<button class="btn" id="mLobby">部屋に戻る（ゲームを終える）</button>' : '') +
    '<button class="btn ghost" id="mQuit">' + (match && match.mode === 'cpu' ? 'タイトルへ（続きは保存されます）' : 'ゲームをやめてタイトルへ') + '</button></div>');
  $('#mRules', el).onclick = openRules;
  $('#mLog', el).onclick = openLog;
  $('#mChart', el).onclick = openChart;
  $('#mSet', el).onclick = openSettings;
  const lb = $('#mLobby', el); if (lb) lb.onclick = () => { closeLayer(); hostBackToLobby(); };
  $('#mQuit', el).onclick = () => { closeLayer(); quitToTitle(); };
}
function segHtml(id, opts, cur) { return '<div class="seg" id="' + id + '">' + opts.map(([v, l]) => '<button data-v="' + v + '" aria-pressed="' + (String(v) === String(cur)) + '">' + l + '</button>').join('') + '</div>'; }
function openSettings() {
  const el = openLayer('<h2>設定</h2>' + xBtn +
    '<div class="field"><span>演出の速さ</span>' + segHtml('setSpeed', SPEEDS, prefs.speed) + '</div>' +
    '<div class="field"><span>エフェクト</span>' + segHtml('setFx', [[2, '豪華'], [1, 'ひかえめ'], [0, 'なし']], prefs.fx) + '</div>' +
    '<div class="field"><span>効果音</span>' + segHtml('setSound', [[1, 'オン'], [0, 'オフ']], prefs.sound ? 1 : 0) + '</div>' +
    '<div class="field"><span>BGM</span>' + segHtml('setBgm', [[1, 'オン'], [0, 'オフ']], prefs.bgm ? 1 : 0) + '</div>' +
    '<div class="field"><span>ほかの人の現金・金・取引（公開の取引から計算）</span>' + segHtml('setPub', [[1, '表示'], [0, '隠す（記憶で勝負）']], prefs.pub ? 1 : 0) + '</div>' +
    '<div class="field"><span>暴落の確率の表示</span>' + segHtml('setRisk', [[1, '表示'], [0, '隠す']], prefs.risk ? 1 : 0) + '</div>');
  const seg = (id, fn) => $$('#' + id + ' button', el).forEach((b) => { b.onclick = () => { $$('#' + id + ' button', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(Number(b.dataset.v)); sfx('tap'); }; });
  seg('setSpeed', (v) => { prefs.speed = v; store.set('speed', v); });
  seg('setFx', (v) => { prefs.fx = v; store.set('fx', v); FX.setLevel(v); });
  seg('setSound', (v) => { prefs.sound = !!v; store.set('sound', prefs.sound); applySound(); });
  seg('setBgm', (v) => { prefs.bgm = !!v; store.set('bgm', prefs.bgm); applySound(); });
  seg('setPub', (v) => { prefs.pub = !!v; store.set('pub', prefs.pub); if (dv) renderAll(dv); });
  seg('setRisk', (v) => { prefs.risk = !!v; store.set('risk', prefs.risk); if (dv) renderMarket(dv); });
}
function chartTable() {
  const rows = [[3, '5'], [2, '3'], [1, '1'], [0, ''], [-1, '−1'], [-2, '−3'], [-3, '−5']];
  const right = { 3: '6', 2: '4', 1: '2' }, left = { 0: '0', '-1': '−2', '-2': '−4', '-3': '−6' };
  let h = '<table class="res" style="max-width:220px;margin:8px auto;text-align:center"><tbody>';
  rows.forEach(([r, mid]) => {
    h += '<tr><td style="text-align:center">' + (left[r] || '') + '</td><td style="text-align:center;' + (r === 0 ? 'background:rgba(255,180,63,.18);border-radius:8px' : '') + '">' + (r === 0 ? '今' : mid) + '</td><td style="text-align:center">' + (right[r] || '') + '</td></tr>';
  });
  return h + '</tbody></table>';
}
function companyLegend() {
  return '<div class="company-legend">' + CN.map((n, c) => '<span data-c="' + c + '">' + shIcon(c, 'lg') + '<b>' + n + '</b><small>' + STOCK_COLORS[c] + '</small></span>').join('') + '</div>';
}
function rulesHtml() {
  const lv = E.LEVELS.map((L, i) => '<tr><td>' + i + '</td><td class="n">' + L.s + '</td><td class="n">' + L.g + '</td><td class="n">' + L.d + '</td></tr>').join('');
  return '<div class="rules">' + '<h3>5つの企業銘柄</h3>' + companyLegend() + '<p>企業名・ロゴは銘柄を見分けるための表示です。株価は実際の相場と連動しません。</p>' +
    '<p>株を売り買いして値を動かし、そのお金で<b>金</b>を買う。金価格が<b>$100</b>に届くとゲームは終わり、最後に手元の株を今の値で売って、<b>現金＋金（1本$100）</b>がいちばん多い人の勝ちです。同点なら金が多い人。</p>' +
    '<h3>はじめ</h3><ul><li>だれもが <b>$100</b> と、袋から引いた <b>5株</b>（色は自分だけが知っている）で始めます。</li><li>5色の株価はみな$8から。袋から20株を市場に足したあと、市場の株がいちばん少ない色は$10、いちばん多い色は$6になります（同数ならその色すべて）。</li><li>手番順の2番目以降の人はボーナスタイル（2.〜5.）を1枚ずつ持ちます。</li></ul>' +
    '<h3>手番：3つから1つ</h3><ul>' +
    '<li><b>株を買う</b>：今の値で上限まで（0株も可）。そのあと買った色を1株、市場から<b>株の購入トラック</b>へ置きます（複数色なら買った色のどれか、残っていなければ好きな色）。</li>' +
    '<li><b>株を売る</b>：今の値で上限まで（0株も可）。そのあと<b>今の売却トラック</b>から売った色を1株外して市場へ（複数色なら売った色のどれか、なければ好きな色）。外した色は<b>すぐ左へ1マス下がる</b>。</li>' +
    '<li><b>金を買う</b>：今の金価格で上限まで（0本も可）。そのあと好きな色を1株、市場から<b>金の購入トラック</b>へ置きます。</li></ul>' +
    '<h3>小さな値動き</h3><ul><li>市場からある色の<b>最後の1株</b>がなくなったら、その色は右へ1マス上がる。</li><li>購入トラック（株・金それぞれ）に同じ色が<b>3つ目</b>に並んだら右へ1マス上がる（4つ目以降は上がらない）。</li><li>株価表の右端で「右」は1段上の行へ、左端で「左」は1段下の行へ。最高$240、最低$4。</li></ul>' +
    '<h3>相場変動</h3><p>株の購入トラックか金の購入トラックが<b>5マス</b>埋まる、または売却トラックの残りが<b>5つ</b>になると起きます（5人のときは6マス／残り4つ）。</p><ul>' +
    '<li>袋から株を引く（数はレベルで決まる）。</li><li><b>金価格</b>：引いた黒1つにつき1段、前の変動から買われた金3本ごとに1段上がる。</li>' +
    '<li><b>株価</b>：色ごとに引いた数で動く（下の表）。黒が<b>ちょうど1つ</b>なら袋に戻して引き算なし。<b>2つ以上</b>なら各色の数から黒の数を引く＝<b>暴落</b>。黒は銀行へ。</li>' +
    '<li>引いた株は市場へ。変動を起こしたトラックの株（売却トラックなら横の黒も）は袋へ。市場に1株もない色は上へ1段上がる。</li>' +
    '<li>いちばん高い色が、より上のレベルの区画に入ったら<b>レベルアップ</b>。その区画（と飛ばした区画）の黒が袋に入る。レベルは下がらない。</li></ul>' + chartTable() +
    '<p class="hint">数は「引いた枚数（黒2つ以上ならそこから黒の数を引いた値）」。上へ1段＝右へ2マスくらいの値上がりです。6より多ければさらに上へ、−6より少なければさらに下へ続きます。</p>' +
    '<h3>売却トラック</h3><p>上の段→中段→下の段の順に使い、そのあとは中段だけを使います。下の段（とそれ以降の中段）で変動が起きたら、中段に市場から各色2株と銀行の黒2つを補充します（足りなければ空けておく）。</p>' +
    '<h3>レベル</h3><table class="res"><tr><th>レベル</th><th>売買の上限</th><th>金の上限</th><th>袋から引く</th></tr>' + lv + '</table>' +
    '<h3>ボーナスタイル（1回だけ）</h3><ul><li><b>2.</b>：アクションとは別に、市場の株1つを株／金の購入トラックに置くか、売却トラックから1つ外す。アクションの前に使えば、それで相場変動を起こしてから動けます。</li><li><b>3.</b>：上に加えて「売るとき1株多く」</li><li><b>4.</b>：さらに「金を買うとき1本多く」</li><li><b>5.</b>：さらに「買うとき1株多く」</li></ul><p class="hint">どれか1つを1回だけ使えます。</p>' +
    '<h3>M.I.B.S.</h3><p>2人のときは必ず、3〜4人のときは入れるかを選べる、自動で動く相場師です（5人では入れません）。いつも最初の手番で、資産は公開。上限まで買えるうちは「株と金の安いほう」を買い、足りなければ高い株から売り、株もなければ買えるだけ買い、それもできなければ一番安い色を金の購入トラックに置きます。</p>' +
    '<h3>このブラウザ版について</h3><p class="hint">2023年の新版（2F-Spiele／Rio Grande Games／日本語版サニーバード）のルールで作った非公式版です。ほかの人の現金と金は、すべての支払いが公開なので計算して表示しています（設定で隠せます）。最初に引いた5株の色だけは本人にしか見えません。</p></div>';
}
function openRules() { openLayer('<h2>あそびかた</h2>' + xBtn + rulesHtml()); }

/* ================================================================ screens */
const SCREENS = ['#scrTitle', '#scrSetup', '#scrOnline', '#scrLobby'];
function hideScreens() { SCREENS.forEach((s) => { $(s).hidden = true; }); }
function showScreen(id) { hideScreens(); $(id).hidden = false; window.scrollTo(0, 0); }
function renderTitle() {
  const s = store.get('save', null);
  $('#goResume').hidden = !(s && s.st && s.st.phase === 'play');
}
function showTitle() {
  document.body.classList.remove('ingame');
  showScreen('#scrTitle');
  renderTitle();
  FX.music.mood('title');
  hero.start();
}
let setupMode = 'cpu';
function openSetup(mode) {
  setupMode = mode;
  showScreen('#scrSetup');
  $('#setupTitle').textContent = mode === 'cpu' ? 'CPUと対戦' : '1台でみんなで';
  $('#countLabel').textContent = mode === 'cpu' ? '人数（あなた＋CPU）' : '人数';
  $('#fLevel').hidden = mode !== 'cpu';
  $('#levelNote').hidden = mode !== 'cpu';
  $('#fNames').hidden = mode !== 'local';
  renderSetup();
}
function renderSetup() {
  const local = setupMode === 'local';
  const count = local ? prefs.localCount : prefs.count;
  const mibsPref = local ? prefs.localMibs : prefs.mibs;
  const forced = count === 2 ? 1 : count === 5 ? 0 : null;
  const mibs = forced != null ? forced : mibsPref ? 1 : 0;
  $$('#segCount button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === count)));
  $$('#segMibs button').forEach((b) => { b.setAttribute('aria-pressed', String(Number(b.dataset.v) === mibs)); b.disabled = forced != null && Number(b.dataset.v) !== forced; });
  $('#mibsNote').textContent = count === 2 ? '2人のときは必ずM.I.B.S.が入り、3人ぶんの準備で遊びます。' : count === 5 ? '5人のときはM.I.B.S.は入りません。' : mibs ? 'M.I.B.S.が入ると、' + (count + 1) + '人ぶんの準備（' + (count + 1 === 5 ? 'トラック6マス・市場5株ずつ' : 'トラック5マス・市場4株ずつ') + '）で遊びます。M.I.B.S.がいつも最初の手番です。' : '';
  $$('#segLevel button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === prefs.level)));
  $('#levelNote').textContent = LEVEL_NOTE[prefs.level];
  if (local) {
    let h = '';
    for (let i = 0; i < count; i++) h += '<input class="input" data-i="' + i + '" maxlength="10" placeholder="プレイヤー' + (i + 1) + '" value="' + esc(prefs.names[i] || '') + '">';
    $('#nameInputs').innerHTML = h;
    $$('#nameInputs input').forEach((inp) => { inp.oninput = () => { prefs.names[Number(inp.dataset.i)] = N.cleanName(inp.value); store.set('names', prefs.names); }; });
  }
}

/* ================================================================ online: host */
const MAX_PLAYERS = 5;
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
function setRoomParam(code) {
  try { const u = new URL(location.href); if (code) u.searchParams.set('room', code); else u.searchParams.delete('room'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
}
function closeLobby(leavingPage) {
  const L = lobby;
  if (!L) return;
  lobby = null;
  if (L.role === 'guest' && !leavingPage) setRoomParam(null);
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
  const L = lobby = { role: 'host', link, code, mibs: true, seats: [{ kind: 'host', nm: name, cid: CID }] };
  link.on('msg', (cid, msg) => onHostMsg(L, cid, msg));
  link.on('leave', (cid) => onGuestGone(L, cid));
  showLobby();
}
function lobbyInfo(L) {
  const n = L.seats.length, forced = n === 2 ? 1 : n >= 5 ? 0 : null;
  return { seats: L.seats.map((s) => ({ nm: s.nm, kind: s.kind, level: s.level || 0, here: s.here !== false })), code: L.code, mibs: forced != null ? !!forced : !!L.mibs, forced };
}
function pushLobby(L) {
  const info = lobbyInfo(L);
  L.seats.forEach((s, i) => { if (s.kind === 'guest') L.link.send(s.cid, { k: 'lobby', info, you: i }); });
  if (lobby === L && !match) renderLobby(info, 0);
}
function onHostMsg(L, cid, msg) {
  if (lobby !== L || !msg) return;
  if (msg.k === 'hello') {
    if (msg.v !== N.PROTOCOL) { L.link.send(cid, { k: 'old' }); return; }
    const nm = N.cleanName(msg.nm) || 'ゲスト';
    const m = match && match.mode === 'host' && match.lobby === L && !match.dead ? match : null;
    if (m) {
      const p = m.seats.findIndex((s) => s.kind === 'guest' && s.cid === cid);
      if (p < 0) { L.link.send(cid, { k: 'busy' }); L.link.drop(cid); return; }
      m.seats[p].here = true;
      L.link.send(cid, { k: 'start', view: E.viewFor(m.st, p), meta: metaOf(m, p), resume: true });
      toast(esc(m.seats[p].nm) + ' さんが戻ってきました', 'good');
      renderSeats(dv);
      return;
    }
    const seat = L.seats.find((s) => s.kind === 'guest' && s.cid === cid);
    if (seat) { seat.nm = nm; seat.here = true; }
    else if (L.seats.length >= MAX_PLAYERS) { L.link.send(cid, { k: 'full' }); L.link.drop(cid); return; }
    else { L.seats.push({ kind: 'guest', nm, cid, here: true }); toast(esc(nm) + ' さんが入室しました', 'good'); sfx('turn'); }
    pushLobby(L);
    return;
  }
  if (msg.k === 'act') {
    const m = match;
    if (!m || m.mode !== 'host' || m.lobby !== L || m.dead) return;
    const p = m.seats.findIndex((s) => s.kind === 'guest' && s.cid === cid);
    if (p < 0) return;
    const a = msg.a && typeof msg.a === 'object' ? msg.a : null;
    if (!a || m.st.turn !== p || msg.no !== m.st.turnNo) { L.link.send(cid, { k: 'err', err: 'stale', view: E.viewFor(m.st, p) }); return; }
    const r = E.apply(m.st, p, a);
    if (!r.ok) { L.link.send(cid, { k: 'err', err: r.err, view: E.viewFor(m.st, p) }); return; }
    deliver(m, r.ev);
    return;
  }
  if (msg.k === 'seen') {
    const m = match;
    if (!m || m.mode !== 'host' || m.lobby !== L) return;
    const s = m.seats.find((x) => x.kind === 'guest' && x.cid === cid);
    if (s && typeof msg.no === 'number') s.seen = Math.max(s.seen || 0, msg.no);
    return;
  }
  if (msg.k === 'bye') onGuestGone(L, cid);
}
function onGuestGone(L, cid) {
  if (lobby !== L) return;
  const m = match && match.mode === 'host' && match.lobby === L && !match.dead ? match : null;
  if (m) {
    const s = m.seats.find((x) => x.kind === 'guest' && x.cid === cid);
    if (s && s.here !== false) {
      s.here = false;
      if (dv && dv.phase === 'play') toast(esc(s.nm) + ' さんの接続が切れました（CPUが代わりに動きます）', 'warn', 3600);
      sendUpdates(m, []);
      renderSeats(dv); afterIdle();
    }
    return;
  }
  const i = L.seats.findIndex((s) => s.kind === 'guest' && s.cid === cid);
  if (i > 0) { const nm = L.seats[i].nm; L.seats.splice(i, 1); toast(esc(nm) + ' さんが退出しました', 'warn'); pushLobby(L); }
}
function addCpu(L) {
  if (L.seats.length >= MAX_PLAYERS) return;
  const used = L.seats.map((s) => s.nm);
  const prof = CPU_PROFILES.find(([nm]) => !used.includes(nm)) || ['CPU', 'bull'];
  L.seats.push({ kind: 'cpu', nm: prof[0], av: prof[1], level: prefs.level || 2 });
  pushLobby(L);
}
function metaOf(m, forSeat) {
  return m.seats.map((s, i) => ({ nm: s.nm, kind: i === forSeat ? 'me' : s.kind === 'host' || s.kind === 'me' ? 'remote' : s.kind === 'guest' ? 'remote' : s.kind, av: s.av, here: s.here !== false, level: s.level }));
}
function sendUpdates(m, ev) {
  m.seats.forEach((s, p) => { if (s.kind === 'guest' && s.here !== false) m.link.send(s.cid, { k: 'upd', ev: E.evFor(ev), view: E.viewFor(m.st, p), meta: metaOf(m, p) }); });
}
function startHostMatch(L) {
  if (lobby !== L) return;
  const info = lobbyInfo(L);
  if (L.seats.length < 2) return;
  const players = L.seats.map((s) => (s.kind === 'host' ? { nm: s.nm, kind: 'me' } : s.kind === 'cpu' ? { nm: s.nm, kind: 'cpu', level: s.level || 2, av: s.av } : { nm: s.nm, kind: 'guest', cid: s.cid, here: true }));
  const seats = seatsFor(players, info.mibs);
  const st = E.newGame({ seats: seats.map((s) => ({ nm: s.nm, mibs: s.kind === 'mibs' })) });
  const me = seats.findIndex((s) => s.kind === 'me');
  const m = { mode: 'host', id: ++matchSeq, st, seats, me, viewer: me, lobby: L, link: L.link };
  beginMatch(m, E.viewFor(st, me));
  seats.forEach((s, p) => { if (s.kind === 'guest') L.link.send(s.cid, { k: 'start', view: E.viewFor(st, p), meta: metaOf(m, p) }); });
}
function hostBackToLobby() {
  const L = lobby, m = match;
  if (!L || L.role !== 'host') return;
  if (m && m.lobby === L) {
    L.seats = [L.seats[0]].concat(m.seats.filter((s) => s.kind === 'cpu' || (s.kind === 'guest' && s.here !== false)).map((s) => (s.kind === 'cpu' ? { kind: 'cpu', nm: s.nm, av: s.av, level: s.level } : { kind: 'guest', nm: s.nm, cid: s.cid, here: true })));
  }
  leaveGame();
  showLobby();
}
function showLobby() {
  const L = lobby;
  if (!L) return;
  showScreen('#scrLobby');
  if (L.role === 'host') pushLobby(L);
  else if (L.last) renderLobby(L.last.info, L.last.you);
}
function renderLobby(info, you) {
  const L = lobby;
  if (!L) return;
  const host = L.role === 'host';
  $('#lobCode').textContent = info.code || L.code;
  $('#lobNote').textContent = host ? '友だちにこのコードか招待リンクを送ってください。2〜5人で遊べます（CPUも入れられます）。' : 'ホストが始めるのを待っています…';
  $('#lobSeats').innerHTML = info.seats.map((s, i) => '<div class="lseat">' + avatarHtml({ nm: s.nm, av: s.kind === 'cpu' ? (CPU_PROFILES.find(([n]) => n === s.nm) || [])[1] : null }, i) + '<span class="nm">' + esc(s.nm) + (i === you ? '（あなた）' : '') + '</span>' +
    (host && s.kind === 'cpu' ? '<select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3, 4].map((lv) => '<option value="' + lv + '"' + (lv === s.level ? ' selected' : '') + '>' + LEVEL_NAME[lv] + '</option>').join('') + '</select>'
      : '<span class="who">' + (s.kind === 'host' ? 'ホスト' : s.kind === 'cpu' ? 'CPU・' + LEVEL_NAME[s.level || 2] : 'ゲスト') + '</span>') +
    (host && i > 0 ? '<button class="x" data-rm="' + i + '" aria-label="外す">✕</button>' : '') + '</div>').join('');
  $$('#lobMibs button').forEach((b) => { b.setAttribute('aria-pressed', String(Number(b.dataset.v) === (info.mibs ? 1 : 0))); b.disabled = !host || (info.forced != null && Number(b.dataset.v) !== info.forced); });
  $('#lobMibsNote').textContent = info.seats.length === 2 ? '2人のときは必ずM.I.B.S.が入ります。' : info.seats.length >= 5 ? '5人のときはM.I.B.S.は入りません。' : '';
  $('#lobAddCpu').hidden = !host || info.seats.length >= MAX_PLAYERS;
  $('#lobStart').hidden = !host;
  $('#lobStart').disabled = info.seats.length < 2;
  $('#lobInvite').hidden = !host;
  if (host) {
    $$('#lobSeats [data-rm]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.rm), s = L.seats[i];
      if (!s) return;
      L.seats.splice(i, 1);
      if (s.kind === 'guest') { L.link.send(s.cid, { k: 'kick' }); L.link.drop(s.cid); }
      pushLobby(L);
    });
    $$('#lobSeats [data-lv]').forEach((sel) => sel.onchange = () => { const s = L.seats[Number(sel.dataset.lv)]; if (s) { s.level = Number(sel.value); pushLobby(L); } });
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
  setRoomParam(code);
  showScreen('#scrLobby');
  renderLobby({ seats: [{ nm: name, kind: 'guest', here: true }], code, mibs: true, forced: null }, 0);
  $('#lobNote').textContent = '接続しました。ホストからの返事を待っています…';
}
function onGuestMsg(L, msg) {
  if (lobby !== L || !msg) return;
  if (msg.k === 'full') { failGuest(L, 'この部屋はもういっぱいです'); return; }
  if (msg.k === 'busy') { failGuest(L, 'この部屋はいまゲーム中です。終わってからもう一度入ってください'); return; }
  if (msg.k === 'old') { failGuest(L, 'ホストのページと版がちがいます。両方とも再読み込みしてください'); return; }
  if (msg.k === 'kick') { failGuest(L, 'ホストが席を外しました'); return; }
  if (msg.k === 'bye') { onHostGone(L); return; }
  if (msg.k === 'lobby') {
    L.last = { info: msg.info, you: msg.you };
    if (match && match.lobby === L) { leaveGame(); closeLayer(); }
    showScreen('#scrLobby'); renderLobby(msg.info, msg.you);
    return;
  }
  if (msg.k === 'start' && msg.view) {
    const v = msg.view;
    const m = { mode: 'guest', id: ++matchSeq, me: v.me, viewer: v.me, seats: msg.meta.map((s) => ({ nm: s.nm, kind: s.kind, av: s.av, here: s.here })), lobby: L, link: L.link, waiting: false, resumed: !!msg.resume };
    beginMatch(m, v);
    m.link.send({ k: 'seen', no: v.turnNo });
    if (msg.resume) toast('ゲームに戻りました', 'good');
    return;
  }
  const m = match;
  if (!m || m.mode !== 'guest' || m.lobby !== L) return;
  if (msg.k === 'upd' && msg.view) {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.meta) m.seats = msg.meta.map((s) => ({ nm: s.nm, kind: s.kind, av: s.av, here: s.here }));
    enqueue(Array.isArray(msg.ev) ? msg.ev : [], msg.view);
    return;
  }
  if (msg.k === 'err') {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.err !== 'stale') toast(errText(msg.err), 'warn');
    if (msg.view) enqueue([], msg.view); else renderDock(dv);
  }
}
function failGuest(L, text) {
  if (lobby !== L) return;
  lobby = null; L.link.close();
  setRoomParam(null);
  if (match && match.lobby === L) leaveGame();
  closeLayer();
  showScreen('#scrOnline'); resetOnlineUI(); onlineErr(text);
}
function onHostGone(L) {
  if (lobby !== L || L.gone) return;
  L.gone = true;
  if (match && match.lobby === L && dv && dv.phase !== 'over') {
    const el = openLayer('<h2>接続が切れました</h2><p>ホストとの接続が切れました。</p><button class="btn primary" id="hQuit">タイトルへ</button>');
    $('#hQuit', el).onclick = () => { closeLayer(); quitToTitle(); };
    return;
  }
  failGuest(L, 'ホストとの接続が切れました');
}

/* ================================================================ the title: a little market that never sleeps */
const brandLegendHost = $('#companyLegend'); if (brandLegendHost) brandLegendHost.innerHTML = companyLegend();

const hero = (() => {
  let raf = 0, cv = null, g = null, t0 = 0, toks = [], gold = 0, crashAt = 0;
  function reset() {
    toks = [0, 1, 2, 3, 4].map((c) => ({ c, L: 3 + Math.random() * 3, v: 0 }));
    gold = 0; crashAt = 0;
  }
  function frame(now) {
    if (!cv || $('#scrTitle').hidden) { raf = 0; return; }
    const W = cv.clientWidth, H = cv.clientHeight, DPR = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(W * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const t = (now - t0) / 1000;
    // grid
    g.fillStyle = '#172334'; g.fillRect(0, 0, W, H);
    const cols = 14, rows = 7, cw = W / cols, ch = H / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const area = Math.floor((r * 2 + (cols - c)) / 3);
      g.fillStyle = area % 2 ? '#286b3b' : '#f5f0d9';
      g.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      g.font = '600 10px Oswald, sans-serif'; g.textAlign = 'left'; g.fillStyle = area % 2 ? '#f5f0d9' : '#173222'; g.fillText(String(Math.round((rows-r)*(c+2)*2.5)), c*cw+4, r*ch+12);
    }
    // the market moves
    const crash = crashAt && t - crashAt < 1.4;
    toks.forEach((k, i) => {
      if (!crash) { k.v += (Math.sin(t * 1.3 + i * 2.1) * 0.6 + 0.25 + Math.random() * 0.2 - 0.1) * 0.016; }
      else k.v -= 0.06;
      k.v = clamp(k.v, -0.06, 0.06);
      k.L = clamp(k.L + k.v, 0.5, 13);
    });
    if (!crashAt && toks.some((k) => k.L > 11.5)) crashAt = t;
    if (crashAt && t - crashAt > 2.6) { crashAt = 0; toks.forEach((k) => { k.L = 2 + Math.random() * 3; k.v = 0; }); }
    toks.forEach((k, i) => {
      const x = W * (0.12 + i * 0.19), y = H - (k.L / 13) * (H - 24) - 12;
      g.strokeStyle = FX.COLORS[i]; g.globalAlpha = 0.25; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, H); g.lineTo(x, y); g.stroke(); g.globalAlpha = 1;
      const grd = g.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
      grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, FX.COLORS[i]); grd.addColorStop(1, FX.COLORS[i]);
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.stroke();
    });
    // gold price ticking up the side
    gold = crash ? gold : Math.min(1, gold + 0.0012);
    g.fillStyle = '#2a1d05'; g.fillRect(W - 16, 6, 10, H - 12);
    g.fillStyle = '#f6c64a'; g.fillRect(W - 16, 6 + (H - 12) * (1 - gold), 10, (H - 12) * gold);
    g.font = '600 12px Oswald, sans-serif'; g.fillStyle = '#f6c64a'; g.textAlign = 'right';
    g.fillText('$' + Math.round(20 + gold * 80), W - 22, 18);
    if (gold >= 1) gold = 0;
    if (crash) {
      const k = 1 - (t - crashAt) / 1.4;
      g.fillStyle = 'rgba(255,40,40,' + (0.32 * k) + ')'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, H / 2); g.rotate(-0.08);
      g.font = '800 ' + Math.round(H * 0.24) + 'px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,' + Math.min(1, k * 1.6) + ')'; g.fillText('暴落', 0, 0);
      g.restore();
    }
    raf = requestAnimationFrame(frame);
  }
  return {
    start() {
      cv = $('#heroCanvas'); g = cv.getContext('2d');
      if (REDUCE || TEST) { reset(); t0 = performance.now(); frame(t0); cancelAnimationFrame(raf); raf = 0; return; }
      if (raf) return;
      reset(); t0 = performance.now(); raf = requestAnimationFrame(frame);
    }
  };
})();

/* ================================================================ wiring and boot */
function wire() {
  document.addEventListener('pointerdown', () => { audioOn(); }, { capture: true, passive: true });
  $('#cine').addEventListener('click', () => { if (presenting) skipping = true; });
  $('#goCpu').onclick = () => { sfx('open'); openSetup('cpu'); };
  $('#goLocal').onclick = () => { sfx('open'); openSetup('local'); };
  $('#goOnline').onclick = () => { sfx('open'); showScreen('#scrOnline'); resetOnlineUI(); $('#onName').value = prefs.name || ''; };
  $('#goRules').onclick = () => openRules();
  $('#goResume').onclick = () => resumeGame();
  $$('[data-back]').forEach((b) => { b.onclick = () => showTitle(); });
  $$('#segCount button').forEach((b) => { b.onclick = () => { sfx('tap'); const v = Number(b.dataset.v); if (setupMode === 'local') { prefs.localCount = v; store.set('localCount', v); } else { prefs.count = v; store.set('count', v); } renderSetup(); }; });
  $$('#segMibs button').forEach((b) => { b.onclick = () => { sfx('tap'); const v = Number(b.dataset.v) === 1; if (setupMode === 'local') { prefs.localMibs = v; store.set('localMibs', v); } else { prefs.mibs = v; store.set('mibs', v); } renderSetup(); }; });
  $$('#segLevel button').forEach((b) => { b.onclick = () => { sfx('tap'); prefs.level = Number(b.dataset.v); store.set('level', prefs.level); renderSetup(); }; });
  $('#setupStart').onclick = () => { audioOn(); if (setupMode === 'local') startLocal(); else startCpu(); };
  $('#onCreate').onclick = () => hostRoom();
  $('#onJoin').onclick = () => joinRoom();
  $('#onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('#lobAddCpu').onclick = () => { if (lobby && lobby.role === 'host') addCpu(lobby); };
  $$('#lobMibs button').forEach((b) => { b.onclick = () => { if (lobby && lobby.role === 'host') { lobby.mibs = Number(b.dataset.v) === 1; pushLobby(lobby); } }; });
  $('#lobStart').onclick = () => { if (lobby && lobby.role === 'host') startHostMatch(lobby); };
  $('#lobLeave').onclick = () => { closeLobby(); showScreen('#scrOnline'); resetOnlineUI(); };
  $('#lobInvite').onclick = async () => {
    if (!lobby) return;
    const u = new URL(location.href); u.search = '?room=' + lobby.code; u.hash = '';
    const text = 'ブラックフライデーで遊ぼう（部屋コード ' + lobby.code + '）';
    try { if (navigator.share) { await navigator.share({ title: 'ブラックフライデー', text, url: u.toString() }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(u.toString()); toast('招待リンクをコピーしました', 'good'); } catch (e) { toast(esc(u.toString())); }
  };
  $('#btnMenu').onclick = () => { sfx('open'); openMenu(); };
  $('#btnSound').onclick = () => { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); applySound(); };
  $('#lvPlate').onclick = () => openRules();
  window.addEventListener('resize', () => { layoutBoard(); });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
    if (e.key === 'Escape' && $('#layer .sheet')) closeLayer();
  });
  window.addEventListener('pagehide', () => closeLobby(true));
}
function boot() {
  FX.setLevel(prefs.fx);
  applySound();
  wire();
  const room = N.cleanCode(params.get('room') || '');
  if (room.length === 4) { showScreen('#scrOnline'); $('#onName').value = prefs.name || ''; $('#onCode').value = room; if (prefs.name) joinRoom(room); }
  else showTitle();
  setTimeout(() => $('#loader').classList.add('gone'), 120);
  if (TEST) window.__bf = {
    E, AI, act, startCpu, prefs, store,
    get match() { return match; }, get dv() { return dv; }, get view() { return view; }, get presenting() { return presenting; }, get queue() { return queue.length; },
    myTurn() { return !!(match && dv && dv.phase === 'play' && !presenting && !queue.length && !match.waiting && match.viewer >= 0 && dv.turn === match.viewer && isHumanHere(dv.turn)); },
    idle() { return !!(match && dv && !presenting && !queue.length && !(match.waiting)); }
  };
}
boot();


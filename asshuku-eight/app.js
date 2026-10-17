/* アッシュク・エイト — the app: screens, the note mat, the table, turn flow, CPU and online play.
   Solo / vs CPU: the engine runs here and the CPUs (ai.js) take their turns.
   Online: the host's browser runs the engine and the CPUs; each guest sends its moves and gets back its own view.
   Whatever happens arrives as (events, view): the presenter plays the events one by one on the table, then
   settles on the view. The note mat is local to each screen: where a player puts their cards is nobody's
   business but theirs (and it survives a reload of the page). */

const E = window.ASE_ENG, AI = window.ASE_AI, N = window.ASE_NET;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
const store = {
  get(k, d) { try { const v = localStorage.getItem('ase.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ase.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const prefs = {
  name: store.get('name', ''), level: store.get('level', 2), count: store.get('count', 3), target: store.get('target', 30),
  sound: store.get('sound', true), speed: store.get('speed', 1), size: store.get('size', 1), snap: store.get('snap', true)
};
if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;
const LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
const LEVEL_NOTE = {
  1: 'やさしい：並びが長くなると、わりと早めにまちがえます。',
  2: 'ふつう：20枚前後まではしっかりついてきます。',
  3: 'つよい：長い並びも崩れにくく、山に足すカードも意地悪です。'
};
const CPU_NAMES = ['ビット', 'バイト', 'ニブル', 'ワード', 'パリティ', 'キャッシュ'];
const SEAT_COLORS = ['#3d7fd1', '#3f9a5f', '#c0659e', '#c7962c', '#7d6bc0', '#2e9e9a', '#c8562f'];
const MAX_SEATS = 7;
const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function myCid() {
  let c = null;
  try { c = sessionStorage.getItem('ase.cid'); } catch (e) { /* ignore */ }
  if (!c || !/^[A-Za-z0-9]{6,32}$/.test(c)) { c = N.makeCid(); try { sessionStorage.setItem('ase.cid', c); } catch (e) { /* ignore */ } }
  return c;
}
const CID = myCid();

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dur = (ms) => (REDUCE ? 1 : Math.max(1, ms / prefs.speed));
const wait = (ms) => sleep(ms / prefs.speed);   // how long things stay on show (not shortened for reduced motion)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================ card faces (SVG, viewBox 100 x 140) */
const INK = '#1e2433', PAPER = '#f2efe7', PEN_BG = '#f3b32e', PEN_INK = '#fff8ea';
function corners(d, col) {
  return [[8, 8], [82, 8], [8, 117], [82, 117]].map(([x, y]) => (d
    ? '<rect x="' + (x + 3.5) + '" y="' + y + '" width="3" height="15" rx=".8" fill="' + col + '"/>'
    : '<rect x="' + (x + .5) + '" y="' + y + '" width="9" height="15" rx="4.5" fill="none" stroke="' + col + '" stroke-width="2.6"/>')).join('');
}
function faceSVG(id, side) {
  if (E.isPen(id)) {
    const bits = side ? '1001' : '0110';
    let g = '';
    for (let i = 0; i < 4; i++) {
      const y = 19 + i * 28;
      g += bits[i] === '0'
        ? '<rect x="21.5" y="' + (y + 3.2) + '" width="57" height="15.6" rx="7.8" fill="none" stroke="' + PEN_INK + '" stroke-width="6.4"/>'
        : '<rect x="18" y="' + (y + 7.5) + '" width="64" height="7" rx="1.5" fill="' + PEN_INK + '"/>';
    }
    return '<svg class="card" viewBox="0 0 100 140" aria-hidden="true"><rect x=".75" y=".75" width="98.5" height="138.5" rx="9" fill="' + PEN_BG + '" stroke="#c98d1d" stroke-width="1.5"/>' + g + '</svg>';
  }
  const d = E.digit(id), b = E.black(id), bg = b ? INK : PAPER, fg = b ? PAPER : INK;
  const big = d
    ? '<rect x="44" y="33" width="12" height="74" rx="1.5" fill="' + fg + '"/>'
    : '<rect x="30.5" y="33.5" width="39" height="73" rx="19.5" fill="none" stroke="' + fg + '" stroke-width="11"/>';
  return '<svg class="card" viewBox="0 0 100 140" aria-hidden="true"><rect x=".75" y=".75" width="98.5" height="138.5" rx="9" fill="' + bg + '" stroke="' + (b ? 'rgba(242,239,231,.18)' : 'rgba(30,36,51,.22)') + '" stroke-width="1.5"/>' + big + corners(d, fg) + '</svg>';
}
function backSVG() {
  return '<svg class="card" viewBox="0 0 100 140" aria-hidden="true"><rect x=".75" y=".75" width="98.5" height="138.5" rx="9" fill="url(#bkpat)" stroke="#23252a" stroke-width="1.5"/>' +
    '<rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="rgba(242,239,231,.16)" stroke-width="1.5"/>' +
    '<circle cx="50" cy="60" r="8.5" fill="#353841" stroke="#f0652a" stroke-width="3.6"/><circle cx="50" cy="80.5" r="10" fill="#353841" stroke="#f0652a" stroke-width="3.6"/></svg>';
}
function miniCard(id, cls = '', side = 0) { return '<span class="mini ' + cls + '">' + faceSVG(id, side) + '</span>'; }
const SAMPLE = { w0: 0, w1: 1, b0: 2, b1: 3 };   // one card of each kind (id % 4)

/* ================================================================ sound */
const sfx = (() => {
  let ctx = null, master = null;
  function ctxOf() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function unlock() { const c = ctxOf(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
  function tone(f, len, type, vol, at, slide) {
    const c = ctx, t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + len + 0.02);
  }
  function noise(len, vol, freq, at, q) {
    const c = ctx, t = c.currentTime + (at || 0), n = Math.max(1, Math.floor(c.sampleRate * len));
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 2400; f.Q.value = q || 0.8;
    g.gain.value = vol || 0.2; src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  const S = {
    tap: () => tone(880, 0.05, 'triangle', 0.06),
    pick: () => { noise(0.05, 0.16, 3200); },
    drop: () => { noise(0.07, 0.22, 900, 0, 1.2); tone(140, 0.07, 'sine', 0.08); },
    flip: () => { noise(0.09, 0.3, 2600); noise(0.05, 0.18, 5200, 0.05); },
    place: () => { noise(0.08, 0.28, 1100, 0, 1.4); tone(120, 0.08, 'sine', 0.1); },
    ok: () => { tone(988, 0.1, 'sine', 0.12); tone(1319, 0.16, 'sine', 0.12, 0.08); },
    bad: () => { tone(220, 0.24, 'square', 0.06, 0, 0.7); tone(165, 0.3, 'square', 0.05, 0.07, 0.8); },
    pen: () => { noise(0.12, 0.35, 700, 0, 1.6); tone(98, 0.22, 'sine', 0.18); },
    shuffle: () => { for (let i = 0; i < 6; i++) noise(0.05, 0.2, 2200 + i * 300, i * 0.045); },
    turn: () => { tone(660, 0.08, 'triangle', 0.08); tone(880, 0.12, 'triangle', 0.08, 0.07); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.1)); },
    lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, i * 0.14)); }
  };
  return {
    unlock,
    play(name) { if (!prefs.sound || REDUCE && name === 'shuffle') return; const c = ctxOf(); if (!c || c.state !== 'running') return; try { S[name] && S[name](); } catch (e) { /* ignore */ } }
  };
})();

/* ================================================================ little UI helpers */
function toast(html, cls = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.innerHTML = html;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 320); }, ms);
}
function stamp(text, cls, sub) {
  const el = $('#stamp');
  el.className = ''; void el.offsetWidth;
  el.innerHTML = esc(text) + (sub ? '<small>' + sub + '</small>' : '');
  el.className = 'show ' + (cls || 'info');
  clearTimeout(stamp.t); stamp.t = setTimeout(() => { el.className = ''; }, 1550);
}
function openLayer(html, onClose) {
  const layer = $('#layer');
  $('#stamp').className = '';
  layer.innerHTML = html;
  closeLayer.cb = onClose || null;
  layer.onclick = (e) => { if (e.target === layer || e.target.closest('[data-close]')) closeLayer(); };
  const f = layer.querySelector('[data-close]'); if (f) f.focus({ preventScroll: true });
  return layer.firstElementChild;
}
function closeLayer() { $('#layer').innerHTML = ''; const f = closeLayer.cb; closeLayer.cb = null; if (f) f(); }
function sheet(title, body) {
  return '<div class="sheet" role="dialog" aria-label="' + esc(title) + '"><div class="sheet-h"><h3>' + esc(title) + '</h3><button class="iconbtn" data-close aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="sheet-b">' + body + '</div></div>';
}

/* ================================================================ state */
let match = null;      // the game on the table
let lobby = null;      // an online room (outlives rematches)
let view = null;       // what the table shows right now
let presenting = false;
const queue = [];
let matchSeq = 0;

function nameOf(p) { if (!match) return ''; return p === match.me ? 'あなた' : (match.players[p] ? match.players[p].nm : 'P' + (p + 1)); }
function colorOf(p) { return SEAT_COLORS[p % SEAT_COLORS.length]; }
function nameHtml(p) { return '<b class="pn" style="--pc:' + colorOf(p) + '">' + esc(nameOf(p)) + '</b>'; }
function initialOf(p) { const n = nameOf(p); return esc(Array.from(n)[0] || '?'); }
function myTurn() { return !!(match && view && view.phase !== 'over' && view.turn === match.me && !presenting && !match.waiting); }

/* ================================================================ the note mat */
/* The mat is a board of U x V card widths, fixed when a game starts. A resize or a turned phone only rescales
   it (letterboxed in the space there is), so a layout of notes keeps its shape. */
const mat = { cw: 56, W: 300, H: 300, U: 7, V: 7, ox: 0, oy: 0, cards: new Map(), z: [], sel: null, key: null, drag: null, touched: 0 };
const matEl = () => $('#mat');

function matKey(v) { return 'ase.notes.' + (v.gid || 'x') + '.' + v.me; }
function matSave() {
  if (!mat.key) return;
  const cs = {};
  mat.cards.forEach((c, id) => { cs[id] = [Math.round(c.cx * 1000) / 1000, Math.round(c.cy * 1000) / 1000, c.r, c.f ? 1 : 0]; });
  try { sessionStorage.setItem(mat.key, JSON.stringify({ cs, z: mat.z, U: mat.U, V: mat.V })); } catch (e) { /* ignore */ }
}
function matLoad(key) {
  try { const d = JSON.parse(sessionStorage.getItem(key) || 'null'); if (d && d.cs) return d; } catch (e) { /* ignore */ }
  return null;
}
function matReset(v) {
  mat.cards.forEach((c) => c.el.remove());
  mat.cards.clear(); mat.z = []; mat.sel = null; mat.drag = null;
  mat.key = matKey(v);
  const saved = matLoad(mat.key);
  if (saved && saved.U > 1 && saved.V > 1) { mat.U = saved.U; mat.V = saved.V; matMeasure(false); } else matMeasure(true);
  const ids = (v.hand || []).slice();
  if (saved) {
    const order = saved.z.filter((id) => ids.includes(id)).concat(ids.filter((id) => !saved.z.includes(id)));
    order.forEach((id) => { const s = saved.cs[id]; addMatCard(id, s ? { cx: s[0], cy: s[1], r: s[2], f: !!s[3] } : null); });
  } else {
    const slots = dealSlots(ids.length);
    ids.forEach((id, i) => addMatCard(id, slots[i]));
  }
  matTools();
}
function matMeasure(fresh) {
  const el = matEl();
  const W = Math.max(120, el.clientWidth), H = Math.max(120, el.clientHeight);
  let cw;
  if (fresh) {
    cw = clamp(Math.round(Math.min(W / 7.4, H / 4.5) * (prefs.size || 1)), 34, 96);
    mat.U = Math.floor(W / cw * 4) / 4; mat.V = Math.floor(H / cw * 4) / 4;
  }
  cw = Math.max(20, Math.min(W / mat.U, H / mat.V));
  mat.W = W; mat.H = H; mat.cw = cw;
  mat.ox = Math.round((W - mat.U * cw) / 2); mat.oy = Math.round((H - mat.V * cw) / 2);
  el.style.setProperty('--cw', cw.toFixed(2) + 'px');
  el.style.setProperty('--grid', (cw / 4).toFixed(2) + 'px');
  el.style.setProperty('--gx', (mat.ox - cw / 8).toFixed(1) + 'px');
  el.style.setProperty('--gy', (mat.oy - cw / 8).toFixed(1) + 'px');
  const area = $('#matArea');
  const boxed = mat.ox > 3 || mat.oy > 3;
  area.hidden = !boxed;
  if (boxed) { area.style.left = mat.ox + 'px'; area.style.top = mat.oy + 'px'; area.style.width = (mat.U * cw) + 'px'; area.style.height = (mat.V * cw) + 'px'; }
}
/* the first layout: one row along the bottom if it fits, else even rows */
function dealSlots(k) {
  const U = mat.U, V = mat.V, gap = 1.25;
  const most = Math.max(1, Math.floor((U - 0.5 + (gap - 1)) / gap));
  const rows = Math.ceil(k / most), perRow = Math.ceil(k / rows), out = [];
  for (let i = 0; i < k; i++) {
    const r = Math.floor(i / perRow), c = i % perRow, inRow = Math.min(perRow, k - r * perRow);
    const x0 = Math.round(((U - (inRow * gap - (gap - 1))) / 2 + 0.5) * 4) / 4;
    out.push({ cx: x0 + c * gap, cy: Math.round((V - 0.9 - (rows - 1 - r) * 1.6) * 4) / 4, r: 0, f: false });
  }
  return out;
}
const snapv = (x) => (prefs.snap ? Math.round(x * 4) / 4 : x);
function boxOf(c) {   // axis-aligned box of a (possibly turned) card, in card widths
  const a = (c.r % 180) * Math.PI / 180, w = Math.abs(Math.cos(a)) * 1 + Math.abs(Math.sin(a)) * 1.4, h = Math.abs(Math.sin(a)) * 1 + Math.abs(Math.cos(a)) * 1.4;
  return { x0: c.cx - w / 2, x1: c.cx + w / 2, y0: c.cy - h / 2, y1: c.cy + h / 2 };
}
/* somewhere free for a card that just arrived: along the bottom first, then upwards */
function freeSlot() {
  const U = mat.U, V = mat.V, list = Array.from(mat.cards.values()).map(boxOf);
  for (let row = 0; row < 6; row++) {
    const cy = V - 0.85 - row * 1.55;
    if (cy < 0.75) break;
    for (let cx = U - 0.75; cx >= 0.6; cx -= 0.5) {
      const b = { x0: cx - 0.55, x1: cx + 0.55, y0: cy - 0.75, y1: cy + 0.75 };
      if (!list.some((o) => o.x0 < b.x1 && o.x1 > b.x0 && o.y0 < b.y1 && o.y1 > b.y0)) return { cx: snapv(cx), cy: snapv(cy) };
    }
  }
  return { cx: snapv(U - 0.75), cy: snapv(V - 0.85) };
}
function addMatCard(id, at) {
  const el = document.createElement('div');
  el.className = 'nc'; el.tabIndex = 0; el.setAttribute('role', 'button');
  el.dataset.id = id;
  const c = { id, el, cx: 0, cy: 0, r: 0, f: false };
  Object.assign(c, at || freeSlot());
  c.r = c.r || 0; c.f = !!c.f;
  mat.cards.set(id, c);
  mat.z.push(id);
  paintCard(c); placeCard(c);
  bindCard(c);
  matEl().appendChild(el);
  restack();
  return c;
}
function removeMatCard(id) {
  const c = mat.cards.get(id);
  if (!c) return;
  c.el.remove(); mat.cards.delete(id);
  mat.z = mat.z.filter((x) => x !== id);
  if (mat.sel === id) mat.sel = null;
}
function paintCard(c) {
  const pen = E.isPen(c.id);
  c.el.innerHTML = !pen && c.f ? backSVG() : faceSVG(c.id, pen && c.f ? 1 : 0);
  c.el.setAttribute('aria-label', (pen ? 'ペナルティカード（' + (c.f ? '1001' : '0110') + '）' : E.kindName(c.id) + (c.f ? '（裏向き）' : '')) + '、' + (c.r % 180) + '度');
}
function placeCard(c) {
  const cw = mat.cw;
  c.el.style.transform = 'translate(' + (mat.ox + c.cx * cw - cw / 2).toFixed(1) + 'px,' + (mat.oy + c.cy * cw - cw * 0.7).toFixed(1) + 'px) rotate(' + c.r + 'deg)';
}
function restack() { mat.z.forEach((id, i) => { const c = mat.cards.get(id); if (c) c.el.style.zIndex = String(i + 1); }); }
function toFront(c) { mat.z = mat.z.filter((x) => x !== c.id).concat([c.id]); restack(); }
function toBack(c) { mat.z = [c.id].concat(mat.z.filter((x) => x !== c.id)); restack(); }
function keepInside(c) {
  const U = mat.U, V = mat.V;
  c.cx = clamp(c.cx, 0.3, Math.max(0.3, U - 0.3));
  c.cy = clamp(c.cy, 0.35, Math.max(0.35, V - 0.35));
}
function animate(c) { c.el.classList.add('anim'); clearTimeout(c.at); c.at = setTimeout(() => c.el.classList.remove('anim'), 320); }
function select(id) {
  mat.sel = id;
  mat.cards.forEach((c) => c.el.classList.toggle('sel', c.id === id));
  matTools(); renderBar();
}
function rotateCard(c, by) { mat.touched = performance.now(); c.r = ((c.r + (by || 45)) % 360 + 360) % 360; animate(c); placeCard(c); paintCard(c); sfx.play('tap'); matSave(); }
function flipCard(c) { mat.touched = performance.now(); c.f = !c.f; paintCard(c); sfx.play('flip'); matSave(); c.el.animate([{ transform: c.el.style.transform + ' scaleX(.1)' }, { transform: c.el.style.transform }], { duration: 160, easing: 'ease-out' }); }
function matTools() {
  const has = mat.sel != null && mat.cards.has(mat.sel);
  ['#tRot', '#tFlip', '#tUp', '#tDown'].forEach((s) => { $(s).disabled = !has; });
  const adding = !!(match && view && view.phase === 'add' && view.turn === match.me && !presenting);
  matEl().classList.toggle('adding', adding);
  $('#matHint').textContent = adding ? '山に出すカードをタップして選ぶ' : has ? 'もう一度タップで45°回す' : 'ドラッグで動かす・タップで選ぶ';
  const n = mat.cards.size;
  $('#matCount').textContent = n ? n + '枚' : '';
}
function bindCard(c) {
  const el = c.el;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    sfx.unlock();
    mat.touched = performance.now();
    mat.drag = { c, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: c.cx, oy: c.cy, moved: false };
    el.classList.add('lift');
  });
  el.addEventListener('pointermove', (e) => {
    const d = mat.drag;
    if (!d || d.c !== c || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      d.moved = true; toFront(c); if (mat.sel !== c.id) select(c.id); sfx.play('pick');
    }
    c.cx = d.ox + dx / mat.cw; c.cy = d.oy + dy / mat.cw; keepInside(c); placeCard(c);
  });
  const up = (e) => {
    const d = mat.drag;
    if (!d || d.c !== c || e.pointerId !== d.pid) return;
    mat.drag = null; el.classList.remove('lift');
    mat.touched = performance.now();
    if (d.moved) {
      if (prefs.snap) { c.cx = snapv(c.cx); c.cy = snapv(c.cy); keepInside(c); animate(c); placeCard(c); }
      sfx.play('drop'); matSave();
    } else if (e.type === 'pointerup') {
      if (mat.sel === c.id) rotateCard(c, 45); else { select(c.id); sfx.play('tap'); }
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('keydown', (e) => {
    const step = 0.25;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (mat.sel === c.id) rotateCard(c, 45); else select(c.id); return; }
    if (e.key === 'r' || e.key === 'R') { rotateCard(c, 45); return; }
    if (e.key === 'f' || e.key === 'F') { flipCard(c); return; }
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); c.cx += mv[0]; c.cy += mv[1]; keepInside(c); placeCard(c); matSave(); if (mat.sel !== c.id) select(c.id); }
  });
  el.addEventListener('focus', () => { if (mat.sel !== c.id && !mat.drag) select(c.id); });
}
function matRelayout(fresh) {
  if (!mat.key) return;
  matMeasure(!!fresh);
  mat.cards.forEach((c) => { keepInside(c); placeCard(c); });
  if (fresh) matSave();
}
/* bring the mat in line with the hand (cards that left are gone, new ones go somewhere free) */
function matSync(hand) {
  const ids = new Set(hand || []);
  Array.from(mat.cards.keys()).forEach((id) => { if (!ids.has(id)) removeMatCard(id); });
  (hand || []).forEach((id) => { if (!mat.cards.has(id)) addMatCard(id, null); });
  matTools();
}
function tidyMat() {
  const ids = mat.z.slice().sort((a, b) => a - b);
  const slots = dealSlots(ids.length);
  ids.forEach((id, i) => { const c = mat.cards.get(id); Object.assign(c, slots[i]); c.f = false; paintCard(c); animate(c); placeCard(c); });
  matSave();
}

/* ================================================================ the table */
function renderSeats() {
  const box = $('#seats');
  if (!match || !view) { box.innerHTML = ''; return; }
  const n = view.n;
  if (box.children.length !== n) {
    box.innerHTML = '';
    for (let p = 0; p < n; p++) {
      const d = document.createElement('div');
      d.className = 'seat'; d.id = 'seat-' + p;
      box.appendChild(d);
    }
  }
  for (let p = 0; p < n; p++) {
    const d = box.children[p], pl = match.players[p] || {};
    const pens = view.pens[p] || 0;
    d.className = 'seat' + (p === match.me ? ' me' : '') + (view.phase !== 'over' && view.turn === p ? ' turn' : '') + (pl.here === false ? ' away' : '') + (pens >= E.LOSE_AT ? ' out' : '');
    d.style.setProperty('--pc', colorOf(p));
    const lv = pl.kind === 'cpu' || pl.sub ? '<span class="lv">CPU</span>' : '';
    const html = lv + '<span class="av">' + initialOf(p) + '</span><span class="nm">' + esc(nameOf(p)) + '</span><span class="pens"><i class="' + (pens >= 1 ? 'on' : '') + '"></i><i class="' + (pens >= 2 ? 'on' : '') + '"></i></span>';
    const keep = d.querySelector('.bubble');
    if (d._html !== html) { d.innerHTML = html; d._html = html; if (keep) d.appendChild(keep); }
    d.title = nameOf(p) + '：ペナルティ ' + pens + '枚';
  }
}
const PILE_STEP = 0.9;
function paintPile(id, count, kind) {
  const el = $('#' + id), st = el.querySelector('.stack');
  const want = count > 0 ? (kind + ':' + Math.min(count, 22)) : 'none';
  if (st._k !== want) {
    st._k = want;
    if (!count) { st.innerHTML = ''; st.style.boxShadow = 'none'; st.style.transform = ''; }
    else {
      st.innerHTML = kind === 'pen' ? faceSVG(E.PEN_BASE, 0) : backSVG();
      const layers = Math.min(count, 22), sh = [];
      for (let i = 1; i < layers; i++) sh.push('0 ' + (i * PILE_STEP).toFixed(1) + 'px 0 ' + (kind === 'pen' ? (i % 2 ? '#d99a22' : '#c48619') : (i % 2 ? '#d3cdc1' : '#a6a196')));
      sh.push('0 ' + (layers * PILE_STEP + 5).toFixed(1) + 'px 12px rgba(0,0,0,.35)');
      st.style.boxShadow = sh.join(',');
      st.style.transform = 'translateY(' + (-(layers - 1) * PILE_STEP).toFixed(1) + 'px)';
    }
  }
  const b = el.querySelector('.lbl b'); if (b) b.textContent = String(count);
}
function renderPiles(v) {
  v = v || view;
  if (!v) return;
  paintPile('pDeck', v.deck, 'back');
  paintPile('pMem', v.mem, 'back');
  paintPile('pChk', v.chk, 'back');
  paintPile('pPen', v.pool, 'pen');
  const tag = $('#posTag');
  if (v.phase === 'answer' && v.mem > 0) { tag.hidden = false; tag.innerHTML = '<b>' + (v.chk + 1) + '</b>枚目 / ' + v.len + '枚'; }
  else if (v.phase === 'add') { tag.hidden = false; tag.innerHTML = v.len ? 'ここに<b>＋1</b>枚' : '<b>最初の1枚</b>'; }
  else tag.hidden = true;
  $('#hudLen').textContent = String(v.len);
  $('#hudDeck').textContent = String(v.deck);
}
function renderBar() {
  const prompt = $('#prompt'), actions = $('#actions');
  if (!match || !view) { prompt.innerHTML = ''; actions.innerHTML = ''; return; }
  const v = view, me = match.me, mine = v.turn === me;
  let p = '', a = '';
  if (v.phase === 'over') {
    p = 'ゲーム終了<small>' + overLine(v.result) + '</small>';
    a = '<button class="btn primary" id="aResult">結果を見る</button>';
  } else if (match.waiting) {
    p = '送信中<span class="thinking"></span>';
  } else if (v.phase === 'answer') {
    const pos = '<small>' + (v.chk + 1) + '枚目 / ' + v.len + '枚' + (v.round ? '・' + (v.round + 1) + '周目（前の周の逆順）' : '') + '</small>';
    if (mine) {
      p = '<b>あなたの番</b>：いちばん上は 0？ 1？' + pos;
      const dis = presenting ? ' disabled' : '';
      a = '<button class="ans" id="a0" aria-label="0と答える"' + dis + '><svg viewBox="0 0 30 46"><rect x="4.5" y="4.5" width="21" height="37" rx="10.5" fill="none" stroke="' + INK + '" stroke-width="6"/></svg></button>' +
          '<button class="ans" id="a1" aria-label="1と答える"' + dis + '><svg viewBox="0 0 30 46"><rect x="11.5" y="3" width="7" height="40" rx="1" fill="' + INK + '"/></svg></button>';
    } else p = nameHtml(v.turn) + 'が答えています<span class="thinking"></span>' + pos;
  } else if (v.phase === 'add') {
    if (mine) {
      const c = mat.sel != null ? mat.cards.get(mat.sel) : null;
      p = (v.len ? '<b>1枚足す番</b>：メモ台から選んで出す' : '<b>最初の1枚</b>：メモ台から選んで出す') + '<small>見せてから山のいちばん上に置きます</small>';
      const ok = c && !E.isPen(c.id) && !presenting;
      a = '<button class="btn primary" id="aAdd"' + (ok ? '' : ' disabled') + '>' + (c ? (E.isPen(c.id) ? 'ペナルティは出せません' : esc(E.kindName(c.id)) + 'を出す') : 'カードを選んでね') + '</button>';
    } else p = nameHtml(v.turn) + (v.len ? 'が山に1枚足します' : 'が最初の1枚を出します') + '<span class="thinking"></span>';
  }
  if (prompt._h !== p) { prompt.innerHTML = p; prompt._h = p; }
  if (actions._h !== a) {
    actions.innerHTML = a; actions._h = a;
    const a0 = $('#a0'), a1 = $('#a1'), add = $('#aAdd'), res = $('#aResult');
    if (a0) a0.onclick = () => act({ t: 'answer', v: 0 });
    if (a1) a1.onclick = () => act({ t: 'answer', v: 1 });
    if (add) add.onclick = () => { const c = mat.sel != null ? mat.cards.get(mat.sel) : null; if (c && !E.isPen(c.id)) act({ t: 'add', card: c.id }); };
    if (res) res.onclick = () => openResult();
  }
}
function overLine(r) {
  if (!r) return '';
  if (r.why === 'deck') return '山札がなくなりました。並び' + r.len + '枚';
  return nameOf(r.loser) + 'がペナルティ2枚目。並び' + r.len + '枚';
}
function renderAll() { renderSeats(); renderPiles(); renderBar(); matTools(); }

/* ================================================================ flying cards */
function rectC(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }
function pileTop(id) { const st = $('#' + id + ' .stack'), r = rectC(st.childElementCount ? st : $('#' + id + ' .slot') || st); return { x: r.x, y: r.y, w: r.w, rot: 0 }; }
function revealSpot() { const r = rectC($('#revealSpot')); return { x: r.x, y: r.y, w: r.w, rot: 0 }; }
function seatSpot(p) { const el = $('#seat-' + p); if (!el) return revealSpot(); const r = rectC(el); return { x: r.x, y: r.y, w: Math.min(26, r.w * 0.5), rot: 0 }; }
function matSpot(c) { const r = matEl().getBoundingClientRect(); return { x: r.left + mat.ox + c.cx * mat.cw, y: r.top + mat.oy + c.cy * mat.cw, w: mat.cw, rot: c.r }; }
function makeFly(card, w, faceUp, side) {
  const el = document.createElement('div');
  el.className = 'fly';
  el.style.width = w + 'px'; el.style.height = (w * 1.4) + 'px'; el.style.perspective = (w * 9) + 'px';
  el.innerHTML = '<div class="flip"><div class="face">' + faceSVG(card, side || 0) + '</div><div class="back">' + (E.isPen(card) ? faceSVG(card, side ? 0 : 1) : backSVG()) + '</div></div>';
  el.firstChild.style.transform = faceUp ? 'rotateY(0deg)' : 'rotateY(180deg)';
  el._up = faceUp; el._w = w;
  $('#flyLayer').appendChild(el);
  return el;
}
function tfOf(p, W, lift) { return 'translate(' + (p.x - W / 2).toFixed(1) + 'px,' + (p.y - W * 0.7).toFixed(1) + 'px) rotate(' + (p.rot || 0) + 'deg) scale(' + ((p.w / W) * (lift || 1)).toFixed(3) + ')'; }
async function flyMove(el, from, to, ms, faceUp, arc) {
  const W = el._w, d = dur(ms);
  const frames = [{ transform: tfOf(from, W) }];
  if (arc) frames.push({ transform: tfOf({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc, w: Math.max(from.w, to.w), rot: ((from.rot || 0) + (to.rot || 0)) / 2 }, W, 1.08), offset: 0.5 });
  frames.push({ transform: tfOf(to, W) });
  const a = el.animate(frames, { duration: d, easing: 'cubic-bezier(.3,.75,.3,1)', fill: 'forwards' });
  if (faceUp != null && faceUp !== el._up) {
    el.firstChild.animate([{ transform: el._up ? 'rotateY(0deg)' : 'rotateY(180deg)' }, { transform: faceUp ? 'rotateY(0deg)' : 'rotateY(180deg)' }], { duration: d, easing: 'ease-in-out', fill: 'forwards' });
    el._up = faceUp;
    setTimeout(() => sfx.play('flip'), d * 0.35);
  }
  el._at = to;
  try { await a.finished; } catch (e) { /* cancelled */ }
}
function clearFlies() { $('#flyLayer').innerHTML = ''; }

/* ================================================================ the presenter */
function enqueue(m, finalView, ev, reset) {
  queue.push({ m, finalView, ev, reset });
  if (!presenting) pump();
}
async function pump() {
  presenting = true; renderBar(); matTools();
  while (queue.length) {
    const u = queue.shift();
    if (u.m !== match) continue;
    try { await presentOne(u); } catch (e) { console.error(e); clearFlies(); view = u.finalView; matSync(view.hand); renderAll(); }
    if (u.m === match) sawUpTo(u.m);
  }
  presenting = false;
  renderAll();
  afterIdle();
}
/* online: a guest tells the host how far it has watched; the CPUs wait for everyone to see each card */
function sawUpTo(m) { if (m && m.mode === 'guest' && view) m.link.send({ k: 'seen', ply: view.ply }); }
async function presentOne(u) {
  if (!view || u.reset) { view = u.finalView; clearFlies(); matSync(view.hand); renderAll(); return; }
  let v = view;
  for (const e of u.ev) {
    if (u.m !== match) return;
    v = await playEvent(v, e);
    view = v;
  }
  view = u.finalView;
  matSync(view.hand);
  renderAll();
  if (view.phase === 'over' && !u.m.shownOver) { u.m.shownOver = true; await showOver(); }
}
function flash(html) {
  const el = $('#flash');
  el.className = ''; void el.offsetWidth;
  el.innerHTML = html;
  el.className = 'show';
  clearTimeout(flash.t2); flash.t2 = setTimeout(() => { el.className = ''; }, 1750);
  const tag = $('#posTag');
  tag.style.visibility = 'hidden';
  clearTimeout(flash.t); flash.t = setTimeout(() => { tag.style.visibility = ''; }, dur(1500));
}
function bubble(p, text) {
  const el = $('#seat-' + p), table = $('#table');
  if (!el) return;
  table.querySelectorAll('.bubble').forEach((b) => b.remove());
  const r = el.getBoundingClientRect(), t = table.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'bubble'; b.textContent = text;
  b.style.left = (r.left + r.width / 2 - t.left) + 'px';
  b.style.top = (r.bottom - t.top) + 'px';
  table.appendChild(b);
  setTimeout(() => b.remove(), dur(1500));
}
async function playEvent(v, e) {
  const me = match.me;
  const next = E.reduceView(v, e);
  switch (e.k) {
    case 'answer': {
      bubble(e.p, String(e.v));
      sfx.play('tap');
      await wait(e.p === me ? 200 : 420);
      return next;
    }
    case 'reveal': {
      const from = pileTop('pMem'), spot = revealSpot();
      const el = makeFly(e.card, spot.w, false);
      el.style.transform = tfOf(from, el._w);
      view = Object.assign({}, v, { mem: v.mem - 1 }); renderPiles(view);
      await flyMove(el, from, spot, 380, true, 26);
      const mk = document.createElement('div');
      mk.className = 'mark ' + (e.ok ? 'ok' : 'bad'); mk.textContent = e.ok ? '○' : '×';
      el.appendChild(mk);
      sfx.play(e.ok ? 'ok' : 'bad');
      await wait(e.ok ? 760 : 1150);
      mk.remove();
      await flyMove(el, spot, pileTop('pChk'), 300, false);
      el.remove(); sfx.play('place');
      view = next; renderPiles(next); renderBar();
      return next;
    }
    case 'penalty': {
      stamp('ペナルティ', 'pen', e.count >= E.LOSE_AT ? esc(nameOf(e.p)) + 'は2枚目…' : esc(nameOf(e.p)) + 'に1枚');
      sfx.play('pen');
      const from = pileTop('pPen');
      if (e.p === me) {
        const slot = freeSlot();
        const el = makeFly(e.pen, mat.cw, true);
        await flyMove(el, from, matSpot(Object.assign({ r: 0 }, slot)), 620, true, 60);
        el.remove();
        const c = addMatCard(e.pen, Object.assign({ r: 0, f: false }, slot));
        c.el.classList.add('newc'); setTimeout(() => c.el.classList.remove('newc'), 3200);
        matSave(); matTools();
      } else {
        const el = makeFly(e.pen, from.w, true);
        await flyMove(el, from, seatSpot(e.p), 520, true, 30);
        el.remove();
      }
      view = next; renderPiles(next); renderSeats();
      await wait(300);
      return next;
    }
    case 'recycle': {
      const st = $('#pChk .stack'), a = pileTop('pChk'), b = pileTop('pMem');
      sfx.play('shuffle');
      flash('最後まで答えた！ 次は<b>逆順</b>');
      try { await st.animate([{ transform: st.style.transform }, { transform: st.style.transform + ' translate(' + (b.x - a.x).toFixed(1) + 'px,' + (b.y - a.y).toFixed(1) + 'px)' }], { duration: dur(520), easing: 'cubic-bezier(.4,0,.2,1)' }).finished; } catch (x) { /* ignore */ }
      renderPiles(next);
      await wait(200);
      return next;
    }
    case 'add': {
      const spot = revealSpot();
      let el;
      if (e.p === me) {
        const c = mat.cards.get(e.card);
        const from = c ? matSpot(c) : seatSpot(e.p);
        el = makeFly(e.card, spot.w, c ? !c.f : true);
        el.style.transform = tfOf(from, el._w);
        if (c) { removeMatCard(e.card); matSave(); matTools(); }
        await flyMove(el, from, spot, 420, true, 40);
      } else {
        const from = seatSpot(e.p);
        el = makeFly(e.card, spot.w, true);
        el.style.transform = tfOf(from, el._w);
        await flyMove(el, from, spot, 420, true, 20);
      }
      sfx.play('place');
      await wait(950);
      await flyMove(el, spot, pileTop('pMem'), 340, false);
      el.remove(); sfx.play('place');
      renderPiles(next);
      return next;
    }
    case 'draw': {
      const from = pileTop('pDeck');
      renderPiles(Object.assign({}, v, { deck: e.left }));
      if (e.p === me && e.card >= 0) {
        const slot = freeSlot();
        const el = makeFly(e.card, mat.cw, false);
        el.style.transform = tfOf(from, el._w);
        await flyMove(el, from, matSpot(Object.assign({ r: 0 }, slot)), 520, true, 50);
        el.remove();
        const c = addMatCard(e.card, Object.assign({ r: 0, f: false }, slot));
        c.el.classList.add('newc'); setTimeout(() => c.el.classList.remove('newc'), 3200);
        matSave(); matTools();
      } else {
        const el = makeFly(0, from.w, false);
        el.style.transform = tfOf(from, el._w);
        await flyMove(el, from, seatSpot(e.p), 420, false, 16);
        el.remove();
      }
      return next;
    }
    case 'turn': {
      view = next; renderSeats(); renderPiles(next);
      if (e.p === me) sfx.play('turn');
      return next;
    }
    case 'over': {
      view = next; renderAll();
      return next;
    }
  }
  return next;
}

/* ================================================================ moves and turn flow */
function act(a) {
  const m = match;
  if (!myTurn()) return;
  sfx.unlock();
  if (m.mode === 'guest') {
    m.waiting = true; renderBar();
    m.link.send({ k: 'act', a, ply: view.ply });
    clearTimeout(m.waitTo);
    m.waitTo = setTimeout(() => { if (match === m && m.waiting) { m.waiting = false; renderAll(); toast('ホストからの応答がありません', 'warn'); } }, 9000);
    return;
  }
  const r = E.apply(m.s, Object.assign({}, a, { p: m.me }));
  if (!r.ok) { toast('その手は打てません', 'warn'); return; }
  if (a.t === 'add') mat.sel = null;
  deliver(m, r.ev);
}
function deliver(m, ev) {
  if (m.s.phase === 'over' && !m.scored) scoreGame(m);
  enqueue(m, E.viewFor(m.s, m.me), E.evFor(ev, m.me));
  if (m.mode === 'host') sendUpdates(m, ev);
}
function scoreGame(m) {
  m.scored = true;
  if (m.mode === 'solo') {
    const r = m.s.result, key = 'best.' + (m.target || 0), best = store.get(key, 0);
    m.newBest = r.len > best;
    if (m.newBest) store.set(key, r.len);
  }
}
function metaOf(m) {
  return {
    names: m.players.map((pl) => pl.nm), kinds: m.players.map((pl) => (pl.kind === 'me' ? 'host' : pl.kind)),
    levels: m.players.map((pl) => pl.cpu || 0), here: m.players.map((pl) => pl.here !== false), sub: m.players.map((pl) => !!pl.sub)
  };
}
function sendUpdates(m, ev) {
  const L = m.lobby;
  if (!L) return;
  const meta = metaOf(m);
  m.players.forEach((pl, p) => { if (pl.kind === 'guest' && pl.cid) L.link.send(pl.cid, { k: 'upd', view: E.viewFor(m.s, p), ev: E.evFor(ev, p), meta }); });
}
function playersFromMeta(meta, me) {
  return meta.names.map((nm, p) => ({ nm: p === me ? myName() : nm, kind: p === me ? 'me' : meta.kinds[p], cpu: meta.levels[p], here: meta.here[p], sub: meta.sub[p] }));
}
function myName() { return prefs.name || 'あなた'; }

function afterIdle() {
  const m = match;
  if (!m || !m.alive || presenting || !view || view.phase === 'over' || m.mode === 'guest') return;
  const p = m.s.turn, pl = m.players[p];
  if (p === m.me) return;
  if (pl.kind === 'cpu') cpuStep(m, pl.cpu);
  else if (pl.kind === 'guest' && (pl.here === false || pl.sub)) awayStep(m, p);
}
async function cpuStep(m, level) {
  if (m.cpuBusy || !m.alive || m.s.phase === 'over') return;
  const p = m.s.turn, ply = m.s.ply;
  m.cpuBusy = true;
  await sleep((m.s.phase === 'add' ? 700 : 380 + Math.random() * 420) / prefs.speed);
  // nobody plays on while you are still arranging your notes
  for (let k = 0; k < 600 && (mat.drag || performance.now() - mat.touched < 900); k++) await sleep(120);
  // online: until every player has seen the last card (a stuck screen holds things up for 8 seconds at most)
  const t0 = performance.now();
  while (m.mode === 'host' && performance.now() - t0 < (TEST ? 3000 : 8000) && m.players.some((x) => x.kind === 'guest' && x.here !== false && !x.sub && (x.seen || 0) < m.s.ply)) await sleep(120);
  m.cpuBusy = false;
  if (match !== m || !m.alive || m.s.phase === 'over' || m.s.turn !== p || m.s.ply !== ply) return;
  const pl = m.players[p];
  if (pl.kind === 'guest' && pl.here !== false && !pl.sub) return;      // the player came back
  let a = AI.act(m.s, p, level || 2);
  let r = a ? E.apply(m.s, Object.assign({}, a, { p })) : { ok: false };
  if (!r.ok) r = E.apply(m.s, Object.assign({}, E.legalActions(m.s)[0], { p }));
  deliver(m, r.ev);
}
function awayStep(m, p) {
  const pl = m.players[p];
  if (pl.sub) { cpuStep(m, 2); return; }
  if (m.awayTimer) return;
  m.awayTimer = setTimeout(() => {
    m.awayTimer = null;
    if (match !== m || !m.alive || pl.here !== false) return;
    pl.sub = true;
    toast(esc(pl.nm) + ' さんの番はCPUが代わりに答えます', 'warn', 3200);
    sendUpdates(m, []);
    renderAll(); afterIdle();
  }, TEST ? 1500 : 15000);
}

/* ================================================================ starting games */
function beginMatch(m, v) {
  if (match && match !== m) { match.alive = false; clearTimeout(match.awayTimer); }
  match = m; queue.length = 0; presenting = false;
  closeLayer(); hideScreens(); clearFlies();
  document.body.classList.add('ingame');
  view = v;
  $('#seats').innerHTML = '';
  requestAnimationFrame(() => {
    renderSeats();
    sizeTable();
    matReset(v);
    renderAll();
    dealIn();
  });
  const first = v.turn === m.me ? 'あなた' : esc(nameOf(v.turn));
  toast(first + 'が最初の1枚を出します', v.turn === m.me ? 'me' : '', 2400);
  setTimeout(() => { if (match === m) afterIdle(); }, 650);
}
function dealIn() {
  let i = 0;
  mat.z.forEach((id) => {
    const c = mat.cards.get(id);
    if (!c || REDUCE) return;
    c.el.animate([{ opacity: 0, transform: c.el.style.transform + ' translateY(-40px) scale(1.1)' }, { opacity: 1, transform: c.el.style.transform }], { duration: 320, delay: i++ * 55, easing: 'cubic-bezier(.3,.8,.3,1.1)', fill: 'backwards' });
  });
  if (mat.cards.size) setTimeout(() => sfx.play('shuffle'), 60);
}
function startCpu(again) {
  const old = again && match && match.mode === 'cpu' ? match : null;
  const n = old ? old.players.length : clamp(prefs.count, 2, MAX_SEATS);
  const level = old ? old.level : prefs.level;
  const players = [{ nm: myName(), kind: 'me', cpu: 0 }];
  for (let i = 1; i < n; i++) players.push({ nm: CPU_NAMES[i - 1], kind: 'cpu', cpu: level });
  const s = E.newGame({ n });
  beginMatch({ mode: 'cpu', id: ++matchSeq, s, me: 0, players, level, alive: true }, E.viewFor(s, 0));
}
function startSolo(again) {
  const target = again && match && match.mode === 'solo' ? match.target : prefs.target;
  const s = E.newGame({ n: 1, first: 0, deckSize: target || null });
  beginMatch({ mode: 'solo', id: ++matchSeq, s, me: 0, players: [{ nm: myName(), kind: 'me', cpu: 0 }], target: target || 0, alive: true }, E.viewFor(s, 0));
}
async function showOver() {
  const r = view.result, me = match.me;
  await wait(300);
  if (match.mode === 'solo') {
    if (r.why === 'deck') { stamp('クリア！', 'win', '並び' + r.len + '枚'); sfx.play('win'); }
    else { stamp('記録 ' + r.len + '枚', 'info', 'ペナルティ2枚目'); sfx.play('lose'); }
  } else {
    const won = r.winners.includes(me);
    if (won && r.winners.length === 1) { stamp('勝ち！', 'win'); sfx.play('win'); }
    else if (won) { stamp('勝ち（同点）', 'win'); sfx.play('win'); }
    else { stamp(r.loser === me ? '負け…' : nameOf(r.winners[0]) + 'の勝ち', 'info'); sfx.play('lose'); }
  }
  await sleep(REDUCE ? 400 : 1450);
  if (match && view && view.phase === 'over' && !$('#layer').childElementCount) openResult();
}

/* ================================================================ sheets: rules, menu, settings, result */
function rulesHtml() {
  const w0 = miniCard(SAMPLE.w0, 'lg'), w1 = miniCard(SAMPLE.w1, 'lg'), b0 = miniCard(SAMPLE.b0, 'lg'), b1 = miniCard(SAMPLE.b1, 'lg');
  return '<p>まん中の伏せた山には、<b>0と1</b>のカードが並んでいます。その並びを、手元の<b>8枚のカード</b>だけをメモにして、まちがえずに答えつづけるゲームです。覚えるのではなく、<b>記録</b>します。</p>' +
    '<div class="minis" style="justify-content:center">' + w0 + w1 + b0 + b1 + '<span class="fig">' + miniCard(E.PEN_BASE, 'lg') + '</span><span class="fig">' + miniCard(E.PEN_BASE, 'lg', 1) + '</span></div>' +
    '<p class="note">カードは「0か1」×「白か黒」の4種類（このアプリでは各22枚）。答えるのは<b>数字だけ</b>で、白か黒かは答えなくてOK。黄色はペナルティカード（表が0110、裏が1001）。</p>' +
    '<h4>手番</h4><ol>' +
    '<li><b>最初の人</b>はメモ台からカードを1枚えらんで全員に見せ、山に置きます。山札から1枚補充。</li>' +
    '<li>次の人から順番に、<b>山のいちばん上が0か1か</b>を答えます。めくって確認したら「こたえた山」へ。</li>' +
    '<li>まちがえたら<b>ペナルティカード</b>を1枚受け取ります。<b>2枚目で負け</b>です。</li>' +
    '<li>山を<b>最後まで</b>答えたら、最後に答えた人がメモ台から1枚を見せて山の上に足し、山札から補充します。こたえた山はそのまま山に戻すので、<b>次の周は逆順</b>（足した1枚が最初）になります。</li></ol>' +
    '<h4>おわり</h4><p>だれかがペナルティ2枚目を受け取るか、山札がなくなったら終了。<b>ペナルティがいちばん少ない人の勝ち</b>（同じなら引き分け）。</p>' +
    '<h4>メモ台</h4><p>メモに使えるのは手元のカード（とペナルティカード）だけ。<b>ドラッグで動かす</b>・<b>タップで選んでもう一度タップで45°回す</b>・<b>裏返す</b>・<b>重ねる</b>は自由です。カードを出すと山札から1枚補充されるので、メモはどんどん入れ替わります。CPUは、あなたがカードを動かしている間は待ってくれます。</p>' +
    '<div class="hint">たとえば：<br>・<span class="minis" style="display:inline-flex;vertical-align:middle">' + miniCard(SAMPLE.b0) + '</span> 黒のカードは「同じ数字が2つ続く」<br>・<span class="minis" style="display:inline-flex;vertical-align:middle">' + miniCard(SAMPLE.w1, 'side') + '</span> 横向きは「1,0」<br>・半分重ねたら「くり返し」……自分だけのルールで<b>圧縮</b>しよう。</div>' +
    '<h4>ひとりで挑戦</h4><p>全部ひとりで答えます。山札がなくなるまでペナルティ2枚にならなければクリア。目標の枚数（山札の枚数）を選べます。</p>' +
    '<p class="credit">カードゲーム「コンプレス」（作：佐々木隼／オインクゲームズ）のルールを元にした非公式のファンメイドです。カードの内訳など公表されていない細部は推測しています。</p>';
}
function openRules() { openLayer(sheet('あそびかた', rulesHtml())); }
function openMenu() {
  const inGame = !!(match && document.body.classList.contains('ingame'));
  const el = openLayer(sheet('メニュー', '<div class="menu-list">' +
    '<button class="btn" data-m="rules">あそびかた</button>' +
    '<button class="btn" data-m="settings">設定（速さ・カードの大きさ）</button>' +
    (inGame ? '<button class="btn" data-m="tidy">メモ台を並べ直す</button>' : '') +
    (inGame && view && view.phase === 'over' ? '<button class="btn" data-m="result">結果を見る</button>' : '') +
    '<button class="btn" data-m="title">タイトルへ</button>' +
    '<button class="btn ghost" data-m="home">PLAYROOMへ戻る</button></div>'));
  el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
    const k = b.dataset.m;
    if (k === 'rules') openRules();
    else if (k === 'settings') openSettings();
    else if (k === 'result') openResult();
    else if (k === 'tidy') {
      const s2 = openLayer(sheet('メモ台を並べ直す', '<p>メモ台のカードを全部表向きにして、下に一列に並べ直します。いまの並べ方は消えます。</p><div class="row"><button class="btn ghost" data-close>やめる</button><button class="btn danger" id="tYes">並べ直す</button></div>'));
      s2.querySelector('#tYes').onclick = () => { closeLayer(); tidyMat(); };
    } else if (k === 'title') confirmQuit(false);
    else if (k === 'home') confirmQuit(true);
  });
}
function confirmQuit(home) {
  const playing = match && view && view.phase !== 'over' && document.body.classList.contains('ingame');
  const go = () => { closeLayer(); if (home) { if (lobby) closeLobby(); location.href = '../games/'; } else quitToTitle(); };
  if (!playing) { go(); return; }
  const online = match.mode === 'host' || match.mode === 'guest';
  const el = openLayer(sheet(home ? 'PLAYROOMへ戻る' : 'タイトルへ戻る', '<p>ゲームをやめて' + (home ? 'PLAYROOM' : 'タイトル') + 'に戻りますか？' + (online ? '（部屋との接続も切れます）' : '') + '</p><div class="row"><button class="btn ghost" data-close>続ける</button><button class="btn danger" id="qYes">やめる</button></div>'));
  el.querySelector('#qYes').onclick = go;
}
function segHtml(id, opts, cur) { return '<div class="seg" id="' + id + '">' + opts.map(([v, l]) => '<button data-v="' + v + '" aria-pressed="' + (String(v) === String(cur)) + '">' + l + '</button>').join('') + '</div>'; }
function openSettings() {
  const el = openLayer(sheet('設定',
    '<div class="field"><span>演出の速さ</span>' + segHtml('sSpeed', [[0.7, 'ゆっくり'], [1, 'ふつう'], [1.5, 'はやい']], prefs.speed) + '</div>' +
    '<div class="field"><span>カードの大きさ（メモ台）</span>' + segHtml('sSize', [[0.85, '小'], [1, '中'], [1.18, '大']], prefs.size) + '</div>' +
    '<div class="field"><span>置いたカードを点の位置にそろえる</span>' + segHtml('sSnap', [[1, 'そろえる'], [0, '自由に置く']], prefs.snap ? 1 : 0) + '</div>' +
    '<div class="field"><span>音</span>' + segHtml('sSound', [[1, 'オン'], [0, 'オフ']], prefs.sound ? 1 : 0) + '</div>' +
    '<p class="note">大きくするとメモ台に置ける広さが狭くなります（はみ出たカードは端に寄せます）。画面を回したときは、並べ方の形をそのまま縮めて表示します。</p>'));
  const bind = (id, fn) => el.querySelectorAll('#' + id + ' button').forEach((b) => b.onclick = () => { el.querySelectorAll('#' + id + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v); });
  bind('sSpeed', (v) => { prefs.speed = Number(v); store.set('speed', prefs.speed); });
  bind('sSize', (v) => { prefs.size = Number(v); store.set('size', prefs.size); matRelayout(true); });
  bind('sSnap', (v) => { prefs.snap = v === '1'; store.set('snap', prefs.snap); });
  bind('sSound', (v) => { prefs.sound = v === '1'; store.set('sound', prefs.sound); renderSound(); });
}
function openResult() {
  const m = match, v = view;
  if (!m || !v || !v.result) return;
  const r = v.result, me = m.me;
  let head = '', cls = '';
  if (m.mode === 'solo') { head = r.why === 'deck' ? 'クリア！' : '記録 ' + r.len + '枚'; cls = r.why === 'deck' ? 'win' : ''; }
  else if (r.winners.includes(me)) { head = r.winners.length > 1 ? '勝ち（同点）' : 'あなたの勝ち！'; cls = 'win'; }
  else { head = r.winners.length === 1 ? esc(nameOf(r.winners[0])) + 'の勝ち' : '引き分け'; cls = r.loser === me ? 'lose' : ''; }
  const order = Array.from({ length: v.n }, (_, p) => p).sort((a, b) => r.pens[a] - r.pens[b] || a - b);
  const rank = m.mode === 'solo' ? '' : '<div class="rank">' + order.map((p) => '<div class="rk' + (r.winners.includes(p) ? ' win' : '') + '" style="--pc:' + colorOf(p) + '"><span class="av">' + initialOf(p) + '</span><span class="nm">' + esc(nameOf(p)) + '</span>' +
    (r.winners.includes(p) ? '<span class="tag">勝ち</span>' : r.loser === p ? '<span class="tag" style="color:var(--bad)">2枚目</span>' : '') +
    '<span class="pens"><i class="' + (r.pens[p] >= 1 ? 'on' : '') + '"></i><i class="' + (r.pens[p] >= 2 ? 'on' : '') + '"></i></span></div>').join('') + '</div>';
  const best = m.mode === 'solo' ? store.get('best.' + (m.target || 0), 0) : 0;
  const stats = '<div class="stat"><div><b>' + r.len + '</b>並び（枚）</div><div><b>' + (v.answers || 0) + '</b>答えた回数</div>' + (m.mode === 'solo' ? '<div><b>' + best + '</b>' + (m.newBest ? 'ベスト更新！' : 'ベスト') + '</div>' : '') + '</div>';
  const why = r.why === 'deck' ? '山札がなくなって終了。' : esc(nameOf(r.loser)) + 'がペナルティ2枚目を受け取って終了。';
  const line = '<p class="note">最後の並び（いまの周の順）。メモと見くらべてみよう。</p><div class="lineview">' + (r.seq || []).map((c) => miniCard(c)).join('') + '</div>';
  const host = m.mode === 'host', guest = m.mode === 'guest';
  const again = guest ? '<p class="note">次のゲームはホストが始めます。</p>' : '<button class="btn primary" id="rAgain">' + (host ? '部屋にもどる' : 'もう一度') + '</button>';
  const el = openLayer(sheet('結果', '<div class="result-big ' + cls + '">' + head + '</div><p class="note" style="text-align:center">' + why + '</p>' + stats + rank + line +
    '<div class="row">' + again + '<button class="btn ghost" id="rTitle">タイトルへ</button></div>'));
  const ag = el.querySelector('#rAgain');
  if (ag) ag.onclick = () => { closeLayer(); if (host) hostBackToLobby(); else if (m.mode === 'solo') startSolo(true); else startCpu(true); };
  el.querySelector('#rTitle').onclick = () => { closeLayer(); quitToTitle(); };
}

/* ================================================================ screens */
const SCREENS = ['#scrTitle', '#scrCpu', '#scrSolo', '#scrOnline', '#scrLobby'];
function hideScreens() { SCREENS.forEach((s) => { $(s).hidden = true; }); }
function showScreen(id) { hideScreens(); $(id).hidden = false; }
function leaveGame() {
  if (match) { match.alive = false; clearTimeout(match.awayTimer); clearTimeout(match.waitTo); }
  match = null; view = null; queue.length = 0; presenting = false;
  clearFlies();
  document.body.classList.remove('ingame');

}
function quitToTitle() {
  if (lobby) closeLobby();
  leaveGame(); closeLayer();
  showScreen('#scrTitle');
}
function renderSound() { $('#btnSound').classList.toggle('off', !prefs.sound); }
function renderSoloBest() {
  const t = prefs.target || 0, b = store.get('best.' + t, 0);
  $('#soloBest').innerHTML = b ? 'この目標でのベスト：並び<b>' + b + '</b>枚' : 'まだ記録はありません';
}

/* ================================================================ online: host */
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
/* a guest keeps ?room=CODE in the address, so reloading the page goes straight back into the same seat */
function setRoomParam(code) {
  try {
    const u = new URL(location.href);
    if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e) { /* ignore */ }
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
  const L = lobby = { role: 'host', link, code, seats: [{ kind: 'host', nm: name, cid: CID }] };
  link.on('msg', (cid, msg) => onHostMsg(L, cid, msg));
  link.on('leave', (cid) => onGuestGone(L, cid));
  showLobby();
}
function lobbySeats(L) { return L.seats.map((s) => ({ nm: s.nm, kind: s.kind, level: s.level || 0, here: s.here !== false })); }
function pushLobby(L) {
  const seats = lobbySeats(L);
  L.seats.forEach((s, i) => { if (s.kind === 'guest') L.link.send(s.cid, { k: 'lobby', seats, you: i, code: L.code }); });
  if (lobby === L && !match) renderLobby({ seats, you: 0, code: L.code });
}
function onHostMsg(L, cid, msg) {
  if (lobby !== L) return;
  if (msg.k === 'hello') {
    if (msg.v !== N.PROTOCOL) { L.link.send(cid, { k: 'old' }); return; }
    const nm = N.cleanName(msg.nm) || 'ゲスト';
    const m = match && match.mode === 'host' && match.lobby === L && match.alive ? match : null;
    if (m) {
      const p = m.players.findIndex((pl) => pl.kind === 'guest' && pl.cid === cid);
      if (p < 0) { L.link.send(cid, { k: 'busy' }); L.link.drop(cid); return; }
      const pl = m.players[p];
      pl.here = true; pl.sub = false; clearTimeout(m.awayTimer); m.awayTimer = null;
      L.link.send(cid, { k: 'start', view: E.viewFor(m.s, p), meta: metaOf(m), resume: true });
      sendUpdates(m, []);
      toast(esc(pl.nm) + ' さんが戻ってきました', 'me');
      renderAll();
      return;
    }
    const seat = L.seats.find((s) => s.kind === 'guest' && s.cid === cid);
    if (seat) { seat.nm = nm; seat.here = true; }
    else if (L.seats.length >= MAX_SEATS) { L.link.send(cid, { k: 'full' }); L.link.drop(cid); return; }
    else { L.seats.push({ kind: 'guest', nm, cid, here: true }); toast(esc(nm) + ' さんが入室しました', 'me'); sfx.play('turn'); }
    pushLobby(L);
    return;
  }
  if (msg.k === 'act') {
    const m = match;
    if (!m || m.mode !== 'host' || m.lobby !== L || !m.alive) return;
    const p = m.players.findIndex((pl) => pl.kind === 'guest' && pl.cid === cid);
    if (p < 0) return;
    const a = msg.a && typeof msg.a === 'object' ? msg.a : null;
    if (!a || m.s.turn !== p || msg.ply !== m.s.ply || m.players[p].sub) { L.link.send(cid, { k: 'err', err: 'stale', view: E.viewFor(m.s, p), meta: metaOf(m) }); return; }
    const r = E.apply(m.s, { t: a.t, v: a.v, card: a.card, p });
    if (!r.ok) { L.link.send(cid, { k: 'err', err: r.err, view: E.viewFor(m.s, p), meta: metaOf(m) }); return; }
    deliver(m, r.ev);
    return;
  }
  if (msg.k === 'seen') {
    const m = match;
    if (!m || m.mode !== 'host' || m.lobby !== L) return;
    const pl = m.players.find((x) => x.kind === 'guest' && x.cid === cid);
    if (pl && typeof msg.ply === 'number') pl.seen = Math.max(pl.seen || 0, msg.ply);
    return;
  }
  if (msg.k === 'bye') onGuestGone(L, cid);
}
function onGuestGone(L, cid) {
  if (lobby !== L) return;
  const m = match && match.mode === 'host' && match.lobby === L && match.alive ? match : null;
  if (m) {
    const pl = m.players.find((x) => x.kind === 'guest' && x.cid === cid);
    if (pl && pl.here !== false) {
      pl.here = false;
      if (m.s.phase !== 'over') toast(esc(pl.nm) + ' さんの接続が切れました', 'warn', 3200);
      sendUpdates(m, []);
      renderAll(); afterIdle();
    }
    return;
  }
  const i = L.seats.findIndex((s) => s.kind === 'guest' && s.cid === cid);
  if (i > 0) { const nm = L.seats[i].nm; L.seats.splice(i, 1); toast(esc(nm) + ' さんが退出しました', 'warn'); pushLobby(L); }
}
function addCpu(L) {
  if (L.seats.length >= MAX_SEATS) return;
  const used = L.seats.map((s) => s.nm);
  const nm = CPU_NAMES.find((x) => !used.includes(x)) || 'CPU';
  L.seats.push({ kind: 'cpu', nm, level: prefs.level || 2 });
  pushLobby(L);
}
function startHostMatch(L) {
  if (lobby !== L) return;
  const seats = L.seats.slice(0, MAX_SEATS);
  if (seats.length < 2) return;
  const players = seats.map((s) => (s.kind === 'host' ? { nm: s.nm, kind: 'me', cpu: 0 } : s.kind === 'cpu' ? { nm: s.nm, kind: 'cpu', cpu: s.level || 2 } : { nm: s.nm, kind: 'guest', cpu: 0, cid: s.cid, here: true }));
  const s = E.newGame({ n: players.length });
  const m = { mode: 'host', id: ++matchSeq, s, me: 0, players, alive: true, lobby: L, link: L.link };
  beginMatch(m, E.viewFor(s, 0));
  const meta = metaOf(m);
  players.forEach((pl, p) => { if (pl.kind === 'guest') L.link.send(pl.cid, { k: 'start', view: E.viewFor(s, p), meta }); });
}
function hostBackToLobby() {
  const L = lobby, m = match;
  if (!L || L.role !== 'host') return;
  if (m && m.lobby === L) {
    L.seats = [L.seats[0]].concat(m.players.filter((pl, p) => p !== m.me && (pl.kind === 'cpu' || pl.here !== false)).map((pl) => (pl.kind === 'cpu' ? { kind: 'cpu', nm: pl.nm, level: pl.cpu } : { kind: 'guest', nm: pl.nm, cid: pl.cid, here: true })));
  }
  leaveGame();
  showLobby();
}
function showLobby() {
  const L = lobby;
  if (!L) return;
  showScreen('#scrLobby');
  if (L.role === 'host') pushLobby(L);
  else if (L.last) renderLobby(L.last);
}
function renderLobby(d) {
  const L = lobby;
  if (!L) return;
  const host = L.role === 'host';
  $('#lobCode').textContent = d.code || L.code;
  $('#lobNote').textContent = host ? '友だちにこのコードか招待リンクを送ってください。2〜7人で遊べます（CPUも入れられます）。' : 'ホストが始めるのを待っています…';
  $('#lobSeats').innerHTML = d.seats.map((s, i) => '<div class="lseat" style="--pc:' + colorOf(i) + '"><span class="av">' + esc(Array.from(s.nm)[0] || '?') + '</span><span class="nm">' + esc(s.nm) + (i === d.you ? '（あなた）' : '') + '</span>' +
    (host && s.kind === 'cpu' ? '<select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3].map((lv) => '<option value="' + lv + '"' + (lv === s.level ? ' selected' : '') + '>' + LEVEL_NAME[lv] + '</option>').join('') + '</select>'
      : '<span class="who">' + (s.kind === 'host' ? 'ホスト' : s.kind === 'cpu' ? 'CPU・' + LEVEL_NAME[s.level || 2] : 'ゲスト') + '</span>') +
    (host && i > 0 ? '<button class="x" data-rm="' + i + '" aria-label="外す">✕</button>' : '') + '</div>').join('');
  $('#lobAddCpu').hidden = !host || d.seats.length >= MAX_SEATS;
  $('#lobStart').hidden = !host;
  $('#lobStart').disabled = d.seats.length < 2;
  $('#lobInvite').hidden = !host;
  if (host) {
    $('#lobSeats').querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.rm), s = L.seats[i];
      if (!s) return;
      L.seats.splice(i, 1);
      if (s.kind === 'guest') { L.link.send(s.cid, { k: 'kick' }); L.link.drop(s.cid); }
      pushLobby(L);
    });
    $('#lobSeats').querySelectorAll('[data-lv]').forEach((sel) => sel.onchange = () => { const s = L.seats[Number(sel.dataset.lv)]; if (s) { s.level = Number(sel.value); pushLobby(L); } });
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
  renderLobby({ seats: [{ nm: name, kind: 'guest', here: true }], you: 0, code });
  $('#lobNote').textContent = '接続しました。ホストからの返事を待っています…';
}
function onGuestMsg(L, msg) {
  if (lobby !== L) return;
  if (msg.k === 'full') { failGuest(L, 'この部屋はもういっぱいです'); return; }
  if (msg.k === 'busy') { failGuest(L, 'この部屋はいまゲーム中です。終わってからもう一度入ってください'); return; }
  if (msg.k === 'old') { failGuest(L, 'ホストのページと版がちがいます。両方とも再読み込みしてください'); return; }
  if (msg.k === 'kick') { failGuest(L, 'ホストが席を外しました'); return; }
  if (msg.k === 'bye') { onHostGone(L); return; }
  if (msg.k === 'lobby') {
    L.last = { seats: msg.seats, you: msg.you, code: msg.code };
    if (match && match.lobby === L) { leaveGame(); closeLayer(); }
    showScreen('#scrLobby'); renderLobby(L.last);
    return;
  }
  if (msg.k === 'start' && msg.view) {
    const v = msg.view;
    const m = { mode: 'guest', id: ++matchSeq, me: v.me, players: playersFromMeta(msg.meta, v.me), alive: true, lobby: L, link: L.link, waiting: false };
    beginMatch(m, v);
    sawUpTo(m);
    if (msg.resume) toast('ゲームに戻りました', 'me');
    return;
  }
  const m = match;
  if (!m || m.mode !== 'guest' || m.lobby !== L) return;
  if (msg.k === 'upd' && msg.view) {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.meta) m.players = playersFromMeta(msg.meta, m.me);
    enqueue(m, msg.view, Array.isArray(msg.ev) ? msg.ev : []);
    if (!msg.ev || !msg.ev.length) renderAll();
    return;
  }
  if (msg.k === 'err') {
    m.waiting = false; clearTimeout(m.waitTo);
    if (msg.err !== 'stale') toast('その手は打てません', 'warn');
    if (msg.meta) m.players = playersFromMeta(msg.meta, m.me);
    if (msg.view) enqueue(m, msg.view, [], true); else renderAll();
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
  if (match && match.lobby === L && view && view.phase !== 'over') {
    const el = openLayer(sheet('接続が切れました', '<p>ホストとの接続が切れました。</p><button class="btn primary" id="hQuit">タイトルへ</button>'));
    el.querySelector('#hQuit').onclick = () => { closeLayer(); quitToTitle(); };
    return;
  }
  failGuest(L, 'ホストとの接続が切れました');
}

/* ================================================================ wiring and boot */
function segInit(id, cur, fn) {
  const box = $(id);
  box.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(String(cur) === b.dataset.v));
    b.onclick = () => { box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); sfx.play('tap'); fn(b.dataset.v); };
  });
}
function wire() {
  $('#goCpu').onclick = () => { sfx.unlock(); showScreen('#scrCpu'); };
  $('#goSolo').onclick = () => { sfx.unlock(); renderSoloBest(); showScreen('#scrSolo'); };
  $('#goOnline').onclick = () => { sfx.unlock(); resetOnlineUI(); showScreen('#scrOnline'); };
  $('#goRules').onclick = openRules;
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { if (lobby && !match) closeLobby(); resetOnlineUI(); showScreen('#scrTitle'); }; });
  segInit('#segCount', prefs.count, (v) => { prefs.count = Number(v); store.set('count', prefs.count); });
  segInit('#segLevel', prefs.level, (v) => { prefs.level = Number(v); store.set('level', prefs.level); $('#levelNote').textContent = LEVEL_NOTE[prefs.level]; });
  $('#levelNote').textContent = LEVEL_NOTE[prefs.level] || '';
  segInit('#segTarget', prefs.target, (v) => { prefs.target = Number(v); store.set('target', prefs.target); renderSoloBest(); });
  $('#cpuStart').onclick = () => { sfx.unlock(); startCpu(false); firstTips(); };
  $('#soloStart').onclick = () => { sfx.unlock(); startSolo(false); firstTips(); };
  $('#onName').value = prefs.name;
  $('#onCreate').onclick = () => { sfx.unlock(); hostRoom(); };
  $('#onJoin').onclick = () => { sfx.unlock(); joinRoom(); };
  $('#onCode').addEventListener('input', (e) => { e.target.value = N.cleanCode(e.target.value); });
  $('#onCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('#lobAddCpu').onclick = () => { if (lobby && lobby.role === 'host') { sfx.play('tap'); addCpu(lobby); } };
  $('#lobStart').onclick = () => { if (lobby && lobby.role === 'host') { sfx.unlock(); startHostMatch(lobby); } };
  $('#lobLeave').onclick = () => { closeLobby(); resetOnlineUI(); showScreen('#scrOnline'); };
  $('#lobInvite').onclick = async () => {
    if (!lobby) return;
    const url = location.origin + location.pathname + '?room=' + lobby.code;
    try { if (navigator.share) { await navigator.share({ title: 'アッシュク・エイト', text: '部屋コード ' + lobby.code, url }); return; } } catch (e) { /* fall through */ }
    try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました', 'me'); } catch (e) { toast(esc(url), '', 6000); }
  };
  $('#btnMenu').onclick = () => { sfx.unlock(); openMenu(); };
  $('#btnSound').onclick = () => { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); sfx.unlock(); renderSound(); if (prefs.sound) sfx.play('turn'); };
  $('#tRot').onclick = () => { const c = mat.cards.get(mat.sel); if (c) rotateCard(c, 45); };
  $('#tFlip').onclick = () => { const c = mat.cards.get(mat.sel); if (c) flipCard(c); };
  $('#tUp').onclick = () => { const c = mat.cards.get(mat.sel); if (c) { toFront(c); matSave(); sfx.play('tap'); } };
  $('#tDown').onclick = () => { const c = mat.cards.get(mat.sel); if (c) { toBack(c); matSave(); sfx.play('tap'); } };
  matEl().addEventListener('pointerdown', (e) => { if (e.target === matEl()) select(null); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeLayer(); return; }
    if ($('#layer').childElementCount || !match || e.target.closest && e.target.closest('input,select')) return;
    if ((e.key === '0' || e.key === '1') && view && view.phase === 'answer' && myTurn()) { e.preventDefault(); act({ t: 'answer', v: Number(e.key) }); }
  });
  window.addEventListener('pagehide', () => { if (lobby) closeLobby(true); });
  document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true, passive: true });
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  if (window.ResizeObserver) { const ro = new ResizeObserver(onResize); ro.observe(matEl()); ro.observe($('#table')); }
  // logo: 1000 is eight
  const logo = [SAMPLE.w0, SAMPLE.b1, SAMPLE.w1, SAMPLE.b0, SAMPLE.b1, SAMPLE.w0, SAMPLE.w0, SAMPLE.b0];
  $('#logoCards').innerHTML = logo.map((id) => '<span>' + faceSVG(id) + '</span>').join('');
}
function firstTips() {
  if (store.get('seenTips', false)) return;
  store.set('seenTips', true);
  setTimeout(() => toast('ドラッグで移動、タップで選択、もう一度タップで45°回転', '', 5200), 2600);
}
let resizeTo = 0;
function onResize() {
  clearTimeout(resizeTo);
  resizeTo = setTimeout(() => { if (document.body.classList.contains('ingame')) { sizeTable(); matRelayout(); renderAll(); } }, 80);
}
/* piles and the revealed card: as big as the table allows, between the seats and the bottom edge */
function sizeTable() {
  const t = $('#table'), W = t.clientWidth, H = t.clientHeight, seatsH = $('#seats').offsetHeight || 56;
  const room = Math.max(60, H - seatsH - 26 - 30);
  const base = Math.round(clamp(Math.min(W * 0.17, room * 0.62 / 1.4), 40, 112));
  const plane = $('#plane');
  plane.style.setProperty('--pw-mem', base + 'px');
  plane.style.setProperty('--pw-deck', Math.round(base * 0.8) + 'px');
  plane.style.setProperty('--pw-chk', Math.round(base * 0.84) + 'px');
  plane.style.setProperty('--pw-pen', Math.round(base * 0.42) + 'px');
  plane.style.setProperty('--tk', Math.round(base * 0.27) + 'px');
  plane.style.width = Math.round(Math.min(W * 0.94, base * 6.6)) + 'px';
  plane.style.height = Math.round(Math.min(room + 10, base * 1.4 * 1.5)) + 'px';
  const w = Math.round(clamp(Math.min(W * 0.24, room * 0.7 / 1.4, base * 1.45), 50, 150));
  const spot = $('#revealSpot');
  spot.style.width = w + 'px';
  spot.style.top = Math.round(seatsH + 30 + (H - seatsH - 30) * 0.4) + 'px';
  $('#posTag').style.top = (seatsH + 4) + 'px';
  $('#flash').style.top = (seatsH + 28) + 'px';
}
async function boot() {
  wire();
  renderSound();
  try { await Promise.race([Promise.all([document.fonts.load('400 30px "DotGothic16"'), document.fonts.load('700 16px "Zen Kaku Gothic New"')]), sleep(1800)]); } catch (e) { /* fonts are optional */ }
  $('#loader').hidden = true;
  const room = N.cleanCode(params.get('room') || '');
  if (room.length === 4) {
    showScreen('#scrOnline'); $('#onCode').value = room;
    if (prefs.name) joinRoom(room); else { onlineErr('名前を入れて「入る」を押してください'); $('#onName').focus(); }
  } else showScreen('#scrTitle');
  if (TEST) {
    window.__ase = {
      get view() { return view; }, get match() { return match; }, get presenting() { return presenting; }, get queue() { return queue.length; },
      mat, act, myTurn, select,
      top() { return match && match.s && match.s.mem.length ? E.digit(match.s.mem[match.s.mem.length - 1]) : null; },
      startSolo, startCpu
    };
  }
}
boot();

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Lifecycle regression for the WebGL presentation layer (assets/vfx.js).
// Invariants: it never writes to G, every hook it wraps still resolves (deadline, stop, hidden tab,
// effects off, context loss, thrown visual errors), and without WebGL every hook is the original.
const source = fs.readFileSync(new URL('../assets/vfx.js', import.meta.url), 'utf8');
const PROTOCOLS = ['FIRE', 'WAR', 'WATER', 'ICE', 'LIFE', 'PEACE', 'DEATH', 'FEAR', 'DARKNESS', 'CORRUPTION', 'LIGHT', 'CLARITY', 'COURAGE', 'METAL', 'MIRROR', 'SPEED', 'LUCK', 'SPIRIT', 'PSYCHIC', 'CHAOS', 'GRAVITY', 'TIME', 'PLAGUE', 'SMOKE'];
const rect = (x, y, w = 80, h = 110) => ({ left: x - w / 2, top: y - h / 2, width: w, height: h, right: x + w / 2, bottom: y + h / 2 });

function fakeGL(state) {
  const consts = new Map(); let next = 0x8000;
  const constant = k => { if (!consts.has(k)) consts.set(k, next++); return consts.get(k); };
  const ext = new Proxy({}, { get: (o, k) => typeof k !== 'string' ? undefined : /^[A-Z0-9_]+$/.test(k) ? constant(k) : () => { state.draws++; } });
  const fixed = {
    isContextLost: () => state.lost, getError: () => 0, getExtension: () => ext,
    checkFramebufferStatus: () => constant('FRAMEBUFFER_COMPLETE'),
    getShaderParameter: () => true, getProgramParameter: (p, k) => k === constant('ACTIVE_UNIFORMS') ? 0 : true,
    getActiveUniform: () => null, getUniformLocation: () => ({}),
    drawArrays: () => { state.draws++; }, drawArraysInstanced: () => { state.draws++; },
  };
  return new Proxy({}, { get(o, k) {
    if (typeof k !== 'string') return undefined;
    if (k in fixed) return fixed[k];
    if (/^[A-Z0-9_]+$/.test(k)) return constant(k);
    if (k.startsWith('create')) return () => ({ glObject: k });
    return () => {};
  } });
}

function harness({ gl = true, fx = 1, search = '?vfx=force', reducedMotion = false, quality = 'cinema' } = {}) {
  let time = 1000, seq = 0;
  const timers = new Map(), frames = new Map(), docListeners = new Map(), winListeners = new Map(), warnings = [], calls = [];
  const glState = { lost: false, draws: 0, canvas: null };
  const noop = () => {};
  const on = (map, name, fn) => { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); };
  const paint = new Proxy({}, {
    get: (o, k) => k in o ? o[k] : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
      : /^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(k) ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop,
    set: (o, k, v) => (o[k] = v, true) });
  let body = null;
  class ClassList {
    constructor() { this.s = new Set(); }
    add(...c) { c.forEach(x => this.s.add(x)); } remove(...c) { c.forEach(x => this.s.delete(x)); }
    toggle(c, f) { const v = f === undefined ? !this.s.has(c) : !!f; if (v) this.s.add(c); else this.s.delete(c); return v; }
    contains(c) { return this.s.has(c); }
  }
  class Style { setProperty(k, v) { this[k] = v; } getPropertyValue(k) { return this[k] || ''; } removeProperty(k) { delete this[k]; } }
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.id = ''; this.classList = new ClassList(); this.style = new Style(); this.dataset = {}; this.children = []; this.parent = null; this.attrs = {}; this.listeners = new Map(); this.rect = null; this.text = ''; this.width = 300; this.height = 150; }
    get className() { return [...this.classList.s].join(' '); }
    set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get isConnected() { for (let n = this; n; n = n.parent) if (n === body) return true; return false; }
    append(...ns) { for (const n of ns) { if (!n || typeof n !== 'object') continue; if (n.parent) n.remove(); n.parent = this; this.children.push(n); } }
    appendChild(n) { this.append(n); return n; }
    prepend(...ns) { this.append(...ns); }
    remove() { if (!this.parent) return; const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'data-cid') this.dataset.cid = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; if (k === 'data-cid') delete this.dataset.cid; }
    getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, width: 0, height: 0 }; return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height }; }
    get offsetWidth() { return this.rect ? this.rect.width : 0; }
    get offsetHeight() { return this.rect ? this.rect.height : 0; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    querySelectorAll(sel) { return this.lane && sel === '[data-cid]' ? this.lane.filter(el => el.isConnected) : this.sigil && sel === '.cin-cutsigil' ? [this.sigil] : []; }
    cloneNode() { const c = new El(this.tagName); c.className = this.className; c.dataset = { ...this.dataset }; c.attrs = { ...this.attrs }; c.rect = this.rect; return c; }
    closest() { return this.dataset.cid ? this : null; }
    animate() { return { cancel: noop, finish: noop, finished: Promise.resolve() }; }
    addEventListener(n, f) { on(this.listeners, n, f); }
    removeEventListener() {}
    dispatch(n, e = {}) { for (const f of this.listeners.get(n) || []) f({ preventDefault: noop, ...e }); }
    getContext(type) {
      if (type === '2d') return paint;
      if (!gl || (type !== 'webgl2' && type !== 'webgl')) return null;
      glState.canvas = this; return fakeGL(glState);
    }
    set innerHTML(v) { this.text = String(v); } get innerHTML() { return this.text; }
    set textContent(v) { this.text = String(v); } get textContent() { return this.text; }
    focus() {}
  }
  const walk = (root, fn) => { for (const c of root.children) { fn(c); walk(c, fn); } };
  body = new El('body');
  const main = new El('main'); main.id = 'gameMain'; body.append(main);
  const fxLayerEl = new El('div'); body.append(fxLayerEl);
  const cards = new Map(), lanes = [[], [], []];
  const addCard = (id, r, { zone = 'field', line = 0, cls = 'mcard' } = {}) => {
    const el = new El('div'); el.className = cls; el.setAttribute('data-cid', id); el.rect = r; el.zone = zone; main.append(el); cards.set(id, el);
    if (zone === 'field') lanes[line].push(el);
    return el;
  };
  const stacks = [0, 1, 2].map(i => { const s = new El('div'); s.className = 'stack'; s.lane = lanes[i]; return s; });
  const chip = new El('div'); chip.rect = rect(640, 450, 120, 40); main.append(chip);
  const document = {
    body, hidden: false, documentElement: new El('html'),
    createElement: tag => new El(tag),
    addEventListener: (name, fn) => on(docListeners, name, fn),
    elementFromPoint: (x, y) => { for (const el of cards.values()) { const r = el.getBoundingClientRect(); if (el.isConnected && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el; } return null; },
    querySelector(sel) {
      if (sel === '#gameMain') return main;
      const m = /^#gameMain \[data-cid="(.+)"\]$/.exec(sel); if (m) { const el = cards.get(m[1]); return el && el.isConnected ? el : null; }
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      if (sel === '#hand .hfan[data-cid]') return [...cards.values()].filter(el => el.isConnected && el.zone === 'hand');
      if (sel === '#myStacks [data-cid], #oppStacks [data-cid]') return [...cards.values()].filter(el => el.isConnected && el.zone === 'field');
      if (sel === '#myStacks .stack') return stacks;
      if (/^\.[\w-]+$/.test(sel)) { const out = []; walk(body, el => { if (el.classList.contains(sel.slice(1))) out.push(el); }); return out; }
      return [];
    },
  };
  const mediaListeners = [];
  const SET = { fx, shake: true, sfxVol: 0, cinemaQuality: quality };
  const orig = {
    fxLayer: () => fxLayerEl,
    beamFX: (...a) => { calls.push(['beamFX', a[2]]); return Promise.resolve('orig-beam'); },
    fxBurst: (...a) => { calls.push(['fxBurst', a[0]]); },
    fxAtCard: (card, n) => { calls.push(['fxAtCard', n]); },
    flashWhite: () => { calls.push(['flashWhite']); },
    shakeScreen: () => { calls.push(['shakeScreen']); },
    flyCard: o => { calls.push(['flyCard']); },
    slashFX: () => { calls.push(['slashFX']); },
    floatLabel: (r, text) => { calls.push(['floatLabel', text]); },
    deleteCard: async card => { calls.push(['deleteCard', card.id]); return 'orig-delete'; },
    returnCard: async card => { calls.push(['returnCard', card.id]); return 'orig-return'; },
    discardCardsFromHand: async (t, list) => { calls.push(['discard', list.length]); return list.length; },
    announce: async (subject, title) => { calls.push(['announce', title]); return 'orig-announce'; },
    render: () => { calls.push(['render']); },
    saveSettings: () => { calls.push(['saveSettings']); },
  };
  const context = {
    console: { ...console, warn: (...a) => warnings.push(a.join(' ')) },
    innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1,
    navigator: { hardwareConcurrency: 8, deviceMemory: 8 }, screen: { width: 1280, height: 900 }, location: { search },
    localStorage: { getItem: () => null, setItem: noop },
    performance: { now: () => time }, document, CSS: { escape: s => String(s) },
    Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } set src(v) { this._s = v; } get src() { return this._s; } },
    matchMedia: q => ({ matches: /reduce/.test(q) ? reducedMotion : false, addEventListener: (n, f) => mediaListeners.push(f) }),
    addEventListener: (name, fn) => on(winListeners, name, fn),
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: time + Math.max(0, ms || 0) }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++seq; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    queueMicrotask: fn => Promise.resolve().then(fn),
    SET, G: null, elOf: card => cards.get(card.id) || null, uiViewer: () => 0,
    handRect: () => rect(640, 860, 400, 80), pileRect: () => rect(1200, 780, 60, 84), makeArt: () => 'data:,',
    pmeta: p => ({ ac: '#7fd8ff', pop: '#ffffff', pal: ['#050a10', '#13304a', '#2a6a90', '#7fd8ff', '#e8fbff'] }),
    COMPILE_AUDIO: Object.freeze({ sfx: name => calls.push(['sfx', name]), duck: noop }),
    __compilePresentationContext: null,
    ...orig,
  };
  context.window = context;
  vm.createContext(context);
  new vm.Script(source, { filename: 'vfx.js' }).runInContext(context);
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  // advance virtual time in display-frame steps; frames=false simulates a stalled/throttled RAF
  const advance = async (ms, { pump = true } = {}) => {
    const end = time + ms;
    while (time < end) {
      time = Math.min(end, time + 16);
      if (pump) { const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(time); }
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (t.at <= time && timers.has(id)) { timers.delete(id); t.fn(); }
      await settle();
    }
  };
  const fireDoc = name => (docListeners.get(name) || []).forEach(f => f({}));
  return { context, advance, settle, warnings, calls, cards, addCard, glState, chip, fxLayerEl, fireDoc, frames, timers, body, main, orig, now: () => time };
}
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const watch = p => { const s = { done: false, value: undefined, error: null }; p.then(v => { s.done = true; s.value = v; }, e => { s.done = true; s.error = e; }); return s; };
const card = (id, protocol = 'FIRE', value = 3, faceDown = false) => ({ id, protocol, value, faceDown });

/* 1 · without WebGL every hook is the original function */
{
  const h = harness({ gl: false }); const c = h.context, V = c.COMPILE_VFX;
  assert.equal(V.state().webgl, 0); assert.equal(V.active(), false);
  assert.equal(h.body.classList.contains('vfx-on'), false);
  for (const name of Object.keys(h.orig)) assert.notEqual(typeof c[name], 'undefined', name);
  assert.equal(c.fxLayer(), h.fxLayerEl);
  const a = card('n1'); h.addCard('n1', rect(300, 600));
  assert.equal(await c.beamFX(rect(300, 600), rect(900, 300), 'FIRE'), 'orig-beam');
  assert.equal(await c.announce(a, 'FIRE 1', 'text'), 'orig-announce');
  assert.equal(await c.deleteCard(a), 'orig-delete');
  c.fxBurst('FIRE', 40, { x: 1, y: 1 }); c.flashWhite(); c.shakeScreen(); c.slashFX(rect(1, 1)); c.floatLabel(rect(1, 1), '削除'); c.flyCard({ from: rect(1, 1), to: rect(9, 9) }); c.fxAtCard(a, 40);
  assert.deepEqual(h.calls.map(x => x[0]), ['beamFX', 'announce', 'deleteCard', 'fxBurst', 'flashWhite', 'shakeScreen', 'slashFX', 'floatLabel', 'flyCard', 'fxAtCard']);
  assert.equal(await c.COMPILE_VFX.preview('attack', 'FIRE'), false);
  assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
}

/* 2 · with WebGL: every protocol's attack resolves at impact, even when animation frames stall */
{
  const h = harness(); const c = h.context, V = c.COMPILE_VFX;
  assert.equal(V.state().webgl, 2); assert.equal(V.active(), true);
  assert.equal(h.body.classList.contains('vfx-on'), true);
  assert.notEqual(c.fxLayer(), h.fxLayerEl, 'legacy 2D effects are routed to a sink');
  for (const proto of PROTOCOLS) {
    const w = watch(c.beamFX(rect(300, 650), rect(950, 260), proto));
    await h.advance(1200, { pump: false });
    assert.ok(w.done && !w.error, `${proto} attack must resolve without animation frames`);
  }
  for (const proto of PROTOCOLS) {
    const w = watch(c.beamFX(rect(300, 650), rect(950, 260), proto));
    await h.advance(1200);
    assert.ok(w.done && !w.error, `${proto} attack must resolve`);
    await h.advance(2500);
  }
  assert.equal(h.calls.filter(x => x[0] === 'beamFX').length, 0, 'the WebGL layer replaces the 2D beam');
  await h.advance(6000);
  const s = V.state();
  assert.equal(s.running, false, 'render loop idles once everything has faded');
  assert.equal(s.particles + s.shapes + s.ribbons + s.shatters + s.ghosts + s.tickers + s.pending, 0, JSON.stringify(s));
  assert.equal(s.dup, 0, 'never more than one render loop');
  assert.ok(h.glState.draws > 100, 'frames were drawn');
  assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
}

/* 3 · hooks keep their results; cast and compile sequences hand control back to the rules engine */
{
  const h = harness(); const c = h.context;
  const G = freeze({ turn: 4, current: 0, first: 0, winner: null, players: [
    { name: 'YOU', protocols: [{ name: 'FIRE', compiled: false }], hand: [card('h1', 'WATER', 2)], deck: [], discard: [], lines: [[card('f1', 'FIRE', 3)], [], []] },
    { name: 'CPU', protocols: [{ name: 'DEATH', compiled: false }], hand: [], deck: [], discard: [], lines: [[card('o1', 'DEATH', 4, true)], [], []] }] });
  c.G = G; const before = JSON.stringify(G);
  h.addCard('f1', rect(400, 600)); h.addCard('o1', rect(400, 300)); h.addCard('h1', rect(640, 860), { zone: 'hand', cls: 'hfan' });
  c.render(); await h.advance(50);
  // cast: the original announce runs once the aura has played
  const ann = watch(c.announce(G.players[0].lines[0][0], 'FIRE 3', 'text', 'プレイ効果'));
  await h.advance(900);
  assert.ok(ann.done && ann.value === 'orig-announce', 'cast resolves with the original announce result');
  // destroy: attack + delete keep their order and results
  const atk = watch(c.beamFX(rect(400, 600), rect(400, 300), 'FIRE'));
  await h.advance(900); assert.ok(atk.done);
  const del = watch(c.deleteCard(G.players[1].lines[0][0]));
  await h.advance(50); assert.equal(del.value, 'orig-delete');
  // compile set piece: pre-roll, then the original gold announce exactly once
  c.__compilePresentationContext = { target: h.chip, line: 0, protocol: 'FIRE', tier: 2 };
  const n0 = h.calls.filter(x => x[0] === 'announce').length;
  const cmp = watch(c.announce('FIRE', 'COMPILE', '', 'コンパイル', 'gold'));
  await h.advance(2600);
  assert.ok(cmp.done && cmp.value === 'orig-announce', 'compile resolves with the original announce result');
  assert.equal(h.calls.filter(x => x[0] === 'announce').length - n0, 1);
  c.__compilePresentationContext = null;
  // discard / return / draw paths with a frozen state
  assert.equal(await c.discardCardsFromHand(0, [G.players[0].hand[0]]), 1);
  assert.equal(await c.returnCard(G.players[0].lines[0][0]), 'orig-return');
  c.fxAtCard(G.players[0].lines[0][0], 40); c.fxAtCard(G.players[0].lines[0][0], 28); c.render();
  await h.advance(4000);
  assert.equal(JSON.stringify(G), before, 'presentation never mutates G');
  assert.equal(h.cards.get('f1').style.visibility || '', '', 'cards hidden during a flight are revealed again');
  assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
}

/* 4 · a hidden tab releases every wait at once and hands the hooks back */
{
  const h = harness(); const c = h.context, V = c.COMPILE_VFX;
  c.__compilePresentationContext = { target: h.chip, line: 0, protocol: 'LIGHT', tier: 1 };
  const cmp = watch(c.announce('LIGHT', 'COMPILE', '', 'コンパイル', 'gold'));
  const atk = watch(c.beamFX(rect(300, 650), rect(950, 260), 'GRAVITY'));
  await h.advance(200);
  c.document.hidden = true; h.fireDoc('visibilitychange');
  await h.advance(20, { pump: false });
  assert.ok(atk.done, 'attack released by the hidden tab');
  assert.ok(cmp.done && cmp.value === 'orig-announce', 'compile released by the hidden tab');
  assert.equal(V.active(), false); assert.equal(V.state().pending, 0);
  assert.equal(h.body.classList.contains('vfx-on'), false);
  assert.equal(await c.beamFX(rect(1, 1), rect(9, 9), 'FIRE'), 'orig-beam', 'hidden: original hook');
  c.document.hidden = false; h.fireDoc('visibilitychange');
  assert.equal(V.active(), true); assert.equal(h.body.classList.contains('vfx-on'), true);
  assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
}

/* 5 · turning effects off, losing the GL context or COMPILE_VFX.stop() all release pending work */
{
  const h = harness(); const c = h.context, V = c.COMPILE_VFX;
  let atk = watch(c.beamFX(rect(300, 650), rect(950, 260), 'TIME'));
  await h.advance(100); V.stop(); await h.settle();
  assert.ok(atk.done, 'stop() releases the attack');
  atk = watch(c.beamFX(rect(300, 650), rect(950, 260), 'ICE'));
  await h.advance(100);
  c.SET.fx = 0; c.saveSettings(); await h.settle();
  assert.ok(atk.done, 'effects off releases the attack');
  assert.equal(V.active(), false); assert.equal(h.calls.at(-1)[0], 'saveSettings');
  assert.equal(await c.beamFX(rect(1, 1), rect(9, 9), 'FIRE'), 'orig-beam');
  c.SET.fx = 1; c.saveSettings();
  assert.equal(V.active(), true);
  c.SET.cinemaQuality = 'classic'; c.saveSettings();
  assert.equal(V.active(), false, 'classic presentation hands every hook back');
  assert.equal(h.body.classList.contains('vfx-on'), false);
  c.SET.cinemaQuality = 'light'; c.saveSettings();
  assert.equal(V.active(), true); assert.equal(V.state().tier, 'low', 'light quality caps the tier');
  c.SET.cinemaQuality = 'cinema'; c.saveSettings();
  assert.notEqual(V.state().tier, 'low');
  atk = watch(c.beamFX(rect(300, 650), rect(950, 260), 'CHAOS'));
  await h.advance(100);
  h.glState.lost = true; h.glState.canvas.dispatch('webglcontextlost'); await h.settle();
  assert.ok(atk.done, 'context loss releases the attack');
  assert.equal(V.active(), false);
  assert.equal(await c.beamFX(rect(1, 1), rect(9, 9), 'FIRE'), 'orig-beam', 'lost context: original hook');
  h.glState.lost = false; h.glState.canvas.dispatch('webglcontextrestored');
  assert.equal(V.active(), true, 'restored context resumes the layer');
  assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
}

/* 6 · errors inside presentation code never reject a rules await */
{
  const h = harness(); const c = h.context;
  const bad = h.addCard('x2', rect(500, 500)); bad.getBoundingClientRect = () => { throw new Error('layout'); };
  assert.equal(await c.announce(card('x2'), 'FIRE 2', 'text'), 'orig-announce', 'a throwing element inside the cast aura');
  h.addCard('x1', rect(500, 500));
  c.elOf = () => { throw new Error('boom'); };
  assert.equal(await c.announce(card('x1'), 'FIRE 0', 'text'), 'orig-announce');
  assert.equal(await c.deleteCard(card('x1')), 'orig-delete');
  assert.equal(await c.returnCard(card('x1')), 'orig-return');
  c.fxAtCard(card('x1'), 40);
  c.__compilePresentationContext = { target: null, line: 9, protocol: 'NOPE', tier: 9 };
  const cmp = watch(c.announce('NOPE', 'COMPILE', '', 'コンパイル', 'gold'));
  await h.advance(2600);
  assert.ok(cmp.done && cmp.value === 'orig-announce');
  c.__compilePresentationContext = null;
  const atk = watch(c.beamFX(rect(300, 650), rect(950, 260), undefined));
  await h.advance(1200); assert.ok(atk.done, 'unknown protocol still resolves');
}

/* 7 · reduced motion and ?vfx=off keep the original presentation */
for (const opts of [{ reducedMotion: true }, { search: '?vfx=off' }, { fx: 0 }, { quality: 'classic' }]) {
  const h = harness(opts); const c = h.context;
  assert.equal(c.COMPILE_VFX.active(), false, JSON.stringify(opts));
  assert.equal(await c.beamFX(rect(1, 1), rect(9, 9), 'FIRE'), 'orig-beam');
  assert.equal(c.fxLayer(), h.fxLayerEl);
}

console.log('vfx regression: ok');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
const rules = fs.readFileSync(new URL('../assets/arena-core.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../assets/arena.js', import.meta.url), 'utf8').replace('ensureRoot(); install();', 'ensureRoot(); install(); globalThis.testArena={A,action,accept,attachMatch,hub,onRender,root:()=>root};');
const peers = new Map(); let serial = 0;
class Connection extends EventEmitter {
  constructor(metadata) { super(); this.metadata = metadata; this.open = false; }
  send(data) { if (this.open) queueMicrotask(() => this.other.emit('data', data)); }
  close() { if (!this.open) return; this.open = false; this.other.open = false; this.emit('close'); this.other.emit('close'); }
}
class Peer extends EventEmitter {
  constructor(id = 'guest-' + ++serial) { super(); this.id = id; peers.set(id, this); queueMicrotask(() => this.emit('open', id)); }
  connect(id, opts) {
    const out = new Connection(opts.metadata), inc = new Connection(opts.metadata); out.other = inc; inc.other = out;
    queueMicrotask(() => { const host = peers.get(id); if (!host) { out.emit('error', Error('missing host')); return; }
      // Some transports expose an already-open incoming data channel.
      out.open = inc.open = true; host.emit('connection', inc); inc.emit('open'); out.emit('open'); });
    return out;
  }
  destroy() { this.destroyed = true; peers.delete(this.id); }
  reconnect() {}
}
function client() {
  const ids = new Map(), storage = new Map(), session = new Map(); let lastToast = '';
  class El {
    constructor(tag) { this.tagName = tag; this.hidden = false; this.value = ''; this.dataset = {}; this.classList = { add() {}, remove() {}, contains: () => false }; this.listeners = {}; this._html = ''; }
    set id(id) { this._id = id; ids.set(id, this); } get id() { return this._id; }
    set innerHTML(value) {
      this._html = value; this.names = [];
      for (const match of value.matchAll(/<(input|select|div|section)[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const el = new El(match[1]); el.id = match[2]; el.value = el.id.includes('Mode') ? 'league' : el.id === 'arenaCount' ? '3' : '';
      }
      for (const match of value.matchAll(/<input data-name[^>]*>/g)) { const el = new El('input'); el.value = (match[0].match(/value="([^"]*)"/) || [,''])[1]; this.names.push(el); }
    }
    get innerHTML() { return this._html; }
    append(el) { if (el.id) ids.set(el.id, el); } insertBefore(el) { this.append(el); }
    setAttribute() {} addEventListener(t, f) { this.listeners[t] = f; }
    querySelector(s) { return s.startsWith('#') ? ids.get(s.slice(1)) || null : null; }
    querySelectorAll(s) { if (s === '[data-name]') return ids.get('arenaNames')?.names || []; return []; }
    click() { this.onclick?.(); }
    remove() { if (this.id) ids.delete(this.id); }
  }
  for (const id of ['setup', 'handoff', 'name0', 'name1']) { const e = new El('div'); e.id = id; }
  const modes = new El('div'), body = new El('body');
  const document = { body, createElement: tag => new El(tag), getElementById: id => ids.get(id),
    querySelector: s => s === '.cin-modes' ? modes : s.startsWith('#') ? ids.get(s.slice(1)) || null : null };
  const store = map => ({ getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) });
  const ctx = { console, document, localStorage: store(storage), sessionStorage: store(session), Peer, G: null, CPU: { on: false }, _nsT: 0,
    NET_PROTOCOL: 4, NET: { clientId: 'NORMAL', pending: {}, role: 0 }, draft: { cardSet: 'set1', controlEnabled: true }, PROTOCOLS: ['FIRE', 'WATER', 'METAL', 'DEATH', 'LIGHT', 'LIFE'],
    esc: s => String(s).replace(/</g, '&lt;'), normalizeCardSet: s => s, readControlSetting: () => true,
    netRandomToken: n => (++serial).toString(32).toUpperCase().replace(/0|1/g, 'Z').padStart(n, 'A').slice(-n),
    netRoomCode: () => 'ABCDEFG', netNormalizeRoomCode: s => s.toUpperCase(), netValidRoomCode: s => s.length === 7,
    loadPeerJS: async () => {}, netTimed: p => p, netClearListeners() {}, netCopyRoomCode: async () => {}, showNetWait() {},
    netGameRevision: g => g?._netRevision || 0, netValidGame: g => Array.isArray(g.players) && g.players.length === 2,
    netStateSummary: g => ({ hasGame: !!g, turn: g?.turn, phase: g?.phase, current: g?.current, revision: g?._netRevision || 0, stable: true, busy: false }),
    newGame: () => { ctx.G = null; ctx.NET.on = false; }, renderWelcome() {}, render() {}, renderDraft() {}, netRenderDraftStage() {}, finishSetup() {},
    startDraft: () => { ctx.drafts++; }, netStartDraft: () => { ctx.drafts++; }, drafts: 0,
    netResetDraftSync() {}, netHelloPayload: () => ({ t: 'hello', sync: { hasGame: !!ctx.G } }), loadSave: () => null, showHandoff() {},
    showModal: async () => 'view', closeModal() {}, confirmAsk: async () => true, toast: msg => lastToast = msg,
    setTimeout, clearTimeout, clearInterval, Blob, URL, stackTotal: () => 2, pmeta: p => ({ ac: '#88ccff', k: p }),
    netReceive: async payload => { const e = JSON.parse(payload); ctx.received.push(e); if (e.body.t === 'state') ctx.G = e.body.G; }, received: [] };
  ctx.netSend = m => {
    const seq = ++serial, env = { v: 4, id: ctx.NET.clientId + '-' + seq, seq, fromClient: ctx.NET.clientId, fromRole: ctx.NET.role, fromUid: ctx.NET.uid, body: m };
    ctx.NET.conn.send(JSON.stringify(env));
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(rules, ctx); vm.runInContext(source, ctx);
  return { ctx, ids, test: ctx.testArena, toast: () => lastToast };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const host = client(), clients = [host, client(), client(), client()];
try {
  host.ctx.COMPILE_ARENA.open(); host.ids.get('arenaMyName').value = 'Alice'; await host.test.action('host'); await tick();
  for (let i = 1; i < clients.length; i++) {
    const c = clients[i]; c.ctx.COMPILE_ARENA.open(); c.ids.get('arenaMyName').value = ['Alice', 'Bob', 'Carol', 'Dave'][i]; c.ids.get('arenaCode').value = 'A-ABCDEFG';
    await c.test.action('join'); await tick();
  }
  assert.equal(host.test.A.state.players.length, 4); assert(clients.every(c => c.test.A.connection === 'online'));
  await host.test.action('launch'); await tick();
  const ready = host.ctx.COMPILE_ARENA_RULES.ready(host.test.A.state); assert.equal(ready.length, 2);
  for (const m of ready) {
    const a = clients.find(c => c.test.A.me === m.a), b = clients.find(c => c.test.A.me === m.b);
    await a.test.action('play', m.id); await tick();
    assert.equal(a.test.A.active, m.id); assert.equal(b.test.A.active, m.id);
    assert.equal(a.ctx.NET.role, 0); assert.equal(b.ctx.NET.role, 1); assert.equal(a.ctx.drafts, 1, 'draft begins once both participants are ready');
  }
  assert.equal(host.test.A.state.matches.filter(m => m.status === 'live').length, 2, 'independent matches run concurrently');
  const first = ready[0], left = clients.find(c => c.test.A.me === first.a), right = clients.find(c => c.test.A.me === first.b);
  const g = { turn: 20, current: 0, phase: 'gameover', winner: 0, _netRevision: 1, control: null,
    players: ['Alice', 'Dave'].map((name, i) => ({ name, protocols: ['FIRE', 'WATER', 'METAL'].map((name, j) => ({ name, compiled: i === 0 || j === 0 })),
      hand: [{ id: 'SECRET' }], deck: [{ id: 'SECRET-DECK' }], discard: [], lines: [[{ id: 'SECRET-HIDDEN', protocol: 'FIRE', value: 6, faceDown: true }], [], []] })) };
  left.ctx.netSend({ t: 'state', G: g }); await tick();
  assert.equal(host.test.A.state.matches.find(m => m.id === first.id).status, 'done'); assert.equal(right.ctx.G.winner, 0);
  const other = ready[1], outsiders = clients.filter(c => ![first.a, first.b].includes(c.test.A.me));
  assert(outsiders.every(c => !c.ctx.received.some(e => e.body.G?.winner === 0)), 'private game data cannot reach unrelated players');
  left.test.A.active = first.id; left.ctx.G = g; left.test.onRender(); await tick();
  const boards = clients[3].ctx.COMPILE_ARENA.publicBoards();
  assert(!JSON.stringify(boards).includes('SECRET'), 'spectator transport cannot leak card identities');
  // A disconnected player rejoins the same match without replaying the draft.
  const participant = clients.find(c => c.test.A.me === other.b), starter = clients.find(c => c.test.A.me === other.a);
  const live = JSON.parse(JSON.stringify(g)); live.winner = null; live.phase = 'action'; live._netRevision = 2;
  starter.ctx.netSend({ t: 'state', G: live }); await tick();
  participant.test.A.active = null; participant.ctx.G = null; participant.test.attachMatch(other); await tick();
  assert.equal(participant.ctx.G.turn, 20); assert.equal(starter.ctx.drafts, 1, 'rejoin must not restart the draft');
  // Ordinary game network identity must be restored on leaving the competition.
  await host.test.action('leave'); assert.equal(host.ctx.NET.clientId, 'NORMAL');
  console.log('Arena integration: four joins, concurrent matches, role routing, results, spectator privacy, reconnect and cleanup passed');
} finally {
  for (const c of clients) { c.test.A.running = false; await c.test.action('leave'); }
}

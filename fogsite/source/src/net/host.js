// ─────────────────────────────────────────────────────────────
//  HostSession — owns the authoritative game state on the host device.
//  Clients: 'local' (UI on this device), 'remote' (over a transport), 'cpu'.
// ─────────────────────────────────────────────────────────────
import * as R from '../core/rules.js';
import { snapshotFor } from '../core/view.js';
import { PROTOCOL } from '../core/constants.js';
import { ExplorerAgent } from '../ai/explorerAI.js';
import { RuinsAgent } from '../ai/ruinsAI.js';
import { verifyCommit } from '../util/crypto.js';
import { store, KEYS } from '../util/storage.js';

const HEARTBEAT_TIMEOUT = 16000;

export class HostSession {
  constructor(state, { speed = 1, persist = true, onError = null } = {}) {
    this.state = state;
    this.speed = speed;
    this.persist = persist;
    this.onError = onError || ((e) => console.warn('[host]', e));
    this.outlets = new Map();     // clientId -> (msg) => void
    this.lastSeen = new Map();    // clientId -> ts
    this.agents = new Map();      // clientId -> { agent, timer, decided }
    this.pendingReveals = new Map(); // eid -> { ownerClientId, round, purpose, sentAt }
    this.transport = null;
    this.closed = false;
    this.broadcastQueued = false;
    this.saveTimer = 0;
    this.syncAgents();
    this.tickTimer = setInterval(() => this.tick(), 500);
  }

  static restore(roomCode) {
    const st = store.get(KEYS.host(roomCode));
    if (!st || st.protocol !== PROTOCOL) return null;
    return st;
  }

  attachTransport(transport) {
    this.transport = transport;
    transport.onMessage = (cid, msg) => this.receive(cid, msg, 'remote');
    transport.onLeave = (cid) => { if (this.outlets.get(cid)?.remote) { this.outlets.delete(cid); if (R.setSeatConnected(this.state, cid, false)) this.changed(); } };
  }

  // Local UI on the host device.
  connectLocal(clientId, deliver) {
    const out = (msg) => queueMicrotask(() => deliver(msg));
    out.local = true;
    this.outlets.set(clientId, out);
    this.lastSeen.set(clientId, Date.now());
    this.sendSnapshot(clientId);
    return (msg) => this.receive(clientId, msg, 'local');
  }

  syncAgents() {
    for (const seat of this.state.seats) {
      if (!seat.cpu || this.agents.has(seat.clientId)) continue;
      const agent = seat.role === 'ruins'
        ? new RuinsAgent({ clientId: seat.clientId, level: seat.cpu })
        : new ExplorerAgent({ clientId: seat.clientId, level: seat.cpu });
      this.agents.set(seat.clientId, { agent, timer: 0, decided: null });
    }
    for (const cid of [...this.agents.keys()]) if (!R.seatOf(this.state, cid)) { clearTimeout(this.agents.get(cid).timer); this.agents.delete(cid); }
  }

  // ───────── incoming ─────────
  receive(cid, msg, via) {
    if (this.closed || !msg || typeof msg !== 'object') return;
    this.lastSeen.set(cid, Date.now());
    try {
      switch (msg.t) {
        case 'hello': return this.onHello(cid, msg, via);
        case 'act': return this.onAct(cid, msg);
        case 'reveal': return void this.onReveal(cid, msg);
        case 'ping': this.send(cid, { t: 'pong', ts: msg.ts }); if (R.setSeatConnected(this.state, cid, true)) this.changed(); return;
        case 'sync': return this.sendSnapshot(cid);
        default: return;
      }
    } catch (e) { this.onError(e); }
  }

  onHello(cid, msg, via) {
    if (msg.proto !== PROTOCOL) { this.send(cid, { t: 'fatal', text: 'ゲームのバージョンが違います。ページを再読み込みしてください。' }, via); return; }
    if (via === 'remote') {
      const out = (m) => this.transport?.send(cid, m);
      out.remote = true;
      this.outlets.set(cid, out);
    }
    try {
      R.joinRoom(this.state, cid, msg.name);
    } catch (e) {
      this.send(cid, { t: 'fatal', text: e.message });
      return;
    }
    this.changed();
    // re-send any outstanding reveal requests for this player
    for (const [eid, p] of this.pendingReveals) if (p.ownerClientId === cid) this.send(cid, { t: 'revealReq', eid, round: p.round, purpose: p.purpose });
  }

  onAct(cid, msg) {
    const a = msg.a || {};
    try {
      const res = R.applyAction(this.state, cid, a);
      this.afterAction(a, res);
      this.send(cid, { t: 'ack', id: msg.id, ok: true });
    } catch (e) {
      this.send(cid, { t: 'ack', id: msg.id, ok: false, err: e?.message || String(e) });
      if (!(e instanceof R.RuleError)) this.onError(e);
    }
    this.changed();
  }

  afterAction(a, res) {
    if (a.type === 'beginSetup' || a.type === 'addCpu' || a.type === 'kick' || a.type === 'rematch') this.syncAgents();
    if (res?.reveal) this.requestReveal(res.reveal);
    if (res?.reveals) for (const r of res.reveals) this.requestReveal(r);
  }

  requestReveal({ explorerId, ownerClientId, purpose }) {
    const round = this.state.round;
    const ag = this.agents.get(ownerClientId);
    if (ag) {
      const choice = ag.agent.reveal(explorerId, round);
      setTimeout(() => {
        try { R.applyReveal(this.state, explorerId, choice); } catch (e) { this.onError(e); }
        this.changed();
      }, Math.round(350 * this.speed));
      return;
    }
    this.pendingReveals.set(explorerId, { ownerClientId, round, purpose, sentAt: Date.now() });
    this.send(ownerClientId, { t: 'revealReq', eid: explorerId, round, purpose });
  }

  async onReveal(cid, msg) {
    const e = this.state.explorers[msg.eid];
    const p = this.pendingReveals.get(msg.eid);
    if (!e || e.ownerClientId !== cid) return;
    if (msg.round !== this.state.round || !e.predictionCommit) return;
    const ok = await verifyCommit(this.state.roomCode, msg.round, msg.eid, msg.choice, msg.nonce, e.predictionCommit);
    if (!ok) { this.send(cid, { t: 'notice', kind: 'error', text: '行動予測の照合に失敗しました。' }); return; }
    if (p) this.pendingReveals.delete(msg.eid);
    try { R.applyReveal(this.state, msg.eid, msg.choice); } catch (err) { this.send(cid, { t: 'notice', kind: 'error', text: err.message }); }
    this.changed();
  }

  // Ruins player fallback when an explorer's device cannot answer (lost connection / storage).
  forceReveal(eid, choice) {
    this.pendingReveals.delete(eid);
    R.applyReveal(this.state, eid, choice);
    R.addLog(this.state, `${this.state.explorers[eid]?.label}の予測は遺跡役が手動で公開した。`, 'warn');
    this.changed();
  }

  // ───────── outgoing ─────────
  send(cid, msg) {
    const out = this.outlets.get(cid);
    if (out) { try { out(msg); } catch (e) { this.onError(e); } }
  }
  sendSnapshot(cid) { this.send(cid, { t: 'snap', s: snapshotFor(this.state, cid) }); }

  changed() {
    if (this.broadcastQueued || this.closed) return;
    this.broadcastQueued = true;
    setTimeout(() => {
      this.broadcastQueued = false;
      if (this.closed) return;
      for (const cid of this.outlets.keys()) this.sendSnapshot(cid);
      this.saveSoon();
      this.scheduleAgents();
    }, 0);
  }

  saveSoon() {
    if (!this.persist) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => store.set(KEYS.host(this.state.roomCode), this.state), 250);
  }

  // ───────── CPU agents ─────────
  scheduleAgents() {
    if (this.state.stage === 'gameover') return;
    for (const [cid, slot] of this.agents) {
      if (slot.timer) continue;
      let d;
      try { d = slot.agent.decide(snapshotFor(this.state, cid)); } catch (e) { this.onError(e); continue; }
      if (!d) continue;
      slot.decided = { rev: this.state.revision, action: d.action };
      slot.timer = setTimeout(() => this.fireAgent(cid), Math.max(0, Math.round((d.delay || 0) * this.speed)));
    }
  }

  fireAgent(cid) {
    const slot = this.agents.get(cid);
    if (!slot || this.closed) return;
    slot.timer = 0;
    let action = slot.decided?.action;
    if (slot.decided?.rev !== this.state.revision) {
      try { action = slot.agent.decide(snapshotFor(this.state, cid))?.action; } catch (e) { this.onError(e); action = null; }
    }
    slot.decided = null;
    if (action) {
      try {
        const res = R.applyAction(this.state, cid, action);
        this.afterAction(action, res);
      } catch (e) {
        if (!(e instanceof R.RuleError)) this.onError(e);
        else slot.errors = (slot.errors || 0) + 1;
      }
      this.changed();
    } else this.scheduleAgents();
  }

  // ───────── housekeeping ─────────
  tick() {
    if (this.closed) return;
    const now = Date.now();
    let dirty = false;
    if (R.autoAssignTurn(this.state, now)) dirty = true;
    if (this.state.pendingEncounters?.length && R.expireEncounters(this.state, now)) dirty = true;
    for (const [cid, out] of this.outlets) {
      if (!out.remote) continue;
      if (now - (this.lastSeen.get(cid) || 0) > HEARTBEAT_TIMEOUT && R.setSeatConnected(this.state, cid, false)) dirty = true;
    }
    if (dirty) this.changed();
    else if ([...this.agents.values()].some(s => !s.timer)) this.scheduleAgents();
  }

  close() {
    this.closed = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.saveTimer);
    for (const s of this.agents.values()) clearTimeout(s.timer);
    try { this.transport?.close(); } catch { /* ignore */ }
  }
}

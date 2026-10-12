// ─────────────────────────────────────────────────────────────
//  ClientController — one human player's connection to the host
//  (in-process when this device is the host, otherwise over a transport).
// ─────────────────────────────────────────────────────────────
import { PROTOCOL } from '../core/constants.js';
import { makeCommit } from '../util/crypto.js';
import { store, KEYS } from '../util/storage.js';

let seq = 0;

export class ClientController {
  constructor({ clientId, name }) {
    this.clientId = clientId;
    this.name = name;
    this.snap = null;
    this.post = null;
    this.pending = new Map();
    this.listeners = new Set();
    this.lastMsgAt = Date.now();
    this.pingTimer = 0;
    this.transport = null;
    this.status = { state: 'connecting', text: '接続中…' };
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) { try { fn(type, data); } catch (e) { console.error(e); } } }

  attachLocal(host) {
    this.post = host.connectLocal(this.clientId, (m) => this.onMsg(m));
    this.setStatus('local', 'この端末がホスト');
    this.hello();
  }

  attachRemote(transport) {
    this.transport = transport;
    transport.onMessage = (m) => this.onMsg(m);
    transport.onStatus = (st) => {
      this.setStatus(st.state, st.text);
      if (st.state === 'open') this.hello();
    };
    this.post = (m) => transport.send(m);
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.transport) return;
      this.post({ t: 'ping', ts: Date.now() });
      if (Date.now() - this.lastMsgAt > 13000 && this.status.state === 'open') {
        this.setStatus('reconnecting', '再接続中…');
        this.transport.reconnect?.();
      }
    }, 4000);
  }

  setStatus(state, text) { this.status = { state, text }; this.emit('status', this.status); }

  hello() { this.post?.({ t: 'hello', cid: this.clientId, name: this.name, proto: PROTOCOL }); }

  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.lastMsgAt = Date.now();
    if (this.status.state === 'reconnecting') this.setStatus('open', '接続中');
    switch (m.t) {
      case 'snap': {
        if (this.snap && m.s.roomCode === this.snap.roomCode && m.s.revision < this.snap.revision) return;
        const prev = this.snap;
        this.snap = m.s;
        this.emit('snap', { prev, next: m.s });
        return;
      }
      case 'ack': {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id); clearTimeout(p.timer);
        if (m.ok) p.resolve(true); else p.reject(new Error(m.err || '操作できませんでした。'));
        return;
      }
      case 'revealReq': return void this.reveal(m.eid, m.round, m.purpose);
      case 'notice': return this.emit('notice', m);
      case 'fatal': return this.emit('fatal', m);
      case 'pong': return;
      default: return;
    }
  }

  act(action) {
    if (!this.post) return Promise.reject(new Error('接続されていません。'));
    const id = `${this.clientId.slice(0, 4)}${(++seq).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.post?.({ t: 'sync' });
        reject(new Error('通信の応答がありません。もう一度お試しください。'));
      }, 8000);
      this.pending.set(id, { resolve, reject, timer });
      this.post({ t: 'act', id, a: action });
    });
  }

  async predict(eid, choice) {
    const room = this.snap.roomCode, round = this.snap.round;
    const c = await makeCommit(room, round, eid, choice);
    store.set(KEYS.secret(room, round, eid), { choice: c.choice, nonce: c.nonce, commit: c.commit });
    return this.act({ type: 'predict', eid, commit: c.commit });
  }

  async reveal(eid, round, purpose) {
    const room = this.snap?.roomCode;
    const sec = room ? store.get(KEYS.secret(room, round, eid)) : null;
    this.emit('revealReq', { eid, round, purpose, missing: !sec });
    if (!sec) return;
    // tiny pause so the "attack declared" moment can breathe on every screen
    setTimeout(() => this.post?.({ t: 'reveal', eid, round, choice: sec.choice, nonce: sec.nonce }), purpose === 'attack' ? 900 : 250);
  }

  close() {
    clearInterval(this.pingTimer);
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    try { this.transport?.close(); } catch { /* ignore */ }
    this.transport = null;
    this.post = null;
  }
}

// ─────────────────────────────────────────────────────────────
//  Transports: PeerJS (WebRTC, default) and BroadcastChannel (same-browser tabs,
//  used for testing with ?net=local).
// ─────────────────────────────────────────────────────────────
import Peer from 'peerjs';

export const peerIdFor = (code) => `mistmaze3-${String(code).toLowerCase()}-host`;

function peerOptions() {
  const q = new URLSearchParams(globalThis.location?.search || '');
  const o = { debug: 1 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport') || 9000);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') === '1';
  }
  return o;
}

export function transportKind() {
  const q = new URLSearchParams(globalThis.location?.search || '');
  return q.get('net') === 'local' ? 'local' : 'peer';
}

// ───────── PeerJS host ─────────
export class PeerHostTransport {
  constructor(code) {
    this.code = code;
    this.peer = null;
    this.conns = new Map(); // cid -> conn
    this.onMessage = () => {};
    this.onLeave = () => {};
    this.onStatus = () => {};
    this.closed = false;
    this.retry = 0;
  }
  start() {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerIdFor(this.code), peerOptions());
      this.peer = peer;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('通信サーバーに接続できませんでした。電波の良い場所で再度お試しください。')); } }, 15000);
      peer.on('open', () => {
        this.retry = 0;
        this.onStatus({ state: 'open', text: 'オンライン' });
        if (!settled) { settled = true; clearTimeout(timer); resolve(); }
      });
      peer.on('connection', (conn) => this.attach(conn));
      peer.on('disconnected', () => {
        if (this.closed) return;
        this.onStatus({ state: 'reconnecting', text: '通信サーバーに再接続中…' });
        setTimeout(() => { try { if (!this.closed && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch { /* ignore */ } }, Math.min(8000, 1000 * 2 ** this.retry++));
      });
      peer.on('error', (err) => {
        if (err?.type === 'unavailable-id') {
          if (!settled) { settled = true; clearTimeout(timer); reject(new Error('このルームコードは使用中です。別の部屋を作ってください。')); }
          return;
        }
        if (!settled && ['browser-incompatible', 'invalid-id', 'ssl-unavailable', 'server-error', 'socket-error', 'network'].includes(err?.type)) {
          settled = true; clearTimeout(timer);
          reject(new Error(`通信を開始できません（${err.type}）`));
          return;
        }
        this.onStatus({ state: 'warn', text: `通信エラー（${err?.type || 'unknown'}）` });
      });
    });
  }
  attach(conn) {
    let cid = null;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello' && typeof msg.cid === 'string' && msg.cid.length >= 8) {
        if (cid && cid !== msg.cid) return;
        cid = msg.cid;
        const old = this.conns.get(cid);
        if (old && old !== conn) { try { old.close(); } catch { /* ignore */ } }
        this.conns.set(cid, conn);
      }
      if (!cid) return;
      this.onMessage(cid, msg);
    });
    conn.on('close', () => { if (cid && this.conns.get(cid) === conn) { this.conns.delete(cid); this.onLeave(cid); } });
    conn.on('error', () => { /* close follows */ });
  }
  send(cid, msg) {
    const c = this.conns.get(cid);
    if (c?.open) { try { c.send(msg); } catch { /* ignore */ } }
  }
  close() {
    this.closed = true;
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}

// ───────── PeerJS guest ─────────
export class PeerGuestTransport {
  constructor(code) {
    this.code = code;
    this.peer = null;
    this.conn = null;
    this.queue = [];
    this.onMessage = () => {};
    this.onStatus = () => {};
    this.closed = false;
    this.retry = 0;
    this.reconnTimer = 0;
  }
  start() {
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, peerOptions());
      this.peer = peer;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('部屋に接続できませんでした。ルームコードとホストの状態を確認してください。')); } }, 20000);
      peer.on('open', () => this.connect(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } }));
      peer.on('disconnected', () => {
        if (this.closed) return;
        setTimeout(() => { try { if (!this.closed && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch { /* ignore */ } }, 1500);
      });
      peer.on('error', (err) => {
        if (err?.type === 'peer-unavailable') {
          this.onStatus({ state: 'reconnecting', text: 'ホストを探しています…' });
          this.scheduleReconnect();
          return;
        }
        if (!settled && ['browser-incompatible', 'ssl-unavailable', 'server-error', 'socket-error', 'network'].includes(err?.type)) {
          settled = true; clearTimeout(timer); reject(new Error(`通信を開始できません（${err.type}）`)); return;
        }
        this.onStatus({ state: 'warn', text: `通信エラー（${err?.type || 'unknown'}）` });
      });
    });
  }
  connect(onOpen) {
    if (this.closed || !this.peer || this.peer.destroyed) return;
    try { this.conn?.close(); } catch { /* ignore */ }
    const conn = this.peer.connect(peerIdFor(this.code), { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      this.retry = 0;
      this.onStatus({ state: 'open', text: '接続中' });
      const q = this.queue.splice(0);
      for (const m of q) { try { conn.send(m); } catch { /* ignore */ } }
      onOpen?.();
    });
    conn.on('data', (m) => { if (this.conn === conn) this.onMessage(m); });
    conn.on('close', () => { if (this.conn === conn && !this.closed) { this.onStatus({ state: 'reconnecting', text: '再接続中…' }); this.scheduleReconnect(); } });
    conn.on('error', () => { /* close follows */ });
  }
  scheduleReconnect() {
    if (this.closed || this.reconnTimer) return;
    const wait = Math.min(8000, 800 * 2 ** this.retry++);
    this.reconnTimer = setTimeout(() => {
      this.reconnTimer = 0;
      if (this.closed) return;
      if (this.peer?.destroyed) {
        this.start().catch(() => this.scheduleReconnect());
        return;
      }
      if (this.peer?.disconnected) { try { this.peer.reconnect(); } catch { /* ignore */ } }
      this.connect();
    }, wait);
  }
  reconnect() { this.retry = 0; this.scheduleReconnect(); }
  send(msg) {
    if (this.conn?.open) { try { this.conn.send(msg); return; } catch { /* fallthrough */ } }
    if (msg.t !== 'ping') { this.queue.push(msg); if (this.queue.length > 40) this.queue.shift(); }
  }
  close() {
    this.closed = true;
    clearTimeout(this.reconnTimer);
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }
}

// ───────── BroadcastChannel (same browser, for testing) ─────────
export class LocalHostTransport {
  constructor(code) { this.code = code; this.onMessage = () => {}; this.onLeave = () => {}; this.onStatus = () => {}; }
  start() {
    this.ch = new BroadcastChannel(`mm3-${this.code}`);
    this.ch.onmessage = (ev) => { const d = ev.data; if (d?.to === 'host' && d.from) this.onMessage(d.from, d.msg); };
    this.onStatus({ state: 'open', text: 'ローカル接続' });
    return Promise.resolve();
  }
  send(cid, msg) { this.ch?.postMessage({ to: cid, msg }); }
  close() { try { this.ch?.close(); } catch { /* ignore */ } }
}
export class LocalGuestTransport {
  constructor(code, cid) { this.code = code; this.cid = cid; this.onMessage = () => {}; this.onStatus = () => {}; }
  start() {
    this.ch = new BroadcastChannel(`mm3-${this.code}`);
    this.ch.onmessage = (ev) => { const d = ev.data; if (d?.to === this.cid) this.onMessage(d.msg); };
    setTimeout(() => this.onStatus({ state: 'open', text: 'ローカル接続' }), 30);
    return Promise.resolve();
  }
  send(msg) { this.ch?.postMessage({ to: 'host', from: this.cid, msg }); }
  reconnect() { this.onStatus({ state: 'open', text: 'ローカル接続' }); }
  close() { try { this.ch?.close(); } catch { /* ignore */ } }
}

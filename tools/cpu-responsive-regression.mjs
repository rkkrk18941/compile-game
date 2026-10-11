import assert from 'node:assert/strict';
import { Worker as Thread } from 'node:worker_threads';
import { createContext, game } from './cpu-test-harness.mjs';

const blobs = new Map(); let seq = 0, lastPayload, workers = new Set();
class BlobSource { constructor(parts) { this.source = parts.join(''); } }
const urls = { createObjectURL: b => { const id = 'blob:' + ++seq; blobs.set(id, b.source); return id; }, revokeObjectURL: id => blobs.delete(id) };
class BrowserWorker {
  constructor(url) {
    this.listeners = new Map();
    this.thread = new Thread("const {parentPort}=require('node:worker_threads');const vm=require('node:vm');const c={performance,console,postMessage:x=>parentPort.postMessage(x)};vm.createContext(c);vm.runInContext(" +
      JSON.stringify(blobs.get(url)) + ",c);parentPort.on('message',data=>c.onmessage({data}));", { eval: true });
    workers.add(this);
    this.thread.on('message', data => this.emit('message', { data }));
    this.thread.on('error', error => { this.onerror?.(error); this.emit('error', error); });
  }
  emit(t, e) { for (const f of [...(this.listeners.get(t) || [])]) f(e); }
  addEventListener(t, f) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t).add(f); }
  removeEventListener(t, f) { this.listeners.get(t)?.delete(f); }
  postMessage(data) { lastPayload = data; this.thread.postMessage(data); }
  terminate() { workers.delete(this); return this.thread.terminate(); }
}
function fixture(ctx, level) {
  const g = game(ctx); g.cpuLevel = level; g.phase = 'action'; ctx.COMPILE_CPU.level = level; ctx.COMPILE_CPU.profileOverride = { searchMs: 300, maxNodes: 50000, depth: 3 };
  g.players[1].hand = [{ id: 'cpu-metal', protocol: 'METAL', value: 6, owner: 1, faceDown: false }, { id: 'cpu-death', protocol: 'DEATH', value: 3, owner: 1, faceDown: false }];
  g.players[0].hand = [{ id: 'SECRET-HAND', protocol: 'FIRE', value: 6, owner: 0, faceDown: false }];
  g.players[0].deck = [{ id: 'SECRET-DECK', protocol: 'SPEED', value: 5, owner: 0, faceDown: false }];
  g.players[0].lines[0] = [{ id: 'SECRET-FACEDOWN', protocol: 'FIRE', value: 1, owner: 0, faceDown: true }];
}
try {
  for (const level of ['normal', 'fair', 'apexmax']) {
    const ctx = createContext({ Blob: BlobSource, URL: urls, Worker: BrowserWorker, setInterval, clearInterval });
    fixture(ctx, level);
    let heartbeats = 0; const interval = setInterval(() => heartbeats++, 5);
    const r = await ctx.COMPILE_CPU._test.searchAsync(); clearInterval(interval);
    assert.match(r.diag.model, /\(worker\)/, 'actual generated worker must complete without fallback: ' + level);
    assert(r.diag.depth > 0); assert(heartbeats > 2, 'main event loop must keep running during search');
    if (level === 'fair') {
      const payload = JSON.stringify(lastPayload);
      for (const hidden of ['SECRET-HAND', 'SECRET-DECK', 'SECRET-FACEDOWN']) assert(!payload.includes(hidden), 'fair worker must not receive hidden identities');
      assert(!('H' in lastPayload.state));
    }
    ctx.newGame();
    console.log(level + ': worker depth ' + r.diag.depth + ', main-thread heartbeats ' + heartbeats);
  }
  const fallback = createContext({ setInterval, clearInterval }); fixture(fallback, 'apexmax');
  const start = performance.now(), r = await fallback.COMPILE_CPU._test.searchAsync();
  assert.equal(r.diag.model, 'responsive-static-fallback'); assert(performance.now() - start < 150, 'unsupported worker must never run the long search on main thread');
  class BrokenWorker extends BrowserWorker { postMessage() { queueMicrotask(() => this.emit('message', { data: { id: lastPayload.id, error: 'broken' } })); } }
  const broken = createContext({ Blob: BlobSource, URL: urls, Worker: BrokenWorker, setInterval, clearInterval });
  fixture(broken, 'normal');
  // use a deterministic worker transport failure, before any computation can run
  BrokenWorker.prototype.postMessage = function(data) { this.emit('message', { data: { id: data.id, error: 'simulated worker failure' } }); };
  const br = await broken.COMPILE_CPU._test.searchAsync(); assert.equal(br.diag.model, 'responsive-static-fallback');
  const cancelled = createContext({ Blob: BlobSource, URL: urls, Worker: BrowserWorker, setInterval, clearInterval });
  fixture(cancelled, 'normal'); const pending = cancelled.COMPILE_CPU._test.searchAsync(); cancelled.newGame(); await pending;
  assert.equal(blobs.size, 0, 'blob URLs must be released');
  console.log('CPU responsiveness: actual worker, fair privacy, error fallback, unavailable worker and cancellation passed');
} finally { for (const w of [...workers]) await w.terminate(); }

// Real HTTPS-room code against a small, permission-checked REST fixture.
// Exercise failures that a successful BroadcastChannel/PeerJS simulation cannot cover.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/https-room.js'), 'utf8');
const crypto = require('node:crypto').webcrypto;
const clone = x => x == null ? x : structuredClone(x);
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function fixture() {
  let now = 1000000, uid = 0, version = 0, timerId = 0;
  const rooms = {}, timers = new Map(), clients = [], writes = [];
  const response = (status, value, etag) => ({ok: status < 300, status, json: async () => clone(value), headers: {get: name => name === 'etag' ? etag : null}});
  const server = {rooms, writes, fail: null, pause: null};
  async function request(url, options = {}) {
    const u = new URL(url), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    if (u.hostname === 'identitytoolkit.googleapis.com') {
      if (server.authFailures > 0) {server.authFailures--;return response(503,{error:'temporary authentication outage'});}
      const id = 'test-user-' + (++uid); return response(200, {localId: id, idToken: id, refreshToken: id, expiresIn: '3600'});
    }
    const [, key, suffix = ''] = u.pathname.match(/^\/rooms\/([^/]+)(.*?)\.json$/) || [];
    assert.ok(key, u.pathname);
    const id = u.searchParams.get('auth'), room = rooms[key], meta = room?.meta;
    const participant = meta && [meta.hostUid, meta.guestUid].includes(id), host = meta?.hostUid === id;
    const rowId = suffix.startsWith('/messages/') ? suffix.slice(10) : null;
    const current = suffix === '/meta' ? meta : suffix === '/messages' ? room?.messages : rowId ? room?.messages?.[rowId] : room;
    const etag = JSON.stringify(require('node:crypto').createHash('sha1').update(JSON.stringify(current || null)).digest('hex'));
    const call = {key, suffix, method, body, id};
    if (server.pause?.(call)) await new Promise(resolve => { server.resume = resolve; });
    const fault = server.fail?.(call);
    if (fault) return response(typeof fault === 'number' ? fault : 503, {error: 'injected outage'});
    if (method === 'GET') {
      if (suffix !== '/meta' && !participant || suffix === '/meta' && !meta) return response(401, {error: 'Permission denied'});
      return response(200, current || null, etag);
    }
    if (options.headers?.['if-match'] && options.headers['if-match'] !== etag) return response(412, {error: 'ETag mismatch'}, etag);
    if (suffix === '/meta') {
      if (method === 'PATCH') {
        if (!host) return response(401, {error: 'Permission denied'});
        Object.assign(meta, body);
      } else {
        if (meta && !host) {
          const unchanged = ['hostUid', 'hostClientId', 'hostPeerId', 'createdAt', 'version', 'expiresAt', 'controlEnabled', 'hostName'].every(k => JSON.stringify(meta[k]) === JSON.stringify(body[k]));
          if (!unchanged || body.guestUid !== id || meta.guestUid && meta.guestUid !== id) return response(401, {error: 'Permission denied'});
        } else if (!meta && body.hostUid !== id) return response(401, {error: 'Permission denied'});
        rooms[key] ||= {messages: {}};
        rooms[key].meta = clone(body);
        if (typeof body.createdAt === 'object') rooms[key].meta.createdAt = now;
      }
    } else if (rowId) {
      if (!participant) return response(401, {error: 'Permission denied'});
      if (method === 'DELETE') delete room.messages[rowId];
      else {
        if (body.fromUid !== id) return response(401, {error: 'Permission denied'});
        room.messages[rowId] = clone(body); room.messages[rowId].createdAt = now;
        writes.push({key, rowId, body: clone(body)});
      }
    } else if (suffix === '' && method === 'DELETE' && host) delete rooms[key];
    else return response(401, {error: 'Permission denied'});
    if (rooms[key]) rooms[key].version = ++version;
    return response(200, method === 'DELETE' ? null : suffix === '/meta' ? method === 'PATCH' ? body : rooms[key].meta : room.messages[rowId]);
  }
  function client(storage = new Map()) {
    const c = {online: true, timers: new Set(), storage}; clients.push(c);
    class Clock extends Date { static now() { return now; } }
    const context = vm.createContext({module: {exports: {}}, console, Date: Clock, Uint8Array, URLSearchParams, AbortController, crypto,
      fetch: (...args) => c.online ? request(...args) : Promise.reject(new Error('offline')),
      sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v)},
      setTimeout(fn, ms) {const id = ++timerId; timers.set(id, {fn, at: now + ms, c}); c.timers.add(id); return id;},
      clearTimeout(id) {timers.delete(id); c.timers.delete(id);}
    });
    vm.runInContext(source, context); c.net = context.module.exports;
    c.crash = () => {c.online = false; for (const id of c.timers) timers.delete(id); c.timers.clear();};
    return c;
  }
  async function tick(ms = 1000) {
    const end = now + ms; await flush();
    for (;;) {
      let next;
      for (const [id,t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id,t];
      if (!next) break;
      const [id,t] = next; now = t.at; timers.delete(id); t.c.timers.delete(id); t.fn(); await flush();
    }
    now = end; await flush();
  }
  return {server, client, tick, request, async clean() {for (const c of clients) c.crash(); await flush();}};
}
async function main() {
  const f = fixture(), {server,client,tick} = f;
  const hc = client(), gc = client(), h = hc.net.makeHost(), g = gc.net.makeGuest();
  const seen = [], replies = [], leaves = [];
  h.on('msg', (cid,m) => {seen.push([cid,m]); if (m.k === 'hello') h.send(cid, {k: 'lobby'});});
  h.on('leave', cid => leaves.push(cid)); g.on('msg', m => replies.push(m));
  server.authFailures=1;const creating=h.host('ABCD');await tick(1000);await creating;
  let heartbeatConflict=1;
  server.fail=c=>c.suffix==='/meta'&&c.method==='PUT'&&c.body.guestUid&&heartbeatConflict-->0?412:false;
  await g.join('ABCD');server.fail=null;g.send({k:'hello',cid:'ABCDEF234567'});await tick(3500);
  assert.equal(seen.length,1); assert.equal(replies.at(-1).k,'lobby');
  const occupied = client().net.makeHost(); await assert.rejects(occupied.host('ABCD'), e => e.code === 'taken'); occupied.close();
  const extra = client().net.makeGuest(); await assert.rejects(extra.join('ABCD'), e => e.code === 'full'); extra.close();
  const missing = client().net.makeGuest(); await assert.rejects(missing.join('ZZZZ'), e => e.code === 'notfound'); missing.close();
  // An acknowledgement failure must not replay an already-applied move.
  let failures = 2;
  server.fail = c => c.method === 'DELETE' && failures-- > 0;
  g.send({k:'act',ply:0}); await tick(5000); server.fail = null;
  assert.equal(seen.filter(([,m]) => m.k === 'act').length,1);
  // Lost writes retry under the same message ID and preserve turn ordering.
  failures = 2; const ids = [];
  server.fail = c => {if(c.method === 'PUT' && c.suffix.startsWith('/messages/') && c.id === g.auth.uid) {ids.push(c.suffix);return failures-- > 0;} return false;};
  g.send({k:'act',ply:1}); g.send({k:'act',ply:2}); await tick(8000); server.fail = null;
  assert.equal(ids[0],ids[1]); assert.equal(ids[1],ids[2]);
  assert.deepEqual(seen.filter(([,m]) => m.k === 'act').map(([,m]) => m.ply),[0,1,2]);
  // A tab disappears while the database keeps returning successful, empty responses.
  gc.crash(); await tick(47000); assert.deepEqual(leaves,['ABCDEF234567']);
  // Reload with the same stored anonymous identity can reclaim its own seat.
  const fresh = client(gc.storage), r = fresh.net.makeGuest(), resumed = [];
  r.on('msg',m => resumed.push(m)); await r.join('ABCD'); r.send({k:'hello',cid:'ABCDEF234567'}); await tick(2500);
  assert.equal(resumed.at(-1).k,'lobby');
  const oldSession = g.session;
  // Delayed replies intended for the old page must not reopen its game on the new page.
  const id = '-OLDSESSION'; server.rooms.GSTRABCD.messages[id] = {fromUid:h.auth.uid,fromClient:h.clientId,createdAt:Date.now(),payload:JSON.stringify({transport:1,session:h.session,seq:99,targetSession:oldSession,data:{k:'start',stale:true}})};
  await tick(1500); assert.equal(resumed.some(m => m.stale),false);
  r.close(); await tick(2500);
  const next = client().net.makeGuest(); await next.join('ABCD'); next.send({k:'hello',cid:'NEXTABC23456'}); await tick(2500);
  assert.equal(seen.at(-1)[0],'NEXTABC23456'); next.close(); await tick(2500);
  // Cancellation while the server commits the claim must release the occupied seat.
  const pending = client().net.makeGuest();
  server.pause = c => c.suffix === '/meta' && c.method === 'PUT' && c.body.guestUid === pending.auth?.uid;
  const joining = pending.join('ABCD').then(() => null, e => e); await flush();
  assert.ok(server.resume); pending.close(); server.pause = null; server.resume();
  assert.equal((await joining).detail,'cancelled'); await tick(3000);
  assert.ok(!server.rooms.GSTRABCD.meta.guestUid,'cancelled claim released');
  h.close(); await tick(3000); assert.ok(!server.rooms.GSTRABCD,'host close removes only its room');
  await f.clean();
  const multi = fixture(), owner = multi.client().net.makeHubHost(), members = [], received = [];
  owner.on('msg',(cid,m) => {received.push([cid,m]);owner.send(cid,{k:'identity',cid});});
  await owner.host('EFGH');
  for(let i=0;i<11;i++) {
    const g = multi.client().net.makeHubGuest(), messages=[];
    g.on('msg',m=>messages.push(m));await g.join('EFGH');g.send({k:'hello',name:'Player '+i});
    await multi.tick(3000);assert.equal(messages.at(-1)?.cid,g.peer.id);members.push({g,messages});
  }
  assert.equal(new Set(received.map(([cid])=>cid)).size,11,'eleven distinct guests plus host');
  members[0].g.link.send({k:'hello',cid:members[1].g.peer.id,name:'spoofed identity'});await multi.tick(3000);
  assert.equal(received.at(-1)[0],members[0].g.peer.id,'sender identity comes from authenticated transport');
  const full = multi.client().net.makeHubGuest();await assert.rejects(full.join('EFGH'),e=>e.code==='full');full.close();
  owner.send(members[2].g.peer.id,{k:'private',colour:'blue'});owner.broadcast({k:'public'});await multi.tick(3000);
  assert.ok(members.every((m,i)=>m.messages.filter(p=>p.k==='private').length===(i===2?1:0)),'private views never fan out');
  assert.ok(members.every(m=>m.messages.at(-1).k==='public'),'room summary reaches all guests');
  members[3].g.close();await multi.tick(3000);
  const replacement = multi.client().net.makeHubGuest();await replacement.join('EFGH');replacement.send({k:'hello'});await multi.tick(3000);
  assert.ok(received.some(([cid])=>cid===replacement.peer.id),'vacated reception slot is reusable');
  replacement.close();members.forEach(m=>m.g.close());owner.close();await multi.tick(5000);
  assert.equal(Object.keys(multi.server.rooms).length,0,'all reception rooms cleaned up');await multi.clean();
  console.log('PASS authenticated HTTPS: independent users, full/missing/colliding rooms, ordered retries, deduplication, silent crash, reload, stale replies, leave/rejoin, cancelled claim and host cleanup');
  console.log('PASS tournament HTTPS: 12 participants, private unicast, public broadcast, full room, slot reuse and cleanup');
}
if(require.main===module)main().catch(e => {console.error(e);process.exitCode=1;});
module.exports={fixture};

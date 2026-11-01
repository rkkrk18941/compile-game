// Exercise the real transports with controlled script loads, signaling and data channels.
// No public rooms, network, or real-time sleeps are required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const root = path.join(__dirname, '..');
const files = fs.readdirSync(root).filter(n => fs.statSync(path.join(root,n)).isDirectory() && !n.startsWith('.')).flatMap(n =>
  ['net.js','tournament-net.js','coop-net.js'].map(f => path.join(n,f)).filter(f => fs.existsSync(path.join(root,f)) && fs.readFileSync(path.join(root,f),'utf8').includes('var PEER_URLS')));
const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
function harness(file, mode='normal', library=true) {
  let now=0, serial=0, nextTimer=0;
  const timers=new Map(), peers=new Map(), instances=[], scripts=[];
  const setTimeout=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;};
  const clearTimeout=id=>timers.delete(id);
  class Channel extends EventEmitter {
    constructor(){super();this.open=false;}
    send(m){queueMicrotask(()=>{if(this.other?.open)this.other.emit('data',structuredClone(m));});}
    close(){const was=this.open;this.open=false;if(was)this.emit('close');if(this.other?.open){this.other.open=false;this.other.emit('close');}}
  }
  class Peer extends EventEmitter {
    constructor(id){super();this.id=typeof id==='string'?id:'guest'+(++serial);this.channels=[];instances.push(this);
      queueMicrotask(()=>{if(this.destroyed || mode==='silent')return;if(peers.has(this.id))return this.emit('error',{type:'unavailable-id'});peers.set(this.id,this);this.emit('open',this.id);});}
    connect(id){this.connectCalls=(this.connectCalls||0)+1;const a=new Channel(),b=new Channel();a.other=b;b.other=a;b.peer=this.id;this.channels.push(a);
      queueMicrotask(()=>{if(this.destroyed)return;if(mode==='channel-silent')return;if(mode==='channel-error')return a.emit('error',new Error('connection failed'));if(mode==='channel-close')return a.emit('close');const host=peers.get(id);if(!host)return this.emit('error',{type:'peer-unavailable'});host.channels.push(b);host.emit('connection',b);a.open=b.open=true;b.emit('open');a.emit('open');});return a;}
    destroy(){if(this.destroyed)return;this.destroyed=true;if(peers.get(this.id)===this)peers.delete(this.id);this.channels.forEach(c=>c.close());}
    reconnect(){}
  }
  const context=vm.createContext({console,module:{exports:{}},Uint8Array,setTimeout,clearTimeout,setInterval,clearInterval,crypto:require('node:crypto').webcrypto,
    require:require('node:module').createRequire(path.join(root,file)),
    document:{createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)}}});
  if(library)context.Peer=Peer;
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  return {N:context.module.exports,context,Peer,instances,scripts,timers,
    async tick(ms){const end=now+ms;await flush();while(true){let found;for(const [id,t] of timers)if(t.at<=end&&(!found||t.at<found[1].at))found=[id,t];if(!found)break;now=found[1].at;timers.delete(found[0]);found[1].fn();await flush();}now=end;await flush();}};
}
function links(N){
  if(N.makeHost)return {host:N.makeHost(),guest:N.makeGuest(),hostOpen:(h,c)=>h.host(c),join:(g,c)=>g.join(c),onHost:(h,f)=>h.on('msg',f),onGuest:(g,f)=>g.on('msg',f),send:(g,m)=>g.send(m)};
  if(N.makeLink)return {host:N.makeLink(),guest:N.makeLink(),hostOpen:(h,c)=>h.host(c),join:(g,c)=>g.join(c),onHost:(h,f)=>h.on('msg',f),onGuest:(g,f)=>g.on('msg',f),send:(g,m)=>g.send(m)};
  const xing=!!N.ClientSession;
  return {host:new N.PeerTransport(),guest:new N.PeerTransport(),hostOpen:(h,c)=>h.hostOpen(c),join:(g,c)=>g.clientConnect(c,{cid:'ABCDEF234567',nm:'Guest'}),onHost:(h,f)=>h.on('msg',f),onGuest:(g,f)=>g.on(xing?'state':'msg',f),send:(g,m)=>xing?g.clientSend(m):g.send(m)};
}
function observed(p){return p.then(()=>({ok:true}),error=>({error}));}
async function main(){
  assert.equal(files.length,20,'all twenty unbundled online transports are covered');
  for(const file of files){
    // Same-origin library first, one concurrent load, timeout fallback, no permanent rejected cache.
    let h=harness(file,'normal',false),p=observed(h.N.loadPeerJS());
    assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].src,'../assets/vendor/peerjs.min.js');
    assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),h.scripts[0].src)),'vendored script exists');
    const concurrent=h.N.loadPeerJS();concurrent.catch(()=>{});assert.equal(h.scripts.length,1);
    const stale=h.scripts[0].onload;
    await h.tick(8000);assert.equal(h.scripts.length,2);stale();assert.equal(h.scripts.length,2,'late load callback cannot start another request');
    await h.tick(16000);assert.equal((await p).error.code,'lib');
    p=observed(h.N.loadPeerJS());assert.equal(h.scripts.length,4,'failed library can be retried');
    h.context.Peer=h.Peer;h.scripts.at(-1).onload();assert.equal((await p).ok,true);
    // An onerror immediately tries the next source; successful same-site loading needs no CDN.
    h=harness(file,'normal',false);p=observed(h.N.loadPeerJS());h.scripts[0].onerror();assert.equal(h.scripts.length,2);h.context.Peer=h.Peer;h.scripts[1].onload();assert.equal((await p).ok,true);assert.equal(h.timers.size,0);
    // Signaling that never opens must fail and destroy its peer, for hosts and guests.
    for(const role of ['host','guest']){
      h=harness(file,'silent');let a=links(h.N),link=a[role];p=observed(role==='host'?a.hostOpen(link,'ABCD'):a.join(link,'ABCD'));
      await h.tick(20000);assert.ok((await p).error,file+' '+role+' timeout');assert.ok(h.instances[0].destroyed,file+' '+role+' destroyed');
      h.instances[0].emit('open');assert.ok(!h.instances[0].connectCalls,'late signaling cannot join');link.close();
    }
    for(const role of ['host','guest']){
      h=harness(file,'silent');const a=links(h.N),link=a[role];p=observed(role==='host'?a.hostOpen(link,'ABCD'):a.join(link,'ABCD'));
      await flush();link.close();assert.ok((await p).error,file+' pending operation is cancelled');assert.equal(h.timers.size,0);
      h=harness(file,'normal',false);const b=links(h.N),pending=b[role];p=observed(role==='host'?b.hostOpen(pending,'ABCD'):b.join(pending,'ABCD'));
      pending.close();h.context.Peer=h.Peer;h.scripts[0].onload();assert.ok((await p).error);assert.equal(h.instances.length,0,file+' closed while library loads cannot create a peer');
    }
    // Closed/error data channels reject before the deadline; a missing room does not leak a peer.
    for(const mode of ['normal','channel-error','channel-close','channel-silent']){
      h=harness(file,mode);const a=links(h.N);p=observed(a.join(a.guest,'ABCD'));await h.tick(mode==='channel-silent'?20000:0);
      assert.ok((await p).error,file+' '+mode+' rejected');assert.ok(h.instances[0].destroyed,file+' '+mode+' cleaned up');a.guest.close();
    }
    // Normal signaling and bidirectional transport remain intact. Each game retains its own wire API.
    h=harness(file);const a=links(h.N),received=[];await a.hostOpen(a.host,'ABCD');
    a.onHost(a.host,(x,y)=>received.push([x,y]));await a.join(a.guest,'ABCD');a.send(a.guest,{k:'hello',cid:'ABCDEF234567',nm:'Guest',v:1});await flush();
    assert.ok(received.length>0,file+' host receives');
    const replies=[];a.onGuest(a.guest,m=>replies.push(m));
    if(h.N.PeerTransport && h.N.ClientSession)a.host.hostPublish({ready:true});
    else if(file==='ibara/coop-net.js')a.host.send({ready:true});
    else if(a.host.broadcast)a.host.broadcast({ready:true});
    else a.host.send({ready:true});
    await flush();assert.equal(replies.at(-1)?.ready,true,file+' guest receives');
    const duplicate=links(h.N).host;assert.equal((await observed(a.hostOpen(duplicate,'ABCD'))).error.code,'taken');duplicate.close();
    a.guest.close();a.host.close();assert.equal(h.timers.size,0,file+' no pending opening timers');
    console.log('PASS '+file+' — library stall/fallback/retry, host/guest timeout, channel failure, missing room, two-way messages, room collision');
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

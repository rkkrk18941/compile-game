const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{BroadcastChannel}=require('node:worker_threads'),{webcrypto}=require('node:crypto');
const peers=new Map();let serial=0;
class Channel extends EventEmitter{constructor(){super();this.open=false;}send(m){const other=this.other;queueMicrotask(()=>{if(other.open)other.emit('data',structuredClone(m));});}close(){this.open=false;this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close');}}}
class Peer extends EventEmitter{
 constructor(id){super();this.id=typeof id==='string'?id:'guest-'+(++serial);this.destroyed=false;queueMicrotask(()=>{if(peers.has(this.id))this.emit('error',{type:'unavailable-id'});else{peers.set(this.id,this);this.emit('open',this.id);}});}
 connect(id){const a=new Channel(),b=new Channel();a.other=b;b.other=a;this.channel=a;queueMicrotask(()=>{const host=peers.get(id);if(!host)return this.emit('error',{type:'peer-unavailable'});host.emit('connection',b);a.open=b.open=true;b.emit('open');a.emit('open');});return a;}
 destroy(){this.destroyed=true;peers.delete(this.id);if(this.channel)this.channel.close();}reconnect(){}
}
const context=vm.createContext({console,Peer,BroadcastChannel,crypto:webcrypto,Uint8Array,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'../ibara/coop-net.js'),'utf8'),context);
const N=context.IBARA_NET,delay=()=>new Promise(r=>setTimeout(r,20));
async function test(kind){
 const host=N.makeLink(kind),guest=N.makeLink(kind);let received=[],responses=[];host.on('msg',m=>{received.push(m);host.send({k:'ack'});});guest.on('msg',m=>responses.push(m));
 const code=N.makeCode();await host.host(code);await guest.join(code);guest.send({k:'hello',token:'a'.repeat(20)});await delay();assert.equal(received[0].k,'hello');assert.equal(responses[0].k,'ack');
 let third=[];const extra=N.makeLink(kind);extra.on('msg',m=>third.push(m));await extra.join(code).catch(e=>{assert.equal(e.code,'notfound');});await delay();assert.equal(third[0].k,'error','third player rejected');extra.close();
 guest.close();await delay();const rejoined=N.makeLink(kind);await rejoined.join(code);rejoined.send({k:'rejoined'});await delay();assert.equal(received.at(-1).k,'rejoined');rejoined.close();host.close();
}
(async()=>{await test('local');await test('peer');assert.equal(N.cleanCode('ab i0-cd'),'ABCD');assert.equal(N.cleanName('  A\u0000B  '),'AB');console.log('Co-op transports passed: two-way messages, capacity, closure and reconnect, local channels and simulated PeerJS signaling.');})().catch(e=>{console.error(e);process.exit(1);});

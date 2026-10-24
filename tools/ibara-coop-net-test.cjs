const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{BroadcastChannel}=require('node:worker_threads'),{webcrypto}=require('node:crypto');
const peers=new Map();let serial=0;
class Channel extends EventEmitter{constructor(){super();this.open=false;}send(m){const other=this.other;queueMicrotask(()=>{if(other.open)other.emit('data',structuredClone(m));});}close(){const wasOpen=this.open;this.open=false;if(wasOpen)this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close');}}}
class Peer extends EventEmitter{
 constructor(id){super();this.id=typeof id==='string'?id:'guest-'+(++serial);this.destroyed=false;this.channels=[];queueMicrotask(()=>{if(peers.has(this.id))this.emit('error',{type:'unavailable-id'});else{peers.set(this.id,this);this.emit('open',this.id);}});}
 connect(id){const a=new Channel(),b=new Channel();a.other=b;b.other=a;this.channels.push(a);queueMicrotask(()=>{const host=peers.get(id);if(!host)return this.emit('error',{type:'peer-unavailable'});host.channels.push(b);host.emit('connection',b);a.open=b.open=true;b.emit('open');a.emit('open');});return a;}
 destroy(){this.destroyed=true;peers.delete(this.id);this.channels.forEach(c=>c.close());}reconnect(){}
}
const context=vm.createContext({console,Peer,BroadcastChannel,crypto:webcrypto,Uint8Array,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'../ibara/coop-net.js'),'utf8'),context);
const N=context.IBARA_NET,delay=()=>new Promise(r=>setTimeout(r,30));
async function test(kind){
 const host=N.makeLink(kind),guests=Array.from({length:5},()=>N.makeLink(kind));let received=[],responses=guests.map(()=>[]),closed=[];
 host.on('msg',(m,cid)=>{received.push({m,cid});host.send({k:'private',for:m.player},cid);});host.on('close',cid=>closed.push(cid));
 const code=N.makeCode();await host.host(code);
 for(let i=0;i<guests.length;i++){guests[i].on('msg',m=>responses[i].push(m));await guests[i].join(code);guests[i].send({player:i});}
 await delay();assert.equal(received.length,5);assert.equal(new Set(received.map(x=>x.cid)).size,5);
 responses.forEach((x,i)=>{assert.equal(x.length,1);assert.equal(x[0].for,i);});
 host.send({k:'state'});await delay();responses.forEach(x=>assert.equal(x.at(-1).k,'state'));
 guests[3].close();await delay();assert.equal(closed.length,1);assert.equal(Object.keys(host.conns).length,4);
 const returning=N.makeLink(kind);await returning.join(code);returning.send({player:3});await delay();assert.equal(received.at(-1).m.player,3);assert.equal(Object.keys(host.conns).length,5);
 const target=received.at(-1).cid;host.drop(target);await delay();assert.equal(Object.keys(host.conns).length,4);returning.close();guests.forEach(g=>g.close());host.close();
}
(async()=>{await test('local');await test('peer');assert.equal(N.cleanCode('ab i0-cd'),'ABCD');assert.equal(N.cleanName(' A\u0000B '),'AB');console.log('Six-player transports passed: five independent guest channels, private replies, broadcast, disconnect, reconnect and targeted drop (local and simulated PeerJS).');})().catch(e=>{console.error(e);process.exit(1);});

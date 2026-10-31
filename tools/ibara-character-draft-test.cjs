/* Host-authoritative character claims, including simultaneous, repeated and stale network requests.
   Since protocol 8 several players may choose the same character. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const STS=require('./ibara-bg-sim.cjs').load();
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ibara/bg/session.js'),'utf8'),{STS,console,Promise,setTimeout,clearTimeout,Date});
const S=STS.Session,copy=x=>JSON.parse(JSON.stringify(x));
const chars=r=>Array.from(r.slots,s=>s.ch);// session.js runs in another realm: compare plain copies
function room(n=4){
 const queue=[],out=[],guests={},events={};
 const link={on:(k,f)=>events[k]=f,send:(m,cid)=>{out.push({m:copy(m),cid});if(guests[cid])guests[cid].onMsg(copy(m));},drop:()=>{},close:()=>{}};
 const roster=new S.Roster({name:'Host',ch:null,token:'host-token-123456',deferred:true}),host=new S.Host(link,roster,{settings:{mode:'beginner',asc:0}});
 const join=(i,cid='c'+i)=>{
  const guest=new S.Guest({on(){},send:m=>queue.push({m:copy(m),cid})},{token:'guest-token-12345-'+i,name:'Guest'+i,ch:'R',unlock:3});guests[cid]=guest;guest.sendHello();return guest;
 };
 const flush=()=>{while(queue.length){const x=queue.shift();host.onMsg(x.m,x.cid);}};
 const list=[];for(let i=1;i<n;i++){list.push(join(i));flush();}
 return {host,roster,queue,out,events,guests,list,join,flush};
}
assert.equal(S.PROTOCOL,8,'protocol 8: shared characters (protocol 7 clients are asked to reload)');
for(const order of [[0,1],[1,0]]){
 const r=room(),[a,b,c]=r.list;
 assert.ok(r.roster.slots.every(s=>s.ch===null),'joining does not reserve a character');
 a.claimCharacter('R',3);r.flush();assert.ok(r.roster.slots.every(s=>s.ch===null),'pre-start claims cannot reserve a character');
 assert.equal(r.host.startSelection(),true);assert.equal(r.host.startSelection(),false,'start is idempotently guarded');
 const sent=r.out.length;
 for(const i of order)r.list[i].claimCharacter('R',i+1);
 r.flush();const first=order[0]+1,second=order[1]+1;
 assert.equal(r.roster.slots[first].ch,'R');assert.equal(r.roster.slots[second].ch,'R','a second player may choose the same character');
 assert.ok(!r.out.slice(sent).some(x=>x.m.k==='error'),'choosing a character somebody already has is not an error');
 assert.equal(r.roster.slots[first].unlock,order[0]+1);assert.equal(r.roster.slots[second].unlock,order[1]+1,'each player keeps their own unlock level');
 assert.ok(r.host.claimCharacter(0,'R',3,r.roster.selection).ok,'the host may also choose the same character');
 r.list[order[0]].claimCharacter('G',3);r.flush();assert.equal(r.roster.slots[first].ch,'R','confirmed choice is locked');
 r.list[order[0]].claimCharacter('R',3);r.flush();assert.equal(r.roster.slots[first].unlock,order[0]+1,'repeated claims never rewrite the locked unlock level');
 r.host.onMsg({k:'claimCharacter',ch:'G',unlock:3,selection:r.roster.selection},'unknown');assert.equal(r.roster.slots[0].ch,'R','unjoined connection cannot claim');
 c.claimCharacter('B',99);r.flush();assert.equal(r.roster.slots[3].unlock,3,'unlock is capped');
 r.events.close('c'+first);assert.equal(r.roster.slots[first].online,false);assert.equal(r.roster.slots[first].ch,'R','disconnect preserves the choice');
 r.join(first,'reconnected');r.flush();assert.equal(r.roster.slots[first].online,true);assert.equal(r.roster.slots[first].ch,'R','reconnect does not change confirmed character');
 assert.deepEqual(chars(r.roster),['R','R','R','B']);
 const late=r.roster.hello('late',{token:'late-player-123456',name:'Late',ch:null});assert.ok(late.err,'new membership closes when selection begins');
 const old=r.roster.selection;r.host.cancelSelection();assert.equal(r.roster.phase,'waiting');assert.ok(r.roster.slots.every(s=>!s.ch));r.host.startSelection();
 assert.ok(r.roster.claim(1,'R',0,old).err,'a delayed claim from the cancelled selection cannot apply to the next one');
 assert.equal(r.roster.slots[1].ch,null);
}
for(const n of [2,3,4]){
 // Everybody on the same character, and a mixed party with one pair.
 const r=room(n);r.host.startSelection();r.host.claimCharacter(0,'B',1,r.roster.selection);
 r.list.forEach((g,i)=>g.claimCharacter('B',i));r.flush();assert.deepEqual(chars(r.roster),Array(n).fill('B'));
 const run=STS.Game.newRun({players:r.roster.slots.map(s=>({name:s.name,ch:s.ch,unlock:s.unlock})),asc:0,seed:5});
 assert.equal(run.players.length,n);assert.ok(run.players.every(p=>p.ch==='B'&&p.deck.length===10));
 assert.equal(new Set(run.players.flatMap(p=>p.deck.map(c=>c.u))).size,10*n,'every copy of the starter deck is a separate card');
 r.roster.phase='playing';assert.equal(r.roster.kick(1),null,'running-game seats stay fixed');
}
{
 const r=room(4);r.host.startSelection();r.host.claimCharacter(0,'W',0,r.roster.selection);
 r.list.forEach((g,i)=>g.claimCharacter(['W','G','G'][i],2));r.flush();assert.deepEqual(chars(r.roster),['W','W','G','G']);
}
{
 // Legacy (non-deferred) rooms: joining or switching to a character another player has is accepted too.
 const legacy=new S.Roster({name:'Host',ch:'R',token:'host-token-123456'});
 assert.ok(!legacy.hello('a',{token:'guest-token-legacy-1',name:'A',ch:'R'}).err);
 assert.ok(!legacy.hello('b',{token:'guest-token-legacy-2',name:'B',ch:'G'}).err);
 legacy.hello('b',{token:'guest-token-legacy-2',name:'B',ch:'R'});legacy.setHost({ch:'R'});
 assert.deepEqual(chars(legacy),['R','R','R']);
 assert.ok(legacy.hello('x',{token:'guest-token-legacy-3',name:'X',ch:'?'}).err,'an unknown character is still refused');
}
const solo=room(1);assert.equal(solo.host.startSelection(),false);
console.log('ok: 2–4 unselected participants, the same character for several players (simultaneous claims in both orders, host included, whole party), locked claims, own unlock levels, repeated/stale/forged requests, reconnect ownership, cancellation and room membership guards');

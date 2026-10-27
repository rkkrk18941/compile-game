/* Host-authoritative character claims, including colliding and stale network requests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const STS=require('./ibara-bg-sim.cjs').load();
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ibara/bg/session.js'),'utf8'),{STS,console,Promise,setTimeout,clearTimeout,Date});
const S=STS.Session,copy=x=>JSON.parse(JSON.stringify(x));
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
for(const order of [[0,1],[1,0]]){
 const r=room(),[a,b,c]=r.list;
 assert.ok(r.roster.slots.every(s=>s.ch===null),'joining does not reserve a character');
 a.claimCharacter('R',3);r.flush();assert.ok(r.roster.slots.every(s=>s.ch===null),'pre-start claims cannot reserve a character');
 assert.equal(r.host.startSelection(),true);assert.equal(r.host.startSelection(),false,'start is idempotently guarded');
 for(const i of order)r.list[i].claimCharacter('R',i+1);
 r.flush();const winner=order[0]+1,loser=order[1]+1;
 assert.equal(r.roster.slots[winner].ch,'R');assert.equal(r.roster.slots[loser].ch,null);
 assert.ok(r.out.some(x=>x.cid==='c'+loser&&x.m.k==='error'&&!x.m.rejected),'losing a race does not eject the guest');
 assert.ok(r.host.claimCharacter(0,'R',3,r.roster.selection).err,'host cannot steal a guest claim');
 r.list[order[0]].claimCharacter('G',3);r.flush();assert.equal(r.roster.slots[winner].ch,'R','confirmed choice is locked');
 r.list[order[0]].claimCharacter('R',3);r.flush();assert.equal(r.roster.slots[winner].unlock,order[0]+1,'duplicate claims never rewrite the locked unlock level');
 r.host.onMsg({k:'claimCharacter',ch:'G',unlock:3,selection:r.roster.selection},'unknown');assert.equal(r.roster.slots[0].ch,null,'unjoined connection cannot claim');
 r.list[order[1]].claimCharacter('G',99);c.claimCharacter('B',2);r.flush();assert.equal(r.roster.slots[loser].unlock,3,'unlock is capped');
 assert.equal(r.roster.slots[0].ch,null,'the run still waits for the host');
 r.events.close('c'+winner);assert.equal(r.roster.slots[winner].online,false);assert.equal(r.roster.slots[winner].ch,'R','disconnect preserves ownership');
 r.join(winner,'reconnected');r.flush();assert.equal(r.roster.slots[winner].online,true);assert.equal(r.roster.slots[winner].ch,'R','reconnect does not change confirmed character');
 assert.ok(r.host.claimCharacter(0,'W',1,r.roster.selection).ok);assert.equal(new Set(r.roster.slots.map(s=>s.ch)).size,4);
 const late=r.roster.hello('late',{token:'late-player-123456',name:'Late',ch:null});assert.ok(late.err,'new membership closes when selection begins');
 const old=r.roster.selection;r.host.cancelSelection();assert.equal(r.roster.phase,'waiting');assert.ok(r.roster.slots.every(s=>!s.ch));r.host.startSelection();
 assert.ok(r.roster.claim(1,'R',0,old).err,'a delayed claim from the cancelled selection cannot apply to the next one');
 assert.equal(r.roster.slots[1].ch,null);
}
for(const n of [2,3,4]){
 const r=room(n);r.host.startSelection();r.host.claimCharacter(0,'R',1,r.roster.selection);
 r.list.forEach((g,i)=>g.claimCharacter(['G','B','W'][i],i));r.flush();assert.equal(new Set(r.roster.slots.map(s=>s.ch)).size,n);
 r.roster.phase='playing';assert.equal(r.roster.kick(1),null,'running-game seats stay fixed');
}
const solo=room(1);assert.equal(solo.host.startSelection(),false);
console.log('ok: 2–4 unselected participants, both collision orders, locked claims, host fairness, soft race rejection, duplicate/stale/forged requests, reconnect ownership, cancellation and room membership guards');

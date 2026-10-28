const assert=require('node:assert/strict');
const E=require('../geister/engine.js'),AI=require('../geister/ai.js'),{Director,Arena}=require('../geister/tournament-core.js');
const people=(n,cpu=1)=>Array.from({length:n},(_,i)=>({eid:i,name:'P'+i,cpu,owner:cpu?null:'p'+i,logo:'wolf'}));
let checks=0;const check=(v,msg)=>{assert.ok(v,msg);checks++;};
for(const n of [2,3,6,8,12]){
 const a=new Arena(people(n),'cup',{seed:123},{send(){}});a.startReady();
 check(a.d.matches.filter(m=>m.status==='live').length>=1,'live matches');
 while(!a.d.over()){
  const ms=a.d.matches.filter(m=>m.status==='live');check(ms.length>0,'no deadlock');
  for(const m of ms){E.resign(m.state,1);a.change(m);}
 }
 check(a.d.matches.filter(m=>m.status==='done'&&!m.bye).length===n-1,'n-1 games including nonpower-of-two');
 check(a.d.champion()!==null,'champion');a.close();
}
{
 const a=new Arena(people(6),'league',{seed:9},{send(){}});a.startReady();
 check(a.d.matches.filter(m=>m.status==='live').length===3,'three concurrent matches');
 while(!a.d.over()){for(const m of a.d.matches.filter(m=>m.status==='live')){E.resign(m.state,1);a.change(m);}}
 const pairs=a.d.matches.map(m=>[m.a,m.b].sort().join(':'));check(new Set(pairs).size===15&&pairs.length===15,'round robin once per pair');
}
{
 const p=people(4,0);p[0].owner=p[1].owner='shared';p[2].owner=p[3].owner='shared';
 const a=new Arena(p,'cup',{seed:4},{send(){}});a.startReady();check(a.d.matches.filter(m=>m.status==='live').length===1,'a shared device is never double booked');
 const m=a.d.matches.find(m=>m.status==='live');
 check(!a.setup('intruder',m.id,m.revision,0,[1,1,1,1,0,0,0,0]),'outsider cannot setup');
 check(a.setup('shared',m.id,m.revision,0,[1,1,1,1,0,0,0,0]),'owner setup');
 check(a.setup('shared',m.id,m.revision,1,[0,0,0,0,1,1,1,1]),'other setup');
 const privateView=a.payload('shared',m.id).view;
 check(privateView.g.filter(g=>g.o!==privateView.me).every(g=>g.good===null),'shared device sees current seat only');
 const watched=a.payload('spectator',m.id);check(watched.ctrl.length===0&&watched.view.g.every(g=>typeof g.good==='boolean'),'spectators see both colours');
 const rev=m.revision,move=E.legal(m.state,m.state.turn)[0];
 check(!a.act('spectator',m.id,rev,move),'spectator cannot act');check(a.act('shared',m.id,rev,move),'owner acts');check(!a.act('shared',m.id,rev,move),'stale revision rejected');
 a.close();check(!a.act('shared',m.id,m.revision,E.legal(m.state,m.state.turn)[0]),'closed arena rejects moves');
}
{
 const a=new Arena(people(4,0),'cup',{seed:2},{send(){}});a.startReady();const m=a.d.matches.find(m=>m.status==='live');
 for(const seat of [0,1]){const owner=a.d.byId(m.seats[seat]).owner;a.setup(owner,m.id,m.revision,seat,E.randomLayout(E.mulberry32(seat+1)));}
 const owner=a.d.byId(m.seats[0]).owner,p=a.payload(owner,m.id);
 check(p.ctrl.length===1&&p.view.g.filter(g=>g.o===1).every(g=>g.good===null),'online participant opponent colours redacted');
 a.playerLeft(owner);check(a.d.byId(m.seats[0]).cpu===2,'disconnected player becomes CPU');
}
(async()=>{
 const a=new Arena(people(4),'cup',{seed:8},{send(){},choose:async(v)=>AI.choose(v,1,E.mulberry32(v.ply+1),{ms:1})});a.startReady();let steps=0;
 while(!a.d.over()&&steps++<200){for(const m of a.d.matches.filter(m=>m.status==='live')){m.state.limit=12;await a.pump(m.id);}}
 check(a.d.over(),'CPU games run to completion and advance');
 const {bracketLayout}=await import('../hatatori-nine/tournament-tree.js');const d=new Director(people(6),'cup',10,{});check(bracketLayout(d.summary()).leaves.length===6,'shared tree collapses byes to six logos');
 console.log(checks+' tournament assertions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Boss completion, delayed awakening, restored empty battlefields and reduced hands. */
'use strict';
const assert=require('node:assert/strict'),S=require('./ibara-bg-sim.cjs').load();
const tick=()=>new Promise(r=>setImmediate(r));
async function bounded(job){let timer;try{return await Promise.race([job,new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error('battle did not finish')),1000);})]);}finally{clearTimeout(timer);}}
function game(n=1,asc=0){const run=S.Game.newRun({players:['B','R','G','W'].slice(0,n).map(ch=>({ch})),seed:33,asc}),g=new S.Game(run,{});g.setupDecks();g.setupAct(3);run.players.forEach(p=>{p.hp=p.maxHp=100;});run.bosses=2;run.phase='room';run.room={t:'B',step:'fight',boss:'DonuDeca'};return g;}
async function resumed(g){const restored=new S.Game(g.snapshot(),{});await bounded(restored.start());assert.equal(restored.run.result,'victory');assert.equal(restored.run.bosses,3);return restored;}
(async()=>{
 let checked=0;
 for(const n of [1,4])for(const boss of ['AwakenedOne','TimeEater','DonuDeca'])for(const cause of ['card','lightning','poison']){
  const g=game(n);g.run.room.boss=boss;
  // Use a real play checkpoint so the commands and completion waiter are exercised.
  const cb=S.Combat.create(g,{kind:'boss',enc:'Boss:'+boss});g.run.combat=cb.s;await S.ENCOUNTERS['Boss:'+boss].build(cb);await cb.setup();cb.s.phase='play';cb.s.round=4;
  cb.pcs().forEach(pc=>{pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};pc.hand=[{id:'Strike'+g.P(pc.i).ch,u:g.uid()}];});
  if(boss==='TimeEater')cb.alive()[0].x.hasted=true;
  let job=g.start();await tick();let c=g.combat;
  if(boss==='AwakenedOne'){
   // Phase one must stay in combat with no foes until the players end the turn.
   for(const e of c.alive())await c.damageEnemy(e,999,{});
   assert.equal(c.s.over,false);assert.ok(c.s.pending.some(p=>p.keep));assert.equal(c.alive().length,0);
   // Reloading must preserve the revival, not incorrectly award victory.
   const copy=new S.Game(g.snapshot(),{});job=copy.start();await tick();c=copy.combat;
   assert.equal(copy.run.result,null);assert.ok(c._playDone);
   for(let i=0;i<n;i++)await c.command(i,{type:'end'});await tick();
   assert.ok(c.alive().some(e=>e.id==='AwakenedOne2'));assert.equal(c.s.pending.length,0);
  }
  // Give every target one HP, with the same real finishing mechanics as live play.
  for(const e of c.alive()){e.hp=1;e.blk=0;}
  if(cause==='card'){
   while(c.alive().length){const pc=c.pc(0),card={id:'Claw',u:c.g.uid()};pc.hand.push(card);await c.command(0,{type:'play',u:card.u,target:c.alive()[0].u});}
  }else{
   if(cause==='lightning')c.pc(0).orbs=Array(c.alive().length).fill('lightning');
   else c.alive().forEach(e=>{e.psn=1;});
   for(let i=0;i<n;i++)await c.command(i,{type:'end'});
  }
  await bounded(job);assert.equal(c.g.run.result,'victory',boss+' '+cause);assert.equal(c.g.run.bosses,3);checked++;
 }
 // A persisted empty play checkpoint needs no extra turn/button to recognize victory.
 for(const marked of [false,true]){
  const g=game(),cb=S.Combat.create(g,{kind:'boss',enc:'Boss:DonuDeca'});g.run.combat=cb.s;cb.s.phase='play';cb.s.round=5;cb.spawn('Donu',-1).dead=true;
  if(marked){cb.s.over=true;cb.s.result='victory';}await resumed(g);
 }
 // The single known draw-time removal is contextual; normal fights retain all five.
 for(const id of ['Donu','AwakenedOne2'])for(const en of [0,3]){
  const g=game(),cb=S.Combat.create(g,{kind:'boss'}),pc=cb.pc(0);cb.spawn(id,-1);pc.en=en;pc.t={};pc.draw=['StrikeB','DefendB','StrikeB','DefendB','Slimed'].map(id=>({id,u:g.uid()}));
  await cb.draw(pc,5,{turnDraw:true});const removed=id==='AwakenedOne2'&&en>0;assert.equal(pc.hand.length,removed?4:5);assert.equal(pc.en,en-(removed?1:0));
 }
 console.log(`ok: ${checked} real boss/party/lethal-source completions, delayed revival and reload, empty checkpoint recovery, contextual five-card draws`);
})().catch(e=>{console.error(e);process.exitCode=1;});

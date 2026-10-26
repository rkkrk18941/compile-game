/* Every encounter must resolve an action, even when the die or mode selects a non-attack. */
'use strict';
const assert=require('node:assert/strict'),S=require('./ibara-bg-sim.cjs').load();
(async()=>{
 let count=0;
 for(const n of [1,4])for(const asc of [0,12])for(const [id,enc]of Object.entries(S.ENCOUNTERS)){
  const run=S.Game.newRun({players:['R','G','B','W'].slice(0,n).map(ch=>({ch})),asc,seed:61}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);
  const cb=S.Combat.create(g,{kind:id.startsWith('Boss:')?'boss':'normal',rows:enc.rows?enc.rows(n):n});run.combat=cb.s;g.combat=cb;cb.s.round=2;
  await enc.build(cb,0);
  for(const e of cb.alive()){
   const m=S.MONSTERS[e.id];
   for(const mode of e.id==='Guardian'?['attack','defense']:e.id==='Champ'?['normal','fury']:[e.mode]){
    e.mode=mode;const tr=m.track?(typeof m.track==='function'?m.track(cb,e):m.track):null,len=tr?tr.length:e.id==='Guardian'?2:1;
    for(let cube=0;cube<len;cube++)for(let die=1;die<=6;die++){
     e.cube=cube;cb.s.die=die;const a=cb.currentAction(e);count++;
     assert.ok(a&&Array.isArray(a.fx),JSON.stringify({id,n,asc,enemy:e.id,cube,die,mode}));
    }
   }
  }
 }
 console.log('ok: '+count+' encounter/player/difficulty/die/mode combinations resolve a defined action; no silent missing-action paths found');
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Printed expansion integration: real cards/items/bosses/events, no synthetic replacements. */
'use strict';
const assert=require('assert/strict'),sim=require('./ibara-bg-sim.cjs');
const S=sim.load(),F=S.DF;let checks=0;
function game(chs=['U'],adv='downfall',asc=0){const run=S.Game.newRun({players:chs.map(ch=>({ch})),adv,asc,seed:83});const g=new S.Game(run,null);g.io={ask:(pi,q)=>S.autoAnswer(g,pi,q)};g.setupDecks();g.setupAct(1);run.players.forEach(p=>{p.hp=p.maxHp=500;p.gold=30;});return g;}
async function combat(ch='U'){const g=game([ch]);const cb=S.Combat.create(g,{kind:'normal'});g.run.combat=cb.s;g.combat=cb;await cb.setup();cb.s.round=2;cb.s.phase='play';const pc=cb.pc(0);pc.en=6;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};pc.hand=[];pc.draw=[];for(let j=0;j<10;j++)pc.draw.push({u:g.uid(),id:'Strike'+ch,up:false});const e=cb.spawn('JawWorm',0,{lvl:'hard',beh:'SDA'});e.hp=e.max=10000;return {g,cb,pc,e};}
function give(g,pc,id,up=false){const c={u:g.uid(),id,up};pc.hand.push(c);return c;}
async function play(f,id,up=false,from){const {g,cb,pc,e}=f;pc.en=6;const c=give(g,pc,id,up);if(from){pc.hand.splice(pc.hand.indexOf(c),1);pc.chamber[0]=c;await cb.exec(0,{type:'chamber',u:c.u,target:e.u,row:0,x:2});}else await cb.playFromHand(pc,{u:c.u,target:e.u,row:0,x:2});return c;}
(async()=>{
 assert.deepEqual(Array.from(S.DATA.CHAR_ORDER),['R','G','B','W','S','U','H','M']);assert.equal(F.adventureReady(),true);checks++;
 // Every printed playable face executes with the actual engine; all new powers exercise their lifecycle.
 const ids=Object.keys(S.CARDS).filter(id=>{const d=S.CARDS[id];return d.df&&!id.includes('~')&&(['U','H','M'].includes(d.ch)||id.startsWith('Df'));});
 for(const id of ids)for(const up of [false,true]){
  const d=S.CARDS[id];if(d.unplayable||d.c==null||d.t==='V')continue;
  const ch=['U','H','M'].includes(d.ch)?d.ch:'U',f=await combat(ch);f.pc.heat=6;f.pc.blk=8;f.pc.soul=2;f.pc.str=1;
  give(f.g,f.pc,'Strike'+ch);give(f.g,f.pc,'Defend'+ch);f.pc.disc.push({u:f.g.uid(),id:'Strike'+ch,up:false});f.pc.exh.push({u:f.g.uid(),id:'Defend'+ch,up:false});
  if(ch==='M')f.pc.chamber=[{u:f.g.uid(),id:'StrikeM',up:false},{u:f.g.uid(),id:'ScornM',up:false}];
  try{const c=await play(f,id,up);if(d.t==='P'){const p=f.pc.pow.find(p=>p.u===c.u);if(p&&d.pw&&d.pw.activate&&!(d.pw.canActivate&&d.pw.canActivate(f.cb,f.pc,p)))await f.cb.activatePower(f.pc,{u:p.u});await f.cb.startOfTurn(f.pc);await f.cb.endTurn();}checks++;}catch(e){e.message=id+(up?'+':'')+': '+e.message;throw e;}
 }
 // Golden Bullet: modifiers occur once; Weak cancels Vulnerable as in the base rules.
 for(const weak of [0,1]){const f=await combat('M');f.e.vuln=1;f.pc.weak=weak;f.pc.str=2;await play(f,'GoldenBullet',false,true);assert.equal(10000-f.e.hp,weak?4:16);checks++;}
 // An invalid activation neither spends energy nor the turn's use.
 {const f=await combat('H');await play(f,'LingeringShades');const p=f.pc.pow.find(p=>p.id==='LingeringShades');f.pc.en=0;await assert.rejects(f.cb.activatePower(f.pc,{u:p.u}),/エナジー/);assert.ok(!p.usedTurn);f.pc.en=1;await f.cb.activatePower(f.pc,{u:p.u});assert.equal(f.pc.en,0);checks++;}
 // Preview contexts cannot consume Devour Flame's next-card exhaust reservation.
 {const f=await combat('H');await play(f,'DevourFlame');const pending=f.pc.t.dfExhaustNext;f.cb.ctx(f.pc,{u:f.g.uid(),id:'StrikeH',up:false},{});assert.equal(f.pc.t.dfExhaustNext,pending);const c=await play(f,'StrikeH');assert.ok(f.pc.exh.includes(c));checks++;}
 // All 60 Heart's Boon alternatives, including completed-save resumption.
 for(let i=0;i<20;i++)for(let choice=0;choice<3;choice++){
  const g=game(['U']);g.run.df.boons={cards:[i],states:{}};
  g.io.ask=(pi,q)=>q.type==='option'&&q.title==='ハートの恩恵：1つ選ぶ'?String(choice):S.autoAnswer(g,pi,q);
  await F.PARTS.heartsBoon(g);assert.equal(g.run.df.boons.states[0].stage,5);const before=JSON.stringify(g.run.players);await F.PARTS.heartsBoon(g);assert.equal(JSON.stringify(g.run.players),before);checks++;
 }
 // Every new potion at each die value, using the real consumption path.
 for(const [id,d] of Object.entries(S.POTIONS).filter(([id,d])=>d.df))for(let die=1;die<=6;die++){
  const f=await combat('U');f.cb.s.die=die;give(f.g,f.pc,'Burn');f.pc.exh.push({u:f.g.uid(),id:'StrikeU',up:false});f.g.P(0).potions=[id];
  await f.g.usePotion(0,0,f.cb,{});assert.equal(f.g.P(0).potions.length,0,id);checks++;
 }
 // Relic acquisition, die hooks, conditional activation and rest effects.
 for(const [id,d] of Object.entries(S.RELICS).filter(([id,d])=>d.df&&id.startsWith('Df'))){
  const f=await combat('U');give(f.g,f.pc,'Burn');f.pc.exh.push({u:f.g.uid(),id:'StrikeU',up:false},{u:f.g.uid(),id:'DefendU',up:false});f.pc.t.attacks=3;f.pc.hand=f.pc.hand.slice(0,1);f.g.P(0).potions=['DfEnergyDrink'];
  await f.g.gainRelic(f.g.P(0),id);const r=f.g.relicOf(f.g.P(0),id);if(!r){checks++;continue;}
  for(const key of ['startCombat','startTurn'])if(d[key])await d[key](f.cb,f.pc,r);
  if(d.die)for(const fx of d.die)await fx.fx(f.cb,f.pc,r);
  if(d.activate&&!(d.canActivate&&d.canActivate(f.cb,f.pc,r)))await f.g.activateRelic(f.cb,f.pc,id,{});
  if(id==='DfPotionBelt')assert.equal(f.g.potionLimit(f.g.P(0)),S.DATA.CAP.potions+2);checks++;
 }
 // Shield Charger retains block before start-turn powers and never duplicates Barricade.
 for(const barricade of [false,true]){const f=await combat('U');await play(f,'ShieldCharger');if(barricade)await play(f,'Barricade');f.pc.blk=7;await f.cb.startRound();assert.equal(f.pc.blk,barricade?7:2);checks++;}
 // Demon retains Strength through the delayed second phase, including direct kills.
 {const f=await combat('R'),e=f.cb.spawn('DfDemon',-1);e.str=4;await f.cb.killEnemy(e,{});assert.equal(f.cb.s.pending[0].str,4);const m=S.MONSTERS.DfDemon;await m.secondWind(f.cb,f.cb.s.pending[0]);assert.equal(f.cb.alive().find(e=>e.id==='DfCorrupted').str,4);checks++;}
 // All 162 unique 1–4-player parties retain exactly their unselected boss candidate set across save/reload.
 const chars=S.DATA.CHAR_ORDER;let parties=0;
 function combos(start,a){if(a.length){const g=game(a);const pool=JSON.stringify(g.run.df);const expected=chars.filter(c=>!a.includes(c));assert.deepEqual(Array.from(g.run.df.pool),Array.from(expected));const r=JSON.parse(JSON.stringify(g.run));const restored=new S.Game(r,{});restored.setupAct(3);assert.equal(JSON.stringify(restored.run.df.pool),JSON.stringify(expected));parties++;}if(a.length<4)for(let i=start;i<chars.length;i++)combos(i+1,a.concat(chars[i]));}
 combos(0,[]);assert.equal(parties,162);checks+=parties;
 // All printed bosses build and resolve an entire action cycle for every party size and both thresholds.
 for(const id of ['DfWitch','DfDarkCore','DfWrathful','DfOrbMaster','DfInferno','DfTrickster','DfDemon','DfWraith','DfBlasphemer','DfNeow'])for(const n of [1,2,3,4])for(const asc of [0,11]){
  const g=game(chars.slice(0,n),'downfall',asc),cb=S.Combat.create(g,{kind:'boss',enc:'Boss:'+id});g.combat=cb;g.run.combat=cb.s;await S.ENCOUNTERS['Boss:'+id].build(cb);cb.s.round=1;cb.s.phase='play';cb.pcs().forEach(pc=>{pc.t={};});for(const e of cb.s.enemies.slice()){const m=cb.mdef(e);if(m.start)await m.start(cb,e);}const boss=cb.alive().find(e=>e.id===id);assert.ok(boss);for(let t=0;t<6;t++)await cb.enemyAct(boss);assert.ok(g.run.players.every(p=>Number.isFinite(p.hp)));checks++;
 }
 // New event choices execute once and a completed event can safely resume without repeated rewards.
 for(const [id,d] of Object.entries(S.EVENTS).filter(([id,d])=>d.df&&id!=='DfCursedTome'))for(let option=0;option<4;option++){
  const g=game(['U','H']);g.run.phase='room';g.run.room={t:'?',key:'test',step:'event'};const st={id};g.io.ask=(pi,q)=>{if(q.type==='option'){const opts=q.options.filter(o=>!o.disabled);return opts[Math.min(option,opts.length-1)]?.id;}return S.autoAnswer(g,pi,q);};
  try{await d.run(g,st);const before=JSON.stringify(g.run.players);await d.run(g,st);assert.equal(JSON.stringify(g.run.players),before);checks++;}catch(e){e.message=id+' option'+option+': '+e.message;throw e;}
 }
 console.log('ok: '+checks+' printed expansion integration checks; '+parties+' candidate/save combinations');
})().catch(e=>{console.error(e);process.exit(1);});

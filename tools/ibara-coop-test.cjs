const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ctx=vm.createContext({console,Date,Math,Promise,setTimeout,clearTimeout,localStorage:{setItem(){throw Error('Solo save written by co-op');},removeItem(){}}});
for(const f of ['engine.js','data/cards.js','data/world.js','data/board-act1.js','coop-core.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../ibara',f),'utf8'),ctx,{filename:f});
const G=ctx.IBARA,heroes=['knight','huntress','doll','maiden'];
const team=n=>heroes.slice(0,n).map((hero,i)=>({hero,name:'P'+i}));
function pick(q){
 if(q.type==='option')return (q.options.find(o=>o.id==='leave')||q.options.at(-1)).id;
 if(q.type==='reward')return -1;
 if(['hand','pile','deck','scry'].includes(q.type))return q.cards.slice(0,q.type==='deck'||q.type==='scry'?0:q.min??q.n).map(c=>c.uid);
 if(q.type==='die'||q.type==='roll')return {steps:[]};
 if(q.type==='orb'||q.type==='bossRelic')return 0;
 if(q.type==='relic'||q.type==='potion')return true;
 throw Error(q.type);
}
function make(n=2,cp,auto=true){let save;const core=new G.CoopCore(team(n),34,{save(s){save=s;},update(v){if(auto)setImmediate(()=>v.prompts.forEach((q,i)=>{if(q&&core.prompts[i]?.key===q.key)core.answer(i,q.key,pick(q));}));}},cp);return {core,get save(){return save;}};}
const action=(c,owner,type,fields={})=>c.dispatch(owner,{type,rev:c.rev,...fields});
async function battle(n=2,id='rat',kind='enc'){
 const c=make(n).core;c.players.forEach(p=>{p.run.hp=50;p.run.maxHp=50;});await c.startBattle({kind,enemies:[id],rewards:{}});
 c.combats.forEach(x=>{x.hero.orbs=[];x.hero.block=0;});return c;
}
async function endAll(c){for(let i=0;i<c.players.length;i++)await action(c,i,'end');}
async function main(){
 const solo=G.Game.newRun('knight',1),multi=G.Game.newRun('knight',1,2);
 assert.equal(solo.gold,2);assert.deepEqual(Array.from(solo.relics),['solo_die']);assert.equal(multi.gold,0);assert.equal(multi.relics.length,0);
 assert.throws(()=>new G.CoopCore([...team(4),team(1)[0]],1),/1〜4/);assert.throws(()=>new G.CoopCore([team(1)[0],team(1)[0]],1),/別/);
 const started=make(4);await started.core.begin();assert.equal(started.core.phase,'map');assert(started.core.players.every(p=>p.run.blessRed));
 assert.equal(new Set(started.core.players.map(p=>p.run.firstEnc)).size,4);assert.equal(started.core.players[0].run.relicDeck,started.core.players[3].run.relicDeck);
 const restored=make(4,started.save).core;assert.equal(restored.players[0].run.relicDeck,restored.players[3].run.relicDeck);assert.throws(()=>make(4,{...started.save,rulesVersion:1}),/旧ルール/);
 for(let n=1;n<=4;n++){
  const c=await battle(n,'slime_s');assert.equal(c.combats[0].alive().length,n);assert(c.combats.every(x=>x.round===1&&x.die===c.combats[0].die&&x.hero.energy===3));
  assert.equal(new Set(c.combats[0].enemies.map(e=>e.lane)).size,n);
  const card=G.card.mk('k_strike'),owner=n-1;c.combats[owner].hand.push(card);await action(c,owner,'play',{uid:card.uid,target:c.combats[0].enemies[0].uid});
  if(n>1){const hp=c.combats[0].hero.hp;await action(c,0,'end');assert.equal(c.combats[0].hero.hp,hp);assert.equal(c.turn,1);await action(c,0,'unready');assert.equal(c.ended[0],false);}
  await endAll(c);assert.equal(c.turn,2);assert(c.combats.every(x=>x.round===2&&x.hero.hp===49));
 }
 const c=await battle(2,'slime_s');await assert.rejects(action(c,0,'support'));await assert.rejects(c.dispatch(0,{type:'end',rev:c.rev-1}),/更新/);await action(c,1,'end');await assert.rejects(action(c,1,'shiv'),/終了待ち/);
 const lanes=await battle(2,'slime_s'),[a,b]=lanes.combats;
 a.hero.block=10;await a.enemyDo(a.enemies[1],{name:'Row',fx:[['atk',2]]});assert.equal(a.hero.hp,50);assert.equal(b.hero.hp,48);
 const e=a.enemies[0];e.weak=1;await a.enemyDo(e,{name:'All',fx:[['atk',2,2,null,'all'],['str',1]]});assert.equal(e.weak,0);assert.equal(e.str,1);assert.equal(b.hero.hp,46);
 a.hero.block=0;a.hero.vuln=1;e.weak=1;await a.enemyDo(e,{name:'Multi',fx:[['atk',2,2]]});assert.equal(a.hero.hp,44);assert.equal(a.hero.vuln,0);assert.equal(e.weak,0);
 const aoe=await battle(3,'slime_s'),ac=aoe.combats[0],boss=ac.spawn('b_colossus');boss.hp=100;boss.maxHp=100;ac.focus=ac.enemies[1].uid;
 await ac.attackAll(1);assert.equal(ac.enemies[0].hp,3);assert.equal(ac.enemies[1].hp,2);assert.equal(ac.enemies[2].hp,3);assert.equal(boss.hp,99);
 ac.enemies.forEach(e=>{e.hp=100;e.maxHp=100;e.poison=2;});await endAll(aoe);assert(ac.enemies.every(e=>e.hp===98&&e.poison===2));
 const dead=await battle(2);await dead.combats[1].loseHP(100);assert(dead.combats.every(x=>x.over));await dead.battleEnded();assert.equal(dead.phase,'defeat');
 const fairy=await battle(2);fairy.players[1].run.potions.push('p_fairy');await fairy.combats[1].loseHP(100);assert.equal(fairy.combats[1].hero.hp,3);assert(fairy.combats.every(x=>!x.over));
 for(let n=1;n<=4;n++){
  const elite=await battle(n,'boar','elite');assert.equal(elite.combats[0].enemies.length,1);assert.equal(elite.combats[0].enemies[0].hp,[14,28,42,56][n-1]);
  const hex=await battle(n,'b_witch','boss');assert.equal(hex.combats[0].enemies[0].hp,[36,75,112,150][n-1]);
  const sent=make(n).core;sent.players.forEach(p=>{p.run.hp=100;p.run.maxHp=100;});await sent.startBattle(sent.players[0].game.combatSpec({kind:'elite',encId:'el_witch'}));
  assert.equal(sent.combats[0].alive().length,3*n);for(let i=0;i<n;i++)assert.equal(sent.combats[0].alive().filter(e=>e.lane===i).length,3);
 }
 const split=await battle(2,'b_slime','boss'),sc=split.combats[0],sb=sc.enemies[0];await sc.damageEnemy(sb,23,{hit:true});assert.equal(sc.alive().length,1);assert.equal(sb.hp,21);
 await sc.damageEnemy(sb,22,{hit:true});assert.equal(sc.pendingSummons.length,6);assert.equal(sc.over,false);assert.equal(await split.battleEnded(),false);
 await endAll(split);assert.equal(sc.alive().length,6);assert.equal(sc.pendingSummons.length,0);assert.equal(sc.alive().reduce((n,e)=>n+e.hp,0),44);
 const supply=await battle(2),[x,y]=supply.combats;await x.addStatusCards('st_daze',8,'discard');await y.addStatusCards('st_daze',8,'discard');
 assert.equal(x.draw.filter(c=>c.id==='st_daze').length,8);assert.equal(y.draw.filter(c=>c.id==='st_daze').length,2);
 const daze=x.draw.find(c=>c.id==='st_daze');await x.exhaustCard(daze);assert(!x.exhaust.includes(daze));await y.addStatusCards('st_daze',1);assert.equal(y.draw.filter(c=>c.id==='st_daze').length,3);
 const cards=await battle(2),cc=cards.combats[0];cc.hero.energy=6;cc.hero.orbs=[];
 const shrug=G.card.mk('k_wall');cc.hand.push(shrug);const before=cc.hand.length;await action(cards,0,'play',{uid:shrug.uid});assert.equal(cc.hero.block,2);assert.equal(cc.hand.length,before);
 const pommel=G.card.mk('k_surge');cc.hand.push(pommel);const target=cc.enemies[0];target.hp=20;target.maxHp=20;await action(cards,0,'play',{uid:pommel.uid,target:target.uid});assert.equal(target.hp,18);assert.equal(pommel.bonus,undefined);
 const vig=G.card.mk('m_vigil');cc.hand.push(vig);await action(cards,0,'play',{uid:vig.uid});assert.equal(cards.combats[1].hero.block,2);assert.equal(cc.hero.stance,'calm');
 assert.equal(G.card.val({id:'k_brand',up:true},'d'),4);assert.equal(G.card.val({id:'k_brand',up:true},'vu'),1);assert.equal(G.card.val({id:'k_twin',up:true},'d'),2);assert.equal(G.card.val({id:'k_twin',up:true},'h'),2);
 const fc=(await battle(3)).combats[2];await fc.channel('frost');const blocks=fc.hero.block;await fc.evoke({index:0});assert.equal(fc.hero.block,blocks+1);
 cc.choose=async q=>q.type==='option'?0:pick(q);cc.hero.energy=3;const xid=Object.keys(G.CARDS).find(id=>G.CARDS[id].cost==='X'&&G.CARDS[id].hero==='knight'),xc=G.card.mk(xid);cc.hand.push(xc);await cc.playCard(xc.uid,cc.alive()[0].uid);assert.equal(cc.hero.energy,3);
 // The players can put lethal poison before Wrath damage and win immediately.
 const order=await battle(2,'slime_s','boss');order.combats[0].enemies[0].hp=1;order.combats[0].enemies[0].poison=1;order.combats[1].hero.hp=1;order.combats[1].hero.stance='wrath';
 order.choose=async(owner,q)=>q.type==='option'?(q.options.find(o=>o.label.includes('毒'))||q.options.at(-1)).id:pick(q);
 await endAll(order);assert.equal(order.phase,'victory');assert.equal(order.players[1].run.hp,1);
 // Dark Embrace's Ethereal draw is exempt from the same end-of-turn discard/effects.
 const faq=await battle(1),fc2=faq.combats[0];fc2.hand=[G.card.mk('st_daze')];fc2.draw=[G.card.mk('st_burn')];fc2.hero.powers.k_ashembrace=1;
 await fc2.endPlayerTurn();assert.equal(fc2.hand.length,1);assert.equal(fc2.hand[0].id,'st_burn');assert.equal(fc2.hero.hp,50);
 const memory=G.card.mk('k_strike');memory.retained=true;memory.costMod=-1;fc2.hand.push(memory);await fc2.discardFromHand([memory]);assert.equal(memory.retained,undefined);assert.equal(memory.costMod,undefined);
 // The browser-independent solo loop runs the same encounter setup and abilities.
 for(const hero of heroes){const run=G.Game.newRun(hero,71),game=new G.Game(run,{emit:async()=>{},choose:async q=>pick(q)}),combat=game.newCombat(game.combatSpec({kind:'first',encId:'fe_pillbug'}));
  const running=combat.start();for(let i=0;i<100&&combat.phase!=='player';i++)await new Promise(r=>setImmediate(r));assert.equal(combat.phase,'player');assert.equal(combat.alive().length,2);combat.abort();await running;
 }
 // Traverse the actual first-act rooms, resolving all shared/owned prompts and card effects.
 for(const count of [1,2,3,4]){
  const full=make(count).core;await full.begin();full.players.forEach(p=>{p.run.hp=10000;p.run.maxHp=10000;});let steps=0;
  while(!full.result&&steps++<12000){
   if(full.phase==='map')await action(full,full.leader,'enter',{node:full.players[0].game.reachable()[0]});
   else if(full.phase==='combat'){
    const owner=full.ended.findIndex(x=>!x),actor=full.combats[owner],targets=actor.alive().slice().sort((a,b)=>a.hp+a.block-b.hp-b.block);
    const playable=actor.hand.filter(x=>actor.canPlay(x)&&(!actor.needsTarget(x)||targets.length)),card=playable.find(x=>G.CARDS[x.id].type==='atk')||playable[0];
    if(card)await action(full,owner,'play',{uid:card.uid,target:targets[0]?.uid});else if(actor.hero.shiv&&targets.length)await action(full,owner,'shiv',{target:targets[0].uid});else await action(full,owner,'end');
   }else throw Error('Unexpected phase: '+full.phase);
  }
  assert.equal(full.result,'victory','Party '+count+' finishes first act');assert(steps<12000);
 }
 const prompts=make(2,undefined,false).core,deck=prompts.players[0].run.deck,wait=prompts.choose(0,{type:'hand',cards:deck,n:1,min:1}),key=prompts.prompts[0].key;
 assert.throws(()=>prompts.answer(1,key,[deck[0].uid]));assert.throws(()=>prompts.answer(0,key,[deck[0].uid,deck[0].uid]));prompts.answer(0,key,[deck[0].uid]);assert.equal((await wait)[0],deck[0]);assert.throws(()=>prompts.answer(0,key,[deck[0].uid]));
 console.log('Shared-round core passed: 1–4 players, blessings, free play order, row/AoE targeting, single enemy phase/poison tick, party death, Daze supply, HP tables, delayed boss summons, corrected cards, X choice, and owned prompts.');
}
const watchdog=setTimeout(()=>{console.error('Core test timed out');process.exit(1);},30000);
main().then(()=>clearTimeout(watchdog)).catch(e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});

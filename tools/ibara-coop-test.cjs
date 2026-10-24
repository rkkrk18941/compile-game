const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const dir=path.join(__dirname,'../ibara');let soloWrites=0;
const ctx=vm.createContext({console,Date,Math,Promise,setTimeout,clearTimeout,localStorage:{setItem(){soloWrites++;},removeItem(){soloWrites++;}}});
for(const f of ['engine.js','data/cards.js','data/world.js','coop-core.js'])vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx,{filename:f});
const G=ctx.IBARA,players=[{name:'Alice',hero:'knight'},{name:'Bob',hero:'huntress'}];
const watchdog=setTimeout(()=>{console.error('Co-op test exceeded 12 seconds');process.exit(1);},30000);
const tick=()=>new Promise(r=>setImmediate(r));
function pick(q){switch(q.type){case 'option':return (q.options.find(o=>o.id==='leave')||q.options.at(-1)).id;case 'reward':return -1;case 'hand':case 'pile':case 'deck':return q.cards.slice(0,q.type==='deck'?0:q.min??q.n).map(c=>c.uid);case 'scry':return [];case 'relic':return true;case 'potion':return true;case 'orb':case 'bossRelic':return 0;case 'die':case 'roll':return {steps:[]};default:throw Error(q.type);}}
function make(heroes=players,seed=34,cp){let s,lastSaved;const core=new G.CoopCore(heroes,seed,{save(x){lastSaved=x;},update(v){s=v;setImmediate(()=>{v.prompts.forEach((q,i)=>{if(q&&core.prompts[i]?.key===q.key)core.answer(i,q.key,pick(q));});});}},cp);return {core,get state(){return s;},get save(){return lastSaved;}};}
async function action(c,type,fields={}){return c.dispatch(c.active,{type,rev:c.rev,...fields});}
async function main(){
 const h=make(),c=h.core;c.begin();assert(h.save);assert.equal(soloWrites,0);assert.equal(c.players[0].run.map.id,c.players[1].run.map.id);assert.notEqual(c.players[0].run.hero,c.players[1].run.hero);
 const node=c.players[0].game.reachable()[0];await c.dispatch(1,{type:'vote',node});assert.equal(c.votes[1],node);
 await assert.rejects(c.dispatch(1,{type:'enter',node,rev:c.rev}),/進路係/);
 await assert.rejects(c.dispatch(0,{type:'enter',node:'missing',rev:c.rev}));
 await c.dispatch(0,{type:'enter',node,rev:c.rev});assert.equal(c.phase,'combat');assert.equal(c.combats[0].enemies,c.combats[1].enemies);assert.equal(c.active,0);assert.equal(c.combats[0].hero.energy,3);assert(c.combats[0].hand.length>=5);
 const e=c.combats[0].alive()[0];assert.equal(e.maxHp,Math.ceil(G.ENEMIES[e.id].hp*1.7));
 await assert.rejects(c.dispatch(1,{type:'end',rev:c.rev}),/仲間のターン/);
 const stale=c.rev-1;await assert.rejects(c.dispatch(0,{type:'end',rev:stale}),/更新/);
 const energy=c.combats[0].hero.energy;await action(c,'support');assert.equal(c.combats[0].hero.energy,energy-1);assert.equal(c.combats[1].hero.next.block,3);
 await assert.rejects(action(c,'support'),/援護/);
 await action(c,'end');assert.equal(c.active,1);assert.equal(c.combats[1].hero.block,3);
 const own=c.combats[1],card=own.hand.find(x=>own.canPlay(x)&&G.CARDS[x.id].type==='atk');assert(card);const uid=card.uid,target=own.alive()[0].uid;await action(c,'play',{uid,target});assert(!own.hand.some(x=>x.uid===uid));await assert.rejects(action(c,'play',{uid,target}));
 // Losing one hero permits the survivor to act. Victory revives the downed hero.
 own.hero.hp=0;own.finish('defeat');await c.nextTurn(0);assert.equal(c.active,0);assert.equal(c.phase,'combat');
 const winner=c.combats[0];winner.enemies.forEach(x=>{x.alive=false;x.hp=0;});await c.battleEnded();assert.equal(c.phase,'map');assert.equal(c.players[1].run.hp,1);assert.equal(c.leader,1);assert.equal(soloWrites,0);assert(h.save);assert.equal(h.save.runs[0].phase,'map');
 const resumed=make(players,123,h.save).core;assert.equal(resumed.players[0].run.pos,c.players[0].run.pos);assert.equal(resumed.leader,1);assert.equal(resumed.players[1].run.hp,1);
 // Death of both heroes, victory, and independent reward prompts.
 const d=make().core;await d.startBattle({kind:'boss',enemies:['rat'],rewards:{}});d.combats.forEach(x=>x.hero.hp=0);assert.equal(await d.battleEnded(),true);assert.equal(d.phase,'defeat');
 const b=make().core;await b.startBattle({kind:'boss',enemies:['rat'],rewards:{}});b.combats[0].enemies.forEach(x=>x.alive=false);await b.battleEnded();assert.equal(b.phase,'victory');
 // Split children keep the already scaled parent's HP, without a second multiplier.
 const split=make().core;await split.startBattle({kind:'enc',enemies:['slime_l'],rewards:{}});let sc=split.combats[0],sl=sc.enemies[0];sl.hp=8;await sc.splitEnemy(sl,'slime_m');assert.equal(sc.alive().reduce((n,x)=>n+x.hp,0),8);assert.equal(split.combats[1].alive().length,2);
 // Prompt responses must come from their owner and map back to canonical card objects.
 const q=make().core;const cards=q.players[0].run.deck.slice(0,2);let promise=q.choose(0,{type:'hand',cards,n:1,min:1});let key=q.prompts[0].key;
 assert.throws(()=>q.answer(1,key,[cards[0].uid]));assert.throws(()=>q.answer(0,key,[]));assert.throws(()=>q.answer(0,key,[cards[0].uid,cards[0].uid]));q.answer(0,key,[cards[0].uid]);assert.equal((await promise)[0],cards[0]);assert.throws(()=>q.answer(0,key,[cards[0].uid]));
 // End-turn cards must advance without depending on the solo engine's loop.
 const end=make([{name:'a',hero:'maiden'},{name:'b',hero:'doll'}]).core;await end.startBattle({kind:'enc',enemies:['b_colossus'],rewards:{}});let ec=end.combats[0];ec.hand.push(G.card.mk('m_vault'));await action(end,'play',{uid:ec.hand.at(-1).uid});assert.equal(end.active,1);assert.equal(end.turn,2);assert.equal(ec._endPending,false);
 // Every noncombat room must resolve both players' choices and reach a checkpoint.
 for(const type of ['rest','shop','treasure','event']){const x=make().core;let n=x.players[0].game.reachable()[0];x.players.forEach(p=>{let node=p.game.node(n);node.kind=type;node.space='light';});await x.dispatch(0,{type:'enter',node:n,rev:x.rev});assert(['map','combat'].includes(x.phase),type+' finished');}
 // Complete the entire act with both hero pairs, including boss and room transitions.
 for(const pair of [['knight','huntress'],['doll','maiden']]){
  const full=make(pair.map((hero,i)=>({name:'hero'+i,hero})),76).core;
  full.players.forEach(p=>{p.run.hp=1000;p.run.maxHp=1000;});full.begin();
  let steps=0;
  while(!full.result && steps++<1200){
   if(full.phase==='map'){const reach=full.players[0].game.reachable();assert(reach.length);await full.dispatch(full.leader,{type:'enter',node:reach[0],rev:full.rev});}
   else if(full.phase==='combat'){
    const current=full.combats[full.active];
    const playable=current.hand.filter(x=>current.canPlay(x));
    const card=playable.find(x=>G.CARDS[x.id].type==='atk')||playable[0];
    if(card)await action(full,'play',{uid:card.uid,target:current.alive()[0].uid});
    else if(current.hero.shiv)await action(full,'shiv',{target:current.alive()[0].uid});
    else await action(full,'end');
   }else await tick();
  }
  assert.equal(full.result,'victory',pair.join('+')+' completed the first act');assert(steps<1200);
 }
 // Every supported party size keeps one authoritative turn order and its own checkpoint.
 for(let count=2;count<=6;count++){
  const team=Array.from({length:count},(_,i)=>({name:'P'+i,hero:['knight','huntress','doll','maiden'][i%4]}));
  const multi=make(team,136).core;multi.players.forEach(p=>{p.run.hp=1000;p.run.maxHp=1000;});
  await multi.startBattle({kind:'enc',enemies:['b_colossus'],rewards:{}});
  assert.equal(multi.prompts.length,count);assert.equal(multi.votes.length,count);assert.equal(multi.combats[0].enemies[0].maxHp,Math.ceil(G.ENEMIES.b_colossus.hp*multi.hpScale()));
  for(let seat=0;seat<count;seat++){assert.equal(multi.active,seat);await action(multi,'end');}
  assert.equal(multi.active,0);
  await action(multi,'support',{ally:count-1});assert.equal(multi.combats[count-1].hero.next.block,3);
  await assert.rejects(action(multi,'support',{ally:0}));await assert.rejects(multi.dispatch(count,{type:'end',rev:multi.rev}));
  multi.toMap();for(let i=0;i<count;i++)multi.toMap();assert.equal(multi.leader,1%count);
  const cp=multi.checkpoint();const restored=make(team,12,cp).core;assert.equal(restored.players.length,count);assert.equal(restored.leader,multi.leader);
  let waiting=multi.choose(count-1,{type:'hand',cards:multi.players[count-1].run.deck.slice(0,1),n:1,min:1}),qkey=multi.prompts[count-1].key;
  assert.throws(()=>multi.answer(0,qkey,[]));multi.answer(count-1,qkey,[multi.players[count-1].run.deck[0].uid]);await waiting;
 }
 // Six heroes: skip all downed seats, support a selected ally, and revive everyone after victory.
 const six=make(Array.from({length:6},(_,i)=>({name:'P'+i,hero:['knight','huntress','doll','maiden'][i%4]}))).core;
 await six.startBattle({kind:'enc',enemies:['rat'],rewards:{card:true,gold:2}});
 [1,2,4].forEach(i=>{six.combats[i].hero.hp=0;six.combats[i].finish('defeat');});await six.nextTurn(1);assert.equal(six.active,3);
 six.combats[0].enemies.forEach(e=>{e.alive=false;e.hp=0;});await six.battleEnded();assert.equal(six.phase,'map');[1,2,4].forEach(i=>assert.equal(six.players[i].run.hp,1));
 // A complete six-player adventure, with six simultaneous choices at room/reward boundaries.
 const team6=Array.from({length:6},(_,i)=>({name:'P'+i,hero:['knight','huntress','doll','maiden'][i%4]}));
 const full6=make(team6,46).core;full6.players.forEach(p=>{p.run.hp=1000;p.run.maxHp=1000;});full6.begin();
 for(let step=0;!full6.result&&step<2400;step++){
  if(full6.phase==='map')await full6.dispatch(full6.leader,{type:'enter',node:full6.players[0].game.reachable()[0],rev:full6.rev});
  else if(full6.phase==='combat'){const c=full6.combats[full6.active],cards=c.hand.filter(x=>c.canPlay(x)),card=cards.find(x=>G.CARDS[x.id].type==='atk')||cards[0];if(card)await action(full6,'play',{uid:card.uid,target:c.alive()[0].uid});else if(c.hero.shiv)await action(full6,'shiv',{target:c.alive()[0].uid});else await action(full6,'end');}
  else await tick();
 }
 assert.equal(full6.result,'victory');assert.equal(soloWrites,0);
 clearTimeout(watchdog);console.log('Co-op core passed (2–6 players, complete six-player act): separate heroes/decks/HP, shared enemies, authoritative actions, stale/duplicate rejection, turn rotation, support, revival, defeat, boss victory, split scaling, owned prompts, room progression, checkpoints, solo save isolation.');
}
main().catch(e=>{console.error(e);process.exit(1);});

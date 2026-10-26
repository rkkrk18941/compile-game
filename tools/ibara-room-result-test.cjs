/* Decisions stay visible until acknowledged; reloading a receipt never reapplies its effects. */
'use strict';
const assert=require('node:assert/strict'),S=require('./ibara-bg-sim.cjs').load();
const tick=()=>new Promise(r=>setImmediate(r));
function game(n=1){const run=S.Game.newRun({players:['W','G'].slice(0,n).map((ch,i)=>({ch,name:'人'+i})),seed:12});const g=new S.Game(run,{});g.setupDecks();g.setupAct(1);run.phase='room';return g;}
function queue(g){const qs=[];g.io.ask=(pi,q)=>new Promise(resolve=>qs.push({pi,q,resolve}));return qs;}
async function pop(qs,type){await tick();assert.ok(qs.length,'missing '+type);const x=qs.shift();assert.equal(x.q.type,type);return x;}
function shop(g){g.run.players[0].gold=10;g.run.room={t:'$',step:'shop',shop:{relics:[],potions:[{id:'Blood',price:3}],cards:[[]],colorless:[],removed:{},done:{}}};}
(async()=>{
 let g=game();shop(g);let qs=queue(g);g.playRoom();(await pop(qs,'shop')).resolve({act:'potion',idx:0});
 const receipt=await pop(qs,'info');assert.match(receipt.q.title,/選択した結果/);assert.equal(g.run.players[0].gold,7);assert.equal(g.run.players[0].potions.length,1);assert.equal(qs.length,0);assert.ok(g.run.room.shop.receipts[0]);
 assert.match(g.resultText(receipt.q.result),/10 → 7/);assert.match(g.resultText(receipt.q.result),/血のポーション/);
 // Resume from the receipt with its exact already-applied result, rather than buying again.
 g=new S.Game(JSON.parse(JSON.stringify(g.run)),{});qs=queue(g);g.playRoom();const resumed=await pop(qs,'info');assert.equal(g.run.players[0].gold,7);assert.equal(g.run.players[0].potions.length,1);resumed.resolve(true);
 (await pop(qs,'shop')).resolve({act:'leave'});const roomResult=await pop(qs,'info');assert.match(roomResult.q.ok,/マップへ/);assert.equal(g.run.phase,'room');assert.equal(qs.length,0);roomResult.resolve(true);await tick();assert.equal(g.run.phase,'map');assert.equal(g.run.room,null);
 g.run.map={pos:'0-0',nodes:{'0-0':{r:0,c:0,t:'$'},'1-0':{r:1,c:0,t:'M'}},edges:{'0-0':['1-0'],'1-0':[]},visited:['0-0']};const mapJob=g.mapPhase();const mapQ=await pop(qs,'map');assert.equal(mapQ.q.options.length,1);assert.equal(g.run.phase,'map');assert.equal(g.run.map.pos,'0-0');mapQ.resolve('1-0');await mapJob;assert.equal(g.run.map.pos,'1-0');
 // Only the fixed opening battle skips the map, including after reloading before entry.
 for(const n of [1,2])for(let seed=1;seed<=12;seed++){
  const initial=game(n);initial.run.seed=seed;initial.run.rs=seed;initial.setupAct(1);initial.run.phase='map';const options=initial.reachable(false);assert.equal(options.length,1);assert.equal(initial.run.map.nodes[options[0]].t,'M');
  const restored=new S.Game(JSON.parse(JSON.stringify(initial.run)),{}),asked=queue(restored);let mapPaints=0;restored.io.update=()=>{if(restored.run.phase==='map')mapPaints++;};await restored.mapPhase();assert.equal(asked.length,0);assert.equal(mapPaints,0);assert.equal(restored.run.phase,'room');assert.equal(restored.run.room.first,true);assert.equal(restored.run.map.visited.length,1);
 }
 // A later act's first room still requires an explicit selection.
 {const later=game();later.setupAct(2);later.run.phase='map';const asked=queue(later),job=later.mapPhase(),q=await pop(asked,'map');q.resolve(q.q.options[0]);await job;assert.equal(later.run.room.first,false);}
 // An event must show the actual HP change and chosen option, and restore that result without healing twice.
 g=game();g.run.players[0].hp=2;g.run.decks.events=['Library'];g.run.room={t:'?',key:'2-0',step:'enter'};qs=queue(g);g.playRoom();(await pop(qs,'option')).resolve('sleep');const ev=await pop(qs,'info');assert.equal(g.run.players[0].hp,5);assert.match(ev.q.text,/睡眠/);assert.match(ev.q.text,/HP 2 → 5/);
 g=new S.Game(JSON.parse(JSON.stringify(g.run)),{});qs=queue(g);const restored=g.playRoom();const restoredQ=await pop(qs,'info');assert.equal(g.run.players[0].hp,5);restoredQ.resolve(true);await restored;assert.equal(g.run.players[0].hp,5);assert.equal(g.run.phase,'map');
 // Wait for every person, and keep individual acknowledgements across saves.
 g=game(2);const before=g.resultSnapshot();g.run.players[0].gold+=2;g.run.room={t:'?',step:'event',resultReview:g.resultReport(before,'結果','マップへ')};qs=queue(g);g.playRoom();const q0=await pop(qs,'info'),q1=await pop(qs,'info');q0.resolve(true);await tick();assert.equal(g.run.phase,'room');assert.equal(g.run.room.resultReview.done[0],true);assert.ok(!g.run.room.resultReview.done[1]);
 g=new S.Game(JSON.parse(JSON.stringify(g.run)),{});qs=queue(g);const co=g.playRoom();const only=await pop(qs,'info');assert.equal(only.pi,1);assert.equal(qs.length,0);only.resolve(true);await co;assert.equal(g.run.phase,'map');
 // An event battle pauses before creating enemies or resolving any combat turns.
 g=game();g.run.room={t:'?',step:'event',event:'Hallway',resultChoices:[{pi:null,label:'[戦闘]'}]};g.run.room.resultBefore=g.resultSnapshot();qs=queue(g);g.fight({kind:'normal',encs:[],eventFight:true});const battle=await pop(qs,'info');assert.match(battle.q.ok,/戦闘を始める/);assert.equal(g.run.combat,null);assert.match(battle.q.text,/戦闘/);
 // Changes include duplicates, card upgrades, removal, added relics and an immediate-use relic disappearing.
 g=game();g.run.players[0].potions=['Blood','Blood'];const b=g.resultSnapshot(),p=g.run.players[0];p.deck[0].up=true;const removed=p.deck.splice(1,1)[0];p.potions.pop();p.relics.push({id:'PenNib'});const r=g.resultReport(b,'結果','進む');assert.equal(r.rows[0].upgradedCards.length,1);assert.equal(r.rows[0].removedCards[0].u,removed.u);assert.equal(r.rows[0].removedPotions.length,1);assert.equal(r.rows[0].addedRelics[0],'PenNib');
 g=game();const keysBefore=g.resultSnapshot();g.run.keys.ruby=true;g.run.portal=true;const keyReport=g.resultReport(keysBefore,'結果','進む');assert.match(g.resultText(keyReport),/ルビーの鍵/);assert.match(g.resultText(keyReport),/ポータル/);
 // Wrath is +1 per hit, and its end-turn damage is blockable. Leaving it removes that penalty.
 for(const block of [0,1]){g=game();const cb=S.Combat.create(g,{kind:'normal'});g.run.combat=cb.s;g.combat=cb;cb.s.phase='play';const pc=cb.pcs()[0];pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};pc.hand=[];const e=cb.spawn('JawWorm',0,{lvl:'easy',beh:'sda'});pc.blk=block;let hp=g.run.players[0].hp;await cb.setStance(pc,'wrath');assert.equal(g.run.players[0].hp,hp);const old=e.hp;await cb.attack(pc,e,[1,1]);assert.equal(old-e.hp,4);await cb.endTurn();assert.equal(g.run.players[0].hp,hp-(block?0:1));}
 g=game();let cb=S.Combat.create(g,{kind:'normal'});g.run.combat=cb.s;g.combat=cb;cb.s.phase='play';const pc=cb.pcs()[0];pc.t={};pc.hand=[];cb.spawn('JawWorm',0,{lvl:'easy',beh:'sda'});await cb.setStance(pc,'wrath');await cb.setStance(pc,'calm');const hp=g.run.players[0].hp;await cb.endTurn();assert.equal(g.run.players[0].hp,hp);
 console.log('ok: purchase/event results pause, receipts restore without duplicate charges/heals, opening battle skips the map; subsequent routes and acts require selection, co-op acknowledgement persists, event fights pause before combat, inventory/upgrade diffs and real Wrath damage/timing/block/leaving stance');
})().catch(e=>{console.error(e);process.exitCode=1;});

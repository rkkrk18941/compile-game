/* Item shortcuts remain above the hand and inspect before consuming. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,30));
async function click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();await tick();}
(async()=>{
 await tick();const run=S.Game.newRun({players:[{ch:'B'}],seed:61}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);const cb=S.Combat.create(g,{kind:'normal'});g.combat=cb;run.combat=cb.s;run.phase='combat';cb.s.phase='play';const pc=cb.pcs()[0],p=run.players[0];pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};cb.spawn('SmallSlime',0);
 p.potions=['Fire','Fairy','GamblersBrew'];p.relics=[{id:'Anchor'},{id:'BlueCandle'},{id:'Akabeko',usedCombat:true},{id:'MummifiedHand'}];pc.hand=[{id:'StrikeB',u:g.uid(),up:false}];const calls=[];
 A.screen='game';A.me=0;A.ui={};A.view=null;A.sess={run:()=>run,pending:()=>[],waiting:()=>[],playOpen:()=>true,hand:()=>S.Session.handInfo(run,0),command:(pi,c)=>{calls.push(c);return Promise.resolve();},answer:()=>Promise.resolve()};const before=JSON.stringify(run);S.UI.draw();
 const belt=d.querySelector('.battle-items'),hand=d.querySelector('.hand');assert.ok(belt&&hand);assert.ok(belt.compareDocumentPosition(hand)&w.Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(!hand.contains(belt));assert.equal(d.querySelectorAll('.battle-item').length,6);assert.equal(d.querySelectorAll('.battle-item.available').length,2);assert.equal(d.querySelectorAll('.hand .card').length,1);assert.equal(JSON.stringify(run),before);
 assert.match(belt.textContent,/自動/);assert.match(belt.textContent,/出目変更時/);assert.match(belt.textContent,/条件待ち/);assert.match(belt.textContent,/使用済み/);assert.match(belt.textContent,/横へ/);
 await click('.battle-items [data-a=pot][data-v="0"]');assert.match(d.querySelector('.info-sheet').textContent,/4ダメージ/);assert.equal(calls.length,0);assert.equal(JSON.stringify(run),before);await click('.info-sheet [data-a=usepot]');assert.equal(calls.length,1);assert.equal(calls[0].type,'potion');assert.equal(calls[0].slot,0);
 await click('.battle-items [data-a=relic][data-v="1"]');assert.equal(calls.length,1);assert.match(d.querySelector('.info-sheet').textContent,/手札を2枚まで廃棄/);await click('.info-sheet [data-a=userelic]');assert.equal(calls.at(-1).type,'relic');assert.equal(calls.at(-1).id,'BlueCandle');
 await click('.battle-items [data-a=relic][data-v="3"]');assert.ok(d.querySelector('.info-sheet [data-a=userelic]').disabled);assert.match(d.querySelector('.info-sheet').textContent,/まだパワーを使っていません/);await click('.info-sheet [data-a=close]');
 pc.ready=true;S.UI.draw();assert.equal(d.querySelectorAll('.battle-item.available').length,0);await click('.battle-items [data-a=pot][data-v="0"]');assert.ok(d.querySelector('.info-sheet [data-a=usepot]').disabled);await click('.info-sheet [data-a=close]');pc.ready=false;
 p.potions.splice(0,1);p.relics=p.relics.filter(r=>!S.RELICS[r.id].activate);S.UI.draw();assert.equal(d.querySelectorAll('.battle-item').length,2);assert.match(d.querySelector('.battle-item[data-v="0"]').textContent,/妖精/);assert.equal(d.querySelectorAll('.hand .card').length,1);
 p.potions=[];S.UI.draw();assert.equal(d.querySelector('.battle-items'),null,'empty inventory uses no extra vertical space');assert.equal(errors.length,0,errors.join('\n'));
 console.log('ok: item row precedes and does not contain the hand; potion/manual relic shortcuts, availability/passive/die-only/condition/used states, inspect-before-use, ready-state restrictions and consumed/empty inventories');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

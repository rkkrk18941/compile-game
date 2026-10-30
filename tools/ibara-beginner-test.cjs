/* Beginner assistance, selection, saved games and host/guest settings. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),errors=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,25));
const make=(mode,ch='B',n=1,asc=0)=>S.Game.newRun({mode,players:[ch,...['R','G','B','W'].filter(c=>c!==ch)].slice(0,n).map(ch=>({ch})),asc,seed:7});
async function click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();await tick();}
(async()=>{
 await tick();
 for(const ch of ['R','G','B','W'])for(const n of [1,4]){
  const normal=make('normal',ch,n),easy=make('beginner',ch,n,13);
  assert.equal(easy.asc,0,'beginner cannot accidentally retain Ascension');
  easy.players.forEach((p,i)=>{assert.equal(p.maxHp,normal.players[i].maxHp+2);assert.equal(p.hp,p.maxHp);assert.equal(p.potions.length,0,'no unapproved starting potion');});
  assert.equal(JSON.stringify(easy.players.map(p=>p.deck)),JSON.stringify(normal.players.map(p=>p.deck)),'starting cards remain identical');
  const g=new S.Game(easy,{}),g0=new S.Game(normal,{});g.setupDecks();g0.setupDecks();g.setupAct(1);g0.setupAct(1);
  assert.equal(JSON.stringify(easy.decks),JSON.stringify(normal.decks),'no changes to RNG or reward/encounter decks');
  const cb=S.Combat.create(g,{kind:'boss'}),cb0=S.Combat.create(g0,{kind:'boss'});
  assert.equal(JSON.stringify(cb.spawn('SlimeBoss',-1)),JSON.stringify(cb0.spawn('SlimeBoss',-1)),'enemy HP and actions remain unchanged');
  const snapshot=JSON.stringify(easy),restored=JSON.parse(snapshot);new S.Game(restored,{});assert.equal(JSON.stringify(restored),snapshot,'resume never applies the HP bonus again');
 }
 for(const mode of ['normal','beginner',undefined])for(const relic of [null,'RegalPillow','CoffeeDripper','MarkOfPain']){
  const run=make(mode);if(mode===undefined)delete run.mode;const p=run.players[0];p.hp=1;if(relic)p.relics.push({id:relic});run.room={done:{}};let prompt;
  const g=new S.Game(run,{ask:async(pi,q)=>{prompt=q;return 'rest';}});await g.restFor(p);
  const amount=3+(mode==='beginner'?1:0)+(relic==='RegalPillow'?3:0);
  assert.match(prompt.options[0].label,new RegExp('HPを'+amount+'回復'));
  assert.equal(p.hp,relic==='CoffeeDripper'?1:Math.min(g.maxHp(p),1+amount));
  const hp=p.hp;g.heal(p,99);assert.equal(p.hp,g.maxHp(p));assert.ok(p.hp>=hp,'healing caps at actual maximum HP');
 }
 // Selection is on character screens; inspecting or changing it must never touch an existing save.
 const oldSave='existing-adventure';w.localStorage.setItem('ibara.bg.save.v3',oldSave);w.localStorage.setItem('ibara.bg.unlock.v1',JSON.stringify({asc:13,ch:{R:0,G:0,B:0,W:0}}));
 A.screen='title';S.UI.draw();assert.equal(d.querySelectorAll('[data-a=mode]').length,0,'no extra title controls');
 await click('[data-a=go][data-v=solo]');await click('[data-a=pickch][data-v=B]');await click('[data-a=asc][data-v="5"]');
 await click('[data-a=mode][data-v=beginner]');assert.match(d.querySelector('.charbtn.on .cn').textContent,/HP11/);assert.equal(d.querySelectorAll('[data-a=asc]').length,0);assert.equal(d.querySelector('[data-starter-id=AscendersBane]'),null);assert.match(d.querySelector('.mode-picker').textContent,/最大HP＋2・休憩の回復＋1/);
 await click('[data-a=pickch][data-v=R]');assert.match(d.querySelector('.charbtn.on .cn').textContent,/HP12/);assert.equal(A.setup.mode,'beginner');
 await click('[data-a=mode][data-v=normal]');assert.equal(A.setup.asc,5,'normal Ascension choice is retained');assert.ok(d.querySelector('[data-starter-id=AscendersBane]'));
 assert.equal(w.localStorage.getItem('ibara.bg.save.v3'),oldSave);
 await click('[data-a=mode][data-v=beginner]');
 // Start/resume go through their real UI handlers; avoid running the background game loop in this test.
 S.Session.Local.prototype.start=function(){if(!this.g.run.map){this.g.setupDecks();this.g.setupAct(1);this.g.run.phase='map';}};
 await click('[data-a=startsolo]');assert.equal(A.sess.run().mode,'beginner');assert.equal(A.sess.run().players[0].maxHp,12);assert.equal(A.sess.run().asc,0);assert.match(d.querySelector('.topbar .act').textContent,/初心者/);
 const saved=JSON.parse(w.localStorage.getItem('ibara.bg.save.v3'));assert.equal(saved.run.mode,'beginner');
 A.screen='title';A.sess=null;S.UI.draw();await click('[data-a=resume]');assert.equal(A.sess.run().mode,'beginner');assert.equal(A.sess.run().players[0].maxHp,12);
 // Character/card boxes still progress, but assisted wins do not unlock higher Ascension.
 w.localStorage.setItem('ibara.bg.unlock.v1',JSON.stringify({asc:0,ch:{R:0,G:0,B:0,W:0}}));const result=A.sess.run();result.phase='over';result.result='victory';result.bosses=3;A.ui={};S.UI.draw();
 let unlock=JSON.parse(w.localStorage.getItem('ibara.bg.unlock.v1'));assert.equal(unlock.asc,0);assert.equal(unlock.ch.R,4);assert.match(d.querySelector('.result').textContent,/初心者モード/);
 result.mode='normal';A.ui={};S.UI.draw();unlock=JSON.parse(w.localStorage.getItem('ibara.bg.unlock.v1'));assert.equal(unlock.asc,1,'unassisted win still unlocks next Ascension');
 // Host changes publish both fields; guests receive a read-only description and adjusted HP preview.
 A.screen='lobby';A.sess=null;A.ui={};A.guest=null;let published=0;const roster=[{seat:0,ch:'R',name:'Host',online:true,unlock:0},{seat:1,ch:'B',name:'Guest',online:true,unlock:0}];
 A.host={roster:{started:false,view:()=>roster},settings:{},publishRoster:()=>published++};S.UI.draw();await click('[data-a=mode][data-v=beginner]');assert.equal(A.host.settings.mode,'beginner');assert.equal(A.host.settings.asc,0);assert.equal(published,1);
 A.host=null;A.guest={seat:1,roster,settings:{mode:'beginner',asc:0}};S.UI.draw();assert.equal(d.querySelectorAll('[data-a=mode]').length,0,'guest cannot change host difficulty');assert.equal(d.querySelector('.charbtn'),null,'lobby does not reserve characters');assert.match(d.getElementById('app').textContent,/ホストが選択/);A.screen='characters';roster[1].ch=null;S.UI.draw();assert.match(d.querySelector('[data-a=pickonlinech][data-v=B] .cn').textContent,/HP11/);
 assert.deepEqual(errors,[]);console.log('ok: beginner/normal/legacy HP and rest, all heroes/party sizes, unchanged enemies/cards, save/resume, selection without title clutter, unlocks and host/guest settings');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

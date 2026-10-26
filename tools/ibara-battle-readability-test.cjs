/* Replay actual defeat/death-effect/next-enemy events against the final run, then check readable lifetimes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
 await tick();const run=S.Game.newRun({players:[{ch:'R',name:'あなた'}],seed:61}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);run.players[0].hp=run.players[0].maxHp=100;
 const cb=S.Combat.create(g,{kind:'normal'});run.combat=cb.s;g.combat=cb;run.phase='combat';cb.s.phase='enemy';cb.s.round=2;cb.pcs()[0].t={};cb.pcs()[0].hand=run.players[0].deck.slice(0,2);
 const fungi=cb.spawn('FungiBeast',0),worm=cb.spawn('JawWorm',0,{lvl:'easy',beh:'aaa'});fungi.hp=1;const events=[];
 g.io.emit=ev=>{if(ev.t!=='log')ev.vs=S.Session.visual(run);events.push(JSON.parse(JSON.stringify(ev)));};
 await cb.damageEnemy(fungi,1,{src:'ライトニング'});cb.enemyStr(worm,1);await cb.enemyAct(worm);
 assert.ok(fungi.dead&&!worm.dead);const death=events.findIndex(e=>e.t==='die'),effect=events.findIndex(e=>e.t==='ptok'),hit=events.findIndex(e=>e.t==='ehit');assert.ok(death<effect&&effect<hit);assert.equal(events[hit].u,worm.u);assert.match(events[effect].source,/撃破時/);assert.equal(events.filter(e=>e.t==='ehit'&&e.u===fungi.u).length,0,'defeated enemies never gain a fake attack');
 const before=JSON.stringify(run);A.screen='game';A.me=0;A.ui={};A.view=null;A.sess={run:()=>run,pending:()=>[],waiting:()=>[],hand:()=>S.Session.handInfo(run,0),playOpen:()=>true,command:()=>Promise.resolve()};S.UI.draw();
 const animations=[];w.Element.prototype.animate=function(frames,options){animations.push({el:this,frames,options});return {};};
 w.Element.prototype.getBoundingClientRect=function(){const x=this.closest('.hero')?20:this.closest('.foe')?230:0;return{x,y:160,left:x,top:160,width:100,height:100,right:x+100,bottom:260};};
 let now=0,serial=0;const timers=new Map();w.setTimeout=(f,ms=0)=>{const id=++serial;timers.set(id,{at:now+ms,f});return id;};w.clearTimeout=id=>timers.delete(id);
 const advance=ms=>{now+=ms;let pending;while((pending=[...timers].find(([,v])=>v.at<=now))){timers.delete(pending[0]);pending[1].f();}};
 for(const speed of [1,1.6,2.6]){
  const director=new S.Director({me:()=>0,speed:()=>speed,sfx:()=>{},playerName:()=> 'あなた',enemyName:u=>S.MONSTERS[cb.enemy(u).id].name,partySize:()=>1,round:()=>2,setView:f=>{A.view=f;},draw:()=>S.UI.draw()});
  for(const ev of events){const start=animations.length,wait=director.play(ev);if(ev.t==='ehit'){
   const body=d.querySelector('.foe[data-u="'+worm.u+'"] .body');assert.ok(body,'surviving attacker is present after the other enemy dies');assert.equal(d.querySelector('.foe[data-u="'+fungi.u+'"]'),null);
   const move=animations.slice(start).find(a=>a.el===body&&a.frames.some(k=>String(k.transform).includes('translate(')));assert.ok(move,'the correct living enemy lunges');assert.ok(move.options.duration>=440);assert.ok(wait/speed>=move.options.duration,'damage snapshot cannot interrupt the strike');
  }}
  assert.match(d.querySelector('.fx-effect-notices').textContent,/被ダメージ×2/);assert.match(d.querySelector('.fx-effect-notices').textContent,/胞子雲（撃破時）/);assert.match(d.querySelector('.fx-effect-notices').textContent,/ダメージ＋1/);
  director.pump();assert.ok(d.querySelector('.fx-effect-notice'),'queue completion must not erase effects');advance(3999);assert.ok(d.querySelector('.fx-effect-notice'),'speed-independent four-second lifetime');advance(1);assert.equal(d.querySelector('.fx-effect-notice'),null);
  director.on_ptok({i:0,k:'weak'});advance(2500);director.on_ptok({i:0,k:'weak'});assert.equal(d.querySelectorAll('.fx-effect-notice').length,1,'same effect renews instead of overlapping');advance(1501);assert.match(d.querySelector('.fx-effect-notice').textContent,/ダメージ−1/);advance(2499);assert.equal(d.querySelector('.fx-effect-notice'),null);
  director.on_tok({u:worm.u,k:'vuln'});assert.equal(d.querySelectorAll('.fx-effect-notice').length,1);director.clearNotices();assert.equal(d.querySelector('.fx-effect-notices'),null);
 }
 // Metadata reports the actual capped gain without changing the underlying strength rule.
 assert.equal(JSON.stringify(run),before,'replay never changes run state');
 // Ordinary taps cannot fast-forward the enemy turn; skipping requires the labeled control.
 const realDirector=S.UI.director,oldSkip=realDirector.skip;let skips=0;realDirector.skip=()=>{skips++;};realDirector.busy=true;A.view={vs:events[hit].vs};A.ui={};S.UI.draw();
 for(const selector of ['.field-scroll','.battle-guide','.hand .card']){d.querySelector(selector).click();await tick();assert.equal(skips,0,selector+' must not discard attacks');assert.ok(A.view);}
 A.ui.sel=null;S.UI.draw();const skip=d.querySelector('[data-a=skipreplay]');assert.ok(skip);assert.match(skip.textContent,/演出を省略/);skip.click();assert.equal(skips,1);realDirector.skip=oldSkip;realDirector.busy=false;A.view=null;
 worm.str=S.DATA.CAP.str;const n=events.length;cb.enemyStr(worm,1);assert.equal(events[n].n,0);assert.equal(worm.str,S.DATA.CAP.str);
 assert.deepEqual(errors,[]);dom.window.close();
 console.log('ok: actual kill → death effect → surviving enemy attack, actor identity and completed strikes at three speeds; four-second independent effect receipts, renewal, idle survival and capped-strength metadata');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

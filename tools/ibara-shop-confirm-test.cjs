/* Shop inspection must never spend gold; only explicit, current confirmation may buy. */
'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[], vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,35));
let run,g,prompt,answers,jobs;
function setup(){
 run=S.Game.newRun({players:[{ch:'R'}],seed:61});g=new S.Game(run,{});g.setupDecks();g.setupAct(1);run.phase='room';
 run.players[0].gold=20;run.players[0].relics=[{id:'Anchor'}];run.players[0].potions=['Blood'];
 run.room={t:'M',shop:{relics:[{id:'Vajra',price:7}],potions:[{id:'Ancient',price:2}],cards:[[{id:'PommelStrike',price:2}]],colorless:[{id:'Finesse',price:2}],removed:[],done:[]}};
 prompt={id:71,q:{type:'shop',removePrice:3}};answers=[];jobs=[];
 A.screen='game';A.me=0;A.ui={};A.view=null;A.sess={run:()=>run,pending:()=>prompt?[prompt]:[],waiting:()=>[],answer:(id,v)=>{answers.push({id,v});if(v.act!=='remove')jobs.push(g.shopAction(run.players[0],v));return Promise.resolve();}};
 S.UI.draw();
}
async function click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();await tick();}
async function open(kind){await click('[data-a=shopinspect][data-kind='+kind+']');assert.ok(d.querySelector('.shop-detail'));}
(async()=>{
 await tick();
 for(const kind of ['card','colorless','potion','relic','remove']){
  setup();const before=JSON.stringify(run);await open(kind);
  assert.equal(JSON.stringify(run),before);assert.equal(answers.length,0);
  assert.ok(d.querySelector('.shop-detail .evtext').textContent.length>0);
  assert.match(d.querySelector('.shop-detail').textContent,/価格：.*購入後の残金/);
  assert.equal(d.querySelector('.shop-detail .sheet').dataset.keep,'shop-detail');
  await click('.shop-detail [data-a=close]');assert.equal(JSON.stringify(run),before);assert.equal(answers.length,0);
  await open(kind);const button=d.querySelector('[data-a=shopconfirm]');button.click();button.click();await tick();await Promise.all(jobs);
  assert.equal(answers.length,1,'double confirmation submits once');assert.equal(answers[0].v.act,kind);
  if(kind!=='remove'){
   assert.equal(run.players[0].gold,20-(kind==='relic'?7:2));
   if(kind==='card'||kind==='colorless')assert.equal(run.players[0].deck.length,JSON.parse(before).players[0].deck.length+1);
   if(kind==='potion')assert.deepEqual(Array.from(run.players[0].potions),['Blood','Ancient']);
   if(kind==='relic')assert.ok(run.players[0].relics.some(r=>r.id==='Vajra'));
  }
 }
 setup();await open('card');await click('.shop-detail [data-help="card:PommelStrike"]');assert.ok(S.HelpUI.state.open);
 await click('[data-help-close]');assert.ok(d.querySelector('.shop-detail'));assert.equal(answers.length,0);
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await tick();assert.equal(A.ui.info,null);
 await open('potion');await click('.shop-detail');assert.equal(A.ui.info,null);assert.equal(answers.length,0);
 for(const reason of ['poor','sold','full','sozu','asc4']){
  setup();if(reason==='poor')run.players[0].gold=0;
  if(reason==='sold')run.room.shop.potions[0].sold=true;
  if(reason==='full')run.players[0].potions=['Blood','Blood','Blood'];
  if(reason==='sozu')run.players[0].relics.push({id:'Sozu'});
  if(reason==='asc4'){run.asc=4;run.players[0].potions=['Blood','Blood'];}
  S.UI.draw();const before=JSON.stringify(run);await open('potion');assert.ok(d.querySelector('[data-a=shopconfirm]').disabled,reason);
  await click('[data-a=shopconfirm]');assert.equal(answers.length,0);assert.equal(JSON.stringify(run),before);
 }
 for(const stale of ['sold','gold','prompt','item','price']){
  setup();await open('relic');const old=d.querySelector('[data-a=shopconfirm]');
  if(stale==='sold')run.room.shop.relics[0].sold=true;
  if(stale==='gold')run.players[0].gold=0;
  if(stale==='prompt')prompt={id:72,q:{type:'shop',removePrice:3}};
  if(stale==='item')run.room.shop.relics[0].id='Anchor';
  if(stale==='price')run.room.shop.relics[0].price=9;
  const before=JSON.stringify(run);old.click();await tick();assert.equal(answers.length,0,stale);assert.equal(JSON.stringify(run),before,stale);
 }
 setup();await click('[data-a=pot]');assert.match(d.querySelector('.info-sheet').textContent,/HPを2回復/);assert.equal(answers.length,0);
 await click('.info-sheet [data-a=close]');await click('[data-a=relic]');assert.match(d.querySelector('.info-sheet').textContent,/戦闘開始時/);assert.equal(answers.length,0);
 assert.deepEqual(errors,[]);console.log('ok: all shop types inspect/cancel/confirm, exactly one purchase, effects, nested help, dismissal, affordability, capacity, Sozu, stale co-op state and inventory inspection');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

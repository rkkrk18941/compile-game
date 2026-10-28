/* The active power list must not squeeze the preview/actions or collapse the battlefield.
   Requires Playwright. Optional CHROMIUM_EXECUTABLE, QA_FONT and SHOTS paths. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),port=8862;
const server=spawn(process.execPath,['serve.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});let browser;
const ready=new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited: '+code)));});
(async()=>{
 await ready;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 if(process.env.QA_FONT)await page.route('**/__qa-font.otf',r=>r.fulfill({body:fs.readFileSync(process.env.QA_FONT),contentType:'font/otf'}));
 if(process.env.OLD_BATTLE_CSS)await page.route('**/battle.css?*',r=>r.fulfill({body:fs.readFileSync(process.env.OLD_BATTLE_CSS),contentType:'text/css'}));
 let checked=0;
 for(const [width,height]of [[320,640],[360,640],[390,732],[390,844],[844,390],[1366,900]]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:'+port+'/ibara/?anim=off');
  if(process.env.QA_FONT){await page.addStyleTag({content:"@font-face{font-family:QAJP;src:url('/__qa-font.otf')} :root{--f-jp:QAJP,sans-serif;--f-min:QAJP,serif}"});await page.evaluate(()=>document.fonts.load('14px QAJP'));}
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.evaluate(()=>{Element.prototype.animate=()=>({cancel(){},finished:Promise.resolve()});});
  for(const powers of [2,0,10])for(const select of [null,'Claw','Leap'])for(const split of [false,true]){
   const result=await page.evaluate(async({powers,select,split})=>{
    const S=STS,A=S.UI.state,run=S.Game.newRun({players:[{ch:'B',name:'冒険者'}],seed:7}),g=new S.Game(run,{});g.setupDecks();g.setupAct(2);run.act=2;
    const P=run.players[0];P.hp=5;P.potions=['Ancient','Fairy'];P.relics.push({id:'Lantern'},{id:'FrozenCore'},{id:'DollysMirror'});
    const cb=S.Combat.create(g,{kind:'elite'});g.combat=cb;run.combat=cb.s;run.phase='combat';cb.s.phase='play';cb.s.round=3;cb.s.die=5;
    const pc=cb.pc(0);pc.en=3;pc.blk=2;pc.t={};pc.orbs=['lightning','lightning','lightning'];
    const ids=['DefendB','ReinforcedBody','Claw','StrikeB','Coolheaded','Leap'];pc.hand=ids.map(id=>({u:g.uid(),id,up:false}));pc.exh=[{u:g.uid(),id:'Zap',up:false}];pc.draw=pc.hand.slice(0,3);pc.disc=pc.hand.slice(0,5);
    const powerIds=['Loop','MachineLearning','Defragment','StaticDischarge','Electrodynamics','Heatsinks','Fusion','Buffer','Loop','MachineLearning'];
    pc.pow=powerIds.slice(0,powers).map((id,i)=>({u:g.uid(),id,up:i===0}));
    if(split){cb.spawn('LargeSlime',0);cb.spawn('AcidSlimeM',0);cb.spawn('SpikeSlimeM',0);}else{const e=cb.spawn('GremlinLeader',0);e.str=1;}
    cb.s.enemyResults=[{t:'enemyResult',u:1,id:'GremlinLeader',hits:[{i:0,damage:5,blocked:0,hp:5}]}];
    A.screen='game';A.me=0;A.ui=select?{sel:pc.hand.find(c=>c.id===select).u}:{};A.view=null;A.field=null;
    window.__powerCommands=[];A.sess={run:()=>run,pending:()=>[],waiting:()=>[],hand:()=>S.Session.handInfo(run,0),playOpen:()=>true,command:(pi,c)=>{window.__powerCommands.push(c);return Promise.resolve();}};window.__powerRun=run;
    const before=JSON.stringify(run);S.UI.draw();await new Promise(requestAnimationFrame);S.UI.draw();await new Promise(requestAnimationFrame);
    const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const field=rect(document.querySelector('.field-scroll')),controls=rect(document.querySelector('.battle-controls'));
    return{field,controls,preview:document.querySelector('.selection-hint')&&rect(document.querySelector('.selection-hint')),powers:document.querySelector('.powers')&&rect(document.querySelector('.powers')),actors:[...document.querySelectorAll('.hero,.foe')].map(e=>({hero:e.classList.contains('hero'),body:rect(e.querySelector('.face')||e.querySelector('.body')),plate:rect(e.querySelector('.hero-plate,.foe-plate')),intent:e.querySelector('.intent')&&rect(e.querySelector('.intent')),compact:e.querySelector('.intent')?.classList.contains('compact'),style:e.getAttribute('style')})),buttons:[...document.querySelectorAll('.battle-controls button:not(.powchip)')].map(rect),unchanged:before===JSON.stringify(run)};
   },{powers,select,split});
   const label=JSON.stringify({width,height,powers,select,split});
   assert.ok(result.unchanged,label+' rendering is read-only');
   assert.ok(result.controls.left>=0&&result.controls.right<=width+1,label+' control bounds');
   for(const r of result.buttons)assert.ok(r.left>=-1&&r.right<=width+1&&r.top>=0&&r.bottom<=height+1,label+' visible action '+JSON.stringify(r));
   if(select)assert.ok(result.preview.width>=160&&result.preview.height<120,label+' readable preview '+JSON.stringify(result.preview));
   if(powers)assert.ok(result.powers.height<=36.5&&result.powers.right<=width+1,label+' bounded power row');
   for(const actor of result.actors){const b=actor.body,p=actor.plate,f=result.field;
    assert.ok(b.width>4&&b.height>4,label+' sprites cannot disappear '+JSON.stringify({actor,field:result.field,controls:result.controls}));
    if(height>=700&&actor.hero)assert.ok(b.height>=40,label+' hero stays recognizable');
    if(height>=700&&!split&&!actor.hero)assert.ok(b.height>=50,label+' leader stays recognizable');
    if(actor.intent)assert.ok(actor.intent.top>=f.top-1&&actor.intent.right<=f.right+1&&actor.intent.left>=f.left-1,label+' forecast stays inside battlefield '+JSON.stringify({intent:actor.intent,f}));
    assert.ok(b.left>=f.left-1&&b.right<=f.right+1&&b.top>=f.top-1&&p.bottom<=f.bottom+1,label+' actor stays inside battlefield '+JSON.stringify({actor,f}));
   }
   if(process.env.SHOTS&&powers===2&&!split){fs.mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SHOTS,`powers-${width}-${height}-${select||'idle'}.png`)});}
   checked++;
  }
 }
 // Inspecting powers/cards remains harmless, and the visible action still submits the selected card once.
 const before=await page.evaluate(()=>JSON.stringify(__powerRun));
 await page.locator('.powchip').first().click();await page.waitForSelector('.info-sheet');await page.click('.info-sheet .sheet-close');
 await page.locator('.hand .card').nth(2).click();await page.click('.classic-preview [data-v=cardGuide]');await page.waitForSelector('.info-sheet');await page.click('.info-sheet .sheet-close');
 assert.equal(await page.evaluate(()=>__powerCommands.length),0,'inspection never plays cards or activates powers');
 await page.click('.classic-preview [data-a=playsel]');await page.locator('.foe.target').first().click();
 assert.equal(await page.evaluate(()=>__powerCommands.length),1);assert.equal(await page.evaluate(()=>__powerCommands[0].type),'play');
 assert.equal(await page.evaluate(()=>JSON.stringify(__powerRun)),before,'read-only test session preserves its run');
 assert.deepEqual(errors,[]);console.log(`ok: ${checked} real viewport/power/selection/enemy layouts; bounded controls, readable previews, complete actors and unchanged game state`);
})().catch(async e=>{console.error(e);if(process.env.SHOTS&&browser){fs.mkdirSync(process.env.SHOTS,{recursive:true});await browser.contexts()[0].pages()[0].screenshot({path:path.join(process.env.SHOTS,'failure.png')});}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});

/* Visible, usable delayed-revival exit at phone/desktop widths, including a real turn. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),port=8862;
const server=spawn(process.execPath,['serve.js'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','inherit']});
const ready=new Promise(r=>server.stdout.once('data',r));let browser;
(async()=>{
 await ready;browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());if(process.env.QA_FONT)await page.route('**/__qa-font.otf',r=>r.fulfill({body:fs.readFileSync(process.env.QA_FONT),contentType:'font/otf'}));
 let checked=0;
 for(const [width,height]of [[320,640],[390,732],[390,844],[844,390],[1366,900]]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:'+port+'/ibara/?anim=off');
  if(process.env.QA_FONT){await page.addStyleTag({content:"@font-face{font-family:QAJP;src:url('/__qa-font.otf')} :root{--f-jp:QAJP,sans-serif;--f-min:QAJP,serif}"});await page.evaluate(()=>document.fonts.load('14px QAJP'));}
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.evaluate(()=>{Element.prototype.animate=()=>({cancel(){},finished:Promise.resolve()});});
  for(const n of [1,4])for(const powers of [0,3,10]){
   await page.evaluate(async({n,powers})=>{
    const S=STS,A=S.UI.state,run=S.Game.newRun({players:['B','R','G','W'].slice(0,n).map(ch=>({ch})),seed:44}),g=new S.Game(run,{});g.setupDecks();g.setupAct(3);run.bosses=2;run.phase='room';run.room={t:'B',step:'fight',boss:'AwakenedOne'};
    const cb=S.Combat.create(g,{kind:'boss',enc:'Boss:AwakenedOne'});run.combat=cb.s;cb.s.phase='play';cb.s.round=5;cb.s.die=6;cb.spawn('AwakenedOne',-1);await cb.killEnemy(cb.alive()[0],{});
    const pc=cb.pc(0);pc.en=0;pc.t={};pc.hand=['CompileDriver','StrikeB','DefendB'].map(id=>({id,u:g.uid()}));pc.orbs=['frost','lightning'];pc.pow=Array.from({length:powers},(_,i)=>({id:['Loop','NoxiousFumes','Heatsinks'][i%3],u:g.uid(),up:i===0}));run.players[0].potions=['Ancient','Fairy'];run.players[0].relics.push({id:'FrozenCore'},{id:'SelfFormingClay',usedCombat:true});
    const sess=new S.Session.Local(run);A.screen='game';A.sess=sess;A.me=0;A.ui={};A.view=null;A.field=null;window.__bossJob=sess.start();await new Promise(r=>setTimeout(r,0));S.UI.draw();await new Promise(requestAnimationFrame);S.UI.draw();
   },{n,powers});
   const label=`${width}x${height} ${n} players ${powers} powers`;
   assert.match(await page.locator('.battle-revival').innerText(),/覚醒者.*まだ倒しきって/);
   const box=await page.locator('.battle-revival .btn').boundingBox();assert.ok(box&&box.width>=80&&box.height>=42&&box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height,label+' resurrection turn button fits');
   if(n===1){const f=await page.locator('.field-scroll').boundingBox(),h=await page.locator('.hero-plate').boundingBox();assert.ok(h.y+h.height<=f.y+f.height+1,label+' hero HP fits '+JSON.stringify({f,h}));}
   const end=await page.locator('.actbar [data-a=end]').boundingBox();assert.ok(end&&end.x+end.width<=width+1,label+' regular turn button fits');
   assert.equal(await page.locator('.battle-revival .btn').isEnabled(),true);
   if(width===390&&height===732&&n===1&&powers===3&&process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SHOTS,'awakening-phone.png')});}
   if(n===1&&powers===3){
    await page.click('.battle-revival [data-a=end]');
    await page.evaluate(async()=>{const sess=STS.UI.state.sess;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,0));for(const q of sess.pending())sess.answer(q.id,STS.autoAnswer(sess.g,q.pi,q.q));if(sess.g.combat.alive().length)break;}STS.UI.draw();});
    assert.equal(await page.evaluate(()=>STS.UI.state.sess.g.combat.alive().some(e=>e.id==='AwakenedOne2')),true,label+' button advances into second form');
    await page.evaluate(async()=>{const sess=STS.UI.state.sess,cb=sess.g.combat,pc=cb.pc(0),c={id:'Claw',u:sess.g.uid()};cb.alive().forEach(e=>{e.hp=1;e.blk=0;});pc.hand.push(c);await sess.command(0,{type:'play',u:c.u,target:cb.alive()[0].u});await window.__bossJob;STS.UI.draw();});
    assert.equal(await page.evaluate(()=>STS.UI.state.sess.run().result),'victory',label+' second form ends adventure');assert.equal(await page.locator('.battle-revival').count(),0);
   }
   checked++;
  }
 }
 assert.deepEqual(errors,[]);console.log(`ok: ${checked} revival/viewport/party/power layouts and real phone-to-victory button flows`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});

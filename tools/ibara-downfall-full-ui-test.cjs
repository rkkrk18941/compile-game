/* All eight characters, both adventures, new states and every official expansion boss on touch layouts. */
'use strict';const assert=require('assert/strict'),{spawn}=require('child_process'),{chromium}=require('playwright');
const port=8893,server=spawn(process.execPath,['serve.js'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','inherit']});
(async()=>{await new Promise(r=>server.stdout.once('data',r));const browser=await chromium.launch();try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());let count=0;
 for(const vp of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(vp);await page.goto('http://localhost:'+port+'/ibara/');
 for(const ch of ['R','G','B','W','S','U','H','M'])for(const adv of ['normal','downfall']){
  await page.evaluate(({ch,adv})=>{const S=STS,A=S.UI.state;A.screen='solo';A.setup.ch=ch;A.setup.adv=adv;A.setup.mode='normal';S.UI.draw();},{ch,adv});
  assert.equal(await page.locator('.starter-deck').count(),1,ch);assert.ok(await page.locator('.starter-row').count()>0);count++;
 }
 for(const id of ['DfWitch','DfDarkCore','DfWrathful','DfOrbMaster','DfInferno','DfTrickster','DfDemon','DfWraith','DfBlasphemer','DfNeow']){
  await page.evaluate(async id=>{const S=STS,A=S.UI.state,run=S.Game.newRun({players:[{ch:'U'},{ch:'H'},{ch:'M'},{ch:'S'}],adv:'downfall',seed:13}),g=new S.Game(run,{});g.io={ask:(pi,q)=>S.autoAnswer(g,pi,q)};g.setupDecks();g.setupAct(3);const cb=S.Combat.create(g,{kind:'boss',enc:'Boss:'+id});g.combat=cb;run.combat=cb.s;await cb.setup();await S.ENCOUNTERS['Boss:'+id].build(cb);for(const e of cb.s.enemies.slice()){const m=cb.mdef(e);if(m.start)await m.start(cb,e);}cb.s.round=3;cb.s.phase='play';cb.s.die=3;cb.pcs().forEach(pc=>{pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0};pc.hand=pc.draw.splice(-5);});run.phase='room';run.room={t:'B',step:'fight'};A.sess=new S.Session.Local(run);A.screen='game';A.me=0;A.ui={};A.view=null;A.field=null;S.UI.draw();},id);
  assert.ok(await page.locator('.combat').count(),id);await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(im=>im.complete?null:new Promise(r=>{im.onload=im.onerror=r;})));});
  const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(im=>!im.naturalWidth).map(im=>im.src));assert.deepEqual(broken,[],id);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,id+' horizontal overflow');count++;
  if(id==='DfNeow'&&vp.width===390)await page.screenshot({path:'/tmp/df-neow-phone.png'});
 }
 }
 assert.deepEqual(errors,[]);console.log('ok: '+count+' all-character selection / official boss touch fixtures; no broken images, page errors or horizontal overflow');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());

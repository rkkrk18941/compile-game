/* Real Slime Boss death/summons, saved games and replay frames in Chromium.
   NODE_PATH=<playwright modules> [CHROMIUM_EXECUTABLE=...] node tools/ibara-slime-split-ui-test.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'), port = 8857;
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if(process.env.QA_FONT)await page.route('**/__qa-font.otf',r=>r.fulfill({body:fs.readFileSync(process.env.QA_FONT),contentType:'font/otf'}));
  let checked = 0;
  for (const [width, height] of [[320,640],[360,640],[390,844],[844,390],[1366,900]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://localhost:' + port + '/ibara/');
    if(process.env.QA_FONT){
      await page.addStyleTag({content:"@font-face{font-family:QAJP;src:url('/__qa-font.otf')} :root{--f-jp:QAJP,sans-serif;--f-min:QAJP,serif}"});
      await page.evaluate(()=>document.fonts.load('14px QAJP'));
    }
    await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; }' });
    // Geometry checks inspect settled positions, independently of FLIP entrance animations.
    await page.evaluate(()=>{Element.prototype.animate=()=>({cancel(){},finished:Promise.resolve()});});
    for (const ch of ['R','G','B','W']) for (const n of [1,4]) {
      const result = await page.evaluate(async ({ ch, n }) => {
        const S=window.STS,A=S.UI.state,run=S.Game.newRun({players:Array.from({length:n},(_,i)=>({ch:i?['R','G','B','W'].filter(c=>c!==ch)[i-1]:ch,name:'あなた'})),seed:61});
        const g=new S.Game(run,{ask:async(pi,q)=>q.options&&q.options[0]});g.setupDecks();g.setupAct(1);
        const cb=S.Combat.create(g,{kind:'boss'});g.combat=cb;run.combat=cb.s;run.phase='combat';cb.s.phase='play';cb.s.round=4;cb.s.die=4;
        cb.pcs().forEach(pc=>{pc.en=3;pc.t={};pc.hand=run.players[pc.i].deck.slice(0,5);});
        const boss=cb.spawn('SlimeBoss',-1), beforeSplit=S.Session.visual(run);
        await cb.killEnemy(boss,{});const queued=cb.s.pending.length;
        await cb.startRound();cb.s.phase='play';cb.pcs().forEach(pc=>{pc.hand=run.players[pc.i].deck.slice(0,5);});
        const afterSplit=S.Session.visual(run);
        function bind(r){A.sess={run:()=>r,pending:()=>[],waiting:()=>[],hand:()=>S.Session.handInfo(r,0),playOpen:()=>true,command:()=>Promise.resolve()};}
        A.screen='game';A.me=0;A.ui={};A.view=null;A.field=null;bind(run);
        const settle=async()=>{S.UI.draw();await new Promise(requestAnimationFrame);S.UI.draw();};
        function measure(){
          const field=document.querySelector('.field-scroll').getBoundingClientRect();
          const actors=[...document.querySelectorAll('.hero,.foe')].map(el=>{
            const body=el.querySelector('.face')||el.querySelector('.body'),r=body.getBoundingClientRect(),plate=el.querySelector('.hero-plate,.foe-plate').getBoundingClientRect();
            return {hero:el.classList.contains('hero'),id:el.dataset.u,h:r.height,w:r.width,x:r.left,right:r.right,top:r.top,bottom:r.bottom,plateX:plate.left,plateRight:plate.right,plateBottom:plate.bottom};
          });
          return {field:{left:field.left,right:field.right,top:field.top,bottom:field.bottom},actors,sizes:[...document.querySelectorAll('.hero,.foe')].map(el=>el.getAttribute('style')),bossBands:document.querySelectorAll('.band.boss').length};
        }
        await settle();const split=measure(),unchanged=JSON.stringify(run);
        run.combat.enemies=run.combat.enemies.filter(e=>e!==boss);await settle();const cleaned=measure();run.combat.enemies.unshift(boss);
        const resumed=JSON.parse(JSON.stringify(run));bind(resumed);await settle();const saved=measure();
        bind(run);A.view={vs:beforeSplit};await settle();const replayBoss=measure();A.view={vs:afterSplit};await settle();const replaySplit=measure();A.view=null;
        // A second Large Slime death must not leave another hidden sizing slot behind.
        const large=cb.alive().find(e=>e.id==='LargeSlime');await cb.killEnemy(large,{});await cb.startRound();cb.s.phase='play';await settle();const later=measure();
        const stateBeforeDraw=JSON.stringify(run);await settle();const readonly=stateBeforeDraw===JSON.stringify(run);
        Object.assign(run,JSON.parse(unchanged));await settle();
        return {queued,split,cleaned,saved,replayBoss,replaySplit,later,readonly};
      }, { ch, n });
      const label=`${width}x${height} ${ch} ${n} players`;
      assert.equal(result.queued,3*n,label+' actual queued summons');
      assert.equal(result.split.actors.length,4*n,label+' three slimes per hero');
      assert.equal(result.replayBoss.actors.length,n+1,label+' replay retains living boss');
      assert.deepEqual(result.split.sizes,result.cleaned.sizes,label+' hidden defeated boss consumes no space');
      assert.deepEqual(result.split.sizes,result.saved.sizes,label+' resumed game uses same sizes');
      assert.deepEqual(result.split.sizes,result.replaySplit.sizes,label+' replay uses same sizes');
      assert.equal(result.split.bossBands,0,label+' no empty boss column');
      assert.ok(result.readonly,label+' drawing never mutates combat');
      for(const stage of ['split','saved','replayBoss','replaySplit','later']){
        const {field,actors}=result[stage];
        for(const a of actors){
          const info=label+' '+stage+' '+JSON.stringify({a,field});
          assert.ok(a.x>=field.left-1&&a.right<=field.right+1,info+' full artwork fits horizontally');
          assert.ok(a.plateX>=field.left-1&&a.plateRight<=field.right+1,info+' HP plate fits horizontally');
          if(n===1)assert.ok(a.top>=field.top-1&&a.plateBottom<=field.bottom+1,info+' full actor fits vertically');
          if(a.hero){assert.ok(a.h<=(width<640||height<560?120:180)+1,info+' compact hero cap');if(n===1&&stage!=='replayBoss'&&height>520)assert.ok(a.h>=55,info+' hero cannot collapse to a tiny sprite');}
        }
      }
      if(process.env.SHOTS&&ch==='B'&&n===1){
        // Restore the split fixture, rather than photographing the later round.
        await page.evaluate(()=>{const A=STS.UI.state;A.view=null;STS.UI.draw();});
        await page.screenshot({path:path.join(process.env.SHOTS,`slime-${width}.png`)});
      }
      checked++;
    }
  }
  assert.deepEqual(errors,[]);
  console.log(`ok: ${checked} viewport/character/party fixtures; real boss split, repeat summons, save/resume and replay bounds`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});

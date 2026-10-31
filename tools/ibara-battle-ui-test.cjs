/* Restored battle presentation: real UI, current rules/query layer and read-only mock session.
   NODE_PATH=/tmp/ibara-help-test/node_modules node tools/ibara-battle-ui-test.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const errors = [], vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.cause ? e.cause.stack : String(e)));
vc.on('error', e => errors.push(String(e)));
const dom = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url:'https://example.test/ibara/', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc });
const w = dom.window, doc = w.document;
for (const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui']) w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S = w.STS, A = S.UI.state, tick = () => new Promise(resolve => setTimeout(resolve,25));
(async () => {
  await tick();
  let checked = 0;
  for (const [width,height] of [[360,640],[390,844],[844,390],[1366,900]]) {
    w.innerWidth=width;w.innerHeight=height;
    for (const n of [1,2,3,4]) for (const boss of [false,true]) {
      const run=S.Game.newRun({players:['R','G','B','W'].slice(0,n).map(ch=>({ch})),seed:61});
      const g=new S.Game(run,{});g.setupDecks();g.setupAct(1);
      const cb=S.Combat.create(g,{kind:boss?'boss':'normal'});run.combat=cb.s;run.phase='combat';cb.s.phase='play';
      cb.pcs().forEach(pc=>{pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};});
      for(let r=0;r<n;r++) cb.spawn('JawWorm',r,{lvl:'easy',beh:'sda'});
      if(boss)cb.spawn('Guardian',-1);
      const strike={u:g.uid(),id:'StrikeR',up:false};cb.pcs()[0].hand.push(strike,{u:g.uid(),id:'Cleave',up:false});
      let calls=[];
      A.screen='game';A.me=0;A.ui={};A.sess={run:()=>run,pending:()=>[],hand:()=>S.Session.handInfo(run,0),playOpen:()=>true,command:(pi,cmd)=>{calls.push(cmd);return Promise.resolve();},answer:()=>{}};
      const before=JSON.stringify(run);S.UI.render();await tick();
      assert.ok(!doc.getElementById('app').textContent.includes('表示エラー'));
      assert.equal(doc.querySelectorAll('.classic-combat').length,1);
      assert.equal(doc.querySelectorAll('.band .hero').length,n);
      assert.equal(doc.querySelectorAll('.battle-header .dieface').length,1);
      assert.equal(doc.querySelectorAll('.hud .dieface').length,0);
      assert.ok(doc.querySelector('.battle-help[data-help]'));
      assert.equal(doc.querySelectorAll('.help-top').length,0,'no extra topbar button displacing the battle');
      if(boss && n===1)assert.ok(doc.querySelector('.solo-boss .hero') && doc.querySelector('.solo-boss .foe'),'solo boss and hero share the same stage');
      assert.equal(JSON.stringify(run),before,'presentation never mutates the run');
      const target=cb.alive()[cb.alive().length-1];
      doc.querySelector('.hand .card').click();await tick();
      // One tap to select the card, one on the enemy: no intermediate Use button.
      let targetEl=doc.querySelector('.foe[data-u="'+target.u+'"]');
      assert.ok(targetEl.classList.contains('target'));targetEl.click();await tick();
      assert.equal(calls.length,1);assert.equal(calls[0].type,'play');if(cb.alive().length>1)assert.equal(calls[0].target,target.u);
      assert.equal(JSON.stringify(run),before,'mocked target commands do not change inspected state');
      // Range cards accept an enemy tap as the column choice, including a shared boss.
      calls=[];A.ui={};S.UI.draw();
      const cleave=cb.pcs()[0].hand.find(c=>c.id==='Cleave');
      doc.querySelector('.hand .card[data-u="'+cleave.u+'"]').click();await tick();
      const columnEnemy=cb.rowEnemies(n-1)[0];
      doc.querySelector('.foe[data-u="'+columnEnemy.u+'"]').click();await tick();
      assert.equal(calls.length,1);assert.equal(calls[0].row,n-1);assert.equal(calls[0].u,cleave.u);
      // The existing Use button still works.
      calls=[];A.ui={};S.UI.draw();
      doc.querySelector('.hand .card').click();await tick();
      doc.querySelector('.preview [data-a=playsel]').click();await tick();
      if(cb.alive().length>1){doc.querySelector('.foe[data-u="'+target.u+'"]').click();await tick();}
      assert.equal(calls.length,1);
      // Inspection cannot turn into a play while ready, out of energy, or replaying.
      for(const blocked of ['ready','energy','replay']){
        calls=[];A.ui={};cb.pc(0).ready=blocked==='ready';cb.pc(0).en=blocked==='energy'?0:3;
        S.UI.draw();doc.querySelector('.hand .card').click();await tick();
        if(blocked==='replay') A.view={};
        doc.querySelector('.foe[data-u="'+target.u+'"]').click();await tick();
        assert.equal(calls.length,0,blocked+' prevents direct play');A.view=null;
      }
      cb.pc(0).ready=false;cb.pc(0).en=3;
      checked++;
    }
  }
  // Direct targeting preserves the enemy through X selection and supports cancellation.
  {
    const run=S.Game.newRun({players:[{ch:'G'}],seed:61}),g=new S.Game(run,{});
    g.setupDecks();g.setupAct(1);const cb=S.Combat.create(g,{kind:'normal'});
    run.combat=cb.s;run.phase='combat';cb.s.phase='play';const pc=cb.pc(0);pc.en=3;
    const a=cb.spawn('Cultist',0),b=cb.spawn('Cultist',0),card={u:g.uid(),id:'Skewer',up:false};pc.hand=[card];
    let calls=[];A.screen='game';A.me=0;A.ui={};A.sess={run:()=>run,pending:()=>[],hand:()=>S.Session.handInfo(run,0),playOpen:()=>true,command:(pi,cmd)=>{calls.push(cmd);return Promise.resolve();}};
    S.UI.draw();doc.querySelector('.hand .card').click();await tick();doc.querySelector('.foe[data-u="'+b.u+'"]').click();await tick();
    assert.equal(calls.length,0);assert.ok(doc.querySelector('.xpick'));assert.equal(A.ui.xpick.cmd.target,b.u);
    doc.querySelector('[data-a="xcancel"]').click();await tick();assert.equal(calls.length,0);
    doc.querySelector('.hand .card').click();await tick();doc.querySelector('.foe[data-u="'+b.u+'"]').click();await tick();
    doc.querySelector('[data-a="xpick"][data-v="2"]').click();await tick();
    assert.equal(calls.length,1);assert.equal(calls[0].target,b.u);assert.equal(calls[0].x,2);
  }
  assert.deepEqual(errors,[]);
  console.log('ok: '+checked+' viewport/party/boss presentations and enemy targeting; help and run data retained');
  dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

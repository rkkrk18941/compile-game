/* Selection reference must match the actual starting deck and leave saves untouched. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
 w.localStorage.setItem('ibara.bg.save.v3','test-existing-save');w.localStorage.setItem('ibara.bg.unlock.v1',JSON.stringify({asc:13,ch:{R:0,G:0,B:0,W:0}}));
 A.screen='solo';S.UI.render();await tick();
 d.querySelector('[data-keep=setup]').scrollTop=320;d.querySelector('[data-a=startertoggle]').click();await tick();assert.equal(d.querySelector('[data-keep=setup]').scrollTop,320,'expanding the reference must not jump to the top');
 const expected={R:{StrikeR:5,DefendR:4,Bash:1},G:{StrikeG:5,DefendG:5,Neutralize:1,Survivor:1},B:{StrikeB:4,DefendB:4,Zap:1,Dualcast:1},W:{StrikeW:4,DefendW:4,Eruption:1,Vigilance:1}};
 for(const ch of ['R','G','B','W']){
  d.querySelector('[data-a=pickch][data-v='+ch+']').click();await tick();
  assert.equal(d.querySelector('#starterCards').hidden,false,'open reference persists when switching heroes');
  let actual={};d.querySelectorAll('[data-starter-id]').forEach(el=>actual[el.dataset.starterId]=+el.dataset.count);assert.deepEqual(actual,expected[ch]);
  assert.match(d.querySelector('.starter-deck h3').textContent,new RegExp(ch==='G'?'12枚':'10枚'));
  assert.ok(d.querySelector('.starter-copy p').textContent.length);
  d.querySelector('.starter-row .card').click();await tick();assert.ok(S.HelpUI.state.open);d.querySelector('[data-help-close]').click();await tick();assert.equal(A.setup.ch,ch);
 }
 d.querySelector('[data-a=asc][data-v="5"]').click();await tick();assert.equal(+d.querySelector('[data-starter-id=AscendersBane]').dataset.count,1);assert.match(d.querySelector('.starter-deck h3').textContent,/11枚/);
 const engine=S.Game.newRun({players:[{ch:'W'}],asc:5,seed:1}).players[0].deck;assert.equal(engine.length,11);
 assert.equal(w.localStorage.getItem('ibara.bg.save.v3'),'test-existing-save');assert.equal(A.sess,null,'inspection never starts a game');
 A.screen='coop';A.coop.ch='G';S.UI.render();await tick();assert.match(d.querySelector('.starter-deck h3').textContent,/サイレント.*12枚/);assert.equal(d.querySelector('[data-starter-id=AscendersBane]'),null);
 A.screen='lobby';A.host=null;A.guest={seat:1,settings:{asc:5},roster:[{seat:0,ch:'R',name:'Host',unlock:0,online:true},{seat:1,ch:'B',name:'Guest',unlock:0,online:true}]};S.UI.render();await tick();assert.match(d.querySelector('.starter-deck h3').textContent,/ディフェクト.*11枚/);
 assert.deepEqual(errors,[]);console.log('ok: all four starter decks/counts, hero switching, card help, Ascension curse, solo/co-op/guest setup and save preservation');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

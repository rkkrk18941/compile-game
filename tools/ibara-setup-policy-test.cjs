/* New-run selection policy and compact reference controls; existing run data stays compatible. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),root=path.join(__dirname,'..'),errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
const index=fs.readFileSync(path.join(root,'ibara/index.html'),'utf8');
for(const m of index.matchAll(/<script src="(bg\/[^?"]+)\?/g))w.eval(fs.readFileSync(path.join(root,'ibara',m[1]),'utf8'));
const S=w.STS,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,30));
const chars=()=>Array.from(d.querySelectorAll('[data-a=pickch],[data-a=pickonlinech]'),b=>b.dataset.v);
const click=async sel=>{const b=d.querySelector(sel);assert.ok(b,sel);b.click();await tick();};
(async()=>{
w.localStorage.setItem('ibara.bg.save.v3','existing-save');
A.screen='solo';S.UI.draw();
assert.deepEqual(chars(),['R','G','B','W']);
assert.equal(d.querySelector('.setup-fold').open,false);
assert.ok(d.querySelector('[data-a=startsolo]'));
for(const mode of ['normal','beginner']){
 A.setup.mode=mode;S.UI.draw();assert.deepEqual(chars(),['R','G','B','W']);
 await click('[data-a=adv][data-v=downfall]');assert.equal(chars().length,8);
 await click('[data-a=pickch][data-v=U]');assert.equal(A.setup.ch,'U');
 await click('[data-a=adv][data-v=normal]');assert.equal(A.setup.ch,'R');assert.deepEqual(chars(),['R','G','B','W']);
}
A.setup.ch='M';S.UI.draw();assert.equal(A.setup.ch,'R','stale selection is normalized before preview/start');
const character=d.querySelector('[data-key=setup-character]'),options=d.querySelector('[data-key=setup-options]');character.open=true;options.open=true;
await click('[data-a=pickch][data-v=G]');assert.equal(d.querySelector('[data-key=setup-character]').open,true);assert.equal(d.querySelector('[data-key=setup-options]').open,true);
await click('[data-a=startertoggle]');assert.equal(d.querySelector('#starterCards').hidden,false);
assert.equal(w.localStorage.getItem('ibara.bg.save.v3'),'existing-save');assert.equal(A.sess,null);
A.screen='characters';A.host=null;A.guest={seat:1,settings:{adv:'normal'},roster:[{seat:0,ch:null,name:'Host',online:true},{seat:1,ch:null,name:'Guest',online:true}]};S.UI.draw();assert.equal(chars().length,4);
A.guest.settings.adv='downfall';S.UI.draw();assert.equal(chars().length,8);
const link={on(){},send(){}};for(const adv of ['normal','downfall']){
 const roster=new S.Session.Roster({name:'Host',ch:null,token:'host-token-12345',deferred:true});
 roster.slots.push({name:'Guest',ch:null,token:'guest-token-12345',cid:'guest',online:true});
 const host=new S.Session.Host(link,roster,{settings:{adv}});host.startSelection();
 for(const ch of ['S','U','H','M']){const result=host.claimCharacter(1,ch,0,roster.selection);
  if(adv==='normal'){assert.ok(result.err,ch);assert.equal(roster.slots[1].ch,null);}
  else{assert.ok(result.ok,ch);roster.slots[1].ch=null;}
 }
}
assert.deepEqual(errors,[]);console.log('ok: normal 4 / Downfall 8, both difficulties, stale-choice reset, solo/guest UI, host validation, expandable references, and save preservation');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

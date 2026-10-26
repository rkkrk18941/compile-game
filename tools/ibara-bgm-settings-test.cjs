/* Settings must work without a run, persist independently by scene, and never issue game commands. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),root=path.join(__dirname,'..');
const tick=()=>new Promise(r=>setTimeout(r,30));
function setup(prefs){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
 const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 if(prefs)w.localStorage.setItem('ibara.bg.prefs.v1',JSON.stringify(prefs));
 class Audio extends w.EventTarget{constructor(src){super();this.src=src;this.paused=true;}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
 w.Audio=Audio;w.IBARA={SFX:{music(){},unlock(){},setMusic(){},setMusicVolume(){},play(){}}};
 for(const f of ['bgm-library.js','bgm.js',...['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'].map(n=>'bg/'+n+'.js')])w.eval(fs.readFileSync(path.join(root,'ibara',f),'utf8'));
 return{dom,w,d:w.document,S:w.STS,errors};
}
(async()=>{
 let {dom,w,d,S,errors}=setup();await tick();const click=async sel=>{const el=d.querySelector(sel);assert.ok(el,sel);el.click();await tick();};
 await click('[data-v=settings]');assert.equal(S.UI.state.screen,'settings');assert.equal(d.querySelectorAll('.bgm-track').length,30);assert.ok(!S.UI.state.sess,'title settings do not require a run');
 await click('[data-a=bgmmode][data-v=random]');await click('[data-a=bgmtrack][data-v=rush]');await click('[data-a=bgmtrack][data-v=pursuit]');await click('[data-a=bgmtrack][data-v=ibara-combat]');
 let prefs=JSON.parse(w.localStorage.getItem('ibara.bg.prefs.v1'));assert.equal(prefs.bgmScenes.combat.tracks.join(','),'rush,pursuit');
 await click('[data-a=bgmzone][data-v=explore]');await click('[data-a=bgmtrack][data-v=moonlight]');
 const slider=d.getElementById('bgmVolume');slider.value='37';slider.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.getElementById('bgmVolumeText').textContent,'37%');
 const search=d.getElementById('bgmSearch');search.value='月明かり';search.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();assert.equal(d.querySelectorAll('.bgm-track').length,1);
 await click('[data-a=bgmpreview][data-v=moonlight]');assert.equal(w.IBARA.SFX.bgmInfo().preview,'moonlight');assert.match(d.querySelector('.bgm-now').textContent,/試聴/);
 await click('[data-a=title]');assert.equal(w.IBARA.SFX.bgmInfo().preview,null,'leaving settings ends audition');
 prefs=JSON.parse(w.localStorage.getItem('ibara.bg.prefs.v1'));assert.equal(prefs.bgmVolume,.37);assert.equal(prefs.bgmScenes.explore.mode,'single');assert.equal(prefs.bgmScenes.explore.tracks[0],'moonlight');assert.equal(prefs.bgmScenes.combat.tracks.join(','),'rush,pursuit');
 assert.deepEqual(errors,[]);dom.window.close();
 ({dom,w,d,S,errors}=setup(prefs));await tick();await click('[data-v=settings]');assert.equal(d.getElementById('bgmVolume').value,'37');assert.match(d.querySelector('.bgm-policy').textContent,/2曲/);await click('[data-a=bgmzone][data-v=explore]');assert.equal(d.querySelector('[data-a=bgmtrack][data-v=moonlight]').getAttribute('aria-checked'),'true');
 await click('[data-a=bgmall]');prefs=JSON.parse(w.localStorage.getItem('ibara.bg.prefs.v1'));assert.equal(prefs.bgmScenes.explore.tracks.length,30);assert.equal(prefs.bgmScenes.explore.mode,'random');assert.equal(prefs.bgmScenes.combat.tracks.length,2,'all songs changes only the selected scene');
 const run=S.Game.newRun({players:[{ch:'B'}],seed:61}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);const cb=S.Combat.create(g,{kind:'normal'});run.combat=cb.s;run.phase='combat';cb.s.phase='play';cb.spawn('SmallSlime',0);cb.pcs()[0].t={};const calls=[],A=S.UI.state;
 A.screen='game';A.me=0;A.ui={info:{k:'menu'}};A.sess={run:()=>run,pending:()=>[],waiting:()=>[],hand:()=>S.Session.handInfo(run,0),playOpen:()=>true,command:c=>calls.push(c)};S.UI.draw();const before=JSON.stringify(run);
 await click('[data-a=info][data-v=settings]');assert.equal(d.querySelectorAll('.bgm-track').length,30);await click('[data-a=bgmzone][data-v=combat]');await click('[data-a=bgmtrack][data-v=swing]');assert.equal(calls.length,0);assert.equal(JSON.stringify(run),before);
 await click('[data-a=bgmpreview][data-v=garden]');await click('.settings-heading [data-a=close]');assert.equal(w.IBARA.SFX.bgmInfo().preview,null);assert.ok(['rush','pursuit','swing'].includes(w.IBARA.SFX.bgmInfo().id));assert.equal(A.screen,'game');assert.deepEqual(errors,[]);dom.window.close();
 console.log('ok: title/game settings, all 30 songs, per-scene fixed/random choices, search, audition, volume, reload persistence, independent select-all, and returning to the unchanged battle');
})().catch(e=>{console.error(e);process.exitCode=1;});

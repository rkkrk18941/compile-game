const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom'),{BroadcastChannel}=require('node:worker_threads'),{webcrypto}=require('node:crypto');
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await delay(20);}throw new Error('Timed out waiting for synchronized UI');}
const dir=path.join(__dirname,'../ibara'),delay=ms=>new Promise(r=>setTimeout(r,ms));
function browser(i){
 const {window:w,document:d}=parseHTML('<html><body><div id="app"></div><div id="modalRoot"></div></body></html>'),storage=new Map(),session=new Map();
 Object.defineProperty(w.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.value;},set(v){this._value=String(v);}});
 const G=w.IBARA={},UI=G.UI={S:{},io:{},cardHTML:c=>'<div class="card">'+c.id+'</div>',mapHTML:()=>'',titleScreen(){},showDeck(){},showSettings(){},showGlossary(){},confirmBox:async()=>true,
  modal(o){const el=d.createElement('div');el.innerHTML=o.body||'';d.querySelector('#modalRoot').appendChild(el);return {el,close:()=>el.remove()};}};
 G.ART={hero:()=>'<svg></svg>',enemy:()=>'<svg></svg>',relic:()=>'<svg></svg>',potion:()=>'<svg></svg>',orb:()=>'<svg></svg>'};G.SFX={unlock(){},music(){},play(){}};
 const ctx=vm.createContext({window:w,IBARA:G,document:d,console,crypto:webcrypto,Uint8Array,BroadcastChannel,URL,URLSearchParams,
  location:{href:'https://example.test/ibara/?net=local',search:'?net=local'},navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)},
  setTimeout:(f,ms)=>setTimeout(f,ms===180||ms===250?1:ms),clearTimeout,setInterval:()=>0,clearInterval(){}});
 for(const f of ['engine.js','data/cards.js','data/world.js','data/board-act1.js','coop-core.js','coop-room.js','coop-net.js'])vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx,{filename:f});
 vm.runInContext(fs.readFileSync(path.join(dir,'coop.js'),'utf8'),ctx,{filename:'coop.js'});
 G.COOP.open();d.querySelector('#co-name').value='Player'+i;d.querySelector('#co-hero').value=['knight','huntress','doll','maiden'][i%4];
 return {G,d,w,storage,click(selector){const b=d.querySelector(selector);assert(b,selector);assert(!b.disabled,selector+' enabled');b.dispatchEvent(new w.Event('click',{bubbles:true}));}};
}
async function answerPrompts(pages){
 for(let i=0;i<180;i++){
  if(pages.every(p=>p.d.querySelector('[data-node]')))return;
  for(const p of pages){
   const q=p.d.querySelector('.co-prompt');if(!q)continue;
   const option=q.querySelector('[data-answer-index]'),num=q.querySelector('[data-answer-number]'),bool=q.querySelector('[data-answer-bool]');
   if(option)p.click('[data-answer-index]');else if(num)p.click('[data-answer-number]');else if(bool)p.click('[data-answer-bool]');
   else if(q.querySelector('[data-co=answer-cards]'))p.click('[data-co=answer-cards]');
   else if(q.querySelector('[data-co=answer-die]'))p.click('[data-co=answer-die]');
  }
  await delay(20);
 }
 throw new Error('Blessing choices did not finish');
}
(async()=>{
 const pages=Array.from({length:4},(_,i)=>browser(i)),host=pages[0];host.click('[data-co=host]');await delay(30);const code=host.d.querySelector('.co-code').textContent;
 const duplicate=browser(8);duplicate.d.querySelector('#co-code').value=code;duplicate.click('[data-co=join]');await until(()=>duplicate.d.querySelector('.co-error'));assert(duplicate.d.querySelector('#co-hero'));assert.equal(duplicate.d.querySelector('#co-code').value,code);duplicate.click('[data-co=leave]');
 for(let i=1;i<4;i++){pages[i].d.querySelector('#co-code').value=code;pages[i].click('[data-co=join]');await delay(25);}
 assert.equal(host.d.querySelectorAll('.co-roster li').length,4);assert(host.d.querySelector('[data-co=start]').textContent.startsWith('4人'));
 host.click('[data-co=start]');await answerPrompts(pages);
 pages.forEach((p,i)=>{assert.equal(p.d.querySelectorAll('.co-player').length,4);assert.equal(p.G.UI.S.run.hero,['knight','huntress','doll','maiden'][i]);const save=JSON.parse(p.storage.get('ibara.coop.run.v2'));assert.equal(save.rulesVersion,2);assert.equal(save.runs.length,4);assert.equal(save.runs[0].hero,p.G.UI.S.run.hero);});
 host.click('[data-node]');await until(()=>pages.every(p=>p.d.querySelector('[data-co=end]')&&!p.d.querySelector('[data-co=end]').disabled));
 pages.forEach(p=>{assert.equal(p.d.querySelector('[data-co=support]'),null);assert.equal(p.d.querySelector('.co-battle h2').textContent,'全員の共有ターン');});
 // A guest can act first; somebody ending does not advance the round or discard their hand.
 pages[2].click('[data-co=end]');await until(()=>pages[2].d.querySelector('[data-co=unready]'));assert.equal(pages[1].d.querySelector('[data-co=end]').disabled,false);
 const hand=pages[2].G.UI.S.combat.hand.length;assert(hand>=5);pages[2].click('[data-co=unready]');await until(()=>pages[2].d.querySelector('[data-co=end]'));
 for(let i=0;i<4;i++){await until(()=>pages[i].d.querySelector('[data-co=end]')&&!pages[i].d.querySelector('[data-co=end]').disabled);pages[i].click('[data-co=end]');await delay(20);}
 await until(()=>pages.every(p=>p.G.UI.S.combat?.round===2&&!p.d.querySelector('[data-co=end]')?.disabled));
 const die=pages[0].G.UI.S.combat.die;pages.forEach(p=>assert.equal(p.G.UI.S.combat.die,die));
 const extra=browser(7);extra.d.querySelector('#co-code').value=code;extra.click('[data-co=join]');await delay(40);assert(extra.d.querySelector('.co-error').textContent.includes('途中'));
 for(const p of [...pages,extra]){p.click('[data-co=leave]');await delay(10);}
 console.log('Four-player UI passed: roster, unique heroes, all blessings, shared turn/die, ending/unready, synchronized enemy phase, separate saves and late-join rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(process.exitCode||0),50));

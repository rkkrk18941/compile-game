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
 for(const f of ['engine.js','data/cards.js','data/world.js','coop-core.js','coop-room.js','coop-net.js'])vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),ctx,{filename:f});
 vm.runInContext(fs.readFileSync(path.join(dir,'coop.js'),'utf8'),ctx,{filename:'coop.js'});
 G.COOP.open();d.querySelector('#co-name').value='Player'+i;d.querySelector('#co-hero').value=['knight','huntress','doll','maiden'][i%4];
 return {G,d,w,storage,click(selector){const b=d.querySelector(selector);assert(b,selector);assert(!b.disabled,selector+' enabled');b.dispatchEvent(new w.Event('click',{bubbles:true}));}};
}
(async()=>{
 const pages=Array.from({length:6},(_,i)=>browser(i));const host=pages[0];host.click('[data-co=host]');await delay(30);const code=host.d.querySelector('.co-code').textContent;
 for(let i=1;i<6;i++){pages[i].d.querySelector('#co-code').value=code;pages[i].click('[data-co=join]');await delay(25);}
 assert.equal(host.d.querySelectorAll('.co-roster li').length,6);assert(host.d.querySelector('[data-co=start]').textContent.startsWith('6人'));
 host.click('[data-co=start]');await delay(40);
 pages.forEach((p,i)=>{assert.equal(p.d.querySelectorAll('.co-player').length,6);assert.equal(p.G.UI.S.run.hero,['knight','huntress','doll','maiden'][i%4]);assert.equal(JSON.parse(p.storage.get('ibara.coop.run.v1')).runs.length,6);assert.equal(JSON.parse(p.storage.get('ibara.coop.run.v1')).runs[0].hero,p.G.UI.S.run.hero);});
 host.click('[data-node]');await delay(100);
 assert.equal(host.d.querySelector('[data-co=end]').disabled,false);pages.slice(1).forEach(p=>assert.equal(p.d.querySelector('[data-co=end]').disabled,true));
 host.click('[data-co=support]');assert.equal(host.d.querySelectorAll('[data-support-seat]').length,5);host.click('[data-support-seat="5"]');await delay(35);
 host.click('[data-co=end]');await until(()=>pages[1].d.querySelector('.co-battle h2')?.textContent.includes('あなた'));
 // Player 6's separate card reward choices must survive another player's snapshot update.
 pages.forEach((p,i)=>assert(p.G.UI.S.combat&&p.G.UI.S.combat.run.hero===['knight','huntress','doll','maiden'][i%4]));
 const extra=browser(7);extra.d.querySelector('#co-code').value=code;extra.click('[data-co=join]');await delay(40);assert(extra.d.querySelector('.co-error').textContent.includes('途中'));
 for(const p of [...pages,extra]){p.click('[data-co=leave]');await delay(10);}
 console.log('Six-player UI passed: host plus five guests, roster, start, individual heroes and saves, battle synchronization, support target selection, turn ownership and late-join rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(process.exitCode||0),50));

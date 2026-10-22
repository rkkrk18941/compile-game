// npm install --no-save linkedom
// node --experimental-vm-modules tools/game-bgm-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(game='compile',saved={}){
 const {window}=parseHTML('<html><body><script data-game-bgm="'+game+'"></script></body></html>');
 const document=window.document,storage=new Map(Object.entries(saved));
 // Linkedom omits the browser's writable select.value property.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.value;},set(v){this._value=String(v);}});
 const media=[];
 function Audio(src){const el=document.createElement('audio');el.src=src;el.paused=true;el.plays=0;el.play=async()=>{el.plays++;el.paused=false;};el.pause=()=>{el.paused=true;};media.push(el);return el;}
 const ctx=vm.createContext({document,window,location:{search:''},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},Audio,URL,URLSearchParams,CustomEvent:window.CustomEvent,console});
 const modules=new Map();
 async function load(url){
  const name=url.split('?')[0];if(modules.has(name))return modules.get(name);
  const m=new vm.SourceTextModule(await fs.readFile(new URL(name),'utf8'),{context:ctx,identifier:name,initializeImportMeta(meta){meta.url=name;}});modules.set(name,m);return m;
 }
 const m=await load(new URL('../assets/game-bgm.mjs',import.meta.url).href);
 await m.link((s,r)=>load(new URL(s,r.identifier).href));await m.evaluate();
 return {document,window,storage,media,bridge:ctx.GEMINI_BGM,root:document.querySelector('#gemini-bgm-controls')?.shadowRoot};
}
const h=await harness(),a=h.media[0],$=s=>h.root.querySelector(s);
assert.equal(h.bridge.mode(),'gemini');assert.equal(h.bridge.isRecorded(),true);
assert.equal(a.plays,0,'opening a game waits for the first gesture');
h.document.dispatchEvent(new h.window.Event('pointerdown'));await settle();
assert.equal(a.plays,1);assert.equal(a.paused,false);assert.equal(a.loop,true);
h.bridge.setEnabled(false);assert.equal(a.paused,true,'game mute also mutes Gemini');
h.bridge.setEnabled(true);await settle();assert.equal(a.paused,false);
$('#mode').value='off';$('#mode').onchange({target:$('#mode')});
assert.equal(a.paused,true);assert.equal(h.bridge.isRecorded(),true,'off also suppresses the old synthesizer');
let changes=0;h.document.addEventListener('gemini-bgm-change',()=>changes++);
h.bridge.chooseOriginal();assert.equal(h.bridge.mode(),'original');assert.equal(h.bridge.isRecorded(),false);assert.equal(changes,1);
$('#volume').value='.4';$('#volume').oninput({target:$('#volume')});
assert.equal(JSON.parse(h.storage.get('gemini.bgm.compile')).volume,.4);
$('#play').onclick();await settle();assert.equal(h.bridge.mode(),'gemini');assert.equal(a.paused,false);
h.bridge.setNativeVolume(.5);assert.equal(a.volume,.2,'native and Gemini volumes combine');
const restored=await harness('compile',Object.fromEntries(h.storage));assert.equal(restored.root.querySelector('#volume').value,'0.4');
const waiting=await harness('xing');assert.equal(waiting.bridge,undefined);assert.equal(waiting.media.length,0,'a pending game retains its current audio');
console.log('Game BGM: default, gesture playback, mute, old BGM, volume, saved settings and pending games passed');

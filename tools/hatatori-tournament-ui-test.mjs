// DOM integration (no GPU/network service): npm install --no-save linkedom
// node --experimental-vm-modules tools/hatatori-tournament-ui-test.mjs
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.HTN_DOM_MODULE || 'linkedom');
const root=path.resolve(import.meta.dirname,'../hatatori-nine');
const tick=()=>new Promise(r=>setTimeout(r,2));
async function until(fn,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await tick();}throw Error('Timed out: '+label);}
const harnesses=[];
async function harness(){
 const {window:domWindow}=parseHTML(await fs.readFile(path.join(root,'index.html'),'utf8'));const document=domWindow.document;const window={document,Event:domWindow.Event,addEventListener(){}};
 const errors=[],timers=new Set(),storage=new Map([['htn.fx','"off"'],['htn.sound','false'],['htn.bgm','false']]);
 const style=()=>{};const noop=()=>{};
 const scene=new Proxy({busy:false,setAttract:noop,screenOf:()=>null,flagScreen:()=>null,flagAnchor:(f)=>[f*40,100],resize:noop},{get:(t,k)=>k in t?t[k]:noop});
 const setTimer=(fn,ms,...args)=>{const id=setTimeout(()=>{timers.delete(id);try{fn(...args);}catch(e){errors.push(e);}},ms);timers.add(id);return id;};
 Object.assign(window,{location:{search:'?test=1&net=local&speed=10000',origin:'http://example.test',pathname:'/hatatori-nine/'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:false}),BroadcastChannel,crypto:webcrypto,devicePixelRatio:1,innerWidth:390,innerHeight:844});
 document.fonts={load:async()=>{},ready:Promise.resolve()};
 document.querySelector('#app').getBoundingClientRect=()=>({width:390,height:844});
 document.querySelector('#stageWrap').getBoundingClientRect=()=>({left:0,top:0,width:390,height:400});
 const ctx=vm.createContext({window,document,location:window.location,localStorage:window.localStorage,navigator:{},matchMedia:window.matchMedia,innerWidth:390,innerHeight:844,URLSearchParams,console:{...console,error:(...args)=>errors.push(args.join(' '))},setTimeout:setTimer,clearTimeout,setInterval,clearInterval,performance,crypto:webcrypto,BroadcastChannel,ResizeObserver:class{observe(){}},requestAnimationFrame:noop});
 const modules=new Map();
 async function load(file){
  if(modules.has(file))return modules.get(file);
  let code;
  if(file.endsWith('/scene.js'))code='export const loadThree=async()=>{};export const createScene=()=>globalThis.__scene;export const sortHand=h=>h;export const COLORS=["red","orange","gold","green","blue","purple"];export const UNIT_NAME=[];export function paintCard(){}';
  else if(file.endsWith('/fx.js'))code='export const createFx=()=>({resize(){},clear(){},formation:async()=>{}});';
  else if(file.endsWith('/tournament-fx.js'))code='export const createFX=()=>({confetti(){},firework(){}});';
  else code=await fs.readFile(file,'utf8');
  const m=new vm.SourceTextModule(code,{context:ctx,identifier:file});modules.set(file,m);await m.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec)));return m;
 }
 ctx.__scene=scene;
 for(const f of ['engine.js','ai.js','net.js','director.js','tournament-net.js'])vm.runInContext(await fs.readFile(path.join(root,f),'utf8'),ctx,{filename:f});
 await(await load(path.join(root,'app.js'))).evaluate();await until(()=>window.__htn,'boot');
 const h={window,document,a:window.__htn,errors,click(sel){const el=document.querySelector(sel);assert.ok(el,'element '+sel);assert.ok(!el.disabled,'enabled '+sel);el.click();},stop(){window.__htn.tournaments.leave();for(const t of timers)clearTimeout(t);}};
 harnesses.push(h);return h;
}
try{
 const h=await harness();h.click('#goTour');assert.equal(h.document.querySelectorAll('#tourList .ent').length,4);assert.equal(h.document.querySelector('#scrTour').hidden,false);
 h.click('[data-tx="0"]');for(const el of h.document.querySelectorAll('[data-tl]')){Object.defineProperty(el,'value',{value:'1',configurable:true});el.dispatchEvent(new h.window.Event('change',{bubbles:true}));}
 h.click('#segFormat [data-v="cup"]');h.click('#tourStart');
 await until(()=>h.a.view?.phase==='over'&&!h.a.presenting,'CPU semi-final');
 assert.equal(h.a.tournaments.current.tour.entrants.length,3);assert.equal(h.a.match.ctrl.length,0);
 assert.equal(h.document.querySelector('#watchBar').hidden,false);
 h.click('#btnTour');assert.ok(h.document.querySelector('.bracket'));assert.ok(h.document.querySelector('[data-t="next"]'));
 h.click('[data-t="next"]');await until(()=>h.a.tournaments.current.tour.over&&!h.a.presenting,'CPU final');
 h.click('#btnTour');assert.match(h.document.querySelector('.champ').textContent,/優勝/);
 h.a.tournaments.startOffline([{name:'人A',cpu:0,owner:'local'},{name:'人B',cpu:0,owner:'local'}],'league');
 await until(()=>!h.document.querySelector('#handoff').hidden,'first handoff');assert.equal(h.a.view.hand.length,0,'first hand remains covered');
 h.click('#handoff button');await until(()=>!h.a.match.intro,'handoff ready');assert.equal(h.a.view.hand.length,7);
 const initial=h.a.view.me;
 for(let i=0;i<4&&h.document.querySelector('#handoff').hidden;i++){
  h.a.act(h.a.AI.choose(h.a.view,1,h.a.E.mulberry32(i+5)));await tick();
  await until(()=>!h.a.presenting||!h.document.querySelector('#handoff').hidden,'local turn settling');
 }
 assert.equal(h.document.querySelector('#handoff').hidden,false,'handoff covers the next human hand');
 h.click('#handoff button');await until(()=>!h.a.presenting,'handoff settle');assert.notEqual(h.a.view.me,initial,'view switches to next player');
 h.a.tournaments.leave();
 const host=await harness(),guest=await harness(),watch=await harness();
 for(const [i,x] of [host,guest,watch].entries()){x.click('#goOnline');x.document.querySelector('#onName').value=['主催','参加','観戦'][i];}
 host.click('#onCreate');await until(()=>host.a.tournaments.room,'room creation');
 const code=host.a.tournaments.room.code;
 guest.document.querySelector('#onCode').value=code;guest.click('#onJoin');await until(()=>host.a.tournaments.room.members.length===2,'guest joined');
 watch.document.querySelector('#onCode').value=code;watch.click('#onJoin');await until(()=>host.a.tournaments.room.members.length===3,'observer joined');
 const watchCid=host.a.tournaments.room.members.find(m=>m.name==='観戦').cid;
 host.click('[data-toggle="'+watchCid+'"]');host.click('#segOnFormat [data-v="league"]');host.click('#lobAddCpu');host.click('#lobStart');
 await until(()=>host.a.match?.tournament&&guest.a.match?.tournament&&watch.a.match?.tournament,'all clients in match');
 await until(()=>!host.a.match.intro&&!guest.a.match.intro&&!watch.a.match.intro,'online intros');
 assert.equal(watch.a.match.ctrl.length,0);assert.equal(watch.a.tournaments.current.hands.length,2);
 assert.equal(guest.a.tournaments.current.hands===null||guest.a.match.ctrl.length===0,true,'player hand privacy');
 let guard=0;
 while(!host.a.tournaments.current.tour.over&&guard++<2000){
  const arena=host.a.tournaments.host,m=arena.match;
  if(!m.state){await until(()=>!host.a.presenting,'host result');host.a.tournaments.board();host.click('[data-t="next"]');await tick();continue;}
  const owner=arena.ent(m.state.turn).owner;const client=owner==='h'?host:owner===guest.a.tournaments.session.cid?guest:null;
  if(client&&!client.a.presenting&&!client.a.match.intro&&!client.a.match.waiting&&client.a.view.turn===client.a.view.me&&client.a.match.revision===arena.revision){
   client.a.act(client.a.AI.choose(client.a.view,1,client.a.E.mulberry32(guard+22)));
  }
  await tick();
 }
 assert.ok(guard<2000,'online league completes');await until(()=>watch.a.tournaments.current.tour.over,'observer final standings');
 for(const x of harnesses)assert.deepEqual(x.errors,[], 'No app errors');
 console.log('Tournament DOM integration passed: setup, CPU cup, result/board, private hotseat handoff, 3-client online league, spectator sync.');
}finally{for(const h of harnesses)h.stop();}

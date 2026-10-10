import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Lifecycle regression: effects must never strand a rules-engine await.
const source=fs.readFileSync(new URL('../assets/cinematic.js',import.meta.url),'utf8');
function harness({motion=false,canvas=true,annSec=3,fx=1,readingVersion=1}={}){
  let time=0,seq=0;const timers=new Map(),frames=new Map(),listeners=new Map(),elements=[];
  const noop=()=>{};
  const paint=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>(o[k]=v,true)});
  class Element{
    constructor(tag){this.tagName=tag;this.style={setProperty:noop};this.classList={contains:()=>false,add:noop,remove:noop};this.isConnected=false;this.dataset={};this.children=[];elements.push(this);}
    append(...els){this.children.push(...els);els.forEach(el=>el.isConnected=true);}
    prepend(...els){this.append(...els);}
    remove(){this.isConnected=false;}
    setAttribute(){} focus(){} querySelector(){return null;} querySelectorAll(){return [];}
    getContext(){return canvas?paint:null;}
  }
  const body=new Element('body'),focused=new Element('button');focused.isConnected=true;
  const context={console,Math,JSON,Promise,Number,String,Object,Array,Set,Map,innerWidth:1280,innerHeight:900,devicePixelRatio:2,
    performance:{now:()=>time},SET:{fx,annSec,cinemaReadingVersion:readingVersion,shake:true,sfxVol:50},G:null,NET:{on:false},
    localStorage:{getItem:()=>'{"annSec":3}',setItem:noop},
    document:{body,activeElement:focused,hidden:false,documentElement:{style:{setProperty:noop}},querySelector:()=>null,querySelectorAll:()=>[],createElement:tag=>new Element(tag),addEventListener:(name,fn)=>listeners.set(name,fn)},
    matchMedia:()=>({matches:motion,addEventListener:noop}),addEventListener:(name,fn)=>listeners.set(name,fn),
    setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++seq;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    renderWelcome:noop,renderDraft:noop,startArrange:noop,fullCard:()=>new Element('div'),handCardW:noop,render:noop,saveSettings:noop,openSettings:()=>Promise.resolve(),showModal:()=>Promise.resolve(),
    pmeta:p=>({ac:'#99ddee',k:p}),artBG:()=>'',hexIcon:()=>'<svg/>',kw:x=>x,esc:x=>String(x),uiViewer:()=>0,other:p=>1-p,stackTotal:()=>0,elOf:()=>null,isMyTurn:()=>true,netSend:noop,fxLayer:()=>body};
  context.window=context;
  vm.createContext(context);new vm.Script(source,{filename:'cinematic.js'}).runInContext(context);
  const advance=async(ms)=>{time+=ms;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(time);for(const [id,t]of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await Promise.resolve();};
  return{context,advance,elements,listeners};
}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const game=freeze({turn:10,current:0,winner:null,players:[{name:'YOU',protocols:[{name:'FIRE',compiled:false}],hand:[],lines:[[],[],[]]},{name:'CPU',protocols:[{name:'WATER',compiled:true}],hand:[],lines:[[],[],[]]}]});

{
  const h=harness();const c=h.context;c.G=game;const before=JSON.stringify(c.G);
  let first=false,second=false;
  c.announce('FIRE','FIRE 0','ability').then(()=>first=true);
  c.announce('WATER','WATER 1','ability').then(()=>second=true);
  await h.advance(0);assert.equal(first,true,'interrupted cut resolves');assert.equal(second,false);
  await h.advance(3300);assert.equal(second,true,'cut resolves on deadline');assert.equal(c.COMPILE_CINEMA.state().cut,false);assert.equal(JSON.stringify(c.G),before,'effects do not change rules state');
  const rect={left:10,top:10,width:100,height:100};let beamDone=false;
  c.beamFX(rect,{...rect,left:600},'ICE').then(()=>beamDone=true);c.COMPILE_CINEMA.stop();await h.advance(0);assert.equal(beamDone,true,'stopped beam resolves');assert.equal(c.COMPILE_CINEMA.state().effects,0);
  let hiddenDone=false;c.announce('TIME','TIME 1','ability').then(()=>hiddenDone=true);c.document.hidden=true;h.listeners.get('visibilitychange')();await h.advance(0);assert.equal(hiddenDone,true,'background tab releases cut');
  assert.equal(Object.keys(c.COMPILE_CINEMA.themes()).length,24);
}
{
  const h=harness({motion:true});let done=false;h.context.announce('LIGHT','LIGHT 0').then(()=>done=true);assert.equal(h.context.COMPILE_CINEMA.state().effects,0);await h.advance(3300);assert.equal(done,true,'reduced motion retains a dismissible static announcement');
}
{
  const h=harness({canvas:false});await h.context.beamFX({left:0,top:0,width:1,height:1},{left:10,top:10,width:1,height:1},'FIRE');h.context.SET.fx=0;await h.context.announce('FIRE','FIRE 0');assert.equal(h.context.COMPILE_CINEMA.state().effects,0,'canvas failure or FX off cannot block gameplay');
}
{
  const h=harness();const c=h.context;let done=false;
  c.announce('FIRE','FIRE 0').then(()=>done=true);c.SET.fx=0;c.saveSettings();await h.advance(0);
  assert.equal(done,true,'turning effects off releases an active cut immediately');
  assert.equal(c.COMPILE_CINEMA.state().cut,false);assert.equal(c.COMPILE_CINEMA.state().effects,0);
}
{
  const h=harness();const c=h.context;c.document.hidden=true;let done=false;
  c.announce('LIGHT','FINAL COMPILE','','コンパイル','gold').then(()=>done=true);await h.advance(0);
  assert.equal(done,true,'a cut requested in a background tab does not delay rules');
  assert.equal(c.COMPILE_CINEMA.state().cut,false);
}
{
  const h=harness({annSec:4.5,readingVersion:0,fx:.6});const c=h.context;
  assert.equal(c.SET.annSec,7,'existing short settings migrate to a readable default');
  let done=false;c.announce('FIRE','FIRE 0','短い能力説明').then(()=>done=true);
  await h.advance(6999);assert.equal(done,false,'fast particles never shorten the reading time');
  await h.advance(1);assert.equal(done,true);
  assert.equal(harness({annSec:12,readingVersion:0}).context.SET.annSec,12,'long saved settings remain intact');
  assert.equal(harness({annSec:4,readingVersion:1}).context.SET.annSec,4,'later user adjustments remain intact');
}
{
  const h=harness({annSec:7});let done=false;
  h.context.announce('WATER','WATER 0','あ'.repeat(84)).then(()=>done=true);
  await h.advance(9999);assert.equal(done,false,'long commands receive extra reading time');
  await h.advance(1);assert.equal(done,true);
}
{
  const h=harness({annSec:7});let first=false,second=false;
  h.context.announce('FIRE','FIRE 0').then(()=>first=true);let cut=h.elements.find(e=>e.className==='cin-cut'&&e.isConnected);
  cut.onclick();await h.advance(0);assert.equal(first,false,'a carried-over tap cannot dismiss a new command');
  await h.advance(500);cut.onclick();await h.advance(0);assert.equal(first,true,'a deliberate later tap advances');
  h.context.announce('WATER','WATER 1').then(()=>second=true);cut=h.elements.find(e=>e.className==='cin-cut'&&e.isConnected);
  await h.advance(500);cut.onkeydown({key:'Enter',repeat:true,preventDefault(){}});await h.advance(0);
  assert.equal(second,false,'holding Enter cannot skip consecutive commands');
  cut.onkeydown({key:'Escape',preventDefault(){}});await h.advance(0);assert.equal(second,true,'Escape remains an immediate skip');
}
console.log('Cinematic lifecycle and reading pace passed: interruptions, timers, visibility, immutable rules, defaults, independent reading time, long text and deliberate skipping.');

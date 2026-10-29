import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const code=await fs.readFile(new URL('../ibara/bgm.js',import.meta.url),'utf8');
const fx=await fs.readFile(new URL('../ibara/fx.js',import.meta.url),'utf8');
const catalog=await fs.readFile(new URL('../ibara/bgm-library.js',import.meta.url),'utf8');
const settle=()=>new Promise(r=>setImmediate(r));
function harness({blocked=false,synth=false}={}) {
 const document=new EventTarget(),window=new EventTarget(),media=[],contexts=[],actions={};
 document.hidden=false;window.navigator={mediaSession:{setActionHandler(n,f){actions[n]=f;}},audioSession:new EventTarget()};
 window.navigator.audioSession.state='active';
 const native={unlocks:0,scene:null};
 window.IBARA={SFX:{unlock(){native.unlocks++;},music(s){native.scene=s;},setMusic(){}}};
 class Audio extends EventTarget {
  constructor(src){super();this.src=src;this.paused=true;this.ended=false;media.push(this);}
  play(){if(blocked)return Promise.reject(Object.assign(new Error('gesture'),{name:'NotAllowedError'}));this.paused=false;queueMicrotask(()=>this.dispatchEvent(new Event('play')));return this.defer?new Promise(r=>this.resolve=r):Promise.resolve();}
  pause(){if(this.paused)return;this.paused=true;queueMicrotask(()=>this.dispatchEvent(new Event('pause')));}
  externalPause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
 }
 const parameter=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
 const node=()=>({gain:parameter(),frequency:parameter(),detune:parameter(),Q:parameter(),connect(){},start(){},stop(){}});
 class AudioContext extends EventTarget {
  constructor(){super();this.state='suspended';this.sampleRate=4;this.currentTime=0;this.destination={};contexts.push(this);}
  createGain(){return node();}createConvolver(){return node();}createOscillator(){return node();}createBiquadFilter(){return node();}
  createBuffer(c,n){return{getChannelData:()=>new Float32Array(n)};}
  resume(){this.state='running';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}
  close(){this.state='closed';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}
 }
 window.AudioContext=AudioContext;
 const context=vm.createContext({window,document,Audio,CustomEvent:Event,console,WeakSet,setTimeout:()=>1,clearTimeout(){}});
 if(synth)vm.runInContext(fx,context);
 vm.runInContext(catalog,context);vm.runInContext(code,context);
 return {A:window.IBARA.SFX,document,window,media,contexts,actions,native,allow(){blocked=false;}};
}
const h=harness();h.A.music('title');h.A.startBgm();await settle();
assert.equal(h.media.at(-1).paused,false,'autoplay when allowed');
h.A.music('combat');await settle();assert.equal(h.A.bgmInfo().externalAudio,false,'internal scene pause is not an interruption');
h.A.setMusic(false);await settle();h.A.setMusic(true);await settle();assert.equal(h.A.bgmInfo().externalAudio,false,'internal mute is not an interruption');
h.media.at(-1).externalPause();await settle();assert.equal(h.A.bgmInfo().externalAudio,true,'OS pause latches external priority');
const count=h.media.length;h.A.music('boss');h.document.dispatchEvent(new Event('pointerdown'));h.document.dispatchEvent(new Event('keydown'));await settle();
assert.equal(h.media.length,count,'scene and generic gestures do not restart');
assert.ok(h.media.every(a=>a.paused));
h.A.setExternalAudio(false);h.A.unlock();await settle();assert.equal(h.media.at(-1).paused,false,'explicit re-enable works');
h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));await settle();
h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));h.window.dispatchEvent(new Event('pageshow'));h.A.music('map');await settle();
assert.equal(h.A.bgmInfo().externalAudio,true);assert.ok(h.media.every(a=>a.paused),'returning from another app does not take focus back');
h.A.setExternalAudio(false);h.A.unlock();await settle();h.actions.pause();await settle();assert.ok(h.media.every(a=>a.paused),'notification pause yields');
h.A.setExternalAudio(false);h.A.unlock();await settle();h.window.navigator.audioSession.state='interrupted';h.window.navigator.audioSession.dispatchEvent(new Event('statechange'));await settle();assert.equal(h.A.bgmInfo().externalAudio,true);
h.A.setExternalAudio(false);h.A.unlock();await settle();h.window.dispatchEvent(new Event('pagehide'));h.window.dispatchEvent(new Event('pageshow'));await settle();assert.equal(h.A.bgmInfo().externalAudio,true);
const b=harness({blocked:true});b.A.music('title');b.A.startBgm();await settle();assert.ok(b.media.every(a=>a.paused));assert.equal(b.A.bgmInfo().fallback,false,'autoplay rejection does not trigger synthesized fallback');
b.allow();b.document.dispatchEvent(new Event('pointerdown'));await settle();assert.equal(b.media.at(-1).paused,false,'first tap retries autoplay');
const p=b.media.at(-1);b.A.setMusic(false);await settle();p.defer=true;b.A.setMusic(true);b.actions.pause();p.resolve();await settle();assert.ok(b.media.every(a=>a.paused),'late play cannot revive after interruption');
const s=harness({synth:true});s.A.configureBgm({mode:'original'});s.A.music('title');s.A.startBgm();await settle();assert.equal(s.A.bgmInfo().externalAudio,false,'initial suspended context is not mistaken for interruption');
s.document.dispatchEvent(new Event('pointerdown'));await settle();const ac=s.contexts.at(-1);assert.equal(ac.state,'running');
ac.state='interrupted';ac.dispatchEvent(new Event('statechange'));await settle();assert.equal(s.A.bgmInfo().externalAudio,true,'synthesized BGM yields too');assert.equal(ac.state,'closed');
s.document.dispatchEvent(new Event('pointerdown'));await settle();assert.equal(s.contexts.length,1,'ordinary taps do not recreate audio context');
console.log('ok: startup, blocked autoplay/first tap, internal vs external pause, sticky focus loss, lifecycle, media-session pause, audio-session interruption, late play and synthesized audio.');

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const code = await fs.readFile(new URL('../ibara/bgm.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const document = new EventTarget(), window = new EventTarget(), media = [], native = {scene:null,on:true};
  document.hidden = false;
  window.IBARA = {SFX:{music(s){native.scene=s;},unlock(){},setMusic(on){native.on=on;}}};
  class Audio {
    constructor(src){this.src=src;this.paused=true;media.push(this);}
    play(){this.paused=false;return this.defer ? new Promise(resolve=>{this.resolve=resolve;}) : Promise.resolve();}
    pause(){this.paused=true;}
  }
  vm.runInNewContext(code,{window,document,Audio,CustomEvent:Event,console});
  return {A:window.IBARA.SFX,document,window,media,native};
}
const h=harness();
h.A.music('title');assert.equal(h.media.length,0,'wait for a user gesture');
h.A.unlock();await settle();assert.match(h.media[0].src,/ibara-map/);assert.equal(h.media[0].paused,false);
const map=h.media[0];h.A.music('rest');await settle();assert.equal(h.media.length,1,'exploration and rest keep the same playback');
h.A.music('combat');await settle();const combat=h.media[1];assert.equal(map.paused,true);assert.match(combat.src,/ibara-combat/);assert.equal(h.native.scene,null,'no duplicate ambient track');
h.A.music('boss');await settle();assert.equal(combat.paused,true);assert.match(h.media[2].src,/ibara-boss/);
h.A.setMusic(false);assert.ok(h.media.every(a=>a.paused));
h.A.setMusic(true);await settle();assert.equal(h.media[2].paused,false);
h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.ok(h.media.every(a=>a.paused));
h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(h.media[2].paused,false);
h.A.configureBgm({mode:'original',volume:.4});assert.ok(h.media.every(a=>a.paused));assert.equal(h.native.scene,'boss');
h.A.configureBgm({mode:'gemini',volume:.4});await settle();assert.equal(h.native.scene,null);assert.equal(h.media[2].volume,.4);
h.A.configureBgm({mode:'gemini',volume:0});assert.ok(h.media.every(a=>a.paused));
h.A.configureBgm({mode:'gemini',volume:.3});await settle();h.A.music(null);assert.ok(h.media.every(a=>a.paused));
// A late play() resolution must not resurrect a previous scene or ignore mute.
h.A.music('map');await settle();const late=h.media.at(-1);late.pause();late.defer=true;
h.A.unlock();h.A.setMusic(false);late.resolve();await settle();assert.equal(late.paused,true);
h.A.setMusic(true);late.resolve();await settle();
h.A.music('boss');await settle();assert.equal(late.paused,true);assert.equal(h.media.at(-1).paused,false);
h.window.dispatchEvent(new Event('pagehide'));assert.ok(h.media.every(a=>a.paused));
h.window.dispatchEvent(new Event('pageshow'));await settle();assert.equal(h.media.at(-1).paused,false);
// Failed recording downloads retain playable original music and honor mute.
h.A.music('combat');await settle();const failing=h.media.at(-1);failing.pause();failing.play=()=>Promise.reject(new Error('network'));
h.A.unlock();await settle();assert.equal(h.A.bgmInfo().fallback,true);assert.equal(h.native.scene,'combat');
h.A.setMusic(false);assert.equal(h.native.on,false);
console.log('Ibara BGM passed: gesture, three scenes, rest continuity, mute, volume, original, visibility, late playback, page lifecycle, network fallback.');

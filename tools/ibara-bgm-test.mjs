import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const code = await fs.readFile(new URL('../ibara/bgm.js', import.meta.url), 'utf8');
const catalogCode = await fs.readFile(new URL('../ibara/bgm-library.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(silent=false) {
  const document = new EventTarget(), window = new EventTarget(), media = [], native = {scene:null,on:true,unlocks:0};
  document.hidden = false;
  window.IBARA = {SFX:{music(s){native.scene=s;},unlock(){native.unlocks++;},setMusic(on){native.on=on;}}};
  class Audio extends EventTarget {
    constructor(src){super();this.src=src;this.paused=true;media.push(this);}
    play(){this.paused=false;return this.defer ? new Promise(resolve=>{this.resolve=resolve;}) : Promise.resolve();}
    pause(){this.paused=true;}
  }
  const context = vm.createContext({window,document,Audio,CustomEvent:Event,console});
  vm.runInContext(catalogCode,context);vm.runInContext(code,context);
  window.IBARA.SFX.setExternalAudio(silent);
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
h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(h.media[2].paused,true,'returning does not restart after leaving the page');h.A.setExternalAudio(false);h.A.unlock();await settle();assert.equal(h.media[2].paused,false);
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
h.window.dispatchEvent(new Event('pageshow'));await settle();assert.equal(h.media.at(-1).paused,true);h.A.setExternalAudio(false);h.A.unlock();await settle();assert.equal(h.media.at(-1).paused,false);
// Failed recording downloads retain playable original music and honor mute.
h.A.music('combat');await settle();const failing=h.media.at(-1);failing.pause();failing.play=()=>Promise.reject(new Error('network'));
h.A.unlock();await settle();assert.equal(h.A.bgmInfo().fallback,true);assert.equal(h.native.scene,'combat');
h.A.setMusic(false);assert.equal(h.native.on,false);
// All completed recordings, independent scene choices, shuffle advancement and inspection are real playback paths.
const provenance=JSON.parse(await fs.readFile(new URL('../assets/bgm/gemini/provenance.json',import.meta.url),'utf8'));
const sandbox={window:{}};vm.runInNewContext(catalogCode,sandbox);
assert.equal(sandbox.window.IBARA_BGM_LIBRARY.length,provenance.length);
assert.deepEqual([...sandbox.window.IBARA_BGM_LIBRARY.map(t=>t.id)].sort(),provenance.map(t=>t.file.split('/').at(-1).replace('.mp3','')).sort());
const recordings=(await fs.readdir(new URL('../assets/bgm/gemini/',import.meta.url))).filter(f=>f.endsWith('.mp3')).map(f=>f.replace('.mp3','')).sort();
assert.deepEqual([...sandbox.window.IBARA_BGM_LIBRARY.map(t=>t.id)].sort(),recordings,'every completed MP3 is selectable');
for(const t of provenance)assert.ok((await fs.stat(new URL('../'+t.file,import.meta.url))).size>1000,t.file);
const p=harness(), scenes={combat:{mode:'random',tracks:['rush','pursuit','swing']},explore:{mode:'single',tracks:['moonlight']}};
p.A.configureBgm({mode:'gemini',volume:.5,scenes});p.A.music('map');p.A.unlock();await settle();assert.match(p.media.at(-1).src,/moonlight/);
const ambient=p.media.at(-1);p.A.music('rest');p.A.music('title');await settle();assert.equal(p.media.at(-1),ambient,'noncombat scenes retain the chosen song');
p.A.music('combat');await settle();let previous=p.A.bgmInfo().id;
for(let n=0;n<12;n++){
 const a=p.media.at(-1),count=p.media.length;p.A.music('combat');await settle();assert.equal(p.media.length,count,'render must not reroll or restart');assert.equal(a.loop,false);
 a.paused=true;a.dispatchEvent(new Event('ended'));await settle();const id=p.A.bgmInfo().id;assert.ok(scenes.combat.tracks.includes(id));assert.notEqual(id,previous,'no immediate repeat');assert.equal(a.paused,true);previous=id;
}
p.A.music('boss');await settle();assert.ok(scenes.combat.tracks.includes(p.A.bgmInfo().id),'bosses honor battle playlist');
p.A.previewBgm('garden');await settle();assert.match(p.media.at(-1).src,/garden/);assert.equal(p.A.bgmInfo().preview,'garden');assert.equal(p.media.at(-1).loop,false);
p.A.music('boss');await settle();assert.equal(p.A.bgmInfo().id,'garden','redraw keeps audition');p.A.stopBgmPreview();await settle();assert.ok(scenes.combat.tracks.includes(p.A.bgmInfo().id));
p.A.music('map');await settle();p.A.previewBgm('garden');await settle();p.media.at(-1).paused=true;p.media.at(-1).dispatchEvent(new Event('ended'));await settle();assert.equal(p.A.bgmInfo().preview,null);assert.equal(p.A.bgmInfo().id,'moonlight');
p.A.configureBgm({scenes:{combat:{mode:'random',tracks:['rush']},explore:scenes.explore}});p.A.music('combat');await settle();assert.equal(p.media.at(-1).loop,true,'one-song random list loops');
const normalized=p.A.normalizeBgm({combat:{mode:'random',tracks:['bad','rush','rush']},explore:{mode:'bad',tracks:[]}});assert.equal(normalized.combat.tracks.join(','),'rush');assert.equal(normalized.explore.mode,'auto');assert.equal(normalized.explore.tracks[0],'ibara-map');
p.A.configureBgm({scenes:{combat:{mode:'single',tracks:['swing']},explore:scenes.explore}});await settle();const broken=p.media.at(-1);broken.dispatchEvent(new Event('error'));assert.equal(p.A.bgmInfo().fallback,true);assert.equal(p.native.scene,'combat');p.A.setMusic(false);assert.equal(p.native.on,false);
// No gesture, scene, settings update or lifecycle event may steal audio focus before explicit opt-in.
const silent=harness(true);silent.A.music('title');silent.document.dispatchEvent(new Event('pointerdown'));silent.document.dispatchEvent(new Event('keydown'));silent.A.unlock();silent.A.previewBgm('rush');silent.A.music('combat');silent.A.configureBgm({mode:'original',volume:.6});silent.window.dispatchEvent(new Event('pageshow'));await settle();
assert.equal(silent.media.length,0);assert.equal(silent.native.unlocks,0);assert.equal(silent.native.scene,null);assert.equal(silent.A.bgmInfo().externalAudio,true);
silent.A.setExternalAudio(false);silent.A.unlock();await settle();assert.equal(silent.native.scene,'combat');silent.A.configureBgm({mode:'gemini'});await settle();const pending=silent.media.at(-1);pending.pause();pending.defer=true;silent.A.unlock();silent.A.setExternalAudio(true);pending.resolve();await settle();assert.ok(silent.media.every(a=>a.paused));assert.equal(silent.native.scene,null);const count=silent.native.unlocks;silent.document.dispatchEvent(new Event('pointerdown'));assert.equal(silent.native.unlocks,count,'silent gestures do not reacquire focus');
console.log('Ibara BGM passed: all 30 recordings, independent playlists, no-repeat random advancement, single looping, boss coverage, audition/restore, render continuity, corrupt settings, mute, gesture, visibility, late playback and network fallback.');

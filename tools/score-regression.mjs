// Run with web-audio-engine installed, or pass its directory as the first argument.
// Optional second argument: write a WAV of BLACK CIRCUIT for listening checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {RenderingAudioContext}=require(process.argv[2]?path.resolve(process.argv[2]):'web-audio-engine');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scoreSource=fs.readFileSync(new URL('../assets/arena-score.js',import.meta.url),'utf8');
const levels={SET:{bgmVol:100}};vm.createContext(levels);
vm.runInContext(html.match(/function vol01\(v\)\{[^\n]+\}/)[0]+html.match(/function bgmGainVal\(\)\{[^\n]+\}/)[0],levels);
const moduleSource=html.slice(html.indexOf('function mtof('),html.indexOf('function bgmScheduler('));
const migration=html.slice(html.indexOf("if(SET.bgmEdition!=="),html.indexOf('/* ---------- WebAudio エンジン ---------- */'));
for(const [before,after] of [[undefined,'circuit'],['neon','circuit'],['overclock','redline'],['steel','afterburn'],['ambient','ambient'],['user:mine','user:mine']]){
  const ctx={SET:{bgmTrack:before},saveSettings(){}};vm.createContext(ctx);vm.runInContext(migration,ctx);
  assert.equal(ctx.SET.bgmTrack,after);ctx.SET.bgmTrack='pulse';vm.runInContext(migration,ctx);assert.equal(ctx.SET.bgmTrack,'pulse','Migration must only run once');
}
const pending=[];
for(const [id,mode] of [['circuit','battle'],['redline','battle'],['afterburn','battle'],['circuit','menu']]){
  const audio=new RenderingAudioContext({sampleRate:22050,numberOfChannels:2});
  const bus=audio.createGain();bus.gain.value=levels.bgmGainVal();bus.connect(audio.destination);
  const noise=audio.createBuffer(1,22050,22050),data=noise.getChannelData(0);let seed=107;
  for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}
  let renderMode=mode;
  const ctx={console,AC:audio,bgmBus:bus,noiseBuf:noise,delaySend:null,SET:{bgmTrack:id},
    document:{getElementById:()=>({classList:{contains:()=>renderMode==='battle'}})},
    setTimeout:()=>0,clearTimeout(){},isUserTrack:()=>false,saveSettings(){}};
  vm.createContext(ctx);vm.runInContext(scoreSource,ctx);
  vm.runInContext('let G={winner:null};'+moduleSource+';pumpG=AC.createGain();pumpG.connect(bgmBus);globalThis.testScore={score:ARENA_SCORE,state:BGM,tracks:TRACKS,step:scheduleStep};',ctx);
  const {state,tracks,step}=ctx.testScore,tr=tracks.find(t=>t.id===id),spb=60/tr.bpm/4;
  state.bar=-1;state.mode=mode;
  const sections=new Set();let scheduled=0,next=.03;
  const bars=mode==='battle'?32:24,duration=bars*16*spb;
  // Use the game's small scheduling horizon; finished nodes get released as it renders.
  for(let tick=0;tick<duration;tick+=.25){
    while(next<Math.min(duration,audio.currentTime+1.2)){
      step(scheduled,next,spb,tr);sections.add(ctx.testScore.score.arrange[state.mode][state.sec].n);
      next+=spb;scheduled++;
    }
    audio.processTo(Math.min(duration,tick+.25));
  }
  audio.processTo(duration+.8);
  const rendered=audio.exportAsAudioData();let peak=0,sum=0,stereo=0;
  for(let i=0;i<rendered.length;i++){
    const l=rendered.channelData[0][i],r=rendered.channelData[1][i];
    assert(Number.isFinite(l)&&Number.isFinite(r),'Audio must contain finite samples');
    peak=Math.max(peak,Math.abs(l),Math.abs(r));sum+=l*l+r*r;stereo+=Math.abs(l-r);
  }
  const rms=Math.sqrt(sum/(rendered.length*2));
  assert(peak<.95,'Mix needs headroom at maximum BGM volume');assert(rms>.01,'Score must render audible audio');
  assert(stereo>1,'Chord voices should have stereo width');assert(sections.size===4,'Every arrangement section must be reached');
  console.log(`${id} / ${mode}: ${scheduled} steps, ${sections.size} sections, peak ${peak.toFixed(3)}, RMS ${rms.toFixed(3)}`);
  if(id==='circuit'&&mode==='battle'&&process.argv[3])pending.push(audio.encodeAudioData(rendered).then(buf=>fs.writeFileSync(process.argv[3],Buffer.from(buf))));
  // Resume into another mode without invalid sections or stale scheduling state.
  renderMode=mode==='menu'?'battle':'menu';step(scheduled,audio.currentTime+.03,spb,tr);
}
await Promise.all(pending);
console.log('Score: settings migration, original audio graph, all tracks/sections, stereo, finite samples and headroom passed');

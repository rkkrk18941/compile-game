import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {GameAudio,CARD_SOUNDS,cardSound,audioSettings} from '../skull-king/audio.mjs';
import {skullKingScore,SKULL_KING_TRACKS} from '../music-studio/skullking-scores.mjs';
import {normalizeScore,midiBytes} from '../music-studio/core.mjs';
import {demo} from '../music-studio/demos.mjs';
import {voice} from '../music-studio/audio.mjs';
const require=createRequire(import.meta.url),E=require('../skull-king/engine.js');
assert.equal(audioSettings(null).cardSound,'felt');
assert.equal(audioSettings({sfxVolume:4,bgmVolume:-2}).sfxVolume,1);
assert.equal(audioSettings({sfxVolume:0,bgmVolume:0}).bgmVolume,0);
assert.equal(audioSettings({cardSound:'bad',bgmTrack:'bad'}).bgmTrack,'rush');
for(const [old,next]of [['harbor','rush'],['sailing','cipher'],['moonlight','verdict']]){
 const migrated=audioSettings({bgmTrack:old,bgmVolume:.07,bgmEnabled:false,sfxEnabled:false});
 assert.equal(migrated.bgmTrack,next);assert.equal(migrated.bgmVolume,.07);assert(!migrated.bgmEnabled&&!migrated.sfxEnabled);
 assert.equal(audioSettings({...migrated,bgmTrack:old}).bgmTrack,old,'a deliberate calm-track selection survives subsequent edits');
 assert.deepEqual(audioSettings(migrated),migrated,'migration is idempotent');
}
assert.equal(audioSettings({bgmEdition:2,bgmTrack:'mind'}).bgmTrack,'rush');
assert.equal(audioSettings({bgmEdition:3,bgmTrack:'mind'}).bgmTrack,'mind');
for(const meta of SKULL_KING_TRACKS){
 const score=skullKingScore(meta.id);
 assert.deepEqual(normalizeScore(score),score);assert.deepEqual(demo('sk-'+meta.id),score,'studio and game use the identical score');
 const electronic=['mind','cipher','verdict'].includes(meta.id);
 const live=['rush','pursuit','swing'].includes(meta.id);
 assert.equal(score.bars,live?48:electronic?32:16);assert(score.tracks.length>=4);
 assert(score.tracks.every(t=>!['chip','lead'].includes(t.instrument)));
 assert(score.tracks.every(t=>t.volume<=(live?.75:.46)));assert(midiBytes(score).length>500);
 const seconds=score.bars*score.beatsPerBar*60/score.tempo;assert(seconds>30&&seconds<90);
 if(electronic){
  const bass=score.tracks.find(t=>t.instrument==='synthbass'),drums=score.tracks.find(t=>t.instrument==='drums');
  for(const t of [bass,drums]){
   assert(!t.notes.some(n=>n.beat>=64&&n.beat<80),'breakdown removes bass and percussion');
   assert(t.notes.some(n=>n.beat>=96&&n.beat<120),'the final section restores the groove');
  }
  assert(drums.notes.some(n=>n.beat%1!==0),'drums include syncopation');
  assert(score.tracks.some(t=>t.instrument==='sequence'));
 }
 const melody=score.tracks[0].notes;
 assert(new Set(melody.map(n=>n.velocity)).size>=3);assert(melody.some(n=>n.beat%1!==0));
 assert(melody.reduce((n,x)=>n+x.duration,0)<score.bars*score.beatsPerBar*.8,'melody has breathing room');
}

// Inspect actual synthesis scheduling: no hard full-volume noise onset.
function fakeContext(){
 const nodes=[],events=[];
 const param=()=>({value:0,setValueAtTime(v,t){events.push(['set',v,t]);},linearRampToValueAtTime(v,t){events.push(['linear',v,t]);},exponentialRampToValueAtTime(v,t){events.push(['exp',v,t]);},setTargetAtTime(){}});
 const node=kind=>{const n={kind,connect(){},disconnect(){this.disconnected=true;},start(t){this.starts=t;},stop(t){this.stops=t;},frequency:param(),detune:param(),pan:param(),gain:param(),Q:param()};nodes.push(n);return n;};
 return {currentTime:0,sampleRate:44100,nodes,events,createOscillator:()=>node('osc'),createGain:()=>node('gain'),createStereoPanner:()=>node('pan'),createBiquadFilter:()=>node('filter'),createBufferSource:()=>node('buffer'),createBuffer:(c,n)=>({getChannelData:()=>new Float32Array(n)})};
}
for(const instrument of ['synthbass','sequence','glass']){
 const ctx=fakeContext(),stop=voice(ctx,{}, {instrument,volume:.46,pan:.2},{pitch:instrument==='synthbass'?38:74,velocity:.7},1,.2);
 assert(ctx.nodes.filter(n=>n.kind==='osc').every(n=>n.starts===1&&n.stops>1.2&&n.stops<2),'voices have finite scheduled lifetimes');
 assert(ctx.events.every(e=>Number.isFinite(e[1])&&Number.isFinite(e[2])));
 if(instrument!=='glass'){
  assert(ctx.nodes.some(n=>n.kind==='filter'&&n.type==='lowpass'));
  assert(ctx.events.some(e=>e[0]==='exp'&&e[1]>=90),'synth filter has a falling cutoff envelope');
 }
 stop();assert(ctx.nodes.every(n=>n.disconnected),'switching tracks disconnects every synth node');
}
for(const style of CARD_SOUNDS){
 const ctx=fakeContext();cardSound(ctx,{},style.id);
 const peaks=ctx.events.filter(e=>e[0]==='linear');assert(peaks.length>0);assert(peaks.every(e=>e[1]<=.08&&e[2]>=.012));
 assert(ctx.nodes.filter(n=>['osc','buffer'].includes(n.kind)).every(n=>n.stops<=.26));
 for(const filter of ctx.nodes.filter(n=>n.kind==='filter'))assert(filter.type==='lowpass'&&filter.frequency.value<=1050);
}

class FakePlayer{
 constructor(){this.running=false;this.position=0;this.plays=[];this.ctx={currentTime:0};this.out={gain:{setTargetAtTime(){}}};}
 async ready(){}
 async play(score,position,loop){this.score=score;this.position=position;this.running=true;this.plays.push({title:score.title,position,loop});}
 stop(reset=true){this.running=false;if(reset)this.position=0;}
}
const saved=new Map(),storage={get:(k,d)=>saved.has(k)?saved.get(k):d,set:(k,v)=>saved.set(k,JSON.parse(JSON.stringify(v)))};
const audio=new GameAudio(storage,{PlayerClass:FakePlayer});
const legacyMute=new GameAudio({get:(k,d)=>k==='sound'?false:d,set(){}},{PlayerClass:FakePlayer});
assert(!legacyMute.settings.sfxEnabled&&!legacyMute.settings.bgmEnabled,'an existing mute preference also silences new BGM');
audio.setActive(true);audio.update({bgmTrack:'verdict'});audio.update({bgmTrack:'cipher'});await audio.musicQueue;
assert.deepEqual(audio.music.plays.map(x=>x.title),['暗号の駆け引き'],'rapid changes only start the latest track');
audio.music.position=7;audio.setVisible(false);assert(!audio.music.running);
audio.setVisible(true);await audio.musicQueue;assert.equal(audio.music.plays.at(-1).position,7,'background pause resumes position');
audio.update({bgmEnabled:false});await audio.musicQueue;assert(!audio.music.running);assert(audio.on,'BGM mute does not mute effects');
audio.set(false);assert(!audio.on);audio.update({sfxVolume:0,cardSound:'paper'});
const restored=new GameAudio(storage,{PlayerClass:FakePlayer});assert.equal(restored.settings.cardSound,'paper');assert.equal(restored.settings.sfxVolume,0);assert(!restored.on);
restored.setPreview(true);await restored.musicQueue;assert(restored.music.running,'explicit preview works outside a game');
restored.setPreview(false);await restored.musicQueue;assert(!restored.music.running,'closing settings stops a title-screen preview');
class SlowPlayer extends FakePlayer{async ready(){await new Promise(resolve=>this.resolve=resolve);}}
const delayed=new GameAudio(storage,{PlayerClass:SlowPlayer});delayed.update({bgmEnabled:true,bgmVolume:.18});delayed.setActive(true);
await Promise.resolve();await Promise.resolve();delayed.setActive(false);delayed.music.resolve?.();await delayed.musicQueue;
assert.equal(delayed.music.plays.length,0,'a delayed resume cannot start audio after leaving the game');

// Parent badges refer to the round starter, independently of the current lead.
const source=fs.readFileSync(new URL('../skull-king/app.js',import.meta.url),'utf8');
function extract(name){const a=source.indexOf('  function '+name+'('),b=source.indexOf('\n  function ',a+1);assert(a>=0);return source.slice(a,b<0?undefined:b);}
const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:''});return elements.get(id);};
const ui=vm.createContext({E,app:{v:null},disp:null,$,window:{innerWidth:400},seatName:s=>s===0?'あなた':'P'+s});
for(const name of ['blankDisp','syncDisp','parentBadge','renderTop'])vm.runInContext(extract(name),ui);
for(let n=2;n<=8;n++){
 const st=E.newGame({players:Array.from({length:n},(_,i)=>({name:'P'+i})),first:n-1});const view=E.view(st,0);ui.app.v=view;ui.syncDisp(view);
 assert.equal(ui.disp.parent,n-1);ui.renderTop(view);assert.equal($('#tParent').textContent,'親：P'+(n-1));
 assert.match(ui.parentBadge(n-1),/>親</);assert.equal(ui.parentBadge(0),'');
 view.trick={leader:0,plays:[]};ui.syncDisp(view);assert.match(ui.parentBadge(n-1),/>親</,'trick winner does not become the round parent');
}
assert(source.includes('disp.parent = e.leader'),'the deal animation updates the visible parent');
assert(source.includes('先出し：'));assert(!source.includes('noise(c, 0.07, 0.35'));
console.log('Audio/parent passed: 9 shared editable scores, electronic synthesis and arrangements, one-time preference migration, gentle envelopes, 4 effects, mute/volume persistence, rapid switching, background/async cancellation and parent labels for 2–8 players.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SampleLibrary,SAMPLE_INSTRUMENTS} from '../music-studio/samples.mjs';
import {sampleLibrary as playbackLibrary} from '../music-studio/samples.mjs?v=20261022-rush1';
import {Player} from '../music-studio/audio.mjs';
import {skullKingScore} from '../music-studio/skullking-scores.mjs';
import {midiBytes,normalizeScore} from '../music-studio/core.mjs';
const banks=Object.fromEntries(Object.keys(SAMPLE_INSTRUMENTS).map(id=>[id,JSON.parse(fs.readFileSync(new URL('../music-studio/samples/'+id+'.json',import.meta.url)))]));
let bytes=0;
for(const [id,bank]of Object.entries(banks)){
 assert.equal(bank.version,1);assert.match(bank.source.blob,/^[a-f0-9]{40}$/);assert.equal(bank.source.license,'CC BY 3.0 US');
 for(const [pitch,encoded]of Object.entries(bank.samples)){
  assert(Number.isInteger(+pitch)&&+pitch>=0&&+pitch<=127);const data=Buffer.from(encoded,'base64');
  assert(data.length>3000&&data.subarray(0,3).toString()==='ID3','self-hosted MP3 samples');bytes+=data.length;
 }
}
assert(bytes<1_200_000,'sample banks stay small enough for mobile loading');
function context(){
 const nodes=[];let decodes=0;
 const param=()=>({value:1,setValueAtTime(v,t){assert(Number.isFinite(v)&&Number.isFinite(t));},linearRampToValueAtTime(v,t){assert(v>0&&Number.isFinite(t));},exponentialRampToValueAtTime(v,t){assert(v>0&&Number.isFinite(t));}});
 const node=kind=>{const n={kind,gain:param(),pan:param(),playbackRate:param(),connect(){},disconnect(){this.disconnected=true;},start(t){this.startAt=t;},stop(t){this.stopAt=t;}};nodes.push(n);return n;};
 return {currentTime:1,nodes,get decodes(){return decodes;},async decodeAudioData(data){assert(data.byteLength>100);decodes++;return {duration:2.6};},createBufferSource:()=>node('sample'),createGain:()=>node('gain'),createStereoPanner:()=>node('pan')};
}
let requests=0;
const loader=async url=>{requests++;return {ok:true,json:async()=>banks[url.pathname.split('/').at(-1).replace('.json','')]};};
const library=new SampleLibrary(loader),ctx=context(),t={instrument:'guitar',volume:.4,pan:.1,notes:[{pitch:60},{pitch:61}]};
await Promise.all([library.prepare(ctx,[t]),library.prepare(ctx,[t])]);assert.equal(requests,1);assert.equal(ctx.decodes,1,'concurrent playback requests share download and decode');
await library.prepare(ctx,[t]);assert.equal(ctx.decodes,1,'already decoded notes are reused');
const stop=library.voice(ctx,{},t,{pitch:61,velocity:.7},2,.25),source=ctx.nodes.find(x=>x.kind==='sample');
assert(Math.abs(source.playbackRate.value-2**(1/12))<1e-10);assert.equal(source.startAt,2);assert(source.stopAt>2.25&&source.stopAt<2.5);
stop();assert(ctx.nodes.every(n=>n.disconnected),'muting releases all sample nodes');
let calls=0;const retry=new SampleLibrary(async(...args)=>{if(++calls===1)throw Error('offline');return loader(...args);});
await assert.rejects(()=>retry.prepare(context(),[t]),/もう一度再生/);await retry.prepare(context(),[t]);assert.equal(calls,2,'failed downloads can be retried');
const badContext=context(),decode=badContext.decodeAudioData.bind(badContext);let fail=true;
badContext.decodeAudioData=async data=>{if(fail){fail=false;throw Error('decode');}return decode(data);};
await assert.rejects(()=>library.prepare(badContext,[t]),/読み込めません/);await library.prepare(badContext,[t]);

const styles=['rush','pursuit','swing'].map(skullKingScore);
assert.deepEqual(styles.map(s=>s.tempo),[176,168,192]);assert.deepEqual(styles.map(s=>s.beatsPerBar),[4,3,4]);
for(const score of styles){
 assert.deepEqual(normalizeScore(score),score);assert(midiBytes(score).length>1000);
 assert(score.tracks.every(t=>t.instrument==='drums'||Object.hasOwn(banks,t.instrument)),'new melodic parts use instrument samples');
 for(const track of score.tracks.filter(t=>t.instrument!=='drums')){
  const keys=Object.keys(banks[track.instrument].samples).map(Number);
  assert(track.notes.every(n=>Math.min(...keys.map(k=>Math.abs(k-n.pitch)))<=3),'no extreme sample pitch shifting');
 }
 await library.prepare(context(),score.tracks);
}
assert(!styles[1].tracks.some(t=>t.instrument==='drums'),'orchestra uses pitched timpani instead of a drum-machine groove');
assert(styles[2].tracks.some(t=>t.notes.some(n=>Math.abs(n.beat%1-.667)<.001)),'jazz uses swung offbeats');
assert(styles[2].tracks.find(t=>t.instrument==='upright').notes.every(n=>n.beat%1===0),'walking bass moves on quarter notes');

// A slow initial sample load must not restart playback after Stop or a track change.
const originalPrepare=playbackLibrary.prepare;let release;
playbackLibrary.prepare=()=>new Promise(resolve=>{release=resolve;});
try{
 class TestPlayer extends Player{async ready(){this.ctx=context();this.out={};}tick(){this.ticked=true;}}
 const player=new TestPlayer(),pending=player.play(styles[0]);await Promise.resolve();await Promise.resolve();
 player.stop();release();await pending;assert(!player.running&&!player.ticked);
}finally{playbackLibrary.prepare=originalPrepare;}
console.log('Music samples passed: 8 banks, compact MP3 assets, deduplicated loading, pitch selection, retry, cleanup, 3 distinct arrangements, MIDI and cancellation during initial load.');

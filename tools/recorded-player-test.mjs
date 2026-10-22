import assert from 'node:assert/strict';
import {RecordedPlayer} from '../music-studio/recorded-player.mjs';
const requests=[];
globalThis.fetch=(url,{signal})=>new Promise(resolve=>requests.push({url,signal,resolve}));
const starts=[];
function player(){const p=new RecordedPlayer();p.ready=async()=>{p.ctx={currentTime:10,decodeAudioData:async()=>({duration:120}),createBufferSource:()=>({connect(){},disconnect(){},start(at,offset){starts.push(offset);},stop(){}})};p.out={};};return p;}
const score=title=>({title,tempo:120,bars:60,beatsPerBar:4,recording:{url:'https://example.com/'+title+'.mp3'}});
const p=player();let a=p.play(score('a'),12,true);await Promise.resolve();
const reply=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
p.stop(false);assert(requests[0].signal.aborted);requests[0].resolve(reply());await a;
assert(!p.running&&starts.length===0,'stopping during a download cannot start the track later');
const q=player();let old=q.play(score('old'));let latest=q.play(score('latest'));
await Promise.resolve();assert(requests.at(-1).url.endsWith('/latest.mp3'),'a superseded start cannot replace the latest source');
requests.at(-1).resolve(reply());await Promise.all([old,latest]);assert(q.running&&q.loop);q.stop();
const resumed=q.play(score('latest'),12);await resumed;assert.equal(starts.at(-1),6,'resume position converts beats to audio seconds');q.stop();assert.equal(q.position,0);
console.log('Recorded playback: resume conversion, pending-play cancellation, rapid track changes and stop passed.');

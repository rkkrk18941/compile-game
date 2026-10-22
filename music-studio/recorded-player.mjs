// Completed audio uses the same output bus and controls as NOTE's score player.
import {Player} from './audio.mjs?v=20261022-rush1';
export class RecordedPlayer extends Player {
 async play(score, position=0, loop=true) {
  if(!score.recording)return super.play(score,position,loop);
  this.stop(false);const ticket=this.generation;await this.ready();
  if(ticket!==this.generation)return;
  const src=new URL(score.recording.url,import.meta.url).href;
  let buffer=this.decoded?.url===src?this.decoded.buffer:null;
  if(!buffer){
   const controller=new AbortController();this.loading=controller;
   try{
    const response=await fetch(src,{signal:controller.signal});
    if(!response.ok)throw Error('音源を読み込めませんでした');
    buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
   }finally{if(this.loading===controller)this.loading=null;}
   if(ticket!==this.generation)return;
   // Retain just the selected song, keeping memory bounded on phones.
   this.decoded={url:src,buffer};
  }
  if(ticket!==this.generation)return;
  this.score=score;this.loop=loop;
  const source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=loop;source.connect(this.out);
  const offset=Math.max(0,position*60/score.tempo)%buffer.duration;
  this.origin=this.ctx.currentTime-offset;
  source.onended=()=>{if(ticket===this.generation&&!loop){this.stop();this.onEnded?.();}};
  this.active=[{until:Infinity,stop:()=>{source.onended=null;try{source.stop();}catch{}source.disconnect();}}];
  source.start(0,offset);
  this.running=true;this.position=position;
  this.timer=setInterval(()=>{this.position=((this.ctx.currentTime-this.origin)%buffer.duration)*score.tempo/60;this.onPosition?.(this.position);},100);
 }
 stop(reset=true){this.loading?.abort();this.loading=null;super.stop(reset);}
}

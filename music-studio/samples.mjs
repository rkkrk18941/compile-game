// Compact self-hosted instrument samples. See samples/credits.html for attribution.
export const SAMPLE_INSTRUMENTS={
 guitar:{name:'ロックギター',program:29,release:.08},
 fingerbass:{name:'エレキベース',program:33,release:.10},
 concertpiano:{name:'グランドピアノ',program:0,release:.28},
 bowedstrings:{name:'弦楽アンサンブル',program:48,release:.18,attack:.025},
 violin:{name:'バイオリン',program:40,release:.12,attack:.018},
 trumpet:{name:'トランペット',program:56,release:.11,attack:.015},
 upright:{name:'ウッドベース',program:32,release:.18},
 timpani:{name:'ティンパニ',program:47,release:.50}
};
export const isSampled=id=>Object.hasOwn(SAMPLE_INSTRUMENTS,id);
const nearest=(keys,pitch)=>keys.reduce((best,p)=>Math.abs(p-pitch)<Math.abs(best-pitch)?p:best);
export class SampleLibrary{
 constructor(fetcher=(...args)=>fetch(...args)){this.fetcher=fetcher;this.assets=new Map();this.contexts=new WeakMap();}
 async asset(id){
  if(!isSampled(id))throw Error('楽器名が不正です');
  if(!this.assets.has(id)){
   const request=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
     const response=await this.fetcher(new URL('./samples/'+id+'.json',import.meta.url),{signal:controller.signal});
     if(!response.ok)throw Error('HTTP '+response.status);
     const data=await response.json(),keys=Object.keys(data.samples||{}).map(Number).filter(Number.isFinite);
     if(data.version!==1||!keys.length)throw Error('Invalid sample bank');
     return {samples:data.samples,keys:keys.sort((a,b)=>a-b)};
    }finally{clearTimeout(timer);}
   })();
   this.assets.set(id,request);
   request.catch(()=>{if(this.assets.get(id)===request)this.assets.delete(id);});
  }
  return this.assets.get(id);
 }
 context(ctx){if(!this.contexts.has(ctx))this.contexts.set(ctx,new Map());return this.contexts.get(ctx);}
 async prepare(ctx,tracks){
  try{
   await Promise.all(tracks.filter(t=>isSampled(t.instrument)&&t.notes.length).map(async t=>{
    const bank=await this.asset(t.instrument),cache=this.context(ctx);
    const pitches=[...new Set(t.notes.map(n=>nearest(bank.keys,n.pitch)))];
    await Promise.all(pitches.map(async pitch=>{
     const key=t.instrument+':'+pitch;
     if(!cache.has(key)){
      const pending=(async()=>{
       const bytes=Uint8Array.from(atob(bank.samples[pitch]),c=>c.charCodeAt(0));
       const buffer=await ctx.decodeAudioData(bytes.buffer);
       if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Invalid audio');
       return {pitch,buffer};
      })();
      cache.set(key,pending);pending.catch(()=>{if(cache.get(key)===pending)cache.delete(key);});
     }
     const loaded=await cache.get(key);cache.set(key,loaded);
    }));
   }));
  }catch{throw Error('楽器音源を読み込めませんでした。通信を確認して、もう一度再生してください。');}
 }
 voice(ctx,out,track,note,when,duration){
  const available=[...this.context(ctx).entries()].filter(([key,value])=>key.startsWith(track.instrument+':')&&value.buffer).map(([,value])=>value);
  if(!available.length)throw Error('楽器音源の準備ができていません');
  const sample=available.reduce((best,v)=>Math.abs(v.pitch-note.pitch)<Math.abs(best.pitch-note.pitch)?v:best);
  const meta=SAMPLE_INSTRUMENTS[track.instrument],source=ctx.createBufferSource(),amp=ctx.createGain(),pan=ctx.createStereoPanner();
  source.buffer=sample.buffer;source.playbackRate.value=2**((note.pitch-sample.pitch)/12);pan.pan.value=track.pan;
  const start=Math.max(ctx.currentTime,when),availableTime=sample.buffer.duration/source.playbackRate.value;
  const gate=Math.max(.025,Math.min(duration,availableTime-meta.release-.02)),release=Math.min(meta.release,Math.max(.01,availableTime-gate-.01));
  const peak=start+Math.min(meta.attack??.006,gate*.3),end=start+gate+release,level=note.velocity*track.volume*.5;
  amp.gain.setValueAtTime(.00001,start);amp.gain.linearRampToValueAtTime(level,peak);
  amp.gain.setValueAtTime(level,start+gate);amp.gain.exponentialRampToValueAtTime(.00001,end);
  source.connect(amp);amp.connect(pan);pan.connect(out);
  let stopped=false;const cleanup=()=>{source.disconnect();amp.disconnect();pan.disconnect();};
  source.onended=cleanup;source.start(start);source.stop(end+.005);
  return()=>{if(stopped)return;stopped=true;try{source.stop();}catch{}cleanup();};
 }
}
export const sampleLibrary=new SampleLibrary();

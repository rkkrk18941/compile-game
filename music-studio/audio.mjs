import {audibleTracks,wavBytes} from './core.mjs?v=20261022-rush1';
import {sampleLibrary,isSampled} from './samples.mjs?v=20261022-rush1';
const noiseCache=new WeakMap();
function noise(ctx){if(noiseCache.has(ctx))return noiseCache.get(ctx);const b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),a=b.getChannelData(0);let seed=1234567;for(let i=0;i<a.length;i++){seed=(seed*1664525+1013904223)>>>0;a[i]=seed/2147483648-1;}noiseCache.set(ctx,b);return b;}
export function bus(ctx,master=0.8){const gain=ctx.createGain();gain.gain.value=master;const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=18;comp.ratio.value=6;gain.connect(comp);comp.connect(ctx.destination);return gain;}
export function voice(ctx,out,t,n,when,duration){
 if(isSampled(t.instrument))return sampleLibrary.voice(ctx,out,t,n,when,duration);
 const start=Math.max(ctx.currentTime,when),freq=440*2**((n.pitch-69)/12),level=n.velocity*t.volume*.24;
 const amp=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=t.pan; amp.connect(pan);pan.connect(out);
 const sources=[],nodes=[amp,pan];let release=.18,input=amp;
 function osc(type,f,g=1,detune=0){const o=ctx.createOscillator(),v=ctx.createGain();o.type=type;o.frequency.value=f;o.detune.value=detune;v.gain.value=g;o.connect(v);v.connect(input);sources.push(o);nodes.push(o,v);return o;}
 // Filter the electronic voices before their amplitude envelope; no raw saw buzz.
 if(t.instrument==='synthbass'||t.instrument==='sequence'){
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=t.instrument==='synthbass'?.8:1.1;
  const top=t.instrument==='synthbass'?Math.min(1400,freq*10):Math.min(3600,freq*5);
  filter.frequency.setValueAtTime(top,start);filter.frequency.exponentialRampToValueAtTime(Math.max(90,top*.23),start+.2);
  filter.connect(amp);input=filter;nodes.push(filter);
 }
 let attack=.008,sustain=.55;
 if(t.instrument==='drums'){
  release=.12;duration=Math.min(duration,.2);sustain=.01;
  if(n.pitch===36){const o=osc('sine',140,2);o.frequency.setValueAtTime(145,start);o.frequency.exponentialRampToValueAtTime(42,start+.12);release=.12;}
  else if(n.pitch===51){
   // A quiet inharmonic ride sustain, distinct from the short closed-hat noise.
   [[320,.17],[843,.13],[1471,.08],[2417,.045],[3791,.025]].forEach(([f,g])=>osc('sine',f,g));
   duration=.10;release=.38;sustain=.07;
  }
  else if(n.pitch===45||n.pitch===47||n.pitch===50){const o=osc('sine',n.pitch===45?150:210,1.4);o.frequency.exponentialRampToValueAtTime(75,start+.16);release=.18;}
  else{const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter();src.buffer=noise(ctx);filter.type=n.pitch===38?'highpass':'highpass';filter.frequency.value=n.pitch===38?1200:6500;src.connect(filter);filter.connect(amp);sources.push(src);nodes.push(src,filter);duration=n.pitch===38?.08:n.pitch===49?.25:n.pitch===46?.15:.025;release=n.pitch===49?.9:n.pitch===46?.3:n.pitch===38?.13:.05;if(n.pitch===38)osc('triangle',185,.35);}
 }else if(t.instrument==='synthbass'){osc('sawtooth',freq,.47);osc('sine',freq,.7);osc('sine',freq/2,.23);attack=.012;sustain=.3;release=.09;}
 else if(t.instrument==='sequence'){osc('sawtooth',freq,.36,-3);osc('triangle',freq,.5,3);attack=.012;sustain=.06;release=.09;}
 else if(t.instrument==='glass'){
  const carrier=osc('sine',freq,.85),mod=ctx.createOscillator(),depth=ctx.createGain();
  mod.frequency.value=freq*2.003;depth.gain.setValueAtTime(freq*.8,start);depth.gain.exponentialRampToValueAtTime(freq*.025,start+.24);
  mod.connect(depth);depth.connect(carrier.frequency);sources.push(mod);nodes.push(mod,depth);
  osc('sine',freq*3,.08);attack=.012;sustain=.025;release=.65;
 }
 else if(t.instrument==='piano'){osc('sine',freq,1);osc('sine',freq*2,.25);osc('sine',freq*3,.12);sustain=.13;release=.35;}
 else if(t.instrument==='bell'){osc('sine',freq,.8);osc('sine',freq*2.76,.24);osc('sine',freq*5.4,.09);sustain=.15;release=.9;}
 else if(t.instrument==='pluck'){osc('triangle',freq);osc('sine',freq*2,.15);sustain=.04;release=.16;}
 else if(t.instrument==='bass'){osc('triangle',freq,1.1);osc('sine',freq/2,.3);attack=.012;release=.1;}
 else if(t.instrument==='chip'){osc('square',freq,.4);sustain=.5;release=.045;}
 else if(t.instrument==='lead'){osc('sawtooth',freq,.38,-5);osc('triangle',freq,.6,5);attack=.015;release=.15;}
 else{osc('sine',freq,.7,-7);osc('triangle',freq,.45,7);osc('sine',freq*2,.12);attack=t.instrument==='pad'?.15:.07;sustain=.7;release=t.instrument==='pad'?.6:.3;}
 const gate=Math.max(.025,duration),peak=start+Math.min(attack,gate*.3),decay=peak+Math.min(.18,gate*.4),end=start+gate+release;
 amp.gain.setValueAtTime(.00001,start);amp.gain.linearRampToValueAtTime(level,peak);amp.gain.exponentialRampToValueAtTime(Math.max(.00001,level*sustain),decay);amp.gain.setValueAtTime(Math.max(.00001,level*sustain),Math.max(decay,start+gate));amp.gain.exponentialRampToValueAtTime(.00001,end);
 let stopped=false;const cleanup=()=>{for(const x of nodes)try{x.disconnect();}catch{}};
 sources.forEach((s,i)=>{s.start(start);s.stop(end+.02);if(i===0)s.onended=cleanup;});
 return()=>{if(stopped)return;stopped=true;for(const s of sources)try{s.stop();}catch{}cleanup();};
}
export class Player{
 constructor(onPosition,onEnded){this.onPosition=onPosition;this.onEnded=onEnded;this.ctx=null;this.running=false;this.position=0;this.active=[];this.generation=0;}
 async ready(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('このブラウザは音声再生に対応していません');if(!this.ctx){this.ctx=new C();this.out=bus(this.ctx);}await this.ctx.resume();if(this.ctx.state!=='running')throw Error('再生ボタンをもう一度押してください');}
 async preview(t,n){const ticket=this.generation;await this.ready();await sampleLibrary.prepare(this.ctx,[{...t,notes:[n]}]);if(ticket===this.generation){this.active=this.active.filter(x=>x.until>this.ctx.currentTime);this.active.push({until:this.ctx.currentTime+2,stop:voice(this.ctx,this.out,t,n,this.ctx.currentTime,.22)});}}
 async play(score,position=0,loop=true){this.stop(false);const ticket=this.generation;await this.ready();await sampleLibrary.prepare(this.ctx,audibleTracks(score));if(ticket!==this.generation)return;this.score=score;this.loop=loop;this.running=true;this.position=position;this.origin=this.ctx.currentTime+.06-position*60/score.tempo;this.events=audibleTracks(score).flatMap(t=>t.notes.map(n=>({t,n}))).sort((a,b)=>a.n.beat-b.n.beat);this.index=this.events.findIndex(e=>e.n.beat>=position-.00001);if(this.index<0)this.index=this.events.length;this.active=[];this.cycle=0;this.tick();this.timer=setInterval(()=>this.tick(),30);}
 tick(){if(!this.running)return;const spb=60/this.score.tempo,total=this.score.bars*this.score.beatsPerBar,now=this.ctx.currentTime;this.position=Math.max(0,(now-this.origin)/spb);
  if(this.position>=total){if(this.loop){this.origin+=total*spb;this.position-=total;this.index=0;this.cycle++;}else{this.stop();this.onEnded?.();return;}}
  const horizon=(now+.16-this.origin)/spb;while(this.index<this.events.length&&this.events[this.index].n.beat<horizon){const{t,n}=this.events[this.index++];const at=this.origin+n.beat*spb;if(at>=now-.05)this.active.push({until:at+n.duration*spb+1.5,stop:voice(this.ctx,this.out,t,n,at,n.duration*spb)});}
  this.active=this.active.filter(x=>x.until>now);this.onPosition?.(Math.min(total,this.position));
 }
 pause(){const p=this.position;this.stop(false);this.position=p;return p;}
 stop(reset=true){this.generation++;this.running=false;clearInterval(this.timer);this.active.forEach(x=>x.stop());this.active=[];if(reset){this.position=0;this.onPosition?.(0);}}
}
export async function renderWav(score,onProgress){
 const seconds=score.bars*score.beatsPerBar*60/score.tempo,rate=22050;
 const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)throw Error('このブラウザはWAV書き出しに対応していません');
 const ctx=new C(2,Math.ceil((seconds+1.5)*rate),rate),out=bus(ctx);let count=0;
 await sampleLibrary.prepare(ctx,audibleTracks(score));
 for(const t of audibleTracks(score))for(const n of t.notes){voice(ctx,out,t,n,n.beat*60/score.tempo,n.duration*60/score.tempo);if(++count%120===0){onProgress?.(count);await new Promise(r=>setTimeout(r,0));}}
 const buffer=await ctx.startRendering();
 // Fold the reverb/release tail back into the start, retaining exactly one loop.
 const frames=Math.floor(seconds*rate),tail=buffer.length-frames,loop=ctx.createBuffer(2,frames,rate);
 for(let c=0;c<2;c++){const src=buffer.getChannelData(c),dst=loop.getChannelData(c);dst.set(src.subarray(0,frames));for(let i=0;i<Math.min(tail,frames);i++)dst[i]+=src[frames+i];}
 return new Blob([wavBytes(loop)],{type:'audio/wav'});
}

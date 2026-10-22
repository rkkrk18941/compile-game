import {RecordedPlayer as Player} from '../music-studio/recorded-player.mjs?v=20261022-gemini1';
import {RECORDINGS} from '../assets/gemini-catalog.mjs?v=20261022-gemini1';
import {SKULL_KING_TRACKS,skullKingScore} from '../music-studio/skullking-scores.mjs?v=20261022-rush2';

export {SKULL_KING_TRACKS};
export const CARD_SOUNDS=[
 {id:'felt',name:'フェルトに置く',description:'低く丸い、控えめな音'},
 {id:'paper',name:'やわらかい紙',description:'高いノイズを抑えた、短い紙の音'},
 {id:'wood',name:'木のテーブル',description:'軽くコトッと置く音'},
 {id:'chime',name:'小さなチャイム',description:'静かで短い、澄んだ音'}
];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function audioSettings(raw={}){
 raw=raw&&typeof raw==='object'?raw:{};
 const volume=(v,fallback)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,0,1):fallback;
 const previous={harbor:'rush',sailing:'cipher',moonlight:'verdict'};
 let track=raw.bgmEdition>=2?raw.bgmTrack:(previous[raw.bgmTrack]||raw.bgmTrack);
 if(raw.bgmEdition!==3&&track==='mind')track='rush';
 return {bgmEdition:3,sfxEnabled:typeof raw.sfxEnabled==='boolean'?raw.sfxEnabled:true,
  cardSound:CARD_SOUNDS.some(s=>s.id===raw.cardSound)?raw.cardSound:'felt',sfxVolume:volume(raw.sfxVolume,.4),
  bgmEnabled:typeof raw.bgmEnabled==='boolean'?raw.bgmEnabled:true,
  bgmTrack:SKULL_KING_TRACKS.some(t=>t.id===track)?track:'rush',bgmVolume:volume(raw.bgmVolume,.18)};
}
function tone(ctx,out,freq,duration,volume,{at=0,to=freq,type='sine'}={}){
 const start=ctx.currentTime+at,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;
 osc.frequency.setValueAtTime(freq,start);osc.frequency.exponentialRampToValueAtTime(to,start+duration);
 gain.gain.setValueAtTime(.00001,start);gain.gain.linearRampToValueAtTime(volume,start+.014);
 gain.gain.exponentialRampToValueAtTime(.00001,start+duration);
 osc.connect(gain);gain.connect(out);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+duration+.03);
}
function noise(ctx,out,duration,volume,frequency=1000){
 const start=ctx.currentTime,frames=Math.floor(ctx.sampleRate*duration),buffer=ctx.createBuffer(1,frames,ctx.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<frames;i++)data[i]=(Math.random()*2-1);
 const source=ctx.createBufferSource(),low=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;
 low.type='lowpass';low.frequency.value=frequency;low.Q.value=.45;
 gain.gain.setValueAtTime(.00001,start);gain.gain.linearRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.00001,start+duration);
 source.connect(low);low.connect(gain);gain.connect(out);source.onended=()=>{source.disconnect();low.disconnect();gain.disconnect();};source.start(start);source.stop(start+duration);
}
export function cardSound(ctx,out,style){
 if(style==='paper')noise(ctx,out,.12,.07,1050);
 else if(style==='wood'){tone(ctx,out,310,.115,.08,{to:205});noise(ctx,out,.055,.035,800);}
 else if(style==='chime'){tone(ctx,out,660,.18,.035);tone(ctx,out,880,.2,.018,{at:.025});}
 else{tone(ctx,out,210,.14,.07,{to:145});noise(ctx,out,.09,.025,650);}
}
export class GameAudio{
 constructor(storage,{fast=false,onError=()=>{},PlayerClass=Player}={}){
  this.storage=storage;this.fast=fast;this.onError=onError;this.settings=audioSettings(storage.get('audio',{}));
  if(!storage.get('audio',null)&&storage.get('sound',true)===false){this.settings.sfxEnabled=false;this.settings.bgmEnabled=false;}
  storage.set('audio',this.settings);
  this.music=new PlayerClass();this.musicQueue=Promise.resolve();this.revision=0;this.active=false;this.visible=true;this.preview=false;this.lastCard=-Infinity;
 }
 get on(){return this.settings.sfxEnabled;}
 set(value){this.update({sfxEnabled:!!value});}
 context(){
  if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;this.ctx=new C();
   this.fxOut=this.ctx.createGain();this.fxOut.gain.value=this.settings.sfxVolume;
   const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=4200;filter.Q.value=.5;
   const limit=this.ctx.createDynamicsCompressor();limit.threshold.value=-18;limit.knee.value=18;limit.ratio.value=5;
   this.fxOut.connect(filter);filter.connect(limit);limit.connect(this.ctx.destination);
  }
  if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
  return this.ctx;
 }
 unlock(){
  if(this.on)try{this.context();}catch{}
  if(this.settings.bgmEnabled)this.music.ready().then(()=>{this.setMusicGain();}).catch(()=>{});
 }
 update(patch){
  const old=this.settings;this.settings=audioSettings({...old,...patch});this.storage.set('audio',this.settings);
  if(patch.bgmEnabled===false)this.preview=false;
  if(this.fxOut)this.fxOut.gain.setTargetAtTime(this.settings.sfxVolume,this.ctx.currentTime,.025);
  this.setMusicGain();
  if(old.bgmTrack!==this.settings.bgmTrack||old.bgmEnabled!==this.settings.bgmEnabled||old.bgmVolume===0||this.settings.bgmVolume===0)this.syncMusic();
 }
 setMusicGain(){if(this.music.out)this.music.out.gain.setTargetAtTime(this.settings.bgmVolume,this.music.ctx.currentTime,.04);}
 setActive(value){this.active=!!value;this.syncMusic();}
 setVisible(value){this.visible=!!value;if(!this.visible){this.preview=false;this.music.stop(false);if(this.ctx?.state==='running')this.ctx.suspend().catch(()=>{});}this.syncMusic();}
 setPreview(value){this.preview=!!value;this.syncMusic();}
 syncMusic(){
  const ticket=++this.revision,wanted=this.visible&&this.settings.bgmVolume>0&&(this.preview||this.active&&this.settings.bgmEnabled);
  if(!wanted||this.music.score?.title!==SKULL_KING_TRACKS.find(t=>t.id===this.settings.bgmTrack)?.title)this.music.stop(false);
  this.musicQueue=this.musicQueue.catch(()=>{}).then(async()=>{
   if(ticket!==this.revision||!wanted)return;
   const score=skullKingScore(this.settings.bgmTrack);
   const recording=RECORDINGS['sk-'+this.settings.bgmTrack];
   if(recording){score.recording=recording;score.bars=recording.duration*score.tempo/60/score.beatsPerBar;}
   if(this.music.running&&this.music.score?.title===score.title){this.setMusicGain();return;}
   await this.music.ready();if(ticket!==this.revision)return;this.setMusicGain();
   const position=this.music.score?.title===score.title?this.music.position%(score.bars*score.beatsPerBar):0;
   await this.music.play(score,position,true);this.setMusicGain();
   if(ticket!==this.revision)this.music.stop(false);
  }).catch(()=>{if(ticket===this.revision)this.onError('BGMを再生できませんでした。音の設定からもう一度お試しください。');});
  return this.musicQueue;
 }
 play(name,preview=false){
  if(!preview&&(!this.on||this.fast||!this.visible||this.settings.sfxVolume===0))return;
  let c;try{c=this.context();}catch{return;}if(!c)return;
  const out=this.fxOut;
  if(name==='card'){
   if(!preview&&c.currentTime-this.lastCard<.07)return;
   this.lastCard=c.currentTime;cardSound(c,out,this.settings.cardSound);
  }else if(name==='thump'){tone(c,out,105,.21,.16,{to:65});noise(c,out,.08,.045,450);}
  else if(name==='win'){tone(c,out,523,.18,.075);tone(c,out,660,.24,.055,{at:.12});}
  else if(name==='lose')tone(c,out,300,.18,.04,{to:245});
  else if(name==='coin'){tone(c,out,784,.15,.045);tone(c,out,1046,.18,.025,{at:.08});}
  else if(name==='kraken'){tone(c,out,85,.8,.085,{to:48});noise(c,out,.5,.035,350);}
  else if(name==='whale'){tone(c,out,240,.9,.07,{to:150});tone(c,out,360,.8,.025,{at:.1,to:220});}
  else if(name==='bell'){tone(c,out,660,.5,.065);tone(c,out,990,.5,.025,{at:.04});}
  else if(name==='tick')tone(c,out,720,.07,.022);
 }
 previewCard(){this.play('card',true);}
}

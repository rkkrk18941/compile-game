export const INSTRUMENTS={piano:'ピアノ',bell:'ベル',pluck:'プラック',pad:'パッド',strings:'ストリングス',bass:'ベース',lead:'シンセリード',chip:'8bit',synthbass:'シンセベース',sequence:'シーケンス',glass:'グラスFM',drums:'ドラム'};
export const COLORS=['#72dfc1','#dfb871','#9b9eff','#e991a8','#78c6ef','#b8d786','#dc9bf0','#e58c68'];
export const clone=o=>JSON.parse(JSON.stringify(o));
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function pitchNumber(n){if(typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=127)return n;if(typeof n==='string'){const m=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(n);if(m){const p={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0)+(Number(m[3])+1)*12;if(p>=0&&p<=127)return p;}}throw Error('音程はC4などの音名、または0〜127で指定してください');}
export function pitchName(n){return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((n%12)+12)%12]+(Math.floor(n/12)-1);}
function number(v,name,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(name+'の範囲は'+min+'〜'+max+'です');return v;}
export function normalizeScore(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('曲データはJSONオブジェクトで指定してください');
 const tempo=number(input.tempo??100,'テンポ',30,240),bars=number(input.bars??8,'小節数',1,128),beatsPerBar=number(input.beatsPerBar??4,'拍子',1,7);
 if(!Number.isInteger(bars)||!Number.isInteger(beatsPerBar))throw Error('小節数と拍子は整数にしてください');
 if(bars*beatsPerBar*60/tempo>180)throw Error('曲の長さは3分以内にしてください');
 if(!Array.isArray(input.tracks)||input.tracks.length<1||input.tracks.length>12)throw Error('パート数は1〜12にしてください');
 let count=0;
 const tracks=input.tracks.map((t,i)=>{
  if(!t||typeof t!=='object')throw Error('パートの形式が不正です');
  const instrument=t.instrument??'piano';if(!Object.hasOwn(INSTRUMENTS,instrument))throw Error('楽器名が不正です: '+instrument);
  let notes=[];
  const add=(n,offset=0)=>{if(!n||typeof n!=='object')throw Error('音符の形式が不正です');const note=Array.isArray(n)?{pitch:n[0],beat:n[1],duration:n[2],velocity:n[3]}:n;
   const beat=number(note.beat,'音符の開始位置',0,bars*beatsPerBar)+offset,duration=number(note.duration,'音符の長さ',0.0625,64);
   if(beat>=bars*beatsPerBar||beat+duration>bars*beatsPerBar+0.001)throw Error('小節の範囲を超える音符があります');
   notes.push({pitch:pitchNumber(note.pitch),beat:Math.round(beat*10000)/10000,duration,velocity:number(note.velocity??0.75,'音の強さ',0.01,1)});if(++count>20000)throw Error('音符は合計20,000個以内にしてください');
  };
  if(t.notes!==undefined&&!Array.isArray(t.notes))throw Error('notesは配列にしてください');
  (t.notes??[]).forEach(n=>add(n));
  if(t.patterns!==undefined&&!Array.isArray(t.patterns))throw Error('patternsは配列にしてください');
  (t.patterns??[]).forEach(p=>{if(!p||!Array.isArray(p.notes))throw Error('パターンの形式が不正です');const at=number(p.at??0,'パターン開始位置',0,bars*beatsPerBar),length=number(p.length,'パターンの長さ',0.25,64),repeat=number(p.repeat??1,'繰り返し数',1,128);if(!Number.isInteger(repeat))throw Error('繰り返し数は整数です');for(let k=0;k<repeat;k++)p.notes.forEach(n=>add(n,at+k*length));});
  notes.sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);
  return {name:String(t.name??'パート '+(i+1)).slice(0,48),instrument,color:COLORS[i%COLORS.length],volume:number(t.volume??0.65,'音量',0,1),pan:number(t.pan??0,'左右の位置',-1,1),mute:!!t.mute,solo:!!t.solo,notes};
 });
 return {version:1,title:String(input.title??'無題の曲').slice(0,100),tempo,beatsPerBar,bars,tracks};
}
export function parseScore(text){let raw=text.trim();const fence=/```(?:json)?\s*([\s\S]*?)```/i.exec(raw);if(fence)raw=fence[1];try{return normalizeScore(JSON.parse(raw));}catch(e){if(e instanceof SyntaxError)throw Error('JSONとして読み込めません。曲データ全体を貼り付けてください');throw e;}}
export function audibleTracks(score){const solo=score.tracks.some(t=>t.solo);return score.tracks.filter(t=>!t.mute&&(!solo||t.solo));}
export function midiBytes(score){
 const encoder=new TextEncoder(),u16=n=>[(n>>8)&255,n&255],u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
 const vlq=n=>{let a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a;};
 const chunk=(tag,a)=>[...encoder.encode(tag),...u32(a.length),...a];
 const meta=(type,text)=>{const a=[...encoder.encode(text)];return[255,type,...vlq(a.length),...a];};
 const quarter=Math.round(60000000/score.tempo),end=score.bars*score.beatsPerBar*480;
 const conductor=[0,...meta(3,score.title),0,255,81,3,(quarter>>16)&255,(quarter>>8)&255,quarter&255,0,255,88,4,score.beatsPerBar,2,24,8,...vlq(end),255,47,0];
 const program={piano:0,bell:10,pluck:24,pad:89,strings:48,bass:38,lead:80,chip:80,synthbass:38,sequence:81,glass:98};
 let channel=0;const tracks=[chunk('MTrk',conductor)];
 for(const t of audibleTracks(score)){
  const ch=t.instrument==='drums'?9:(channel++>=9?channel:channel-1);const events=[];
  events.push({time:0,priority:0,bytes:meta(3,t.name)});
  if(t.instrument!=='drums')events.push({time:0,priority:1,bytes:[192|ch,program[t.instrument]]});
  events.push({time:0,priority:1,bytes:[176|ch,7,Math.round(t.volume*127)]},{time:0,priority:1,bytes:[176|ch,10,Math.round((t.pan+1)*63.5)]});
  for(const n of t.notes){events.push({time:Math.round(n.beat*480),priority:3,bytes:[144|ch,n.pitch,Math.max(1,Math.round(n.velocity*127))]},{time:Math.round((n.beat+n.duration)*480),priority:2,bytes:[128|ch,n.pitch,0]});}
  events.sort((a,b)=>a.time-b.time||a.priority-b.priority);let time=0,data=[];for(const ev of events){data.push(...vlq(ev.time-time),...ev.bytes);time=ev.time;}data.push(...vlq(Math.max(0,end-time)),255,47,0);tracks.push(chunk('MTrk',data));
 }
 return new Uint8Array([...chunk('MThd',[...u16(1),...u16(tracks.length),...u16(480)]),...tracks.flat()]);
}
export function wavBytes(buffer){const channels=buffer.numberOfChannels,length=buffer.length;const data=new ArrayBuffer(44+length*channels*2),v=new DataView(data);const str=(p,s)=>[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,data.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,length*channels*2,true);const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let p=44;for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const s=clamp(samples[c][i],-1,1);v.setInt16(p,Math.round(s*(s<0?32768:32767)),true);p+=2;}return data;}

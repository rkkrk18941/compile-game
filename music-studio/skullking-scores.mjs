import {normalizeScore} from './core.mjs';

export const SKULL_KING_TRACKS = [
 {id:'harbor',title:'凪の港',description:'ゆったりした3拍子。柔らかい弦の響き',tempo:88,beats:3},
 {id:'sailing',title:'帆をあげて',description:'軽やかな航海。弾む弦と控えめな打楽器',tempo:104,beats:4},
 {id:'moonlight',title:'月明かりの航路',description:'静かな夜の海。余白のあるピアノと和音',tempo:76,beats:4}
];
// Scores use NOTE's ordinary editable format and its existing synthesizer.
// Offsets, short rests, strummed voicings and changing dynamics avoid a rigid grid.
export function skullKingScore(id='harbor') {
 const meta=SKULL_KING_TRACKS.find(t=>t.id===id);
 if(!meta)throw Error('曲が見つかりません');
 const harbor=id==='harbor',sailing=id==='sailing',beats=meta.beats,bars=16;
 const chords=harbor?
  [[50,57,62,65],[46,53,58,62],[48,55,60,64],[45,52,57,61],[50,57,62,65],[43,50,58,62],[45,52,57,61],[50,57,62,65]]:
  sailing?[[48,55,60,64],[43,50,55,59],[45,52,57,60],[41,48,53,57],[48,55,60,64],[43,50,55,59],[41,48,53,57],[43,50,55,59]]:
  [[45,52,59,60],[41,48,55,57],[48,55,59,64],[43,50,57,59],[45,52,57,60],[41,48,55,60],[40,47,56,59],[45,52,57,60]];
 const phrases=harbor?[
  [[69,.12,.7],[72,1,.4],[74,1.6,.65]],[[77,.1,.85],[74,1.4,.5],[72,2.1,.6]],
  [[71,.1,.6],[72,.95,.45],[76,1.65,.8]],[[73,.2,1.1],[69,1.8,.6]],
  [[74,.1,1],[77,1.4,.45],[76,2,.55]],[[74,.15,.65],[70,1,.6],[67,2,.55]],
  [[69,.1,.6],[73,1,.55],[76,1.9,.6]],[[74,.1,1.6]]
 ]:sailing?[
  [[67,.1,.55],[72,.9,.4],[76,1.6,.8],[74,2.9,.5]],[[71,.1,.65],[67,1,.5],[69,2,.35],[71,2.75,.7]],
  [[72,.1,.8],[76,1.3,.45],[79,2,.5],[76,2.9,.5]],[[74,.1,.6],[72,1,.5],[69,2,.7]],
  [[76,.1,.65],[79,1,.5],[76,2,.5],[72,2.8,.8]],[[74,.1,.5],[71,.85,.5],[67,1.65,.65],[69,2.7,.45]],
  [[72,.1,.6],[69,1,.6],[65,2,.75]],[[67,.1,.65],[71,1.05,.6],[74,2.15,.75]]
 ]:[
  [[72,.2,1.4],[71,2.4,.75]],[[69,.15,1.1],[64,2.1,1.25]],
  [[67,.25,.8],[71,1.55,.9],[76,2.8,.75]],[[74,.2,1.6]],
  [[72,.15,1.1],[69,1.8,.8]],[[67,.2,1],[64,2.3,.7]],
  [[68,.2,.9],[71,1.7,.75]],[[69,.2,2.25]]
 ];
 const melody={name:harbor?'港の歌':sailing?'航海のメロディー':'月のピアノ',instrument:harbor?'pluck':'piano',volume:.46,pan:-.14,notes:[]};
 const accompaniment={name:harbor?'小さな弦の伴奏':sailing?'弾む弦':'波のアルペジオ',instrument:'pluck',volume:sailing?.29:.22,pan:.22,notes:[]};
 const harmony={name:'遠い和音',instrument:harbor?'strings':'pad',volume:sailing?.20:.25,pan:.05,notes:[]};
 const bass={name:'低い弦',instrument:'bass',volume:harbor?.29:.25,pan:0,notes:[]};
 const percussion={name:'小さな太鼓',instrument:'drums',volume:.11,pan:-.06,notes:[]};
 const add=(track,pitch,beat,duration,velocity)=>track.notes.push({pitch,beat:+beat.toFixed(4),duration:+duration.toFixed(4),velocity});
 for(let bar=0;bar<bars;bar++){
  const start=bar*beats,c=chords[bar%8],second=bar>=8,ending=bar===15;
  const phrase=phrases[bar%8];
  for(let i=0;i<phrase.length;i++){
   let [p,b,d]=phrase[i];
   if(second&&bar%8===4&&i===0)p+=(harbor||sailing)?3:4;
   if(second&&bar%8===5&&i===phrase.length-1)p=harbor?69:sailing?71:72;
   if(ending&&i>0)continue;
   if(ending){p=harbor?74:sailing?67:69;d=beats-1.1;}
   const timing=(i%2?.018:0)+(bar%3===1?.012:0);
   add(melody,p,start+b+timing,d,(second?.59:.54)-(i%3)*.035-(ending?.06:0));
  }
  // Upper three voices: spread their attacks rather than striking a block chord.
  c.slice(1).forEach((p,i)=>add(harmony,p,start+.08+i*.035,beats-.7-i*.035,.38+(bar%4)*.012));
  if(harbor){
   add(bass,c[0]-12,start+.015,1.4,.52);
   for(let i=1;i<3;i++)c.slice(1,3).forEach((p,j)=>add(accompaniment,p,start+i+.02+j*.035,.45,.38-(i-1)*.045));
  }else if(sailing){
   add(bass,c[0]-12,start+.015,.9,.52);add(bass,(bar%4===3?c[0]+7:c[0])-12,start+2.03,.8,.43);
   const rhythm=[.03,.77,1.52,2.55,3.22];
   rhythm.forEach((b,i)=>add(accompaniment,c[[1,2,3,2,1][i]],start+b,.35,i===0?.43:.32+(i%2)*.045));
   if(bar%4!==3&&!ending){add(percussion,36,start+.03,.12,.42);add(percussion,45,start+2.05,.12,.25);}
  }else{
   if(bar%2===0)add(bass,c[0]-12,start+.08,2.7,.40);
   [0,1,2].forEach(i=>add(accompaniment,c[i+1],start+.55+i*1.03,.72,.30+(i===1?.025:0)));
  }
 }
 return normalizeScore({version:1,title:meta.title,tempo:meta.tempo,beatsPerBar:beats,bars,tracks:[melody,accompaniment,harmony,bass,...(sailing?[percussion]:[])]});
}

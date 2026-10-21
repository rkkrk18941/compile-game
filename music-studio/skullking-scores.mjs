import {normalizeScore} from './core.mjs?v=20261022-mind1';

export const SKULL_KING_TRACKS = [
 {id:'mind',title:'疑心のテーブル',description:'心理戦 / 112 BPM。脈打つ低音と冷たい電子音',tempo:112,beats:4},
 {id:'cipher',title:'暗号の駆け引き',description:'駆け引き / 124 BPM。細かいシーケンスと鋭いビート',tempo:124,beats:4},
 {id:'verdict',title:'最後の宣告',description:'緊迫 / 96 BPM。重いハーフタイムと不穏なピアノ',tempo:96,beats:4},
 {id:'harbor',title:'凪の港',description:'ゆったりした3拍子。柔らかい弦の響き',tempo:88,beats:3},
 {id:'sailing',title:'帆をあげて',description:'軽やかな航海。弾む弦と控えめな打楽器',tempo:104,beats:4},
 {id:'moonlight',title:'月明かりの航路',description:'静かな夜の海。余白のあるピアノと和音',tempo:76,beats:4}
];
// Scores use NOTE's ordinary editable format and its existing synthesizer.
// Offsets, short rests, strummed voicings and changing dynamics avoid a rigid grid.
export function skullKingScore(id='mind') {
 const meta=SKULL_KING_TRACKS.find(t=>t.id===id);
 if(!meta)throw Error('曲が見つかりません');
 if(['mind','cipher','verdict'].includes(id))return mindGameScore(meta);
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

// Original psychological-thriller arrangements, not soundtrack transcriptions.
// 32 bars: 4-bar intro, main groove, 4-bar breakdown, rebuild and final return.
function mindGameScore(meta){
 const cipher=meta.id==='cipher',verdict=meta.id==='verdict';
 const roots=cipher?[30,30,26,26,35,35,25,25]:verdict?[36,36,32,32,29,29,31,31]:[38,38,34,34,43,43,33,33];
 const chords=cipher?[[54,57,61,68],[50,54,57,61],[59,62,66,73],[49,53,56,62]]:
  verdict?[[60,63,67,74],[56,60,63,67],[53,56,60,67],[55,59,62,68]]:
  [[62,65,69,76],[58,62,65,69],[55,58,62,69],[57,61,64,70]];
 const phrases=cipher?[
  [[78,.25,.22],[73,.75,.22],[76,1.5,.3],[77,2.25,.22],[73,3,.35]],
  [[78,.5,.3],[81,1.25,.3],[80,2.5,.22],[73,3.25,.4]],
  [[78,.25,.22],[76,1,.3],[73,2.25,.22],[72,3.5,.25]],
  [[77,.25,.4],[73,1.5,.3],[72,2.75,.22]]
 ]:verdict?[
  [[72,.25,.7],[74,2.5,.35],[75,3.25,.4]],
  [[71,.5,.6],[67,2.75,.6]],
  [[72,.25,.7],[68,1.75,.5],[67,3,.6]],
  [[71,.5,.7],[74,2.25,.5],[73,3.5,.25]]
 ]:[
  [[74,.25,.35],[81,1.75,.3],[75,2.5,.3],[74,3.25,.4]],
  [[77,.5,.4],[76,2.25,.25],[69,3.5,.25]],
  [[74,.25,.35],[72,1.5,.3],[69,2.75,.4]],
  [[73,.5,.4],[76,2,.3],[70,3.25,.35]]
 ];
 const make=(name,instrument,volume,pan=0)=>({name,instrument,volume,pan,notes:[]});
 const motif=make(verdict?'宣告のピアノ':'冷たい暗号',verdict?'piano':'glass',.36,-.12);
 const bass=make('脈打つ低音','synthbass',.46);
 const arp=make('計算するシーケンス','sequence',cipher?.26:.22,.2);
 const pad=make('不穏な空間','pad',.13,-.25);
 const drums=make('心理戦のビート','drums',.34);
 const echoes=make('残像','glass',.13,.4);
 const add=(t,p,b,d,v)=>{if(b+d<=128)t.notes.push({pitch:p,beat:+b.toFixed(4),duration:d,velocity:+v.toFixed(4)});};
 for(let bar=0;bar<32;bar++){
  const b=bar*4,local=bar%8,root=roots[local],c=chords[Math.floor(local/2)];
  const intro=bar<4,breakdown=bar>=16&&bar<20,rebuild=bar>=20&&bar<24,returning=bar>=24;
  const turn=bar===31,energy=breakdown?.58:intro?.72:returning?1:.9;
  // The breakdown removes the kick/bass; the return adds counter-rhythm.
  if(!breakdown&&bar>=2){
   const rhythm=verdict?[0,1.75,2.5,3.25]:cipher?[0,.75,1.5,2,2.75,3.5]:[0,.75,1.5,2.5,3.25];
   rhythm.forEach((at,i)=>{
    if(turn&&at>=2)return;
    const p=root+(i===rhythm.length-1&&local%2===1?7:0);
    add(bass,p,b+at,verdict?.34:.22,(i===0?.76:.56+(i%2)*.08)*energy);
   });
  }
  if(!breakdown||bar>=18){
   const steps=verdict?8:16;
   for(let i=0;i<steps;i++){
    const at=i*4/steps;
    if((intro&&i%2===1)||(rebuild&&bar===20&&i%2===1)||(turn&&at>=2.5))continue;
    if(!cipher&&i%8===6)continue;
    const order=cipher?[0,2,1,3,2,0,3,1]:[0,2,3,1,2,0,1,3];
    let p=c[order[(i+(returning?2:0))%8]];
    if(cipher&&i===15&&local%2===1)p++;
    add(arp,p,b+at+(i%2?.012:0),verdict?.2:.12,(i%4===0?.6:.32+(i%3)*.06)*energy);
   }
  }
  // Open minor/add9 voicings; dominant b9 tensions lead back to the first bar.
  if(bar%2===0||breakdown){
   c.slice(0,3).forEach((p,i)=>add(pad,p,b+.04+i*.025,breakdown?3.5:7.45-i*.025,.38*energy));
  }
  if(bar>=4&&(!rebuild||bar>=22)||breakdown){
   const phrase=phrases[Math.floor(local/2)];
   if(local%2===0||breakdown||returning&&local===7){
    phrase.forEach(([p,at,d],i)=>{
     if(turn&&at>=2)return;
     if(returning&&local===4&&i===0)p+=12;
     add(motif,p,b+at,d,(.61-(i%3)*.07)*energy);
     add(echoes,p,b+at+.75,d*.6,.32*energy);
    });
   }
  }
  if(breakdown){
   if(bar%2===0)add(echoes,c[3],b+.25,1.1,.38);
   continue;
  }
  const kick=verdict?[0,1.75,3.5]:cipher?[0,1,2,3]:[0,1.5,2,3.25];
  if(bar>=2)kick.forEach((at,i)=>{if(!turn||at<2)add(drums,36,b+at,.12,(i===0?.76:.62)*energy);});
  if(!intro){
   (verdict?[2]:[1,3]).forEach(at=>{if(!turn||at<2)add(drums,38,b+at,.08,.43*energy);});
   if(local===7&&!turn)[3.5,3.75].forEach((at,i)=>add(drums,38,b+at,.0625,.18+i*.06));
  }
  for(let i=0;i<8;i++){
   if(turn&&i>=4)continue;
   const at=i*.5+(i%2?.012:0);
   add(drums,42,b+at,.0625,(i%2?.2:.29)*energy);
   if(cipher&&returning&&i%2===1)add(drums,42,b+at+.25,.0625,.12);
  }
  if(returning&&local%2===1&&!turn)add(drums,46,b+3.5,.12,.19);
 }
 return normalizeScore({version:1,title:meta.title,tempo:meta.tempo,beatsPerBar:4,bars:32,tracks:[motif,bass,arp,pad,drums,echoes]});
}

import {normalizeScore} from './core.mjs?v=20261022-rush1';
export const RUSH_TRACKS=[
 {id:'rush',title:'逆転の疾走',description:'疾走ロック / 176 BPM。ギターの8分刻みと走るベース',tempo:176,beats:4},
 {id:'pursuit',title:'追走の弦',description:'管弦楽 / 168 BPM・3拍子。細かい弦と金管、ティンパニ',tempo:168,beats:3},
 {id:'swing',title:'切り札のスウィング',description:'高速ジャズ / 192 BPM。ピアノ、トランペット、ウッドベース',tempo:192,beats:4}
];
const part=(name,instrument,volume,pan=0)=>({name,instrument,volume,pan,notes:[]});
function add(t,p,b,d,v,end){if(b>=end)return;t.notes.push({pitch:p,beat:+b.toFixed(4),duration:+Math.min(d,end-b).toFixed(4),velocity:+v.toFixed(4)});}
export function rushScore(id){
 const meta=RUSH_TRACKS.find(t=>t.id===id);if(!meta)throw Error('曲が見つかりません');
 return id==='rush'?rock(meta):id==='pursuit'?orchestra(meta):jazz(meta);
}
function rock(meta){
 const bars=48,end=bars*4;
 const left=part('刻むギター L','guitar',.27,-.48),right=part('開くギター R','guitar',.23,.48);
 const lead=part('逆転のリード','guitar',.30,-.05),bass=part('走るエレキベース','fingerbass',.42),kit=part('ロックのドラム','drums',.27);
 const a=(t,p,b,d,v)=>add(t,p,b,d,v,end);
 const verse=[38,46,41,36,38,46,43,45],chorus=[38,41,36,43,46,41,43,45];
 const phrases=[
  [[74,0,.75],[77,1,.4],[81,1.5,.9],[79,2.5,.4],[77,3,.8]],
  [[76,0,.7],[77,1,.4],[74,1.5,.9],[72,2.75,.4],[69,3.25,.65]],
  [[74,.0,.4],[76,.5,.4],[77,1,.75],[81,2,.9],[84,3,.8]],
  [[79,0,1.2],[77,1.5,.4],[76,2,.4],[73,2.75,.9]]
 ];
 for(let bar=0;bar<bars;bar++){
  const b=bar*4,chor=(bar>=16&&bar<24)||(bar>=32&&bar<44),drop=bar>=24&&bar<28,intro=bar<4,turn=bar>=44;
  const root=drop?[43,45,38,36][bar-24]:(chor?chorus:verse)[bar%8];
  const accent=chor?.9:turn?.7:.76;
  if(!drop){
   for(let step=0;step<8;step++){
    if(bar===47&&step>=4)continue;
    const at=b+step*.5,open=chor&&(step===0||step===4);
    [0,7].forEach((p,i)=>a(left,root+p,at+i*.008,open?.44:.18,(step%2?.52:accent)-i*.04));
    if(!intro||bar>=2)[0,7,12].forEach((p,i)=>a(right,root+p,at+.018+i*.009,open?.45:.17,(step%2?.44:.65)-i*.035));
    const bassRoot=root-12;
    const bassPitch=bassRoot+(step===7&&bar%2===1?7:step===6&&chor?12:0);
    a(bass,bassPitch,at,.38,step%2?.61:.79);
   }
   [0,1.5,2,2.75].forEach((at,i)=>{if(bar!==47||at<2)a(kit,36,b+at,.12,i===0?.76:.61);});
   [1,3].forEach(at=>{if(bar!==47||at<2)a(kit,38,b+at,.08,.57);});
   for(let step=0;step<8;step++)if(bar!==47||step<4)a(kit,chor&&step===7?46:42,b+step*.5,.0625,step%2?.21:.29);
   if([4,16,32,40].includes(bar))a(kit,49,b,.18,.26);
   if([15,23,31,43].includes(bar))[45,47,50,38].forEach((p,i)=>a(kit,p,b+3+i*.25,.10,.34+i*.025));
  }else{
   // Four bars of ringing guitar, bass melody and toms, not the electronic break.
   [0,7,12].forEach((p,i)=>a(right,root+p,b+i*.025,2.8,.47-i*.03));
   [0,1.5,2.5].forEach((at,i)=>a(bass,root-12+[0,7,12][i],b+at,.75,.61));
   [0,2.5].forEach(at=>a(kit,45,b+at,.18,.26));
  }
  if(bar>=8&&!turn&&(!drop||bar%2===0)){
   const phrase=phrases[bar%4];
   phrase.forEach(([p,at,d],i)=>a(lead,p+(chor&&bar%8>=4?0:drop?-12:0),b+at,d,(chor?.74:.60)-i*.025));
  }
 }
 return normalizeScore({title:meta.title,tempo:meta.tempo,beatsPerBar:4,bars,tracks:[lead,left,right,bass,kit]});
}
function orchestra(meta){
 const bars=48,end=bars*3;
 const violin=part('追走するバイオリン','violin',.34,-.3),low=part('低弦のオスティナート','bowedstrings',.34,.2);
 const brass=part('金管の応答','trumpet',.25,.15),timpani=part('運命のティンパニ','timpani',.38),upper=part('弦の対旋律','bowedstrings',.20,.4);
 const a=(t,p,b,d,v)=>add(t,p,b,d,v,end);
 const roots=[50,46,43,45,50,48,46,45,53,48,43,45];
 const figures=[
  [74,77,81,79,77,76],[77,81,82,81,77,74],[74,79,82,81,79,77],[73,76,81,79,76,73],
  [74,76,77,81,84,81],[76,79,84,82,79,76],[77,81,82,86,84,81],[73,76,79,82,81,79],
  [77,81,84,88,86,84],[76,79,84,86,84,79],[74,79,82,86,84,82],[73,76,79,82,81,73]
 ];
 for(let bar=0;bar<bars;bar++){
  const b=bar*3,section=Math.floor(bar/12),root=roots[bar%12],minor=!([1,5,6,8,9].includes(bar%12));
  const ebb=section===2&&bar%12<4,climax=section===3,energy=ebb?.57:.72+section*.055;
  const figure=figures[bar%12];
  for(let i=0;i<6;i++){
   if(bar===47&&i>=3)continue;
   const p=figure[i]+(section===1&&i%3===2&&figure[i]<=73?12:0);
   a(violin,p,b+i*.5,.32,(i===0?.78:i%2?.56:.65)*energy);
   if(climax&&i%2===0)a(upper,p-12,b+i*.5,.72,.46);
  }
  // Galloping 3-beat ostinato; pitches and bow attacks move with the harmony.
  [0,.75,1.5,2,2.5].forEach((at,i)=>{
   if(bar===47&&at>=1.5)return;
   a(low,root-12+(i%2?7:0),b+at,.38,(i===0?.78:.54)*energy);
  });
  if(!ebb&&bar>=4){
   a(timpani,root-12,b,.28,.66*energy);
   if(bar%3===2)[2,2.5].forEach((at,i)=>a(timpani,root-12+(i?7:0),b+at,.18,.36+i*.11));
  }
  if((bar%6===4||bar%6===5)&&!ebb){
   [0,1.5].forEach((at,i)=>{
    a(brass,root+12+(i?7:0),b+at,i?.75:1.1,.58*energy);
    if(climax)a(brass,root+12+(minor?3:4),b+at,.8,.30);
   });
  }
  if(section===1||ebb)a(upper,root+12+(minor?3:4),b+.2,2.1,ebb?.34:.29);
 }
 return normalizeScore({title:meta.title,tempo:meta.tempo,beatsPerBar:3,bars,tracks:[violin,low,brass,timpani,upper]});
}
function jazz(meta){
 const bars=48,end=bars*4,piano=part('跳ねるピアノ','concertpiano',.34,-.28),horn=part('切り札のトランペット','trumpet',.29,.24);
 const bass=part('歩くウッドベース','upright',.44),kit=part('ライドとスネア','drums',.17);
 const a=(t,p,b,d,v)=>add(t,p,b,d,v,end);
 // Four choruses of minor blues: walking quarter notes and swung eighths.
 const changes=[[50,53,57,60],[55,58,62,65],[50,53,57,60],[50,53,57,60],[55,58,62,65],[55,58,62,65],
  [50,53,57,60],[50,53,57,60],[58,62,65,68],[57,61,64,67],[50,53,57,60],[57,61,64,67]];
 const lines=[
  [[74,.0,.42],[77,.667,.25],[79,1,.42],[80,1.667,.25],[81,2,.7],[77,3,.4],[74,3.667,.22]],
  [[79,.0,.7],[82,1,.42],[81,1.667,.25],[79,2,.42],[77,2.667,.25],[74,3,.7]],
  [[72,.667,.25],[74,1,.42],[77,1.667,.25],[81,2,.7],[79,3,.4],[77,3.667,.22]],
  [[76,0,.42],[77,.667,.25],[76,1,.42],[73,1.667,.25],[69,2,.7],[73,3,.7]]
 ];
 for(let bar=0;bar<bars;bar++){
  const b=bar*4,chorus=Math.floor(bar/12),local=bar%12,c=changes[local],next=changes[(local+1)%12][0],trading=chorus===2;
  const bassline=[c[0]-12,c[0]-12+(chorus%2?3:7),c[0]-12+(local===9?4:10),next-13];
  bassline.forEach((p,i)=>a(bass,p,b+i,.83,i===0?.76:.63+(i%2)*.05));
  const comp=chorus===1?[.667,2,3.667]:local%2?[1,2.667]:[.0,1.667,3];
  comp.forEach((at,j)=>c.slice(1).forEach((p,i)=>a(piano,p+12,b+at+i*.012,.28,(j===0?.57:.45)-i*.035)));
  // Horn chorus, piano chorus, two-bar call-and-response, then the full band.
  const solo=chorus===1||(trading&&local%4>=2)?piano:horn;
  if(bar>=2){
   const phrase=lines[local%4];
   phrase.forEach(([p,at,d],i)=>{
    if(bar===47&&at>=2)return;
    const shift=solo===piano?-12:chorus===3&&local>=8?0:0;
    a(solo,p+shift+(chorus===1&&i===3?1:0),b+at,d,(solo===piano?.68:.60)-(i%3)*.045);
   });
  }
  // Ride pattern has a swung skip beat, instead of a straight electronic hat grid.
  [0,1,1.667,2,3,3.667].forEach((at,i)=>a(kit,51,b+at,.10,i===0?.40:i%3===2?.20:.31));
  [1,3].forEach(at=>{a(kit,42,b+at,.0625,.22);if(local%4!==3)a(kit,38,b+at+.025,.0625,.18);});
  [0,2].forEach(at=>a(kit,36,b+at,.08,.28));
  if(local%4===3)[2.667,3,3.333,3.667].forEach((at,i)=>a(kit,i%2?45:38,b+at,.08,.20+i*.025));
 }
 return normalizeScore({title:meta.title,tempo:meta.tempo,beatsPerBar:4,bars,tracks:[horn,piano,bass,kit]});
}

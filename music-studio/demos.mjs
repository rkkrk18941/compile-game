import {skullKingScore} from './skullking-scores.mjs';
import {normalizeScore} from './core.mjs';
const note=(pitch,beat,duration,velocity=.7)=>({pitch,beat,duration,velocity});
export function demo(kind='garden'){
 if(kind.startsWith('sk-'))return skullKingScore(kind.slice(3));
 const dark=kind==='depth',battle=kind==='battle',tempo=battle?140:dark?76:96,bars=16;
 const title=battle?'赤い境界':dark?'地下の残響':'夜明けの庭';
 const chords=dark?[[45,52,57,60],[41,48,53,57],[43,50,55,59],[40,47,52,56]]:battle?[[50,57,62,65],[46,53,58,62],[48,55,60,64],[45,52,57,61]]:[[48,55,59,64],[45,52,57,60],[41,48,55,60],[43,50,57,62]];
 const melody=dark?[[69,0,1.5],[72,2,.5],[71,3,1],[64,4,2],[67,6,1],[65,7,.5],[64,8,1.5],[62,10,1],[60,11,1],[59,12,2],[64,14,2]]:battle?[[74,0,.5],[74,.75,.25],[77,1,.5],[81,2,.5],[79,2.75,.25],[77,3,.75],[74,4,.5],[72,4.75,.25],[74,5,.5],[77,6,.5],[76,7,.75],[72,8,.5],[76,9,.5],[79,10,.5],[77,11,.75],[73,12,.5],[76,13,.5],[81,14,1],[73,15,.75]]:[[76,0,.75],[79,1,1],[74,2.5,.5],[72,3,1],[76,4,1.5],[72,6,.5],[71,7,.75],[69,8,1],[72,9.5,.5],[76,10,1],[74,11,1],[71,12,1.5],[69,14,.5],[67,15,1]];
 const lead={name:dark?'遠くのベル':battle?'主旋律':'朝のメロディー',instrument:dark?'bell':battle?'lead':'piano',volume:.64,pan:-.12,notes:[]};
 const arp={name:'きらめき',instrument:dark?'pluck':battle?'chip':'bell',volume:dark?.24:.25,pan:.35,notes:[]};
 const pad={name:'和音',instrument:dark?'pad':'strings',volume:dark?.48:.35,pan:0,notes:[]};
 const bass={name:'ベース',instrument:'bass',volume:.62,pan:0,notes:[]};
 const drums={name:'リズム',instrument:'drums',volume:dark?.2:.45,pan:0,notes:[]};
 for(let section=0;section<4;section++)for(const [p,b,d]of melody){let pitch=p;if(section===2&&b>=8)pitch+=battle?12:dark?0:2;lead.notes.push(note(pitch,section*16+b,d,section===3?.63:.78));}
 for(let bar=0;bar<bars;bar++){
  const c=chords[bar%4],b=bar*4;
  c.forEach(p=>pad.notes.push(note(p,b,3.85,.65)));
  for(let k=0;k<(battle?8:4);k++){const p=c[[0,2,1,3,2,3,1,2][k]]+12;arp.notes.push(note(p,b+k*(battle?.5:1),battle?.3:.6,.5+(k%2)*.15));}
  bass.notes.push(note(c[0]-12,b,battle?.65:1.7,.8),note(c[0]-12,b+2,battle?.65:1.7,.68));
  if(battle)bass.notes.push(note(c[0]-12,b+1,.6),note(c[0]-5,b+3,.6));
  if(!dark||bar>=4){drums.notes.push(note(36,b,.2,.8),note(36,b+2,.2,.65),note(38,b+1,.2,.65),note(38,b+3,.2,.7));for(let k=0;k<8;k++)drums.notes.push(note(42,b+k*.5,.12,k%2?.38:.58));}
 }
 return normalizeScore({title,tempo,bars,beatsPerBar:4,tracks:[lead,arp,pad,bass,drums]});
}
export const AI_GUIDE=`歌なしのオリジナルBGMを作曲してください。下記のJSON形式だけを返してください。音符のbeatは曲頭からの拍数（0始まり）、durationも拍数です。1小節4拍、C4は中央ド。全パートで同じ曲の長さ。声は不要。旋律、和音、ベース、必要ならドラムを分け、単調な反復だけでなく展開を作ってください。\n\n使える楽器: piano, bell, pluck, pad, strings, bass, lead, chip, drums\nドラム音程: 36=キック, 38=スネア, 42=ハイハット, 46=オープンハット, 49=シンバル, 45=タム\n制限: tempo 30〜240、bars 1〜128、全長3分以内、パート12以内、音符合計20000以内、velocity 0.01〜1、volume 0〜1、pan -1〜1。\n\n{\n  "version": 1, "title": "曲名", "tempo": 100, "beatsPerBar": 4, "bars": 8,\n  "tracks": [\n    {"name": "主旋律", "instrument": "piano", "volume": 0.65, "pan": 0,\n     "notes": [{"pitch": "C4", "beat": 0, "duration": 1, "velocity": 0.75}]}\n  ]\n}\n\n反復パートはnotesの代わりにpatternsも使えます。例: "patterns": [{"at": 0, "length": 4, "repeat": 8, "notes": [["C3", 0, 1, 0.7], ["G3", 2, 1, 0.6]]}]。配列音符は[音程,開始拍,長さ,強さ]。pattern内beatはそのパターン内の相対位置、atは曲頭からの拍です。\n\n希望する曲：`;

// A senator must exist exactly once: in its owner's tabletop reserve or on the printed board.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cpuTurn} from './quovadis-selfplay.mjs';
const require=createRequire(import.meta.url),D=require('../quo-vadis/data.js'),E=require('../quo-vadis/engine.js');
let positions=0;
for(const n of [3,4,5]){
 const st=E.newGame({players:D.PLAYER_COLORS.slice(0,n).map((c,i)=>({name:'P'+i,color:c.key,kind:'cpu',level:2})),seed:59,first:0});
 const rnd=E.mulberry32(41);
 for(let turn=0;turn<220;turn++){
  const onBoard=[...Object.values(st.occ).flat(),...st.senate].filter(sid=>sid>=0);
  for(let me=0;me<n;me++)for(const side of [false,true]){
   const supply=D.tableSupply(st,me,side),all=[...onBoard,...supply.map(p=>p.sid)];
   assert.equal(new Set(all).size,8*n,'no duplicate or missing physical senator');assert.equal(all.length,8*n);
   st.players.forEach((pl,p)=>assert.equal(supply.filter(c=>c.p===p).length,pl.left));
   const groups=D.tableGroups(n,me,side),near=groups.find(g=>g.p===me);
   assert(side?near.x>7.1:near.z>10.7,'own pieces are at the camera-facing table edge');
   for(const c of supply){
    const [x,z]=c.at;assert(Math.abs(x)>.31+D.BOARD.w/2 || Math.abs(z)>.31+D.BOARD.d/2,'reserves do not cover the printed board');
    assert(x>D.TABLE_VIEW.x0+.31&&x<D.TABLE_VIEW.x0+D.TABLE_VIEW.w-.31&&z>D.TABLE_VIEW.z0+.31&&z<D.TABLE_VIEW.z0+D.TABLE_VIEW.d-.31,'camera bounds include all reserves');
   }
   for(let a=0;a<supply.length;a++)for(let b=a+1;b<supply.length;b++)assert(Math.hypot(supply[a].at[0]-supply[b].at[0],supply[a].at[1]-supply[b].at[1])>=.62,'physical pieces do not overlap');
   positions++;
  }
  if(st.phase==='over')break;
  const result=cpuTurn(st,rnd);assert(result.ok);
 }
 assert.equal(st.phase,'over');
}
console.log(`Tabletop supplies: ${positions} player/camera views checked through full 3–5 player games; all pieces conserved, outside the board, in camera bounds, without overlap.`);

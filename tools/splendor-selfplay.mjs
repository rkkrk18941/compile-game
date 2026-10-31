// 宝石の煌めき — CPU strength ladder by self-play.
// node tools/splendor-selfplay.mjs [levelA] [levelB] [pairs] [players]
// Each pair deals the same game twice with the seats exchanged, so the luck of the deal cancels out.
// Every CPU decides from its own seat's view (E.view), exactly as in the browser.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../splendor/engine.js'),AI=require('../splendor/ai.js');

export function playGame(levels,seed,{first=0,msScale=1,log=false}={}){
 const rng=E.mulberry32(seed),n=levels.length;
 const s=E.newGame({players:n,first,rng});
 const cpuRng=E.mulberry32(seed^0x9e3779b9);
 let plies=0;const think=new Array(n).fill(0);
 while(!s.over&&plies<400){
  const seat=s.cur,v=E.view(s,seat),t0=performance.now();
  const lv=levels[seat],extra={};
  if(msScale!==1&&AI.LEVELS[lv]?.search)extra.ms=Math.round(AI.LEVELS[lv].search.ms*msScale);
  const turn=AI.choose(v,lv,cpuRng,extra);
  think[seat]+=performance.now()-t0;
  E.play(s,turn);plies++;
  if(log)console.log(seat,JSON.stringify(turn.a),s.pl.map(p=>p.pts).join('/'));
 }
 const res=E.result(s);
 return {res,plies,turns:Math.ceil(plies/n),pts:s.pl.map(p=>p.pts),nc:s.pl.map(p=>p.nc),over:s.over,think};
}

export function match(a,b,pairs,{seed=12345,msScale=1,players=2,onGame}={}){
 let score=0,games=0,win=0,loss=0,draw=0,plies=0,thinkA=0,thinkB=0,decA=0;
 for(let i=0;i<pairs;i++){
  const sd=(seed+i*7919)>>>0;
  for(const swap of [false,true]){
   // 2 players: A and B. More players: A against (players-1) copies of B.
   const levels=[];for(let k=0;k<players;k++)levels.push(b);
   const seatA=swap?players-1:0;levels[seatA]=a;
   const g=playGame(levels,sd,{msScale});
   games++;plies+=g.plies;thinkA+=g.think[seatA];thinkB+=g.think.reduce((x,y)=>x+y,0)-g.think[seatA];decA+=Math.ceil(g.plies/players);
   const w=g.res.winners;let r;
   if(w.includes(seatA))r=1/w.length;else r=0;
   if(r===1)win++;else if(r===0)loss++;else draw++;
   score+=r;onGame?.(g,r);
  }
 }
 return {a,b,games,score:score/games,win,loss,draw,avgPlies:plies/games,msPerMoveA:thinkA/decA};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const [a=3,b=2,pairs=20,players=2]=process.argv.slice(2).map(Number);
 const t0=performance.now();
 const r=match(a,b,pairs,{players});
 console.log(`L${a} (${AI.LEVELS[a].name}) vs L${b} (${AI.LEVELS[b].name}) ${players}p: score ${(r.score*100).toFixed(1)}%  W${r.win} L${r.loss} D${r.draw}  avg plies ${r.avgPlies.toFixed(1)}  A ms/move ${r.msPerMoveA.toFixed(1)}  total ${((performance.now()-t0)/1000).toFixed(1)}s`);
}

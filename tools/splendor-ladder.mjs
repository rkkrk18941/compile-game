// 宝石の煌めき — CPU ladder in parallel: level A against level B over paired deals (seats swapped), using every core.
// node tools/splendor-ladder.mjs A B pairs [msScale=1] [players=2] [seed=1]
// msScale shrinks the thinking time of the search levels for quicker (weaker) checks.
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import os from 'node:os';
import {playGame} from './splendor-selfplay.mjs';

if(!isMainThread){
 parentPort.on('message',({a,b,seeds,msScale,players})=>{
  const res=[];
  for(const sd of seeds)for(const swap of [false,true]){
   const levels=new Array(players).fill(b);const seatA=swap?players-1:0;levels[seatA]=a;
   const g=playGame(levels,sd,{msScale});
   const w=g.res.winners;res.push({r:w.includes(seatA)?1/w.length:0,plies:g.plies,pts:g.pts[seatA],opp:Math.max(...g.pts.filter((_,i)=>i!==seatA)),think:g.think[seatA]/Math.max(1,Math.ceil(g.plies/players))});
   parentPort.postMessage({progress:1});
  }
  parentPort.postMessage({done:res});
 });
}else{
 const [a,b,pairs=20,msScale=1,players=2,seed=1]=process.argv.slice(2).map(Number);
 const cores=Math.max(1,os.cpus().length),seeds=[...Array(pairs)].map((_,i)=>((seed*100003+i*7919)*2654435761)>>>0);
 const per=Math.ceil(pairs/cores),t0=Date.now();let doneGames=0;
 const results=await Promise.all([...Array(cores)].map((_,i)=>new Promise(res=>{
  const part=seeds.slice(i*per,(i+1)*per);if(!part.length)return res([]);
  const w=new Worker(new URL(import.meta.url));
  w.on('message',m=>{if(m.progress){doneGames++;if(doneGames%10===0)process.stderr.write(`  ${doneGames}/${pairs*2} games, ${((Date.now()-t0)/1000).toFixed(0)}s\n`);}if(m.done){w.terminate();res(m.done);}});
  w.postMessage({a,b,seeds:part,msScale,players});
 }))).then(x=>x.flat());
 const n=results.length,score=results.reduce((s,x)=>s+x.r,0)/n;
 // standard error over pairs (paired deals are not independent)
 const pairsR=[];for(let i=0;i<results.length;i+=2)pairsR.push((results[i].r+results[i+1].r)/2);
 const m=pairsR.reduce((s,x)=>s+x,0)/pairsR.length,se=Math.sqrt(pairsR.reduce((s,x)=>s+(x-m)**2,0)/pairsR.length/pairsR.length);
 const avg=k=>results.reduce((s,x)=>s+x[k],0)/n;
 console.log(`L${a} vs L${b} ${players}p msScale ${msScale}: ${(score*100).toFixed(1)}% ±${(se*100).toFixed(1)} over ${n} games | A avg pts ${avg('pts').toFixed(1)} vs ${avg('opp').toFixed(1)} | A ms/move ${avg('think').toFixed(0)} | plies ${avg('plies').toFixed(0)} | ${((Date.now()-t0)/1000).toFixed(0)}s`);
}

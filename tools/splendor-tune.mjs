// 宝石の煌めき — tunes the CPU's strategy values (splendor/ai.js BASE) by self-play hill climbing.
// node tools/splendor-tune.mjs [minutes=10] [players=2] [startJson]
// A change is kept only when it beats the current values in paired games (same deal, seats swapped) by a clear margin.
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import os from 'node:os';
const require=createRequire(import.meta.url);
const AI=require('../splendor/ai.js');

if(!isMainThread){
 parentPort.on('message',({a,b,seeds,players})=>{
  let sum=0,sq=0;
  for(const sd of seeds){const pair=(AI.practice(a,b,sd,false,players)+AI.practice(a,b,sd,true,players))/2;sum+=pair;sq+=pair*pair;}
  parentPort.postMessage({sum,sq,n:seeds.length});
 });
}else{
 const minutes=+(process.argv[2]||10),players=+(process.argv[3]||2);
 let champ={...AI.BASE};if(process.argv[4])Object.assign(champ,JSON.parse(process.argv[4]));
 const space=AI.SPACE,keys=Object.keys(space);
 const cores=Math.max(1,os.cpus().length),pool=[...Array(cores)].map(()=>new Worker(new URL(import.meta.url)));
 let seedCounter=1000;
 function run(a,b,pairs){
  const seeds=[...Array(pairs)].map(()=>(seedCounter++*2654435761)>>>0);
  const per=Math.ceil(pairs/cores);
  return Promise.all(pool.map((w,i)=>new Promise(res=>{const part=seeds.slice(i*per,(i+1)*per);if(!part.length)return res({sum:0,sq:0,n:0});w.once('message',res);w.postMessage({a,b,seeds:part,players});})))
   .then(rs=>rs.reduce((x,y)=>({sum:x.sum+y.sum,sq:x.sq+y.sq,n:x.n+y.n}),{sum:0,sq:0,n:0}));
 }
 const rnd=Math.random;
 function snap(v,sp){const s=sp.step;v=Math.round((v-sp.min)/s)*s+sp.min;return Math.round(Math.min(sp.max,Math.max(sp.min,v))*1e6)/1e6;}
 function mutate(p){const c={...p};const n=rnd()<0.6?1:rnd()<0.7?2:3;let changed=[];
  for(let t=0;t<20&&changed.length<n;t++){const k=keys[Math.floor(rnd()*keys.length)];if(changed.includes(k))continue;const sp=space[k];
   const v=snap(p[k]+(rnd()<0.5?-1:1)*(rnd()<0.7?1:2)*sp.step,sp);if(v!==p[k]){c[k]=v;changed.push(k);}}
  return {c,changed};}
 const end=Date.now()+minutes*60000;let tried=0,accepted=0;
 while(Date.now()<end){
  const {c,changed}=mutate(champ);tried++;
  let r=await run(c,champ,60);let m=r.sum/r.n;
  if(m<0.5){continue;}
  r=await run(c,champ,140).then(x=>({sum:x.sum+r.sum,sq:x.sq+r.sq,n:x.n+r.n}));m=r.sum/r.n;
  const se=Math.sqrt(Math.max(1e-4,r.sq/r.n-m*m)/r.n);
  if(m-1.8*se>0.5){champ=c;accepted++;console.log(`#${tried} accept ${changed.map(k=>k+'='+c[k]).join(' ')}  ${(m*100).toFixed(1)}% ±${(se*100).toFixed(1)}`);}
 }
 console.log('tried',tried,'accepted',accepted);
 console.log(JSON.stringify(champ));
 const fin=await run(champ,{...AI.BASE},400);console.log('final vs BASE',(fin.sum/fin.n*100).toFixed(1)+'%');
 pool.forEach(w=>w.terminate());
}

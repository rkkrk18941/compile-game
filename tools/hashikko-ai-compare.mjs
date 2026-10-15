// Paired seeded deals: each seat takes a turn using the candidate against the baseline.
// node tools/hashikko-ai-compare.mjs --baseline-ref 0a7aeff --deals 60
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),E=require('../hashikko-seven/engine.js'),candidate=require('../hashikko-seven/ai.js');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const ref=arg('--baseline-ref','HEAD'),deals=Number(arg('--deals','60')),seed=Number(arg('--seed','87000'));
if(!Number.isInteger(deals)||deals<1)throw Error('deals must be a positive integer');
const source=execFileSync('git',['show',ref+':hashikko-seven/ai.js'],{encoding:'utf8'});
const context={HSV_ENG:E,module:{exports:{}}};vm.runInNewContext(source,context);const baseline=context.module.exports;
let total=0,wins=0,baseWins=0;
for(const n of [2,3,4,5]){
 let won=0,baselineWon=0,gained=0,lost=0,decisions=0,ms=0,maxMs=0;
 function play(g,seat,upgraded){
  const s=E.newGame({n,seed:seed+g,first:g%n}),rngs=Array.from({length:n},(_,p)=>E.mulberry32(17+g*31+p));let steps=0;
  while(s.phase==='play'){
   if(++steps>3000)throw Error('game did not end');const p=s.turn,ai=upgraded&&p===seat?candidate:baseline,v=E.viewFor(s,p),t=performance.now();
   const a=ai.choose(v,3,rngs[p],{seed:99+p});
   if(upgraded&&p===seat){const dt=performance.now()-t;decisions++;ms+=dt;maxMs=Math.max(maxMs,dt);}
   const r=E.apply(s,{p,...a});if(!r.ok)throw Error('illegal action: '+r.err);
  }
  return s.winner;
 }
 for(let g=0;g<deals;g++){
  const control=play(g,-1,false);
  for(let seat=0;seat<n;seat++){
   const before=control===seat,after=play(g,seat,true)===seat;
   baselineWon+=Number(before);won+=Number(after);gained+=Number(after&&!before);lost+=Number(before&&!after);
  }
 }
 const games=n*deals;total+=games;wins+=won;baseWins+=baselineWon;
 console.log(JSON.stringify({players:n,games,baselineWins:baselineWon,candidateWins:won,baselineRate:+(100/n).toFixed(1),candidateRate:+(won/games*100).toFixed(1),gained,lost,decisionMs:+(ms/decisions).toFixed(2),maxDecisionMs:+maxMs.toFixed(1)}));
}
console.log(JSON.stringify({baselineRef:ref,seed,dealsPerPlayerCount:deals,games:total,baselineWins:baseWins,candidateWins:wins}));

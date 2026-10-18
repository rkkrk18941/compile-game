import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),T=require('../nurie-rush/training.js'),E=require('../nurie-rush/engine.js');
const rnd=E.seeded(2901),s=T.newUnlimited(800,rnd);
assert.equal(s.queue.length,60);assert.equal(new Set(s.queue).size,60);
assert.equal(T.advanceUnlimited(s,rnd),null,'cannot advance an unfinished round');
const wrong=s.queue[3],slow=s.queue[7];
for(const id of [...s.queue]){const r=T.answerUnlimited(s,id,id!==wrong,id===slow?800.1:800);assert.equal(r.passed,id!==wrong&&id!==slow);}
assert.equal(s.cleared,false);assert.equal(s.wrong,1);assert.equal(s.slow,1);
let transition=T.advanceUnlimited(s,rnd);assert.equal(transition.kind,'review');assert.deepEqual([...s.queue].sort((a,b)=>a-b),[wrong,slow].sort((a,b)=>a-b));
for(const id of [...s.queue])T.answerUnlimited(s,id,true,id===slow?950:750);
transition=T.advanceUnlimited(s,rnd);assert.equal(transition.kind,'review');assert.deepEqual(s.queue,[slow],'only the still-slow card survives');
T.answerUnlimited(s,slow,true,800);assert.equal(s.cleared,false,'clearing review is not the win condition');
transition=T.advanceUnlimited(s,rnd);assert.equal(transition.kind,'all');assert.equal(s.queue.length,60);assert.equal(s.cycle,2);
for(const id of [...s.queue])T.answerUnlimited(s,id,true,799.9);
transition=T.advanceUnlimited(s,rnd);assert.equal(transition.kind,'clear');assert.equal(s.cleared,true);assert.equal(s.answers,123);
assert.equal(T.currentUnlimited(s),null);assert.equal(T.answerUnlimited(s,0,true,10),null);
const perfect=T.newUnlimited(1000,rnd);for(const id of [...perfect.queue])T.answerUnlimited(perfect,id,true,1000);assert.equal(T.advanceUnlimited(perfect,rnd).kind,'clear','a perfect first full round also clears');
const invalid=T.newUnlimited(800,rnd);T.answerUnlimited(invalid,T.currentUnlimited(invalid),true,NaN);assert.equal(invalid.failed.length,1,'invalid time never counts as fast');
assert.throws(()=>T.newUnlimited(0));
for(let seed=1;seed<=30;seed++){
 const x=T.newUnlimited(800,E.seeded(seed));
 let guard=0;
 while(!x.cleared&&guard++<20){
  const previous=[...x.queue],failed=[];
  for(let i=0;i<previous.length;i++){const ok=guard>3||i%3!==0;const fast=guard>3||i%4!==0;T.answerUnlimited(x,previous[i],ok,fast?700:900);if(!ok||!fast)failed.push(previous[i]);}
  const tr=T.advanceUnlimited(x,E.seeded(seed+guard));
  if(tr.kind==='review')assert.deepEqual([...x.queue].sort((a,b)=>a-b),failed.sort((a,b)=>a-b));
  if(tr.kind==='clear')assert.equal(tr.previousSize,60,'clear always comes from all 60 cards');
 }
 assert(x.cleared,'converges once all answers meet the target');
}
console.log('Unlimited training passed: strict target boundary, 60 → failed subset → smaller subset → all 60 → clear, repeat cycles and invalid-time handling.');

// Generated deals and reveal sequences; no player data or hidden-hand access by the CPU.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../hashikko-seven/engine.js'),AI=require('../hashikko-seven/ai.js');
const prefix=[
 [0,'f',2],[0,'f',3],[1,'h',4,0],[1,'f',0],[1,'h',3,1],[2,'h',2,1],[2,'f',4],[3,'h',3,0],[3,'h',2,1],[4,'f',0],[4,'h',3,0],[4,'f',4],
 [0,'h',4,0],[0,'f',2],[1,'h',1,1],[1,'f',0],[2,'h',3,0],[2,'f',3],[3,'h',0,1],[3,'h',1,0],[4,'f',5],[4,'h',3,1],[0,'f',4],[0,'h',2,0],
 [1,'h',1,1],[1,'f',1],[2,'f',0],[2,'h',3,0],[2,'h',4,0],[3,'h',0,0],[3,'h',1,1],[4,'f',2],[4,'h',1,1],[0,'h',4,1],[0,'h',2,0],[1,'h',1,1],
 [1,'f',3],[2,'h',1,0],[2,'h',3,1],[3,'h',3,1],[3,'h',4,0],[3,'h',4,0],[4,'h',1,1],[4,'h',0,1],[0,'h',3,0],[0,'h',1,1],[1,'f',4],[1,'h',1,0]
];
function replay(){const s=E.newGame({n:5,seed:5507,first:0});for(const [p,t,w,e]of prefix){const a=t==='f'?{p,t:'field',i:w}:{p,t:'hand',who:w,end:e?'max':'min'};assert.equal(E.apply(s,a).ok,true);}return s;}
for(let seed=1;seed<=16;seed++){
 const s=replay(),p=s.turn,start=s.log.length,rng=E.mulberry32(seed);
 assert.equal(p,2);
 for(let k=0;k<3&&s.turn===p&&s.phase==='play';k++){
  const v=E.viewFor(s,p),a=AI.choose(v,3,rng,{seed:99+p});assert.ok(E.legalActions(s).some(x=>JSON.stringify(x)===JSON.stringify(a)));assert.equal(E.apply(s,{p,...a}).ok,true);
 }
 assert.equal(s.log[start]?.ok,true,'take the certain trio instead of a tiny speculative win; seed '+seed);
}
console.log('PASS certain-trio regression across 16 decision seeds');
// Looking for information must not override a win entirely inside our own hand.
const copies={};const take=v=>(v-1)*3+(copies[v]=(copies[v]||0)+1)-1;
const s=E.newGame({n:3,first:0,deal:{hands:[[7,7,7,8,9,10,11,11],[1,1,2,2,3,3,4,4],[1,2,3,4,5,5,6,6]].map(h=>h.map(take)),field:[5,6,8,8,9,9,10,10,11].map(take)}});
for(let k=0;k<3;k++){const a=AI.choose(E.viewFor(s,0),3,E.mulberry32(k+40));assert.deepEqual(a,{t:'hand',who:0,end:'min'});assert.equal(E.apply(s,{p:0,...a}).ok,true);}
assert.equal(s.win,'seven');console.log('PASS strategic own-hand reveals still take the immediate win');
// Public observations and the player's hand alone determine the decision.
const original=E.newGame({n:4,seed:31,first:0}),changed=E.clone(original);
[changed.field[0],changed.hands[3][3]]=[changed.hands[3][3],changed.field[0]];changed.hands[3].sort((a,b)=>a-b);
const a=E.viewFor(original,0),b=E.viewFor(changed,0);assert.deepEqual(a,b);
assert.deepEqual(AI.choose(a,3,E.mulberry32(9)),AI.choose(b,3,E.mulberry32(9)));console.log('PASS no hidden-hand peeking');

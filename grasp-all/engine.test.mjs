import assert from 'node:assert/strict';
import {createGame,offerCard,decide,advance,cpuView,cpuDecision} from './engine.mjs';
const act=(s,i,t)=>{assert(offerCard(s,i));assert(decide(s,t));};
let s=createGame();act(s,3,true);assert.deepEqual(s.players.map(p=>p.coins),[3,7]);assert.equal(s.result.card,2);assert(!decide(s,true));advance(s);assert.equal(s.turn,1);
s=createGame();act(s,5,false);assert.equal(s.result.card,null);assert.equal(s.history[0].card,null);assert.equal(s.players[0].hand.length,5);assert.deepEqual(s.players.map(p=>p.life),[3,3]);
s=createGame();act(s,5,true);assert.deepEqual(s.players.map(p=>p.life),[3,2]);assert(s.players.every(p=>p.hand.length===6));assert.equal(s.round,2);
s=createGame();s.players[0].coins=1;act(s,3,true);assert.equal(s.winner,1);assert.equal(s.players[0].coins,0);assert.equal(s.players[1].coins,6);assert(!advance(s));
s=createGame();s.players[1].life=1;act(s,5,true);assert.equal(s.winner,0);
s=createGame();for(let i=0;i<10;i++){act(s,0,false);if(i<9)advance(s);}assert.deepEqual(s.players.map(p=>p.life),[2,2]);assert.equal(s.result.penalties.length,2);assert.equal(s.round,2);
s=createGame();s.players.forEach(p=>{p.life=1;p.hand=[1,0]});act(s,0,false);advance(s);act(s,0,false);assert.equal(s.winner,-1);
s=createGame();s.players.forEach(p=>{p.coins=2;p.hand=[0,2]});act(s,0,false);advance(s);act(s,0,false);assert.equal(s.winner,-1);assert(s.players.every(p=>p.coins===0));
s=createGame();offerCard(s,0);const a=cpuView(s,1);s.offer.card=0;s.players[0].hand=[0,0,0,0,0];assert.deepEqual(cpuView(s,1),a);assert.equal(cpuDecision(a,'normal',()=>.5),cpuDecision(cpuView(s,1),'normal',()=>.5));
for(let k=0;k<1000;k++){s=createGame(k%2);let steps=0;while(s.winner===null&&steps++<500){const p=s.players[s.turn];act(s,Math.floor(Math.random()*p.hand.length),Math.random()<.6);for(const x of s.players){assert(x.life>=0&&x.life<=3);assert(x.coins>=0);assert(x.hand.length>=1&&x.hand.length<=6);}if(s.winner===null)assert(advance(s));}assert.notEqual(s.winner,null);}
console.log('PASS: transfers, pass secrecy, skull reset, both victory conditions, final-card penalties, draw, CPU information boundary, 1000 full games');

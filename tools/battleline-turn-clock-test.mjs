import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EndTurnClock} from '../hatatori-nine/turn-clock.js';
import {Arena} from '../hatatori-nine/arena.js';
const require=createRequire(import.meta.url),E=require('../hatatori-nine/engine.js'),{Director}=require('../hatatori-nine/director.js');
let now=1000,count=0;const clock=new EndTurnClock(()=>now);
const fire=()=>{count++;};
clock.update('turn1',fire);now+=7999;clock.update('turn1',fire);assert.equal(count,0);
clock.update('turn1',fire);assert.equal(clock.remaining(),1,'rerender cannot extend the deadline');
now++;clock.update('turn1',fire);clock.update('turn1',fire);assert.equal(count,1,'exactly one end at eight seconds');
clock.update('turn2',fire);assert.equal(clock.remaining(),8000,'new turn has fresh allowance');
clock.update(null,fire);now+=9000;clock.update(null,fire);assert.equal(count,1,'quit cancels clock');
clock.update('turn3',()=>false);now+=8000;clock.update('turn3',()=>false);assert.equal(clock.done,false,'presentation can defer end without resetting deadline');
clock.update('turn3',fire);assert.equal(count,2,'deferred end executes once ready');
clock.update('remote',fire,now+3500);assert.equal(clock.remaining(),3500,'uses host remaining time');
clock.update('remote',fire,now+8000);assert.equal(clock.remaining(),3500,'sync cannot extend a deadline');
// Host advances an absent guest, including a concurrent offscreen game.
const realNow=Date.now,realSet=setTimeout,realClear=clearTimeout;let timers=new Map(),next=0;
Date.now=()=>now;globalThis.setTimeout=(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;};globalThis.clearTimeout=id=>timers.delete(id);
const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
let sends=0;const arena=new Arena(Array.from({length:4},(_,i)=>({eid:i,name:'p'+i,cpu:0,owner:'p'+i})),'league',{seed:9,parallel:true,tactics:false},{E,Director,send(){sends++;},idle(){}});
try{
 arena.startReady();assert.equal(arena.d.matches.filter(m=>m.status==='live').length,2);
 for(const m of arena.d.matches.filter(m=>m.state)){
  while(m.state.phase!=='end'){
   const a=E.legalActions(m.state).find(a=>a.t!=='claim');
   assert.ok(arena.act(arena.ent(m.state.turn,m).owner,a,m.id,m.revision));
  }
 }
 const live=arena.d.matches.filter(m=>m.state),deadlines=live.map(m=>m.endUntil),seats=live.map(m=>m.state.turn);
 live.forEach(m=>arena.armEndTurn(m));assert.deepEqual(live.map(m=>m.endUntil),deadlines,'claims/rerenders do not reset authority timer');
 assert.equal(arena.payload('spectator',[],false,0,live[0].id).endRemaining,8000);
 advance(7999);live.forEach((m,i)=>assert.equal(m.state.turn,seats[i]));
 advance(1);live.forEach((m,i)=>assert.equal(m.state.turn,1-seats[i],'host advances guest without client input'));
 const m=live[0];m.state.phase='end';arena.armEndTurn(m);const before=sends;arena.close();advance(9000);assert.equal(sends,before,'closed room never emits stale timeout');
}finally{arena.close();Date.now=realNow;globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear;}
console.log('Battle Line clock checks passed: 8-second boundary, redraws, deferred presentation, remote clock, parallel matches, authority and cleanup.');

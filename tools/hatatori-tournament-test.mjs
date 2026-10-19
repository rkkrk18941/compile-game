// Tournament regression: schedules, actual matches, private hands, online authority and CPU lifecycle.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Arena } from '../hatatori-nine/arena.js';
import { tourBoardHTML } from '../hatatori-nine/tournament-board.js';
const require = createRequire(import.meta.url);
const E = require('../hatatori-nine/engine.js'), AI = require('../hatatori-nine/ai.js');
const { Director } = require('../hatatori-nine/director.js');
let checks=0;
const check=(v,msg)=>{assert.ok(v,msg);checks++;};
function entrants(n,cpu=0){return Array.from({length:n},(_,i)=>({name:'参加者'+i,eid:i,cpu,owner:cpu?null:'p'+i}));}
function finish(d,m,draw=false){const s=m.state;s.phase='over';s.winner=draw?2:0;s.win=draw?'draw':'breakthrough';[0,1,2].forEach(f=>s.flags[f].claimed=0);d.finish(m,s);}
for(const format of ['league','cup'])for(let n=2;n<=24;n++){
 const d=new Director(entrants(n),format,880+n,{tactics:n%2===0});
 if(format==='league'){
   check(d.matches.length===n*(n-1)/2,'every league pair once');
   check(new Set(d.matches.map(m=>[m.a,m.b].sort((a,b)=>a-b).join('/'))).size===d.matches.length,'no duplicate opponents');
   const rounds=new Map();for(const m of d.matches){const seen=rounds.get(m.round)||new Set();check(!seen.has(m.a)&&!seen.has(m.b),'nobody plays twice per round');seen.add(m.a);seen.add(m.b);rounds.set(m.round,seen);}
 }else{
   const size=2**Math.ceil(Math.log2(n));
   check(d.matches.filter(m=>m.bye).length===size-n,'correct bye count');
   check(d.matches.filter(m=>m.round===1).every(m=>m.a!=null||m.b!=null),'no empty first-round pairing');
   check(d.matches.length===size-1,'complete future tree exists');
 }
 let played=0;while(d.next()){const m=d.start();check(m.state.tactics===(n%2===0),'tactics setting propagated');finish(d,m,played++%5===0);}
 check(d.over(),'tournament ends');check(d.champion()!=null,'champion exists');check(d.matches.every(m=>m.status==='done'),'all matches complete');
 check(played===(format==='league'?n*(n-1)/2:n-1),'actual match count');
 const t=d.summary();check(!JSON.stringify(t).includes('hands'),'summary contains no hidden hands');
 check(tourBoardHTML(t).includes('優勝'),'champion rendered');
}
// Real games run through the authority layer, rather than a fabricated tournament result.
for(const format of ['cup','league']){
 const io={E,AI,Director,send(){},choose:async(v,l)=>AI.choose(v,l,E.mulberry32(v.clock+81)),delay:async()=>{},idle(){}};
 const a=new Arena(entrants(3),format,{seed:671,tactics:true},io);
 let games=0;while(a.startNext()){
  let turns=0;while(a.match.state&&turns++<800){const state=a.match.state,seat=state.turn;const action=AI.choose(E.viewFor(state,seat),1,E.mulberry32(102+turns));check(a.act(a.ent(seat).owner,action),'legal action reaches match');}
  check(turns<800,'match completed');games++;
 }
 check(a.d.over(),'real games finish tournament');check(games===(format==='cup'?2:3),'right number of real games');
}
{
 const io={E,AI,Director,send(){},choose:async()=>null,delay:async()=>{},idle(){}};
 const a=new Arena(entrants(3),'league',{seed:81,tactics:false},io);a.startNext();
 const state=a.match.state,seat=state.turn,owner=a.ent(seat).owner,other=a.ent(1-seat).owner;
 const action=E.legalActions(state)[0],rev=a.revision;
 check(!a.act('spectator',action),'spectators cannot act');check(!a.act(other,action),'opponent cannot act out of turn');
 check(!a.act(owner,action,a.d.cur+1),'stale match rejected');check(!a.act(owner,action,a.d.cur,rev+1),'stale revision rejected');
 const p=a.payload(owner),watch=a.payload('spectator');
 check(p.hands===null&&p.ctrl.length===1,'player gets own private hand only');
 check(watch.hands.length===2&&watch.ctrl.length===0,'spectator gets both hands and no controls');
 watch.hands[0].pop();check(state.hands[0].length===7,'payload hand is a copy');
 check(!a.startNext(),'cannot skip an unfinished match');
 check(a.act(owner,action),'right player can act');check(!a.act(owner,action,a.d.cur,rev),'duplicate old action rejected');
 a.playerLeft(other);check(a.d.entrants.find(e=>e.owner===other)===undefined,'disconnected player becomes CPU for remaining matches');
 a.close();check(!a.act(owner,action),'closed host rejects actions');
}
// CPU fast-forward uses each entrant's actual difficulty, handles cancellation and never runs twice.
{
 let release;const chosen=[];
 const io={E,AI,Director,send(){},choose:(v,l)=>{chosen.push(l);return new Promise(r=>release=()=>r(AI.choose(v,1,E.mulberry32(42))));},delay:async()=>{},idle(){}};
 const a=new Arena(entrants(2,4),'cup',{seed:44,tactics:false},io);a.startNext();const pending=a.pump();
 check(a.busy,'CPU calculation in flight');a.close();release();await pending;check(a.revision===1,'closed CPU calculation cannot mutate match');
 const b=new Arena(entrants(2,4),'cup',{seed:44,tactics:false},{...io,choose:async(v,l)=>{chosen.push(l);return AI.choose(v,1,E.mulberry32(v.clock+30));}});b.startNext();await b.fastForward();
 check(b.d.over(),'CPU fast forward completes match');check(chosen.every(l=>l===4),'fast forward retains chosen difficulty');
}
// Branches can advance without waiting for the whole round.
{
 const d=new Director(entrants(8),'cup',29,{});
 const first=d.rounds[0].map(id=>d.matches[id]);first.forEach(m=>d.start(m));
 finish(d,first[0]);finish(d,first[1]);
 const semi=d.matches[d.rounds[1][0]];
 check(d.ready().includes(semi),'completed branch advances while the other quarterfinals remain live');
 check(d.start(semi)===semi,'early semi-final can start');
 check(d.start(semi)===null,'live match cannot be restarted');
 check(first[2].status==='live'&&first[3].status==='live','unrelated matches stay live');
}
// Multiple games have isolated revisions, controls, private hands and reservations.
for(const format of ['cup','league']){
 const a=new Arena(entrants(8),format,{seed:62,tactics:false,parallel:true},{E,AI,Director,send(){},idle(){},delay:async()=>{},choose:async(v)=>AI.choose(v,1,E.mulberry32(9))});
 check(a.startReady()===4,'four simultaneous independent matches start');
 const live=a.d.matches.filter(m=>m.state),[m,other]=live;
 const r=other.revision,state=other.state,otherHand=state.hands.map(h=>h.join(','));
 const seat=m.state.turn,owner=a.ent(seat,m).owner;
 check(a.act(owner,E.legalActions(m.state)[0],m.id,m.revision),'can act in a match other than director.cur');
 check(other.revision===r&&other.state===state&&otherHand.every((h,i)=>h===state.hands[i].join(',')),'one move never mutates another match');
 check(!a.act(owner,E.legalActions(state)[0],other.id,r),'cannot act in another pairing');
 check(a.payload(owner,[],false,0,m.id).hands===null,'own pairing never exposes opponent hand');
 check(a.payload(owner,[],false,0,other.id).hands.length===2,'player can spectate both hands in another ongoing game');
 let guard=0;
 while(!a.d.over()&&guard++<20000){
   const playing=a.d.matches.filter(m=>m.state);
   const ids=playing.flatMap(m=>m.seats);check(new Set(ids).size===ids.length,'no entrant is double-booked');
   for(const m of playing){const seat=m.state.turn,owner=a.ent(seat,m).owner;check(a.act(owner,AI.choose(E.viewFor(m.state,seat),1,E.mulberry32(guard+73)),m.id,m.revision),'concurrent legal move');}
 }
 check(guard<20000&&a.d.over(),'concurrent tournament completes');
 check(a.d.matches.filter(m=>!m.bye).length===(format==='cup'?7:28),'every real pairing finishes once');
}
{
 const people=entrants(6).map(e=>({...e,owner:'shared'}));
 const a=new Arena(people,'cup',{parallel:true},{E,AI,Director,send(){},idle(){}});
 check(a.startReady()===1,'shared-device hotseat never double-books its controller');
}
{
 const releases=[];let jobs=0;
 const a=new Arena(entrants(8,2),'cup',{parallel:true},{E,AI,Director,send(){},idle(){},delay:async()=>{},choose:v=>{jobs++;return new Promise(r=>releases.push(()=>r(AI.choose(v,1,E.mulberry32(12)))));}});
 a.startReady();const live=a.d.matches.filter(m=>m.state),pending=live.map(m=>a.pump(m.id));
 check(jobs===4,'CPU calculations for all live matches can be in flight together');
 a.close();releases.forEach(r=>r());await Promise.all(pending);
 check(live.every(m=>m.revision===1),'closing cancels every independent CPU job');
}
// The opening VS animation is a real start barrier, not just an overlay over active CPUs.
{
 const a=new Arena(entrants(4), 'cup', {parallel:true,entryDelay:60000}, {E,AI,Director,send(){},idle(){},choose:async()=>{throw Error('CPU ran during entrance');},delay:async()=>{}});
 a.startReady();const m=a.d.matches.find(m=>m.state),seat=m.state.turn;
 check(!a.act(a.ent(seat,m).owner,E.legalActions(m.state)[0],m.id,m.revision),'actions wait for battle entry');
 await a.pump(m.id);check(m.state.clock===0,'CPU cannot advance under the intro');a.close();
}
console.log(`Hatatori tournament: ${checks} checks passed (2–24 entrants, odd byes, draws, actual matches, authority, privacy, CPU cancellation).`);

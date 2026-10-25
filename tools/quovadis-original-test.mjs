// Independent transcription of AMIGO 2005's printed board, plus executable table agreements.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../quo-vadis/engine.js'),D=require('../quo-vadis/data.js');
const expected={A1:[1,['B1']],A2:[5,['C1','B2']],A3:[1,['B3']],A4:[3,['B3','B4']],B1:[1,['C1']],B2:[1,['C2']],B3:[3,['C2','D2']],B4:[1,['C3']],C1:[3,['D1']],C2:[5,['S']],C3:[1,['D3']],D1:[3,['S']],D2:[1,['D3']],D3:[3,['S']]};
for(const [cid,[n,targets]] of Object.entries(expected)){assert.equal(D.COM[cid].seats,n,cid+' seats');assert.deepEqual(D.OUT[cid].map(p=>p.to),targets,cid+' printed paths');}
assert.equal(D.COMMITTEES.reduce((a,c)=>a+c.seats,0),32);
assert.equal(D.PATHS.length,17);assert.equal(D.LAUREL_PATHS.length,10);assert.equal(D.CAESAR_START,'C2-S');
for(const p of D.PATHS)if(p.laurel)assert(p.at&&p.pts.some(pt=>pt[0]===p.at[0]&&pt[1]===p.at[1]));
const game=()=>E.newGame({players:D.PLAYER_COLORS.slice(0,3).map((c,i)=>({name:'P'+i,color:c.key})),seed:77,first:0});
const put=(s,c,...ids)=>ids.forEach((sid,i)=>{s.occ[c][i]=sid;s.players[E.owner(sid)].left--;});
{
 const s=game(),snap=JSON.stringify(s);assert.equal(E.apply(s,0,{t:'pass'}).ok,false);assert.equal(JSON.stringify(s),snap,'illegal pass must not mutate state');
}
{
 const s=game();s.players[1].pts=5;
 assert(E.agree(s,1,2,{amount:3,text:'次の番は赤を支援しない'}).ok);
 assert.deepEqual(s.players.map(p=>p.pts),[0,2,3]);assert.equal(s.turn,0);assert.equal(s.turnNo,1);
 assert(E.apply(s,0,{t:'place',c:'A1'}).ok);assert(E.apply(s,1,{t:'place',c:'A2'}).ok,'future text never forces an action');
}
{
 const s=game();s.players[1].pts=5;
 assert(E.agree(s,1,0,{amount:3,when:{t:'notcaesar',to:'A2-B2'}}).ok);
 const snap=JSON.stringify(s);assert.equal(E.apply(s,0,{t:'caesar',to:'A2-B2'}).err,'agreement');assert.equal(JSON.stringify(s),snap);
 assert(E.apply(s,0,{t:'place',c:'A1'}).ok);assert.deepEqual(s.players.map(p=>p.pts),[3,2,0]);assert.equal(s.contracts.length,0);assert.equal(s.turn,1);
}
{
 const s=game();assert(E.agree(s,0,1,{amount:0,when:{t:'caesar',to:'A2-B2'}}).ok);
 const snap=JSON.stringify(s);assert.equal(E.agree(s,0,2,{amount:0,when:{t:'place',c:'A1'}}).err,'conflict');assert.equal(JSON.stringify(s),snap);
 assert(E.apply(s,0,{t:'caesar',to:'A2-B2'}).ok);assert.equal(s.turn,1);
}
{
 const s=game();put(s,'A4',0,1);s.spaces['A4-B3']={id:98,v:3,c:false};
 assert(E.agree(s,0,1,{amount:3,when:{t:'move',from:'A4',to:'B3'}}).ok);
 const snap=JSON.stringify(s);assert.equal(E.apply(s,0,{t:'place',c:'A1'}).ok,false);assert.equal(JSON.stringify(s),snap);
 assert(E.apply(s,0,{t:'move',from:'A4',to:'B3'}).ok);assert.deepEqual(s.players.map(p=>p.pts),[0,3,0]);
}
{
 const s=game();s.players[0].pts=5;
 assert(E.agree(s,0,1,{amount:4,when:{t:'turn'}}).ok);
 assert.equal(E.agree(s,0,2,{amount:2}).err,'afford','signed payments reserve the payer’s current balance');
 s.players[0].pts=0;const snap=JSON.stringify(s);assert.equal(E.apply(s,0,{t:'place',c:'A1'}).err,'afford');assert.equal(JSON.stringify(s),snap,'failed settlement rolls back the whole action');
}
{
 const s=game();s.caesar='A2-B2';put(s,'C2',0,1,2,8);const info=E.moveInfo(s,0,'C2','S',1);
 assert.deepEqual([info.ownMax,info.own,info.ext],[2,1,1]);assert(E.apply(s,0,{t:'move',from:'C2',to:'S',ownVotes:1,votes:{1:1}}).ok);assert.equal(s.players[1].pts,1,'mover may deliberately choose another color’s consent');
}
{
 const s=game();s.caesar='A2-B2';s.senate=[8,9,16,17];put(s,'C2',0,1,2);s.players[0].pts=10;s.players[1].pts=10;s.spaces['C2-S']={id:98,v:5,c:false};
 assert(E.agree(s,0,1,{amount:8,when:{t:'move',from:'C2',to:'S'}}).ok);
 const r=E.apply(s,0,{t:'move',from:'C2',to:'S'});assert(r.ok);assert.equal(s.phase,'over');assert.equal(s.over.winner,1);assert.equal(s.players[0].pts,7);assert.equal(s.players[1].pts,18);assert.equal(r.ev.find(e=>e.e==='over').result.winner,1,'last-move deals settle before winner is announced');
}
for(const amount of [NaN,Infinity,0.5,'3',-10001])assert.equal(E.agree(game(),0,1,{amount}).ok,false);
assert.equal(E.agree(game(),1,2,{amount:0,when:{t:'caesar',to:'A2-B2'}}).ok,false,'a third party cannot bind the player to move');
console.log('Original board: all 14 capacities and 17 routes verified; pass, chosen consents, free table payments, binding conditions, conflicts, rollback, reserves and final scoring passed.');

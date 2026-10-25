// Teaching positions use real rules, including costs, votes, turn boundaries and the ending.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../quo-vadis/engine.js'),D=require('../quo-vadis/data.js'),T=require('../quo-vadis/tutorial-lessons.js'),H=require('../quo-vadis/help.js');
for(let i=0;i<T.lessons.length;i++){
  const st=T.create(i),l=T.lessons[i];
  // Every supplied senator is unique, and each player's pieces are conserved.
  const pieces=[...Object.values(st.occ).flat(),...st.senate].filter(x=>x>=0);
  assert.equal(new Set(pieces).size,pieces.length);
  st.players.forEach((p,q)=>assert.equal(p.left+pieces.filter(s=>E.owner(s)===q).length,D.SENATORS));
  const tiles=[...Object.values(st.spaces).filter(Boolean),...st.bag];
  assert.equal(new Set(tiles.map(t=>t.id)).size,44);
  for(const term of l.terms)assert(H.terms.some(t=>t.join(' ').includes(term)),`unresolved glossary term ${term}`);
  if(i===0){assert.equal(E.result(st).winner,l.answer);continue;}
  if(i===4){assert.equal(E.apply(E.clone(st),0,{t:'move',from:'B2',to:'C1'}).ok,false,'missing external vote is rejected');}
  if(i===6){assert.equal(E.moveInfo(st,0,'B2','C1').ok,false,'lone senator needs consent before Caesar arrives');}
  assert.equal(E.apply(st,0,l.action).ok,true,l.title);
  if(l.follow){assert.equal(E.apply(st,0,l.follow).ok,false,'moving Caesar consumes a turn');st.turn=0;assert.equal(E.apply(st,0,l.follow).ok,true);assert.equal(st.players[0].pts,0);assert.equal(st.spaces['B2-C1'].v,4);}
  if(l.bonus){assert.equal(st.phase,'bonus');const skipped=E.clone(st);assert.equal(E.apply(skipped,0,{t:'bonus',to:null}).ok,true);assert.equal(E.apply(st,0,l.bonus).ok,true);assert.equal(st.turnNo,2,'bonus belongs to the same turn');}
  if(i===3)assert.equal(st.players[0].pts,4);
  if(i===4)assert.deepEqual(st.players.map(p=>p.pts),[3,2,0]);
  if(i===5)assert.equal(st.players[0].pts,3);
  if(i===8){assert.equal(st.phase,'over');assert.equal(st.senate.length,5);assert.equal(st.over.winner,0);assert.equal(st.players[0].pts,12);assert.equal(st.over.rows.find(r=>r.p===1).qualified,false);}
}
console.log('Tutorial: all 9 teaching positions, glossary links, score changes, turn boundaries and victory checked.');

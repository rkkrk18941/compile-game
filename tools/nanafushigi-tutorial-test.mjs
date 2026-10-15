// Run with node tools/nanafushigi-tutorial-test.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), E=require('../nanafushigi/engine.js'), T=require('../nanafushigi/tutorial-data.js');
const finished=new Map();
let actions=0;
for(const l of T.lessons){
 const s=l.setup(),initial=JSON.stringify(s);
 const rejected=T.act(l,s,{k:'not-a-move',slot:99});
 assert.equal(rejected.ok,false,l.id+' rejects an incorrect action');
 assert.equal(JSON.stringify(s),initial,l.id+' does not mutate on incorrect input');
 let guard=0;
 while(!l.done(s)&&guard++<12){
  // A player should never be asked to act during the opponent's turn.
  assert.equal(s.pend?s.pend.seat:s.active,0,l.id+' belongs to the player');
  const action=l.id==='draft'?E.actions(s,0)[0]:s.pend?{k:'progress',tok:E.T.AGRI}:l.id==='sell'?{k:'discard',slot:0}:l.id==='wonder'?{k:'wonder',slot:0,w:8}:{k:'build',slot:T.target(l,s)};
  assert.ok(E.actions(s,0).some(a=>JSON.stringify(a)===JSON.stringify(action)),l.id+' suggested action is legal');
  const r=T.act(l,s,action);assert.ok(r.ok,l.id+' advances');actions++;
 }
 assert.ok(l.done(s),l.id+' reaches its completion condition');
 const before=JSON.stringify(s);
 assert.equal(T.act(l,s,{k:'build',slot:0}).ok,false,l.id+' stops after completion');
 assert.equal(JSON.stringify(s),before,l.id+' ignores extra input');
 finished.set(l.id,s);
}
const get=id=>finished.get(id);
assert.equal(get('draft').p[0].wonders.length,4);
assert.equal(get('draft').p[1].wonders.length,4);
assert.equal(E.production(get('build').p[0]).fixed.S,1);
assert.equal(get('build').p[0].coins,7);
assert.equal(get('uncover').slots[0].up,true);
assert.equal(get('uncover').p[0].coins,11);
assert.equal(get('uncover').p[1].cards.length,1);
assert.equal(E.production(get('resources').p[0]).fixed.S,1);
assert.equal(E.production(get('resources').p[0]).fixed.W,1);
assert.equal(get('resources').p[0].coins,7);
assert.equal(get('resources').age,2);
assert.equal(get('trade').p[0].coins,4);
assert.equal(get('trade').p[1].coins,7,'normal trade pays the bank');
assert.equal(E.production(get('trade').p[0]).fixed.W,0,'buying does not create permanent production');
assert.equal(get('sell').p[0].coins,3);
assert.equal(get('sell').discard.length,1);
assert.equal(get('sell').p[0].cards.some(id=>E.CARDS[id].name==='宮殿'),false);
assert.equal(E.score(get('chain'))[0].blue,7);
assert.equal(get('chain').p[0].coins,0);
assert.equal(E.score(get('wonder'))[0].wonder,9);
assert.equal(get('wonder').p[0].coins,7,'the foundation does not award tavern coins');
assert.equal(get('wonder').p[0].cards.some(id=>E.CARDS[id].name==='酒場'),false);
assert.equal(get('military').result.how,'military');
assert.equal(get('military').result.winner,0);
assert.equal(E.distinctSci(get('progress').p[0]),1);
assert.equal(get('progress').p[0].coins,13);
assert.equal(get('progress').pend,null);
assert.equal(E.distinctSci(get('science').p[0]),6);
assert.equal(get('science').result.how,'science');
assert.equal(get('score').result.how,'civil');
assert.equal(get('score').result.winner,0);
assert.deepEqual(E.score(get('score')).map(s=>s.total),[11,7]);
// Verify blocked-card protection and a plausible but wrong choice in a lesson.
const blocked=T.lessons.find(l=>l.id==='uncover'),s=blocked.setup();
assert.equal(E.accessible(s,0),false);
const before=JSON.stringify(s);
assert.equal(T.act(blocked,s,{k:'build',slot:0}).ok,false);
assert.equal(JSON.stringify(s),before);
const build=T.lessons.find(l=>l.id==='build'),b=build.setup();
assert.equal(T.act(build,b,{k:'discard',slot:0}).ok,false);
assert.equal(b.p[0].coins,7);
console.log('OK: all '+T.lessons.length+' lessons, '+actions+' guided actions, invalid input, opponent replies, and explained outcomes');


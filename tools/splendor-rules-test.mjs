// 宝石の煌めき — rules tests for splendor/engine.js and the CPU's legality.
// node tools/splendor-rules-test.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../splendor/engine.js'),AI=require('../splendor/ai.js');
let passed=0;
const test=(name,fn)=>{try{fn();passed++;}catch(e){console.error('FAIL',name);throw e;}};
const sum=a=>a.reduce((x,y)=>x+y,0);
const W=0,U=1,G=2,R=3,K=4,GOLD=5;
// a game with a fixed table: market cards and decks can be set by id
function table(n=2,{mk,nb,first=0,seed=1}={}){
 const s=E.newGame({players:n,first,rng:E.mulberry32(seed)});
 if(mk){
  // put the chosen cards face up, everything else back into the decks
  const all=[[],[],[]];for(const c of E.CARDS)if(!mk.includes(c.id))all[c.tier].push(c.id);
  s.dk=all;s.mk=new Array(12).fill(-1);
  for(const id of mk){const t=E.CARDS[id].tier;const slot=s.mk.slice(t*4,t*4+4).indexOf(-1);s.mk[t*4+slot]=id;}
 }
 if(nb)s.nb=nb.slice();
 return s;
}
const card=(tier,color,pts,cost)=>E.CARDS.find(c=>c.tier===tier&&c.color===color&&c.pts===pts&&c.cost.join()===cost.join()).id;
function total(s){ // every token is somewhere
 const t=[0,0,0,0,0,0];for(let c=0;c<6;c++){t[c]=s.bank[c];for(const p of s.pl)t[c]+=p.tok[c];}return t;
}

test('data: 90 cards, 40/30/20, 8/6/4 per colour, 10 nobles',()=>{
 assert.equal(E.CARDS.length,90);
 for(const [t,n] of [[0,40],[1,30],[2,20]])assert.equal(E.CARDS.filter(c=>c.tier===t).length,n);
 for(let c=0;c<5;c++)for(const [t,n] of [[0,8],[1,6],[2,4]])assert.equal(E.CARDS.filter(x=>x.tier===t&&x.color===c).length,n);
 assert.equal(E.NOBLES.length,10);
 assert.equal(E.NOBLES.filter(n=>n.req.filter(x=>x===4).length===2).length,5);
 assert.equal(E.NOBLES.filter(n=>n.req.filter(x=>x===3).length===3).length,5);
 // spot checks against the printed cards
 assert.ok(card(0,K,1,[0,4,0,0,0])>=0);       // onyx, 1 prestige, 4 sapphire
 assert.ok(card(2,R,5,[0,0,7,3,0])>=0);       // ruby, 5 prestige, 7 emerald 3 ruby
 assert.ok(card(1,U,2,[2,0,0,1,4])>=0);       // sapphire, 2 prestige, 2 diamond 1 ruby 4 onyx
 assert.ok(card(0,W,0,[3,1,0,0,1])>=0);       // diamond, 3 diamond 1 sapphire 1 onyx
});

test('setup by player count',()=>{
 for(const [n,g] of [[2,4],[3,5],[4,7]]){
  const s=E.newGame({players:n,rng:E.mulberry32(n)});
  assert.deepEqual(s.bank,[g,g,g,g,g,5]);
  assert.equal(s.nb.length,n+1);
  assert.equal(s.pl.length,n);
  assert.equal(s.mk.filter(x=>x>=0).length,12);
  for(let t=0;t<3;t++){for(let k=0;k<4;k++)assert.equal(E.CARDS[s.mk[t*4+k]].tier,t);}
  assert.deepEqual(s.dk.map(d=>d.length),[36,26,16]);
  const ids=new Set([...s.mk,...s.dk.flat()]);assert.equal(ids.size,90);
 }
 const a=E.newGame({players:3,first:2,rng:E.mulberry32(5)});assert.equal(a.cur,2);assert.equal(a.first,2);
});

test('take three different gems',()=>{
 const s=table();
 assert.equal(E.check(s,{k:'take',g:[W,U,G]}),null);
 assert.ok(E.check(s,{k:'take',g:[W,W,U]}));
 assert.ok(E.check(s,{k:'take',g:[W,U]}),'two different is not allowed while 3+ colours are available');
 assert.ok(E.check(s,{k:'take',g:[W,U,GOLD]}),'gold cannot be taken');
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 assert.deepEqual(s.pl[0].tok,[1,1,1,0,0,0]);assert.deepEqual(s.bank,[3,3,3,4,4,5]);assert.equal(s.cur,1);
});

test('take two of one colour only when 4+ remain',()=>{
 const s=table();
 assert.equal(E.check(s,{k:'take',g:[R,R]}),null);
 E.play(s,{a:{k:'take',g:[R,R]},ret:null,nob:-1});
 assert.equal(s.bank[R],2);
 assert.ok(E.check(s,{k:'take',g:[R,R]}),'only 2 left');
 s.bank[K]=3;assert.ok(E.check(s,{k:'take',g:[K,K]}),'3 left is not enough');
 const l=E.legal(s);assert.ok(!l.some(a=>a.k==='take'&&a.g.length===2&&a.g[0]===a.g[1]&&(a.g[0]===R||a.g[0]===K)));
});

test('fewer than three colours left: one of each remaining colour',()=>{
 const s=table();s.bank=[0,0,0,2,1,5];
 assert.equal(E.check(s,{k:'take',g:[R,K]}),null);
 assert.ok(E.check(s,{k:'take',g:[R]}),'must take both remaining colours');
 const l=E.legal(s).filter(a=>a.k==='take');assert.deepEqual(l.map(a=>a.g),[[R,K]]);
 s.bank=[0,0,0,0,1,5];assert.deepEqual(E.legal(s).filter(a=>a.k==='take').map(a=>a.g),[[K]]);
});

test('reserve: gold, three at most, from a deck face down, no gold left',()=>{
 const s=table();
 const id=s.mk[5];
 E.play(s,{a:{k:'res',m:5},ret:null,nob:-1});
 assert.deepEqual(s.pl[0].res,[id]);assert.deepEqual(s.pl[0].hid,[false]);assert.equal(s.pl[0].tok[GOLD],1);assert.equal(s.bank[GOLD],4);
 assert.ok(s.mk[5]>=0&&s.mk[5]!==id,'slot refilled');
 assert.equal(E.CARDS[s.mk[5]].tier,1);
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 const top=s.dk[2][s.dk[2].length-1];
 E.play(s,{a:{k:'res',d:2},ret:null,nob:-1});
 assert.equal(s.pl[0].res[1],top);assert.equal(s.pl[0].hid[1],true);
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 s.bank[GOLD]=0;
 E.play(s,{a:{k:'res',m:0},ret:null,nob:-1});
 assert.equal(s.pl[0].res.length,3);assert.equal(s.pl[0].tok[GOLD],2,'no gold when none is left');
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 assert.ok(E.check(s,{k:'res',m:1}));assert.ok(!E.legal(s).some(a=>a.k==='res'));
});

test('buy with bonuses, tokens and gold; spent tokens return to the bank',()=>{
 const target=card(1,U,2,[2,0,0,1,4]);
 const s=table(2,{mk:[0,1,2,3,40,41,42,target,70,71,72,73]});
 const p=s.pl[0];
 p.bon=[1,0,0,0,2,];p.bon=[1,0,0,0,2];p.tok=[1,0,0,1,1,2];s.bank=[3,4,4,3,3,3];
 // needs 1 white (has), 1 red (has), 2 black (1 token + 1 gold)
 assert.equal(E.goldNeeded(p,target),1);assert.ok(E.canAfford(p,target));
 assert.deepEqual(E.payment(p,target),[1,0,0,1,1,1]);
 const before=total(s);
 const slot=s.mk.indexOf(target);
 E.play(s,{a:{k:'buy',m:slot},ret:null,nob:-1});
 assert.deepEqual(p.tok,[0,0,0,0,0,1]);assert.deepEqual(p.bon,[1,1,0,0,2]);assert.equal(p.pts,2);assert.equal(p.nc,1);
 assert.deepEqual(total(s),before,'tokens conserved');
 assert.deepEqual(p.cards,[target]);
 assert.ok(s.mk[slot]>=0&&s.mk[slot]!==target);
});

test('cannot buy what you cannot afford; free cards can be bought',()=>{
 const s=table(2,{nb:[]});const p=s.pl[0];
 const id=s.mk[0];
 assert.ok(E.check(s,{k:'buy',m:0}));
 p.bon=[7,7,7,7,7];assert.equal(E.check(s,{k:'buy',m:0}),null);
 E.play(s,{a:{k:'buy',m:0},ret:null,nob:-1});assert.deepEqual(p.tok,[0,0,0,0,0,0]);assert.equal(p.cards[0],id);
});

test('buy a reserved card (also one reserved face down)',()=>{
 const s=table(2,{nb:[]});const p=s.pl[0];
 E.play(s,{a:{k:'res',d:0},ret:null,nob:-1});
 const id=p.res[0];
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 p.bon=[5,5,5,5,5];
 E.play(s,{a:{k:'buy',r:0},ret:null,nob:-1});
 assert.deepEqual(p.res,[]);assert.deepEqual(p.hid,[]);assert.equal(p.cards[0],id);assert.equal(p.tok[GOLD],1,'gold kept when not needed');
});

test('market slot stays empty when its deck runs out',()=>{
 const s=table(2,{nb:[]});s.dk[2]=[];const p=s.pl[0];p.bon=[9,9,9,9,9];
 E.play(s,{a:{k:'buy',m:8},ret:null,nob:-1});assert.equal(s.mk[8],-1);
 assert.ok(E.check(s,{k:'res',d:2}));assert.ok(!E.legal(s).some(a=>a.k==='res'&&a.d===2));
 assert.ok(E.check(s,{k:'buy',m:8}));
});

test('ten-token limit: return exactly the excess, may return what was just taken',()=>{
 const s=table();const p=s.pl[0];p.tok=[2,2,2,2,1,0];s.bank=[2,2,2,2,3,5];
 const a={k:'take',g:[W,U,G]};
 assert.throws(()=>E.play(s,{a,ret:null,nob:-1}),/返/);
 assert.throws(()=>E.play(s,{a,ret:[1,0,0,0,0,0],nob:-1}),/2個/);
 assert.throws(()=>E.play(s,{a,ret:[1,1,1,0,0,0],nob:-1}),/2個/,'not more than the excess');
 assert.throws(()=>E.play(s,{a,ret:[0,0,0,0,0,2],nob:-1}),/持っていない/);
 E.play(s,{a,ret:[0,0,0,1,1,0],nob:-1});
 assert.deepEqual(p.tok,[3,3,3,1,0,0]);assert.equal(E.tokenCount(p),10);
 assert.deepEqual(total(s),[4,4,4,4,4,5]);
 // gold can be returned too, and a reservation can push over the limit
 const t=table();const q=t.pl[0];q.tok=[2,2,2,2,2,0];t.bank=[2,2,2,2,2,5];
 E.play(t,{a:{k:'res',m:0},ret:[0,0,0,0,0,1],nob:-1});assert.equal(q.tok[GOLD],0);assert.equal(E.tokenCount(q),10);
 // no return when not over the limit
 const u=table();assert.throws(()=>E.play(u,{a:{k:'take',g:[W,U,G]},ret:[1,0,0,0,0,0],nob:-1}));
});

test('nobles: end of turn, only bonuses count, one per turn, choice, cannot refuse',()=>{
 // nobles 4 (W4 U4) and 9 (W3 U3 G3)
 const s=table(2,{nb:[4,9,0]});const p=s.pl[0];
 p.bon=[4,4,3,0,0];p.tok=[0,0,0,0,0,0];
 assert.deepEqual(E.eligible(s,0).sort(),[4,9]);
 assert.throws(()=>E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1}),/貴族/,'must choose among several');
 const r=E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:9});
 assert.equal(r.fin.noble,9);assert.equal(p.pts,3);assert.deepEqual(p.nob,[9]);assert.deepEqual(s.nb.sort(),[0,4]);
 // the other one comes at the end of the next turn, even without buying
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 const r2=E.play(s,{a:{k:'take',g:[R,K,W]},ret:null,nob:-1});
 assert.equal(r2.fin.noble,4,'single eligible noble visits automatically');assert.equal(p.pts,6);
 // tokens do not count
 const t=table(2,{nb:[4]});t.pl[0].tok=[4,4,0,0,0,0];
 E.play(t,{a:{k:'take',g:[G,R,K]},ret:[0,0,0,0,1,0],nob:-1});assert.equal(t.pl[0].pts,0);
});

test('end of game: finish the round; most prestige; fewer cards breaks ties',()=>{
 // 3 players, seat 1 starts: order 1,2,0. Seat 2 reaches 15 → seat 0 still plays, then the game ends.
 const s=table(3,{first:1,nb:[]});
 s.pl[2].pts=14;s.pl[2].bon=[9,9,9,9,9];
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1}); // seat 1
 const id=s.mk.find(x=>x>=0&&E.CARDS[x].pts>=1);const slot=s.mk.indexOf(id);
 E.play(s,{a:{k:'buy',m:slot},ret:null,nob:-1}); // seat 2 → 15+
 assert.ok(s.fin);assert.ok(!s.over);assert.equal(s.cur,0);
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1}); // seat 0, last of the round
 assert.ok(s.over);
 assert.deepEqual(E.result(s).winners,[2]);
 // the last seat of the round ends the game at once
 const t=table(2,{first:0,nb:[]});t.pl[1].pts=14;t.pl[1].bon=[9,9,9,9,9];
 E.play(t,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});
 const id2=t.mk.find(x=>x>=0&&E.CARDS[x].pts>=1);E.play(t,{a:{k:'buy',m:t.mk.indexOf(id2)},ret:null,nob:-1});
 assert.ok(t.over);
 // tie on prestige: fewer development cards wins; complete tie shares the win
 const u=table(3);u.over=true;u.pl[0].pts=16;u.pl[0].nc=9;u.pl[1].pts=16;u.pl[1].nc=8;u.pl[2].pts=12;
 assert.deepEqual(E.result(u).winners,[1]);
 u.pl[0].nc=8;assert.deepEqual(E.result(u).winners.sort(),[0,1]);
 assert.deepEqual(E.result(u).order.map(o=>o.rank),[1,1,3]);
});

test('pass only without any legal action; everyone passing ends the game',()=>{
 const s=table();s.bank=[0,0,0,0,0,0];s.dk=[[],[],[]];
 for(const p of s.pl){p.res=[0,1,2];p.hid=[false,false,false];}
 s.mk=s.mk.map(()=>-1);
 assert.deepEqual(E.legal(s),[{k:'pass'}]);
 E.play(s,{a:{k:'pass'},ret:null,nob:-1});assert.ok(!s.over);
 E.play(s,{a:{k:'pass'},ret:null,nob:-1});assert.ok(s.over);
 const t=table();assert.ok(E.check(t,{k:'pass'}));
});

test('views hide other seats\' face-down reservations and the decks; determinize is consistent',()=>{
 const s=table(3);
 E.play(s,{a:{k:'res',d:2},ret:null,nob:-1});
 E.play(s,{a:{k:'res',m:3},ret:null,nob:-1});
 const hiddenId=s.pl[0].res[0],openId=s.pl[1].res[0];
 const v1=E.view(s,1),v0=E.view(s,0);
 assert.equal(v1.pl[0].res[0],E.HIDDEN+2);assert.equal(v1.pl[1].res[0],openId);
 assert.equal(v0.pl[0].res[0],hiddenId,'own face-down card is known');
 assert.ok(v1.dk.every((d,t)=>d.every(x=>x===E.HIDDEN+t)));
 assert.equal(JSON.stringify(v1).includes(String(hiddenId)+','),JSON.stringify(v1).includes(String(hiddenId)+','));
 for(let k=0;k<50;k++){
  const d=E.determinize(v1,E.mulberry32(k));
  const ids=[...d.mk.filter(x=>x>=0),...d.dk.flat(),...d.pl.flatMap(p=>[...p.res,...p.cards])];
  assert.equal(ids.length,90);assert.equal(new Set(ids).size,90);
  assert.equal(E.CARDS[d.pl[0].res[0]].tier,2);
  assert.deepEqual(d.dk.map(x=>x.length),s.dk.map(x=>x.length));
 }
});

test('deadlock safeguard ends a game with no purchase or reservation for 12 rounds',()=>{
 const s=table(2,{nb:[]});
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});assert.equal(s.idle,1);
 E.play(s,{a:{k:'res',m:0},ret:null,nob:-1});assert.equal(s.idle,0,'a reservation resets it');
 s.idle=E.IDLE_ROUNDS*2-2;
 E.play(s,{a:{k:'take',g:[W,U,G]},ret:null,nob:-1});assert.ok(!s.over);
 E.play(s,{a:{k:'take',g:[R,K,W]},ret:null,nob:-1});assert.ok(s.over);assert.ok(s.stalled);
 const t=table(2,{nb:[]});t.idle=E.IDLE_ROUNDS*2-1;t.pl[0].bon=[9,9,9,9,9];
 E.play(t,{a:{k:'buy',m:0},ret:null,nob:-1});assert.ok(!t.over,'a purchase resets it');assert.equal(t.idle,0);
});

test('CPU at every level plays only legal turns (2-4 players, view only)',()=>{
 for(const n of [2,3,4])for(const lv of [1,2,3]){
  const s=E.newGame({players:n,rng:E.mulberry32(100+n*10+lv)}),rng=E.mulberry32(7);
  let plies=0;
  while(!s.over&&plies<300){const turn=AI.choose(E.view(s,s.cur),lv,rng);E.play(s,turn);plies++;}
  assert.ok(s.over,'game finishes');
  const t=total(s);assert.deepEqual(t,[E.gemsFor(n),E.gemsFor(n),E.gemsFor(n),E.gemsFor(n),E.gemsFor(n),5]);
 }
 // search levels with a small budget
 for(const lv of [4,5]){
  const s=E.newGame({players:2,rng:E.mulberry32(77+lv)}),rng=E.mulberry32(9);
  for(let i=0;i<8&&!s.over;i++){const turn=AI.choose(E.view(s,s.cur),lv,rng,{ms:60});E.play(s,turn);}
 }
});

test('CPU takes a winning purchase and blocks with the last move only when it helps',()=>{
 // seat 0 at 13 with a 2-prestige card affordable, final seat of the round: buying wins
 const s=table(2,{first:1,nb:[]});s.cur=0;s.fin=false;
 s.pl[0].pts=13;s.pl[0].bon=[9,9,9,9,9];s.pl[1].pts=14;
 const id=s.mk.find(x=>x>=0&&E.CARDS[x].pts>=2);
 const turn=AI.choose(E.view(s,0),3,E.mulberry32(1));
 assert.equal(turn.a.k,'buy');
 const bought=turn.a.m!=null?s.mk[turn.a.m]:s.pl[0].res[turn.a.r];
 assert.ok(E.CARDS[bought].pts>=2,'buys enough prestige to win');
});

console.log(`splendor rules: ${passed} tests passed`);

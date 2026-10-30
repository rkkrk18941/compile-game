const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../shady-lady/engine.js');
const AI = require('../shady-lady/ai.js');
const players = n => Array.from({length:n}, (_,i) => ({name:`P${i}`,kind:'cpu',level:1+i%3}));
function rig(st, seat, ns) {
  const used = st._rigUsed || (st._rigUsed = new Set());
  ns.forEach((n,k) => {
    let id = E.NUMS.indexOf(n)*10;
    while (used.has(id)) id++;
    used.add(id);
    const hand = st.players[seat].hand;
    if (hand[k] === id) return;
    for (const a of [st.deck,...st.players.map(p=>p.hand),...st.players.map(p=>p.pile)]) {
      const j=a.indexOf(id);
      if(j>=0) { a[j]=hand[k]; hand[k]=id; break; }
    }
  });
}
function move(st,p,a) { const r=E.apply(st,p,a); assert.ok(r.ok,JSON.stringify(a)+': '+r.err); assert.ok(E.census(st)); return r; }
assert.equal(E.setsFor(4).length,10);
for(const ns of [[1,2,3,4],[9,7,8,6],[7,7,7,7]]) assert.ok(E.combo(ns));
for(const ns of [[1,2,3,9],[7,7,7,8],[3,4,6,7]]) assert.equal(E.combo(ns),null);
assert.ok(E.combo([1,1,1,1]).s>E.combo([6,7,8,9]).s);
for(let n=2;n<=6;n++) {
  const st=E.newGame({players:players(n),seed:n,handSize:4,first:0});
  assert.equal(st.deck.length,80-4*n);
  assert.ok(st.players.every(p=>p.hand.length===4));
  const v=E.viewFor(st,1); assert.equal(v.handSize,4); assert.equal(v.players[0].hand,undefined);
  move(st,0,{t:'draw'}); assert.equal(st.players[0].hand.length,5);
  move(st,0,{t:'discard',card:st.players[0].hand[0]}); assert.equal(st.players[0].hand.length,4);
}
{
  const st=E.newGame({players:players(3),seed:10,handSize:4,first:0});
  rig(st,0,[1,2,3,4]); rig(st,1,[6,7,8,9]); rig(st,2,[7,7,7,8]);
  const passed=st.players[2].hand.slice();
  move(st,0,{t:'try'}); assert.ok(E.canBeat(E.viewFor(st,1)));
  move(st,1,{t:'respond',reveal:true}); assert.equal(E.canBeat(E.viewFor(st,2)),false);
  assert.equal(E.apply(st,2,{t:'respond',reveal:true}).err,'weak');
  move(st,2,{t:'respond',reveal:false}); assert.equal(st.players[1].pts,1);
  const h0=st.players[0].hand.slice(),h1=st.players[1].hand.slice();
  move(st,0,{t:'order',cards:h0.slice().reverse()});
  const r=move(st,1,{t:'order',cards:h1});
  assert.ok(st.players.every(p=>p.hand.length===4));
  assert.deepEqual(st.players[2].hand,passed);
  assert.equal(st.players[0].pile.at(-1),h0.at(-1));
  assert.equal(st.players[1].pile.at(-1),h1[0]);
  assert.ok(r.ev.filter(e=>e.t==='refill').every(e=>e.priv.ids.length===4));
  assert.ok(E.evFor(r.ev,2).every(e=>!e.priv));
  const restored=JSON.parse(JSON.stringify(st)); assert.equal(E.viewFor(restored,0).handSize,4);
}
for(const hit of [false,true]) {
  const st=E.newGame({players:players(2),seed:12,handSize:4,first:0});
  rig(st,1,hit?[8,8,8,8]:[8,8,8,9]);
  move(st,0,{t:'jack',target:1}); assert.equal(st.players[hit?0:1].pts,1);
  move(st,1,{t:'order',cards:st.players[1].hand.slice()}); assert.equal(st.players[1].hand.length,4);
}
{
  const legacy=E.newGame({players:players(2),seed:2}); delete legacy.handSize;
  assert.equal(E.viewFor(legacy,0).handSize,3);
}
// Execute the actual action renderer and network sanitizer with a minimal DOM.
const app=fs.readFileSync(require.resolve('../shady-lady/app.js'),'utf8');
function source(start,end) { return app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start))); }
for(const ns of [[7,7,7,8],[1,2,3,4],[9,9,9,9]]) {
  const st=E.newGame({players:players(2),seed:9,first:0,handSize:4});
  rig(st,0,[6,7,8,9]); rig(st,1,ns); move(st,0,{t:'try'});
  const elements={'#dock':{},'#hint':{}};
  const ctx={E,V:E.viewFor(st,1),S:{},U:{rev:[],wait:false},busy:false,
    $:s=>elements[s],setLabel:()=>'',ptsHtml:()=>'',esc:String,pname:()=> 'P0',
    renderPickable:()=>{},canAct:()=>true,maybeOrder:()=>{}};
  vm.createContext(ctx);
  vm.runInContext(source('function myCombo()', 'let orderOpen'),ctx);
  vm.runInContext('renderAct()',ctx);
  assert.match(elements['#dock'].innerHTML,/data-act="pass"/);
  if(ns[0]===9) assert.match(elements['#dock'].innerHTML,/data-act="reveal"/);
  else assert.match(elements['#hint'].innerHTML,/パス/);
}
assert.doesNotMatch(source('function myCombo()','let orderOpen'),/setTimeout|autoPass/);
{
  const ctx={}; vm.createContext(ctx);
  vm.runInContext(source('function cleanAct(', 'function onHostLeave'),ctx);
  assert.equal(vm.runInContext("cleanAct({t:'order',cards:[1,2,3,4]}).cards.length",ctx),4);
}
let total=0,maxDecision=0;
for(let g=0;g<15;g++) {
  const n=2+g%5,st=E.newGame({players:players(n),seed:100+g,handSize:4});
  const rnd=E.mulberry32(1000+g);
  let steps=0;
  while(st.phase!=='over' && steps++<4000) {
    const p=E.waitingFor(st)[0],start=Date.now();
    const act=AI.decide(E.viewFor(st,p),st.players[p].level,rnd);
    maxDecision=Math.max(maxDecision,Date.now()-start);
    assert.ok(act); move(st,p,act);
    if(st.phase!=='discard') assert.ok(st.players.every(P=>P.hand.length===4));
  }
  assert.ok(st.winner>=0,`game ${g} did not finish`); total+=steps;
}
console.log(`PASS: 4-card rules, refill, privacy, legacy saves, manual response UI, online ordering; 15 full CPU games (${total} moves, max decision ${maxDecision} ms).`);

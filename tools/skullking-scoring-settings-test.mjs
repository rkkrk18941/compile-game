import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), E=require('../skull-king/engine.js');
const opts=E.normOpts({},4);
assert.deepEqual([opts.bidReward,opts.bidPenalty,opts.zeroReward,opts.zeroPenalty],[20,20,10,10]);
const score=(bid,won,o=opts,cards=5)=>E.roundScore({bid,won,cards,bonus:0,loot:0,wager:0},o).total;
assert.equal(score(3,3),60);assert.equal(score(3,1),-40);assert.equal(score(3,4),-20);
const custom=E.normOpts({bidReward:'35',bidPenalty:'45',zeroReward:'7',zeroPenalty:'12'},4);
assert.equal(score(3,3,custom),105);assert.equal(score(3,1,custom),-90);assert.equal(score(3,4,custom),-45);
assert.equal(score(0,0,custom),35);assert.equal(score(0,2,custom),-60);
const zero=E.normOpts({bidReward:0,bidPenalty:0,zeroReward:0,zeroPenalty:0},4);
for(const [bid,won] of [[0,0],[0,1],[1,0],[2,2]])assert.equal(score(bid,won,zero)+0,0);
for(const bad of ['',null,false,-1,1.5,Infinity,'NaN',{},1000001])assert.equal(E.normOpts({bidPenalty:bad},4).bidPenalty,20);
assert.equal(score(3,4,{scoring:'classic'}),-20,'old settings objects fall back to the new default');
assert.equal(score(3,4,{...custom,scoring:'rascal'}),25,'Rascal scoring remains its separate scoring system');
assert.equal(E.roundScore({bid:2,won:2,cards:5,bonus:30,loot:1,wager:10},custom).total,130,'custom base plus bonuses and wager');

// A complete deterministic round verifies the chosen rates reach history and totals.
const st=E.newGame({players:[{name:'A'},{name:'B'},{name:'C'}],opts:{...custom,schedule:'bedtime'},seed:71,first:0});
st.hands=[[67],[0],[1]];
assert(E.apply(st,0,{t:'bid',n:1}));assert(E.apply(st,1,{t:'bid',n:1}));assert(E.apply(st,2,{t:'bid',n:0}));
assert.deepEqual(E.view(st,1).opts,customWithSchedule('bedtime'));
for(const [seat,id] of [[0,67],[1,0],[2,1]])assert(E.apply(st,seat,{t:'play',id}));
assert.deepEqual(st.scores,[35,-45,7]);assert.deepEqual(st.history[0].results.map(x=>x.base),[35,-45,7]);
function customWithSchedule(schedule){return {...custom,schedule};}
assert.deepEqual(JSON.parse(JSON.stringify(st)).opts,st.opts,'settings survive save/online JSON transport');

const appSource=fs.readFileSync(new URL('../skull-king/app.js',import.meta.url),'utf8');
function extract(name){const start=appSource.indexOf('  function '+name+'(');assert(start>=0);const end=appSource.indexOf('\n  function ',start+1);return appSource.slice(start,end<0?undefined:end);}
const ui=vm.createContext({E,esc:String});
for(const name of ['classicScoreText','optsHTML','bindOpts'])vm.runInContext(extract(name),ui);
const edit=ui.optsHTML(custom,4,true),guest=ui.optsHTML(custom,4,false);
assert.match(edit,/data-opt="bidReward"[^>]*value="35"/);assert.match(edit,/data-opt="bidPenalty"[^>]*value="45"/);
assert.match(edit,/data-opt="zeroReward"[^>]*value="7"/);assert.match(edit,/data-opt="zeroPenalty"[^>]*value="12"/);
assert.match(guest,/1ビッド＋35点/);assert.match(guest,/1ずれ−45点/);assert(!guest.includes('data-opt='),'guests see scores without editable inputs');
let current={},stored,callbacks={};ui.bindOpts({addEventListener:(name,fn)=>callbacks[name]=fn},()=>current,o=>{stored=o;current=o;});
callbacks.change({target:{dataset:{opt:'bidPenalty'},type:'number',valueAsNumber:0,hasAttribute:()=>true,checkValidity:()=>true}});
assert.equal(stored.bidPenalty,0,'zero is saved as a number');
stored=null;let reported=false;
callbacks.change({target:{dataset:{opt:'bidPenalty'},hasAttribute:()=>true,checkValidity:()=>false,reportValidity:()=>{reported=true;}}});
assert(reported);assert.equal(stored,null,'invalid values are not saved');
callbacks.click({target:{closest:selector=>selector==='[data-score-reset]'?{}:null}});
assert.deepEqual({...stored},{...E.SCORE_DEFAULTS});

// Old saved games keep their original -10 rule; new saved custom settings survive.
const tableSource=appSource.slice(appSource.indexOf('  function Table('),appSource.indexOf('  Table.prototype.isCpu'));
const saved=vm.createContext({E});vm.runInContext(tableSource,saved);
const oldGame=E.newGame({players:[{name:'A'},{name:'B'}]});delete oldGame.opts.bidPenalty;
assert.equal(new saved.Table([],{state:oldGame}).st.opts.bidPenalty,10);
assert.equal(new saved.Table([],{state:JSON.parse(JSON.stringify(st))}).st.opts.bidPenalty,45);
const worker=fs.readFileSync(new URL('../skull-king/cpu-worker.js',import.meta.url),'utf8');
assert.match(worker,/engine\.js\?v=20261021-score/,'workers load the matching scoring engine');
console.log('Scoring settings passed: defaults, custom/zero rates, complete-round totals, JSON transport, CPU/lobby controls, validation, reset and saved-game compatibility.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), D=require('../nurie-rush/deck.js');
const values=new Map();
const context=vm.createContext({NR_DECK:D,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout,clearTimeout,AbortController,fetch:async()=>{throw Error('offline');}});
vm.runInContext(fs.readFileSync(new URL('../nurie-rush/ranking.js',import.meta.url),'utf8'),context);
const R=context.NR_RANK;
function attempt(version,correct,rt=1000,mode='basic'){
 return {version,name:'テスト',mode,answers:D.CARDS.map((card,i)=>{const q=D.required(card,mode==='call');return {card:i,type:q.type,item:i<correct?q.item:D.ANIMALS.find(x=>x!==q.item),rt};})};
}
for(const mode of ['basic','call'])for(let n=0;n<=60;n++){
 const result=R.summary(attempt(2,n,1000,mode));assert.equal(result.correct,n);assert.equal(result.scoreMs,60000+(60-n)*6000);
}
await assert.rejects(R.submit(attempt(1,60,2000)),/offline/);
await assert.rejects(R.submit(attempt(2,59,1000)),/offline/);
assert.equal(R.pending().length,2,'offline records from different versions do not overwrite each other');
await assert.rejects(R.submit(attempt(2,60,2000)),/offline/);
assert.equal(R.pending().find(x=>x.version===2).answers[0].rt,1000,'worse adjusted time does not replace a pending best');
await assert.rejects(R.submit(attempt(2,58,800)),/offline/);
assert.equal(R.summary(R.pending().find(x=>x.version===2)).scoreMs,60000);
let urls=[];context.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>({updated:true,entries:[]})};};
await R.retryPending();assert.equal(R.pending().length,0);
await R.list('basic','テスト');assert.match(urls.at(-1),/version=2/);
await R.list('basic','テスト',1);assert.match(urls.at(-1),/version=1/);

// Run the actual timing/pause functions with a controlled clock and minimal UI.
const source=fs.readFileSync(new URL('../nurie-rush/app.js',import.meta.url),'utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');assert(start>=0);const end=source.indexOf('\n  function ',start+1);return source.slice(start,end<0?undefined:end);}
let t=1000,interval;const element={textContent:'',hidden:false,classList:{add(){}}};
const M={mode:'ranking',paused:false,rank:{total:0,cardStartedAt:null,results:[]},round:{card:0,faceAt:1000,done:false,mine:{}},g:{callMode:false,round:{card:0,done:false},deck:[1]},faces:()=>[]};
const observed=[];   // ranking answers are also handed to the reflex drill's card records
const timing=vm.createContext({M,now:()=>t,setInterval:fn=>(interval=fn,1),clearInterval(){},$:id=>id==='table'?{querySelector:()=>null}:element,clockText:String,stopTimers(){},setBack(){},clearMarks(){},banner(){},lockAll(){},setLeft(){},voidRound(){M.g.deck.unshift(M.round.card);M.round=null;},nextRound(){},E:{need:()=>({type:'grab',item:D.ANIMALS[0]})},rememberAnswer(){},lockTable(){},showAnswer(){},Snd:{ok(){},bad(){}},A:{icon:()=>''},esc:String,D,sec:String,trainingReason:()=>'',later(){},rand:()=>0,buzz(){},
 DR:{observe:(data,call,card,ok,rt)=>observed.push({card,ok,rt})},DRD:{},saveDrill(){}});
for(const name of ['rankingTick','rankingTouch','pauseLocal','resumeLocal'])vm.runInContext(extract(name),timing);
timing.rankingTick();assert.equal(M.rank.cardStartedAt,1000);
t=1500;timing.pauseLocal();assert.equal(M.rank.cardStartedAt,1000);
t=11500;timing.resumeLocal();M.round={card:0,faceAt:12500,done:false,mine:{}};M.g.round={done:false};timing.rankingTick();
t=13000;interval();assert.equal(element.textContent,'12000','the displayed clock includes time spent paused');
timing.rankingTouch('grab',D.ANIMALS[0],500);assert.equal(M.rank.results[0].rt,12000,'answer submission includes paused time and resume delay');assert.equal(M.rank.cardStartedAt,null);
t=50000;M.round={card:1,faceAt:50000,done:false,mine:{}};M.g.round={done:false};timing.rankingTick();
t=51000;timing.rankingTouch('grab',D.ANIMALS[0],1000);assert.equal(M.rank.results[1].rt,1000,'answer explanations are excluded from the next card');
t=60000;M.round={card:2,faceAt:60500,done:false,mine:{}};M.g.round={done:false};timing.rankingTick();timing.pauseLocal();assert.equal(M.rank.cardStartedAt,null,'pausing before the first visible question does not start its clock');
assert.deepEqual(observed,[{card:0,ok:true,rt:12000},{card:1,ok:true,rt:1000}],'each ranking answer reaches the drill records with the same time');
console.log('Client ranking passed: 122 basic/advanced score cases, versioned offline retries, strict improvements, API selection, pause accounting and explanation exclusion.');

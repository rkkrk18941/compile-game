import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../nurie-rush/',import.meta.url),values=new Map();let online=false,sent=[];
const window={localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout,clearTimeout,fetch:async(url,o)=>{if(!online)throw Error('offline');if(o.method==='POST')sent.push(JSON.parse(o.body));return {ok:true,json:async()=>o.method==='POST'?{updated:true}:{entries:[],total:0,self:null}};}};
const context=vm.createContext({window,console,URLSearchParams});for(const file of ['deck.js','ranking.js'])vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),context);
const R=window.NR_RANK,D=window.NR_DECK;
function attempt(name='太郎',correct=60,rt=1000,mode='basic'){return {version:1,name,mode,answers:D.CARDS.map((c,card)=>{const q=D.required(c,mode==='call');return {card,type:q.type,item:card<correct?q.item:D.ANIMALS.find(x=>x!==q.item),rt};})};}
assert.equal(R.cleanName(' ＡＢＣ  太郎 '),'ABC 太郎');assert.equal(R.cleanName('a\u200bb'),'ab');
assert(R.better({correct:60,totalMs:100000},{correct:59,totalMs:1},1));assert(!R.better({correct:59,totalMs:1},{correct:60,totalMs:100000},1));assert(!R.better({correct:60,totalMs:1000},{correct:60,totalMs:1000}));
assert.equal(R.summary(attempt()).correct,60);assert.equal(R.summary(attempt('太郎',59)).correct,59);assert.equal(R.summary(attempt('太郎',60,1000,'call')).correct,60);
const a=attempt();await assert.rejects(R.submit(a));assert.equal(R.pending().length,1);
await assert.rejects(R.submit(attempt('太郎',59,1)));assert.equal(R.summary(R.pending()[0]).correct,60,'accuracy takes precedence in the retry queue');
await assert.rejects(R.submit(attempt('太郎',60,2000)));assert.equal(R.summary(R.pending()[0]).totalMs,60000,'slower same-name record does not replace pending best');
await assert.rejects(R.submit(attempt('太郎',60,900)));assert.equal(R.summary(R.pending()[0]).totalMs,54000);
await assert.rejects(R.submit(attempt('太郎',60,800,'call')));assert.equal(R.pending().length,2,'basic and call histories stay separate');
online=true;assert.equal(await R.retryPending(),2);assert.equal(R.pending().length,0);assert.equal(sent.length,2);assert.equal((await R.list('basic','太郎')).total,0);
const invalid=attempt();invalid.answers[59].card=0;assert.equal(R.summary(invalid),null);values.set('obake.ranking.pending.v1',JSON.stringify([invalid]));assert.equal(R.pending().length,0,'corrupt pending entries do not stop valid future submissions');
console.log('Ranking client passed: accuracy/time comparison, exact ties, name normalization, complete-deck scoring, basic/call separation, offline best retention, retry and corrupt-entry recovery.');


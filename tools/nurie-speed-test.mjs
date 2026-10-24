// Full app + DOM, with a deterministic clock: test the real schedule without waiting 150 seconds.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let parseHTML;
try { ({parseHTML}=require('linkedom')); } catch (error) {
 if (!process.env.NURIE_TEST_NODE_MODULES) throw new Error('Install linkedom or set NURIE_TEST_NODE_MODULES to a node_modules directory.', {cause:error});
 ({parseHTML}=require(process.env.NURIE_TEST_NODE_MODULES+'/linkedom'));
}
const root=new URL('../nurie-rush/',import.meta.url);
function harness(){
 const {window:w}=parseHTML(fs.readFileSync(new URL('index.html',root),'utf8')), d=w.document;
 let time=1000, wall=1700000000000, id=0;const timers=new Map();
 const setTimer=(fn,ms,repeat=false)=>{const k=++id;timers.set(k,{fn,at:time+Math.max(1,ms||0),repeat:repeat?ms:0});return k;};
 class ClockDate extends Date { static now(){return wall;} }
 const store=new Map([['nurie.v1',JSON.stringify({sound:false})]]);
 const ctx=vm.createContext({window:w,document:d,location:{search:'?test=1',origin:'https://test.invalid',pathname:'/nurie-rush/'},
  URLSearchParams,console,Date:ClockDate,performance:{now:()=>time},navigator:{},matchMedia:()=>({matches:false}),
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},sessionStorage:{getItem:()=>null,setItem(){}},
  setTimeout:(fn,ms)=>setTimer(fn,ms),clearTimeout:k=>timers.delete(k),setInterval:(fn,ms)=>setTimer(fn,ms,true),clearInterval:k=>timers.delete(k),
  requestAnimationFrame:fn=>setTimer(fn,16),cancelAnimationFrame:k=>timers.delete(k),AbortController,fetch:async()=>{throw Error('offline');}});
 w.matchMedia=ctx.matchMedia;w.NR_NET={makeCid:()=> 'test',cleanCode:s=>s,cleanName:s=>s};w.NR_LAYOUT={init(){},attach(){},open(){}};
 for(const f of ['deck.js','art.js','engine.js','training.js','drill.js','ranking.js','app.js'])vm.runInContext(fs.readFileSync(new URL(f,root),'utf8'),ctx,{filename:f});
 return {w,d,nr:w.__NR,click(sel){const el=d.querySelector(sel);assert(el,sel);el.dispatchEvent(new w.Event('click',{bubbles:true}));},
 advance(ms){const end=time+ms;let count=0;while(true){let next;for(const [k,v] of timers)if(v.at<=end&&(!next||v.at<next[1].at))next=[k,v];if(!next)break;assert(++count<100000);wall+=next[1].at-time;time=next[1].at;if(next[1].repeat)next[1].at+=next[1].repeat;else timers.delete(next[0]);next[1].fn();}wall+=end-time;time=end;},
 jump(ms){time+=ms;wall+=ms;},sleep(ms){wall+=ms;},answer(ok=true){const M=w.__NR.M,q=w.__NR.E.need(M.g,M.round.card);w.__NR.humanTouch(0,q.type,ok?q.item:w.__NR.D.ANIMALS.find(x=>x!==q.item));},timers};
}
for(const [button,kind,interval,duration] of [['#goSpeed','fast',1500,90000],['#goUltraSpeed','ultra',1000,60000]]){
 const h=harness();h.click(button);assert.equal(h.d.querySelector('#scrSpeed').hidden,false);assert.match(h.d.querySelector('#speedNote').textContent,new RegExp(String(duration/1000)));
 h.click('#speedStart');const M=h.nr.M;assert.equal(M.speed.kind,kind);assert.equal(M.round.n,1,'first card exists synchronously when Start returns');assert(h.d.querySelector('#flip').classList.contains('instant'));assert(h.d.querySelector('#flip').classList.contains('up'));assert.equal(M.speed.results.length,0);
 const seen=new Set([M.round.card]);
 for(let i=0;i<60;i++){
  if(i%3!==2){h.advance(100);h.answer(i%3===0);h.answer();assert.equal(M.speed.results.length,i+1,'only the first answer counts');h.advance(interval-101);}else h.advance(interval-1);
  assert.equal(M.round.n,i+1,'answer and feedback cannot advance the card early');assert.equal(M.g.over,false,'game is live until the exact deadline');
  h.advance(1);
  if(i<59){assert.equal(M.round.n,i+2,'next card is visible on its absolute boundary');seen.add(M.round.card);}else assert.equal(M.g.over,true);
 }
 assert.equal(seen.size,60,'every card occurs once');assert.equal(M.speed.results.length,60);assert.equal(M.speed.results.filter(x=>x.ok).length,20);assert.equal(M.speed.results.filter(x=>x.missed).length,20);assert.equal(h.d.querySelector('#clock').textContent,'残り 0:00.0');assert(h.d.querySelector('.modal .result-title'));
 h.click('[data-speed="again"]');assert.equal(h.nr.M.speed.kind,kind);assert.equal(h.nr.M.round.n,1);h.click('#btnMenu');h.click('[data-speed-menu="quit"]');assert.equal(h.nr.M,null);assert.equal(h.d.querySelector('#app').classList.contains('speeding'),false);h.advance(duration+1000);assert.equal(h.nr.M,null,'quit cancels all challenge timers');
}
{
 const h=harness();h.nr.startSpeed('fast');const M=h.nr.M;h.click('#btnMenu');h.advance(4500);assert.equal(M.round.n,4);assert.equal(M.paused,false);assert.equal(M.speed.results.length,3);h.advance(85500);assert.equal(M.g.over,true);assert(h.d.querySelector('.result-title'),'results replace an open menu at the deadline');assert.equal(M.speed.results.length,60);
}
{
 const h=harness();h.nr.startSpeed('ultra');const old=h.nr.M.round;h.jump(3200);h.answer();assert.notEqual(h.nr.M.round,old);assert.equal(h.nr.M.round.n,4);assert.equal(h.nr.M.speed.results.length,3,'queued late tap cannot answer a new card');h.sleep(56800);h.nr.speedTick();assert(h.nr.M.g.over,'device sleep does not extend the deadline');assert.equal(h.nr.M.speed.results.length,60);
}
{
 const h=harness();h.click('#goUltraSpeed');h.d.querySelector('#speedCall').checked=true;h.d.querySelector('#speedCall').dispatchEvent(new h.w.Event('change'));h.click('#speedStart');assert(h.nr.M.g.callMode);assert.equal(h.d.querySelector('#callRow').hidden,false);
 h.advance(100);h.answer();assert.equal(h.nr.M.speed.results[0].ok,true);h.jump(65000);h.d.dispatchEvent(new h.w.Event('visibilitychange'));assert(h.nr.M.g.over);h.click('[data-speed="setup"]');assert.equal(h.d.querySelector('#scrSpeed').hidden,false);h.click('[data-back]');h.click('#goSolo');h.click('#soloStart');assert.equal(h.nr.M.mode,'cpu');assert.equal(h.d.querySelector('#app').classList.contains('speeding'),false);
}
console.log('Speed modes passed: full 90s/60s schedules, 60 unique cards, instant reveal, one answer, misses, fixed feedback time, deadline, retry/quit, continuous menu, throttling, stale taps, device sleep, advanced rules and CPU return.');

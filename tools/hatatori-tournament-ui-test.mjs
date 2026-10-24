// DOM integration (no GPU/network service): npm install --no-save linkedom
// node --experimental-vm-modules tools/hatatori-tournament-ui-test.mjs
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.HTN_DOM_MODULE || 'linkedom');
const root=path.resolve(import.meta.dirname,'../hatatori-nine');
const tick=()=>new Promise(r=>setTimeout(r,2));
async function until(fn,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await tick();}throw Error('Timed out: '+label);}
const harnesses=[];
async function harness(saved=[]){
 const {window:domWindow}=parseHTML(await fs.readFile(path.join(root,'index.html'),'utf8'));const document=domWindow.document;const window={document,Event:domWindow.Event,addEventListener(){}};
 const errors=[],timers=new Set(),intervals=new Set(),storage=new Map([['htn.fx','"off"'],['htn.sound','false'],['htn.bgm','false'],...saved]);
 const style=()=>{};const noop=()=>{};
 const themeChanges=[];
 const scene=new Proxy({refreshFonts:()=>themeChanges.push(document.body.dataset.cardStyle),busy:false,setAttract:noop,screenOf:()=>null,flagScreen:()=>null,flagAnchor:(f)=>[f*40,100],resize:noop},{get:(t,k)=>k in t?t[k]:noop});
 const setTimer=(fn,ms,...args)=>{const id=setTimeout(()=>{timers.delete(id);try{fn(...args);}catch(e){errors.push(e);}},ms);timers.add(id);return id;};
 Object.assign(window,{location:{search:'?test=1&net=local&speed=10000',origin:'http://example.test',pathname:'/hatatori-nine/'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:false}),BroadcastChannel,crypto:webcrypto,devicePixelRatio:1,innerWidth:390,innerHeight:844});
 const originalCreate=document.createElement.bind(document);
 const fakeContext=new Proxy({measureText:()=>({width:25}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>k in t?t[k]:()=>{}});
 document.createElement=(name,...args)=>{const el=originalCreate(name,...args);if(name==='canvas'){el.getContext=()=>fakeContext;el.toDataURL=()=> 'data:image/webp;base64,test';}return el;};
 document.fonts={load:async()=>{},ready:Promise.resolve()};
 document.querySelector('#app').getBoundingClientRect=()=>({width:390,height:844});
 document.querySelector('#stageWrap').getBoundingClientRect=()=>({left:0,top:0,width:390,height:400});
 const ctx=vm.createContext({window,document,location:window.location,localStorage:window.localStorage,navigator:{},matchMedia:window.matchMedia,innerWidth:390,innerHeight:844,URL,URLSearchParams,Image:class{constructor(){this.width=1402;this.height=1122;}set src(v){setTimer(()=>this.onload(),0);}},console:{...console,error:(...args)=>errors.push(args.join(' '))},setTimeout:setTimer,clearTimeout,setInterval:(f,ms)=>{const id=setInterval(f,ms);intervals.add(id);return id;},clearInterval,performance,crypto:webcrypto,BroadcastChannel,ResizeObserver:class{observe(){}},requestAnimationFrame:noop});
 const modules=new Map();
 async function load(file){
  if(modules.has(file))return modules.get(file);
  let code;
  if(file.endsWith('/scene.js'))code='export const loadThree=async()=>{};export const createScene=()=>globalThis.__scene;export const sortHand=h=>h;export const COLORS=["red","orange","gold","green","blue","purple"];export const UNIT_NAME=[];export function paintCard(){}';
  else if(file.endsWith('/fx.js'))code='export const createFx=()=>({resize(){},clear(){},formation:async(d)=>{globalThis.__lastFx=d;}});';
  else if(file.endsWith('/tournament-fx.js'))code='export const createFX=()=>({confetti(){},firework(){}});';
  else code=await fs.readFile(file,'utf8');
  const m=new vm.SourceTextModule(code,{context:ctx,identifier:file,initializeImportMeta(meta){meta.url='file://'+file;}});modules.set(file,m);return m;
 }
 ctx.__scene=scene;
 for(const f of ['engine.js','ai.js','net.js','director.js','tournament-net.js'])vm.runInContext(await fs.readFile(path.join(root,f),'utf8'),ctx,{filename:f});
 const entry=await load(path.join(root,'app.js'));await entry.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec.split('?')[0])));await entry.evaluate();await until(()=>window.__htn,'boot');
 const h={act(action){window.__htn.act(action);document.querySelector('#confirmTactic')?.click();},window,document,storage,themeChanges,lastFx:()=>ctx.__lastFx,a:window.__htn,errors,click(sel){const el=document.querySelector(sel);assert.ok(el,'element '+sel);assert.ok(!el.disabled,'enabled '+sel);el.click();},stop(){window.__htn.tournaments.leave();for(const t of timers)clearTimeout(t);for(const t of intervals)clearInterval(t);}};
 harnesses.push(h);return h;
}
try{
 const detail=await harness([['htn.cardStyle','"graphic"']]);
 assert.equal(detail.a.prefs.cardStyle,'classic','classic is the default even with an old skin preference');
 for(let c=60;c<70;c++){
  const e=detail.a.E, state=e.newGame({seed:711,first:0,tactics:true,claims:'manual'});
  state.hands[0]=[c,0,1,2,3,4,5];state.hands[1]=[30,31,32,33,34,35,36];
  state.flags[3].side[0]=[{c:19,t:1}];state.flags[4].side[1]=[{c:29,t:2}];
  const used=new Set([...state.hands[0],...state.hands[1],19,29]);
  state.deck.T=state.deck.T.filter(c=>!used.has(c));state.deck.X=state.deck.X.filter(c=>!used.has(c));
  detail.a.load(state);detail.a.scene.pick=()=>({hand:c});detail.a.onTap(1,1);
  assert.match(detail.document.querySelector('#layer').textContent,/制限・注意/);
  assert.match(detail.document.querySelector('#layer').textContent,/具体例/);
  detail.click('#selectTactic');
  const action=e.legalActions(detail.a.match.s).find(a=>a.c===c);assert.ok(action,'tactic has a legal target '+c);
  const before=JSON.stringify(detail.a.match.s);
  detail.a.act(action);assert.ok(detail.document.querySelector('#confirmTactic'),'final confirmation for '+c);
  assert.equal(JSON.stringify(detail.a.match.s),before,'no state mutation before confirmation '+c);
  detail.click('[data-close]');assert.equal(JSON.stringify(detail.a.match.s),before,'cancel retains card '+c);
  detail.a.act(action);detail.click('#confirmTactic');
  await until(()=>!detail.a.presenting,'confirmed tactic '+c);
  assert.equal(detail.a.match.s.tac[0],1,'card consumed only after confirmation '+c);
 }
 detail.stop();
 const automatic=await harness();const ae=automatic.a.E,as=ae.newGame({seed:31,first:0,tactics:false,claims:'manual'});
 automatic.a.load(as);automatic.act(ae.legalActions(as).find(a=>a.t==='card'));
 await until(()=>automatic.a.view.phase==='end'&&!automatic.a.presenting,'end clock starts');
 assert.match(automatic.document.querySelector('#endTurn').textContent,/あと[78]秒/);
 await until(()=>automatic.a.view.turn===1,'8-second automatic end',9500);
 assert.deepEqual(automatic.errors,[]);automatic.stop();
 const entry=await harness([['htn.format','"league"']]);entry.click('#goTour');
 assert.equal(entry.a.prefs.format,'cup','tournament entry overrides an old saved league selection');
 assert.equal(entry.document.querySelector('#tourStart').textContent,'トーナメントを開始');
 entry.click('#goLeague');assert.equal(entry.a.prefs.format,'league','dedicated round-robin entry');
 entry.click('#goTour');assert.equal(entry.a.prefs.format,'cup');entry.stop();
 const turns=await harness(),te=turns.a.E,ts=te.newGame({seed:32,tactics:false,claims:'manual'});
 turns.a.load(ts);assert.equal(turns.document.querySelector('#endTurn').disabled,true,'End Turn disabled before the main action');
 assert.match(turns.document.querySelector('#turnBanner').textContent,/あなたのターン/,'initial turn has a visible announcement');
 const move=te.legalActions(ts).find(a=>a.t==='card');turns.act(move);
 await until(()=>turns.a.view.phase==='end'&&!turns.a.presenting,'automatic single-deck draw waits at End Turn');
 assert.equal(turns.a.view.turn,0,'human retains the turn after drawing');assert.equal(turns.document.querySelector('#endTurn').disabled,false);
 const held=JSON.stringify(turns.a.match.s.hands);turns.a.scene.pick=()=>({hand:turns.a.view.hand[0]});turns.a.onTap(1,1);
 assert.equal(JSON.stringify(turns.a.match.s.hands),held,'tapping the hand cannot play a second card');
 // Exercise an actual flag declaration from the post-draw end phase, through UI controls.
 const pending=te.clone(turns.a.match.s);pending.flags[4].side[0]=[{c:7,t:1},{c:8,t:2},{c:9,t:3}];turns.a.load(pending);
 turns.a.scene.pick=()=>({flag:4});turns.a.onTap(1,1);assert.match(turns.document.querySelector('#prompt').textContent,/宣言しますか/);
 turns.click('#actions button:not(#endTurn)');await until(()=>!turns.a.presenting&&turns.a.view.flags[4].claimed===0,'declaration after draw');
 assert.equal(turns.a.view.turn,0);assert.equal(turns.a.view.phase,'end');
 turns.click('#endTurn');await until(()=>turns.a.view.turn===1,'End Turn passes to CPU');
 await until(()=>turns.a.view.turn===0&&!turns.a.presenting,'CPU completes its turn including End Turn');
 assert.match(turns.document.querySelector('#turnBanner').textContent,/あなたのターン/);assert.ok(turns.document.querySelector('#turnBanner').classList.contains('show'));
 assert.deepEqual(turns.errors,[]);turns.stop();
 const intro=await harness();intro.a.prefs.speed=100;
 intro.a.tournaments.startOffline(Array.from({length:8},(_,i)=>({name:'選手'+i,cpu:1,owner:null,logo:'wolf'})),'cup');
 assert.ok(intro.document.querySelector('#cine.tour-opening'),'tournament starts with the full bracket presentation');
 assert.equal(intro.document.querySelector('[data-opening-overview]').hidden,false,'full bracket is shown first');
 assert.equal(intro.document.querySelectorAll('.poster-entrant').length,8,'all eight logos visible before matchup pages');
 assert.equal(intro.document.querySelector('[data-opening-introductions]').hidden,true,'matchup pages follow the full bracket');
 intro.click('[data-bracket-zoom]');await new Promise(r=>setTimeout(r,60));
 assert.equal(intro.document.querySelector('[data-opening-overview]').hidden,false,'zoom pauses the full bracket overview');
 intro.click('[data-overview-next]');
 assert.equal(intro.document.querySelector('[data-opening-introductions]').hidden,false,'continue advances to matchup pages');
 assert.equal(intro.document.querySelectorAll('.opening-pair').length,4,'all first-round matchups are announced');
 assert.equal(intro.a.tournaments.host.d.matches.some(m=>m.state),false,'no games advance during matchup presentation');
 await until(()=>!intro.document.querySelector('[data-opening-page="1"]').hidden,'second readable matchup page');
 await until(()=>intro.a.match?.intro&&!intro.document.querySelector('#cine').hidden&&!intro.document.querySelector('#cine').classList.contains('tour-opening'),'matchups lead to the VS cinematic');
 assert.ok(intro.a.tournaments.host.d.matches.filter(m=>m.state).every(m=>m.state.clock===0),'CPU games wait for the battle entrance');
 await until(()=>!intro.a.match.intro,'VS leads to the battle');assert.ok(intro.document.querySelector('#stageWrap').classList.contains('battle-enter'),'table arrival effect');intro.a.tournaments.leave();
 const cancelled=await harness();cancelled.a.prefs.speed=100;cancelled.a.tournaments.startOffline([{name:'甲',cpu:1},{name:'乙',cpu:1}],'cup');const cancelledArena=cancelled.a.tournaments.host;cancelled.a.tournaments.leave();await new Promise(r=>setTimeout(r,50));assert.equal(cancelledArena.d.matches.some(m=>m.state),false,'leaving during the opening never starts a delayed tournament');
 const tactic=await harness(),E=tactic.a.E,state=E.newGame({seed:78,tactics:true});state.turn=0;state.phase='play';
 for(const c of [60,61,62,63,64,65,66,67,68,69]){
   for(const a of state.hands){const i=a.indexOf(c);if(i>=0)a.splice(i,1);}
   for(const a of Object.values(state.deck)){if(Array.isArray(a)){const i=a.indexOf(c);if(i>=0)a.splice(i,1);}}
 }
 state.flags[4].side[1]=[{c:3,t:0},{c:60,t:1}];state.flags[4].fog=1;state.flags[4].mud=1;
 tactic.a.load(state);
 assert.match(tactic.document.querySelector('#dock').textContent,/指揮官.*好きな色/,'public opponent tactic ability is always readable');
 tactic.click('#dock .tactic-card-info[data-tactic="60"]');
 assert.match(tactic.document.querySelector('#layer').textContent,/好きな数字（1〜10）/,'opponent mini opens the full ability');
 assert.match(tactic.document.querySelector('#layer').textContent,/固定する必要はありません/,'partial formation does not lock the wildcard');
 tactic.click('[data-close]');tactic.click('#dock [data-tactic="64"]');assert.match(tactic.document.querySelector('#layer').textContent,/合計だけ/,'fog ability can be read');tactic.click('[data-close]');
 tactic.a.scene.pick=()=>({card:60});tactic.a.onTap(1,1);assert.match(tactic.document.querySelector('#layer').textContent,/指揮官の能力/,'public table tactic tap opens its ability');tactic.click('[data-close]');
 state.flags[4].side[1].push({c:4,t:2},{c:5,t:3});tactic.a.load(state);tactic.click('#dock .tactic-card-info[data-tactic="60"]');assert.match(tactic.document.querySelector('#layer').textContent,/この陣形では/,'complete formation shows the evaluated wildcard');tactic.click('[data-close]');
 state.discard[1]=[66,67,68,69];tactic.a.load(state);tactic.a.scene.pick=()=>({disc:true});tactic.a.onTap(1,1);tactic.click('#layer [data-tactic="68"]');assert.match(tactic.document.querySelector('#layer').textContent,/相手のカード1枚/,'spent opponent tactics are inspectable');tactic.click('[data-close]');
 assert.deepEqual(tactic.errors,[]);tactic.stop();
 const h=await harness();
 h.click('#goLogo');assert.equal(h.document.querySelectorAll('[data-logo]').length,20,'20 original player logos');h.click('[data-logo="fox"]');assert.equal(JSON.parse(h.storage.get('htn.logo')),'fox','logo selection persists');
 h.click('#goAppearance');
 for(const skin of ['battleline','classic','gilded','graphic']){
  h.click('#sCardStyle [data-v="'+skin+'"]');await until(()=>h.a.prefs.cardStyle===skin,'card style '+skin);assert.equal(h.document.body.dataset.cardStyle,skin);assert.equal(h.themeChanges.at(-1),skin,'the live table refreshes with the chosen deck');
  for(const effect of ['classic','gilded','graphic']){
   h.click('#sEffectStyle [data-v="'+effect+'"]');assert.equal(h.a.prefs.effectStyle,effect);assert.equal(h.a.prefs.cardStyle,skin,'effect and card preferences are independent');
   assert.equal(JSON.parse(h.storage.get('htn.cardStyleBattleLine')),skin);assert.equal(JSON.parse(h.storage.get('htn.effectStyle')),effect);
  }
 }
 h.click('#sTryFx');assert.equal(h.lastFx().effectStyle,'graphic','preview uses selected effect');
 const restored=await harness([...h.storage]);assert.equal(restored.a.prefs.cardStyle,'graphic');assert.equal(restored.a.prefs.effectStyle,'graphic');assert.equal(JSON.parse(restored.storage.get('htn.logo')),'fox');
 await h.a.applyCardStyle('classic');h.click('#goTour');assert.equal(h.document.querySelectorAll('#tourList .ent').length,4);assert.equal(h.document.querySelector('#scrTour').hidden,false);
 h.click('[data-tx="0"]');for(const el of h.document.querySelectorAll('[data-tl]')){Object.defineProperty(el,'value',{value:'1',configurable:true});el.dispatchEvent(new h.window.Event('change',{bubbles:true}));}
 h.click('#segFormat [data-v="cup"]');h.click('#tourStart');
 await until(()=>h.a.view?.phase==='over'&&!h.a.presenting,'CPU semi-final');
 assert.equal(h.a.tournaments.current.tour.entrants.length,3);assert.equal(h.a.match.ctrl.length,0);
 assert.equal(h.document.querySelector('#watchBar').hidden,false);
 h.click('#btnTour');assert.ok(h.document.querySelector('.bracket'));assert.ok(h.document.querySelector('.tree-lines'));
 await until(()=>h.a.tournaments.current.tour.over&&!h.a.presenting,'CPU final starts automatically');
 h.click('#btnTour');assert.match(h.document.querySelector('.champ').textContent,/優勝/);
 h.a.tournaments.startOffline([{name:'人A',cpu:0,owner:'local'},{name:'人B',cpu:0,owner:'local'}],'league');
 await until(()=>!h.document.querySelector('#handoff').hidden,'first handoff');assert.equal(h.a.view.hand.length,0,'first hand remains covered');
 h.click('#handoff button');await until(()=>!h.a.match.intro,'handoff ready');assert.equal(h.a.view.hand.length,7);
 const initial=h.a.view.me;
 for(let i=0;i<4&&h.document.querySelector('#handoff').hidden;i++){
  h.act(h.a.AI.choose(h.a.view,1,h.a.E.mulberry32(i+5)));await tick();
  await until(()=>!h.a.presenting||!h.document.querySelector('#handoff').hidden,'local turn settling');
 }
 assert.equal(h.document.querySelector('#handoff').hidden,false,'handoff covers the next human hand');
 h.click('#handoff button');await until(()=>!h.a.presenting,'handoff settle');assert.notEqual(h.a.view.me,initial,'view switches to next player');
 h.a.tournaments.leave();
 const host=await harness(),guest=await harness(),third=await harness(),fourth=await harness(),watch=await harness();
 const clients=[host,guest,third,fourth,watch];
 for(const [i,x] of clients.entries()){x.click('#goOnline');x.document.querySelector('#onName').value=['主催','参加A','参加B','参加C','観戦'][i];}
 host.click('#onCreate');await until(()=>host.a.tournaments.room,'room creation');
 const code=host.a.tournaments.room.code;
 for(let i=1;i<4;i++){const x=clients[i];x.document.querySelector('#onCode').value=code;x.click('#onJoin');await until(()=>host.a.tournaments.room.members.length===i+1,'guest joined '+i);}
 guest.click('[data-member-logo="'+guest.a.tournaments.session.cid+'"]');guest.click('[data-logo="compass"]');await until(()=>host.a.tournaments.room.members.find(m=>m.cid===guest.a.tournaments.session.cid).logo==='compass','guest logo sync in lobby');
 host.click('#segOnFormat [data-v="league"]');host.click('#lobStart');
 await until(()=>host.a.tournaments.host?.d.matches.filter(m=>m.state).length===2,'matches are already in progress');
 watch.document.querySelector('#onCode').value=code;watch.click('#onJoin');
 await until(()=>clients.every(x=>x.a.match?.tournament&&!x.a.match.intro),'online intros');
 const arena=host.a.tournaments.host;
 assert.equal(arena.d.matches.filter(m=>m.status==='live').length,2,'two online human matches run simultaneously');
 assert.equal(watch.a.match.ctrl.length,0);assert.equal(watch.a.tournaments.current.hands.length,2);
 for(const x of clients.slice(0,4)){assert.equal(x.a.match.ctrl.length,1);assert.equal(x.a.tournaments.current.hands,null,'each participant receives only their private hand');}
 const own=guest.a.match.mid,other=arena.d.matches.find(m=>m.status==='live'&&m.id!==own);
 guest.click('#btnTour');guest.click('[data-watch="'+other.id+'"]');
 await until(()=>guest.a.match.mid===other.id&&!guest.a.match.intro,'participant can spectate another live match');
 assert.equal(guest.a.match.ctrl.length,0);assert.equal(guest.a.tournaments.current.hands.length,2);
 guest.click('#watchBar [data-w="hands"]');assert.equal(guest.document.querySelectorAll('.watchhands').length,2,'both hands are inspectable during a live game');
 guest.click('[data-close]');guest.click('#tourNav [data-own="'+own+'"]');
 await until(()=>guest.a.match.mid===own&&!guest.a.match.intro,'return to own live match');assert.equal(guest.a.tournaments.current.hands,null,'return restores hand privacy');
 // Switch while a move's effects are still presenting; old animation jobs cannot overwrite the new table.
 const moving=arena.d.matches.find(m=>m.status==='live'),movingCid=arena.ent(moving.state.turn,moving).owner;
 const actor=clients.find(x=>x.a.tournaments.session.cid===movingCid),elsewhere=arena.d.matches.find(m=>m.status==='live'&&m.id!==moving.id);
 actor.a.prefs.speed=1;
 actor.act(actor.a.AI.choose(actor.a.view,1,actor.a.E.mulberry32(83)));
 await until(()=>actor.a.presenting,'move animation begins');actor.a.tournaments.watch(elsewhere.id);
 await until(()=>actor.a.match.mid===elsewhere.id&&!actor.a.match.intro,'switch while animation is in progress');
 assert.equal(actor.a.tournaments.current.hands.length,2);assert.equal(actor.a.view.me,actor.a.tournaments.current.view.me);
 actor.a.prefs.speed=10000;actor.click('#tourNav [data-own="'+moving.id+'"]');
 await until(()=>actor.a.match.mid===moving.id&&!actor.a.match.intro,'return while old animation settles');
 let guard=0;
 while(!arena.d.over()&&guard++<6000){
  for(const x of clients.slice(0,4)){
   const m=arena.d.matches.find(m=>m.status==='live'&&arena.ctrlFor(x.a.tournaments.session.cid,m).length);
   if(!m)continue;
   if(x.a.match.mid!==m.id){const b=x.document.querySelector('#tourNav [data-own="'+m.id+'"]');if(b)b.click();continue;}
   if(!x.a.presenting&&!x.a.match.intro&&!x.a.match.waiting&&x.a.view.turn===x.a.view.me&&x.a.match.revision===m.revision){x.act(x.a.AI.choose(x.a.view,1,x.a.E.mulberry32(guard+22)));}
  }
  await tick();
 }
 assert.ok(guard<6000,'online parallel league completes');await until(()=>watch.a.tournaments.current.tour.over,'observer final standings');
 assert.equal(arena.d.matches.filter(m=>m.status==='done').length,6,'all six league matches automatically finish');
 for(const x of harnesses)assert.deepEqual(x.errors,[], 'No app errors including card/effect settings');
 console.log('Card settings (all 12 combinations and persistence) and tournament DOM integration passed (10 tactic confirmations, cancellation, 8-second automatic end): setup, CPU cup, result/board, full bracket → matchup pages → VS → table arrival, public tactic abilities and wildcard evaluation, private hotseat handoff, 5-client concurrent online league, joining as a spectator after play starts, live observation switching during effects, synced logos and hand privacy.');
}finally{for(const h of harnesses)h.stop();}

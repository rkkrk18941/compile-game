/* Explanations must match the live orb/attack rules; inspecting a token must never play a card. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,E=S.Explain,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,30));
function fixture(n=1,asc=0){const run=S.Game.newRun({players:['B','R','G','W'].slice(0,n).map(ch=>({ch})),asc,seed:61}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);run.players.forEach(p=>p.hp=p.maxHp=1000);const cb=S.Combat.create(g,{kind:'normal'});g.combat=cb;run.combat=cb.s;run.phase='combat';cb.s.phase='play';cb.s.round=2;cb.s.die=1;cb.pcs().forEach(pc=>{pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};});return{run,g,cb,pc:cb.pcs()[0]};}
async function click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();await tick();}
(async()=>{
 await tick();
 for(const boosted of [false,true])for(const type of ['lightning','frost','dark']){
  const{run,g,cb,pc}=fixture(),e=cb.spawn('SmallSlime',0);e.hp=e.max=1000;
  if(boosted)pc.pow=[{id:'Defragment'},{id:'StaticDischarge',up:true},{id:'Consume'},{id:'Amplify',up:true}];
  pc.orbs=[type];const before=JSON.stringify(run),o=E.orb(cb,pc,type);E.orbs(cb,pc);assert.equal(JSON.stringify(run),before);
  const hp=e.hp,block=pc.blk;await cb.orbEnd(pc,0);assert.equal(type==='frost'?pc.blk-block:hp-e.hp,o.end,type+' passive');assert.equal(pc.orbs.length,1,'passive keeps orb');
  const hp2=e.hp,b2=pc.blk;await cb.evokeAt(pc,0,1);assert.equal(type==='frost'?pc.blk-b2:hp2-e.hp,o.evoke,type+' evoke');assert.equal(pc.orbs.length,0,'evoke consumes orb');
 }
 // Actual non-attacks, zero damage, full Block, conditional mode change, another row and pre-emptive Lightning.
 for(const spec of [{id:'JawWorm',beh:'sss',reason:'no-attack'},{id:'GremlinNob',cube:0,reason:'no-attack'},{id:'SmallSlime',weak:1,damage:0},{id:'SmallSlime',block:2,damage:1,blocked:1},{id:'Guardian',cube:1,reason:'guardian',mode:'attack'},{id:'SmallSlime',n:2,noTarget:true,reason:'no-target'}]){
  const{run,cb,pc}=fixture(spec.n||1),e=cb.spawn(spec.id,0,{lvl:'easy',beh:spec.beh});e.cube=spec.cube||0;if(spec.mode)e.mode=spec.mode;e.x.startBlk=0;e.weak=spec.weak||0;pc.blk=spec.block||0;if(spec.noTarget)pc.dead=true;
  await cb.enemyAct(e);const ev=cb.s.enemyResults.at(-1);assert.equal(ev.t,'enemyResult');if(spec.reason)assert.equal(ev.reason,spec.reason,spec.id);else{assert.equal(ev.hits[0].damage,spec.damage);if(spec.blocked)assert.equal(ev.hits[0].blocked,spec.blocked);}
  const tx=E.enemyResult(ev,0,i=>'仲間'+i);assert.ok(!/undefined|NaN/.test(tx));if(spec.weak)assert.match(tx,/脱力/);if(spec.block)assert.match(tx,/すべてブロック/);
 }
 let{run,g,cb,pc}=fixture();const victim=cb.spawn('SmallSlime',0);victim.hp=1;pc.orbs=['lightning'];pc.hand=[];await cb.endTurn();assert.equal(cb.s.over,true);const prevented=cb.s.enemyResults.find(e=>e.t==='enemyPrevented');assert.ok(prevented);assert.match(E.enemyResult(prevented,0,()=>''),/倒したため/);
 { const z=fixture();z.run.players[0].hp=1;const foe=z.cb.spawn('Guardian',0);await z.cb.enemyAct(foe);const out=z.cb.s.enemyResults.at(-1);assert.equal(out.hits[0].damage,2);assert.equal(out.hits[0].hp,1,'overkill cannot lose more HP than remained'); }
 // Heroes use the original shared scale and stay within the available band for every character.
 for(const ch of ['R','G','B','W']){
  const z=fixture();z.run.players[0].ch=ch;const foe=z.cb.spawn('SmallSlime',0);let pending=[],commands=[];
  A.screen='game';A.me=0;A.ui={};A.view=null;A.field=null;A.sess={run:()=>z.run,pending:()=>pending,waiting:()=>[],playOpen:()=>true,hand:()=>S.Session.handInfo(z.run,0),command:(pi,c)=>{commands.push(c);return Promise.resolve();},answer:()=>Promise.resolve()};
  w.innerWidth=390;w.innerHeight=844;S.UI.draw();const h=parseFloat(d.querySelector('.hero').style.getPropertyValue('--bh'));assert.ok(h>0&&h<=120,ch+' compact small-enemy encounter');
  z.cb.s.enemies=[];const boss=z.cb.spawn('Guardian',-1);boss.mode='defense';boss.cube=1;S.UI.draw();const heroEl=d.querySelector('.hero'),hh=parseFloat(heroEl.style.getPropertyValue('--bh'));assert.ok(hh>0&&hh<=120,ch+' compact boss encounter');assert.ok(parseFloat(heroEl.style.getPropertyValue('--fw'))<=parseFloat(heroEl.style.getPropertyValue('--slot')),ch+' full artwork fits its slot');boss.mode='attack';boss.cube=0;S.UI.draw();assert.ok(parseFloat(d.querySelector('.hero').style.getPropertyValue('--bh'))<=120);
  z.pc.weak=1;z.pc.vuln=1;z.pc.str=1;z.pc.blk=1;z.pc.orbs=['lightning','frost','dark'];S.UI.draw();const before=JSON.stringify(z.run);
  await click('.hero [data-help="term:weak"]');assert.equal(S.HelpUI.state.key,'term:weak');assert.match(d.querySelector('#referenceRoot').textContent,/ダメージが1少なく/);await click('[data-help-close]');assert.equal(commands.length,0);assert.equal(JSON.stringify(z.run),before);
  await click('.hero [data-a=orbinfo]');assert.match(d.querySelector('.info-sheet').textContent,/オーブの種類/);assert.match(d.querySelector('.info-sheet').textContent,/球を取り除/);await click('.info-sheet [data-a=close]');assert.equal(JSON.stringify(z.run),before);
  // Target selection takes precedence over inspection, and does not contain nested buttons.
  pending=[{id:80,q:{type:'enemy',title:'対象の敵',options:[boss.u]}}];S.UI.draw();assert.ok(!d.querySelector('.hero [data-help]'));assert.equal(d.querySelectorAll('.hero button,.foe button').length,0);
 }
 // Types are present on every small card and in both the selected-card and exact help views.
 ({run,g,cb,pc}=fixture());const e=cb.spawn('SmallSlime',0);const cards=['StrikeB','DefendB','Defragment'].map(id=>({id,u:g.uid(),up:false}));pc.hand=cards;pc.pow=[{id:'Combust',u:g.uid(),up:false}];let commands=[];A.ui={};A.sess={run:()=>run,pending:()=>[],waiting:()=>[],playOpen:()=>true,hand:()=>S.Session.handInfo(run,0),command:(pi,c)=>{commands.push(c);return Promise.resolve();},answer:()=>Promise.resolve()};
 for(const c of cards){A.ui.sel=c.u;S.UI.draw();assert.equal(d.querySelectorAll('.hand .ctype').length,3);assert.ok(!d.querySelector('.preview .card-type-guide'));await click('.preview [data-v=cardGuide]');assert.match(d.querySelector('.info-sheet .card-type-guide').textContent,new RegExp(S.View.TYPE[S.CARDS[c.id].t]));await click('.info-sheet [data-a=close]');}
 assert.match(E.cardType(cards[2]),/場に置き/);A.ui={};S.UI.draw();await click('.powchip');assert.equal(commands.length,0,'reading a power never activates it');await click('[data-a=activatepow]');assert.equal(commands.length,1);assert.equal(commands[0].type,'power');
 // The previous enemy turn's actual outcome remains readable after the animation has finished.
 await cb.enemyAct(e);A.ui={};S.UI.draw();assert.ok(d.querySelector('.enemy-round-report'));await click('.enemy-round-report');assert.match(d.querySelector('.info-sheet').textContent,/実際のHP減少/);assert.equal(errors.length,0,errors.join('\n'));
 console.log('ok: all orb types/base and powered values match actual passive/evoke effects, orb consumption, real no-attack reasons, original shared hero sizes, exact token links, target selection, card types, power inspection and persistent enemy outcomes');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

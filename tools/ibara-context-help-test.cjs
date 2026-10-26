/* Context explanations must predict real effects without performing them. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));vc.on('error',e=>errors.push(String(e)));
const dom=new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>',{url:'https://example.test/ibara/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
for(const name of ['data','cards','items','monsters','events','combat','engine','session','help','ui-parts','help-ui','context-help','morph','director','ui'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,E=S.Explain,A=S.UI.state,tick=()=>new Promise(r=>setTimeout(r,35));
async function click(sel){const el=d.querySelector(sel);assert.ok(el,sel);el.click();await tick();}
function fixture(n=1,asc=0){
 const run=S.Game.newRun({players:['R','G','B','W'].slice(0,n).map(ch=>({ch})),seed:61,asc}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);
 run.players.forEach(p=>{p.hp=p.maxHp=100;});const cb=S.Combat.create(g,{kind:'normal'});g.combat=cb;run.combat=cb.s;run.phase='combat';cb.s.phase='play';cb.s.round=4;cb.s.die=6;
 cb.pcs().forEach(pc=>{pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};});return{run,g,cb};
}
(async()=>{
 await tick();
 // Every offered ability's description isolates the corresponding face (not all abilities on its relic).
 let count=0;
 for(const [id,r]of Object.entries(S.RELICS))for(let fi=0;fi<(r.die||[]).length;fi++){
  const tx=E.dieText(id,fi);assert.ok(tx.length,id);assert.ok(!tx.includes('undefined'));count++;
 }
 assert.equal(E.dieText('Duality',0),'ブロック2。');assert.equal(E.dieText('Duality',1),'2ダメージを与える。');
 assert.equal(E.dieText('Vajra',0),'筋力1を得る。ターン終了時にその筋力を失う。');
 assert.match(S.Help.get('term:defenseB').text,/攻撃した後/);
 for(const n of [1,4])for(const asc of [0,10]){
  const {run,cb}=fixture(n,asc),e=cb.spawn('Guardian',-1);e.mode='defense';e.cube=1;e.str=2;
  const before=JSON.stringify(run),html=E.enemy(cb,e,run,0);E.turn(run,0);assert.equal(JSON.stringify(run),before);
  assert.match(html,/6ダメージ/);assert.match(html,/今回の攻撃には乗らず/);assert.match(html,/鋭い外殻/);
  const hits=[];cb.emit=ev=>{if(ev.t==='ehit')hits.push(ev.n);};await cb.enemyAct(e);
  assert.deepEqual(hits,Array(n).fill(6));assert.equal(e.str,3);assert.equal(e.x.modeNext,'attack');cb.advance(e);assert.equal(e.mode,'attack');
 }
 const {run,g,cb}=fixture(2),pc=cb.pcs()[0],enemy=cb.spawn('JawWorm',0,{lvl:'easy',beh:'sda'});run.players[0].relics=[{id:'LoadedDie'},{id:'PenNib'},{id:'Duality'}];run.players[1].relics=[{id:'Pocketwatch'}];
 let pending=[],answers=[],commands=[],events=[],targetAsked=false;
 cb.emit=ev=>events.push(ev);
 g.io.ask=(pi,q)=>{if(q.type==='option'){assert.ok(q.options.some(o=>o.id==='0:PenNib:0'));return '0:PenNib:0';}if(q.type==='enemy'){targetAsked=true;return enemy.u;}return S.autoAnswer(g,pi,q);};
 // Force two targets so the actual PenNib asks who to affect.
 const other=cb.spawn('JawWorm',1,{lvl:'easy',beh:'sda'});
 await g.triggerDieAbility(cb,pc,{exclude:'LoadedDie'});assert.ok(targetAsked);assert.equal(enemy.vuln,1);assert.equal(other.vuln,0);
 assert.ok(events.some(ev=>ev.t==='dieRelic'&&ev.id==='PenNib'&&ev.fi===0));
 const raw={id:'0:PenNib:0',label:'あなた：ペン先（5）'};
 assert.match(E.option(raw,run,0),/弱体化1/);assert.match(E.option(raw,run,0),/2倍/);assert.match(E.option(raw,run,0),/アタックの処理後/);
 assert.match(E.option({id:'1:Pocketwatch:0'},run,0),/カードを3枚/);assert.equal(E.ability({id:'2:PenNib:0'},run),null);
 const before=JSON.stringify(run);E.option(raw,run,0);assert.equal(JSON.stringify(run),before);
 A.screen='game';A.me=0;A.ui={};A.view=null;A.sess={run:()=>run,pending:()=>pending,waiting:()=>[],playOpen:()=>true,hand:()=>S.Session.handInfo(run,0),answer:(id,v)=>{answers.push({id,v});return Promise.resolve();},command:(pi,c)=>{commands.push(c);return Promise.resolve();}};
 pending=[{id:50,q:{type:'option',title:'いかさまダイス：発動するダイスレリックの能力を選択',options:[raw,{id:'none',label:'発動しない'}]}}];S.UI.draw();
 assert.match(d.querySelector('.choice-effect').textContent,/選ぶと：敵を1体選び、弱体化1/);assert.ok(!d.querySelector('.opt button'),'no nested buttons');assert.equal(answers.length,0);
 await click('.opt[data-a=ans]');assert.equal(answers[0].v,'0:PenNib:0');
 pending=[{id:51,q:{type:'enemy',title:'ペン先：弱体化を与える敵',options:[enemy.u,other.u]}}];S.UI.draw();assert.match(d.querySelector('.effect-guide').textContent,/2倍/);
 pending=[];A.ui={};S.UI.draw();const snapshot=JSON.stringify(run);
 await click('[data-a=end]');assert.equal(commands.length,0);assert.match(d.querySelector('.info-sheet').textContent,/ターン終了後に起きること/);assert.equal(JSON.stringify(run),snapshot);
 await click('.info-sheet [data-a=close]');assert.equal(commands.length,0);
 await click('[data-a=end]');const confirm=d.querySelector('[data-a=endconfirmed]');confirm.click();confirm.click();await tick();assert.equal(commands.length,1,'confirm submits only once');
 // Stale confirmation cannot end another phase or dismiss a newer sheet.
 await click('[data-a=end]');const stale=d.querySelector('[data-a=endconfirmed]');cb.s.phase='enemy';stale.click();await tick();assert.equal(commands.length,1);cb.s.phase='play';A.ui={info:{k:'menu'}};S.UI.draw();
 await click('[data-a=toggleexplain]');assert.equal(E.enabled(),false);assert.equal(JSON.parse(w.localStorage.getItem('ibara.bg.prefs.v1')).explainEffects,false);assert.equal(E.terms('弱体化'), '');assert.equal(E.option(raw,run,0),'');assert.equal(E.relicCaption('PenNib',0),'');
 await click('.info-sheet [data-a=close]');await click('[data-a=end]');assert.equal(commands.length,2);assert.ok(!d.querySelector('[data-a=endconfirmed]'));
 A.ui={info:{k:'menu'}};S.UI.draw();await click('[data-a=toggleexplain]');assert.equal(E.enabled(),true);
 pending=[{id:52,q:{type:'option',title:'選択',options:[{id:'x',label:'<img src=x onerror=alert(1)> 弱体化'}]}}];A.ui={};S.UI.draw();assert.ok(!d.querySelector('.opt img'));assert.equal(errors.length,0,errors.join('\n'));
 assert.ok(E.relicCaption('PenNib',0).includes('2倍'));
 const captions=[],logs=[],director=new S.Director({me:()=>0,speed:()=>1,sfx:()=>{},playerName:()=> 'あなた',enemyName:()=> 'ガーディアン'});director.showRelic=()=>{};director.caption=tx=>captions.push(tx);director.addLine=tx=>logs.push(tx);
 director.on_dieRelic({i:0,id:'PenNib',fi:0});assert.match(captions.pop(),/2倍/);assert.match(logs.pop(),/弱体化1/);
 director.on_eact({u:999,name:'防御モードB'});assert.match(captions.pop(),/今回の攻撃には乗らず/);
 // Card selection explains uncommon words without using the glossary; result receipts remain visible even with guidance off.
 pending=[];A.ui={};const wrathCard={id:'Eruption',u:g.uid(),up:false};pc.hand=[wrathCard];pc.stance='calm';A.ui.sel=wrathCard.u;S.UI.draw();
 assert.match(d.querySelector('.card-effect-guide').textContent,/自分に1ダメージ/);assert.match(d.querySelector('.card-effect-guide').textContent,/ブロックで防げます/);assert.match(d.querySelector('.card-effect-guide').textContent,/今は平静/);
 pc.stance='wrath';pc.blk=0;const facts=E.player(cb,pc,run);assert.match(facts,/HPを1減らします/);assert.match(E.turn(run,0),/憤怒の代償/);assert.equal(d.querySelector('.topbar > [data-v=menu]').getAttribute('aria-label'),'メニュー');assert.equal(d.querySelectorAll('.topbar > .ibtn').length,3);
 director.on_stance({i:0,s:'wrath'});assert.match(captions.pop(),/自分へ1ダメージ/);
 const initial=g.resultSnapshot();run.players[0].gold-=2;const report=g.resultReport(initial,'イベントの結果','結果を確認してマップへ',null,[{pi:0,label:'成長'}]);pending=[{id:60,q:{type:'info',title:report.title,text:g.resultText(report),result:report,ok:report.ok}}];A.ui={};S.UI.draw();const oldRun=JSON.stringify(run),oldAnswers=answers.length;
 assert.match(d.querySelector('.room-result').textContent,/あなたの結果/);assert.ok(d.querySelector('.result-stats'));assert.equal(answers.length,oldAnswers);assert.equal(JSON.stringify(run),oldRun);
 E.enabled=()=>false;S.UI.draw();assert.ok(d.querySelector('.room-result'),'actual result is mandatory even when guidance is off');assert.ok(!d.querySelector('.effect-terms'));const ack=d.querySelector('.result-continue button');ack.click();ack.click();await tick();assert.equal(answers.length,oldAnswers+1);assert.equal(answers.at(-1).v,true);assert.equal(errors.length,0,errors.join('\n'));
 console.log('ok: '+count+' die abilities; exact branches, Guardian attack/Strength/mode order at 1/4 players and ascensions; real copied PenNib targeting/emission; inline UI facts, no state mutation, cancel/confirm/stale/duplicate safety, settings persistence and escaping');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

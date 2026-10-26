/* Compare the read-only UI forecast against the engine's emitted enemy hits. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
for(const name of ['data','cards','items','monsters','events','combat','engine','ui-parts'])w.eval(fs.readFileSync(path.join(__dirname,'../ibara/bg',name+'.js'),'utf8'));
const S=w.STS,V=S.View;
function fixture(n=1,asc=0){
 const run=S.Game.newRun({players:['R','G','B','W'].slice(0,n).map(ch=>({ch})),asc,seed:61}),g=new S.Game(run,{});g.setupDecks();g.setupAct(1);
 run.players.forEach(p=>{p.hp=p.maxHp=1000;});
 const cb=S.Combat.create(g,{kind:'normal'});run.combat=cb.s;g.combat=cb;cb.s.phase='play';cb.s.round=2;cb.s.die=3;cb.pcs().forEach(pc=>{pc.en=3;pc.t={played:0,attacks:0,skills:0,powers:0,discarded:0};});return{run,g,cb};
}
function serial(o){return JSON.stringify(o);}
(async()=>{
 let checks=0;
 for(const config of [
  {id:'JawWorm',beh:'sda',die:3},{id:'JawWorm',beh:'sda',die:5,weak:1,vuln:1,str:2},
  {id:'JawWorm',beh:'sda',die:5,weak:1},{id:'JawWorm',beh:'sda',die:5,vuln:1},
  {id:'FatGremlin',n:4,vuln:1},{id:'Hexaghost',n:3,row:-1,cube:1},
  {id:'AwakenedOne',n:4,row:-1,cube:1,powers:true},{id:'SpireGrowth',n:4,die:5,vuln:1},
  {id:'Guardian',n:2,row:-1,cube:1,blk:2},{id:'Guardian',n:2,row:-1,cube:1,blk:0},
  {id:'ChampionTest',custom:true},
 ]){
  const {run,cb}=fixture(config.n||1),row=config.row==null?0:config.row;
  if(config.custom)S.MONSTERS.ChampionTest={name:'試験',hp:20,type:'single',acts:[{name:'強化後の連打',fx:[['str',1],['vuln',1],['hit',2,3],['hit',2]]}]};
  const e=cb.spawn(config.id,row,{lvl:'easy',beh:config.beh||undefined});e.str=config.str||0;e.weak=config.weak||0;e.cube=config.cube||0;e.blk=config.blk||0;e.x.startBlk=e.blk;
  if(config.die)cb.s.die=config.die;
  cb.pcs()[0].vuln=config.vuln||0;
  if(config.powers)cb.pcs().forEach((pc,i)=>{pc.pow=Array.from({length:i},()=>({id:'Inflame',up:false}));});
  const before=serial(run),a=cb.currentAction(e),data=V.intentData(cb,e,a),html=V.intentHTML(cb,e,a,run,0);V.actionRule(cb,e);V.behaviour(cb,e);
  assert.equal(serial(run),before,'forecast and explanation never mutate a live run');assert.ok(html.length);
  const expected=[];data.attacks.forEach(x=>{for(let i=0;i<x.times;i++)expected.push([x.player,x.damage]);});
  const actual=[];cb.emit=(event)=>{if(event.t==='ehit')actual.push([event.i,event.n]);};
  await cb.enemyAct(e);
  assert.equal(serial(actual.sort()),serial(expected.sort()),config.id+' forecast matches real per-target hit amounts');checks++;
 }
 const {run,cb}=fixture(2),e=cb.spawn('JawWorm',0,{lvl:'easy',beh:'sda'});
 for(let die=1;die<=6;die++){cb.s.die=die;const rows=V.behaviour(cb,e);assert.equal(rows.filter(r=>r.cur).length,1);assert.ok(rows[Math.floor((die-1)/2)].cur);assert.match(V.actionRule(cb,e),new RegExp('出目'+die));}
 cb.s.die=2;const sentry=cb.spawn('Sentry',1);assert.match(V.actionRule(cb,sentry),/1〜3/);
 const wizard=cb.spawn('GremlinWizard',1);assert.match(V.actionRule(cb,wizard),/行動順1/);
 const slime=cb.spawn('SmallSlime',1);assert.equal(V.actionRule(cb,slime),'毎回同じ行動');
 cb.s.die=6;const mass=cb.spawn('WrithingMass',1);assert.match(V.actionRule(cb,mass),/出目6 → 6の行動/);
 const all=cb.spawn('FatGremlin',1);cb.pcs()[0].vuln=1;const html=V.intentHTML(cb,all,cb.currentAction(all),run,0);assert.match(html,/あなたへ/);assert.match(html,/2ダメージ/);assert.match(html,/1ダメージ/);
 console.log('ok: '+checks+' forecasts match actual engine hits; die ranges, exact current-row highlight, all-target modifiers, conditional attacks, multi-hit and state immutability');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

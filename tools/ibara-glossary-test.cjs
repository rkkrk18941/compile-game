const assert=require('node:assert/strict');require('../ibara/engine.js');require('../ibara/data/cards.js');require('../ibara/data/world.js');require('../ibara/glossary.js');
const G=globalThis.IBARA;function setup(){const run=G.Game.newRun('knight',321);run.relics=[];const game=new G.Game(run,{emit:async()=>{},choose:async()=>null});const c=game.newCombat({kind:'enc',enemies:[]});const e=c.spawn('rat');return {run,c,e};}
(async()=>{
let {c,e}=setup();c.hero.weak=2;assert.equal(c.previewHeroHit(3,e),2);await c.attack(e,1,2);assert.equal(c.hero.weak,1,'a multi-hit attack uses only one weak charge');
({c,e}=setup());e.vuln=2;assert.equal(c.previewHeroHit(2,e),4);await c.attack(e,1);assert.equal(e.vuln,1);
({c,e}=setup());c.hero.weak=1;e.vuln=1;assert.equal(c.previewHeroHit(3,e),3,'weak and vulnerable cancel');await c.attack(e,1);assert.equal(c.hero.weak,0);assert.equal(e.vuln,0);
({c,e}=setup());e.block=5;await c.applyPoison(e,2);await c.endPlayerTurn();assert.equal(e.hp,3,'poison ignores shields');assert.equal(e.block,5);assert.equal(e.poison,2,'poison does not decay in this version');
const names=G.GLOSSARY.map(x=>x.name);assert.equal(new Set(names).size,names.length);for(const name of Object.keys(G.KEYWORDS)){assert.ok(names.includes(name),'missing dictionary term '+name);}
console.log('PASS: weak/vulnerable timing, multi-hit charge use, cancellation, poison, and all '+names.length+' glossary terms');
})().catch(e=>{console.error(e);process.exitCode=1;});

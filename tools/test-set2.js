const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[2]||'index.html','utf8');
const match=html.match(/<script id="set2-expansion-core">\n([\s\S]*?)\n<\/script>/);
assert(match,'set2 core script not found');
const noop=()=>{},anoop=async()=>{};
const ctx={console,Math,Promise,Set,Map,Object,Array,String,Number,Boolean,JSON,Date,
  PROTOCOLS:['SPIRIT','LIFE','WATER','DEATH','PLAGUE','GRAVITY','METAL','LIGHT','FIRE','SPEED','DARKNESS','PSYCHIC'],
  DB:{},D5:'手札を1枚捨てる。',STYLE:{SPIRIT:{c:['#0','#1','#2','#3']}},PMETA:{},PAL:{},draft:{cardSet:'set1'},
  localStorage:{getItem:()=>null,setItem:noop},G:null,logs:[],
  other:p=>1-p,shuffle:a=>a.reverse(),render:noop,log:m=>ctx.logs.push(m),toast:noop,pace:anoop,announce:anoop,
  playerName:p=>'P'+p,cardName:c=>c.protocol+' '+c.value,cardText:()=>'',T:c=>ctx.DB[c.protocol]?.[c.value]||{},pmeta:n=>({k:n}),esc:s=>String(s),
  fieldCardsOf:p=>ctx.G.players[p].lines.flat(),fieldLocation:card=>{if(!ctx.G)return null;for(let p=0;p<2;p++)for(let l=0;l<3;l++){const i=ctx.G.players[p].lines[l].indexOf(card);if(i>=0)return{player:p,line:l,index:i}}return null;},
  cardLocation:card=>ctx.fieldLocation(card),isTop:card=>{const z=ctx.fieldLocation(card);return !!z&&z.index===ctx.G.players[z.player].lines[z.line].length-1},isCovered:card=>{const z=ctx.fieldLocation(card);return !!z&&z.index<ctx.G.players[z.player].lines[z.line].length-1},topCommandActive:card=>!!ctx.fieldLocation(card)&&!card.faceDown,
  effectiveValue:c=>c.faceDown?2:c.value,stackTotal:(p,l)=>ctx.G.players[p].lines[l].reduce((s,c)=>s+(c.faceDown?2:c.value),0),
  decisionActor:()=>ctx.G?.current??0,withDecisionActor:async(p,fn)=>fn(),
  reshuffleIfNeeded:noop,draw:anoop,playTopDeck:anoop,takeRecompileCard:async()=>null,legalFaceUpLines:()=>[0,1,2],legalFaceDownLines:()=>[0,1,2],forceFaceDown:()=>false,lineBlocked:()=>false,faceDownBlocked:()=>false,
  promptPlayCard:async()=>true,choose:async()=>null,chooseLine:async()=>null,chooseFieldCard:async()=>null,chooseHandCards:async()=>[],confirmAsk:async()=>false,showModal:anoop,
  removeFromHand:noop,onCardPlaced:null,fxAtCard:noop,beforeCover:anoop,activateVisibleCard:anoop,flipCard:async()=>true,returnCard:async()=>false,batchRemove:anoop,
  revealTopIfNeeded:anoop,revealHandTo:anoop,reorderProtocols:anoop,moveCard:async()=>true,deleteCard:anoop,discardFromHand:anoop,discardCardsFromHand:anoop,
  sendToDiscard:c=>ctx.G.players[c.owner].discard.push(c),triggerAfterDraw:anoop,triggerAfterDiscard:anoop,refreshPlayer:async()=>true,compileLine:async()=>false,resolveStartPhase:anoop,resolveEndPhase:anoop,
};
vm.createContext(ctx);vm.runInContext(match[1],ctx,{filename:'set2-expansion-core.js'});
const ev=e=>vm.runInContext(e,ctx);
assert.equal(ev("protocolPoolForSet('set1').length"),12);
assert.equal(ev("protocolPoolForSet('set2').length"),12);
assert.equal(ev("protocolPoolForSet('mixed').length"),24);
assert.equal(ev('PROTOCOLS.length'),24);
const expected={CHAOS:[0,1,2,3,4,5],CLARITY:[0,1,2,3,4,5],CORRUPTION:[0,1,2,3,5,6],COURAGE:[0,1,2,3,5,6],FEAR:[0,1,2,3,4,5],ICE:[1,2,3,4,5,6],LUCK:[0,1,2,3,4,5],MIRROR:[0,1,2,3,4,5],PEACE:[1,2,3,4,5,6],SMOKE:[0,1,2,3,4,5],TIME:[0,1,2,3,4,5],WAR:[0,1,2,3,4,5]};
for(const [name,values] of Object.entries(expected))assert.deepStrictEqual([...ev(`Object.keys(DB.${name}).map(Number).sort((a,b)=>a-b)`)],values,name);
let serial=0;const card=(protocol,value,owner=0,faceDown=false)=>({id:'c'+(++serial),protocol,value,owner,faceDown});
ctx.G={current:0,players:[0,1].map(()=>({hand:[],deck:[],discard:[],lines:[[],[],[]],protocols:[]}))};
const clarity=card('CLARITY',0),mirror=card('MIRROR',0),smoke=card('SMOKE',2),fd1=card('X',5,0,true),fd2=card('X',5,1,true);
ctx.G.players[0].hand=[card('X',1),card('X',1),card('X',1)];ctx.G.players[0].lines[0]=[clarity,mirror,smoke,fd1];ctx.G.players[1].lines[0]=[card('X',2,1),fd2];
assert.equal(ev('stackTotal(0,0)'),11,'static total bonuses');
(async()=>{
  ctx.G.players[0].hand=[];ctx.G.players[0].lines=[[card('ICE',6)],[],[]];ctx.G.players[0].deck=[card('X',1),card('X',2)];
  assert.equal(await ev('draw(0,2)'),1,'ICE 6 permits only the first draw into an empty hand');assert.equal(ctx.G.players[0].hand.length,1);
  ctx.G.players[0].hand=[card('X',1)];ctx.G.players[1].deck=[card('X',4,1)];
  assert.equal(await ev('set2StealTop(1,0)'),null,'ICE 6 blocks CHAOS draw');assert.equal(ctx.G.players[1].deck.length,1);
  const corruption=card('CORRUPTION',1,0),target=card('X',3,1);ctx.target=target;
  ctx.G.players[0].lines=[[corruption],[],[]];ctx.G.players[1].lines=[[target],[],[]];ctx.G.players[1].deck=[];
  assert.equal(await ev('returnCard(target)'),true);assert.equal(ctx.G.players[1].lines[0].length,0);assert.equal(ctx.G.players[1].deck.at(-1),target);assert.equal(target.faceDown,true,'CORRUPTION 1 places the card face down on top of the deck');
  console.log('set2 core tests passed');
})().catch(e=>{console.error(e);process.exit(1)});

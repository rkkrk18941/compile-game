/* Heart's Boon: all 20 printed cards (deck 938861), TTS saved 2026-07-23.
   Each player first gains 3 Gold and one card reward, then chooses one of that card's three blue options. */
(function(root){'use strict';var S=root.STS,F=S.DF;
// reward, drawback (m1/m2 max HP, h1/h2/h3 HP, g3 Gold, curse)
F.BOONS=[
[['color'],['goldpots'],['starters','m1']],
[['card'],['gold8','m1'],['starters','g3']],
[['remove'],['relic','m1'],['transformup','h2']],
[['strikes','h1'],['goldpots'],['colorup','h3']],
[['transform'],['randomrare'],['upcard','m2']],
[['card'],['relic','m1'],['remove2','g3']],
[['goldpots'],['strikes','h1'],['remove2','m2']],
[['transform'],['strikes','h1'],['rare','curse']],
[['upgrade'],['transform'],['rare','m2']],
[['upgrade'],['relic','m1'],['gold11','m2']],
[['defends'],['upgrade'],['transformup','m1']],
[['gold8','m1'],['remove'],['transformup','g3']],
[['upgrade'],['randomrare'],['relic3','curse']],
[['goldpot'],['gold11','m2'],['upcard','curse']],
[['remove'],['randomcolor2'],['relic3','m2']],
[['color'],['gold8','m1'],['randomcard2']],
[['randomrare'],['relic','g3'],['randomcolorup','h1']],
[['gold5'],['color'],['goldcard','m1']],
[['pots3'],['upgrade'],['upcard','h3']],
[['goldpot'],['defends'],['card5','h1']]
];
var labels={color:'無色カード報酬',goldpots:'2ゴールドとポーション2個',starters:'スターターのストライク1枚と防御1枚を強化',card:'カード報酬',gold8:'8ゴールド',remove:'カード1枚を除去',relic:'レリック1個',transformup:'カード1枚を変化させて強化',strikes:'スターターのストライク2枚を強化',colorup:'強化済み無色カード報酬',transform:'カード1枚を変化',randomrare:'ランダムなレアカード1枚',upcard:'強化済みカード報酬',remove2:'カード2枚を除去',rare:'レアカード報酬',upgrade:'カード1枚を強化',gold11:'11ゴールド',defends:'スターターの防御2枚を除去',relic3:'レリック3個から1個選ぶ',goldpot:'3ゴールドとポーション1個',randomcolor2:'ランダムな無色カード2枚',randomcard2:'ランダムな報酬カード2枚',randomcolorup:'ランダムな無色カード1枚を強化して得る',gold5:'5ゴールド',goldcard:'3ゴールドとカード報酬',pots3:'ポーション3個',card5:'5枚から選ぶカード報酬'};
var costs={m1:'最大HP−1',m2:'最大HP−2',h1:'HP−1',h2:'HP−2',h3:'HP−3',g3:'3ゴールドを失う',curse:'呪い1枚'};
async function colorReward(g,p,up){var cs=g.revealCards(p,'colorless',3);if(!cs.length)return;var i=await g.ask(p.i,{type:'cardReward',title:'ハートの恩恵：無色カード報酬',cards:cs.map(function(c,i){return {idx:i,id:c.id,up:up};}),skip:true});if(cs[i]){var c=cs.splice(i,1)[0];await g.addCard(p,c.id,up);}g.returnCards(p,cs);}
async function apply(g,p,key){var i,id,cs;switch(key){case 'card':return g.cardReward(p,'normal',3);case 'card5':return g.cardReward(p,'normal',5);case 'upcard':return g.cardReward(p,'upgraded',3);case 'rare':return g.cardReward(p,'rare',3);case 'color':return colorReward(g,p,false);case 'colorup':return colorReward(g,p,true);case 'gold8':g.gainGold(p,8);break;case 'gold11':g.gainGold(p,11);break;case 'gold5':g.gainGold(p,5);break;case 'goldpots':g.gainGold(p,2);for(i=0;i<2;i++)await g.offerPotion(p);break;case 'goldpot':g.gainGold(p,3);await g.offerPotion(p);break;case 'goldcard':g.gainGold(p,3);await g.cardReward(p,'normal',3);break;case 'pots3':for(i=0;i<3;i++)await g.offerPotion(p);break;case 'remove':return g.removeCards(p,1);case 'remove2':return g.removeCards(p,2);case 'upgrade':return g.upgradeCards(p,1);case 'strikes':return g.upgradeCards(p,2,'強化するストライク2枚',function(c){return /^Strike[RGBWSUHM]$/.test(c.id);});case 'starters':await g.upgradeCards(p,1,'強化するストライク',function(c){return /^Strike[RGBWSUHM]$/.test(c.id);});return g.upgradeCards(p,1,'強化する防御',function(c){return /^Defend[RGBWSUHM]$/.test(c.id);});case 'defends':cs=await g.pickDeck(p,g.removable(p).filter(function(c){return /^Defend[RGBWSUHM]$/.test(c.id);}),2,2,'除去する防御2枚');for(i=0;i<cs.length;i++)await g.removeCard(p,cs[i]);break;case 'transform':return g.transformCards(p,1);case 'transformup':cs=await g.pickDeck(p,g.removable(p),1,1,'変化させるカード');if(cs[0]){var c=await g.transformCard(p,cs[0]);if(c)c.up=true;}break;case 'randomrare':id=p.rareDeck.pop();if(id)await g.addCard(p,id,false);break;case 'randomcolor2':case 'randomcolorup':for(i=0;i<(key==='randomcolor2'?2:1);i++){id=g.run.decks.colorless.pop();if(id)await g.addCard(p,id,key==='randomcolorup');}break;case 'randomcard2':for(i=0;i<2;i++){cs=g.revealCards(p,'normal',1);if(cs[0])await g.addCard(p,cs[0].id,false);}break;case 'relic':return g.offerRelic(p,'normal');case 'relic3':var ids=[];for(i=0;i<3;i++){id=g.drawRelic('normal');if(id)ids.push(id);}if(!ids.length)break;var choice=await g.ask(p.i,{type:'option',title:'得るレリックを選択',options:ids.map(function(id){return {id:id,label:S.RELICS[id].name};})});if(ids.indexOf(choice)<0)choice=ids[0];await g.gainRelic(p,choice);ids.forEach(function(id){if(id!==choice)g.returnRelic(id);});break;}}
F.PARTS.heartsBoon=async function(g){var run=g.run,df=run.df;if(!df.boons){var deck=g.shuffle(F.BOONS.map(function(_,i){return i;}));df.boons={cards:run.players.map(function(){return deck.pop();}),states:{}};g.checkpoint();}
for(var pi=0;pi<run.players.length;pi++){var p=run.players[pi],st=df.boons.states[pi]||(df.boons.states[pi]={stage:0});if(st.stage===0){g.gainGold(p,3);st.stage=1;g.checkpoint();}if(st.stage===1){await g.cardReward(p,'normal',3,{title:'ハートの恩恵：カード報酬'});st.stage=2;g.checkpoint();}if(st.stage===2){var opts=F.BOONS[df.boons.cards[pi]];var pick=await g.ask(p.i,{type:'option',title:'ハートの恩恵：1つ選ぶ',options:opts.map(function(o,i){return {id:String(i),label:labels[o[0]]+(o[1]?'（'+costs[o[1]]+'）':'')};})});st.choice=opts[Math.max(0,Math.min(2,parseInt(pick,10)||0))];if(g.recordOpeningChoice)g.recordOpeningChoice(p.i,labels[st.choice[0]]+(st.choice[1]?'（'+costs[st.choice[1]]+'）':''));st.stage=3;g.checkpoint();}if(st.stage===3){var cost=st.choice[1];if(cost&&cost[0]==='m'){p.maxHp=Math.max(1,p.maxHp-Number(cost[1]));p.hp=Math.min(p.hp,g.maxHp(p));}else if(cost&&cost[0]==='h')await g.loseHpOut(p,Number(cost[1]));else if(cost==='g3')p.gold=Math.max(0,p.gold-3);else if(cost==='curse')await g.gainCurse(p);st.stage=4;g.checkpoint();}if(st.stage===4){await apply(g,p,st.choice[0]);st.stage=5;g.checkpoint();}}
};
})(typeof window!=='undefined'?window:globalThis);

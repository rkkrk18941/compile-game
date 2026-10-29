/* Downfall printed shared cards/items. TTS 2026-07-23. IDs prefixed to preserve base-game card definitions.
   New pool: 17 relics, 8 boss faces (7 additions + revised Mark of Pain), 15 potion cards, 9 curse cards.
   The supplied colorless deck has 16 additional unique faces; all are implemented, including both sleeve sides. */
(function(root){'use strict';var S=root.STS,F=S.DF,C=S.Combat.prototype,G=S.Game.prototype,R=S.RELICS,P=S.POTIONS;
function u(k,a,b){return k.up?b:a;}function once(cb,pc,r){return r.usedCombat?'この戦闘では使用済みです。':null;}function target(cb,pc,n,name){return cb.damageTarget(pc,n,name+'：敵を選択');}
function relic(id,name,price,tx,o){R[id]=Object.assign({id:id,name:name,type:'normal',price:price,tx:tx,df:true},o||{});return R[id];}function die(f,fx){return {f:Array.isArray(f)?f:[f],fx:fx};}
function active(id,name,price,tx,fx,can){return relic(id,name,price,tx,{once:'combat',canActivate:function(cb,pc,r){return once(cb,pc,r)||(can&&can(cb,pc,r));},activate:async function(cb,pc,r){r.usedCombat=true;return fx(cb,pc,r);}});}
relic('DfTeleportationStone','瞬間移動の石',7,'ダイス2：1枚引く。ダイス3：ブロック2。',{die:[die(2,function(cb,pc){return cb.draw(pc,1);}),die(3,function(cb,pc){return cb.gainBlock(pc,2);})]});
active('DfThimbleHelm','指ぬき兜',7,'戦闘中1回：1エナジーを払いブロック2。',async function(cb,pc){pc.en--;await cb.gainBlock(pc,2);},function(cb,pc){return pc.en<1?'1エナジーが必要です。':null;});
relic('DfDuelingGlove','決闘の手袋',7,'ダイス1：1エナジー。ダイス2：2ダメージ。',{die:[die(1,function(cb,pc){cb.gainEnergy(pc,1);}),die(2,function(cb,pc){return target(cb,pc,2,'決闘の手袋');})]});
relic('DfSackOfGems','ジェムの袋',6,'ダイス2：ブロック1。3：1枚引く。4：1ダメージ。',{die:[die(2,function(cb,pc){return cb.gainBlock(pc,1);}),die(3,function(cb,pc){return cb.draw(pc,1);}),die(4,function(cb,pc){return target(cb,pc,1,'ジェムの袋');})]});
relic('DfBlackPowder','黒色火薬',8,'ダイス3：このターン次のアタックのコスト0。',{die:[die(3,function(cb,pc){pc.t.dfFreeAttack=(pc.t.dfFreeAttack||0)+1;})]});
relic('DfKunai','クナイ',7,'ダイス4：手札のアタック1枚につきブロック1。',{die:[die(4,function(cb,pc){return cb.gainBlock(pc,pc.hand.filter(function(c){return S.cdef(c).t==='A';}).length);})]});
relic('DfClaspedLocket','閉じたロケット',6,'ダイス4・5：2ダメージ。',{die:[die([4,5],function(cb,pc){return target(cb,pc,2,'閉じたロケット');})]});
relic('DfFuelCanister','燃料缶',9,'ダイス2・3：手札1枚を廃棄して1エナジーを得てもよい。',{die:[die([2,3],async function(cb,pc){var cs=await cb.pickCards(pc,'hand',0,1,'燃料缶：廃棄するカード（任意）');if(cs[0]){await cb.exhaustCard(pc,cs[0]);cb.gainEnergy(pc,1);}})]});
relic('DfSneckoEgg','スネッコの卵',6,'ダイス1・6：このターン次のカードのコスト1（コスト0も含む）。',{die:[die([1,6],function(cb,pc){pc.t.dfNextOne=-1;})]});
relic('DfGreedOoze','強欲な粘体',7,'ダイス1：2ダメージ。所持金7以上なら+5。',{die:[die(1,function(cb,pc){return target(cb,pc,cb.P(pc).gold>=7?7:2,'強欲な粘体');})]});
relic('DfPotionBelt','ポーションベルト',6,'ポーション所持上限+2。獲得時：ポーション2個。',{onGain:async function(g,p){await g.offerPotion(p);await g.offerPotion(p);}});
active('DfShotGlass','ショットグラス',9,'戦闘中1回：ポーション1個を捨てて筋力1。',async function(cb,pc){var p=cb.P(pc),opts=p.potions.map(function(id,i){return {id:String(i),label:P[id].name};});var i=Number(await cb.ask(pc,{type:'option',title:'捨てるポーション',options:opts}));if(!p.potions[i])return;var id=p.potions.splice(i,1)[0];cb.g.run.decks.potions.unshift(id);cb.gainStr(pc,1);},function(cb,pc){return cb.P(pc).potions.length?null:'捨てるポーションがありません。';});
active('DfMakeshiftBattery','即席電池',7,'戦闘中1回：手札に状態異常か呪いがあれば2エナジー。',function(cb,pc){cb.gainEnergy(pc,2);},function(cb,pc){return pc.hand.some(function(c){return ['T','C'].indexOf(S.cdef(c).t)>=0;})?null:'手札に状態異常か呪いが必要です。';});
relic('DfStraightRazor','剃刀',9,'休憩した時：カード1枚を変化させてもよい。');
active('DfUnceasingTop','永久コマ',5,'戦闘中1回：手札1枚以下なら3枚引く。',function(cb,pc){return cb.draw(pc,3);},function(cb,pc){return pc.hand.length>1?'手札1枚以下で使えます。':null;});
relic('DfPantograph','パンタグラフ',7,'ボス戦開始時：HPを4回復。',{startCombat:function(cb,pc){if(cb.s.kind==='boss')cb.healPlayer(pc,4);}});
active('DfBrokenSeal','破れた封印',8,'戦闘中1回：廃棄札2枚以上なら筋力1。',function(cb,pc){cb.gainStr(pc,1);},function(cb,pc){return pc.exh.length>=2?null:'廃棄札2枚以上が必要です。';});
function boss(id,name,tx,o){return relic(id,name,0,tx,Object.assign({type:'boss'},o||{}));}
boss('DfDentedPlate','凹んだ装甲','ターン開始時：HP5以上なら1エナジー。',{startTurn:function(cb,pc){if(cb.P(pc).hp>=5)cb.gainEnergy(pc,1);}});
boss('DfWheelOfChange','変化の輪','ダイス1：手札2枚を捨てる。2：2枚引く。3：2ダメージ。4：1エナジー。5：筋力1。6：ブロック1。',{die:[die(1,async function(cb,pc){var cs=await cb.pickCards(pc,'hand',2,2,'変化の輪：捨てるカード2枚');await cb.discardCards(pc,cs,true);}),die(2,function(cb,pc){return cb.draw(pc,2);}),die(3,function(cb,pc){return target(cb,pc,2,'変化の輪');}),die(4,function(cb,pc){cb.gainEnergy(pc,1);}),die(5,function(cb,pc){cb.gainStr(pc,1);}),die(6,function(cb,pc){return cb.gainBlock(pc,1);})]});
active('DfKnowingSkull','知識の頭蓋骨',0,'戦闘中1回：3枚引く。',function(cb,pc){return cb.draw(pc,3);});R.DfKnowingSkull.type='boss';
boss('DfBattleBuddies','戦友','ターン開始時：1エナジー。戦闘開始時：手札2枚を捨てる。',{startTurn:function(cb,pc){cb.gainEnergy(pc,1);},startCombat:async function(cb,pc){await cb.discardCards(pc,await cb.pickCards(pc,'hand',2,2,'戦友：捨てるカード2枚'),true);}});
boss('DfForbiddenFruit','禁断の果実','強化済みカード報酬、レアカード報酬、レリック1個、呪い1枚。すぐ使って捨てる。',{onGain:async function(g,p){await g.cardReward(p,'upgraded',3);await g.cardReward(p,'rare',3);await g.offerRelic(p,'normal');await g.gainCurse(p);g.loseRelic(p,'DfForbiddenFruit');g.returnRelic('DfForbiddenFruit');}});
boss('DfChronometer','クロノメーター','ターン開始時：次のカードのコスト1（コスト0も含む）。',{startTurn:function(cb,pc){pc.t.dfNextOne=-1;}});
boss('DfMarkOfPain','苦痛の刻印','ターン開始時：1エナジー。獲得時：最大HPを2失う。',{startTurn:function(cb,pc){cb.gainEnergy(pc,1);},onGain:function(g,p){p.maxHp=Math.max(1,p.maxHp-2);p.hp=Math.min(p.hp,g.maxHp(p));}});
active('DfShuriken','手裏剣',0,'戦闘中1回：このターンアタック3枚以上を使っていれば筋力1。',function(cb,pc){cb.gainStr(pc,1);},function(cb,pc){return pc.t.attacks>=3?null:'アタック3枚以上が必要です。';});R.DfShuriken.type='boss';
function potion(id,name,price,tx,copies,use,out){P[id]={id:id,name:name,price:price,tx:tx,copies:copies,df:true,use:use,out:out};}
potion('DfTransformingBrew','変化の醸造酒',4,'手札1枚を変化させ、得たカードを手札に加える。',1,async function(cb,pc){var cs=await cb.pickCards(pc,'hand',1,1,'変化させる手札');if(!cs[0])return;var c=cs[0],p=cb.P(pc),original=p.deck.filter(function(x){return x.u===c.u;})[0];if(!original)return;cb.leaveHand(pc,c);var n=await cb.g.transformCard(p,original);if(n)pc.hand.push(Object.assign({},n));});
potion('DfEnergyDrink','エナジードリンク',2,'このターン次のカードのコスト0。',2,function(cb,pc){pc.t.dfFreeAny=-1;});
potion('DfMysteryPotion','謎のポーション',2,'ダイス1・2：4ダメージ。3・4：3枚引く。5・6：2エナジー。',2,function(cb,pc){var d=cb.s.die;if(d<=2)return target(cb,pc,4,'謎のポーション');if(d<=4)return cb.draw(pc,3);cb.gainEnergy(pc,2);});
potion('DfPizzazPotion','華麗なポーション',3,'次のアタック1回だけ筋力2。',1,function(cb,pc){var n=cb.gainStr(pc,2);pc.akabeko=(pc.akabeko||0)+n;});
potion('DfGreedPotion','強欲のポーション',3,'所持金と同じダメージ。',1,function(cb,pc){return target(cb,pc,cb.P(pc).gold,'強欲のポーション');});
potion('DfLiquidVoid','液体虚無',3,'廃棄札1枚を手札へ。このターンのコスト0。',1,async function(cb,pc){var c=(await cb.pickCards(pc,pc.exh,1,1,'手札に戻す廃棄札'))[0];if(c){pc.exh.splice(pc.exh.indexOf(c),1);pc.hand.push(c);c.cm=0;}});
function restore(g,p){var start=S.DATA.CHARS[p.ch].hp+S.DATA.MODES[g.run.mode||'normal'].hp-(g.run.asc>=2?1:0);p.maxHp=Math.max(p.maxHp,Math.min(start,p.maxHp+1));g.heal(p,1);}
potion('DfFruitJuice','フルーツジュース',3,'失った最大HPを1戻し、HPを1回復。',1,function(cb,pc){restore(cb.g,cb.P(pc));},restore);
potion('DfCleverConcoction','巧妙な調合薬',3,'手札7枚になるまで引く。',1,function(cb,pc){return cb.draw(pc,Math.max(0,7-pc.hand.length));});
potion('DfDestinyDraught','運命の霊薬',3,'任意のダイスレリックの能力1個を発動。効果は持ち主が得る。',1,function(cb,pc){return cb.g.triggerDieAbility(cb,pc,{anyOwner:true});});
potion('DfCultistPotion','狂信者のポーション',4,'HPを1失い、筋力1。',1,async function(cb,pc){await cb.loseHp(pc,1);if(!pc.dead)cb.gainStr(pc,1);});
potion('DfBottleOfNails','釘の瓶',4,'HPを1失う。2エナジー。3枚引く。',1,async function(cb,pc){await cb.loseHp(pc,1);if(pc.dead)return;cb.gainEnergy(pc,2);await cb.draw(pc,3);});
potion('DfCactusJuice','サボテンジュース',3,'手札の状態異常を全て廃棄し、その数だけ引く。',1,async function(cb,pc){var cs=pc.hand.filter(function(c){return S.cdef(c).t==='T';});for(var i=0;i<cs.length;i++)await cb.exhaustCard(pc,cs[i]);await cb.draw(pc,cs.length);});
potion('DfWhaleAle','鯨のエール',3,'全プレイヤーが2枚引く。1人なら4枚。',1,async function(cb){for(var ps=cb.pcs(),i=0;i<ps.length;i++)await cb.draw(ps[i],ps.length===1?4:2);});
/* Colorless faces: first 16 entries of 80fcb6/7f7cc9. */
function card(id,name,en,t,c,cu,tx,play,o){S.CARDS[id]=Object.assign({id:id,name:name,en:en,ch:'C',df:true,t:t,c:c,cu:cu,tx:tx,play:play},o||{});}
card('DfBite','噛みつき','Bite','A',1,1,['2ダメージ。HP4以下ならブロック2。','3ダメージ。HP4以下ならブロック3。'],async function(k){await k.atk([u(k,2,3)]);if(k.cb.P(k.pc).hp<=4)await k.blk(u(k,2,3));},{tg:'E'});
card('DfDeepBreath','深呼吸','Deep Breath','S',1,1,['ブロック2。廃棄札1枚を捨て札に戻す。廃棄。','ブロック3。廃棄札2枚を捨て札に戻す。廃棄。'],async function(k){await k.blk(u(k,2,3));var cs=await k.pick(k.pc.exh,u(k,1,2),u(k,1,2),'捨て札に戻す廃棄札');for(var i=0;i<cs.length;i++){k.pc.exh.splice(k.pc.exh.indexOf(cs[i]),1);k.pc.disc.push(cs[i]);}},{ex:true});
card('DfForethought','先見','Forethought','S',0,0,['保留。前ターンに保留していれば2枚引く。','保留。前ターンに保留していれば3枚引く。'],function(k){if(k.card.wasRetained)return k.draw(u(k,2,3));},{ret:true});
card('DfJackOfAllTrades','万能','Jack of All Trades','A',2,2,['手札のスキル1枚につき1ダメージ。他のアタック1枚につきブロック1。','手札のスキル1枚につき2ダメージ。他のアタック1枚につきブロック1。'],async function(k){await k.atk([k.pc.hand.filter(function(c){return S.cdef(c).t==='S';}).length*u(k,1,2)]);await k.blk(k.pc.hand.filter(function(c){return S.cdef(c).t==='A';}).length);},{tg:'E'});
card('DfLastStand','最後の抵抗','Last Stand','P',2,2,['脱力・弱体化を得なくなる。使用時：ブロック4、脱力・弱体化を全て除く。','脱力・弱体化を得なくなる。使用時：ブロック6、脱力・弱体化を全て除く。'],async function(k){await k.blk(u(k,4,6));k.pc.weak=0;k.pc.vuln=0;});
async function secret(k,t){var top=k.pc.draw.slice(-3);await k.scry(3);var cs=top.filter(function(c){return S.cdef(c).t===t;});var c=(await k.pick(cs,0,1,'手札に加えるカード（任意）'))[0];if(c){var a=k.pc.draw.indexOf(c),b=k.pc.disc.indexOf(c);if(a>=0)k.pc.draw.splice(a,1);else if(b>=0)k.pc.disc.splice(b,1);else return;k.pc.hand.push(c);await k.cb.onDrawn(k.pc,c);}}
card('DfSecretTechnique','秘密の技術','Secret Technique','S',0,0,['占術3。公開したスキル1枚を手札に加えてもよい。廃棄。','占術3。公開したスキル1枚を手札に加えてもよい。'],function(k){return secret(k,'S');},{ex:[true,false]});
card('DfSecretWeapon','秘密兵器','Secret Weapon','S',0,0,['占術3。公開したアタック1枚を手札に加えてもよい。廃棄。','占術3。公開したアタック1枚を手札に加えてもよい。'],function(k){return secret(k,'A');},{ex:[true,false]});
card('DfPanicButton','緊急ボタン','Panic Button','P',0,0,['使用時：ブロック5。その後ブロックを得られない。ターン開始時：キューブを1個置く。2個なら廃棄。','使用時：ブロック7。その後ブロックを得られない。ターン開始時：キューブを1個置く。2個なら廃棄。'],function(k){return k.blk(u(k,5,7));},{pw:{startTurn:async function(cb,pc,p){p.n++;if(p.n>=2)await cb.removePower(pc,p,true);}}});
card('DfRitualDagger','儀式の短剣','Ritual Dagger','A',0,0,['3ダメージ。これで倒したら2エナジー。廃棄。','4ダメージ。これで倒したら3エナジー。廃棄。'],async function(k){var r=await k.atk([u(k,3,4)]);if(r.killed)k.energy(u(k,2,3));},{tg:'E',ex:true});
card('DfShapersBlessing','造物主の祝福','Shaper\'s Blessing','P',2,2,['ターン終了時：キューブ1個を置いてブロック2。2個なら廃棄。','ターン終了時：キューブ1個を置いてブロック2。3個なら廃棄。'],null,{pw:{endTurn:async function(cb,pc,p){p.n++;await cb.gainBlock(pc,2);if(p.n>=(p.up?3:2))await cb.removePower(pc,p,true);}}});
card('DfBloodShots','血の射撃','Blood Shots','A',3,3,['2ダメージを3回。','2ダメージを4回。'],function(k){return k.atk(Array(u(k,3,4)).fill(2));},{tg:'E'});
card('DfChronoboost','時間加速','Chronoboost','P',2,1,['山札をシャッフルするたび筋力1。','山札をシャッフルするたび筋力1。']);
card('DfCuriosity','好奇心','Curiosity','P',3,2,['他のパワーを使うたび筋力1。','他のパワーを使うたび筋力1。']);
card('DfInvincible','無敵','Invincible','P',3,2,['ターン終了時：このカードを廃棄し、このラウンドのHP損失を全て防いでもよい。','ターン終了時：このカードを廃棄し、このラウンドのHP損失を全て防いでもよい。'],null,{pw:{endTurn:async function(cb,pc,p){var yes=await cb.ask(pc,{type:'confirm',title:'無敵を廃棄して、このラウンドのHP損失を全て防ぎますか？',yes:'防ぐ',no:'保持する'});if(yes){pc.dfPreventRound=cb.s.round;await cb.removePower(pc,p,true);}}}});
card('DfVirus','ウイルス','Virus','A',1,1,['山札の上2枚を廃棄する。廃棄札枚数分のダメージ。','山札の上3枚を廃棄する。廃棄札枚数分のダメージ。'],async function(k){for(var i=0;i<u(k,2,3)&&k.pc.draw.length;i++)await k.cb.exhaustCard(k.pc,k.pc.draw[k.pc.draw.length-1]);await k.atk([k.pc.exh.length]);},{tg:'E'});
card('DfYouAreMine','お前は我がもの','YOU ARE MINE!','S',3,3,['ブロック2。弱体化2、脱力2。廃棄。','ブロック2。弱体化3、脱力3。廃棄。'],async function(k){await k.blk(2);await k.vuln(null,u(k,2,3));await k.weak(null,u(k,2,3));},{tg:'E',ex:true});
/* Nine new physical Curse cards: Scatterbrained x2 and seven other faces. */
function curse(id,name,en,c,tx,n,play,o){S.CARDS[id]=Object.assign({id:id,name:name,en:en,ch:'X',t:'C',c:c,cu:c,df:true,copies:n,tx:[tx,tx],play:play,noUpgrade:true},o||{});}
curse('DfScatterbrained','散漫','Scatterbrained',1,'1枚引く。',2,function(k){return k.draw(1);});
curse('DfIcky','不快','Icky',null,'使用不可。ターン終了時：手札にあればめまい1枚を得て、このカードを廃棄。',1,null,{unplayable:true});
curse('DfPride','傲慢','Pride',1,'使用時：廃棄。ターン終了時：手札にあれば山札の上へ置く。',1,null,{ex:true});
curse('DfNormality','平凡','Normality',null,'使用不可。手札にあり、手札が2枚以下ならカードを使えない。',1,null,{unplayable:true});
curse('DfFlawed','欠陥','Flawed',0,'1枚引く。1ダメージを受ける（ブロック可）。',1,async function(k){await k.draw(1);await k.cb.damagePlayer(k.pc,1,{curse:true});});
curse('DfHaunted','憑依','Haunted',1,'手札にある間、他のカードを使えない。使用時：廃棄。',1,null,{ex:true});
curse('DfAged','老化','Aged',0,'1枚引く。HPを1失う。廃棄。',1,async function(k){await k.draw(1);await k.loseHp(1);},{ex:true});
curse('DfForgetful','忘却','Forgetful',0,'山札の一番上を廃棄。廃棄。',1,async function(k){if(k.pc.draw.length)await k.cb.exhaustCard(k.pc,k.pc.draw[k.pc.draw.length-1]);},{ex:true});
F.expansionRun=function(run){return F.adventureOf(run)==='downfall'||run.players.some(function(p){return S.DATA.DF_CHARS.indexOf(p.ch)>=0;});};
var setup=G.setupDecks;G.setupDecks=function(){setup.call(this);var d=this.run.decks;if(!F.expansionRun(this.run)){d.relics=d.relics.filter(function(id){return !R[id].df;});d.bossRelics=d.bossRelics.filter(function(id){return !R[id].df;});d.potions=d.potions.filter(function(id){return !P[id].df;});d.curses=d.curses.filter(function(id){return !S.CARDS[id].df;});d.colorless=d.colorless.filter(function(id){return !S.CARDS[id].df;});}else{d.bossRelics=d.bossRelics.filter(function(id){return id!=='MarkOfPain';});if(!d.colorless.length)d.colorless=this.shuffle(Object.keys(S.CARDS).filter(function(id){return S.CARDS[id].ch==='C';}));}};
var block=C.gainBlock;C.gainBlock=function(pc,n,o){if(this.powCount(pc,'DfPanicButton'))return Promise.resolve(0);return block.call(this,pc,n,o);};
['weakPlayer','vulnPlayer'].forEach(function(key){var old=C[key];C[key]=function(pc,n){if(this.powCount(pc,'DfLastStand'))return 0;return old.call(this,pc,n);};});
var loss=C.loseHp;C.loseHp=function(pc,n,o){if(pc.dfPreventRound===this.s.round)return Promise.resolve(0);return loss.call(this,pc,n,o);};
F.on('onShuffle',function(cb,pc){for(var i=0;i<cb.powCount(pc,'DfChronoboost');i++)cb.gainStr(pc,1);});
F.on('afterPlay',function(cb,pc,c){if(S.cdef(c).t==='P')pc.pow.forEach(function(p){if(p.id==='DfCuriosity'&&p.u!==c.u)cb.gainStr(pc,1);});});
F.on('endTurn',async function(cb,pc){for(var cs=pc.hand.slice(),i=0;i<cs.length;i++){var c=cs[i];if(c.de)continue;if(c.id==='DfIcky'){await cb.addStatus(pc,'Daze',1,'drawTop');await cb.exhaustCard(pc,c);}if(c.id==='DfPride'){cb.leaveHand(pc,c);pc.draw.push(c);}}});
var can=C.canPlay;C.canPlay=function(pc,c,q){if(pc.hand.some(function(x){return x.id==='DfHaunted'&&x!==c;}))return '憑依を先に使ってください。';if(pc.hand.length<=2&&pc.hand.some(function(x){return x.id==='DfNormality';}))return '平凡：手札2枚以下ではカードを使えません。';return can.call(this,pc,c,q);};
var cost=F.costExtra;F.costExtra=function(cb,pc,c,n){if(cost)n=cost(cb,pc,c,n);if(pc.t.dfFreeAny&&pc.t.dfFreeAny!==c.u)n=0;return n;};
var before=F.beforePlay;F.beforePlay=async function(cb,pc,c,o){if(before)await before(cb,pc,c,o);if(pc.t.dfFreeAny&&pc.t.dfFreeAny!==c.u)delete pc.t.dfFreeAny;};
F.afterRest=async function(g,p){if(g.relicOf(p,'DfStraightRazor')){var cs=await g.pickDeck(p,g.removable(p),0,1,'剃刀：変化させるカード（任意）');if(cs[0])await g.transformCard(p,cs[0]);}};
})(typeof window!=='undefined'?window:globalThis);

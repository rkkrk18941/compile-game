/* Official Downfall TTS saved 2026-07-23: HX_Starter/Rewards/Rare printed faces, v1.47.
   Starter 10; reward 61 including two Golden Tickets; rare 16. */
(function(root){'use strict';var S=root.STS,F=S.DF,C=S.Combat.prototype;
function u(k,a,b){return k.up?b:a;}function h(k,n){return k.heat()>=n;}function ex(k){return k.pc.exh.length>=2;}
function card(id,en,name,t,c,cu,r,n,tx,play,o){return S.CARDS[id]=Object.assign({id:id,en:en,name:name,t:t,c:c,cu:cu,r:r,copies:n,ch:'H',df:true,tx:tx,play:play},o||{});}
function pow(id,en,name,c,cu,r,tx,pw,play){return card(id,en,name,'P',c,cu,r,1,tx,play,{pw:pw||{}});}
function blk(k,n){return k.blk(n,k.player);}async function exhaust(k){return k.exhaustHand(1,1);}
card('StrikeH','Strike','ストライク','A',1,1,'S',4,['1ダメージ。','2ダメージ。'],function(k){return k.atk([u(k,1,2)]);},{tg:'E'});
card('DefendH','Defend','防御','S',1,1,'S',4,['ブロック1。','任意のプレイヤーにブロック2。'],async function(k){return k.blk(u(k,1,2),k.up?await k.playerSel():null);});
card('Kindle','Kindle','火をつける','S',1,1,'S',1,['ブロック1。前進。','ブロック2。前進。'],async function(k){await k.blk(u(k,1,2));await k.advance();});
card('Sear','Sear','焦がす','A',0,0,'S',1,['1ダメージ。ヒート2以上：+1。','2ダメージ。ヒート2以上：+1。'],function(k){return k.atk([u(k,1,2)+(h(k,2)?1:0)]);},{tg:'E'});
card('AdvancingGuard','Advancing Guard','前進防御','S',2,2,'C',2,['任意のプレイヤーにブロック2。前進。','任意のプレイヤーにブロック3。前進。'],async function(k){await blk(k,u(k,2,3));await k.advance();},{tg:'P'});
card('BurningTouch','Burning Touch','燃える手','A',2,2,'C',2,['2ダメージ。ソウルバーン1。','3ダメージ。ソウルバーン1。'],async function(k){await k.atk([u(k,2,3)]);await k.soulburn();},{tg:'E'});
card('Firestarter','Firestarter','火付け役','A',1,1,'C',2,['2ダメージ。2枚引く。廃棄。','3ダメージ。3枚引く。廃棄。'],async function(k){await k.atk([u(k,2,3)]);await k.draw(u(k,2,3));},{tg:'E',ex:true});
card('FlareFlick','Flare Flick','炎弾','A',1,1,'C',2,['範囲に1ダメージ。ヒート2以上：範囲にさらに1ダメージ。','範囲に1ダメージ。ヒート2以上：範囲にさらに1ダメージを2回。'],async function(k){await k.aoe([1]);if(h(k,2))await k.aoe(Array(u(k,1,2)).fill(1));},{tg:'R'});
card('FleetingFlash','Fleeting Flash','一瞬の閃光','S',1,0,'C',2,['ソウルバーン1。廃棄。','ソウルバーン1。廃棄。'],function(k){return k.soulburn();},{ex:true});
card('GhostLash','Ghost Lash','幽霊の鞭','A',0,0,'C',2,['1ダメージ。廃棄札2枚以上：さらに1ダメージ。','1ダメージ。廃棄札2枚以上：さらに1ダメージを2回。'],async function(k){await k.atk([1]);if(ex(k))await k.atk(Array(u(k,1,2)).fill(1));},{tg:'E'});
card('PremonitionH','Premonition','予感','S',1,1,'C',2,['ブロック2。ヒート3以上：2枚引く。','ブロック3。ヒート3以上：2枚引く。'],async function(k){await k.blk(u(k,2,3));if(h(k,3))await k.draw(2);});
card('ShieldOfNight','Shield of Night','夜の盾','S',2,2,'C',2,['ブロック3。手札1枚を廃棄。','ブロック4。手札1枚を廃棄。'],async function(k){await k.blk(u(k,3,4));await exhaust(k);});
card('SwordOfNight','Sword of Night','夜の剣','A',1,1,'C',2,['2ダメージ。手札1枚を廃棄。','3ダメージ。手札1枚を廃棄。'],async function(k){await k.atk([u(k,2,3)]);await exhaust(k);},{tg:'E'});
card('ThermalTransfer','Thermal Transfer','熱伝達','A',1,1,'C',2,['1ダメージ。前進。','2ダメージ。前進。'],async function(k){await k.atk([u(k,1,2)]);await k.advance();},{tg:'E'});
card('GhostShield','Ghost Shield','幽霊の盾','S',0,0,'C',2,['ブロック1。廃棄札2枚以上：さらにブロック1。','ブロック2。廃棄札2枚以上：さらにブロック1。'],async function(k){await k.blk(u(k,1,2));if(ex(k))await k.blk(1);});
card('Floatwork','Floatwork','浮遊術','S',2,2,'C',2,['ブロック2。ソウルバーン1。','ブロック3。ソウルバーン1。'],async function(k){await k.blk(u(k,2,3));await k.soulburn();});
card('NightmareStrike','Nightmare Strike','悪夢の一撃','A',1,1,'C',2,['2ダメージ。このカードを廃棄した時、筋力1。','3ダメージ。このカードを廃棄した時、筋力1。'],function(k){return k.atk([u(k,2,3)]);},{tg:'E',onExhaust:function(cb,pc){cb.gainStr(pc,1);}});
card('HeatCrush','Heat Crush','熱圧','A',1,1,'C',2,['2ダメージ。このターン次に使うソウルバーンのダメージ+1。','2ダメージ。このターン次に使うソウルバーンのダメージ+3。'],async function(k){await k.atk([2]);k.pc.t.soulBonus=(k.pc.t.soulBonus||0)+u(k,1,3);},{tg:'E'});
card('FastForward','Fast Forward','早送り','S',1,1,'C',2,['2枚引く。前進。','3枚引く。前進。'],async function(k){await k.draw(u(k,2,3));await k.advance();});
card('FloatH','Float','浮遊','S',1,1,'U',1,['2エナジー。ヒート4以上：さらに1エナジー。廃棄。','3エナジー。ヒート4以上：さらに1エナジー。廃棄。'],function(k){k.energy(u(k,2,3)+(h(k,4)?1:0));},{ex:true});
card('HeatMetal','Heat Metal','灼熱の金属','A',1,1,'U',1,['2ダメージ。このターンにソウルバーンを使っていれば2枚引く。','3ダメージ。このターンにソウルバーンを使っていれば2枚引く。'],async function(k){await k.atk([u(k,2,3)]);if(k.pc.t.soulUsed)await k.draw(2);},{tg:'E'});
card('WhisperFromBeyond','Whisper from Beyond','彼岸の囁き','A',1,1,'U',1,['1ダメージを2回。廃棄札2枚以上：脱力1。','1ダメージを3回。廃棄札2枚以上：脱力1。'],async function(k){await k.atk(Array(u(k,2,3)).fill(1));if(ex(k))await k.weak();},{tg:'E'});
pow('HeatShield','Heat Shield','熱の盾',2,2,'U',['毎ターン1回：ソウルバーンを使うとブロック2。','毎ターン1回：ソウルバーンを使うとブロック3。']);
card('FlamesFromBeyond','Flames from Beyond','彼岸の炎','A',2,2,'U',1,['範囲に2ダメージ。廃棄札1枚につき+1。','範囲に3ダメージ。廃棄札1枚につき+1。'],function(k){return k.aoe([u(k,2,3)+k.pc.exh.length]);},{tg:'R'});
card('DevourFlame','Devour Flame','炎を喰らう','S',1,1,'U',1,['ブロック2。このターン次のカードを廃棄する。','ブロック3。このターン次のカードを廃棄する。'],async function(k){await k.blk(u(k,2,3));k.pc.t.dfExhaustNext=k.card.u;});
card('Hexaguard','Hexaguard','六角防御','S',1,1,'U',1,['ヒートと同じブロック。廃棄。','ヒートと同じブロック。'],function(k){return k.blk(k.heat());},{ex:[true,false]});
card('BadOmen','Bad Omen','凶兆','S',1,1,'U',1,['ブロック2。ヒート2以上：脱力2。後退。','ブロック3。ヒート2以上：脱力2。後退。'],async function(k){await k.blk(u(k,2,3));if(h(k,2))await k.weak(await k.enemy(),2);await k.retract();});
card('CatchUp','Catch Up','追いつく','S','X','X','U',1,['X回前進。廃棄。','X+1回前進。廃棄。'],function(k){return k.advance(k.x+u(k,0,1));},{ex:true});
card('ChargedBarrage','Charged Barrage','充填斉射','A',2,2,'U',1,['範囲に3ダメージ。ヒート4以上：+2。','範囲に4ダメージ。ヒート4以上：+2。'],function(k){return k.aoe([u(k,3,4)+(h(k,4)?2:0)]);},{tg:'R'});
card('DividerH','Divider','分断','A',2,2,'U',1,['1ダメージをヒートの数だけ。','1ダメージをヒート+1回。'],function(k){return k.atk(Array(k.heat()+u(k,0,1)).fill(1));},{tg:'E'});
pow('EmpoweredFlame','Empowered Flame','強化された炎',1,0,'U',['ターン開始時：前進。','ターン開始時：前進。'],{startTurn:function(cb,pc){return cb.heatStep(pc,1,1);}});
card('HauntedHand','Haunted Hand','憑かれた手','S',1,1,'U',1,['ヒート2以上：筋力1、後退。廃棄。','ヒート2以上：筋力1、後退。'],async function(k){if(h(k,2)){k.str(1);await k.retract();}},{ex:[true,false]});
card('HauntingEcho','Haunting Echo','不気味な反響','A',1,1,'U',1,['2ダメージ。ヒート5以上：このターン最後に誰かが使ったアタックのコピーを使う。','3ダメージ。ヒート5以上：このターン最後に誰かが使ったアタックのコピーを使う。'],async function(k){await k.atk([u(k,2,3)]);var last=k.cb.s.lastAttack;if(h(k,5)&&last&&!k.copy){var c={u:k.g.uid(),id:last.id,up:last.up,tmp:true};var z=k.cb.ctx(k.pc,c,{x:last.x,copy:true});await k.cb.resolve(z);await k.cb.afterResolution(k.pc,c,z);}},{tg:'E'});
pow('LingeringShades','Lingering Shades','残る影',2,1,'U',['毎ターン1回：1エナジーを払ってソウルバーン1。','毎ターン1回：1エナジーを払ってソウルバーン1。'],{activate:async function(cb,pc){if(pc.en<1)throw new Error('1エナジーが必要です。');pc.en--;await cb.gainSoulburn(pc,1);}});
card('LivingBomb','Living Bomb','生ける爆弾','S',2,1,'U',1,['ソウルバーン1を得て、全てすぐに使う。それぞれ任意の列にダメージ。','ソウルバーン1を得て、全てすぐに使う。それぞれ任意の列にダメージ。'],async function(k){await k.soulburn();while(k.pc.soul>0&&!k.cb.s.over){k.pc.soul--;await k.cb.soulburnDamage(k.pc,null,{area:true});}});
card('NightmareGuise','Nightmare Guise','悪夢の装い','S',1,1,'U',1,['ブロック2。このカードを廃棄した時、2回前進。','ブロック3。このカードを廃棄した時、2回前進。'],function(k){return k.blk(u(k,2,3));},{onExhaust:function(cb,pc){return cb.heatStep(pc,1,2);}});
card('NightmareVision','Nightmare Vision','悪夢の幻視','S',1,1,'U',1,['2枚引く。このカードを廃棄した時、2エナジー。','3枚引く。このカードを廃棄した時、2エナジー。'],function(k){return k.draw(u(k,2,3));},{onExhaust:function(cb,pc){cb.gainEnergy(pc,2);}});
card('PhantomFireball','Phantom Fireball','幻影の火球','A',0,0,'U',1,['1ダメージ。ヒート4以上：ソウルバーン1。','1ダメージ。ヒート2以上：ソウルバーン1。'],async function(k){await k.atk([1]);if(h(k,u(k,4,2)))await k.soulburn();},{tg:'E'});
pow('RainOfEmbers','Rain of Embers','残り火の雨',1,0,'U',['毎ターン1回：カードを廃棄した時、ソウルバーン1。','毎ターン1回：カードを廃棄した時、ソウルバーン1。']);
card('RewindH','Rewind','巻き戻し','S',1,1,'U',1,['手札1枚を廃棄。3枚引く。後退。','手札1枚を廃棄。4枚引く。後退。'],async function(k){await exhaust(k);await k.draw(u(k,3,4));await k.retract();});
card('SearingWound','Searing Wound','焼けつく傷','A',1,1,'U',1,['2ダメージ。弱体化1。後退。','3ダメージ。弱体化1。後退。'],async function(k){await k.atk([u(k,2,3)]);await k.vuln();await k.retract();},{tg:'E'});
card('SeventhEye','Seventh Eye','第7の目','A',2,2,'U',1,['2ダメージ、ブロック2。ヒート5以上：脱力1、弱体化1。','2ダメージ、ブロック2。ヒート4以上：脱力1、弱体化1。'],async function(k){await k.atk([2]);await k.blk(2);if(h(k,u(k,5,4))){await k.weak();await k.vuln();}},{tg:'E'});
card('SpectralGrace','Spectral Grace','霊妙な恩恵','S',1,1,'U',1,['任意のプレイヤーにブロック3。廃棄。','任意のプレイヤーにブロック4。廃棄。'],function(k){return blk(k,u(k,3,4));},{tg:'P',ex:true});
card('StokeTheFire','Stoke the Fire','炎をあおる','S',4,4,'U',1,['筋力1。廃棄札1枚につきコスト−1。廃棄。','筋力1。廃棄札1枚につきコスト−1。'],function(k){k.str(1);},{ex:[true,false],costFn:function(cb,pc,c,n){return n-pc.exh.length;}});
card('TurnItUp','Turn It Up','熱を上げる','S',1,1,'U',1,['前進。その後ヒート5以上なら筋力1。','前進。その後ヒート4以上なら筋力1。'],async function(k){await k.advance();if(h(k,u(k,5,4)))k.str(1);});
pow('VolcanoVisage','Volcano Visage','火山の面',1,0,'U',['前進するたびブロック1。','前進するたびブロック1。']);
pow('WorthySacrifice','Worthy Sacrifice','価値ある犠牲',1,0,'U',['ターン開始時：手札1枚を廃棄してブロック1。','ターン開始時：手札1枚を廃棄してブロック1。'],{startTurn:async function(cb,pc){var a=await cb.pickCards(pc,'hand',1,1,'価値ある犠牲：廃棄するカード');if(a[0]){await cb.exhaustCard(pc,a[0]);await cb.gainBlock(pc,1);}}});
card('TimeOfNeed','Time of Need','必要な時','S',0,0,'U',1,['保留。ブロック1。手札1枚を廃棄。','保留。ブロック2。手札1枚を廃棄。'],async function(k){await k.blk(u(k,1,2));await exhaust(k);},{ret:true});
pow('DevilsDance','Devil\'s Dance','悪魔の踊り',2,1,'R',['ターン開始時：1エナジー。1枚引く。後退。','ターン開始時：1エナジー。1枚引く。後退。'],{startTurn:async function(cb,pc){cb.gainEnergy(pc,1);await cb.draw(pc,1);await cb.heatStep(pc,-1,1);}});
card('BrightRitual','Bright Ritual','輝く儀式','S',1,1,'R',1,['ヒート3以上：脱力2、弱体化2。各トークンは別々の対象にできる。2回後退。','ヒート3以上：脱力3、弱体化3。各トークンは別々の対象にできる。2回後退。'],async function(k){if(h(k,3))for(var v=0;v<2;v++)for(var i=0;i<u(k,2,3);i++){var e=await k.enemy();if(v)await k.vuln(e,1);else await k.weak(e,1);}await k.retract(2);});
card('Incineration','Incineration','焼尽','S',2,1,'R',1,['ソウルバーンを全てすぐに使う。使った数だけソウルバーンを得る。廃棄。','ソウルバーンを全てすぐに使う。使った数だけソウルバーンを得る。廃棄。'],async function(k){var n=k.pc.soul||0;for(var i=0;i<n&&!k.cb.s.over;i++){k.pc.soul--;await k.cb.soulburnDamage(k.pc);}await k.soulburn(n);},{ex:true});
pow('InfernalForm','Infernal Form','地獄の姿',3,3,'R',['ターン開始時：ヒート6なら6回後退して筋力2。それ以外は2回前進。','ターン開始時：ヒート6なら6回後退して筋力3。それ以外は2回前進。'],{startTurn:async function(cb,pc,p){if(cb.heatOf(pc)===6){await cb.heatStep(pc,-1,6);cb.gainStr(pc,p.up?3:2);}else await cb.heatStep(pc,1,2);}});
pow('Poltergeist','Poltergeist','ポルターガイスト',1,1,'R',['前進か後退するたび2ダメージ。','前進か後退するたび3ダメージ。']);
card('DoomsdayH','Doomsday','終末','A',0,0,'R',1,['ヒート6：範囲に6ダメージ。','ヒート6：範囲に9ダメージ。'],async function(k){if(h(k,6))await k.aoe([u(k,6,9)],await k.rowSel());});
card('ForkedFlame','Forked Flame','枝分かれする炎','A',2,2,'R',1,['1ダメージを3回、または2ダメージと前進、または範囲に3ダメージ。','2ダメージを3回、または3ダメージと前進、または範囲に4ダメージ。'],async function(k){var a=await k.option([{id:'multi',label:u(k,1,2)+'ダメージを3回'},{id:'heat',label:u(k,2,3)+'ダメージと前進'},{id:'row',label:'範囲に'+u(k,3,4)+'ダメージ'}]);if(a==='row')await k.aoe([u(k,3,4)],await k.rowSel());else{await k.atk(a==='heat'?[u(k,2,3)]:Array(3).fill(u(k,1,2)),await k.enemy());if(a==='heat')await k.advance();}});
card('PowerFromBeyond','Power from Beyond','彼岸の力','S',2,1,'R',1,['廃棄札のアタック1枚につき筋力1。廃棄。','廃棄札のアタック1枚につき筋力1。廃棄。'],function(k){k.str(k.pc.exh.filter(function(c){return S.cdef(c).t==='A';}).length);},{ex:true});
card('StepThrough','Step Through','通り抜ける','A',1,1,'R',1,['2ダメージ。ヒート2以上：2枚引く。4以上：ブロック2。6：+4ダメージ。','3ダメージ。ヒート2以上：3枚引く。4以上：ブロック3。6：+6ダメージ。'],async function(k){await k.atk([u(k,2,3)+(h(k,6)?u(k,4,6):0)]);if(h(k,2))await k.draw(u(k,2,3));if(h(k,4))await k.blk(u(k,2,3));},{tg:'E'});
pow('UnleashSpirits','Unleash Spirits','霊魂解放',3,2,'R',['ターン終了時：廃棄札枚数分のダメージを任意の列に。','ターン終了時：廃棄札枚数分のダメージを任意の列に。'],{endTurnDmg:function(cb,pc){return cb.damageAnyRow(pc,pc.exh.length,'霊魂解放：列');}});
card('UnlimitedPower','Unlimited Power','無限の力','S',0,0,'R',1,['2エナジー。前進。廃棄。','2エナジー。2回前進。廃棄。'],async function(k){k.energy(2);await k.advance(u(k,1,2));},{ex:true});
pow('ExtraCrispy','Extra Crispy','こんがり焼く',1,0,'R',['毎ターン1回：ソウルバーンを1個使う。そのダメージは2倍。','毎ターン1回：ソウルバーンを1個使う。そのダメージは2倍。'],{activate:async function(cb,pc){if(!(pc.soul>0))throw new Error('ソウルバーンがありません。');pc.soul--;await cb.soulburnDamage(pc,null,{double:true});}});
card('InstantInferno','Instant Inferno','瞬間地獄','S',3,3,'R',1,['ソウルバーン3。廃棄。','ソウルバーン4。廃棄。'],function(k){return k.soulburn(u(k,3,4));},{ex:true});
card('Incorporeal','Incorporeal','非実体','S',6,6,'R',1,['ヒート1につきコスト−1。任意のプレイヤーにブロック4。','ヒート1につきコスト−1。任意のプレイヤーにブロック6。'],function(k){return blk(k,u(k,4,6));},{tg:'P',costFn:function(cb,pc,c,n){return n-cb.heatOf(pc);}});
card('RadiantReverb','Radiant Reverb','輝く残響','A',3,3,'R',1,['4ダメージを2回。手札を全て廃棄。','6ダメージを2回。手札を全て廃棄。'],async function(k){await k.atk(Array(2).fill(u(k,4,6)));for(var a=k.pc.hand.slice(),i=0;i<a.length;i++)await k.cb.exhaustCard(k.pc,a[i]);},{tg:'E'});
card('EerieExpedition','Eerie Expedition','不気味な探検','S',1,1,'R',1,['廃棄札を2枚まで山札の上に戻す。廃棄。','廃棄札を3枚まで山札の上に戻す。廃棄。'],async function(k){var a=await k.pick(k.pc.exh,0,u(k,2,3),'山札へ戻すカード（選んだ順に置く）');for(var i=0;i<a.length;i++){k.pc.exh.splice(k.pc.exh.indexOf(a[i]),1);k.pc.draw.push(a[i]);}},{ex:true});
/* Token damage is not a card, and ignores Strength, Weak and Vulnerable. */
C.soulburnDamage=async function(pc,pre,o){o=o||{};var n=(this.heatOf(pc)+(pc.t.soulBonus||0))*(o.double?2:1);delete pc.t.soulBonus;pc.t.soulUsed=true;var e=null;if(o.area)await this.damageAnyRow(pc,n,'ソウルバーン：列');else{e=await this.chooseEnemy(pc,'ソウルバーン：'+n+'ダメージ',pre);if(e)await this.damageEnemy(e,n,{pc:pc,src:'ソウルバーン'});}await F.fire('soulburn',[this,pc,e]);this.checkEnd();};
F.on('soulburn',async function(cb,pc){for(var ps=pc.pow.slice(),i=0;i<ps.length;i++)if(ps[i].id==='HeatShield'&&!ps[i].usedTurn){ps[i].usedTurn=true;await cb.gainBlock(pc,ps[i].up?3:2);}});
F.on('onExhaust',async function(cb,pc){for(var ps=pc.pow.slice(),i=0;i<ps.length;i++)if(ps[i].id==='RainOfEmbers'&&!ps[i].usedTurn){ps[i].usedTurn=true;await cb.gainSoulburn(pc,1);}});
async function moved(cb,pc,advance){for(var ps=pc.pow.slice(),i=0;i<ps.length&&!cb.s.over;i++){var p=ps[i];if(p.id==='VolcanoVisage'&&advance)await cb.gainBlock(pc,1);if(p.id==='Poltergeist')await cb.damageTarget(pc,p.up?3:2,'ポルターガイスト：敵');}}
F.on('advance',function(cb,pc){return moved(cb,pc,true);});F.on('retract',function(cb,pc){return moved(cb,pc,false);});
var ctx=F.ctxExtra;F.ctxExtra=function(cb,pc,c,k){if(ctx)ctx(cb,pc,c,k);if(pc.t.dfExhaustU===c.u&&!k.copy)k.forceExhaust=true;};
var bp=F.beforePlay;F.beforePlay=async function(cb,pc,c,o){if(bp)await bp(cb,pc,c,o);if(pc.t.dfExhaustNext&&pc.t.dfExhaustNext!==c.u){delete pc.t.dfExhaustNext;pc.t.dfExhaustU=c.u;}};
F.on('afterPlay',function(cb,pc,c){if(pc.t.dfExhaustU===c.u)delete pc.t.dfExhaustU;});
F.CHAR_CARDS=F.CHAR_CARDS||{};F.CHAR_CARDS.H={tickets:2};F.addChar('H',{deck:['DefendH','DefendH','DefendH','DefendH','Kindle','Sear','StrikeH','StrikeH','StrikeH','StrikeH'],ability:S.ABILITIES.H.tx});
S.CARDS.LingeringShades.pw.canActivate=function(cb,pc){return pc.en<1?'1エナジーが必要です。':null;};
})(typeof window!=='undefined'?window:globalThis);

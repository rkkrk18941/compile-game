/* Downfall public playtest, saved 2026-07-23, rulebook v1.47.
   Guardian: printed starter 10, reward 62 (including two Golden Tickets), rare 16, gem 24.
   Face order GD_* in DOWNFALL_CARD_SOURCES.json. No PC-mod card rules. */
(function(root){'use strict';
var S=root.STS,D=S.DATA,F=S.DF,C=S.Combat.prototype;
function u(k,a,b){return k.up?b:a;} function gems(pc,c){return pc.hand.filter(function(x){return x!==c&&S.cdef(x).socket;}).length;}
function count(pc){return pc.pow.length;}
function card(id,en,name,t,c,cu,r,copies,tx,play,extra){var d=Object.assign({id:id,en:en,name:name,t:t,c:c,cu:cu,r:r,copies:copies,ch:'U',df:true,tx:tx,play:play},extra||{});if(t==='V')F.variable(id,d);else S.CARDS[id]=d;return d;}
async function anyBlock(k,n){return k.blk(n,await k.playerSel());}
async function shift(k){if(await k.cb.ask(k.pc,{type:'confirm',title:k.d.name+'：モードシフトしますか？',yes:'変更する',no:'そのまま'}))k.shift();}
async function playPower(k){var cs=k.pc.hand.concat(k.pc.disc).filter(function(x){return S.cdef(x).t==='P'&&!k.cb.unplayable(k.pc,x);});if(!cs.length)return;var a=(await k.pick(cs,1,1,'0エナジーで使うパワー'))[0];if(a)k.later(function(){return k.cb.playFree(k.pc,a);});}
function power(id,en,name,c,cu,r,tx,pw,play,extra){return card(id,en,name,'P',c,cu,r,1,tx,play,Object.assign({pw:pw||{}},extra||{}));}
card('StrikeU','Strike','ストライク','A',1,1,'S',4,['1ダメージ。','2ダメージ。'],function(k){return k.atk([u(k,1,2)]);},{tg:'E'});
card('DefendU','Defend','防御','S',1,1,'S',4,['ブロック1。','任意のプレイヤーにブロック2。'],function(k){return k.up?anyBlock(k,2):k.blk(1);});
card('CurlUp','Curl Up','丸くなる','S',2,2,'S',1,['ブロック2。防御モード：活力1。','任意のプレイヤーにブロック3。防御モード：活力1。'],async function(k){if(k.up)await anyBlock(k,3);else await k.blk(2);if(await k.inMode('defense'))await k.vigor(1);},{refMode:true});
card('TwinSlam','Twin Slam','二連叩き','A',2,2,'S',1,['2ダメージ。攻撃モード：さらに1ダメージ。','2ダメージ。攻撃モード：さらに3ダメージ。'],async function(k){await k.atk([2]);if(await k.inMode('attack'))await k.atk([u(k,1,3)]);},{tg:'E',refMode:true});
card('OrbSupport','Orb Support','オーブ支援','A',2,2,'U',1,['攻撃モード：3ダメージ、ブロック1。防御モード：1ダメージ、ブロック3。','攻撃モード：4ダメージ、ブロック1。防御モード：1ダメージ、ブロック4。'],async function(k){var a=await k.inMode('attack');await k.atk([a?u(k,3,4):1]);await k.blk(a?1:u(k,3,4));},{tg:'E',refMode:true});
card('ResilientPlate','Resilient Plate','堅牢な装甲','S',2,2,'U',1,['ブロック3。防御モード：場のパワー1枚につきさらにブロック1。','ブロック4。防御モード：場のパワー1枚につきさらにブロック1。'],async function(k){await k.blk(u(k,3,4));if(await k.inMode('defense'))await k.blk(count(k.pc));},{refMode:true});
card('OverloadU','Overload','過負荷','S',1,1,'U',1,['4枚引く。脱力1を受ける。','5枚引く。脱力1を受ける。'],async function(k){await k.draw(u(k,4,5));k.cb.weakPlayer(k.pc,1);});
card('PrismaticBarrier','Prismatic Barrier','プリズム障壁','S',1,1,'U',1,['任意のプレイヤーにブロック1。このカードのヒット・脱力・弱体化は範囲。ソケット。','任意のプレイヤーにブロック2。このカードのヒット・脱力・弱体化は範囲。ソケット。'],function(k){return anyBlock(k,u(k,1,2));},{socket:true,gemArea:true});
card('PrismaticSpray','Prismatic Spray','プリズム噴射','A',1,1,'U',1,['範囲に1ダメージ。このカードのヒット・脱力・弱体化は範囲。ソケット。','範囲に2ダメージ。このカードのヒット・脱力・弱体化は範囲。ソケット。'],function(k){return k.aoe([u(k,1,2)]);},{socket:true,gemArea:true,tg:'R'});
card('TuneUp','Tune Up','調律','S',2,2,'U',1,['ブロック2。攻撃モード：このターン次のアタックのコスト0。','ブロック3。攻撃モード：このターン次のアタックのコスト0。'],async function(k){await k.blk(u(k,2,3));if(await k.inMode('attack'))k.pc.t.dfFreeAttack=(k.pc.t.dfFreeAttack||0)+1;},{refMode:true});
card('StasisField','Stasis Field','停滞フィールド','S',3,3,'U',1,['ブロック1を4回。それぞれ任意のプレイヤーに与える。廃棄。','ブロック1を5回。それぞれ任意のプレイヤーに与える。廃棄。'],async function(k){for(var i=0;i<u(k,4,5);i++)await anyBlock(k,1);},{ex:true});
card('StrikeForStrike','Strike for Strike','打撃の応酬','A',1,1,'U',1,['1ダメージ。攻撃モード：与えたダメージ分のブロック。','2ダメージ。攻撃モード：与えたダメージ分のブロック。'],async function(k){var r=await k.atk([u(k,1,2)]);if(await k.inMode('attack'))await k.blk(r.dealt);},{tg:'E',refMode:true});
card('SentryBeam','Sentry Beam','セントリービーム','A',2,2,'U',1,['範囲に3ダメージ。攻撃モード：活力1、脱力1を受ける。','範囲に4ダメージ。攻撃モード：活力1、脱力1を受ける。'],async function(k){await k.aoe([u(k,3,4)]);if(await k.inMode('attack')){await k.vigor(1);k.cb.weakPlayer(k.pc,1);}},{tg:'R',refMode:true});
card('DisruptU','Disrupt','攪乱','S',1,1,'U',1,['ブロック1。弱体化1。ソケット。','ブロック2。弱体化1。ソケット。'],async function(k){await k.blk(u(k,1,2));await k.vuln();},{tg:'E',socket:true});
card('ChargeCore','Charge Core','コア充填','S',1,1,'C',2,['活力1。廃棄。','活力1。'],function(k){return k.vigor(1);},{ex:[true,false]});
card('CrystalEdge','Crystal Edge','水晶の刃','A',1,1,'C',2,['1ダメージ。1枚引く。ソケット。','2ダメージ。1枚引く。ソケット。'],async function(k){await k.atk([u(k,1,2)]);await k.draw(1);},{tg:'E',socket:true});
card('FierceBash','Fierce Bash','猛烈な強打','A',3,3,'C',2,['5ダメージ。ソケット。','7ダメージ。ソケット。'],function(k){return k.atk([u(k,5,7)]);},{tg:'E',socket:true});
card('OrbSlam','Orb Slam','オーブ叩き','A',1,1,'C',2,['2ダメージ。防御モード：ブロック1。','3ダメージ。防御モード：ブロック1。'],async function(k){await k.atk([u(k,2,3)]);if(await k.inMode('defense'))await k.blk(1);},{tg:'E',refMode:true});
card('HackU','Hack','ハック','S',1,1,'C',2,['2枚引く。モードシフトしてもよい。','3枚引く。モードシフトしてもよい。'],async function(k){await k.draw(u(k,2,3));await shift(k);},{refMode:true});
card('PolyBeam','Poly Beam','ポリビーム','A',1,1,'C',2,['2ダメージ。攻撃モード：1エナジー。','3ダメージ。攻撃モード：1エナジー。'],async function(k){await k.atk([u(k,2,3)]);if(await k.inMode('attack'))k.energy(1);},{tg:'E',refMode:true});
card('PrimingShot','Priming Shot','予備射撃','A',1,1,'C',2,['2ダメージ。攻撃モード：活力1を得て、すぐに使う。','3ダメージ。攻撃モード：活力1を得て、すぐに使う。'],async function(k){await k.atk([u(k,2,3)]);if(await k.inMode('attack')){var n=await k.vigor(1);if(n)await k.cb.spendVigor(k.pc,true);}},{tg:'E',refMode:true});
card('GearUp','Gear Up','態勢を整える','S',0,0,'C',2,['ブロック1。モードシフトしてもよい。','ブロック2。モードシフトしてもよい。'],async function(k){await k.blk(u(k,1,2));await shift(k);},{refMode:true});
card('SphericShield','Spheric Shield','球状の盾','S',1,1,'C',2,['ブロック1。防御モード：任意のプレイヤーにブロック1。','ブロック2。防御モード：任意のプレイヤーにブロック1。'],async function(k){await k.blk(u(k,1,2));if(await k.inMode('defense'))await anyBlock(k,1);},{refMode:true});
card('Suspension','Suspension','懸架','S',1,1,'C',2,['ブロック1。手札に他のジェムカードがあればさらにブロック1。ソケット。','ブロック2。手札に他のジェムカードがあればさらにブロック1。ソケット。'],async function(k){await k.blk(u(k,1,2));if(gems(k.pc,k.card))await k.blk(1);},{socket:true});
card('FortifyU','Fortify','要塞化','S',1,1,'C',2,['ブロック2。攻撃モード：2枚引く。','ブロック3。攻撃モード：2枚引く。'],async function(k){await k.blk(u(k,2,3));if(await k.inMode('attack'))await k.draw(2);},{refMode:true});
card('WalkerClaw','Walker Claw','歩行兵器の爪','A',2,2,'C',2,['1ダメージを2回。ソケット。','1ダメージを3回。ソケット。'],function(k){return k.atk(Array(u(k,2,3)).fill(1));},{tg:'E',socket:true});
card('RollAttack','Roll Attack','回転攻撃','A',1,1,'C',2,['現在のブロックと同じダメージ。','現在のブロックと同じダメージを範囲に。'],function(k){return k.up?k.aoe([k.pc.blk]):k.atk([k.pc.blk]);},{tg:function(k){return k.up?'R':'E';}});
power('Orbwalk','Orbwalk','オーブ歩行',2,1,'U',['攻撃モード：活力1個の追加ダメージが+2になる。','攻撃モード：活力1個の追加ダメージが+2になる。']);
card('GuardianWhirl','Guardian Whirl','ガーディアン旋回','V','X','X','U',1,['攻撃モード：範囲にXダメージ（アタック）。防御モード：任意のプレイヤーにブロックX（スキル）。','攻撃モード：範囲にX+1ダメージ（アタック）。防御モード：任意のプレイヤーにブロックX+1（スキル）。'],async function(k){if(await k.inMode('attack'))await k.aoe([k.x+u(k,0,1)],await k.rowSel());else await anyBlock(k,k.x+u(k,0,1));},{refMode:true});
card('VentSteam','Vent Steam','蒸気放出','S',1,1,'U',1,['攻撃モード：弱体化1。防御モード：脱力1。','攻撃モード：範囲に弱体化1。防御モード：範囲に脱力1。'],async function(k){var a=await k.inMode('attack'),es=k.up?k.cb.aoeTargets(await k.rowSel()):[await k.enemy()];for(var i=0;i<es.length;i++)if(es[i]){if(a)await k.vuln(es[i],1);else await k.weak(es[i],1);}},{refMode:true});
power('Turbocharge','Turbocharge','ターボ充填',2,1,'U',['ターン終了時：攻撃モードなら活力1。それ以外はこのカードを廃棄。','ターン終了時：攻撃モードなら活力1。それ以外はこのカードを廃棄。'],{endTurn:async function(cb,pc,p){if(pc.mode==='attack')await cb.gainVigor(pc,1);else await cb.removePower(pc,p,true);}});
card('SpeedBoost','Speed Boost','加速','A',0,0,'U',1,['保留。1ダメージ。モードシフトしてもよい。','保留。2ダメージ。モードシフトしてもよい。'],async function(k){await k.atk([u(k,1,2)]);await shift(k);},{tg:'E',ret:true,refMode:true});
power('ChargeUpU','Charge Up','充填',2,2,'U',['ターン開始時：活力2、このカードを捨てる。','ターン開始時：活力3、このカードを捨てる。'],{startTurn:async function(cb,pc,p){await cb.gainVigor(pc,p.up?3:2);await cb.removePower(pc,p,false);}});
card('IncinerateU','Incinerate','焼却','A',1,1,'U',1,['1ダメージを2回。攻撃モード：2枚引く。廃棄。','1ダメージを2回。攻撃モード：4枚引く。廃棄。'],async function(k){await k.atk([1,1]);if(await k.inMode('attack'))await k.draw(u(k,2,4));},{tg:'E',ex:true,refMode:true});
power('Crystallize','Crystallize','結晶化',1,0,'U',['スターターのストライクにソケットの効果を追加。ソケット。','スターターのストライクにソケットの効果を追加。ソケット。'],{},null,{socket:true,socketAt:'strike'});
card('FocusBeam','Focus Beam','集中ビーム','A',1,1,'U',1,['2ダメージ。ブロック3以上なら活力1。','3ダメージ。ブロック3以上なら活力1。'],async function(k){await k.atk([u(k,2,3)]);if(k.pc.blk>=3)await k.vigor(1);},{tg:'E'});
card('GemCannon','Gem Cannon','ジェム砲','A',1,1,'U',1,['2ダメージ。このターン次のジェムカードのコスト0。','2ダメージ。このターン次のジェムカード2枚のコスト0。'],async function(k){await k.atk([2]);k.pc.t.dfFreeGem=(k.pc.t.dfFreeGem||0)+u(k,1,2);},{tg:'E'});
card('HardenU','Harden','硬化','S',2,2,'U',1,['任意のプレイヤーにブロック3。ソケット。','任意のプレイヤーにブロック4。ソケット。'],function(k){return anyBlock(k,u(k,3,4));},{socket:true});
card('MultiBeam','Multi Beam','多重ビーム','A','X','X','U',1,['1ダメージをX回。Xは1以上。ソケット。','1ダメージをX+1回。Xは1以上。ソケット。'],function(k){return k.atk(Array(k.x+u(k,0,1)).fill(1));},{tg:'E',socket:true,xMin:1});
card('StasisBeam','Stasis Beam','停滞ビーム','A',1,1,'U',1,['2ダメージ。場のパワー1枚につき+1。','2ダメージ。場のパワー1枚につき+2。'],function(k){return k.atk([2+count(k.pc)*u(k,1,2)]);},{tg:'E'});
card('PowerBeam','Power Beam','パワービーム','A',2,2,'U',1,['3ダメージ。防御モード：手札か捨て札のパワー1枚を0エナジーで使う。','4ダメージ。防御モード：手札か捨て札のパワー1枚を0エナジーで使う。'],async function(k){await k.atk([u(k,3,4)]);if(await k.inMode('defense'))await playPower(k);},{tg:'E',refMode:true});
power('LaserTurret','Laser Turret','レーザー砲台',1,1,'U',['ターン終了時：場のパワー枚数分のダメージ。','ターン終了時：任意の列に場のパワー枚数分のダメージ。'],{endTurnDmg:async function(cb,pc,p){if(p.up)await cb.damageAnyRow(pc,count(pc),'レーザー砲台：列');else await cb.damageTarget(pc,count(pc),'レーザー砲台：敵');}});
power('FuturePlans','Future Plans','将来の計画',1,0,'U',['攻撃モードの効果を持つ自分のカードは保留を得る。','攻撃モードの効果を持つ自分のカードは保留を得る。']);
card('Preprogram','Preprogram','事前プログラム','S',1,1,'U',1,['2枚引く。このターン活力を使っていれば活力1。','3枚引く。このターン活力を使っていれば活力1。'],async function(k){await k.draw(u(k,2,3));if(k.pc.t.dfSpentVigor||k.pc.vigorSpent)await k.vigor(1);});
power('BrilliantScales','Brilliant Scales','輝く鱗',1,0,'U',['ジェムカードを使うたび、ブロック1。','ジェムカードを使うたび、ブロック1。']);
power('RepulsorU','Repulsor','リパルサー',1,0,'U',['使用時：脱力1を受ける。ターン開始時：1エナジー。','使用時：脱力1を受ける。ターン開始時：1エナジー。'],{startTurn:function(cb,pc){cb.gainEnergy(pc,1);}},function(k){k.cb.weakPlayer(k.pc,1);});
power('AncientConstruct','Ancient Construct','古代の構造体',1,0,'U',['ターン終了時：ブロック4以上なら活力1。','ターン終了時：ブロック4以上なら活力1。'],{endTurn:function(cb,pc){if(pc.blk>=4)return cb.gainVigor(pc,1);}});
power('ShieldCharger','Shield Charger','シールド充填器',1,1,'U',['ターン開始時：前ターンの残りブロックを最大2保持。','ターン開始時：前ターンの残りブロックを最大3保持。']);
card('TimeSifter','Time Sifter','時間のふるい','S',0,0,'U',1,['使用済み活力を全て失い、同じ数の活力を得る。','保留。使用済み活力を全て失い、同じ数の活力を得る。'],async function(k){var n=k.pc.vigorSpent||0;k.pc.vigorSpent=0;await k.vigor(n);},{ret:[false,true]});
card('ScaleSlash','Scale Slash','鱗斬り','A',1,1,'U',1,['1ダメージを2回。攻撃モード：このカードを山札の上に置く。','1ダメージを3回。攻撃モード：このカードを山札の上に置く。'],async function(k){await k.atk(Array(u(k,2,3)).fill(1));if(await k.inMode('attack'))k.dest='drawTop';},{tg:'E',refMode:true});
card('BlitzU','Blitz','電撃戦','S',0,0,'U',1,['1枚引く。このターン次のカードのコスト1。廃棄。','2枚引く。このターン次のカードのコスト1。廃棄。'],async function(k){await k.draw(u(k,1,2));k.pc.t.dfNextOne=k.card.u;},{ex:true});
card('BaubleBurst','Bauble Burst','宝玉炸裂','A',2,2,'R',1,['2ダメージ。装着ジェムを追加で1回発動。ソケット。','4ダメージ。装着ジェムを追加で1回発動。ソケット。'],async function(k){await k.atk([u(k,2,4)]);await k.gem();},{tg:'E',socket:true});
card('BodyCrash','Body Crash','ボディクラッシュ','A',1,0,'R',1,['ブロックXを支払い、Xダメージを2回。','ブロックXを支払い、Xダメージを2回。'],async function(k){var n=await k.cb.ask(k.pc,{type:'number',title:'支払うブロック',min:0,max:k.pc.blk,def:k.pc.blk});n=Math.max(0,Math.min(k.pc.blk,n|0));k.pc.blk-=n;await k.atk([n,n]);},{tg:'E'});
power('SpikerProtocol','Spiker Protocol','スパイカープロトコル',2,2,'R',['ターン終了時：自分への攻撃を予定する全ての敵に3ダメージ。','ターン終了時：自分への攻撃を予定する全ての敵に4ダメージ。'],{endTurnDmg:async function(cb,pc,p){for(var es=cb.alive(),i=0;i<es.length;i++){var e=es[i],a=cb.currentAction(e);if(a&&a.fx&&a.fx.some(function(f){return f[0]==='hit'||f[0]==='allHit';})&&cb.targetsOf(e,true).indexOf(pc)>=0)await cb.damageEnemy(e,p.up?4:3,{power:true});}}});
card('EvadeU','Evade','回避','S',1,1,'R',1,['ブロック2。防御モード：ブロックを2倍にする。廃棄。','ブロック3。防御モード：ブロックを2倍にする。廃棄。'],async function(k){await k.blk(u(k,2,3));if(await k.inMode('defense'))await k.cb.gainBlock(k.pc,k.pc.blk);},{ex:true,refMode:true});
card('GigaBeam','Giga Beam','ギガビーム','A',2,2,'R',1,['攻撃モード：範囲に5ダメージ。この戦闘中モードシフトできなくなる。','攻撃モード：範囲に7ダメージ。この戦闘中モードシフトできなくなる。'],async function(k){if(await k.inMode('attack'))await k.aoe([u(k,5,7)],await k.rowSel());k.pc.dfModeLocked=true;},{refMode:true});
power('RevengeProtocol','Revenge Protocol','復讐プロトコル',2,1,'R',['毎ターン1回：攻撃モードなら手札のアタックを0エナジーで使う。','毎ターン1回：攻撃モードなら手札のアタックを0エナジーで使う。'],{activate:async function(cb,pc){if(pc.mode!=='attack')throw new Error('攻撃モードで使えます。');var cs=await cb.pickCards(pc,'hand',0,1,'0エナジーで使うアタック',function(c){return S.cdef(c).t==='A';});if(cs[0])await cb.playFree(pc,cs[0]);}});
power('ArmoredProtocol','Armored Protocol','装甲プロトコル',3,3,'R',['次のHP損失を防ぎ、活力2を得てこのカードを廃棄。','次のHP損失を防ぎ、活力3を得てこのカードを廃棄。']);
power('GemFinder','Gem Finder','ジェム探知機',1,1,'R',['毎ターン1回：占術3。公開したジェムカードは引く。','毎ターン1回：占術4。公開したジェムカードは引く。'],{activate:async function(cb,pc,p){var cs=pc.draw.slice(-(p.up?4:3)).filter(function(c){return S.cdef(c).socket;});await cb.scry(pc,p.up?4:3);for(var i=0;i<cs.length;i++){var c=cs[i],a=pc.draw.indexOf(c),b=pc.disc.indexOf(c);if(a>=0)pc.draw.splice(a,1);else if(b>=0)pc.disc.splice(b,1);else continue;pc.hand.push(c);cb.emit({t:'draw',i:pc.i,u:c.u});await cb.onDrawn(pc,c);}}});
card('ExploitGems','Exploit Gems','ジェム活用','S',0,0,'R',1,['1エナジー。廃棄。ソケット。','2エナジー。廃棄。ソケット。'],function(k){k.energy(u(k,1,2));},{socket:true,ex:true});
power('StasisEngine','Stasis Engine','停滞エンジン',3,2,'R',['ターン終了時：1枚を保留してもよい。次のターンそのカードのコスト0。','ターン終了時：1枚を保留してもよい。次のターンそのカードのコスト0。'],{endTurn:async function(cb,pc){var cs=await cb.pickCards(pc,'hand',0,1,'保留して次ターンのコストを0にするカード');if(cs[0]){cs[0].rt=true;cs[0].dfNextZero=true;}}});
power('ConstructionForm','Construction Form','建設の姿',3,2,'R',['エセリアル。他のパワーのコスト0。他のパワーを使うたびブロック1。','エセリアル。他のパワーのコスト0。他のパワーを使うたびブロック1。'],{},null,{eth:true});
power('FloatingOrbs','Floating Orbs','浮遊オーブ',2,1,'R',['毎ターン1回：装着ジェムを発動する。ソケット。','毎ターン1回：装着ジェムを発動する。ソケット。'],{activate:function(cb,pc,p){return cb.ctx(pc,p.card,{}).gem();}},null,{socket:true,socketAt:'activate'});
card('TimeCapacitor','Time Capacitor','時間コンデンサ','S',1,1,'R',1,['場のパワー枚数分の活力。廃棄。','場のパワー枚数分の活力。'],function(k){return k.vigor(count(k.pc));},{ex:[true,false]});
card('DestroyU','DESTROY','破壊','A',3,3,'R',1,['保留。4ダメージ。手札のジェムカード1枚につき+4。','保留。5ダメージ。手札のジェムカード1枚につき+5。'],function(k){return k.atk([u(k,4,5)*(1+gems(k.pc,k.card))]);},{tg:'E',ret:true});
card('RefractedBeam','Refracted Beam','屈折ビーム','V',0,0,'R',1,['攻撃モード：0ダメージを3回（アタック）。防御モード：ブロック0を3回（スキル）。','攻撃モード：0ダメージを4回（アタック）。防御モード：ブロック0を4回（スキル）。'],async function(k){if(await k.inMode('attack'))await k.atk(Array(u(k,3,4)).fill(0),await k.enemy());else for(var i=0;i<u(k,3,4);i++)await k.blk(0);},{refMode:true});
power('Forecasting','Forecasting','予測',2,1,'R',['ターン終了時：防御モードなら2枚引き、引いたカードを保留。','ターン終了時：防御モードなら2枚引き、引いたカードを保留。'],{endTurn:async function(cb,pc){if(pc.mode!=='defense')return;var before=pc.hand.slice();await cb.draw(pc,2);pc.hand.forEach(function(c){if(before.indexOf(c)<0)c.rt=true;});}});

/* Gem faces: 12 paired/common faces then 8 one-off faces; exact printed multiplicities. */
var gemDefs=[
['Shift','変転','モードシフトしてもよい。',2,shift],
['Weak','鈍化','脱力1。',2,function(k){return gemDebuff(k,false);}],
['Risk','裂傷','弱体化1。脱力1を受ける。',2,async function(k){await gemDebuff(k,true);k.cb.weakPlayer(k.pc,1);}],
['DefenseDraw','静穏','防御モード：2枚引く。',2,async function(k){if(await k.inMode('defense'))await k.draw(2);}],
['Hit','紅玉','1ダメージ。',2,function(k){return k.gemAtk([1]);}],
['Block','蒼玉','ブロック1。',2,function(k){return k.blk(1);}],
['Vigor','活力','活力1を得てすぐに使う。',2,async function(k){var n=await k.vigor(1);if(n)await k.cb.spendVigor(k.pc,true);}],
['AttackDraw','猛攻','攻撃モード：2枚引く。',2,async function(k){if(await k.inMode('attack'))await k.draw(2);}],
['Last','終端','活力1。このターンこれ以上カードを使えない。',1,async function(k){await k.vigor(1);k.pc.t.noMore=true;}],
['OtherBlock','連結','手札の他のジェムカード1枚につきブロック1。',1,function(k){return k.blk(gems(k.pc,k.card));}],
['First','始動','このターン最初のカードなら1エナジー。',2,function(k){if(k.pc.t.played===1)k.energy(1);}],
['Exhaust','浄化','手札を3枚まで廃棄する。',1,function(k){return k.exhaustHand(0,3);}],
['Cleanse','黒曜','任意のプレイヤーの脱力・弱体化を全て除く。保留。',1,async function(k){var p=await k.playerSel();p.weak=0;p.vuln=0;}],
['Power','白晶','このターン次のパワーのコスト0。',1,function(k){k.pc.t.dfFreePower=(k.pc.t.dfFreePower||0)+1;}],
['OtherHit','共鳴','手札に他のジェムカードがあれば2ダメージ。',1,function(k){if(gems(k.pc,k.card))return k.gemAtk([2]);}]
];
async function gemDebuff(k,v){var es=k.d.gemArea?k.cb.aoeTargets(k.row==null?await k.rowSel():k.row):[k.target||await k.enemy()];for(var i=0;i<es.length;i++)if(es[i]){if(v)await k.vuln(es[i],1);else await k.weak(es[i],1);}}
gemDefs.forEach(function(a){F.addGem('DfGem'+a[0],{name:a[1],tx:a[2],copies:a[3],play:a[4]});});
/* Hooks are persisted in the existing card/power state, so reconnects cannot replay a trigger. */
var hb=F.hitBonusExtra;F.hitBonusExtra=function(cb,pc,o){return(hb?hb(cb,pc,o):0)+(pc.mode==='attack'&&F.vigorApplies(cb,pc,o.card)?(pc.vigorSpent||0)*cb.powCount(pc,'Orbwalk'):0);};
var ctx=F.ctxExtra;F.ctxExtra=function(cb,pc,c,k){if(ctx)ctx(cb,pc,c,k);if(k.d.gemArea){k.gemAtk=async function(ns){return k.aoe(ns,k.row==null?await k.rowSel():k.row);};}};
var cost=F.costExtra;F.costExtra=function(cb,pc,c,n){if(cost)n=cost(cb,pc,c,n);var d=S.cdef(c);if(d.t==='A'&&pc.t.dfFreeAttack)n=0;if(d.socket&&pc.t.dfFreeGem)n=0;if(d.t==='P'&&(pc.t.dfFreePower||cb.powCount(pc,'ConstructionForm')&&d.id!=='ConstructionForm'))n=0;if(pc.t.dfNextOne&&pc.t.dfNextOne!==c.u)n=1;return n;};
var bp=F.beforePlay;F.beforePlay=async function(cb,pc,c,o){if(bp)await bp(cb,pc,c,o);var d=S.cdef(c);if(d.t==='A'&&pc.t.dfFreeAttack)pc.t.dfFreeAttack--;if(d.socket&&pc.t.dfFreeGem)pc.t.dfFreeGem--;if(d.t==='P'&&pc.t.dfFreePower)pc.t.dfFreePower--;if(pc.t.dfNextOne&&pc.t.dfNextOne!==c.u)delete pc.t.dfNextOne;};
F.on('afterPlay',async function(cb,pc,c){var d=S.cdef(c);if(d.socket)for(var i=0;i<cb.powCount(pc,'BrilliantScales');i++)await cb.gainBlock(pc,1);if(d.t==='P')for(var j=0;j<pc.pow.length;j++)if(pc.pow[j].id==='ConstructionForm'&&pc.pow[j].u!==c.u)await cb.gainBlock(pc,1);if(cb.isStarterStrike(c))for(var ps=pc.pow.slice(),z=0;z<ps.length;z++)if(ps[z].id==='Crystallize')await cb.ctx(pc,ps[z].card,{}).gem();});
var retained=C.isRetained;C.isRetained=function(pc,c){return retained.call(this,pc,c)||S.cdef(c).socket&&c.gem==='DfGemCleanse'||this.powCount(pc,'FuturePlans')&&/攻撃モード/.test((S.cdef(c).tx||[])[0]);};
var mode=C.enterMode;C.enterMode=function(pc,m,w){if(pc.dfModeLocked)return false;return mode.call(this,pc,m,w);};
var spend=C.spendVigor;C.spendVigor=async function(pc,internal){await spend.call(this,pc,internal);pc.t.dfSpentVigor=true;};
var loss=C.loseHp;C.loseHp=async function(pc,n,o){if(n>0&&!pc.dead){var p=pc.pow.filter(function(x){return x.id==='ArmoredProtocol';})[0];if(p){await this.removePower(pc,p,true);await this.gainVigor(pc,p.up?3:2);return 0;}}return loss.call(this,pc,n,o);};
F.retainedBlock=function(cb,pc){return Math.min(pc.blk,cb.powSum(pc,'ShieldCharger',function(p){return p.up?3:2;}));};
F.on('startTurn',function(cb,pc){pc.hand.forEach(function(c){if(c.dfNextZero){c.cm=0;delete c.dfNextZero;}});});
F.CHAR_CARDS=F.CHAR_CARDS||{};F.CHAR_CARDS.U={tickets:2};
F.addChar('U',{deck:['CurlUp','DefendU','DefendU','DefendU','DefendU','StrikeU','StrikeU','StrikeU','StrikeU','TwinSlam'],ability:S.ABILITIES.U.tx});
S.CARDS.RevengeProtocol.pw.canActivate=function(cb,pc){return pc.mode!=='attack'?'攻撃モードで使えます。':null;};
})(typeof window!=='undefined'?window:globalThis);

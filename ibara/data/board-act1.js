/* Act I mechanical data transcribed from Contention Games' public TTS module
 * 2884027954 (2023-10-11). See RULES_AUDIT.md for version and coverage limits.
 * Text below describes mechanics; it is not a reproduction of the card scans.
 */
(function(root){
'use strict';
var G=root.IBARA, EN=G.ENEMIES, EC=G.ENCOUNTERS;
function act(name, fx, last, all){if(all)fx.forEach(function(op){if(['atk','weak','vuln','status'].indexOf(op[0])>=0)op[4]='all';});return {name:name,fx:fx,actsLast:!!last};}
function hit(n,h){return ['atk',n,h||1];}
function debuff(k,n){return [k,n||1];}
function status(id,n){return ['status',id,n||1];}
function die(a,b,c){return [[1,2,a],[3,4,b],[5,6,c]];}
function enemy(id,name,hp,art,more){EN[id]=Object.assign({id:id,name:name,hp:hp,art:art},more);return EN[id];}
function encounter(id,primary,summons,rewards,setup){EC[id]={id:id,enemy:primary,summons:summons||[],rewards:rewards||{},setup:setup};}
function rowHero(c,e){return c.party?c.party[e.lane||0]:c;}
async function curl(c,e,loss,o){if(!e.st.curled && o && !o.loseHP){e.st.curled=true;await c.gainEnemyBlock(e,2);}}
async function angry(c,e,loss,o){if(o&&o.hit)await c.addStatus(e,'str',1);}
async function spores(c,e){var victim=rowHero(c,e);await victim.addStatus(victim.hero,'vuln',1);}
function jaws(id,hp,first){return enemy(id,'ジョーワーム',hp,'rat',{die:die(
  first?act('守りを固める',[['block',2],['str',1]]):act('噛みつき',[hit(3),['block',1]]),
  first?act('噛みつき',[hit(2),['block',1]]):act('強打',[hit(4)]),
  first?act('強打',[hit(3)]):act('守りを固める',[['block',2],['str',1]]))});}
function cultist(id){return enemy(id,'狂信者',9,'chanter',{single:act('儀式',[hit(1),['str',1]])});}
function louse(id,red,variant,hp){
  var acts=red?[act('筋力',[['str',1]]),act('噛みつき',[hit(2)]),act('噛みつき',[hit(hp===4?2:1)])]
    :[act('噛みつき',[hit(1)]),act('弱体',[debuff('weak')]),act('噛みつき',[hit(2)])];
  if(red&&variant)acts=[acts[1],acts[2],acts[0]];
  if(!red&&variant)acts=[acts[2],acts[0],acts[1]];
  return enemy(id,red?'レッドロース':'グリーンロース',hp,red?'pillbug':'wisp',{die:die.apply(null,acts),onHpLoss:curl,sp:[['丸まる','初めてダメージを受けるとブロック2を得る。']]});
}
jaws('rat',8,true);jaws('crab',10,false);cultist('chanter');cultist('bg_first_cultist');
louse('pillbug',true,0,3);louse('tick_a',true,0,4);
louse('bg_red_louse',true,1,3);louse('bg_green_louse_a',false,0,3);louse('bg_green_louse_b',false,1,3);
enemy('slime_s','スモールスライム',3,'slime_s',{single:act('体当たり',[hit(1)])});
enemy('puffball','ファンガスビースト',6,'puffball',{die:die(act('体当たり',[hit(2)]),act('胞子の打撃',[hit(1),['str',1]],false,true),act('成長',[['str',2]])),onDeath:spores});
enemy('bg_fungi','ファンガスビースト',5,'puffball',{die:die(act('成長',[['str',2]]),act('体当たり',[hit(2)]),act('胞子の打撃',[hit(1),['str',1]],false,true)),onDeath:spores});
enemy('imp_quick','泥棒グレムリン',2,'imp_quick',{single:act('不意打ち',[hit(2)])});
enemy('imp_fat','太っちょグレムリン',3,'imp_fat',{allRows:true,single:act('全体攻撃',[hit(1)])});
enemy('imp_angry','怒りグレムリン',5,'imp_angry',{single:act('殴打',[hit(1)]),onHpLoss:angry});
enemy('bg_mad_encounter','怒りグレムリン',4,'imp_angry',{single:act('殴打',[hit(1)]),onHpLoss:angry});
enemy('imp_sorcerer','グレムリンウィザード',4,'imp_sorcerer',{allRows:true,cube:{acts:[act('充填',[['none']]),act('全体魔法',[hit(3)])],loop:1}});
enemy('trapper','ブルースレイバー',10,'trapper',{die:die(act('足払い',[hit(2),debuff('weak')]),act('強打',[hit(3)]),act('目くらまし',[hit(2),status('st_daze')]))});
enemy('bg_red_slaver','レッドスレイバー',10,'trapper',{die:die(act('目くらまし',[hit(2),status('st_daze')]),act('とどめの一撃',[hit(2),debuff('vuln')],true),act('強打',[hit(3)]))});
enemy('crow','ルーター',9,'crow',{cube:{acts:[act('打撃',[hit(2)]),act('打撃と防御',[hit(3),['block',1]]),act('逃走',[['fn','escape']])],loop:2},fns:{escape:async function(c,e){rowHero(c,e).g.gainGold(-2);await c.enemyFlee(e);}}});
enemy('slime_l','ラージスライム',8,'slime_l',{allRows:true,cube:{acts:[act('全体打撃',[hit(1)]),act('強打とめまい',[hit(4),status('st_daze')]),act('召喚予約',[['fn','acid']])],loop:0},fns:{acid:async function(c,e){c.queueSummon('random:acid',e.lane);}}});
var acidActs=[act('体当たり',[hit(2)]),act('弱体',[debuff('weak')]),act('めまいの打撃',[hit(2),status('st_daze')])];
var spikeActs=[act('隙を狙う',[hit(1),debuff('vuln')],true),act('めまいの打撃',[hit(1),status('st_daze')]),act('体当たり',[hit(2)])];
var largeActs=[act('弱体の打撃',[hit(1),debuff('weak',2)]),act('強打',[hit(4)]),act('粘液の打撃',[hit(3),status('st_slime',2)])];
function rotated(xs,shift){return [xs[shift%3],xs[(shift+1)%3],xs[(shift+2)%3]];}
var acids=[],spikes=[],large=[];
for(var i=0;i<4;i++){
  var acid='bg_acid_'+i,spike='bg_spike_'+i,big='bg_large_'+i;
  var acidOrder=[[0,1,2],[2,0,1],[1,2,0],[1,0,2]][i], spikeOrder=[[0,1,2],[1,0,2],[0,2,1],[2,1,0]][i];
  enemy(acid,'アシッドスライム',5,'acid_m',{die:die.apply(null,acidOrder.map(function(k){return acidActs[k];}))});
  enemy(spike,'スパイクスライム',5,'spike_m',{die:die.apply(null,spikeOrder.map(function(k){return spikeActs[k];}))});
  enemy(big,'ラージスライム',12,'slime_l',{die:die.apply(null,rotated(largeActs,i))});
  acids.push(acid);spikes.push(spike);large.push(big);
}
enemy('boar','グレムリンノブ',14,'boar',{elite:true,allRows:true,hpByPlayers:[14,28,42,56],
  cube:{acts:[act('激怒を得る',[['fn','enrage']]),act('全体強打',[hit(3)])],loop:1},
  fns:{enrage:async function(c,e){e.st.enraged=true;}},
  onPlayerCard:async function(c,e,card){if(e.st.enraged&&G.CARDS[card.id].type==='skl')await c.damageHero(1,{src:e,kind:'enrage'});}});
enemy('statue','ラガヴーリン',22,'statue',{elite:true,allRows:true,hpByPlayers:[22,44,66,88],
  cube:{acts:[act('睡眠',[['none']]),act('全体強打',[hit(4)]),act('全体強打',[hit(4)]),act('全体弱体',[debuff('weak',2),['str',1]])],loop:1}});
function sentry(id,b,hp){return enemy(id,b?'セントリーB':'セントリーA',hp,'sentinel',{die:[[1,3,b?act('ビーム',[hit(3)]):act('めまい',[status('st_daze')])],[4,6,b?act('めまい',[status('st_daze')]):act('ビーム',[hit(3)])]]});}
var sentries=[];
for(var si=0;si<11;si++){var sid='bg_sentry_'+si;sentry(sid,si%2===1,si%2===1?8:7);sentries.push(sid);}
enemy('witch','セントリー',7,'witch',{elite:true,die:[[1,3,act('ビーム',[hit(2)])],[4,6,act('めまい',[status('st_daze')])]]});
enemy('b_slime','スライムボス',22,'b_slime',{boss:true,hpByPlayers:[22,44,66,88],
  cube:{acts:[act('全体粘液',[status('st_slime',3)]),act('全体粘液打撃',[hit(3),status('st_slime',2)]),act('全体強打',[hit(6)])],loop:0},
  onDeath:async function(c){var n=c.party?c.party.length:1;for(var i=0;i<n;i++){c.queueSummon('random:large',i);c.queueSummon('random:acid',i);c.queueSummon('random:spike',i);}}});
enemy('b_witch','ヘクサゴースト',36,'b_witch',{boss:true,hpByPlayers:[36,75,112,150],cube:{acts:[
  act('全体火炎',[hit(1),status('st_burn')]),act('全体二連撃',[hit(2,2),status('st_burn')]),act('火傷',[status('st_burn',2)]),
  act('全体強打と防御',[hit(3),['block',5]]),act('全体二連撃',[hit(2,2),status('st_burn')]),act('大火炎',[hit(3,3),status('st_burn',2),['str',1]])],loop:0}});
enemy('b_colossus','ガーディアン',40,'b_colossus',{boss:true,hpByPlayers:[40,80,120,160],startMode:'attack',
  modes:{attack:{label:'攻撃モード',cube:{acts:[act('攻撃と防御',[hit(2),['fn','guard']]),act('モードシフト',[['fn','shift']])],loop:0}},
    defense:{label:'防御モード',cube:{acts:[act('全体打撃',[hit(2)]),act('強打と筋力',[hit(4),['str',1],['fn','attackNext']])],loop:0}}},
  fns:{guard:async function(c,e){await c.gainEnemyBlock(e,5*(c.party?c.party.length:1));},
    shift:async function(c,e){if(!e.st.blockAtEnemyStart)e.st.modeNext='defense';else await c.enemyDo(e,act('全体強打',[hit(6)]));},
    attackNext:async function(c,e){e.st.modeNext='attack';}},
  onRoundStart:async function(c,e){if(e.st.modeNext){var mode=e.st.modeNext;delete e.st.modeNext;await c.setMode(e,mode);}},
  onPlayerCard:async function(c,e,card){if(e.mode==='defense'&&G.CARDS[card.id].type==='atk')await c.damageHero(1,{src:e,kind:'sharpHide'});}});
var cardGold={gold:1,card:1};
encounter('fe_rat','rat',[],{gold:1,potion:true,card:1});
encounter('fe_slimes','slime_s',['random:acid'],{potion:true,card:1});
encounter('fe_pillbug','pillbug',['random:green'],cardGold);
encounter('fe_wisp','bg_first_cultist',[],cardGold);
encounter('en_chanter','chanter',['random:spike'],{gold:1,potion:true,card:1});
encounter('en_crab','chanter',['random:green'],cardGold);
encounter('en_puffball','puffball',['bg_fungi'],{gold:1,potion:true,card:1});
encounter('en_slime','slime_s',['random:acid','random:spike'],cardGold);
encounter('en_ticks','tick_a',['random:green','bg_red_louse'],cardGold);
encounter('en_drips','slime_l',[],{gold:1,potion:true,card:1});
async function gremlins(c){var src=c.enemies.find(function(e){return (e.lane||0)===(c.lane||0)&&e.id===c.spec.enemies[0];});await c.summon(src,'random:imp',c.party&&c.party.length>1?3:2);}
encounter('en_imps','imp_quick',[],{gold:1,potion:true,card:1},gremlins);
encounter('en_nest','bg_mad_encounter',[],{gold:2,card:1},gremlins);
encounter('en_trapper','trapper',[],{gold:2,card:1});
encounter('en_sentinel','bg_red_slaver',[],cardGold);
encounter('en_crow','crow',[],{potion:true,card:1});
encounter('en_lanterns','crab',[],cardGold);
var eliteRewards={gold:2,relic:true,card:1};
encounter('el_boar','boar',[],eliteRewards);encounter('el_statue','statue',[],eliteRewards);
encounter('el_witch','witch',[],eliteRewards,async function(c){
  var n=c.party?c.party.length:1;
  for(var i=0;i<3*n-1;i++)c.spawn(sentries[i],{lane:Math.floor((i+1)/3)});
});
['b_slime','b_colossus','b_witch'].forEach(function(id){encounter(id,id,[],{gold:3,rare:true,bossRelic:true});});
G.ACT1.summonGroups={acid:acids,spike:spikes,large:large,green:['bg_green_louse_a','bg_green_louse_b'],imp:['imp_sorcerer','imp_quick','imp_fat','imp_sorcerer','imp_fat','imp_angry','imp_angry','imp_quick']};
G.BOARD_DATA_SOURCE={workshop:'https://steamcommunity.com/sharedfiles/filedetails/?id=2884027954',updated:'2023-10-11',currentEditionVerified:false};
})(typeof window!=='undefined'?window:globalThis);

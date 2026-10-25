/* Independent teaching positions. All moves are validated by the normal game engine. */
(function (root, factory) {
  const D = root ? root.QV_DATA : require('./data.js');
  const E = root ? root.QV_ENG : require('./engine.js');
  const api = factory(D, E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QV_LESSONS = api;
})(typeof window !== 'undefined' ? window : null, function (D, E) {
  'use strict';
  const lessons = [
    { title: 'まずは勝ち方', focus: ['S'], text: 'あなたは赤の一族です。議員を元老院へ1人以上送り、月桂冠の合計点で競います。元老院の5席が埋まると即終了です。', hint: '赤は9点で元老院に1人。青は20点でも元老院に0人。黄は7点で元老院に1人。この3人なら誰が勝つ？', quiz: ['赤のあなた', '20点の青', '黄'], answer: 0, success: '赤の勝ち！ 青は元老院に議員がいないので候補から外れます。元老院にいる赤と黄の得点を比べ、9点の赤が勝ちます。', terms: ['元老院','月桂冠','失格'] },
    { title: '議員を入口に置く', focus: ['A1'], text: '1回の手番でできる行動は1つ。最初は手元の8人から1人を、いちばん下の入口に置きます。', hint: '金色に光る「入口・左」を選び、「ここに置く」を押しましょう。', action: {t:'place',c:'A1'}, success: '入口に赤の議員を置きました。手元は8人から7人に。ここで1手番が終わるため、置いた直後に移動することはできません。', terms: ['議員','入口','手番'] },
    { title: '1つ上へ動かす', focus: ['A1','B2'], text: '今回は次の自分の番という練習です。1人議会からは賛成を頼まずに出られます。道でつながった1つ上へ進みます。', hint: '赤のいる「入口・左」から、金色の「2段・中左」へ。下の移動ボタンでも操作できます。', action: {t:'move',from:'A1',to:'B2'}, success: '1人議会から上がれました。この道には月桂冠がないので得点は0点のまま。議員を上へ進めることと、得点を得ることは別です。', terms: ['移動','議会','空席'] },
    { title: '自分の議員で賛成する', focus: ['B2','C1'], text: 'ここからは説明用の配置です。3人議会には、赤の議員を2人置いてあります。1人を動かすには、同じ議会のほかの議員1人の賛成が必要です。', hint: 'もう1人の赤が自動で賛成します。「3段・左」へ動かして、道のIV（4点）を受け取りましょう。', action: {t:'move',from:'B2',to:'C1'}, success: 'もう1人の自分の議員の賛成で移動し、IV＝4点を獲得しました。相手への交渉は不要です。通った道には新しい月桂冠が補充されます。', terms: ['過半数','自分の議員で過半数','IV'] },
    { title: '相手に賛成を頼む', focus: ['B2','C1'], text: '今度は3人議会に赤1人と青1人。ほかの自分の議員がいないので、青の1票が必要です。練習相手は「1点なら賛成」と返してくれます。', hint: '渡す月桂冠を＋で1点にして「賛成を頼む」→賛成の返事後に「合意して動かす」。', action: {t:'move',from:'B2',to:'C1',votes:{1:1},pay:{1:1}}, success: '4点を取り、青に1点払ったので赤は差し引き3点。青は赤からの1点と、共通の置き場からの賛成のお礼1点で計2点。支払いは移動したときに実行されます。', terms: ['賛成・票','交渉','渡す月桂冠','賛成のお礼'] },
    { title: '5人議会は2票必要', focus: ['B3','C2'], text: '5人議会から出るには、動く1人以外に2人の賛成が必要です。今回は赤が3人いるため、動かない赤2人の票だけで足ります。空席があっても必要な票数は変わりません。', hint: '「3段・中央」へ1人動かしましょう。青や黄に頼む必要はありません。', action: {t:'move',from:'B3',to:'C2'}, success: '赤の2票で移動し、III＝3点を獲得。5人議会では自分を含め3人の支持が必要、と覚えましょう。', terms: ['定数','過半数','票'] },
    { title: 'カエサルで道を開く', focus: ['B2','C1'], text: '3人議会に赤が1人だけ。ふつうは賛成者が足りず移動できません。でもカエサルをこの出口に置くと、賛成が不要になります。', hint: '①「この道へカエサルを動かす」 ②次の自分の番の練習で「3段・左」へ移動。', action: {t:'caesar',to:'B2-C1'}, follow: {t:'move',from:'B2',to:'C1'}, success: '賛成なしで進めました。ただしカエサルの下のIVは取れず、赤の得点は0点のままです。通常、カエサル移動と議員移動は別々の手番を使います。', terms: ['カエサル','手番','月桂冠'] },
    { title: '☆付きIIの追加操作', focus: ['B2','C1','B3'], text: '☆付きIIは2点の月桂冠です。取った直後だけ、追加でカエサルを別の道へ動かせます。追加操作をせずに終えてもかまいません。', hint: 'まず赤を「3段・左」へ。そのあとカエサルを「2段・中右」の出口へ移すか、「動かさない」を選びましょう。', action: {t:'move',from:'B2',to:'C1'}, bonus: {t:'bonus',to:'B3-C2'}, success: '2点を獲得しました。☆付きIIの追加操作は、通常の手番をもう1回消費しません。移動先の道の月桂冠を取る効果ではありません。', terms: ['II・カエサル','カエサルの行き先'] },
    { title: '元老院へ到着、勝敗を確認', focus: ['D1','S'], text: '元老院は残り1席。赤は9点、青は20点、黄は7点です。赤の議員を最後の席へ入れてみましょう。今回は同じ議会のもう1人の赤が賛成します。', hint: '「元老院へ入る」を押すと5席が埋まり、その場でゲーム終了です。', action: {t:'move',from:'D1',to:'S'}, success: '赤が最後の席に到着し、道の3点も受け取って12点に。青は20点でも元老院に0人なので勝てません。元老院にいる黄の7点より多く、赤の勝ち！ 同点なら先に元老院へ入った人が勝ちます。', terms: ['元老院','失格・同点','目的・勝ち方'] }
  ];
  function create(index) {
    const st = E.newGame({players:[{name:'あなた',color:'red',kind:'human'},{name:'青の一族',color:'blue'},{name:'黄の一族',color:'yellow'}],seed:26026,first:0,opts:{open:true}});
    const put = (cid, owners) => owners.forEach((p,i) => { const sid = p * D.SENATORS + D.SENATORS - st.players[p].left; st.players[p].left--; if(cid === 'S') st.senate.push(sid); else st.occ[cid][i] = sid; });
    // Use real tiles from the supply, so the displayed number and effect match the engine.
    const tile = (path,v,c=false) => { const j = st.bag.findIndex(t => t.v===v && t.c===c); const old = st.spaces[path]; st.spaces[path] = st.bag.splice(j,1)[0]; st.bag.push(old); };
    if(index===0){ put('S',[0,2]); st.players[0].pts=9;st.players[1].pts=20;st.players[2].pts=7; }
    if(index===2) put('A1',[0]);
    if([3,4,7].includes(index)){put('B2',index===4?[0,1]:[0,0]);tile('B2-C1',index===7?2:4,index===7);}
    if(index===5){put('B3',[0,0,0]);tile('B3-C2',3);}
    if(index===6){put('B2',[0]);tile('B2-C1',4);}
    if(index===8){put('S',[2,2,2,2]);put('D1',[0,0]);tile('D1-S',3);st.players[0].pts=9;st.players[1].pts=20;st.players[2].pts=7;}
    return st;
  }
  return {lessons,create};
});

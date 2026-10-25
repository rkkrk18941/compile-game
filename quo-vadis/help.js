/* Shared, tappable explanations for both the table and the practice board. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QV_HELP = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const terms = [
    ['目的・勝ち方', '元老院に自分の議員を1人以上送り、その条件を満たす人の中で月桂冠の合計点を一番多く集めます。元老院を5席すべて埋めると即終了。同点なら先に元老院へ入った人が勝ちます。'],
    ['議員', 'あなたが動かすコマです。1人につき8個あり、同じ色の議員はすべて同じプレイヤーのものです。ほかの人の議員は動かせません。'],
    ['議会', '盤上のコマを置く場所です。席が1つ・3つ・5つのものがあり、道でつながった1つ上の議会へ進みます。出発する議会の大きさで必要な賛成数が決まります。'],
    ['定数・空席・満員', '定数はその議会にある席の総数です。空席はまだコマがない席、満員はすべて埋まった状態。行き先が満員なら移動できず、そこを飛び越えることもできません。'],
    ['入口', '最下段にある4つの議会です。手元の議員を新しく置けるのは、入口の空席だけです。置いた議員を同じ手番でさらに動かすことはできません。'],
    ['手元', 'まだ盤上に出していない自分の議員の置き場です。入口に1人置くたびに残りが1人減ります。元老院に着いた議員も手元には戻りません。'],
    ['元老院', '盤面の一番奥にある、5席の最終目的地です。1人でも到着すれば勝者の候補になれます。5人目が入った瞬間にゲームが終わります。到着人数そのものに得点はありません。'],
    ['手番', '自分が操作する順番です。「議員を1人置く」「議員を1人動かす」「カエサルを動かす」のどれか1つを行います。交渉だけでは手番は終わらず、移動をやめたら別の行動を選べます。'],
    ['移動・道', '自分の議員1人を、道でつながった1つ上の空席へ進めることです。斜めの道も使えますが、道がない場所へは移れません。後戻りや飛び越しはできません。'],
    ['過半数', '席の総数の半分を超える数です。出席中の人数ではなく定数で考えます。3人議会は自分を含め2人、5人議会は3人の支持が必要です。つまり動く議員以外にそれぞれ1人・2人の賛成が必要です。'],
    ['賛成・票', '移動を認める支持のこと。同じ議会にいる議員1人が1票です。動く議員以外に、3人議会なら1票、5人議会なら2票が必要。別の議会の議員は投票できず、空席も票に数えません。'],
    ['自分の議員で過半数', '同じ議会に自分の議員が3人議会なら2人、5人議会なら3人いる状態です。ほかの自分の議員が自動で賛成するので、他プレイヤーに頼まず1人を上へ動かせます。'],
    ['賛成あと○票', '自分のほかの議員の票を数えたあと、他プレイヤーから追加で必要な賛成数です。5人議会に自分が2人いるなら、動かない自分の1票があるので、あと1票です。'],
    ['月桂冠（げっけいかん）', '勝敗を決める得点チップです。道の上の数字が点数で、その道を通って上がった人が受け取ります。3人・5人議会の出口にあり、1人議会の出口にはありません。カエサルの下のものは取れません。'],
    ['I・II・III・IV・V', 'ローマ数字です。I＝1、II＝2、III＝3、IV＝4、V＝5点。「IV」を取れば4点増えます。チップの枚数ではなく数字の合計で競います。'],
    ['賛成のお礼「I」', '他の色の議員が実際に移動に使われる賛成をすると、共通の置き場から1票につき1点もらいます。動く人の手持ちから減る点ではありません。Iの在庫が尽きたらこのお礼はなくなります。自分の議員の賛成ではもらえません。'],
    ['交渉・賛成を頼む', '同じ議会にいる相手に移動への賛成を頼むことです。渡す得点や今後の約束を提示できます。相手は無料で賛成しても、条件を付けても、断ってもかまいません。合意するまで移動は確定しません。'],
    ['渡す月桂冠・取り分', '賛成してもらうために、自分から相手へ渡す得点です。共通の置き場から出る1点のお礼とは別です。例：4点の道を通り相手に1点払うと、自分は差し引き3点、相手は支払い1点＋お礼1点を得ます（Iの在庫がある場合）。'],
    ['払える月桂冠', '自分の今の得点に、この移動で取れるチップの点を足した額です。この範囲で支払いを約束できます。カエサルの道ではチップを取れないため、そのチップの点は使えません。'],
    ['○点なら賛成', '相手が出した対案です。指定された点数に条件を変えて、もう一度頼みます。条件を変えただけでは合意にならず、賛成の返事が必要です。'],
    ['取り決め', '今回の手番で実行する約束です。合意した月桂冠の支払いは、移動したときに自動で精算されます。移動を取りやめた場合は支払いも賛成のお礼も発生しません。'],
    ['次に賛成する約束', '「今助けてくれたら、次はあなたを助ける」という将来の約束です。記録は残りますが、将来の履行は強制されません。必ず賛成がもらえる保証としては使えません。'],
    ['カエサル', '月桂冠の上に置く特別な駒です。その道を通る移動に限り、賛成が不要になります。ただし下の月桂冠はだれも取れません。自分の手番を1回使って別の月桂冠の上へ動かせます。行き先の空席は必要です。'],
    ['II・カエサル／☆', '2点に加えて、移動後にカエサルを動かせる特別な月桂冠です。このアプリでは☆付きのIIで表示します。追加の移動は任意で、通常の手番をもう1回使う必要はありません。ゲーム終了時には追加操作はありません。'],
    ['カエサルの行き先を任せる', '☆付きIIを取ったあとの追加操作を、賛成した相手に任せる交渉条件です。議員の行き先を決めてもらう意味ではなく、カエサルを置く道を相手が選ぶという意味です。'],
    ['秘密の得点・公開', '通常、獲得した月桂冠の合計は持ち主だけが確認できます。設定の「見せる」では全員の点を表示します。道に置かれた月桂冠はいつでも全員に見えます。'],
    ['途中公開', '追加ルールです。1人目・2人目・3人目が元老院へ入るたびに、全員の得点を一時的に見せ合います。常に全員の点が見える設定とは別です。'],
    ['「I」を減らす', '賛成のお礼に使う1点チップの枚数を、3人なら10枚、4人なら14枚、5人なら18枚にする追加ルールです。通常は人数にかかわらず18枚です。'],
    ['失格・同点', 'ここでの失格は、終了時に元老院に議員がおらず、勝者の候補から外れることです。元老院にいる人どうしが同点なら、先に自分の議員を入れた人が勝ちます。'],
    ['CPU・進行役・部屋コード', 'CPUはコンピューターの対戦相手。オンラインの進行役は部屋を作った人で、その端末がゲームを進めます。部屋コードは同じ対戦に参加するための4文字の合言葉です。']
  ];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const term = (label, key = label) => `<button type="button" class="qv-term" data-term="${esc(key)}" aria-label="${esc(label)}の説明">${esc(label)}<span aria-hidden="true">？</span></button>`;
  function openGlossary(query = '') {
    const old = document.querySelector('#qvGlossary'); if (old) old.close();
    const d = document.createElement('dialog'); d.id = 'qvGlossary'; d.className = 'qv-help';
    d.setAttribute('aria-labelledby', 'qvHelpTitle');
    d.innerHTML = `<header><h2 id="qvHelpTitle">用語説明</h2><button type="button" class="qv-close" aria-label="用語説明を閉じる">×</button></header><label class="qv-search">言葉を探す<input type="search" placeholder="例：月桂冠、票、カエサル" aria-label="用語を検索"></label><div class="qv-terms"></div>`;
    document.body.appendChild(d);
    const input = d.querySelector('input'), list = d.querySelector('.qv-terms');
    const draw = () => {
      const q = input.value.trim().normalize('NFKC').toLowerCase();
      const found = terms.filter(t => t.join(' ').normalize('NFKC').toLowerCase().includes(q));
      found.sort((a, b) => Number(b[0].normalize('NFKC').toLowerCase().includes(q)) - Number(a[0].normalize('NFKC').toLowerCase().includes(q)));
      list.innerHTML = found.length ? found.map(t => `<article><h3>${esc(t[0])}</h3><p>${esc(t[1])}</p></article>`).join('') : '<p>見つかりませんでした。短い言葉で探すか、検索欄を空にして一覧を見てください。</p>';
    };
    input.value = query; input.oninput = draw; draw();
    d.querySelector('.qv-close').onclick = () => d.close();
    d.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); d.close(); } });
    d.addEventListener('click', e => { if (e.target === d && (e.clientX < d.getBoundingClientRect().left || e.clientX > d.getBoundingClientRect().right || e.clientY < d.getBoundingClientRect().top || e.clientY > d.getBoundingClientRect().bottom)) d.close(); });
    const prev = document.activeElement;
    d.addEventListener('close', () => { d.remove(); if (prev && prev.isConnected) prev.focus(); });
    d.showModal();
    d.querySelector('.qv-close').focus();
  }
  function init() {
    document.addEventListener('click', e => { const b = e.target.closest('[data-term]'); if (b) { e.preventDefault(); openGlossary(b.dataset.term); } });
  }
  return { terms, esc, term, openGlossary, init };
});

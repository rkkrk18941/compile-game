/* 80% — words. English is the default; Japanese is used when the player's locale is Japanese.
   window.EIGHTY_I18N = { lang, t(key, ...args), setLang(code), detect(hint), applyDom(), cpuName(type), cpuTitle(type), short(n) } */
(function (root) {
  'use strict';
  var EN = {
    docTitle: '80%',
    you: 'You', opp: 'Opponent', net: 'Net worth',
    ariaSound: 'Sound', ariaSpeed: 'Animation speed', ariaHelp: 'How to play', ariaQuit: 'Quit', ariaPanel: 'Controls',
    ariaBorrow: 'Amount to borrow', ariaBet: 'Share of your cash to stake', ariaAtk: 'Share of the debt to double', ariaChart: 'Net worth over time',
    ariaMinus: '10% less', ariaPlus: '10% more',
    pChoose: 'Choose how much to stake',
    pBoth: 'Choose your stake and how much debt to attack',
    pNoCashAtk: 'You have no cash (you can still attack)',
    pNoCashPass: 'You have no cash — you sit this round out',
    pBust: 'You are out of cash',
    borrowTitle: 'Bust — you may borrow', borrowMaxLbl: 'Limit',
    borrowRisk: 'The limit is the cash you held at the start of the round you went bust. From your 2nd loan on, (existing debt + new loan) is multiplied by 5 the moment you borrow.',
    borrowPreview: function (debt, repeat) { return 'Debt right after borrowing: ' + debt + (repeat ? ' (existing debt + loan, ×5)' : '') + '. 30% interest is added at the end of every round.'; },
    btnBorrow: 'Borrow', btnNoBorrow: 'No loan',
    betTitle: 'Your stake', betSub: '80%: doubled · 20%: lost',
    allIn: 'All in', pctAll: 'ALL',
    hintPiles: 'You can also tap the stacks on the table (1 stack = 10%)',
    atkTitle: 'Debt Attack', atkSub: 'Their debt',
    atkRisk: function (x) { return '80% hit: their debt <b>+' + x + '</b><br>20% miss: <b>' + x + '</b> of debt moves to you'; },
    atkPick: 'Pick how much of their debt to double (optional)',
    go: 'BET!', goPass: 'Sit this round out',
    tag: 'DOUBLE AT 80. NOTHING AT 20.',
    play: 'PLAY', setup: 'Choose opponent', rules: 'How to play',
    setupTitle: 'Match setup', lblRounds: 'Rounds', lblOpp: 'Across the glass', takeSeat: 'Take a seat', back: 'Back',
    n_careful: 'Ishibashi', t_careful: 'Cautious',
    n_calc: 'Kujo', t_calc: 'Calculating',
    n_mad: 'Shido', t_mad: 'Mad dog',
    n_whim: 'Miya', t_whim: 'Moody',
    n_max: 'Takamiya', t_max: 'Strongest',
    n_random: '???', t_random: 'Surprise me',
    nameTitle: function (nm, title) { return nm + ' (' + title + ')'; },
    noteMax: 'Takamiya (Strongest): for every mix of stake and attack he imagines the rest of the match hundreds of times and keeps the move that wins most often. He only uses what is on the table: both players’ cash and debt.',
    record: function (w, l, d, best) { return 'Record ' + w + 'W ' + l + 'L' + (d ? ' ' + d + 'D' : '') + ' · Best net worth ' + best; },
    hudDebt: function (v) { return 'Debt ' + v + ' /'; },
    round: function (r) { return 'ROUND ' + r; }, finalRound: 'FINAL ROUND', finalSub: 'Last round',
    oppBorrowThinking: function (nm) { return nm + ' is deciding whether to borrow…'; },
    popLoan: function (v) { return 'Loan ' + v; }, popNoLoan: 'No loan',
    reBorrow: 'BORROWED AGAIN — DEBT ×5', totalDebt: function (v) { return 'Total debt ' + v; },
    pass: 'Pass',
    popDouble: function (v) { return 'Double ' + v + '?'; },
    popWin: function (v) { return '×2  +' + v; }, popLose: function (v) { return 'LOST  −' + v; },
    atkBanner: 'DEBT ATTACK', atkBannerOp: function (nm) { return nm + ' ATTACKS'; },
    atkBannerSub: function (who, v) { return who ? 'Doubling ' + v + ' of ' + who + '’s debt' : 'Doubling ' + v + ' of your debt'; },
    popDebtUp: function (v) { return 'Debt +' + v; },
    popAtkFail: function (v) { return 'Missed… ' + v + ' of debt taken on'; },
    interest: 'INTEREST 30%', interestSub: 'Added to all debt at the end of the round',
    popInterest: function (v) { return 'Interest +' + v; },
    win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW',
    resKicker: function (n) { return n + ' ROUNDS — FINAL'; },
    resSub: function (a, nm, b) { return 'Net worth   You ' + a + '   /   ' + nm + ' ' + b; },
    stCash: 'Cash', stDebt: 'Debt', stBets: 'Bets (won-lost)', stPass: 'Passes', stPeak: 'Peak cash', stBorrowed: 'Total borrowed', stAtk: 'Attacks hit/missed',
    again: 'Play again', toTitle: 'Menu', chartStart: 'Start',
    firstTip: 'Slide to pick your stake, then press BET!  Tap ? for the full rules.',
    faster: 'Faster animations', normalSpeed: 'Normal speed',
    quitAsk: 'Quit this match and return to the menu?', quitYes: 'Quit', quitNo: 'Keep playing',
    loading: 'Setting the table…',
    loadErr: 'The 3D view could not start. Please reload the page.',
    rulesH: 'How to play', gotIt: 'Got it',
    rulesItems: [
      'You start with <b>¥10,000</b> (ten ¥1,000 notes). Your cash always sits in <b>10 stacks</b>, so <b>1 stack = 10%</b>.',
      'Every round, stake <b>0–100%</b> of your cash in steps of 10%. Tap the stacks on the table or use the slider.',
      'At <b>80%</b> your stake is <b>doubled</b>. At <span class="red">20%</span> your stake is <span class="red">lost</span>.',
      'If your cash hits 0 you are bust. From the next round you may borrow <b>up to the cash you held at the start of the round you went bust</b>.',
      'Debt grows by <b>30% interest at the end of every round</b> (after attacks, including the final round, rounded up to ¥10). <b>From your 2nd loan on, (existing debt + new loan) is multiplied by 5</b> the moment you borrow. Example: owing ¥1,300 and borrowing ¥1,000 more → you owe ¥11,500.',
      'If your opponent is in debt you can launch a <b>Debt Attack</b>. Pick any part of their debt (steps of 10%): at <b>80%</b> that part is doubled. At <span class="red">20%</span> it misses and <span class="red">that part of the debt moves to you</span>.',
      'You can bet and attack in the same round. Both players’ choices are revealed at the same time across the glass.',
      'After the final round, the higher <b>net worth (cash − debt)</b> wins.'
    ],
    // drawn on the table and on the IOU slip
    decal: '1 STACK = 10%',
    iouTitle: 'I . O . U', iouLine1: 'I acknowledge borrowing the sum above,', iouLine2: 'to be settled by the result of the match.',
    iouRound: function (r) { return 'Round ' + r; }, iouDebtor: 'Debtor', iouStamp: '×2', iouMoved: 'TAKEN OVER'
  };
  var JA = {
    docTitle: '80% — エイティ・パーセント',
    you: 'あなた', opp: '相手', net: '純資産',
    ariaSound: '効果音', ariaSpeed: '演出の速さ', ariaHelp: 'あそびかた', ariaQuit: 'やめる', ariaPanel: '操作パネル',
    ariaBorrow: '借りる額', ariaBet: '賭ける割合', ariaAtk: '倍化する借金の割合', ariaChart: '純資産の推移',
    ariaMinus: '10%減らす', ariaPlus: '10%増やす',
    pChoose: '賭けるお金を選んでください',
    pBoth: '賭け金と、アタックする額を選ぶ',
    pNoCashAtk: '所持金がありません（アタックはできます）',
    pNoCashPass: '所持金がないので、このラウンドは見送りです',
    pBust: '所持金が0になりました',
    borrowTitle: '破産 — 借金できます', borrowMaxLbl: '上限',
    borrowRisk: '上限は、破産したラウンドの始めに持っていた額。2回目以降は、借りた瞬間に（既存の借金＋借入額）が5倍になります。',
    borrowPreview: function (debt, repeat) { return '借入直後の借金：' + debt + (repeat ? '（既存の借金＋借入額を5倍）' : '') + '。各ラウンド終了時に利息30％（10円未満切り上げ）。'; },
    btnBorrow: '借りる', btnNoBorrow: '借りない',
    betTitle: '賭け金', betSub: '80%で2倍・20%で没収',
    allIn: '全額', pctAll: '全額',
    hintPiles: '机の上の山をタップしても選べます（1山 = 10%）',
    atkTitle: '借金倍化アタック', atkSub: '相手の借金',
    atkRisk: function (x) { return '成功 80%：相手の借金 <b>+' + x + '</b><br>失敗 20%：<b>' + x + '</b> の借金があなたに移る'; },
    atkPick: '相手の借金のうち、倍にする額を選ぶ（任意）',
    go: '勝負！', goPass: 'このラウンドは見送る',
    tag: '八割で倍。二割で無。',
    play: '勝負する', setup: '相手とラウンド数を選ぶ', rules: 'あそびかた',
    setupTitle: '勝負の設定', lblRounds: 'ラウンド数', lblOpp: 'ガラスの向こうの相手', takeSeat: 'テーブルにつく', back: '戻る',
    n_careful: '石橋', t_careful: '慎重派',
    n_calc: '九条', t_calc: '計算派',
    n_mad: '獅堂', t_mad: '狂犬',
    n_whim: '宮', t_whim: '気分屋',
    n_max: '鷹宮', t_max: '最強',
    n_random: '？？？', t_random: 'おまかせ',
    nameTitle: function (nm, title) { return nm + '（' + title + '）'; },
    noteMax: '鷹宮（最強）：賭ける量と攻める量の組み合わせごとに、残りのラウンドを何百回も想像して、いちばん勝てる手を選びます。見ているのはテーブルに出ている所持金と借金だけです。',
    record: function (w, l, d, best) { return '戦績 ' + w + '勝 ' + l + '敗' + (d ? ' ' + d + '分' : '') + '　最高純資産 ' + best; },
    hudDebt: function (v) { return '借金 ' + v + ' /'; },
    round: function (r) { return 'ROUND ' + r; }, finalRound: 'FINAL ROUND', finalSub: '最終ラウンド',
    oppBorrowThinking: function (nm) { return nm + ' が借金するか考えています…'; },
    popLoan: function (v) { return '借入 ' + v; }, popNoLoan: '借りない',
    reBorrow: '再借入 — 借金5倍', totalDebt: function (v) { return '借金総額 ' + v; },
    pass: '見送り',
    popDouble: function (v) { return '倍化 ' + v + '?'; },
    popWin: function (v) { return '×2　+' + v; }, popLose: function (v) { return '没収　−' + v; },
    atkBanner: '借金倍化アタック', atkBannerOp: function (nm) { return nm + ' のアタック'; },
    atkBannerSub: function (who, v) { return (who || 'あなた') + 'の借金 ' + v + ' を倍に'; },
    popDebtUp: function (v) { return '借金 +' + v; },
    popAtkFail: function (v) { return '失敗… ' + v + ' を肩代わり'; },
    interest: '利息 30％', interestSub: 'ラウンド終了時の借金に加算',
    popInterest: function (v) { return '利息 +' + v; },
    win: '勝利', lose: '敗北', draw: '引き分け',
    resKicker: function (n) { return n + ' ROUNDS — FINAL'; },
    resSub: function (a, nm, b) { return '純資産　あなた ' + a + '　／　' + nm + ' ' + b; },
    stCash: '所持金', stDebt: '借金', stBets: '勝負（勝-負）', stPass: '見送り', stPeak: '最大所持金', stBorrowed: '借りた総額', stAtk: 'アタック 成功/失敗',
    again: 'もう一度', toTitle: 'タイトルへ', chartStart: '開始',
    firstTip: 'スライダーで賭け金を決めて「勝負！」。くわしいルールは ? ボタンから。',
    faster: '演出を速くしました', normalSpeed: '演出を元の速さにしました',
    quitAsk: 'ゲームをやめてタイトルに戻りますか？', quitYes: 'やめる', quitNo: '続ける',
    loading: 'テーブルを用意しています…',
    loadErr: '3D表示を準備できませんでした。ページを再読み込みしてください。',
    rulesH: 'あそびかた', gotIt: 'わかった',
    rulesItems: [
      '最初の所持金は <b>¥10,000</b>（千円札10枚）。所持金はいつも<b>10の山</b>に分かれていて、<b>1山＝10%</b>。',
      '毎ラウンド、所持金の <b>0〜100%（10%刻み）</b>を賭ける。机の山をタップするか、スライダーで選ぶ。',
      '<b>80%</b>で賭けたお金が<b>2倍</b>に。<span class="red">20%</span>で賭けたお金は<span class="red">没収</span>。',
      '所持金が0になったら破産。次のラウンドから、<b>破産したラウンドの始めに持っていた額まで</b>借金できる。',
      '借金には<b>毎ラウンド終了時に30％の利息</b>がつく（アタック解決後・最終ラウンドを含む／10円未満切り上げ）。<b>2回目以降の借入は、借りた瞬間に（既存の借金＋借入額）が5倍</b>になる。例：借金1,300円で1,000円を再借入 → 借金11,500円。',
      '相手に借金があれば<b>借金倍化アタック</b>。相手の借金のうち好きな額（10%刻み）を指定して、<b>80%</b>で相手の借金がその額だけ増える（指定した分が2倍）。<span class="red">20%</span>で失敗すると、<span class="red">指定した額の借金があなたに移る</span>。',
      '賭けとアタックは同じラウンドに両方できる。相手の選択はガラスの向こうで同時に明かされる。',
      '最終ラウンドが終わった時点の<b>純資産（所持金 − 借金）</b>が多いほうの勝ち。'
    ],
    decal: '1 山 ＝ 10 %',
    iouTitle: '借 用 書', iouLine1: '上記の金額を確かに借用しました。', iouLine2: '勝負の結果をもって返済とします。',
    iouRound: function (r) { return '第 ' + r + ' 回戦'; }, iouDebtor: '借主', iouStamp: '倍', iouMoved: '肩代わり'
  };
  var DICT = { en: EN, ja: JA };
  var api = {
    lang: 'en',
    detect: function (hint) {
      var q = '';
      try { q = new URLSearchParams(root.location.search).get('lang') || ''; } catch (e) { /* ignore */ }
      var nav = (root.navigator && (root.navigator.language || (root.navigator.languages || [])[0])) || '';
      var pick = String(q || hint || nav || 'en').toLowerCase();
      return pick.indexOf('ja') === 0 ? 'ja' : 'en';
    },
    setLang: function (code) { api.lang = DICT[code] ? code : 'en'; },
    t: function (key) {
      var v = DICT[api.lang][key];
      if (v == null) v = EN[key];
      if (typeof v === 'function') return v.apply(null, Array.prototype.slice.call(arguments, 1));
      return v == null ? key : v;
    },
    cpuName: function (type) { return api.t('n_' + type); },
    cpuTitle: function (type) { return api.t('t_' + type); },
    /* short money label for the chart axis */
    short: function (v) {
      var a = Math.abs(v), s = v < 0 ? '−' : '';
      if (a === 0) return '0';
      if (api.lang === 'ja') { if (a >= 1e8) return s + a / 1e8 + '億'; if (a >= 1e4) return s + a / 1e4 + '万'; return s + a / 1e3 + '千'; }
      if (a >= 1e9) return s + a / 1e9 + 'B'; if (a >= 1e6) return s + a / 1e6 + 'M'; return s + a / 1e3 + 'K';
    },
    applyDom: function () {
      var d = root.document; if (!d) return;
      d.documentElement.lang = api.lang;
      d.documentElement.setAttribute('data-lang', api.lang);
      d.title = api.t('docTitle');
      Array.prototype.forEach.call(d.querySelectorAll('[data-i18n]'), function (el) { el.textContent = api.t(el.getAttribute('data-i18n')); });
      Array.prototype.forEach.call(d.querySelectorAll('[data-i18n-aria]'), function (el) { el.setAttribute('aria-label', api.t(el.getAttribute('data-i18n-aria'))); });
      var ol = d.getElementById('rulesList');
      if (ol) ol.innerHTML = api.t('rulesItems').map(function (li) { return '<li>' + li + '</li>'; }).join('');
    }
  };
  api.setLang(api.detect(''));
  root.EIGHTY_I18N = api;
})(typeof window !== 'undefined' ? window : globalThis);

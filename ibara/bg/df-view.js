/* スレイザスパイア — Downfall: presentation of the new characters (pictures, Slimes and other states on the
   battlefield, reference texts). Read-only helpers used by ui.js; no rules. */
(function (root) {
'use strict';
var STS = root.STS, V = STS.View, D = STS.DATA, DF = STS.DF, H = STS.Help, X = STS.Explain;
var esc = V.esc;
var cardImg=V.cardImg;V.cardImg=function(id){return cardImg(DF.canon ? DF.canon(id) : id);};
Object.keys(STS.MONSTERS).forEach(function(id){var m=STS.MONSTERS[id];if(m.df&&/^df-/.test(m.art||'')){V.ENEMY_IMG[m.art]=1;V.OFFICIAL_PORTRAIT[m.art]=1;V.ART_SIZE[m.art]=[360,420];}});

/* ------------------------------------------------------------------ pictures */
V.HERO.S = 'slime'; V.HERO.U = 'guardian'; V.HERO.H = 'hexaghost'; V.HERO.M = 'hermit';
V.SELECT.S = 'slimeboss-select'; V.SELECT.U = 'guardian-select'; V.SELECT.H = 'hexaghost-select'; V.SELECT.M = 'hermit-select';
V.ORB.S = 'slime'; V.ORB.U = 'guardian'; V.ORB.H = 'hexaghost'; V.ORB.M = 'hermit';
V.ART_SIZE.slime = [406, 315]; V.ART_SIZE.guardian = [380, 307]; V.ART_SIZE.hexaghost = [343, 313]; V.ART_SIZE.hermit = [290, 334];
V.TYPE.L = 'スライム';

/* ------------------------------------------------------------------ Slimes on the battlefield */
var SLIME_COLOR = { BruiserSlime: '#6aa84f', MassiveSlime: '#3f7f3a', LeechingSlime: '#9b3b52', ScrappySlime: '#b56a2a', SpikeSlimeP: '#5f7f96',
  SpreadingSlime: '#7aa33a', StickySlime: '#4f9c8c', TauntingSlime: '#c7a43a', PsychicSlime: '#7f59b5', MuscleSlime: '#b5463a', RoyalSlime: '#3a5fb5',
  EvolutionSlime: '#3ab59b', ArmoredSlime: '#8a8f99' };
function blob(color) {
  return '<svg viewBox="0 0 32 26" aria-hidden="true"><path d="M3 22c-2-6 1-13 7-16 5-3 11-2 15 2 5 4 6 11 3 14-6 2-19 2-25 0z" fill="' + color + '" stroke="rgba(0,0,0,.45)" stroke-width="1.4"/>' +
    '<ellipse cx="12" cy="12" rx="2" ry="2.6" fill="#10170e"/><ellipse cx="20" cy="12" rx="2" ry="2.6" fill="#10170e"/><path d="M9 9c3-3 9-3 12 0" stroke="rgba(255,255,255,.35)" stroke-width="1.6" fill="none"/></svg>';
}
function slimeLevels(inst) { var d = STS.CARDS[inst.id] || {}; return (inst.up ? d.lvu : d.lv) || []; }
V.slimeText = function (inst) {
  var d = STS.CARDS[inst.id] || {}, lv = slimeLevels(inst);
  return (d.name || inst.id) + (inst.up ? '+' : '') + '・Lv' + inst.lv + '/' + lv.length + (inst.str ? '・筋力' + inst.str : '') + '：' + DF.levelText(lv[inst.lv - 1] || []);
};
V.dfBody = function (pc, interactive) {
  var l = pc.slimes || [];
  if (!l.length) return '';
  return '<div class="dfslimes" aria-label="スライム">' + l.map(function (x) {
    var d = STS.CARDS[x.id] || {};
    return '<span class="dfslime" data-key="slime-' + pc.i + '-' + x.u + '"' + (interactive === false ? '' : ' data-a="slimeinfo" data-pi="' + pc.i + '"') + ' title="' + esc(V.slimeText(x)) + '" aria-label="' + esc(V.slimeText(x)) + '">' +
      blob(SLIME_COLOR[x.id] || '#6aa84f') + '<b>' + x.lv + '</b>' + (x.str ? '<i>+' + x.str + '</i>' : '') + '<small>' + esc((d.name || '').replace(/スライム$/, '') || 'スライム') + '</small></span>';
  }).join('') + '</div>';
};
/* Other character states (Modes, Vigor, Heat, Soulburn) as status chips. */
V.dfToks = function (pc, interactive) {
  function chip(label, key, cls) { return '<span class="tok ' + (cls || 'etc') + '"' + (interactive === false ? '' : ' data-help="term:' + key + '"') + '>' + esc(label) + '</span>'; }
  var h = '';
  if (pc.mode) h += chip(pc.mode === 'defense' ? '防御モード' : '攻撃モード', 'dfmode', 'dfmode-' + pc.mode);
  if (pc.vigor || pc.vigorSpent) h += chip('活力' + (pc.vigor || 0) + (pc.vigorSpent ? '（使用' + pc.vigorSpent + '）' : ''), 'vigor', 'dfvigor');
  if (pc.heat != null) h += chip('ヒート' + pc.heat, 'heat', 'dfheat');
  if (pc.soul) h += chip('ソウルバーン' + pc.soul, 'soulburn', 'dfsoul');
  return h;
};
/* Buttons beside Shiv / Miracle: spend Vigor, use Soulburn. */
V.dfActButtons = function (pc, open) {
  if (!open || !pc) return '';
  var h = '';
  if (pc.vigor > 0) h += '<button class="btn sm dfbtn-vigor" data-a="vigor" aria-label="活力を1使う（残り' + pc.vigor + '）">活力' + pc.vigor + '</button>';
  if (pc.soul > 0) h += '<button class="btn sm dfbtn-soul" data-a="soulburn" aria-label="ソウルバーンを使う（ヒート' + (pc.heat || 0) + 'ダメージ、残り' + pc.soul + '）">ソウルバーン' + pc.soul + '</button>';
  return h;
};
/* Information sheets: { html, o } or null. */
V.dfInfo = function (run, v, me) {
  var cs = run && run.combat;
  if (v.k === 'slimes' && cs && cs.pcs) {
    var pc = cs.pcs[v.pi == null ? me : v.pi];
    if (!pc) return null;
    var who = run.players[pc.i];
    var h = '<h3>' + esc((pc.i === me ? 'あなた' : who.name)) + 'のスライム（' + (pc.slimes || []).length + '体）</h3>' +
      '<p>スライムは場に残り、「命令」で今のレベルの能力を使います。「成長」でレベルが1上がります（最大レベルまで）。スライムのヒットは、スライム自身の筋力（最大8）だけが+1ずつ加わり、スライムボスの筋力・脱力や敵の弱体化の影響を受けません。</p>';
    (pc.slimes || []).forEach(function (x) {
      var d = STS.CARDS[x.id] || {}, lv = slimeLevels(x);
      h += '<section class="effect-guide dfslime-info"><h4>' + blob(SLIME_COLOR[x.id] || '#6aa84f') + esc(d.name + (x.up ? '+' : '')) + '　<small>Lv' + x.lv + '/' + lv.length + (x.str ? '・筋力' + x.str + (x.tstr ? '（うちターン終了時に' + x.tstr + '失う）' : '') : '') + '</small></h4><ol class="dflevels">' +
        lv.map(function (atoms, i) { return '<li class="' + (i + 1 === x.lv ? 'now' : '') + '"><b>Lv' + (i + 1) + '</b> ' + esc(DF.levelText(atoms)) + (i + 1 === x.lv ? ' <em>← 今のレベル</em>' : '') + '</li>'; }).join('') + '</ol>' +
        (DF.slimeExtraText(d) ? '<p>' + esc(DF.slimeExtraText(d)) + '</p>' : '') + '</section>';
    });
    return { html: h };
  }
  return null;
};
DF.slimeExtraText = function (d) {
  var out = [];
  if (d.bruiser) out.push('戦闘開始時から場にあり、デッキには入りません。');
  if (d.endTurn) out.push('ターン終了時：このスライムに命令する（ターン終了時のダメージ処理で行います）。');
  if (d.onGrow) out.push('スライムを成長させるたび、このスライムに命令する。');
  if (d.onSpend2) out.push('カード1枚に2エナジー以上を払うたび（カードの処理後）、このスライムに命令する。');
  if (d.onStr) out.push('1ターンに1回：このスライムが筋力を得た時、命令する。');
  if (d.oncePerTurn) out.push('このスライムには1ターンに1回だけ命令できる。');
  return out.join('');
};

/* ------------------------------------------------------------------ Gems (the Guardian's Sockets) */
/* A card with a Gem shows the Gem's name as a badge and its effect in place of "Socket.". */
var _card = V.card;
V.card = function (c, o) {
  var gem = c && c.gem && DF.GEMS && DF.GEMS[c.gem];
  if (!gem) return _card.call(V, c, o);
  var tx0 = V.cardText, h;
  V.cardText = function (id, up) { var t = tx0(id, up); return t.indexOf('ソケット') >= 0 ? t.replace(/ソケット。?/, 'ジェム「' + gem.name + '」：' + gem.tx) : t + '\nジェム「' + gem.name + '」：' + gem.tx; };
  try { h = _card.call(V, c, o); } finally { V.cardText = tx0; }
  return h.replace(/<\/button>$/, '<span class="dfgem" title="' + esc(DF.gemText(c.gem)) + '">◆' + esc(gem.name) + '</span></button>');
};
/* Revealed Gems beside a card reward or the Merchant's cards. */
V.dfGemOffer = function (gems, shop) {
  if (!gems || !gems.length) return '';
  return '<div class="dfgem-offer" role="note"><b>ジェム</b>' + (shop ? 'ソケットのあるカードを買うと、次のジェムから1つを選んで付けます（この商人で2枚まで）。' : 'ソケットのあるカードを選ぶと、次のジェムから1つを選んで付けます。選ばなかったジェムはジェムデッキの一番下へ。') +
    '<ul>' + gems.map(function (g) { return '<li><span class="dfgem">◆' + esc(DF.gemName(g)) + '</span>' + V.kw((DF.GEMS[g] || {}).tx || '') + '</li>'; }).join('') + '</ul></div>';
};

/* ------------------------------------------------------------------ the Downfall characters as Bosses */
var SLIME_PASSIVE = '成長：スライムボスとスライム全員が筋力1を得る。命令：手下のスライムが今すぐもう一度行動する。';
Object.assign(V.PASSIVE, {
  DfBruiserSlime: 'スライムボスの手下。「命令」でもう一度行動し、「成長」で筋力を得る。',
  DfSlimeBoss2: '戦闘開始時、各列にブルーザースライム（HP8）がいる。' + SLIME_PASSIVE + '分裂：倒されると次のラウンド開始時、各列にアシッドスライムLとアシッドスライムMを召喚する。',
  DfSlimeBoss3: '戦闘開始時、各列にブルーザースライム（HP10）とアシッドスライムMがいる。' + SLIME_PASSIVE + '分泌：手下が2体未満の列にスパイクスライムMを召喚。分裂：倒されると次のラウンド開始時、各列に筋力付きのアシッドスライムLとスパイクスライムMを召喚する。',
  DfGuardian2: 'モードシフト：ブロックがない状態でモードシフトを迎えると攻撃せず防御モードへ。鋭い外殻（防御モード）：アタックを使ったプレイヤーは1ダメージを受ける。',
  DfGuardian3: 'モードシフト：ブロックがない状態でモードシフトを迎えると攻撃せず防御モードへ。鋭い外殻（防御モード）：アタックを使ったプレイヤーは2ダメージを受ける。',
  DfHexaghost2: 'ヒート（1〜6、開始時2）：前進で上がり、後退で下がる。ゴーストフレイムとソウルバーンのダメージはヒートで決まる（表示の数字は今のヒートで計算済み）。',
  DfHexaghost3: 'ヒート（1〜6、開始時3）：前進で上がり、後退で下がる。ゴーストフレイムとソウルバーンのダメージはヒートで決まる（表示の数字は今のヒートで計算済み）。',
  DfHermit1: 'チャンバー（最大2発、開始時1発）：装填で弾が増える。「デッド-オン」の行動は弾がある時に強くなり、弾を1発使う。',
  DfHermit2: 'チャンバー（最大2発、開始時2発）：装填で弾が増える。ファニングは弾の数だけ追加で撃ち（連射）、弾をすべて使う。「デッド-オン」の行動は弾がある時に強くなり、弾を1発使う。',
  DfHermit3: 'チャンバー（最大2発、開始時2発）：装填で弾が増える。ファニングは弾の数だけ追加で撃ち（連射）、弾をすべて使う。「デッド-オン」の行動は弾がある時に強くなり、弾を1発使う。'
});
Object.assign(V.FN, {
  dfGrow: '成長：スライム全員の筋力+1', dfCommand: '命令：手下のスライムがもう一度行動', dfSecrete: '分泌：手下が2体未満の列にスパイクスライムM',
  dfGuard: 'ブロック（人数分）', dfShift: 'モードシフト（ブロックがあれば攻撃）', dfToAttack: '攻撃モードへ戻る',
  dfAdv1: 'ヒート+1（前進）', dfAdv2: 'ヒート+2（前進）', dfRet1: 'ヒート−1（後退）', dfRet2: 'ヒート−2（後退）', dfRet3: 'ヒート−3（後退）',
  dfLoad1: '1発装填', dfLoad2: '2発装填', dfFire: '弾を1発使う', dfFireAll: '弾をすべて使う'
});
Object.assign(V.FN_KIND || {}, { dfGrow: 'buff', dfCommand: 'special', dfSecrete: 'special', dfGuard: 'def', dfShift: 'def', dfToAttack: 'buff',
  dfAdv1: 'buff', dfAdv2: 'buff', dfRet1: 'special', dfRet2: 'special', dfRet3: 'special', dfLoad1: 'buff', dfLoad2: 'buff', dfFire: 'special', dfFireAll: 'special' });
/* Heat and loaded rounds of a Boss, shown with its other tokens. */
V.dfFoeToks = function (e, interactive) {
  var m = STS.MONSTERS[e.id] || {}, h = '';
  if (!m.df || !e.x) return '';
  function chip(label, key) { return '<span class="tok etc"' + (interactive === false ? '' : ' data-help="term:' + key + '"') + '>' + esc(label) + '</span>'; }
  if (e.x.heat != null) h += chip('ヒート' + e.x.heat, 'heat');
  if (e.x.ammo != null) h += chip('装填' + e.x.ammo + '発', 'chamber');
  return h;
};

/* Printed boss passives and counters remain inspectable beside their action forecasts. */
Object.assign(V.PASSIVE,{
 DfWitch:'毒液：ターン終了時、手札の毒液1枚につきHPを1失う（ブロック不可）。',
 DfDarkCore:'ダーク生成：各列にダークオーブを召喚。供給は最大4体。倒れたオーブは再使用する。',
 DfWrathful:'憤怒：ラウンド開始時に自身へ弱体化1。防衛でプレイヤーに与えたHP損失分のブロックを得る。',
 DfWrathful2:'憤怒：ラウンド開始時に自身へ弱体化1。防衛で与えたHP損失分のブロックを得る（この幕版は設計ボス）。',
 DfOrbMaster:'開始時、各列にオーブ2体。オーブの追加ダメージはオーブマスターの筋力と同じ。バッファ1個につき次のダメージ1回を全て防ぐ。',
 DfOrbMaster3:'各列のオーブ、オーブに加算する筋力、バッファを使用（この幕版は設計ボス）。',
 DfInferno:'炎の障壁がいる間はHPを失わない。火傷を引いた時に1枚引く。火傷のターン終了効果後にその火傷を廃棄。A10では火傷のダメージが2。',
 DfFlameBarrier:'炎の壁の行動中、この敵にアタックを使うと火傷1枚を得る。範囲攻撃も含む。障壁が生存中はインフェルノがHPを失わない。',
 DfTrickster:'この敵がいる間、プレイヤーの弱体化は敵の攻撃後に取り除かれない。この敵が倒れるとプレイヤーの弱体化を除く。',
 DfDoppelganger:'脱力無効。この敵がいる間、プレイヤーの脱力はアタック使用後に取り除かれない。倒れるとプレイヤーの脱力を除く。',
 DfDemon:'倒すと次のラウンド開始時にCorruptedへ変身し、筋力を引き継ぐ。第2形態も倒すまで戦闘は終わらない。',
 DfCorrupted:'プレイヤーが使ったスキルは廃棄される。全員のターン終了時、この敵はプレイヤー人数×5のHPを失う（ブロック不可）。',
 DfWraith:'倒れたナイフを各列1体ずつラウンド開始時に復活。無形の強打の行動中はHPを失わない。',
 DfBlasphemer:'最初に倒すとHP1の神聖モードへ移る。神聖中はHP損失と脱力を無効化し、4連撃の後に倒れる。',
 DfNeow:'生命の泉：全てのスレイヤーが倒れるまでHPを失わない。開始時に各列へ異なるスレイヤーを1体召喚。借用した呪いは戦闘終了時に供給へ戻す。',
 DfSlayerG:'無形の一撃の行動中はHPを失わない。'
});
var previousFoeToks=V.dfFoeToks;V.dfFoeToks=function(e,interactive){var h=previousFoeToks(e,interactive);if(e.x&&e.x.dfBuffer)h+='<span class="tok etc" title="1個につき次のダメージ1回を全て防ぐ">バッファ'+e.x.dfBuffer+'</span>';return h;};

/* ------------------------------------------------------------------ explanations */
if (X) {
  var _guardian = X.guardian;
  X.guardian = function (e, a) {
    if (e && (e.id === 'DfGuardian2' || e.id === 'DfGuardian3') && a && a.name === 'モードシフト') return '敵ターン開始時にガーディアンのブロックが残っていれば全員に攻撃します。ブロックが0なら攻撃せず、次のラウンドから防御モードになります。';
    return _guardian.apply(this, arguments);
  };
  var _cardType = X.cardType;
  X.cardType = function (c) {
    var d = STS.CARDS[c.id] || {};
    if (d.t !== 'L') return _cardType(c);
    return '<span class="card-type-guide">種類：<strong>スライム</strong>。使うと場（パワーと同じ所）に置かれ、この戦闘中ずっと残ります。Lv1から始まり、「命令」で今のレベルの能力を使います。</span>';
  };
  var _player = X.player;
  X.player = function (cb, pc, run) {
    var h = _player(cb, pc, run);
    if (!X.enabled() || !pc || !pc.slimes || !pc.slimes.length) return h;
    var ends = pc.slimes.filter(function (x) { return (STS.CARDS[x.id] || {}).endTurn; });
    if (!ends.length) return h;
    var name = pc.i === 0 && run.players.length === 1 ? 'あなた' : run.players[pc.i].name;
    return h + '<section class="effect-guide player-effect-guide"><h4>' + esc(name) + 'のスライム（ターン終了時）</h4><p>' + esc(ends.map(function (x) { return V.slimeText(x); }).join('／')) + '。全員のターン終了時、敵へのダメージ処理の中でそれぞれ命令します。</p></section>';
  };
}

/* ------------------------------------------------------------------ reference terms */
function term(id, name, group, text, example, aliases) {
  H.terms.push({ key: 'term:' + id, id: id, name: name, group: group, kind: 'term', text: text, example: example || '', aliases: aliases || [] });
}
term('slime', 'スライム（カード）', 'キャラクター', 'スライムボスなどの「スライム」の種類のカードです。使うとパワーと同じく場に置かれ、この戦闘中ずっと残ります（Lv1から）。レベルごとに能力が書かれていて、「命令」した時に今のレベルの能力を使います。', '「Lv1：2ダメージ／Lv2：3ダメージ」のスライムをLv2にしてから命令すると3ダメージ。', ['スライム']);
term('grow', '成長', 'キャラクター', 'スライムを1体選び、レベルを1上げます。最大レベルより上にはなりません（成長させても変わらない）。「異なるスライムN体まで成長」は、同じスライムを2回選べません。', '', ['成長させる']);
term('command', '命令', 'キャラクター', 'スライムを1体選び、今のレベルの能力を使わせます。複数のスライムに命令する時は、好きな順で処理できます。「異なるスライムN体まで命令」は同じスライムを2回選べません。スライムがいなければ何も起きません。', '', ['命令する']);
term('slimestr', 'スライムの筋力', 'キャラクター', 'スライムに置く筋力（1体につき最大8）。そのスライムの能力の各ヒットが+1されます。スライムのヒットは、スライムボス自身の筋力・脱力や、敵の弱体化の影響を受けません。スライムは脱力を受けません。', '', []);
term('tackle', 'タックル', 'カードの読み方', '名前に「タックル」が付くカードです（英語名に Tackle を含むカード）。「タックルを使うたび」などの条件で参照されます。', '', ['「タックル」']);
term('bruiser', 'ブルーザースライム', 'キャラクター', 'スライムボスの能力。各戦闘の開始時から場にあるスライム（Lv1：1ダメージ／Lv2：2ダメージ）。ターン終了時に命令します。デッキには入らず、アップグレードできません。', '', ['ブルーザー']);
term('dfmode', '攻撃モード・防御モード', 'キャラクター', 'ガーディアンのモードです。戦闘は攻撃モードで始まり、ターン開始時（カードを引いた後）にモードシフトしてもよい。モード自体には効果がなく、活力やモードを参照するカードの効果が変わります。', '', ['攻撃モード', '防御モード']);
term('modeshift', 'モードシフト（ガーディアン）', 'キャラクター', 'もう一方のモードに切り替えます（攻撃モード⇔防御モード）。', '', ['モードシフト']);
term('variabletype', '???（種類）', 'カードの読み方', '戦闘中、攻撃モードならアタック、防御モードならスキルとして扱うカードの種類です。戦闘外ではアタックでもスキルでもありません。', '', ['???']);
term('vigor', '活力', 'キャラクター', 'ガーディアンのトークン（使用済みを含めて最大4）。カードを使える時にいつでも使え、そのターンの間、使用済みの活力1つにつき、攻撃モードならアタックとスキルの各ヒット+1、防御モードならアタックとスキルの各ブロック+1。使用済みの活力はターン終了時になくなります。使っていない活力は戦闘中残ります。', '活力を2つ使った攻撃モードで「1ダメージを2回」なら3ダメージを2回。', ['活力']);
term('socket', 'ソケット・ジェム', 'キャラクター', 'ガーディアンの一部の報酬カードにある「ソケット」には、ジェムのカードを付けます。カード報酬などでソケット付きのカードが出たら、ジェムを2枚めくって1枚を選んで付けます。付けたジェムの効果がソケットの文の代わりになります。', '', ['ソケット', 'ジェム']);
term('heat', 'ヒート・前進・後退', 'キャラクター', 'ヘクサゴーストの値（1〜6）。戦闘開始時は1。前進でヒート+1、後退でヒート−1。6で前進、1で後退しても値は変わりませんが、前進・後退したことにはなります。「ヒート3以上：」などの効果は今のヒートで判定します。', '', ['ヒート', '前進', '後退']);
term('soulburn', 'ソウルバーン', 'キャラクター', 'ヘクサゴーストのトークン（最大6）。カードを使える時にいつでも使え、今のヒートと同じダメージを敵1体に与えます。アタック・スキル・カードではないので、筋力・脱力・弱体化の影響を受けません（ブロックでは防がれます）。上限の時に得たら、今すぐダメージを与えるか、得ないかを選びます。', 'ヒート4でソウルバーンを使うと4ダメージ。', ['ソウルバーン']);
term('chamber', 'チャンバー・装填', 'キャラクター', 'ハーミットのカード置き場（2枠）。装填＝手札のカードをチャンバーに移すこと（埋まった枠なら、元のカードは捨て札へ）。チャンバーのカードは手札ではなく、ターン終了時に捨てられず、エーテリアルや「手札にある間」の効果も働きません。手札と同じように、コストを払って使えます。', '', ['チャンバー', '装填']);
term('deadon', 'デッド-オン', 'キャラクター', 'チャンバーから使った時だけ加わる効果です。そのカードのコピーも、チャンバーから使ったものとして扱います。', '', ['デッド-オン']);
term('rapidfire', '連射', 'キャラクター', 'このカードを使ったら、連射1つにつきもう1回使います。それぞれ別の対象を選べます。連射で増えた分はさらに連射しませんが、アタックポーションなど別の効果でのコピーは連射します。', '「連射」1つのカードをアタックポーションで使うと、合計4回。', ['連射']);
term('hermitcurse', 'ハーミットの呪い', 'キャラクター', 'ハーミットの報酬デッキに入っている呪いのカード。使用不可ですが装填でき、「装填した時」の効果が働きます。ほかの呪いと違ってアップグレードでき、お守りがあっても報酬から得られます。商人では3ゴールド。', '', []);
term('corruptedshard', '堕落したシャード', 'レリック', 'ほかのキャラクターの装填・前進・後退・ソウルバーン・活力・ヒート・モードを使うカードを得た時に得る特別なレリック。各戦闘でチャンバー1枠とヒート1で始まり、最初にソウルバーンを使うかモードを参照するカードを使う時、好きなモードに入ります。', '', ['堕落したシャード']);
term('adventure', '冒険の種類', '冒険・解放', 'キャラクター選択の画面で選びます。「通常の冒険」は基本4キャラクターで遊べる基本版のマップ・敵・イベントで、第4幕の最終ボスは堕落の心臓。「Downfallの冒険」は基本・拡張の全8キャラクターが使え、ハートの恩恵で始まり、第1〜3幕のボスは今回選ばれなかったキャラクターから現れ、第4幕の最終ボスはネオーです。難易度（初心者・通常・アセンション）とは別の設定です。', '', ['通常の冒険', 'Downfallの冒険', 'Downfall']);
})(typeof window !== 'undefined' ? window : globalThis);

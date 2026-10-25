/* スレイザスパイア — every player card of the board game (base + unlocks), colorless, curses and status.
   Numbers follow the printed cards (via StSBoardGameMod). tx = [base text, upgraded text]. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var CARDS = STS.CARDS = {};
function card(id, o) { o.id = id; if (o.cu === undefined) o.cu = o.c; CARDS[id] = o; return o; }
function U(k, a, b) { return k.up ? b : a; }

/* ---- shared helpers used by many cards ---- */
async function strike(k, a, b) { await k.atk([U(k, a, b)]); }
async function anyBlock(k, n) { var to = await k.playerSel('ブロックを与えるプレイヤーを選択'); await k.blk(n, to); }
async function swapRows(k) {
  var cb = k.cb, pc = k.pc;
  var others = cb.pcs().filter(function (x) { return x !== pc && !x.dead; });
  if (!others.length) return;
  var opts = others.map(function (x) { return { id: String(x.i), label: cb.P(x).name + 'と列を入れ替える' }; });
  opts.push({ id: 'no', label: '入れ替えない' });
  var a = await k.option(opts, '列を入れ替えますか？');
  if (a === 'no' || a == null) return;
  var o = cb.pc(+a); var t = o.row; o.row = pc.row; pc.row = t;
  cb.emit({ t: 'swapRow', a: pc.i, b: o.i });
}
function topDiscardZero(k) {
  var pc = k.pc, c = pc.disc[pc.disc.length - 1];
  if (!c) return false;
  var cost = k.cb.baseCost(c);
  return cost === 0;
}
function strikeName(c) { var d = CARDS[c.id]; return /Strike/.test(d.en); }
async function playTempCopy(k, spec, opts) {
  // Play a copy of a card that is not in your deck (Foreign Influence, Doppelganger, Omniscience).
  var cb = k.cb, pc = k.pc;
  var c = { u: cb.g.uid(), id: spec.id, up: spec.up, tmp: true };
  var d = CARDS[c.id];
  var k2 = cb.ctx(pc, c, { x: spec.x || 0, copy: true, paid: (opts && opts.paid) || 0 });
  await cb.resolve(k2, null);
  await cb.afterResolution(pc, c, k2);
}

/* ================================================================== IRONCLAD */
card('StrikeR', { ch: 'R', t: 'A', r: 'S', c: 1, name: 'ストライク', en: 'Strike', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: function (k) { return strike(k, 1, 2); } });
card('DefendR', { ch: 'R', t: 'S', r: 'S', c: 1, name: '防御', en: 'Defend', tx: ['ブロック1。', '任意のプレイヤーにブロック2。'],
  play: async function (k) { if (!k.up) await k.blk(1 + k.cb.powSum(k.pc, 'Apotheosis', function () { return 1; })); else await anyBlock(k, 2 + k.cb.powSum(k.pc, 'Apotheosis', function () { return 1; })); } });
card('Bash', { ch: 'R', t: 'A', r: 'S', c: 2, name: '強打', en: 'Bash', tg: 'E', tx: ['2ダメージ。弱体化1。', '4ダメージ。弱体化1。'],
  play: async function (k) { await k.atk([U(k, 2, 4)]); await k.vuln(k.target, 1); } });
card('Anger', { ch: 'R', t: 'A', r: 'C', c: 0, name: '怒り', en: 'Anger', tg: 'E', tx: ['1ダメージ。このカードを山札の一番上に置く。', '2ダメージ。このカードを山札の一番上に置く。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); k.dest = 'drawTop'; } });
card('BodySlam', { ch: 'R', t: 'A', r: 'C', c: 1, cu: 0, name: 'ボディスラム', en: 'Body Slam', tg: 'E', tx: ['Xダメージ。Xは自分のブロック。', 'Xダメージ。Xは自分のブロック。'],
  play: async function (k) { await k.atk([k.pc.blk]); } });
card('Cleave', { ch: 'R', t: 'A', r: 'C', c: 1, name: 'なぎ払い', en: 'Cleave', tg: 'R', tx: ['範囲に2ダメージ。', '範囲に3ダメージ。'], play: function (k) { return k.aoe([U(k, 2, 3)]); } });
card('Clothesline', { ch: 'R', t: 'A', r: 'C', c: 2, name: 'ラリアット', en: 'Clothesline', tg: 'E', tx: ['3ダメージ。脱力1。', '4ダメージ。脱力1。'],
  play: async function (k) { await k.atk([U(k, 3, 4)]); await k.weak(k.target, 1); } });
card('Flex', { ch: 'R', t: 'S', r: 'C', c: 0, name: '筋収縮', en: 'Flex', ex: [true, false], tx: ['筋力1を得る。ターン終了時にその筋力を失う。廃棄。', '筋力1を得る。ターン終了時にその筋力を失う。'],
  play: async function (k) { k.cb.tempStr(k.pc, 1); } });
card('Havoc', { ch: 'R', t: 'S', r: 'C', c: 1, cu: 0, unlock: 2, name: '荒廃', en: 'Havoc', tx: ['カードを1枚引き、0エナジーで即座に使う。パワー以外は廃棄する。', 'カードを1枚引き、0エナジーで即座に使う。パワー以外は廃棄する。'],
  play: async function (k) { var got = await k.draw(1); if (got[0]) await k.cb.playFree(k.pc, got[0], { exhaust: CARDS[got[0].id].t !== 'P', havoc: true }); } });
card('HeavyBlade', { ch: 'R', t: 'A', r: 'C', c: 2, name: 'ヘビーブレード', en: 'Heavy Blade', tg: 'E', tx: ['3ダメージ。筋力1につき+3ダメージ（+1の代わり）。', '3ダメージ。筋力1につき+5ダメージ（+1の代わり）。'],
  play: function (k) { return k.atk([3], null, { heavy: U(k, 3, 5) }); } });
card('IronWave', { ch: 'R', t: 'A', r: 'C', c: 1, name: 'アイアンウェーブ', en: 'Iron Wave', tg: 'E', tx: ['1ダメージ。ブロック1。', '2ダメージとブロック1、または1ダメージとブロック2。'],
  play: async function (k) {
    if (!k.up) { await k.atk([1]); await k.blk(1); return; }
    var a = await k.option([{ id: 'spear', label: '2ダメージ・ブロック1' }, { id: 'shield', label: '1ダメージ・ブロック2' }], 'アイアンウェーブ+');
    if (a === 'shield') { await k.atk([1]); await k.blk(2); } else { await k.atk([2]); await k.blk(1); }
  } });
card('PommelStrike', { ch: 'R', t: 'A', r: 'C', c: 1, name: 'ポンメルストライク', en: 'Pommel Strike', tg: 'E', tx: ['2ダメージ。カードを1枚引く。', '2ダメージ。カードを2枚引く。'],
  play: async function (k) { await k.atk([2]); await k.draw(U(k, 1, 2)); } });
card('SeeingRed', { ch: 'R', t: 'S', r: 'C', c: 1, cu: 0, ex: true, name: '激昂', en: 'Seeing Red', tx: ['2エナジーを得る。廃棄。', '2エナジーを得る。廃棄。'], play: async function (k) { k.energy(2); } });
card('ShrugItOff', { ch: 'R', t: 'S', r: 'C', c: 1, name: '受け流し', en: 'Shrug It Off', tx: ['ブロック2。カードを1枚引く。', 'ブロック3。カードを1枚引く。'],
  play: async function (k) { await k.blk(U(k, 2, 3)); await k.draw(1); } });
card('TrueGrit', { ch: 'R', t: 'S', r: 'C', c: 1, name: '不屈の闘志', en: 'True Grit', tx: ['任意のプレイヤーにブロック1。手札を1枚廃棄する。', '任意のプレイヤーにブロック2。手札を1枚廃棄する。'],
  play: async function (k) { await anyBlock(k, U(k, 1, 2)); await k.exhaustHand(1, 1, '廃棄するカードを選択'); } });
card('TwinStrike', { ch: 'R', t: 'A', r: 'C', c: 1, name: 'ツインストライク', en: 'Twin Strike', tg: 'E', tx: ['1ダメージを2回。', '2ダメージを2回。'], play: function (k) { var n = U(k, 1, 2); return k.atk([n, n]); } });
card('Warcry', { ch: 'R', t: 'S', r: 'C', c: 0, ex: true, name: '雄叫び', en: 'Warcry', tx: ['カードを2枚引く。手札を1枚山札の一番上に置く。廃棄。', 'カードを3枚引く。手札を1枚山札の一番上に置く。廃棄。'],
  play: async function (k) { await k.draw(U(k, 2, 3)); var cs = await k.pick('hand', 1, 1, '山札の一番上に置くカードを選択'); cs.forEach(function (c) { k.cb.leaveHand(k.pc, c); k.pc.draw.push(c); }); } });
card('WildStrike', { ch: 'R', t: 'A', r: 'C', c: 1, name: 'ワイルドストライク', en: 'Wild Strike', tg: 'E', tx: ['3ダメージ。めまい1を得る。', '4ダメージ。めまい1を得る。'],
  play: async function (k) { await k.atk([U(k, 3, 4)]); await k.daze(1); } });
card('BattleTrance', { ch: 'R', t: 'S', r: 'U', c: 0, name: 'バトルトランス', en: 'Battle Trance', tx: ['カードを3枚引く。このターン、これ以上カードを引けない。', 'カードを4枚引く。このターン、これ以上カードを引けない。'],
  play: async function (k) { await k.draw(U(k, 3, 4)); k.pc.t.noDraw = true; } });
card('BloodForBlood', { ch: 'R', t: 'A', r: 'U', c: 3, name: '血には血を', en: 'Blood for Blood', tg: 'E', tx: ['この戦闘でHPを失っていればコスト1。4ダメージ。', 'この戦闘でHPを失っていればコスト0。4ダメージ。'],
  costFn: function (cb, pc, c, cost) { return pc.c.lostHp ? (c.up ? 0 : 1) : cost; }, play: function (k) { return k.atk([4]); } });
card('BurningPact', { ch: 'R', t: 'S', r: 'U', c: 1, name: '焦熱の契約', en: 'Burning Pact', tx: ['手札を1枚廃棄する。カードを2枚引く。', '手札を1枚廃棄する。カードを3枚引く。'],
  play: async function (k) { await k.exhaustHand(1, 1); await k.draw(U(k, 2, 3)); } });
card('Carnage', { ch: 'R', t: 'A', r: 'U', c: 2, eth: true, name: '大虐殺', en: 'Carnage', tg: 'E', tx: ['エーテリアル。4ダメージ。', 'エーテリアル。6ダメージ。'], play: function (k) { return strike(k, 4, 6); } });
card('Clash', { ch: 'R', t: 'A', r: 'U', c: 0, name: 'クラッシュ', en: 'Clash', tg: 'E', tx: ['手札がすべてアタックの時だけ使える。3ダメージ。', '手札がすべてアタックの時だけ使える。4ダメージ。'],
  can: function (cb, pc, c) { return pc.hand.every(function (h) { return CARDS[h.id].t === 'A'; }) ? null : '手札がすべてアタックの時だけ使えます。'; },
  play: function (k) { return strike(k, 3, 4); } });
card('Combust', { ch: 'R', t: 'P', r: 'U', c: 1, name: '燃焼', en: 'Combust', tx: ['1ターンに1回：任意の列に1ダメージ。', '1ターンに1回：任意の列に2ダメージ。'],
  pw: { activate: function (cb, pc, inst, cmd) { return cb.damageAnyRow(pc, inst.up ? 2 : 1, '燃焼：ダメージを与える列を選択'); } } });
card('DarkEmbrace', { ch: 'R', t: 'P', r: 'U', c: 2, cu: 1, unlock: 3, name: '闇の抱擁', en: 'Dark Embrace', tx: ['カードが廃棄されるたび、カードを1枚引く。', 'カードが廃棄されるたび、カードを1枚引く。'] });
card('Disarm', { ch: 'R', t: 'S', r: 'U', c: 1, ex: true, name: '武装解除', en: 'Disarm', tg: 'E', tx: ['脱力×2。廃棄。', '脱力×3。廃棄。'], play: function (k) { return k.weak(k.target, U(k, 2, 3)); } });
card('Entrench', { ch: 'R', t: 'S', r: 'U', c: 1, unlock: 3, ex: [true, false], name: '塹壕', en: 'Entrench', tx: ['ブロックを2倍にする（最大20）。廃棄。', 'ブロックを2倍にする（最大20）。'],
  play: async function (k) { await k.cb.gainBlock(k.pc, k.pc.blk); } });
card('Evolve', { ch: 'R', t: 'P', r: 'U', c: 1, cu: 0, unlock: 1, name: '進化', en: 'Evolve', tx: ['めまい・火傷・粘液を引くたび、カードを1枚引く。', 'めまい・火傷・粘液を引くたび、カードを1枚引く。'] });
card('FeelNoPain', { ch: 'R', t: 'P', r: 'U', c: 1, cu: 0, name: '無痛', en: 'Feel No Pain', tx: ['カードを廃棄するたび、ブロック1。', 'カードを廃棄するたび、ブロック1。'] });
card('FireBreathing', { ch: 'R', t: 'P', r: 'U', c: 1, unlock: 1, name: '炎の息', en: 'Fire Breathing', tx: ['めまい・火傷・粘液・呪いを引くたび、任意の列に2ダメージ。', 'めまい・火傷・粘液・呪いを引くたび、任意の列に3ダメージ。'] });
card('FlameBarrier', { ch: 'R', t: 'S', r: 'U', c: 2, name: '炎の障壁', en: 'Flame Barrier', tx: ['ブロック3。自分を攻撃しようとしている敵それぞれに、次の行動のヒット1つにつき1ダメージ。', 'ブロック4。自分を攻撃しようとしている敵それぞれに、次の行動のヒット1つにつき1ダメージ。'],
  play: async function (k) {
    await k.blk(U(k, 3, 4));
    var cb = k.cb, list = cb.alive();
    for (var i = 0; i < list.length; i++) { var n = cb.intendsToAttack(list[i], k.pc); if (n > 0) await cb.damageEnemy(list[i], n, { pc: k.pc }); }
  } });
card('GhostlyArmor', { ch: 'R', t: 'S', r: 'U', c: 1, eth: true, name: 'ゴーストアーマー', en: 'Ghostly Armor', tx: ['エーテリアル。任意のプレイヤーにブロック2。', 'エーテリアル。任意のプレイヤーにブロック3。'], play: function (k) { return anyBlock(k, U(k, 2, 3)); } });
card('Headbutt', { ch: 'R', t: 'A', r: 'U', c: 1, name: '頭突き', en: 'Headbutt', tg: 'E', tx: ['2ダメージ。捨て札1枚を山札の一番上に置く。', '3ダメージ。捨て札1枚を山札の一番上に置く。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); var cs = await k.pick('discard', 1, 1, '山札の一番上に置くカードを選択'); cs.forEach(function (c) { var i = k.pc.disc.indexOf(c); k.pc.disc.splice(i, 1); k.pc.draw.push(c); }); } });
card('Inflame', { ch: 'R', t: 'P', r: 'U', c: 2, cu: 1, name: '発火', en: 'Inflame', tx: ['使用時、筋力1を得る。', '使用時、筋力1を得る。'], play: async function (k) { k.str(1); } });
card('Metallicize', { ch: 'R', t: 'P', r: 'U', c: 1, cu: 0, name: '金属化', en: 'Metallicize', tx: ['ターン終了時：ブロック1。', 'ターン終了時：ブロック1。'],
  pw: { endTurn: function (cb, pc) { return cb.gainBlock(pc, 1); } } });
card('PerfectedStrike', { ch: 'R', t: 'A', r: 'U', c: 2, name: 'フルストライク', en: 'Perfected Strike', tg: 'E', tx: ['3ダメージ。手札にある名前に「ストライク」を含む他のカード1枚につき+1。', '3ダメージ。手札にある名前に「ストライク」を含む他のカード1枚につき+2。'],
  play: function (k) { var n = k.pc.hand.filter(strikeName).length; return k.atk([3 + n * U(k, 1, 2)]); } });
card('PowerThrough', { ch: 'R', t: 'S', r: 'U', c: 1, unlock: 1, name: 'やせ我慢', en: 'Power Through', tx: ['任意のプレイヤーにブロック3。めまい1を得る。', '任意のプレイヤーにブロック4。めまい1を得る。'],
  play: async function (k) { await anyBlock(k, U(k, 3, 4)); await k.daze(1); } });
card('Rage', { ch: 'R', t: 'S', r: 'U', c: 1, cu: 0, name: '憤怒', en: 'Rage', tx: ['手札のアタック1枚につきブロック1。', '手札のアタック1枚につきブロック1。'],
  play: function (k) { var n = k.pc.hand.filter(function (c) { return CARDS[c.id].t === 'A'; }).length; return n ? k.cb.gainBlock(k.pc, n * (1 + k.cb.footwork(k.pc, k.card))) : null; } });
card('Rampage', { ch: 'R', t: 'A', r: 'U', c: 1, unlock: 2, name: '大暴れ', en: 'Rampage', tg: 'E', tx: ['Xダメージ。Xは自分の廃棄札の枚数。', '手札を1枚廃棄する。Xダメージ。Xは自分の廃棄札の枚数。'],
  play: async function (k) { if (k.up) await k.exhaustHand(1, 1); await k.atk([k.pc.exh.length]); } });
card('Rupture', { ch: 'R', t: 'S', r: 'U', c: 1, cu: 0, name: '決裂', en: 'Rupture', tx: ['筋力1を得る。HPを1失う。', '筋力1を得る。HPを1失う。'],
  play: async function (k) { k.str(1); await k.loseHp(1); } });
card('SecondWind', { ch: 'R', t: 'S', r: 'U', c: 1, unlock: 3, name: 'セカンドウィンド', en: 'Second Wind', tx: ['手札のアタック以外のカードをすべて廃棄する。1枚につきブロック1。', '手札のアタック以外のカードをすべて廃棄する。1枚につきブロック2。'],
  play: async function (k) {
    var cs = k.pc.hand.filter(function (c) { return CARDS[c.id].t !== 'A'; });
    for (var i = 0; i < cs.length; i++) await k.cb.exhaustCard(k.pc, cs[i]);
    if (cs.length) await k.cb.gainBlock(k.pc, cs.length * (U(k, 1, 2) + k.cb.footwork(k.pc, k.card)));
  } });
card('Sentinel', { ch: 'R', t: 'S', r: 'U', c: 1, name: '見張り', en: 'Sentinel', tx: ['任意のプレイヤーにブロック2。このカードが廃棄されると2エナジーを得る。', '任意のプレイヤーにブロック3。このカードが廃棄されると3エナジーを得る。'],
  play: function (k) { return anyBlock(k, U(k, 2, 3)); }, onExhaust: function (cb, pc, c) { cb.gainEnergy(pc, c.up ? 3 : 2); } });
card('SeverSoul', { ch: 'R', t: 'A', r: 'U', c: 2, name: '霊魂切断', en: 'Sever Soul', tg: 'E', tx: ['3ダメージ。手札を1枚廃棄する。', '4ダメージ。手札を1〜2枚廃棄する。'],
  play: async function (k) { await k.atk([U(k, 3, 4)]); await k.exhaustHand(1, U(k, 1, 2)); } });
card('Shockwave', { ch: 'R', t: 'S', r: 'U', c: 2, ex: true, name: '衝撃波', en: 'Shockwave', tg: 'R', tx: ['範囲に弱体化1と脱力1。廃棄。', '範囲に弱体化1と脱力×2。廃棄。'],
  play: async function (k) { var ts = k.cb.aoeTargets(k.row); for (var i = 0; i < ts.length; i++) { await k.vuln(ts[i], 1); await k.weak(ts[i], U(k, 1, 2)); } } });
card('SpotWeakness', { ch: 'R', t: 'S', r: 'U', c: 1, name: '弱点検出', en: 'Spot Weakness', tx: ['ダイスが1〜3なら、任意のプレイヤーが筋力1を得る。', 'ダイスが1〜4なら、任意のプレイヤーが筋力1を得る。'],
  play: async function (k) { if (k.cb.s.die <= U(k, 3, 4)) { var to = await k.playerSel('筋力を得るプレイヤーを選択'); k.cb.gainStr(to, 1); } } });
card('Whirlwind', { ch: 'R', t: 'A', r: 'U', c: 'X', name: '旋風刃', en: 'Whirlwind', tg: 'R', tx: ['範囲に1ダメージをX回。', '範囲に1ダメージをX+1回。'],
  play: async function (k) { var n = k.x + U(k, 0, 1); for (var i = 0; i < n; i++) await k.aoe([1]); } });
card('Barricade', { ch: 'R', t: 'P', r: 'R', c: 2, cu: 1, unlock: 3, name: 'バリケード', en: 'Barricade', tx: ['ターン開始時：前のターンに残ったブロックを保持する（最大20）。', 'ターン開始時：前のターンに残ったブロックを保持する（最大20）。'] });
card('Berserk', { ch: 'R', t: 'P', r: 'R', c: 1, name: '狂戦士', en: 'Berserk', tx: ['カードを廃棄するたび、任意の列に1ダメージ。', 'カードを廃棄するたび、任意の列に2ダメージ。'] });
card('Bludgeon', { ch: 'R', t: 'A', r: 'R', c: 3, name: '脳天割り', en: 'Bludgeon', tg: 'E', tx: ['7ダメージ。', '10ダメージ。'], play: function (k) { return strike(k, 7, 10); } });
card('Corruption', { ch: 'R', t: 'P', r: 'R', c: 3, cu: 2, unlock: 2, name: '堕落', en: 'Corruption', tx: ['スキルのコストは0になる。スキルを使うと廃棄される。', 'スキルのコストは0になる。スキルを使うと廃棄される。'] });
card('DemonForm', { ch: 'R', t: 'P', r: 'R', c: 3, cu: 2, name: '悪魔化', en: 'Demon Form', tx: ['ターン開始時：筋力1を得る。', 'ターン開始時：筋力1を得る。'],
  pw: { startTurn: function (cb, pc) { cb.gainStr(pc, 1); } } });
card('DoubleTap', { ch: 'R', t: 'S', r: 'R', c: 1, cu: 0, noCopy: true, name: 'ダブルタップ', en: 'Double Tap', tx: ['このターン、次に使うアタックを2回使う。（このカードは2回使えない）', 'このターン、次に使うアタックを2回使う。（このカードは2回使えない）'],
  play: async function (k) { k.pc.t.doubleTap = (k.pc.t.doubleTap || 0) + 1; } });
card('Exhume', { ch: 'R', t: 'S', r: 'R', c: 1, cu: 0, ex: true, name: '発掘', en: 'Exhume', tx: ['廃棄札のカード1枚を手札に加える。廃棄。', '廃棄札のカード1枚を手札に加える。廃棄。'],
  play: async function (k) { var cs = await k.pick('exhaust', 1, 1, '手札に加えるカードを選択'); cs.forEach(function (c) { var i = k.pc.exh.indexOf(c); k.pc.exh.splice(i, 1); k.pc.hand.push(c); }); } });
card('Feed', { ch: 'R', t: 'A', r: 'R', c: 1, ex: true, name: 'かぶりつき', en: 'Feed', tg: 'E', tx: ['3ダメージ。この攻撃で敵を倒したら筋力1を得る。廃棄。', '3ダメージ。この攻撃で敵を倒したら筋力2を得る。廃棄。'],
  play: async function (k) { var r = await k.atk([3]); if (r.killed) k.str(U(k, 1, 2)); } });
card('FiendFire', { ch: 'R', t: 'A', r: 'R', c: 2, ex: true, name: '鬼火', en: 'Fiend Fire', tg: 'E', tx: ['手札をすべて廃棄する。廃棄した枚数ぶん1ダメージ。廃棄。', '手札をすべて廃棄する。廃棄した枚数ぶん2ダメージ。廃棄。'],
  play: async function (k) {
    var cs = k.pc.hand.slice();
    for (var i = 0; i < cs.length; i++) await k.cb.exhaustCard(k.pc, cs[i]);
    var hits = []; for (var j = 0; j < cs.length; j++) hits.push(U(k, 1, 2));
    if (hits.length) await k.atk(hits);
  } });
card('Immolate', { ch: 'R', t: 'A', r: 'R', c: 2, unlock: 1, name: '生け贄', en: 'Immolate', tg: 'R', tx: ['範囲に5ダメージ。めまい2を得る。', '範囲に7ダメージ。めまい2を得る。'],
  play: async function (k) { await k.aoe([U(k, 5, 7)]); await k.daze(2); } });
card('Impervious', { ch: 'R', t: 'S', r: 'R', c: 2, ex: true, name: '不浸透', en: 'Impervious', tx: ['ブロック6。廃棄。', 'ブロック8。廃棄。'], play: function (k) { return k.blk(U(k, 6, 8)); } });
card('Juggernaut', { ch: 'R', t: 'P', r: 'R', c: 2, name: 'ジャガーノート', en: 'Juggernaut', tx: ['ブロックを得るたび、1ダメージを与える。', 'ブロックを得るたび、2ダメージを与える。'] });
card('LimitBreak', { ch: 'R', t: 'S', r: 'R', c: 1, ex: [true, false], name: 'リミットブレイク', en: 'Limit Break', tx: ['筋力を2倍にする（最大8）。廃棄。', '筋力を2倍にする（最大8）。'], play: async function (k) { k.str(k.pc.str); } });
card('Offering', { ch: 'R', t: 'S', r: 'R', c: 0, ex: true, name: '供物', en: 'Offering', tx: ['HPを1失う。2エナジーを得る。カードを3枚引く。廃棄。', 'HPを1失う。2エナジーを得る。カードを5枚引く。廃棄。'],
  play: async function (k) { await k.loseHp(1); k.energy(2); await k.draw(U(k, 3, 5)); } });
card('Uppercut', { ch: 'R', t: 'A', r: 'R', c: 2, name: 'アッパーカット', en: 'Uppercut', tg: 'E', tx: ['3ダメージ。弱体化1。脱力1。', '3ダメージ。弱体化×2。脱力1。'],
  play: async function (k) { await k.atk([3]); await k.vuln(k.target, U(k, 1, 2)); await k.weak(k.target, 1); } });

/* ================================================================== SILENT */
card('StrikeG', { ch: 'G', t: 'A', r: 'S', c: 1, name: 'ストライク', en: 'Strike', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: function (k) { return strike(k, 1, 2); } });
card('DefendG', { ch: 'G', t: 'S', r: 'S', c: 1, name: '防御', en: 'Defend', tx: ['ブロック1。', '任意のプレイヤーにブロック2。'], play: CARDS.DefendR.play });
card('Neutralize', { ch: 'G', t: 'A', r: 'S', c: 0, name: '無力化', en: 'Neutralize', tg: 'E', tx: ['1ダメージ。脱力1。', '2ダメージ。脱力1。'], play: async function (k) { await k.atk([U(k, 1, 2)]); await k.weak(k.target, 1); } });
card('Survivor', { ch: 'G', t: 'S', r: 'S', c: 1, name: 'サバイバー', en: 'Survivor', tx: ['ブロック2。手札を1枚捨てる。', 'ブロック3。手札を1枚捨てる。'], play: async function (k) { await k.blk(U(k, 2, 3)); await k.discardHand(1, 1); } });
card('Acrobatics', { ch: 'G', t: 'S', r: 'C', c: 1, name: 'アクロバット', en: 'Acrobatics', tx: ['カードを3枚引く。手札を1枚捨てる。', 'カードを4枚引く。手札を1枚捨てる。'], play: async function (k) { await k.draw(U(k, 3, 4)); await k.discardHand(1, 1); } });
card('Backflip', { ch: 'G', t: 'S', r: 'C', c: 1, name: 'バックフリップ', en: 'Backflip', tx: ['ブロック1。カードを2枚引く。', 'ブロック2。カードを2枚引く。'], play: async function (k) { await k.blk(U(k, 1, 2)); await k.draw(2); } });
card('BladeDance', { ch: 'G', t: 'S', r: 'C', c: 1, name: '剣の舞', en: 'Blade Dance', tx: ['ナイフ×2を得る。', 'ナイフ×3を得る。'], play: function (k) { return k.shiv(U(k, 2, 3)); } });
card('CloakAndDagger', { ch: 'G', t: 'S', r: 'C', c: 1, name: '外套とダガー', en: 'Cloak and Dagger', tx: ['ナイフ×1を得る。ブロック1。', 'ナイフ×2を得る。ブロック1。'], play: async function (k) { await k.shiv(U(k, 1, 2)); await k.blk(1); } });
card('DaggerSpray', { ch: 'G', t: 'A', r: 'C', c: 1, name: '五月雨ダガー', en: 'Dagger Spray', tg: 'R', tx: ['範囲に1ダメージを2回。', '範囲に1ダメージを3回。'], play: function (k) { return k.aoe(k.up ? [1, 1, 1] : [1, 1]); } });
card('DaggerThrow', { ch: 'G', t: 'A', r: 'C', c: 1, name: 'ダガースロー', en: 'Dagger Throw', tg: 'E', tx: ['2ダメージ。カードを1枚引く。手札を1枚捨てる。', '3ダメージ。カードを1枚引く。手札を1枚捨てる。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); await k.draw(1); await k.discardHand(1, 1); } });
card('DeadlyPoison', { ch: 'G', t: 'S', r: 'C', c: 1, cu: 0, name: '致死毒', en: 'Deadly Poison', tg: 'E', tx: ['毒1。', '毒1。'], play: function (k) { return k.psn(k.target, 1); } });
card('Deflect', { ch: 'G', t: 'S', r: 'C', c: 0, name: 'ディフレクト', en: 'Deflect', tx: ['ブロック1。ナイフを持っていれば+1。', 'ブロック2。ナイフを持っていれば+1。'],
  play: function (k) { return k.blk(U(k, 1, 2) + (k.pc.shiv > 0 ? 1 : 0)); } });
card('DodgeAndRoll', { ch: 'G', t: 'S', r: 'C', c: 1, name: 'ドッジロール', en: 'Dodge and Roll', tx: ['ブロック1を2回。それぞれ任意のプレイヤーに与えられる。', 'ブロック1を3回。それぞれ任意のプレイヤーに与えられる。'],
  play: async function (k) { for (var i = 0; i < U(k, 2, 3); i++) await anyBlock(k, 1); } });
card('PoisonedStab', { ch: 'G', t: 'A', r: 'C', c: 1, ex: true, name: '毒の一刺し', en: 'Poisoned Stab', tg: 'E', tx: ['1ダメージ。毒1。廃棄。', '1ダメージ。毒×2。廃棄。'], play: async function (k) { await k.atk([1]); await k.psn(k.target, U(k, 1, 2)); } });
card('Prepared', { ch: 'G', t: 'S', r: 'C', c: 0, unlock: 1, name: '準備', en: 'Prepared', tx: ['カードを1枚引く。手札を1枚捨てる。', 'カードを2枚引く。手札を2枚捨てる。'], play: async function (k) { await k.draw(U(k, 1, 2)); await k.discardHand(U(k, 1, 2), U(k, 1, 2)); } });
card('Slice', { ch: 'G', t: 'A', r: 'C', c: 0, name: 'スライス', en: 'Slice', tg: 'E', tx: ['1ダメージ。ナイフを持っていれば+1。', '2ダメージ。ナイフを持っていれば+1。'], play: function (k) { return k.atk([U(k, 1, 2) + (k.pc.shiv > 0 ? 1 : 0)]); } });
card('SneakyStrike', { ch: 'G', t: 'A', r: 'C', c: 2, name: 'スニークストライク', en: 'Sneaky Strike', tg: 'E', tx: ['3ダメージ。このターンにカードを捨てていれば2エナジーを得る。', '4ダメージ。このターンにカードを捨てていれば2エナジーを得る。'],
  play: async function (k) { await k.atk([U(k, 3, 4)]); if (k.pc.t.discarded > 0) k.energy(2); } });
card('Accuracy', { ch: 'G', t: 'P', r: 'U', c: 1, cu: 0, name: '精度上昇', en: 'Accuracy', tx: ['ナイフのダメージ+1。', 'ナイフのダメージ+1。'] });
card('AllOutAttack', { ch: 'G', t: 'A', r: 'U', c: 1, name: 'フルアタック', en: 'All-Out Attack', tg: 'R', tx: ['範囲に2ダメージ。手札を1枚捨てる。', '範囲に3ダメージ。手札を1枚捨てる。'], play: async function (k) { await k.aoe([U(k, 2, 3)]); await k.discardHand(1, 1); } });
card('Backstab', { ch: 'G', t: 'A', r: 'U', c: 0, ex: true, name: '騙し討ち', en: 'Backstab', tg: 'E', tx: ['2ダメージ。敵のHPが最大なら+2。廃棄。', '4ダメージ。敵のHPが最大なら+2。廃棄。'],
  play: function (k) { var full = k.target && k.target.hp >= k.target.max; return k.atk([U(k, 2, 4) + (full ? 2 : 0)]); } });
card('Bane', { ch: 'G', t: 'A', r: 'U', c: 1, name: '破滅', en: 'Bane', tg: 'E', tx: ['2ダメージ。対象が毒を持っていれば+2。', '3ダメージ。対象が毒を持っていれば+2。'], play: function (k) { return k.atk([U(k, 2, 3) + (k.target && k.target.psn > 0 ? 2 : 0)]); } });
card('Blur', { ch: 'G', t: 'S', r: 'U', c: 1, name: 'かすみ', en: 'Blur', tx: ['ブロック2。このターンにカードを捨てていれば+1。', 'ブロック3。このターンにカードを捨てていれば+1。'], play: function (k) { return k.blk(U(k, 2, 3) + (k.pc.t.discarded > 0 ? 1 : 0)); } });
card('BouncingFlask', { ch: 'G', t: 'S', r: 'U', c: 2, name: '跳ねるフラスコ', en: 'Bouncing Flask', tx: ['毒×2。それぞれ別の対象に与えてもよい。', '毒×3。それぞれ別の対象に与えてもよい。'],
  play: async function (k) { for (var i = 0; i < U(k, 2, 3); i++) { var e = await k.enemy('跳ねるフラスコ：毒' + (i + 1) + 'の対象'); if (e) await k.psn(e, 1); } } });
card('CalculatedGamble', { ch: 'G', t: 'S', r: 'U', c: 0, ex: [true, false], name: '計算された賭け', en: 'Calculated Gamble', tx: ['手札をすべて捨て、その枚数カードを引く。廃棄。', '手札をすべて捨て、その枚数カードを引く。'],
  play: async function (k) { var cs = k.pc.hand.slice(); await k.cb.discardCards(k.pc, cs, true); await k.draw(cs.length); } });
card('Catalyst', { ch: 'G', t: 'S', r: 'U', c: 1, ex: true, name: '触媒', en: 'Catalyst', tg: 'E', tx: ['敵の毒を2倍にする。廃棄。', '敵の毒を3倍にする。廃棄。'],
  play: function (k) { var e = k.target; if (e && e.psn > 0) return k.psn(e, e.psn * U(k, 1, 2)); } });
card('Choke', { ch: 'G', t: 'A', r: 'U', c: 2, unlock: 2, name: '窒息', en: 'Choke', tg: 'E', tx: ['3ダメージ。対象の脱力と毒1つにつき+1。', '4ダメージ。対象の脱力と毒1つにつき+1。'],
  play: function (k) { var e = k.target; return k.atk([U(k, 3, 4) + (e ? e.weak + e.psn : 0)]); } });
card('Concentrate', { ch: 'G', t: 'S', r: 'U', c: 0, unlock: 3, ex: true, name: '集中', en: 'Concentrate', tx: ['手札を好きな枚数捨てる。1枚につき1エナジーを得る。廃棄。', '手札を好きな枚数捨てる。1枚につき1エナジーを得て、さらに1エナジー。廃棄。'],
  play: async function (k) { var cs = await k.discardHand(0, 99, '捨てるカードを選択（1枚につきエナジー1）'); k.energy(cs.length + U(k, 0, 1)); } });
card('CripplingCloud', { ch: 'G', t: 'S', r: 'U', c: 2, ex: true, name: '死を呼ぶ雲', en: 'Crippling Cloud', tg: 'R', tx: ['範囲に毒1と脱力1。廃棄。', '範囲に毒×2と脱力1。廃棄。'],
  play: async function (k) { var ts = k.cb.aoeTargets(k.row); for (var i = 0; i < ts.length; i++) { await k.psn(ts[i], U(k, 1, 2)); await k.weak(ts[i], 1); } } });
card('Dash', { ch: 'G', t: 'A', r: 'U', c: 2, name: 'ダッシュ', en: 'Dash', tg: 'E', tx: ['2ダメージ。ブロック2。他のプレイヤーと列を入れ替えてもよい。', '3ダメージ。ブロック3。他のプレイヤーと列を入れ替えてもよい。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); await k.blk(U(k, 2, 3)); await swapRows(k); } });
card('Distraction', { ch: 'G', t: 'P', r: 'U', c: 2, cu: 1, unlock: 2, name: 'ごまかし', en: 'Distraction', tx: ['1ターンに1回：敵にトークンを置いた時、ブロック2。', '1ターンに1回：敵にトークンを置いた時、ブロック2。'] });
card('EscapePlan', { ch: 'G', t: 'S', r: 'U', c: 0, name: '脱出計画', en: 'Escape Plan', tx: ['カードを1枚引く。それがスキルならブロック1。', 'ブロック1。カードを1枚引く。'],
  play: async function (k) { if (k.up) { await k.blk(1); await k.draw(1); return; } var got = await k.draw(1); if (got[0] && CARDS[got[0].id].t === 'S') await k.blk(1); } });
card('Expertise', { ch: 'G', t: 'S', r: 'U', c: 1, unlock: 3, name: '熟練', en: 'Expertise', tx: ['手札が6枚になるまでカードを引く。', '手札が7枚になるまでカードを引く。'],
  play: function (k) { var n = U(k, 6, 7) - k.pc.hand.length; if (n > 0) return k.draw(n); } });
card('Finisher', { ch: 'G', t: 'A', r: 'U', c: 1, name: 'とどめの一撃', en: 'Finisher', tg: 'E', tx: ['このターンに使った他のアタック（ナイフ含む）1回につき1ダメージ。', 'このターンに使った他のアタック（ナイフ含む）1回につき2ダメージ。'],
  play: function (k) { var n = (k.pc.t.attacksInclShiv || 0) - (k.copy ? 0 : 1); var hits = []; for (var i = 0; i < n; i++) hits.push(U(k, 1, 2)); return hits.length ? k.atk(hits) : null; } });
card('Flechettes', { ch: 'G', t: 'A', r: 'U', c: 1, name: 'フレシェット', en: 'Flechettes', tg: 'E', tx: ['手札のスキル1枚につき1ダメージ。', '手札のスキル1枚につき1ダメージ、さらに1回。'],
  play: function (k) { var n = k.pc.hand.filter(function (c) { return CARDS[c.id].t === 'S'; }).length + U(k, 0, 1); var hits = []; for (var i = 0; i < n; i++) hits.push(1); return hits.length ? k.atk(hits) : null; } });
card('Footwork', { ch: 'G', t: 'P', r: 'U', c: 2, ret: [false, true], name: 'フットワーク', en: 'Footwork', tx: ['アタックとスキルのブロック1つにつき+1。', '保留。アタックとスキルのブロック1つにつき+1。'] });
card('InfiniteBlades', { ch: 'G', t: 'P', r: 'U', c: 1, name: '無限の刃', en: 'Infinite Blades', tx: ['ターン開始時：ナイフ×1を得る。', 'ターン開始時：ナイフ×2を得る。'],
  pw: { startTurn: function (cb, pc, inst) { return cb.gainShiv(pc, inst.up ? 2 : 1); } } });
card('LegSweep', { ch: 'G', t: 'S', r: 'U', c: 2, name: '足払い', en: 'Leg Sweep', tg: 'E', tx: ['脱力1。ブロック3。', '脱力1。ブロック4。'], play: async function (k) { await k.weak(k.target, 1); await k.blk(U(k, 3, 4)); } });
card('MasterfulStab', { ch: 'G', t: 'A', r: 'U', c: 0, name: '一撃必殺', en: 'Masterful Stab', tg: 'E', tx: ['この戦闘でHPを失っていればコスト2。2ダメージ。', 'この戦闘でHPを失っていればコスト1。3ダメージ。'],
  costFn: function (cb, pc, c, cost) { return pc.c.lostHp ? (c.up ? 1 : 2) : cost; }, play: function (k) { return strike(k, 2, 3); } });
card('NoxiousFumes', { ch: 'G', t: 'P', r: 'U', c: 1, name: '有毒ガス', en: 'Noxious Fumes', tx: ['ターン開始時：毒1。', 'ターン開始時：範囲に毒1。'],
  pw: { startTurn: async function (cb, pc, inst) {
    if (!cb.alive().length) return;
    if (inst.up) { var r = await cb.chooseRow(pc, '有毒ガス+：毒を与える列を選択'); var ts = cb.aoeTargets(r); for (var i = 0; i < ts.length; i++) await cb.applyPoison(ts[i], 1, pc); }
    else { var e = await cb.chooseEnemy(pc, '有毒ガス：毒を与える敵を選択'); if (e) await cb.applyPoison(e, 1, pc); }
  } } });
card('Outmaneuver', { ch: 'G', t: 'S', r: 'U', c: 0, unlock: 3, ret: true, name: '先読み', en: 'Outmaneuver', tx: ['保留。前のターンに保留していれば2エナジーを得る。', '保留。前のターンに保留していれば3エナジーを得る。'],
  play: async function (k) { if (k.card.wasRetained) k.energy(U(k, 2, 3)); } });
card('PiercingWail', { ch: 'G', t: 'S', r: 'U', c: 1, ex: true, name: '金切り声', en: 'Piercing Wail', tg: 'R', tx: ['ブロック1。範囲に脱力1。廃棄。', 'ブロック3。範囲に脱力1。廃棄。'],
  play: async function (k) { await k.blk(U(k, 1, 3)); var ts = k.cb.aoeTargets(k.row); for (var i = 0; i < ts.length; i++) await k.weak(ts[i], 1); } });
card('Predator', { ch: 'G', t: 'A', r: 'U', c: 2, name: '捕食者', en: 'Predator', tg: 'E', tx: ['3ダメージ。任意のプレイヤーがカードを2枚引く。', '4ダメージ。任意のプレイヤーがカードを2枚引く。'],
  play: async function (k) { await k.atk([U(k, 3, 4)]); var to = await k.playerSel('カードを2枚引くプレイヤーを選択'); await k.cb.draw(to, 2); } });
card('Reflex', { ch: 'G', t: 'S', r: 'U', c: null, unplayable: true, unlock: 1, name: '反射', en: 'Reflex', tx: ['使用不可。カードの効果で捨てられた時、カードを2枚引く。', '使用不可。カードの効果で捨てられた時、カードを3枚引く。'],
  onDiscard: function (cb, pc, c) { return cb.draw(pc, c.up ? 3 : 2); } });
card('RiddleWithHoles', { ch: 'G', t: 'S', r: 'U', c: 2, name: 'ハチの巣', en: 'Riddle with Holes', tx: ['ナイフ×4を得る。', 'ナイフ×5を得る。'], play: function (k) { return k.shiv(U(k, 4, 5)); } });
card('Setup', { ch: 'G', t: 'S', r: 'U', c: 0, ex: true, name: '段取り', en: 'Setup', tx: ['任意のプレイヤーが1エナジーを得る。廃棄。', '任意のプレイヤーが2エナジーを得る。廃棄。'],
  play: async function (k) { var to = await k.playerSel('エナジーを得るプレイヤーを選択'); k.cb.gainEnergy(to, U(k, 1, 2)); } });
card('Skewer', { ch: 'G', t: 'A', r: 'U', c: 'X', name: '串刺し', en: 'Skewer', tg: 'E', tx: ['1ダメージをX+1回。', '2ダメージをX回。'],
  play: function (k) { var n = k.up ? k.x : k.x + 1, d = U(k, 1, 2), hits = []; for (var i = 0; i < n; i++) hits.push(d); return hits.length ? k.atk(hits) : null; } });
card('Tactician', { ch: 'G', t: 'S', r: 'U', c: null, unplayable: true, unlock: 1, name: '策士', en: 'Tactician', tx: ['使用不可。カードの効果で捨てられた時、2エナジーを得てこのカードを廃棄する。', '使用不可。カードの効果で捨てられた時、3エナジーを得てこのカードを廃棄する。'],
  onDiscard: async function (cb, pc, c) { cb.gainEnergy(pc, c.up ? 3 : 2); await cb.exhaustCard(pc, c); } });
card('Terror', { ch: 'G', t: 'S', r: 'U', c: 1, ex: [true, false], name: '恐怖', en: 'Terror', tg: 'E', tx: ['弱体化1。廃棄。', '弱体化1。'], play: function (k) { return k.vuln(k.target, 1); } });
card('WellLaidPlans', { ch: 'G', t: 'P', r: 'U', c: 1, name: '用意周到', en: 'Well-Laid Plans', tx: ['ターン終了時：カードを1枚保留してもよい。', 'ターン終了時：カードを2枚まで保留してもよい。'] });
card('AThousandCuts', { ch: 'G', t: 'P', r: 'R', c: 2, name: 'メッタ切り', en: 'A Thousand Cuts', tx: ['山札をシャッフルするたび、任意の列に5ダメージ。', '山札をシャッフルするたび、任意の列に7ダメージ。'] });
card('Adrenaline', { ch: 'G', t: 'S', r: 'R', c: 0, ex: true, name: 'アドレナリン', en: 'Adrenaline', tx: ['1エナジーを得る。カードを2枚引く。廃棄。', '2エナジーを得る。カードを2枚引く。廃棄。'], play: async function (k) { k.energy(U(k, 1, 2)); await k.draw(2); } });
card('AfterImage', { ch: 'G', t: 'P', r: 'R', c: 1, cu: 0, name: '残像', en: 'After Image', tx: ['自分のターン中にカードを1枚以上捨てるたび、ブロック1。', '自分のターン中にカードを1枚以上捨てるたび、ブロック1。'] });
card('BulletTime', { ch: 'G', t: 'S', r: 'R', c: 3, cu: 2, name: 'バレットタイム', en: 'Bullet Time', tx: ['このターン、これ以上カードを引けない。このターン、手札のカードのコストは0。', 'このターン、これ以上カードを引けない。このターン、手札のカードのコストは0。'],
  play: async function (k) { k.pc.t.noDraw = true; k.pc.hand.forEach(function (c) { c.cm = 0; }); } });
card('Burst', { ch: 'G', t: 'S', r: 'R', c: 1, cu: 0, noCopy: true, name: 'バースト', en: 'Burst', tx: ['このターン、次に使うスキルを2回使う。（このカードはコピーできない）', 'このターン、次に使うスキルを2回使う。（このカードはコピーできない）'],
  play: async function (k) { k.pc.t.burst = (k.pc.t.burst || 0) + 1; } });
card('CorpseExplosion', { ch: 'G', t: 'S', r: 'R', c: 2, unlock: 2, name: '死体爆発', en: 'Corpse Explosion', tg: 'E', tx: ['毒×2。対象に付ける。対象が死んだ時、その列に6ダメージを与え、このカードを捨てる。', '毒×3。対象に付ける。対象が死んだ時、その列に10ダメージを与え、このカードを捨てる。'],
  play: async function (k) {
    var e = k.target; if (!e) return;
    await k.psn(e, U(k, 2, 3));
    if (k.copy || e.dead) return;
    if (k.cb.alive().some(function (x) { return x.corpse; })) return;
    e.corpse = U(k, 6, 10); e.corpseCard = { pi: k.pc.i, card: k.card };
    k.dest = 'attached';
    k.cb.pc(k.pc.i).limbo.splice(k.cb.pc(k.pc.i).limbo.indexOf(k.card), 1);
    (k.pc.attached || (k.pc.attached = [])).push(k.card);
  } });
card('DieDieDie', { ch: 'G', t: 'A', r: 'R', c: 1, ex: true, name: 'ダイ！ダイ！ダイ！', en: 'Die Die Die', tg: 'R', tx: ['範囲に3ダメージ。廃棄。', '範囲に4ダメージ。廃棄。'], play: function (k) { return k.aoe([U(k, 3, 4)]); } });
card('Doppelganger', { ch: 'G', t: 'S', r: 'R', c: 'X', unlock: 3, ex: [true, false], name: 'ドッペルゲンガー', en: 'Doppelganger', noCopy: true, tx: ['このターンに誰かが使った最後のアタックかスキルのうち、コストがXのもののコピーを使う。廃棄。', 'このターンに誰かが使った最後のアタックかスキルのうち、コストがXのもののコピーを使う。'],
  play: async function (k) {
    var list = (k.cb.s.turnPlays || []).filter(function (p) { return (p.t === 'A' || p.t === 'S') && typeof p.cost === 'number' && p.cost === k.x && p.id !== 'Doppelganger'; });
    var last = list[list.length - 1];
    if (!last) return;
    await playTempCopy(k, last);
  } });
card('Envenom', { ch: 'G', t: 'P', r: 'R', c: 3, cu: 2, name: '猛毒仕込み', en: 'Envenom', tx: ['自分のヒットは毒も与える（ナイフ含む）。', '自分のヒットは毒も与える（ナイフ含む）。'] });
card('GrandFinale', { ch: 'G', t: 'A', r: 'R', c: 0, unlock: 1, name: 'フィナーレ', en: 'Grand Finale', tg: 'R', tx: ['山札が0枚の時だけ使える。範囲に10ダメージ。', '山札が0枚の時だけ使える。範囲に12ダメージ。'],
  can: function (cb, pc) { return pc.draw.length ? '山札が0枚の時だけ使えます。' : null; }, play: function (k) { return k.aoe([U(k, 10, 12)]); } });
card('Malaise', { ch: 'G', t: 'S', r: 'R', c: 'X', ex: true, name: '不快感', en: 'Malaise', tg: 'E', tx: ['敵1体に脱力1と毒1をX回与える。廃棄。', '敵1体に脱力1と毒1をX+1回与える。廃棄。'],
  play: async function (k) { var n = k.x + U(k, 0, 1); for (var i = 0; i < n; i++) { await k.weak(k.target, 1); await k.psn(k.target, 1); } } });
card('StormOfSteel', { ch: 'G', t: 'S', r: 'R', c: 1, name: '鋼の嵐', en: 'Storm of Steel', tx: ['手札を好きな枚数捨てる。1枚につきナイフ×1を得る。', '手札を好きな枚数捨てる。1枚につきナイフ×1を得て、さらにナイフ×1。'],
  play: async function (k) { var cs = await k.discardHand(0, 99, '捨てるカードを選択（1枚につきナイフ1）'); var n = cs.length + U(k, 0, 1); if (n) await k.shiv(n); } });
card('ToolsOfTheTrade', { ch: 'G', t: 'P', r: 'R', c: 1, cu: 0, name: '商売道具', en: 'Tools of the Trade', tx: ['ターン開始時：カードを1枚引き、手札を1枚捨てる。', 'ターン開始時：カードを1枚引き、手札を1枚捨てる。'],
  pw: { startTurn: async function (cb, pc) { await cb.draw(pc, 1); var cs = await cb.pickCards(pc, 'hand', 1, 1, '商売道具：捨てるカードを選択'); await cb.discardCards(pc, cs, true); } } });
card('Unload', { ch: 'G', t: 'A', r: 'R', c: 1, name: '一斉処分', en: 'Unload', tg: 'E', tx: ['2ダメージ。持っているナイフをすべて今使う。それぞれ+1ダメージ（別々の攻撃）。', '2ダメージ。持っているナイフをすべて今使う。それぞれ+2ダメージ（別々の攻撃）。'],
  play: async function (k) {
    await k.atk([2]);
    var n = k.pc.shiv; k.pc.shiv = 0;
    for (var i = 0; i < n && !k.cb.s.over; i++) {
      var e = await k.cb.chooseEnemy(k.pc, 'ナイフ' + (i + 1) + '：対象の敵を選択');
      if (!e) break;
      await k.cb.attack(k.pc, e, [1 + U(k, 1, 2)], { shiv: true, zeroCost: k.cb.has(k.pc, 'WristBlade') });
      await k.cb.afterResolution(k.pc, { id: 'Shiv' }, { shiv: true, d: { t: 'A' }, target: e });
      k.pc.t.attacksInclShiv = (k.pc.t.attacksInclShiv || 0) + 1;
    }
  } });
card('WraithForm', { ch: 'G', t: 'P', r: 'R', c: 3, name: '幽体化', en: 'Wraith Form', tx: ['1ラウンドに失うHPは最大1。2ラウンド後にこのカードを廃棄する。', '1ラウンドに失うHPは最大1。3ラウンド後にこのカードを廃棄する。'],
  play: async function (k) { k.pc.capHp = 'round'; k.pc.capHpLost = k.pc.capHpLost || 0; },
  pw: { startTurn: async function (cb, pc, inst) {
    inst.n = (inst.n || 0) + 1;
    var limit = inst.up ? 3 : 2;
    if (inst.n < limit) { pc.capHp = 'round'; pc.capHpLost = 0; }
    else await cb.removePower(pc, inst, true);
  } } });

/* ================================================================== DEFECT */
card('StrikeB', { ch: 'B', t: 'A', r: 'S', c: 1, cu: 0, name: 'ストライク', en: 'Strike', tg: 'E', tx: ['1ダメージ。', '1ダメージ。'], play: function (k) { return k.atk([1]); } });
card('DefendB', { ch: 'B', t: 'S', r: 'S', c: 1, name: '防御', en: 'Defend', tx: ['ブロック1。', '任意のプレイヤーにブロック2。'], play: CARDS.DefendR.play });
card('Zap', { ch: 'B', t: 'S', r: 'S', c: 1, cu: 0, name: '消去プログラム', en: 'Zap', tx: ['ライトニングを1つ生成する。', 'ライトニングを1つ生成する。'], play: function (k) { return k.channel('lightning'); } });
card('Dualcast', { ch: 'B', t: 'S', r: 'S', c: 1, cu: 0, name: '二連解放', en: 'Dualcast', tx: ['オーブを1つ2回解放する。', 'オーブを1つ2回解放する。'], play: function (k) { return k.cb.evokeFirst(k.pc, 2, '2回解放するオーブを選択'); } });
card('BallLightning', { ch: 'B', t: 'A', r: 'C', c: 1, name: 'ボールライトニング', en: 'Ball Lightning', tg: 'E', tx: ['1ダメージ。ライトニングを1つ生成する。', '2ダメージ。ライトニングを1つ生成する。'], play: async function (k) { await k.atk([U(k, 1, 2)]); await k.channel('lightning'); } });
card('Barrage', { ch: 'B', t: 'A', r: 'C', c: 1, name: '集中砲火', en: 'Barrage', tg: 'E', tx: ['オーブ1つにつき1ダメージ。', 'オーブ1つにつき1ダメージ、さらに1回。'],
  play: function (k) { var n = k.pc.orbs.length + U(k, 0, 1), hits = []; for (var i = 0; i < n; i++) hits.push(1); return hits.length ? k.atk(hits) : null; } });
card('Chaos', { ch: 'B', t: 'S', r: 'C', c: 1, cu: 0, name: '混沌', en: 'Chaos', tx: ['ダイスの目に応じたオーブを生成する。1・2：ライトニング／3・4：フロスト／5・6：ダーク。', 'ダイスの目に応じたオーブを生成する。1・2：ライトニング／3・4：フロスト／5・6：ダーク。'],
  play: function (k) { var d = k.cb.s.die; return k.channel(d <= 2 ? 'lightning' : d <= 4 ? 'frost' : 'dark'); } });
card('ChargeBattery', { ch: 'B', t: 'S', r: 'C', c: 1, name: '充電', en: 'Charge Battery', tx: ['ブロック2。オーブが3つ以上あれば1エナジーを得る。', 'ブロック3。オーブが3つ以上あれば1エナジーを得る。'],
  play: async function (k) { await k.blk(U(k, 2, 3)); if (k.pc.orbs.length >= 3) k.energy(1); } });
card('Claw', { ch: 'B', t: 'A', r: 'C', c: 0, name: '鋭い爪', en: 'Claw', tg: 'E', tx: ['1ダメージ。捨て札の一番上のカードがコスト0なら+1。', '1ダメージ。捨て札の一番上のカードがコスト0なら+3。'],
  play: function (k) { return k.atk([1 + (topDiscardZero(k) ? U(k, 1, 3) : 0)]); } });
card('ColdSnap', { ch: 'B', t: 'A', r: 'C', c: 2, name: '寒波', en: 'Cold Snap', tg: 'E', tx: ['2ダメージ。フロストを1つ生成する。', '3ダメージ。フロストを1つ生成する。'], play: async function (k) { await k.atk([U(k, 2, 3)]); await k.channel('frost'); } });
card('CompileDriver', { ch: 'B', t: 'A', r: 'C', c: 1, name: 'コンパイラ', en: 'Compile Driver', tg: 'E', tx: ['1ダメージ。持っているオーブの種類1つにつきカードを1枚引く。', '2ダメージ。持っているオーブの種類1つにつきカードを1枚引く。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); var types = {}; k.pc.orbs.forEach(function (o) { types[o] = 1; }); var n = Object.keys(types).length; if (n) await k.draw(n); } });
card('Coolheaded', { ch: 'B', t: 'S', r: 'C', c: 1, name: '冷静沈着', en: 'Coolheaded', tx: ['フロストを1つ生成する。', 'フロストを1つ生成する。カードを1枚引く。'], play: async function (k) { await k.channel('frost'); if (k.up) await k.draw(1); } });
card('GoForTheEyes', { ch: 'B', t: 'A', r: 'C', c: 0, name: '目潰し', en: 'Go for the Eyes', tg: 'E', tx: ['1ダメージ。ダイスが4〜6なら脱力1。', '1ダメージ。脱力1。'],
  play: async function (k) { await k.atk([1]); if (k.up || k.cb.s.die >= 4) await k.weak(k.target, 1); } });
card('Leap', { ch: 'B', t: 'S', r: 'C', c: 1, name: '跳躍', en: 'Leap', tx: ['任意のプレイヤーにブロック2。他のプレイヤーと列を入れ替えてもよい。', '任意のプレイヤーにブロック3。他のプレイヤーと列を入れ替えてもよい。'],
  play: async function (k) { await anyBlock(k, U(k, 2, 3)); await swapRows(k); } });
card('Recursion', { ch: 'B', t: 'S', r: 'C', c: 1, cu: 0, name: '再帰', en: 'Recursion', tx: ['オーブを1つ解放し、解放したオーブを生成する。', 'オーブを1つ解放し、解放したオーブを生成する。'],
  play: async function (k) { var pc = k.pc; if (!pc.orbs.length) return; var i = await k.cb.chooseOrb(pc, '解放するオーブを選択'); var t = pc.orbs[i]; await k.cb.evokeAt(pc, i, 1); await k.channel(t); } });
card('Scrape', { ch: 'B', t: 'A', r: 'C', c: 1, name: '切り裂き', en: 'Scrape', tg: 'E', tx: ['2ダメージ。捨て札の一番上のカードがコスト0なら手札に戻す。', '3ダメージ。捨て札の一番上のカードがコスト0なら手札に戻す。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); if (topDiscardZero(k)) k.pc.hand.push(k.pc.disc.pop()); } });
card('Skim', { ch: 'B', t: 'S', r: 'C', c: 1, name: 'スキミング', en: 'Skim', tx: ['カードを3枚引く。', 'カードを4枚引く。'], play: function (k) { return k.draw(U(k, 3, 4)); } });
card('SteamBarrier', { ch: 'B', t: 'S', r: 'C', c: 0, name: 'スチームバリア', en: 'Steam Barrier', tx: ['ブロック1。捨て札の一番上のカードがコスト0なら+1。', 'ブロック2。捨て札の一番上のカードがコスト0なら+1。'],
  play: function (k) { return k.blk(U(k, 1, 2) + (topDiscardZero(k) ? 1 : 0)); } });
card('SweepingBeam', { ch: 'B', t: 'A', r: 'C', c: 1, name: 'ビーム一掃', en: 'Sweeping Beam', tg: 'R', tx: ['範囲に1ダメージ。カードを1枚引く。', '範囲に2ダメージ。カードを1枚引く。'], play: async function (k) { await k.aoe([U(k, 1, 2)]); await k.draw(1); } });
card('Turbo', { ch: 'B', t: 'S', r: 'C', c: 0, unlock: 1, ex: true, name: 'ターボ', en: 'TURBO', tx: ['2エナジーを得る。捨て札にめまい1を置く。廃棄。', '3エナジーを得る。捨て札にめまい1を置く。廃棄。'],
  play: async function (k) { k.energy(U(k, 2, 3)); await k.cb.addStatus(k.pc, 'Daze', 1, 'discard'); } });
card('BeamCell', { ch: 'B', t: 'A', r: 'U', c: 1, name: 'ビームセル', en: 'Beam Cell', tg: 'E', tx: ['1ダメージ。ダイスが1〜3なら弱体化1。', '1ダメージ。弱体化1。'],
  play: async function (k) { await k.atk([1]); if (k.up || k.cb.s.die <= 3) await k.vuln(k.target, 1); } });
card('Blizzard', { ch: 'B', t: 'A', r: 'U', c: 1, name: 'ブリザード', en: 'Blizzard', tg: 'R', tx: ['フロスト1つにつき、範囲に2ダメージ。', 'フロスト1つにつき、範囲に3ダメージ。'],
  play: function (k) { var n = k.pc.orbs.filter(function (o) { return o === 'frost'; }).length, hits = []; for (var i = 0; i < n; i++) hits.push(U(k, 2, 3)); return hits.length ? k.aoe(hits) : null; } });
card('Capacitor', { ch: 'B', t: 'P', r: 'U', c: 1, name: 'コンデンサ', en: 'Capacitor', tx: ['オーブスロットを2つ得る。', 'オーブスロットを3つ得る。'], play: async function (k) { k.pc.slots += U(k, 2, 3); } });
card('Consume', { ch: 'B', t: 'P', r: 'U', c: 2, cu: 1, unlock: 2, name: '消費', en: 'Consume', tx: ['オーブの解放効果+1。', 'オーブの解放効果+1。'] });
card('Darkness', { ch: 'B', t: 'S', r: 'U', c: 1, cu: 0, name: '暗黒', en: 'Darkness', tx: ['ダークを1つ生成する。', 'ダークを1つ生成する。'], play: function (k) { return k.channel('dark'); } });
card('DoomAndGloom', { ch: 'B', t: 'A', r: 'U', c: 2, name: '自暴自棄', en: 'Doom and Gloom', tg: 'R', tx: ['範囲に2ダメージ。ダークを1つ生成する。', '範囲に3ダメージ。ダークを1つ生成する。'], play: async function (k) { await k.aoe([U(k, 2, 3)]); await k.channel('dark'); } });
card('DoubleEnergy', { ch: 'B', t: 'S', r: 'U', c: 1, cu: 0, unlock: 3, ex: true, name: 'ダブルエナジー', en: 'Double Energy', tx: ['エナジーを2倍にする（最大6）。廃棄。', 'エナジーを2倍にする（最大6）。廃棄。'], play: async function (k) { k.energy(k.pc.en); } });
card('Equilibrium', { ch: 'B', t: 'S', r: 'U', c: 2, unlock: 3, name: '均衡', en: 'Equilibrium', tx: ['ブロック3。このターン、カードを1枚保留してもよい。', 'ブロック4。このターン、カードを2枚まで保留してもよい。'],
  play: async function (k) { await k.blk(U(k, 3, 4)); k.pc.t.retainN = (k.pc.t.retainN || 0) + U(k, 1, 2); } });
card('FTL', { ch: 'B', t: 'A', r: 'U', c: 0, name: '超光速航法', en: 'FTL', tg: 'E', tx: ['1ダメージ。このターン最初に使ったカードなら、カードを1枚引く。', '2ダメージ。このターン最初に使ったカードなら、カードを1枚引く。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); if (k.pc.t.first === k.card.u) await k.draw(1); } });
card('ForceField', { ch: 'B', t: 'S', r: 'U', c: 3, name: '力場', en: 'Force Field', tx: ['ブロック3。場のパワー1枚につきコスト-1。', 'ブロック4。場のパワー1枚につきコスト-1。'],
  costFn: function (cb, pc, c, cost) { return Math.max(0, cost - pc.pow.length); }, play: function (k) { return k.blk(U(k, 3, 4)); } });
card('Fusion', { ch: 'B', t: 'P', r: 'U', c: 2, cu: 1, name: '融合', en: 'Fusion', tx: ['ターン開始時：1エナジーを得る。', 'ターン開始時：1エナジーを得る。'], pw: { startTurn: function (cb, pc) { cb.gainEnergy(pc, 1); } } });
card('Glacier', { ch: 'B', t: 'S', r: 'U', c: 2, name: '氷河', en: 'Glacier', tx: ['ブロック2。フロストを1つ生成する。', '任意のプレイヤーにブロック3。フロストを1つ生成する。'],
  play: async function (k) { if (k.up) await anyBlock(k, 3); else await k.blk(2); await k.channel('frost'); } });
card('Heatsinks', { ch: 'B', t: 'P', r: 'U', c: 1, unlock: 2, name: 'ヒートシンク', en: 'Heatsinks', tx: ['パワーを使うたび、カードを2枚引く。', 'パワーを使うたび、カードを3枚引く。'] });
card('Hologram', { ch: 'B', t: 'S', r: 'U', c: 1, ex: [true, false], name: 'ホログラム', en: 'Hologram', tx: ['ブロック1。捨て札のカード1枚を手札に加える。廃棄。', 'ブロック1。捨て札のカード1枚を手札に加える。'],
  play: async function (k) { await k.blk(1); var cs = await k.pick('discard', 1, 1, '手札に加えるカードを選択'); cs.forEach(function (c) { k.pc.disc.splice(k.pc.disc.indexOf(c), 1); k.pc.hand.push(c); }); } });
card('Loop', { ch: 'B', t: 'P', r: 'U', c: 1, name: 'ループ', en: 'Loop', tx: ['ターン終了時：オーブ1つのターン終了時効果を発動する。', 'ターン終了時：オーブ1つのターン終了時効果を2回発動する。'],
  pw: { endTurn: async function (cb, pc, inst) {
    var i = await cb.chooseOrb(pc, 'ループ：効果を発動するオーブを選択', function (o) { return o !== 'dark'; });
    if (i < 0) return;
    for (var t = 0; t < (inst.up ? 2 : 1); t++) await cb.orbEnd(pc, i);
  } } });
card('MachineLearning', { ch: 'B', t: 'P', r: 'U', c: 1, cu: 0, name: '機械学習', en: 'Machine Learning', tx: ['ターン開始時：カードを1枚引く。', 'ターン開始時：カードを1枚引く。'], pw: { startTurn: function (cb, pc) { return cb.draw(pc, 1); } } });
card('Melter', { ch: 'B', t: 'A', r: 'U', c: 1, name: '溶解炉', en: 'Melter', tg: 'E', tx: ['先に対象のブロックをすべて取り除く。2ダメージ。', '先に対象のブロックをすべて取り除く。3ダメージ。'],
  play: async function (k) { if (k.target) k.target.blk = 0; await k.atk([U(k, 2, 3)]); } });
card('Overclock', { ch: 'B', t: 'S', r: 'U', c: 0, unlock: 1, name: 'オーバークロック', en: 'Overclock', tx: ['カードを2枚引く。捨て札にめまい1を置く。', 'カードを3枚引く。捨て札にめまい1を置く。'],
  play: async function (k) { await k.draw(U(k, 2, 3)); await k.cb.addStatus(k.pc, 'Daze', 1, 'discard'); } });
card('Recycle', { ch: 'B', t: 'S', r: 'U', c: 1, cu: 0, unlock: 3, name: 'リサイクル', en: 'Recycle', tx: ['手札を1枚廃棄し、そのコストぶんのエナジーを得る。コストがXなら代わりにエナジーを2倍にする。', '手札を1枚廃棄し、そのコストぶんのエナジーを得る。コストがXなら代わりにエナジーを2倍にする。'],
  play: async function (k) {
    var cs = await k.pick('hand', 1, 1, '廃棄するカードを選択'); var c = cs[0]; if (!c) return;
    var cost = k.cb.costOf(k.pc, c); if (cost == null) cost = 0;
    await k.cb.exhaustCard(k.pc, c);
    if (cost === 'X') k.energy(k.pc.en); else k.energy(cost);
  } });
card('ReinforcedBody', { ch: 'B', t: 'S', r: 'U', c: 'X', name: '強化ボディ', en: 'Reinforced Body', tx: ['ブロックX+1（Xは1以上）。', 'ブロックXを2回。'],
  can: function (cb, pc, c) { return (!c.up && pc.en + pc.mir < 1) ? 'Xは1以上でなければなりません。' : null; },
  play: async function (k) { if (k.up) { if (k.x > 0) { await k.blk(k.x); await k.blk(k.x); } } else if (k.x >= 1) await k.blk(k.x + 1); } });
card('Reprogram', { ch: 'B', t: 'S', r: 'U', c: 1, cu: 0, name: '再構成', en: 'Reprogram', tx: ['筋力1を得る。自分のオーブをすべて取り除く。', '筋力1を得る。自分のオーブをすべて取り除く。'], play: async function (k) { k.str(1); k.pc.orbs = []; } });
card('Stack', { ch: 'B', t: 'S', r: 'U', c: 1, name: 'スタック', en: 'Stack', tx: ['任意のプレイヤーにブロックX。Xは自分のオーブの数。', '任意のプレイヤーにブロックX+1。Xは自分のオーブの数。'],
  play: function (k) { var n = k.pc.orbs.length + U(k, 0, 1); return n > 0 ? anyBlock(k, n) : null; } });
card('Storm', { ch: 'B', t: 'P', r: 'U', c: 1, name: '嵐', en: 'Storm', tx: ['ターン開始時：ライトニングを1つ生成する。', 'ターン開始時：ライトニングを2つ生成する。'],
  pw: { startTurn: async function (cb, pc, inst) { for (var i = 0; i < (inst.up ? 2 : 1); i++) await cb.channel(pc, 'lightning'); } } });
card('Streamline', { ch: 'B', t: 'A', r: 'U', c: 2, name: '効率化', en: 'Streamline', tg: 'E', tx: ['3ダメージ。場のパワー1枚につきコスト-1。', '4ダメージ。場のパワー1枚につきコスト-1。'],
  costFn: function (cb, pc, c, cost) { return Math.max(0, cost - pc.pow.length); }, play: function (k) { return strike(k, 3, 4); } });
card('Sunder', { ch: 'B', t: 'A', r: 'U', c: 3, unlock: 1, name: '切断', en: 'Sunder', tg: 'E', tx: ['5ダメージ。この攻撃で敵を倒したら3エナジーを得る。', '7ダメージ。この攻撃で敵を倒したら3エナジーを得る。'],
  play: async function (k) { var r = await k.atk([U(k, 5, 7)]); if (r.killed) k.energy(3); } });
card('Tempest', { ch: 'B', t: 'S', r: 'U', c: 'X', ex: true, name: 'テンペスト', en: 'Tempest', tx: ['ライトニングをX個生成する。廃棄。', 'ライトニングをX+1個生成する。廃棄。'],
  play: async function (k) { var n = k.x + U(k, 0, 1); for (var i = 0; i < n; i++) await k.channel('lightning'); } });
card('AllForOne', { ch: 'B', t: 'A', r: 'R', c: 2, name: 'オールフォーワン', en: 'All for One', tg: 'E', tx: ['2ダメージ。捨て札のコスト0のカードをすべて手札に加える。', '3ダメージ。捨て札のコスト0のカードをすべて手札に加える。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); var cs = k.pc.disc.filter(function (c) { return k.cb.baseCost(c) === 0; }); cs.forEach(function (c) { k.pc.disc.splice(k.pc.disc.indexOf(c), 1); k.pc.hand.push(c); }); } });
card('Amplify', { ch: 'B', t: 'P', r: 'R', c: 1, name: '増幅', en: 'Amplify', tx: ['ダークの解放ダメージ+3。', 'ダークの解放ダメージ+5。'] });
card('Buffer', { ch: 'B', t: 'P', r: 'R', c: 2, name: 'バッファー', en: 'Buffer', tx: ['次にHPを失う時、それを防ぎ、このカードを廃棄する。', '次の2回HPを失う時、それを防ぎ、その後このカードを廃棄する。'] });
card('CoreSurge', { ch: 'B', t: 'A', r: 'R', c: 1, ret: true, name: 'コアサージ', en: 'Core Surge', tg: 'E', tx: ['保留。任意のプレイヤーの脱力と弱体化をすべて取り除く。3ダメージ。', '保留。全プレイヤーの脱力と弱体化をすべて取り除く。4ダメージ。'],
  play: async function (k) {
    if (k.up) k.cb.pcs().forEach(function (p) { p.weak = 0; p.vuln = 0; });
    else { var to = await k.playerSel('脱力・弱体化を取り除くプレイヤーを選択'); to.weak = 0; to.vuln = 0; }
    await k.atk([U(k, 3, 4)]);
  } });
card('Defragment', { ch: 'B', t: 'P', r: 'R', c: 3, unlock: 2, eth: [true, false], name: 'デフラグ', en: 'Defragment', tx: ['エーテリアル。オーブのターン終了時効果+1。', 'オーブのターン終了時効果+1。'] });
card('EchoForm', { ch: 'B', t: 'P', r: 'R', c: 3, unlock: 1, eth: [true, false], name: '反響化', en: 'Echo Form', tx: ['エーテリアル。毎ターン、最初に使うアタックかスキルを2回使う。', '毎ターン、最初に使うアタックかスキルを2回使う。'] });
card('Electrodynamics', { ch: 'B', t: 'P', r: 'R', c: 2, name: '電気力学', en: 'Electrodynamics', tx: ['ライトニングは単体の代わりに任意の列にダメージを与える。使用時、ライトニングを2つ生成する。', 'ライトニングは単体の代わりに任意の列にダメージを与える。使用時、ライトニングを3つ生成する。'],
  play: async function (k) { k.pc.t.electroPending = true; for (var i = 0; i < U(k, 2, 3); i++) await k.channel('lightning'); } });
card('Fission', { ch: 'B', t: 'S', r: 'R', c: 0, unlock: 3, ex: true, name: '核分裂', en: 'Fission', tx: ['自分のオーブをすべて取り除く。1つにつき1エナジーを得てカードを1枚引く。廃棄。', '自分のオーブをすべて解放する。1つにつき1エナジーを得てカードを1枚引く。廃棄。'],
  play: async function (k) {
    var n = k.pc.orbs.length;
    if (k.up) { while (k.pc.orbs.length) await k.cb.evokeAt(k.pc, 0, 1); } else k.pc.orbs = [];
    k.energy(n); if (n) await k.draw(n);
  } });
card('Hyperbeam', { ch: 'B', t: 'A', r: 'R', c: 2, name: 'ハイパービーム', en: 'Hyperbeam', tg: 'R', tx: ['範囲に5ダメージ。自分のオーブをすべて取り除く。', '範囲に7ダメージ。自分のオーブをすべて取り除く。'], play: async function (k) { await k.aoe([U(k, 5, 7)]); k.pc.orbs = []; } });
card('MeteorStrike', { ch: 'B', t: 'A', r: 'R', c: 5, name: 'メテオストライク', en: 'Meteor Strike', tg: 'E', tx: ['10ダメージ。場のパワー1枚につきコスト-1。', '15ダメージ。場のパワー1枚につきコスト-1。'],
  costFn: function (cb, pc, c, cost) { return Math.max(0, cost - pc.pow.length); }, play: function (k) { return strike(k, 10, 15); } });
card('MultiCast', { ch: 'B', t: 'S', r: 'R', c: 'X', name: '重連解放', en: 'Multi-Cast', tx: ['オーブを1つX回解放する。', 'オーブを1つX+1回解放する。'],
  play: function (k) { var n = k.x + U(k, 0, 1); if (n > 0) return k.cb.evokeFirst(k.pc, n, n + '回解放するオーブを選択'); } });
card('Rainbow', { ch: 'B', t: 'S', r: 'R', c: 2, ex: [true, false], name: 'レインボー', en: 'Rainbow', tx: ['ライトニング、フロスト、ダークを1つずつ生成する。廃棄。', 'ライトニング、フロスト、ダークを1つずつ生成する。'],
  play: async function (k) { await k.channel('lightning'); await k.channel('frost'); await k.channel('dark'); } });
card('Seek', { ch: 'B', t: 'S', r: 'R', c: 0, ex: true, name: '検索', en: 'Seek', tx: ['山札からカードを1枚探して手札に加え、山札をシャッフルする。廃棄。', '山札からカードを2枚探して手札に加え、山札をシャッフルする。廃棄。'],
  play: async function (k) { var cs = await k.pick('draw', U(k, 1, 2), U(k, 1, 2), '手札に加えるカードを選択'); cs.forEach(function (c) { k.pc.draw.splice(k.pc.draw.indexOf(c), 1); k.pc.hand.push(c); }); k.g.shuffle(k.pc.draw); } });
card('StaticDischarge', { ch: 'B', t: 'P', r: 'R', c: 2, name: '静電気放電', en: 'Static Discharge', tx: ['ライトニングのターン終了時効果+1。', 'ライトニングのターン終了時効果+2。'] });
card('ThunderStrike', { ch: 'B', t: 'A', r: 'R', c: 3, name: 'サンダーストライク', en: 'Thunder Strike', tg: 'R', tx: ['ライトニング1つにつき、範囲に4ダメージ。', 'ライトニング1つにつき、範囲に6ダメージ。'],
  play: function (k) { var n = k.pc.orbs.filter(function (o) { return o === 'lightning'; }).length, hits = []; for (var i = 0; i < n; i++) hits.push(U(k, 4, 6)); return hits.length ? k.aoe(hits) : null; } });

/* ================================================================== WATCHER */
card('StrikeW', { ch: 'W', t: 'A', r: 'S', c: 1, name: 'ストライク', en: 'Strike', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: function (k) { return strike(k, 1, 2); } });
card('DefendW', { ch: 'W', t: 'S', r: 'S', c: 1, name: '防御', en: 'Defend', tx: ['ブロック1。', '任意のプレイヤーにブロック2。'], play: CARDS.DefendR.play });
card('Eruption', { ch: 'W', t: 'A', r: 'S', c: 2, cu: 1, name: '噴火', en: 'Eruption', tg: 'E', tx: ['2ダメージ。憤怒になる。', '2ダメージ。憤怒になる。'], play: async function (k) { await k.atk([2]); await k.stance('wrath'); } });
card('Vigilance', { ch: 'W', t: 'S', r: 'S', c: 2, name: '警戒', en: 'Vigilance', tx: ['任意のプレイヤーにブロック2。平静になる。', '任意のプレイヤーにブロック3。平静になる。'], play: async function (k) { await anyBlock(k, U(k, 2, 3)); await k.stance('calm'); } });
card('Collect', { ch: 'W', t: 'S', r: 'C', c: 1, ex: true, name: '採集', en: 'Collect', tx: ['奇跡×2を得る。廃棄。', '奇跡×3を得る。廃棄。'], play: async function (k) { k.mir(U(k, 2, 3)); } });
card('Consecrate', { ch: 'W', t: 'A', r: 'C', c: 0, name: '聖別', en: 'Consecrate', tg: 'R', tx: ['範囲に1ダメージ。', '範囲に2ダメージ。'], play: function (k) { return k.aoe([U(k, 1, 2)]); } });
card('Crescendo', { ch: 'W', t: 'S', r: 'C', c: 0, ret: true, ex: true, name: '奮激', en: 'Crescendo', tx: ['保留。憤怒になる。廃棄。', '保留。憤怒になる。カードを1枚引く。廃棄。'], play: async function (k) { await k.stance('wrath'); if (k.up) await k.draw(1); } });
card('CutThroughFate', { ch: 'W', t: 'A', r: 'C', c: 1, name: '切り開く運命', en: 'Cut Through Fate', tg: 'E', tx: ['1ダメージ。占術2。カードを1枚引く。', '2ダメージ。占術3。カードを1枚引く。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); await k.scry(U(k, 2, 3)); await k.draw(1); } });
card('EmptyBody', { ch: 'W', t: 'S', r: 'C', c: 1, name: '空虚なる体', en: 'Empty Body', tx: ['ブロック2。スタンスを解除する。', 'ブロック3。スタンスを解除する。'], play: async function (k) { await k.blk(U(k, 2, 3)); await k.stance('none'); } });
card('EmptyFist', { ch: 'W', t: 'A', r: 'C', c: 1, name: '空虚なる拳', en: 'Empty Fist', tg: 'E', tx: ['2ダメージ。スタンスを解除する。', '3ダメージ。スタンスを解除する。'], play: async function (k) { await k.atk([U(k, 2, 3)]); await k.stance('none'); } });
card('FlurryOfBlows', { ch: 'W', t: 'A', r: 'C', c: 0, unlock: 1, name: '連撃', en: 'Flurry of Blows', tg: 'E', tx: ['1ダメージ。このターンにスタンスを変えていれば、さらに1ダメージ。', '1ダメージ。このターンにスタンスを変えていれば、さらに1ダメージを2回。'],
  play: function (k) { var hits = [1]; if (k.pc.t.stanceSwitched) { hits.push(1); if (k.up) hits.push(1); } return k.atk(hits); } });
card('FlyingSleeves', { ch: 'W', t: 'A', r: 'C', c: 1, ret: true, name: '迅速の袖', en: 'Flying Sleeves', tg: 'E', tx: ['保留。1ダメージを2回。', '保留。1ダメージを3回。'], play: function (k) { return k.atk(k.up ? [1, 1, 1] : [1, 1]); } });
card('Halt', { ch: 'W', t: 'S', r: 'C', c: 0, name: '停止命令', en: 'Halt', tx: ['ブロック1。憤怒中なら+1。', 'ブロック1。憤怒中なら+2。'], play: function (k) { return k.blk(1 + (k.pc.stance === 'wrath' ? U(k, 1, 2) : 0)); } });
card('JustLucky', { ch: 'W', t: 'A', r: 'C', c: 0, name: 'ただの幸運', en: 'Just Lucky', tg: 'E', tx: ['ダイス1〜3：1ダメージ、占術1。ダイス4〜6：1ダメージ、ブロック1。', 'ダイス1〜3：2ダメージ、占術2。ダイス4〜6：2ダメージ、ブロック1。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); if (k.cb.s.die <= 3) await k.scry(U(k, 1, 2)); else await k.blk(1); } });
card('Protect', { ch: 'W', t: 'S', r: 'C', c: 2, ret: true, name: '護身', en: 'Protect', tx: ['保留。任意のプレイヤーにブロック3。', '保留。任意のプレイヤーにブロック4。'], play: function (k) { return anyBlock(k, U(k, 3, 4)); } });
card('ThirdEye', { ch: 'W', t: 'S', r: 'C', c: 1, name: '第三の目', en: 'Third Eye', tx: ['ブロック2。占術3。', 'ブロック3。占術5。'], play: async function (k) { await k.blk(U(k, 2, 3)); await k.scry(U(k, 3, 5)); } });
card('Tranquility', { ch: 'W', t: 'S', r: 'C', c: 1, cu: 0, ret: true, ex: true, name: '精神の平穏', en: 'Tranquility', tx: ['保留。平静になる。廃棄。', '保留。平静になる。廃棄。'], play: function (k) { return k.stance('calm'); } });
card('BattleHymn', { ch: 'W', t: 'P', r: 'U', c: 1, name: '闘争賛歌', en: 'Battle Hymn', tx: ['1ターンに1回：1ダメージ。憤怒中なら+1。', '1ターンに1回：2ダメージ。憤怒中なら+2。'],
  pw: { activate: function (cb, pc, inst) { var n = inst.up ? 2 : 1; if (pc.stance === 'wrath') n *= 2; return cb.damageTarget(pc, n, '闘争賛歌：対象の敵を選択'); } } });
card('CarveReality', { ch: 'W', t: 'A', r: 'U', c: 2, name: '彫り刻む現実', en: 'Carve Reality', tg: 'E', tx: ['敵1体か2体に3ダメージ。', '敵1体か2体に4ダメージ。'],
  play: async function (k) {
    await k.atk([U(k, 3, 4)]);
    var others = k.cb.alive().filter(function (e) { return e !== k.target; });
    if (!others.length) return;
    var a = await k.option([{ id: 'yes', label: '2体目にも与える' }, { id: 'no', label: '1体だけ' }], '彫り刻む現実');
    if (a === 'yes') { var e2 = await k.cb.chooseEnemy(k.pc, '2体目の敵を選択'); if (e2 && e2 !== k.target) await k.atk([U(k, 3, 4)], e2); }
  } });
card('Conclude', { ch: 'W', t: 'A', r: 'U', c: 1, name: '終幕', en: 'Conclude', tg: 'R', tx: ['範囲に1ダメージを2回。このターン、これ以上カードを使えない。', '範囲に1ダメージを3回。このターン、これ以上カードを使えない。'],
  play: async function (k) { await k.aoe(k.up ? [1, 1, 1] : [1, 1]); k.pc.t.noMore = true; } });
card('CrushJoints', { ch: 'W', t: 'A', r: 'U', c: 1, name: '関節粉砕', en: 'Crush Joints', tg: 'E', tx: ['1ダメージ。憤怒中なら弱体化1。', '2ダメージ。憤怒中なら弱体化1。'], play: async function (k) { await k.atk([U(k, 1, 2)]); if (k.pc.stance === 'wrath') await k.vuln(k.target, 1); } });
card('EmptyMind', { ch: 'W', t: 'S', r: 'U', c: 1, name: '空虚なる頭', en: 'Empty Mind', tx: ['カードを2枚引く。スタンスを解除する。', 'カードを3枚引く。スタンスを解除する。'], play: async function (k) { await k.draw(U(k, 2, 3)); await k.stance('none'); } });
card('FearNoEvil', { ch: 'W', t: 'A', r: 'U', c: 1, name: '悪を恐れず', en: 'Fear No Evil', tg: 'E', tx: ['2ダメージ。憤怒中なら平静になる。', '3ダメージ。憤怒中なら平静になる。'], play: async function (k) { await k.atk([U(k, 2, 3)]); if (k.pc.stance === 'wrath') await k.stance('calm'); } });
card('ForeignInfluence', { ch: 'W', t: 'A', r: 'U', c: 2, name: '外なる影響', en: 'Foreign Influence', tx: ['3ダメージ。または、このターンに他のプレイヤーが最後に使ったアタックのコピーを使う。', '4ダメージ。または、このターンに他のプレイヤーが最後に使ったアタックのコピーを使う。'],
  play: async function (k) {
    var list = (k.cb.s.turnPlays || []).filter(function (p) { return p.t === 'A' && p.by !== k.pc.i; });
    var last = list[list.length - 1];
    var a = 'dmg';
    if (last) a = await k.option([{ id: 'dmg', label: U(k, 3, 4) + 'ダメージ' }, { id: 'copy', label: '「' + CARDS[last.id].name + (last.up ? '+' : '') + '」のコピーを使う' }], '外なる影響');
    if (a === 'copy' && last) await playTempCopy(k, last);
    else { var e = await k.enemy(); if (e) await k.atk([U(k, 3, 4)], e); }
  } });
card('Foresight', { ch: 'W', t: 'P', r: 'U', c: 1, unlock: 2, name: '未来予見', en: 'Foresight', tx: ['ターン開始時、カードを引く前に：占術3。', 'ターン開始時、カードを引く前に：占術4。'] });
card('Indignation', { ch: 'W', t: 'S', r: 'U', c: 1, name: '憤激', en: 'Indignation', tg: function (k) { return k.pc.stance === 'wrath' ? (k.up ? 'R' : 'E') : 'N'; }, tx: ['憤怒中なら弱体化1。そうでなければ憤怒になる。', '憤怒中なら範囲に弱体化1。そうでなければ憤怒になる。'],
  play: async function (k) {
    if (k.pc.stance !== 'wrath') { await k.stance('wrath'); return; }
    if (k.up) { var ts = k.cb.aoeTargets(k.row); for (var i = 0; i < ts.length; i++) await k.vuln(ts[i], 1); } else await k.vuln(k.target, 1);
  } });
card('InnerPeace', { ch: 'W', t: 'S', r: 'U', c: 1, name: '内なる平和', en: 'Inner Peace', tx: ['平静中ならカードを3枚引く。そうでなければ平静になる。', '平静中ならカードを4枚引く。そうでなければ平静になる。'],
  play: function (k) { return k.pc.stance === 'calm' ? k.draw(U(k, 3, 4)) : k.stance('calm'); } });
card('LikeWater', { ch: 'W', t: 'P', r: 'U', c: 1, name: '水の如く', en: 'Like Water', tx: ['ターン終了時：平静中ならブロック1。', 'ターン終了時：平静中ならブロック2。'],
  pw: { endTurn: function (cb, pc, inst) { if (pc.stance === 'calm') return cb.gainBlock(pc, inst.up ? 2 : 1); } } });
card('Meditate', { ch: 'W', t: 'S', r: 'U', c: 1, unlock: 3, name: '瞑想', en: 'Meditate', tx: ['捨て札のカード1枚を手札に加えて保留する。平静になる。このターン、これ以上カードを使えない。', '捨て札のカード2枚を手札に加えて保留する。平静になる。このターン、これ以上カードを使えない。'],
  play: async function (k) {
    var cs = await k.pick('discard', U(k, 1, 2), U(k, 1, 2), '手札に加えるカードを選択');
    cs.forEach(function (c) { k.pc.disc.splice(k.pc.disc.indexOf(c), 1); c.rt = true; k.pc.hand.push(c); });
    await k.stance('calm'); k.pc.t.noMore = true;
  } });
card('MentalFortress', { ch: 'W', t: 'P', r: 'U', c: 1, name: '精神要塞', en: 'Mental Fortress', tx: ['スタンスを変えるたび、ブロック1。', 'スタンスを変えるたび、ブロック2。'] });
card('Nirvana', { ch: 'W', t: 'P', r: 'U', c: 1, unlock: 2, name: '涅槃', en: 'Nirvana', tx: ['占術するたび、ブロック1。', '占術するたび、ブロック2。'] });
card('Perseverance', { ch: 'W', t: 'S', r: 'U', c: 1, unlock: 3, ret: true, name: '忍耐', en: 'Perseverance', tx: ['保留。ブロック1。前のターンに保留していれば+2。', '保留。ブロック2。前のターンに保留していれば+2。'],
  play: function (k) { return k.blk(U(k, 1, 2) + (k.card.wasRetained ? 2 : 0)); } });
card('Pray', { ch: 'W', t: 'S', r: 'U', c: 1, name: '祈り', en: 'Pray', tx: ['奇跡×1を得る。カードを2枚引く。このターン、これ以上カードを引けない。', '奇跡×2を得る。カードを2枚引く。このターン、これ以上カードを引けない。'],
  play: async function (k) { k.mir(U(k, 1, 2)); await k.draw(2); k.pc.t.noDraw = true; } });
card('Prostrate', { ch: 'W', t: 'S', r: 'U', c: 1, name: '拝跪', en: 'Prostrate', tx: ['ブロック1。奇跡×1を得る。', 'ブロック2。奇跡×1を得る。'], play: async function (k) { await k.blk(U(k, 1, 2)); k.mir(1); } });
card('ReachHeaven', { ch: 'W', t: 'A', r: 'U', c: 1, name: '天への導き', en: 'Reach Heaven', tg: 'E', tx: ['2ダメージ。持っている奇跡1つにつき+1。', '2ダメージ。持っている奇跡1つにつき+2。'], play: function (k) { return k.atk([2 + k.pc.mir * U(k, 1, 2)]); } });
card('Rushdown', { ch: 'W', t: 'P', r: 'U', c: 1, name: '急襲', en: 'Rushdown', tx: ['毎ターン最初に憤怒になった時、カードを2枚引く。', '毎ターン最初に憤怒になった時、カードを3枚引く。'] });
card('SandsOfTime', { ch: 'W', t: 'A', r: 'U', c: 2, ret: true, name: '時の砂', en: 'Sands of Time', tg: 'E', tx: ['保留。3ダメージ。手札の保留を持つ他のカード1枚につき+2。', '保留。3ダメージ。手札の保留を持つ他のカード1枚につき+3。'],
  play: function (k) { var n = k.pc.hand.filter(function (c) { return k.cb.isRetained(k.pc, c); }).length; return k.atk([3 + n * U(k, 2, 3)]); } });
card('SashWhip', { ch: 'W', t: 'A', r: 'U', c: 1, name: '鞭打つ帯', en: 'Sash Whip', tg: 'E', tx: ['2ダメージ。平静中なら脱力1。', '2ダメージ。平静中なら脱力×2。'], play: async function (k) { await k.atk([2]); if (k.pc.stance === 'calm') await k.weak(k.target, U(k, 1, 2)); } });
card('SignatureMove', { ch: 'W', t: 'A', r: 'U', c: 2, name: 'フィニッシャー', en: 'Signature Move', tg: 'E', tx: ['手札のアタックがこれだけの時だけ使える。6ダメージ。', '手札のアタックがこれだけの時だけ使える。8ダメージ。'],
  can: function (cb, pc, c) { return pc.hand.filter(function (h) { return h !== c && CARDS[h.id].t === 'A'; }).length ? '手札のアタックがこのカードだけの時に使えます。' : null; },
  play: function (k) { return strike(k, 6, 8); } });
card('SimmeringFury', { ch: 'W', t: 'P', r: 'U', c: 2, name: '一触即発', en: 'Simmering Fury', tx: ['憤怒中、自分のヒットのダメージ+1。', '憤怒中、自分のヒットのダメージ+2。'] });
card('Study', { ch: 'W', t: 'P', r: 'U', c: 2, cu: 1, name: '学習', en: 'Study', tx: ['ターン開始時：平静中ならカードを2枚引く。', 'ターン開始時：平静中ならカードを2枚引く。'],
  pw: { startTurn: function (cb, pc) { if (pc.stance === 'calm') return cb.draw(pc, 2); } } });
card('Swivel', { ch: 'W', t: 'S', r: 'U', c: 2, name: '旋回', en: 'Swivel', tx: ['ブロック2。このターン次に使うアタックのコストは0。', '任意のプレイヤーにブロック3。このターン次に使うアタックのコストは0。'],
  play: async function (k) { if (k.up) await anyBlock(k, 3); else await k.blk(2); k.pc.t.swivel = true; } });
card('TalkToTheHand', { ch: 'W', t: 'A', r: 'U', c: 1, name: 'この手に言いな', en: 'Talk to the Hand', tg: 'E', tx: ['2ダメージ。持っている奇跡1つにつきブロック1。', '3ダメージ。持っている奇跡1つにつきブロック1。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); if (k.pc.mir) await k.cb.gainBlock(k.pc, k.pc.mir * (1 + k.cb.footwork(k.pc, k.card))); } });
card('Tantrum', { ch: 'W', t: 'A', r: 'U', c: 1, name: 'かんしゃく', en: 'Tantrum', tg: 'E', tx: ['2ダメージ。憤怒になる。このカードを山札の一番上に置く。', '1ダメージを2回。憤怒になる。このカードを山札の一番上に置く。'],
  play: async function (k) { await k.atk(k.up ? [1, 1] : [2]); await k.stance('wrath'); k.dest = 'drawTop'; } });
card('Wallop', { ch: 'W', t: 'A', r: 'U', c: 2, name: '殴打', en: 'Wallop', tg: 'E', tx: ['2ダメージ。防がれなかったダメージぶんブロックを得る。', '3ダメージ。防がれなかったダメージぶんブロックを得る。'],
  play: async function (k) { var r = await k.atk([U(k, 2, 3)]); if (r.hp > 0) await k.cb.gainBlock(k.pc, r.hp); } });
card('Weave', { ch: 'W', t: 'A', r: 'U', c: 0, unlock: 2, name: '編み上げ', en: 'Weave', tg: 'E', tx: ['1ダメージ。占術で捨てるなら、代わりにこのカードを使い+5ダメージ。', '2ダメージ。占術で捨てるなら、代わりにこのカードを使い+6ダメージ。'],
  play: function (k) { return k.atk([U(k, 1, 2) + (k.card.weave ? U(k, 5, 6) : 0)]); },
  onScryDiscard: async function (cb, pc, c) { if (pc.disc.indexOf(c) < 0) return; c.weave = true; await cb.playFree(pc, c, {}); delete c.weave; } });
card('WindmillStrike', { ch: 'W', t: 'A', r: 'U', c: 2, ret: true, name: 'ウィンドストライク', en: 'Windmill Strike', tg: 'E', tx: ['保留。2ダメージ。前のターンに保留していれば+3。', '保留。2ダメージ。前のターンに保留していれば+5。'],
  play: function (k) { return k.atk([2 + (k.card.wasRetained ? U(k, 3, 5) : 0)]); } });
card('Worship', { ch: 'W', t: 'S', r: 'U', c: 'X', unlock: 1, ex: true, ret: [false, true], name: '崇拝', en: 'Worship', tx: ['奇跡をX+1個得る。廃棄。', '保留。奇跡をX+1個得る。廃棄。'], play: async function (k) { k.mir(k.x + 1); } });
card('WreathOfFlame', { ch: 'W', t: 'S', r: 'U', c: 'X', unlock: 3, ex: [true, false], name: '炎の輪冠', en: 'Wreath of Flame', tx: ['筋力をX得る。ターン終了時にその筋力を失う。廃棄。', '筋力をX得る。ターン終了時にその筋力を失う。'],
  play: async function (k) { if (k.x > 0) k.cb.tempStr(k.pc, k.x); } });
card('Blasphemy', { ch: 'W', t: 'S', r: 'R', c: 2, unlock: 1, ex: true, ret: [false, true], noCopy: true, name: '冒涜', en: 'Blasphemy', tx: ['このターン次に使うアタックを3回使う。山札をすべて廃棄する。廃棄。', '保留。このターン次に使うアタックを3回使う。山札をすべて廃棄する。廃棄。'],
  play: async function (k) { k.pc.t.blasphemy = (k.pc.t.blasphemy || 0) + 1; var cs = k.pc.draw.slice(); for (var i = 0; i < cs.length; i++) await k.cb.exhaustCard(k.pc, cs[i]); } });
card('Brilliance', { ch: 'W', t: 'A', r: 'R', c: 1, name: '神光', en: 'Brilliance', tg: 'E', tx: ['持っている奇跡1つにつき2ダメージ。', '持っている奇跡1つにつき3ダメージ。'],
  play: function (k) { var hits = []; for (var i = 0; i < k.pc.mir; i++) hits.push(U(k, 2, 3)); return hits.length ? k.atk(hits) : null; } });
card('ConjureBlade', { ch: 'W', t: 'P', r: 'R', c: 'X', unlock: 2, name: '刀剣召喚', en: 'Conjure Blade', tx: ['自分のスターターのストライクのダメージ+X+1。', '自分のスターターのストライクのダメージ+X+2。'],
  play: async function (k) { k.powerData = { n: k.x + U(k, 1, 2) }; } });
card('DeusExMachina', { ch: 'W', t: 'S', r: 'R', c: 0, ex: true, name: 'デウスエクスマキナ', en: 'Deus Ex Machina', tx: ['奇跡×2を得る。廃棄。', '奇跡×3を得る。廃棄。'], play: async function (k) { k.mir(U(k, 2, 3)); } });
card('DevaForm', { ch: 'W', t: 'P', r: 'R', c: 2, name: '神体化', en: 'Deva Form', tx: ['ターン開始時：奇跡×1を得る。', 'ターン開始時：奇跡×2を得る。'], pw: { startTurn: function (cb, pc, inst) { cb.gainMiracle(pc, inst.up ? 2 : 1); } } });
card('Devotion', { ch: 'W', t: 'P', r: 'R', c: 1, name: '献身', en: 'Devotion', tx: ['ターン開始時：奇跡×1を得て、カードを1枚引く。3ターン後にこのカードを廃棄する。', 'ターン開始時：奇跡×1を得て、カードを1枚引く。4ターン後にこのカードを廃棄する。'],
  pw: { startTurn: async function (cb, pc, inst) {
    cb.gainMiracle(pc, 1); await cb.draw(pc, 1);
    inst.n = (inst.n || 0) + 1;
    if (inst.n >= (inst.up ? 4 : 3)) await cb.removePower(pc, inst, true);
  } } });
card('Establishment', { ch: 'W', t: 'P', r: 'R', c: 1, name: '制定', en: 'Establishment', tx: ['ターン開始時：前のターンに保留したカードのコストはこのターン1少ない。', 'ターン開始時：前のターンに保留したカードのコストはこのターン2少ない。'] });
card('Judgment', { ch: 'W', t: 'S', r: 'R', c: 1, eth: [true, false], ret: [false, true], name: '審判', en: 'Judgment', tg: 'E', tx: ['エーテリアル。敵を1体選ぶ。そのHPが7以下なら0にする。', '保留。敵を1体選ぶ。そのHPが8以下なら0にする。'],
  play: async function (k) { var e = k.target; if (e && e.hp <= U(k, 7, 8)) { e.hp = 0; await k.cb.killEnemy(e, { pc: k.pc, judgment: true }); } } });
card('Omega', { ch: 'W', t: 'P', r: 'R', c: 3, name: 'オメガ', en: 'Omega', tx: ['ターン終了時：任意の列に5ダメージ。', 'ターン終了時：任意の列に6ダメージ。'],
  pw: { endTurnDmg: function (cb, pc, inst) { if (cb.alive().length) return cb.damageAnyRow(pc, inst.up ? 6 : 5, 'オメガ：ダメージを与える列を選択'); } } });
card('Omniscience', { ch: 'W', t: 'S', r: 'R', c: 3, cu: 2, unlock: 3, ex: true, name: '全知', en: 'Omniscience', tx: ['山札からアタックかスキルを1枚探し、0エナジーで2回使って廃棄する。山札をシャッフルする。廃棄。', '山札からアタックかスキルを1枚探し、0エナジーで2回使って廃棄する。山札をシャッフルする。廃棄。'],
  play: async function (k) {
    var cs = await k.pick('draw', 1, 1, '2回使うカードを選択', function (c) { var t = CARDS[c.id].t; return t === 'A' || t === 'S'; });
    k.g.shuffle(k.pc.draw);
    var c = cs[0]; if (!c) return;
    var pc = k.pc, cb = k.cb;
    pc.draw.splice(pc.draw.indexOf(c), 1);
    if (cb.unplayable(pc, c)) { await cb.exhaustCard(pc, c); return; }
    pc.limbo.push(c);
    for (var t = 0; t < 2 && !cb.s.over; t++) {
      var k2 = cb.ctx(pc, c, { x: 0, copy: t > 0, paid: 0 });
      await cb.resolve(k2, null); await cb.afterResolution(pc, c, k2);
    }
    if (pc.limbo.indexOf(c) >= 0) await cb.exhaustCard(pc, c);
  } });
card('Ragnarok', { ch: 'W', t: 'A', r: 'R', c: 3, name: 'ラグナロク', en: 'Ragnarok', tx: ['1ダメージを5回。それぞれ別の対象でもよい。', '1ダメージを6回。それぞれ別の対象でもよい。'],
  play: async function (k) { for (var i = 0; i < U(k, 5, 6) && !k.cb.s.over; i++) { var e = await k.enemy('ラグナロク：' + (i + 1) + '回目の対象'); if (e) await k.atk([1], e); } } });
card('Scrawl', { ch: 'W', t: 'S', r: 'R', c: 1, cu: 0, ex: true, name: '走り書き', en: 'Scrawl', tx: ['カードを5枚引く。廃棄。', 'カードを5枚引く。廃棄。'], play: function (k) { return k.draw(5); } });
card('SpiritShield', { ch: 'W', t: 'S', r: 'R', c: 2, ex: [true, false], name: '精神障壁', en: 'Spirit Shield', tx: ['手札1枚につきブロック1。廃棄。', '手札1枚につきブロック1。'],
  play: function (k) { var n = k.pc.hand.length; return n ? k.cb.gainBlock(k.pc, n * (1 + k.cb.footwork(k.pc, k.card))) : null; } });
card('Vault', { ch: 'W', t: 'S', r: 'R', c: 3, cu: 2, ex: true, name: '飛躍', en: 'Vault', tx: ['保留を持たないカードをすべて捨てる。カードを5枚引く。3エナジーを得る。廃棄。', '保留を持たないカードをすべて捨てる。カードを5枚引く。3エナジーを得る。廃棄。'],
  play: async function (k) { var cs = k.pc.hand.filter(function (c) { return !k.cb.isRetained(k.pc, c); }); await k.cb.discardCards(k.pc, cs, true); await k.draw(5); k.energy(3); } });
card('Wish', { ch: 'W', t: 'S', r: 'R', c: 3, ex: true, name: '願いごと', en: 'Wish', tx: ['1つ選ぶ：筋力1を得る／ブロック10／奇跡×4を得る。廃棄。', '1つ選ぶ：筋力2を得る／ブロック15／奇跡×5を得る。廃棄。'],
  play: async function (k) {
    var a = await k.option([{ id: 'str', label: '筋力' + U(k, 1, 2) + 'を得る' }, { id: 'blk', label: 'ブロック' + U(k, 10, 15) }, { id: 'mir', label: '奇跡×' + U(k, 4, 5) }], '願いごと');
    if (a === 'str') k.str(U(k, 1, 2)); else if (a === 'blk') await k.blk(U(k, 10, 15)); else k.mir(U(k, 4, 5));
  } });

/* ================================================================== COLORLESS (all rewards: Colorless unlock) */
card('Apparition', { ch: 'C', t: 'S', r: 'U', c: 1, eth: [true, false], ex: true, name: '幻姿', en: 'Apparition', tx: ['エーテリアル。このラウンド、失うHPは最大1。廃棄。', 'このラウンド、失うHPは最大1。廃棄。'],
  play: async function (k) { k.pc.capHp = 'round'; k.pc.capHpLost = k.pc.capHpLost || 0; } });
card('Blind', { ch: 'C', t: 'S', r: 'U', c: 0, ex: true, name: '目くらまし', en: 'Blind', tg: 'E', tx: ['脱力1。廃棄。', '脱力×2。廃棄。'], play: function (k) { return k.weak(k.target, U(k, 1, 2)); } });
card('DarkShackles', { ch: 'C', t: 'S', r: 'U', c: 0, ex: true, name: '闇の足枷', en: 'Dark Shackles', tx: ['自分を攻撃しようとしている敵1体につきブロック2。廃棄。', '自分を攻撃しようとしている敵1体につきブロック3。廃棄。'],
  play: function (k) { var n = k.cb.alive().filter(function (e) { return k.cb.intendsToAttack(e, k.pc) > 0; }).length; return n ? k.cb.gainBlock(k.pc, n * (U(k, 2, 3) + k.cb.footwork(k.pc, k.card))) : null; } });
card('DramaticEntrance', { ch: 'C', t: 'A', r: 'U', c: 0, ex: true, name: 'ドラマチックな登場', en: 'Dramatic Entrance', tg: 'R', tx: ['範囲に2ダメージ。戦闘の最初のターンなら+1。廃棄。', '範囲に2ダメージ。戦闘の最初のターンなら+3。廃棄。'],
  play: function (k) { return k.aoe([2 + (k.cb.s.round === 1 ? U(k, 1, 3) : 0)]); } });
card('Finesse', { ch: 'C', t: 'S', r: 'U', c: 0, ex: [true, false], name: 'トリック', en: 'Finesse', tx: ['ブロック1。カードを1枚引く。廃棄。', 'ブロック1。カードを1枚引く。'], play: async function (k) { await k.blk(1); await k.draw(1); } });
card('FlashOfSteel', { ch: 'C', t: 'A', r: 'U', c: 0, ex: [true, false], name: '剣の一閃', en: 'Flash of Steel', tg: 'E', tx: ['1ダメージ。カードを1枚引く。廃棄。', '1ダメージ。カードを1枚引く。'], play: async function (k) { await k.atk([1]); await k.draw(1); } });
card('GoodInstincts', { ch: 'C', t: 'S', r: 'U', c: 0, name: '直感', en: 'Good Instincts', tx: ['任意のプレイヤーにブロック1。', '任意のプレイヤーにブロック2。'], play: function (k) { return anyBlock(k, U(k, 1, 2)); } });
card('Impatience', { ch: 'C', t: 'S', r: 'U', c: 0, name: '焦燥', en: 'Impatience', tx: ['手札にアタックがなければ、カードを2枚引く。', '手札にアタックがなければ、カードを3枚引く。'],
  play: function (k) { if (!k.pc.hand.some(function (c) { return CARDS[c.id].t === 'A'; })) return k.draw(U(k, 2, 3)); } });
card('Madness', { ch: 'C', t: 'S', r: 'U', c: 0, ex: true, ret: [false, true], name: '狂気', en: 'Madness', tx: ['このターン次に使うカードのコストは0。廃棄。', '保留。このターン次に使うカードのコストは0。廃棄。'], play: async function (k) { k.pc.t.madness = true; } });
card('MindBlast', { ch: 'C', t: 'A', r: 'U', c: 2, name: 'マインドブラスト', en: 'Mind Blast', tg: 'E', tx: ['Xダメージ。Xは手札の他のカードの枚数。', 'X+1ダメージ。Xは手札の他のカードの枚数。'], play: function (k) { return k.atk([k.pc.hand.length + U(k, 0, 1)]); } });
card('Panacea', { ch: 'C', t: 'S', r: 'U', c: 0, ret: true, ex: true, name: '万能薬', en: 'Panacea', tx: ['保留。任意のプレイヤーの脱力と弱体化をすべて取り除く。廃棄。', '保留。全プレイヤーの脱力と弱体化をすべて取り除く。廃棄。'],
  play: async function (k) { if (k.up) k.cb.pcs().forEach(function (p) { p.weak = 0; p.vuln = 0; }); else { var to = await k.playerSel('脱力・弱体化を取り除くプレイヤーを選択'); to.weak = 0; to.vuln = 0; } } });
card('Panache', { ch: 'C', t: 'P', r: 'U', c: 0, name: '威風堂々', en: 'Panache', tx: ['ターン終了時：手札が0枚なら任意の列に3ダメージ。', 'ターン終了時：手札が0枚なら任意の列に5ダメージ。'],
  pw: { endTurnDmg: function (cb, pc, inst) { if (!pc.hand.length && cb.alive().length) return cb.damageAnyRow(pc, inst.up ? 5 : 3, '威風堂々：ダメージを与える列を選択'); } } });
card('Purity', { ch: 'C', t: 'S', r: 'U', c: 0, ex: true, name: '浄化', en: 'Purity', tx: ['手札を3枚まで廃棄する。廃棄。', '手札を5枚まで廃棄する。廃棄。'], play: function (k) { return k.exhaustHand(0, U(k, 3, 5), '廃棄するカードを選択（' + U(k, 3, 5) + '枚まで）'); } });
card('SadisticNature', { ch: 'C', t: 'P', r: 'U', c: 1, name: '加虐性', en: 'Sadistic Nature', tx: ['敵にトークンを置くたび、その敵に1ダメージ。', '敵にトークンを置くたび、その敵に2ダメージ。'] });
card('SwiftStrike', { ch: 'C', t: 'A', r: 'U', c: 0, name: 'スイフトストライク', en: 'Swift Strike', tg: 'E', tx: ['1ダメージ。他のプレイヤーと列を入れ替えてもよい。', '2ダメージ。他のプレイヤーと列を入れ替えてもよい。'], play: async function (k) { await k.atk([U(k, 1, 2)]); await swapRows(k); } });
card('ThinkingAhead', { ch: 'C', t: 'S', r: 'U', c: 0, ex: true, name: '予測', en: 'Thinking Ahead', tx: ['カードを2枚引く。手札を1枚山札の一番上に置く。廃棄。', 'カードを3枚引く。手札を1枚山札の一番上に置く。廃棄。'], play: CARDS.Warcry.play });
card('Trip', { ch: 'C', t: 'S', r: 'U', c: 2, ex: true, name: 'つまずき', en: 'Trip', tg: 'E', tx: ['弱体化×2。廃棄。', '弱体化×3。廃棄。'], play: function (k) { return k.vuln(k.target, U(k, 2, 3)); } });
card('Apotheosis', { ch: 'C', t: 'P', r: 'R', c: 2, cu: 1, name: '神格化', en: 'Apotheosis', tx: ['自分のスターターのストライクのダメージ+1、スターターの防御のブロック+1。', '自分のスターターのストライクのダメージ+1、スターターの防御のブロック+1。'] });
card('HandOfGreed', { ch: 'C', t: 'A', r: 'R', c: 2, name: '強欲の手', en: 'Hand of Greed', tg: 'E', tx: ['4ダメージ。10ゴールド以上持っていれば+3。', '4ダメージ。10ゴールド以上持っていれば+5。'], play: function (k) { return k.atk([4 + (k.cb.P(k.pc).gold >= 10 ? U(k, 3, 5) : 0)]); } });
card('MasterOfStrategy', { ch: 'C', t: 'S', r: 'R', c: 0, ex: true, name: '戦略の達人', en: 'Master of Strategy', tx: ['カードを3枚引く。廃棄。', 'カードを4枚引く。廃棄。'], play: function (k) { return k.draw(U(k, 3, 4)); } });
card('Mayhem', { ch: 'C', t: 'P', r: 'R', c: 2, cu: 1, name: '騒乱', en: 'Mayhem', tx: ['1ターンに1回：カードを1枚引き、0エナジーで即座に使う。', '1ターンに1回：カードを1枚引き、0エナジーで即座に使う。'],
  pw: { activate: async function (cb, pc) { var got = await cb.draw(pc, 1); if (got[0]) await cb.playFree(pc, got[0], {}); } } });
card('TheBomb', { ch: 'C', t: 'P', r: 'R', c: 2, name: '爆弾', en: 'The Bomb', tx: ['3ターン後のターン終了時、すべての敵に10ダメージを与え、このカードを廃棄する。', '3ターン後のターン終了時、すべての敵に12ダメージを与え、このカードを廃棄する。'],
  pw: { endTurnDmg: async function (cb, pc, inst) {
    inst.n = (inst.n || 0) + 1;
    if (inst.n >= 3) { await cb.damageAllEnemies(inst.up ? 12 : 10, pc); await cb.removePower(pc, inst, true); }
  } } });

/* ================================================================== GOLDEN TICKET (reward deck only) */
card('Ticket', { ch: 'X', t: 'X', r: 'X', c: null, unplayable: true, name: 'ゴールデンチケット', en: 'Golden Ticket', tx: ['公開したら、レアデッキの一番上のカードも選択肢に加える。', ''] });

/* ================================================================== CURSES (17: deck 13 + Ascender's Bane ×4) */
card('AscendersBane', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, eth: true, noRemove: true, noUpgrade: true, name: '登塔者の災厄', en: "Ascender's Bane", tx: ['使用不可。エーテリアル。デッキから除去できない。', ''] });
card('Clumsy', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, eth: true, copies: 2, name: '不器用', en: 'Clumsy', tx: ['使用不可。エーテリアル。', ''] });
card('Decay', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, copies: 1, name: '腐敗', en: 'Decay', tx: ['使用不可。ターン終了時：手札にあれば1ダメージを受ける。', ''] });
card('Doubt', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, copies: 1, name: '疑念', en: 'Doubt', tx: ['使用不可。ターン終了時：手札にあれば脱力1を得る。', ''] });
card('Injury', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, copies: 2, name: '怪我', en: 'Injury', tx: ['使用不可。', ''] });
card('Pain', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, copies: 1, name: '苦痛', en: 'Pain', tx: ['使用不可。ターン終了時：手札が2枚以下ならHPを1失う。', ''] });
card('Parasite', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, copies: 2, name: '寄生', en: 'Parasite', tx: ['使用不可。デッキから除去されるとHPを2失う。', ''] });
card('Regret', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, ret: true, copies: 2, name: '後悔', en: 'Regret', tx: ['使用不可。保留。', ''] });
card('Shame', { ch: 'X', t: 'C', r: 'X', c: null, unplayable: true, copies: 1, name: '羞恥', en: 'Shame', tx: ['使用不可。ターン終了時：手札にあればブロックを1失う。', ''] });
card('Writhe', { ch: 'X', t: 'C', r: 'X', c: 1, ex: true, copies: 1, name: 'ゆがみ', en: 'Writhe', tx: ['使うと廃棄される。', ''], play: async function () {} });

/* ================================================================== STATUS (Daze supply 10, Status supply 36) */
card('Daze', { ch: 'X', t: 'T', r: 'X', c: null, unplayable: true, eth: true, noUpgrade: true, name: 'めまい', en: 'Daze', tx: ['使用不可。エーテリアル。', ''] });
card('Burn', { ch: 'X', t: 'T', r: 'X', c: null, unplayable: true, noUpgrade: true, name: '火傷', en: 'Burn', tx: ['使用不可。ターン終了時：手札にあれば1ダメージを受ける。', '使用不可。ターン終了時：手札にあれば2ダメージを受ける。'] });
card('Slimed', { ch: 'X', t: 'T', r: 'X', c: 1, ex: true, noUpgrade: true, name: '粘液', en: 'Slimed', tx: ['廃棄。', ''], play: async function () {} });
})(typeof window !== 'undefined' ? window : globalThis);

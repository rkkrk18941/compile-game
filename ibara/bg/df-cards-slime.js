/* スレイザスパイア — Downfall: The Slime Boss (86 printed cards: starter 10 + Bruiser Slime, reward deck 59 + 2 Golden Tickets, rares 16).
   Transcribed from the card faces of the official Downfall public-playtest TTS module (2026-07-23):
   decks 60a205/c6d696 (starter), d31ff8/2da0ab (rewards), dc3185/a15719 (rares); base and upgraded faces in deck order.
   Slime levels: lv = base levels, lvu = upgraded levels. Atoms: hit n, aoe n, blk n, weak, vuln, draw n, hitX, str. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var CARDS = STS.CARDS;
var DF = STS.DF = STS.DF || {};
function card(id, o) { o.id = id; if (o.cu === undefined) o.cu = o.c; o.ch = o.ch || 'S'; o.df = true; CARDS[id] = o; return o; }
function U(k, a, b) { return k.up ? b : a; }
function H(n) { return ['hit', n]; } function AO(n) { return ['aoe', n]; } function B(n) { return ['blk', n]; }

/* Slime card: text is generated from the level table so the rules and the card face cannot disagree. */
function slime(id, o) {
  o.t = 'L';
  o.lvu = o.lvu || o.lv;
  var base = o.tx0 || '', up = o.tx1 != null ? o.tx1 : base;
  o.tx = [DF.slimeText(o, false, base), DF.slimeText(o, true, up)];
  o.play = async function (k) {
    if (o.played) await o.played(k);
    await k.cb.placeSlime(k.pc, k.card, k);
  };
  return card(id, o);
}
DF.slimeCard = slime;
DF.atomText = function (a) {
  switch (a[0]) {
    case 'hit': return a[1] + 'ダメージ';
    case 'aoe': return '範囲に' + a[1] + 'ダメージ';
    case 'blk': return 'ブロック' + a[1];
    case 'weak': return '脱力1';
    case 'vuln': return '弱体化1';
    case 'draw': return 'カードを' + a[1] + '枚引く';
    case 'hitX': return 'Xダメージ';
    case 'str': return 'このスライムに筋力1';
    default: return '';
  }
};
DF.levelText = function (atoms) {
  var out = [], hits = [];
  atoms.forEach(function (a) { if (a[0] === 'hit' || a[0] === 'hitX') hits.push(a); else { if (hits.length) { out.push(DF.hitsText(hits)); hits = []; } out.push(DF.atomText(a)); } });
  if (hits.length) out.push(DF.hitsText(hits));
  return out.join('・');
};
DF.hitsText = function (hits) {
  var same = hits.every(function (h) { return h[0] === hits[0][0] && h[1] === hits[0][1]; });
  if (hits.length > 1 && same) return DF.atomText(hits[0]) + 'を' + hits.length + '回';
  return hits.map(DF.atomText).join('・');
};
DF.slimeText = function (o, up, extra) {
  var lv = up ? o.lvu : o.lv;
  var s = 'スライム。' + lv.map(function (atoms, i) { return 'Lv' + (i + 1) + '：' + DF.levelText(atoms); }).join('／') + '。';
  if (lv.some(function (atoms) { return atoms.some(function (a) { return a[0] === 'hitX'; }); })) s += 'Xは場のスライムの数。';
  return s + (extra ? extra : '');
};

/* ---------------------------------------------------------------- starter */
card('StrikeS', { t: 'A', r: 'S', c: 1, name: 'ストライク', en: 'Strike', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: function (k) { return k.atk([U(k, 1, 2)]); } });
card('DefendS', { t: 'S', r: 'S', c: 1, name: '防御', en: 'Defend', tx: ['ブロック1。', '任意のプレイヤーにブロック2。'],
  play: async function (k) { var ap = k.cb.powSum(k.pc, 'Apotheosis', function () { return 1; }); if (!k.up) await k.blk(1 + ap); else { var to = await k.playerSel('ブロックを与えるプレイヤーを選択'); await k.blk(2 + ap, to); } } });
card('SlimeSlap', { t: 'A', r: 'S', c: 2, name: 'スライムスラップ', en: 'Slime Slap', tg: 'E', tx: ['2ダメージ。スライムを1体成長させる。', '4ダメージ。スライムを1体成長させる。'],
  play: async function (k) { await k.atk([U(k, 2, 4)]); await k.grow(1); } });
card('Lick', { t: 'S', r: 'S', c: 1, name: 'なめる', en: 'Lick', tx: ['スライム1体に命令する。', '異なるスライム2体まで命令する。'],
  play: function (k) { return k.command(U(k, 1, 2)); } });
slime('BruiserSlime', { r: 'S', c: null, noUpgrade: true, noRemove: true, name: 'ブルーザースライム', en: 'Bruiser Slime', bruiser: true,
  lv: [[H(1)], [H(2)]], endTurn: true, tx0: 'ターン終了時：このスライムに命令する。戦闘開始時から場にあり、デッキには入らない。' });

/* ---------------------------------------------------------------- slimes (reward deck) */
slime('MassiveSlime', { r: 'U', c: 3, name: '巨大スライム', en: 'Massive Slime', tg: 'E',
  lv: [[H(1), B(1)], [H(2), B(1)], [H(2), B(2)]], lvu: [[H(2), B(1)], [H(3), B(1)], [H(3), B(2)]],
  tx0: 'プレイした時：4ダメージ・ブロック2。', played: async function (k) { await k.atk([4], null, { slimeCard: true }); await k.blk(2); } });
slime('LeechingSlime', { r: 'U', c: 0, name: '吸血スライム', en: 'Leeching Slime',
  lv: [[H(1)], [H(2)], [H(3)]], lvu: [[H(1)], [H(3)], [H(5)]], onGrow: true, tx0: 'スライムを成長させるたび、このスライムに命令する。' });
slime('ScrappySlime', { r: 'C', c: 1, name: 'けんかスライム', en: 'Scrappy Slime', tg: 'E',
  lv: [[H(2)], [H(3)], [H(4)]], lvu: [[H(3)], [H(4)], [H(5)]], tx0: 'プレイした時：2ダメージ。', played: function (k) { return k.atk([2], null, { slimeCard: true }); } });
slime('SpikeSlimeP', { r: 'U', c: 1, name: 'スパイクスライム', en: 'Spike Slime',
  lv: [[AO(1)], [AO(1)], [AO(2)]], lvu: [[AO(1)], [AO(2)], [AO(3)]], endTurn: true, tx0: 'ターン終了時：このスライムに命令する。' });
slime('SpreadingSlime', { r: 'U', c: 1, name: '拡散スライム', en: 'Spreading Slime',
  lv: [[H(2)], [H(3)], [H(4)]], lvu: [[H(3)], [H(4)], [H(5)]], onSpend2: true, tx0: 'カード1枚に2エナジー以上を払うたび、このスライムに命令する。' });
slime('StickySlime', { r: 'U', c: 1, name: 'ねばねばスライム', en: 'Sticky Slime', ret: true, tg: 'R',
  lv: [[H(2)], [H(3)], [H(3), ['weak']]], lvu: [[H(3)], [H(4)], [H(4), ['weak']]],
  tx0: '保留。プレイした時：範囲に脱力1。', played: async function (k) { var ts = k.cb.aoeTargets(k.row); for (var i = 0; i < ts.length; i++) await k.weak(ts[i], 1); } });
slime('TauntingSlime', { r: 'C', c: 2, name: '挑発スライム', en: 'Taunting Slime',
  lv: [[B(1)], [B(2)], [B(3)]], tx0: 'プレイした時：任意のプレイヤーにブロック3。', tx1: 'プレイした時：任意のプレイヤーにブロック4。',
  played: async function (k) { var to = await k.playerSel('ブロックを与えるプレイヤーを選択'); await k.blk(U(k, 3, 4), to); } });
slime('PsychicSlime', { r: 'U', c: 1, name: 'サイキックスライム', en: 'Psychic Slime',
  lv: [[['draw', 2]], [['draw', 3]], [['draw', 4]]], tx0: 'プレイした時：カードを2枚引く。', tx1: 'プレイした時：カードを3枚引く。',
  played: function (k) { return k.draw(U(k, 2, 3)); } });
slime('MuscleSlime', { r: 'U', c: 2, name: 'マッスルスライム', en: 'Muscle Slime',
  lv: [[H(2)], [H(4)], [H(6)]], lvu: [[H(1), H(1)], [H(2), H(2)], [H(3), H(3)]], onStr: true, tx0: '1ターンに1回：このスライムが筋力を得た時、命令する。' });

/* ---------------------------------------------------------------- attacks */
card('ComboTackle', { t: 'A', r: 'U', c: 2, tackle: true, name: 'コンボタックル', en: 'Combo Tackle', tg: 'E', tx: ['2ダメージ。異なるスライム2体まで命令する。', '3ダメージ。異なるスライム3体まで命令する。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); await k.command(U(k, 2, 3)); } });
card('OpeningTackle', { t: 'A', r: 'C', c: 1, tackle: true, name: '先制タックル', en: 'Opening Tackle', tg: 'E', tx: ['1ダメージ。スライム1体に命令する。', '2ダメージ。スライム1体に命令する。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); await k.command(1); } });
card('ForwardTackle', { t: 'A', r: 'C', c: 2, tackle: true, ret: true, name: '前進タックル', en: 'Forward Tackle', tg: 'E', tx: ['保留。3ダメージ。ブロック1。', '保留。4ダメージ。ブロック2。'],
  play: async function (k) { await k.atk([U(k, 3, 4)]); await k.blk(U(k, 1, 2)); } });
card('FlameTackle', { t: 'A', r: 'C', c: 2, tackle: true, name: '炎のタックル', en: 'Flame Tackle', tg: 'R', tx: ['範囲に2ダメージ。スライム1体に命令する。', '範囲に3ダメージ。スライム1体に命令する。'],
  play: async function (k) { await k.aoe([U(k, 2, 3)]); await k.command(1); } });
card('HungryTackle', { t: 'A', r: 'U', c: 1, tackle: true, name: '空腹タックル', en: 'Hungry Tackle', tg: 'E', tx: ['2ダメージ。手札を1枚廃棄する。それがコスト2以上なら2エナジーを得る。', '3ダメージ。手札を1枚廃棄する。それがコスト2以上なら3エナジーを得る。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); var cs = await k.exhaustHand(1, 1, '廃棄するカードを選択'); if (cs[0] && DF.printedCost(k.cb, cs[0]) >= 2) k.energy(U(k, 2, 3)); } });
card('RavenousTackle', { t: 'A', r: 'U', c: 3, tackle: true, name: '貪欲タックル', en: 'Ravenous Tackle', tg: 'E', tx: ['5ダメージ。スライム1体を2回成長させる。', '7ダメージ。スライム1体を2回成長させる。'],
  play: async function (k) { await k.atk([U(k, 5, 7)]); await k.grow(1, { times: 2 }); } });
card('RelentlessTackle', { t: 'A', r: 'U', c: 2, tackle: true, name: '執拗なタックル', en: 'Relentless Tackle', tg: 'E', tx: ['2ダメージ。このターン、いずれかのプレイヤーが次に使うアタックのコストは0。', '3ダメージ。このターン、いずれかのプレイヤーが次に使うアタックのコストは0。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); k.cb.s.freeAttack = { round: k.cb.s.round, from: k.card.u }; } });
card('SpearTackle', { t: 'A', r: 'U', c: 2, tackle: true, name: '槍のタックル', en: 'Spear Tackle', tg: 'E', tx: ['2ダメージを2回。', '3ダメージを2回。'],
  play: function (k) { var n = U(k, 2, 3); return k.atk([n, n]); } });
card('PileOn', { t: 'A', r: 'U', c: 1, name: '一斉にかかれ！', en: 'Pile On!', tg: 'E', tx: ['場のスライム1体につき1ダメージ（ヒットを分けて与える）。', '場のスライム1体につき2ダメージ（ヒットを分けて与える）。'],
  play: function (k) { var n = k.cb.slimesOf(k.pc).length, d = []; for (var i = 0; i < n; i++) d.push(U(k, 1, 2)); return d.length ? k.atk(d) : null; } });
card('LeechEnergy', { t: 'A', r: 'C', c: 0, name: 'エネルギー吸収', en: 'Leech Energy', tg: 'E', tx: ['1ダメージ。手札に保留のカードがあればブロック1。', '2ダメージ。手札に保留のカードがあればブロック1。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); if (DF.retainInHand(k.cb, k.pc, k.card) > 0) await k.blk(1); } });
card('GlopChop', { t: 'A', r: 'U', c: 1, cu: 0, name: 'ドロドロチョップ', en: 'Glop Chop', tg: 'E', tx: ['2ダメージ。手札に「タックル」があれば弱体化1。', '2ダメージ。手札に「タックル」があれば弱体化1。'],
  play: async function (k) { var t = DF.tacklesInHand(k.pc, k.card) > 0; await k.atk([2]); if (t) await k.vuln(k.target, 1); } });
card('SmotheringTackle', { t: 'A', r: 'U', c: 2, tackle: true, ret: true, name: '窒息タックル', en: 'Smothering Tackle', tg: 'E', tx: ['保留。2ダメージ。弱体化1。', '保留。4ダメージ。弱体化1。'],
  play: async function (k) { await k.atk([U(k, 2, 4)]); await k.vuln(k.target, 1); } });
card('DiveTackle', { t: 'A', r: 'U', c: 1, tackle: true, ex: true, name: 'ダイブタックル', en: 'Dive Tackle', tg: 'E', tx: ['4ダメージ。廃棄。', '6ダメージ。廃棄。'], play: function (k) { return k.atk([U(k, 4, 6)]); } });
card('TongueLash', { t: 'A', r: 'U', c: 1, ex: true, name: '舌の鞭', en: 'Tongue Lash', tg: 'E', tx: ['1ダメージ。スライム1体に筋力1を与える。廃棄。', '3ダメージ。スライム1体に筋力1を与える。廃棄。'],
  play: async function (k) { await k.atk([U(k, 1, 3)]); await k.slimeStr(1); } });
card('FeedingFrenzy', { t: 'A', r: 'R', c: 2, name: '狂乱の食事', en: 'Feeding Frenzy', tg: 'E', tx: ['2ダメージ。異なるスライム3体まで成長させる。', '2ダメージ。異なるスライム5体まで成長させる。'],
  play: async function (k) { await k.atk([2]); await k.grow(U(k, 3, 5), { different: true }); } });
card('ViciousTackle', { t: 'A', r: 'R', c: 4, tackle: true, name: '凶悪タックル', en: 'Vicious Tackle', tg: 'E', tx: ['8ダメージ。手札のほかの「タックル」1枚につきコスト−1。', '12ダメージ。手札のほかの「タックル」1枚につきコスト−1。'],
  costFn: function (cb, pc, c, cost) { return cost - DF.tacklesInHand(pc, c); },
  play: function (k) { return k.atk([U(k, 8, 12)]); } });

/* ---------------------------------------------------------------- skills */
card('Growth', { t: 'S', r: 'C', c: 2, name: '成長促進', en: 'Growth', tx: ['ブロック2。スライムを1体成長させる。', 'ブロック3。スライムを1体成長させる。'],
  play: async function (k) { await k.blk(U(k, 2, 3)); await k.grow(1); } });
card('Reformation', { t: 'S', r: 'C', c: 1, ex: [true, false], name: '再形成', en: 'Reformation', tx: ['スライムを1体成長させる。廃棄。', 'スライムを1体成長させる。'], play: function (k) { return k.grow(1); } });
card('NibbleAndLick', { t: 'S', r: 'C', c: 2, ret: [false, true], name: 'かじってなめる', en: 'Nibble and Lick', tx: ['スライムを1体成長させ、そのスライムに命令する。', '保留。スライムを1体成長させ、そのスライムに命令する。'],
  play: async function (k) { var s = await k.grow(1); if (s && s[0]) await k.command(1, { only: s[0] }); } });
card('Recollect', { t: 'S', r: 'C', c: 1, ret: true, name: '思い出す', en: 'Recollect', tx: ['保留。カードを2枚引く。', '保留。カードを3枚引く。'], play: function (k) { return k.draw(U(k, 2, 3)); } });
card('Slippery', { t: 'S', r: 'C', c: 2, name: 'つるつる', en: 'Slippery', tx: ['ブロック2。このターン、ほかのカード1枚に2エナジー以上を払っていればコスト0。', 'ブロック3。このターン、ほかのカード1枚に2エナジー以上を払っていればコスト0。'],
  costFn: function (cb, pc, c, cost) { return pc.t && pc.t.spent2 ? 0 : cost; },
  play: function (k) { return k.blk(U(k, 2, 3)); } });
card('ProtectTheBoss', { t: 'S', r: 'C', c: 1, ret: true, name: 'ボスを守れ', en: 'Protect the Boss', tx: ['保留。ブロック2。', '保留。ブロック3。'], play: function (k) { return k.blk(U(k, 2, 3)); } });
card('Spit', { t: 'S', r: 'C', c: 1, name: '吐きかけ', en: 'Spit', tx: ['カードを1枚引く。スライム1体に命令する。', 'カードを2枚引く。スライム1体に命令する。'],
  play: async function (k) { await k.draw(U(k, 1, 2)); await k.command(1); } });
card('JustDesserts', { t: 'S', r: 'U', c: 0, ret: true, name: '当然の報い', en: 'Just Desserts', tx: ['保留。このターン、次に使うパワーかスライムのコスト−1。', '保留。このターン、次に使うパワーかスライムのコストは0。'],
  play: async function (k) { k.pc.t.desserts = k.up ? 'zero' : 'less'; } });
card('Repurpose', { t: 'S', r: 'U', c: 0, ret: true, ex: true, name: '再利用', en: 'Repurpose', tx: ['保留。1エナジーを得る。廃棄。', '保留。2エナジーを得る。廃棄。'], play: async function (k) { k.energy(U(k, 1, 2)); } });
card('GoopSpray', { t: 'S', r: 'U', c: 1, name: '粘液噴射', en: 'Goop Spray', tg: 'E', tx: ['脱力1。カードを1枚引く。', '脱力1。カードを2枚引く。'],
  play: async function (k) { await k.weak(k.target, 1); await k.draw(U(k, 1, 2)); } });
card('QuickSnack', { t: 'S', r: 'U', c: 1, name: 'つまみ食い', en: 'Quick Snack', tx: ['ブロックX+1。Xは場のスライムの最高レベル。', 'ブロックX+2。Xは場のスライムの最高レベル。'],
  play: function (k) { var x = 0; k.cb.slimesOf(k.pc).forEach(function (s) { x = Math.max(x, s.lv); }); return k.blk(x + U(k, 1, 2)); } });
card('ItLooksTasty', { t: 'S', r: 'U', c: 1, name: 'おいしそう', en: 'It Looks Tasty', tx: ['ブロック1。手札を1枚廃棄する。それがコスト2以上ならスライムを1体成長させる。', 'ブロック2。手札を1枚廃棄する。それがコスト2以上ならスライムを1体成長させる。'],
  play: async function (k) { await k.blk(U(k, 1, 2)); var cs = await k.exhaustHand(1, 1, '廃棄するカードを選択'); if (cs[0] && DF.printedCost(k.cb, cs[0]) >= 2) await k.grow(1); } });
card('DivideAndConquer', { t: 'S', r: 'U', c: 'X', name: '分割統治', en: 'Divide & Conquer', tx: ['異なるスライムX体に命令する。', '異なるスライムX+1体に命令する。Xは0にできない。'],
  xMin: function (c) { return c.up ? 1 : 0; },
  can: function (cb, pc, c) { return c.up && pc.en + pc.mir < 1 ? 'Xを0にはできません。' : null; },
  play: function (k) { var n = k.x + (k.up ? 1 : 0); return n > 0 ? k.command(n) : null; } });
card('Digest', { t: 'S', r: 'U', c: 3, ex: [true, false], name: '消化', en: 'Digest', tx: ['スライム1体に筋力1を与える。手札の保留のカード1枚につきコスト−1。廃棄。', 'スライム1体に筋力1を与える。手札の保留のカード1枚につきコスト−1。'],
  costFn: function (cb, pc, c, cost) { return cost - DF.retainInHand(cb, pc, c); },
  play: function (k) { return k.slimeStr(1); } });
card('LivingWall', { t: 'S', r: 'U', c: 2, name: '生きた壁', en: 'Living Wall', tx: ['ブロック2。場のスライム1体につき+ブロック1。', 'ブロック3。場のスライム1体につき+ブロック1。'],
  play: function (k) { return k.blk(U(k, 2, 3) + k.cb.slimesOf(k.pc).length); } });
card('HauntingLick', { t: 'S', r: 'U', c: 1, ret: true, name: '不気味ななめ回し', en: 'Haunting Lick', tx: ['保留。スライム1体に命令する。', '保留。異なるスライム2体まで命令する。'],
  play: function (k) { return k.command(U(k, 1, 2)); } });
card('Gluttony', { t: 'S', r: 'U', c: 2, ret: [false, true], name: '暴食', en: 'Gluttony', tx: ['スライム1体に筋力1を与える。', '保留。スライム1体に筋力1を与える。'], play: function (k) { return k.slimeStr(1); } });
card('SlimeBrawl', { t: 'S', r: 'U', c: 1, name: 'スライムの乱闘', en: 'Slime Brawl', tx: ['スライム1体に筋力1を与え、命令する。ターン終了時にその筋力を取り除く。', 'スライム1体に筋力2を与え、命令する。ターン終了時にその筋力を取り除く。'],
  play: async function (k) { var s = await k.slimeStr(U(k, 1, 2), { temp: true }); if (s) await k.command(1, { only: s }); } });
card('OozeBath', { t: 'S', r: 'U', c: 2, cu: 1, name: '粘液風呂', en: 'Ooze Bath', tx: ['スライム1体にX回命令する。Xは手札の保留のカードの枚数。', 'スライム1体にX回命令する。Xは手札の保留のカードの枚数。'],
  play: async function (k) { var x = DF.retainInHand(k.cb, k.pc, k.card); if (x > 0) await k.command(1, { times: x }); } });
card('Delegate', { t: 'S', r: 'U', c: 2, ex: true, name: '委任', en: 'Delegate', tx: ['ブロック3。スライム1体に命令する。廃棄。', 'ブロック5。スライム1体に命令する。廃棄。'],
  play: async function (k) { await k.blk(U(k, 3, 5)); await k.command(1); } });
card('SlimeTap', { t: 'S', r: 'R', c: 1, cu: 0, ex: true, name: 'スライム搾り', en: 'Slime Tap', tx: ['スライムを1体選ぶ。そのレベルと同じ枚数のカードを引き、同じだけエナジーを得る。廃棄。', 'スライムを1体選ぶ。そのレベルと同じ枚数のカードを引き、同じだけエナジーを得る。廃棄。'],
  play: async function (k) { var s = await k.cb.chooseSlime(k.pc, 'スライム搾り：スライムを選択'); if (!s) return; await k.draw(s.lv); k.energy(s.lv); } });
card('Overexert', { t: 'S', r: 'R', c: 1, ex: true, name: '力みすぎ', en: 'Overexert', tx: ['カードを2枚引き、手札1枚を0エナジーで使う。アタックなら2回使う。廃棄。', 'カードを3枚引き、手札1枚を0エナジーで使う。アタックなら2回使う。廃棄。'],
  play: async function (k) {
    await k.draw(U(k, 2, 3));
    var cb = k.cb, pc = k.pc;
    var cs = await k.pick('hand', 1, 1, '力みすぎ：0エナジーで使うカードを選択', function (c) { return !cb.unplayable(pc, c) && c !== k.card; });
    if (!cs[0]) return;
    var atk = STS.cdef(cs[0]).t === 'A';
    if (atk) pc.t.overexert = (pc.t.overexert || 0) + 1;
    await cb.playFree(pc, cs[0], {});
  } });
card('Replication', { t: 'S', r: 'R', c: 1, ex: true, name: '複製', en: 'Replication', tx: ['山札からスライム1枚を探し、0エナジーで使う。山札をシャッフルする。廃棄。', '山札からスライム1枚を探し、0エナジーで使って成長させる。山札をシャッフルする。廃棄。'],
  play: async function (k) {
    var cb = k.cb, pc = k.pc;
    var cs = await k.pick('draw', 1, 1, '複製：使うスライムを選択', function (c) { return STS.cdef(c).t === 'L'; });
    if (cs[0]) { await cb.playFree(pc, cs[0], {}); if (k.up) { var inst = cb.slimesOf(pc).filter(function (s) { return s.u === cs[0].u; })[0]; if (inst) await cb.growSlimeInst(pc, inst); } }
    cb.g.shuffle(pc.draw);
  } });
card('RallyTheTroops', { t: 'S', r: 'R', c: 2, ret: [false, true], name: '兵を集めろ', en: 'Rally the Troops', tx: ['すべてのスライムに命令する。', '保留。すべてのスライムに命令する。'],
  play: function (k) { return k.command('all'); } });

/* ---------------------------------------------------------------- powers */
card('Recklessness', { t: 'P', r: 'U', c: 1, name: '無謀', en: 'Recklessness', tx: ['自分の「タックル」のヒット1つにつきダメージ+2。', '自分の「タックル」のヒット1つにつきダメージ+3。'] });
card('PrepareCrush', { t: 'P', r: 'U', c: 3, ret: true, name: '押し潰す準備', en: 'Prepare Crush', tx: ['保留。ターン開始時：15ダメージを与え、このカードを捨てる。', '保留。ターン開始時：20ダメージを与え、このカードを捨てる。'],
  pw: { startTurn: async function (cb, pc, inst) { if (cb.alive().length) await cb.damageTarget(pc, inst.up ? 20 : 15, '押し潰す準備：対象の敵を選択', '押し潰す準備'); await cb.removePower(pc, inst, false); } } });
card('GoopArmor', { t: 'P', r: 'U', c: 1, name: '粘液の鎧', en: 'Goop Armor', tx: ['「タックル」を使うたび、ブロック1。', '「タックル」を使うたび、ブロック2。'] });
card('RainOfGoop', { t: 'P', r: 'R', c: 'X', name: '粘液の雨', en: 'Rain of Goop', tx: ['このカードに筋力Xを置く。ターン開始時：その筋力1を自分かスライムに移す。筋力がなくなったら廃棄。', 'このカードに筋力X+1を置く。ターン開始時：その筋力1を自分かスライムに移す。筋力がなくなったら廃棄。'],
  play: async function (k) { k.powerData = { n: k.x + (k.up ? 1 : 0) }; },
  pw: { startTurn: async function (cb, pc, inst) {
    if ((inst.v || 0) <= 0) { await cb.removePower(pc, inst, true); return; }
    var opts = [{ id: 'me', label: '自分（' + cb.P(pc).name + '）に筋力1' }].concat(cb.slimesOf(pc).map(function (s) { return { id: 's' + s.u, label: STS.CARDS[s.id].name + '（Lv' + s.lv + '）に筋力1' }; }));
    var a = opts.length === 1 ? 'me' : await cb.ask(pc, { type: 'option', title: '粘液の雨：筋力を移す先', options: opts });
    inst.v--;
    if (a && a !== 'me') { var s = cb.slimesOf(pc).filter(function (x) { return 's' + x.u === a; })[0]; if (s) await cb.giveSlimeStr(pc, s, 1); else cb.gainStr(pc, 1); }
    else cb.gainStr(pc, 1);
    if (inst.v <= 0) await cb.removePower(pc, inst, true);
  } } });
card('ConsultPlaybook', { t: 'P', r: 'R', c: 1, name: '作戦帳を開く', en: 'Consult Playbook', tx: ['1ターンに1回：「タックル」を使った時、カードを1枚引き、1エナジーを得る。', '1ターンに1回：「タックル」を使った時、カードを2枚引き、1エナジーを得る。'] });
card('DuplicatedForm', { t: 'P', r: 'R', c: 3, cu: 2, name: '複製体', en: 'Duplicated Form', tx: ['1ターンに1回：このターン次に使うアタックを2回使う。', '1ターンに1回：このターン次に使うアタックを2回使う。'] });
card('MinionMaster', { t: 'P', r: 'R', c: 2, cu: 1, name: '手下の主', en: 'Minion Master', tx: ['ターン開始時：スライム1体に命令する。', 'ターン開始時：スライム1体に命令する。'],
  pw: { startTurn: function (cb, pc) { return cb.commandSlimes(pc, 1, {}); } } });
card('DarklingDuo', { t: 'P', r: 'R', c: 1, cu: 0, name: 'ダークリングの相棒', en: 'Darkling Duo', tx: ['保留のカードを使うたび、ブルーザースライムに命令する。', '保留のカードを使うたび、ブルーザースライムに命令する。'] });
card('ShapeOfPuddle', { t: 'P', r: 'R', c: 3, name: '水たまりの姿', en: 'Shape of Puddle', tx: ['いつでも：キューブを1つ置いてブロック2を得る。キューブが3つになったら廃棄。', 'いつでも：キューブを1つ置いてブロック2を得る。キューブが4つになったら廃棄。'],
  pw: { anyTime: true, activate: async function (cb, pc, inst) { inst.n = (inst.n || 0) + 1; await cb.gainBlock(pc, 2); if (inst.n >= (inst.up ? 4 : 3)) await cb.removePower(pc, inst, true); } } });
card('LevelUp', { t: 'P', r: 'R', c: 2, cu: 1, name: 'レベルアップ', en: 'Level Up', tx: ['ターン開始時：スライムを1体成長させる。', 'ターン開始時：スライムを1体成長させる。'],
  pw: { startTurn: function (cb, pc) { return cb.growSlimes(pc, 1, {}); } } });

/* ---------------------------------------------------------------- rare slimes */
slime('RoyalSlime', { r: 'R', c: 2, cu: 1, name: 'ロイヤルスライム', en: 'Royal Slime', lv: [[['hitX']], [['hitX'], H(2)], [['hitX'], ['hitX']]] });
slime('EvolutionSlime', { r: 'R', c: 1, cu: 0, name: '進化スライム', en: 'Evolution Slime',
  lv: [[H(2)], [H(4)], [AO(4)], [AO(4), B(2)], [AO(6), B(2)], [AO(6), B(2), ['str']]] });
slime('ArmoredSlime', { r: 'R', c: 1, name: '鎧スライム', en: 'Armored Slime', oncePerTurn: true,
  lv: [[B(3)], [B(3), ['vuln']], [B(5), ['vuln']]], lvu: [[B(4)], [B(4), ['vuln']], [B(6), ['vuln']]], tx0: 'このスライムには1ターンに1回だけ命令できる。' });

DF.CHAR_CARDS = DF.CHAR_CARDS || {};
DF.CHAR_CARDS.S = { tickets: 2 };
DF.addChar('S');
})(typeof window !== 'undefined' ? window : globalThis);

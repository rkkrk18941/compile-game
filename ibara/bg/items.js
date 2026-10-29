/* スレイザスパイア — relics (58), boss relics (20), special relics, potions (21 kinds / 29 cards) and
   character abilities, as printed in the board game. Prices are the gold printed on each card. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var R = STS.RELICS = {}, P = STS.POTIONS = {}, A = STS.ABILITIES = {};
function relic(id, o) { o.id = id; R[id] = o; return o; }
function potion(id, o) { o.id = id; P[id] = o; return o; }

/* ---------- shared helpers ---------- */
function onceCombat(cb, pc, r) { return r.usedCombat ? 'この戦闘ではもう使いました。' : null; }
async function dmgTarget(cb, pc, n, title) { await cb.damageTarget(pc, n, title); }
async function blockAnyPlayer(cb, pc, n) { var to = await cb.choosePlayer(pc, 'ブロックを与えるプレイヤーを選択'); await cb.gainBlock(to, n); }
async function useNow(g, p, r) { g.loseRelic(p, r.id); g.returnRelic(r.id); }
function zeroAttack(cb, pc, n, title) {
  // A separate 0-cost Attack with one HIT (Ninja Scroll, Cunning Potion).
  return (async function () {
    var e = await cb.chooseEnemy(pc, title);
    if (!e) return;
    await cb.attack(pc, e, [n], { zeroCost: true, card: null, relicAttack: true, wrist: cb.has(pc, 'WristBlade'), src: String(title).split('：')[0] });
    await cb.afterResolution(pc, { id: 'Shiv' }, { shiv: true, d: { t: 'A' }, target: e });
    pc.t.attacksInclShiv = (pc.t.attacksInclShiv || 0) + 1;
  })();
}

/* ================================================================== RELICS (58) */
relic('Akabeko', { type: 'normal', price: 6, name: '赤べこ', tx: '戦闘中1回：次のアタック1回のみ筋力1を得る。', once: 'combat',
  canActivate: onceCombat, activate: async function (cb, pc, r) { r.usedCombat = true; var got = cb.gainStr(pc, 1); pc.akabeko = (pc.akabeko || 0) + got; } });
relic('Anchor', { type: 'normal', price: 6, name: '錨', tx: '戦闘開始時：ブロック2。', startCombat: function (cb, pc) { return cb.gainBlock(pc, 2); } });
relic('BagOfPreparation', { type: 'normal', price: 7, name: 'バックパック', tx: '戦闘開始時：カードを2枚引く。', startCombat: function (cb, pc) { return cb.draw(pc, 2); } });
relic('BirdFacedUrn', { type: 'normal', price: 9, name: '鳥頭壺', tx: 'パワーを使った時：ブロック1。', onPower: function (cb, pc) { return cb.gainBlock(pc, 1); } });
relic('BloodVial', { type: 'normal', price: 6, name: '血のガラス瓶', tx: '戦闘開始時：HPを1回復する。', startCombat: function (cb, pc) { cb.healPlayer(pc, 1); } });
relic('BlueCandle', { type: 'normal', price: 7, name: '青いロウソク', tx: '戦闘中1回：手札を2枚まで廃棄する。', once: 'combat', canActivate: onceCombat,
  activate: async function (cb, pc, r) { r.usedCombat = true; var cs = await cb.pickCards(pc, 'hand', 0, 2, '青いロウソク：廃棄するカードを選択（2枚まで）'); for (var i = 0; i < cs.length; i++) await cb.exhaustCard(pc, cs[i]); } });
relic('Calipers', { type: 'normal', price: 6, name: 'カリパス', tx: '戦闘中1回：前のターンに残ったブロックを保持する（次のターン開始時にブロックが取り除かれない）。', once: 'combat', canActivate: onceCombat,
  activate: async function (cb, pc, r) { r.usedCombat = true; pc.keepBlock = true; cb.log('カリパス：次のターンもブロックを保持'); } });
relic('CaptainsWheel', { type: 'normal', price: 8, name: '船長の舵輪', tx: 'ダイス3：ブロック3。', die: [{ f: [3], fx: function (cb, pc) { return cb.gainBlock(pc, 3); } }] });
relic('CentennialPuzzle', { type: 'normal', price: 8, name: '百年パズル', tx: '戦闘中1回：この戦闘でHPを失っていれば、カードを3枚引く。', once: 'combat',
  canActivate: function (cb, pc, r) { return r.usedCombat ? 'この戦闘ではもう使いました。' : !pc.c.lostHp ? 'この戦闘でまだHPを失っていません。' : null; },
  activate: async function (cb, pc, r) { r.usedCombat = true; await cb.draw(pc, 3); } });
relic('CharonsAshes', { type: 'normal', price: 7, name: 'カロンの遺灰', tx: 'ダイス1・2：手札を1枚廃棄して2ダメージを与えてもよい。',
  die: [{ f: [1, 2], fx: async function (cb, pc) {
    if (!pc.hand.length || !cb.alive().length) return;
    var cs = await cb.pickCards(pc, 'hand', 0, 1, 'カロンの遺灰：廃棄するカードを選択（任意）');
    if (!cs.length) return;
    await cb.exhaustCard(pc, cs[0]);
    await dmgTarget(cb, pc, 2, 'カロンの遺灰：対象の敵を選択');
  } }] });
relic('DeadBranch', { type: 'normal', price: 9, name: '古木の枝', tx: '戦闘中1回：廃棄札1枚につきカードを1枚引く。', once: 'combat', canActivate: onceCombat,
  activate: async function (cb, pc, r) { r.usedCombat = true; if (pc.exh.length) await cb.draw(pc, pc.exh.length); } });
relic('DollysMirror', { type: 'normal', price: 7, name: 'ドリーの鏡', tx: 'ダイス1：ダイスレリックの能力を1つ発動する。その持ち主が効果を得る。',
  die: [{ f: [1], noCopy: true, fx: function (cb, pc) { return cb.g.triggerDieAbility(cb, pc, { anyOwner: true, exclude: 'DollysMirror', title: 'ドリーの鏡：発動するダイスレリックの能力を選択' }); } }] });
relic('DuVuDoll', { type: 'normal', price: 7, name: 'ドゥーヴー人形', tx: '呪いを引いた時、筋力1を得る。ターン終了時にその筋力を失う。', onDrawCurse: function (cb, pc) { cb.tempStr(pc, 1); } });
relic('Duality', { type: 'normal', price: 8, name: '陰陽一体', tx: 'ダイス2：ブロック2。ダイス4：2ダメージを与える。',
  die: [{ f: [2], fx: function (cb, pc) { return cb.gainBlock(pc, 2); } }, { f: [4], fx: function (cb, pc) { return dmgTarget(cb, pc, 2, '陰陽一体：対象の敵を選択'); } }] });
relic('GamblingChip', { type: 'normal', price: 6, name: 'ギャンブル用チップ', tx: '部屋ごとに1回：ダイスを振り直す。', dieModLabel: '振り直す',
  dieMod: function (g, cur) { return g.rand(6) + 1; } });
relic('GoldenEye', { type: 'normal', price: 7, name: '黄金の目', tx: '戦闘中1回：占術3。', once: 'combat', canActivate: onceCombat, activate: async function (cb, pc, r) { r.usedCombat = true; await cb.scry(pc, 3); } });
relic('GoldenIdol', { type: 'normal', price: 4, name: '黄金の偶像', tx: '戦闘終了時：1ゴールドを得る。', endCombat: function (cb, pc) { cb.g.gainGold(cb.P(pc), 1); } });
relic('GremlinHorn', { type: 'normal', price: 8, name: 'グレムリンの角', tx: 'ダイス4：カードを1枚引く。ダイス5：1エナジーを得る。',
  die: [{ f: [4], fx: function (cb, pc) { return cb.draw(pc, 1); } }, { f: [5], fx: function (cb, pc) { cb.gainEnergy(pc, 1); } }] });
relic('HappyFlower', { type: 'normal', price: 6, name: 'ハッピーフラワー', tx: 'ダイス3・4：1エナジーを得る。', die: [{ f: [3, 4], fx: function (cb, pc) { cb.gainEnergy(pc, 1); } }] });
relic('HornCleat', { type: 'normal', price: 6, name: 'ホーンクリート', tx: 'ダイス1・2：ブロック1。', die: [{ f: [1, 2], fx: function (cb, pc) { return cb.gainBlock(pc, 1); } }] });
relic('IceCream', { type: 'normal', price: 7, name: 'アイスクリーム', tx: 'ターン開始時：前のターンに残ったエナジーを得る（最大6）。' });
relic('IncenseBurner', { type: 'normal', price: 11, name: '香炉', tx: 'ダイス6：このラウンド、失うHPは最大1。', die: [{ f: [6], fx: function (cb, pc) { pc.capHp = 'round'; pc.capHpLost = 0; } }] });
relic('InkBottle', { type: 'normal', price: 6, name: 'インク瓶', tx: 'ダイス5・6：カードを1枚引く。', die: [{ f: [5, 6], fx: function (cb, pc) { return cb.draw(pc, 1); } }] });
relic('Lantern', { type: 'normal', price: 6, name: 'ランタン', tx: '戦闘開始時：1エナジーを得る。', startCombat: function (cb, pc) { cb.gainEnergy(pc, 1); } });
relic('MeatOnTheBone', { type: 'normal', price: 8, name: '骨付き肉', tx: '戦闘終了時：HPが4未満ならHPを4にする。', endCombat: function (cb, pc) { var P = cb.P(pc); if (P.hp > 0 && P.hp < 4) { P.hp = Math.min(4, cb.g.maxHp(P)); cb.emit({ t: 'heal', i: pc.i }); } } });
relic('MercuryHourglass', { type: 'normal', price: 6, name: '水銀の砂時計', tx: 'ダイス1・2：任意の列に1ダメージ。', die: [{ f: [1, 2], fx: function (cb, pc) { return cb.alive().length ? cb.damageAnyRow(pc, 1, '水銀の砂時計：列を選択') : null; } }] });
relic('MoltenEgg', { type: 'normal', price: 8, name: '溶融した卵', tx: 'アタックをデッキに加える時、アップグレードする。3回使ったら捨てる。' });
relic('MummifiedHand', { type: 'normal', price: 10, name: 'ミイラの手', tx: '戦闘中1回：このターンにパワーを使っていれば2エナジーを得る。', once: 'combat',
  canActivate: function (cb, pc, r) { return r.usedCombat ? 'この戦闘ではもう使いました。' : !pc.t.powers ? 'このターンにまだパワーを使っていません。' : null; },
  activate: async function (cb, pc, r) { r.usedCombat = true; cb.gainEnergy(pc, 2); } });
relic('Mutagen', { type: 'normal', price: 6, name: '突然変異性筋肥大', tx: '戦闘開始時：筋力1を得る。ターン終了時にその筋力を失う。', startCombat: function (cb, pc) { cb.tempStr(pc, 1); } });
relic('Necronomicon', { type: 'normal', price: 9, name: 'ネクロノミコン', tx: 'ダイス1：このターン最初に使うアタックを2回使う。', die: [{ f: [1], fx: function (cb, pc) { pc.t.necro = (pc.t.necro || 0) + 1; } }] });
relic('NilrysCodex', { type: 'normal', price: 7, name: 'ニルリーのコーデックス', tx: 'ダイス2：カードを1枚引く。ダイス4：ダイス2の能力を1つ発動する。その持ち主が効果を得る。',
  die: [{ f: [2], fx: function (cb, pc) { return cb.draw(pc, 1); } },
        { f: [4], noCopy: true, fx: function (cb, pc) { return cb.g.triggerDieAbility(cb, pc, { anyOwner: true, face: 2, title: 'ニルリーのコーデックス：発動するダイス2の能力を選択' }); } }] });
relic('NinjaScroll', { type: 'normal', price: 6, name: '忍者の巻物', tx: '戦闘中1回：1ダメージを2回。それぞれを別々のコスト0のアタックとして扱う。', once: 'combat', canActivate: onceCombat,
  activate: async function (cb, pc, r) { r.usedCombat = true; for (var i = 0; i < 2 && !cb.s.over; i++) await zeroAttack(cb, pc, 1, '忍者の巻物：' + (i + 1) + '回目の対象'); } });
relic('OddlySmoothStone', { type: 'normal', price: 7, name: 'すべすべの石', tx: 'ダイス4：任意のプレイヤーにブロック2。', die: [{ f: [4], fx: function (cb, pc) { return blockAnyPlayer(cb, pc, 2); } }] });
relic('OldCoin', { type: 'normal', price: 5, name: '古のコイン', tx: '10ゴールドを得て、このレリックを捨てる。商人か運び屋で出たら、捨ててもう1枚引く。',
  onGain: async function (g, p, r) { g.gainGold(p, 10); await useNow(g, p, r); } });
relic('Omamori', { type: 'normal', price: 5, name: 'お守り', tx: '呪いを得ない。' });
relic('Orichalcum', { type: 'normal', price: 5, name: 'オリハルコン', tx: 'ターン終了時：ブロックがなければブロック1。', endTurnFirst: function (cb, pc) { if (pc.blk === 0) return cb.gainBlock(pc, 1); } });
relic('PeacePipe', { type: 'normal', price: 8, name: '安らぎのパイプ', tx: '休憩した時：カードを1枚除去してもよい。' });
relic('PenNib', { type: 'normal', price: 8, name: 'ペン先', tx: 'ダイス5：弱体化1を与える。', die: [{ f: [5], fx: async function (cb, pc) { var e = await cb.chooseEnemy(pc, 'ペン先：弱体化を与える敵'); if (e) await cb.applyVuln(e, 1, pc); } }] });
relic('Pocketwatch', { type: 'normal', price: 9, name: '懐中時計', tx: 'ダイス3：カードを3枚引く。', die: [{ f: [3], fx: function (cb, pc) { return cb.draw(pc, 3); } }] });
relic('RedMask', { type: 'normal', price: 7, name: '赤仮面', tx: 'ダイス5・6：脱力1を与える。', die: [{ f: [5, 6], fx: async function (cb, pc) { var e = await cb.chooseEnemy(pc, '赤仮面：脱力を与える敵'); if (e) await cb.applyWeak(e, 1, pc); } }] });
relic('RedSkull', { type: 'normal', price: 9, name: '赤い頭蓋骨', tx: '各戦闘で最初に山札をシャッフルした時、筋力1を得る。',
  onShuffle: function (cb, pc, r) { if (!pc.c.redSkull) { pc.c.redSkull = true; cb.gainStr(pc, 1); } } });
relic('RegalPillow', { type: 'normal', price: 6, name: '王者の枕', tx: '休憩した時：HPを追加で3回復する。' });
relic('RunicPyramid', { type: 'normal', price: 6, name: 'ルーンピラミッド', tx: '戦闘中1回：このターン、カードを好きな枚数保留する。', once: 'combat', canActivate: onceCombat,
  activate: async function (cb, pc, r) { r.usedCombat = true; pc.t.retainAll = true; } });
relic('SelfFormingClay', { type: 'normal', price: 8, name: '自己形成粘土', tx: '戦闘中1回：この戦闘でHPを失っていればブロック3。', once: 'combat',
  canActivate: function (cb, pc, r) { return r.usedCombat ? 'この戦闘ではもう使いました。' : !pc.c.lostHp ? 'この戦闘でまだHPを失っていません。' : null; },
  activate: async function (cb, pc, r) { r.usedCombat = true; await cb.gainBlock(pc, 3); } });
relic('SsserpentHead', { type: 'normal', price: 6, name: 'サ・サーペントの頭', tx: '？の部屋に入った時、2ゴールドを得る。' });
relic('StoneCalendar', { type: 'normal', price: 7, name: '暦石', tx: 'ダイス4：4ダメージを与える。', die: [{ f: [4], fx: function (cb, pc) { return dmgTarget(cb, pc, 4, '暦石：対象の敵を選択'); } }] });
relic('StrikeDummy', { type: 'normal', price: 8, name: 'ストライクダミー', tx: 'スターターのストライクを使った時、ダメージ+1。' });
relic('Sundial', { type: 'normal', price: 8, name: '日時計', tx: 'ダイス2：2エナジーを得る。', die: [{ f: [2], fx: function (cb, pc) { cb.gainEnergy(pc, 2); } }] });
relic('TheAbacus', { type: 'normal', price: 6, name: 'そろばん', tx: '部屋ごとに1回：ダイスの目+1（6は1になる）。', dieModLabel: '+1', dieMod: function (g, cur) { return cur >= 6 ? 1 : cur + 1; } });
relic('TheBoot', { type: 'normal', price: 5, name: 'ザ・ブーツ', tx: 'ダイス4・5・6：1ダメージを与える。', die: [{ f: [4, 5, 6], fx: function (cb, pc) { return dmgTarget(cb, pc, 1, 'ザ・ブーツ：対象の敵を選択'); } }] });
relic('TheCourier', { type: 'normal', price: 6, name: '運び屋', tx: '戦闘中1回：ポーションかレリックのデッキの一番上を見る。それを買うか捨てる。', once: 'combat', canActivate: onceCombat,
  activate: async function (cb, pc, r) {
    r.usedCombat = true;
    var g = cb.g, p = cb.P(pc), d = g.run.decks;
    var which = await cb.ask(pc, { type: 'option', title: '運び屋：どちらのデッキを見ますか？', options: [{ id: 'potion', label: 'ポーション' }, { id: 'relic', label: 'レリック' }] });
    var id;
    if (which === 'relic') { do { id = d.relics.pop(); if (id === 'OldCoin') g.returnRelic(id); } while (id === 'OldCoin'); }
    else id = d.potions.pop();
    if (!id) return;
    var def = which === 'relic' ? R[id] : P[id];
    var opts = [{ id: 'buy', label: def.name + 'を' + def.price + 'ゴールドで買う', disabled: p.gold < def.price || (which === 'potion' && (p.potions.length >= g.potionLimit(p) || g.relicOf(p, 'Sozu'))) }, { id: 'discard', label: '捨てる' }];
    var a = await cb.ask(pc, { type: 'option', title: '運び屋：' + def.name, options: opts, show: { kind: which, id: id } });
    if (a === 'buy' && !opts[0].disabled) {
      p.gold -= def.price; cb.emit({ t: 'gold', i: pc.i, n: -def.price });
      if (which === 'relic') await g.gainRelic(p, id); else { p.potions.push(id); cb.emit({ t: 'gainPotion', i: pc.i, id: id }); }
    } else { if (which === 'relic') g.returnRelic(id); else d.potions.unshift(id); }
  } });
relic('Toolbox', { type: 'normal', price: 7, name: '工具箱', tx: '部屋ごとに1回：ダイスの目-1（1は6になる）。', dieModLabel: '-1', dieMod: function (g, cur) { return cur <= 1 ? 6 : cur - 1; } });
relic('ToxicEgg', { type: 'normal', price: 8, name: '毒の卵', tx: 'スキルをデッキに加える時、アップグレードする。3回使ったら捨てる。' });
relic('TungstenRod', { type: 'normal', price: 8, name: 'タングステンの棒材', tx: 'ダイス5：全プレイヤーにブロック1（1人プレイならブロック3）。',
  die: [{ f: [5], fx: async function (cb, pc) { var solo = cb.n() === 1; var ps = cb.pcs(); for (var i = 0; i < ps.length; i++) await cb.gainBlock(ps[i], solo ? 3 : 1); } }] });
relic('Vajra', { type: 'normal', price: 7, name: 'バジュラ', tx: 'ダイス2：筋力1を得る。ターン終了時にその筋力を失う。', die: [{ f: [2], fx: function (cb, pc) { cb.tempStr(pc, 1); } }] });
relic('WarPaint', { type: 'normal', price: 8, name: '戦化粧', tx: 'スターターの防御1枚と別のスキル1枚をアップグレードし、このレリックを捨てる。戦闘中は使えない。',
  onGain: async function (g, p, r) { if (g.run.combat) { r.pending = true; return; } await R.WarPaint.outOfCombat(g, p, r); },
  outOfCombat: async function (g, p, r) {
    await g.upgradeCards(p, 1, '戦化粧：アップグレードするスターターの防御を選択', function (c) { return /^Defend[RGBW]$/.test(c.id); });
    await g.upgradeCards(p, 1, '戦化粧：アップグレードする別のスキルを選択', function (c) { return STS.CARDS[c.id].t === 'S' && !/^Defend[RGBW]$/.test(c.id); });
    await useNow(g, p, r);
  } });
relic('Whetstone', { type: 'normal', price: 7, name: '砥石', tx: 'スターターのストライク1枚と別のアタック1枚をアップグレードし、このレリックを捨てる。戦闘中は使えない。',
  onGain: async function (g, p, r) { if (g.run.combat) { r.pending = true; return; } await R.Whetstone.outOfCombat(g, p, r); },
  outOfCombat: async function (g, p, r) {
    await g.upgradeCards(p, 1, '砥石：アップグレードするスターターのストライクを選択', function (c) { return /^Strike[RGBW]$/.test(c.id); });
    await g.upgradeCards(p, 1, '砥石：アップグレードする別のアタックを選択', function (c) { return STS.CARDS[c.id].t === 'A' && !/^Strike[RGBW]$/.test(c.id); });
    await useNow(g, p, r);
  } });
relic('WingBoots', { type: 'normal', price: 7, name: '空飛ぶブーツ', tx: '次の部屋へ進む時、道を無視してよい。3回使ったら捨てる。' });

/* ================================================================== BOSS RELICS (20) */
relic('Astrolabe', { type: 'boss', name: 'アストロラーベ', tx: 'カードを3枚アップグレードする。すぐに使い、捨てる。', onGain: async function (g, p, r) { await g.upgradeCards(p, 3, 'アストロラーベ：アップグレードするカードを3枚選択'); await useNow(g, p, r); } });
relic('BlackBlood', { type: 'boss', name: '黒き血', tx: '戦闘終了時：HPを2回復する。', endCombat: function (cb, pc) { cb.g.heal(cb.P(pc), 2); } });
relic('CallingBell', { type: 'boss', name: '呼びよせる鐘', tx: 'レリックを3つ得る。呪いを1枚得る。すぐに使い、捨てる。',
  onGain: async function (g, p, r) { await useNow(g, p, r); for (var i = 0; i < 3; i++) await g.offerRelic(p, 'normal'); await g.gainCurse(p); } });
relic('CoffeeDripper', { type: 'boss', energy: 1, name: 'コーヒードリッパー', tx: 'ターン開始時：1エナジーを得る。休憩所では休憩できない。' });
relic('CursedKey', { type: 'boss', energy: 1, name: '呪いの鍵', tx: 'ターン開始時：1エナジーを得る。手に入れた時、呪いを2枚得る。', onGain: async function (g, p) { await g.gainCurse(p); await g.gainCurse(p); } });
relic('Ectoplasm', { type: 'boss', energy: 1, name: 'エクトプラズム', tx: 'ターン開始時：1エナジーを得る。ゴールドを得られない。' });
relic('EmptyCage', { type: 'boss', name: '空っぽの檻', tx: 'カードを2枚除去する。すぐに使い、捨てる。', onGain: async function (g, p, r) { await g.removeCards(p, 2, '空っぽの檻：除去するカードを2枚選択'); await useNow(g, p, r); } });
relic('Enchiridion', { type: 'boss', name: '教えの書', tx: 'レアカード報酬を得る。3枚の代わりに5枚から選ぶ。すぐに使い、捨てる。', onGain: async function (g, p, r) { await useNow(g, p, r); await g.cardReward(p, 'rare', 5); } });
relic('FrozenCore', { type: 'boss', name: '凍てついたコア', tx: 'ターン終了時：ブロック1。', endTurn: function (cb, pc) { return cb.gainBlock(pc, 1); } });
relic('FusionHammer', { type: 'boss', energy: 1, name: '融合ハンマー', tx: 'ターン開始時：1エナジーを得る。休憩所では鍛錬できない。' });
relic('HolyWater', { type: 'boss', name: '聖水', tx: '戦闘開始時：キューブを2つ置く。キューブを1つ取り除く：1エナジーを得る。',
  startCombat: function (cb, pc, r) { r.cubes = 2; },
  canActivate: function (cb, pc, r) { return (r.cubes || 0) > 0 ? null : 'キューブがありません。'; },
  activate: async function (cb, pc, r) { r.cubes--; cb.gainEnergy(pc, 1); } });
relic('MarkOfPain', { type: 'boss', energy: 1, name: '苦痛の印', tx: 'ターン開始時：1エナジーを得る。HPが6を超える場合は6になる。', onGain: function (g, p) { if (p.hp > 6) p.hp = 6; } });
relic('Orrery', { type: 'boss', name: '太陽系儀', tx: 'カード報酬を4回得る。すぐに使い、捨てる。', onGain: async function (g, p, r) { await useNow(g, p, r); for (var i = 0; i < 4; i++) await g.cardReward(p, 'normal', 3, { title: '太陽系儀：カード報酬 ' + (i + 1) + '/4' }); } });
relic('PandorasBox', { type: 'boss', name: 'パンドラの箱', tx: 'カードを3枚変化させる。すぐに使い、捨てる。', onGain: async function (g, p, r) { await g.transformCards(p, 3, 'パンドラの箱：変化させるカードを3枚選択'); await useNow(g, p, r); } });
relic('RingOfTheSerpent', { type: 'boss', name: '大蛇の指輪', tx: 'ターン開始時：カードを1枚引く。', startTurn: function (cb, pc) { return cb.draw(pc, 1); } });
relic('SneckoEye', { type: 'boss', name: 'ヘビヤモリの目', tx: 'ダイス1・2：カードを2枚引く。ダイス3・4：1エナジーを得る。ダイス5・6：めまい1を得る。',
  die: [{ f: [1, 2], fx: function (cb, pc) { return cb.draw(pc, 2); } }, { f: [3, 4], fx: function (cb, pc) { cb.gainEnergy(pc, 1); } }, { f: [5, 6], fx: function (cb, pc) { return cb.addStatus(pc, 'Daze', 1, 'drawTop'); } }] });
relic('Sozu', { type: 'boss', energy: 1, name: 'ししおどし', tx: 'ターン開始時：1エナジーを得る。ポーションを得られない。' });
relic('TinyHouse', { type: 'boss', name: '小さな家', tx: 'カード報酬、ポーション1つ、3ゴールドを得る。カードを1枚アップグレードする。すぐに使い、捨てる。',
  onGain: async function (g, p, r) { await useNow(g, p, r); await g.cardReward(p, 'normal', 3); await g.offerPotion(p); g.gainGold(p, 3); await g.upgradeCards(p, 1, '小さな家：アップグレードするカードを選択'); } });
relic('WhiteBeastStatue', { type: 'boss', name: '白き獣の像', tx: '戦闘終了時：ポーションを1つ得る。', endCombat: function (cb, pc) { return cb.g.offerPotion(cb.P(pc)); } });
relic('WristBlade', { type: 'boss', name: 'リストブレード', tx: 'コスト0のアタックのヒット1つにつきダメージ+1（ナイフを含む）。' });

/* ================================================================== SPECIAL */
relic('LoadedDie', { type: 'special', name: 'いかさまダイス', tx: '1人プレイ専用。ダイス4・5：ブロック1。ダイス6：ダイスレリックの能力を1つ発動する。',
  die: [{ f: [4, 5], fx: function (cb, pc) { return cb.gainBlock(pc, 1); } }, { f: [6], noCopy: true, fx: function (cb, pc) { return cb.g.triggerDieAbility(cb, pc, { exclude: 'LoadedDie', title: 'いかさまダイス：発動するダイスレリックの能力を選択' }); } }] });
relic('PrismaticShard', { type: 'special', name: 'プリズムシャード', tx: 'オーブスロット2つを得る（ディフェクト以外）。他のキャラクターのオーブやスタンスを得た時に手に入る。' });

/* ================================================================== CHARACTER ABILITIES (player boards) */
A.R = { name: '燃える血', tx: '戦闘終了時：HPを1回復する。', endCombat: function (cb, pc) { cb.g.heal(cb.P(pc), 1); } };
A.G = { name: '蛇の指輪', tx: '戦闘開始時：カードを2枚引く。ナイフ（最大5）。', startCombat: function (cb, pc) { return cb.draw(pc, 2); } };
A.B = { name: 'ひび割れたコア', tx: '戦闘開始時：ライトニングを1つ生成する。オーブスロット3。', startCombat: function (cb, pc) { return cb.channel(pc, 'lightning'); } };
A.W = { name: '奇跡', tx: '奇跡（最大5）を使ってエナジー1を得る（X コストの支払いにも使える）。スタンス。' };

/* ================================================================== POTIONS (29 cards) */
async function enemyThen(cb, pc, title, fn) { var e = await cb.chooseEnemy(pc, title); if (e) await fn(e); }
potion('Ancient', { price: 2, name: '古代のポーション', tx: '自分の脱力と弱体化をすべて取り除く。', use: async function (cb, pc) { pc.weak = 0; pc.vuln = 0; } });
potion('Attack', { price: 2, name: 'アタックポーション', tx: 'このターン次に使うアタックを2回使う。', use: async function (cb, pc) { pc.t.atkPotion = (pc.t.atkPotion || 0) + 1; } });
potion('Block', { price: 2, copies: 2, name: 'ブロックポーション', tx: '任意のプレイヤーにブロック2。', use: function (cb, pc) { return blockAnyPlayer(cb, pc, 2); } });
potion('Blood', { price: 3, name: '血のポーション', tx: 'HPを2回復する。（戦闘外でも使える）', use: async function (cb, pc) { cb.healPlayer(pc, 2); }, out: async function (g, p) { g.heal(p, 2); } });
potion('Cunning', { price: 3, name: '狡猾のポーション', tx: '1ダメージを3回。それぞれを別々のコスト0のアタックとして扱う。',
  use: async function (cb, pc) { for (var i = 0; i < 3 && !cb.s.over; i++) await zeroAttack(cb, pc, 1, '狡猾のポーション：' + (i + 1) + '回目の対象'); } });
potion('DistilledChaos', { price: 3, name: '蒸留された混沌', tx: 'カードを3枚引き、好きな順で0エナジーで即座に使う。',
  use: async function (cb, pc) {
    var got = await cb.draw(pc, 3);
    while (got.length && !cb.s.over) {
      var c;
      if (got.length === 1) c = got[0];
      else { var cs = await cb.pickCards(pc, got, 1, 1, '蒸留された混沌：次に使うカードを選択'); c = cs[0] || got[0]; }
      got.splice(got.indexOf(c), 1);
      if (pc.hand.indexOf(c) < 0) continue;
      await cb.playFree(pc, c, {});
    }
  } });
potion('Energy', { price: 2, copies: 2, name: 'エナジーポーション', tx: '2エナジーを得る。', use: async function (cb, pc) { cb.gainEnergy(pc, 2); } });
potion('Entropic', { price: 3, name: 'エントロピー調合', tx: 'ポーションを2つ得る。（戦闘外でも使える）',
  use: async function (cb, pc) { var p = cb.P(pc); for (var i = 0; i < 2; i++) await cb.g.offerPotion(p); },
  out: async function (g, p) { for (var i = 0; i < 2; i++) await g.offerPotion(p); } });
potion('Explosive', { price: 2, copies: 2, name: '爆発のポーション', tx: '任意の列に2ダメージ。', use: function (cb, pc) { return cb.damageAnyRow(pc, 2, '爆発のポーション：列を選択'); } });
potion('Fairy', { price: 3, passive: true, name: '妖精の瓶', tx: 'HPが0になった時、代わりにHPを2にしてこのポーションを捨てる。' });
potion('Fire', { price: 2, copies: 2, name: '炎のポーション', tx: '4ダメージを与える。', use: function (cb, pc) { return dmgTarget(cb, pc, 4, '炎のポーション：対象の敵を選択'); } });
potion('Flex', { price: 2, copies: 2, name: 'ステロイドポーション', tx: '筋力1を得る。ターン終了時にその筋力を失う。', use: async function (cb, pc) { cb.tempStr(pc, 1); } });
potion('GamblersBrew', { price: 3, dieOnly: true, name: '賭博師の醸造酒', tx: 'ダイスを好きな目に変える（ダイスの結果を受け入れる前に）。' });
potion('Ghost', { price: 4, name: '幽霊の小壺', tx: 'このターン、失うHPは最大1。', use: async function (cb, pc) { if (!pc.capHp) { pc.capHp = 'turn'; pc.capHpLost = 0; } } });
potion('LiquidMemories', { price: 3, name: '記憶の液体', tx: '捨て札のカード1枚を手札に戻す。このターン、そのコストは0。',
  use: async function (cb, pc) { var cs = await cb.pickCards(pc, 'discard', 1, 1, '記憶の液体：手札に戻すカードを選択'); cs.forEach(function (c) { pc.disc.splice(pc.disc.indexOf(c), 1); c.cm = 0; pc.hand.push(c); }); } });
potion('Purity', { price: 2, name: '浄化のポーション', tx: '手札を3枚まで廃棄する。', use: async function (cb, pc) { var cs = await cb.pickCards(pc, 'hand', 0, 3, '浄化のポーション：廃棄するカードを選択（3枚まで）'); for (var i = 0; i < cs.length; i++) await cb.exhaustCard(pc, cs[i]); } });
potion('Skill', { price: 2, name: 'スキルポーション', tx: 'このターン次に使うスキルを2回使う。', use: async function (cb, pc) { pc.t.sklPotion = (pc.t.sklPotion || 0) + 1; } });
potion('SneckoOil', { price: 3, name: 'ヘビヤモリの油', tx: 'カードを5枚引く。めまい2を得る。', use: async function (cb, pc) { await cb.draw(pc, 5); await cb.addStatus(pc, 'Daze', 2, 'drawTop'); } });
potion('Swift', { price: 2, copies: 2, name: '韋駄天のポーション', tx: 'カードを3枚引く。', use: function (cb, pc) { return cb.draw(pc, 3); } });
potion('Vulnerable', { price: 2, copies: 2, name: '弱体化ポーション', tx: '弱体化1を与える。', use: function (cb, pc) { return enemyThen(cb, pc, '弱体化ポーション：対象の敵', function (e) { return cb.applyVuln(e, 1, pc); }); } });
potion('Weak', { price: 2, copies: 2, name: '脱力ポーション', tx: '脱力×2を与える。', use: function (cb, pc) { return enemyThen(cb, pc, '脱力ポーション：対象の敵', function (e) { return cb.applyWeak(e, 2, pc); }); } });
})(typeof window !== 'undefined' ? window : globalThis);

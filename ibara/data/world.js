/* 茨の塔 — enemies, encounters, relics, potions, events, blessings and maps for 第一層「根の回廊」. */
(function () {
'use strict';
var ROOT = typeof globalThis !== 'undefined' ? globalThis : window;
var G = ROOT.IBARA || (ROOT.IBARA = {});
var EN = G.ENEMIES = {};
function E(id, o) { o.id = id; EN[id] = o; }
function A(name, fx, icon) { return { name: name, fx: fx, icon: icon }; }

/* shared specials */
function curl(n) {
  return async function (c, e, loss, o) {
    if (!e.st.curled && o && o.hit) { e.st.curled = true; await c.emit('special', { e: e, name: '丸まる' }); await c.gainEnemyBlock(e, n); }
  };
}

/* ------------------------------ 1st encounters ------------------------------ */
E('rat', { name: '苔ネズミ', hp: 5, art: 'rat',
  cube: { acts: [A('噛みつき', [['atk', 1]]), A('引っかき', [['atk', 1], ['weak', 1]])], loop: 0 } });
E('slime_s', { name: '小泥スライム', hp: 3, art: 'slime_s', single: A('体当たり', [['atk', 1]]) });
E('slime_s2', { name: '小泥スライム', hp: 3, art: 'slime_s2',
  die: [[1, 3, A('粘りつく', [['status', 'st_slime', 1]])], [4, 6, A('体当たり', [['atk', 1]])]] });
E('pillbug', { name: '棘ダンゴムシ', hp: 6, art: 'pillbug', sp: [['丸まる', '初めて攻撃でHPを失ったとき、盾2を得る。']], onHpLoss: curl(2),
  die: [[1, 4, A('転がり', [['atk', 1]])], [5, 6, A('棘を立てる', [['block', 1], ['str', 1]])]] });
E('wisp', { name: 'さまよう灯', hp: 4, art: 'wisp',
  die: [[1, 2, A('燃え移る', [['atk', 2]])], [3, 6, A('ちらつく', [['atk', 1]])]] });

/* ------------------------------ encounters ------------------------------ */
E('crab', { name: '岩殻ガニ', hp: 9, art: 'crab',
  die: [[1, 2, A('鋏打ち', [['atk', 3]])], [3, 4, A('殻ごもり', [['block', 2], ['str', 1]])], [5, 6, A('挟み撃ち', [['atk', 2], ['block', 1]])]] });
E('chanter', { name: '蝋燭の祈祷師', hp: 7, art: 'chanter',
  cube: { acts: [A('詠唱', [['str', 1]]), A('燭台打ち', [['atk', 1]]), A('祈り', [['str', 1]])], loop: 1 } });
E('imp_boss', { name: '小鬼の頭目', hp: 5, art: 'imp_boss',
  die: [[1, 2, A('棍棒', [['atk', 2]])], [3, 4, A('指図', [['atk', 1], ['blockAll', 1]])], [5, 6, A('見張り', [['block', 2]])]] });
E('imp_fat', { name: '太っちょ小鬼', hp: 4, art: 'imp_fat', single: A('のしかかり', [['atk', 1], ['weak', 1]]) });
E('imp_quick', { name: 'すばしこ小鬼', hp: 3, art: 'imp_quick', single: A('ひっかき', [['atk', 2]]) });
E('imp_angry', { name: '怒りんぼ小鬼', hp: 4, art: 'imp_angry', sp: [['逆上', 'HPを失うたび、闘気1を得る。']], single: A('殴る', [['atk', 1]]),
  onHpLoss: async function (c, e) { await c.emit('special', { e: e, name: '逆上' }); await c.addStatus(e, 'str', 1); } });
E('imp_shield', { name: '盾持ち小鬼', hp: 4, art: 'imp_shield', sp: [['ひとりぼっち', '仲間がいなくなると体当たりしてくる。']], single: A('かばう', [['blockAlly', 2]]),
  override: function (c, e) { return c.alive().length <= 1 ? A('体当たり', [['atk', 2]]) : null; } });
E('imp_sorcerer', { name: 'まじない小鬼', hp: 3, art: 'imp_sorcerer',
  cube: { acts: [A('念じる', [['none']], 'charge'), A('念じる', [['none']], 'charge'), A('呪いの火', [['atk', 3]])], loop: 0 } });
E('slime_l', { name: '大泥スライム', hp: 12, art: 'slime_l', sp: [['分裂', 'HPが半分以下になると、残りのHPを分け合う2体の泥スライムに分かれる。']],
  onHpLoss: async function (c, e) { if (!e.st.split && e.hp <= Math.floor(e.maxHp / 2)) await c.splitEnemy(e, 'slime_m'); },
  die: [[1, 3, A('のしかかり', [['atk', 2]])], [4, 6, A('泥まき', [['status', 'st_slime', 2]])]] });
E('slime_m', { name: '泥スライム', hp: 6, art: 'slime_m',
  die: [[1, 3, A('体当たり', [['atk', 1]])], [4, 6, A('泥はね', [['atk', 1], ['status', 'st_slime', 1]])]] });
E('puffball', { name: 'ふくれ茸', hp: 7, art: 'puffball', sp: [['破裂', '倒されたとき、あなたに隙1を与える。']],
  onDeath: async function (c, e) { await c.emit('special', { e: e, name: '破裂' }); await c.addStatus(c.hero, 'vuln', 1); },
  die: [[1, 3, A('体当たり', [['atk', 2]])], [4, 6, A('胞子をまく', [['weak', 1]])]] });
E('trapper', { name: '蔦絡みの罠師', hp: 9, art: 'trapper',
  cube: { acts: [A('蔦投げ', [['atk', 1], ['weak', 1]]), A('刺す', [['atk', 2]]), A('罠を張る', [['block', 2]])], loop: 0 } });
E('crow', { name: '盗っ人カラス', hp: 7, art: 'crow', sp: [['ひったくり', '攻撃であなたのHPを減らすたび金貨1を奪う。倒せば取り返せる。'], ['逃げ足', '4回目の行動で逃げ去る。']],
  afterAttack: async function (c, e, loss) {
    if (loss > 0 && c.run.gold > 0) { c.run.gold -= 1; c.stolen += 1; await c.emit('special', { e: e, name: 'ひったくり' }); await c.emit('gold', { delta: -1 }); }
  },
  cube: { acts: [A('つつく', [['atk', 1]]), A('つつく', [['atk', 1]]), A('舞い上がる', [['block', 2]]), A('逃走', [['flee']], 'flee')], loop: 3 } });
E('tick_a', { name: '影ダニ', hp: 4, art: 'tick', sp: [['丸まる', '初めて攻撃でHPを失ったとき、盾2を得る。']], onHpLoss: curl(2), single: A('噛む', [['atk', 1]]) });
E('tick_b', { name: '影ダニ', hp: 4, art: 'tick2', sp: [['丸まる', '初めて攻撃でHPを失ったとき、盾2を得る。']], onHpLoss: curl(2),
  cube: { acts: [A('噛む', [['atk', 1]]), A('膨らむ', [['str', 1]])], loop: 0 } });
E('acid_m', { name: '酸の滴り', hp: 6, art: 'acid',
  die: [[1, 3, A('酸を吐く', [['atk', 1], ['status', 'st_slime', 1]])], [4, 6, A('体当たり', [['atk', 2]])]] });
E('spike_m', { name: '棘の滴り', hp: 6, art: 'spike',
  die: [[1, 4, A('刺す', [['atk', 2]])], [5, 6, A('震える', [['weak', 1]])]] });
E('nest', { name: '根喰い虫の巣', hp: 8, art: 'nest', sp: [['孵化', '根喰い虫を生み出す。巣を倒しても虫は残る。']],
  cube: { acts: [A('孵化', [['summon', 'borer', 1]]), A('脈動', [['block', 2]])], loop: 0 } });
E('borer', { name: '根喰い虫', hp: 2, art: 'borer', single: A('かじる', [['atk', 1]]) });
E('sentinel', { name: '錆びた番兵', hp: 9, art: 'sentinel', startBlock: 2, sp: [['錆びた鎧', '戦闘開始時、盾2を持つ。']],
  die: [[1, 2, A('突き', [['atk', 3]])], [3, 4, A('斬り', [['atk', 2]])], [5, 6, A('構え', [['block', 2], ['atk', 1]])]] });
function twin(other) {
  return async function (c, e, dead) { if (dead.id === other) { await c.emit('special', { e: e, name: '片割れ' }); await c.addStatus(e, 'str', 2); } };
}
E('lantern_r', { name: '赤灯籠', hp: 5, art: 'lantern_r', sp: [['片割れ', '青灯籠が倒れると、闘気2を得る。']], onAllyDeath: twin('lantern_b'), single: A('灯火', [['atk', 2]]) });
E('lantern_b', { name: '青灯籠', hp: 5, art: 'lantern_b', sp: [['片割れ', '赤灯籠が倒れると、闘気2を得る。']], onAllyDeath: twin('lantern_r'),
  cube: { acts: [A('守り火', [['blockAlly', 2]]), A('冷たい火', [['atk', 1], ['weak', 1]])], loop: 0 } });

/* ------------------------------ elites ------------------------------ */
E('boar', { name: '鬼面の大猪', hp: 14, art: 'boar', elite: true, sp: [['突進の反動', '「突進」を盾で完全に防がれると、次のターンふらついて何もできない。']],
  afterAct: async function (c, e, act) { if (act.name === '突進' && e.st.lastLoss === 0) { e.st.stun = true; await c.emit('special', { e: e, name: 'ふらつき' }); } },
  cube: { acts: [A('前掻き', [['block', 2], ['str', 1]]), A('突進', [['atk', 3]]), A('牙突き', [['atk', 1], ['weak', 1]])], loop: 0 } });
E('statue', { name: '眠れる石像', hp: 15, art: 'statue', elite: true, startBlock: 2, sp: [['眠り', 'HPを失うか、4ラウンド目になると目を覚ます。眠っている間は盾を固める。']],
  init: function (c, e) { e.st.sleep = true; },
  sleepAct: A('眠り', [['block', 2]], 'sleep'),
  wake: async function (c, e) { if (!e.st.sleep) return; e.st.sleep = false; e.cube = 0; await c.emit('special', { e: e, name: '目覚め' }); },
  onHpLoss: async function (c, e) { if (e.st.sleep) await EN.statue.wake(c, e); },
  onRoundStart: async function (c, e) { if (e.st.sleep && c.round >= 4) await EN.statue.wake(c, e); },
  cube: { acts: [A('石の拳', [['atk', 3]]), A('砕く', [['atk', 2], ['block', 2]]), A('重圧', [['weak', 1]])], loop: 0 } });
E('witch', { name: '茨の魔女', hp: 12, art: 'witch', elite: true, sp: [['茨の衣', '攻撃を受けるたび、攻撃者に1ダメージ。']],
  init: function (c, e) { e.st.thorns = 1; },
  cube: { acts: [A('呪いの棘', [['atk', 2], ['weak', 1]]), A('芽吹き', [['summon', 'sprout', 1]]), A('茨の抱擁', [['block', 3]])], loop: 0 } });
E('sprout', { name: '茨の芽', hp: 2, art: 'sprout', single: A('からみつく', [['atk', 1]]) });

/* ------------------------------ bosses ------------------------------ */
E('b_slime', { name: '沼の主ヌラリ', hp: 34, art: 'b_slime', boss: true, sp: [['分裂', 'HPが半分以下になると、残りのHPを分け合う「沼の落とし子」2体に分かれる。']],
  onHpLoss: async function (c, e) { if (!e.st.split && e.hp <= Math.floor(e.maxHp / 2)) await c.splitEnemy(e, 'b_spawn'); },
  cube: { acts: [A('泥の抱擁', [['atk', 1], ['status', 'st_slime', 2]]), A('沈む', [['block', 4]]), A('大津波', [['atk', 2, 2]])], loop: 0 } });
E('b_spawn', { name: '沼の落とし子', hp: 9, art: 'b_spawn',
  die: [[1, 3, A('のしかかり', [['atk', 2]])], [4, 6, A('泥はね', [['status', 'st_slime', 1]])]] });
async function shell(c, e) {
  if (e.mode === 'shell') return;
  await c.emit('special', { e: e, name: '殻籠り' });
  await c.setMode(e, 'shell'); e.st.thorns = 1; await c.gainEnemyBlock(e, 6);
}
E('b_colossus', { name: '苔むした巨像', hp: 34, art: 'b_colossus', boss: true, startMode: 'stand',
  sp: [['殻籠り', 'HPが24以下・12以下になったとき（各1回）、殻籠り形態になり盾6を得る。'], ['苔棘', '殻籠り形態の間、攻撃を受けるたび攻撃者に1ダメージ。']],
  onHpLoss: async function (c, e) {
    if (!e.st.t1 && e.hp <= 24) { e.st.t1 = true; await shell(c, e); }
    else if (!e.st.t2 && e.hp <= 12) { e.st.t2 = true; await shell(c, e); }
  },
  fns: { unshell: async function (c, e) { e.st.thorns = 0; await c.setMode(e, 'stand'); } },
  modes: {
    stand: { label: '攻撃形態', die: [[1, 2, A('踏み潰し', [['atk', 3]])], [3, 4, A('岩投げ', [['atk', 2], ['vuln', 1]])], [5, 6, A('薙ぎ払い', [['atk', 1, 3]])]] },
    shell: { label: '殻籠り', cube: { acts: [A('根を張る', [['block', 3]]), A('殻を破る', [['atk', 3], ['fn', 'unshell']])], loop: 0 } }
  } });
var INFERNO = A('業火', [['atk', 2, 4], ['fn', 'out']]);
E('b_witch', { name: '燭台の魔女', hp: 32, art: 'b_witch', boss: true,
  sp: [['五つの燭', '行動のたびに燭台の火が1本灯る。5本灯ると次は「業火」を放ち、火は全て消える。'], ['吹き消し', 'あなたが1ターンに4以上HPを減らすと、火を1本吹き消す。']],
  init: function (c, e) { e.st.candles = 0; },
  badge: function (e) { return { label: '燭', value: e.st.candles || 0, max: 5 }; },
  override: function (c, e) { return (e.st.candles || 0) >= 5 ? INFERNO : null; },
  fns: { out: async function (c, e) { e.st.candles = 0; e.st.noAdvance = true; await c.emit('special', { e: e, name: '火が消えた' }); } },
  afterAct: async function (c, e, act) { if (act !== INFERNO) { e.st.candles = Math.min(5, (e.st.candles || 0) + 1); await c.emit('badge', { e: e }); } },
  onHpLoss: async function (c, e, loss) {
    if (c.phase === 'enemy') return;
    if (e.st.dmgRound !== c.round) { e.st.dmgRound = c.round; e.st.dmgAcc = 0; e.st.snuffed = false; }
    e.st.dmgAcc += loss;
    if (e.st.dmgAcc >= 4 && !e.st.snuffed && e.st.candles > 0) { e.st.snuffed = true; e.st.candles--; await c.emit('special', { e: e, name: '吹き消し' }); await c.emit('badge', { e: e }); }
  },
  cube: { acts: [A('炎の舌', [['atk', 2], ['status', 'st_burn', 1]]), A('陰火', [['block', 3]]), A('呪いの灯', [['weak', 1]])], loop: 0 } });

/* ------------------------------ encounters ------------------------------ */
var ENC = G.ENCOUNTERS = {};
function EC(id, enemy, summons, rewards) { ENC[id] = { id: id, enemy: enemy, summons: summons || [], rewards: rewards }; }
EC('fe_rat', 'rat', [], { gold: 1, card: 1 });
EC('fe_slimes', 'slime_s', ['slime_s2'], { gold: 1, card: 1 });
EC('fe_pillbug', 'pillbug', [], { gold: 1, card: 1 });
EC('fe_wisp', 'wisp', [], { card: 1, potion: true });
EC('en_crab', 'crab', [], { gold: 2, card: 1 });
EC('en_chanter', 'chanter', [], { gold: 2, card: 1 });
EC('en_imps', 'imp_boss', ['random:imp', 'random:imp'], { gold: 3, card: 1 });
EC('en_slime', 'slime_l', [], { gold: 2, card: 1 });
EC('en_puffball', 'puffball', [], { gold: 2, card: 1 });
EC('en_trapper', 'trapper', [], { gold: 2, card: 1 });
EC('en_crow', 'crow', [], { gold: 3, card: 1 });
EC('en_ticks', 'tick_a', ['tick_b'], { gold: 2, card: 1 });
EC('en_drips', 'acid_m', ['spike_m'], { gold: 2, card: 1 });
EC('en_nest', 'nest', [], { gold: 3, card: 1 });
EC('en_sentinel', 'sentinel', [], { gold: 2, card: 1, potion: true });
EC('en_lanterns', 'lantern_r', ['lantern_b'], { gold: 2, card: 1 });
EC('el_boar', 'boar', [], { gold: 4, card: 'up', relic: true });
EC('el_statue', 'statue', [], { gold: 4, card: 'up', relic: true });
EC('el_witch', 'witch', ['sprout'], { gold: 4, card: 'up', relic: true });
EC('b_slime', 'b_slime', [], { gold: 6, rare: true });
EC('b_colossus', 'b_colossus', [], { gold: 6, rare: true });
EC('b_witch', 'b_witch', [], { gold: 6, rare: true });
EC('ev_mushrooms', 'puffball', ['puffball'], { relic: true });

G.ACT1 = {
  name: '第一層　根の回廊',
  first: ['fe_rat', 'fe_slimes', 'fe_pillbug', 'fe_wisp'],
  encounters: ['en_crab', 'en_chanter', 'en_imps', 'en_slime', 'en_puffball', 'en_trapper', 'en_crow', 'en_ticks', 'en_drips', 'en_nest', 'en_sentinel', 'en_lanterns'],
  elites: ['el_boar', 'el_statue', 'el_witch'],
  bosses: ['b_slime', 'b_colossus', 'b_witch'],
  events: ['ev_altar', 'ev_bard', 'ev_well', 'ev_mirror', 'ev_giant', 'ev_trial', 'ev_ring', 'ev_bones', 'ev_crown', 'ev_spring', 'ev_gambler', 'ev_shelf'],
  summonGroups: { imp: ['imp_fat', 'imp_quick', 'imp_angry', 'imp_shield', 'imp_sorcerer', 'imp_fat', 'imp_quick', 'imp_angry', 'imp_shield', 'imp_sorcerer'] },
  maps: []
};

/* ------------------------------ relics ------------------------------ */
var RL = G.RELICS = {};
function R(id, o) { o.id = id; RL[id] = o; }
var PR = { C: 4, U: 5, R: 6, B: 0, S: 0, X: 0 };
function RR(id, rarity, o) { o.rarity = rarity; if (o.price == null) o.price = PR[rarity]; R(id, o); }
RR('s_heart', 'S', { name: '熾火の心臓', glyph: 'heart', color: '#e0643a', text: '戦闘終了時、HPを1回復する。', onCombatEnd: async function (c) { await c.healHero(1); } });
RR('s_moth', 'S', { name: '鱗粉の袋', glyph: 'moth', color: '#7cc46f', text: '戦闘開始時、カードを2枚引く。', onCombatStart: async function (c) { await c.drawCards(2); } });
RR('s_spring', 'S', { name: 'ぜんまい心核', glyph: 'gear', color: '#e2b450', text: '戦闘開始時、雷核を1つ宿す。', onCombatStart: async function (c) { await c.channel('spark'); } });
RR('s_sand', 'S', { name: '星砂の小瓶', glyph: 'stars', color: '#b996ec', text: '戦闘開始時、祈り1を得る。', onCombatStart: async function (c) { await c.gainMiracle(1); } });
RR('solo_die', 'X', { name: '導きの賽', glyph: 'die', color: '#efe3c2', text: '出目6：カードを1枚引く。または、他の秘宝の出目能力を1つ発動する。', dieText: '6' });

RR('r_anchor', 'C', { name: '錨の欠片', glyph: 'anchor', color: '#8fa7b8', text: '戦闘開始時、盾2を得る。', onCombatStart: async function (c) { await c.gainBlock(2); } });
RR('r_stone', 'C', { name: 'すべすべの川石', glyph: 'stone', color: '#9bb3a8', text: '出目2：盾1を得る。', die: [2], dieText: '2：盾1', dieFx: async function (c) { await c.gainBlock(1); } });
RR('r_hourglass', 'C', { name: '古びた砂時計', glyph: 'hourglass', color: '#d8b46a', text: '出目3：カードを1枚引く。', die: [3], dieText: '3：1枚引く', dieFx: async function (c) { await c.drawCards(1); } });
RR('r_seed', 'C', { name: '陽だまりの種', glyph: 'sun', color: '#f2c94c', text: '出目4：エナジー1を得る。', die: [4], dieText: '4：エナジー1', dieFx: async function (c) { await c.gainEnergy(1); } });
RR('r_bell', 'C', { name: '割れた鈴', glyph: 'bell', color: '#c9a24a', text: '出目5：敵全体に1ダメージ。', die: [5], dieText: '5：敵全体に1', dieFx: async function (c) { var al = c.alive(); for (var i = 0; i < al.length; i++) await c.damageEnemy(al[i], 1, { kind: 'relic' }); c.checkEnd(); } });
RR('r_cord', 'C', { name: '赤い組紐', glyph: 'knot', color: '#d9534f', text: '出目1：闘気1を得る。', die: [1], dieText: '1：闘気1', dieFx: async function (c) { await c.gainStr(1); } });
RR('r_goldtooth', 'C', { name: '金の歯', glyph: 'coin', color: '#f0c040', text: '戦闘の金貨報酬が1増える。' });
RR('r_herb', 'C', { name: '薬草袋', glyph: 'leaf', color: '#6fbf73', text: '戦闘終了時、HPを1回復する。', onCombatEnd: async function (c) { await c.healHero(1); } });
RR('r_meat', 'C', { name: '燻製肉', glyph: 'bone', color: '#c98b5c', text: '拾ったとき、最大HP+1。', onPickup: function (g) { g.changeMaxHp(1); } });
RR('r_boot', 'C', { name: '旅人の靴', glyph: 'boot', color: '#a37a54', text: '焚き火で休むと、さらにHPを1回復する。' });
RR('r_frog', 'C', { name: '陶器の蛙', glyph: 'frog', color: '#7fb38c', text: '1ターン目、エナジー1を得る。', onCombatStart: async function (c) { await c.gainEnergy(1); } });
RR('r_mask', 'U', { name: '欠けた仮面', glyph: 'mask', color: '#d6c7a1', text: '戦闘開始時、敵全体に怯み1を与える。', onCombatStart: async function (c) { await c.applyAll('weak', 1); } });
RR('r_bitter', 'U', { name: '苦い木の実', glyph: 'berry', color: '#9b59b6', text: '戦闘開始時、ランダムな敵1体に隙2を与える。', onCombatStart: async function (c) { var al = c.alive(); if (al.length) await c.addStatus(c.rng.pick(al), 'vuln', 2); } });
RR('r_owl', 'U', { name: '木彫りの梟', glyph: 'owl', color: '#b0895a', text: '1ターン目、カードを2枚多く引く。', onCombatStart: async function (c) { await c.drawCards(2); } });
RR('r_ash', 'U', { name: '灰の小箱', glyph: 'ember', color: '#e07b39', text: 'カードが消滅するたび、ランダムな敵に1ダメージ。',
  onExhaust: async function (c) { var al = c.alive(); if (!al.length) return false; await c.damageEnemy(c.rng.pick(al), 1, { kind: 'relic' }); c.checkEnd(); } });
RR('r_charm', 'U', { name: '魔除けの鈴蘭', glyph: 'lily', color: '#e8f0e0', text: '各戦闘で最初に受ける怯みか隙を1回無効にする。', onCombatStart: async function (c) { c.flags.ward = 1; return 'quiet'; } });
RR('r_kettle', 'U', { name: '赤い薬缶', glyph: 'kettle', color: '#c0392b', text: '秘薬を使うたび、HPを1回復する。' });
RR('r_belt', 'U', { name: '古い革帯', glyph: 'belt', color: '#8e6b4a', text: '秘薬を1つ多く持てる。' });
RR('r_spoon', 'U', { name: '銀の匙', glyph: 'spoon', color: '#d5dde4', text: '行商人の価格がすべて1安くなる。' });
RR('r_sheath', 'U', { name: '毒針の鞘', glyph: 'needle', color: '#79c267', text: '毒を与えるとき、さらに毒1。' });
RR('r_claw', 'U', { name: '研ぎ澄ました爪', glyph: 'claw', color: '#e6e6e6', text: '出目6：このターン最初に使う攻撃カードのダメージが2倍。', die: [6], dieText: '6：最初の攻撃2倍', dieFx: async function (c) { c.t.doubleAtk = true; } });
RR('r_scales', 'U', { name: '傾いた天秤', glyph: 'scales', color: '#d4b26a', text: '1ルームに1回：サイコロを振った直後、出目を1つ上か下に変えてよい。', dieMod: 'pm1' });
RR('r_pouch', 'U', { name: '綻んだ巾着', glyph: 'pouch', color: '#b98552', text: '戦闘のあと、ときどき秘薬が手に入る。' });
RR('r_feather', 'U', { name: '鴉の羽根', glyph: 'feather', color: '#4a4a6a', text: '1戦闘に1回：タップしてエナジー1を得る。', active: async function (c) { await c.gainEnergy(1); } });
RR('r_flip', 'R', { name: '裏返しの賽', glyph: 'die', color: '#e8d8a8', text: '1ルームに1回：サイコロを振った直後、出目を裏の面（7−出目）にしてよい。', dieMod: 'flip' });
RR('r_omamori', 'R', { name: '守り札', glyph: 'charm', color: '#e74c3c', text: '呪いを2回まで防ぐ。' });
RR('r_lantern', 'R', { name: '古いランタン', glyph: 'lantern', color: '#f5b041', text: '出目1と6：盾2を得る。', die: [1, 6], dieText: '1・6：盾2', dieFx: async function (c) { await c.gainBlock(2); } });
RR('r_crown', 'R', { name: '茨の冠', glyph: 'crown', color: '#8e44ad', text: '戦闘開始時、闘気1を得る。', onCombatStart: async function (c) { await c.gainStr(1); } });
RR('r_xbox', 'R', { name: '歪んだ升', glyph: 'box', color: '#a0785a', text: 'Xコストのカードを使うとき、Xが1増える。' });
RR('r_pocket', 'R', { name: '懐中時計', glyph: 'clock', color: '#d4ac0d', text: '出目3：エナジー1を得て、カードを1枚引く。', die: [3], dieText: '3：エナジー1と1枚', dieFx: async function (c) { await c.gainEnergy(1); await c.drawCards(1); } });
RR('r_ember', 'R', { name: '消えない火種', glyph: 'flame', color: '#ff7f50', text: 'ターン終了時、手札が0枚なら盾2を得る。', onTurnEnd: async function (c) { if (c.hand.length) return false; await c.gainBlock(2); } });
RR('r_tea', 'R', { name: '苦い薬湯', glyph: 'cup', color: '#6b8e23', text: '拾ったとき、HPを全回復する。', onPickup: function (g) { g.run.hp = g.run.maxHp; } });

RR('b_sun', 'B', { name: '黒い太陽', glyph: 'sun', color: '#2c2c2c', text: 'ターン開始時、エナジー1を得る。焚き火で休めなくなる。', onTurnStart: async function (c) { await c.gainEnergy(1); } });
RR('b_crown', 'B', { name: '割れた王冠', glyph: 'crown', color: '#c0a060', text: 'ターン開始時、エナジー1を得る。カード報酬の候補が1枚減る。', onTurnStart: async function (c) { await c.gainEnergy(1); } });
RR('b_hood', 'B', { name: '黒頭巾', glyph: 'mask', color: '#34495e', text: 'ターン開始時、エナジー1を得る。戦闘開始時、山札に眩暈を2枚混ぜる。',
  onTurnStart: async function (c) { await c.gainEnergy(1); }, onCombatStart: async function (c) { await c.addCardTo('st_daze', 'drawRandom'); await c.addCardTo('st_daze', 'drawRandom'); } });
RR('b_lamp', 'B', { name: '夜明けの灯', glyph: 'lantern', color: '#f7dc6f', text: 'ターン開始時、盾1を得る。', onTurnStart: async function (c) { await c.gainBlock(1); } });
RR('b_bag', 'B', { name: '底なし袋', glyph: 'pouch', color: '#7d5a3c', text: 'ターン開始時、カードを1枚多く引く。', onTurnStart: async function (c) { await c.drawCards(1); } });
RR('b_hammer', 'B', { name: '金床の欠片', glyph: 'anvil', color: '#95a5a6', text: '拾ったとき、デッキのカードをランダムに2枚強化する。',
  onPickup: function (g) { var can = g.run.deck.filter(G.card.canUpgrade); g.rng.shuffle(can); can.slice(0, 2).forEach(function (c) { c.up = true; }); } });
RR('b_ring', 'B', { name: '蛇の指輪', glyph: 'ring', color: '#27ae60', text: '拾ったとき、最大HP+2。HPを全回復する。', onPickup: function (g) { g.changeMaxHp(2); g.run.hp = g.run.maxHp; } });
RR('b_coins', 'B', { name: '金貨の山', glyph: 'coin', color: '#f1c40f', text: '拾ったとき、金貨+8。', onPickup: function (g) { g.gainGold(8); } });
RR('b_quill', 'B', { name: '星の羽ペン', glyph: 'feather', color: '#aab7ff', text: '戦闘開始時、カードを1枚引き、盾1を得る。', onCombatStart: async function (c) { await c.drawCards(1); await c.gainBlock(1); } });
RR('b_orrery', 'B', { name: '小さな天球儀', glyph: 'orb', color: '#5dade2', text: '出目1〜3：盾1を得る。出目4〜6：カードを1枚引く。', die: [1, 2, 3, 4, 5, 6], dieText: '1〜3：盾1／4〜6：1枚',
  dieFx: async function (c) { if (c.die <= 3) await c.gainBlock(1); else await c.drawCards(1); } });

/* ------------------------------ potions ------------------------------ */
var PO = G.POTIONS = {};
function PT(id, o) { o.id = id; PO[id] = o; }
PT('p_fire', { name: '火炎の小瓶', color: '#ff6b3d', price: 2, target: 'enemy', text: '敵1体に4ダメージ。', use: async function (c, t) { await c.damageEnemy(t, 4, { kind: 'fire' }); } });
PT('p_ice', { name: '氷結の小瓶', color: '#7fd3ff', price: 2, text: '盾4を得る。', use: async function (c) { await c.gainBlock(4); } });
PT('p_power', { name: '闘気の小瓶', color: '#e74c3c', price: 3, text: '闘気2を得る。', use: async function (c) { await c.gainStr(2); } });
PT('p_swift', { name: '疾風の小瓶', color: '#f4d03f', price: 2, text: 'エナジー2を得る。', use: async function (c) { await c.gainEnergy(2); } });
PT('p_wit', { name: '知恵の小瓶', color: '#5dade2', price: 2, text: 'カードを3枚引く。', use: async function (c) { await c.drawCards(3); } });
PT('p_weak', { name: '萎えの霧', color: '#a9b8a0', price: 2, target: 'all', text: '敵全体に怯み2を与える。', use: async function (c) { await c.applyAll('weak', 2); } });
PT('p_fear', { name: '恐れの粉', color: '#c39bd3', price: 2, target: 'enemy', text: '隙3を与える。', use: async function (c, t) { await c.addStatus(t, 'vuln', 3); } });
PT('p_poison', { name: '毒の小瓶', color: '#58d68d', price: 2, target: 'enemy', text: '毒4を与える。', use: async function (c, t) { await c.applyPoison(t, 4); } });
PT('p_heal', { name: '癒しの小瓶', color: '#ff8fa3', price: 3, text: 'HPを3回復する。戦闘外でも使える。', field: true, use: async function (c) { await c.healHero(3); }, fieldUse: function (g) { g.heal(3); } });
PT('p_fairy', { name: '妖精の瓶', color: '#ffd1f0', price: 3, passive: true, text: 'HPが0になったとき、自動で使われHP3で復活する。' });
PT('p_iron', { name: '鉄皮の小瓶', color: '#99a3a4', price: 2, text: 'この戦闘中、ターン開始時に盾1を得る。', use: async function (c) { c.hero.plated += 1; await c.gainBlock(1); } });
PT('p_chaos', { name: '混沌の小瓶', color: '#af7ac5', price: 3, text: '山札の上から3枚を、そのまま使う。',
  use: async function (c) { for (var i = 0; i < 3 && !c.over; i++) { if (!c.draw.length) { if (!c.discard.length) break; await c.reshuffle(); } var card = c.draw.pop(); await c.playFree(card, 1); } } });
PT('p_echo', { name: '写し身の小瓶', color: '#d7bde2', price: 3, text: '次に使うカードを2回使う。', use: async function (c) { c.doubleNext += 1; await c.emit('next', {}); } });
PT('p_gamble', { name: '賭けの小瓶', color: '#f8c471', price: 2, text: '手札を好きな枚数捨て、同じ枚数を引く。',
  use: async function (c) { var p = await c.chooseHand({ n: c.hand.length, optional: true, always: true, prompt: '捨てるカードを選ぶ（何枚でも）' }); await c.discardFromHand(p); if (p.length) await c.drawCards(p.length); } });
PT('p_bless', { name: '祈りの小瓶', color: '#d2b4de', price: 2, text: '祈り2を得る。', use: async function (c) { await c.gainMiracle(2); } });
PT('p_smith', { name: '鍛冶の小瓶', color: '#e59866', price: 3, text: '手札のカードをすべて、この戦闘中強化する。',
  use: async function (c) { var list = c.hand.filter(function (x) { return !G.card.isUp(x) && G.card.canUpgrade(x); }); list.forEach(function (x) { x.cup = true; }); if (list.length) await c.emit('upgradeInHand', { cards: list }); } });
PT('p_needle', { name: '針の小瓶', color: '#82e0aa', price: 2, text: '投げ針3を得る。', use: async function (c) { await c.gainShiv(3); } });

/* ------------------------------ events ------------------------------ */
G.EVENTS = {};
function EV(id, o) { o.id = id; G.EVENTS[id] = o; }
EV('ev_altar', { name: '苔むした祭壇', art: ['candle', 'skull'], tone: '#7a8f5a',
  text: '苔に覆われた古い祭壇。窪みには乾いた血の跡があり、誰かの祈りがまだ残っている気がする。',
  options: [
    { label: '祈る', desc: '呪いを1枚得る。レア報酬を得る。', run: async function (X) { await X.curse(); await X.rare(); X.say('祭壇がかすかに脈打った。代償と引き換えに、力が手に入った。'); } },
    { label: '血を捧げる', desc: 'HPを2失う。秘宝を得る。', req: function (g) { return g.run.hp > 2 ? true : 'HPが足りない'; }, run: async function (X) { await X.hurt(2); await X.relic(); X.say('血が苔に吸い込まれ、台座の奥から何かが転がり出た。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('祭壇に背を向けた。'); } }
  ] });
EV('ev_bard', { name: '迷子の吟遊詩人', art: ['bell', 'feather'], tone: '#b0885a',
  text: '踊り場で、竪琴を抱えた男がうずくまっている。「一曲いかがです？ お代はお気持ちで」',
  options: [
    { label: '聴く', desc: 'カードを1枚強化する。', run: async function (X) { await X.upgrade(1); X.say('澄んだ調べに、手の中の札が熱を帯びた。'); } },
    { label: '金貨3を払う', desc: '秘宝を得る。', req: function (g) { return g.run.gold >= 3 ? true : '金貨が足りない'; }, run: async function (X) { X.gold(-3); await X.relic(); X.say('詩人は礼を言い、古びた包みを差し出した。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('背中で竪琴が鳴り続けていた。'); } }
  ] });
EV('ev_well', { name: '泥沼の井戸', art: ['drop', 'eye'], tone: '#4f6f6a',
  text: '底の見えない井戸。濁った水面の下で、何かがきらりと光った。',
  options: [
    { label: '手を入れる', desc: 'サイコロ：1〜2 HPを2失う／3〜4 金貨+3／5〜6 秘宝を得る。', run: async function (X) {
      var v = await X.roll();
      if (v <= 2) { await X.hurt(2); X.say('何かに指を噛まれた！（出目' + v + '）'); }
      else if (v <= 4) { X.gold(3); X.say('泥の中から金貨をすくい上げた。（出目' + v + '）'); }
      else { await X.relic(); X.say('冷たい指先が、確かな手応えを掴んだ。（出目' + v + '）'); }
    } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('水面の光は、やがて沈んでいった。'); } }
  ] });
EV('ev_mirror', { name: '鏡の間', art: ['eye', 'crack'], tone: '#7d8fa8',
  text: '壁一面の鏡に、見知らぬ自分が映っている。鏡の中の自分が、こちらに手を伸ばした。',
  options: [
    { label: '向き合う', desc: 'カードを1枚変化させる。', run: async function (X) { await X.transform(1); X.say('鏡の中の自分と札を取り替えた。'); } },
    { label: '鏡を割る', desc: '呪いを1枚得る。金貨+5。', run: async function (X) { await X.curse(); X.gold(5); X.say('砕けた破片の奥に、金貨が隠されていた。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('鏡の中の自分は、最後まで目を逸らさなかった。'); } }
  ] });
EV('ev_giant', { name: '眠る巨人の指', art: ['hand', 'stars'], tone: '#8c7a62',
  text: '通路をふさぐ巨大な石の指。爪の隙間に、旅人の荷物が引っかかっている。',
  options: [
    { label: 'よじ登る', desc: 'HPを1失う。秘薬を2つ得る。', run: async function (X) { await X.hurt(1); await X.potion(2); X.say('荷物の中には、封をした小瓶が残っていた。'); } },
    { label: '迂回する', desc: '金貨+1。', run: async function (X) { X.gold(1); X.say('足元に落ちていた金貨を拾った。'); } }
  ] });
EV('ev_trial', { name: '炎の試練', art: ['flame', 'hand'], tone: '#c0603a',
  text: '青白い炎の柱。手をかざせば、不要なものを焼き払ってくれるという。',
  options: [
    { label: '手をかざす', desc: 'HPを1失う。カードを1枚取り除く。', run: async function (X) { await X.hurt(1); await X.remove(1); X.say('炎が札を一枚、灰に変えた。'); } },
    { label: '炎を浴びる', desc: 'HPを3失う。カードを2枚取り除く。', req: function (g) { return g.run.hp > 3 ? true : 'HPが足りない'; }, run: async function (X) { await X.hurt(3); await X.remove(2); X.say('焼け焦げた痛みと引き換えに、身が軽くなった。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('炎は静かに揺れていた。'); } }
  ] });
EV('ev_ring', { name: '茸の輪', art: ['mushroom', 'stars'], tone: '#7a6aa0',
  text: '足元に、光る茸が輪を描いている。輪の中心に、小さな包みが落ちている。',
  options: [
    { label: '踏み入る', desc: '戦闘（ふくれ茸×2）。勝てば秘宝。', run: async function (X) { X.say('茸がぶくりと膨らんだ！'); return { fight: 'ev_mushrooms' }; } },
    { label: '茸を食べる', desc: '最大HP+1。「寄生」を得る。', run: async function (X) { X.maxHp(1); await X.curse('cu_parasite'); X.say('滋養が体に染み渡る……何かが根を張った気もする。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('輪を踏まないよう、そっと通り過ぎた。'); } }
  ] });
EV('ev_bones', { name: '骨の商人', art: ['bone', 'coin'], tone: '#a89a7a',
  text: '骨で組んだ屋台。店主の顔は影に沈んで見えない。「札を一枚、買い取ろう」',
  options: [
    { label: '札を売る', desc: 'カードを1枚取り除く。金貨+3。', run: async function (X) { var n = await X.remove(1); if (n) { X.gold(3); X.say('骨の指が札を受け取り、金貨を置いた。'); } else X.say('売るものが見つからなかった。'); } },
    { label: '骨の小瓶を買う', desc: '金貨2を払う。秘薬を得る。', req: function (g) { return g.run.gold >= 2 ? true : '金貨が足りない'; }, run: async function (X) { X.gold(-2); await X.potion(1); X.say('小瓶の中で、何かがゆらりと動いた。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('屋台の骨が、からからと笑った。'); } }
  ] });
EV('ev_crown', { name: '錆びた宝冠', art: ['crown', 'chain'], tone: '#9a7a40',
  text: '台座の上で、錆びた宝冠が鈍く光っている。周りには、持ち帰れなかった者の骨。',
  options: [
    { label: '取る', desc: '秘宝を得る。その後サイコロ：1〜3 呪いを1枚得る。', run: async function (X) {
      await X.relic(); var v = await X.roll();
      if (v <= 3) { await X.curse(); X.say('台座の呪いがまとわりついた。（出目' + v + '）'); } else X.say('呪いは、今回は眠ったままだった。（出目' + v + '）');
    } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('骨たちの仲間入りはご免だ。'); } }
  ] });
EV('ev_spring', { name: '祝福の泉', art: ['drop', 'star'], tone: '#5a9ab0',
  text: '澄んだ泉が湧いている。水面に、見えないはずの星が映っている。',
  options: [
    { label: '飲む', desc: 'HPを3回復する。', run: async function (X) { X.heal(3); X.say('冷たい水が、傷を癒していく。'); } },
    { label: '浴びる', desc: '呪いを1枚取り除く。', req: function (g) { return g.run.deck.some(function (c) { return G.CARDS[c.id].type === 'curse'; }) ? true : '呪いがない'; }, run: async function (X) { await X.removeCurse(); X.say('呪いが泡となって消えた。'); } },
    { label: '金貨を投げる', desc: '金貨1を払う。カードを1枚強化する。', req: function (g) { return g.run.gold >= 1 ? true : '金貨が足りない'; }, run: async function (X) { X.gold(-1); await X.upgrade(1); X.say('金貨が沈むと、札がかすかに光った。'); } }
  ] });
EV('ev_gambler', { name: '賭場の小鬼', art: ['die', 'coin'], tone: '#b0603a',
  text: '小鬼が欠けたサイコロを転がしている。「お兄さん、ひと勝負どうだい？」',
  options: [
    { label: '賭ける（金貨2）', desc: 'サイコロ：4〜6 金貨+5／1〜3 何もなし。', req: function (g) { return g.run.gold >= 2 ? true : '金貨が足りない'; }, run: async function (X) {
      X.gold(-2); var v = await X.roll();
      if (v >= 4) { X.gold(5); X.say('勝った！ 小鬼は舌打ちして金貨を投げてよこした。（出目' + v + '）'); } else X.say('負けだ。小鬼がけらけら笑う。（出目' + v + '）');
    } },
    { label: '脅す', desc: 'HPを1失う。金貨+2。', run: async function (X) { await X.hurt(1); X.gold(2); X.say('引っかかれたが、小鬼は金貨を置いて逃げていった。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('賭け事は性に合わない。'); } }
  ] });
EV('ev_shelf', { name: '古い書架', art: ['book', 'candle'], tone: '#8a6a4a',
  text: '崩れかけた書架に、表紙の焦げた本が並んでいる。頁の間から、札がのぞいている。',
  options: [
    { label: '読む', desc: '強化済みのカード報酬を得る。', run: async function (X) { await X.cardReward(true); X.say('古い頁から、技をひとつ学んだ。'); } },
    { label: '燃やす', desc: 'カードを1枚取り除く。', run: async function (X) { await X.remove(1); X.say('焚きつけにした頁と一緒に、不要な札も燃えた。'); } },
    { label: '立ち去る', desc: '何も起きない。', run: async function (X) { X.say('埃が舞い上がった。'); } }
  ] });

/* ------------------------------ blessings ------------------------------ */
function B(red, blues) { return { red: red, blue: blues }; }
var O = {
  remove: function (n) { return { label: 'カードを' + n + '枚取り除く', run: function (X) { return X.remove(n); } }; },
  upgrade: function (n) { return { label: 'カードを' + n + '枚強化する', run: function (X) { return X.upgrade(n); } }; },
  upRandom: function (n) { return { label: 'ランダムなカード' + n + '枚を強化', run: function (X) { return X.upgradeRandom(n); } }; },
  transform: function (n) { return { label: 'カードを' + n + '枚変化させる', run: function (X) { return X.transform(n); } }; },
  card: function () { return { label: 'カード報酬を得る', run: function (X) { return X.cardReward(false); } }; },
  upcard: function () { return { label: '強化済みのカード報酬を得る', run: function (X) { return X.cardReward(true); } }; },
  gold: function (n) { return { label: '金貨+' + n, run: function (X) { X.gold(n); } }; },
  maxhp: function (n) { return { label: '最大HP+' + n, run: function (X) { X.maxHp(n); } }; },
  potions: function (n) { return { label: '秘薬を' + n + 'つ得る', run: function (X) { return X.potion(n); } }; },
  rareCurse: function () { return { label: 'レア報酬を得る', cost: '呪いを1枚得る', run: async function (X) { await X.curse(); await X.rare(); } }; },
  rareHp: function () { return { label: 'レア報酬を得る', cost: '最大HPを2失う', run: async function (X) { X.maxHp(-2); await X.rare(); } }; },
  relicHp: function () { return { label: '秘宝を得る', cost: '最大HPを1失う', run: async function (X) { X.maxHp(-1); await X.relic(); } }; },
  relicCurse: function () { return { label: '秘宝を得る', cost: '呪いを1枚得る', run: async function (X) { await X.curse(); await X.relic(); } }; },
  relicHurt: function () { return { label: '秘宝を得る', cost: 'HPを3失う', run: async function (X) { await X.hurt(3); await X.relic(); } }; },
  removeHurt: function () { return { label: 'カードを2枚取り除く', cost: 'HPを2失う', run: async function (X) { await X.hurt(2); await X.remove(2); } }; },
  goldHurt: function () { return { label: '金貨+5', cost: 'HPを2失う', run: async function (X) { await X.hurt(2); X.gold(5); } }; },
  boss: function () { return { label: '初期の秘宝を手放し、至宝を1つ得る', run: function (X) { return X.bossSwap(); } }; }
};
var RED = {
  gold: function (n) { return { label: '金貨+' + n, run: function (X) { X.gold(n); } }; },
  potion: function () { return { label: '秘薬を1つ得る', run: function (X) { return X.potion(1); } }; },
  maxhp: function () { return { label: '最大HP+1', run: function (X) { X.maxHp(1); } }; }
};
G.BLESSINGS = [
  B(RED.gold(3), [O.remove(1), O.upgrade(1), O.card()]),
  B(RED.potion(), [O.transform(1), O.maxhp(2), O.gold(4)]),
  B(RED.maxhp(), [O.rareCurse(), O.removeHurt(), O.relicHp()]),
  B(RED.gold(2), [O.upcard(), O.transform(2), O.potions(2)]),
  B(RED.potion(), [O.remove(1), O.upRandom(2), O.relicCurse()]),
  B(RED.gold(4), [O.card(), O.transform(1), O.maxhp(2)]),
  B(RED.maxhp(), [O.upgrade(1), O.goldHurt(), O.rareHp()]),
  B(RED.gold(3), [O.remove(1), O.potions(2), O.boss()]),
  B(RED.potion(), [O.upcard(), O.remove(1), O.gold(4)]),
  B(RED.gold(2), [O.transform(2), O.relicHurt(), O.upgrade(1)]),
  B(RED.maxhp(), [O.card(), O.upRandom(2), O.potions(2)]),
  B(RED.gold(3), [O.transform(1), O.rareCurse(), O.remove(1)])
].map(function (b, i) { b.id = 'bl' + (i + 1); return b; });

/* ------------------------------ maps ------------------------------ */
function MAP(id, name, rows, edges, dark, light, eliteMinRow) {
  var nodes = [];
  rows.forEach(function (row, r) { row.forEach(function (n) { nodes.push({ id: n[0], row: r, x: n[1], space: n[2] === 'd' ? 'dark' : n[2] === 'l' ? 'light' : 'fixed', kind: n[2] === 'd' || n[2] === 'l' ? null : n[2] }); }); });
  var E2 = [];
  Object.keys(edges).forEach(function (k) { edges[k].forEach(function (to) { E2.push([k, to]); }); });
  G.ACT1.maps.push({ id: id, name: name, nodes: nodes, edges: E2, dark: dark, light: light, eliteMinRow: eliteMinRow || 4 });
}
MAP('east', '東回廊', [
  [['S', 0.5, 'start']],
  [['a1', 0.2, 'd'], ['a2', 0.5, 'l'], ['a3', 0.8, 'd']],
  [['b1', 0.1, 'd'], ['b2', 0.38, 'd'], ['b3', 0.62, 'l'], ['b4', 0.9, 'd']],
  [['c1', 0.2, 'l'], ['c2', 0.5, 'd'], ['c3', 0.8, 'l']],
  [['d1', 0.1, 'd'], ['d2', 0.36, 'l'], ['d3', 0.64, 'd'], ['d4', 0.9, 'd']],
  [['e1', 0.22, 'd'], ['e2', 0.5, 'l'], ['e3', 0.78, 'd']],
  [['f1', 0.3, 'treasure'], ['f2', 0.7, 'treasure']],
  [['g1', 0.1, 'd'], ['g2', 0.38, 'l'], ['g3', 0.62, 'd'], ['g4', 0.9, 'l']],
  [['h1', 0.22, 'd'], ['h2', 0.5, 'd'], ['h3', 0.78, 'l']],
  [['i1', 0.12, 'l'], ['i2', 0.4, 'd'], ['i3', 0.66, 'l'], ['i4', 0.9, 'd']],
  [['j1', 0.25, 'd'], ['j2', 0.55, 'l'], ['j3', 0.82, 'd']],
  [['k1', 0.32, 'rest'], ['k2', 0.68, 'rest']],
  [['BOSS', 0.5, 'boss']]
], {
  S: ['a1', 'a2', 'a3'], a1: ['b1', 'b2'], a2: ['b2', 'b3'], a3: ['b3', 'b4'], b1: ['c1'], b2: ['c1', 'c2'], b3: ['c2', 'c3'], b4: ['c3'],
  c1: ['d1', 'd2'], c2: ['d2', 'd3'], c3: ['d3', 'd4'], d1: ['e1'], d2: ['e1', 'e2'], d3: ['e2', 'e3'], d4: ['e3'],
  e1: ['f1'], e2: ['f1', 'f2'], e3: ['f2'], f1: ['g1', 'g2'], f2: ['g3', 'g4'], g1: ['h1'], g2: ['h1', 'h2'], g3: ['h2', 'h3'], g4: ['h3'],
  h1: ['i1', 'i2'], h2: ['i2', 'i3'], h3: ['i3', 'i4'], i1: ['j1'], i2: ['j1', 'j2'], i3: ['j2', 'j3'], i4: ['j3'],
  j1: ['k1'], j2: ['k1', 'k2'], j3: ['k2'], k1: ['BOSS'], k2: ['BOSS']
}, { enc: 15, elite: 4 }, { event: 7, rest: 2, shop: 2, treasure: 1 });
MAP('west', '西回廊', [
  [['S', 0.5, 'start']],
  [['a1', 0.3, 'd'], ['a2', 0.7, 'd']],
  [['b1', 0.15, 'l'], ['b2', 0.45, 'd'], ['b3', 0.8, 'l']],
  [['c1', 0.1, 'd'], ['c2', 0.35, 'l'], ['c3', 0.62, 'd'], ['c4', 0.88, 'd']],
  [['d1', 0.24, 'd'], ['d2', 0.55, 'd'], ['d3', 0.82, 'l']],
  [['e1', 0.12, 'l'], ['e2', 0.4, 'd'], ['e3', 0.66, 'l'], ['e4', 0.9, 'd']],
  [['f1', 0.5, 'treasure']],
  [['g1', 0.2, 'd'], ['g2', 0.5, 'l'], ['g3', 0.8, 'd']],
  [['h1', 0.1, 'l'], ['h2', 0.36, 'd'], ['h3', 0.64, 'd'], ['h4', 0.9, 'l']],
  [['i1', 0.22, 'd'], ['i2', 0.5, 'l'], ['i3', 0.78, 'd']],
  [['j1', 0.12, 'd'], ['j2', 0.4, 'l'], ['j3', 0.66, 'd'], ['j4', 0.9, 'd']],
  [['k1', 0.24, 'rest'], ['k2', 0.54, 'rest'], ['k3', 0.84, 'rest']],
  [['BOSS', 0.5, 'boss']]
], {
  S: ['a1', 'a2'], a1: ['b1', 'b2'], a2: ['b2', 'b3'], b1: ['c1', 'c2'], b2: ['c2', 'c3'], b3: ['c3', 'c4'],
  c1: ['d1'], c2: ['d1', 'd2'], c3: ['d2', 'd3'], c4: ['d3'], d1: ['e1', 'e2'], d2: ['e2', 'e3'], d3: ['e3', 'e4'],
  e1: ['f1'], e2: ['f1'], e3: ['f1'], e4: ['f1'], f1: ['g1', 'g2', 'g3'], g1: ['h1', 'h2'], g2: ['h2', 'h3'], g3: ['h3', 'h4'],
  h1: ['i1'], h2: ['i1', 'i2'], h3: ['i2', 'i3'], h4: ['i3'], i1: ['j1', 'j2'], i2: ['j2', 'j3'], i3: ['j3', 'j4'],
  j1: ['k1'], j2: ['k1', 'k2'], j3: ['k2', 'k3'], j4: ['k3'], k1: ['BOSS'], k2: ['BOSS'], k3: ['BOSS']
}, { enc: 15, elite: 4 }, { event: 6, rest: 2, shop: 2, treasure: 1 });
})();

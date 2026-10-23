/* 茨の塔 — heroes and cards. All names, cards and art are original to this game. */
(function () {
'use strict';
var ROOT = typeof globalThis !== 'undefined' ? globalThis : window;
var G = ROOT.IBARA || (ROOT.IBARA = {});
var CARDS = G.CARDS = {};
var POWERS = G.POWERS = {};

function C(id, hero, o) { o.id = id; o.hero = hero; o.kw = o.kw || []; CARDS[id] = o; }
function P(key, o) { o.key = key; POWERS[key] = o; }
function addPower(c, key, n) { c.hero.powers[key] = (c.hero.powers[key] || 0) + n; return c.emit('power', { key: key }); }
var blk = function (c, n) { return c.gainBlock(n, { fromCard: true }); };

/* ============================ 残り火の騎士 ============================ */
var K = 'knight';
C('k_strike', K, { name: '斬撃', type: 'atk', rarity: 'S', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。', art: ['sword'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('k_guard', K, { name: '防御', type: 'skl', rarity: 'S', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。', art: ['shield'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('k_brand', K, { name: '烙印の一撃', type: 'atk', rarity: 'S', cost: 2, target: 'enemy', v: { d: [2, 3], vu: [1, 2] }, t: '{d}ダメージ。隙{vu}を与える。', art: ['greatsword', 'burst'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.addStatus(t, 'vuln', v('vu')); } });

C('k_cleave', K, { name: '渾身の一撃', type: 'atk', rarity: 'C', cost: 2, target: 'enemy', v: { d: [4, 5] }, t: '{d}ダメージ。', art: ['greatsword', 'crack'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('k_sweep', K, { name: '薙ぎ払い', type: 'atk', rarity: 'C', cost: 1, target: 'all', v: { d: [1, 2] }, t: '敵全体に{d}ダメージ。', art: ['swirl', 'sword'],
  play: async function (c, me, t, v) { await c.attackAll(v('d')); } });
C('k_twin', K, { name: '二段斬り', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [1, 1], h: [2, 3] }, t: '{d}ダメージを{h}回。', art: ['swords'],
  play: async function (c, me, t, v) { await c.attack(t, v('d'), v('h')); } });
C('k_wall', K, { name: '鉄壁', type: 'skl', rarity: 'C', cost: 1, v: { b: [2, 3] }, t: '盾{b}を得る。', art: ['tower'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('k_reckless', K, { name: '捨て身の突撃', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [3, 4] }, t: '{d}ダメージ。HPを1失う。', art: ['arrow', 'blood'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.loseHP(1, { fromCard: true }); } });
C('k_roar', K, { name: '闘志の咆哮', type: 'skl', rarity: 'C', cost: 0, kw: ['exhaust'], t: '闘気1を得る。消滅。', tu: '闘気1を得る。カードを1枚引く。消滅。', art: ['horn', 'flame'],
  play: async function (c, me) { await c.gainStr(1); if (G.card.isUp(me)) await c.drawCards(1); } });
C('k_ash', K, { name: '灰かぶり', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [2, 3], e: [2, 2] }, t: '{d}ダメージ。このターンにカードが消滅していれば、さらに+{e}。', art: ['ember', 'sword'],
  dyn: function (c, me) { return c.t.exhausted > 0 ? { d: G.card.val(me, 'd') + G.card.val(me, 'e') } : null; },
  play: async function (c, me, t, v) { await c.attack(t, v('d') + (c.t.exhausted > 0 ? v('e') : 0)); } });
C('k_shieldbash', K, { name: '盾打ち', type: 'atk', rarity: 'C', cost: 1, costUp: 0, target: 'enemy', v: { d: [0, 0] }, t: '盾の数と同じダメージ。', tc: '盾の数と同じダメージ（{d}）。', art: ['shield', 'burst'],
  dyn: function (c) { return { d: c.hero.block }; },
  play: async function (c, me, t) { await c.attack(t, c.hero.block); } });
C('k_step', K, { name: '踏み込み', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。カードを1枚引く。', art: ['shield', 'arrow'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.drawCards(1); } });
C('k_stoke', K, { name: '熾火くべ', type: 'skl', rarity: 'C', cost: 1, v: { b: [2, 3] }, t: '手札のカード1枚を消滅させる。盾{b}を得る。', art: ['ember', 'hand'],
  play: async function (c, me, t, v) { var p = await c.chooseHand({ n: 1, prompt: '消滅させるカードを選ぶ' }); for (var i = 0; i < p.length; i++) await c.exhaustCard(p[i]); await blk(c, v('b')); } });
C('k_hone', K, { name: '刃研ぎ', type: 'skl', rarity: 'C', cost: 1, t: '盾1を得る。手札のカード1枚を、この戦闘中強化する。', tu: '盾1を得る。手札のカードを全て、この戦闘中強化する。', art: ['anvil', 'sword'],
  play: async function (c, me) {
    await blk(c, 1);
    var can = function (x) { return !G.card.isUp(x) && G.card.canUpgrade(x); };
    var list = G.card.isUp(me) ? c.hand.filter(can) : await c.chooseHand({ n: 1, filter: can, prompt: '強化するカードを選ぶ' });
    for (var i = 0; i < list.length; i++) { list[i].cup = true; }
    if (list.length) await c.emit('upgradeInHand', { cards: list });
  } });
C('k_bloodoath', K, { name: '血の誓い', type: 'skl', rarity: 'C', cost: 0, v: { e: [1, 2] }, t: 'HPを1失う。エナジー{e}を得る。', art: ['blood', 'orb'],
  play: async function (c, me, t, v) { await c.loseHP(1, { fromCard: true }); await c.gainEnergy(v('e')); } });
C('k_helmsplit', K, { name: '兜割り', type: 'atk', rarity: 'C', cost: 2, target: 'enemy', v: { d: [3, 4], wk: [1, 2] }, t: '{d}ダメージ。怯み{wk}を与える。', art: ['axe', 'crack'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.addStatus(t, 'weak', v('wk')); } });
C('k_embguard', K, { name: '残火の守り', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2], nb: [1, 2] }, t: '盾{b}を得る。次のターンの開始時に盾{nb}を得る。', art: ['shield', 'ember'],
  play: async function (c, me, t, v) { await blk(c, v('b')); c.hero.next.block += v('nb'); await c.emit('next', {}); } });

C('k_flamewall', K, { name: '炎の壁', type: 'skl', rarity: 'U', cost: 2, v: { b: [3, 4] }, t: '盾{b}を得る。次のターンまで、攻撃を受けるたび攻撃者に1ダメージ。', art: ['flame', 'tower'],
  play: async function (c, me, t, v) { await blk(c, v('b')); c.hero.retaliate += 1; await c.emit('power', { key: 'retaliate' }); } });
C('k_steelheart', K, { name: '鋼の心', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: 'ターン終了時、盾1を得る。', art: ['heart', 'shield'],
  play: async function (c) { await addPower(c, 'k_steel', 1); } });
C('k_burnwill', K, { name: '燃えさかる意志', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: 'カードが消滅するたび、盾1を得る。', art: ['flame', 'shield'],
  play: async function (c) { await addPower(c, 'k_burnwill', 1); } });
C('k_ashembrace', K, { name: '灰の抱擁', type: 'pow', rarity: 'U', cost: 2, costUp: 1, t: 'カードが消滅するたび、カードを1枚引く。', art: ['ember', 'book'],
  play: async function (c) { await addPower(c, 'k_ashembrace', 1); } });
C('k_ignite', K, { name: '発火', type: 'pow', rarity: 'U', cost: 1, v: { s: [1, 2] }, t: '闘気{s}を得る。', art: ['flame', 'fist'],
  play: async function (c, me, t, v) { await c.gainStr(v('s')); } });
C('k_devour', K, { name: '喰らう刃', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', kw: ['exhaust'], v: { d: [2, 3] }, t: '{d}ダメージ。これで敵を倒すと最大HP+1。消滅。', art: ['skull', 'sword'],
  play: async function (c, me, t, v) { var r = await c.attack(t, v('d')); if (r.killed) { c.hero.maxHp += 1; c.hero.hp += 1; await c.emit('maxhp', { delta: 1 }); } } });
C('k_surge', K, { name: '怒涛', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。この戦闘中、このカードのダメージ+1。', art: ['wave', 'sword'],
  dyn: function (c, me) { return me.bonus ? { d: G.card.val(me, 'd') + me.bonus } : null; },
  play: async function (c, me, t, v) { await c.attack(t, v('d') + (me.bonus || 0)); me.bonus = (me.bonus || 0) + 1; } });
C('k_scorch', K, { name: '焦土', type: 'skl', rarity: 'U', cost: 1, v: { b: [1, 2] }, t: '手札の攻撃以外のカードを全て消滅させ、1枚につき盾{b}を得る。', art: ['flame', 'crack'],
  play: async function (c, me, t, v) {
    var list = c.hand.filter(function (x) { return G.CARDS[x.id].type !== 'atk'; });
    for (var i = 0; i < list.length; i++) await c.exhaustCard(list[i]);
    if (list.length) await blk(c, v('b') * list.length);
  } });
C('k_bloodmist', K, { name: '血煙', type: 'atk', rarity: 'U', cost: 2, target: 'all', v: { d: [3, 4] }, t: 'HPを2失う。敵全体に{d}ダメージ。', art: ['blood', 'swirl'],
  play: async function (c, me, t, v) { await c.loseHP(2, { fromCard: true }); if (!c.over) await c.attackAll(v('d')); } });
C('k_whirl', K, { name: '旋風', type: 'atk', rarity: 'U', cost: 'X', target: 'all', v: { d: [1, 1] }, t: '敵全体に{d}ダメージをX回。', tu: '敵全体に{d}ダメージをX+1回。', art: ['swirl', 'swords'],
  play: async function (c, me, t, v, o) { var n = o.x + (G.card.isUp(me) ? 1 : 0); if (n > 0) await c.attackAll(v('d'), n); } });
C('k_unyield', K, { name: '不屈', type: 'skl', rarity: 'U', cost: 1, v: { b: [3, 4] }, t: '盾{b}を得る。手札に「火傷」を1枚加える。', art: ['tower', 'flame'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.addCardTo('st_burn', 'hand'); } });
C('k_scaroath', K, { name: '傷の誓い', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: 'カードの効果でHPを失うたび、闘気1を得る。', art: ['blood', 'fist'],
  play: async function (c) { await addPower(c, 'k_scaroath', 1); } });
C('k_warcry', K, { name: '戦慄の雄叫び', type: 'skl', rarity: 'U', cost: 1, target: 'all', kw: ['exhaust'], v: { wk: [1, 2] }, t: '敵全体に怯み{wk}を与える。カードを1枚引く。消滅。', art: ['horn', 'skull'],
  play: async function (c, me, t, v) { await c.applyAll('weak', v('wk')); await c.drawCards(1); } });
C('k_ironthrow', K, { name: '鉄塊投げ', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。山札の一番上のカードを見て、消滅させてもよい。', art: ['anvil', 'arrow'],
  play: async function (c, me, t, v) {
    await c.attack(t, v('d'));
    if (c.over) return;
    if (!c.draw.length && c.discard.length) await c.reshuffle();
    var top = c.draw[c.draw.length - 1]; if (!top) return;
    var r = await c.choose({ type: 'option', prompt: '山札の一番上', cards: [top], options: [{ id: 'ex', label: '消滅させる' }, { id: 'keep', label: '戻す' }] });
    if (r === 'ex') await c.exhaustCard(top);
  } });

C('k_demon', K, { name: '魔炎の化身', type: 'pow', rarity: 'R', cost: 3, costUp: 2, t: 'ターン開始時、闘気1を得る。', art: ['mask', 'flame'],
  play: async function (c) { await addPower(c, 'k_demon', 1); } });
C('k_pact', K, { name: '灰燼の契約', type: 'pow', rarity: 'R', cost: 2, costUp: 1, t: '技能カードのコストが0になる。使った技能カードは消滅する。', art: ['book', 'ember'],
  play: async function (c) { await addPower(c, 'k_pact', 1); } });
C('k_unbreak', K, { name: '不壊の誓い', type: 'skl', rarity: 'R', cost: 2, kw: ['exhaust'], v: { b: [6, 8] }, t: '盾{b}を得る。消滅。', art: ['tower', 'crown'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('k_behead', K, { name: '断頭', type: 'atk', rarity: 'R', cost: 3, target: 'enemy', v: { d: [7, 9] }, t: '{d}ダメージ。', art: ['axe', 'skull'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('k_inferno', K, { name: '業火', type: 'atk', rarity: 'R', cost: 2, target: 'all', v: { d: [4, 5] }, t: '敵全体に{d}ダメージ。捨て札に「火傷」を1枚加える。', art: ['flame', 'burst'],
  play: async function (c, me, t, v) { await c.attackAll(v('d')); if (!c.over) await c.addCardTo('st_burn', 'discard'); } });
C('k_feast', K, { name: '血の饗宴', type: 'atk', rarity: 'R', cost: 2, target: 'all', kw: ['exhaust'], v: { d: [2, 3] }, t: '敵全体に{d}ダメージ。減らしたHPの合計の半分（切り上げ）だけ回復。消滅。', art: ['blood', 'heart'],
  play: async function (c, me, t, v) { var r = await c.attackAll(v('d')); if (r.dealt > 0) await c.healHero(Math.ceil(r.dealt / 2)); } });
C('k_fortress', K, { name: '鉄の要塞', type: 'pow', rarity: 'R', cost: 3, costUp: 2, t: '盾がターン開始時に消えなくなる。', art: ['tower', 'chain'],
  play: async function (c) { await addPower(c, 'k_fortress', 1); } });
C('k_limit', K, { name: '限界突破', type: 'skl', rarity: 'R', cost: 1, kw: ['exhaust'], kwUp: [], t: '闘気を2倍にする。消滅。', tu: '闘気を2倍にする。', art: ['fist', 'burst'],
  play: async function (c) { if (c.hero.str > 0) await c.gainStr(c.hero.str); } });

/* ============================ 毒蛾の狩人 ============================ */
var H = 'huntress';
C('h_stab', H, { name: '刺突', type: 'atk', rarity: 'S', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。', art: ['dagger'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('h_dodge', H, { name: '回避', type: 'skl', rarity: 'S', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。', art: ['wing'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('h_powder', H, { name: '鱗粉の一刺し', type: 'atk', rarity: 'S', cost: 0, target: 'enemy', v: { d: [1, 1], wk: [1, 2] }, t: '{d}ダメージ。怯み{wk}を与える。', art: ['moth', 'needle'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.addStatus(t, 'weak', v('wk')); } });
C('h_sidestep', H, { name: '身かわし', type: 'skl', rarity: 'S', cost: 1, v: { b: [2, 3] }, t: '盾{b}を得る。手札を1枚捨てる。', art: ['wing', 'smoke'],
  play: async function (c, me, t, v) { await blk(c, v('b')); var p = await c.chooseHand({ n: 1, prompt: '捨てるカードを選ぶ' }); await c.discardFromHand(p); } });

C('h_venomstab', H, { name: '毒針', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [1, 2], p: [1, 1] }, t: '{d}ダメージ。毒{p}を与える。', art: ['needle', 'drop'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.applyPoison(t, v('p')); } });
C('h_dust', H, { name: '毒の粉', type: 'skl', rarity: 'C', cost: 1, target: 'enemy', v: { p: [2, 3] }, t: '毒{p}を与える。', art: ['drop', 'smoke'],
  play: async function (c, me, t, v) { await c.applyPoison(t, v('p')); } });
C('h_needles', H, { name: '針の束', type: 'skl', rarity: 'C', cost: 1, v: { s: [2, 3] }, t: '投げ針{s}を得る。', art: ['needles'],
  play: async function (c, me, t, v) { await c.gainShiv(v('s')); } });
C('h_quick', H, { name: '素早い回避', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。カードを1枚引く。', art: ['wing', 'arrow'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.drawCards(1); } });
C('h_sweep', H, { name: '足払い', type: 'skl', rarity: 'C', cost: 2, target: 'enemy', v: { wk: [2, 2], b: [2, 3] }, t: '怯み{wk}を与える。盾{b}を得る。', art: ['swirl', 'wing'],
  play: async function (c, me, t, v) { await c.addStatus(t, 'weak', v('wk')); await blk(c, v('b')); } });
C('h_prep', H, { name: '下準備', type: 'skl', rarity: 'C', cost: 0, v: { n: [1, 2] }, t: 'カードを{n}枚引き、1枚捨てる。', art: ['book', 'needle'],
  play: async function (c, me, t, v) { await c.drawCards(v('n')); var p = await c.chooseHand({ n: 1, prompt: '捨てるカードを選ぶ' }); await c.discardFromHand(p); } });
C('h_acro', H, { name: '曲芸', type: 'skl', rarity: 'C', cost: 1, v: { n: [3, 4] }, t: 'カードを{n}枚引き、1枚捨てる。', art: ['moth', 'swirl'],
  play: async function (c, me, t, v) { await c.drawCards(v('n')); var p = await c.chooseHand({ n: 1, prompt: '捨てるカードを選ぶ' }); await c.discardFromHand(p); } });
C('h_flurry', H, { name: '乱れ突き', type: 'atk', rarity: 'C', cost: 2, target: 'enemy', v: { d: [1, 1], h: [3, 4] }, t: '{d}ダメージを{h}回。', art: ['needles', 'burst'],
  play: async function (c, me, t, v) { await c.attack(t, v('d'), v('h')); } });
C('h_slipcut', H, { name: '斬り抜け', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。手札を1枚捨てる。', art: ['dagger', 'smoke'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); var p = await c.chooseHand({ n: 1, prompt: '捨てるカードを選ぶ' }); await c.discardFromHand(p); } });
C('h_smoke', H, { name: '煙玉', type: 'skl', rarity: 'C', cost: 1, v: { b: [2, 2], s: [1, 2] }, t: '盾{b}を得る。投げ針{s}を得る。', art: ['smoke', 'needle'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.gainShiv(v('s')); } });
C('h_moondance', H, { name: '月影の舞', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。毒を持つ敵1体につき、さらに盾1。', art: ['moon', 'moth'],
  dyn: function (c, me) { return { b: G.card.val(me, 'b') + c.alive().filter(function (e) { return e.poison > 0; }).length }; },
  play: async function (c, me, t, v) { await blk(c, v('b') + c.alive().filter(function (e) { return e.poison > 0; }).length); } });
C('h_nape', H, { name: '首筋狙い', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [2, 3], e: [2, 2] }, t: '{d}ダメージ。対象が怯みを持っていれば、さらに+{e}。', art: ['dagger', 'eye'],
  play: async function (c, me, t, v) { await c.attack(t, v('d') + (t && t.weak > 0 ? v('e') : 0)); } });
C('h_fang', H, { name: '毒牙', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。対象が毒を持っていれば、もう一度{d}ダメージ。', art: ['drop', 'dagger'],
  play: async function (c, me, t, v) { var pois = t && t.poison > 0; await c.attack(t, v('d')); if (pois && t.alive) await c.attack(t, v('d')); } });
C('h_flee', H, { name: '逃げ足', type: 'skl', rarity: 'C', cost: 0, v: { b: [1, 2] }, t: 'カードを1枚引く。それが技能なら盾{b}を得る。', art: ['wing', 'book'],
  play: async function (c, me, t, v) { var d = await c.drawCards(1); if (d[0] && G.CARDS[d[0].id].type === 'skl') await blk(c, v('b')); } });

C('h_incense', H, { name: '毒の香', type: 'pow', rarity: 'U', cost: 2, costUp: 1, t: 'ターン開始時、敵全体に毒1を与える。', art: ['smoke', 'drop'],
  play: async function (c) { await addPower(c, 'h_incense', 1); } });
C('h_endless', H, { name: '無限の刃', type: 'pow', rarity: 'U', cost: 1, kwUp: ['innate'], t: 'ターン開始時、投げ針1を得る。', tu: '先手。ターン開始時、投げ針1を得る。', art: ['needles', 'spiral'],
  play: async function (c) { await addPower(c, 'h_endless', 1); } });
C('h_catalyst', H, { name: '触媒', type: 'skl', rarity: 'U', cost: 1, target: 'enemy', kw: ['exhaust'], t: '敵1体の毒を2倍にする。消滅。', tu: '敵1体の毒を3倍にする。消滅。', art: ['drop', 'burst'],
  play: async function (c, me, t) { if (t && t.poison > 0) await c.applyPoison(t, t.poison * (G.card.isUp(me) ? 2 : 1)); } });
C('h_light', H, { name: '軽業', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: 'カードで盾を得るとき、さらに盾1。', art: ['feather', 'wing'],
  play: async function (c) { await addPower(c, 'h_light', 1); } });
C('h_hidden', H, { name: '仕込み刃', type: 'skl', rarity: 'U', cost: null, kw: ['unplayable'], v: { s: [2, 3] }, t: '使用不可。手札から捨てられたとき、投げ針{s}を得る。', art: ['dagger', 'mask'],
  onDiscard: async function (c, me) { await c.gainShiv(G.card.val(me, 's')); } });
C('h_parry', H, { name: '受け流し', type: 'skl', rarity: 'U', cost: 1, v: { b: [2, 3] }, t: '盾{b}を得る。次のターン、カードを1枚多く引く。', art: ['dagger', 'shield'],
  play: async function (c, me, t, v) { await blk(c, v('b')); c.hero.next.draw += 1; await c.emit('next', {}); } });
C('h_cloud', H, { name: '毒の雲', type: 'skl', rarity: 'U', cost: 2, target: 'all', v: { p: [1, 2], wk: [1, 1] }, t: '敵全体に毒{p}と怯み{wk}を与える。', art: ['cloud', 'drop'],
  play: async function (c, me, t, v) { await c.applyAll('poison', v('p')); await c.applyAll('weak', v('wk')); } });
C('h_gamble', H, { name: '計算された賭け', type: 'skl', rarity: 'U', cost: 0, kw: ['exhaust'], kwUp: [], t: '手札を全て捨て、同じ枚数を引く。消滅。', tu: '手札を全て捨て、同じ枚数を引く。', art: ['scales', 'coin'],
  play: async function (c) { var list = c.hand.slice(); await c.discardFromHand(list); await c.drawCards(list.length); } });
C('h_shadow', H, { name: '影走り', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。このターンに捨てたカード1枚につき+1。', art: ['moth', 'dagger'],
  dyn: function (c, me) { return c.t.discarded ? { d: G.card.val(me, 'd') + c.t.discarded } : null; },
  play: async function (c, me, t, v) { await c.attack(t, v('d') + c.t.discarded); } });
C('h_paralyze', H, { name: '麻痺針', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。怯み1と隙1を与える。', art: ['needle', 'bolt'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.addStatus(t, 'weak', 1); await c.addStatus(t, 'vuln', 1); } });
C('h_expose', H, { name: '弱点の見極め', type: 'skl', rarity: 'U', cost: 1, target: 'enemy', kw: ['exhaust'], v: { vu: [2, 3] }, t: '隙{vu}を与える。消滅。', art: ['eye', 'crack'],
  play: async function (c, me, t, v) { await c.addStatus(t, 'vuln', v('vu')); } });
C('h_storm', H, { name: '鱗粉の嵐', type: 'atk', rarity: 'U', cost: 2, target: 'all', v: { d: [1, 1], h: [2, 3] }, t: '敵全体に{d}ダメージを{h}回。', art: ['moth', 'swirl'],
  play: async function (c, me, t, v) { await c.attackAll(v('d'), v('h')); } });
C('h_finish', H, { name: '仕上げ', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージを、このターンに使った攻撃カードの枚数回。', tc: '{d}ダメージを、このターンに使った攻撃カードの枚数回（{x}回）。', art: ['dagger', 'star'],
  dyn: function (c) { return { x: c.t.attacks }; },
  play: async function (c, me, t, v) { if (c.t.attacks > 0) await c.attack(t, v('d'), c.t.attacks); } });
C('h_wingbeat', H, { name: '毒蛾の羽ばたき', type: 'atk', rarity: 'U', cost: 1, costUp: 0, target: 'all', t: '敵全体に、それぞれが持つ毒と同じダメージ。', art: ['moth', 'wave'],
  play: async function (c) { var al = c.alive(); await c.emit('heroAttackAll', { targets: al, hits: 1 }); for (var i = 0; i < al.length; i++) if (al[i].alive && al[i].poison > 0) await c.damageEnemy(al[i], al[i].poison, { kind: 'poison' }); } });

C('h_envenom', H, { name: '蛾毒の調合', type: 'pow', rarity: 'R', cost: 2, costUp: 1, t: '攻撃で敵のHPを減らすたび、毒1を与える。', art: ['moth', 'drop'],
  play: async function (c) { await addPower(c, 'h_envenom', 1); } });
C('h_accuracy', H, { name: '千本針', type: 'pow', rarity: 'R', cost: 2, costUp: 1, t: '投げ針のダメージ+1。', art: ['needles', 'eye'],
  play: async function (c) { await addPower(c, 'h_accuracy', 1); } });
C('h_thousand', H, { name: '千の刃', type: 'skl', rarity: 'R', cost: 2, costUp: 1, kw: ['exhaust'], t: '投げ針5を得る。消滅。', art: ['needles', 'burst'],
  play: async function (c) { await c.gainShiv(5); } });
C('h_corrode', H, { name: '腐蝕の嵐', type: 'skl', rarity: 'R', cost: 3, costUp: 2, target: 'all', kw: ['exhaust'], t: '敵全体に毒3を与える。消滅。', art: ['cloud', 'skull'],
  play: async function (c) { await c.applyAll('poison', 3); } });
C('h_flash', H, { name: '影の一閃', type: 'atk', rarity: 'R', cost: 2, target: 'enemy', v: { d: [6, 8] }, t: '{d}ダメージ。この戦闘中、このカードのダメージ-2。', art: ['moon', 'dagger'],
  dyn: function (c, me) { return me.pen ? { d: Math.max(0, G.card.val(me, 'd') - me.pen) } : null; },
  play: async function (c, me, t, v) { await c.attack(t, Math.max(0, v('d') - (me.pen || 0))); me.pen = (me.pen || 0) + 2; } });
C('h_vanish', H, { name: '霧隠れ', type: 'skl', rarity: 'R', cost: 2, v: { b: [4, 6] }, t: '盾{b}を得る。次のターンの開始時、盾が消えない。', art: ['smoke', 'moon'],
  play: async function (c, me, t, v) { await blk(c, v('b')); c.hero.keepBlock = true; await c.emit('next', {}); } });
C('h_tools', H, { name: '道具箱', type: 'pow', rarity: 'R', cost: 1, costUp: 0, t: 'ターン開始時、カードを1枚引き、1枚捨てる。', art: ['key', 'book'],
  play: async function (c) { await addPower(c, 'h_tools', 1); } });
C('h_afterimg', H, { name: '残像', type: 'pow', rarity: 'R', cost: 2, costUp: 1, t: 'カードを使うたび、盾1を得る。', art: ['moth', 'mask'],
  play: async function (c) { await addPower(c, 'h_afterimg', 1); } });

/* ============================ からくり人形 ============================ */
var D = 'doll';
C('d_hit', D, { name: '打撃', type: 'atk', rarity: 'S', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。', art: ['fist'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('d_wall', D, { name: '防壁', type: 'skl', rarity: 'S', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。', art: ['gear', 'shield'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('d_zap', D, { name: '放電', type: 'skl', rarity: 'S', cost: 1, costUp: 0, t: '雷核を宿す。', art: ['bolt'],
  play: async function (c) { await c.channel('spark'); } });
C('d_dual', D, { name: '二重解放', type: 'skl', rarity: 'S', cost: 1, costUp: 0, t: '核を1つ選び、2回解放する。', art: ['orb', 'burst'],
  play: async function (c) { await c.evoke({ times: 2, prompt: '2回解放する核を選ぶ' }); } });

C('d_ball', D, { name: '雷撃', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。雷核を宿す。', art: ['bolt', 'fist'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.channel('spark'); } });
C('d_cool', D, { name: '冷却', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。氷核を宿す。', art: ['snow', 'shield'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.channel('frost'); } });
C('d_charge', D, { name: '充電', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。次のターンの開始時、エナジー1を得る。', art: ['orb', 'bolt'],
  play: async function (c, me, t, v) { await blk(c, v('b')); c.hero.next.energy += 1; await c.emit('next', {}); } });
C('d_punch', D, { name: '鉄拳連打', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [1, 1], h: [2, 3] }, t: '{d}ダメージを{h}回。', art: ['fist', 'gear'],
  play: async function (c, me, t, v) { await c.attack(t, v('d'), v('h')); } });
C('d_refill', D, { name: '再充填', type: 'skl', rarity: 'C', cost: 1, costUp: 0, t: '核を1つ解放し、同じ種類の核を宿す。', art: ['orb', 'spiral'],
  play: async function (c) { var ty = await c.evoke({ prompt: '解放して宿し直す核を選ぶ' }); if (ty) await c.channel(ty); } });
C('d_beam', D, { name: '照射', type: 'atk', rarity: 'C', cost: 0, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。隙1を与える。', art: ['eye', 'bolt'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.addStatus(t, 'vuln', 1); } });
C('d_compute', D, { name: '演算', type: 'skl', rarity: 'C', cost: 1, t: '宿している核の種類の数だけカードを引く。', tu: '宿している核の種類の数+1枚、カードを引く。', tc: '宿している核の種類の数だけカードを引く（{x}枚）。',
  dyn: function (c, me) { return { x: uniq(c.hero.orbs) + (G.card.isUp(me) ? 1 : 0) }; }, art: ['gear', 'book'],
  play: async function (c, me) { var n = uniq(c.hero.orbs) + (G.card.isUp(me) ? 1 : 0); if (n) await c.drawCards(n); } });
C('d_sweep', D, { name: '掃射', type: 'atk', rarity: 'C', cost: 1, target: 'all', v: { d: [1, 1] }, t: '敵全体に{d}ダメージ。', tu: '敵全体に{d}ダメージ。カードを1枚引く。', art: ['eye', 'wave'],
  play: async function (c, me, t, v) { await c.attackAll(v('d')); if (G.card.isUp(me)) await c.drawCards(1); } });
C('d_store', D, { name: '蓄電', type: 'skl', rarity: 'C', cost: 2, costUp: 1, t: '雷核を2つ宿す。', art: ['bolt', 'orb'],
  play: async function (c) { await c.channel('spark'); await c.channel('spark'); } });
C('d_spark', D, { name: '火花', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。宿している雷核1つにつき+1。', art: ['bolt', 'burst'],
  dyn: function (c, me) { var n = c.hero.orbs.filter(function (o) { return o === 'spark'; }).length; return n ? { d: G.card.val(me, 'd') + n } : null; },
  play: async function (c, me, t, v) { await c.attack(t, v('d') + c.hero.orbs.filter(function (o) { return o === 'spark'; }).length); } });
C('d_dark', D, { name: '冥い歯車', type: 'skl', rarity: 'C', cost: 1, costUp: 0, t: '冥核を宿す。', art: ['gear', 'moon'],
  play: async function (c) { await c.channel('void'); } });
C('d_deploy', D, { name: '装甲展開', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。宿している核1つにつき、さらに盾1。', art: ['gear', 'tower'],
  dyn: function (c, me) { return { b: G.card.val(me, 'b') + c.hero.orbs.length }; },
  play: async function (c, me, t, v) { await blk(c, v('b') + c.hero.orbs.length); } });
C('d_glitch', D, { name: '誤作動', type: 'atk', rarity: 'C', cost: 1, target: 'all', v: { d: [1, 1], h: [3, 4] }, t: 'ランダムな敵に{d}ダメージを{h}回。', art: ['gear', 'crack'],
  play: async function (c, me, t, v) { await c.attackRandom(v('d'), v('h')); } });
C('d_scan', D, { name: '索敵', type: 'skl', rarity: 'C', cost: 1, v: { n: [2, 3] }, t: 'カードを{n}枚引く。', art: ['eye', 'gear'],
  play: async function (c, me, t, v) { await c.drawCards(v('n')); } });

C('d_capacity', D, { name: '核の増設', type: 'pow', rarity: 'U', cost: 2, costUp: 1, t: '核の枠を1つ増やす（最大5）。', art: ['orb', 'gear'],
  play: async function (c) { c.hero.orbSlots = Math.min(G.CAP.orbMax, c.hero.orbSlots + 1); await addPower(c, 'd_capacity', 1); } });
C('d_loop', D, { name: '循環回路', type: 'pow', rarity: 'U', cost: 1, t: 'ターン開始時、一番左の核の毎ターン効果を発動する。', tu: 'ターン開始時、一番左の核の毎ターン効果を2回発動する。', art: ['spiral', 'gear'],
  play: async function (c, me) { await addPower(c, 'd_loop', G.card.isUp(me) ? 2 : 1); } });
C('d_glacier', D, { name: '凍結装甲', type: 'skl', rarity: 'U', cost: 2, v: { b: [2, 3] }, t: '盾{b}を得る。氷核を2つ宿す。', art: ['snow', 'tower'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.channel('frost'); await c.channel('frost'); } });
C('d_blizzard', D, { name: '氷嵐', type: 'atk', rarity: 'U', cost: 1, target: 'all', t: '敵全体に、宿している氷核の数だけダメージ。', tu: '敵全体に、宿している氷核の数+1ダメージ。', tc: '敵全体に、宿している氷核の数だけダメージ（{x}）。',
  dyn: function (c, me) { return { x: c.hero.orbs.filter(function (o) { return o === 'frost'; }).length + (G.card.isUp(me) ? 1 : 0) }; }, art: ['snow', 'swirl'],
  play: async function (c, me) { var n = c.hero.orbs.filter(function (o) { return o === 'frost'; }).length + (G.card.isUp(me) ? 1 : 0); if (n > 0) await c.attackAll(n); } });
C('d_overload', D, { name: '過負荷砲', type: 'atk', rarity: 'U', cost: 2, target: 'enemy', v: { d: [5, 6] }, t: '{d}ダメージ。捨て札に「故障」を1枚加える。', art: ['burst', 'gear'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); if (!c.over) await c.addCardTo('st_glitch', 'discard'); } });
C('d_repair', D, { name: '自己修復', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: '戦闘終了時、HPを1回復する。', art: ['heart', 'gear'],
  play: async function (c) { await addPower(c, 'd_repair', 1); } });
C('d_tri', D, { name: '全核起動', type: 'skl', rarity: 'U', cost: 2, costUp: 1, t: '雷核・氷核・冥核を1つずつ宿す。', art: ['orb', 'star'],
  play: async function (c) { await c.channel('spark'); await c.channel('frost'); await c.channel('void'); } });
C('d_fission', D, { name: '核分裂', type: 'skl', rarity: 'U', cost: 0, kw: ['exhaust'], t: '核を全て取り除き、1つにつきエナジー1を得てカードを1枚引く。消滅。', tu: '核を全て解放し、1つにつきエナジー1を得てカードを1枚引く。消滅。', art: ['orb', 'crack'],
  play: async function (c, me) {
    var n = c.hero.orbs.length; if (!n) return;
    if (G.card.isUp(me)) await c.evokeAll(); else { c.hero.orbs = []; await c.emit('orbClear', {}); }
    await c.gainEnergy(n); await c.drawCards(n);
  } });
C('d_heatsink', D, { name: '蓄熱炉', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: '核を解放するたび、盾1を得る。', art: ['flame', 'gear'],
  play: async function (c) { await addPower(c, 'd_heatsink', 1); } });
C('d_barrage', D, { name: '弾幕', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [1, 1] }, t: '宿している核1つにつき{d}ダメージ（多段）。', tu: '宿している核の数+1回、{d}ダメージ（多段）。', tc: '宿している核1つにつき{d}ダメージ（{x}回）。',
  dyn: function (c, me) { return { x: c.hero.orbs.length + (G.card.isUp(me) ? 1 : 0) }; }, art: ['orb', 'arrow'],
  play: async function (c, me, t, v) { var n = c.hero.orbs.length + (G.card.isUp(me) ? 1 : 0); if (n) await c.attack(t, v('d'), n); } });
C('d_link', D, { name: '冥界接続', type: 'skl', rarity: 'U', cost: 1, costUp: 0, t: '冥核を宿す。カードを1枚引く。', art: ['moon', 'chain'],
  play: async function (c) { await c.channel('void'); await c.drawCards(1); } });
C('d_overcharge', D, { name: '過充電', type: 'skl', rarity: 'U', cost: 0, v: { e: [2, 3] }, t: 'エナジー{e}を得る。捨て札に「故障」を1枚加える。', art: ['bolt', 'crack'],
  play: async function (c, me, t, v) { await c.gainEnergy(v('e')); await c.addCardTo('st_glitch', 'discard'); } });
C('d_claw', D, { name: '鋼の鉤爪', type: 'atk', rarity: 'U', cost: 0, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。この戦闘中、全ての「鋼の鉤爪」のダメージ+1。', art: ['hand', 'gear'],
  dyn: function (c, me) { return c.flags.claw ? { d: G.card.val(me, 'd') + c.flags.claw } : null; },
  play: async function (c, me, t, v) { await c.attack(t, v('d') + (c.flags.claw || 0)); c.flags.claw = (c.flags.claw || 0) + 1; } });
C('d_coolant', D, { name: '緊急冷却', type: 'skl', rarity: 'U', cost: 1, v: { b: [2, 3] }, t: '盾{b}を得る。核を1つ解放する。', art: ['snow', 'orb'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.evoke({}); } });

C('d_echo', D, { name: '残響機関', type: 'pow', rarity: 'R', cost: 3, kw: ['ethereal'], kwUp: [], t: '毎ターン最初に使うカードを2回使う。泡沫。', tu: '毎ターン最初に使うカードを2回使う。', art: ['bell', 'gear'],
  play: async function (c) { await addPower(c, 'd_echo', 1); c.t.echo = true; } });
C('d_storm', D, { name: '雷雲生成', type: 'pow', rarity: 'R', cost: 2, t: '雷核の効果が敵全体に及ぶ。雷核を2つ宿す。', tu: '雷核の効果が敵全体に及ぶ。雷核を3つ宿す。', art: ['cloud', 'bolt'],
  play: async function (c, me) { await addPower(c, 'd_storm', 1); var n = G.card.isUp(me) ? 3 : 2; for (var i = 0; i < n; i++) await c.channel('spark'); } });
C('d_multicast', D, { name: '連続解放', type: 'skl', rarity: 'R', cost: 'X', t: '核を1つ選び、X回解放する。', tu: '核を1つ選び、X+1回解放する。', art: ['orb', 'comet'],
  play: async function (c, me, t, v, o) { var n = o.x + (G.card.isUp(me) ? 1 : 0); if (n > 0) await c.evoke({ times: n, prompt: n + '回解放する核を選ぶ' }); } });
C('d_meteor', D, { name: '隕鉄砲', type: 'atk', rarity: 'R', cost: 3, target: 'enemy', v: { d: [7, 9] }, t: '{d}ダメージ。雷核を2つ宿す。', art: ['comet', 'bolt'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.channel('spark'); await c.channel('spark'); } });
C('d_recall', D, { name: '再帰処理', type: 'skl', rarity: 'R', cost: 1, kw: ['exhaust'], kwUp: [], t: '捨て札からカードを1枚選び、手札に加える。消滅。', tu: '捨て札からカードを1枚選び、手札に加える。', art: ['spiral', 'book'],
  play: async function (c) {
    if (!c.discard.length) return;
    var r = await c.choose({ type: 'pile', cards: c.discard.slice().reverse(), n: 1, min: 1, prompt: '手札に加えるカードを選ぶ' });
    if (r && r[0]) { var ix = c.discard.indexOf(r[0]); if (ix >= 0) { c.discard.splice(ix, 1); c.hand.push(r[0]); await c.emit('draw', { cards: [r[0]], fromDiscard: true }); } }
  } });
C('d_learn', D, { name: '学習機構', type: 'pow', rarity: 'R', cost: 1, kwUp: ['innate'], t: 'ターン開始時、カードを1枚引く。', tu: '先手。ターン開始時、カードを1枚引く。', art: ['book', 'gear'],
  play: async function (c) { await addPower(c, 'd_learn', 1); } });
C('d_core', D, { name: '心核暴走', type: 'skl', rarity: 'R', cost: 1, costUp: 0, t: '核を全て解放する。', art: ['burst', 'orb'],
  play: async function (c) { await c.evokeAll(); } });
C('d_fortify', D, { name: '絶対防壁', type: 'skl', rarity: 'R', cost: 2, kw: ['exhaust'], v: { b: [5, 7] }, t: '盾{b}を得る。氷核を宿す。消滅。', art: ['tower', 'snow'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.channel('frost'); } });

/* ============================ 星詠みの巫女 ============================ */
var M = 'maiden';
C('m_palm', M, { name: '打掌', type: 'atk', rarity: 'S', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。', art: ['palm'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('m_ward', M, { name: '護り', type: 'skl', rarity: 'S', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。', art: ['lotus'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('m_eruption', M, { name: '烈火の舞', type: 'atk', rarity: 'S', cost: 2, costUp: 1, target: 'enemy', v: { d: [2, 2] }, t: '{d}ダメージ。烈の構えに入る。', art: ['flame', 'palm'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.enterStance('wrath'); } });
C('m_vigil', M, { name: '静心', type: 'skl', rarity: 'S', cost: 2, v: { b: [2, 3] }, t: '盾{b}を得る。凪の構えに入る。', art: ['lotus', 'wave'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.enterStance('calm'); } });

C('m_emptyfist', M, { name: '突き崩し', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。無の構えに戻る。', art: ['palm', 'burst'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.enterStance('none'); } });
C('m_calmprayer', M, { name: '鎮めの祈り', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。凪の構えに入る。', art: ['hand', 'wave'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.enterStance('calm'); } });
C('m_rage', M, { name: '激昂', type: 'skl', rarity: 'C', cost: 1, costUp: 0, kw: ['retain', 'exhaust'], t: '烈の構えに入る。保持。消滅。', art: ['flame', 'eye'],
  play: async function (c) { await c.enterStance('wrath'); } });
C('m_still', M, { name: '静寂', type: 'skl', rarity: 'C', cost: 1, costUp: 0, kw: ['retain', 'exhaust'], t: '凪の構えに入る。保持。消滅。', art: ['wave', 'moon'],
  play: async function (c) { await c.enterStance('calm'); } });
C('m_starread', M, { name: '星読み', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2], sc: [2, 3] }, t: '盾{b}を得る。占い{sc}。', art: ['star', 'eye'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.scry(v('sc')); } });
C('m_fate', M, { name: '運命の糸', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [1, 2], sc: [2, 2] }, t: '{d}ダメージ。占い{sc}。カードを1枚引く。', art: ['spiral', 'star'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.scry(v('sc')); await c.drawCards(1); } });
C('m_prayfist', M, { name: '祈り打ち', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。祈り1を得る。', art: ['palm', 'star'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.gainMiracle(1); } });
C('m_sleeves', M, { name: '袖返し', type: 'atk', rarity: 'C', cost: 1, target: 'enemy', kw: ['retain'], v: { d: [1, 1], h: [2, 3] }, t: '{d}ダメージを{h}回。保持。', art: ['feather', 'swirl'],
  play: async function (c, me, t, v) { await c.attack(t, v('d'), v('h')); } });
C('m_breath', M, { name: '深呼吸', type: 'skl', rarity: 'C', cost: 0, kw: ['exhaust'], t: '祈り1を得る。消滅。', tu: '祈り1を得る。カードを1枚引く。消滅。', art: ['lotus', 'star'],
  play: async function (c, me) { await c.gainMiracle(1); if (G.card.isUp(me)) await c.drawCards(1); } });
C('m_protect', M, { name: '結界', type: 'skl', rarity: 'C', cost: 1, kw: ['retain'], v: { b: [2, 3] }, t: '盾{b}を得る。保持。', art: ['lotus', 'shield'],
  play: async function (c, me, t, v) { await blk(c, v('b')); } });
C('m_halt', M, { name: '見切り', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2], e: [2, 3] }, t: '盾{b}を得る。烈の構えなら、さらに盾{e}。', art: ['eye', 'hand'],
  dyn: function (c, me) { return c.hero.stance === 'wrath' ? { b: G.card.val(me, 'b') + G.card.val(me, 'e') } : null; },
  play: async function (c, me, t, v) { await blk(c, v('b') + (c.hero.stance === 'wrath' ? v('e') : 0)); } });
C('m_flash', M, { name: '一閃', type: 'atk', rarity: 'C', cost: 2, target: 'enemy', kw: ['retain'], v: { d: [4, 5] }, t: '{d}ダメージ。保持。', art: ['moon', 'palm'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); } });
C('m_stardust', M, { name: '星屑', type: 'atk', rarity: 'C', cost: 0, target: 'enemy', v: { d: [1, 2] }, t: '{d}ダメージ。占い1。', art: ['stars'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.scry(1); } });
C('m_gassho', M, { name: '合掌', type: 'skl', rarity: 'C', cost: 1, v: { b: [1, 2] }, t: '盾{b}を得る。祈り1を得る。', art: ['hand', 'lotus'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.gainMiracle(1); } });

C('m_tantrum', M, { name: '癇癪', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [1, 1], h: [2, 3] }, t: '{d}ダメージを{h}回。烈の構えに入る。このカードを山札の一番上に置く。', art: ['flame', 'swirl'],
  play: async function (c, me, t, v) { await c.attack(t, v('d'), v('h')); await c.enterStance('wrath'); me._toDrawTop = true; } });
C('m_fortress', M, { name: '逆流', type: 'pow', rarity: 'U', cost: 1, v: { b: [1, 2] }, t: '構えを変えるたび、盾{b}を得る。', art: ['wave', 'shield'],
  play: async function (c, me, t, v) { await addPower(c, 'm_fortress', v('b')); } });
C('m_rush', M, { name: '奔流', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: '烈の構えに入るたび、カードを2枚引く。', art: ['wave', 'flame'],
  play: async function (c) { await addPower(c, 'm_rush', 1); } });
C('m_foresight', M, { name: '予知', type: 'pow', rarity: 'U', cost: 1, v: { sc: [2, 3] }, t: 'ターン開始時、占い{sc}。', art: ['eye', 'stars'],
  play: async function (c, me, t, v) { await addPower(c, 'm_foresight', v('sc')); } });
C('m_judgment', M, { name: '天罰', type: 'atk', rarity: 'U', cost: 2, target: 'all', v: { d: [2, 3] }, t: '敵全体に{d}ダメージ。ターンを終了する。', art: ['sun', 'bolt'],
  play: async function (c, me, t, v) { await c.attackAll(v('d')); c.t.endReq = true; } });
C('m_innerpeace', M, { name: '内なる平穏', type: 'skl', rarity: 'U', cost: 1, v: { n: [3, 4] }, t: '凪の構えなら、カードを{n}枚引く。そうでなければ凪の構えに入る。', art: ['lotus', 'moon'],
  play: async function (c, me, t, v) { if (c.hero.stance === 'calm') await c.drawCards(v('n')); else await c.enterStance('calm'); } });
C('m_devotion', M, { name: '献身', type: 'pow', rarity: 'U', cost: 1, costUp: 0, t: 'ターン開始時、祈り1を得る。', art: ['hand', 'star'],
  play: async function (c) { await addPower(c, 'm_devotion', 1); } });
C('m_orbit', M, { name: '星の巡り', type: 'skl', rarity: 'U', cost: 1, v: { b: [2, 3] }, t: '盾{b}を得る。次のターンの開始時、祈り1を得る。', art: ['stars', 'spiral'],
  play: async function (c, me, t, v) { await blk(c, v('b')); c.hero.next.miracle += 1; await c.emit('next', {}); } });
C('m_meditate', M, { name: '瞑想', type: 'skl', rarity: 'U', cost: 1, v: { n: [1, 2] }, t: '捨て札からカードを{n}枚選んで手札に戻し、保持する。凪の構えに入る。ターンを終了する。', art: ['lotus', 'hourglass'],
  play: async function (c, me, t, v) {
    if (c.discard.length) {
      var r = await c.choose({ type: 'pile', cards: c.discard.slice().reverse(), n: v('n'), min: 0, prompt: '手札に戻すカードを選ぶ' });
      for (var i = 0; r && i < r.length; i++) { var ix = c.discard.indexOf(r[i]); if (ix >= 0) { c.discard.splice(ix, 1); c.hand.push(r[i]); r[i].retainOnce = true; await c.emit('draw', { cards: [r[i]], fromDiscard: true }); } }
    }
    await c.enterStance('calm'); c.t.endReq = true;
  } });
C('m_offbalance', M, { name: '重心崩し', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。怯み1を与える。', art: ['palm', 'crack'],
  play: async function (c, me, t, v) { await c.attack(t, v('d')); await c.addStatus(t, 'weak', 1); } });
C('m_rite', M, { name: '祈祷', type: 'skl', rarity: 'U', cost: 1, kw: ['exhaust'], v: { n: [2, 3] }, t: '祈り{n}を得る。消滅。', art: ['candle', 'star'],
  play: async function (c, me, t, v) { await c.gainMiracle(v('n')); } });
C('m_rondo', M, { name: '輪舞', type: 'atk', rarity: 'U', cost: 1, target: 'enemy', v: { d: [2, 3], e: [2, 2] }, t: '{d}ダメージ。このターンに構えを変えていれば、さらに+{e}。', art: ['swirl', 'palm'],
  dyn: function (c, me) { return c.t.stanceChanged ? { d: G.card.val(me, 'd') + G.card.val(me, 'e') } : null; },
  play: async function (c, me, t, v) { await c.attack(t, v('d') + (c.t.stanceChanged ? v('e') : 0)); } });
C('m_moonslash', M, { name: '月光斬', type: 'atk', rarity: 'U', cost: 2, target: 'enemy', v: { d: [2, 3] }, t: '{d}ダメージ。凪の構えなら、もう一度{d}ダメージ。', art: ['moon', 'swords'],
  play: async function (c, me, t, v) { var calm = c.hero.stance === 'calm'; await c.attack(t, v('d')); if (calm && t && t.alive) await c.attack(t, v('d')); } });
C('m_flip', M, { name: '宙返り', type: 'skl', rarity: 'U', cost: 1, v: { b: [2, 3] }, t: '盾{b}を得る。カードを1枚引く。', art: ['feather', 'arrow'],
  play: async function (c, me, t, v) { await blk(c, v('b')); await c.drawCards(1); } });

C('m_divine', M, { name: '天上の祈り', type: 'skl', rarity: 'R', cost: 2, costUp: 1, kw: ['exhaust'], t: '天の構えに入る。消滅。', art: ['sun', 'crown'],
  play: async function (c) { await c.enterStance('divine'); } });
C('m_serene', M, { name: '静謐', type: 'pow', rarity: 'R', cost: 1, costUp: 0, t: 'ターン終了時、保持しているカード1枚につき盾1を得る。', art: ['lotus', 'hourglass'],
  play: async function (c) { await addPower(c, 'm_serene', 1); } });
C('m_meteor', M, { name: '流星群', type: 'atk', rarity: 'R', cost: 3, target: 'all', v: { d: [1, 1], h: [6, 8] }, t: 'ランダムな敵に{d}ダメージを{h}回。', art: ['comet', 'stars'],
  play: async function (c, me, t, v) { await c.attackRandom(v('d'), v('h')); } });
C('m_worship', M, { name: '祈りの頂', type: 'skl', rarity: 'R', cost: 2, kw: ['retain'], v: { n: [3, 4] }, t: '祈り{n}を得る。保持。', art: ['star', 'crown'],
  play: async function (c, me, t, v) { await c.gainMiracle(v('n')); } });
C('m_vault', M, { name: '時渡り', type: 'skl', rarity: 'R', cost: 3, costUp: 2, kw: ['exhaust'], t: 'このターンの後、敵のターンを飛ばす。ターンを終了する。消滅。', art: ['hourglass', 'moon'],
  play: async function (c) { c.skipEnemyTurn = true; c.t.endReq = true; } });
C('m_deva', M, { name: '星神の化身', type: 'pow', rarity: 'R', cost: 3, kw: ['ethereal'], kwUp: [], t: 'ターン開始時、エナジー1を得る。泡沫。', tu: 'ターン開始時、エナジー1を得る。', art: ['sun', 'stars'],
  play: async function (c) { await addPower(c, 'm_deva', 1); } });
C('m_oracle', M, { name: '神託', type: 'skl', rarity: 'R', cost: 3, costUp: 2, kw: ['exhaust'], t: '山札からカードを1枚選び、2回使う。消滅。', art: ['eye', 'book'],
  play: async function (c) {
    if (!c.draw.length && c.discard.length) await c.reshuffle();
    if (!c.draw.length) return;
    var r = await c.choose({ type: 'pile', cards: c.draw.slice().reverse(), n: 1, min: 1, prompt: '2回使うカードを選ぶ', hideOrder: true });
    if (r && r[0]) { var ix = c.draw.indexOf(r[0]); if (ix >= 0) { c.draw.splice(ix, 1); await c.playFree(r[0], 2); } }
  } });
C('m_wish', M, { name: '星への願い', type: 'skl', rarity: 'R', cost: 2, kw: ['exhaust'], v: { s: [2, 3], b: [6, 8], g: [3, 4] }, t: '次から1つ選ぶ：闘気{s}／盾{b}／金貨{g}。消滅。', art: ['star', 'coin'],
  play: async function (c, me, t, v) {
    var r = await c.choose({ type: 'option', prompt: '星への願い', options: [{ id: 's', label: '闘気' + v('s') + 'を得る' }, { id: 'b', label: '盾' + v('b') + 'を得る' }, { id: 'g', label: '金貨' + v('g') + 'を得る' }] });
    if (r === 's') await c.gainStr(v('s')); else if (r === 'g') { c.g.gainGold(v('g')); await c.emit('gold', { delta: v('g') }); } else await blk(c, v('b'));
  } });

/* ============================ status & curses ============================ */
C('st_slime', null, { name: '粘液', type: 'status', rarity: 'X', cost: 1, kw: ['exhaust'], t: '消滅。', art: ['drop'], play: async function () {} });
C('st_burn', null, { name: '火傷', type: 'status', rarity: 'X', cost: null, kw: ['unplayable'], t: '使用不可。ターン終了時に手札にあれば、1ダメージを受ける。', art: ['flame'],
  onTurnEndInHand: async function (c) { await c.emit('cardFlash', {}); await c.damageHero(1, { src: 'burn' }); } });
C('st_daze', null, { name: '眩暈', type: 'status', rarity: 'X', cost: null, kw: ['unplayable', 'ethereal'], t: '使用不可。泡沫。', art: ['spiral'] });
C('st_glitch', null, { name: '故障', type: 'status', rarity: 'X', cost: null, kw: ['unplayable', 'ethereal'], t: '使用不可。泡沫。', art: ['crack'] });
C('cu_regret', null, { name: '後悔', type: 'curse', rarity: 'X', cost: null, kw: ['unplayable'], t: '使用不可。ターン終了時に手札にあれば、HPを1失う。', art: ['skull'],
  onTurnEndInHand: async function (c) { await c.loseHP(1, { src: 'curse' }); } });
C('cu_doubt', null, { name: '疑念', type: 'curse', rarity: 'X', cost: null, kw: ['unplayable'], t: '使用不可。ターン終了時に手札にあれば、怯み1を得る。', art: ['eye'],
  onTurnEndInHand: async function (c) { await c.addStatus(c.hero, 'weak', 1); } });
C('cu_burden', null, { name: '重荷', type: 'curse', rarity: 'X', cost: null, kw: ['unplayable'], t: '使用不可。', art: ['chain'] });
C('cu_parasite', null, { name: '寄生', type: 'curse', rarity: 'X', cost: null, kw: ['unplayable'], t: '使用不可。デッキから取り除くと、最大HPを1失う。', art: ['mushroom'] });
G.CURSE_POOL = ['cu_regret', 'cu_doubt', 'cu_burden', 'cu_parasite'];

function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }).length; }

/* ============================ powers (display + hooks) ============================ */
P('k_steel', { name: '鋼の心', glyph: 'heart', text: function (n) { return 'ターン終了時、盾' + n + 'を得る。'; }, onTurnEnd: function (c, n) { return c.gainBlock(n); } });
P('k_burnwill', { name: '燃えさかる意志', glyph: 'flame', text: function (n) { return 'カードが消滅するたび、盾' + n + '。'; } });
P('k_ashembrace', { name: '灰の抱擁', glyph: 'ember', text: function (n) { return 'カードが消滅するたび、' + n + '枚引く。'; } });
P('k_scaroath', { name: '傷の誓い', glyph: 'blood', text: function (n) { return 'カードの効果でHPを失うたび、闘気' + n + '。'; } });
P('k_demon', { name: '魔炎の化身', glyph: 'mask', text: function (n) { return 'ターン開始時、闘気' + n + '。'; }, onTurnStart: function (c, n) { return c.gainStr(n); } });
P('k_pact', { name: '灰燼の契約', glyph: 'book', text: function () { return '技能のコスト0。使った技能は消滅。'; } });
P('k_fortress', { name: '鉄の要塞', glyph: 'tower', text: function () { return '盾がターン開始時に消えない。'; } });
P('retaliate', { name: '炎の壁', glyph: 'flame', text: function () { return '次のターンまで、攻撃を受けるたび攻撃者に1ダメージ。'; } });
P('h_incense', { name: '毒の香', glyph: 'smoke', text: function (n) { return 'ターン開始時、敵全体に毒' + n + '。'; }, onTurnStart: function (c, n) { return c.applyAll('poison', n); } });
P('h_endless', { name: '無限の刃', glyph: 'needles', text: function (n) { return 'ターン開始時、投げ針' + n + '。'; }, onTurnStart: function (c, n) { return c.gainShiv(n); } });
P('h_light', { name: '軽業', glyph: 'feather', text: function (n) { return 'カードで盾を得るとき+' + n + '。'; } });
P('h_envenom', { name: '蛾毒の調合', glyph: 'moth', text: function (n) { return '攻撃でHPを減らすたび毒' + n + '。'; } });
P('h_accuracy', { name: '千本針', glyph: 'needles', text: function (n) { return '投げ針のダメージ+' + n + '。'; } });
P('h_tools', { name: '道具箱', glyph: 'key', text: function (n) { return 'ターン開始時、' + n + '枚引き' + n + '枚捨てる。'; },
  onTurnStart: async function (c, n) { await c.drawCards(n); var p = await c.chooseHand({ n: n, prompt: '捨てるカードを選ぶ（道具箱）' }); await c.discardFromHand(p); } });
P('h_afterimg', { name: '残像', glyph: 'mask', text: function (n) { return 'カードを使うたび盾' + n + '。'; } });
P('d_capacity', { name: '核の増設', glyph: 'orb', text: function (n) { return '核の枠+' + n + '。'; } });
P('d_loop', { name: '循環回路', glyph: 'spiral', text: function (n) { return 'ターン開始時、一番左の核の毎ターン効果を' + n + '回。'; },
  onTurnStart: async function (c, n) { for (var i = 0; i < n; i++) { var o = c.hero.orbs[0]; if (!o || o === 'void') return; await c.orbPassive(o, 0); } } });
P('d_repair', { name: '自己修復', glyph: 'heart', text: function (n) { return '戦闘終了時、HP' + n + '回復。'; } });
P('d_heatsink', { name: '蓄熱炉', glyph: 'flame', text: function (n) { return '核を解放するたび盾' + n + '。'; } });
P('d_echo', { name: '残響機関', glyph: 'bell', text: function () { return '毎ターン最初のカードを2回使う。'; } });
P('d_storm', { name: '雷雲生成', glyph: 'cloud', text: function () { return '雷核の効果が敵全体に及ぶ。'; } });
P('d_learn', { name: '学習機構', glyph: 'book', text: function (n) { return 'ターン開始時、' + n + '枚引く。'; }, onTurnStart: function (c, n) { return c.drawCards(n); } });
P('m_fortress', { name: '逆流', glyph: 'wave', text: function (n) { return '構えを変えるたび盾' + n + '。'; } });
P('m_rush', { name: '奔流', glyph: 'wave', text: function (n) { return '烈の構えに入るたび' + (2 * n) + '枚引く。'; } });
P('m_foresight', { name: '予知', glyph: 'eye', text: function (n) { return 'ターン開始時、占い' + n + '。'; }, onTurnStart: function (c, n) { return c.scry(n); } });
P('m_devotion', { name: '献身', glyph: 'hand', text: function (n) { return 'ターン開始時、祈り' + n + '。'; }, onTurnStart: function (c, n) { return c.gainMiracle(n); } });
P('m_serene', { name: '静謐', glyph: 'lotus', text: function (n) { return 'ターン終了時、保持しているカード1枚につき盾' + n + '。'; },
  onTurnEnd: function (c, n) { var k = c.hand.filter(function (x) { return G.card.hasKw(x, 'retain') || x.retainOnce; }).length; return k ? c.gainBlock(k * n) : null; } });
P('m_deva', { name: '星神の化身', glyph: 'sun', text: function (n) { return 'ターン開始時、エナジー' + n + '。'; }, onTurnStart: function (c, n) { return c.gainEnergy(n); } });

/* ============================ heroes ============================ */
function rep(id, n) { var a = []; for (var i = 0; i < n; i++) a.push(id); return a; }
G.HEROES = {
  knight: { id: 'knight', name: '残り火の騎士', en: 'Ember Knight', hp: 10, relic: 's_heart', color: '#d0532f', color2: '#5a1610', energyGlyph: 'ember',
    starter: rep('k_strike', 5).concat(rep('k_guard', 4), ['k_brand']), difficulty: 1,
    lore: '燃え尽きた騎士団の最後の一人。胸の熾火が消えるまで、何度でも塔に挑む。',
    traits: ['闘気（最大8）：攻撃の1ヒットごとに+1ダメージ', '消滅させたカードを力に変える', '最大HPがいちばん高い（10）'] },
  huntress: { id: 'huntress', name: '毒蛾の狩人', en: 'Moth Huntress', hp: 9, relic: 's_moth', color: '#5fae5a', color2: '#163a1d', energyGlyph: 'moth',
    starter: rep('h_stab', 5).concat(rep('h_dodge', 5), ['h_powder', 'h_sidestep']), difficulty: 1,
    lore: '霧の森に棲む狩人。蛾の翅を纏い、針と毒で獲物を静かに仕留める。',
    traits: ['毒（全体で最大30）：ターン終了時、毒の数だけ敵のHPが減る', '投げ針（最大5）：いつでも1ダメージの攻撃として使える', '捨て札と引き直しが得意'] },
  doll: { id: 'doll', name: 'からくり人形', en: 'Clockwork Doll', hp: 9, relic: 's_spring', orbSlots: 3, color: '#4f9fd6', color2: '#132b44', energyGlyph: 'gear',
    starter: rep('d_hit', 4).concat(rep('d_wall', 4), ['d_zap', 'd_dual']), difficulty: 2,
    lore: '主を失った自動人形。胸の中で回る三つの核に、雷と氷と冥い光を宿す。',
    traits: ['核を宿す（枠3）：雷核・氷核はターン終了時に効果、解放でより強い効果', '解放する核は自由に選べる', '異能が多いほど冥核が強くなる'] },
  maiden: { id: 'maiden', name: '星詠みの巫女', en: 'Star Maiden', hp: 9, relic: 's_sand', color: '#a77bd8', color2: '#2b1a45', energyGlyph: 'moon',
    starter: rep('m_palm', 4).concat(rep('m_ward', 4), ['m_eruption', 'm_vigil']), difficulty: 3,
    lore: '星の巡りを読む巫女。静と烈、二つの構えを行き来して運命を斬り拓く。',
    traits: ['凪の構え：構えを離れるときエナジー2', '烈の構え：ヒットごとに+1ダメージ。ターン終了時に1ダメージを受ける', '祈り（最大5）：いつでもエナジー1に換えられる'] }
};

/* ============================ glossary ============================ */
G.KEYWORDS = {
  '消滅': '使うと、この戦闘中は戻ってこない。',
  '泡沫': 'ターン終了時に手札にあると消滅する。',
  '保持': 'ターン終了時に捨てられず、手札に残る。',
  '先手': '戦闘開始時、必ず最初の手札に入る。',
  '使用不可': 'このカードは使えない。',
  '闘気': '攻撃の1ヒットごとにダメージ+1（最大8）。',
  '怯み': '攻撃するとき1ヒットごとに-1。攻撃のあと1つ減る（最大3）。',
  '隙': '攻撃を受けるとき1ヒットごとにダメージ2倍。攻撃のあと1つ減る（最大3）。',
  '毒': 'あなたのターン終了時、毒の数だけHPを失う。毒は減らない（敵全体で最大30）。',
  '投げ針': 'いつでも1ダメージの攻撃として使えるトークン（最大5）。',
  '祈り': 'いつでもエナジー1に換えられるトークン（最大5）。',
  '凪の構え': 'この構えを離れるとき、エナジー2を得る。',
  '烈の構え': 'ヒットごとにダメージ+1。この構えでターンを終えると1ダメージを受ける。',
  '天の構え': '入ったときエナジー2。ヒットごとにダメージ+2。次のターン開始時に無の構えに戻る。',
  '無の構え': '何の効果もない構え。',
  '占い': '山札の上から指定の枚数を見て、好きな枚数を捨て札にする。',
  '雷核': 'ターン終了時、狙った敵に1ダメージ。解放：2ダメージ。',
  '氷核': 'ターン終了時、盾1。解放：盾2。',
  '冥核': '毎ターン効果なし。解放：3＋場の異能の数だけダメージ。',
  '宿す': '空いた核の枠に核を置く。枠が埋まっていれば、核を1つ解放してから置く。',
  '解放': '核を取り除き、その解放効果を発動する。',
  '盾': '受けるダメージを先に防ぐ（最大20）。あなたのターン開始時に消える。',
  'X': '残りのエナジーをすべて使い、その数をXとする。'
};
})();

/* スレイザスパイア — enemies of Acts I–IV, encounter/elite/boss cards, summon decks and act tables.
   Enemy actions follow the printed enemy cards (Bestiary transcription in StSBoardGameMod); Act I party data
   from the publisher's TTS module. Multiplayer HP: Act I elite/boss tables from TTS; others = solo HP × players. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var M = STS.MONSTERS = {}, E = STS.ENCOUNTERS = {}, SUM = STS.SUMMONS = {}, ACTS = STS.ACTS = {};

function mon(id, o) { o.id = id; M[id] = o; return o; }
function A(name, fx, o) { return Object.assign({ name: name, fx: fx }, o || {}); }
function aoe(name, fx, o) { return A(name, fx, Object.assign({ aoe: true }, o || {})); }
function hit(n, x) { return ['hit', n, x || 1]; }
function ahit(n, x) { return ['ahit', n, x || 1]; }
function per(base) { return function (asc, n) { return base * n; }; }
function perAsc(a0, a1, a12, key) { return function (asc, n) { var v = asc >= (key || 12) ? a12 : asc >= 1 ? a1 : a0; return v * n; }; }
function table(t) { return function (asc, n) { return t[n - 1]; }; }

/* Shared monster abilities */
var curlUp = {
  onDamaged: async function (cb, e, dmg, hp, o) { if (!e.x.curled && dmg > 0 && !e.dead) { e.x.curled = true; e.blk += 2; cb.emit({ t: 'eblk', u: e.u, n: 2, why: '丸まる' }); } }
};
function angry(cb, e, dmg, hp, o) { if (o && o.hit && dmg > 0 && !e.dead) cb.enemyStr(e, 1); }

/* ================================================================== ACT I */
mon('AcidSlimeM', { name: 'アシッドスライムM', art: 'acid-slime-m', hp: 5, type: 'die', beh: 'CAL',
  acts: { C: A('腐食粘液', [hit(2), ['daze', 1]]), L: A('舐める', [['weak', 1]]), A: A('体当たり', [hit(2)]) } });
mon('SpikeSlimeM', { name: 'スパイクスライムM', art: 'spike-slime-m', hp: 5, type: 'die', beh: '2DV',
  acts: { V: A('炎の舌', [hit(1), ['vuln', 1]], { last: true }), D: A('体当たり', [hit(1), ['daze', 1]]), '2': A('突撃', [hit(2)]) } });
mon('SmallSlime', { name: 'スパイクスライムS', art: 'spike-slime-s', hp: 3, type: 'single', acts: [A('体当たり', [hit(1)])] });
mon('LargeSlimeE', { name: 'アシッドスライムL', art: 'acid-slime-l', type: 'cube', hp: function (asc) { return asc >= 7 ? 9 : 8; },
  track: function (cb) { var a7 = cb.asc() >= 7; return [aoe('腐食粘液', [hit(a7 ? 2 : 1)]), A('体当たり', [hit(4), ['daze', a7 ? 2 : 1]]), A('分裂の準備', [['fn', 'split']])]; }, loop: 0,
  fns: { split: async function (cb, e) { cb.queueSummon('acid', e.row); } } });
mon('LargeSlime', { name: 'アシッドスライムL', art: 'acid-slime-l', hp: 12, type: 'die', beh: '4SW',
  acts: { W: A('舐める', [hit(1), ['weak', 2]]), '4': A('体当たり', [hit(4)]), S: A('腐食粘液', [hit(3), ['slime', 2]]) } });
mon('JawWorm', { name: 'ジョーワーム', art: 'jaw-worm', type: 'die',
  hp: function (asc, n, cb) { return 8; },
  onSpawn: function (cb, e, o) { e.x.lvl = o.lvl || 'easy'; e.hp = e.max = { easy: 8, medium: 10, hard: 10, a7: 7 }[e.x.lvl]; },
  acts: function (cb, e) {
    var hard = e.x.lvl === 'hard', med = e.x.lvl === 'medium' || hard;
    var bellow = A('咆哮', [['blk', hard ? 3 : 2], ['str', 1]]), thrash = A('のたうち回る', [hit(med ? 3 : 2), ['blk', 1]]), chomp = A('噛みつき', [hit(med ? 4 : 3)]);
    return { s: bellow, S: bellow, d: thrash, D: thrash, a: chomp, A: chomp };
  } });
mon('Cultist', { name: '狂信者', art: 'cultist', hp: 9, type: 'single', acts: [A('儀式', [hit(1), ['str', 1]])] });
mon('RedLouse', Object.assign({ name: 'レッドロース', art: 'red-louse', type: 'die', hp: 3,
  onSpawn: function (cb, e, o) { if (o.hard) { e.hp = e.max = 4; } },
  acts: { S: A('成長', [['str', 1]]), '1': A('噛みつき', [hit(1)]), '2': A('噛みつき', [hit(2)]) } }, curlUp));
mon('GreenLouse', Object.assign({ name: 'グリーンロース', art: 'green-louse', type: 'die', hp: 3, beh: '1W2',
  acts: { '1': A('噛みつき', [hit(1)]), '2': A('噛みつき', [hit(2)]), W: A('糸を吐く', [['weak', 1]]) } }, curlUp));
mon('FungiBeast', { name: 'ファンガスビースト', art: 'fungi-beast', type: 'die', hp: 5,
  onSpawn: function (cb, e, o) { if (o.a7) { e.hp = e.max = 6; } },
  acts: { '2': A('噛みつき', [hit(2)]), '1': aoe('胞子', [hit(1), ['str', 1]]), S: A('成長', [['str', 2]]), s: A('成長', [['str', 1]]), '!': A('噛みつき', [hit(1), ['str', 1]]) },
  onDeath: async function (cb, e) { var p = cb.pcInRow(e.row); if (p) cb.vulnPlayer(p, 1); cb.log('胞子雲：弱体化1'); } });
mon('MadGremlin', { name: '怒れるグレムリン', art: 'mad-gremlin', hp: 4, type: 'single', acts: [A('引っかく', [hit(1)])], onDamaged: angry });
mon('FatGremlin', { name: '太ったグレムリン', art: 'fat-gremlin', hp: 3, type: 'single', acts: [aoe('叩きつけ', [hit(1)])] });
mon('SneakyGremlin', { name: 'ずるいグレムリン', art: 'sneaky-gremlin', hp: 2, type: 'single', acts: [A('突き刺し', [hit(2)])] });
mon('GremlinWizard', { name: 'グレムリンウィザード', art: 'gremlin-wizard', hp: 4, type: 'cube', track: [A('魔力を溜める', [['none']]), aoe('究極の爆発', [hit(3)])], loop: 1 });
mon('BlueSlaver', { name: 'ブルースレイバー', art: 'blue-slaver', hp: 10, type: 'die', beh: 'W3D',
  acts: { d: A('刺し傷', [hit(2), ['daze', 1]]), D: A('刺し傷', [hit(3), ['daze', 1]]), W: A('かみそり', [hit(2), ['weak', 1]]), '2': A('刺し傷', [hit(2)]), '3': A('刺し傷', [hit(3)]) } });
mon('RedSlaver', { name: 'レッドスレイバー', art: 'red-slaver', hp: 10, type: 'die', beh: 'DV3',
  actsLast: function (cb, e) { return !!e.x.eliteSlaver; },
  acts: { D: A('刺し傷', [hit(2), ['daze', 1]]), V: A('のこぎり', [hit(2), ['vuln', 1]], { last: true }), '3': A('刺し傷', [hit(3)]) } });
function thief(id, name, art, track) {
  return mon(id, { name: name, art: art, type: 'cube', hp: 9,
    onSpawn: function (cb, e, o) { if (o.hp == null) e.hp = e.max = (o.lvl === 'hard' ? 10 : o.lvl === 'a7' ? 7 : (M[id].baseHp || 9)); },
    track: track, loop: track.length - 1,
    fns: { flee: async function (cb, e) {
      var p = cb.pcInRow(e.row);
      if (p) { var P = cb.P(p); var lost = Math.min(2, P.gold); P.gold -= lost; cb.emit({ t: 'gold', i: p.i, n: -lost }); }
      e.fled = true; cb.s.fled.push(e.u); cb.emit({ t: 'flee', u: e.u }); cb.log(M[id].name + 'が逃げた（報酬は得られる）');
      cb.checkEnd();
    } } });
}
thief('Looter', 'ルーター', 'looter', [A('切りつけ', [hit(2)]), A('切りつけ', [hit(3), ['blk', 1]]), A('逃走', [['fn', 'flee']])]);
thief('Mugger', 'マガー', 'looter', [A('切りつけ', [hit(2), ['blk', 1]]), A('切りつけ', [hit(2)]), A('大切り', [hit(4), ['blk', 2]]), A('逃走', [['fn', 'flee']])]);
M.Mugger.baseHp = 12;
mon('Sentry', { name: 'セントリー', art: 'sentries', type: 'die', beh: 'D3',
  hp: 7, onSpawn: function (cb, e, o) { if (o.hp == null) e.hp = e.max = (e.beh === '3D' ? 8 : 7); },
  acts: { D: A('ボルト', [['daze', 1]]), '3': A('ビーム', [hit(3)]), '2': A('ビーム', [hit(2)]) } });
mon('SentryElite', { name: 'セントリー（エリート）', art: 'sentries', elite: true,
  hp: function (asc) { return asc >= 12 ? 9 : asc >= 1 ? 8 : 7; },
  type: 'cube',
  action: function (cb, e) {
    var asc = cb.asc();
    if (asc === 0) { var d = cb.s.die; return d <= 3 ? A('ビーム', [hit(2)]) : A('ボルト', [['daze', 1]]); }
    var tr = [asc >= 12 ? aoe('ボルト', [['daze', 1]]) : A('ボルト', [['daze', 1]]), A('ビーム', [hit(2)]), A('ボルト', [['daze', 2]])];
    return tr[e.cube % 3];
  },
  advance: function (cb, e) { e.cube = (e.cube + 1) % 3; } });
mon('GremlinNob', { name: 'グレムリンノブ', art: 'gremlin-nob', elite: true, type: 'cube',
  hp: function (asc, n) { var t = asc >= 12 ? 19 : asc >= 1 ? 17 : 14; return t * n; },
  track: function (cb) { var asc = cb.asc(); return [A('咆哮', (asc >= 12 ? [ahit(1)] : []).concat([['fn', 'enrage']])), aoe('ラッシュ', [hit(3)].concat(asc >= 1 ? [['str', 1]] : []))]; }, loop: 1,
  fns: { enrage: async function (cb, e) { e.x.enraged = true; cb.log('グレムリンノブは激怒した！'); } },
  afterPlayerCard: async function (cb, e, pc, c) { if (e.x.enraged && c && STS.CARDS[c.id] && STS.CARDS[c.id].t === 'S') await cb.damagePlayer(pc, 1, { enemy: e, why: '激怒' }); } });
mon('Lagavulin', { name: 'ラガヴーリン', art: 'lagavulin', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 24 : 22) * n; },
  track: function (cb) {
    var asc = cb.asc();
    if (asc >= 12) return [aoe('魂抜き', [['weak', 2]]), aoe('攻撃', [hit(4), ['str', 1]]), aoe('攻撃', [hit(4)])];
    if (asc >= 1) return [aoe('魂抜き', [['weak', 2]]), aoe('攻撃', [hit(4)]), aoe('攻撃', [hit(4), ['str', 1]])];
    return [A('睡眠', [['none']]), aoe('攻撃', [hit(4)]), aoe('攻撃', [hit(4)]), aoe('魂抜き', [['weak', 2], ['str', 1]])];
  },
  loop: function (cb) { return cb.asc() >= 1 ? 0 : 1; } });
mon('SlimeBoss', { name: 'スライムボス', art: 'slime-boss', boss: true, type: 'cube',
  hp: function (asc, n) { return asc >= 10 ? 23 * n : [22, 44, 66, 88][n - 1]; },
  track: function (cb) { var a10 = cb.asc() >= 10; return [A('ねばねば', [['slime', a10 ? 4 : 3]]), A('準備', [hit(3), ['slime', 2]]), A('叩きつけ', [hit(6)])]; }, loop: 0,
  onDeath: async function (cb, e) {
    // Split: at the start of next round, summon Large, Acid and Spike Slime for each player.
    for (var r = 0; r < cb.n(); r++) {
      cb.queueSummon('large', r, { keep: true, opts: { bossSplit: true } });
      cb.queueSummon('acid', r, { keep: true });
      cb.queueSummon('spike', r, { keep: true });
    }
  } });
M.LargeSlime.onSpawn = function (cb, e, o) { if (o.bossSplit && cb.asc() >= 10) e.str = 1; };
mon('Hexaghost', { name: 'ヘクサゴースト', art: 'hexaghost', boss: true, type: 'cube',
  hp: function (asc, n) { var t = [36, 75, 112, 150][n - 1]; return asc >= 10 ? t + 2 * n : t; },
  track: function (cb) {
    var a10 = cb.asc() >= 10;
    return [A('点火', [hit(1), ['burn', a10 ? 2 : 1]]), A('炎上', [hit(2, 2), ['burn', 1]]), A('業火', [['burn', 2]]), A('鎮火', [hit(a10 ? 4 : 3), ['blk', 5]]),
      A('点火', [hit(a10 ? 3 : 2), ['burn', 1]]), A('地獄の業火', [hit(3, 2), ['burn', 2], ['str', 1]])];
  }, loop: 0 });
mon('Guardian', { name: 'ガーディアン', art: 'the-guardian', boss: true, startMode: 'attack', type: 'cube',
  hp: function (asc, n) { return 40 * n; },
  action: function (cb, e) {
    var a10 = cb.asc() >= 10;
    if (e.mode === 'attack') {
      if (e.cube === 0) return A('旋回して防御', [hit(2), ['fn', 'guard']]);
      return A('モードシフト', [['fn', 'shift']]);
    }
    if (e.cube === 0) return A('防御モードA', [hit(a10 ? 3 : 2)]);
    return A('防御モードB', [hit(4), ['str', 1], ['fn', 'toAttack']]);
  },
  advance: function (cb, e) {
    if (e.x.modeNext) { e.mode = e.x.modeNext; e.x.modeNext = null; e.cube = 0; return; }
    e.cube = (e.cube + 1) % 2;
  },
  fns: {
    guard: async function (cb, e) { e.blk += (cb.asc() >= 10 ? 6 : 5) * cb.n(); cb.emit({ t: 'eblk', u: e.u }); },
    shift: async function (cb, e, a, ctx) {
      // Mode Shift: if The Guardian started this turn with no Block, it doesn't attack and enters Defensive Mode next round.
      if (!e.x.startBlk) { e.x.modeNext = 'defense'; cb.log('ガーディアンは防御モードへ移行する'); return; }
      var ts = cb.targetsOf(e, true);
      for (var i = 0; i < ts.length; i++) await cb.enemyHit(e, ts[i], cb.asc() >= 10 ? 7 : 6, ctx);
      ctx.attacked = true;
    },
    toAttack: async function (cb, e) { e.x.modeNext = 'attack'; }
  },
  afterPlayerCard: async function (cb, e, pc, c) { if (e.mode === 'defense' && c && (c.shiv || (STS.CARDS[c.id] && STS.CARDS[c.id].t === 'A'))) await cb.damagePlayer(pc, 1, { enemy: e, why: '鋭い外殻' }); } });

/* ================================================================== ACT II */
mon('Chosen', { name: 'チョーズン', art: 'chosen', type: 'cube', hp: 14,
  track: [aoe('突き刺し', [hit(1), ['daze', 1]]), A('毒舌', [hit(3), ['daze', 2]]), A('攻撃', [hit(5), ['str', 1]])], loop: 1 });
mon('Byrd', { name: 'ビルド', art: 'byrd', type: 'die', beh: 'S13', hp: 4,
  acts: { '1': A('つつく', [hit(1, 2)]), '3': A('急降下', [hit(3)]), S: A('羽ばたき', [['str', 1]]) },
  hitTaken: function (cb, e, dmg) { return Math.min(1, dmg); } });
mon('Centurion', { name: 'センチュリオン', art: 'centurion', type: 'die', beh: 'B3', hp: 15,
  acts: { B: A('防御', [['fn', 'protect']]), '3': A('斬撃', [hit(3)]) },
  action: function (cb, e) {
    if (e.x.fury) return A('激怒の斬撃', [hit(3)]);
    var beh = e.beh, d = cb.s.die, ch = beh[d <= 3 ? 0 : 1];
    return ch === 'B' ? A('防御', [['fn', 'protect']]) : A('斬撃', [hit(3)]);
  },
  fns: { protect: async function (cb, e) { var m = cb.alive().filter(function (x) { return x.id === 'Mystic' && x.row === e.row; })[0]; if (m) { m.blk += 3; cb.emit({ t: 'eblk', u: m.u }); } } } });
mon('Mystic', { name: 'ミスティック', art: 'mystic', type: 'die', beh: 'H2S', hp: 12,
  acts: { '2': A('攻撃', [hit(2), ['weak', 1]]), H: A('治癒', [['healAll', 3]]), S: A('鼓舞', [['strAll', 1]], { last: true }) },
  onDeath: async function (cb, e) {
    cb.alive().forEach(function (c) { if (c.id === 'Centurion' && c.row === e.row && !c.x.fury) { c.x.fury = true; cb.enemyStr(c, 1); cb.log('センチュリオンは激怒した！'); } });
  } });
M.Mugger.name = 'マガー';
mon('ShelledParasite', { name: '寄生甲殻獣', art: 'shelled-parasite', type: 'cube', hp: 18,
  onSpawn: function (cb, e, o) { if (o.a7) e.hp = e.max = 16; },
  track: [A('二連撃', [hit(4), ['blk', 2]]), A('吸う', [hit(3), ['vuln', 1], ['blk', 2]]), aoe('打撃', [hit(2), ['blk', 2]])], loop: 1 });
mon('SnakePlant', { name: 'スネークプラント', art: 'snake-plant', type: 'die', beh: 'MMW', hp: 17,
  acts: function (cb) { return { M: cb.asc() >= 7 ? A('噛みつき', [hit(3), ahit(2)]) : A('噛みつき', [hit(3), hit(2)]), W: A('胞子', [['weak', 1]]) }; } });
mon('Snecko', { name: 'スネッコ', art: 'snecko', type: 'die', beh: '342', hp: 23,
  acts: { '3': A('噛みつき（混乱2）', [hit(3)], { confused: 2 }), '4': A('尻尾攻撃（混乱1）', [hit(5)], { confused: 1 }), '2': A('凝視（混乱3）', [hit(2)], { confused: 3 }) },
  turnStart: async function (cb, e) {
    // If Snecko is in your row, the first card you play this turn costs the Confused value.
    var a = cb.currentAction(e), p = cb.pcInRow(e.row);
    if (p && a && a.confused != null) { p.t.snecko = a.confused; p.t.sneckoUsed = false; }
  } });
mon('SphericGuardian', { name: 'スフィアガーディアン', art: 'spheric-guardian', type: 'cube', hp: 5, barricade: true,
  start: async function (cb, e) { e.blk += 10; },
  track: [A('殴打と硬化', [hit(2), ['blk', 5]]), A('殴打', [hit(5)])], loop: 0 });
mon('BronzeOrb', { name: 'ブロンズオーブ', art: 'bronze-orb', type: 'die', beh: '3DB', hp: 19,
  acts: { '3': A('ビーム', [hit(3)]), D: A('照射', [hit(2), ['weak', 1]]), B: A('支援', [['fn', 'support']]) },
  fns: { support: async function (cb, e) { var a = cb.alive().filter(function (x) { return x.id === 'Automaton'; })[0]; if (a) { a.blk += 3; cb.emit({ t: 'eblk', u: a.u }); } } } });
mon('TorchHead', { name: 'トーチヘッド', art: 'torch-head', type: 'single', hp: 9, acts: [A('体当たり', [hit(1)])] });
mon('BookOfStabbing', { name: 'ブック・オブ・スタビング', art: 'book-of-stabbing', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 36 : asc >= 1 ? 35 : 30) * n; },
  track: function (cb) {
    var asc = cb.asc();
    var multi = aoe('連続突き', [hit(1, 2), ['str', 1]]), big = A('大突き', [hit(asc >= 12 ? 4 : 3), ['str', 1]]);
    return asc >= 1 ? [big, multi] : [multi, big];
  }, loop: 0,
  afterAct: async function (cb, e, a, ctx) {
    // Painful Stabs: players who took unblocked damage from this attack gain a Daze.
    var hurt = ctx.unblocked || [];
    for (var i = 0; i < hurt.length; i++) await cb.addStatus(hurt[i], 'Daze', 1, 'drawTop');
  },
  afterHit: async function (cb, e, pc, r, ctx) { if (r.hp > 0) { ctx.unblocked = ctx.unblocked || []; if (ctx.unblocked.indexOf(pc) < 0) ctx.unblocked.push(pc); } } });
mon('GremlinLeader', { name: 'グレムリンリーダー', art: 'gremlin-leader', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 40 : asc >= 1 ? 35 : 30) * n; },
  track: function (cb) {
    var asc = cb.asc();
    return [aoe('激励', [hit(asc >= 1 ? 3 : 2), ['blkAll', 1], ['strAll', 1]]), aoe('刺突', [hit(5)]), A('集結', [['fn', 'revive']].concat(asc >= 12 ? [['strAll', 1]] : []))];
  }, loop: 0,
  fns: { revive: async function (cb, e) {
    cb.s.enemies.forEach(function (g) {
      if (g.dead && g.gremlin) { g.dead = false; g.hp = g.max; g.blk = 0; g.str = 0; g.weak = 0; g.vuln = 0; g.psn = 0; g.cube = 0; cb.emit({ t: 'spawn', u: g.u }); }
    });
    cb.log('グレムリンリーダーが手下を呼び戻した！');
  } } });
mon('Taskmaster', { name: 'タスクマスター', art: 'taskmaster', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 16 : asc >= 1 ? 15 : 13) * n; },
  track: function (cb) {
    var asc = cb.asc();
    if (asc >= 12) return [aoe('鞭打ち', [hit(1), ['daze', 1], ['str', 1]])];
    if (asc >= 1) return [aoe('鞭打ち', [hit(1)]), aoe('鞭打ち', [hit(2), ['daze', 1], ['str', 1]])];
    return [aoe('鞭打ち', [hit(1), ['str', 1]])];
  }, loop: function (cb) { return cb.asc() >= 1 && cb.asc() < 12 ? 1 : 0; } });
mon('Automaton', { name: 'ブロンズオートマトン', art: 'bronze-automaton', boss: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 10 ? 60 : 55) * n; },
  track: function (cb) {
    var a10 = cb.asc() >= 10;
    var boost = A('強化', [['str', 1]].concat(a10 ? [['fn', 'cleanse']] : []));
    return [boost, A('殴打', [hit(1, 2)]), A('強化', [['str', 1], ['fn', 'cleanse']]), A('ハイパービーム', [hit(a10 ? 9 : 7)])];
  }, loop: 0,
  fns: { cleanse: async function (cb, e) { e.weak = 0; e.vuln = 0; } } });
mon('Champ', { name: 'チャンプ', art: 'champ', boss: true, startMode: 'normal', type: 'cube',
  hp: function (asc, n) { return (asc >= 10 ? 45 : 40) * n; },
  action: function (cb, e) {
    var a10 = cb.asc() >= 10;
    if (e.mode === 'fury') {
      if (e.cube === 0) return A('怒り', [['fn', 'cleanse']]);
      if (e.cube === 1) return A('処刑', [hit(4, 2)]);
      return A('雄叫び', [['str', a10 ? 2 : 1]]);
    }
    return [A('強打', [hit(4)]), A('威圧', [['weak', 1], ['str', 1]]), A('防御と攻撃', [hit(a10 ? 6 : 5), ['blk', 3]])][e.cube % 3];
  },
  advance: function (cb, e) { if (e.mode === 'fury') e.cube = e.cube >= 2 ? 1 : e.cube + 1; else e.cube = (e.cube + 1) % 3; },
  beforeDeath: async function (cb, e) {
    if (e.mode === 'fury') return false;
    // Anger: at 0 HP, heal 40 per player and enter Fury Mode (intent changes immediately).
    e.mode = 'fury'; e.cube = 0; e.hp = Math.min(e.max, 40 * cb.n()); cb.emit({ t: 'eheal', u: e.u }); cb.log('チャンプは怒り狂った！');
    return true;
  },
  fns: { cleanse: async function (cb, e) { e.weak = 0; e.vuln = 0; } } });
mon('Collector', { name: 'コレクター', art: 'collector', boss: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 10 ? 60 : 57) * n; },
  action: function (cb, e) {
    var a10 = cb.asc() >= 10;
    return [A('召喚', [['fn', 'summon']]), A('火球', [hit(3), ['strAll', 1]]), A('強打', [hit(a10 ? 6 : 5)]),
      A('メガデバフ', [['weak', 2], ['daze', 2], ['burn', a10 ? 3 : 2]])][e.cube];
  },
  advance: function (cb, e) { if (e.cube === 2 && !e.x.debuffed) e.cube = 3; else if (e.cube === 3) { e.x.debuffed = true; e.cube = 0; } else e.cube = (e.cube + 1) % 3; },
  fns: { summon: async function (cb, e) {
    for (var r = 0; r < cb.n(); r++) {
      var have = cb.alive().filter(function (x) { return x.id === 'TorchHead' && x.row === r; }).length;
      for (var i = have; i < 2; i++) cb.summonFrom('torch', r);
    }
  } } });

/* ================================================================== ACT III */
mon('Darkling', { name: 'ダークリング', art: 'darkling', type: 'die', beh: '2S3', hp: 8,
  acts: { '2': A('爪', [hit(2, 2)]), S: A('硬化', [['blk', 3], ['str', 1]]), '3': A('噛みつき', [hit(3)]) },
  roundStart: async function (cb, e) {
    // Regrow: dead Darklings return with 4 HP, unless all Darklings are dead.
    if (!e.dead) return;
    var anyAlive = cb.alive().some(function (x) { return x.id === 'Darkling' && x.row === e.row; });
    if (!anyAlive) return;
    e.dead = false; e.hp = 4; e.blk = 0; e.str = 0; e.weak = 0; e.vuln = 0; e.psn = 0;
    cb.emit({ t: 'spawn', u: e.u }); cb.log('ダークリングが再生した');
  } });
mon('Exploder', { name: 'エクスプローダー', art: 'exploder', type: 'cube', hp: 8,
  track: [A('体当たり', [hit(3)]), A('…', [['none']]), aoe('爆発', [hit(10), ['fn', 'die']])], loop: 2,
  fns: { die: async function (cb, e) { await cb.killEnemy(e, { self: true }); } } });
mon('Repulsor', { name: 'リパルサー', art: 'repulsor', type: 'die', beh: '3D', hp: 7,
  acts: { D: A('反発', [hit(1), ['daze', 2]]), '3': A('攻撃', [hit(3)]) } });
mon('Spiker', { name: 'スパイカー', art: 'spiker', type: 'die', beh: '2T', hp: 10,
  start: async function (cb, e) { e.x.thorns = 1; },
  acts: { '2': A('切り裂き', [hit(2)]), T: A('トゲを伸ばす', [['fn', 'thorns']]) },
  fns: { thorns: async function (cb, e) { e.x.thorns = Math.min(5, (e.x.thorns || 1) + 1); } },
  afterPlayerCard: async function (cb, e, pc, c, k) {
    // Thorns: after you play an Attack against Spiker, take damage.
    var isAtk = c && (c.shiv || (STS.CARDS[c.id] && STS.CARDS[c.id].t === 'A'));
    if (!isAtk || !k) return;
    var against = k.target === e || (k.row != null && (e.row === k.row)) || (k.tg === 'A');
    if (against && !e.dead) await cb.damagePlayer(pc, e.x.thorns || 1, { enemy: e, why: 'トゲ' });
  } });
mon('OrbWalker', { name: 'オーブウォーカー', art: 'orb-walker', type: 'die', beh: '23', hp: 22,
  acts: { '2': A('爪', [hit(2), ['str', 2]]), '3': A('レーザー', [hit(3), ['daze', 1], ['str', 1]]) } });
mon('SpireGrowth', { name: 'スパイアグロース', art: 'spire-growth', type: 'die', beh: '24', hp: 28,
  action: function (cb, e) {
    if (cb.s.round <= 1 && !e.x.acted) return A('なし', [['none']]);
    return cb.s.die <= 3 ? A('締め付け', [hit(2), ahit(3)]) : A('叩きつけ', [hit(4), ahit(2)]);
  },
  afterAct: async function (cb, e) { e.x.acted = true; } });
mon('Transient', { name: 'トランジェント', art: 'transient', type: 'cube', hp: 99,
  track: [A('攻撃', [hit(6)]), A('攻撃', [hit(9)]), A('攻撃', [hit(12)]), A('攻撃', [hit(15), ['fn', 'fade']])], loop: 3,
  capLoss: function (cb, e, loss) { return Math.min(loss, Math.max(0, e.hp)); },
  onDamaged: async function (cb, e, dmg, hp) { if (hp > 0) { var p = cb.pcInRow(e.row); if (p) await cb.gainBlock(p, hp); } },
  fns: { fade: async function (cb, e) { e.fled = true; e.faded = true; cb.emit({ t: 'flee', u: e.u }); cb.log('トランジェントは消えた'); cb.checkEnd(); } } });
mon('Maw', { name: 'マウ', art: 'maw', type: 'cube', hp: 28,
  track: function (cb) { return [aoe('咆哮', (cb.asc() >= 7 ? [hit(2)] : []).concat([['vuln', 1]]), { last: true }), A('叩きつけ', [hit(2, 2)]), A('むさぼる', [['str', 2]]), A('食らう', [hit(8)])]; }, loop: 1 });
mon('WrithingMass', { name: 'のたうつ塊', art: 'writhing-mass', type: 'die', beh: '123456', hp: 27,
  acts: { '1': aoe('寄生', [['vuln', 1]], { last: true }), '2': aoe('のたうち', [['daze', 2]]), '3': A('多重打撃', [hit(3, 2)]), '4': A('打撃と防御', [hit(5), ['blk', 5]]), '5': A('強打', [hit(7)]), '6': A('毒の打撃', [hit(4), ['weak', 1]]) },
  onDamaged: async function (cb, e, dmg, hp, o) {
    // Reactive: when damaged by an Attack, roll the die (no relics); all enemy die actions change.
    if (o && o.attack && dmg > 0 && !e.dead && cb.s.phase === 'play') { cb.s.die = cb.rnd(6) + 1; cb.emit({ t: 'die', v: cb.s.die, reactive: true }); cb.log('のたうつ塊：ダイスを振り直した（' + cb.s.die + '）'); }
  } });
mon('SnakeDagger', { name: '蛇の短剣', art: 'dagger', type: 'cube', hp: 5,
  track: [A('突き刺し', [hit(2)]), A('自爆', [hit(5), ['fn', 'die']])], loop: 1,
  fns: { die: async function (cb, e) { await cb.killEnemy(e, { self: true }); } } });
mon('GiantHead', { name: 'ジャイアントヘッド', art: 'giant-head', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 90 : asc >= 1 ? 85 : 80) * n; },
  hitTaken: function (cb, e, dmg) { return dmg + 1; },
  track: function (cb) {
    var asc = cb.asc();
    return [A('「3…」', [['none']]), asc >= 1 ? aoe('「2…」', [hit(asc >= 12 ? 6 : 5)]) : A('「2…」', [['none']]), A('「1…」', [['none']]), aoe('お前の時間だ', [hit(asc >= 12 ? 9 : asc >= 1 ? 8 : 7), ['str', 1]])];
  }, loop: 3 });
mon('Nemesis', { name: 'ネメシス', art: 'nemesis', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 36 : asc >= 1 ? 35 : 30) * n; },
  track: function (cb) {
    var asc = cb.asc();
    return [aoe('業火', [['burn', asc >= 1 ? 5 : 4]]), aoe('大鎌', [hit(asc >= 12 ? 6 : asc >= 1 ? 5 : 4)], { intangible: true }),
      aoe('攻撃', asc >= 12 ? [hit(2, 3), ['burn', 2]] : [hit(2, 2), ['burn', 1]]), aoe('大鎌', [hit(asc >= 1 ? 8 : 7)], { intangible: true })];
  }, loop: 2,
  // "Nemesis can't lose HP this turn": printed on the Scythe boxes, so it applies during the round in which the
  // cube is on that box (the players' turn before Nemesis attacks).
  capLoss: function (cb, e, loss) { var a = cb.currentAction(e); return a && a.intangible ? 0 : loss; } });
mon('Reptomancer', { name: 'レプトマンサー', art: 'reptomancer', elite: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 12 ? 42 : asc >= 1 ? 40 : 35) * n; },
  track: function (cb) {
    var asc = cb.asc();
    if (asc >= 1) return [A('召喚', [['fn', 'summon']]), aoe('噛みつき', [hit(7), ['daze', asc >= 12 ? 2 : 1], ['fn', 'check']]), aoe('連続噛みつき', [hit(4, 2), ['str', 1]])];
    return [A('召喚', [['fn', 'summon']]), aoe('連続噛みつき', [hit(3, 2), ['fn', 'check']]), aoe('噛みつき', [hit(7)])];
  }, loop: 0,
  fns: {
    summon: async function (cb, e) {
      for (var r = 0; r < cb.n(); r++) {
        var have = cb.alive().filter(function (x) { return x.id === 'SnakeDagger' && x.row === r; }).length;
        for (var i = have; i < 2; i++) cb.summonFrom('dagger', r);
      }
    },
    check: async function (cb, e) { if (!cb.alive().some(function (x) { return x.id === 'SnakeDagger'; })) e.x.skipTo1 = true; }
  },
  advance: function (cb, e) { if (e.x.skipTo1) { e.x.skipTo1 = false; e.cube = 0; return; } e.cube = (e.cube + 1) % 3; } });
mon('AwakenedOne', { name: '覚醒者', art: 'awakened-one', boss: true, type: 'cube',
  hp: function (asc, n) { return 50 * n; },
  track: function (cb) { return [A('斬撃', [hit(3)]), A('魂のストライク', [hit(cb.asc() >= 10 ? 6 : 5)]), A('斬撃', [hit(2, 2)])]; }, loop: 0,
  hitBonus: function (cb, e, pc) { return pc.pow.length; },
  onDeath: async function (cb, e) {
    // Awaken: summon Phase 2 at the start of the next round.
    cb.s.pending.push({ round: cb.s.round + 1, fn: 'awaken', mid: 'AwakenedOne', keep: true });
  },
  awaken: async function (cb) {
    var e2 = cb.spawn('AwakenedOne2', -1);
    if (cb.asc() >= 10) { var most = 0; cb.pcs().forEach(function (p) { most = Math.max(most, p.pow.length); }); e2.str = Math.min(8, most); }
    cb.emit({ t: 'spawn', u: e2.u }); cb.log('覚醒者が目覚めた！');
  } });
mon('AwakenedOne2', { name: '覚醒者（第2形態）', art: 'awakened-one', boss: true, type: 'cube',
  hp: function (asc, n) { return 50 * n; },
  track: function (cb) { return [A('黒き波動', [hit(cb.asc() >= 10 ? 6 : 7)]), A('スラッジ', [hit(4), ['slime', 2]]), A('連打', [hit(3, 2), ['str', 1]])]; }, loop: 0 });
mon('TimeEater', { name: 'タイムイーター', art: 'time-eater', boss: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 10 ? 64 : 60) * n; },
  track: function (cb) {
    var a10 = cb.asc() >= 10;
    return [A('タイムワープ5：連撃', [hit(a10 ? 3 : 2, 2)], { warp: 5 }), A('タイムワープ4：粘液', [['slime', 3]], { warp: 4 }), A('タイムワープ3：強打', [hit(6)].concat(a10 ? [['daze', 1]] : []).concat([['str', 1]]), { warp: 3 })];
  }, loop: 0,
  turnStart: async function (cb, e) { var a = cb.currentAction(e); e.x.timeWarp = a ? a.warp : null; },
  afterAct: async function (cb, e) { e.x.timeWarp = null; },
  beforeDeath: async function (cb, e) {
    if (e.x.hasted) return false;
    e.x.hasted = true;
    e.hp = Math.min(e.max, (cb.asc() >= 10 ? 32 : 30) * cb.n()); cb.enemyStr(e, 1); e.weak = 0; e.vuln = 0;
    cb.emit({ t: 'eheal', u: e.u }); cb.log('タイムイーター：ヘイスト！');
    return true;
  } });
mon('Donu', { name: 'ドヌー', art: 'donu', boss: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 10 ? 55 : 50) * n; },
  track: [A('循環の力', [['strAll', 1]]), A('ビーム', [hit(3, 2)])], loop: 0 });
mon('Deca', { name: 'デカ', art: 'deca', boss: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 10 ? 55 : 50) * n; },
  track: function (cb) { return [A('ビーム', [hit(3, 2)]), A('四角形の防御', [['daze', 1], ['slime', cb.asc() >= 10 ? 2 : 1]])]; }, loop: 0 });

/* ================================================================== ACT IV */
mon('SpireShield', { name: 'スパイアシールド', art: 'spire-shield', elite: true, type: 'cube',
  hp: function (asc, n) { return 30 * Math.max(1, n); },
  track: [A('防御', [['blk', 20]], { facing: 'energy' }), aoe('強打', [hit(8)], { facing: 'nodraw' }), A('鼓舞', [['strAll', 2]], { facing: 'zero' })], loop: 0 });
mon('SpireSpear', { name: 'スパイアスピア', art: 'spire-spear', elite: true, type: 'cube',
  hp: function (asc, n) { return 42 * Math.max(1, n); },
  track: [aoe('連続突き', [hit(2, 2)], { facing: 'burn' }), aoe('燃える突き', [['daze', 2]], { facing: 'burn' }), aoe('貫通', [hit(9)], { facing: 'burn' })], loop: 0 });
mon('Heart', { name: '堕落の心臓', art: 'corrupt-heart', boss: true, type: 'cube',
  hp: function (asc, n) { return (asc >= 11 ? 120 : 100) * n; },
  start: async function (cb, e) { e.x.invincible = true; e.x.beat = 1; },
  track: function (cb) {
    var a11 = cb.asc() >= 11;
    return [A('崩壊', [['weak', 1], ['vuln', 1], a11 ? ['burn', 5, 'shuffle'] : ['slime', 5, 'shuffle']]), A('血の一撃', [hit(5)]), A('鼓動', [hit(2, 2)]), A('成長', [['str', 2], ['fn', 'grow']])];
  }, loop: 1,
  noWeak: function (cb, e) { return !!e.x.invincible; },
  capLoss: function (cb, e, loss) {
    if (!e.x.invincible) return loss;
    var floor = (cb.asc() >= 11 ? 60 : 50) * cb.n();
    return Math.max(0, Math.min(loss, e.hp - floor));
  },
  fns: { grow: async function (cb, e) { var cap = cb.asc() >= 11 ? 5 : 3; e.x.beat = Math.min(cap, (e.x.beat || 1) + (cb.asc() >= 11 ? 2 : 1)); e.x.invincible = false; cb.log('堕落の心臓は無敵を失った。死の鼓動' + e.x.beat); } },
  playerEndTurn: async function (cb, e) {
    // Beat of Death: at end of turn, all players take damage.
    var ps = cb.pcs();
    for (var i = 0; i < ps.length; i++) if (!ps[i].dead) await cb.damagePlayer(ps[i], e.x.beat || 1, { enemy: e, why: '死の鼓動' });
  } });

/* ================================================================== ENCOUNTER CARDS */
function enc(id, o) { o.id = id; E[id] = o; return o; }
/* Each encounter card is built in one row. rewards: gold, potion */
function sp(cb, row, id, o) { return cb.spawn(id, row, o || {}); }
async function gremlins(cb, row) {
  var n = cb.n() > 1 ? 3 : 2;
  for (var i = 0; i < n; i++) { var g = cb.summonFrom('gremlin', row); if (g) g.gremlin = true; }
}
enc('SmallSlimes', { name: '小さなスライムたち', first: true, rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'SmallSlime'); cb.summonFrom('acid', r); } });
enc('JawWormEasy', { name: 'ジョーワーム', first: true, rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'JawWorm', { lvl: 'easy', beh: 'sda' }); } });
enc('CultistFirst', { name: '狂信者', first: true, rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Cultist'); } });
enc('TwoLouse', { name: 'ロース2匹', first: true, rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'RedLouse', { beh: 'S21' }); cb.summonFrom('green', r); } });
enc('CultistSpike', { name: '狂信者とスパイクスライム', rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'Cultist'); cb.summonFrom('spike', r); } });
enc('CultistLouse', { name: '狂信者とロース', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Cultist'); cb.summonFrom('green', r); } });
enc('FungiBeasts', { name: 'ファンガスビースト', rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'FungiBeast', { beh: '21S' }); sp(cb, r, 'FungiBeast', { beh: 'S21' }); } });
enc('SlimeTrio', { name: 'スライム三匹', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'SmallSlime'); cb.summonFrom('acid', r); cb.summonFrom('spike', r); } });
enc('ThreeLouse', { name: 'ロース3匹', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'RedLouse', { beh: 'S22', hard: true }); cb.summonFrom('green', r); sp(cb, r, 'RedLouse', { beh: '21S' }); } });
enc('LargeSlime', { name: 'ラージスライム', rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'LargeSlimeE'); } });
enc('SneakyGremlins', { name: 'ずるいグレムリン団', rewards: { gold: 1, potion: true }, build: function (cb, r) { var l = sp(cb, r, 'SneakyGremlin'); l.gremlin = true; return gremlins(cb, r); } });
enc('AngryGremlins', { name: '怒れるグレムリン団', rewards: { gold: 2 }, build: function (cb, r) { var l = sp(cb, r, 'MadGremlin'); l.gremlin = true; return gremlins(cb, r); } });
enc('BlueSlaverE', { name: 'ブルースレイバー', rewards: { gold: 2 }, build: function (cb, r) { sp(cb, r, 'BlueSlaver', { beh: 'W3D' }); } });
enc('RedSlaverE', { name: 'レッドスレイバー', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'RedSlaver', { beh: 'DV3' }); } });
enc('JawWormMedium', { name: 'ジョーワーム', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'JawWorm', { lvl: 'medium', beh: 'DAs' }); } });
enc('LooterE', { name: 'ルーター', rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'Looter'); } });
enc('A7JawSpike', { name: 'ジョーワームとスパイクスライム', a7: true, rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'JawWorm', { lvl: 'a7', beh: 'dsa' }); cb.summonFrom('spike', r); } });
enc('A7LooterAcid', { name: 'ルーターとアシッドスライム', a7: true, rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'Looter', { lvl: 'a7' }); cb.summonFrom('acid', r); } });
/* Act I elites */
enc('NobElite', { name: 'グレムリンノブ', elite: true, rewards: { gold: 2, relic: true }, build: function (cb) { sp(cb, cb.s.rows - 1, 'GremlinNob'); } });
enc('LagavulinElite', { name: 'ラガヴーリン', elite: true, rewards: { gold: 2, relic: true }, build: function (cb) { sp(cb, cb.s.rows - 1, 'Lagavulin'); } });
enc('SentriesElite', { name: 'セントリー3体', elite: true, rewards: { gold: 2, relic: true },
  build: function (cb) {
    // 3 Sentries per player: the elite card in the bottom row plus summons.
    var bottom = cb.s.rows - 1;
    for (var r = 0; r < cb.s.rows; r++) for (var i = 0; i < (r === bottom ? 2 : 3); i++) cb.summonFrom('sentry', r);
    sp(cb, bottom, 'SentryElite', { beh: '2D' });
  } });
/* Act II encounters */
enc('SneckoE', { name: 'スネッコ', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Snecko'); } });
enc('SnakePlantE', { name: 'スネークプラント', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'SnakePlant'); } });
enc('ThreeByrds', { name: 'ビルド3羽', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Byrd', { beh: '1S3', hp: 5 }); cb.summonFrom('byrd', r); cb.summonFrom('byrd', r); } });
enc('ThreeCultists', { name: '狂信者3人', rewards: { gold: 2 }, build: function (cb, r) { sp(cb, r, 'Cultist'); sp(cb, r, 'Cultist'); sp(cb, r, 'Cultist'); } });
enc('ChosenCultist', { name: 'チョーズンと狂信者', rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'Chosen', { hp: 14 }); sp(cb, r, 'Cultist'); } });
enc('ChosenByrd', { name: 'チョーズンとビルド', rewards: { gold: 2 }, build: function (cb, r) { sp(cb, r, 'Chosen', { hp: 16 }); cb.summonFrom('byrd', r); } });
enc('LooterMugger', { name: 'ルーターとマガー', rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'Looter', { lvl: 'hard' }); sp(cb, r, 'Mugger', { hp: 12 }); } });
enc('LooterMugger2', { name: 'ルーターとマガー', rewards: { gold: 0, potion: true }, build: E.LooterMugger.build });
enc('CenturionA', { name: 'センチュリオンとミスティック', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Centurion', { beh: 'B3' }); cb.summonFrom('healer', r); } });
enc('CenturionB', { name: 'センチュリオンとミスティック', rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'Centurion', { beh: '3B' }); cb.summonFrom('healer', r); } });
enc('ShelledParasiteE', { name: '寄生甲殻獣', rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'ShelledParasite'); } });
enc('SphericGuardianE', { name: 'スフィアガーディアン', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'SphericGuardian'); } });
enc('A7ParasiteFungi', { name: '寄生甲殻獣とファンガスビースト', a7: true, rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'ShelledParasite', { a7: true }); sp(cb, r, 'FungiBeast', { beh: 's2!', a7: true }); } });
enc('A7SphericSentry', { name: 'スフィアガーディアンとセントリー', a7: true, rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'SphericGuardian'); sp(cb, r, 'Sentry', { beh: 'D3' }); } });
/* Act II elites */
enc('BookElite', { name: 'ブック・オブ・スタビング', elite: true, rewards: { gold: 2, relic: true }, build: function (cb) { sp(cb, cb.s.rows - 1, 'BookOfStabbing'); } });
enc('GremlinLeaderElite', { name: 'グレムリンリーダー', elite: true, rewards: { gold: 2, relic: true },
  build: function (cb) {
    for (var r = 0; r < cb.s.rows; r++) for (var i = 0; i < 2; i++) { var g = cb.summonFrom('gremlin', r); if (g) g.gremlin = true; }
    sp(cb, cb.s.rows - 1, 'GremlinLeader');
  } });
enc('TaskmasterElite', { name: 'タスクマスター', elite: true, rewards: { gold: 2, relic: true },
  build: function (cb) {
    for (var r = 0; r < cb.s.rows; r++) { cb.summonFrom('blueSlaver', r); var red = cb.summonFrom('redSlaver', r); if (red) red.x.eliteSlaver = true; }
    sp(cb, cb.s.rows - 1, 'Taskmaster');
  } });
/* Act III encounters */
enc('JawWormsHard', { name: 'ジョーワーム3匹', rewards: { gold: 2 }, build: function (cb, r) { ['SDA', 'DAS', 'ASD'].forEach(function (b) { sp(cb, r, 'JawWorm', { lvl: 'hard', beh: b }); }); } });
enc('SpireGrowthE', { name: 'スパイアグロース', rewards: { gold: 1, potion: true }, build: function (cb, r) { sp(cb, r, 'SpireGrowth'); } });
enc('OrbWalker23', { name: 'オーブウォーカー', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'OrbWalker', { beh: '23' }); } });
enc('OrbWalker32', { name: 'オーブウォーカー', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'OrbWalker', { beh: '32' }); } });
enc('TransientE', { name: 'トランジェント', rewards: { gold: 2 }, build: function (cb, r) { sp(cb, r, 'Transient'); } });
enc('MawE', { name: 'マウ', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Maw'); } });
enc('WrithingMassE', { name: 'のたうつ塊', rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'WrithingMass'); } });
enc('ThreeDarklings', { name: 'ダークリング3体', rewards: { gold: 0, potion: true }, build: function (cb, r) { ['2S3', '32S', 'S32'].forEach(function (b) { sp(cb, r, 'Darkling', { beh: b }); }); } });
enc('ExploderFriends', { name: 'エクスプローダーと仲間', rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Exploder'); sp(cb, r, 'Repulsor', { beh: '3D' }); cb.summonFrom('spiker', r); } });
enc('RepulsorFriends', { name: 'リパルサーと仲間', rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'Repulsor', { beh: 'D3' }); sp(cb, r, 'Exploder'); cb.summonFrom('spiker', r); } });
enc('A7ExploderFriends', { name: 'エクスプローダーと仲間', a7: true, rewards: { gold: 1 }, build: function (cb, r) { sp(cb, r, 'Exploder'); sp(cb, r, 'Repulsor', { beh: '3D' }); cb.summonFrom('spiker', r); cb.summonFrom('spiker', r); } });
enc('A7RepulsorFriends', { name: 'リパルサーと仲間', a7: true, rewards: { gold: 0, potion: true }, build: function (cb, r) { sp(cb, r, 'Repulsor', { beh: 'D3' }); sp(cb, r, 'Exploder'); sp(cb, r, 'SphericGuardian'); } });
/* Act III elites */
enc('GiantHeadElite', { name: 'ジャイアントヘッド', elite: true, rewards: { gold: 3, relic: true }, build: function (cb) { sp(cb, cb.s.rows - 1, 'GiantHead'); } });
enc('NemesisElite', { name: 'ネメシス', elite: true, rewards: { gold: 3, relic: true }, build: function (cb) { sp(cb, cb.s.rows - 1, 'Nemesis'); } });
enc('ReptomancerElite', { name: 'レプトマンサー', elite: true, rewards: { gold: 3, relic: true }, build: function (cb) { sp(cb, cb.s.rows - 1, 'Reptomancer'); } });
/* Act IV elite (Ascension 11+): Shield and Spear in their own rows; players may switch rows (including empty rows). */
enc('ShieldSpear', { name: 'スパイアシールドとスパイアスピア', elite: true, rewards: { gold: 0, relic: true }, rows: function (n) { return Math.max(2, n); },
  build: function (cb) { sp(cb, 0, 'SpireShield'); sp(cb, 1, 'SpireSpear'); cb.s.facing = true; } });
/* Bosses */
function boss(id, name, build) { enc('Boss:' + id, { name: name, boss: true, build: build }); }
boss('SlimeBoss', 'スライムボス', function (cb) { sp(cb, -1, 'SlimeBoss'); });
boss('Hexaghost', 'ヘクサゴースト', function (cb) { sp(cb, -1, 'Hexaghost'); });
boss('Guardian', 'ガーディアン', function (cb) { sp(cb, -1, 'Guardian'); });
boss('Automaton', 'ブロンズオートマトン', function (cb) { sp(cb, -1, 'Automaton'); for (var r = 0; r < cb.s.rows; r++) cb.summonFrom('bronzeOrb', r); });
boss('Collector', 'コレクター', function (cb) { sp(cb, -1, 'Collector'); });
boss('Champ', 'チャンプ', function (cb) { sp(cb, -1, 'Champ'); });
boss('AwakenedOne', '覚醒者', function (cb) { for (var r = 0; r < cb.s.rows; r++) { cb.summonFrom('cultist', r); cb.summonFrom('cultist', r); } sp(cb, -1, 'AwakenedOne'); });
boss('TimeEater', 'タイムイーター', function (cb) { sp(cb, -1, 'TimeEater'); });
boss('DonuDeca', 'ドヌーとデカ', function (cb) { sp(cb, -1, 'Deca'); sp(cb, -1, 'Donu'); });
boss('Heart', '堕落の心臓', function (cb) { sp(cb, -1, 'Heart'); });

/* ================================================================== SUMMON DECKS (entries "Monster|behaviour") */
function rep(id, behs) { return behs.map(function (b) { return id + '|' + b; }); }
SUM.acid = function () { return rep('AcidSlimeM', ['CAL', 'LCA', 'ALC', 'LAC']); };
SUM.green = function () { return rep('GreenLouse', ['1W2', '21W']); };
SUM.spike = function () { return rep('SpikeSlimeM', ['2DV', 'V2D', 'DV2', 'VD2']); };
SUM.large = function () { return rep('LargeSlime', ['4SW', 'SW4', 'W4S', 'W4S']); };
SUM.gremlin = function () { return ['MadGremlin', 'MadGremlin', 'SneakyGremlin', 'SneakyGremlin', 'FatGremlin', 'FatGremlin', 'GremlinWizard', 'GremlinWizard']; };
SUM.sentry = function () { var o = []; for (var i = 0; i < 11; i++) o.push(i % 2 ? 'Sentry|3D' : 'Sentry|D3'); return o; };
SUM.healer = function () { return rep('Mystic', ['H2S', '2SH']); };
SUM.byrd = function () { return rep('Byrd', ['S13', 'S31', '31S']); };
SUM.blueSlaver = function () { return rep('BlueSlaver', ['Wd3', 'W3d', 'dW3', '3Wd']); };
SUM.redSlaver = function () { return rep('RedSlaver', ['3VD', '3DV', 'DV3', 'V3D']); };
SUM.bronzeOrb = function () { return rep('BronzeOrb', ['3DB', '3BD', 'DB3', 'B3D']); };
SUM.torch = function () { var o = []; for (var i = 0; i < 8; i++) o.push('TorchHead'); return o; };
SUM.dagger = function () { var o = []; for (var i = 0; i < 8; i++) o.push('SnakeDagger'); return o; };
SUM.cultist = function () { var o = []; for (var i = 0; i < 8; i++) o.push('Cultist'); return o; };
SUM.spiker = function () { return rep('Spiker', ['2T', 'T2', '2T', 'T2']); };

/* ================================================================== ACT TABLES */
function pick(a7, base, swaps) { return function (asc) { return asc >= 7 ? a7 : base; }; }
ACTS[1] = {
  first: ['SmallSlimes', 'JawWormEasy', 'CultistFirst', 'TwoLouse'],
  encounters: function (asc) {
    var l = ['CultistSpike', 'CultistLouse', 'FungiBeasts', 'SlimeTrio', 'ThreeLouse', 'LargeSlime', 'SneakyGremlins', 'AngryGremlins', 'BlueSlaverE', 'RedSlaverE'];
    return l.concat(asc >= 7 ? ['A7JawSpike', 'A7LooterAcid'] : ['JawWormMedium', 'LooterE']);
  },
  elites: function () { return ['NobElite', 'LagavulinElite', 'SentriesElite']; },
  bosses: function () { return ['Guardian', 'Hexaghost', 'SlimeBoss']; },
  events: function (asc, colorless) { return STS.EVENT_DECKS[1](asc, colorless); }
};
ACTS[2] = {
  encounters: function (asc) {
    var l = ['SneckoE', 'SnakePlantE', 'ThreeByrds', 'ThreeCultists', 'ChosenCultist', 'ChosenByrd', 'LooterMugger', 'LooterMugger2', 'CenturionA', 'CenturionB'];
    return l.concat(asc >= 7 ? ['A7ParasiteFungi', 'A7SphericSentry'] : ['ShelledParasiteE', 'SphericGuardianE']);
  },
  elites: function () { return ['BookElite', 'GremlinLeaderElite', 'TaskmasterElite']; },
  bosses: function () { return ['Automaton', 'Collector', 'Champ']; },
  events: function (asc, colorless) { return STS.EVENT_DECKS[2](asc, colorless); }
};
ACTS[3] = {
  encounters: function (asc) {
    var l = ['JawWormsHard', 'SpireGrowthE', 'OrbWalker23', 'OrbWalker32', 'TransientE', 'MawE', 'WrithingMassE', 'ThreeDarklings'];
    return l.concat(asc >= 7 ? ['A7ExploderFriends', 'A7RepulsorFriends'] : ['ExploderFriends', 'RepulsorFriends']);
  },
  elites: function () { return ['GiantHeadElite', 'NemesisElite', 'ReptomancerElite']; },
  bosses: function () { return ['AwakenedOne', 'TimeEater', 'DonuDeca']; },
  events: function (asc, colorless) { return STS.EVENT_DECKS[3](asc, colorless); }
};
ACTS[4] = { encounters: function () { return []; }, elites: function () { return ['ShieldSpear']; }, bosses: function () { return ['Heart']; }, events: function () { return []; } };
})(typeof window !== 'undefined' ? window : globalThis);

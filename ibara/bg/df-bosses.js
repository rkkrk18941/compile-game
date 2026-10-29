/* スレイザスパイア — Downfall adventure: the four Downfall characters as the Bosses of Acts I–III.
   Official enemy data is used where it exists: the base game's Slime Boss, The Guardian and The Hexaghost
   (rulebook v2.30 boss cards, already in monsters.js) are their Act I versions.
   DESIGNED for this implementation (no official enemy card exists): the Act II/III versions of those three and all
   three versions of The Hermit. Each one fights with the character's own mechanics — Slimes that Grow and are
   Commanded, Attack/Defensive Mode with Mode Shift, Heat that Advances and Retracts, a Chamber that is Loaded and
   fired Dead On — at the strength of the base game's Bosses of the same act (HP per player and damage per round
   compared with tools/ibara-boss-gauntlet.cjs; see DOWNFALL_AUDIT.md). No DOM. */
(function (root) {
'use strict';
var STS = root.STS, M = STS.MONSTERS, E = STS.ENCOUNTERS, PH = STS.PARTY_HP, DF = STS.DF = STS.DF || {};

function mon(id, o) { o.id = id; o.df = true; M[id] = o; return o; }
function A(name, fx, o) { return Object.assign({ name: name, fx: fx }, o || {}); }
function hit(n, x) { return ['hit', n, x || 1]; }
function partyHp(id) {
  return function (asc, n) {
    var tiers = PH[id], tier = 0;
    Object.keys(tiers).forEach(function (k) { if (+k <= asc && +k > tier) tier = +k; });
    return tiers[tier][n - 1];
  };
}
function boss(id, name, build) { E['Boss:' + id] = { id: 'Boss:' + id, name: name, boss: true, df: true, build: build }; }
function minions(cb) { return cb.alive().filter(function (x) { return x.row !== -1; }); }
function a10(cb) { return cb.asc() >= 10; }

/* Printed-style party HP (1–4 players), Ascension 10 versions from "10". */
PH.DfSlimeBoss2 = { 0: [48, 96, 144, 192], 10: [52, 104, 156, 208] };
PH.DfSlimeBoss3 = { 0: [64, 128, 192, 256], 10: [70, 140, 210, 280] };
PH.DfGuardian2 = { 0: [60, 120, 180, 240], 10: [66, 132, 198, 264] };
PH.DfGuardian3 = { 0: [85, 170, 255, 340], 10: [92, 184, 276, 368] };
PH.DfHexaghost2 = { 0: [58, 116, 174, 232], 10: [64, 128, 192, 256] };
PH.DfHexaghost3 = { 0: [85, 170, 255, 340], 10: [92, 184, 276, 368] };
PH.DfHermit1 = { 0: [36, 72, 108, 144], 10: [40, 80, 120, 160] };
PH.DfHermit2 = { 0: [60, 120, 180, 240], 10: [66, 132, 198, 264] };
PH.DfHermit3 = { 0: [80, 160, 240, 320], 10: [88, 176, 264, 352] };

/* ================================================================== The Slime Boss */
/* Like the player board ("Start of Combat: Summon Bruiser Slime"), the Boss starts with a Bruiser Slime in every
   row. Grow: its Slimes gain Strength. Command: its Slimes act again at once. Split when it dies. */
mon('DfBruiserSlime', { name: 'ブルーザースライム', art: 'acid-slime-m', type: 'single', hp: 6,
  onSpawn: function (cb, e, o) { if (o.hp == null) { e.hp = e.max = o.big ? 10 : 8; } },
  acts: [A('体当たり', [hit(2)])] });
var slimeFns = {
  dfGrow: async function (cb, e) {
    cb.alive().forEach(function (x) { cb.enemyStr(x, 1); });
    cb.log('成長：スライムボスとスライムたちが筋力1を得た');
  },
  dfCommand: async function (cb, e) {
    var l = minions(cb);
    if (l.length) cb.log('命令：スライムたちがもう一度行動する');
    for (var i = 0; i < l.length; i++) {
      if (cb.s.over) return;
      if (!l[i].dead && !l[i].fled) await cb.enemyAct(l[i]);
      if (cb.checkEnd()) return;
    }
  },
  dfSecrete: async function (cb, e) {
    for (var r = 0; r < cb.s.rows; r++) if (cb.rowEnemies(r).length < 2) cb.summonFrom('spike', r);
  }
};
mon('DfSlimeBoss2', { name: 'スライムボス', art: 'slime-boss', boss: true, type: 'cube', hp: partyHp('DfSlimeBoss2'),
  track: function (cb) {
    return [A('ねばねば', [['slime', 3], ['fn', 'dfGrow']]), A('命令', [hit(3), ['fn', 'dfCommand']]), A('叩きつけ', [hit(a10(cb) ? 9 : 8)])];
  }, loop: 0, fns: slimeFns,
  onDeath: async function (cb, e) {
    // Split: at the start of next round, an Acid Slime (L) and an Acid Slime (M) in every row.
    for (var r = 0; r < cb.n(); r++) {
      cb.queueSummon('large', r, { keep: true, opts: { bossSplit: true } });
      cb.queueSummon('acid', r, { keep: true });
    }
  } });
mon('DfSlimeBoss3', { name: 'スライムボス', art: 'slime-boss', boss: true, type: 'cube', hp: partyHp('DfSlimeBoss3'),
  track: function (cb) {
    return [A('ねばねば', [['slime', 3, 'shuffle'], ['fn', 'dfGrow']]), A('分泌', [hit(2, 2), ['blkPer', 4], ['fn', 'dfSecrete']]),
      A('命令', [hit(4), ['fn', 'dfCommand']]), A('押し潰し', [hit(a10(cb) ? 10 : 9)])];
  }, loop: 0, fns: slimeFns,
  onDeath: async function (cb, e) { cb.s.pending.push({ round: cb.s.round + 1, fn: 'split', mid: 'DfSlimeBoss3', keep: true }); },
  split: async function (cb) {
    // Split: an Acid Slime (L) with Strength 1 (2 at Ascension 10) and a Spike Slime (M) with Strength 1 in every row.
    for (var r = 0; r < cb.n(); r++) {
      var l = cb.summonFrom('large', r); if (l) cb.enemyStr(l, a10(cb) ? 2 : 1);
      var s = cb.summonFrom('spike', r); if (s) cb.enemyStr(s, 1);
    }
    cb.log('スライムボスが分裂した！');
  } });
boss('DfSlimeBoss2', 'スライムボス', function (cb) {
  cb.spawn('DfSlimeBoss2', -1, {});
  for (var r = 0; r < cb.s.rows; r++) cb.spawn('DfBruiserSlime', r, { summon: true });
});
boss('DfSlimeBoss3', 'スライムボス', function (cb) {
  cb.spawn('DfSlimeBoss3', -1, {});
  for (var r = 0; r < cb.s.rows; r++) { cb.spawn('DfBruiserSlime', r, { summon: true, big: true }); cb.summonFrom('acid', r); }
});

/* ================================================================== The Guardian */
/* Attack Mode: it gains Block, then Mode Shift: if it starts that enemy turn with no Block left, it does not attack
   and goes into Defensive Mode; otherwise it attacks everyone. Defensive Mode: Sharp Hide (a player who plays an
   Attack takes damage), then it returns to Attack Mode. */
function guardianDef(id, o) {
  return mon(id, { name: 'ガーディアン', art: 'the-guardian', boss: true, startMode: 'attack', type: 'cube', hp: partyHp(id), modes: ['attack', 'defense'],
    action: function (cb, e) { var l = e.mode === 'attack' ? o.attack(cb) : o.defense(cb); return l[Math.min(e.cube, l.length - 1)]; },
    advance: function (cb, e) {
      if (e.x.modeNext) { e.mode = e.x.modeNext; e.x.modeNext = null; e.cube = 0; return; }
      e.cube = (e.cube + 1) % (e.mode === 'attack' ? o.attack(cb).length : o.defense(cb).length);
    },
    fns: {
      dfGuard: async function (cb, e) { var g = o.guard(cb) * cb.n(); e.blk += g; cb.emit({ t: 'eblk', u: e.u, n: g }); },
      dfShift: async function (cb, e, a, ctx) {
        if (!e.x.startBlk) { e.x.modeNext = 'defense'; cb.log('ガーディアンは防御モードへ移行する'); return; }
        var ts = cb.targetsOf(e, true);
        for (var i = 0; i < ts.length; i++) await cb.enemyHit(e, ts[i], o.shift(cb), ctx);
        ctx.attacked = true;
      },
      dfToAttack: async function (cb, e) { e.x.modeNext = 'attack'; }
    },
    // The Mode Shift hit is shown in the intent while the Guardian still has Block.
    intentFn: function (cb, e, fx, attack, out) {
      if (fx[1] === 'dfShift') {
        out.conditional = true;
        if (e.blk > 0) attack(o.shift(cb), 1, true, 'ブロックが残れば');
        else out.effects.push({ target: '自身', text: '今のブロック0なら攻撃せず防御モードへ' });
        return true;
      }
      if (fx[1] === 'dfGuard') { out.effects.push({ target: '自身', text: 'ブロック+' + o.guard(cb) * cb.n() }); return true; }
      return false;
    },
    botIncoming: function (cb, e, pc) { var a = cb.currentAction(e); return a && a.fx.some(function (f) { return f[1] === 'dfShift'; }) && e.blk > 0 ? o.shift(cb) + (e.str || 0) : 0; },
    sharpHide: o.sharpHide,
    afterPlayerCard: async function (cb, e, pc, c) {
      if (e.mode === 'defense' && c && (c.shiv || (STS.CARDS[c.id] && STS.CARDS[c.id].t === 'A'))) await cb.damagePlayer(pc, o.sharpHide(cb), { enemy: e, why: '鋭い外殻' });
    } });
}
guardianDef('DfGuardian2', {
  attack: function (cb) { return [A('チャージ', [hit(2, 2), ['str', 1]]), A('旋回して防御', [hit(3), ['fn', 'dfGuard']]), A('モードシフト', [['fn', 'dfShift']])]; },
  defense: function (cb) { return [A('鋭い外殻', [hit(a10(cb) ? 4 : 3), ['blkPer', 3]]), A('回転斬り', [hit(3, 2), ['fn', 'dfToAttack']])]; },
  guard: function (cb) { return a10(cb) ? 8 : 7; }, shift: function (cb) { return a10(cb) ? 10 : 9; }, sharpHide: function () { return 1; } });
guardianDef('DfGuardian3', {
  attack: function (cb) { return [A('ジェム起動', [hit(2, 2), ['str', 1], ['weak', 1]]), A('旋回して防御', [hit(4), ['fn', 'dfGuard']]), A('モードシフト', [['fn', 'dfShift']])]; },
  defense: function (cb) { return [A('鋭い外殻', [hit(4), ['blkPer', 4]]), A('ソケット展開', [hit(3, 3), ['vuln', 1], ['fn', 'dfToAttack']])]; },
  guard: function (cb) { return a10(cb) ? 10 : 9; }, shift: function (cb) { return a10(cb) ? 12 : 11; }, sharpHide: function () { return 2; } });
boss('DfGuardian2', 'ガーディアン', function (cb) { cb.spawn('DfGuardian2', -1, {}); });
boss('DfGuardian3', 'ガーディアン', function (cb) { cb.spawn('DfGuardian3', -1, {}); });

/* ================================================================== The Hexaghost */
/* Heat 1–6 like the player board. Advance raises it, Retract lowers it; Ghostflame and Soulburn deal damage from it. */
var HEAT_MIN = 1, HEAT_MAX = 6;
function heatOf(e) { return (e && e.x && e.x.heat) || HEAT_MIN; }
function heatStep(cb, e, n) {
  var before = heatOf(e);
  e.x.heat = Math.max(HEAT_MIN, Math.min(HEAT_MAX, before + n));
  if (e.x.heat !== before) cb.log('ヘクサゴーストのヒート' + before + '→' + e.x.heat);
}
var hexFns = {
  dfAdv1: async function (cb, e) { heatStep(cb, e, 1); },
  dfAdv2: async function (cb, e) { heatStep(cb, e, 2); },
  dfRet1: async function (cb, e) { heatStep(cb, e, -1); },
  dfRet2: async function (cb, e) { heatStep(cb, e, -2); },
  dfRet3: async function (cb, e) { heatStep(cb, e, -3); }
};
mon('DfHexaghost2', { name: 'ヘクサゴースト', art: 'hexaghost', boss: true, type: 'cube', hp: partyHp('DfHexaghost2'),
  start: async function (cb, e) { e.x.heat = 2; },
  track: function (cb, e) {
    var h = heatOf(e);
    return [A('点火', [hit(2), ['burn', 2], ['fn', 'dfAdv1']]), A('ゴーストフレイム', [hit(h, 2)]), A('前進', [['blkPer', 3], ['str', 1], ['fn', 'dfAdv2']]),
      A('業火', [hit(2, 3), ['burn', a10(cb) ? 2 : 1]]), A('ソウルバーン', [hit(h + 2), ['fn', 'dfRet2']])];
  }, loop: 0, fns: hexFns });
mon('DfHexaghost3', { name: 'ヘクサゴースト', art: 'hexaghost', boss: true, type: 'cube', hp: partyHp('DfHexaghost3'),
  start: async function (cb, e) { e.x.heat = 3; },
  track: function (cb, e) {
    var h = heatOf(e);
    return [A('点火', [hit(3), ['burn', 2], ['fn', 'dfAdv1']]), A('ゴーストフレイム', [hit(h, 2)]), A('業火', [['blkPer', 5], ['burn', a10(cb) ? 4 : 3]]),
      A('前進', [hit(2, 2), ['str', 1], ['fn', 'dfAdv2']]), A('ソウルバーン', [hit(h + 3), ['weak', 1]]), A('地獄の業火', [hit(3, 3), ['burn', 2], ['fn', 'dfRet3']])];
  }, loop: 0, fns: hexFns });
boss('DfHexaghost2', 'ヘクサゴースト', function (cb) { cb.spawn('DfHexaghost2', -1, {}); });
boss('DfHexaghost3', 'ヘクサゴースト', function (cb) { cb.spawn('DfHexaghost3', -1, {}); });

/* ================================================================== The Hermit */
/* Chamber: up to 2 loaded rounds (shown on the Boss). Dead On actions are stronger while a round is loaded and
   spend it; Fan the Hammer fires every loaded round (Rapid Fire). */
var AMMO_MAX = 2;
function ammoOf(e) { return (e && e.x && e.x.ammo) || 0; }
function load(cb, e, n) { var b = ammoOf(e); e.x.ammo = Math.min(AMMO_MAX, b + n); if (e.x.ammo !== b) cb.log('ハーミットが装填した（' + e.x.ammo + '発）'); }
var hermitFns = {
  dfLoad1: async function (cb, e) { load(cb, e, 1); },
  dfLoad2: async function (cb, e) { load(cb, e, 2); },
  dfFire: async function (cb, e) { e.x.ammo = Math.max(0, ammoOf(e) - 1); },
  dfFireAll: async function (cb, e) { e.x.ammo = 0; }
};
function loaded(name, am) { return am ? name + '（デッド-オン）' : name; }
mon('DfHermit1', { name: 'ハーミット', art: 'hermit-boss', boss: true, type: 'cube', hp: partyHp('DfHermit1'),
  start: async function (cb, e) { e.x.ammo = 1; },
  track: function (cb, e) {
    var am = ammoOf(e);
    return [A('渇望', [hit(1, 2), ['str', 1], ['fn', 'dfLoad1']]),
      A(loaded('スナップショット', am), am ? [hit(3), ['blkPer', 3], ['fn', 'dfFire']] : [hit(3)]),
      A('閃光粉', [['weak', 1], ['daze', 2]]),
      A(loaded('ヘッドショット', am), am ? [hit(a10(cb) ? 8 : 7), ['fn', 'dfFire']] : [hit(3)])];
  }, loop: 0, fns: hermitFns });
mon('DfHermit2', { name: 'ハーミット', art: 'hermit-boss', boss: true, type: 'cube', hp: partyHp('DfHermit2'),
  start: async function (cb, e) { e.x.ammo = 2; },
  track: function (cb, e) {
    var am = ammoOf(e);
    return [A('早撃ち', [hit(2, 2), ['fn', 'dfLoad1']]), A('ファニング', [hit(2, 1 + am), ['fn', 'dfFireAll']]),
      A('物陰に隠れる', [['blkPer', 4], ['str', 1], ['daze', 1], ['fn', 'dfLoad2']]),
      A(loaded('ヘッドショット', am), am ? [hit(a10(cb) ? 10 : 9), ['fn', 'dfFire']] : [hit(3)])];
  }, loop: 0, fns: hermitFns });
mon('DfHermit3', { name: 'ハーミット', art: 'hermit-boss', boss: true, type: 'cube', hp: partyHp('DfHermit3'),
  start: async function (cb, e) { e.x.ammo = 2; },
  track: function (cb, e) {
    var am = ammoOf(e);
    return [A('渇望', [hit(2, 2), ['blkPer', 5], ['fn', 'dfLoad2']]), A('ファニング', [hit(3, 1 + am), ['fn', 'dfFireAll']]),
      A('呪われた弾丸', [hit(3), ['daze', 2], ['vuln', 1]]), A('英雄の虚勢', [['str', 2], ['fn', 'dfLoad1']]),
      A(loaded('ヘッドショット', am), am ? [hit(a10(cb) ? 13 : 12), ['fn', 'dfFire']] : [hit(4)])];
  }, loop: 0, fns: hermitFns });
boss('DfHermit1', 'ハーミット', function (cb) { cb.spawn('DfHermit1', -1, {}); });
boss('DfHermit2', 'ハーミット', function (cb) { cb.spawn('DfHermit2', -1, {}); });
boss('DfHermit3', 'ハーミット', function (cb) { cb.spawn('DfHermit3', -1, {}); });

/* ================================================================== registration */
var OFFICIAL = 'official (base game boss card)', DESIGNED = 'designed';
if (DF.addBoss) {
  DF.addBoss('S', 1, 'SlimeBoss', { source: OFFICIAL }); DF.addBoss('S', 2, 'DfSlimeBoss2', { source: DESIGNED }); DF.addBoss('S', 3, 'DfSlimeBoss3', { source: DESIGNED });
  DF.addBoss('U', 1, 'Guardian', { source: OFFICIAL }); DF.addBoss('U', 2, 'DfGuardian2', { source: DESIGNED }); DF.addBoss('U', 3, 'DfGuardian3', { source: DESIGNED });
  DF.addBoss('H', 1, 'Hexaghost', { source: OFFICIAL }); DF.addBoss('H', 2, 'DfHexaghost2', { source: DESIGNED }); DF.addBoss('H', 3, 'DfHexaghost3', { source: DESIGNED });
  DF.addBoss('M', 1, 'DfHermit1', { source: DESIGNED }); DF.addBoss('M', 2, 'DfHermit2', { source: DESIGNED }); DF.addBoss('M', 3, 'DfHermit3', { source: DESIGNED });
}
DF.heatOfEnemy = heatOf; DF.ammoOf = ammoOf;
/* The Hermit's portrait: the Downfall rulebook (v1.47 p.6) illustration, mirrored to face the party. */
STS.ENEMY_ART = STS.ENEMY_ART || {};
STS.ENEMY_ART['hermit-boss'] = [435, 501];
})(typeof window !== 'undefined' ? window : globalThis);

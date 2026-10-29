/* スレイザスパイア — Downfall: the Hexaghost's rules (rulebook v1.47 p.4, p.8).
   Heat: starts each combat at 1, never below 1 nor above 6. Advance = gain 1 Heat, Retract = lose 1 Heat; at the
   limit you still Advance / Retract (triggers happen) but the Heat stays. "Heat 3+:" bonuses check the current Heat.
   Soulburn (max 6): tokens spent whenever you could play a card, dealing damage equal to your Heat to an enemy.
   Not an Attack, Skill or card: Strength, Weak and Vulnerable do not change it (Block does). The starting ability
   gives 1 Soulburn. Gaining one with none left in the supply: deal the damage now, or skip it. No DOM. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, CAP = D.CAP, DF = STS.DF = STS.DF || {};
var C = STS.Combat.prototype;

C.heatOf = function (pc) { return pc.heat || 0; };
/* Advance / Retract n times; each step counts as an Advance / Retract even at the limit. */
C.heatStep = async function (pc, dir, n, why) {
  if (pc.heat == null) { if (DF.grantShard) await DF.grantShard(this, pc, 'heat'); if (pc.heat == null) return; }
  for (var i = 0; i < (n || 1); i++) {
    if (this.s.over) break;
    var b = pc.heat;
    pc.heat = Math.max(CAP.heatMin, Math.min(CAP.heatMax, pc.heat + (dir > 0 ? 1 : -1)));
    this.emit({ t: 'heat', i: pc.i, v: pc.heat, d: pc.heat - b, dir: dir > 0 ? 'advance' : 'retract', why: why || undefined });
    await DF.fire(dir > 0 ? 'advance' : 'retract', [this, pc, b, pc.heat]);
  }
};
C.gainSoulburn = async function (pc, n) {
  if (pc.soul == null) { if (DF.grantShard) await DF.grantShard(this, pc, 'soulburn'); if (pc.soul == null) return 0; }
  var got = 0;
  for (var i = 0; i < n; i++) {
    if (this.s.over) break;
    if (pc.soul < CAP.soulburn) { pc.soul++; got++; continue; }
    if (this.alive().length) {
      var now = await this.ask(pc, { type: 'confirm', title: 'ソウルバーンが上限（' + CAP.soulburn + '）です。今すぐヒート' + this.heatOf(pc) + 'のダメージを与えますか？', yes: '今すぐ与える', no: '得ない' });
      if (now) await this.soulburnDamage(pc);
    }
  }
  if (got) this.emit({ t: 'soul', i: pc.i, n: got });
  return got;
};
C.soulburnDamage = async function (pc, pre) {
  var e = await this.chooseEnemy(pc, 'ソウルバーン：対象の敵を選択（' + this.heatOf(pc) + 'ダメージ）', pre);
  if (!e) return;
  this.emit({ t: 'soulUse', i: pc.i, u: e.u, n: this.heatOf(pc) });
  await this.damageEnemy(e, this.heatOf(pc), { pc: pc, src: 'ソウルバーン' });
  await DF.fire('soulburn', [this, pc, e]);
  this.checkEnd();
};
C.useSoulburn = async function (pc, cmd) {
  if (!(pc.soul > 0)) throw new Error('ソウルバーンがありません。');
  if (!this.alive().length) throw new Error('対象の敵がいません。');
  if (pc.limbo && pc.limbo.length) throw new Error('カードの処理中は使えません。');
  if (this.needMode) await this.needMode(pc);
  pc.soul--;
  await this.soulburnDamage(pc, cmd && cmd.target);
};
DF.COMMANDS.soulburn = function (cb, pc, cmd) { return cb.useSoulburn(pc, cmd); };

var prevCtx = DF.ctxExtra;
DF.ctxExtra = function (cb, pc, c, k) {
  if (prevCtx) prevCtx(cb, pc, c, k);
  var name = STS.cdef(c).name;
  k.heat = function () { return cb.heatOf(pc); };
  k.advance = function (n) { return cb.heatStep(pc, 1, n == null ? 1 : n, name); };
  k.retract = function (n) { return cb.heatStep(pc, -1, n == null ? 1 : n, name); };
  k.soulburn = function (n) { return cb.gainSoulburn(pc, n == null ? 1 : n); };
};

/* ------------------------------------------------------------------ the Hexaghost's board */
STS.ABILITIES.H = { name: 'ソウルバーン', tx: '戦闘開始時：ヒート1、ソウルバーン1。ソウルバーンはカードを使える時にいつでも使え、今のヒートと同じダメージを敵1体に与える（筋力・脱力・弱体化の影響なし）。' };
DF.INIT.H = function (cb, pc) { pc.heat = CAP.heatMin; pc.soul = 1; };
})(typeof window !== 'undefined' ? window : globalThis);

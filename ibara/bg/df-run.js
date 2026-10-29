/* スレイザスパイア — Downfall adventure: the run-level rules (rulebook v1.47 p.2 "Downfall Setup").
   - Heart's Boon instead of Neow's Blessing.
   - Acts I–III: the Boss is drawn at random from the Downfall Bosses. In this implementation the candidates are
     every character not chosen for the adventure (all co-op participants excluded), fixed when the run starts.
   - Act IV: the final Boss is Neow.
   Everything is kept in run.adv / run.df, so saves resume and co-op guests see the same candidates and draws.
   Saves made before the adventure choice existed have no run.adv and are normal adventures. No DOM. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, DF = STS.DF = STS.DF || {};
var Game = STS.Game, G = Game.prototype;

/* ------------------------------------------------------------------ boss registry */
/* DF.BOSSES[ch][act] = { id: encounter id without 'Boss:', source: 'official' | 'designed', note } */
DF.BOSSES = DF.BOSSES || {};
DF.addBoss = function (ch, act, id, o) { (DF.BOSSES[ch] || (DF.BOSSES[ch] = {}))[act] = Object.assign({ id: id }, o || {}); };
DF.bossReady = function (ch) { var b = DF.BOSSES[ch]; return !!(b && b[1] && b[2] && b[3]); };
DF.bossOf = function (ch, act) { var b = DF.BOSSES[ch]; return b && b[act] ? b[act].id : null; };
/* The other pieces the adventure needs before it can be offered. */
DF.PARTS = DF.PARTS || {};
DF.adventureMissing = function () {
  var out = [];
  if (!DF.PARTS.heartsBoon) out.push('ハートの恩恵');
  if (!DF.PARTS.neow) out.push('第4幕のネオー');
  var noBoss = D.CHAR_ORDER.filter(function (ch) { return !DF.bossReady(ch); });
  if (noBoss.length) out.push('ボスとしての' + noBoss.map(function (ch) { return D.CHARS[ch].name; }).join('・'));
  var missingChars = D.DF_CHARS.filter(function (ch) { return !D.CHARS[ch]; });
  if (missingChars.length) out.push(missingChars.map(function (ch) { return DF.CHAR_DEFS[ch].name; }).join('・') + 'のカード');
  return out;
};
DF.adventureReady = function () { return !DF.adventureMissing().length; };

/* ------------------------------------------------------------------ new run */
var _newRun = Game.newRun;
Game.newRun = function (cfg) {
  var run = _newRun.call(this, cfg);
  if (cfg && cfg.adv === 'downfall') {
    run.adv = 'downfall';
    var party = run.players.map(function (p) { return p.ch; });
    // Candidates are fixed now: leaving or reconnecting players never change them.
    run.df = { v: 1, party: party, pool: D.CHAR_ORDER.filter(function (ch) { return party.indexOf(ch) < 0 && DF.bossReady(ch); }), bosses: {}, used: [] };
  }
  return run;
};
/* Draw one Boss per act (two in Act III at Ascension 13) from the candidates not drawn yet. */
DF.drawBosses = function (g, act) {
  var run = g.run, df = run.df;
  if (!df.bosses[act]) {
    var left = df.pool.filter(function (ch) { return df.used.indexOf(ch) < 0 && DF.bossOf(ch, act); });
    if (!left.length) left = df.pool.filter(function (ch) { return DF.bossOf(ch, act); });
    var pick = [];
    if (left.length) pick.push(left.splice(g.rand(left.length), 1)[0]);
    if (act === 3 && run.asc >= 13 && left.length) pick.push(left.splice(g.rand(left.length), 1)[0]);
    df.bosses[act] = pick;
    pick.forEach(function (ch) { if (df.used.indexOf(ch) < 0) df.used.push(ch); });
  }
  var b = df.bosses[act];
  run.boss = b[0] ? DF.bossOf(b[0], act) : run.boss;
  run.boss2 = b[1] ? DF.bossOf(b[1], act) : null;
};
var _setupAct = G.setupAct;
G.setupAct = function (act) {
  _setupAct.call(this, act);
  var run = this.run;
  if (DF.adventureOf(run) !== 'downfall' || !run.df) return;
  if (act <= 3) DF.drawBosses(this, act);
  else if (DF.PARTS.neow) { run.boss = DF.PARTS.neow; run.boss2 = null; }
  if (DF.PARTS.setupAct) DF.PARTS.setupAct(this, act);
};

/* Heart's Boon replaces Neow's Blessing. */
var _neow = G.neow;
G.neow = async function () {
  if (DF.adventureOf(this.run) === 'downfall' && DF.PARTS.heartsBoon) return DF.PARTS.heartsBoon(this);
  return _neow.call(this);
};

/* The character a boss encounter stands for (presentation and tests). */
DF.bossCharOf = function (bossId) {
  for (var ch in DF.BOSSES) for (var a in DF.BOSSES[ch]) if (DF.BOSSES[ch][a].id === bossId) return ch;
  return null;
};
})(typeof window !== 'undefined' ? window : globalThis);

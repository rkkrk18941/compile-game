/* ハタトリ・ナイン — who plays whom. A director owns a set of entrants and the matches between them:
   'duel' (one pairing, rematch as often as you like), 'league' (everyone meets everyone once) or 'cup'
   (single elimination with byes). It knows nothing about screens or the network, so node tests can drive it.
   An entrant: { eid, name, cpu (0 = human, 1..4 = CPU level), owner (who controls a human: 'local', 'h' or a peer id) } */
(function (root, factory) {
  var api = factory(root.HTN_ENG || (typeof require === 'function' ? require('./engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HTN_DIR = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  function Director(entrants, format, seed, options) {
    this.entrants = entrants.map(function (e, i) { var o = {}; for (var k in e) o[k] = e[k]; o.eid = o.eid != null ? o.eid : i; return o; });
    if (this.entrants.length < 2 || this.entrants.length > 24) throw new Error('2–24 entrants required');
    this.options = options || {};
    this.format = format;
    this.seed = (seed >>> 0) || 1;
    this.rng = E.mulberry32(this.seed);
    this.matches = [];
    this.rounds = [];
    this.cur = null;
    if (format === 'league') this._league();
    else if (format === 'cup') this._cup();
    else this._add(this.entrants[0].eid, this.entrants[1].eid, 1);
  }
  Director.prototype._add = function (a, b, round) {
    var m = { id: this.matches.length, a: a, b: b, round: round || 1, status: 'wait', seats: null, winner: null, how: null, score: null, lot: false };
    this.matches.push(m);
    return m;
  };
  Director.prototype._shuffle = function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(this.rng() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
  /* circle method: n-1 rounds in which nobody plays twice */
  Director.prototype._league = function () {
    var ids = this._shuffle(this.entrants.map(function (e) { return e.eid; }));
    if (ids.length % 2) ids.push(null);
    var n = ids.length, r, i;
    for (r = 0; r < n - 1; r++) {
      for (i = 0; i < n / 2; i++) {
        var a = ids[i], b = ids[n - 1 - i];
        if (a != null && b != null) this._add(r % 2 ? b : a, r % 2 ? a : b, r + 1);
      }
      ids.splice(1, 0, ids.pop());
    }
  };
  Director.prototype._cup = function () {
    var ids = this._shuffle(this.entrants.map(function (e) { return e.eid; })), size = 1;
    while (size < ids.length) size *= 2;
    // byes go to the first seeds, so nobody meets a bye twice in a row
    var slots = [];
    for (var i = 0; i < size; i++) slots.push(null);
    var order = seedOrder(size);
    ids.forEach(function (id, k) { slots[order[k]] = id; });
    this.rounds = [[]];
    for (var p = 0; p < size; p += 2) {
      var m = this._add(slots[p], slots[p + 1], 1);
      this.rounds[0].push(m.id);
      if (m.a == null || m.b == null) { m.status = 'done'; m.winner = m.a != null ? m.a : m.b; m.bye = true; }
    }
    this._grow();
  };
  function seedOrder(n) {
    var o = [0];
    while (o.length < n) { var m = o.length * 2, next = []; o.forEach(function (x) { next.push(x, m - 1 - x); }); o = next; }
    var pos = []; o.forEach(function (seed, i) { pos[seed] = i; });
    return pos;
  }
  /* when a cup round is finished, pair its winners */
  Director.prototype._grow = function () {
    if (this.format !== 'cup') return;
    var last = this.rounds[this.rounds.length - 1], self = this;
    if (last.length < 2) return;
    if (!last.every(function (id) { return self.matches[id].status === 'done'; })) return;
    var next = [];
    for (var i = 0; i < last.length; i += 2) {
      var a = this.matches[last[i]].winner, b = this.matches[last[i + 1]].winner;
      var m = this._add(a, b, this.rounds.length + 1);
      next.push(m.id);
    }
    this.rounds.push(next);
  };
  Director.prototype.byId = function (eid) { for (var i = 0; i < this.entrants.length; i++) if (this.entrants[i].eid === eid) return this.entrants[i]; return null; };
  Director.prototype.next = function () {
    for (var i = 0; i < this.matches.length; i++) if (this.matches[i].status === 'wait' && this.matches[i].a != null && this.matches[i].b != null) return this.matches[i];
    return null;
  };
  Director.prototype.start = function (m) {
    m = m || this.next();
    if (!m) return null;
    m.status = 'live';
    m.seats = this.rng() < 0.5 ? [m.a, m.b] : [m.b, m.a];
    m.seed = Math.floor(this.rng() * 4294967295) >>> 0;
    m.state = E.newGame({ seed: m.seed, tactics: this.options.tactics !== false, first: this.rng() < 0.5 ? 0 : 1, claims: 'manual' });
    this.cur = m.id;
    return m;
  };
  Director.prototype.rematch = function () {
    var last = this.matches[this.cur];
    var m = this._add(last.a, last.b, last.round + 1);
    return this.start(m);
  };
  Director.prototype.finish = function (m, result) {
    m.status = 'done';
    m.how = result.win;
    m.score = [0, 0];
    result.flags.forEach(function (f) { if (f.claimed === 0 || f.claimed === 1) m.score[f.claimed]++; });
    var w = result.winner === 2 ? -1 : result.winner;
    if (w === -1 && this.format === 'cup') { w = this.rng() < 0.5 ? 0 : 1; m.lot = true; }
    m.winner = w === -1 ? -1 : m.seats[w];
    delete m.state;
    this._grow();
  };
  Director.prototype.over = function () {
    if (this.format === 'duel') return false;
    return !this.next() && this.matches.every(function (m) { return m.status === 'done'; });
  };
  Director.prototype.standings = function () {
    var self = this, rows = {};
    this.entrants.forEach(function (e) { rows[e.eid] = { eid: e.eid, name: e.name, cpu: e.cpu, p: 0, w: 0, d: 0, l: 0, vp: 0, vpA: 0, played: 0, alive: true }; });
    this.matches.forEach(function (m) {
      if (m.status !== 'done' || m.bye) return;
      var A = rows[m.seats[0]], B = rows[m.seats[1]];
      A.played++; B.played++;
      if (m.score) { A.vp += m.score[0] - m.score[1]; B.vp += m.score[1] - m.score[0]; A.vpA += m.score[0]; B.vpA += m.score[1]; }
      if (m.winner === -1) { A.d++; B.d++; A.p++; B.p++; }
      else { var W = rows[m.winner], L = m.winner === m.seats[0] ? B : A; W.w++; W.p += 3; L.l++; if (self.format === 'cup') L.alive = false; }
    });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.p - a.p || b.w - a.w || b.vp - a.vp || b.vpA - a.vpA; });
  };
  Director.prototype.champion = function () {
    if (!this.over()) return null;
    if (this.format === 'cup') { var f = this.matches[this.rounds[this.rounds.length - 1][0]]; return f.winner; }
    return this.standings()[0].eid;
  };
  /* what clients see of the tournament */
  Director.prototype.summary = function () {
    return {
      format: this.format,
      entrants: this.entrants.map(function (e) { return { eid: e.eid, name: e.name, cpu: e.cpu, owner: e.owner }; }),
      matches: this.matches.map(function (m) { return { id: m.id, a: m.a, b: m.b, round: m.round, status: m.status, seats: m.seats, winner: m.winner, how: m.how, score: m.score, bye: !!m.bye, lot: m.lot }; }),
      rounds: this.rounds, cur: this.cur, standings: this.standings(), over: this.over(), champion: this.champion()
    };
  };
  return { Director: Director };
});

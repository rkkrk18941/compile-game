/* ガイスター — the CPU (window.GST_AI in a page or worker, module.exports in node).
   A CPU decides from its own view only: its own colours and whatever has been shown. It never peeks.

   How it thinks
   - Guessing colours. Every ghost of the opponent gets a chance of being good, read from how it has been played:
     ghosts that push towards the exits, run away when attacked or capture look good; ghosts that walk into reach,
     stay put when attacked or sit on an exit without leaving look bad. The chances are scaled so that together they
     add up to the number of good ghosts the opponent still has.
   - Reading ahead. A search a few moves deep that keeps two values for every position: the true value (with its own
     colours) and the value as the opponent sees it (who cannot tell its good ghosts from its bad ones). Its own
     moves maximise the true value; the opponent's replies minimise the value the opponent can see, so a red ghost
     racing for the exit is feared like a blue one. Capturing an unknown ghost splits into "it was good" and "it was
     bad" by the chance above.
   - Judging a position: captures so far (taking the fourth bad ghost loses, so each bad capture costs more), escape
     races (a good ghost that reaches its corner before any defender can get next to it will get out), the
     opponent's races weighted by how likely each runner is good, and captures that are one move away.

   Levels   1 やさしい: one move deep, blind to colours, often careless    2 ふつう: two moves deep
            3 つよい: three moves deep, reads colours                     4 最強: deepest search, reads colours
            5 成長する敵: 最強 with strategy values it has learned (assets/rival.js), more thinking time, and what it has
              learned of your habits — where you tend to put your good ghosts and how you move them
   choose(view, level, rng, extra) → action { f, t } (t = EXIT to leave)      setupFor(level, rng, extra) → layout
   extra: { params, boost, habits } for the rival; { depth, nodes } caps for practice games */
(function (root, factory) {
  var E = root && root.GST_ENG ? root.GST_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GST_AI = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var CELLS = 36, EXIT = -1, WIN = 100000;
  var DIST = new Int8Array(CELLS * CELLS), NB = [];
  for (var a0 = 0; a0 < CELLS; a0++) { NB.push(E.neighbours(a0)); for (var b0 = 0; b0 < CELLS; b0++) DIST[a0 * CELLS + b0] = E.dist(a0, b0); }
  var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

  /* ---------------------------------------------------------------- strategy values (the rival tunes these) */
  var BASE = { g1: 260, fb: 170, race: 2600, prox: 150, bluff: 0.18, hang: 0.35, adv: 8, wary: 0.3 };
  var SPACE = {
    race: { min: 1400, max: 4200, step: 200, label: '脱出レースの読み', up: '重く見る', down: '軽く見る' },
    prox: { min: 40, max: 320, step: 20, label: '出口へ急ぐ気持ち', up: '強める', down: '弱める' },
    bluff: { min: 0, max: 0.6, step: 0.04, label: '赤いおばけのはったり', up: '増やす', down: '控える' },
    g1: { min: 140, max: 420, step: 20, label: '青を取る価値', up: '高く見る', down: '低く見る' },
    fb: { min: 60, max: 300, step: 15, label: '赤を取らされる怖さ', up: '強める', down: '弱める' },
    hang: { min: 0, max: 0.8, step: 0.05, label: '取り合いの読み', up: '深める', down: '浅くする' },
    adv: { min: 0, max: 30, step: 2, label: '青を前へ出す', up: '積極的に', down: '慎重に' },
    wary: { min: 0, max: 0.7, step: 0.05, label: '相手のまぐれ当たりへの用心', up: '強める', down: '弱める' }
  };
  /* how colours are read (log-odds per unit of each habit) */
  var READ = { adv: 0.16, near: 0.1, offer: -0.3, flee: 0.42, stay: -0.32, capt: 0.05, moved: 0.08, sat: -4 };
  var READ_KEYS = ['adv', 'near', 'offer', 'flee', 'stay', 'capt', 'moved', 'sat'];

  var LEVELS = {
    1: { depth: 1, ms: 80, beam: 8, noise: 320, slip: 0.25, read: 0, setup: 'random' },
    2: { depth: 2, ms: 180, beam: 9, noise: 90, slip: 0.06, read: 0.5, setup: 'random' },
    3: { depth: 3, ms: 450, beam: 10, noise: 22, slip: 0, read: 1, setup: 'mixed' },
    4: { depth: 6, ms: 1100, beam: 11, noise: 4, slip: 0, read: 1, setup: 'mixed' },
    5: { depth: 7, ms: 1100, beam: 12, noise: 3, slip: 0, read: 1, setup: 'mixed' }
  };
  function levelOf(level, extra) {
    var L = LEVELS[level] || LEVELS[2], o = {};
    for (var k in L) o[k] = L[k];
    if (level >= 5 && extra && extra.boost > 1) { o.ms = Math.round(L.ms * Math.min(3, extra.boost)); o.beam = L.beam + Math.round(extra.boost); }
    if (extra && extra.depth) o.depth = Math.min(o.depth, extra.depth);
    if (extra && extra.ms) o.ms = extra.ms;
    if (extra && extra.noTime) o.ms = 0;
    return o;
  }
  function paramsOf(level, extra) {
    var P = {};
    for (var k in BASE) P[k] = BASE[k];
    if (extra && extra.params) for (var j in extra.params) if (typeof extra.params[j] === 'number' && j in BASE) P[j] = extra.params[j];
    return P;
  }

  /* ---------------------------------------------------------------- reading habits from the move list */
  function blankHabits() { var h = {}; READ_KEYS.forEach(function (k) { h[k] = 0; }); return h; }
  /* features of each ghost of player `who` (by slot), replayed from the public log */
  function habits(view, who) {
    var obs = 1 - who, at = new Int8Array(16), board = new Int8Array(CELLS).fill(-1);
    for (var id = 0; id < 16; id++) { var q = E.slotSquare(E.owner(id), id & 7); at[id] = q; board[q] = id; }
    var H = []; for (var k = 0; k < 8; k++) H.push(blankHabits());
    var exits = E.exitsOf(who);
    function attacked(q) {
      var nb = NB[q];
      for (var j = 0; j < nb.length; j++) { var o = board[nb[j]]; if (o >= 0 && (o >> 3) === obs) return true; }
      return false;
    }
    var log = view.log || [];
    for (var i = 0; i < log.length; i++) {
      var m = log[i];
      if (m.p === who) {
        // who sat on one of its exits at the start of this turn and did not leave? then that ghost is bad
        for (var k2 = 0; k2 < 8; k2++) {
          var gid = who * 8 + k2, gq = at[gid];
          if (gq < 0) continue;
          if ((gq === exits[0] || gq === exits[1]) && !(m.id === gid && m.t === EXIT)) H[k2].sat = 1;
          if (gid !== m.id && attacked(gq)) H[k2].stay++;
        }
        var mk = m.id & 7, was = at[m.id] >= 0 && attacked(at[m.id]);
        H[mk].moved = 1;
        if (m.cap >= 0) { H[mk].capt++; at[m.cap] = -1; }
        board[m.f] = -1;
        if (m.t === EXIT) { at[m.id] = -1; continue; }
        board[m.t] = m.id; at[m.id] = m.t;
        var now2 = attacked(m.t);
        if (was && !now2) H[mk].flee++;
        if (now2) H[mk].offer++;
      } else {
        if (m.cap >= 0) at[m.cap] = -1;
        board[m.f] = -1;
        if (m.t !== EXIT) { board[m.t] = m.id; at[m.id] = m.t; } else at[m.id] = -1;
      }
    }
    for (var k3 = 0; k3 < 8; k3++) {
      var id3 = who * 8 + k3, q3 = at[id3];
      if (q3 < 0) continue;
      var r0 = E.rowOf(E.slotSquare(who, k3)), r1 = E.rowOf(q3);
      H[k3].adv = who === 0 ? r0 - r1 : r1 - r0;
      H[k3].near = Math.max(0, 5 - Math.min(DIST[q3 * CELLS + exits[0]], DIST[q3 * CELLS + exits[1]]));
    }
    return H;
  }
  function sig(x) { return 1 / (1 + Math.exp(-x)); }
  /* scale log-odds so that the chances add up to `target` */
  function spread(L, target, out) {
    var n = L.length;
    if (!n) return out;
    if (target <= 0) { for (var i = 0; i < n; i++) out[i] = 0; return out; }
    if (target >= n) { for (var j = 0; j < n; j++) out[j] = 1; return out; }
    var lo = -40, hi = 40;
    for (var it = 0; it < 40; it++) {
      var mid = (lo + hi) / 2, s = 0;
      for (var k = 0; k < n; k++) s += L[k] === -Infinity ? 0 : sig(L[k] + mid);
      if (s > target) hi = mid; else lo = mid;
    }
    var lam = (lo + hi) / 2;
    for (var m = 0; m < n; m++) out[m] = L[m] === -Infinity ? 0 : Math.min(0.985, Math.max(0.015, sig(L[m] + lam)));
    return out;
  }
  /* log-odds of being good for every ghost of `who` still on the board */
  function readLogits(view, who, weights, scale, slotPrior) {
    var H = habits(view, who), out = new Float64Array(16).fill(NaN);
    for (var k = 0; k < 8; k++) {
      var id = who * 8 + k;
      if (view.g[id].st !== 'on') continue;
      var x = 0;
      for (var f = 0; f < READ_KEYS.length; f++) { var key = READ_KEYS[f]; x += (weights[key] || 0) * H[k][key]; }
      x *= scale;
      if (slotPrior) x += slotPrior[k] || 0;
      if (H[k].sat) x = Math.min(x, -4);
      out[id] = x;
    }
    return out;
  }
  function weightsOf(extra) {
    var w = {};
    READ_KEYS.forEach(function (k) { w[k] = READ[k]; });
    var hw = extra && extra.habits && extra.habits.w;
    if (hw) READ_KEYS.forEach(function (k) { if (typeof hw[k] === 'number') w[k] = hw[k]; });
    return w;
  }
  function slotPriorOf(extra) {
    var sl = extra && extra.habits && extra.habits.slot;
    if (!sl || !sl.length) return null;
    var out = [];
    for (var k = 0; k < 8; k++) {
      var s = sl[k] || { g: 0, n: 0 };
      // a gentle prior: (good + 1) / (games + 2), as log-odds, half strength
      out.push(0.5 * Math.log((s.g + 1) / (s.n - s.g + 1)));
    }
    return out;
  }
  /* chance of being good, for the opponent's ghosts (as this player reads them) */
  function beliefs(view, me, extra, level) {
    var L = levelOf(level || 4, extra), op = 1 - me;
    var lg = readLogits(view, op, weightsOf(extra), L.read, level >= 5 ? slotPriorOf(extra) : null);
    var ids = [], arr = [];
    for (var id = op * 8; id < op * 8 + 8; id++) if (!isNaN(lg[id])) { ids.push(id); arr.push(lg[id]); }
    var p = spread(arr, E.tally(view, op).good, new Array(arr.length));
    var out = {};
    ids.forEach(function (id2, i) { out[id2] = p[i]; });
    return out;
  }

  /* ---------------------------------------------------------------- the search */
  function Ctx(view, me, P, L, extra, level) {
    var op = 1 - me, C = this;
    C.me = me; C.op = op; C.P = P; C.L = L;
    C.pos = new Int8Array(16); C.sqr = new Int8Array(CELLS).fill(-1); C.col = new Int8Array(16).fill(-1);
    C.lg = new Float64Array(16); C.bel = new Float64Array(16);
    for (var id = 0; id < 16; id++) {
      var x = view.g[id];
      C.pos[id] = x.st === 'on' ? x.at : -1;
      if (x.st === 'on') C.sqr[x.at] = id;
      C.col[id] = x.good === true ? 1 : x.good === false ? 0 : -1;
    }
    var tm = E.tally(view, me), to = E.tally(view, op);
    C.gM = tm.good; C.bM = tm.bad; C.gO = to.good; C.bO = to.bad;
    C.exM = E.exitsOf(me); C.exO = E.exitsOf(op);
    // the opponent's ghosts as I read them; my ghosts as the opponent might read them (the plain reading, no habits)
    var lo = readLogits(view, op, weightsOf(extra), L.read, level >= 5 ? slotPriorOf(extra) : null);
    var lm = readLogits(view, me, READ, 1, null);
    for (var i = 0; i < 16; i++) C.lg[i] = (i >> 3) === op ? lo[i] : lm[i];
    C.renorm(op); C.renorm(me);
    C.TG = [0, P.g1, P.g1 * 2.4, P.g1 * 4.6, 0];
    C.TB = [0, -P.fb, -P.fb * 2.6, -P.fb * 6, 0];
    C.nodes = 0; C.deadline = 0; C.aborted = false; C.maxNodes = (extra && extra.nodes) || 0;
    C.belStack = []; for (var s = 0; s < 24; s++) C.belStack.push(new Float64Array(16));
    C.buf = []; for (var b = 0; b < 24; b++) C.buf.push(new Int32Array(48));
    C.ord = []; for (var o2 = 0; o2 < 24; o2++) C.ord.push(new Float64Array(48));
    C.rt = 0; C.ru = 0;
  }
  var tmpL = new Array(8), tmpP = new Array(8), tmpI = new Array(8);
  /* rescale the chances of one side's ghosts on the board to the number of good ones it has left */
  Ctx.prototype.renorm = function (side, skipA, skipB) {
    var n = 0;
    for (var id = side * 8; id < side * 8 + 8; id++) {
      if (this.pos[id] < 0) continue;
      tmpI[n] = id; tmpL[n] = (id === skipA || id === skipB) ? -Infinity : this.lg[id];
      if (isNaN(tmpL[n])) tmpL[n] = 0;
      n++;
    }
    var target = side === this.op ? this.gO : this.gM;
    var L = tmpL.slice(0, n), P = tmpP.slice(0, n);
    spread(L, target, P);
    for (var k = 0; k < n; k++) this.bel[tmpI[k]] = P[k];
  };

  /* a runner d moves from an exit corner; margin ≥ 1 means no defender can get next to the corner in time.
     Two moves out with room to spare is as good as out: nothing can reach it on the way. */
  var FORCED = WIN * 0.2;
  function raceVal(d, margin, P) {
    if (d > 10) return 0;
    if ((margin >= 1 && d <= 1) || (margin >= 2 && d <= 3)) return FORCED - 500 * d;
    if (margin >= 1) return P.race * (0.9 - 0.04 * d);
    var close = (8 - Math.min(8, d)) / 8;
    var f = margin === 0 ? 0.55 : margin === -1 ? 0.3 : 0.15;
    return P.prox * close * close * f;
  }

  /* the value of the position with `side` to move: C.rt (true) and C.ru (as the opponent sees it) */
  Ctx.prototype.evalStatic = function (side) {
    var C = this, P = C.P, me = C.me, op = C.op;
    var base = C.TG[4 - C.gO] + C.TB[4 - C.bO] - C.TG[4 - C.gM] - C.TB[4 - C.bM];
    var eM0 = C.exM[0], eM1 = C.exM[1], eO0 = C.exO[0], eO1 = C.exO[1];
    var dO0 = 99, dO1 = 99, dM0 = 99, dM1 = 99, id, q;
    for (id = op * 8; id < op * 8 + 8; id++) {
      q = C.pos[id]; if (q < 0) continue;
      var a = DIST[q * CELLS + eM0], b = DIST[q * CELLS + eM1];
      if (a < dO0) dO0 = a; if (b < dO1) dO1 = b;
    }
    for (id = me * 8; id < me * 8 + 8; id++) {
      q = C.pos[id]; if (q < 0) continue;
      var c = DIST[q * CELLS + eO0], d = DIST[q * CELLS + eO1];
      if (c < dM0) dM0 = c; if (d < dM1) dM1 = d;
    }
    // my runners
    var tMe = side === me ? 0 : 1, t1 = 0, t2 = 0, u1 = 0, u2 = 0, advT = 0, advU = 0;
    for (id = me * 8; id < me * 8 + 8; id++) {
      q = C.pos[id]; if (q < 0) continue;
      var d0 = DIST[q * CELLS + eM0], d1 = DIST[q * CELLS + eM1];
      var r0 = raceVal(d0, dO0 - d0 - tMe, P), r1 = raceVal(d1, dO1 - d1 - tMe, P), r = r0 > r1 ? r0 : r1;
      var vt = C.col[id] === 1 ? r : P.bluff * (r < P.race ? r : P.race), vu = C.bel[id] * r;
      if (vt > t1) { t2 = t1; t1 = vt; } else if (vt > t2) t2 = vt;
      if (vu > u1) { u2 = u1; u1 = vu; } else if (vu > u2) u2 = vu;
      var fwd = me === 0 ? 5 - ((q / 6) | 0) : ((q / 6) | 0);
      if (C.col[id] === 1) advT += fwd;
      advU += C.bel[id] * fwd;
    }
    // their runners, as likely good as I read them
    var tOp = side === op ? 0 : 1, o1 = 0, o2 = 0;
    for (id = op * 8; id < op * 8 + 8; id++) {
      q = C.pos[id]; if (q < 0) continue;
      var e0 = DIST[q * CELLS + eO0], e1 = DIST[q * CELLS + eO1];
      var s0 = raceVal(e0, dM0 - e0 - tOp, P), s1 = raceVal(e1, dM1 - e1 - tOp, P), s = (s0 > s1 ? s0 : s1) * C.bel[id];
      if (s > o1) { o2 = o1; o1 = s; } else if (s > o2) o2 = s;
    }
    // a second runner matters only as far as the first one may still be stopped
    var theirs = o1 + o2 * Math.max(0, 1 - o1 / P.race);
    // a capture one move away
    var hT = 0, hU = 0;
    if (P.hang > 0) {
      if (side === me) {
        var best = 0;
        for (id = op * 8; id < op * 8 + 8; id++) {
          q = C.pos[id]; if (q < 0 || !C.near(q, me)) continue;
          var p = C.bel[id];
          var gainG = C.gO <= 1 ? WIN * 0.02 : C.TG[5 - C.gO] - C.TG[4 - C.gO];
          var gainB = C.bO <= 1 ? -WIN * 0.02 : C.TB[5 - C.bO] - C.TB[4 - C.bO];
          var ev = p * gainG + (1 - p) * gainB;
          if (ev > best) best = ev;
        }
        hT = hU = P.hang * best;
      } else {
        // the opponent takes the capture that looks best to them; what it really does to me depends on the colour
        var bestO = 0, effT = 0, effU = 0;
        for (id = me * 8; id < me * 8 + 8; id++) {
          q = C.pos[id]; if (q < 0 || !C.near(q, op)) continue;
          var qg = C.bel[id];
          var lossG = C.gM <= 1 ? WIN * 0.02 : C.TG[5 - C.gM] - C.TG[4 - C.gM];       // what they gain taking my good one
          var lossB = C.bM <= 1 ? -WIN * 0.02 : C.TB[5 - C.bM] - C.TB[4 - C.bM];      // (negative) taking my bad one
          var evO = qg * lossG + (1 - qg) * lossB;
          if (evO > bestO) { bestO = evO; effT = C.col[id] === 1 ? -lossG : -lossB; effU = -evO; }
        }
        hT = P.hang * effT; hU = P.hang * effU;
      }
    }
    C.rt = base + t1 + t2 * Math.max(0, 1 - t1 / P.race) + P.adv * advT - theirs + hT;
    C.ru = base + u1 + u2 * Math.max(0, 1 - u1 / P.race) + P.adv * advU - theirs + hU;
  };
  /* is square q next to a ghost of `side`? */
  Ctx.prototype.near = function (q, side) {
    var nb = NB[q];
    for (var j = 0; j < nb.length; j++) { var o = this.sqr[nb[j]]; if (o >= 0 && (o >> 3) === side) return true; }
    return false;
  };
  Ctx.prototype.gen = function (side, out) {
    var n = 0;
    for (var id = side * 8; id < side * 8 + 8; id++) {
      var q = this.pos[id]; if (q < 0) continue;
      var nb = NB[q];
      for (var j = 0; j < nb.length; j++) {
        var t = nb[j], o = this.sqr[t];
        if (o >= 0 && (o >> 3) === side) continue;
        out[n++] = q * 64 + t;
      }
    }
    return n;
  };
  Ctx.prototype.tick = function () {
    if ((++this.nodes & 511) === 0) {
      if (this.deadline && now() > this.deadline) this.aborted = true;
      if (this.maxNodes && this.nodes > this.maxNodes) this.aborted = true;
    }
    return this.aborted;
  };
  /* order the moves at a node and keep the best `beam` of them (captures always stay) */
  Ctx.prototype.cut = function (side, buf, n, ply) {
    var C = this, sc = C.ord[ply], beam = C.L.beam;
    if (n <= beam) return n;
    var other = 1 - side;
    for (var i = 0; i < n; i++) {
      var f = buf[i] >> 6, t = buf[i] & 63, id = C.sqr[f], v = C.sqr[t];
      if (v >= 0) { sc[i] = side === C.me ? 1e9 : -1e9; continue; }
      C.sqr[f] = -1; C.sqr[t] = id; C.pos[id] = t;
      C.evalStatic(other);
      C.sqr[t] = -1; C.sqr[f] = id; C.pos[id] = f;
      sc[i] = side === C.me ? C.rt : C.ru;
    }
    // partial selection sort: best first (max for me, min for the opponent)
    for (var a = 0; a < beam; a++) {
      var bi = a;
      for (var b = a + 1; b < n; b++) if (side === C.me ? sc[b] > sc[bi] : sc[b] < sc[bi]) bi = b;
      if (bi !== a) { var ts = sc[a]; sc[a] = sc[bi]; sc[bi] = ts; var tb = buf[a]; buf[a] = buf[bi]; buf[bi] = tb; }
    }
    var keep = beam;
    for (var c = beam; c < n; c++) if (C.sqr[buf[c] & 63] >= 0) buf[keep++] = buf[c];
    return keep;
  };

  var RT = 0, RU = 0;     // results of node(): true value and the value as the opponent sees it
  function node(C, depth, side, ply) {
    if (C.tick()) { RT = 0; RU = 0; return; }
    if (side === C.me) meNode(C, depth, ply); else opNode(C, depth, ply);
  }
  function meNode(C, depth, ply) {
    var me = C.me, esc = false, pq = 1;
    for (var id = me * 8; id < me * 8 + 8; id++) {
      var q = C.pos[id];
      if (q === C.exM[0] || q === C.exM[1]) { if (C.col[id] === 1) esc = true; pq *= 1 - C.bel[id]; }
    }
    var pub = 1 - pq, w = WIN - ply * 10;
    if (esc || depth <= 0) {
      C.evalStatic(me);
      RT = esc ? w : C.rt; RU = pub * w + (1 - pub) * C.ru;
      return;
    }
    var buf = C.buf[ply], n = C.gen(me, buf);
    if (depth >= 2) n = C.cut(me, buf, n, ply);
    var bt = -Infinity, bu = 0;
    for (var i = 0; i < n; i++) {
      playMine(C, buf[i] >> 6, buf[i] & 63, depth, ply);
      if (C.aborted) return;
      if (RT > bt) { bt = RT; bu = RU; }
    }
    if (n === 0) { C.evalStatic(me); bt = C.rt; bu = C.ru; }
    RT = bt; RU = pub > 0 ? pub * w + (1 - pub) * bu : bu;
  }
  function playMine(C, f, t, depth, ply) {
    var id = C.sqr[f], v = C.sqr[t];
    if (v < 0) {
      C.sqr[f] = -1; C.sqr[t] = id; C.pos[id] = t;
      node(C, depth - 1, C.op, ply + 1);
      C.sqr[t] = -1; C.sqr[f] = id; C.pos[id] = f;
      return;
    }
    var p = C.gO <= 0 ? 0 : C.bO <= 0 ? 1 : C.bel[v];
    var save = C.belStack[ply]; save.set(C.bel);
    C.pos[v] = -1; C.sqr[f] = -1; C.sqr[t] = id; C.pos[id] = t;
    var w = WIN - (ply + 1) * 10, rt = 0, ru = 0;
    if (p > 0) {
      C.gO--;
      if (C.gO === 0) { RT = w; RU = w; } else { C.renorm(C.op); node(C, depth - 1, C.op, ply + 1); }
      C.gO++; C.bel.set(save);
      rt += p * RT; ru += p * RU;
    }
    if (p < 1 && !C.aborted) {
      C.bO--;
      if (C.bO === 0) { RT = -w; RU = -w; } else { C.renorm(C.op); node(C, depth - 1, C.op, ply + 1); }
      C.bO++; C.bel.set(save);
      rt += (1 - p) * RT; ru += (1 - p) * RU;
    }
    C.sqr[t] = v; C.pos[v] = t; C.sqr[f] = id; C.pos[id] = f;
    RT = rt; RU = ru;
  }
  function opNode(C, depth, ply) {
    var op = C.op, onA = -1, onB = -1, pNot = 1, others = 0;
    for (var id = op * 8; id < op * 8 + 8; id++) {
      var q = C.pos[id]; if (q < 0) continue;
      if (q === C.exO[0] || q === C.exO[1]) { if (onA < 0) onA = id; else onB = id; pNot *= 1 - C.bel[id]; }
      else others++;
    }
    var lose = -(WIN - ply * 10);
    var pe = onA < 0 ? 0 : (others < C.gO ? 1 : 1 - pNot);
    if (pe > 0.999) { RT = lose; RU = lose; return; }
    if (depth <= 0) { C.evalStatic(op); RT = pe * lose + (1 - pe) * C.rt; RU = pe * lose + (1 - pe) * C.ru; return; }
    var save = C.belStack[ply];
    if (onA >= 0) { save.set(C.bel); C.renorm(op, onA, onB); }      // it did not leave: those ghosts are bad
    var buf = C.buf[ply], n = C.gen(op, buf);
    if (depth >= 2) n = C.cut(op, buf, n, ply);
    var bt = 0, bu = Infinity, mt = Infinity, wl = WIN - (ply + 1) * 10;
    for (var i = 0; i < n; i++) {
      var f = buf[i] >> 6, t = buf[i] & 63, mid = C.sqr[f], v = C.sqr[t], ct, cu;
      if (v < 0) {
        C.sqr[f] = -1; C.sqr[t] = mid; C.pos[mid] = t;
        node(C, depth - 1, C.me, ply + 1);
        C.sqr[t] = -1; C.sqr[f] = mid; C.pos[mid] = f;
        ct = RT; cu = RU;
      } else {
        var good = C.col[v] === 1;
        C.pos[v] = -1; C.sqr[f] = -1; C.sqr[t] = mid; C.pos[mid] = t;
        if (good) C.gM--; else C.bM--;
        if (C.gM === 0) { RT = -wl; RU = -wl; } else if (C.bM === 0) { RT = wl; RU = wl; } else node(C, depth - 1, C.me, ply + 1);
        var tt = RT, tu = RU, alt;
        // the other colour, as the opponent must allow for
        if (good) { C.gM++; C.bM--; } else { C.bM++; C.gM--; }
        if (C.gM === 0) alt = -wl; else if (C.bM === 0) alt = wl; else { C.evalStatic(C.me); alt = C.ru; }
        if (good) { C.bM++; } else { C.gM++; }
        C.sqr[t] = v; C.pos[v] = t; C.sqr[f] = mid; C.pos[mid] = f;
        var qv = C.bel[v];
        ct = tt; cu = good ? qv * tu + (1 - qv) * alt : qv * alt + (1 - qv) * tu;
      }
      if (C.aborted) break;
      if (cu < bu || (cu === bu && ct < bt)) { bu = cu; bt = ct; }
      if (ct < mt) mt = ct;
    }
    if (onA >= 0) C.bel.set(save);
    if (C.aborted) return;
    if (n === 0) { C.evalStatic(op); bt = mt = C.rt; bu = C.ru; }
    // the opponent cannot see my colours, but may still stumble on the move that hurts me most
    bt = (1 - C.P.wary) * bt + C.P.wary * mt;
    RT = pe * lose + (1 - pe) * bt; RU = pe * lose + (1 - pe) * bu;
  }

  /* every root move with its value at one depth (null when time ran out) */
  function rootValues(C, depth) {
    var buf = new Int32Array(48), n = C.gen(C.me, buf), out = [];
    for (var i = 0; i < n; i++) {
      playMine(C, buf[i] >> 6, buf[i] & 63, depth, 0);
      if (C.aborted) return null;
      out.push({ f: buf[i] >> 6, t: buf[i] & 63, v: RT, u: RU });
    }
    return out;
  }

  function gauss(rng) { var u = 1 - rng(), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* ---------------------------------------------------------------- choosing a move */
  function choose(view, level, rng, extra) {
    rng = rng || Math.random; extra = extra || {};
    var me = view.me, L = levelOf(level, extra), P = paramsOf(level, extra);
    var moves = E.legal(view, me);
    if (!moves.length) return null;
    for (var i = 0; i < moves.length; i++) if (moves[i].t === EXIT) return moves[i];      // a good ghost on its exit leaves
    if (moves.length === 1) return moves[0];
    var C = new Ctx(view, me, P, L, extra, level);
    var t0 = now();
    if (L.ms) C.deadline = t0 + L.ms;
    var best = null, reached = 0;
    for (var d = 1; d <= L.depth; d++) {
      C.aborted = false;
      var vals = rootValues(C, d);
      if (!vals) break;
      best = vals; reached = d;
      // a sure win or a sure loss either way needs no deeper look
      var top = -Infinity; for (var k = 0; k < vals.length; k++) if (vals[k].v > top) top = vals[k].v;
      if (top > WIN / 2) break;
      if (L.ms && now() - t0 > L.ms * 0.45) break;          // the next depth would not finish in time
    }
    if (!best) { C.aborted = false; C.deadline = 0; C.maxNodes = 0; best = rootValues(C, 1); reached = 1; }
    // do not undo the last move without a reason
    var last = null;
    for (var j = view.log.length - 1; j >= 0; j--) if (view.log[j].p === me) { last = view.log[j]; break; }
    var scored = best.map(function (m) {
      var s = m.v;
      if (last && m.f === last.t && m.t === last.f) s -= 12;
      if (L.noise) s += gauss(rng) * L.noise;
      return { f: m.f, t: m.t, s: s, v: m.v };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    if (L.slip && rng() < L.slip) {
      var pool = scored.slice(0, Math.max(2, Math.ceil(scored.length / 2)));
      var pick = pool[Math.floor(rng() * pool.length)];
      return { f: pick.f, t: pick.t };
    }
    choose.lastInfo = { depth: reached, nodes: C.nodes, ms: Math.round(now() - t0), value: Math.round(scored[0].v) };
    return { f: scored[0].f, t: scored[0].t };
  }

  /* ---------------------------------------------------------------- setting up */
  var FORMS = [
    [1, 0, 0, 1, 0, 1, 1, 0], [0, 0, 0, 0, 1, 1, 1, 1], [1, 1, 1, 1, 0, 0, 0, 0], [1, 0, 1, 0, 0, 1, 0, 1],
    [1, 1, 0, 0, 1, 1, 0, 0], [0, 1, 1, 0, 1, 0, 0, 1], [1, 0, 0, 1, 1, 0, 0, 1], [0, 1, 1, 0, 0, 1, 1, 0],
    [0, 1, 0, 1, 1, 0, 1, 0], [1, 0, 0, 0, 1, 1, 1, 0]
  ];
  function mirror(l) { return [l[3], l[2], l[1], l[0], l[7], l[6], l[5], l[4]]; }
  function setupFor(level, rng, extra) {
    rng = rng || Math.random;
    var L = levelOf(level, extra);
    if (L.setup === 'random' || rng() < 0.35) return E.randomLayout(rng);
    var f = FORMS[Math.floor(rng() * FORMS.length)].slice();
    return rng() < 0.5 ? mirror(f) : f;
  }

  /* ---------------------------------------------------------------- learning your habits (the rival) */
  /* after a game is over (every colour shown), fold what your ghosts did into the rival's reading */
  function learnHabits(seen, overView, who) {
    if (!overView || overView.phase !== 'over') return seen;
    seen = seen || {};
    var w = seen.w || {};
    READ_KEYS.forEach(function (k) { if (typeof w[k] !== 'number') w[k] = READ[k]; });
    var slot = seen.slot || []; for (var s = 0; s < 8; s++) if (!slot[s]) slot[s] = { g: 0, n: 0 };
    var H = habits(overView, who), rows = [];
    for (var k = 0; k < 8; k++) {
      var x = overView.g[who * 8 + k];
      slot[k].n++; if (x.good) slot[k].g++;
      if (H[k].moved || x.st !== 'on') rows.push({ h: H[k], y: x.good ? 1 : 0 });
    }
    // a few steps of logistic regression, pulled back towards the plain reading so one game cannot swing it far
    for (var ep = 0; ep < 12; ep++) {
      var mean = 0; rows.forEach(function (r) { mean += r.y; }); mean = rows.length ? mean / rows.length : 0.5;
      rows.forEach(function (r) {
        var z = Math.log((mean + 0.05) / (1.05 - mean));
        READ_KEYS.forEach(function (key) { z += w[key] * r.h[key]; });
        var err = r.y - sig(z);
        READ_KEYS.forEach(function (key) { if (key !== 'sat') w[key] += 0.04 * err * Math.max(-3, Math.min(3, r.h[key])); });
      });
      READ_KEYS.forEach(function (key) { w[key] += 0.02 * (READ[key] - w[key]); });
    }
    seen.w = w; seen.slot = slot; seen.games = (seen.games || 0) + 1;
    return seen;
  }
  /* a short description of what the rival has noticed (for its learning screen) */
  function habitNotes(seen) {
    var out = [];
    if (!seen || !seen.slot) return out;
    var games = seen.games || 0;
    if (games >= 2) {
      var front = 0, back = 0, n = 0;
      for (var k = 0; k < 8; k++) { var s = seen.slot[k]; if (!s || !s.n) continue; n = s.n; if (k < 4) front += s.g; else back += s.g; }
      if (n) {
        var fr = front / (n * 4);
        if (fr > 0.6) out.push('あなたは青いおばけを前の列に置きがち、と覚えました');
        else if (fr < 0.4) out.push('あなたは青いおばけを後ろの列に置きがち、と覚えました');
      }
    }
    var w = seen.w;
    if (w) {
      if (w.adv < READ.adv - 0.06) out.push('前に出てくるおばけが青とは限らない、と学びました');
      else if (w.adv > READ.adv + 0.06) out.push('前に出てくるおばけは青のことが多い、と学びました');
      if (w.offer > READ.offer + 0.12) out.push('取れる所に来るおばけでも青のことがある、と学びました');
      if (w.flee < READ.flee - 0.12) out.push('逃げたおばけが青とは限らない、と学びました');
    }
    return out;
  }

  /* ---------------------------------------------------------------- practice games (rival tuning, self-play tests) */
  /* strategy a against strategy b; the same seed with swap gives the same deal with the seats exchanged */
  function practice(a, b, seed, swap, depth) {
    var rng = E.mulberry32(seed >>> 0), lay0 = setupFor(4, rng), lay1 = setupFor(4, rng);
    var s = E.newGame({ seed: seed >>> 0, first: (seed >>> 3) & 1, limit: 200 });
    E.setup(s, 0, lay0); E.setup(s, 1, lay1);
    var who = swap ? [b, a] : [a, b], aSeat = swap ? 1 : 0, prng = E.mulberry32((seed ^ 0x5bd1e995) >>> 0);
    while (s.phase === 'play') {
      var p = s.turn;
      var act = choose(E.viewFor(s, p), 4, prng, { params: who[p], depth: depth || 2, noTime: true, nodes: 60000 });
      if (!act || !E.apply(s, p, act).ok) break;
    }
    return s.winner === -1 || s.winner == null ? 0.5 : s.winner === aSeat ? 1 : 0;
  }
  /* a full game between two levels (for tests): returns { winner, reason, ply } with the levels' seats */
  function duel(levelA, levelB, seed, opts) {
    opts = opts || {};
    var rng = E.mulberry32(seed >>> 0);
    var s = E.newGame({ seed: seed >>> 0, first: (seed >>> 1) & 1, limit: opts.limit || 300 });
    var lv = [levelA, levelB];
    E.setup(s, 0, setupFor(lv[0], rng)); E.setup(s, 1, setupFor(lv[1], rng));
    var times = [0, 0], moves = [0, 0];
    while (s.phase === 'play') {
      var p = s.turn, t0 = now();
      var act = choose(E.viewFor(s, p), lv[p], rng, opts.extra ? opts.extra[p] : { noTime: !!opts.noTime, depth: opts.depth });
      times[p] += now() - t0; moves[p]++;
      if (!act || !E.apply(s, p, act).ok) throw new Error('illegal CPU move ' + JSON.stringify(act));
    }
    return { winner: s.winner, reason: s.reason, ply: s.ply, avgMs: [times[0] / Math.max(1, moves[0]), times[1] / Math.max(1, moves[1])] };
  }

  return {
    LEVELS: LEVELS, GROW_BASE: BASE, GROW_SPACE: SPACE, READ: READ, EXIT: EXIT,
    choose: choose, setupFor: setupFor, beliefs: beliefs, habits: habits,
    learnHabits: learnHabits, habitNotes: habitNotes, practice: practice, duel: duel, spread: spread
  };
});

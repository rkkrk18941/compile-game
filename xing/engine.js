/* ×ing／バッティング (browser edition): rules engine, CPU players and SHA-256 helper.
   Pure JavaScript with no DOM access, shared by xing/index.html and the Node regression tests.
   Rule details and their sources are listed in xing/RULES.md. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XING_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- components ---------- */
  var COLORS = ['B', 'Y', 'R', 'W'];           // blue, yellow, red, white
  var POINTS = [1, 2, 3];                      // blue 1, yellow 2, red 3 (white = count squared)
  var SET_BONUS = 4;                           // each blue + yellow + red set
  // tables = gem tables in the middle, col = blue/yellow/red each, white is always 6.
  // 2 players use the 4-player setup and play two hands each.
  var SETUP = {
    2: { tables: 3, col: 12, white: 6, hands: 2 },
    3: { tables: 2, col: 9, white: 6, hands: 1 },
    4: { tables: 3, col: 12, white: 6, hands: 1 },
    5: { tables: 4, col: 15, white: 6, hands: 1 },
    6: { tables: 5, col: 18, white: 6, hands: 1 }
  };
  var TABLE_NAMES = ['A', 'B', 'C', 'D', 'E'];

  /* gem ids 0..59: 0-17 blue, 18-35 yellow, 36-53 red, 54-59 white */
  function colorIdx(id) { id = id % 60; return id < 18 ? 0 : id < 36 ? 1 : id < 54 ? 2 : 3; }
  function colorOf(id) { return COLORS[colorIdx(id)]; }

  /* ---------- small helpers ---------- */
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* a random stream kept inside the state so a saved game continues identically */
  function srand(s) {
    s.rs = (s.rs + 0x6D2B79F5) | 0;
    var t = s.rs >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function tIdx(target) { return target && target[0] === 't' ? +target.slice(1) : -1; }
  function vIdx(target) { return target && target[0] === 'v' ? +target.slice(1) : -1; }

  /* ---------- scoring ---------- */
  function counts(ids) { var c = [0, 0, 0, 0]; for (var i = 0; i < ids.length; i++) c[colorIdx(ids[i])]++; return c; }
  /* c = [blue, yellow, red, white] */
  function scoreCounts(c) {
    var sets = Math.min(c[0], c[1], c[2]);
    var base = c[0] * POINTS[0] + c[1] * POINTS[1] + c[2] * POINTS[2];
    var white = c[3] * c[3];
    return { b: c[0], y: c[1], r: c[2], w: c[3], base: base, sets: sets, bonus: sets * SET_BONUS, white: white, total: base + sets * SET_BONUS + white, gems: c[0] + c[1] + c[2] + c[3] };
  }
  function scoreGems(ids) { return scoreCounts(counts(ids)); }
  function actorScore(s, a) {
    var x = s.A[a];
    var all = scoreGems(x.vault.concat(x.kept)), sec = scoreGems(x.kept);
    return { all: all, sec: sec, total: all.total, secured: sec.total, gems: all.gems };
  }
  function actorsOf(s, p) { var out = []; s.A.forEach(function (x, i) { if (x.p === p) out.push(i); }); return out; }
  /* a person's score: one hand normally; with two players the lower of the two hands */
  function personScore(s, p) {
    var acts = actorsOf(s, p), sc = acts.map(function (a) { return actorScore(s, a); });
    if (sc.length === 1) return { total: sc[0].total, secured: sc[0].secured, gems: sc[0].gems, hands: sc, actors: acts };
    var low = sc[0].total <= sc[1].total ? 0 : 1;
    return {
      total: Math.min(sc[0].total, sc[1].total), secured: Math.min(sc[0].secured, sc[1].secured),
      gems: sc[0].gems + sc[1].gems, hands: sc, actors: acts, low: low
    };
  }
  /* ranking: higher total first; tie -> more gems; still tied -> same rank */
  function standings(s) {
    var rows = s.P.map(function (pl, p) { var ps = personScore(s, p); return { p: p, nm: pl.nm, total: ps.total, gems: ps.gems, secured: ps.secured, score: ps }; });
    rows.sort(function (a, b) { return b.total - a.total || b.gems - a.gems || a.p - b.p; });
    rows.forEach(function (r, i) {
      if (i > 0 && rows[i - 1].total === r.total && rows[i - 1].gems === r.gems) r.rank = rows[i - 1].rank;
      else r.rank = i + 1;
      r.sameTotal = rows.filter(function (o) { return o.total === r.total; }).length > 1;
    });
    return rows;
  }

  /* ---------- names ---------- */
  function actorName(s, a) {
    var x = s.A[a], nm = s.P[x.p] ? s.P[x.p].nm : '?';
    return x.h === 'L' ? nm + 'の左手' : x.h === 'R' ? nm + 'の右手' : nm;
  }
  function targetName(s, t) {
    if (!t) return '休み';
    var i = tIdx(t);
    if (i >= 0) return '宝石台' + TABLE_NAMES[i];
    return actorName(s, vIdx(t)) + 'の金庫';
  }

  /* ---------- setup ---------- */
  function roundLimit(value) {
    var n = value == null ? 0 : Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 999) throw new Error('Turn count must be 0 (original) or 1-999');
    return n;
  }
  function addGemBatch(s) {
    var cfg = SETUP[s.np], base = s.nextGemId, batch = [];
    for (var k = 0; k < cfg.col; k++) batch.push(base + k, base + 18 + k, base + 36 + k);
    for (var w = 0; w < cfg.white; w++) batch.push(base + 54 + w);
    s.nextGemId += 60;
    s.bag = s.bag.concat(batch);
    shuffle(s.bag, function () { return srand(s); });
  }
  function newGame(persons, opts) {
    opts = opts || {};
    var np = persons.length;
    if (np < 2 || np > 6) throw new Error('×ing is for 2 to 6 players');
    var cfg = SETUP[np];
    var seed = opts.seed != null ? opts.seed >>> 0 : Math.floor(Math.random() * 4294967296) >>> 0;
    var s = {
      v: 1, gid: opts.gid || ('x' + seed.toString(36) + '-' + (opts.now != null ? opts.now : Date.now()).toString(36).slice(-5)),
      seq: 0, rnd: 1, np: np, nt: cfg.tables, rs: seed | 0, roundLimit: roundLimit(opts.roundLimit), nextGemId: 60,
      P: persons.map(function (p) { return { id: p.id, nm: p.nm, cpu: p.cpu | 0, here: p.here !== false }; }),
      A: [], T: [], bag: [], dealer: 0, ph: 'pick', final: false, deal: null, fill: null, last: null, hist: [], lg: []
    };
    s.P.forEach(function (pl, p) {
      if (cfg.hands === 2) { s.A.push({ p: p, h: 'L', vault: [], kept: [], rest: false }); s.A.push({ p: p, h: 'R', vault: [], kept: [], rest: false }); }
      else s.A.push({ p: p, h: '', vault: [], kept: [], rest: false });
    });
    var bag = [];
    for (var k = 0; k < cfg.col; k++) bag.push(k, 18 + k, 36 + k);
    for (var w = 0; w < cfg.white; w++) bag.push(54 + w);
    shuffle(bag, function () { return srand(s); });
    s.bag = bag;
    s.dealer = opts.dealer != null ? opts.dealer : Math.floor(srand(s) * np);
    for (var t = 0; t < cfg.tables; t++) s.T.push([]);
    // setup: two random gems on every gem table
    for (var t2 = 0; t2 < cfg.tables; t2++) { s.T[t2].push(s.bag.pop()); s.T[t2].push(s.bag.pop()); }
    s.lg.push([s.rnd, 'start', s.dealer]);
    if (s.roundLimit === 1) s.final = true;
    return s;
  }

  /* ---------- choices ---------- */
  function isActive(s, a) { return s.ph === 'pick' && !s.A[a].rest; }
  function activeActors(s) { var out = []; if (s.ph !== 'pick') return out; s.A.forEach(function (x, i) { if (!x.rest) out.push(i); }); return out; }
  /* what actor a may point at: a gem table with gems, another vault with gems, or its own vault (barrier) when it holds gems */
  function legalTargets(s, a) {
    if (s.ph !== 'pick' || !s.A[a] || s.A[a].rest) return [];
    var out = [];
    s.T.forEach(function (g, i) { if (g.length) out.push('t' + i); });
    s.A.forEach(function (x, j) { if (j !== a && x.vault.length) out.push('v' + j); });
    if (s.A[a].vault.length) out.push('v' + a);
    return out;
  }
  function isLegal(s, a, t) { return legalTargets(s, a).indexOf(t) >= 0; }

  /* compact public snapshot (gem counts per place) used by history and the CPU */
  function snapshot(s) {
    return {
      T: s.T.map(counts), V: s.A.map(function (x) { return counts(x.vault); }), K: s.A.map(function (x) { return counts(x.kept); }),
      R: s.A.map(function (x) { return x.rest ? 1 : 0; }), P: s.A.map(function (x) { return x.p; }),
      bag: s.bag ? (typeof s.bag === 'number' ? s.bag : s.bag.length) : (s.bagN || 0), fin: !!s.final, np: s.np, nt: s.nt,
      turnsLeft: s.roundLimit ? s.roundLimit - s.rnd + 1 : null
    };
  }

  /* ---------- one round: every pick is revealed at once and settled from the same snapshot ---------- */
  function resolveRound(s, picks) {
    if (s.ph !== 'pick') return { ok: false, err: 'phase' };
    var nA = s.A.length;
    if (!picks || picks.length !== nA) return { ok: false, err: 'picks' };
    for (var a = 0; a < nA; a++) {
      if (s.A[a].rest) { if (picks[a]) return { ok: false, err: 'resting actor picked' }; }
      else if (picks[a] !== null && !isLegal(s, a, picks[a])) return { ok: false, err: 'illegal pick ' + a + ':' + picks[a] };
    }
    var pre = snapshot(s);
    var cnt = {};
    picks.forEach(function (t) { if (t) cnt[t] = (cnt[t] || 0) + 1; });
    var out = picks.map(function (t, a2) {
      if (!t) return s.A[a2].rest ? 'rest' : 'none';
      if (t === 'v' + a2) return 'barrier';
      var b = vIdx(t);
      if (b >= 0 && picks[b] === t) return 'blocked';      // the owner put up a barrier
      if (cnt[t] > 1) return 'clash';                        // ×ing: more than one finger on it
      return b >= 0 ? 'steal' : 'gain';
    });
    var res = { rnd: s.rnd, picks: picks.slice(), out: out, moves: [], secured: [], refill: [], pre: pre, finalRound: !!s.final };
    // everything is taken from the state as it was when the fingers came down
    var gains = picks.map(function () { return []; });
    var newVault = s.A.map(function (x) { return x.vault.slice(); });
    picks.forEach(function (t, i) {
      if (out[i] === 'gain') gains[i] = s.T[tIdx(t)].slice();
      else if (out[i] === 'steal') gains[i] = s.A[vIdx(t)].vault.slice();
    });
    picks.forEach(function (t, i) {
      if (out[i] === 'barrier') { res.secured.push({ a: i, gems: s.A[i].vault.slice() }); s.A[i].kept = s.A[i].kept.concat(s.A[i].vault); newVault[i] = []; }
      else if (out[i] === 'gain') s.T[tIdx(t)] = [];
      else if (out[i] === 'steal') newVault[vIdx(t)] = [];
    });
    gains.forEach(function (g, i) {
      if (!g.length) return;
      newVault[i] = newVault[i].concat(g);
      res.moves.push({ a: i, from: picks[i], gems: g.slice() });
    });
    s.A.forEach(function (x, i) { x.vault = newVault[i]; });
    // the vault of whoever rested turns face up again; a barrier makes the next round a pass
    s.A.forEach(function (x, i) { x.rest = out[i] === 'barrier'; });
    s.hist.push({ r: s.rnd, pre: pre, pk: picks.slice(), out: out.slice() });
    s.lg.push([s.rnd, 'round', picks.slice(), out.slice()]);
    s.last = res;
    if (s.final) {
      s.ph = 'over'; res.over = true;
      s.result = standings(s);
      s.lg.push([s.rnd, 'over']);
    } else {
      startRefill(s);
      if (s.ph !== 'deal') nextRound(s);
    }
    s.seq++;
    return { ok: true, res: res };
  }

  /* ---------- refill: empty tables first (2 each), then 1 on every table that still has gems ---------- */
  function startRefill(s) {
    var empties = [], others = [];
    s.T.forEach(function (g, i) { (g.length ? others : empties).push(i); });
    var rnd = function () { return srand(s); };
    shuffle(empties, rnd); shuffle(others, rnd);   // order only matters when the bag runs short
    var slots = [];
    empties.forEach(function (t) { slots.push(t, t); });
    others.forEach(function (t) { slots.push(t); });
    if (s.roundLimit && s.bag.length < slots.length) {
      var before = s.bag.length;
      while (s.bag.length < slots.length) addGemBatch(s);
      if (s.last) s.last.addedGems = s.bag.length - before;
    }
    s.fill = { slots: slots, short: s.bag.length < slots.length };
    continueRefill(s);
  }
  /* tables still owed a gem in this refill */
  function openTables(s) {
    var seen = {}, out = [];
    (s.fill ? s.fill.slots : []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } });
    return out.sort(function (a, b) { return a - b; });
  }
  function continueRefill(s) {
    var f = s.fill;
    while (f && f.slots.length && s.bag.length) {
      // the very last gem of a short bag goes on any remaining table, chosen by whoever drew it
      if (f.short && s.bag.length === 1) {
        var open = openTables(s);
        if (open.length > 1) { s.ph = 'deal'; s.deal = { gem: s.bag[s.bag.length - 1], legal: open, dealer: s.dealer }; return; }
        placeGem(s, open[0], s.bag.pop());
        f.slots = [];
        break;
      }
      placeGem(s, f.slots.shift(), s.bag.pop());
    }
    s.fill = null; s.deal = null;
    if (!s.roundLimit && !s.bag.length) { s.final = true; if (s.last) s.last.finalNext = true; }
  }
  function placeGem(s, t, gem) {
    s.T[t].push(gem);
    if (s.last) s.last.refill.push({ t: t, g: gem });
  }
  /* the dealer puts the drawn last gem on one of the remaining tables */
  function dealPlace(s, p, t) {
    if (s.ph !== 'deal' || !s.deal) return { ok: false, err: 'phase' };
    if (p !== s.dealer) return { ok: false, err: 'not dealer' };
    if (s.deal.legal.indexOf(t) < 0) return { ok: false, err: 'illegal table' };
    placeGem(s, t, s.bag.pop());
    if (s.last) s.last.dealt = { t: t, p: p };
    s.lg.push([s.rnd, 'deal', p, t]);
    s.fill = null; s.deal = null;
    s.final = true; if (s.last) s.last.finalNext = true;
    nextRound(s);
    s.seq++;
    return { ok: true };
  }
  function nextRound(s) {
    s.ph = 'pick'; s.rnd++;
    if (s.roundLimit) { s.final = s.rnd === s.roundLimit; if (s.last) s.last.finalNext = s.final; }
  }

  /* ---------- views ---------- */
  /* everything every player may see: no bag order, no random stream */
  function publicView(s) {
    var v = clone(s);
    v.bagN = s.bag.length;
    v.bagC = counts(s.bag);
    delete v.bag; delete v.rs; delete v.fill;
    return v;
  }
  function bagCount(v) { return v.bag ? v.bag.length : v.bagN || 0; }

  /* ---------- SHA-256 (commitments for simultaneous online picks) ---------- */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { var d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function sha256(str) {
    var bytes = utf8(String(str)), bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s8 = 7; s8 >= 0; s8--) bytes.push(s8 >= 4 ? 0 : (bitLen >>> (s8 * 8)) & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var i = 0; i < 16; i++) W[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var x = W[i - 15], y = W[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[i] + W[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  function commitHash(gid, rnd, a, target, salt) { return sha256(gid + '|' + rnd + '|' + a + '|' + target + '|' + salt); }

  /* =====================================================================
     CPU: decides only from the public view (current table, vaults, secured gems,
     whose vault is face down) and the revealed picks of earlier rounds.
     ===================================================================== */
  var LEVELS = {
    1: { name: 'やさしい', tau: 2.4, iters: 0, oppTau: 2.4, fut: 0.1, learn: false },
    2: { name: 'ふつう', tau: 1.3, iters: 10, oppTau: 1.6, fut: 0, learn: false },
    3: { name: 'つよい', tau: 1.0, iters: 12, oppTau: 1.5, fut: 0.1, learn: true },
    4: { name: '最強', tau: 0.7, iters: 12, oppTau: 1.5, fut: 0.1, learn: true, amp: 0, vw: 1.3, rw: 1 },
    5: { name: '成長する敵', tau: 0.7, iters: 12, oppTau: 1.5, fut: 0.1, learn: true, amp: 0, vw: 1.3, rw: 1 }
  };
  var GROW_BASE = { tau: 0.7, oppTau: 1.5, vw: 1.3, rw: 1 };
  var CPU_OVER = null;   // a test / learning-rival override of the level settings for one decision
  /* what the learning rival (成長する敵) may adjust after a loss; it starts from 最強 */
  var GROW_SPACE = {
    tau: { min: 0.3, max: 1.6, step: 0.05, label: '迷わず最善手を選ぶ度合い（小さいほど迷わない）', up: '迷いを増やす', down: '迷いを減らす' },
    oppTau: { min: 0.8, max: 2.4, step: 0.1, label: '相手の手のばらつきの見積もり', up: '大きく見る', down: '小さく見る' },
    vw: { min: 0.6, max: 2.2, step: 0.05, label: '金庫を守る重み', up: '重く', down: '軽く' },
    rw: { min: 0.3, max: 1.6, step: 0.05, label: '休んで次に備える重み', up: '重く', down: '軽く' }
  };
  var LAM = [0.35, 0.12];                    // how much a multi-player CPU values hurting the leader / anyone else
  function add4(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]]; }
  function sub4(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]]; }
  function n4(c) { return c[0] + c[1] + c[2] + c[3]; }
  function sc4(c) { return scoreCounts(c).total; }

  /* context from a snapshot (counts only) */
  function aiCtx(sn) {
    var nA = sn.V.length, pa = {};
    var A = [];
    for (var a = 0; a < nA; a++) {
      A.push({ v: sn.V[a], k: sn.K[a], all: add4(sn.V[a], sn.K[a]), rest: !!sn.R[a], p: sn.P[a] });
      (pa[sn.P[a]] = pa[sn.P[a]] || []).push(a);
    }
    var nt = sn.T.length;
    var left = sn.turnsLeft != null ? sn.turnsLeft : sn.fin ? 1 : 1 + Math.ceil(sn.bag / (nt * 1.35));
    return { T: sn.T, A: A, pa: pa, np: sn.np || Object.keys(pa).length, final: !!sn.fin, bag: sn.bag, left: left, two: (sn.np || Object.keys(pa).length) === 2 };
  }
  function ctxLegal(ctx, a) {
    var me = ctx.A[a]; if (me.rest) return [];
    var out = [];
    ctx.T.forEach(function (c, i) { if (n4(c)) out.push('t' + i); });
    ctx.A.forEach(function (x, j) { if (j !== a && n4(x.v)) out.push('v' + j); });
    if (n4(me.v)) out.push('v' + a);
    return out;
  }
  function personTotal(ctx, p, ov) {
    var acts = ctx.pa[p];
    var vals = acts.map(function (a) { return sc4(ov && ov[a] ? ov[a] : ctx.A[a].all); });
    if (vals.length === 2) return Math.min(vals[0], vals[1]) + 0.15 * (vals[0] + vals[1]);
    return vals[0];
  }
  function bestOther(ctx, p) {
    var m = -1;
    Object.keys(ctx.pa).forEach(function (q) { q = +q; if (q !== p) m = Math.max(m, personTotal(ctx, q, null)); });
    return m;
  }
  /* how much actor a gains (in its owner's interest) by taking target x outright */
  function utility(ctx, a, x) {
    var me = ctx.A[a], p = me.p, ov = {};
    var ti = tIdx(x);
    if (ti >= 0) ov[a] = add4(me.all, ctx.T[ti]);
    else {
      var b = vIdx(x);
      ov[a] = add4(me.all, ctx.A[b].v);
      ov[b] = sub4(ctx.A[b].all, ctx.A[b].v);
    }
    var du = personTotal(ctx, p, ov) - personTotal(ctx, p, null);
    var vb = vIdx(x);
    if (vb >= 0 && ctx.A[vb].p !== p) {
      var q = ctx.A[vb].p, dq = personTotal(ctx, q, null) - personTotal(ctx, q, ov);
      var lam = ctx.two ? 1 : (personTotal(ctx, q, null) >= bestOther(ctx, p) - 1 ? LAM[0] : LAM[1]);
      du += lam * dq;
    }
    return du;
  }
  function vaultLoss(ctx, a) {
    var me = ctx.A[a], ov = {}; ov[a] = me.k;
    return (personTotal(ctx, me.p, null) - personTotal(ctx, me.p, ov)) * (ctx.two ? 1.6 : 1.25) * (ctx.vw || 1);
  }
  function roundGain(ctx, a) {
    var u = [];
    ctx.T.forEach(function (c, i) { if (n4(c)) u.push(utility(ctx, a, 't' + i)); });
    u.sort(function (x, y) { return y - x; });
    var top = u.slice(0, 2);
    return (top.length ? 0.45 * top.reduce(function (x, y) { return x + y; }, 0) / top.length + 0.6 : 0.6) * (ctx.rw || 1);
  }
  function softmax(evs, tau) {
    var m = -Infinity; evs.forEach(function (e) { if (e > m) m = e; });
    var w = evs.map(function (e) { return Math.exp((e - m) / Math.max(0.05, tau)); });
    var z = w.reduce(function (x, y) { return x + y; }, 0);
    return w.map(function (x) { return x / z; });
  }
  function kindOf(a, x) { return x === 'v' + a ? 2 : vIdx(x) >= 0 ? 1 : 0; }   // 0 table, 1 steal, 2 barrier

  /* simultaneous-choice model: every actor's mixed choice given the others (quantal response iteration) */
  function model(ctx, opt) {
    var nA = ctx.A.length, L = [], U = [], P = [], loss = [], rest = [];
    for (var a = 0; a < nA; a++) {
      L[a] = ctxLegal(ctx, a);
      U[a] = L[a].map(function (x) { return x === 'v' + a ? 0 : utility(ctx, a, x); });
      loss[a] = vaultLoss(ctx, a);
      rest[a] = ctx.final ? 0 : roundGain(ctx, a);
    }
    function tauOf(a) { var t = opt.tauFor ? opt.tauFor(ctx.A[a].p) : null; return t != null ? t : opt.oppTau; }
    function biasOf(a, k) { var b = opt.biasFor ? opt.biasFor(ctx.A[a].p) : null; return b ? b[k] : 0; }
    function pOf(j, x) { var i = L[j].indexOf(x); return i < 0 ? 0 : P[j][i]; }
    function rho(a) { // exactly one other actor points at a's vault
      var x = 'v' + a, tot = 0;
      for (var j = 0; j < nA; j++) {
        if (j === a || !L[j].length) continue;
        var pj = pOf(j, x); if (!pj) continue;
        var q = pj;
        for (var k = 0; k < nA; k++) if (k !== a && k !== j && L[k].length) q *= 1 - pOf(k, x);
        tot += q;
      }
      return tot;
    }
    function evs(a, exclude) {
      var r = rho(a);
      return L[a].map(function (x, i) {
        if (x === 'v' + a) return r * loss[a] + opt.fut * Math.min(1, ctx.left - 1) * loss[a] * 0.5 - rest[a] + biasOf(a, 2);
        var succ = 1;
        for (var j = 0; j < nA; j++) if (j !== a && L[j].length && !(exclude && exclude[j])) succ *= 1 - pOf(j, x);
        return succ * U[a][i] + biasOf(a, kindOf(a, x));
      });
    }
    for (a = 0; a < nA; a++) {
      if (!L[a].length) { P[a] = []; continue; }
      P[a] = softmax(L[a].map(function (x, i) { return x === 'v' + a ? 0.2 * loss[a] - rest[a] + biasOf(a, 2) : 0.55 * U[a][i] + biasOf(a, kindOf(a, x)); }), tauOf(a));
    }
    for (var it = 0; it < opt.iters; it++) {
      var NP = [];
      for (a = 0; a < nA; a++) {
        if (!L[a].length) { NP[a] = []; continue; }
        var np = softmax(evs(a), tauOf(a));
        NP[a] = np.map(function (v, i) { return 0.5 * v + 0.5 * P[a][i]; });
      }
      P = NP;
    }
    return { L: L, U: U, P: P, evs: evs, pOf: pOf, rho: rho, loss: loss, rest: rest };
  }

  /* learn each opponent's habits from the revealed rounds: how predictable they are and
     whether they lean toward tables, stealing or barriers */
  function learnHabits(hist, me, prior) {
    var stat = habitStats(hist, me);
    // what the learning rival remembers of a player from earlier games counts as earlier rounds
    if (prior) Object.keys(prior).forEach(function (p) {
      var q = prior[p]; if (!q || !(q.n > 0) || +p === me) return;
      var st = stat[p] = stat[p] || { n: 0, hit: 0, obs: [0, 0, 0], pred: [0, 0, 0] };
      st.n += q.n; st.hit += q.hit;
      for (var k = 0; k < 3; k++) { st.obs[k] += q.obs[k]; st.pred[k] += q.pred[k]; }
    });
    return habitsFrom(stat);
  }
  /* per opponent: rounds seen, how often the model's favourite was right, and the kinds of target chosen vs expected */
  function habitStats(hist, me) {
    var stat = {};
    (hist || []).forEach(function (h) {
      if (!h.pre || !h.pk) return;
      var ctx = aiCtx(h.pre);
      var m = model(ctx, { iters: 1, oppTau: 1.2, fut: 0.25 });
      h.pk.forEach(function (x, a) {
        if (!x || ctx.A[a].p === me) return;
        var i = m.L[a].indexOf(x); if (i < 0) return;
        var p = ctx.A[a].p, st = stat[p] = stat[p] || { n: 0, hit: 0, obs: [0, 0, 0], pred: [0, 0, 0] };
        st.n++;
        var best = 0; m.P[a].forEach(function (v, k) { if (v > m.P[a][best]) best = k; });
        if (best === i) st.hit++;
        st.obs[kindOf(a, x)]++;
        m.L[a].forEach(function (y, k) { st.pred[kindOf(a, y)] += m.P[a][k]; });
      });
    });
    return stat;
  }
  function habitsFrom(stat) {
    var out = {};
    Object.keys(stat).forEach(function (p) {
      var st = stat[p], w = st.n / (st.n + 4);
      var hit = (st.hit + 1.5) / (st.n + 4);
      out[p] = {
        tau: Math.max(0.55, Math.min(2.4, 2.3 - 2.0 * hit)) * w + 1.1 * (1 - w),
        bias: st.obs.map(function (o, k) { return Math.max(-1.6, Math.min(1.6, Math.log((o + 0.7) / (st.pred[k] + 0.7)))) * 1.4 * w; }),
        n: st.n
      };
    });
    return out;
  }

  function E_T(x) { return x && x[0] === 't' ? +x.slice(1) + 1 : 0; }
  /* every CPU gets small, fixed leanings for one game (tables vs. stealing vs. barriers, favourite tables),
     so several CPUs of the same level do not all reason identically */
  function personality(view, p, level, ampIn) {
    var id = String(view.P[p] && view.P[p].id) + '|' + view.gid, h = 2166136261;
    for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    var r = mulberry32(h >>> 0), amp = ampIn != null ? ampIn : level >= 3 ? 0.6 : level === 2 ? 1.0 : 1.4;
    var out = [0, (r() - 0.5) * 1.6 * amp, (r() - 0.5) * 1.0 * amp];
    out.t = [0, 1, 2, 3, 4].map(function () { return (r() - 0.5) * 0.9 * amp; });
    return out;
  }
  function pickIndex(probs, rnd) { var r = rnd(), acc = 0; for (var i = 0; i < probs.length; i++) { acc += probs[i]; if (r < acc) return i; } return probs.length - 1; }

  /* the CPU person p chooses for all of its active hands. view = public view (never holds others' picks). */
  function cpuDecide(view, p, level, rnd, over) {
    rnd = rnd || Math.random;
    var lv = LEVELS[level] || LEVELS[2];
    over = over || CPU_OVER;
    if (over) { var o2 = {}, k2; for (k2 in lv) o2[k2] = lv[k2]; for (k2 in over) o2[k2] = over[k2]; lv = o2; }
    var sn = snapshot(view), ctx = aiCtx(sn);
    if (lv.vw) ctx.vw = lv.vw;
    if (lv.rw) ctx.rw = lv.rw;
    var mine = ctx.pa[p].filter(function (a) { return !ctx.A[a].rest; });
    if (!mine.length) return {};
    var habits = lv.learn ? learnHabits(view.hist, p, lv.prior) : {};
    var opt = {
      iters: lv.iters, oppTau: lv.oppTau, fut: lv.fut,
      tauFor: function (q) { return q === p ? lv.tau : habits[q] ? habits[q].tau : null; },
      biasFor: function (q) { return q !== p && habits[q] ? habits[q].bias : null; }
    };
    var m = model(ctx, opt);
    var excl = {}; ctx.pa[p].forEach(function (a) { excl[a] = 1; });
    var pers = personality(view, p, level, lv.amp);
    var out = {};
    function lean(a, list) { return list.map(function (e, i) { var x = m.L[a][i]; return e + pers[kindOf(a, x)] + (E_T(x) ? pers.t[E_T(x) - 1] : 0); }); }
    if (mine.length === 1) {
      var a = mine[0], ev = lean(a, m.evs(a, excl));
      out[a] = m.L[a][pickIndex(softmax(ev, lv.tau), rnd)];
      return out;
    }
    // two hands (2 players): choose the pair together so the hands never collide with each other
    var a0 = mine[0], a1 = mine[1], e0 = lean(a0, m.evs(a0, excl)), e1 = lean(a1, m.evs(a1, excl)), pairs = [], vals = [];
    m.L[a0].forEach(function (x0, i) {
      m.L[a1].forEach(function (x1, j) {
        var v = e0[i] + e1[j];
        if (x0 === x1) {
          if (x1 === 'v' + a1) v = e1[j] - 1;          // right hand barriers, the left finger is wasted on it
          else if (x0 === 'v' + a0) v = e0[i] - 1;     // left hand barriers, the right finger is wasted
          else v = -1;                                  // both hands on one place: neither gets it
        }
        pairs.push([x0, x1]); vals.push(v);
      });
    });
    // a person never points both hands at the same place unless nothing else is possible
    var ok = pairs.map(function (pr) { return pr[0] !== pr[1]; });
    if (ok.some(Boolean)) vals = vals.map(function (v, i) { return ok[i] ? v : -1e9; });
    var k = pickIndex(softmax(vals, lv.tau), rnd);
    out[a0] = pairs[k][0]; out[a1] = pairs[k][1];
    return out;
  }

  /* a practice game for the learning rival: np persons, settings a in the even seats (the odd ones when swap) against
     settings b, all at level 4; 1 when an a seat wins (shared on a tie) */
  function practice(a, b, seed, swap, np) {
    np = np || 3;
    var persons = []; for (var i = 0; i < np; i++) persons.push({ id: 'p' + i, nm: 'P' + i });
    var s = newGame(persons, { seed: seed >>> 0, now: 1, dealer: seed % np }), rnd = mulberry32((seed ^ 0x6a09e667) >>> 0);
    var side = function (p) { return (p % 2 === 0) !== !!swap; }, guard = 0;
    while (s.ph !== 'over' && guard++ < 150) {
      if (s.ph === 'deal') { dealPlace(s, s.dealer, cpuDeal(publicView(s), s.dealer, 4, rnd)); continue; }
      var v = publicView(s), picks = s.A.map(function () { return null; });
      for (var p = 0; p < np; p++) { var d = cpuDecide(v, p, 4, rnd, side(p) ? a : b); for (var k in d) picks[k] = d[k]; }
      if (!resolveRound(s, picks).ok) break;
    }
    var st = standings(s), firsts = st.filter(function (r) { return r.rank === 1; }), won = 0;
    firsts.forEach(function (r) { if (side(r.p)) won += 1 / firsts.length; });
    return won;
  }

  /* the dealer CPU puts the last gem where it helps itself most and the others least */
  function cpuDeal(view, p, level, rnd) {
    rnd = rnd || Math.random;
    var d = view.deal; if (!d) return null;
    var sn = snapshot(view), ctx = aiCtx(sn), gem = [0, 0, 0, 0]; gem[colorIdx(d.gem)] = 1;
    var best = null, bv = -Infinity;
    d.legal.forEach(function (t) {
      var v = 0;
      var withGem = ctx.T.slice(); withGem[t] = add4(ctx.T[t], gem);
      var c2 = { T: withGem, A: ctx.A, pa: ctx.pa, np: ctx.np, final: true, bag: 0, left: 1, two: ctx.two };
      ctx.pa[p].forEach(function (a) { v += utility(c2, a, 't' + t) - utility(ctx, a, 't' + t); });
      var worst = 0;
      Object.keys(ctx.pa).forEach(function (q) { q = +q; if (q === p) return; ctx.pa[q].forEach(function (a) { worst = Math.max(worst, utility(c2, a, 't' + t) - utility(ctx, a, 't' + t)); }); });
      v -= 0.7 * worst;
      v += (level === 1 ? 2 : level >= 4 ? 0.02 : 0.2) * rnd();
      if (v > bv) { bv = v; best = t; }
    });
    return best;
  }

  return {
    COLORS: COLORS, POINTS: POINTS, SET_BONUS: SET_BONUS, SETUP: SETUP, TABLE_NAMES: TABLE_NAMES, LEVELS: LEVELS,
    colorIdx: colorIdx, colorOf: colorOf, counts: counts, scoreCounts: scoreCounts, scoreGems: scoreGems,
    actorScore: actorScore, personScore: personScore, standings: standings, actorsOf: actorsOf,
    actorName: actorName, targetName: targetName, tIdx: tIdx, vIdx: vIdx,
    newGame: newGame, roundLimit: roundLimit, legalTargets: legalTargets, isLegal: isLegal, isActive: isActive, activeActors: activeActors,
    resolveRound: resolveRound, dealPlace: dealPlace, openTables: openTables, snapshot: snapshot,
    publicView: publicView, bagCount: bagCount, clone: clone, mulberry32: mulberry32,
    sha256: sha256, commitHash: commitHash,
    cpuDecide: cpuDecide, cpuDeal: cpuDeal, learnHabits: learnHabits, habitStats: habitStats, aiCtx: aiCtx, utility: utility,
    GROW_SPACE: GROW_SPACE, GROW_BASE: GROW_BASE, practice: practice
  };
});

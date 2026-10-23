/* おばけキャッチ — 反射ドリル: per-card records, the adaptive time line and the card scheduler.
   Pure logic (no DOM); app.js draws the screens and tools/nurie-drill-test.mjs checks this file.

   The 60 cards never change and every card always has the same answer, so the fastest player is the one who
   stops working each answer out and simply recognises the card (instance theory: practice stores one memory per
   encounter, and once enough are stored, remembering beats calculating). The drill is built for that:
     - Every card keeps its last correct times. The median of the last three puts it in a band, measured against
       the CPU times in engine.js: 計算中 → つよい級 → 最強級 → 反射級. A recent mistake makes it 要復習.
     - Cards come in random order: never the same card within three cards and never three of the same answer in a
       row, so the answer can't be guessed from the order. Slow and missed cards come back sooner, fast ones less
       often (spacing); a missed card is asked again three cards later and, once right, about eight cards after
       that. Now and then the next card is a look-alike — the same two objects in other colours with another
       answer — so the difference stands out (interleaving works best on similar items shown back to back).
     - Each kind of card has a time line. Three passes in a row (right and within the line) make it 5 % shorter,
       one miss or one slow answer makes it 5 % longer, so it settles where about four answers in five pass
       (a 1-up/3-down staircase). The line is kept for the next session. */
(function (root, factory) {
  var api = factory(root && root.NR_DECK ? root.NR_DECK : (typeof require === 'function' ? require('./deck.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NR_DRILL = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  var COUNT = D.CARDS.length;
  /* Kinds of card: m = an object in its own colour, n = the missing object; c = answered with the name button. */
  var KINDS = ['m', 'n', 'mc', 'nc'];
  var KIND_NAME = { m: 'ホンモノの色', n: 'どこにもいない', mc: 'ホンモノの色・呼ぶ', nc: 'どこにもいない・呼ぶ' };
  /* A band is reached when the median of the last three correct times is at or under its limit (ms).
     つよい and 最強 are the middle of those CPUs' answer times in engine.js (LEVELS 3 and 4, plus the time they need
     to call a name); 反射 sits just above what a person can do at all (engine.js FLOOR). */
  var BANDS = [
    { id: 'reflex', m: 600, n: 700, call: 150 },
    { id: 'max', m: 770, n: 970, call: 160 },
    { id: 'strong', m: 1040, n: 1340, call: 200 }
  ];
  var RANK = { 'new': 0, miss: 1, slow: 2, strong: 3, max: 4, reflex: 5 };
  var START = { m: 1100, n: 1500, mc: 1300, nc: 1700 };   // first line when nothing is known yet
  var FLOOR = { m: 430, n: 540, mc: 580, nc: 690 };        // the line never asks for less than a person can do
  var CEIL = 4000, STEP = 0.95, PASSES = 3;
  var MAX_RT = 10000;       // a longer answer (a pause, a distraction) still counts, but its time is not kept
  var KEEP_TIMES = 5, KEEP_HISTORY = 3, KEEP_SESSIONS = 30;
  /* Scheduler: how much a card is wanted in each state, and after how many answers it is due again. */
  var WEIGHT = { 'new': 6, miss: 9, slow: 4, strong: 2.2, max: 1.2, reflex: 0.5 };
  var GAP = { 'new': 0, miss: 3, slow: 8, strong: 16, max: 30, reflex: 60 };
  var MIN_KNOWN = 10;       // a predicted 60-card time is shown once this many cards have a time
  var NO_REPEAT = 3, SAME_ANSWER_MAX = 2;
  var CONTRAST_AFTER_RIGHT = 0.25, CONTRAST_AFTER_MISS = 0.6;   // chance that a look-alike comes next
  var NEW_SHARE = 0.7;      // while some cards were never answered, most picks introduce one of them
  var MIX_SHARE = 0.2;      // and a fifth of the picks ignore the bands, so every card keeps coming back
  var RETEST = { miss: 3, again: 8 };   // cards in between: after a mistake, and after the first right answer since

  function num(a, b) { return a - b; }
  function median(list) {
    if (!list.length) return null;
    var s = list.slice().sort(num), k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function time(v) { return typeof v === 'number' && isFinite(v) && v > 0 && v <= 60000 ? Math.round(v) : null; }
  function count(v, cap) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.min(cap || 1e7, Math.floor(v)) : 0; }

  function answerOf(id) { return D.solve(D.CARDS[id]).answer; }
  function kind(id, call) {
    var c = D.CARDS[id];
    return (D.solve(c).match ? 'm' : 'n') + (D.required(c, !!call).type === 'call' ? 'c' : '');
  }
  function kindsFor(call) { return call ? KINDS.slice() : ['m', 'n']; }
  function limit(band, k) { return band[k.charAt(0)] + (k.length > 1 ? band.call : 0); }
  function bandLimit(id, k) { for (var i = 0; i < BANDS.length; i++) if (BANDS[i].id === id) return limit(BANDS[i], k); return null; }

  /* ---------------------------------------------------------------- stored records */
  function freshRule() { return { cards: {}, lines: {}, trials: 0, sessions: [] }; }
  function fresh() { return { v: 1, base: freshRule(), call: freshRule() }; }
  function normalize(raw) {
    var out = fresh();
    ['base', 'call'].forEach(function (key) {
      var r = raw && raw[key], o = out[key];
      if (!r || typeof r !== 'object') return;
      o.trials = count(r.trials);
      for (var i = 0; i < COUNT; i++) {
        var e = r.cards && r.cards[i];
        if (!e || typeof e !== 'object') continue;
        var rts = Array.isArray(e.rts) ? e.rts.map(time).filter(function (x) { return x !== null; }).slice(-KEEP_TIMES) : [];
        var h = Array.isArray(e.h) ? e.h.filter(function (x) { return x === 0 || x === 1; }).slice(-KEEP_HISTORY) : [];
        var n = count(e.n), ok = Math.min(count(e.ok), n);
        if (!n) continue;
        o.cards[i] = { n: n, ok: ok, rts: rts, h: h, best: time(e.best), last: e.last == null ? null : Math.min(count(e.last), o.trials) };
      }
      KINDS.forEach(function (k) { var v = time(r.lines && r.lines[k]); if (v !== null) o.lines[k] = clamp(v, FLOOR[k], CEIL); });
      if (Array.isArray(r.sessions)) o.sessions = r.sessions.filter(function (x) { return x && typeof x === 'object' && count(x.n) > 0; }).slice(-KEEP_SESSIONS).map(function (x) {
        return { at: count(x.at, 1e15), n: count(x.n), ok: count(x.ok), pass: count(x.pass), m: time(x.m), nn: time(x.nn),
          from: count(x.from, 1e6) || null, pred: count(x.pred, 1e6) || null };
      });
    });
    return out;
  }
  function rule(data, call) { return data[call ? 'call' : 'base']; }
  function card(rs, id) { return rs.cards[id] || (rs.cards[id] = { n: 0, ok: 0, rts: [], h: [], best: null, last: null }); }
  function note(e, ok, rt) {
    e.n += 1;
    if (ok && rt !== null && rt <= MAX_RT) {
      e.ok += 1;
      e.rts.push(rt); if (e.rts.length > KEEP_TIMES) e.rts.shift();
      if (!e.best || rt < e.best) e.best = rt;
    } else if (ok) e.ok += 1;
    e.h.push(ok ? 1 : 0); if (e.h.length > KEEP_HISTORY) e.h.shift();
  }

  /* typical time for a card: median of the last three correct answers (the slower one of two, so one lucky touch
     doesn't count as learnt). null when the card has no correct answer yet. */
  function estimate(e) {
    if (!e || !e.rts || !e.rts.length) return null;
    var r = e.rts.slice(-3);
    if (r.length === 1) return r[0];
    if (r.length === 2) return Math.max(r[0], r[1]);
    return r.slice().sort(num)[1];
  }
  function statusOf(e, k) {
    if (!e || !e.n) return 'new';
    var miss = e.h.lastIndexOf(0);
    if (miss >= 0 && e.h.length - 1 - miss < 2) return 'miss';      // a mistake needs two right answers after it
    if (e.rts.length < 2) return 'slow';
    var t = estimate(e);
    for (var i = 0; i < BANDS.length; i++) if (t <= limit(BANDS[i], k)) return BANDS[i].id;
    return 'slow';
  }
  function status(data, call, id) { return statusOf(rule(data, call).cards[id], kind(id, call)); }
  function counts(data, call) {
    var out = { 'new': 0, miss: 0, slow: 0, strong: 0, max: 0, reflex: 0 };
    for (var i = 0; i < COUNT; i++) out[status(data, call, i)] += 1;
    return out;
  }
  /* ranking answers and other timed play: update the card's record without touching the drill's schedule */
  function observe(data, call, id, ok, rt) {
    if (!(id >= 0 && id < COUNT && id % 1 === 0)) return null;
    var e = card(rule(data, call), id);
    note(e, !!ok, ok ? time(rt) : null);
    return e;
  }
  function reset(data, call) { data[call ? 'call' : 'base'] = freshRule(); }

  /* the sum of every card's typical time: what 60 cards without a mistake would take today */
  function estimates(data, call) {
    var rs = rule(data, call), est = [], byKind = {};
    for (var i = 0; i < COUNT; i++) {
      var t = estimate(rs.cards[i]), k = kind(i, call);
      est.push(t);
      if (t !== null) (byKind[k] = byKind[k] || []).push(t);
    }
    return est.map(function (t, id) {
      if (t !== null) return t;
      var k = kind(id, call), same = byKind[k];
      return same && same.length ? median(same) : START[k];
    });
  }
  function predict(data, call) {
    var rs = rule(data, call), known = 0;
    for (var i = 0; i < COUNT; i++) if (estimate(rs.cards[i]) !== null) known++;
    var total = estimates(data, call).reduce(function (a, b) { return a + b; }, 0);
    return { total: Math.round(total), known: known };
  }
  /* chance that a person answering in t ms is faster than one CPU whose time is spread over [lo, hi] like
     engine.js cpuPlan (the mean of two random numbers), plus `add` for calling a name. */
  function beat(t, span, add) {
    var lo = span[0] + (add || 0), hi = span[1] + (add || 0);
    if (t <= lo) return 1;
    if (t >= hi) return 0;
    var u = (t - lo) / (hi - lo), F = u <= 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    return 1 - F;
  }
  /* share of cards you would touch first against `cpus` CPUs of one level (their slips left out) */
  function takeRate(data, call, level, cpus) {
    var n = Math.max(1, cpus || 1), est = estimates(data, call), sum = 0;
    for (var i = 0; i < COUNT; i++) {
      var k = kind(i, call), span = k.charAt(0) === 'm' ? level.match : level.none;
      sum += Math.pow(beat(est[i], span, k.length > 1 ? level.call : 0), n);
    }
    return sum / COUNT;
  }

  /* ---------------------------------------------------------------- the scheduler */
  function wanted(rs, id, call) {
    var e = rs.cards[id], st = statusOf(e, kind(id, call)), want = GAP[st];
    var since = e && e.last !== null ? rs.trials - e.last : Infinity;
    var due = want === 0 ? 1 : since >= want ? Math.min(3, 1 + (since - want) / want) : 0.1;
    return WEIGHT[st] * due;
  }
  function choose(pool, weights, rnd) {
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += weights[i];
    if (!(total > 0)) return pool[Math.floor(rnd() * pool.length)];
    var ticket = rnd() * total;
    for (i = 0; i < pool.length; i++) { ticket -= weights[i]; if (ticket < 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  /* may this card come next? (not just seen, and not a third same answer in a row) */
  function allowed(id, recent, run) {
    if (recent.indexOf(id) >= 0) return false;
    return !(run && run.len >= SAME_ANSWER_MAX && answerOf(id) === run.item);
  }
  /* ctx: { recent: [ids], prev: id|null, prevOk: bool, run: { item, len } } */
  function pick(data, call, ctx, rnd) {
    rnd = rnd || Math.random; ctx = ctx || {};
    var rs = rule(data, call), recent = (ctx.recent || []).slice(-NO_REPEAT), run = ctx.run || { item: null, len: 0 };
    var cands = [], i;
    for (i = 0; i < COUNT; i++) if (allowed(i, recent, run)) cands.push(i);
    if (!cands.length) for (i = 0; i < COUNT; i++) if (recent.indexOf(i) < 0) cands.push(i);
    var pool = null;
    if (ctx.prev !== null && ctx.prev !== undefined && rnd() < (ctx.prevOk === false ? CONTRAST_AFTER_MISS : CONTRAST_AFTER_RIGHT)) {
      var pair = D.CARDS[ctx.prev].pair, was = answerOf(ctx.prev);
      var look = cands.filter(function (id) { return D.CARDS[id].pair === pair && answerOf(id) !== was; });
      if (look.length) pool = look;
    }
    if (!pool) {
      var unseen = cands.filter(function (id) { return !rs.cards[id] || !rs.cards[id].n; });
      if (unseen.length && rnd() < NEW_SHARE) pool = unseen;
    }
    if (!pool && rnd() < MIX_SHARE) return cands[Math.floor(rnd() * cands.length)];
    pool = pool || cands;
    return choose(pool, pool.map(function (id) { return wanted(rs, id, call); }), rnd);
  }

  /* ---------------------------------------------------------------- one session */
  function startLine(rs, k, call) {
    if (rs.lines[k]) return clamp(Math.round(rs.lines[k] / STEP), FLOOR[k], CEIL);   // warm up one step easier
    var ts = [];
    for (var i = 0; i < COUNT; i++) if (kind(i, call) === k) { var t = estimate(rs.cards[i]); if (t !== null) ts.push(t); }
    return ts.length >= 5 ? clamp(Math.round(median(ts)), FLOOR[k], CEIL) : START[k];
  }
  function snapshot(data, call) {
    var st = [], p = predict(data, call);
    for (var i = 0; i < COUNT; i++) st.push(status(data, call, i));
    return { status: st, counts: counts(data, call), pred: p.total, known: p.known };
  }
  function begin(data, call, total) {
    var rs = rule(data, call), lines = {}, runs = {};
    kindsFor(call).forEach(function (k) { lines[k] = startLine(rs, k, call); runs[k] = 0; });
    var size = Math.max(1, Math.min(10000, Math.floor(total) || 120));
    return { call: !!call, total: size, done: 0, lines: lines, startLines: JSON.parse(JSON.stringify(lines)), runs: runs,
      recent: [], prev: null, prevOk: true, run: { item: null, len: 0 }, retest: [], current: null, results: [], start: snapshot(data, call) };
  }
  /* the card to show; the same card again until it is answered (a pause shows it again) */
  function next(s, data, rnd) {
    if (s.done >= s.total) return null;
    if (s.current === null) {
      var recent = s.recent.slice(-NO_REPEAT), due = null;
      s.retest.sort(function (a, b) { return a.at - b.at; });
      for (var i = 0; i < s.retest.length && s.retest[i].at <= s.done; i++) if (allowed(s.retest[i].id, recent, s.run)) { due = i; break; }
      if (due !== null) s.current = s.retest.splice(due, 1)[0].id;
      else s.current = pick(data, s.call, s, rnd);
    }
    return s.current;
  }
  function answer(s, data, id, ok, rt) {
    if (s.current === null || s.current !== id || s.done >= s.total) return null;
    var rs = rule(data, s.call), k = kind(id, s.call), e = card(rs, id);
    var before = statusOf(e, k), elapsed = time(rt), line = s.lines[k];
    var pass = !!ok && elapsed !== null && elapsed <= line;
    note(e, !!ok, elapsed);
    e.last = rs.trials; rs.trials += 1;
    if (pass) {
      s.runs[k] += 1;
      if (s.runs[k] >= PASSES) { s.lines[k] = clamp(Math.round(line * STEP), FLOOR[k], CEIL); s.runs[k] = 0; }
    } else { s.runs[k] = 0; s.lines[k] = clamp(Math.round(line / STEP), FLOOR[k], CEIL); }
    rs.lines[k] = s.lines[k];
    var after = statusOf(e, k), item = answerOf(id);
    s.done += 1; s.current = null;
    s.retest = s.retest.filter(function (r) { return r.id !== id; });
    if (after === 'miss') s.retest.push({ id: id, at: s.done + (ok ? RETEST.again : RETEST.miss) });
    s.recent.push(id); if (s.recent.length > 8) s.recent.shift();
    s.prev = id; s.prevOk = !!ok;
    if (s.run.item === item) s.run.len += 1; else s.run = { item: item, len: 1 };
    var res = { id: id, kind: k, ok: !!ok, rt: elapsed, line: line, nextLine: s.lines[k], pass: pass, before: before, after: after,
      up: RANK[after] >= RANK.strong && RANK[after] > RANK[before] };
    s.results.push(res);
    return res;
  }
  function finish(s, data, at) {
    var rs = rule(data, s.call), res = s.results, right = res.filter(function (r) { return r.ok; });
    var times = { m: [], n: [] };
    right.forEach(function (r) { if (r.rt !== null) times[r.kind.charAt(0)].push(r.rt); });
    var end = snapshot(data, s.call), ups = [], misses = [];
    for (var i = 0; i < COUNT; i++) if (RANK[end.status[i]] >= RANK.strong && RANK[end.status[i]] > RANK[s.start.status[i]]) ups.push(i);
    res.forEach(function (r) { if (!r.ok && misses.indexOf(r.id) < 0) misses.push(r.id); });
    var slow = right.filter(function (r) { return !r.pass && misses.indexOf(r.id) < 0; }).sort(function (a, b) { return b.rt - a.rt; })
      .map(function (r) { return r.id; }).filter(function (id, k, all) { return all.indexOf(id) === k; });
    var med = { m: median(times.m), n: median(times.n) };
    var rec = { at: Math.max(0, Math.floor(at || 0)), n: res.length, ok: right.length, pass: res.filter(function (r) { return r.pass; }).length,
      m: med.m === null ? null : Math.round(med.m), nn: med.n === null ? null : Math.round(med.n),
      from: s.start.known >= MIN_KNOWN ? s.start.pred : null, pred: end.known >= MIN_KNOWN ? end.pred : null };
    if (res.length) { rs.sessions.push(rec); if (rs.sessions.length > KEEP_SESSIONS) rs.sessions.shift(); }
    return { n: rec.n, ok: rec.ok, pass: rec.pass, med: med, startLines: s.startLines, lines: s.lines,
      pred: end.pred, known: end.known, startPred: s.start.pred, startKnown: s.start.known,
      counts: end.counts, startCounts: s.start.counts, ups: ups, misses: misses, slow: slow };
  }

  return {
    COUNT: COUNT, KINDS: KINDS, KIND_NAME: KIND_NAME, BANDS: BANDS, RANK: RANK, START: START, FLOOR: FLOOR, STEP: STEP, PASSES: PASSES, MIN_KNOWN: MIN_KNOWN,
    WEIGHT: WEIGHT, GAP: GAP, NO_REPEAT: NO_REPEAT, SAME_ANSWER_MAX: SAME_ANSWER_MAX,
    fresh: fresh, normalize: normalize, rule: rule, kind: kind, kindsFor: kindsFor, answerOf: answerOf, bandLimit: bandLimit,
    estimate: estimate, status: status, counts: counts, observe: observe, reset: reset,
    estimates: estimates, predict: predict, beat: beat, takeRate: takeRate,
    pick: pick, begin: begin, next: next, answer: answer, finish: finish, median: median
  };
});

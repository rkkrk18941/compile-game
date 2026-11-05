/* 風の怪物ピラデロ — the rules, with nothing about the screen.
   10 cards: 0..9, one of each (0 = the blue-eyed monster, 9 = the red-eyed monster, 1..8 plain).
   Everyone starts with 5 gears; the key marks who starts the round. A round, clockwise from the key:
     pick    on your turn look at one face-down field card (only you see it), then take one field card
             into your hand (it may be a different one). Two laps, so everyone holds 2 cards and as many
             field cards are left as there are players. 3 players: 9 field cards + 1 wind card.
             2 players: 6 field cards + 1 wind card, the other 3 cards are not used.
     escape  the field cards left are turned up (not the wind card). From the key holder on, each player in
             turn fights or flees. Fleeing costs 1 gear and you sit the round out. A lone fighter wins by default.
     battle  fighters show their hands. From the smallest hand total up, each takes the largest field card
             left (equal totals: the earlier player takes first). With 2 fighters and 3 field cards they take
             the largest and the smallest; the middle one stays.
     wind    the wind card is turned up. 0 or 9: the smallest total wins. 1..8: the largest total wins.
             Equal totals: the earlier player counts as larger. Every other fighter loses 2 gears.
   A player at 0 gears is out; the winner takes the key; with one player left the game is over.

   State is plain JSON (saved and sent as is). apply(st, seat, act) → { ok, ev } or { ok: false, err }.
   Events carry what everyone may see; a value only some seats know sits in ev.see = { seat: value } and
   evFor turns it into ev.v for those seats only. viewFor(st, seat) is everything that seat may know.
   Seats run clockwise: the next player is seat + 1. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PD_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isMonster(v) { return v === 0 || v === 9; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }

  /* ------------------------------------------------------------------ randomness (state kept in st.rs) */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand(st) {
    var a = st.rs | 0; a = (a + 0x6D2B79F5) | 0; st.rs = a;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand(st) * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ------------------------------------------------------------------ a new game */
  // o: { players: [{ name, kind: 'human'|'cpu', level }], seed, gears (5), key (-1 = random) }
  function newGame(o) {
    var n = o.players.length;
    if (n < 2 || n > 3) throw new Error('2 or 3 players');
    var g = o.gears === 3 || o.gears === 7 ? o.gears : 5;
    var st = {
      v: 1, n: n, rs: (o.seed >>> 0) || 1, startGears: g,
      players: o.players.map(function (p) { return { name: String(p.name || ''), kind: p.kind === 'cpu' ? 'cpu' : 'human', level: p.level || 0, gears: g, out: false }; }),
      key: 0, round: 0, phase: 'pick', order: [], ti: 0, step: 'peek', peekSlot: -1,
      slots: [], wind: -1, windOpen: false, unused: [], hands: [], knows: [], picks: [], choice: [], ei: 0,
      last: null, hist: [], winner: -1, moves: 0, rps: null
    };
    var key = typeof o.key === 'number' && o.key >= 0 && o.key < n ? o.key : Math.floor(rand(st) * n);
    st.key = key;
    st.rps = { key: key, random: !(typeof o.key === 'number' && o.key >= 0) };
    newRound(st, []);
    return st;
  }
  // the deal of the round in play, as an event (the page shows the first deal with it)
  function roundEvent(st) { return { t: 'round', round: st.round, key: st.key, order: st.order.slice(), slots: st.slots.length, unused: st.unused.length }; }

  function alive(st) { var a = []; for (var i = 0; i < st.n; i++) if (!st.players[i].out) a.push(i); return a; }
  function orderFrom(st, key) {
    var o = [];
    for (var k = 0; k < st.n; k++) { var s = (key + k) % st.n; if (!st.players[s].out) o.push(s); }
    return o;
  }

  function newRound(st, ev) {
    st.round++;
    st.order = orderFrom(st, st.key);
    var k = st.order.length, deck = shuffle(st, CARDS.slice());
    var fieldN = k === 3 ? 9 : 6;
    st.slots = deck.slice(0, fieldN).map(function (c) { return { c: c, by: -1, seen: [], recv: false }; });
    st.wind = deck[fieldN];
    st.windOpen = false;
    st.unused = deck.slice(fieldN + 1);
    st.hands = []; st.knows = []; st.choice = [];
    for (var i = 0; i < st.n; i++) { st.hands.push([]); st.knows.push({}); st.choice.push(null); }
    st.picks = [];
    st.phase = 'pick'; st.ti = 0; st.step = 'peek'; st.peekSlot = -1; st.ei = 0;
    ev.push({ t: 'round', round: st.round, key: st.key, order: st.order.slice(), slots: fieldN, unused: st.unused.length });
  }

  /* ------------------------------------------------------------------ whose move */
  function turnSeat(st) {
    if (st.phase === 'pick') return st.order[st.ti % st.order.length];
    if (st.phase === 'escape') return st.order[st.ei];
    return -1;
  }
  function waitingFor(st) { var s = turnSeat(st); return s >= 0 ? [s] : []; }
  function fail(err) { return { ok: false, err: err }; }
  function openSlot(st, i) { return typeof i === 'number' && (i | 0) === i && i >= 0 && i < st.slots.length && st.slots[i].by < 0; }

  /* ------------------------------------------------------------------ moves
     { t: 'peek', slot }   { t: 'take', slot }   { t: 'fight' }   { t: 'flee' } */
  function apply(st, p, act) {
    if (!act || typeof act !== 'object') return fail('bad');
    if (st.phase === 'over') return fail('over');
    if (turnSeat(st) !== p) return fail('turn');
    var ev = [];
    if (st.phase === 'pick') {
      if (act.t === 'peek') {
        if (st.step !== 'peek') return fail('turn');
        if (!openSlot(st, act.slot)) return fail('bad');
        var S = st.slots[act.slot];
        if (S.seen.indexOf(p) < 0) S.seen.push(p);
        st.knows[p][act.slot] = S.c;
        st.peekSlot = act.slot; st.step = 'take';
        var see = {}; see[p] = S.c;
        ev.push({ t: 'peek', p: p, slot: act.slot, see: see });
      } else if (act.t === 'take') {
        if (st.step !== 'take') return fail('turn');
        if (!openSlot(st, act.slot)) return fail('bad');
        var T = st.slots[act.slot];
        T.by = p;
        st.hands[p].push(T.c);
        st.knows[p][act.slot] = T.c;
        st.picks.push({ p: p, peek: st.peekSlot, take: act.slot });
        var see2 = {};
        for (var s = 0; s < st.n; s++) if (st.knows[s][act.slot] !== undefined) see2[s] = T.c;
        ev.push({ t: 'take', p: p, slot: act.slot, peek: st.peekSlot, see: see2 });
        st.peekSlot = -1; st.step = 'peek'; st.ti++;
        if (st.ti >= st.order.length * 2) startEscape(st, ev);
      } else return fail('bad');
    } else if (st.phase === 'escape') {
      if (act.t !== 'fight' && act.t !== 'flee') return fail('bad');
      st.choice[p] = act.t;
      ev.push({ t: 'choose', p: p, c: act.t });
      if (act.t === 'flee') {
        st.players[p].gears = Math.max(0, st.players[p].gears - 1);
        ev.push({ t: 'gear', p: p, d: -1, left: st.players[p].gears, why: 'flee' });
      }
      st.ei++;
      advanceEscape(st, ev);
    } else return fail('bad');
    st.moves++;
    return { ok: true, ev: ev };
  }

  function startEscape(st, ev) {
    st.phase = 'escape'; st.ei = 0;
    var open = [];
    st.slots.forEach(function (S, i) { if (S.by < 0) open.push({ slot: i, v: S.c }); });
    ev.push({ t: 'reveal', slots: open });
    advanceEscape(st, ev);
  }

  // skip what needs no decision: when everyone before the last player fled, the last one wins by default
  function advanceEscape(st, ev) {
    var k = st.order.length;
    while (st.ei < k) {
      var p = st.order[st.ei], anyFight = false;
      for (var i = 0; i < st.ei; i++) if (st.choice[st.order[i]] === 'fight') anyFight = true;
      if (!anyFight && st.ei === k - 1) {
        st.choice[p] = 'fight';
        ev.push({ t: 'choose', p: p, c: 'fight', auto: true });
        st.ei++;
        continue;
      }
      return;
    }
    resolveRound(st, ev);
  }

  /* the battle and the wind, from a list of fighters in turn order; shared with the CPU (pure) */
  function battle(order, hands, fieldVals, fighters, wind) {
    var pos = {}; order.forEach(function (s, i) { pos[s] = i; });
    var tot = {}; fighters.forEach(function (s) { tot[s] = sum(hands[s]); });
    var asc = fighters.slice().sort(function (a, b) { return tot[a] - tot[b] || pos[a] - pos[b]; });
    var rem = fieldVals.slice().sort(function (a, b) { return b - a; });
    var recv = {};
    if (fighters.length === 2 && rem.length === 3) { recv[asc[0]] = rem[0]; recv[asc[1]] = rem[2]; }
    else asc.forEach(function (s, i) { recv[s] = rem[i]; });
    var fin = {};
    fighters.forEach(function (s) { fin[s] = tot[s] + recv[s]; });
    var rank = fighters.slice().sort(function (a, b) { return fin[b] - fin[a] || pos[a] - pos[b]; });
    var low = isMonster(wind);
    return { asc: asc, recv: recv, before: tot, total: fin, low: low, winner: low ? rank[rank.length - 1] : rank[0], rank: rank };
  }

  function resolveRound(st, ev) {
    var fighters = st.order.filter(function (s) { return st.choice[s] === 'fight'; });
    var fled = st.order.filter(function (s) { return st.choice[s] === 'flee'; });
    var sum0 = { round: st.round, order: st.order.slice(), key: st.key, fight: fighters.slice(), flee: fled.slice(), loss: {}, out: [] };
    fled.forEach(function (s) { sum0.loss[s] = 1; });
    var winner;
    if (fighters.length <= 1) {
      winner = fighters.length ? fighters[0] : st.key;
      sum0.kind = 'default';
      ev.push({ t: 'default', p: winner });
    } else {
      sum0.kind = 'battle';
      var hands = {};
      fighters.forEach(function (s) { hands[s] = st.hands[s].slice(); });
      ev.push({ t: 'show', hands: clone(hands) });
      var openIdx = [];
      st.slots.forEach(function (S, i) { if (S.by < 0) openIdx.push(i); });
      var vals = openIdx.map(function (i) { return st.slots[i].c; });
      var b = battle(st.order, st.hands, vals, fighters, st.wind);
      b.asc.forEach(function (s) {
        var v = b.recv[s];
        var slot = openIdx.filter(function (i) { return st.slots[i].c === v; })[0];
        st.slots[slot].by = s; st.slots[slot].recv = true;
        st.hands[s].push(v);
        ev.push({ t: 'recv', p: s, slot: slot, v: v, before: b.before[s], total: b.total[s] });
      });
      st.windOpen = true;
      ev.push({ t: 'wind', v: st.wind, low: b.low });
      winner = b.winner;
      sum0.hands = hands; sum0.recv = b.recv; sum0.before = b.before; sum0.total = b.total; sum0.wind = st.wind; sum0.low = b.low; sum0.rank = b.rank;
      ev.push({ t: 'win', p: winner, total: clone(b.total), low: b.low });
      fighters.forEach(function (s) {
        if (s === winner) return;
        st.players[s].gears = Math.max(0, st.players[s].gears - 2);
        sum0.loss[s] = (sum0.loss[s] || 0) + 2;
        ev.push({ t: 'gear', p: s, d: -2, left: st.players[s].gears, why: 'lose' });
      });
    }
    sum0.winner = winner;
    st.order.forEach(function (s) {
      if (!st.players[s].out && st.players[s].gears <= 0) { st.players[s].out = true; sum0.out.push(s); ev.push({ t: 'out', p: s }); }
    });
    sum0.gears = st.players.map(function (P) { return P.gears; });
    st.last = sum0;
    st.hist.push(sum0);
    if (st.hist.length > 60) st.hist.shift();
    st.key = winner;
    ev.push({ t: 'key', p: winner });
    var a = alive(st);
    if (a.length <= 1) {
      st.phase = 'over'; st.winner = a.length ? a[0] : winner;
      ev.push({ t: 'over', p: st.winner });
      return;
    }
    newRound(st, ev);
  }

  /* ------------------------------------------------------------------ what one seat may know */
  function viewFor(st, me) {
    var known = st.knows[me] || {};
    var v = {
      v: 1, me: me, n: st.n, phase: st.phase, round: st.round, key: st.key, order: st.order.slice(),
      turn: turnSeat(st), step: st.step, peekSlot: st.phase === 'pick' ? st.peekSlot : -1, waiting: waitingFor(st),
      startGears: st.startGears, moves: st.moves, winner: st.winner, rps: st.rps ? clone(st.rps) : null,
      unused: st.unused.length,
      wind: st.windOpen ? st.wind : null,
      choice: st.choice.slice(),
      picks: clone(st.picks),
      last: st.last ? clone(st.last) : null,
      hist: clone(st.hist.slice(-20)),
      slots: st.slots.map(function (S, i) {
        var open = (S.by < 0 && st.phase !== 'pick') || S.recv;
        var mine = known[i] !== undefined;
        return { by: S.by, seen: S.seen.slice(), recv: S.recv, open: open, v: open || mine ? S.c : null, mine: mine };
      }),
      players: st.players.map(function (P, i) {
        var o = { name: P.name, kind: P.kind, level: P.level, gears: P.gears, out: P.out, count: (st.hands[i] || []).length, slots: [] };
        st.slots.forEach(function (S, j) { if (S.by === i && !S.recv) o.slots.push(j); });
        if (i === me) o.hand = (st.hands[i] || []).slice();
        return o;
      })
    };
    return v;
  }
  function evFor(evs, me) {
    return (evs || []).map(function (e) {
      var c = clone(e);
      if (c.see) { if (c.see[me] !== undefined) c.v = c.see[me]; delete c.see; }
      return c;
    });
  }

  /* ------------------------------------------------------------------ small queries on a view */
  function myHand(v) { var h = v.players[v.me].hand; return h ? h.slice() : []; }
  function canPeek(v) { return v.phase === 'pick' && v.turn === v.me && v.step === 'peek'; }
  function canTake(v) { return v.phase === 'pick' && v.turn === v.me && v.step === 'take'; }
  function mustChoose(v) { return v.phase === 'escape' && v.turn === v.me; }
  function openSlots(v) { var o = []; v.slots.forEach(function (S, i) { if (S.by < 0) o.push(i); }); return o; }
  function aliveIn(v) { return v.players.map(function (P, i) { return P.out ? -1 : i; }).filter(function (i) { return i >= 0; }); }
  // every card is somewhere exactly once (tests)
  function census(st) {
    var all = st.slots.map(function (S) { return S.c; }).concat([st.wind], st.unused);
    if (all.length !== 10) return false;
    var seen = {};
    for (var i = 0; i < all.length; i++) { if (seen[all[i]] || all[i] < 0 || all[i] > 9) return false; seen[all[i]] = 1; }
    for (var s = 0; s < st.n; s++) {
      var h = st.hands[s].slice().sort().join(), f = st.slots.filter(function (S) { return S.by === s; }).map(function (S) { return S.c; }).sort().join();
      if (h !== f) return false;
    }
    return true;
  }

  return {
    CARDS: CARDS, mulberry32: mulberry32, newGame: newGame, roundEvent: roundEvent, apply: apply, viewFor: viewFor, evFor: evFor, waitingFor: waitingFor,
    battle: battle, isMonster: isMonster, sum: sum, myHand: myHand, canPeek: canPeek, canTake: canTake, mustChoose: mustChoose,
    openSlots: openSlots, aliveIn: aliveIn, census: census, orderFrom: orderFrom, clone: clone
  };
});

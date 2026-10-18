/* チケット・トゥ・ライド — rules engine (pure, no DOM). Plain script (window.TTR_ENG) for the page, the CPU worker
   and node tests. Needs map.js (window.TTR_MAP / require('./map.js')).

   The rules of Ticket to Ride (Alan R. Moon, Days of Wonder 2004), the North America map, 2-5 players:
   - 110 train cards: 12 of each of the 8 colours + 14 locomotives (SL, wild). 4 to each player, 5 face up.
   - 30 destination tickets: 3 to each player, who keeps at least 2 (all choose at the same time).
   - 45 trains each. On a turn a player does exactly one of:
       draw two train cards (face up or from the deck). A face-up locomotive may only be taken as the first card
       and then it is the only card that turn; a locomotive drawn blind from the deck counts as one card.
       A face-up card taken is replaced at once. Whenever three of the five face-up cards are locomotives all
       five are discarded and five new ones dealt (again, if needed; when the cards left cannot make a row
       without three locomotives the row stays as it is). An empty deck is made from the shuffled discards;
       with no deck and no discards nobody can draw train cards (empty face-up places are filled again at the
       end of a turn once there are discards).
     claim one route: as many cards of one colour as it has spaces (its colour; any one colour for gray);
       locomotives stand for any colour. Score 1/2/4/7/10/15 for 1-6 spaces at once. One player can never own
       both lanes of a double route; with 2 or 3 players only one lane of each double route can be used.
     draw three destination tickets (fewer if fewer are left) and keep at least one; the others go under the
       pile.
   - When someone ends a turn with 0, 1 or 2 trains left, everybody (that player too) has one more turn.
   - Final scoring: each ticket +points if its cities are joined by one's own routes, -points otherwise;
     10 points to whoever has the longest continuous path (all who tie); a path may loop and pass a city more
     than once but uses each route once. Ties: most completed tickets, then the longest-path bonus.
   - A player who cannot do anything at all passes (that only happens when every card is held and no route can
     be paid for and no tickets are left). Not in the rulebook: when every player has to pass in a row nothing
     can change any more, so the game ends there and is scored.

   State is plain JSON (the online host sends views of it). Cards are colour numbers 0-8. The deck's top is the
   end of its array; the tickets pile's top is the end too and returned tickets go under (to the front).
   apply(state, action) changes the state in place and returns { ok, ev } — events describe what happened step by
   step (eventsFor() hides what one player may not see), viewFor() is what one player may see and reduceView()
   steps a view forward by one event, so the page can replay a turn. */
(function (root, factory) {
  var M = root && root.TTR_MAP ? root.TTR_MAP : (typeof require === 'function' ? require('./map.js') : null);
  var api = factory(M);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TTR_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  var LOCO = 8, GRAY = 9, TRAINS = 45, FACE = 5, DECKSLOT = 5;
  var SCORE = M.SCORE, ROUTES = M.routes, TICKETS = M.tickets, NC = M.cities.length;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* the state keeps its own random stream so a game replays exactly from its seed */
  function rand(s) {
    s.rs = (s.rs + 0x6D2B79F5) >>> 0;
    var t = s.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand(s) * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fail(err) { return { ok: false, err: err }; }
  function sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------ setup */
  function newGame(opt) {
    opt = opt || {};
    var n = opt.n || 2;
    if (n < 2 || n > 5) throw new Error('2-5 players');
    var s = {
      v: 1, n: n, rs: (opt.seed == null ? (Math.random() * 4294967296) >>> 0 : opt.seed >>> 0),
      phase: 'setup', turn: -1, first: opt.first == null ? -1 : opt.first, ply: 0, turns: 0,
      deck: [], disc: [], face: [-1, -1, -1, -1, -1], tdeck: [],
      owner: ROUTES.map(function () { return -1; }),
      pl: [], step: null, endIn: -1, trig: -1, result: null, wipes: 0
    };
    for (var c = 0; c < 8; c++) for (var k = 0; k < 12; k++) s.deck.push(c);
    for (var l = 0; l < 14; l++) s.deck.push(LOCO);
    shuffle(s, s.deck);
    for (var t = 0; t < TICKETS.length; t++) s.tdeck.push(t);
    shuffle(s, s.tdeck);
    if (s.first < 0) s.first = Math.floor(rand(s) * n);
    for (var p = 0; p < n; p++) {
      var hand = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (var j = 0; j < 4; j++) hand[s.deck.pop()]++;
      s.pl.push({ hand: hand, tix: [], offer: null, keepMin: 2, trains: TRAINS, pts: 0, routes: [], ready: false });
    }
    fillFace(s, []);
    for (var q = 0; q < n; q++) s.pl[q].offer = [s.tdeck.pop(), s.tdeck.pop(), s.tdeck.pop()];
    return s;
  }

  /* ------------------------------------------------------------------ the train card supply */
  function drawOne(s, ev) {        // top card of the deck, reshuffling the discards first if it is empty
    if (!s.deck.length) {
      if (!s.disc.length) return -1;
      s.deck = shuffle(s, s.disc);
      s.disc = [];
      ev.push({ k: 'reshuffle', n: s.deck.length });
    }
    return s.deck.pop();
  }
  function locosUp(s) { var k = 0; for (var i = 0; i < FACE; i++) if (s.face[i] === LOCO) k++; return k; }
  /* can a full row be laid without three locomotives from the cards not held by anyone? */
  function rowPossible(s) {
    var pool = s.deck.length + s.disc.length + s.face.filter(function (c) { return c >= 0; }).length;
    var locos = s.face.filter(function (c) { return c === LOCO; }).length;
    s.deck.forEach(function (c) { if (c === LOCO) locos++; });
    s.disc.forEach(function (c) { if (c === LOCO) locos++; });
    var want = Math.min(FACE, pool);
    return pool - locos >= want - 2;
  }
  function fillFace(s, ev) {
    for (var i = 0; i < FACE; i++) if (s.face[i] < 0) {
      var c = drawOne(s, ev);
      if (c < 0) break;
      s.face[i] = c;
      ev.push({ k: 'refill', i: i, c: c });
    }
    var guard = 0;
    while (locosUp(s) >= 3 && guard++ < 60 && rowPossible(s)) {
      var gone = s.face.slice();
      for (var j = 0; j < FACE; j++) if (s.face[j] >= 0) s.disc.push(s.face[j]);
      s.face = [-1, -1, -1, -1, -1];
      s.wipes++;
      ev.push({ k: 'wipe', cards: gone });
      for (var m = 0; m < FACE; m++) {
        var d = drawOne(s, ev);
        if (d < 0) break;
        s.face[m] = d;
        ev.push({ k: 'refill', i: m, c: d });
      }
    }
  }
  function canDrawAny(s) { return s.deck.length + s.disc.length > 0 || s.face.some(function (c) { return c >= 0; }); }
  function canDrawSecond(s) { return s.deck.length + s.disc.length > 0 || s.face.some(function (c) { return c >= 0 && c !== LOCO; }); }

  /* ------------------------------------------------------------------ routes */
  /* why this player may not claim this lane (null = may, given the cards) */
  function laneBlock(s, p, r) {
    var R = ROUTES[r];
    if (!R) return 'none';
    if (s.owner[r] >= 0) return 'taken';
    if (R.twin >= 0) {
      var o = s.owner[R.twin];
      if (o >= 0 && s.n <= 3) return 'closed';
      if (o === p) return 'both';
    }
    if (s.pl[p].trains < R.len) return 'trains';
    return null;
  }
  /* ways to pay for a lane with this hand: [{ c, k }] = (len - k) cards of colour c + k locomotives; c = 8 means
     all locomotives. Fewest locomotives first. */
  function payments(hand, R) {
    var out = [], L = R.len;
    var cols = R.col === GRAY ? [0, 1, 2, 3, 4, 5, 6, 7] : [R.col];
    cols.forEach(function (c) {
      for (var k = Math.max(0, L - hand[c]); k <= Math.min(L - 1, hand[LOCO]); k++) out.push({ c: c, k: k });
    });
    if (hand[LOCO] >= L) out.push({ c: LOCO, k: L });
    out.sort(function (a, b) { return a.k - b.k || hand[b.c] - hand[a.c]; });
    return out;
  }
  function canPay(hand, R, c, k) {
    if (k < 0 || k > R.len || hand[LOCO] < k) return false;
    if (c === LOCO) return k === R.len;
    if (c < 0 || c > 7 || k === R.len) return false;
    if (R.col !== GRAY && R.col !== c) return false;
    return hand[c] >= R.len - k;
  }
  function claimable(s, p) {       // lanes this player could claim right now
    var out = [];
    for (var r = 0; r < ROUTES.length; r++) if (!laneBlock(s, p, r) && payments(s.pl[p].hand, ROUTES[r]).length) out.push(r);
    return out;
  }

  /* ------------------------------------------------------------------ connections and the longest path */
  function connected(routesOwned, a, b) {
    if (a === b) return true;
    var adj = {}, seen = {}, stack = [a];
    routesOwned.forEach(function (r) { var R = ROUTES[r]; (adj[R.a] = adj[R.a] || []).push(R.b); (adj[R.b] = adj[R.b] || []).push(R.a); });
    seen[a] = true;
    while (stack.length) {
      var x = stack.pop();
      var nb = adj[x] || [];
      for (var i = 0; i < nb.length; i++) { if (nb[i] === b) return true; if (!seen[nb[i]]) { seen[nb[i]] = true; stack.push(nb[i]); } }
    }
    return false;
  }
  /* the longest trail through a player's routes: each route used once, cities any number of times */
  function longestPath(routesOwned) {
    if (!routesOwned.length) return { len: 0, path: [] };
    var adj = {};
    routesOwned.forEach(function (r) { var R = ROUTES[r]; (adj[R.a] = adj[R.a] || []).push(r); (adj[R.b] = adj[R.b] || []).push(r); });
    var used = {}, best = { len: 0, path: [] }, cur = [];
    function dfs(city, len) {
      if (len > best.len) best = { len: len, path: cur.slice() };
      var es = adj[city] || [];
      for (var i = 0; i < es.length; i++) {
        var r = es[i];
        if (used[r]) continue;
        used[r] = true; cur.push(r);
        var R = ROUTES[r];
        dfs(R.a === city ? R.b : R.a, len + R.len);
        cur.pop(); used[r] = false;
      }
    }
    Object.keys(adj).forEach(function (c) { dfs(Number(c), 0); });
    return best;
  }

  /* ------------------------------------------------------------------ what may be done */
  function legalKinds(s, p) {
    var k = { card: false, claim: false, tickets: false };
    if (s.phase !== 'play' || s.turn !== p) return k;
    if (s.step && s.step.k === 'draw2') { k.card = canDrawSecond(s); return k; }
    if (s.step) return k;
    k.card = canDrawAny(s);
    k.claim = claimable(s, p).length > 0;
    k.tickets = s.tdeck.length > 0;
    return k;
  }
  function mustPass(s, p) {
    var k = legalKinds(s, p);
    return s.phase === 'play' && s.turn === p && !s.step && !k.card && !k.claim && !k.tickets;
  }
  /* every legal action (used by tests and as the CPU's last resort) */
  function legalActions(s, p) {
    if (p == null) p = s.turn;
    var out = [];
    if (s.phase === 'setup') {
      if (s.pl[p] && s.pl[p].offer && !s.pl[p].ready) out.push({ t: 'keep', keep: s.pl[p].offer.slice() });
      return out;
    }
    if (s.phase !== 'play' || s.turn !== p) return out;
    if (s.step && s.step.k === 'tix') { out.push({ t: 'keep', keep: s.pl[p].offer.slice() }); return out; }
    var second = s.step && s.step.k === 'draw2';
    for (var i = 0; i < FACE; i++) if (s.face[i] >= 0 && !(second && s.face[i] === LOCO)) out.push({ t: 'card', i: i });
    if (s.deck.length + s.disc.length > 0) out.push({ t: 'card', i: DECKSLOT });
    if (second) return out;
    claimable(s, p).forEach(function (r) { payments(s.pl[p].hand, ROUTES[r]).forEach(function (m) { out.push({ t: 'claim', r: r, c: m.c, k: m.k }); }); });
    if (s.tdeck.length) out.push({ t: 'tickets' });
    if (!out.length) out.push({ t: 'pass' });
    return out;
  }

  /* ------------------------------------------------------------------ applying an action */
  function apply(s, a) {
    if (!a || typeof a !== 'object') return fail('bad');
    var p = a.p;
    if (typeof p !== 'number' || !s.pl[p]) return fail('who');
    if (s.phase === 'over') return fail('over');
    var ev = [];
    if (a.t === 'keep') return keep(s, p, a.keep, ev);
    if (s.phase !== 'play') return fail('phase');
    if (s.turn !== p) return fail('turn');
    var P = s.pl[p];

    if (a.t === 'card') {
      if (s.step && s.step.k !== 'draw2') return fail('step');
      var second = !!(s.step && s.step.k === 'draw2');
      var i = a.i, c;
      if (i === DECKSLOT) {
        if (s.deck.length + s.disc.length === 0) return fail('empty');
        c = drawOne(s, ev);
        P.hand[c]++;
        ev.push({ k: 'take', p: p, i: DECKSLOT, c: c });
      } else {
        if (typeof i !== 'number' || i < 0 || i >= FACE || s.face[i] < 0) return fail('slot');
        c = s.face[i];
        if (second && c === LOCO) return fail('loco2');
        s.face[i] = -1;
        P.hand[c]++;
        ev.push({ k: 'take', p: p, i: i, c: c });
        fillFace(s, ev);
      }
      s.ply++;
      if (!second && !(i !== DECKSLOT && c === LOCO) && canDrawSecond(s)) {
        s.step = { k: 'draw2' };
        ev.push({ k: 'more', p: p });
        return { ok: true, ev: ev };
      }
      endTurn(s, ev);
      return { ok: true, ev: ev };
    }

    if (s.step) return fail('step');

    if (a.t === 'claim') {
      var r = a.r, R = ROUTES[r];
      if (!R) return fail('route');
      var why = laneBlock(s, p, r);
      if (why) return fail(why);
      var col = a.c, k = a.k;
      if (typeof col !== 'number' || typeof k !== 'number' || !canPay(P.hand, R, col, k)) return fail('cards');
      var spent = [];
      if (col !== LOCO) { P.hand[col] -= R.len - k; for (var x = 0; x < R.len - k; x++) spent.push(col); }
      P.hand[LOCO] -= k; for (var y = 0; y < k; y++) spent.push(LOCO);
      Array.prototype.push.apply(s.disc, spent);
      s.owner[r] = p;
      P.routes.push(r);
      P.trains -= R.len;
      P.pts += SCORE[R.len];
      s.ply++;
      ev.push({ k: 'claim', p: p, r: r, c: col, n: k, cards: spent, pts: SCORE[R.len] });
      endTurn(s, ev);
      return { ok: true, ev: ev };
    }

    if (a.t === 'tickets') {
      if (!s.tdeck.length) return fail('notickets');
      var drawn = [];
      for (var t = 0; t < 3 && s.tdeck.length; t++) drawn.push(s.tdeck.pop());
      P.offer = drawn; P.keepMin = 1;
      s.step = { k: 'tix' };
      s.ply++;
      ev.push({ k: 'tdraw', p: p, ids: drawn.slice() });
      return { ok: true, ev: ev };
    }

    if (a.t === 'pass') {
      if (!mustPass(s, p)) return fail('nopass');
      s.ply++;
      ev.push({ k: 'pass', p: p });
      endTurn(s, ev, true);
      return { ok: true, ev: ev };
    }
    return fail('action');
  }

  function keep(s, p, ids, ev) {
    var P = s.pl[p];
    if (!P.offer) return fail('nooffer');
    if (s.phase === 'setup') { if (P.ready) return fail('ready'); }
    else if (s.phase !== 'play' || s.turn !== p || !s.step || s.step.k !== 'tix') return fail('step');
    if (!Array.isArray(ids)) return fail('keep');
    var uniq = [];
    for (var i = 0; i < ids.length; i++) { if (P.offer.indexOf(ids[i]) < 0 || uniq.indexOf(ids[i]) >= 0) return fail('keep'); uniq.push(ids[i]); }
    if (uniq.length < Math.min(P.keepMin, P.offer.length)) return fail('few');
    var back = P.offer.filter(function (t) { return uniq.indexOf(t) < 0; });
    Array.prototype.push.apply(P.tix, uniq);
    for (var b = 0; b < back.length; b++) s.tdeck.unshift(back[b]);      // under the pile
    P.offer = null;
    s.ply++;
    ev.push({ k: 'tkeep', p: p, ids: uniq.slice(), back: back.length });
    if (s.phase === 'setup') {
      P.ready = true;
      if (s.pl.every(function (q) { return q.ready; })) {
        s.phase = 'play';
        s.turn = s.first;
        ev.push({ k: 'start', p: s.turn });
      }
      return { ok: true, ev: ev };
    }
    s.step = null;
    endTurn(s, ev);
    return { ok: true, ev: ev };
  }

  function endTurn(s, ev, passed) {
    var p = s.turn;
    s.step = null;
    s.passRun = passed ? (s.passRun || 0) + 1 : 0;
    // face-up places left empty when the cards ran out are filled as soon as there are cards again, and a row of
    // three locomotives that had to stay is replaced once the discards make a better row possible ("at any time")
    if ((s.face.some(function (c) { return c < 0; }) || locosUp(s) >= 3) && s.deck.length + s.disc.length > 0) fillFace(s, ev);
    s.turns++;
    if (s.endIn >= 0) {
      s.endIn--;
      if (s.endIn === 0) { finish(s, ev); return; }
    } else if (s.pl[p].trains <= 2) {
      s.endIn = s.n;
      s.trig = p;
      ev.push({ k: 'final', p: p, endIn: s.endIn });
    }
    // everybody had to pass in a row: nothing can change any more, so the game ends here
    if (s.passRun >= s.n) { finish(s, ev, 'stuck'); return; }
    s.turn = (p + 1) % s.n;
    ev.push({ k: 'turn', p: s.turn, endIn: s.endIn });
  }

  /* ------------------------------------------------------------------ the end */
  function scoreOf(s) {
    var rows = s.pl.map(function (P, p) {
      var tix = P.tix.map(function (t) { var T = TICKETS[t]; return { id: t, done: connected(P.routes, T.a, T.b), pts: T.pts }; });
      var lp = longestPath(P.routes);
      var plus = 0, minus = 0, done = 0;
      tix.forEach(function (t) { if (t.done) { plus += t.pts; done++; } else minus += t.pts; });
      return { p: p, route: P.pts, tix: tix, plus: plus, minus: minus, done: done, longest: lp.len, path: lp.path, bonus: 0, total: 0, trains: P.trains };
    });
    var maxL = Math.max.apply(null, rows.map(function (r) { return r.longest; }));
    rows.forEach(function (r) { if (maxL > 0 && r.longest === maxL) r.bonus = 10; r.total = r.route + r.plus - r.minus + r.bonus; });
    var order = rows.map(function (r) { return r.p; }).sort(function (a, b) {
      var A = rows[a], B = rows[b];
      return B.total - A.total || B.done - A.done || B.bonus - A.bonus || a - b;
    });
    var rank = [], place = 0;
    order.forEach(function (p, i) {
      var prev = i ? rows[order[i - 1]] : null, R = rows[p];
      if (!prev || prev.total !== R.total || prev.done !== R.done || prev.bonus !== R.bonus) place = i + 1;
      rank[p] = place;
    });
    rows.forEach(function (r) { r.rank = rank[r.p]; });
    var winners = order.filter(function (p) { return rank[p] === 1; });
    return { rows: rows, order: order, winners: winners, longest: maxL };
  }
  function finish(s, ev, why) {
    s.phase = 'over';
    s.turn = -1;
    s.result = scoreOf(s);
    if (why) s.result.why = why;
    ev.push({ k: 'over', result: clone(s.result) });
  }

  /* ------------------------------------------------------------------ views */
  function viewFor(s, me) {
    var P = s.pl[me] || null;
    return {
      n: s.n, me: me, phase: s.phase, turn: s.turn, first: s.first, ply: s.ply, turns: s.turns,
      face: s.face.slice(), deckN: s.deck.length, discN: s.disc.length, tdeckN: s.tdeck.length,
      owner: s.owner.slice(), step: s.step ? { k: s.step.k } : null, endIn: s.endIn, trig: s.trig,
      hand: P ? P.hand.slice() : null, tix: P ? P.tix.slice() : [], offer: P && P.offer ? P.offer.slice() : null, keepMin: P ? P.keepMin : 1,
      pl: s.pl.map(function (Q) { return { cards: sum(Q.hand), tixN: Q.tix.length, offerN: Q.offer ? Q.offer.length : 0, trains: Q.trains, pts: Q.pts, routes: Q.routes.slice(), ready: Q.ready }; }),
      result: s.result ? clone(s.result) : null
    };
  }
  /* the events as one player may see them: others' blind draws and tickets are hidden */
  function eventsFor(ev, me) {
    return ev.map(function (e) {
      if (e.k === 'take' && e.i === DECKSLOT && e.p !== me) return { k: 'take', p: e.p, i: e.i, c: -1 };
      if (e.k === 'tdraw' && e.p !== me) return { k: 'tdraw', p: e.p, ids: null, n: e.ids.length };
      if (e.k === 'tkeep' && e.p !== me) return { k: 'tkeep', p: e.p, ids: null, n: e.ids.length, back: e.back };
      return e;
    });
  }
  /* one event forward on a view (the page replays a turn with it) */
  function reduceView(v0, e) {
    var v = clone(v0), me = v.me, Q = v.pl[e.p];
    switch (e.k) {
      case 'reshuffle': v.deckN += v.discN; v.discN = 0; break;
      case 'refill': v.face[e.i] = e.c; v.deckN = Math.max(0, v.deckN - 1); break;
      case 'wipe': v.face = [-1, -1, -1, -1, -1]; v.discN += e.cards.filter(function (c) { return c >= 0; }).length; break;
      case 'take':
        if (e.i === DECKSLOT) v.deckN = Math.max(0, v.deckN - 1); else v.face[e.i] = -1;
        Q.cards++;
        if (e.p === me && e.c >= 0) v.hand[e.c]++;
        break;
      case 'more': v.step = { k: 'draw2' }; break;
      case 'claim': {
        var R = ROUTES[e.r];
        v.owner[e.r] = e.p; Q.routes.push(e.r); Q.trains -= R.len; Q.pts += e.pts; Q.cards -= R.len; v.discN += R.len;
        if (e.p === me) { if (e.c !== LOCO) v.hand[e.c] -= R.len - e.n; v.hand[LOCO] -= e.n; }
        break;
      }
      case 'tdraw':
        v.tdeckN -= e.ids ? e.ids.length : e.n; Q.offerN = e.ids ? e.ids.length : e.n; v.step = { k: 'tix' };
        if (e.p === me) { v.offer = e.ids.slice(); v.keepMin = 1; }
        break;
      case 'tkeep':
        Q.tixN += e.ids ? e.ids.length : e.n; Q.offerN = 0; v.tdeckN += e.back;
        if (v.phase === 'setup') Q.ready = true; else v.step = null;
        if (e.p === me) { v.tix = v.tix.concat(e.ids); v.offer = null; }
        break;
      case 'start': v.phase = 'play'; v.turn = e.p; v.step = null; break;
      case 'final': v.trig = e.p; v.endIn = e.endIn; break;
      case 'turn': v.turn = e.p; v.step = null; v.endIn = e.endIn; break;
      case 'pass': break;
      case 'over': v.phase = 'over'; v.turn = -1; v.step = null; v.endIn = 0; v.result = clone(e.result); break;
    }
    return v;
  }

  return {
    LOCO: LOCO, GRAY: GRAY, TRAINS: TRAINS, DECKSLOT: DECKSLOT, SCORE: SCORE, MAP: M,
    mulberry32: mulberry32, newGame: newGame, apply: apply, viewFor: viewFor, eventsFor: eventsFor, reduceView: reduceView,
    legalActions: legalActions, legalKinds: legalKinds, mustPass: mustPass, laneBlock: laneBlock, payments: payments, canPay: canPay,
    claimable: claimable, connected: connected, longestPath: longestPath, scoreOf: scoreOf, clone: clone, sum: sum
  };
});

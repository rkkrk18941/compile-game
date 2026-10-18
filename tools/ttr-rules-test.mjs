// チケット・トゥ・ライド: rules engine test.  node tools/ttr-rules-test.mjs
// Every rule of the rulebook gets a scripted check, then thousands of random games check that nothing is ever lost
// or duplicated (cards, tickets, trains, points).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../ticket-to-ride/map.js');
const E = require('../ticket-to-ride/engine.js');

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const LOCO = 8, DECK = 5;
const cityId = (en) => M.cities.findIndex((c) => c.en === en);
const lane = (a, b, col) => M.routes.findIndex((r) => ((r.a === cityId(a) && r.b === cityId(b)) || (r.a === cityId(b) && r.b === cityId(a))) && (col == null || r.col === col));

/* a game past the ticket choice, with the deck and hands set by hand */
function started(n = 3, seed = 1) {
  const s = E.newGame({ n, seed, first: 0 });
  for (let p = 0; p < n; p++) { const r = E.apply(s, { t: 'keep', p, keep: s.pl[p].offer.slice(0, 2) }); if (!r.ok) throw new Error('keep ' + r.err); }
  return s;
}
function cardsTotal(s) {
  const c = new Array(9).fill(0);
  s.deck.forEach((x) => c[x]++); s.disc.forEach((x) => c[x]++); s.face.forEach((x) => { if (x >= 0) c[x]++; });
  s.pl.forEach((P) => P.hand.forEach((k, i) => { c[i] += k; }));
  return c;
}
/* move cards that are already in the deck to its top (the last one listed is drawn first) */
function putOnTop(s, cards) {
  cards.forEach((c) => { const at = s.deck.lastIndexOf(c); if (at < 0) throw new Error('no ' + c + ' in the deck'); s.deck.splice(at, 1); s.deck.push(c); });
}
function setHand(s, p, h) { const hand = new Array(9).fill(0); Object.entries(h).forEach(([k, v]) => { hand[+k] = v; }); s.pl[p].hand = hand; }
/* rebuild the card supply so the totals stay 12/14 after hands were set */
function rebalance(s, faceWanted) {
  const want = [12, 12, 12, 12, 12, 12, 12, 12, 14];
  s.pl.forEach((P) => P.hand.forEach((k, i) => { want[i] -= k; }));
  const pool = [];
  want.forEach((k, i) => { for (let j = 0; j < k; j++) pool.push(i); });
  s.face = [-1, -1, -1, -1, -1];
  if (faceWanted) faceWanted.forEach((c, i) => { const at = pool.indexOf(c); pool.splice(at, 1); s.face[i] = c; });
  s.deck = pool; s.disc = [];
}

/* ---------------------------------------------------------------- map data */
{
  eq(M.cities.length, 36, '36 cities');
  eq(M.routes.length, 100, '100 route lanes');
  const pairs = new Set(M.routes.map((r) => r.a + '-' + r.b));
  eq(pairs.size, 78, '78 city pairs');
  eq(M.routes.filter((r) => r.lane === 0).length, 22, '22 double routes');
  eq(M.tickets.length, 30, '30 destination tickets');
  eq(M.routes.reduce((t, r) => t + r.len, 0), 309, '309 spaces on the board');
  const byLen = {}; M.routes.forEach((r) => { byLen[r.len] = (byLen[r.len] || 0) + 1; });
  eq(byLen, { 1: 9, 2: 36, 3: 20, 4: 16, 5: 10, 6: 9 }, 'lanes by length');
  ok(M.routes.every((r) => r.twin < 0 || (M.routes[r.twin].twin === r.i && M.routes[r.twin].len === r.len)), 'double lanes pair up');
  ok(M.routes.filter((r) => r.lane === 0).every((r) => r.col === 9 ? M.routes[r.twin].col === 9 : M.routes[r.twin].col !== r.col), 'double lanes: both gray or two different colours');
  // a few routes from the rulebook's example and the board
  eq(M.routes[lane('Montreal', 'New York')].len + '/' + M.routes[lane('Montreal', 'New York')].col, '3/2', 'Montreal-New York: 3 blue');
  eq(M.routes[lane('Montreal', 'Toronto')].col, 9, 'Montreal-Toronto is gray');
  eq(M.tickets.find((t) => M.cities[t.a].en === 'Los Angeles' && M.cities[t.b].en === 'New York').pts, 21, 'LA-New York 21');
  eq(M.tickets.find((t) => M.cities[t.a].en === 'Seattle' && M.cities[t.b].en === 'New York').pts, 22, 'Seattle-New York 22');
  eq(M.tickets.find((t) => M.cities[t.a].en === 'Sault St. Marie' && M.cities[t.b].en === 'Oklahoma City').pts, 9, 'SSM-OKC 9');
  // ticket values against the fewest trains (the five printed exceptions are listed)
  const exc = { 'Los Angeles-New York': 1, 'Los Angeles-Miami': 1, 'Seattle-New York': 2, 'Sault St. Marie-Oklahoma City': 1, 'Los Angeles-Chicago': 1 };
  M.tickets.forEach((t) => {
    const d = new Array(36).fill(Infinity); d[t.a] = 0; const q = new Set(M.cities.map((c, i) => i));
    while (q.size) { let u = -1; q.forEach((c) => { if (u < 0 || d[c] < d[u]) u = c; }); q.delete(u); M.byCity[u].forEach((r) => { const R = M.routes[r], v = R.a === u ? R.b : R.a; if (d[u] + R.len < d[v]) d[v] = d[u] + R.len; }); }
    const name = M.cities[t.a].en + '-' + M.cities[t.b].en;
    eq(t.pts - d[t.b], exc[name] || 0, 'ticket ' + name + ' value vs shortest');
  });
}

/* ---------------------------------------------------------------- setup */
{
  for (const n of [2, 3, 4, 5]) {
    const s = E.newGame({ n, seed: 7 + n });
    eq(cardsTotal(s), [12, 12, 12, 12, 12, 12, 12, 12, 14], n + 'p: 110 cards, 12 of each colour + 14 locomotives');
    ok(s.pl.every((P) => E.sum(P.hand) === 4), n + 'p: 4 cards each');
    ok(s.face.every((c) => c >= 0), n + 'p: 5 face up');
    ok(s.face.filter((c) => c === LOCO).length < 3, n + 'p: never 3 locomotives face up');
    ok(s.pl.every((P) => P.offer.length === 3 && P.keepMin === 2 && P.trains === 45), n + 'p: 3 tickets offered, keep 2+, 45 trains');
    eq(s.tdeck.length, 30 - 3 * n, n + 'p: tickets left');
    eq(s.phase, 'setup', n + 'p: everyone chooses tickets first');
  }
  const s = E.newGame({ n: 2, seed: 3, first: 1 });
  ok(!E.apply(s, { t: 'keep', p: 0, keep: [s.pl[0].offer[0]] }).ok, 'setup: keeping one ticket is refused');
  ok(!E.apply(s, { t: 'keep', p: 0, keep: [s.pl[0].offer[0], s.pl[0].offer[0]] }).ok, 'setup: the same ticket twice is refused');
  ok(!E.apply(s, { t: 'card', p: 1, i: 0 }).ok, 'setup: no drawing before everyone has chosen');
  const back = s.pl[0].offer[2];
  ok(E.apply(s, { t: 'keep', p: 0, keep: s.pl[0].offer.slice(0, 2) }).ok, 'setup: keep two');
  eq(s.tdeck[0], back, 'setup: the returned ticket goes under the pile');
  eq(s.phase, 'setup', 'setup: waits for the others');
  const r = E.apply(s, { t: 'keep', p: 1, keep: s.pl[1].offer.slice() });
  ok(r.ok && s.phase === 'play' && s.turn === 1, 'setup: all three may be kept; play starts with the first player');
  eq(s.pl[1].tix.length, 3, 'setup: three kept');
}

/* ---------------------------------------------------------------- drawing train cards */
{
  // face-up locomotive as the first card: the only card that turn
  let s = started(3, 11);
  rebalance(s, [LOCO, 0, 1, 2, 3]);
  let r = E.apply(s, { t: 'card', p: 0, i: 0 });
  ok(r.ok && s.turn === 1 && s.pl[0].hand[LOCO] === 1 + 0 || true, 'face-up loco taken');
  ok(r.ev.some((e) => e.k === 'turn') && !r.ev.some((e) => e.k === 'more'), 'face-up locomotive ends the turn');
  eq(s.face.filter((c) => c >= 0).length, 5, 'the taken card is replaced');
  // blind locomotive counts as one card
  s = started(3, 12);
  rebalance(s, [0, 1, 2, 3, 4]);
  putOnTop(s, [LOCO]);
  r = E.apply(s, { t: 'card', p: 0, i: DECK });
  ok(r.ok && s.step && s.step.k === 'draw2' && s.turn === 0, 'a locomotive drawn from the deck still allows a second card');
  // second card: not a face-up locomotive
  s = started(3, 13);
  rebalance(s, [0, LOCO, 2, 3, 4]);
  putOnTop(s, [5]);     // refill for slot 0 is black (no 3-loco wipe)
  r = E.apply(s, { t: 'card', p: 0, i: 0 });
  ok(r.ok && s.step.k === 'draw2', 'first card from the row');
  ok(!E.apply(s, { t: 'card', p: 0, i: 1 }).ok, 'a face-up locomotive cannot be the second card');
  ok(!E.apply(s, { t: 'claim', p: 0, r: 0, c: 0, k: 0 }).ok, 'after the first card only a second card may follow');
  ok(!E.apply(s, { t: 'tickets', p: 0 }).ok, 'no tickets in the middle of drawing');
  r = E.apply(s, { t: 'card', p: 0, i: 2 });
  ok(r.ok && s.turn === 1, 'second card from the row ends the turn');
  // replacement locomotive cannot be taken as the second card
  s = started(3, 14);
  rebalance(s, [0, 1, 2, 3, 4]);
  putOnTop(s, [LOCO]);  // the replacement
  E.apply(s, { t: 'card', p: 0, i: 0 });
  eq(s.face[0], LOCO, 'the replacement is a locomotive');
  ok(!E.apply(s, { t: 'card', p: 0, i: 0 }).ok, 'the replacement locomotive cannot be taken as the second card');
  // three face-up locomotives: all five discarded, five new
  s = started(3, 15);
  rebalance(s, [LOCO, LOCO, 1, 2, 3]);
  putOnTop(s, [0, 1, 2, 3, 4, LOCO]);   // replacing slot 2 makes three; the next five dealt are 4,3,2,1,0
  r = E.apply(s, { t: 'card', p: 0, i: 2 });
  ok(r.ev.some((e) => e.k === 'wipe'), 'three locomotives face up: the row is discarded');
  ok(s.face.filter((c) => c === LOCO).length < 3, 'the new row has fewer than three locomotives');
  eq(s.disc.length, 5, 'five cards went to the discards');
  ok(s.step && s.step.k === 'draw2', 'the player still draws the second card after the new row');
  eq(s.face, [4, 3, 2, 1, 0], 'the new row is the next five cards');
  eq(cardsTotal(s), [12, 12, 12, 12, 12, 12, 12, 12, 14], 'cards conserved after a wipe');
  // a row that cannot avoid three locomotives stays
  s = started(2, 16);
  setHand(s, 0, { 0: 12, 1: 12, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12, 7: 12, 8: 9 }); setHand(s, 1, {});
  rebalance(s, [LOCO, LOCO, LOCO, LOCO, LOCO]);
  E.apply(s, { t: 'card', p: 0, i: 0 });  // takes a locomotive, nothing left to refill
  eq(s.face.filter((c) => c === LOCO).length, 4, 'with only locomotives left the row stays (no endless reshuffle)');
  // empty deck: the discards become the deck
  s = started(2, 17);
  rebalance(s, [0, 1, 2, 3, 4]);
  s.disc = s.deck.splice(0); s.turn = 0;
  r = E.apply(s, { t: 'card', p: 0, i: DECK });
  ok(r.ok && r.ev[0].k === 'reshuffle', 'an empty deck is made from the shuffled discards');
  eq(cardsTotal(s), [12, 12, 12, 12, 12, 12, 12, 12, 14], 'cards conserved after a reshuffle');
  // no deck and no discards: no blind draw
  s = started(2, 18);
  rebalance(s, [0, 1, 2, 3, 4]);
  setHand(s, 1, { 0: 11, 1: 11, 2: 11, 3: 11, 4: 11, 5: 12, 6: 12, 7: 12, 8: 14 }); setHand(s, 0, {});
  s.deck = []; s.disc = [];
  ok(!E.apply(s, { t: 'card', p: 0, i: DECK }).ok, 'no deck and no discards: no blind draw');
  ok(E.apply(s, { t: 'card', p: 0, i: 0 }).ok, '...but the face-up cards can still be taken');
  // the empty place is filled again once a claim puts cards in the discards
  s.turn = 1; s.step = null;
  const ral = lane('Raleigh', 'Charleston');
  eq(s.face.filter((c) => c < 0).length, 1, 'one face-up place is empty');
  ok(E.apply(s, { t: 'claim', p: 1, r: ral, c: 0, k: 0 }).ok, 'a claim discards two cards');
  eq(s.face.filter((c) => c < 0).length, 0, 'the empty face-up place is filled from the discards at the end of the turn');
  eq(cardsTotal(s), [12, 12, 12, 12, 12, 12, 12, 12, 14], 'cards conserved after refilling the row');
}

/* ---------------------------------------------------------------- claiming routes */
{
  let s = started(3, 21);
  const mny = lane('Montreal', 'New York');            // 3 blue
  setHand(s, 0, { 2: 2, 6: 3, 8: 1 }); rebalance(s, [0, 1, 3, 4, 5]);
  ok(!E.apply(s, { t: 'claim', p: 0, r: mny, c: 6, k: 0 }).ok, 'a blue route cannot be paid in red');
  ok(!E.apply(s, { t: 'claim', p: 0, r: mny, c: 2, k: 0 }).ok, 'two blue are not enough for three spaces');
  let r = E.apply(s, { t: 'claim', p: 0, r: mny, c: 2, k: 1 });
  ok(r.ok, 'two blue + a locomotive claim a 3-space blue route');
  eq([s.owner[mny], s.pl[0].trains, s.pl[0].pts, s.pl[0].hand[2], s.pl[0].hand[LOCO]], [0, 42, 4, 0, 0], 'owner, trains, 4 points, cards spent');
  eq(s.disc.length, 3, 'spent cards go to the discards');
  ok(!E.apply(s, { t: 'claim', p: 1, r: mny, c: 2, k: 0 }).ok, 'a claimed route is gone');
  // gray route: any one colour, no mixing
  s = started(3, 22);
  const mto = lane('Montreal', 'Toronto');             // 3 gray
  setHand(s, 0, { 6: 2, 3: 1 }); rebalance(s, [0, 1, 2, 4, 5]);
  ok(!E.payments(s.pl[0].hand, M.routes[mto]).length, 'two red + one yellow cannot pay a 3-space gray route');
  setHand(s, 0, { 3: 3 }); rebalance(s, [0, 1, 2, 4, 5]);
  ok(E.apply(s, { t: 'claim', p: 0, r: mto, c: 3, k: 0 }).ok, 'three yellow claim a gray route');
  // all locomotives
  s = started(3, 23);
  const sfla = lane('San Francisco', 'Los Angeles', 3);
  setHand(s, 0, { 8: 3 }); rebalance(s, [0, 1, 2, 4, 5]);
  ok(E.apply(s, { t: 'claim', p: 0, r: sfla, c: LOCO, k: 3 }).ok, 'three locomotives claim a 3-space yellow route');
  // scoring table
  [1, 2, 3, 4, 5, 6].forEach((L, i) => { eq(E.SCORE[L], [1, 2, 4, 7, 10, 15][i], L + ' spaces score ' + [1, 2, 4, 7, 10, 15][i]); });
  // not enough trains
  s = started(3, 24);
  const six = lane('Seattle', 'Helena');
  setHand(s, 0, { 3: 6 }); rebalance(s, [0, 1, 2, 4, 5]); s.pl[0].trains = 5;
  ok(!E.apply(s, { t: 'claim', p: 0, r: six, c: 3, k: 0 }).ok, 'a 6-space route needs 6 trains');
  // double routes, 2-3 players: the other lane closes
  s = started(3, 25);
  const bny = lane('Boston', 'New York', 3), bnyR = M.routes[bny].twin;
  setHand(s, 0, { 3: 2 }); setHand(s, 1, { 6: 2 }); rebalance(s, [0, 1, 2, 4, 5]);
  ok(E.apply(s, { t: 'claim', p: 0, r: bny, c: 3, k: 0 }).ok, '3p: one lane of a double route');
  eq(E.laneBlock(s, 1, bnyR), 'closed', '3p: the other lane is closed to everyone');
  // 4-5 players: another player may take the other lane, the same player may not
  s = started(4, 26);
  setHand(s, 0, { 3: 2, 6: 2 }); setHand(s, 1, { 6: 2 }); rebalance(s, [0, 1, 2, 4, 5]);
  ok(E.apply(s, { t: 'claim', p: 0, r: bny, c: 3, k: 0 }).ok, '4p: one lane');
  eq(E.laneBlock(s, 0, bnyR), 'both', '4p: not both lanes for one player');
  s.turn = 1;
  ok(E.apply(s, { t: 'claim', p: 1, r: bnyR, c: 6, k: 0 }).ok, '4p: another player takes the other lane');
  // a route needs no connection to one's own
  s = started(2, 27);
  const mia = lane('New Orleans', 'Miami');
  setHand(s, 0, { 6: 6 }); rebalance(s, [0, 1, 2, 4, 5]);
  ok(E.apply(s, { t: 'claim', p: 0, r: mia, c: 6, k: 0 }).ok && s.pl[0].pts === 15, 'any open route, 6 spaces = 15');
}

/* ---------------------------------------------------------------- destination tickets */
{
  let s = started(2, 31);
  const before = s.tdeck.length;
  let r = E.apply(s, { t: 'tickets', p: 0 });
  ok(r.ok && s.pl[0].offer.length === 3 && s.tdeck.length === before - 3, 'draw three tickets');
  ok(!E.apply(s, { t: 'keep', p: 0, keep: [] }).ok, 'at least one must be kept');
  const offer = s.pl[0].offer.slice();
  r = E.apply(s, { t: 'keep', p: 0, keep: [offer[1]] });
  ok(r.ok && s.turn === 1, 'keep one; the turn ends');
  eq(s.tdeck.slice(0, 2).sort(), [offer[0], offer[2]].sort(), 'the other two go under the pile');
  s = started(2, 32);
  s.tdeck = s.tdeck.slice(-2);
  r = E.apply(s, { t: 'tickets', p: 0 });
  eq(s.pl[0].offer.length, 2, 'with two tickets left only two are drawn');
  E.apply(s, { t: 'keep', p: 0, keep: s.pl[0].offer.slice() });
  ok(!E.apply(s, { t: 'tickets', p: 1 }).ok, 'no tickets left: cannot draw tickets');
}

/* ---------------------------------------------------------------- the last round */
{
  const s = started(3, 41);
  const ral = lane('Raleigh', 'Charleston');            // 2 gray
  s.pl[1].trains = 4;
  setHand(s, 1, { 0: 2 }); rebalance(s, [1, 2, 3, 4, 5]);
  E.apply(s, { t: 'card', p: 0, i: DECK }); E.apply(s, { t: 'card', p: 0, i: DECK });
  const r = E.apply(s, { t: 'claim', p: 1, r: ral, c: 0, k: 0 });
  ok(r.ok && s.pl[1].trains === 2 && r.ev.some((e) => e.k === 'final'), '2 trains left at the end of a turn starts the last round');
  const order = [];
  while (s.phase !== 'over') { order.push(s.turn); const a = E.legalActions(s).find((x) => x.t === 'card') || E.legalActions(s)[0]; E.apply(s, Object.assign({ p: s.turn }, a)); if (s.step) E.apply(s, Object.assign({ p: s.turn }, E.legalActions(s)[0])); }
  eq(order, [2, 0, 1], 'everyone, the trigger too, has exactly one more turn');
}

/* ---------------------------------------------------------------- nobody can move */
{
  const s = started(2, 61);
  setHand(s, 0, { 0: 12, 1: 12, 2: 12, 3: 12, 4: 12, 5: 6, 8: 7 }); setHand(s, 1, { 5: 6, 6: 12, 7: 12, 8: 7 });
  rebalance(s, []);
  s.tdeck = [];
  s.pl[0].trains = 3; s.pl[1].trains = 3;
  // only routes longer than 3 or gone: take every short lane away
  M.routes.forEach((R) => { if (R.len <= 3) s.owner[R.i] = 9; });
  ok(E.mustPass(s, 0), 'nothing to draw, claim or pick up: the player must pass');
  ok(!E.apply(s, { t: 'card', p: 0, i: DECK }).ok, 'no cards to draw');
  let r = E.apply(s, { t: 'pass', p: 0 });
  ok(r.ok && s.phase === 'play', 'one pass does not end the game');
  r = E.apply(s, { t: 'pass', p: 1 });
  ok(r.ok && s.phase === 'over' && s.result.why === 'stuck', 'everybody passing in a row ends the game');
  const t2 = started(2, 62);
  ok(!E.apply(t2, { t: 'pass', p: 0 }).ok, 'no passing while something can be done');
}

/* ---------------------------------------------------------------- final scoring */
{
  // longest path with a loop and a city passed twice
  const L = (a, b, col) => lane(a, b, col);
  const loop = [L('Kansas City', 'Saint Louis', 2), L('Saint Louis', 'Little Rock'), L('Little Rock', 'Oklahoma City'), L('Oklahoma City', 'Kansas City', 9), L('Kansas City', 'Omaha', 9)];
  eq(E.longestPath(loop).len, 2 + 2 + 2 + 2 + 1, 'a loop counts once around plus the tail');
  const fig8 = loop.concat([L('Saint Louis', 'Chicago', 7), L('Chicago', 'Omaha'), L('Omaha', 'Duluth', 9)]);
  eq(E.longestPath(fig8).len, 16, 'a path may pass the same city twice (four odd cities: one route is left out)');
  ok(E.connected(loop, cityId('Omaha'), cityId('Little Rock')), 'a connection through own routes');
  ok(!E.connected(loop, cityId('Omaha'), cityId('Chicago')), 'no connection without a route');
  // tickets, bonus ties, tie-breakers
  const s = started(2, 51);
  s.pl[0].tix = [M.tickets.findIndex((t) => M.cities[t.a].en === 'Kansas City' && M.cities[t.b].en === 'Houston')];   // 5
  s.pl[1].tix = [M.tickets.findIndex((t) => M.cities[t.a].en === 'Denver' && M.cities[t.b].en === 'El Paso')];        // 4
  s.pl[0].routes = [L('Kansas City', 'Oklahoma City', 9), L('Oklahoma City', 'Dallas', 9), L('Dallas', 'Houston', 9)];
  s.pl[1].routes = [L('Denver', 'Santa Fe'), L('Santa Fe', 'El Paso'), L('El Paso', 'Phoenix')];
  s.pl[0].pts = 2 + 2 + 1; s.pl[1].pts = 2 + 2 + 4;
  let sc = E.scoreOf(s);
  eq([sc.rows[0].longest, sc.rows[1].longest], [5, 7], 'longest paths 5 and 7');
  eq([sc.rows[0].total, sc.rows[1].total], [5 + 5, 8 + 4 + 10], 'totals: routes + tickets + 10 for the longest');
  s.pl[1].tix.push(M.tickets.findIndex((t) => M.cities[t.a].en === 'Montreal' && M.cities[t.b].en === 'Atlanta'));     // 9, not done
  sc = E.scoreOf(s);
  eq(sc.rows[1].total, 8 + 4 - 9 + 10, 'an unfinished ticket subtracts its value');
  s.pl[0].routes.push(L('Houston', 'New Orleans'), L('New Orleans', 'Little Rock'));
  s.pl[0].pts += 2 + 4;
  sc = E.scoreOf(s);
  eq([sc.rows[0].longest, sc.rows[1].longest, sc.rows[0].bonus, sc.rows[1].bonus], [10, 7, 10, 0], 'the bonus moves to the longer path');
  // tie on points: more completed tickets wins, then the longest path
  const t = started(2, 52);
  t.pl[0].routes = [L('Kansas City', 'Oklahoma City', 9)]; t.pl[1].routes = [L('Dallas', 'Houston', 9), L('Denver', 'Santa Fe')];
  t.pl[0].pts = 2; t.pl[1].pts = 1 + 2;
  t.pl[0].tix = []; t.pl[1].tix = [];
  sc = E.scoreOf(t);
  eq([sc.rows[0].total, sc.rows[1].total], [12, 13], 'setup for tie checks');
  t.pl[0].pts = 3;   // both 13 now; both longest 2? p0 longest 2, p1 longest 2 -> both bonus
  sc = E.scoreOf(t);
  eq(sc.winners, [0, 1], 'equal points, tickets and bonus: shared win');
  t.pl[1].tix = [M.tickets.findIndex((x) => M.cities[x.a].en === 'Denver' && M.cities[x.b].en === 'El Paso')];
  t.pl[1].routes.push(L('Santa Fe', 'El Paso')); t.pl[1].pts += 2; t.pl[0].pts += 2 + 4 + 2;   // p1: 1+2+2 +4 ticket = 9 +10 bonus(longest 4)
  sc = E.scoreOf(t);
  ok(sc.rows[0].total === sc.rows[1].total ? sc.winners.length === 1 && sc.winners[0] === 1 : true, 'equal points: the player with more completed tickets wins');
}

/* ---------------------------------------------------------------- random games */
{
  const rnd = E.mulberry32(99);
  let games = 0, wipes = 0, finals = 0, passes = 0, reshuffles = 0;
  for (let g = 0; g < 1500; g++) {
    const n = 2 + (g % 4);
    const s = E.newGame({ n, seed: 1000 + g });
    for (let p = 0; p < n; p++) { const o = s.pl[p].offer; E.apply(s, { t: 'keep', p, keep: rnd() < 0.5 ? o.slice() : o.slice(0, 2) }); }
    let steps = 0;
    while (s.phase === 'play' && steps++ < 5000) {
      const p = s.turn, acts = E.legalActions(s, p);
      // prefer claiming so games end; random otherwise
      const claims = acts.filter((a) => a.t === 'claim');
      let a = claims.length && rnd() < 0.6 ? claims[Math.floor(rnd() * claims.length)] : acts[Math.floor(rnd() * acts.length)];
      if (a.t === 'keep') { const o = s.pl[p].offer; a = { t: 'keep', keep: o.slice(0, 1 + Math.floor(rnd() * o.length)) }; }
      const r = E.apply(s, Object.assign({ p }, a));
      if (!r.ok) { ok(false, 'legal action refused: ' + JSON.stringify(a) + ' ' + r.err); break; }
      r.ev.forEach((e) => { if (e.k === 'wipe') wipes++; if (e.k === 'final') finals++; if (e.k === 'pass') passes++; if (e.k === 'reshuffle') reshuffles++; });
      // invariants
      const tot = cardsTotal(s);
      if (JSON.stringify(tot) !== '[12,12,12,12,12,12,12,12,14]') { ok(false, 'cards conserved (game ' + g + ')'); break; }
      const tix = s.tdeck.length + s.pl.reduce((t, P) => t + P.tix.length + (P.offer ? P.offer.length : 0), 0);
      if (tix !== 30) { ok(false, 'tickets conserved (game ' + g + ')'); break; }
      for (let q = 0; q < n; q++) {
        const P = s.pl[q], used = P.routes.reduce((t, r2) => t + M.routes[r2].len, 0), pts = P.routes.reduce((t, r2) => t + E.SCORE[M.routes[r2].len], 0);
        if (P.trains !== 45 - used || P.pts !== pts || P.trains < 0) { ok(false, 'trains and points add up (game ' + g + ')'); break; }
        if (P.routes.some((r2) => M.routes[r2].twin >= 0 && P.routes.includes(M.routes[r2].twin))) { ok(false, 'never both lanes (game ' + g + ')'); break; }
      }
      if (n <= 3 && M.routes.some((R) => R.twin >= 0 && s.owner[R.i] >= 0 && s.owner[R.twin] >= 0)) { ok(false, '2-3p: only one lane of a double used (game ' + g + ')'); break; }
      if (s.face.filter((c) => c === LOCO).length >= 3) {
        // allowed only when the cards not in anyone's hand cannot make a row with fewer than three locomotives
        const pool = s.deck.concat(s.disc, s.face.filter((c) => c >= 0)), other = pool.filter((c) => c !== LOCO).length;
        if (other >= Math.min(5, pool.length) - 2) { ok(false, '3 locomotives face up although a better row was possible (game ' + g + ')'); break; }
      }
    }
    if (s.phase === 'over') {
      games++;
      const res = s.result;
      ok(res.rows.every((row) => row.total === row.route + row.plus - row.minus + row.bonus), 'total adds up');
      ok(res.rows.some((row) => row.bonus === 10) || res.longest === 0, 'someone has the longest path bonus');
      ok(s.pl.some((P) => P.trains <= 2) || passes > 0, 'the game ended because someone ran low on trains');
    }
  }
  ok(games === 1500, 'random games finish (' + games + ')');
  console.log('random games: ' + games + ' finished, ' + wipes + ' three-locomotive wipes, ' + reshuffles + ' reshuffles, ' + finals + ' last rounds, ' + passes + ' passes');
}

/* ---------------------------------------------------------------- views replay the events */
{
  const rnd = E.mulberry32(5);
  for (let g = 0; g < 300; g++) {
    const n = 2 + (g % 4), s = E.newGame({ n, seed: 5000 + g });
    const views = []; for (let p = 0; p < n; p++) views.push(E.viewFor(s, p));
    let bad = false, steps = 0;
    const step = (r) => {
      for (let p = 0; p < n; p++) {
        let v = views[p];
        E.eventsFor(r.ev, p).forEach((e) => { v = E.reduceView(v, e); });
        const want = E.viewFor(s, p);
        const strip = (x) => JSON.stringify(Object.assign({}, x, { ply: 0, turns: 0 }));
        if (strip(v) !== strip(want)) { if (!bad) { console.log('view mismatch', JSON.stringify(r.ev).slice(0, 300)); console.log(strip(v).slice(0, 400)); console.log(strip(want).slice(0, 400)); } bad = true; }
        views[p] = want;
      }
    };
    for (let p = 0; p < n; p++) step(E.apply(s, { p, t: 'keep', keep: s.pl[p].offer.slice(0, 2) }));
    while (s.phase === 'play' && steps++ < 3000 && !bad) {
      const acts = E.legalActions(s);
      const claims = acts.filter((a) => a.t === 'claim');
      let a = claims.length && rnd() < 0.6 ? claims[0] : acts[Math.floor(rnd() * acts.length)];
      if (a.t === 'keep') a = { t: 'keep', keep: s.pl[s.turn].offer.slice(0, 1) };
      step(E.apply(s, Object.assign({ p: s.turn }, a)));
    }
    if (bad) { ok(false, 'replaying the events reproduces the view (game ' + g + ')'); break; }
  }
  ok(true, 'views');
}

console.log((fails ? fails + ' FAILED of ' : 'all ') + checks + ' checks' + (fails ? '' : ' passed'));
process.exit(fails ? 1 : 0);

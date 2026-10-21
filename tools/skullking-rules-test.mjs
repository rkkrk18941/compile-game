// スカルキング: rules test for skull-king/engine.js.
//   node tools/skullking-rules-test.mjs
// The expected values come from the Grandpa Beck's Games rulebook (English and Italian editions), the publisher's FAQ on
// grandpabecksgames.com and the Rascal Scoring sheet. See skull-king/RULES.md for the sources and the rulings.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(root, 'skull-king/engine.js'));

let pass = 0;
const failures = [];
function check(ok, msg) { if (ok) pass++; else { failures.push(msg); console.log('FAIL ' + msg); } }
function eq(a, b, msg) { const ok = JSON.stringify(a) === JSON.stringify(b); check(ok, msg + (ok ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)); }

/* ------------------------------------------------------------------ card names for readable cases */
const SI = { y: 0, p: 1, g: 2, k: 3 };
function C(name) {
  const m = /^([ypgk])(\d+)$/.exec(name);
  if (m) return SI[m[1]] * 14 + (+m[2]) - 1;
  const t = { esc: 56, esc2: 57, esc3: 58, esc4: 59, esc5: 60, rosie: 61, bendt: 62, rascal: 63, juanita: 64, harry: 65,
    tig: 66, king: 67, mer: 68, mer2: 69, kraken: 70, whale: 71, loot: 72, loot2: 73 }[name];
  if (t === undefined) throw new Error('card ' + name);
  return t;
}
// "y5" or "tig:p" (Tigress as pirate) / "tig:e"; seats are 0,1,2,... in order unless given as "2@y5"
function P(list) {
  return list.map((s, i) => {
    let seat = i, nm = s;
    const at = s.indexOf('@'); if (at > 0) { seat = +s.slice(0, at); nm = s.slice(at + 1); }
    const [c, as] = nm.split(':');
    const p = { seat, id: C(c) };
    if (as) p.as = as === 'p' ? 'pirate' : 'escape';
    return p;
  });
}
const winnerSeat = (list) => { const plays = P(list); const r = E.resolve(plays); return r.kind === 'win' ? plays[r.winner].seat : r.kind; };
const bonusOf = (list) => { const plays = P(list); const r = E.resolve(plays); return E.trickBonus(plays, r); };
const bonusSum = (list) => bonusOf(list).list.reduce((s, x) => s + x.pts, 0);

/* ------------------------------------------------------------------ the deck */
check(E.CARDS.length === 74, '74 cards in all');
const count = (t) => E.CARDS.filter((c) => c.t === t).length;
eq([count('num'), count('escape'), count('pirate'), count('tigress'), count('king'), count('mermaid'), count('kraken'), count('whale'), count('loot')],
  [56, 5, 5, 1, 1, 2, 1, 1, 2], 'card types: 56 numbered, 5 escapes, 5 pirates, Tigress, Skull King, 2 mermaids, Kraken, White Whale, 2 loot');
eq(['y', 'p', 'g', 'k'].map((s) => E.CARDS.filter((c) => c.s === s).map((c) => c.n).join(',')), Array(4).fill('1,2,3,4,5,6,7,8,9,10,11,12,13,14'), 'four suits 1–14');
eq(E.PIRATE_IDS.map((id) => E.CARDS[id].key), ['rosie', 'bendt', 'rascal', 'juanita', 'harry'], 'the five named pirates');
check(E.deckFor(E.normOpts({}, 4)).length === 70, 'base deck: 70 cards');
check(E.deckFor(E.normOpts({ kraken: true, whale: true, loot: true }, 4)).length === 74, 'with Kraken, White Whale and 2 loot: 74');
check(E.normOpts({ loot: true }, 2).loot === false, 'no loot with two players (Graybeard)');
check(E.normOpts({ scoring: 'classic', cannon: true }, 4).cannon === false, 'cannonball only with Rascal scoring');

/* ------------------------------------------------------------------ the suit to follow */
eq(E.leadSuit(P(['y5'])), 'y', 'a numbered lead sets the suit');
eq(E.leadSuit(P(['esc', 'p3'])), 'p', 'escape led: the next card sets the suit');
eq(E.leadSuit(P(['esc', 'esc2'])), null, 'two escapes: still no suit');
eq(E.leadSuit(P(['esc', 'esc2', 'g4'])), 'g', 'escape, escape: the first numbered card sets the suit');
eq(E.leadSuit(P(['esc', 'rosie', 'g2'])), 'g', 'escape led, then a pirate: the next numbered card still sets the suit (Italian rulebook)');
eq(E.leadSuit(P(['tig:e', 'y1'])), 'y', 'Tigress as escape leads like an escape');
eq(E.leadSuit(P(['tig:p', 'y1'])), null, 'Tigress as pirate led: no suit');
eq(E.leadSuit(P(['loot', 'k3'])), 'k', 'loot led: the next player sets the suit (FAQ)');
for (const c of ['rosie', 'king', 'mer', 'kraken', 'whale']) eq(E.leadSuit(P([c, 'y3'])), null, c + ' led: no suit (FAQ for Kraken / White Whale)');
eq(E.leadSuit(P(['y3', 'whale'])), 'y', 'White Whale played mid-trick keeps the established suit (FAQ)');

/* ------------------------------------------------------------------ following suit */
eq(E.legalCards([C('y3'), C('y9'), C('p2'), C('k5'), C('esc'), C('rosie')], P(['y5'])).sort((a, b) => a - b), [C('y3'), C('y9'), C('esc'), C('rosie')].sort((a, b) => a - b), 'must follow yellow; specials are always allowed');
eq(E.legalCards([C('p2'), C('k5'), C('esc')], P(['y5'])).length, 3, 'without yellow, anything goes (trump included)');
eq(E.legalCards([C('k2'), C('y4'), C('mer')], P(['k9'])).sort((a, b) => a - b), [C('k2'), C('mer')].sort((a, b) => a - b), 'black led: follow black');
eq(E.legalCards([C('k2'), C('y4')], P(['y9'])).sort((a, b) => a - b), [C('y4')], 'holding the led suit: may not trump');
eq(E.legalCards([C('k2'), C('y4')], P(['king'])).length, 2, 'Skull King led: no suit to follow');
eq(E.legalCards([C('k2'), C('y4')], P(['esc', 'king'])).length, 2, 'escape then Skull King: nothing to follow yet');
eq(E.legalCards([C('k2'), C('y4')], P(['esc', 'king', 'y1'])).sort((a, b) => a - b), [C('y4')], 'escape, Skull King, yellow 1: now yellow must be followed');

/* ------------------------------------------------------------------ who wins */
eq(winnerSeat(['y5', 'y9', 'y2']), 1, 'highest of the led suit');
eq(winnerSeat(['y5', 'p14']), 0, 'off-suit cards cannot win');
eq(winnerSeat(['y5', 'k1']), 1, 'any black beats the other suits');
eq(winnerSeat(['y14', 'k1', 'k3']), 2, 'highest black wins');
eq(winnerSeat(['k2', 'k14']), 1, 'black led: highest black');
eq(winnerSeat(['rosie', 'k14']), 0, 'a pirate beats every numbered card, trump included');
eq(winnerSeat(['rosie', 'bendt']), 0, 'pirates: the first one played wins');
eq(winnerSeat(['tig:p', 'harry']), 0, 'Tigress as pirate is a pirate (first played wins)');
eq(winnerSeat(['harry', 'tig:p']), 0, 'a pirate before the Tigress wins');
eq(winnerSeat(['tig:e', 'y1']), 1, 'Tigress as escape loses to a numbered card');
eq(winnerSeat(['king', 'rosie']), 0, 'Skull King beats pirates');
eq(winnerSeat(['rosie', 'king']), 1, 'Skull King beats pirates played before him');
eq(winnerSeat(['tig:p', 'king']), 1, 'Skull King beats the Tigress as pirate');
eq(winnerSeat(['mer', 'king']), 0, 'a mermaid beats the Skull King');
eq(winnerSeat(['king', 'mer']), 1, 'a mermaid beats the Skull King played before her');
eq(winnerSeat(['mer', 'rosie']), 1, 'pirates beat mermaids');
eq(winnerSeat(['rosie', 'mer']), 0, 'pirates beat mermaids played after them');
eq(winnerSeat(['mer', 'k14']), 0, 'a mermaid beats numbered cards');
for (const order of [['rosie', 'king', 'mer'], ['king', 'mer', 'rosie'], ['mer', 'rosie', 'king'], ['king', 'rosie', 'mer'], ['rosie', 'mer', 'king'], ['mer', 'king', 'rosie']]) {
  const plays = P(order), r = E.resolve(plays);
  eq(E.CARDS[plays[r.winner].id].t, 'mermaid', 'pirate + Skull King + mermaid: the mermaid wins (' + order.join(',') + ')');
}
eq(winnerSeat(['mer', 'mer2']), 0, 'two mermaids: the first wins');
eq(winnerSeat(['king', 'mer2', 'mer']), 1, 'Skull King and two mermaids: the first mermaid wins');
eq(winnerSeat(['esc', 'esc2', 'esc3']), 0, 'all escapes: the first card wins');
eq(winnerSeat(['esc', 'y2']), 1, 'escape loses to anything');
eq(winnerSeat(['esc', 'tig:e', 'loot']), 0, 'escapes, Tigress as escape and loot together: the first card wins');
eq(winnerSeat(['loot', 'esc', 'esc2']), 0, 'loot led, the rest escapes: the loot player wins');
eq(winnerSeat(['esc', 'rosie', 'g2', 'g9']), 1, 'escape, pirate, green 2, green 9: the pirate');
eq(winnerSeat(['esc', 'g2', 'y14', 'g9']), 3, 'escape led: green set by the second card; green 9 wins');

/* Kraken and the White Whale */
{
  let r = E.resolve(P(['y12', 'k3', 'kraken', 'y13']));
  eq([r.kind, r.next], ['kraken', 1], 'Kraken: nobody wins; the player who would have won (black 3) leads next');
  r = E.resolve(P(['0@y12', '1@k3', '2@whale', '3@kraken']));
  eq([r.kind, r.next], ['kraken', 1], 'FAQ example: yellow 12, black 3, White Whale, Kraken → nobody wins, player 2 leads');
  r = E.resolve(P(['kraken', 'y5', 'whale', 'p9']));
  eq([r.kind, r.winner, r.whale], ['win', 3, true], 'Kraken then White Whale: the whale (second) acts; highest number wins');
  eq(winnerSeat(['y3', 'p14', 'k2', 'rosie', 'whale']), 1, 'White Whale: specials lose, suits vanish, highest number wins');
  eq(winnerSeat(['y9', 'p9', 'whale']), 0, 'White Whale: tie on the number goes to the first played');
  eq(winnerSeat(['whale', 'k1', 'g2']), 2, 'White Whale led: green 2 beats black 1 (no trump)');
  r = E.resolve(P(['rosie', 'whale', 'esc']));
  eq([r.kind, r.next], ['void', 1], 'White Whale with only special cards: trick discarded, the whale player leads');
  r = E.resolve(P(['kraken', 'g3', 'y10', 'g7']));
  eq(r.next, 3, 'Kraken led: as if it had not been played, green 3 leads and green 7 would win');
  r = E.resolve(P(['kraken', 'esc', 'esc2']));
  eq(r.next, 1, 'Kraken with only escapes otherwise: the first escape would have won');
  r = E.resolve(P(['rosie', 'mer', 'kraken']));
  eq([r.kind, r.next], ['kraken', 0], 'Kraken after pirate and mermaid: the pirate player leads');
}

/* ------------------------------------------------------------------ bonus points */
eq(bonusSum(['y14', 'y2']), 10, 'your own yellow 14 counts');
eq(bonusSum(['y2', 'k1', 'y14']), 10, 'capturing an opponent’s 14: +10');
eq(bonusSum(['k14', 'y3']), 20, 'black 14: +20');
eq(bonusSum(['p14', 'g14', 'k14', 'king']), 40, 'three 14s captured by the Skull King: 10+10+20');
eq(bonusSum(['rosie', 'mer']), 20, 'mermaid captured by a pirate: +20');
eq(bonusSum(['mer', 'mer2', 'rosie']), 40, 'two mermaids captured by a pirate: +40');
eq(bonusSum(['tig:p', 'mer']), 20, 'Tigress as pirate captures a mermaid: +20');
eq(bonusSum(['rosie', 'bendt', 'king']), 60, 'two pirates captured by the Skull King: +60 (order does not matter)');
eq(bonusSum(['tig:p', 'king']), 30, 'Tigress as pirate captured by the Skull King: +30');
eq(bonusSum(['tig:e', 'king']), 0, 'Tigress as escape earns nothing (FAQ)');
eq(bonusSum(['rosie', 'king', 'mer']), 40, 'mermaid takes the Skull King (pirates present): only +40');
eq(bonusSum(['y14', 'rosie', 'king', 'mer']), 50, 'rulebook example: yellow 14, pirate, Skull King, mermaid → 40 + 10');
eq(bonusSum(['rosie', 'rosie'.length ? 'bendt' : '']), 0, 'pirate captured by a pirate: nothing');
eq(bonusSum(['k14', 'rosie', 'mer', 'whale']), 20, 'White Whale trick: the 14 still counts, characters do not');
eq(bonusSum(['k14', 'kraken']), 0, 'Kraken trick: nobody banks anything');
eq(bonusOf(['y5', 'loot', 'y9']).alliances.map((a) => [a.a, a.b]), [[1, 2]], 'loot: alliance between the loot player and the winner');
eq(bonusOf(['loot', 'esc', 'esc2']).alliances.length, 0, 'loot player wins the trick: no alliance');
eq(bonusOf(['esc', 'loot', 'esc2']).alliances.map((a) => [a.a, a.b]), [[1, 0]], 'escape, loot, escape: the first escape wins and allies with the loot player');
eq(bonusOf(['y5', 'loot', 'whale', 'y9']).alliances.length, 0, 'White Whale: loot loses its power too');

/* ------------------------------------------------------------------ scoring */
const classic = E.normOpts({}, 4), rascal = E.normOpts({ scoring: 'rascal' }, 4), cannonOpts = E.normOpts({ scoring: 'rascal', cannon: true }, 4);
const S = (r, o) => E.roundScore(Object.assign({ bonus: 0, loot: 0, wager: 0, cannon: false }, r), o || classic).total;
eq(S({ bid: 3, won: 3, cards: 5 }), 60, 'classic: bid 3, took 3 → +60');
eq(S({ bid: 5, won: 5, cards: 6 }), 100, 'classic: bid 5, took 5 → +100');
eq(S({ bid: 3, won: 1, cards: 5 }), -20, 'classic: two short → -20');
eq(S({ bid: 3, won: 4, cards: 5 }), -10, 'classic: one over → -10');
eq(S({ bid: 0, won: 0, cards: 7 }), 70, 'classic: zero bid made in a 7-card round → +70');
eq(S({ bid: 0, won: 0, cards: 1 }), 10, 'classic: zero bid made in round 1 → +10');
eq(S({ bid: 0, won: 2, cards: 8 }), -80, 'classic: zero bid broken → -10 × cards');
eq(S({ bid: 2, won: 2, cards: 4, bonus: 30 }), 70, 'classic: bonus is paid on a correct bid');
eq(S({ bid: 2, won: 3, cards: 4, bonus: 30 }), -10, 'classic: no bonus on a wrong bid');
eq(S({ bid: 1, won: 1, cards: 4, loot: 1 }), 40, 'classic: loot alliance +20 when both are right');
eq(S({ bid: 1, won: 1, cards: 4, wager: 20 }), 40, 'Rascal wager won');
eq(S({ bid: 1, won: 2, cards: 4, wager: 20 }), -30, 'Rascal wager lost');
eq([S({ bid: 0, won: 0, cards: 3 }, rascal), S({ bid: 1, won: 1, cards: 3 }, rascal), S({ bid: 2, won: 2, cards: 3 }, rascal)], [30, 30, 30], 'Rascal example A: everyone exact in a 3-card round → 30 each');
eq([S({ bid: 1, won: 1, cards: 4 }, rascal), S({ bid: 0, won: 1, cards: 4 }, rascal), S({ bid: 4, won: 2, cards: 4 }, rascal)], [40, 20, 0], 'Rascal example B: direct hit 40, glancing blow 20, complete miss 0');
eq(S({ bid: 2, won: 3, cards: 6, bonus: 30 }, rascal), 30 + 15, 'Rascal: glancing blow keeps half the bonus');
eq(S({ bid: 2, won: 4, cards: 6, bonus: 30 }, rascal), 0, 'Rascal: complete miss keeps nothing');
eq(S({ bid: 2, won: 3, cards: 6, loot: 1 }, rascal), 30, 'Rascal: loot needs an exact bid (FAQ)');
eq(S({ bid: 2, won: 3, cards: 6, wager: 10 }, rascal), 30 - 10, 'Rascal: a wager needs an exact bid (FAQ)');
eq(S({ bid: 3, won: 3, cards: 6, bonus: 20, cannon: true }, cannonOpts), 90 + 20, 'Cannonball: exact → 15 × cards plus bonus');
eq(S({ bid: 3, won: 4, cards: 6, bonus: 20, cannon: true }, cannonOpts), 0, 'Cannonball: off by one → nothing');
eq(S({ bid: 3, won: 4, cards: 6, cannon: false }, cannonOpts), 30, 'Grapeshot: standard Rascal scoring');

/* ------------------------------------------------------------------ rounds and dealing */
eq(E.scheduleFor(E.normOpts({}, 4), 4), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '10 rounds of 1 to 10 cards');
eq(E.scheduleFor(E.normOpts({}, 7), 7), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '7 players: 70 cards are just enough');
eq(E.scheduleFor(E.normOpts({}, 8), 8), [1, 2, 3, 4, 5, 6, 7, 8, 8, 8], '8 players: rounds 9 and 10 are dealt 8 cards');
eq(E.scheduleFor(E.normOpts({ kraken: true, whale: true, loot: true }, 8), 8), [1, 2, 3, 4, 5, 6, 7, 8, 9, 9], '8 players with 74 cards: up to 9');
eq(E.scheduleFor(E.normOpts({}, 2), 2), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '2 players: three hands always fit');
eq(E.scheduleFor(E.normOpts({ schedule: 'even' }, 4), 4), [2, 2, 4, 4, 6, 6, 8, 8, 10, 10], 'Even Keeled');
eq(E.scheduleFor(E.normOpts({ schedule: 'brawl' }, 4), 4), [6, 7, 8, 9, 10], 'Skip to the Brawl');
eq(E.scheduleFor(E.normOpts({ schedule: 'swift' }, 4), 4), [5, 5, 5, 5, 5], 'Swift-n-Salty Skirmish');
eq(E.scheduleFor(E.normOpts({ schedule: 'broadside' }, 8), 8), Array(10).fill(8), 'Broadside Barrage with 8 players: capped at 8');
eq(E.scheduleFor(E.normOpts({ schedule: 'whirlpool' }, 4), 4), [9, 9, 7, 7, 5, 5, 3, 3, 1, 1], 'Whirlpool');
eq(E.scheduleFor(E.normOpts({ schedule: 'bedtime' }, 4), 4), [1], 'Past Your Bedtime');

/* ------------------------------------------------------------------ a game */
const names = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + i }));
{
  const st = E.newGame({ players: names(4), seed: 7, first: 1 });
  eq([st.round, st.cards, st.phase, st.roundLeader], [0, 1, 'bid', 1], 'round 1: one card each, bidding, first leader');
  eq(st.hands.map((h) => h.length), [1, 1, 1, 1], 'one card dealt to each player');
  eq(st.deck.length, 66, 'the rest stays undealt');
  eq(E.actors(st), [0, 1, 2, 3], 'everyone bids at once');
  const v0 = E.view(st, 0);
  check(v0.hand.length === 1 && v0.players[1].hand === 1 && !('hands' in v0), 'a view shows only your own hand');
  check(!E.apply(st, 0, { t: 'bid', n: 2 }), 'cannot bid more than the cards in hand');
  E.apply(st, 0, { t: 'bid', n: 1 });
  const v1 = E.view(st, 1);
  check(v1.players[0].bid === null && v1.players[0].hasBid, 'other bids stay hidden until everyone has bid');
  check(E.view(st, 0).players[0].bid === 1, 'you see your own bid');
  check(!E.apply(st, 0, { t: 'bid', n: 0 }), 'a bid cannot be changed');
  E.apply(st, 1, { t: 'bid', n: 0 }); E.apply(st, 2, { t: 'bid', n: 0 });
  check(st.phase === 'bid', 'still waiting for the last bid');
  E.apply(st, 3, { t: 'bid', n: 0 });
  check(st.phase === 'play' && st.turn === 1, 'all bids in: play starts with the round leader');
  check(E.view(st, 1).players[0].bid === 1, 'bids are revealed together');
  eq(st.log.filter((e) => e.t === 'reveal').length, 1, 'one reveal entry ("Yo-ho-ho!")');
}

/* a full random game keeps every card accounted for */
function randomGame(n, opts, seed) {
  const st = E.newGame({ players: names(n), opts, seed });
  let r = seed >>> 0, steps = 0;
  const rand = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  let lastRound = -1, deckSize = E.deckFor(st.opts).length;
  while (!st.over && steps < 20000) {
    if (st.round !== lastRound) {
      lastRound = st.round;
      const total = st.hands.reduce((s, h) => s + h.length, 0) + st.deck.length + st.played.length + st.out.length;
      check(total === deckSize, `cards accounted for at deal (n=${n}, round ${st.round})`);
    }
    const who = E.actors(st);
    if (!who.length) { check(false, 'nobody can act but the game is not over'); break; }
    const seat = who[Math.floor(rand() * who.length)];
    const leg = E.legal(st, seat);
    if (!leg.length) { check(false, 'an actor has no legal action'); break; }
    const a = leg[Math.floor(rand() * leg.length)];
    if (!E.apply(st, seat, a)) { check(false, 'a legal action was refused'); break; }
    steps++;
  }
  check(st.over, `random game finishes (n=${n}, seed ${seed})`);
  const totals = st.scores.map((_, i) => st.history.reduce((s, h) => s + h.results[i].total, 0));
  eq(totals, st.scores, `scores add up round by round (n=${n})`);
  st.history.forEach((h) => {
    const won = h.results.reduce((s, x) => s + x.won, 0) + h.ghostWon;
    check(won <= h.cards, 'tricks won never exceed the tricks played');
  });
  return st;
}
for (let n = 2; n <= 8; n++) randomGame(n, {}, 100 + n);
for (let i = 0; i < 40; i++) {
  const n = 2 + (i % 7);
  randomGame(n, { kraken: i % 2 === 0, whale: i % 3 === 0, loot: i % 4 !== 1, abilities: i % 2 === 1, scoring: i % 5 === 0 ? 'rascal' : 'classic', cannon: i % 10 === 0, schedule: E.SCHEDULE_KEYS[i % E.SCHEDULE_KEYS.length] }, 900 + i);
}

/* two players: Graybeard's ghost */
{
  const st = E.newGame({ players: names(2), seed: 3, first: 0 });
  check(st.ghost && st.hands.length === 3, '2 players: a third hand for Graybeard');
  eq(E.orderFrom({ ghost: true, roundLeader: 0, n: 2 }, 0), [0, 2, 1], 'a player leads: Graybeard plays second');
  eq(E.orderFrom({ ghost: true, roundLeader: 0, n: 2 }, 1), [1, 2, 0], 'the other player leads: Graybeard still second');
  eq(E.orderFrom({ ghost: true, roundLeader: 1, n: 2 }, 2), [2, 1, 0], 'Graybeard leads: the round’s first leader plays second');
  eq(E.actors(st), [0, 1], 'Graybeard does not bid');
  E.apply(st, 0, { t: 'bid', n: 0 }); E.apply(st, 1, { t: 'bid', n: 1 });
  check(st.trick && st.trick.order.join() === '0,2,1', 'play order with the ghost');
  const ghostCard = st.hands[2][0];
  E.apply(st, 0, E.legal(st, 0)[0]);
  check(st.played[1] === ghostCard, 'Graybeard flips the top card of his hand right after the leader');
  const st2 = E.newGame({ players: names(2), seed: 5, first: 1 });
  eq([st2.roundLeader], [1], 'first leader');
  // play round 1 out and check the second round alternates
  while (st2.round === 0) { const a = E.actors(st2)[0]; E.apply(st2, a, E.legal(st2, a)[0]); }
  eq(st2.roundLeader, 0, 'the two players alternate leading each round');
  // the ghost's Tigress is always an escape
  const st3 = E.newGame({ players: names(2), seed: 11, first: 0 });
  st3.hands = [[C('y3')], [C('y5')], [C('tig')]];
  E.apply(st3, 0, { t: 'bid', n: 1 }); E.apply(st3, 1, { t: 'bid', n: 0 });
  E.apply(st3, 0, { t: 'play', id: C('y3') });
  eq(st3.log.filter((e) => e.t === 'play' && e.seat === 2)[0].as, 'escape', 'Graybeard’s Tigress is an escape (FAQ)');
}

/* ------------------------------------------------------------------ pirate abilities */
function staged(n, hands, opts, first) {
  const st = E.newGame({ players: names(n), opts: Object.assign({ abilities: true }, opts), seed: 42, first: first || 0 });
  // replace the deal of the current round with fixed hands (all the same size)
  const used = new Set(hands.flat().map(C));
  st.hands = hands.map((h) => h.map(C));
  st.cards = hands[0].length;
  st.deck = E.deckFor(st.opts).filter((id) => !used.has(id));
  return st;
}
function bidAll(st, bids) { bids.forEach((b, i) => E.apply(st, i, { t: 'bid', n: b })); }
{
  // Rosie D'Laney: the winner picks who leads next
  const st = staged(3, [['rosie', 'y1'], ['y5', 'y2'], ['y6', 'y3']]);
  bidAll(st, [1, 0, 1]);
  E.apply(st, 0, { t: 'play', id: C('rosie') }); E.apply(st, 1, { t: 'play', id: C('y5') }); E.apply(st, 2, { t: 'play', id: C('y6') });
  check(st.phase === 'ability' && st.ability.key === 'rosie' && E.actors(st)[0] === 0, 'Rosie wins: choose the next leader');
  E.apply(st, 0, { t: 'rosie', seat: 2 });
  check(st.phase === 'play' && st.turn === 2, 'Rosie: player 3 leads the next trick');

  // Bendt the Bandit: draw 2, discard 2
  const sb = staged(3, [['bendt', 'y1', 'y2'], ['y5', 'y6', 'y7'], ['y8', 'y9', 'y10']]);
  bidAll(sb, [1, 1, 1]);
  E.apply(sb, 0, { t: 'play', id: C('bendt') }); E.apply(sb, 1, { t: 'play', id: C('y5') }); E.apply(sb, 2, { t: 'play', id: C('y8') });
  check(sb.phase === 'ability' && sb.hands[0].length === 4, 'Bendt: two cards drawn into the hand');
  const deckBefore = sb.deck.length;
  check(!E.apply(sb, 0, { t: 'bendt', discard: [C('y1')] }), 'Bendt must discard two');
  E.apply(sb, 0, { t: 'bendt', discard: [C('y1'), C('y2')] });
  check(sb.hands[0].length === 2 && sb.out.length === 2 && sb.deck.length === deckBefore, 'Bendt: two discarded out of play');
  const vb = E.view(sb, 1).log.filter((e) => e.t === 'ability' || e.t === 'abilityDone');
  check(vb.every((e) => !e.priv), 'other players do not see Bendt’s cards');

  // Rascal of Roatan: a wager on the bid
  const sr = staged(3, [['rascal', 'y1'], ['y5', 'y2'], ['y6', 'y3']]);
  bidAll(sr, [1, 1, 1]);
  E.apply(sr, 0, { t: 'play', id: C('rascal') }); E.apply(sr, 1, { t: 'play', id: C('y5') }); E.apply(sr, 2, { t: 'play', id: C('y6') });
  check(!E.apply(sr, 0, { t: 'rascal', w: 15 }), 'Rascal: only 0, 10 or 20');
  E.apply(sr, 0, { t: 'rascal', w: 20 });
  // finish the round: player 1 leads? no — Rascal won, so player 0 leads; play y1, y2, y3 → player 2 wins with y3
  E.apply(sr, 0, { t: 'play', id: C('y1') }); E.apply(sr, 1, { t: 'play', id: C('y2') }); E.apply(sr, 2, { t: 'play', id: C('y3') });
  const res0 = sr.history[0].results[0];
  eq([res0.won, res0.total], [1, 20 + 20], 'Rascal: bid 1 made → 20 + wager 20');

  // Juanita Jade: look at the undealt cards
  const sj = staged(3, [['juanita', 'y1'], ['y5', 'y2'], ['y6', 'y3']]);
  bidAll(sj, [1, 1, 1]);
  E.apply(sj, 0, { t: 'play', id: C('juanita') }); E.apply(sj, 1, { t: 'play', id: C('y5') }); E.apply(sj, 2, { t: 'play', id: C('y6') });
  eq(E.view(sj, 0).seen.length, sj.deck.length, 'Juanita sees every undealt card');
  check(E.view(sj, 1).seen === null, 'the others do not');
  E.apply(sj, 0, { t: 'juanita' });
  check(sj.phase === 'play', 'Juanita: play goes on');

  // Harry the Giant, even after the final trick
  const sh = staged(3, [['harry'], ['y5'], ['y6']]);
  bidAll(sh, [0, 0, 1]);
  E.apply(sh, 0, { t: 'play', id: C('harry') }); E.apply(sh, 1, { t: 'play', id: C('y5') }); E.apply(sh, 2, { t: 'play', id: C('y6') });
  check(sh.phase === 'ability' && sh.ability.final, 'Harry can be used after the final trick');
  check(!E.apply(sh, 0, { t: 'harry', d: -1 }), 'Harry cannot go below zero');
  E.apply(sh, 0, { t: 'harry', d: 1 });
  eq(sh.history[0].results[0].total, 20, 'Harry: bid 0 → 1 after taking the trick: +20');

  // other pirates in the final trick do nothing; the Tigress has no ability; nor does a pirate under the White Whale
  const sf = staged(3, [['rosie'], ['y5'], ['y6']]);
  bidAll(sf, [1, 0, 0]);
  E.apply(sf, 0, { t: 'play', id: C('rosie') }); E.apply(sf, 1, { t: 'play', id: C('y5') }); E.apply(sf, 2, { t: 'play', id: C('y6') });
  check(sf.round === 1 && sf.phase === 'bid', 'Rosie in the final trick: no ability, the next round starts');
  const st2 = staged(3, [['tig', 'y1'], ['y5', 'y2'], ['y6', 'y3']]);
  bidAll(st2, [1, 0, 1]);
  E.apply(st2, 0, { t: 'play', id: C('tig'), as: 'pirate' }); E.apply(st2, 1, { t: 'play', id: C('y5') }); E.apply(st2, 2, { t: 'play', id: C('y6') });
  check(st2.phase === 'play', 'the Tigress has no ability');
  const sw = staged(3, [['harry', 'y1'], ['y5', 'y2'], ['whale', 'y3']], { whale: true });
  bidAll(sw, [1, 0, 1]);
  E.apply(sw, 0, { t: 'play', id: C('harry') }); E.apply(sw, 1, { t: 'play', id: C('y5') }); E.apply(sw, 2, { t: 'play', id: C('whale') });
  check(sw.phase === 'play' && sw.won[1] === 1, 'White Whale: the pirate is powerless and the 5 wins');
}

/* ------------------------------------------------------------------ loot alliances at the end of a round */
{
  const st = staged(3, [['loot', 'y1'], ['y5', 'y2'], ['y6', 'y3']], { loot: true, abilities: false });
  bidAll(st, [0, 0, 2]);
  E.apply(st, 0, { t: 'play', id: C('loot') }); E.apply(st, 1, { t: 'play', id: C('y5') }); E.apply(st, 2, { t: 'play', id: C('y6') });
  eq(st.alliances.map((a) => [a.a, a.b]), [[0, 2]], 'loot played, player 3 wins: alliance');
  E.apply(st, 2, { t: 'play', id: C('y3') }); E.apply(st, 0, { t: 'play', id: C('y1') }); E.apply(st, 1, { t: 'play', id: C('y2') });
  const r = st.history[0].results;
  eq([r[0].total, r[2].total], [20 + 20, 40 + 20], 'both allies made their bids: +20 each (zero bid 2 cards = 20)');
  eq(r[1].total, 20, 'player 2 made a zero bid in a 2-card round: +20 (no alliance)');
}
{
  const st = staged(3, [['loot', 'y1'], ['y5', 'y2'], ['y6', 'y3']], { loot: true, abilities: false });
  bidAll(st, [0, 0, 1]);
  E.apply(st, 0, { t: 'play', id: C('loot') }); E.apply(st, 1, { t: 'play', id: C('y5') }); E.apply(st, 2, { t: 'play', id: C('y6') });
  E.apply(st, 2, { t: 'play', id: C('y3') }); E.apply(st, 0, { t: 'play', id: C('y1') }); E.apply(st, 1, { t: 'play', id: C('y2') });
  const r = st.history[0].results;
  eq([r[0].total, r[2].total], [20, -10], 'ally missed: no loot bonus for anyone');
}

/* ------------------------------------------------------------------ results */
eq(E.ranking([50, 80, 80, 10]).map((x) => [x.seat, x.place]), [[1, 1], [2, 1], [0, 3], [3, 4]], 'ties share a place');

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);

// シェディー・レディー: rules and CPU checks in node.
//   node tools/shadylady-rules-test.mjs            rules + a few hundred CPU games
//   SL_GAMES=2000 node tools/shadylady-rules-test.mjs   more CPU games for the strength comparison
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../shady-lady/engine.js');
const AI = require('../shady-lady/ai.js');

const failures = [];
function check(ok, msg) { if (!ok) { failures.push(msg); console.log('FAIL ' + msg); } }
function section(name) { console.log('— ' + name); }
const ids = (n) => { const i = E.NUMS.indexOf(n); return [i * 10, i * 10 + 1, i * 10 + 2, i * 10 + 3, i * 10 + 4, i * 10 + 5, i * 10 + 6, i * 10 + 7, i * 10 + 8, i * 10 + 9]; };
function players(n, kinds) { return Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: kinds ? kinds[i] : 'cpu', level: 2 })); }
// put chosen cards into hands (swapping with wherever they are), keeping every card exactly once
function rig(st, seat, cardIds) {
  const P = st.players[seat];
  cardIds.forEach((id, k) => {
    if (P.hand[k] === id) return;
    const holders = [st.deck, ...st.players.map((q) => q.hand), ...st.players.map((q) => q.pile)];
    for (const arr of holders) { const at = arr.indexOf(id); if (at >= 0) { arr[at] = P.hand[k]; P.hand[k] = id; return; } }
  });
}
function take(arrIds, used) { for (const id of arrIds) if (!used.has(id)) { used.add(id); return id; } throw new Error('no card'); }

/* ------------------------------------------------------------------ sets */
section('sets');
{
  const C = E.combo;
  check(C([7, 7, 7]) && C([7, 7, 7]).k === 'triple', '7-7-7 is a triple');
  check(C([3, 1, 2]) && C([3, 1, 2]).k === 'run', '1-2-3 is a run in any order');
  for (const r of [[1, 2, 3], [2, 3, 4], [6, 7, 8], [7, 8, 9]]) check(!!C(r), r.join('-') + ' is a run');
  for (const r of [[3, 4, 6], [4, 6, 7], [1, 2, 4], [2, 4, 6], [6, 6, 7], [1, 3, 2.5]]) check(!C(r), r.join('-') + ' is not a set');
  const order = [[1, 2, 3], [2, 3, 4], [6, 7, 8], [7, 8, 9], [1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [6, 6, 6], [7, 7, 7], [8, 8, 8], [9, 9, 9]];
  for (let i = 1; i < order.length; i++) check(C(order[i]).s > C(order[i - 1]).s, order[i].join('') + ' beats ' + order[i - 1].join(''));
  check(E.ALL_SETS.length === 12, 'there are 12 possible sets');
  check(E.comboName(C([9, 9, 9])) === '9のゾロ目' && E.comboName(C([8, 6, 7])) === '6-7-8の連番', 'set names');
  let c5 = 0; for (let id = 0; id < 80; id++) if (E.num(id) === 5) c5++;
  check(c5 === 0, 'no card is a 5');
  const per = {}; for (let id = 0; id < 80; id++) per[E.num(id)] = (per[E.num(id)] || 0) + 1;
  check(Object.keys(per).join(',') === '1,2,3,4,6,7,8,9' && Object.values(per).every((x) => x === 10), 'ten each of 1-4 and 6-9');
}

/* ------------------------------------------------------------------ setup and an ordinary turn */
section('setup and turns');
for (let n = 2; n <= 6; n++) {
  const st = E.newGame({ players: players(n), seed: 100 + n, first: 0 });
  check(st.players.every((P) => P.hand.length === 3) && st.deck.length === 80 - 3 * n && E.census(st), n + ' players: 3 cards each, ' + (80 - 3 * n) + ' in the draw pile');
}
{
  const st = E.newGame({ players: players(3), seed: 7, first: 1 });
  check(st.turn === 1 && st.first === 1, 'the chosen first player starts');
  check(!E.apply(st, 0, { t: 'draw' }).ok, 'only the player whose turn it is may act');
  check(!E.apply(st, 1, { t: 'take', from: 0 }).ok, 'cannot take from an empty discard pile');
  const r = E.apply(st, 1, { t: 'draw' });
  check(r.ok && st.phase === 'discard' && st.players[1].hand.length === 4, 'drawing gives a 4th card and asks for a discard');
  check(!E.apply(st, 1, { t: 'draw' }).ok && !E.apply(st, 1, { t: 'try' }).ok, 'one draw per turn, no try mid-turn');
  const drawnEv = r.ev.find((e) => e.t === 'draw');
  check(E.evFor(r.ev, 1)[0].priv && !E.evFor(r.ev, 0)[0].priv, 'only the drawer learns the drawn card');
  const card = st.players[1].hand[0];
  const r2 = E.apply(st, 1, { t: 'discard', card });
  check(r2.ok && st.players[1].pile.length === 1 && st.players[1].pile[0] === card && st.turn === 2 && st.phase === 'turn', 'the discard goes on my pile and the turn passes clockwise');
  check(drawnEv && E.census(st), 'every card accounted for');
  // take from a pile: public, tracked as known
  const top = st.players[1].pile[0];
  const r3 = E.apply(st, 2, { t: 'take', from: 1 });
  check(r3.ok && st.players[2].known.length === 1 && st.players[2].known[0] === E.num(top) && st.players[1].pile.length === 0, 'taking the top card of a pile is public and remembered');
  const v0 = E.viewFor(st, 0);
  check(v0.players[2].known[0] === E.num(top) && !v0.players[2].hand && !v0.players[1].hand && v0.players[0].hand.length === 3, 'views show only my own hand (and what others took in plain sight)');
  check(!JSON.stringify(v0).includes('"deck":[') && typeof v0.deck === 'number', 'views do not contain the draw pile order');
  // discarding the taken number removes it from "known"
  const took = st.players[2].hand.find((id) => E.num(id) === E.num(top));
  E.apply(st, 2, { t: 'discard', card: took });
  check(st.players[2].known.length === 0 && st.turn === 0, 'throwing that number away again forgets it');
  // taking from my own pile is allowed
  E.apply(st, 0, { t: 'draw' }); E.apply(st, 0, { t: 'discard', card: st.players[0].hand[3] });
  E.apply(st, 1, { t: 'draw' }); E.apply(st, 1, { t: 'discard', card: st.players[1].hand[0] });
  E.apply(st, 2, { t: 'draw' }); E.apply(st, 2, { t: 'discard', card: st.players[2].hand[0] });
  check(E.apply(st, 0, { t: 'take', from: 0 }).ok, 'a player may take the top card of their own pile');
}

/* ------------------------------------------------------------------ Try */
section('try');
{
  const st = E.newGame({ players: players(4), seed: 11, first: 0 });
  const used = new Set();
  rig(st, 0, [take(ids(6), used), take(ids(7), used), take(ids(8), used)]);          // 6-7-8 run
  rig(st, 1, [take(ids(2), used), take(ids(2), used), take(ids(2), used)]);          // 2-2-2
  rig(st, 2, [take(ids(9), used), take(ids(9), used), take(ids(9), used)]);          // 9-9-9
  rig(st, 3, [take(ids(1), used), take(ids(2), used), take(ids(3), used)]);          // 1-2-3 (weaker than the try)
  check(E.census(st), 'rigged hands keep every card once');
  const r = E.apply(st, 0, { t: 'try' });
  check(r.ok && st.phase === 'try' && st.tr.q.join(',') === '1,2,3', 'a try asks the others clockwise, ending with the player to the right');
  check(E.viewFor(st, 3).players[0].shown.join('') === '678', 'the tried hand is visible to everyone');
  check(!E.apply(st, 2, { t: 'respond', reveal: true }).ok, 'answers come in order');
  check(E.apply(st, 1, { t: 'respond', reveal: true }).ok && st.tr.best === 1, '2-2-2 beats 6-7-8');
  check(E.apply(st, 2, { t: 'respond', reveal: true }).ok && st.tr.best === 2, '9-9-9 beats 2-2-2');
  check(!E.apply(st, 3, { t: 'respond', reveal: true }).ok, 'a weaker set may not be revealed');
  const r2 = E.apply(st, 3, { t: 'respond', reveal: false });
  check(r2.ok && st.players[2].pts === 1 && st.phase === 'order', 'the strongest set scores 1');
  check(st.ord.pend.join(',') === '0,1,2' && !E.viewFor(st, 0).players[3].shown, 'everyone who revealed (and only they) must discard');
  check(st.players[3].pass === E.combo([9, 9, 9]).s, 'a pass is remembered publicly');
  // orders: top first
  const h0 = st.players[0].hand.slice(), h1 = st.players[1].hand.slice(), h2 = st.players[2].hand.slice();
  check(!E.apply(st, 0, { t: 'order', cards: [h0[0], h0[1]] }).ok && !E.apply(st, 0, { t: 'order', cards: [h1[0], h0[1], h0[2]] }).ok, 'the order must use exactly my revealed cards');
  E.apply(st, 0, { t: 'order', cards: [h0[2], h0[0], h0[1]] });
  E.apply(st, 2, { t: 'order', cards: h2 });
  check(st.phase === 'order', 'waits until everyone who revealed has ordered');
  const r3 = E.apply(st, 1, { t: 'order', cards: h1 });
  check(r3.ok && st.phase === 'turn' && st.turn === 1, 'then the turn passes to the player after the one who tried');
  check(st.players[0].pile[st.players[0].pile.length - 1] === h0[2] && st.players[0].pile[st.players[0].pile.length - 3] === h0[1], 'the chosen card ends on top of the pile');
  check([0, 1, 2].every((s) => st.players[s].hand.length === 3 && st.players[s].hand.every((id) => !h0.concat(h1, h2).includes(id))), 'they drew 3 new cards');
  check(st.players[3].hand.length === 3 && E.census(st), 'the player who passed keeps their hand');
  const refill = r3.ev.filter((e) => e.t === 'refill');
  check(refill.length === 3 && E.evFor(r3.ev, 3).every((e) => !e.priv), 'new hands are private');
  check(!E.apply(st, 1, { t: 'try' }).ok || !!E.combo(st.players[1].hand.map(E.num)), 'no try without a set');
}
{ // nobody beats it: the tryer scores; a pass with a stronger set is allowed
  const st = E.newGame({ players: players(3), seed: 12, first: 2 });
  const used = new Set();
  rig(st, 2, [take(ids(4), used), take(ids(4), used), take(ids(4), used)]);
  rig(st, 0, [take(ids(8), used), take(ids(8), used), take(ids(8), used)]);
  E.apply(st, 2, { t: 'try' });
  check(st.tr.q.join(',') === '0,1', 'from seat 2 the answers go 0 then 1');
  E.apply(st, 0, { t: 'respond', reveal: false });
  E.apply(st, 1, { t: 'respond', reveal: false });
  check(st.players[2].pts === 1 && st.ord.pend.join(',') === '2', 'unbeaten try scores; a stronger set may stay hidden');
}

/* ------------------------------------------------------------------ Jack */
section('jack');
{
  const st = E.newGame({ players: players(3), seed: 21, first: 0 });
  const used = new Set();
  rig(st, 1, [take(ids(1), used), take(ids(2), used), take(ids(3), used)]);
  rig(st, 2, [take(ids(1), used), take(ids(6), used), take(ids(9), used)]);
  check(!E.apply(st, 0, { t: 'jack', target: 0 }).ok, 'no Jack on yourself');
  const r = E.apply(st, 0, { t: 'jack', target: 1 });
  check(r.ok && st.players[0].pts === 1 && st.phase === 'order' && st.ord.pend.join(',') === '1', 'Jack on a set: the caller scores, the target discards');
  check(E.viewFor(st, 2).players[1].shown.join('') === '123', 'the target reveals to everyone');
  const h = st.players[1].hand.slice();
  E.apply(st, 1, { t: 'order', cards: h });
  check(st.turn === 1 && st.players[1].hand.length === 3 && !st.players[1].hand.some((id) => h.includes(id)), 'target draws 3 new; turn passes after the caller');
  // a miss
  E.apply(st, 1, { t: 'draw' }); E.apply(st, 1, { t: 'discard', card: st.players[1].hand[3] });
  const before = st.players[2].pts;
  E.apply(st, 2, { t: 'draw' }); E.apply(st, 2, { t: 'discard', card: st.players[2].hand[3] });
  E.apply(st, 0, { t: 'draw' }); E.apply(st, 0, { t: 'discard', card: st.players[0].hand[3] });
  const hasSet = !!E.combo(st.players[2].hand.map(E.num));
  E.apply(st, 1, { t: 'jack', target: 2 });
  check(hasSet ? st.players[1].pts === 1 : st.players[2].pts === before + 1, 'Jack on no set: the target scores');
}

/* ------------------------------------------------------------------ the draw pile runs out */
section('reshuffle');
{
  const st = E.newGame({ players: players(2), seed: 31, first: 0 });
  let guard = 0;
  while (st.deck.length > 0 && guard++ < 200) { const p = st.turn; E.apply(st, p, { t: 'draw' }); E.apply(st, p, { t: 'discard', card: st.players[p].hand[0] }); }
  check(st.deck.length === 0 && E.census(st), 'the pile can be drawn to the end');
  const tops = st.players.map((P) => P.pile[P.pile.length - 1]);
  const r = E.apply(st, st.turn, { t: 'draw' });
  const rs = r.ev.find((e) => e.t === 'reshuffle');
  check(r.ok && rs && st.players.every((P, i) => P.pile.length === 1 && P.pile[0] === tops[i]), 'each pile keeps only its top card');
  check(E.census(st) && st.deck.length === 80 - 7 - 2, 'the rest is the new draw pile');
}

/* ------------------------------------------------------------------ winning */
section('winning');
{
  const st = E.newGame({ players: players(2), seed: 41, first: 0, target: 3 });
  st.players[0].pts = 2;
  const used = new Set();
  rig(st, 1, [take(ids(7), used), take(ids(8), used), take(ids(9), used)]);
  const r = E.apply(st, 0, { t: 'jack', target: 1 });
  check(r.ok && st.phase === 'over' && st.winner === 0 && r.ev.some((e) => e.t === 'over'), 'the 3rd point ends the game at once');
  check(!E.apply(st, 1, { t: 'draw' }).ok, 'nothing more can be played');
  const st2 = E.newGame({ players: players(2), seed: 42, target: 5 });
  check(st2.target === 5, 'a longer game can be set');
}

/* ------------------------------------------------------------------ CPU games */
section('CPU games');
const GAMES = +(process.env.SL_GAMES || 300);
function play(levels, seed, target) {
  const n = levels.length;
  const st = E.newGame({ players: levels.map((l, i) => ({ name: 'C' + i, kind: 'cpu', level: l })), seed, target: target || 3 });
  const rnd = E.mulberry32(seed ^ 0x9e3779b9);
  let steps = 0, tries = 0, jacks = 0, jackHits = 0, reshuffles = 0;
  while (st.phase !== 'over' && steps < 4000) {
    const w = E.waitingFor(st);
    const p = w[0];
    const act = AI.decide(E.viewFor(st, p), levels[p], rnd);
    if (!act) throw new Error('no decision for seat ' + p + ' in ' + st.phase);
    const r = E.apply(st, p, act);
    if (!r.ok) throw new Error('illegal ' + JSON.stringify(act) + ' → ' + r.err + ' in ' + st.phase);
    if (act.t === 'try') tries++;
    if (act.t === 'jack') { jacks++; if (r.ev.find((e) => e.t === 'jack').ok) jackHits++; }
    reshuffles += r.ev.filter((e) => e.t === 'reshuffle').length;
    if (!E.census(st)) throw new Error('cards lost');
    if (st.phase !== 'discard' && st.phase !== 'over' && st.players.some((P) => P.hand.length !== 3)) throw new Error('hand size');
    steps++;
  }
  return { winner: st.winner, steps, tries, jacks, jackHits, reshuffles, turns: st.turnNo };
}
{
  let errs = 0, maxSteps = 0, sumTurns = 0, sumTry = 0, sumJack = 0, sumHit = 0, games = 0, resh = 0;
  const t0 = Date.now();
  for (let g = 0; g < GAMES; g++) {
    const n = 2 + (g % 5), levels = Array.from({ length: n }, (_, i) => 1 + ((g + i) % 3));
    try {
      const r = play(levels, 1000 + g);
      if (r.winner < 0) errs++;
      maxSteps = Math.max(maxSteps, r.steps); sumTurns += r.turns; sumTry += r.tries; sumJack += r.jacks; sumHit += r.jackHits; resh += r.reshuffles; games++;
    } catch (e) { errs++; if (errs < 4) console.log('  error: ' + e.message); }
  }
  check(errs === 0, `${GAMES} CPU games (2–6 players, mixed levels) finish without an illegal move (${errs} problems)`);
  console.log(`  ${games} games in ${Date.now() - t0} ms; avg turns ${(sumTurns / games).toFixed(1)}, tries ${(sumTry / games).toFixed(1)}, jacks ${(sumJack / games).toFixed(1)} (hit ${(100 * sumHit / Math.max(1, sumJack)).toFixed(0)}%), reshuffles/game ${(resh / games).toFixed(2)}, longest ${maxSteps} moves`);
}
{
  function duel(a, b, games, n) {
    let wa = 0;
    for (let g = 0; g < games; g++) {
      const levels = Array.from({ length: n }, (_, i) => (i === g % n ? a : b));
      const r = play(levels, 50000 + g * 7 + a * 1000 + b * 100 + n);
      if (r.winner === g % n) wa++;
    }
    return wa / games;
  }
  const G = Math.max(120, Math.round(GAMES / 1.5));
  const r31 = duel(3, 1, G, 2), r21 = duel(2, 1, G, 2), r32 = duel(3, 2, G, 2), r3m = duel(3, 2, G, 4), r1m = duel(1, 2, G, 4);
  console.log(`  2 players: つよい vs やさしい ${(r31 * 100).toFixed(0)}%, ふつう vs やさしい ${(r21 * 100).toFixed(0)}%, つよい vs ふつう ${(r32 * 100).toFixed(0)}%`);
  console.log(`  4 players: one つよい among ふつう wins ${(r3m * 100).toFixed(0)}% (fair share 25%), one やさしい among ふつう ${(r1m * 100).toFixed(0)}%`);
  check(r31 > 0.55, 'つよい beats やさしい in most 2-player games');
  check(r21 > 0.52, 'ふつう beats やさしい more often than not');
  check(r32 >= 0.47, 'つよい is at least as good as ふつう');
  check(r1m < 0.25, 'やさしい wins less than its fair share against ふつう');
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall rules checks passed');
process.exit(failures.length ? 1 : 0);

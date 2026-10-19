// ハタトリ・ナイン: rules engine tests.   node tools/hatatori-rules-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../hatatori-nine/engine.js');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const T = (color, value) => color * 10 + value - 1;     // troop id
const R = 0, O = 1, Y = 2, G = 3, B = 4, P = 5;

/* ---------------------------------------------------------------- formations of finished sides */
eq(E.bestStrength([T(R, 3), T(R, 4), T(R, 5)], 3, false, null), 412, 'wedge 3-4-5');
eq(E.bestStrength([T(R, 3), T(G, 3), T(B, 3)], 3, false, null), 309, 'phalanx of 3s');
eq(E.bestStrength([T(R, 1), T(R, 9), T(R, 5)], 3, false, null), 215, 'battalion');
eq(E.bestStrength([T(R, 8), T(G, 9), T(B, 10)], 3, false, null), 127, 'skirmish 8-9-10');
eq(E.bestStrength([T(R, 10), T(G, 10), T(B, 9)], 3, false, null), 29, 'host 29');
eq(E.bestStrength([T(R, 10), T(G, 10), T(B, 9)], 3, true, null), 29, 'fog: total');
eq(E.bestStrength([T(R, 1), T(R, 2), T(R, 3)], 3, true, null), 6, 'fog kills the wedge');
eq(E.bestStrength([T(R, 1), T(R, 2), T(R, 3), T(R, 4)], 4, false, null), 410, 'mud: four-card wedge');
eq(E.bestStrength([T(R, 1), T(G, 2), T(R, 3), T(R, 4)], 4, false, null), 110, 'mud: four-card skirmish');
// wilds
eq(E.bestStrength([T(R, 9), T(R, 10), E.LEADER_A], 3, false, null), 427, 'leader completes 8-9-10');
eq(E.bestStrength([T(R, 9), T(R, 10), E.CAV], 3, false, null), 427, 'cavalry is the red 8');
eq(E.bestStrength([T(R, 9), T(G, 10), E.CAV], 3, false, null), 127, 'cavalry 8 in a skirmish');
eq(E.bestStrength([T(R, 2), T(R, 4), E.SHIELD], 3, false, null), 409, 'shield bearers as red 3');
eq(E.bestStrength([T(R, 5), T(R, 6), E.SHIELD], 3, false, null), 214, 'shield bearers cannot reach 7: battalion 5+6+3');
eq(E.bestStrength([T(G, 8), T(B, 8), E.CAV], 3, false, null), 324, 'phalanx of 8s with cavalry');
eq(E.bestStrength([E.LEADER_A, E.CAV, E.SHIELD], 3, false, null), 221, 'all wilds: battalion 10+8+3');
eq(E.bestStrength([E.LEADER_A, E.CAV, T(Y, 9)], 3, false, null), 427, 'leader + cavalry + yellow 9 = wedge 8-9-10');
eq(E.bestStrength([E.LEADER_A, E.CAV, T(Y, 9)], 3, true, null), 27, 'fog: leader counts 10');
eq(E.bestStrength([E.SHIELD, T(B, 1), T(B, 2)], 3, false, null), 406, 'shield as blue 3: wedge 1-2-3');

/* ---------------------------------------------------------------- brute force check of bestStrength with a pool */
function bruteBest(cards, cap, fog, avail) {
  const pool = []; for (let i = 0; i < 60; i++) if (avail && avail[i]) pool.push(i);
  const m = cap - cards.length;
  let best = -1;
  const pick = [];
  (function rec(start) {
    if (pick.length === m) {
      const s = E.explain(cards.concat(pick), fog).strength;
      if (s > best) best = s;
      return;
    }
    for (let i = start; i < pool.length; i++) { pick.push(pool[i]); rec(i + 1); pick.pop(); }
  })(0);
  return best;
}
const rng = E.mulberry32(12345);
let bf = 0;
for (let trial = 0; trial < 2500; trial++) {
  const cap = rng() < 0.2 ? 4 : 3;
  const fog = rng() < 0.15;
  const deck = E.shuffle(Array.from({ length: 60 }, (_, i) => i), rng);
  const nOnSide = Math.floor(rng() * cap);
  const cards = deck.slice(0, nOnSide);
  // sometimes add wilds
  if (rng() < 0.35 && cards.length < cap) cards[cards.length] = [60, 62, 63][Math.floor(rng() * 3)];
  if (rng() < 0.15 && cards.length < cap && !cards.includes(62)) cards[cards.length] = 62;
  if (rng() < 0.15 && cards.length < cap && !cards.includes(63)) cards[cards.length] = 63;
  const avail = new Uint8Array(60);
  const nPool = 2 + Math.floor(rng() * (cap - cards.length > 2 ? 9 : 14));
  deck.slice(10, 10 + nPool).forEach((c) => { avail[c] = 1; });
  // occasionally a pool built around the side's color to make wedges likely
  if (rng() < 0.4 && cards.length && cards[0] < 60) { const col = Math.floor(cards[0] / 10); for (let v = 0; v < 10; v++) if (rng() < 0.5 && !cards.includes(col * 10 + v)) avail[col * 10 + v] = 1; }
  cards.forEach((c) => { if (c < 60) avail[c] = 0; });
  let n = 0; for (let i = 0; i < 60; i++) n += avail[i];
  if (n > 16 && cap - cards.length >= 3) continue;   // keep brute force quick
  const fast = E.bestStrength(cards, cap, fog, cap > cards.length ? avail : null);
  const slow = cap > cards.length ? bruteBest(cards, cap, fog, avail) : E.explain(cards, fog).strength;
  if (fast !== slow) { fails++; if (fails < 12) console.log('FAIL bestStrength', JSON.stringify({ cards, cap, fog, pool: [...avail].map((v, i) => v ? i : -1).filter((i) => i >= 0), fast, slow })); }
  else passes++;
  // the picked cards must really make that formation
  if (cap > cards.length && fast >= 0) {
    const picks = [];
    E.bestStrength(cards, cap, fog, avail, picks);
    const distinct = new Set(picks).size === picks.length && picks.every((c) => avail[c]);
    const made = E.explain(cards.concat(picks), fog).strength;
    if (!distinct || picks.length !== cap - cards.length || made !== fast) { fails++; if (fails < 12) console.log('FAIL picks', JSON.stringify({ cards, cap, fog, picks, made, fast })); }
    else passes++;
  }
  bf++;
}
console.log('brute force cases:', bf);

/* ---------------------------------------------------------------- claims */
function blank(tactics = true) { const s = E.newGame({ seed: 1, tactics }); return s; }
function put(s, p, f, cards) { cards.forEach((c) => { s.clock++; s.flags[f].side[p].push({ c, t: s.clock }); }); }
{
  const s = blank();
  put(s, 0, 0, [T(R, 8), T(R, 9), T(R, 10)]);
  const c = E.claimCheck(s, 0, 0);
  ok(c && c.how === 'proof', 'top wedge is claimable at once by proof');
  ok(!E.claimCheck(s, 0, 1), 'opponent cannot claim');
}
{
  const s = blank();
  put(s, 0, 0, [T(R, 1), T(R, 2), T(R, 3)]);
  ok(!E.claimCheck(s, 0, 0), 'low wedge cannot be proven against an empty side');
  // make every higher wedge / any phalanx impossible? use opponent cards already there
  put(s, 1, 0, [T(G, 1), T(B, 5)]);
  const c = E.claimCheck(s, 0, 0);
  ok(c && c.how === 'proof', 'proof: opponent G1+B5 can only reach a host / skirmish (got ' + JSON.stringify(c) + ')');
}
{
  const s = blank();
  put(s, 1, 2, [T(G, 7), T(G, 8)]);           // they could still finish 6-7-8 or 7-8-9
  put(s, 0, 2, [T(B, 5), T(B, 6), T(B, 7)]);
  ok(!E.claimCheck(s, 2, 0), 'cannot claim while G6 or G9 are unseen');
  // put G6 and G9 elsewhere on the table: no wedge left. A green battalion G7+G8+G10=25 < blue wedge
  put(s, 0, 5, [T(G, 6)]); put(s, 1, 6, [T(G, 9)]);
  const c = E.claimCheck(s, 2, 0);
  ok(c && c.how === 'proof', 'claim by proof once the wedge cards are visible');
}
{
  const s = blank();
  put(s, 0, 3, [T(R, 5), T(G, 5), T(B, 5)]);   // phalanx 15 finished first
  put(s, 1, 3, [T(Y, 5), T(O, 5), T(P, 5)]);   // equal, finished later
  const c = E.claimCheck(s, 3, 0);
  ok(c && c.how === 'tie', 'tie goes to whoever finished first');
  ok(!E.claimCheck(s, 3, 1), 'the later finisher loses the tie');
}
{
  const s = blank();
  put(s, 0, 4, [T(R, 10), T(G, 10), T(B, 9)]);   // 29 host
  put(s, 1, 4, [T(R, 1), T(R, 2), T(R, 3)]);     // wedge 6
  ok(E.claimCheck(s, 4, 1), 'wedge beats host');
  s.flags[4].fog = 0;
  ok(!E.claimCheck(s, 4, 1) && E.claimCheck(s, 4, 0), 'with fog the total wins');
  s.flags[4].fog = -1; s.flags[4].mud = 1;
  ok(!E.claimCheck(s, 4, 0) && !E.claimCheck(s, 4, 1), 'with mud nobody is finished');
}
{ // proof with an equal best: claimant wins because the opponent would finish last
  const s = blank();
  put(s, 0, 1, [T(R, 8), T(R, 9), T(R, 10)]);
  put(s, 1, 1, [T(G, 9), T(G, 10)]);
  // G8 is still unseen -> they can tie with 27 and would finish last -> claimant wins
  const c = E.claimCheck(s, 1, 0);
  ok(c && c.how === 'proof', 'proof with possible tie goes to the claimant');
}

/* ---------------------------------------------------------------- victory */
{
  const s = blank();
  [0, 1, 2].forEach((f) => { s.flags[f].claimed = 0; });
  eq(E.victory(s, 0), 'breakthrough', 'three adjacent');
  const s2 = blank();
  [0, 2, 4, 6, 8].forEach((f) => { s2.flags[f].claimed = 1; });
  eq(E.victory(s2, 1), 'envelopment', 'five flags');
  const s3 = blank();
  [0, 2, 3, 5].forEach((f) => { s3.flags[f].claimed = 1; });
  eq(E.victory(s3, 1), null, 'no victory yet');
}

/* ---------------------------------------------------------------- tactics through apply() */
function freshWithHands(h0, h1, opt = {}) {
  const s = E.newGame({ seed: 7, tactics: true, ...opt });
  // return the dealt cards to the deck, then give the wanted hands
  s.deck.T.push(...s.hands[0].filter((c) => c < 60), ...s.hands[1].filter((c) => c < 60));
  s.hands = [h0.slice(), h1.slice()];
  const used = new Set([...h0, ...h1]);
  s.deck.T = s.deck.T.filter((c) => !used.has(c));
  s.deck.X = s.deck.X.filter((c) => !used.has(c));
  return s;
}
function act(s, a, msg) { const r = E.apply(s, a); ok(r.ok, msg + (r.ok ? '' : ' -> ' + r.err)); return r; }
{
  const s = freshWithHands([T(R, 1), E.LEADER_A, E.LEADER_B, E.FOG, T(R, 2), T(R, 3), T(R, 4)], [T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6), E.DESERTER]);
  act(s, { t: 'card', c: E.LEADER_A, f: 0 }, 'play leader');
  act(s, { t: 'draw', d: 'T' }, 'draw');
  // opponent may play a tactic now (they have played 0, we 1)
  ok(!E.whyNot(s, 1, E.DESERTER), 'opponent may answer with a tactic');
  act(s, { t: 'card', c: T(G, 1), f: 1 }, 'opponent plays a troop instead');
  act(s, { t: 'draw', d: 'T' }, 'opponent draws');
  ok(E.whyNot(s, 0, E.LEADER_B) !== '', 'second leader is blocked');
  ok(E.whyNot(s, 0, E.FOG) !== '', 'tactics limit: we already played one more than the opponent');
  const r = E.apply(s, { t: 'env', c: E.FOG, f: 3 });
  ok(!r.ok, 'fog rejected by the limit');
}
{
  // mud: four cards per side; we finish 1-2-3-4 first, so a tie with their possible 1-2-3-4 goes to us
  const s = freshWithHands([E.MUD, T(R, 1), T(R, 2), T(R, 3), T(R, 4), T(R, 5), T(R, 6)], [T(B, 9), T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6)]);
  act(s, { t: 'env', c: E.MUD, f: 4 }, 'mud');
  act(s, { t: 'draw', d: 'T' }, 'draw');
  act(s, { t: 'card', c: T(G, 1), f: 4 }, 'g1'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(R, 1), f: 4 }, 'r1'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(G, 2), f: 4 }, 'g2'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(R, 2), f: 4 }, 'r2'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(G, 3), f: 4 }, 'g3'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(R, 3), f: 4 }, 'r3'); act(s, { t: 'draw', d: 'T' }, 'd');
  eq(s.flags[4].claimed, -1, 'three cards are not enough under mud');
  act(s, { t: 'card', c: T(B, 9), f: 0 }, 'b9 elsewhere'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(R, 4), f: 4 }, 'r4'); 
  eq(s.flags[4].side[0].length, 4, 'four cards under mud');
  eq(s.flags[4].claimed, 0, 'four-card wedge claimed; the possible tie goes to the first finisher');
}
{
  const s = freshWithHands([E.DESERTER, T(R, 7), T(R, 2), T(R, 3), T(R, 4), T(R, 5), T(R, 6)], [E.MUD, T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6)], { first: 1 });
  s.turn = 1;
  act(s, { t: 'env', c: E.MUD, f: 2 }, 'opp mud');
  act(s, { t: 'draw', d: 'T' }, 'opp draw');
  // place three of ours and four of theirs quickly by hand (direct table edit)
  put(s, 0, 2, [T(R, 2), T(R, 3)]);
  put(s, 1, 2, [T(G, 1), T(G, 2), T(G, 3), T(G, 4)]);
  s.hands[0] = s.hands[0].filter((c) => c !== T(R, 2) && c !== T(R, 3));
  s.hands[1] = s.hands[1].filter((c) => c > 3 * 10 + 3 || c < 30);
  act(s, { t: 'deserter', c: E.DESERTER, x: E.MUD }, 'desert the mud');
  eq(s.flags[2].mud, -1, 'mud gone');
  eq(s.flags[2].side[1].length, 3, 'their fourth card was dropped');
  ok(s.discard[1].includes(T(G, 4)) && s.discard[1].includes(E.MUD), 'G4 and mud in their discard');
}
{
  // traitor + redeploy
  const s = freshWithHands([E.TRAITOR, E.REDEPLOY, T(R, 2), T(R, 3), T(R, 4), T(R, 5), T(R, 6)], [T(G, 9), T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6)], { first: 1 });
  s.turn = 1;
  act(s, { t: 'card', c: T(G, 9), f: 5 }, 'g9'); act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'traitor', c: E.TRAITOR, x: T(G, 9), to: 0 }, 'traitor the G9 to flag 1');
  ok(s.flags[0].side[0].some((e) => e.c === T(G, 9)) && !s.flags[5].side[1].length, 'G9 changed sides');
  act(s, { t: 'draw', d: 'T' }, 'd');
  act(s, { t: 'card', c: T(G, 1), f: 0 }, 'g1'); act(s, { t: 'draw', d: 'T' }, 'd');
  ok(E.whyNot(s, 0, E.REDEPLOY) !== '', 'redeploy blocked: one tactic ahead');
  s.tac[1] = 1;   // pretend the opponent played one too
  act(s, { t: 'redeploy', c: E.REDEPLOY, x: T(G, 9), to: 8 }, 'redeploy G9 to flag 9');
  ok(s.flags[8].side[0].some((e) => e.c === T(G, 9)), 'G9 moved');
  act(s, { t: 'draw', d: 'T' }, 'd');
}
{
  // scout
  const s = freshWithHands([E.SCOUT, T(R, 1), T(R, 2), T(R, 3), T(R, 4), T(R, 5), T(R, 6)], [T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6), T(G, 7)]);
  act(s, { t: 'scout', c: E.SCOUT }, 'scout');
  eq(s.phase, 'scout', 'scout phase');
  act(s, { t: 'sdraw', d: 'T' }, 'sdraw 1'); act(s, { t: 'sdraw', d: 'X' }, 'sdraw 2'); act(s, { t: 'sdraw', d: 'T' }, 'sdraw 3');
  eq(s.hands[0].length, 9, 'nine in hand');
  const r = E.apply(s, { t: 'sret', cards: [T(R, 1)] });
  ok(!r.ok, 'must return exactly two');
  const topT = s.deck.T.length;
  act(s, { t: 'sret', cards: [T(R, 1), T(R, 2)] }, 'return two');
  eq(s.hands[0].length, 7, 'back to seven');
  eq(s.deck.T.length, topT + 2, 'returned to the troop deck');
  eq(s.deck.T[s.deck.T.length - 1], T(R, 2), 'last returned is on top');
  eq(s.turn, 1, 'turn passed without an extra draw');
}
{
  // pass is only allowed without a playable troop card
  const s = freshWithHands([E.FOG, E.MUD, E.SCOUT, E.REDEPLOY, E.DESERTER, E.TRAITOR, E.CAV], [T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6), T(G, 7)]);
  ok(E.canPass(s, 0), 'only tactics in hand: may pass');
  act(s, { t: 'pass' }, 'pass');
  eq(s.turn, 1, 'turn moved on');
  ok(!E.canPass(s, 1), 'troops in hand: may not pass');
}

/* ---------------------------------------------------------------- declared claims (claims: 'manual') */
{
  // flags where both sides are complete are decided at once, whoever's turn it is
  const s = freshWithHands([T(R, 8), T(R, 9), T(R, 10), T(Y, 2), T(Y, 3), T(B, 5), T(B, 6)], [T(G, 8), T(G, 9), T(G, 10), T(G, 1), T(G, 2), T(G, 3), T(G, 4)], { claims: 'manual' });
  eq(s.claims, 'manual', 'manual claims are set');
  eq(E.viewFor(s, 1).claims, 'manual', 'the view tells the rule');
  put(s, 1, 3, [T(G, 1), T(G, 2), T(G, 3)]); s.hands[1] = s.hands[1].filter((c) => ![T(G, 1), T(G, 2), T(G, 3)].includes(c));
  put(s, 0, 3, [T(Y, 2), T(Y, 3)]); s.hands[0] = s.hands[0].filter((c) => c !== T(Y, 2) && c !== T(Y, 3));
  s.hands[0].push(T(P, 1), T(P, 2)); s.deck.T = s.deck.T.filter((c) => c !== T(P, 1) && c !== T(P, 2));
  const r0 = act(s, { t: 'card', c: T(P, 1), f: 3 }, 'we finish flag 4 weaker (skirmish 1-2-3 vs their wedge 1-2-3)');
  eq(s.flags[3].claimed, 1, 'decided at once: theirs, during our turn');
  ok(r0.ev.some((e) => e.k === 'claim' && e.f === 3 && e.p === 1 && !e.decl), 'settled, not declared');
}
{
  const s = freshWithHands([T(R, 8), T(R, 9), T(R, 10), T(Y, 2), T(Y, 3), T(B, 5), T(B, 6)], [T(G, 8), T(G, 9), T(G, 10), T(G, 1), T(G, 2), T(G, 3), T(G, 4)], { claims: 'manual' });
  put(s, 0, 0, [T(R, 8), T(R, 9)]); s.hands[0] = s.hands[0].filter(c => c !== T(R, 8) && c !== T(R, 9));
  s.hands[0].push(T(P, 1), T(P, 2)); s.deck.T = s.deck.T.filter(c => c !== T(P, 1) && c !== T(P, 2));
  put(s, 0, 6, [T(B, 8), T(B, 9), T(B, 10)]); s.deck.T = s.deck.T.filter(c => ![T(B, 8), T(B, 9), T(B, 10)].includes(c));
  ok(E.canClaimNow(s, 0), 'declarations before the main action');
  eq(E.apply(s, { t: 'end' }).err, 'end', 'cannot skip the main action');
  act(s, { t: 'card', c: T(R, 10), f: 0 }, 'complete red wedge');
  eq(s.phase, 'draw', 'draw still required after playing');
  ok(E.legalActions(s).some(a => a.t === 'claim' && a.f === 0), 'declaration is legal after playing and before drawing');
  act(s, { t: 'claim', f: 0 }, 'declare immediately after playing');
  eq(s.flags[0].claimed, 0, 'post-play declaration succeeds');
  eq(s.phase, 'draw', 'declaration preserves the pending draw');
  eq(E.apply(s, { t: 'end' }).err, 'end', 'must draw before ending');
  act(s, { t: 'draw', d: 'T' }, 'draw');
  eq(s.phase, 'end', 'drawing waits for explicit end'); eq(s.turn, 0, 'draw does not pass the turn');
  act(s, { t: 'claim', f: 6 }, 'a second flag can be declared after drawing');
  eq(s.flags[6].claimed, 0, 'post-draw declaration succeeds'); eq(s.phase, 'end', 'claim still waits for end');
  ok(!E.apply(s, { t: 'card', c: T(P, 1), f: 1 }).ok, 'only one main action per turn');
  act(s, { t: 'end' }, 'explicit end'); eq(s.turn, 1, 'end transfers control exactly once');
  eq(E.apply(s, { t: 'claim', f: 1, p: 0 }).err, 'turn', 'no claiming during opponent turn');
}
{
  const s = freshWithHands([T(R, 8), T(R, 9), T(R, 10), T(Y, 2), T(Y, 3), T(B, 5), T(B, 6)], [T(G, 8), T(G, 9), T(G, 10), T(G, 1), T(G, 2), T(G, 3), T(G, 4)], { claims: 'manual' });
  put(s, 0, 1, [T(Y, 2), T(P, 3), T(B, 1)]);
  put(s, 0, 3, [T(R, 8), T(R, 9), T(R, 10)]);
  const r = act(s, { t: 'claim', f: 1 }, 'unprovable claim');
  ok(r.ev.some(e => e.k === 'claimfail'), 'wrong declaration is refused');
  eq(s.flags[1].claimed, -1, 'refused claim takes no flag');
  act(s, { t: 'claim', f: 3 }, 'valid declaration remains available');
  eq(s.flags[3].claimed, 0, 'another declaration allowed in same turn');
  for (const phase of ['play', 'draw', 'scout', 'end']) { const t=E.clone(s); t.phase=phase; t.scout={left:2};
    ok(E.canClaimNow(t,0), 'declarations during '+phase); ok(!E.canClaimNow(t,1), 'wrong player rejected in '+phase);
    eq(E.apply(t,{t:'claim',f:1}).ok,true,'claim action works in '+phase);
  }
}
{
  const s = freshWithHands([T(R, 1)], [T(G, 1)], {claims:'manual'}); s.deck={T:[],X:[]};
  act(s,{t:'card',c:T(R,1),f:0},'last card with empty decks'); eq(s.phase,'end','empty decks still require End Turn');
  act(s,{t:'end'},'end without drawing'); eq(s.turn,1,'end with empty decks');
}
{
  // a declared claim can win the game
  const s = freshWithHands([T(R, 10), T(Y, 2), T(Y, 3), T(B, 5), T(B, 6), T(P, 1), T(P, 2)], [T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6), T(G, 7)], { claims: 'manual' });
  [0, 2, 4, 8].forEach((f) => { s.flags[f].claimed = 0; });
  put(s, 0, 6, [T(R, 8), T(R, 9), T(R, 10)]); s.hands[0] = s.hands[0].filter((c) => c !== T(R, 10));
  act(s, { t: 'claim', f: 6 }, 'declare the fifth');
  eq(s.phase, 'over', 'game over');
  eq(s.winner, 0, 'we win');
  eq(s.win, 'envelopment', 'five flags');
}
{
  // automatic claims stay the default
  const s = freshWithHands([T(R, 10), T(Y, 2), T(Y, 3), T(B, 5), T(B, 6), T(P, 1), T(P, 2)], [T(G, 1), T(G, 2), T(G, 3), T(G, 4), T(G, 5), T(G, 6), T(G, 7)]);
  eq(s.claims, 'auto', 'auto by default');
  put(s, 0, 6, [T(R, 8), T(R, 9)]);
  act(s, { t: 'card', c: T(R, 10), f: 6 }, 'complete');
  eq(s.flags[6].claimed, 0, 'claimed automatically');
  ok(!E.apply(s, { t: 'claim', f: 6 }).ok, 'no declared claims in the automatic game');
}

/* ---------------------------------------------------------------- random full games: invariants */
function conservation(s) {
  const seen = new Map();
  const add = (c, where) => { if (seen.has(c)) throw new Error('card ' + c + ' twice: ' + seen.get(c) + ' & ' + where); seen.set(c, where); };
  s.deck.T.forEach((c) => add(c, 'T')); s.deck.X.forEach((c) => add(c, 'X'));
  s.hands.forEach((h, p) => h.forEach((c) => add(c, 'hand' + p)));
  s.discard.forEach((d, p) => d.forEach((c) => add(c, 'disc' + p)));
  s.flags.forEach((fl, f) => {
    fl.side.forEach((side, p) => side.forEach((e) => add(e.c, 'flag' + f + '/' + p)));
    if (fl.fog >= 0) add(E.FOG, 'fog' + f); if (fl.mud >= 0) add(E.MUD, 'mud' + f);
  });
  return seen.size;
}
let games = 0, lens = [], wins = { breakthrough: 0, envelopment: 0, count: 0, draw: 0 };
const grng = E.mulberry32(99);
for (let g = 0; g < 400; g++) {
  const tactics = g % 4 !== 0;
  const s = E.newGame({ seed: 1000 + g, tactics, first: g % 2, claims: g % 3 === 0 ? 'auto' : 'manual' });
  let steps = 0;
  try {
    while (s.phase !== 'over' && steps < 2000) {
      const acts = E.legalActions(s);
      if (!acts.length) throw new Error('no legal action in phase ' + s.phase);
      const a = acts[Math.floor(grng() * acts.length)];
      const before = JSON.stringify(s.flags.map((fl) => fl.claimed));
      const v0 = [E.viewFor(s, 0), E.viewFor(s, 1)];
      const r = E.apply(s, a);
      if (r.ok) for (let me = 0; me < 2; me++) {   // the UI's step-by-step replay must land on the real view
        let v = v0[me];
        E.redact(r.ev, me).forEach((e) => { v = E.reduceView(v, e); });
        const w = E.viewFor(s, me);
        const key = (x) => JSON.stringify({
          hand: x.hand.slice().sort((a, b) => a - b), oT: x.opp.filter((k) => k === 'T').length, oX: x.opp.filter((k) => k === 'X').length,
          deck: x.deck, flags: x.flags.map((fl) => [fl.side[0].map((e) => e.c), fl.side[1].map((e) => e.c), fl.fog, fl.mud, fl.claimed]),
          disc: x.discard, tac: x.tac, leader: x.leader, turn: x.turn, winner: x.winner
        });
        if (key(v) !== key(w)) throw new Error('reduceView mismatch for seat ' + me + ' after ' + JSON.stringify(a) + '\n' + key(v) + '\n' + key(w));
      }
      if (!r.ok) throw new Error('legal action rejected: ' + JSON.stringify(a) + ' ' + r.err);
      // claimed flags never change hands
      const after = s.flags.map((fl) => fl.claimed);
      JSON.parse(before).forEach((v, f) => { if (v !== -1 && after[f] !== v) throw new Error('claimed flag changed'); });
      s.flags.forEach((fl) => fl.side.forEach((side) => { if (side.length > E.capOf(fl)) throw new Error('too many cards'); }));
      const n = conservation(s);
      if (n !== (tactics ? 70 : 60)) throw new Error('card count ' + n);
      if (s.hands[0].length > 7 && s.phase !== 'scout') throw new Error('hand too big');
      if (s.phase === 'claim') throw new Error('no claim phase any more');
      if (s.claims === 'manual') s.flags.forEach((fl, f) => { const cap = E.capOf(fl); if (fl.claimed === -1 && fl.side[0].length >= cap && fl.side[1].length >= cap) throw new Error('flag ' + f + ' complete on both sides but not decided'); });
      steps++;
    }
    if (s.phase !== 'over') throw new Error('game did not end');
    wins[s.win]++; lens.push(s.ply); games++;
    // views hide the other hand
    const v = E.viewFor(s, 0);
    if (v.opp.some((x) => typeof x === 'number')) throw new Error('view leaks the other hand');
  } catch (e) { fails++; console.log('FAIL game ' + g + ': ' + e.message); }
}
console.log('random games:', games, 'avg plies', (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1), JSON.stringify(wins));

console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} checks passed`);
process.exit(fails ? 1 : 0);

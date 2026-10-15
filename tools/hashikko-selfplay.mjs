// ハシッコ・セブン: CPU self-play.   node tools/hashikko-selfplay.mjs [games] [levels, e.g. 3,2,1,1] [seed offset]
// The number of levels is the number of players. Seats rotate every game so each level sits everywhere.
// Prints wins per level, how the games were won, game length and the time per decision.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../hashikko-seven/engine.js');
const AI = require('../hashikko-seven/ai.js');

const G = Number(process.argv[2] || 40);
const LV = String(process.argv[3] || '3,2,1').split(',').map(Number);
const OFFSET = Number(process.argv[4] || 0);
const n = LV.length;
if (!E.SETUP[n]) { console.error('2-5 levels'); process.exit(2); }
const wins = LV.map(() => 0), how = {};
let turns = 0, decisions = 0, ms = 0, worst = 0, badKnow = 0;
for (let g = 0; g < G; g++) {
  const s = E.newGame({ n, seed: 9000 + OFFSET + g, first: g % n });
  const seatLevel = LV.map((_, p) => LV[(p + g) % n]);          // seat p plays level seatLevel[p]
  const seatOf = LV.map((_, i) => (i - g % n + n) % n);         // level slot i sits at seat seatOf[i]
  const minds = LV.map((_, p) => ({ seed: (777 + g * 31 + p * 101) >>> 0 }));
  const rng = E.mulberry32(4242 + OFFSET + g);
  let steps = 0;
  while (s.phase === 'play') {
    if (++steps > 4000) throw new Error('game ' + g + ' did not end');
    const p = s.turn, v = E.viewFor(s, p);
    const t0 = performance.now();
    if (!AI.knowledge(v, seatLevel[p], minds[p]).ok) badKnow++;
    const a = AI.choose(v, seatLevel[p], rng, minds[p]);
    const dt = performance.now() - t0;
    decisions++; ms += dt; worst = Math.max(worst, dt);
    const r = E.apply(s, Object.assign({ p }, a));
    if (!r.ok) throw new Error('illegal CPU action ' + JSON.stringify(a) + ': ' + r.err);
  }
  const slot = seatOf.indexOf(s.winner);
  wins[slot]++;
  how[s.win] = (how[s.win] || 0) + 1;
  turns += s.turnNo;
}
console.log(`${n} players, levels ${LV.join(' / ')}: wins ${wins.join(' / ')} over ${G} games; ` +
  `avg ${(turns / G).toFixed(1)} turns; decision avg ${(ms / decisions).toFixed(1)}ms worst ${worst.toFixed(0)}ms; ` +
  `${JSON.stringify(how)}${badKnow ? '; knowledge fallbacks ' + badKnow : ''}`);

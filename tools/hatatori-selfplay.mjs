// ハタトリ・ナイン: CPU self-play.   node tools/hatatori-selfplay.mjs [games] [levelA] [levelB] [tactics 0|1]
// Plays levelA (seat alternates) against levelB and prints the win rate and the time per decision.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../hatatori-nine/engine.js');
const AI = require('../hatatori-nine/ai.js');

const N = Number(process.argv[2] || 20), LA = Number(process.argv[3] || 2), LB = Number(process.argv[4] || 1);
const TACTICS = process.argv[5] !== '0';
const OFFSET = Number(process.argv[6] || 0);
const TW = [process.env.TWEAK_A ? JSON.parse(process.env.TWEAK_A) : null, process.env.TWEAK_B ? JSON.parse(process.env.TWEAK_B) : null];
let winsA = 0, winsB = 0, draws = 0, decisions = 0, ms = 0, worst = 0, plies = 0;
const how = {};
for (let g = 0; g < N; g++) {
  const seatA = g % 2;
  const s = E.newGame({ seed: 5000 + OFFSET + g, tactics: TACTICS, first: (g >> 1) % 2, claims: 'manual' });
  const rng = E.mulberry32(777 + OFFSET + g);
  let steps = 0;
  while (s.phase !== 'over' && steps < 3000) {
    const p = s.turn, lvl = p === seatA ? LA : LB;
    const t0 = performance.now();
    let a;
    if (lvl === 0) { const acts = E.legalActions(s); a = acts[Math.floor(rng() * acts.length)]; }   // level 0: random legal move
    else a = AI.choose(E.viewFor(s, p), lvl, rng, p === seatA ? TW[0] : TW[1]);
    const dt = performance.now() - t0;
    decisions++; ms += dt; worst = Math.max(worst, dt);
    if (!a) throw new Error('no action');
    const r = E.apply(s, a);
    if (!r.ok) throw new Error('illegal CPU action ' + JSON.stringify(a) + ': ' + r.err + ' phase ' + s.phase);
    steps++;
  }
  if (s.phase !== 'over') throw new Error('game ' + g + ' did not end');
  if (s.winner === seatA) winsA++; else if (s.winner === 1 - seatA) winsB++; else draws++;
  how[s.win] = (how[s.win] || 0) + 1; plies += s.ply;
}
console.log(`level ${LA} vs level ${LB} (${TACTICS ? 'tactics' : 'basic'}): ${winsA}-${winsB} (draws ${draws}) over ${N} games; ` +
  `avg ${(plies / N).toFixed(1)} plies; decision avg ${(ms / decisions).toFixed(1)}ms worst ${worst.toFixed(0)}ms; ${JSON.stringify(how)}`);

// スカルキング: CPU self-play. Plays whole games between CPU levels and reports average scores, bid accuracy and
// thinking time, so a change to skull-king/ai.js can be checked for strength and speed.
//   node tools/skullking-selfplay.mjs [games=12] [players=4] [levels=easy,normal,hard,hard] [--opts=kraken,whale,loot,abilities,rascal,cannon]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(root, 'skull-king/engine.js'));
const AI = require(path.join(root, 'skull-king/ai.js'));

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const GAMES = +(args[0] || 12), N = +(args[1] || 4);
const LEVELS = (args[2] || 'easy,normal,hard,hard').split(',');
const optList = (flags.find((f) => f.startsWith('--opts=')) || '').slice(7).split(',').filter(Boolean);
const opts = { kraken: optList.includes('kraken'), whale: optList.includes('whale'), loot: optList.includes('loot'), abilities: optList.includes('abilities'),
  scoring: optList.includes('rascal') ? 'rascal' : 'classic', cannon: optList.includes('cannon') };

const stat = {};
const times = { bid: [], play: [], ability: [] };
let seed = 12345;
for (let g = 0; g < GAMES; g++) {
  // rotate the seats so no level keeps the same position
  const seatLevels = Array.from({ length: N }, (_, i) => LEVELS[(i + g) % LEVELS.length]);
  const st = E.newGame({ players: seatLevels.map((l, i) => ({ name: l + i })), opts, seed: seed++ });
  let guard = 0;
  while (!st.over && guard++ < 5000) {
    const who = E.actors(st);
    const seat = who[0];
    const v = E.view(st, seat);
    const t0 = performance.now();
    let a = AI.choose(v, { level: seatLevels[seat], seed: seed++ });
    times[v.phase === 'bid' ? 'bid' : v.phase === 'play' ? 'play' : 'ability'].push(performance.now() - t0);
    if (!a || !E.apply(st, seat, a)) { console.log('illegal CPU action', seatLevels[seat], v.phase, JSON.stringify(a)); a = E.legal(st, seat)[0]; E.apply(st, seat, a); }
  }
  st.history.forEach((h) => h.results.forEach((r) => {
    const l = seatLevels[r.seat];
    const s = stat[l] || (stat[l] = { score: 0, seats: 0, rounds: 0, hits: 0, wins: 0 });
    s.rounds++; if (r.hit) s.hits++;
  }));
  st.scores.forEach((sc, i) => { const s = stat[seatLevels[i]]; s.score += sc; s.seats++; });
  st.ranking.filter((r) => r.place === 1).forEach((r) => { stat[seatLevels[r.seat]].wins++; });
}
const pct = (a) => { if (!a.length) return '-'; const s = a.slice().sort((x, y) => x - y); return `median ${s[Math.floor(s.length / 2)].toFixed(1)}ms, p95 ${s[Math.floor(s.length * 0.95)].toFixed(1)}ms, max ${s[s.length - 1].toFixed(1)}ms`; };
console.log(`${GAMES} games, ${N} players, options ${JSON.stringify(opts)}`);
for (const [l, s] of Object.entries(stat)) console.log(`${l.padEnd(7)} avg score ${(s.score / s.seats).toFixed(1).padStart(6)}  bid hit ${(100 * s.hits / s.rounds).toFixed(0)}%  wins ${s.wins}/${s.seats}`);
for (const k of Object.keys(times)) console.log(`${k.padEnd(8)} ${pct(times[k])}`);

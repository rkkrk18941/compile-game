// PLAYROOM: offline tuning of a game's 最強 values with the learning rival's practice games.
//   node tools/rival-offline-tune.mjs <game> [minutes] [players]
//   game: ticket-to-ride | black-friday | gensou-seven | skull-king | cryptid | hatatori-nine | nanafushigi
// Runs the same careful hill climb the 成長する敵 uses after a loss (assets/rival-tune.js), but for many minutes,
// then checks the result against the starting values on fresh seeds and prints the values to paste into the AI.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = require(path.join(root, 'assets/rival-tune.js'));
const game = process.argv[2], minutes = +process.argv[3] || 10, players = +process.argv[4] || 0;
const G = {
  'ticket-to-ride': () => { require(path.join(root, 'ticket-to-ride/map.js')); const AI = require(path.join(root, 'ticket-to-ride/ai.js')); return { AI, base: AI.growBase(), space: AI.GROW_SPACE, n: players || 2, tune: { minPairs: 30, maxPairs: 400 } }; },
  'black-friday': () => { const AI = require(path.join(root, 'black-friday/ai.js')); return { AI, base: AI.GROW_BASE, space: AI.GROW_SPACE, n: players || 3, tune: { minPairs: 40, maxPairs: 600 } }; },
  'skull-king': () => { const AI = require(path.join(root, 'skull-king/ai.js')); return { AI, base: AI.GROW_BASE, space: AI.GROW_SPACE, n: players || 4, tune: { minPairs: 20, maxPairs: 200 } }; },
  'cryptid': () => { const AI = require(path.join(root, 'cryptid/ai.js')); return { AI, base: AI.GROW_BASE, space: AI.GROW_SPACE, n: players || 3, tune: { minPairs: 30, maxPairs: 300 } }; },
  'gensou-seven': () => { const AI = require(path.join(root, 'gensou-seven/ai.js')); return { AI, base: AI.GROW_BASE, space: AI.GROW_SPACE, n: players || 4, tune: { minPairs: 10, maxPairs: 60 } }; },
  'hatatori-nine': () => { const AI = require(path.join(root, 'hatatori-nine/ai.js')); return { AI, base: AI.GROW_BASE, space: AI.GROW_SPACE, n: players || 24, tune: { minPairs: 30, maxPairs: 300 } }; },   // n = futures per decision
  'nanafushigi': () => { const AI = require(path.join(root, 'nanafushigi/ai.js')); return { AI, base: AI.GROW_BASE, space: AI.GROW_SPACE, n: players || 3, tune: { minPairs: 30, maxPairs: 300 } }; }   // n = level of the practice players
}[game];
if (!G) { console.error('unknown game ' + game); process.exit(2); }
const g = G();
const play = (a, b, seed, swap) => g.AI.practice(a, b, seed, swap, g.n);
const t0 = Date.now();
const res = T.run(Object.assign({ params: g.base, space: g.space, timeMs: minutes * 60000, seed: 20261021 }, g.tune), play,
  (p) => { if (p.tried % 10 === 0) process.stdout.write(`\r${((Date.now() - t0) / 1000).toFixed(0)}s games ${p.games} tried ${p.tried} accepted ${p.accepted}   `); });
console.log('\nresult', JSON.stringify(res.params));
const diff = Object.keys(res.params).filter((k) => res.params[k] !== g.base[k]).map((k) => `${k}: ${g.base[k]} → ${res.params[k]}`);
console.log('changes', diff.join(', ') || 'none');
// independent check
let pts = 0, n = 0;
const pairs = +process.env.CHECK || 600;
for (let i = 0; i < pairs; i++) { const sd = 77700000 + i; pts += play(res.params, g.base, sd, false) + play(res.params, g.base, sd, true); n += 2; }
console.log(`check on ${n} fresh games: new vs start ${(pts / n).toFixed(3)}`);

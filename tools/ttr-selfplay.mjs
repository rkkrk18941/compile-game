// チケット・トゥ・ライド: CPU against CPU.  node tools/ttr-selfplay.mjs [games] [levels e.g. 3,2,1]
// Reports win rates and scores by level, and fails if the CPU ever picks an illegal move or a game stalls.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../ticket-to-ride/engine.js');
const AI = require('../ticket-to-ride/ai.js');

const games = Number(process.argv[2] || 200);
const levels = (process.argv[3] || '3,2').split(',').map(Number);
const n = levels.length;
const stat = levels.map(() => ({ wins: 0, total: 0, route: 0, plus: 0, minus: 0, done: 0, tix: 0, bonus: 0, trainsLeft: 0 }));
let illegal = 0, stalls = 0, turns = 0, ms = 0;
for (let g = 0; g < games; g++) {
  const seat = levels.map((_, i) => (i + g) % n);   // rotate seats so nobody always goes first
  const lv = seat.map((i) => levels[i]);
  const s = E.newGame({ n, seed: 777 + g });
  const rngs = lv.map((_, p) => E.mulberry32(9000 + g * 7 + p));
  const t0 = Date.now();
  for (let p = 0; p < n; p++) {
    const a = AI.choose(E.viewFor(s, p), lv[p], rngs[p]);
    const r = E.apply(s, Object.assign({ p }, a));
    if (!r.ok) { illegal++; E.apply(s, { p, t: 'keep', keep: s.pl[p].offer.slice() }); }
  }
  let steps = 0;
  while (s.phase === 'play' && steps++ < 4000) {
    const p = s.turn;
    const a = AI.choose(E.viewFor(s, p), lv[p], rngs[p]);
    let r = a ? E.apply(s, Object.assign({ p }, a)) : { ok: false, err: 'null' };
    if (!r.ok) { illegal++; if (illegal < 6) console.log('illegal', JSON.stringify(a), r.err); r = E.apply(s, Object.assign({ p }, E.legalActions(s)[0])); }
  }
  ms += Date.now() - t0;
  if (s.phase !== 'over') { stalls++; continue; }
  turns += s.turns;
  s.result.rows.forEach((row) => {
    const st = stat[seat[row.p]];
    st.total += row.total; st.route += row.route; st.plus += row.plus; st.minus += row.minus; st.done += row.done; st.tix += row.tix.length; st.bonus += row.bonus ? 1 : 0; st.trainsLeft += row.trains;
    if (row.rank === 1) st.wins += 1 / s.result.winners.length;
  });
}
const done = games - stalls;
console.log(`${games} games (${n} players, levels ${levels.join(' vs ')}), ${(turns / done).toFixed(1)} turns a game, ${(ms / games).toFixed(0)} ms a game`);
stat.forEach((st, i) => {
  const f = (x) => (x / done).toFixed(1);
  console.log(`level ${levels[i]}: wins ${(100 * st.wins / done).toFixed(0)}%  total ${f(st.total)}  routes ${f(st.route)}  tickets +${f(st.plus)} -${f(st.minus)} (${f(st.done)}/${f(st.tix)} done)  longest ${(100 * st.bonus / done).toFixed(0)}%  trains left ${f(st.trainsLeft)}`);
});
if (illegal || stalls) { console.log(`FAIL: ${illegal} illegal moves, ${stalls} stalled games`); process.exit(1); }
console.log('ok: no illegal moves, every game finished');

// Headless self-play: CPU ruins vs CPU explorers through the real HostSession.
// usage: node tests/sim.mjs [games=20] [ruinsLevel=normal] [explorerLevel=normal] [explorers=2]
import * as R from '../src/core/rules.js';
import { HostSession } from '../src/net/host.js';

const games = Number(process.argv[2] || 20);
const ruinsLevel = process.argv[3] || 'normal';
const exLevel = process.argv[4] || 'normal';
const exCount = Number(process.argv[5] || 2);

function playOne(i) {
  return new Promise((resolve) => {
    const st = R.createRoom({ roomCode: 'SAMPLEX', hostClientId: 'sim-host-0001', hostName: 'SIM', ruinsCpu: ruinsLevel });
    st.seats.find(s => s.clientId === 'sim-host-0001').cpu = exLevel;
    R.setOptions(st, { explorerCount: exCount, timePreset: process.env.PRESET || 'legacy' });
    const errors = [];
    const host = new HostSession(st, { speed: 0, persist: false, onError: (e) => errors.push(e) });
    R.beginSetup(st);
    host.syncAgents();
    host.changed();
    const started = Date.now();
    const timer = setInterval(() => {
      const timeout = Date.now() - started > 60000;
      if (st.stage === 'gameover' || timeout || errors.length) {
        clearInterval(timer);
        host.close();
        const agentErrors = [...host.agents.values()].reduce((a, s) => a + (s.errors || 0), 0);
        resolve({ i, winner: st.winner, reason: st.endReason, rounds: st.round, score: st.score, timeout, errors, agentErrors, stats: st.stats, ms: Date.now() - started });
      }
    }, 20);
  });
}

const results = [];
for (let i = 0; i < games; i++) {
  const r = await playOne(i);
  results.push(r);
  const tag = r.timeout ? 'TIMEOUT' : r.errors.length ? 'ERROR' : r.winner;
  console.log(`#${i} ${tag} reason=${r.reason} rounds=${r.rounds} score=${r.score ?? '-'} hits=${r.stats.hits}/${r.stats.attacks} super=${r.stats.superHits} enc=${r.stats.encounters} agentErr=${r.agentErrors} ${r.ms}ms`);
  if (r.errors.length) console.log(r.errors.map(e => e.stack || e).join('\n'));
}
const wins = results.filter(r => r.winner === 'explorers').length;
const reasons = results.reduce((m, r) => (m[r.reason] = (m[r.reason] || 0) + 1, m), {});
const agg = {}; for (const r of results) for (const [k, v] of Object.entries(r.stats.timeBy || {})) agg[k] = (agg[k] || 0) + v;
console.log('avg time spent by cause:', Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, (v / results.length).toFixed(1)])), 'avg hits', (results.reduce((a, r) => a + r.stats.hits + r.stats.superHits, 0) / results.length).toFixed(2), 'avg attacks', (results.reduce((a, r) => a + r.stats.attacks, 0) / results.length).toFixed(2));
console.log(`\nexplorers win ${wins}/${results.length} (${(wins / results.length * 100).toFixed(0)}%)  reasons=${JSON.stringify(reasons)}  avgRounds=${(results.reduce((a, r) => a + r.rounds, 0) / results.length).toFixed(1)}  timeouts=${results.filter(r => r.timeout).length} errors=${results.filter(r => r.errors.length).length}`);
process.exit(0);

/* Compares Bosses of the same act on the same parties. First the greedy bot (tools/ibara-bot.cjs) plays normal
   adventures with very high HP and the state just before each Boss room is saved; then every candidate Boss of
   that act is fought from each saved state (HP reset to the same high value), and the HP the party loses is
   recorded. Lower loss = easier Boss for the same decks. "kills" = how often the loss would have killed a
   full-HP character (loss per player >= 9).
   Run: node tools/ibara-boss-gauntlet.cjs [runsPerParty=6] [parties=R,G,B,W,S,RG,BW]
   Prints a table per act. Takes a few minutes. */
'use strict';
const sim = require('./ibara-bg-sim.cjs');
const bot = require('./ibara-bot.cjs');
const STS = sim.load();
const DF = STS.DF;
const HIGH = 200;

const ACT_BOSSES = {
  1: { base: ['Guardian', 'Hexaghost', 'SlimeBoss'], df: [] },
  2: { base: ['Automaton', 'Collector', 'Champ'], df: [] },
  3: { base: ['AwakenedOne', 'TimeEater', 'DonuDeca'], df: [] }
};
Object.keys(DF.BOSSES || {}).forEach((ch) => [1, 2, 3].forEach((a) => {
  const id = DF.bossOf(ch, a);
  if (id && ACT_BOSSES[a].base.indexOf(id) < 0 && ACT_BOSSES[a].df.indexOf(id) < 0) ACT_BOSSES[a].df.push(id);
}));

async function collect(parties, runs) {
  const snaps = { 1: [], 2: [], 3: [] };
  for (const party of parties) {
    for (let seed = 1; seed <= runs; seed++) {
      const taken = {};
      await bot.playSmart(STS, { players: party.split('').map((ch) => ({ ch })), asc: 0, seed: seed * 31 + party.length * 7 }, {
        mutate: (run) => run.players.forEach((p) => { p.hp = p.maxHp = HIGH; }),
        checkpoint: (snap) => {
          if (snap.phase === 'room' && snap.room && snap.room.t === 'B' && snap.room.step === 'enter' && !snap.combat && !taken[snap.act] && snap.act <= 3) {
            taken[snap.act] = true; snaps[snap.act].push({ party, seed, snap });
          }
        }
      }).catch((e) => { if (!/too many prompts/.test(e.message)) throw e; });
    }
  }
  return snaps;
}

async function main() {
  const runs = +(process.argv[2] || 6);
  const parties = (process.argv[3] || 'R,G,B,W,S,RG,BW').split(',');
  const t0 = Date.now();
  const snaps = await collect(parties, runs);
  console.log('saved states: act1 ' + snaps[1].length + ', act2 ' + snaps[2].length + ', act3 ' + snaps[3].length + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
  for (const act of [1, 2, 3]) {
    const list = ACT_BOSSES[act].base.concat(ACT_BOSSES[act].df);
    console.log('\nAct ' + act + '  (loss per player; same ' + snaps[act].length + ' saved parties for every Boss)');
    console.log('boss'.padEnd(16) + 'mean'.padStart(7) + 'median'.padStart(8) + 'p90'.padStart(7) + 'kills%'.padStart(8) + 'rounds'.padStart(8));
    for (const id of list) {
      const losses = [], rounds = [];
      let kills = 0;
      for (const s of snaps[act]) {
        const snap = JSON.parse(JSON.stringify(s.snap));
        snap.players.forEach((p) => { p.hp = p.maxHp = HIGH; });
        const r = await bot.fightFrom(STS, snap, id);
        const per = r.lost / r.players;
        losses.push(per); rounds.push(r.rounds || 0);
        if (per >= 9) kills++;
      }
      losses.sort((a, b) => a - b);
      const mean = losses.reduce((a, b) => a + b, 0) / Math.max(1, losses.length);
      const med = losses[Math.floor(losses.length / 2)] || 0, p90 = losses[Math.floor(losses.length * 0.9)] || 0;
      const rm = rounds.reduce((a, b) => a + b, 0) / Math.max(1, rounds.length);
      const tag = ACT_BOSSES[act].df.indexOf(id) >= 0 ? '*' : ' ';
      console.log((tag + id).padEnd(16) + mean.toFixed(1).padStart(7) + med.toFixed(1).padStart(8) + p90.toFixed(1).padStart(7) + (100 * kills / Math.max(1, losses.length)).toFixed(0).padStart(8) + rm.toFixed(1).padStart(8));
    }
  }
  console.log('\n* = Downfall Boss. ' + Math.round((Date.now() - t0) / 1000) + 's');
}
main().catch((e) => { console.error(e); process.exit(1); });

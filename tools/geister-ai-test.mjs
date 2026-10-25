// ガイスター: CPU tests, run from tools/geister-rules-test.mjs (which passes its helpers in).
export default async function ({ E, AI, ok, eq, QUICK, place, started, S }) {
  const rng = E.mulberry32(99);
  const remove = (s, id) => { const x = s.g[id]; if (x.at >= 0) s.board[x.at] = -1; x.at = -1; x.st = 'cap'; };

  /* every move the CPU makes is legal, at every level, from a view without the opponent's colours */
  for (let level = 1; level <= 5; level++) {
    for (let seed = 1; seed <= (QUICK ? 3 : 8); seed++) {
      const r = E.mulberry32(seed * 31 + level);
      const s = E.newGame({ seed, limit: 60 });
      E.setup(s, 0, AI.setupFor(level, r)); E.setup(s, 1, E.randomLayout(r));
      let bad = false;
      while (s.phase === 'play') {
        const v = E.viewFor(s, s.turn);
        if (v.g.some((x) => x.o !== s.turn && x.st === 'on' && x.good !== null)) bad = true;
        const a = AI.choose(v, s.turn === 0 ? level : 2, r, { ms: 40 });
        if (!a || !E.apply(s, s.turn, a).ok) { bad = true; break; }
      }
      ok(!bad, `level ${level}, game ${seed}: the CPU only makes legal moves from its own view`);
    }
  }

  /* a good ghost on its exit leaves */
  {
    const s = started();
    place(s, 1, S(0, 5));                          // player 0, good, on a far corner
    eq(AI.choose(E.viewFor(s, 0), 3, rng), { f: S(0, 5), t: E.EXIT }, 'the CPU leaves through the exit when it can');
  }
  /* an opponent's ghost on the CPU's corner must be dealt with */
  {
    const s = started([1, 1, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0, 0], 1);
    place(s, 9, S(5, 0));                          // player 1's ghost 9 stands on player 1's exit (5,0)
    s.turn = 0;                                    // and player 0 (the CPU here) must take it now
    const a = AI.choose(E.viewFor(s, 0), 4, rng, { ms: 300 });
    eq(a.t, S(5, 0), 'the CPU captures a ghost that is about to leave');
  }
  /* it races a good ghost home when nobody can stop it */
  {
    const s = started();
    for (const id of [8, 9, 10, 12, 13, 14]) remove(s, id);             // player 1 keeps one good, one bad, far away
    place(s, 11, S(3, 5)); place(s, 15, S(2, 4));
    place(s, 2, S(2, 0));                                               // player 0's good ghost, two steps from (0,0)
    const a = AI.choose(E.viewFor(s, 0), 3, rng, { ms: 300 });
    eq([a.f, a.t], [S(2, 0), S(1, 0)], 'the CPU runs for the free exit');
  }
  /* reading colours */
  {
    const s = started();
    const v = E.viewFor(s, 0);
    const b = AI.beliefs(v, 0, {}, 4);
    const ids = Object.keys(b).map(Number);
    eq(ids.length, 8, 'a chance for each of the opponent\'s ghosts');
    ok(Math.abs(ids.reduce((t, id) => t + b[id], 0) - 4) < 0.05, 'the chances add up to the good ghosts left');
    ok(ids.every((id) => Math.abs(b[id] - 0.5) < 0.01), 'before any move every ghost is a coin toss');
    // a ghost that sits on its exit without leaving must be bad
    const t = started([1, 1, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0, 0], 1);
    place(t, 12, S(4, 0));                                             // player 1's bad ghost next to its exit (5,0)
    t.turn = 1;
    E.apply(t, 1, { f: S(4, 0), t: S(5, 0) });                        // it steps onto the exit
    E.apply(t, 0, { f: S(4, 2), t: S(3, 2) });
    E.apply(t, 1, { f: S(1, 2), t: S(2, 2) });                        // and does not leave
    const bb = AI.beliefs(E.viewFor(t, 0), 0, {}, 4);
    ok(bb[12] < 0.1, 'a ghost that stayed on its exit is read as bad (' + bb[12].toFixed(2) + ')');
    const tot = Object.values(bb).reduce((x, y) => x + y, 0);
    ok(Math.abs(tot - 4) < 0.1, 'and the others share the good ones (' + tot.toFixed(2) + ')');
  }
  /* the rival learns habits from finished games */
  {
    let seen = null;
    for (let g = 0; g < 6; g++) {
      const s = started([1, 1, 1, 1, 0, 0, 0, 0], E.randomLayout(rng), 0);
      // the "human" (player 0) always runs its good ghosts forward
      let k = 0;
      while (s.phase === 'play' && k++ < 30) {
        const ms = E.legal(s, s.turn);
        let a = ms[Math.floor(rng() * ms.length)];
        if (s.turn === 0) { const fw = ms.filter((m) => m.t >= 0 && s.g[s.board[m.f]].good && m.t < m.f); if (fw.length) a = fw[0]; }
        E.apply(s, s.turn, a);
      }
      if (s.phase !== 'over') E.resign(s, 1);
      seen = AI.learnHabits(seen, E.viewFor(s, 0), 0);
    }
    eq(seen.games, 6, 'six games learned');
    ok(seen.slot[0].g === 6 && seen.slot[4].g === 0, 'it remembers where the good ghosts started');
    ok(seen.w.adv >= AI.READ.adv, 'and that ghosts which advance tend to be good (' + seen.w.adv.toFixed(3) + ')');
    ok(AI.habitNotes(seen).length > 0, 'it can say what it noticed: ' + AI.habitNotes(seen).join(' / '));
  }
  /* practice games for the rival's training */
  {
    const t0 = Date.now();
    const r1 = AI.practice(AI.GROW_BASE, AI.GROW_BASE, 12345, false, 2);
    const r2 = AI.practice(AI.GROW_BASE, AI.GROW_BASE, 12345, false, 2);
    ok([0, 0.5, 1].includes(r1), 'a practice game has a result');
    eq(r1, r2, 'practice games are repeatable');
    console.log('  practice game: ' + (Date.now() - t0) / 2 + ' ms');
  }
  /* stronger levels beat weaker ones (searches capped by node counts, so the result is the same on any machine) */
  if (!QUICK) {
    const budget = { 1: 800, 2: 3000, 3: 15000, 4: 150000 };
    // with these budgets 4 vs 3 wins about 70% (59-19 over 80 games); single 20-game stretches swing from 10-10 to 15-1
    const pairs = [[2, 1, 20], [3, 2, 20], [4, 3, 40]];
    for (const [hi, lo, n] of pairs) {
      let win = 0, lose = 0, draw = 0, plies = 0, ms = 0;
      for (let i = 0; i < n; i++) {
        const swap = i % 2 === 1, seats = swap ? [lo, hi] : [hi, lo];
        const r = AI.duel(seats[0], seats[1], 7000 + 10 * hi + i, { extra: seats.map((lv) => ({ noTime: true, nodes: budget[lv] })) });
        const hiSeat = swap ? 1 : 0;
        if (r.winner === -1) draw++; else if (r.winner === hiSeat) win++; else lose++;
        plies += r.ply; ms += r.avgMs[hiSeat];
      }
      console.log(`  level ${hi} vs ${lo}: ${win}-${lose}-${draw}, ${Math.round(plies / n)} moves a game, ${Math.round(ms / n)} ms a move`);
      ok(win > lose + 2, `level ${hi} beats level ${lo} (${win}-${lose}-${draw})`);
    }
  }
}

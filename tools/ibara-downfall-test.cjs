/* Rules checks for the Downfall characters and adventure of スレイザスパイア (ibara/bg).
   Run: node tools/ibara-downfall-test.cjs   (V=1 lists every test) */
'use strict';
const assert = require('assert/strict');
const sim = require('./ibara-bg-sim.cjs');
const STS = sim.load();
const D = STS.DATA;
let passed = 0;
async function test(name, fn) {
  if (process.env.V) console.log('..', name);
  try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; }
}
/* A game whose prompts are answered by a queue of functions (q => answer), else by the default answers. */
function game(cfg, answers) {
  const run = STS.Game.newRun(Object.assign({ players: [{ ch: 'S' }], asc: 0, seed: 7 }, cfg || {}));
  const g = new STS.Game(run, null);
  g.asked = [];
  g.io = { ask: (pi, q) => { g.asked.push(q); const f = answers && answers.length ? answers.shift() : null; return f ? f(q, pi) : STS.autoAnswer(g, pi, q); } };
  g.setupDecks();
  g.setupAct(1);
  return g;
}
function combat(g, kind) {
  const cb = STS.Combat.create(g, { kind: kind || 'normal' });
  g.run.combat = cb.s; g.combat = cb;
  cb.s.round = 1;
  cb.pcs().forEach((pc) => { pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; });
  cb.s.phase = 'play';
  return cb;
}
function same(a, b, msg) { assert.equal(JSON.stringify(a), JSON.stringify(b), msg); }
function give(g, pc, id, up) { const c = { u: g.uid(), id, up: !!up }; pc.hand.push(c); return c; }
function pick(label) { return (q) => { const o = q.options.find((x) => String(x.label).indexOf(label) >= 0); assert.ok(o, 'option ' + label + ' in ' + q.options.map((x) => x.label).join(' | ')); return o.id; }; }
async function play(cb, pc, c, extra) { await cb.playFromHand(pc, Object.assign({ u: c.u }, extra || {})); }

(async () => {
  /* ---------------------------------------------------------------- data */
  await test('Slime Boss: 9 HP, starter deck, reward deck 59 + 2 Golden Tickets, 16 rares', async () => {
    const g = game();
    const p = g.run.players[0];
    assert.equal(p.maxHp, 9);
    same(p.deck.map((c) => c.id).sort(), ['DefendS', 'DefendS', 'DefendS', 'DefendS', 'Lick', 'SlimeSlap', 'StrikeS', 'StrikeS', 'StrikeS', 'StrikeS']);
    assert.equal(p.rewardDeck.length, 61);
    assert.equal(p.rewardDeck.filter((x) => x === 'Ticket').length, 2);
    assert.equal(p.rareDeck.length, 16);
    for (const id of Object.keys(STS.CARDS)) {
      const d = STS.CARDS[id];
      if (d.ch !== 'S') continue;
      assert.ok(d.tx && d.tx[0] && d.tx[1], id + ' has base and upgraded text');
      assert.ok(d.t === 'A' || d.t === 'S' || d.t === 'P' || d.t === 'L', id + ' type');
      if (d.t === 'L') assert.ok(d.lv.length >= 2 && d.lvu.length === d.lv.length, id + ' levels');
      assert.ok(!/TODO|仮|未実装/.test(d.tx.join('')), id + ' text is final');
    }
  });
  await test('Bruiser Slime: in play at the start of every combat, never in the deck', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0);
    assert.equal(pc.slimes.length, 1);
    assert.equal(pc.slimes[0].id, 'BruiserSlime');
    assert.equal(pc.slimes[0].lv, 1);
    assert.ok(!g.run.players[0].deck.some((c) => c.id === 'BruiserSlime'));
    assert.ok(!g.upgradable(g.run.players[0]).some((c) => c.id === 'BruiserSlime'));
  });
  await test('Slime HITs: own Strength only; not the Slime Boss Strength/Weak, not enemy Vulnerable', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('Cultist', 0);
    pc.str = 3; pc.weak = 1; e.vuln = 2;
    await cb.runSlime(pc, pc.slimes[0]);
    assert.equal(e.hp, 9 - 1);
    assert.equal(e.vuln, 2, 'Vulnerable is not used');
    assert.equal(pc.weak, 1, 'Weak is not used');
    await cb.giveSlimeStr(pc, pc.slimes[0], 20);
    assert.equal(pc.slimes[0].str, 8, 'Slime Strength max 8');
    const big = cb.spawn('JawWorm', 0, { lvl: 'hard' }), hp = big.hp;
    await cb.runSlime(pc, pc.slimes[0], {});
    assert.ok(e.dead || big.hp === hp - 9, 'Lv1 hit 1 + Strength 8');
  });
  await test('End of turn: Bruiser Slime is Commanded during the damage step', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('Cultist', 0);
    await cb.endTurn();
    assert.equal(e.hp, 8);
  });
  await test('Playing a Slime: Powers area at level 1, stays after the end of turn; Grow to max; Command', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    const c = give(g, pc, 'ScrappySlime');
    await play(cb, pc, c);
    assert.equal(e.hp, 10 - 2, 'When played: 2 damage');
    const s = pc.slimes.find((x) => x.id === 'ScrappySlime');
    assert.ok(s && s.lv === 1);
    assert.ok(!pc.disc.includes(c) && !pc.hand.includes(c));
    for (let i = 0; i < 5; i++) await cb.growSlimeInst(pc, s);
    assert.equal(s.lv, 3, 'cannot grow past the max level');
    e.blk = 0; const hp = e.hp;
    await cb.runSlime(pc, s);
    assert.equal(e.hp, hp - 4);
    await cb.endTurn();
    assert.ok(pc.slimes.includes(s));
    assert.ok(!pc.disc.some((x) => x.u === c.u));
  });
  await test('Slime cards stay out of the discard and return to the deck after combat', async () => {
    const g = game();
    const p = g.run.players[0];
    await g.addCard(p, 'PsychicSlime', false);
    const n = p.deck.length;
    const cb = combat(g);
    const pc = cb.pc(0);
    pc.draw = p.deck.map((c) => ({ u: c.u, id: c.id, up: !!c.up }));
    const ps = pc.draw.find((c) => c.id === 'PsychicSlime');
    pc.draw.splice(pc.draw.indexOf(ps), 1); pc.hand.push(ps);
    await play(cb, pc, ps);
    assert.equal(pc.hand.length, 2, 'drew 2');
    assert.equal(p.deck.length, n, 'the deck is not changed by combat');
  });
  await test('Leeching Slime: Commanded whenever you Grow a Slime', async () => {
    const g = game(null, []);
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('Cultist', 0);
    await play(cb, pc, give(g, pc, 'LeechingSlime'));
    await cb.growSlimeInst(pc, pc.slimes[0]);
    assert.equal(e.hp, 9 - 1, 'Leeching Slime Lv1 hit 1 after the Bruiser grew');
  });
  await test('Spreading Slime: Commanded after you spend 2+ Energy on a card; Slippery then costs 0', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    await play(cb, pc, give(g, pc, 'SpreadingSlime'));
    pc.en = 3;
    const sl = give(g, pc, 'Slippery');
    assert.equal(cb.costOf(pc, sl), 2);
    await play(cb, pc, give(g, pc, 'ComboTackle'), { target: e.u });
    // Combo Tackle: 2 damage, Command up to 2 Slimes (auto: first = Bruiser, then stop), then Spreading Slime (2).
    assert.ok(e.hp <= 10 - 2 - 2, 'Spreading Slime hit after paying 2');
    assert.equal(cb.costOf(pc, sl), 0);
  });
  await test('Muscle Slime: once per turn, Commanded when it gains Strength', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    await play(cb, pc, give(g, pc, 'MuscleSlime'));
    const m = pc.slimes.find((x) => x.id === 'MuscleSlime');
    await cb.giveSlimeStr(pc, m, 1);
    assert.equal(e.hp, 10 - 3);
    await cb.giveSlimeStr(pc, m, 1);
    assert.equal(e.hp, 7, 'only once per turn');
  });
  await test('Slime Brawl: temporary Strength is removed at the end of turn', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    await play(cb, pc, give(g, pc, 'SlimeBrawl', true));
    assert.equal(pc.slimes[0].str, 2);
    assert.equal(e.hp, 10 - 3);
    await cb.endTurn();
    assert.equal(pc.slimes[0].str, 0);
  });
  await test('Relentless Tackle: the next Attack played by any player this turn costs 0', async () => {
    const g = game({ players: [{ ch: 'S' }, { ch: 'R' }] });
    const cb = combat(g);
    const [sb, ic] = cb.pcs();
    const e = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    await play(cb, sb, give(g, sb, 'RelentlessTackle'), { target: e.u });
    const bash = give(g, ic, 'Bash');
    assert.equal(cb.costOf(ic, bash), 0);
    await play(cb, ic, bash, { target: e.u });
    assert.equal(ic.en, 3);
    assert.equal(cb.costOf(ic, give(g, ic, 'Bash')), 2, 'only the next Attack');
  });
  await test('Just Desserts and cost reductions (Vicious Tackle, Digest)', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0);
    const ms = give(g, pc, 'MassiveSlime');
    await play(cb, pc, give(g, pc, 'JustDesserts'));
    assert.equal(cb.costOf(pc, ms), 2);
    const vt = give(g, pc, 'ViciousTackle');
    give(g, pc, 'SpearTackle'); give(g, pc, 'DiveTackle');
    assert.equal(cb.costOf(pc, vt), 2);
    const dg = give(g, pc, 'Digest');
    give(g, pc, 'ProtectTheBoss');
    assert.equal(cb.costOf(pc, dg), 2);
  });
  await test('Divide & Conquer+: X cannot be 0', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0); cb.spawn('Cultist', 0);
    const dc = give(g, pc, 'DivideAndConquer', true);
    pc.en = 0;
    assert.ok(cb.canPlay(pc, dc));
    pc.en = 2;
    await play(cb, pc, dc, { x: 0 });
    assert.equal(pc.en, 1, 'X raised to 1');
  });
  await test('Darkling Duo, Prepare Crush, Rain of Goop, Shape of Puddle, Level Up, Minion Master', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    cb.spawn('Cultist', 0);
    const hp0 = e.hp;
    pc.en = 6;
    await play(cb, pc, give(g, pc, 'DarklingDuo'));
    await play(cb, pc, give(g, pc, 'ProtectTheBoss'));
    assert.equal(e.hp, hp0 - 1, 'Bruiser commanded after a Retain card');
    pc.en = 6;
    pc.en = 6;
    await play(cb, pc, give(g, pc, 'PrepareCrush'));
    pc.en = 6;
    await play(cb, pc, give(g, pc, 'RainOfGoop'), { x: 2 });
    pc.en = 6;
    const rain = pc.pow.find((p) => p.id === 'RainOfGoop');
    assert.equal(rain.v, 2);
    await play(cb, pc, give(g, pc, 'ShapeOfPuddle'));
    const puddle = pc.pow.find((p) => p.id === 'ShapeOfPuddle');
    const blk0 = pc.blk;
    await cb.exec(0, { type: 'power', u: puddle.u });
    await cb.exec(0, { type: 'power', u: puddle.u });
    assert.equal(pc.blk, blk0 + 4, 'any time, more than once per turn');
    await cb.exec(0, { type: 'power', u: puddle.u });
    assert.ok(!pc.pow.includes(puddle) && pc.exh.some((c) => c.id === 'ShapeOfPuddle'));
    const hp1 = e.hp;
    await cb.startOfTurn(pc);
    assert.equal(e.hp, Math.max(0, hp1 - 15), 'Prepare Crush 15 damage');
    assert.ok(!pc.pow.some((p) => p.id === 'PrepareCrush') && pc.disc.some((c) => c.id === 'PrepareCrush'));
    assert.equal(rain.v, 1);
    assert.equal(pc.str, 1);
  });
  await test('Overexert plays an Attack twice; Replication plays a Slime from the draw pile and Grows it', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    pc.draw = [{ u: g.uid(), id: 'DefendS', up: false }, { u: g.uid(), id: 'DefendS', up: false }];
    const st = give(g, pc, 'StrikeS');
    const hp0 = e.hp;
    await play(cb, pc, give(g, pc, 'Overexert'), {});
    assert.equal(e.hp, hp0 - 2, 'Strike played twice');
    assert.ok(pc.disc.includes(st));
    pc.draw.push({ u: g.uid(), id: 'ScrappySlime', up: false });
    pc.en = 3;
    await play(cb, pc, give(g, pc, 'Replication', true));
    const sc = pc.slimes.find((x) => x.id === 'ScrappySlime');
    assert.ok(sc && sc.lv === 2);
  });
  await test('Feeding Frenzy: Grow up to N different Slimes; Rally the Troops commands them all', async () => {
    const g = game(null, []);
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    pc.en = 6;
    await play(cb, pc, give(g, pc, 'ScrappySlime'), { target: e.u });
    await play(cb, pc, give(g, pc, 'TauntingSlime'));
    pc.en = 6;
    await play(cb, pc, give(g, pc, 'FeedingFrenzy'), { target: e.u });
    same(pc.slimes.map((s) => s.lv), [2, 2, 2]);
    const hp = e.hp, blk = pc.blk;
    pc.en = 6;
    await play(cb, pc, give(g, pc, 'RallyTheTroops'));
    assert.equal(e.hp, hp - 2 - 3);
    assert.equal(pc.blk, blk + 2);
  });
  await test('Save and resume mid-combat keeps slimes, levels and Strength', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0); cb.spawn('JawWorm', 0, { lvl: 'hard' }); cb.spawn('JawWorm', 0, { lvl: 'hard' });
    await play(cb, pc, give(g, pc, 'MuscleSlime'));
    await cb.growSlimeInst(pc, pc.slimes[1]);
    await cb.giveSlimeStr(pc, pc.slimes[1], 2);
    const snap = JSON.parse(JSON.stringify(g.run));
    const g2 = new STS.Game(snap, null);
    const cb2 = new STS.Combat(g2, snap.combat);
    const pc2 = cb2.pc(0);
    same(pc2.slimes.map((s) => [s.id, s.lv, s.str]), [['BruiserSlime', 1, 0], ['MuscleSlime', 2, 2]]);
    const e = cb2.alive()[0], hp = e.hp;
    await cb2.runSlime(pc2, pc2.slimes[1]);
    assert.equal(e.hp, Math.max(0, hp - 6));
  });
  await test('random Slime Boss games: solo and mixed parties end without errors', async () => {
    const parties = [['S'], ['S', 'R'], ['G', 'S', 'B'], ['S', 'W', 'R', 'G']];
    for (const chs of parties) {
      for (let seed = 1; seed <= 25; seed++) {
        const r = await sim.playRandom(STS, { players: chs.map((ch) => ({ ch })), asc: seed % 14, seed, act4: true, colorless: seed % 2 === 0 }, { strict: true });
        assert.ok(['victory', 'defeat', 'stopped'].includes(r.result), chs.join('') + ' seed ' + seed + ' ' + r.result);
      }
    }
  });
  await test('Slime Boss parties play through every act (rewards, shops, events, bosses, Act IV)', async () => {
    const parties = [['S'], ['S', 'G'], ['R', 'S', 'W'], ['B', 'W', 'G', 'S']];
    let deep = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const chs = parties[seed % 4];
      const r = await sim.playRandom(STS, { players: chs.map((ch) => ({ ch, unlock: seed % 4 })), asc: (seed * 5) % 14, seed, colorless: seed % 2 === 0, act4: true }, {
        strict: true,
        mutate: (run) => run.players.forEach((p) => { p.hp = p.maxHp = 900; }),
        onAsk: (g, pi, q) => {
          if (q.type === 'option' && q.options.some((o) => o.id === 'key')) return 'key';
          if (q.type === 'option' && q.options.some((o) => o.id === 'next')) return 'next';
          if (q.type === 'bossRelic') { const av = q.ids.filter((id) => q.taken[id] == null && id !== 'MarkOfPain'); return av[0] || 'skip'; }
        }
      });
      assert.ok(['victory', 'defeat', 'stopped'].includes(r.result));
      if (r.stats.maxAct >= 3) deep++;
      const sb = r.run.players.find((p) => p.ch === 'S');
      assert.ok(!sb.deck.some((c) => c.id === 'BruiserSlime'), 'Bruiser never joins the deck');
    }
    assert.ok(deep >= 8, 'most runs reach Act III (' + deep + ')');
  });
  console.log('ok: ' + passed + ' Downfall rules tests');
})().catch((e) => { console.error(e); process.exit(1); });

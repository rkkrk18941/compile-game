/* The Guardian's Gems (ibara/bg/df-gems.js) with stand-in Gems and stand-in Socket cards (the printed ones are
   not transcribed yet): reward drafting (2 Gems revealed, one attached, the rest to the bottom), the Merchant limit
   of 2 Socket cards, Gems for Transforms and other gains, removal returning the Gem, Gem effects in combat
   (Skill hits are the card's hits, Power hits are unaffected, copies repeat the Gem), saves, and the card view.
   Run: NODE_PATH=<dir with jsdom> node tools/ibara-downfall-gem-test.cjs */
'use strict';
const assert = require('assert/strict');
const fs = require('fs'), path = require('path');
const sim = require('./ibara-bg-sim.cjs');
let passed = 0;
async function test(name, fn) { if (process.env.V) console.log('..', name); try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
function same(a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); }

/* Stand-ins, registered into a fresh engine. */
function standIns(S) {
  const DF = S.DF, CARDS = S.CARDS;
  DF.GEMS = {}; // isolate the synthetic supply from the now-registered printed Gems
  DF.addGem('T_GemBlock', { name: '試験ジェム（盾）', tx: 'ブロック1。', copies: 3, play: (k) => k.blk(1) });
  DF.addGem('T_GemHit', { name: '試験ジェム（刃）', tx: '1ダメージ。', copies: 3, play: (k) => k.gemAtk([1]) });
  DF.addGem('T_GemDraw', { name: '試験ジェム（目）', tx: 'カードを1枚引く。', copies: 2, play: (k) => k.draw(1) });
  const card = (id, o) => { CARDS[id] = Object.assign({ id, ch: 'U', df: true, cu: o.c }, o); };
  card('T_SockSkill', { t: 'S', r: 'C', c: 1, socket: true, name: '試験ソケット（スキル）', tx: ['ブロック1。ソケット。', 'ブロック2。ソケット。'], play: (k) => k.blk(k.up ? 2 : 1) });
  card('T_SockPower', { t: 'P', r: 'U', c: 1, socket: true, name: '試験ソケット（パワー）', tx: ['ソケット。', 'ソケット。'], play: () => {} });
  card('T_Plain', { t: 'A', r: 'C', c: 1, name: '試験カード', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: (k) => k.atk([k.up ? 2 : 1]) });
  if (!S.DATA.CHARS.U) DF.addChar('U', { deck: ['StrikeR', 'StrikeR', 'StrikeR', 'DefendR', 'DefendR', 'T_SockSkill'] });
}
function freshGame(S, chs, o) {
  const run = S.Game.newRun({ players: (chs || ['U']).map((ch) => ({ ch })), asc: 0, seed: (o && o.seed) || 5 });
  const g = new S.Game(run, null);
  g.setupDecks(); g.setupAct(1);
  return { run, g };
}
function gemCount(g) {
  const n = {};
  g.gemDeck().forEach((id) => { n[id] = (n[id] || 0) + 1; });
  g.run.players.forEach((p) => p.deck.forEach((c) => { if (c.gem) n[c.gem] = (n[c.gem] || 0) + 1; }));
  const out = {};
  Object.keys(n).sort().forEach((k) => { out[k] = n[k]; });
  return out;
}
const TOTAL = { T_GemBlock: 3, T_GemDraw: 2, T_GemHit: 3 };

(async () => {
  const S = sim.load(); standIns(S);
  const DF = S.DF;

  await test('card reward: a Socket card among the revealed cards reveals 2 Gems; the chosen one is attached, the other goes to the bottom', async () => {
    const { run, g } = freshGame(S);
    const p = run.players[0];
    p.rewardDeck.push('T_Plain', 'T_SockSkill', 'T_Plain');
    const top = g.gemDeck().slice(-2).reverse();
    let shown = null;
    g.io = { ask: (pi, q) => {
      if (q.type === 'cardReward') { shown = q.gems; return q.cards.findIndex((c) => c.id === 'T_SockSkill'); }
      if (q.type === 'option' && q.gemPick) return q.options[1].id;
      return S.autoAnswer(g, pi, q);
    } };
    await g.cardReward(p, 'normal', 3);
    same(shown, top, 'the 2 top Gems are shown with the cards');
    const c = p.deck.filter((x) => x.id === 'T_SockSkill').pop();
    assert.equal(c.gem, top[1], 'the chosen Gem is attached');
    assert.equal(g.gemDeck()[0], top[0], 'the other Gem is at the bottom');
    assert.ok(!run.gemOffer || !run.gemOffer[0]);
    same(gemCount(g), TOTAL, 'no Gem lost or duplicated');
  });

  await test('card reward: skipping or taking a card without Socket returns both Gems; no Socket among the cards reveals none', async () => {
    for (const pick of ['skip', 'plain']) {
      const { run, g } = freshGame(S);
      const p = run.players[0];
      p.rewardDeck.push('T_Plain', 'T_SockSkill', 'T_Plain');
      const before = g.gemDeck().length;
      g.io = { ask: (pi, q) => q.type === 'cardReward' ? (pick === 'skip' ? -1 : q.cards.findIndex((c) => c.id === 'T_Plain')) : S.autoAnswer(g, pi, q) };
      await g.cardReward(p, 'normal', 3);
      assert.equal(g.gemDeck().length, before);
      same(gemCount(g), TOTAL);
    }
    const { run, g } = freshGame(S);
    const p = run.players[0];
    p.rewardDeck.push('T_Plain', 'T_Plain', 'T_Plain');
    let shown = 'x';
    g.io = { ask: (pi, q) => { if (q.type === 'cardReward') { shown = q.gems; return 0; } return S.autoAnswer(g, pi, q); } };
    await g.cardReward(p, 'normal', 3);
    assert.equal(shown, undefined);
  });

  await test('Merchant: 2 Gems for a card row with Sockets, at most 2 Socket cards bought, leftovers back to the Gem deck', async () => {
    const { run, g } = freshGame(S);
    const p = run.players[0];
    p.gold = 99;
    p.rewardDeck.push('T_SockSkill', 'T_SockSkill', 'T_SockSkill');
    run.room = { t: '$', step: 'enter', key: 'x' };
    let acts = 0, errors = [];
    g.io = { ask: (pi, q) => {
      if (q.type === 'shop') { acts++; return acts <= 3 ? { act: 'card', idx: acts - 1 } : { act: 'leave' }; }
      if (q.type === 'option' && q.gemPick) return q.options[0].id;
      return S.autoAnswer(g, pi, q);
    }, emit: (ev) => { if (ev.t === 'error') errors.push(ev.msg); } };
    await g.roomShop();
    const socketed = p.deck.filter((c) => c.id === 'T_SockSkill');
    assert.equal(socketed.length, 1 + 2, 'starter Socket card + 2 bought');
    assert.ok(socketed.slice(1).every((c) => c.gem), 'each bought card has a Gem');
    assert.ok(errors.some((m) => /2枚まで/.test(m)), 'third Socket card refused');
    same(gemCount(g), TOTAL, 'unused Gems returned');
  });

  await test('other gains reveal 1 Gem; removal and Transform return it to the bottom; upgrading keeps it', async () => {
    const { run, g } = freshGame(S);
    const p = run.players[0];
    const top = g.gemDeck()[g.gemDeck().length - 1];
    const c = await g.addCard(p, 'T_SockSkill', false);
    assert.equal(c.gem, top);
    c.up = true;
    assert.equal(c.gem, top, 'upgrade keeps the Gem');
    await g.removeCard(p, c);
    assert.equal(g.gemDeck()[0], top, 'returned to the bottom');
    assert.ok(!c.gem);
    const d = await g.addCard(p, 'T_SockSkill', false);
    p.rewardDeck.push('T_Plain');
    await g.transformCard(p, d);
    assert.ok(!p.deck.includes(d));
    same(gemCount(g), TOTAL);
  });

  await test('combat: the Gem resolves after the card; Skill Gem hits use Strength and Attack-Mode Vigor; Power Gem hits do not; copies repeat it', async () => {
    const { run, g } = freshGame(S);
    run.players[0].hp = run.players[0].maxHp = 50;
    const cb = S.Combat.create(g, { kind: 'normal' });
    run.combat = cb.s; g.combat = cb;
    const e = cb.spawn('Cultist', 0, {}); e.hp = e.max = 40;
    cb.s.phase = 'play'; cb.s.round = 1;
    const pc = cb.pc(0);
    pc.en = 6; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0 }; pc.mode = 'attack'; pc.vigor = 0; pc.vigorSpent = 0;
    pc.str = 2;
    pc.hand.push({ u: 801, id: 'T_SockSkill', up: false, gem: 'T_GemHit' });
    await cb.playFromHand(pc, { u: 801, target: e.u });
    assert.equal(e.hp, 40 - (1 + 2), 'Gem hit on a Skill: 1 + Strength 2');
    assert.ok(pc.blk >= 1, 'card Block first');
    pc.vigorSpent = 1;
    pc.hand.push({ u: 802, id: 'T_SockSkill', up: false, gem: 'T_GemHit' });
    await cb.playFromHand(pc, { u: 802, target: e.u });
    assert.equal(e.hp, 37 - (1 + 2 + 1), 'Attack Mode Vigor adds to the Gem hit');
    pc.vigorSpent = 0; pc.weak = 1; e.vuln = 1;
    pc.hand.push({ u: 803, id: 'T_SockPower', up: false, gem: 'T_GemHit' });
    const hp0 = e.hp;
    await cb.playFromHand(pc, { u: 803, target: e.u });
    assert.equal(e.hp, hp0 - 1, 'Power Gem hit: no Strength, Weak or Vulnerable');
    pc.weak = 0; e.vuln = 0;
    pc.t.sklPotion = 1;
    const blk0 = pc.blk;
    pc.hand.push({ u: 804, id: 'T_SockSkill', up: false, gem: 'T_GemBlock' });
    await cb.playFromHand(pc, { u: 804 });
    assert.equal(pc.blk - blk0, 4, 'card + Gem, played twice (Skill Potion)');
  });

  await test('Gems are kept by saves and copied into the combat piles', async () => {
    const { run, g } = freshGame(S);
    const p = run.players[0];
    const c = p.deck.find((x) => x.id === 'T_SockSkill');
    c.gem = g.revealGems(1)[0];
    const snap = JSON.parse(JSON.stringify(run));
    const g2 = new S.Game(snap, null);
    assert.equal(snap.players[0].deck.find((x) => x.u === c.u).gem, c.gem);
    const cb = S.Combat.create(g2, { kind: 'normal' }); snap.combat = cb.s; g2.combat = cb;
    cb.spawn('Cultist', 0, {});
    await cb.setup();
    const inDraw = cb.pc(0).draw.find((x) => x.u === c.u);
    assert.equal(inDraw.gem, c.gem);
  });

  await test('the Gem deck is shuffled between Acts and old saves build it from the unattached Gems', async () => {
    const { run, g } = freshGame(S, ['U'], { seed: 21 });
    const before = g.gemDeck().slice();
    g.setupAct(2);
    same(g.gemDeck().slice().sort(), before.slice().sort(), 'same Gems');
    assert.notEqual(JSON.stringify(g.gemDeck()), JSON.stringify(before), 'shuffled');
    delete run.decks.gems;
    run.players[0].deck.find((x) => x.id === 'T_SockSkill').gem = 'T_GemDraw';
    same(gemCount(g), TOTAL, 'rebuilt without the attached Gem');
  });

  await test('random runs with Socket cards keep every Gem exactly once (1–3 players)', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const chs = ['U', 'R', 'G'].slice(0, 1 + (seed % 3));
      let g0 = null;
      const r = await sim.playRandom(S, { players: chs.map((ch) => ({ ch })), asc: seed % 6, seed }, {
        strict: true,
        beforeStart: (g) => { g0 = g; g.run.players.forEach((p) => { p.hp = p.maxHp = 300; }); },
        onAsk: (g, pi, q) => { if (q.type === 'map' && g.run.act >= 2) throw new Error('stop'); }
      }).catch((e) => { if (e.message !== 'stop') throw e; return null; });
      if (!g0) continue;
      assert.ok(!g0.run.gemOffer || !Object.values(g0.run.gemOffer).some((l) => l && l.length), 'no Gem left on offer');
      same(gemCount(g0), TOTAL, 'seed ' + seed);
    }
  });

  await test('card view: a Gem badge and the Gem text in place of "Socket."; the reward note lists the revealed Gems', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('', { runScripts: 'outside-only' }), w = dom.window;
    const files = ['data', 'cards', 'items', 'monsters', 'events', 'combat', 'engine', 'df-data', 'df-mech', 'df-mech-guardian', 'df-mech-hexaghost', 'df-mech-hermit',
      'df-shard', 'df-gems', 'df-cards-slime', 'df-cards-hermit', 'df-items', 'df-run', 'df-bosses', 'help', 'ui-parts', 'help-ui', 'context-help', 'df-view'];
    for (const f of files) w.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', f + '.js'), 'utf8'));
    standIns(w.STS);
    const V = w.STS.View;
    const h = V.card({ u: 1, id: 'T_SockSkill', up: false, gem: 'T_GemHit' });
    assert.match(h, /class="dfgem"[^>]*>◆試験ジェム（刃）/);
    assert.match(h, /ジェム「試験ジェム（刃）」：1ダメージ。/);
    assert.doesNotMatch(h, /ソケット。/);
    assert.doesNotMatch(V.card({ u: 2, id: 'T_SockSkill', up: false }), /dfgem/);
    const note = V.dfGemOffer(['T_GemHit', 'T_GemDraw']);
    assert.match(note, /試験ジェム（刃）[\s\S]*試験ジェム（目）/);
    assert.equal(V.dfGemOffer([]), '');
  });

  console.log('ok: ' + passed + ' Gem tests (stand-in Gems and Socket cards)');
})().catch((e) => { console.error(e); process.exit(1); });

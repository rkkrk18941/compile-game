// ゲンソウ・セブン: rules test for gensou-seven/engine.js (and a short CPU self-play).
//   node tools/gensou-rules-test.mjs
// The expected values come from the WizKids rulebooks, the designer's rulings on BoardGameGeek and the test cases of
// the WizKids-endorsed scoring app. See gensou-seven/RULES.md for the sources.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(root, 'gensou-seven/engine.js'));
const AI = require(path.join(root, 'gensou-seven/ai.js'));

let pass = 0;
const failures = [];
function check(ok, msg) { if (ok) pass++; else { failures.push(msg); console.log('FAIL ' + msg); } }
const N = (name) => { const d = E.BY_NAME[name]; if (!d) throw new Error('no card ' + name); return d.n; };
const ids = (names) => names.map(N);
const score = (names, choice) => E.scoreHand(ids(names), choice || {}).total;
const idx = (names, name) => names.indexOf(name);

/* ------------------------------------------------------------------ the cards */
const CARDS = [
  ['Mountain', 'land', 9], ['Cavern', 'land', 6], ['Bell Tower', 'land', 8], ['Forest', 'land', 7], ['Earth Elemental', 'land', 4],
  ['Fountain of Life', 'flood', 1], ['Swamp', 'flood', 18], ['Great Flood', 'flood', 32], ['Island', 'flood', 14], ['Water Elemental', 'flood', 4],
  ['Rainstorm', 'weather', 8], ['Blizzard', 'weather', 30], ['Smoke', 'weather', 27], ['Whirlwind', 'weather', 13], ['Air Elemental', 'weather', 4],
  ['Wildfire', 'flame', 40], ['Candle', 'flame', 2], ['Forge', 'flame', 9], ['Lightning', 'flame', 11], ['Fire Elemental', 'flame', 4],
  ['Knights', 'army', 20], ['Elven Archers', 'army', 10], ['Light Cavalry', 'army', 17], ['Dwarvish Infantry', 'army', 15], ['Rangers', 'army', 5],
  ['Collector', 'wizard', 7], ['Beastmaster', 'wizard', 9], ['Necromancer', 'wizard', 3], ['Warlock Lord', 'wizard', 25], ['Enchantress', 'wizard', 5],
  ['King', 'leader', 8], ['Queen', 'leader', 6], ['Princess', 'leader', 2], ['Warlord', 'leader', 4], ['Empress', 'leader', 15],
  ['Unicorn', 'beast', 9], ['Basilisk', 'beast', 35], ['Warhorse', 'beast', 6], ['Dragon', 'beast', 30], ['Hydra', 'beast', 12],
  ['Warship', 'weapon', 23], ['Magic Wand', 'weapon', 1], ['Sword of Keth', 'weapon', 7], ['Elven Longbow', 'weapon', 3], ['War Dirigible', 'weapon', 35],
  ['Shield of Keth', 'artifact', 4], ['Gem of Order', 'artifact', 5], ['World Tree', 'artifact', 2], ['Book of Changes', 'artifact', 3], ['Protection Rune', 'artifact', 1],
  ['Shapeshifter', 'wild', 0], ['Mirage', 'wild', 0], ['Doppelgänger', 'wild', 0]
];
check(E.CARDS.length === 53, '53 cards');
CARDS.forEach(([name, suit, str], i) => {
  const d = E.BY_NAME[name];
  check(d && d.suit === suit && d.str === str && d.n === i + 1, `card ${name}: ${suit} ${str}`);
  check(d && d.ja && (d.b || d.p), `card ${name} has Japanese text`);
});
E.SUITS.forEach((s) => check(E.CARDS.filter((c) => c.suit === s).length === 5, 'five cards of ' + s));
check(E.CARDS.filter((c) => c.suit === 'wild').length === 3, 'three wild cards');
const penaltyCards = ['Swamp', 'Great Flood', 'Rainstorm', 'Blizzard', 'Smoke', 'Wildfire', 'Knights', 'Light Cavalry', 'Dwarvish Infantry', 'Warlock Lord', 'Empress', 'Basilisk', 'Dragon', 'Warship', 'War Dirigible'];
E.CARDS.forEach((d) => check(E.hasPenaltyPart(d.key) === penaltyCards.includes(d.en), `${d.en} ${penaltyCards.includes(d.en) ? 'has' : 'has no'} Penalty`));

/* ------------------------------------------------------------------ the WizKids-endorsed scoring app's own test cases */
const APP = [
  [['Blizzard', 'Great Flood', 'Elven Archers'], {}, 35],
  [['Smoke', 'Dwarvish Infantry', 'War Dirigible'], {}, 50],
  [['Candle', 'Smoke', 'Dwarvish Infantry', 'War Dirigible'], {}, 44],
  [['Knights', 'Dwarvish Infantry', 'Rangers', 'King', 'Queen', 'Sword of Keth', 'Shield of Keth'], {}, 265],
  [['Fountain of Life', 'Swamp', 'Great Flood', 'Island', 'Water Elemental', 'Rainstorm', 'Collector'], {}, 326],
  [['Forge', 'Elven Archers', 'King', 'Queen', 'Sword of Keth', 'Shield of Keth', 'Gem of Order'], {}, 351],
  [['Mountain', 'Great Flood', 'Smoke', 'Whirlwind', 'Air Elemental', 'Wildfire', 'Mirage'], { mirage: { n: N('Rainstorm') } }, 260, 'rulebook example I'],
  [['Bell Tower', 'Candle', 'Queen', 'Sword of Keth', 'Shield of Keth', 'Gem of Order', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Gem of Order'), s: 'wizard' } }), 380, 'rulebook example II'],
  [['Bell Tower', 'Candle', 'Necromancer', 'Warhorse', 'Sword of Keth', 'Shield of Keth', 'Gem of Order', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Bell Tower'), s: 'leader' } }), 397],
  [['Cavern', 'Bell Tower', 'Earth Elemental', 'Candle', 'Collector', 'Necromancer', 'Gem of Order', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Candle'), s: 'land' } }), 388],
  [['Bell Tower', 'Candle', 'Necromancer', 'Queen', 'Sword of Keth', 'Shield of Keth', 'Gem of Order', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Bell Tower'), s: 'army' } }), 388],
  [['Necromancer', 'Warlock Lord', 'King', 'Queen', 'Warlord', 'Empress', 'Shapeshifter', 'Doppelgänger'], (h) => ({ shapeshifter: { n: N('King') }, doppel: idx(h, 'Warlock Lord') }), -74],
  [['Basilisk', 'Doppelgänger'], { doppel: 0 }, 0, 'two Basilisks blank each other'],
  [['Dwarvish Infantry', 'Doppelgänger'], { doppel: 0 }, 26, 'two Dwarvish Infantries penalise each other'],
  [['Island', 'Blizzard', 'Wildfire', 'Basilisk'], (h) => ({ island: idx(h, 'Wildfire') }), 95, 'the Island clears even when blanked afterwards'],
  [['Water Elemental', 'Doppelgänger'], { doppel: 0 }, 23, 'Elementals count their Doppelgänger'],
  [['Collector', 'Beastmaster', 'Enchantress', 'Unicorn', 'Warhorse', 'Dragon', 'Hydra'], {}, 193, 'Collector scores two sets'],
  [['Collector', 'Shield of Keth', 'Gem of Order', 'Shapeshifter', 'Doppelgänger'], (h) => ({ shapeshifter: { n: N('Shield of Keth') }, doppel: idx(h, 'Shield of Keth') }), 20, 'Collector does not count duplicated names'],
  [['Elven Archers', 'King', 'Unicorn', 'Sword of Keth', 'Elven Longbow', 'Shield of Keth', 'Gem of Order'], {}, 206, 'Gem of Order scores two runs'],
  [['Shield of Keth', 'Gem of Order', 'Cavern', 'Earth Elemental', 'Rangers', 'Queen'], {}, 105, 'Gem of Order scores two identical runs'],
  [['Wildfire', 'Book of Changes', 'Rainstorm', 'Blizzard'], (h) => ({ book: { t: idx(h, 'Blizzard'), s: 'flood' } }), 11, 'blanking I'],
  [['Blizzard', 'Great Flood', 'Wildfire', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Blizzard'), s: 'beast' } }), 3, 'blanking II (a closed chain blanks itself)'],
  [['Book of Changes', 'Warship', 'Basilisk', 'Knights'], (h) => ({ book: { t: idx(h, 'Basilisk'), s: 'flood' } }), 73, 'blanking III'],
  [['Book of Changes', 'Warship', 'Dwarvish Infantry', 'Elven Archers'], (h) => ({ book: { t: idx(h, 'Dwarvish Infantry'), s: 'flood' } }), 56, 'blanking IV'],
  [['Book of Changes', 'Warship', 'Fountain of Life', 'Great Flood', 'Elven Archers'], (h) => ({ book: { t: idx(h, 'Great Flood'), s: 'wizard' } }), 82, 'blanking V'],
  [['Great Flood', 'Blizzard', 'Wildfire'], {}, 65, 'rulebook Q&A: without the Cavern the Flood is blanked'],
  [['Cavern', 'Great Flood', 'Blizzard', 'Wildfire'], {}, 62, 'rulebook Q&A: the Cavern clears the Blizzard first'],
  [['Great Flood', 'Blizzard', 'Wildfire', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Blizzard'), s: 'beast' } }), 3],
  [['Cavern', 'Great Flood', 'Blizzard', 'Wildfire', 'Book of Changes'], (h) => ({ book: { t: idx(h, 'Blizzard'), s: 'beast' } }), 9, 'cards of a closed chain do not blank anything else'],
  [['Book of Changes', 'Warship', 'War Dirigible', 'Light Cavalry', 'Air Elemental'], (h) => ({ book: { t: idx(h, 'War Dirigible'), s: 'flood' } }), 24],
  [['Book of Changes', 'Warship', 'War Dirigible'], (h) => ({ book: { t: idx(h, 'War Dirigible'), s: 'flood' } }), 61, 'War Dirigible needs no Army once the word Army is cleared'],
  [['Book of Changes', 'War Dirigible', 'Rangers'], (h) => ({ book: { t: idx(h, 'Rangers'), s: 'land' } }), 53, 'Rangers keep the Dirigible flying even as a Land'],
  [['Knights', 'War Dirigible', 'Smoke'], {}, 47, 'a blanked Smoke is no Weather for the Dirigible'],
];
APP.forEach(([names, ch, want, label]) => {
  const choice = typeof ch === 'function' ? ch(names) : ch;
  const r = E.scoreHand(ids(names), choice);
  check(r.total === want && !r.invalid.length, `${label || names.join(', ')} = ${want} (got ${r.total}${r.invalid.length ? ', invalid ' + r.invalid : ''})`);
});

/* ------------------------------------------------------------------ the rulebook examples, card by card */
{
  const h = ['Air Elemental', 'Smoke', 'Whirlwind', 'Mirage', 'Great Flood', 'Wildfire', 'Mountain'];
  const r = E.scoreHand(ids(h), { mirage: { n: N('Rainstorm') } });
  const pts = Object.fromEntries(r.cards.map((c, i) => [h[i], c.points]));
  check(pts['Air Elemental'] === 49 && pts.Smoke === 27 && pts.Whirlwind === 53 && pts.Mirage === 0 && pts['Great Flood'] === 32 && pts.Wildfire === 40 && pts.Mountain === 59,
    'rulebook example I card by card: ' + JSON.stringify(pts));
}

/* ------------------------------------------------------------------ the designer's rulings */
// Rangers clear the word Army, which Wildfire's text does not contain
check(score(['Wildfire', 'Rangers', 'Knights']) === 40, 'Wildfire blanks Rangers and Knights (no word Army on Wildfire)');
check(score(['Great Flood', 'Rangers', 'Knights', 'Princess']) === 32 + 5 + 20 + 2 + 16, 'Rangers protect Armies from the Great Flood');
check(score(['Basilisk', 'Rangers', 'Dwarvish Infantry']) === 35 + 5 + 15, 'Rangers protect Armies from the Basilisk and clear the Dwarves');
check(score(['Swamp', 'Warship', 'Knights', 'Candle', 'Princess']) === 18 - 3 + 23 + 20 + 2 + 2 + 8, 'Warship clears Army from the Swamp, not Flame');
// Wildfire is a Penalty: the Island and the Protection Rune clear it, the Doppelgänger copies it
check(score(['Wildfire', 'Island', 'King', 'Knights'], { island: 0 }) === 40 + 14 + 8 + 5 + 20, 'the Island clears the Wildfire');
check(score(['Wildfire', 'Protection Rune', 'King', 'Knights']) === 40 + 1 + 8 + 5 + 20, 'the Protection Rune clears the Wildfire');
check(score(['Wildfire', 'Doppelgänger', 'King'], { doppel: 0 }) === 80, 'a Doppelgänger copying Wildfire is a second Wildfire');
// the Warship's clear is a Bonus: not cleared, not copied
check(score(['Warship', 'Swamp', 'Knights', 'Protection Rune']) === 23 + 18 + 20 + 1, 'the Warship clears even next to the Protection Rune');
check(score(['Doppelgänger', 'Warship', 'Swamp', 'Knights'], { doppel: 1 }) === 23 + 23 + 18 + 12, 'a copied Warship needs a Flood too; the Swamp ignores Armies');
check(score(['Doppelgänger', 'Warship', 'Swamp', 'Knights', 'Great Flood'], { doppel: 1 }) === 23 + 23 + 18 + 12 + 32, 'the Warship keeps the Great Flood from blanking Armies');
// a blanked card has no name
check(score(['Wildfire', 'Bell Tower', 'Candle', 'Book of Changes', 'Collector']) === 40 + 2 + 3 + 7, 'a blanked Bell Tower has no name, so the Candle gets nothing');
check(score(['Great Flood', 'Bell Tower', 'Candle', 'Book of Changes', 'Collector']) === 32 + 3 + 7, 'the Great Flood blanks the Bell Tower and the Candle');
// with vs for each; "other"
check(score(['Forest', 'Unicorn', 'Hydra', 'Elven Archers']) === 7 + 36 + 9 + 12 + 10 + 5, 'Forest: +12 per Beast and +12 for Elven Archers');
check(score(['Forge', 'Sword of Keth', 'Magic Wand', 'Gem of Order']) === 9 + 27 + 7 + 1 + 5, 'Forge: +9 per Weapon and Artifact');
check(score(['Candle', 'Book of Changes', 'Bell Tower', 'Collector', 'Necromancer']) === 2 + 100 + 3 + 8 + 15 + 7 + 3, 'Candle with two Wizards');
check(score(['Elven Longbow', 'Elven Archers', 'Warlord', 'Beastmaster']) === 3 + 30 + 10 + 5 + 4 + 10 + 9, 'Elven Longbow gives +30 once');
// the Book of Changes lets a card give itself its own bonus, unless the text says "other"
check(score(['Dragon', 'Book of Changes'], { book: { t: 0, s: 'wizard' } }) === 33, 'a Dragon turned Wizard needs no other Wizard');
check(score(['King', 'Book of Changes'], { book: { t: 0, s: 'army' } }) === 8 + 5 + 3, 'a King turned Army counts himself');
check(score(['Earth Elemental', 'Forest', 'Cavern']) === 4 + 30 + 7 + 6, 'Earth Elemental counts only the other Lands');
// the Book only touches cards in the hand; Wild is one of the suits it can choose
check(score(['Blizzard', 'Swamp', 'Book of Changes'], { book: { t: 1, s: 'wild' } }) === 30 + 18 + 3 && score(['Blizzard', 'Swamp', 'Book of Changes']) === 33, 'the Book may make a card Wild, which the Blizzard does not blank');
// Mirage and Shapeshifter: any card in the game, or a generic card; base strength stays 0
check(score(['Mirage', 'Lightning'], { mirage: { n: N('Rainstorm') } }) === 41, 'Mirage as Rainstorm gives Lightning +30 but blanks nothing');
check(score(['Mirage', 'Collector', 'Swamp', 'Island'], { mirage: { g: 'flood' } }) === 0 + 7 + 10 + 18 + 14, 'a generic Flood counts as a different card for the Collector');
check(score(['Mirage', 'Collector', 'Swamp', 'Island'], { mirage: { n: N('Swamp') } }) === 7 + 18 + 14, 'a second Swamp does not');
check(score(['Shapeshifter', 'Candle', 'Bell Tower', 'Necromancer'], { shapeshifter: { n: N('Book of Changes') } }) === 2 + 100 + 8 + 15 + 3, 'Shapeshifter as Book of Changes completes the Candle');
// the order: Doppelgänger first, then Mirage and Shapeshifter, then the Book
check(score(['Doppelgänger', 'Basilisk', 'Book of Changes'], { doppel: 1, book: { t: 1, s: 'wizard' } }) === 35 + 3, 'the Doppelgänger copies the Basilisk as printed; the Book then turns the original into a Wizard that still blanks the copy');
check(score(['Mirage', 'Book of Changes', 'Candle', 'Collector'], { mirage: { n: N('Bell Tower') }, book: { t: 0, s: 'wizard' } }) === 0 + 3 + 102 + 7, 'Mirage as Bell Tower, then the Book makes it a Wizard (designer: legal)');
// Doppelgänger + World Tree: same suit twice
check(score(['World Tree', 'Doppelgänger', 'King'], { doppel: 2 }) === 2 + 8 + 8, 'Doppelgänger copies the suit, so no World Tree');
// Gem of Order and Collector are capped at what is printed
check(score(['Magic Wand', 'World Tree', 'Necromancer', 'Shield of Keth', 'Gem of Order', 'Queen', 'Sword of Keth', 'Bell Tower']) === 36 + 25 + 40 + 150 + 40 + 15, 'an eight-card run still scores +150');
check(score(['Collector', 'Beastmaster', 'Necromancer', 'Warlock Lord', 'Enchantress', 'Book of Changes', 'Dragon'], { book: { t: 6, s: 'wizard' } }) === 7 + 100 + 9 + 3 + 25 - 50 + 5 + 3 + 30, 'six Wizards still give the Collector +100');
// Gem of Order: wild cards count with 0
check(score(['Gem of Order', 'Mirage', 'Fountain of Life', 'World Tree', 'Book of Changes']) === 5 + 30 + 1 + 1 + 2 + 3, 'a run 0-1-2-3 counts the unused Mirage as 0');
// Fountain of Life: the best base strength among Weapons, Floods, Flames, Lands and Weather in the hand
check(score(['Fountain of Life', 'War Dirigible', 'Knights']) === 1 + 35 + 35 + 12, 'Fountain of Life adds the War Dirigible');
check(score(['Fountain of Life', 'Great Flood', 'Wildfire']) === 1 + 32 + 32, 'Fountain of Life ignores the blanked Wildfire');
// Island must clear a Penalty when it can
{
  const r = E.bestChoice(ids(['Island', 'Swamp', 'Knights', 'Fire Elemental']));
  check(r.choice && r.choice.island === 1, 'the Island always clears a Penalty when one is there');
}
// Wildfire blanks a wild card that has not become anything
check(score(['Wildfire', 'Mirage', 'World Tree', 'King']) === 40 + 2 + 50, 'Wildfire blanks an unused Mirage (and the King)');
// blanking order: cards not blanked by others first
check(score(['Wildfire', 'Basilisk', 'Unicorn']) === 40 + 9, 'Wildfire blanks the Basilisk before it can blank the Unicorn');
check(score(['Rainstorm', 'Wildfire', 'King']) === 8 + 8, 'Rainstorm blanks the Wildfire, which then blanks nothing');
check(score(['Basilisk', 'Doppelgänger', 'Knights'], { doppel: 0 }) === 20 - 8, 'two Basilisks blank each other and nothing else');
// self-blanking
check(score(['Smoke', 'Candle']) === 29 && score(['Smoke', 'King']) === 8, 'Smoke needs a Flame');
check(score(['Warship', 'Island']) === 37 && score(['Warship', 'Knights']) === 20 - 8, 'Warship needs a Flood');
check(score(['War Dirigible', 'Knights', 'Air Elemental']) === 20 - 8 + 4, 'War Dirigible is blanked by any Weather');
check(score(['War Dirigible', 'Knights', 'Protection Rune', 'Air Elemental']) === 35 + 20 + 1 + 4, 'the Protection Rune clears the Dirigible\'s Penalty');
// tie-break uses the copied base strength
check(E.scoreHand(ids(['Doppelgänger', 'Smoke', 'Candle']), { doppel: 1 }).baseTotal === 27 + 27 + 2, 'the base strength total counts what the Doppelgänger copied');

/* ------------------------------------------------------------------ the search for the best choices */
check(E.bestChoice(ids(['Mountain', 'Great Flood', 'Smoke', 'Whirlwind', 'Air Elemental', 'Wildfire', 'Mirage'])).total === 260, 'best choice finds the rulebook example I');
check(E.bestChoice(ids(['Bell Tower', 'Candle', 'Queen', 'Sword of Keth', 'Shield of Keth', 'Gem of Order', 'Book of Changes'])).total === 380, 'best choice finds the rulebook example II');
{
  // the Necromancer takes the best card from the discard area
  const hand = ids(['Bell Tower', 'Candle', 'Necromancer', 'Sword of Keth', 'Shield of Keth', 'Gem of Order', 'Book of Changes']);
  const r = E.bestFinal(hand, ids(['Warhorse', 'Hydra', 'Swamp', 'King']));
  check(r.total === 397 && r.necroPick === N('Warhorse'), 'the Necromancer adds the Warhorse for 397');
  const r2 = E.bestFinal(hand, ids(['Swamp', 'Island']));
  check(r2.necroPick == null && r2.ids.length === 7, 'the Necromancer takes only Armies, Leaders, Wizards and Beasts');
}
{
  // exhaustive check of the pruned search on random hands with one or two special cards
  const rand = E.rng(2026);
  const ALL = E.CARDS.map((c) => c.n), SPECIAL = ids(['Island', 'Book of Changes', 'Shapeshifter', 'Mirage', 'Doppelgänger']);
  let bad = 0, tried = 0;
  for (let k = 0; k < 160; k++) {
    const pool = ALL.slice(); E.shuffle(pool, rand);
    let h = pool.slice(0, 7);
    const sp = SPECIAL.slice(); E.shuffle(sp, rand);
    for (const s of sp.slice(0, 1 + (k % 2))) if (!h.includes(s)) h[Math.floor(rand() * 7)] = s;
    h = [...new Set(h)];
    const keyIdx = (key) => h.indexOf(E.BY_KEY[key].n);
    const di = keyIdx('doppelganger'), mi = keyIdx('mirage'), si = keyIdx('shapeshifter'), bi = keyIdx('bookOfChanges'), ii = keyIdx('island');
    const wild = (suits) => [null].concat(E.CARDS.filter((d) => suits.includes(d.suit)).map((d) => ({ n: d.n })), suits.map((g) => ({ g })));
    let best = -Infinity;
    for (const d of di >= 0 ? [null, ...h.map((_, i) => i).filter((i) => i !== di)] : [null])
      for (const m of mi >= 0 ? wild(E.MIRAGE_SUITS) : [null])
        for (const s of si >= 0 ? wild(E.SHAPESHIFTER_SUITS) : [null]) {
          const ch = {}; if (d != null) ch.doppel = d; if (m) ch.mirage = m; if (s) ch.shapeshifter = s;
          const books = [null];
          if (bi >= 0) { const pre = E.scoreHand(h, ch); for (let t = 0; t < h.length; t++) if (t !== bi) for (const su of E.ALL_SUITS) if (su !== pre.cards[t].suit) books.push({ t, s: su }); }
          for (const b of books) {
            const c2 = Object.assign({}, ch); if (b) c2.book = b;
            let isl = [null];
            if (ii >= 0) {
              const pre = E.scoreHand(h, c2), cand = [];
              for (let i = 0; i < h.length; i++) {
                const pen = i === di && c2.doppel != null ? E.hasPenaltyPart(E.BY_N[h[c2.doppel]].key) : E.hasPenaltyPart(E.BY_N[h[i]].key);
                if ((pre.cards[i].suit === 'flood' || pre.cards[i].suit === 'flame') && pen) cand.push(i);
              }
              if (cand.length) isl = cand;
            }
            for (const is of isl) { const c3 = Object.assign({}, c2); if (is != null) c3.island = is; best = Math.max(best, E.scoreHand(h, c3).total); }
          }
        }
    tried++;
    if (E.bestChoice(h, { fast: true }).total !== best) bad++;
  }
  check(bad === 0, `the pruned search equals trying every option (${tried} hands, ${bad} different)`);
}

/* ------------------------------------------------------------------ the game flow */
{
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], seed: 1, first: 0 });
  check(st.hands.every((h) => h.length === 7) && st.deck.length === 53 - 28 && !st.variant, 'basic game: seven cards each');
  const leg = E.legal(st);
  check(leg.length === 1 && leg[0].t === 'deck', 'the first player must draw from the deck');
  E.apply(st, { t: 'deck' });
  check(st.phase === 'discard' && st.hands[0].length === 8, 'after drawing: eight cards, discard one');
  let threw = false; try { E.apply(st, { t: 'discard', id: st.deck[0] }); } catch (e) { threw = true; }
  check(threw, 'a card that is not in the hand cannot be discarded');
  const d = st.hands[0][0];
  E.apply(st, { t: 'discard', id: d });
  check(st.turn === 1 && st.discard.length === 1 && st.hands[0].length === 7, 'the turn passes clockwise');
  E.apply(st, { t: 'take', id: d });
  E.apply(st, { t: 'discard', id: d });
  check(st.discard.length === 1 && st.discard[0] === d, 'a card taken from the discard area may be discarded again');
  // play to the end with deck draws: the game ends at exactly 10 discards
  let guard = 0;
  while (!st.over && guard++ < 100) { E.apply(st, { t: 'deck' }); E.apply(st, { t: 'discard', id: st.hands[st.turn][0] }); }
  check(st.over && st.discard.length === 10, 'the game ends when the discard area holds 10 cards');
  check(st.result.scores.length === 4 && st.result.winners.length >= 1, 'everyone is scored at the end');
  const top = st.result.scores[st.result.order[0]];
  check(st.result.winners.every((w) => st.result.scores[w].total === top.total), 'the winners have the top score');
}
{
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 3, first: 0, twoPlayerVariant: true });
  check(st.variant && st.hands.every((h) => h.length === 0) && st.deck.length === 53, 'two-player variant: no cards at the start');
  E.apply(st, { t: 'deck' });
  check(st.hands[0].length === 2 && st.drawn2 && st.drawn2.length === 2, 'collecting: draw two from the deck');
  const keep = st.hands[0].slice();
  const other = keep.find((n) => !st.drawn2.includes(n));
  check(other === undefined, 'both drawn cards are the new ones');
  check(E.legal(st).every((a) => a.t === 'discard' && st.drawn2.includes(a.id)), 'only one of the two drawn cards may be discarded');
  E.apply(st, { t: 'discard', id: st.drawn2[0] });
  check(st.hands[0].length === 1 && st.discard.length === 1 && st.turn === 1, 'one card kept, one discarded');
  E.apply(st, { t: 'take', id: st.discard[0] });
  check(st.hands[1].length === 1 && st.turn === 0 && st.phase === 'draw', 'collecting: taking a face-up card needs no discard');
  let guard = 0;
  while (!st.over && guard++ < 200) {
    const s = st.turn;
    E.apply(st, { t: 'deck' });
    const opts = E.legal(st);
    E.apply(st, opts[0]);
    check(st.hands[s].length <= 7, 'never more than seven cards between turns');
  }
  check(st.over && st.hands.every((h) => h.length === 7) && st.discard.length >= 12, 'two-player end: both hold seven and the discard area holds ' + st.discard.length);
}
{
  // a player who reaches seven by taking a card keeps all seven
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 5, first: 0, twoPlayerVariant: true });
  for (let i = 0; i < 12; i++) { E.apply(st, { t: 'deck' }); E.apply(st, { t: 'discard', id: st.drawn2[0] }); }
  check(st.hands[0].length === 6 && st.hands[1].length === 6, 'six cards each after six collecting turns');
  E.apply(st, { t: 'take', id: st.discard[0] });
  check(st.hands[0].length === 7 && st.turn === 1, 'the seventh card taken from the discard area is kept');
}
{
  // views never show what a seat may not see
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 8 });
  const v = E.view(st, 1);
  check(v.hand.length === 7 && v.hands === null && v.result === null && !('deck' in v && Array.isArray(v.deck)) && v.seed === undefined, 'a view shows only its own hand and no deck order or seed');
}

/* ------------------------------------------------------------------ CPU self-play */
{
  let games = 0, problems = 0;
  for (let g = 0; g < 12; g++) {
    const n = 2 + (g % 5);
    const st = E.newGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), seed: 500 + g, twoPlayerVariant: n === 2 ? g % 2 === 0 : undefined });
    let steps = 0;
    while (!st.over && steps++ < 1500) {
      const a = AI.choose(E.view(st, st.turn), { level: g % 3 ? 'normal' : 'easy' });
      if (!E.isLegal(st, a)) { problems++; break; }
      E.apply(st, a);
      const total = st.deck.length + st.discard.length + st.hands.reduce((s, h) => s + h.length, 0);
      if (total !== 53) { problems++; break; }
    }
    if (st.over) games++;
  }
  check(games === 12 && problems === 0, `CPUs finish 12 games with legal moves (${games} finished, ${problems} problems)`);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);

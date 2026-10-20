// ゲンソウ・セブン: compare gensou-seven/engine.js with the WizKids-endorsed scoring app on random hands.
//   git clone https://github.com/fantasy-realms/fantasy-realms.github.io /tmp/fr-app
//   node tools/gensou-official-diff.mjs /tmp/fr-app [cases=200000] [seed=7]
// The app (MIT) is loaded into a sandbox. Three places where this game follows the printed card text and the
// designer's rulings instead are patched first (see gensou-seven/RULES.md, "このアプリでの判断"):
//   1. Wildfire also blanks a wild card that has not become anything.
//   2. Forest gives +12 for each card named Elven Archers ("for each").
//   3. A card whose Penalty is cleared cannot blank anything, not even in a mutual blanking.
// Every case scores one hand with random legal choices; the totals and the blanked cards must match.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(root, 'gensou-seven/engine.js'));
const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'js/deck.js'))) { console.error('usage: node tools/gensou-official-diff.mjs PATH_TO_fantasy-realms.github.io [cases] [seed]'); process.exit(2); }
const CASES = +(process.argv[3] || 200000), SEED = +(process.argv[4] || 7);

let deck = fs.readFileSync(path.join(dir, 'js/deck.js'), 'utf8');
let hand = fs.readFileSync(path.join(dir, 'js/hand.js'), 'utf8');
function patch(src, a, b, what) { if (!src.includes(a)) { console.error('could not patch ' + what + ' (the app changed?)'); process.exit(2); } return src.replace(a, b); }
deck = patch(deck, "card.suit === 'artifact' || card.suit === 'wild' || card.name === 'Mountain'", "card.suit === 'artifact' || card.name === 'Mountain'", 'Wildfire');
deck = patch(deck, "return 12 * hand.countSuit('beast') + (hand.contains('Elven Archers') ? 12 : 0);", "return 12 * hand.countSuit('beast') + 12 * hand.countCardName('Elven Archers');", 'Forest');
hand = patch(hand, 'if (card.blanks !== undefined && card.blanks(by, this)) {', 'if (card.blanks !== undefined && !card.penaltyCleared && card.blanks(by, this)) {', 'mutual blanking');
const ctx = { console, jQuery: { i18n: { prop: (k) => k } }, cursedHoardSuits: false, cursedHoardItems: false };
vm.createContext(ctx);
vm.runInContext(deck + '\n' + hand + '\n;globalThis.__hand = hand;', ctx);
const H = ctx.__hand;
const fid = (n) => 'FR' + String(n).padStart(2, '0');
function official(ids, acts) {
  H.loadFromArrays(ids.map(fid), acts.map((a) => a.map((v) => (typeof v === 'number' ? fid(v) : v))));
  const total = H.score();
  return { total, size: H.size(), blanked: ids.map((n) => { const c = H.getCardById(fid(n)); return c ? !!c.blanked : null; }) };
}

const rand = E.rng(SEED);
const pick = (a) => a[Math.floor(rand() * a.length)];
const ALL = E.CARDS.map((c) => c.n), SPECIAL = [9, 49, 51, 52, 53], NECRO = E.BY_KEY.necromancer.n;
let cases = 0, mism = 0, withChoices = 0;
for (let k = 0; k < CASES; k++) {
  const size = rand() < 0.75 ? 7 : 1 + Math.floor(rand() * 7);
  const pool = ALL.slice(); E.shuffle(pool, rand);
  let ids = pool.slice(0, size);
  if (rand() < 0.5) { for (const s of SPECIAL) if (rand() < 0.35 && !ids.includes(s)) ids[Math.floor(rand() * ids.length)] = s; ids = [...new Set(ids)]; }
  if (ids.length === 7 && rand() < 0.25) {
    if (!ids.includes(NECRO)) ids[0] = NECRO;
    ids.push(pick(ALL.filter((n) => !ids.includes(n) && E.NECROMANCER_SUITS.includes(E.BY_N[n].suit))));
  }
  const at = (key) => ids.indexOf(E.BY_KEY[key].n);
  const ch = {}, acts = [];
  const di = at('doppelganger');
  if (di >= 0 && ids.length > 1 && rand() < 0.8) { let t; do { t = Math.floor(rand() * ids.length); } while (t === di); ch.doppel = t; acts.push([53, ids[t]]); }
  for (const [key, suits, num] of [['mirage', E.MIRAGE_SUITS, 52], ['shapeshifter', E.SHAPESHIFTER_SUITS, 51]]) {
    if (at(key) >= 0 && rand() < 0.8) { const c = pick(E.CARDS.filter((d) => suits.includes(d.suit))); ch[key] = { n: c.n }; acts.push([num, c.n]); }
  }
  const suits = E.scoreHand(ids, Object.assign({}, ch)).cards.map((c) => c.suit);
  const bi = at('bookOfChanges');
  if (bi >= 0 && ids.length > 1 && rand() < 0.8) {
    let t; do { t = Math.floor(rand() * ids.length); } while (t === bi);
    const s = pick(E.ALL_SUITS.filter((x) => x !== suits[t]));
    ch.book = { t, s }; acts.push([49, ids[t], s]); suits[t] = s;
  }
  const ii = at('island');
  if (ii >= 0 && rand() < 0.9) {
    const cand = [];
    for (let i = 0; i < ids.length; i++) {
      const pen = i === di && ch.doppel != null ? E.hasPenaltyPart(E.BY_N[ids[ch.doppel]].key) : E.hasPenaltyPart(E.BY_N[ids[i]].key);
      if ((suits[i] === 'flood' || suits[i] === 'flame') && pen) cand.push(i);
    }
    if (cand.length) { const t = pick(cand); ch.island = t; acts.push([9, ids[t]]); }
  }
  const off = official(ids, acts);
  if (off.size !== ids.length) continue;
  const mine = E.scoreHand(ids, ch);
  cases++; if (acts.length) withChoices++;
  if (off.total !== mine.total || off.blanked.some((b, i) => b !== mine.cards[i].blanked) || mine.invalid.length) {
    mism++;
    if (mism <= 10) console.log('different:', JSON.stringify({ hand: ids.map((n) => E.BY_N[n].en), choice: ch, app: off.total, engine: mine.total }));
  }
}
console.log(`${cases} hands (${withChoices} with wild cards, Book of Changes or Island in use): ${mism} different`);
process.exit(mism ? 1 : 0);

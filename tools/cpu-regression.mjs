import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dbMatch = source.match(/const D5=([^;]+);\s*const DB=({[\s\S]*?});\s*const HEX=/);
const cpuMatch = source.match(/<script id="skin-pro-cpu">([\s\S]*?)<\/script>/);
if (!dbMatch || !cpuMatch) throw new Error('CPU or card database script was not found.');
const dbContext = {};
vm.createContext(dbContext);
new vm.Script(`const D5=${dbMatch[1]};globalThis.DB=(${dbMatch[2]});`).runInContext(dbContext);
const DB = dbContext.DB;
const noop = () => {};
const protocols = (a, b, c) => [{ name: a, compiled: false }, { name: b, compiled: false }, { name: c, compiled: false }];
const player = names => ({ protocols: names, hand: [], deck: [], discard: [], lines: [[], [], []], noCompileNextTurn: false });

function createContext() {
  const ctx = {
    console, performance, G: null, draft: null, DB, PROTOCOLS: Object.keys(DB),
    document: { querySelector: () => null, getElementById: () => null },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    setTimeout, clearTimeout
  };
  for (const name of 'startDraft renderDraft startArrange finishSetup confirmAsk choose chooseLine chooseFieldCard chooseHandCards reorderProtocols privacyGate privacyReturn inspectSecretCard revealHandTo activateVisibleCard beforeCover triggerAfterDraw resolveStartPhase resolveEndPhase controlReleaseAndOptionalReorder moveCardPrompt promptPlayCard mainPlay mainRefresh showHandoff render renderSidebars openFieldAll newGame renderWelcome autosave toast log fxAtCard pace'.split(' ')) ctx[name] = noop;
  ctx.other = p => 1 - p;
  ctx.topCard = (p, line) => ctx.G.players[p].lines[line].at(-1) || null;
  ctx.fieldLocation = card => {
    for (let p = 0; p < 2; p++) for (let line = 0; line < 3; line++) {
      const stack = ctx.G.players[p].lines[line], index = stack.indexOf(card);
      if (index >= 0) return { player: p, line, index, covered: index < stack.length - 1 };
    }
    return null;
  };
  ctx.cardLocation = ctx.fieldLocation;
  ctx.sameStackHasDarkness2 = (p, line) => ctx.G.players[p].lines[line].some(card => !card.faceDown && card.protocol === 'DARKNESS' && card.value === 2);
  ctx.effectiveValue = card => {
    const loc = ctx.fieldLocation(card);
    return card.faceDown ? (loc && ctx.sameStackHasDarkness2(loc.player, loc.line) ? 4 : 2) : card.value;
  };
  ctx.stackTotal = (p, line) => ctx.G.players[p].lines[line].reduce((sum, card) => sum + ctx.effectiveValue(card), 0);
  ctx.allFieldCards = () => ctx.G.players.flatMap(side => side.lines.flat());
  ctx.isTop = card => { const loc = ctx.fieldLocation(card); return !!loc && !loc.covered; };
  ctx.topFaceUp = () => false;
  ctx.lineBlocked = () => false;
  ctx.faceDownBlocked = () => false;
  ctx.hasSpiritBypass = () => false;
  ctx.controlCardsEnabled = () => true;
  ctx.legalFaceUpLines = (p, card) => [0, 1, 2].filter(line => ctx.G.players[p].protocols[line].name === card.protocol || ctx.G.players[1 - p].protocols[line].name === card.protocol);
  ctx.legalFaceDownLines = () => [0, 1, 2];
  ctx.fieldChoiceCandidates = (title, filter) => {
    const out = [];
    for (let p = 0; p < 2; p++) for (let line = 0; line < 3; line++) ctx.G.players[p].lines[line].forEach((card, index, stack) => {
      const loc = { player: p, line, index, covered: index < stack.length - 1 };
      if (!loc.covered && filter(card, loc)) out.push({ card });
    });
    return out;
  };
  ctx.valuesForProtocol = name => Object.keys(ctx.DB[name] || {}).map(Number);
  ctx.sleep = () => Promise.resolve();
  ctx.T = card => (ctx.DB[card.protocol] || {})[card.value] || {};
  vm.createContext(ctx);
  new vm.Script(cpuMatch[1], { filename: 'skin-pro-cpu.js' }).runInContext(ctx);
  return ctx;
}
function game(ctx) {
  ctx.G = {
    mode: 'cpu', cpuLevel: 'invincible', cpuSeed: 19, cpuPlayer: 1, humanPlayer: 0,
    current: 1, turn: 1, finished: false, winner: null, control: null, compiled: [false, false],
    players: [player(protocols('FIRE', 'SPEED', 'METAL')), player(protocols('DEATH', 'LIGHT', 'METAL'))]
  };
  return ctx.G;
}

const ctx = createContext();
game(ctx);
assert.equal(ctx.COMPILE_CPU.levels.expert.label, '最強・公平');
assert.equal(ctx.COMPILE_CPU.levels.invincible.label, '最強・全知');
assert.equal(Object.keys(ctx.COMPILE_CPU._test.cardKnowledge()).length, 70);

ctx.G.players[1].hand = [
  { id: 'metal6-opening', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'metal1-opening', protocol: 'METAL', value: 1, faceDown: false }
];
assert.equal(ctx.COMPILE_CPU._test.chooseCurrentPlay('invincible', 11, 1).chosen.card, 'metal1-opening');

const finishCtx = createContext(); game(finishCtx);
finishCtx.G.players[1].lines[2] = [{ id: 'base4', protocol: 'METAL', value: 4, faceDown: false }];
finishCtx.G.players[1].hand = [
  { id: 'metal6-finisher', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'metal1-finisher', protocol: 'METAL', value: 1, faceDown: false }
];
assert.equal(finishCtx.COMPILE_CPU._test.chooseCurrentPlay('invincible', 11, 1).chosen.card, 'metal6-finisher');

const fiveCtx = createContext(); game(fiveCtx);
const opponentFive = { id: 'opponent-five', protocol: 'FIRE', value: 5, faceDown: false };
const cover = { id: 'cover', protocol: 'FIRE', value: 2, faceDown: false };
const opponentHiddenFive = { id: 'opponent-hidden-five', protocol: 'LIGHT', value: 5, faceDown: true };
const ownHiddenFive = { id: 'own-hidden-five', protocol: 'LIGHT', value: 5, faceDown: true };
const opponentSix = { id: 'opponent-six', protocol: 'METAL', value: 6, faceDown: false };
fiveCtx.G.players[0].hand = [{}, {}, {}, {}, {}];
fiveCtx.G.players[1].hand = [{}, {}, {}, {}, {}];
fiveCtx.G.players[0].lines = [[opponentFive, cover], [opponentSix], [opponentHiddenFive]];
fiveCtx.G.players[1].lines = [[], [ownHiddenFive], []];
const flips = Object.fromEntries(fiveCtx.COMPILE_CPU._test.currentTactics().flips.map(item => [item.card, item.score]));
assert.ok(flips['opponent-hidden-five'] > 0, 'CPU should expose an opposing hidden 5.');
assert.ok(flips['own-hidden-five'] < 0, 'CPU should avoid exposing its own hidden 5.');
const deletes = Object.fromEntries(fiveCtx.COMPILE_CPU._test.targetScores('カードを削除').map(item => [item.card, item.score]));
assert.ok(deletes.cover > deletes['opponent-six'], 'Uncovering an opposing 5 should outrank deleting a plain 6.');

const draftCtx = createContext(); game(draftCtx);
const decks = new Set();
for (let seed = 1; seed <= 20; seed++) decks.add(draftCtx.COMPILE_CPU._test.draftPlan([], 'invincible', seed).deck.join('/'));
assert.ok(decks.size >= 5, `Expected varied strategic decks, got ${decks.size}.`);

const visibilityCtx = createContext(); game(visibilityCtx);
visibilityCtx.G.players[1].hand = [{ id: 'visibility-card', protocol: 'METAL', value: 1, faceDown: false }];
const fair = visibilityCtx.COMPILE_CPU._test.chooseCurrentPlay('expert', 3, 1).search;
const oracle = visibilityCtx.COMPILE_CPU._test.chooseCurrentPlay('invincible', 3, 1).search;
assert.equal(fair.fullInfo, false);
assert.equal(oracle.fullInfo, true);

console.log(JSON.stringify({
  cards: 70, levels: ctx.COMPILE_CPU.levels, metal6: { opening: 'metal1-opening', finisher: 'metal6-finisher' },
  value5: { opponentHidden: flips['opponent-hidden-five'], ownHidden: flips['own-hidden-five'], uncoverBeatsSix: true },
  draftVariants: decks.size, visibility: { fair: fair.replyModel, oracle: oracle.replyModel }
}, null, 2));

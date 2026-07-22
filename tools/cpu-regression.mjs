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
  ctx.fieldCardsOf = p => ctx.G.players[p].lines.flat();
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
const cardCount = Object.values(DB).reduce((total, cards) => total + Object.keys(cards).length, 0);
for (const [protocol, cards] of Object.entries(DB)) {
  assert.equal(Object.keys(cards).length, 6, `${protocol} should contain exactly six distinct card values.`);
}
assert.deepEqual(Object.keys(DB.GRAVITY).map(Number), [0, 1, 2, 4, 5, 6]);
assert.deepEqual(Object.keys(DB.METAL).map(Number), [0, 1, 2, 3, 5, 6]);
assert.equal(DB.GRAVITY[5].m, DB.SPIRIT[5].m);
assert.equal(DB.METAL[5].m, DB.SPIRIT[5].m);
assert.equal(ctx.COMPILE_CPU.levels.fair.label, '公平（手札を見ない）');
assert.equal(ctx.COMPILE_CPU.levels.normal.label, '普通');
assert.equal(ctx.COMPILE_CPU.levels.hard.label, '強い');
assert.equal(ctx.COMPILE_CPU.levels.brutal.label, '激強');
assert.equal(ctx.COMPILE_CPU.levels.ultimate.label, '最強');
assert.equal(ctx.COMPILE_CPU.levels.normal.generation, 'v2');
assert.equal(ctx.COMPILE_CPU.levels.hard.generation, 'v3');
assert.equal(ctx.COMPILE_CPU.levels.brutal.generation, 'v4');
assert.equal(ctx.COMPILE_CPU.levels.ultimate.generation, 'v5');
assert.equal(ctx.COMPILE_CPU.levels.brutal.depth, 10);
assert.equal(ctx.COMPILE_CPU.levels.ultimate.depth, 12);
assert.equal(ctx.COMPILE_CPU.levels.brutal.searchMs, 9000);
assert.equal(ctx.COMPILE_CPU.levels.ultimate.searchMs, 18000);
assert.equal(ctx.COMPILE_CPU.training.engine, 'compile-selfplay-v5-safety-audit');
assert.equal(ctx.COMPILE_CPU.training.qualificationGames, 184);
assert.equal(ctx.COMPILE_CPU.training.strongVsNormal, .9);
assert.equal(ctx.COMPILE_CPU.training.brutalVsStrong, .7);
assert.equal(ctx.COMPILE_CPU.training.ultimateVsBrutal, 11 / 14);
assert.equal(ctx.COMPILE_CPU.training.certifiedNinetyPercent, false);
assert.equal(ctx.COMPILE_CPU.training.safetyAudit.visibleEffects, 61);
assert.equal(ctx.COMPILE_CPU.training.safetyAudit.effectContracts, 21);
assert.equal(ctx.COMPILE_CPU.training.safetyAudit.unmodeledVisibleEffects, 0);
assert.equal(cardCount, 72);
assert.equal(Object.keys(ctx.COMPILE_CPU._test.cardKnowledge()).length, 72);
const effectContracts = ctx.COMPILE_CPU._test.effectContracts();
for (const [protocol, cards] of Object.entries(DB)) for (const [value, text] of Object.entries(cards)) {
  const rules = Object.values(text).filter(Boolean).join(' ');
  if (/あなたは手札.*捨て札|開始：.*手札.*捨て札|終了：.*手札.*捨て札/.test(rules)) {
    assert.ok(effectContracts[`${protocol}:${value}`], `${protocol}:${value} has a self hand cost but no CPU effect contract.`);
  }
}
const actualEffectsBlock = source.slice(source.indexOf('async function activateVisibleCard'), source.indexOf('async function batchRemove', source.indexOf('async function activateVisibleCard')));
const compactModelBlock = source.slice(source.indexOf('function cpuPerfectEffect'), source.indexOf('function cpuPerfectUseControl', source.indexOf('function cpuPerfectEffect')));
const actualVisibleKeys = [...actualEffectsBlock.matchAll(/case'([^']+)'/g)].map(match => match[1]);
const genericCostKeys = new Set(Object.keys(DB).map(protocol => `${protocol}:5`));
const uncoveredModelKeys = actualVisibleKeys.filter(key => !compactModelBlock.includes(key) && !genericCostKeys.has(key));
assert.deepEqual(uncoveredModelKeys, [], `Compact full-information model is missing visible effects: ${uncoveredModelKeys.join(', ')}`);
assert.equal(actualVisibleKeys.length, 61, 'The visible-effect audit should cover all 61 effect-bearing cards.');
assert.match(source, /id="fieldSwapBar"/);
assert.match(source, /function queueCardSelectionSwitch\(card\)/, 'Card selection should support switching without a manual cancel.');
assert.match(source, /queuedPlayCard=card;selectedHandCard=card;cancel\.click\(\)/, 'Selecting another hand card should cancel and continue with that card.');
assert.match(source, /control-dashboard-v12/, 'CONTROL should use the fixed readable dashboard.');
assert.match(source, /transform:none!important/, 'CONTROL ownership must not move over line totals.');
assert.match(source, /CONTROLカード。\$\{controlOwnerText\(viewer\)\}。タップして効果を確認/, 'CONTROL should expose ownership and its tappable explanation.');
assert.equal((source.match(/eyebrow:'[^']+ \/\/ \d+'/g) || []).length, 10, 'The beginner tutorial should contain all ten chapters.');
const reorderSource = source.match(/async function reorderProtocols[\s\S]*?async function controlReleaseAndOptionalReorder/)?.[0] || '';
assert.ok(reorderSource.includes('protocolSwapUI'), 'Protocol reordering should use the in-field swap UI.');
assert.ok(!reorderSource.includes('showModal'), 'Protocol reordering must not replace the field with a modal.');

ctx.G.players[1].hand = [
  { id: 'metal6-opening', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'metal1-opening', protocol: 'METAL', value: 1, faceDown: false }
];
assert.equal(ctx.COMPILE_CPU._test.chooseCurrentPlay('normal', 11, 1).chosen.card, 'metal1-opening');

const finishCtx = createContext(); game(finishCtx);
finishCtx.G.players[1].lines[2] = [{ id: 'base4', protocol: 'METAL', value: 4, faceDown: false }];
finishCtx.G.players[1].hand = [
  { id: 'metal6-finisher', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'metal1-finisher', protocol: 'METAL', value: 1, faceDown: false }
];
assert.equal(finishCtx.COMPILE_CPU._test.chooseCurrentPlay('normal', 11, 1).chosen.card, 'metal6-finisher');

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
for (let seed = 1; seed <= 20; seed++) decks.add(draftCtx.COMPILE_CPU._test.draftPlan([], 'normal', seed).deck.join('/'));
assert.ok(decks.size >= 5, `Expected varied strategic decks, got ${decks.size}.`);

const visibilityCtx = createContext(); game(visibilityCtx);
visibilityCtx.G.players[1].hand = [{ id: 'visibility-card', protocol: 'METAL', value: 1, faceDown: false }];
const fair = visibilityCtx.COMPILE_CPU._test.chooseCurrentPlay('fair', 3, 1).search;
const normal = visibilityCtx.COMPILE_CPU._test.chooseCurrentPlay('normal', 3, 1).search;
const brutal = visibilityCtx.COMPILE_CPU._test.chooseCurrentPlay('brutal', 3, 1).search;
const ultimate = visibilityCtx.COMPILE_CPU._test.chooseCurrentPlay('ultimate', 3, 1).search;
assert.equal(fair.fullInfo, false);
assert.equal(normal.fullInfo, true);
assert.equal(brutal.fullInfo, true);
assert.equal(ultimate.fullInfo, true);
assert.equal(fair.unknownReplyModel, 'remaining-visible-card-distribution');
assert.ok('cacheHits' in ultimate, 'The strongest full-information search should expose its transposition-cache diagnostics.');

const controlCtx = createContext(); game(controlCtx);
controlCtx.G.control = 1;
controlCtx.G.players[0].protocols = [
  { name: 'FIRE', compiled: true },
  { name: 'SPEED', compiled: true },
  { name: 'LIFE', compiled: false }
];
controlCtx.G.players[1].protocols = protocols('DEATH', 'LIGHT', 'GRAVITY');
controlCtx.G.players[0].lines[2] = [
  { id: 'control-threat-6', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'control-threat-4', protocol: 'FIRE', value: 4, faceDown: false }
];
controlCtx.G.players[1].hand = [
  { id: 'control-h1', protocol: 'DEATH', value: 5, faceDown: false },
  { id: 'control-h2', protocol: 'LIGHT', value: 5, faceDown: false },
  { id: 'control-h3', protocol: 'GRAVITY', value: 5, faceDown: false },
  { id: 'control-h4', protocol: 'DEATH', value: 5, faceDown: false }
];
const controlPlan = controlCtx.COMPILE_CPU._test.controlPlan();
assert.equal(controlPlan.target, 0, 'CPU should spend CONTROL on the opponent when it blocks the third compile.');
assert.equal(controlPlan.order[2].compiled, true, 'A compiled protocol should be moved onto the opponent threat line.');
assert.ok(controlPlan.refreshScore > 100000, 'A four-card CONTROL refresh should be valued as a winning defensive resource.');
const opponentBenefit = controlCtx.COMPILE_CPU._test.opponentBenefit('GRAVITY', 6, 2, 'up');
assert.ok(opponentBenefit > 100000, 'Giving the opponent a facedown card that enables a third compile must be heavily penalized.');

const fireCtx = createContext(); game(fireCtx);
fireCtx.G.cpuLevel = 'ultimate';
fireCtx.G.players[1].protocols = protocols('FIRE', 'LIGHT', 'METAL');
const fire2 = { id: 'fire2-self-loss', protocol: 'FIRE', value: 2, faceDown: false };
const fireSpare = { id: 'fire-spare', protocol: 'LIGHT', value: 1, faceDown: false };
fireCtx.G.players[1].hand = [fire2, fireSpare];
const emptyFireAssessment = fireCtx.COMPILE_CPU._test.paidEffect(fire2, 0);
assert.equal(emptyFireAssessment.selfTarget, true, 'FIRE 2 should identify itself as the forced target on an empty field.');
assert.equal(emptyFireAssessment.pureLoss, true, 'Discarding a hand card only to return FIRE 2 must be classified as a pure loss.');
assert.equal(fireCtx.COMPILE_CPU._test.rootSafety(fire2, 'up', 0).hardReject, true, 'The root safety gate must reject a paid FIRE 2 self-return.');
const fireChoice = fireCtx.COMPILE_CPU._test.chooseCurrentPlay('ultimate', 29, 1);
assert.ok(!(fireChoice.chosen.card === fire2.id && fireChoice.chosen.mode === 'up'), 'Ultimate CPU must not choose the paid FIRE 2 self-return when a safe play exists.');
assert.ok(fireChoice.search.rejectedPlans >= 1, 'The search diagnostics should report the rejected self-loss plan.');
assert.equal(fireChoice.search.safetyRejected[0].reason, 'paid-effect-self-loss', 'The rejected plan must retain an inspectable reason.');

const fire1 = { id: 'fire1-self-loss', protocol: 'FIRE', value: 1, faceDown: false };
fireCtx.G.players[1].hand = [fire1, fireSpare];
const emptyFire1Assessment = fireCtx.COMPILE_CPU._test.paidEffect(fire1, 0);
assert.equal(emptyFire1Assessment.selfTarget, true, 'FIRE 1 should identify itself as the forced delete target on an empty field.');
assert.equal(fireCtx.COMPILE_CPU._test.rootSafety(fire1, 'up', 0).hardReject, true, 'The root safety gate must reject a paid FIRE 1 self-delete.');

const fireTargetCtx = createContext(); game(fireTargetCtx);
fireTargetCtx.G.players[1].protocols = protocols('FIRE', 'LIGHT', 'METAL');
const usefulFire2 = { id: 'fire2-useful', protocol: 'FIRE', value: 2, faceDown: false };
fireTargetCtx.G.players[1].hand = [usefulFire2, { id: 'cheap-cost', protocol: 'LIGHT', value: 0, faceDown: false }];
fireTargetCtx.G.players[0].lines[0] = [{ id: 'enemy-six-for-return', protocol: 'METAL', value: 6, faceDown: false }];
const usefulFireAssessment = fireTargetCtx.COMPILE_CPU._test.paidEffect(usefulFire2, 0);
assert.equal(usefulFireAssessment.selfTarget, false, 'FIRE 2 should target a valuable opposing card when one exists.');
assert.equal(fireTargetCtx.COMPILE_CPU._test.rootSafety(usefulFire2, 'up', 0).hardReject, false, 'The safety gate must preserve a genuinely useful paid FIRE 2 line.');

for (let value = 0; value <= 6; value++) {
  const stressCtx = createContext(); game(stressCtx); stressCtx.G.players[1].protocols = protocols('FIRE', 'LIGHT', 'METAL');
  const stressFire = { id: `stress-fire2-${value}`, protocol: 'FIRE', value: 2, faceDown: false };
  stressCtx.G.players[1].hand = [stressFire, { id: `stress-cost-${value}`, protocol: 'LIGHT', value: 1, faceDown: false }];
  if (value) stressCtx.G.players[0].lines[value % 3] = [{ id: `stress-target-${value}`, protocol: 'METAL', value, faceDown: false }];
  const assessment = stressCtx.COMPILE_CPU._test.paidEffect(stressFire, 0), safety = stressCtx.COMPILE_CPU._test.rootSafety(stressFire, 'up', 0);
  assert.equal(safety.hardReject, assessment.pureLoss, `FIRE 2 safety mismatch in stress fixture value ${value}.`);
}
assert.ok(!cpuMatch[1].includes("G.players[cpuPlayer()].hand.length?'discard':'flip'"), 'SPIRIT 1 must compare its discard cost with self-flip instead of blindly discarding.');

console.log(JSON.stringify({
  cards: cardCount, correctedDecks: { gravity: Object.keys(DB.GRAVITY).map(Number), metal: Object.keys(DB.METAL).map(Number) },
  levels: ctx.COMPILE_CPU.levels, metal6: { opening: 'metal1-opening', finisher: 'metal6-finisher' },
  value5: { opponentHidden: flips['opponent-hidden-five'], ownHidden: flips['own-hidden-five'], uncoverBeatsSix: true },
  draftVariants: decks.size, visibility: { fair: fair.replyModel, normal: normal.replyModel, brutal: brutal.replyModel, ultimate: ultimate.replyModel },
  control: { target: controlPlan.target, blockedByCompiledSwap: controlPlan.order[2].compiled, fourCardRefreshScore: controlPlan.refreshScore },
  opponentBenefitPenalty: opponentBenefit, paidFireSafety: { fire1Empty: emptyFire1Assessment, fire2Empty: emptyFireAssessment, fire2Useful: usefulFireAssessment, rejectedPlans: fireChoice.search.rejectedPlans, stressFixtures: 7 }, effectAudit: { visibleEffects: actualVisibleKeys.length, genericValue5Effects: genericCostKeys.size, uncovered: uncoveredModelKeys }, effectContracts: Object.keys(effectContracts).length, protocolSwapUI: 'in-field'
}, null, 2));

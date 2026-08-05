import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dbMatch = source.match(/const D5=([^;]+);\s*const DB=({[\s\S]*?});\s*const HEX=/);
const set2DbMatch = source.match(/Object\.assign\(DB,({\s*CHAOS:\{[\s\S]*?\nWAR:\{[\s\S]*?\n\}\s*})\);/);
const cpuMatch = source.match(/<script id="skin-pro-cpu">([\s\S]*?)<\/script>/);
if (!dbMatch || !set2DbMatch || !cpuMatch) throw new Error('CPU or card database script was not found.');
const dbContext = {};
vm.createContext(dbContext);
new vm.Script(`const D5=${dbMatch[1]};globalThis.DB=(${dbMatch[2]});`).runInContext(dbContext);
new vm.Script(`Object.assign(DB,(${set2DbMatch[1]}));`).runInContext(dbContext);
const DB = dbContext.DB;
const set1Protocols = Object.keys(DB).slice(0, 12);
const set2Protocols = Object.keys(DB).slice(12);
const noop = () => {};
const protocols = (a, b, c) => [{ name: a, compiled: false }, { name: b, compiled: false }, { name: c, compiled: false }];
const player = names => ({ protocols: names, hand: [], deck: [], discard: [], lines: [[], [], []], noCompileNextTurn: false });

function createContext() {
  const ctx = {
    console, performance, G: null, draft: { cardSet: 'set1' }, DB, PROTOCOLS: Object.keys(DB),
    SET: { cpuSpeed: 'normal', cpuPonder: true },
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
  ctx.protocolPoolForSet = mode => mode === 'set2' ? [...set2Protocols] : mode === 'mixed' ? [...set1Protocols, ...set2Protocols] : [...set1Protocols];
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
assert.deepEqual(Object.keys(DB.CORRUPTION).map(Number), [0, 1, 2, 3, 5, 6]);
assert.deepEqual(Object.keys(DB.ICE).map(Number), [1, 2, 3, 4, 5, 6]);
assert.equal(DB.GRAVITY[5].m, DB.SPIRIT[5].m);
assert.equal(DB.METAL[5].m, DB.SPIRIT[5].m);
assert.equal(ctx.COMPILE_CPU.levels.fair.label, '公平（手札を見ない）');
assert.equal(ctx.COMPILE_CPU.levels.normal.label, '普通');
assert.equal(ctx.COMPILE_CPU.levels.hard.label, '強い');
assert.equal(ctx.COMPILE_CPU.levels.brutal.label, '激強');
assert.equal(ctx.COMPILE_CPU.levels.ultimate.label, '最強');
assert.equal(ctx.COMPILE_CPU.levels.normal.generation, 'v7');
assert.equal(ctx.COMPILE_CPU.levels.hard.generation, 'v7');
assert.equal(ctx.COMPILE_CPU.levels.brutal.generation, 'v7');
assert.equal(ctx.COMPILE_CPU.levels.ultimate.generation, 'v7');
assert.equal(ctx.COMPILE_CPU.levels.brutal.depth, 8);
assert.equal(ctx.COMPILE_CPU.levels.ultimate.depth, 10);
assert.equal(ctx.COMPILE_CPU.levels.brutal.searchMs, 4500);
assert.equal(ctx.COMPILE_CPU.levels.ultimate.searchMs, 7000);
assert.equal(ctx.COMPILE_CPU.training.engine, 'compile-faithful-rules-v7');
assert.equal(ctx.COMPILE_CPU.training.adaptiveOpponent.storage, 'local-only');
assert.equal(ctx.COMPILE_CPU.training.adaptiveOpponent.readsHandOnFullInfoLevels, true);
assert.equal(ctx.COMPILE_CPU.training.measured.phaseAwareSearch.games, 44);
assert.equal(ctx.COMPILE_CPU.training.verification.checks, 35);
assert.doesNotThrow(() => new vm.Script(ctx.COMPILE_CPU._test.workerSource()), 'The faithful-search worker bundle must remain syntactically valid.');
assert.equal(ctx.COMPILE_CPU.tuningLevel, 5);
assert.equal(cardCount, 144);
const cardKnowledge = ctx.COMPILE_CPU._test.cardKnowledge();
assert.equal(Object.keys(cardKnowledge).length, 144);
assert.equal(cardKnowledge['LIGHT:4'].base, 0, 'LIGHT 4 must not receive information value when the CPU already has full information.');
assert.equal(cardKnowledge['LIGHT:4'].activate, 0, 'Revealing an already-known hand must not be scored as an activation benefit.');
assert.ok(cardKnowledge['FEAR:1'].activate > 0, 'FEAR 1 should be recognized as a strong hand-swing effect.');
assert.ok(cardKnowledge['TIME:1'].activate < 0, 'TIME 1 should be recognized as a destructive deck-dump risk.');
assert.ok(cardKnowledge['WAR:2'].activate > 0, 'WAR 2 should be recognized as compile-triggered hand denial.');
const fireVsPlague = ctx.COMPILE_CPU._test.protocolMatchup('FIRE', ['PLAGUE']);
assert.equal(fireVsPlague.counter, 6);
assert.equal(fireVsPlague.vulnerability, 7);
assert.equal(fireVsPlague.net, -1, 'Draft scoring must subtract PLAGUE vulnerability instead of treating FIRE as a free counter.');
const effectContracts = ctx.COMPILE_CPU._test.effectContracts();
for (const [protocol, cards] of Object.entries(DB)) for (const [value, text] of Object.entries(cards)) {
  const rules = Object.values(text).filter(Boolean).join(' ');
  if (/あなたは手札.*捨て札|開始：.*手札.*捨て札|終了：.*手札.*捨て札/.test(rules)) {
    assert.ok(effectContracts[`${protocol}:${value}`], `${protocol}:${value} has a self hand cost but no CPU effect contract.`);
  }
}
const actualEffectsBlock = source.slice(source.indexOf('async function activateVisibleCard'), source.indexOf('async function batchRemove', source.indexOf('async function activateVisibleCard')));
const faithfulModelBlock = source.slice(source.indexOf('function simEffect'), source.indexOf('function simFlipCandidates', source.indexOf('function simEffect')));
const actualVisibleKeys = [...actualEffectsBlock.matchAll(/case'([^']+)'/g)].map(match => match[1]);
const genericCostKeys = new Set(Object.keys(DB).map(protocol => `${protocol}:5`));
const informationOnlyKeys = new Set(['LIGHT:4']);
const uncoveredModelKeys = actualVisibleKeys.filter(key => !faithfulModelBlock.includes(key) && !genericCostKeys.has(key) && !informationOnlyKeys.has(key));
assert.deepEqual(uncoveredModelKeys, [], `Faithful full-information model is missing visible effects: ${uncoveredModelKeys.join(', ')}`);
assert.equal(actualVisibleKeys.length, 61, 'The visible-effect audit should cover all 61 effect-bearing cards.');
const set2ActualBlock = source.slice(source.indexOf('const set2BaseActivateVisibleCard'), source.indexOf('const set2BaseResolveStart'));
const actualSet2Keys = [...set2ActualBlock.matchAll(/case'([^']+)'/g)].map(match => match[1]);
const set2InformationOnlyKeys = new Set(['CLARITY:1']);
const uncoveredSet2Keys = actualSet2Keys.filter(key => !faithfulModelBlock.includes(key) && !genericCostKeys.has(key) && !set2InformationOnlyKeys.has(key));
assert.deepEqual(uncoveredSet2Keys, [], `Faithful full-information model is missing Set 2 visible effects: ${uncoveredSet2Keys.join(', ')}`);
assert.equal(actualSet2Keys.length, 55, 'The Set 2 visible-effect audit should cover all 55 effect-bearing cards.');
assert.match(source, /id="fieldSwapBar"/);
assert.match(source, /id="cpuAdvancedSettings"/, 'Secondary CPU settings should stay in the compact details panel.');
assert.match(source, /const CPU_TUNING_LV=5;/, 'Set 2 CPU education should advance the tuning revision.');
assert.match(source, /id="cpuTrainingShare"/, 'CPU settings should expose the opt-in automatic training-log share.');
assert.match(source, /void cpuTrainingFlush\(\);/, 'A completed match should schedule an automatic training upload.');
assert.match(source, /localStorage\.getItem\(CPU_TRAINING_SHARE_KEY\)==='1'/, 'Training sharing must remain opt-in.');
assert.match(source, /Empty valid room keys are intentionally unreadable/, 'An unreadable empty Firebase slot must still be attempted as a new training inbox.');
assert.match(source, /const CPU_LEVEL_UI_HELP=/, 'The welcome screen should use concise CPU difficulty descriptions.');
const protocolPickerSource = source.match(/function renderProtocolSwapBar\(\)[\s\S]*?async function reorderProtocols/)?.[0] || '';
assert.match(protocolPickerSource, /bar\.hidden=true/, 'The legacy protocol swap bar should stay hidden so the field remains visible.');
assert.match(protocolPickerSource, /uiSheet\(/, 'Protocol movement should use the same field-level bottom sheet as other card effects.');
assert.ok(!protocolPickerSource.includes('swaplanes'), 'Protocol movement should not render the old lane-summary panel over the field.');
assert.match(source, /protocoltargeting/, 'Direct protocol targets should receive a field targeting state.');
assert.match(source, /function queueCardSelectionSwitch\(card\)/, 'Card selection should support switching without a manual cancel.');
assert.match(source, /queuedPlayCard=card;selectedHandCard=card;cancel\.click\(\)/, 'Selecting another hand card should cancel and continue with that card.');
assert.match(source, /async function discardCacheExcess\(p,title=/, 'Cache cleanup should use a reusable hand-limit pass.');
const finishActionSource = source.match(/async function finishAction\(\)[\s\S]*?\n}/)?.[0] || '';
assert.doesNotMatch(finishActionSource, /await triggerAfterCacheClear\(p\);[\s\S]*?await discardCacheExcess\(p,'SPEED 1後：5枚まで捨てる'\);/, 'SPEED 1 should not trigger a second cache-clear pass in the same turn.');
const cacheHelperSource = source.match(/async function discardCacheExcess\(p,title=[\s\S]*?\n}/)?.[0] || '';
const cachePrompts = [];
const cacheContext = {
  G: { winner: null, current: 0, turn: 1, phase: 'action', busy: false, players: [{ hand: Array.from({ length: 6 }, (_, id) => ({ id })) }, { hand: [] }] },
  render: noop, skipCache: () => false, other: p => 1 - p, autosave: noop, showHandoff: noop,
  chooseHandCards: async (p, opts) => { cachePrompts.push(opts); return cacheContext.G.players[p].hand.slice(0, opts.min); },
  discardCardsFromHand: async (p, cards) => { cacheContext.G.players[p].hand = cacheContext.G.players[p].hand.filter(card => !cards.includes(card)); return cards.length; },
  triggerAfterCacheClear: async p => { cacheContext.G.players[p].hand.push({ id: 'speed-draw' }); },
  resolveEndPhase: async () => {}
};
vm.createContext(cacheContext);
new vm.Script(`var stableState=true;${cacheHelperSource}\n${finishActionSource}\nglobalThis.runCacheRegression=finishAction;`).runInContext(cacheContext);
await cacheContext.runCacheRegression();
assert.equal(cacheContext.G.players[0].hand.length, 6, 'A SPEED 1 draw during cache should remain until a later turn.');
assert.equal(cachePrompts.length, 1, 'Cache clear should ask for discards only once per turn.');
assert.match(source, /control-dashboard-v12/, 'CONTROL should use the fixed readable dashboard.');
assert.match(source, /transform:none!important/, 'CONTROL ownership must not move over line totals.');
assert.match(source, /CONTROLカード。\$\{controlOwnerText\(viewer\)\}。タップして効果を確認/, 'CONTROL should expose ownership and its tappable explanation.');
assert.equal((source.match(/eyebrow:'[^']+ \/\/ \d+'/g) || []).length, 10, 'The beginner tutorial should contain all ten chapters.');
const reorderSource = source.match(/async function reorderProtocols[\s\S]*?async function controlReleaseAndOptionalReorder/)?.[0] || '';
assert.ok(reorderSource.includes('protocolSwapUI'), 'Protocol reordering should use the in-field swap UI.');
assert.ok(!reorderSource.includes('showModal'), 'Protocol reordering must not replace the field with a modal.');
const revealedHandSource = source.match(/function showRevealedHandList[\s\S]*?async function revealHandTo[\s\S]*?\n}/)?.[0] || '';
assert.match(revealedHandSource, /className='ovgrid revealedhandgrid'/, 'Opponent hand reveals should use the normal full-card hand-list grid.');
assert.match(revealedHandSource, /scaled\(fullCard\(card\),gridW\(\)\)/, 'Every revealed opponent card should be rendered as the full card face.');
assert.ok(!revealedHandSource.includes('choicegrid'), 'Opponent hand reveals should no longer use the text-only choice modal.');

ctx.G.players[1].hand = [
  { id: 'metal6-opening', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'metal1-opening', protocol: 'METAL', value: 1, faceDown: false }
];
const openingMetalChoice = ctx.COMPILE_CPU._test.chooseCurrentPlay('normal', 11, 1);
assert.ok(openingMetalChoice.chosen.card === 'metal1-opening' || openingMetalChoice.chosen.mode === 'down',
  `METAL 6 must not be exposed before it can finish a line: ${JSON.stringify(openingMetalChoice)}`);

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
draftCtx.draft.cardSet = 'set2';
const set2Deck = draftCtx.COMPILE_CPU._test.draftPlan([], 'normal', 123).deck;
assert.ok(set2Deck.every(name => set2Protocols.includes(name)), `Set 2 draft must stay inside the Set 2 pool: ${set2Deck.join('/')}`);
draftCtx.draft.cardSet = 'set1';
let fireAgainstPlague = 0;
for (let seed = 1; seed <= 100; seed++) {
  if (draftCtx.COMPILE_CPU._test.draftPlan(['PLAGUE'], 'normal', seed).deck.includes('FIRE')) fireAgainstPlague++;
}
assert.ok(fireAgainstPlague <= 20, `FIRE should not be over-drafted into PLAGUE: ${fireAgainstPlague}/100.`);
assert.equal(draftCtx.COMPILE_CPU._test.draftChoice([10, 8], .99), 'A', 'A large draft score gap must always keep the best protocol.');
assert.equal(draftCtx.COMPILE_CPU._test.draftChoice([10, 9.7], .99), 'B', 'Close draft scores may still vary the deck.');

const set2SearchCtx = createContext(); game(set2SearchCtx);
set2SearchCtx.draft.cardSet = 'set2';
set2SearchCtx.G.cardSet = 'set2';
set2SearchCtx.G.players[0].protocols = protocols('CHAOS', 'PEACE', 'ICE');
set2SearchCtx.G.players[1].protocols = protocols('FEAR', 'TIME', 'WAR');
set2SearchCtx.G.players[0].hand = [{ id: 'enemy-set2-card', protocol: 'ICE', value: 6, faceDown: false }];
set2SearchCtx.G.players[1].hand = [
  { id: 'set2-fear1', protocol: 'FEAR', value: 1, faceDown: false },
  { id: 'set2-time1', protocol: 'TIME', value: 1, faceDown: false },
  { id: 'set2-war2', protocol: 'WAR', value: 2, faceDown: false }
];
set2SearchCtx.G.players[1].deck = [{ id: 'set2-deck-card', protocol: 'FEAR', value: 2, faceDown: false }];
const set2Search = set2SearchCtx.COMPILE_CPU._test.chooseCurrentPlay('normal', 77, 1);
assert.ok(set2Search.chosen?.card, 'Faithful search should choose a finite Set 2 play.');
assert.ok(set2Search.search.nodes > 0, 'Set 2 decision should run through the faithful search rather than static fallback.');
const corruptionCtx = createContext(); game(corruptionCtx);
corruptionCtx.G.cardSet = 'set2';
corruptionCtx.G.players[0].protocols = protocols('CHAOS', 'PEACE', 'ICE');
corruptionCtx.G.players[1].protocols = protocols('CORRUPTION', 'TIME', 'WAR');
corruptionCtx.G.players[1].hand = [{ id: 'set2-corruption0', protocol: 'CORRUPTION', value: 0, faceDown: false, owner: 1 }];
const corruptionPlans = corruptionCtx.COMPILE_CPU._test.currentTactics().plans.filter(plan => plan.card === 'set2-corruption0' && plan.mode === 'up');
assert.ok(corruptionPlans.some(plan => plan.holder === 1), 'CORRUPTION 0 should retain normal self-side placements.');
assert.ok(corruptionPlans.some(plan => plan.holder === 0), 'CPU must consider CORRUPTION 0 placements on the opponent side.');

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

const intentCtx = createContext(); game(intentCtx);
intentCtx.G.players[0].protocols[0].compiled = true;
intentCtx.G.players[0].protocols[1].compiled = true;
intentCtx.G.players[0].lines[2] = [{ id: 'human-metal-base', protocol: 'METAL', value: 4, faceDown: false }];
intentCtx.G.players[0].hand = [
  { id: 'human-metal-finisher', protocol: 'METAL', value: 6, faceDown: false },
  { id: 'human-fire-zero', protocol: 'FIRE', value: 0, faceDown: false }
];
const intent = intentCtx.COMPILE_CPU._test.opponentIntent();
assert.equal(intent.fullInfo, true, 'Full-information levels should inspect the current human hand when predicting intent.');
assert.equal(intent.immediateWin, true, 'The intent layer should detect a third-compile hand threat.');
assert.equal(intent.top.card, 'METAL:6', 'The finishing card should be ranked as the opponent\'s main intent.');
assert.equal(intent.top.line, 2, 'The predicted finishing line should be exposed in diagnostics.');
assert.ok(intentCtx.COMPILE_CPU._test.intentCounter('METAL', 1, 2, 'up') > 100000, 'A compile lock should receive terminal-scale counterplay value against a predicted win.');

const learningCtx = createContext(); game(learningCtx);learningCtx.COMPILE_CPU._test.resetLearning();
for (let i = 0; i < 12; i++) learningCtx.COMPILE_CPU._test.learnAction({ kind: 'play', protocol: 'FIRE', value: 4, mode: 'up', line: 1 });
const learned = learningCtx.COMPILE_CPU._test.learningSummary(), learnedModel = learningCtx.COMPILE_CPU._test.learningModel();
assert.equal(learned.actions, 12, 'Observed human actions should accumulate across turns.');
assert.ok(learned.percent > 0, 'Opponent-model confidence should grow with observed actions.');
assert.equal(learnedModel.lines[1], 12, 'Preferred human lines should be learned.');
assert.equal(learnedModel.cards['FIRE:4'], 12, 'Repeated human card choices should be learned.');
assert.ok(learningCtx.COMPILE_CPU._test.learnedDraftCounter('PLAGUE') > 0, 'Past FIRE usage should increase the value of a learned PLAGUE counter draft.');

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
fireTargetCtx.G.players[0].lines[1] = [
  { id: 'active-plague1', protocol: 'PLAGUE', value: 1, faceDown: false },
  { id: 'plague1-cover', protocol: 'WATER', value: 0, faceDown: true }
];
fireTargetCtx.G.players[0].deck = [{ id: 'plague-draw-reward', protocol: 'LIFE', value: 4, faceDown: false }];
const plaguePunishedFire = fireTargetCtx.COMPILE_CPU._test.paidEffect(usefulFire2, 0);
assert.ok(plaguePunishedFire.triggerPenalty > 0, 'A FIRE discard must price the card drawn by an active opposing PLAGUE 1.');
assert.ok(plaguePunishedFire.net < usefulFireAssessment.net, 'PLAGUE 1 must make the same paid FIRE trade less attractive.');
assert.equal(plaguePunishedFire.profitable, false, 'A marginal FIRE 2 trade must be declined once it rewards PLAGUE 1.');

const lightCtx = createContext(); game(lightCtx);
lightCtx.G.players[1].protocols = protocols('LIGHT', 'METAL', 'WATER');
const pointlessOwnHidden = { id: 'light2-pointless-own', protocol: 'LIGHT', value: 1, faceDown: true };
lightCtx.G.players[1].lines[0] = [pointlessOwnHidden];
const light2Decision = lightCtx.COMPILE_CPU._test.light2Followup(pointlessOwnHidden);
assert.equal(light2Decision.choice, 'none', 'LIGHT 2 must not flip a marginal known friendly hidden card just because it was inspected.');

const earlyFiveCtx = createContext(); game(earlyFiveCtx);
earlyFiveCtx.G.players[1].protocols = protocols('LIGHT', 'DEATH', 'METAL');
earlyFiveCtx.G.players[1].hand = [
  { id: 'early-death5', protocol: 'DEATH', value: 5, faceDown: false },
  { id: 'early-metal1', protocol: 'METAL', value: 1, faceDown: false },
  { id: 'early-metal2', protocol: 'METAL', value: 2, faceDown: false },
  { id: 'early-metal0', protocol: 'METAL', value: 0, faceDown: false },
  { id: 'early-light3', protocol: 'LIGHT', value: 3, faceDown: false }
];
const earlyFiveChoice = earlyFiveCtx.COMPILE_CPU._test.chooseCurrentPlay('ultimate', 19, 1);
assert.ok(!(earlyFiveChoice.chosen.card === 'early-death5' && earlyFiveChoice.chosen.mode === 'up'),
  'Ultimate CPU must not expose an opening value 5 and pay a discard while safe development exists.');
const earlyFiveCard = earlyFiveCtx.G.players[1].hand[0];
const earlyFiveBase = earlyFiveCtx.COMPILE_CPU._test.fiveTiming(5, 0, earlyFiveCard);
earlyFiveCtx.G.players[0].lines[0] = [
  { id: 'five-plague1', protocol: 'PLAGUE', value: 1, faceDown: false }
];
earlyFiveCtx.G.players[0].deck = [{ id: 'five-plague-reward', protocol: 'METAL', value: 6, faceDown: false }];
const earlyFiveVsPlague = earlyFiveCtx.COMPILE_CPU._test.fiveTiming(5, 0, earlyFiveCard);
assert.ok(earlyFiveVsPlague < earlyFiveBase, 'A value-5 discard must include the card rewarded to opposing PLAGUE 1.');

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
  levels: ctx.COMPILE_CPU.levels, metal6: { opening: openingMetalChoice.chosen, finisher: 'metal6-finisher' },
  value5: { opponentHidden: flips['opponent-hidden-five'], ownHidden: flips['own-hidden-five'], uncoverBeatsSix: true },
  draftVariants: decks.size, fireAgainstPlagueDrafts: `${fireAgainstPlague}/100`, visibility: { fair: fair.replyModel, normal: normal.replyModel, brutal: brutal.replyModel, ultimate: ultimate.replyModel },
  control: { target: controlPlan.target, blockedByCompiledSwap: controlPlan.order[2].compiled, fourCardRefreshScore: controlPlan.refreshScore },
  opponentBenefitPenalty: opponentBenefit, paidFireSafety: { fire1Empty: emptyFire1Assessment, fire2Empty: emptyFireAssessment, fire2Useful: usefulFireAssessment, plaguePunished: plaguePunishedFire, rejectedPlans: fireChoice.search.rejectedPlans, stressFixtures: 7 }, light2Decision, earlyFiveChoice: earlyFiveChoice.chosen, value5PlaguePenalty: earlyFiveBase-earlyFiveVsPlague, effectAudit: { set1VisibleEffects: actualVisibleKeys.length, set2VisibleEffects: actualSet2Keys.length, genericValue5Effects: genericCostKeys.size, uncovered: [...uncoveredModelKeys, ...uncoveredSet2Keys] }, effectContracts: Object.keys(effectContracts).length, set2Draft: set2Deck, set2Search: { chosen: set2Search.chosen, nodes: set2Search.search.nodes }, corruptionOpponentPlacements: corruptionPlans.filter(plan => plan.holder === 0).length, protocolSwapUI: 'in-field'
}, null, 2));

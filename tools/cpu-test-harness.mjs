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

function createContext(extra = {}) {
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
  Object.assign(ctx, extra);
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


export { createContext, game };

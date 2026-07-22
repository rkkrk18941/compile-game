import fs from 'node:fs';
import vm from 'node:vm';

const htmlPath = new URL('../index.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');
const dbMatch = html.match(/const D5=([^;]+);\s*const DB=({[\s\S]*?});\s*const HEX=/);
const knowledgeMatch = html.match(/const CPU_CARD_KNOWLEDGE=Object\.freeze\((\{[\s\S]*?\n  \})\);/);
if (!dbMatch || !knowledgeMatch) throw new Error('Could not extract the game database or CPU knowledge table.');
const context = {};
vm.createContext(context);
new vm.Script(`const D5=${dbMatch[1]};globalThis.DB=(${dbMatch[2]});globalThis.K=(${knowledgeMatch[1]});`).runInContext(context);
const { DB, K } = context;
const PROTOCOLS = Object.keys(DB);

const BASE_POLICY = Object.freeze({
  compiled: 205, lane: 4.1, ready: 43, threat: 57, hand: 4.2,
  card: .72, effect: 1, denial: 1, future: 1, repeat: 1, risk: 1
});
const KEYS = Object.keys(BASE_POLICY);

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if(at<0)return fallback;const value=Number(process.argv[at+1]);return Number.isFinite(value)?value:fallback;
}
const GENERATIONS = arg('generations', 9);
const POPULATION = arg('population', 10);
const MATCHES = arg('matches', 28);
const BENCHMARK = arg('benchmark', 320);
const COMPACT = process.argv.includes('--compact');
const V3_ARENA = process.argv.includes('--v3-arena');
const LADDER_ARENA = process.argv.includes('--ladder-arena');
const ENGINE_ARENA = process.argv.includes('--engine-arena');
const EVOLVE_ENGINE = process.argv.includes('--evolve-engine');
const V3_BASELINE = process.argv.includes('--baseline');
const V3_BASELINE_ONLY = process.argv.includes('--baseline-only');
const V3_DEPTH = arg('v3-depth', 2);
const V3_BEAM = arg('v3-beam', 4);
const V3_NODES = arg('v3-nodes', 2000);
const V4_DEPTH = arg('v4-depth', 3);
const V4_BEAM = arg('v4-beam', 6);
const V4_NODES = arg('v4-nodes', 20000);
const V4_ROLLOUT = arg('v4-rollout', 0);
const V4_MODEL = stringArg('v4-model', 'v3m');
const V5_DEPTH = arg('v5-depth', 4);
const V5_BEAM = arg('v5-beam', 10);
const V5_NODES = arg('v5-nodes', 150000);
const V5_ROLLOUT = arg('v5-rollout', 0);
const V5_MODEL = stringArg('v5-model', 'none');
function stringArg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? String(process.argv[at + 1]) : fallback;
}
const CHALLENGER_ENGINE = stringArg('challenger', 'v4');
const CHAMPION_ENGINE = stringArg('champion', 'v3');
const CHALLENGER_POLICY = stringArg('challenger-policy', 'oracle');
const CHAMPION_POLICY = stringArg('champion-policy', 'oracle');
const ARENA_OFFSET = arg('arena-offset', 0);
const ENGINE_CONFIGS = Object.freeze({
  /* These are frozen historical generations. V3 is the "strong" fighter
     qualified in the previous release. V4/V5 spend progressively more work
     and add stable iterative deepening plus an exact transposition cache. */
  v3:Object.freeze({depth:V3_DEPTH,beam:V3_BEAM,maxNodes:V3_NODES,rollout:0,iterative:false,cache:false}),
  v3m:Object.freeze({depth:V3_DEPTH,beam:V3_BEAM,maxNodes:Math.min(500,V3_NODES),rollout:0,iterative:false,cache:false}),
  v4:Object.freeze({depth:V4_DEPTH,beam:V4_BEAM,maxNodes:V4_NODES,rollout:V4_ROLLOUT,model:V4_MODEL==='none'?null:V4_MODEL,iterative:true,cache:true}),
  /* V4-lite predicts the qualified V4's principal tendency without recursively
     rebuilding its own opponent model inside every V5 leaf. */
  v4m:Object.freeze({depth:Math.min(2,V4_DEPTH),beam:Math.min(4,V4_BEAM),maxNodes:Math.min(1200,V4_NODES),rollout:0,model:null,iterative:true,cache:true}),
  v5:Object.freeze({depth:V5_DEPTH,beam:V5_BEAM,maxNodes:V5_NODES,rollout:V5_ROLLOUT,model:V5_MODEL==='none'?null:V5_MODEL,iterative:true,cache:true})
});

function rng(seed) {
  let x = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const other = p => 1 - p;
const keyOf = card => `${card.protocol}:${card.value}`;
const top = (state, p, line) => state.players[p].lines[line].at(-1) || null;
const allCards = state => state.players.flatMap(player => player.lines.flat());
/* Search creates millions of short-lived positions. Every card exists in one
   zone only, so a schema-aware clone is equivalent to structuredClone here
   and substantially increases the depth reachable during one CPU think. */
const cloneCard = card => ({...card});
const clone = state => ({
  ...state,
  noCompile:[...state.noCompile],
  history:state.history.map(row=>[...row]),
  players:state.players.map(player=>({
    protocols:player.protocols.map(protocol=>({...protocol})),
    deck:player.deck.map(cloneCard),
    hand:player.hand.map(cloneCard),
    discard:player.discard.map(cloneCard),
    lines:player.lines.map(line=>line.map(cloneCard))
  }))
});
const cardKnowledge = card => K[keyOf(card)] || { base: 0, activate: 0, role: 'unknown' };
function stateRandom(state) {
  let x = (Number(state.seed) >>> 0) || 0x9e3779b9;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x >>> 0;
  return state.seed / 4294967296;
}

function values(name) {
  const out = Object.keys(DB[name]).map(Number).sort((a, b) => a - b);
  while (out.length < 6) out.unshift(0);
  return out;
}
function makeDeck(protocols, owner, random) {
  let id = 0;
  return shuffle(protocols.flatMap(protocol => values(protocol).map(value => ({
    id: `${owner}:${protocol}:${value}:${id++}`, protocol, value, owner, faceDown: false
  }))), random);
}
function freshState(decks, seed) {
  const random = rng(seed);
  const state = {
    turn: 1, current: random() < .5 ? 0 : 1, winner: null, control: null, noCompile: [false, false], history: [[], []], seed: hash(seed, 'runtime'),
    players: decks.map((protocols, owner) => ({
      protocols: protocols.map(name => ({ name, compiled: false })),
      deck: makeDeck(protocols, owner, random), hand: [], discard: [], lines: [[], [], []]
    }))
  };
  for (const player of state.players) for (let i = 0; i < 5; i++) player.hand.push(player.deck.pop());
  return state;
}

function location(state, target) {
  for (let p = 0; p < 2; p++) for (let line = 0; line < 3; line++) {
    const index = state.players[p].lines[line].findIndex(card => card.id === target.id);
    if (index >= 0) return { p, line, index, covered: index < state.players[p].lines[line].length - 1 };
  }
  return null;
}
function darknessActive(state, p, line) {
  return state.players[p].lines[line].some(card => !card.faceDown && keyOf(card) === 'DARKNESS:2');
}
function effective(state, card) {
  const loc = location(state, card);
  return card.faceDown ? (loc && darknessActive(state, loc.p, loc.line) ? 4 : 2) : card.value;
}
function total(state, p, line) {
  const raw = state.players[p].lines[line].reduce((sum, card) => sum + effective(state, card), 0);
  const tax = state.players[other(p)].lines[line].filter(card => !card.faceDown && keyOf(card) === 'METAL:0').length * 2;
  return raw - tax;
}
function isTop(state, card) {
  const loc = location(state, card);
  return !!loc && !loc.covered;
}
function canKnow(state, actor, card, info) {
  const loc = location(state, card);
  return info === 'oracle' || !loc || loc.p === actor || !card.faceDown;
}
function publicCardValue(state, actor, card, info, policy) {
  if (!canKnow(state, actor, card, info)) return 2;
  return effective(state, card) + cardKnowledge(card).base * policy.card;
}
function compiledCount(state, p) { return state.players[p].protocols.filter(pr => pr.compiled).length; }

function evaluate(state, actor, policy, info) {
  const op = other(actor);
  if (state.winner === actor) return 1e9;
  if (state.winner === op) return -1e9;
  let score = (compiledCount(state, actor) - compiledCount(state, op)) * policy.compiled;
  for (let line = 0; line < 3; line++) {
    const mine = total(state, actor, line), theirs = total(state, op, line), margin = mine - theirs;
    score += margin * policy.lane;
    if (!state.players[actor].protocols[line].compiled && mine >= 10 && margin > 0) score += policy.ready + Math.min(8, margin) * 2;
    if (!state.players[op].protocols[line].compiled && theirs >= 10 && margin < 0) score -= policy.threat + Math.min(8, -margin) * 2.3;
    const myTop = top(state, actor, line), opTop = top(state, op, line);
    if (myTop && !myTop.faceDown && keyOf(myTop) === 'METAL:6' && !(mine >= 10 && margin > 0)) score -= 24 * policy.risk;
    if (opTop && !opTop.faceDown && keyOf(opTop) === 'METAL:6' && !(theirs >= 10 && margin < 0)) score += 20 * policy.risk;
  }
  score += (state.players[actor].hand.length - state.players[op].hand.length) * policy.hand;
  if (state.control === actor) score += 18 * policy.denial;
  if (state.control === op) score -= 20 * policy.threat;
  score += state.players[actor].hand.reduce((n, card) => n + cardKnowledge(card).base * .2 * policy.future, 0);
  if (info === 'oracle') score -= state.players[op].hand.reduce((n, card) => n + cardKnowledge(card).base * .16 * policy.future, 0);
  for (const card of allCards(state)) {
    const loc = location(state, card), sign = loc.p === actor ? 1 : -1;
    if (canKnow(state, actor, card, info)) score += sign * cardKnowledge(card).base * .16 * policy.effect;
  }
  return score;
}

function draw(state, p, count) {
  const player = state.players[p];
  for (let i = 0; i < count; i++) {
    if (!player.deck.length && player.discard.length) player.deck = shuffle(player.discard.splice(0), () => stateRandom(state));
    const card = player.deck.pop(); if (!card) break; player.hand.push(card);
  }
}
function discardLowest(state, p, count, policy, info) {
  const player = state.players[p];
  const ranked = [...player.hand].sort((a, b) => cardKnowledge(a).base - cardKnowledge(b).base || a.value - b.value);
  for (const card of ranked.slice(0, count)) {
    const at = player.hand.findIndex(c => c.id === card.id);
    if (at >= 0) { player.hand.splice(at, 1); card.faceDown = false; player.discard.push(card); }
  }
}
function bestLine(state, p, mode = 'build') {
  const op = other(p), lines = [0, 1, 2];
  return lines.sort((a, b) => {
    const sa = mode === 'attack' ? total(state, op, a) - total(state, p, a) : 10 - Math.abs(10 - total(state, p, a)) + (total(state, p, a) > total(state, op, a) ? 3 : 0);
    const sb = mode === 'attack' ? total(state, op, b) - total(state, p, b) : 10 - Math.abs(10 - total(state, p, b)) + (total(state, p, b) > total(state, op, b) ? 3 : 0);
    return sb - sa || a - b;
  })[0];
}
function targetScore(state, actor, card, action, info, policy) {
  const loc = location(state, card), mine = loc.p === actor, known = canKnow(state, actor, card, info);
  let value = known ? publicCardValue(state, actor, card, info, policy) : 2;
  if (action === 'flip') {
    if (card.faceDown && known) {
      value = (card.value - effective(state, card)) * (mine ? 1 : -1) + cardKnowledge(card).activate * (mine ? 1 : -1) * policy.effect;
      if (card.value === 5 && state.players[loc.p].hand.length) value += (mine ? -1 : 1) * 16 * policy.denial;
    } else value = (effective(state, card) - 2) * (mine ? -1 : 1) * policy.lane;
  } else value *= mine ? -1 : 1;
  if ((action === 'delete' || action === 'return' || action === 'move') && !loc.covered && loc.index > 0) {
    const below = state.players[loc.p].lines[loc.line][loc.index - 1];
    if (!below.faceDown && below.value === 5 && state.players[loc.p].hand.length) value += (mine ? -1 : 1) * 18 * policy.denial;
  }
  return value;
}
function pickCard(state, actor, cards, action, info, policy, maximize = true) {
  if (!cards.length) return null;
  return [...cards].sort((a, b) => {
    const av = targetScore(state, actor, a, action, info, policy), bv = targetScore(state, actor, b, action, info, policy);
    return maximize ? bv - av || a.id.localeCompare(b.id) : av - bv || a.id.localeCompare(b.id);
  })[0];
}

function uncover(state, p, line, actor, info, policy, guard) {
  const card = top(state, p, line);
  if (card && !card.faceDown) activate(state, p, card, line, false, actor, info, policy, guard + 1);
}
function removeField(state, card, mode, actor, info, policy, guard = 0) {
  if (guard > 24) return;
  const loc = location(state, card); if (!loc) return;
  const stack = state.players[loc.p].lines[loc.line], wasTop = !loc.covered;
  stack.splice(loc.index, 1); card.faceDown = false;
  if (mode === 'return') state.players[card.owner].hand.push(card); else state.players[card.owner].discard.push(card);
  if (wasTop) uncover(state, loc.p, loc.line, actor, info, policy, guard);
}
function flip(state, card, actor, info, policy, guard = 0) {
  if (guard > 24 || !location(state, card)) return;
  if (!card.faceDown && keyOf(card) === 'METAL:6') { removeField(state, card, 'delete', actor, info, policy, guard + 1); return; }
  card.faceDown = !card.faceDown;
  const loc = location(state, card);
  if (loc && !card.faceDown && !loc.covered) activate(state, loc.p, card, loc.line, false, actor, info, policy, guard + 1);
}
function move(state, card, targetLine, actor, info, policy, guard = 0) {
  const loc = location(state, card); if (!loc || targetLine === loc.line) return;
  const wasTop = !loc.covered, stack = state.players[loc.p].lines[loc.line]; stack.splice(loc.index, 1);
  beforeCover(state, loc.p, targetLine, actor, info, policy, guard + 1);
  state.players[loc.p].lines[targetLine].push(card);
  if (wasTop) uncover(state, loc.p, loc.line, actor, info, policy, guard + 1);
}
function playDeck(state, p, line, actor, info, policy, guard = 0, under = null) {
  draw(state, p, 1); const card = state.players[p].hand.pop(); if (!card) return;
  card.faceDown = true;
  if (under) { const stack = state.players[p].lines[line], at = Math.max(0, stack.findIndex(c => c.id === under.id)); stack.splice(at, 0, card); }
  else { beforeCover(state, p, line, actor, info, policy, guard + 1); state.players[p].lines[line].push(card); }
}
function beforeCover(state, p, line, actor, info, policy, guard = 0) {
  if (guard > 24) return;
  const card = top(state, p, line); if (!card || card.faceDown) return;
  const key = keyOf(card);
  if (key === 'METAL:6') removeField(state, card, 'delete', actor, info, policy, guard + 1);
  else if (key === 'LIFE:3') playDeck(state, p, [0, 1, 2].filter(x => x !== line).sort((a, b) => total(state, p, a) - total(state, p, b))[0], actor, info, policy, guard + 1);
  else if (key === 'FIRE:0') {
    draw(state, p, 1);
    const target = pickCard(state, p, allCards(state).filter(c => c.id !== card.id), 'flip', info, policy);
    if (target) flip(state, target, p, info, policy, guard + 1);
  }
}
function exposed(state) { return allCards(state).filter(card => isTop(state, card)); }
function hidden(state) { return allCards(state).filter(card => card.faceDown); }
function reorderForHand(state, p, hostile = false) {
  const prs = state.players[p].protocols;
  const score = (pr, line) => state.players[p].hand.filter(card => card.protocol === pr.name).length + (hostile ? -total(state, p, line) : total(state, p, line)) * .1;
  let best = prs, bestScore = -Infinity;
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]].map(xs => xs.map(i => prs[i]))) {
    const s = order.reduce((n, pr, line) => n + score(pr, line), 0);
    if (s > bestScore) { bestScore = s; best = order; }
  }
  state.players[p].protocols = best.map(pr => ({ ...pr }));
}

function activate(state, p, card, line, covering, actor, info, policy, guard = 0) {
  if (guard > 24 || !location(state, card)) return;
  const op = other(p), key = keyOf(card);
  const flipBest = (filter = () => true, mandatory = true) => {
    const choices = exposed(state).filter(c => c.id !== card.id && filter(c));
    const target = pickCard(state, p, choices, 'flip', info, policy);
    if (target && (mandatory || targetScore(state, p, target, 'flip', info, policy) > 0)) flip(state, target, p, info, policy, guard + 1);
    return target;
  };
  const enemy = () => exposed(state).filter(c => location(state, c).p === op);
  const own = () => exposed(state).filter(c => location(state, c).p === p);
  const deleteBest = cards => { const t = pickCard(state, p, cards, 'delete', info, policy); if (t) removeField(state, t, 'delete', p, info, policy, guard + 1); };
  const returnBest = cards => { const t = pickCard(state, p, cards, 'return', info, policy); if (t) removeField(state, t, 'return', p, info, policy, guard + 1); };
  if (card.value === 5) { discardLowest(state, p, 1, policy, info); return; }
  switch (key) {
    case 'SPIRIT:0': draw(state, p, Math.max(0, 5 - state.players[p].hand.length) + 1); break;
    case 'SPIRIT:1': draw(state, p, 2); break;
    case 'SPIRIT:2': flipBest(() => true, false); break;
    case 'SPIRIT:4': reorderForHand(state, p); break;
    case 'LIFE:0': for (let l = 0; l < 3; l++) if (state.players[p].lines[l].length) playDeck(state, p, l, p, info, policy, guard + 1); break;
    case 'LIFE:1': flipBest(); flipBest(); break;
    case 'LIFE:2': draw(state, p, 1); flipBest(c => c.faceDown, false); break;
    case 'LIFE:4': if (covering) draw(state, p, 1); break;
    case 'WATER:0': flipBest(); if (location(state, card)) flip(state, card, p, info, policy, guard + 1); break;
    case 'WATER:1': for (let l = 0; l < 3; l++) if (l !== line) playDeck(state, p, l, p, info, policy, guard + 1); break;
    case 'WATER:2': draw(state, p, 2); reorderForHand(state, p); break;
    case 'WATER:3': {
      const scores = [0,1,2].map(l => ({ l, cards: allCards(state).filter(c => location(state,c).line === l && effective(state,c) === 2) }));
      scores.sort((a,b) => b.cards.reduce((n,c)=>n+(location(state,c).p===op?1:-1),0)-a.cards.reduce((n,c)=>n+(location(state,c).p===op?1:-1),0));
      for (const target of [...scores[0].cards]) removeField(state, target, 'return', p, info, policy, guard + 1); break;
    }
    case 'WATER:4': returnBest(own()); break;
    case 'DEATH:0': for (let l = 0; l < 3; l++) if (l !== line) deleteBest(exposed(state).filter(c => location(state,c).line === l)); break;
    case 'DEATH:2': {
      const candidates = [0,1,2].map(l => ({ l, cards: allCards(state).filter(c => location(state,c).line === l && [1,2].includes(effective(state,c))) }));
      candidates.sort((a,b)=>b.cards.reduce((n,c)=>n+(location(state,c).p===op?1:-1),0)-a.cards.reduce((n,c)=>n+(location(state,c).p===op?1:-1),0));
      for (const target of [...candidates[0].cards]) removeField(state,target,'delete',p,info,policy,guard+1); break;
    }
    case 'DEATH:3': deleteBest(hidden(state)); break;
    case 'DEATH:4': deleteBest(exposed(state).filter(c => [0,1].includes(c.value))); break;
    case 'PLAGUE:0': case 'PLAGUE:1': discardLowest(state, op, 1, policy, info); break;
    case 'PLAGUE:2': discardLowest(state, p, Math.min(2,state.players[p].hand.length),policy,info); discardLowest(state,op,Math.min(3,state.players[op].hand.length),policy,info); break;
    case 'PLAGUE:3': for (const target of [...exposed(state)].filter(c=>c.id!==card.id&&!c.faceDown)) flip(state,target,p,info,policy,guard+1); break;
    case 'GRAVITY:0': for(let n=0;n<Math.floor((state.players[0].lines[line].length+state.players[1].lines[line].length)/2);n++)playDeck(state,p,line,p,info,policy,guard+1,card); break;
    case 'GRAVITY:1': draw(state,p,2); { const t=pickCard(state,p,exposed(state),'move',info,policy); if(t)move(state,t,line,p,info,policy,guard+1); } break;
    case 'GRAVITY:2': { const t=flipBest(); if(t&&location(state,t))move(state,t,line,p,info,policy,guard+1); } break;
    case 'GRAVITY:4': { const t=pickCard(state,p,hidden(state),'move',info,policy);if(t)move(state,t,line,p,info,policy,guard+1); } break;
    case 'GRAVITY:6': playDeck(state,op,line,p,info,policy,guard+1); break;
    case 'METAL:0': flipBest(); break;
    case 'METAL:1': draw(state,p,2); state.noCompile[op]=true; break;
    case 'METAL:3': draw(state,p,1); { const l=[0,1,2].filter(x=>x!==line&&state.players[0].lines[x].length+state.players[1].lines[x].length>=8)[0];if(l!=null)for(const t of [...state.players[0].lines[l],...state.players[1].lines[l]])removeField(state,t,'delete',p,info,policy,guard+1); } break;
    case 'LIGHT:0': { const t=flipBest(); if(t&&location(state,t))draw(state,p,effective(state,t)); } break;
    case 'LIGHT:2': draw(state,p,2); { const t=pickCard(state,p,hidden(state),'flip',info,policy);if(t&&targetScore(state,p,t,'flip',info,policy)>0)flip(state,t,p,info,policy,guard+1); } break;
    case 'LIGHT:3': { const cards=[...state.players[p].lines[line]].filter(c=>c.faceDown),target=[0,1,2].filter(x=>x!==line).sort((a,b)=>total(state,p,a)-total(state,p,b))[0];for(const t of cards)move(state,t,target,p,info,policy,guard+1); } break;
    case 'FIRE:0': flipBest(); draw(state,p,2); break;
    case 'FIRE:1': if(state.players[p].hand.length){discardLowest(state,p,1,policy,info);deleteBest(exposed(state));} break;
    case 'FIRE:2': if(state.players[p].hand.length){discardLowest(state,p,1,policy,info);returnBest(exposed(state));} break;
    case 'FIRE:4': { const n=Math.min(2,state.players[p].hand.length);discardLowest(state,p,n,policy,info);draw(state,p,n+1); } break;
    case 'SPEED:0': if(state.players[p].hand.length) takeAction(state,p,policy,info,guard+1); break;
    case 'SPEED:1': draw(state,p,2); break;
    case 'SPEED:3': { const t=pickCard(state,p,exposed(state).filter(c=>c.id!==card.id),'move',info,policy);if(t)move(state,t,bestLine(state,location(state,t).p),p,info,policy,guard+1); } break;
    case 'SPEED:4': { const t=pickCard(state,p,hidden(state).filter(c=>location(state,c).p===op),'move',info,policy);if(t)move(state,t,bestLine(state,op),p,info,policy,guard+1); } break;
    case 'DARKNESS:0': draw(state,p,3); { const t=pickCard(state,p,allCards(state).filter(c=>location(state,c).p===op&&location(state,c).covered),'move',info,policy);if(t)move(state,t,bestLine(state,op),p,info,policy,guard+1); } break;
    case 'DARKNESS:1': { const t=pickCard(state,p,enemy(),'flip',info,policy);if(t){flip(state,t,p,info,policy,guard+1);if(location(state,t)&&targetScore(state,p,t,'move',info,policy)>0)move(state,t,bestLine(state,op),p,info,policy,guard+1);}} break;
    case 'DARKNESS:2': flipBest(c=>{const z=location(state,c);return z.p===p&&z.line===line&&z.covered;},false); break;
    case 'DARKNESS:3': if(state.players[p].hand.length){const extra=[...state.players[p].hand].sort((a,b)=>a.value-b.value)[0],l=[0,1,2].filter(x=>x!==line).sort((a,b)=>total(state,p,a)-total(state,p,b))[0];playCard(state,p,extra,'down',l,policy,info,guard+1);} break;
    case 'DARKNESS:4': {const t=pickCard(state,p,hidden(state),'move',info,policy);if(t)move(state,t,bestLine(state,location(state,t).p),p,info,policy,guard+1);} break;
    case 'PSYCHIC:0': draw(state,p,2);discardLowest(state,op,2,policy,info); break;
    case 'PSYCHIC:2': discardLowest(state,op,2,policy,info);reorderForHand(state,op,true); break;
    case 'PSYCHIC:3': discardLowest(state,op,1,policy,info);{const t=pickCard(state,p,enemy(),'move',info,policy);if(t)move(state,t,bestLine(state,op),p,info,policy,guard+1);} break;
  }
}

function lineBlocked(state, p, line) { const c=top(state,other(p),line);return !!c&&!c.faceDown&&keyOf(c)==='PLAGUE:0'; }
function downBlocked(state,p,line){const c=top(state,other(p),line);return !!c&&!c.faceDown&&keyOf(c)==='METAL:2';}
function forceDown(state,p){return [0,1,2].some(line=>{const c=top(state,other(p),line);return c&&!c.faceDown&&keyOf(c)==='PSYCHIC:1';});}
function bypass(state,p){return state.players[p].lines.flat().some(c=>!c.faceDown&&keyOf(c)==='SPIRIT:1');}
function legalActions(state,p){
  const out=[];
  for(const card of state.players[p].hand){
    if(!forceDown(state,p))for(let line=0;line<3;line++)if(!lineBlocked(state,p,line)&&(bypass(state,p)||state.players[p].protocols[line].name===card.protocol||state.players[other(p)].protocols[line].name===card.protocol))out.push({type:'play',id:card.id,mode:'up',line});
  }
  /* A facedown play hides identity and is worth 2 (or 4 with DARKNESS 2).
     Only the two cards that benefit most from conversion need distinct plans. */
  const downCards=[...state.players[p].hand].sort((a,b)=>(a.value-cardKnowledge(a).base*.18)-(b.value-cardKnowledge(b).base*.18)).slice(0,2);
  for(const card of downCards)for(let line=0;line<3;line++)if(!lineBlocked(state,p,line)&&!downBlocked(state,p,line))out.push({type:'play',id:card.id,mode:'down',line});
  if(state.players[p].hand.length<5)out.push({type:'refresh'});
  return out;
}
function updateControl(state,p){
  let wins=0;for(let line=0;line<3;line++)if(total(state,p,line)>total(state,other(p),line))wins++;
  if(wins>=2)state.control=p;
}
function useControl(state,p,policy,info){
  if(state.control!==p)return;
  const candidates=[];
  for(const target of[p,other(p)])for(const[a,b]of[[0,1],[0,2],[1,2]]){
    const candidate=clone(state);candidate.control=null;
    [candidate.players[target].protocols[a],candidate.players[target].protocols[b]]=[candidate.players[target].protocols[b],candidate.players[target].protocols[a]];
    candidates.push(candidate);
  }
  const keep=clone(state);keep.control=null;candidates.push(keep);
  candidates.sort((a,b)=>evaluate(b,p,policy,info)-evaluate(a,p,policy,info));
  const best=candidates[0];state.players=best.players;state.control=null;
}
function playCard(state,p,card,mode,line,policy,info,guard=0){
  const at=state.players[p].hand.findIndex(c=>c.id===card.id);if(at<0)return;
  state.players[p].hand.splice(at,1);card.faceDown=mode==='down';beforeCover(state,p,line,p,info,policy,guard+1);
  const covering=state.players[p].lines[line].length>0;state.players[p].lines[line].push(card);
  state.history[p].push(`${keyOf(card)}:${mode}:${line}`);state.history[p]=state.history[p].slice(-8);
  if(mode==='up'&&location(state,card))activate(state,p,card,line,covering,p,info,policy,guard+1);
}
function applyAction(state,p,action,policy,info,guard=0){
  if(action.type==='refresh'){if(state.control===p)useControl(state,p,policy,info);draw(state,p,Math.max(0,5-state.players[p].hand.length));return;}
  const card=state.players[p].hand.find(c=>c.id===action.id);if(card)playCard(state,p,card,action.mode,action.line,policy,info,guard+1);
}
function actionScore(state,p,action,policy,info){
  if(action.type==='refresh'){
    const next=clone(state);applyAction(next,p,action,policy,info);
    return(evaluate(next,p,policy,info)-evaluate(state,p,policy,info))*1.8+Math.max(0,5-state.players[p].hand.length)*policy.hand*1.7-4;
  }
  const card=state.players[p].hand.find(c=>c.id===action.id);if(!card)return-1e9;
  const op=other(p),mine=total(state,p,action.line),theirs=total(state,op,action.line),topCard=top(state,p,action.line);
  const hiddenValue=darknessActive(state,p,action.line)?4:2,coverLoss=topCard&&!topCard.faceDown&&keyOf(topCard)==='METAL:6'?6:0;
  const add=(action.mode==='up'?card.value:hiddenValue)-coverLoss,after=mine+add,ready=after>=10&&after>theirs;
  let score=add*policy.lane+(after-theirs)*.35;
  if(ready)score+=policy.ready+(state.players[p].protocols[action.line].compiled?4:18);
  if(mine<=theirs&&after>theirs)score+=8;
  if(action.mode==='up'){
    const learned=cardKnowledge(card);score+=(learned.base*.75+learned.activate*.35)*policy.effect;
    if(card.value===5&&state.players[p].hand.length>1)score-=17*policy.risk;
    if(keyOf(card)==='METAL:6'&&!ready)score-=34*policy.risk;
    if(keyOf(card)==='GRAVITY:6'){
      const opponentBefore=total(state,op,action.line),opponentAfter=opponentBefore+2,opProtocol=state.players[op].protocols[action.line];
      score-=12*policy.risk;
      if(opponentAfter>=10&&opponentAfter>after)score-=(opProtocol.compiled?20:policy.threat*(compiledCount(state,op)===2?12:2.5))*policy.risk;
    }
    if(/^PLAGUE:[012]$/.test(keyOf(card))||/^PSYCHIC:[023]$/.test(keyOf(card))){
      const handPressure=info==='oracle'?state.players[op].hand.reduce((n,c)=>n+Math.max(0,cardKnowledge(c).base),0)/Math.max(1,state.players[op].hand.length):state.players[op].hand.length*2;
      score+=handPressure*policy.denial;
    }
  }else score+=(2-card.value)*.8+2.4*policy.future;
  if(topCard&&!topCard.faceDown){
    score-=cardKnowledge(topCard).base*.38*policy.future;
    if(keyOf(topCard)==='FIRE:0')score+=8*policy.effect;
    if(keyOf(topCard)==='LIFE:3')score+=6*policy.effect;
  }
  const repeat=state.history[p].filter(x=>x.startsWith(`${keyOf(card)}:`)).length;
  return score-repeat*3.5*policy.repeat;
}
function chooseAction(state,p,policy,info){
  const actions=legalActions(state,p);if(!actions.length)return null;
  return actions.map(action=>({action,score:actionScore(state,p,action,policy,info)})).sort((a,b)=>b.score-a.score||JSON.stringify(a.action).localeCompare(JSON.stringify(b.action)))[0].action;
}
function takeAction(state,p,policy,info,guard=0){const action=chooseAction(state,p,policy,info);if(action)applyAction(state,p,action,policy,info,guard+1);}

/* ---------- V3: full-turn adversarial search ----------
   V2 ranks the immediate action. V3 advances the actual simulator through
   cache, end effects, the opponent start phase, CONTROL and mandatory compile,
   then searches the resulting action phase. This makes delayed combos and
   compile denial visible to the planner instead of merely assigning text
   bonuses to them. */
function v3Evaluate(state,root,policy,info){
  const op=other(root);if(state.winner===root)return 1e12;if(state.winner===op)return-1e12;
  const mine=compiledCount(state,root),theirs=compiledCount(state,op);let score=evaluate(state,root,policy,info);
  const progress=[0,4200,27000,310000];score+=progress[mine]-progress[theirs];
  let myReady=0,opReady=0,myNear=0,opNear=0;
  for(let line=0;line<3;line++){
    const a=total(state,root,line),b=total(state,op,line),myOpen=!state.players[root].protocols[line].compiled,opOpen=!state.players[op].protocols[line].compiled;
    if(myOpen&&a>=10&&a>b)myReady++;else if(myOpen&&a>=7)myNear++;
    if(opOpen&&b>=10&&b>a)opReady++;else if(opOpen&&b>=7)opNear++;
    if(myOpen)score+=Math.max(0,Math.min(10,a))*18+Math.max(0,a-b)*14;
    if(opOpen)score-=Math.max(0,Math.min(10,b))*20+Math.max(0,b-a)*16;
  }
  score+=myReady*(mine===2?260000:17000)-opReady*(theirs===2?290000:19500);
  if(myReady>=2)score+=15000;if(opReady>=2)score-=18000;
  score+=(myNear-opNear)*900;
  if(state.noCompile[op])score+=theirs===2?72000:12500;if(state.noCompile[root])score-=mine===2?78000:14000;
  if(state.control===root)score+=mine===2?18000:6000;if(state.control===op)score-=theirs===2?21000:7000;
  const handPower=p=>state.players[p].hand.reduce((sum,card)=>sum+Math.max(-3,cardKnowledge(card).base)+Math.max(0,cardKnowledge(card).activate)*.45,0);
  score+=(handPower(root)-handPower(op))*38+(state.players[root].hand.length-state.players[op].hand.length)*95;
  return score;
}
function v3FinishAction(state,actor,action,policies,infos){
  const next=clone(state);if(action)applyAction(next,actor,action,policies[actor],infos[actor]);
  if(next.players[actor].hand.length>5)discardLowest(next,actor,next.players[actor].hand.length-5,policies[actor],infos[actor]);
  endEffects(next,actor,policies[actor],infos[actor]);next.current=other(actor);next.turn++;
  if(next.winner==null){const upcoming=next.current;startEffects(next,upcoming,policies[upcoming],infos[upcoming]);compile(next,upcoming,policies[upcoming],infos[upcoming]);}
  return next;
}
function v3OrderedChildren(state,actor,root,policies,infos,ctx,all=false){
  let actions=legalActions(state,actor);
  const children=actions.map(action=>{const child=v3FinishAction(state,actor,action,policies,infos);return{action,child,score:v3Evaluate(child,root,policies[root],infos[root]),hint:actionScore(state,actor,action,policies[actor],infos[actor])};});
  children.sort((a,b)=>actor===root?b.score-a.score||b.hint-a.hint:a.score-b.score||b.hint-a.hint);
  if(all||children.length<=ctx.beam)return children;
  const cut=children.slice(0,ctx.beam),refresh=children.find(entry=>entry.action.type==='refresh');
  if(refresh&&!cut.includes(refresh))cut[cut.length-1]=refresh;
  return cut;
}
function v3StateKey(state,actor,root,plies){
  const signature=card=>`${card.id}@${card.owner}@${card.faceDown?1:0}`;
  const player=entry=>[
    entry.protocols.map(protocol=>`${protocol.name}:${protocol.compiled?1:0}`).join(','),
    entry.hand.map(signature).sort().join(','),
    entry.deck.map(signature).join(','),
    entry.discard.map(signature).join(','),
    entry.lines.map(line=>line.map(signature).join(',')).join('/')
  ].join(';');
  return`${actor}|${root}|${plies}|${state.turn}|${state.current}|${state.control??'n'}|${state.noCompile.map(Number).join('')}|${state.seed}|${state.history.map(row=>row.join(',')).join('/')}|${state.players.map(player).join('||')}`;
}
function v3Rollout(state,actor,root,policies,infos,ctx){
  let next=state,turn=actor;
  for(let ply=0;ply<ctx.rollout&&next.winner==null&&ctx.nodes<ctx.maxNodes;ply++){
    const action=chooseAction(next,turn,policies[turn],infos[turn]);ctx.nodes++;
    next=v3FinishAction(next,turn,action,policies,infos);turn=next.current;
  }
  return v3Evaluate(next,root,policies[root],infos[root]);
}
function v3Node(state,actor,root,plies,policies,infos,ctx,alpha=-Infinity,beta=Infinity){
  if(state.winner!=null)return v3Evaluate(state,root,policies[root],infos[root]);
  if(ctx.nodes++>=ctx.maxNodes)return v3Evaluate(state,root,policies[root],infos[root]);
  if(plies<=0)return ctx.rollout?v3Rollout(state,actor,root,policies,infos,ctx):v3Evaluate(state,root,policies[root],infos[root]);
  const cacheKey=ctx.tt?v3StateKey(state,actor,root,plies):null,cached=cacheKey?ctx.tt.get(cacheKey):null;
  if(cached!=null){ctx.hits++;return cached;}
  /* A later generation may model the frozen previous CPU exactly instead of
     granting it hypothetical perfect play. This is a legitimate best response
     to a deterministic opponent and still leaves our own turns fully searched. */
  if(actor!==root&&ctx.model&&ENGINE_CONFIGS[ctx.model]){
    const modelKey=`${ctx.model}|${v3StateKey(state,actor,actor,ENGINE_CONFIGS[ctx.model].depth)}`;
    let predicted=ctx.modelCache?.get(modelKey);if(predicted===undefined){predicted=chooseActionV3(state,actor,policies,infos,ctx.model);ctx.modelCache?.set(modelKey,predicted||null);}
    const next=v3FinishAction(state,actor,predicted,policies,infos);
    const value=v3Node(next,next.current,root,plies-1,policies,infos,ctx,alpha,beta);
    if(cacheKey){if(ctx.tt.size>300000)ctx.tt.clear();ctx.tt.set(cacheKey,value);}return value;
  }
  const children=v3OrderedChildren(state,actor,root,policies,infos,ctx,false);
  if(!children.length){const next=v3FinishAction(state,actor,null,policies,infos);return v3Node(next,next.current,root,plies-1,policies,infos,ctx,alpha,beta);}
  let best=actor===root?-Infinity:Infinity,cut=false;
  for(const entry of children){const value=v3Node(entry.child,entry.child.current,root,plies-1,policies,infos,ctx,alpha,beta);if(actor===root){best=Math.max(best,value);alpha=Math.max(alpha,best);}else{best=Math.min(best,value);beta=Math.min(beta,best);}if(beta<=alpha||ctx.nodes>=ctx.maxNodes)break;}
  if(beta<=alpha||ctx.nodes>=ctx.maxNodes)cut=true;
  if(cacheKey&&!cut){if(ctx.tt.size>300000)ctx.tt.clear();ctx.tt.set(cacheKey,best);}
  return best;
}
function chooseActionV3(state,p,policies,infos,engine='v3'){
  const config=ENGINE_CONFIGS[engine]||ENGINE_CONFIGS.v3;
  const modelCache=config.model?new Map():null;
  const seedCtx={nodes:0,maxNodes:config.maxNodes,beam:config.beam,rollout:config.rollout||0,model:config.model||null,modelCache,tt:null,hits:0},roots=v3OrderedChildren(state,p,p,policies,infos,seedCtx,true);if(!roots.length)return null;
  if(!config.iterative){
    let best=null,bestValue=-Infinity;
    for(const entry of roots){const value=v3Node(entry.child,entry.child.current,p,config.depth,policies,infos,seedCtx);if(value>bestValue||(value===bestValue&&entry.hint>(best?.hint??-Infinity))){best={...entry,value};bestValue=value;}if(seedCtx.nodes>=seedCtx.maxNodes)break;}
    return best?.action||roots[0].action;
  }
  const tt=config.cache?new Map():null;let accepted=null,used=0,ordered=[...roots];
  for(let depth=1;depth<=config.depth;depth++){
    const ctx={nodes:0,maxNodes:Math.max(1,config.maxNodes-used),beam:config.beam,rollout:config.rollout||0,model:config.model||null,modelCache,tt,hits:0},iteration=[];
    for(const entry of ordered){
      const value=v3Node(entry.child,entry.child.current,p,depth,policies,infos,ctx);
      if(ctx.nodes>=ctx.maxNodes){iteration.length=0;break;}
      iteration.push({...entry,value});
    }
    used+=ctx.nodes;if(iteration.length!==roots.length)break;
    iteration.sort((a,b)=>b.value-a.value||b.hint-a.hint||JSON.stringify(a.action).localeCompare(JSON.stringify(b.action)));
    accepted=iteration;ordered=iteration;if(used>=config.maxNodes)break;
  }
  return accepted?.[0]?.action||roots[0].action;
}

function startEffects(state,p,policy,info){
  for(const card of [...state.players[p].lines.flat()]){
    if(!location(state,card)||card.faceDown||!isTop(state,card))continue;
    const key=keyOf(card);
    if(key==='SPIRIT:1'){if(state.players[p].hand.length)discardLowest(state,p,1,policy,info);else flip(state,card,p,info,policy);}
    if(key==='DEATH:1'){
      const choices=exposed(state).filter(c=>c.id!==card.id);const target=pickCard(state,p,choices,'delete',info,policy);
      if(target&&targetScore(state,p,target,'delete',info,policy)>4){draw(state,p,1);removeField(state,target,'delete',p,info,policy);if(location(state,card))removeField(state,card,'delete',p,info,policy);}
    }
    if(key==='PSYCHIC:1')flip(state,card,p,info,policy);
  }
}
function endEffects(state,p,policy,info){
  for(const card of [...state.players[p].lines.flat()]){
    if(!location(state,card)||card.faceDown)continue;const loc=location(state,card),key=keyOf(card);
    if(key==='LIFE:0'&&loc.covered)removeField(state,card,'delete',p,info,policy);
    if(key==='PLAGUE:4'&&isTop(state,card)){const target=pickCard(state,other(p),hidden(state).filter(c=>location(state,c).p===other(p)),'delete',info,policy,false);if(target)removeField(state,target,'delete',other(p),info,policy);if(location(state,card))flip(state,card,p,info,policy);}
    if(key==='LIGHT:1'&&isTop(state,card))draw(state,p,1);
    if(key==='FIRE:3'&&isTop(state,card)&&state.players[p].hand.length){const target=pickCard(state,p,exposed(state),'flip',info,policy);if(target&&targetScore(state,p,target,'flip',info,policy)>4){discardLowest(state,p,1,policy,info);flip(state,target,p,info,policy);}}
    if(key==='SPEED:3'&&isTop(state,card)){const target=pickCard(state,p,exposed(state).filter(c=>location(state,c).p===p&&c.id!==card.id),'move',info,policy);if(target&&targetScore(state,p,target,'move',info,policy)>2){move(state,target,bestLine(state,p),p,info,policy);if(location(state,card))flip(state,card,p,info,policy);}}
    if(key==='PSYCHIC:4'&&isTop(state,card)){const target=pickCard(state,p,exposed(state).filter(c=>location(state,c).p===other(p)),'return',info,policy);if(target&&targetScore(state,p,target,'return',info,policy)>3){removeField(state,target,'return',p,info,policy);if(location(state,card))flip(state,card,p,info,policy);}}
  }
}
function compile(state,p,policy=BASE_POLICY,info='fair'){
  updateControl(state,p);const blocked=state.noCompile[p];state.noCompile[p]=false;if(blocked)return;
  let eligible=[0,1,2].filter(line=>total(state,p,line)>=10&&total(state,p,line)>total(state,other(p),line));if(!eligible.length)return;
  if(state.control===p){useControl(state,p,policy,info);eligible=[0,1,2].filter(line=>total(state,p,line)>=10&&total(state,p,line)>total(state,other(p),line));if(!eligible.length)return;}
  eligible.sort((a,b)=>Number(state.players[p].protocols[a].compiled)-Number(state.players[p].protocols[b].compiled)||total(state,p,b)-total(state,other(p),b)-(total(state,p,a)-total(state,other(p),a)));
  const line=eligible[0],was=state.players[p].protocols[line].compiled;
  for(let q=0;q<2;q++){
    const escaped=[];
    for(const card of state.players[q].lines[line])if(!card.faceDown&&keyOf(card)==='SPEED:2')escaped.push(card);else{card.faceDown=false;state.players[card.owner].discard.push(card);}
    state.players[q].lines[line]=[];
    for(const card of escaped)state.players[q].lines[bestLine(state,q)].push(card);
  }
  if(was){const stolen=state.players[other(p)].deck.pop();if(stolen){stolen.owner=p;state.players[p].hand.push(stolen);}}
  else state.players[p].protocols[line].compiled=true;
  if(compiledCount(state,p)===3)state.winner=p;
}
function playMatch(policyA,policyB,infoA,infoB,decks,seed,maxTurns=110,engines=['v2','v2']){
  const state=freshState(decks,seed),policies=[policyA,policyB],infos=[infoA,infoB];
  while(state.winner==null&&state.turn<=maxTurns){const p=state.current;startEffects(state,p,policies[p],infos[p]);compile(state,p,policies[p],infos[p]);if(state.winner!=null)break;if(state.winner==null){if(ENGINE_CONFIGS[engines[p]]){const action=chooseActionV3(state,p,policies,infos,engines[p]);if(action)applyAction(state,p,action,policies[p],infos[p]);}else takeAction(state,p,policies[p],infos[p]);}if(state.players[p].hand.length>5)discardLowest(state,p,state.players[p].hand.length-5,policies[p],infos[p]);endEffects(state,p,policies[p],infos[p]);state.current=other(p);state.turn++;}
  if(state.winner==null){const score=[0,1].map(p=>compiledCount(state,p)*100+state.players[p].lines.reduce((n,_,l)=>n+total(state,p,l)-total(state,other(p),l),0)+state.players[p].hand.length*.2);state.winner=score[0]===score[1]?-1:(score[0]>score[1]?0:1);}
  return{winner:state.winner,turns:state.turn-1,compiled:[compiledCount(state,0),compiledCount(state,1)]};
}
function duelEngine(challenger,challengerInfo,champion,championInfo,matches,seedBase,challengerEngine='v3',championEngine='v2',offset=0){
  let win=0,loss=0,draw=0,turns=0;
  for(let i=0;i<matches;i++){
    const gameIndex=i+Math.max(0,offset),decks=decksFor(hash(seedBase,gameIndex,'decks')),seed=hash(seedBase,gameIndex,'game');
    const first=playMatch(challenger,champion,challengerInfo,championInfo,decks,seed,110,[challengerEngine,championEngine]);turns+=first.turns;if(first.winner===0)win++;else if(first.winner===1)loss++;else draw++;
    const swapped=playMatch(champion,challenger,championInfo,challengerInfo,[decks[1],decks[0]],seed,110,[championEngine,challengerEngine]);turns+=swapped.turns;if(swapped.winner===1)win++;else if(swapped.winner===0)loss++;else draw++;
  }
  return{win,loss,draw,rate:(win+draw*.5)/(win+loss+draw),avgTurns:turns/(win+loss+draw)};
}
function decksFor(seed){const random=rng(seed),pool=shuffle(PROTOCOLS,random);return[pool.slice(0,3),pool.slice(3,6)];}
function duel(challenger,champion,info,matches,seedBase){
  let win=0,loss=0,draw=0,turns=0;
  for(let i=0;i<matches;i++){
    const decks=decksFor(hash(seedBase,i,'decks')),seed=hash(seedBase,i,'game');
    const first=playMatch(challenger,champion,info,info,decks,seed);turns+=first.turns;if(first.winner===0)win++;else if(first.winner===1)loss++;else draw++;
    const swapped=playMatch(champion,challenger,info,info,[decks[1],decks[0]],seed);turns+=swapped.turns;if(swapped.winner===1)win++;else if(swapped.winner===0)loss++;else draw++;
  }
  return{win,loss,draw,rate:(win+draw*.5)/(win+loss+draw),avgTurns:turns/(win+loss+draw)};
}
function duelMixed(challenger,challengerInfo,champion,championInfo,matches,seedBase){
  let win=0,loss=0,draw=0,turns=0;
  for(let i=0;i<matches;i++){
    const decks=decksFor(hash(seedBase,i,'decks')),seed=hash(seedBase,i,'game');
    const first=playMatch(challenger,champion,challengerInfo,championInfo,decks,seed);turns+=first.turns;if(first.winner===0)win++;else if(first.winner===1)loss++;else draw++;
    const swapped=playMatch(champion,challenger,championInfo,challengerInfo,[decks[1],decks[0]],seed);turns+=swapped.turns;if(swapped.winner===1)win++;else if(swapped.winner===0)loss++;else draw++;
  }
  return{win,loss,draw,rate:(win+draw*.5)/(win+loss+draw),avgTurns:turns/(win+loss+draw)};
}
function mutate(base,random,scale){
  const next={};
  for(const key of KEYS){const factor=Math.exp((random()+random()+random()+random()-2)*scale);next[key]=Math.max(.05,base[key]*factor);}
  return next;
}
function train(info,seed,startPolicy=BASE_POLICY){
  const random=rng(seed);let champion={...startPolicy},history=[];
  for(let generation=0;generation<GENERATIONS;generation++){
    const candidates=[champion,...Array.from({length:POPULATION-1},()=>mutate(champion,random,.28*Math.pow(.88,generation)))];
    /* Every candidate plays the identical schedule; otherwise deck-order noise
       can look like learning and select a weaker policy. */
    const arenaSeed=hash(seed,generation,'arena');
    const ranked=candidates.map((policy,index)=>({policy,index,result:duel(policy,champion,info,MATCHES,arenaSeed)})).sort((a,b)=>b.result.rate-a.result.rate||b.result.win-a.result.win);
    champion={...ranked[0].policy};history.push({generation:generation+1,rate:ranked[0].result.rate,record:`${ranked[0].result.win}-${ranked[0].result.loss}-${ranked[0].result.draw}`});
    process.stderr.write(`${info} generation ${generation+1}/${GENERATIONS}: ${history.at(-1).record} ${(history.at(-1).rate*100).toFixed(1)}%\n`);
  }
  return{policy:champion,history,benchmark:duel(champion,BASE_POLICY,info,BENCHMARK,hash(seed,'benchmark'))};
}
function trainSearchEngine(challengerEngine='v4',championEngine='v3',startPolicy=currentOracle,championPolicy=currentOracle){
  const random=rng(hash(0xe701a11e,challengerEngine,championEngine));let champion={...startPolicy},history=[];
  for(let generation=0;generation<GENERATIONS;generation++){
    const candidates=[champion,...Array.from({length:POPULATION-1},()=>mutate(champion,random,.34*Math.pow(.86,generation)))],arenaSeed=hash(0xe701a11e,generation,'arena');
    const ranked=candidates.map((policy,index)=>({policy,index,result:duelEngine(policy,'oracle',championPolicy,'oracle',MATCHES,arenaSeed,challengerEngine,championEngine)})).sort((a,b)=>b.result.rate-a.result.rate||b.result.win-a.result.win||a.index-b.index);
    champion={...ranked[0].policy};history.push({generation:generation+1,rate:ranked[0].result.rate,record:`${ranked[0].result.win}-${ranked[0].result.loss}-${ranked[0].result.draw}`,policy:champion});
    process.stderr.write(`${challengerEngine} generation ${generation+1}/${GENERATIONS}: ${history.at(-1).record} ${(history.at(-1).rate*100).toFixed(1)}%\n`);
  }
  const benchmark=duelEngine(champion,'oracle',championPolicy,'oracle',BENCHMARK,hash(0xe701a11e,'benchmark'),challengerEngine,championEngine);
  return{policy:champion,history,benchmark};
}

const started=Date.now();
const currentFair={compiled:127.6737979994711,lane:5.438446753099108,ready:38.20988602156289,threat:79.5499645576447,hand:2.5411992852060283,card:.7729945806514877,effect:1.4230760434228484,denial:.6565275698681198,future:.41084831312478276,repeat:.8286885717575817,risk:.44768079171327035};
const currentOracle={compiled:74.98189882789869,lane:6.358032160460138,ready:66.25984683920818,threat:110.2625945091882,hand:2.4119836080861594,card:1.0244184369549243,effect:1.4453844960028632,denial:.9108084031771898,future:.5470667931025838,repeat:.970749245045437,risk:.31744436448861457};
const namedPolicies={base:BASE_POLICY,fair:currentFair,oracle:currentOracle};
if(EVOLVE_ENGINE){
  const result=trainSearchEngine(CHALLENGER_ENGINE,CHAMPION_ENGINE,currentOracle,currentOracle);
  console.log(JSON.stringify({engine:'compile-selfplay-engine-evolution',challenger:CHALLENGER_ENGINE,champion:CHAMPION_ENGINE,settings:{generations:GENERATIONS,population:POPULATION,matches:MATCHES,benchmark:BENCHMARK,challenger:ENGINE_CONFIGS[CHALLENGER_ENGINE],champion:ENGINE_CONFIGS[CHAMPION_ENGINE]},elapsedSeconds:(Date.now()-started)/1000,...result},null,2));
}else if(ENGINE_ARENA){
  const challengerPolicy=namedPolicies[CHALLENGER_POLICY]||currentOracle,championPolicy=namedPolicies[CHAMPION_POLICY]||currentOracle;
  const result=duelEngine(challengerPolicy,'oracle',championPolicy,'oracle',BENCHMARK,hash(0x7a41e10f,CHALLENGER_ENGINE,CHAMPION_ENGINE),CHALLENGER_ENGINE,CHAMPION_ENGINE,ARENA_OFFSET);
  console.log(JSON.stringify({engine:'compile-selfplay-engine-arena',challenger:CHALLENGER_ENGINE,champion:CHAMPION_ENGINE,challengerPolicy:CHALLENGER_POLICY,championPolicy:CHAMPION_POLICY,settings:{challenger:ENGINE_CONFIGS[CHALLENGER_ENGINE]||null,champion:ENGINE_CONFIGS[CHAMPION_ENGINE]||null,offset:ARENA_OFFSET,games:result.win+result.loss+result.draw},elapsedSeconds:(Date.now()-started)/1000,result},null,2));
}else if(LADDER_ARENA){
  const v4VsV3=duelEngine(currentOracle,'oracle',currentOracle,'oracle',BENCHMARK,0x4a31e0ff,'v4','v3');
  const v5VsV4=duelEngine(currentOracle,'oracle',currentOracle,'oracle',BENCHMARK,0x5a41e0ff,'v5','v4');
  console.log(JSON.stringify({engine:'compile-selfplay-v5-ladder',settings:{v3:ENGINE_CONFIGS.v3,v4:ENGINE_CONFIGS.v4,v5:ENGINE_CONFIGS.v5},elapsedSeconds:(Date.now()-started)/1000,v4VsV3,v5VsV4},null,2));
}else if(V3_ARENA){
  const fair=V3_BASELINE_ONLY?null:duelEngine(currentFair,'fair',currentFair,'fair',BENCHMARK,0x33f31a11),oracle=V3_BASELINE_ONLY?null:duelEngine(currentOracle,'oracle',currentOracle,'oracle',BENCHMARK,0xa31ce0ff);
  const baseline=(V3_BASELINE||V3_BASELINE_ONLY)?{fair:duelEngine(currentFair,'fair',BASE_POLICY,'fair',BENCHMARK,0xb451e111),oracle:duelEngine(currentOracle,'oracle',BASE_POLICY,'oracle',BENCHMARK,0xb451e0ff)}:null;
  const games=[fair,oracle,baseline?.fair,baseline?.oracle].filter(Boolean).reduce((n,result)=>n+result.win+result.loss+result.draw,0);
  console.log(JSON.stringify({engine:'compile-selfplay-v3-full-turn',settings:{depth:V3_DEPTH,beam:V3_BEAM,maxNodes:V3_NODES,games},elapsedSeconds:(Date.now()-started)/1000,...(fair?{fairVsCurrent:fair,oracleVsCurrent:oracle}:{}),...(baseline?{fairVsBaseline:baseline.fair,oracleVsBaseline:baseline.oracle}:{})},null,2));
}else{
  const fair=train('fair',0x51f15e11);
  /* The all-information fighter starts from the fair champion, so extra private
     information can only add to an already strong public-information policy. */
  const oracle=train('oracle',0x0ac1e0ff,fair.policy);
  const cross={oracleVsFair:duelMixed(oracle.policy,'oracle',fair.policy,'fair',Math.max(80,Math.floor(BENCHMARK/2)),0x91c05e12)};
  const report={engine:'compile-selfplay-v2-control',settings:{generations:GENERATIONS,population:POPULATION,matchesPerCandidate:MATCHES*2,benchmarkGames:BENCHMARK*2},gamesApprox:(GENERATIONS*POPULATION*MATCHES*2+BENCHMARK*2)*2,elapsedSeconds:(Date.now()-started)/1000,fair,oracle,cross};
  console.log(JSON.stringify(COMPACT?{...report,fair:{policy:fair.policy,benchmark:fair.benchmark},oracle:{policy:oracle.policy,benchmark:oracle.benchmark}}:report,null,2));
}

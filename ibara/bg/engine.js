/* スレイザスパイア — run engine (board-game rules). Map, rooms, rewards, merchant, campfire, events,
   relics, potions, decks, act transitions, keys, Act IV, Ascension. No DOM. Host-authoritative. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, CAP = D.CAP;

/* ------------------------------------------------------------------ RNG (mulberry32, serializable) */
function rngNext(run) {
  var t = (run.rs = (run.rs + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function remove(arr, x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }

function Game(run, io) {
  this.run = run;
  this.io = io || {};
  this.combat = null;
  this.cmdQ = Promise.resolve();
}
STS.Game = Game;
var G = Game.prototype;

G.rand = function (n) { return Math.floor(rngNext(this.run) * n); };
G.shuffle = function (a) { for (var i = a.length - 1; i > 0; i--) { var j = this.rand(i + 1); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
G.uid = function () { return this.run.uid++; };
G.emit = function (ev) { this.evN = (this.evN || 0) + 1; ev.sq = this.evN; if (this.io.emit) this.io.emit(ev); };
G.update = function () { if (this.io.update) this.io.update(); };
G.checkpoint = function () { if (this.io.checkpoint) this.io.checkpoint(this.snapshot()); };
G.snapshot = function () { return clone(this.run); };
G.ask = function (pi, q) {
  var self = this;
  q.pi = pi;
  if (!this.io.ask) return Promise.resolve(STS.autoAnswer(this, pi, q));
  return Promise.resolve(this.io.ask(pi, q)).then(function (a) { return a; });
};
G.askAll = function (q, who) {
  var self = this;
  var ps = who || this.run.players.map(function (p) { return p.i; });
  return Promise.all(ps.map(function (pi) { return self.ask(pi, Object.assign({}, q)); }));
};
G.P = function (i) { return this.run.players[i]; };
G.n = function () { return this.run.players.length; };
G.log = function (msg) { this.run.log.push(msg); if (this.run.log.length > 60) this.run.log.shift(); this.emit({ t: 'log', msg: msg }); };

/* ------------------------------------------------------------------ new run */
Game.newRun = function (cfg) {
  // cfg: { players: [{name, ch, unlock: 0..3}], asc, seed, colorless: bool, act4: bool }
  var seed = (cfg.seed >>> 0) || ((Date.now() ^ 0x5bd1e995) >>> 0);
  var run = { v: D.RULES_VERSION, seed: seed, rs: seed, uid: 1, asc: cfg.asc || 0, act: 1, phase: 'new', room: null, combat: null,
    unlock: { colorless: !!cfg.colorless, act4: !!cfg.act4 }, keys: { ruby: false, sapphire: false, emerald: false },
    bosses: 0, log: [], result: null, decks: {}, map: null, players: [], charUnlock: Object.assign({}, cfg.charUnlock || {}), portal: false };
  var g = new Game(run);
  var n = cfg.players.length;
  if (n < 1 || n > 4) throw new Error('1〜4人で遊べます。');
  var seen = {};
  cfg.players.forEach(function (pc, i) {
    if (!D.CHARS[pc.ch]) throw new Error('キャラクターが不正です。');
    if (seen[pc.ch]) throw new Error('同じキャラクターは選べません。');
    seen[pc.ch] = true;
    var ch = D.CHARS[pc.ch];
    var p = { i: i, name: pc.name || ch.name, ch: pc.ch, maxHp: ch.hp, hp: ch.hp, gold: 0, row: i, deck: [], relics: [], potions: [],
      rewardDeck: [], rareDeck: [], removed: [], unlock: Math.max(0, Math.min(3, pc.unlock | 0)), flags: {} };
    ch.deck.forEach(function (id) { p.deck.push({ u: g.uid(), id: id, up: false }); });
    if (run.asc >= 2) p.maxHp -= 1;
    p.hp = p.maxHp;
    if (run.asc >= 5) p.deck.push({ u: g.uid(), id: 'AscendersBane', up: false });
    if (run.asc >= 9) p.hp -= 1;
    if (n === 1) { p.gold = 2; p.relics.push({ id: 'LoadedDie' }); }
    run.players.push(p);
  });
  return run;
};

/* Reward decks for a character, honouring that player's unlock level. Top of deck = end of array. */
G.buildRewardDecks = function (p) {
  var self = this, normal = [], rare = [];
  Object.keys(STS.CARDS).forEach(function (id) {
    var d = STS.CARDS[id];
    if (d.ch !== p.ch) return;
    if (d.unlock && d.unlock > p.unlock) return;
    if (d.r === 'C') { normal.push(id); normal.push(id); }
    else if (d.r === 'U') normal.push(id);
    else if (d.r === 'R') rare.push(id);
  });
  normal.push('Ticket');
  if (p.unlock >= 2) normal.push('Ticket');
  p.rewardDeck = this.shuffle(normal);
  p.rareDeck = this.shuffle(rare);
};

G.setupDecks = function () {
  var run = this.run, self = this, d = run.decks;
  d.relics = this.shuffle(Object.keys(STS.RELICS).filter(function (id) { return STS.RELICS[id].type === 'normal'; }));
  d.bossRelics = this.shuffle(Object.keys(STS.RELICS).filter(function (id) { return STS.RELICS[id].type === 'boss'; }));
  var pots = [];
  Object.keys(STS.POTIONS).forEach(function (id) { for (var i = 0; i < (STS.POTIONS[id].copies || 1); i++) pots.push(id); });
  d.potions = this.shuffle(pots);
  var curses = [];
  Object.keys(STS.CARDS).forEach(function (id) { var c = STS.CARDS[id]; if (c.t === 'C' && c.copies) for (var i = 0; i < c.copies; i++) curses.push(id); });
  d.curses = this.shuffle(curses);
  d.colorless = run.unlock.colorless ? this.shuffle(Object.keys(STS.CARDS).filter(function (id) { return STS.CARDS[id].ch === 'C'; })) : [];
  d.prismatic = 4;
  run.players.forEach(function (p) { self.buildRewardDecks(p); });
};

/* ------------------------------------------------------------------ main flow */
G.start = async function () {
  var run = this.run;
  if (run.phase === 'new') {
    this.setupDecks();
    this.setupAct(1);
    run.phase = 'neow';
    this.checkpoint();
  }
  if (run.phase === 'neow') { await this.neow(); run.phase = 'map'; run.room = null; this.checkpoint(); }
  while (run.phase !== 'over') {
    if (run.phase === 'map') await this.mapPhase();
    else if (run.phase === 'room') await this.playRoom();
    else if (run.phase === 'bossRelic') await this.bossRelicDraft();
    else if (run.phase === 'actEnd') await this.actEnd();
    else throw new Error('bad phase ' + run.phase);
  }
  this.update();
  return run.result;
};

/* ------------------------------------------------------------------ acts and map */
G.setupAct = function (act) {
  var run = this.run, d = run.decks, self = this;
  run.act = act;
  var A = STS.ACTS[act];
  var asc = run.asc;
  if (act < 4) {
    d.enc = this.shuffle(A.encounters(asc).slice());
    d.elite = this.shuffle(A.elites(asc).slice());
    d.events = this.shuffle(A.events(asc, run.unlock.colorless).slice());
    d.enc1st = act === 1 ? this.shuffle(A.first.slice()) : [];
    var bosses = A.bosses(asc);
    run.boss = bosses[this.rand(bosses.length)];
    run.boss2 = null;
    if (act === 3 && asc >= 13) { var rest = bosses.filter(function (b) { return b !== run.boss; }); run.boss2 = rest[this.rand(rest.length)]; }
  } else { d.enc = []; d.elite = A.elites(asc).slice(); d.events = []; d.enc1st = []; run.boss = 'Heart'; run.boss2 = null; }
  d.summons = {};
  Object.keys(STS.SUMMONS).forEach(function (k) { d.summons[k] = self.shuffle(STS.SUMMONS[k](asc).slice()); });
  this.buildMap(act);
  run.floorQ = 0;
};
G.buildMap = function (act) {
  var run = this.run;
  if (act === 4) {
    var rows = D.ACT4.map(function (t, i) { return t === 'E' && run.asc < 11 ? 'X' : t; });
    var nodes = {}, edges = {};
    rows.forEach(function (t, r) { var k = r + '-3'; nodes[k] = { r: r, c: 3, t: t }; edges[k] = r < rows.length - 1 ? [(r + 1) + '-3'] : []; });
    run.map = { act: 4, rows: rows.length, nodes: nodes, edges: edges, pos: null, visited: [] };
    return;
  }
  var variants = D.MAPS[act];
  var mi = this.rand(variants.length);
  var M = variants[mi];
  var needEmerald = run.unlock.act4 && !run.keys.emerald;
  var dark = this.shuffle((needEmerald ? D.TOKENS.darkEmerald : D.TOKENS.dark).slice());
  var light = this.shuffle(D.TOKENS.light.slice());
  var nodes2 = {}, edges2 = {};
  M.rows.forEach(function (row, r) {
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === '.') continue;
      if (ch === 'D') ch = dark.shift();
      else if (ch === 'L') ch = light.shift();
      var key = r + '-' + c;
      nodes2[key] = { r: r, c: c, t: ch, token: row[c] === 'D' ? 'dark' : row[c] === 'L' ? 'light' : null };
      edges2[key] = [];
    }
  });
  M.edges.forEach(function (e) { if (edges2[e[0]]) edges2[e[0]].push(e[1]); });
  run.map = { act: act, variant: mi, rows: M.rows.length, nodes: nodes2, edges: edges2, pos: null, visited: [] };
};
G.reachable = function (wing) {
  var m = this.run.map;
  if (m.pos == null) {
    var bottom = Object.keys(m.nodes).filter(function (k) { return m.nodes[k].r === 0; });
    return bottom;
  }
  var cur = m.nodes[m.pos];
  if (this.run.portal && !wing) return Object.keys(m.nodes).filter(function (k) { return m.nodes[k].r > cur.r; });
  if (wing) return Object.keys(m.nodes).filter(function (k) { return m.nodes[k].r === cur.r + 1; });
  return m.edges[m.pos] || [];
};
G.mapPhase = async function () {
  var run = this.run, self = this;
  run.room = null;
  this.checkpoint();
  this.update();
  var opts = this.reachable(false);
  var wingOwners = run.portal ? [] : run.players.filter(function (p) { return self.relicOf(p, 'WingBoots'); }).map(function (p) { return p.i; });
  var wingOpts = wingOwners.length ? this.reachable(true).filter(function (k) { return opts.indexOf(k) < 0; }) : [];
  var choice;
  if (opts.length + wingOpts.length === 1) choice = opts[0] || wingOpts[0];
  else {
    var votes = await this.askAll({ type: 'map', title: run.portal ? '秘密のポータル：現在の階より上の好きな部屋を選んでください' : '次の部屋を選んでください', options: opts, wing: wingOpts, wingOwners: wingOwners, portal: !!run.portal });
    choice = this.tally(votes, opts.concat(wingOpts));
  }
  if (wingOpts.indexOf(choice) >= 0) {
    // Wing Boots: one use from a holder.
    var owner = run.players[wingOwners[0]];
    var r = this.relicOf(owner, 'WingBoots');
    r.n = (r.n || 0) + 1;
    if (r.n >= 3) this.loseRelic(owner, 'WingBoots');
    this.log(owner.name + 'のウィングブーツで道を外れて進みました。');
  }
  run.portal = false;
  this.moveTo(choice);
};
G.tally = function (votes, valid) {
  var count = {}, best = null;
  votes.forEach(function (v) { if (valid.indexOf(v) >= 0) count[v] = (count[v] || 0) + 1; });
  var max = 0;
  Object.keys(count).forEach(function (k) { if (count[k] > max) max = count[k]; });
  var tied = Object.keys(count).filter(function (k) { return count[k] === max; });
  if (tied.length === 1) return tied[0];
  if (tied.indexOf(votes[0]) >= 0) return votes[0];
  return tied[0] || valid[0];
};
G.moveTo = function (key) {
  var run = this.run, m = run.map;
  m.pos = key; m.visited.push(key);
  var node = m.nodes[key];
  run.phase = 'room';
  run.room = { t: node.t, key: key, step: 'enter', first: run.act === 1 && node.r === 0 };
  this.emit({ t: 'move', key: key });
};
G.playRoom = async function () {
  var run = this.run, room = run.room;
  var t = room.t;
  if (room.step === 'enter') {
    this.emit({ t: 'room', room: t });
    if (t === '?') {
      var self = this;
      for (var i = 0; i < run.players.length; i++) if (this.relicOf(run.players[i], 'SsserpentHead')) this.gainGold(run.players[i], 2);
    }
  }
  if (t === 'M') await this.roomEncounter();
  else if (t === 'E' || t === 'É') await this.roomElite(t === 'É');
  else if (t === 'B') await this.roomBoss();
  else if (t === '?') await this.roomEvent();
  else if (t === '$') await this.roomShop();
  else if (t === 'R') await this.roomRest();
  else if (t === 'T') await this.roomTreasure();
  else if (t === 'X') await this.roomEmpty();
  if (run.phase === 'room') this.afterRoom();
};
G.afterRoom = function () {
  var run = this.run;
  if (run.phase !== 'room') return;
  this.resetRoomFlags();
  run.phase = 'map'; run.room = null;
};
G.resetRoomFlags = function () { this.run.players.forEach(function (p) { p.relics.forEach(function (r) { delete r.usedRoom; }); }); };

/* ------------------------------------------------------------------ encounter decks */
G.drawEncounter = function (deckName) {
  var deck = this.run.decks[deckName];
  if (!deck.length) return null;
  var id = deck.pop();
  if (deckName !== 'enc1st') deck.unshift(id);
  return id;
};
G.drawSummon = function (key, behaviour) {
  var deck = this.run.decks.summons[key];
  if (!deck || !deck.length) return null;
  if (behaviour) {
    var at = deck.findIndex(function (entry) { return String(entry).split('|')[1] === behaviour; });
    return at < 0 ? null : deck.splice(at, 1)[0];
  }
  return deck.pop();
};
G.returnSummons = function (cb) {
  var d = this.run.decks.summons;
  cb.s.enemies.forEach(function (e) { if (e.summonKey && d[e.summonKey]) d[e.summonKey].unshift(e.summonEntry || e.id); });
};

/* ------------------------------------------------------------------ combat rooms */
G.roomEncounter = async function () {
  var run = this.run, room = run.room, self = this;
  if (room.step === 'enter') {
    room.encs = run.players.map(function () { return self.drawEncounter(room.first ? 'enc1st' : 'enc'); });
    room.step = 'fight';
  }
  if (room.step === 'fight') {
    var result = await this.fight({ kind: 'normal', encs: room.encs });
    if (result !== 'victory') return;
    room.step = 'rewards';
    room.rewards = run.players.map(function (p, i) {
      var enc = STS.ENCOUNTERS[room.encs[p.row] || room.encs[i]] || {};
      var rw = enc.rewards || {};
      if (room.fledRows && room.fledRows.indexOf(p.row) >= 0) rw = rw;
      return self.makeRewards(p, { gold: rw.gold || 0, potion: rw.potion ? 1 : 0, cards: [{ kind: 'normal' }] });
    });
    this.checkpoint();
  }
  if (room.step === 'rewards') await this.claimRewards();
};
G.roomElite = async function (burning) {
  var run = this.run, room = run.room, self = this;
  if (room.step === 'enter') { room.elite = this.drawEncounter('elite'); room.step = 'fight'; }
  if (room.step === 'fight') {
    var result = await this.fight({ kind: 'elite', elite: room.elite, burning: burning });
    if (result !== 'victory') return;
    if (burning && !run.keys.emerald) { run.keys.emerald = true; this.log('エメラルドの鍵を手に入れた！'); this.emit({ t: 'key', k: 'emerald' }); }
    var enc = STS.ENCOUNTERS[room.elite] || {};
    var rw = enc.rewards || { gold: 2, relic: 1 };
    room.step = 'rewards';
    room.sapphireOK = this.sapphireAvailable();
    room.rewards = run.players.map(function (p) {
      return self.makeRewards(p, { gold: rw.gold || 0, potion: rw.potion ? 1 : 0, relic: rw.relic ? 1 : 0, cards: [{ kind: run.act >= 2 ? 'upgraded' : 'normal' }] });
    });
    this.checkpoint();
  }
  if (room.step === 'rewards') {
    if (room.sapphireOK && !room.sapphireAsked) { room.sapphireAsked = true; await this.sapphireVote(room.rewards); }
    await this.claimRewards();
  }
};
G.roomBoss = async function () {
  var run = this.run, room = run.room, self = this;
  if (room.step === 'enter') { room.boss = run.boss; room.step = 'fight'; }
  if (room.step === 'fight') {
    var result = await this.fight({ kind: 'boss', boss: room.boss });
    if (result !== 'victory') return;
    run.bosses++;
    this.emit({ t: 'bossDown', act: run.act });
    if (run.act === 3 && run.boss2 && !room.second) {
      // Ascension 13: fight a second, different Act III boss.
      room.second = true; room.boss = run.boss2; room.step = 'fight';
      this.checkpoint();
      return this.roomBoss();
    }
    room.step = 'rewards';
    if (run.act <= 2) {
      var gold = run.asc >= 10 ? 2 : 3;
      room.rewards = run.players.map(function (p) { return self.makeRewards(p, { gold: gold, cards: [{ kind: 'rare' }] }); });
    } else room.rewards = run.players.map(function (p) { return self.makeRewards(p, {}); });
    this.checkpoint();
  }
  if (room.step === 'rewards') {
    await this.claimRewards();
    room.step = 'done';
  }
  if (run.act <= 2) run.phase = 'bossRelic';
  else run.phase = 'actEnd';
};
G.roomEmpty = async function () {
  await this.askAll({ type: 'info', title: '第4幕', text: 'この部屋には何もない。（アセンション11以上では第4幕のエリートと戦う）', ok: '進む' });
};

/* Build and run a combat. spec: {kind, encs|elite|boss, burning, rows, eventFight} */
G.fight = async function (spec) {
  var run = this.run, self = this;
  var cb;
  if (run.combat && run.combat.phase !== 'over') {
    cb = new STS.Combat(this, run.combat);
  } else {
    var cspec = { kind: spec.kind, enc: null, burning: spec.burning };
    if (spec.kind === 'boss') cspec.enc = 'Boss:' + spec.boss;
    else if (spec.kind === 'elite') cspec.enc = spec.elite;
    if (spec.rows) cspec.rows = spec.rows;
    var encSpec = spec.kind === 'boss' ? STS.ENCOUNTERS[cspec.enc] : spec.kind === 'elite' ? STS.ENCOUNTERS[spec.elite] : null;
    if (encSpec && encSpec.rows) cspec.rows = encSpec.rows(this.n());
    cb = STS.Combat.create(this, cspec);
    run.combat = cb.s;
    if (spec.kind === 'normal') {
      // One encounter card per player row.
      for (var r = 0; r < spec.encs.length; r++) {
        var e = STS.ENCOUNTERS[spec.encs[r]];
        if (!e) continue;
        cb.s.encs = spec.encs;
        await e.build(cb, r);
      }
    } else {
      await encSpec.build(cb);
    }
  }
  this.combat = cb;
  this.update();
  var result = await cb.run();
  this.combat = null;
  await this.endCombat(cb, result);
  return result;
};
G.endCombat = async function (cb, result) {
  var run = this.run, self = this;
  run.lastCombat = { result: result, kind: cb.s.kind, rounds: cb.s.round };
  this.returnSummons(cb);
  if (result === 'victory') {
    for (var i = 0; i < cb.s.pcs.length; i++) {
      var pc = cb.s.pcs[i], P = this.P(pc.i);
      await this.relicHook(cb, pc, 'endCombat');
    }
  }
  // Reset decks: exhaust, discard, powers return; status cards return to supply.
  run.combat = null;
  if (result === 'defeat') { await this.gameOver('defeat'); return; }
  // Whetstone / War Paint acquired during combat.
  for (var p = 0; p < run.players.length; p++) await this.usePendingRelics(run.players[p]);
  this.checkpoint();
};

/* ------------------------------------------------------------------ rewards */
G.makeRewards = function (p, o) {
  var list = [];
  if (o.gold) list.push({ k: 'gold', n: o.gold });
  for (var i = 0; i < (o.potion || 0); i++) list.push({ k: 'potion' });
  for (var j = 0; j < (o.relic || 0); j++) list.push({ k: 'relic' });
  (o.cards || []).forEach(function (c) { list.push({ k: 'card', kind: c.kind, n: c.n || 3 }); });
  // Orrery-like extras are granted immediately on pickup, not here.
  return { pi: p.i, items: list, done: false };
};
G.claimRewards = async function () {
  var run = this.run, room = run.room, self = this;
  await Promise.all(room.rewards.map(function (rw) { return rw.done ? null : self.claimFor(rw); }));
};
G.claimFor = async function (rw) {
  var self = this, p = this.P(rw.pi);
  while (!rw.done) {
    var open = rw.items.filter(function (it) { return !it.taken; });
    if (!open.length) { rw.done = true; break; }
    var q = { type: 'reward', title: '報酬', items: rw.items.map(function (it, i) { return Object.assign({ idx: i }, it); }) };
    var ans = await this.ask(p.i, q);
    if (ans === 'done' || ans == null) { rw.done = true; break; }
    var it = rw.items[ans];
    if (!it || it.taken) continue;
    it.taken = true;
    if (it.k === 'gold') this.gainGold(p, it.n);
    else if (it.k === 'potion') await this.offerPotion(p);
    else if (it.k === 'relic') await this.offerRelic(p, 'normal', it.fixed);
    else if (it.k === 'card') await this.cardReward(p, it.kind, it.n);
    else if (it.k === 'colorless') await this.cardReward(p, 'colorless', 3);
    this.checkpoint();
  }
};

/* Card reward: reveal top 3 of the reward deck (Golden Ticket → top rare); take one or skip. */
/* Card reward decks of a character: the player's own, or (for A Note for Yourself) a character nobody plays,
   built from that character's unlock level the first time it is needed. */
G.characterDecks = function (ch) {
  var run = this.run;
  for (var i = 0; i < run.players.length; i++) if (run.players[i].ch === ch) return run.players[i];
  var f = run.decks.foreign || (run.decks.foreign = {});
  if (!f[ch]) {
    var holder = { ch: ch, unlock: Math.max(0, Math.min(3, run.charUnlock[ch] | 0)), rewardDeck: [], rareDeck: [] };
    this.buildRewardDecks(holder);
    f[ch] = holder;
  }
  return f[ch];
};
G.revealCards = function (p, kind, n) {
  var out = [], d = this.run.decks;
  for (var i = 0; i < n; i++) {
    var id = null;
    if (kind === 'rare') id = p.rareDeck.pop();
    else if (kind === 'colorless') id = d.colorless.pop();
    else {
      id = p.rewardDeck.pop();
      if (id === 'Ticket') { p.rewardDeck.unshift('Ticket'); id = p.rareDeck.pop(); if (id) out.push({ id: id, from: 'rare' }); continue; }
    }
    if (id) out.push({ id: id, from: kind === 'colorless' ? 'colorless' : kind === 'rare' ? 'rare' : 'normal' });
  }
  return out;
};
G.returnCards = function (p, cards) {
  var d = this.run.decks;
  cards.forEach(function (c) {
    if (c.from === 'rare') p.rareDeck.unshift(c.id);
    else if (c.from === 'colorless') d.colorless.unshift(c.id);
    else p.rewardDeck.unshift(c.id);
  });
};
G.cardReward = async function (p, kind, n, o) {
  o = o || {};
  var upg = kind === 'upgraded', src = o.src || p;
  var cards = this.revealCards(src, kind === 'upgraded' ? 'normal' : kind, n || 3);
  if (!cards.length) return null;
  var ans = await this.ask(p.i, { type: 'cardReward', title: o.title || (kind === 'rare' ? 'レアカード報酬' : kind === 'colorless' ? '無色カード報酬' : upg ? 'カード報酬（アップグレード済み）' : 'カード報酬'),
    cards: cards.map(function (c, i) { return { idx: i, id: c.id, up: upg }; }), skip: !o.noSkip });
  var picked = null;
  if (ans != null && ans >= 0 && cards[ans]) { picked = cards.splice(ans, 1)[0]; await this.addCard(p, picked.id, upg); }
  this.returnCards(src, cards);
  return picked ? picked.id : null;
};

/* ------------------------------------------------------------------ deck operations */
G.addCard = async function (p, id, up, o) {
  o = o || {};
  var d = STS.CARDS[id];
  if (d.t === 'C' && this.relicOf(p, 'Omamori')) { this.log(p.name + '：お守りで呪いを防いだ'); return null; }
  var c = { u: this.uid(), id: id, up: !!up };
  if (!c.up && d.t === 'A' && this.relicOf(p, 'MoltenEgg')) { c.up = true; this.useEgg(p, 'MoltenEgg'); }
  if (!c.up && d.t === 'S' && this.relicOf(p, 'ToxicEgg')) { c.up = true; this.useEgg(p, 'ToxicEgg'); }
  p.deck.push(c);
  this.emit({ t: 'gainCard', i: p.i, id: id, up: c.up });
  return c;
};
G.useEgg = function (p, id) { var r = this.relicOf(p, id); r.n = (r.n || 0) + 1; if (r.n >= 3) this.loseRelic(p, id); };
G.gainCurse = async function (p) {
  if (this.relicOf(p, 'Omamori')) { this.log(p.name + '：お守りで呪いを防いだ'); return null; }
  var id = this.run.decks.curses.pop();
  if (!id) return null;
  this.log(p.name + '：呪い「' + STS.CARDS[id].name + '」を得た');
  return this.addCard(p, id, false);
};
G.removable = function (p) { return p.deck.filter(function (c) { return !STS.CARDS[c.id].noRemove; }); };
G.removeCard = async function (p, c) {
  if (!remove(p.deck, c)) return;
  var d = STS.CARDS[c.id];
  if (d.t === 'C' && d.copies) this.run.decks.curses.unshift(c.id); else p.removed.push(c);
  this.emit({ t: 'removeCard', i: p.i, id: c.id });
  if (c.id === 'Parasite') { p.hp = Math.max(0, p.hp - 2); this.log(p.name + '：寄生を除去してHPを2失った'); if (p.hp <= 0) await this.outOfCombatDeath(p); }
};
G.transformCard = async function (p, c) {
  if (!remove(p.deck, c)) return null;
  p.removed.push(c);
  // Replacement: top card of that character's reward deck (Golden Ticket → top rare).
  var id = p.rewardDeck.pop();
  if (id === 'Ticket') { p.rewardDeck.unshift('Ticket'); id = p.rareDeck.pop(); }
  if (!id) return null;
  var nc = await this.addCard(p, id, false);
  this.emit({ t: 'transform', i: p.i, from: c.id, to: id });
  return nc;
};
G.upgradable = function (p) { return p.deck.filter(function (c) { var d = STS.CARDS[c.id]; return !c.up && d.t !== 'C' && d.t !== 'T' && !d.noUpgrade; }); };
G.pickDeck = async function (p, list, min, max, title, o) {
  if (!list.length) return [];
  max = Math.min(max, list.length); min = Math.min(min, max);
  var ans = await this.ask(p.i, { type: 'deck', title: title, min: min, max: max, cards: list.map(function (c) { return { u: c.u, id: c.id, up: c.up }; }), preview: o && o.preview });
  var out = [];
  (ans || []).forEach(function (u) { list.forEach(function (c) { if (c.u === u && out.indexOf(c) < 0) out.push(c); }); });
  for (var i = 0; out.length < min && i < list.length; i++) if (out.indexOf(list[i]) < 0) out.push(list[i]);
  return out.slice(0, max);
};
G.upgradeCards = async function (p, n, title, filter) {
  var list = this.upgradable(p).filter(function (c) { return !filter || filter(c); });
  var cs = await this.pickDeck(p, list, Math.min(n, list.length), n, title || ('アップグレードするカードを' + n + '枚選択'), { preview: 'upgrade' });
  cs.forEach(function (c) { c.up = true; });
  if (cs.length) this.emit({ t: 'upgrade', i: p.i, ids: cs.map(function (c) { return c.id; }) });
  return cs;
};
G.removeCards = async function (p, n, title, optional) {
  var list = this.removable(p);
  var cs = await this.pickDeck(p, list, optional ? 0 : Math.min(n, list.length), n, title || ('除去するカードを' + n + '枚選択'));
  for (var i = 0; i < cs.length; i++) await this.removeCard(p, cs[i]);
  return cs;
};
G.transformCards = async function (p, n, title) {
  var list = p.deck.filter(function (c) { var d = STS.CARDS[c.id]; return d.t !== 'C' && !d.noRemove; });
  var cs = await this.pickDeck(p, list, Math.min(n, list.length), n, title || ('変化させるカードを' + n + '枚選択'));
  for (var i = 0; i < cs.length; i++) await this.transformCard(p, cs[i]);
  return cs;
};
G.upgradeRandom = function (p, n) {
  var list = this.upgradable(p), out = [];
  for (var i = 0; i < n && list.length; i++) { var c = list.splice(this.rand(list.length), 1)[0]; c.up = true; out.push(c); }
  if (out.length) this.emit({ t: 'upgrade', i: p.i, ids: out.map(function (c) { return c.id; }) });
  return out;
};

/* ------------------------------------------------------------------ gold, HP */
G.gainGold = function (p, n) {
  if (n > 0 && this.relicOf(p, 'Ectoplasm')) { this.log(p.name + '：エクトプラズムのためゴールドを得られない'); return 0; }
  p.gold = Math.max(0, p.gold + n);
  this.emit({ t: 'gold', i: p.i, n: n });
  return n;
};
G.maxHp = function (p) { return this.relicOf(p, 'MarkOfPain') ? Math.min(p.maxHp, 6) : p.maxHp; };
G.heal = function (p, n) {
  var max = this.maxHp(p), before = p.hp;
  p.hp = Math.min(max, p.hp + n);
  if (p.hp > before) this.emit({ t: 'heal', i: p.i, n: p.hp - before });
  return p.hp - before;
};
G.loseHpOut = async function (p, n) {
  p.hp -= n;
  this.emit({ t: 'hp', i: p.i, n: -n });
  if (p.hp <= 0) await this.outOfCombatDeath(p);
};
G.outOfCombatDeath = async function (p) {
  var saved = await this.tryFairy(p.i, null);
  if (!saved) { p.hp = 0; await this.gameOver('defeat'); }
};
G.tryFairy = async function (pi, cb) {
  var p = this.P(pi);
  var idx = p.potions.indexOf('Fairy');
  if (idx < 0) return false;
  p.potions.splice(idx, 1);
  this.run.decks.potions.unshift('Fairy');
  p.hp = 2;
  this.emit({ t: 'fairy', i: pi });
  this.log(p.name + '：瓶詰めの妖精でHP2になった');
  return true;
};

/* ------------------------------------------------------------------ potions */
G.potionLimit = function () { return this.run.asc >= 4 ? CAP.potionsA4 : CAP.potions; };
G.offerPotion = async function (p, id) {
  var d = this.run.decks;
  if (this.relicOf(p, 'Sozu')) { this.log(p.name + '：ソズのためポーションを得られない'); return; }
  id = id || d.potions.pop();
  if (!id) return;
  await this.receivePotion(p, id, true);
};
/* At the limit: skip, pass to a player below the limit, or discard/use one and then gain it. */
G.receivePotion = async function (p, id, allowSkip) {
  var self = this, lim = this.potionLimit(), d = this.run.decks;
  for (;;) {
    var others = this.run.players.filter(function (o) { return o !== p && o.potions.length < lim && !self.relicOf(o, 'Sozu'); }).map(function (o) { return o.i; });
    var full = p.potions.length >= lim;
    var ans = await this.ask(p.i, { type: 'potion', title: 'ポーション', id: id, full: full, potions: p.potions.slice(), others: others, skip: allowSkip !== false });
    if (ans == null || ans.act === 'skip') { d.potions.unshift(id); return; }
    if (ans.act === 'take' && !full) { p.potions.push(id); this.emit({ t: 'gainPotion', i: p.i, id: id }); return; }
    if (ans.act === 'give' && others.indexOf(ans.to) >= 0) { this.P(ans.to).potions.push(id); this.emit({ t: 'gainPotion', i: ans.to, id: id }); return; }
    if (ans.act === 'discard' && ans.slot != null && p.potions[ans.slot]) { d.potions.unshift(p.potions.splice(ans.slot, 1)[0]); continue; }
    if (ans.act === 'use' && ans.slot != null && p.potions[ans.slot]) { await this.usePotionOut(p.i, ans.slot); continue; }
    if (!full) { p.potions.push(id); return; }
  }
};
G.usePotion = async function (pi, slot, cb, cmd) {
  var p = this.P(pi), id = p.potions[slot];
  if (!id) throw new Error('ポーションがありません。');
  var def = STS.POTIONS[id];
  if (!cb) return this.usePotionOut(pi, slot);
  if (def.passive) throw new Error('このポーションは自動で使われます。');
  if (def.dieOnly) throw new Error('ダイスを振った直後にだけ使えます。');
  p.potions.splice(slot, 1);
  this.run.decks.potions.unshift(id);
  this.emit({ t: 'usePotion', i: pi, id: id });
  cb.log(p.name + '：' + def.name);
  await def.use(cb, cb.pc(pi), cmd || {});
  cb.checkEnd();
};
G.usePotionOut = async function (pi, slot) {
  var p = this.P(pi), id = p.potions[slot];
  var def = STS.POTIONS[id];
  if (!def || !def.out) throw new Error('戦闘外では使えないポーションです。');
  p.potions.splice(slot, 1);
  this.run.decks.potions.unshift(id);
  this.emit({ t: 'usePotion', i: pi, id: id });
  await def.out(this, p);
};
G.givePotion = function (from, slot, to) {
  var a = this.P(from), b = this.P(to), id = a.potions[slot];
  if (!id) throw new Error('ポーションがありません。');
  if (b.potions.length >= this.potionLimit()) throw new Error('相手のポーションが上限です。');
  if (this.relicOf(b, 'Sozu')) throw new Error('相手はポーションを得られません。');
  a.potions.splice(slot, 1); b.potions.push(id);
  this.emit({ t: 'givePotion', from: from, to: to, id: id });
};

/* ------------------------------------------------------------------ relics */
G.relicOf = function (p, id) { for (var i = 0; i < p.relics.length; i++) if (p.relics[i].id === id) return p.relics[i]; return null; };
G.hasRelic = function (p, id) { return !!this.relicOf(p, id); };
G.loseRelic = function (p, id) {
  for (var i = 0; i < p.relics.length; i++) if (p.relics[i].id === id) { var r = p.relics.splice(i, 1)[0]; this.emit({ t: 'loseRelic', i: p.i, id: id }); return r; }
  return null;
};
G.drawRelic = function (kind) {
  var deck = kind === 'boss' ? this.run.decks.bossRelics : this.run.decks.relics;
  return deck.pop() || null;
};
G.returnRelic = function (id) {
  var def = STS.RELICS[id];
  if (!def || def.type === 'special') return;
  (def.type === 'boss' ? this.run.decks.bossRelics : this.run.decks.relics).unshift(id);
};
G.offerRelic = async function (p, kind, id) {
  id = id || this.drawRelic(kind);
  if (!id) return null;
  if (id === 'OldCoin' && this.run.room && this.run.room.t === '$') { this.returnRelic(id); return this.offerRelic(p, kind); }
  var ans = await this.ask(p.i, { type: 'relic', title: 'レリック', id: id, skip: true });
  if (!ans) { this.returnRelic(id); return null; }
  await this.gainRelic(p, id);
  return id;
};
G.gainRelic = async function (p, id) {
  var def = STS.RELICS[id];
  var r = { id: id, n: 0 };
  p.relics.push(r);
  this.emit({ t: 'gainRelic', i: p.i, id: id });
  this.log(p.name + '：レリック「' + def.name + '」');
  if (def.onGain) await def.onGain(this, p, r);
  return r;
};
G.grantPrismatic = function (p) {
  if (this.relicOf(p, 'PrismaticShard')) return true;
  if (this.run.decks.prismatic <= 0) return false;
  this.run.decks.prismatic--;
  p.relics.push({ id: 'PrismaticShard', n: 0 });
  this.emit({ t: 'gainRelic', i: p.i, id: 'PrismaticShard' });
  return true;
};
G.usePendingRelics = async function (p) {
  for (var i = 0; i < p.relics.length; i++) {
    var r = p.relics[i], def = STS.RELICS[r.id];
    if (def && def.outOfCombat && r.pending) { r.pending = false; await def.outOfCombat(this, p, r); i = -1; }
  }
};
G.energyBonus = function (p) {
  var n = 0, self = this;
  p.relics.forEach(function (r) { var d = STS.RELICS[r.id]; if (d && d.energy) n += d.energy; });
  return n;
};
/* Dispatch a relic hook for one player. */
G.relicHook = async function (cb, pc, hook) {
  var p = this.P(pc.i), args = Array.prototype.slice.call(arguments, 3);
  var list = p.relics.slice();
  for (var i = 0; i < list.length; i++) {
    var r = list[i], def = STS.RELICS[r.id];
    if (!def || !def[hook]) continue;
    if (p.relics.indexOf(r) < 0) continue;
    var n0 = this.evN || 0;
    await def[hook].apply(def, [cb, pc, r].concat(args));
    // Presentation only: name the relic whose ability produced the events since n0.
    if ((this.evN || 0) > n0) this.emit({ t: 'relic', i: pc.i, id: r.id, first: n0 + 1 });
    if (cb && cb.s && cb.s.over && hook !== 'endCombat') return;
  }
  // Character abilities
  var ch = STS.ABILITIES[p.ch];
  if (ch && ch[hook]) {
    var n1 = this.evN || 0;
    await ch[hook].apply(ch, [cb, pc].concat(args));
    if ((this.evN || 0) > n1) this.emit({ t: 'relic', i: pc.i, id: ABILITY_RELIC[p.ch], first: n1 + 1, ability: true });
  }
};
var ABILITY_RELIC = { R: 'BurningBlood', G: 'RingOfTheSnake', B: 'CrackedCore', W: 'Miracles' };
G.activateRelic = async function (cb, pc, id, cmd) {
  var p = this.P(pc.i), r = this.relicOf(p, id);
  if (!r) throw new Error('そのレリックを持っていません。');
  var def = STS.RELICS[id];
  if (!def.activate) throw new Error('起動できないレリックです。');
  var why = def.canActivate ? def.canActivate(cb, pc, r) : null;
  if (why) throw new Error(why);
  await def.activate(cb, pc, r, cmd || {});
};

/* The die: modifiers (Gambling Chip, Abacus, Toolbox, Gambler's Brew), then die relics. */
G.dieModifiers = function (p) {
  var out = [], self = this;
  p.relics.forEach(function (r) {
    var d = STS.RELICS[r.id];
    if (d && d.dieMod && !r.usedRoom) out.push({ k: 'relic', id: r.id, label: d.name + '：' + d.dieModLabel });
  });
  p.potions.forEach(function (id, slot) { if (id === 'GamblersBrew') out.push({ k: 'brew', slot: slot, label: 'ギャンブラーの醸造酒：ダイスを好きな目にする' }); });
  return out;
};
G.dieWindow = async function (holder) {
  // holder: Combat or an event context with .s.die (or .die)
  var self = this;
  for (var guard = 0; guard < 12; guard++) {
    var who = this.run.players.filter(function (p) { return self.dieModifiers(p).length; });
    if (!who.length) return;
    var die = holder.s ? holder.s.die : holder.die;
    var answers = await Promise.all(who.map(function (p) {
      return self.ask(p.i, { type: 'dieMod', title: 'ダイスの目は' + die + '。変更しますか？', die: die, options: self.dieModifiers(p) });
    }));
    var used = false;
    for (var i = 0; i < who.length; i++) {
      var a = answers[i], p = who[i];
      if (!a || a.k === 'pass') continue;
      var cur = holder.s ? holder.s.die : holder.die, nv = cur;
      if (a.k === 'relic') {
        var r = this.relicOf(p, a.id); if (!r || r.usedRoom) continue;
        r.usedRoom = true;
        nv = STS.RELICS[a.id].dieMod(this, cur);
      } else if (a.k === 'brew') {
        var slot = p.potions.indexOf('GamblersBrew'); if (slot < 0) continue;
        p.potions.splice(slot, 1); this.run.decks.potions.unshift('GamblersBrew');
        nv = Math.max(1, Math.min(6, a.v | 0));
      }
      if (holder.s) holder.s.die = nv; else holder.die = nv;
      this.emit({ t: 'dieMod', i: p.i, v: nv });
      this.log(p.name + '：ダイスを' + nv + 'に');
      used = true;
      break;
    }
    if (!used) return;
  }
};
G.dieRelics = async function (cb, pc, face) {
  var p = this.P(pc.i);
  var list = p.relics.slice();
  for (var i = 0; i < list.length; i++) {
    var r = list[i], def = STS.RELICS[r.id];
    if (!def || !def.die) continue;
    var faces = def.die;
    for (var j = 0; j < faces.length; j++) {
      if (faces[j].f.indexOf(face) >= 0) {
        cb.emit({ t: 'dieRelic', i: pc.i, id: r.id });
        await faces[j].fx(cb, pc, r);
        if (cb.s.over) return;
      }
    }
  }
};
/* Dolly's Mirror / Loaded Die / Nilry's Codex: trigger another die relic ability. */
G.triggerDieAbility = async function (cb, pc, opts) {
  opts = opts || {};
  var self = this, choices = [];
  var owners = opts.anyOwner ? this.run.players : [this.P(pc.i)];
  owners.forEach(function (o) {
    o.relics.forEach(function (r) {
      var def = STS.RELICS[r.id];
      if (!def || !def.die || r.id === opts.exclude) return;
      def.die.forEach(function (f, fi) {
        if (opts.face && f.f.indexOf(opts.face) < 0) return;
        if (f.noCopy) return;
        choices.push({ id: o.i + ':' + r.id + ':' + fi, label: o.name + '：' + def.name + '（' + f.f.join('・') + '）', owner: o.i, rid: r.id, fi: fi });
      });
    });
  });
  if (!choices.length) return;
  var ans = await this.ask(pc.i, { type: 'option', title: opts.title || '発動するダイスレリックの能力を選択', options: choices.map(function (c) { return { id: c.id, label: c.label }; }).concat([{ id: 'none', label: '発動しない' }]) });
  var ch = choices.filter(function (c) { return c.id === ans; })[0];
  if (!ch) return;
  var def = STS.RELICS[ch.rid];
  var ownerPc = cb.pc(ch.owner);
  await def.die[ch.fi].fx(cb, ownerPc, this.relicOf(this.P(ch.owner), ch.rid));
};

/* ------------------------------------------------------------------ boss relic draft */
G.bossRelicDraft = async function () {
  var run = this.run, self = this;
  if (!run.draft) {
    var n = run.players.length === 1 ? 3 : run.players.length + 1;
    var ids = [];
    for (var i = 0; i < n; i++) { var id = this.drawRelic('boss'); if (id) ids.push(id); }
    run.draft = { ids: ids, taken: {}, done: {} };
    this.checkpoint();
  }
  var dr = run.draft;
  await Promise.all(run.players.map(function (p) { return dr.done[p.i] ? null : self.draftFor(p); }));
  dr.ids.forEach(function (id) { if (!dr.taken[id] && dr.taken[id] !== 0) self.returnRelic(id); });
  run.draft = null;
  run.phase = 'actEnd';
  this.checkpoint();
};
G.draftFor = async function (p) {
  var dr = this.run.draft, self = this;
  for (;;) {
    var avail = dr.ids.filter(function (id) { return dr.taken[id] == null; });
    var ans = await this.ask(p.i, { type: 'bossRelic', title: 'ボスレリックを1つ選ぶ（見送ることもできます）', ids: dr.ids.slice(), taken: Object.assign({}, dr.taken) });
    if (ans == null || ans === 'skip') { dr.done[p.i] = true; return; }
    // Another player may have taken it while this player was choosing.
    if (dr.ids.indexOf(ans) < 0 || dr.taken[ans] != null) { this.emit({ t: 'error', i: p.i, msg: 'そのレリックはもう選ばれました。' }); continue; }
    dr.taken[ans] = p.i;
    dr.done[p.i] = true;
    await this.gainRelic(p, ans);
    this.checkpoint();
    return;
  }
};

/* ------------------------------------------------------------------ act transitions, game end */
G.actEnd = async function () {
  var run = this.run, self = this;
  var next = run.act + 1;
  var canAct4 = run.act === 3 && run.unlock.act4 && run.keys.ruby && run.keys.sapphire && run.keys.emerald;
  var options = [];
  if (run.act < 3) options.push({ id: 'next', label: '第' + next + '幕へ進む' });
  if (canAct4) options.push({ id: 'next', label: '第4幕へ進む（3つの鍵がそろっています）' });
  options.push({ id: 'end', label: run.act >= 3 ? 'ここで冒険を終える（勝利）' : 'ここで冒険を終える（倒したボスの数だけ解放ボックスを得る）' });
  var ans = options.length === 1 ? 'end' : await this.ask(0, { type: 'option', title: '第' + run.act + '幕クリア！', options: options });
  // Stopping after Act I or II ends the adventure (boxes are still checked); beating Act III (or IV) is a victory.
  if (ans !== 'next' || run.act >= 4) { await this.gameOver(run.act >= 3 ? 'victory' : 'stopped'); return; }
  // Heal: full at the start of Acts II+ (Ascension 6: heal 4 instead).
  run.players.forEach(function (p) { if (run.asc >= 6) self.heal(p, 4); else p.hp = self.maxHp(p); });
  // Reshuffle each card rewards deck (including skipped cards). Rare deck is not shuffled.
  run.players.forEach(function (p) { self.shuffle(p.rewardDeck); });
  this.shuffle(run.decks.relics); this.shuffle(run.decks.potions); this.shuffle(run.decks.bossRelics);
  this.setupAct(next);
  run.phase = 'map';
  this.emit({ t: 'act', act: next });
  this.checkpoint();
};
G.gameOver = async function (result) {
  var run = this.run;
  if (run.phase === 'over') return;
  run.phase = 'over';
  run.result = result;
  run.combat = null;
  run.boxes = run.bosses + 1;
  this.emit({ t: 'gameOver', result: result, boxes: run.boxes });
  this.checkpoint();
};

/* ------------------------------------------------------------------ keys */
G.sapphireAvailable = function () { var r = this.run; return r.unlock.act4 && !r.keys.sapphire && r.act <= 3; };
G.sapphireVote = async function (rewards) {
  var self = this, run = this.run;
  // Players may reveal their relics before deciding.
  var revealed = run.players.map(function () { return self.drawRelic('normal'); });
  var votes = await this.askAll({ type: 'option', title: 'サファイアの鍵：全員がレリックを見送れば鍵を得ます', reveal: revealed,
    options: [{ id: 'key', label: '全員でレリックを見送り、鍵を得る' }, { id: 'relic', label: 'レリックを受け取る' }] });
  var all = votes.every(function (v) { return v === 'key'; });
  if (all) {
    run.keys.sapphire = true;
    revealed.forEach(function (id) { if (id) self.returnRelic(id); });
    rewards.forEach(function (rw) { rw.items.forEach(function (it) { if (it.k === 'relic') it.taken = true; }); });
    this.log('サファイアの鍵を手に入れた！'); this.emit({ t: 'key', k: 'sapphire' });
  } else {
    // Revealed relics become those players' relic rewards.
    rewards.forEach(function (rw, i) { rw.items.forEach(function (it) { if (it.k === 'relic' && revealed[i]) it.fixed = revealed[i]; }); });
  }
};

/* ------------------------------------------------------------------ rooms: treasure, rest */
G.roomTreasure = async function () {
  var run = this.run, room = run.room, self = this;
  if (room.step === 'enter') {
    room.step = 'claim';
    room.rewards = run.players.map(function (p) { return self.makeRewards(p, { relic: 1 }); });
    room.sapphireOK = this.sapphireAvailable();
    this.checkpoint();
  }
  if (room.sapphireOK && !room.sapphireAsked) { room.sapphireAsked = true; await this.sapphireVote(room.rewards); }
  await this.claimRewards();
};
G.roomRest = async function () {
  var run = this.run, room = run.room, self = this;
  if (room.step === 'enter') { room.step = 'act'; room.done = {}; }
  if (run.unlock.act4 && !run.keys.ruby && run.act <= 3 && !room.rubyAsked) {
    room.rubyAsked = true;
    var votes = await this.askAll({ type: 'option', title: 'ルビーの鍵：全員がこの休憩所で何もしなければ鍵を得ます',
      options: [{ id: 'key', label: '全員で何もせず、鍵を得る' }, { id: 'rest', label: '休憩・鍛錬をする' }] });
    if (votes.every(function (v) { return v === 'key'; })) {
      run.keys.ruby = true; this.log('ルビーの鍵を手に入れた！'); this.emit({ t: 'key', k: 'ruby' });
      return;
    }
  }
  await Promise.all(run.players.map(function (p) { return room.done[p.i] ? null : self.restFor(p); }));
};
G.restFor = async function (p) {
  var room = this.run.room;
  var opts = [];
  var canRest = !this.relicOf(p, 'CoffeeDripper');
  var canSmith = !this.relicOf(p, 'FusionHammer') && this.upgradable(p).length > 0;
  var heal = D.REST_HEAL + (this.relicOf(p, 'RegalPillow') ? 3 : 0);
  opts.push({ id: 'rest', label: '休憩：HPを' + heal + '回復' + (this.relicOf(p, 'PeacePipe') ? '（ピースパイプ：カードを1枚除去してもよい）' : ''), disabled: !canRest });
  opts.push({ id: 'smith', label: '鍛錬：カードを1枚アップグレード', disabled: !canSmith });
  opts.push({ id: 'none', label: '何もしない' });
  var ans = await this.ask(p.i, { type: 'option', title: '休憩所', options: opts, rest: true });
  if (ans === 'rest' && canRest) {
    this.heal(p, heal);
    if (this.relicOf(p, 'PeacePipe')) await this.removeCards(p, 1, 'ピースパイプ：除去するカードを選択（任意）', true);
  } else if (ans === 'smith' && canSmith) await this.upgradeCards(p, 1, '鍛錬：アップグレードするカードを選択');
  room.done[p.i] = true;
  this.checkpoint();
};

/* ------------------------------------------------------------------ merchant */
G.roomShop = async function () {
  var run = this.run, room = run.room, self = this, d = run.decks;
  if (room.shop && room.shop.closed) return;
  if (!room.shop) {
    var relics = [];
    while (relics.length < 3) {
      var id = this.drawRelic('normal');
      if (!id) break;
      if (id === 'OldCoin') { this.returnRelic(id); id = this.drawRelic('normal'); if (!id || id === 'OldCoin') { if (id) this.returnRelic(id); break; } }
      relics.push(id);
    }
    var pots = [];
    for (var i = 0; i < 3; i++) { var pid = d.potions.pop(); if (pid) pots.push(pid); }
    room.shop = {
      relics: relics.map(function (id, i) { return { id: id, price: STS.RELICS[id].price - (i === 0 ? 1 : 0), sold: false }; }),
      potions: pots.map(function (id) { return { id: id, price: STS.POTIONS[id].price, sold: false }; }),
      cards: run.players.map(function (p) { return self.revealCards(p, 'normal', 3).map(function (c) { return { id: c.id, from: c.from, price: self.cardPrice(c.id), sold: false }; }); }),
      colorless: run.unlock.colorless ? this.revealCards(run.players[0], 'colorless', 3).map(function (c) { return { id: c.id, from: 'colorless', price: self.cardPrice(c.id), sold: false }; }) : [],
      removed: {}, done: {}
    };
    if (room.step === 'enter') room.step = 'shop';
    this.checkpoint();
  }
  await Promise.all(run.players.map(function (p) { return room.shop.done[p.i] ? null : self.shopFor(p); }));
  // Leftovers return to the bottom of their decks.
  var sh = room.shop;
  sh.relics.forEach(function (it) { if (!it.sold) self.returnRelic(it.id); });
  sh.potions.forEach(function (it) { if (!it.sold) d.potions.unshift(it.id); });
  sh.cards.forEach(function (list, pi) { self.returnCards(run.players[pi], list.filter(function (c) { return !c.sold; })); });
  sh.colorless.forEach(function (c) { if (!c.sold) d.colorless.unshift(c.id); });
  sh.closed = true;
  this.checkpoint();
};
G.cardPrice = function (id) {
  var r = STS.CARDS[id].r;
  return r === 'R' ? D.PRICE.rare : r === 'U' ? D.PRICE.uncommon : D.PRICE.common;
};
G.removePrice = function () { return this.run.asc >= 8 ? D.PRICE.removeA8 : D.PRICE.remove; };
G.shopFor = async function (p) {
  var room = this.run.room, sh = room.shop, self = this;
  for (;;) {
    var ans = await this.ask(p.i, { type: 'shop', title: '商人', removePrice: this.removePrice() });
    if (!ans || ans.act === 'leave') { sh.done[p.i] = true; this.checkpoint(); return; }
    try { await this.shopAction(p, ans); } catch (e) { this.emit({ t: 'error', i: p.i, msg: e.message }); }
    this.checkpoint();
    this.update();
  }
};
G.shopAction = async function (p, a) {
  var sh = this.run.room.shop, self = this;
  var pay = function (n) { if (p.gold < n) throw new Error('ゴールドが足りません。'); p.gold -= n; self.emit({ t: 'gold', i: p.i, n: -n }); };
  if (a.act === 'relic') {
    var it = sh.relics[a.idx]; if (!it || it.sold) throw new Error('売り切れです。');
    pay(it.price); it.sold = true; it.by = p.i; await this.gainRelic(p, it.id);
  } else if (a.act === 'potion') {
    var pt = sh.potions[a.idx]; if (!pt || pt.sold) throw new Error('売り切れです。');
    if (this.relicOf(p, 'Sozu')) throw new Error('ソズのためポーションを得られません。');
    if (p.potions.length >= this.potionLimit()) throw new Error('ポーションが上限です。先に使うか捨ててください。');
    pay(pt.price); pt.sold = true; pt.by = p.i; p.potions.push(pt.id); this.emit({ t: 'gainPotion', i: p.i, id: pt.id });
  } else if (a.act === 'card') {
    var list = sh.cards[p.i], c = list && list[a.idx]; if (!c || c.sold) throw new Error('売り切れです。');
    pay(c.price); c.sold = true; await this.addCard(p, c.id, false);
  } else if (a.act === 'colorless') {
    var cc = sh.colorless[a.idx]; if (!cc || cc.sold) throw new Error('売り切れです。');
    pay(cc.price); cc.sold = true; cc.by = p.i; await this.addCard(p, cc.id, false);
  } else if (a.act === 'remove') {
    if (sh.removed[p.i]) throw new Error('カード除去はこの商人で1回までです。');
    if (!this.removable(p).length) throw new Error('除去できるカードがありません。');
    pay(this.removePrice());
    sh.removed[p.i] = true;
    await this.removeCards(p, 1, '除去するカードを選択');
  } else if (a.act === 'giveGold') {
    var to = this.P(a.to); var n = a.n | 0;
    if (!to || to === p || n <= 0) throw new Error('渡せません。');
    if (p.gold < n) throw new Error('ゴールドが足りません。');
    p.gold -= n; this.gainGold(to, n);
  } else throw new Error('不明な操作です。');
};

/* ------------------------------------------------------------------ events */
G.roomEvent = async function () {
  var run = this.run, room = run.room, d = run.decks;
  if (room.step === 'enter') {
    var node = run.map && run.map.nodes[room.key];
    var id = null;
    for (var guard = 0; guard < 40; guard++) {
      id = d.events.pop();
      if (!id) break;
      // Hallway Encounter, Merchant Encounter and Dead Adventurer: "If this is the first ? room, discard it and draw
      // again" — the first ? row of Act I (floor 2).
      var def0 = STS.EVENTS[id];
      if (run.act === 1 && node && node.r === 1 && def0 && def0.notFirstQ && d.events.length) { d.events.unshift(id); this.log('「' + def0.name + '」は最初の?部屋なので引き直します'); continue; }
      break;
    }
    run.floorQ = (run.floorQ || 0) + 1;
    room.event = id; room.step = 'event'; room.ev = { id: id };
    this.emit({ t: 'event', id: id });
    this.checkpoint();
  }
  var ev = STS.EVENTS[room.event];
  if (!ev) { this.afterEvent(); return; }
  var result = await ev.run(this, room.ev);
  this.afterEvent();
  if (result && result.then) await result;
};
G.afterEvent = function () {
  var run = this.run, room = run.room;
  if (room && room.event && !room.eventReturned) { room.eventReturned = true; run.decks.events.unshift(room.event); }
};
/* Each player resolves the event's options individually (yellow brackets). */
G.eachPlayer = async function (state, fn) {
  var self = this;
  state.done = state.done || {};
  await Promise.all(this.run.players.map(function (p) {
    if (state.done[p.i]) return null;
    return Promise.resolve(fn(p)).then(function () { state.done[p.i] = true; self.checkpoint(); });
  }));
};
G.rollDie = async function (title, o) {
  var holder = { die: this.rand(6) + 1 };
  this.emit({ t: 'die', v: holder.die, title: title });
  if (!o || !o.noMods) await this.dieWindow(holder);
  this.emit({ t: 'dieFinal', v: holder.die });
  return holder.die;
};
/* An event fight (Hallway Encounter, Dead Adventurer, Colosseum, Mind Bloom). */
G.eventFight = async function (spec) {
  var r = await this.fight(spec);
  return r;
};

/* ------------------------------------------------------------------ Neow */
G.neow = async function () {
  var run = this.run, self = this;
  if (!run.neow) {
    var deck = D.NEOW.filter(function (n) { return !n.colorless || run.unlock.colorless; }).map(function (n) { return n.c; });
    this.shuffle(deck);
    run.neow = { cards: run.players.map(function () { return deck.pop(); }), stage: {} };
    this.checkpoint();
  }
  await Promise.all(run.players.map(function (p) { return self.neowFor(p); }));
  run.neow = null;
};
G.neowFor = async function (p) {
  var st = this.run.neow, code = st.cards[p.i];
  var stage = st.stage[p.i] || 0;
  if (stage === 0) {
    // Red reward: a card reward.
    await this.cardReward(p, 'normal', 3, { title: 'ネオーの祝福：カード報酬' });
    st.stage[p.i] = stage = 1; this.checkpoint();
  }
  if (stage === 1) {
    var opts = code.split(' ').map(function (o, i) {
      var dr = D.NEOW_DRAWBACK[o[0]], rw = D.NEOW_REWARD[o[1]];
      return { id: String(i), label: (dr ? dr + '。' : '') + rw, code: o };
    });
    var ans = await this.ask(p.i, { type: 'option', title: 'ネオーの祝福：1つ選ぶ', options: opts, neow: true });
    var pick = opts.filter(function (o) { return o.id === ans; })[0] || opts[0];
    st.stage[p.i] = 2; this.checkpoint();
    await this.neowApply(p, pick.code);
  }
};
G.neowApply = async function (p, code) {
  var dr = code[0], rw = code[1];
  if (dr === 'D') await this.loseHpOut(p, 2);
  else if (dr === '3') await this.loseHpOut(p, 3);
  else if (dr === 'G') p.gold = Math.max(0, p.gold - 3);
  else if (dr === 'C') await this.gainCurse(p);
  switch (rw) {
    case '4': this.gainGold(p, 4); break;
    case '5': this.gainGold(p, 5); break;
    case '8': this.gainGold(p, 8); break;
    case 'X': this.gainGold(p, 10); break;
    case 'r': await this.removeCards(p, 1); break;
    case 'R': await this.removeCards(p, 2); break;
    case 't': await this.transformCards(p, 1); break;
    case 'T': await this.transformCards(p, 2); break;
    case 'u': await this.upgradeCards(p, 1); break;
    case 'U': this.upgradeRandom(p, 2); break;
    case 'c': await this.cardReward(p, 'normal', 3); break;
    case 'V': await this.cardReward(p, 'normal', 3); await this.cardReward(p, 'normal', 3); break;
    case 'W': await this.cardReward(p, 'normal', 3); this.gainGold(p, 5); break;
    case 'C': for (var i = 0; i < 2; i++) { var cs = this.revealCards(p, 'normal', 1); if (cs[0]) await this.addCard(p, cs[0].id, false); } break;
    case 'P': for (var j = 0; j < 3; j++) await this.offerPotion(p); break;
    case '?': { var rid = p.rareDeck.pop(); if (rid) await this.addCard(p, rid, false); break; }
    case '!': await this.cardReward(p, 'rare', 3); break;
    case '%': await this.offerRelic(p, 'normal'); break;
    case '=': await this.cardReward(p, 'colorless', 3); break;
    case ')': await this.cardReward(p, 'colorless', 3); await this.cardReward(p, 'colorless', 3); break;
    case '+': for (var k = 0; k < 2; k++) { var cid = this.run.decks.colorless.pop(); if (cid) await this.addCard(p, cid, false); } break;
  }
};

/* ------------------------------------------------------------------ commands outside combat */
G.command = function (pi, cmd) {
  var self = this;
  if (this.combat && this.run.combat && (cmd.type in { play: 1, shiv: 1, miracle: 1, potion: 1, relic: 1, power: 1, end: 1, unready: 1, row: 1 })) return this.combat.command(pi, cmd);
  var p = this.cmdQ.then(function () { return self.execOut(pi, cmd); });
  this.cmdQ = p.then(function () { self.update(); }, function () { self.update(); });
  return p;
};
G.execOut = async function (pi, cmd) {
  var run = this.run;
  if (run.phase === 'over') throw new Error('冒険は終了しています。');
  switch (cmd.type) {
    case 'potionOut': return this.usePotionOut(pi, cmd.slot);
    case 'givePotion': if (run.combat) throw new Error('戦闘中は渡せません。'); return this.givePotion(pi, cmd.slot, cmd.to);
    case 'discardPotion': { var p = this.P(pi); var id = p.potions[cmd.slot]; if (!id) throw new Error('ポーションがありません。'); p.potions.splice(cmd.slot, 1); run.decks.potions.unshift(id); return; }
    case 'swapRows': {
      if (run.combat) throw new Error('戦闘中は列を入れ替えられません。');
      var a = this.P(cmd.a), b = this.P(cmd.b); if (!a || !b) throw new Error('入れ替えられません。');
      var t = a.row; a.row = b.row; b.row = t; return;
    }
    case 'giveGold': {
      if (run.combat) throw new Error('戦闘中は渡せません。');
      var from = this.P(pi), to = this.P(cmd.to), n = cmd.n | 0;
      if (!to || to === from || n <= 0 || from.gold < n) throw new Error('渡せません。');
      from.gold -= n; this.gainGold(to, n); return;
    }
    default: throw new Error(run.combat ? '今は行動できません。' : '戦闘中ではありません。');
  }
};

/* ------------------------------------------------------------------ default answers (tests / unattended) */
STS.autoAnswer = function (g, pi, q) {
  switch (q.type) {
    case 'enemy': return q.options[0];
    case 'row': return q.options[0];
    case 'player': return q.options[0];
    case 'cards': return q.cards.slice(0, q.min).map(function (c) { return c.u; });
    case 'deck': return q.cards.slice(0, q.min).map(function (c) { return c.u; });
    case 'number': return q.max;
    case 'option': { var o = q.options.filter(function (x) { return !x.disabled; }); return (o[0] || q.options[0]).id; }
    case 'confirm': return true;
    case 'orb': return q.options[0];
    case 'map': return q.options[0];
    case 'reward': { var open = q.items.filter(function (it) { return !it.taken; }); return open.length ? open[0].idx : 'done'; }
    case 'cardReward': return 0;
    case 'potion': return { act: q.full ? 'skip' : 'take' };
    case 'relic': return true;
    case 'bossRelic': { var av = q.ids.filter(function (id) { return q.taken[id] == null; }); return av[0] || 'skip'; }
    case 'shop': return { act: 'leave' };
    case 'dieMod': return { k: 'pass' };
    case 'info': return true;
    default: return null;
  }
};
})(typeof window !== 'undefined' ? window : globalThis);

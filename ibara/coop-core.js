/* Host-authoritative shared-round adventure. No DOM or transport dependencies. */
(function (root) {
'use strict';
var G = root.IBARA;
function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function assert(ok, msg) { if (!ok) throw new Error(msg || '今はその操作ができません。'); }
function Core(players, seed, hooks, checkpoint) {
  assert(Array.isArray(players) && players.length >= 1 && players.length <= 4, '公式の人数は1〜4人です。');
  assert(new Set(players.map(function (p) { return p.hero; })).size === players.length, 'それぞれ別のキャラクターを選んでください。');
  if (checkpoint) assert(checkpoint.rulesVersion === 2, '旧ルールの記録は新しいルールでは再開できません。新しく冒険を開始してください。');
  this.hooks = hooks || {}; this.rev = 0; this.busy = false; this.closed = false;
  this.prompts = players.map(function(){return null;}); this.pending = players.map(function(){return null;}); this.promptSerial = 0;
  this.log = []; this.phase = 'map'; this.active = 0; this.leader = 0; this.turn = 0;
  this.combats = []; this.room = null; this.result = null; this.votes = players.map(function(){return null;});
  this.ended = players.map(function(){return false;});
  var self = this;
  this.players = players.map(function (p, i) {
    assert(G.HEROES[p.hero], 'キャラクターを選んでください。');
    var run = checkpoint ? copy(checkpoint.runs[i]) : G.Game.newRun(p.hero, (seed + i * 100003) >>> 0, players.length);
    G.card.bumpUid(run.deck);
    var game = new G.Game(run, {
      emit: function (type, d) { return self.emit(i, type, d || {}); },
      choose: function (s) { return self.choose(i, s); }
    });
    // Co-op never writes the solo save. Only stable map boundaries are persisted.
    game.save = function () { game.saveRng(); };
    return { name: String(p.name || ('冒険者' + (i + 1))).slice(0, 12), game: game, run: run };
  });
  if (!checkpoint) {
    var shared = this.players[0].run;
    this.players.forEach(function (p) {
      ['map','encDeck','eliteDeck','eventDeck','boss'].forEach(function (k) { p.run[k] = copy(shared[k]); });
      p.run.phase = 'map';
    });
    // One physical supply of items and encounters, not one copy per player.
    this.players.forEach(function (p) {
      ['relicDeck','bossRelicDeck','potionDeck','encDeck','eliteDeck','eventDeck','blessingDeck','summonDecks'].forEach(function (k) { p.run[k] = shared[k]; });
    });
    var first = this.players[0].game.rng.shuffle(G.ACT1.first.slice());
    this.players.forEach(function (p, i) { p.run.firstEnc = first[i]; });
  } else { assert(checkpoint.runs.length === players.length, '再開する人数を記録と合わせてください。'); this.leader = Number.isInteger(checkpoint.leader) && checkpoint.leader >= 0 && checkpoint.leader < players.length ? checkpoint.leader : 0;
    var restored = this.players[0].run;
    this.players.forEach(function(p){['relicDeck','bossRelicDeck','potionDeck','encDeck','eliteDeck','eventDeck','blessingDeck','summonDecks'].forEach(function(k){p.run[k]=restored[k];});});
  }
  this.restored = !!checkpoint;
}
Core.prototype.note = function (text) { this.log.push(String(text)); if (this.log.length > 12) this.log.shift(); };
Core.prototype.publish = function () { if (this.closed) return; this.rev++; if (this.hooks.update) this.hooks.update(this.snapshot()); };
Core.prototype.emit = async function (owner, type, d) {
  if (this.closed) throw new Error('冒険を終了しました。');
  var name = this.players[owner].name;
  if (type === 'heroDamage' && d.loss) this.note(name + '：HP −' + d.loss);
  if (type === 'enemyDamage' && d.loss) this.note(d.e.name + '：HP −' + d.loss);
  if (type === 'play') this.note(name + '：' + G.CARDS[d.card.id].name);
  if (type === 'enemyAct') this.note(d.e.name + '：' + d.act.name);
  this.publish();
  if (this.hooks.effect) await this.hooks.effect(type, d);
};
Core.prototype.choose = function (owner, spec) {
  var self = this;
  assert(!this.closed && !this.pending[owner]);
  // A plain die needs no decision; only relic modifiers open a prompt.
  if ((spec.type === 'die' || spec.type === 'roll') && !(spec.mods || []).length) return Promise.resolve({ value: spec.value, used: [] });
  var plain = {};
  Object.keys(spec).forEach(function (k) { if (k !== 'c' && typeof spec[k] !== 'function') plain[k] = copy(spec[k]); });
  if (spec.type === 'orb') plain.orbs = spec.c.hero.orbs.slice();
  plain.key = ++this.promptSerial; plain.owner = owner;
  this.prompts[owner] = plain;
  return new Promise(function (resolve, reject) { self.pending[owner] = { spec: spec, resolve: resolve, reject: reject }; self.publish(); });
};
Core.prototype.answer = function (owner, key, value) {
  var p = this.pending[owner], q = this.prompts[owner];
  assert(p && q && q.key === key, 'この選択肢は更新されました。');
  var s = p.spec, result, t = s.type;
  if (['hand','pile','deck','scry'].indexOf(t) >= 0) {
    assert(Array.isArray(value), 'カードを選んでください。');
    var unique = value.filter(function (v, i) { return value.indexOf(v) === i; });
    var min = t === 'deck' || t === 'scry' ? 0 : s.min == null ? s.n : s.min;
    var max = t === 'scry' ? s.cards.length : s.n;
    assert(unique.length === value.length && unique.length >= min && unique.length <= max, '選ぶ枚数を確認してください。');
    result = unique.map(function (uid) { var card = s.cards.find(function (c) { return c.uid === uid; }); assert(card, '選べないカードです。'); return card; });
  } else if (t === 'option') {
    assert(s.options.some(function (o) { return o.id === value; }), '選択肢を確認してください。'); result = value;
  } else if (t === 'reward') {
    assert(Number.isInteger(value) && value >= -1 && value < s.options.length); result = value;
  } else if (t === 'bossRelic') {
    assert(Number.isInteger(value) && value >= 0 && value < s.options.length); result = value;
  } else if (t === 'relic') {
    assert(typeof value === 'boolean'); result = value;
  } else if (t === 'potion') {
    assert(typeof value === 'boolean' || (Number.isInteger(value) && value >= 0 && value < this.players[owner].run.potions.length)); result = value;
  } else if (t === 'orb') {
    assert(Number.isInteger(value) && value >= 0 && value < s.c.hero.orbs.length); result = value;
  } else if (t === 'die' || t === 'roll') {
    assert(value && Array.isArray(value.steps) && value.steps.length <= (s.mods || []).length);
    var v = s.value, used = [];
    value.steps.forEach(function (step) {
      var md = (s.mods || []).find(function (m) { return m.id === step.id; });
      assert(md && used.indexOf(md.id) < 0);
      if (md.kind === 'pm1') { assert(step.delta === 1 || step.delta === -1); v += step.delta; } else { v = 7 - v; }
      assert(v >= 1 && v <= 6); used.push(md.id);
    });
    result = { value: v, used: used };
  } else throw new Error('未対応の選択です：' + t);
  this.pending[owner] = null; this.prompts[owner] = null; p.resolve(result); this.publish();
};
Core.prototype.checkpoint = function () {
  if (this.phase !== 'map') return;
  var data = { v: 1, rulesVersion: 2, leader: this.leader, names: this.players.map(function (p) { return p.name; }), runs: this.players.map(function (p) { p.game.saveRng(); return copy(p.run); }) };
  if (this.hooks.save) this.hooks.save(data);
  return data;
};
Core.prototype.snapshot = function () {
  return copy({ v: 1, rev: this.rev, phase: this.phase, busy: this.busy, active: this.active, leader: this.leader, turn: this.turn,
    rulesVersion: 2, pendingSummons: this.combats.length ? this.combats[0].pendingSummons.length : 0, ended: this.ended, result: this.result, room: this.room, prompts: this.prompts, votes: this.votes, log: this.log,
    reachable: this.players[0].game.reachable(), players: this.players.map(function (p, i) {
      var c = this.combats[i], data = null;
      if (c) { data = {}; ['hero','enemies','hand','draw','discard','exhaust','powerCards','die','phase','round','t','flags','focus','doubleNext','over','spec','stolen','fled','lane'].forEach(function (k) { data[k] = c[k]; }); }
      return { name: p.name, run: p.run, combat: data };
    }, this) });
};
Core.prototype.begin = async function () {
  this.note(this.players.length + '人の冒険が始まった。');
  if (!this.restored) {
    this.phase = 'blessing'; this.busy = true; this.publish();
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i], id = p.run.blessingDeck.shift(), b = G.BLESSINGS.find(function(x){return x.id === id;}) || G.BLESSINGS[0], X = p.game.api();
      await b.red.run(X); p.run.blessRed = true;
      var pick = await this.choose(i,{type:'option',prompt:'ネオーの祝福：青の報酬を1つ選ぶ',options:b.blue.map(function(o,j){return {id:j,label:o.label+(o.cost?' / '+o.cost:'')};})});
      await b.blue[pick].run(X);
      if (p.run.hp <= 0) { this.phase = 'defeat'; this.result = 'defeat'; this.busy = false; this.clearCheckpoint(); this.publish(); return; }
    }
    this.busy = false; this.phase = 'map';
  }
  this.checkpoint(); this.publish();
};
Core.prototype.dispatch = async function (owner, action) {
  assert(!this.closed && Number.isInteger(owner) && owner >= 0 && owner < this.players.length && action && typeof action.type === 'string');
  if (action.type === 'answer') { this.answer(owner, action.key, action.value); return; }
  if (action.type === 'vote') {
    assert(this.phase === 'map' && this.players[0].game.reachable().indexOf(action.node) >= 0);
    this.votes[owner] = action.node; this.publish(); return;
  }
  assert(!this.busy, '操作中です。少し待ってください。');
  assert(action.rev === this.rev, '画面が更新されました。もう一度操作してください。');
  this.busy = true; this.publish();
  try {
    if (action.type === 'enter') {
      assert(this.phase === 'map' && owner === this.leader, '進路係が行き先を決定します。');
      assert(this.players[0].game.reachable().indexOf(action.node) >= 0, 'その部屋には進めません。');
      await this.enter(action.node);
    } else {
      assert(this.phase === 'combat', '戦闘中ではありません。');
      if (action.type === 'unready') { this.ended[owner] = false; return; }
      assert(!this.ended[owner], '終了待ちです。プレイを再開するには「終了を取り消す」を押してください。');
      var c = this.combats[owner]; assert(c && !c.over && c.phase === 'player');
      if (action.type === 'play') {
        var card = c.hand.find(function (x) { return x.uid === action.uid; });
        assert(card && c.canPlay(card));
        if (c.needsTarget(card)) assert(c.byUid(action.target) && c.byUid(action.target).alive, '敵を選んでください。');
        await c.playCard(action.uid, action.target);
      } else if (action.type === 'end') {
        this.ended[owner] = true;
        if (this.ended.every(Boolean)) await this.endRound();
      } else if (action.type === 'shiv') { assert(c.hero.shiv > 0 && c.byUid(action.target) && c.byUid(action.target).alive); await c.useShiv(action.target); }
      else if (action.type === 'miracle') { assert(c.hero.miracle > 0); await c.useMiracle(); }
      else if (action.type === 'potion') {
        var pid = c.run.potions[action.index]; assert(pid && G.POTIONS[pid].use && !G.POTIONS[pid].passive);
        assert(G.POTIONS[pid].target !== 'enemy' || (c.byUid(action.target) && c.byUid(action.target).alive));
        await c.usePotion(action.index, action.target);
      } else if (action.type === 'relic') { assert(c.run.relics.indexOf(action.id) >= 0 && G.RELICS[action.id].active && !c.flags['used_' + action.id]); await c.activateRelic(action.id); }
      else throw new Error('操作を確認してください。');
      if (this.phase === 'combat' && action.type !== 'end') {
        if (!await this.battleEnded()) {
          if (c._endPending) { c._endPending = false; this.ended[owner] = true; if (this.ended.every(Boolean)) await this.endRound(); }
        }
      }
    }
  } finally { this.busy = false; this.publish(); }
};
Core.prototype.enter = async function (node) {
  var self = this;
  this.phase = 'room'; this.votes = this.players.map(function(){return null;});
  var nodeKind = this.players[0].game.node(node).kind;
  var firstRoom = this.players[0].game.enter(node);
  var rooms = [firstRoom];
  for (var ri = 1; ri < this.players.length; ri++) {
    var pg = this.players[ri].game;
    if (nodeKind === 'start' || nodeKind === 'enc' || nodeKind === 'treasure') rooms.push(pg.enter(node));
    else {
      pg.run.pos = node; pg.run.visited.push(node); pg.run.stats.floors++; pg.newRoom();
      var room = copy(firstRoom);
      if (nodeKind === 'shop') {
        var ownCards = pg.revealCards(3).map(function(o){return {id:o.id,rare:o.rare,price:{C:2,U:3,R:5}[G.CARDS[o.id].rarity],sold:false};});
        room.shop = {relics:firstRoom.shop.relics,potions:firstRoom.shop.potions,cards:ownCards,removeCost:3,removed:false};
      }
      pg.run.room = room; pg.run.phase = 'room'; rooms.push(room);
    }
  }
  this.room = rooms[0]; this.publish();
  if (rooms[0].type === 'combat') return this.startBattle(this.players[0].game.combatSpec(rooms[0]), rooms.map(function(r,i){return self.players[i].game.combatSpec(r);}));
  var fights = [];
  await Promise.all(this.players.map(async function (p, owner) {
    var g = p.game, X = g.api(), r = rooms[owner];
    if (r.type === 'rest') {
      var opts = [{id:'upgrade',label:'カードを1枚強化する'}];
      if (g.canRest()) opts.unshift({id:'heal',label:'休む：HPを' + (3 + (g.hasRelic('r_boot') ? 1 : 0)) + '回復'});
      var rest = await self.choose(owner,{type:'option',prompt:'焚き火：自分の行動を選ぶ',options:opts});
      if (rest === 'heal') g.rest(); else await X.upgrade(1);
    } else if (r.type === 'treasure') { if(r.relic) await X.relic(r.relic); }
    else if (r.type === 'shop') await self.shop(owner, r.shop);
    else if (r.type === 'event') {
      var ev = G.EVENTS[r.eventId];
      var options = ev.options || ev.opts;
      assert(options, '異聞データを確認してください。');
      var available = options.map(function (o,i) { return {o:o,i:i}; }).filter(function (x) { return !x.o.req || x.o.req(g) === true; });
      var pick = await self.choose(owner,{type:'option',prompt:ev.name + '：' + ev.text,options:available.map(function(x){return {id:x.i,label:x.o.label + ' — ' + x.o.desc};})});
      var result = await options[pick].run(X);
      X.log.forEach(function (s) { self.note(p.name + '：' + s); });
      if (result && result.fight) fights.push(result.fight);
    }
  }));
  if (nodeKind === 'shop') {
    firstRoom.shop.relics.forEach(function(r){if(!r.sold)self.players[0].game.returnRelic(r.id);});
    firstRoom.shop.potions.forEach(function(p){if(!p.sold)self.players[0].game.returnPotion(p.id);});
  }
  if (this.players.some(function (p) { return p.run.hp <= 0; })) { this.phase = 'defeat'; this.result = 'defeat'; this.clearCheckpoint(); return; }
  if (fights.length) {
    var e = G.ENCOUNTERS[fights[0]];
    return this.startBattle({kind:'event',encId:fights[0],enemies:[e.enemy].concat(e.summons||[]),rewards:e.rewards});
  }
  this.toMap();
};
Core.prototype.shop = async function (owner, shop) {
  var p = this.players[owner], g = p.game, run = p.run;
  while (true) {
    var options = [{id:'leave',label:'買い物を終える'}], items = {};
    ['cards','relics','potions'].forEach(function (kind) {
      shop[kind].forEach(function (x,i) {
        if (x.sold || run.gold < x.price || (kind === 'potions' && run.potions.length >= g.potionCap())) return;
        var id = kind + ':' + i, def = kind === 'cards' ? G.CARDS[x.id] : kind === 'relics' ? G.RELICS[x.id] : G.POTIONS[x.id];
        items[id] = {kind:kind,item:x}; options.push({id:id,label:def.name + ' / 金貨' + x.price + ' — ' + (def.text || def.t)});
      });
    });
    if (!shop.removed && run.gold >= shop.removeCost) options.push({id:'remove',label:'カードを1枚除去 / 金貨' + shop.removeCost});
    var pick = await this.choose(owner,{type:'option',prompt:'行商人 · 所持金貨 ' + run.gold,options:options});
    if (pick === 'leave') break;
    if (pick === 'remove') { if (await g.api().remove(1)) { g.gainGold(-shop.removeCost); shop.removed = true; } }
    else { var it = items[pick], x = it.item;
      // Another player may have bought the shared item while this prompt was open.
      if (x.sold || run.gold < x.price) continue;
      g.gainGold(-x.price); x.sold = true;
      if (it.kind === 'cards') g.addCard(x.id); else if (it.kind === 'relics') g.gainRelic(x.id); else g.gainPotion(x.id);
    }
    this.publish();
  }
  shop.cards.forEach(function(c){if(!c.sold)(c.rare?run.rareDeck:run.rewardDeck).push(c.id);});
};
Core.prototype.startBattle = async function (spec, laneSpecs) {
  var self = this;
  this.phase = 'combat'; this.turn = 0; this.room = {type:'combat',kind:spec.kind,encId:spec.encId};
  var summonSupply = {};
  this.players.forEach(function(p){p.run.summonDecks = summonSupply;});
  this.combats = this.players.map(function (p,i) { return p.game.newCombat(copy(laneSpecs ? laneSpecs[i] : spec)); });
  var enemies = [], pendingSummons = [];
  this.combats.forEach(function (c, i) {
    c.enemies = enemies; c.party = self.combats; c.lane = i; c.pendingSummons = pendingSummons;
    c.hand = []; c.draw = c.run.deck.map(function (x) { return copy(x); }); c.rng.shuffle(c.draw);
    var innate = c.draw.filter(function(x){return G.card.hasKw(x,'innate');});
    c.draw = c.draw.filter(function(x){return !G.card.hasKw(x,'innate');}).concat(innate);
  });
  var lanes = spec.kind === 'elite' || spec.kind === 'boss' ? [this.combats[0]] : this.combats;
  lanes.forEach(function(c){(c.spec.enemies || []).forEach(function(id){c.spawn(id.indexOf('random:') === 0 ? c.g.drawSummon(id.slice(7)) : id);});});
  // Setup instructions can place summons in every row (Sentries, bosses, etc.).
  for (var li = 0; li < lanes.length; li++) {
    var setup = G.ENCOUNTERS[lanes[li].spec.encId];
    if (setup && setup.setup) await setup.setup(lanes[li]);
  }
  this.note('全員で1回のターン。カードは好きな順に使えます。全員の終了後、敵が列ごとに行動します。');
  await this.nextRound();
};
Core.prototype.nextRound = async function () {
  this.turn++; this.ended = this.players.map(function(){return false;});
  await this.combats[0].flushSummons();
  for (var i = 0; i < this.combats.length; i++) await this.combats[i].preparePlayerTurn();
  var die = 1 + this.players[0].game.rng.int(6);
  this.combats.forEach(function(c){c.die=die;});
  await this.combats[0].emit('die',{value:die,rolled:true});
  while (true) {
    var modifiers = this.combats.map(function(c,i){return {owner:i,mods:c.dieMods()};}).filter(function(x){return x.mods.length;});
    if (!modifiers.length) break;
    var modifying = modifiers.length === 1 ? modifiers[0].owner : await this.choose(this.leader,{type:'option',prompt:'共有の出目：次に調整する人を選ぶ',options:modifiers.map(function(x){return {id:x.owner,label:this.players[x.owner].name};},this).concat([{id:'done',label:'この出目で進む'}])});
    if (modifying === 'done') break;
    this.combats[modifying].die = die; await this.combats[modifying].dieWindow(); die = this.combats[modifying].die;
    if (modifiers.length === 1) break;
  }
  this.combats.forEach(function(c){c.die=die;});
  for (var si = 0; si < this.combats.length; si++) {
    await this.combats[si].startTurnAbilities(si === 0);
    if (await this.battleEnded()) return;
  }
  this.note('共有ターン ' + this.turn + ' · 出目 ' + die);
};
Core.prototype.endRound = async function () {
  var self = this, effects = [], automatic = false;
  for (var i = 0; i < this.combats.length; i++) {
    var c = this.combats[i]; c.phase = 'end'; await c.emit('endTurnStart',{});
    c.endTurnEffects().forEach(function(effect){effects.push({label:self.players[i].name+'：'+effect.label,run:effect.run});});
  }
  if (this.combats[0].poisonTotal()) effects.push({label:'毒のダメージ',run:function(){return self.combats[0].tickPoison();}});
  while (effects.length) {
    var choice = automatic || effects.length === 1 ? 0 : await this.choose(this.leader,{type:'option',prompt:'全員のターン終了時：次に処理する効果を選ぶ',options:effects.map(function(e,i){return {id:i,label:e.label};}).concat([{id:'auto',label:'表示順にすべて処理'}])});
    if (choice === 'auto') { automatic = true; choice = 0; }
    assert(effects[choice], '効果を選んでください。');
    await effects.splice(choice,1)[0].run();
    if (await this.battleEnded()) return;
  }
  for (var di = 0; di < this.combats.length; di++) await this.combats[di].discardEndHand();
  var skip = this.combats.some(function(c){return c.skipEnemyTurn;});
  this.combats.forEach(function(c){c.skipEnemyTurn=false;});
  if (!skip) await this.combats[0].enemyTurn();
  if (!await this.battleEnded()) await this.nextRound();
};
Core.prototype.battleEnded = async function () {
  if (this.phase !== 'combat') return true;
  if (this.combats.some(function (c) { return c.hero.hp <= 0; })) {
    this.players.forEach(function (p,i) { p.run.hp = Math.max(0,this.combats[i].hero.hp); },this);
    this.phase = 'defeat'; this.result = 'defeat'; this.note('仲間が力尽き、冒険は敗北となった。'); this.clearCheckpoint(); return true;
  }
  if (this.combats[0].alive().length || this.combats[0].pendingSummons.length) return false;
  this.phase = 'rewards'; this.publish();
  var self = this, spec = this.combats[0].spec;
  await Promise.all(this.players.map(async function (p,i) {
    var c = self.combats[i];
    if (c.hero.hp > 0) {
      c.over = false; c.result = c.fled && !c.anyKilled ? 'fled' : 'victory';
      await c.finishCombat();
    }
    if (spec.kind === 'elite') p.run.stats.elites++;
    if (spec.kind !== 'boss') {
      var rewards = p.game.combatRewards(c.spec,c);
      for (var j=0;j<rewards.length;j++) await p.game.api().reward(rewards[j]);
    }
  }));
  if (spec.kind === 'boss') { this.phase='victory'; this.result='victory'; this.note(this.players.length + '人で第一層を踏破した！'); this.clearCheckpoint(); }
  else this.toMap();
  return true;
};
Core.prototype.clearCheckpoint = function () { if (this.hooks.save) this.hooks.save(null); };
Core.prototype.toMap = function () {
  this.combats = []; this.room = null; this.phase = 'map'; this.leader = (this.leader + 1) % this.players.length; this.votes = this.players.map(function(){return null;});
  this.players.forEach(function (p) { p.run.phase='map'; p.run.room=null; });
  this.checkpoint(); this.publish();
};
Core.prototype.close = function () {
  this.closed = true;
  this.pending.forEach(function (p) { if(p) p.reject(new Error('冒険を終了しました。')); });
  this.pending=this.players.map(function(){return null;}); this.prompts=this.players.map(function(){return null;});
};
G.CoopCore = Core;
})(typeof window !== 'undefined' ? window : globalThis);

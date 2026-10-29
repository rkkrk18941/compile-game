/* スレイザスパイア — Downfall: the Guardian's Gems (rulebook v1.47 p.5 "Gems").
   - The Gem deck (transparent Gem cards) lies beside the reward decks and is shuffled between Acts.
   - Some reward cards have a Socket. Whenever cards are revealed for a card reward (normal, upgraded, rare) or at
     the Merchant and one or more of them has a Socket, 2 Gems are revealed. A card with a Socket taken from those
     cards gets one of the revealed Gems (the player chooses); unpicked Gems go to the bottom of the Gem deck.
     At most 2 cards with a Socket can be bought at a Merchant (each takes one of that row's 2 Gems).
   - Gaining a card with a Socket any other way (Transform, a random card...) reveals 1 Gem for it.
   - Upgrading keeps the Gem. Removing or transforming the card returns its Gem to the bottom of the Gem deck.
   - In combat the Gem's effect is read in place of the "Socket." text, at the end of the card's text: it resolves
     after the card's own effect, for every copy of the card. Hits from a Gem on a Skill or Attack are that card's
     hits (Strength, Weak, Vulnerable, Attack Mode Vigor apply); hits from a Gem on a Power are not affected.
   Gems are registered with DF.addGem (the printed Gems in df-cards-guardian.js). No DOM. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var DF = STS.DF = STS.DF || {};
var G = STS.Game.prototype, C = STS.Combat.prototype;

DF.GEMS = DF.GEMS || {};
DF.addGem = function (id, o) { o.id = id; DF.GEMS[id] = o; return o; };
DF.gemsExist = function () { return Object.keys(DF.GEMS).length > 0; };
DF.hasSocket = function (id) { var d = STS.CARDS[DF.canon ? DF.canon(id) : id]; return !!(d && d.socket); };
DF.gemName = function (id) { var g = DF.GEMS[id]; return g ? g.name : ''; };
DF.gemText = function (id) { var g = DF.GEMS[id]; return g ? g.name + '：' + g.tx : ''; };

/* ------------------------------------------------------------------ the Gem deck (top = end of the array) */
G.gemDeck = function () {
  var d = this.run.decks;
  if (!d.gems) {
    // Built on first use (also for saves made before Gems existed): every Gem not attached to a deck card.
    var used = {}, all = [];
    this.run.players.forEach(function (p) { p.deck.forEach(function (c) { if (c.gem) used[c.gem] = (used[c.gem] || 0) + 1; }); });
    Object.keys(DF.GEMS).forEach(function (id) {
      for (var i = 0; i < (DF.GEMS[id].copies || 1); i++) { if (used[id] > 0) used[id]--; else all.push(id); }
    });
    d.gems = this.shuffle(all);
  }
  return d.gems;
};
G.revealGems = function (n) { var deck = this.gemDeck(), out = []; for (var i = 0; i < n && deck.length; i++) out.push(deck.pop()); return out; };
G.returnGems = function (ids) { var deck = this.gemDeck(); (ids || []).forEach(function (id) { if (id) deck.unshift(id); }); };
var _setupAct = G.setupAct;
G.setupAct = function (act) {
  _setupAct.call(this, act);
  if (act > 1 && this.run.decks.gems) this.shuffle(this.run.decks.gems);
};

/* ------------------------------------------------------------------ card rewards */
var _cardReward = G.cardReward;
G.cardReward = function (p, kind, n, o) {
  var self = this, run = this.run, base = this.revealCards;
  // The base reveals the cards before its first await; look at them as they are revealed.
  this.revealCards = function (src, k, nn) {
    var out = base.call(self, src, k, nn);
    if (DF.gemsExist() && out.some(function (c) { return DF.hasSocket(c.id); })) (run.gemOffer || (run.gemOffer = {}))[p.i] = self.revealGems(2);
    return out;
  };
  var pr;
  try { pr = _cardReward.call(this, p, kind, n, o); } finally { delete this.revealCards; }
  return Promise.resolve(pr).then(function (res) { self.endGemOffer(p); return res; }, function (e) { self.endGemOffer(p); throw e; });
};
G.endGemOffer = function (p) {
  var run = this.run, left = run.gemOffer && run.gemOffer[p.i];
  if (!left) return;
  this.returnGems(left);
  delete run.gemOffer[p.i];
};
/* The card reward prompt shows the revealed Gems. */
var _ask = G.ask;
G.ask = function (pi, q) {
  var off = this.run.gemOffer && this.run.gemOffer[pi];
  if (q && q.type === 'cardReward' && off && off.length) q.gems = off.slice();
  return _ask.call(this, pi, q);
};

/* ------------------------------------------------------------------ the Merchant */
G.ensureShopGems = function () {
  var sh = this.run.room && this.run.room.shop, self = this;
  if (!sh || sh.closed || sh.gems || !DF.gemsExist()) return;
  sh.gems = {}; sh.socketBought = {};
  (sh.cards || []).forEach(function (list, pi) { if ((list || []).some(function (c) { return DF.hasSocket(c.id); })) sh.gems[pi] = self.revealGems(2); });
};
var _roomShop = G.roomShop;
G.roomShop = function () {
  var self = this, pr = _roomShop.call(this);
  this.ensureShopGems();
  return Promise.resolve(pr).then(function (r) {
    var sh = self.run.room && self.run.room.shop;
    if (sh && sh.closed && sh.gems) { Object.keys(sh.gems).forEach(function (pi) { self.returnGems(sh.gems[pi]); sh.gems[pi] = []; }); }
    return r;
  });
};
var _shopAction = G.shopAction;
G.shopAction = async function (p, a) {
  var sh = this.run.room && this.run.room.shop;
  this.ensureShopGems();
  var it = sh && a && a.act === 'card' && sh.cards[p.i] ? sh.cards[p.i][a.idx] : null;
  if (!it || it.sold || !DF.hasSocket(it.id)) return _shopAction.call(this, p, a);
  var bought = (sh.socketBought && sh.socketBought[p.i]) || 0;
  if (bought >= 2) throw new Error('ソケットのあるカードは、1回の商人で2枚までしか買えません。');
  sh.buying = sh.buying || {};
  sh.buying[p.i] = true;
  try { await _shopAction.call(this, p, a); } finally { delete sh.buying[p.i]; }
  (sh.socketBought || (sh.socketBought = {}))[p.i] = bought + 1;
};

/* ------------------------------------------------------------------ gaining, removing, transforming */
var _addCard = G.addCard;
G.addCard = async function (p, id, up, o) {
  var c = await _addCard.call(this, p, id, up, o);
  if (!c || c.gem || !DF.hasSocket(id) || !DF.gemsExist()) return c;
  var run = this.run, sh = run.room && run.room.shop, pool = null, fromReward = false;
  if (sh && sh.buying && sh.buying[p.i] && sh.gems && sh.gems[p.i] && sh.gems[p.i].length) pool = sh.gems[p.i];
  else if (run.gemOffer && run.gemOffer[p.i] && run.gemOffer[p.i].length) { pool = run.gemOffer[p.i]; fromReward = true; }
  var gem = null;
  if (pool) {
    gem = pool.length === 1 ? pool[0] : await this.ask(p.i, { type: 'option', title: STS.CARDS[id].name + 'のソケットに付けるジェムを選択', gemPick: true,
      options: pool.map(function (g) { return { id: g, label: DF.gemText(g) }; }) });
    if (pool.indexOf(gem) < 0) gem = pool[0];
    pool.splice(pool.indexOf(gem), 1);
    if (fromReward) { this.returnGems(pool.splice(0)); delete run.gemOffer[p.i]; }
  } else gem = this.revealGems(1)[0] || null;
  if (gem) {
    c.gem = gem;
    this.emit({ t: 'gem', i: p.i, u: c.u, id: id, gem: gem });
    this.log(p.name + '：' + STS.CARDS[id].name + 'にジェム「' + DF.gemName(gem) + '」を付けた');
  }
  return c;
};
var _removeCard = G.removeCard;
G.removeCard = async function (p, c) {
  var gem = c && c.gem, had = p.deck.indexOf(c) >= 0;
  await _removeCard.call(this, p, c);
  if (gem && had && p.deck.indexOf(c) < 0) { delete c.gem; this.returnGems([gem]); }
};
var _transform = G.transformCard;
G.transformCard = async function (p, c) {
  var gem = c && c.gem, had = p.deck.indexOf(c) >= 0;
  var r = await _transform.call(this, p, c);
  if (gem && had && p.deck.indexOf(c) < 0) { delete c.gem; this.returnGems([gem]); }
  return r;
};

/* ------------------------------------------------------------------ in combat */
var prevCtx = DF.ctxExtra;
DF.ctxExtra = function (cb, pc, c, k) {
  if (prevCtx) prevCtx(cb, pc, c, k);
  // Gem hits: the card's own hits on Skills/Attacks; unaffected by anything on Powers.
  k.gemAtk = async function (dmgs, tgt) {
    var power = STS.cdef(c).t === 'P';
    var t = tgt || k.target || await cb.chooseEnemy(pc, STS.cdef(c).name + '（ジェム）：対象の敵を選択');
    if (!t) return null;
    return k.atk(dmgs, t, power ? { gemPower: true, noMods: true, noStr: true } : {});
  };
  k.gem = function () { var g = c.gem && DF.GEMS[c.gem]; return g ? g.play(k) : null; };
};
var _resolve = C.resolve;
C.resolve = async function (k, cmd) {
  await _resolve.call(this, k, cmd);
  var c = k.card, g = c && c.gem && DF.GEMS[c.gem];
  if (!g || this.s.over || k.pc.dead) return;
  var d = STS.cdef(c);
  if (d.socketAt && d.socketAt !== 'play') return; // the card applies its Gem itself (an ongoing Power effect)
  this.emit({ t: 'gemFx', i: k.pc.i, gem: c.gem });
  await g.play(k);
};
})(typeof window !== 'undefined' ? window : globalThis);

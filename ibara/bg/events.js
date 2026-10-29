/* スレイザスパイア — event cards of the board-game edition (Acts I–III, Ascension 3 cards, Empty Room of Act IV).
   Rule (rulebook "Event"): if there is text in [yellow brackets], each player chooses one of those options and
   resolves it once, in any order; some events work differently, as their text says ("each player", "one player",
   "everyone", fights). To choose a "Pay"/"Give" option you must first have what it asks for (players may hand gold
   to one another first). Numbers follow LuaViper's StSBoardGameMod event classes, which transcribe the printed
   cards. Option names use the video-game Japanese localisation where one exists. No DOM. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var EV = STS.EVENTS = {};
var DECKS = STS.EVENT_DECKS = {};

function ev(id, o) { o.id = id; EV[id] = o; return o; }

/* ------------------------------------------------------------------ persistence helpers
   Every decision, die result and reward list is kept in the event state (run.room.ev), so a game resumed from a
   checkpoint continues the event without asking twice or applying an effect twice. */
function mem(st) { return st.m || (st.m = {}); }
async function once(g, st, key, fn) {
  var m = mem(st);
  if (Object.prototype.hasOwnProperty.call(m, key)) return m[key];
  var v = await fn();
  if (v === undefined) v = null;
  m[key] = v;
  g.checkpoint();
  return v;
}
function sub(st, k) { st.sub = st.sub || {}; return st.sub[k] || (st.sub[k] = {}); }
function opt(id, label, o) { return Object.assign({ id: id, label: label }, o || {}); }
function LEAVE() { return opt('leave', '[立ち去る]'); }

/* One player picks one option. o.gold = a payment (checked when answered: gold can be handed over first),
   o.dis = a reason the option is locked. */
function choose(g, st, p, key, options, text) {
  var def = EV[st.id] || {};
  return once(g, st, p.i + ':' + key, async function () {
    for (var guard = 0; guard < 60; guard++) {
      var view = options.map(function (o) {
        var why = o.dis || (o.gold && p.gold < o.gold ? o.gold + 'ゴールドが必要です' : null);
        return Object.assign({}, o, { disabled: !!why, why: why || undefined });
      });
      if (!options.some(function (o) { return !o.dis; })) return null;
      var ans = await g.ask(p.i, { type: 'option', title: def.name || 'イベント', text: text || def.text, ev: st.id, options: view });
      var pick = options.filter(function (o) { return o.id === ans; })[0];
      if (!pick || pick.dis) continue;
      if (pick.gold && p.gold < pick.gold) { g.emit({ t: 'error', i: p.i, msg: 'ゴールドが足りません。ほかのプレイヤーから受け取ることもできます。' }); continue; }
      g.recordRoomChoice(p.i, p.i + ':' + key, pick.label, def.name);
      return pick.id;
    }
    return null;
  });
}
/* A group decision for events whose text acts for the whole party: majority, leader breaks ties. */
function vote(g, st, key, options, text) {
  var def = EV[st.id] || {};
  return once(g, st, 'vote:' + key, async function () {
    var ids = options.filter(function (o) { return !o.dis; }).map(function (o) { return o.id; });
    if (ids.length === 1) {
      await g.askAll({ type: 'info', title: def.name, text: (text || def.text) + '\n' + options.filter(function (o) { return o.id === ids[0]; })[0].label, ev: st.id, ok: '続ける' });
      g.recordRoomChoice(null, 'vote:' + key, options.filter(function (o) { return o.id === ids[0]; })[0].label, def.name);
      return ids[0];
    }
    var view = options.map(function (o) { return Object.assign({}, o, { disabled: !!o.dis, why: o.dis || undefined }); });
    var votes = await g.askAll({ type: 'option', title: def.name, text: text || def.text, ev: st.id, options: view, vote: g.n() > 1 });
    var selected = g.tally(votes, ids);
    g.recordRoomChoice(null, 'vote:' + key, options.filter(function (o) { return o.id === selected; })[0].label, def.name);
    return selected;
  });
}
function roll(g, st, key, title) { return once(g, st, 'die:' + key, async function () { var face = await g.rollDie(title); g.recordRoomChoice(null, 'roll:' + key, title + '：出目' + face, 'ダイス結果'); return face; }); }
function info(g, st, p, key, text) {
  var def = EV[st.id] || {};
  return once(g, st, p.i + ':info:' + key, function () { return g.ask(p.i, { type: 'info', title: def.name, text: text, ev: st.id, ok: '続ける' }); });
}
/* The leader names the player who receives a "one player" effect. */
function onePlayer(g, st, key, title) {
  return once(g, st, 'who:' + key, async function () {
    if (g.n() === 1) return 0;
    var ans = await g.ask(0, { type: 'player', title: title, options: g.run.players.map(function (p) { return p.i; }) });
    return g.P(ans) ? ans : 0;
  });
}
function pay(g, p, n) { p.gold = Math.max(0, p.gold - n); g.emit({ t: 'gold', i: p.i, n: -n }); }
function upgradableN(g, p) { return g.upgradable(p).length; }
function transformable(p) { return p.deck.filter(function (c) { var d = STS.CARDS[c.id]; return d.t !== 'C' && !d.noRemove; }); }
function isStarter(c, kind) { return new RegExp('^' + kind + '[RGBWSUHM]$').test(c.id); }
function payableRelics(p) { return p.relics.filter(function (r) { var d = STS.RELICS[r.id]; return d && d.type === 'normal'; }); }
async function gainTopRelic(g, p) {
  var id = g.drawRelic('normal');
  if (!id) return null;
  await g.gainRelic(p, id);
  return id;
}
function discardRelic(g, p, id) { var r = g.loseRelic(p, id); if (r) g.returnRelic(id); return r; }
function pickRelic(g, st, p, key, title, list) {
  return once(g, st, p.i + ':relic:' + key, async function () {
    if (!list.length) return null;
    if (list.length === 1) return list[0].id;
    var ans = await g.ask(p.i, { type: 'option', title: title, ev: st.id, options: list.map(function (r) { return { id: r.id, label: STS.RELICS[r.id].name, relic: r.id }; }) });
    return list.some(function (r) { return r.id === ans; }) ? ans : list[0].id;
  });
}
function pickPotion(g, st, p, key, title) {
  return once(g, st, p.i + ':potion:' + key, async function () {
    if (!p.potions.length) return null;
    if (p.potions.length === 1) return 0;
    var ans = await g.ask(p.i, { type: 'option', title: title, ev: st.id, options: p.potions.map(function (id, s) { return { id: String(s), label: STS.POTIONS[id].name, potion: id }; }) });
    var s = parseInt(ans, 10);
    return p.potions[s] ? s : 0;
  });
}
function discardPotion(g, p, slot) {
  var id = p.potions.splice(slot, 1)[0];
  if (id) { g.run.decks.potions.unshift(id); g.emit({ t: 'losePotion', i: p.i, id: id }); }
  return id;
}
function step(g, st, p, key, fn) { return once(g, st, p.i + ':do:' + key, fn); }
async function claim(g, st, key, make) {
  var m = mem(st), k = 'rw:' + key;
  if (!m[k]) { m[k] = make(); g.checkpoint(); }
  await Promise.all(m[k].map(function (rw) { return rw.done ? null : g.claimFor(rw); }));
}
function over(g) { return g.run.phase === 'over'; }

/* Event fights. The whole party takes part, as in any combat. */
async function standardFight(g, st, key) {
  var encs = await once(g, st, 'encs:' + key, function () { return g.run.players.map(function () { return g.drawEncounter('enc'); }); });
  var res = await once(g, st, 'fight:' + key, function () { return g.fight({ kind: 'normal', encs: encs, eventFight: true }); });
  if (res !== 'victory' || over(g)) return res;
  await claim(g, st, key, function () {
    return g.run.players.map(function (p, i) {
      var enc = STS.ENCOUNTERS[encs[p.row] || encs[i]] || {}, rw = enc.rewards || {};
      return g.makeRewards(p, { gold: rw.gold || 0, potion: rw.potion ? 1 : 0, cards: [{ kind: 'normal' }] });
    });
  });
  return res;
}
async function eliteFight(g, st, key) {
  var elite = await once(g, st, 'elite:' + key, function () { return g.drawEncounter('elite'); });
  var res = await once(g, st, 'fight:' + key, function () { return g.fight({ kind: 'elite', elite: elite, eventFight: true }); });
  if (res !== 'victory' || over(g)) return res;
  await claim(g, st, key, function () {
    var rw = (STS.ENCOUNTERS[elite] || {}).rewards || { gold: 2, relic: true };
    return g.run.players.map(function (p) {
      return g.makeRewards(p, { gold: rw.gold || 0, potion: rw.potion ? 1 : 0, relic: rw.relic ? 1 : 0, cards: [{ kind: g.run.act >= 2 ? 'upgraded' : 'normal' }] });
    });
  });
  return res;
}

/* ================================================================== ACT I */
ev('LivingWall', { name: '生きている壁', en: 'Living Wall', act: [1],
  text: '壁に浮かんだ顔たちが「忘れろ」「変われ」「育て」とささやいてくる。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('forget', '[忘却] カードを1枚除去する。', { dis: g.removable(p).length ? null : '除去できるカードがありません' }),
        opt('change', '[変化] カードを1枚変化させる。', { dis: transformable(p).length ? null : '変化できるカードがありません' }),
        opt('grow', '[成長] カードを1枚アップグレードする。', { dis: upgradableN(g, p) ? null : 'アップグレードできるカードがありません' })]);
      if (c === 'forget') await step(g, st, p, 'a', function () { return g.removeCards(p, 1, '生きている壁：除去するカードを選択').then(function () {}); });
      else if (c === 'change') await step(g, st, p, 'a', function () { return g.transformCards(p, 1, '生きている壁：変化させるカードを選択').then(function () {}); });
      else if (c === 'grow') await step(g, st, p, 'a', function () { return g.upgradeCards(p, 1, '生きている壁：アップグレードするカードを選択').then(function () {}); });
    });
  } });

ev('Library', { name: '図書館', en: 'The Library', act: [1],
  text: '打ち捨てられた図書館。椅子に腰かけて一息つける。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var pipe = g.hasRelic(p, 'PeacePipe');
      var c = await choose(g, st, p, 'c', [
        opt('read', '[読書] カード報酬デッキの上から5枚を公開し、1枚をデッキに加える。'),
        opt('sleep', '[睡眠] HPを3回復する。' + (pipe ? '（安らぎのパイプ：カードを1枚除去してもよい）' : ''))]);
      if (c === 'read') await step(g, st, p, 'a', function () { return g.cardReward(p, 'normal', 5, { title: '図書館：デッキに加えるカードを1枚選択', noSkip: true }); });
      else if (c === 'sleep') {
        await step(g, st, p, 'a', function () { g.heal(p, 3); });
        if (pipe) await step(g, st, p, 'b', function () { return g.removeCards(p, 1, '安らぎのパイプ：除去するカードを選択（任意）', true).then(function () {}); });
      }
    });
  } });

ev('GoldenIdol', { name: '黄金の偶像', en: 'Golden Idol', act: [1],
  text: '古代の神殿の奥で、輝く宝が静かに置かれている。罠は見当たらないが……。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [opt('take', '[取る] レリックを1個得る。罠が作動し、1ダメージを受ける。'), LEAVE()]);
      if (c === 'take') {
        await step(g, st, p, 'a', function () { return gainTopRelic(g, p); });
        await step(g, st, p, 'b', function () { return g.loseHpOut(p, 1); });
      }
    });
  } });

ev('GoldenWing', { name: '黄金の翼', en: 'Wing Statue', act: [1],
  text: '翼をかたどった大きな青い像。ひび割れからゴールドがこぼれている。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('pray', '[祈る] カードを1枚除去する。HPを2失う。', { dis: g.removable(p).length ? null : '除去できるカードがありません' }),
        opt('destroy', '[破壊する] 2ゴールドを得る。'), LEAVE()]);
      if (c === 'pray') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
        if (!over(g)) await step(g, st, p, 'b', function () { return g.removeCards(p, 1, '黄金の翼：除去するカードを選択').then(function () {}); });
      } else if (c === 'destroy') await step(g, st, p, 'a', function () { g.gainGold(p, 2); });
    });
  } });

ev('Bonfire', { name: 'たき火の精霊', en: 'Bonfire Spirits', act: [1, 3],
  text: '紫色の炎の精霊たちが大きなたき火の周りで踊り、捧げ物を待っている。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [opt('offer', '[捧げる] カードを1枚除去し、そのカードに応じた報酬を得る。呪い：HPを1失う／基本・コモン：なし／アンコモン：HPを3回復／レア：HPを全回復。',
        { dis: g.removable(p).length ? null : '捧げられるカードがありません' })]);
      if (c !== 'offer') { await info(g, st, p, 'none', '捧げられるカードがない。精霊たちは興味を失ったようだ。'); return; }
      var rar = await step(g, st, p, 'a', async function () {
        var cs = await g.pickDeck(p, g.removable(p), 1, 1, 'たき火の精霊：捧げるカードを選択');
        if (!cs[0]) return null;
        var d = STS.CARDS[cs[0].id];
        await g.removeCard(p, cs[0]);
        return d.t === 'C' ? 'curse' : d.r;
      });
      await step(g, st, p, 'b', async function () {
        if (rar === 'curse') { await g.loseHpOut(p, 1); g.log(p.name + '：呪いを捧げて精霊を怒らせた（HP-1）'); }
        else if (rar === 'U') g.heal(p, 3);
        else if (rar === 'R') g.heal(p, g.maxHp(p));
      });
    });
  } });

ev('Transmogrifier', { name: '一変', en: 'Transmogrifier', act: [1],
  text: '忘れられた精霊を祀る、手の込んだ祭壇がある。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var n = transformable(p).length;
      var c = await choose(g, st, p, 'c', [
        opt('pray', '[祈る] カードを1枚変化させる。', { dis: n ? null : '変化できるカードがありません' }),
        opt('sacrifice', '[生贄] カードを2枚変化させる。呪いを1枚得る。', { dis: n >= 2 ? null : '変化できるカードが2枚必要です' })]);
      if (c === 'pray') await step(g, st, p, 'a', function () { return g.transformCards(p, 1, '一変：変化させるカードを選択').then(function () {}); });
      else if (c === 'sacrifice') {
        await step(g, st, p, 'a', function () { return g.transformCards(p, 2, '一変：変化させるカードを2枚選択').then(function () {}); });
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      } else await info(g, st, p, 'none', '変化させられるカードがない。');
    });
  } });

ev('Cleric', { name: '聖職者', en: 'The Cleric', act: [1],
  text: '金色の兜をかぶった青い人型の生き物が、満面の笑みでサービスを勧めてくる。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('heal', '[回復] 1ゴールド：HPを3回復する。', { gold: 1 }),
        opt('prayer', '[祈り] 2ゴールド：カードを1枚アップグレードする。', { gold: 2, dis: upgradableN(g, p) ? null : 'アップグレードできるカードがありません' }),
        opt('purify', '[浄化] 3ゴールド：カードを1枚除去する。', { gold: 3, dis: g.removable(p).length ? null : '除去できるカードがありません' }),
        LEAVE()]);
      if (c === 'heal') await step(g, st, p, 'a', function () { pay(g, p, 1); g.heal(p, 3); });
      else if (c === 'prayer') await step(g, st, p, 'a', function () { pay(g, p, 2); return g.upgradeCards(p, 1, '聖職者：アップグレードするカードを選択').then(function () {}); });
      else if (c === 'purify') await step(g, st, p, 'a', function () { pay(g, p, 3); return g.removeCards(p, 1, '聖職者：除去するカードを選択').then(function () {}); });
    });
  } });

ev('UpgradeShrine', { name: '向上の社', en: 'Upgrade Shrine', act: [1],
  text: '忘れられた精霊を祀る、手の込んだ社がある。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('pray', '[祈る] カードを1枚アップグレードする。', { dis: upgradableN(g, p) ? null : 'アップグレードできるカードがありません' }),
        opt('sacrifice', '[生贄] ランダムなカード2枚をアップグレードする。HPを2失う。')]);
      if (c === 'pray') await step(g, st, p, 'a', function () { return g.upgradeCards(p, 1, '向上の社：アップグレードするカードを選択').then(function () {}); });
      else if (c === 'sacrifice') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
        if (!over(g)) await step(g, st, p, 'b', function () { g.upgradeRandom(p, 2); });
      }
    });
  } });

var WHEEL = ['4ゴールドを得る', 'レリックを1個得る', 'HPを全回復する', '呪いを1枚得る', 'カードを1枚除去する', 'HPを2失う'];
ev('Wheel', { name: '変化のルーレット', en: 'Wheel of Change', act: [1, 2, 3],
  text: '陽気なグレムリンが「ルーレットの時間だよ！」と叫ぶ。ダイスの目で賞品が決まる。\n1：4ゴールド　2：レリック　3：HP全回復　4：呪い　5：カード1枚除去　6：HPを2失う',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      await choose(g, st, p, 'c', [opt('play', '[プレイ] ダイスを振って賞品を得る。')]);
      var die = await roll(g, st, 'p' + p.i, p.name + '：変化のルーレット');
      await step(g, st, p, 'a', async function () {
        g.log(p.name + '：ルーレットの目は' + die + '（' + WHEEL[die - 1] + '）');
        if (die === 1) g.gainGold(p, 4);
        else if (die === 2) await gainTopRelic(g, p);
        else if (die === 3) g.heal(p, g.maxHp(p));
        else if (die === 4) await g.gainCurse(p);
        else if (die === 5) await g.removeCards(p, 1, '変化のルーレット：除去するカードを選択');
        else await g.loseHpOut(p, 2);
      });
    });
  } });

ev('OminousForge', { name: '不吉な鍛冶場', en: 'Ominous Forge', act: [1],
  text: '小屋の中に、埃をかぶった鍛冶場がある。炉では火が燃えさかっている。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('forge', '[鍛冶] カードを1枚アップグレードする。HPを2失う。', { dis: upgradableN(g, p) ? null : 'アップグレードできるカードがありません' }),
        opt('rummage', '[探索] レリックを1個得る。ダイス1〜3：呪いを1枚得る。'), LEAVE()]);
      if (c === 'forge') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
        if (!over(g)) await step(g, st, p, 'b', function () { return g.upgradeCards(p, 1, '不吉な鍛冶場：アップグレードするカードを選択').then(function () {}); });
      } else if (c === 'rummage') {
        await step(g, st, p, 'a', function () { return gainTopRelic(g, p); });
        var die = await roll(g, st, 'p' + p.i, p.name + '：不吉な鍛冶場（1〜3で呪い）');
        if (die <= 3) await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      }
    });
  } });

ev('Lab', { name: '研究室', en: 'Lab', act: [1], group: true,
  text: '試験管やフラスコが並ぶ部屋。全員がポーションを1個得る。ダイス4〜6なら、1人がもう1個得る。',
  run: async function (g, st) {
    await vote(g, st, 'search', [opt('search', '[探す] ポーションを見つける！')]);
    await g.eachPlayer(sub(st, 'a'), function (p) { return step(g, st, p, 'pot', function () { return g.offerPotion(p); }); });
    var die = await roll(g, st, 'lab', '研究室（4〜6でもう1個）');
    if (die >= 4) {
      var who = await onePlayer(g, st, 'lab', '研究室：2個目のポーションを得るプレイヤー');
      await step(g, st, g.P(who), 'pot2', function () { return g.offerPotion(g.P(who)); });
    }
  } });

ev('BigFish', { name: 'ビッグフィッシュ', en: 'Big Fish', act: [1],
  text: 'バナナ、ドーナツ、箱が天井から糸でぶら下がっている。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var strike = p.deck.filter(function (c) { return isStarter(c, 'Strike') && !c.up; });
      var c = await choose(g, st, p, 'c', [
        opt('banana', '[バナナ] HPを2回復する。'),
        opt('donut', '[ドーナツ] 基本のストライクを1枚アップグレードする。', { dis: strike.length ? null : 'アップグレードできるストライクがありません' }),
        opt('box', '[箱] レリックを1個得る。呪いを1枚得る。')]);
      if (c === 'banana') await step(g, st, p, 'a', function () { g.heal(p, 2); });
      else if (c === 'donut') await step(g, st, p, 'a', function () { var s = p.deck.filter(function (x) { return isStarter(x, 'Strike') && !x.up; })[0]; if (s) { s.up = true; g.emit({ t: 'upgrade', i: p.i, ids: [s.id] }); } });
      else if (c === 'box') {
        await step(g, st, p, 'a', function () { return gainTopRelic(g, p); });
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      }
    });
  } });

/* Act I, Ascension 3 */
ev('ScrapOoze', { name: 'スクラップスライム', en: 'Scrap Ooze', act: [1], a3: true,
  text: '金属くずを食べすぎたスライム。中に手を入れれば宝が見つかるかもしれないが、痛そうだ。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      for (var k = 0; k < 40; k++) {
        var first = k === 0;
        var c = await choose(g, st, p, 'c' + k, [
          opt('reach', first ? '[中に手を伸ばす] HPを1失う。ダイス1〜2：何も見つからない（続けられる）／3〜4：2ゴールド／5〜6：レリック。'
                             : '[さらに奥へ] HPを1失い、もう一度ダイスを振る。'), LEAVE()]);
        if (c !== 'reach') return;
        await step(g, st, p, 'hp' + k, function () { return g.loseHpOut(p, 1); });
        if (over(g)) return;
        var die = await roll(g, st, 'p' + p.i + ':' + k, p.name + '：スクラップスライム');
        if (die <= 2) { await info(g, st, p, 'miss' + k, '痛いだけで何も見つからなかった……。まだ宝がありそうだ。'); continue; }
        await step(g, st, p, 'prize', function () { if (die <= 4) g.gainGold(p, 2); else return gainTopRelic(g, p); });
        return;
      }
    });
  } });

ev('WorldOfGoop', { name: 'べとべとの世界', en: 'World of Goop', act: [1], a3: true,
  text: 'スライムの水たまりに落ちてしまった。ゴールドが混ざっているのが見える。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('gather', '[ゴールドを回収する] 3ゴールドを得る。HPを2失う。'),
        opt('deeper', '[奥まで手を伸ばす] レリックを1個得る。呪いを1枚得る。'),
        opt('leave', '[放っておく] 1ゴールドを失う。')]);
      if (c === 'gather') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
        if (!over(g)) await step(g, st, p, 'b', function () { g.gainGold(p, 3); });
      } else if (c === 'deeper') {
        await step(g, st, p, 'a', function () { return gainTopRelic(g, p); });
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      } else if (c === 'leave') await step(g, st, p, 'a', function () { pay(g, p, Math.min(1, p.gold)); });
    });
  } });

ev('DeadAdventurer', { name: '冒険者の屍', en: 'Dead Adventurer', act: [1], a3: true, group: true, notFirstQ: true,
  text: '床に冒険者が倒れている。頭にはエリート遭遇カードが刺さっているが、持ち物は無事のようだ。\nダイス1〜2：エリートと戦う　3〜4：全員が2ゴールド　5〜6：1人がレリックを得る',
  run: async function (g, st) {
    var c = await vote(g, st, 'c', [opt('search', '[探す] 持ち物を探す。'), LEAVE()]);
    if (c !== 'search') return;
    var die = await roll(g, st, 'search', '冒険者の屍');
    if (die <= 2) { await eliteFight(g, st, 'elite'); return; }
    if (die <= 4) { await once(g, st, 'gold', function () { g.run.players.forEach(function (p) { g.gainGold(p, 2); }); }); return; }
    var who = await onePlayer(g, st, 'relic', '冒険者の屍：レリックを得るプレイヤー');
    await step(g, st, g.P(who), 'relic', function () { return gainTopRelic(g, g.P(who)); });
  } });

ev('Hallway', { name: '通路の遭遇', en: 'Hallway Encounter', act: [1, 2, 3], a3: true, group: true, notFirstQ: true,
  text: '通路で敵に出くわした！　通常の遭遇と戦う。',
  run: async function (g, st) {
    await vote(g, st, 'c', [opt('fight', '[戦闘]')]);
    await standardFight(g, st, 'f');
  } });

ev('Merchant', { name: '商人との遭遇', en: 'Merchant Encounter', act: [1, 2, 3], a3: true, group: true, notFirstQ: true,
  text: '道ばたで商人が店を広げている。',
  run: async function (g, st) {
    await vote(g, st, 'c', [opt('shop', '[店に入る]')]);
    await g.roomShop();
  } });

/* ================================================================== ACT II */
ev('GoldenShrine', { name: '黄金の社', en: 'Golden Shrine', act: [2],
  text: '古代の精霊を祀る豪華な社がある。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [opt('pray', '[祈る] 2ゴールドを得る。'), opt('desecrate', '[冒涜する] 7ゴールドを得る。呪いを1枚得る。')]);
      if (c === 'pray') await step(g, st, p, 'a', function () { g.gainGold(p, 2); });
      else if (c === 'desecrate') {
        await step(g, st, p, 'a', function () { g.gainGold(p, 7); });
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      }
    });
  } });

ev('CursedTome', { name: '呪われた本', en: 'Cursed Tome', act: [2],
  text: '打ち捨てられた神殿で、謎めいた文字の書かれた巨大な本を見つけた。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('take', '[取る] レアカード報酬を1回得る。呪いを1枚得る。'),
        opt('read', '[読む] レアデッキの一番上のカードを得る。HPを2失う。'),
        opt('skim', '[流し読み] カード報酬を1回得る。HPを1失う。')]);
      if (c === 'take') {
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
        await step(g, st, p, 'a', function () { return g.cardReward(p, 'rare', 3); });
      } else if (c === 'read') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
        if (!over(g)) await step(g, st, p, 'b', async function () { var id = p.rareDeck.pop(); if (id) await g.addCard(p, id, false); return id; });
      } else if (c === 'skim') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 1); });
        if (!over(g)) await step(g, st, p, 'b', function () { return g.cardReward(p, 'normal', 3); });
      }
    });
  } });

ev('AncientWriting', { name: '古代の筆跡', en: 'Ancient Writing', act: [2],
  text: '壁一面に古代の文字が刻まれている。読み解こうとすると文字が輝き始めた。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('elegance', '[優雅] カードを1枚除去する。', { dis: g.removable(p).length ? null : '除去できるカードがありません' }),
        opt('simplicity', '[シンプル] ストライクと防御を1枚ずつアップグレードする。')]);
      if (c === 'elegance') await step(g, st, p, 'a', function () { return g.removeCards(p, 1, '古代の筆跡：除去するカードを選択').then(function () {}); });
      else if (c === 'simplicity') await step(g, st, p, 'a', function () {
        var ids = [];
        ['Strike', 'Defend'].forEach(function (k) { var c2 = p.deck.filter(function (x) { return isStarter(x, k) && !x.up; })[0]; if (c2) { c2.up = true; ids.push(c2.id); } });
        if (ids.length) g.emit({ t: 'upgrade', i: p.i, ids: ids });
      });
    });
  } });

ev('Augmenter', { name: '増強因子', en: 'Augmenter', act: [2],
  text: '眼帯の男が「科学の発展に協力しないか？」と怪しげな薬を差し出してくる。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('vial', '[薬を飲む] カードを1枚アップグレードする。HPを1失う。', { dis: upgradableN(g, p) ? null : 'アップグレードできるカードがありません' }),
        opt('subject', '[被験者になる] カードを2枚変化させる。HPを2失う。', { dis: transformable(p).length >= 2 ? null : 'デッキにカードが2枚以上必要です' }),
        LEAVE()]);
      if (c === 'vial') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 1); });
        if (!over(g)) await step(g, st, p, 'b', function () { return g.upgradeCards(p, 1, '増強因子：アップグレードするカードを選択').then(function () {}); });
      } else if (c === 'subject') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
        if (!over(g)) await step(g, st, p, 'b', function () { return g.transformCards(p, 2, '増強因子：変化させるカードを2枚選択').then(function () {}); });
      }
    });
  } });

ev('Designer', { name: 'デザイナー イン・スパイア', en: 'Designer In-Spire', act: [2],
  text: '派手な服の男が、しぶしぶサービスの一覧を指さす。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var up = upgradableN(g, p), rm = g.removable(p).length;
      var c = await choose(g, st, p, 'c', [
        opt('adjust', '[仕立て直し] 2ゴールド：カードを1枚アップグレードする。', { gold: 2, dis: up ? null : 'アップグレードできるカードがありません' }),
        opt('clean', '[クリーニング] 3ゴールド：カードを1枚除去する。', { gold: 3, dis: rm ? null : '除去できるカードがありません' }),
        opt('full', '[お任せ] 5ゴールド：カードを1枚除去し、1枚アップグレードする。', { gold: 5, dis: rm ? null : '除去できるカードがありません' }),
        opt('punch', '[殴る] HPを1失う。')]);
      if (c === 'adjust') await step(g, st, p, 'a', function () { pay(g, p, 2); return g.upgradeCards(p, 1, 'デザイナー：アップグレードするカードを選択').then(function () {}); });
      else if (c === 'clean') await step(g, st, p, 'a', function () { pay(g, p, 3); return g.removeCards(p, 1, 'デザイナー：除去するカードを選択').then(function () {}); });
      else if (c === 'full') {
        await step(g, st, p, 'a', function () { pay(g, p, 5); return g.removeCards(p, 1, 'デザイナー：除去するカードを選択').then(function () {}); });
        await step(g, st, p, 'b', function () { return g.upgradeCards(p, 1, 'デザイナー：アップグレードするカードを選択').then(function () {}); });
      } else if (c === 'punch') await step(g, st, p, 'a', function () { return g.loseHpOut(p, 1); });
    });
  } });

ev('WomanInBlue', { name: '青い服の女', en: 'The Woman in Blue', act: [2],
  text: '暗がりから腕が伸び、小さな店に引きこまれた。「ポーションを買え。今すぐ！」',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('buy1', '[ポーションを1個購入] 2ゴールド。', { gold: 2 }),
        opt('buy2', '[ポーションを2個購入] 3ゴールド。', { gold: 3 }),
        opt('leave', '[立ち去る] 1ダメージを受ける。')]);
      if (c === 'buy1' || c === 'buy2') {
        await step(g, st, p, 'a', function () { pay(g, p, c === 'buy1' ? 2 : 3); });
        await step(g, st, p, 'b', function () { return g.offerPotion(p); });
        if (c === 'buy2') await step(g, st, p, 'c', function () { return g.offerPotion(p); });
      } else if (c === 'leave') await step(g, st, p, 'a', function () { return g.loseHpOut(p, 1); });
    });
  } });

ev('Beggar', { name: '年老いた物乞い', en: 'Old Beggar', act: [2],
  text: '毛皮をまとった老人が手を差し出す。「少し恵んでくれないか？」',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('give', '[ゴールドを渡す] 2ゴールド：カードを1枚除去する。', { gold: 2, dis: g.removable(p).length ? null : '除去できるカードがありません' }), LEAVE()]);
      if (c === 'give') await step(g, st, p, 'a', function () { pay(g, p, 2); return g.removeCards(p, 1, '年老いた物乞い：除去するカードを選択').then(function () {}); });
    });
  } });

ev('KnowingSkull', { name: 'しゃれこうべ', en: 'Knowing Skull', act: [2],
  text: '台座の上の頭蓋骨が炎に包まれ「何を求める？」と問う。異なるものを2つまで選べ、それぞれHPを1失う。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var got = {};
      for (var k = 0; k < 2; k++) {
        var c = await choose(g, st, p, 'c' + k, [
          opt('potion', '[景気づけ？] ポーションを1個得る。HPを1失う。', { dis: got.potion ? '選択済み' : null }),
          opt('gold', '[富？] 3ゴールドを得る。HPを1失う。', { dis: got.gold ? '選択済み' : null }),
          opt('card', '[成功？] カード報酬を1回得る。HPを1失う。', { dis: got.card ? '選択済み' : null }),
          opt('leave', '[出口？] 立ち去る。')], k ? '「ほかには？」部屋が熱くなってきた……' : null);
        if (!c || c === 'leave') return;
        got[c] = true;
        await step(g, st, p, 'hp' + k, function () { return g.loseHpOut(p, 1); });
        if (over(g)) return;
        await step(g, st, p, 'r' + k, function () {
          if (c === 'potion') return g.offerPotion(p);
          if (c === 'gold') { g.gainGold(p, 3); return null; }
          return g.cardReward(p, 'normal', 3);
        });
      }
    });
  } });

ev('NoteForYourself', { name: '自分宛てのメモ', en: 'A Note for Yourself', act: [2, 3],
  text: '柱のゆるんだレンガの奥に、折りたたまれたメモとカードが隠されていた。「心臓が待っている」――自分の筆跡だ。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var others = STS.DATA.CHAR_ORDER.filter(function (ch) { return ch !== p.ch; });
      var c = await choose(g, st, p, 'c', others.map(function (ch) { return opt(ch, '[受け取る] ' + STS.DATA.CHARS[ch].name + 'のカード報酬を1回得る。'); }));
      if (c) await step(g, st, p, 'a', function () { return g.cardReward(p, 'normal', 3, { src: g.characterDecks(c), title: '自分宛てのメモ：' + STS.DATA.CHARS[c].name + 'のカード' }); });
    });
  } });

ev('Colosseum', { name: 'コロシアム', en: 'The Colosseum', act: [2], group: true,
  text: '気がつくと、観衆であふれる巨大な闘技場の中央にいた。「観客を温めるか、メインイベントになるか？」',
  run: async function (g, st) {
    var c = await vote(g, st, 'c', [opt('warm', '[準備運動] 通常の遭遇と戦う。'), opt('main', '[メインイベント] エリートと戦う。')]);
    if (c === 'main') await eliteFight(g, st, 'f'); else await standardFight(g, st, 'f');
  } });

ev('Nloth', { name: 'ヌロス', en: "N'loth", act: [2],
  text: '触手の生えた奇妙な生き物が近づいてくる。「ヌロス、腹へった。ヌロスに食わせろ」',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var rel = payableRelics(p);
      var c = await choose(g, st, p, 'c', [
        opt('relic', '[捧げる] ランダムなレリックを1個渡す。レアカード報酬を1回得る。', { dis: rel.length ? null : '通常レリックが必要です' }),
        opt('potion', '[捧げる] ポーションを1個渡す。レアデッキの一番上のカードを得る。', { dis: p.potions.length ? null : 'ポーションが必要です' }),
        LEAVE()]);
      if (c === 'relic') {
        await step(g, st, p, 'a', function () { var list = payableRelics(p); var r = list[g.rand(list.length)]; if (r) { discardRelic(g, p, r.id); g.log(p.name + '：ヌロスに「' + STS.RELICS[r.id].name + '」を渡した'); } });
        await step(g, st, p, 'b', function () { return g.cardReward(p, 'rare', 3); });
      } else if (c === 'potion') {
        var slot = await pickPotion(g, st, p, 'n', 'ヌロスに渡すポーション');
        await step(g, st, p, 'a', function () { if (slot != null) discardPotion(g, p, slot); });
        await step(g, st, p, 'b', async function () { var id = p.rareDeck.pop(); if (id) await g.addCard(p, id, false); return id; });
      }
    });
  } });

ev('WeMeetAgain', { name: 'また会ったな！', en: 'We Meet Again!', act: [2],
  text: '「また会ったな！　いつものを頼むよ」見知らぬ男が親しげに話しかけてくる。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var rel = payableRelics(p);
      var ranwid = p.deck.filter(function (c) { var d = STS.CARDS[c.id]; return (d.r === 'R' || d.r === 'U') && !d.noRemove && d.t !== 'C'; });
      var c = await choose(g, st, p, 'c', [
        opt('gold', '[ゴールドを渡す] 4ゴールドを払う。レリックを1個得る。', { gold: 4 }),
        opt('relic', '[交換する] レリックを1個渡す。レリックを1個得る。', { dis: rel.length ? null : '通常レリックが必要です' }),
        opt('card', '[カードを渡す] レアかアンコモンのカードを1枚除去する。レリックを1個得る。', { dis: ranwid.length ? null : 'レアかアンコモンのカードが必要です' }),
        opt('attack', '[攻撃する] 男は逃げていった。')]);
      if (c === 'gold') await step(g, st, p, 'a', function () { pay(g, p, 4); });
      else if (c === 'relic') {
        var rid = await pickRelic(g, st, p, 'w', '渡すレリックを選択', payableRelics(p));
        await step(g, st, p, 'a', function () { if (rid) discardRelic(g, p, rid); });
      } else if (c === 'card') await step(g, st, p, 'a', async function () {
        var list = p.deck.filter(function (x) { var d = STS.CARDS[x.id]; return (d.r === 'R' || d.r === 'U') && !d.noRemove && d.t !== 'C'; });
        var cs = await g.pickDeck(p, list, 1, 1, 'また会ったな！：渡すカードを選択');
        if (cs[0]) await g.removeCard(p, cs[0]);
      });
      if (c === 'gold' || c === 'relic' || c === 'card') await step(g, st, p, 'b', function () { return gainTopRelic(g, p); });
    });
  } });

ev('Joust', { name: '馬上槍', en: 'The Joust', act: [2],
  text: '長い橋の両端で騎士が向かい合っている。「どちらが勝つか賭けないか？」ダイス4〜6で6ゴールドを得る。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('gold', '[2ゴールドを賭ける] ダイス4〜6：6ゴールドを得る。', { gold: 2 }),
        opt('relic', '[レリックを賭ける] ダイス4〜6：6ゴールドを得る。', { dis: payableRelics(p).length ? null : '通常レリックが必要です' }),
        opt('potion', '[ポーションを賭ける] ダイス4〜6：6ゴールドを得る。', { dis: p.potions.length ? null : 'ポーションが必要です' }),
        LEAVE()]);
      if (!c || c === 'leave') return;
      if (c === 'gold') await step(g, st, p, 'bet', function () { pay(g, p, 2); });
      else if (c === 'relic') {
        var rid = await pickRelic(g, st, p, 'j', '賭けるレリックを選択', payableRelics(p));
        await step(g, st, p, 'bet', function () { if (rid) discardRelic(g, p, rid); });
      } else {
        var slot = await pickPotion(g, st, p, 'j', '賭けるポーションを選択');
        await step(g, st, p, 'bet', function () { if (slot != null) discardPotion(g, p, slot); });
      }
      var die = await roll(g, st, 'p' + p.i, p.name + '：馬上槍（4〜6で勝ち）');
      await step(g, st, p, 'win', function () { if (die >= 4) g.gainGold(p, 6); else g.log(p.name + '：賭けに負けた'); });
    });
  } });

/* Act II, Ascension 3 */
ev('Mausoleum', { name: '霊廟', en: 'The Mausoleum', act: [2], a3: true,
  text: '宝石で飾られた石棺の隙間から、黒い霧が漏れ出している。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [opt('open', '[石棺を開ける] レリックを1個得る。ダイス1〜3：呪いを1枚得る。'), LEAVE()]);
      if (c !== 'open') return;
      await step(g, st, p, 'a', function () { return gainTopRelic(g, p); });
      var die = await roll(g, st, 'p' + p.i, p.name + '：霊廟（1〜3で呪い）');
      if (die <= 3) await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
    });
  } });

ev('ForgottenAltar', { name: '忘れ去られた祭壇', en: 'Forgotten Altar', act: [2], a3: true,
  text: '忘れ去られた神の祭壇。両腕を広げた像が生贄を求めている。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('offer', '[捧げる] ランダムなレリックを1個失う。レリックを1個得る。', { dis: payableRelics(p).length ? null : '通常レリックが必要です' }),
        opt('sacrifice', '[生贄] HPを2失う。'),
        opt('desecrate', '[冒涜する] 呪いを1枚得る。')]);
      if (c === 'offer') {
        await step(g, st, p, 'a', function () { var list = payableRelics(p); var r = list[g.rand(list.length)]; if (r) { discardRelic(g, p, r.id); g.log(p.name + '：祭壇に「' + STS.RELICS[r.id].name + '」を捧げた'); } });
        await step(g, st, p, 'b', function () { return gainTopRelic(g, p); });
      } else if (c === 'sacrifice') await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
      else if (c === 'desecrate') await step(g, st, p, 'a', function () { return g.gainCurse(p).then(function () {}); });
    });
  } });

/* ================================================================== ACT III */
ev('Purifier', { name: '清め', en: 'Purifier', act: [3],
  text: '忘れられた精霊を祀る、手の込んだ祭壇がある。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var curses = p.deck.filter(function (c) { var d = STS.CARDS[c.id]; return d.t === 'C' && !d.noRemove; });
      var c = await choose(g, st, p, 'c', [
        opt('pray', '[祈る] カードを1枚除去する。', { dis: g.removable(p).length ? null : '除去できるカードがありません' }),
        opt('cleanse', '[浄化] デッキの呪いをすべて除去する。', { dis: curses.length ? null : '除去できる呪いがありません' }),
        LEAVE()]);
      if (c === 'pray') await step(g, st, p, 'a', function () { return g.removeCards(p, 1, '清め：除去するカードを選択').then(function () {}); });
      else if (c === 'cleanse') await step(g, st, p, 'a', async function () {
        var list = p.deck.filter(function (x) { var d = STS.CARDS[x.id]; return d.t === 'C' && !d.noRemove; });
        for (var i = 0; i < list.length; i++) await g.removeCard(p, list[i]);
      });
    });
  } });

ev('MindBloom', { name: '精神の開花', en: 'Mind Bloom', act: [3],
  text: '考えたことが現実になっていく……。どうする？',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('war', '[私は闘争者] 第1幕のボスと戦う。レリックを1個得る。'),
        opt('awake', '[私は目覚めた] カードを2枚アップグレードする。HPを3失う。'),
        opt('rich', '[私はお金持ち] 5ゴールドを得る。'),
        opt('healthy', '[私は健康] HPを全回復する。呪いを1枚得る。')]);
      if (c === 'awake') {
        await step(g, st, p, 'a', function () { return g.loseHpOut(p, 3); });
        if (!over(g)) await step(g, st, p, 'b', function () { return g.upgradeCards(p, 2, '精神の開花：アップグレードするカードを2枚選択').then(function () {}); });
      } else if (c === 'rich') await step(g, st, p, 'a', function () { g.gainGold(p, 5); });
      else if (c === 'healthy') {
        await step(g, st, p, 'a', function () { g.heal(p, g.maxHp(p)); });
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      }
    });
    if (over(g)) return;
    // If anyone chose [I am War], the party fights a random Act I boss; those players then gain a relic.
    var war = g.run.players.filter(function (p) { return mem(st)[p.i + ':c'] === 'war'; }).map(function (p) { return p.i; });
    if (!war.length) return;
    var boss = await once(g, st, 'boss', function () { var list = STS.ACTS[1].bosses(g.run.asc); return list[g.rand(list.length)]; });
    var res = await once(g, st, 'fight', function () { return g.fight({ kind: 'boss', boss: boss, eventFight: true }); });
    if (res !== 'victory' || over(g)) return;
    await claim(g, st, 'war', function () { return g.run.players.map(function (p) { return g.makeRewards(p, { relic: war.indexOf(p.i) >= 0 ? 1 : 0 }); }); });
  } });

ev('TombRedMask', { name: '赤仮面王の墓', en: 'Tomb of Lord Red Mask', act: [3],
  text: '豪華な装飾の墓。金貨を入れる投入口がある。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('offer', '[捧げる: ゴールド] ゴールドをすべて失う。レリックを1個得る。'),
        opt('mask', '[赤仮面をかぶる] 6ゴールドを得る。', { dis: g.hasRelic(p, 'RedMask') ? null : '赤仮面が必要です' }),
        LEAVE()]);
      if (c === 'offer') {
        await step(g, st, p, 'a', function () { pay(g, p, p.gold); });
        await step(g, st, p, 'b', function () { return gainTopRelic(g, p); });
      } else if (c === 'mask') await step(g, st, p, 'a', function () { g.gainGold(p, 6); });
    });
  } });

ev('Falling', { name: '落下', en: 'Falling', act: [3],
  text: '足を滑らせて落ちていく！　デッキからランダムに3枚を公開し、そのうち1枚を失う。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var shown = await once(g, st, p.i + ':shown', function () {
        var all = p.deck.slice(); g.shuffle(all);
        return all.slice(0, 3).map(function (c) { return c.u; });
      });
      var cards = shown.map(function (u) { return p.deck.filter(function (c) { return c.u === u; })[0]; }).filter(Boolean);
      var options = cards.map(function (c) {
        var d = STS.CARDS[c.id];
        return opt(String(c.u), '[失う] ' + d.name + (c.up ? '+' : ''), { card: { id: c.id, up: c.up }, dis: d.noRemove ? 'このカードは失えません' : null });
      });
      if (!options.some(function (o) { return !o.dis; })) { await info(g, st, p, 'land', '見事に着地した。'); return; }
      var c = await choose(g, st, p, 'c', options);
      await step(g, st, p, 'a', function () { var x = p.deck.filter(function (y) { return String(y.u) === c; })[0]; if (x) return g.removeCard(p, x); });
    });
  } });

ev('SecretPortal', { name: '秘密のポータル', en: 'Secret Portal', act: [3], group: true,
  text: '生きた壁の中に、渦巻く魔法のポータルがある。次の移動では、現在の階より上の好きな部屋へ移動できる。',
  run: async function (g, st) {
    await vote(g, st, 'c', [opt('enter', '[ポータルに入る] 次の移動で、現在の階より上の好きな部屋へ移動できる。')]);
    await once(g, st, 'portal', function () { g.run.portal = true; });
  } });

ev('WindingHalls', { name: '曲がりくねった空間', en: 'Winding Halls', act: [3],
  text: '道も壁も目の前で形を変え、頭の中でささやき声がする。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('madness', '[狂気に任せる] カード報酬デッキの上から2枚をデッキに加える。'),
        opt('focus', '[集中する] 呪いを1枚得る。HPを3回復する。'),
        opt('retrace', '[道を引き返す] HPを2失う。')]);
      if (c === 'madness') await step(g, st, p, 'a', async function () {
        for (var i = 0; i < 2; i++) { var cs = g.revealCards(p, 'normal', 1); if (cs[0]) await g.addCard(p, cs[0].id, false); }
      });
      else if (c === 'focus') {
        await step(g, st, p, 'a', function () { g.heal(p, 3); });
        await step(g, st, p, 'b', function () { return g.gainCurse(p).then(function () {}); });
      } else if (c === 'retrace') await step(g, st, p, 'a', function () { return g.loseHpOut(p, 2); });
    });
  } });

ev('SensoryStone', { name: '感覚の石', en: 'Sensory Stone', act: [3], colorless: true,
  text: '光る四次元立方体が宙に浮かんでいる。触れると、誰かの記憶が流れこんでくる。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('one', '[思い出す] 無色カード報酬を1回得る。'),
        opt('two', '[思い出す] 無色カード報酬を2回得る。HPを2失う。')]);
      if (c === 'two') { await step(g, st, p, 'hp', function () { return g.loseHpOut(p, 2); }); if (over(g)) return; }
      await step(g, st, p, 'a', function () { return g.cardReward(p, 'colorless', 3); });
      if (c === 'two') await step(g, st, p, 'b', function () { return g.cardReward(p, 'colorless', 3); });
    });
  } });

ev('MoaiHead', { name: 'モアイ', en: 'The Moai Head', act: [3],
  text: '壁から巨大な石の頭が突き出している。大きく開いた口には血の跡がある。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var c = await choose(g, st, p, 'c', [
        opt('offer', '[捧げる] レリックを1個失い、その価格と同じだけのゴールドを得る。', { dis: payableRelics(p).length ? null : '通常レリックが必要です' }),
        opt('jump', '[中に飛び込む] HPを全回復し、その後HPを2失う。')]);
      if (c === 'offer') {
        var rid = await pickRelic(g, st, p, 'm', 'モアイに捧げるレリックを選択', payableRelics(p));
        await step(g, st, p, 'a', function () { if (rid) { discardRelic(g, p, rid); g.gainGold(p, STS.RELICS[rid].price || 0); } });
      } else if (c === 'jump') await step(g, st, p, 'a', function () { g.heal(p, g.maxHp(p)); return g.loseHpOut(p, 2); });
    });
  } });

ev('FaceTrader', { name: 'フェイストレーダー', en: 'Face Trader', act: [3],
  text: '仮面をいくつも抱えた像が、こちらを向いて「顔……交換……？」とささやく。',
  run: async function (g, st) {
    await g.eachPlayer(st, async function (p) {
      var others = g.run.players.filter(function (o) { return o !== p; });
      var options = [opt('trade', '[取引する] レリックを1個得て、その後レリックを1個失う。')];
      if (others.length) options.push(opt('exchange', '[交換する] 自分のレリックを1個ほかのプレイヤーに渡し、そのプレイヤーからレリックを1個受け取る。', { dis: payableRelics(p).length ? null : '通常レリックが必要です' }));
      var c = await choose(g, st, p, 'c', options);
      if (c === 'trade') {
        await step(g, st, p, 'a', function () { return gainTopRelic(g, p); });
        var lose = await pickRelic(g, st, p, 'f', 'フェイストレーダー：失うレリックを選択', payableRelics(p));
        await step(g, st, p, 'b', function () { if (lose) discardRelic(g, p, lose); });
      } else if (c === 'exchange') {
        var give = await pickRelic(g, st, p, 'give', '渡すレリックを選択', payableRelics(p));
        var to = await once(g, st, p.i + ':to', async function () {
          if (others.length === 1) return others[0].i;
          var a = await g.ask(p.i, { type: 'player', title: 'レリックを渡すプレイヤー', options: others.map(function (o) { return o.i; }) });
          return others.some(function (o) { return o.i === a; }) ? a : others[0].i;
        });
        var B = g.P(to);
        await step(g, st, p, 'give', function () { var r = g.loseRelic(p, give); if (r) { B.relics.push(r); g.emit({ t: 'gainRelic', i: B.i, id: r.id }); } });
        var back = await pickRelic(g, st, B, 'back' + p.i, p.name + 'に渡すレリックを選択', payableRelics(B));
        await step(g, st, p, 'back', function () { var r = back && g.loseRelic(B, back); if (r) { p.relics.push(r); g.emit({ t: 'gainRelic', i: p.i, id: r.id }); } });
      }
    });
  } });

/* Act IV below Ascension 11: the elite space is empty. */
ev('EmptyRoom', { name: '空き部屋', en: 'Empty Room', act: [4], run: async function () {} });

STS.EventTools = { once: once, step: step, choose: choose, opt: opt, pay: pay, pickRelic: pickRelic, pickPotion: pickPotion, discardPotion: discardPotion };

/* ================================================================== decks */
function deck(list, a3, asc) { return asc >= 3 ? list.concat(a3) : list.slice(); }
DECKS[1] = function (asc) {
  return deck(['LivingWall', 'Library', 'GoldenIdol', 'GoldenWing', 'Bonfire', 'Transmogrifier', 'Cleric', 'UpgradeShrine', 'Wheel', 'OminousForge', 'Lab', 'BigFish'],
              ['ScrapOoze', 'WorldOfGoop', 'DeadAdventurer', 'Hallway', 'Hallway', 'Merchant'], asc);
};
DECKS[2] = function (asc) {
  return deck(['Wheel', 'GoldenShrine', 'CursedTome', 'AncientWriting', 'Augmenter', 'Designer', 'WomanInBlue', 'Beggar', 'KnowingSkull', 'NoteForYourself', 'Colosseum', 'Nloth', 'WeMeetAgain', 'Joust'],
              ['Mausoleum', 'ForgottenAltar', 'Hallway', 'Hallway', 'Merchant'], asc);
};
DECKS[3] = function (asc, colorless) {
  var base = ['Wheel', 'Bonfire', 'Purifier', 'MindBloom', 'TombRedMask', 'Falling', 'SecretPortal', 'WindingHalls', 'NoteForYourself', 'MoaiHead', 'FaceTrader'];
  if (colorless) base.push('SensoryStone');
  return deck(base, ['Hallway', 'Hallway', 'Merchant'], asc);
};
})(typeof window !== 'undefined' ? window : globalThis);

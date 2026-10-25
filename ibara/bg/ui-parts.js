/* スレイザスパイア — rendering helpers: cards, enemies, items, icons and rule text formatting. No state. */
(function (root) {
'use strict';
var STS = root.STS;
var V = STS.View = {};
var D = STS.DATA;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
V.esc = esc;
V.attr = function (v) { return esc(JSON.stringify(v)); };

/* ------------------------------------------------------------------ assets */
var V_ASSET = '20261025help1';
V.ASSET = V_ASSET;
var HERO = { R: 'knight', G: 'huntress', B: 'doll', W: 'maiden' };
var SELECT = { R: 'ironclad-select', G: 'silent-select', B: 'defect-select', W: 'watcher-select' };
var ORB = { R: 'red', G: 'green', B: 'blue', W: 'purple', C: 'colorless', X: 'colorless' };
V.heroImg = function (ch) { return 'img/heroes/' + HERO[ch] + '.webp'; };
V.selectImg = function (ch) { return 'img/' + SELECT[ch] + '.webp'; };
V.energyImg = function (ch) { return 'img/' + ORB[ch] + '-orb.webp'; };
V.cardImg = function (id) { return 'img/c/' + id + '.webp?v=' + V_ASSET; };
V.relicImg = function (id) { return 'img/r/' + id + '.webp?v=' + V_ASSET; };
V.potionImg = function (id) { return 'img/p/' + id + '.webp?v=' + V_ASSET; };
V.eventImg = function (id) { return V.EVENT_IMG[id] ? 'img/ev/' + V.EVENT_IMG[id] + '.webp?v=' + V_ASSET : null; };
V.EVENT_IMG = {
  LivingWall: 'livingWall', Library: 'library', GoldenIdol: 'goldenIdol', GoldenWing: 'goldenWing', Bonfire: 'bonfire', Transmogrifier: 'shrine1',
  Cleric: 'cleric', UpgradeShrine: 'shrine2', Wheel: 'spinTheWheel', OminousForge: 'blacksmith', Lab: 'lab', BigFish: 'fishing', ScrapOoze: 'scrapOoze',
  WorldOfGoop: 'goopPuddle', GoldenShrine: 'goldShrine', CursedTome: 'cursedTome', AncientWriting: 'backToBasics', Augmenter: 'drugDealer',
  Designer: 'designer2', WomanInBlue: 'ladyInBlue', Beggar: 'beggar', KnowingSkull: 'knowingSkull', NoteForYourself: 'selfNote', Colosseum: 'colosseum',
  Nloth: 'nloth', WeMeetAgain: 'weMeetAgain', Joust: 'joust', Mausoleum: 'mausoleum', ForgottenAltar: 'forgottenAltar', Purifier: 'shrine3',
  MindBloom: 'mindBloom', TombRedMask: 'redMaskTomb', Falling: 'falling', SecretPortal: 'secretPortal', WindingHalls: 'winding',
  SensoryStone: 'sensoryStone', MoaiHead: 'moaiHead', FaceTrader: 'facelessTrader'
};
/* Monster art keys with a rendered sprite in img/enemies; others are drawn by STS.MonsterArt. */
V.ENEMY_IMG = { 'acid-slime-l': 1, 'acid-slime-m': 1, 'acid-slime-s': 1, 'blue-slaver': 1, 'red-slaver': 1, cultist: 1, 'fat-gremlin': 1, 'fungi-beast': 1, 'green-louse': 1,
  'gremlin-leader': 1, 'gremlin-nob': 1, 'gremlin-wizard': 1, hexaghost: 1, 'jaw-worm': 1, lagavulin: 1, looter: 1, 'mad-gremlin': 1, 'red-louse': 1, sentries: 1,
  'slime-boss': 1, 'sneaky-gremlin': 1, 'spike-slime-m': 1, 'spike-slime-s': 1, 'the-guardian': 1,
  donu: 1, deca: 1, 'spheric-guardian': 1, dagger: 1 };
V.OFFICIAL_PORTRAIT = {"chosen": 1, "byrd": 1, "centurion": 1, "mystic": 1, "shelled-parasite": 1, "snake-plant": 1, "snecko": 1, "bronze-orb": 1, "torch-head": 1, "mugger": 1, "book-of-stabbing": 1, "gremlin-leader": 1, "taskmaster": 1, "bronze-automaton": 1, "collector": 1, "champ": 1, "darkling": 1, "exploder": 1, "repulsor": 1, "spiker": 1, "orb-walker": 1, "spire-growth": 1, "transient": 1, "maw": 1, "writhing-mass": 1, "giant-head": 1, "nemesis": 1, "reptomancer": 1, "awakened-one": 1, "time-eater": 1, "spire-shield": 1, "spire-spear": 1, "corrupt-heart": 1};
Object.keys(V.OFFICIAL_PORTRAIT).forEach(function (art) { V.ENEMY_IMG[art] = 1; });
V.enemyArt = function (art, name) {
  if (V.ENEMY_IMG[art]) return '<img class="' + (V.OFFICIAL_PORTRAIT[art] ? 'official-portrait' : '') + '" src="img/enemies/' + art + '.webp?v=' + V_ASSET + '" alt="" draggable="false">';
  return '<svg viewBox="0 0 100 100"><circle cx="50" cy="55" r="36" fill="#3a2a2a" stroke="#a87" stroke-width="3"/><text x="50" y="66" text-anchor="middle" font-size="30" fill="#fdd">' + esc((name || '?').slice(0, 1)) + '</text></svg>';
};

/* ------------------------------------------------------------------ icons */
var ICON = {
  heart: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  gold: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="15" rx="8" ry="4.5" fill="#b07a1e"/><ellipse cx="12" cy="12.5" rx="8" ry="4.5" fill="#f0c04a" stroke="#8a5a10"/><ellipse cx="12" cy="12.5" rx="4" ry="2" fill="none" stroke="#a87012"/></svg>',
  deck: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="6" width="12" height="16" rx="2" fill="#1d1511" stroke="currentColor" stroke-width="2"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>',
  log: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M6 3h9l4 4v14H6z M9 10h7M9 14h7M9 18h5"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path fill="#4a8ad0" stroke="#cfe8ff" stroke-width="1.5" d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/></svg>',
  sword: '<svg viewBox="0 0 24 24"><path fill="#e8e0d0" d="M14.5 2.5L21 2l-.5 6.5-9.3 9.3-3-3z"/><path fill="#8a5a2a" d="M6 13l5 5-2 2-1.5-1.5L4 22l-2-2 3.5-3.5L4 15z"/></svg>'
};
V.icon = function (k) { return ICON[k] || ''; };

/* ------------------------------------------------------------------ text */
// Keywords remain passive inside action cards; the preview has a separate explanation button.
V.kw = function (s) { return STS.Help ? STS.Help.mark(s, false) : esc(s); };
V.TYPE = { A: 'アタック', S: 'スキル', P: 'パワー', C: '呪い', T: '状態異常', X: '' };
V.RARITY = { S: '基本', C: 'コモン', U: 'アンコモン', R: 'レア', X: '' };
V.cardText = function (id, up) {
  var d = STS.CARDS[id];
  if (!d) return '';
  var tx = d.tx || [];
  var t = up ? (tx[1] || tx[0]) : tx[0];
  return t || '';
};
V.cardName = function (c) { var d = STS.CARDS[c.id]; return d ? d.name + (c.up ? '+' : '') : c.id; };

/* A card. c: {u?, id, up}; o: { cost (number|'X'|null for printed), cls, attrs, price, badge } */
V.card = function (c, o) {
  o = o || {};
  var d = STS.CARDS[c.id] || { name: c.id, t: 'X', ch: 'X', c: null };
  var printed = c.up && d.cu !== undefined ? d.cu : d.c;
  var cost = o.cost !== undefined ? o.cost : printed;
  var costCls = '';
  if (o.cost !== undefined && typeof cost === 'number' && typeof printed === 'number') costCls = cost < printed ? ' down' : cost > printed ? ' up' : '';
  var showCost = !(d.unplayable || (d.t === 'C' && d.c == null) || d.t === 'X' || printed == null);
  var html = '<button type="button" class="card ' + (c.up ? 'upg ' : '') + (o.cls || '') + '" ' + (o.attrs || ('data-help="card:' + esc(c.id) + '"')) +
    ' style="background-image:url(' + V.cardImg(c.id) + ');' + esc(o.style || '') + '" aria-label="' + esc(V.cardName(c)) + '">';
  if (showCost) html += '<span class="cost' + costCls + '" style="background-image:url(img/ui/orb-' + ORB[d.ch === 'X' ? 'X' : d.ch] + '.webp)">' + esc(cost == null ? '' : cost) + '</span>';
  html += '<span class="cname">' + esc(V.cardName(c)) + '</span>';
  html += '<span class="ctype">' + esc(V.TYPE[d.t] || '') + '</span>';
  var tx = V.cardText(c.id, c.up), len = tx.length;
  html += '<span class="ctext' + (len > 46 ? ' xlong' : len > 30 ? ' long' : '') + '"><span>' + V.kw(tx).replace(/\n/g, '<br>') + '</span></span>';
  if (o.badge) html += '<span class="badge">' + esc(o.badge) + '</span>';
  if (o.price != null) html += '<span class="price">' + esc(o.price) + 'G</span>';
  return html + '</button>';
};

/* ------------------------------------------------------------------ relics, potions */
V.relicName = function (id) { var r = STS.RELICS[id]; return r ? r.name : id; };
V.relicText = function (id) { var r = STS.RELICS[id]; return r ? r.tx : ''; };
V.potionName = function (id) { var p = STS.POTIONS[id]; return p ? p.name : id; };
V.potionText = function (id) { var p = STS.POTIONS[id]; return p ? p.tx : ''; };
V.relicIcon = function (id) { return '<img src="' + V.relicImg(id) + '" alt="" draggable="false">'; };
V.potionIcon = function (id) { return '<img src="' + V.potionImg(id) + '" alt="" draggable="false">'; };
V.RELIC_KIND = { normal: 'レリック', boss: 'ボスレリック', special: '特別なレリック' };

/* ------------------------------------------------------------------ enemies */
var FN = {
  split: '次のラウンドにアシッドスライムを召喚', flee: '逃走（この列のプレイヤーから2ゴールドを奪う）', enrage: '激怒する', guard: 'ブロックを得る',
  shift: 'モードシフト（ブロックがあれば攻撃）', toAttack: '攻撃モードへ戻る', protect: '同じ列のミスティックにブロック3', support: 'オートマトンにブロック3',
  revive: '倒れたグレムリンを呼び戻す', cleanse: '脱力と弱体化を取り除く', summon: '召喚', die: '自滅する', thorns: 'トゲ+1', fade: '消える',
  check: '（短剣がいなければ召喚へ）', grow: '成長：死の鼓動が強くなり無敵を失う', intangible: 'HPを失わない'
};
V.FN = FN;
V.PASSIVE = {
  RedLouse: '丸まる：初めてダメージを受けた時、ブロック2を得る。', GreenLouse: '丸まる：初めてダメージを受けた時、ブロック2を得る。',
  MadGremlin: '怒り：ヒットを受けるたび筋力1を得る。', FungiBeast: '胞子雲：倒されると、この列のプレイヤーは弱体化1を得る。',
  RedSlaver: 'エリートの手下として出た時は最後に行動する。', Looter: '逃走：この列のプレイヤーから2ゴールドを奪う（報酬は得られる）。', Mugger: '逃走：この列のプレイヤーから2ゴールドを奪う（報酬は得られる）。',
  GremlinNob: '激怒：咆哮の後、スキルを使ったプレイヤーは1ダメージを受ける。',
  Guardian: 'モードシフト：ブロックがない状態でモードシフトを迎えると防御モードへ。鋭い外殻（防御モード）：アタックを使ったプレイヤーは1ダメージを受ける。',
  SlimeBoss: '分裂：倒されると次のラウンド開始時、各列にアシッドスライムL・アシッドスライムM・スパイクスライムMを召喚する。',
  Byrd: '飛行：ヒット1つで受けるダメージは最大1。', Centurion: '同じ列のミスティックが倒されると激怒し、筋力1を得て毎ターン斬撃する。',
  Mystic: '倒されると同じ列のセンチュリオンが激怒する。', Snecko: '混乱：この列のプレイヤーがこのターン最初に使うカードのコストは混乱の値になる。',
  SphericGuardian: 'バリケード：ブロックはターンをまたいで残る。戦闘開始時にブロック10。', BookOfStabbing: '痛む刺し傷：この攻撃でHPを失ったプレイヤーはめまいを1得る。',
  GremlinLeader: '集結：倒れたグレムリンをすべて呼び戻す。', Champ: '怒り：初めてHPが0になるとHP40×人数で立ち上がり、激怒モードになる。',
  Collector: '召喚：各列にトーチヘッドを2体までそろえる。メガデバフは1回だけ。', Darkling: '再生：同じ列のダークリングが生き残っていれば、ラウンド開始時にHP4で復活する。',
  Exploder: '爆発の後、自滅する。', Spiker: 'トゲ：この敵を対象にアタックを使ったプレイヤーはトゲの値のダメージを受ける。',
  Transient: 'この敵がHPを失うと、この列のプレイヤーは同じ量のブロックを得る。4回目の攻撃で消える。',
  WrithingMass: '反応：アタックでダメージを受けるとダイスを振り直す（敵全員の行動が変わる）。', GiantHead: '鈍化：ヒット1つごとに受けるダメージ+1。',
  Nemesis: '大鎌のマスにいるラウンドは、HPを失わない。', Reptomancer: '召喚：各列に蛇の短剣を2体までそろえる。',
  AwakenedOne: '好奇心：対象プレイヤーの場のパワー1枚ごとにヒットのダメージ+1。倒されると次のラウンドに第2形態で目覚める。',
  AwakenedOne2: '虚無：粘液を引いた時、1エナジーを払えるなら廃棄する。', TimeEater: 'タイムワープ：そのラウンドに使えるカードの枚数が制限される。ヘイスト：初めてHPが0になるとHPが回復し筋力1。',
  Heart: '無敵：成長するまでHPは一定以下にならず、脱力を受けない。死の鼓動：プレイヤーのターン終了時、全員がダメージを受ける。',
  SpireShield: '第3・4列にまたがる1体の敵。開始時効果の後、列を移動し、対面効果を受ける。', SpireSpear: '第1・2列にまたがる1体の敵。開始時効果の後、列を移動し、対面していると火傷2を得る。'
};
var FACING = { energy: 'エナジーを1失う', nodraw: 'このターンカードを引けない', zero: 'このターン与えるダメージが0', burn: '火傷を2得る' };
V.FACING = FACING;

/* Text of one enemy action. tgt: the player this enemy hits (for Weak/Vulnerable preview). */
V.actionText = function (e, a, o) {
  o = o || {};
  if (!a) return '—';
  var m = STS.MONSTERS[e.id] || {};
  var parts = [];
  (a.fx || []).forEach(function (fx) {
    var k = fx[0];
    if (k === 'hit' || k === 'ahit') {
      var base = fx[1] + (e.str || 0) + (o.bonus || 0);
      if (e.weak > 0 && !(o.vuln)) base -= 1;
      else if (o.vuln && !(e.weak > 0)) base *= 2;
      if (e.x && e.x.dealZero) base = 0;
      base = Math.max(0, base);
      parts.push('<b>⚔' + base + (fx[2] > 1 ? '×' + fx[2] : '') + '</b>' + (k === 'ahit' && !a.aoe ? '（全体）' : ''));
    } else if (k === 'blk') parts.push('ブロック' + fx[1]);
    else if (k === 'blkPer') parts.push('ブロック' + fx[1] + '×人数');
    else if (k === 'str') parts.push('筋力+' + fx[1]);
    else if (k === 'strAll') parts.push('敵全員 筋力+' + fx[1]);
    else if (k === 'blkAll') parts.push('敵全員 ブロック' + fx[1]);
    else if (k === 'healAll') parts.push('敵全員 HP+' + fx[1]);
    else if (k === 'weak' || k === 'aweak') parts.push('脱力' + (fx[1] || 1) + (k === 'aweak' ? '（全体）' : ''));
    else if (k === 'vuln' || k === 'avuln') parts.push('弱体化' + (fx[1] || 1) + (k === 'avuln' ? '（全体）' : ''));
    else if (k === 'daze' || k === 'adaze') parts.push('めまい' + (fx[1] || 1));
    else if (k === 'burn' || k === 'aburn') parts.push('火傷' + (fx[1] || 1) + (fx[2] === 'shuffle' ? '（山札）' : ''));
    else if (k === 'slime' || k === 'aslime') parts.push('粘液' + (fx[1] || 1) + (fx[2] === 'shuffle' ? '（山札）' : ''));
    else if (k === 'fn') parts.push(FN[fx[1]] || '特殊');
    else if (k === 'none') parts.push('何もしない');
  });
  var s = parts.join('・');
  if (a.aoe) s = '全体：' + s;
  if (a.last) s += '（最後に行動）';
  if (a.intangible) s += '・このラウンドはHPを失わない';
  if (a.warp) s += '・タイムワープ：各プレイヤーはカード' + a.warp + '枚まで';
  if (a.confused != null) s += '・混乱' + a.confused + '（この列で最初に使うカードのコスト）';
  if (a.facing) s = '対面：' + FACING[a.facing] + '／' + s;
  return s;
};
/* Full behaviour table for the enemy details sheet. */
V.behaviour = function (cb, e) {
  var m = STS.MONSTERS[e.id];
  var rows = [], cur = cb ? cb.currentAction(e) : null;
  try {
    if (m.type === 'single') {
      var acts = typeof m.acts === 'function' ? m.acts(cb, e) : m.acts;
      rows.push({ k: '毎ターン', a: acts[0] });
    } else if (m.type === 'die' && !m.action) {
      var ac = typeof m.acts === 'function' ? m.acts(cb, e) : m.acts, beh = e.beh || m.beh || '';
      var ranges = beh.length === 3 ? ['1-2', '3-4', '5-6'] : beh.length === 2 ? ['1-3', '4-6'] : beh.length === 6 ? ['1', '2', '3', '4', '5', '6'] : ['1-6'];
      for (var i = 0; i < beh.length && i < ranges.length; i++) rows.push({ k: 'ダイス' + ranges[i], a: ac[beh[i]] });
    } else if (m.type === 'cube' && m.track) {
      var tr = typeof m.track === 'function' ? m.track(cb, e) : m.track;
      var loop = typeof m.loop === 'function' ? m.loop(cb, e) : (m.loop || 0);
      tr.forEach(function (a, i) { rows.push({ k: (i + 1) + (i === loop && loop > 0 ? '↺' : ''), a: a, cur: i === e.cube }); });
    }
  } catch (err) { /* complex behaviours: show the current action only */ }
  if (!rows.length && cur) rows.push({ k: '現在', a: cur, cur: true });
  return rows.map(function (r) { return { k: r.k, name: r.a ? r.a.name : '—', text: V.actionText(e, r.a), cur: r.cur || (cur && r.a && r.a === cur) }; });
};
/* Reference values are base values. Never call spawn/start hooks or mutate a live combat. */
V.enemyReference = function (id, asc) {
  var m = STS.MONSTERS[id], rows = [], seen = {};
  if (!m) return rows;
  var e = { id: id, cube: 0, mode: m.startMode || 'normal', beh: m.beh || 'sda', row: 0, str: 0, x: { lvl: 'easy' } };
  var cb = { asc: function () { return asc || 0; }, n: function () { return 1; }, s: { die: 1, round: 1 } };
  function add(a, label) {
    if (!a) return;
    var tx = V.actionText(e, a), key = a.name + tx;
    if (seen[key]) return;
    seen[key] = true; rows.push({ k: label, name: a.name, text: tx });
  }
  if (m.action) {
    var modes = id === 'Guardian' ? ['attack', 'defense'] : id === 'Champ' ? ['normal', 'fury'] : [e.mode];
    modes.forEach(function (mode) {
      e.mode = mode;
      for (var round = 1; round <= 2; round++) for (var i = 0; i < 6; i++) {
        e.cube = i; cb.s.die = i + 1; cb.s.round = round;
        add(m.action(cb, e), modes.length > 1 ? (mode === 'attack' ? '攻撃モード' : mode === 'defense' ? '防御モード' : mode === 'fury' ? '激怒後' : '通常') : '状況別');
      }
    });
  } else if (m.track) {
    var tr = typeof m.track === 'function' ? m.track(cb, e) : m.track;
    tr.forEach(function (a, i) { add(a, String(i + 1)); });
  } else {
    var ac = typeof m.acts === 'function' ? m.acts(cb, e) : m.acts;
    Object.keys(ac || {}).forEach(function (k) { add(ac[k], m.type === 'single' ? '毎ターン' : 'ダイス行動'); });
  }
  return rows;
};
})(typeof window !== 'undefined' ? window : globalThis);

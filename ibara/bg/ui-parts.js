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
var V_ASSET = '20261029downfallcomplete1';
V.ASSET = V_ASSET;
var HERO = V.HERO = { R: 'knight', G: 'huntress', B: 'doll', W: 'maiden' };
var SELECT = V.SELECT = { R: 'ironclad-select', G: 'silent-select', B: 'defect-select', W: 'watcher-select' };
var ORB = V.ORB = { R: 'red', G: 'green', B: 'blue', W: 'purple', C: 'colorless', X: 'colorless' };
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
/* Natural pixel sizes of the sprites (rendered at one common scale from the video game) and of the official
   card paintings. Battle sizes are proportional to these, so a small slime stays small and a boss stays large. */
V.ART_SIZE = {"acid-slime-l":[465,191],"acid-slime-m":[229,116],"acid-slime-s":[136,65],"awakened-one":[640,337],"blue-slaver":[339,286],"book-of-stabbing":[521,499],"bronze-automaton":[421,640],"bronze-orb":[532,494],"byrd":[528,348],"centurion":[528,385],"champ":[422,640],"chosen":[528,457],"collector":[443,640],"corrupt-heart":[503,640],"cultist":[359,387],"dagger":[183,183],"darkling":[528,405],"deca":[300,300],"donu":[300,300],"exploder":[532,494],"fat-gremlin":[131,299],"fungi-beast":[344,221],"giant-head":[596,364],"green-louse":[500,299],"gremlin-leader":[521,499],"gremlin-nob":[433,499],"gremlin-wizard":[272,193],"hexaghost":[630,680],"jaw-worm":[360,182],"lagavulin":[422,428],"looter":[231,249],"mad-gremlin":[350,350],"maw":[528,400],"mugger":[532,494],"mystic":[532,494],"nemesis":[513,478],"orb-walker":[532,525],"red-louse":[500,349],"red-slaver":[339,286],"reptomancer":[477,467],"repulsor":[532,494],"sentries":[158,412],"shelled-parasite":[532,525],"slime-boss":[508,394],"snake-plant":[532,525],"sneaky-gremlin":[143,141],"snecko":[528,384],"spheric-guardian":[165,165],"spike-slime-m":[229,119],"spike-slime-s":[136,84],"spiker":[528,395],"spire-growth":[532,525],"spire-shield":[640,528],"spire-spear":[640,568],"taskmaster":[521,499],"the-guardian":[613,510],"time-eater":[640,376],"torch-head":[532,494],"transient":[532,525],"writhing-mass":[528,446],"doll":[305,283],"huntress":[333,300],"knight":[454,324],"maiden":[487,384]};
/* Sprites registered by expansion files loaded before this one (Downfall Bosses): STS.ENEMY_ART[art] = [w, h]. */
Object.keys(STS.ENEMY_ART || {}).forEach(function (art) { V.ENEMY_IMG[art] = 1; V.ART_SIZE[art] = STS.ENEMY_ART[art]; });
var ART_SCALE = { donu: 1.45, deca: 1.45, 'spheric-guardian': 1.45 };
/* Size in "sprite pixels" used by the battle layout. Paintings get a height by rank, keeping their aspect. */
V.artSize = function (art, rank) {
  var sz = V.ART_SIZE[art] || [300, 300];
  if (V.OFFICIAL_PORTRAIT[art]) { var h = rank === 'b' ? 470 : rank === 'e' ? 390 : 310; return [Math.round(h * sz[0] / sz[1]), h]; }
  var k = ART_SCALE[art] || 1;
  return [Math.round(sz[0] * k), Math.round(sz[1] * k)];
};
V.heroArtKey = function (ch) { return HERO[ch]; };
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

/* Card images come in two framings: 332x433 (transparent margins for the banner) and 300x411. The card box is
   the painted card body; .cart places the picture so that both framings line up exactly, and the name, cost and
   effect text sit inside the printed banner, orb and description panel (see cards.css). */
V.CARD_F3 = {};
["Adrenaline", "AllForOne", "AllOutAttack", "Amplify", "Anger", "Apotheosis", "Apparition", "AscendersBane", "BattleTrance", "Berserk", "Blind", "BloodForBlood", "Blur", "BouncingFlask", "Brilliance", "BulletTime", "Burst", "CarveReality", "Choke", "Clash", "Clumsy", "Collect", "Combust", "Concentrate", "Conclude", "ConjureBlade", "CoreSurge", "Corruption", "CrushJoints", "DaggerThrow", "DarkShackles", "Decay", "Defragment", "DeusExMachina", "Disarm", "Distraction", "DodgeAndRoll", "Doppelganger", "DoubleTap", "DramaticEntrance", "Electrodynamics", "Entrench", "Equilibrium", "Evolve", "Expertise", "FTL", "FearNoEvil", "Finesse", "FireBreathing", "FlashOfSteel", "Flechettes", "ForceField", "ForeignInfluence", "Fusion", "GhostlyArmor", "GoodInstincts", "GrandFinale", "HandOfGreed", "Havoc", "Headbutt", "Hologram", "Impatience", "Indignation", "Juggernaut", "Leap", "MachineLearning", "Madness", "Malaise", "MasterOfStrategy", "MasterfulStab", "Mayhem", "Melter", "MindBlast", "Nirvana", "Offering", "Omega", "Outmaneuver", "Pain", "Panacea", "Panache", "PerfectedStrike", "Perseverance", "PiercingWail", "PowerThrough", "Pray", "Purity", "Rage", "Rainbow", "Rampage", "ReachHeaven", "Recursion", "Recycle", "Reflex", "ReinforcedBody", "Reprogram", "RiddleWithHoles", "SadisticNature", "SandsOfTime", "SashWhip", "Scrape", "Scrawl", "SecondWind", "SeeingRed", "Seek", "Sentinel", "Setup", "SeverSoul", "Shame", "Shockwave", "SignatureMove", "SimmeringFury", "Skewer", "Slice", "SneakyStrike", "SpiritShield", "SpotWeakness", "Stack", "StaticDischarge", "SteamBarrier", "Streamline", "Study", "Sunder", "SwiftStrike", "Swivel", "Tactician", "Tempest", "TheBomb", "ThinkingAhead", "ThunderStrike", "Ticket", "Trip", "Unload", "Uppercut", "WellLaidPlans", "WindmillStrike", "WreathOfFlame", "Writhe"].forEach(function (id) { V.CARD_F3[id] = 1; });
/* A card. c: {u?, id, up}; o: { cost (number|'X'|null for printed), cls, attrs, price, badge, style } */
V.card = function (c, o) {
  o = o || {};
  var d = STS.CARDS[c.id] || { name: c.id, t: 'X', ch: 'X', c: null };
  var printed = c.up && d.cu !== undefined ? d.cu : d.c;
  var cost = o.cost !== undefined ? o.cost : printed;
  var costCls = '';
  if (o.cost !== undefined && typeof cost === 'number' && typeof printed === 'number') costCls = cost < printed ? ' down' : cost > printed ? ' up' : '';
  var showCost = !(d.unplayable || (d.t === 'C' && d.c == null) || d.t === 'X' || printed == null);
  var name = V.cardName(c), tx = V.cardText(c.id, c.up);
  var cls = 'card t-' + (d.t || 'X') + (V.CARD_F3[c.id] ? ' f3' : '') + (c.up ? ' upg' : '') + (o.cls ? ' ' + o.cls : '');
  var html = '<button type="button" class="' + cls + '" ' + (o.attrs || ('data-help="card:' + esc(c.id) + '"')) + (o.style ? ' style="' + esc(o.style) + '"' : '') +
    ' aria-label="' + esc(name + (showCost ? '（コスト' + cost + '）' : '') + '【' + (V.TYPE[d.t] || '特殊') + '】' + '：' + tx) + '">';
  html += '<span class="cart" style="background-image:url(' + V.cardImg(c.id) + ')"></span>';
  if (showCost) html += '<span class="cost' + costCls + '" style="background-image:url(img/' + ORB[d.ch === 'X' ? 'X' : d.ch] + '-orb.webp)"><b>' + esc(cost == null ? '' : cost) + '</b></span>';
  html += '<span class="cname"><span>' + esc(name) + '</span></span>';
  html += '<span class="ctype">' + esc(V.TYPE[d.t] || '') + '</span>';
  html += '<span class="ctext"><span>' + V.kw(tx).replace(/\n/g, '<br>') + '</span></span>';
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
/* Read-only intent labels. Damage is per target before Block; never runs effects. */
V.actionRule = function (cb, e) {
  var m = STS.MONSTERS[e.id] || {}, die = cb.s.die || 0;
  if (!die) return '出目の確定待ち';
  if (e.id === 'SentryElite' && cb.asc() === 0) return '出目' + die + ' → ' + (die <= 3 ? '1〜3' : '4〜6') + 'の行動';
  if (m.type === 'single') return '毎回同じ行動';
  if (m.type === 'die') {
    if (m.action) return '出目' + die + 'と状態で決定';
    var beh = e.beh || m.beh || '', n = beh.length, start, end;
    if (n === 3) { start = Math.floor((die - 1) / 2) * 2 + 1; end = start + 1; }
    else if (n === 2) { start = die <= 3 ? 1 : 4; end = start + 2; }
    else if (n === 6) start = end = die;
    else { start = 1; end = 6; }
    return '出目' + die + ' → ' + start + (start === end ? '' : '〜' + end) + 'の行動';
  }
  if (m.type === 'cube') return '行動順' + ((e.cube || 0) + 1) + (m.action ? '・状態で変化' : '（順番に進む）');
  return '状態に応じた行動';
};
V.intentData = function (cb, e, a) {
  var out = { attacks: [], effects: [], conditional: false }, m = STS.MONSTERS[e.id] || {};
  if (!a) return out;
  var strength = e.str || 0, vulnerabilities = {}, sequence = 0;
  cb.pcs().forEach(function (pc) { vulnerabilities[pc.i] = pc.vuln || 0; });
  function targets(all) { return cb.targetsOf(e, !!all || !!a.aoe); }
  function attack(base, times, all, condition) {
    var step = sequence++;
    targets(all).forEach(function (pc) {
      var dmg = base + strength + (m.hitBonus ? m.hitBonus(cb, e, pc) : 0);
      var weak = e.weak > 0, vuln = vulnerabilities[pc.i] > 0;
      if (weak && !vuln) dmg--; else if (vuln && !weak) dmg *= 2;
      if (e.x && e.x.dealZero) dmg = 0;
      dmg = Math.max(0, dmg);
      out.attacks.push({ player: pc.i, damage: dmg, times: times || 1, total: dmg * (times || 1), condition: condition || '', sequence: step });
    });
  }
  (a.fx || []).forEach(function (fx) {
    var k = fx[0], n = fx[1] || 1;
    if (k === 'hit' || k === 'ahit') { attack(fx[1], fx[2], k === 'ahit'); return; }
    if (k === 'blk') out.effects.push({ target: '自身', text: 'ブロック+' + fx[1] });
    else if (k === 'blkPer') out.effects.push({ target: '自身', text: 'ブロック+' + (fx[1] * cb.n()) });
    else if (k === 'str') { out.effects.push({ target: '自身', text: '筋力+' + fx[1] }); strength = Math.min(m.noStrCap ? 99 : 8, Math.max(0, strength + fx[1])); }
    else if (k === 'strAll') { out.effects.push({ target: '敵全員', text: '筋力+' + fx[1] }); strength = Math.min(m.noStrCap ? 99 : 8, Math.max(0, strength + fx[1])); }
    else if (k === 'blkAll') out.effects.push({ target: '敵全員', text: 'ブロック+' + fx[1] });
    else if (k === 'healAll') out.effects.push({ target: '敵全員', text: 'HPを' + fx[1] + '回復' });
    else if (/^(a?weak|a?vuln|a?daze|a?burn|a?slime)$/.test(k)) {
      var kind = k[0] === 'a' ? k.slice(1) : k;
      var ts = targets(k[0] === 'a');
      var text = { weak: '脱力' + n, vuln: '弱体化' + n, daze: 'めまい' + n + '枚→山札の上', burn: '火傷' + n + '枚→' + (fx[2] === 'shuffle' ? '山札' : '捨て札'), slime: '粘液' + n + '枚→' + (fx[2] === 'shuffle' ? '山札' : '捨て札') }[kind];
      out.effects.push({ players: ts.map(function (pc) { return pc.i; }), text: text });
      if (kind === 'vuln') ts.forEach(function (pc) { vulnerabilities[pc.i] = Math.min(8, vulnerabilities[pc.i] + n); });
    } else if (k === 'fn') {
      if (e.id === 'Guardian' && fx[1] === 'shift') {
        out.conditional = true;
        if (e.blk > 0) attack(cb.asc() >= 10 ? 7 : 6, 1, true, 'ブロックが残れば');
        else out.effects.push({ target: '自身', text: '今のブロック0なら攻撃せず防御モードへ' });
      } else if (e.id === 'Guardian' && fx[1] === 'guard') out.effects.push({ target: '自身', text: 'ブロック+' + ((cb.asc() >= 10 ? 6 : 5) * cb.n()) });
      else if (m.intentFn && m.intentFn(cb, e, fx, attack, out)) { /* described by the monster (Downfall Bosses) */ }
      else out.effects.push({ target: '', text: FN[fx[1]] || '特殊効果（敵の詳細で確認）' });
    } else if (k === 'none') out.effects.push({ target: '', text: '何もしない' });
  });
  return out;
};
V.intentHTML = function (cb, e, a, run, me) {
  var data = V.intentData(cb, e, a), groups = {}, lines = [];
  var alive = cb.pcs().filter(function (p) { return !p.dead; }).length;
  function names(ids) { return ids.length === alive && alive > 1 ? '全員' : ids.map(function (i) { return i === me ? 'あなた' : (run.players[i] || {}).name || ('第' + (i + 1) + '列'); }).join('・'); }
  data.attacks.forEach(function (x) { var key = [x.sequence, x.damage, x.times, x.condition].join(':'); if (!groups[key]) { groups[key] = { ids: [], x: x }; lines.push(groups[key]); } groups[key].ids.push(x.player); });
  var h = lines.map(function (g) { var x = g.x; return '<div class="intent-hit"><span>' + esc(names(g.ids)) + 'へ' + (x.condition ? '（' + esc(x.condition) + '）' : '') + '</span><b>' + x.damage + 'ダメージ' + (x.times > 1 ? ' × ' + x.times + '回<small>合計' + x.total + '</small>' : '') + '</b></div>'; }).join('');
  if (!lines.length) h += '<div class="intent-nohit">' + (!a ? '行動の確定待ち' : '攻撃なし') + '</div>';
  data.effects.forEach(function (x) { var who = x.players ? names(x.players) + 'へ' : x.target ? x.target + '：' : ''; h += '<div class="intent-effect">' + esc(who + x.text) + '</div>'; });
  if (a && a.last) h += '<div class="intent-effect">ほかの通常の敵より後に行動</div>';
  return h;
};

/* ------------------------------------------------------------------ intent bubble (battlefield) */
var II = {
  atk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 2.2l1.2 1.2-10.4 11.7-2.3-2.3z" fill="#f4efe6" stroke="#2a0d07" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.2 12.4l6.4 6.4-1.5 1.5-1.6-1.6-3.8 3.8-2.4-2.4 3.8-3.8-1.6-1.6z" fill="#d79a3c" stroke="#2a0d07" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  def: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l8 3v6.2c0 5-3.4 8.8-8 10.4-4.6-1.6-8-5.4-8-10.4V5.2z" fill="#3f8fd8" stroke="#0b1d33" stroke-width="1.2"/><path d="M12 5l5 1.9v4.5c0 3.3-2.1 5.9-5 7.2z" fill="#9fd4ff" opacity=".55"/></svg>',
  buff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7.5 8.5h-4.6v10.5H9.1V11H4.5z" fill="#ff7a3c" stroke="#3a0e04" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  debuff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5l-7.5-8.5h4.6V2.5h5.8V13h4.6z" fill="#b072e8" stroke="#1d0a33" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  special: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2.6 7.6 7.6 2.6-7.6 2.6-2.6 7.6-2.6-7.6L1.8 12l7.6-2.6z" fill="#f2c45a" stroke="#3a2a06" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  none: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z" fill="#a9b8cf" stroke="#18202c" stroke-width="1.1"/></svg>'
};
V.INTENT_ICON = II;
function intentKinds(a, data) {
  var k = [];
  if (!a) return ['none'];
  if (data.attacks.length) k.push('atk');
  (a.fx || []).forEach(function (fx) {
    var t = fx[0];
    if (/^(blk|blkPer|blkAll)$/.test(t) && k.indexOf('def') < 0) k.push('def');
    else if (/^(str|strAll|healAll)$/.test(t) && k.indexOf('buff') < 0) k.push('buff');
    else if (/^a?(weak|vuln|daze|burn|slime)$/.test(t) && k.indexOf('debuff') < 0) k.push('debuff');
    else if (t === 'fn') {
      var f = FN_KIND[fx[1]] || 'special';
      if (fx[1] === 'shift' && data.attacks.length) return;
      if (k.indexOf(f) < 0) k.push(f);
    }
  });
  if (!k.length) k.push('none');
  return k.slice(0, 2);
}
var FN_KIND = V.FN_KIND = { guard: 'def', protect: 'def', support: 'def', intangible: 'def', shift: 'def', enrage: 'buff', grow: 'buff', thorns: 'buff', cleanse: 'buff' };
var KIND_LABEL = { atk: '攻撃', def: '防御', buff: '強化', debuff: '弱体', special: '特殊', none: '何もしない' };
/* Compact, icon-led forecast shown above each enemy. Text (targets, totals, die rule) mirrors intentHTML. */
V.intentBubble = function (cb, e, a, run, me) {
  var data = V.intentData(cb, e, a), kinds = intentKinds(a, data);
  var alive = cb.pcs().filter(function (p) { return !p.dead; }).length;
  function who(i) { return i === me ? 'あなた' : (run.players[i] || {}).name || ('第' + (i + 1) + '列'); }
  var h = '<div class="ib-main">' + kinds.map(function (k) { return '<span class="ib-ic k-' + k + '">' + II[k] + '</span>'; }).join('');
  var groups = [], byKey = {};
  data.attacks.forEach(function (x) { var key = [x.sequence, x.damage, x.times, x.condition].join(':'); if (!byKey[key]) { byKey[key] = { ids: [], x: x }; groups.push(byKey[key]); } byKey[key].ids.push(x.player); });
  var mineG = groups.filter(function (g) { return g.ids.indexOf(me) >= 0; });
  var lead = mineG[0] || groups[0];
  if (lead) h += '<b class="ib-n">' + lead.x.damage + '</b>' + (lead.x.times > 1 ? '<small class="ib-x">×' + lead.x.times + '</small>' : '');
  else h += '<b class="ib-w">' + '攻撃なし' + '</b>';
  h += '</div>';
  if (groups.length) {
    h += '<div class="ib-tgt">' + groups.map(function (g) {
      var names = g.ids.length === alive && alive > 1 ? '全員' : g.ids.map(who).join('・');
      return '<span>' + esc(names) + 'へ' + (g.x.condition ? '（' + esc(g.x.condition) + '）' : '') + (groups.length > 1 ? ' ' + g.x.damage + (g.x.times > 1 ? '×' + g.x.times : '') : '') + (g.x.times > 1 ? '<em>合計' + g.x.total + '</em>' : '') + '</span>';
    }).join('') + '</div>';
  }
  h += '<span class="an">' + esc(a ? a.name : '行動の確定待ち') + '</span>';
  var fx = data.effects.filter(function (x) { return x.text !== '何もしない'; }).map(function (x) { var w = x.players ? (x.players.length === alive && alive > 1 ? '全員' : x.players.map(who).join('・')) + '：' : x.target ? x.target + '：' : ''; return esc(w + x.text); });
  if (a && a.last) fx.push('ほかの敵より後に行動');
  if (fx.length) h += '<div class="ib-fx">' + fx.join('<br>') + '</div>';
  var rule = V.actionRule(cb, e);
  h += '<span class="intent-rule">' + esc(rule) + '</span>';
  // Plain text of the small lines, so the battlefield layout can reserve the bubble's height.
  var texts = groups.map(function (g) { return (g.ids.length === alive && alive > 1 ? '全員' : g.ids.map(who).join('・')) + 'へ' + (g.x.condition || '') + (g.x.times > 1 ? ' 合計' + g.x.total : '') + (groups.length > 1 ? ' 00' : ''); });
  texts.push(a ? a.name : '行動の確定待ち');
  fx.forEach(function (x) { String(x).split('<br>').forEach(function (t) { texts.push(t.replace(/<[^>]*>/g, '')); }); });
  texts.push(rule);
  // Compact form for crowded party rows: icon, number and one line (action → targets); details on tap.
  var mainEnd = h.indexOf('</div>') + 6;
  var tg = groups.map(function (g) { return (g.ids.length === alive && alive > 1 ? '全員' : g.ids.map(who).join('・')) + (groups.length > 1 ? g.x.damage : ''); }).join('／');
  var fxShort = fx.length ? '・' + fx.join('・').replace(/<br>/g, '・') : '';
  var compact = h.slice(0, mainEnd) + '<span class="ib-sub">' + esc(a ? a.name : '確定待ち') + (tg ? ' → ' + esc(tg) : '') + fxShort + '</span>';
  return { html: h, compact: compact, kinds: kinds, attack: !!groups.length, aoe: !!(a && a.aoe) || (groups.length && groups.some(function (g) { return g.ids.length > 1; })), texts: texts };
};

/* Full behaviour table for the enemy details sheet. */
V.behaviour = function (cb, e) {
  var m = STS.MONSTERS[e.id];
  var rows = [], cur = cb ? cb.currentAction(e) : null;
  try {
    if (m.type === 'single') {
      var acts = typeof m.acts === 'function' ? m.acts(cb, e) : m.acts;
      rows.push({ k: '毎ターン', a: acts[0], cur: true });
    } else if (m.type === 'die' && !m.action) {
      var ac = typeof m.acts === 'function' ? m.acts(cb, e) : m.acts, beh = e.beh || m.beh || '';
      var ranges = beh.length === 3 ? ['1-2', '3-4', '5-6'] : beh.length === 2 ? ['1-3', '4-6'] : beh.length === 6 ? ['1', '2', '3', '4', '5', '6'] : ['1-6'];
      for (var i = 0; i < beh.length && i < ranges.length; i++) rows.push({ k: 'ダイス' + ranges[i], a: ac[beh[i]], cur: i === (beh.length === 3 ? Math.floor(((cb.s.die || 1) - 1) / 2) : beh.length === 2 ? ((cb.s.die || 1) <= 3 ? 0 : 1) : beh.length === 6 ? (cb.s.die || 1) - 1 : 0) });
    } else if (m.type === 'cube' && m.track) {
      var tr = typeof m.track === 'function' ? m.track(cb, e) : m.track;
      var loop = typeof m.loop === 'function' ? m.loop(cb, e) : (m.loop || 0);
      tr.forEach(function (a, i) { rows.push({ k: (i + 1) + (i === loop && loop > 0 ? '↺' : ''), a: a, cur: i === e.cube }); });
    }
  } catch (err) { /* complex behaviours: show the current action only */ }
  if (!rows.length && cur) rows.push({ k: '現在', a: cur, cur: true });
  return rows.map(function (r) { return { k: r.k, name: r.a ? r.a.name : '—', text: V.actionText(e, r.a), cur: !!r.cur }; });
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
    var modes = m.modes ? m.modes.slice() : id === 'Guardian' ? ['attack', 'defense'] : id === 'Champ' ? ['normal', 'fury'] : [e.mode];
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

/* ハタトリ・ナイン — rules engine (pure, no DOM). Loaded as a plain script (window.HTN_ENG) and by node tests.
   The rules follow the card game Battle Line (Reiner Knizia): nine flags in a line, three-card formations on
   each side, 60 troop cards (six colors x 1-10) and 10 tactics cards.

   Cards are integers.
     0-59  troops: color = floor(id / 10) (0-5), value = id % 10 + 1
     60,61 leader (any color, any value; a player may only ever play one of the two)
     62    companion cavalry (any color, value 8)
     63    shield bearers (any color, value 1-3)
     64    fog  (this flag: formations do not count, only the total)
     65    mud  (this flag: four cards per side)
     66    scout, 67 redeploy, 68 deserter, 69 traitor

   A turn: one main action (place a card / play a tactic / pass when no troop card can be placed),
   then one draw (troop deck "T" or tactics deck "X"). Flags are claimed in one of two ways:
     claims: 'auto'   every flag the player can claim is claimed right after the main action;
     claims: 'manual' (the rule of the card game) the player declares each claim ({t: 'claim', f}) at any time
                      in their turn before drawing; a claim that cannot be proved is refused. When there is
                      nothing to draw, the turn ends with {t: 'end'} (phase 'claim').
   Strength of a finished side is one integer: rank * 100 + total (rank 4 wedge ... 0 host); under fog just the total. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HTN_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NCOL = 6, NFLAG = 9, HAND = 7;
  var LEADER_A = 60, LEADER_B = 61, CAV = 62, SHIELD = 63, FOG = 64, MUD = 65, SCOUT = 66, REDEPLOY = 67, DESERTER = 68, TRAITOR = 69;

  var COLOR_NAME = ['あか', 'オレンジ', 'きいろ', 'みどり', 'あお', 'むらさき'];
  var RANK_NAME = ['寄せ集め', '散兵', '大隊', '密集', '楔形'];
  var RANK_HINT = ['そのほか（合計で勝負）', '数字の連番', '同じ色', '同じ数字', '同じ色の連番'];
  var TAC_NAME = { 60: '指揮官', 61: '指揮官', 62: '近衛騎兵', 63: '盾兵', 64: '霧', 65: '泥沼', 66: '偵察', 67: '再配置', 68: '脱走', 69: '寝返り' };
  var TAC_TEXT = {
    60: '好きな色・好きな数字（1〜10）になる。指揮官は1人1枚しか出せない。',
    61: '好きな色・好きな数字（1〜10）になる。指揮官は1人1枚しか出せない。',
    62: '好きな色の「8」になる。',
    63: '好きな色の「1〜3」のどれかになる。',
    64: 'この旗では役が消え、カードの合計だけで勝負する。',
    65: 'この旗は3枚ではなく4枚ずつで勝負する。',
    66: '山札から3枚引き、手札から2枚を山札の上に戻す。',
    67: '自分のカード1枚（旗を確保していない列）を別の旗へ動かすか、捨てる。',
    68: '相手のカード1枚（旗を確保していない列）を捨てさせる。',
    69: '相手の兵カード1枚（旗を確保していない列）を自分の側へ寝返らせる。'
  };

  function isTroop(c) { return c >= 0 && c < 60; }
  function isTactic(c) { return c >= 60 && c < 70; }
  function colorOf(c) { return (c / 10) | 0; }
  function valueOf(c) { return c % 10 + 1; }
  function isMorale(c) { return c >= 60 && c <= 63; }
  function isLeader(c) { return c === LEADER_A || c === LEADER_B; }
  function isEnv(c) { return c === FOG || c === MUD; }
  function isGuile(c) { return c >= 66 && c <= 69; }
  function cardName(c) { return isTroop(c) ? COLOR_NAME[colorOf(c)] + 'の' + valueOf(c) : TAC_NAME[c]; }

  /* ------------------------------------------------------------------ random */
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function range(a, b) { var r = []; for (var i = a; i < b; i++) r.push(i); return r; }
  function randomSeed() { return (Math.random() * 4294967296) >>> 0; }

  /* ================================================================== formations
     bestStrength(cards, cap, fog, avail): the strongest side these cards can become.
       cards  ids already on the side (troops and morale wilds)
       cap    cards needed (3, or 4 with mud)
       fog    true: only the total counts
       avail  Uint8Array(60) of troop cards that may still be added (null when the side is full)
     Returns rank*100 + total, or -1 if the side cannot be completed from avail.            */
  var _tv = new Int8Array(8), _tc = new Int8Array(8);
  var _byVal = new Int8Array(11);   // available troops per value
  var _colBits = new Int32Array(NCOL); // bit v set: troop (color, v) available
  function summarize(avail) {
    var n = 0;
    for (var v = 0; v <= 10; v++) _byVal[v] = 0;
    for (var c = 0; c < NCOL; c++) _colBits[c] = 0;
    for (var id = 0; id < 60; id++) if (avail[id]) { var vv = id % 10 + 1, cc = (id / 10) | 0; _byVal[vv]++; _colBits[cc] |= 1 << vv; n++; }
    return n;
  }
  function topAny(m) { // sum of the m highest available values (any color); -1 if fewer than m
    var s = 0, need = m;
    for (var v = 10; v >= 1 && need > 0; v--) { var k = Math.min(_byVal[v], need); s += k * v; need -= k; }
    return need > 0 ? -1 : s;
  }
  function topColor(col, m) {
    var s = 0, need = m, bits = _colBits[col];
    for (var v = 10; v >= 1 && need > 0; v--) if (bits & (1 << v)) { s += v; need--; }
    return need > 0 ? -1 : s;
  }
  /* Can the wilds (nC cavalry -> 8, nS shield -> 1..3, nL leaders -> anything) take free values so that every
     value they leave uncovered is available (okBits)? free/okBits are value bitmasks.
     Returns the values left for the pool to fill, or -1. */
  function wildsFit(free, okBits, nL, nC, nS) {
    var missing = free & ~okBits, k, pick;
    for (k = 0; k < nC; k++) { if (!(free & 256)) return -1; free &= ~256; missing &= ~256; }
    for (k = 0; k < nS; k++) {      // shield bearers: 1-3; cover a value the pool lacks if there is one
      var low = free & 0xE;
      if (!low) return -1;
      var lm = low & missing;
      pick = lm ? lm & -lm : low & -low;
      free &= ~pick; missing &= ~pick;
    }
    for (k = 0; k < nL; k++) {      // leader: anything
      if (!free) return -1;
      pick = missing ? missing & -missing : free & -free;
      free &= ~pick; missing &= ~pick;
    }
    return missing === 0 ? free : -1;
  }
  /* the cards behind a result (only when the caller passes a picks array) */
  function pickAny(avail, m, picks) {
    for (var v = 10; v >= 1 && m > 0; v--) for (var c = 0; c < NCOL && m > 0; c++) if (avail[c * 10 + v - 1]) { picks.push(c * 10 + v - 1); m--; }
  }
  function pickColor(avail, col, m, picks) {
    for (var v = 10; v >= 1 && m > 0; v--) if (avail[col * 10 + v - 1]) { picks.push(col * 10 + v - 1); m--; }
  }
  function pickValues(avail, bits, col, picks) {   // one card for every value in bits (col = -1: any color)
    for (var v = 1; v <= 10; v++) {
      if (!(bits & (1 << v))) continue;
      if (col >= 0) { picks.push(col * 10 + v - 1); continue; }
      for (var c = 0; c < NCOL; c++) if (avail[c * 10 + v - 1]) { picks.push(c * 10 + v - 1); break; }
    }
  }
  function pickValue(avail, v, m, picks) { for (var c = 0; c < NCOL && m > 0; c++) if (avail[c * 10 + v - 1]) { picks.push(c * 10 + v - 1); m--; } }
  function bestStrength(cards, cap, fog, avail, picks) {
    var n = cards.length, m = cap - n, nt = 0, nL = 0, nC = 0, nS = 0, sumT = 0, colorMask = 0, valMask = 0, dup = false, i;
    if (m < 0) m = 0;
    for (i = 0; i < n; i++) {
      var c = cards[i];
      if (c < 60) {
        var v = c % 10 + 1, col = (c / 10) | 0;
        _tv[nt] = v; _tc[nt] = col; nt++; sumT += v; colorMask |= 1 << col;
        if (valMask & (1 << v)) dup = true; valMask |= 1 << v;
      } else if (c === CAV) nC++; else if (c === SHIELD) nS++; else nL++;
    }
    var wildMax = nL * 10 + nC * 8 + nS * 3;
    if (m > 0) { if (!avail) return -1; if (summarize(avail) < m) return -1; }
    var host = sumT + wildMax + (m > 0 ? topAny(m) : 0);
    if (fog) { if (picks && m > 0) pickAny(avail, m, picks); return host; }
    var st, full, free, ok, best, rem, bestCol = -1, bestRem = 0;
    // wedge: one color, consecutive values
    best = -1;
    if (!dup && (nt === 0 || (colorMask & (colorMask - 1)) === 0)) {
      for (var col2 = 0; col2 < NCOL; col2++) {
        if (nt && colorMask !== (1 << col2)) continue;
        ok = m > 0 ? _colBits[col2] : 0;
        for (st = 11 - cap; st >= 1; st--) {
          if (st * cap + cap * (cap - 1) / 2 <= best) break;
          full = ((1 << cap) - 1) << st;
          if (valMask & ~full) continue;
          free = full & ~valMask;
          rem = wildsFit(free, ok, nL, nC, nS);
          if (rem >= 0) { best = st * cap + cap * (cap - 1) / 2; bestCol = col2; bestRem = rem; break; }
        }
      }
      if (best >= 0) { if (picks) pickValues(avail, bestRem, bestCol, picks); return 400 + best; }
    }
    // phalanx: one value
    if (nt === 0 || (valMask & (valMask - 1)) === 0) {
      for (var v2 = 10; v2 >= 1; v2--) {
        if (nt && valMask !== (1 << v2)) continue;
        if (nC && v2 !== 8) continue;
        if (nS && v2 > 3) continue;
        if (m > 0 && _byVal[v2] < m) continue;
        if (picks && m > 0) pickValue(avail, v2, m, picks);
        return 300 + cap * v2;
      }
    }
    // battalion: one color
    if (nt === 0 || (colorMask & (colorMask - 1)) === 0) {
      for (var col3 = 0; col3 < NCOL; col3++) {
        if (nt && colorMask !== (1 << col3)) continue;
        var t3 = m > 0 ? topColor(col3, m) : 0;
        if (t3 < 0) continue;
        var s3 = sumT + wildMax + t3;
        if (s3 > best) { best = s3; bestCol = col3; }
      }
      if (best >= 0) { if (picks && m > 0) pickColor(avail, bestCol, m, picks); return 200 + best; }
    }
    // skirmish line: consecutive values
    if (!dup) {
      var okAny = 0;
      if (m > 0) for (var v4 = 1; v4 <= 10; v4++) if (_byVal[v4]) okAny |= 1 << v4;
      for (st = 11 - cap; st >= 1; st--) {
        full = ((1 << cap) - 1) << st;
        if (valMask & ~full) continue;
        free = full & ~valMask;
        rem = wildsFit(free, okAny, nL, nC, nS);
        if (rem >= 0) { if (picks) pickValues(avail, rem, -1, picks); return 100 + st * cap + cap * (cap - 1) / 2; }
      }
    }
    if (picks && m > 0) pickAny(avail, m, picks);
    return host;
  }
  function rankOf(strength, fog) { return fog || strength < 0 ? 0 : Math.floor(strength / 100); }
  function sumOf(strength) { return strength < 0 ? 0 : strength % 100; }

  /* strength of a concrete formation: cs colors, vs values */
  function concreteStrength(cs, vs, fog) {
    var n = vs.length, sum = 0, i;
    for (i = 0; i < n; i++) sum += vs[i];
    if (fog) return sum;
    var sameC = true, sameV = true;
    for (i = 1; i < n; i++) { if (cs[i] !== cs[0]) sameC = false; if (vs[i] !== vs[0]) sameV = false; }
    var sorted = vs.slice().sort(function (a, b) { return a - b; }), run = true;
    for (i = 1; i < n; i++) if (sorted[i] !== sorted[i - 1] + 1) run = false;
    if (sameC && run) return 400 + sum;
    if (sameV) return 300 + sum;
    if (sameC) return 200 + sum;
    if (run) return 100 + sum;
    return sum;
  }
  function wildOptions(c) {
    var o = [], col, v;
    for (col = 0; col < NCOL; col++) {
      if (c === CAV) o.push([col, 8]);
      else if (c === SHIELD) { for (v = 1; v <= 3; v++) o.push([col, v]); }
      else for (v = 1; v <= 10; v++) o.push([col, v]);
    }
    return o;
  }
  /* For a full side: what each wild became (best assignment), the strength, and a label. */
  function explain(cards, fog) {
    var cs = [], vs = [], wild = [];
    cards.forEach(function (c) { if (c < 60) { cs.push(colorOf(c)); vs.push(valueOf(c)); } else wild.push(c); });
    var best = -1, bestPick = [];
    (function rec(k, pick) {
      if (k === wild.length) {
        var c2 = cs.slice(), v2 = vs.slice();
        pick.forEach(function (p) { c2.push(p[0]); v2.push(p[1]); });
        var s = concreteStrength(c2, v2, fog);
        if (s > best) { best = s; bestPick = pick.slice(); }
        return;
      }
      wildOptions(wild[k]).forEach(function (o) { pick.push(o); rec(k + 1, pick); pick.pop(); });
    })(0, []);
    return {
      strength: best, rank: rankOf(best, fog), sum: sumOf(best), fog: !!fog,
      wilds: wild.map(function (c, i) { return { c: c, color: bestPick[i][0], value: bestPick[i][1] }; })
    };
  }
  function strengthLabel(strength, fog) {
    if (strength < 0) return '完成しない';
    if (fog) return '合計' + strength;
    return RANK_NAME[rankOf(strength)] + ' ' + sumOf(strength);
  }

  /* ================================================================== game state */
  function newFlag() { return { side: [[], []], fog: -1, mud: -1, claimed: -1, claim: null }; }
  function newGame(opt) {
    opt = opt || {};
    var seed = opt.seed == null ? randomSeed() : opt.seed >>> 0;
    var rng = mulberry32(seed);
    var tactics = opt.tactics !== false;
    var s = {
      v: 1, tactics: tactics, seed: seed,
      first: opt.first === 1 ? 1 : 0, turn: opt.first === 1 ? 1 : 0, phase: 'play',
      clock: 0, ply: 0, passes: 0,
      deck: { T: shuffle(range(0, 60), rng), X: tactics ? shuffle(range(60, 70), rng) : [] },
      hands: [[], []],
      flags: [], discard: [[], []],
      tac: [0, 0], leader: [false, false],
      scout: null, winner: -1, win: null, last: null,
      claims: opt.claims === 'manual' ? 'manual' : 'auto'
    };
    for (var f = 0; f < NFLAG; f++) s.flags.push(newFlag());
    for (var k = 0; k < HAND; k++) { s.hands[0].push(s.deck.T.pop()); s.hands[1].push(s.deck.T.pop()); }
    return s;
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  function capOf(fl) { return fl.mud >= 0 ? 4 : 3; }
  function ids(side) { var r = []; for (var i = 0; i < side.length; i++) r.push(side[i].c); return r; }
  function doneAt(side, cap) {
    if (side.length < cap) return Infinity;
    var t = -1; for (var i = 0; i < side.length; i++) if (side[i].t > t) t = side[i].t;
    return t;
  }
  function sideStrength(fl, p) { var cap = capOf(fl); return fl.side[p].length >= cap ? bestStrength(ids(fl.side[p]), cap, fl.fog >= 0, null) : -1; }

  /* troops a claimant may NOT count on being gone: everything that is not face up on the table or in a discard pile */
  function unseenMask(s) {
    var a = new Uint8Array(60), i;
    for (i = 0; i < 60; i++) a[i] = 1;
    s.flags.forEach(function (fl) { for (var p = 0; p < 2; p++) fl.side[p].forEach(function (e) { if (e.c < 60) a[e.c] = 0; }); });
    for (var p2 = 0; p2 < 2; p2++) s.discard[p2].forEach(function (c) { if (c < 60) a[c] = 0; });
    return a;
  }

  /* Can player p claim flag f right now? Returns {how, ms, ts} or null. */
  function claimCheck(s, f, p, unseen) {
    var fl = s.flags[f];
    if (fl.claimed !== -1) return null;
    var cap = capOf(fl), fog = fl.fog >= 0, mine = fl.side[p], theirs = fl.side[1 - p];
    if (mine.length < cap) return null;
    var ms = bestStrength(ids(mine), cap, fog, null);
    if (theirs.length >= cap) {
      var ts = bestStrength(ids(theirs), cap, fog, null);
      if (ms > ts || (ms === ts && doneAt(mine, cap) < doneAt(theirs, cap))) return { how: ms === ts ? 'tie' : 'direct', ms: ms, ts: ts };
      return null;
    }
    var best = bestStrength(ids(theirs), cap, fog, unseen || unseenMask(s));
    if (best <= ms) return { how: 'proof', ms: ms, ts: best };   // equal: they would finish last, so they lose the tie
    return null;
  }

  function claimedBy(s, p) { var n = 0; s.flags.forEach(function (fl) { if (fl.claimed === p) n++; }); return n; }
  function breakthrough(s, p) {
    for (var f = 0; f + 2 < NFLAG; f++) if (s.flags[f].claimed === p && s.flags[f + 1].claimed === p && s.flags[f + 2].claimed === p) return true;
    return false;
  }
  function victory(s, p) {
    if (breakthrough(s, p)) return 'breakthrough';
    if (claimedBy(s, p) >= 5) return 'envelopment';
    return null;
  }

  /* ------------------------------------------------------------------ queries used by the UI and the CPU */
  function openFlags(s, p) {   // unclaimed flags where p still has room
    var r = [];
    s.flags.forEach(function (fl, f) { if (fl.claimed === -1 && fl.side[p].length < capOf(fl)) r.push(f); });
    return r;
  }
  function canPlayTroop(s, p) {
    if (!openFlags(s, p).length) return false;
    return s.hands[p].some(function (c) { return c < 60; });
  }
  function tacticAllowed(s, p) { return s.tactics && s.tac[p] <= s.tac[1 - p]; }
  /* where a card from the table is: {f, p, i} for a slot, {f, env:'fog'|'mud', p} for weather */
  function locate(s, x) {
    for (var f = 0; f < NFLAG; f++) {
      var fl = s.flags[f];
      if (x === FOG && fl.fog >= 0) return { f: f, env: 'fog', p: fl.fog };
      if (x === MUD && fl.mud >= 0) return { f: f, env: 'mud', p: fl.mud };
      for (var p = 0; p < 2; p++) for (var i = 0; i < fl.side[p].length; i++) if (fl.side[p][i].c === x) return { f: f, p: p, i: i };
    }
    return null;
  }
  /* table cards (and weather) owned by `owner` at unclaimed flags */
  function movableCards(s, owner, troopsOnly) {
    var r = [];
    s.flags.forEach(function (fl, f) {
      if (fl.claimed !== -1) return;
      fl.side[owner].forEach(function (e) { if (!troopsOnly || e.c < 60) r.push(e.c); });
      if (!troopsOnly) { if (fl.fog === owner) r.push(FOG); if (fl.mud === owner) r.push(MUD); }
    });
    return r;
  }
  /* Why a card in hand cannot be played now ('' if it can). */
  function whyNot(s, p, c) {
    if (s.phase !== 'play' || s.turn !== p) return '今は出せません';
    if (c < 60) return openFlags(s, p).length ? '' : '置ける場所がありません';
    if (!s.tactics) return '戦術カードは使いません';
    if (!tacticAllowed(s, p)) return '戦術カードは、相手より2枚以上多くは使えません';
    if (isLeader(c) && s.leader[p]) return '指揮官は1人1枚までです';
    if (isMorale(c)) return openFlags(s, p).length ? '' : '置ける場所がありません';
    if (c === FOG || c === MUD) {
      var key = c === FOG ? 'fog' : 'mud';
      return s.flags.some(function (fl) { return fl.claimed === -1 && fl[key] < 0; }) ? '' : '置ける旗がありません';
    }
    if (c === SCOUT) return s.deck.T.length + s.deck.X.length ? '' : '山札がありません';
    if (c === REDEPLOY) return movableCards(s, p, false).length ? '' : '動かせるカードがありません';
    if (c === DESERTER) return movableCards(s, 1 - p, false).length ? '' : '相手のカードがありません';
    if (c === TRAITOR) return movableCards(s, 1 - p, true).length && openFlags(s, p).length ? '' : '寝返らせられるカードがありません';
    return '';
  }
  function canPass(s, p) { return s.phase === 'play' && s.turn === p && !canPlayTroop(s, p); }
  function scoutReturnCount(s) { return Math.max(0, Math.min(2, s.hands[s.turn].length - HAND)); }

  /* Every legal action for the player to move (the CPU and the tests use this). */
  function claimableFlags(s, p) {   // flags p could claim right now (whether claims are declared or not)
    var unseen = unseenMask(s), out = [];
    for (var f = 0; f < NFLAG; f++) if (claimCheck(s, f, p, unseen)) out.push(f);
    return out;
  }
  function canClaimNow(s, p) { return s.claims === 'manual' && s.turn === p && (s.phase === 'play' || s.phase === 'draw' || s.phase === 'claim'); }
  function legalActions(s) {
    var p = s.turn, out = [];
    if (s.phase === 'over') return out;
    var claims = canClaimNow(s, p) ? claimableFlags(s, p).map(function (f) { return { t: 'claim', f: f }; }) : [];
    if (s.phase === 'claim') return claims.concat([{ t: 'end' }]);
    if (s.phase === 'draw') {
      if (s.deck.T.length) out.push({ t: 'draw', d: 'T' });
      if (s.deck.X.length) out.push({ t: 'draw', d: 'X' });
      return claims.concat(out);
    }
    if (s.phase === 'scout') {
      if (s.scout.left > 0 && s.deck.T.length + s.deck.X.length > 0) {
        if (s.deck.T.length) out.push({ t: 'sdraw', d: 'T' });
        if (s.deck.X.length) out.push({ t: 'sdraw', d: 'X' });
        return out;
      }
      var need = scoutReturnCount(s), h = s.hands[p];
      if (need === 0) out.push({ t: 'sret', cards: [] });
      else if (need === 1) h.forEach(function (c) { out.push({ t: 'sret', cards: [c] }); });
      else for (var a = 0; a < h.length; a++) for (var b = a + 1; b < h.length; b++) out.push({ t: 'sret', cards: [h[a], h[b]] });
      return out;
    }
    var open = openFlags(s, p), seen = {};
    s.hands[p].forEach(function (c) {
      if (seen[c]) return; seen[c] = 1;
      if (whyNot(s, p, c)) return;
      if (c < 60 || isMorale(c)) { open.forEach(function (f) { out.push({ t: 'card', c: c, f: f }); }); return; }
      if (c === FOG || c === MUD) {
        var key = c === FOG ? 'fog' : 'mud';
        s.flags.forEach(function (fl, f) { if (fl.claimed === -1 && fl[key] < 0) out.push({ t: 'env', c: c, f: f }); });
        return;
      }
      if (c === SCOUT) { out.push({ t: 'scout', c: c }); return; }
      if (c === REDEPLOY) {
        movableCards(s, p, false).forEach(function (x) {
          var at = locate(s, x);
          out.push({ t: 'redeploy', c: c, x: x, to: -1 });
          s.flags.forEach(function (fl, f) {
            if (f === at.f || fl.claimed !== -1) return;
            if (isEnv(x)) { if (fl[x === FOG ? 'fog' : 'mud'] < 0) out.push({ t: 'redeploy', c: c, x: x, to: f }); }
            else if (fl.side[p].length < capOf(fl)) out.push({ t: 'redeploy', c: c, x: x, to: f });
          });
        });
        return;
      }
      if (c === DESERTER) { movableCards(s, 1 - p, false).forEach(function (x) { out.push({ t: 'deserter', c: c, x: x }); }); return; }
      if (c === TRAITOR) {
        movableCards(s, 1 - p, true).forEach(function (x) { open.forEach(function (f) { out.push({ t: 'traitor', c: c, x: x, to: f }); }); });
      }
    });
    if (canPass(s, p)) out.push({ t: 'pass' });
    return claims.concat(out);
  }

  /* ================================================================== applying actions
     apply(s, a) mutates s and returns {ok:true, ev:[...]} or {ok:false, err}. a.p must be the player to move.
     Events (in order) describe what happened; card ids that the other player must not see are filtered by redact(). */
  function fail(err) { return { ok: false, err: err }; }
  function removeFromHand(s, p, c) { var h = s.hands[p], i = h.indexOf(c); if (i < 0) return false; h.splice(i, 1); return true; }
  function place(s, p, f, c) { s.clock++; s.flags[f].side[p].push({ c: c, t: s.clock }); }

  /* mud left a flag: a side holding four cards gives up the card it placed last */
  function mudGone(s, f, ev) {
    var fl = s.flags[f];
    for (var p = 0; p < 2; p++) {
      while (fl.side[p].length > 3) {
        var k = 0; fl.side[p].forEach(function (e, i) { if (e.t > fl.side[p][k].t) k = i; });
        var e = fl.side[p].splice(k, 1)[0];
        s.discard[p].push(e.c);
        ev.push({ k: 'mudDrop', p: p, f: f, c: e.c });
      }
    }
  }
  function takeFromTable(s, x, ev) {   // remove a card (or weather) from the table; returns its old location
    var at = locate(s, x);
    if (!at) return null;
    var fl = s.flags[at.f];
    if (at.env === 'fog') fl.fog = -1;
    else if (at.env === 'mud') { fl.mud = -1; mudGone(s, at.f, ev); }
    else fl.side[at.p].splice(at.i, 1);
    return at;
  }

  function doClaims(s, p, ev) {
    var unseen = unseenMask(s);
    for (var f = 0; f < NFLAG; f++) {
      var chk = claimCheck(s, f, p, unseen);
      if (!chk) continue;
      var fl = s.flags[f];
      fl.claimed = p;
      fl.claim = { p: p, how: chk.how, ms: chk.ms, ts: chk.ts, ply: s.ply };
      ev.push({ k: 'claim', p: p, f: f, how: chk.how, ms: chk.ms, ts: chk.ts, fog: fl.fog >= 0 });
      var w = victory(s, p);
      if (w) { finish(s, p, w, ev); return true; }
    }
    return false;
  }
  function finish(s, p, how, ev) {
    s.phase = 'over'; s.winner = p; s.win = how;
    ev.push({ k: 'over', p: p, how: how });
  }
  /* both players passed in a row: nobody can change the table any more */
  function stalemate(s, ev) {
    s.flags.forEach(function (fl, f) {
      if (fl.claimed !== -1) return;
      var cap = capOf(fl), a = fl.side[0].length >= cap, b = fl.side[1].length >= cap, w = -1;
      if (a && b) {
        var s0 = sideStrength(fl, 0), s1 = sideStrength(fl, 1);
        w = s0 > s1 ? 0 : s1 > s0 ? 1 : doneAt(fl.side[0], cap) < doneAt(fl.side[1], cap) ? 0 : 1;
      } else if (a) w = 0; else if (b) w = 1;
      if (w >= 0) { fl.claimed = w; fl.claim = { p: w, how: 'end', ms: sideStrength(fl, w), ts: sideStrength(fl, 1 - w), ply: s.ply }; ev.push({ k: 'claim', p: w, f: f, how: 'end', ms: fl.claim.ms, ts: fl.claim.ts, fog: fl.fog >= 0 }); }
    });
    var v0 = victory(s, 0), v1 = victory(s, 1), n0 = claimedBy(s, 0), n1 = claimedBy(s, 1);
    if (v0 && !v1) return finish(s, 0, v0, ev);
    if (v1 && !v0) return finish(s, 1, v1, ev);
    if (n0 !== n1) return finish(s, n0 > n1 ? 0 : 1, 'count', ev);
    s.phase = 'over'; s.winner = 2; s.win = 'draw'; ev.push({ k: 'over', p: 2, how: 'draw' });
  }
  function endTurn(s, ev) {
    s.turn = 1 - s.turn; s.phase = 'play'; s.ply++;
    ev.push({ k: 'turn', p: s.turn });
  }
  function afterMain(s, p, ev) {
    var manual = s.claims === 'manual';
    if (!manual && doClaims(s, p, ev)) return;
    if (s.hands[p].length < HAND && s.deck.T.length + s.deck.X.length > 0) { s.phase = 'draw'; return; }
    if (manual) { s.phase = 'claim'; return; }   // nothing to draw: the player may still claim, then ends the turn
    endTurn(s, ev);
  }
  /* a declared claim (claims: 'manual') */
  function claimFlag(s, p, f, ev) {
    if (typeof f !== 'number' || f < 0 || f >= NFLAG || f !== Math.floor(f)) return fail('flag');
    var fl = s.flags[f];
    if (fl.claimed !== -1) return fail('claimed');
    if (fl.side[p].length < capOf(fl)) return fail('incomplete');
    var chk = claimCheck(s, f, p, null);
    if (!chk) return fail('noclaim');
    fl.claimed = p;
    fl.claim = { p: p, how: chk.how, ms: chk.ms, ts: chk.ts, ply: s.ply };
    ev.push({ k: 'claim', p: p, f: f, how: chk.how, ms: chk.ms, ts: chk.ts, fog: fl.fog >= 0 });
    var w = victory(s, p);
    if (w) finish(s, p, w, ev);
    return { ok: true, ev: ev };
  }
  function drawCard(s, p, d) { var c = s.deck[d].pop(); s.hands[p].push(c); return c; }

  function apply(s, a) {
    if (!a || typeof a !== 'object') return fail('bad');
    var p = s.turn, ev = [];
    if (s.phase === 'over') return fail('over');
    if (a.p !== undefined && a.p !== p) return fail('turn');
    var t = a.t;
    if (t === 'claim') {
      if (!canClaimNow(s, p)) return fail('claim');
      return claimFlag(s, p, a.f, ev);
    }
    if (s.phase === 'claim') {
      if (t !== 'end') return fail('end');
      endTurn(s, ev);
      return { ok: true, ev: ev };
    }
    if (s.phase === 'draw') {
      if (t !== 'draw' || (a.d !== 'T' && a.d !== 'X') || !s.deck[a.d].length) return fail('draw');
      var dc = drawCard(s, p, a.d);
      ev.push({ k: 'draw', p: p, d: a.d, c: dc });
      endTurn(s, ev);
      return { ok: true, ev: ev };
    }
    if (s.phase === 'scout') {
      if (t === 'sdraw') {
        if (s.scout.left <= 0 || (a.d !== 'T' && a.d !== 'X') || !s.deck[a.d].length) return fail('sdraw');
        var sc = drawCard(s, p, a.d); s.scout.left--;
        if (!s.deck.T.length && !s.deck.X.length) s.scout.left = 0;
        ev.push({ k: 'sdraw', p: p, d: a.d, c: sc });
        return { ok: true, ev: ev };
      }
      if (t === 'sret') {
        if (s.scout.left > 0 && s.deck.T.length + s.deck.X.length > 0) return fail('sret');
        var need = scoutReturnCount(s), cards = Array.isArray(a.cards) ? a.cards : [];
        if (cards.length !== need) return fail('sret');
        if (need === 2 && cards[0] === cards[1]) return fail('sret');
        for (var i = 0; i < cards.length; i++) if (s.hands[p].indexOf(cards[i]) < 0) return fail('sret');
        cards.forEach(function (c) { removeFromHand(s, p, c); var d = c < 60 ? 'T' : 'X'; s.deck[d].push(c); ev.push({ k: 'sret', p: p, d: d, c: c }); });
        s.scout = null; s.phase = 'play';
        afterMain(s, p, ev);
        return { ok: true, ev: ev };
      }
      return fail('scout');
    }
    // phase 'play'
    s.last = null;
    if (t === 'pass') {
      if (!canPass(s, p)) return fail('pass');
      s.passes++;
      ev.push({ k: 'pass', p: p });
      if (s.passes >= 2) { stalemate(s, ev); return { ok: true, ev: ev }; }
      afterMain(s, p, ev);
      return { ok: true, ev: ev };
    }
    var c = a.c;
    if (typeof c !== 'number' || s.hands[p].indexOf(c) < 0) return fail('card');
    var why = whyNot(s, p, c);
    if (why) return fail(why);
    var fl, f = a.f;
    if (t === 'card') {
      if (!(c < 60 || isMorale(c))) return fail('kind');
      if (typeof f !== 'number' || f < 0 || f >= NFLAG) return fail('flag');
      fl = s.flags[f];
      if (fl.claimed !== -1 || fl.side[p].length >= capOf(fl)) return fail('full');
      removeFromHand(s, p, c);
      place(s, p, f, c);
      if (c >= 60) { s.tac[p]++; if (isLeader(c)) s.leader[p] = true; }
      ev.push({ k: 'card', p: p, c: c, f: f });
    } else if (t === 'env') {
      if (!isEnv(c)) return fail('kind');
      if (typeof f !== 'number' || f < 0 || f >= NFLAG) return fail('flag');
      fl = s.flags[f];
      var key = c === FOG ? 'fog' : 'mud';
      if (fl.claimed !== -1 || fl[key] >= 0) return fail('flag');
      removeFromHand(s, p, c); s.tac[p]++;
      fl[key] = p;
      ev.push({ k: 'env', p: p, c: c, f: f });
    } else if (t === 'scout') {
      if (c !== SCOUT) return fail('kind');
      removeFromHand(s, p, c); s.tac[p]++; s.discard[p].push(c);
      ev.push({ k: 'guile', p: p, c: c });
      s.phase = 'scout'; s.scout = { left: 3 };
      return { ok: true, ev: ev };
    } else if (t === 'redeploy') {
      if (c !== REDEPLOY) return fail('kind');
      var at = locate(s, a.x);
      if (!at || at.p !== p || s.flags[at.f].claimed !== -1) return fail('target');
      var to = a.to;
      if (to !== -1) {
        if (typeof to !== 'number' || to < 0 || to >= NFLAG || to === at.f) return fail('to');
        var tf = s.flags[to];
        if (tf.claimed !== -1) return fail('to');
        if (isEnv(a.x)) { if (tf[a.x === FOG ? 'fog' : 'mud'] >= 0) return fail('to'); }
        else if (tf.side[p].length >= capOf(tf)) return fail('to');
      }
      removeFromHand(s, p, c); s.tac[p]++; s.discard[p].push(c);
      ev.push({ k: 'guile', p: p, c: c });
      takeFromTable(s, a.x, ev);
      if (to === -1) { s.discard[p].push(a.x); ev.push({ k: 'move', p: p, c: a.x, from: at.f, to: -1, owner: p }); }
      else {
        if (a.x === FOG) s.flags[to].fog = p;
        else if (a.x === MUD) s.flags[to].mud = p;
        else place(s, p, to, a.x);
        ev.push({ k: 'move', p: p, c: a.x, from: at.f, to: to, owner: p });
      }
    } else if (t === 'deserter') {
      if (c !== DESERTER) return fail('kind');
      var at2 = locate(s, a.x);
      if (!at2 || at2.p !== 1 - p || s.flags[at2.f].claimed !== -1) return fail('target');
      removeFromHand(s, p, c); s.tac[p]++; s.discard[p].push(c);
      ev.push({ k: 'guile', p: p, c: c });
      takeFromTable(s, a.x, ev);
      s.discard[1 - p].push(a.x);
      ev.push({ k: 'move', p: p, c: a.x, from: at2.f, to: -1, owner: 1 - p });
    } else if (t === 'traitor') {
      if (c !== TRAITOR) return fail('kind');
      var at3 = locate(s, a.x);
      if (!at3 || at3.env || at3.p !== 1 - p || a.x >= 60 || s.flags[at3.f].claimed !== -1) return fail('target');
      var to3 = a.to;
      if (typeof to3 !== 'number' || to3 < 0 || to3 >= NFLAG) return fail('to');
      var tf3 = s.flags[to3];
      if (tf3.claimed !== -1 || tf3.side[p].length >= capOf(tf3)) return fail('to');
      removeFromHand(s, p, c); s.tac[p]++; s.discard[p].push(c);
      ev.push({ k: 'guile', p: p, c: c });
      takeFromTable(s, a.x, ev);
      place(s, p, to3, a.x);
      ev.push({ k: 'move', p: p, c: a.x, from: at3.f, to: to3, owner: p, steal: true });
    } else return fail('type');
    s.passes = 0;
    s.last = { p: p, c: c };
    afterMain(s, p, ev);
    return { ok: true, ev: ev };
  }

  /* ================================================================== views (what one player may see) */
  function viewFor(s, me) {
    var o = 1 - me;
    return {
      v: 1, me: me, tactics: s.tactics, claims: s.claims || 'auto', turn: s.turn, phase: s.phase, ply: s.ply, clock: s.clock, first: s.first,
      hand: s.hands[me].slice(),
      opp: s.hands[o].map(function (c) { return c < 60 ? 'T' : 'X'; }),
      deck: { T: s.deck.T.length, X: s.deck.X.length },
      flags: s.flags.map(function (fl) {
        return { side: [fl.side[0].map(function (e) { return { c: e.c, t: e.t }; }), fl.side[1].map(function (e) { return { c: e.c, t: e.t }; })], fog: fl.fog, mud: fl.mud, claimed: fl.claimed, claim: fl.claim ? Object.assign({}, fl.claim) : null };
      }),
      discard: [s.discard[0].slice(), s.discard[1].slice()],
      tac: s.tac.slice(), leader: s.leader.slice(), passes: s.passes,
      scout: s.scout ? { left: s.scout.left, ret: s.phase === 'scout' && s.scout.left === 0 ? scoutReturnCount(s) : 0 } : null,
      winner: s.winner, win: s.win, last: s.last ? Object.assign({}, s.last) : null
    };
  }
  /* hide the cards the other player draws, scouts and returns */
  function redact(ev, me) {
    return ev.map(function (e) {
      if ((e.k === 'draw' || e.k === 'sdraw' || e.k === 'sret') && e.p !== me) { var r = Object.assign({}, e); r.c = null; return r; }
      return e;
    });
  }
  /* Step a view forward by one (redacted) event. The UI uses it to show a turn one step at a time;
     the authoritative view that arrives with the events replaces it afterwards. */
  function reduceView(v0, e) {
    var v = JSON.parse(JSON.stringify(v0)), me = v.me;
    function fromHand(p, c, kind) {
      if (p === me) { var i = v.hand.indexOf(c); if (i >= 0) v.hand.splice(i, 1); }
      else { var j = v.opp.lastIndexOf(kind || (c != null && c < 60 ? 'T' : 'X')); if (j >= 0) v.opp.splice(j, 1); }
    }
    function offTable(c) {
      v.flags.forEach(function (fl) {
        if (c === FOG && fl.fog >= 0) fl.fog = -1;
        if (c === MUD && fl.mud >= 0) fl.mud = -1;
        for (var p = 0; p < 2; p++) { var i = fl.side[p].findIndex(function (x) { return x.c === c; }); if (i >= 0) fl.side[p].splice(i, 1); }
      });
    }
    switch (e.k) {
      case 'card':
        fromHand(e.p, e.c);
        v.clock++; v.flags[e.f].side[e.p].push({ c: e.c, t: v.clock });
        if (e.c >= 60) { v.tac[e.p]++; if (isLeader(e.c)) v.leader[e.p] = true; }
        v.last = { p: e.p, c: e.c };
        break;
      case 'env':
        fromHand(e.p, e.c); v.tac[e.p]++;
        v.flags[e.f][e.c === FOG ? 'fog' : 'mud'] = e.p;
        v.last = { p: e.p, c: e.c };
        break;
      case 'guile':
        fromHand(e.p, e.c); v.tac[e.p]++; v.discard[e.p].push(e.c);
        if (e.c === SCOUT) { v.phase = 'scout'; v.scout = { left: 3, ret: 0 }; }
        v.last = { p: e.p, c: e.c };
        break;
      case 'mudDrop':
        offTable(e.c); v.discard[e.p].push(e.c);
        break;
      case 'move':
        offTable(e.c);
        if (e.to === -1) v.discard[e.owner].push(e.c);
        else if (e.c === FOG) v.flags[e.to].fog = e.p;
        else if (e.c === MUD) v.flags[e.to].mud = e.p;
        else { v.clock++; v.flags[e.to].side[e.p].push({ c: e.c, t: v.clock }); }
        break;
      case 'claim':
        v.flags[e.f].claimed = e.p;
        v.flags[e.f].claim = { p: e.p, how: e.how, ms: e.ms, ts: e.ts, ply: v.ply };
        break;
      case 'draw':
      case 'sdraw':
        v.deck[e.d] = Math.max(0, v.deck[e.d] - 1);
        if (e.p === me) v.hand.push(e.c); else v.opp.push(e.d);
        if (e.k === 'sdraw' && v.scout) v.scout.left = Math.max(0, v.scout.left - 1);
        break;
      case 'sret':
        v.deck[e.d]++;
        fromHand(e.p, e.c, e.d);
        break;
      case 'pass':
        v.passes++;
        break;
      case 'turn':
        v.turn = e.p; v.phase = 'play'; v.ply++; v.scout = null;
        break;
      case 'over':
        v.phase = 'over'; v.winner = e.p; v.win = e.how;
        break;
    }
    return v;
  }

  /* ================================================================== checks for the UI */
  function sideInfo(fl, p) {     // a short description of one side of a flag
    var cap = capOf(fl), side = fl.side[p], fog = fl.fog >= 0;
    if (side.length < cap) return { done: false, need: cap - side.length, label: 'あと' + (cap - side.length) + '枚' };
    var ex = explain(ids(side), fog);
    return { done: true, strength: ex.strength, label: strengthLabel(ex.strength, fog), ex: ex };
  }

  return {
    NCOL: NCOL, NFLAG: NFLAG, HAND: HAND,
    LEADER_A: LEADER_A, LEADER_B: LEADER_B, CAV: CAV, SHIELD: SHIELD, FOG: FOG, MUD: MUD, SCOUT: SCOUT, REDEPLOY: REDEPLOY, DESERTER: DESERTER, TRAITOR: TRAITOR,
    COLOR_NAME: COLOR_NAME, RANK_NAME: RANK_NAME, RANK_HINT: RANK_HINT, TAC_NAME: TAC_NAME, TAC_TEXT: TAC_TEXT,
    isTroop: isTroop, isTactic: isTactic, colorOf: colorOf, valueOf: valueOf, isMorale: isMorale, isLeader: isLeader, isEnv: isEnv, isGuile: isGuile, cardName: cardName,
    mulberry32: mulberry32, shuffle: shuffle, randomSeed: randomSeed,
    bestStrength: bestStrength, concreteStrength: concreteStrength, explain: explain, strengthLabel: strengthLabel, rankOf: rankOf, sumOf: sumOf,
    newGame: newGame, clone: clone, capOf: capOf, ids: ids, doneAt: doneAt, sideStrength: sideStrength, unseenMask: unseenMask,
    claimCheck: claimCheck, claimableFlags: claimableFlags, canClaimNow: canClaimNow, claimedBy: claimedBy, victory: victory, breakthrough: breakthrough,
    openFlags: openFlags, canPlayTroop: canPlayTroop, tacticAllowed: tacticAllowed, locate: locate, movableCards: movableCards,
    whyNot: whyNot, canPass: canPass, scoutReturnCount: scoutReturnCount, legalActions: legalActions,
    apply: apply, viewFor: viewFor, redact: redact, reduceView: reduceView, sideInfo: sideInfo
  };
});

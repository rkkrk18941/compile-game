/* ヒトモジ・バトル — CPU players.
   A CPU sees what anyone at the table sees (opened tags, declared letters, the お題) plus its own word, never
   anyone else's. It reads each opponent against the words it knows for the お題 (words.js), falls back on how often
   letters appear when nothing it knows fits, and weighs every letter: tags it should open, players it could knock
   out, the second declaration a hit earns — against the tags of its own it would open (自爆).
   Levels: 1 やさしい (letter frequency, careless about its own word), 2 ふつう (reads the お題 list), 3 つよい
   (also words outside the お題, splits the candidates, picks hard-to-read words for itself), 4 最強 (no randomness,
   weighs what each letter reveals more, and keeps only the hardest words for itself), 5 成長する敵 (最強 with values
   it learns after each loss, and it remembers the words you used against it; see assets/rival.js). It never sees
   anyone's word before it is shown. */
(function (root, factory) {
  var E = root && root.HMB_ENG ? root.HMB_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var W = root && root.HMB_WORDS ? root.HMB_WORDS : (typeof require === 'function' ? require('./words.js') : null);
  var api = factory(E, W);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HMB_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E, W) {
  'use strict';
  var X = E.X, SLOTS = E.SLOTS;

  /* ------------------------------------------------------------ what a CPU knows */
  var lexCache = {}, allCache = {}, hardCache = {};
  function entry(word, mode, maxLen) {
    var r = E.normalize(word, mode, maxLen);
    return r.ok ? { disp: r.word, cells: r.cells, L: r.cells.length, key: r.cells.join('') } : null;
  }
  function allWords(mode) {
    if (allCache[mode]) return allCache[mode];
    var seen = {}, out = [];
    W.list(mode).forEach(function (th) {
      th.words.forEach(function (w) { var e = entry(w, mode, SLOTS); if (e && !seen[e.key]) { seen[e.key] = 1; out.push(e); } });
    });
    var freq = {}, letters = E.alphabet(mode), total = 0, lenSum = 0;
    for (var i = 0; i < letters.length; i++) freq[letters[i]] = 1;
    out.forEach(function (e) { lenSum += e.L; e.cells.forEach(function (c) { freq[c] = (freq[c] || 1) + 1; total++; }); });
    allCache[mode] = { list: out, freq: freq, total: total + letters.length, avgLen: out.length ? lenSum / out.length : 4.5 };
    return allCache[mode];
  }
  /* the お題's words (or everything for なんでも / a free-text お題), and every other word it knows */
  function lexicon(mode, themeId, maxLen) {
    maxLen = E.clampLen(maxLen);
    var key = mode + '|' + themeId + '|' + maxLen;
    if (lexCache[key]) return lexCache[key];
    var all = allWords(mode), th = W.theme(mode, themeId), own = [], seen = {};
    if (th && !th.free) th.words.forEach(function (w) { var e = entry(w, mode, maxLen); if (e && !seen[e.key]) { seen[e.key] = 1; own.push(e); } });
    var known = !!own.length;
    if (!known) all.list.forEach(function (e) { if (e.L <= maxLen) { seen[e.key] = 1; own.push(e); } });
    var other = known ? all.list.filter(function (e) { return e.L <= maxLen && !seen[e.key]; }) : [];
    lexCache[key] = { theme: own, other: other, known: known, freq: all.freq, total: all.total, avgLen: all.avgLen };
    return lexCache[key];
  }

  /* ------------------------------------------------------------ reading one opponent */
  var PRIOR = 0.75;     // how often a player's word is one this CPU knows for the お題
  function consistent(e, known, maxIdx, declared, maxLen) {
    if (e.L <= maxIdx || e.L > maxLen) return false;
    var hid = 0;
    for (var i = 0; i < SLOTS; i++) {
      var k = known[i];
      if (k) { if (i >= e.L || e.cells[i] !== k) return false; }
      else if (i < e.L) { if (declared[e.cells[i]]) return false; hid++; }
    }
    return hid > 0;
  }
  /* returns per-letter { hit: P(at least one tag opens), exp: expected tags, out: P(the player goes out), info } */
  function readPlayer(s, q, lx, declared, avail, cfg) {
    var pl = s.P[q], known = [], maxIdx = -1, nOpen = 0;
    for (var i = 0; i < SLOTS; i++) { var o = pl.open[i]; if (o && o !== X) { known[i] = o; maxIdx = i; nOpen++; } }
    var cands = [], wsum = 0, nTheme = 0;
    function take(list, w) {
      var n = 0;
      for (var j = 0; j < list.length; j++) if (consistent(list[j], known, maxIdx, declared, s.maxLen)) { cands.push({ e: list[j], w: w }); wsum += w; n++; }
      return n;
    }
    if (cfg.lex) nTheme = take(lx.theme, 1);
    // the learning rival remembers the words this player used before: those are a little likelier
    if (cfg.seen && wsum > 0) cands.forEach(function (cd) { var k = cfg.seen[cd.e.key]; if (k) { var add = cd.w * Math.min(4, k) * cfg.seenW; cd.w += add; wsum += add; } });
    // words outside the お題 share a small, fixed part of the belief, however many of them there are
    if (cfg.other && lx.known && lx.other.length) take(lx.other, cfg.other * lx.theme.length / lx.other.length);
    var res = {}, c, k;
    avail.forEach(function (ch) { res[ch] = { hit: 0, exp: 0, out: 0, info: 0 }; });
    // what the words it knows say
    var hidMean = 0, patterns = {};
    if (wsum > 0) {
      cands.forEach(function (cd) {
        var e = cd.e, cnt = {}, hid = 0, distinct = 0, only = null;
        for (var i2 = 0; i2 < e.L; i2++) if (!known[i2]) { var l = e.cells[i2]; if (!cnt[l]) { cnt[l] = 0; distinct++; only = l; } cnt[l]++; hid++; }
        hidMean += cd.w * hid;
        for (var l2 in cnt) {
          var r = res[l2]; if (!r) continue;
          r.hit += cd.w; r.exp += cd.w * cnt[l2];
          if (distinct === 1 && only === l2) r.out += cd.w;
        }
        if (cfg.info) {
          // which tags each letter would open: letters that split the candidates tell more
          for (var l3 in cnt) {
            if (!res[l3]) continue;
            var mask = 0; for (var i3 = 0; i3 < e.L; i3++) if (!known[i3] && e.cells[i3] === l3) mask |= (1 << i3);
            var pk = l3 + mask; patterns[pk] = (patterns[pk] || 0) + cd.w;
          }
        }
      });
      hidMean /= wsum;
      for (c in res) { res[c].hit /= wsum; res[c].exp /= wsum; res[c].out /= wsum; }
      if (cfg.info && cands.length > 1) {
        var by = {};
        for (k in patterns) { var ch2 = k[0]; (by[ch2] = by[ch2] || []).push(patterns[k]); }
        for (c in res) {
          var ps = by[c] || [], miss = wsum - ps.reduce(function (a, b) { return a + b; }, 0), H = 0;
          ps.concat([miss]).forEach(function (w) { if (w > 1e-9) { var p = w / wsum; H -= p * Math.log(p) / Math.LN2; } });
          res[c].info = H;
        }
      }
    }
    // letter frequency, for words it does not know
    var fsum = 0; avail.forEach(function (ch) { fsum += lx.freq[ch] || 1; });
    var h = wsum > 0 ? Math.max(1, hidMean) : Math.max(1, Math.max(lx.avgLen, maxIdx + 1.5) - nOpen);
    // how much to trust the list: is the opponent's word one of the お題's words, given what is open?
    // P(in list | table) ∝ prior × (share of list words that fit) against (1 − prior) × (share of all words that fit)
    var beta = 0;
    if (nTheme > 0) {
      var all = allWords(s.mode).list, fitAll = 0;
      for (var a2 = 0; a2 < all.length; a2++) if (consistent(all[a2], known, maxIdx, declared, s.maxLen)) fitAll++;
      var pin = PRIOR * nTheme / Math.max(1, lx.theme.length), pout = (1 - PRIOR) * Math.max(fitAll, 0.5) / Math.max(1, all.length);
      beta = Math.min(cfg.beta, pin / (pin + pout));
    }
    avail.forEach(function (ch) {
      var p = (lx.freq[ch] || 1) / fsum, fh = 1 - Math.pow(1 - p, h), r = res[ch];
      var fo = h <= 1.3 ? fh * 0.7 : fh * Math.pow(0.08, h - 1);
      r.hit = beta * r.hit + (1 - beta) * fh;
      r.exp = beta * r.exp + (1 - beta) * h * p;
      r.out = beta * r.out + (1 - beta) * fo;
    });
    return { res: res, n: cands.length, w: wsum };
  }

  /* ------------------------------------------------------------ choosing a letter */
  var LEVELS = {
    1: { lex: false, other: 0, beta: 0, info: 0, noise: 1.3, care: 0.6, careless: 0.45, gainW: 0.8, chain: 0.6, outB: 2.4 },
    2: { lex: true, other: 0, beta: 0.85, info: 0, noise: 0.32, care: 1, careless: 0, gainW: 1, chain: 0.6, outB: 2.4 },
    3: { lex: true, other: 0.15, beta: 0.93, info: 0.22, noise: 0.06, care: 1, careless: 0, gainW: 1, chain: 0.6, outB: 2.4 },
    4: { lex: true, other: 0.2, beta: 0.95, info: 0.32, noise: 0, care: 1.1, careless: 0, gainW: 1, chain: 0.7, outB: 2.6, wordTop: 0.15 },
    5: { lex: true, other: 0.2, beta: 0.95, info: 0.32, noise: 0, care: 1.1, careless: 0, gainW: 1, chain: 0.7, outB: 2.6, wordTop: 0.15, seenW: 0.6 }
  };
  var GROW_SPACE = {
    info: { min: 0, max: 0.8, step: 0.04, label: '候補を絞りこむ文字を選ぶ度合い', up: '強めに', down: '弱めに' },
    care: { min: 0.6, max: 1.8, step: 0.1, label: '自分の札を開かない慎重さ', up: '強めに', down: '弱めに' },
    outB: { min: 1, max: 5, step: 0.2, label: '相手を脱落させる文字の重み', up: '重く', down: '軽く' },
    chain: { min: 0, max: 1.6, step: 0.1, label: '続けて宣言できる文字の重み', up: '重く', down: '軽く' },
    other: { min: 0, max: 0.5, step: 0.05, label: 'お題の外の言葉も疑う度合い', up: '強めに', down: '弱めに' },
    seenW: { min: 0, max: 2, step: 0.2, label: 'あなたが前に使った言葉を疑う度合い', up: '強めに', down: '弱めに' }
  };
  var GROW_BASE = { info: 0.32, care: 1.1, outB: 2.6, chain: 0.7, other: 0.2, seenW: 0.6 };
  function config(level, tune) { var c = {}, b = LEVELS[level] || LEVELS[2], k; for (k in b) c[k] = b[k]; if (tune) for (k in tune) c[k] = tune[k]; return c; }
  function chooseLetter(s, me, myCells, level, rng, tune) {
    rng = rng || Math.random; level = level | 0 || 2;
    var cfg = config(level, tune);
    var avail = E.alphabet(s.mode).split('').filter(function (ch) { return !s.used[ch]; });
    if (!avail.length) return null;
    var lx = lexicon(s.mode, s.theme.id, s.maxLen), declared = {};
    Object.keys(s.used).forEach(function (ch) { declared[ch] = 1; });
    var opp = E.alive(s).filter(function (q) { return q !== me; });
    var reads = opp.map(function (q) { return readPlayer(s, q, lx, declared, avail, cfg); });
    var mine = {}, myHidden = 0, myOpen = s.P[me].open;
    for (var i = 0; i < SLOTS; i++) if (myCells[i] !== X && !myOpen[i]) { mine[myCells[i]] = (mine[myCells[i]] || 0) + 1; myHidden++; }
    var lastTwo = opp.length === 1;
    var best = null, bestScore = -Infinity;
    avail.forEach(function (ch) {
      var gain = 0, pNone = 1, pAllOut = 1, info = 0;
      reads.forEach(function (rd) {
        var r = rd.res[ch];
        gain += r.exp + r.out * (lastTwo ? 60 : cfg.outB);
        pNone *= (1 - r.hit); pAllOut *= r.out;
        info += r.info;
      });
      var k = mine[ch] || 0, pen = 0;
      if (k) {
        if (k >= myHidden) pen = pAllOut > 0.75 ? (1 - pAllOut) * 90 - pAllOut * 60 : 90;   // 自爆で脱落: only if it surely takes everyone with it
        else pen = k * (1.15 + 2.6 / (myHidden - k)) + 0.45;
      }
      var pAny = k && s.selfChain ? 1 : 1 - pNone;
      var chain = s.chain === 0 && !(k && k >= myHidden) ? cfg.chain * pAny : 0;
      var care = cfg.careless && rng() < cfg.careless ? 0.15 : cfg.care;
      var score = gain * cfg.gainW + chain + cfg.info * info - pen * care + rng() * cfg.noise;
      if (score > bestScore) { bestScore = score; best = ch; }
    });
    return best;
  }

  /* ------------------------------------------------------------ choosing its own word */
  /* how many declarations a sharp reader who knows the お題 needs to open every tag of this word */
  function toughness(target, pool, freq) {
    var declared = {}, known = [], maxIdx = -1, steps = 0, misses = 0, left = target.L;
    var letters = Object.keys(freq);
    while (left > 0 && steps < 60) {
      var counts = {}, n = 0;
      for (var j = 0; j < pool.length; j++) {
        var e = pool[j];
        if (!consistent(e, known, maxIdx, declared, SLOTS)) continue;
        n++;
        var seen = {};
        for (var i = 0; i < e.L; i++) if (!known[i] && !seen[e.cells[i]]) { seen[e.cells[i]] = 1; counts[e.cells[i]] = (counts[e.cells[i]] || 0) + 1; }
      }
      var best = null, bs = -1;
      for (var l = 0; l < letters.length; l++) {
        var ch = letters[l]; if (declared[ch]) continue;
        var sc = (counts[ch] || 0) * 1000 + (freq[ch] || 0) / 1000;
        if (sc > bs) { bs = sc; best = ch; }
      }
      if (!best) break;
      declared[best] = 1; steps++;
      var hit = false;
      for (var p = 0; p < target.L; p++) if (target.cells[p] === best) { known[p] = best; left--; hit = true; if (p > maxIdx) maxIdx = p; }
      if (!hit) misses++;
    }
    return misses + steps * 0.15;
  }
  function hardness(mode, themeId, maxLen) {
    var key = mode + '|' + themeId + '|' + maxLen;
    if (hardCache[key]) return hardCache[key];
    var lx = lexicon(mode, themeId, maxLen), pool = lx.theme, out = {};
    if (pool.length <= 260) pool.forEach(function (e) { out[e.key] = toughness(e, pool, lx.freq); });
    else pool.forEach(function (e) {
      // too many words to simulate: rare letters, few repeats
      var seen = {}, rare = 0;
      e.cells.forEach(function (c) { if (!seen[c]) { seen[c] = 1; rare += 1 / Math.sqrt(lx.freq[c] || 1); } });
      out[e.key] = rare * 20 + Object.keys(seen).length * 0.5 - Math.abs(e.L - 5) * 0.4;
    });
    hardCache[key] = out;
    return out;
  }
  function pick(list, rng) { return list[Math.floor(rng() * list.length) % list.length]; }
  /* { cells (7, padded with ×), disp } */
  function chooseWord(mode, themeId, level, rng, maxLen, avoid) {
    rng = rng || Math.random; maxLen = E.clampLen(maxLen); level = level | 0 || 2;
    var lx = lexicon(mode, themeId, maxLen), avoidSet = {};
    (avoid || []).forEach(function (k) { avoidSet[k] = 1; });
    var pool = lx.theme.filter(function (e) { return !avoidSet[e.key]; });
    if (!pool.length) pool = lx.theme.length ? lx.theme : allWords(mode).list.filter(function (e) { return e.L <= maxLen; });
    var e;
    if (level <= 1) e = pick(pool, rng);
    else {
      var hd = hardness(mode, themeId, maxLen);
      var sorted = pool.slice().sort(function (a, b) { return (hd[b.key] || 0) - (hd[a.key] || 0); });
      var top = Math.max(1, Math.round(sorted.length * (level >= 4 ? (LEVELS[level].wordTop || 0.15) : level >= 3 ? 0.3 : 0.65)));
      e = pick(sorted.slice(0, top), rng);
    }
    return { cells: E.pad(e.cells), disp: e.disp, key: e.key };
  }
  /* a word for the human's おまかせ button */
  function suggest(mode, themeId, maxLen, rng) {
    var lx = lexicon(mode, themeId, maxLen);
    var e = pick(lx.theme.length ? lx.theme : allWords(mode).list, rng || Math.random);
    return e.disp;
  }
  function themeSize(mode, themeId, maxLen) { return lexicon(mode, themeId, maxLen).theme.length; }

  return { chooseLetter: chooseLetter, chooseWord: chooseWord, suggest: suggest, lexicon: lexicon, themeSize: themeSize, readPlayer: readPlayer, toughness: toughness, LEVELS: LEVELS, GROW_SPACE: GROW_SPACE, GROW_BASE: GROW_BASE };
});

/* ヒトモジ・バトル — rules engine (browser and Node).
   Rules of the board game 「あいうえバトル」 (game design: 米光一成): every player hides one word of 2–7 letters
   behind 7 tags; on your turn you declare one letter from the board; every unopened tag carrying that letter is
   opened, your own included (自爆); if anything opened you may declare once more; a player whose letters are all
   open is out; the last one left wins.
   The state here holds only what the table can see. Each word stays with its owner (see session.js): an owner
   answers every declaration with the positions it opens, and the word is checked against a salted SHA-256
   commitment when it is finally shown. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HMB_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SLOTS = 7, MIN_LEN = 2, X = '×';
  var KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんー';
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function alphabet(mode) { return mode === 'en' ? ABC : KANA; }
  function isLetter(mode, ch) { return typeof ch === 'string' && ch.length === 1 && alphabet(mode).indexOf(ch) >= 0; }

  /* ------------------------------------------------------------ writing a word on the tags */
  var SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け', 'ゐ': 'い', 'ゑ': 'え' };
  var KATA_EXTRA = { 'ヷ': 'わ', 'ヸ': 'い', 'ヹ': 'え', 'ヺ': 'を' };
  function charClass(ranges) { return new RegExp('[' + ranges.map(function (r) { return typeof r === 'number' ? String.fromCharCode(r) : String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]); }).join('') + ']', 'g'); }
  var MARKS = charClass([[0x3099, 0x309C]]);                                             // combining and spacing dakuten / handakuten
  var DASHES = charClass([0x2d, [0x2010, 0x2015], 0x2212, 0xff0d, 0x301c, 0xff5e]);     // what keyboards produce for the long-vowel mark
  var SEPARATORS = charClass([0x20, 0x09, 0x0a, 0x0d, 0x3000, 0x30fb, 0xff65, 0xb7, 0x2e, 0x2c, 0x3001, 0x3002, 0x27, 0x22, 0x2019, 0x201c, 0x201d, 0x21, 0x3f, 0xff01, 0xff1f]);
  var CTRL = charClass([[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], 0xfeff]);
  function nfkc(s) { return s.normalize ? s.normalize('NFKC') : s; }
  function nfd(s) { return s.normalize ? s.normalize('NFD') : s; }

  /* how a word is shown when it is finally revealed (as the player typed it, tidied) */
  function cleanDisplay(s) { return nfkc(String(s == null ? '' : s)).replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, 24); }

  /* The rules for writing (説明書): hiragana only, no ゛ ゜, small kana written large, ー is a letter of its own.
     Returns { ok, cells (2–7 letters, unpadded), word (display), err, bad } */
  function normalize(input, mode, maxLen) {
    maxLen = clampLen(maxLen);
    var word = cleanDisplay(input);
    var s = nfkc(String(input == null ? '' : input)).replace(CTRL, '').replace(SEPARATORS, '');
    var cells = [], bad = [];
    if (mode === 'en') {
      s = s.toUpperCase().replace(DASHES, '');
      for (var i = 0; i < s.length; i++) { var c = s[i]; if (ABC.indexOf(c) >= 0) cells.push(c); else if (bad.indexOf(c) < 0) bad.push(c); }
    } else {
      s = s.replace(DASHES, 'ー');
      for (var j = 0; j < s.length; j++) {
        var ch = s[j], code = ch.charCodeAt(0);
        if (code >= 0x30A1 && code <= 0x30F6) ch = String.fromCharCode(code - 0x60);   // katakana → hiragana
        else if (KATA_EXTRA[ch]) ch = KATA_EXTRA[ch];
        var parts = nfd(ch).replace(MARKS, '');
        for (var k = 0; k < parts.length; k++) {
          var p = SMALL[parts[k]] || parts[k];
          if (KANA.indexOf(p) >= 0) cells.push(p);
          else if (bad.indexOf(ch) < 0) bad.push(ch);
        }
      }
    }
    var err = null;
    if (!cells.length && !bad.length) err = 'empty';
    else if (bad.length) err = 'chars';
    else if (cells.length < MIN_LEN) err = 'short';
    else if (cells.length > maxLen) err = 'long';
    return { ok: !err, cells: cells, word: word, err: err, bad: bad, len: cells.length, maxLen: maxLen };
  }
  function errorText(r, mode) {
    if (!r || r.ok) return '';
    var en = mode === 'en';
    if (r.err === 'empty') return en ? '英字（A〜Z）で書いてください' : 'ことばを書いてください';
    if (r.err === 'chars') return (en ? 'A〜Z 以外の文字は使えません：' : 'ひらがな・カタカナ以外は使えません：') + r.bad.slice(0, 4).join(' ');
    if (r.err === 'short') return MIN_LEN + '文字以上にしてください';
    if (r.err === 'long') return r.maxLen + '文字までです（いま' + r.len + '文字）';
    return '書けません';
  }
  function clampLen(n) { n = n | 0; return n >= 3 && n <= SLOTS ? n : SLOTS; }
  function pad(cells) { var out = cells.slice(0, SLOTS); while (out.length < SLOTS) out.push(X); return out; }
  function wordLen(cells) { var n = 0; while (n < cells.length && cells[n] !== X) n++; return n; }
  function validCells(mode, cells, maxLen) {
    if (!Array.isArray(cells) || cells.length !== SLOTS) return false;
    var n = wordLen(cells);
    if (n < MIN_LEN || n > clampLen(maxLen)) return false;
    for (var i = 0; i < SLOTS; i++) {
      if (i < n) { if (!isLetter(mode, cells[i])) return false; }
      else if (cells[i] !== X) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ SHA-256 (sync, UTF-8) for the word commitments */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { var d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function sha256(str) {
    var bytes = utf8(String(str)), bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? 0 : (bitLen >>> (s * 8)) & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) W[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var w15 = W[t - 15], w2 = W[t - 2];
        var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K256[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  /* what a player promises before the first declaration: their 7 tags, under a secret salt */
  function commitHash(gid, seat, cells, salt) { return sha256('hmb1|' + gid + '|' + seat + '|' + cells.join('') + '|' + salt); }

  /* ------------------------------------------------------------ the table */
  /* opts: { gid, mode: 'ja'|'en', theme: { id, name }, maxLen, selfChain, first, players: [{ nm, kind, cpu, cid }] } */
  function newGame(o) {
    var players = (o.players || []).slice(0, 6);
    var n = players.length;
    var first = (o.first | 0) % Math.max(1, n);
    return {
      v: 1, gid: o.gid || 1, mode: o.mode === 'en' ? 'en' : 'ja',
      theme: { id: String((o.theme && o.theme.id) || 'free'), name: String((o.theme && o.theme.name) || 'なんでも').slice(0, 24) },
      maxLen: clampLen(o.maxLen), selfChain: o.selfChain !== false,
      n: n, first: first, turn: first, chain: 0, ply: 0, phase: 'write',
      P: players.map(function (p) {
        return { nm: String(p.nm || 'プレイヤー').slice(0, 12), kind: p.kind || 'cpu', cpu: p.cpu | 0, cid: p.cid || null,
          ready: false, h: null, open: emptyOpen(), out: false, outPly: 0, place: 0, forfeit: false, word: null, cells: null, ok: null };
      }),
      used: {},          // letter → { by, ply, hits: { seat: [positions] } }
      log: [],           // one entry per declaration (see resolve)
      pend: null,        // the declaration waiting for every player's answer
      winner: -1, last: false
    };
  }
  function emptyOpen() { var a = []; for (var i = 0; i < SLOTS; i++) a.push(null); return a; }
  function alive(s) { var out = []; for (var i = 0; i < s.n; i++) if (!s.P[i].out) out.push(i); return out; }
  function nextAlive(s, from) { for (var k = 1; k <= s.n; k++) { var j = (from + k) % s.n; if (!s.P[j].out) return j; } return -1; }
  function hiddenCount(cells, open) { var n = 0; for (var i = 0; i < SLOTS; i++) if (cells[i] !== X && !open[i]) n++; return n; }

  /* a player has written their word (only its commitment reaches the table) */
  function setReady(s, seat, h) {
    if (s.phase !== 'write' || !s.P[seat] || s.P[seat].ready) return { ok: false, err: 'closed' };
    if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) return { ok: false, err: 'hash' };
    s.P[seat].ready = true; s.P[seat].h = h;
    return { ok: true, started: maybeStart(s) };
  }
  function maybeStart(s) {
    if (s.phase !== 'write') return false;
    if (!s.P.every(function (p) { return p.ready || p.out; })) return false;
    var live = alive(s);
    if (live.length <= 1) { finish(s, live.length ? live[0] : s.first, false); return true; }
    s.phase = 'play';
    if (s.P[s.turn].out) s.turn = nextAlive(s, s.turn);
    return true;
  }

  function canDeclare(s, seat, ch) {
    if (s.phase !== 'play' || s.pend) return 'wait';
    if (seat !== s.turn || !s.P[seat] || s.P[seat].out) return 'turn';
    if (!isLetter(s.mode, ch)) return 'letter';
    if (s.used[ch]) return 'used';
    return '';
  }
  /* the turn player says a letter; it resolves once every remaining player has answered */
  function declare(s, seat, ch) {
    var why = canDeclare(s, seat, ch);
    if (why) return { ok: false, err: why };
    s.pend = { ply: s.ply + 1, by: seat, ch: ch, chain: s.chain, need: alive(s), got: {}, ans: {} };
    return { ok: true, pend: s.pend };
  }
  /* what an owner computes from their own tags */
  function answerFor(cells, open, ch) {
    var pos = [];
    for (var i = 0; i < SLOTS; i++) if (cells[i] === ch && !open[i]) pos.push(i);
    var left = 0;
    for (var k = 0; k < SLOTS; k++) if (cells[k] !== X && !open[k] && pos.indexOf(k) < 0) left++;
    return { pos: pos, out: pos.length > 0 && left === 0 };
  }
  /* a: { pos: [indexes], out: bool, word?: { cells, disp, salt } } or { forfeit: true } */
  function answer(s, seat, a) {
    var p = s.pend;
    if (!p || p.need.indexOf(seat) < 0 || p.got[seat]) return { ok: false, err: 'closed' };
    if (!a || typeof a !== 'object') return { ok: false, err: 'bad' };
    if (a.forfeit) { p.got[seat] = 1; p.ans[seat] = { forfeit: true }; return { ok: true, done: answered(s) }; }
    var pos = Array.isArray(a.pos) ? a.pos : [], seen = {}, open = s.P[seat].open;
    for (var i = 0; i < pos.length; i++) {
      var x = pos[i];
      if (typeof x !== 'number' || x !== (x | 0) || x < 0 || x >= SLOTS || seen[x] || open[x]) return { ok: false, err: 'pos' };
      seen[x] = 1;
    }
    var out = !!a.out;
    if (out && !pos.length) return { ok: false, err: 'out' };
    var rec = { pos: pos.slice().sort(function (m, n) { return m - n; }), out: out };
    if (out) {
      // a player who goes out shows every tag, the ×s included, right away
      if (!a.word) return { ok: false, err: 'word' };
      rec.word = { cells: a.word.cells, disp: cleanDisplay(a.word.disp), salt: String(a.word.salt || '') };
    }
    p.got[seat] = 1; p.ans[seat] = rec;
    return { ok: true, done: answered(s) };
  }
  function answered(s) { var p = s.pend; return !!p && p.need.every(function (q) { return !!p.got[q]; }); }

  /* every answer is in: open the tags, knock players out, pass the turn. Returns the events, in order. */
  function resolve(s) {
    var p = s.pend;
    if (!p || !answered(s)) return null;
    s.pend = null; s.ply = p.ply;
    var by = p.by, ch = p.ch, ev = [{ k: 'declare', by: by, ch: ch, ply: p.ply, chain: p.chain }];
    var rec = { ply: p.ply, by: by, ch: ch, hits: {}, out: [], forfeit: [], again: false, next: -1 };
    var anyHit = false, selfHit = false;
    p.need.forEach(function (q) {
      var a = p.ans[q], pl = s.P[q];
      if (a.forfeit) { pl.out = true; pl.forfeit = true; pl.outPly = p.ply; rec.forfeit.push(q); ev.push({ k: 'forfeit', seat: q }); return; }
      if (a.pos.length) {
        rec.hits[q] = a.pos.slice();
        a.pos.forEach(function (i) { pl.open[i] = ch; });
        if (q === by) selfHit = true;
        if (q !== by || s.selfChain) anyHit = true;
        ev.push({ k: 'hit', seat: q, pos: a.pos.slice(), self: q === by });
      }
    });
    s.used[ch] = { by: by, ply: p.ply, hits: rec.hits };
    s.log.push(rec);
    if (!Object.keys(rec.hits).length) ev.push({ k: 'miss', by: by, ch: ch });
    p.need.forEach(function (q) {
      var a = p.ans[q], pl = s.P[q];
      if (a.forfeit || !a.out) return;
      pl.out = true; pl.outPly = p.ply; rec.out.push(q);
      showWord(s, q, a.word);
      ev.push({ k: 'out', seat: q, self: q === by });
    });
    var live = alive(s);
    if (live.length === 0) {
      // everyone left went out on the same letter: the one who declared it survives (説明書)
      s.P[by].out = false; s.P[by].outPly = 0;
      rec.out = rec.out.filter(function (q) { return q !== by; });
      ev = ev.filter(function (e) { return !(e.k === 'out' && e.seat === by); });
      finish(s, by, true); ev.push({ k: 'over', winner: by, last: true });
      return ev;
    }
    if (live.length === 1) { finish(s, live[0], false); ev.push({ k: 'over', winner: live[0], last: false }); return ev; }
    if (!s.P[by].out && anyHit && s.chain === 0) {
      s.chain = 1; rec.again = true; rec.next = by;
      ev.push({ k: 'again', seat: by, self: selfHit && Object.keys(rec.hits).length === 1 });
    } else {
      s.chain = 0; s.turn = nextAlive(s, by); rec.next = s.turn;
      ev.push({ k: 'turn', seat: s.turn });
    }
    return ev;
  }
  /* a player leaves for good while nothing is pending (write phase, or their own idle turn) */
  function forfeit(s, seat) {
    var pl = s.P[seat];
    if (!pl || pl.out || s.phase === 'over') return null;
    if (s.pend) return null;
    pl.out = true; pl.forfeit = true; pl.outPly = s.ply;
    var ev = [{ k: 'forfeit', seat: seat }];
    if (s.phase === 'write') { if (maybeStart(s)) ev.push(s.phase === 'over' ? { k: 'over', winner: s.winner, last: false } : { k: 'turn', seat: s.turn }); return ev; }
    var live = alive(s);
    if (live.length === 1) { finish(s, live[0], false); ev.push({ k: 'over', winner: live[0], last: false }); return ev; }
    if (s.turn === seat) { s.chain = 0; s.turn = nextAlive(s, seat); ev.push({ k: 'turn', seat: s.turn }); }
    return ev;
  }
  function finish(s, winner, last) {
    s.phase = 'over'; s.pend = null; s.winner = winner; s.last = !!last; s.turn = winner; s.chain = 0;
    // places: the winner first, then by how late each player went out (same letter, same place)
    s.P.forEach(function (pl, i) {
      if (i === winner) { pl.place = 1; return; }
      var ahead = 0;
      s.P.forEach(function (o, j) { if (j !== i && (j === winner || !o.out || o.outPly > pl.outPly)) ahead++; });
      pl.place = ahead + 1;
    });
  }
  function showWord(s, seat, w) {
    var pl = s.P[seat];
    if (!w || !w.cells) return;
    var chk = checkWord(s, seat, w);
    pl.ok = chk.ok; pl.why = chk.ok ? '' : chk.why;
    pl.word = cleanDisplay(w.disp) || w.cells.filter(function (c) { return c !== X; }).join('');
    if (validCells(s.mode, w.cells, SLOTS)) {
      pl.cells = w.cells.slice();
      for (var i = 0; i < SLOTS; i++) if (!pl.open[i]) pl.open[i] = w.cells[i] === X ? X : null;
      // tags nobody declared stay face down for the record, but the word is known now
    }
  }
  /* after the game: a survivor (or anyone) shows their word */
  function reveal(s, seat, w) {
    var pl = s.P[seat];
    if (!pl || pl.cells || !w) return false;
    showWord(s, seat, { cells: w.cells, disp: w.disp, salt: w.salt });
    return true;
  }

  /* Is this word the one that was promised, and did its owner answer every declaration truthfully? */
  function checkWord(s, seat, w) {
    var pl = s.P[seat];
    if (!pl) return { ok: false, why: 'seat' };
    if (!w || !validCells(s.mode, w.cells, s.maxLen)) return { ok: false, why: 'cells' };
    if (!pl.h || commitHash(s.gid, seat, w.cells, String(w.salt || '')) !== pl.h) return { ok: false, why: 'hash' };
    var open = emptyOpen(), outAt = 0;
    for (var r = 0; r < s.log.length; r++) {
      var rec = s.log[r];
      if (outAt) break;                                   // nobody asks a player who is already out
      if (rec.forfeit.indexOf(seat) >= 0) break;
      var want = [];
      for (var i = 0; i < SLOTS; i++) if (w.cells[i] === rec.ch) want.push(i);
      var got = (rec.hits[seat] || []).slice().sort(function (a, b) { return a - b; });
      if (want.join(',') !== got.join(',')) return { ok: false, why: 'answer', ply: rec.ply };
      got.forEach(function (i) { open[i] = rec.ch; });
      if (hiddenCount(w.cells, open) === 0) outAt = rec.ply;
    }
    var lastWin = s.phase === 'over' && s.winner === seat && s.last;
    if (pl.out && !pl.forfeit && outAt !== pl.outPly) return { ok: false, why: 'out' };
    if (!pl.out && outAt && !lastWin) return { ok: false, why: 'out' };
    return { ok: true };
  }

  /* what the table shows (no answers before they are opened) */
  function publicView(s) {
    var v = JSON.parse(JSON.stringify(s));
    if (v.pend) delete v.pend.ans;
    return v;
  }

  /* little helpers for screens and CPUs */
  function hitsOf(s, ch) { var u = s.used[ch]; return u ? u.hits : null; }
  function openCount(pl) { var n = 0; for (var i = 0; i < SLOTS; i++) if (pl.open[i] && pl.open[i] !== X) n++; return n; }

  return {
    SLOTS: SLOTS, MIN_LEN: MIN_LEN, X: X, KANA: KANA, ABC: ABC,
    alphabet: alphabet, isLetter: isLetter, normalize: normalize, errorText: errorText, cleanDisplay: cleanDisplay,
    clampLen: clampLen, pad: pad, wordLen: wordLen, validCells: validCells,
    sha256: sha256, commitHash: commitHash,
    newGame: newGame, setReady: setReady, canDeclare: canDeclare, declare: declare, answerFor: answerFor, answer: answer,
    answered: answered, resolve: resolve, forfeit: forfeit, reveal: reveal, checkWord: checkWord, publicView: publicView,
    alive: alive, nextAlive: nextAlive, hiddenCount: hiddenCount, hitsOf: hitsOf, openCount: openCount
  };
});

/* クリプティッド — the rules. Pure and deterministic: the app, the CPU worker and the online host all use this file.
   A game state is plain JSON. apply(state, owner, action) checks an action, changes the state and returns the events
   that happened (for the animation and the log). viewFor(state, owner) strips everything that owner may not see.

   Setup (as the official app does it): six map tiles in random order and turn, structures on random spaces, then one
   clue per player such that exactly one space fits every clue and every clue is needed (drop any one clue and more
   than one space would fit). Clues are never identical. */
(function (root, factory) {
  var D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.CRY_DATA;
  var api = factory(D);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRY_ENG = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis, function (D) {
  'use strict';

  var W = D.W, N = D.N, CLUES = D.CLUES;

  /* ---------------------------------------------------------------- random */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rint(rng, n) { return Math.floor(rng() * n); }
  function shuffle(rng, a) { for (var i = a.length - 1; i > 0; i--) { var j = rint(rng, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------------------------------------------------------- 108-bit sets as 4 x uint32 */
  function popc(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
  function bsCount(a) { return popc(a[0]) + popc(a[1]) + popc(a[2]) + popc(a[3]); }
  function bsAnd(a, b) { var o = new Uint32Array(4); o[0] = a[0] & b[0]; o[1] = a[1] & b[1]; o[2] = a[2] & b[2]; o[3] = a[3] & b[3]; return o; }
  function bsFirst(a) { for (var w = 0; w < 4; w++) if (a[w]) return w * 32 + (31 - Math.clz32(a[w] & -a[w])); return -1; }
  function bsFromArr(arr) { var b = new Uint32Array(4); for (var h = 0; h < N; h++) if (arr[h]) b[h >>> 5] |= (1 << (h & 31)); return b; }
  var ALL = (function () { var a = new Uint8Array(N); a.fill(1); return bsFromArr(a); })();

  /* ---------------------------------------------------------------- board */
  // spec = { tiles: [{ id: 1..6, flip: bool } x 6 slots: 0 top-left, 1 top-right, 2 middle-left, ... 5 bottom-right],
  //          structs: [{ h, type: 'stone'|'shack', color }] }
  function buildBoard(spec) {
    var terrain = new Int8Array(N), animal = new Int8Array(N), struct = new Int8Array(N).fill(-1), slot = new Int8Array(N), numHex = [];
    for (var s = 0; s < 6; s++) {
      var t = spec.tiles[s], tile = D.TILES[t.id], tc = s % 2, tr = (s / 2) | 0;
      for (var r = 0; r < 3; r++) for (var c = 0; c < 6; c++) {
        var x = tc * 6 + (t.flip ? 5 - c : c), y = tr * 3 + (t.flip ? 2 - r : r), h = y * W + x;
        terrain[h] = D.TERRAIN_CODE[tile.t[r][c]];
        animal[h] = D.ANIMAL_CODE[tile.a[r][c]];
        slot[h] = s;
        if (r === 0 && c === 0) numHex[s] = h;
      }
    }
    spec.structs.forEach(function (st, i) { struct[st.h] = i; });
    return { terrain: terrain, animal: animal, struct: struct, slot: slot, numHex: numHex, structs: spec.structs };
  }
  function randomSpec(rng, advanced) {
    var ids = shuffle(rng, [1, 2, 3, 4, 5, 6]);
    var tiles = ids.map(function (id) { return { id: id, flip: rng() < 0.5 }; });
    var colors = advanced ? ['white', 'green', 'blue', 'black'] : ['white', 'green', 'blue'];
    var used = {}, structs = [];
    colors.forEach(function (color) {
      ['stone', 'shack'].forEach(function (type) {
        var h; do { h = rint(rng, N); } while (used[h]);
        used[h] = 1;
        structs.push({ h: h, type: type, color: color });
      });
    });
    return { tiles: tiles, structs: structs };
  }
  function specKey(spec) {
    return spec.tiles.map(function (t) { return t.id + (t.flip ? 'f' : 'n'); }).join('') + '|' +
      spec.structs.map(function (s) { return s.type + s.color + s.h; }).join(',');
  }

  function isSource(c, b, h) {
    switch (c.kind) {
      case 'nearT': return b.terrain[h] === c.t;
      case 'nearAnimal': return b.animal[h] !== 0;
      case 'nearA': return b.animal[h] === c.a;
      case 'nearS': return b.struct[h] >= 0 && b.structs[b.struct[h]].type === c.s;
      case 'nearC': return b.struct[h] >= 0 && b.structs[b.struct[h]].color === c.c;
    }
    return false;
  }
  function mk(arr) { var n = 0; for (var h = 0; h < N; h++) n += arr[h]; return { arr: arr, bs: bsFromArr(arr), n: n }; }
  function computeMasks(b) {
    var masks = new Array(CLUES.length);
    for (var i = 0; i < D.POS; i++) {
      var c = CLUES[i], arr = new Uint8Array(N), h;
      if (c.kind === 'on') {
        for (h = 0; h < N; h++) arr[h] = (b.terrain[h] === c.a || b.terrain[h] === c.b) ? 1 : 0;
      } else {
        var src = [];
        for (h = 0; h < N; h++) if (isSource(c, b, h)) src.push(h);
        for (h = 0; h < N; h++) for (var j = 0; j < src.length; j++) if (D.dist(h, src[j]) <= c.dist) { arr[h] = 1; break; }
      }
      masks[i] = mk(arr);
      var neg = new Uint8Array(N);
      for (h = 0; h < N; h++) neg[h] = arr[h] ? 0 : 1;
      masks[i + D.POS] = mk(neg);
    }
    return masks;
  }
  var cache = new Map();
  function context(spec) {
    var key = specKey(spec), c = cache.get(key);
    if (!c) {
      var board = buildBoard(spec);
      c = { key: key, board: board, masks: computeMasks(board) };
      cache.set(key, c);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
    }
    return c;
  }

  // Clues that can be dealt in this mode (normal: positive clues without black; advanced: all 48),
  // minus any kind a revealed hint has ruled out.
  function poolFor(advanced, hintKey) {
    var out = [];
    for (var i = 0; i < CLUES.length; i++) {
      var c = CLUES[i];
      if (!advanced && c.adv) continue;
      if (hintKey && D.hintCovers(hintKey, i)) continue;
      out.push(i);
    }
    return out;
  }

  /* ---------------------------------------------------------------- dealing a puzzle */
  function allNeeded(list, masks) {
    for (var j = 0; j < list.length; j++) {
      var cur = ALL;
      for (var k = 0; k < list.length; k++) if (k !== j) cur = bsAnd(cur, masks[list[k]].bs);
      if (bsCount(cur) < 2) return false;
    }
    return true;
  }
  function findClues(rng, masks, pool, target, n) {
    var elig = pool.filter(function (i) { var m = masks[i]; return m.arr[target] && m.n > 1 && m.n < N; });
    if (elig.length < n) return null;
    shuffle(rng, elig);
    var chosen = [], found = null, nodes = 0;
    (function rec(start, cur, curN) {
      if (found || ++nodes > 25000) return;
      if (chosen.length === n) {
        if (curN === 1 && allNeeded(chosen, masks)) found = chosen.slice();
        return;
      }
      for (var k = start; k <= elig.length - (n - chosen.length); k++) {
        var nx = bsAnd(cur, masks[elig[k]].bs), nn = bsCount(nx);
        if (nn === curN) continue;                         // adds nothing: it could never be needed
        if (nn === 1 && chosen.length + 1 < n) continue;   // already unique before the last clue
        chosen.push(elig[k]);
        rec(k + 1, nx, nn);
        chosen.pop();
        if (found) return;
      }
    })(0, ALL, N);
    return found;
  }
  function makeSetup(rng, advanced, nClues) {
    for (var attempt = 0; attempt < 600; attempt++) {
      var spec = randomSpec(rng, advanced), ctx = context(spec), pool = poolFor(advanced);
      for (var t = 0; t < 30; t++) {
        var target = rint(rng, N), res = findClues(rng, ctx.masks, pool, target, nClues);
        if (!res) continue;
        // advanced games should usually include at least one "not" clue
        if (advanced && !res.some(function (i) { return CLUES[i].neg; }) && rng() < 0.65) continue;
        return { spec: spec, clues: res, target: target, masks: ctx.masks };
      }
    }
    throw new Error('cryptid: no setup found');
  }
  // Two-player variant: four clues, two per player. Pair them so both players start with a similar amount of information.
  function pairClues(rng, clues, masks) {
    var pairings = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]], best = null, bestD = 1e9;
    shuffle(rng, pairings).forEach(function (p) {
      var a = bsCount(bsAnd(masks[clues[p[0]]].bs, masks[clues[p[1]]].bs));
      var b = bsCount(bsAnd(masks[clues[p[2]]].bs, masks[clues[p[3]]].bs));
      if (Math.abs(a - b) < bestD) { bestD = Math.abs(a - b); best = p; }
    });
    var out = best.map(function (k) { return clues[k]; });
    return rng() < 0.5 ? out : [out[2], out[3], out[0], out[1]];
  }
  function pickHint(rng, clues) {
    var ok = D.HINTS.filter(function (hh) { return clues.every(function (i) { return !hh.covers(CLUES[i]); }); });
    if (!ok.length) return null;
    var tot = ok.reduce(function (s, hh) { return s + hh.w; }, 0), r = rng() * tot;
    for (var i = 0; i < ok.length; i++) { r -= ok[i].w; if (r < 0) return ok[i].key; }
    return ok[ok.length - 1].key;
  }

  /* ---------------------------------------------------------------- game state */
  // o = { advanced, players: [{ name, kind: 'human'|'cpu'|'remote', level, colors: [color] or [c1, c2] }], first, seed }
  function newGame(o) {
    var seed = (o.seed >>> 0) || ((Math.random() * 4294967296) >>> 0) || 1;
    var rng = mulberry32(seed), k = o.players.length, twoP = k === 2;
    if (k < 2 || k > 5) throw new Error('players');
    var seats = [], ownerSeats = [];
    o.players.forEach(function (p, oi) {
      ownerSeats[oi] = [];
      for (var j = 0; j < (twoP ? 2 : 1); j++) { ownerSeats[oi].push(seats.length); seats.push({ owner: oi, color: p.colors[j] }); }
    });
    var setup = makeSetup(rng, !!o.advanced, seats.length);
    var clues = twoP ? pairClues(rng, setup.clues, setup.masks) : shuffle(rng, setup.clues.slice());
    var first = (o.first >= 0 && o.first < k) ? o.first : rint(rng, k);
    var discs = []; for (var h = 0; h < N; h++) discs.push([]);
    var cube = []; for (h = 0; h < N; h++) cube.push(-1);
    return {
      v: 1, seed: seed, advanced: !!o.advanced, twoP: twoP, k: k,
      players: o.players.map(function (p) { return { name: p.name, kind: p.kind, level: p.level || 0 }; }),
      seats: seats, ownerSeats: ownerSeats,
      spec: setup.spec, clues: clues, target: setup.target,
      hint: pickHint(rng, setup.clues), hintShown: false,
      cube: cube, discs: discs,
      phase: 'setup', setupDone: 0, first: first,
      pending: { k: 'setup', o: first },
      winner: -1, turn: 0, evn: 0, log: []
    };
  }

  /* ---------------------------------------------------------------- rule checks */
  function masksOf(st) { return context(st.spec).masks; }
  function fits(st, s, h) { return !!masksOf(st)[st.clues[s]].arr[h]; }
  function hasCube(st, h) { return st.cube[h] >= 0; }
  function seatHasPiece(st, s, h) { return st.cube[h] === s || st.discs[h].indexOf(s) >= 0; }
  function ownerHasDisc(st, o, h) { return st.ownerSeats[o].some(function (s) { return st.discs[h].indexOf(s) >= 0; }); }
  function inRange(h) { return h === (h | 0) && h >= 0 && h < N; }
  // seats of owner o that may put a cube on h (the space can't be the habitat by that seat's clue)
  function cubeSeats(st, o, h) {
    if (!inRange(h) || hasCube(st, h)) return [];
    return st.ownerSeats[o].filter(function (s) { return !fits(st, s, h) && !seatHasPiece(st, s, h); });
  }
  function legalCubes(st, o) {
    var out = [];
    for (var h = 0; h < N; h++) { var ss = cubeSeats(st, o, h); if (ss.length) out.push({ h: h, seats: ss }); }
    return out;
  }
  function extraDiscOK(st, s, h, searched) {
    return inRange(h) && h !== searched && !hasCube(st, h) && fits(st, s, h) && st.discs[h].indexOf(s) < 0;
  }
  function legalExtraDiscs(st, s, searched) {
    var out = [];
    for (var h = 0; h < N; h++) if (extraDiscOK(st, s, h, searched)) out.push(h);
    return out;
  }
  function canAsk(st, o, to, h) {
    var p = st.pending;
    return !!p && p.k === 'turn' && p.o === o && st.phase === 'play' && to !== o && to >= 0 && to < st.k &&
      inRange(h) && !hasCube(st, h) && !ownerHasDisc(st, to, h);
  }
  function canSearch(st, o, h) {
    var p = st.pending;
    return !!p && p.k === 'turn' && p.o === o && st.phase === 'play' && inRange(h) && !hasCube(st, h) &&
      st.ownerSeats[o].every(function (s) { return fits(st, s, h); });
  }
  function seatsOf(st, o) { return st.ownerSeats[o].slice(); }

  /* ---------------------------------------------------------------- applying actions */
  function emit(st, ev, e) { e.n = ++st.evn; ev.push(e); st.log.push(e); }
  function putCube(st, ev, s, h, why) { st.cube[h] = s; emit(st, ev, { e: 'cube', s: s, h: h, why: why }); }
  function putDisc(st, ev, s, h, why) { st.discs[h].push(s); emit(st, ev, { e: 'disc', s: s, h: h, why: why }); }

  function endTurn(st, o, ev) {
    st.turn++;
    var nx = (o + 1) % st.k;
    st.pending = { k: 'turn', o: nx };
    emit(st, ev, { e: 'turn', o: nx });
  }
  function needPenalty(st, o, ev) {
    if (legalCubes(st, o).length) { st.pending = { k: 'penalty', o: o }; emit(st, ev, { e: 'penalty', o: o }); }
    else { emit(st, ev, { e: 'noPenalty', o: o }); endTurn(st, o, ev); }
  }
  // The answering owner's seats that still have to say something about h. Returns 'disc', 'cube', 'pass' or 'choice'.
  function answer(st, to, h, ev) {
    var seats = st.ownerSeats[to].filter(function (s) { return st.discs[h].indexOf(s) < 0; });
    if (!seats.length) {
      st.ownerSeats[to].forEach(function (s) { emit(st, ev, { e: 'pass', s: s, h: h }); });
      return 'pass';
    }
    var yes = seats.filter(function (s) { return fits(st, s, h); }), no = seats.filter(function (s) { return !fits(st, s, h); });
    if (!no.length) { yes.forEach(function (s) { putDisc(st, ev, s, h, 'answer'); }); return 'disc'; }
    if (no.length === 1) { putCube(st, ev, no[0], h, 'answer'); return 'cube'; }
    return 'choice'; // two-player variant: both clues say no; the player secretly picks which colour's cube to place
  }
  function resolveSearch(st, o, h, ev) {
    for (var i = 1; i < st.k; i++) {
      var p = (o + i) % st.k, r = answer(st, p, h, ev);
      if (r === 'pass' || r === 'disc') continue;
      if (r === 'choice') { st.pending = { k: 'color', o: p, h: h, by: o, t: 's' }; emit(st, ev, { e: 'choose', o: p, h: h }); return; }
      emit(st, ev, { e: 'stop', o: o, h: h, by: p });
      needPenalty(st, o, ev);
      return;
    }
    st.phase = 'over'; st.winner = o; st.pending = null;
    emit(st, ev, { e: 'win', o: o, h: h });
  }

  function apply(st, o, act) {
    var ev = [], p = st.pending;
    function fail(err) { return { ok: false, err: err, ev: [] }; }
    if (st.phase === 'over' || !p) return fail('over');
    if (p.o !== o) return fail('notyou');
    if (!act || typeof act !== 'object') return fail('bad');
    var h = act.h, ss, s;

    if (p.k === 'setup' || p.k === 'penalty') {
      if (act.t !== 'cube') return fail('bad');
      ss = cubeSeats(st, o, h);
      if (!ss.length) return fail('illegal');
      s = (act.s != null && ss.indexOf(act.s) >= 0) ? act.s : (ss.length === 1 ? ss[0] : -1);
      if (s < 0) return fail('color');
      putCube(st, ev, s, h, p.k === 'setup' ? 'setup' : 'penalty');
      if (p.k === 'penalty') { endTurn(st, o, ev); return { ok: true, ev: ev }; }
      st.setupDone++;
      if (st.setupDone >= 2 * st.k) {
        st.phase = 'play';
        st.pending = { k: 'turn', o: st.first };
        emit(st, ev, { e: 'turn', o: st.first });
      } else {
        st.pending = { k: 'setup', o: (o + 1) % st.k };
        emit(st, ev, { e: 'setupTurn', o: st.pending.o });
      }
      return { ok: true, ev: ev };
    }

    if (p.k === 'turn') {
      if (act.t === 'question') {
        if (!canAsk(st, o, act.to, h)) return fail('illegal');
        emit(st, ev, { e: 'ask', o: o, to: act.to, h: h });
        var r = answer(st, act.to, h, ev);
        if (r === 'choice') { st.pending = { k: 'color', o: act.to, h: h, by: o, t: 'q' }; emit(st, ev, { e: 'choose', o: act.to, h: h }); return { ok: true, ev: ev }; }
        if (r === 'cube') needPenalty(st, o, ev); else endTurn(st, o, ev);
        return { ok: true, ev: ev };
      }
      if (act.t === 'search') {
        if (!canSearch(st, o, h)) return fail('illegal');
        emit(st, ev, { e: 'search', o: o, h: h });
        var need = [];
        st.ownerSeats[o].forEach(function (s2) {
          if (st.discs[h].indexOf(s2) >= 0) need.push(s2); else putDisc(st, ev, s2, h, 'search');
        });
        need = need.filter(function (s2) {
          if (legalExtraDiscs(st, s2, h).length) return true;
          emit(st, ev, { e: 'noExtra', s: s2, h: h });
          return false;
        });
        if (need.length) { st.pending = { k: 'extra', o: o, h: h, seats: need }; emit(st, ev, { e: 'extra', o: o, h: h, seats: need.slice() }); return { ok: true, ev: ev }; }
        resolveSearch(st, o, h, ev);
        return { ok: true, ev: ev };
      }
      return fail('bad');
    }

    if (p.k === 'extra') {
      if (act.t !== 'disc') return fail('bad');
      s = act.s != null ? act.s : p.seats[0];
      if (p.seats.indexOf(s) < 0 || !extraDiscOK(st, s, h, p.h)) return fail('illegal');
      putDisc(st, ev, s, h, 'extra');
      p.seats = p.seats.filter(function (x) { return x !== s; });
      if (p.seats.length) return { ok: true, ev: ev };
      var searched = p.h;
      st.pending = { k: 'resolving', o: o };
      resolveSearch(st, o, searched, ev);
      return { ok: true, ev: ev };
    }

    if (p.k === 'color') {
      if (act.t !== 'color') return fail('bad');
      s = act.s;
      if (st.ownerSeats[o].indexOf(s) < 0 || hasCube(st, p.h) || fits(st, s, p.h) || st.discs[p.h].indexOf(s) >= 0) return fail('illegal');
      putCube(st, ev, s, p.h, 'answer');
      if (p.t === 's') emit(st, ev, { e: 'stop', o: p.by, h: p.h, by: o });
      needPenalty(st, p.by, ev);
      return { ok: true, ev: ev };
    }
    return fail('bad');
  }

  // Everyone at the table agreed to take the hint ("追加の手がかり").
  function revealHint(st) {
    if (st.hintShown || !st.hint || st.phase === 'over') return [];
    st.hintShown = true;
    var ev = [];
    emit(st, ev, { e: 'hint', key: st.hint });
    return ev;
  }

  /* ---------------------------------------------------------------- what one player may see */
  function viewFor(st, o) {
    var v = {
      v: st.v, advanced: st.advanced, twoP: st.twoP, k: st.k, me: o,
      players: st.players, seats: st.seats, ownerSeats: st.ownerSeats, spec: st.spec,
      cube: st.cube.slice(), discs: st.discs.map(function (d) { return d.slice(); }),
      phase: st.phase, setupDone: st.setupDone, first: st.first,
      pending: st.pending ? JSON.parse(JSON.stringify(st.pending)) : null,
      winner: st.winner, turn: st.turn, evn: st.evn,
      hasHint: !!st.hint, hintShown: st.hintShown, hint: st.hintShown ? st.hint : null,
      clues: st.clues.map(function (c, s) { return (st.phase === 'over' || (o >= 0 && st.seats[s].owner === o)) ? c : -1; }),
      target: st.phase === 'over' ? st.target : -1
    };
    return v;
  }

  // Clues still possible for seat s, judging only by that seat's pieces on the board (what everyone can see).
  function publicCandidates(view, s, hintKey) {
    var masks = context(view.spec).masks, pool = poolFor(view.advanced, hintKey);
    var dh = [], ch = [];
    for (var h = 0; h < N; h++) {
      if (view.cube[h] === s) ch.push(h);
      if (view.discs[h].indexOf(s) >= 0) dh.push(h);
    }
    return pool.filter(function (i) {
      var a = masks[i].arr;
      for (var j = 0; j < dh.length; j++) if (!a[dh[j]]) return false;
      for (j = 0; j < ch.length; j++) if (a[ch[j]]) return false;
      return true;
    });
  }

  return {
    mulberry32: mulberry32, shuffle: shuffle, rint: rint,
    popc: popc, bsCount: bsCount, bsAnd: bsAnd, bsFirst: bsFirst, bsFromArr: bsFromArr, ALL: ALL,
    buildBoard: buildBoard, randomSpec: randomSpec, specKey: specKey, context: context, poolFor: poolFor,
    makeSetup: makeSetup, newGame: newGame, apply: apply, revealHint: revealHint, viewFor: viewFor,
    fits: fits, cubeSeats: cubeSeats, legalCubes: legalCubes, legalExtraDiscs: legalExtraDiscs, extraDiscOK: extraDiscOK,
    canAsk: canAsk, canSearch: canSearch, seatsOf: seatsOf, ownerHasDisc: ownerHasDisc, hasCube: hasCube,
    publicCandidates: publicCandidates, allNeeded: allNeeded
  };
});

/* クォ・ヴァディス — the rules (Reiner Knizia; Hans im Glück 1992, AMIGO 2005). No DOM: runs in the page, in the CPU
   worker and under node for the tests. The state holds everything (including the order of the face-down laurels);
   viewFor() makes the copy one player may see.

   A turn is one of three actions:
     place   a senator from your supply onto a free seat of one of the four lowest committees
     move    one of your senators up a path into the next committee (it must have a free seat). Leaving a 1-seat
             committee is free; leaving a 3-seat one needs the consent of exactly one other senator sitting there,
             a 5-seat one of exactly two (your own senators consent for free). With Caesar on the path no consent is
             needed, but his laurel cannot be taken. Otherwise the mover takes the laurel on the path and a new one is
             drawn face up. Every consent from another colour earns its owner an "I" laurel (while they last).
             Deals that can be done this turn are binding: payments listed in the move are made at once.
             Taking a "II Caesar" laurel lets the mover (or whoever the deal names) move Caesar afterwards.
     caesar  move Caesar onto any other laurel.
   The game ends the moment the fifth senator enters the Senate. Only players with a senator in the Senate can win;
   among them the most laurels wins, ties going to whoever reached the Senate first. */
(function (root, factory) {
  var D = root && root.QV_DATA ? root.QV_DATA : (typeof require === 'function' ? require('./data.js') : null);
  var api = factory(D);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QV_ENG = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (D) {
  'use strict';
  var COM = D.COM, OUT = D.OUT, PATH = D.PATH;
  var NS = D.SENATORS;

  function mulberry32(seed) {
    var a = seed >>> 0 || 0x9e3779b9;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rnd) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function owner(sid) { return sid < 0 ? -1 : Math.floor(sid / NS); }

  /* ------------------------------------------------------------------ setting up */
  /* cfg: { players: [{ name, color, kind, level }], seed, first, opts: { oneLimit, open, reveal } } */
  function newGame(cfg) {
    var n = cfg.players.length;
    if (n < 3 || n > 5) throw new Error('3 to 5 players');
    var seed = (cfg.seed >>> 0) || 1;
    var rnd = mulberry32(seed);
    var bag = [];
    D.TILE_SET.forEach(function (t) { for (var i = 0; i < t.n; i++) bag.push({ id: bag.length, v: t.v, c: !!t.c }); });
    shuffle(bag, rnd);
    var occ = {};
    D.COMMITTEES.forEach(function (c) { occ[c.id] = []; for (var i = 0; i < c.seats; i++) occ[c.id].push(-1); });
    var spaces = {};
    D.LAUREL_PATHS.forEach(function (pid) { spaces[pid] = bag.pop(); });
    var opts = { oneLimit: !!(cfg.opts && cfg.opts.oneLimit), open: !!(cfg.opts && cfg.opts.open), reveal: !!(cfg.opts && cfg.opts.reveal) };
    var first = typeof cfg.first === 'number' && cfg.first >= 0 && cfg.first < n ? cfg.first : Math.floor(rnd() * n);
    return {
      v: 1, n: n, seed: seed, opts: opts,
      players: cfg.players.map(function (p, i) {
        return { name: String(p.name || ('P' + (i + 1))), color: p.color || D.PLAYER_COLORS[i].key, kind: p.kind || 'cpu', level: p.level || 0,
          left: NS, pts: 0, got: [], ones: 0, paid: 0, recv: 0 };
      }),
      occ: occ, senate: [], spaces: spaces, caesar: D.CAESAR_START, bag: bag,
      ones: opts.oneLimit ? D.ONE_LIMIT[n] : D.ONES,
      turn: first, first: first, turnNo: 1, phase: 'play', bonus: null,
      promises: [], lastMove: 0, lastSenate: 0, lastScore: 0, over: null
    };
  }

  /* ------------------------------------------------------------------ looking at the board */
  function seatsOf(st, cid) { return cid === 'S' ? st.senate : st.occ[cid]; }
  function freeSeat(st, cid) {
    if (cid === 'S') return st.senate.length < 5 ? st.senate.length : -1;
    return st.occ[cid].indexOf(-1);
  }
  function countIn(st, cid, p) { var a = seatsOf(st, cid), k = 0; for (var i = 0; i < a.length; i++) if (a[i] >= 0 && owner(a[i]) === p) k++; return k; }
  function senateCount(st, p) { return countIn(st, 'S', p); }
  /* every senator of p on the board: { sid, cid, seat } */
  function senatorsOf(st, p) {
    var out = [];
    D.COMMITTEES.forEach(function (c) { st.occ[c.id].forEach(function (sid, seat) { if (sid >= 0 && owner(sid) === p) out.push({ sid: sid, cid: c.id, seat: seat }); }); });
    st.senate.forEach(function (sid, seat) { if (owner(sid) === p) out.push({ sid: sid, cid: 'S', seat: seat }); });
    return out;
  }
  function placeTargets(st, p) {
    if (st.players[p].left <= 0) return [];
    return D.ENTRY.filter(function (cid) { return freeSeat(st, cid) >= 0; });
  }
  function caesarTargets(st) { return D.LAUREL_PATHS.filter(function (pid) { return pid !== st.caesar; }); }

  /* Can p move a senator from `from` to `to`? Returns what it would take:
     { ok, why, path, free, caesar, laurel (tile or null), need, own, ext, avail: { q: votes } } */
  function moveInfo(st, p, from, to) {
    var pid = from + '-' + to, path = PATH[pid];
    var info = { ok: false, why: '', from: from, to: to, path: pid, free: false, caesar: false, laurel: null, need: 0, own: 0, ext: 0, avail: {} };
    if (!path) { info.why = 'nopath'; return info; }
    if (from === 'S' || countIn(st, from, p) === 0) { info.why = 'nosenator'; return info; }
    if (freeSeat(st, to) < 0) { info.why = 'full'; return info; }
    var c = COM[from];
    info.ok = true;
    if (c.seats === 1) { info.free = true; return info; }
    if (st.caesar === pid) { info.caesar = true; info.free = true; return info; }
    info.laurel = st.spaces[pid] ? { id: st.spaces[pid].id, v: st.spaces[pid].v, c: st.spaces[pid].c } : null;
    var need = c.seats === 3 ? 1 : 2;
    var others = st.occ[from].filter(function (sid) { return sid >= 0; }).map(owner);
    others.splice(others.indexOf(p), 1);                      // the senator that moves does not vote
    var own = others.filter(function (q) { return q === p; }).length;
    info.need = need; info.own = Math.min(own, need); info.ext = Math.max(0, need - own);
    var total = 0;
    others.forEach(function (q) { if (q !== p) { info.avail[q] = (info.avail[q] || 0) + 1; total++; } });
    if (info.ext === 0) { info.free = true; return info; }
    if (total < info.ext) { info.ok = false; info.why = 'fewvoters'; }
    return info;
  }
  /* every move of p, possible or not (the page explains the impossible ones) */
  function moveOptions(st, p) {
    var out = [], seen = {};
    senatorsOf(st, p).forEach(function (s) {
      if (s.cid === 'S' || seen[s.cid]) return;
      seen[s.cid] = 1;
      (OUT[s.cid] || []).forEach(function (path) { out.push(moveInfo(st, p, s.cid, path.to)); });
    });
    return out;
  }
  function budget(st, p, info) { return st.players[p].pts + (info && info.laurel ? info.laurel.v : 0); }

  /* ------------------------------------------------------------------ actions */
  function nextTurn(st, ev) {
    st.turn = (st.turn + 1) % st.n;
    st.turnNo++;
    ev.push({ e: 'turn', p: st.turn, no: st.turnNo });
  }
  function finish(st, ev) {
    st.phase = 'over';
    st.over = result(st);
    ev.push({ e: 'over', result: st.over });
  }
  function err(code) { return { ok: false, err: code }; }
  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

  /* apply(st, p, act) changes st and returns { ok: true, ev: [...] } or { ok: false, err } */
  function apply(st, p, act) {
    if (!act || typeof act !== 'object') return err('bad');
    if (st.phase === 'over') return err('over');
    var ev = [];
    if (st.phase === 'bonus') {
      if (act.t !== 'bonus') return err('bonus');
      if (p !== st.bonus.by) return err('turn');
      if (act.to !== null && act.to !== undefined) {
        if (D.LAUREL_PATHS.indexOf(act.to) < 0 || act.to === st.caesar) return err('caesar');
        ev.push({ e: 'caesar', p: p, from: st.caesar, to: act.to, bonus: true, mover: st.bonus.mover });
        st.caesar = act.to;
      } else ev.push({ e: 'nobonus', p: p });
      st.phase = 'play'; st.bonus = null;
      nextTurn(st, ev);
      return { ok: true, ev: ev };
    }
    if (p !== st.turn) return err('turn');
    var pl = st.players[p];

    if (act.t === 'place') {
      if (pl.left <= 0) return err('nosupply');
      if (!COM[act.c] || !COM[act.c].entry) return err('notentry');
      var seat = freeSeat(st, act.c);
      if (seat < 0) return err('full');
      var sid = p * NS + (NS - pl.left);
      st.occ[act.c][seat] = sid; pl.left--;
      st.lastMove = st.turnNo;
      ev.push({ e: 'place', p: p, sid: sid, c: act.c, seat: seat });
      nextTurn(st, ev);
      return { ok: true, ev: ev };
    }

    if (act.t === 'caesar') {
      if (D.LAUREL_PATHS.indexOf(act.to) < 0 || act.to === st.caesar) return err('caesar');
      ev.push({ e: 'caesar', p: p, from: st.caesar, to: act.to, bonus: false });
      st.caesar = act.to;
      nextTurn(st, ev);
      return { ok: true, ev: ev };
    }

    if (act.t === 'move') {
      var info = moveInfo(st, p, act.from, act.to);
      if (!info.ok) return err(info.why || 'move');
      var votes = {}, nv = 0, voters = [];
      if (!info.free) {
        var vs = act.votes || {};
        for (var k in vs) {
          var q = +k, x = vs[k];
          if (!isInt(q) || q === p || q < 0 || q >= st.n) return err('voter');
          if (!isInt(x) || x < 0) return err('votes');
          if (x === 0) continue;
          if (x > (info.avail[q] || 0)) return err('votes');
          votes[q] = x; nv += x; voters.push(q);
        }
        if (nv !== info.ext) return err('votes');
      }
      var pay = {}, total = 0;
      var ps = act.pay || {};
      for (var k2 in ps) {
        var q2 = +k2, x2 = ps[k2];
        if (!isInt(x2) || x2 < 0) return err('pay');
        if (x2 === 0) continue;
        if (voters.indexOf(q2) < 0) return err('pay');
        pay[q2] = x2; total += x2;
      }
      if (total > budget(st, p, info)) return err('afford');
      var caesarBy = p;
      if (info.laurel && info.laurel.c && act.caesarBy !== undefined && act.caesarBy !== null) {
        if (act.caesarBy !== p && voters.indexOf(act.caesarBy) < 0) return err('caesarBy');
        caesarBy = act.caesarBy;
      }
      // the senator leaves (the one on the seat asked for, if any)
      var row = st.occ[act.from], fromSeat = -1;
      if (isInt(act.seat) && row[act.seat] >= 0 && owner(row[act.seat]) === p) fromSeat = act.seat;
      else for (var i = 0; i < row.length; i++) if (row[i] >= 0 && owner(row[i]) === p) { fromSeat = i; break; }
      var msid = row[fromSeat];
      row[fromSeat] = -1;
      var toSeat = freeSeat(st, act.to);
      if (act.to === 'S') st.senate.push(msid); else st.occ[act.to][toSeat] = msid;
      st.lastMove = st.turnNo;
      ev.push({ e: 'move', p: p, sid: msid, from: act.from, to: act.to, fromSeat: fromSeat, toSeat: toSeat, path: info.path,
        caesar: info.caesar, free: info.free, votes: votes, own: info.own });
      // the laurel on the path
      var tile = null;
      if (info.laurel && st.spaces[info.path]) {
        tile = st.spaces[info.path];
        pl.pts += tile.v; pl.got.push(tile.v);
        st.lastScore = st.turnNo;
        ev.push({ e: 'laurel', p: p, path: info.path, tile: tile });
        var nt = st.bag.length ? st.bag.pop() : null;
        st.spaces[info.path] = nt;
        ev.push({ e: 'refill', path: info.path, tile: nt });
      }
      // an "I" laurel for every consent of another colour
      voters.sort(function (a, b) { return a - b; }).forEach(function (q) {
        var got = 0;
        for (var j = 0; j < votes[q]; j++) if (st.ones > 0) { st.ones--; got++; }
        if (got) { st.players[q].pts += got; st.players[q].ones += got; st.lastScore = st.turnNo; }
        ev.push({ e: 'consent', p: q, mover: p, votes: votes[q], ones: got });
      });
      // what was agreed this turn
      Object.keys(pay).forEach(function (k3) {
        var q3 = +k3;
        pl.pts -= pay[q3]; pl.paid += pay[q3];
        st.players[q3].pts += pay[q3]; st.players[q3].recv += pay[q3];
        ev.push({ e: 'pay', from: p, to: q3, pts: pay[q3] });
      });
      // promises kept: a voter that owed this mover a consent has now given it
      voters.forEach(function (q) {
        st.promises.forEach(function (pr) { if (pr.from === q && pr.to === p && !pr.done) { pr.done = 'kept'; ev.push({ e: 'kept', from: q, to: p }); } });
      });
      (Array.isArray(act.promise) ? act.promise : []).forEach(function (q) {
        if (voters.indexOf(q) >= 0) { st.promises.push({ from: p, to: q, turn: st.turnNo, done: null }); ev.push({ e: 'promise', from: p, to: q }); }
      });
      if (act.to === 'S') {
        st.lastSenate = st.turnNo;
        ev.push({ e: 'senate', p: p, sid: msid, idx: st.senate.length - 1 });
        if (st.opts.reveal && st.senate.length <= 3) ev.push({ e: 'reveal', idx: st.senate.length, pts: st.players.map(function (x) { return x.pts; }) });
      }
      if (st.senate.length >= 5) { finish(st, ev); return { ok: true, ev: ev }; }
      if (tile && tile.c) {
        st.phase = 'bonus'; st.bonus = { by: caesarBy, mover: p };
        ev.push({ e: 'bonus', by: caesarBy, mover: p });
        return { ok: true, ev: ev };
      }
      nextTurn(st, ev);
      return { ok: true, ev: ev };
    }
    return err('bad');
  }

  /* a voter turned down someone it had promised to support (the host calls this when a request is refused) */
  function breakPromise(st, from, to) {
    var hit = null;
    st.promises.forEach(function (pr) { if (!hit && pr.from === from && pr.to === to && !pr.done) { pr.done = 'broken'; hit = pr; } });
    return hit ? [{ e: 'broken', from: from, to: to }] : [];
  }
  function owes(st, from, to) { return st.promises.some(function (pr) { return pr.from === from && pr.to === to && !pr.done; }); }

  /* ------------------------------------------------------------------ the end */
  function result(st) {
    var rows = st.players.map(function (pl, i) {
      var first = -1;
      st.senate.forEach(function (sid, k) { if (first < 0 && owner(sid) === i) first = k; });
      return { p: i, pts: pl.pts, senate: senateCount(st, i), qualified: first >= 0, first: first };
    });
    rows.sort(function (a, b) {
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
      if (a.pts !== b.pts) return b.pts - a.pts;
      if (a.qualified) return a.first - b.first;
      return a.p - b.p;
    });
    rows.forEach(function (r, k) { r.rank = k + 1; });
    return { rows: rows, winner: rows[0] && rows[0].qualified ? rows[0].p : -1 };
  }

  /* ------------------------------------------------------------------ what one player may see */
  function viewFor(st, me) {
    var v = clone(st);
    v.me = me;
    v.bag = st.bag.length;
    var open = st.opts.open || st.phase === 'over';
    v.players.forEach(function (pl, i) {
      pl.tiles = pl.got.length + pl.ones;
      if (i !== me && !open) { pl.pts = null; pl.got = null; pl.paid = null; pl.recv = null; }
    });
    return v;
  }

  return {
    mulberry32: mulberry32, shuffle: shuffle, clone: clone, owner: owner,
    newGame: newGame, apply: apply, viewFor: viewFor, result: result, breakPromise: breakPromise, owes: owes,
    freeSeat: freeSeat, countIn: countIn, senateCount: senateCount, senatorsOf: senatorsOf, seatsOf: seatsOf,
    placeTargets: placeTargets, caesarTargets: caesarTargets, moveInfo: moveInfo, moveOptions: moveOptions, budget: budget
  };
});

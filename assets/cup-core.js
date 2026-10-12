'use strict';
/* ==== COMPILE : 大会のルール（画面・通信なし。テストからも読む） ====
   トーナメント（3位決定戦つき）と総当たり。予想・表彰もここで計算する。 */
(() => {
  const MAX_PLAYERS = 16;
  const clean = (s, n = 18) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
  const copy = v => JSON.parse(JSON.stringify(v));

  function newCup({ id, title, format = 'knockout', cardSet = 'set1', controlEnabled = true, transport = 'local', hostId = null } = {}) {
    return {
      v: 2, id: id || 'cup-' + Math.random().toString(36).slice(2, 12), code: null, title: clean(title, 24) || '大会',
      format: format === 'league' ? 'league' : 'knockout', cardSet, controlEnabled: controlEnabled !== false, transport,
      status: 'entry', hostId, players: [], watchers: [], matches: [], rounds: 0, rev: 1, feed: [],
      createdAt: Date.now(), startedAt: 0, endedAt: 0, champion: null, reacts: {}
    };
  }
  function addPlayer(cup, p) {
    if (cup.players.some(x => x.id === p.id)) return cup.players.find(x => x.id === p.id);
    if (cup.status !== 'entry' || cup.players.length >= MAX_PLAYERS) return null;
    let name = clean(p.name) || 'PLAYER', n = 2;
    while (cup.players.some(x => x.name === name)) name = clean(p.name, 15) + n++;
    const player = { id: p.id, name, emoji: String(p.emoji || '🙂').slice(0, 4), title: clean(p.title, 16), seed: 0, online: p.online !== false };
    cup.players.push(player);
    return player;
  }
  function removePlayer(cup, id) {
    if (cup.status !== 'entry') return false;
    const i = cup.players.findIndex(p => p.id === id); if (i < 0) return false;
    cup.players.splice(i, 1); return true;
  }
  /* 標準的なシード配置（1-8, 4-5, 2-7, 3-6 …）。不戦勝どうしは当たらない */
  function seedOrder(size) {
    let order = [1];
    while (order.length < size) { const n = order.length * 2; order = order.flatMap(s => [s, n + 1 - s]); }
    return order;
  }
  function addMatch(cup, m) {
    const match = { id: m.id, round: m.round, slot: m.slot ?? 0, a: m.a ?? null, b: m.b ?? null, from: m.from || null, loserOf: !!m.loserOf, bronze: !!m.bronze,
      status: m.status || 'wait', winner: null, score: null, turns: 0, picks: {}, attempt: 0, startedAt: 0, endedAt: 0, walkover: false };
    cup.matches.push(match); return match;
  }
  function shuffle(list, rand = Math.random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  /* 抽選して組み合わせを作り、開幕する */
  function draw(cup, rand = Math.random) {
    if (cup.status !== 'entry' || cup.players.length < 3) return false;
    cup.players = shuffle(cup.players, rand);
    cup.players.forEach((p, i) => { p.seed = i + 1; });
    cup.matches = [];
    if (cup.format === 'knockout') {
      const size = 2 ** Math.ceil(Math.log2(cup.players.length)), R = Math.log2(size);
      cup.rounds = R;
      const order = seedOrder(size).map(s => cup.players[s - 1]?.id || null);
      for (let i = 0; i < size / 2; i++) addMatch(cup, { id: 'r1m' + i, round: 1, slot: i, a: order[2 * i], b: order[2 * i + 1] });
      for (let r = 2; r <= R; r++) for (let i = 0; i < size / 2 ** r; i++)
        addMatch(cup, { id: `r${r}m${i}`, round: r, slot: i, from: [`r${r - 1}m${2 * i}`, `r${r - 1}m${2 * i + 1}`] });
      if (cup.players.length >= 4) addMatch(cup, { id: 'bronze', round: R, slot: 1, from: [`r${R - 1}m0`, `r${R - 1}m1`], loserOf: true, bronze: true });
    } else {
      const ids = cup.players.map(p => p.id); if (ids.length % 2) ids.push(null);
      const n = ids.length; cup.rounds = n - 1;
      for (let r = 0; r < n - 1; r++) {
        let slot = 0;
        for (let i = 0; i < n / 2; i++) {
          const x = ids[i], y = ids[n - 1 - i];
          if (x && y) addMatch(cup, { id: `L${r + 1}m${slot}`, round: r + 1, slot: slot++, a: r % 2 ? y : x, b: r % 2 ? x : y, status: 'ready' });
        }
        ids.splice(1, 0, ids.pop());
      }
    }
    cup.status = 'running'; cup.startedAt = Date.now();
    propagate(cup); bump(cup);
    return true;
  }
  const final = m => m && (m.status === 'done' || m.status === 'bye');
  const loserOf = m => m.status === 'done' ? (m.winner === m.a ? m.b : m.a) : null;
  const byId = (cup, id) => cup.matches.find(m => m.id === id);
  function propagate(cup) {
    for (let guard = 0; guard < 64; guard++) {
      let changed = false;
      for (const m of cup.matches) {
        if (m.status !== 'wait') continue;
        if (m.from) {
          const feeders = m.from.map(id => byId(cup, id));
          if (!feeders.every(final)) continue;
          const [a, b] = feeders.map(f => m.loserOf ? loserOf(f) : f.winner);
          m.a = a; m.b = b;
          if (a && b) { m.status = 'ready'; changed = true; }
          else if (a || b) { m.status = 'bye'; m.winner = a || b; changed = true; }
          else { m.status = 'bye'; m.winner = null; changed = true; }
        } else {
          if (m.a && m.b) m.status = 'ready';
          else { m.status = 'bye'; m.winner = m.a || m.b; }
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (cup.status !== 'running') return;
    if (cup.format === 'knockout') {
      const last = cup.matches.find(m => m.round === cup.rounds && !m.bronze), bronze = cup.matches.find(m => m.bronze);
      if (final(last) && (!bronze || final(bronze))) finish(cup);
    } else if (cup.matches.every(final)) finish(cup);
  }
  function finish(cup) {
    cup.status = 'done'; cup.endedAt = Date.now();
    cup.champion = standings(cup)[0]?.id || null;
    feed(cup, 'champion', '🏆 ' + nameOf(cup, cup.champion) + ' が優勝！');
  }
  function busy(cup, pid) { return cup.matches.some(m => m.status === 'live' && (m.a === pid || m.b === pid)); }
  function canStart(cup, mid) {
    const m = byId(cup, mid);
    return !!m && cup.status === 'running' && m.status === 'ready' && !busy(cup, m.a) && !busy(cup, m.b);
  }
  function start(cup, mid) {
    if (!canStart(cup, mid)) return null;
    const m = byId(cup, mid);
    m.status = 'live'; m.startedAt = Date.now(); m.attempt++;
    feed(cup, 'start', '🔥 ' + nameOf(cup, m.a) + ' vs ' + nameOf(cup, m.b) + ' 開始！');
    bump(cup); return m;
  }
  function reset(cup, mid) {
    const m = byId(cup, mid); if (!m || m.status !== 'live') return false;
    m.status = 'ready'; m.startedAt = 0; bump(cup); return true;
  }
  function validScore(score, winnerIsA) {
    if (!Array.isArray(score) || score.length !== 2 || score.some(n => !Number.isInteger(n) || n < 0 || n > 3)) return false;
    const w = winnerIsA ? score[0] : score[1], l = winnerIsA ? score[1] : score[0];
    return w === 3 && l < 3;
  }
  function result(cup, mid, winner, score, turns = 0, { walkover = false } = {}) {
    const m = byId(cup, mid);
    if (!m || !['live', 'ready'].includes(m.status) || ![m.a, m.b].includes(winner)) return false;
    if (!walkover && (m.status !== 'live' || !validScore(score, winner === m.a))) return false;
    m.status = 'done'; m.winner = winner; m.walkover = !!walkover;
    m.score = walkover ? null : score.slice(); m.turns = walkover ? 0 : Math.max(0, Math.min(9999, Number(turns) || 0)); m.endedAt = Date.now();
    const votes = pickCounts(m), loser = winner === m.a ? m.b : m.a;
    const upset = !walkover && votes[winner === m.a ? 'b' : 'a'] > votes[winner === m.a ? 'a' : 'b'];
    m.upset = upset;
    feed(cup, 'result', (walkover ? '🏳 ' : '🏆 ') + nameOf(cup, winner) + (walkover ? ' の不戦勝' : ' が ' + nameOf(cup, loser) + ' に勝利！ ' + m.score[winner === m.a ? 0 : 1] + '-' + m.score[winner === m.a ? 1 : 0]));
    if (upset) feed(cup, 'upset', '😱 番狂わせ！ 予想を覆して ' + nameOf(cup, winner) + ' が勝ち上がり');
    propagate(cup); bump(cup); return true;
  }
  /* 予想：その試合に出ていない人だけ。序盤（3ターン目まで）は対戦中でも受け付ける */
  function canPick(cup, mid, pid, turn = 0) {
    const m = byId(cup, mid);
    if (!m || m.a === pid || m.b === pid || !m.a || !m.b) return false;
    if (m.status === 'ready') return true;
    return m.status === 'live' && turn <= 3;
  }
  function setPick(cup, mid, pid, side, turn = 0) {
    if (!['a', 'b'].includes(side) || !canPick(cup, mid, pid, turn)) return false;
    byId(cup, mid).picks[pid] = side; bump(cup); return true;
  }
  function pickCounts(m) {
    const out = { a: 0, b: 0 };
    for (const v of Object.values(m.picks || {})) if (v === 'a' || v === 'b') out[v]++;
    return out;
  }
  function predictionBoard(cup) {
    const people = [...cup.players, ...cup.watchers], rows = new Map(people.map(p => [p.id, { id: p.id, name: p.name, emoji: p.emoji, hits: 0, picks: 0, points: 0 }]));
    for (const m of cup.matches) {
      if (m.status !== 'done' || m.walkover) continue;
      const winSide = m.winner === m.a ? 'a' : 'b', counts = pickCounts(m), underdog = counts[winSide] < counts[winSide === 'a' ? 'b' : 'a'];
      for (const [pid, side] of Object.entries(m.picks || {})) {
        const r = rows.get(pid); if (!r) continue;
        r.picks++;
        if (side === winSide) { r.hits++; r.points += underdog ? 2 : 1; }
      }
    }
    return [...rows.values()].filter(r => r.picks > 0).sort((a, b) => b.points - a.points || b.hits - a.hits || a.picks - b.picks);
  }
  function standings(cup) {
    const rows = cup.players.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, title: p.title, seed: p.seed, wins: 0, losses: 0, played: 0, for: 0, against: 0, points: 0, reach: 0, h2h: 0 }));
    const row = id => rows.find(r => r.id === id);
    for (const m of cup.matches) {
      if (m.status !== 'done') continue;
      for (const [i, id] of [m.a, m.b].entries()) {
        const r = row(id); if (!r) continue;
        r.played++; r.reach = Math.max(r.reach, m.round + (m.bronze ? -0.5 : 0));
        if (m.score) { r.for += m.score[i]; r.against += m.score[1 - i]; }
        if (m.winner === id) { r.wins++; r.points += 3; } else r.losses++;
      }
    }
    for (const r of rows) r.diff = r.for - r.against;
    if (cup.format === 'league') {
      for (const r of rows) {
        const tied = rows.filter(x => x.points === r.points && x.diff === r.diff && x.id !== r.id).map(x => x.id);
        r.h2h = cup.matches.filter(m => m.status === 'done' && m.winner === r.id && tied.includes(m.winner === m.a ? m.b : m.a)).length;
      }
      const key = r => [r.points, r.diff, r.h2h];
      const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
      rows.sort((a, b) => cmp(a, b) || a.seed - b.seed);
      rows.forEach((r, i) => { r.rank = i && cmp(r, rows[i - 1]) === 0 ? rows[i - 1].rank : i + 1; });
      return rows;
    }
    // トーナメント：優勝→準優勝→3位決定戦→到達ラウンド
    const lastM = cup.matches.find(m => m.round === cup.rounds && !m.bronze), bronze = cup.matches.find(m => m.bronze);
    const place = new Map();
    if (lastM?.status === 'done') { place.set(lastM.winner, 1); place.set(loserOf(lastM), 2); }
    else if (lastM?.status === 'bye' && lastM.winner) place.set(lastM.winner, 1);
    if (bronze?.status === 'done') { place.set(bronze.winner, 3); place.set(loserOf(bronze), 4); }
    const score = r => place.has(r.id) ? 100 - place.get(r.id) : r.reach + (cup.status === 'done' ? 0 : r.wins * .01);
    rows.sort((a, b) => score(b) - score(a) || a.seed - b.seed);
    rows.forEach((r, i) => { r.rank = place.get(r.id) || (i && score(r) === score(rows[i - 1]) ? rows[i - 1].rank : i + 1); });
    return rows;
  }
  function roundLabel(cup, round, m) {
    if (m?.bronze) return '3位決定戦';
    if (cup.format === 'league') return '第' + round + '節';
    const fromEnd = cup.rounds - round;
    return fromEnd === 0 ? '決勝' : fromEnd === 1 ? '準決勝' : fromEnd === 2 ? '準々決勝' : round + '回戦';
  }
  /* 表彰：該当するものだけ */
  function awards(cup) {
    const out = [], done = cup.matches.filter(m => m.status === 'done' && !m.walkover && m.turns > 0), st = standings(cup);
    const add = (icon, title, pid, note) => { if (pid) out.push({ icon, title, pid, name: nameOf(cup, pid), note }); };
    if (cup.format === 'knockout') {
      add('🏆', '優勝', st.find(r => r.rank === 1)?.id, '');
      add('🥈', '準優勝', st.find(r => r.rank === 2)?.id, '');
      add('🥉', '3位', st.find(r => r.rank === 3)?.id, '');
    } else st.filter(r => r.rank <= 3).forEach(r => add(['🏆', '🥈', '🥉'][r.rank - 1], ['優勝', '準優勝', '3位'][r.rank - 1], r.id, r.wins + '勝' + r.losses + '敗'));
    if (done.length >= 2) {
      const fast = done.reduce((a, b) => b.turns < a.turns ? b : a), slow = done.reduce((a, b) => b.turns > a.turns ? b : a);
      add('⚡', '電撃決着賞', fast.winner, fast.turns + 'ターンで決着');
      if (slow !== fast) add('🛡', '死闘賞', slow.winner, slow.turns + 'ターンの激闘を制す');
    }
    const shutout = done.filter(m => m.score && Math.min(...m.score) === 0).pop();
    if (shutout) add('🧹', '完封賞', shutout.winner, '3-0 で完勝');
    const upsets = done.filter(m => m.upset);
    if (upsets.length) { const u = upsets[upsets.length - 1]; add('🌋', '大番狂わせ賞', u.winner, 'みんなの予想を覆した'); }
    const pred = predictionBoard(cup);
    if (pred.length && pred[0].points > 0) out.push({ icon: '🔮', title: '予想王', pid: pred[0].id, name: pred[0].name, note: pred[0].hits + '回的中' });
    const reacts = Object.entries(cup.reacts || {}).sort((a, b) => b[1] - a[1]);
    if (reacts.length && reacts[0][1] >= 5) out.push({ icon: '📣', title: '盛り上げ隊長', pid: reacts[0][0], name: nameOf(cup, reacts[0][0]), note: 'スタンプ ' + reacts[0][1] + '回' });
    return out;
  }
  function nameOf(cup, id) { return (cup.players.find(p => p.id === id) || cup.watchers.find(p => p.id === id))?.name || '？？？'; }
  function feed(cup, kind, text) { cup.feed.push({ at: Date.now(), kind, text: clean(text, 80) }); if (cup.feed.length > 40) cup.feed.splice(0, cup.feed.length - 40); }
  function bump(cup) { cup.rev = (cup.rev || 0) + 1; }
  /* 「もう一回」：同じメンバー・同じ設定で受付からやり直す */
  function again(cup) {
    const next = newCup({ title: cup.title, format: cup.format, cardSet: cup.cardSet, controlEnabled: cup.controlEnabled, transport: cup.transport, hostId: cup.hostId });
    next.code = cup.code; next.rev = (cup.rev || 0) + 1;
    next.players = cup.players.map(p => ({ ...p, seed: 0 })); next.watchers = cup.watchers.map(p => ({ ...p }));
    feed(next, 'join', '🔁 同じメンバーで2回戦目の大会！');
    return next;
  }
  globalThis.COMPILE_CUP_CORE = Object.freeze({ MAX_PLAYERS, newCup, addPlayer, removePlayer, draw, start, reset, result, canStart, canPick, setPick, pickCounts,
    predictionBoard, standings, roundLabel, awards, nameOf, feed, bump, again, busy, seedOrder, copy, shuffle });
})();

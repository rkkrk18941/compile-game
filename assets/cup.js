'use strict';
/* ==== COMPILE : 大会モード（友達とわいわい） ====
   ・みんなのスマホで：主催者の端末が大会を進行。参加者はロビーの「🏆」をタップで参加。
     通信は Firebase の部屋（既存ルールの範囲）だけを使う：主催者＝ホスト、参加者＝ゲストの
     「受付部屋」を1人1つ。試合はふつうのオンライン対戦の部屋（assets/lobby.js）で行う。
   ・1台でまわす：名前を入れて、1台を順番に回して対戦。
   盛り上げ要素：入場、組み合わせ抽選、VS演出、勝敗予想、応援スタンプ、実況、表彰式、歴代王者。 */
(() => {
  const C = globalThis.COMPILE_CUP_CORE;
  const LOB = () => globalThis.COMPILE_LOBBY;
  const AUDIO = () => globalThis.COMPILE_AUDIO;
  const q = s => document.querySelector(s);
  const html = s => esc(String(s ?? ''));
  const STORE = 'compile-cup-v2', LINK = 'compile-cup-link-v2', HOF = 'compile-cup-hof-v1', CLIENT = 'compile-cup-client-v1', PROFILE = 'compile-cup-profile-v1';
  const MAX_ENTRIES = 24;
  const EMOJIS = ['🦊', '🐺', '🐉', '🦁', '🐯', '🐼', '🐸', '🐙', '🦉', '🦅', '🐱', '🐶', '🦄', '🐧', '🦈', '👾', '🤖', '🧙', '👻', '💀', '🍙', '⚡', '🔥', '🌙'];
  const TITLE_A = ['烈火の', '流水の', '暗黒の', '閃光の', '鋼鉄の', '迅速の', '重力の', '精霊の', '疫病の', '断命の', '生命の', '超常の',
    '煤煙の', '氷結の', '混沌の', '鏡像の', '時空の', '戦乱の', '幸運の', '平和の', '恐怖の', '勇気の', '腐食の', '明晰の'];
  const TITLE_B = ['策士', '剣士', '魔術師', 'ハッカー', '番人', '挑戦者', '王', '女王', '狩人', '賢者', '職人', '道化', '旅人', '亡霊',
    '新星', '怪物', '指揮官', '隠者', '預言者', '申し子', '暴君', '軍師'];
  const REACTIONS = ['👏', '🔥', '😱', '🤣', '💀', '🙏'];
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const randomTitle = () => pick(TITLE_A) + pick(TITLE_B);
  const sfx = name => { try { AUDIO()?.sfx(name); } catch (e) {} };
  const jingle = name => { try { AUDIO()?.jingle?.(name); } catch (e) {} };
  const scene = name => { try { AUDIO()?.scene?.(name); } catch (e) {} };

  /* ---------- 状態 ---------- */
  const U = {
    mode: null, cup: null, me: null, role: 'player', client: null, entries: new Map(), link: null,
    boards: {}, boardSeq: {}, match: null, screen: 'home', watching: null, seq: 0, seen: new Set(), seenOrder: [],
    lastHeard: 0, drawShown: '', ceremonyShown: '', bcTimer: 0, relayTimers: {}, keepalive: 0, ensureTimer: 0, ensuring: false,
    savedClient: null, savedSet: null, scanTimer: 0, cups: [], reactAt: {}, view: null, localPlayers: null, busy: false
  };
  let root = null, chip = null;

  function client() {
    if (U.client) return U.client;
    try { U.client = localStorage.getItem(CLIENT); } catch (e) {}
    if (!U.client || !/^[A-Z2-9]{12}$/.test(U.client)) { U.client = netRandomToken(12); try { localStorage.setItem(CLIENT, U.client); } catch (e) {} }
    return U.client;
  }
  function profile() {
    let p = null; try { p = JSON.parse(localStorage.getItem(PROFILE) || 'null'); } catch (e) {}
    if (!p || !p.emoji) { p = { emoji: pick(EMOJIS), title: randomTitle() }; saveProfile(p); }
    return p;
  }
  function saveProfile(p) { try { localStorage.setItem(PROFILE, JSON.stringify({ emoji: p.emoji, title: p.title })); } catch (e) {} }
  function myName() { return LOB()?.myName() || 'PLAYER'; }
  function mePlayer() { const p = profile(); return { id: 'p-' + client(), name: myName(), emoji: p.emoji, title: p.title }; }
  const cup = () => U.cup;
  const isHost = () => U.mode === 'host';
  const online = () => U.cup?.transport === 'online';
  const nameOf = id => U.cup ? C.nameOf(U.cup, id) : '？';
  const personOf = id => U.cup?.players.find(p => p.id === id) || U.cup?.watchers.find(p => p.id === id) || null;
  const emojiOf = id => personOf(id)?.emoji || '❔';
  const matchById = id => U.cup?.matches.find(m => m.id === id) || null;
  const myMatch = () => U.cup?.matches.find(m => (m.status === 'live' || m.status === 'ready') && (m.a === U.me || m.b === U.me) &&
    (m.status === 'live' || C.canStart(U.cup, m.id)));
  const entryCode = (cupCode, i) => i === 0 ? cupCode : LOB().codeFrom('compile-cupentry-v1:' + cupCode + ':' + i);
  const matchCode = m => LOB().codeFrom('compile-cupmatch-v1:' + U.cup.id + ':' + m.id + ':' + m.attempt);
  const SEEN = 'compile-cup-seen-v1';
  function seen(key) { try { return (JSON.parse(localStorage.getItem(SEEN) || '{}'))[key] === 1; } catch (e) { return false; } }
  function markSeen(key) {
    try { const o = JSON.parse(localStorage.getItem(SEEN) || '{}'); o[key] = 1; const keys = Object.keys(o); if (keys.length > 40) delete o[keys[0]]; localStorage.setItem(SEEN, JSON.stringify(o)); } catch (e) {}
  }
  function remember(id) {
    if (U.seen.has(id)) return false;
    U.seen.add(id); U.seenOrder.push(id);
    if (U.seenOrder.length > 800) U.seen.delete(U.seenOrder.shift());
    return true;
  }

  /* ---------- 保存（主催者・1台モード／参加者のつながり） ---------- */
  function save() {
    if (!isHost() || !U.cup) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ cup: U.cup, me: U.me, entries: [...U.entries.values()].map(e => ({ i: e.i, code: e.code, pid: e.pid, guestUid: e.guestUid })), boards: U.boards }));
    } catch (e) {}
  }
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } }
  function clearStore() { try { localStorage.removeItem(STORE); } catch (e) {} }
  function saveLink() { if (U.link) try { localStorage.setItem(LINK, JSON.stringify({ cupCode: U.link.cupCode, code: U.link.code, me: U.me, title: U.cup?.title || '' })); } catch (e) {} }
  function loadLink() { try { return JSON.parse(localStorage.getItem(LINK) || 'null'); } catch (e) { return null; } }
  function clearLink() { try { localStorage.removeItem(LINK); } catch (e) {} }
  function loadHof() { try { const v = JSON.parse(localStorage.getItem(HOF) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function addHof(c) {
    const champ = c.players.find(p => p.id === c.champion); if (!champ) return;
    const list = loadHof();
    if (list.some(x => x.id === c.id)) return;
    list.unshift({ id: c.id, title: c.title, name: champ.name, emoji: champ.emoji, ptitle: champ.title, at: c.endedAt || Date.now(), n: c.players.length, format: c.format });
    try { localStorage.setItem(HOF, JSON.stringify(list.slice(0, 30))); } catch (e) {}
  }

  /* ---------- 通信：受付部屋のメッセージ ---------- */
  const fb = () => NET.fb;
  const msgRef = code => fb().dbM.ref(fb().db, LOB().roomPath(code) + '/messages');
  const metaRef = code => fb().dbM.ref(fb().db, LOB().metaPath(code));
  function post(code, body) {
    const payload = JSON.stringify({ v: 'cup1', id: client() + '-' + (++U.seq) + '-' + Date.now().toString(36), body });
    if (payload.length > 400000) return Promise.resolve();
    return fb().dbM.push(msgRef(code), { fromUid: NET.uid, fromClient: client(), createdAt: fb().dbM.serverTimestamp(), payload })
      .catch(e => console.warn('cup post', e));
  }
  function listen(code, onMsg, onCancel) {
    return fb().dbM.onChildAdded(msgRef(code), snap => {
      const v = snap.val(); if (!v || v.fromClient === client()) return;
      fb().dbM.remove(snap.ref).catch(() => {});
      let env = null; try { env = JSON.parse(v.payload); } catch (e) { return; }
      if (!env || env.v !== 'cup1' || typeof env.id !== 'string' || !env.body || typeof env.body.t !== 'string') return;
      if (!remember(env.id)) return;
      try { onMsg(env.body, v); } catch (e) { console.error('cup message', e); }
    }, e => { console.warn('cup listen', e); onCancel?.(e); });
  }

  /* ---------- 主催者（ハブ） ---------- */
  async function createEntry(code) {
    const { dbM } = fb(), L = LOB();
    const before = await L.readMeta(code);
    if (before.meta === undefined) throw before.error || new Error('通信エラー');
    if (before.meta && before.meta.hostUid !== NET.uid) { const e = new Error('使用中'); e.occupied = true; throw e; }
    if (before.meta) { try { await dbM.remove(fb().dbM.ref(fb().db, L.roomPath(code))); } catch (e) {} }
    const meta = { version: NET_PROTOCOL, hostUid: NET.uid, hostClientId: client(), hostName: String(U.cup.title).slice(0, 32), hostPeerId: netPeerId(code),
      controlEnabled: U.cup.controlEnabled, createdAt: dbM.serverTimestamp(), expiresAt: Date.now() + NET_ROOM_TTL };
    try { await netTimed(dbM.set(metaRef(code), meta), 8000, '受付の準備がタイムアウトしました'); }
    catch (e) { if (L.isDenied(e)) { const err = new Error('使用中'); err.occupied = true; throw err; } throw e; }
    const stored = (await netTimed(dbM.get(metaRef(code)), 8000, '受付の確認がタイムアウトしました')).val();
    if (stored?.hostUid !== NET.uid || stored?.hostClientId !== client()) { const e = new Error('使用中'); e.occupied = true; throw e; }
  }
  function attachEntry(e) {
    const { dbM } = fb();
    detachEntry(e);
    e.ok = true;
    e.metaOff = dbM.onValue(metaRef(e.code), snap => {
      const meta = snap.val();
      if (!meta) { e.ok = false; e.lostAt = Date.now(); scheduleEnsure(); return; }
      e.ok = true;
      if (meta.guestUid && e.guestUid !== meta.guestUid) { e.guestUid = meta.guestUid; save(); scheduleEnsure(); }
    }, () => { e.ok = false; e.lostAt = Date.now(); scheduleEnsure(); });
    e.msgOff = listen(e.code, (body, raw) => {
      if (e.guestUid && raw.fromUid !== e.guestUid) return;
      if (!e.guestUid) e.guestUid = raw.fromUid;
      hostReceive(e, body);
    }, () => { e.ok = false; e.lostAt = Date.now(); scheduleEnsure(); });
  }
  function detachEntry(e) { try { e.metaOff?.(); } catch (x) {} try { e.msgOff?.(); } catch (x) {} e.metaOff = e.msgOff = null; }
  function scheduleEnsure() { clearTimeout(U.ensureTimer); U.ensureTimer = setTimeout(() => void ensureEntries(), 600); }
  async function ensureEntries() {
    if (!isHost() || !online() || !U.cup?.code || U.ensuring || U.cup.status === 'closed') return;
    U.ensuring = true;
    try {
      for (const e of [...U.entries.values()]) if (!e.ok && Date.now() - (e.lostAt || 0) > 4000) { detachEntry(e); U.entries.delete(e.code); }
      if (!U.entries.has(U.cup.code)) { await createEntry(U.cup.code); const e = { i: 0, code: U.cup.code, pid: null, guestUid: null }; U.entries.set(e.code, e); attachEntry(e); }
      let free = [...U.entries.values()].filter(e => e.ok && !e.guestUid).length;
      for (let i = 1; free < 2 && i < MAX_ENTRIES; i++) {
        const code = entryCode(U.cup.code, i);
        if (U.entries.has(code)) continue;
        try { await createEntry(code); } catch (err) { if (err.occupied) continue; throw err; }
        const e = { i, code, pid: null, guestUid: null }; U.entries.set(code, e); attachEntry(e); free++;
      }
      save();
    } catch (e) { console.warn('cup entries', e); }
    finally { U.ensuring = false; }
  }
  function entryOf(pid) { return [...U.entries.values()].find(e => e.pid === pid) || null; }
  function sendTo(pid, body) { const e = entryOf(pid); if (e && e.guestUid) void post(e.code, body); }
  function broadcast(body, except = null) { for (const e of U.entries.values()) if (e.guestUid && e.pid && e.pid !== except) void post(e.code, body); }
  function changed({ now = false } = {}) {
    if (!U.cup) return;
    save(); paint();
    if (!online() || !isHost()) return;
    clearTimeout(U.bcTimer);
    U.bcTimer = setTimeout(() => broadcast({ t: 'state', cup: U.cup }), now ? 0 : 220);
  }
  function hostReceive(e, body) {
    const c = U.cup; if (!c) return;
    if (body.t === 'hello') {
      const p = body.player || {};
      const id = String(p.id || ''); if (!/^p-[A-Z2-9]{12}$/.test(id)) return;
      if (e.pid && e.pid !== id) return;
      e.pid = id;
      let person = personOf(id), role = 'player';
      if (person) { person.online = true; role = c.players.includes(person) ? 'player' : 'watcher'; }
      else if (c.status === 'entry') {
        person = C.addPlayer(c, { id, name: p.name, emoji: p.emoji, title: p.title });
        if (person) { C.feed(c, 'join', person.emoji + ' ' + person.name + ' がエントリー！'); arrival(person); }
        else role = 'watcher';
      } else role = 'watcher';
      if (!person) {
        person = { id, name: String(p.name || 'ゲスト').slice(0, 18), emoji: String(p.emoji || '👀').slice(0, 4), title: String(p.title || '').slice(0, 16), online: true };
        c.watchers.push(person); C.feed(c, 'join', '👀 ' + person.name + ' が観戦に来た');
      }
      C.bump(c); save();
      void post(e.code, { t: 'welcome', pid: id, role, cup: c });
      for (const [mid, b] of Object.entries(U.boards)) if (matchById(mid)?.status === 'live') void post(e.code, { t: 'board', mid, seq: U.boardSeq[mid] || 0, board: b });
      changed();
      return;
    }
    const pid = e.pid; if (!pid) return;
    if (body.t === 'profile') {
      const person = c.players.find(p => p.id === pid); if (!person || c.status !== 'entry') return;
      if (EMOJIS.includes(body.emoji)) person.emoji = body.emoji;
      if (typeof body.title === 'string') person.title = body.title.slice(0, 16);
      C.bump(c); changed(); return;
    }
    if (body.t === 'start') return void hostStart(String(body.mid || ''), pid);
    if (body.t === 'pick') {
      if (C.setPick(c, String(body.mid || ''), pid, body.side, U.boards[body.mid]?.turn || 0)) changed();
      return;
    }
    if (body.t === 'react') return void hostReact(pid, body.e);
    if (body.t === 'board') return void hostBoard(pid, String(body.mid || ''), Number(body.seq) || 0, body.board);
    if (body.t === 'result') return void hostResult(pid, body);
    if (body.t === 'leave') {
      if (c.status === 'entry' && C.removePlayer(c, pid)) C.feed(c, 'join', '👋 ' + (body.name || 'だれか') + ' が抜けました');
      const w = c.watchers.findIndex(x => x.id === pid); if (w >= 0 && c.status === 'entry') c.watchers.splice(w, 1);
      const person = personOf(pid); if (person) person.online = false;
      C.bump(c); changed(); return;
    }
  }
  function hostStart(mid, by) {
    const c = U.cup, m = matchById(mid);
    if (!m || (by !== m.a && by !== m.b && by !== U.me)) return false;
    if (!C.start(c, mid)) return false;
    m.room = online() ? matchCode(m) : null;
    delete U.boards[mid]; U.boardSeq[mid] = 0;
    changed({ now: true });
    if (!online() || m.a === U.me || m.b === U.me) void enterMatch(m);
    return true;
  }
  function hostReact(pid, emoji) {
    if (!REACTIONS.includes(emoji)) return;
    const now = Date.now(); if (now - (U.reactAt[pid] || 0) < 1100) return; U.reactAt[pid] = now;
    U.cup.reacts[pid] = (U.cup.reacts[pid] || 0) + 1;
    floatReact(pid, emoji);
    if (online()) broadcast({ t: 'react', pid, e: emoji }, pid);
    save();
  }
  function hostBoard(pid, mid, seq, board) {
    const m = matchById(mid); if (!m || m.status !== 'live' || (pid !== m.a && pid !== m.b) || !validBoard(board)) return;
    if (seq <= (U.boardSeq[mid] || 0)) return;
    const prev = U.boards[mid];
    U.boardSeq[mid] = seq; U.boards[mid] = board;
    // 実況：新しくコンパイルしたら流す
    if (prev) for (let p = 0; p < 2; p++) {
      const before = prev.players[p].protocols, after = board.players[p].protocols;
      after.forEach((pr, i) => {
        if (pr.c && !before[i]?.c) {
          const who = p === 0 ? m.a : m.b, n = after.filter(x => x.c).length;
          C.feed(U.cup, 'compile', '⚡ ' + nameOf(who) + ' が ' + pr.n + ' をコンパイル！（' + n + '/3）'); C.bump(U.cup); changed();
        }
      });
    }
    if (online()) {
      clearTimeout(U.relayTimers[mid]);
      U.relayTimers[mid] = setTimeout(() => { for (const e of U.entries.values()) if (e.guestUid && e.pid && e.pid !== pid) void post(e.code, { t: 'board', mid, seq, board }); }, 450);
    }
    if (U.screen === 'watch' && U.watching === mid) paintWatch(true);
  }
  function hostResult(pid, body) {
    const c = U.cup, m = matchById(String(body.mid || ''));
    if (!m || m.status !== 'live' || (pid !== m.a && pid !== m.b && pid !== U.me)) return false;
    if (Number(body.attempt) !== m.attempt) return false;
    const winner = body.winnerRole === 0 ? m.a : body.winnerRole === 1 ? m.b : null;
    if (!winner) return false;
    const before = c.status;
    if (!C.result(c, m.id, winner, body.score, body.turns)) return false;
    if (body.board && validBoard(body.board)) U.boards[m.id] = body.board;
    sfx('victory');
    changed({ now: true });
    if (before !== 'done' && c.status === 'done') onCupDone();
    return true;
  }
  function validBoard(b) {
    return !!b && Number.isInteger(b.turn) && Array.isArray(b.players) && b.players.length === 2 && b.players.every(p =>
      Array.isArray(p.lines) && p.lines.length === 3 && p.lines.every(l => Array.isArray(l) && l.length <= 40) && Array.isArray(p.protocols) && p.protocols.length === 3);
  }

  async function hostOnline({ title, format, cardSet, controlEnabled, play = true }) {
    await LOB().ensureFirebase();
    await teardown({ quiet: true });
    const me = mePlayer();
    U.mode = 'host'; U.me = me.id; U.role = play ? 'player' : 'watcher';
    U.cup = C.newCup({ title, format, cardSet, controlEnabled, transport: 'online', hostId: me.id });
    if (play) C.addPlayer(U.cup, me); else U.cup.watchers.push({ ...me, online: true });
    C.feed(U.cup, 'join', '🏁 ' + U.cup.title + ' の受付を開始しました');
    const codes = [...LOB().cupCodes].sort(() => Math.random() - .5);
    for (const code of codes) {
      try { await createEntry(code); U.cup.code = code; break; } catch (e) { if (!e.occupied) throw e; }
    }
    if (!U.cup.code) { U.mode = null; U.cup = null; throw new Error('いま開ける大会の枠がありません。少し待ってからお試しください'); }
    const e0 = { i: 0, code: U.cup.code, pid: null, guestUid: null }; U.entries.set(e0.code, e0); attachEntry(e0);
    await ensureEntries();
    startKeepalive();
    save(); go('entry');
  }
  function hostLocal({ title, format, cardSet, controlEnabled, players }) {
    void teardown({ quiet: true });
    U.mode = 'host'; U.me = 'local-host'; U.role = 'watcher';
    U.cup = C.newCup({ title, format, cardSet, controlEnabled, transport: 'local', hostId: U.me });
    players.forEach((p, i) => C.addPlayer(U.cup, { id: 'local-' + i, name: p.name, emoji: p.emoji, title: p.title }));
    save(); doDraw();
  }
  function startKeepalive() {
    clearInterval(U.keepalive);
    U.keepalive = setInterval(() => {
      if (!isHost() || !online()) return;
      broadcast({ t: 'state', cup: U.cup });
      const now = Date.now();
      for (const e of U.entries.values()) if (!e.touched || now - e.touched > 20 * 60e3) {
        e.touched = now; fb().dbM.update(metaRef(e.code), { expiresAt: now + NET_ROOM_TTL }).catch(() => {});
      }
    }, 25000);
  }
  async function restoreHost(stored) {
    U.mode = 'host'; U.cup = stored.cup; U.me = stored.me; U.boards = stored.boards || {};
    U.role = U.cup.players.some(p => p.id === U.me) ? 'player' : 'watcher';
    if (U.cup.transport !== 'online') return;
    await LOB().ensureFirebase();
    for (const s of stored.entries || []) {
      const r = await LOB().readMeta(s.code);
      if (!r.meta || r.meta.hostUid !== NET.uid) continue;
      const e = { i: s.i, code: s.code, pid: s.pid, guestUid: r.meta.guestUid || null }; U.entries.set(e.code, e); attachEntry(e);
    }
    await ensureEntries(); startKeepalive();
    broadcast({ t: 'state', cup: U.cup });
    const mine = U.cup.matches.find(m => m.status === 'live' && (m.a === U.me || m.b === U.me));
    if (mine) void enterMatch(mine, { resume: true });
  }

  /* ---------- 参加者 ---------- */
  async function joinOnline(cupCode) {
    const L = LOB();
    await L.ensureFirebase();
    const first = await L.readMeta(cupCode);
    if (first.meta && first.meta.hostUid === NET.uid) {
      const stored = loadStore();
      if (stored?.cup?.code === cupCode) { if (!isHost()) await restoreHost(stored); go(U.cup.status === 'entry' ? 'entry' : 'main'); return; }
    }
    if (!first.meta) throw new Error('この大会はもう終わっています');
    await teardown({ quiet: true });
    U.mode = 'guest'; U.me = mePlayer().id; U.cup = null;
    go('connecting', '大会の受付に向かっています…');
    let code = null;
    const saved = loadLink();
    if (saved?.cupCode === cupCode && saved.code) {
      const r = await L.readMeta(saved.code);
      if (r.meta?.guestUid === NET.uid && r.meta.guestClientId === client()) code = saved.code;
    }
    for (let i = 0, misses = 0; !code && i < MAX_ENTRIES && misses < 4; i++) {
      const c = entryCode(cupCode, i), r = await L.readMeta(c);
      if (r.meta === undefined) continue;
      if (!r.meta) { misses++; continue; }
      misses = 0;
      if (r.meta.guestUid === NET.uid && r.meta.guestClientId === client()) { code = c; break; }
      if (r.meta.guestUid || !(r.meta.expiresAt > Date.now()) || r.meta.version !== NET_PROTOCOL) continue;
      try {
        await netTimed(fb().dbM.update(metaRef(c), { guestUid: NET.uid, guestClientId: client(), guestName: myName() }), 8000, '受付がタイムアウトしました');
        const v = (await fb().dbM.get(metaRef(c))).val();
        if (v?.guestUid === NET.uid && v.guestClientId === client()) { code = c; break; }
      } catch (e) { if (!L.isDenied(e)) throw e; }
    }
    if (!code) { U.mode = null; throw new Error('受付がいっぱいです。少し待ってからもう一度お試しください'); }
    U.link = { cupCode, code };
    U.link.msgOff = listen(code, guestReceive, () => linkLost());
    U.link.metaOff = fb().dbM.onValue(metaRef(code), snap => { if (!snap.val()) linkLost(); }, () => linkLost());
    saveLink();
    U.lastHeard = Date.now();
    void post(code, { t: 'hello', player: mePlayer() });
    clearInterval(U.keepalive);
    U.keepalive = setInterval(() => { if (U.mode === 'guest' && U.screen !== 'connecting') paintStatusBar(); }, 5000);
  }
  function linkLost() {
    if (U.mode !== 'guest' || !U.link) return;
    if (U.cup?.status === 'done') return;
    setTimeout(async () => {
      if (U.mode !== 'guest' || !U.link) return;
      const r = await LOB().readMeta(U.link.code);
      if (r.meta) return;
      closedByHost('大会の受付が閉じられました');
    }, 1500);
  }
  function closedByHost(message) {
    const title = U.cup?.title || '大会';
    void teardown({ quiet: true });
    clearLink();
    go('closed', message || (title + ' は終了しました'));
  }
  function guestSend(body) { if (U.link) void post(U.link.code, body); }
  function guestReceive(body) {
    U.lastHeard = Date.now();
    if (body.t === 'welcome') { U.me = String(body.pid || U.me); U.role = body.role === 'watcher' ? 'watcher' : 'player'; applyState(body.cup, true); return; }
    if (body.t === 'state') return applyState(body.cup);
    if (body.t === 'board') {
      const mid = String(body.mid || ''), seq = Number(body.seq) || 0;
      if (!validBoard(body.board) || seq <= (U.boardSeq[mid] || 0)) return;
      U.boardSeq[mid] = seq; U.boards[mid] = body.board;
      if (U.screen === 'watch' && U.watching === mid) paintWatch(true);
      return;
    }
    if (body.t === 'react') { if (REACTIONS.includes(body.e)) floatReact(String(body.pid || ''), body.e); return; }
    if (body.t === 'closed') return closedByHost(String(body.message || ''));
  }
  function applyState(next, force = false) {
    if (!next || typeof next !== 'object' || !Array.isArray(next.players) || !Array.isArray(next.matches)) return;
    const prev = U.cup;
    if (!force && prev && prev.id === next.id && (next.rev || 0) <= (prev.rev || 0)) return;
    U.cup = next; saveLink();
    if (prev && prev.id === next.id) {
      for (const p of next.players) if (!prev.players.some(x => x.id === p.id) && next.status === 'entry') arrival(p);
    }
    if ((!prev || prev.status === 'entry' || prev.id !== next.id) && next.status === 'running' && U.drawShown !== next.id + ':' + next.startedAt && !seen('draw:' + next.id + ':' + next.startedAt)) {
      U.drawShown = next.id + ':' + next.startedAt; markSeen('draw:' + U.drawShown); showDraw(() => go('main'));
    } else if (U.screen === 'connecting' || U.screen === 'closed') go(next.status === 'entry' ? 'entry' : 'main');
    else if (next.status === 'entry' && U.screen === 'main' && !U.match) go('entry');
    else paint();
    if (next.status === 'done' && U.ceremonyShown !== next.id) {
      U.ceremonyShown = next.id; addHof(next);
      if (!seen('champ:' + next.id)) { markSeen('champ:' + next.id); if (U.match) U.ceremonyPending = true; else showChampion(); }
    }
    if (next.status === 'entry') q('#cpChampion')?.remove();
    const mine = next.matches.find(m => m.status === 'live' && (m.a === U.me || m.b === U.me));
    if (mine && (!U.match || U.match.mid !== mine.id || U.match.attempt !== mine.attempt)) void enterMatch(mine);
    if (U.match && !mine && !U.match.local) {
      const m = matchById(U.match.mid);
      if (m && m.status === 'ready') { toast('主催者が試合をやり直しにしました', 3500); void leaveMatch({ toCup: true }); }
      else if (m && m.status === 'done' && m.walkover) { toast('主催者が勝敗を決めました', 3500); void leaveMatch({ toCup: true }); }
    }
  }

  /* ---------- 試合 ---------- */
  function publicBoard(g) {
    return {
      turn: g.turn, current: g.current, phase: g.phase, winner: g.winner,
      players: g.players.map(p => ({
        name: String(p.name).slice(0, 18), hand: p.hand.length, deck: p.deck.length, trash: p.discard.length,
        protocols: p.protocols.map(pr => ({ n: pr.name, c: !!pr.compiled })),
        lines: p.lines.map(line => line.map(c => c.faceDown ? 0 : [c.protocol, c.value]))
      })),
      totals: [0, 1].map(p => [0, 1, 2].map(l => { try { return stackTotal(p, l); } catch (e) { return null; } }))
    };
  }
  async function enterMatch(m, { resume = false } = {}) {
    const local = U.cup.transport === 'local';
    const role = local ? 0 : m.a === U.me ? 0 : m.b === U.me ? 1 : -1;
    if (role < 0) return;
    if (U.match && U.match.mid === m.id && U.match.attempt === m.attempt) return;
    if (U.match) await leaveMatch({ quiet: true });
    const mm = U.match = { mid: m.id, attempt: m.attempt, role, code: m.room || null, local, reported: false, started: false, boardSeq: 0, off: null };
    if (!local) prepareMatchSettings();
    hideRoot(); updateChip();
    const vsKey = 'vs:' + U.cup.id + ':' + m.id + ':' + m.attempt;
    if (seen(vsKey) && !local) { q('#cpDraw')?.remove(); mm.vsDone = true; }   // 再読み込みで戻ってきたときはVS演出を省く
    else { markSeen(vsKey); showVS(m, () => { mm.vsDone = true; maybeStartDraft(mm); }); }
    if (local) return;
    try { await connectMatch(mm, resume); }
    catch (e) {
      console.warn('cup match', e);
      if (U.match === mm) { toast('試合に接続できません：' + netFriendlyError(e), 4500); await leaveMatch({ toCup: true }); }
    }
  }
  function prepareMatchSettings() {
    if (U.savedClient == null) U.savedClient = NET.clientId;
    NET.clientId = client();
    try { U.savedSet = U.savedSet ?? localStorage.getItem('compile-card-set'); } catch (e) {}
    window.COMPILE_CARD_SETS?.set?.(U.cup.cardSet); draft.cardSet = normalizeCardSet(U.cup.cardSet);
    draft.controlEnabled = U.cup.controlEnabled !== false;
    try { localStorage.removeItem('compile-hotseat-save'); } catch (e) {}
    G = null; stableState = true;
  }
  function matchScreen(text) {
    $('#setup').classList.remove('hidden');
    const m = matchById(U.match?.mid);
    $('#setupBox').innerHTML = '<div class="lb-match cp-matchwait"><div class="lb-match-kicker">' + html(U.cup?.title || '大会') + ' / ' + html(m ? C.roundLabel(U.cup, m.round, m) : '') + '</div>' +
      (m ? '<div class="lb-match-vs"><div class="p"><span class="cp-emo xl">' + html(emojiOf(m.a)) + '</span><b>' + html(nameOf(m.a)) + '</b></div><em>VS</em><div class="p"><span class="cp-emo xl">' + html(emojiOf(m.b)) + '</span><b>' + html(nameOf(m.b)) + '</b></div></div>' : '') +
      '<p class="lb-match-wait">' + html(text) + '<span class="lb-dots"><i>.</i><i>.</i><i>.</i></span></p><button class="lb-leave" id="cpToBracket">トーナメント表を見る</button></div>';
    $('#cpToBracket').onclick = () => openRoot('main');
  }
  async function connectMatch(mm, resume) {
    const L = LOB(), m = matchById(mm.mid), name = nameOf(U.me);
    const still = () => U.match === mm && matchById(mm.mid)?.status === 'live' && matchById(mm.mid)?.attempt === mm.attempt;
    matchScreen(mm.role === 0 ? '対戦相手の接続を待っています' : '試合の部屋に入っています');
    if (mm.role === 0) {
      const r = await L.readMeta(mm.code);
      if (r.meta && r.meta.hostUid === NET.uid && r.meta.hostClientId === client() && r.meta.guestUid) {
        await attachResume(mm, r.meta, 0); return;
      }
      await L.hostAt(mm.code, { name, controlEnabled: U.cup.controlEnabled, ttl: NET_ROOM_TTL, hostName: name });
      if (!still()) return;
      await new Promise(resolve => {
        mm.off = fb().dbM.onValue(metaRef(mm.code), snap => {
          const meta = snap.val();
          if (meta?.guestUid && meta.guestClientId) { try { mm.off?.(); } catch (e) {} mm.off = null; NET.meta = { ...(NET.meta || {}), ...meta }; NET.names[1] = String(meta.guestName || nameOf(m.b)).slice(0, 32); resolve(); }
        }, () => {});
      });
      if (!still()) return;
      NET.opponentReady = true; NET.on = true;
      netSend(netHelloPayload());
      mm.connected = true; maybeStartDraft(mm);
    } else {
      for (let i = 0; i < 90 && still(); i++) {
        const r = await L.readMeta(mm.code);
        if (r.meta && r.meta.guestUid === NET.uid && r.meta.guestClientId === client()) { await attachResume(mm, r.meta, 1); return; }
        if (r.meta && !r.meta.guestUid && r.meta.hostUid !== NET.uid) {
          try { await L.joinAt(mm.code, { name }); mm.connected = true; netSend(netHelloPayload()); matchScreen('ドラフトの開始を待っています'); return; }
          catch (e) { console.warn('cup join retry', e); }
        }
        await new Promise(res => setTimeout(res, 1500));
      }
      if (still()) throw new Error('対戦相手の部屋が見つかりませんでした');
    }
  }
  async function attachResume(mm, meta, role) {
    NET.role = role; NET.code = mm.code; NET.meta = meta; NET.names = [String(meta.hostName || 'PLAYER 1').slice(0, 32), String(meta.guestName || 'PLAYER 2').slice(0, 32)];
    if (typeof meta.controlEnabled === 'boolean') draft.controlEnabled = meta.controlEnabled;
    netResetDraftSync();
    await netAttachFirebaseRoom(mm.code);
    NET.opponentReady = true; NET.on = true; mm.connected = true; mm.resumed = true;
    netSend(netHelloPayload());
    matchScreen('試合に復帰しています');
    if (role === 0) setTimeout(() => {
      // 相手から盤面が届かない＝まだドラフト前後。やり直してドラフトを始める
      if (U.match === mm && !G && NET.on) { netSend({ t: 'lobby', k: 'rematch' }); netResetDraftSync(); mm.started = false; maybeStartDraft(mm, true); }
    }, 4500);
  }
  function maybeStartDraft(mm, force = false) {
    if (U.match !== mm || mm.started) return;
    if (mm.local) { if (!mm.vsDone) return; mm.started = true; startLocalGame(); return; }
    if (mm.role !== 0 || !mm.connected || (!mm.vsDone && !force) || mm.resumed && !force) return;
    mm.started = true;
    netResetDraftSync(); NET.lobbyShown = true;
    netStartDraft();
  }
  function startLocalGame() {
    const m = matchById(U.match.mid);
    newGame();
    window.COMPILE_CARD_SETS?.set?.(U.cup.cardSet); draft.cardSet = normalizeCardSet(U.cup.cardSet);
    draft.controlEnabled = U.cup.controlEnabled !== false;
    const n0 = $('#name0'), n1 = $('#name1');
    if (n0) n0.value = nameOf(m.a); if (n1) n1.value = nameOf(m.b);
    q('#controlSetting [data-control="' + (draft.controlEnabled ? 'on' : 'off') + '"]')?.click();
    hideRoot(); updateChip();
    startDraft();
  }
  async function leaveMatch({ quiet = false, toCup = false } = {}) {
    const mm = U.match; if (!mm) { if (toCup) openRoot('main'); return; }
    U.match = null;
    try { mm.off?.(); } catch (e) {}
    clearTimeout(mm.boardTimer);
    if (!mm.local) {
      try { await LOB().leave({ quiet: true }); } catch (e) {}
      if (U.savedClient) { NET.clientId = U.savedClient; U.savedClient = null; }
    }
    try { if (U.savedSet) window.COMPILE_CARD_SETS?.set?.(U.savedSet); } catch (e) {}
    U.savedSet = null;
    try { closeModal(null); } catch (e) {}
    newGame();
    updateChip();
    if (toCup || !quiet) {
      openRoot(U.cup ? 'main' : 'home');
      if (U.ceremonyPending && U.cup?.status === 'done') { U.ceremonyPending = false; showChampion(); }
    }
  }
  function reportResult(mm) {
    if (mm.reported || !G || G.winner == null) return;
    mm.reported = true;
    const score = G.players.map(p => p.protocols.filter(pr => pr.compiled).length);
    const body = { t: 'result', mid: mm.mid, attempt: mm.attempt, winnerRole: G.winner, score, turns: G.turn, board: publicBoard(G) };
    if (isHost()) hostResult(U.me, body);
    else guestSend(body);
  }
  function onGameRender() {
    const mm = U.match; if (!mm || !G) return;
    if (mm.local) {
      if (G.winner != null && !mm.reported) {
        mm.reported = true;
        const m = matchById(mm.mid), score = G.players.map(p => p.protocols.filter(pr => pr.compiled).length);
        const wasDone = U.cup.status;
        if (m && C.result(U.cup, m.id, G.winner === 0 ? m.a : m.b, score, G.turn)) {
          U.boards[m.id] = publicBoard(G); save();
          if (wasDone !== 'done' && U.cup.status === 'done') { addHof(U.cup); U.ceremonyShown = U.cup.id; U.ceremonyPending = true; }
        }
      }
      updateChip(); return;
    }
    if (G.winner != null) reportResult(mm);
    if (mm.role !== 0) return;
    clearTimeout(mm.boardTimer);
    mm.boardTimer = setTimeout(() => {
      if (U.match !== mm || !G) return;
      const board = publicBoard(G), serial = JSON.stringify(board);
      if (serial === mm.lastBoard) return;
      mm.lastBoard = serial; mm.boardSeq++;
      if (isHost()) hostBoard(U.me, mm.mid, mm.boardSeq + 1e6 * mm.attempt, board);
      else guestSend({ t: 'board', mid: mm.mid, seq: mm.boardSeq + 1e6 * mm.attempt, board });
    }, G.winner == null ? 500 : 0);
    updateChip();
  }

  /* ---------- 進行操作 ---------- */
  function requestStart(mid) {
    const m = matchById(mid); if (!m) return;
    if (isHost()) { if (!hostStart(mid, U.me)) toast('いまは始められません（ほかの試合中の人がいます）'); return; }
    if (m.a !== U.me && m.b !== U.me) return;
    guestSend({ t: 'start', mid }); toast('主催者に開始を伝えました', 1800);
  }
  function sendPick(mid, side) {
    const m = matchById(mid); if (!m) return;
    if (isHost()) { if (C.setPick(U.cup, mid, U.me, side, U.boards[mid]?.turn || 0)) changed(); else toast('この試合はもう予想できません'); return; }
    if (!C.canPick(U.cup, mid, U.me, U.boards[mid]?.turn || 0)) { toast('この試合はもう予想できません'); return; }
    m.picks[U.me] = side; paint();
    guestSend({ t: 'pick', mid, side });
  }
  function sendReact(emoji) {
    if (!online()) return;
    const now = Date.now(); if (now - (U.reactAt._me || 0) < 1100) return; U.reactAt._me = now;
    if (isHost()) hostReact(U.me, emoji);
    else { floatReact(U.me, emoji); guestSend({ t: 'react', e: emoji }); }
  }
  function doDraw() {
    if (!isHost() || U.cup.status !== 'entry') return;
    if (U.cup.players.length < 3) { toast('3人以上でひらけます'); return; }
    C.draw(U.cup);
    C.feed(U.cup, 'start', '🎲 抽選完了！ ' + U.cup.title + ' 開幕！');
    U.drawShown = U.cup.id + ':' + U.cup.startedAt; markSeen('draw:' + U.drawShown);
    save();
    showDraw(() => go('main'));
    if (online()) { clearTimeout(U.bcTimer); broadcast({ t: 'state', cup: U.cup }); }
  }
  function onCupDone() {
    addHof(U.cup); U.ceremonyShown = U.cup.id; save();
    if (U.match) U.ceremonyPending = true; else showChampion();
  }
  async function closeCup() {
    if (isHost()) {
      if (online()) {
        broadcast({ t: 'closed', message: U.cup.title + ' は終了しました' });
        await new Promise(r => setTimeout(r, 2500));
      }
      clearStore();
    } else if (U.mode === 'guest') { guestSend({ t: 'leave', name: myName() }); clearLink(); await new Promise(r => setTimeout(r, 600)); }
    await teardown();
    go('home');
  }
  async function teardown({ quiet = false } = {}) {
    clearInterval(U.keepalive); U.keepalive = 0; clearTimeout(U.bcTimer); clearTimeout(U.ensureTimer);
    if (U.match) await leaveMatch({ quiet: true });
    if (isHost() && online() && NET.fb) {
      for (const e of U.entries.values()) { detachEntry(e); if (!quiet || U.cup?.status === 'closed') {} }
      if (!quiet) for (const e of U.entries.values()) { try { await fb().dbM.remove(fb().dbM.ref(fb().db, LOB().roomPath(e.code))); } catch (x) {} }
    }
    if (U.link) { try { U.link.msgOff?.(); } catch (e) {} try { U.link.metaOff?.(); } catch (e) {} }
    U.entries = new Map(); U.link = null; U.mode = null; U.cup = null; U.boards = {}; U.boardSeq = {}; U.watching = null;
  }
  function again() {
    if (!isHost() || U.cup?.status !== 'done') return;
    const next = C.again(U.cup);
    U.cup = next; U.boards = {}; U.boardSeq = {}; U.ceremonyShown = ''; U.drawShown = '';
    q('#cpChampion')?.remove();
    if (online()) { changed({ now: true }); go('entry'); }
    else { save(); doDraw(); }
  }

  /* ---------- 画面の枠 ---------- */
  function ensureRoot() {
    if (root) return root;
    root = document.createElement('section'); root.id = 'cupRoot'; root.hidden = true; root.setAttribute('aria-label', '大会モード');
    document.body.append(root);
    root.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) void act(b.dataset.c, b.dataset.id || '', b); });
    root.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'cpAddForm') void act('local-add'); });
    return root;
  }
  function openRoot(screen) { ensureRoot(); root.hidden = false; document.body.classList.add('cp-open'); scene('cup'); go(screen || U.screen || 'home'); }
  function hideRoot() { if (root) root.hidden = true; document.body.classList.remove('cp-open'); stopScan(); scene(null); q('#cpSheet')?.remove(); }
  function go(screen, arg) {
    ensureRoot();
    if (screen !== 'watch') U.watching = null;
    U.screen = screen;
    if (root.hidden && !U.match) { root.hidden = false; document.body.classList.add('cp-open'); scene('cup'); }
    if (root.hidden) return;
    const map = { home: paintHome, create: paintCreate, entry: paintEntry, main: paintMain, watch: () => paintWatch(false), connecting: () => paintNote(arg || '接続しています…', true), closed: () => paintNote(arg || '大会は終了しました', false) };
    (map[screen] || paintHome)(arg);
  }
  function paint() { if (root && !root.hidden) go(U.screen, U.view); }
  function frame(body, { back = 'home', title = '大会モード', sub = 'CUP MODE', foot = '' } = {}) {
    const same = root.dataset.screen === U.screen && root.firstElementChild, keep = same ? root.scrollTop : 0;
    root.dataset.screen = U.screen;
    // 同じ画面の描き直し（状態が届いたとき）は入場アニメを繰り返さない
    root.innerHTML = '<div class="cp-shell' + (same ? ' still' : '') + '"><header class="lb-top"><button class="lb-back" data-c="' + back + '" aria-label="もどる">‹</button>' +
      '<div class="lb-title"><small>' + sub + '</small><b>' + title + '</b></div><span class="cp-statusbar" id="cpStatus"></span></header>' + body + '</div>' + foot;
    root.scrollTop = keep;
    paintStatusBar();
  }
  function paintStatusBar() {
    const el = root && q('#cpStatus'); if (!el) return;
    if (U.mode === 'guest') {
      const late = Date.now() - U.lastHeard > 70000;
      el.className = 'cp-statusbar ' + (late ? 'late' : 'on'); el.innerHTML = '<i></i>' + (late ? '主催者の応答待ち' : '参加中');
    } else if (isHost() && online()) {
      const n = [...U.entries.values()].filter(e => e.pid).length;
      el.className = 'cp-statusbar on'; el.innerHTML = '<i></i>' + (U.role === 'watcher' ? '本部' : '主催') + ' · ' + n + '台';
    } else el.innerHTML = '';
  }
  function paintNote(text, spin) {
    frame('<div class="lb-empty cp-note">' + (spin ? '<div class="lb-spin"></div>' : '<div class="cp-big">🏁</div>') + '<b>' + html(text) + '</b>' +
      (spin ? '' : '<button class="lb-ghost" data-c="home">大会モードのトップへ</button>') + '</div>');
  }
  const emo = (id, size = '') => '<span class="cp-emo ' + size + '">' + html(emojiOf(id)) + '</span>';

  /* ---------- トップ ---------- */
  function paintHome() {
    const hof = loadHof(), stored = loadStore(), link = loadLink();
    const active = isHost() || U.mode === 'guest' ? U.cup : null;
    let resume = '';
    if (active) resume = '<button class="cp-resume" data-c="resume"><span>🏆</span><b>' + html(active.title) + '</b><small>参加中の大会にもどる</small><i>›</i></button>';
    else if (stored?.cup && stored.cup.status !== 'done') resume = '<button class="cp-resume" data-c="restore"><span>🏆</span><b>' + html(stored.cup.title) + '</b><small>主催中の大会を再開する</small><i>›</i></button>';
    else if (link?.cupCode) resume = '<button class="cp-resume" data-c="relink"><span>🏆</span><b>' + html(link.title || '大会') + '</b><small>参加していた大会にもどる</small><i>›</i></button>';
    frame('<div class="cp-hero"><div class="cp-hero-trophy" aria-hidden="true">🏆</div><h1>友達と、王座を決めよう。</h1>' +
      '<p>トーナメントでも総当たりでも。<br>勝敗予想・応援スタンプ・表彰式つき。</p></div>' + resume +
      '<button class="cp-mode gold" data-c="new-online"><span class="cp-mode-ico">📱<b>📱</b></span><span class="cp-mode-copy"><b>みんなのスマホで</b><small>それぞれのスマホで同時に対戦。観戦も予想もできる</small></span><i>›</i></button>' +
      '<button class="cp-mode" data-c="new-local"><span class="cp-mode-ico">📱</span><span class="cp-mode-copy"><b>1台でまわす</b><small>名前を入れるだけ。1台を順番に回して対戦</small></span><i>›</i></button>' +
      '<div class="lb-head"><h2>開催中の大会</h2><span class="lb-live"><i></i>自動更新</span></div><div id="cpCups" class="lb-rooms"><div class="lb-empty small"><div class="lb-spin"></div></div></div>' +
      (hof.length ? '<div class="lb-head"><h2>歴代チャンピオン</h2></div><div class="cp-hof">' + hof.slice(0, 8).map(h =>
        '<div class="cp-hof-row"><span class="cp-emo">' + html(h.emoji) + '</span><span><b>' + html(h.name) + '</b><small>' + html(h.title) + ' ・ ' + h.n + '人 ・ ' + new Date(h.at).toLocaleDateString('ja-JP') + '</small></span><em>👑</em></div>').join('') + '</div>' : ''),
      { back: 'exit', title: '大会モード', sub: 'CUP MODE' });
    startScan();
  }
  async function scanCups() {
    if (U.screen !== 'home' || !root || root.hidden) return;
    try {
      const L = LOB(); await L.ensureFirebase();
      const rows = await Promise.all(L.cupCodes.map(L.readMeta)), now = Date.now();
      U.cups = rows.filter(r => r.meta && L.classify(r.meta, now) !== 'stale' && r.meta.version === NET_PROTOCOL);
    } catch (e) { U.cups = []; }
    const box = q('#cpCups'); if (!box || U.screen !== 'home') return;
    const out = U.cups.length ? U.cups.map(r =>
      '<button class="lb-room cup" data-c="join" data-id="' + r.code + '"><span class="lb-trophy">🏆</span><span class="lb-room-copy"><b>' + html(r.meta.hostName) + '</b><small>' +
      (r.meta.hostUid === NET.uid ? 'あなたが主催' : 'タップで参加・観戦') + '</small></span><span class="lb-go">' + (r.meta.hostUid === NET.uid ? 'ひらく ›' : '参加 ›') + '</span></button>').join('')
      : '<div class="lb-empty small"><b>いま開催中の大会はありません</b><p>「みんなのスマホで」から大会をひらけます。</p></div>';
    if (box.dataset.html !== out) { box.innerHTML = out; box.dataset.html = out; }
  }
  function startScan() { stopScan(); void scanCups(); U.scanTimer = setInterval(() => { if (!document.hidden) void scanCups(); }, 4000); }
  function stopScan() { clearInterval(U.scanTimer); U.scanTimer = 0; }

  /* ---------- 大会をつくる ---------- */
  function paintCreate(kind) {
    stopScan();
    U.view = kind;
    const local = kind === 'local';
    const set = normalizeCardSet(window.COMPILE_CARD_SETS?.get?.() || draft.cardSet);
    const name = myName();
    if (local && !U.localPlayers) U.localPlayers = [];
    const seg = (group, items, current) => '<div class="lb-seg" data-group="' + group + '">' + items.map(([v, l]) => '<button type="button" data-c="seg" data-id="' + group + ':' + v + '" class="' + (String(current) === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    const f = U.form || (U.form = { title: (local ? 'みんな' : name) + '杯', format: 'knockout', set, control: draft.controlEnabled !== false ? 'on' : 'off', play: 'on' });
    frame('<div class="cp-form">' +
      '<label class="cp-field"><small>大会名</small><input id="cpTitle" maxlength="24" value="' + html(f.title) + '"></label>' +
      '<div class="lb-opt"><span>形式</span>' + seg('format', [['knockout', '🏆 トーナメント'], ['league', '🔁 総当たり']], f.format) + '<p class="cp-hint">' + (f.format === 'knockout' ? '負けたら終わりの一発勝負。4人以上で3位決定戦も。' : '全員と1回ずつ対戦。勝ち点で順位が決まる。') + '</p></div>' +
      '<div class="lb-opt"><span>カードセット</span>' + seg('set', [['set1', '第1セット'], ['set2', '第2セット'], ['mixed', '混合']], f.set) + '</div>' +
      '<div class="lb-opt"><span>CONTROLカード</span>' + seg('control', [['on', 'あり'], ['off', 'なし']], f.control) + '</div>' +
      (local ? paintLocalPlayers() : '<div class="lb-opt"><span>自分も出場する</span>' + seg('play', [['on', 'する'], ['off', 'しない（進行役だけ）']], f.play) + '</div>') +
      '<button class="lb-cta" data-c="' + (local ? 'create-local' : 'create-online') + '">' + (local ? '抽選して開幕！' : '大会をひらく') + '</button></div>',
      { back: 'home', title: local ? '1台で大会' : 'みんなのスマホで大会', sub: 'NEW CUP' });
  }
  function paintLocalPlayers() {
    const list = U.localPlayers;
    return '<div class="lb-opt"><span>参加者（' + list.length + '人・3人以上）</span><div class="cp-local-list">' + list.map((p, i) =>
      '<div class="cp-local-row"><button class="cp-emo-btn" data-c="local-emoji" data-id="' + i + '">' + html(p.emoji) + '</button><span><b>' + html(p.name) + '</b><small>' + html(p.title) + '</small></span>' +
      '<button class="cp-x" data-c="local-del" data-id="' + i + '" aria-label="' + html(p.name) + 'を外す">×</button></div>').join('') + '</div>' +
      '<form id="cpAddForm" class="cp-add"><input id="cpAddName" maxlength="18" placeholder="名前を入れて追加" autocomplete="off"><button type="submit" class="cp-add-btn">追加</button></form></div>';
  }
  function readForm() {
    const f = U.form || {};
    const t = q('#cpTitle'); if (t) f.title = t.value.trim().slice(0, 24) || '大会';
    return f;
  }

  /* ---------- 受付（エントリー） ---------- */
  function paintEntry() {
    stopScan();
    const c = U.cup; if (!c) return go('home');
    const host = isHost(), me = personOf(U.me), mine = c.players.some(p => p.id === U.me);
    const cards = c.players.map(p => '<div class="cp-entrant' + (p.id === U.me ? ' me' : '') + (p.fresh ? ' fresh' : '') + '"><span class="cp-emo lg">' + html(p.emoji) + '</span>' +
      '<b>' + html(p.name) + (p.id === c.hostId ? ' <i title="主催">👑</i>' : '') + '</b><small>' + html(p.title || '') + '</small>' + (p.online === false ? '<em class="off">離席中</em>' : '') + '</div>').join('');
    const editor = mine ? '<div class="cp-me-edit"><div class="cp-me-head"><span class="cp-emo lg">' + html(me.emoji) + '</span><span><small>あなたの二つ名</small><b>' + html(me.title) + '</b></span>' +
      '<button class="cp-dice" data-c="reroll" aria-label="二つ名を変える">🎲</button></div><div class="cp-emoji-row">' +
      EMOJIS.map(e => '<button data-c="emoji" data-id="' + e + '" class="' + (e === me.emoji ? 'on' : '') + '">' + e + '</button>').join('') + '</div></div>' : '';
    const settings = '<div class="cp-tags"><span>' + (c.format === 'knockout' ? '🏆 トーナメント' : '🔁 総当たり') + '</span><span>' + html(CARD_SET_LABELS[normalizeCardSet(c.cardSet)] || c.cardSet) + '</span><span>CONTROL ' + (c.controlEnabled ? 'あり' : 'なし') + '</span></div>';
    frame('<div class="cp-entry-head"><div class="cp-cupname">' + html(c.title) + '</div>' + settings +
      '<div class="cp-count"><b>' + c.players.length + '</b><span>人がエントリー</span><i class="cp-pulse"></i></div></div>' +
      '<div class="cp-entrants">' + cards + '</div>' + editor +
      (host ? '<button class="lb-cta" data-c="draw" ' + (c.players.length < 3 ? 'disabled' : '') + '>🎲 抽選して開幕！</button>' +
        (c.players.length < 3 ? '<p class="cp-hint center">あと' + (3 - c.players.length) + '人で開幕できます</p>' : '') +
        '<p class="lb-hint">友達は「オンライン対戦」を開くと<br><b>🏆 ' + html(c.title) + '</b> が出てきます。タップで参加できます。</p>'
        : '<p class="lb-match-wait center">主催者の開幕を待っています<span class="lb-dots"><i>.</i><i>.</i><i>.</i></span></p>') +
      (c.watchers.length ? '<p class="cp-hint center">観戦：' + c.watchers.map(w => html(w.emoji + ' ' + w.name)).join('、') + '</p>' : '') +
      '<button class="lb-ghost" data-c="' + (host ? 'close' : 'leave') + '">' + (host ? '大会をとりやめる' : '大会から抜ける') + '</button>',
      { back: 'home', title: 'エントリー受付中', sub: 'ENTRY' });
    for (const p of c.players) delete p.fresh;
  }
  function arrival(p) {
    p.fresh = true; sfx('turn');
    const el = document.createElement('div'); el.className = 'cp-arrival';
    el.innerHTML = '<span class="cp-emo lg">' + html(p.emoji) + '</span><span><small>エントリー！</small><b>' + html(p.name) + '</b><em>' + html(p.title || '') + '</em></span>';
    document.body.append(el); setTimeout(() => el.remove(), 2600);
  }

  /* ---------- 大会の本体（トーナメント表／総当たり） ---------- */
  function statusChip(m) {
    if (m.status === 'live') return '<span class="cp-chip live"><i></i>LIVE</span>';
    if (m.status === 'done') return m.walkover ? '<span class="cp-chip">不戦勝</span>' : '<span class="cp-chip done">' + (m.turns ? m.turns + 'T' : '済') + '</span>';
    if (m.status === 'bye') return '<span class="cp-chip">シード</span>';
    if (m.status === 'ready') return '<span class="cp-chip ready">対戦前</span>';
    return '<span class="cp-chip wait">待機</span>';
  }
  function sideRow(m, side) {
    const id = m[side], s = m.score ? m.score[side === 'a' ? 0 : 1] : '', won = m.winner && m.winner === id, lost = m.status === 'done' && m.winner !== id;
    if (!id) return m.status === 'bye' ? '<div class="cp-side tbd bye"><b>シードで通過</b></div>' : '<div class="cp-side tbd"><span class="cp-emo sm">？</span><b>未定</b></div>';
    return '<div class="cp-side' + (won ? ' won' : '') + (lost ? ' lost' : '') + (id === U.me ? ' me' : '') + '">' + emo(id, 'sm') + '<b>' + html(nameOf(id)) + '</b><em>' + (s === '' ? '' : s) + '</em></div>';
  }
  function matchCard(m, extra = '') {
    const votes = C.pickCounts(m), total = votes.a + votes.b;
    return '<button class="cp-match ' + m.status + (m.a === U.me || m.b === U.me ? ' mine' : '') + '" data-c="match" data-id="' + m.id + '" ' + extra + '>' +
      '<div class="cp-match-top"><small>' + html(C.roundLabel(U.cup, m.round, m)) + '</small>' + statusChip(m) + '</div>' + sideRow(m, 'a') + sideRow(m, 'b') +
      (total ? '<div class="cp-votebar"><i style="width:' + Math.round(votes.a / total * 100) + '%"></i></div>' : '') + '</button>';
  }
  function bracketHTML() {
    const c = U.cup, R = c.rounds, W = 156, H = 86, GAP = 14, COL = 40;
    const pos = {}, first = c.matches.filter(m => m.round === 1 && !m.bronze);
    first.forEach((m, i) => { pos[m.id] = { x: 0, y: i * (H + GAP) }; });
    for (let r = 2; r <= R; r++) c.matches.filter(m => m.round === r && !m.bronze).forEach(m => {
      const [a, b] = m.from.map(id => pos[id]);
      pos[m.id] = { x: (r - 1) * (W + COL), y: (a.y + b.y) / 2 };
    });
    const final = c.matches.find(m => m.round === R && !m.bronze), bronze = c.matches.find(m => m.bronze);
    let height = first.length * (H + GAP);
    if (bronze) { pos[bronze.id] = { x: (R - 1) * (W + COL), y: pos[final.id].y + H + 54 }; height = Math.max(height, pos[bronze.id].y + H + 10); }
    const width = R * (W + COL) + 128;
    const lines = c.matches.filter(m => m.from && !m.bronze).map(m => m.from.map(fid => {
      const f = c.matches.find(x => x.id === fid), a = pos[fid], b = pos[m.id];
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = x1 + COL / 2;
      const hot = f.status === 'done' || (f.status === 'bye' && f.winner);
      return '<path class="' + (hot ? 'hot' : '') + '" d="M' + x1 + ' ' + y1 + 'H' + mx + 'V' + y2 + 'H' + x2 + '"/>';
    }).join('')).join('');
    const champ = c.status === 'done' ? c.champion : null, fp = pos[final.id];
    const crown = '<div class="cp-crown' + (champ ? ' won' : '') + '" style="left:' + (fp.x + W + COL) + 'px;top:' + (fp.y + H / 2 - 44) + 'px"><span>🏆</span><b>' + (champ ? html(nameOf(champ)) : '優勝は？') + '</b></div>';
    const svgLine = '<path class="' + (final.status === 'done' ? 'hot' : '') + '" d="M' + (fp.x + W) + ' ' + (fp.y + H / 2) + 'H' + (fp.x + W + COL) + '"/>';
    const cards = c.matches.map(m => pos[m.id] ? '<div class="cp-bslot" style="left:' + pos[m.id].x + 'px;top:' + pos[m.id].y + 'px;width:' + W + 'px">' +
      (m.bronze ? '<div class="cp-bronze-label">3位決定戦</div>' : '') + matchCard(m) + '</div>' : '').join('');
    const heads = Array.from({ length: R }, (_, i) => '<span style="left:' + (i * (W + COL)) + 'px;width:' + W + 'px">' + html(C.roundLabel(c, i + 1)) + '</span>').join('');
    return '<div class="cp-bracket-wrap" id="cpBracket"><div class="cp-bracket-heads" style="width:' + width + 'px">' + heads + '</div>' +
      '<div class="cp-bracket" style="width:' + width + 'px;height:' + height + 'px"><svg width="' + width + '" height="' + height + '" aria-hidden="true">' + lines + svgLine + '</svg>' + cards + crown + '</div></div>';
  }
  function leagueHTML() {
    const c = U.cup, st = C.standings(c);
    const table = '<div class="cp-table"><div class="cp-tr head"><span>#</span><span>プレイヤー</span><span>勝</span><span>敗</span><span>差</span><span>点</span></div>' + st.map(r =>
      '<div class="cp-tr' + (r.id === U.me ? ' me' : '') + (r.rank === 1 && r.played ? ' top' : '') + '"><span>' + r.rank + '</span><span class="who">' + emo(r.id, 'sm') + '<b>' + html(r.name) + '</b></span><span>' + r.wins + '</span><span>' + r.losses + '</span><span>' + (r.diff > 0 ? '+' : '') + r.diff + '</span><span class="pts">' + r.points + '</span></div>').join('') + '</div>';
    const rounds = [...new Set(c.matches.map(m => m.round))];
    return table + '<p class="cp-hint">勝ち=3点。並んだらコンパイル差 → 直接対決。</p>' + rounds.map(r => '<div class="cp-round"><h3>' + html(C.roundLabel(c, r)) + '</h3><div class="cp-round-grid">' +
      c.matches.filter(m => m.round === r).map(m => matchCard(m)).join('') + '</div></div>').join('');
  }
  function myCardHTML() {
    const c = U.cup;
    if (c.status === 'done') {
      const st = C.standings(c), me = st.find(r => r.id === U.me);
      return '<div class="cp-mycard done"><span class="cp-big">🏆</span><div><small>大会終了</small><b>優勝：' + html(nameOf(c.champion)) + '</b>' + (me ? '<em>あなたは ' + me.rank + '位</em>' : '') + '</div>' +
        '<button data-c="ceremony">表彰式</button></div>';
    }
    if (!online()) {
      const live = c.matches.find(m => m.status === 'live');
      if (live) return '<div class="cp-mycard live"><span class="cp-big">⚔️</span><div><small>' + html(C.roundLabel(c, live.round, live)) + ' 対戦中</small><b>' + html(nameOf(live.a)) + ' vs ' + html(nameOf(live.b)) + '</b></div>' +
        (U.match ? '<button data-c="return">試合にもどる</button>' : '<button data-c="match" data-id="' + live.id + '">メニュー</button>') + '</div>';
      const next = c.matches.find(m => C.canStart(c, m.id));
      if (next) return '<div class="cp-mycard ready"><span class="cp-big">' + html(emojiOf(next.a)) + '</span><div><small>次の試合 ・ ' + html(C.roundLabel(c, next.round, next)) + '</small><b>' + html(nameOf(next.a)) + ' vs ' + html(nameOf(next.b)) + '</b>' +
        '<em>予想してからスタート！</em></div><button data-c="match" data-id="' + next.id + '">はじめる</button></div>';
      return '<div class="cp-mycard"><span class="cp-big">⏳</span><div><small>準備中</small><b>次の組み合わせを待っています</b></div></div>';
    }
    if (U.role === 'watcher' || !c.players.some(p => p.id === U.me)) return '<div class="cp-mycard"><span class="cp-big">👀</span><div><small>観戦中</small><b>勝敗を予想して楽しもう</b></div></div>';
    const live = c.matches.find(m => m.status === 'live' && (m.a === U.me || m.b === U.me));
    if (live) {
      const opp = live.a === U.me ? live.b : live.a;
      return '<div class="cp-mycard live"><span class="cp-big">⚔️</span><div><small>' + html(C.roundLabel(c, live.round, live)) + ' 対戦中</small><b>vs ' + html(nameOf(opp)) + '</b></div><button data-c="return">試合にもどる</button></div>';
    }
    const ready = c.matches.find(m => m.status === 'ready' && (m.a === U.me || m.b === U.me));
    if (ready) {
      const opp = ready.a === U.me ? ready.b : ready.a, ok = C.canStart(c, ready.id);
      return '<div class="cp-mycard ready"><span class="cp-big">' + html(emojiOf(opp)) + '</span><div><small>あなたの出番！ ' + html(C.roundLabel(c, ready.round, ready)) + '</small><b>vs ' + html(nameOf(opp)) + '</b>' +
        (ok ? '' : '<em>相手が別の試合中です</em>') + '</div><button data-c="start" data-id="' + ready.id + '" ' + (ok ? '' : 'disabled') + '>対戦をはじめる</button></div>';
    }
    const alive = c.format === 'league' || c.matches.some(m => m.status === 'wait' && (!m.a || !m.b) && feedsMe(m));
    return '<div class="cp-mycard"><span class="cp-big">' + (alive ? '⏳' : '🎉') + '</span><div><small>' + (alive ? '次の相手を待っています' : 'おつかれさま！') + '</small><b>' + (alive ? '観戦して予想しよう' : '観戦と予想で盛り上げよう') + '</b></div></div>';
  }
  function feedsMe(m) {
    // 自分が勝ち上がる可能性のある試合か（トーナメント）
    const c = U.cup, seen = new Set();
    const walk = id => { const x = c.matches.find(y => y.id === id); if (!x || seen.has(id)) return false; seen.add(id);
      if (x.a === U.me || x.b === U.me) return x.status !== 'done' || x.winner === U.me;
      return (x.from || []).some(walk); };
    return (m.from || []).some(walk);
  }
  function paintMain() {
    stopScan();
    const c = U.cup; if (!c) return go('home');
    if (c.status === 'entry') return go('entry');
    const live = c.matches.filter(m => m.status === 'live');
    const curRound = Math.min(...c.matches.filter(m => ['ready', 'live', 'wait'].includes(m.status)).map(m => m.round).concat([c.rounds]));
    const label = c.status === 'done' ? '大会終了' : C.roundLabel(c, curRound, c.matches.find(m => m.round === curRound && !m.bronze));
    const last = c.feed[c.feed.length - 1];
    const preds = C.predictionBoard(c);
    const body = '<div class="cp-main-head"><div class="cp-cupname">' + html(c.title) + '</div><div class="cp-tags"><span>' + html(label) + '</span>' +
      (live.length ? '<span class="live"><i></i>LIVE ' + live.length + '試合</span>' : '') + '<span>' + c.players.length + '人</span></div></div>' +
      (last ? '<div class="cp-ticker' + (U.lastTicker === last.at + last.text ? ' still' : '') + '" aria-live="polite"><span>' + html(last.text) + '</span></div>' : '') +
      myCardHTML() +
      (live.length && online() ? '<div class="lb-head"><h2>いま対戦中</h2></div><div class="cp-live-list">' + live.map(m =>
        '<button class="cp-live" data-c="watch" data-id="' + m.id + '"><span>' + emo(m.a, 'sm') + html(nameOf(m.a)) + '</span><em>' + liveScore(m) + '</em><span>' + html(nameOf(m.b)) + emo(m.b, 'sm') + '</span><b>観戦 ›</b></button>').join('') + '</div>' : '') +
      '<div class="lb-head"><h2>' + (c.format === 'knockout' ? 'トーナメント表' : '順位と対戦表') + '</h2><small class="cp-hint">試合をタップで予想・観戦</small></div>' +
      (c.format === 'knockout' ? bracketHTML() : leagueHTML()) +
      (preds.length ? '<div class="lb-head"><h2>予想ランキング</h2></div><div class="cp-preds">' + preds.slice(0, 6).map((r, i) =>
        '<div class="cp-pred"><span>' + (i + 1) + '</span>' + '<span class="cp-emo sm">' + html(r.emoji || '🙂') + '</span><b>' + html(r.name) + '</b><em>' + r.points + 'pt</em><small>' + r.hits + '/' + r.picks + '的中</small></div>').join('') + '</div>' : '') +
      '<div class="lb-head"><h2>実況</h2></div><div class="cp-feed">' + c.feed.slice(-10).reverse().map(f => '<div><small>' + new Date(f.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '</small>' + html(f.text) + '</div>').join('') + '</div>' +
      (isHost() ? (c.status === 'done' ? '<button class="lb-cta" data-c="again">🔁 同じメンバーでもう一回</button>' : '') + '<button class="lb-ghost" data-c="close">' + (c.status === 'done' ? '大会を閉じる' : '大会を終了する') + '</button>'
        : '<button class="lb-ghost" data-c="leave">大会から抜ける</button>');
    if (last) U.lastTicker = last.at + last.text;
    frame(body, { back: 'home', title: c.status === 'done' ? '大会結果' : '大会進行中', sub: c.format === 'knockout' ? 'TOURNAMENT' : 'LEAGUE', foot: online() ? reactBar() : '' });
    const wrap = q('#cpBracket');
    if (wrap) {
      const key = c.id + ':' + curRound;
      wrap.scrollLeft = U.bracketKey === key && U.bracketScroll != null ? U.bracketScroll : Math.max(0, (curRound - 1) * 196 - 20);
      U.bracketKey = key; U.bracketScroll = wrap.scrollLeft;
      wrap.addEventListener('scroll', () => { U.bracketScroll = wrap.scrollLeft; }, { passive: true });
    }
  }
  function liveScore(m) {
    const b = U.boards[m.id]; if (!b) return 'VS';
    const s = b.players.map(p => p.protocols.filter(x => x.c).length);
    return s[0] + ' - ' + s[1];
  }
  function reactBar() { return '<div class="cp-reacts" role="toolbar" aria-label="応援スタンプ">' + REACTIONS.map(e => '<button data-c="react" data-id="' + e + '">' + e + '</button>').join('') + '</div>'; }

  /* ---------- 試合のくわしい操作（予想・観戦・主催者メニュー） ---------- */
  function matchSheet(mid) {
    const c = U.cup, m = matchById(mid); if (!m || !m.a && !m.b) return;
    const votes = C.pickCounts(m), mine = m.picks?.[U.me], canPickNow = online() && C.canPick(c, mid, U.me, U.boards[mid]?.turn || 0);
    const side = s => '<button class="cp-pickside' + (mine === s ? ' on' : '') + '" data-c="pick" data-id="' + mid + ':' + s + '" ' + (canPickNow && m[s] ? '' : 'disabled') + '>' +
      '<span class="cp-emo lg">' + html(emojiOf(m[s])) + '</span><b>' + html(m[s] ? nameOf(m[s]) : '未定') + '</b><small>' + html(personOf(m[s])?.title || '') + '</small><em>' + votes[s] + '票</em></button>';
    const buttons = [];
    if (m.status === 'ready' && (m.a === U.me || m.b === U.me || isHost())) buttons.push('<button class="lb-cta" data-c="start" data-id="' + mid + '" ' + (C.canStart(c, mid) ? '' : 'disabled') + '>この試合をはじめる</button>');
    if (m.status === 'live' && online()) buttons.push('<button class="lb-cta" data-c="watch" data-id="' + mid + '">観戦する</button>');
    if ((m.status === 'done' || m.status === 'live') && U.boards[mid]) buttons.push('<button class="lb-ghost" data-c="watch" data-id="' + mid + '">' + (m.status === 'done' ? '最終盤面を見る' : '盤面を見る') + '</button>');
    if (isHost() && ['ready', 'live'].includes(m.status) && m.a && m.b) {
      buttons.push('<details class="cp-admin"><summary>主催者メニュー</summary><p>通信トラブルなどで試合ができないとき用です。</p>' +
        (m.status === 'live' ? '<button class="lb-ghost" data-c="reset" data-id="' + mid + '">試合をやり直しにする</button>' : '') +
        '<button class="lb-ghost" data-c="walkover" data-id="' + mid + ':a">' + html(nameOf(m.a)) + ' の勝ちにする</button>' +
        '<button class="lb-ghost" data-c="walkover" data-id="' + mid + ':b">' + html(nameOf(m.b)) + ' の勝ちにする</button></details>');
    }
    const localPick = !online() && m.status === 'ready' && m.a && m.b;
    const others = localPick ? c.players.filter(p => p.id !== m.a && p.id !== m.b) : [];
    const lrows = others.length ? '<div class="cp-lpicks"><h4>みんなの予想（自分の名前の行をタップ）</h4>' + others.map(p =>
      '<div class="cp-lpick"><span>' + html(p.emoji + ' ' + p.name) + '</span>' + ['a', 'b'].map(sd => '<button data-c="lpick" data-id="' + mid + ':' + p.id + ':' + sd + '" class="' + (m.picks[p.id] === sd ? 'on' : '') + '">' + html(nameOf(m[sd])) + '</button>').join('') + '</div>').join('') + '</div>' : '';
    const note = m.status === 'done' ? (m.walkover ? '不戦勝' : '勝者：' + html(nameOf(m.winner)) + '（' + m.score.join(' - ') + '・' + m.turns + 'ターン）') :
      canPickNow ? 'どっちが勝つ？ タップで予想' : localPick ? '始める前に、出場しない人は勝敗を予想！' : (m.a === U.me || m.b === U.me) ? '自分の試合は予想できません' : m.status === 'live' ? '予想の受付は終わりました' : '';
    sheetOpen('<h3>' + html(C.roundLabel(c, m.round, m)) + '</h3><p class="lb-note">' + note + '</p><div class="cp-pick">' + side('a') + '<span class="cp-pick-vs">VS</span>' + side('b') + '</div>' + lrows + buttons.join('') +
      '<button class="lb-ghost" data-c="sheet-close">とじる</button>');
  }
  function sheetOpen(content) {
    const old = q('#cpSheet'), again = !!old; old?.remove();
    // 画面の更新（大会の状態が届くたびに描き直す）で消えないよう、body に置く
    const el = document.createElement('div'); el.id = 'cpSheet'; el.className = 'lb-sheet cp-sheet' + (again ? ' show instant' : '');
    el.innerHTML = '<div class="lb-sheet-bg" data-c="sheet-close"></div><div class="lb-sheet-card" role="dialog">' + content + '</div>';
    el.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) void act(b.dataset.c, b.dataset.id || '', b); });
    document.body.append(el); if (!again) requestAnimationFrame(() => el.classList.add('show'));
  }
  const sheetClose = () => q('#cpSheet')?.remove();

  /* ---------- 観戦 ---------- */
  function paintWatch(update) {
    const c = U.cup, mid = U.watching, m = matchById(mid), b = U.boards[mid];
    if (!m) return go('main');
    const cardHTML = x => x === 0 ? '<div class="cp-pc back"><span>?</span></div>' :
      '<div class="cp-pc" style="--pc:' + (pmetaSafe(x[0]).ac) + '"><b>' + x[1] + '</b><small>' + html(pmetaSafe(x[0]).k || x[0]) + '</small></div>';
    const lanes = b ? [0, 1, 2].map(l => '<div class="cp-lane"><div class="cp-lane-side top">' + sideLane(b, 1, l, cardHTML) + '</div><div class="cp-lane-mid">LINE ' + (l + 1) + '</div><div class="cp-lane-side">' + sideLane(b, 0, l, cardHTML) + '</div></div>').join('')
      : '<div class="lb-empty"><div class="lb-spin"></div><b>ドラフト中です</b><p>盤面がそろうと表示されます。</p></div>';
    const hud = b ? '<div class="cp-watch-hud"><span class="' + (b.current === 1 ? 'turn' : '') + '">' + emo(m.b, 'sm') + html(nameOf(m.b)) + ' <small>手札' + b.players[1].hand + '</small></span><em>TURN ' + b.turn + '</em><span class="' + (b.current === 0 ? 'turn' : '') + '">' + emo(m.a, 'sm') + html(nameOf(m.a)) + ' <small>手札' + b.players[0].hand + '</small></span></div>' : '';
    if (update && q('#cpWatchBoard')) { q('#cpWatchBoard').innerHTML = lanes; q('#cpWatchHud').innerHTML = hud; q('#cpWatchScore').textContent = liveScore(m); return; }
    frame('<div class="cp-watch-title">' + emo(m.a) + '<b>' + html(nameOf(m.a)) + '</b><em id="cpWatchScore">' + liveScore(m) + '</em><b>' + html(nameOf(m.b)) + '</b>' + emo(m.b) + '</div>' +
      '<div id="cpWatchHud">' + hud + '</div><div class="cp-watch" id="cpWatchBoard">' + lanes + '</div>' +
      '<p class="cp-hint center">見えるのは場の公開情報だけ。手札と裏向きカードの中身は見えません。</p>' +
      (m.status !== 'done' ? '<button class="lb-ghost" data-c="match" data-id="' + mid + '">予想する</button>' : ''),
      { back: 'main', title: C.roundLabel(c, m.round, m) + (m.status === 'live' ? ' LIVE' : ''), sub: 'WATCH', foot: online() ? reactBar() : '' });
  }
  function sideLane(b, p, l, cardHTML) {
    const pr = b.players[p].protocols[l], stack = b.players[p].lines[l];
    return '<div class="cp-proto' + (pr.c ? ' done' : '') + '"><span>' + html(pr.n) + '</span>' + (pr.c ? '<i>COMPILED</i>' : '') + '<b>' + (b.totals?.[p]?.[l] ?? '–') + '</b></div>' +
      '<div class="cp-stack">' + (stack.length ? stack.map(cardHTML).join('') : '<span class="cp-empty">—</span>') + '</div>';
  }
  function pmetaSafe(p) { try { return pmeta(p) || {}; } catch (e) { return { ac: '#9fd8ff' }; } }

  /* ---------- 演出：抽選・VS・表彰・スタンプ ---------- */
  function showDraw(done) {
    const c = U.cup; q('#cpDraw')?.remove();
    const el = document.createElement('div'); el.id = 'cpDraw'; el.className = 'cp-overlay cp-draw';
    const pairs = c.format === 'knockout' ? c.matches.filter(m => m.round === 1) : null;
    const slots = pairs ? pairs.map(m => [m.a, m.b]) : c.players.map(p => [p.id]);
    el.innerHTML = '<div class="cp-draw-box"><small>' + html(c.title) + '</small><h2>組み合わせ抽選</h2><div class="cp-draw-list">' + slots.map((s, i) =>
      '<div class="cp-draw-row" data-i="' + i + '">' + s.map(id => '<span class="cp-draw-slot" data-final="' + (id || '') + '"><i>？</i></span>').join(pairs ? '<em>VS</em>' : '') + '</div>').join('') +
      '</div><p class="cp-draw-msg">運命の組み合わせは…</p><button class="cp-skip" aria-label="とばす">スキップ ›</button></div>';
    document.body.append(el);
    const names = c.players.map(p => p.emoji + ' ' + p.name);
    const slotEls = [...el.querySelectorAll('.cp-draw-slot')];
    let finished = false, i = 0;
    const finish = () => {
      if (finished) return; finished = true;
      slotEls.forEach(s => lockSlot(s));
      el.querySelector('.cp-draw-msg').textContent = '組み合わせ決定！';
      sfx('compile'); jingle('draw-done');
      setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); done?.(); }, 450); }, 1300);
    };
    const lockSlot = s => {
      if (s.dataset.locked) return; s.dataset.locked = '1';
      const id = s.dataset.final;
      s.innerHTML = id ? '<i>' + html(emojiOf(id)) + '</i><b>' + html(nameOf(id)) + '</b>' : '<b class="seed">シード</b>';
      s.classList.add('locked');
    };
    el.querySelector('.cp-skip').onclick = finish;
    const spin = setInterval(() => {
      if (finished) { clearInterval(spin); return; }
      slotEls.forEach((s, k) => { if (!s.dataset.locked && k >= i) s.innerHTML = '<i>' + html(pick(names)) + '</i>'; });
    }, 70);
    jingle('draw');
    const step = Math.max(160, Math.min(520, 3400 / Math.max(1, slotEls.length)));
    const tick = () => {
      if (finished) return;
      if (i >= slotEls.length) { clearInterval(spin); finish(); return; }
      lockSlot(slotEls[i]); sfx('flip'); i++;
      setTimeout(tick, step);
    };
    setTimeout(tick, 900);
  }
  function headline(m) {
    const c = U.cup, st = C.standings(c), ra = st.find(r => r.id === m.a), rb = st.find(r => r.id === m.b);
    if (m.bronze) return '表彰台をかけた最後の一戦！';
    if (c.format === 'knockout' && m.round === c.rounds) return '頂上決戦！ 勝てば優勝！';
    if (c.format === 'knockout' && m.round === c.rounds - 1) return '決勝への切符はどっちだ！';
    const votes = C.pickCounts(m);
    if (votes.a + votes.b >= 2 && votes.a !== votes.b) return (votes.a > votes.b ? nameOf(m.b) : nameOf(m.a)) + '、下剋上なるか！';
    if (ra && rb && ra.wins > 0 && rb.wins > 0 && !ra.losses && !rb.losses) return '無敗どうしの激突！';
    if (ra && rb && ra.wins >= 2 && rb.wins >= 2) return '実力者どうしの一戦！';
    return pick(['熱い一戦がはじまる！', '負けられない戦いがここにある', 'さあ、思考を武器に！', '勝つのはどっちだ！']);
  }
  function showVS(m, done) {
    q('#cpVS')?.remove();
    const el = document.createElement('div'); el.id = 'cpVS'; el.className = 'cp-overlay cp-vs';
    const side = (id, cls) => '<div class="cp-vs-side ' + cls + '"><span class="cp-emo xxl">' + html(emojiOf(id)) + '</span><b>' + html(nameOf(id)) + '</b><small>' + html(personOf(id)?.title || '') + '</small></div>';
    el.innerHTML = '<div class="cp-vs-stage"><div class="cp-vs-round">' + html(U.cup.title) + ' ・ ' + html(C.roundLabel(U.cup, m.round, m)) + '</div>' + side(m.a, 'left') +
      '<div class="cp-vs-mark">VS</div>' + side(m.b, 'right') + '<div class="cp-vs-head">' + html(headline(m)) + '</div></div>';
    document.body.append(el);
    jingle('vs'); sfx('cutin');
    let closed = false;
    const close = () => { if (closed) return; closed = true; el.classList.add('out'); setTimeout(() => { el.remove(); done?.(); }, 380); };
    el.onclick = close; setTimeout(close, 3000);
  }
  function showChampion() {
    const c = U.cup; if (!c || c.status !== 'done') return;
    q('#cpChampion')?.remove();
    const champ = c.players.find(p => p.id === c.champion) || { name: '？', emoji: '🏆', title: '' };
    const aw = C.awards(c), st = C.standings(c).slice(0, 4);
    const el = document.createElement('div'); el.id = 'cpChampion'; el.className = 'cp-overlay cp-champ';
    el.innerHTML = '<div class="cp-confetti" aria-hidden="true">' + Array.from({ length: 36 }, (_, i) => '<i style="--x:' + Math.round(Math.random() * 100) + ';--d:' + (Math.random() * 1.6).toFixed(2) + 's;--h:' + Math.round(Math.random() * 360) + ';--r:' + Math.round(Math.random() * 720 - 360) + 'deg"></i>').join('') + '</div>' +
      '<div class="cp-champ-box"><small>' + html(c.title) + '</small><div class="cp-champ-trophy">🏆</div><div class="cp-champ-label">CHAMPION</div>' +
      '<div class="cp-champ-name"><span class="cp-emo xl">' + html(champ.emoji) + '</span><b>' + html(champ.name) + '</b></div><em>' + html(champ.title || '') + '</em>' +
      '<div class="cp-podium">' + st.map(r => '<div class="p' + r.rank + '"><span>' + (['', '🥇', '🥈', '🥉', '4'][r.rank] || r.rank) + '</span>' + '<span class="cp-emo sm">' + html(r.emoji) + '</span><b>' + html(r.name) + '</b></div>').join('') + '</div>' +
      (aw.filter(a => !['優勝', '準優勝', '3位'].includes(a.title)).length ? '<div class="cp-awards"><h3>表彰</h3>' + aw.filter(a => !['優勝', '準優勝', '3位'].includes(a.title)).map(a =>
        '<div class="cp-award"><span>' + a.icon + '</span><div><b>' + html(a.title) + '</b><small>' + html(a.name) + (a.note ? ' ・ ' + html(a.note) : '') + '</small></div></div>').join('') + '</div>' : '') +
      '<button class="lb-cta" data-x="close">トーナメント表を見る</button></div>';
    document.body.append(el);
    jingle('champion'); sfx('victory');
    el.querySelector('[data-x="close"]').onclick = () => { el.classList.add('out'); setTimeout(() => el.remove(), 380); if (!U.match) openRoot('main'); };
  }
  function floatReact(pid, emoji) {
    const layer = q('#cpReactLayer') || (() => { const l = document.createElement('div'); l.id = 'cpReactLayer'; document.body.append(l); return l; })();
    const el = document.createElement('div'); el.className = 'cp-float' + (U.match && G && G.winner == null ? ' ingame' : '');
    el.style.setProperty('--x', String(U.match ? 82 + Math.random() * 12 : 12 + Math.random() * 76));
    el.innerHTML = '<span>' + html(emoji) + '</span><small>' + html(nameOf(pid)) + '</small>';
    layer.append(el); setTimeout(() => el.remove(), 2400);
  }

  /* ---------- 試合中の「大会」ボタン ---------- */
  function updateChip() {
    if (!chip) { chip = document.createElement('button'); chip.id = 'cpChip'; chip.onclick = () => { if (U.match && G?.winner != null) void leaveMatch({ toCup: true }); else openRoot('main'); }; document.body.append(chip); }
    const show = !!U.match && !!U.cup;
    chip.hidden = !show;
    if (show) chip.innerHTML = '<span>🏆</span><b>' + (G?.winner != null ? '大会にもどる' : 'トーナメント表') + '</b>';
  }

  /* 名前がまだなら聞く（オンライン対戦と共通の名前） */
  function ensureName() {
    if (myName() && myName() !== 'PLAYER') return Promise.resolve(true);
    return new Promise(resolve => {
      sheetOpen('<h3>あなたの名前</h3><p class="lb-note">大会やオンライン対戦で表示されます。</p><form id="cpNameForm" class="lb-word"><input id="cpNameInput" maxlength="18" autocomplete="nickname" placeholder="名前"></form>' +
        '<button class="lb-cta" id="cpNameOk">OK</button><button class="lb-ghost" id="cpNameNo">やめる</button>');
      const finish = ok => { const v = (q('#cpNameInput')?.value || '').trim(); if (ok && !v) { toast('名前を入れてください'); return; } if (ok) LOB().setMyName(v); sheetClose(); resolve(ok); };
      q('#cpNameOk').onclick = () => finish(true); q('#cpNameNo').onclick = () => finish(false);
      q('#cpNameForm').onsubmit = e => { e.preventDefault(); finish(true); };
      setTimeout(() => q('#cpNameInput')?.focus(), 60);
    });
  }

  /* ---------- 操作 ---------- */
  async function act(type, id, el) {
    try {
      if (type === 'exit') { hideRoot(); return; }
      if (type === 'home') { sheetClose(); U.form = null; go('home'); return; }
      if (type === 'main') { go(U.cup ? (U.cup.status === 'entry' ? 'entry' : 'main') : 'home'); return; }
      if (type === 'sheet-close') return sheetClose();
      if (type === 'new-online') { if (!await ensureName()) return; U.form = null; return go('create', 'online'); }
      if (type === 'new-local') { U.form = null; U.localPlayers = U.localPlayers || []; return go('create', 'local'); }
      if (type === 'seg') {
        const [k, v] = id.split(':'); const f = readForm(); f[k] = v;
        el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
        if (k === 'format') paint();
        return;
      }
      if (type === 'local-add') {
        const input = q('#cpAddName'), name = (input?.value || '').trim().slice(0, 18);
        if (!name) return;
        if (U.localPlayers.length >= C.MAX_PLAYERS) { toast('16人までです'); return; }
        if (U.localPlayers.some(p => p.name === name)) { toast('同じ名前がいます'); return; }
        readForm();
        U.localPlayers.push({ name, emoji: EMOJIS[U.localPlayers.length % EMOJIS.length], title: randomTitle() });
        paint(); setTimeout(() => q('#cpAddName')?.focus(), 30); return;
      }
      if (type === 'local-del') { readForm(); U.localPlayers.splice(Number(id), 1); paint(); return; }
      if (type === 'local-emoji') { readForm(); const p = U.localPlayers[Number(id)]; p.emoji = EMOJIS[(EMOJIS.indexOf(p.emoji) + 1) % EMOJIS.length]; p.title = randomTitle(); paint(); return; }
      if (type === 'create-local') {
        const f = readForm();
        if (U.localPlayers.length < 3) { toast('3人以上入れてください'); return; }
        hostLocal({ title: f.title, format: f.format, cardSet: f.set, controlEnabled: f.control !== 'off', players: U.localPlayers.slice() });
        U.localPlayers = null; return;
      }
      if (type === 'create-online') {
        const f = readForm();
        if (U.busy) return; U.busy = true; el.disabled = true; el.textContent = '準備しています…';
        try { await hostOnline({ title: f.title, format: f.format, cardSet: f.set, controlEnabled: f.control !== 'off', play: f.play !== 'off' }); U.form = null; }
        finally { U.busy = false; }
        return;
      }
      if (type === 'join') { if (!await ensureName()) return; await joinOnline(id); return; }
      if (type === 'resume') { go(U.cup.status === 'entry' ? 'entry' : 'main'); return; }
      if (type === 'restore') { const s = loadStore(); if (s?.cup) { await restoreHost(s); go(U.cup.status === 'entry' ? 'entry' : 'main'); } return; }
      if (type === 'relink') { const l = loadLink(); if (l?.cupCode) await joinOnline(l.cupCode); return; }
      if (type === 'reroll' || type === 'emoji') {
        const p = profile();
        if (type === 'reroll') p.title = randomTitle(); else p.emoji = id;
        saveProfile(p);
        const me = personOf(U.me); if (me) { me.emoji = p.emoji; me.title = p.title; }
        if (isHost()) { C.bump(U.cup); changed(); } else { guestSend({ t: 'profile', emoji: p.emoji, title: p.title }); paint(); }
        if (type === 'reroll') sfx('flip');
        return;
      }
      if (type === 'draw') return doDraw();
      if (type === 'match') { sheetClose(); return matchSheet(id); }
      if (type === 'start') { sheetClose(); return requestStart(id); }
      if (type === 'pick') {
        const [mid, side] = id.split(':');
        if (!online()) { const m = matchById(mid); m.picks.local = side; save(); sheetClose(); paint(); return; }
        sendPick(mid, side); sheetClose(); return;
      }
      if (type === 'watch') { sheetClose(); U.watching = id; go('watch'); return; }
      if (type === 'lpick') {
        const [mid, pid, side] = id.split(':'), m = matchById(mid);
        if (m && m.status === 'ready' && pid !== m.a && pid !== m.b) { m.picks[pid] = m.picks[pid] === side ? undefined : side; if (!m.picks[pid]) delete m.picks[pid]; C.bump(U.cup); save(); matchSheet(mid); sfx('ui'); }
        return;
      }
      if (type === 'react') return sendReact(id);
      if (type === 'return') { hideRoot(); return; }
      if (type === 'ceremony') return showChampion();
      if (type === 'again') return again();
      if (type === 'reset') { sheetClose(); if (C.reset(U.cup, id)) { C.feed(U.cup, 'start', '↩ 試合をやり直しにしました'); changed({ now: true }); if (U.match?.mid === id) await leaveMatch({ toCup: true }); } return; }
      if (type === 'walkover') {
        sheetClose(); const [mid, s] = id.split(':'), m = matchById(mid); if (!m) return;
        const before = U.cup.status;
        if (U.match?.mid === mid) await leaveMatch({ quiet: true });
        if (C.result(U.cup, mid, m[s], null, 0, { walkover: true })) { changed({ now: true }); if (before !== 'done' && U.cup.status === 'done') onCupDone(); }
        return;
      }
      if (type === 'close' || type === 'leave') {
        const host = type === 'close';
        const ok = await showModal({ title: host ? (U.cup?.status === 'done' ? '大会を閉じますか？' : '大会を終了しますか？') : '大会から抜けますか？',
          sub: host ? '参加者の画面でも大会が終わります。' : (U.cup?.status === 'entry' ? 'エントリーを取り消します。' : '観戦や試合ができなくなります。'), body: '',
          buttons: [{ label: 'もどる', value: false }, { label: host ? '終了する' : '抜ける', value: true, className: 'primary' }] });
        if (ok) await closeCup();
        return;
      }
    } catch (e) { console.warn('cup act', e); toast(netFriendlyError(e), 4500); paint(); }
  }

  /* ---------- 既存のゲームへのつなぎこみ ---------- */
  const baseRender = render;
  render = function () { const r = baseRender.apply(this, arguments); try { onGameRender(); } catch (e) { console.warn('cup render', e); } return r; };
  const baseModal = showModal;
  showModal = function (o) {
    if (U.match && /\sWIN\b/.test(String(o?.title))) {
      const done = U.cup?.status === 'done';
      return baseModal.call(this, { ...o, buttons: [{ label: done ? '表彰式へ' : '大会にもどる', value: 'cup-back', className: 'primary' }, { label: '盤面を見る', value: 'view' }] })
        .then(v => { if (v === 'cup-back') void leaveMatch({ toCup: true }); return 'view'; });
    }
    return baseModal.apply(this, arguments);
  };
  function install() {
    const modes = q('.cin-modes') || q('.setupactions'); if (!modes || q('#cupOpen')) return;
    const b = document.createElement('button'); b.id = 'cupOpen'; b.className = 'cin-mode cup-mode';
    b.innerHTML = '<span class="cin-modeicon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M10 6h12v5a6 6 0 0 1-12 0z M10 8H6v2a4 4 0 0 0 4 4 M22 8h4v2a4 4 0 0 1-4 4 M16 17v5 M11 26h10 M13 22h6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>' +
      '<span class="cin-modecopy"><small>04 / CUP</small><b>大会モード</b><em>友達と王座決定戦。予想と応援つき。</em></span><span class="cin-modearrow">↗</span>';
    b.onclick = () => openRoot(U.cup ? (U.cup.status === 'entry' ? 'entry' : 'main') : 'home');
    modes.insertBefore(b, modes.querySelector('.cin-support'));
  }
  const prevWelcome = renderWelcome;
  renderWelcome = function () { const r = prevWelcome.apply(this, arguments); install(); return r; };
  install();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { paintStatusBar(); if (U.screen === 'home') void scanCups(); } });

  /* ---------- 再読み込みからの復帰 ---------- */
  setTimeout(() => {
    try {
      const stored = loadStore();
      if (stored?.cup && stored.cup.status !== 'done' && stored.cup.transport === 'local') {
        U.mode = 'host'; U.cup = stored.cup; U.me = stored.me; U.role = 'watcher'; U.boards = stored.boards || {};
        const live = U.cup.matches.find(m => m.status === 'live');
        if (live) { C.reset(U.cup, live.id); save(); }
      } else if (stored?.cup && stored.cup.status !== 'done' && stored.cup.transport === 'online') {
        void restoreHost(stored).catch(e => console.warn('cup restore', e));
      } else {
        const link = loadLink();
        if (link?.cupCode) void joinOnline(link.cupCode).catch(() => { clearLink(); if (U.screen === 'connecting') hideRoot(); });
      }
    } catch (e) { console.warn('cup restore', e); }
  }, 400);

  globalThis.COMPILE_CUP = Object.freeze({
    open: () => openRoot(U.cup ? (U.cup.status === 'entry' ? 'entry' : 'main') : 'home'),
    join: code => { openRoot('connecting'); void joinOnline(code).catch(e => { toast(netFriendlyError(e), 4500); go('home'); }); },
    inMatch: () => !!U.match,
    state: () => U.cup ? C.copy(U.cup) : null,
    debug: () => ({ mode: U.mode, me: U.me, screen: U.screen, match: U.match ? { ...U.match, off: undefined } : null, entries: [...U.entries.values()].map(e => ({ code: e.code, pid: e.pid, guestUid: e.guestUid, ok: e.ok })) })
  });
})();

'use strict';
/* ==== COMPILE : オンラインロビー（部屋をタップして入る） ====
   コード入力をなくし、ふつうのゲームのように「部屋一覧から選んで入る」形にする。

   Firebase のルールは変更しない。既存の対戦（netHost / netJoin）がすでに使っている
   操作だけで作る：
     ・決まった部屋番号（下の ROOM_CODES）に部屋の meta を作る … ホスト
     ・その meta を読んで一覧に出す（空の番号は読めない＝空き部屋）
     ・ゲストが guest 欄を書いて入室 … 既存の参加処理と同じ
   合言葉（4文字ほど）を2人で入れると、一覧に出ない2人だけの部屋になる。
   ここで作った部屋は、そのまま既存のオンライン対戦処理（NET）で遊ぶ。         */
(() => {
  const q = s => document.querySelector(s);
  const html = s => esc(String(s ?? ''));
  const NAME_KEY = 'compile-player-name';
  const ROOM_POOL = 20;          // 一覧に出る対戦部屋の数
  const WAIT_TTL = 3 * 60 * 1000; // 待機中の部屋の寿命（ハートビートで延長）
  const SCAN_MS = 3000;
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* ---------- 部屋番号（決定的に作る7文字コード） ---------- */
  function hash32(str, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
    return h >>> 0;
  }
  function codeFrom(seed) {
    const a = hash32(seed, 2166136261), b = hash32(seed, 0x9e3779b1);
    let bits = BigInt(a) << 32n | BigInt(b), out = '';
    for (let i = 0; i < 7; i++) { out += ALPHA[Number(bits & 31n)]; bits >>= 5n; }
    return out;
  }
  const ROOM_CODES = Object.freeze(Array.from({ length: ROOM_POOL }, (_, i) => codeFrom('compile-room-v1:' + i)));
  const CUP_CODES = Object.freeze(Array.from({ length: 6 }, (_, i) => codeFrom('compile-cup-v1:' + i)));
  function normalizeWord(word) {
    // 全角/半角・カタカナ/ひらがな・大文字/小文字の違いは同じ合言葉として扱う
    return String(word || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
      .replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).slice(0, 12);
  }
  /* 通信対戦中の confirmAsk は相手に確認を送る仕組みなので、自分だけの確認はこちらを使う */
  function askLocal(title, sub, yes, no) {
    return showModal({ title, sub, body: '', buttons: [{ label: no, value: false }, { label: yes, value: true, className: 'primary' }] });
  }
  const wordCode = (word, attempt) => codeFrom('compile-aikotoba-v1:' + normalizeWord(word) + ':' + attempt);
  const metaPath = code => 'rooms/' + netRelayRoomKey(code) + '/meta';
  const roomPath = code => 'rooms/' + netRelayRoomKey(code);

  /* ---------- 状態 ---------- */
  const S = {
    open: false, view: 'list', scanTimer: 0, scanning: false, rooms: [], cups: [], lastScan: 0, scanError: '',
    session: null,   // {code, role, kind:'public'|'word', word, waiting, heartbeat, metaOff}
    busy: false, firebase: 'idle'
  };
  let root = null;

  function myName() {
    try { return (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 18); } catch (e) { return ''; }
  }
  function setMyName(name) {
    const clean = String(name || '').trim().slice(0, 18);
    try { localStorage.setItem(NAME_KEY, clean); } catch (e) {}
    return clean;
  }
  const AVATAR_COLORS = ['#f0b35b', '#6fd3e8', '#ef7d9c', '#8fe08a', '#b79bff', '#ffd166', '#5ec2a6', '#ff9f6b', '#7aa7ff', '#e48ae9'];
  function colorFor(name) { return AVATAR_COLORS[hash32(String(name || '?'), 7) % AVATAR_COLORS.length]; }
  function avatar(name, size = '') {
    const ch = Array.from(String(name || '?').trim())[0] || '?';
    return '<span class="lb-ava ' + size + '" style="--ava:' + colorFor(name) + '">' + html(ch) + '</span>';
  }
  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - (Number(ts) || Date.now())) / 1000));
    if (s < 45) return 'たった今';
    if (s < 3600) return Math.round(s / 60) + '分前';
    return Math.round(s / 3600) + '時間前';
  }

  /* ---------- Firebase ---------- */
  async function ensureFirebase() {
    S.firebase = 'connecting'; paintStatus();
    try {
      await netTimed(loadFirebase(), 12000, '通信サービスに接続できません');
      S.firebase = 'online'; paintStatus(); return NET.fb;
    } catch (e) { S.firebase = 'error'; paintStatus(); throw e; }
  }
  function isDenied(e) { return /permission.denied|permission_denied/i.test(String(e?.code || '') + ' ' + String(e?.message || '')); }
  async function readMeta(code) {
    const { dbM, db } = NET.fb;
    try {
      const snap = await netTimed(dbM.get(dbM.ref(db, metaPath(code))), 7000, '部屋の確認がタイムアウトしました');
      return { code, meta: snap.val() };
    } catch (e) {
      if (isDenied(e)) return { code, meta: null };   // 空の番号は読めない＝空き
      return { code, meta: undefined, error: e };
    }
  }
  function classify(meta, now = Date.now()) {
    if (!meta) return 'empty';
    if (meta.version !== NET_PROTOCOL) return 'old';
    if (!(Number(meta.expiresAt) > now)) return 'stale';
    return meta.guestUid ? 'playing' : 'open';
  }

  /* ---------- いまの対戦セッションを片付ける ---------- */
  function stopHeartbeat() {
    if (S.session?.heartbeat) clearInterval(S.session.heartbeat);
    if (S.session) S.session.heartbeat = 0;
    try { S.session?.metaOff?.(); } catch (e) {}
    if (S.session) S.session.metaOff = null;
  }
  async function cancelDisconnectCleanup(code) {
    try { const { dbM, db } = NET.fb; await dbM.onDisconnect(dbM.ref(db, roomPath(code))).cancel(); } catch (e) {}
  }
  async function armDisconnectCleanup(code) {
    try { const { dbM, db } = NET.fb; await dbM.onDisconnect(dbM.ref(db, roomPath(code))).remove(); return true; }
    catch (e) { console.warn('lobby onDisconnect', e); return false; }
  }
  async function leaveSession({ quiet = false } = {}) {
    stopHeartbeat();
    const s = S.session; S.session = null;
    // 予約した「切断時に部屋を消す」を先に取り消す（同じ番号を次に使う人の部屋を消さないため）
    if (s?.role === 0 && NET.fb) await cancelDisconnectCleanup(s.code);
    if (NET.code || NET.on) {
      try { await netTimed(netCancelHostRoom(), 4000, 'cleanup'); } catch (e) { console.warn('lobby leave', e); }
    }
    showNetWait(false);
    if (!quiet && s) paintList();
    return s;
  }
  function stopCpu() { try { if (globalThis.COMPILE_CPU) { COMPILE_CPU.on = false; COMPILE_CPU.running = false; COMPILE_CPU.drafting = false; } } catch (e) {} }

  /* ---------- 部屋をつくる（ホスト） ---------- */
  async function hostAt(code, { name, controlEnabled = draft.controlEnabled !== false, ttl = WAIT_TTL, hostName = name } = {}) {
    await ensureFirebase(); stopCpu();
    if (NET.code || NET.on) await leaveSession({ quiet: true });
    const { dbM, db } = NET.fb, metaRef = dbM.ref(db, metaPath(code));
    // 自分が前に作って残っていた部屋なら消してから作り直す
    const before = await readMeta(code);
    if (before.meta && before.meta.hostUid === NET.uid) { try { await dbM.remove(dbM.ref(db, roomPath(code))); } catch (e) {} }
    else if (before.meta) { const e = new Error('この部屋はふさがっています'); e.occupied = true; throw e; }
    NET.role = 0; NET.names = [name, 'PLAYER 2']; NET.opponentReady = false; NET.on = false; NET.directFallback = false;
    draft.controlEnabled = !!controlEnabled; netResetDraftSync();
    const meta = {
      version: NET_PROTOCOL, hostUid: NET.uid, hostClientId: NET.clientId, hostName: String(hostName).slice(0, 32), hostPeerId: netPeerId(code),
      controlEnabled: draft.controlEnabled, createdAt: dbM.serverTimestamp(), expiresAt: Date.now() + ttl
    };
    try { await netTimed(dbM.set(metaRef, meta), 8000, '部屋づくりがタイムアウトしました'); }
    catch (e) { if (isDenied(e)) { const err = new Error('この部屋はふさがっています'); err.occupied = true; throw err; } throw e; }
    const stored = (await netTimed(dbM.get(metaRef), 8000, '部屋の確認がタイムアウトしました')).val();
    if (stored?.hostUid !== NET.uid || stored?.hostClientId !== NET.clientId) { const e = new Error('部屋を確保できませんでした'); e.occupied = true; throw e; }
    NET.code = code; NET.meta = stored;
    await netAttachFirebaseRoom(code);
    void netStartHostPeer(netPeerId(code)).catch(() => {});
    return stored;
  }
  /* 相手が入るまで部屋を生かし続け、入ったら対戦用に切り替える */
  function watchWaiting(code, onGuest) {
    const { dbM, db } = NET.fb;
    const s = S.session;
    s.heartbeat = setInterval(() => {
      if (S.session !== s || !s.waiting) return;
      dbM.update(dbM.ref(db, metaPath(code)), { expiresAt: Date.now() + WAIT_TTL }).catch(e => console.warn('lobby heartbeat', e));
    }, 40000);
    let lost = 0;
    s.metaOff = dbM.onValue(dbM.ref(db, metaPath(code)), snap => {
      const meta = snap.val();
      if (S.session !== s || !s.waiting) return;
      if (!meta) { lost++; if (lost === 1) void recoverWaiting(s); return; }
      if (meta.guestUid && meta.guestClientId) { s.waiting = false; onGuest(meta); }
    }, () => { if (S.session === s && s.waiting) void recoverWaiting(s); });
  }
  /* 待機中に通信が切れて部屋が消えた場合は、同じ番号で作り直す */
  async function recoverWaiting(s) {
    if (S.session !== s || s.recovering) return;
    s.recovering = true;
    await new Promise(r => setTimeout(r, 1200));
    try {
      if (S.session !== s || !s.waiting) return;
      stopHeartbeat();
      const kind = s.kind, word = s.word;
      await cancelDisconnectCleanup(s.code);
      S.session = null;
      if (kind === 'word') await enterWord(word, { silent: true });
      else await createRoom({ silent: true, prefer: s.code });
    } catch (e) { console.warn('lobby recover', e); toast('部屋が閉じられました。もう一度つくってください', 4000); paintList(); }
  }
  async function becomeHost(code, kind, word = '') {
    const name = requireName(); if (!name) return false;
    await hostAt(code, { name, controlEnabled: draft.controlEnabled !== false });
    S.session = { code, role: 0, kind, word, waiting: true, heartbeat: 0, metaOff: null };
    await armDisconnectCleanup(code);
    watchWaiting(code, meta => void guestArrived(meta));
    paintWaiting();
    return true;
  }
  async function guestArrived(meta) {
    const s = S.session; if (!s) return;
    stopHeartbeat();
    await cancelDisconnectCleanup(s.code); // 対戦中は通信が揺れても部屋を消さない
    try { await NET.fb.dbM.update(NET.fb.dbM.ref(NET.fb.db, metaPath(s.code)), { expiresAt: Date.now() + NET_ROOM_TTL }); } catch (e) {}
    NET.names[1] = String(meta.guestName || 'PLAYER 2').slice(0, 32);
    NET.opponentReady = true; NET.on = true; NET.meta = { ...(NET.meta || {}), ...meta };
    try { window.COMPILE_AUDIO?.sfx('turn'); } catch (e) {}
    paintArrival(NET.names[1]);
    setTimeout(() => {
      if (S.session !== s) return;
      hide(); netLobby(); netSend(netHelloPayload());
    }, 1100);
  }
  async function createRoom({ silent = false, prefer = null } = {}) {
    if (S.busy && !silent) return;
    S.busy = true; if (!silent) paintBusy('部屋をつくっています…');
    try {
      await ensureFirebase();
      await cleanupMine();
      const order = [...ROOM_CODES].sort(() => Math.random() - .5);
      if (prefer && ROOM_CODES.includes(prefer)) order.unshift(prefer);
      for (const code of [...new Set(order)]) {
        const r = await readMeta(code);
        if (r.meta === undefined) continue;
        if (r.meta && r.meta.hostUid !== NET.uid) continue;
        try { if (await becomeHost(code, 'public')) return true; return false; }
        catch (e) { if (e.occupied) continue; throw e; }
      }
      throw new Error('空いている部屋がありません。少し待ってからもう一度お試しください');
    } catch (e) {
      toast('部屋をつくれません：' + netFriendlyError(e), 4500); paintList(); return false;
    } finally { S.busy = false; }
  }

  /* ---------- 部屋に入る（ゲスト） ---------- */
  async function joinAt(code, { name } = {}) {
    await ensureFirebase(); stopCpu();
    if (NET.code || NET.on) await leaveSession({ quiet: true });
    const { dbM, db } = NET.fb, metaRef = dbM.ref(db, metaPath(code));
    const r = await readMeta(code), meta = r.meta;
    if (r.meta === undefined) throw r.error;
    if (!meta) throw new Error('この部屋はもう閉じられました');
    if (meta.version !== NET_PROTOCOL) throw new Error('相手とゲームのバージョンが違います。両方の画面を再読み込みしてください');
    if (!(meta.expiresAt > Date.now())) throw new Error('この部屋はもう使われていません');
    if (meta.hostUid === NET.uid) throw new Error('自分の部屋には入れません');
    if (meta.guestClientId && meta.guestClientId !== NET.clientId) throw new Error('この部屋はもう満員です');
    NET.role = 1; NET.names = [String(meta.hostName || 'PLAYER 1').slice(0, 32), name]; NET.opponentReady = false; NET.on = false;
    NET.directFallback = false; NET.code = code; netResetDraftSync();
    try { await netTimed(dbM.update(metaRef, { guestUid: NET.uid, guestClientId: NET.clientId, guestName: name }), 8000, '入室がタイムアウトしました'); }
    catch (e) { NET.code = null; if (isDenied(e)) throw new Error('ひと足ちがいで満員になりました'); throw e; }
    const claimed = (await netTimed(dbM.get(metaRef), 8000, '入室の確認がタイムアウトしました')).val();
    if (!claimed || claimed.guestUid !== NET.uid || claimed.guestClientId !== NET.clientId) { NET.code = null; throw new Error('入室を確認できませんでした'); }
    NET.meta = claimed;
    if (typeof claimed.controlEnabled === 'boolean') draft.controlEnabled = claimed.controlEnabled;
    await netAttachFirebaseRoom(code);
    NET.opponentReady = true; NET.on = true;
    void netStartGuestPeer().catch(() => {});
    return claimed;
  }
  async function joinRoom(code, { kind = 'public', word = '' } = {}) {
    const name = requireName(); if (!name || S.busy) return false;
    S.busy = true; paintBusy('入室しています…');
    try {
      await joinAt(code, { name });
      S.session = { code, role: 1, kind, word, waiting: false, heartbeat: 0, metaOff: null };
      try { window.COMPILE_AUDIO?.sfx('turn'); } catch (e) {}
      hide(); netLobby(); netSend(netHelloPayload());
      return true;
    } catch (e) {
      toast(netFriendlyError(e), 4200); paintList(); void scan(); return false;
    } finally { S.busy = false; }
  }

  /* ---------- 合言葉 ---------- */
  async function enterWord(raw, { silent = false } = {}) {
    const word = normalizeWord(raw);
    if (Array.from(word).length < 2) { toast('合言葉は2文字以上にしてください'); return false; }
    const name = requireName(); if (!name) return false;
    if (S.busy && !silent) return false;
    S.busy = true; paintBusy('合言葉の部屋をさがしています…');
    try {
      await ensureFirebase();
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = wordCode(word, attempt);
        for (let tries = 0; tries < 3; tries++) {
          const r = await readMeta(code);
          if (r.meta === undefined) throw r.error;
          const state = classify(r.meta);
          if (r.meta && r.meta.hostUid === NET.uid) {
            try { await becomeHost(code, 'word', word); return true; } catch (e) { if (!e.occupied) throw e; }
            break;
          }
          if (state === 'empty') {
            try { await becomeHost(code, 'word', word); return true; }
            catch (e) { if (e.occupied) continue; throw e; } // 同時に作られた → 読み直して入室
          }
          if (state === 'open') {
            S.busy = false;
            return await joinRoom(code, { kind: 'word', word });
          }
          break; // 対戦中・期限切れ → 次の番号へ
        }
      }
      throw new Error('その合言葉は混み合っています。別の合言葉にしてください');
    } catch (e) {
      toast('合言葉で入れません：' + netFriendlyError(e), 4500); paintList(); return false;
    } finally { S.busy = false; }
  }

  /* ---------- 一覧の更新 ---------- */
  async function cleanupMine() {
    // 以前この端末で作ったまま残った部屋を片付ける（一覧と空き番号のため）
    if (S.session) return;
    // 対局中かもしれない新しい部屋（別タブ）は残し、待機のまま／期限切れ／古い部屋だけ消す
    const old = Date.now() - 3 * 3600e3;
    const mine = S.rooms.filter(r => r.meta?.hostUid === NET.uid && r.meta.hostClientId !== NET.clientId &&
      (r.state === 'stale' || r.state === 'open' || r.state === 'old' || Number(r.meta.createdAt) < old));
    for (const r of mine) { try { await NET.fb.dbM.remove(NET.fb.dbM.ref(NET.fb.db, roomPath(r.code))); } catch (e) {} }
  }
  async function scan() {
    if (S.scanning || !S.open) return;
    S.scanning = true;
    try {
      await ensureFirebase();
      const now = Date.now();
      const [rooms, cups] = await Promise.all([Promise.all(ROOM_CODES.map(readMeta)), Promise.all(CUP_CODES.map(readMeta))]);
      S.rooms = rooms.filter(r => r.meta).map(r => ({ ...r, state: classify(r.meta, now) }));
      S.cups = cups.filter(r => r.meta).map(r => ({ ...r, state: classify(r.meta, now) }));
      S.lastScan = Date.now(); S.scanError = rooms.every(r => r.meta === undefined) ? '通信が不安定です' : '';
      if (!S.session && !S.cleaned) { S.cleaned = true; await cleanupMine(); }
    } catch (e) { S.scanError = netFriendlyError(e); }
    finally { S.scanning = false; }
    if (S.open && S.view === 'list') paintRooms();
  }
  function startScan() { stopScan(); void scan(); S.scanTimer = setInterval(() => { if (!document.hidden) void scan(); }, SCAN_MS); }
  function stopScan() { clearInterval(S.scanTimer); S.scanTimer = 0; }

  /* ---------- 画面 ---------- */
  function ensureRoot() {
    if (root) return root;
    root = document.createElement('section'); root.id = 'lobbyRoot'; root.hidden = true; root.setAttribute('aria-label', 'オンライン対戦ロビー');
    document.body.append(root);
    root.addEventListener('click', e => { const b = e.target.closest('[data-lb]'); if (b && !b.disabled) void act(b.dataset.lb, b.dataset.code || '', b); });
    root.addEventListener('submit', e => { e.preventDefault(); const f = e.target; if (f.id === 'lbWordForm') void act('word-go'); if (f.id === 'lbNameForm') void act('name-save'); });
    root.addEventListener('change', e => { if (e.target.id === 'lbName') setMyName(e.target.value); });
    return root;
  }
  function show() { ensureRoot(); root.hidden = false; S.open = true; document.body.classList.add('lb-open'); }
  function hide() { if (!root) return; root.hidden = true; S.open = false; stopScan(); document.body.classList.remove('lb-open'); }
  function frame(content, { back = 'home', title = 'オンライン対戦', sub = 'ONLINE LOBBY' } = {}) {
    show();
    root.innerHTML = '<div class="lb-shell"><header class="lb-top"><button class="lb-back" data-lb="' + back + '" aria-label="もどる">‹</button>' +
      '<div class="lb-title"><small>' + sub + '</small><b>' + title + '</b></div><span class="lb-status" id="lbStatus"></span></header>' + content + '</div>';
    paintStatus();
  }
  function paintStatus() {
    const el = root && q('#lbStatus'); if (!el) return;
    const map = { idle: ['', ''], connecting: ['wait', '接続中'], online: ['on', 'オンライン'], error: ['err', '通信エラー'] };
    const [cls, label] = map[S.firebase] || map.idle;
    el.className = 'lb-status ' + cls; el.innerHTML = label ? '<i></i>' + label : '';
  }
  function requireName() {
    const input = root && q('#lbName');
    const name = setMyName(input ? input.value : myName());
    if (!name) { toast('はじめに名前を入れてください'); input?.focus(); return ''; }
    return name;
  }
  function paintList() {
    S.view = 'list';
    const name = myName();
    frame(
      '<form class="lb-me" id="lbNameForm"><span class="lb-me-ava" id="lbMeAva">' + avatar(name || '?', 'lg') + '</span><label><small>あなたの名前</small>' +
      '<input id="lbName" maxlength="18" autocomplete="nickname" placeholder="名前を入力" value="' + html(name) + '"></label></form>' +
      '<button class="lb-create" data-lb="create-sheet"><span class="lb-plus">＋</span><span><b>部屋をつくる</b><small>友達はこの画面からタップで入れます</small></span></button>' +
      '<div class="lb-sub"><button data-lb="word-sheet"><span>🔑</span>合言葉で入る</button><button data-lb="cup"><span>🏆</span>大会モード</button></div>' +
      '<div id="lbRooms" class="lb-rooms"></div>' +
      '<p class="lb-foot">パスワードは不要です。友達とだけ遊びたいときは「合言葉」を使うと一覧に出ない部屋になります。</p>'
    );
    const input = q('#lbName');
    input.addEventListener('input', () => { q('#lbMeAva').innerHTML = avatar(input.value.trim() || '?', 'lg'); });
    paintRooms();
    startScan();
  }
  function paintRooms() {
    const box = root && q('#lbRooms'); if (!box) return;
    const open = S.rooms.filter(r => r.state === 'open' && r.meta.hostUid !== NET.uid);
    const playing = S.rooms.filter(r => r.state === 'playing');
    const cups = S.cups.filter(r => r.state === 'open' || r.state === 'playing');
    const scanned = S.lastScan > 0;
    let out = '<div class="lb-head"><h2>あそべる部屋</h2><span class="lb-live' + (S.scanError ? ' err' : '') + '"><i></i>' + (S.scanError ? html(S.scanError) : scanned ? '自動更新中' : 'さがしています…') + '</span></div>';
    if (cups.length) out += cups.map(r =>
      '<button class="lb-room cup" data-lb="cup-join" data-code="' + r.code + '"><span class="lb-trophy">🏆</span><span class="lb-room-copy"><b>' + html(r.meta.hostName) + '</b>' +
      '<small>大会・参加/観戦できます</small></span><span class="lb-go">参加 ›</span></button>').join('');
    if (open.length) out += open.map(r =>
      '<button class="lb-room" data-lb="join" data-code="' + r.code + '">' + avatar(r.meta.hostName) + '<span class="lb-room-copy"><b>' + html(r.meta.hostName) + ' の部屋</b>' +
      '<small>CONTROL ' + (r.meta.controlEnabled === false ? 'なし' : 'あり') + ' ・ ' + ago(r.meta.createdAt) + 'に作成</small></span><span class="lb-go">入る ›</span></button>').join('');
    if (!open.length && !cups.length) out += '<div class="lb-empty"><div class="lb-radar"><i></i><i></i><i></i></div><b>' + (scanned ? 'まだ部屋がありません' : '部屋をさがしています') + '</b>' +
      '<p>' + (scanned ? '「部屋をつくる」を押して友達を待とう。<br>友達がこの画面を開くと、あなたの部屋が出てきます。' : '少しお待ちください…') + '</p></div>';
    if (playing.length) out += '<div class="lb-head small"><h2>対戦中</h2></div>' + playing.map(r =>
      '<div class="lb-room playing">' + avatar(r.meta.hostName) + '<span class="lb-room-copy"><b>' + html(r.meta.hostName) + ' <em>vs</em> ' + html(r.meta.guestName || '???') + '</b><small>対戦中</small></span>' + avatar(r.meta.guestName || '?') + '</div>').join('');
    // 3秒ごとの更新で中身が同じなら描き直さない（カードがちらつかないように）
    if (box.dataset.html !== out) { box.innerHTML = out; box.dataset.html = out; }
  }
  function sheet(content) {
    const old = q('#lbSheet'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'lbSheet'; el.className = 'lb-sheet';
    el.innerHTML = '<div class="lb-sheet-bg" data-lb="sheet-close"></div><div class="lb-sheet-card" role="dialog">' + content + '</div>';
    root.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    return el;
  }
  function closeSheet() { const el = q('#lbSheet'); if (el) el.remove(); }
  function createSheet() {
    if (!requireName()) return;
    const set = normalizeCardSet(window.COMPILE_CARD_SETS?.get?.() || draft.cardSet);
    const control = draft.controlEnabled !== false;
    sheet('<h3>部屋をつくる</h3><p class="lb-note">入ってきた友達とすぐ対戦できます。</p>' +
      '<div class="lb-opt"><span>カードセット</span><div class="lb-seg" data-group="set">' +
      [['set1', '第1セット'], ['set2', '第2セット'], ['mixed', '混合']].map(([v, l]) => '<button type="button" data-lb="opt" data-code="set:' + v + '" class="' + (set === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="lb-opt"><span>CONTROLカード</span><div class="lb-seg" data-group="control">' +
      [['on', 'あり'], ['off', 'なし']].map(([v, l]) => '<button type="button" data-lb="opt" data-code="control:' + v + '" class="' + ((v === 'on') === control ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<button class="lb-cta" data-lb="create">この設定でつくる</button><button class="lb-ghost" data-lb="sheet-close">やめる</button>');
  }
  function wordSheet() {
    if (!requireName()) return;
    sheet('<h3>合言葉で入る</h3><p class="lb-note">友達と同じ言葉を入れるだけ。先に入れた人の部屋に、あとから入れた人が入ります。一覧には出ません。</p>' +
      '<form id="lbWordForm" class="lb-word"><input id="lbWord" maxlength="8" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="例：ねこ12" aria-label="合言葉"></form>' +
      '<button class="lb-cta" data-lb="word-go">この合言葉で入る</button><button class="lb-ghost" data-lb="sheet-close">やめる</button>');
    setTimeout(() => q('#lbWord')?.focus(), 60);
  }
  function paintBusy(message) {
    const box = root && !root.hidden ? q('#lbRooms') : null;
    closeSheet();
    if (box) { box.innerHTML = '<div class="lb-empty"><div class="lb-spin"></div><b>' + html(message) + '</b></div>'; box.dataset.html = ''; }
  }
  function paintWaiting() {
    const s = S.session; if (!s) return;
    S.view = 'waiting'; stopScan();
    const name = NET.names[0];
    frame('<div class="lb-wait">' +
      '<div class="lb-wait-kicker">' + (s.kind === 'word' ? '合言葉の部屋' : '部屋をつくりました') + '</div>' +
      '<div class="lb-wait-card"><div class="lb-pulse">' + avatar(name, 'xl') + '<i></i><i></i><i></i></div>' +
      '<b>' + html(name) + ' の部屋</b>' + (s.kind === 'word' ? '<span class="lb-word-chip">🔑 ' + html(s.word) + '</span>' : '') +
      '<div class="lb-vs"><span class="me">' + avatar(name) + html(name) + '</span><em>VS</em><span class="who"><span class="lb-ava q">?</span>だれかな…</span></div>' +
      '<p class="lb-wait-msg">友達が入ってくるのを待っています<span class="lb-dots"><i>.</i><i>.</i><i>.</i></span></p></div>' +
      '<p class="lb-hint">' + (s.kind === 'word' ? '友達に「合言葉で入る」から <b>' + html(s.word) + '</b> を入れてもらってください。' : '友達は「オンライン対戦」を開いて、<br>一覧に出た <b>' + html(name) + ' の部屋</b> をタップするだけ。') + '</p>' +
      '<button class="lb-ghost" data-lb="cancel-wait">部屋を閉じる</button></div>', { back: 'cancel-wait', title: '相手を待っています', sub: 'WAITING ROOM' });
  }
  function paintArrival(guestName) {
    const el = q('.lb-vs .who');
    if (el) { el.innerHTML = avatar(guestName) + html(guestName); el.classList.add('in'); }
    const msg = q('.lb-wait-msg'); if (msg) msg.innerHTML = '<b>' + html(guestName) + '</b> が入ってきました！';
  }

  async function act(type, code, el) {
    try {
      if (type === 'home') { await leaveSession({ quiet: true }); hide(); return; }
      if (type === 'create-sheet') return createSheet();
      if (type === 'word-sheet') return wordSheet();
      if (type === 'sheet-close') return closeSheet();
      if (type === 'opt') {
        const [k, v] = code.split(':');
        if (k === 'set') { window.COMPILE_CARD_SETS?.set?.(v); draft.cardSet = normalizeCardSet(v); }
        if (k === 'control') draft.controlEnabled = v === 'on';
        el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
        return;
      }
      if (type === 'create') { closeSheet(); return void createRoom(); }
      if (type === 'join') return void joinRoom(code);
      if (type === 'word-go') { const w = q('#lbWord')?.value || ''; closeSheet(); return void enterWord(w); }
      if (type === 'name-save') { requireName(); q('#lbName')?.blur(); return; }
      if (type === 'cancel-wait') { await leaveSession({ quiet: true }); paintList(); return; }
      if (type === 'cup') { if (!requireName()) return; hide(); window.COMPILE_CUP?.open(); return; }
      if (type === 'cup-join') { if (!requireName()) return; hide(); window.COMPILE_CUP?.join(code); return; }
    } catch (e) { toast(netFriendlyError(e), 4000); }
  }

  /* ---------- 対戦前のVS画面（既存 netLobby の置き換え） ---------- */
  netLobby = function () {
    $('#setup').classList.remove('hidden');
    const isHost = NET.role === 0, ready = NET.opponentReady; NET.lobbyShown = true;
    const names = NET.names, set = normalizeCardSet(draft.cardSet);
    $('#setupBox').innerHTML = '<div class="lb-match"><div class="lb-match-kicker">ONLINE MATCH</div>' +
      '<div class="lb-match-vs"><div class="p">' + avatar(names[0], 'xl') + '<b>' + html(names[0]) + '</b><small>ホスト</small></div><em>VS</em>' +
      '<div class="p">' + avatar(names[1], 'xl') + '<b>' + html(names[1]) + '</b><small>ゲスト</small></div></div>' +
      '<p class="ttldesc lb-match-info"><span id="lobbyNames" hidden>' + html(names[0]) + ' vs ' + html(names[1]) + '</span>' +
      'カードセット <b>' + html(CARD_SET_LABELS[set] || set) + '</b> ・ CONTROL <b id="lobbyControl">' + (draft.controlEnabled !== false ? 'あり' : 'なし') + '</b><br>' +
      '<small>通信: <b id="netMode">' + netModeText() + '</b></small></p>' +
      (isHost ? '<div class="setupactions lb-match-actions"><button class="primary" id="netStart" ' + (ready ? '' : 'disabled') + '>ドラフト開始</button></div>'
        : '<p class="lb-match-wait">' + html(names[0]) + ' がドラフトを始めるのを待っています<span class="lb-dots"><i>.</i><i>.</i><i>.</i></span></p>') +
      '<button class="lb-leave" id="lbLeave">退出する</button></div>';
    if (isHost) $('#netStart').onclick = () => netStartDraft();
    $('#lbLeave').onclick = async () => {
      if (!await askLocal('退出しますか？', '部屋から出て、ロビーにもどります。', '退出する', 'もどる')) return;
      try { netSend({ t: 'lobby', k: 'bye' }); } catch (e) {}
      await leaveSession({ quiet: true });
      if (window.COMPILE_CUP?.inMatch?.()) return;
      openLobby();
    };
  };

  /* 相手が退出した・再戦が始まった等の通知（net の 'lobby' メッセージ） */
  function onLobbyMessage(m, sender) {
    if (m.k === 'bye') {
      toast((NET.names[sender] || '相手') + ' が退出しました', 3500);
      if (G && G.winner == null) return; // 対局中は相手の再接続を待つ
      void (async () => { await leaveSession({ quiet: true }); if (!window.COMPILE_CUP?.inMatch?.()) openLobby(); })();
    }
    if (m.k === 'rematch' && NET.role === 1) startRematchLocal();
  }
  function startRematchLocal() {
    closeModal(null);
    G = null; stableState = true; netResetDraftSync(); NET.lobbyShown = false;
    $('#handoff')?.classList.remove('show'); showNetWait(false);
    netLobby();
  }
  function rematch() {
    if (NET.role !== 0 || !NET.on) return;
    netSend({ t: 'lobby', k: 'rematch' });
    startRematchLocal();
    toast('もう一戦！ドラフトを始めましょう', 2500);
  }
  async function backToLobby() {
    try { netSend({ t: 'lobby', k: 'bye' }); } catch (e) {}
    await leaveSession({ quiet: true });
    try { sessionStorage.setItem('compile-open-lobby', '1'); } catch (e) {}
    location.reload();
  }

  /* 勝敗ダイアログに「もう一戦」「ロビーへ」を足す（大会の試合は大会側が担当） */
  const baseModal = showModal;
  showModal = function (o) {
    if (S.session && NET.on && /\sWIN\b/.test(String(o?.title)) && !window.COMPILE_CUP?.inMatch?.()) {
      const host = NET.role === 0;
      const buttons = (host ? [{ label: 'もう一戦！', value: 'lb-rematch', className: 'primary' }] : []).concat(
        [{ label: 'ロビーへ', value: 'lb-lobby', className: host ? '' : 'primary' }, { label: '盤面を見る', value: 'view' }]);
      const sub = (o.sub || '') + (host ? '' : '<br><small>ホストが「もう一戦」を押すと、続けて対戦できます。</small>');
      return baseModal.call(this, { ...o, sub, buttons }).then(v => {
        if (v === 'lb-rematch') rematch();
        if (v === 'lb-lobby') void backToLobby();
        return v === 'lb-rematch' || v === 'lb-lobby' ? 'view' : v;
      });
    }
    return baseModal.apply(this, arguments);
  };

  function openLobby() {
    if (S.session && NET.on) { hide(); return; }
    paintList();
  }

  /* ホーム画面のボタンをロビーにつなぐ */
  function install() {
    const host = q('#netHostBtn');
    if (host && !host.dataset.lobby) {
      host.dataset.lobby = '1';
      host.onclick = () => openLobby();
      const em = host.querySelector('.cin-modecopy em'); if (em) em.textContent = '部屋をタップするだけ。友達とすぐ対戦。';
    }
    const join = q('#netJoinBtn'); if (join) join.hidden = true;
  }
  const previousWelcome = renderWelcome;
  renderWelcome = function () { const r = previousWelcome.apply(this, arguments); install(); return r; };
  install();
  try {
    if (sessionStorage.getItem('compile-open-lobby') === '1') { sessionStorage.removeItem('compile-open-lobby'); setTimeout(openLobby, 300); }
  } catch (e) {}
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.session?.waiting && NET.fb) {
      NET.fb.dbM.update(NET.fb.dbM.ref(NET.fb.db, metaPath(S.session.code)), { expiresAt: Date.now() + WAIT_TTL }).catch(() => void recoverWaiting(S.session));
    }
    if (!document.hidden && S.open && S.view === 'list') void scan();
  });

  globalThis.COMPILE_LOBBY = Object.freeze({
    open: openLobby, close: hide, hostAt, joinAt, leave: leaveSession, readMeta, classify, codeFrom, myName, setMyName, avatar, colorFor,
    onLobbyMessage, roomCodes: ROOM_CODES, cupCodes: CUP_CODES, metaPath, roomPath, isDenied, ensureFirebase,
    armDisconnectCleanup, cancelDisconnectCleanup, session: () => S.session ? { ...S.session } : null, wordCode, normalizeWord
  });
})();

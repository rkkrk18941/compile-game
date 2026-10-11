'use strict';
(() => {
  const R = COMPILE_ARENA_RULES, q = s => document.querySelector(s), html = s => esc(String(s ?? ''));
  const KEY = 'compile-arena-v1', SESSION = 'compile-arena-session-v1';
  const A = { state: null, me: null, token: null, host: false, peer: null, conn: null, links: new Map(), secrets: new Map(),
    active: null, watching: null, publicBoards: {}, games: {}, ready: new Map(), connection: 'offline', retry: 0, lastPublish: 0, finished: new Set(), running: false };
  let root, chip, screen = 'hub', lastBoard = '', snapshotTimer = 0, reconnectTimer = 0, connectionTimer = 0, ceremonyTimer = 0;
  const NORMAL_NET_CLIENT = NET.clientId;
  const name = id => A.state?.players.find(p => p.id === id)?.name || '未定';
  const mine = () => A.state?.matches?.find(m => m.status === 'live' && [m.a, m.b].includes(A.me));
  const countScore = g => g.players.map(p => p.protocols.filter(pr => pr.compiled).length);
  const token = () => netRandomToken(24);
  const peerId = code => 'cmpl-arena-' + code.toLowerCase() + '-h';
  function ensureRoot() {
    if (root) return;
    root = document.createElement('section'); root.id = 'arenaRoot'; root.hidden = true; root.setAttribute('aria-label', '大会アリーナ'); document.body.append(root);
    root.addEventListener('click', e => { const b = e.target.closest('[data-arena]'); if (b && !b.disabled) void action(b.dataset.arena, b.dataset.id); });
    root.addEventListener('change', e => { if (e.target.id === 'arenaCount') resizeNames(); if (e.target.id === 'arenaMode' && A.host) A.state.mode = e.target.value; });
  }
  function shell(eyebrow, title, sub, content, foot = '') {
    ensureRoot(); root.hidden = false;
    const view = screen + ':' + (A.state?.status || '') + ':' + (A.watching || '');
    const scroll = root.dataset.view === view ? root.scrollTop || 0 : 0; root.dataset.view = view;
    root.innerHTML = '<div class="arena-shell"><header class="arena-nav"><span class="arena-brand">COMPILE <i>ARENA</i></span><button data-arena="close" aria-label="大会画面を閉じる">×</button></header>' +
      '<div class="arena-hero"><div class="arena-eyebrow">' + eyebrow + '</div><h1>' + title + '</h1><p>' + sub + '</p></div>' + content +
      '<footer class="arena-footer"><span>SELECT · DISRUPT · DOMINATE</span><span>' + foot + '</span></footer></div>';
    root.scrollTop = scroll;
  }
  function save() { if (!A.state) return; try { localStorage.setItem(KEY, JSON.stringify({ state: A.state, boards: A.publicBoards, closed: false })); } catch {} }
  function saveSession() { try { sessionStorage.setItem(SESSION, JSON.stringify({ me: A.me, token: A.token, host: A.host, code: A.state?.code })); } catch {} }
  function setup() {
    screen = 'setup';
    shell('04 / COMPETITION MODE', 'THE ARENA', '名前を登録し、仲間と王座を競おう。3人は総当たり、4人以上は大会方式を選べます。',
      '<div class="arena-config"><article class="arena-panel"><div class="arena-panel-title"><span>01</span><h2>複数端末で対戦</h2></div><p>同時対戦・ライブ観戦に対応。1人が大会を作り、ほかの人はコードで参加します。</p>' +
      '<label>あなたの名前<input id="arenaMyName" maxlength="18" autocomplete="nickname" placeholder="プレイヤー名"></label><div class="arena-buttons"><button class="primary" data-arena="host">大会を作る</button></div>' +
      '<div class="arena-divider"></div><label>大会コード<input id="arenaCode" maxlength="10" autocapitalize="characters" placeholder="A-XXXXXXX"></label><button data-arena="join">コードで参加</button></article>' +
      '<article class="arena-panel"><div class="arena-panel-title"><span>02</span><h2>1台で順番に対戦</h2></div><p>全員の名前を入力して開始。対戦ごとに端末を渡し、成績を自動で記録します。</p><label>参加人数<select id="arenaCount">' +
      Array.from({ length: 14 }, (_, i) => '<option value="' + (i + 3) + '">' + (i + 3) + '人</option>').join('') + '</select></label><div id="arenaNames"></div>' +
      '<label>大会方式<select id="arenaLocalMode"><option value="league">総当たり</option><option value="knockout">トーナメント（4人以上）</option></select></label><button class="primary" data-arena="local">名前を登録して開始</button></article></div>');
    resizeNames();
  }
  function resizeNames() {
    const n = Number(q('#arenaCount').value), old = [...root.querySelectorAll('[data-name]')].map(e => e.value);
    q('#arenaNames').innerHTML = Array.from({ length: n }, (_, i) => '<label class="arena-name"><span>' + String(i + 1).padStart(2, '0') +
      '</span><input data-name maxlength="18" placeholder="PLAYER ' + (i + 1) + '" value="' + html(old[i] || '') + '" aria-label="参加者' + (i + 1) + 'の名前"></label>').join('');
    q('#arenaLocalMode').disabled = n === 3; if (n === 3) q('#arenaLocalMode').value = 'league';
  }
  function registerNames(names) {
    const clean = names.map(s => String(s).trim().slice(0, 18));
    if (clean.some(s => !s)) throw Error('全員の名前を入力してください');
    if (new Set(clean).size !== clean.length) throw Error('区別できるように別の名前を入力してください');
    return clean;
  }
  function options() { return { cardSet: normalizeCardSet(draft.cardSet), controlEnabled: readControlSetting() }; }
  function detachMatch() {
    clearTimeout(_nsT); _nsT = 0;
    for (const p of Object.values(NET.pending)) { clearTimeout(p.timer); clearInterval(p.abortTimer); p.resolve(null); }
    NET.pending = {}; NET.on = false; NET.conn = null; NET.messagesRef = null; NET.roomRef = null; NET.metaRef = null;
    NET.remoteRequestDepth = 0; NET.deferredState = null; NET.protocolOrderPending = null;
    A.active = null; lastBoard = ''; NET.clientId = NORMAL_NET_CLIENT; showNetWait(false); q('#handoff')?.classList.remove('show');
  }
  function stop() {
    clearTimeout(reconnectTimer); clearTimeout(connectionTimer); clearTimeout(snapshotTimer); clearTimeout(ceremonyTimer); q('#arenaCeremony')?.remove();
    if (A.active) detachMatch();
    A.running = false;
    netClearListeners(); try { NET.peer?.destroy(); } catch {} NET.peer = null; NET.on = false; NET.conn = null; NET.messagesRef = null;
    try { A.peer?.destroy(); } catch {} A.peer = null; A.conn = null; A.links.clear(); A.connection = 'offline';
    if (typeof CPU !== 'undefined') { CPU.on = false; CPU.drafting = false; newGame(); }
  }
  function local() {
    const names = registerNames([...root.querySelectorAll('[data-name]')].map(e => e.value));
    const mode = q('#arenaLocalMode').value; const opts = options(); stop();
    A.state = R.create(names.map((name, i) => ({ id: 'local-' + i, name })), mode, { ...opts, transport: 'local' });
    A.host = true; A.me = A.state.players[0].id; A.publicBoards = {}; A.games = {}; A.finished.clear(); save(); hub(); celebrate('running');
  }
  async function openPeer(id) {
    await netTimed(loadPeerJS(), 15000, '通信ライブラリを読み込めませんでした');
    return new Promise((resolve, reject) => {
      const p = new Peer(id); A.peer = p; let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; p.destroy(); reject(Error('通信の準備がタイムアウトしました')); } }, 15000);
      p.on('open', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(p); } });
      p.on('error', err => { console.warn('arena peer', err?.type, err?.message); if (!settled) { settled = true; clearTimeout(timer); reject(Error('接続できません。ネットワークを確認して再試行してください')); } else notice('通信エラー（' + (err?.type || 'network') + '）：接続をやり直してください。'); });
      p.on('disconnected', () => { if (!p.destroyed) p.reconnect(); });
    });
  }
  async function host() {
    const myName = registerNames([q('#arenaMyName').value])[0], opts = options(); stop(); A.running = true;
    A.me = netRandomToken(12); A.token = token(); A.host = true; A.secrets = new Map([[A.me, A.token]]);
    const code = netRoomCode(); A.state = { id: 'arena-' + netRandomToken(12), code, hostId: A.me, status: 'lobby', transport: 'online', mode: 'league', players: [{ id: A.me, name: myName, online: true }], matches: [], ...opts };
    A.publicBoards = {}; A.games = {}; A.finished.clear(); A.connection = 'connecting'; hub();
    try {
      const p = await openPeer(peerId(code)); p.on('connection', c => bindHost(c)); A.connection = 'online'; saveSession(); save(); hub();
    } catch (e) { A.running = false; A.connection = 'error'; hub(); throw e; }
  }
  async function join(resume = null) {
    const code = resume?.code || netNormalizeRoomCode(q('#arenaCode').value.replace(/^A[- ]?/i, ''));
    if (!netValidRoomCode(code)) throw Error('A-から始まる大会コードを確認してください');
    const myName = resume ? name(resume.me) : registerNames([q('#arenaMyName').value])[0];
    if (!resume) { stop(); A.me = netRandomToken(12); A.token = token(); A.host = false; A.state = { code, transport: 'online', status: 'connecting', players: [], matches: [] }; A.publicBoards = {}; A.finished.clear(); }
    A.running = true; A.connection = 'connecting'; hub();
    try { const p = await openPeer(); connectGuest(p, code, myName); } catch (e) { A.connection = 'error'; hub(); throw e; }
  }
  function connectGuest(p, code, myName) {
    clearTimeout(reconnectTimer); clearTimeout(connectionTimer);
    const c = p.connect(peerId(code), { reliable: true, metadata: { arena: 1, id: A.me, token: A.token, name: myName } }); A.conn = c;
    c.on('open', () => c.send(JSON.stringify({ t: 'join' })));
    connectionTimer = setTimeout(() => { if (A.connection !== 'online') {
      const pc = c.peerConnection;
      console.warn('arena connection timeout ' + JSON.stringify({ signaling: pc?.signalingState, ice: pc?.iceConnectionState, connection: pc?.connectionState }));
      A.connection = 'error'; hub(); notice('大会に接続できません。コードと主催者の接続を確認してください。');
    } }, 15000);
    c.on('data', raw => { try { const m = decode(raw); if (!m) return; if (m.t === 'welcome') { A.connection = 'online'; clearTimeout(connectionTimer); A.state = m.state; A.publicBoards = m.boards || {}; saveSession(); save(); hub(); }
      else if (m.t === 'state') { const old = A.state?.status; A.state = m.state; if (old !== A.state.status) celebrate(A.state.status); save(); if (root && !root.hidden && screen === 'hub') hub(); }
      else if (m.t === 'public') receiveBoard(m);
      else if (m.t === 'match') attachMatch(m.match);
      else if (m.t === 'begin' && A.active === m.id && NET.role === 0) netStartDraft();
      else if (m.t === 'game' && A.active === m.id) void netReceive(m.payload, 'direct');
      else if (m.t === 'error') { A.running = false; A.connection = 'error'; notice(m.message); A.conn?.close(); A.state = null; setup(); q('#arenaMyName').value = myName; q('#arenaCode').value = 'A-' + code; }
    } catch (e) { console.warn('arena message', e); } });
    const reconnect = () => { if (!A.running || A.host || A.conn !== c) return; A.connection = 'reconnecting'; hubIfOpen();
      reconnectTimer = setTimeout(() => { if (A.running && !A.host && !p.destroyed) connectGuest(p, code, myName); }, 3000); };
    c.on('close', reconnect); c.on('error', err => { console.warn('arena connection', err?.type, err?.message); reconnect(); });
  }
  function decode(raw) { if (typeof raw !== 'string' || raw.length > 1000000) return null; const m = JSON.parse(raw); return m && typeof m.t === 'string' ? m : null; }
  function bindHost(c) {
    const d = c.metadata; let accepted = false;
    const admit = () => {
      if (accepted) return;
      const bad = !d || d.arena !== 1 || !/^[A-Z2-9]{12}$/.test(d.id || '') || !/^[A-Z2-9]{24}$/.test(d.token || '') || typeof d.name !== 'string';
      if (bad) { c.close(); return; }
      let p = A.state.players.find(p => p.id === d.id);
      if (p && A.secrets.get(p.id) !== d.token || !p && (A.state.status !== 'lobby' || A.state.players.length >= 16)) { c.send(JSON.stringify({ t: 'error', message: '大会は開始済み、または満員です。' })); c.close(); return; }
      if (!p) {
        const n = d.name.trim().slice(0, 18);
        if (!n || A.state.players.some(p => p.name === n)) { c.send(JSON.stringify({ t: 'error', message: '別のプレイヤー名で参加してください。' })); c.close(); return; }
        p = { id: d.id, name: n, online: true }; A.state.players.push(p); A.secrets.set(p.id, d.token);
      }
      accepted = true; const old = A.links.get(p.id); A.links.set(p.id, c); if (old && old !== c) old.close(); p.online = true;
      c.send(JSON.stringify({ t: 'welcome', state: A.state, boards: A.publicBoards })); broadcast();
      const match = A.state.matches.find(m => m.status === 'live' && [m.a, m.b].includes(p.id)); if (match) deliver(p.id, { t: 'match', match });
    };
    c.on('open', admit);
    c.on('data', raw => { try { const m = decode(raw); if (m?.t === 'join') admit(); if (!accepted || A.links.get(d.id) !== c) return; if (m) accept(d.id, m); } catch (e) { console.warn('arena host', e); } });
    const closed = () => { if (A.links.get(d?.id) !== c) return; A.links.delete(d.id); const p = A.state.players.find(p => p.id === d.id); if (p) p.online = false; broadcast(); };
    c.on('close', closed); c.on('error', closed);
    if (c.open) admit();
  }
  function deliver(id, m) {
    if (id === A.me) { if (m.t === 'match') attachMatch(m.match); else if (m.t === 'begin' && NET.role === 0) netStartDraft(); else if (m.t === 'game' && A.active === m.id) void netReceive(m.payload, 'direct'); return; }
    const c = A.links.get(id); if (c?.open) try { c.send(JSON.stringify(m)); } catch {}
  }
  function send(m) { if (A.host) accept(A.me, m); else if (A.conn?.open) A.conn.send(JSON.stringify(m)); else notice('再接続を待ってから操作してください'); }
  function broadcast() {
    save(); if (A.host) for (const c of A.links.values()) if (c.open) c.send(JSON.stringify({ t: 'state', state: A.state }));
    hubIfOpen();
  }
  function accept(sender, m) {
    const player = A.state.players.find(p => p.id === sender); if (!player) return;
    const match = A.state.matches.find(x => x.id === m.id);
    if (m.t === 'start' && match?.status === 'pending' && [match.a, match.b].includes(sender)) {
      if (!A.state.players.filter(p => [match.a, match.b].includes(p.id)).every(p => p.id === A.me || A.links.get(p.id)?.open)) { deliver(sender, { t: 'error', message: '対戦相手の再接続を待っています' }); if (sender === A.me) notice('対戦相手の接続を待っています'); return; }
      if (!R.start(A.state, m.id)) return;
      broadcast(); for (const id of [match.a, match.b]) deliver(id, { t: 'match', match }); return;
    }
    if (!match || !['live', 'done'].includes(match.status) || ![match.a, match.b].includes(sender)) return;
    if (match.status === 'done' && !['game', 'board'].includes(m.t)) return;
    if (m.t === 'ready') {
      const cached = A.games[m.id];
      if (cached) {
        const from = sender === match.a ? match.b : match.a;
        deliver(sender, { t: 'game', id: m.id, payload: gameEnvelope(match, from, { t: 'state', G: cached, sync: netStateSummary(cached, true) }) });
        deliver(from, { t: 'game', id: m.id, payload: gameEnvelope(match, sender, { t: 'hello', name: name(sender), sync: { hasGame: false } }) });
        return;
      }
      const set = A.ready.get(m.id) || new Set(); set.add(sender); A.ready.set(m.id, set);
      if (set.size === 2) { deliver(match.a, { t: 'begin', id: m.id }); A.ready.delete(m.id); }
      return;
    }
    if (m.t === 'game') {
      const e = typeof m.payload === 'string' && m.payload.length < 900000 ? JSON.parse(m.payload) : null;
      const role = sender === match.a ? 0 : 1;
      if (!e || e.v !== NET_PROTOCOL || e.fromRole !== role || e.fromClient !== sender || e.fromUid !== 'arena-' + sender || !e.body) return;
      if (e.body.t === 'state' && netValidGame(e.body.G)) {
        const old = A.games[m.id], next = e.body.G;
        if (!old || netGameRevision(next) >= netGameRevision(old)) A.games[m.id] = next;
        const g = A.games[m.id]; if (g.winner != null && R.result(A.state, m.id, g.winner === 0 ? match.a : match.b, countScore(g), g.turn)) { if (A.state.status === 'completed') celebrate('completed'); broadcast(); }
      }
      deliver(sender === match.a ? match.b : match.a, { t: 'game', id: m.id, payload: m.payload }); return;
    }
    if (m.t === 'board') {
      const b = m.board; if (!validPublic(b)) return;
      receiveBoard({ t: 'public', id: m.id, board: b });
      for (const c of A.links.values()) if (c.open) c.send(JSON.stringify({ t: 'public', id: m.id, board: b }));
    }
  }
  function validPublic(b) {
    return b && Number.isInteger(b.turn) && Array.isArray(b.players) && b.players.length === 2 &&
      b.players.every(p => Array.isArray(p.lines) && p.lines.length === 3 && p.lines.every(l => l.length <= 40 && l.every(c =>
        c.faceDown === true && Object.keys(c).length === 1 || c.faceDown === false && PROTOCOLS.includes(c.protocol) && Number.isInteger(c.value) && c.value >= 0 && c.value <= 6))) &&
      b.players.every(p => Array.isArray(p.protocols) && p.protocols.length === 3 && p.protocols.every(pr => PROTOCOLS.includes(pr.name)));
  }
  function gameEnvelope(m, sender, body) { return JSON.stringify({ v: NET_PROTOCOL, id: sender + '-resume-' + netRandomToken(8), seq: 1, fromUid: 'arena-' + sender, fromClient: sender, fromRole: sender === m.a ? 0 : 1, sentAt: Date.now(), body }); }
  function attachMatch(m) {
    if (!m || ![m.a, m.b].includes(A.me)) return;
    if (A.active === m.id) { send({ t: 'ready', id: m.id }); if (G) netSend(netHelloPayload()); return; }
    detachMatch(); newGame(); A.active = m.id; A.watching = null; screen = 'game'; root.hidden = true; G = null;
    const role = m.a === A.me ? 0 : 1;
    Object.assign(NET, { on: true, role, clientId: A.me, uid: 'arena-' + A.me, code: A.state.code, names: [name(m.a), name(m.b)],
      meta: { hostUid: 'arena-' + m.a, hostClientId: m.a, guestUid: 'arena-' + m.b, guestClientId: m.b, controlEnabled: A.state.controlEnabled },
      relayReady: false, directFallback: true, opponentReady: true, lastStartedTurnKey: null, outRevision: 0, lastAppliedRevision: 0,
      seen: new Set(), seenOrder: [], handledRequests: new Map(), inflightRequests: new Map(), preAuth: new Map() });
    NET.conn = { open: true, send: payload => send({ t: 'game', id: m.id, payload }) };
    updateChip(); netResetDraftSync(); draft.names = [...NET.names]; draft.cardSet = A.state.cardSet; draft.controlEnabled = A.state.controlEnabled;
    shell('MATCH CONNECTED', html(name(m.a)) + ' <i>VS</i> ' + html(name(m.b)), '対戦相手とドラフトを同期しています。', '<div class="arena-loading" aria-label="対戦準備中"><span></span><span></span><span></span></div>');
    screen = 'game'; send({ t: 'ready', id: m.id });
  }
  function playLocal(id) {
    if (A.active && G?.winner == null) throw Error('進行中の試合を先に終えてください');
    const m = A.state.matches.find(m => m.id === id); if (!m || !R.start(A.state, id)) return;
    detachMatch(); newGame(); A.active = id; screen = 'game'; root.hidden = true;
    q('#name0').value = name(m.a); q('#name1').value = name(m.b); draft.cardSet = A.state.cardSet; draft.controlEnabled = A.state.controlEnabled;
    q('#controlSetting [data-control="' + (draft.controlEnabled ? 'on' : 'off') + '"]')?.click();
    startDraft(); updateChip(); save();
  }
  function hubIfOpen() { if (root && !root.hidden && screen === 'hub') hub(); }
  function statusText(m) { return m.status === 'done' ? m.score.join(' : ') : m.status === 'bye' ? '不戦勝' : m.status === 'live' ? 'LIVE' : 'WAITING'; }
  function standings() {
    const rows = R.standings(A.state);
    return '<div class="arena-table-wrap"><table class="arena-table"><thead><tr><th>順位</th><th>プレイヤー</th><th>勝</th><th>敗</th><th>コンパイル</th><th>勝点</th></tr></thead><tbody>' +
      rows.map(p => '<tr class="' + (p.rank === 1 ? 'leader' : '') + '"><td>' + String(p.rank).padStart(2, '0') + '</td><th>' + html(p.name) + '</th><td>' + p.wins + '</td><td>' + p.losses + '</td><td>' + p.scored + ' / ' + p.conceded + '</td><td>' + p.points + '</td></tr>').join('') +
      '</tbody></table></div><p class="arena-small">' + (A.state.mode === 'league' ? '勝利3点。勝点 → コンパイル差 → 同条件の相手との勝利数で順位を決定。同点は同順位。' : '決勝で1・2位、3位決定戦で3・4位を決定。それ以前の敗退者は到達ラウンドで同順位。') + '</p>';
  }
  function hub() {
    screen = 'hub'; A.watching = null; const t = A.state;
    if (!t) { setup(); return; }
    const online = t.transport === 'online', connected = A.connection === 'online';
    if (t.status === 'lobby' || t.status === 'connecting') {
      const controls = A.host ? '<label>大会方式<select id="arenaMode" ' + (t.players.length < 4 ? 'disabled' : '') + '><option value="league">総当たり</option>' +
        '<option value="knockout">トーナメント</option></select></label><button class="primary" data-arena="launch" ' + (t.players.length < 3 || !connected ? 'disabled' : '') + '>このメンバーで開幕</button>' : '<p>主催者が大会を開始するまでお待ちください。</p>';
      shell('COMPETITION / LOBBY', 'GATHER YOUR RIVALS', '全員の名前を登録してから、大会を始めます。',
        '<div class="arena-lobby-grid"><article class="arena-panel"><h2>INVITE CODE</h2><div class="arena-code">A-' + html(t.code) + '</div><button data-arena="copy">コードをコピー</button>' +
        (A.connection === 'error' ? '<button data-arena="restart">接続をやり直す</button>' : '') + '<p class="arena-small">参加者は「大会アリーナ」からコードで参加。主催者の端末は大会中も開いたままにしてください。</p><div class="arena-connection">' + html(A.connection) + '</div></article>' +
        '<article class="arena-panel"><h2>ROSTER <em>' + t.players.length + '/16</em></h2><div class="arena-roster">' + t.players.map((p, i) =>
          '<div><span>' + String(i + 1).padStart(2, '0') + '</span><b>' + html(p.name) + '</b><i class="' + (p.online ? 'online' : '') + '"></i></div>').join('') +
        '</div>' + controls + '</article></div>', online ? 'LIVE CONNECTION / ' + html(A.connection) : '');
      if (A.host && t.players.length >= 4 && q('#arenaMode')) q('#arenaMode').value = t.mode;
      return;
    }
    const done = t.status === 'completed', rows = R.standings(t), leaders = rows.filter(p => p.rank === 1);
    const ready = new Set(R.ready(t).map(m => m.id)), round = Math.max(1, ...R.ready(t).map(m => m.round));
    const rounds = t.mode === 'knockout' ? Array.from({length: Math.ceil(Math.log2(t.players.length))}, (_, i) => i + 1) : [...new Set(t.matches.map(m => m.round))];
    const palette = ['#ff546b','#42b9ff','#f3c35b','#88d17d','#b69bff','#fa9867','#64ded9','#f086c8'];
    const playerRow = (id, winner, score) => {
      const player = t.players.find(p => p.id === id), color = palette[(player?.seed || 0) % palette.length];
      return '<div class="arena-fighter ' + (winner ? 'winner' : '') + '" style="--fighter:' + color + '"><span class="arena-emblem">' +
        (player ? html(player.name.charAt(0)) : '◇') + '</span><span class="arena-fighter-name">' + (player ? html(player.name) : '勝ち上がり待ち') +
        '</span><b>' + (score ?? '') + '</b>' + (winner ? '<small>WIN</small>' : '') + '</div>';
    };
    const matchCard = m => {
      if (m.status === 'future') return '<article class="arena-match future"><header><small>COMING NEXT</small><span>' + (m.kind === 'bronze' ? '3位決定戦' : 'QUALIFIER') + '</span></header>' + playerRow(null,false) + '<i class="arena-vs">VS</i>' + playerRow(null,false) + '</article>';
      const playable = t.transport === 'local' || [m.a,m.b].includes(A.me);
      const button = m.status === 'pending' && ready.has(m.id) && playable ? '<button data-arena="play" data-id="' + m.id + '">対戦を始める ↗</button>' :
        m.status === 'live' ? '<button data-arena="' + (A.active === m.id ? 'return' : 'watch') + '" data-id="' + m.id + '">' + (A.active === m.id ? '自分の試合へ' : 'この試合を観戦 ↗') + '</button>' :
        m.status === 'done' && A.publicBoards[m.id] ? '<button data-arena="watch" data-id="' + m.id + '">最終盤面を見る</button>' : '';
      return '<article class="arena-match ' + m.status + '"><header><small>' + (m.status === 'live' ? '<i class="arena-live-dot"></i> ' : '') + statusText(m) +
        '</small><span>' + (m.kind === 'bronze' ? '3位決定戦' : 'MATCH ' + String(t.matches.indexOf(m)+1).padStart(2,'0')) + '</span></header>' +
        playerRow(m.a,m.winner === m.a,m.score?.[0]) + '<i class="arena-vs">VS</i>' + (m.b ? playerRow(m.b,m.winner === m.b,m.score?.[1]) : '<div class="arena-fighter arena-bye">不戦勝 / BYE</div>') + button + '</article>';
    };
    const bracket = rounds.map(r => {
      const group = t.matches.filter(m => m.round === r && m.kind !== 'bronze');
      const matches = group.length ? group : Array.from({length: 2 ** (rounds.length-r)},(_,i)=>({id:'future-'+r+'-'+i,status:'future'}));
      return '<section class="arena-round" style="--slot:' + (240 * 2 ** (r-1)) + 'px"><h3>' +
        (t.mode === 'knockout' ? r === rounds.length ? 'GRAND FINAL / 決勝' : r === rounds.length-1 ? 'SEMIFINAL / 準決勝' : 'ROUND '+r : 'ROUND '+r) + '</h3>' +
        matches.map((m,i) => '<div class="arena-slot ' + (i%2 ? 'lower' : 'upper') + '">' + matchCard(m) + '</div>').join('') + '</section>';
    }).join('');
    const bronze = t.matches.find(m => m.kind === 'bronze');
    const placement = t.mode === 'knockout' ? '<section class="arena-placement"><div><small>ONE MORE BATTLE</small><h2>BRONZE BATTLE</h2><p>準決勝の敗者同士で、3位を決める。</p></div>' +
      matchCard(bronze || {status:'future',kind:'bronze'}) + '<div class="arena-medal">03<span>PLACE</span></div></section>' : '';
    shell(done ? 'COMPETITION COMPLETE' : 'COMPETITION / ROUND ' + String(round).padStart(2, '0'),
      done ? '<span class="arena-crown">◇</span> ' + leaders.map(p => html(p.name)).join(' & ') : t.mode === 'knockout' ? 'ROAD TO GLORY' : 'EVERY RIVAL. EVERY ROUND.',
      done ? 'CHAMPION' + (leaders.length > 1 ? 'S · 同順位' : '') + ' / 全対戦の成績が確定しました。' :
        (online ? '同じラウンドの試合は同時に進行。先に終わったら、他の組の戦いを観戦できます。' : '1台で順番に対戦します。各ラウンドが終わると次の組み合わせへ進みます。'),
      '<div class="arena-overview"><span><b>' + t.players.length + '</b>PLAYERS</span><span><b>' + t.matches.filter(m => m.status === 'done').length + ' / ' +
      (t.mode === 'knockout' ? t.players.length : t.matches.length) + '</b>MATCHES COMPLETE</span><span><b>' + (t.mode === 'league' ? 'LEAGUE' : 'KNOCKOUT') + '</b>FORMAT</span></div>' +
      '<div class="arena-toolbar"><span class="arena-connection">' + (online ? html(A.connection) : 'LOCAL') + '</span>' + (A.active && G?.winner == null ? '<button data-arena="return">自分の試合に戻る</button>' : '') +
      '<button data-arena="export">成績をCSVで保存</button><button data-arena="leave">大会を終了</button></div>' +
      '<div class="arena-bracket ' + (t.mode === 'knockout' ? 'knockout' : '') + '">' + bracket + '</div>' + placement + '<article class="arena-panel arena-results"><h2>' +
      (done ? 'FINAL STANDINGS' : 'LIVE STANDINGS') + '</h2>' + standings() + '</article>' +
      (done ? '<article class="arena-panel"><h2>MATCH REPORT</h2><div class="arena-history">' + t.matches.filter(m => m.status === 'done').map(m =>
        '<div><span>' + (m.kind === 'bronze' ? '3位戦' : 'R' + m.round) + '</span><b>' + html(name(m.a)) + ' <i>' + m.score.join(' — ') + '</i> ' + html(name(m.b)) +
        '</b><small>' + m.turns + '手番 · ' + Math.max(1, Math.round((m.endedAt - m.startedAt) / 60000)) + '分</small></div>').join('') + '</div></article>' : ''),
      online ? 'LIVE CONNECTION / ' + html(A.connection) : 'LOCAL COMPETITION');
  }
  function receiveBoard(m) {
    if (!validPublic(m.board) || !A.state?.matches.some(x => x.id === m.id)) return;
    A.publicBoards[m.id] = m.board; if (A.watching === m.id && root && !root.hidden) watch(m.id, true); save();
  }
  function watch(id, update = false) {
    if (A.active && G?.winner == null) { notice('自分の対戦が終わってから観戦できます'); return; }
    screen = 'watch'; A.watching = id; const m = A.state.matches.find(m => m.id === id), b = A.publicBoards[id];
    if (!m) return;
    const card = c => c.faceDown ? '<div class="arena-public-card back"><span>◇</span><small>HIDDEN</small></div>' :
      '<div class="arena-public-card" style="--protocol:' + pmeta(c.protocol).ac + '"><small>' + html(pmeta(c.protocol).k || c.protocol) + '</small><b>' + c.value +
      '</b><span>' + html(c.protocol) + '</span></div>';
    const lanes = b ? [0, 1, 2].map(l => '<section class="arena-watch-lane"><h3>LINE ' + (l + 1) + '</h3>' + [1, 0].map(p =>
      '<div class="arena-watch-side"><header><span>' + html(b.players[p].protocols[l].name) + (b.players[p].protocols[l].compiled ? ' ◇ COMPILED' : '') +
      '</span><b>' + (b.totals?.[p]?.[l] ?? '—') + '</b></header><div class="arena-public-stack">' + b.players[p].lines[l].map(card).join('') +
      (b.players[p].lines[l].length ? '' : '<span class="arena-empty">EMPTY LINE</span>') + '</div></div>').join('') + '</section>').join('') :
      '<div class="arena-panel arena-empty">ドラフト中です。盤面が公開されるまでお待ちください。</div>';
    const turn = b ? 'TURN ' + b.turn + ' / ' + html(b.players[b.current].name) : 'DRAFTING';
    const hud = b ? b.players.map(p => '<div><b>' + html(p.name) + '</b><span>手札 ' + p.handCount + ' · 山札 ' + p.deckCount + ' · TRASH ' + p.discardCount + '</span></div>').join('') : '';
    if (update && q('#arenaWatchBoard')) { q('#arenaWatchBoard').innerHTML = lanes; q('#arenaWatchTurn').innerHTML = turn; q('#arenaSpectatorHud').innerHTML = hud; return; }
    shell(m.status === 'done' ? 'MATCH COMPLETE / REPLAY BOARD' : 'LIVE / SPECTATOR', html(name(m.a)) + ' <i>VS</i> ' + html(name(m.b)),
      '公開盤面のみを表示。手札・山札・裏向きカードの中身は見えません。',
      '<div class="arena-toolbar"><button data-arena="hub">大会一覧へ戻る</button><span class="arena-live-label" id="arenaWatchTurn">' + turn +
       '</span></div><div class="arena-spectator-hud" id="arenaSpectatorHud">' + hud + '</div><div class="arena-watch-board" id="arenaWatchBoard">' + lanes + '</div>');
  }
  function onRender() {
    if (!A.active || !G) return;
    if (root && !root.hidden && screen === 'game') root.hidden = true;
    const g = G, m = A.state.matches.find(m => m.id === A.active); if (!m) return;
    if (g._arena !== m.id) g._arena = m.id;
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      if (G !== g || A.active !== m.id) return;
      const b = R.publicGame(g, [0, 1].map(p => [0, 1, 2].map(l => stackTotal(p, l))));
      const serial = JSON.stringify(b);
      if (serial !== lastBoard) { lastBoard = serial; if (A.state.transport === 'online') send({ t: 'board', id: m.id, board: b }); else { A.publicBoards[m.id] = b; save(); } }
      if (g.winner == null || A.finished.has(m.id)) return;
      A.finished.add(m.id);
      if (A.state.transport === 'online') {
        // Either side can provide the final stable state; the host validates it.
        netSend({ t: 'state', G: g });
      } else if (R.result(A.state, m.id, g.winner === 0 ? m.a : m.b, countScore(g), g.turn)) { if (A.state.status === 'completed') celebrate('completed'); save(); }
      chip?.classList.add('completed'); updateChip();
    }, g.winner == null ? 120 : 0);
    const menu = q('#newBtn'); if (menu) { menu.textContent = '大会'; menu.onclick = () => hub(); }
    updateChip();
  }
  function updateChip() {
    if (!chip) { chip = document.createElement('button'); chip.id = 'arenaChip'; chip.onclick = () => { closeModal('arena'); hub(); }; document.body.append(chip); }
    chip.hidden = !A.state || !A.active;
    chip.innerHTML = '<span>◇</span><b>' + (G?.winner != null ? '大会へ / 他の試合を観戦' : '大会の組み合わせ') + '</b>';
  }
  function exportCSV() {
    const cell = v => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'$&") + '"';
    const rows = [['順位', '名前', '勝', '敗', 'コンパイル得点', 'コンパイル失点', '勝点'], ...R.standings(A.state).map(p => [p.rank, p.name, p.wins, p.losses, p.scored, p.conceded, p.points]),
      [], ['ラウンド', 'プレイヤー1', 'プレイヤー2', '得点1', '得点2', '勝者', '手番数']];
    for (const m of A.state.matches.filter(m => m.status === 'done')) rows.push([m.kind === 'bronze' ? '3位決定戦' : m.round, name(m.a), name(m.b), ...m.score, name(m.winner), m.turns]);
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'compile-arena-results.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function celebrate(status) {
    if (!['running', 'completed'].includes(status)) return;
    q('#arenaCeremony')?.remove(); clearTimeout(ceremonyTimer);
    const el = document.createElement('div'); el.id = 'arenaCeremony'; el.setAttribute('role', 'status');
    const completed = status === 'completed', winners = completed ? R.standings(A.state).filter(p => p.rank === 1).map(p => html(p.name)).join(' & ') : 'THE ARENA';
    el.innerHTML = '<div class="arena-ceremony-ring"></div><div class="arena-ceremony-line"></div><div class="arena-ceremony-copy"><small>' + (completed ? 'COMPETITION COMPLETE' : 'ALL RIVALS CONNECTED') + '</small><span>◇</span><h2>' + winners + '</h2><p>' + (completed ? 'CHAMPION' : 'LET THE COMPETITION BEGIN') + '</p></div><button aria-label="演出をスキップ">SKIP ↗</button>';
    document.body.append(el); const finish = () => { clearTimeout(ceremonyTimer); el.remove(); };
    el.querySelector('button')?.addEventListener('click', finish);
    try { window.COMPILE_AUDIO?.sfx(completed ? 'win' : 'compile'); } catch {}
    ceremonyTimer = setTimeout(finish, typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : 2400);
  }
  function notice(message) { toast(String(message), 5000); }
  async function action(type, id) {
    try {
      if (type === 'host') await host();
      else if (type === 'join') await join();
      else if (type === 'local') local();
      else if (type === 'restart') { stop(); A.state = null; setup(); }
      else if (type === 'launch') {
        if (!A.host || A.state.players.length < 3 || A.state.players.some(p => !p.online)) throw Error('全員の接続を確認してください');
        const old = A.state, mode = q('#arenaMode').value;
        A.state = { ...R.create(old.players, mode, { ...old, id: old.id }), code: old.code, hostId: old.hostId };
        A.state.players.forEach(p => p.online = true); celebrate('running'); broadcast();
      } else if (type === 'play') {
        if (A.active && G?.winner == null) throw Error('自分の対戦を先に終えてください');
        if (A.state.transport === 'local') playLocal(id); else send({ t: 'start', id });
      } else if (type === 'watch') watch(id);
      else if (type === 'hub') hub();
      else if (type === 'return' || type === 'close') {
        root.hidden = true; A.watching = null;
        if (A.active && G) { q('#setup').classList.add('hidden'); render(); if (A.state.transport === 'local' && G.phase === 'handoff') showHandoff(); }
      }
      else if (type === 'copy') { await netCopyRoomCode('A-' + A.state.code); }
      else if (type === 'export') exportCSV();
      else if (type === 'leave') {
        if (await confirmAsk('大会を終了', '大会中の退出は他の参加者に影響します。成績はこの端末に残ります。', '終了する', '戻る')) {
          try { localStorage.setItem(KEY, JSON.stringify({state: A.state, boards: A.publicBoards, closed: true})); } catch {}
          stop(); root.hidden = true; if (chip) chip.hidden = true; A.state = null; sessionStorage.removeItem(SESSION);
        }
      }
    } catch (e) { notice(e.message || '操作できませんでした'); }
  }
  async function home() {
    if (A.active && G?.winner == null) return;
    onRender(); await new Promise(resolve => setTimeout(resolve,0));
    detachMatch(); save(); root.hidden = true; if(chip)chip.hidden=true;
    clearTimeout(ceremonyTimer); q('#arenaCeremony')?.remove(); newGame();
  }
  const welcome = renderWelcome;
  renderWelcome = function() { const r = welcome.apply(this, arguments); install(); return r; };
  function install() {
    const modes = q('.cin-modes') || q('.setupactions'); if (!modes || q('#arenaOpen')) return;
    const b = document.createElement('button'); b.id = 'arenaOpen'; b.className = 'cin-mode arena-mode';
    b.innerHTML = '<span class="cin-modeicon" aria-hidden="true">◇</span><span class="cin-modecopy"><small>04 / COMPETITION</small><b>大会アリーナ</b><em>3〜16人で、王座を争う。</em></span><span class="cin-modearrow">↗</span>';
    b.onclick = () => A.state ? hub() : setup(); modes.insertBefore(b, modes.querySelector('.cin-support'));
  }
  const draw = render;
  render = function() { const r = draw.apply(this, arguments); onRender(); return r; };
  const drawDraft = renderDraft, drawNet = netRenderDraftStage;
  renderDraft = function() { if (A.active && root) root.hidden = true; return drawDraft.apply(this, arguments); };
  netRenderDraftStage = function() { if (A.active && root) root.hidden = true; return drawNet.apply(this, arguments); };
  const finish = finishSetup;
  finishSetup = function() { const r = finish.apply(this, arguments); if (A.active && G) { G._arena = A.active; if (NET.on) netSend({ t: 'state', G }); } return r; };
  const modal = showModal;
  showModal = function(o) {
    if (A.active && G?.winner != null && /\sWIN\b/.test(String(o?.title))) {
      o = { ...o, buttons: [{ label: '大会へ / 他の試合を観戦', value: 'arena', className: 'primary' }, { label: '最終盤面を見る', value: 'view' }, { label: 'ホームに戻る', value: 'home' }] };
      return modal.call(this, o).then(async v => { if (v === 'arena') hub(); if (v === 'home') await home(); return ['arena','home'].includes(v) ? 'view' : v; });
    }
    return modal.apply(this, arguments);
  };
  // Restore local competitions and reconnect online guests without creating a new player.
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null'), session = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
    if (!stored?.closed && stored?.state?.version === 1 && stored.state.players?.length >= 3) {
      A.state = stored.state; A.publicBoards = stored.boards || {};
      if (A.state.transport === 'local') {
        A.host = true; A.me = A.state.players[0].id;
        const savedGame = loadSave(), live = A.state.matches.find(m => m.status === 'live');
        if (live && savedGame?._arena === live.id) { A.active = live.id; G = savedGame; NET.on = false; updateChip(); }
        else if (live) { live.status = 'pending'; live.startedAt = null; save(); }
      } else if (session && !session.host && session.code === A.state.code) {
        A.me = session.me; A.token = session.token; A.host = false; setTimeout(() => void join(session).catch(e => notice(e.message)), 0);
      } else if (A.state.status !== 'completed') A.state = null;
    }
  } catch {}
  ensureRoot(); install();
  window.COMPILE_ARENA = Object.freeze({ open: () => A.state ? hub() : setup(), state: () => R.copy(A.state), publicBoards: () => R.copy(A.publicBoards), home });
})();

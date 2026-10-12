// App-level orchestration: creating/joining rooms, CPU games, restore, leave.
import * as R from '../core/rules.js';
import { HostSession } from '../net/host.js';
import { ClientController } from '../net/client.js';
import { PeerHostTransport, PeerGuestTransport, LocalHostTransport, LocalGuestTransport, transportKind } from '../net/transports.js';
import { S, set, setUI, toast } from './store.js';
import { store as ls, KEYS, pruneStorage } from '../util/storage.js';
import { onSnapshot, resetFx } from './fx.js';

let host = null;
let client = null;

export const getHost = () => host;
export const getClient = () => client;

function cleanup() {
  try { client?.close(); } catch { /* ignore */ }
  try { host?.close(); } catch { /* ignore */ }
  client = null; host = null;
  resetFx();
}

function playerName() {
  const n = R.cleanName(S().name || 'PLAYER');
  ls.set(KEYS.name, n);
  return n;
}

function bindClient(c) {
  client = c;
  c.on((type, data) => {
    if (type === 'snap') {
      const { prev, next } = data;
      set({ snap: next, screen: 'room' });
      onSnapshot(prev, next);
    } else if (type === 'status') {
      set({ conn: data });
    } else if (type === 'notice') {
      toast(data.text, data.kind === 'error' ? 'error' : 'info');
    } else if (type === 'fatal') {
      toast(data.text, 'error', 6000);
      leaveRoom(false);
    } else if (type === 'revealReq') {
      if (data.missing) toast('この端末に行動予測の記録がありません。遺跡役に手動での公開を依頼してください。', 'error', 6000);
    }
  });
}

function saveSession(extra) { ls.set(KEYS.session, { ...extra, at: Date.now() }); }
export function lastSession() { const s = ls.get(KEYS.session); return s && Date.now() - (s.at || 0) < 1000 * 60 * 60 * 18 ? s : null; }
export function clearSession() { ls.del(KEYS.session); }

async function startHostTransport(code) {
  const T = transportKind() === 'local' ? LocalHostTransport : PeerHostTransport;
  const t = new T(code);
  t.onStatus = (st) => set({ conn: st });
  await t.start();
  return t;
}

// Online room. ruins: 'me' (this device plays the ruins) or 'cpu' (everyone explores).
export async function createOnlineRoom({ ruins = 'me', level = 'normal', explorerCount = 2 } = {}) {
  cleanup();
  set({ screen: 'connecting', conn: { state: 'connecting', text: '部屋を作成中…' } });
  const name = playerName();
  const cid = S().clientId;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = R.randomToken(7);
    const state = R.createRoom({ roomCode: code, hostClientId: cid, hostName: name, ruinsCpu: ruins === 'cpu' ? level : null });
    if (ruins === 'cpu') R.setOptions(state, { explorerCount, cpuLevel: level });
    try {
      const transport = await startHostTransport(code);
      host = new HostSession(state);
      host.attachTransport(transport);
      const c = new ClientController({ clientId: cid, name });
      bindClient(c);
      c.attachLocal(host);
      saveSession({ role: 'host', room: code });
      return code;
    } catch (e) {
      lastErr = e;
      if (!/使用中/.test(e.message)) break;
    }
  }
  cleanup();
  set({ screen: 'title' });
  toast(lastErr?.message || '部屋を作成できませんでした。', 'error', 6000);
  return null;
}

export async function joinOnlineRoom(codeRaw) {
  const code = R.normalizeRoomCode(codeRaw);
  if (!R.validRoomCode(code)) { toast('7文字のルームコードを確認してください。', 'error'); return false; }
  cleanup();
  set({ screen: 'connecting', conn: { state: 'connecting', text: `部屋 ${code} に接続中…` } });
  const name = playerName();
  const cid = S().clientId;
  const T = transportKind() === 'local' ? LocalGuestTransport : PeerGuestTransport;
  const t = new T(code, cid);
  const c = new ClientController({ clientId: cid, name });
  bindClient(c);
  c.attachRemote(t);
  try {
    await t.start();
    saveSession({ role: 'guest', room: code });
    // wait for the first snapshot (or fail)
    const ok = await new Promise((resolve) => {
      if (S().snap?.roomCode === code) return resolve(true);
      const timer = setTimeout(() => { off(); resolve(false); }, 12000);
      const off = c.on((type) => { if (type === 'snap') { clearTimeout(timer); off(); resolve(true); } });
    });
    if (!ok) throw new Error('部屋が見つかりませんでした。コードを確認するか、ホストに部屋を開き直してもらってください。');
    return true;
  } catch (e) {
    cleanup();
    set({ screen: 'title', snap: null });
    toast(e.message || String(e), 'error', 6000);
    return false;
  }
}

// Solo vs CPU. as: 'explorer' (you explore vs CPU ruins) | 'ruins' (you build vs CPU explorers)
export function startCpuGame({ as = 'explorer', level = 'normal', explorerCount = 2 } = {}) {
  cleanup();
  const name = playerName();
  const cid = S().clientId;
  const code = 'CPU' + R.randomToken(4);
  let state;
  if (as === 'explorer') {
    state = R.createRoom({ roomCode: code, hostClientId: cid, hostName: name, ruinsCpu: level });
    R.setOptions(state, { explorerCount, cpuLevel: level });
  } else {
    state = R.createRoom({ roomCode: code, hostClientId: cid, hostName: name });
    R.setOptions(state, { explorerCount, cpuLevel: level });
    R.addCpuExplorer(state, level);
    state.seats.find(s => s.cpu && s.role === 'explorer').name = 'CPU 探検隊';
  }
  R.beginSetup(state);
  host = new HostSession(state);
  const c = new ClientController({ clientId: cid, name });
  bindClient(c);
  c.attachLocal(host);
  saveSession({ role: 'host', room: code, cpu: true });
  set({ screen: 'room' });
  setUI({ tab: 'map', focusEid: null });
}

export async function restoreSession() {
  const s = lastSession();
  if (!s) return false;
  if (s.role === 'host') {
    const state = HostSession.restore(s.room);
    if (!state) { toast('前回の部屋のデータが見つかりませんでした。', 'error'); clearSession(); return false; }
    cleanup();
    set({ screen: 'connecting', conn: { state: 'connecting', text: '部屋を復元中…' } });
    const cid = state.hostClientId;
    if (cid !== S().clientId) { set({ clientId: cid }); ls.set(KEYS.client, cid); }
    for (const seat of state.seats) if (!seat.cpu && seat.clientId !== cid) seat.connected = false;
    try {
      host = new HostSession(state);
      if (!s.cpu) {
        const transport = await startHostTransport(state.roomCode);
        host.attachTransport(transport);
      }
      const c = new ClientController({ clientId: cid, name: R.seatOf(state, cid)?.name || playerName() });
      bindClient(c);
      c.attachLocal(host);
      toast('部屋を復元しました。仲間は自動で再接続されます。', 'info', 4500);
      return true;
    } catch (e) {
      cleanup();
      set({ screen: 'title' });
      toast(e.message || String(e), 'error', 6000);
      return false;
    }
  }
  return joinOnlineRoom(s.room);
}

export function leaveRoom(clear = true) {
  cleanup();
  if (clear) clearSession();
  set({ screen: 'title', snap: null, sheet: null, menu: null, conn: { state: 'idle', text: '' } });
  setUI({ tab: 'map', focusEid: null, selectedGuard: null, tbSel: null, replayRound: null });
}

// ───────── actions ─────────
export async function act(action, { quiet = false } = {}) {
  if (!client) return false;
  try {
    await client.act(action);
    return true;
  } catch (e) {
    if (!quiet) toast(e.message || String(e), 'error');
    return false;
  }
}
export async function predict(eid, choice) {
  if (!client) return false;
  try { await client.predict(eid, choice); return true; } catch (e) { toast(e.message || String(e), 'error'); return false; }
}
export function forceReveal(eid, choice) {
  if (!host) return;
  try { host.forceReveal(eid, choice); } catch (e) { toast(e.message || String(e), 'error'); }
}
export function isLocalHost() { return !!host; }

pruneStorage();

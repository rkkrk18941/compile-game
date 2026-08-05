import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The bundled Windows runtime sits behind a locally trusted TLS interceptor.
   Re-exec once with the system certificate store so the ordinary command works. */
if (process.platform === 'win32' && !process.execArgv.includes('--use-system-ca') && process.env.COMPILE_CPU_CA_REEXEC !== '1') {
  const child = spawnSync(process.execPath, ['--use-system-ca', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, COMPILE_CPU_CA_REEXEC: '1' }
  });
  if (child.error) console.error(child.error.message);
  process.exit(child.status ?? 1);
}

const API_KEY = 'AIzaSyBk3VGsRGRLhqanV1ZGUZbHoPrtM9KTypg';
const DATABASE_URL = 'https://compile-game-online-default-rtdb.asia-southeast1.firebasedatabase.app';
const ROOM_POOL = Object.freeze([
  '2MT8VXHA','3EBAPTCW','4HNKEHRP','4HUP22Y8','7NWPQGJ5','83P9D2TT','8YQHFVEE',
  '92CNQYMD','9K4MJCLA','9NZFNFYV','B7CG4KHL','BZ49L3MT','DT3595JH','EK4N4765','F6JZ3V4F',
  'FAHRNAKZ','GKQ28UZC','GTXPBG5L','JK9MHLXS','MFJ9EG3F','P6GWXPYN','PK7G9HLR','PZXSGU9W',
  'QNXCGVMY','RXAGDU9T','S8XXNGDH','SN4LX6BC','TGZGUJMR','UZ62P2UZ','WR5P6388','WRNT2KZL'
]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inboxRoot = path.join(repoRoot, 'logs', 'cpu-training-inbox');
const pendingDir = path.join(inboxRoot, 'pending');
const analyzedDir = path.join(inboxRoot, 'analyzed');
const authFile = path.join(inboxRoot, '.collector-auth.json');

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let value = null;
  try { value = text ? JSON.parse(text) : null; } catch { value = text; }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    error.status = response.status;
    throw error;
  }
  return value;
}

async function saveAuth(auth) {
  await mkdir(inboxRoot, { recursive: true });
  await writeFile(authFile, JSON.stringify({
    localId: auth.localId,
    refreshToken: auth.refreshToken,
    clientId: auth.clientId
  }, null, 2), 'utf8');
}

async function signUp() {
  const data = await requestJson(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
  });
  const auth = {
    localId: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    clientId: `COLLECT${Math.random().toString(36).slice(2, 8).toUpperCase()}`.slice(0, 32)
  };
  await saveAuth(auth);
  return auth;
}

async function collectorAuth() {
  let saved = null;
  try { saved = JSON.parse(await readFile(authFile, 'utf8')); } catch {}
  if (!saved?.refreshToken) return signUp();
  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken });
    const data = await requestJson(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
    });
    const auth = {
      localId: data.user_id,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      clientId: saved.clientId || 'COLLECTORCPU'
    };
    await saveAuth(auth);
    return auth;
  } catch (error) {
    throw new Error(`Collector authentication could not be refreshed. Preserve ${authFile}. ${error.message}`);
  }
}

async function db(pathname, auth, method = 'GET', body = undefined, allowMissing = false) {
  const url = `${DATABASE_URL}/${pathname}.json?auth=${encodeURIComponent(auth.idToken)}`;
  try {
    return await requestJson(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (allowMissing && error.status === 401) return null;
    throw error;
  }
}

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

function safeMatchId(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  return id || null;
}

async function acknowledge(args) {
  await mkdir(pendingDir, { recursive: true });
  await mkdir(analyzedDir, { recursive: true });
  const files = (await readdir(pendingDir)).filter(name => name.endsWith('.json'));
  const requested = args.includes('--ack-all')
    ? files
    : files.filter(name => args.some((arg, index) => args[index - 1] === '--ack' && name === `${safeMatchId(arg)}.json`));
  for (const name of requested) {
    const source = path.join(pendingDir, name), destination = path.join(analyzedDir, name);
    if (await exists(destination)) continue;
    await rename(source, destination);
  }
  return requested.map(name => name.replace(/\.json$/, ''));
}

async function pendingIds() {
  await mkdir(pendingDir, { recursive: true });
  return (await readdir(pendingDir)).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, '')).sort();
}

async function main() {
  await mkdir(pendingDir, { recursive: true });
  await mkdir(analyzedDir, { recursive: true });
  const acknowledged = await acknowledge(process.argv.slice(2));
  const auth = await collectorAuth();
  const linkedRooms = [], newlyLinkedRooms = [], waitingRooms = [], conflicts = [], newMatches = [], invalidMessages = [];

  for (const room of ROOM_POOL) {
    let meta;
    try { meta = await db(`rooms/${room}/meta`, auth, 'GET', undefined, true); }
    catch (error) { conflicts.push({ room, reason: error.message }); continue; }
    if (!meta?.hostUid || meta.hostName !== 'CPU TRAINING') continue;
    if (!meta.guestUid) {
      try {
        await db(`rooms/${room}/meta`, auth, 'PATCH', {
          guestUid: auth.localId,
          guestClientId: auth.clientId,
          guestName: 'CODEX TRAINER'
        });
        meta = { ...meta, guestUid: auth.localId, guestClientId: auth.clientId };
        newlyLinkedRooms.push(room);
      } catch (error) {
        waitingRooms.push({ room, reason: error.message });
        continue;
      }
    }
    if (meta.guestUid !== auth.localId) {
      conflicts.push({ room, reason: 'claimed by another collector identity' });
      continue;
    }
    linkedRooms.push(room);
    let messages;
    try { messages = await db(`rooms/${room}/messages`, auth, 'GET', undefined, true); }
    catch (error) { conflicts.push({ room, reason: error.message }); continue; }
    for (const [messageId, outer] of Object.entries(messages || {})) {
      let envelope = null;
      try { envelope = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : null; } catch {}
      const body = envelope?.body, match = body?.match, matchId = safeMatchId(match?.id);
      if (body?.t !== 'cpu_training_log' || !matchId || !match?.result) {
        invalidMessages.push({ room, messageId });
        continue;
      }
      const pendingFile = path.join(pendingDir, `${matchId}.json`), analyzedFile = path.join(analyzedDir, `${matchId}.json`);
      if (!(await exists(pendingFile)) && !(await exists(analyzedFile))) {
        await writeFile(pendingFile, JSON.stringify({
          receivedAt: new Date().toISOString(), room, schemaVersion: body.schemaVersion || 1,
          tuningLevel: body.tuningLevel ?? null, match
        }, null, 2), 'utf8');
        newMatches.push(matchId);
      }
      await db(`rooms/${room}/messages/${messageId}`, auth, 'DELETE');
    }
  }

  const result = {
    collectorReady: true,
    linkedRooms,
    newlyLinkedRooms,
    waitingRooms,
    conflicts,
    acknowledged,
    newMatches,
    pendingMatches: await pendingIds(),
    invalidMessages
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ collectorReady: false, error: error.message }, null, 2));
  process.exitCode = 1;
});

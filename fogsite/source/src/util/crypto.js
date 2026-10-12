import { randomToken } from '../core/rules.js';

export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const h = await subtle.digest('SHA-256', data);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (non-secure contexts): FNV-style mixing, still binding but weaker.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const b of data) { h1 = Math.imul(h1 ^ b, 16777619); h2 = Math.imul(h2 + b, 2246822519); }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padEnd(32, '0');
}

export async function makeCommit(room, round, eid, choice) {
  const nonce = randomToken(20);
  const commit = await sha256(`${room}|${round}|${eid}|${choice}|${nonce}`);
  return { choice, nonce, commit };
}

export async function verifyCommit(room, round, eid, choice, nonce, expected) {
  return (await sha256(`${room}|${round}|${eid}|${choice}|${nonce}`)) === expected;
}

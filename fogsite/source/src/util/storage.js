// localStorage wrapper that never throws (private mode, blocked storage, Node).
const mem = new Map();
function ls() { try { return globalThis.localStorage || null; } catch { return null; } }

export const store = {
  get(key, fallback = null) {
    try { const s = ls(); const raw = s ? s.getItem(key) : mem.get(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    try { const s = ls(); if (s) s.setItem(key, raw); else mem.set(key, raw); } catch { mem.set(key, raw); }
  },
  del(key) { try { const s = ls(); if (s) s.removeItem(key); mem.delete(key); } catch { mem.delete(key); } },
  keys(prefix = '') {
    const out = [];
    try { const s = ls(); if (s) { for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(prefix)) out.push(k); } } } catch { /* ignore */ }
    for (const k of mem.keys()) if (k.startsWith(prefix) && !out.includes(k)) out.push(k);
    return out;
  },
};

export const KEYS = {
  client: 'mm3:client',
  name: 'mm3:name',
  settings: 'mm3:settings',
  session: 'mm3:session',
  host: (room) => `mm3:host:${room}`,
  secret: (room, round, eid) => `mm3:pred:${room}:${round}:${eid}`,
  seen: 'mm3:seenTutorial',
};

// prune stale prediction secrets / host states (keep storage small)
export function pruneStorage() {
  const now = Date.now();
  for (const k of store.keys('mm3:host:')) { const v = store.get(k); if (!v || now - (v.updatedAt || 0) > 1000 * 60 * 60 * 24 * 3) store.del(k); }
  const preds = store.keys('mm3:pred:');
  if (preds.length > 120) for (const k of preds.slice(0, preds.length - 120)) store.del(k);
}

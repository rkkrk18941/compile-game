import { useEffect, useReducer } from 'preact/hooks';
import { store as ls, KEYS } from '../util/storage.js';
import { randomToken } from '../core/rules.js';

const DEFAULT_SETTINGS = { master: 0.8, music: 0.5, sfx: 0.85, muted: false, quality: 'high', haptics: true, coach: true, reduced: false };

function initialClientId() {
  // ?cid= lets several tabs of one browser act as different players (testing / local play)
  const q = new URLSearchParams(globalThis.location?.search || '').get('cid');
  if (q && /^[A-Za-z0-9-]{8,40}$/.test(q)) return q;
  let id = ls.get(KEYS.client);
  if (!id || typeof id !== 'string' || id.length < 12) { id = randomToken(18); ls.set(KEYS.client, id); }
  return id;
}

const initial = {
  screen: 'title',                // title | connecting | room
  menu: null,                     // title submenus: null | 'online' | 'join' | 'cpu'
  clientId: initialClientId(),
  name: ls.get(KEYS.name, '') || '',
  settings: { ...DEFAULT_SETTINGS, ...(ls.get(KEYS.settings, {}) || {}) },
  snap: null,
  conn: { state: 'idle', text: '' },
  toasts: [],
  sheet: null,                    // modal sheet { kind, ... }
  overlay: null,                  // full-screen pages: 'rules' | 'settings'
  ui: {
    tab: 'map', focusEid: null, selectedGuard: null,
    tbTool: 'move', tbSel: null, setupTool: 'toggle', clue: null,
    ruinsView: 'maze', showKnowledge: false, chatDraft: '', geo: [], abilityOpen: false,
    replayRound: null, replayPlaying: false,
  },
  busy: false,
  coachSeen: ls.get(KEYS.seen, {}) || {},
  unread: 0,
};

let state = initial;
const subs = new Set();

export const S = () => state;
export function set(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  for (const f of subs) f();
}
export function setUI(patch) { set(s => ({ ui: { ...s.ui, ...(typeof patch === 'function' ? patch(s.ui) : patch) } })); }
export function setSettings(patch) {
  set(s => { const settings = { ...s.settings, ...patch }; ls.set(KEYS.settings, settings); return { settings }; });
}
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function useApp() {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => subscribe(force), []);
  return state;
}

let toastSeq = 0;
export function toast(text, kind = 'info', ms = 3200) {
  const id = ++toastSeq;
  set(s => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ms);
}
export function openSheet(sheet) { set({ sheet }); }
export function closeSheet() { set({ sheet: null }); }
export function markCoach(key) { set(s => { const coachSeen = { ...s.coachSeen, [key]: true }; ls.set(KEYS.seen, coachSeen); return { coachSeen }; }); }

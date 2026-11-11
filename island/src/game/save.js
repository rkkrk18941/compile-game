// Persistent research database, antenna network, memos and settings (localStorage).
import { SPECIES, ITEMS } from "./data.js";

const KEY = "island.save.v1";

function fresh() {
  return {
    v: 1,
    research: {},          // id -> { known: 0..1 delivered, seen: bool }
    antennas: [],          // { id, x, z, shield, gain, placed }
    memos: [],             // { id, x, z, text, author, t, data: {id: amount}, mine }
    stats: { expeditions: 0, extractions: 0, rescues: 0, deepest: "shore" },
    loadout: ["decoy", "aid", "aid"],
    cleared: false,
    name: "",
    log: [],               // news for the briefing (e.g. destroyed antennas)
  };
}

export const Save = {
  data: null,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? Object.assign(fresh(), JSON.parse(raw)) : fresh();
    } catch (e) {
      this.data = fresh();
    }
    for (const s of SPECIES) if (!this.data.research[s.id]) this.data.research[s.id] = { known: 0, seen: false };
    return this.data;
  },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
  },
  reset() { this.data = fresh(); this.load(); this.write(); },
  known(id) { return (this.data.research[id] || {}).known || 0; },
  complete(id) { return this.known(id) >= 0.999; },
  unlocked(item) {
    const it = ITEMS[item];
    if (!it) return false;
    if (it.always) return true;
    if (it.unlockBy === "plants8") return SPECIES.filter((s) => s.kind === "plant" && this.complete(s.id)).length >= 8;
    return this.complete(it.unlockBy);
  },
  progressTotal() {
    let t = 0;
    for (const s of SPECIES) t += Math.min(1, this.known(s.id));
    return t / SPECIES.length;
  },
  antennaKits() {
    const p = this.progressTotal();
    return 3 + (p >= 0.25 ? 1 : 0) + (p >= 0.5 ? 1 : 0);
  },
  aidKits() { return 2 + (this.unlocked("coconut") ? 1 : 0); },
};

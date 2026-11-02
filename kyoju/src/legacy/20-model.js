/* ---------- 巨獣モデル ---------- */
const FRAME_H = { biped: 50, quad: 36, multi: 30, serpent: 48, hop: 32 };
const FRAME_LEN = { biped: 0.95, quad: 1.5, multi: 1.55, serpent: 1.05, hop: 1.2 };
const BACK_H = { wing: 3, insectwing: 4, shell: 2, fin: 4, crystal: 6, volcano: 4, spine: 5, sac: 3 };
const TAIL_LEN = { spike: 30, scorpion: 14, club: 26, whip: 34, tentacle: 28, stub: 8 };

function archOf(p) { return SPECIES[p.sp].parts[p.slot]; }
function newPart(sp, slot, plus = 0) { return { id: uid(), sp, slot, plus }; }
function partName(p) { return SPECIES[p.sp].kanji + 'の' + SLOT_JA[p.slot]; }
function partTier(p) { return SPECIES[p.sp].tier; }
function partSub(p) {
  const a = ARCH[p.slot][archOf(p)];
  if (p.slot === 'head') {
    const f = a.form, e = SPECIES[p.sp].elem;
    return a.noun + '・' + (SPECIAL_NAMES[f + ':' + e] || FORMS[f].noun);
  }
  if (p.slot === 'back') return a.noun + '・' + ABIL[a.abil].name;
  return a.noun;
}
function partStats(p) {
  const a = ARCH[p.slot][archOf(p)];
  const tier = SPECIES[p.sp].tier;
  const m = TIER_MUL[tier] * (1 + 0.12 * (p.plus || 0));
  const o = {};
  for (const k in a.st) {
    if (k === 'spd') o.spd = a.st.spd * (p.slot === 'legs' ? 1 + 0.05 * (tier - 1) + 0.02 * (p.plus || 0) : 1);
    else o[k] = a.st[k] * m;
  }
  return o;
}

function beastStats(b) {
  const s = { hp: 0, atk: 0, def: 0, spd: 0, pow: 0, reg: 0 };
  for (const slot of SLOTS) {
    const ps = partStats(b.parts[slot]);
    for (const k in ps) s[k] += ps[k];
  }
  const L = b.level || 1, lm = 1 + 0.09 * (L - 1);
  const ab = b.absorbed || {};
  const tr = b.traits || [];
  const has = (t) => tr.includes(t);
  let hp = s.hp * 1.5 * lm + (ab.hp || 0);
  let atk = s.atk * lm + (ab.atk || 0);
  let def = s.def * lm + (ab.def || 0);
  let pow = s.pow * lm + (ab.pow || 0);
  let spd = s.spd * (1 + 0.005 * (L - 1)) + (ab.spd || 0);
  let reg = s.reg * lm + (ab.reg || 0);
  if (has('rage')) atk *= 1.15;
  if (has('iron')) def *= 1.25;
  if (has('giant')) hp *= 1.08;
  if (has('regen')) reg += 4;
  if (has('swift')) spd *= 1.15;
  if (has('arcane')) pow *= 1.18;
  spd = Math.max(3, spd);
  const legs = archOf(b.parts.legs), back = archOf(b.parts.back), headA = archOf(b.parts.head);
  const tb = TIER_SIZE[SPECIES[b.parts.body.sp].tier], tl = TIER_SIZE[SPECIES[b.parts.legs.sp].tier];
  const sizeF = ((tb + tl) / 2) * (1 + 0.015 * (L - 1)) * (has('giant') ? 1.12 : 1);
  const height = (FRAME_H[legs] + (BACK_H[back] || 0)) * sizeF;
  const elem = SPECIES[b.parts.head.sp].elem;
  const form = ARCH.head[headA].form;
  const armsA = archOf(b.parts.arms), tailA = archOf(b.parts.tail);
  return {
    hp, atk, def, pow, spd, reg, sizeF, height, len: height * FRAME_LEN[legs],
    reach: ARCH.arms[armsA].reach * sizeF, hits: ARCH.arms[armsA].hits, tailLen: TAIL_LEN[tailA] * sizeF,
    elem, form, special: SPECIAL_NAMES[form + ':' + elem] || ELEM[elem].name + 'の' + FORMS[form].noun,
    abil: ARCH.back[back].abil, legs, arms: armsA, tail: tailA, back, head: headA, body: archOf(b.parts.body),
    traits: tr,
  };
}
function powerOf(st) {
  return Math.round(st.hp / 8 + st.atk * 3 + st.def * 2.2 + st.pow * 2.6 + st.spd * 12 + st.reg * 25);
}

function beastNameFor(parts) {
  const hs = SPECIES[parts.head.sp], bs = SPECIES[parts.body.sp];
  if (parts.head.sp === parts.body.sp) {
    const pure = SLOTS.every((s) => parts[s].sp === parts.head.sp);
    return hs.kanji + hs.kana.join('') + (pure ? '' : '改');
  }
  const k1 = hs.kanji[0];
  let k2 = bs.kanji[bs.kanji.length - 1];
  if (k2 === k1) k2 = bs.kanji[0];
  const a = hs.kana.slice(0, Math.ceil(hs.kana.length / 2));
  const b = bs.kana.slice(bs.kana.length - Math.max(1, Math.floor(bs.kana.length / 2)));
  return k1 + k2 + a.concat(b).join('');
}

function newBeast(parts, opts = {}) {
  return {
    id: uid(), name: opts.name || beastNameFor(parts), parts, level: opts.level || 1, xp: 0,
    traits: opts.traits || [], absorbed: {}, kills: 0, wins: 0, raids: 0, born: Date.now(), wild: !!opts.wild,
  };
}
function speciesBeast(sp, level = 1, opts = {}) {
  const parts = {};
  for (const s of SLOTS) parts[s] = newPart(sp, s);
  return newBeast(parts, Object.assign({ level }, opts));
}

function xpNeed(L) { return Math.round(30 * Math.pow(L, 1.45)); }
function randomTraitFor(b, from) {
  const pool = (from || Object.keys(TRAITS)).filter((t) => !b.traits.includes(t));
  return pool.length ? pick(pool) : null;
}
function addXp(b, xp) {
  b.xp = (b.xp || 0) + Math.round(xp);
  const out = { levels: 0, traits: [] };
  while (b.level < 99 && b.xp >= xpNeed(b.level)) {
    b.xp -= xpNeed(b.level);
    b.level++;
    out.levels++;
    if (b.level % 10 === 0 && b.traits.length < 4) {
      const t = randomTraitFor(b);
      if (t) { b.traits.push(t); out.traits.push(t); }
    }
  }
  return out;
}

/* 殺し合いの勝者が敗者を喰らう */
function devour(winner, loser) {
  const ls = beastStats(loser);
  const k = 0.12;
  const g = { hp: ls.hp * k, atk: ls.atk * k, def: ls.def * k, pow: ls.pow * k, reg: ls.reg * k, spd: ls.spd * 0.02 };
  winner.absorbed = winner.absorbed || {};
  for (const key in g) winner.absorbed[key] = (winner.absorbed[key] || 0) + g[key];
  let trait = null;
  if (winner.traits.length < 4) {
    const inherit = (loser.traits || []).filter((t) => !winner.traits.includes(t));
    if (inherit.length && chance(0.5)) trait = pick(inherit);
    else if (chance(0.3)) trait = randomTraitFor(winner);
    if (trait) winner.traits.push(trait);
  }
  return { gains: g, trait };
}
function fightXp(oppLevel, lethal) {
  const base = 22 * Math.pow(oppLevel, 1.3) + 10;
  return Math.round(base * (lethal ? 3 : 1));
}

/* ---------- 経済 ---------- */
const PRICE_BEAST = [0, 320, 1100, 3200, 9000];
const PRICE_PART = [0, 70, 240, 700, 2000];
const PRICE = { assemble: 80, refresh: 30, mutagen: 900, potion: 260 };

function diffMul(D, cycle) { return (1 + 0.55 * (D - 1)) * (1 + 0.7 * (cycle || 0)); }
function regionReward(D, cycle) { return 200 * Math.pow(D, 1.25) * (1 + 0.6 * (cycle || 0)); }
function firstFallBonus(D, cycle) { return Math.round(120 * D * (1 + 0.6 * (cycle || 0)) / 10) * 10; }
function allRegions() { const out = []; for (const w of WORLDS) if (!w.sealed) for (const r of w.regions) out.push({ w, r }); return out; }
function regionTotal() { return allRegions().length; }
function fallenCount(state) {
  let n = 0;
  for (const { r } of allRegions()) if (state.prog[r.id] && state.prog[r.id].fallen) n++;
  return n;
}
function worldFallen(state, w) { return w.regions.every((r) => state.prog[r.id] && state.prog[r.id].fallen); }
function regionUnlocked(state, w, idx) {
  if (idx === 0) return true;
  const prev = w.regions[idx - 1];
  return !!(state.prog[prev.id] && state.prog[prev.id].fallen);
}
function maxTier(state) {
  const f = fallenCount(state) + state.cycle * 12;
  return f >= 5 ? 4 : f >= 3 ? 3 : f >= 1 ? 2 : 1;
}
function beastPrice(b) {
  const tiers = SLOTS.map((s) => SPECIES[b.parts[s].sp].tier);
  const t = Math.max(...tiers);
  return Math.round(PRICE_BEAST[t] * (1 + 0.12 * (b.level - 1)) / 10) * 10;
}
function partPrice(p) { return Math.round(PRICE_PART[partTier(p)] * (1 + 0.45 * (p.plus || 0)) / 5) * 5; }
function sellPrice(p) { return Math.max(5, Math.round(partPrice(p) * 0.3 / 5) * 5); }

function genShop(state) {
  const mt = maxTier(state);
  const pool = Object.keys(SPECIES).filter((k) => SPECIES[k].tier <= mt);
  const weight = (k) => (SPECIES[k].tier === mt ? 2 : 1);
  const wpool = {}; for (const k of pool) wpool[k] = weight(k);
  const f = fallenCount(state);
  const beasts = [];
  for (let i = 0; i < 4; i++) {
    const b = speciesBeast(weighted(wpool), 1 + Math.floor(f / 2) + state.cycle * 6);
    b.price = beastPrice(b);
    beasts.push(b);
  }
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const p = newPart(weighted(wpool), pick(SLOTS), randi(0, Math.min(3, Math.floor(f / 3) + state.cycle)));
    p.price = partPrice(p);
    parts.push(p);
  }
  return { beasts, parts };
}

function genWild(state) {
  const levels = state.beasts.map((b) => b.level).sort((a, b) => b - a);
  const ref = levels.length ? Math.round((levels[0] + (levels[1] || levels[0])) / 2) : 1;
  const mt = maxTier(state);
  const pool = Object.keys(SPECIES).filter((k) => SPECIES[k].tier <= mt);
  const out = [];
  for (let i = 0; i < 3; i++) {
    let b;
    const lv = Math.max(1, Math.round(ref * rand(0.65, 1.15)));
    if (chance(0.5)) b = speciesBeast(pick(pool), lv, { wild: true });
    else {
      const sps = [pick(pool), pick(pool), pick(pool)];
      const parts = {};
      for (const s of SLOTS) parts[s] = newPart(pick(sps), s);
      b = newBeast(parts, { level: lv, wild: true });
    }
    if (chance(0.35)) b.traits.push(randomTraitFor(b));
    out.push(b);
  }
  return out;
}

/* ---------- 実績 ---------- */
const ACHV = {
  firstFall:    { name: '初陥落', desc: '初めて街を一つ陥落させた' },
  worldFall:    { name: '一界滅亡', desc: '人間界を一つ滅ぼした' },
  allFall:      { name: '黙示録', desc: '全ての人間界を滅ぼした' },
  lv10:         { name: '古き巨獣', desc: '巨獣が Lv.10 に到達した' },
  plus3:        { name: '鍛え上げた部位', desc: '+3 の部位を所持した' },
  kodoku10:     { name: '蠱毒の覇者', desc: '蠱毒で通算10勝した' },
  destroyed500: { name: '街喰い', desc: '建物を累計500棟壊した' },
  earned10000:  { name: '黒涙の玉座', desc: '黒涙を累計10,000集めた' },
};
/* 既存の stats / prog / 所持品だけを見る純関数：満たしている実績IDを返す */
function achvSatisfied(state, id) {
  const st = state.stats || {};
  switch (id) {
    case 'firstFall': return fallenCount(state) >= 1;
    case 'worldFall': return WORLDS.some((w) => worldFallen(state, w));
    case 'allFall': return regionTotal() > 0 && fallenCount(state) >= regionTotal();
    case 'lv10': return (state.beasts || []).some((b) => (b.level || 1) >= 10);
    case 'plus3': {
      if ((state.parts || []).some((p) => (p.plus || 0) >= 3)) return true;
      return (state.beasts || []).some((b) => SLOTS.some((sl) => (b.parts[sl].plus || 0) >= 3));
    }
    case 'kodoku10': return (st.kwins || 0) >= 10;
    case 'destroyed500': return (st.destroyed || 0) >= 500;
    case 'earned10000': return (st.earned || 0) >= 10000;
    default: return false;
  }
}
/* まだ達成していないのに条件を満たした実績ID（stateは変更しない） */
function newAchievements(state) {
  const have = new Set(state.achv || []);
  return Object.keys(ACHV).filter((id) => !have.has(id) && achvSatisfied(state, id));
}
/* 図鑑用：いま所持している巨獣・部位から見たことのある種IDの集合 */
function seenSpecies(state) {
  const out = new Set();
  for (const b of state.beasts || []) for (const sl of SLOTS) if (b.parts && b.parts[sl]) out.add(b.parts[sl].sp);
  for (const p of state.parts || []) out.add(p.sp);
  return out;
}

/* ---------- セーブ ---------- */
const SAVE_KEY = 'kyoju-mokushiroku-v1';
function newState() {
  const s = {
    v: 1, kokurui: 250, beasts: [], parts: [], shop: null, wild: null, prog: {}, cycle: 0, achv: [],
    stats: { raids: 0, destroyed: 0, earned: 0, kills: 0, kwins: 0 },
    settings: { sound: true, quality: 'auto' }, intro: false, saved: 0,
  };
  s.beasts.push(speciesBeast('varga'));
  s.beasts.push(speciesBeast('ganzo'));
  s.parts.push(newPart('gorai', 'head'), newPart('dromea', 'legs'), newPart('gorai', 'arms'));
  s.shop = genShop(s);
  s.wild = genWild(s);
  return s;
}
function validPart(p) { return p && SPECIES[p.sp] && SLOTS.includes(p.slot); }
function validBeast(b) { return b && b.parts && SLOTS.every((s) => validPart(b.parts[s]) && b.parts[s].slot === s); }
function sanitizeState(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return null;
  const d = newState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.beasts = (s.beasts || []).filter(validBeast);
  for (const b of s.beasts) { b.traits = (b.traits || []).filter((t) => TRAITS[t]); b.absorbed = b.absorbed || {}; b.level = b.level || 1; b.xp = b.xp || 0; }
  s.parts = (s.parts || []).filter(validPart);
  if (!s.shop || !Array.isArray(s.shop.beasts)) s.shop = genShop(s);
  s.shop.beasts = s.shop.beasts.filter(validBeast);
  s.shop.parts = (s.shop.parts || []).filter(validPart);
  if (!Array.isArray(s.wild)) s.wild = genWild(s);
  s.wild = s.wild.filter(validBeast);
  s.settings = Object.assign({ sound: true, quality: 'auto' }, s.settings || {});
  if (!['auto','low','std','high'].includes(s.settings.quality)) s.settings.quality = 'auto';
  s.stats = Object.assign({ raids: 0, destroyed: 0, earned: 0, kills: 0, kwins: 0 }, s.stats || {});
  s.achv = (Array.isArray(s.achv) ? s.achv : []).filter((id) => ACHV[id]);
  if (!s.prog || typeof s.prog !== 'object') s.prog = {};
  return s;
}

const Store = {
  state: null, cloud: null, timer: null, writing: false, pending: false,
  loadLocal() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return sanitizeState(JSON.parse(raw)); } catch (e) { /* 保存領域が使えない */ }
    return null;
  },
  saveLocal() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* 無視 */ } },
  save() {
    this.state.saved = Date.now();
    this.saveLocal();
    this.queueCloud();
  },
  queueCloud() {
    if (!this.cloud) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pushCloud(), 2500);
  },
  async pushCloud() {
    if (!this.cloud) return;
    if (this.writing) { this.pending = true; return; }
    this.writing = true;
    try { await this.cloud.set({ json: JSON.stringify(this.state), saved: this.state.saved }); } catch (e) { /* 次の保存で再試行 */ }
    this.writing = false;
    if (this.pending) { this.pending = false; this.queueCloud(); }
  },
  async initCloud(onAdopt) {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const ref = db.doc('data/users/' + id + '/save');
      const snap = await ref.get();
      this.cloud = ref;
      if (snap.exists) {
        const d = snap.data();
        if (d && typeof d.json === 'string' && (d.saved || 0) > (this.state.saved || 0)) {
          const st = sanitizeState(JSON.parse(d.json));
          if (st) { onAdopt(st); return; }
        }
      }
      if (this.state.saved) this.queueCloud();
    } catch (e) { this.cloud = null; }
  },
};

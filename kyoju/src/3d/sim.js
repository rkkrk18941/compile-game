// 侵攻の進行：巨獣の判断、建物の破壊と火事、住民の避難、軍勢の迎撃、被害の集計。
import * as THREE from 'three';
import { groundH, ROUTE, routePoint, routeProject, SETTLE_BY_ID, KINGDOM, settleDist } from './world.js';
import { clamp, lerp, rand, pick, smoothstep } from './noise.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/* ---------- 迎撃する人間たち ---------- */
export const UT = {
  militia: { name: '民兵', hp: 5, dmg: 0.45, cd: 1.3, range: 6, melee: 1, spd: 4.4, weap: 6, cloth: 'peasant' },
  spear: { name: '槍兵', hp: 8, dmg: 0.9, cd: 1.1, range: 7, melee: 1, spd: 4.0, weap: 2, cloth: 'soldier', hat: 1 },
  sword: { name: '剣兵', hp: 9, dmg: 1.1, cd: 1.0, range: 5, melee: 1, spd: 4.2, weap: 3, cloth: 'soldier', hat: 1 },
  archer: { name: '弓兵', hp: 5, dmg: 0.9, cd: 2.4, range: 230, proj: 'arrow', spd: 4.0, weap: 4, cloth: 'archer', hat: 2 },
  xbow: { name: '弩兵', hp: 6, dmg: 1.9, cd: 4.2, range: 210, proj: 'bolt', spd: 3.8, weap: 5, cloth: 'soldier', hat: 1 },
  knight: { name: '騎士', hp: 16, dmg: 2.8, cd: 1.5, range: 9, melee: 1, spd: 12, horse: 1, weap: 1, cloth: 'knight', hat: 1 },
  mage: { name: '魔導士', hp: 9, dmg: 4.2, cd: 3.2, range: 330, proj: 'orb', spd: 3.6, holy: 1, weap: 8, cloth: 'mage', hat: 3 },
  cannon: { name: '大砲', hp: 40, dmg: 8.5, cd: 11, range: 1150, proj: 'ball', machine: 'cannon', crew: 3 },
  ballista: { name: 'バリスタ', hp: 30, dmg: 5, cd: 5.5, range: 520, proj: 'bolt', machine: 'ballista', crew: 2 },
  trebuchet: { name: '投石機', hp: 70, dmg: 20, cd: 15, range: 950, proj: 'stone', machine: 'trebuchet', crew: 4 },
  bombard: { name: '大射石砲「黒鉄の鐘」', hp: 500, dmg: 140, cd: 30, range: 2800, proj: 'bigball', machine: 'bombard', crew: 6, boss: 1 },
  hero: { name: '竜殺しの勇者', hp: 420, dmg: 26, cd: 1.9, range: 11, melee: 1, spd: 17, holy: 1, weap: 3, cloth: 'hero', hat: 1, boss: 1 },
};
const CLOTH = {
  peasant: () => [[pick([0.42, 0.36, 0.3, 0.48]), pick([0.33, 0.3, 0.24, 0.38]), pick([0.22, 0.2, 0.16, 0.26]), 0], [0.22, 0.2, 0.16, Math.random() * 0.6]],
  soldier: () => [[0.42, 0.1, 0.08, 1], [0.24, 0.22, 0.2, Math.random() * 0.5]],
  archer: () => [[0.16, 0.24, 0.12, 2], [0.24, 0.2, 0.14, Math.random() * 0.5]],
  knight: () => [[0.52, 0.53, 0.56, 1], [0.4, 0.4, 0.42, Math.random() * 0.4]],
  mage: () => [[0.14, 0.16, 0.42, 3], [0.12, 0.12, 0.3, Math.random() * 0.4]],
  hero: () => [[0.8, 0.78, 0.7, 1], [0.6, 0.6, 0.62, 0.2]],
};
function civCloth() {
  const pal = [[0.55, 0.45, 0.32], [0.38, 0.22, 0.16], [0.24, 0.3, 0.42], [0.62, 0.58, 0.48], [0.3, 0.35, 0.22], [0.5, 0.2, 0.18], [0.45, 0.42, 0.36]];
  const a = pick(pal), b = pick([[0.24, 0.2, 0.16], [0.3, 0.26, 0.2], [0.18, 0.18, 0.2], [0.35, 0.3, 0.22]]);
  const robe = Math.random() < 0.38;
  return [[a[0], a[1], a[2], robe ? 3 : Math.random() < 0.3 ? 2 : 0], [b[0], b[1], b[2], Math.random() * 0.7]];
}

// 各集落の重み（報酬）
const SETTLE_D = { milt: 1, buchen: 1.3, garmund: 2.6, linden: 1.7, hasel: 1.2, capital: 5 };
export const STAGE_STOPS = ['milt', 'buchen', 'garmund', 'linden', 'capital'];

/* ---------- 空間の格子（建物の検索） ---------- */
class Grid {
  constructor(cell) { this.cell = cell; this.m = new Map(); }
  key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }
  add(o, x, z, r) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const k = this.key(ix, iz); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(o);
      }
  }
  query(x, z, r, out) {
    out.length = 0;
    const c = this.cell, stamp = (this.stamp = (this.stamp || 0) + 1);
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const a = this.m.get(this.key(ix, iz)); if (!a) continue;
        for (const o of a) { if (o._st === stamp) continue; o._st = stamp; out.push(o); }
      }
    return out;
  }
}

/* ---------- 本体 ---------- */
export class Sim {
  constructor(ctx) {
    Object.assign(this, ctx); // engine, kingdom, kb, flora, fx, humans, horses, machines, beast, anim, stats, opts
    this.opts = ctx.opts || {};
    this.cycle = this.opts.cycle || 0;
    this.sound = this.opts.sound || null;
    this.time = 0; this.clock = this.opts.startHour || 14.0;
    this.grid = new Grid(40);
    this.tmp = []; this.tmp2 = [];
    this.burning = new Set();
    this.agents = []; this.corpses = [];
    this.units = [];
    this.events = [];
    this.score = { bld: 0, value: 0, dead: 0, soldiers: 0, machines: 0, fallen: [], fires: 0 };
    this.dbg = { shots: {}, dmg: {} };
    this.done = null;
    this.shake = 0;
    this.capT = {};
    this.flash = 0;
    this.dmgMul = (1 + 0.7 * this.cycle) * (this.opts.armyK || 1);
    this.elemMul = { fire: 1.6, poison: 1, thunder: 1, curse: 0.5, shock: 1 };
    this.setupBeast();
    this.setupTowns();
    this.setupArmy();
  }
  /* ===== 準備 ===== */
  setupBeast() {
    const st = this.stats;
    this.B = { hp: st.hp, max: st.hp, regT: 0, invuln: 0, hurtT: 0, lastHit: 0, undyingUsed: false, dmgLog: [] };
    this.speed = clamp(st.spd, 3, 14);
    const k = clamp(this.opts.startStop | 0, 0, STAGE_STOPS.length - 1);
    let s0 = 80;
    if (k > 0) s0 = ROUTE.stops.find((q) => q.id === STAGE_STOPS[k]).s - 1700;
    const r0 = routePoint(s0);
    this.anim.place(r0.x, r0.z, Math.atan2(r0.dx, r0.dz));
    this.ai = { mode: 'march', stop: k, target: null, think: 0, cd: { special: 14, melee: 2, tail: 8, stomp: 6, roar: 6, fly: 30, erupt: 8 }, fightT: 0, threat: null, idle: 0, specialObj: null, wander: 0 };
    this.anim.onEvent = (type, d) => this.onBeastEvent(type, d);
    this.footR = this.anim.footR;
    // 直接操作（デフォルトは無効＝従来の自動判断のまま）
    this.manual = false;
    this.manualIn = { yaw: 0, speed: 0 };
    this.manualAim = null;
    this.manualTown = null;
  }
  /* ===== 直接操作API（stage から呼ばれる） ===== */
  setManual(on) {
    on = !!on;
    if (on === this.manual) return;
    this.manual = on;
    this.manualIn = { yaw: this.anim.yaw, speed: 0 };
    this.manualAim = null;
    if (on) { this.ai.mode = 'manual'; this.ai.target = null; this.ai.threat = null; }
    else if (this.ai.mode === 'manual') { this.ai.mode = 'march'; this.ai.target = null; }
  }
  // yaw: ワールドXZの移動方向（atan2(dx,dz) 形式）, speed: 0..1 の速度係数
  manualInput(input = {}) {
    if (input.yaw != null && Number.isFinite(input.yaw)) this.manualIn.yaw = input.yaw;
    else if (input.x != null && input.z != null && (input.x || input.z)) this.manualIn.yaw = Math.atan2(input.x, input.z);
    this.manualIn.speed = clamp(input.speed != null ? input.speed : (input.x != null ? Math.hypot(input.x, input.z || 0) : 0), 0, 1.25);
  }
  manualAimAt(x, z) { if (Number.isFinite(x) && Number.isFinite(z)) this.manualAim = { x, z }; }
  // プレイヤーの意思で近接・咆哮・必殺を撃つ。クールダウンは ai.cd を流用。
  manualAction(action, opts = {}) {
    const ai = this.ai, an = this.anim, st = this.stats;
    if (!this.manual || an.dead || this.done) return false;
    if (opts.x != null && opts.z != null) this.manualAimAt(opts.x, opts.z);
    const P = an.pos;
    if (action === 'special') {
      if (ai.cd.special > 0 || an.busy()) return false;
      let tx, tz;
      if (this.manualAim) { tx = this.manualAim.x; tz = this.manualAim.z; }
      else { const r = this.specialRange() * 0.6; tx = P.x + Math.sin(an.yaw) * r; tz = P.z + Math.cos(an.yaw) * r; }
      this.startSpecial(tx, tz);
      return true;
    }
    if (an.busy()) return false;
    if (action === 'swipe') {
      if (ai.cd.melee > 0) return false;
      if (an.arms.length || an.tents.length) an.play('swipe', { side: Math.random() < 0.5 ? -1 : 1 });
      else an.play('bite');
      ai.cd.melee = rand(1.2, 2.0);
      return true;
    }
    if (action === 'stomp') {
      if (ai.cd.melee > 0 || !an.legs.length) return false;
      an.play('stomp'); ai.cd.stomp = rand(6, 10); ai.cd.melee = 1.5;
      return true;
    }
    if (action === 'tail') {
      if (ai.cd.melee > 0 || ai.cd.tail > 0 || !an.tails.length) return false;
      an.play('tailswipe', { side: Math.random() < 0.5 ? -1 : 1 }); ai.cd.tail = rand(7, 11); ai.cd.melee = 1.6;
      return true;
    }
    if (action === 'bite') {
      if (ai.cd.melee > 0) return false;
      an.play('bite'); ai.cd.melee = rand(1.4, 2.2);
      return true;
    }
    if (action === 'roar') {
      if (ai.cd.roar > 0) return false;
      an.play('roar'); ai.cd.roar = rand(40, 70);
      return true;
    }
    return false;
  }
  // 操縦中の判断：目的地AIは使わず、入力方向へ進む。集落の陥落判定と
  // 背の噴火・至近の脅威への自動反撃（プレイヤーが何もしていない時だけ）は残す。
  thinkManual() {
    const ai = this.ai, an = this.anim;
    const P = an.pos;
    let T = this.nextStop();
    while (T && (T.fallen || T.skip)) { ai.stop++; T = this.nextStop(); }
    if (!T) { if (!this.done) this.done = { reason: 'razed', t: 6 }; return; }
    ai.town = T;
    const w = this.where();
    const NT = w.T || T;
    this.manualTown = NT;
    for (const TT of [NT, T]) {
      if (TT && !TT.fallen && TT.targets.length && TT.targets.every((o) => o.state >= 2)) {
        TT.fallen = true;
        if (!this.score.fallen.includes(TT.s.id)) this.score.fallen.push(TT.s.id);
      }
    }
    if (an.busy()) { an.setMove(an.wantYaw, 0); return; }
    const inp = this.manualIn;
    if (inp && inp.speed > 0.02) {
      an.setMove(inp.yaw, this.speed * clamp(inp.speed, 0, 1.25));
      an.look(_v.set(P.x + Math.sin(inp.yaw) * 80, groundH(P.x + Math.sin(inp.yaw) * 80, P.z + Math.cos(inp.yaw) * 80) + 8, P.z + Math.cos(inp.yaw) * 80), 0.7);
    } else {
      an.setMove(an.yaw, 0);
      an.look(null);
    }
    this.manualAssist(NT);
  }
  manualAssist(T) {
    const ai = this.ai, an = this.anim, st = this.stats;
    // 背の火山は受動能力として従来通り
    if (st.abil === 'eruption' && ai.cd.erupt <= 0) { ai.cd.erupt = rand(7, 11); this.erupt(); }
    // 自動反撃：脅威が懐にいて、プレイヤーが移動も攻撃もしていない時だけ
    if (ai.cd.melee > 0 || an.busy() || (this.manualIn && this.manualIn.speed > 0.02)) return;
    const threat = this.pickThreat();
    if (!threat) return;
    const P = an.pos;
    const d = Math.hypot(threat.x - P.x, threat.z - P.z);
    if (d < this.reach() * 0.9) this.meleeAt(threat.x, threat.z, Math.atan2(threat.x - P.x, threat.z - P.z));
  }
  setupTowns() {
    this.towns = [];
    for (const t of this.kingdom.towns) {
      const s = t.s;
      const T = { s, t, D: SETTLE_D[s.id] || 1, targets: [], total: 0, destroyed: 0, fallen: false, alarm: false, alarmT: 0, spawnI: 0, nodes: null, onRoute: STAGE_STOPS.includes(s.id), dead: 0 };
      const set = this.kb.sets.find((q) => q.town === t);
      for (const b of t.buildings) {
        const vol = b.w * b.d * b.h;
        b.hp = b.max = (vol / 30 + 18) * (b.style === 1 ? 2.4 : 1);
        b.value = 1 + vol / 900;
        b.flam = b.roof === 2 ? 1.5 : b.style === 0 ? 1 : b.style === 2 ? 0.75 : 0.35;
        b.fire = 0; b.burnt = 0; b.dmg = 0; b.state = 0; b.evac = 0; b.T = T; b.r = Math.hypot(b.w, b.d) * 0.5;
        b.setObj = set;
        T.targets.push(b); T.total += b.value;
        this.grid.add(b, b.x, b.z, b.r);
      }
      for (const lm of t.landmarkObjs || []) {
        if (lm.indestructible) continue;
        lm.T = T; lm.state = 0; lm.fire = 0; lm.burnt = lm.burnt || 0; lm.flam = lm.type === 'windmill' || lm.type === 'watermill' ? 1.2 : 0.3; lm.r = lm.r || 10;
        lm.hp = lm.max = lm.hp * (lm.type === 'castle' ? 1.6 : 1);
        lm.value = lm.value || 10;
        lm.onRuin = () => {};
        T.targets.push(lm); T.total += lm.value;
        this.grid.add(lm, lm.x, lm.z, lm.r);
      }
      const ws = this.kb.wallSets.find((q) => q.town === t);
      if (ws) {
        for (const w of t.walls) { w.T = T; w.ws = ws; w.x = w.cx; w.z = w.cz; w.r = w.len * 0.5; w.fire = 0; w.burnt = 0; w.flam = 0; T.targets.push(w); T.total += w.value; this.grid.add(w, w.cx, w.cz, w.r); }
        for (const tw of t.towers) { tw.T = T; tw.ws = ws; tw.fire = 0; tw.burnt = 0; tw.flam = 0.1; T.targets.push(tw); T.total += tw.value; this.grid.add(tw, tw.x, tw.z, tw.r); }
      }
      this.towns.push(T);
    }
    this.townById = Object.fromEntries(this.towns.map((T) => [T.s.id, T]));
    // 途中から現れる場合、手前の集落は素通り
    const k = clamp(this.opts.startStop | 0, 0, STAGE_STOPS.length - 1);
    for (let i = 0; i < k; i++) this.townById[STAGE_STOPS[i]].skip = true;
  }
  /* ===== 軍勢の配置 ===== */
  setupArmy() {
    const add = (type, x, z, o = {}) => this.addUnit(type, x, z, o);
    const around = (sx, sz, r0, r1) => { const a = Math.random() * TAU, r = rand(r0, r1); return [sx + Math.cos(a) * r, sz + Math.sin(a) * r]; };
    // 村の自警団
    for (const id of ['milt', 'buchen', 'linden', 'hasel']) {
      const T = this.townById[id]; if (!T) continue;
      const n = id === 'linden' ? 12 : 9;
      for (let i = 0; i < n; i++) { const [x, z] = around(T.s.x, T.s.z, 10, T.s.r * 0.6); add('militia', x, z, { group: id }); }
      for (let i = 0; i < 4; i++) { const [x, z] = around(T.s.x, T.s.z, 10, T.s.r * 0.5); add('archer', x, z, { group: id }); }
    }
    // ガルムント：城壁と街の守備隊
    const G = this.townById.garmund;
    if (G) {
      const t = G.t;
      const east = t.walls.filter((w) => w.cx > G.s.x + 60).sort((a, b) => Math.atan2(a.cz - G.s.z, a.cx - G.s.x) - Math.atan2(b.cz - G.s.z, b.cx - G.s.x));
      const every = (arr, n) => arr.filter((_, i) => i % Math.max(1, Math.round(arr.length / n)) === 0).slice(0, n);
      for (const w of every(east, 12)) for (let k = 0; k < 2; k++) { const u = (k + 0.5) / 2; add('archer', lerp(w.x0, w.x1, u), lerp(w.z0, w.z1, u), { group: 'garmund', y: w.h + w.y, on: w, fixed: 1 }); }
      for (const w of every(east, 4)) add('cannon', w.cx, w.cz, { group: 'garmund', y: w.h + w.y, on: w, fixed: 1 });
      for (const tw of every(t.towers.filter((tw) => tw.x > G.s.x), 4)) add('ballista', tw.x, tw.z, { group: 'garmund', y: tw.y + tw.h, on: tw, fixed: 1 });
      for (let i = 0; i < 16; i++) { const [x, z] = around(G.s.x, G.s.z, 20, 150); add('spear', x, z, { group: 'garmund' }); }
      for (let i = 0; i < 12; i++) { const [x, z] = around(G.s.x, G.s.z, 20, 150); add('sword', x, z, { group: 'garmund' }); }
      for (let i = 0; i < 10; i++) { const [x, z] = around(G.s.x, G.s.z, 20, 150); add('xbow', x, z, { group: 'garmund' }); }
      for (let i = 0; i < 8; i++) { const [x, z] = around(G.s.x - 120, G.s.z, 10, 60); add('knight', x, z, { group: 'garmund' }); }
      for (let i = 0; i < 3; i++) { const [x, z] = around(G.s.x, G.s.z, 10, 80); add('mage', x, z, { group: 'garmund' }); }
      for (let i = 0; i < 2; i++) add('trebuchet', G.s.x - 60 + i * 30, G.s.z + 40, { group: 'garmund', fixed: 1 });
    }
    // 王国軍：リンデンと王都の間の街道に布陣
    {
      const s0 = (ROUTE.stops.find((q) => q.id === 'linden').s + ROUTE.stops.find((q) => q.id === 'capital').s) / 2 + 900;
      const c = routePoint(s0), dl = Math.hypot(c.dx, c.dz) || 1;
      const fx = c.dx / dl, fz = c.dz / dl; // 進行方向（王都へ）
      const sx = -fz, sz = fx;
      const P = (fwd, side) => [c.x - fx * fwd + sx * side, c.z - fz * fwd + sz * side];
      this.fieldArmy = { x: c.x, z: c.z, fx: -fx, fz: -fz, s: s0 };
      for (let b = -1; b <= 1; b++) for (let i = 0; i < 16; i++) { const [x, z] = P(-20 + (i % 4) * 2.2 - 0, b * 70 + Math.floor(i / 4) * 2.2 - 3); add('spear', x, z, { group: 'field', post: [x, z] }); }
      for (let b = -1; b <= 1; b += 2) for (let i = 0; i < 10; i++) { const [x, z] = P(-10 + (i % 5) * 2, b * 35 + Math.floor(i / 5) * 2); add('sword', x, z, { group: 'field', post: [x, z] }); }
      for (let i = 0; i < 30; i++) { const [x, z] = P(60 + (i % 3) * 3, -45 + (i / 3 | 0) * 9); add('archer', x, z, { group: 'field', post: [x, z] }); }
      for (let i = 0; i < 20; i++) { const [x, z] = P(45 + (i % 2) * 3, -38 + (i / 2 | 0) * 8); add('xbow', x, z, { group: 'field', post: [x, z] }); }
      for (let b = -1; b <= 1; b += 2) for (let i = 0; i < 12; i++) { const [x, z] = P(30 + (i % 3) * 5, b * (150 + (i / 3 | 0) * 5)); add('knight', x, z, { group: 'field', post: [x, z] }); }
      for (let i = 0; i < 8; i++) { const [x, z] = P(-45, -105 + i * 30); add('cannon', x, z, { group: 'field', fixed: 1 }); }
      for (let i = 0; i < 3; i++) { const [x, z] = P(160, -60 + i * 60); add('trebuchet', x, z, { group: 'field', fixed: 1 }); }
      for (let i = 0; i < 6; i++) { const [x, z] = P(80, -50 + i * 20); add('mage', x, z, { group: 'field', post: [x, z] }); }
    }
    // 王都：城壁・城・大聖堂
    const C = this.townById.capital;
    if (C) {
      const t = C.t;
      const east = t.walls.filter((w) => w.cx > C.s.x + 300).sort((a, b) => Math.atan2(a.cz - C.s.z, a.cx - C.s.x) - Math.atan2(b.cz - C.s.z, b.cx - C.s.x));
      const every = (arr, n) => arr.filter((_, i) => i % Math.max(1, Math.round(arr.length / n)) === 0).slice(0, n);
      for (const w of every(east, 20)) for (let k = 0; k < 2; k++) { const u = (k + 0.5) / 2; add('archer', lerp(w.x0, w.x1, u), lerp(w.z0, w.z1, u), { group: 'capital', y: w.h + w.y, on: w, fixed: 1 }); }
      for (const w of every(east, 8)) add('cannon', w.cx, w.cz, { group: 'capital', y: w.h + w.y, on: w, fixed: 1 });
      for (const tw of every(t.towers.filter((tw) => tw.x > C.s.x + 250), 6)) add('ballista', tw.x, tw.z, { group: 'capital', y: tw.y + tw.h, on: tw, fixed: 1 });
      for (let i = 0; i < 20; i++) { const [x, z] = around(C.s.x + 300, C.s.z, 20, 300); add('spear', x, z, { group: 'capital' }); }
      for (let i = 0; i < 20; i++) { const [x, z] = around(C.s.x + 200, C.s.z, 20, 300); add('sword', x, z, { group: 'capital' }); }
      for (let i = 0; i < 16; i++) { const [x, z] = around(C.s.x + 250, C.s.z, 20, 300); add('xbow', x, z, { group: 'capital' }); }
      for (let i = 0; i < 16; i++) { const [x, z] = around(C.s.castle.x + 120, C.s.castle.z + 60, 10, 50); add('knight', x, z, { group: 'capital' }); }
      for (let i = 0; i < 10; i++) { const [x, z] = around(C.s.cathedral.x, C.s.cathedral.z, 40, 120); add('mage', x, z, { group: 'capital' }); }
      for (let i = 0; i < 3; i++) add('trebuchet', C.s.x + 80 + i * 40, C.s.z - 200, { group: 'capital', fixed: 1 });
      if (t.bombard) add('bombard', t.bombard.x - 30, t.bombard.z, { group: 'capital', fixed: 1 });
      // 大聖堂の結界
      this.barrier = { x: C.s.cathedral.x, z: C.s.cathedral.z, r: 230, hp: 900 * this.dmgMul * 1.5, max: 900 * this.dmgMul * 1.5, up: true, mesh: null, hit: 0 };
      this.makeBarrier();
    }
    this.heroSpawned = false;
  }
  addUnit(type, x, z, o = {}) {
    const U = UT[type];
    const u = { type, U, x, z, y: o.y != null ? o.y : groundH(x, z), yaw: Math.random() * TAU, hp: U.hp * (U.machine ? this.dmgMul : 1), max: U.hp, cd: rand(0, U.cd), state: 'idle', group: o.group, fixed: !!o.fixed, on: o.on || null, post: o.post || null, alive: true, active: false, ph: Math.random() * 10, pose: 0, anim: 0, recoil: 0, aimP: 0.2, morale: 1, rout: 0, t: 0 };
    if (!U.machine) { const c = (CLOTH[U.cloth] || CLOTH.soldier)(); u.colA = c[0]; u.colB = c[1]; u.scale = rand(0.95, 1.08); }
    else u.crew = Array.from({ length: U.crew }, (_, k) => ({ a: (k / U.crew) * TAU + 0.5, r: type === 'trebuchet' ? 4.5 : type === 'bombard' ? 4 : 2, col: CLOTH.soldier() }));
    this.units.push(u);
    return u;
  }
  makeBarrier() {
    const b = this.barrier;
    const g = new THREE.SphereGeometry(b.r, 48, 24, 0, TAU, 0, Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uHit: { value: 0 }, uA: { value: 1 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uT; uniform float uHit; uniform float uA;
        void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          vec2 h = vec2(atan(vP.z, vP.x)*12.0, vP.y*0.12);
          vec2 g = abs(fract(h + vec2(0.5*floor(h.y), 0.0)) - 0.5);
          float hex = smoothstep(0.42, 0.5, max(g.x, g.y));
          float wave = 0.5 + 0.5*sin(vP.y*0.08 - uT*2.0);
          vec3 c = vec3(1.0, 0.86, 0.5) * (pow(f, 2.5)*0.9 + hex*0.25*wave + uHit*0.6);
          gl_FragColor = vec4(c*uA, (pow(f, 2.0)*0.5 + hex*0.12 + uHit*0.3)*uA); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(b.x, groundH(b.x, b.z) - 5, b.z);
    mesh.renderOrder = 14;
    this.engine.scene.add(mesh);
    b.mesh = mesh;
  }
  /* ===== 字幕・音 ===== */
  caption(text, key, wait = 8) {
    if (key) { if (this.capT[key] && this.time - this.capT[key] < wait) return; this.capT[key] = this.time; }
    if (this.opts.onCaption) this.opts.onCaption(text);
  }
  snd(name, x, z, o = {}, gap = 0.12) {
    if (!this.sound) return;
    const cam = this.engine.camera.position;
    const d = Math.hypot(cam.x - x, cam.z - z, cam.y - groundH(x, z));
    if (d > (o.far || 2200)) return;
    this.sndT = this.sndT || {};
    if (this.sndT[name] && this.time - this.sndT[name] < gap) return;
    this.sndT[name] = this.time;
    const k = clamp(1.3 - d / (o.far || 2200), 0.15, 1);
    try { this.sound.play(name, Object.assign({}, o, { size: (o.size || 40) * k })); } catch (e) { /* 音は鳴らなくてもよい */ }
  }
  addShake(x, z, k) {
    const cam = this.engine.camera.position;
    const d = Math.hypot(cam.x - x, cam.z - z);
    this.shake = Math.max(this.shake, k * clamp(1.2 - d / 900, 0, 1));
  }
  /* ===== 毎フレーム ===== */
  update(dt) {
    if (this.done && this.done.t > 0) { this.done.t -= dt; }
    this.time += dt;
    this.clock = (this.clock + dt * 6 / 3600) % 24;
    const B = this.B;
    B.invuln = Math.max(0, B.invuln - dt);
    B.hurtT = Math.max(0, B.hurtT - dt);
    if (!this.anim.dead && B.hp < B.max && this.stats.reg > 0) B.hp = Math.min(B.max, B.hp + this.stats.reg * dt);
    this.beast.uni.uFlash.value = Math.max(0, this.beast.uni.uFlash.value - dt * 5);
    this.fx.proj.step(dt);
    this.thinkBeast(dt);
    this.anim.update(dt);
    this.updateCast(dt);
    this.bodyCrush(dt);
    this.updateFires(dt);
    this.updateTowns(dt);
    this.updateAgents(dt);
    this.updateUnits(dt);
    this.updateBarrier(dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
  /* ===== 巨獣の判断 ===== */
  beastPos() { return this.anim.pos; }
  nextStop() { const id = STAGE_STOPS[this.ai.stop]; return id ? this.townById[id] : null; }
  thinkBeast(dt) {
    const ai = this.ai, an = this.anim, st = this.stats;
    for (const k in ai.cd) ai.cd[k] -= dt;
    if (an.dead) {
      if (!this.done) this.done = { reason: 'repelled', t: 7 };
      return;
    }
    ai.think -= dt;
    if (ai.think > 0) return;
    ai.think = 0.25;
    if (this.manual) { this.thinkManual(); return; }
    const P = an.pos;
    // 次の目的地
    let T = this.nextStop();
    while (T && (T.fallen || T.skip)) { ai.stop++; T = this.nextStop(); }
    if (!T) { if (!this.done) this.done = { reason: 'razed', t: 6 }; return; }
    const dT = Math.hypot(P.x - T.s.x, P.z - T.s.z) - (T.s.wall ? Math.max(...T.s.wall) : T.s.r);
    // 脅威（直近で痛手を与えた相手）
    const threat = this.pickThreat();
    if (threat && ai.mode !== 'fight' && Math.random() < 0.5) { ai.mode = 'fight'; ai.threat = threat; ai.fightT = rand(10, 18); }
    if (ai.mode === 'fight') {
      ai.fightT -= 0.25;
      if (!ai.threat || !ai.threat.alive || ai.fightT <= 0) { ai.mode = 'march'; ai.threat = null; }
    }
    if (ai.mode !== 'fight') ai.mode = dT < 260 || (ai.mode === 'rampage' && ai.town === T && dT < 900) ? 'rampage' : 'march';
    ai.town = T;
    // 移動
    if (an.busy()) { an.setMove(an.wantYaw, 0); return; }
    if (ai.mode === 'march') {
      ai.target = null;
      const pr = routeProject(P.x, P.z);
      const stopS = T ? ROUTE.stops.find((q) => q.id === T.s.id).s : ROUTE.length;
      let look = routePoint(Math.min(pr.s + 90, stopS));
      // 街道が集落の脇を通る所では、集落へ向かう
      if (pr.s > stopS - 120) look = { x: T.s.x, z: T.s.z };
      const yaw = Math.atan2(look.x - P.x, look.z - P.z);
      an.setMove(yaw, this.speed);
      an.look(null);
      this.tryAttacks(T, false);
      return;
    }
    if (ai.mode === 'fight') {
      const u = ai.threat;
      const d = Math.hypot(u.x - P.x, u.z - P.z);
      const yaw = Math.atan2(u.x - P.x, u.z - P.z);
      an.look(_v.set(u.x, u.y + 2, u.z), 1);
      const reach = this.reach();
      if (d > reach * 0.8) an.setMove(yaw, this.speed * 1.15);
      else { an.setMove(yaw, 0); this.meleeAt(u.x, u.z, yaw); }
      this.tryAttacks(T, true);
      return;
    }
    // 蹂躙：狙う建物を選ぶ
    if (!ai.target || ai.target.state >= 2 || ai.retarget <= 0) { ai.target = this.pickTarget(T); ai.retarget = rand(18, 30); }
    ai.retarget -= 0.25;
    // 動けずにいたら狙いを変える
    ai.stuckT = (ai.stuckT || 0) + 0.25;
    if (ai.stuckT > 20) { const moved = ai.stuckP ? Math.hypot(P.x - ai.stuckP.x, P.z - ai.stuckP.z) : 99; ai.stuckP = { x: P.x, z: P.z }; ai.stuckT = 0; if (moved < 15 && ai.target && ai.target.state < 2) { ai.target.skip = this.time + 60; ai.target = this.pickTarget(T); ai.retarget = rand(18, 30); } }
    const tg = ai.target;
    if (!tg) {
      // 狙える物がない：本当に全て壊れていれば次へ
      if (T.targets.every((o) => o.state >= 2)) { T.fallen = true; if (!this.score.fallen.includes(T.s.id)) this.score.fallen.push(T.s.id); }
      return;
    }
    const d = Math.hypot(tg.x - P.x, tg.z - P.z) - (tg.r || 5);
    const yaw = Math.atan2(tg.x - P.x, tg.z - P.z);
    an.look(_v.set(tg.x, groundH(tg.x, tg.z) + 8, tg.z), 0.9);
    const reach = this.reach();
    // 結界に阻まれる
    if (this.barrier && this.barrier.up) {
      const bd = Math.hypot(P.x - this.barrier.x, P.z - this.barrier.z);
      if (bd < this.barrier.r + 30 && Math.hypot(tg.x - this.barrier.x, tg.z - this.barrier.z) < this.barrier.r) {
        an.setMove(Math.atan2(this.barrier.x - P.x, this.barrier.z - P.z), 0);
        if (!an.busy()) this.meleeAt(P.x + Math.sin(yaw) * reach, P.z + Math.cos(yaw) * reach, yaw);
        this.tryAttacks(T, true);
        return;
      }
    }
    if (d > reach * 0.75) an.setMove(yaw, this.speed * (d > 200 ? 1 : 0.7));
    else { an.setMove(yaw, 0); this.meleeAt(tg.x, tg.z, yaw); }
    this.tryAttacks(T, true);
  }
  reach() { return (this.stats.reach || 20) * 0.8 + this.anim.legLen * 0.4; }
  pickThreat() {
    const now = this.time;
    let best = null, bs = 0;
    for (const u of this.units) {
      if (!u.alive || !u.active || !u.dealt || now - u.lastHit > 8) continue;
      const d = Math.hypot(u.x - this.anim.pos.x, u.z - this.anim.pos.z);
      if (d > 700) continue;
      const s = u.dealt / (d + 80) * (u.U.boss ? 3 : 1);
      if (s > bs) { bs = s; best = u; }
    }
    return bs > 0.06 ? best : null;
  }
  pickTarget(T) {
    const P = this.anim.pos;
    let best = null, bs = -1;
    for (const o of T.targets) {
      if (o.state >= 2 || (o.skip && o.skip > this.time)) continue;
      if (this.barrier && this.barrier.up && o.T.s.id === 'capital' && Math.hypot(o.x - this.barrier.x, o.z - this.barrier.z) < this.barrier.r && Math.random() < 0.6) continue;
      const d = Math.hypot(o.x - P.x, o.z - P.z);
      let s = (o.value + (o.kind === 'landmark' ? 25 : 0)) / (d + 60) * (0.6 + Math.random() * 0.8);
      if (o.fire > 0.3) s *= 0.4;
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }
  // 近くの攻撃（腕・噛みつき・踏みつけ・尾）
  meleeAt(x, z, yaw) {
    const ai = this.ai, an = this.anim, st = this.stats;
    if (an.busy() || ai.cd.melee > 0) return;
    const P = an.pos;
    const front = this.countTargets(P.x + Math.sin(an.yaw) * this.reach() * 0.7, P.z + Math.cos(an.yaw) * this.reach() * 0.7, this.reach() * 0.8);
    const behind = this.countTargets(P.x - Math.sin(an.yaw) * (st.tailLen || 20) * 0.8, P.z - Math.cos(an.yaw) * (st.tailLen || 20) * 0.8, (st.tailLen || 20) * 0.7);
    const r = Math.random();
    if (behind > front + 2 && ai.cd.tail <= 0 && an.tails.length) { an.play('tailswipe', { side: Math.random() < 0.5 ? -1 : 1 }); ai.cd.tail = rand(7, 11); ai.cd.melee = 1.6; return; }
    if (an.legs.length && ai.cd.stomp <= 0 && r < 0.22) { an.play('stomp'); ai.cd.stomp = rand(6, 10); ai.cd.melee = 1.5; return; }
    if (r < 0.62 && (an.arms.length || an.tents.length)) { an.play('swipe', { side: Math.random() < 0.5 ? -1 : 1 }); ai.cd.melee = rand(1.2, 2.0); return; }
    an.play('bite'); ai.cd.melee = rand(1.4, 2.2);
  }
  countTargets(x, z, r) {
    let n = 0;
    for (const o of this.grid.query(x, z, r, this.tmp)) if (o.state < 2) n++;
    for (const u of this.units) if (u.alive && u.active && Math.abs(u.x - x) < r && Math.abs(u.z - z) < r) n += 0.5;
    return n;
  }
  tryAttacks(T, inTown) {
    const ai = this.ai, an = this.anim, st = this.stats;
    if (an.busy()) return;
    const P = an.pos;
    // 咆哮
    if (ai.cd.roar <= 0 && (this.B.hurtT > 0 || Math.random() < 0.06)) { an.play('roar'); ai.cd.roar = rand(40, 70); return; }
    // 飛翔（翼）
    if (st.abil === 'flight' && ai.cd.fly <= 0 && inTown) {
      const tg = this.pickTarget(T);
      const fd = tg ? Math.hypot(tg.x - P.x, tg.z - P.z) : 0;
      if (tg && fd > 120 && fd < 420) { an.play('fly', { to: new THREE.Vector3(tg.x, 0, tg.z), dur: clamp(Math.hypot(tg.x - P.x, tg.z - P.z) / 40, 5, 9) }); ai.cd.fly = rand(35, 55); this.snd('wing', P.x, P.z); return; }
      ai.cd.fly = 8;
    }
    // 噴火（背の火山）
    if (st.abil === 'eruption' && ai.cd.erupt <= 0) { ai.cd.erupt = rand(7, 11); this.erupt(); }
    // 必殺
    if (ai.cd.special <= 0) {
      const range = this.specialRange();
      const yaw = an.yaw;
      let tx = P.x + Math.sin(yaw) * range * 0.6, tz = P.z + Math.cos(yaw) * range * 0.6;
      let n = this.countTargets(tx, tz, range * 0.5);
      if (ai.threat && ai.mode === 'fight') { tx = ai.threat.x; tz = ai.threat.z; n += 6; }
      if (n >= 4 || (this.B.hurtT > 0 && n >= 1)) { this.startSpecial(tx, tz); return; }
    }
  }
  specialRange() { return { stream: 170, beam: 420, glob: 260, bolt: 320, roar: 140, charge: 260 }[this.stats.form] * Math.sqrt(this.anim.sF); }
  startSpecial(tx, tz) {
    const ai = this.ai, an = this.anim, st = this.stats;
    const form = st.form;
    const cdBase = 22 * (st.abil === 'fin' ? 0.85 : 1) * (st.abil === 'crystal' ? 0.9 : 1);
    ai.cd.special = rand(cdBase * 0.85, cdBase * 1.2);
    const P = an.pos;
    ai.spec = { form, tx, tz, t: 0, done: {} };
    an.look(_v.set(tx, groundH(tx, tz), tz), 1);
    if (form === 'stream') { an.play('cast', { dur: 4.2, charge: 0.8 }); this.snd('breath', P.x, P.z, { elem: st.elem, dur: 3.2 }, 1); }
    else if (form === 'beam') { an.play('cast', { dur: 4.4, charge: 1.6 }); this.snd('charge', P.x, P.z, {}, 1); }
    else if (form === 'glob') an.play('cast', { dur: 3.4, charge: 0.6 });
    else if (form === 'bolt') an.play('cast', { dur: 3.6, charge: 0.9, up: true });
    else if (form === 'roar') { an.play('roar'); ai.spec.roarSpecial = true; }
    else if (form === 'charge') { an.play('charge', { dur: 4.5, speed: 3.2 }); an.setMove(Math.atan2(tx - P.x, tz - P.z), this.speed); }
    this.caption(`${this.opts.beastName || '巨獣'}の${st.special}`, 'special', 4);
  }
  /* ===== 必殺の処理（毎フレーム） ===== */
  updateCast(dt) {
    const an = this.anim, act = an.act, sp = this.ai.spec, st = this.stats;
    if (!sp) { this.fx.showBeam(null); return; }
    sp.t += dt;
    const elemCol = { fire: [1, 0.45, 0.12], poison: [0.5, 0.9, 0.2], thunder: [0.45, 0.75, 1], curse: [0.62, 0.3, 1], shock: [0.95, 0.9, 0.8] }[st.elem];
    const em = act && act.name === 'cast' && act.emitting;
    const M = an.mouthW, D = an.headDirW;
    const pow = st.pow * (this.elemMul[st.elem] || 1);
    if (sp.form === 'stream') {
      if (em) {
        // 吐息：口から円錐状に
        sp.acc = (sp.acc || 0) + dt * 110;
        const n = Math.floor(sp.acc); sp.acc -= n;
        const kind = st.elem === 'fire' ? 'fire' : st.elem === 'poison' ? 'poison' : st.elem === 'curse' ? 'curse' : st.elem === 'thunder' ? 'magic' : 'dust';
        for (let i = 0; i < n; i++) {
          const sp2 = 0.11;
          const dx = D.x + rand(-sp2, sp2), dy = D.y + rand(-sp2, sp2) - 0.04, dz = D.z + rand(-sp2, sp2);
          const v = rand(65, 90), o = rand(0, 6);
          this.fx.puff(kind, M.x + dx * o, M.y + dy * o, M.z + dz * o, dx * v, dy * v, dz * v, rand(2.2, 3.8) * an.sF, rand(1.0, 1.5), st.elem === 'fire' ? null : elemCol);
          if (i % 4 === 0) this.fx.puff(st.elem === 'fire' || st.elem === 'curse' ? 'bsmoke' : 'smoke', M.x + dx * 40, M.y + dy * 40, M.z + dz * 40, dx * v * 0.35, dy * v * 0.35 + 3, dz * v * 0.35, rand(5, 8), rand(5, 8));
        }
        if (Math.random() < dt * 4) this.fx.puff('glow', M.x, M.y, M.z, 0, 0, 0, 2.5 * an.sF, 0.25, elemCol);
        this.fx.light(M.x + D.x * 40, M.y, M.z + D.z * 40, new THREE.Color(...elemCol).getHex(), 2500, 0.3);
        // 地面に届いた所の被害
        sp.dmgT = (sp.dmgT || 0) - dt;
        if (sp.dmgT <= 0) {
          sp.dmgT = 0.2;
          const L = 160 * Math.sqrt(an.sF);
          for (let k = 1; k <= 5; k++) {
            const u = k / 5;
            const x = M.x + D.x * L * u, z = M.z + D.z * L * u;
            const r = 8 + 22 * u;
            this.areaDamage(x, z, r, pow * 0.35, { fire: st.elem === 'fire' ? 0.9 : st.elem === 'curse' ? 0.5 : 0.15, poison: st.elem === 'poison', kind: 'breath', elem: st.elem });
            if (k >= 3 && Math.random() < 0.3) this.fx.decals.add(st.elem === 'poison' ? 2 : 1, x + rand(-8, 8), z + rand(-8, 8), r * 0.7, Math.random() * 6, 600, st.elem === 'fire' ? 1 : 0);
          }
        }
      }
      if (act == null || act.name !== 'cast') this.ai.spec = null;
    } else if (sp.form === 'beam') {
      if (an.act && an.act.name === 'cast' && an.act.t < an.act.data.charge) {
        if (Math.random() < dt * 30) this.fx.puff('magic', M.x + rand(-6, 6), M.y + rand(-6, 6), M.z + rand(-6, 6), (M.x - (M.x + rand(-6, 6))) * 2, 0, 0, 2, 0.4, elemCol);
      }
      if (em) {
        // 光線：狙った地点を横に薙ぐ
        const t = an.act.t - an.act.data.charge, dur = an.act.dur - 0.35 - an.act.data.charge;
        const u = clamp(t / dur, 0, 1);
        const yaw0 = Math.atan2(sp.tx - an.pos.x, sp.tz - an.pos.z);
        const dist = Math.hypot(sp.tx - an.pos.x, sp.tz - an.pos.z) + 40;
        const a = yaw0 + (u - 0.5) * 0.9;
        const hx = an.pos.x + Math.sin(a) * dist, hz = an.pos.z + Math.cos(a) * dist;
        const hy = groundH(hx, hz);
        this.fx.showBeam(M, _v2.set(hx, hy, hz), 9 * an.sF, new THREE.Color(...elemCol), 1);
        this.anim.look(_v2, 1);
        sp.dmgT = (sp.dmgT || 0) - dt;
        if (sp.dmgT <= 0) {
          sp.dmgT = 0.1;
          this.fx.explode(hx, hy, hz, 9, { lightCol: new THREE.Color(...elemCol).getHex(), decal: 1 });
          // 光線の通り道もまとめて焼く
          for (let k = 1; k <= 4; k++) { const f = k / 4; this.areaDamage(lerp(M.x, hx, f), lerp(M.z, hz, f), 7, pow * 0.12, { fire: 0.5, kind: 'beam', elem: st.elem, above: lerp(M.y, hy, f) }); }
          this.areaDamage(hx, hz, 16, pow * 0.55, { fire: 0.8, kind: 'beam', elem: st.elem });
          this.addShake(hx, hz, 0.25);
          this.snd('boom', hx, hz, { size: 30 }, 0.25);
        }
      } else this.fx.showBeam(null);
      if (act == null || act.name !== 'cast') { this.ai.spec = null; this.fx.showBeam(null); }
    } else if (sp.form === 'glob') {
      if (em) {
        sp.gT = (sp.gT || 0) - dt;
        if (sp.gT <= 0) {
          sp.gT = 0.45;
          const tx = sp.tx + rand(-60, 60), tz = sp.tz + rand(-60, 60), ty = groundH(tx, tz);
          const T = clamp(Math.hypot(tx - M.x, tz - M.z) / 70, 1.2, 3.5);
          this.fx.proj.launch(st.elem === 'fire' ? 'lava' : 'glob', M, new THREE.Vector3(tx, ty, tz), T, (p) => {
            this.fx.explode(p.x, p.y, p.z, 14, { smoke: st.elem === 'poison' ? 'poison' : 'smoke', fire: st.elem === 'fire', decal: st.elem === 'poison' ? 2 : 1, lightCol: new THREE.Color(...elemCol).getHex() });
            if (st.elem === 'poison') this.fx.burst('poison', p.x, p.y + 2, p.z, 16, 8, 9, { up: 0.1, r: 12 });
            this.areaDamage(p.x, p.z, 24, pow * 1.4, { fire: st.elem === 'fire' ? 0.9 : 0.2, poison: st.elem === 'poison', kind: 'glob', elem: st.elem });
            this.addShake(p.x, p.z, 0.3); this.snd('splash', p.x, p.z);
          }, { col: elemCol, scale: an.sF });
          this.snd('splash', M.x, M.z, {}, 0.3);
        }
      }
      if (act == null || act.name !== 'cast') this.ai.spec = null;
    } else if (sp.form === 'bolt') {
      if (em) {
        sp.bT = (sp.bT || 0) - dt;
        if (sp.bT <= 0) {
          sp.bT = 0.4;
          let tx = sp.tx + rand(-90, 90), tz = sp.tz + rand(-90, 90);
          const cand = this.grid.query(tx, tz, 60, this.tmp).filter((o) => o.state < 2);
          if (cand.length) { const o = pick(cand); tx = o.x; tz = o.z; }
          const ty = groundH(tx, tz);
          this.fx.lightning(tx, ty, tz, new THREE.Color(...elemCol).getHex());
          this.fx.explode(tx, ty, tz, 10, { lightCol: 0xa0c8ff, decal: 1 });
          this.areaDamage(tx, tz, 20, pow * 1.3, { fire: 0.6, kind: 'bolt', elem: st.elem });
          this.addShake(tx, tz, 0.35); this.snd('thunder', tx, tz, {}, 0.2);
        }
      }
      if (act == null || act.name !== 'cast') this.ai.spec = null;
    } else if (sp.form === 'roar') {
      if (!sp.done.wave && an.act && an.act.t > 0.65) {
        sp.done.wave = true;
        const P = an.pos;
        this.fx.ring(P.x, P.z, 160, 1.2, 0xffe8c0);
        this.fx.burst('dust', P.x, groundH(P.x, P.z) + 2, P.z, 40, 40, 10, { up: 0.05, spread: 0.2, r: 30 });
        for (let k = 0; k < 3; k++) this.areaDamage(P.x, P.z, 50 + k * 45, pow * (1.6 - k * 0.45), { kind: 'roar', elem: st.elem, fire: st.elem === 'fire' ? 0.4 : 0 });
        this.addShake(P.x, P.z, 1);
      }
      if (act == null || act.name !== 'roar') this.ai.spec = null;
    } else if (sp.form === 'charge') {
      if (act && act.name === 'charge' && act.active) {
        sp.cT = (sp.cT || 0) - dt;
        if (sp.cT <= 0) { sp.cT = 0.15; const P = an.pos; this.areaDamage(P.x + Math.sin(an.yaw) * 14, P.z + Math.cos(an.yaw) * 14, 22 * an.sF, st.atk * 2.2, { kind: 'charge' }); this.addShake(P.x, P.z, 0.25); }
      }
      if (act == null || act.name !== 'charge') this.ai.spec = null;
    }
  }
  erupt() {
    const an = this.anim;
    const P = an.pos;
    const top = new THREE.Vector3(P.x, P.y + an.b.height * 0.85, P.z);
    this.fx.burst('fire', top.x, top.y, top.z, 12, 18, 4, { up: 0.8 });
    this.fx.burst('bsmoke', top.x, top.y, top.z, 6, 6, 8, { up: 0.9 });
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * TAU, r = rand(50, 150);
      const tx = P.x + Math.cos(a) * r, tz = P.z + Math.sin(a) * r, ty = groundH(tx, tz);
      this.fx.proj.launch('lava', top, new THREE.Vector3(tx, ty, tz), rand(2, 3), (p) => {
        this.fx.explode(p.x, p.y, p.z, 9, { decal: 1 });
        this.areaDamage(p.x, p.z, 14, this.stats.pow * 0.7, { fire: 1, kind: 'lava' });
      }, { col: [1, 0.4, 0.1] });
    }
    this.snd('boom', P.x, P.z, { size: 25 }, 0.5);
  }
  /* ===== 巨獣の体が触れた所 ===== */
  onBeastEvent(type, d) {
    const st = this.stats, an = this.anim;
    if (type === 'step' || type === 'stomp' || type === 'land') {
      const r = type === 'step' ? d.r : d.r;
      const force = d.force || 1;
      const y = groundH(d.x, d.z);
      this.crush(d.x, d.z, r * (type === 'step' ? 1.1 : 1), st.atk * (type === 'step' ? 2.5 : 4) * force, type);
      // 土煙・地響き
      const big = force >= 2;
      this.fx.burst('dust', d.x, y + 0.5, d.z, big ? 30 : 10, big ? 30 : 12 * Math.sqrt(an.sF), big ? 9 : 5 * an.sF, { up: 0.05, spread: 0.25, r: r * 0.7 });
      if (big) { this.fx.ring(d.x, d.z, r * 4, 0.9, 0xd8c8a8); this.fx.burst('dust', d.x, y + 2, d.z, 14, 8, 14, { up: 0.5, r: r }); }
      this.fx.decals.add(0, d.x, d.z, r * (big ? 1.6 : 1.05), an.yaw + rand(-0.3, 0.3), 1200);
      for (let i = 0; i < (big ? 8 : 3); i++) this.fx.debris.spawn(d.x + rand(-r, r), y + 1, d.z + rand(-r, r), rand(-8, 8), rand(4, 12), rand(-8, 8), rand(0.3, 0.8), [0.3, 0.26, 0.2]);
      this.addShake(d.x, d.z, (big ? 0.9 : 0.35) * Math.sqrt(an.sF));
      this.snd('step', d.x, d.z, { size: (big ? 90 : 55) * an.sF }, 0.15);
      if (this.flora) this.flora.knock(d.x, d.z, r * 1.6, Math.sin(an.yaw), Math.cos(an.yaw));
    } else if (type === 'hit') {
      const y = groundH(d.x, d.z);
      const reachY = d.y - y;
      const r = d.r;
      const dmg = st.atk * (d.kind === 'tail' ? 3 : d.kind === 'bite' ? 3.5 : 4);
      this.areaDamage(d.x, d.z, r, dmg, { kind: d.kind, above: d.y, knock: 1 });
      this.fx.burst('dust', d.x, y + 1, d.z, 10, 14, 6, { up: 0.3, r: r * 0.5 });
      this.addShake(d.x, d.z, 0.3);
      this.snd(d.kind === 'bite' ? 'smash' : 'slash', d.x, d.z, {}, 0.2);
      if (st.abil === 'thorns') { /* 反撃は被弾時 */ }
      if (this.flora) this.flora.knock(d.x, d.z, r, Math.sin(an.yaw), Math.cos(an.yaw));
    } else if (type === 'roar') {
      this.snd('roar', an.pos.x, an.pos.z, { big: an.sF > 1.1 }, 2);
      this.addShake(an.pos.x, an.pos.z, 0.5);
      // 人々は怯える
      for (const u of this.units) if (u.alive && u.active && !u.U.machine && !u.U.boss && Math.hypot(u.x - an.pos.x, u.z - an.pos.z) < 350 && Math.random() < 0.35) { u.rout = rand(4, 9); }
      for (const T of this.towns) if (!T.alarm && Math.hypot(T.s.x - an.pos.x, T.s.z - an.pos.z) < 2500) this.raiseAlarm(T);
    } else if (type === 'fall') {
      const P = an.pos;
      const s = d.side;
      const x = P.x + Math.cos(an.yaw) * s * an.halfW * 1.5, z = P.z - Math.sin(an.yaw) * s * an.halfW * 1.5;
      this.crush(x, z, an.b.length * 0.35, 9999, 'fall');
      this.fx.burst('dust', x, groundH(x, z) + 2, z, 60, 30, 16, { up: 0.1, r: an.b.length * 0.3 });
      this.fx.ring(x, z, an.b.length, 1.4, 0xd8c8a8);
      this.addShake(x, z, 1.4);
      this.snd('collapse', x, z, { size: 160 }, 1);
    } else if (type === 'hopOff') {
      this.fx.burst('dust', d.x, groundH(d.x, d.z) + 1, d.z, 16, 18, 8, { up: 0.1, r: 8 });
    }
  }
  // 足もと：家は踏み潰され、人は助からない
  crush(x, z, r, dmg, kind) {
    for (const o of this.grid.query(x, z, r + 12, this.tmp)) {
      if (o.state >= 2) continue;
      const d = Math.hypot(o.x - x, o.z - z) - (o.r || 4) * 0.7;
      if (d > r) continue;
      if (o.kind === 'house') this.hurtObj(o, o.max * 3, Math.atan2(o.x - x, o.z - z), kind);
      else this.hurtObj(o, dmg, Math.atan2(o.x - x, o.z - z), kind);
    }
    this.killPeople(x, z, r * 1.05, kind, false);
    this.hurtUnits(x, z, r * 1.1, dmg * 3, kind);
  }
  // 範囲攻撃
  areaDamage(x, z, r, dmg, o = {}) {
    for (const ob of this.grid.query(x, z, r + 15, this.tmp)) {
      if (ob.state >= 2) continue;
      const d = Math.hypot(ob.x - x, ob.z - z) - (ob.r || 4) * 0.6;
      if (d > r) continue;
      if (o.above != null && ob.kind === 'house' && o.above - groundH(ob.x, ob.z) > ob.h + ob.roofH + 25 && o.kind !== 'beam') continue;
      const k = clamp(1.2 - d / r, 0.3, 1);
      this.hurtObj(ob, dmg * k * (o.elem === 'shock' ? 1.3 : 1), Math.atan2(ob.x - x, ob.z - z), o.kind);
      if (o.fire && ob.flam > 0) this.ignite(ob, o.fire * k);
    }
    this.killPeople(x, z, r, o.kind, true, o.poison);
    this.hurtUnits(x, z, r, dmg * 2, o.kind);
    if (this.barrier && this.barrier.up && Math.hypot(x - this.barrier.x, z - this.barrier.z) < this.barrier.r + r) this.hurtBarrier(dmg);
    if (this.flora && o.fire) this.flora.knock(x, z, r, 0, 0, Math.min(1, o.fire));
  }
  hurtBarrier(dmg) {
    const b = this.barrier;
    b.hp -= dmg * (this.stats.elem === 'curse' ? 0.5 : 1);
    b.hit = 1;
    this.snd('shield', b.x, b.z, {}, 0.2);
    if (b.hp <= 0 && b.up) {
      b.up = false;
      this.caption('大聖堂の結界が砕け散った');
      this.snd('shatter', b.x, b.z, {}, 1);
      this.fx.burst('magic', b.x, groundH(b.x, b.z) + 60, b.z, 60, 60, 6, { up: 0.3, r: b.r * 0.6, col: [1, 0.9, 0.6] });
      this.spawnHero();
    }
  }
  updateBarrier(dt) {
    const b = this.barrier; if (!b || !b.mesh) return;
    const m = b.mesh.material.uniforms;
    m.uT.value += dt; b.hit = Math.max(0, b.hit - dt * 3); m.uHit.value = b.hit;
    if (!b.up) { m.uA.value = Math.max(0, m.uA.value - dt * 0.8); if (m.uA.value <= 0 && b.mesh.visible) b.mesh.visible = false; }
    else m.uA.value = 0.55 + 0.45 * (b.hp / b.max);
    // 結界は巨獣を押し返す
    if (b.up) {
      const P = this.anim.pos;
      const d = Math.hypot(P.x - b.x, P.z - b.z);
      if (d < b.r + this.anim.halfW) { const k = (b.r + this.anim.halfW - d); P.x += (P.x - b.x) / d * k; P.z += (P.z - b.z) / d * k; b.hit = Math.max(b.hit, 0.5); }
    }
  }
  /* ===== 建物の被害 ===== */
  // 倒壊寸前の建物：小さな土煙と軋み音を間欠で出す（発生は確率＋クールダウンで抑制）
  crackle(o) {
    if (o.hp <= 0 || o.hp / o.max > 0.38) return;
    if (o._crackT != null && this.time - o._crackT < 2.8) return;
    if (Math.random() < 0.45) return;
    o._crackT = this.time;
    const y = groundH(o.x, o.z);
    this.fx.burst('dust', o.x + rand(-o.r, o.r) * 0.6, y + rand(2, Math.max(3, (o.h || 8) * 0.6)), o.z + rand(-o.r, o.r) * 0.6, 3, 3, 3, { up: 0.2, spread: 0.4 });
    this.snd('crack', o.x, o.z, {}, 0.4);
  }
  hurtObj(o, dmg, dir, kind) {
    if (o.state >= 2 || !(dmg > 0)) return;
    o.hp -= dmg;
    const T = o.T;
    if (o.kind === 'house') {
      o.dmg = clamp(1 - o.hp / o.max, 0, 1) * 0.9;
      o.setObj.setState(o);
      if (o.hp <= 0) this.ruin(o, dir);
      else this.crackle(o);
    } else if (o.kind === 'landmark') {
      o.dmg = clamp(1 - o.hp / o.max, 0, 1);
      this.kb.setLandmarkState(o);
      if (o.hp <= 0) this.ruin(o, dir);
      else if (Math.random() < 0.2) { this.fx.burst('dust', o.x + rand(-o.r, o.r), groundH(o.x, o.z) + rand(5, o.h * 0.7), o.z + rand(-o.r, o.r), 6, 6, 4); this.crackle(o); }
    } else {
      o.dmg = clamp(1 - o.hp / o.max, 0, 1);
      o.ws.setState(o);
      if (o.hp <= 0) this.ruin(o, dir);
      else this.crackle(o);
    }
  }
  // 巨獣から建物へ向かう単位ベクトル（瓦礫は巨獣の反対側へ飛ぶ）
  awayFromBeast(o) {
    const P = this.anim.pos;
    let dx = o.x - P.x, dz = o.z - P.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = Math.sin(this.anim.yaw); dz = Math.cos(this.anim.yaw); return [dx, dz]; }
    return [dx / l, dz / l];
  }
  ruin(o, dir) {
    if (o.state >= 2) return;
    o.state = 2;
    const T = o.T;
    T.destroyed += o.value;
    this.score.bld++; this.score.value += o.value;
    const y = groundH(o.x, o.z);
    const dirS = Math.sin(dir || 0) >= 0 ? 1 : -1;
    if (o.kind === 'house') {
      o.setObj.collapse(o, dirS);
      // 中に残っていた人
      const left = Math.round((o.pop || 0) * (1 - o.evac));
      if (left > 0) { this.score.dead += left; T.dead += left; }
      o.evac = 1;
      const col = o.style === 1 ? [0.42, 0.4, 0.36] : o.style === 2 ? [0.62, 0.58, 0.5] : [0.32, 0.22, 0.14];
      const [adx, adz] = this.awayFromBeast(o);
      if (this.fx.collapseFX) this.fx.collapseFX(o.x, y, o.z, Math.max(4, o.r || 6), adx, adz, { col, fire: o.fire > 0.2, h: o.h || 8 });
      this.fx.burst('dust', o.x, y + 2, o.z, 5, 8, Math.max(4, o.r * 0.7), { up: 0.4, r: o.r * 0.5 });
      for (let i = 0; i < 2; i++) this.fx.debris.spawn(o.x + rand(-o.r, o.r) * 0.5, y + o.h * 0.6, o.z + rand(-o.r, o.r) * 0.5, rand(-6, 6), rand(2, 9), rand(-6, 6), rand(0.4, 1.0), col);
      this.snd('smash', o.x, o.z, {}, 0.08);
      if (o.fire > 0.2) this.fx.burst('ember', o.x, y + 3, o.z, 14, 10, 1);
    } else if (o.kind === 'landmark') {
      this.kb.collapseLandmark(o, dirS);
      const [adx, adz] = this.awayFromBeast(o);
      if (this.fx.collapseFX) this.fx.collapseFX(o.x, y, o.z, Math.max(6, o.r || 10), adx, adz, { col: [0.5, 0.47, 0.42], fire: o.fire > 0.2, h: o.h || 20 });
      this.fx.burst('dust', o.x, y + o.h * 0.3, o.z, 24, 14, o.r * 0.6, { up: 0.3, r: o.r * 0.8 });
      this.fx.burst('dust', o.x, y + 2, o.z, 18, 20, o.r * 0.5, { up: 0.05, r: o.r });
      for (let i = 0; i < 8; i++) this.fx.debris.spawn(o.x + rand(-o.r, o.r) * 0.5, y + rand(5, o.h * 0.7), o.z + rand(-o.r, o.r) * 0.5, rand(-10, 10), rand(2, 12), rand(-10, 10), rand(0.6, 1.8), [0.5, 0.47, 0.42]);
      this.addShake(o.x, o.z, 0.6);
      this.snd('collapse', o.x, o.z, { size: o.h * 2 }, 0.5);
      this.caption(`${T.s.short}の${o.name}が崩れ落ちた`, 'lm' + o.name + T.s.id, 1);
      if (o.type === 'castle') this.caption('王城、陥落', 'castle', 999);
    } else {
      if (o.kind === 'wall') o.ws.ruinWall(o); else o.ws.ruinTower(o);
      const [adx, adz] = this.awayFromBeast(o);
      if (this.fx.collapseFX) this.fx.collapseFX(o.x, y, o.z, Math.max(5, (o.r || 10) * 0.6), adx, adz, { col: [0.5, 0.47, 0.42], fire: false, h: o.h || 14 });
      this.fx.burst('dust', o.x, y + 4, o.z, 14, 10, 7, { up: 0.3, r: o.r * 0.6 });
      for (let i = 0; i < 4; i++) this.fx.debris.spawn(o.x + rand(-o.r, o.r) * 0.6, y + rand(3, 12), o.z + rand(-o.r, o.r) * 0.6, rand(-7, 7), rand(2, 8), rand(-7, 7), rand(0.5, 1.4), [0.5, 0.47, 0.42]);
      this.snd('collapse', o.x, o.z, { size: 50 }, 0.3);
      // 上にいた兵は落ちる
      for (const u of this.units) if (u.on === o && u.alive) this.killUnit(u, true);
      this.caption(`${T.s.short}の城壁が崩れた`, 'wall' + T.s.id, 20);
    }
    // 陥落の判定
    if (!T.fallen && T.destroyed / T.total >= 0.6 && (T.s.id !== 'capital' || this.castleDown())) {
      T.fallen = true;
      this.score.fallen.push(T.s.id);
      this.caption(T.s.id === 'capital' ? '王都アルディナ、陥落。王国は滅んだ' : `${T.s.name}、壊滅`, 'fall' + T.s.id, 999);
    }
  }
  castleDown() { const C = this.townById.capital; return !C || (C.t.landmarkObjs || []).filter((l) => l.type === 'castle').every((l) => l.state >= 2); }
  ignite(o, amt) {
    if (o.state >= 3 || o.flam <= 0 || o.burnt >= 1) return;
    const before = o.fire;
    o.fire = Math.min(1, o.fire + amt * o.flam * 0.6);
    if (before <= 0 && o.fire > 0) { this.burning.add(o); this.score.fires++; }
  }
  updateFires(dt) {
    this.fireT = (this.fireT || 0) - dt;
    const tick = this.fireT <= 0;
    if (tick) this.fireT = 0.25;
    const step = 0.25;
    const cam = this.engine.camera.position;
    let budget = this.engine.qname === 'low' ? 40 : 90;
    const list = [];
    for (const o of this.burning) {
      if (tick) {
        o.fire = Math.min(1, o.fire + step * 0.12 * o.flam * (1 - o.burnt));
        o.burnt = Math.min(1, o.burnt + step * 0.012 * o.fire * (1 + o.flam));
        if (o.state < 2) this.hurtObj(o, o.fire * step * (o.kind === 'house' ? 1.3 : 2), 0, 'fire');
        if (o.kind === 'house' && o.setObj) { o.setObj.setState(o); }
        else if (o.kind === 'landmark') { o.burnt = o.burnt; this.kb.setLandmarkState(o); }
        if (o.burnt >= 1 || (o.state >= 2 && o.burnt > 0.6)) o.fire -= step * 0.05;
        if (o.fire <= 0) { o.fire = 0; this.burning.delete(o); continue; }
        // 延焼
        if (o.fire > 0.4) {
          for (const n of this.grid.query(o.x, o.z, 16 + o.r, this.tmp2)) {
            if (n === o || n.fire > 0 || n.flam <= 0 || n.burnt >= 1) continue;
            const d = Math.hypot(n.x - o.x, n.z - o.z) - (n.r || 4) - (o.r || 4);
            if (d > 9) continue;
            const wind = 1 + 0.8 * ((n.x - o.x) * this.fx.wind[0] + (n.z - o.z) * this.fx.wind[1]) / (Math.hypot(n.x - o.x, n.z - o.z) * 3.3 + 1e-3);
            if (Math.random() < step * 0.018 * o.fire * n.flam * wind * (o.T && o.T.s.kind === 'village' ? 0.8 : 1.1)) this.ignite(n, 0.25);
          }
        }
      }
      const d = Math.hypot(o.x - cam.x, o.z - cam.z);
      list.push([d, o]);
    }
    // 見た目：近い火事ほど細かく
    list.sort((a, b) => a[0] - b[0]);
    for (const [d, o] of list) {
      const near = d < 600, mid = d < 2500;
      const y = groundH(o.x, o.z);
      const top = o.kind === 'house' ? (o.state >= 2 ? y + 2 : o.y + o.h + o.roofH * 0.5) : y + (o.h || 10) * (o.state >= 2 ? 0.2 : 0.6);
      const f = o.fire;
      if (budget > 0 && near) {
        budget--;
        o.facc = (o.facc || 0) + dt * 18 * f * (o.kind === 'landmark' ? 2.5 : 1);
        while (o.facc >= 1) { o.facc -= 1; this.fx.puff('flame', o.x + rand(-1, 1) * o.r * 0.45, top + rand(-1.5, 1), o.z + rand(-1, 1) * o.r * 0.45, rand(-0.6, 0.6), rand(3, 6), rand(-0.6, 0.6), rand(1.4, 2.6) * (0.7 + f * 0.5), rand(0.6, 1.0)); }
        if (Math.random() < dt * 3 * f) this.fx.puff('ember', o.x, top + 2, o.z, rand(-2, 2), rand(4, 9), rand(-2, 2), 1, 3);
      }
      // 煙：火事が多いほど一つ一つは大きく少なく（柱になって昇る）
      const many = clamp(list.length / 40, 1, 6);
      if (Math.random() < dt * (near ? 0.9 : 0.45) * f / many) this.fx.puff(o.burnt > 0.75 ? 'smoke' : 'bsmoke', o.x + rand(-2, 2), top + 3, o.z + rand(-2, 2), rand(-1, 1), rand(4, 7), rand(-1, 1), rand(7, 11) * Math.sqrt(many) * (o.kind === 'landmark' ? 1.8 : 1), rand(14, 22));
    }
    // 近くの大きな火事を照明に
    if (list.length && Math.random() < dt * 4) { const o = list[Math.floor(Math.random() * Math.min(4, list.length))][1]; this.fx.light(o.x, groundH(o.x, o.z) + 12, o.z, 0xff7a30, 1500 * o.fire, 0.6); }
  }
  /* ===== 集落：警鐘と避難 ===== */
  raiseAlarm(T) {
    if (T.alarm) return;
    T.alarm = true; T.alarmT = this.time;
    this.caption(`${T.s.short}に警鐘が鳴り響く`, 'alarm' + T.s.id, 999);
    this.snd('alarm', T.s.x, T.s.z, { far: 5000 }, 1);
  }
  updateTowns(dt) {
    const P = this.anim.pos;
    this.townT = (this.townT || 0) - dt;
    if (this.townT > 0) return;
    this.townT = 0.5;
    for (const T of this.towns) {
      const d = Math.hypot(T.s.x - P.x, T.s.z - P.z) - T.s.r;
      if (!T.alarm && d < (T.s.kind === 'village' ? 700 : 1300)) this.raiseAlarm(T);
      // 避難：時間とともに家から人が出ていく
      if (T.alarm) {
        const el = this.time - T.alarmT;
        for (let k = 0; k < 30; k++) {
          const b = T.t.buildings[T.spawnI % T.t.buildings.length]; T.spawnI++;
          if (b.state >= 2 || b.evac >= 1 || !b.pop) continue;
          const bd = Math.hypot(b.x - P.x, b.z - P.z);
          const want = clamp(el / 420 + (bd < 350 ? 0.3 : 0) + (b.fire > 0.2 ? 0.4 : 0), 0, b.cap || (b.cap = rand(0.55, 0.92)));
          if (b.evac < want) {
            const step = Math.min(want - b.evac, 0.34);
            b.evac += step;
            // 見える範囲なら人として出す
            b.acc = (b.acc || 0) + b.pop * step / Math.max(1, T.s.pop / 600);
            if (bd < 1400 && this.agents.length < this.maxAgents()) {
              const n = Math.min(4, Math.floor(b.acc));
              b.acc -= n;
              for (let i = 0; i < n; i++) this.spawnCiv(T, b);
            }
          }
        }
      }
    }
  }
  maxAgents() { return this.engine.q.people; }
  /* ===== 住民 ===== */
  townNodes(T) {
    if (T.nodes) return T.nodes;
    const nodes = [], snap = new Map();
    const key = (x, z) => Math.round(x / 4) + ',' + Math.round(z / 4);
    const nodeAt = (x, z) => {
      const k = key(x, z);
      let n = snap.get(k);
      if (!n) { n = { x, z, nb: [] }; nodes.push(n); snap.set(k, n); }
      return n;
    };
    for (const st of T.t.streets) {
      let prev = null;
      for (let i = 0; i < st.pts.length; i++) {
        const [x, z] = st.pts[i];
        if (prev) {
          const L = Math.hypot(x - prev.x, z - prev.z);
          const n = Math.ceil(L / 14);
          for (let k = 1; k <= n; k++) {
            const q = nodeAt(lerp(prev.x, x, k / n), lerp(prev.z, z, k / n));
            if (q !== prev) { if (!prev.nb.includes(q)) prev.nb.push(q); if (!q.nb.includes(prev)) q.nb.push(prev); }
            prev = q;
          }
        } else prev = nodeAt(x, z);
      }
    }
    T.nodes = nodes;
    T.ngrid = new Grid(30);
    for (const n of nodes) T.ngrid.add(n, n.x, n.z, 0);
    return nodes;
  }
  nearestNode(T, x, z) {
    this.townNodes(T);
    let best = null, bd = 1e9;
    for (const r of [30, 70, 160]) {
      for (const n of T.ngrid.query(x, z, r, this.tmp2)) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
      if (best) break;
    }
    return best;
  }
  spawnCiv(T, b) {
    const c = civCloth();
    const kid = Math.random() < 0.18;
    const a = Math.random() * TAU;
    const x = b.x + Math.cos(a) * (b.r + 1), z = b.z + Math.sin(a) * (b.r + 1);
    const ag = { civ: true, T, x, z, y: groundH(x, z), yaw: a, node: this.nearestNode(T, x, z), prev: null, mode: 'node', spd: rand(3.2, 5.8) * (kid ? 0.8 : 1), ph: Math.random() * 10, pose: 0, wait: Math.random() < 0.7 ? rand(2, 25) : 0, colA: c[0], colB: c[1], scale: kid ? rand(0.55, 0.7) : rand(0.92, 1.06), weap: 0, alive: true, rep: Math.max(1, T.s.pop / 600), t: 0, ox: rand(-1.5, 1.5), oz: rand(-1.5, 1.5) };
    this.agents.push(ag);
    return ag;
  }
  killPeople(x, z, r, kind, fling, poison) {
    const r2 = r * r;
    for (const a of this.agents) {
      if (!a.alive) continue;
      const dx = a.x - x, dz = a.z - z;
      if (dx * dx + dz * dz > r2) continue;
      this.killAgent(a, kind, fling ? Math.atan2(dx, dz) : null);
    }
  }
  killAgent(a, kind, dir) {
    a.alive = false;
    const rep = a.rep != null ? a.rep : 1;
    this.score.dead += Math.round(rep);
    if (a.T) a.T.dead += Math.round(rep);
    if (kind === 'step' || kind === 'stomp' || kind === 'land' || kind === 'fall') return; // 足の下：跡形もない
    const c = { x: a.x, z: a.z, y: a.y, yaw: dir != null ? dir : a.yaw, colA: a.colA, colB: a.colB, scale: a.scale, weap: a.weap, t: 0, fly: dir != null ? { vx: Math.sin(dir) * rand(6, 14), vz: Math.cos(dir) * rand(6, 14), vy: rand(4, 10) } : null, burnt: kind === 'breath' || kind === 'fire' || kind === 'lava' };
    if (c.burnt) { c.colA = [0.05, 0.04, 0.035, c.colA[3]]; c.colB = [0.04, 0.035, 0.03, c.colB[3]]; }
    this.corpses.push(c);
    if (this.corpses.length > 1400) this.corpses.shift();
  }
  updateAgents(dt) {
    const P = this.anim.pos;
    const list = this.agents;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      a.t += dt;
      const dxB = a.x - P.x, dzB = a.z - P.z;
      const dB = Math.hypot(dxB, dzB);
      if (a.civ) {
        // はじめは立ちすくむ・様子を見る。巨獣が近いと逃げ出す
        if (a.wait > 0 && dB > 160) {
          a.wait -= dt;
          a.pose = a.t % 7 < 4 ? 0 : 1; a.ph += dt * (a.pose ? 3 : 0.6);
          if (a.pose) { a.x += Math.sin(a.yaw) * 0.6 * dt; a.z += Math.cos(a.yaw) * 0.6 * dt; }
          else a.yaw += angDiff(a.yaw, Math.atan2(-dxB, -dzB)) * Math.min(1, dt * 2);
          list[w++] = a; continue;
        }
        if (a.pose < 2) a.pose = Math.random() < 0.3 ? 5 : 2;
        // 逃げる：通りをたどって巨獣から遠ざかる
        let tx, tz;
        if (a.mode === 'node' && a.node) {
          tx = a.node.x + a.ox; tz = a.node.z + a.oz;
          if (Math.hypot(tx - a.x, tz - a.z) < 2.5) {
            let best = null, bs = -1e9;
            for (const n of a.node.nb) {
              if (n === a.prev) continue;
              const s = Math.hypot(n.x - P.x, n.z - P.z) + rand(0, 25);
              if (s > bs) { bs = s; best = n; }
            }
            const here = Math.hypot(a.node.x - P.x, a.node.z - P.z);
            if (!best || (bs < here && a.node.nb.length <= 1)) a.mode = 'open';
            else { a.prev = a.node; a.node = best; }
          }
        } else { tx = a.x + dxB / (dB + 1e-3) * 10 + a.ox * 2; tz = a.z + dzB / (dB + 1e-3) * 10 + a.oz * 2; }
        const vx = tx - a.x, vz = tz - a.z, vl = Math.hypot(vx, vz) || 1;
        const panic = dB < 400 ? 1.25 : 1;
        a.x += vx / vl * a.spd * panic * dt; a.z += vz / vl * a.spd * panic * dt;
        a.yaw = Math.atan2(vx, vz);
        a.ph += dt * a.spd * 1.7;
        const camD = Math.hypot(a.x - this.engine.camera.position.x, a.z - this.engine.camera.position.z);
        if (a.mode === 'open' && dB > 1800 && camD > 700) a.safe = (a.safe || 0) + dt;
        if (a.safe > 6 || (dB > 3000 && camD > 1200)) { a.alive = false; continue; }
        if (a.mode === 'open' && dB > 1400) { a.spd = Math.max(1.3, a.spd - dt * 0.3); if (a.spd < 2) a.pose = 1; }
        // 燃える家の熱
        if (Math.random() < dt * 0.4) a.y = groundH(a.x, a.z); else a.y = lerp(a.y, groundH(a.x, a.z), 0.2);
      }
      list[w++] = a;
    }
    list.length = w;
    for (const c of this.corpses) {
      if (c.fly) {
        c.t += dt;
        c.fly.vy -= 9.8 * dt;
        c.x += c.fly.vx * dt; c.z += c.fly.vz * dt; c.y += c.fly.vy * dt;
        const gy = groundH(c.x, c.z);
        if (c.y <= gy) { c.y = gy; c.fly = null; }
      }
    }
  }
  /* ===== 軍勢 ===== */
  activateGroup(g) {
    let n = 0;
    for (const u of this.units) if (u.group === g && !u.active && u.alive) { u.active = true; n++; }
    return n;
  }
  updateUnits(dt) {
    const P = this.anim.pos, an = this.anim;
    // 部隊の出撃
    for (const u of this.units) {
      if (u.active || !u.alive) continue;
      const d = Math.hypot(u.x - P.x, u.z - P.z);
      if (d < (u.group === 'field' ? 2600 : 1800)) {
        u.active = true;
        if (!this.capT['grp' + u.group]) {
          this.capT['grp' + u.group] = this.time;
          const msg = { milt: 'ミルト村の自警団が鍬を手に集まる', buchen: 'ブーヘン村の樵たちが斧を構える', linden: 'リンデン村の自警団が集まる', hasel: 'ハーゼル村の自警団が集まる', garmund: 'ガルムントの守備隊が城壁に就いた', field: '王国軍が街道に布陣している', capital: '王都の全軍が迎え撃つ' }[u.group];
          if (msg) this.caption(msg);
        }
      }
    }
    const aims = this.aimPoints();
    for (const u of this.units) {
      if (!u.alive || !u.active) continue;
      const U = u.U;
      u.t += dt;
      u.recoil = Math.max(0, u.recoil - dt * 1.5);
      const dx = P.x - u.x, dz = P.z - u.z, d = Math.hypot(dx, dz);
      const yawTo = Math.atan2(dx, dz);
      u.cd -= dt;
      if (u.rout > 0) {
        // 恐慌：逃げる
        u.rout -= dt;
        if (!u.fixed) { u.x -= dx / d * U.spd * 1.3 * dt; u.z -= dz / d * U.spd * 1.3 * dt; u.yaw = yawTo + Math.PI; u.pose = 2; u.ph += dt * 8; u.y = groundH(u.x, u.z); }
        continue;
      }
      if (U.machine) {
        // 兵器：狙って撃つ
        u.yaw += clamp(angDiff(u.yaw, yawTo), -dt * 0.6, dt * 0.6);
        if (d < U.range && Math.abs(angDiff(u.yaw, yawTo)) < 0.15 && u.cd <= 0 && !an.dead) { this.fireUnit(u, aims, d); u.cd = U.cd * rand(0.85, 1.15); }
        if (u.type === 'trebuchet') u.arm = u.cd > U.cd - 1.2 ? lerp(-0.9, 1.1, clamp((U.cd - u.cd) / 0.6, 0, 1)) : lerp(-0.9, 1.1, clamp(1 - (U.cd - u.cd - 1.2) / 4, 0, 1));
        continue;
      }
      if (U.melee) {
        // 近接：足もとへ走り込む
        let tx = P.x, tz = P.z;
        const feet = an.legs;
        if (feet.length) { const f = feet[(u.t * 0.1 + (u.ph | 0)) % feet.length | 0]; tx = f.plant.x; tz = f.plant.z; }
        else { tx = P.x - Math.sin(an.yaw) * 10; tz = P.z - Math.cos(an.yaw) * 10; }
        const fd = Math.hypot(tx - u.x, tz - u.z);
        const want = U.range + (U.horse ? 4 : 2) + this.footR;
        if (u.post && d > 900) { tx = u.post[0]; tz = u.post[1]; }
        if (fd > want) {
          const vx = tx - u.x, vz = tz - u.z, vl = Math.hypot(vx, vz) || 1;
          if (vl > 1.5) { u.x += vx / vl * U.spd * dt; u.z += vz / vl * U.spd * dt; u.yaw = Math.atan2(vx, vz); u.pose = U.horse ? 8 : 2; u.ph += dt * (U.horse ? 9 : 8); }
          else u.pose = 0;
        } else {
          u.yaw = Math.atan2(tx - u.x, tz - u.z); u.pose = U.horse ? 8 : 3; u.ph += dt * 6;
          if (u.cd <= 0 && !an.dead && an.flying < 0.3) { u.cd = U.cd * rand(0.8, 1.2); this.hurtBeast(U.dmg * this.dmgMul, u); if (this.stats.abil === 'thorns') this.hurtUnit(u, this.stats.atk * 0.4); if (U.boss) this.heroStrike(u); }
        }
        u.y = groundH(u.x, u.z);
        continue;
      }
      // 遠距離：射程の内側、近すぎない所で止まる
      let want = clamp(U.range * 0.7, 80, 260);
      if (u.fixed) want = 0;
      if (!u.fixed && (d > U.range * 0.9 || d < want * 0.5)) {
        const sgn = d > U.range * 0.9 ? 1 : -1;
        u.x += dx / d * U.spd * sgn * dt; u.z += dz / d * U.spd * sgn * dt;
        u.yaw = sgn > 0 ? yawTo : yawTo + Math.PI; u.pose = 2; u.ph += dt * 8;
        u.y = groundH(u.x, u.z);
      } else {
        u.yaw = yawTo;
        u.pose = u.cd < 0.8 ? 4 : 0; u.ph += dt * 2;
        if (d < U.range && u.cd <= 0 && !an.dead) { this.fireUnit(u, aims, d); u.cd = U.cd * rand(0.85, 1.15); }
      }
    }
    // 勇者は結界が破れるか、王都に入ると現れる
    if (!this.heroSpawned && this.townById.capital && Math.hypot(P.x - this.townById.capital.s.x, P.z - this.townById.capital.s.z) < 700) this.spawnHero();
  }
  spawnHero() {
    if (this.heroSpawned || !this.townById.capital) return;
    this.heroSpawned = true;
    const C = this.townById.capital.s;
    const u = this.addUnit('hero', C.castle.x + 60, C.castle.z + 60, { group: 'capital' });
    u.active = true; u.hp = UT.hero.hp * this.dmgMul; u.max = u.hp;
    this.hero = u;
    this.caption('竜殺しの勇者が現れた');
    this.snd('power', u.x, u.z, { far: 6000 }, 1);
  }
  heroStrike(u) {
    const y = groundH(u.x, u.z);
    this.fx.burst('magic', u.x, y + 6, u.z, 14, 14, 3, { col: [1, 0.9, 0.6] });
    this.fx.puff('flash', u.x, y + 8, u.z, 0, 0, 0, 14, 0.25, [1, 0.9, 0.7]);
    this.snd('slash', u.x, u.z, {}, 0.2);
  }
  // 巨獣のどこを狙うか（体の上の点）
  aimPoints() {
    const an = this.anim, out = [];
    for (const i of [an.iSpine, an.iChest, an.iPelvis, an.iHead, an.iNeck[1]]) if (i >= 0) out.push(an.jointWorld(i, new THREE.Vector3()));
    return out;
  }
  fireUnit(u, aims, d) {
    const U = u.U;
    this.dbg.shots[u.type] = (this.dbg.shots[u.type] || 0) + 1;
    const tgt = pick(aims).clone();
    const miss = clamp(d / U.range, 0, 1) * (U.machine ? 0.45 : 0.6) + (U.proj === 'arrow' ? 0.15 : 0);
    const hit = Math.random() > miss;
    const r = this.anim.halfW * 0.8;
    tgt.x += rand(-r, r); tgt.y += rand(-r, r) * 0.6; tgt.z += rand(-r, r);
    if (!hit) { const a = Math.random() * TAU, m = rand(8, 40); tgt.x += Math.cos(a) * m; tgt.z += Math.sin(a) * m; tgt.y = groundH(tgt.x, tgt.z); }
    const y0 = u.y + (U.machine ? (u.type === 'trebuchet' ? 14 : u.type === 'bombard' ? 2.2 : 1.4) : 1.5);
    const p0 = new THREE.Vector3(u.x + Math.sin(u.yaw) * (U.machine ? 2.5 : 0.5), y0, u.z + Math.cos(u.yaw) * (U.machine ? 2.5 : 0.5));
    const spd = { arrow: 70, bolt: 110, ball: 190, bigball: 160, stone: 55, orb: 60 }[U.proj] || 80;
    const T = Math.max(0.3, d / spd);
    const kind = U.proj === 'orb' ? 'orb' : U.proj;
    const dmg = U.dmg * this.dmgMul;
    this.fx.proj.launch(kind, p0, tgt, T, (p) => {
      if (hit) {
        this.hurtBeast(dmg, u, p);
        if (U.machine) { this.fx.burst('spark', p.x, p.y, p.z, 10, 14, 0.6); this.fx.burst('dust', p.x, p.y, p.z, 4, 6, 4); this.fx.puff('flash', p.x, p.y, p.z, 0, 0, 0, u.type === 'bombard' ? 12 : 4, 0.15); if (u.type === 'bombard') { this.fx.explode(p.x, p.y, p.z, 14, { decal: false, debris: false }); this.addShake(p.x, p.z, 0.8); this.snd('boom', p.x, p.z, { size: 90 }, 0.3); } }
        else if (kind === 'orb') this.fx.burst('magic', p.x, p.y, p.z, 8, 10, 2, { col: [0.6, 0.85, 1] });
      } else {
        if (U.machine) { this.fx.explode(p.x, p.y, p.z, u.type === 'bombard' ? 16 : u.type === 'trebuchet' ? 8 : 5, { fire: u.type === 'bombard', smoke: 'dust' }); this.areaDamage(p.x, p.z, u.type === 'bombard' ? 18 : 6, 20, { kind: 'shell' }); }
      }
    }, { g: kind === 'orb' ? 0 : kind === 'bolt' && U.machine ? 2 : 9.8, col: kind === 'orb' ? [0.5, 0.75, 1] : null, scale: 1 });
    // 発射の煙と音
    if (U.machine && u.type !== 'ballista') {
      const mx = p0.x + Math.sin(u.yaw) * 1.5, mz = p0.z + Math.cos(u.yaw) * 1.5;
      if (u.type !== 'trebuchet') {
        this.fx.puff('flash', mx, p0.y, mz, 0, 0, 0, u.type === 'bombard' ? 6 : 2.5, 0.12);
        this.fx.burst('gsmoke', mx, p0.y, mz, u.type === 'bombard' ? 16 : 7, 6, u.type === 'bombard' ? 6 : 2.6, { up: 0.2 });
        u.recoil = 1;
        this.snd('boom', u.x, u.z, { size: u.type === 'bombard' ? 120 : 45 }, 0.15);
        if (u.type === 'bombard') { this.caption('大射石砲「黒鉄の鐘」が火を噴いた', 'bombard', 25); this.addShake(u.x, u.z, 0.6); }
        else this.caption(`${u.group === 'field' ? '王国軍' : this.townById[u.group] ? this.townById[u.group].s.short : ''}の大砲が火を噴いた`, 'cannon' + u.group, 30);
      }
    } else if (U.proj === 'arrow' && Math.random() < 0.15) this.snd('shot', u.x, u.z, {}, 0.3);
    else if (kind === 'orb') this.fx.puff('magic', p0.x, p0.y, p0.z, 0, 0, 0, 3, 0.4);
  }
  hurtBeast(dmg, u, at) {
    const B = this.B, st = this.stats, an = this.anim;
    if (an.dead || B.invuln > 0 || this.done) return;
    const U = u && u.U;
    if (U && st.abil === 'dodge' && Math.random() < 0.15) return;
    let d = U && U.holy ? (dmg * 100) / (100 + st.def * 0.6) : (dmg * 100) / (100 + st.def);
    if (U && U.holy && st.elem === 'curse') d *= 1.2;
    if (U && !U.melee && st.abil === 'shell') d *= 0.8;
    if (st.traits && st.traits.includes('dread')) d *= 0.85;
    B.hp -= d;
    B.hurtT = 1.5;
    if (u) this.dbg.dmg[u.type] = (this.dbg.dmg[u.type] || 0) + d;
    if (u) { u.dealt = (u.dealt || 0) + d; u.lastHit = this.time; }
    this.beast.uni.uFlash.value = Math.min(1, this.beast.uni.uFlash.value + Math.min(0.5, d / B.max * 20));
    if (at) an.hit(an.pos.x - at.x, an.pos.z - at.z, clamp(d / B.max * 40, 0.05, 1));
    if (d > B.max * 0.04 && Math.random() < 0.5 && !an.busy()) an.play('flinch');
    if (B.hp <= 0) {
      if (st.traits && st.traits.includes('undying') && !B.undyingUsed) { B.undyingUsed = true; B.hp = B.max * 0.18; B.invuln = 2.5; this.caption('不屈。巨獣は再び立ち上がる'); an.play('roar'); return; }
      B.hp = 0;
      const side = at ? (Math.sin(an.yaw) * (at.z - an.pos.z) - Math.cos(an.yaw) * (at.x - an.pos.x) > 0 ? 1 : -1) : 1;
      an.die(side);
      this.ai.spec = null; this.fx.showBeam(null);
      this.snd('roar', an.pos.x, an.pos.z, { dying: true }, 0);
      this.caption(`${this.opts.beastName || '巨獣'}、倒れる`, 'death', 999);
      // 誰が仕留めたか
      if (u) this.lastBlow = u.U.name;
    }
  }
  hurtUnits(x, z, r, dmg, kind) {
    for (const u of this.units) {
      if (!u.alive || !u.active) continue;
      if (Math.abs(u.x - x) > r || Math.abs(u.z - z) > r) continue;
      if (Math.hypot(u.x - x, u.z - z) > r) continue;
      if (u.on && kind === 'step') continue;
      this.hurtUnit(u, dmg, kind, Math.atan2(u.x - x, u.z - z));
    }
  }
  hurtUnit(u, dmg, kind, dir) {
    if (!u.alive) return;
    u.hp -= dmg * (u.U.boss ? 0.5 : 1);
    if (u.hp <= 0) this.killUnit(u, false, kind, dir);
  }
  killUnit(u, fell, kind, dir) {
    u.alive = false;
    const U = u.U;
    if (U.machine) {
      this.score.machines++;
      this.fx.explode(u.x, u.y, u.z, u.type === 'bombard' ? 12 : 5, { col: [0.3, 0.2, 0.12] });
      this.wrecks = this.wrecks || [];
      this.wrecks.push({ x: u.x, y: u.y, z: u.z, yaw: u.yaw, sc: u.type === 'trebuchet' ? 3 : u.type === 'bombard' ? 2.5 : 1 });
      if (u.type === 'bombard') this.caption('「黒鉄の鐘」、沈黙');
      for (const c of u.crew) this.killAgent({ x: u.x + Math.cos(c.a) * c.r, z: u.z + Math.sin(c.a) * c.r, y: u.y, yaw: 0, colA: c.col[0], colB: c.col[1], scale: 1, weap: 0, rep: 1 }, kind, dir != null ? dir : Math.random() * TAU);
      this.score.soldiers += U.crew;
    } else {
      this.score.soldiers++;
      this.killAgent({ x: u.x, z: u.z, y: u.y, yaw: u.yaw, colA: u.colA, colB: u.colB, scale: u.scale, weap: U.weap, rep: 0 }, fell ? 'fall' : kind, dir);
      if (U.horse) { this.deadHorses = this.deadHorses || []; this.deadHorses.push({ x: u.x, y: u.y, z: u.z, yaw: u.yaw, coat: u.ph % 1 }); }
      if (u.type === 'hero') this.caption('竜殺しの勇者、斃れる');
    }
  }
  /* ===== 体で押し潰す（尾・胴・蛇身） ===== */
  bodyCrush(dt) {
    this.bodyT = (this.bodyT || 0) - dt;
    if (this.bodyT > 0) return;
    this.bodyT = 0.2;
    const an = this.anim;
    if (an.flying > 0.3) return;
    const pts = [];
    for (const c of an.tails) for (let k = 1; k < c.length; k += 2) pts.push(c[k]);
    if (an.serp) for (let k = 3; k < an.serp.length; k += 2) pts.push(an.serp[k]);
    if (an.frame === 'hop' || an.frame === 'serpent' || an.frame === 'multi') pts.push(an.iPelvis, an.iSpine);
    for (const i of pts) {
      const p = an.jointWorld(i, _v);
      const gy = groundH(p.x, p.z);
      const h = p.y - gy;
      if (h > 16) continue;
      const r = 5 * an.sF;
      for (const o of this.grid.query(p.x, p.z, r + 10, this.tmp)) {
        if (o.state >= 2 || o.kind !== 'house') continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) - o.r * 0.6 > r) continue;
        if (h > o.h + o.roofH) continue;
        this.hurtObj(o, this.stats.atk * 1.2, Math.atan2(o.x - p.x, o.z - p.z), 'body');
      }
      this.killPeople(p.x, p.z, r, 'body', true);
      this.hurtUnits(p.x, p.z, r, this.stats.atk, 'body');
    }
  }
  /* ===== 描画用に人・兵器を書き出す ===== */
  draw() {
    const H = this.humans, Hs = this.horses, M = this.machines;
    H.begin(); Hs.begin(); M.begin();
    const cam = this.engine.camera.position;
    const far2 = 1800 * 1800;
    for (const a of this.agents) {
      if (!a.alive) continue;
      if ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 > far2) continue;
      H.push(a.x, a.y, a.z, a.yaw, a.pose, a.ph, 1, 0, a.colA, a.colB, a.scale);
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      if ((u.x - cam.x) ** 2 + (u.z - cam.z) ** 2 > far2 * 1.5) continue;
      const U = u.U;
      if (U.machine) {
        const y = u.y;
        if (u.type === 'cannon') M.cannon(u.x, y, u.z, u.yaw, 0.12, u.recoil);
        else if (u.type === 'ballista') M.ballista(u.x, y, u.z, u.yaw, 0.1);
        else if (u.type === 'trebuchet') M.trebuchet(u.x, y, u.z, u.yaw, u.arm != null ? u.arm : -0.9);
        else if (u.type === 'bombard') M.bombard(u.x, y, u.z, u.yaw, 0.08, u.recoil);
        for (const c of u.crew) {
          const cx = u.x + Math.cos(c.a + u.yaw) * c.r, cz = u.z + Math.sin(c.a + u.yaw) * c.r;
          H.push(cx, y, cz, u.yaw, 9, u.t * 2 + c.a, 1, 0, c.col[0], c.col[1]);
        }
        continue;
      }
      if (U.horse) {
        Hs.push(u.x, u.y, u.z, u.yaw, u.ph, u.pose === 8 && u.rout <= 0 ? 1 : 0.3, false, (u.colA[0] * 7) % 1);
        H.push(u.x, u.y + 1.15, u.z - Math.cos(u.yaw) * 0.1, u.yaw, 8, u.ph, 1, U.weap, u.colA, u.colB, u.scale);
      } else H.push(u.x, u.y, u.z, u.yaw, u.pose, u.ph, 1, U.weap, u.colA, u.colB, u.type === 'hero' ? 1.1 : u.scale);
    }
    for (const c of this.corpses) {
      if ((c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > far2 * 0.5) continue;
      H.push(c.x, c.y, c.z, c.yaw, c.fly ? 7 : 6, c.fly ? Math.min(0.99, c.t * 1.2) : 0, 0, c.weap || 0, c.colA, c.colB, c.scale);
    }
    for (const h of this.deadHorses || []) Hs.push(h.x, h.y, h.z, h.yaw, 0, 0, true, h.coat);
    for (const w of this.wrecks || []) M.wrecked(w.x, w.y, w.z, w.yaw, w.sc);
    H.end(); Hs.end(); M.end();
  }
  /* ===== 集計 ===== */
  progress() {
    const out = {};
    for (const T of this.towns) out[T.s.id] = { destr: T.total ? T.destroyed / T.total : 0, fallen: T.fallen, dead: T.dead };
    return out;
  }
  where() {
    const P = this.anim.pos;
    let best = null, bd = 1e9;
    for (const T of this.towns) { const d = Math.hypot(P.x - T.s.x, P.z - T.s.z) - T.s.r; if (d < bd) { bd = d; best = T; } }
    return { T: best, d: bd };
  }
}

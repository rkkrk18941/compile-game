/* ---------- 2D横スクロール侵攻「Raid」（現代編・未来編） ---------- */
/* 世界データ（region.mid/back/front, waves, marks, BLD, UNITS）をそのまま使う。
   巨獣は左→右へ自動前進し、プレイヤーは速度・薙ぎ・必殺・撤退を操作する。 */
class RaidSim {
  constructor(beast, world, region, opts = {}) {
    this.beast = beast; this.world = world; this.region = region;
    this.cycle = opts.cycle || 0;
    this.st = beastStats(beast);
    this.len = Math.max(400, region.len || 900);
    this.hp = this.st.hp; this.max = this.st.hp;
    this.x = 30; this.t = 0; this.done = null; this.endT = 0;
    this.gauge = 30; this.speedMul = 1; this.speedLv = 2; // 0:止 1:遅 2:並 3:速
    this.atkT = -1; this.atkCd = 0; this.specT = -1; this.specForm = null; this.hurtT = 0;
    this.undyingUsed = false; this.blackout = false;
    this.ev = [];
    this.units = []; this.projs = [];
    this.score = { bld: 0, val: 0, dead: 0, soldiers: 0 };
    this.rng = mulberry32(hashStr(region.id + ':' + (region.name || '')));
    this.dm = diffMul(region.D, this.cycle);            // 敵火力の地域補正
    this.unitMul = (world.unitMul || 1) * 1.8;          // レイド調整（足止め・再配置と合わせて脅威を確保）
    this.bldMul = world.bldMul || 1;
    this.elemMul = (world.elemMul && world.elemMul[this.st.elem]) || 1;
    this.buildings = [];
    this.genBuildings();
    this.totalPop = this.buildings.reduce((a, b) => a + (b.counts ? b.pop : 0), 0) || 1;
    this.waves = (region.waves || []).map((w) => ({ ...w, next: w.at || 0, spawned: 0 }));
    this.bossSpawned = false; this.boss = null;
    this.capShown = {};
  }
  emit(e) { this.ev.push(e); }
  caption(text, key) {
    if (key && this.capShown[key]) return;
    if (key) this.capShown[key] = 1;
    this.emit({ k: 'caption', text });
  }
  /* ---------- 街の生成 ---------- */
  genLayer(map, layer) {
    if (!map) return;
    const rng = this.rng;
    let cur = layer === 'back' ? 10 : 30 + rng() * 30;
    const end = this.len - 40;
    while (cur < end) {
      const t = weighted(map, rng);
      const B = BLD[t]; if (!B) { cur += 20; continue; }
      const w = Math.round(rand(B.w[0], B.w[1]) / 2) * 2, h = Math.round(rand(B.h[0], B.h[1]) / 2) * 2;
      this.addBuilding(t, cur + w / 2, w, h, layer);
      cur += w + (layer === 'back' ? 6 + rng() * 16 : 4 + rng() * 12);
    }
  }
  addBuilding(t, cx, w, h, layer) {
    const B = BLD[t], rng = this.rng;
    const hpK = this.bldMul * (1 + 0.35 * this.cycle);
    const b = {
      t, x: cx, w, h, layer, seed: Math.floor(rng() * 1e9),
      hp: B.hp * hpK, max: B.hp * hpK, pop: B.pop || 0, val: B.val || 0,
      state: 0, fire: 0, fireT: 0, counts: !B.deco && layer !== 'back' ? true : !B.deco,
      shieldHp: 0, dead: false,
    };
    // 壊滅率の重み：人口＋価値×2。背後の街並みは半分だけ数える（必殺・薙ぎの余波で壊せる）
    b.popEff = (b.pop + b.val * 2) * (layer === 'back' ? 0.5 : 1);
    b.counts = !BLD[t].deco;
    if (B.shield) { b.shieldSelf = B.shield.hp; b.shieldHp = B.shield.hp * (1 + 0.3 * this.cycle); }
    this.buildings.push(b);
    return b;
  }
  genBuildings() {
    const r = this.region;
    this.genLayer(r.back, 'back');
    this.genLayer(r.mid, 'mid');
    this.genLayer(r.front, 'front');
    // ランドマーク（marks）は mid レイヤーに確実に置く
    for (const m of r.marks || []) {
      const B = BLD[m.t]; if (!B) continue;
      const cx = clamp(m.at, 0.05, 0.97) * this.len;
      // 近くの mid 建物を取り除いて差し替える
      this.buildings = this.buildings.filter((b) => b.layer !== 'mid' || Math.abs(b.x - cx) > (b.w / 2 + B.w[1] / 2 + 4));
      const w = Math.round(((B.w[0] + B.w[1]) / 2) / 2) * 2, h = Math.round(((B.h[0] + B.h[1]) / 2) / 2) * 2;
      const b = this.addBuilding(m.t, cx, w, h, 'mid');
      b.mark = true;
    }
    this.buildings.sort((a, b) => a.x - b.x);
    this.totalPopCalc = this.buildings.reduce((a, b) => a + (b.counts ? b.popEff : 0), 0);
  }
  destrRate() {
    let got = 0;
    for (const b of this.buildings) {
      if (!b.counts) continue;
      if (b.state === 2) got += b.popEff;
      else if (b.state === 1) got += b.popEff * 0.5;
    }
    return clamp(got / (this.totalPopCalc || 1), 0, 1);
  }
  /* ---------- ダメージ ---------- */
  defF() { return 100 / (100 + this.st.def); }
  hurtBeast(dmg, kind) {
    if (this.done || dmg <= 0) return;
    let d = dmg * this.defF();
    if (this.st.traits.includes('dread')) d *= 0.85;
    if (kind === 'proj' && this.st.abil === 'shell') d *= 0.8;
    if ((this.st.abil === 'dodge' && chance(0.12)) || (this.st.abil === 'flight' && chance(0.05))) { this.emit({ k: 'dodge', x: this.x }); return; }
    if (this.specForm === 'charge') d *= 0.5;
    this.hp -= d; this.hurtT = Math.max(this.hurtT, Math.min(0.2, d / this.max * 8));
    this.gauge = clamp(this.gauge + d * 0.06, 0, 100);
    if (this.hp <= 0) {
      if (this.st.traits.includes('undying') && !this.undyingUsed) { this.undyingUsed = true; this.hp = this.max * 0.15; this.caption('不屈。巨獣は再び立ち上がる', 'undying'); return; }
      this.hp = 0; this.finish('dead');
    }
  }
  shieldFor(b) {
    // 生存中の pylon の範囲内なら、そのシールドが先に受ける
    let best = null;
    for (const p of this.buildings) {
      if (!p.shieldSelf || p.state === 2 || p === b) continue;
      const S = BLD[p.t].shield; if (!S) continue;
      if (Math.abs(p.x - b.x) <= S.r && (p.shieldHp || 0) > 0) { if (!best || Math.abs(p.x - b.x) < Math.abs(best.x - b.x)) best = p; }
    }
    return best;
  }
  dmgBuilding(b, dmg, opts = {}) {
    if (b.state === 2 || dmg <= 0) return;
    let d = dmg;
    const sh = this.shieldFor(b);
    if (sh && !opts.noShield) {
      const absorbed = Math.min(sh.shieldHp, d);
      sh.shieldHp -= absorbed; d -= absorbed;
      this.emit({ k: 'shieldHit', x: b.x, y: b.h * 0.6 });
      if (sh.shieldHp <= 0) this.caption(CAPTIONS.shieldDown || 'シールドが消えた', 'shield' + sh.x);
      if (d <= 0) return;
    }
    b.hp -= d;
    if (b.hp <= 0 && b.state !== 2) {
      b.state = 2; b.fire = 0;
      this.score.bld++; this.score.val += b.val; this.score.dead += b.pop;
      this.emit({ k: 'collapse', x: b.x, y: 0, size: Math.max(b.w, b.h), layer: b.layer });
      const B = BLD[b.t];
      if (B.blackout && !this.blackout) { this.blackout = true; this.caption(CAPTIONS.blackout, 'blackout'); }
      if (B.expl) this.explode(b.x, B.expl);
      if (this.st.traits.includes('leech')) this.hp = Math.min(this.max, this.hp + d * 0.02);
    } else if (b.hp < b.max * 0.55 && b.state === 0) {
      b.state = 1;
      this.emit({ k: 'ruin', x: b.x, size: b.w });
      if (BLD[b.t].fl > 0.3 && chance(BLD[b.t].fl * 0.35)) b.fire = rand(4, 9);
    }
  }
  explode(x, ex) {
    this.emit({ k: 'boom', x, size: ex.r, elem: ex.elem || 'fire' });
    for (const b of this.buildings) if (b.state !== 2 && Math.abs(b.x - x) <= ex.r + b.w / 2 && b.x !== x) this.dmgBuilding(b, ex.dmg * 0.7, { noShield: true });
    if (Math.abs(this.x - x) < ex.r) this.hurtBeast(ex.dmg * 0.25, 'expl');
    for (const u of this.units) if (u.alive && Math.abs(u.x - x) <= ex.r) this.dmgUnit(u, ex.dmg);
  }
  dmgUnit(u, dmg) {
    if (!u.alive) return;
    u.hp -= dmg;
    if (u.hp <= 0) {
      u.alive = false; this.score.soldiers++; this.gauge = clamp(this.gauge + 4, 0, 100);
      this.emit({ k: 'unitDown', x: u.x, y: u.alt || 0, kind: u.U.kind });
      if (u === this.boss) { this.boss = null; this.caption((u.U.name || '強敵') + 'を倒した', 'bossdown'); }
    }
  }
  /* ---------- プレイヤー操作 ---------- */
  setSpeed(lv) { this.speedLv = clamp(lv, 0, 3); this.speedMul = [0, 0.55, 1, 1.6][this.speedLv]; }
  cycleSpeed() { this.setSpeed((this.speedLv + 1) % 4); }
  swipe() {
    if (this.done || this.atkCd > 0 || this.specT >= 0) return;
    this.atkCd = 0.85; this.atkT = 0;
    const st = this.st, reach = st.len * 0.35 + st.reach;
    const dmg0 = st.atk * 1.6;
    let hitAny = false;
    for (let i = 0; i < (st.hits || 1); i++) { /* 触手・鎌は複数同時：範囲を少し広げる表現 */ }
    const rangeMul = (st.hits || 1) >= 2 ? 1.35 : 1;
    for (const b of this.buildings) {
      const dx = b.x - this.x;
      if (dx < -b.w / 2 - 6 || dx > reach * rangeMul + b.w / 2) continue;
      const k = b.layer === 'back' ? 0.45 : 1;
      this.dmgBuilding(b, dmg0 * rand(0.85, 1.15) * this.elemMul * k);
      hitAny = true;
    }
    for (const u of this.units) {
      if (!u.alive || u.U.kind === 'off' || u.U.kind === 'orbital') continue;
      const dx = u.x - this.x;
      if (dx < -8 || dx > reach * rangeMul) continue;
      if ((u.U.kind === 'air' || u.U.kind === 'jet' || u.U.kind === 'bomber') && (u.alt || 0) > st.height * 1.15) continue;
      this.dmgUnit(u, dmg0 * rand(0.85, 1.15));
      hitAny = true;
    }
    this.gauge = clamp(this.gauge + (hitAny ? 6 : 2), 0, 100);
    this.emit({ k: 'swipe', hit: hitAny });
  }
  special() {
    if (this.done || this.gauge < 100 || this.specT >= 0) return;
    this.gauge = 0; this.specT = 0; this.specForm = this.st.form;
    const st = this.st, pow = st.pow * (st.abil === 'crystal' ? 1.1 : 1);
    this.emit({ k: 'special', form: st.form, elem: st.elem, x: this.x });
    const hurtB = (b, d) => this.dmgBuilding(b, d * this.elemMul);
    if (st.form === 'stream' || st.form === 'beam') {
      for (const b of this.buildings) { const dx = b.x - this.x; if (dx > -10 && dx < 270) hurtB(b, pow * 3.1 * (b.layer === 'back' ? 0.5 : 1)); if (b.state === 1 && dx > 0 && dx < 270 && BLD[b.t].fl > 0) b.fire = Math.max(b.fire, 5); }
      for (const u of this.units) if (u.alive && u.x - this.x > -10 && u.x - this.x < 280) this.dmgUnit(u, pow * 2.6);
    } else if (st.form === 'glob') {
      for (const off of [80, 155, 230]) { const x = this.x + off; this.emit({ k: 'boom', x, size: 46, elem: st.elem }); for (const b of this.buildings) if (Math.abs(b.x - x) < 50 + b.w / 2) hurtB(b, pow * 2.0); for (const u of this.units) if (u.alive && Math.abs(u.x - x) < 55) this.dmgUnit(u, pow * 1.8); }
    } else if (st.form === 'bolt') {
      const targets = this.units.filter((u) => u.alive && Math.abs(u.x - this.x) < 320).slice(0, 6);
      for (const u of targets) { this.dmgUnit(u, pow * 2.4); this.emit({ k: 'bolt', x: u.x, y: u.alt || 0 }); }
      for (const b of this.buildings) { const dx = b.x - this.x; if (dx > 0 && dx < 300 && chance(0.55)) hurtB(b, pow * 2.2); }
      if (!targets.length) for (const b of this.buildings) { const dx = b.x - this.x; if (dx > 0 && dx < 300) hurtB(b, pow * 2.2); }
    } else if (st.form === 'roar') {
      for (const b of this.buildings) if (Math.abs(b.x - this.x) < 140 + b.w / 2) hurtB(b, pow * 2.6);
      for (const u of this.units) if (u.alive && Math.abs(u.x - this.x) < 150) { this.dmgUnit(u, pow * 2.2); u.stun = Math.max(u.stun || 0, 1.2); }
      this.emit({ k: 'roarFx', x: this.x });
    } else if (st.form === 'charge') {
      const from = this.x; this.x = Math.min(this.len - 20, this.x + 125);
      for (const b of this.buildings) if (b.x >= from - b.w / 2 && b.x <= this.x + b.w / 2 && b.layer !== 'back') hurtB(b, pow * 3.0);
      for (const u of this.units) if (u.alive && u.x >= from && u.x <= this.x + 10) this.dmgUnit(u, pow * 2.6);
      this.emit({ k: 'chargeFx', from, to: this.x });
    }
  }
  retreat() { if (!this.done) this.finish('retreat'); }
  finish(reason) {
    if (this.done) return;
    const rate = this.destrRate();
    const xp = Math.round(40 * this.region.D + this.score.dead * 0.4 + this.score.soldiers * 6 + (rate >= REGION_TARGET ? 60 * this.region.D : 0));
    this.done = { reason, destr: rate, fallen: rate >= REGION_TARGET, bld: this.score.bld, val: this.score.val, dead: this.score.dead, soldiers: this.score.soldiers, xp, time: this.t };
    this.emit({ k: 'end', reason });
  }
  /* ---------- 軍勢 ---------- */
  spawnUnit(type, x, opts = {}) {
    const U = UNITS[type]; if (!U) return null;
    const boss = !!opts.boss;
    const hpK = boss ? (1 + 0.25 * (this.region.D - 1)) * (1 + 0.5 * this.cycle) : (1 + 0.15 * this.cycle);
    const u = {
      type, U, x, alt: opts.alt != null ? opts.alt : U.kind === 'air' ? rand(22, 40) : U.kind === 'jet' ? rand(80, 120) : U.kind === 'bomber' ? rand(90, 130) : 0,
      hp: (U.hp || 30) * hpK, max: (U.hp || 30) * hpK, cd: rand(0.3, Math.max(0.4, U.cd || 2)),
      alive: true, boss, stun: 0, t: 0, warned: false, targetX: 0,
    };
    this.units.push(u);
    return u;
  }
  spawnWaves(dt) {
    for (const w of this.waves) {
      if (this.t < (w.at || 0)) continue;
      if (w.spawned >= (w.max || 999)) continue;
      w.next -= dt;
      if (w.next > 0) continue;
      w.next = (w.every || 20) * 0.7;
      const U = UNITS[w.u]; if (!U) continue;
      for (let i = 0; i < (w.n || 1); i++) {
        if (w.spawned >= (w.max || 999)) break;
        w.spawned++;
        if (U.kind === 'off' || U.kind === 'orbital') this.spawnUnit(w.u, this.x + 9999, {});
        else if (U.kind === 'jet' || U.kind === 'bomber') { const u = this.spawnUnit(w.u, this.x + 620 + i * 60, {}); if (u && w.u === 'jet') this.caption(CAPTIONS.jets, 'jets' + this.t.toFixed(0)); if (u && w.u === 'bomber') this.caption(CAPTIONS.bomber, 'bomber' + this.t.toFixed(0)); }
        else this.spawnUnit(w.u, this.x + rand(200, 330) + i * 14, {});
      }
    }
    // ボス
    const rb = this.region.boss;
    if (rb && !this.bossSpawned && this.t >= (rb.at || 20)) {
      this.bossSpawned = true;
      const U = UNITS[rb.u];
      const bx = rb.pos != null ? rb.pos * this.len : this.x + 360;
      const u = this.spawnUnit(rb.u, Math.max(bx, this.x + 200), { boss: true });
      if (u) { this.boss = u; const capKey = rb.u === 'railgun' ? 'railgun' : rb.u === 'kishin' ? 'kishin' : 'hero'; if (CAPTIONS[capKey]) this.caption(CAPTIONS[capKey], capKey); }
    }
  }
  unitShoot(u) {
    const U = u.U, dmg = (U.dmg || 1) * this.dm * this.unitMul * (this.blackout ? 0.6 : 1);
    if (U.kind === 'off' || U.kind === 'orbital') {
      if (U.kind === 'orbital') {
        u.targetX = this.x; u.warned = true; u.warnT = 2.2;
        this.caption(CAPTIONS.orbital, 'orbital' + this.t.toFixed(0));
        this.emit({ k: 'orbitalWarn', x: this.x });
        return;
      }
      // オフスクリーン砲撃：弧を描く弾が落ちてくる
      this.projs.push({ x: this.x + rand(-30, 60), y: 320, vx: rand(-6, 6), vy: -40, g: -60, dmg: dmg * 1.4, kind: U.proj || 'shell', fromOff: true });
      this.emit({ k: 'offShot', x: this.x });
      return;
    }
    if (U.inst) { // ヒットスキャン（曳光弾・ビーム）
      this.hurtBeast(dmg, 'proj');
      this.emit({ k: 'tracer', x: u.x, y: u.alt || 4, tx: this.x, ty: this.st.height * 0.55, beam: !!U.beam });
      return;
    }
    const ty = this.st.height * 0.55, sx = u.x, sy = u.alt || 4;
    const dist = Math.max(30, Math.hypot(this.x - sx, ty - sy));
    const spd = U.pv || 160;
    // y は「高さ（m、上が正）」で保持する
    const p = { x: sx, y: sy, vx: (this.x - sx) / dist * spd, vy: (ty - sy) / dist * spd, dmg, kind: U.proj || 'arrow', g: 0 };
    if (U.proj === 'stone' || U.proj === 'ashell' || U.proj === 'nshell') p.g = -26;
    this.projs.push(p);
  }
  stepUnits(dt) {
    const st = this.st;
    for (const u of this.units) {
      if (!u.alive) continue;
      u.t += dt;
      if (u.stun > 0) { u.stun -= dt; continue; }
      const U = u.U, dx = this.x - u.x, dist = Math.abs(dx);
      // 軌道兵器の着弾
      if (U.kind === 'orbital') {
        if (u.warned) { u.warnT -= dt; if (u.warnT <= 0) { u.warned = false; this.emit({ k: 'orbitalFire', x: u.targetX }); if (Math.abs(this.x - u.targetX) < 46) this.hurtBeast((U.dmg || 300) * this.dm * this.unitMul * 0.35, 'proj'); } }
        u.cd -= dt; if (u.cd <= 0) { u.cd = U.cd || 20; this.unitShoot(u); }
        continue;
      }
      if (U.kind === 'off') { u.cd -= dt; if (u.cd <= 0) { u.cd = U.cd || 6; this.unitShoot(u); } continue; }
      if (U.kind === 'jet') {
        u.x -= (U.spd || 200) * 0.55 * dt;
        if (!u.shot && u.x < this.x + 60 && u.x > this.x - 80) { u.shot = true; this.projs.push({ x: u.x, y: u.alt, vx: -40, vy: -55, g: -30, dmg: (U.dmg || 10) * this.dm * this.unitMul, kind: 'missile' }); }
        if (u.x < this.x - 700) u.alive = false;
        continue;
      }
      if (U.kind === 'bomber') {
        u.x -= (U.spd || 110) * 0.55 * dt;
        if (!u.shot && Math.abs(u.x - this.x) < 30) { u.shot = true; for (let i = -1; i <= 1; i++) this.projs.push({ x: u.x + i * 18, y: u.alt, vx: -18, vy: -12, g: -55, dmg: (U.dmg || 26) * this.dm * this.unitMul, kind: 'bomb' }); }
        if (u.x < this.x - 700) u.alive = false;
        continue;
      }
      const range = U.melee ? (U.range || 9) + st.len * 0.3 : u.boss ? Math.min(U.range || 400, 1100) : Math.min(U.range || 200, 190);
      if (U.kind === 'air') {
        // 空中：巨獣の頭上付近を旋回しながら撃つ
        const tx = this.x + 26, ty = clamp(st.height * 0.95, 18, 46);
        u.x += clamp(tx - u.x, -1, 1) * (U.spd || 26) * 0.7 * dt;
        u.alt += clamp(ty - u.alt, -1, 1) * 10 * dt;
      } else if (dist > range) {
        u.x += Math.sign(dx) * (U.spd || 5) * 1.9 * (u.boss ? 1.5 : 1) * dt;
      }
      u.cd -= dt;
      if (u.cd <= 0 && dist <= range + 6) {
        u.cd = U.cd || 2;
        if (U.melee) { this.hurtBeast((U.dmg || 1) * this.dm * this.unitMul, 'melee'); this.emit({ k: 'meleeHit', x: u.x }); }
        else this.unitShoot(u);
      }
      if (U.kind === 'ground' && !u.boss && (U.spd || 0) > 0 && dx > 70) { u.repos = (u.repos || 0) + 1; if (u.repos > 4) { u.alive = false; continue; } u.x = this.x + rand(220, 340); }
      // 巨獣に近すぎる地上ユニットは踏まれる
      if (U.kind === 'ground' && dist < st.len * 0.32 && (U.hp || 99) <= 100 && !u.boss) { this.dmgUnit(u, st.atk * 0.9 * dt * 3); }
    }
    this.units = this.units.filter((u) => u.alive || u === this.boss);
    if (this.boss && !this.boss.alive) this.boss = null;
  }
  stepProjs(dt) {
    const st = this.st;
    for (const p of this.projs) {
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; p.vy += (p.g || 0) * dt;
      const dx = p.x - this.x, dy = p.y - st.height * 0.55;
      if (Math.abs(dx) < st.len * 0.34 && p.y > 0 && p.y < st.height * 1.05 && Math.abs(dy) < st.height * 0.55) {
        p.hit = true; this.hurtBeast(p.dmg, 'proj'); this.emit({ k: 'projHit', x: p.x, y: p.y, kind: p.kind });
      }
      if (p.y < -4 || p.x < this.x - 800 || p.x > this.x + 900) {
        if (p.y < -4 && !p.hit && (p.kind === 'bomb' || p.fromOff)) { this.emit({ k: 'boom', x: p.x, size: 22, elem: 'shock' }); if (Math.abs(p.x - this.x) < 30) this.hurtBeast(p.dmg * 0.6, 'expl'); }
        p.hit = true;
      }
    }
    this.projs = this.projs.filter((p) => !p.hit);
  }
  /* ---------- 本体 ---------- */
  step(dt) {
    if (this.done) { this.endT += dt; return; }
    this.t += dt;
    this.atkCd = Math.max(0, this.atkCd - dt);
    if (this.atkT >= 0) { this.atkT += dt / 0.45; if (this.atkT >= 1) this.atkT = -1; }
    if (this.specT >= 0) { this.specT += dt; if (this.specT > 1.1) { this.specT = -1; this.specForm = null; } }
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.gauge = clamp(this.gauge + dt * 1.1, 0, 100);
    if (this.st.reg > 0) this.hp = Math.min(this.max, this.hp + this.st.reg * dt);
    // 背の能力：噴火・瘴気
    if (this.st.abil === 'eruption') { this.eruptCd = (this.eruptCd == null ? 5 : this.eruptCd) - dt; if (this.eruptCd <= 0) { this.eruptCd = 9; const x = this.x + rand(30, 120); this.emit({ k: 'boom', x, size: 30, elem: 'fire' }); for (const b of this.buildings) if (Math.abs(b.x - x) < 34) this.dmgBuilding(b, this.st.pow * 0.5 * this.elemMul); } }
    if (this.st.abil === 'aura') { this.auraCd = (this.auraCd == null ? 1 : this.auraCd) - dt; if (this.auraCd <= 0) { this.auraCd = 1; for (const u of this.units) if (u.alive && Math.abs(u.x - this.x) < 46) this.dmgUnit(u, this.st.pow * 0.1); } }
    // 前進（建物に重なると減速し、踏み潰す）
    let contact = null;
    for (const b of this.buildings) {
      if (b.layer === 'back' || b.state === 2) continue;
      if (Math.abs(b.x - this.x) < (b.w / 2 + this.st.len * 0.3)) { contact = b; break; }
    }
    const spd = clamp(this.st.spd, 3, 14) * 1.95 * this.speedMul * (contact ? 0.45 : 1) * (this.specT >= 0 && this.specForm !== 'charge' ? 0.25 : 1);
    this.x += spd * dt;
    this.walkDx = spd * dt;
    if (contact) {
      this.stepSndT = (this.stepSndT || 0) - dt;
      this.dmgBuilding(contact, this.st.atk * 1.1 * dt * this.elemMul);
      if (this.stepSndT <= 0) { this.stepSndT = 0.5; this.emit({ k: 'trample', x: contact.x }); }
    }
    // 延焼・自己修復
    const spread = this.world.spread || 0, repair = this.world.repair || 0;
    for (const b of this.buildings) {
      if (b.state === 2) continue;
      if (b.fire > 0) {
        b.fire -= dt; b.fireT = (b.fireT || 0) + dt;
        this.dmgBuilding(b, b.max * 0.03 * dt, { noShield: true });
        if (b.fireT > 1) { b.fireT = 0; if (spread > 0) for (const n of this.buildings) if (n !== b && n.state === 0 && Math.abs(n.x - b.x) < 16 && chance(spread * 6)) { n.state = 1; n.fire = rand(4, 8); this.emit({ k: 'ruin', x: n.x, size: n.w }); } }
        if (b.fire <= 0 && b.state !== 2) b.fire = 0;
      } else if (repair > 0 && b.state === 1) {
        b.hp = Math.min(b.max * 0.99, b.hp + b.max * repair * dt);
        if (b.hp > b.max * 0.6) b.state = 0;
      }
    }
    this.spawnWaves(dt);
    this.stepUnits(dt);
    this.stepProjs(dt);
    if (this.x >= this.len - 15) this.finish(this.destrRate() >= REGION_TARGET ? 'clear' : 'passed');
  }
  result() { return this.done; }
}

/* ---------- Raid の描画（Canvas 2D） ---------- */
class RaidView {
  constructor(canvas, sim, opts = {}) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.sim = sim;
    this.V = BeastArt.visOf(sim.beast);
    this.A = BeastArt.anim();
    this.buf = makeCanvas(8, 8);
    this.ps = new FX.PS(900);
    this.nums = [];
    this.time = 0; this.shake = 0; this.flash = 0; this.flashC = '#fff';
    this.sound = opts.sound || null;
    this.onCaption = opts.onCaption || null;
    this.lastSnd = {};
    this.dpr = Math.min(1.6, window.devicePixelRatio || 1);
    FX.init();
    this.cam = { x: 0, s: 2, gy: 0, W: 0, H: 0 };
    this.sprCache = new Map();
    const kind = sim.world.kind;
    this.stripFar = CityArt.strip(kind, 0, 720, 220, hashStr(sim.region.id + 'f'));
    this.stripNear = CityArt.strip(kind, 1, 720, 170, hashStr(sim.region.id + 'n'));
    this.stars = [];
    const r = mulberry32(hashStr(sim.region.id));
    for (let i = 0; i < 90; i++) this.stars.push([r(), r() * 0.5, r() * 0.8 + 0.2]);
    this.resize();
  }
  resize() {
    const w = this.c.clientWidth || 360, h = this.c.clientHeight || 640;
    this.c.width = Math.round(w * this.dpr); this.c.height = Math.round(h * this.dpr);
    this.cam.W = this.c.width; this.cam.H = this.c.height;
    this.cam.gy = this.c.height * (this.c.width > this.c.height ? 0.82 : 0.8);
    const st = this.sim.st;
    this.cam.s = Math.max((this.cam.H * 0.40) / st.height, this.cam.W / 320);
  }
  play(n, o) {
    if (!this.sound) return;
    const last = this.lastSnd[n] || -9;
    if (this.time - last < 0.08) return;
    this.lastSnd[n] = this.time;
    try { this.sound.play(n, o); } catch (e) { /* 音は任意 */ }
  }
  spriteFor(b, layer) {
    // 寸法を粗く量子化してスプライトのバリエーション数を抑える（見た目の誤差は数m以内）
    const qw = Math.max(4, Math.round(b.w / 6) * 6), qh = Math.max(4, Math.round(b.h / 6) * 6);
    const key = [b.t, qw, qh, b.seed % 3, layer].join('|');
    let s = this.sprCache.get(key);
    if (s) return s;
    const bb = { t: b.t, w: qw, h: qh, seed: 1000 + (b.seed % 3) * 7919 + qw * 13 + qh * 7 };
    s = CityArt.sprites(bb, layer === 'back' ? 1.1 : layer === 'front' ? 2.0 : 1.6);
    s.bw = qw; s.bh = qh;
    if (this.sprCache.size > 90) this.sprCache.clear();
    this.sprCache.set(key, s);
    return s;
  }
  handle(e) {
    const cam = this.cam;
    switch (e.k) {
      case 'caption': if (this.onCaption) this.onCaption(e.text); break;
      case 'swipe': this.play(e.hit ? 'slash' : 'wing'); if (e.hit) this.shake = Math.min(1, this.shake + 0.3); break;
      case 'trample': this.play('smash'); for (let i = 0; i < 4; i++) this.ps.add({ sp: 'dust', x: e.x + rand(-8, 8), y: -2, vx: rand(-10, 10), vy: rand(-8, -2), size: 6, grow: 7, max: 1, a0: 0.7 }); break;
      case 'ruin': this.play('crack'); break;
      case 'collapse': this.play('collapse', { size: e.size }); this.shake = Math.min(1, this.shake + 0.45); for (let i = 0; i < 16; i++) this.ps.add({ sp: 'dust', x: e.x + rand(-14, 14), y: -rand(0, 8), vx: rand(-16, 16), vy: rand(-10, 0), size: 8, grow: 10, max: 1.8, a0: 0.75 }); for (let i = 0; i < 8; i++) this.ps.add({ sp: 'smoke', x: e.x + rand(-10, 10), y: -rand(2, 14), vy: -rand(3, 8), size: 9, grow: 8, max: 3, a0: 0.5 }); break;
      case 'boom': this.play('boom', { size: e.size }); this.shake = Math.min(1, this.shake + 0.5); this.flash = Math.max(this.flash, 0.25); this.flashC = ELEM[e.elem] ? ELEM[e.elem].glow : '#ffc06a'; for (let i = 0; i < 18; i++) this.ps.add({ fire: true, x: e.x + rand(-8, 8), y: -rand(0, 10), vx: rand(-24, 24), vy: rand(-26, -4), g: 20, size: 6, grow: 4, max: 0.9, add: true }); for (let i = 0; i < 10; i++) this.ps.add({ sp: 'smoke', x: e.x + rand(-8, 8), y: -rand(4, 18), vy: -rand(4, 10), size: 8, grow: 9, max: 2.6, a0: 0.55 }); break;
      case 'special': this.play('roar', { big: true }); if (e.form === 'stream' || e.form === 'beam') this.play('breath', { elem: e.elem, dur: 2 }); this.flash = 0.3; this.flashC = ELEM[e.elem].glow; break;
      case 'roarFx': this.ps.add({ k: 'ring', x: e.x, y: -this.sim.st.height * 0.55, r0: 6, vr: 240, lw: 2.4, c: 'rgba(255,255,255,0.6)', max: 0.8, a0: 0.9 }); this.shake = 1; break;
      case 'chargeFx': for (let i = 0; i < 22; i++) this.ps.add({ sp: 'dust', x: lerp(e.from, e.to, Math.random()), y: -2, vx: rand(-8, 8), vy: rand(-12, -2), size: 7, grow: 8, max: 1.2, a0: 0.7 }); break;
      case 'bolt': this.ps.add({ k: 'bolt', pts: FX.boltPts(e.x + rand(-6, 6), -320, e.x, -(e.y || 6), 9, 0.15), c: '#56c8ff', max: 0.25, a0: 1, add: true }); this.play('thunder'); break;
      case 'tracer': this.ps.add({ k: 'l', x: e.x, y: -(e.y || 4), vx: (e.tx - e.x) * 6, vy: -(e.ty - (e.y || 4)) * 6, c: e.beam ? '#7dfcff' : '#ffd27a', lw: 0.3, tl: 0.05, max: 0.16, add: true }); this.play(e.beam ? 'laser' : 'shot'); break;
      case 'projHit': for (let i = 0; i < 5; i++) this.ps.add({ sp: 'dust', x: e.x, y: -e.y, vx: rand(-14, 14), vy: rand(-10, 4), size: 4, grow: 5, max: 0.7, a0: 0.7 }); this.play('smash'); break;
      case 'meleeHit': this.play('smash'); break;
      case 'offShot': this.play('boom', { size: 20 }); break;
      case 'orbitalWarn': this.play('alarm'); break;
      case 'orbitalFire': this.flash = 0.5; this.flashC = '#bfe8ff'; this.shake = 1; this.play('boom', { size: 80 }); this.ps.add({ k: 'l', x: e.x, y: -340, vx: 0, vy: 300, c: '#dff4ff', lw: 2.4, tl: 0.9, max: 0.3, add: true }); break;
      case 'shieldHit': this.ps.add({ sp: 'c_thunder', x: e.x, y: -(e.y || 10), size: 16, grow: 6, max: 0.3, add: true }); this.play('shield'); break;
      case 'unitDown': for (let i = 0; i < 8; i++) this.ps.add({ fire: true, x: e.x, y: -(e.y || 2), vx: rand(-16, 16), vy: rand(-16, 0), size: 4, grow: 3, max: 0.7, add: true }); this.play('boom', { size: 18 }); break;
      case 'dodge': this.nums.push({ x: this.sim.x, y: -this.sim.st.height, t: 0, text: 'かわした' }); break;
      case 'end': this.play('roar', { big: true }); break;
      default: break;
    }
  }
  update(dt) {
    const sim = this.sim;
    this.time += dt;
    for (const e of sim.ev) this.handle(e);
    sim.ev.length = 0;
    const A = this.A;
    A.t += dt;
    A.walk += (sim.walkDx || 0) / this.V.sizeF / 7;
    A.move = lerp(A.move, sim.done ? 0 : 1, Math.min(1, dt * 5));
    A.atk = sim.atkT;
    A.mouth = lerp(A.mouth, sim.specT >= 0 && sim.specForm !== 'charge' ? 1 : 0, Math.min(1, dt * 8));
    A.charge = lerp(A.charge, sim.specT >= 0 ? 1 : 0, Math.min(1, dt * 5));
    A.roar = lerp(A.roar, sim.specForm === 'roar' && sim.specT >= 0 ? 1 : 0, Math.min(1, dt * 6));
    A.lean = sim.specForm === 'charge' && sim.specT >= 0 ? 0.3 : 0;
    if (sim.done && sim.done.reason === 'dead') A.dead = Math.min(1, sim.endT / 2);
    // 燃える建物の粒子
    const cam = this.cam, viewM = cam.W / cam.s;
    for (const b of sim.buildings) {
      if (b.fire > 0 && b.state !== 2 && Math.abs(b.x - sim.x) < viewM && Math.random() < dt * 8) {
        this.ps.add({ fire: true, x: b.x + rand(-b.w / 3, b.w / 3), y: -b.h * rand(0.4, 0.95), vx: rand(-2, 2), vy: -rand(6, 14), size: 4, grow: 3, max: 0.9, add: true });
        if (Math.random() < 0.4) this.ps.add({ sp: 'smoke', x: b.x, y: -b.h, vy: -rand(4, 9), size: 7, grow: 7, max: 2.6, a0: 0.5 });
      }
    }
    if (sim.specT >= 0 && (sim.specForm === 'stream')) {
      const st = sim.st;
      for (let k = 0; k < Math.round(dt * 90); k++) this.ps.add({ fire: st.elem === 'fire', sp: 'g_' + st.elem, x: sim.x + st.len * 0.42, y: -st.height * 0.72, vx: rand(130, 190), vy: rand(-14, 14), drag: 1.1, size: 3, grow: 15, max: rand(0.35, 0.55), add: true });
    }
    this.ps.update(dt);
    for (const n of this.nums) n.t += dt;
    this.nums = this.nums.filter((n) => n.t < 1.1);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const target = sim.x - viewM * 0.32;
    cam.x += (target - cam.x) * Math.min(1, dt * 4 + 0.2);
    if (Math.abs(target - cam.x) > viewM) cam.x = target;
  }
  drawBuilding(g, b, layer, gyOff, scaleK, dark) {
    const cam = this.cam, cs = cam.s * scaleK, gy = cam.gy + gyOff;
    const spr = this.spriteFor(b, layer);
    const sx = (b.x - cam.x) * cam.s - (b.w / 2) * cs;
    if (sx > cam.W + 260 || sx + b.w * cs < -260) return;
    const img = b.state === 2 ? spr.rubble : b.state === 1 ? spr.ruin : spr.intact;
    const k = cs / spr.s;
    const cxPx = (b.x - cam.x) * cam.s;
    if (b.state === 2) {
      const dw = img.width * k, dh = img.height * k;
      const dx = cxPx - (spr.rw / 2) * cs - spr.pad * cs;
      const dy = gy - (spr.rh + 1) * cs;
      if (dark) { g.save(); try { g.filter = 'brightness(0.6)'; } catch (e) { /* 非対応 */ } g.drawImage(img, dx, dy, dw, dh); g.restore(); }
      else g.drawImage(img, dx, dy, dw, dh);
      return;
    }
    const dw = img.width * k, dh = img.height * k;
    const dx = cxPx - (spr.bw / 2) * cs - spr.pad * cs;
    const dy = gy - (spr.bh + spr.top) * cs;
    if (dark) { g.save(); try { g.filter = 'brightness(0.62)'; } catch (e) { /* 非対応 */ } g.drawImage(img, dx, dy, dw, dh); g.restore(); }
    else g.drawImage(img, dx, dy, dw, dh);
    if (b.fire > 0) { g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(sx + b.w * cs / 2, gy - b.h * cs * 0.5, 0, sx + b.w * cs / 2, gy - b.h * cs * 0.5, b.w * cs * 0.7); gr.addColorStop(0, 'rgba(255,130,40,0.32)'); gr.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gr; g.fillRect(sx - b.w * cs * 0.3, gy - b.h * cs * 1.2, b.w * cs * 1.6, b.h * cs * 1.2); g.globalCompositeOperation = 'source-over'; }
    if (layer === 'mid' && b.state === 1) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `${Math.max(9, 3 * cs)}px sans-serif`; }
  }
  drawUnit(g, u) {
    const cam = this.cam, s = cam.s, sim = this.sim;
    const x = (u.x - cam.x) * s, gy = cam.gy;
    const U = u.U, kind = sim.world.kind;
    const air = U.kind === 'air' || U.kind === 'jet' || U.kind === 'bomber';
    const y = gy - (u.alt || 0) * s;
    if (x < -80 || x > cam.W + 80) return;
    g.save();
    g.translate(x, air ? y : gy);
    const flip = u.x > sim.x ? -1 : 1;
    g.scale(flip * s, s);
    g.lineWidth = 0.35;
    const armor = kind === 'future' ? '#3a5a78' : kind === 'modern' ? '#4a4d3a' : '#555a60';
    const accent = kind === 'future' ? '#45e6ff' : '#c9a85a';
    if (u.type === 'tank') {
      g.fillStyle = '#2e3324'; g.fillRect(-5, -2.2, 10, 2.2);
      g.fillStyle = '#222'; g.fillRect(-5.4, -1.1, 10.8, 1.1);
      g.fillStyle = armor; g.fillRect(-2.6, -3.8, 5, 1.8);
      g.strokeStyle = '#1c1e18'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(0.8, -3.2); g.lineTo(5.6, -3.2); g.stroke();
    } else if (u.type === 'heli') {
      g.fillStyle = armor; g.beginPath(); g.ellipse(0, 0, 5, 1.9, 0, 0, TAU); g.fill();
      g.fillRect(3.5, -0.5, 5.5, 0.9);
      g.strokeStyle = '#cfd6dd'; g.lineWidth = 0.3; const rot = Math.sin(this.time * 40) * 0.4; g.beginPath(); g.moveTo(-6, -2.6); g.lineTo(6, -2.6 + rot); g.stroke();
      g.fillStyle = accent; g.fillRect(-1, -0.4, 1.4, 0.8);
    } else if (u.type === 'jet' || u.type === 'bomber') {
      const L = u.type === 'jet' ? 7 : 11;
      g.fillStyle = u.type === 'jet' ? '#6a7076' : '#3f4448';
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(-2, -1.6); g.lineTo(L * 0.7, -0.6); g.lineTo(L, 0); g.lineTo(L * 0.7, 0.6); g.lineTo(-2, 1.6); g.closePath(); g.fill();
      g.fillStyle = accent; g.fillRect(L * 0.3, -0.35, 1.6, 0.7);
    } else if (u.type === 'drone') {
      g.strokeStyle = accent; g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(-2.4, -2.4); g.lineTo(2.4, 2.4); g.moveTo(2.4, -2.4); g.lineTo(-2.4, 2.4); g.stroke();
      g.fillStyle = '#222a33'; g.fillRect(-1.1, -1.1, 2.2, 2.2);
      g.fillStyle = '#ff4a5a'; g.fillRect(-0.3, -0.3, 0.6, 0.6);
    } else if (u.type === 'mech' || u.type === 'kishin') {
      const H = u.type === 'kishin' ? 46 : 19, Wd = H * 0.34;
      g.fillStyle = u.type === 'kishin' ? '#232833' : '#2c3644';
      g.fillRect(-Wd * 0.32, -H * 0.52, Wd * 0.64, H * 0.52); // 脚
      g.fillRect(-Wd / 2, -H, Wd, H * 0.52);                    // 胴
      g.fillRect(-Wd * 0.85, -H * 0.92, Wd * 0.26, H * 0.5); g.fillRect(Wd * 0.59, -H * 0.92, Wd * 0.26, H * 0.5); // 腕
      g.fillRect(-Wd * 0.2, -H - H * 0.16, Wd * 0.4, H * 0.16); // 頭
      g.fillStyle = u.type === 'kishin' ? '#ff3040' : accent; g.fillRect(-Wd * 0.12, -H - H * 0.1, Wd * 0.24, H * 0.035);
      g.strokeStyle = accent; g.lineWidth = 0.4; g.beginPath(); g.moveTo(Wd * 0.7, -H * 0.7); g.lineTo(Wd * 1.25, -H * 0.78); g.stroke();
    } else if (u.type === 'railgun') {
      g.fillStyle = '#26262a'; g.fillRect(-11, -2.4, 22, 2.4);
      g.fillStyle = armor; g.fillRect(-6, -5.4, 10, 3.2);
      g.strokeStyle = '#101216'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(1, -4.6); g.lineTo(13, -5.4); g.stroke();
      g.strokeStyle = accent; g.lineWidth = 0.35; g.beginPath(); g.moveTo(1, -4.6); g.lineTo(13, -5.4); g.stroke();
      if (u.cd < 1.2) { g.fillStyle = 'rgba(120,220,255,0.8)'; g.beginPath(); g.arc(13, -5.4, 0.9 + Math.sin(this.time * 20) * 0.3, 0, TAU); g.fill(); }
    } else if (u.type === 'turret') {
      g.fillStyle = '#1d2733'; g.fillRect(-2.6, -2.2, 5.2, 2.2);
      g.fillStyle = armor; g.fillRect(-1.8, -4, 3.6, 2);
      g.strokeStyle = accent; g.lineWidth = 0.45; g.beginPath(); g.moveTo(0.6, -3.2); g.lineTo(4.6, -3.6); g.stroke();
    } else {
      // 人型（歩兵・弓兵など）
      const hgt = u.type === 'hero' ? 3.4 : 2.1;
      g.strokeStyle = armor; g.lineWidth = 0.5;
      const ph = Math.sin(this.time * 9 + u.x) * 0.4;
      g.beginPath(); g.moveTo(0, -hgt * 0.55); g.lineTo(-0.5 + ph * 0.3, 0); g.moveTo(0, -hgt * 0.55); g.lineTo(0.5 - ph * 0.3, 0); g.stroke();
      g.fillStyle = armor; g.fillRect(-0.45, -hgt * 0.95, 0.9, hgt * 0.45);
      g.fillStyle = '#c8a582'; g.beginPath(); g.arc(0, -hgt * 1.05, 0.32, 0, TAU); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 0.28; g.beginPath(); g.moveTo(0.3, -hgt * 0.8); g.lineTo(1.5, -hgt * 0.55); g.stroke();
      if (u.type === 'hero') { g.strokeStyle = '#ffd77a'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(0.4, -hgt * 0.85); g.lineTo(2.2, -hgt * 0.4); g.stroke(); }
    }
    g.restore();
    // ボスと傷ついたユニットのHP
    if ((u.boss || u.hp < u.max) && U.kind !== 'off' && U.kind !== 'orbital') {
      const wpx = (u.boss ? 90 : 26) * this.dpr * 0.6;
      const bx = x - wpx / 2, by = (air ? y : gy) - (u.boss ? 52 : 12) * s * (u.type === 'kishin' ? 1 : 0.6) - 8;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(bx, by, wpx, 3.5);
      g.fillStyle = u.boss ? '#ff5a4a' : '#9fd0ff'; g.fillRect(bx, by, wpx * clamp(u.hp / u.max, 0, 1), 3.5);
    }
  }
  drawBeast(g) {
    const sim = this.sim, V = this.V, A = this.A, cam = this.cam, s = cam.s, sf = V.sizeF;
    const bnd = BeastArt.bounds(V), m = 30;
    const buf = this.buf;
    const bw = Math.ceil((bnd.x1 - bnd.x0) * sf * s + m * 2), bh = Math.ceil((bnd.y1 - bnd.y0 + 8) * sf * s + m * 2);
    if (buf.width < bw || buf.height < bh) { buf.width = Math.max(buf.width, bw); buf.height = Math.max(buf.height, bh); }
    const bg = buf.getContext('2d');
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, buf.width, buf.height);
    const ox = m - bnd.x0 * sf * s, oy = buf.height - m;
    BeastArt.drawCanon(bg, V, A, ox, oy, s * sf, 1);
    bg.globalCompositeOperation = 'source-atop';
    if (sim.hurtT > 0) { bg.fillStyle = `rgba(255,255,255,${sim.hurtT * 1.4})`; bg.fillRect(0, 0, buf.width, buf.height); }
    if (A.dead > 0.4) { bg.fillStyle = `rgba(8,6,8,${(A.dead - 0.4) * 1.4})`; bg.fillRect(0, 0, buf.width, buf.height); }
    bg.globalCompositeOperation = 'source-over';
    const sx = (sim.x - cam.x) * s, sy = cam.gy;
    g.globalAlpha = 0.5; g.drawImage(FX.S.shadow, sx - sim.st.len * s * 0.55, sy - 3 * s, sim.st.len * s * 1.1, 6 * s);
    g.globalAlpha = 1;
    g.drawImage(buf, sx - ox, sy - oy);
  }
  render() {
    const g = this.g, cam = this.cam, W = cam.W, H = cam.H, s = cam.s, sim = this.sim, kind = sim.world.kind;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sky = CityArt.SKY[kind];
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, sky[0]); gr.addColorStop(0.6, sky[1]); gr.addColorStop(1, sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const [fx, fy, fa] of this.stars) { g.globalAlpha = fa * 0.8; g.fillStyle = '#dfe8ff'; g.fillRect(fx * W, fy * H, 1.6, 1.6); }
    g.globalAlpha = 1;
    const sh = this.shake * this.shake * H * 0.018;
    g.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    // 視差背景
    const drawStrip = (img, par, baseY, hh) => {
      const tw = img.width * (hh / img.height);
      let off = -((cam.x * s * par) % tw); if (off > 0) off -= tw;
      for (let x = off; x < W; x += tw) g.drawImage(img, x, baseY - hh, tw, hh);
    };
    drawStrip(this.stripFar, 0.18, cam.gy - H * 0.05, H * 0.52);
    drawStrip(this.stripNear, 0.42, cam.gy + H * 0.015, H * 0.36);
    // 地面
    const gg = g.createLinearGradient(0, cam.gy, 0, H);
    const ground = CityArt.GROUND[kind];
    gg.addColorStop(0, ground[0]); gg.addColorStop(1, ground[1]);
    g.fillStyle = gg; g.fillRect(0, cam.gy, W, H - cam.gy);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, cam.gy, W, 1.5);
    // 背後の建物
    for (const b of sim.buildings) if (b.layer === 'back') this.drawBuilding(g, b, 'back', -H * 0.055, 0.62, true);
    // シールド
    for (const p of sim.buildings) {
      if (!p.shieldSelf || p.state === 2 || (p.shieldHp || 0) <= 0) continue;
      const S = BLD[p.t].shield; if (!S) continue;
      const x = (p.x - cam.x) * s;
      g.strokeStyle = 'rgba(90,220,255,0.4)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, cam.gy, S.r * s, S.r * s * 0.72, 0, Math.PI, TAU); g.stroke();
    }
    // 軌道兵器の照準
    for (const u of sim.units) if (u.alive && u.warned) {
      const x = (u.targetX - cam.x) * s;
      g.strokeStyle = `rgba(255,80,80,${0.5 + Math.sin(this.time * 10) * 0.3})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, cam.gy + 3, 46 * s, 8 * s, 0, 0, TAU); g.stroke();
    }
    // 街道の進捗マーカー（終端）
    {
      const ex = (sim.len - cam.x) * s;
      if (ex < W + 100) { g.fillStyle = 'rgba(255,210,140,0.75)'; g.fillRect(ex, cam.gy - H * 0.3, 2, H * 0.3); g.font = `${Math.round(12 * this.dpr)}px sans-serif`; g.fillText('街の果て', ex - 20 * this.dpr, cam.gy - H * 0.3 - 6); }
    }
    // mid 建物 → ユニット → 巨獣 → 前景
    for (const b of sim.buildings) if (b.layer === 'mid') this.drawBuilding(g, b, 'mid', 0, 1, false);
    this.ps.draw(g, cam, false);
    for (const u of sim.units) if (u.alive && u.U.kind !== 'off' && u.U.kind !== 'orbital') this.drawUnit(g, u);
    // 必殺（ビーム／吐息）の帯
    if (sim.specT >= 0 && (sim.specForm === 'beam' || sim.specForm === 'stream')) {
      const st = sim.st, x0 = (sim.x + st.len * 0.4 - cam.x) * s, y0 = cam.gy - st.height * 0.72 * s, x1 = Math.min(W, x0 + 270 * s);
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      g.strokeStyle = rgba(ELEM[st.elem].color, 0.25); g.lineWidth = 5 * s; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0 + Math.sin(this.time * 7) * 4 * s); g.stroke();
      g.strokeStyle = rgba(ELEM[st.elem].glow, 0.9); g.lineWidth = 1.6 * s; g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    this.drawBeast(g);
    // 飛翔体
    for (const p of sim.projs) {
      const x = (p.x - cam.x) * s, y = cam.gy - p.y * s;
      if (x < -40 || x > W + 40) continue;
      g.fillStyle = p.kind === 'bomb' ? '#1c1c1e' : p.kind === 'missile' ? '#d8dde2' : '#e8ddc0';
      g.beginPath(); g.arc(x, y, Math.max(1.6, 0.35 * s), 0, TAU); g.fill();
      if (p.kind === 'missile' || p.kind === 'bomb') { g.fillStyle = 'rgba(255,140,50,0.7)'; g.beginPath(); g.arc(x + 3, y + 1, Math.max(1.2, 0.22 * s), 0, TAU); g.fill(); }
    }
    for (const b of sim.buildings) if (b.layer === 'front') this.drawBuilding(g, b, 'front', H * 0.045, 1.16, false);
    this.ps.draw(g, cam, true);
    // 数字・警告
    g.textAlign = 'center';
    for (const n of this.nums) {
      const x = (n.x - cam.x) * s, y = cam.gy + n.y * s - n.t * 34 * this.dpr;
      g.globalAlpha = 1 - n.t / 1.1;
      g.font = `600 ${Math.round(13 * this.dpr)}px "Zen Kaku Gothic New", system-ui, sans-serif`;
      g.lineWidth = 3 * this.dpr; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(n.text, x, y);
      g.fillStyle = '#cfd6e6'; g.fillText(n.text, x, y);
    }
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (sim.blackout) { g.fillStyle = 'rgba(2,4,12,0.34)'; g.fillRect(0, 0, W, H); }
    const vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.32, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (this.flash > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(this.flashC, this.flash * 0.45); g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  }
}

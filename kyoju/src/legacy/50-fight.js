/* ---------- 蠱毒（巨獣同士の戦い） ---------- */
class Fight {
  constructor(a, b, opts = {}) {
    this.lethal = !!opts.lethal;
    this.F = [this.mk(a, -1), this.mk(b, 1)];
    this.t = 0; this.done = false; this.winner = null; this.loser = null; this.ev = [];
  }
  mk(model, side) {
    const st = beastStats(model);
    return {
      model, st, side, x: side * (st.len * 0.5 + 40), dir: -side, hp: st.hp, max: st.hp,
      atkCd: rand(0.4, 1.1), atkT: -1, atkArm: 0, atkDone: false, specCd: rand(3, 5), spec: null, stun: 0, dots: [], hurtT: 0,
      undyingUsed: false, air: 0, aim: 0.08, moving: false, walked: 0, eruptCd: rand(4, 7), auraCd: 1, tailCd: 3, tailT: -1,
    };
  }
  emit(e) { this.ev.push(e); }
  range(c, o) { return c.st.len * 0.42 + o.st.len * 0.42 + c.st.reach * 0.55; }
  hurt(o, dmg, src, kind) {
    if (this.done || dmg <= 0) return;
    if (kind !== 'dot') {
      if (o.st.abil === 'dodge' && Math.random() < 0.12) { this.emit({ k: 'dodge', c: o }); return; }
      if (o.st.abil === 'flight' && Math.random() < 0.06) { this.emit({ k: 'dodge', c: o }); return; }
    }
    let d = dmg;
    if (kind !== 'melee' && kind !== 'dot' && o.st.abil === 'shell') d *= 0.85;
    if (kind === 'melee' && o.st.abil === 'thorns' && src) { const r = d * 0.2; src.hp -= r; this.emit({ k: 'num', c: src, v: r, thorn: true }); }
    if (src && src.st.traits.includes('leech')) src.hp = Math.min(src.max, src.hp + d * 0.03);
    o.hp -= d; o.hurtT = Math.max(o.hurtT, Math.min(0.18, (d / o.max) * 10));
    this.emit({ k: 'num', c: o, v: d, crit: kind === 'special' });
    if (o.hp <= 0 && this.lethal && o.st.traits.includes('undying') && !o.undyingUsed) {
      o.undyingUsed = true; o.hp = o.max * 0.15; this.emit({ k: 'undying', c: o });
    }
  }
  def(o) { return 100 / (100 + o.st.def); }
  step(dt) {
    if (this.done) return;
    this.t += dt;
    for (let i = 0; i < 2; i++) {
      const c = this.F[i], o = this.F[1 - i];
      const st = c.st;
      c.hurtT = Math.max(0, c.hurtT - dt);
      c.hp = Math.min(c.max, c.hp + st.reg * dt);
      for (const d of c.dots) { d.t -= dt; this.hurt(c, d.dps * dt, null, 'dot'); }
      c.dots = c.dots.filter((d) => d.t > 0);
      if (c.stun > 0) { c.stun -= dt; c.moving = false; continue; }
      const dist = Math.abs(o.x - c.x);
      const rng = this.range(c, o);
      c.dir = sign(o.x - c.x);
      // 必殺
      if (!c.spec) {
        c.specCd -= dt * (st.abil === 'fin' ? 1.18 : st.abil === 'crystal' ? 1.11 : 1);
        if (c.specCd <= 0) this.startSpecial(c, o);
      } else this.updateSpecial(c, o, dt);
      // 移動
      const busy = c.spec && ['stream', 'beam', 'roar'].includes(c.spec.form);
      if (!busy && !(c.spec && c.spec.form === 'charge') && dist > rng) {
        const v = st.spd * 1.6 * dt;
        c.x += c.dir * v; c.walked += v; c.moving = true;
      } else c.moving = false;
      // 近接
      if (c.atkT >= 0) {
        c.atkT += dt / 0.6;
        if (!c.atkDone && c.atkT >= 0.5) {
          c.atkDone = true;
          if (Math.abs(o.x - c.x) <= rng + 4) {
            const dmg = st.atk * rand(0.85, 1.15) * this.def(o) * 1.6;
            this.hurt(o, dmg, c, 'melee');
            this.emit({ k: 'hit', c: o, x: (c.x + o.x) / 2 + c.dir * 4 });
          }
        }
        if (c.atkT >= 1) c.atkT = -1;
      } else {
        c.atkCd -= dt * clamp(1 + (st.spd - 6.5) * 0.04, 0.7, 1.6);
        if (c.atkCd <= 0 && dist <= rng + 2 && !busy) { c.atkT = 0; c.atkDone = false; c.atkArm ^= 1; c.atkCd = 1.25; }
      }
      // 尾
      if (c.tailT >= 0) { c.tailT += dt / 0.7; if (c.tailT >= 1) c.tailT = -1; }
      // 背の能力
      if (st.abil === 'eruption') {
        c.eruptCd -= dt;
        if (c.eruptCd <= 0) {
          c.eruptCd = 9;
          this.emit({ k: 'erupt', c, o });
          for (let k = 0; k < 3; k++) this.hurt(o, st.pow * 0.35 * this.def(o), c, 'special');
          o.dots.push({ t: 3, dps: st.pow * 0.05 });
        }
      }
      if (st.abil === 'aura' && dist < rng + 20) {
        c.auraCd -= dt;
        if (c.auraCd <= 0) { c.auraCd = 1; this.hurt(o, st.pow * 0.08, c, 'dot'); this.emit({ k: 'aura', c }); }
      }
    }
    // 位置の重なりを避ける
    const [a, b] = this.F;
    const minGap = (a.st.len + b.st.len) * 0.32;
    if (Math.abs(a.x - b.x) < minGap) { const mid = (a.x + b.x) / 2, s = sign(b.x - a.x) || 1; a.x = mid - (s * minGap) / 2; b.x = mid + (s * minGap) / 2; }
    for (const c of this.F) c.x = clamp(c.x, -170, 170);
    // 決着
    for (let i = 0; i < 2; i++) {
      const c = this.F[i];
      const out = this.lethal ? c.hp <= 0 : c.hp <= c.max * 0.2;
      if (out) { this.finish(1 - i); return; }
    }
    if (this.t > 80) this.finish(this.F[0].hp / this.F[0].max >= this.F[1].hp / this.F[1].max ? 0 : 1);
  }
  finish(wi) {
    this.done = true;
    this.winner = this.F[wi]; this.loser = this.F[1 - wi];
    if (this.lethal) this.loser.hp = 0;
    this.emit({ k: 'end', wi });
  }
  startSpecial(c, o) {
    const st = c.st;
    let pow = st.pow * (st.abil === 'crystal' ? 1.1 : 1);
    const sp = { form: st.form, elem: st.elem, t: 0, tick: 0, pow, n: 0 };
    sp.dur = { stream: 2.2, beam: 1.8, glob: 1.2, bolt: 1.6, roar: 1.4, charge: 1.6 }[st.form];
    sp.charge = 0.7;
    c.spec = sp;
    c.aim = st.form === 'stream' || st.form === 'beam' ? 0.2 : -0.3;
    this.emit({ k: 'special', c, form: st.form, elem: st.elem });
  }
  updateSpecial(c, o, dt) {
    const sp = c.spec, d = this.def(o);
    sp.t += dt; sp.tick -= dt;
    if (sp.form === 'stream') {
      if (sp.t > 0.2 && sp.tick <= 0) { sp.tick = 0.2; this.hurt(o, sp.pow * 0.24 * d * 1.4, c, 'special'); if (sp.elem === 'fire' || sp.elem === 'poison') o.dots.push({ t: 2, dps: sp.pow * 0.02 }); }
    } else if (sp.form === 'beam') {
      sp.active = sp.t > sp.charge && sp.t < sp.dur - 0.1;
      if (sp.active && sp.tick <= 0) { sp.tick = 0.22; this.hurt(o, sp.pow * 0.55 * d * 1.4, c, 'special'); }
    } else if (sp.form === 'glob') {
      if (sp.n < 3 && sp.t > 0.2 + sp.n * 0.2) { sp.n++; this.emit({ k: 'glob', c, o, elem: sp.elem }); this.hurt(o, sp.pow * 0.6 * d * 1.3, c, 'special'); o.dots.push({ t: 4, dps: sp.pow * 0.05 }); }
    } else if (sp.form === 'bolt') {
      if (sp.n < 4 && sp.t > 0.3 + sp.n * 0.25) { sp.n++; this.emit({ k: 'bolt', c: o, elem: sp.elem }); this.hurt(o, sp.pow * 0.55 * d * 1.4, c, 'special'); }
    } else if (sp.form === 'roar') {
      if (!sp.done && sp.t > 0.35) { sp.done = true; this.emit({ k: 'roar', c, elem: sp.elem }); this.hurt(o, sp.pow * 1.6 * d * 1.3, c, 'special'); o.stun = Math.max(o.stun, 0.8); }
    } else if (sp.form === 'charge') {
      if (sp.t > 0.35 && !sp.hitDone) {
        c.x += c.dir * Math.max(c.st.spd * 6, 40) * dt;
        c.moving = true;
        if (Math.abs(o.x - c.x) < this.range(c, o)) {
          sp.hitDone = true;
          this.hurt(o, sp.pow * 1.9 * d * 1.3, c, 'special');
          o.x += c.dir * 28; o.stun = Math.max(o.stun, 0.6);
          this.emit({ k: 'chargeHit', c, o });
        }
      }
    }
    if (sp.t >= sp.dur) { c.spec = null; c.specCd = 8; c.aim = 0.08; }
  }
}

class FightView {
  constructor(canvas, fight, opts = {}) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.f = fight;
    this.V = fight.F.map((c) => BeastArt.visOf(c.model));
    this.A = fight.F.map(() => BeastArt.anim());
    this.bufs = [makeCanvas(8, 8), makeCanvas(8, 8)];
    this.ps = new FX.PS(700);
    this.lines = []; this.nums = [];
    this.time = 0; this.endT = 0; this.shake = 0; this.flash = 0; this.flashC = '#fff';
    this.sound = opts.sound || null;
    this.lastSnd = {};
    this.dpr = Math.min(1.6, window.devicePixelRatio || 1);
    FX.init();
    this.cam = { x: 0, s: 2, gy: 0, W: 0, H: 0 };
    this.resize();
  }
  resize() {
    const w = this.c.clientWidth || 360, h = this.c.clientHeight || 640;
    this.c.width = Math.round(w * this.dpr); this.c.height = Math.round(h * this.dpr);
    this.cam.W = this.c.width; this.cam.H = this.c.height;
    this.cam.gy = this.c.height * (this.c.width > this.c.height ? 0.8 : 0.77);
    const F = this.f.F;
    const maxH = Math.max(F[0].st.height, F[1].st.height), span = F[0].st.len * 0.6 + F[1].st.len * 0.6 + 90;
    this.cam.s = Math.min((this.c.height * 0.42) / maxH, this.c.width / span);
  }
  play(n, o) {
    if (!this.sound) return;
    const last = this.lastSnd[n] || -9;
    if (this.time - last < 0.07) return;
    this.lastSnd[n] = this.time; this.sound.play(n, o);
  }
  mouth(i) {
    const c = this.f.F[i], V = this.V[i], R = BeastArt.rig(V, this.A[i]);
    return [c.x + c.dir * R.mouth[0] * V.sizeF, R.mouth[1] * V.sizeF];
  }
  handle(e) {
    const F = this.f.F;
    const idx = (c) => F.indexOf(c);
    switch (e.k) {
      case 'num': this.nums.push({ x: e.c.x + rand(-6, 6), y: -e.c.st.height * rand(0.7, 1), v: e.v, t: 0, crit: e.crit, thorn: e.thorn }); break;
      case 'hit':
        for (let i = 0; i < 6; i++) this.ps.add({ sp: 'dust', x: e.x, y: -e.c.st.height * 0.5, vx: rand(-14, 14), vy: rand(-12, 4), drag: 1.5, size: 5, grow: 6, max: 1, a0: 0.7 });
        for (let i = 0; i < 8; i++) this.ps.add({ k: 'l', x: e.x, y: -e.c.st.height * 0.5, vx: rand(-40, 40), vy: rand(-40, 10), g: 30, c: '#ffd8a0', lw: 0.25, tl: 0.04, max: 0.4, add: true });
        this.shake = Math.min(1, this.shake + 0.25); this.play('smash');
        break;
      case 'special': this.play('roar', { big: e.form === 'roar' }); if (e.form === 'stream' || e.form === 'beam') this.play('breath', { elem: e.elem, dur: 2 }); break;
      case 'glob': {
        const [mx, my] = this.mouth(idx(e.c));
        for (let i = 0; i < 10; i++) this.ps.add({ sp: 'g_' + e.elem, x: mx, y: my, vx: (e.o.x - mx) * rand(1.2, 1.8), vy: rand(-30, -10), g: 40, size: 5, grow: 3, max: 0.7, add: true });
        this.play('splash', { elem: e.elem });
        break;
      }
      case 'bolt': {
        const c = e.c;
        this.ps.add({ k: 'bolt', pts: FX.boltPts(c.x + rand(-20, 20), -300, c.x, -c.st.height * 0.6, 10, 0.15), c: ELEM[e.elem].color, max: 0.25, a0: 1, add: true });
        this.ps.add({ sp: 'g_' + e.elem, x: c.x, y: -c.st.height * 0.6, size: 40, grow: 20, max: 0.35, add: true });
        this.flash = 0.3; this.flashC = '#d6f2ff'; this.play('thunder');
        break;
      }
      case 'roar': {
        const c = e.c;
        this.ps.add({ k: 'ring', x: c.x, y: -c.st.height * 0.5, r0: 5, vr: 260, lw: 2.2, c: 'rgba(255,255,255,0.6)', max: 0.8, a0: 0.9 });
        this.ps.add({ k: 'ring', x: c.x, y: -1, r0: 5, vr: 260, lw: 3, c: rgba(ELEM[e.elem].color, 0.6), max: 0.8, a0: 0.9, flat: 0.15 });
        this.shake = 1; this.flash = 0.2; this.flashC = ELEM[e.elem].glow;
        break;
      }
      case 'chargeHit': this.shake = 1; for (let i = 0; i < 20; i++) this.ps.add({ sp: 'dust', x: e.o.x, y: -3, vx: rand(-30, 30), vy: rand(-10, 0), size: 8, grow: 8, max: 1.5, a0: 0.7 }); this.play('boom', { size: 60 }); break;
      case 'erupt': {
        const c = e.c;
        for (let i = 0; i < 20; i++) this.ps.add({ fire: true, x: c.x, y: -c.st.height * 0.95, vx: (e.o.x - c.x) * rand(0.5, 1.2), vy: rand(-50, -25), g: 50, size: 5, grow: 2, max: 1.2, add: true });
        this.play('boom', { size: 30 });
        break;
      }
      case 'aura': for (let i = 0; i < 3; i++) this.ps.add({ sp: 'c_poison', x: e.c.x + rand(-30, 30), y: -rand(0, 8), vy: -1, size: 20, grow: 6, max: 2, a0: 0.5, fin: 0.3 }); break;
      case 'dodge': this.nums.push({ x: e.c.x, y: -e.c.st.height, v: 0, t: 0, miss: true }); break;
      case 'undying': this.flash = 0.4; this.flashC = '#ffd77a'; this.nums.push({ x: e.c.x, y: -e.c.st.height * 1.1, v: 0, t: 0, text: '不屈' }); break;
      case 'end': this.endT = 0.001; this.play('roar', { big: true }); if (this.f.lethal) this.play('collapse', { size: 80 }); break;
      default: break;
    }
  }
  update(dt) {
    const f = this.f;
    this.time += dt;
    for (const e of f.ev) this.handle(e);
    f.ev.length = 0;
    for (let i = 0; i < 2; i++) {
      const c = f.F[i], A = this.A[i], V = this.V[i];
      A.t += dt;
      if (!c.px) c.px = c.x;
      const dx = Math.abs(c.x - c.px); c.px = c.x;
      if (c.moving) A.walk += dx / V.sizeF / STRIDE_AMP[c.st.legs];
      A.move = lerp(A.move, c.moving ? 1 : 0, Math.min(1, dt * 6));
      A.atk = c.atkT; A.atkArm = c.atkArm;
      const sp = c.spec;
      A.mouth = lerp(A.mouth, sp && sp.form !== 'charge' ? 1 : 0, Math.min(1, dt * 8));
      A.charge = lerp(A.charge, sp ? 1 : 0, Math.min(1, dt * 5));
      A.aim = lerp(A.aim, c.aim, Math.min(1, dt * 6));
      A.roar = lerp(A.roar, sp && sp.form === 'roar' ? 1 : 0, Math.min(1, dt * 6));
      A.lean = sp && sp.form === 'charge' ? 0.3 : 0;
      if (sp && sp.form === 'stream' && sp.t > 0.2) {
        const [mx, my] = this.mouth(i);
        const o = f.F[1 - i];
        const tx = o.x, ty = -o.st.height * 0.55;
        const ang = Math.atan2(ty - my, tx - mx);
        for (let k = 0; k < Math.round(dt * 120); k++) {
          const spd = rand(140, 200), a = ang + rand(-0.08, 0.08);
          const p = { x: mx, y: my, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, drag: 1.2, size: 3, grow: 18, max: rand(0.4, 0.6), add: true };
          if (sp.elem === 'fire') p.fire = true; else p.sp = 'g_' + sp.elem;
          this.ps.add(p);
        }
      }
      if (sp && sp.form === 'beam' && !sp.active) {
        const [mx, my] = this.mouth(i);
        this.ps.add({ sp: 'g_' + sp.elem, x: mx, y: my, size: 4 + sp.t * 14, max: 0.12, add: true });
      }
      if (sp && sp.form === 'beam' && sp.active) {
        const o = f.F[1 - i];
        if (Math.random() < dt * 30) for (let k = 0; k < 4; k++) this.ps.add({ sp: 'g_' + sp.elem, x: o.x + rand(-5, 5), y: -o.st.height * 0.55 + rand(-5, 5), vx: rand(-30, 30), vy: rand(-30, 10), size: 6, grow: 8, max: 0.5, add: true });
      }
      if (f.done && c === f.loser) {
        A.dead = f.lethal ? Math.min(1, this.endT / 2) : 0;
        if (!f.lethal) A.crouch = Math.min(1, this.endT);
        if (f.lethal && this.endT > 1 && Math.random() < dt * 30) {
          const w = f.winner;
          this.ps.add({ sp: 'c_curse', x: c.x + rand(-10, 10), y: -rand(5, c.st.height * 0.6), vx: (w.x - c.x) * 0.6, vy: rand(-12, -4), size: 10, grow: 4, max: 1.6, a0: 0.8 });
          this.ps.add({ sp: 'smoke', x: c.x + rand(-15, 15), y: -rand(0, 10), vy: -rand(4, 10), size: 8, grow: 6, max: 3, a0: 0.5 });
        }
      }
      if (f.done && c === f.winner) A.roar = lerp(A.roar, this.endT < 2.5 ? 1 : 0, Math.min(1, dt * 4));
    }
    if (f.done) this.endT += dt;
    // 篝火
    for (const bx of [-160, 160]) if (Math.random() < dt * 14) this.ps.add({ sp: 'g_curse', x: bx + rand(-3, 3), y: -14, vx: rand(-2, 2), vy: -rand(10, 20), size: rand(4, 7), grow: 2, max: rand(0.5, 1), add: true });
    if (Math.random() < dt * 3) this.ps.add({ sp: 'fireR', x: rand(-180, 180), y: -rand(120, 200), vx: rand(-2, 2), vy: rand(4, 8), size: 0.8, max: 6, add: true, a0: 0.6 });
    this.ps.update(dt);
    for (const n of this.nums) n.t += dt;
    this.nums = this.nums.filter((n) => n.t < 1.1);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    // カメラ
    const mid = (f.F[0].x + f.F[1].x) / 2;
    const viewW = this.cam.W / this.cam.s;
    this.cam.x += (mid - viewW / 2 - this.cam.x) * Math.min(1, dt * 3);
  }
  render() {
    const g = this.g, cam = this.cam, W = cam.W, H = cam.H, s = cam.s, f = this.f;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sh = this.shake * this.shake * H * 0.02;
    // 壺の内側
    const bg = g.createRadialGradient(W / 2, cam.gy * 0.6, 0, W / 2, cam.gy * 0.6, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#2a1622'); bg.addColorStop(0.6, '#140b12'); bg.addColorStop(1, '#070407');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    const mx = W / 2 - (cam.x + W / s / 2) * s * 0.15;
    g.fillStyle = '#060305';
    g.beginPath(); g.ellipse(mx, H * 0.05, W * 0.38, H * 0.08, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(mx + W * 0.12, H * 0.04, Math.min(W, H) * 0.035, 0, TAU); g.fillStyle = '#8a1c1c'; g.fill();
    g.strokeStyle = 'rgba(179,139,77,0.12)'; g.lineWidth = 2 * this.dpr;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.ellipse(mx, cam.gy, W * (0.3 + i * 0.14), H * (0.15 + i * 0.12), 0, Math.PI, TAU); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5 * this.dpr;
    for (let i = 0; i < 9; i++) { const x = (i / 9) * W + 20; g.beginPath(); g.moveTo(x, H * 0.1); g.lineTo(x + 12, H * 0.25); g.lineTo(x - 6, H * 0.4); g.stroke(); }
    const fg = g.createLinearGradient(0, cam.gy - 10, 0, H);
    fg.addColorStop(0, '#1b1015'); fg.addColorStop(1, '#070406');
    g.fillStyle = fg; g.fillRect(0, cam.gy - 2, W, H);
    const cx = (0 - cam.x) * s;
    g.strokeStyle = `rgba(180,40,50,${0.35 + Math.sin(this.time * 2) * 0.1})`; g.lineWidth = 2 * this.dpr;
    g.beginPath(); g.ellipse(cx, cam.gy + 6 * s, 150 * s, 14 * s, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(cx, cam.gy + 6 * s, 120 * s, 11 * s, 0, 0, TAU); g.stroke();
    g.fillStyle = '#c9bfae';
    for (let i = 0; i < 12; i++) { const x = (-160 + i * 29 - cam.x) * s, y = cam.gy + (4 + (i % 3) * 4) * s; g.globalAlpha = 0.25; g.fillRect(x, y, 6 * s, 1 * s); g.beginPath(); g.arc(x, y + 0.5 * s, 1 * s, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    for (const bx of [-160, 160]) {
      const x = (bx - cam.x) * s;
      g.fillStyle = '#211418'; g.fillRect(x - 3 * s, cam.gy - 12 * s, 6 * s, 12 * s);
      g.fillRect(x - 6 * s, cam.gy - 14 * s, 12 * s, 2.5 * s);
    }
    // 巨獣
    for (let i = 0; i < 2; i++) this.drawBeast(g, i);
    this.ps.draw(g, cam, false);
    this.drawBeams(g);
    this.ps.draw(g, cam, true);
    // 数字
    g.textAlign = 'center';
    for (const n of this.nums) {
      const x = (n.x - cam.x) * s, y = cam.gy + n.y * s - n.t * 40 * this.dpr;
      g.globalAlpha = 1 - n.t / 1.1;
      g.font = `${n.crit ? 800 : 600} ${Math.round((n.crit ? 17 : 13) * this.dpr)}px "Zen Kaku Gothic New", system-ui, sans-serif`;
      const text = n.miss ? 'かわした' : n.text || fmt(n.v);
      g.lineWidth = 3 * this.dpr; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, x, y);
      g.fillStyle = n.text ? '#ffd77a' : n.miss ? '#cfd6e6' : n.thorn ? '#e9dcb8' : n.crit ? '#ffb15a' : '#f2e9da';
      g.fillText(text, x, y);
    }
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (this.flash > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(this.flashC, this.flash * 0.5); g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  }
  drawBeast(g, i) {
    const c = this.f.F[i], V = this.V[i], A = this.A[i], cam = this.cam, s = cam.s, sf = V.sizeF;
    const bnd = BeastArt.bounds(V), m = 30;
    const buf = this.bufs[i];
    const bw = Math.ceil((bnd.x1 - bnd.x0) * sf * s + m * 2), bh = Math.ceil((bnd.y1 - bnd.y0 + 8) * sf * s + m * 2);
    if (buf.width < bw || buf.height < bh) { buf.width = Math.max(buf.width, bw); buf.height = Math.max(buf.height, bh); }
    const bg = buf.getContext('2d');
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, buf.width, buf.height);
    const f = c.dir;
    const ox = f > 0 ? m - bnd.x0 * sf * s : buf.width - m + bnd.x0 * sf * s, oy = buf.height - m;
    BeastArt.drawCanon(bg, V, A, ox, oy, s * sf, f);
    bg.globalCompositeOperation = 'source-atop';
    const rim = bg.createLinearGradient(0, oy, 0, oy - c.st.height * s);
    rim.addColorStop(0, 'rgba(170,40,90,0.3)'); rim.addColorStop(1, 'rgba(90,60,140,0.1)');
    bg.fillStyle = rim; bg.fillRect(0, 0, buf.width, buf.height);
    if (c.hurtT > 0) { bg.fillStyle = `rgba(255,255,255,${c.hurtT * 1.6})`; bg.fillRect(0, 0, buf.width, buf.height); }
    if (A.dead > 0.4) { bg.fillStyle = `rgba(8,6,8,${(A.dead - 0.4) * 1.4})`; bg.fillRect(0, 0, buf.width, buf.height); }
    bg.globalCompositeOperation = 'source-over';
    const sx = (c.x - cam.x) * s, sy = cam.gy;
    g.globalAlpha = 0.5; g.drawImage(FX.S.shadow, sx - c.st.len * s * 0.55, sy - 3 * s, c.st.len * s * 1.1, 6 * s);
    g.globalAlpha = A.dead > 0.8 ? 1 - (A.dead - 0.8) * 4 : 1;
    g.drawImage(buf, sx - ox, sy - oy);
    g.globalAlpha = 1;
  }
  drawBeams(g) {
    const cam = this.cam, s = cam.s;
    for (let i = 0; i < 2; i++) {
      const c = this.f.F[i], sp = c.spec;
      if (!sp || sp.form !== 'beam' || !sp.active) continue;
      const o = this.f.F[1 - i];
      const [mx, my] = this.mouth(i);
      const x0 = (mx - cam.x) * s, y0 = cam.gy + my * s, x1 = (o.x - cam.x) * s, y1 = cam.gy - o.st.height * 0.55 * s;
      const w = (3 + Math.sin(this.time * 40) * 0.5) * s * this.V[i].sizeF;
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      g.strokeStyle = rgba(ELEM[sp.elem].color, 0.25); g.lineWidth = w * 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = rgba(ELEM[sp.elem].color, 0.7); g.lineWidth = w * 1.3; g.stroke();
      g.strokeStyle = rgba(ELEM[sp.elem].glow, 1); g.lineWidth = w * 0.5; g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
  }
}

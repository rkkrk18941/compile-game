/* ---------- 巨獣の描画（部位を組み合わせて一体を描く） ---------- */
const BeastArt = (() => {
  const GHOST = { base: '#3b3437', dark: '#1d191b', light: '#5c5356', belly: '#4b4447', horn: '#625a5c', eye: '#8a8184', glow: '#8a8184', glowLight: '#bbbbbb' };
  GHOST.far = GHOST;
  const palCache = {};
  function palOf(spKey) {
    if (palCache[spKey]) return palCache[spKey];
    const sp = SPECIES[spKey], p = sp.pal, e = ELEM[sp.elem];
    const mk = (amt) => ({
      base: shade(p.base, amt), dark: shade(p.dark, amt), light: shade(p.light, amt), belly: shade(p.belly, amt),
      horn: shade(p.horn, amt), eye: p.eye, glow: e.color, glowLight: e.glow,
    });
    const pal = mk(0);
    pal.far = mk(-0.4);
    return (palCache[spKey] = pal);
  }

  // 脚の型ごとの骨格
  const FR = {
    biped:   { hipH: 19, tilt: -0.5, hipL: (rx, ry) => [-0.3 * rx, 0.8 * ry], neckA: -1.0, bodyX: -2 },
    quad:    { hipH: 15, tilt: -0.07, hipL: (rx, ry) => [-0.55 * rx, 0.66 * ry], neckA: -0.55, bodyX: 0 },
    multi:   { hipH: 12.5, tilt: -0.02, hipL: (rx, ry) => [0, 0.72 * ry], neckA: -0.32, bodyX: 0 },
    serpent: { hipH: 10.5, tilt: -1.05, hipL: (rx, ry) => [-0.72 * rx, 0.6 * ry], neckA: -0.3, bodyX: 7 },
    hop:     { hipH: 8.5, tilt: -0.42, hipL: (rx, ry) => [-0.5 * rx, 0.65 * ry], neckA: -0.6, bodyX: 0 },
  };
  const NECK = { dragon: 10, insect: 2.5, frog: 0.6, ape: 2.4, octo: 2, skull: 5, bird: 8, horn: 3 };
  const MOUTH = { dragon: [17.6, 1.0], insect: [11.8, 2.4], frog: [14.6, 0.9], ape: [12.2, 2.0], octo: [9.6, 1.4], skull: [11.2, 2.6], bird: [15.8, 1.3], horn: [13.6, 2.4] };
  const HEAD_TOP = { dragon: 10, insect: 13, frog: 8, ape: 8, octo: 20, skull: 11, bird: 10, horn: 15 };
  const HEAD_FWD = { dragon: 19, insect: 14, frog: 16, ape: 13, octo: 10, skull: 12, bird: 18, horn: 20 };
  const BACK_UP = { wing: 9, insectwing: 6, shell: 5, fin: 6, crystal: 10, volcano: 8, spine: 9, sac: 5 };
  const TAIL_BACK = { spike: 30, scorpion: 12, club: 28, whip: 34, tentacle: 28, stub: 8 };

  function anim() {
    return { t: 0, walk: 0, move: 0, atk: -1, atkArm: 0, mouth: 0, aim: 0.08, charge: 0, air: 0, fly: 0, flap: 0, crouch: 0, leap: 0, dead: 0, roar: 0, tailSwipe: 0, lean: 0 };
  }

  function visOf(beast, opts = {}) {
    const st = beastStats(beast);
    const P = {};
    for (const s of SLOTS) {
      const part = (opts.override && opts.override[s]) || beast.parts[s];
      const sp = SPECIES[part.sp];
      P[s] = { arch: sp.parts[s], pal: opts.ghost && opts.ghost !== s ? GHOST : palOf(part.sp), elem: sp.elem, seed: hashStr(part.id || s) };
    }
    const hp = (opts.override && opts.override.head) || beast.parts.head;
    return { P, sizeF: opts.override ? 1 : st.sizeF, elem: SPECIES[hp.sp].elem, form: ARCH.head[SPECIES[hp.sp].parts.head].form, ghost: opts.ghost || null };
  }
  function visOfParts(parts, opts = {}) {
    const P = {};
    for (const s of SLOTS) {
      const part = parts[s];
      const sp = SPECIES[part.sp];
      P[s] = { arch: sp.parts[s], pal: opts.ghost && opts.ghost !== s ? GHOST : palOf(part.sp), elem: sp.elem, seed: hashStr(part.id || s) };
    }
    return { P, sizeF: 1, elem: SPECIES[parts.head.sp].elem, form: ARCH.head[SPECIES[parts.head.sp].parts.head].form };
  }

  /* ---------- 骨格 ---------- */
  function rig(V, A) {
    const fr = FR[V.P.legs.arch], bd = ARCH.body[V.P.body.arch];
    const rx = bd.rx, ry = bd.ry;
    let tilt = fr.tilt + Math.sin(A.t * 1.7) * 0.015 - (A.roar || 0) * 0.12 + (A.lean || 0);
    if (V.P.legs.arch === 'hop') tilt -= (A.leap || 0) * 0.25;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const hl = fr.hipL(rx, ry);
    const hry = hl[0] * s + hl[1] * c;
    const bob = -Math.abs(Math.sin(A.walk)) * 0.9 * (A.move || 0);
    const cx = fr.bodyX, cy = -fr.hipH - hry + bob + (A.crouch || 0) * 3 - (A.air || 0);
    const P = (lx, ly) => [cx + lx * c - ly * s, cy + lx * s + ly * c];
    const top = (t) => P(t * rx, -ry * Math.sqrt(Math.max(0, 1 - t * t)) * 0.96);
    const topN = (t) => {
      const a = top(t - 0.03), b = top(t + 0.03);
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      return [dy / d, -dx / d];
    };
    const neck = P(rx * 0.84, -ry * 0.28);
    const na = fr.neckA - (A.roar || 0) * 0.25;
    const nl = NECK[V.P.head.arch];
    const head = [neck[0] + Math.cos(na) * nl, neck[1] + Math.sin(na) * nl];
    const headA = (A.aim || 0) + Math.sin(A.t * 1.3) * 0.03 - (A.roar || 0) * 0.35;
    const m = MOUTH[V.P.head.arch];
    const ca = Math.cos(headA), sa = Math.sin(headA), jaw = (A.mouth || 0) * 2.6;
    return {
      cx, cy, rx, ry, tilt, P, top, topN, neck, na, head, headA,
      shoulder: P(rx * 0.52, ry * 0.42), hipBack: P(hl[0], hl[1]), hipFront: P(rx * 0.55, ry * 0.64), rear: P(-rx * 0.92, -ry * 0.05),
      mouth: [head[0] + m[0] * ca - (m[1] + jaw) * sa, head[1] + m[0] * sa + (m[1] + jaw) * ca],
    };
  }

  /* ---------- 描画の道具 ---------- */
  function lg(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const st of stops) gr.addColorStop(st[0], st[1]);
    return gr;
  }
  function vgrad(g, y0, y1, pal) { return lg(g, 0, y0, 0, y1, [[0, pal.light], [0.5, pal.base], [1, pal.dark]]); }
  function fs(g, fill, stroke, lw) {
    g.fillStyle = fill; g.fill();
    if (stroke) { g.lineWidth = lw || 0.55; g.strokeStyle = stroke; g.stroke(); }
  }
  function glow(g, x, y, r, color, a = 1) {
    const prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(color, a)); gr.addColorStop(0.35, rgba(color, a * 0.45)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.globalCompositeOperation = prev;
  }
  function capsule(g, x1, y1, r1, x2, y2, r2) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.moveTo(x1 + Math.cos(a + Math.PI / 2) * r1, y1 + Math.sin(a + Math.PI / 2) * r1);
    g.arc(x1, y1, r1, a + Math.PI / 2, a + Math.PI * 1.5);
    g.lineTo(x2 + Math.cos(a - Math.PI / 2) * r2, y2 + Math.sin(a - Math.PI / 2) * r2);
    g.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
    g.closePath();
  }
  function tube(g, pts, rads) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const r = rads[i];
      L.push([pts[i][0] - dy * r, pts[i][1] + dx * r]);
      R.push([pts[i][0] + dy * r, pts[i][1] - dx * r]);
    }
    g.beginPath();
    g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
    const e = pts[n - 1], s0 = pts[0];
    const aE = Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]);
    g.arc(e[0], e[1], Math.max(0.05, rads[n - 1]), aE, aE - Math.PI, true);
    for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
    const aS = Math.atan2(R[0][1] - s0[1], R[0][0] - s0[0]);
    g.arc(s0[0], s0[1], Math.max(0.05, rads[0]), aS, aS - Math.PI, true);
    g.closePath();
  }
  function chain(x, y, a0, n, segL, curve) {
    const pts = [[x, y]];
    let a = a0;
    for (let i = 1; i < n; i++) { a += curve(i); x += Math.cos(a) * segL; y += Math.sin(a) * segL; pts.push([x, y]); }
    return pts;
  }
  function radii(n, r0, r1, pow = 1) { const o = []; for (let i = 0; i < n; i++) o.push(lerp(r0, r1, Math.pow(i / (n - 1), pow))); return o; }
  function ik(hx, hy, fx, fy, l1, l2, bend) {
    let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
    const mx = l1 + l2 - 0.05;
    if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; fx = hx + dx; fy = hy + dy; }
    const a = Math.atan2(dy, dx);
    const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 0.01)), -1, 1);
    const ang = a + bend * Math.acos(ca);
    return [hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1, fx, fy];
  }
  function claws(g, x, y, a, n, len, pal, spread = 0.35) {
    g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.3;
    for (let i = 0; i < n; i++) {
      const aa = a + (i - (n - 1) / 2) * spread;
      const pts = chain(x, y, aa, 4, len / 3, () => 0.32);
      tube(g, pts, [0.7, 0.5, 0.3, 0.05]);
      g.fill(); g.stroke();
    }
  }
  function swing(p) {
    if (p < 0 || p >= 1) return 0;
    if (p < 0.35) return -easeOut(p / 0.35) * 1.5;
    if (p < 0.55) return lerp(-1.5, 0.75, easeIn((p - 0.35) / 0.2));
    return lerp(0.75, 0, easeInOut((p - 0.55) / 0.45));
  }

  /* ---------- 脚 ---------- */
  function legsBiped(g, R, pal, A, far) {
    const hip = R.hipBack;
    const hx = hip[0] + (far ? -1.6 : 0), hy = hip[1] - (far ? 0.4 : 0);
    const ph = A.walk + (far ? Math.PI : 0);
    const mv = A.move || 0;
    const fly = A.fly || 0;
    const fx = hx + 3.5 + Math.sin(ph) * 8.5 * mv * (1 - fly) - fly * (far ? 6 : 3);
    const lift = Math.max(0, Math.cos(ph)) * 4 * mv * (1 - fly);
    const gy = -lift - (A.air || 0) - fly * 4;
    const k = ik(hx, hy, fx, gy - 2.4, 11.5, 11, -1);
    g.beginPath(); capsule(g, hx, hy, 6.2, k[0], k[1], 4.2); fs(g, vgrad(g, hy - 6, k[1] + 4, pal), pal.dark);
    g.beginPath(); capsule(g, k[0], k[1], 4.1, k[2], k[3], 2.8); fs(g, vgrad(g, k[1] - 4, k[3] + 3, pal), pal.dark);
    // 足
    const ax = k[2], ay = k[3];
    g.beginPath();
    g.moveTo(ax - 3.2, ay - 0.5); g.quadraticCurveTo(ax - 2.5, ay + 2.6, ax, gy + 0.1);
    g.lineTo(ax + 6.5, gy + 0.1); g.quadraticCurveTo(ax + 6, ay - 0.5, ax + 1.5, ay - 2.4); g.closePath();
    fs(g, vgrad(g, ay - 3, gy, pal), pal.dark);
    claws(g, ax + 6, gy - 0.6, 0.25, 3, 2.8, pal, 0.2);
    if (!far) {
      g.strokeStyle = rgba(pal.light, 0.35); g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(hx + 2.5, hy - 3); g.quadraticCurveTo(hx + 5, (hy + k[1]) / 2, k[0] + 1.5, k[1] - 1); g.stroke();
    }
  }
  function legsQuad(g, R, pal, A, far) {
    const mv = A.move || 0;
    const legs = [
      { h: R.hipBack, ph: A.walk + (far ? Math.PI : 0), bend: -1, off: 0 },
      { h: R.hipFront, ph: A.walk + (far ? 0 : Math.PI), bend: 1, off: 0 },
    ];
    for (const L of legs) {
      const hx = L.h[0] + (far ? -1.4 : 0), hy = L.h[1] - (far ? 0.6 : 0);
      const fx = hx + Math.sin(L.ph) * 6 * mv;
      const lift = Math.max(0, Math.cos(L.ph)) * 3 * mv;
      const k = ik(hx, hy, fx, -lift - 1.6 - (A.air || 0) - (A.fly || 0) * 3, 8.8, 8.6, L.bend);
      g.beginPath(); capsule(g, hx, hy, 5.6, k[0], k[1], 4.2); fs(g, vgrad(g, hy - 5, k[1] + 4, pal), pal.dark);
      g.beginPath(); capsule(g, k[0], k[1], 4.2, k[2], k[3], 3.6); fs(g, vgrad(g, k[1] - 4, k[3] + 3, pal), pal.dark);
      g.beginPath(); g.ellipse(k[2] + 0.8, k[3] + 0.4, 4.4, 1.6, 0, 0, TAU); fs(g, pal.dark, null);
      claws(g, k[2] + 3.6, k[3] + 0.7, 0.15, 3, 1.8, pal, 0.25);
    }
  }
  function legsMulti(g, R, pal, A, far) {
    const mv = A.move || 0;
    const xs = [-0.6, -0.22, 0.16, 0.52], spread = [-15, -6, 5, 14];
    for (let i = 0; i < 4; i++) {
      const at = R.P(xs[i] * R.rx, 0.55 * R.ry);
      const hx = at[0] + (far ? -1.2 : 0), hy = at[1] - (far ? 0.8 : 0);
      const ph = A.walk * 1.4 + i * Math.PI * 0.5 + (far ? Math.PI * 0.75 : 0);
      const fx = hx + spread[i] * (far ? 0.85 : 1) + Math.sin(ph) * 3.6 * mv;
      const lift = Math.max(0, Math.cos(ph)) * 3 * mv;
      const bend = fx > hx ? -1 : 1;
      const k = ik(hx, hy, fx, -lift - (A.air || 0), 13, 14.5, bend);
      g.beginPath(); capsule(g, hx, hy, 1.9, k[0], k[1], 1.35); fs(g, vgrad(g, k[1] - 2, hy + 2, pal), pal.dark, 0.4);
      g.beginPath(); capsule(g, k[0], k[1], 1.35, k[2], k[3], 0.35); fs(g, vgrad(g, k[1] - 2, k[3], pal), pal.dark, 0.4);
      g.beginPath(); g.arc(k[0], k[1], 1.6, 0, TAU); fs(g, pal.light, pal.dark, 0.35);
    }
  }
  function legsSerpent(g, R, pal, A) {
    const at = R.hipBack, t = A.t, mv = A.move || 0;
    const pts = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = at[0] - u * 40;
      const lift = Math.sin(u * Math.PI) * 0;
      const baseY = lerp(at[1], -2.6 - (A.air || 0), Math.min(1, u * 2.4)) + (u > 0.42 ? -Math.sin((u - 0.42) * 6) * 1.2 : 0);
      const wave = Math.sin(t * 3.2 - u * 9) * (0.6 + mv * 1.2) * u;
      pts.push([x + (u < 0.1 ? 0 : 0), baseY + wave + lift]);
    }
    const rads = radii(n, 7.5, 1.6, 0.8);
    tube(g, pts, rads);
    fs(g, vgrad(g, -12, 0, pal), pal.dark);
    g.strokeStyle = rgba(pal.belly, 0.55); g.lineWidth = 0.5;
    for (let i = 2; i < n - 1; i++) {
      const p = pts[i], r = rads[i];
      g.beginPath(); g.moveTo(p[0] - r * 0.3, p[1] + r * 0.4); g.lineTo(p[0] + r * 0.2, p[1] + r * 0.95); g.stroke();
    }
  }
  function legsHop(g, R, pal, A, far) {
    const hip = R.hipBack;
    const hx = hip[0] + (far ? -1.6 : 0), hy = hip[1] - (far ? 0.6 : 0);
    const e = A.leap || 0;
    const knee = [hx + lerp(-9, -6, e), hy + lerp(5.5, 9.5, e)];
    const air = (A.air || 0) * (1 - e);
    const ankle = [lerp(hx + 1.5, hx - 8, e), lerp(-2.4 - air, hy + 18, e)];
    const toe = [ankle[0] + lerp(12, 4, e), lerp(-air, ankle[1] + 7, e)];
    g.beginPath(); capsule(g, hx, hy, 6.8, knee[0], knee[1], 4.4); fs(g, vgrad(g, hy - 6, knee[1] + 4, pal), pal.dark);
    g.beginPath(); capsule(g, knee[0], knee[1], 4.2, ankle[0], ankle[1], 2.4); fs(g, vgrad(g, knee[1] - 4, ankle[1] + 2, pal), pal.dark);
    g.beginPath();
    g.moveTo(ankle[0] - 1, ankle[1] - 1.6);
    g.lineTo(toe[0], toe[1] - 1.2); g.lineTo(toe[0] + 1.6, toe[1]); g.lineTo(toe[0] - 2.5, toe[1] + 0.4);
    g.lineTo(ankle[0], ankle[1] + 1.4); g.closePath();
    fs(g, vgrad(g, ankle[1] - 2, toe[1], pal), pal.dark);
    if (!far) {
      g.strokeStyle = rgba(pal.light, 0.3); g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(hx - 1, hy - 4); g.quadraticCurveTo(hx - 7, hy, knee[0] + 1, knee[1] - 2); g.stroke();
    }
  }

  /* ---------- 胴 ---------- */
  function bodyPath(g, type, rx, ry, seed) {
    g.beginPath();
    if (type === 'muscle') {
      g.moveTo(rx * 0.98, -ry * 0.05);
      g.bezierCurveTo(rx * 1.02, -ry * 0.95, rx * 0.4, -ry * 1.28, -rx * 0.2, -ry * 1.0);
      g.bezierCurveTo(-rx * 0.8, -ry * 0.8, -rx * 1.06, -ry * 0.1, -rx * 0.9, ry * 0.45);
      g.bezierCurveTo(-rx * 0.6, ry * 1.02, rx * 0.4, ry * 1.04, rx * 0.84, ry * 0.62);
      g.bezierCurveTo(rx * 1.04, ry * 0.4, rx * 1.02, ry * 0.15, rx * 0.98, -ry * 0.05);
    } else if (type === 'bloat') {
      g.ellipse(0, ry * 0.05, rx, ry, 0, 0, TAU);
    } else if (type === 'rock') {
      const r = mulberry32(seed);
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const j = 0.86 + r() * 0.2;
        const x = Math.cos(a) * rx * j, y = Math.sin(a) * ry * j * (Math.sin(a) > 0 ? 0.92 : 1.05);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    } else if (type === 'carapace') {
      g.moveTo(rx, ry * 0.05);
      g.bezierCurveTo(rx * 0.95, -ry * 1.0, -rx * 0.6, -ry * 1.15, -rx * 1.0, -ry * 0.1);
      g.bezierCurveTo(-rx * 1.0, ry * 0.7, rx * 0.2, ry * 1.0, rx * 0.85, ry * 0.6);
      g.quadraticCurveTo(rx * 1.02, ry * 0.4, rx, ry * 0.05);
    } else {
      g.moveTo(rx * 0.98, -ry * 0.15);
      g.bezierCurveTo(rx * 0.9, -ry * 0.98, rx * 0.1, -ry * 1.12, -rx * 0.55, -ry * 0.82);
      g.bezierCurveTo(-rx * 0.95, -ry * 0.55, -rx * 1.08, ry * 0.1, -rx * 0.85, ry * 0.5);
      g.bezierCurveTo(-rx * 0.5, ry * 1.0, rx * 0.3, ry * 1.08, rx * 0.76, ry * 0.7);
      g.bezierCurveTo(rx * 1.02, ry * 0.45, rx * 1.05, ry * 0.15, rx * 0.98, -ry * 0.15);
    }
    g.closePath();
  }
  function body(g, R, part, A) {
    const pal = part.pal, type = part.arch, rx = R.rx, ry = R.ry;
    g.save();
    g.translate(R.cx, R.cy); g.rotate(R.tilt);
    if (type === 'bone') {
      // 骨の籠の中に暗い核
      g.beginPath(); g.ellipse(0, 0, rx * 0.86, ry * 0.82, 0, 0, TAU);
      fs(g, lg(g, 0, -ry, 0, ry, [[0, shade(pal.base, -0.2)], [1, pal.dark]]), null);
      glow(g, rx * 0.1, 0, ry * 0.9, pal.glow, 0.55 + Math.sin(A.t * 2.2) * 0.12);
      g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = -rx * 0.7 + i * rx * 0.24;
        g.beginPath();
        g.moveTo(x, -ry * 0.92);
        g.quadraticCurveTo(x + rx * 0.32, -ry * 0.1, x + rx * 0.12, ry * 0.86);
        g.lineWidth = 2.1; g.strokeStyle = pal.dark; g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = pal.light; g.stroke();
      }
      g.beginPath(); g.moveTo(-rx * 1.0, -ry * 0.55); g.quadraticCurveTo(0, -ry * 1.12, rx * 0.95, -ry * 0.62);
      g.lineWidth = 2.6; g.strokeStyle = pal.dark; g.stroke(); g.lineWidth = 1.9; g.strokeStyle = pal.belly; g.stroke();
      for (let i = 0; i < 9; i++) {
        const u = -0.85 + i * 0.21;
        g.beginPath(); g.arc(u * rx, -ry * (0.98 - Math.abs(u) * 0.38), 1.1, 0, TAU); fs(g, pal.belly, pal.dark, 0.3);
      }
      g.restore();
      return;
    }
    bodyPath(g, type, rx, ry, part.seed);
    fs(g, vgrad(g, -ry * 1.1, ry, pal), null);
    g.save(); g.clip();
    if (type === 'scale' || type === 'muscle') {
      g.beginPath(); g.ellipse(rx * 0.22, ry * 0.7, rx * 0.85, ry * 0.5, 0, 0, TAU);
      g.fillStyle = rgba(pal.belly, type === 'scale' ? 0.75 : 0.35); g.fill();
      if (type === 'scale') {
        g.strokeStyle = rgba(pal.dark, 0.45); g.lineWidth = 0.35;
        for (let i = -6; i <= 6; i++) { const x = i * rx * 0.13; g.beginPath(); g.moveTo(x, ry * 0.28); g.quadraticCurveTo(x + 1.2, ry * 0.65, x, ry * 1.1); g.stroke(); }
        g.strokeStyle = rgba(pal.dark, 0.4);
        for (let row = 0; row < 4; row++) {
          for (let i = 0; i < 11; i++) {
            const x = -rx * 0.95 + i * rx * 0.19 + (row % 2) * rx * 0.095, y = -ry * 0.8 + row * ry * 0.24;
            g.beginPath(); g.arc(x, y, 1.5, 0.25, Math.PI - 0.25); g.stroke();
          }
        }
      } else {
        g.strokeStyle = rgba(pal.light, 0.28); g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(rx * 0.5, -ry * 0.75); g.quadraticCurveTo(rx * 0.1, -ry * 0.1, rx * 0.55, ry * 0.4); g.stroke();
        g.beginPath(); g.moveTo(-rx * 0.1, -ry * 0.85); g.quadraticCurveTo(-rx * 0.45, -ry * 0.2, -rx * 0.2, ry * 0.5); g.stroke();
        g.strokeStyle = rgba(pal.dark, 0.6); g.lineWidth = 0.45;
        for (let i = 0; i < 26; i++) {
          const u = -0.95 + i * 0.075;
          const x = u * rx, y = -ry * Math.sqrt(Math.max(0, 1 - u * u)) * 1.02 + 0.6;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.2, y - 1.6); g.stroke();
        }
      }
    } else if (type === 'carapace') {
      g.strokeStyle = rgba(pal.dark, 0.85); g.lineWidth = 0.7;
      for (let i = 1; i < 5; i++) {
        const x = rx * (0.75 - i * 0.36);
        g.beginPath(); g.moveTo(x + 2, -ry * 1.1); g.quadraticCurveTo(x - 2.5, 0, x + 1.5, ry * 1.1); g.stroke();
      }
      g.strokeStyle = rgba(pal.light, 0.5); g.lineWidth = 0.6;
      for (let i = 0; i < 5; i++) {
        const x = rx * (0.6 - i * 0.36);
        g.beginPath(); g.moveTo(x - 4, -ry * 0.62); g.quadraticCurveTo(x, -ry * 0.92, x + 4, -ry * 0.7); g.stroke();
      }
      g.fillStyle = rgba(pal.belly, 0.3);
      g.beginPath(); g.ellipse(0, ry * 0.85, rx, ry * 0.35, 0, 0, TAU); g.fill();
    } else if (type === 'bloat') {
      const r = mulberry32(part.seed);
      g.fillStyle = rgba(pal.belly, 0.5);
      g.beginPath(); g.ellipse(rx * 0.1, ry * 0.65, rx * 0.8, ry * 0.5, 0, 0, TAU); g.fill();
      for (let i = 0; i < 14; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.85;
        const x = Math.cos(a) * rx * d, y = Math.sin(a) * ry * d - ry * 0.15, rr = 0.7 + r() * 1.5;
        g.beginPath(); g.arc(x, y, rr, 0, TAU); fs(g, rgba(pal.light, 0.55), rgba(pal.dark, 0.5), 0.3);
        if (i % 4 === 0) glow(g, x, y, rr * 1.8, pal.glow, 0.35 + Math.sin(A.t * 3 + i) * 0.15);
      }
    } else if (type === 'rock') {
      const r = mulberry32(part.seed + 7);
      g.strokeStyle = rgba(pal.dark, 0.7); g.lineWidth = 0.6;
      for (let i = 0; i < 6; i++) {
        const x = (r() - 0.5) * rx * 1.6, y = (r() - 0.5) * ry * 1.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 8, y + (r() - 0.5) * 6); g.stroke();
      }
      const pulse = 0.55 + Math.sin(A.t * 1.8) * 0.15;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        let x = (r() - 0.5) * rx * 1.4, y = (r() - 0.6) * ry * 1.2;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (r() - 0.4) * 5; y += (r() - 0.5) * 4; g.lineTo(x, y); }
        g.strokeStyle = rgba(pal.glow, 0.25 * pulse); g.lineWidth = 2.2; g.stroke();
        g.strokeStyle = rgba(pal.glowLight, 0.75 * pulse); g.lineWidth = 0.5; g.stroke();
      }
      g.restore();
    }
    g.restore();
    bodyPath(g, type, rx, ry, part.seed);
    g.lineWidth = 0.7; g.strokeStyle = pal.dark; g.stroke();
    g.restore();
  }

  /* ---------- 首と頭 ---------- */
  function neckDraw(g, R, part) {
    const pal = part.pal, arch = part.arch;
    const n = R.neck, h = R.head;
    const r0 = R.ry * 0.46, r1 = arch === 'dragon' || arch === 'bird' || arch === 'skull' ? 3.2 : 4.2;
    const mx = (n[0] + h[0]) / 2 - 1.5, my = (n[1] + h[1]) / 2 - 1.2;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      pts.push([(1 - u) * (1 - u) * n[0] + 2 * u * (1 - u) * mx + u * u * h[0], (1 - u) * (1 - u) * n[1] + 2 * u * (1 - u) * my + u * u * h[1]]);
    }
    tube(g, pts, radii(7, r0, r1));
    fs(g, vgrad(g, Math.min(n[1], h[1]) - 4, Math.max(n[1], h[1]) + 4, pal), pal.dark);
    if (arch === 'dragon' || arch === 'bird') {
      g.strokeStyle = rgba(pal.belly, 0.5); g.lineWidth = 0.45;
      for (let i = 1; i < 6; i++) {
        const p = pts[i], r = lerp(r0, r1, i / 6);
        g.beginPath(); g.moveTo(p[0] + r * 0.2, p[1] + r * 0.2); g.lineTo(p[0] + r * 0.75, p[1] + r * 0.65); g.stroke();
      }
    }
  }
  function eye(g, x, y, rx, ry, color, A, glowR = 3) {
    g.beginPath(); g.ellipse(x, y, rx * 1.35, ry * 1.6, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.75)'; g.fill();
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = color; g.fill();
    glow(g, x, y, glowR, color, 0.8 + Math.sin(A.t * 2.6) * 0.1);
  }
  function headDraw(g, R, part, A, V) {
    const pal = part.pal, arch = part.arch;
    const jaw = (A.mouth || 0);
    const ch = A.charge || 0;
    g.save();
    g.translate(R.head[0], R.head[1]); g.rotate(R.headA);
    const inner = (x0, y0, x1, y1, x2, y2) => {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath();
      g.fillStyle = '#1a0606'; g.fill();
      if (ch > 0.05 || jaw > 0.3) glow(g, (x1 + x2) / 2, (y1 + y2) / 2, 3 + ch * 4, V.P.head.pal.glow, 0.5 * Math.max(ch, jaw));
    };
    if (arch === 'dragon') {
      inner(3, 1.5, 17.5, 0.8, 15.5, 1.5 + jaw * 7);
      // 下顎
      g.save(); g.translate(2.5, 1.4); g.rotate(jaw * 0.5);
      g.beginPath(); g.moveTo(-1.5, -0.4); g.bezierCurveTo(5, 0.2, 11, 0.0, 14.5, -0.5); g.lineTo(14.2, 1.0); g.bezierCurveTo(9, 2.6, 3, 3.6, -1, 2.6); g.closePath();
      fs(g, vgrad(g, -1, 3.5, pal), pal.dark);
      g.fillStyle = '#efe6d4';
      for (let i = 0; i < 6; i++) { const x = 3 + i * 2; g.beginPath(); g.moveTo(x, -0.2); g.lineTo(x + 0.5, -1.4); g.lineTo(x + 1, -0.15); g.fill(); }
      g.restore();
      // 角
      g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.35;
      tube(g, chain(2, -4.2, Math.PI + 0.55, 6, 2.2, () => -0.08), radii(6, 1.5, 0.15)); g.fill(); g.stroke();
      tube(g, chain(5, -4.8, Math.PI + 0.85, 5, 1.6, () => -0.1), radii(5, 0.9, 0.1)); g.fill(); g.stroke();
      // 頭骨
      g.beginPath();
      g.moveTo(-2, -3.5);
      g.bezierCurveTo(2, -6.5, 8, -5.6, 12, -3.4);
      g.bezierCurveTo(15, -2.6, 18, -2.0, 18.6, -0.6);
      g.lineTo(18.2, 0.7);
      g.bezierCurveTo(13, 0.9, 7, 1.1, 3, 1.7);
      g.bezierCurveTo(0, 2.7, -2.6, 1.5, -2, -3.5);
      fs(g, vgrad(g, -6, 2, pal), pal.dark);
      g.fillStyle = '#efe6d4';
      for (let i = 0; i < 6; i++) { const x = 6 + i * 2; g.beginPath(); g.moveTo(x, 0.9); g.lineTo(x + 0.5, 2.0); g.lineTo(x + 1, 0.85); g.fill(); }
      g.fillStyle = rgba(pal.dark, 0.7);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-1 + i * 3, -4.6 + i * 0.3); g.lineTo(0.2 + i * 3, -6.6 + i * 0.4); g.lineTo(1.4 + i * 3, -4.4 + i * 0.3); g.fill(); }
      g.beginPath(); g.ellipse(16.4, -1.3, 0.8, 0.4, -0.3, 0, TAU); g.fillStyle = '#100404'; g.fill();
      if (ch > 0.1) glow(g, 16.4, -1.3, 2 + ch * 2, pal.glow, ch * 0.8);
      eye(g, 8.6, -2.8, 1.3, 0.62, pal.eye, A);
    } else if (arch === 'insect') {
      g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(4, -4); g.quadraticCurveTo(-1, -12, -7, -13 + Math.sin(A.t * 2) * 0.8); g.lineWidth = 0.55; g.strokeStyle = pal.dark; g.stroke();
      g.beginPath(); g.moveTo(5, -4.2); g.quadraticCurveTo(2, -12, -3, -13.5 + Math.cos(A.t * 2.3) * 0.8); g.stroke();
      // 大顎
      const open = jaw * 0.6 + Math.sin(A.t * 7) * 0.05;
      for (const sd of [-1, 1]) {
        g.save(); g.translate(8.5, 1.4); g.rotate(sd * (0.2 + open));
        g.beginPath(); g.moveTo(0, -0.8); g.quadraticCurveTo(4, -1.4 * sd, 5.6, 1.4 * sd); g.quadraticCurveTo(3, 0.4 * sd, 0, 0.9);
        fs(g, pal.horn, pal.dark, 0.35); g.restore();
      }
      g.beginPath(); g.ellipse(4, -0.4, 5.6, 4.8, 0.1, 0, TAU); fs(g, vgrad(g, -5, 4.5, pal), pal.dark);
      g.strokeStyle = rgba(pal.dark, 0.5); g.lineWidth = 0.4; g.beginPath(); g.moveTo(1, -4.5); g.quadraticCurveTo(3, 0, 1.5, 4); g.stroke();
      g.beginPath(); g.ellipse(6.4, -1.8, 2.8, 2.2, 0.2, 0, TAU);
      fs(g, lg(g, 4, -4, 8, 1, [[0, shade(pal.eye, 0.2)], [1, shade(pal.eye, -0.5)]]), pal.dark, 0.3);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(5 + (i % 3) * 1.1, -3 + Math.floor(i / 3) * 1.1, 0.25, 0, TAU); g.fill(); }
      glow(g, 6.4, -1.8, 4, pal.eye, 0.55);
    } else if (arch === 'frog') {
      const sac = Math.max(ch, jaw * 0.5);
      if (sac > 0.02) {
        g.beginPath(); g.arc(7, 4 + sac * 2, 2.5 + sac * 3.2, 0, TAU);
        fs(g, lg(g, 0, 1, 0, 9, [[0, pal.belly], [1, shade(pal.glow, -0.3)]]), pal.dark, 0.4);
        glow(g, 7, 4 + sac * 2, 3 + sac * 3, pal.glow, sac * 0.5);
      }
      inner(2, 1.4, 15, 0.9, 13, 1.4 + jaw * 6);
      g.save(); g.translate(1.5, 1.2); g.rotate(jaw * 0.42);
      g.beginPath(); g.moveTo(-1, -0.2); g.lineTo(14, -0.3); g.quadraticCurveTo(13, 3, 9, 3.6); g.lineTo(0, 3.4); g.closePath();
      fs(g, lg(g, 0, -1, 0, 4, [[0, pal.base], [1, pal.belly]]), pal.dark);
      g.restore();
      g.beginPath();
      g.moveTo(-2, -2.5); g.bezierCurveTo(2, -5.5, 9, -5.8, 14.5, -2.6);
      g.bezierCurveTo(16.6, -1.3, 16.5, 0.4, 15, 1.0); g.lineTo(2, 1.6);
      g.bezierCurveTo(-0.5, 1.6, -2.6, 0.2, -2, -2.5);
      fs(g, vgrad(g, -6, 2, pal), pal.dark);
      const r = mulberry32(part.seed);
      g.fillStyle = rgba(pal.light, 0.5);
      for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(1 + r() * 12, -3.5 + r() * 3.5, 0.3 + r() * 0.5, 0, TAU); g.fill(); }
      g.beginPath(); g.arc(7.2, -5.2, 2.7, 0, TAU); fs(g, vgrad(g, -8, -2.5, pal), pal.dark);
      g.beginPath(); g.ellipse(7.5, -5.4, 1.6, 1.5, 0, 0, TAU); g.fillStyle = pal.eye; g.fill();
      g.fillStyle = '#0c0c04'; g.fillRect(6.2, -5.6, 2.6, 0.45);
      glow(g, 7.5, -5.4, 3, pal.eye, 0.5);
    } else if (arch === 'ape') {
      inner(2, 1.6, 12, 1.6, 10.5, 1.6 + jaw * 6);
      g.save(); g.translate(2, 1.6); g.rotate(jaw * 0.55);
      g.beginPath(); g.moveTo(-1, 0); g.lineTo(9.5, 0.3); g.quadraticCurveTo(10.2, 2.8, 8.5, 3.6); g.lineTo(1, 4); g.closePath();
      fs(g, vgrad(g, -1, 4, pal), pal.dark);
      g.fillStyle = '#efe6d4'; g.beginPath(); g.moveTo(7.6, 0.4); g.lineTo(8.1, -1.4); g.lineTo(8.6, 0.4); g.fill();
      g.restore();
      g.beginPath();
      g.moveTo(-1.5, -3); g.bezierCurveTo(0, -7.6, 7, -8.3, 10, -5.2);
      g.lineTo(10.9, -3.6); g.bezierCurveTo(12.6, -3, 13.3, -1, 12.6, 1.4);
      g.lineTo(9, 2.1); g.bezierCurveTo(5, 3.2, 0, 3, -1.5, -3);
      fs(g, vgrad(g, -8, 3, pal), pal.dark);
      g.beginPath(); g.moveTo(4, -5.4); g.quadraticCurveTo(8, -6.6, 11, -4.2); g.lineWidth = 1.3; g.strokeStyle = shade(pal.dark, 0.1); g.stroke();
      g.fillStyle = '#efe6d4';
      g.beginPath(); g.moveTo(9.4, 1.2); g.lineTo(9.9, 3.6); g.lineTo(10.5, 1.2); g.fill();
      g.beginPath(); g.moveTo(11.2, 1.2); g.lineTo(11.6, 2.8); g.lineTo(12.1, 1.2); g.fill();
      g.strokeStyle = rgba(pal.dark, 0.7); g.lineWidth = 0.45;
      for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(-1 + i * 0.8, -4 - i * 0.5); g.lineTo(-3 + i * 0.7, -6.5 - i * 0.6); g.stroke(); }
      eye(g, 8.4, -3.7, 0.9, 0.5, pal.eye, A, 2.6);
    } else if (arch === 'octo') {
      g.save(); g.translate(-3, -9); g.rotate(-0.55);
      g.beginPath(); g.ellipse(0, 0, 7.5, 11, 0, 0, TAU);
      fs(g, vgrad(g, -11, 11, pal), pal.dark);
      const r = mulberry32(part.seed);
      g.fillStyle = rgba(pal.light, 0.45);
      for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((r() - 0.5) * 9, (r() - 0.5) * 15, 0.6 + r() * 0.9, 0, TAU); g.fill(); }
      g.restore();
      g.beginPath(); g.ellipse(4, 0, 5.3, 4.2, 0.1, 0, TAU); fs(g, vgrad(g, -4, 4, pal), pal.dark);
      g.save(); g.translate(8, 1.2); g.rotate(jaw * 0.4);
      g.beginPath(); g.moveTo(0, -1); g.lineTo(2.8, 0.2); g.lineTo(0, 0.9); fs(g, '#1b1012', null); g.restore();
      eye(g, 5.6, -2.0, 1.1, 0.8, pal.eye, A, 2.5);
      eye(g, 3.2, -3.0, 0.75, 0.55, pal.eye, A, 1.8);
      eye(g, 6.9, -0.4, 0.6, 0.45, pal.eye, A, 1.5);
    } else if (arch === 'skull') {
      g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.4;
      const spiral = [];
      for (let i = 0; i < 9; i++) { const a = -1.4 - i * 0.55, rr = 6.5 - i * 0.45; spiral.push([-1 + Math.cos(a) * rr * 0.9, -4 + Math.sin(a) * rr]); }
      tube(g, spiral, radii(9, 1.9, 0.4)); g.fill(); g.stroke();
      inner(2, 2.5, 11.5, 2.5, 10.5, 2.6 + jaw * 6);
      g.save(); g.translate(1, 2.2); g.rotate(jaw * 0.55);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(10.5, 0.4); g.lineTo(10, 3); g.lineTo(1, 3.6); g.closePath();
      fs(g, lg(g, 0, 0, 0, 4, [[0, pal.belly], [1, pal.base]]), pal.dark);
      g.fillStyle = '#d9cfbc';
      for (let i = 0; i < 6; i++) g.fillRect(3 + i * 1.3, -0.6, 0.9, 1);
      g.restore();
      g.beginPath(); g.arc(2.5, -2.5, 6, 0, TAU);
      g.moveTo(6, -5.5); g.lineTo(11.6, -1.6); g.lineTo(11.2, 2.6); g.lineTo(4, 2.8); g.closePath();
      fs(g, lg(g, 0, -9, 0, 3, [[0, pal.belly], [0.6, pal.light], [1, pal.base]]), null);
      g.beginPath(); g.arc(2.5, -2.5, 6, Math.PI * 0.75, Math.PI * 1.9); g.strokeStyle = pal.dark; g.lineWidth = 0.5; g.stroke();
      g.fillStyle = '#d9cfbc'; for (let i = 0; i < 6; i++) g.fillRect(4.5 + i * 1.15, 2.1, 0.85, 1.1);
      g.beginPath(); g.moveTo(9.4, -1.4); g.lineTo(10.4, 0.4); g.lineTo(8.8, 0.4); g.fillStyle = '#120d10'; g.fill();
      g.beginPath(); g.ellipse(6.9, -2.5, 2.2, 1.8, 0, 0, TAU); g.fillStyle = '#0c080e'; g.fill();
      glow(g, 6.9, -2.5, 3.6, pal.eye, 0.85 + Math.sin(A.t * 3) * 0.12);
      g.beginPath(); g.arc(6.9, -2.5, 0.7, 0, TAU); g.fillStyle = shade(pal.eye, 0.5); g.fill();
      g.strokeStyle = rgba(pal.dark, 0.6); g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(0, -7.5); g.lineTo(1.5, -5); g.lineTo(0.5, -3); g.stroke();
    } else if (arch === 'bird') {
      g.fillStyle = pal.light; g.strokeStyle = pal.dark; g.lineWidth = 0.35;
      for (let i = 0; i < 4; i++) {
        tube(g, chain(-0.5, -4 + i * 1.2, Math.PI + 0.45 - i * 0.18, 5, 2.4, () => 0.06), radii(5, 1.0, 0.1));
        g.fill(); g.stroke();
      }
      g.save(); g.translate(5, 0.9); g.rotate(jaw * 0.45);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0.2); g.lineTo(8.5, 1.5); g.lineTo(0, 1.8); g.closePath();
      fs(g, lg(g, 0, 0, 0, 2, [[0, pal.horn], [1, shade(pal.horn, -0.4)]]), pal.dark, 0.35);
      g.restore();
      inner(5, 1, 14, 0.8, 13, 1 + jaw * 5);
      g.beginPath(); g.arc(2, -1.5, 5.2, 0, TAU); fs(g, vgrad(g, -7, 4, pal), pal.dark);
      g.beginPath(); g.moveTo(5, -3.2); g.bezierCurveTo(10, -3.6, 15, -2.0, 17.6, 0.6);
      g.bezierCurveTo(17.4, 2.1, 16.1, 2.3, 15.5, 1.3); g.lineTo(5, 1.0); g.closePath();
      fs(g, lg(g, 5, -3, 5, 2, [[0, shade(pal.horn, 0.2)], [1, shade(pal.horn, -0.35)]]), pal.dark, 0.4);
      eye(g, 4.2, -2.3, 1.0, 0.75, pal.eye, A, 2.6);
    } else if (arch === 'horn') {
      g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.4;
      const big = [];
      for (let i = 0; i < 8; i++) { const u = i / 7; big.push([5 + u * 13, -5 - u * 4 - u * u * 5]); }
      tube(g, big, radii(8, 2.4, 0.25)); g.fill(); g.stroke();
      inner(1, 2.2, 13.5, 2.2, 12, 2.2 + jaw * 5);
      g.beginPath();
      g.moveTo(-2, -4); g.bezierCurveTo(2, -6.6, 8, -6.6, 11, -4);
      g.bezierCurveTo(13.6, -2.5, 14.2, 0, 13.6, 2.5);
      g.bezierCurveTo(10, 4.6, 3, 5, -1, 3); g.bezierCurveTo(-3, 1, -3, -2, -2, -4);
      fs(g, vgrad(g, -7, 5, pal), pal.dark);
      g.fillStyle = pal.horn;
      tube(g, [[12, -2], [14.5, -4], [16.6, -7.2]], [1.6, 0.9, 0.15]); g.fill(); g.stroke();
      g.strokeStyle = rgba(pal.dark, 0.6); g.lineWidth = 0.4;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(1 + i * 2.6, -5.5); g.lineTo(2 + i * 2.6, -3.5); g.stroke(); }
      eye(g, 7, -2.6, 0.9, 0.55, pal.eye, A, 2.4);
    }
    g.restore();
  }

  /* ---------- 腕 ---------- */
  function armDraw(g, R, part, A, far) {
    const pal = far ? part.pal.far : part.pal, arch = part.arch;
    const sh = R.shoulder;
    const sx = sh[0] + (far ? -1.5 : 0), sy = sh[1] - (far ? 0.8 : 0);
    const active = (A.atkArm === 1) === !!far;
    const p = active ? A.atk : -1;
    const sw = swing(p);
    const idle = Math.sin(A.t * 1.4 + (far ? 1.5 : 0)) * 0.06 + Math.sin(A.walk + (far ? 0 : Math.PI)) * 0.18 * (A.move || 0);
    if (arch === 'tentacle') {
      for (let k = 0; k < 2; k++) {
        const base = 0.85 + k * 0.32 + sw * 0.7 + idle;
        const pts = chain(sx, sy, base, 11, 2.6, (i) => Math.sin(A.t * 2.2 + i * 0.6 + k * 1.3 + (far ? 2 : 0)) * 0.16 - (p >= 0 ? 0.02 : 0.05));
        tube(g, pts, radii(11, 2.5, 0.3));
        fs(g, vgrad(g, sy - 4, sy + 22, pal), pal.dark, 0.4);
        g.fillStyle = rgba(pal.belly, 0.7);
        for (let i = 2; i < 10; i += 2) { g.beginPath(); g.arc(pts[i][0], pts[i][1] + 0.9, 0.45, 0, TAU); g.fill(); }
      }
      return;
    }
    const conf = {
      claw: { l1: 10, l2: 9, r: [3.4, 2.7, 2.1], up: 1.25, fore: -0.95 },
      pincer: { l1: 9, l2: 8, r: [3.0, 2.6, 3.0], up: 1.1, fore: -0.9 },
      fist: { l1: 11, l2: 10, r: [5.0, 4.0, 5.0], up: 1.35, fore: -0.55 },
      scythe: { l1: 10, l2: 0, r: [2.6, 2.0, 1.5], up: 0.95, fore: 2.3 },
    }[arch];
    const lowFrame = V_legs === 'quad' || V_legs === 'multi';
    const ua = conf.up - (lowFrame ? 0.75 : 0) + sw + idle;
    const ex = sx + Math.cos(ua) * conf.l1, ey = sy + Math.sin(ua) * conf.l1;
    g.beginPath(); capsule(g, sx, sy, conf.r[0], ex, ey, conf.r[1]); fs(g, vgrad(g, sy - 4, ey + 4, pal), pal.dark);
    if (arch === 'scythe') {
      const ba = ua + conf.fore - sw * 1.2;
      g.save(); g.translate(ex, ey); g.rotate(ba);
      g.beginPath(); g.moveTo(0, -1.2); g.quadraticCurveTo(9, -3.4, 18, 0.5); g.quadraticCurveTo(19, 1.6, 17.5, 1.4);
      g.quadraticCurveTo(9, -0.6, 0, 1.4); g.closePath();
      fs(g, lg(g, 0, -3, 0, 2, [[0, shade(pal.light, 0.15)], [1, pal.dark]]), pal.dark, 0.35);
      g.fillStyle = pal.horn;
      for (let i = 0; i < 6; i++) { const x = 3 + i * 2.4; g.beginPath(); g.moveTo(x, 0.3 + i * 0.1); g.lineTo(x + 0.6, 1.6); g.lineTo(x + 1.2, 0.35 + i * 0.1); g.fill(); }
      g.restore();
      g.beginPath(); g.arc(ex, ey, 1.8, 0, TAU); fs(g, pal.base, pal.dark, 0.35);
      return;
    }
    const fa = ua + conf.fore - sw * 0.25;
    const wx = ex + Math.cos(fa) * conf.l2, wy = ey + Math.sin(fa) * conf.l2;
    g.beginPath(); capsule(g, ex, ey, conf.r[1], wx, wy, conf.r[2]); fs(g, vgrad(g, ey - 4, wy + 4, pal), pal.dark);
    if (arch === 'claw') {
      claws(g, wx + Math.cos(fa) * 1.2, wy + Math.sin(fa) * 1.2, fa + 0.35, 3, 5.4, pal, 0.38);
    } else if (arch === 'pincer') {
      const open = p >= 0 ? (p < 0.4 ? 0.55 : 0.08) : 0.22 + Math.sin(A.t * 1.6) * 0.05;
      g.save(); g.translate(wx, wy); g.rotate(fa);
      g.beginPath(); g.moveTo(-1, -3.2); g.quadraticCurveTo(8, -5.4, 11.5, -0.6); g.quadraticCurveTo(7, -1.2, 2, 0.4); g.lineTo(-1, 2.6); g.closePath();
      fs(g, vgrad(g, -5, 3, pal), pal.dark, 0.45);
      g.save(); g.translate(1.5, 1); g.rotate(open);
      g.beginPath(); g.moveTo(0, -0.6); g.quadraticCurveTo(6, 2.6, 9.5, 0.6); g.quadraticCurveTo(6, 0.1, 0, 1.6); g.closePath();
      fs(g, vgrad(g, -1, 3, pal), pal.dark, 0.4);
      g.restore();
      g.strokeStyle = rgba(pal.light, 0.5); g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(1, -2.6); g.quadraticCurveTo(6, -4.2, 9.5, -1.6); g.stroke();
      g.restore();
    } else if (arch === 'fist') {
      g.beginPath(); g.arc(wx + Math.cos(fa) * 2, wy + Math.sin(fa) * 2, 4.4, 0, TAU); fs(g, vgrad(g, wy - 4, wy + 6, pal), pal.dark);
      g.fillStyle = rgba(pal.light, 0.35);
      for (let i = 0; i < 3; i++) {
        const a = fa - 0.5 + i * 0.5;
        g.beginPath(); g.arc(wx + Math.cos(fa) * 2 + Math.cos(a) * 3.2, wy + Math.sin(fa) * 2 + Math.sin(a) * 3.2, 1.0, 0, TAU); g.fill();
      }
    }
  }

  /* ---------- 尾 ---------- */
  function tailDraw(g, R, part, A) {
    const pal = part.pal, arch = part.arch;
    const r0 = R.rear;
    const sweep = Math.sin((A.tailSwipe || 0) * Math.PI) * 0.7;
    const sway = (i, amp) => Math.sin(A.t * 1.6 - i * 0.55) * amp * (i / 10) - sweep * 0.08;
    const droop = { biped: 0.38, quad: 0.12, multi: 0.05, serpent: 0.4, hop: 0.4 }[V_legs] || 0.2;
    const base = Math.PI + R.tilt * 0.4 + droop;
    if (arch === 'tentacle') {
      for (let k = 0; k < 3; k++) {
        const pts = chain(r0[0], r0[1] + k * 0.8, base - 0.15 + k * 0.18, 10, 2.8, (i) => Math.sin(A.t * 2 - i * 0.7 + k) * 0.18 - 0.04);
        tube(g, pts, radii(10, 2.2 - k * 0.3, 0.25)); fs(g, vgrad(g, r0[1] - 6, r0[1] + 10, pal), pal.dark, 0.4);
      }
      return;
    }
    if (arch === 'scorpion') {
      const pts = chain(r0[0], r0[1], Math.PI + 0.55 + R.tilt * 0.3, 9, 3.1, (i) => -0.42 + Math.sin(A.t * 1.5 - i * 0.4) * 0.04 - sweep * 0.1);
      for (let i = 0; i < pts.length - 1; i++) {
        g.beginPath(); capsule(g, pts[i][0], pts[i][1], 3.4 - i * 0.18, pts[i + 1][0], pts[i + 1][1], 3.0 - i * 0.18);
        fs(g, vgrad(g, pts[i][1] - 3, pts[i][1] + 3, pal), pal.dark, 0.45);
      }
      const e = pts[pts.length - 1], q = pts[pts.length - 2];
      const a = Math.atan2(e[1] - q[1], e[0] - q[0]);
      g.save(); g.translate(e[0], e[1]); g.rotate(a);
      g.beginPath(); g.moveTo(0, -2); g.quadraticCurveTo(5, -2, 6, 3.5); g.quadraticCurveTo(3.5, 0.8, 0, 2); g.closePath();
      fs(g, pal.horn, pal.dark, 0.4);
      glow(g, 6, 3.5, 2.6, pal.glow, 0.7);
      g.restore();
      return;
    }
    const conf = {
      spike: { n: 10, seg: 3.1, r0: 5.2, r1: 0.5, amp: 0.12 },
      club: { n: 8, seg: 3.2, r0: 4.6, r1: 2.0, amp: 0.1 },
      whip: { n: 13, seg: 2.7, r0: 3.5, r1: 0.25, amp: 0.2 },
      stub: { n: 3, seg: 2.6, r0: 4.6, r1: 1.8, amp: 0.05 },
    }[arch];
    const pts = chain(r0[0], r0[1], base, conf.n, conf.seg, (i) => sway(i, conf.amp) - 0.035 - (A.tailSwipe ? sweep * 0.06 : 0));
    const rads = radii(conf.n, conf.r0, conf.r1, 0.9);
    tube(g, pts, rads);
    fs(g, vgrad(g, r0[1] - 6, r0[1] + 8, pal), pal.dark);
    if (arch === 'spike') {
      g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.3;
      for (let i = 1; i < conf.n - 1; i += 1) {
        const a = pts[i], b = pts[i + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const nx = Math.sin(ang), ny = -Math.cos(ang), r = rads[i];
        const bx = a[0] + nx * r * 0.85, by = a[1] + ny * r * 0.85;
        g.beginPath(); g.moveTo(bx - Math.cos(ang) * 1.1, by - Math.sin(ang) * 1.1);
        g.lineTo(bx + nx * (2.2 - i * 0.12) - Math.cos(ang) * 1.2, by + ny * (2.2 - i * 0.12) - Math.sin(ang) * 1.2);
        g.lineTo(bx + Math.cos(ang) * 1.1, by + Math.sin(ang) * 1.1); g.closePath(); g.fill(); g.stroke();
      }
    } else if (arch === 'club') {
      const e = pts[pts.length - 1];
      g.beginPath(); g.ellipse(e[0], e[1], 5, 3.8, 0.2, 0, TAU); fs(g, vgrad(g, e[1] - 4, e[1] + 4, pal), pal.dark);
      g.fillStyle = pal.horn;
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + 0.3;
        g.beginPath(); g.moveTo(e[0] + Math.cos(a - 0.3) * 4, e[1] + Math.sin(a - 0.3) * 3);
        g.lineTo(e[0] + Math.cos(a) * 7, e[1] + Math.sin(a) * 5.6); g.lineTo(e[0] + Math.cos(a + 0.3) * 4, e[1] + Math.sin(a + 0.3) * 3); g.fill();
      }
    }
  }
  let V_legs = 'biped';

  /* ---------- 背 ---------- */
  function wingDraw(g, R, part, A, far) {
    const pal = far ? part.pal.far : part.pal;
    const root = R.top(0.12);
    const rx = root[0] + (far ? -2.5 : 0), ry = root[1] + (far ? 1 : 0);
    const f = A.fly || 0;
    const flap = f > 0 ? Math.sin(A.flap) * 0.45 * f : 0;
    const sc = far ? 0.88 : 1;
    const fold = { w: [-6, -7], t: [[-19, -3], [-17, 1], [-13, 3]] };
    const spread = { w: [3, -15], t: [[-3, -31], [-16, -27], [-25, -17], [-23, -6]] };
    const L = (a, b) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
    const rot = (p) => { const c = Math.cos(flap), s = Math.sin(flap); return [rx + (p[0] * c - p[1] * s) * sc, ry + (p[0] * s + p[1] * c) * sc]; };
    const wrist = rot(L(fold.w, spread.w));
    const tips = [];
    for (let i = 0; i < 4; i++) tips.push(rot(L(fold.t[Math.min(i, 2)], spread.t[i])));
    g.beginPath();
    g.moveTo(rx, ry); g.lineTo(wrist[0], wrist[1]);
    for (let i = 0; i < 4; i++) {
      const tp = tips[i];
      g.lineTo(tp[0], tp[1]);
      const nx = i < 3 ? tips[i + 1] : [rx - 6, ry + 2];
      g.quadraticCurveTo((tp[0] + nx[0]) / 2 + 2, (tp[1] + nx[1]) / 2 + 3, nx[0], nx[1]);
      if (i < 3) g.lineTo(wrist[0], wrist[1]);
    }
    g.closePath();
    g.fillStyle = lg(g, rx, ry - 20, rx, ry + 4, [[0, rgba(pal.base, 0.95)], [1, rgba(pal.dark, 0.95)]]);
    g.fill();
    g.strokeStyle = pal.dark; g.lineWidth = 0.4; g.stroke();
    g.strokeStyle = pal.light; g.lineCap = 'round';
    g.lineWidth = 1.3; g.beginPath(); g.moveTo(rx, ry); g.lineTo(wrist[0], wrist[1]); g.stroke();
    g.lineWidth = 0.7;
    for (const tp of tips) { g.beginPath(); g.moveTo(wrist[0], wrist[1]); g.lineTo(tp[0], tp[1]); g.stroke(); }
    g.fillStyle = pal.horn; g.beginPath(); g.arc(wrist[0], wrist[1], 1, 0, TAU); g.fill();
  }
  function insectWingDraw(g, R, part, A) {
    const pal = part.pal;
    const root = R.top(0.05);
    const f = Math.max(A.fly || 0, A.atk >= 0 ? 0.4 : 0);
    for (let k = 0; k < 2; k++) {
      const jit = f > 0 ? Math.sin(A.t * 60 + k) * 0.18 * f : 0;
      const a = Math.PI + 0.2 - f * 0.9 + k * 0.16 + jit;
      g.save(); g.translate(root[0] - k * 2, root[1]); g.rotate(a);
      g.beginPath(); g.ellipse(13, 0, 13.5, 3.6 - k * 0.6, 0, 0, TAU);
      g.fillStyle = rgba(pal.glowLight, 0.16); g.fill();
      g.strokeStyle = rgba(pal.light, 0.7); g.lineWidth = 0.35; g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(26, 0); g.moveTo(5, 0); g.lineTo(14, -2.5); g.moveTo(9, 0); g.lineTo(20, 2.4); g.moveTo(15, 0); g.lineTo(24, -1.6); g.stroke();
      g.restore();
    }
  }
  function backDraw(g, R, part, A) {
    const pal = part.pal, arch = part.arch;
    if (arch === 'wing') { wingDraw(g, R, part, A, false); return; }
    if (arch === 'insectwing') { insectWingDraw(g, R, part, A); return; }
    if (arch === 'shell') {
      g.beginPath();
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const t = lerp(-0.9, 0.7, i / n), p = R.top(t), nn = R.topN(t);
        const h = Math.sin((i / n) * Math.PI) * 6.5 + 0.8;
        const x = p[0] + nn[0] * h, y = p[1] + nn[1] * h;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      for (let i = n; i >= 0; i--) { const t = lerp(-0.9, 0.7, i / n), p = R.top(t); g.lineTo(p[0], p[1] + 1.4); }
      g.closePath();
      const c = R.top(-0.1);
      fs(g, lg(g, 0, c[1] - 8, 0, c[1] + 2, [[0, shade(pal.light, 0.1)], [0.6, pal.base], [1, pal.dark]]), pal.dark, 0.6);
      g.strokeStyle = rgba(pal.dark, 0.7); g.lineWidth = 0.45;
      for (let i = 1; i < 6; i++) {
        const t = lerp(-0.9, 0.7, i / 6), p = R.top(t), nn = R.topN(t);
        const h = Math.sin((i / 6) * Math.PI) * 6.5;
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + nn[0] * h, p[1] + nn[1] * h); g.stroke();
      }
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = lerp(-0.9, 0.7, i / n), p = R.top(t), nn = R.topN(t);
        const h = Math.sin((i / n) * Math.PI) * 3.4;
        if (i === 0) g.moveTo(p[0] + nn[0] * h, p[1] + nn[1] * h); else g.lineTo(p[0] + nn[0] * h, p[1] + nn[1] * h);
      }
      g.stroke();
      return;
    }
    if (arch === 'fin') {
      const ch = A.charge || 0;
      for (let i = 0; i < 7; i++) {
        const t = 0.5 - i * 0.21, p = R.top(t), nn = R.topN(t);
        const h = 6.2 - Math.abs(i - 2) * 0.75, w = 2.2;
        const tx = -nn[1], ty = nn[0];
        g.beginPath();
        g.moveTo(p[0] - tx * w, p[1] - ty * w);
        g.lineTo(p[0] + nn[0] * h * 0.55 - tx * w * 1.1, p[1] + nn[1] * h * 0.55 - ty * w * 1.1);
        g.lineTo(p[0] + nn[0] * h * 0.62 - tx * w * 0.4, p[1] + nn[1] * h * 0.62 - ty * w * 0.4);
        g.lineTo(p[0] + nn[0] * h - tx * 0.3, p[1] + nn[1] * h - ty * 0.3);
        g.lineTo(p[0] + nn[0] * h * 0.7 + tx * w * 0.6, p[1] + nn[1] * h * 0.7 + ty * w * 0.6);
        g.lineTo(p[0] + tx * w, p[1] + ty * w);
        g.closePath();
        fs(g, lg(g, p[0], p[1] - h, p[0], p[1], [[0, shade(pal.horn, ch * 0.5)], [1, pal.base]]), pal.dark, 0.35);
        if (ch > 0.05) glow(g, p[0] + nn[0] * h * 0.6, p[1] + nn[1] * h * 0.6, 3.4 + ch * 2, pal.glow, ch * 0.9);
      }
      return;
    }
    if (arch === 'crystal') {
      const r = mulberry32(part.seed);
      const pulse = 0.6 + Math.sin(A.t * 2.4) * 0.2 + (A.charge || 0) * 0.5;
      for (let i = 0; i < 6; i++) {
        const t = -0.55 + i * 0.18, p = R.top(t), nn = R.topN(t);
        const a = Math.atan2(nn[1], nn[0]) + (r() - 0.6) * 0.7;
        const len = 6 + r() * 5, wd = 1.3 + r() * 0.8;
        g.save(); g.translate(p[0], p[1] + 0.8); g.rotate(a);
        g.beginPath(); g.moveTo(0, -wd); g.lineTo(len * 0.8, -wd * 0.9); g.lineTo(len, 0); g.lineTo(len * 0.8, wd * 0.9); g.lineTo(0, wd); g.closePath();
        fs(g, lg(g, 0, -wd, 0, wd, [[0, rgba(pal.glowLight, 0.85)], [0.5, rgba(pal.glow, 0.7)], [1, rgba(shade(pal.glow, -0.6), 0.9)]]), rgba(pal.glowLight, 0.8), 0.25);
        g.restore();
        glow(g, p[0] + Math.cos(a) * len * 0.5, p[1] + Math.sin(a) * len * 0.5, len * 0.5, pal.glow, 0.3 * pulse);
      }
      return;
    }
    if (arch === 'volcano') {
      for (const t of [-0.5, 0.08]) {
        const p = R.top(t), nn = R.topN(t), tx = -nn[1], ty = nn[0];
        const h = t < 0 ? 7 : 5.5, w = t < 0 ? 5.5 : 4.4;
        g.beginPath();
        g.moveTo(p[0] - tx * w, p[1] - ty * w + 1);
        g.lineTo(p[0] + nn[0] * h - tx * w * 0.35, p[1] + nn[1] * h - ty * w * 0.35);
        g.lineTo(p[0] + nn[0] * h + tx * w * 0.35, p[1] + nn[1] * h + ty * w * 0.35);
        g.lineTo(p[0] + tx * w, p[1] + ty * w + 1);
        g.closePath();
        fs(g, lg(g, 0, p[1] - h, 0, p[1], [[0, pal.light], [1, pal.dark]]), pal.dark, 0.4);
        const cx = p[0] + nn[0] * h, cy = p[1] + nn[1] * h;
        g.beginPath(); g.ellipse(cx, cy, w * 0.38, 0.8, Math.atan2(ty, tx), 0, TAU); g.fillStyle = '#ffb347'; g.fill();
        glow(g, cx, cy, 5, '#ff6a1a', 0.75 + Math.sin(A.t * 4 + t) * 0.15);
        g.strokeStyle = 'rgba(255,120,30,0.75)'; g.lineWidth = 0.4;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - tx * 1.5 - nn[0] * h * 0.6, cy - ty * 1.5 - nn[1] * h * 0.6); g.stroke();
      }
      return;
    }
    if (arch === 'spine') {
      g.fillStyle = pal.horn; g.strokeStyle = pal.dark; g.lineWidth = 0.35;
      for (let i = 0; i < 7; i++) {
        const t = 0.5 - i * 0.22, p = R.top(t), nn = R.topN(t);
        const a = Math.atan2(nn[1], nn[0]) - 0.55;
        tube(g, chain(p[0], p[1] + 0.6, a, 4, (8.5 - i * 0.6) / 3, () => -0.12), [1.1, 0.75, 0.4, 0.05]);
        g.fill(); g.stroke();
      }
      return;
    }
    if (arch === 'sac') {
      for (let i = 0; i < 3; i++) {
        const t = -0.5 + i * 0.36, p = R.top(t), nn = R.topN(t);
        const rr = 3.4 + Math.sin(A.t * 2.4 + i) * 0.35 + (i === 1 ? 0.8 : 0);
        const x = p[0] + nn[0] * rr * 0.7, y = p[1] + nn[1] * rr * 0.7;
        g.beginPath(); g.arc(x, y, rr, 0, TAU);
        fs(g, lg(g, x, y - rr, x, y + rr, [[0, rgba(pal.glowLight, 0.75)], [1, rgba(shade(pal.glow, -0.4), 0.9)]]), pal.dark, 0.4);
        glow(g, x, y, rr * 1.4, pal.glow, 0.35);
        g.beginPath(); g.arc(x - rr * 0.35, y - rr * 0.35, rr * 0.25, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
      }
    }
  }

  /* ---------- 組み立て ---------- */
  function drawCanon(g, V, A, x, y, s, facing = 1) {
    const R = rig(V, A);
    V_legs = V.P.legs.arch;
    g.save();
    g.translate(x, y);
    g.scale(s * facing, s);
    if (A.dead) { g.translate(0, A.dead * 5); g.rotate(-A.dead * 0.55); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    const legs = V.P.legs, arms = V.P.arms, back = V.P.back;
    const ghostAlpha = (slot) => { g.globalAlpha = V.ghost && V.ghost !== slot ? 0.5 : 1; };
    // 奥側
    ghostAlpha('back');
    if (back.arch === 'wing' && (A.fly || 0) > 0.05) wingDraw(g, R, back, A, true);
    ghostAlpha('legs');
    if (legs.arch === 'biped') legsBiped(g, R, legs.pal.far, A, true);
    else if (legs.arch === 'quad') legsQuad(g, R, legs.pal.far, A, true);
    else if (legs.arch === 'multi') legsMulti(g, R, legs.pal.far, A, true);
    else if (legs.arch === 'hop') legsHop(g, R, legs.pal.far, A, true);
    ghostAlpha('arms');
    armDraw(g, R, arms, A, true);
    ghostAlpha('tail');
    tailDraw(g, R, V.P.tail, A);
    ghostAlpha('legs');
    if (legs.arch === 'serpent') legsSerpent(g, R, legs.pal, A);
    ghostAlpha('body');
    body(g, R, V.P.body, A);
    ghostAlpha('back');
    backDraw(g, R, back, A);
    ghostAlpha('head');
    neckDraw(g, R, V.P.head);
    headDraw(g, R, V.P.head, A, V);
    // 手前側
    ghostAlpha('legs');
    if (legs.arch === 'biped') legsBiped(g, R, legs.pal, A, false);
    else if (legs.arch === 'quad') legsQuad(g, R, legs.pal, A, false);
    else if (legs.arch === 'multi') legsMulti(g, R, legs.pal, A, false);
    else if (legs.arch === 'hop') legsHop(g, R, legs.pal, A, false);
    ghostAlpha('arms');
    armDraw(g, R, arms, A, false);
    g.globalAlpha = 1;
    g.restore();
    return R;
  }

  function bounds(V) {
    const A = anim();
    const R = rig(V, A);
    const h = V.P.head.arch, b = V.P.back.arch, t = V.P.tail.arch, l = V.P.legs.arch;
    let x0 = R.rear[0] - TAIL_BACK[t] * 0.9, x1 = R.head[0] + HEAD_FWD[h];
    if (l === 'serpent') x0 = Math.min(x0, R.hipBack[0] - 42);
    if (l === 'multi') { x0 = Math.min(x0, -R.rx - 16); x1 = Math.max(x1, R.rx + 16); }
    if (b === 'wing') x0 = Math.min(x0, R.top(0.12)[0] - 21);
    if (b === 'insectwing') x0 = Math.min(x0, R.top(0.05)[0] - 28);
    x1 = Math.max(x1, R.shoulder[0] + 16);
    let y0 = Math.min(R.head[1] - HEAD_TOP[h], R.top(0)[1] - BACK_UP[b]);
    if (t === 'scorpion') y0 = Math.min(y0, R.rear[1] - 18);
    return { x0, x1, y0, y1: 1.5 };
  }

  function portraitDraw(g, W, H, V, A, opts = {}) {
    g.clearRect(0, 0, W, H);
    if (opts.bg !== false) {
      const gr = g.createRadialGradient(W * 0.5, H * 0.62, 0, W * 0.5, H * 0.62, Math.max(W, H) * 0.75);
      gr.addColorStop(0, opts.bgA || '#3a1d22'); gr.addColorStop(1, opts.bgB || '#0e0a0d');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    const b = bounds(V);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const s = Math.min((W * (opts.fitW || 0.88)) / bw, (H * (opts.fitH || 0.8)) / bh);
    const gy = H - (H - bh * s) * 0.42;
    const ox = W / 2 - (b.x0 + bw / 2) * s;
    if (opts.bg !== false) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.ellipse(ox + (b.x0 + bw / 2) * s * 0.2, gy, bw * s * 0.42, Math.max(2, s * 2.2), 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(179,139,77,0.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(W, gy + 0.5); g.stroke();
    }
    drawCanon(g, V, A, ox, gy, s, 1);
  }
  function portrait(canvas, V, opts = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 160, h = canvas.clientHeight || 120;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    portraitDraw(canvas.getContext('2d'), canvas.width, canvas.height, V, opts.A || anim(), opts);
  }

  return { anim, visOf, visOfParts, rig, drawCanon, bounds, portrait, portraitDraw, palOf, glow, tube, capsule, chain, radii, MOUTH };
})();

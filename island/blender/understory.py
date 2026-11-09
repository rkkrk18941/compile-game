"""Understorey and ground plants:
  alocasia (クワズイモ), shrub, seedling, grass/beach grass/sedge/tussock clumps,
  beach morning glory (グンバイヒルガオ), pitcher plant (ウツボカズラ),
  glowing mushrooms (ヤコウタケ) on a log, glassbloom (ガラスバナ, endemic to the ridge).

  python island/blender/understory.py [--preview] [--notex]
"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import ASSETS, MeshBuilder, export_glb, reset, rock_blob, rot_matrix
from plantlib import (Part, bake_card, bark_texture, build_plant, leaf_colors, leaf_geom, preview_render, ribbon,
                      save_bark, tube)
from trees import TreeBuilder, cluster_texture, crown_normals

OUT = os.path.join(ASSETS, "plants")


def rotz(v, a):
    c, s = math.cos(a), math.sin(a)
    return v @ np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]).T


# ============================================================================ textures
def alocasia_texture():
    """Sagittate leaf, 0.9 m long, with raised primary and secondary veins."""
    rg = np.random.default_rng(41)
    b = {"blade": MeshBuilder(), "vein": MeshBuilder()}
    L, W = 0.9, 0.7
    cx, cy = 0.5, 0.08
    nu, nv = 48, 40
    verts, tris, cols = [], [], []
    for j in range(nv + 1):
        t = j / nv            # 0 at the sinus/petiole, 1 at the tip
        y = cy + t * L
        for i in range(nu + 1):
            k = i / nu * 2 - 1
            # outline: broad heart, two basal lobes extend below the petiole attachment
            half = W / 2 * (math.sin(math.pi * min(1, t * 0.82 + 0.18)) ** 0.75)
            x = cx + k * half
            yy = y - 0.16 * (abs(k) ** 1.6) * (1 - t) ** 2 * 1.6
            wave = 0.006 * math.sin(k * 14 + t * 9)
            verts.append((x, yy, wave * abs(k)))
            base = np.array([0.05, 0.13, 0.025]) * (0.9 + 0.2 * rg.random())
            c = base * (1.0 + 0.25 * (1 - abs(k))) * (0.95 + 0.1 * t)
            cols.append((*c, 1))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            tris += [(a, a + 1, a + nu + 1), (a + 1, a + nu + 2, a + nu + 1)]
    b["blade"].add(np.array(verts), np.array(tris), np.array(cols))
    # primary vein + 7 pairs of secondary veins
    def vein(p0, p1, r):
        pts = [p0 + (p1 - p0) * t for t in np.linspace(0, 1, 8)]
        v, f, uv, c = tube(pts, [r] * 8, sides=4)
        b["vein"].add(v + np.array([0, 0, 0.002]), f, np.tile([0.16, 0.24, 0.07, 1], (len(v), 1)), uv)
    vein(np.array([cx, cy, 0]), np.array([cx, cy + L * 0.98, 0]), 0.006)
    for s in (-1, 1):
        for k in range(1, 8):
            t = k / 8.5
            p0 = np.array([cx, cy + t * L * 0.85, 0])
            half = W / 2 * (math.sin(math.pi * min(1, (t + 0.08) * 0.82 + 0.18)) ** 0.75)
            p1 = np.array([cx + s * half * 0.92, cy + t * L * 0.85 + 0.12 + 0.08 * (1 - t), 0])
            vein(p0, p1, 0.0035)
        # basal lobe veins
        vein(np.array([cx, cy + 0.02, 0]), np.array([cx + s * W * 0.33, cy - 0.12, 0]), 0.004)
    bake_card("alocasia", b, 1.0, 1.0, res=(1024, 1024))


def blades_texture():
    """Grass card atlas (far grass) - 4 clumps in a row."""
    rg = np.random.default_rng(43)
    b = {"blade": MeshBuilder()}
    for k in range(4):
        cx = 0.25 + k * 0.5
        for i in range(70):
            h = rg.uniform(0.25, 0.48)
            w = rg.uniform(0.006, 0.012)
            x0 = cx + rg.normal(0, 0.05)
            lean = rg.normal(0, 0.12)
            pts = [(x0 + lean * t * t * h * 2, t * h * 1.0) for t in np.linspace(0, 1, 6)]
            verts, tris, cols = [], [], []
            for j, (x, y) in enumerate(pts):
                t = j / 5
                ww = w * (1 - t) + 0.0008
                verts += [(x - ww / 2, y + 0.02, 0), (x + ww / 2, y + 0.02, 0)]
                c = np.array([0.08, 0.16, 0.03]) * (0.55 + 0.7 * t) * rg.uniform(0.8, 1.2)
                if rg.random() < 0.1:
                    c = np.array([0.30, 0.26, 0.12]) * (0.6 + 0.5 * t)
                cols += [(*c, 1)] * 2
            for j in range(5):
                a = j * 2
                tris += [(a, a + 1, a + 2), (a + 1, a + 3, a + 2)]
            b["blade"].add(np.array(verts), np.array(tris), np.array(cols))
    bake_card("grasscard", b, 2.0, 0.5, res=(1024, 256), margin_fill=8)


def morning_glory_texture():
    """Atlas: 2 round, notched leaves (left) and a pink trumpet flower face (right)."""
    rg = np.random.default_rng(44)
    b = {"leaf": MeshBuilder(), "petal": MeshBuilder()}
    for k in range(2):
        cx, cy = 0.05, 0.03 + k * 0.05
        verts, tris, cols = [], [], []
        n = 28
        verts.append((cx, cy, 0))
        cols.append((0.06, 0.14, 0.03, 1))
        for i in range(n + 1):
            a = i / n * 2 * math.pi
            r = 0.022 * (1 - 0.35 * math.exp(-((a - math.pi / 2) / 0.25) ** 2))  # notch at the tip
            verts.append((cx + math.cos(a) * r * 1.05, cy + math.sin(a) * r, 0))
            cols.append((0.08, 0.18, 0.04, 1))
        for i in range(n):
            tris.append((0, i + 1, i + 2))
        b["leaf"].add(np.array(verts), np.array(tris), np.array(cols))
    # flower: pink with darker throat
    cx, cy = 0.15, 0.05
    verts, tris, cols = [(cx, cy, 0)], [], [(0.25, 0.02, 0.12, 1)]
    for ring, r in enumerate((0.012, 0.03, 0.042)):
        for i in range(32):
            a = i / 32 * 2 * math.pi
            rr = r * (1 + 0.05 * math.cos(a * 5))
            verts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr, 0))
            c = [(0.30, 0.02, 0.14), (0.62, 0.12, 0.38), (0.72, 0.22, 0.48)][ring]
            cols.append((*c, 1))
    for i in range(32):
        tris.append((0, 1 + i, 1 + (i + 1) % 32))
    for ring in range(2):
        for i in range(32):
            a = 1 + ring * 32 + i
            b_ = 1 + ring * 32 + (i + 1) % 32
            tris += [(a, a + 32, b_), (b_, a + 32, b_ + 32)]
    b["petal"].add(np.array(verts), np.array(tris), np.array(cols))
    bake_card("morningglory", b, 0.2, 0.1, res=(512, 256), margin_fill=8)


def pitcher_texture():
    """Mottled red/green pitcher skin (tileable, u around, v up)."""
    n = 256
    from lib import fft_noise, linear_to_srgb, save_webp
    from plantlib import normal_from_height
    spots = np.clip(fft_noise(n, 1.4, 51) * 3 - 0.6, 0, 1)
    vgrad = np.linspace(0, 1, n)[:, None] * np.ones((1, n))
    base = np.array([0.10, 0.20, 0.04])
    red = np.array([0.36, 0.04, 0.05])
    alb = base * (1 - spots[..., None]) + red * spots[..., None]
    alb = alb * (1 - vgrad[..., None] * 0.3) + red * vgrad[..., None] * 0.35  # redder toward the rim
    ribs = np.abs(np.sin(np.linspace(0, 6 * np.pi, n)))[None, :] ** 8
    h = 0.4 * ribs + 0.1 * fft_noise(n, 1.0, 52)
    save_webp(linear_to_srgb(alb), os.path.join(OUT, "pitcher_albedo.webp"), quality=88)
    save_webp(normal_from_height(h, 2.0), os.path.join(OUT, "pitcher_normal.webp"), quality=88)


# ============================================================================ models
def leaf_surface(L, W, rg, nu=6, nv=8, droop=0.35, cup=0.12, twist=0.0):
    """A curved leaf surface (local: base at origin, pointing +Y), with UVs spanning [0,1]."""
    verts, uvs = [], []
    for j in range(nv + 1):
        t = j / nv
        for i in range(nu + 1):
            k = i / nu * 2 - 1
            x = k * W / 2
            y = t * L
            z = cup * W * k * k - droop * L * t * t + 0.02 * math.sin(k * 6 + t * 5)
            if twist:
                a = twist * t
                x, z = x * math.cos(a) - z * math.sin(a), x * math.sin(a) + z * math.cos(a)
            verts.append((x, y, z))
            uvs.append((0.5 + k * 0.5, t))
    tris = []
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            tris += [(a, a + 1, a + nu + 1), (a + 1, a + nu + 2, a + nu + 1)]
    return np.array(verts), np.array(tris), np.array(uvs)


def orient(v, pitch, yaw, origin):
    """Rotate leaf-local verts: tilt the leaf (pointing +Y) up by pitch, then yaw about Z."""
    cp, sp = math.cos(pitch), math.sin(pitch)
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    v = v @ Rx.T
    v = rotz(v, yaw)
    return v + origin


def alocasia(seed):
    rg = np.random.default_rng(seed)
    parts = {"stem": Part(), "leaf": Part()}
    phase = rg.random()
    sh = rg.uniform(0.15, 0.6)
    parts["stem"].add(tube([np.array([0, 0, -0.1]), np.array([0, 0, sh * 0.5]), np.array([0.02, 0, sh])], [0.09, 0.075, 0.06],
                           sides=8, uv_v_scale=2.0, color_fn=lambda t, s: (0, 0, phase, 1)))
    nl = rg.integers(3, 7)
    for i in range(nl):
        yaw = i * math.radians(137.5) + rg.uniform(-0.3, 0.3)
        pl = rg.uniform(0.6, 1.3)
        el = math.radians(rg.uniform(50, 75))
        d = np.array([math.cos(el) * math.cos(yaw), math.cos(el) * math.sin(yaw), math.sin(el)])
        p0 = np.array([0, 0, sh * 0.9])
        p1 = p0 + d * pl * 0.5 + np.array([0, 0, pl * 0.1])
        p2 = p0 + d * pl
        parts["stem"].add(tube([p0, p1, p2], [0.025, 0.02, 0.016], sides=6, uv_v_scale=2.0,
                               color_fn=lambda t, s: (0, 0.5 * t, phase, 1)))
        L = rg.uniform(0.6, 1.0)
        v, f, uv = leaf_surface(L, L * 1.0, rg, droop=rg.uniform(0.15, 0.4), cup=0.1)
        # the texture's petiole attachment sits 8% up the card and the lobes hang below it
        v[:, 1] -= 0.16 * L
        v = orient(v, math.radians(rg.uniform(-25, 10)), yaw - math.pi / 2, p2)
        cols = np.column_stack([np.clip(np.abs(uv[:, 0] - 0.5) * 2 * uv[:, 1], 0, 1), uv[:, 1] * 0.8 + 0.2,
                                np.full(len(v), rg.random()), np.ones(len(v))]).astype(np.float32)
        parts["leaf"].add((v, f, uv, cols))
    return parts


def shrub(seed, lod=0):
    rg = np.random.default_rng(seed)
    parts = {"bark": Part(), "leaf": Part()}
    tb = TreeBuilder(rg, lod, parts, card_size=0.85, cards_per_tip=6)
    for i in range(rg.integers(2, 5)):
        a = rg.uniform(0, 2 * math.pi)
        d = np.array([math.cos(a) * 0.5, math.sin(a) * 0.5, 1.0])
        tb.branch(np.array([0, 0, -0.05]), d / np.linalg.norm(d), rg.uniform(0.6, 1.1), 0.025, 2, spread=0.7, photo=0.3)
    cc = np.array([0, 0, 0.9])
    tb.emit_cards(cc, 1.0)
    return parts, cc


def seedling(seed):
    rg = np.random.default_rng(seed)
    parts = {"stem": Part(), "leaf": Part()}
    phase = rg.random()
    H = rg.uniform(0.25, 0.7)
    parts["stem"].add(tube([np.array([0, 0, -0.02]), np.array([0.01, 0, H * 0.5]), np.array([0, 0.01, H])], [0.008, 0.006, 0.004],
                           sides=4, uv_v_scale=3.0, color_fn=lambda t, s: (0, t, phase, 1)))
    for i in range(rg.integers(4, 9)):
        yaw = i * math.radians(137.5)
        h = H * rg.uniform(0.45, 1.0)
        L = rg.uniform(0.09, 0.2)
        v, f, uv = leaf_surface(L, L * 0.45, rg, nu=2, nv=4, droop=0.25, cup=0.15)
        v = orient(v, math.radians(rg.uniform(10, 35)), yaw, np.array([0, 0, h]))
        uv = uv * 0.5 + np.array([(i % 2) * 0.5, 0.5])
        cols = np.column_stack([uv[:, 1] * 0.8, np.full(len(v), 0.6), np.full(len(v), rg.random()), np.ones(len(v))]).astype(np.float32)
        parts["leaf"].add((v, f, uv, cols))
    return parts


def grass_clump(seed, kind):
    """Blade clump; kind: grass, beach, sedge, tussock. Colour is computed in the game shader;
    'Col' holds wind/AO data (R flutter, G sway, B phase, A height fraction)."""
    rg = np.random.default_rng(seed)
    mb = MeshBuilder()
    n, hr, wr, bend = {"grass": (11, (0.25, 0.55), (0.008, 0.014), 0.35), "beach": (20, (0.35, 0.75), (0.004, 0.008), 0.5),
                       "sedge": (14, (0.5, 1.0), (0.012, 0.02), 0.45), "tussock": (26, (0.18, 0.4), (0.003, 0.006), 0.6)}[kind]
    for i in range(n):
        h = rg.uniform(*hr)
        w = rg.uniform(*wr)
        a = rg.uniform(0, 2 * math.pi)
        lean = rg.uniform(0.1, 0.5) * bend
        x0, y0 = rg.normal(0, 0.05), rg.normal(0, 0.05)
        verts, tris, cols = [], [], []
        segs = 3
        ph = rg.random()
        for j in range(segs + 1):
            t = j / segs
            ww = w * (1 - t ** 1.5) + 0.0006
            off = lean * t * t * h * 2.5
            px, py = x0 + math.cos(a) * off, y0 + math.sin(a) * off
            pz = t * h * (1 - lean * 0.3 * t)
            sx, sy = -math.sin(a) * ww / 2, math.cos(a) * ww / 2
            fold = 0.003 if kind == "sedge" else 0.0
            verts += [(px - sx, py - sy, pz + fold), (px + sx, py + sy, pz + fold)]
            cols += [(t, t, ph, t)] * 2
        for j in range(segs):
            q = j * 2
            tris += [(q, q + 1, q + 2), (q + 1, q + 3, q + 2)]
        uvs = np.array([[k % 2, (k // 2) / segs] for k in range(len(verts))], dtype=float)
        mb.add(np.array(verts), np.array(tris), np.array(cols, dtype=np.float32), uvs)
    return mb


def morning_glory_patch(seed):
    rg = np.random.default_rng(seed)
    parts = {"vine": Part(), "leaf": Part()}
    phase = rg.random()
    for r in range(rg.integers(3, 6)):
        a = rg.uniform(0, 2 * math.pi)
        L = rg.uniform(0.8, 1.8)
        pts = []
        for t in np.linspace(0, 1, 10):
            ang = a + math.sin(t * 5 + r) * 0.4
            pts.append(np.array([math.cos(ang) * t * L, math.sin(ang) * t * L, 0.01 + 0.005 * math.sin(t * 13)]))
        parts["vine"].add(tube(pts, [0.004] * 10, sides=3, uv_v_scale=4.0, color_fn=lambda t, s: (0, 0, phase, 1)))
        for k in range(2, 10):
            p = pts[k]
            for side in (-1, 1):
                v, f, uv = leaf_surface(0.06, 0.055, rg, nu=2, nv=2, droop=0.0, cup=0.15)
                yaw = a + side * 1.2 + rg.uniform(-0.3, 0.3)
                v = orient(v, math.radians(rg.uniform(15, 40)), yaw - math.pi / 2, p + np.array([0, 0, 0.01]))
                cell = rg.integers(2)
                uv = uv * np.array([0.5, 0.5]) + np.array([0, cell * 0.5])
                cols = np.column_stack([uv[:, 1], np.full(len(v), 0.2), np.full(len(v), rg.random()), np.ones(len(v))]).astype(np.float32)
                parts["leaf"].add((v, f, uv, cols))
            if rg.random() < 0.18:
                # trumpet flower: a short cone facing up with the flower face on top
                v, f, uv = leaf_surface(0.085, 0.085, rg, nu=2, nv=2, droop=0.0, cup=0.0)
                v[:, 1] -= 0.0425
                v = orient(v, 0, rg.uniform(0, 6), p + np.array([0, 0, 0.06]))
                uv = uv * np.array([0.5, 1.0]) + np.array([0.5, 0])
                cols = np.column_stack([np.full(len(v), 0.5), np.full(len(v), 0.2), np.full(len(v), rg.random()), np.ones(len(v))]).astype(np.float32)
                parts["leaf"].add((v, f, uv, cols))
    return parts


def pitcher_plant(seed):
    """Rosette of strap leaves; tendrils end in large mottled pitchers with a lid."""
    rg = np.random.default_rng(seed)
    parts = {"leaf": Part(), "pitcher": Part()}
    phase = rg.random()
    for i in range(rg.integers(6, 10)):
        yaw = i * math.radians(137.5)
        L = rg.uniform(0.28, 0.42)
        v, f, uv = leaf_surface(L, L * 0.22, rg, nu=2, nv=5, droop=0.25, cup=0.1)
        v = orient(v, math.radians(rg.uniform(10, 40)), yaw, np.array([0, 0, 0.05]))
        uv = uv * np.array([0.5, 0.5]) + np.array([0.5, 0.5])   # use a seedling-leaf cell
        cols = np.column_stack([uv[:, 1], np.full(len(v), 0.4), np.full(len(v), rg.random()), np.ones(len(v))]).astype(np.float32)
        parts["leaf"].add((v, f, uv, cols))
        tip = v[-3]
        if rg.random() < 0.75:
            # tendril down to the ground, then the pitcher standing on it
            hgt = rg.uniform(0.16, 0.3)
            base = tip + np.array([math.cos(yaw) * 0.12, math.sin(yaw) * 0.12, 0])
            base[2] = 0.0
            parts["leaf"].add(tube([tip, (tip + base) / 2 + np.array([0, 0, 0.05]), base + np.array([0, 0, 0.03])],
                                   [0.004, 0.003, 0.003], sides=3, uv_v_scale=1.0, color_fn=lambda t, s: (0, 0.3, phase, 1)))
            prof = [(0.0, 0.0), (0.035, 0.01), (0.055, 0.05), (0.06, 0.12), (0.05, 0.2), (0.046, 0.24), (0.058, 0.26)]
            sides = 14
            verts, tris, uvs, cols = [], [], [], []
            sc = hgt / 0.26
            for j, (r, z) in enumerate(prof):
                for s in range(sides + 1):
                    a = s / sides * 2 * math.pi
                    rr = r * sc * (1 + (0.18 if j <= 3 and abs(math.sin(a / 2)) < 0.2 else 0))
                    verts.append(base + np.array([math.cos(a) * rr, math.sin(a) * rr, z * sc]))
                    uvs.append((s / sides, z / 0.26))
                    cols.append((0, 0.1, phase, 1))
            w = sides + 1
            for j in range(len(prof) - 1):
                for s in range(sides):
                    a = j * w + s
                    tris += [(a, a + 1, a + w), (a + 1, a + w + 1, a + w)]
            # lid
            lc = base + np.array([0, 0, 0.29 * sc])
            li = len(verts)
            verts.append(lc + np.array([-0.03 * sc, 0, 0.02 * sc]))
            uvs.append((0.5, 1))
            cols.append((0.3, 0.1, phase, 1))
            for s in range(9):
                a = math.pi * 0.5 + (s / 8 - 0.5) * 2.4
                verts.append(lc + np.array([math.cos(a) * 0.045 * sc, math.sin(a) * 0.045 * sc, 0.0]))
                uvs.append((s / 8, 0.95))
                cols.append((0.3, 0.1, phase, 1))
            for s in range(8):
                tris.append((li, li + 1 + s, li + 2 + s))
            parts["pitcher"].add((np.array(verts), np.array(tris), np.array(uvs), np.array(cols, dtype=np.float32)))
    return parts


def mushroom_log(seed):
    rg = np.random.default_rng(seed)
    parts = {"log": Part(), "cap": Part()}
    phase = rg.random()
    L = rg.uniform(1.2, 2.0)
    pts = [np.array([-L / 2 + t * L, 0.02 * math.sin(t * 5), 0.14 + 0.02 * math.sin(t * 3)]) for t in np.linspace(0, 1, 8)]
    parts["log"].add(tube(pts, np.linspace(0.17, 0.14, 8), sides=9, uv_v_scale=1.0, cap=True,
                          color_fn=lambda t, s: (0, 0, phase, 1), noise=lambda i, s: 0.06 * math.sin(s * 1.7 + i * 2.1)))
    # fruiting bodies in clusters along the log
    for c in range(rg.integers(3, 6)):
        t = rg.uniform(0.1, 0.9)
        a = rg.uniform(-1.6, 1.6)
        center = np.array([-L / 2 + t * L, math.sin(a) * 0.16, 0.14 + math.cos(a) * 0.16])
        for m in range(rg.integers(5, 14)):
            off = rg.normal(0, 0.035, 3)
            stem_h = rg.uniform(0.02, 0.05)
            capr = rg.uniform(0.008, 0.02)
            p0 = center + off
            nrm = np.array([0, math.sin(a), math.cos(a)])
            p1 = p0 + nrm * stem_h + np.array([0, 0, stem_h * 0.5])
            parts["cap"].add(tube([p0, p1], [0.0025, 0.002], sides=4, uv_v_scale=1.0, color_fn=lambda t, s: (0.6, 0, phase, 0.5)))
            # cap: shallow dome
            verts, tris, uvs, cols = [p1 + np.array([0, 0, capr * 0.55])], [], [(0.5, 0.5)], [(1.0, 0, phase, 1.0)]
            for s in range(10):
                aa = s / 10 * 2 * math.pi
                verts.append(p1 + np.array([math.cos(aa) * capr, math.sin(aa) * capr, 0]))
                uvs.append((0.5 + 0.5 * math.cos(aa), 0.5 + 0.5 * math.sin(aa)))
                cols.append((1.0, 0, phase, 1.0))
            for s in range(10):
                tris.append((0, 1 + s, 1 + (s + 1) % 10))
                tris.append((1 + s, 1 + (s + 1) % 10, 0))  # underside (gills), reversed winding
            parts["cap"].add((np.array(verts), np.array(tris), np.array(uvs), np.array(cols, dtype=np.float32)))
    return parts


def glassbloom(seed):
    """Fictional endemic of the black ridge: a stalk crowned with prismatic, glass-like petals."""
    rg = np.random.default_rng(seed)
    parts = {"stem": Part(), "crystal": Part()}
    phase = rg.random()
    for s in range(rg.integers(2, 5)):
        a = rg.uniform(0, 2 * math.pi)
        H = rg.uniform(0.35, 0.8)
        base = np.array([math.cos(a) * 0.08, math.sin(a) * 0.08, -0.02])
        top = base + np.array([math.cos(a) * 0.1, math.sin(a) * 0.1, H])
        mid = (base + top) / 2 + np.array([rg.normal(0, 0.03), rg.normal(0, 0.03), 0])
        parts["stem"].add(tube([base, mid, top], [0.008, 0.006, 0.004], sides=5, uv_v_scale=2.0,
                               color_fn=lambda t, s: (0, t, phase, 1)))
        # petals: elongated octahedral crystals radiating from the top
        for k in range(rg.integers(5, 9)):
            yaw = k / 7 * 2 * math.pi + rg.uniform(-0.2, 0.2)
            pitch = rg.uniform(0.3, 1.1)
            L = rg.uniform(0.05, 0.12)
            r = L * 0.22
            v = np.array([[0, 0, 0], [r, 0, L * 0.4], [0, r, L * 0.45], [-r, 0, L * 0.4], [0, -r, L * 0.35], [0, 0, L]])
            f = np.array([[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]])
            R = rot_matrix(yaw, pitch, 0)
            v = v @ R.T + top
            uv = np.zeros((6, 2))
            cols = np.tile([0.2, 0.0, phase, 1.0], (6, 1)).astype(np.float32)
            parts["crystal"].add((v, f, uv, cols))
    return parts


def main():
    preview = "--preview" in sys.argv
    if "--notex" not in sys.argv:
        alocasia_texture()
        blades_texture()
        morning_glory_texture()
        pitcher_texture()
        cluster_texture("leaves_shrub", 0.11, 0.05, "lance", (0.045, 0.11, 0.025), (0.1, 0.16, 0.05), 50, seed=8)
        a, h = bark_texture("rough", 256, seed=21)
        from plantlib import save_bark as sb
        sb("bark_twig", a * 0.9, h, 2.0)
    objs = []
    reset()
    M = lambda n: bpy.data.materials.get(n) or bpy.data.materials.new(n)
    for v in range(3):
        objs.append(build_plant(f"alocasia{v}_lod0", alocasia(700 + v), {"stem": M("stem_green"), "leaf": M("leaf_alocasia")}))
    for v in range(3):
        parts, cc = shrub(720 + v)
        ob = build_plant(f"shrub{v}_lod0", parts, {"bark": M("bark_twig"), "leaf": M("leaf_leaves_shrub")})
        crown_normals(ob, "leaf_leaves_shrub", cc)
        objs.append(ob)
    for v in range(3):
        objs.append(build_plant(f"seedling{v}_lod0", seedling(740 + v), {"stem": M("stem_green"), "leaf": M("leaf_leaves_shrub")}))
    for v in range(2):
        objs.append(build_plant(f"morningglory{v}_lod0", morning_glory_patch(760 + v), {"vine": M("stem_green"), "leaf": M("leaf_morningglory")}))
    for v in range(2):
        objs.append(build_plant(f"pitcher{v}_lod0", pitcher_plant(780 + v), {"leaf": M("leaf_leaves_shrub"), "pitcher": M("bark_pitcher")}))
    for v in range(2):
        objs.append(build_plant(f"mushlog{v}_lod0", mushroom_log(800 + v), {"log": M("bark_drift"), "cap": M("glow_mushroom")}))
    for v in range(2):
        objs.append(build_plant(f"glassbloom{v}_lod0", glassbloom(820 + v), {"stem": M("stem_dark"), "crystal": M("glass_crystal")}))
    for kind in ("grass", "beach", "sedge", "tussock"):
        for v in range(2):
            mb = grass_clump(840 + v * 7 + len(kind), kind)
            ob = mb.build(f"{kind}{v}_lod0", M("grass_" + kind))
            objs.append(ob)
    if preview:
        from palms import textured
        textured(M("leaf_alocasia"), os.path.join(OUT, "alocasia_albedo.webp"), os.path.join(OUT, "alocasia_normal.webp"), alpha=True)
        textured(M("leaf_leaves_shrub"), os.path.join(OUT, "leaves_shrub_albedo.webp"), os.path.join(OUT, "leaves_shrub_normal.webp"), alpha=True)
        textured(M("leaf_morningglory"), os.path.join(OUT, "morningglory_albedo.webp"), os.path.join(OUT, "morningglory_normal.webp"), alpha=True)
        textured(M("bark_pitcher"), os.path.join(OUT, "pitcher_albedo.webp"), os.path.join(OUT, "pitcher_normal.webp"))
        for i, o in enumerate(objs):
            o.location = ((i % 6) * 1.6, (i // 6) * 1.6, 0)
        here = os.path.dirname(os.path.abspath(__file__))
        preview_render(objs, os.path.join(here, ".understory_preview.png"), (4.0, -5.5, 3.2), (4.0, 3.5, 0.2), lens=26, res=(900, 600))
        for o in objs:
            o.location = (0, 0, 0)
    export_glb(objs, os.path.join(OUT, "understory.glb"))
    print("understory", os.path.getsize(os.path.join(OUT, "understory.glb")))


if __name__ == "__main__":
    main()

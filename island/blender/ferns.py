"""Tree fern (ヘゴ) and ground fern: bipinnate/pinnate frond textures baked from modelled
pinnae, arching frond ribbons, fibrous trunks and coiled fiddleheads.

  python island/blender/ferns.py [--preview] [--notex]
"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import ASSETS, MeshBuilder, export_glb, reset
from plantlib import (Part, bake_card, bark_texture, build_plant, leaf_colors, leaf_geom, preview_render, ribbon,
                      save_bark, tube)

OUT = os.path.join(ASSETS, "plants")


def rotz(v, a):
    c, s = math.cos(a), math.sin(a)
    return v @ np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]).T


def frond_bipinnate(mb_leaf, mb_rachis, rg, cx, L, Wmax, green, pinnule_len=0.058, stipe=0.22):
    """A bipinnate frond in the XY plane, base at (cx, 0), tip at (cx, L)."""
    n = 50
    ys = np.linspace(0, L, n)
    verts, tris, cols = [], [], []
    for i, y in enumerate(ys):
        w = 0.022 * (1 - y / L) + 0.003
        verts += [(cx - w / 2, y, 0.004), (cx + w / 2, y, 0.004)]
        c = np.array([0.20, 0.17, 0.08]) if y < stipe * L else np.array([0.12, 0.16, 0.05])
        cols += [(*c, 1), (*c, 1)]
    for i in range(n - 1):
        a = i * 2
        tris += [(a, a + 1, a + 2), (a + 1, a + 3, a + 2)]
    mb_rachis.add(np.array(verts), np.array(tris), np.array(cols))
    y = stipe * L
    side = 1
    while y < L * 0.97:
        t = (y - stipe * L) / (L * (0.97 - stipe))
        plen = Wmax * 0.5 * math.sin(math.pi * (0.1 + 0.9 * t)) ** 0.8 * rg.uniform(0.92, 1.05)
        ang = math.radians(74 + 12 * t)
        # pinna rachis
        d = np.array([math.sin(ang) * side, math.cos(ang), 0])
        base = np.array([cx, y, 0])
        k = 0.0
        pn = 0
        while k < plen * 0.96:
            tt = k / plen
            pl = pinnule_len * (1 - 0.75 * tt) * rg.uniform(0.85, 1.1) * (0.7 + 0.6 * math.sin(math.pi * (0.15 + 0.85 * t)))
            pw = pl * 0.4
            for ps in (1, -1):
                v, f = leaf_geom(pl, pw, rg, shape="lance", segs=4, side=1)
                pa = math.atan2(d[0], d[1]) + ps * math.radians(65) * side
                v = rotz(v, -pa)
                v = v + base + d * k + np.array([0, 0, rg.uniform(0, 0.002)])
                c = leaf_colors(v - (base + d * k), green * rg.uniform(0.85, 1.12), green * 1.2, rg, pl, pw)
                mb_leaf.add(v, f, c)
            k += pl * 0.3
            pn += 1
        # thin pinna rachis line
        pv = [base, base + d * plen]
        v, f, uv, c = tube(pv, [0.0025, 0.001], sides=3)
        mb_rachis.add(v, f, np.tile([0.12, 0.15, 0.05, 1], (len(v), 1)), uv)
        y += rg.uniform(0.045, 0.055) * (1.0 - 0.3 * t)
        side *= -1


def frond_pinnate(mb_leaf, mb_rachis, rg, cx, L, Wmax, green):
    """A once-pinnate frond (sword fern)."""
    n = 30
    ys = np.linspace(0, L, n)
    verts, tris, cols = [], [], []
    for i, y in enumerate(ys):
        w = 0.012 * (1 - y / L) + 0.002
        verts += [(cx - w / 2, y, 0.004), (cx + w / 2, y, 0.004)]
        cols += [(0.14, 0.15, 0.05, 1)] * 2
    for i in range(n - 1):
        a = i * 2
        tris += [(a, a + 1, a + 2), (a + 1, a + 3, a + 2)]
    mb_rachis.add(np.array(verts), np.array(tris), np.array(cols))
    y = 0.12 * L
    side = 1
    while y < L * 0.98:
        t = y / L
        pl = Wmax * 0.5 * math.sin(math.pi * (0.08 + 0.92 * t)) ** 0.6 * rg.uniform(0.9, 1.05)
        pw = pl * 0.24
        v, f = leaf_geom(pl, pw, rg, shape="lance", segs=6, side=1)
        a = math.radians(70 + 10 * t) * side
        v = rotz(v, -a)
        v = v + np.array([cx, y, rg.uniform(0, 0.002)])
        c = leaf_colors(v - np.array([cx, y, 0]), green * rg.uniform(0.85, 1.1), green * 1.15, rg, pl, pw)
        mb_leaf.add(v, f, c)
        y += pw * 0.9 * rg.uniform(0.95, 1.05)
        side *= -1


def textures():
    rg = np.random.default_rng(31)
    b = {"leaf": MeshBuilder(), "rachis": MeshBuilder()}
    # tree fern frond atlas: two fronds side by side, 2.4 m x 2.6 m
    frond_bipinnate(b["leaf"], b["rachis"], rg, 0.6, 2.6, 1.15, np.array([0.06, 0.13, 0.025]))
    frond_bipinnate(b["leaf"], b["rachis"], rg, 1.8, 2.6, 1.15, np.array([0.09, 0.15, 0.03]))
    bake_card("treefernfrond", b, 2.4, 2.6, res=(1024, 1024))
    rg = np.random.default_rng(32)
    b = {"leaf": MeshBuilder(), "rachis": MeshBuilder()}
    for k in range(4):
        frond_pinnate(b["leaf"], b["rachis"], rg, 0.15 + k * 0.3, 1.0, 0.28, np.array([0.07, 0.15, 0.03]) * (0.9 + 0.08 * k))
    bake_card("fernfrond", b, 1.2, 1.0, res=(1024, 1024))
    a, h = bark_texture("fern", 512, seed=11)
    save_bark("bark_fern", a, h, 4.0)


def arch(p0, d0, L, droop, nseg):
    pts = [p0.copy()]
    p = p0.copy()
    for k in range(1, nseg + 1):
        t = k / nseg
        d = d0 + np.array([0, 0, -droop * t ** 1.5])
        d /= np.linalg.norm(d)
        p = p + d * L / nseg
        pts.append(p.copy())
    pts = np.array(pts)
    ups = []
    for k in range(len(pts)):
        tg = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
        tg /= np.linalg.norm(tg)
        u = np.array([0, 0, 1.0]) - tg * tg[2]
        ups.append(u / (np.linalg.norm(u) + 1e-9))
    return pts, ups


def crozier(part, rg, base, phase):
    """Coiled young frond (fiddlehead)."""
    pts = []
    for t in np.linspace(0, 1, 18):
        r = 0.12 * (1 - t) ** 1.4 + 0.012
        a = t * 4.5 * math.pi
        pts.append(base + np.array([0, r * math.cos(a) - 0.12, 0.35 * t ** 0.6 + r * math.sin(a)]))
    part.add(tube(pts, np.linspace(0.022, 0.008, len(pts)), sides=6, uv_v_scale=3.0,
                  color_fn=lambda t, s: (0.0, 0.3 * t, phase, 1)))


def tree_fern(seed, lod):
    rg = np.random.default_rng(seed)
    parts = {"trunk": Part(), "frond": Part()}
    H = rg.uniform(2.8, 6.0)
    phase = rg.random()
    pts = [np.array([0, 0, -0.1])]
    d = np.array([rg.normal(0, 0.1), rg.normal(0, 0.1), 1.0])
    for k in range(8 if lod == 0 else 3):
        d = d + rg.normal(0, 0.05, 3)
        d[2] = max(d[2], 0.9)
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * H / (8 if lod == 0 else 3))
    r = [0.19 if k == 0 else 0.11 + 0.02 * math.sin(k) for k in range(len(pts))]
    parts["trunk"].add(tube(pts, r, sides=10 if lod == 0 else 6, uv_v_scale=1.0, uv_u_repeat=1,
                            color_fn=lambda t, s: (0.0, 0.0, phase, 1)))
    top = pts[-1]
    nf = (14 if lod == 0 else 8) + rg.integers(-2, 3)
    for i in range(nf):
        a = i * math.radians(137.5)
        age = i / nf
        el = math.radians(55 - 75 * age + rg.uniform(-6, 6))
        L = rg.uniform(2.2, 3.0)
        d0 = np.array([math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el)])
        fpts, ups = arch(top + d0 * 0.1, d0, L, 0.8 + 1.4 * age, 10 if lod == 0 else 5)
        cell = rg.integers(2)
        fp = rg.random()
        parts["frond"].add(ribbon(fpts, [L * 1.2 / 2.6] * len(fpts), ups, fold=0.25, segs_across=2 if lod == 0 else 1,
                                  u_range=(cell * 0.5, cell * 0.5 + 0.5),
                                  color_fn=lambda t, k, fp=fp: (abs(k) * (0.3 + 0.7 * t), t, fp, 1)))
    if lod == 0:
        for i in range(rg.integers(2, 5)):
            a = rg.uniform(0, 2 * math.pi)
            crozier(parts["trunk"], rg, top + np.array([math.cos(a) * 0.06, math.sin(a) * 0.06, 0.02]), phase)
    return parts


def ground_fern(seed, lod):
    rg = np.random.default_rng(seed)
    parts = {"frond": Part()}
    nf = rg.integers(9, 16)
    for i in range(nf):
        a = i * math.radians(137.5) + rg.uniform(-0.2, 0.2)
        el = math.radians(rg.uniform(25, 70))
        L = rg.uniform(0.6, 1.1)
        d0 = np.array([math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el)])
        fpts, ups = arch(np.array([0, 0, 0.02]), d0, L, 1.2, 6)
        cell = rg.integers(4)
        fp = rg.random()
        parts["frond"].add(ribbon(fpts, [0.3 * L] * len(fpts), ups, fold=0.2, segs_across=1,
                                  u_range=(cell * 0.25, cell * 0.25 + 0.25),
                                  color_fn=lambda t, k, fp=fp: (abs(k) * t, t * 0.6, fp, 1)))
    return parts


def main():
    preview = "--preview" in sys.argv
    if "--notex" not in sys.argv:
        textures()
    reset()
    objs = []
    for v in range(2):
        for lod in (0, 1):
            parts = tree_fern(500 + v, lod)
            mats = {"trunk": bpy.data.materials.get("bark_fern") or bpy.data.materials.new("bark_fern"),
                    "frond": bpy.data.materials.get("leaf_treefernfrond") or bpy.data.materials.new("leaf_treefernfrond")}
            objs.append(build_plant(f"treefern{v}_lod{lod}", parts, mats))
    if preview:
        from palms import textured
        textured(bpy.data.materials["bark_fern"], os.path.join(OUT, "bark_fern_albedo.webp"), os.path.join(OUT, "bark_fern_normal.webp"))
        textured(bpy.data.materials["leaf_treefernfrond"], os.path.join(OUT, "treefernfrond_albedo.webp"), os.path.join(OUT, "treefernfrond_normal.webp"), alpha=True)
        for i, o in enumerate(objs):
            o.hide_render = "lod1" in o.name
            o.location.x = (i // 2) * 7
        here = os.path.dirname(os.path.abspath(__file__))
        preview_render(objs, os.path.join(here, ".treefern_preview.png"), (3.5, -11, 3.5), (3.5, 0, 3.2), lens=30, res=(800, 600))
        for o in objs:
            o.location.x = 0
    export_glb(objs, os.path.join(OUT, "treefern.glb"))
    reset()
    objs = []
    for v in range(3):
        parts = ground_fern(600 + v, 0)
        mats = {"frond": bpy.data.materials.get("leaf_fernfrond") or bpy.data.materials.new("leaf_fernfrond")}
        objs.append(build_plant(f"fern{v}_lod0", parts, mats))
    export_glb(objs, os.path.join(OUT, "fern.glb"))
    print("ferns done")


if __name__ == "__main__":
    main()

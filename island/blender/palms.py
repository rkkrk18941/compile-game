"""Coconut palm (ココヤシ) and screw pine (アダン): textures, variants, LODs -> GLB.

  python island/blender/palms.py [--preview]
"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import ASSETS, MeshBuilder, export_glb, reset, rock_blob, rot_matrix
from plantlib import (Part, bake_card, bark_texture, build_plant, leaf_colors, leaf_geom, preview_render,
                      ribbon, save_bark, tube)

OUT = os.path.join(ASSETS, "plants")


# ============================================================================ textures
def frond_texture():
    """Atlas 4.4 m x 4.4 m: left half a living frond, right half a dead one."""
    rg = np.random.default_rng(5)
    builders = {"rachis": MeshBuilder(), "leaflet": MeshBuilder()}
    L = 4.4
    for variant, cx in (("green", 1.1), ("dead", 3.3)):
        dead = variant == "dead"
        # rachis: tapered strip
        n = 40
        ys = np.linspace(0, L * 0.99, n)
        wv = 0.065 * (1 - ys / L) ** 0.8 + 0.008
        verts, tris, cols = [], [], []
        for i, (y, w) in enumerate(zip(ys, wv)):
            verts += [(cx - w / 2, y, 0.004), (cx, y, 0.008), (cx + w / 2, y, 0.004)]
            t = y / L
            base = np.array([0.42, 0.40, 0.15]) if not dead else np.array([0.32, 0.24, 0.14])
            c = base * (0.8 + 0.3 * t)
            cols += [(*c, 1), (*(c * 1.15), 1), (*c, 1)]
        for i in range(n - 1):
            a = i * 3
            tris += [(a, a + 3, a + 1), (a + 1, a + 3, a + 4), (a + 1, a + 4, a + 2), (a + 2, a + 4, a + 5)]
        builders["rachis"].add(np.array(verts), np.array(tris), np.array(cols))
        # leaflets
        y = 0.85
        side = 1
        while y < L - 0.08:
            t = (y - 0.85) / (L - 0.85 - 0.08)
            ll = (0.38 + 0.62 * math.sin(math.pi * (0.12 + 0.86 * t))) * (0.95 if not dead else 0.8)
            ll *= rg.uniform(0.9, 1.08)
            if rg.random() < (0.05 if not dead else 0.25):
                ll *= rg.uniform(0.25, 0.6)  # broken leaflet
            if dead and rg.random() < 0.12:
                y += rg.uniform(0.02, 0.05)
                side *= -1
                continue
            lw = (0.034 + 0.008 * math.sin(math.pi * t)) * (0.7 if dead else 1.0) * rg.uniform(0.85, 1.1)
            ang = math.radians(52 + 18 * t + rg.uniform(-5, 5))
            v, f = leaf_geom(ll, lw, rg, shape="lance", segs=8, side=1)
            # rotate the leaflet (pointing +Y) out to its side and forward toward the tip
            th = -side * ang
            Rz = np.array([[math.cos(th), -math.sin(th), 0], [math.sin(th), math.cos(th), 0], [0, 0, 1]])
            vv = v @ Rz.T
            vv[:, 0] += cx + side * 0.012
            vv[:, 1] += y
            vv[:, 2] = vv[:, 2] * 0 + rg.uniform(0, 0.003)
            if not dead:
                base = np.array([0.075, 0.15, 0.024]) * rg.uniform(0.8, 1.2)
                edge = base * np.array([1.35, 1.25, 1.0])
                tipbrown = rg.random() < 0.25
            else:
                g = rg.uniform(0.7, 1.15)
                base = np.array([0.36, 0.27, 0.15]) * g
                edge = base * 0.85
                tipbrown = False
            c = leaf_colors(v, base, edge, rg, ll, lw, midrib=(1.25, 1.2, 0.8))
            if tipbrown:
                tt = np.clip((v[:, 1] / ll - 0.75) / 0.25, 0, 1)[:, None]
                c[:, :3] = c[:, :3] * (1 - tt) + np.array([0.33, 0.26, 0.13]) * tt
            builders["leaflet"].add(vv, f, c)
            y += rg.uniform(0.03, 0.039) * (1 if not dead else 1.25)
            side *= -1
    bake_card("palmfrond", builders, 4.4, L, res=(1024, 2048))


def pandanus_leaf_texture():
    """Long strap leaf with spiny margins, 0.12 m x 1.6 m."""
    rg = np.random.default_rng(9)
    mb = MeshBuilder()
    W, L = 0.24, 1.6
    for k, cx in enumerate((0.06, 0.18)):
        cx = 0.06 + k * 0.12
        n = 60
        ys = np.linspace(0, L, n)
        verts, cols, tris = [], [], []
        dead = k == 1
        for i, y in enumerate(ys):
            t = y / L
            w = 0.105 * (1 - t ** 3) + 0.006
            row = []
            for j in range(-3, 4):
                kk = j / 3
                # spines along the margin every ~2 cm
                sp = 0.0
                if abs(j) == 3 and i % 2 == 0:
                    sp = 0.004
                verts.append((cx + kk * (w / 2 + sp), y, 0))
                stripe = 0.9 + 0.1 * math.cos(kk * 9)
                base = np.array([0.055, 0.12, 0.028]) if not dead else np.array([0.30, 0.23, 0.12])
                c = base * stripe * (0.85 + 0.25 * t)
                if abs(kk) < 0.2:
                    c = c * 1.2
                cols.append((*c, 1))
        for i in range(n - 1):
            for j in range(6):
                a = i * 7 + j
                tris += [(a, a + 1, a + 7), (a + 1, a + 8, a + 7)]
        mb.add(np.array(verts), np.array(tris), np.array(cols))
    bake_card("pandanusleaf", {"leaf": mb}, W, L, res=(256, 2048), margin_fill=12)


# ============================================================================ coconut palm
def coconut_palm(seed, lod):
    rg = np.random.default_rng(seed)
    height = rg.uniform(8.5, 15.5)
    lean0 = math.radians(rg.uniform(12, 32))
    lean1 = math.radians(rg.uniform(0, 10))
    az = rg.uniform(0, 2 * math.pi)
    seg = 0.42 if lod == 0 else 1.4
    n = max(6, int(height / seg))
    pts = [np.zeros(3)]
    d_az = np.array([math.cos(az), math.sin(az), 0])
    for i in range(1, n + 1):
        t = i / n
        a = lean0 + (lean1 - lean0) * t ** 0.8 + 0.06 * math.sin(t * 7 + seed)
        d = d_az * math.sin(a) + np.array([0, 0, 1]) * math.cos(a)
        pts.append(pts[-1] + d * (height / n))
    pts = np.array(pts)

    def radius(t):
        return 0.15 + 0.13 * math.exp(-t * 18) - 0.03 * t + 0.008 * math.sin(t * 40 + seed)

    radii = [radius(i / n) for i in range(n + 1)]
    parts = {"trunk": Part(), "frond": Part(), "nut": Part()}
    phase = rg.random()

    def tcol(t, s):
        return (0.0, 0.0, phase, 1)

    parts["trunk"].add(tube(pts, radii, sides=14 if lod == 0 else 7, uv_v_scale=1.0, uv_u_repeat=1.0, color_fn=tcol,
                            noise=(lambda i, s: 0.02 * math.sin(s * 2.3 + i)) if lod == 0 else None))
    top = pts[-1]
    up = pts[-1] - pts[-2]
    up /= np.linalg.norm(up)
    # crown boot of fibrous leaf bases
    boot = [top - up * 0.6, top - up * 0.2, top + up * 0.25, top + up * 0.5]
    parts["trunk"].add(tube(boot, [radii[-1] * 1.05, 0.26, 0.24, 0.08], sides=12 if lod == 0 else 6, uv_v_scale=1.0,
                            color_fn=lambda t, s: (0.0, 0.15 * t, phase, 1)))

    nf = (28 if lod == 0 else 14) + (rg.integers(-3, 3) if lod == 0 else 0)
    golden = math.radians(137.5)
    for i in range(nf + 2):
        dead = i >= nf
        age = i / max(nf - 1, 1)
        if dead:
            el = math.radians(rg.uniform(-80, -65))
            age = 1.0
        else:
            el = math.radians(72 - 100 * age ** 0.85 + rg.uniform(-7, 7))
        a = i * golden + rg.uniform(-0.15, 0.15)
        L = rg.uniform(3.6, 4.6) * (0.75 if i < 2 else 1.0)
        d0 = np.array([math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el)])
        nseg = 12 if lod == 0 else 6
        p = top + up * 0.35 + d0 * 0.15
        fpts = [p.copy()]
        droop = (0.75 + 1.6 * age) if not dead else 0.25
        for k in range(1, nseg + 1):
            t = k / nseg
            d = d0 + np.array([0, 0, -droop * t ** 1.4])
            d /= np.linalg.norm(d)
            p = p + d * (L / nseg)
            fpts.append(p.copy())
        fpts = np.array(fpts)
        ups = []
        for k in range(len(fpts)):
            tang = fpts[min(k + 1, len(fpts) - 1)] - fpts[max(k - 1, 0)]
            tang /= np.linalg.norm(tang)
            u = np.array([0, 0, 1.0]) - tang * tang[2]
            u /= np.linalg.norm(u) + 1e-9
            ups.append(u)
        width = 2.2 * L / 4.4
        fold = -0.32 - 0.25 * age if not dead else -0.9
        twist = [0.25 * (k / nseg) ** 2 * (1 if i % 2 else -1) for k in range(len(fpts))]
        fphase = rg.random()

        def fcol(t, k, fphase=fphase):
            return (abs(k) * (0.4 + 0.6 * t), t, fphase, 1)

        parts["frond"].add(ribbon(fpts, [width] * len(fpts), ups, fold=fold, segs_across=2 if lod == 0 else 1,
                                  u_range=(0.5, 1.0) if dead else (0.0, 0.5), v_range=(0.0, 1.0), color_fn=fcol, twist=twist))
    # coconuts
    if lod == 0:
        for c in range(rg.integers(2, 4)):
            ca = rg.uniform(0, 2 * math.pi)
            cdir = np.array([math.cos(ca), math.sin(ca), 0])
            for k in range(rg.integers(3, 7)):
                v, f = rock_blob(0.12, 2, int(rg.integers(1e6)), squash=(1, 1, 1.22), bump=0.06, freq=1.5)
                pos = top + up * 0.05 + cdir * (0.28 + rg.uniform(0, 0.12)) + rg.normal(0, 0.09, 3) - np.array([0, 0, 0.25])
                R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(-1.2, 1.2), 0)
                v = v @ R.T + pos
                ripe = rg.random()
                col = np.array([0.16, 0.26, 0.05]) * (1 - ripe) + np.array([0.42, 0.30, 0.10]) * ripe * (ripe > 0.7)
                if ripe <= 0.7:
                    col = np.array([0.16, 0.26, 0.05]) * rg.uniform(0.8, 1.2)
                uv = np.zeros((len(v), 2))
                parts["nut"].mb.add(v, f, np.tile([*col, 1], (len(v), 1)), uv)
    return parts


def build_materials():
    mats = {}
    for name in ("trunk", "frond", "nut"):
        mats[name] = bpy.data.materials.new({"trunk": "bark_palm", "frond": "leaf_palmfrond", "nut": "fruit_vc"}[name])
    return mats


def pandanus(seed, lod):
    """Screw pine: short branching trunk on prop roots, spiral tufts of strap leaves."""
    rg = np.random.default_rng(seed)
    parts = {"trunk": Part(), "leaf": Part(), "nut": Part()}
    phase = rg.random()
    sides = 9 if lod == 0 else 5

    def tcol(t, s):
        return (0.0, 0.0, phase, 1)

    # prop roots
    nroots = rg.integers(5, 9) if lod == 0 else 3
    base_h = rg.uniform(0.9, 1.6)
    for r in range(nroots):
        a = r / nroots * 2 * math.pi + rg.uniform(-0.3, 0.3)
        spread = rg.uniform(0.7, 1.3)
        p0 = np.array([0, 0, base_h * rg.uniform(0.6, 1.0)])
        p1 = np.array([math.cos(a) * spread * 0.5, math.sin(a) * spread * 0.5, p0[2] * 0.55])
        p2 = np.array([math.cos(a) * spread, math.sin(a) * spread, -0.1])
        pts = [p0 + (p1 - p0) * t * 2 if t < 0.5 else p1 + (p2 - p1) * (t - 0.5) * 2 for t in np.linspace(0, 1, 5)]
        parts["trunk"].add(tube(pts, np.linspace(0.06, 0.045, 5), sides=6 if lod == 0 else 4, uv_v_scale=1.0, color_fn=tcol))

    # trunk + branches (recursive forks)
    def branch(p, d, length, r, depth):
        nseg = 4 if lod == 0 else 2
        pts = [p]
        for k in range(nseg):
            d = d + rg.normal(0, 0.12, 3)
            d[2] = max(d[2], 0.25)
            d /= np.linalg.norm(d)
            pts.append(pts[-1] + d * length / nseg)
        parts["trunk"].add(tube(pts, np.linspace(r, r * 0.72, len(pts)), sides=sides, uv_v_scale=1.5, color_fn=tcol))
        end = pts[-1]
        if depth == 0 or rg.random() < 0.15:
            tuft(end, d)
            return
        nb = 2 if rg.random() < 0.7 else 3
        for b in range(nb):
            nd = d + rg.normal(0, 0.55, 3)
            nd[2] = abs(nd[2]) + 0.35
            nd /= np.linalg.norm(nd)
            branch(end, nd, length * rg.uniform(0.6, 0.85), r * 0.72, depth - 1)

    def tuft(p, d):
        nl = 34 if lod == 0 else 12
        lphase = rg.random()
        for i in range(nl):
            a = i * math.radians(137.5) * 3 / 3 + rg.uniform(-0.1, 0.1)
            age = i / nl
            el = math.radians(75 - 110 * age + rg.uniform(-8, 8))
            L = rg.uniform(1.0, 1.55)
            d0 = np.array([math.cos(el) * math.cos(a), math.cos(el) * math.sin(a), math.sin(el)])
            nseg = 7 if lod == 0 else 3
            q = p + d0 * 0.05
            pts = [q.copy()]
            for k in range(1, nseg + 1):
                t = k / nseg
                dd = d0 + np.array([0, 0, -(0.6 + 1.4 * age) * t ** 1.3])
                dd /= np.linalg.norm(dd)
                q = q + dd * L / nseg
                pts.append(q.copy())
            ups = []
            for k in range(len(pts)):
                tang = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
                tang /= np.linalg.norm(tang)
                u = np.array([0, 0, 1.0]) - tang * tang[2]
                ups.append(u / (np.linalg.norm(u) + 1e-9))
            dead = age > 0.9 and rg.random() < 0.6
            parts["leaf"].add(ribbon(pts, [0.13] * len(pts), ups, fold=0.6, segs_across=1,
                                     u_range=(0.5, 1.0) if dead else (0.0, 0.5),
                                     color_fn=lambda t, k: (abs(k) * t * 0.6, t, lphase, 1)))
        if lod == 0 and rg.random() < 0.5:
            v, f = rock_blob(0.11, 2, int(rg.integers(1e6)), squash=(1, 1, 1.3), bump=0.25, freq=8.0)
            v = v + p - d * 0.25
            col = np.array([0.55, 0.25, 0.04]) if rg.random() < 0.5 else np.array([0.22, 0.30, 0.07])
            parts["nut"].mb.add(v, f, np.tile([*col, 1], (len(v), 1)), np.zeros((len(v), 2)))

    branch(np.array([0, 0, base_h * 0.8]), np.array([rg.normal(0, 0.2), rg.normal(0, 0.2), 1.0]) / 1.04,
           rg.uniform(1.5, 2.4), 0.11, 2)
    return parts


def main():
    preview = "--preview" in sys.argv
    if "--notex" not in sys.argv:
        frond_texture()
        pandanus_leaf_texture()
        for kind, nm, strength in (("palm", "bark_palm", 3.0), ("pandanus", "bark_pandanus", 3.0)):
            a, h = bark_texture(kind, 512, seed=3)
            save_bark(nm, a, h, strength)
    reset()
    objs = []
    for v in range(3):
        for lod in (0, 1):
            parts = coconut_palm(100 + v, lod)
            mats = {"trunk": bpy.data.materials.get("bark_palm") or bpy.data.materials.new("bark_palm"),
                    "frond": bpy.data.materials.get("leaf_palmfrond") or bpy.data.materials.new("leaf_palmfrond"),
                    "nut": bpy.data.materials.get("fruit_vc") or bpy.data.materials.new("fruit_vc")}
            ob = build_plant(f"palm{v}_lod{lod}", parts, mats)
            ob.location.x = v * 12
            objs.append(ob)
    if preview:
        render_preview_palms(objs)
    for o in objs:
        o.location.x = 0
    export_glb(objs, os.path.join(OUT, "palm.glb"))
    print("palm.glb", os.path.getsize(os.path.join(OUT, "palm.glb")))

    reset()
    objs = []
    for v in range(2):
        for lod in (0, 1):
            parts = pandanus(200 + v, lod)
            mats = {"trunk": bpy.data.materials.get("bark_pandanus") or bpy.data.materials.new("bark_pandanus"),
                    "leaf": bpy.data.materials.get("leaf_pandanusleaf") or bpy.data.materials.new("leaf_pandanusleaf"),
                    "nut": bpy.data.materials.get("fruit_vc") or bpy.data.materials.new("fruit_vc")}
            ob = build_plant(f"pandanus{v}_lod{lod}", parts, mats)
            objs.append(ob)
    export_glb(objs, os.path.join(OUT, "pandanus.glb"))
    print("pandanus.glb", os.path.getsize(os.path.join(OUT, "pandanus.glb")))


def textured(mat, albedo, normal, alpha=False):
    from lib import image_material
    a = bpy.data.images.load(albedo)
    n = bpy.data.images.load(normal)
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = a
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = n
    n.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.7


def render_preview_palms(objs):
    d = os.path.join(ASSETS, "plants")
    textured(bpy.data.materials["bark_palm"], os.path.join(d, "bark_palm_albedo.webp"), os.path.join(d, "bark_palm_normal.webp"))
    textured(bpy.data.materials["leaf_palmfrond"], os.path.join(d, "palmfrond_albedo.webp"), os.path.join(d, "palmfrond_normal.webp"), alpha=True)
    m = bpy.data.materials["fruit_vc"]
    a = m.node_tree.nodes.new("ShaderNodeAttribute")
    a.attribute_name = "Col"
    m.node_tree.links.new(a.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    for o in objs:
        o.hide_render = "lod1" in o.name
    here = os.path.dirname(os.path.abspath(__file__))
    preview_render(objs, os.path.join(here, ".palm_preview.png"), (12, -26, 7), (12, 0, 7), lens=32, res=(800, 600))


if __name__ == "__main__":
    main()

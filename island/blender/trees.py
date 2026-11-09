"""Jungle trees: plank-buttress tree (サキシマスオウノキ), canopy trees, mangrove (ヤエヤマヒルギ).

  python island/blender/trees.py [--preview] [--notex]
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


# ============================================================================ leaf cluster atlases
def spray(mb_leaf, mb_twig, rg, cx, cy, size, leaf_len, leaf_w, shape, top, under, n_leaves, opposite=False,
          propagules=0, mb_prop=None):
    """A twig spray drawn in a size x size cell centred at (cx, cy), seen from above."""
    # main twig from the bottom of the cell toward the top, slightly curved
    base = np.array([cx + rg.uniform(-0.05, 0.05) * size, cy - size * 0.48, 0])
    ang = rg.uniform(-0.25, 0.25)
    pts = [base]
    d = np.array([math.sin(ang), math.cos(ang), 0])
    for k in range(6):
        d = d + np.array([rg.normal(0, 0.12), 0, 0])
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * size * 0.13)
    v, f, uv, c = tube(pts, np.linspace(0.008, 0.003, len(pts)) * size, sides=5)
    mb_twig.add(v, f, np.tile([0.16, 0.12, 0.08, 1], (len(v), 1)), uv)
    # side twigs
    tips = [pts[-1]]
    for k in (2, 3, 4):
        sd = 1 if rg.random() < 0.5 else -1
        q = pts[k]
        dd = np.array([sd * math.cos(0.6), math.sin(0.6), 0])
        sp = [q, q + dd * size * 0.12, q + dd * size * 0.24 + np.array([0, size * 0.05, 0])]
        v, f, uv, c = tube(sp, [0.004 * size, 0.003 * size, 0.002 * size], sides=4)
        mb_twig.add(v, f, np.tile([0.16, 0.12, 0.08, 1], (len(v), 1)), uv)
        tips.append(sp[-1])
    # leaves clustered toward twig tips
    # leaves along the twigs, denser toward the tips
    along = [p for p in pts[2:]] + tips
    for i in range(n_leaves):
        tip = along[rg.integers(len(along))] if rg.random() < 0.6 else tips[rg.integers(len(tips))]
        a = rg.uniform(0, 2 * math.pi) if not opposite else (i % 2) * math.pi + rg.uniform(-0.3, 0.3) + (i // 2) * 0.4
        L = leaf_len * rg.uniform(0.75, 1.15)
        W = leaf_w * rg.uniform(0.85, 1.1)
        v, f = leaf_geom(L, W, rg, shape=shape, segs=8, side=2, curl=rg.uniform(0.0, 0.4))
        flipped = rg.random() < 0.22
        base_c = under if flipped else top
        base_c = base_c * rg.uniform(0.82, 1.15)
        col = leaf_colors(v, base_c, base_c * np.array([1.1, 1.08, 0.9]), rg, L, W)
        # small blemishes / yellowing on some leaves
        if rg.random() < 0.12:
            col[:, :3] *= np.array([1.25, 1.1, 0.7])
        R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
        v = v @ R.T + tip + np.array([rg.normal(0, 0.02), rg.normal(0, 0.02), rg.uniform(0, 0.02)]) * size
        mb_leaf.add(v, f, col)
    for i in range(propagules):
        tip = tips[rg.integers(len(tips))]
        a = rg.uniform(-0.5, 0.5) - math.pi / 2
        L = rg.uniform(0.25, 0.4)
        q = [tip, tip + np.array([math.cos(a), math.sin(a), 0]) * L]
        v, f, uv, c = tube(q, [0.009, 0.006], sides=5)
        mb_prop.add(v, f, np.tile([0.18, 0.24, 0.06, 1], (len(v), 1)), uv)


def cluster_texture(name, leaf_len, leaf_w, shape, top, under, n_leaves, opposite=False, propagules=0, seed=1):
    rg = np.random.default_rng(seed)
    S = 1.0
    builders = {"leaf": MeshBuilder(), "twig": MeshBuilder(), "prop": MeshBuilder()}
    for j in range(2):
        for i in range(2):
            for k in range(2):
                spray(builders["leaf"], builders["twig"], rg, S * (i + 0.5) + (k - 0.5) * 0.18 * S, S * (j + 0.5), S * 0.92,
                      leaf_len, leaf_w, shape, np.array(top), np.array(under), n_leaves, opposite, propagules if k == 0 else 0,
                      builders["prop"])
    if not builders["prop"].V:
        builders.pop("prop")
    bake_card(name, builders, 2 * S, 2 * S, res=(1024, 1024))


# ============================================================================ tree builder
class TreeBuilder:
    def __init__(self, rg, lod, parts, card_size=1.2, cards_per_tip=3, leaf_slot="leaf", bark_slot="bark"):
        self.rg = rg
        self.lod = lod
        self.parts = parts
        self.card = card_size
        self.cpt = cards_per_tip
        self.leaf_slot = leaf_slot
        self.bark_slot = bark_slot
        self.cards = []         # (center, normal, up, size, cell)
        self.phase = rg.random()

    def branch(self, p, d, length, r, depth, gravity=0.0, photo=0.25, spread=0.6, n_children=(2, 3), wiggle=0.12):
        rg = self.rg
        nseg = max(2, int(length / (0.9 if self.lod == 0 else 2.2)))
        pts = [p]
        dd = d.copy()
        for k in range(nseg):
            dd = dd + rg.normal(0, wiggle, 3) + np.array([0, 0, photo * 0.3]) - np.array([0, 0, gravity * 0.3])
            dd /= np.linalg.norm(dd)
            pts.append(pts[-1] + dd * length / nseg)
        radii = np.linspace(r, r * 0.62, len(pts))
        sides = max(4, int((10 if self.lod == 0 else 5) * min(1.0, r / 0.15 + 0.35)))
        sway = min(1.0, 0.25 + (4 - depth) * 0.2)

        def col(t, s, sway=sway):
            return (0.0, sway * t, self.phase, 1)

        if r > 0.012 or self.lod == 0:
            self.parts[self.bark_slot].add(tube(pts, radii, sides=sides, uv_v_scale=1.0 / max(r * 6.28, 0.3), color_fn=col))
        end = pts[-1]
        if depth == 0:
            for c in range(self.cpt):
                q = end + rg.normal(0, self.card * 0.42, 3) * np.array([1, 1, 0.6])
                self.cards.append(q)
            return
        nc = rg.integers(n_children[0], n_children[1] + 1)
        for c in range(nc):
            a = c / nc * 2 * math.pi + rg.uniform(-0.5, 0.5)
            side = np.cross(dd, [0, 0, 1.0])
            if np.linalg.norm(side) < 1e-3:
                side = np.array([1.0, 0, 0])
            side /= np.linalg.norm(side)
            up2 = np.cross(side, dd)
            nd = dd * math.cos(spread) + (side * math.cos(a) + up2 * math.sin(a)) * math.sin(spread)
            nd /= np.linalg.norm(nd)
            self.branch(end, nd, length * rg.uniform(0.6, 0.8), r * rg.uniform(0.6, 0.72), depth - 1,
                        gravity, photo, spread, n_children, wiggle)
        # lateral twig with leaves partway along older branches
        if depth <= 2:
            for c in range(self.cpt // 2):
                mid = pts[rg.integers(len(pts) // 2, len(pts))]
                self.cards.append(mid + rg.normal(0, self.card * 0.35, 3))

    def emit_cards(self, crown_center, crown_radius):
        rg = self.rg
        part = self.parts[self.leaf_slot]
        for q in self.cards:
            size = self.card * rg.uniform(0.8, 1.25)
            # orientation: mostly facing up/outward, random roll
            out = q - crown_center
            out = out / (np.linalg.norm(out) + 1e-6)
            nrm = out * 0.6 + np.array([0, 0, 1.0]) * 0.8 + rg.normal(0, 0.35, 3)
            nrm /= np.linalg.norm(nrm)
            tang = np.cross(nrm, rg.normal(0, 1, 3))
            tang /= np.linalg.norm(tang)
            bit = np.cross(nrm, tang)
            cell = rg.integers(4)
            u0, v0 = (cell % 2) * 0.5, (cell // 2) * 0.5
            # 3x3 grid, slightly cupped
            verts, uvs, cols, tris = [], [], [], []
            for j in range(3):
                for i in range(3):
                    x = (i / 2 - 0.5) * size
                    y = (j / 2 - 0.5) * size
                    z = -0.12 * size * ((i / 2 - 0.5) ** 2 + (j / 2 - 0.5) ** 2) * 2
                    verts.append(q + tang * x + bit * y + nrm * z)
                    uvs.append((u0 + i / 2 * 0.5, v0 + j / 2 * 0.5))
                    depth = np.linalg.norm(q - crown_center) / max(crown_radius, 1e-3)
                    ao = float(np.clip(0.35 + 0.75 * depth, 0.3, 1.0))
                    edge = math.hypot(i / 2 - 0.5, j / 2 - 0.5) * 1.4
                    cols.append((0.3 + 0.7 * edge, 0.85, self.phase + rg.uniform(0, 0.3), ao))
            for j in range(2):
                for i in range(2):
                    a = j * 3 + i
                    tris += [(a, a + 1, a + 3), (a + 1, a + 4, a + 3)]
            part.mb.add(np.array(verts), np.array(tris), np.array(cols, dtype=np.float32), np.array(uvs))


def crown_normals(ob, slot_name, center):
    """Bend foliage normals outward from the crown centre for soft, volumetric shading."""
    me = ob.data
    mat_index = None
    for i, m in enumerate(me.materials):
        if m and m.name.startswith(slot_name):
            mat_index = i
    if mat_index is None:
        return
    me.update()
    normals = []
    poly_mat = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("material_index", poly_mat)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    vn = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", vn)
    vn = vn.reshape(-1, 3)
    is_leaf_vert = np.zeros(len(me.vertices), dtype=bool)
    for p in me.polygons:
        if p.material_index == mat_index:
            for vi in p.vertices:
                is_leaf_vert[vi] = True
    out = co - np.array(center)
    out[:, 2] += np.linalg.norm(out, axis=1) * 0.3
    out /= np.linalg.norm(out, axis=1)[:, None] + 1e-9
    nn = np.where(is_leaf_vert[:, None], out * 0.85 + vn * 0.15, vn)
    nn /= np.linalg.norm(nn, axis=1)[:, None] + 1e-9
    me.normals_split_custom_set_from_vertices([tuple(n) for n in nn])


def plank_buttress(parts, rg, trunk_r, n, lod, phase):
    """Thin wavy plank roots radiating from the trunk base."""
    for k in range(n):
        a = k / n * 2 * math.pi + rg.uniform(-0.25, 0.25)
        length = rg.uniform(3.5, 6.0)
        h0 = rg.uniform(2.2, 3.6)
        thick = rg.uniform(0.09, 0.15)
        steps = 14 if lod == 0 else 6
        wav_amp = rg.uniform(0.25, 0.6)
        wav_f = rg.uniform(1.5, 2.6)
        verts, tris, uvs, cols = [], [], [], []
        dirv = np.array([math.cos(a), math.sin(a), 0])
        perp = np.array([-math.sin(a), math.cos(a), 0])
        for i in range(steps + 1):
            s = i / steps
            d = trunk_r * 0.6 + s * length
            off = perp * math.sin(s * wav_f * math.pi) * wav_amp * s
            base = dirv * d + off
            h = h0 * (1 - s) ** 1.6 + 0.05
            # tangent along the path for thickness direction
            nxt = dirv * (d + 0.05) + perp * math.sin((s + 0.01) * wav_f * math.pi) * wav_amp * (s + 0.01)
            t = nxt - base
            t /= np.linalg.norm(t)
            side = np.cross(t, [0, 0, 1])
            side /= np.linalg.norm(side)
            th = thick * (1 - 0.5 * s)
            ring = [base + side * th - np.array([0, 0, 0.3]), base + side * th * 0.9 + np.array([0, 0, h * 0.92]),
                    base + np.array([0, 0, h]), base - side * th * 0.9 + np.array([0, 0, h * 0.92]),
                    base - side * th - np.array([0, 0, 0.3])]
            for j, q in enumerate(ring):
                verts.append(q)
                uvs.append((q[2] * 0.5 + j * 0.02, s * length * 0.5))
                cols.append((0, 0, phase, 1))
        w = 5
        for i in range(steps):
            for j in range(4):
                a0 = i * w + j
                tris += [(a0, a0 + w, a0 + 1), (a0 + 1, a0 + w, a0 + w + 1)]
        # end cap
        e = steps * w
        tris += [(e, e + 1, e + 2), (e, e + 2, e + 3), (e, e + 3, e + 4)]
        parts["bark"].add((np.array(verts), np.array(tris), np.array(uvs), np.array(cols, dtype=np.float32)))


def liana(parts, rg, top, ground_r, phase):
    """A woody vine hanging from a branch down to the ground in a lazy curve."""
    a = rg.uniform(0, 2 * math.pi)
    end = np.array([math.cos(a) * ground_r, math.sin(a) * ground_r, -0.2])
    pts = []
    for t in np.linspace(0, 1, 16):
        p = top * (1 - t) + end * t
        p[2] -= math.sin(t * math.pi) * rg.uniform(0.5, 2.0)
        p[:2] += np.array([math.sin(t * 9 + phase * 6), math.cos(t * 7)]) * 0.15
        pts.append(p)
    parts["bark"].add(tube(pts, np.linspace(0.045, 0.03, len(pts)), sides=5, uv_v_scale=2.0,
                           color_fn=lambda t, s: (0.0, 0.4 * math.sin(t * math.pi), phase, 1)))


def buttress_tree(seed, lod):
    rg = np.random.default_rng(seed)
    parts = {"bark": Part(), "leaf": Part()}
    H = rg.uniform(17, 24)
    r0 = rg.uniform(0.38, 0.55)
    tb = TreeBuilder(rg, lod, parts, card_size=1.35, cards_per_tip=9 if lod == 0 else 4)
    # trunk
    nseg = 12 if lod == 0 else 5
    pts = [np.array([0, 0, -0.3])]
    d = np.array([rg.normal(0, 0.05), rg.normal(0, 0.05), 1.0])
    trunk_h = H * rg.uniform(0.62, 0.72)
    for k in range(nseg):
        d = d + rg.normal(0, 0.04, 3)
        d[2] = max(d[2], 0.9)
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * trunk_h / nseg)
    radii = [r0 * (1.25 if k == 0 else 1.0) * (1 - 0.35 * k / nseg) for k in range(len(pts))]
    parts["bark"].add(tube(pts, radii, sides=16 if lod == 0 else 8, uv_v_scale=1.0 / (r0 * 6.28) * 2,
                           uv_u_repeat=2, color_fn=lambda t, s: (0.0, 0.0, tb.phase, 1)))
    plank_buttress(parts, rg, r0, rg.integers(4, 7) if lod == 0 else 4, lod, tb.phase)
    top = pts[-1]
    nl = rg.integers(3, 5)
    for i in range(nl):
        a = i / nl * 2 * math.pi + rg.uniform(-0.4, 0.4)
        dd = np.array([math.cos(a), math.sin(a), 0.55])
        tb.branch(top - np.array([0, 0, rg.uniform(0, 2.5)]), dd / np.linalg.norm(dd), H * 0.26, r0 * 0.5,
                  3 if lod == 0 else 2, spread=0.7, photo=0.12, gravity=0.05)
    crown_c = top + np.array([0, 0, H * 0.12])
    tb.emit_cards(crown_c, H * 0.3)
    if lod == 0:
        for i in range(rg.integers(2, 5)):
            liana(parts, rg, top + rg.normal(0, 2.0, 3) + np.array([0, 0, 2]), rg.uniform(2, 5), tb.phase)
    return parts, crown_c


def canopy_tree(seed, lod, tall=True):
    rg = np.random.default_rng(seed)
    parts = {"bark": Part(), "leaf": Part()}
    H = rg.uniform(14, 22) if tall else rg.uniform(7, 11)
    r0 = rg.uniform(0.22, 0.34) if tall else rg.uniform(0.1, 0.16)
    tb = TreeBuilder(rg, lod, parts, card_size=1.3 if tall else 1.1, cards_per_tip=8 if lod == 0 else 4)
    nseg = 10 if lod == 0 else 4
    pts = [np.array([0, 0, -0.2])]
    d = np.array([rg.normal(0, 0.08), rg.normal(0, 0.08), 1.0])
    trunk_h = H * rg.uniform(0.45, 0.6)
    for k in range(nseg):
        d = d + rg.normal(0, 0.05, 3)
        d[2] = max(d[2], 0.85)
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * trunk_h / nseg)
    radii = [r0 * (1.5 if k == 0 else (1.15 if k == 1 else 1.0)) * (1 - 0.3 * k / nseg) for k in range(len(pts))]
    parts["bark"].add(tube(pts, radii, sides=12 if lod == 0 else 6, uv_v_scale=1.0 / (r0 * 6.28), color_fn=lambda t, s: (0.0, 0.0, tb.phase, 1)))
    top = pts[-1]
    nl = rg.integers(3, 6)
    for i in range(nl):
        a = i / nl * 2 * math.pi + rg.uniform(-0.4, 0.4)
        h = rg.uniform(-H * 0.12, 0)
        dd = np.array([math.cos(a), math.sin(a), rg.uniform(0.45, 0.9)])
        tb.branch(top + np.array([0, 0, h]), dd / np.linalg.norm(dd), H * rg.uniform(0.2, 0.28), r0 * 0.55,
                  3 if lod == 0 else 2, spread=0.68, photo=0.18)
    crown_c = top + np.array([0, 0, H * 0.15])
    tb.emit_cards(crown_c, H * 0.28)
    if lod == 0 and tall and rg.random() < 0.7:
        for i in range(rg.integers(1, 3)):
            liana(parts, rg, top + rg.normal(0, 1.5, 3), rg.uniform(1.5, 4), tb.phase)
    return parts, crown_c


def mangrove(seed, lod):
    rg = np.random.default_rng(seed)
    parts = {"bark": Part(), "leaf": Part()}
    H = rg.uniform(4.5, 8)
    r0 = rg.uniform(0.09, 0.15)
    tb = TreeBuilder(rg, lod, parts, card_size=1.0, cards_per_tip=8 if lod == 0 else 4)
    # trunk starts above the mud on stilt roots
    base_h = rg.uniform(1.2, 2.0)
    pts = [np.array([0, 0, base_h * 0.6])]
    d = np.array([rg.normal(0, 0.15), rg.normal(0, 0.15), 1.0])
    for k in range(5 if lod == 0 else 3):
        d = d + rg.normal(0, 0.1, 3)
        d[2] = max(d[2], 0.7)
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * H * 0.45 / 5)
    parts["bark"].add(tube(pts, np.linspace(r0, r0 * 0.75, len(pts)), sides=9 if lod == 0 else 5, uv_v_scale=1.5,
                           color_fn=lambda t, s: (0.0, 0.0, tb.phase, 1)))
    nroots = rg.integers(9, 15) if lod == 0 else 5
    for i in range(nroots):
        a = rg.uniform(0, 2 * math.pi)
        start_h = base_h * rg.uniform(0.5, 1.4)
        reach = rg.uniform(1.0, 2.4)
        p0 = np.array([math.cos(a) * r0 * 0.5, math.sin(a) * r0 * 0.5, start_h])
        p2 = np.array([math.cos(a) * reach, math.sin(a) * reach, -0.25])
        ctrl = np.array([math.cos(a) * reach * 0.55, math.sin(a) * reach * 0.55, start_h + rg.uniform(0.2, 0.6)])
        q = [(1 - t) ** 2 * p0 + 2 * (1 - t) * t * ctrl + t * t * p2 for t in np.linspace(0, 1, 7 if lod == 0 else 4)]
        parts["bark"].add(tube(q, np.linspace(0.045, 0.03, len(q)), sides=6 if lod == 0 else 4, uv_v_scale=2.0,
                               color_fn=lambda t, s: (0.0, 0.0, tb.phase, 1)))
    top = pts[-1]
    for i in range(rg.integers(3, 5)):
        a = rg.uniform(0, 2 * math.pi)
        dd = np.array([math.cos(a), math.sin(a), rg.uniform(0.3, 0.9)])
        tb.branch(top, dd / np.linalg.norm(dd), H * 0.35, r0 * 0.6, 2, spread=0.7, photo=0.15)
    crown_c = top + np.array([0, 0, H * 0.1])
    tb.emit_cards(crown_c, H * 0.35)
    return parts, crown_c


def export_species(name, builder, variants, bark, leaf, preview=None, cam=None):
    reset()
    objs = []
    for v in range(variants):
        for lod in (0, 1):
            parts, cc = builder(1000 + v * 17 + sum(map(ord, name)), lod)
            mats = {"bark": bpy.data.materials.get(bark) or bpy.data.materials.new(bark),
                    "leaf": bpy.data.materials.get(leaf) or bpy.data.materials.new(leaf)}
            ob = build_plant(f"{name}{v}_lod{lod}", parts, mats)
            crown_normals(ob, leaf, cc)
            objs.append(ob)
    if preview:
        from palms import textured
        d = OUT
        textured(bpy.data.materials[bark], os.path.join(d, f"{bark}_albedo.webp"), os.path.join(d, f"{bark}_normal.webp"))
        textured(bpy.data.materials[leaf], os.path.join(d, f"{leaf[5:]}_albedo.webp"), os.path.join(d, f"{leaf[5:]}_normal.webp"), alpha=True)
        for i, o in enumerate(objs):
            o.hide_render = "lod1" in o.name
            o.location.x = (i // 2) * 16
        here = os.path.dirname(os.path.abspath(__file__))
        preview_render(objs, os.path.join(here, f".{name}_preview.png"), cam[0], cam[1], lens=30, res=(900, 600))
        for o in objs:
            o.location.x = 0
    export_glb(objs, os.path.join(OUT, f"{name}.glb"))
    print(name, os.path.getsize(os.path.join(OUT, f"{name}.glb")))


def main():
    preview = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--notex" not in sys.argv:
        cluster_texture("leaves_heritiera", 0.17, 0.065, "ellipse", (0.035, 0.08, 0.018), (0.26, 0.28, 0.22), 46, seed=3)
        cluster_texture("leaves_canopy", 0.2, 0.09, "obovate", (0.04, 0.095, 0.02), (0.10, 0.16, 0.05), 40, seed=4)
        cluster_texture("leaves_mangrove", 0.12, 0.055, "ellipse", (0.04, 0.10, 0.025), (0.14, 0.20, 0.07), 48, opposite=True, propagules=3, seed=5)
        for kind, nm, st in (("smooth", "bark_smooth", 2.0), ("rough", "bark_rough", 3.5), ("mangrove", "bark_mangrove", 2.5), ("drift", "bark_drift", 3.0)):
            a, h = bark_texture(kind, 512, seed=7)
            save_bark(nm, a, h, st)
    if not only or "buttress" in only:
        export_species("buttress", buttress_tree, 2, "bark_smooth", "leaf_leaves_heritiera", preview, ((8, -34, 10), (8, 0, 10)))
    if not only or "canopy" in only:
        export_species("canopy", lambda s, l: canopy_tree(s, l, True), 3, "bark_rough", "leaf_leaves_canopy", preview, ((16, -40, 9), (16, 0, 9)))
    if not only or "understorey" in only:
        export_species("smalltree", lambda s, l: canopy_tree(s, l, False), 2, "bark_rough", "leaf_leaves_canopy", preview, ((8, -22, 5), (8, 0, 5)))
    if not only or "mangrove" in only:
        export_species("mangrove", mangrove, 3, "bark_mangrove", "leaf_leaves_mangrove", preview, ((16, -22, 3), (16, 0, 3)))


if __name__ == "__main__":
    main()

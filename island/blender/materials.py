"""Tileable ground materials for The Island.

Each layer is built as a real 3D patch (tileable displaced ground plus scattered pebbles,
shells, coral rubble, leaves, twigs, grass, scoria ...), wrapped across the tile border so
the result repeats seamlessly, then baked with Cycles onto a flat plane:

  albedo (with baked micro AO)  -> assets/ground/<name>_albedo.webp  (sRGB)
  tangent normal + height       -> assets/ground/<name>_normal.webp  (R,G = normal, B = height)

  python island/blender/materials.py [names...]
"""
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import (ASSETS, MeshBuilder, fft_noise, image_to_np, linear_to_srgb, srgb_to_linear, mesh_object, new_image,
                 reset, rock_blob, rot_matrix, sample_periodic, save_webp, worley, bake, select_only)

RES = 1024
GRID = 360      # base ground vertices per side


def vc_material(name, rough=0.85, spec=0.5, sheen=0.0, subsurface=0.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = "Col"
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    # roughness carried in the colour alpha
    nt.links.new(a.outputs["Alpha"], b.inputs["Roughness"])
    b.inputs["Specular IOR Level"].default_value = spec
    return m


class Tile:
    def __init__(self, T, seed):
        self.T = T
        self.rg = np.random.default_rng(seed)
        self.builders = {}
        self.ground_h = None

    def mb(self, key):
        if key not in self.builders:
            self.builders[key] = MeshBuilder()
        return self.builders[key]

    # base ground -----------------------------------------------------------------
    def ground(self, height, color, rough):
        """height: periodic HxW field in metres, color: HxWx3 linear, rough: HxW."""
        n = GRID
        T = self.T
        pad = 0.04
        us = np.linspace(-pad, 1 + pad, n)
        U, V = np.meshgrid(us, us)
        H = sample_periodic(height, U, V)
        self.ground_h = height
        verts = np.stack([U * T, V * T, H], -1).reshape(-1, 3)
        idx = np.arange(n * n).reshape(n, n)
        a, b, c, d = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel()
        tris = np.concatenate([np.stack([a, b, d], 1), np.stack([a, d, c], 1)])
        cols = np.stack([sample_periodic(color[..., k], U, V) for k in range(3)] + [sample_periodic(rough, U, V)], -1).reshape(-1, 4)
        self.mb("ground").add(verts, tris, cols)

    def gh(self, x, y):
        return float(sample_periodic(self.ground_h, np.array([x / self.T]), np.array([y / self.T]))[0])

    # scatter with wrap-around ------------------------------------------------------
    def place(self, key, verts, tris, color, x, y, r):
        T = self.T
        offs = [(0, 0)]
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                if (ox, oy) == (0, 0):
                    continue
                if -r < x + ox < T + r and -r < y + oy < T + r:
                    offs.append((ox, oy))
        for ox, oy in offs:
            self.mb(key).add(verts + np.array([x + ox, y + oy, 0]), tris, color)

    def build(self):
        objs = []
        for key, mb in self.builders.items():
            ob = mb.build(key, vc_material("m_" + key))
            objs.append(ob)
        return objs


# ---------------------------------------------------------------------------- primitives
def leaf_mesh(length, width, rg, curl=0.3, shape="ellipse", segs=7, side=2):
    ts = np.linspace(0, 1, segs + 1)
    verts, tris = [], []
    rows = []
    for t in ts:
        if shape == "lance":
            w = width * np.sin(np.pi * t) ** 0.7 * (1 - 0.4 * t)
        elif shape == "round":
            w = width * np.sin(np.pi * min(t * 1.05, 1)) ** 0.5
        else:
            w = width * np.sin(np.pi * t) ** 0.85
        row = []
        for s in range(-side, side + 1):
            k = s / side
            x = t * length
            yv = k * w / 2
            # curl edges up, droop tip, midrib crease
            z = curl * (k * k) * w * 0.5 + abs(k) * 0.08 * w - 0.12 * length * (t - 0.5) ** 2 * rg.uniform(-1, 1)
            row.append(len(verts))
            verts.append((x - length * 0.5, yv, z))
        rows.append(row)
    for i in range(segs):
        for j in range(2 * side):
            a, b, c, d = rows[i][j], rows[i][j + 1], rows[i + 1][j], rows[i + 1][j + 1]
            tris += [(a, c, b), (b, c, d)]
    return np.array(verts), np.array(tris)


def blade_mesh(h, w, bend, segs=4):
    verts, tris = [], []
    for i in range(segs + 1):
        t = i / segs
        ww = w * (1 - t) ** 0.9 + 0.0003
        y = bend * t * t * h
        verts += [(-ww / 2, y, t * h), (ww / 2, y, t * h)]
    for i in range(segs):
        a = i * 2
        tris += [(a, a + 1, a + 2), (a + 1, a + 3, a + 2)]
    return np.array(verts), np.array(tris)


def twig_mesh(length, radius, rg, segs=6, sides=5):
    verts, tris = [], []
    bend = rg.uniform(-0.15, 0.15) * length
    for i in range(segs + 1):
        t = i / segs
        cx = (t - 0.5) * length
        cy = bend * (4 * t * (1 - t))
        r = radius * (1 - 0.35 * t)
        for s in range(sides):
            a = s / sides * 2 * np.pi
            verts.append((cx, cy + np.cos(a) * r, np.sin(a) * r))
    for i in range(segs):
        for s in range(sides):
            a = i * sides + s
            b = i * sides + (s + 1) % sides
            tris += [(a, b, a + sides), (b, b + sides, a + sides)]
    return np.array(verts), np.array(tris)


def shell_mesh(r, rg, ribs=9):
    # a cockle-like fragment: part of a sphere with radial ribs
    verts, tris = [], []
    nu, nv = 8, ribs * 2
    span = rg.uniform(0.5, 1.0) * np.pi
    for i in range(nu + 1):
        th = i / nu * 1.2
        for j in range(nv + 1):
            ph = -span / 2 + j / nv * span
            rr = r * (1 + 0.06 * np.cos(j * np.pi))
            verts.append((rr * np.sin(th) * np.cos(ph), rr * np.sin(th) * np.sin(ph), rr * (np.cos(th) - 1) * 0.55))
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            tris += [(a, a + nv + 1, a + 1), (a + 1, a + nv + 1, a + nv + 2)]
    return np.array(verts), np.array(tris)


def coral_mesh(r, rg):
    # short branching rubble piece made of a few capsules
    verts, tris = [], []
    n_br = rg.integers(2, 4)
    for b in range(n_br):
        v, f = twig_mesh(r * rg.uniform(1.2, 2.4), r * rg.uniform(0.18, 0.3), rg, segs=3, sides=6)
        R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.4, 0.4), 0)
        v = v @ R.T
        tris += [tuple(i + len(verts) for i in t) for t in f]
        verts += list(v)
    return np.array(verts), np.array(tris)


def put(tile, key, v, f, col, x, y, sink=0.3, size=0.02, R=None):
    if R is not None:
        v = v @ R.T
    v = v.copy()
    zmin, zmax = v[:, 2].min(), v[:, 2].max()
    v[:, 2] += tile.gh(x, y) - zmin - sink * (zmax - zmin)
    tile.place(key, v, f, col, x, y, size)


# ---------------------------------------------------------------------------- layers
def lin(*rgb):
    return np.array(rgb, dtype=np.float64)


def layer_sand(T):
    t = Tile(T, 11)
    rg = t.rg
    n = 512
    us = np.arange(n) / n
    U, V = np.meshgrid(us, us)
    warp = fft_noise(n, 3.0, 1) * 0.06
    # wind ripples (periodic: integer wave numbers across the tile)
    k = max(1, round(T / 0.09))
    rip = np.sin(2 * np.pi * (k * (U + warp) + 3 * V + fft_noise(n, 3.4, 2) * 1.2))
    rip = np.sign(rip) * np.abs(rip) ** 0.7
    h = 0.0035 * rip * (0.6 + 0.4 * fft_noise(n, 2.5, 3)) + 0.018 * fft_noise(n, 3.2, 4) + 0.0008 * fft_noise(n, 1.0, 5)
    grain = fft_noise(n, 0.4, 6)
    base = lin(0.58, 0.50, 0.37)
    col = base[None, None, :] * (0.86 + 0.2 * fft_noise(n, 2.8, 7)[..., None])
    # darker sorted bands in the ripple troughs (heavy minerals) and coarse patches
    col *= (1 - 0.08 * np.clip(-rip, 0, 1))[..., None]
    coarse = np.clip(fft_noise(n, 2.2, 8) * 2.5 - 1.2, 0, 1)[..., None]
    col = col * (1 - coarse * 0.25) + lin(0.50, 0.40, 0.30) * coarse * 0.25
    speck = (grain > 0.55)[..., None] * lin(-0.25, -0.24, -0.2) + (grain < -0.6)[..., None] * lin(0.12, 0.1, 0.08)
    col = np.clip(col * (1 + speck), 0, 1)
    rough = np.full((n, n), 0.92)
    t.ground(h, col, rough)
    # shells, coral rubble, pebbles
    for i in range(70):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.006, 0.02)
        v, f = shell_mesh(r, rg)
        c = lin(0.85, 0.80, 0.72) * rg.uniform(0.75, 1.05) + lin(0.05, -0.02, -0.04) * rg.uniform(0, 1)
        put(t, "shell", v, f, (*c, 0.45), x, y, size=r, R=rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.3, 0.3), rg.uniform(-2.8, 2.8) if rg.random() < 0.3 else 0))
    for i in range(30):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.008, 0.02)
        v, f = coral_mesh(r, rg)
        c = lin(0.8, 0.76, 0.68) * rg.uniform(0.8, 1.0)
        put(t, "coral", v, f, (*c, 0.8), x, y, size=r * 3, R=rot_matrix(rg.uniform(0, 6.28), 0, 0))
    for i in range(45):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.003, 0.012)
        v, f = rock_blob(r, 2, int(rg.integers(1e6)), squash=(1, rg.uniform(0.6, 1), rg.uniform(0.4, 0.7)))
        g = rg.uniform(0.15, 0.55)
        c = lin(g, g * 0.95, g * 0.88)
        put(t, "pebble", v, f, (*c, 0.6), x, y, size=r, R=rot_matrix(rg.uniform(0, 6.28), 0, 0))
    return t


def layer_forest(T):
    t = Tile(T, 21)
    rg = t.rg
    n = 512
    h = 0.02 * fft_noise(n, 3.0, 21) + 0.004 * fft_noise(n, 1.6, 22)
    soil = lin(0.075, 0.052, 0.034)
    col = soil[None, None, :] * (0.8 + 0.3 * fft_noise(n, 2.2, 23)[..., None])
    t.ground(h, col, np.full((n, n), 0.95))
    palette = [lin(0.26, 0.15, 0.06), lin(0.36, 0.22, 0.09), lin(0.19, 0.11, 0.05), lin(0.42, 0.31, 0.15),
               lin(0.12, 0.08, 0.045), lin(0.30, 0.25, 0.14), lin(0.20, 0.17, 0.10), lin(0.10, 0.07, 0.04)]
    layer_z = 0.0
    for i in range(2100):
        x, y = rg.uniform(0, T, 2)
        L = rg.uniform(0.05, 0.2) if rg.random() < 0.8 else rg.uniform(0.2, 0.34)
        W = L * rg.uniform(0.3, 0.55)
        shape = ["ellipse", "lance", "round"][rg.integers(0, 3)]
        v, f = leaf_mesh(L, W, rg, curl=rg.uniform(-0.2, 0.8), shape=shape)
        c = palette[rg.integers(len(palette))] * rg.uniform(0.7, 1.2)
        if rg.random() < 0.05:
            c = lin(0.20, 0.25, 0.07) * rg.uniform(0.7, 1.1)  # a few fresh green leaves
        R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.25, 0.25), rg.uniform(-0.25, 0.25) + (np.pi if rg.random() < 0.4 else 0))
        v = v @ R.T
        z = t.gh(x, y) + layer_z * 0.5 + rg.uniform(0, 0.012)
        v[:, 2] += z - v[:, 2].min() * 0.3
        t.place("leaf", v, f, (*c, rg.uniform(0.55, 0.9)), x, y, L)
        layer_z = min(layer_z + 0.000012, 0.02)
    for i in range(70):
        x, y = rg.uniform(0, T, 2)
        L = rg.uniform(0.08, 0.45)
        v, f = twig_mesh(L, rg.uniform(0.003, 0.009), rg)
        c = lin(0.16, 0.11, 0.07) * rg.uniform(0.6, 1.3)
        R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.1, 0.1), 0)
        v = v @ R.T
        v[:, 2] += t.gh(x, y) + 0.012
        t.place("twig", v, f, (*c, 0.85), x, y, L)
    for i in range(50):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.004, 0.012)
        v, f = rock_blob(r, 1, int(rg.integers(1e6)), squash=(1, 0.8, 0.7), bump=0.1)
        c = lin(0.2, 0.12, 0.06) * rg.uniform(0.6, 1.2)
        put(t, "seed", v, f, (*c, 0.6), x, y, size=r)
    return t


def layer_soil(T):
    t = Tile(T, 31)
    rg = t.rg
    n = 512
    h = 0.025 * fft_noise(n, 2.8, 31) + 0.004 * fft_noise(n, 1.2, 32)
    soil = lin(0.16, 0.11, 0.065)
    col = soil[None, None, :] * (0.75 + 0.35 * fft_noise(n, 2.4, 33)[..., None])
    t.ground(h, col, np.full((n, n), 0.95))
    # tufts of green grass and dry straw lying flat
    for i in range(520):
        cx, cy = rg.uniform(0, T, 2)
        nb = rg.integers(8, 22)
        for b in range(nb):
            x = cx + rg.normal(0, 0.02)
            y = cy + rg.normal(0, 0.02)
            hgt = rg.uniform(0.02, 0.07)
            v, f = blade_mesh(hgt, rg.uniform(0.002, 0.004), rg.uniform(0.2, 1.2))
            R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(0.1, 0.9), 0)
            v = v @ R.T
            v[:, 2] += t.gh(x, y)
            g = rg.uniform(0.6, 1.2)
            c = lin(0.10, 0.17, 0.035) * g if rg.random() < 0.7 else lin(0.32, 0.26, 0.12) * g
            t.place("grass", v, f, (*c, 0.7), x, y, hgt)
    for i in range(2200):
        x, y = rg.uniform(0, T, 2)
        L = rg.uniform(0.03, 0.14)
        v, f = twig_mesh(L, rg.uniform(0.0008, 0.0016), rg, segs=3, sides=3)
        R = rot_matrix(rg.uniform(0, 6.28), 0, 0)
        v = v @ R.T
        v[:, 2] += t.gh(x, y) + 0.002
        c = lin(0.42, 0.34, 0.18) * rg.uniform(0.6, 1.1)
        t.place("straw", v, f, (*c, 0.85), x, y, L)
    for i in range(60):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.004, 0.02)
        v, f = rock_blob(r, 2, int(rg.integers(1e6)), squash=(1, 0.85, 0.6))
        g = rg.uniform(0.12, 0.3)
        put(t, "stone", v, f, (g, g * 0.9, g * 0.8, 0.8), x, y, size=r)
    return t


def warp_worley(n, count, seed, amp=0.035):
    """Worley noise sampled through a domain warp so cells lose their straight edges."""
    f1, f2, cid = worley(n, count, seed)
    us = np.arange(n) / n
    U, V = np.meshgrid(us, us)
    wu = U + fft_noise(n, 3.0, seed + 100) * amp
    wv = V + fft_noise(n, 3.0, seed + 101) * amp
    return (sample_periodic(f1, wu, wv), sample_periodic(f2, wu, wv), sample_periodic(cid.astype(float), wu, wv))


def layer_rock(T):
    t = Tile(T, 41)
    rg = t.rg
    n = 512
    f1, f2, cid = warp_worley(n, 22, 41, 0.05)
    crack = np.exp(-((f2 - f1) * 38) ** 2)                 # thin irregular fractures
    f1b, f2b, _ = warp_worley(n, 90, 42, 0.03)
    crack2 = np.exp(-((f2b - f1b) * 60) ** 2) * 0.5
    ridges = 1 - np.abs(fft_noise(n, 2.4, 43))             # ridged weathering
    h = (0.045 * fft_noise(n, 3.2, 44) + 0.018 * ridges ** 2 + 0.008 * fft_noise(n, 1.8, 45)
         + 0.003 * fft_noise(n, 0.9, 46) - 0.02 * crack - 0.008 * crack2)
    # vesicles (gas bubbles) in basalt
    ves = np.clip(fft_noise(n, 0.2, 47) * 4 - 3.2, 0, 1)
    h -= ves * 0.004
    w = np.clip(0.5 + fft_noise(n, 2.8, 48) * 1.1 + h * 6, 0, 1)[..., None]
    col = lin(0.10, 0.098, 0.094) * (1 - w) + lin(0.24, 0.22, 0.20) * w
    col = col * (0.82 + 0.3 * fft_noise(n, 1.5, 49)[..., None])
    col *= (1 - crack[..., None] * 0.55 - crack2[..., None] * 0.3 - ves[..., None] * 0.4)
    stain = np.clip(fft_noise(n, 2.6, 50) * 2.6 - 1.4, 0, 1)[..., None]
    col = col * (1 - stain * 0.5) + lin(0.22, 0.12, 0.06) * stain * 0.5
    lic = np.clip(fft_noise(n, 1.8, 51) * 3.2 - 1.9, 0, 1)[..., None] * (1 - crack[..., None])
    col = col * (1 - lic * 0.7) + lin(0.36, 0.37, 0.30) * lic * 0.7
    lic2 = np.clip(fft_noise(n, 1.6, 52) * 3.5 - 2.6, 0, 1)[..., None]
    col = col * (1 - lic2 * 0.6) + lin(0.48, 0.33, 0.12) * lic2 * 0.6
    rough = 0.82 + 0.12 * crack
    t.ground(h, col, rough)
    for i in range(36):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.008, 0.04)
        v, f = rock_blob(r, 2, int(rg.integers(1e6)), squash=(1, rg.uniform(0.6, 1), rg.uniform(0.4, 0.8)), facet=0.7)
        g = rg.uniform(0.09, 0.2)
        put(t, "chip", v, f, (g, g * 0.96, g * 0.92, 0.8), x, y, size=r, sink=0.5)
    return t


def layer_mud(T):
    t = Tile(T, 51)
    rg = t.rg
    n = 512
    big = fft_noise(n, 3.0, 51)
    mid = fft_noise(n, 2.2, 56)
    h = 0.025 * big + 0.008 * mid + 0.0015 * fft_noise(n, 1.0, 53)
    puddle = (big * 0.6 + mid * 0.5) < -0.32
    h = np.where(puddle, np.minimum(h, -0.012) * 0 - 0.012 - 0.0004 * fft_noise(n, 1.0, 54), h)
    f1, f2, _ = warp_worley(n, 60, 57, 0.02)
    cracks = np.exp(-((f2 - f1) * 70) ** 2) * np.clip(big * 2, 0, 1)   # drying cracks on the high spots
    h -= cracks * 0.003
    mud = lin(0.075, 0.062, 0.045)
    col = mud[None, None, :] * (0.75 + 0.35 * fft_noise(n, 2.0, 55)[..., None])
    col = col * (1 + np.clip(big, 0, 1)[..., None] * 0.5)          # drier, lighter crests
    col *= (1 - cracks[..., None] * 0.5)
    algae = np.clip(fft_noise(n, 2.4, 58) * 2.5 - 1.1, 0, 1)[..., None] * (1 - puddle[..., None])
    col = col * (1 - algae * 0.5) + lin(0.06, 0.08, 0.03) * algae * 0.5
    col = np.where(puddle[..., None], col * 0.5, col)
    rough = np.where(puddle, 0.04, 0.35 + 0.35 * np.clip(big, 0, 1))
    t.ground(h, col, rough)
    for i in range(380):
        x, y = rg.uniform(0, T, 2)
        L = rg.uniform(0.05, 0.13)
        v, f = leaf_mesh(L, L * 0.42, rg, curl=0.2, shape="ellipse")
        R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.15, 0.15), 0)
        v = v @ R.T
        v[:, 2] += t.gh(x, y) + 0.001
        c = lin(0.13, 0.09, 0.045) * rg.uniform(0.6, 1.3)
        t.place("leaf", v, f, (*c, 0.4), x, y, L)
    for i in range(40):
        x, y = rg.uniform(0, T, 2)
        L = rg.uniform(0.1, 0.5)
        v, f = twig_mesh(L, rg.uniform(0.004, 0.012), rg)
        R = rot_matrix(rg.uniform(0, 6.28), 0, 0)
        v = v @ R.T
        v[:, 2] += t.gh(x, y) + 0.004
        c = lin(0.09, 0.07, 0.05) * rg.uniform(0.7, 1.2)
        t.place("stick", v, f, (*c, 0.5), x, y, L)
    return t


def layer_ash(T):
    t = Tile(T, 61)
    rg = t.rg
    n = 512
    h = 0.02 * fft_noise(n, 3.0, 61) + 0.003 * fft_noise(n, 0.9, 62)
    ash = lin(0.045, 0.042, 0.04)
    col = ash[None, None, :] * (0.8 + 0.4 * fft_noise(n, 2.4, 63)[..., None])
    rust = np.clip(fft_noise(n, 2.6, 64) * 2.5 - 1.3, 0, 1)[..., None]
    col = col * (1 - rust) + lin(0.12, 0.05, 0.03) * rust
    t.ground(h, col, np.full((n, n), 0.92))
    for i in range(900):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.004, 0.035) if rg.random() < 0.9 else rg.uniform(0.04, 0.08)
        v, f = rock_blob(r, 2, int(rg.integers(1e6)), squash=(1, rg.uniform(0.7, 1), rg.uniform(0.5, 0.9)), bump=0.45, freq=6.0)
        g = rg.uniform(0.03, 0.08)
        c = lin(g, g * 0.95, g * 0.92)
        if rg.random() < 0.15:
            c = lin(0.13, 0.05, 0.03) * rg.uniform(0.6, 1.2)  # oxidised scoria
        if rg.random() < 0.03:
            c = lin(0.5, 0.48, 0.44)  # pumice
        put(t, "scoria", v, f, (*c, 0.9), x, y, size=r, sink=0.4, R=rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.5, 0.5), 0))
    return t


def layer_gravel(T):
    t = Tile(T, 71)
    rg = t.rg
    n = 512
    h = 0.01 * fft_noise(n, 3.0, 71)
    col = lin(0.16, 0.15, 0.13)[None, None, :] * np.ones((n, n, 1))
    t.ground(h, col, np.full((n, n), 0.9))
    for i in range(2600):
        x, y = rg.uniform(0, T, 2)
        r = rg.uniform(0.006, 0.03)
        v, f = rock_blob(r, 2, int(rg.integers(1e6)), squash=(1, rg.uniform(0.6, 0.95), rg.uniform(0.35, 0.65)), bump=0.12)
        u_ = rg.random()
        if u_ < 0.75:
            g = rg.uniform(0.06, 0.24)
            c = lin(g, g * 0.97, g * 0.92)
        elif u_ < 0.9:
            g = rg.uniform(0.18, 0.34)
            c = lin(g, g * 0.85, g * 0.7)   # iron-stained
        else:
            g = rg.uniform(0.4, 0.6)
            c = lin(g, g * 0.95, g * 0.86)  # coral / quartz
        put(t, "pebble", v, f, (*c, rg.uniform(0.5, 0.75)), x, y, size=r, sink=0.35, R=rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.2, 0.2), 0))
    return t


def layer_moss(T):
    t = Tile(T, 81)
    rg = t.rg
    n = 512
    cushion = np.clip(fft_noise(n, 2.6, 81) * 1.4 + 0.5, 0, 1) ** 0.7
    h = 0.022 * cushion + 0.006 * fft_noise(n, 1.4, 82) + 0.003 * fft_noise(n, 0.6, 83)
    tone = np.clip(fft_noise(n, 2.4, 85) * 0.9 + 0.5, 0, 1)[..., None]
    a_ = lin(0.05, 0.10, 0.018)
    b_ = lin(0.17, 0.21, 0.045)
    col = a_ * (1 - tone) + b_ * tone
    tips = np.clip(fft_noise(n, 0.5, 84), 0, 1)[..., None]
    col = col * (0.7 + 0.6 * tips) * (0.55 + 0.45 * cushion[..., None])
    t.ground(h, col, np.full((n, n), 0.98))
    for i in range(16000):
        x, y = rg.uniform(0, T, 2)
        hgt = rg.uniform(0.003, 0.009)
        v, f = blade_mesh(hgt, rg.uniform(0.0008, 0.0018), rg.uniform(0.2, 1.0), segs=2)
        R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(0, 0.7), 0)
        v = v @ R.T
        v[:, 2] += t.gh(x, y)
        c = lin(0.10, 0.17, 0.03) * rg.uniform(0.5, 1.6)
        if rg.random() < 0.08:
            c = lin(0.25, 0.22, 0.06) * rg.uniform(0.7, 1.2)  # sporophyte / dry tips
        t.place("frond", v, f, (*c, 0.9), x, y, hgt)
    for i in range(120):
        x, y = rg.uniform(0, T, 2)
        L = rg.uniform(0.04, 0.12)
        v, f = leaf_mesh(L, L * 0.45, rg, curl=0.4)
        R = rot_matrix(rg.uniform(0, 6.28), rg.uniform(-0.2, 0.2), 0)
        v = v @ R.T
        v[:, 2] += t.gh(x, y) + 0.012
        c = lin(0.3, 0.18, 0.08) * rg.uniform(0.6, 1.1)
        t.place("leaf", v, f, (*c, 0.8), x, y, L)
    return t


# per-pixel grain applied after baking: (albedo variation, dark speckle, light speckle, micro-normal)
GRAIN = {
    "sand": (0.16, 0.10, 0.08, 1.4),
    "forest": (0.12, 0.02, 0.0, 0.5),
    "soil": (0.14, 0.05, 0.02, 0.8),
    "rock": (0.10, 0.04, 0.03, 0.7),
    "mud": (0.08, 0.02, 0.0, 0.35),
    "ash": (0.16, 0.0, 0.03, 0.9),
    "gravel": (0.08, 0.03, 0.02, 0.5),
    "moss": (0.18, 0.04, 0.03, 0.7),
}

LAYERS = {
    "sand": (2.6, layer_sand),
    "forest": (3.2, layer_forest),
    "soil": (3.0, layer_soil),
    "rock": (5.0, layer_rock),
    "mud": (3.0, layer_mud),
    "ash": (3.4, layer_ash),
    "gravel": (2.2, layer_gravel),
    "moss": (2.4, layer_moss),
}


# ---------------------------------------------------------------------------- de-tiling
def _lowpass(f, sigma):
    """Periodic Gaussian blur (the tile wraps), sigma in pixels."""
    n = f.shape[0]
    k = np.fft.fftfreq(n)
    g = np.exp(-2.0 * np.pi ** 2 * sigma ** 2 * (k[None, :] ** 2 + k[:, None] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(f, axes=(0, 1)) * (g[..., None] if f.ndim == 3 else g), axes=(0, 1)))


def detile(alb, height, sigma_frac=0.045, keep_lum=0.3, chroma_frac=0.025, keep_h=0.45):
    """Blobs wider than ~1/6 of the tile repeat every few metres in game and read as a grid
    (e.g. a rust patch on the ash).  In log space (so the mean stays), split the colour into
    brightness and hue: tile-scale hue shifts are removed entirely (small coloured stones keep
    theirs), most of the tile-scale brightness swells too; the broad height swells the splat
    height-blend keys on are flattened.  Macro variation comes from world-space noise in the
    terrain shader instead.  alb: linear HxWx3, height: HxW 0..1.  Returns both."""
    n = alb.shape[0]
    la = np.log(np.clip(alb, 1e-4, None))
    lum = la.mean(-1, keepdims=True)
    chroma = la - lum
    lum = lum - (1.0 - keep_lum) * (_lowpass(lum, sigma_frac * n) - lum.mean())
    chroma = chroma - (_lowpass(chroma, chroma_frac * n) - chroma.reshape(-1, 3).mean(0))
    h = height - (1.0 - keep_h) * (_lowpass(height, sigma_frac * n) - height.mean())
    lo, hi = np.percentile(h, 0.5), np.percentile(h, 99.5)
    return np.exp(lum + chroma), np.clip((h - lo) / max(hi - lo, 1e-6), 0, 1)


def detile_existing(name):
    """Apply detile() to an already exported layer (used once on textures baked before it existed)."""
    from PIL import Image
    d = os.path.join(ASSETS, "ground")
    a = np.asarray(Image.open(os.path.join(d, f"{name}_albedo.webp")).convert("RGB"), np.float32)[::-1] / 255.0
    nm = np.asarray(Image.open(os.path.join(d, f"{name}_normal.webp")).convert("RGB"), np.float32)[::-1] / 255.0
    alb, h = detile(srgb_to_linear(a), nm[..., 2])
    save_webp(linear_to_srgb(alb), os.path.join(d, f"{name}_albedo.webp"), quality=90)
    save_webp(np.concatenate([nm[..., :2], h[..., None]], -1), os.path.join(d, f"{name}_normal.webp"), quality=94)
    print(f"[{name}] detiled")


# ---------------------------------------------------------------------------- bake
def bake_layer(name):
    T, fn = LAYERS[name]
    t0 = time.time()
    sc = reset()
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.light_settings.distance = 0.06
    tile = fn(T)
    highs = tile.build()
    # everything below the bake plane at z = 0
    zmax = max(max(v[2] for v in o.bound_box) for o in highs)
    zmin = min(min(v[2] for v in o.bound_box) for o in highs)
    for o in highs:
        o.location.z -= zmax + 0.002
    bpy.context.view_layer.update()
    low = mesh_object("low", [(0, 0, 0), (T, 0, 0), (T, T, 0), (0, T, 0)], [(0, 1, 2, 3)], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    low.data.materials.append(bpy.data.materials.new("lowmat"))
    print(f"[{name}] geometry {sum(len(o.data.polygons) for o in highs)} tris in {time.time() - t0:.1f}s")

    imgs = {}
    for kind, samples in (("DIFFUSE", 4), ("NORMAL", 4), ("AO", 48)):
        img = new_image(f"{name}_{kind}", RES, data=True)
        bake(low, highs, img, kind, samples=samples, extrusion=0.003, max_dist=1.0, margin=0)
        imgs[kind] = image_to_np(img)
        print(f"[{name}] baked {kind} {time.time() - t0:.1f}s")
    # height: emission of the world Z position
    rng = (zmin - zmax - 0.002, -0.002)
    for o in highs:
        m = bpy.data.materials.new("hz")
        nt = m.node_tree
        for nd in list(nt.nodes):
            if nd.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(nd)
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = rng[0]
        mr.inputs["From Max"].default_value = rng[1]
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(geo.outputs["Position"], sep.inputs[0])
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], em.inputs["Color"])
        nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
        o.data.materials.clear()
        o.data.materials.append(m)
    img = new_image(f"{name}_H", RES, data=True)
    bake(low, highs, img, "EMIT", samples=4, extrusion=0.003, max_dist=1.0, margin=0)
    H = image_to_np(img)[..., 0]
    print(f"[{name}] baked height {time.time() - t0:.1f}s")

    alb = imgs["DIFFUSE"][..., :3]
    ao = imgs["AO"][..., 0]
    nrm = imgs["NORMAL"][..., :3]
    gv, gd, gl, gn = GRAIN[name]
    g1 = fft_noise(RES, 0.15, 900)
    g2 = fft_noise(RES, 0.1, 901)
    g3 = fft_noise(RES, 1.2, 902)
    alb = alb * (1 + gv * g1[..., None] + gv * 0.6 * g3[..., None])
    alb = alb * np.where(g2[..., None] > 1 - gd * 2.2, 0.45, 1.0)
    alb = alb + np.where(g2[..., None] < -1 + gl * 2.2, 0.12, 0.0)
    # micro relief from the grain field
    hd = (g1 * 0.6 + g3 * 0.4) * gn
    dx = (np.roll(hd, -1, 1) - np.roll(hd, 1, 1)) * 0.5
    dy = (np.roll(hd, -1, 0) - np.roll(hd, 1, 0)) * 0.5
    nrm = nrm.copy()
    nrm[..., 0] = np.clip(nrm[..., 0] - dx * 0.35, 0, 1)
    nrm[..., 1] = np.clip(nrm[..., 1] - dy * 0.35, 0, 1)
    # contact darkening from AO, then encode
    alb = alb * (0.35 + 0.65 * ao[..., None])
    Hn = (H - np.percentile(H, 0.5)) / max(np.percentile(H, 99.5) - np.percentile(H, 0.5), 1e-6)
    alb, Hn = detile(alb, Hn)
    out_a = linear_to_srgb(alb)
    out_n = np.concatenate([nrm[..., :2], np.clip(Hn, 0, 1)[..., None]], -1)
    d = os.path.join(ASSETS, "ground")
    save_webp(out_a, os.path.join(d, f"{name}_albedo.webp"), quality=90)
    save_webp(out_n, os.path.join(d, f"{name}_normal.webp"), quality=94)
    print(f"[{name}] done in {time.time() - t0:.1f}s; mean albedo {alb.reshape(-1, 3).mean(0)}")


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("-")] or list(LAYERS)
    for nm in names:
        detile_existing(nm) if "--detile-existing" in sys.argv else bake_layer(nm)

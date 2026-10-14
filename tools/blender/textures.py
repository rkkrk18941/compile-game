"""Bake NOCLIP's surface textures in Blender.

    blender -b --factory-startup -P tools/blender/textures.py -- OUT_DIR [RES] [name,name,...]

For every material this writes OUT_DIR/<name>.npz holding linear albedo,
roughness and height (metres) at RES×RES; tools/blender/pack_textures.py then
derives normals + ambient occlusion and packs the WebP pairs the game loads.
Each material function builds a procedural Cycles shader graph with nodes.G and
returns its channels; `size` is the real-world width of one texture tile in
metres (it must match the game's texture scale for that surface).
"""
import os
import sys
import time

import bpy  # noqa: F401  (Blender)

sys.path.insert(0, os.path.dirname(__file__))
from nodes import G, bake_channel, bake_setup  # noqa: E402

MATS = {}


def material(size, **meta):
    def deco(fn):
        MATS[fn.__name__] = (fn, dict(size=size, **meta))
        return fn

    return deco


# ---------------------------------------------------------------------------
# The yellow rooms
# ---------------------------------------------------------------------------
@material(0.53, gray=True)
def paper(g):
    """Backrooms wallpaper, stored as luminance (the game tints it per zone).
    One 53 cm roll: a plain band and a narrow band with a chain of chevrons,
    lightly embossed, printed slightly unevenly on fibrous paper."""
    u = g.u
    du = g.absf(g.sub(u, 0.75))
    band = g.sub(1.0, g.smooth(0.085, 0.095, du))
    pin = g.sub(1.0, g.smooth(0.004, 0.009, g.absf(g.sub(du, 0.115))))
    lx = g.div(g.sub(u, 0.75), 0.085)
    fy = g.fract(g.add(g.mul(g.v, 7.0), g.mul(g.absf(lx), 0.32)))
    chev = g.sub(1.0, g.smooth(0.035, 0.07, g.absf(g.sub(fy, 0.5))))
    chev = g.mul(chev, g.mul(band, g.sub(1.0, g.smooth(0.7, 0.92, g.absf(lx)))))
    dq = g.absf(g.sub(g.fract(g.add(g.mul(g.v, 3.5), 0.25)), 0.5))
    dd = g.add(g.absf(g.sub(u, 0.25)), g.mul(dq, 0.18))
    diamond = g.sub(1.0, g.smooth(0.012, 0.022, dd))
    ink = g.add(0.75, g.mul(g.noise(14.0, 4, 0.6, seed=7), 0.5))  # uneven print
    pattern = g.clamp01(g.add(g.add(g.mul(band, 0.26), g.mul(pin, 0.5)), g.mul(g.add(g.mul(chev, 0.7), g.mul(diamond, 0.4)), ink)))
    fib = g.noise(110.0, 6, 0.65, su=1.0, sv=1.9)
    fine = g.noise(400.0, 2, 0.5, seed=9)
    streak = g.noise(3.0, 3, 0.5, su=40.0, sv=0.6)
    blot = g.noise(2.0, 4, 0.55, seed=3)
    lum = g.add(0.9, g.mul(pattern, -0.21))
    lum = g.add(lum, g.mul(g.sub(fib, 0.5), 0.07))
    lum = g.add(lum, g.mul(g.sub(fine, 0.5), 0.03))
    lum = g.add(lum, g.mul(g.sub(streak, 0.5), 0.05))
    lum = g.add(lum, g.mul(g.sub(blot, 0.5), 0.06))
    h = g.add(g.mul(pattern, 0.00045), g.add(g.mul(g.sub(fib, 0.5), 0.0003), g.mul(g.sub(fine, 0.5), 0.0001)))
    return dict(color=(lum, lum, lum), rough=g.add(0.8, g.mul(pattern, -0.1)), height=h)


@material(2.0)
def carpet(g):
    """Damp mustard cut-pile carpet: fibre tufts, matted tracks, mottling."""
    tuft = g.voronoi(260.0, "F1", rand=0.9)
    fiber = g.noise(420.0, 2, 0.6, seed=1)
    pile = g.noise(60.0, 5, 0.6, seed=2)
    mott = g.noise(4.0, 5, 0.55, seed=4)
    matt = g.smooth(0.45, 0.75, g.noise(1.6, 4, 0.6, seed=5))
    rows = g.add(0.5, g.mul(g.sin(g.mul(g.v, 2 * 3.14159 * 220)), 0.5))
    t = g.clamp01(g.add(g.add(g.mul(tuft, 0.6), g.mul(fiber, 0.35)), g.mul(rows, 0.08)))
    base = g.ramp(g.add(g.mul(mott, 0.7), g.mul(pile, 0.3)), [(0.25, (0.20, 0.145, 0.06)), (0.55, (0.27, 0.2, 0.085)), (0.8, (0.31, 0.235, 0.105))])
    k = g.mul(g.add(0.72, g.mul(t, 0.45)), g.lerp(1.0, 0.82, matt))
    col = g.cmul(base, k)
    h = g.add(g.mul(t, 0.003), g.mul(matt, -0.0012))
    return dict(color=col, rough=g.add(0.93, g.mul(matt, -0.12)), height=h)


@material(1.2)
def tiles(g):
    """Suspended ceiling: four 60 cm fissured mineral-fibre tiles in a painted
    T-bar grid. Seen from below, so the grid stands proud of the tiles."""
    fu, fv, iu, iv = g.grid(2, 2)
    e = g.edge_dist(fu, fv)
    bar = g.sub(1.0, g.smooth(0.018, 0.022, e))
    bevel = g.smooth(0.022, 0.045, e)
    tv = g.hash2(iu, iv, 1)
    worm = g.smooth(0.62, 0.78, g.noise(26.0, 2, 0.5, kind="RIDGED_MULTIFRACTAL", seed=2))
    worm = g.mul(worm, g.smooth(0.38, 0.6, g.noise(11.0, 3, 0.5, seed=3)))
    pits = g.sub(1.0, g.smooth(0.08, 0.2, g.voronoi(150.0, "F1", seed=4)))
    pits = g.mul(pits, g.smooth(0.35, 0.6, g.noise(40.0, 2, 0.5, seed=5)))
    speck = g.noise(300.0, 2, 0.6, seed=6)
    sag = g.mul(g.noise(1.5, 2, 0.5, seed=8), 0.04)
    base = g.add(0.68, g.add(g.mul(tv, 0.05), g.mul(g.sub(speck, 0.5), 0.05)))
    base = g.sub(base, g.add(g.mul(worm, 0.07), g.mul(pits, 0.2)))
    base = g.sub(base, sag)
    tile = (g.mul(base, 1.0), g.mul(base, 0.975), g.mul(base, 0.9))
    gridc = (0.62, 0.61, 0.58)
    col = g.cmix(tile, gridc, bar)
    col = g.cmul(col, g.lerp(0.86, 1.0, bevel))
    h = g.add(g.mul(bar, 0.004), g.mul(g.sub(1.0, bevel), -0.0015))
    h = g.sub(h, g.add(g.mul(worm, 0.0012), g.mul(pits, 0.0016)))
    return dict(color=col, rough=g.lerp(0.95, 0.42, bar), height=h)


# ---------------------------------------------------------------------------
# Pools, concrete, industrial
# ---------------------------------------------------------------------------
@material(1.2)
def tile(g):
    """Pool tiles: 8×8 glossy 15 cm tiles, cushioned edges, slightly tilted
    each (so reflections break up), dirty recessed grout, lime stains."""
    fu, fv, iu, iv = g.grid(8, 8)
    e = g.edge_dist(fu, fv)
    grout = g.sub(1.0, g.smooth(0.012, 0.02, e))
    cushion = g.smooth(0.012, 0.09, e)
    tv = g.hash2(iu, iv, 2)
    tu = g.hash2(iu, iv, 5)
    tw = g.hash2(iu, iv, 9)
    tilt = g.add(g.mul(g.sub(fu, 0.5), g.sub(tu, 0.5)), g.mul(g.sub(fv, 0.5), g.sub(tw, 0.5)))
    lime = g.smooth(0.55, 0.8, g.noise(3.0, 5, 0.6, seed=4))
    craze = g.mul(g.sub(1.0, g.smooth(0.0, 0.012, g.voronoi(36.0, "DISTANCE_TO_EDGE", seed=6))), g.smooth(0.6, 0.75, g.noise(5.0, 2, 0.5, seed=7)))
    base = g.ramp(tv, [(0.0, (0.66, 0.74, 0.76)), (0.6, (0.72, 0.8, 0.82)), (1.0, (0.78, 0.84, 0.85))])
    base = g.cmul(base, g.sub(1.0, g.mul(craze, 0.25)))
    base = g.cmix(base, (0.75, 0.74, 0.66), g.mul(lime, 0.45))
    groutc = g.cmul((0.36, 0.38, 0.36), g.add(0.75, g.mul(g.noise(60.0, 3, 0.6, seed=8), 0.5)))
    col = g.cmix(base, groutc, grout)
    h = g.add(g.mul(cushion, 0.0025), g.mul(tilt, 0.0007))
    h = g.sub(h, g.mul(grout, 0.0015))
    return dict(color=col, rough=g.lerp(g.add(0.07, g.mul(lime, 0.25)), 0.85, grout), height=h)


@material(3.0)
def concrete(g):
    """Cast-in-place concrete: plywood formwork seams, cone tie holes, bug
    holes, aggregate specks, water marks."""
    mott = g.noise(2.2, 6, 0.55, seed=1)
    mid = g.noise(14.0, 5, 0.55, seed=2)
    agg = g.voronoi(420.0, "F1", seed=3)
    aggc = g.hash2(g.floor(g.mul(g.u, 420)), g.floor(g.mul(g.v, 420)), 4)
    bug = g.sub(1.0, g.smooth(0.05, 0.16, g.voronoi(90.0, "F1", rand=1.0, seed=5)))
    bug = g.mul(bug, g.smooth(0.55, 0.72, g.noise(6.0, 2, 0.5, seed=6)))
    # 1.5 m formwork panels: seams on both axes
    seam = g.mx(g.sub(1.0, g.smooth(0.0, 0.0025, g.absf(g.sub(g.fract(g.mul(g.u, 2.0)), 0.5)))), g.sub(1.0, g.smooth(0.0, 0.0025, g.absf(g.sub(g.fract(g.mul(g.v, 2.0)), 0.5)))))
    fu, fv, iu, iv = g.grid(4, 4)
    tied = g.smooth(0.5, 0.51, g.hash2(iu, iv, 7))
    td = g.add(g.mul(g.sub(fu, 0.5), g.sub(fu, 0.5)), g.mul(g.sub(fv, 0.5), g.sub(fv, 0.5)))
    tie = g.mul(g.sub(1.0, g.smooth(0.0011, 0.0016, td)), tied)
    tierim = g.mul(g.sub(1.0, g.smooth(0.0016, 0.0045, td)), tied)
    drip = g.mul(g.smooth(0.5, 0.75, g.noise(3.0, 4, 0.6, su=8.0, sv=0.7, seed=8)), 0.6)
    lum = g.add(0.33, g.add(g.mul(g.sub(mott, 0.5), 0.12), g.mul(g.sub(mid, 0.5), 0.06)))
    lum = g.add(lum, g.mul(g.sub(aggc, 0.5), g.mul(g.smooth(0.25, 0.1, agg), 0.08)))
    lum = g.sub(lum, g.add(g.mul(bug, 0.12), g.mul(seam, 0.06)))
    lum = g.sub(lum, g.add(g.mul(tie, 0.18), g.mul(tierim, 0.03)))
    lum = g.sub(lum, g.mul(drip, 0.05))
    col = (lum, g.mul(lum, 0.97), g.mul(lum, 0.92))
    h = g.add(g.mul(g.sub(mid, 0.5), 0.0012), g.mul(g.sub(mott, 0.5), 0.002))
    h = g.sub(h, g.add(g.mul(bug, 0.003), g.add(g.mul(seam, -0.0008), g.mul(tie, 0.012))))
    return dict(color=col, rough=g.add(0.88, g.mul(drip, -0.15)), height=h)


@material(4.0)
def asphalt(g):
    """Parking deck asphalt: graded stones in dark binder, hairline cracks,
    oil stains."""
    stones = g.voronoi(520.0, "F1", rand=1.0, seed=1)
    stid = g.voronoi(520.0, "F1", rand=1.0, seed=1, out="Color")
    big = g.voronoi(160.0, "F1", rand=1.0, seed=2)
    bigc = g.voronoi(160.0, "F1", rand=1.0, seed=2, out="Color")
    stone = g.smooth(0.42, 0.22, stones)
    bstone = g.smooth(0.45, 0.25, big)
    crack = g.mul(g.sub(1.0, g.smooth(0.0, 0.01, g.voronoi(3.5, "DISTANCE_TO_EDGE", seed=3))), g.smooth(0.5, 0.65, g.noise(4.0, 3, 0.5, seed=4)))
    oil = g.smooth(0.55, 0.78, g.noise(1.4, 5, 0.6, seed=5))
    mott = g.noise(3.0, 5, 0.55, seed=6)
    binder = g.add(0.055, g.mul(mott, 0.04))
    sv = g.add(0.09, g.mul(stid[0], 0.14))
    bv = g.add(0.1, g.mul(bigc[1], 0.16))
    lum = g.lerp(binder, sv, stone)
    lum = g.lerp(lum, bv, bstone)
    lum = g.mul(lum, g.sub(1.0, g.mul(oil, 0.45)))
    lum = g.mul(lum, g.sub(1.0, g.mul(crack, 0.6)))
    col = (lum, lum, g.mul(lum, 0.96))
    h = g.add(g.mul(stone, 0.0015), g.mul(bstone, 0.003))
    h = g.sub(h, g.mul(crack, 0.004))
    return dict(color=col, rough=g.lerp(0.88, 0.45, oil), height=h)


@material(2.4)
def brick(g):
    """Old red brick: 10 × 32 courses per tile in running bond, recessed
    mortar, varied firing colours, chipped arrises, efflorescence."""
    fu, fv, iu, iv = g.grid(10, 32, offset_rows=0.5)
    e = g.edge_dist(fu, g.mul(fv, 1.0), aspect=10.0 / 32.0 * 3.2)
    chip = g.mul(g.noise(80.0, 4, 0.6, seed=9), 0.06)
    mort = g.sub(1.0, g.smooth(0.03, 0.045, g.add(e, g.sub(chip, 0.03))))
    bv = g.hash2(iu, iv, 3)
    bv2 = g.hash2(iu, iv, 8)
    pal = g.ramp(bv, [(0.0, (0.2, 0.07, 0.04)), (0.35, (0.3, 0.11, 0.06)), (0.7, (0.36, 0.15, 0.08)), (0.92, (0.28, 0.16, 0.1)), (1.0, (0.12, 0.07, 0.05))])
    n1 = g.noise(30.0, 5, 0.6, seed=4)
    burn = g.mul(g.sub(1.0, g.smooth(0.05, 0.2, e)), 0.25)
    brickc = g.cmul(pal, g.mul(g.add(0.78, g.mul(n1, 0.45)), g.sub(1.0, burn)))
    brickc = g.cmul(brickc, g.add(0.92, g.mul(bv2, 0.16)))
    efflo = g.mul(g.smooth(0.6, 0.85, g.noise(2.5, 5, 0.6, seed=6)), 0.5)
    mortc = g.cmul((0.33, 0.32, 0.29), g.add(0.8, g.mul(g.noise(90.0, 3, 0.6, seed=5), 0.4)))
    col = g.cmix(brickc, mortc, mort)
    col = g.cmix(col, (0.55, 0.53, 0.49), g.mul(efflo, g.add(0.3, g.mul(mort, 0.7))))
    h = g.add(g.mul(g.sub(1.0, mort), 0.008), g.mul(g.sub(n1, 0.5), 0.0015))
    return dict(color=col, rough=g.lerp(0.86, 0.95, mort), height=h)


@material(2.0)
def grating(g):
    """Galvanised bar grating over a black drop: bearing bars every 3 cm,
    cross rods every 10 cm, rust creeping along the welds."""
    bu = g.fract(g.mul(g.u, 64.0))
    bvv = g.fract(g.mul(g.v, 20.0))
    bear = g.sub(1.0, g.smooth(0.16, 0.2, g.absf(g.sub(bu, 0.5))))
    cross = g.sub(1.0, g.smooth(0.07, 0.1, g.absf(g.sub(bvv, 0.5))))
    metal = g.mx(bear, cross)
    weld = g.mul(bear, cross)
    rust = g.smooth(0.5, 0.75, g.add(g.noise(5.0, 5, 0.6, seed=2), g.mul(weld, 0.3)))
    n = g.noise(40.0, 3, 0.6, seed=3)
    mc = g.cmix(g.cmul((0.42, 0.43, 0.44), g.add(0.75, g.mul(n, 0.4))), (0.28, 0.12, 0.05), rust)
    hole = (0.006, 0.006, 0.006)
    col = g.cmix(hole, mc, metal)
    h = g.add(g.mul(metal, 0.02), g.mul(cross, -0.004))
    return dict(color=col, rough=g.lerp(0.95, g.lerp(0.45, 0.85, rust), metal), height=h)


@material(2.4)
def lino(g):
    """Hospital vinyl composition tiles (60 cm), chip-speckled, waxed, with
    dark seams and heel scuffs."""
    fu, fv, iu, iv = g.grid(4, 4)
    e = g.edge_dist(fu, fv)
    seam = g.sub(1.0, g.smooth(0.003, 0.006, e))
    tv = g.hash2(iu, iv, 1)
    chips = g.voronoi(300.0, "F1", seed=2, out="Color")
    chipm = g.smooth(0.28, 0.18, g.voronoi(300.0, "F1", seed=2))
    base = g.cmix((0.38, 0.41, 0.36), (0.34, 0.38, 0.34), tv)
    base = g.cmix(base, g.cmul(chips, 0.5), g.mul(chipm, 0.35))
    scuff = g.mul(g.smooth(0.62, 0.8, g.noise(6.0, 4, 0.6, su=1.0, sv=6.0, seed=3)), 0.5)
    wax = g.smooth(0.25, 0.04, e)
    col = g.cmul(base, g.sub(1.0, g.mul(scuff, 0.35)))
    col = g.cmul(col, g.sub(1.0, g.mul(seam, 0.45)))
    col = g.cmul(col, g.sub(1.0, g.mul(wax, 0.08)))
    h = g.sub(g.mul(g.sub(g.noise(50.0, 3, 0.5, seed=4), 0.5), 0.0002), g.mul(seam, 0.0008))
    return dict(color=col, rough=g.add(0.32, g.add(g.mul(scuff, 0.25), g.mul(wax, 0.1))), height=h)


@material(2.4)
def officeCarpet(g):
    """Dark loop-pile carpet tiles laid quarter-turned."""
    fu, fv, iu, iv = g.grid(4, 4)
    e = g.edge_dist(fu, fv)
    seam = g.sub(1.0, g.smooth(0.004, 0.012, e))
    turn = g.mod(g.add(iu, iv), 2.0)
    s1 = g.noise(5.0, 2, 0.5, su=120.0, sv=6.0, seed=1)
    s2 = g.noise(5.0, 2, 0.5, su=6.0, sv=120.0, seed=1)
    stri = g.lerp(s1, s2, turn)
    loops = g.voronoi(700.0, "F1", seed=2)
    fleck = g.smooth(0.82, 0.9, g.noise(220.0, 2, 0.5, seed=3))
    wear = g.noise(2.0, 4, 0.6, seed=4)
    lum = g.add(0.85, g.add(g.mul(g.sub(stri, 0.5), 0.35), g.mul(g.sub(loops, 0.5), 0.3)))
    col = g.cmul((0.07, 0.085, 0.11), g.mul(lum, g.add(0.85, g.mul(wear, 0.3))))
    col = g.cmix(col, (0.2, 0.2, 0.22), g.mul(fleck, 0.6))
    col = g.cmul(col, g.sub(1.0, g.mul(seam, 0.35)))
    h = g.add(g.mul(stri, 0.0012), g.mul(g.sub(1.0, loops), 0.0012))
    h = g.sub(h, g.mul(seam, 0.002))
    return dict(color=col, rough=0.96, height=h)


@material(2.0)
def drywall(g):
    """Painted gypsum board: orange-peel roller texture, faint roller laps."""
    peel = g.noise(240.0, 3, 0.55, seed=1)
    lap = g.noise(1.2, 3, 0.5, su=0.4, sv=6.0, seed=2)
    mott = g.noise(3.0, 4, 0.5, seed=3)
    lum = g.add(0.56, g.add(g.mul(g.sub(mott, 0.5), 0.05), g.mul(g.sub(lap, 0.5), 0.04)))
    col = (lum, g.mul(lum, 0.985), g.mul(lum, 0.94))
    h = g.add(g.mul(g.sub(peel, 0.5), 0.0006), g.mul(g.sub(lap, 0.5), 0.0003))
    return dict(color=col, rough=g.add(0.82, g.mul(peel, 0.06)), height=h)


# ---------------------------------------------------------------------------
# Night station
# ---------------------------------------------------------------------------
@material(2.4)
def platformTile(g):
    """Station platform pavers: 30 cm speckled granite tiles, dark grout,
    trodden grime and the odd flattened chewing gum."""
    fu, fv, iu, iv = g.grid(8, 8)
    e = g.edge_dist(fu, fv)
    grout = g.sub(1.0, g.smooth(0.01, 0.018, e))
    tv = g.hash2(iu, iv, 3)
    sp1 = g.smooth(0.3, 0.18, g.voronoi(520.0, "F1", seed=1))
    sp1c = g.voronoi(520.0, "F1", seed=1, out="Color")
    sp2 = g.smooth(0.25, 0.12, g.voronoi(240.0, "F1", seed=2))
    grime = g.noise(2.5, 5, 0.6, seed=4)
    gum = g.mul(g.sub(1.0, g.smooth(0.05, 0.09, g.voronoi(14.0, "F1", seed=5))), g.smooth(0.72, 0.74, g.hash2(g.floor(g.mul(g.u, 14)), g.floor(g.mul(g.v, 14)), 6)))
    lum = g.add(0.36, g.mul(g.sub(tv, 0.5), 0.06))
    lum = g.add(lum, g.mul(g.sub(sp1c[0], 0.5), g.mul(sp1, 0.35)))
    lum = g.sub(lum, g.mul(sp2, 0.1))
    lum = g.mul(lum, g.add(0.82, g.mul(grime, 0.3)))
    col = (lum, g.mul(lum, 0.99), g.mul(lum, 0.97))
    col = g.cmix(col, (0.12, 0.12, 0.12), g.mul(gum, 0.8))
    col = g.cmix(col, (0.1, 0.1, 0.1), grout)
    h = g.add(g.mul(g.sub(1.0, grout), 0.002), g.mul(gum, 0.0008))
    return dict(color=col, rough=g.add(0.62, g.add(g.mul(grout, 0.3), g.mul(gum, -0.3))), height=h)


@material(1.2)
def metroTile(g):
    """Glazed white subway tiles, 15 × 7.5 cm in running bond with bevelled
    edges, grey grout, crazed glaze and soot in the joints."""
    fu, fv, iu, iv = g.grid(8, 16, offset_rows=0.5)
    e = g.edge_dist(fu, fv, aspect=0.5)
    grout = g.sub(1.0, g.smooth(0.01, 0.018, e))
    bevel = g.smooth(0.018, 0.08, e)
    tv = g.hash2(iu, iv, 4)
    craze = g.mul(g.sub(1.0, g.smooth(0.0, 0.01, g.voronoi(40.0, "DISTANCE_TO_EDGE", seed=2))), g.smooth(0.55, 0.7, g.noise(4.0, 2, 0.5, seed=3)))
    soot = g.smooth(0.4, 0.8, g.noise(2.0, 5, 0.6, su=1.0, sv=0.6, seed=5))
    base = g.cmul((0.83, 0.82, 0.78), g.add(0.95, g.mul(tv, 0.06)))
    base = g.cmul(base, g.sub(1.0, g.add(g.mul(craze, 0.2), g.mul(soot, 0.12))))
    base = g.cmul(base, g.lerp(0.9, 1.0, bevel))
    groutc = g.cmul((0.22, 0.22, 0.21), g.sub(1.0, g.mul(soot, 0.4)))
    col = g.cmix(base, groutc, grout)
    h = g.add(g.mul(bevel, 0.0025), g.mul(grout, -0.0015))
    return dict(color=col, rough=g.lerp(g.add(0.06, g.mul(soot, 0.2)), 0.9, grout), height=h)


@material(2.4)
def metalCeil(g):
    """Linear aluminium strip ceiling: 10 cm painted strips with black gaps,
    a few dented strips."""
    su = g.fract(g.mul(g.u, 24.0))
    gap = g.sub(1.0, g.smooth(0.07, 0.1, g.absf(g.sub(su, 0.5))))
    gap = g.sub(1.0, gap)  # 1 on the strip, 0 in the gap
    roll = g.mul(g.sub(1.0, g.mul(g.sub(su, 0.5), g.sub(su, 0.5))), 1.0)
    dent = g.mul(g.smooth(0.65, 0.8, g.noise(6.0, 3, 0.5, seed=2)), 0.6)
    n = g.noise(30.0, 3, 0.5, su=0.3, sv=8.0, seed=3)
    lum = g.add(0.62, g.mul(g.sub(n, 0.5), 0.05))
    stripc = (lum, lum, g.mul(lum, 0.97))
    col = g.cmix((0.01, 0.01, 0.012), stripc, gap)
    h = g.add(g.mul(gap, g.add(0.008, g.mul(roll, 0.002))), g.mul(dent, -0.0015))
    return dict(color=col, rough=g.lerp(0.9, 0.35, gap), height=h)


# ---------------------------------------------------------------------------
# Dead mall
# ---------------------------------------------------------------------------
@material(3.0)
def terrazzo(g):
    """Polished terrazzo: mixed marble chips in a cream binder, zinc divider
    strips on a 1.5 m grid, fine scratches."""
    chip = g.voronoi(75.0, "F1", rand=1.0, seed=1)
    chipc = g.voronoi(75.0, "F1", rand=1.0, seed=1, out="Color")
    small = g.voronoi(240.0, "F1", rand=1.0, seed=2)
    smallc = g.voronoi(240.0, "F1", rand=1.0, seed=2, out="Color")
    cm = g.smooth(0.4, 0.33, chip)
    sm = g.smooth(0.38, 0.3, small)
    pal = g.ramp(chipc[0], [(0.0, (0.06, 0.06, 0.06)), (0.25, (0.45, 0.44, 0.42)), (0.5, (0.72, 0.7, 0.66)), (0.7, (0.42, 0.24, 0.16)), (0.85, (0.22, 0.3, 0.24)), (1.0, (0.8, 0.79, 0.75))])
    pal2 = g.ramp(smallc[1], [(0.0, (0.2, 0.2, 0.2)), (0.5, (0.65, 0.63, 0.6)), (1.0, (0.4, 0.3, 0.22))])
    binder = (0.58, 0.55, 0.49)
    col = g.cmix(binder, pal2, g.mul(sm, 0.8))
    col = g.cmix(col, pal, cm)
    du = g.absf(g.sub(g.fract(g.mul(g.u, 2.0)), 0.5))
    dv = g.absf(g.sub(g.fract(g.mul(g.v, 2.0)), 0.5))
    strip = g.mx(g.smooth(0.4985, 0.4995, du), g.smooth(0.4985, 0.4995, dv))
    col = g.cmix(col, (0.5, 0.5, 0.48), strip)
    scratch = g.mul(g.sub(1.0, g.smooth(0.0, 0.006, g.voronoi(25.0, "DISTANCE_TO_EDGE", seed=4))), g.smooth(0.5, 0.7, g.noise(8.0, 2, 0.5, seed=5)))
    dirt = g.noise(2.0, 4, 0.6, seed=6)
    col = g.cmul(col, g.add(0.9, g.mul(dirt, 0.15)))
    h = g.add(g.mul(scratch, -0.0002), g.mul(strip, 0.0002))
    return dict(color=col, rough=g.add(0.1, g.add(g.mul(scratch, 0.25), g.mul(dirt, 0.08))), height=h)


# ---------------------------------------------------------------------------
# Night school
# ---------------------------------------------------------------------------
@material(2.4)
def woodFloor(g):
    """Varnished oak strip flooring: 7.5 cm strips of random length, grain,
    worn varnish along the walking line, dark gaps."""
    rows = 32.0
    pv = g.mul(g.v, rows)
    iv = g.mod(g.floor(pv), rows)
    fv = g.fract(pv)
    off = g.hash2(iv, 0.0, 1)
    lenk = g.floor(g.add(2.0, g.mul(g.hash2(iv, 0.0, 2), 3.0)))  # 2..4 boards per tile row
    pu = g.add(g.mul(g.u, lenk), off)
    iu = g.mod(g.floor(pu), lenk)
    fu = g.fract(pu)
    gap = g.mx(g.sub(1.0, g.smooth(0.02, 0.06, g.mn(fv, g.sub(1.0, fv)))), g.sub(1.0, g.smooth(0.002, 0.006, g.div(g.mn(fu, g.sub(1.0, fu)), lenk))))
    bv = g.hash2(iu, iv, 3)
    grain = g.noise(6.0, 6, 0.6, su=3.0, sv=rows * 1.4, dist=0.4, seed=4)
    rings = g.add(0.5, g.mul(g.sin(g.mul(g.add(g.mul(g.v, rows * 8.0), g.mul(grain, 18.0)), 1.0)), 0.5))
    pal = g.ramp(bv, [(0.0, (0.28, 0.16, 0.07)), (0.5, (0.36, 0.21, 0.1)), (1.0, (0.44, 0.27, 0.13))])
    col = g.cmul(pal, g.add(0.82, g.add(g.mul(grain, 0.2), g.mul(rings, 0.12))))
    wear = g.smooth(0.55, 0.8, g.noise(1.3, 4, 0.6, su=0.5, sv=2.0, seed=6))
    col = g.cmix(col, g.cmul(col, 1.25), g.mul(wear, 0.5))
    col = g.cmix(col, (0.03, 0.02, 0.015), g.mul(gap, 0.9))
    h = g.add(g.mul(g.sub(1.0, gap), 0.0015), g.mul(rings, 0.0002))
    return dict(color=col, rough=g.add(0.28, g.add(g.mul(wear, 0.35), g.mul(gap, 0.4))), height=h)


# ---------------------------------------------------------------------------
# Endless hotel
# ---------------------------------------------------------------------------
@material(2.0)
def hotelCarpet(g):
    """Interlocking hexagon carpet in orange, red and brown."""
    cols, rows = 5.0, 3.0
    sq = 1.7320508
    px = g.mul(g.u, cols)
    py = g.mul(g.v, rows * sq)

    def hexd(ax, ay):
        return g.mx(g.add(g.mul(g.absf(ax), 0.5), g.mul(g.absf(ay), 0.8660254)), g.absf(ax))

    ax = g.sub(g.mod(px, 1.0), 0.5)
    ay = g.sub(g.mod(py, sq), sq / 2)
    bx = g.sub(g.mod(g.sub(px, 0.5), 1.0), 0.5)
    by = g.sub(g.mod(g.sub(py, sq / 2), sq), sq / 2)
    da = g.add(g.mul(ax, ax), g.mul(ay, ay))
    db = g.add(g.mul(bx, bx), g.mul(by, by))
    useb = g.m("GREATER_THAN", da, db)
    gx = g.lerp(ax, bx, useb)
    gy = g.lerp(ay, by, useb)
    d = hexd(gy, gx)  # pointy hexagons
    ring = g.fract(g.mul(d, 3.0))
    band = g.floor(g.mul(d, 3.0))
    line = g.sub(1.0, g.smooth(0.07, 0.13, g.absf(g.sub(ring, 0.5))))
    pal = g.ramp(g.div(band, 2.0), [(0.0, (0.38, 0.1, 0.04)), (0.5, (0.6, 0.24, 0.05)), (1.0, (0.2, 0.06, 0.03))])
    col = g.cmix(pal, (0.1, 0.04, 0.02), line)
    pile = g.noise(380.0, 2, 0.6, seed=1)
    wear = g.noise(1.5, 4, 0.6, seed=2)
    col = g.cmul(col, g.mul(g.add(0.82, g.mul(pile, 0.3)), g.add(0.85, g.mul(wear, 0.25))))
    h = g.add(g.mul(pile, 0.0015), g.mul(line, -0.0006))
    return dict(color=col, rough=0.95, height=h)


@material(0.53, gray=True)
def damask(g):
    """Two-tone damask wallpaper (luminance; tinted per place and zone): a
    petalled rosette in a diamond lattice, wreathed in mirror-symmetric vines,
    satin motif on a matte ground."""
    pu = g.mul(g.u, 2.0)
    pv = g.mul(g.v, 3.0)
    fu = g.sub(g.fract(pu), 0.5)
    fv = g.sub(g.fract(pv), 0.5)
    # second lattice offset half a cell for the small diamonds
    gu = g.sub(g.fract(g.add(pu, 0.5)), 0.5)
    gv = g.sub(g.fract(g.add(pv, 0.5)), 0.5)
    ax = g.absf(fu)
    r = g.m("SQRT", g.add(g.mul(g.mul(fu, 1.2), g.mul(fu, 1.2)), g.mul(fv, fv)))
    th = g.m("ARCTAN2", fv, g.mul(fu, 1.2))
    petals = g.add(0.16, g.mul(g.cos(g.mul(th, 8.0)), 0.045))
    rosette = g.sub(1.0, g.smooth(0.0, 0.012, g.sub(r, petals)))
    core = g.sub(1.0, g.smooth(0.045, 0.055, r))
    ring = g.sub(1.0, g.smooth(0.006, 0.012, g.absf(g.sub(r, 0.105))))
    vec = g.node("ShaderNodeCombineXYZ")
    g.put(vec.inputs[0], g.mul(ax, 4.0))
    g.put(vec.inputs[1], g.mul(fv, 2.6))
    g.put(vec.inputs[2], 0.7)
    n = g.node("ShaderNodeTexNoise", noise_dimensions="3D")
    g.link(vec.outputs[0], n.inputs["Vector"])
    n.inputs["Scale"].default_value = 2.6
    n.inputs["Detail"].default_value = 2.0
    n.inputs["Roughness"].default_value = 0.5
    n.inputs["Distortion"].default_value = 0.35
    vine = g.mul(g.sub(1.0, g.smooth(0.0, 0.035, g.absf(g.sub(n.outputs["Fac"], 0.5)))), g.mul(g.smooth(0.17, 0.22, r), g.sub(1.0, g.smooth(0.36, 0.44, g.add(g.mul(ax, 1.4), g.mul(g.absf(fv), 0.8))))))
    dia = g.sub(1.0, g.smooth(0.05, 0.065, g.add(g.mul(g.absf(gu), 1.0), g.mul(g.absf(gv), 0.66))))
    motif = g.clamp01(g.add(g.add(g.mul(rosette, g.sub(1.0, g.mul(ring, 0.8))), core), g.add(g.mul(vine, 0.9), g.mul(dia, 0.8))))
    fib = g.noise(120.0, 4, 0.6, su=1.0, sv=1.9, seed=3)
    lum = g.add(0.6, g.mul(motif, 0.2))
    lum = g.add(lum, g.mul(g.sub(fib, 0.5), 0.05))
    h = g.add(g.mul(motif, 0.0003), g.mul(g.sub(fib, 0.5), 0.0002))
    return dict(color=(lum, lum, lum), rough=g.lerp(0.86, 0.42, motif), height=h)


@material(3.0)
def concreteFloor(g):
    """Power-trowelled slab: swirl marks, saw-cut joints every 1.5 m, oil and
    water stains, scuffs."""
    mott = g.noise(2.0, 6, 0.55, seed=11)
    swirl = g.noise(9.0, 3, 0.5, dist=2.5, seed=12)
    fine = g.noise(300.0, 2, 0.6, seed=13)
    stain = g.smooth(0.55, 0.8, g.noise(1.6, 5, 0.6, seed=14))
    du = g.absf(g.sub(g.fract(g.mul(g.u, 2.0)), 0.5))
    dv = g.absf(g.sub(g.fract(g.mul(g.v, 2.0)), 0.5))
    joint = g.mx(g.smooth(0.4975, 0.499, du), g.smooth(0.4975, 0.499, dv))
    lum = g.add(0.34, g.add(g.mul(g.sub(mott, 0.5), 0.1), g.mul(g.sub(swirl, 0.5), 0.05)))
    lum = g.add(lum, g.mul(g.sub(fine, 0.5), 0.03))
    lum = g.mul(lum, g.sub(1.0, g.mul(stain, 0.35)))
    lum = g.mul(lum, g.sub(1.0, g.mul(joint, 0.6)))
    col = (lum, g.mul(lum, 0.975), g.mul(lum, 0.94))
    h = g.add(g.mul(g.sub(fine, 0.5), 0.0003), g.mul(joint, -0.004))
    return dict(color=col, rough=g.add(0.7, g.add(g.mul(swirl, 0.1), g.mul(stain, -0.25))), height=h)



def run(out, res, only):
    os.makedirs(out, exist_ok=True)
    import numpy as np

    for name, (fn, meta) in MATS.items():
        if only and name not in only:
            continue
        t0 = time.time()
        ob, mat, img = bake_setup(res)
        g = G(mat)
        ch = fn(g)
        col = bake_channel(ob, mat, img, ch["color"], samples=meta.get("samples", 12))
        r = ch["rough"]
        h = ch["height"]
        rh = bake_channel(ob, mat, img, (r, h, 0.0), samples=meta.get("samples", 12))
        np.savez_compressed(
            os.path.join(out, name + ".npz"),
            color=col.astype(np.float32),
            rough=rh[:, :, 0].astype(np.float32),
            height=rh[:, :, 1].astype(np.float32),
            size=np.float32(meta["size"]),
            gray=np.bool_(meta.get("gray", False)),
        )
        print(f"[tex] {name}: {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = argv[0] if argv else "build/tex"
    res = int(argv[1]) if len(argv) > 1 else 2048
    only = set(argv[2].split(",")) if len(argv) > 2 and argv[2] else None
    run(out, res, only)

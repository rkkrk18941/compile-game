"""The Island - terrain generator.

Builds the island heightfield (shore, jungle, mire, black ridge and the
caldera that holds the Heart), erodes it with a droplet simulation, derives
biome masks and writes the runtime data used by the game:

  assets/terrain/height.bin.gz   uint16 heights, N x N, little endian
  assets/terrain/biome.png       RGB: forest, mire, volcanic masks (512 x 512)
  assets/terrain/map.webp        topographic survey map used by the in-game map
  assets/terrain/terrain.json    metadata (size, height range, landmarks)

Run with the Blender Python (bpy module) environment:
  python island/blender/terrain.py [--preview]
The --preview flag also renders a Cycles overview of the island mesh.
"""
import gzip
import json
import math
import os
import sys

import numpy as np
from numba import njit
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "terrain")
os.makedirs(OUT, exist_ok=True)

N = 1024                 # samples per side
SIZE = 1600.0            # metres, world spans [-800, 800]
HALF = SIZE / 2
STEP = SIZE / (N - 1)
HMIN, HMAX = -60.0, 280.0

LANDMARKS = {
    "lz": (0.0, 548.0),            # landing zone on the south beach
    "heart": (60.0, -430.0),       # centre of the caldera
    "mireCentre": (360.0, -30.0),
    "ridgePeak": (-330.0, -250.0),
}

rng = np.random.default_rng(20261109)
xs = np.linspace(-HALF, HALF, N)
X, Z = np.meshgrid(xs, xs)         # X east, Z south; arrays indexed [row=z][col=x]


# ----------------------------------------------------------------- noise
def _grad_table(seed, g=512):
    r = np.random.default_rng(seed)
    a = r.random((g, g)) * 2 * np.pi
    return np.cos(a), np.sin(a)


_GT = {}


def perlin(x, y, seed=0):
    if seed not in _GT:
        _GT[seed] = _grad_table(1000 + seed)
    gx, gy = _GT[seed]
    G = gx.shape[0]
    xi = np.floor(x).astype(np.int64)
    yi = np.floor(y).astype(np.int64)
    xf = x - xi
    yf = y - yi

    def g(ix, iy, dx, dy):
        ix = ix % G
        iy = iy % G
        return gx[iy, ix] * dx + gy[iy, ix] * dy

    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    n00 = g(xi, yi, xf, yf)
    n10 = g(xi + 1, yi, xf - 1, yf)
    n01 = g(xi, yi + 1, xf, yf - 1)
    n11 = g(xi + 1, yi + 1, xf - 1, yf - 1)
    a = n00 + u * (n10 - n00)
    b = n01 + u * (n11 - n01)
    return (a + v * (b - a)) * 1.41  # ~[-1, 1]


def fbm(x, y, oct=5, seed=0, lac=2.0, gain=0.5):
    s, a, f, t = 0.0, 1.0, 1.0, 0.0
    for i in range(oct):
        s = s + a * perlin(x * f + 13.7 * i, y * f - 7.1 * i, seed + i)
        t += a
        f *= lac
        a *= gain
    return s / t


def ridged(x, y, oct=5, seed=0):
    s, a, f, t = 0.0, 1.0, 1.0, 0.0
    prev = 1.0
    for i in range(oct):
        n = 1.0 - np.abs(perlin(x * f + 3.3 * i, y * f + 9.1 * i, seed + 40 + i))
        n = n * n
        s = s + a * n * prev
        prev = np.clip(n * 1.2, 0, 1)
        t += a
        f *= 2.0
        a *= 0.5
    return s / t


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def seg_dist(px, pz, ax, az, bx, bz):
    """Distance from points to a segment, and the parameter along it."""
    vx, vz = bx - ax, bz - az
    t = ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)
    t = np.clip(t, 0, 1)
    dx = px - (ax + t * vx)
    dz = pz - (az + t * vz)
    return np.sqrt(dx * dx + dz * dz), t


def polyline_dist(px, pz, pts):
    best = np.full(px.shape, 1e9)
    along = np.zeros(px.shape)
    total = 0.0
    lens = []
    for i in range(len(pts) - 1):
        lens.append(math.dist(pts[i], pts[i + 1]))
    acc = 0.0
    for i in range(len(pts) - 1):
        d, t = seg_dist(px, pz, *pts[i], *pts[i + 1])
        m = d < best
        best = np.where(m, d, best)
        along = np.where(m, acc + t * lens[i], along)
        acc += lens[i]
    return best, along / acc


# ----------------------------------------------------------------- shape
def circ_noise(theta, freq, seed, oct=3):
    return fbm(np.cos(theta) * freq + 7.3, np.sin(theta) * freq - 2.1, oct, seed=seed)


def ang_diff(a, b):
    return np.angle(np.exp(1j * (a - b)))


def build_height():
    cx, cz = 0.0, -40.0
    # small-scale domain warp gives coves and points along the shore
    wx = X + 26 * fbm(X / 110, Z / 110, 3, seed=2)
    wz = Z + 26 * fbm(X / 110 + 9, Z / 110, 3, seed=4)
    r = np.sqrt((wx - cx) ** 2 + (wz - cz) ** 2)
    th = np.arctan2(wz - cz, wx - cx)  # 0 east, +pi/2 south, -pi/2 north

    S_ = math.pi / 2
    R = 590 + 55 * circ_noise(th, 1.6, 1) + 22 * circ_noise(th, 5.0, 3) + 9 * circ_noise(th, 14.0, 23)
    R -= 165 * np.exp(-(ang_diff(th, S_) / 0.30) ** 2)                 # the landing bay
    R += 52 * np.exp(-(ang_diff(th, S_ + 0.47) / 0.10) ** 2)           # west headland
    R += 64 * np.exp(-(ang_diff(th, S_ - 0.50) / 0.11) ** 2)           # east headland
    R += 45 * np.exp(-(ang_diff(th, -0.08) / 0.38) ** 2)               # mangrove delta lobe
    R += 70 * np.exp(-(ang_diff(th, -1.55) / 0.55) ** 2)               # volcano's northern flank
    R -= 40 * np.exp(-(ang_diff(th, math.pi * 0.93) / 0.22) ** 2)      # a western cove
    s = R - r  # metres inland (approximate signed distance to the coast)

    south = np.exp(-(ang_diff(th, S_) / 0.42) ** 2)
    west_north = smoothstep(0.0, 0.8, np.cos(th + 2.36))
    delta = np.exp(-(ang_diff(th, -0.08) / 0.30) ** 2) * smoothstep(250, 520, r)

    # ---- beach and seafloor
    beach_w = 22 + 46 * south + 20 * delta - 14 * west_north
    beach_w = np.maximum(beach_w, 5)
    lagoon = np.exp(-(ang_diff(th, S_) / 0.55) ** 2)
    off = np.maximum(-s, 0)
    sea_slope = 0.12 + 0.25 * west_north
    sea = -0.6 - off * sea_slope
    sea_lag = -0.6 - 0.014 * off - 24 * smoothstep(150, 240, off) - 0.08 * np.maximum(off - 240, 0)
    sea = sea * (1 - lagoon) + sea_lag * lagoon
    sea += 0.7 * fbm(X / 26, Z / 26, 3, seed=5) * smoothstep(5, 40, off)
    reef = lagoon * np.exp(-((off - 160) / 22.0) ** 2) * np.clip(fbm(X / 34, Z / 34, 3, seed=6) * 1.6 + 0.35, 0, 1)
    sea += reef * 4.2
    sea = np.maximum(sea, -55)

    beach = np.clip(s / beach_w, 0, 1)
    h_beach = 2.3 * beach ** 0.85
    dune = np.exp(-((s - beach_w) / 9.0) ** 2) * (1.0 + 0.7 * fbm(X / 35, Z / 35, 2, seed=7)) * (south + 0.4)
    h_beach = h_beach + dune

    # ---- interior: rolling jungle hills, rising toward the volcano in the north
    t_in = smoothstep(0, 1, (s - beach_w) / 200.0)
    north_rise = smoothstep(260, -380, Z)
    hills = 14 + 30 * north_rise + 20 * fbm(X / 240, Z / 240, 4, seed=8) + 5 * fbm(X / 80, Z / 80, 3, seed=9)
    hills = np.maximum(hills, 5)
    # steep cliffs where the land meets the sea in the north west
    cliff = west_north * smoothstep(0, 22, s) * (18 + 20 * fbm(X / 90, Z / 90, 2, seed=19))
    h_land = h_beach + t_in * hills + cliff * (1 - t_in)

    # ---- the Heart: a breached caldera
    hx, hz = LANDMARKS["heart"]
    rr = np.sqrt((X - hx) ** 2 + (Z - hz) ** 2)
    ang = np.arctan2(Z - hz, X - hx)
    rim_r = 140 + 10 * circ_noise(ang, 2.2, 10)
    breach_dir = math.atan2(0.8, 1.0)  # ESE toward the mire
    breach = np.exp(-(ang_diff(ang, breach_dir) / 0.21) ** 2)
    rim_h = 212 + 18 * circ_noise(ang, 3.0, 11) - 80 * breach
    floor_h = 118.0
    inner = floor_h + (rim_h - floor_h) * smoothstep(rim_r - 85, rim_r, rr) ** 1.7
    outer = rim_h * np.clip(1 - (rr - rim_r) / 420.0, 0, 1) ** 1.6
    volcano = np.where(rr < rim_r, inner, outer)
    gorge_d, gorge_t = polyline_dist(X + 12 * fbm(X / 70, Z / 70, 2, seed=20), Z,
                                     [(hx + 110, hz + 88), (hx + 190, hz + 170), (290, -190), (320, -110)])
    gorge = np.exp(-(gorge_d / 30.0) ** 2) * smoothstep(0.0, 0.25, gorge_t)
    vol_mask = np.clip(1 - (rr - rim_r) / 420.0, 0, 1)
    h_land = np.maximum(h_land, volcano * smoothstep(-30, 40, s))
    h_land = h_land - gorge * 30 * vol_mask

    # ---- the black ridge: a jagged spine running SW -> crater
    ridge_pts = [(-540, 60), (-470, -60), (-390, -190), (-290, -310), (-170, -400), (-70, -440)]
    rd, rt = polyline_dist(X + 22 * fbm(X / 110, Z / 110, 3, seed=12), Z, ridge_pts)
    crest = 70 + 110 * np.sin(np.clip(rt, 0, 1) * np.pi * 0.62 + 0.25) + 25 * fbm(rt * 9, rt * 4, 3, seed=13)
    rid = ridged(X / 150, Z / 150, 5, seed=14)
    ridge_h = crest * np.exp(-(rd / (70 + 45 * rid)) ** 1.5) * (0.78 + 0.4 * rid)
    ridge_h *= smoothstep(-25, 50, s)
    h_land = np.maximum(h_land, ridge_h)

    # ---- the mire: a sunken basin draining east through mangrove creeks
    mx, mz = LANDMARKS["mireCentre"]
    mw = 1 + 0.25 * fbm(X / 150, Z / 150, 3, seed=21)
    mire = np.exp(-((((X - mx) / 210.0) ** 2 + ((Z - mz) / 250.0) ** 2) / mw) ** 1.5)
    mire = np.maximum(mire, delta * smoothstep(-40, 60, s) * 0.95)
    pond = smoothstep(0.05, 0.4, fbm(X / 48, Z / 48, 4, seed=15))
    mire_floor = 0.15 + 0.75 * fbm(X / 34, Z / 34, 3, seed=16) + 0.35 * fbm(X / 11, Z / 11, 2, seed=26) - 1.1 * pond
    creek_d, _ = polyline_dist(X + 22 * fbm(X / 50, Z / 50, 3, seed=17), Z + 10 * fbm(X / 40, Z / 40, 2, seed=27),
                               [(320, -110), (350, -50), (400, -10), (470, 10), (540, 0), (660, -10)])
    creek2_d, _ = polyline_dist(X + 16 * fbm(X / 45, Z / 45, 3, seed=18), Z,
                                [(230, 90), (300, 55), (370, 25), (430, 12)])
    creek = np.maximum(np.exp(-(creek_d / 9.0) ** 2), 0.85 * np.exp(-(creek2_d / 6.5) ** 2))
    mire_floor = mire_floor - creek * 2.4
    h_land = h_land * (1 - mire) + mire_floor * mire

    h = np.where(s > 0, h_land, np.minimum(sea, h_land))
    seam = smoothstep(-8, 3, s)
    h = sea * (1 - seam) + h * seam
    h = np.where(s < -8, sea, h)

    # sea stacks off the western cliffs
    for (sx, sz, sr, sh) in [(-655, -60, 16, 26), (-630, -10, 10, 16), (-560, -330, 14, 30), (-610, 180, 9, 12)]:
        d = np.sqrt((X - sx) ** 2 + (Z - sz) ** 2)
        k = np.exp(-(d / sr) ** 3)
        h = h * (1 - k) + np.maximum(h, sh) * k

    masks = dict(mire=mire, south=south, lagoon=lagoon, vol_mask=vol_mask, rr=rr, rim_r=rim_r,
                 ridge_d=rd, inland=s, beach_w=beach_w, gorge=gorge, creek=creek, west_north=west_north)
    return h.astype(np.float64), masks


# ----------------------------------------------------------------- erosion
@njit(cache=True)
def erode(h, n_drops, seed, protect):
    np.random.seed(seed)
    n = h.shape[0]
    radius = 3
    # brush weights
    bw = np.zeros((2 * radius + 1, 2 * radius + 1))
    s = 0.0
    for j in range(-radius, radius + 1):
        for i in range(-radius, radius + 1):
            d = math.sqrt(i * i + j * j)
            if d <= radius:
                w = 1 - d / radius
                bw[j + radius, i + radius] = w
                s += w
    bw /= s
    inertia, cap_k, min_cap, erode_k, dep_k, evap, grav, life = 0.06, 5.0, 0.01, 0.35, 0.25, 0.015, 9.0, 60
    for _ in range(n_drops):
        x = np.random.random() * (n - 3) + 1
        y = np.random.random() * (n - 3) + 1
        if h[int(y), int(x)] < 2.5:
            continue
        dx = 0.0
        dy = 0.0
        speed = 1.0
        water = 1.0
        sed = 0.0
        for _step in range(life):
            ix = int(x)
            iy = int(y)
            fx = x - ix
            fy = y - iy
            h00 = h[iy, ix]
            h10 = h[iy, ix + 1]
            h01 = h[iy + 1, ix]
            h11 = h[iy + 1, ix + 1]
            gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy
            gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx
            hh = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
            dx = dx * inertia - gx * (1 - inertia)
            dy = dy * inertia - gy * (1 - inertia)
            l = math.sqrt(dx * dx + dy * dy)
            if l < 1e-9:
                break
            dx /= l
            dy /= l
            x += dx
            y += dy
            if x < 1 or y < 1 or x >= n - 2 or y >= n - 2:
                break
            jx = int(x)
            jy = int(y)
            gfx = x - jx
            gfy = y - jy
            nh = (h[jy, jx] * (1 - gfx) * (1 - gfy) + h[jy, jx + 1] * gfx * (1 - gfy) +
                  h[jy + 1, jx] * (1 - gfx) * gfy + h[jy + 1, jx + 1] * gfx * gfy)
            dh = nh - hh
            if nh < 0.2:
                # reached the sea: drop the load as a delta
                amt = sed * 0.5
                h[iy, ix] += amt * (1 - fx) * (1 - fy)
                h[iy, ix + 1] += amt * fx * (1 - fy)
                h[iy + 1, ix] += amt * (1 - fx) * fy
                h[iy + 1, ix + 1] += amt * fx * fy
                break
            cap = max(-dh * speed * water * cap_k, min_cap)
            if sed > cap or dh > 0:
                amt = min(dh, sed) if dh > 0 else (sed - cap) * dep_k
                sed -= amt
                h[iy, ix] += amt * (1 - fx) * (1 - fy)
                h[iy, ix + 1] += amt * fx * (1 - fy)
                h[iy + 1, ix] += amt * (1 - fx) * fy
                h[iy + 1, ix + 1] += amt * fx * fy
            else:
                amt = min((cap - sed) * erode_k, -dh)
                for j in range(-radius, radius + 1):
                    for i in range(-radius, radius + 1):
                        w = bw[j + radius, i + radius]
                        if w <= 0:
                            continue
                        yy = iy + j
                        xx = ix + i
                        if xx < 0 or yy < 0 or xx >= n or yy >= n:
                            continue
                        p = protect[yy, xx]
                        e = amt * w * (1 - p)
                        if h[yy, xx] - e < 0.3:
                            e = max(h[yy, xx] - 0.3, 0.0)
                        h[yy, xx] -= e
                        sed += e
            speed = math.sqrt(max(speed * speed + dh * grav * -1, 0.0))
            water *= (1 - evap)
    return h


@njit(cache=True)
def thermal(h, iters, talus, k, protect):
    n = h.shape[0]
    for _ in range(iters):
        d = np.zeros_like(h)
        for y in range(1, n - 1):
            for x in range(1, n - 1):
                c = h[y, x]
                if c < 1.0:
                    continue
                for oy, ox in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                    diff = c - h[y + oy, x + ox]
                    if diff > talus:
                        m = (diff - talus) * k * (1 - protect[y, x])
                        d[y, x] -= m
                        d[y + oy, x + ox] += m
        h += d
    return h


def blur(a, r):
    from scipy.ndimage import gaussian_filter
    return gaussian_filter(a, r, mode="nearest")


# ----------------------------------------------------------------- derived data
def gradients(h):
    gz, gx = np.gradient(h, STEP)
    slope = np.degrees(np.arctan(np.sqrt(gx * gx + gz * gz)))
    return gx, gz, slope


def hillshade(h, az=315, alt=40):
    gx, gz, _ = gradients(h)
    azr, altr = math.radians(az), math.radians(alt)
    lx, ly, lz = math.cos(altr) * math.sin(azr), math.sin(altr), -math.cos(altr) * math.cos(azr)
    nx, ny, nz = -gx, np.ones_like(h), -gz
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.clip((nx * lx + ny * ly + nz * lz) / l, 0, 1)


def biomes(h, m):
    _, _, slope = gradients(h)
    vol = np.clip(m["vol_mask"] * smoothstep(95, 165, h) + smoothstep(120, 50, m["ridge_d"]) * smoothstep(60, 120, h), 0, 1)
    vol = vol * np.clip(0.8 + 0.6 * fbm(X / 60, Z / 60, 3, seed=31), 0, 1.2)
    vol = np.maximum(vol, smoothstep(m["rim_r"] + 40, m["rim_r"] - 10, m["rr"]))  # crater interior
    vol = blur(np.clip(vol, 0, 1), 2.5)
    mire = np.clip((m["mire"] - 0.22 + 0.35 * fbm(X / 70, Z / 70, 3, seed=32)) * 2.4, 0, 1) * smoothstep(6.5, 1.8, h)
    mire = blur(mire, 1.5)
    sandy = smoothstep(3.4, 2.2, h) * smoothstep(-3, 0.5, h) * (1 - mire)
    forest = (1 - sandy) * (1 - vol * 0.85) * smoothstep(1.8, 4.0, h) * (1 - smoothstep(38, 52, slope))
    forest *= np.clip(0.75 + 0.5 * fbm(X / 80, Z / 80, 3, seed=30), 0, 1)
    forest = np.maximum(forest, mire * 0.6)  # mangroves count as forest cover
    forest = blur(np.clip(forest, 0, 1), 1.5)
    return np.clip(forest, 0, 1), np.clip(mire, 0, 1), np.clip(vol, 0, 1), slope


def topo_map(h, forest, mire, vol, out_path, size=1024):
    hs = hillshade(h)
    land = h > 0.0
    col = np.zeros(h.shape + (3,))
    # paper and sea tones of a field survey map
    deep = np.array([0.53, 0.67, 0.73])
    shallow = np.array([0.72, 0.85, 0.84])
    t = np.clip(-h / 30, 0, 1)[..., None]
    sea_c = shallow * (1 - t) + deep * t
    paper = np.array([0.92, 0.89, 0.80])
    green = np.array([0.70, 0.79, 0.60])
    marsh = np.array([0.72, 0.76, 0.66])
    rock = np.array([0.66, 0.62, 0.58])
    lc = paper * np.ones_like(col)
    lc = lc * (1 - forest[..., None] * 0.9) + green * forest[..., None] * 0.9
    lc = lc * (1 - mire[..., None]) + marsh * mire[..., None]
    lc = lc * (1 - vol[..., None]) + rock * vol[..., None]
    shade = (0.72 + 0.4 * hs)[..., None]
    col = np.where(land[..., None], lc * shade, sea_c)
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), "RGB")
    # contour lines every 10 m, index contour every 50 m
    d = ImageDraw.Draw(img)
    hc = h.copy()
    for level in range(10, 280, 10):
        above = hc >= level
        edge = above ^ np.roll(above, 1, 0) | above ^ np.roll(above, 1, 1)
        ys, xs_ = np.nonzero(edge & land)
        c = (120, 92, 60) if level % 50 == 0 else (160, 128, 92)
        px = img.load()
        for yy, xx in zip(ys, xs_):
            px[int(xx), int(yy)] = c
    coast = (h >= 0) ^ np.roll(h >= 0, 1, 0) | (h >= 0) ^ np.roll(h >= 0, 1, 1)
    ys, xs_ = np.nonzero(coast)
    px = img.load()
    for yy, xx in zip(ys, xs_):
        px[int(xx), int(yy)] = (52, 84, 98)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(out_path, quality=86, method=6)


def main():
    preview = "--preview" in sys.argv
    print("shape...")
    h, m = build_height()
    protect = np.clip(1 - smoothstep(4, 14, h), 0, 1)  # keep beaches/mire flat
    protect = np.maximum(protect, m["mire"] * 0.9)
    print("erosion...")
    h = erode(h, 420000, 7, protect)
    h = thermal(h, 12, 1.25 * STEP, 0.25, protect)
    # place the LZ on the beach: walk north from the sea along x = 0
    zz = 700.0
    while sample(h, 0.0, zz) < 1.0 and zz > 0:
        zz -= 1.0
    LANDMARKS["lz"] = (0.0, zz - 14.0)
    print("LZ at", LANDMARKS["lz"])
    # re-flatten the LZ pad and settle the crater floor
    lx, lz = LANDMARKS["lz"]
    pad = np.exp(-(((X - lx) / 34.0) ** 2 + ((Z - lz) / 26.0) ** 2) ** 2)
    h = h * (1 - pad) + pad * 2.05
    hx, hz = LANDMARKS["heart"]
    core = np.exp(-(((X - hx) ** 2 + (Z - hz) ** 2) / (70.0 ** 2)) ** 2)
    h = h * (1 - core * 0.85) + core * 0.85 * 119.0
    h = np.clip(h, HMIN + 1, HMAX - 1)

    forest, mire, vol, slope = biomes(h, m)

    # ---- write runtime data
    q = np.round((h - HMIN) / (HMAX - HMIN) * 65535).astype("<u2")
    with gzip.open(os.path.join(OUT, "height.bin.gz"), "wb", compresslevel=9) as f:
        f.write(q.tobytes())
    bio = np.stack([forest, mire, vol], -1)
    bimg = Image.fromarray((bio * 255).astype(np.uint8), "RGB").resize((512, 512), Image.LANCZOS)
    bimg.save(os.path.join(OUT, "biome.png"), optimize=True)
    topo_map(h, forest, mire, vol, os.path.join(OUT, "map.webp"))
    meta = {
        "n": N, "size": SIZE, "hmin": HMIN, "hmax": HMAX,
        "landmarks": {k: [v[0], float(sample(h, *v)), v[1]] for k, v in LANDMARKS.items()},
    }
    with open(os.path.join(OUT, "terrain.json"), "w") as f:
        json.dump(meta, f, indent=1)
    np.save(os.path.join(HERE, ".terrain_cache.npy"), h)
    print("height range", h.min(), h.max(), "land fraction", (h > 0).mean())

    # quick look image (hillshade + biome tint)
    hs = hillshade(h)
    col = np.zeros(h.shape + (3,))
    col[...] = np.array([0.85, 0.80, 0.62])
    col = col * (1 - forest[..., None]) + np.array([0.22, 0.42, 0.18]) * forest[..., None]
    col = col * (1 - mire[..., None]) + np.array([0.35, 0.38, 0.22]) * mire[..., None]
    col = col * (1 - vol[..., None]) + np.array([0.22, 0.2, 0.2]) * vol[..., None]
    col *= (0.35 + 0.8 * hs)[..., None]
    t = np.clip(-h / 30, 0, 1)[..., None]
    water = np.array([0.35, 0.75, 0.78]) * (1 - t) + np.array([0.05, 0.2, 0.4]) * t
    col = np.where((h < 0)[..., None], water, col)
    Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(os.path.join(HERE, ".terrain_preview.png"))

    if preview:
        render_preview(h)


def sample(h, x, z):
    fx = (x + HALF) / STEP
    fz = (z + HALF) / STEP
    ix, iz = int(fx), int(fz)
    tx, tz = fx - ix, fz - iz
    return (h[iz, ix] * (1 - tx) * (1 - tz) + h[iz, ix + 1] * tx * (1 - tz) +
            h[iz + 1, ix] * (1 - tx) * tz + h[iz + 1, ix + 1] * tx * tz)


def render_preview(h):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    step = 4
    hs = h[::step, ::step]
    n = hs.shape[0]
    verts = []
    for j in range(n):
        for i in range(n):
            verts.append((-HALF + i * STEP * step, HALF - j * STEP * step, max(hs[j, i], -8)))
    faces = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i) for j in range(n - 1) for i in range(n - 1)]
    me = bpy.data.meshes.new("island")
    me.from_pydata(verts, [], faces)
    ob = bpy.data.objects.new("island", me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    uv = me.uv_layers.new(name="uv")
    for loop in me.loops:
        v = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((v.x + HALF) / SIZE, (v.y + HALF) / SIZE)
    mat = bpy.data.materials.new("island")
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(HERE, ".terrain_preview.png"))
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    me.materials.append(mat)
    sea = bpy.data.meshes.new("sea")
    sea.from_pydata([(-3000, -3000, 0), (3000, -3000, 0), (3000, 3000, 0), (-3000, 3000, 0)], [], [(0, 1, 2, 3)])
    so = bpy.data.objects.new("sea", sea)
    bpy.context.scene.collection.objects.link(so)
    sm = bpy.data.materials.new("sea")
    b = sm.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.02, 0.12, 0.2, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Transmission Weight"].default_value = 0.85
    sea.materials.append(sm)
    world = bpy.data.worlds.new("w")
    bpy.context.scene.world = world
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.45, 0.62, 0.85, 1)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 32
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.location = (250, -1250, 520)
    cam.rotation_euler = (math.radians(66), 0, math.radians(12))
    cam.data.clip_end = 10000
    cam.data.lens = 32
    sc.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    sc.collection.objects.link(sun)
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    sc.render.filepath = os.path.join(HERE, ".terrain_render.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

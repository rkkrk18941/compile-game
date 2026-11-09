"""Plant building blocks: tubes along curves, folded ribbons for fronds and leaf cards,
leaf textures baked from modelled leaves, procedural bark, LODs and wind vertex colours.

Vertex colour "Col" carries wind data for the game shader:
  R = leaf flutter weight, G = branch sway weight (0 at the base), B = phase offset
"""
import math
import os

import bpy
import numpy as np

from lib import (ASSETS, MeshBuilder, bake, fft_noise, image_to_np, linear_to_srgb, mesh_object, new_image,
                 save_webp, worley, select_only)


# ----------------------------------------------------------------------------- geometry
def frames_along(points):
    """Parallel-transport frames (tangent, normal, binormal) along a polyline."""
    P = np.asarray(points, dtype=np.float64)
    n = len(P)
    T = np.zeros_like(P)
    T[1:-1] = P[2:] - P[:-2]
    T[0] = P[1] - P[0]
    T[-1] = P[-1] - P[-2]
    T /= np.linalg.norm(T, axis=1)[:, None] + 1e-12
    up = np.array([0.0, 0.0, 1.0]) if abs(T[0][2]) < 0.95 else np.array([1.0, 0.0, 0.0])
    N = np.zeros_like(P)
    N[0] = np.cross(T[0], up)
    N[0] /= np.linalg.norm(N[0])
    for i in range(1, n):
        v = N[i - 1] - T[i] * np.dot(N[i - 1], T[i])
        l = np.linalg.norm(v)
        N[i] = v / l if l > 1e-9 else N[i - 1]
    B = np.cross(T, N)
    return T, N, B


def tube(points, radii, sides=8, uv_v_scale=1.0, uv_u_repeat=1.0, color_fn=None, cap=False, noise=None):
    """Mesh data for a tube along points. Returns verts, tris, uvs, colors.
    UV: u around the circumference (0..uv_u_repeat), v = arc length * uv_v_scale."""
    P = np.asarray(points, dtype=np.float64)
    R = np.asarray(radii, dtype=np.float64)
    T, N, B = frames_along(P)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    verts, uvs, cols = [], [], []
    for i in range(len(P)):
        for s in range(sides + 1):
            a = s / sides * 2 * math.pi
            r = R[i]
            if noise is not None:
                r *= 1 + noise(i, s)
            d = N[i] * math.cos(a) + B[i] * math.sin(a)
            verts.append(P[i] + d * r)
            uvs.append((s / sides * uv_u_repeat, seg[i] * uv_v_scale))
            cols.append(color_fn(i / (len(P) - 1), s / sides) if color_fn else (0, 0, 0, 1))
    tris = []
    w = sides + 1
    for i in range(len(P) - 1):
        for s in range(sides):
            a = i * w + s
            tris += [(a, a + 1, a + w), (a + 1, a + w + 1, a + w)]
    if cap:
        c = len(verts)
        verts.append(P[-1])
        uvs.append((0.5, seg[-1] * uv_v_scale))
        cols.append(cols[-1])
        base = (len(P) - 1) * w
        for s in range(sides):
            tris.append((base + s, base + s + 1, c))
    return np.array(verts), np.array(tris), np.array(uvs), np.array(cols, dtype=np.float32)


def ribbon(points, widths, ups, fold=0.0, segs_across=2, u_range=(0, 1), v_range=(0, 1), color_fn=None, twist=None):
    """A strip along points; widths per point, 'ups' = vector the strip faces (normal).
    fold > 0 lifts both edges (V shape) by fold * half width. UV: u across, v along."""
    P = np.asarray(points, dtype=np.float64)
    n = len(P)
    T, _, _ = frames_along(P)
    verts, uvs, cols = [], [], []
    for i in range(n):
        up = np.asarray(ups[i], dtype=np.float64)
        side = np.cross(T[i], up)
        side /= np.linalg.norm(side) + 1e-12
        nrm = np.cross(side, T[i])
        if twist is not None:
            a = twist[i]
            side, nrm = side * math.cos(a) + nrm * math.sin(a), nrm * math.cos(a) - side * math.sin(a)
        for j in range(-segs_across, segs_across + 1):
            k = j / segs_across
            off = side * k * widths[i] / 2 + nrm * abs(k) * fold * widths[i] / 2
            verts.append(P[i] + off)
            uvs.append((u_range[0] + (k * 0.5 + 0.5) * (u_range[1] - u_range[0]), v_range[0] + i / (n - 1) * (v_range[1] - v_range[0])))
            cols.append(color_fn(i / (n - 1), k) if color_fn else (0, 0, 0, 1))
    tris = []
    w = 2 * segs_across + 1
    for i in range(n - 1):
        for j in range(w - 1):
            a = i * w + j
            tris += [(a, a + 1, a + w), (a + 1, a + w + 1, a + w)]
    return np.array(verts), np.array(tris), np.array(uvs), np.array(cols, dtype=np.float32)


class Part:
    """Geometry for one material slot of a plant LOD."""

    def __init__(self):
        self.mb = MeshBuilder()

    def add(self, data):
        v, f, uv, c = data
        self.mb.add(v, f, c, uv)


def build_plant(name, parts, materials, coll=None):
    """parts: dict slot -> Part, materials: dict slot -> bpy material. Returns one object
    with a material per slot."""
    objs = []
    for slot, part in parts.items():
        ob = part.mb.build(f"{name}_{slot}", materials[slot], coll=coll)
        if ob:
            objs.append(ob)
    if len(objs) > 1:
        from lib import join
        ob = join(objs, name)
    else:
        ob = objs[0]
        ob.name = name
    return ob


# ----------------------------------------------------------------------------- textures
def normal_from_height(h, strength=1.0):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1)[..., None]
    return n * 0.5 + 0.5


def cavity(h, r=2):
    acc = np.zeros_like(h)
    k = 0
    for oy in range(-r, r + 1, max(r // 2, 1)):
        for ox in range(-r, r + 1, max(r // 2, 1)):
            acc += np.roll(np.roll(h, oy, 0), ox, 1)
            k += 1
    return acc / k - h


def save_bark(name, alb_lin, h, strength):
    d = os.path.join(ASSETS, "plants")
    cav = cavity(h, 3)
    ao = np.clip(1 - cav * 4.0, 0.35, 1)
    alb = alb_lin * ao[..., None]
    save_webp(linear_to_srgb(alb), os.path.join(d, f"{name}_albedo.webp"), quality=88)
    save_webp(normal_from_height(h, strength), os.path.join(d, f"{name}_normal.webp"), quality=90)


def bark_texture(kind, n=512, seed=1):
    """Tileable bark; u = around the trunk, v = along it. Returns (albedo_linear, height)."""
    rg = np.random.default_rng(seed)
    us = np.arange(n) / n
    U, V = np.meshgrid(us, us)
    if kind == "palm":
        # leaf scar rings every ~8 cm on a 1 m tile, cross-grain cracks
        warp = fft_noise(n, 3.0, seed) * 0.012
        ph = (V + warp) * 12
        ring = np.abs(np.sin(np.pi * ph)) ** 0.35
        fib = fft_noise(n, 1.4, seed + 1)
        vert = np.abs(np.sin(np.pi * (U * 34 + fft_noise(n, 2.8, seed + 2) * 1.5))) ** 6
        h = 0.55 * ring + 0.12 * fib - 0.18 * vert * ring + 0.1 * fft_noise(n, 2.6, seed + 3)
        base = np.array([0.11, 0.095, 0.08])
        grey = np.array([0.24, 0.225, 0.20])
        w = np.clip(0.5 + fft_noise(n, 2.4, seed + 4) * 1.2, 0, 1)[..., None]
        alb = base * (1 - w) + grey * w
        alb *= (0.65 + 0.35 * ring)[..., None]
        alb *= (0.9 + 0.2 * fib)[..., None]
        return alb, h
    if kind == "smooth":
        f1, f2, cid = worley(n, 40, seed)
        flake = np.clip((f2 - f1) * 20, 0, 1)
        h = 0.25 * fft_noise(n, 2.6, seed) + 0.2 * flake + 0.06 * fft_noise(n, 1.0, seed + 1)
        lent = (fft_noise(n, 0.6, seed + 2) > 0.82).astype(float) * np.abs(np.sin(np.pi * V * 3)) * 0.0
        alb = np.array([0.14, 0.13, 0.115]) * (0.85 + 0.3 * fft_noise(n, 2.2, seed + 3))[..., None]
        lic = np.clip(fft_noise(n, 2.0, seed + 4) * 3 - 1.5, 0, 1)[..., None]
        alb = alb * (1 - lic * 0.7) + np.array([0.30, 0.31, 0.27]) * lic * 0.7
        lic2 = np.clip(fft_noise(n, 2.2, seed + 5) * 3 - 1.8, 0, 1)[..., None]
        alb = alb * (1 - lic2) + np.array([0.20, 0.30, 0.12]) * lic2
        alb *= (0.8 + 0.2 * flake)[..., None]
        return alb, h - lent
    if kind == "rough":
        f1, f2, _ = worley(n, 70, seed)
        # stretch cells vertically by sampling with scaled coordinates
        idx_v = (np.arange(n) * 1) % n
        ridges = np.clip((f2 - f1) * 10, 0, 1)
        ridges = np.roll(ridges, 0, 0)
        fur = np.abs(np.sin(np.pi * (U * 9 + fft_noise(n, 3.0, seed + 1) * 1.2))) ** 0.6
        h = 0.5 * fur + 0.25 * ridges + 0.15 * fft_noise(n, 1.6, seed + 2)
        alb = np.array([0.17, 0.13, 0.10]) * (0.6 + 0.6 * fur)[..., None] * (0.85 + 0.3 * fft_noise(n, 2.0, seed + 3))[..., None]
        moss = np.clip(fft_noise(n, 2.4, seed + 4) * 2.5 - 1.0, 0, 1)[..., None] * (1 - fur[..., None] * 0.5)
        alb = alb * (1 - moss * 0.8) + np.array([0.10, 0.16, 0.04]) * moss * 0.8
        return alb, h
    if kind == "fern":
        fib = np.abs(np.sin(np.pi * (U * 60 + fft_noise(n, 2.4, seed) * 6))) ** 2
        scars = np.clip(1 - worley(n, 26, seed + 1)[0] * 9, 0, 1)
        h = 0.35 * fib + 0.45 * (1 - scars) + 0.15 * fft_noise(n, 1.2, seed + 2)
        alb = np.array([0.08, 0.055, 0.035]) * (0.7 + 0.6 * fib)[..., None]
        alb = alb * (1 - scars[..., None] * 0.5) + np.array([0.16, 0.12, 0.08]) * scars[..., None] * 0.5
        return alb, h
    if kind == "mangrove":
        lent = np.clip(fft_noise(n, 0.3, seed) * 3 - 2.2, 0, 1)
        h = 0.3 * fft_noise(n, 2.6, seed + 1) + 0.2 * np.abs(np.sin(np.pi * (U * 7 + fft_noise(n, 3, seed + 2)))) + 0.2 * lent
        alb = np.array([0.11, 0.085, 0.07]) * (0.8 + 0.3 * fft_noise(n, 2.0, seed + 3))[..., None]
        alb = alb * (1 - lent[..., None] * 0.4) + np.array([0.45, 0.40, 0.33]) * lent[..., None] * 0.4
        return alb, h
    if kind == "drift":
        grain = np.abs(np.sin(np.pi * (U * 40 + fft_noise(n, 2.8, seed) * 4))) ** 1.5
        cracks = np.clip(1 - np.abs(np.sin(np.pi * (U * 6 + fft_noise(n, 3.0, seed + 1) * 2))) * 30, 0, 1)
        h = 0.4 * grain - 0.6 * cracks + 0.1 * fft_noise(n, 1.4, seed + 2)
        alb = np.array([0.52, 0.50, 0.46]) * (0.85 + 0.2 * grain)[..., None] * (1 - cracks[..., None] * 0.7)
        return alb, h
    if kind == "pandanus":
        warp = fft_noise(n, 3.0, seed) * 0.02
        ring = np.abs(np.sin(np.pi * (V + warp) * 20)) ** 0.5
        h = 0.5 * ring + 0.2 * fft_noise(n, 1.6, seed + 1)
        alb = np.array([0.30, 0.26, 0.20]) * (0.7 + 0.3 * ring)[..., None] * (0.85 + 0.3 * fft_noise(n, 2.2, seed + 2))[..., None]
        return alb, h
    raise ValueError(kind)


# ----------------------------------------------------------------------------- leaf cards baked from geometry
def bake_card(name, builders, W, H, res=(512, 1024), margin_fill=24):
    """builders: MeshBuilder per material colour set, geometry within x in [0,W], y in [0,H],
    z <= 0. Bakes albedo (with alpha) and tangent normal onto a W x H card."""
    from lib import reset
    sc = reset()
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.light_settings.distance = 0.02
    highs = []
    for key, mb in builders.items():
        m = bpy.data.materials.new("m_" + key)
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        a = nt.nodes.new("ShaderNodeAttribute")
        a.attribute_name = "Col"
        nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
        ob = mb.build(key, m)
        if ob:
            highs.append(ob)
    zmax = max(max(v[2] for v in o.bound_box) for o in highs)
    for o in highs:
        o.location.z -= zmax + 0.002
    bpy.context.view_layer.update()
    low = mesh_object("low", [(0, 0, 0), (W, 0, 0), (W, H, 0), (0, H, 0)], [(0, 1, 2, 3)], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    low.data.materials.append(bpy.data.materials.new("lowmat"))
    rx, ry = res
    out = {}
    for kind, s in (("DIFFUSE", 4), ("NORMAL", 4), ("AO", 16)):
        img = new_image(f"{name}_{kind}", 0, data=True, w=rx, h=ry)
        bake(low, highs, img, kind, samples=s, extrusion=0.002, max_dist=0.5, margin=0)
        out[kind] = image_to_np(img)
    # alpha: emission white on all leaf geometry
    em = bpy.data.materials.new("alpha")
    nt = em.node_tree
    for nd in list(nt.nodes):
        if nd.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(nd)
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (1, 1, 1, 1)
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    for o in highs:
        o.data.materials.clear()
        o.data.materials.append(em)
    img = new_image(f"{name}_A", 0, data=True, w=rx, h=ry)
    bake(low, highs, img, "EMIT", samples=8, extrusion=0.002, max_dist=0.5, margin=0)
    A = np.clip(image_to_np(img)[..., 0], 0, 1)
    alb = out["DIFFUSE"][..., :3] * (0.55 + 0.45 * out["AO"][..., :1])
    nrm = out["NORMAL"][..., :3]
    # bleed colours into transparent texels so mip levels have no dark fringes
    alb = dilate(alb, A, margin_fill)
    nrm = dilate(nrm, A, margin_fill, default=(0.5, 0.5, 1.0))
    d = os.path.join(ASSETS, "plants")
    rgba = np.concatenate([linear_to_srgb(alb), A[..., None]], -1)
    save_webp(rgba, os.path.join(d, f"{name}_albedo.webp"), quality=90)
    save_webp(nrm, os.path.join(d, f"{name}_normal.webp"), quality=88)
    return alb, A


def dilate(img, alpha, iters, default=None):
    out = img.copy()
    mask = alpha > 0.5
    if not mask.any():
        return out
    acc_mask = mask.copy()
    for _ in range(iters):
        s = np.zeros_like(out)
        c = np.zeros(mask.shape)
        for oy, ox in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            m = np.roll(np.roll(acc_mask, oy, 0), ox, 1)
            s += np.roll(np.roll(out, oy, 0), ox, 1) * m[..., None]
            c += m
        grow = (~acc_mask) & (c > 0)
        out[grow] = s[grow] / c[grow][:, None]
        acc_mask = acc_mask | grow
    rest = ~acc_mask
    if rest.any():
        fill = out[acc_mask].mean(0) if default is None else np.array(default)
        out[rest] = fill
    return out


def leaf_geom(length, width, rg, shape="ellipse", segs=10, side=3, curl=0.0, vein_depth=0.0015, tip=1.0):
    """A flat-ish leaf in the XY plane pointing along +Y from the origin."""
    verts, tris = [], []
    rows = []
    for i in range(segs + 1):
        t = i / segs
        if shape == "lance":
            w = width * (np.sin(np.pi * t ** 0.85) ** 0.9)
        elif shape == "heart":
            w = width * (np.sin(np.pi * (0.15 + 0.85 * t)) ** 0.7) * (1.0 + 0.25 * (1 - t) ** 3)
        elif shape == "round":
            w = width * np.sin(np.pi * min(1.0, t * 1.02)) ** 0.45
        elif shape == "obovate":
            w = width * np.sin(np.pi * t ** 0.65) ** 0.8
        else:
            w = width * np.sin(np.pi * t) ** 0.8
        row = []
        for j in range(-side, side + 1):
            k = j / side
            x = k * w / 2
            y = t * length
            z = -abs(k) * vein_depth * 0 + curl * k * k * w * 0.2
            # veins: shallow grooves along secondary veins
            row.append(len(verts))
            verts.append((x, y, z))
        rows.append(row)
    for i in range(segs):
        for j in range(2 * side):
            a, b, c, d = rows[i][j], rows[i][j + 1], rows[i + 1][j], rows[i + 1][j + 1]
            tris += [(a, b, c), (b, d, c)]
    return np.array(verts), np.array(tris)


def leaf_colors(verts, base, edge, rg, length, width, midrib=(0.9, 1.05, 0.8), vein_k=0.0):
    """Per-vertex leaf colour: base towards the midrib, edge colour at the margin."""
    v = np.asarray(verts)
    k = np.clip(np.abs(v[:, 0]) / (width / 2 + 1e-6), 0, 1)
    t = np.clip(v[:, 1] / length, 0, 1)
    c = base[None, :] * (1 - k[:, None] * 0.5) + edge[None, :] * (k[:, None] * 0.5)
    c *= (0.92 + 0.12 * t)[:, None]
    mid = np.exp(-(v[:, 0] / (width * 0.025 + 1e-6)) ** 2)
    c = c * (1 - mid[:, None] * 0.6) + np.array(midrib)[None, :] * base[None, :] * mid[:, None] * 0.6 * 1.6
    return np.concatenate([c, np.ones((len(c), 1))], 1).astype(np.float32)


def preview_render(objs, path, cam_loc, target, lens=35, res=(640, 640), sun_rot=(50, 0, 35), env=0.6, samples=48):
    """Quick Cycles render for checking a model."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y = res
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.7, 0.9, 1)
    bg.inputs["Strength"].default_value = env
    cam = bpy.data.objects.new("pcam", bpy.data.cameras.new("pcam"))
    sc.collection.objects.link(cam)
    cam.location = cam_loc
    d = np.array(target) - np.array(cam_loc)
    from mathutils import Vector
    cam.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.clip_end = 1000
    sc.camera = cam
    sun = bpy.data.objects.new("psun", bpy.data.lights.new("psun", "SUN"))
    sun.data.energy = 4.5
    sun.data.angle = 0.03
    sun.rotation_euler = tuple(math.radians(a) for a in sun_rot)
    sc.collection.objects.link(sun)
    gm = bpy.data.meshes.new("pground")
    gm.from_pydata([(-50, -50, 0), (50, -50, 0), (50, 50, 0), (-50, 50, 0)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new("pground", gm)
    sc.collection.objects.link(g)
    gmat = bpy.data.materials.new("pg")
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.45, 0.35, 1)
    gm.materials.append(gmat)
    sc.view_settings.view_transform = "AgX"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun, g):
        bpy.data.objects.remove(o)

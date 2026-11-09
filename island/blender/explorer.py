"""The explorer (調査員): modelled, rigged and animated in Blender.

Body from a skin-modifier skeleton graph (subdivided), a sculpted head, field shirt with
rolled collar and pockets, utility vest, belt with pouches, cargo trousers, leather boots,
bush hat, gloves, a backpack carrying relay-antenna masts, a chest radio and the survey
scanner. Armature with automatic weights for the body and rigid weights for gear.
Animations: idle, walk, run, crouch, scan, kneel, radio, hurt, down, climb-aboard.

  python island/blender/explorer.py [--preview]
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import (ASSETS, BUILD, export_glb, fft_noise, image_to_np, linear_to_srgb, new_image, reset, save_webp,
                 select_only)
from plantlib import normal_from_height, tube

OUT = os.path.join(ASSETS, "chars")
os.makedirs(OUT, exist_ok=True)

# ----------------------------------------------------------------------------- skeleton graph
# (name, x, y, z, rx, ry) - character faces -Y, left = +X
NODES = [
    ("pelvis", 0, 0.0, 0.97, 0.150, 0.115),
    ("waist", 0, 0.0, 1.10, 0.140, 0.105),
    ("belly", 0, -0.005, 1.20, 0.148, 0.110),
    ("chest", 0, -0.01, 1.32, 0.178, 0.125),
    ("upperchest", 0, 0.0, 1.42, 0.185, 0.115),
    ("neckbase", 0, 0.01, 1.50, 0.075, 0.072),
    ("neck", 0, 0.012, 1.58, 0.06, 0.062),
    ("headbase", 0, 0.005, 1.64, 0.055, 0.06),
]
LIMBS = {
    # side-symmetric chains for the left side (+X); mirrored for the right
    "arm": [("shoulder", 0.185, 0.01, 1.445, 0.068, 0.064), ("deltoid", 0.225, 0.012, 1.40, 0.064, 0.06),
            ("elbow", 0.335, 0.03, 1.18, 0.05, 0.05), ("forearm", 0.385, 0.015, 1.08, 0.047, 0.043),
            ("wrist", 0.44, 0.0, 0.96, 0.033, 0.028), ("palm", 0.47, -0.005, 0.90, 0.038, 0.022),
            ("knuckle", 0.495, -0.01, 0.84, 0.036, 0.018), ("fingertip", 0.51, -0.015, 0.78, 0.03, 0.014)],
    "thumb": [("thumbbase", 0.455, -0.02, 0.925, 0.016, 0.016), ("thumbmid", 0.47, -0.05, 0.885, 0.013, 0.013),
              ("thumbtip", 0.475, -0.065, 0.86, 0.011, 0.011)],
    "leg": [("hip", 0.095, 0.0, 0.93, 0.095, 0.095), ("thigh", 0.105, -0.005, 0.75, 0.085, 0.085),
            ("knee", 0.11, -0.015, 0.52, 0.066, 0.068), ("calf", 0.112, 0.01, 0.36, 0.066, 0.068),
            ("ankle", 0.115, 0.01, 0.12, 0.055, 0.058)],
}


def build_body():
    verts, radii, names = [], [], []
    for n, x, y, z, rx, ry in NODES:
        names.append(n)
        verts.append((x, y, z))
        radii.append((rx, ry))
    edges = [(i, i + 1) for i in range(len(NODES) - 1)]
    idx = {n: i for i, n in enumerate(names)}
    for side, sx in (("L", 1), ("R", -1)):
        prev = idx["upperchest"]
        for n, x, y, z, rx, ry in LIMBS["arm"]:
            verts.append((x * sx, y, z))
            radii.append((rx, ry))
            names.append(f"{n}.{side}")
            edges.append((prev, len(verts) - 1))
            prev = len(verts) - 1
        prev = names.index(f"palm.{side}")
        for n, x, y, z, rx, ry in LIMBS["thumb"]:
            verts.append((x * sx, y, z))
            radii.append((rx, ry))
            names.append(f"{n}.{side}")
            edges.append((prev, len(verts) - 1))
            prev = len(verts) - 1
        prev = idx["pelvis"]
        for n, x, y, z, rx, ry in LIMBS["leg"]:
            verts.append((x * sx, y, z))
            radii.append((rx, ry))
            names.append(f"{n}.{side}")
            edges.append((prev, len(verts) - 1))
            prev = len(verts) - 1
    me = bpy.data.meshes.new("body_graph")
    me.from_pydata(verts, edges, [])
    ob = bpy.data.objects.new("body", me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new("skin", "SKIN")
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.6
    for i, sv in enumerate(me.skin_vertices[0].data):
        sv.radius = radii[i]
        if names[i] == "pelvis":
            sv.use_root = True
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    from lib import apply_modifiers
    apply_modifiers(ob)
    # shape refinements: flatten the chest/back a little, glute and calf shapes
    me = ob.data
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    torso = (np.abs(x) < 0.2) & (z > 0.92) & (z < 1.5)
    co[torso, 1] *= 0.92
    glute = (np.abs(x) < 0.17) & (z > 0.82) & (z < 1.0) & (y > 0)
    co[glute, 1] += 0.018 * np.sin(np.clip((z[glute] - 0.82) / 0.18, 0, 1) * np.pi)
    calf = (np.abs(x) > 0.05) & (z > 0.2) & (z < 0.5) & (y > 0.01)
    co[calf, 1] += 0.012 * np.sin(np.clip((z[calf] - 0.2) / 0.3, 0, 1) * np.pi)
    # fabric bunching: horizontal folds around the joints, pushed along the normal
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    nrm = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", nrm)
    nrm = nrm.reshape(-1, 3)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    rgf = np.random.default_rng(3)
    ph = rgf.uniform(0, 6.28, 8)
    fold = np.zeros(len(co))
    # trousers: knees, ankles (stacked above the boots), crotch
    leg = (ax > 0.03) & (ax < 0.25) & (z < 0.95)
    for zc, wdt, amp, fq in ((0.52, 0.09, 0.006, 70), (0.2, 0.08, 0.008, 80), (0.86, 0.07, 0.004, 60)):
        w = np.exp(-((z - zc) / wdt) ** 2) * leg
        fold += amp * w * np.sin(z * fq + np.arctan2(y, x - np.sign(x) * 0.11) * 2 + ph[0])
    # sleeves: elbows and the upper arm
    arm = (ax > 0.22) & (z > 0.95) & (z < 1.45)
    da = np.hypot(x - np.sign(x) * 0.335, z - 1.18)
    fold += 0.005 * np.exp(-(da / 0.06) ** 2) * arm * np.sin(da * 140 + ph[1])
    # shirt bloused over the belt
    tor = (ax < 0.2) & (z > 1.0) & (z < 1.12)
    fold += 0.006 * tor * np.sin(np.arctan2(y, x) * 9 + ph[2]) * np.exp(-((z - 1.05) / 0.04) ** 2)
    co += nrm * fold[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    return ob


# ----------------------------------------------------------------------------- head
def build_head():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=28, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # base proportions (width, depth, height)
        nx, ny, nz = x * 0.078, y * 0.098, z * 0.112
        # narrow jaw and chin below the cheekbones
        if z < 0:
            k = -z
            nx *= 1 - 0.28 * k ** 1.4
            ny *= 1 - 0.12 * k
        # flatter back of the head, fuller cranium
        if y > 0:
            ny *= 0.96
        front = max(-y, 0)
        # nose
        d_nose = math.hypot(x / 0.13, (z + 0.06) / 0.3)
        if front > 0.6 and d_nose < 1:
            ny -= 0.016 * (1 - d_nose) ** 1.3 * front
        # jaw angle
        if -0.75 < z < -0.25 and abs(x) > 0.5:
            nx *= 1.04
        # brow ridge
        if front > 0.5 and 0.18 < z < 0.38:
            ny -= 0.006 * (1 - abs(z - 0.28) / 0.1) * front
        # eye sockets
        for ex in (-0.36, 0.36):
            de = math.hypot((x - ex) / 0.17, (z - 0.12) / 0.11)
            if front > 0.4 and de < 1:
                ny += 0.008 * (1 - de) ** 2
        # cheekbones
        for cxp in (-0.55, 0.55):
            dc = math.hypot((x - cxp) / 0.25, (z + 0.02) / 0.18)
            if front > 0.2 and dc < 1:
                nx += 0.004 * (1 - dc) * math.copysign(1, x)
        # lips
        dl = math.hypot(x / 0.28, (z + 0.42) / 0.07)
        if front > 0.7 and dl < 1:
            ny -= 0.005 * (1 - dl)
        # chin
        dch = math.hypot(x / 0.25, (z + 0.72) / 0.14)
        if front > 0.5 and dch < 1:
            ny -= 0.007 * (1 - dch)
        v.co = Vector((nx, ny, nz))
    ob = bm_obj(bm, "head")
    ob.location = (0, -0.005, 1.695)
    # ears
    for sx in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=1.0)
        for v in bm.verts:
            # C-shaped ear: a flattened shell, thicker at the rim
            v.co = Vector((v.co.x * 0.01, v.co.y * 0.019, v.co.z * 0.03))
        e = bm_obj(bm, f"ear{sx}")
        e.location = (sx * 0.081, 0.012, 1.698)
        e.rotation_euler = (0, math.radians(8 * sx), math.radians(-18 * sx))
    # brows
    for sx in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * 0.026, v.co.y * 0.006, v.co.z * 0.006))
        b = bm_obj(bm, f"eyebrow{sx}")
        b.location = (sx * 0.03, -0.091, 1.728)
        b.rotation_euler = (0, math.radians(-8 * sx), math.radians(6 * sx))
    # eyes
    for sx in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.0115)
        e = bm_obj(bm, f"eye{sx}")
        e.location = (sx * 0.029, -0.083, 1.708)
    # short hair (mostly under the hat): a cap shell over the back and sides
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    rem = [v for v in bm.verts if (v.co.z < -0.35 and v.co.y < 0.2) or (v.co.z < -0.6) or (v.co.y < -0.35 and v.co.z < 0.75)]
    bmesh.ops.delete(bm, geom=rem, context="VERTS")
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.083, v.co.y * 0.102, v.co.z * 0.118))
    h = bm_obj(bm, "hair")
    h.location = (0, 0.0, 1.70)
    return ob


def bm_obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(name, size, loc, rot=(0, 0, 0), bevel=0.01, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segs, affect="EDGES", profile=0.5)
    ob = bm_obj(bm, name)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def cylinder(name, r, h, loc, rot=(0, 0, 0), seg=16, r2=None, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = bm_obj(bm, name)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


# ----------------------------------------------------------------------------- gear
def ray_to_surface(ob, origin, direction):
    """World-space hit on ob (BVH) for placing pockets on curved surfaces."""
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    hit = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
    return hit[0], hit[1]


def vest_from_body(body):
    """Utility vest = torso faces of the body pushed out, plus pockets that sit on it."""
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    keep = [f for f in bm.faces if 1.0 < f.calc_center_median().z < 1.47 and abs(f.calc_center_median().x) < 0.19]
    rem = [f for f in bm.faces if f not in set(keep)]
    bmesh.ops.delete(bm, geom=rem, context="FACES")
    for v in bm.verts:
        v.co += v.normal * 0.011
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.004)
    vest = bm_obj(bm, "vestshell")
    out = [("vest", vest)]
    bpy.context.view_layer.update()
    for sx in (1, -1):
        for (px, pz, sz) in ((0.075, 1.33, (0.075, 0.022, 0.085)), (0.085, 1.13, (0.085, 0.025, 0.08))):
            loc, nrm = ray_to_surface(vest, (sx * px, -0.5, pz), (0, 1, 0))
            if loc is None:
                continue
            rot = Vector((0, -1, 0)).rotation_difference(nrm).to_euler()
            out.append(("vest", box("pocketvest", sz, loc + nrm * sz[1] * 0.4, rot=rot, bevel=0.009)))
        # cargo pocket on the outside of each thigh
        loc, nrm = ray_to_surface(body, (sx * 0.5, -0.01, 0.68), (-sx, 0, 0))
        if loc is not None:
            rot = Vector((sx, 0, 0)).rotation_difference(nrm).to_euler()
            c = box("cargo", (0.028, 0.13, 0.16), loc + nrm * 0.01, rot=rot, bevel=0.013)
            out.append(("pants", c))
    return out


def build_gear():
    parts = []
    # collar
    c = cylinder("collar", 0.072, 0.045, (0, 0.006, 1.535), r2=0.064, seg=24, cap=False)
    parts.append(("shirt", c))
    # belt + buckle + pouches
    b = cylinder("belt", 0.152, 0.045, (0, 0.0, 1.0), seg=32, cap=False)
    b.scale = (1.0, 0.8, 1.0)
    parts.append(("strap", b))
    parts.append(("metal", box("buckle", (0.05, 0.012, 0.04), (0, -0.126, 1.0), bevel=0.003)))
    for sx in (1, -1):
        parts.append(("vest", box("pouch", (0.07, 0.05, 0.085), (sx * 0.12, -0.085, 0.985), rot=(0, 0, sx * 0.55), bevel=0.012)))
    parts.append(("vest", box("pouchback", (0.12, 0.05, 0.08), (0, 0.13, 0.99), bevel=0.012)))
    # (the vest is built from the body surface later; see vest_from_body)
    # (cargo pockets are projected onto the thighs in vest_from_body)
    # rolled sleeve cuffs
    for sx in (1, -1):
        cuf = cylinder("cuff", 0.05, 0.05, (sx * 0.36, 0.024, 1.12), rot=(0, sx * -0.55, 0), seg=16, cap=False)
        parts.append(("shirt", cuf))
    # boots: shaft + foot + sole
    for sx in (1, -1):
        parts.append(("boot", cylinder("bootshaft", 0.06, 0.2, (sx * 0.116, 0.008, 0.13), r2=0.058, seg=18)))
        foot = box("bootfoot", (0.105, 0.27, 0.085), (sx * 0.117, -0.065, 0.055), bevel=0.035, segs=3)
        parts.append(("boot", foot))
        parts.append(("rubber", box("sole", (0.11, 0.285, 0.03), (sx * 0.117, -0.068, 0.012), bevel=0.01)))
        for k in range(4):
            parts.append(("strap", cylinder("lace", 0.004, 0.08, (sx * 0.117, -0.11 + k * 0.03, 0.105 + k * 0.012), rot=(0, math.pi / 2, 0), seg=6)))
    # gloves are the hands (body material)
    # bush hat: crown + brim + band
    crown = cylinder("hatcrown", 0.092, 0.085, (0, 0.0, 1.79), r2=0.08, seg=32)
    crown.scale = (1.0, 1.12, 1.0)
    parts.append(("hat", crown))
    bm = bmesh.new()
    seg = 40
    inner, outer = [], []
    for i in range(seg):
        a = i / seg * 2 * math.pi
        ci, si = math.cos(a), math.sin(a)
        inner.append(bm.verts.new((ci * 0.09, si * 0.1, 0)))
        droop = 0.025 * (1 - abs(si) * 0.3)
        outer.append(bm.verts.new((ci * 0.19, si * 0.205, -droop)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.006)
    brim = bm_obj(bm, "hatbrim")
    brim.location = (0, 0.0, 1.755)
    parts.append(("hat", brim))
    band = cylinder("hatband", 0.093, 0.02, (0, 0.0, 1.765), seg=32, cap=False)
    band.scale = (1.0, 1.12, 1.0)
    parts.append(("strap", band))
    # backpack with frame, lid, side pockets, sleeping mat and antenna masts
    pack = box("pack", (0.3, 0.17, 0.46), (0, 0.205, 1.25), bevel=0.045, segs=3)
    parts.append(("pack", pack))
    parts.append(("pack", box("packlid", (0.3, 0.19, 0.08), (0, 0.205, 1.49), bevel=0.035, segs=3)))
    for sx in (1, -1):
        parts.append(("pack", box("packside", (0.05, 0.12, 0.2), (sx * 0.17, 0.205, 1.14), bevel=0.02)))
    parts.append(("strap", cylinder("mat", 0.06, 0.34, (0, 0.21, 0.99), rot=(0, math.pi / 2, 0), seg=16)))
    for sx in (1, -1):
        # shoulder straps
        pts = [Vector((sx * 0.1, 0.13, 1.42)), Vector((sx * 0.12, -0.05, 1.47)), Vector((sx * 0.13, -0.13, 1.36)),
               Vector((sx * 0.13, -0.13, 1.2)), Vector((sx * 0.14, 0.1, 1.08))]
        v, f, uv, cc = tube([np.array(p) for p in pts], [0.022] * 5, sides=6)
        me = bpy.data.meshes.new("strapmesh")
        me.from_pydata([tuple(p) for p in v], [], [tuple(t) for t in f])
        for p in me.polygons:
            p.use_smooth = True
        so = bpy.data.objects.new("shoulderstrap", me)
        bpy.context.scene.collection.objects.link(so)
        so.scale = (1, 1, 1)
        parts.append(("strap", so))
    for k, (dx, h) in enumerate(((-0.1, 0.62), (-0.06, 0.55), (0.11, 0.5))):
        parts.append(("metal", cylinder("mast", 0.011, h, (dx, 0.27, 1.32 + h / 2 - 0.15), seg=8)))
        parts.append(("orange", cylinder("mastcap", 0.014, 0.03, (dx, 0.27, 1.32 + h - 0.15), seg=8)))
    # chest radio on the left shoulder strap
    parts.append(("device", box("radio", (0.045, 0.03, 0.09), (0.12, -0.15, 1.37), bevel=0.006)))
    parts.append(("metal", cylinder("radioant", 0.004, 0.09, (0.135, -0.15, 1.455), seg=6)))
    return parts


# ----------------------------------------------------------------------------- textures
def fabric_textures():
    n = 512
    us = np.arange(n) / n
    U, V = np.meshgrid(us, us)
    # twill weave
    k = 96
    twill = np.sin(2 * np.pi * (k * U + k * V)) * 0.5 + 0.5
    warp = np.sin(2 * np.pi * k * 2 * U) * 0.5 + 0.5
    h = 0.6 * twill + 0.25 * warp + 0.12 * fft_noise(n, 1.0, 1) + 0.2 * fft_noise(n, 3.0, 2)
    alb = np.ones((n, n, 3)) * (0.85 + 0.1 * twill[..., None] + 0.08 * fft_noise(n, 2.5, 3)[..., None])
    # wear: lighter faded patches, dirt
    alb *= (1 + 0.1 * np.clip(fft_noise(n, 3.0, 4), 0, 1))[..., None]
    alb *= (1 - 0.18 * np.clip(fft_noise(n, 2.6, 5) * 2 - 0.6, 0, 1))[..., None]
    save_webp(np.clip(alb * 0.9, 0, 1), os.path.join(OUT, "fabric_albedo.webp"), quality=86)
    save_webp(normal_from_height(h, 1.6), os.path.join(OUT, "fabric_normal.webp"), quality=86)
    # leather (grain) for boots & straps
    from lib import worley
    f1, f2, _ = worley(n, 600, 7)
    grain = np.clip((f2 - f1) * 40, 0, 1)
    h = 0.5 * grain + 0.3 * fft_noise(n, 1.2, 8) + 0.3 * fft_noise(n, 3.0, 9)
    alb = np.ones((n, n, 3)) * (0.8 + 0.25 * fft_noise(n, 2.2, 10)[..., None]) * (0.85 + 0.15 * grain[..., None])
    alb *= (1 - 0.3 * np.clip(fft_noise(n, 2.8, 11) * 2 - 0.4, 0, 1))[..., None]  # scuffs
    save_webp(np.clip(alb * 0.9, 0, 1), os.path.join(OUT, "leather_albedo.webp"), quality=86)
    save_webp(normal_from_height(h, 2.2), os.path.join(OUT, "leather_normal.webp"), quality=86)
    # nylon ripstop for the pack
    grid = ((np.sin(2 * np.pi * U * 40) > 0.94) | (np.sin(2 * np.pi * V * 40) > 0.94)).astype(float)
    h = 0.5 * grid + 0.4 * (np.sin(2 * np.pi * U * 300) * 0.5 + 0.5) + 0.1 * fft_noise(n, 1.0, 12)
    alb = np.ones((n, n, 3)) * (0.9 + 0.1 * grid[..., None] + 0.06 * fft_noise(n, 2.5, 13)[..., None])
    save_webp(np.clip(alb * 0.9, 0, 1), os.path.join(OUT, "nylon_albedo.webp"), quality=86)
    save_webp(normal_from_height(h, 1.0), os.path.join(OUT, "nylon_normal.webp"), quality=86)
    # skin: pores and subtle mottling
    h = 0.4 * fft_noise(n, 0.4, 14) + 0.3 * fft_noise(n, 2.0, 15)
    alb = np.ones((n, n, 3)) * (0.92 + 0.08 * fft_noise(n, 2.4, 16)[..., None])
    alb[..., 0] *= 1 + 0.05 * fft_noise(n, 2.0, 17)
    save_webp(np.clip(alb * 0.95, 0, 1), os.path.join(OUT, "skin_albedo.webp"), quality=86)
    save_webp(normal_from_height(h, 0.6), os.path.join(OUT, "skin_normal.webp"), quality=86)


# ----------------------------------------------------------------------------- rig
BONES = [
    # name, head, tail, parent
    ("root", (0, 0, 0), (0, 0.15, 0), None),
    ("hips", (0, 0, 0.97), (0, 0, 1.08), "root"),
    ("spine", (0, 0, 1.08), (0, -0.005, 1.22), "hips"),
    ("chest", (0, -0.005, 1.22), (0, 0.0, 1.45), "spine"),
    ("neck", (0, 0.01, 1.5), (0, 0.012, 1.6), "chest"),
    ("head", (0, 0.012, 1.6), (0, 0.0, 1.82), "neck"),
]
for s, sx in (("L", 1), ("R", -1)):
    BONES += [
        (f"shoulder.{s}", (sx * 0.03, 0.0, 1.43), (sx * 0.17, 0.01, 1.445), "chest"),
        (f"upperarm.{s}", (sx * 0.175, 0.01, 1.445), (sx * 0.33, 0.03, 1.18), f"shoulder.{s}"),
        (f"forearm.{s}", (sx * 0.33, 0.03, 1.18), (sx * 0.44, 0.0, 0.96), f"upperarm.{s}"),
        (f"hand.{s}", (sx * 0.44, 0.0, 0.96), (sx * 0.505, -0.012, 0.80), f"forearm.{s}"),
        (f"thigh.{s}", (sx * 0.095, 0.0, 0.93), (sx * 0.11, -0.015, 0.52), "hips"),
        (f"shin.{s}", (sx * 0.11, -0.015, 0.52), (sx * 0.115, 0.01, 0.10), f"thigh.{s}"),
        (f"foot.{s}", (sx * 0.115, 0.01, 0.10), (sx * 0.117, -0.12, 0.04), f"shin.{s}"),
        (f"toe.{s}", (sx * 0.117, -0.12, 0.04), (sx * 0.117, -0.2, 0.03), f"foot.{s}"),
    ]


def build_armature():
    arm = bpy.data.armatures.new("rig")
    ao = bpy.data.objects.new("rig", arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    for name, hd, tl, parent in BONES:
        b = arm.edit_bones.new(name)
        b.head = hd
        b.tail = tl
        # local Z points forward (-Y), so X is the lateral flexion axis
        b.align_roll(Vector((0, -1, 0)) if "foot" not in name and "toe" not in name and name != "root" else Vector((0, 0, 1)))
        if parent:
            b.parent = arm.edit_bones[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


def rigid_weights(ob, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")


def weights_by_nearest(ob, rig, allowed):
    """Rigid-ish skinning of gear by distance to bone segments (used for boots/strap parts)."""
    bones = [(b.name, Vector(b.head_local), Vector(b.tail_local)) for b in rig.data.bones if b.name in allowed]
    groups = {n: ob.vertex_groups.new(name=n) for n, _, _ in bones}
    for v in ob.data.vertices:
        p = ob.matrix_world @ v.co
        best, bn = 1e9, None
        for n, a, b in bones:
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            d = (a + ab * t - p).length
            if d < best:
                best, bn = d, n
        groups[bn].add([v.index], 1.0, "REPLACE")


# ----------------------------------------------------------------------------- animation
FPS = 30


ARM_DOWN = math.radians(44)   # from the A-pose rest to arms hanging at the sides


def pose_frame(rig, frame, pose):
    """pose: dict bone -> (rx, ry, rz) euler in local space; arm Z is relative to arms-down
    (positive = away from the body on both sides via the sgn convention used by the poses)."""
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        r = pose.get(pb.name, (0, 0, 0))
        if pb.name == "upperarm.L":
            r = (r[0], r[1], r[2] - ARM_DOWN)
        elif pb.name == "upperarm.R":
            r = (r[0], r[1], r[2] + ARM_DOWN)
        pb.rotation_euler = Euler(r, "XYZ")
        pb.keyframe_insert("rotation_euler", frame=frame)
        if pb.name == "hips":
            pb.location = Vector(pose.get("hips_loc", (0, 0, 0)))
            pb.keyframe_insert("location", frame=frame)


def make_action(rig, name, frames, fn, cyclic=True):
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    for f in range(frames + (1 if cyclic else 1)):
        t = f / frames
        pose_frame(rig, f + 1, fn(t))
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 1, act)
    st.mute = True
    rig.animation_data.action = None
    return act


d2r = math.radians


def gait(t, run=False, crouch=False):
    """Walk/run cycle. Angles in degrees; positive thigh X = swing forward."""
    p = 2 * math.pi * t
    A = 1.6 if run else 1.0
    pose = {}
    lean = 12 if run else (18 if crouch else 3)
    bob = (0.035 if run else 0.022) * math.cos(2 * p)
    crouch_drop = -0.28 if crouch else (-0.04 if run else 0)
    pose["hips_loc"] = (0.0, 0.0, bob + crouch_drop) if not False else (0, 0, 0)
    # note: the hips bone's local axes - Y is up the spine, Z forward: location (x, y, z) local -> y is vertical
    pose["hips_loc"] = (0.0, bob + crouch_drop, 0.0)
    pose["hips"] = (d2r(-lean * 0.3), d2r(6 * math.sin(p) * A), d2r(3 * math.cos(p)))
    pose["spine"] = (d2r(lean * 0.6), d2r(-5 * math.sin(p) * A), 0)
    pose["chest"] = (d2r(lean * 0.4), d2r(-7 * math.sin(p) * A), d2r(-2 * math.cos(p)))
    pose["neck"] = (d2r(-lean * 0.5), d2r(4 * math.sin(p)), 0)
    pose["head"] = (d2r(-lean * 0.4), d2r(3 * math.sin(p)), 0)
    for side, ph in (("L", 0.0), ("R", math.pi)):
        q = p + ph
        sgn = 1 if side == "L" else -1
        thigh = (24 * A + (10 if crouch else 0)) * math.sin(q) + (6 if run else 2) + (55 if crouch else 0)
        # knee: big flexion during swing (phase where thigh moves forward), small at contact
        swing = max(0.0, math.sin(q + 0.9))
        knee = -(8 + (62 if run else 52) * swing ** 1.6 + (2 if not run else 18)) - (75 if crouch else 0)
        ankle = 12 * math.sin(q - 0.6) + (10 if crouch else 0) + (8 if run else 0)
        pose[f"thigh.{side}"] = (d2r(thigh), 0, d2r(-2 * sgn))
        pose[f"shin.{side}"] = (d2r(knee), 0, 0)
        pose[f"foot.{side}"] = (d2r(ankle), 0, 0)
        pose[f"toe.{side}"] = (d2r(max(0.0, 25 * math.sin(q - 2.0))), 0, 0)
        arm_swing = -(18 * A if not crouch else 8) * math.sin(q)
        elbow = -(15 + (55 if run else 10) + 10 * max(0.0, math.sin(q + math.pi)))
        pose[f"upperarm.{side}"] = (d2r(arm_swing), 0, d2r(4 * sgn))
        pose[f"forearm.{side}"] = (d2r(elbow * -1), 0, 0)
        pose[f"hand.{side}"] = (d2r(-5), 0, 0)
    return pose


def idle(t):
    p = 2 * math.pi * t
    br = math.sin(p)
    pose = {"hips_loc": (0, 0.003 * br, 0)}
    pose["spine"] = (d2r(1.5 * br), 0, 0)
    pose["chest"] = (d2r(2.0 * br), 0, d2r(0.6 * math.sin(p * 0.5)))
    pose["head"] = (d2r(-1 + 2 * math.sin(p * 0.5)), d2r(6 * math.sin(p * 0.5 + 1)), 0)
    for side, sgn in (("L", 1), ("R", -1)):
        pose[f"upperarm.{side}"] = (d2r(2 + 1.5 * br), 0, d2r(4 * sgn))
        pose[f"forearm.{side}"] = (d2r(14), 0, 0)
        pose[f"thigh.{side}"] = (d2r(2), 0, d2r(-1.5 * sgn))
        pose[f"shin.{side}"] = (d2r(-4), 0, 0)
        pose[f"foot.{side}"] = (d2r(2), 0, 0)
    return pose


def scan(t):
    """Holding the scanner up in front of the chest with both hands, slow sweep."""
    p = 2 * math.pi * t
    pose = idle(t)
    pose["chest"] = (d2r(4), d2r(10 * math.sin(p)), 0)
    pose["head"] = (d2r(8), d2r(6 * math.sin(p)), 0)
    pose["upperarm.R"] = (d2r(42), d2r(-25), d2r(10))
    pose["forearm.R"] = (d2r(88), d2r(20), 0)
    pose["hand.R"] = (d2r(-15), 0, d2r(-10))
    pose["upperarm.L"] = (d2r(38), d2r(25), d2r(-12))
    pose["forearm.L"] = (d2r(95), d2r(-20), 0)
    pose["hand.L"] = (d2r(-15), 0, d2r(10))
    return pose


def kneel(t):
    """Kneel and work at ground level (deploying an antenna / sampling)."""
    p = 2 * math.pi * t
    pose = {"hips_loc": (0, -0.42, 0.02)}
    pose["hips"] = (d2r(-5), 0, 0)
    pose["spine"] = (d2r(25), 0, 0)
    pose["chest"] = (d2r(12), d2r(4 * math.sin(p)), 0)
    pose["head"] = (d2r(15), 0, 0)
    pose["thigh.L"] = (d2r(85), 0, 0)
    pose["shin.L"] = (d2r(-95), 0, 0)
    pose["foot.L"] = (d2r(10), 0, 0)
    pose["thigh.R"] = (d2r(-5), 0, 0)
    pose["shin.R"] = (d2r(-110), 0, 0)
    pose["foot.R"] = (d2r(-35), 0, 0)
    pose["toe.R"] = (d2r(40), 0, 0)
    for side, sgn, ph in (("L", 1, 0), ("R", -1, math.pi)):
        pose[f"upperarm.{side}"] = (d2r(55 + 12 * math.sin(p * 2 + ph)), 0, d2r(10 * sgn))
        pose[f"forearm.{side}"] = (d2r(40 + 15 * math.sin(p * 2 + ph)), 0, 0)
    return pose


def radio(t):
    p = 2 * math.pi * t
    pose = idle(t)
    pose["upperarm.L"] = (d2r(28), d2r(10), d2r(68))
    pose["forearm.L"] = (d2r(128), 0, 0)
    pose["hand.L"] = (d2r(-20), 0, 0)
    pose["head"] = (d2r(-4), d2r(-12), d2r(-8))
    pose["upperarm.R"] = (d2r(10 + 6 * math.sin(p * 2)), 0, d2r(-12))
    pose["forearm.R"] = (d2r(30 + 10 * math.sin(p * 2)), 0, 0)
    return pose


def hurt(t):
    k = math.sin(math.pi * min(t * 1.6, 1.0))
    pose = idle(0)
    pose["hips_loc"] = (0, -0.06 * k, 0.05 * k)
    pose["spine"] = (d2r(-18 * k), 0, d2r(6 * k))
    pose["chest"] = (d2r(-14 * k), d2r(10 * k), 0)
    pose["head"] = (d2r(-20 * k), 0, 0)
    for side, sgn in (("L", 1), ("R", -1)):
        pose[f"upperarm.{side}"] = (d2r(30 * k), 0, d2r((4 + 30 * k) * sgn))
        pose[f"forearm.{side}"] = (d2r(60 * k), 0, 0)
    return pose


def down(t):
    """Collapsed on the ground (incapacitated), breathing."""
    br = math.sin(2 * math.pi * t)
    pose = {"hips_loc": (0, -0.82, 0.25)}
    pose["root"] = (0, 0, 0)
    pose["hips"] = (d2r(-82), 0, d2r(8))
    pose["spine"] = (d2r(4 + br), 0, 0)
    pose["chest"] = (d2r(3 + br * 1.5), 0, 0)
    pose["head"] = (d2r(-10), d2r(35), 0)
    pose["upperarm.L"] = (d2r(60), 0, d2r(40))
    pose["forearm.L"] = (d2r(30), 0, 0)
    pose["upperarm.R"] = (d2r(20), 0, d2r(-60))
    pose["forearm.R"] = (d2r(15), 0, 0)
    pose["thigh.L"] = (d2r(20), 0, 0)
    pose["shin.L"] = (d2r(-35), 0, 0)
    pose["thigh.R"] = (d2r(-5), 0, 0)
    pose["shin.R"] = (d2r(-10), 0, 0)
    return pose


def wave(t):
    """Signalling the helicopter: right arm waving overhead."""
    p = 2 * math.pi * t
    pose = idle(t)
    pose["upperarm.R"] = (d2r(15), 0, d2r(-155 + 18 * math.sin(p * 2)))
    pose["forearm.R"] = (d2r(20 + 10 * math.sin(p * 2)), 0, 0)
    pose["head"] = (d2r(-25), 0, 0)
    return pose


# ----------------------------------------------------------------------------- main
def main():
    preview = "--preview" in sys.argv
    sc = reset()
    fabric_textures()
    body = build_body()
    head = build_head()
    gear = build_gear()
    gear += vest_from_body(body)
    rig = build_armature()

    mats = {}

    def M(name, color, rough=0.8):
        if name not in mats:
            m = bpy.data.materials.new(name)
            b = m.node_tree.nodes["Principled BSDF"]
            b.inputs["Base Color"].default_value = (*color, 1)
            b.inputs["Roughness"].default_value = rough
            mats[name] = m
        return mats[name]

    shirt = M("cloth_shirt", (0.33, 0.30, 0.20))
    pants = M("cloth_pants", (0.16, 0.16, 0.11))
    vest = M("cloth_vest", (0.24, 0.20, 0.13))
    glove = M("glove", (0.07, 0.065, 0.06), 0.7)
    skin = M("skin", (0.45, 0.30, 0.22), 0.55)
    boot = M("leather_boot", (0.12, 0.07, 0.04), 0.6)
    rubber = M("rubber", (0.025, 0.025, 0.025), 0.9)
    hat = M("cloth_hat", (0.40, 0.34, 0.22))
    pack = M("nylon_pack", (0.12, 0.15, 0.09), 0.65)
    strap = M("nylon_strap", (0.05, 0.05, 0.045), 0.7)
    metal = M("metal", (0.55, 0.56, 0.58), 0.35)
    orange = M("paint_orange", (0.8, 0.22, 0.02), 0.5)
    device = M("device", (0.02, 0.022, 0.025), 0.4)
    hair = M("hair", (0.04, 0.025, 0.015), 0.6)
    eye = M("eye", (0.02, 0.015, 0.012), 0.15)

    # body materials by region
    me = body.data
    for m in (shirt, pants, glove):
        me.materials.append(m)
    for p in me.polygons:
        c = p.center
        if abs(c.x) > 0.43 and c.z < 1.0:
            p.material_index = 2  # gloves
        elif c.z < 1.02 and abs(c.x) < 0.3:
            p.material_index = 1  # trousers
        else:
            p.material_index = 0
    head.data.materials.append(skin)
    for o in bpy.data.objects:
        if o.name.startswith("ear"):
            o.data.materials.append(skin)
        if o.name.startswith("eye"):
            o.data.materials.append(eye)
        if o.name.startswith(("hair", "eyebrow")):
            o.data.materials.append(hair)
    matmap = {"shirt": shirt, "pants": pants, "vest": vest, "boot": boot, "rubber": rubber, "hat": hat, "pack": pack,
              "strap": strap, "metal": metal, "orange": orange, "device": device}
    for kind, o in gear:
        o.data.materials.append(matmap[kind])

    # apply transforms of all parts
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            o.data.transform(o.matrix_world)
            o.matrix_world = Matrix.Identity(4)
    # join head pieces into the head; gear grouped by attachment
    heads = [o for o in bpy.data.objects if o.type == "MESH" and (o.name.startswith(("head", "ear", "eye", "hair")))]
    heads = [o for o in heads if not o.name.startswith("headbase")]
    from lib import join
    headob = join(heads, "head")
    groups = {"head": [], "chest": [], "hips": [], "boots": [], "arms": [], "vest": [], "legs": []}
    for kind, o in gear:
        n = o.name
        if n.startswith(("hat",)):
            groups["head"].append(o)
        elif n.startswith(("pack", "mat", "mast", "shoulderstrap", "radio", "collar")):
            groups["chest"].append(o)
        elif n.startswith(("vestshell", "pocketvest")):
            groups["vest"].append(o)
        elif n.startswith(("belt", "buckle", "pouch")):
            groups["hips"].append(o)
        elif n.startswith("cargo"):
            groups["legs"].append(o)
        elif n.startswith(("boot", "sole", "lace")):
            groups["boots"].append(o)
        elif n.startswith("cuff"):
            groups["arms"].append(o)
    gear_obs = {}
    for g, objs in groups.items():
        if objs:
            gear_obs[g] = join(objs, "gear_" + g)

    # UV unwrap everything for the AO atlas (and fabric tiling)
    all_meshes = [body, headob] + list(gear_obs.values())
    for o in all_meshes:
        select_only([o])
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    bake_ao(all_meshes)

    # skinning
    select_only([body, headob, rig], rig)
    for o in (body,):
        select_only([o, rig], rig)
        with bpy.context.temp_override(active_object=rig, selected_objects=[o, rig], selected_editable_objects=[o, rig]):
            bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    attach = {"head": "head", "chest": "chest", "hips": "hips"}
    for g, ob in gear_obs.items():
        if g in attach:
            rigid_weights(ob, attach[g])
        elif g == "boots":
            weights_by_nearest(ob, rig, {"shin.L", "shin.R", "foot.L", "foot.R", "toe.L", "toe.R"})
        elif g == "arms":
            weights_by_nearest(ob, rig, {"forearm.L", "forearm.R"})
        elif g == "vest":
            weights_by_nearest(ob, rig, {"spine", "chest", "hips"})
        elif g == "legs":
            weights_by_nearest(ob, rig, {"thigh.L", "thigh.R"})
        ob.parent = rig
        mod = ob.modifiers.new("arm", "ARMATURE")
        mod.object = rig
    rigid_weights(headob, "head")
    headob.parent = rig
    mod = headob.modifiers.new("arm", "ARMATURE")
    mod.object = rig

    # animations
    frames = {"idle": 90, "walk": 34, "run": 22, "crouch": 40, "scan": 60, "kneel": 60, "radio": 60, "hurt": 18, "down": 80, "wave": 30}
    make_action(rig, "idle", frames["idle"], idle)
    make_action(rig, "walk", frames["walk"], lambda t: gait(t))
    make_action(rig, "run", frames["run"], lambda t: gait(t, run=True))
    make_action(rig, "crouch", frames["crouch"], lambda t: gait(t, crouch=True))
    make_action(rig, "scan", frames["scan"], scan)
    make_action(rig, "kneel", frames["kneel"], kneel)
    make_action(rig, "radio", frames["radio"], radio)
    make_action(rig, "hurt", frames["hurt"], hurt, cyclic=False)
    make_action(rig, "down", frames["down"], down)
    make_action(rig, "wave", frames["wave"], wave)

    if preview:
        render_previews(rig, all_meshes)
    for tr in rig.animation_data.nla_tracks:
        for st in tr.strips:
            st.mute = False
    from lib import ensure_uv_export
    ensure_uv_export(all_meshes)
    objs = [rig] + all_meshes
    select_only(objs, rig)
    path = os.path.join(OUT, "explorer.glb")
    with bpy.context.temp_override(selected_objects=objs, active_object=rig):
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                                  export_animations=True, export_animation_mode="ACTIONS", export_yup=True,
                                  export_skins=True, export_morph=False, export_texcoords=True, export_normals=True,
                                  export_materials="EXPORT", export_vertex_color="NONE", export_image_format="NONE")
    print("explorer.glb", os.path.getsize(path))


def bake_ao(objs):
    """Bake ambient occlusion of the whole outfit into each object's UV layout."""
    sc = bpy.context.scene
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.light_settings.distance = 0.12
    img = new_image("explorer_ao", 1024, data=True)
    # each object gets its own AO image region? Use one image per object for simplicity
    for o in objs:
        im = new_image(f"ao_{o.name}", 512, data=True)
        for m in o.data.materials:
            nt = m.node_tree
            node = nt.nodes.get("__bake__") or nt.nodes.new("ShaderNodeTexImage")
            node.name = "__bake__"
            node.image = im
            nt.nodes.active = node
        select_only([o])
        sc.cycles.samples = 48
        sc.render.bake.use_selected_to_active = False
        sc.render.bake.margin = 8
        with bpy.context.temp_override(active_object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.bake(type="AO")
        ao = image_to_np(im)[..., 0]
        save_webp(np.repeat(ao[..., None], 3, -1), os.path.join(OUT, f"ao_{o.name}.webp"), quality=85)
        for m in o.data.materials:
            n = m.node_tree.nodes.get("__bake__")
            if n:
                m.node_tree.nodes.remove(n)


def render_previews(rig, meshes):
    from plantlib import preview_render
    sc = bpy.context.scene
    # pose checks: walk mid-stride and scan
    for act_name, frame, fn in (("walk", 8, "walk"), ("scan", 10, "scan"), ("idle", 1, "idle")):
        rig.animation_data.action = bpy.data.actions[act_name]
        sc.frame_set(frame)
        here = os.path.dirname(os.path.abspath(__file__))
        preview_render(meshes, os.path.join(here, f".explorer_{fn}.png"), (1.6, -2.6, 1.4), (0, 0, 1.0), lens=50, res=(500, 700), samples=32)
    rig.animation_data.action = None


if __name__ == "__main__":
    main()

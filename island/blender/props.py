"""Hard-surface props: survey helicopter, relay antenna, base camp, rocks, logs, memo case,
handheld scanner and the item props.

  python island/blender/props.py [names...] [--preview]
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import (ASSETS, bake, export_glb, fft_noise, image_to_np, join, linear_to_srgb, mesh_object, new_image, reset,
                 rock_blob, save_webp, select_only)
from creaturelib import bm_obj, cone, ellipsoid, material
from plantlib import normal_from_height, tube

OUT = os.path.join(ASSETS, "props")
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))


def box(name, size, loc, rot=(0, 0, 0), bevel=0.01, segs=2, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segs, affect="EDGES", profile=0.5)
    ob = bm_obj(bm, name, mat, smooth=bevel > 0)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def cyl(name, r, h, loc, rot=(0, 0, 0), seg=16, r2=None, mat=None, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = bm_obj(bm, name, mat)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def rod(name, a, b, r, mat, seg=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = cyl(name, r, d.length, (a + b) / 2, seg=seg, mat=mat)
    ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    return ob


def text_mesh(name, txt, size, loc, rot, mat, extrude=0.002):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = txt
    cu.size = size
    cu.extrude = extrude
    cu.align_x = "CENTER"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    mo = bpy.data.objects.new(name + "_m", me)
    bpy.context.scene.collection.objects.link(mo)
    mo.matrix_world = ob.matrix_world
    bpy.data.objects.remove(ob)
    mo.data.materials.clear()
    mo.data.materials.append(mat)
    return mo


def apply_all():
    # parts are placed by setting .location/.rotation_euler; matrix_world only follows after a
    # view-layer update, without which every part would be baked at the origin
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.data.transform(o.matrix_world)
            o.matrix_world = Matrix.Identity(4)


# ============================================================================ helicopter
def loft(name, sections, mat, seg=24):
    """sections: list of (y, cx, cz, half_w, half_h, squareness). Fuselage along -Y (nose)."""
    bm = bmesh.new()
    rings = []
    for (y, cx, cz, hw, hh, sq) in sections:
        ring = []
        for i in range(seg):
            a = i / seg * 2 * math.pi
            c, s = math.cos(a), math.sin(a)
            # superellipse
            e = 2.0 / (2 + sq * 6)
            x = hw * math.copysign(abs(c) ** e, c)
            z = hh * math.copysign(abs(s) ** e, s)
            ring.append(bm.verts.new((cx + x, y, cz + z)))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]))
    # caps
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = bm_obj(bm, name, mat)
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    from lib import apply_modifiers
    apply_modifiers(ob)
    return ob


def helicopter():
    reset()
    paint = material("heli_paint", (0.62, 0.62, 0.6), 0.35, coat=0.5)
    orange = material("heli_orange", (0.75, 0.2, 0.02), 0.35, coat=0.5)
    glass = material("heli_glass", (0.02, 0.03, 0.035), 0.05, metal=0.2)
    dark = material("heli_dark", (0.03, 0.03, 0.03), 0.5)
    metal = material("heli_metal", (0.5, 0.5, 0.52), 0.35, metal=0.9)
    blade = material("heli_blade", (0.05, 0.05, 0.05), 0.5)
    # fuselage sections (y, cx, cz, half width, half height, squareness)
    S = [(-2.55, 0, 1.25, 0.05, 0.08, 0.0), (-2.45, 0, 1.22, 0.45, 0.45, 0.2), (-2.1, 0, 1.3, 0.78, 0.72, 0.4),
         (-1.4, 0, 1.38, 0.88, 0.85, 0.6), (-0.4, 0, 1.4, 0.92, 0.9, 0.75), (0.8, 0, 1.42, 0.9, 0.9, 0.75),
         (1.6, 0, 1.55, 0.7, 0.72, 0.6), (2.4, 0, 1.75, 0.38, 0.4, 0.4), (3.5, 0, 1.9, 0.22, 0.24, 0.3),
         (5.6, 0, 2.05, 0.15, 0.16, 0.2), (6.6, 0, 2.12, 0.12, 0.14, 0.2)]
    body = loft("fuselage", S, paint)
    parts = [body]
    # engine housing and exhaust
    parts.append(box("engine", (0.6, 1.6, 0.35), (0, 0.6, 2.42), bevel=0.12, segs=3, mat=paint))
    parts.append(cyl("exhaust", 0.12, 0.35, (0.28, 1.45, 2.42), (math.pi / 2, 0, 0.3), mat=dark))
    parts.append(cyl("mast", 0.09, 0.45, (0, -0.1, 2.75), mat=metal))
    # orange stripes / livery
    stripe = loft("stripe", [(y, cx, cz - 0.15, hw + 0.006, hh * 0.18, sq) for (y, cx, cz, hw, hh, sq) in S[2:7]], orange)
    parts.append(stripe)
    # windows: front canopy and cabin windows
    canopy = ellipsoid("canopy", (0.8, 0.75, 0.55), (0, -1.75, 1.6), mat=glass)
    parts.append(canopy)
    for sx in (1, -1):
        parts.append(box(f"win{sx}", (0.02, 0.75, 0.42), (sx * 0.915, -0.2, 1.62), bevel=0.06, mat=glass))
        parts.append(box(f"door{sx}", (0.02, 1.25, 1.25), (sx * 0.93, 0.15, 1.35), bevel=0.02, mat=paint))
    # tail fin, stabilizers, tail rotor housing
    fin = box("fin", (0.06, 0.7, 1.0), (0, 6.3, 2.6), (d2r(-18), 0, 0), bevel=0.02, mat=paint)
    parts.append(fin)
    parts.append(box("stab", (1.4, 0.35, 0.05), (0, 5.4, 2.05), bevel=0.02, mat=paint))
    parts.append(box("finstripe", (0.065, 0.3, 0.6), (0, 6.35, 2.75), (d2r(-18), 0, 0), bevel=0.01, mat=orange))
    # skids
    for sx in (1, -1):
        parts.append(rod(f"skid{sx}", (sx * 1.05, -1.6, 0.05), (sx * 1.05, 1.6, 0.05), 0.045, metal))
        parts.append(rod(f"skidup{sx}", (sx * 1.05, -1.6, 0.05), (sx * 1.0, -1.95, 0.25), 0.045, metal))
        for y in (-0.9, 0.9):
            parts.append(rod(f"strut{sx}{y}", (sx * 1.05, y, 0.05), (sx * 0.7, y, 0.75), 0.04, metal))
    # antennas & lights
    parts.append(rod("ant1", (0, 1.2, 0.5), (0, 1.5, 0.15), 0.01, dark))
    parts.append(cyl("beacon", 0.06, 0.08, (0, 1.0, 2.62), mat=material("heli_red", (0.6, 0.02, 0.02), 0.3, emit=((1, 0.05, 0.02), 6))))
    # livery text
    parts.append(text_mesh("txtL", "ISLAND SURVEY", 0.22, (0.935, 0.2, 1.88), (d2r(90), 0, d2r(90)), dark))
    parts.append(text_mesh("txtR", "ISLAND SURVEY", 0.22, (-0.935, 0.2, 1.88), (d2r(90), 0, d2r(-90)), dark))
    parts.append(text_mesh("reg", "JA-26TI", 0.18, (0.0, 6.3, 2.2), (d2r(90), 0, d2r(90)), dark))
    apply_all()
    heli = join(parts, "heli_body")
    # main rotor: hub + 4 blades
    rot = [cyl("hub", 0.18, 0.18, (0, 0, 0), mat=metal)]
    for k in range(4):
        a = k * math.pi / 2
        b = box(f"blade{k}", (5.0, 0.3, 0.035), (math.cos(a) * 2.6, math.sin(a) * 2.6, 0.02), (0, d2r(-3), a), bevel=0.012, mat=blade)
        rot.append(b)
    apply_all()
    rotor = join(rot, "heli_rotor")
    tr = [cyl("thub", 0.06, 0.1, (0, 0, 0), (0, d2r(90), 0), mat=metal)]
    for k in range(2):
        a = k * math.pi
        tr.append(box(f"tblade{k}", (0.03, 0.12, 1.1), (0.04, math.sin(a) * 0.0, math.cos(a) * 0.55), (a, 0, 0), bevel=0.005, mat=blade))
    apply_all()
    trot = join(tr, "heli_tail")
    # the rotors keep their hub as the node origin so the game can spin them in place
    rotor.location = (0, -0.1, 3.0)
    trot.location = (-0.12, 6.45, 2.65)
    if "--preview" in sys.argv:
        from plantlib import preview_render
        preview_render([heli, rotor, trot], os.path.join(HERE, ".heli_preview.png"), (9, -9, 5), (0, 1.5, 1.6), lens=40, res=(800, 500))
    export_glb([heli, rotor, trot], os.path.join(OUT, "heli.glb"), vcol=False)
    print("heli", os.path.getsize(os.path.join(OUT, "heli.glb")))


# ============================================================================ relay antenna
def antenna():
    reset()
    alu = material("ant_alu", (0.6, 0.6, 0.62), 0.3, metal=0.9)
    orange = material("ant_orange", (0.8, 0.22, 0.02), 0.45)
    dark = material("ant_dark", (0.03, 0.03, 0.035), 0.5)
    panel = material("ant_panel", (0.03, 0.05, 0.12), 0.15, metal=0.3)
    led = material("ant_led", (0.1, 0.8, 0.2), 0.3, emit=((0.2, 1, 0.3), 8))
    parts = []
    H = 3.2
    for k in range(3):
        a = k / 3 * 2 * math.pi
        parts.append(rod(f"leg{k}", (math.cos(a) * 0.75, math.sin(a) * 0.75, 0.0), (0, 0, 1.0), 0.016, alu))
        parts.append(cyl(f"foot{k}", 0.04, 0.03, (math.cos(a) * 0.75, math.sin(a) * 0.75, 0.015), mat=dark))
    for k, (r, z0, z1) in enumerate(((0.03, 0.9, 1.9), (0.024, 1.85, 2.7), (0.018, 2.65, H))):
        parts.append(cyl(f"mast{k}", r, z1 - z0, (0, 0, (z0 + z1) / 2), mat=alu))
        parts.append(cyl(f"clamp{k}", r + 0.008, 0.04, (0, 0, z1 - 0.02), mat=dark))
    # dipole + whip at the top
    parts.append(rod("whip", (0, 0, H), (0, 0, H + 1.1), 0.006, dark))
    parts.append(rod("dip1", (-0.45, 0, H - 0.15), (0.45, 0, H - 0.15), 0.008, alu))
    parts.append(cyl("tip", 0.012, 0.03, (0, 0, H + 1.12), mat=orange))
    # solar panel and battery box
    sp = box("solar", (0.5, 0.36, 0.025), (0.0, -0.25, 1.35), (d2r(35), 0, 0), bevel=0.005, mat=panel)
    parts.append(sp)
    parts.append(box("solarframe", (0.52, 0.38, 0.015), (0.0, -0.243, 1.343), (d2r(35), 0, 0), bevel=0.004, mat=alu))
    parts.append(box("battery", (0.26, 0.18, 0.2), (0, 0.0, 0.75), bevel=0.012, mat=orange))
    parts.append(box("label", (0.16, 0.005, 0.07), (0, -0.092, 0.77), bevel=0.0, mat=dark))
    parts.append(ellipsoid("led", (0.018, 0.018, 0.018), (0.09, -0.092, 0.82), mat=led))
    # orange marker flag
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((0.03, 0, 2.3), (0.4, 0.02, 2.22), (0.38, 0.0, 2.08), (0.03, 0, 2.1))]
    bm.faces.new(vs)
    flag = bm_obj(bm, "flag", orange)
    flag.data.polygons[0].use_smooth = False
    parts.append(flag)
    apply_all()
    ant = join(parts, "antenna")
    export_glb([ant], os.path.join(OUT, "antenna.glb"), vcol=False)
    if "--preview" in sys.argv:
        from plantlib import preview_render
        preview_render([ant], os.path.join(HERE, ".antenna_preview.png"), (2.5, -3.5, 2.0), (0, 0, 1.6), lens=40, res=(500, 600))
    print("antenna", os.path.getsize(os.path.join(OUT, "antenna.glb")))


# ============================================================================ base camp
def camp():
    reset()
    tent = material("tent_fabric", (0.12, 0.18, 0.1), 0.8)
    tent2 = material("tent_orange", (0.6, 0.2, 0.04), 0.8)
    wood = material("crate_wood", (0.32, 0.22, 0.13), 0.8)
    olive = material("crate_olive", (0.13, 0.15, 0.09), 0.7)
    metal = material("camp_metal", (0.45, 0.45, 0.47), 0.4, metal=0.85)
    dark = material("camp_dark", (0.03, 0.03, 0.03), 0.6)
    white = material("pad_white", (0.8, 0.8, 0.78), 0.7)
    orange = material("pad_orange", (0.8, 0.22, 0.03), 0.6)
    screen = material("camp_screen", (0.05, 0.25, 0.2), 0.2, emit=((0.1, 0.6, 0.45), 2.0))
    objs = []

    def dome_tent(name, loc, rot, r, h, mat):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=14, radius=1.0)
        rem = [v for v in bm.verts if v.co.z < -0.01]
        bmesh.ops.delete(bm, geom=rem, context="VERTS")
        for v in bm.verts:
            a = math.atan2(v.co.y, v.co.x)
            z = v.co.z
            # fabric sags between the two crossing poles, flatter crown, slight skirt flare
            sag = 1 - 0.11 * abs(math.sin(2 * a)) * (1 - z) ** 0.7
            crown = z ** 0.85
            skirt = 1 + 0.06 * (1 - z) ** 6
            v.co = Vector((v.co.x * r * 1.25 * sag * skirt, v.co.y * r * sag * skirt, crown * h))
        ob = bm_obj(bm, name, mat)
        ob.location = loc
        ob.rotation_euler = (0, 0, rot)
        out = [ob]
        # vestibule: a half cone in front of the door
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=16, radius1=0.75 * r, radius2=0.02, depth=h * 0.82)
        rem = [v for v in bm.verts if v.co.y > 0.001]
        bmesh.ops.delete(bm, geom=rem, context="VERTS")
        for v in bm.verts:
            v.co.z += h * 0.41
        ves = bm_obj(bm, name + "ves", mat)
        ves.location = Vector(loc) + Vector((math.sin(rot) * r * 0.75, -math.cos(rot) * r * 0.75, 0))
        ves.rotation_euler = (math.radians(-28), 0, rot)
        out.append(ves)
        # crossing poles riding on the fly
        for k in (0, 1):
            pts = []
            for t in np.linspace(0, 1, 16):
                a = math.pi * t
                pts.append(np.array([math.cos(a) * r * 1.22, 0.0, (math.sin(a) ** 0.85) * h * 1.015]))
            v, f, uv, c = tube(pts, [0.014] * 16, sides=5)
            me = bpy.data.meshes.new("pole")
            me.from_pydata([tuple(p) for p in v], [], [tuple(t) for t in f])
            po = bpy.data.objects.new("pole", me)
            bpy.context.scene.collection.objects.link(po)
            po.data.materials.append(dark)
            po.location = loc
            po.rotation_euler = (0, 0, rot + (math.pi / 4 if k else -math.pi / 4))
            out.append(po)
        door = box(name + "door", (0.55, 0.02, 0.62), (0, 0, 0), bevel=0.0, mat=dark)
        door.location = Vector(loc) + Vector((math.sin(rot) * r * 1.02, -math.cos(rot) * r * 1.02, 0.33))
        door.rotation_euler = (math.radians(-28), 0, rot)
        out.append(door)
        # guy lines and pegs
        for k in range(4):
            a = rot + math.pi / 4 + k * math.pi / 2
            top = Vector(loc) + Vector((math.cos(a) * r * 0.85, math.sin(a) * r * 0.85, h * 0.62))
            peg = Vector(loc) + Vector((math.cos(a) * r * 2.0, math.sin(a) * r * 2.0, 0.0))
            out.append(rod(name + f"guy{k}", top, peg, 0.004, dark))
            out.append(rod(name + f"peg{k}", peg - Vector((0, 0, 0.05)), peg + Vector((0, 0, 0.06)), 0.01, metal))
        return out

    objs += dome_tent("tentA", (-9, 6, 0), 0.3, 1.3, 1.25, tent)
    objs += dome_tent("tentB", (-6, 9.5, 0), -0.4, 1.1, 1.1, tent2)
    # crates and cases
    rgx = np.random.default_rng(3)
    for k, (x, y, s) in enumerate(((5, 7, 0.55), (5.7, 7.4, 0.5), (5.2, 7.2, 0.45), (-3, 11, 0.6), (6.5, 5.5, 0.4))):
        mat = wood if k % 2 == 0 else olive
        objs.append(box(f"crate{k}", (s * 1.4, s, s * 0.9), (x, y, s * 0.45 + (0.45 if k == 2 else 0)), (0, 0, rgx.uniform(-0.3, 0.3)), bevel=0.02, mat=mat))
    # folding table with radio console
    objs.append(box("table", (1.6, 0.8, 0.04), (2, 9, 0.76), bevel=0.01, mat=metal))
    for sx in (-0.75, 0.75):
        for sy in (-0.35, 0.35):
            objs.append(rod(f"tleg{sx}{sy}", (2 + sx, 9 + sy, 0), (2 + sx, 9 + sy, 0.74), 0.015, metal))
    objs.append(box("console", (0.5, 0.35, 0.22), (1.7, 9.0, 0.89), bevel=0.01, mat=olive))
    objs.append(box("screen", (0.3, 0.01, 0.16), (2.3, 8.9, 0.92), (d2r(-15), 0, 0), bevel=0.0, mat=screen))
    objs.append(box("laptop", (0.34, 0.24, 0.02), (2.3, 9.05, 0.79), bevel=0.005, mat=dark))
    # generator
    objs.append(box("gen", (0.6, 0.4, 0.45), (6, 10, 0.23), bevel=0.04, mat=orange))
    objs.append(box("genframe", (0.64, 0.44, 0.5), (6, 10, 0.25), bevel=0.0, mat=dark))
    # tall radio mast with guy wires (the base station)
    objs.append(cyl("bmast", 0.05, 9.0, (-1, 13, 4.5), r2=0.03, mat=metal))
    for k in range(3):
        a = k / 3 * 2 * math.pi + 0.3
        objs.append(rod(f"guy{k}", (-1, 13, 8.5), (-1 + math.cos(a) * 4.5, 13 + math.sin(a) * 4.5, 0.0), 0.006, dark))
    objs.append(rod("bdip", (-1.7, 13, 8.8), (-0.3, 13, 8.8), 0.012, metal))
    objs.append(ellipsoid("bled", (0.05, 0.05, 0.05), (-1, 13, 9.05), mat=material("mast_red", (0.6, 0.02, 0.02), 0.3, emit=((1, 0.05, 0.02), 6))))
    # landing pad: orange corner panels and a white H of fabric panels
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(box(f"padc{sx}{sy}", (1.2, 0.6, 0.02), (sx * 5.2, sy * 5.2 - 14, 0.05), (0, 0, d2r(45 * sx * sy)), bevel=0.0, mat=orange))
    objs.append(box("H1", (0.5, 3.0, 0.02), (-1.0, -14, 0.06), bevel=0.0, mat=white))
    objs.append(box("H2", (0.5, 3.0, 0.02), (1.0, -14, 0.06), bevel=0.0, mat=white))
    objs.append(box("H3", (1.6, 0.5, 0.02), (0, -14, 0.06), bevel=0.0, mat=white))
    # windsock
    objs.append(rod("sockpole", (8, -9, 0), (8, -9, 3.5), 0.03, metal))
    objs.append(cyl("sock", 0.18, 1.2, (8, -9.6, 3.35), (d2r(90), 0, 0), r2=0.08, mat=orange, cap=False))
    apply_all()
    c = join(objs, "camp")
    export_glb([c], os.path.join(OUT, "camp.glb"), vcol=False)
    if "--preview" in sys.argv:
        from plantlib import preview_render
        preview_render([c], os.path.join(HERE, ".camp_preview.png"), (14, -22, 9), (0, 2, 0.5), lens=32, res=(800, 500))
    print("camp", os.path.getsize(os.path.join(OUT, "camp.glb")))


# ============================================================================ rocks & logs
def rocks():
    """Basalt boulders: high-poly displaced -> low-poly with baked tangent normals + AO."""
    reset()
    sc = bpy.context.scene
    sc.world = bpy.data.worlds.new("w")
    sc.world.light_settings.distance = 0.6
    out = []
    shapes = [((1.0, 0.8, 0.55), 0.35, 0.5), ((1.4, 1.0, 0.9), 0.3, 0.8), ((0.9, 0.9, 0.7), 0.45, 0.3),
              ((2.2, 1.5, 1.2), 0.3, 0.6), ((1.2, 0.6, 1.6), 0.25, 0.9), ((3.0, 2.2, 1.6), 0.28, 0.7)]
    for k, (sq, bump, facet) in enumerate(shapes):
        v, f = rock_blob(1.0, 5, 900 + k, squash=sq, bump=bump, freq=1.6, facet=facet)
        # fine fracture detail
        rgr = np.random.default_rng(k)
        for _ in range(6):
            d = rgr.normal(size=3)
            d /= np.linalg.norm(d)
            v += np.outer(np.abs(np.sin(v @ d * rgr.uniform(4, 9))) ** 4 * 0.02, d)
        v[:, 2] -= v[:, 2].min() * 0.85
        hi = mesh_object(f"rockhi{k}", v, f.tolist(), smooth=True)
        lv, lf = rock_blob(1.0, 2, 900 + k, squash=sq, bump=bump, freq=1.6, facet=facet)
        lv[:, 2] -= v[:, 2].min() * 0.0 + lv[:, 2].min() * 0.85
        lo = mesh_object(f"rock{k}_lod0", lv * 1.01, lf.tolist(), smooth=True)
        lo.location.x = hi.location.x = k * 8
        mat = bpy.data.materials.new(f"rock_mat{k}")
        lo.data.materials.append(mat)
        hi.data.materials.append(mat)
        select_only([lo])
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        imgN = new_image(f"rockN{k}", 512, data=True)
        bake(lo, [hi], imgN, "NORMAL", samples=4, extrusion=0.15, max_dist=0.4, margin=8)
        imgA = new_image(f"rockA{k}", 512, data=True)
        bake(lo, [hi], imgA, "AO", samples=24, extrusion=0.15, max_dist=0.4, margin=8)
        n = image_to_np(imgN)[..., :3]
        a = image_to_np(imgA)[..., 0]
        save_webp(np.concatenate([n[..., :2], a[..., None]], -1), os.path.join(OUT, f"rock{k}_nao.webp"), quality=90)
        bpy.data.objects.remove(hi)
        out.append(lo)
    for o in out:
        o.location.x = 0
        mat = o.data.materials[0]
        mat.name = "rock_" + o.name.split("_")[0]
    export_glb(out, os.path.join(OUT, "rocks.glb"), vcol=False)
    print("rocks", os.path.getsize(os.path.join(OUT, "rocks.glb")))


def logs():
    reset()
    out = []
    rgx = np.random.default_rng(11)
    for k in range(3):
        L = rgx.uniform(4, 7)
        r = rgx.uniform(0.2, 0.35)
        pts = [np.array([-L / 2 + t * L, 0.08 * math.sin(t * 4 + k), r * 0.9]) for t in np.linspace(0, 1, 10)]
        v, f, uv, c = tube(pts, np.linspace(r, r * 0.8, 10), sides=12, uv_v_scale=0.6, uv_u_repeat=2, cap=True,
                           noise=lambda i, s: 0.05 * math.sin(s * 2.1 + i * 1.3))
        me = bpy.data.meshes.new(f"log{k}")
        me.from_pydata([tuple(p) for p in v], [], [tuple(t) for t in f])
        uvl = me.uv_layers.new(name="UVMap")
        vi = np.zeros(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", vi)
        uvl.data.foreach_set("uv", np.asarray(uv)[vi].astype(np.float32).ravel())
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        ob = bpy.data.objects.new(f"log{k}_lod0", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(bpy.data.materials.get("bark_drift") or bpy.data.materials.new("bark_drift"))
        out.append(ob)
    export_glb(out, os.path.join(OUT, "logs.glb"), vcol=False)
    print("logs", os.path.getsize(os.path.join(OUT, "logs.glb")))


# ============================================================================ small items
def items():
    reset()
    orange = material("item_orange", (0.8, 0.22, 0.03), 0.5)
    dark = material("item_dark", (0.03, 0.03, 0.035), 0.4)
    metal = material("item_metal", (0.55, 0.55, 0.57), 0.3, metal=0.9)
    screen = material("item_screen", (0.05, 0.35, 0.3), 0.15, emit=((0.15, 0.85, 0.65), 3.0))
    yellow = material("item_yellow", (0.75, 0.6, 0.05), 0.5)
    objs = []
    # memo case on a stake with a ribbon
    m = [box("case", (0.24, 0.07, 0.17), (0, 0, 0.62), bevel=0.012, mat=orange), rod("stake", (0, 0.04, 0.0), (0, 0.04, 0.7), 0.01, metal)]
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((0, 0.04, 0.68), (0.05, 0.05, 0.4), (0.07, 0.06, 0.38), (0.02, 0.045, 0.66))]
    bm.faces.new(vs)
    m.append(bm_obj(bm, "ribbon", yellow))
    apply_all()
    objs.append(join(m, "memo"))
    # handheld survey scanner
    s = [box("scanbody", (0.17, 0.03, 0.11), (0, 0, 0), bevel=0.01, mat=dark), box("scanscreen", (0.13, 0.004, 0.08), (0, -0.016, 0.005), bevel=0.0, mat=screen),
         cyl("lens", 0.018, 0.02, (0.05, 0.02, 0.03), (d2r(90), 0, 0), mat=metal), box("grip", (0.04, 0.035, 0.06), (0, 0.0, -0.08), bevel=0.01, mat=orange)]
    apply_all()
    objs.append(join(s, "scanner"))
    # sound decoy (thrown)
    d = [cyl("decoy", 0.04, 0.12, (0, 0, 0.06), mat=yellow), cyl("decoycap", 0.042, 0.02, (0, 0, 0.13), mat=dark),
         ellipsoid("decoyled", (0.012, 0.012, 0.012), (0, 0, 0.145), mat=material("decoy_led", (1, 0.2, 0.1), 0.3, emit=((1, 0.2, 0.1), 6)))]
    apply_all()
    objs.append(join(d, "decoy"))
    # vibration sonar stake
    v = [rod("sonarstake", (0, 0, -0.1), (0, 0, 0.5), 0.015, metal), cyl("sonarhead", 0.06, 0.08, (0, 0, 0.52), mat=orange),
         ellipsoid("sonarled", (0.015, 0.015, 0.015), (0, -0.05, 0.53), mat=screen)]
    apply_all()
    objs.append(join(v, "sonar"))
    # first aid kit
    f = [box("aid", (0.22, 0.08, 0.15), (0, 0, 0.075), bevel=0.012, mat=material("aid_red", (0.6, 0.04, 0.03), 0.5)),
         box("aidx1", (0.08, 0.082, 0.025), (0, 0, 0.075), bevel=0.0, mat=material("aid_white", (0.85, 0.85, 0.85), 0.5)),
         box("aidx2", (0.025, 0.082, 0.08), (0, 0, 0.075), bevel=0.0, mat=material("aid_white2", (0.85, 0.85, 0.85), 0.5))]
    apply_all()
    objs.append(join(f, "aidkit"))
    export_glb(objs, os.path.join(OUT, "items.glb"), vcol=False)
    print("items", os.path.getsize(os.path.join(OUT, "items.glb")))


d2r = math.radians
ALL = {"helicopter": helicopter, "antenna": antenna, "camp": camp, "rocks": rocks, "logs": logs, "items": items}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("-")] or list(ALL)
    for n in names:
        ALL[n]()

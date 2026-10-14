"""Character-select portraits for the eight explorers (Blender, headless).

Each hero is built from primitives: a skin-modifier body in a hazmat suit (or
street clothes), helmet and visor or hood and mask, chest rig, pack, gloves,
boots and the hero's own weapon, then lit like a splash screen (key, coloured
rim, cool fill) and rendered with Cycles to a transparent knees-up cutout.

    blender -b --factory-startup -P tools/blender/heroes.py -- OUT_DIR [ids]

writes OUT_DIR/<id>.png (RGBA); pack them with
    python3 tools/blender/pack_heroes.py OUT_DIR noclip/assets/heroes
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------------------
# heroes: suit colour, accent (rim light / glow), gear and weapon
# ---------------------------------------------------------------------------
HEROES = {
    "minato": dict(suit=(0.62, 0.45, 0.08), accent=(1.0, 0.72, 0.25), head="helmet", weapon="rifle", pack="pack", rig="plates", extra=["grenades"]),
    "haruka": dict(suit=(0.75, 0.77, 0.74), accent=(0.35, 0.95, 0.65), head="helmet", weapon="smg", pack="medpack", rig="pouches", extra=["armband"]),
    "nanashi": dict(suit=(0.22, 0.24, 0.27), accent=(0.85, 0.8, 0.7), head="hood", weapon="pipe", pack="daypack", rig=None, extra=["jeans"], civil=True),
    "shino": dict(suit=(0.06, 0.08, 0.12), accent=(0.4, 0.6, 1.0), head="hoodgoggles", weapon="spistol", pack=None, rig="harness", extra=["scarf"]),
    "kagura": dict(suit=(0.75, 0.3, 0.05), accent=(1.0, 0.5, 0.2), head="hardhat", weapon="shotgun", pack="pack", rig="pouches", extra=["hammer"]),
    "rei": dict(suit=(0.36, 0.38, 0.42), accent=(0.75, 0.85, 1.0), head="helmetscope", weapon="sniper", pack=None, rig="harness", extra=["cloak"]),
    "yuzu": dict(suit=(0.42, 0.5, 0.12), accent=(0.75, 1.0, 0.3), head="gasmask", weapon="launcher", pack="tanks", rig="pouches", extra=[]),
    "gou": dict(suit=(0.2, 0.17, 0.3), accent=(0.66, 0.5, 1.0), head="heavy", weapon="lmg", pack="pack", rig="armor", extra=["shield"]),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = int(os.environ.get("HERO_SAMPLES", 96))
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = 720
    sc.render.resolution_y = 1080
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.012, 0.016, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0


# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
_mats = {}


def mat(name, col, rough=0.6, metal=0.0, emis=None, emis_k=0.0, bump=0.0, scale=40.0, grime=0.25, trans=0.0):
    key = (name, tuple(col), rough, metal, emis, emis_k, bump)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes["Principled BSDF"]
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if trans:
        bs.inputs["Transmission Weight"].default_value = trans
        bs.inputs["IOR"].default_value = 1.5
    if emis:
        bs.inputs["Emission Color"].default_value = (*emis, 1)
        bs.inputs["Emission Strength"].default_value = emis_k
    # grime: darker in noise blotches, lighter on edges is left to the light
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.0
    nz.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (1 - grime, 1 - grime * 0.95, 1 - grime * 1.1, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[6].default_value = (*col, 1)
    nt.links.new(ramp.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bs.inputs["Base Color"])
    if bump:
        # fabric weave / crumpled creases
        wv = nt.nodes.new("ShaderNodeTexNoise")
        wv.inputs["Scale"].default_value = scale
        wv.inputs["Detail"].default_value = 3.0
        wv.inputs["Distortion"].default_value = 0.6
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        nt.links.new(wv.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], bs.inputs["Normal"])
    _mats[key] = m
    return m


# ---------------------------------------------------------------------------
# primitives
# ---------------------------------------------------------------------------
def link(ob, m=None, smooth=True):
    bpy.context.scene.collection.objects.link(ob)
    if m:
        ob.data.materials.append(m)
    if smooth and ob.type == "MESH":
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def box(size, loc, m, rot=(0, 0, 0), bevel=0.01, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = size
    ob.data.materials.append(m)
    if bevel:
        b = ob.modifiers.new("b", "BEVEL")
        b.width = bevel
        b.segments = 3
    for p in ob.data.polygons:
        p.use_smooth = True
    parent and setattr(ob, "parent", parent)
    return ob


def cyl(r, h, loc, m, rot=(0, 0, 0), verts=24, r2=None, bevel=0.004):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.data.materials.append(m)
    if bevel:
        b = ob.modifiers.new("b", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = "ANGLE"
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def sphere(r, loc, m, scale=(1, 1, 1), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    ob = bpy.context.active_object
    ob.scale = scale
    ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def torus(R, r, loc, m, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=40, minor_segments=10, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = scale
    ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def tube(pts, r, m):
    cu = bpy.data.curves.new("c", "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    ob = bpy.data.objects.new("t", cu)
    ob.data.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def skin_body(nodes, edges, m, subd=2):
    """A smooth body from a skeleton of (position, (rx, ry)) nodes."""
    me = bpy.data.meshes.new("body")
    me.from_pydata([n[0] for n in nodes], edges, [])
    ob = bpy.data.objects.new("body", me)
    link(ob, m)
    sk = ob.modifiers.new("skin", "SKIN")
    sk.use_smooth_shade = True
    for i, n in enumerate(nodes):
        me.skin_vertices[0].data[i].radius = n[1]
    me.skin_vertices[0].data[0].use_root = True
    s = ob.modifiers.new("subd", "SUBSURF")
    s.levels = subd
    s.render_levels = subd
    return ob


# ---------------------------------------------------------------------------
# the explorer
# ---------------------------------------------------------------------------
def build(h):
    suit = mat("suit", h["suit"], 0.72, bump=0.55, scale=9, grime=0.32)
    dark = mat("rubber", (0.025, 0.025, 0.028), 0.55, bump=0.1, scale=80, grime=0.15)
    strap = mat("strap", (0.05, 0.05, 0.045), 0.8, bump=0.2, scale=120)
    metal = mat("metal", (0.35, 0.35, 0.37), 0.35, metal=1.0, grime=0.4)
    gun = mat("gun", (0.045, 0.045, 0.05), 0.42, metal=0.6, grime=0.3)
    glow = mat("glow", (0.05, 0.05, 0.05), 0.3, emis=h["accent"], emis_k=6.0)
    visor = mat("visor", (0.02, 0.025, 0.03), 0.05, metal=0.0, emis=tuple(c * 0.25 for c in h["accent"]), emis_k=1.2)
    acc = mat("acc", h["accent"], 0.5, grime=0.2)
    civil = h.get("civil")

    # ---- body (Z up, facing -Y; the hero's right hand is at -X)
    N = [
        ((0, 0, 1.0), (0.17, 0.13)),  # 0 pelvis
        ((0, 0.01, 1.22), (0.16, 0.12)),  # 1 waist
        ((0, 0.0, 1.42), (0.22, 0.14)),  # 2 chest
        ((0, 0.0, 1.57), (0.07, 0.07)),  # 3 neck
        ((-0.23, 0.01, 1.48), (0.075, 0.075)),  # 4 R shoulder
        ((-0.31, -0.02, 1.2), (0.058, 0.058)),  # 5 R elbow
        ((-0.16, -0.2, 1.06), (0.045, 0.045)),  # 6 R wrist (grip at the hip)
        ((0.23, 0.01, 1.48), (0.075, 0.075)),  # 7 L shoulder
        ((0.3, -0.16, 1.24), (0.058, 0.058)),  # 8 L elbow
        ((0.17, -0.27, 1.42), (0.045, 0.045)),  # 9 L wrist (fore-grip up by the shoulder)
        ((-0.11, 0, 0.95), (0.1, 0.1)),  # 10 R hip
        ((-0.13, -0.04, 0.53), (0.075, 0.075)),  # 11 R knee
        ((-0.14, 0.0, 0.1), (0.06, 0.06)),  # 12 R ankle
        ((0.11, 0, 0.95), (0.1, 0.1)),  # 13 L hip
        ((0.15, 0.03, 0.54), (0.075, 0.075)),  # 14 L knee
        ((0.17, 0.08, 0.1), (0.06, 0.06)),  # 15 L ankle
    ]
    E = [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5), (5, 6), (2, 7), (7, 8), (8, 9), (0, 10), (10, 11), (11, 12), (0, 13), (13, 14), (14, 15)]
    bulky = 1.2 if h["head"] == "heavy" else 1.0
    N = [(p, (r[0] * bulky, r[1] * bulky)) for p, r in N]
    skin_body(N, E, suit)
    if civil:
        # jeans below the hoodie
        jeans = mat("jeans", (0.08, 0.12, 0.2), 0.8, bump=0.3, scale=90)
        skin_body([N[0], N[10], N[11], N[12], N[13], N[14], N[15]], [(0, 1), (1, 2), (2, 3), (0, 4), (4, 5), (5, 6)], jeans)
    # gloves and boots
    for w, e in ((6, 5), (9, 8)):
        p = Vector(N[w][0])
        d = (p - Vector(N[e][0])).normalized()
        sphere(0.058, p + d * 0.04, dark, scale=(1, 1.15, 0.85))
        cyl(0.055, 0.08, p - d * 0.02, dark, rot=Vector((0, 0, 1)).rotation_difference(d).to_euler(), r2=0.06)
    for a in (12, 15):
        p = Vector(N[a][0])
        box((0.13, 0.26, 0.14), (p.x, p.y - 0.06, 0.07), dark, bevel=0.03)
        cyl(0.075, 0.2, (p.x, p.y, 0.2), dark)
    # cuffs, zip and seams
    for a, b in ((6, 5), (9, 8), (12, 11), (15, 14)):
        p = Vector(N[a][0])
        d = (Vector(N[b][0]) - p).normalized()
        c = p + d * (0.07 if a in (6, 9) else 0.16)
        torus(0.052 if a in (6, 9) else 0.068, 0.012, c, dark, rot=Vector((0, 0, 1)).rotation_difference(d).to_euler())
    if not civil:
        tube([(0.0, -0.205 * bulky, 1.55), (0.0, -0.215 * bulky, 1.4), (0.0, -0.19 * bulky, 1.22)], 0.008, dark)
        for x in (-1, 1):
            tube([(x * 0.13, -0.09, 1.56), (x * 0.2, 0.02, 1.58), (x * 0.24, 0.0, 1.38)], 0.007, dark)
    # knee pads, belt, collar seal
    if not civil:
        for k in (11, 14):
            p = Vector(N[k][0])
            sphere(0.075, (p.x, p.y - 0.06, p.z), dark, scale=(1, 0.6, 1.2))
    torus(0.18 * bulky, 0.025, (0, 0, 1.08), strap, scale=(1, 0.78, 1))
    box((0.07, 0.03, 0.06), (0, -0.15 * bulky, 1.08), metal, bevel=0.008)
    torus(0.085, 0.03, (0, 0, 1.57), dark)

    # ---- head
    hd = h["head"]
    hz = 1.73
    if hd in ("hood", "hoodgoggles"):
        hood = mat("hood", h["suit"], 0.85, bump=0.3, scale=60)
        sphere(0.135, (0, 0.0, hz), hood, scale=(1.0, 1.05, 1.18))
        sphere(0.118, (0, -0.035, hz - 0.01), mat("shadow", (0.006, 0.006, 0.007), 0.9), scale=(0.95, 0.9, 1.08))
        # mask over mouth and nose
        sphere(0.085, (0, -0.095, hz - 0.05), mat("mask", (0.7, 0.72, 0.74) if hd == "hood" else (0.03, 0.03, 0.035), 0.8, bump=0.2, scale=90), scale=(1, 0.55, 0.7))
        if hd == "hoodgoggles":
            for x in (-0.042, 0.042):
                cyl(0.03, 0.03, (x, -0.118, hz + 0.03), visor, rot=(math.pi / 2, 0, 0))
            torus(0.11, 0.008, (0, -0.02, hz + 0.03), strap, rot=(0, 0, 0), scale=(1.05, 1.0, 0.3))
        else:
            # glint of eyes in the dark of the hood
            for x in (-0.035, 0.035):
                sphere(0.008, (x, -0.11, hz + 0.03), mat("eye", (0.6, 0.6, 0.55), 0.2, emis=(0.6, 0.55, 0.45), emis_k=0.8))
    elif hd == "hardhat":
        sphere(0.13, (0, 0, hz), suit, scale=(1, 1.05, 1.1))
        vis = sphere(0.122, (0, -0.03, hz - 0.01), visor, scale=(1.02, 1.0, 0.9))
        hat = mat("hat", (0.85, 0.55, 0.05), 0.35, grime=0.35)
        sphere(0.15, (0, 0.0, hz + 0.06), hat, scale=(1.0, 1.1, 0.62))
        torus(0.16, 0.012, (0, -0.005, hz + 0.035), hat, scale=(1, 1.12, 1))
        cyl(0.05, 0.05, (0, -0.135, hz - 0.075), dark, rot=(math.pi / 2, 0, 0))
    else:
        # full hazmat helmet with a wraparound visor and respirator
        r = 0.15 if hd != "heavy" else 0.165
        sphere(r, (0, 0.0, hz), suit if hd != "heavy" else metal, scale=(1.0, 1.05, 1.08))
        sphere(r * 0.94, (0, -0.045, hz + 0.01), visor, scale=(0.98, 0.9, 0.72))
        # helmet lamps / status strips in the hero colour
        for x in (-1, 1):
            box((0.012, 0.06, 0.012), (x * r * 0.98, -0.02, hz + 0.04), glow, bevel=0.003)
        if hd == "gasmask":
            for x in (-1, 1):
                cyl(0.045, 0.07, (x * 0.065, -0.135, hz - 0.075), dark, rot=(math.pi / 2, 0, x * 0.5), r2=0.05)
        else:
            cyl(0.04, 0.05, (0, -0.15, hz - 0.08), dark, rot=(math.pi / 2, 0, 0))
        if hd == "helmetscope":
            cyl(0.018, 0.09, (0.1, -0.11, hz + 0.05), gun, rot=(math.pi / 2, 0, 0))
            sphere(0.019, (0.1, -0.157, hz + 0.05), glow)
        if hd == "heavy":
            box((0.36, 0.06, 0.08), (0, -0.05, hz - 0.12), metal, bevel=0.02)

    # ---- chest rig, pack
    rig = h.get("rig")
    if rig in ("plates", "armor"):
        k = 1.25 if rig == "armor" else 1.0
        box((0.34 * k, 0.07, 0.3 * k), (0, -0.14 * bulky, 1.36), mat("plate", tuple(c * 0.55 for c in h["suit"]), 0.6, bump=0.15, scale=70) if rig == "plates" else metal, bevel=0.02)
        for x in (-0.09, 0, 0.09):
            box((0.075, 0.05, 0.11), (x * k, -0.19 * bulky, 1.29), strap, bevel=0.01)
        if rig == "armor":
            for x in (-1, 1):
                sphere(0.13, (x * 0.27, -0.02, 1.5), metal, scale=(1.0, 1.1, 0.75))
    elif rig == "pouches":
        for x in (-0.12, -0.04, 0.04, 0.12):
            box((0.07, 0.05, 0.1), (x, -0.16, 1.24), strap, bevel=0.012)
        tube([(-0.2, -0.05, 1.5), (0.0, -0.17, 1.35), (0.2, -0.05, 1.12)], 0.018, strap)
    elif rig == "harness":
        tube([(-0.17, -0.06, 1.52), (-0.05, -0.16, 1.3), (0.05, -0.16, 1.15), (0.14, -0.08, 1.05)], 0.014, strap)
        tube([(0.17, -0.06, 1.52), (0.05, -0.16, 1.3), (-0.05, -0.16, 1.15)], 0.014, strap)
    pk = h.get("pack")
    if pk:
        if pk == "tanks":
            for x in (-0.08, 0.08):
                cyl(0.075, 0.5, (x, 0.2, 1.33), mat("tank", (0.5, 0.52, 0.2), 0.4, metal=0.6), r2=0.075)
                sphere(0.075, (x, 0.2, 1.58), metal)
        else:
            sz = {"pack": (0.34, 0.18, 0.42), "medpack": (0.32, 0.16, 0.36), "daypack": (0.3, 0.14, 0.38)}[pk]
            col = {"pack": tuple(c * 0.45 for c in h["suit"]), "medpack": (0.8, 0.8, 0.78), "daypack": (0.08, 0.09, 0.1)}[pk]
            box(sz, (0, 0.22, 1.32), mat("pack", col, 0.75, bump=0.25, scale=70), bevel=0.04)
            if pk == "medpack":
                box((0.1, 0.01, 0.03), (0, 0.13, 1.42), mat("cross", (0.85, 0.08, 0.06), 0.5), bevel=0.0)
                box((0.03, 0.01, 0.1), (0, 0.13, 1.42), mat("cross", (0.85, 0.08, 0.06), 0.5), bevel=0.0)
        for x in (-0.12, 0.12):
            tube([(x, 0.1, 1.52), (x * 1.1, -0.12, 1.46), (x * 1.05, -0.15, 1.25)], 0.018, strap)
    for e in h.get("extra", []):
        if e == "armband":
            torus(0.07, 0.022, N[4][0][:2] + (1.36,), acc, rot=(0, 0.3, 0))
            box((0.05, 0.005, 0.015), (-0.25, -0.07, 1.36), mat("cross", (0.85, 0.08, 0.06), 0.5), bevel=0)
        if e == "grenades":
            for x in (0.09, 0.16):
                sphere(0.035, (x, -0.17, 1.14), mat("nade", (0.15, 0.18, 0.1), 0.5))
        if e == "scarf":
            tube([(-0.09, -0.05, 1.56), (0.0, -0.11, 1.53), (0.09, -0.05, 1.56), (0.14, 0.05, 1.45), (0.16, 0.1, 1.2)], 0.035, mat("scarf", (0.12, 0.14, 0.2), 0.9, bump=0.3, scale=60))
        if e == "cloak":
            tube([(-0.2, 0.06, 1.55), (-0.25, 0.14, 1.2), (-0.27, 0.16, 0.8)], 0.05, mat("cloak", (0.22, 0.24, 0.2), 0.95, bump=0.4, scale=40))
            tube([(0.2, 0.06, 1.55), (0.25, 0.14, 1.2), (0.27, 0.16, 0.8)], 0.05, mat("cloak", (0.22, 0.24, 0.2), 0.95, bump=0.4, scale=40))
        if e == "hammer":
            tube([(-0.12, 0.28, 0.85), (0.1, 0.26, 1.35), (0.22, 0.24, 1.7)], 0.017, mat("handle", (0.3, 0.18, 0.08), 0.6))
            box((0.1, 0.1, 0.22), (0.24, 0.24, 1.76), metal, rot=(0, 0.6, 0), bevel=0.01)
        if e == "shield":
            box((0.04, 0.5, 0.75), (0.36, -0.12, 1.15), metal, rot=(0, 0, -0.35), bevel=0.02)
            box((0.045, 0.2, 0.06), (0.37, -0.12, 1.38), visor, rot=(0, 0, -0.35), bevel=0.005)

    # ---- weapon, held across the body from the right hand to the left
    weapon(h["weapon"], Vector(N[6][0]), Vector(N[9][0]), gun, metal, dark, glow)
    # a little colour on the suit: shoulder patch + chest stripe
    if not civil:
        box((0.06, 0.005, 0.04), (0.235, -0.02, 1.4), acc, rot=(0, 0, -0.5), bevel=0.0)


def weapon(kind, rh, lh, gun, metal, dark, glow):
    """Build the weapon in its own frame (X along the barrel) and place it."""
    parts = []
    G = lambda *a, **k: parts.append(box(*a, **k))  # noqa: E731
    C = lambda *a, **k: parts.append(cyl(*a, **k))  # noqa: E731
    ry = (0, math.pi / 2, 0)
    if kind == "rifle":
        G((0.42, 0.05, 0.09), (0.1, 0, 0), gun)
        C(0.014, 0.42, (0.5, 0, 0.015), metal, rot=ry)
        G((0.22, 0.05, 0.075), (-0.24, 0, -0.02), gun)
        G((0.05, 0.035, 0.16), (0.05, 0, -0.11), gun, rot=(0, 0.25, 0))
        G((0.035, 0.04, 0.1), (-0.06, 0, -0.08), dark, rot=(0, -0.3, 0))
        G((0.2, 0.06, 0.06), (0.32, 0, 0.0), dark)
        C(0.022, 0.12, (0.1, 0, 0.08), gun, rot=ry)
        G((0.02, 0.01, 0.012), (0.17, 0, 0.1), glow, bevel=0)
    elif kind == "smg":
        G((0.3, 0.05, 0.1), (0.05, 0, 0), gun)
        C(0.016, 0.16, (0.28, 0, 0.02), metal, rot=ry)
        G((0.04, 0.035, 0.18), (0.04, 0, -0.13), gun)
        G((0.035, 0.04, 0.1), (-0.06, 0, -0.08), dark, rot=(0, -0.3, 0))
        G((0.16, 0.03, 0.04), (-0.18, 0, 0.0), metal)
    elif kind == "pipe":
        C(0.022, 0.9, (0.15, 0, 0), metal, rot=ry)
        C(0.03, 0.06, (0.6, 0, 0), metal, rot=ry)
    elif kind == "spistol":
        G((0.17, 0.03, 0.04), (0.02, 0, 0.0), gun)
        C(0.018, 0.17, (0.2, 0, 0.0), gun, rot=ry)
        G((0.035, 0.03, 0.09), (-0.03, 0, -0.06), dark, rot=(0, -0.25, 0))
    elif kind == "shotgun":
        G((0.3, 0.05, 0.08), (0.05, 0, 0), gun)
        C(0.018, 0.55, (0.45, 0, 0.02), metal, rot=ry)
        C(0.016, 0.45, (0.4, 0, -0.025), metal, rot=ry)
        G((0.15, 0.06, 0.05), (0.32, 0, -0.03), mat("wood", (0.25, 0.13, 0.06), 0.5))
        G((0.26, 0.05, 0.08), (-0.25, 0, -0.03), mat("wood", (0.25, 0.13, 0.06), 0.5), rot=(0, 0.1, 0))
    elif kind == "sniper":
        G((0.45, 0.05, 0.08), (0.05, 0, 0), gun)
        C(0.014, 0.6, (0.6, 0, 0.015), metal, rot=ry)
        C(0.025, 0.3, (0.05, 0, 0.09), gun, rot=ry)
        C(0.03, 0.03, (0.21, 0, 0.09), gun, rot=ry)
        G((0.3, 0.05, 0.1), (-0.32, 0, -0.03), gun)
        G((0.04, 0.035, 0.08), (0.1, 0, -0.08), dark)
    elif kind == "launcher":
        C(0.06, 0.55, (0.15, 0, 0.02), gun, rot=ry)
        C(0.09, 0.14, (0.0, 0, -0.04), metal, rot=ry, verts=6)
        G((0.04, 0.035, 0.11), (-0.06, 0, -0.1), dark, rot=(0, -0.3, 0))
        G((0.24, 0.05, 0.06), (-0.25, 0, -0.02), gun)
        G((0.03, 0.012, 0.012), (0.3, 0, 0.09), glow, bevel=0)
    elif kind == "lmg":
        G((0.5, 0.07, 0.11), (0.1, 0, 0), gun)
        C(0.02, 0.5, (0.6, 0, 0.02), metal, rot=ry)
        G((0.12, 0.12, 0.12), (0.05, 0.0, -0.13), mat("ammo", (0.18, 0.2, 0.12), 0.6))
        G((0.25, 0.06, 0.09), (-0.28, 0, -0.02), gun)
        G((0.035, 0.04, 0.1), (-0.06, 0, -0.08), dark, rot=(0, -0.3, 0))
        C(0.03, 0.24, (0.1, 0, 0.1), gun, rot=ry)
    # place: grip at the right hand, barrel pointing through the left hand
    d = (lh - rh).normalized()
    up = Vector((0, 0, 1))
    side = d.cross(up).normalized()
    nup = side.cross(d).normalized()
    rot = Matrix((d, -side, nup)).transposed().to_4x4()
    M = Matrix.Translation(rh + d * 0.06) @ rot @ Matrix.Scale(1.15, 4)
    bpy.context.view_layer.update()
    for ob in parts:
        ob.matrix_world = M @ ob.matrix_world


def lights_and_camera(accent):
    sc = bpy.context.scene

    def area(name, loc, rot, size, energy, col):
        L = bpy.data.lights.new(name, "AREA")
        L.size = size
        L.energy = energy
        L.color = col
        ob = bpy.data.objects.new(name, L)
        ob.location = loc
        ob.rotation_euler = rot
        sc.collection.objects.link(ob)
        return ob

    def aim(ob, target=(0, 0, 1.25)):
        d = Vector(target) - ob.location
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    aim(area("key", (-1.7, -2.0, 2.6), (0, 0, 0), 1.4, 200, (1.0, 0.93, 0.84)))
    aim(area("rim", (1.4, 1.5, 2.2), (0, 0, 0), 1.0, 650, accent))
    aim(area("rim2", (-1.3, 1.4, 1.6), (0, 0, 0), 0.7, 300, accent))
    aim(area("top", (0.0, 0.3, 3.2), (0, 0, 0), 0.8, 90, (1.0, 1.0, 1.0)))
    aim(area("fill", (1.8, -2.4, 0.7), (0, 0, 0), 2.0, 25, (0.55, 0.65, 1.0)))
    cam = bpy.data.cameras.new("cam")
    cam.lens = 52
    ob = bpy.data.objects.new("cam", cam)
    ob.location = (0.65, -3.6, 0.82)
    sc.collection.objects.link(ob)
    aim(ob, (0.0, 0, 1.12))
    sc.camera = ob


def run(out, ids):
    os.makedirs(out, exist_ok=True)
    for hid in ids:
        h = HEROES[hid]
        reset()
        _mats.clear()
        build(h)
        # a slight three-quarter turn and lean, like a splash pose
        root = bpy.data.objects.new("root", None)
        bpy.context.scene.collection.objects.link(root)
        for ob in list(bpy.context.scene.objects):
            if ob.type in ("MESH", "CURVE") and ob.parent is None:
                ob.parent = root
        root.rotation_euler = Euler((0, 0, -0.32), "XYZ")
        # the floor only catches the shadow (it stays transparent)
        bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
        bpy.context.active_object.is_shadow_catcher = True
        lights_and_camera(h["accent"])
        bpy.context.scene.render.filepath = os.path.join(out, hid + ".png")
        bpy.ops.render.render(write_still=True)
        print(f"[hero] {hid}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = argv[0] if argv else "heroes_out"
    ids = argv[1].split(",") if len(argv) > 1 else list(HEROES)
    run(out, ids)

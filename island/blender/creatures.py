"""Island fauna. Each creature: skeleton-graph body + rigid detail parts, rig, animations.

  ヤシガニ   crab      coconut crab (shore)
  カツオドリ booby     brown booby (seabird)
  オオトカゲ monitor   monitor lizard (jungle)
  デンクイ   denkui    antenna-eating giant phasmid (jungle / mire), senses radio emissions
  ヌマカクシ numa      six-legged ambush predator lurking in the mire
  クロハミ   kurohami  eyeless ridge hunter that tracks sound
  心核       heart     the organism at the bottom of the caldera

  python island/blender/creatures.py [names...] [--preview]
"""
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import join, reset, select_only
from creaturelib import (OUT, Node, action, armature, attach_rigid, auto_weights, bake_ao, bm_obj, cone, d2r, ellipsoid,
                         export, material, mirror, preview, region_materials, skin_body, skin_textures, unwrap)
from plantlib import tube

HERE = os.path.dirname(os.path.abspath(__file__))


def finish(name, body, parts, rig, anims, prev_cam=None):
    """parts: list of (object, bone). Weights the body automatically and the parts rigidly,
    merges everything into one skinned mesh, bakes AO over the merged mesh, animates, exports."""
    auto_weights(body, rig)
    for m in list(body.modifiers):
        if m.type == "ARMATURE":
            body.modifiers.remove(m)
    mw = body.matrix_world.copy()
    body.parent = None
    body.matrix_world = mw
    for ob, bone in parts:
        vg = ob.vertex_groups.new(name=bone)
        vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    merged = join([body] + [o for o, _ in parts], f"{name}_body") if parts else body
    merged.name = f"{name}_body"
    unwrap([merged])
    bake_ao(name, merged, dist=0.2 if name not in ("crab",) else 0.05)
    merged.parent = rig
    mod = merged.modifiers.new("arm", "ARMATURE")
    mod.object = rig
    for an, frames, fn in anims:
        action(rig, an, frames, fn)
    meshes = [merged]
    if prev_cam and "--preview" in sys.argv:
        rig.animation_data.action = bpy.data.actions[anims[0][0]]
        bpy.context.scene.frame_set(int(anims[0][1] * 0.3) + 1)
        preview(meshes, os.path.join(HERE, f".{name}_preview.png"), prev_cam[0], prev_cam[1], lens=prev_cam[2] if len(prev_cam) > 2 else 50)
        rig.animation_data.action = None
    export(name, rig, meshes)


def legs_chain(prefix, pts, radii, parent, up=(0, 0, 1)):
    nodes = []
    prev = parent
    for i, (p, r) in enumerate(zip(pts, radii)):
        nm = f"{prefix}{i}.L"
        nodes.append(Node(nm, p, r, prev, up))
        prev = nm
    return nodes


# ============================================================================ coconut crab
def crab():
    reset()
    shell = material("crab_shell", (0.2, 0.05, 0.035), 0.55, coat=0.12)
    joint = material("crab_joint", (0.32, 0.17, 0.12), 0.6)
    dark = material("crab_dark", (0.03, 0.02, 0.02), 0.3)
    nodes = [Node("body", (0, 0, 0.13), (0.06, 0.05), None, root=True),
             Node("abdomen", (0, 0.13, 0.08), (0.055, 0.05), "body")]
    side = []
    # cheliped (claw arm) - left larger
    side += legs_chain("claw", [(0.07, -0.07, 0.13), (0.15, -0.15, 0.15), (0.2, -0.23, 0.11)], [0.022, 0.026, 0.03], "body")
    for i in range(4):
        y0 = -0.04 + i * 0.045
        side += legs_chain(f"leg{i}", [(0.07, y0, 0.12), (0.21, y0 + 0.02 * i - 0.03, 0.21), (0.3, y0 + 0.05 * i - 0.05, 0.11),
                                       (0.36, y0 + 0.08 * i - 0.07, 0.0)], [0.016, 0.017, 0.013, 0.006], "body")
    side += [Node("stalk.L", (0.025, -0.1, 0.17), 0.006, "body"), Node("ant0.L", (0.04, -0.2, 0.2), 0.004, "stalk.L"),
             Node("ant1.L", (0.1, -0.38, 0.22), 0.002, "ant0.L")]
    nodes += side + mirror(side)
    body = skin_body("crab_body", nodes, subdiv=1, smooth=0.3)
    region_materials(body, [joint, shell], lambda c, n: 1 if n.z > -0.2 else 0)
    rig = armature("crab_rig", nodes)
    parts = []

    def carapace(v):
        g = 1 - 0.18 * math.exp(-((v.x) / 0.15) ** 2) * (1 if v.z > 0 else 0)  # central groove
        return Vector((v.x * g, v.y, v.z * (1 + 0.15 * v.y)))
    parts.append((ellipsoid("carapace", (0.105, 0.135, 0.065), (0, -0.005, 0.15), mat=shell, disp=carapace), "body"))
    parts.append((ellipsoid("abd", (0.085, 0.1, 0.06), (0, 0.13, 0.08), (d2r(-20), 0, 0), mat=joint), "abdomen"))
    for sx, big in ((1, 1.35), (-1, 1.0)):
        s = "L" if sx > 0 else "R"
        # chela: palm + fixed finger + dactyl
        parts.append((ellipsoid(f"palm{s}", (0.04 * big, 0.06 * big, 0.035 * big), (sx * 0.21, -0.27, 0.105), (0, 0, sx * 0.4), mat=shell), f"claw2.{s}"))
        parts.append((cone(f"fing{s}", 0.022 * big, 0.003, 0.08 * big, (sx * 0.23, -0.31, 0.09), (sx * 0.2, -1, -0.1), mat=dark), f"claw2.{s}"))
        parts.append((cone(f"dact{s}", 0.018 * big, 0.003, 0.08 * big, (sx * 0.23, -0.31, 0.12), (sx * 0.25, -1, 0.15), mat=dark), f"claw2.{s}"))
        parts.append((ellipsoid(f"eye{s}", (0.012, 0.012, 0.012), (sx * 0.026, -0.105, 0.18), mat=dark), f"stalk.{s}"))
    skin_textures("crab", "chitin", seed=11)

    def walk(t, speed=1.0):
        p = 2 * math.pi * t
        pose = {"body": (0, 0, d2r(4 * math.sin(2 * p))), "body:loc": (0, 0, 0.01 * math.sin(2 * p))}
        for i in range(4):
            for s, sg in (("L", 1), ("R", -1)):
                ph = p + (math.pi if (i + (s == "R")) % 2 else 0)
                swing = math.sin(ph) * 22 * speed
                lift = max(0.0, math.cos(ph)) * 22 * speed
                pose[f"leg{i}1.{s}"] = (d2r(lift), 0, d2r(swing * sg))
                pose[f"leg{i}2.{s}"] = (d2r(-lift * 0.6), 0, 0)
        for s, sg in (("L", 1), ("R", -1)):
            pose[f"claw1.{s}"] = (d2r(10 + 5 * math.sin(p)), 0, d2r(5 * sg * math.sin(p)))
            pose[f"ant1.{s}"] = (d2r(8 * math.sin(p * 3 + sg)), 0, d2r(10 * math.sin(p * 2)))
        return pose

    def idle(t):
        p = 2 * math.pi * t
        pose = {}
        for s, sg in (("L", 1), ("R", -1)):
            pose[f"ant0.{s}"] = (d2r(10 * math.sin(p * 2 + sg)), 0, d2r(15 * math.sin(p * 3)))
            pose[f"claw1.{s}"] = (d2r(6 * math.sin(p + sg)), 0, 0)
        return pose

    def threat(t):
        p = 2 * math.pi * t
        pose = {"body": (d2r(-12), 0, 0), "body:loc": (0, 0, 0.04)}
        for s, sg in (("L", 1), ("R", -1)):
            pose[f"claw0.{s}"] = (d2r(55), 0, d2r(-20 * sg))
            pose[f"claw1.{s}"] = (d2r(30 + 10 * math.sin(p * 2)), 0, d2r(10 * sg))
        return pose

    finish("crab", body, parts, rig, [("walk", 20, walk), ("idle", 60, idle), ("threat", 30, threat),
                                       ("run", 12, lambda t: walk(t, 1.4))], ((0.6, -0.9, 0.5), (0, 0, 0.1), 50))


# ============================================================================ brown booby
def booby():
    reset()
    dark = material("booby_dark", (0.06, 0.045, 0.03), 0.6)
    white = material("booby_white", (0.75, 0.74, 0.7), 0.6)
    bill = material("booby_bill", (0.75, 0.62, 0.25), 0.35)
    eye = material("booby_eye", (0.02, 0.02, 0.02), 0.1)
    nodes = [Node("body", (0, 0.05, 0), (0.1, 0.09), None, root=True), Node("chest", (0, -0.15, 0.01), (0.105, 0.1), "body"),
             Node("neck", (0, -0.3, 0.04), (0.06, 0.06), "chest"), Node("head", (0, -0.4, 0.05), (0.05, 0.048), "neck"),
             Node("tail", (0, 0.28, 0.0), (0.05, 0.03), "body"), Node("tailtip", (0, 0.42, -0.01), (0.03, 0.01), "tail")]
    wing = [Node("wing0.L", (0.08, -0.12, 0.03), 0.03, "chest"), Node("wing1.L", (0.3, -0.08, 0.05), 0.02, "wing0.L"),
            Node("wing2.L", (0.52, -0.03, 0.04), 0.015, "wing1.L"), Node("wing3.L", (0.78, 0.06, 0.02), 0.01, "wing2.L")]
    for n in wing:
        n.skin = False
    nodes += wing + mirror(wing)
    body = skin_body("booby_body", [n for n in nodes if n.skin], subdiv=2, smooth=0.6)
    region_materials(body, [dark, white], lambda c, n: 1 if (c.z < -0.02 and c.y < 0.15 and c.y > -0.3) else 0)
    rig = armature("booby_rig", nodes)
    parts = []
    parts.append((cone("bill", 0.03, 0.004, 0.16, (0, -0.43, 0.045), (0, -1, -0.12), seg=12, mat=bill), "head"))
    for sx in (1, -1):
        parts.append((ellipsoid(f"eye{sx}", (0.009, 0.009, 0.009), (sx * 0.035, -0.42, 0.07), mat=eye), "head"))
    # wings: planform slabs weighted to the wing bones
    for sx, s in ((1, "L"), (-1, "R")):
        span = [0.06, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8]
        lead = [(-0.13, 0.03), (-0.1, 0.05), (-0.07, 0.05), (-0.04, 0.045), (-0.01, 0.04), (0.04, 0.03), (0.1, 0.02)]
        trail = [0.12, 0.14, 0.14, 0.13, 0.12, 0.13, 0.12]
        bm = bmesh.new()
        top, bot = [], []
        for x, (ly, z), tr in zip(span, lead, trail):
            for k in range(5):
                f = k / 4
                y = ly + (tr - ly) * f
                th = 0.012 * math.sin(math.pi * min(f * 1.4, 1)) * (1 - x)
                top.append(bm.verts.new((sx * x, y, z + th)))
                bot.append(bm.verts.new((sx * x, y, z - th * 0.5)))
        n = 5
        for i in range(len(span) - 1):
            for k in range(n - 1):
                a, b, c, d = i * n + k, i * n + k + 1, (i + 1) * n + k, (i + 1) * n + k + 1
                if sx > 0:
                    bm.faces.new((top[a], top[c], top[d], top[b]))
                    bm.faces.new((bot[a], bot[b], bot[d], bot[c]))
                else:
                    bm.faces.new((top[a], top[b], top[d], top[c]))
                    bm.faces.new((bot[a], bot[c], bot[d], bot[b]))
        w = bm_obj(bm, f"wing{s}", dark)
        parts.append((w, f"wing{s}"))
    skin_textures("booby", "feather", seed=21)

    # wings are skinned by distance to their bones; everything is merged into one mesh
    def finish_bird():
        auto_weights(body, rig)
        for m in list(body.modifiers):
            if m.type == "ARMATURE":
                body.modifiers.remove(m)
        body.parent = None
        others = []
        for ob, s in parts:
            if s.startswith("wing"):
                side = s[-1]
                bones = [b for b in rig.data.bones if b.name.startswith("wing") and b.name.endswith(side)]
                groups = {b.name: ob.vertex_groups.new(name=b.name) for b in bones}
                for v in ob.data.vertices:
                    p = v.co
                    ws = []
                    for b in bones:
                        a, c = b.head_local, b.tail_local
                        ab = c - a
                        tt = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
                        d = (a + ab * tt - p).length
                        ws.append((1 / (d + 0.02) ** 3, b.name))
                    tot = sum(x for x, _ in ws)
                    for x, nm in ws:
                        if x / tot > 0.02:
                            groups[nm].add([v.index], x / tot, "REPLACE")
            else:
                vg = ob.vertex_groups.new(name=s)
                vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
            others.append(ob)
        merged = join([body] + others, "booby_body")
        unwrap([merged])
        bake_ao("booby", merged, dist=0.1)
        merged.parent = rig
        m = merged.modifiers.new("arm", "ARMATURE")
        m.object = rig
        meshes = [merged]

        def flap(t):
            p = 2 * math.pi * t
            pose = {"body:loc": (0, 0, -0.03 * math.sin(p))}
            for s, sg in (("L", 1), ("R", -1)):
                pose[f"wing0.{s}"] = (d2r(38 * math.sin(p)), 0, 0)
                pose[f"wing1.{s}"] = (d2r(12 * math.sin(p - 0.5)), 0, 0)
                pose[f"wing2.{s}"] = (d2r(18 * math.sin(p - 1.0)), d2r(10 * math.cos(p)), 0)
            pose["head"] = (d2r(-4 * math.sin(p)), 0, 0)
            return pose

        def glide(t):
            p = 2 * math.pi * t
            pose = {}
            for s, sg in (("L", 1), ("R", -1)):
                pose[f"wing0.{s}"] = (d2r(4 + 2 * math.sin(p)), 0, 0)
                pose[f"wing2.{s}"] = (d2r(-6 + 3 * math.sin(p + sg)), 0, 0)
            pose["tail"] = (d2r(3 * math.sin(p * 2)), 0, d2r(5 * math.sin(p)))
            pose["head"] = (0, 0, d2r(8 * math.sin(p)))
            return pose

        action(rig, "flap", 16, flap)
        action(rig, "glide", 60, glide)
        if "--preview" in sys.argv:
            rig.animation_data.action = bpy.data.actions["glide"]
            bpy.context.scene.frame_set(1)
            preview(meshes, os.path.join(HERE, ".booby_preview.png"), (1.2, -1.6, 1.0), (0, 0, 0))
            rig.animation_data.action = None
        export("booby", rig, meshes)
    finish_bird()


# ============================================================================ monitor lizard
def monitor():
    reset()
    skin = material("monitor_skin", (0.07, 0.065, 0.045), 0.55)
    belly = material("monitor_belly", (0.2, 0.18, 0.11), 0.6)
    dark = material("monitor_eye", (0.05, 0.03, 0.01), 0.1)
    pink = material("monitor_tongue", (0.35, 0.08, 0.12), 0.3)
    spine = [("mid", (0, -0.1, 0.18), (0.1, 0.075), None), ("chest", (0, -0.38, 0.17), (0.085, 0.07), "mid"),
             ("neck", (0, -0.6, 0.17), (0.055, 0.05), "chest"), ("head", (0, -0.76, 0.16), (0.05, 0.042), "neck"),
             ("snout", (0, -0.94, 0.13), (0.028, 0.022), "head"), ("pelvis", (0, 0.15, 0.17), (0.085, 0.07), "mid"),
             ("tail0", (0, 0.42, 0.14), (0.06, 0.055), "pelvis"), ("tail1", (0, 0.72, 0.1), (0.04, 0.04), "tail0"),
             ("tail2", (0, 1.02, 0.06), (0.025, 0.025), "tail1"), ("tail3", (0, 1.34, 0.03), (0.01, 0.01), "tail2")]
    nodes = [Node(n, p, r, par, root=(n == "mid")) for n, p, r, par in spine]
    side = []
    for nm, y0, par in (("front", -0.38, "chest"), ("hind", 0.15, "pelvis")):
        side += [Node(f"{nm}0.L", (0.08, y0, 0.15), 0.03, par), Node(f"{nm}1.L", (0.22, y0 + 0.02, 0.13), 0.026, f"{nm}0.L"),
                 Node(f"{nm}2.L", (0.25, y0 - 0.04, 0.03), 0.02, f"{nm}1.L"), Node(f"{nm}3.L", (0.28, y0 - 0.11, 0.008), 0.012, f"{nm}2.L")]
    nodes += side + mirror(side)
    body = skin_body("monitor_body", nodes, subdiv=2, smooth=0.5)
    region_materials(body, [skin, belly], lambda c, n: 1 if n.z < -0.6 else 0)
    rig = armature("monitor_rig", nodes)
    parts = []
    for sx in (1, -1):
        parts.append((ellipsoid(f"eye{sx}", (0.011, 0.011, 0.011), (sx * 0.035, -0.8, 0.185), mat=dark), "head"))
        for leg in ("front", "hind"):
            for k in range(4):
                a = (k - 1.5) * 0.35
                base = Vector((sx * 0.28, (-0.49 if leg == "front" else 0.04), 0.008))
                parts.append((cone(f"claw{leg}{k}{sx}", 0.006, 0.001, 0.035, base, (math.sin(a) * sx * 0.5, -1, -0.2), seg=6, mat=dark),
                              f"{leg}3.{'L' if sx > 0 else 'R'}"))
    parts.append((cone("tongue", 0.005, 0.002, 0.12, (0, -0.96, 0.12), (0, -1, -0.05), seg=6, mat=pink), "snout"))
    skin_textures("monitor", "scales", seed=31)

    def walk(t, run=1.0):
        p = 2 * math.pi * t
        pose = {}
        und = 10 * run
        pose["mid"] = (0, 0, d2r(und * math.sin(p)))
        pose["chest"] = (0, 0, d2r(-und * 0.8 * math.sin(p)))
        pose["neck"] = (0, 0, d2r(-und * 0.5 * math.sin(p)))
        pose["pelvis"] = (0, 0, d2r(-und * 0.6 * math.sin(p)))
        for i, k in enumerate((1.0, 1.4, 1.8, 2.2)):
            pose[f"tail{i}"] = (0, 0, d2r(und * k * math.sin(p - 0.8 * (i + 1))))
        for leg, ph0 in (("front", 0.0), ("hind", math.pi)):
            for s, sg, ph1 in (("L", 1, 0.0), ("R", -1, math.pi)):
                ph = p + ph0 + ph1
                pose[f"{leg}0.{s}"] = (d2r(max(0, math.cos(ph)) * 25 * run), 0, d2r(30 * run * math.sin(ph) * sg))
                pose[f"{leg}1.{s}"] = (d2r(-max(0, math.cos(ph)) * 20), 0, 0)
        return pose

    def idle(t):
        p = 2 * math.pi * t
        pose = {"head": (d2r(5 * math.sin(p)), 0, d2r(12 * math.sin(p * 0.5))), "neck": (d2r(3 * math.sin(p)), 0, d2r(6 * math.sin(p * 0.5)))}
        for i in range(4):
            pose[f"tail{i}"] = (0, 0, d2r(4 * math.sin(p * 0.5 - i)))
        return pose

    finish("monitor", body, parts, rig, [("walk", 30, walk), ("idle", 90, idle), ("run", 16, lambda t: walk(t, 1.5))],
           ((1.5, -2.2, 1.2), (0, -0.1, 0.1), 50))


# ============================================================================ denkui (antenna eater)
def denkui():
    reset()
    bark = material("denkui_bark", (0.13, 0.11, 0.07), 0.75)
    moss = material("denkui_moss", (0.08, 0.11, 0.04), 0.8)
    eye = material("denkui_eye", (0.15, 0.2, 0.18), 0.1, coat=1.0)
    glow = material("denkui_glow", (0.4, 0.7, 1.0), 0.3, emit=((0.4, 0.75, 1.0), 4.0))
    spine = [("thorax", (0, 0.05, 1.55), (0.07, 0.06), None), ("abd0", (0, 0.5, 1.4), (0.08, 0.07), "thorax"),
             ("abd1", (0, 0.95, 1.25), (0.065, 0.055), "abd0"), ("abd2", (0, 1.3, 1.18), (0.03, 0.03), "abd1"),
             ("pro", (0, -0.4, 1.86), (0.05, 0.045), "thorax"), ("neck", (0, -0.58, 2.02), (0.032, 0.03), "pro"),
             ("head", (0, -0.72, 2.06), (0.06, 0.04), "neck")]
    nodes = [Node(n, p, r, par, root=(n == "thorax")) for n, p, r, par in spine]
    side = []
    for nm, y0, par in (("hind", 0.12, "thorax"), ("mid", -0.15, "thorax")):
        sp = 1.0 if nm == "hind" else 0.85
        side += [Node(f"{nm}0.L", (0.06, y0, 1.52), 0.03, par), Node(f"{nm}1.L", (0.55 * sp, y0 + 0.25 * sp, 1.95), 0.026, f"{nm}0.L"),
                 Node(f"{nm}2.L", (0.95 * sp, y0 + 0.5 * sp, 0.55), 0.018, f"{nm}1.L"),
                 Node(f"{nm}3.L", (1.0 * sp, y0 + 0.55 * sp, 0.0), 0.01, f"{nm}2.L")]
    side += [Node("rap0.L", (0.06, -0.42, 1.8), 0.03, "pro"), Node("rap1.L", (0.16, -0.78, 1.62), 0.035, "rap0.L"),
             Node("rap2.L", (0.12, -0.6, 1.36), 0.022, "rap1.L"), Node("rap3.L", (0.1, -0.72, 1.3), 0.012, "rap2.L"),
             Node("ant0.L", (0.05, -0.85, 2.2), 0.008, "head"), Node("ant1.L", (0.25, -1.3, 2.65), 0.006, "ant0.L"),
             Node("ant2.L", (0.45, -1.75, 2.8), 0.004, "ant1.L")]
    nodes += side + mirror(side)
    body = skin_body("denkui_body", nodes, subdiv=1, smooth=0.4)
    region_materials(body, [bark, moss], lambda c, n: 1 if (n.z > 0.5 and c.z > 1.2) else 0)
    rig = armature("denkui_rig", nodes)
    parts = []
    for sx in (1, -1):
        s = "L" if sx > 0 else "R"
        parts.append((ellipsoid(f"eye{s}", (0.03, 0.035, 0.035), (sx * 0.055, -0.74, 2.08), mat=eye), "head"))
        for k in range(6):
            q = Vector((sx * 0.14, -0.66 - k * 0.025, 1.6 - k * 0.04))
            parts.append((cone(f"spine{s}{k}", 0.008, 0.001, 0.06, q, (0, 0.3, 1), seg=5, mat=bark), f"rap1.{s}"))
        parts.append((ellipsoid(f"antTip{s}", (0.02, 0.02, 0.02), (sx * 0.45, -1.75, 2.8), mat=glow), f"ant2.{s}"))
        # leaf-like camouflage flaps on the abdomen
        for k in range(3):
            parts.append((ellipsoid(f"flap{s}{k}", (0.09, 0.14, 0.01), (sx * 0.08, 0.45 + k * 0.25, 1.42 - k * 0.07),
                                    (d2r(15), d2r(sx * 35), 0), mat=moss), f"abd{min(k, 1)}"))
    parts.append((ellipsoid("headplate", (0.075, 0.06, 0.03), (0, -0.7, 2.08), mat=bark), "head"))
    skin_textures("denkui", "chitin", seed=41)

    def sway(t):
        p = 2 * math.pi * t
        pose = {"thorax": (d2r(2 * math.sin(p)), 0, d2r(4 * math.sin(p * 0.5))), "thorax:loc": (0.04 * math.sin(p * 0.5), 0, 0.02 * math.sin(p))}
        pose["head"] = (d2r(6 * math.sin(p)), 0, d2r(10 * math.sin(p * 0.5 + 1)))
        for s, sg in (("L", 1), ("R", -1)):
            pose[f"ant0.{s}"] = (d2r(10 * math.sin(p * 2 + sg)), 0, d2r(12 * math.sin(p * 1.5)))
            pose[f"ant1.{s}"] = (d2r(8 * math.sin(p * 3 + sg)), 0, 0)
            pose[f"rap1.{s}"] = (d2r(4 * math.sin(p + sg)), 0, 0)
        return pose

    def walk(t):
        p = 2 * math.pi * t
        pose = sway(t)
        pose["thorax:loc"] = (0, 0, 0.03 * math.sin(2 * p))
        for leg, ph0 in (("hind", 0.0), ("mid", math.pi)):
            for s, sg, ph1 in (("L", 1, 0.0), ("R", -1, math.pi)):
                ph = p + ph0 + ph1
                pose[f"{leg}0.{s}"] = (d2r(max(0, math.cos(ph)) * 14), 0, d2r(18 * math.sin(ph) * sg))
                pose[f"{leg}1.{s}"] = (d2r(-max(0, math.cos(ph)) * 10), 0, 0)
        return pose

    def strike(t):
        k = math.sin(math.pi * min(1, t * 2)) if t < 0.5 else math.sin(math.pi * 0.5) * (1 - (t - 0.5) * 2) ** 2
        pose = sway(0)
        pose["pro"] = (d2r(-18 * k), 0, 0)
        pose["thorax"] = (d2r(-8 * k), 0, 0)
        for s in ("L", "R"):
            pose[f"rap0.{s}"] = (d2r(-50 * k), 0, 0)
            pose[f"rap1.{s}"] = (d2r(70 * k), 0, 0)
            pose[f"rap2.{s}"] = (d2r(40 * k), 0, 0)
        return pose

    def feed(t):
        p = 2 * math.pi * t
        pose = sway(t)
        pose["pro"] = (d2r(20), 0, 0)
        pose["neck"] = (d2r(15 + 8 * math.sin(p * 4)), 0, 0)
        for s, ph in (("L", 0), ("R", math.pi)):
            pose[f"rap1.{s}"] = (d2r(35 + 15 * math.sin(p * 4 + ph)), 0, 0)
            pose[f"rap2.{s}"] = (d2r(30 + 20 * math.sin(p * 4 + ph)), 0, 0)
        return pose

    finish("denkui", body, parts, rig, [("idle", 90, sway), ("walk", 50, walk), ("strike", 24, strike), ("feed", 40, feed)],
           ((2.6, -3.6, 2.0), (0, 0, 1.3), 40))


# ============================================================================ numakakushi (mire ambusher)
def numa():
    reset()
    hide = material("numa_hide", (0.055, 0.06, 0.035), 0.5, coat=0.3)
    belly = material("numa_belly", (0.16, 0.15, 0.1), 0.55)
    dark = material("numa_dark", (0.02, 0.02, 0.015), 0.2)
    tooth = material("numa_tooth", (0.55, 0.5, 0.38), 0.4)
    eye = material("numa_eye", (0.5, 0.4, 0.05), 0.1, coat=1.0)
    spine = [("mid", (0, 0.0, 0.3), (0.32, 0.18), None), ("chest", (0, -0.6, 0.3), (0.28, 0.17), "mid"),
             ("neck", (0, -1.05, 0.28), (0.18, 0.12), "chest"), ("head", (0, -1.4, 0.26), (0.15, 0.09), "neck"),
             ("snout", (0, -1.95, 0.2), (0.07, 0.05), "head"), ("jaw", (0, -1.85, 0.12), (0.06, 0.03), "head"),
             ("pelvis", (0, 0.6, 0.28), (0.26, 0.16), "mid"), ("tail0", (0, 1.15, 0.24), (0.18, 0.13), "pelvis"),
             ("tail1", (0, 1.75, 0.18), (0.12, 0.08), "tail0"), ("tail2", (0, 2.35, 0.12), (0.07, 0.04), "tail1"),
             ("tail3", (0, 2.9, 0.08), (0.02, 0.02), "tail2")]
    nodes = [Node(n, p, r, par, root=(n == "mid")) for n, p, r, par in spine]
    side = []
    for nm, y0, par in (("front", -0.6, "chest"), ("midl", 0.0, "mid"), ("hind", 0.6, "pelvis")):
        side += [Node(f"{nm}0.L", (0.25, y0, 0.26), 0.07, par), Node(f"{nm}1.L", (0.55, y0 + 0.02, 0.22), 0.06, f"{nm}0.L"),
                 Node(f"{nm}2.L", (0.6, y0 - 0.08, 0.04), 0.045, f"{nm}1.L"), Node(f"{nm}3.L", (0.66, y0 - 0.2, 0.01), 0.03, f"{nm}2.L")]
    nodes += side + mirror(side)
    body = skin_body("numa_body", [n for n in nodes if n.name != "jaw"], subdiv=2, smooth=0.5)
    region_materials(body, [hide, belly], lambda c, n: 1 if n.z < -0.55 else 0)
    rig = armature("numa_rig", nodes)
    parts = []
    # lower jaw
    parts.append((ellipsoid("jawm", (0.13, 0.42, 0.045), (0, -1.65, 0.13), mat=hide), "jaw"))
    for sx in (1, -1):
        s = "L" if sx > 0 else "R"
        parts.append((ellipsoid(f"eye{s}", (0.035, 0.04, 0.03), (sx * 0.09, -1.35, 0.36), mat=eye), "head"))
        parts.append((ellipsoid(f"brow{s}", (0.05, 0.07, 0.035), (sx * 0.09, -1.33, 0.34), mat=hide), "head"))
        for k in range(9):
            y = -1.92 + k * 0.07
            parts.append((cone(f"tooth{s}{k}", 0.012, 0.001, 0.05, (sx * (0.06 + k * 0.009), y, 0.17), (sx * 0.1, 0, -1), seg=5, mat=tooth), "head"))
    # osteoderm rows (scutes) along the back and tail
    rgx = np.random.default_rng(5)
    for k in range(26):
        y = -0.9 + k * 0.14
        z = 0.3 + 0.12 * math.exp(-((y - 0.0) / 1.2) ** 2) + (0.0 if y < 1.0 else -0.04 * (y - 1.0))
        width = 0.22 * math.exp(-((y - 0.1) / 1.6) ** 2) + 0.03
        bone = "neck" if y < -0.8 else "chest" if y < -0.3 else "mid" if y < 0.3 else "pelvis" if y < 0.9 else "tail0" if y < 1.45 else "tail1" if y < 2.05 else "tail2"
        for c in ((-width, 0), (0, 0.03), (width, 0)):
            if width < 0.08 and c[0] != 0:
                continue
            sc = rgx.uniform(0.8, 1.15)
            b = ellipsoid(f"scute{k}{c[0]:.2f}", (0.045 * sc, 0.055 * sc, 0.03 * sc), (c[0], y, z + c[1]), seg=(10, 6), mat=hide)
            parts.append((b, bone))
    skin_textures("numa", "hide", seed=51)

    def idle(t):
        p = 2 * math.pi * t
        pose = {"mid:loc": (0, 0, 0.01 * math.sin(p)), "mid": (d2r(1 * math.sin(p)), 0, 0)}
        for i in range(4):
            pose[f"tail{i}"] = (0, 0, d2r(3 * math.sin(p * 0.5 - i * 0.7)))
        return pose

    def swim(t):
        p = 2 * math.pi * t
        pose = {}
        for i, k in enumerate((10, 16, 22, 28)):
            pose[f"tail{i}"] = (0, 0, d2r(k * math.sin(p - i * 0.9)))
        pose["mid"] = (0, 0, d2r(4 * math.sin(p + 1)))
        pose["chest"] = (0, 0, d2r(-4 * math.sin(p + 1)))
        for leg in ("front", "midl", "hind"):
            for s, sg in (("L", 1), ("R", -1)):
                pose[f"{leg}0.{s}"] = (d2r(-10), 0, d2r(45 * sg))   # legs tucked back
        return pose

    def lunge(t):
        k = math.sin(math.pi * min(1.0, t * 1.8))
        pose = idle(0)
        pose["mid:loc"] = (0, -0.9 * k, 0.15 * k)
        pose["neck"] = (d2r(20 * k), 0, 0)
        pose["head"] = (d2r(15 * k), 0, 0)
        pose["jaw"] = (d2r(-45 * k), 0, 0)
        for leg in ("front", "midl", "hind"):
            for s in ("L", "R"):
                pose[f"{leg}1.{s}"] = (d2r(25 * k), 0, 0)
        return pose

    def walk(t):
        p = 2 * math.pi * t
        pose = {}
        pose["mid"] = (0, 0, d2r(7 * math.sin(p)))
        for i in range(4):
            pose[f"tail{i}"] = (0, 0, d2r((8 + 4 * i) * math.sin(p - 0.8 * (i + 1))))
        for leg, ph0 in (("front", 0.0), ("midl", math.pi), ("hind", 0.0)):
            for s, sg, ph1 in (("L", 1, 0.0), ("R", -1, math.pi)):
                ph = p + ph0 + ph1
                pose[f"{leg}0.{s}"] = (d2r(max(0, math.cos(ph)) * 18), 0, d2r(25 * math.sin(ph) * sg))
        return pose

    finish("numa", body, parts, rig, [("idle", 90, idle), ("swim", 40, swim), ("lunge", 20, lunge), ("walk", 40, walk)],
           ((3.0, -4.5, 2.4), (0, -0.2, 0.2), 45))


# ============================================================================ kurohami (ridge hunter)
def kurohami():
    reset()
    hide = material("kuro_hide", (0.018, 0.02, 0.026), 0.32, coat=0.6)
    frill = material("kuro_frill", (0.09, 0.03, 0.04), 0.45)
    tooth = material("kuro_tooth", (0.62, 0.6, 0.55), 0.3)
    spine = [("back", (0, 0.05, 1.0), (0.17, 0.15), None), ("shoulders", (0, -0.38, 1.05), (0.17, 0.17), "back"),
             ("neck", (0, -0.65, 1.0), (0.09, 0.1), "shoulders"), ("head", (0, -0.88, 0.86), (0.09, 0.1), "neck"),
             ("snout", (0, -1.12, 0.74), (0.045, 0.05), "head"), ("hips", (0, 0.45, 0.98), (0.15, 0.14), "back"),
             ("tail0", (0, 0.82, 0.92), (0.06, 0.06), "hips"), ("tail1", (0, 1.25, 0.78), (0.04, 0.04), "tail0"),
             ("tail2", (0, 1.7, 0.62), (0.015, 0.015), "tail1")]
    nodes = [Node(n, p, r, par, root=(n == "back")) for n, p, r, par in spine]
    side = [Node("fl0.L", (0.14, -0.38, 0.92), 0.075, "shoulders"), Node("fl1.L", (0.16, -0.27, 0.55), 0.05, "fl0.L"),
            Node("fl2.L", (0.15, -0.38, 0.18), 0.035, "fl1.L"), Node("fl3.L", (0.15, -0.46, 0.02), 0.03, "fl2.L"),
            Node("hl0.L", (0.15, 0.45, 0.9), 0.09, "hips"), Node("hl1.L", (0.17, 0.22, 0.56), 0.06, "hl0.L"),
            Node("hl2.L", (0.16, 0.55, 0.25), 0.035, "hl1.L"), Node("hl3.L", (0.16, 0.45, 0.02), 0.03, "hl2.L")]
    nodes += side + mirror(side)
    body = skin_body("kuro_body", nodes, subdiv=2, smooth=0.6)
    region_materials(body, [hide], lambda c, n: 0)
    rig = armature("kuro_rig", nodes)
    parts = []
    for sx in (1, -1):
        s = "L" if sx > 0 else "R"
        # big sound-gathering frills instead of eyes
        parts.append((ellipsoid(f"frill{s}", (0.015, 0.16, 0.2), (sx * 0.13, -0.82, 0.98), (d2r(-25), 0, d2r(sx * 20)), mat=frill), "head"))
        for k in range(7):
            y = -1.08 + k * 0.035
            parts.append((cone(f"tooth{s}{k}", 0.008, 0.001, 0.045, (sx * (0.03 + k * 0.006), y, 0.7), (0, -0.2, -1), seg=5, mat=tooth), "head"))
    for k in range(12):
        y = -0.5 + k * 0.17
        h = 0.06 + 0.05 * math.sin(k / 11 * math.pi)
        bone = "shoulders" if y < -0.2 else "back" if y < 0.25 else "hips" if y < 0.65 else "tail0"
        z = 1.17 if y < 0.7 else 1.05 - (y - 0.7) * 0.4
        parts.append((cone(f"ridge{k}", 0.025, 0.002, h, (0, y, z), (0, 0.35, 1), seg=6, mat=hide), bone))
    skin_textures("kurohami", "hide", seed=61)

    def gait(t, run=False):
        p = 2 * math.pi * t
        pose = {"back:loc": (0, 0, (0.05 if run else 0.015) * math.sin(2 * p))}
        pose["shoulders"] = (d2r((6 if run else 2) * math.sin(p)), 0, 0)
        pose["hips"] = (d2r(-(6 if run else 2) * math.sin(p)), 0, 0)
        pose["neck"] = (d2r(-10 if not run else -18), 0, d2r(0 if run else 14 * math.sin(p * 0.5)))
        pose["head"] = (d2r(-5), 0, d2r(0 if run else 10 * math.sin(p * 0.5)))
        A = 38 if run else 22
        for leg, ph0 in (("fl", 0.0), ("hl", math.pi * (0.25 if run else 1.0))):
            for s, ph1 in (("L", 0.0), ("R", math.pi * (0.15 if run else 1.0))):
                ph = p + ph0 + ph1
                pose[f"{leg}0.{s}"] = (d2r(A * math.sin(ph)), 0, 0)
                pose[f"{leg}1.{s}"] = (d2r(-max(0, math.cos(ph)) * A * 0.9), 0, 0)
                pose[f"{leg}2.{s}"] = (d2r(max(0, math.cos(ph + 0.5)) * A * 0.6), 0, 0)
        for i in range(3):
            pose[f"tail{i}"] = (d2r(4 * math.sin(p - i)), 0, d2r((6 + 4 * i) * math.sin(p * 0.5 - i)))
        return pose

    def listen(t):
        p = 2 * math.pi * t
        pose = {"neck": (d2r(10), 0, d2r(25 * math.sin(p * 0.5))), "head": (d2r(5), d2r(18 * math.sin(p)), d2r(10 * math.sin(p * 0.5)))}
        for i in range(3):
            pose[f"tail{i}"] = (0, 0, d2r(3 * math.sin(p - i)))
        return pose

    def pounce(t):
        k = math.sin(math.pi * min(1.0, t * 1.6))
        pose = gait(0, True)
        pose["back:loc"] = (0, -0.6 * k, 0.25 * k)
        pose["neck"] = (d2r(-25 * k), 0, 0)
        pose["head"] = (d2r(20 * k), 0, 0)
        for s in ("L", "R"):
            pose[f"fl0.{s}"] = (d2r(55 * k), 0, 0)
            pose[f"hl0.{s}"] = (d2r(-40 * k), 0, 0)
        return pose

    finish("kurohami", body, parts, rig, [("walk", 36, gait), ("run", 18, lambda t: gait(t, True)), ("listen", 80, listen),
                                          ("pounce", 20, pounce)], ((2.4, -3.2, 1.8), (0, 0, 0.8), 45))


# ============================================================================ the Heart
def heart():
    reset()
    rg = np.random.default_rng(71)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1.0)
    blobs = [(Vector(rg.normal(0, 1, 3)).normalized(), rg.uniform(0.25, 0.6), rg.uniform(0.1, 0.35)) for _ in range(28)]
    col_layer = bm.verts.layers.float_color.new("Col")
    for v in bm.verts:
        d = v.co.copy()
        r = 1.0
        for c, w, a in blobs:
            r += a * math.exp(-((d - c).length / w) ** 2)
        # ribs / folds
        r += 0.04 * math.sin(d.z * 18 + d.x * 6) + 0.025 * math.sin(d.x * 31 + d.y * 23)
        v.co = Vector((d.x * r * 9.5, d.y * r * 8.5, max(d.z * r * 7.5, -2.0)))
    # glow veins: thin bands of a sinusoidal network
    for v in bm.verts:
        p = v.co / 9.0
        vein = abs(math.sin(p.x * 7 + math.sin(p.y * 5) * 2)) * abs(math.sin(p.y * 6 + math.sin(p.z * 4) * 2))
        g = max(0.0, 1 - vein * 7)
        v[col_layer] = (g, g, g, 1)
    ob = bm_obj(bm, "heart_core")
    # convert loop colours to point colours via attribute (bmesh float_color is per-vertex)
    flesh = material("heart_flesh", (0.1, 0.03, 0.05), 0.35, coat=0.8)
    ob.data.materials.append(flesh)
    # tendrils down to the crater floor
    parts = [ob]
    for k in range(16):
        a = k / 16 * 2 * math.pi + rg.uniform(-0.2, 0.2)
        r0 = rg.uniform(6, 9)
        pts = [np.array([math.cos(a) * r0, math.sin(a) * r0, rg.uniform(-1, 2)])]
        for s in range(1, 8):
            rr = r0 + s * rg.uniform(2.5, 4.0)
            pts.append(np.array([math.cos(a + s * 0.05) * rr, math.sin(a + s * 0.05) * rr, max(-1.5, 1.5 - s * 0.6)]))
        v, f, uv, c = tube(pts, np.linspace(1.2, 0.2, len(pts)), sides=10)
        me = bpy.data.meshes.new(f"tendril{k}")
        me.from_pydata([tuple(p) for p in v], [], [tuple(t) for t in f])
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        to = bpy.data.objects.new(f"tendril{k}", me)
        bpy.context.scene.collection.objects.link(to)
        to.data.materials.append(flesh)
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        for i in range(len(me.vertices)):
            ca.data[i].color = (0.15, 0.15, 0.15, 1)
        parts.append(to)
    allm = join(parts, "heart")
    unwrap([allm])
    skin_textures("heart", "hide", seed=81)
    from lib import export_glb
    export_glb([allm], os.path.join(OUT, "heart.glb"), vcol=True)
    print("heart", os.path.getsize(os.path.join(OUT, "heart.glb")))


ALL = {"crab": crab, "booby": booby, "monitor": monitor, "denkui": denkui, "numa": numa, "kurohami": kurohami, "heart": heart}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("-")] or list(ALL)
    for n in names:
        ALL[n]()

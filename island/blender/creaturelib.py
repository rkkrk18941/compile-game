"""Creature building blocks: a node tree becomes a skin-modifier body and a matching
armature (one bone per node, from its parent), automatic weights, rigid detail parts
attached to bones, procedural keyframe animation and GLB export."""
import math
import os

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

from lib import ASSETS, apply_modifiers, fft_noise, image_to_np, join, new_image, save_webp, select_only, linear_to_srgb
from plantlib import normal_from_height

OUT = os.path.join(ASSETS, "creatures")
os.makedirs(OUT, exist_ok=True)


class Node:
    def __init__(self, name, pos, r, parent=None, up=(0, 0, 1), skin=True, root=False):
        self.name = name
        self.pos = Vector(pos)
        self.r = r if isinstance(r, (tuple, list)) else (r, r)
        self.parent = parent
        self.up = Vector(up)
        self.skin = skin
        self.root = root


def mirror(nodes, suffix_from=".L", suffix_to=".R"):
    out = []
    for n in nodes:
        if n.name.endswith(suffix_from):
            p = n.parent.replace(suffix_from, suffix_to) if n.parent and n.parent.endswith(suffix_from) else n.parent
            out.append(Node(n.name.replace(suffix_from, suffix_to), (-n.pos.x, n.pos.y, n.pos.z), n.r, p, n.up, n.skin))
    return out


def skin_body(name, nodes, subdiv=2, smooth=0.5):
    idx = {n.name: i for i, n in enumerate(nodes)}
    verts = [tuple(n.pos) for n in nodes]
    edges = [(idx[n.parent], idx[n.name]) for n in nodes if n.parent and n.skin and nodes[idx[n.parent]].skin]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new("skin", "SKIN")
    sk.branch_smoothing = smooth
    sk.use_smooth_shade = True
    for i, sv in enumerate(me.skin_vertices[0].data):
        sv.radius = nodes[i].r
        if nodes[i].root:
            sv.use_root = True
    if subdiv:
        sub = ob.modifiers.new("sub", "SUBSURF")
        sub.levels = subdiv
    apply_modifiers(ob)
    # remove loose verts of non-skin nodes
    return ob


def armature(name, nodes):
    arm = bpy.data.armatures.new(name)
    ao = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    pos = {n.name: n.pos for n in nodes}
    bones = {}
    root = arm.edit_bones.new("root")
    root.head = (0, 0, 0)
    root.tail = (0, -0.2, 0)
    bones["root"] = root
    for n in nodes:
        if n.parent is None:
            b = arm.edit_bones.new(n.name)
            b.head = n.pos
            b.tail = n.pos + Vector((0, -0.1, 0))
            b.parent = root
            bones[n.name] = b
    for n in nodes:
        if n.parent is None:
            continue
        b = arm.edit_bones.new(n.name)
        b.head = pos[n.parent]
        b.tail = n.pos
        if (b.tail - b.head).length < 1e-4:
            b.tail = b.head + Vector((0, 0, 0.02))
        b.align_roll(n.up)
        bones[n.name] = b
    for n in nodes:
        if n.parent is None:
            continue
        parent_bone = None
        # the bone ending at the parent node is the parent bone
        par = next((m for m in nodes if m.name == n.parent), None)
        if par is not None:
            parent_bone = bones.get(par.name)
        bones[n.name].parent = parent_bone
        bones[n.name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return ao


def auto_weights(body, rig):
    select_only([body, rig], rig)
    with bpy.context.temp_override(active_object=rig, selected_objects=[body, rig], selected_editable_objects=[body, rig]):
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def attach_rigid(ob, rig, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    ob.parent = rig
    m = ob.modifiers.new("arm", "ARMATURE")
    m.object = rig


def bm_obj(bm, name, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def ellipsoid(name, r, loc, rot=(0, 0, 0), seg=(24, 16), mat=None, disp=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
    for v in bm.verts:
        c = v.co.copy()
        if disp:
            c = disp(c)
        v.co = Vector((c.x * r[0], c.y * r[1], c.z * r[2]))
    ob = bm_obj(bm, name, mat)
    ob.matrix_world = Matrix.LocRotScale(Vector(loc), Euler(rot), Vector((1, 1, 1)))
    return ob


def cone(name, r1, r2, h, loc, direction, seg=10, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    ob = bm_obj(bm, name, mat)
    d = Vector(direction).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d)
    ob.matrix_world = Matrix.LocRotScale(Vector(loc), q, Vector((1, 1, 1)))
    return ob


def bake_world():
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.parent is None:
            o.data.transform(o.matrix_world)
            o.matrix_world = Matrix.Identity(4)


def material(name, color, rough=0.6, metal=0.0, coat=0.0, sss=0.0, emit=None):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    return m


def region_materials(ob, mats, fn):
    """Assign per-face materials: fn(center: Vector, normal: Vector) -> index into mats."""
    for m in mats:
        ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.material_index = fn(p.center, p.normal)


# ----------------------------------------------------------------------------- textures
def skin_textures(name, kind, n=512, seed=1):
    """Tileable detail maps: 'scales', 'chitin', 'hide', 'feather'. Albedo is a light
    multiplier (colour comes from the material)."""
    from lib import worley
    us = np.arange(n) / n
    U, V = np.meshgrid(us, us)
    if kind == "scales":
        f1, f2, cid = worley(n, 900, seed)
        cell = np.clip((f2 - f1) * 30, 0, 1)
        h = cell ** 0.5 * 0.8 + 0.15 * fft_noise(n, 2.0, seed + 1)
        alb = 0.75 + 0.25 * cell + 0.15 * fft_noise(n, 2.4, seed + 2)
        alb = alb * (0.85 + 0.3 * ((cid * 7919 % 13) / 13.0))
    elif kind == "chitin":
        f1, f2, _ = worley(n, 120, seed)
        h = 0.3 * np.clip((f2 - f1) * 12, 0, 1) + 0.5 * fft_noise(n, 3.0, seed + 1) + 0.1 * fft_noise(n, 0.6, seed + 2)
        alb = 0.8 + 0.25 * fft_noise(n, 2.8, seed + 3) + 0.1 * fft_noise(n, 1.0, seed + 4)
    elif kind == "hide":
        f1, f2, _ = worley(n, 400, seed)
        h = 0.4 * np.clip((f2 - f1) * 20, 0, 1) + 0.4 * fft_noise(n, 2.4, seed + 1) + 0.2 * fft_noise(n, 0.8, seed + 2)
        alb = 0.8 + 0.2 * fft_noise(n, 2.6, seed + 3)
    elif kind == "feather":
        barbs = np.abs(np.sin(2 * np.pi * (U * 60 + V * 8 + fft_noise(n, 3.0, seed) * 2))) ** 0.5
        rows = np.abs(np.sin(2 * np.pi * (V * 10 + fft_noise(n, 3.2, seed + 1) * 0.6))) ** 3
        h = 0.5 * barbs + 0.5 * rows
        alb = 0.8 + 0.15 * barbs + 0.1 * rows
    else:
        raise ValueError(kind)
    alb = np.clip(alb, 0, 1.2) / 1.2
    save_webp(np.repeat(alb[..., None], 3, -1), os.path.join(OUT, f"{name}_detail.webp"), quality=86)
    save_webp(normal_from_height(h, 2.0), os.path.join(OUT, f"{name}_normal.webp"), quality=86)


def unwrap(objs):
    for o in objs:
        select_only([o])
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
        bpy.ops.object.mode_set(mode="OBJECT")


def bake_ao(name, ob, dist=0.15, size=512):
    sc = bpy.context.scene
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    sc.world.light_settings.distance = dist
    im = new_image(f"ao_{name}", size, data=True)
    for m in ob.data.materials:
        nt = m.node_tree
        node = nt.nodes.new("ShaderNodeTexImage")
        node.name = "__bake__"
        node.image = im
        nt.nodes.active = node
    select_only([ob])
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 32
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.margin = 6
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.bake(type="AO")
    ao = image_to_np(im)[..., 0]
    save_webp(np.repeat(ao[..., None], 3, -1), os.path.join(OUT, f"ao_{name}.webp"), quality=84)
    for m in ob.data.materials:
        n = m.node_tree.nodes.get("__bake__")
        if n:
            m.node_tree.nodes.remove(n)


# ----------------------------------------------------------------------------- animation
def keyframe(rig, frame, pose):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        r = pose.get(pb.name, (0, 0, 0))
        pb.rotation_euler = Euler(r, "XYZ")
        pb.keyframe_insert("rotation_euler", frame=frame)
        loc = pose.get(pb.name + ":loc")
        if pb.name in ("root",) or loc is not None:
            pb.location = Vector(loc or (0, 0, 0))
            pb.keyframe_insert("location", frame=frame)


def action(rig, name, frames, fn):
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    for f in range(frames + 1):
        keyframe(rig, f + 1, fn(f / frames))
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    rig.animation_data.action = None


def export(name, rig, meshes):
    from lib import ensure_uv_export
    ensure_uv_export(meshes)
    objs = [rig] + meshes
    select_only(objs, rig)
    path = os.path.join(OUT, f"{name}.glb")
    with bpy.context.temp_override(selected_objects=objs, active_object=rig):
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                                  export_animations=True, export_animation_mode="ACTIONS", export_yup=True,
                                  export_skins=True, export_texcoords=True, export_normals=True,
                                  export_materials="EXPORT", export_vertex_color="NONE", export_image_format="NONE")
    print(name, os.path.getsize(path))


def preview(meshes, path, cam, target, lens=50, res=(640, 480)):
    from plantlib import preview_render
    preview_render(meshes, path, cam, target, lens=lens, res=res, samples=32)


d2r = math.radians

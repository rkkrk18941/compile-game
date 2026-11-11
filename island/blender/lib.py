"""Shared helpers for The Island asset scripts (Blender 5.2, bpy module)."""
import math
import os
import random

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
BUILD = os.path.join(HERE, ".build")
os.makedirs(BUILD, exist_ok=True)


# ----------------------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = False
    sc.unit_settings.system = "METRIC"
    return sc


def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def mesh_object(name, verts, faces, uvs=None, smooth=True, colors=None, coll=None):
    """verts: Nx3, faces: list of index tuples, uvs: per-loop list or per-vertex Nx2,
    colors: per-vertex Nx4 (stored as a 'Col' color attribute)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    if uvs is not None:
        uv = me.uv_layers.new(name="UVMap")
        uvs = np.asarray(uvs)
        if len(uvs) == len(verts):
            vi = np.zeros(len(me.loops), dtype=np.int64)
            me.loops.foreach_get("vertex_index", vi)
            uv.data.foreach_set("uv", uvs[vi].astype(np.float32).ravel())
        else:
            uv.data.foreach_set("uv", uvs.astype(np.float32).ravel())
    if colors is not None:
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        ca.data.foreach_set("color", np.asarray(colors, dtype=np.float32).ravel())
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    return ob


def bm_to_object(bm, name, coll=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    return ob


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def join(objs, name):
    """Join objects into one (keeps materials)."""
    objs = [o for o in objs if o is not None]
    ctx = bpy.context
    for o in ctx.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    with ctx.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def select_only(objs, active=None):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def apply_transform(ob):
    me = ob.data
    me.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)


def bake_transform_all():
    for ob in list(bpy.context.scene.objects):
        if ob.type == "MESH" and ob.parent is None:
            apply_transform(ob)


# ----------------------------------------------------------------------------- materials
def principled(name, color=(0.5, 0.5, 0.5), rough=0.8, metal=0.0, vcol=None, spec=0.5):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    if vcol:
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = vcol
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = (*color, 1)
        nt.links.new(a.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m


def image_material(name, albedo=None, normal=None, rough_img=None, rough=0.8, alpha=False, metal=0.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if albedo is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = albedo
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    if normal is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal
        normal.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if rough_img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = rough_img
        rough_img.colorspace_settings.name = "Non-Color"
        nt.links.new(t.outputs["Color"], b.inputs["Roughness"])
    return m


def set_material(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# ----------------------------------------------------------------------------- noise (numpy, periodic)
def fft_noise(n, beta=2.0, seed=0, lo=1.0):
    """Perfectly tileable fractal noise in [-1, 1] by spectral synthesis."""
    r = np.random.default_rng(seed)
    kx = np.fft.fftfreq(n)[None, :]
    ky = np.fft.fftfreq(n)[:, None]
    k = np.sqrt(kx * kx + ky * ky) * n
    k[0, 0] = 1
    amp = 1.0 / np.power(np.maximum(k, lo), beta / 2.0 + 1.0)
    amp[0, 0] = 0
    ph = r.random((n, n)) * 2 * np.pi
    spec = amp * np.exp(1j * ph)
    f = np.real(np.fft.ifft2(spec))
    f -= f.mean()
    return f / (np.abs(f).max() + 1e-9)


def worley(n, count, seed=0, jitter=1.0):
    """Tileable cellular noise: returns (F1, F2, cell id) on an n x n grid in [0,1) units."""
    r = np.random.default_rng(seed)
    pts = r.random((count, 2))
    ys, xs = np.mgrid[0:n, 0:n] / n
    f1 = np.full((n, n), 9.0)
    f2 = np.full((n, n), 9.0)
    cid = np.zeros((n, n), dtype=np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xs - px)
        dy = np.abs(ys - py)
        dx = np.minimum(dx, 1 - dx)
        dy = np.minimum(dy, 1 - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        cid = np.where(closer, i, cid)
        f1 = np.where(closer, d, f1)
    return f1, f2, cid


def sample_periodic(field, u, v):
    """Bilinear sample of a periodic field at fractional coords u, v in [0,1)."""
    n = field.shape[0]
    x = (u % 1.0) * n
    y = (v % 1.0) * n
    x0 = np.floor(x).astype(int) % n
    y0 = np.floor(y).astype(int) % n
    x1 = (x0 + 1) % n
    y1 = (y0 + 1) % n
    tx = x - np.floor(x)
    ty = y - np.floor(y)
    return (field[y0, x0] * (1 - tx) * (1 - ty) + field[y0, x1] * tx * (1 - ty) +
            field[y1, x0] * (1 - tx) * ty + field[y1, x1] * tx * ty)


# ----------------------------------------------------------------------------- images
def new_image(name, size, data=False, alpha=False, w=None, h=None):
    img = bpy.data.images.new(name, w or size, h or size, alpha=alpha, float_buffer=data)
    if data:
        img.colorspace_settings.name = "Non-Color"
    return img


def image_to_np(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def save_webp(arr, path, quality=88, lossless=False):
    """arr: HxWx3/4 float 0..1 (already in the encoding wanted), row 0 = bottom (Blender)."""
    from PIL import Image
    a = np.clip(arr, 0, 1)
    a = (a[::-1] * 255 + 0.5).astype(np.uint8)
    mode = "RGBA" if a.shape[2] == 4 else "RGB"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(a, mode).save(path, quality=quality, method=6, lossless=lossless)


def linear_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))


# ----------------------------------------------------------------------------- baking
def bake(low, highs, img, kind, samples=4, extrusion=0.5, max_dist=1.0, margin=4, space="TANGENT", selected=True):
    """Bake to img on the active low-poly object's material (image node made active)."""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    for m in low.data.materials:
        nt = m.node_tree
        node = nt.nodes.get("__bake__") or nt.nodes.new("ShaderNodeTexImage")
        node.name = "__bake__"
        node.image = img
        nt.nodes.active = node
        node.select = True
    sc.render.bake.use_selected_to_active = selected
    sc.render.bake.cage_extrusion = extrusion
    sc.render.bake.max_ray_distance = max_dist
    sc.render.bake.margin = margin
    sc.render.bake.normal_space = space
    sc.render.bake.target = "IMAGE_TEXTURES"
    if kind == "DIFFUSE":
        sc.render.bake.use_pass_direct = False
        sc.render.bake.use_pass_indirect = False
        sc.render.bake.use_pass_color = True
    objs = (highs if selected else []) + [low]
    select_only(objs, low)
    with bpy.context.temp_override(active_object=low, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.bake(type=kind)


_DUMMY = {}


def ensure_uv_export(objs):
    """Blender's glTF exporter drops UV maps that no material texture uses. Our textures are
    bound in the game by material name, so give every material a dummy texture on its normal
    input (export_image_format='NONE' keeps it out of the file) to keep TEXCOORD_0."""
    img = bpy.data.images.get("__uv_keep__") or bpy.data.images.new("__uv_keep__", 4, 4)
    seen = set()
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if m is None or m.name in seen:
                continue
            seen.add(m.name)
            nt = m.node_tree
            b = nt.nodes.get("Principled BSDF")
            if b is None or any(n.type == "TEX_IMAGE" and n.outputs["Color"].is_linked for n in nt.nodes):
                continue
            if b.inputs["Normal"].is_linked:
                continue
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = img
            t.image.colorspace_settings.name = "Non-Color"
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = 0.0
            nt.links.new(t.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])


def export_glb(objs, path, anim=False, vcol=True, tangents=False, extras=False):
    ensure_uv_export(objs)
    select_only(objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=tangents,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_yup=True,
        export_animations=anim,
        export_extras=extras,
    )
    try:
        kw["export_vertex_color"] = "ACTIVE" if vcol else "NONE"
    except Exception:
        pass
    with bpy.context.temp_override(selected_objects=objs, active_object=objs[0]):
        bpy.ops.export_scene.gltf(**kw)


rnd = random.Random(1)


def jitter(v, a):
    return v + (rnd.random() * 2 - 1) * a


# ----------------------------------------------------------------------------- batched geometry
class MeshBuilder:
    """Accumulates many small primitives (triangles) with per-vertex colours and builds
    one Blender object - far faster than creating thousands of objects."""

    def __init__(self):
        self.V, self.F, self.C, self.UV = [], [], [], []
        self.n = 0

    def add(self, verts, tris, color=(1, 1, 1, 1), uvs=None):
        verts = np.asarray(verts, dtype=np.float64)
        tris = np.asarray(tris, dtype=np.int64)
        self.V.append(verts)
        self.F.append(tris + self.n)
        c = np.asarray(color, dtype=np.float32)
        if c.ndim == 1:
            c = np.tile(c, (len(verts), 1))
        if c.shape[1] == 3:
            c = np.concatenate([c, np.ones((len(c), 1), np.float32)], 1)
        self.C.append(c)
        if uvs is None:
            uvs = np.zeros((len(verts), 2))
        self.UV.append(np.asarray(uvs, dtype=np.float64))
        self.n += len(verts)

    def build(self, name, mat=None, smooth=True, coll=None):
        if not self.V:
            return None
        V = np.concatenate(self.V)
        F = np.concatenate(self.F)
        C = np.concatenate(self.C)
        UV = np.concatenate(self.UV)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(V))
        me.vertices.foreach_set("co", V.astype(np.float32).ravel())
        me.loops.add(len(F) * 3)
        me.loops.foreach_set("vertex_index", F.astype(np.int32).ravel())
        me.polygons.add(len(F))
        me.polygons.foreach_set("loop_start", np.arange(0, len(F) * 3, 3, dtype=np.int32))
        me.update(calc_edges=True)
        me.validate()
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        ca.data.foreach_set("color", C.astype(np.float32).ravel())
        uv = me.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", UV[F.ravel()].astype(np.float32).ravel())
        me.polygons.foreach_set("use_smooth", [smooth] * len(F))
        ob = bpy.data.objects.new(name, me)
        link(ob, coll)
        if mat:
            ob.data.materials.append(mat)
        return ob


_ICO = {}


def ico(sub=2):
    if sub not in _ICO:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        v = np.array([x.co[:] for x in bm.verts])
        f = np.array([[l.vert.index for l in face.loops] for face in bm.faces])
        bm.free()
        _ICO[sub] = (v, f)
    return _ICO[sub]


def rot_matrix(yaw=0.0, pitch=0.0, roll=0.0):
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)
    Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Ry = np.array([[cr, 0, sr], [0, 1, 0], [-sr, 0, cr]])
    return Rz @ Rx @ Ry


def rock_blob(r, sub=2, seed=0, squash=(1, 1, 1), bump=0.25, freq=2.0, facet=0.0):
    """Irregular stone: icosphere displaced by a few random 3D waves (+ optional facets)."""
    rg = np.random.default_rng(seed)
    v, f = ico(sub)
    v = v.copy()
    disp = np.zeros(len(v))
    for _ in range(5):
        d = rg.normal(size=3)
        d /= np.linalg.norm(d)
        disp += np.sin(v @ d * freq * rg.uniform(0.6, 1.6) + rg.uniform(0, 6.28)) * rg.uniform(0.3, 1)
    disp = disp / 5 * bump
    if facet > 0:
        for _ in range(4):
            d = rg.normal(size=3)
            d /= np.linalg.norm(d)
            cut = rg.uniform(0.55, 0.85)
            proj = v @ d
            over = np.maximum(proj - cut, 0)
            v -= np.outer(over, d) * facet
    v = v * (1 + disp)[:, None]
    v *= np.array(squash) * r
    return v, f

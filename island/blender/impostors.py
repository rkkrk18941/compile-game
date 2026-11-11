"""Billboard impostors for distant trees.

Imports each species GLB, binds the plant textures by material name, and renders every
variant's LOD0 from the side with an orthographic camera into an atlas row:
  plants/<species>_imp_albedo.webp  RGBA (albedo with crown AO, alpha cut-out)
  plants/<species>_imp_normal.webp  RGB  (view-space normal of the side view)
  plants/impostors.json             per species: cell size in metres (width, height)

  python island/blender/impostors.py [species ...]
"""
import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import ASSETS, image_to_np, reset, save_webp, linear_to_srgb

OUT = os.path.join(ASSETS, "plants")
SPECIES = {"palm": 3, "pandanus": 2, "buttress": 2, "canopy": 3, "smalltree": 2, "mangrove": 3, "treefern": 2}
CELL = 512


def emission_material(name, mode, tex=None, vcol_ao=False):
    """mode 'albedo' or 'normal'; alpha from the texture when given."""
    m = bpy.data.materials.new(f"{name}_{mode}")
    nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(nd)
    out = nt.nodes["Material Output"]
    em = nt.nodes.new("ShaderNodeEmission")
    alpha = None
    if tex is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = tex
        alpha = t.outputs["Alpha"]
    if mode == "albedo":
        col = None
        if tex is not None:
            col = t.outputs["Color"]
        if vcol_ao:
            a = nt.nodes.new("ShaderNodeVertexColor")
            mr = nt.nodes.new("ShaderNodeMapRange")
            mr.inputs["To Min"].default_value = 0.42
            mr.inputs["To Max"].default_value = 1.0
            nt.links.new(a.outputs["Alpha"], mr.inputs["Value"])
            mul = nt.nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            if col is not None:
                nt.links.new(col, mul.inputs[6])
            else:
                mul.inputs[6].default_value = (0.3, 0.3, 0.3, 1)
            nt.links.new(mr.outputs["Result"], mul.inputs[7])
            col = mul.outputs[2]
        if col is None:
            em.inputs["Color"].default_value = (0.25, 0.22, 0.18, 1)
        else:
            nt.links.new(col, em.inputs["Color"])
    else:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs[0])
        neg = nt.nodes.new("ShaderNodeMath")
        neg.operation = "MULTIPLY"
        neg.inputs[1].default_value = -1.0
        nt.links.new(sep.outputs["Y"], neg.inputs[0])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(sep.outputs["X"], comb.inputs["X"])
        nt.links.new(sep.outputs["Z"], comb.inputs["Y"])
        nt.links.new(neg.outputs[0], comb.inputs["Z"])
        vm = nt.nodes.new("ShaderNodeVectorMath")
        vm.operation = "MULTIPLY_ADD"
        vm.inputs[1].default_value = (0.5, 0.5, 0.5)
        vm.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(comb.outputs[0], vm.inputs[0])
        nt.links.new(vm.outputs[0], em.inputs["Color"])
    if alpha is not None:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        gt = nt.nodes.new("ShaderNodeMath")
        gt.operation = "GREATER_THAN"
        gt.inputs[1].default_value = 0.45
        nt.links.new(alpha, gt.inputs[0])
        nt.links.new(gt.outputs[0], mix.inputs[0])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
    else:
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def load_tex(name):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        return None
    img = bpy.data.images.load(p)
    return img


def render_species(sp, nvar, meta):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, f"{sp}.glb"))
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 16
    sc.cycles.max_bounces = 0
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_x = sc.render.resolution_y = CELL
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    # material variants per original material
    texmats = {}
    for m in list(bpy.data.materials):
        n = m.name
        if n.startswith("leaf_"):
            tex = load_tex(n[5:] + "_albedo.webp")
            texmats[n] = (emission_material(n, "albedo", tex, vcol_ao=True), emission_material(n, "normal", tex))
        elif n.startswith("bark_"):
            tex = load_tex(n + "_albedo.webp")
            texmats[n] = (emission_material(n, "albedo", None, vcol_ao=False), emission_material(n, "normal"))
            if tex is not None:
                # bark: use the texture's average colour (fine at impostor distance)
                px = np.array(tex.pixels[:]).reshape(-1, 4)[:, :3].mean(0)
                lin = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
                texmats[n][0].node_tree.nodes["Emission"].inputs["Color"].default_value = (*lin, 1)
        else:
            texmats[n] = (emission_material(n, "albedo"), emission_material(n, "normal"))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.rotation_euler = (math.radians(90), 0, 0)   # looking along +Y
    sc.camera = cam
    atlas_a = np.zeros((CELL, CELL * nvar, 4), np.float32)
    atlas_n = np.zeros((CELL, CELL * nvar, 4), np.float32)
    sizes = []
    for v in range(nvar):
        target = bpy.data.objects.get(f"{sp}{v}_lod0")
        objs = [o for o in bpy.data.objects if o.type == "MESH"]
        for o in objs:
            o.hide_render = True
        root = target
        meshes = [o for o in objs if o == root or o.parent == root]
        for o in meshes:
            o.hide_render = False
        # bounds (Blender Z-up after import)
        pts = []
        for o in meshes:
            for c in o.bound_box:
                pts.append(o.matrix_world @ __import__("mathutils").Vector(c))
        xs = [p.x for p in pts] + [p.y for p in pts]
        zs = [p.z for p in pts]
        half = max(abs(min(xs)), abs(max(xs)))
        H = max(zs)
        S = max(2 * half, H) * 1.02
        cam.data.ortho_scale = S
        cam.location = (0, -100, S / 2 - 0.0)
        sizes.append([S, S])
        for mode in (0, 1):
            for o in meshes:
                for i, slot in enumerate(o.material_slots):
                    base = slot.material.name.split("_albedo")[0].split("_normal")[0]
                    orig = base if base in texmats else slot.material.name
                    if orig in texmats:
                        slot.material = texmats[orig][mode]
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".build", f"imp_{sp}_{v}_{mode}.png")
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            px = image_to_np(img)
            if mode == 0:
                atlas_a[:, v * CELL:(v + 1) * CELL] = px
            else:
                atlas_n[:, v * CELL:(v + 1) * CELL] = px
            bpy.data.images.remove(img)
    # PNG render already sRGB-encoded in 'Standard' view: albedo as is; normals were emission
    # values passed through the sRGB transform, undo it for the normal atlas.
    A = atlas_a[..., 3:4]
    nrm = atlas_n[..., :3]
    nrm = np.where(nrm <= 0.04045, nrm / 12.92, ((nrm + 0.055) / 1.055) ** 2.4)
    from plantlib import dilate
    alb = dilate(atlas_a[..., :3], A[..., 0], 8)
    nrm = dilate(nrm, A[..., 0], 8, default=(0.5, 0.5, 1.0))
    save_webp(np.concatenate([alb, A], -1), os.path.join(OUT, f"{sp}_imp_albedo.webp"), quality=88)
    save_webp(nrm, os.path.join(OUT, f"{sp}_imp_normal.webp"), quality=85)
    meta[sp] = {"variants": nvar, "sizes": sizes}
    print(sp, sizes)


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    mpath = os.path.join(OUT, "impostors.json")
    meta = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for sp, n in SPECIES.items():
        if only and sp not in only:
            continue
        if os.path.exists(os.path.join(OUT, f"{sp}.glb")):
            render_species(sp, n, meta)
    json.dump(meta, open(mpath, "w"), indent=1)


if __name__ == "__main__":
    main()

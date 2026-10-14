"""Tiny procedural modelling layer for NOCLIP props (Blender, headless).

A prop is built from parts. Every part carries the engine material it renders
with (see MAT) and a linear base colour; parts get real bevels/subdivision so
edges catch light. finish() joins the parts, applies modifiers, bakes ambient
occlusion into the vertex colours with Cycles (a floor plane under the prop
gives contact shadows) and returns the mesh ready for export.

Blender axes: Z up, the prop's front faces -Y, origin at floor centre.
The exporter converts to the game's Y-up, front = +Z.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# engine material ids (noclip F.*)
_mats = {}

MAT = dict(WALL=0, FLOOR=1, CEIL=2, BASE=3, PILLAR=4, PROP=5, METAL=6, EMIS=7, STEP=8, DARK=9, SIGN=10, FRAME=11, POOL=12, GLASS=13, FABRIC=14, CORE=15, WOOD=16, SIGNINV=17)


def reset():
    _mats.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 64
    sc.cycles.use_denoising = False
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    w.light_settings.distance = 0.6


def material(kind, col, sign=None):
    """A Blender material standing for one engine material + colour."""
    key = (kind, tuple(round(c, 4) for c in col), sign)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"{kind}_{len(_mats)}")
    m["kind"] = MAT[kind]
    m["col"] = list(col)
    if sign is not None:
        m["sign"] = sign
    m.diffuse_color = (*col, 1)
    _mats[key] = m
    return m


class Prop:
    def __init__(self, name):
        self.name = name
        self.parts = []

    def _obj(self, me, kind, col, bevel=0.0, seg=2, subd=0, sign=None, smooth=True, angle=35):
        ob = bpy.data.objects.new(f"{self.name}_{len(self.parts)}", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(material(kind, col, sign))
        if smooth:
            for p in ob.data.polygons:
                p.use_smooth = True
        if bevel > 0:
            b = ob.modifiers.new("b", "BEVEL")
            b.width = bevel
            b.segments = seg
            b.limit_method = "ANGLE"
            b.angle_limit = math.radians(angle)
            b.harden_normals = False
        if subd:
            s = ob.modifiers.new("s", "SUBSURF")
            s.levels = subd
            s.render_levels = subd
        ob["smooth_angle"] = angle
        self.parts.append(ob)
        return ob

    # ---- primitives (dimensions in metres; loc = centre)
    def box(self, size, loc, kind="PROP", col=(0.5, 0.5, 0.5), bevel=0.004, seg=2, rot=(0, 0, 0), subd=0, sign=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if sign is not None:
            # front face (-Y) gets 0..1 UVs for the sign atlas
            uv = bm.loops.layers.uv.new("UVMap")
            for f in bm.faces:
                n = f.normal
                for lp in f.loops:
                    co = lp.vert.co
                    lp[uv].uv = ((co.x / size[0]) + 0.5, (co.z / size[2]) + 0.5) if n.y < -0.5 else (0, 0)
        me = bpy.data.meshes.new("m")
        bm.to_mesh(me)
        bm.free()
        ob = self._obj(me, kind, col, bevel, seg, subd, sign)
        ob.rotation_euler = rot
        ob.location = loc
        return ob

    def cyl(self, r, h, loc, kind="PROP", col=(0.5, 0.5, 0.5), verts=24, bevel=0.003, axis="Z", r2=None, cap=True, subd=0):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=h)
        me = bpy.data.meshes.new("m")
        bm.to_mesh(me)
        bm.free()
        ob = self._obj(me, kind, col, bevel, 2, subd)
        ob.rotation_euler = {"Z": (0, 0, 0), "X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0)}[axis]
        ob.location = loc
        return ob

    def sphere(self, r, loc, kind="PROP", col=(0.5, 0.5, 0.5), scale=(1, 1, 1), seg=16, rings=10):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        me = bpy.data.meshes.new("m")
        bm.to_mesh(me)
        bm.free()
        ob = self._obj(me, kind, col)
        ob.scale = scale
        ob.location = loc
        return ob

    def torus(self, R, r, loc, kind="PROP", col=(0.2, 0.2, 0.2), axis="Z", seg=20, mseg=8):
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=mseg, location=(0, 0, 0))
        ob = bpy.context.active_object
        ob.data.materials.append(material(kind, col))
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.rotation_euler = {"Z": (0, 0, 0), "X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0)}[axis]
        ob.location = loc
        ob["smooth_angle"] = 60
        self.parts.append(ob)
        return ob

    def tube(self, pts, r, kind="METAL", col=(0.4, 0.4, 0.42), seg=10, cap=True):
        """A bent rod through points (frames, rails, legs)."""
        cu = bpy.data.curves.new("c", "CURVE")
        cu.dimensions = "3D"
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (*p, 1)
        cu.bevel_depth = r
        cu.bevel_resolution = max(1, seg // 4)
        cu.use_fill_caps = cap
        ob = bpy.data.objects.new("t", cu)
        bpy.context.scene.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.active_object
        ob.select_set(False)
        ob.data.materials.clear()
        ob.data.materials.append(material(kind, col))
        for p in ob.data.polygons:
            p.use_smooth = True
        ob["smooth_angle"] = 70
        self.parts.append(ob)
        return ob

    def lathe(self, prof, loc, kind="PROP", col=(0.5, 0.5, 0.5), seg=24):
        """Revolve a (radius, z) profile around Z (pots, vases, lamp shades)."""
        bm = bmesh.new()
        ring_prev = None
        rings = []
        for r, z in prof:
            ring = [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                bm.faces.new((a[i], a[j], b[j], b[i]))
        me = bpy.data.meshes.new("m")
        bm.to_mesh(me)
        bm.free()
        ob = self._obj(me, kind, col, 0, 2, 0, None, True, 60)
        ob.location = loc
        return ob

    def extrude(self, outline, depth, loc, kind="PROP", col=(0.5, 0.5, 0.5), axis="Y", bevel=0.003, rot=(0, 0, 0)):
        """Extrude a 2D outline [(x, z), ...] along an axis (frames, brackets)."""
        bm = bmesh.new()
        vs = [bm.verts.new((x, 0, z)) for x, z in outline]
        f = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        nv = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, depth, 0), verts=nv)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.translate(bm, vec=(0, -depth / 2, 0), verts=bm.verts)
        me = bpy.data.meshes.new("m")
        bm.to_mesh(me)
        bm.free()
        ob = self._obj(me, kind, col, bevel)
        ob.rotation_euler = rot
        ob.location = loc
        return ob

    # ---- finishing
    def finish(self, floor=True, wall=None, ao_dist=0.5, samples=48):
        """Join + apply, bake AO into vertex colours, return the joined object."""
        sc = bpy.context.scene
        bpy.ops.object.select_all(action="DESELECT")
        for ob in self.parts:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        for ob in self.parts:
            bpy.context.view_layer.objects.active = ob
            for m in list(ob.modifiers):
                bpy.ops.object.modifier_apply(modifier=m.name)
            ob.data.transform(ob.matrix_world)
            ob.matrix_world = Matrix.Identity(4)
            if not ob.data.uv_layers:
                ob.data.uv_layers.new(name="UVMap")
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        ob = bpy.context.active_object
        ob.name = self.name
        # split normals by angle so hard edges stay hard
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        # occluders: floor (and an optional wall behind) for contact shadows
        helpers = []
        if floor:
            bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.0005))
            helpers.append(bpy.context.active_object)
        if wall is not None:
            bpy.ops.mesh.primitive_plane_add(size=40, location=(0, wall, 0), rotation=(math.pi / 2, 0, 0))
            helpers.append(bpy.context.active_object)
        sc.world.light_settings.distance = ao_dist
        attr = ob.data.color_attributes.new("ao", "BYTE_COLOR", "CORNER")
        ob.data.color_attributes.active_color = attr
        # Cycles needs a material output on every slot it bakes through
        for m in ob.data.materials:
            m.use_nodes = True
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        sc.cycles.samples = samples
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        for h in helpers:
            bpy.data.objects.remove(h, do_unlink=True)
        return ob

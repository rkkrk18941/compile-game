"""Small helper layer over Blender shader nodes for authoring tileable procedural
surfaces and baking them to images.

Every texture is made seamless by evaluating 4D noise on a torus: the UV square
is wrapped onto (cos 2πu, sin 2πu, cos 2πv, sin 2πv), so the pattern repeats
exactly at the UV edges. Regular patterns (tiles, bricks) are built from
floor/fract of UV and per-cell random values hashed from the cell index modulo
the repeat count, which is periodic too.
"""
import math

import bpy

TAU = math.pi * 2


class G:
    """Graph builder bound to one material node tree."""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0
        tc = self.node("ShaderNodeTexCoord")
        sep = self.node("ShaderNodeSeparateXYZ")
        self.link(tc.outputs["UV"], sep.inputs[0])
        self.u = sep.outputs[0]
        self.v = sep.outputs[1]
        self._torus = {}

    # ---- plumbing
    def node(self, kind, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 30
        for k, val in props.items():
            setattr(n, k, val)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def sock(self, node, ident, out=False):
        for s in node.outputs if out else node.inputs:
            if s.identifier == ident or s.name == ident:
                if s.enabled:
                    return s
        for s in node.outputs if out else node.inputs:
            if s.identifier == ident or s.name == ident:
                return s
        raise KeyError(ident)

    def put(self, sock, val):
        """Connect a socket or set a constant."""
        if hasattr(val, "is_output") or hasattr(val, "links"):
            self.link(val, sock)
        else:
            sock.default_value = val

    # ---- math
    def m(self, op, a, b=0.0, c=0.0, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.put(n.inputs[0], a)
        if len(n.inputs) > 1:
            self.put(n.inputs[1], b)
        if len(n.inputs) > 2:
            self.put(n.inputs[2], c)
        return n.outputs[0]

    def add(self, a, b):
        return self.m("ADD", a, b)

    def sub(self, a, b):
        return self.m("SUBTRACT", a, b)

    def mul(self, a, b):
        return self.m("MULTIPLY", a, b)

    def div(self, a, b):
        return self.m("DIVIDE", a, b)

    def mad(self, a, b, c):
        return self.m("MULTIPLY_ADD", a, b, c)

    def mn(self, a, b):
        return self.m("MINIMUM", a, b)

    def mx(self, a, b):
        return self.m("MAXIMUM", a, b)

    def absf(self, a):
        return self.m("ABSOLUTE", a)

    def floor(self, a):
        return self.m("FLOOR", a)

    def fract(self, a):
        return self.m("FRACT", a)

    def mod(self, a, b):
        return self.m("FLOORED_MODULO", a, b)

    def powf(self, a, b):
        return self.m("POWER", a, b)

    def sin(self, a):
        return self.m("SINE", a)

    def cos(self, a):
        return self.m("COSINE", a)

    def clamp01(self, a):
        return self.m("ADD", a, 0.0, clamp=True)

    def lerp(self, a, b, t):
        # a + (b-a)*t
        return self.add(a, self.mul(self.sub(b, a), t))

    def smooth(self, e0, e1, x):
        n = self.node("ShaderNodeMapRange", data_type="FLOAT", interpolation_type="SMOOTHSTEP", clamp=True)
        self.put(n.inputs["Value"], x)
        self.put(n.inputs["From Min"], e0)
        self.put(n.inputs["From Max"], e1)
        n.inputs["To Min"].default_value = 0.0
        n.inputs["To Max"].default_value = 1.0
        return n.outputs["Result"]

    def remap(self, x, a0, a1, b0, b1, clamp=True):
        n = self.node("ShaderNodeMapRange", data_type="FLOAT", interpolation_type="LINEAR", clamp=clamp)
        self.put(n.inputs["Value"], x)
        self.put(n.inputs["From Min"], a0)
        self.put(n.inputs["From Max"], a1)
        self.put(n.inputs["To Min"], b0)
        self.put(n.inputs["To Max"], b1)
        return n.outputs["Result"]

    # ---- colours (three float channels kept as a tuple)
    def rgb(self, r, g=None, b=None):
        if g is None:
            return (r, r, r)
        return (r, g, b)

    def cmix(self, a, b, t):
        return tuple(self.lerp(a[i], b[i], t) for i in range(3))

    def cmul(self, a, k):
        if isinstance(k, tuple):
            return tuple(self.mul(a[i], k[i]) for i in range(3))
        return tuple(self.mul(a[i], k) for i in range(3))

    def ramp(self, t, stops):
        """Piecewise-linear palette: stops = [(pos, (r,g,b)), ...]."""
        n = self.node("ShaderNodeValToRGB")
        cr = n.color_ramp
        cr.interpolation = "LINEAR"
        while len(cr.elements) > 1:
            cr.elements.remove(cr.elements[-1])
        cr.elements[0].position = stops[0][0]
        cr.elements[0].color = (*stops[0][1], 1.0)
        for pos, col in stops[1:]:
            e = cr.elements.new(pos)
            e.color = (*col, 1.0)
        self.put(n.inputs["Fac"], t)
        sep = self.node("ShaderNodeSeparateColor")
        self.link(n.outputs["Color"], sep.inputs[0])
        return (sep.outputs[0], sep.outputs[1], sep.outputs[2])

    # ---- coordinates
    def torus(self, su=1.0, sv=1.0, ou=0.0, ov=0.0):
        """4D coords for seamless noise. su/sv stretch the noise per axis (feature
        size is 1/scale along u and v); ou/ov shift the pattern."""
        key = (su, sv, ou, ov)
        if key in self._torus:
            return self._torus[key]
        ru, rv = su / TAU, sv / TAU
        tu = self.mul(self.add(self.u, ou), TAU)
        tv = self.mul(self.add(self.v, ov), TAU)
        x = self.mul(self.cos(tu), ru)
        y = self.mul(self.sin(tu), ru)
        z = self.mul(self.cos(tv), rv)
        w = self.mul(self.sin(tv), rv)
        cx = self.node("ShaderNodeCombineXYZ")
        self.put(cx.inputs[0], x)
        self.put(cx.inputs[1], y)
        self.put(cx.inputs[2], z)
        self._torus[key] = (cx.outputs[0], w)
        return self._torus[key]

    def noise(self, scale, detail=4.0, rough=0.5, lac=2.0, dist=0.0, su=1.0, sv=1.0, kind="FBM", seed=0.0, color=False):
        vec, w = self.torus(su, sv, seed * 0.137, seed * 0.291)
        n = self.node("ShaderNodeTexNoise", noise_dimensions="4D", noise_type=kind)
        self.link(vec, n.inputs["Vector"])
        self.link(w, n.inputs["W"])
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Lacunarity"].default_value = lac
        n.inputs["Distortion"].default_value = dist
        if color:
            sep = self.node("ShaderNodeSeparateColor")
            self.link(n.outputs["Color"], sep.inputs[0])
            return (sep.outputs[0], sep.outputs[1], sep.outputs[2])
        return n.outputs["Fac"]

    def voronoi(self, scale, feature="F1", su=1.0, sv=1.0, rand=1.0, metric="EUCLIDEAN", seed=0.0, out="Distance"):
        vec, w = self.torus(su, sv, seed * 0.173, seed * 0.311)
        n = self.node("ShaderNodeTexVoronoi", voronoi_dimensions="4D", feature=feature, distance=metric)
        self.link(vec, n.inputs["Vector"])
        self.link(w, n.inputs["W"])
        n.inputs["Scale"].default_value = scale
        n.inputs["Randomness"].default_value = rand
        if out == "Color":
            sep = self.node("ShaderNodeSeparateColor")
            self.link(n.outputs["Color"], sep.inputs[0])
            return (sep.outputs[0], sep.outputs[1], sep.outputs[2])
        return n.outputs[out]

    def hash2(self, a, b, seed=0.0):
        """Random value in [0,1) per integer pair (a,b)."""
        cx = self.node("ShaderNodeCombineXYZ")
        self.put(cx.inputs[0], self.add(a, seed * 17.13))
        self.put(cx.inputs[1], self.add(b, seed * 3.71))
        n = self.node("ShaderNodeTexWhiteNoise", noise_dimensions="2D")
        self.link(cx.outputs[0], n.inputs["Vector"])
        return n.outputs["Value"]

    def grid(self, nu, nv, offset_rows=0.0, u=None, v=None):
        """Regular cells: returns (fu, fv, iu, iv) — fractional position inside a
        cell and the periodic integer cell index. offset_rows shifts odd rows."""
        u = self.u if u is None else u
        v = self.v if v is None else v
        pv = self.mul(v, nv)
        iv = self.floor(pv)
        pu = self.mul(u, nu)
        if offset_rows:
            pu = self.add(pu, self.mul(self.mod(iv, 2.0), offset_rows))
        iu = self.mod(self.floor(pu), nu)
        return self.fract(pu), self.fract(pv), iu, self.mod(iv, nv)

    def edge_dist(self, fu, fv, aspect=1.0):
        """Distance (in cell-u units) to the nearest cell edge."""
        du = self.mn(fu, self.sub(1.0, fu))
        dv = self.mul(self.mn(fv, self.sub(1.0, fv)), aspect)
        return self.mn(du, dv)


def bake_setup(res):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 8
    sc.cycles.use_denoising = False
    sc.render.bake.margin = 0
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    ob = bpy.context.active_object
    mat = bpy.data.materials.new("bake")
    mat.use_nodes = True
    ob.data.materials.append(mat)
    img = bpy.data.images.new("out", width=res, height=res, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    return ob, mat, img


def bake_channel(ob, mat, img, sock_rgb, samples=8):
    """Bake an (r,g,b) tuple of float sockets through an emission shader and
    return the pixels as a numpy array (H, W, 3)."""
    import numpy as np

    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.bl_idname in ("ShaderNodeOutputMaterial", "ShaderNodeEmission", "ShaderNodeTexImage") or n.name.startswith("__comb"):
            nt.nodes.remove(n)
    comb = nt.nodes.new("ShaderNodeCombineColor")
    comb.name = "__comb"
    for i in range(3):
        s = sock_rgb[i]
        if hasattr(s, "is_output"):
            nt.links.new(s, comb.inputs[i])
        else:
            comb.inputs[i].default_value = s
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(comb.outputs[0], em.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    tex.select = True
    bpy.context.scene.cycles.samples = samples
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.bake(type="EMIT", margin=0, use_clear=True)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    return px[:, :, :3].copy()

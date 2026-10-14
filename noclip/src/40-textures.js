// ---------------------------------------------------------------------------
// Blender-baked surface textures (tools/blender/textures.py → pack_textures.py).
// The procedural GLSL baker stays as the fallback: anything missing from
// assets/tex/manifest.json, or any image that fails to load, is baked in-engine
// exactly as before.
// ---------------------------------------------------------------------------
const BTEX = {
  base: "assets/tex/",
  manifest: null,
  cache: new Map(), // "kind:q" -> {albedo, normal}
  q: "high",
  ready: null,
  init() {
    if (this.ready) return this.ready;
    this.ready = fetch(this.base + "manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m) => (this.manifest = m || {}));
    return this.ready;
  },
  has(kind) {
    return !!(this.manifest && this.manifest[kind]);
  },
  urls(kind, q) {
    const m = this.manifest[kind],
      s = q === "low" ? m.sizes[m.sizes.length - 1] : m.sizes[0],
      suf = s === m.sizes[0] ? "" : "_" + s;
    return [this.base + kind + suf + "_a.webp", this.base + kind + suf + "_n.webp"];
  },
  image(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("tex " + url));
      img.src = url;
    });
  },
  texture(img, aniso) {
    const t = new tn.Texture(img);
    t.wrapS = t.wrapT = Ss;
    t.minFilter = hi;
    t.magFilter = Le;
    t.generateMipmaps = !0;
    t.anisotropy = aniso;
    t.colorSpace = Ai;
    t.needsUpdate = !0;
    return t;
  },
  async preload(kinds, q, aniso) {
    await this.init();
    this.q = q;
    await Promise.all(
      [...kinds].map(async (k) => {
        const key = k + ":" + q;
        if (!this.has(k) || this.cache.has(key)) return;
        try {
          const [a, n] = await Promise.all(this.urls(k, q).map((u) => this.image(u)));
          this.cache.set(key, { albedo: this.texture(a, aniso), normal: this.texture(n, aniso), blender: !0 });
        } catch (e) {
          console.warn(e.message);
        }
      }),
    );
  },
  get(kind) {
    return this.cache.get(kind + ":" + this.q) || null;
  },
  disposeExcept(keep) {
    for (const [key, v] of this.cache)
      if (!keep.has(key.split(":")[0])) {
        v.albedo.dispose();
        v.normal.dispose();
        this.cache.delete(key);
      }
  },
};

// surfaces a theme needs (its wallpaper, walls, floor and ceiling)
function themeTexKinds(themeId) {
  const d = LE[themeId] || LE.yellow,
    th = ah[themeId] || {};
  return new Set([th.paperKind || "paper", d.tex.wall, d.tex.floor, d.tex.ceil]);
}

{
  const bake = hd.prototype.bake,
    disposeExcept = hd.prototype.disposeExcept;
  // surfaces only Blender has fall back to the closest procedural one
  const near = { platformTile: "tile", metroTile: "tile", metalCeil: "tiles", terrazzo: "tile", woodFloor: "lino", hotelCarpet: "carpet", damask: "paper", concreteFloor: "concrete" };
  hd.prototype.bake = function (kind, size, seed) {
    return BTEX.get(kind) || bake.call(this, tE[kind] ? kind : near[kind] || "drywall", size, seed);
  };
  hd.prototype.disposeExcept = function (keep) {
    BTEX.disposeExcept(keep);
    return disposeExcept.call(this, keep);
  };
  const loadFloor = Td.prototype.loadFloor;
  Td.prototype.loadFloor = async function (depth, arrive, show = !0, opts = {}) {
    const themeId = this.run && this.run.themes[depth - 1];
    if (themeId) await BTEX.preload(themeTexKinds(themeId), this.settings.texQ(), this.baker.maxAniso);
    return loadFloor.call(this, depth, arrive, show, opts);
  };
}
BTEX.init();

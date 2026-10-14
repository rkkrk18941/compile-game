"""Turn Blender bakes (tools/blender/textures.py) into the packed WebP pairs
NOCLIP samples:

  <name>_a.webp  RGB = albedo with ambient occlusion folded in (gamma 2.2)
  <name>_n.webp  RG  = tangent normal xy, B = roughness

No alpha channels: mobile browsers may premultiply decoded images, which would
wreck colour precision wherever alpha is small. Normals and occlusion are
derived here from the baked height field (metres), with wrap-around sampling so
they tile like the bakes do.

    python3 tools/blender/pack_textures.py BAKE_DIR OUT_DIR [--preview DIR] [--sizes 1024,512]
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image


def srgb(x):
    # the game decodes with pow(c, 2.2), so encode with the same curve
    return np.power(np.clip(x, 0.0, 1.0), 1 / 2.2)


def normals(h, size_m, strength=1.0):
    n = h.shape[0]
    px = size_m / n  # metres per pixel
    # image row 0 is v = 0 (Blender pixel order), so +v is +row
    dhdu = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * px)
    dhdv = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / (2 * px)
    nx, ny, nz = -dhdu * strength, -dhdv * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / ln, ny / ln


def occlusion(h, size_m, radius_m=0.04, dirs=12, steps=10):
    """Horizon-based AO on a periodic height field."""
    n = h.shape[0]
    px = size_m / n
    occ = np.zeros_like(h)
    rpx = max(2.0, radius_m / px)
    for d in range(dirs):
        a = 2 * np.pi * d / dirs
        dx, dy = np.cos(a), np.sin(a)
        best = np.zeros_like(h)
        for s in range(1, steps + 1):
            r = rpx * (s / steps) ** 1.5
            ox, oy = int(round(dx * r)), int(round(dy * r))
            if ox == 0 and oy == 0:
                continue
            dist = np.hypot(ox, oy) * px
            hh = np.roll(np.roll(h, -oy, axis=0), -ox, axis=1)
            elev = np.arctan2(hh - h, dist)
            best = np.maximum(best, elev)
        occ += np.sin(np.clip(best, 0, np.pi / 2))
    return np.clip(1.0 - occ / dirs * 1.15, 0.0, 1.0)


CONTRAST = {"damask": 3.2}


def down(img, size):
    return img.resize((size, size), Image.LANCZOS) if img.size[0] != size else img


def pack(path, out, sizes, manifest, preview=None, ao_radius=None):
    name = os.path.splitext(os.path.basename(path))[0]
    z = np.load(path)
    col, rough, h = z["color"], z["rough"], z["height"]
    size_m = float(z["size"])
    gray = bool(z["gray"])
    nx, ny = normals(h, size_m)
    ao = occlusion(h, size_m, radius_m=ao_radius or max(0.006, size_m * 0.012))
    # image files are stored top row first; flip so v = 0 ends up at the bottom
    flip = lambda a: a[::-1]  # noqa: E731
    aok = np.power(ao, 0.85)[:, :, None]
    alb = srgb(col * aok)
    if gray:
        # tinted in the engine; some motifs read better with more contrast
        lum = col[:, :, 0] * aok[:, :, 0]
        k = CONTRAST.get(name, 1.0)
        lum = np.clip(lum.mean() + (lum - lum.mean()) * k, 0.02, 1.0)
        alb = np.repeat(srgb(lum)[:, :, None], 3, axis=2)
    hmin, hmax = float(h.min()), float(h.max())
    N = np.dstack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, np.clip(rough, 0, 1)])
    ia = Image.fromarray((flip(alb) * 255 + 0.5).astype(np.uint8), "RGB")
    inn = Image.fromarray((flip(N) * 255 + 0.5).astype(np.uint8), "RGB")
    os.makedirs(out, exist_ok=True)
    for s in sizes:
        suf = "" if s == sizes[0] else f"_{s}"
        down(ia, s).save(os.path.join(out, f"{name}{suf}_a.webp"), "WEBP", quality=88, method=6)
        down(inn, s).save(os.path.join(out, f"{name}{suf}_n.webp"), "WEBP", quality=92, method=6)
    manifest[name] = {"size": round(size_m, 3), "gray": gray, "sizes": sizes}
    if preview:
        os.makedirs(preview, exist_ok=True)
        # quick lit preview: grazing key light from upper left
        L = np.array([-0.55, 0.45, 0.7])
        L /= np.linalg.norm(L)
        nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
        lam = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
        lit = srgb(col * (0.25 + 0.95 * lam[:, :, None]) * ao[:, :, None] * (np.array([1.0, 0.93, 0.74]) if gray else 1.0))
        tiles = [
            lit,
            alb,
            np.dstack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz]),
            np.repeat(rough[:, :, None], 3, 2),
            np.repeat(ao[:, :, None], 3, 2),
        ]
        sh = 256
        sheet = Image.new("RGB", (sh * len(tiles), sh))
        for i, t in enumerate(tiles):
            im = Image.fromarray((flip(np.clip(t, 0, 1)) * 255).astype(np.uint8), "RGB").resize((sh, sh), Image.LANCZOS)
            sheet.paste(im, (i * sh, 0))
        # a 2x2 tiling check of the lit view
        big = Image.fromarray((flip(np.clip(lit, 0, 1)) * 255).astype(np.uint8), "RGB").resize((sh, sh), Image.LANCZOS)
        tile = Image.new("RGB", (sh * 2, sh * 2))
        for i in range(2):
            for j in range(2):
                tile.paste(big, (i * sh, j * sh))
        sheet.save(os.path.join(preview, f"{name}.png"))
        tile.save(os.path.join(preview, f"{name}_tiled.png"))
    print(f"[pack] {name}: size {size_m} m, height {hmin * 1000:.2f}..{hmax * 1000:.2f} mm, ao {ao.mean():.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("bake_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--preview")
    ap.add_argument("--sizes", default="1024,512")
    ap.add_argument("--only")
    a = ap.parse_args()
    sizes = [int(s) for s in a.sizes.split(",")]
    only = set(a.only.split(",")) if a.only else None
    mpath = os.path.join(a.out_dir, "manifest.json")
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for p in sorted(glob.glob(os.path.join(a.bake_dir, "*.npz"))):
        if only and os.path.splitext(os.path.basename(p))[0] not in only:
            continue
        pack(p, a.out_dir, sizes, manifest, a.preview)
    with open(mpath, "w") as f:
        json.dump(dict(sorted(manifest.items())), f, indent=1)

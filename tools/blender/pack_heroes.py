"""Pack the rendered hero portraits (RGBA PNG) into WebP for the game.

    python3 tools/blender/pack_heroes.py RENDER_DIR noclip/assets/heroes
"""
import os
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith(".png"):
        continue
    im = Image.open(os.path.join(src, f)).convert("RGBA")
    dst = os.path.join(out, f[:-4] + ".webp")
    im.save(dst, "WEBP", quality=86, method=6)
    print(f"[hero] {dst}: {os.path.getsize(dst) // 1024} KB")

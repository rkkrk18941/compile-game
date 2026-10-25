#!/usr/bin/env python3
"""Reproduce official enemy portraits from the source manifest (Pillow required).
Usage: python3 tools/extract-ibara-enemy-art.py /absolute/path/to/source-sheet-cache
Downloads only publicly linked source sheets; never executes the TTS module.
"""
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request
from PIL import Image
root = Path(__file__).resolve().parents[1] / 'ibara' / 'img' / 'enemies'
manifest = json.loads((root / 'official-sources.json').read_text())
cache = Path(sys.argv[1]); cache.mkdir(parents=True, exist_ok=True)
for art, data in manifest['portraits'].items():
    url = data['sheet'].replace('cloud-3.steamusercontent.com', 'cdn.steamusercontent.com')
    key = hashlib.sha256(url.encode()).hexdigest()
    sheet = cache / (key + '.png')
    if not sheet.exists():
        payload = urllib.request.urlopen(url, timeout=60).read()
        Image.open(io.BytesIO(payload)).load()
        sheet.write_bytes(payload)
    image = Image.open(sheet)
    columns, rows = data['grid']; cell = data['card_id'] % 100
    width, height = image.width / columns, image.height / rows
    x, y = cell % columns, cell // columns
    card = image.crop((round(x*width), round(y*height), round((x+1)*width), round((y+1)*height)))
    crop = tuple(round(c*n) for c,n in zip(data['crop'], [card.width,card.height,card.width,card.height]))
    portrait = card.crop(crop).convert('RGB'); portrait.thumbnail((640,640))
    output = io.BytesIO(); portrait.save(output, 'WEBP', quality=91, method=6)
    (root / (art+'.webp')).write_bytes(output.getvalue())
print('Extracted', len(manifest['portraits']), 'official portraits; hashes depend on the Pillow/libwebp version.')

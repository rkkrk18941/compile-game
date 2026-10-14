"""Model NOCLIP's props in Blender and export them as packed binaries.

    blender -b --factory-startup -P tools/blender/props.py -- OUT_DIR [pack,pack] [prop,prop]

Each pack becomes OUT_DIR/<pack>.bin (see write_pack for the layout) and
OUT_DIR/manifest.json lists what is in it. Props are modelled at real size
(metres) with the front facing -Y; finish() bakes ambient occlusion into the
vertex colours so the game gets contact shadows and crevice darkening for free.
"""
import json
import math
import os
import random
import struct
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from model import Prop, reset  # noqa: E402

PROPS = {}


def prop(pack, **meta):
    def deco(fn):
        PROPS[fn.__name__] = (pack, fn, meta)
        return fn

    return deco


R = random.Random(7)


def jitter(c, k=0.08):
    return tuple(max(0.0, min(1.0, x * (1 + (R.random() - 0.5) * 2 * k))) for x in c)


# ---------------------------------------------------------------------------
# common
# ---------------------------------------------------------------------------
@prop("common")
def vending(p):
    W, D, H = 0.92, 0.78, 1.83
    body = (0.62, 0.62, 0.6)
    p.box((W, D, H), (0, 0, H / 2), "PROP", body, bevel=0.012, seg=3)
    p.box((W + 0.01, D * 0.98, 0.1), (0, 0, H - 0.05), "EMIS", (0.9, 0.85, 0.7), bevel=0.005)  # brand light
    # display window: lit back panel, three shelves of cans, glass
    p.box((0.76, 0.05, 0.86), (-0.06, -D / 2 + 0.06, 1.25), "EMIS", (0.55, 0.56, 0.58), bevel=0.002)
    can_cols = [(0.6, 0.05, 0.04), (0.05, 0.2, 0.55), (0.75, 0.6, 0.05), (0.08, 0.35, 0.12), (0.8, 0.8, 0.78), (0.35, 0.12, 0.02), (0.05, 0.05, 0.05), (0.7, 0.3, 0.05)]
    for row in range(3):
        z = 0.88 + row * 0.27
        p.box((0.78, 0.2, 0.012), (-0.06, -D / 2 + 0.16, z - 0.005), "METAL", (0.5, 0.5, 0.52), bevel=0.001)
        for i in range(8):
            x = -0.06 - 0.33 + i * 0.094
            c = can_cols[(i * 3 + row * 5) % len(can_cols)]
            p.cyl(0.031, 0.122, (x, -D / 2 + 0.14, z + 0.062), "METAL", c, verts=12, bevel=0.0)
            p.box((0.05, 0.004, 0.022), (x, -D / 2 + 0.04, z - 0.03), "EMIS", (1.0, 0.25, 0.05) if (i + row) % 3 else (0.2, 1.0, 0.3), bevel=0.0)
            p.box((0.026, 0.01, 0.012), (x, -D / 2 + 0.035, z - 0.06), "PROP", (0.85, 0.85, 0.82), bevel=0.002)
    for zz in (0.81, 1.69):
        p.box((0.82, 0.03, 0.03), (-0.06, -D / 2 - 0.004, zz), "METAL", (0.4, 0.4, 0.42), bevel=0.004)
    for xx in (-0.47, 0.35):
        p.box((0.03, 0.03, 0.9), (xx, -D / 2 - 0.004, 1.25), "METAL", (0.4, 0.4, 0.42), bevel=0.004)
    # pay panel and dispenser
    p.box((0.13, 0.03, 0.42), (0.37, -D / 2 - 0.01, 1.18), "PROP", (0.12, 0.12, 0.13), bevel=0.004)
    p.box((0.06, 0.012, 0.012), (0.37, -D / 2 - 0.028, 1.32), "DARK", (0.01, 0.01, 0.01), bevel=0.0)
    p.box((0.08, 0.012, 0.03), (0.37, -D / 2 - 0.028, 1.2), "DARK", (0.01, 0.01, 0.01), bevel=0.0)
    p.box((0.07, 0.006, 0.03), (0.37, -D / 2 - 0.028, 1.08), "EMIS", (0.2, 0.9, 0.3), bevel=0.0)
    p.box((0.62, 0.12, 0.22), (-0.06, -D / 2 + 0.03, 0.3), "DARK", (0.02, 0.02, 0.02), bevel=0.01)
    p.box((0.6, 0.02, 0.2), (-0.06, -D / 2 - 0.02, 0.32), "PROP", (0.15, 0.15, 0.16), bevel=0.006, rot=(0.25, 0, 0))
    p.box((0.88, 0.03, 0.07), (0, -D / 2 - 0.005, 0.07), "PROP", (0.1, 0.1, 0.1), bevel=0.004)  # kick plate
    for x in (-0.4, 0.4):
        for y in (-0.33, 0.33):
            p.cyl(0.025, 0.03, (x, y, 0.015), "METAL", (0.3, 0.3, 0.3), verts=10)


@prop("common")
def bench(p):
    frame = (0.06, 0.06, 0.065)
    wood = (0.3, 0.17, 0.08)
    for x in (-0.78, 0.78):
        p.tube([(x, 0.2, 0.0), (x, 0.18, 0.42), (x, -0.22, 0.42), (x, -0.24, 0.0)], 0.018, "METAL", frame)
        p.tube([(x, 0.2, 0.42), (x, 0.27, 0.82)], 0.016, "METAL", frame)
        p.box((0.05, 0.08, 0.02), (x, 0.2, 0.005), "METAL", frame, bevel=0.004)
        p.box((0.05, 0.08, 0.02), (x, -0.24, 0.005), "METAL", frame, bevel=0.004)
    for i in range(5):
        p.box((1.74, 0.07, 0.028), (0, -0.2 + i * 0.09, 0.445), "WOOD", jitter(wood), bevel=0.006)
    for i in range(3):
        t = 0.52 + i * 0.12
        p.box((1.74, 0.07, 0.026), (0, 0.2 + (t - 0.45) * 0.17, t + 0.02), "WOOD", jitter(wood), bevel=0.006, rot=(math.radians(-80), 0, 0))
    p.box((1.6, 0.04, 0.04), (0, -0.02, 0.4), "METAL", frame, bevel=0.005)


@prop("common")
def trashbin(p):
    steel = (0.55, 0.56, 0.58)
    p.lathe([(0.0, 0.0), (0.19, 0.0), (0.2, 0.02), (0.2, 0.72), (0.205, 0.74), (0.0, 0.74)], (0, 0, 0), "METAL", steel, seg=32)
    p.lathe([(0.21, 0.73), (0.215, 0.78), (0.13, 0.82), (0.0, 0.83)], (0, 0, 0), "METAL", (0.45, 0.46, 0.48), seg=32)
    p.box((0.2, 0.06, 0.08), (0, -0.16, 0.78), "DARK", (0.01, 0.01, 0.01), bevel=0.01)  # throat
    p.box((0.16, 0.004, 0.05), (0, -0.205, 0.55), "EMIS", (0.4, 0.4, 0.4), bevel=0.0)  # label
    p.cyl(0.21, 0.02, (0, 0, 0.01), "PROP", (0.05, 0.05, 0.05), verts=32)


@prop("common")
def plant(p):
    pot = (0.62, 0.6, 0.56)
    p.lathe([(0.0, 0.0), (0.17, 0.0), (0.19, 0.02), (0.24, 0.38), (0.26, 0.4), (0.255, 0.42), (0.23, 0.41), (0.0, 0.39)], (0, 0, 0), "PROP", pot, seg=32)
    p.cyl(0.225, 0.02, (0, 0, 0.385), "PROP", (0.08, 0.06, 0.045), verts=32)
    trunk = (0.22, 0.16, 0.1)
    p.tube([(0, 0, 0.38), (0.02, 0.01, 0.8), (-0.03, 0.02, 1.2), (0.0, 0.0, 1.45)], 0.022, "WOOD", trunk, seg=8)
    p.tube([(0.0, 0.01, 0.95), (0.18, -0.05, 1.18), (0.25, -0.08, 1.32)], 0.012, "WOOD", trunk, seg=6)
    p.tube([(-0.02, 0.02, 1.05), (-0.2, 0.08, 1.25), (-0.24, 0.1, 1.38)], 0.011, "WOOD", trunk, seg=6)
    leaf = (0.07, 0.17, 0.06)
    for i in range(120):
        a = R.random() * math.tau
        r = 0.05 + R.random() * 0.33
        z = 0.85 + R.random() * 0.75
        x, y = math.cos(a) * r, math.sin(a) * r
        lb = p.box((0.13, 0.055, 0.004), (x, y, z), "PROP", jitter(leaf, 0.3), bevel=0.0, rot=(R.uniform(-0.6, 0.3), R.uniform(-0.4, 0.4), a + R.uniform(-0.5, 0.5)))
        lb.scale = (1, 1, 1)


@prop("common")
def chair(p):
    """Swivel office chair."""
    fab = (0.05, 0.05, 0.06)
    plast = (0.04, 0.04, 0.045)
    p.box((0.5, 0.48, 0.09), (0, 0, 0.47), "FABRIC", fab, bevel=0.03, seg=3)
    p.box((0.46, 0.07, 0.52), (0, 0.24, 0.84), "FABRIC", fab, bevel=0.03, seg=3, rot=(math.radians(-8), 0, 0))
    p.box((0.06, 0.03, 0.34), (0, 0.24, 0.55), "PROP", plast, bevel=0.008, rot=(math.radians(-12), 0, 0))
    p.box((0.34, 0.3, 0.04), (0, 0, 0.41), "PROP", plast, bevel=0.01)
    p.cyl(0.028, 0.18, (0, 0, 0.32), "METAL", (0.55, 0.55, 0.56), verts=16)
    p.cyl(0.04, 0.12, (0, 0, 0.19), "PROP", plast, verts=16)
    for i in range(5):
        a = i / 5 * math.tau
        x, y = math.cos(a) * 0.3, math.sin(a) * 0.3
        p.tube([(0, 0, 0.12), (x * 0.95, y * 0.95, 0.08)], 0.02, "PROP", plast, seg=6)
        p.sphere(0.028, (x, y, 0.03), "PROP", (0.02, 0.02, 0.02), scale=(1, 0.6, 1), seg=10, rings=6)
    for x in (-0.25, 0.25):
        p.tube([(x, 0.05, 0.47), (x * 1.05, 0.0, 0.66), (x * 1.05, -0.18, 0.66)], 0.014, "PROP", plast, seg=6)
        p.box((0.06, 0.22, 0.025), (x * 1.05, -0.08, 0.675), "PROP", plast, bevel=0.01)


@prop("common")
def plasticChair(p):
    shell = (0.5, 0.48, 0.42)
    leg = (0.35, 0.35, 0.37)
    p.box((0.42, 0.41, 0.025), (0, 0, 0.45), "PROP", shell, bevel=0.01, seg=3)
    p.box((0.4, 0.02, 0.3), (0, 0.2, 0.68), "PROP", shell, bevel=0.01, seg=3, rot=(math.radians(-10), 0, 0))
    for x in (-0.19, 0.19):
        p.tube([(x, -0.19, 0.0), (x, -0.19, 0.44), (x, 0.19, 0.44), (x, 0.2, 0.0)], 0.011, "METAL", leg, seg=6)
        p.tube([(x, 0.19, 0.44), (x, 0.23, 0.84)], 0.01, "METAL", leg, seg=6)


@prop("common")
def watercooler(p):
    white = (0.72, 0.71, 0.68)
    p.box((0.32, 0.33, 0.95), (0, 0, 0.475), "PROP", white, bevel=0.015, seg=3)
    p.box((0.2, 0.06, 0.03), (0, -0.17, 0.62), "METAL", (0.4, 0.4, 0.42), bevel=0.004)
    p.box((0.03, 0.03, 0.04), (-0.05, -0.19, 0.7), "PROP", (0.6, 0.05, 0.04), bevel=0.006)
    p.box((0.03, 0.03, 0.04), (0.05, -0.19, 0.7), "PROP", (0.05, 0.2, 0.6), bevel=0.006)
    p.box((0.18, 0.08, 0.015), (0, -0.19, 0.52), "METAL", (0.5, 0.5, 0.52), bevel=0.003)
    p.lathe([(0.0, 0.95), (0.03, 0.95), (0.03, 1.0), (0.13, 1.06), (0.135, 1.3), (0.12, 1.36), (0.0, 1.37)], (0, 0, 0), "GLASS", (0.45, 0.62, 0.72), seg=28)


@prop("common")
def wetfloor(p):
    yel = (0.75, 0.55, 0.02)
    for s in (-1, 1):
        p.box((0.3, 0.012, 0.62), (0, s * 0.07, 0.31), "PROP", yel, bevel=0.006, rot=(s * math.radians(12), 0, 0))
        p.box((0.22, 0.003, 0.12), (0, s * 0.085, 0.45), "PROP", (0.03, 0.03, 0.03), bevel=0.0, rot=(s * math.radians(12), 0, 0))
    p.box((0.12, 0.05, 0.03), (0, 0, 0.62), "PROP", yel, bevel=0.01)


@prop("common")
def cardboard(p):
    card = (0.42, 0.3, 0.17)
    tape = (0.55, 0.45, 0.3)
    for (w, d, h, x, y, z, r) in [(0.6, 0.4, 0.4, 0.0, 0.0, 0.2, 0.05), (0.45, 0.35, 0.3, 0.05, -0.02, 0.55, -0.15), (0.35, 0.3, 0.25, 0.7, 0.1, 0.125, 0.3)]:
        c = jitter(card, 0.1)
        p.box((w, d, h), (x, y, z), "PROP", c, bevel=0.006, rot=(0, 0, r))
        p.box((0.06, d + 0.004, 0.004), (x, y, z + h / 2), "PROP", tape, bevel=0.0, rot=(0, 0, r))


@prop("common", footprint=(0.95, 0.5))
def lockers(p):
    green = (0.24, 0.3, 0.27)
    for i in range(3):
        x = -0.31 + i * 0.31
        p.box((0.3, 0.45, 1.8), (x, 0, 0.9), "PROP", jitter(green, 0.05), bevel=0.004)
        for k in range(5):
            p.box((0.14, 0.004, 0.012), (x, -0.226, 1.55 + k * 0.03), "DARK", (0.01, 0.01, 0.01), bevel=0.0)
            p.box((0.14, 0.004, 0.012), (x, -0.226, 0.25 + k * 0.03), "DARK", (0.01, 0.01, 0.01), bevel=0.0)
        p.box((0.02, 0.03, 0.12), (x + 0.1, -0.235, 1.0), "METAL", (0.5, 0.5, 0.52), bevel=0.004)
        p.box((0.06, 0.004, 0.035), (x, -0.226, 1.68), "PROP", (0.75, 0.73, 0.65), bevel=0.0)


# ---------------------------------------------------------------------------
# office / hospital / parking
# ---------------------------------------------------------------------------
@prop("office")
def deskset(p):
    top = (0.42, 0.36, 0.28)
    p.box((1.4, 0.7, 0.03), (0, 0, 0.735), "WOOD", top, bevel=0.004)
    for x in (-0.67, 0.67):
        p.box((0.03, 0.66, 0.72), (x, 0, 0.36), "PROP", (0.2, 0.2, 0.21), bevel=0.004)
    p.box((1.3, 0.02, 0.4), (0, 0.32, 0.5), "PROP", (0.2, 0.2, 0.21), bevel=0.003)
    p.box((0.4, 0.6, 0.6), (0.44, 0.0, 0.31), "METAL", (0.3, 0.3, 0.31), bevel=0.004)  # drawer pedestal
    for k in range(3):
        p.box((0.36, 0.004, 0.17), (0.44, -0.302, 0.12 + k * 0.19), "METAL", (0.33, 0.33, 0.34), bevel=0.002)
        p.box((0.1, 0.012, 0.012), (0.44, -0.31, 0.18 + k * 0.19), "METAL", (0.6, 0.6, 0.6), bevel=0.003)
    # monitor, keyboard, papers, mug
    p.box((0.56, 0.035, 0.34), (-0.1, 0.12, 1.02), "PROP", (0.03, 0.03, 0.035), bevel=0.006)
    p.box((0.52, 0.004, 0.3), (-0.1, 0.101, 1.02), "GLASS", (0.04, 0.05, 0.06), bevel=0.0)
    p.box((0.05, 0.05, 0.14), (-0.1, 0.16, 0.82), "PROP", (0.04, 0.04, 0.045), bevel=0.006)
    p.box((0.22, 0.18, 0.012), (-0.1, 0.15, 0.756), "PROP", (0.04, 0.04, 0.045), bevel=0.004)
    p.box((0.44, 0.15, 0.022), (-0.12, -0.17, 0.762), "PROP", (0.06, 0.06, 0.065), bevel=0.005)
    p.box((0.06, 0.1, 0.03), (0.2, -0.18, 0.765), "PROP", (0.06, 0.06, 0.065), bevel=0.012)
    for k in range(4):
        p.box((0.21, 0.297, 0.002), (0.42 + R.uniform(-0.03, 0.03), -0.05 + R.uniform(-0.03, 0.03), 0.752 + k * 0.002), "PROP", (0.8, 0.8, 0.77), bevel=0.0, rot=(0, 0, R.uniform(-0.3, 0.3)))
    p.lathe([(0.0, 0.75), (0.035, 0.75), (0.04, 0.85), (0.036, 0.851), (0.0, 0.76)], (-0.55, -0.15, 0), "PROP", (0.7, 0.15, 0.1), seg=16)


@prop("hospital", footprint=(1.0, 2.1))
def hospitalbed(p):
    frame = (0.55, 0.56, 0.58)
    p.box((0.9, 2.0, 0.16), (0, 0, 0.62), "FABRIC", (0.62, 0.66, 0.68), bevel=0.05, seg=3)
    p.box((0.62, 0.38, 0.12), (0, 0.72, 0.75), "FABRIC", (0.75, 0.75, 0.73), bevel=0.05, seg=3)
    p.box((0.88, 1.2, 0.05), (0, -0.35, 0.72), "FABRIC", (0.45, 0.52, 0.58), bevel=0.03, seg=2)  # blanket
    p.box((0.94, 2.04, 0.06), (0, 0, 0.51), "METAL", frame, bevel=0.01)
    for y in (-1.0, 1.0):
        p.box((0.96, 0.04, 0.55), (0, y, 0.75 if y > 0 else 0.68), "PROP", (0.62, 0.58, 0.5), bevel=0.012)
    for x in (-0.47, 0.47):
        p.tube([(x, -0.6, 0.62), (x, -0.6, 0.82), (x, 0.4, 0.82), (x, 0.4, 0.62)], 0.012, "METAL", frame, seg=6)
        p.tube([(x, -0.2, 0.62), (x, -0.2, 0.82)], 0.008, "METAL", frame, seg=6)
        for y in (-0.92, 0.92):
            p.tube([(x * 0.9, y, 0.5), (x * 0.9, y, 0.12)], 0.02, "METAL", frame, seg=8)
            p.cyl(0.05, 0.035, (x * 0.9, y, 0.06), "PROP", (0.05, 0.05, 0.05), verts=14, axis="X")
    # IV stand
    p.tube([(0.62, 0.85, 0.0), (0.62, 0.85, 1.85)], 0.012, "METAL", frame, seg=8)
    p.tube([(0.5, 0.85, 1.8), (0.74, 0.85, 1.8)], 0.008, "METAL", frame, seg=6)
    p.box((0.1, 0.03, 0.18), (0.55, 0.85, 1.66), "GLASS", (0.7, 0.72, 0.6), bevel=0.015)


@prop("parking", footprint=(1.9, 4.5))
def car(p):
    """A dusty abandoned hatchback."""
    paint = (0.3, 0.3, 0.32)
    p.box((1.76, 3.95, 0.62), (0, 0, 0.6), "METAL", paint, bevel=0.12, seg=4)
    p.box((1.56, 2.2, 0.55), (0, 0.25, 1.12), "METAL", paint, bevel=0.14, seg=4)
    p.box((1.58, 2.0, 0.42), (0, 0.25, 1.13), "GLASS", (0.05, 0.06, 0.07), bevel=0.1, seg=3)
    p.box((1.5, 0.9, 0.04), (0, -1.55, 0.92), "METAL", paint, bevel=0.06, rot=(math.radians(-4), 0, 0))  # hood
    for x in (-0.76, 0.76):
        for y in (-1.35, 1.35):
            p.cyl(0.32, 0.22, (x, y, 0.32), "PROP", (0.03, 0.03, 0.03), verts=24, axis="X", bevel=0.04)
            p.cyl(0.19, 0.225, (x, y, 0.32), "METAL", (0.4, 0.4, 0.42), verts=16, axis="X", bevel=0.01)
    for x in (-0.62, 0.62):
        p.box((0.32, 0.05, 0.12), (x, -2.1, 0.72), "GLASS", (0.75, 0.72, 0.6), bevel=0.03)
        p.box((0.3, 0.05, 0.1), (x, 2.1, 0.75), "EMIS", (0.25, 0.01, 0.01), bevel=0.03)
    p.box((0.7, 0.04, 0.14), (0, -2.12, 0.45), "DARK", (0.02, 0.02, 0.02), bevel=0.02)
    p.box((0.42, 0.02, 0.12), (0, 2.12, 0.62), "PROP", (0.8, 0.8, 0.75), bevel=0.005)
    p.box((1.8, 0.12, 0.18), (0, -2.08, 0.38), "PROP", (0.06, 0.06, 0.07), bevel=0.05)
    p.box((1.8, 0.12, 0.18), (0, 2.08, 0.38), "PROP", (0.06, 0.06, 0.07), bevel=0.05)


# ---------------------------------------------------------------------------
# night station (きさらぎ駅)
# ---------------------------------------------------------------------------
@prop("station", footprint=(2.9, 20.0))
def trainCar(p):
    """A commuter car standing at the platform, doors open, lights flickering.
    20 m long along Y, 2.85 m wide, floor at platform height; the open side
    faces -X so it can stand on either side of an island platform."""
    L, W, H = 19.6, 2.85, 2.75
    z0 = 1.05  # car floor above the rails
    body = (0.62, 0.63, 0.64)
    stripe = (0.08, 0.32, 0.18)
    win = (0.04, 0.05, 0.055)
    # underframe and bogies
    p.box((W - 0.3, L - 1.0, 0.55), (0, 0, z0 - 0.3), "METAL", (0.08, 0.08, 0.085), bevel=0.02)
    for yb in (-L / 2 + 2.6, L / 2 - 2.6):
        p.box((2.2, 2.4, 0.45), (0, yb, 0.42), "METAL", (0.06, 0.06, 0.06), bevel=0.03)
        for yy in (-0.85, 0.85):
            for xx in (-0.72, 0.72):
                p.cyl(0.43, 0.12, (xx, yb + yy, 0.43), "METAL", (0.1, 0.1, 0.1), verts=20, axis="X", bevel=0.01)
    # shell: floor, roof, end walls and the closed side
    p.box((W, L, 0.12), (0, 0, z0), "PROP", (0.25, 0.25, 0.26), bevel=0.01)
    p.box((W + 0.04, L + 0.04, 0.3), (0, 0, z0 + H + 0.1), "METAL", body, bevel=0.15, seg=3)
    for yy in (-L / 2, L / 2):
        p.box((W, 0.1, H), (0, yy, z0 + H / 2), "METAL", body, bevel=0.02)
        p.box((0.7, 0.02, 1.6), (0, yy - 0.06 * (1 if yy > 0 else -1), z0 + 1.2), "GLASS", win, bevel=0.0)
    doors = [-L / 2 + 2.3, -L / 2 + 7.2, L / 2 - 7.2, L / 2 - 2.3]
    for side in (-1, 1):
        x = side * W / 2
        segs = []
        edges = [-L / 2] + sum([[d - 0.68, d + 0.68] for d in doors], []) + [L / 2]
        for a, b in zip(edges[0::2], edges[1::2]):
            segs.append((a, b))
        for a, b in segs:
            ln = b - a
            cy = (a + b) / 2
            p.box((0.06, ln, 0.95), (x, cy, z0 + 0.5), "METAL", body, bevel=0.01)
            p.box((0.06, ln, 0.5), (x, cy, z0 + H - 0.25), "METAL", body, bevel=0.01)
            p.box((0.07, ln, 0.12), (x, cy, z0 + 0.92), "PROP", stripe, bevel=0.0)
            p.box((0.04, ln - 0.3, 1.15), (x, cy, z0 + 1.55), "GLASS", win, bevel=0.0)
            nposts = max(1, int(ln / 1.3))
            for k in range(nposts + 1):
                yy = a + 0.15 + (ln - 0.3) * k / nposts
                p.box((0.07, 0.08, 1.15), (x, yy, z0 + 1.55), "METAL", body, bevel=0.01)
        for d in doors:
            if side == -1:
                # open doorway: door leaves slid back into the walls, frame and step
                p.box((0.08, 0.06, 2.0), (x, d - 0.68, z0 + 1.0), "METAL", (0.5, 0.5, 0.52), bevel=0.01)
                p.box((0.08, 0.06, 2.0), (x, d + 0.68, z0 + 1.0), "METAL", (0.5, 0.5, 0.52), bevel=0.01)
                p.box((0.08, 1.42, 0.08), (x, d, z0 + 2.04), "METAL", (0.5, 0.5, 0.52), bevel=0.01)
                p.box((0.3, 1.3, 0.03), (x - 0.12, d, z0 + 0.06), "METAL", (0.45, 0.45, 0.46), bevel=0.004)
            else:
                p.box((0.06, 1.36, 2.0), (x, d, z0 + 1.0), "METAL", (0.55, 0.56, 0.57), bevel=0.01)
                p.box((0.065, 0.5, 0.9), (x, d - 0.33, z0 + 1.45), "GLASS", win, bevel=0.0)
                p.box((0.065, 0.5, 0.9), (x, d + 0.33, z0 + 1.45), "GLASS", win, bevel=0.0)
                p.box((0.07, 1.36, 0.12), (x, d, z0 + 0.92), "PROP", stripe, bevel=0.0)
    # interior: long seats, grab poles, straps, ceiling lights, ads
    seat = (0.32, 0.08, 0.06)
    for side in (-1, 1):
        x = side * (W / 2 - 0.33)
        for a, b in zip([-L / 2 + 0.2] + [d + 0.75 for d in doors], [d - 0.75 for d in doors] + [L / 2 - 0.2]):
            ln = b - a
            if ln < 0.6:
                continue
            p.box((0.48, ln, 0.12), (x, (a + b) / 2, z0 + 0.46), "FABRIC", seat, bevel=0.03, seg=1)
            p.box((0.1, ln, 0.45), (side * (W / 2 - 0.1), (a + b) / 2, z0 + 0.78), "FABRIC", seat, bevel=0.03, seg=1)
            p.box((0.42, ln, 0.3), (x, (a + b) / 2, z0 + 0.25), "METAL", (0.4, 0.4, 0.42), bevel=0.01)
            p.tube([(side * (W / 2 - 0.35), a, z0 + 1.95), (side * (W / 2 - 0.35), b, z0 + 1.95)], 0.015, "METAL", (0.7, 0.7, 0.72), seg=6, cap=True)
            for k in range(int(ln / 0.45)):
                yy = a + 0.25 + k * 0.45
                p.box((0.012, 0.012, 0.22), (side * (W / 2 - 0.35), yy, z0 + 1.83), "PROP", (0.75, 0.75, 0.72), bevel=0.0)
                p.box((0.02, 0.1, 0.1), (side * (W / 2 - 0.35), yy, z0 + 1.67), "PROP", (0.75, 0.75, 0.72), bevel=0.0)
        for d in doors:
            p.tube([(side * 0.55, d - 0.85, z0), (side * 0.55, d - 0.85, z0 + H)], 0.018, "METAL", (0.7, 0.7, 0.72), seg=6)
    for k in range(9):
        y = -L / 2 + 1.2 + k * (L - 2.4) / 8
        for xx in (-0.55, 0.55):
            p.box((0.12, 1.4, 0.04), (xx, y, z0 + H - 0.08), "EMIS", (0.95, 0.97, 1.0), bevel=0.01)
    p.box((W - 0.2, L - 0.4, 0.04), (0, 0, z0 + H - 0.02), "PROP", (0.72, 0.72, 0.7), bevel=0.0)
    for side in (-1, 1):
        for k in range(6):
            y = -L / 2 + 3.0 + k * 2.75
            p.box((0.02, 0.9, 0.3), (side * (W / 2 - 0.04), y, z0 + 2.35), "PROP", ((0.7, 0.25, 0.1), (0.15, 0.3, 0.6), (0.75, 0.7, 0.2))[k % 3], bevel=0.0)
    # destination board above the end windows
    p.box((0.9, 0.04, 0.2), (0, -L / 2 - 0.06, z0 + H - 0.2), "EMIS", (1.0, 0.45, 0.05), bevel=0.0)


@prop("station", footprint=(4.0, 4.0), floor=False)
def track(p):
    """One 4 m bay of ballasted track: sleepers, two rails, a gutter."""
    ball = (0.2, 0.19, 0.18)
    p.box((3.9, 4.0, 0.1), (0, 0, 0.05), "PROP", ball, bevel=0.0)
    for k in range(7):
        y = -2.0 + 0.3 + k * 0.6
        p.box((2.4, 0.22, 0.14), (0, y, 0.15), "PROP", jitter((0.3, 0.28, 0.25), 0.15), bevel=0.01, seg=1)
    for x in (-0.7175, 0.7175):
        p.extrude([(-0.035, 0.0), (0.035, 0.0), (0.035, 0.015), (0.01, 0.03), (0.01, 0.13), (0.03, 0.14), (0.03, 0.17), (-0.03, 0.17), (-0.03, 0.14), (-0.01, 0.13), (-0.01, 0.03), (-0.035, 0.015)], 4.0, (x, 0, 0.22), "METAL", (0.28, 0.2, 0.15), bevel=0.0)
        p.box((0.02, 4.0, 0.008), (x, 0, 0.395), "METAL", (0.7, 0.7, 0.72), bevel=0.0)


@prop("station", floor=False)
def platformEdge(p):
    """4 m of platform edge: white stone coping, the yellow tactile strip and
    the edge face dropping to the track bed. Sits on the platform cell edge."""
    p.box((0.3, 4.0, 0.06), (0.15, 0, -0.03), "PROP", (0.7, 0.69, 0.65), bevel=0.004)
    p.box((1.15, 4.0, 1.1), (0.15, 0, -0.6), "PROP", (0.3, 0.3, 0.29), bevel=0.01)
    p.box((0.3, 4.0, 0.008), (0.62, 0, 0.004), "PROP", (0.78, 0.6, 0.06), bevel=0.0)
    # raised guidance bars, merged into four long ribs (cheap at distance)
    for x in (0.52, 0.587, 0.653, 0.72):
        p.box((0.025, 3.96, 0.006), (x, 0, 0.011), "PROP", (0.8, 0.62, 0.07), bevel=0.0)


@prop("station")
def stationSign(p):
    """Hanging station-name board: 2.4 m white panel on rods (sign atlas)."""
    p.box((2.4, 0.08, 0.6), (0, 0, 2.8), "METAL", (0.75, 0.75, 0.74), bevel=0.01)
    # lit white panel; the name sits in the middle metre (atlas cells are 2:1)
    for side in (-1, 1):
        y = side * 0.045
        p.box((1.0, 0.01, 0.5), (0, y, 2.8), "SIGNINV", (0.85, 0.87, 0.9), bevel=0.0, sign=1, rot=(0, 0, 0 if side < 0 else math.pi))
        for x in (-0.825, 0.825):
            p.box((0.65, 0.01, 0.5), (x, y, 2.8), "EMIS", (0.58, 0.59, 0.61), bevel=0.0)
        p.box((2.3, 0.012, 0.05), (0, y * 1.02, 2.6), "EMIS", (0.05, 0.25, 0.6), bevel=0.0)
    for x in (-1.0, 1.0):
        p.tube([(x, 0, 3.1), (x, 0, 4.4)], 0.012, "METAL", (0.3, 0.3, 0.3), seg=6)


@prop("station")
def departureBoard(p):
    """Hanging LED departures board (amber dot-matrix)."""
    p.box((1.9, 0.18, 0.55), (0, 0, 2.85), "PROP", (0.03, 0.03, 0.035), bevel=0.02)
    for side in (-1, 1):
        for row in range(3):
            p.box((1.6, 0.005, 0.1), (0, side * 0.093, 2.98 - row * 0.14), "EMIS", (1.0, 0.42, 0.04) if row else (0.2, 1.0, 0.25), bevel=0.0)
    for x in (-0.8, 0.8):
        p.tube([(x, 0, 3.12), (x, 0, 4.4)], 0.012, "METAL", (0.3, 0.3, 0.3), seg=6)


@prop("station")
def stationClock(p):
    p.cyl(0.24, 0.08, (0, 0, 3.0), "PROP", (0.06, 0.06, 0.06), verts=32, axis="Y")
    for side in (-1, 1):
        p.cyl(0.22, 0.01, (0, side * 0.04, 3.0), "EMIS", (0.85, 0.85, 0.8), verts=32, axis="Y")
        p.box((0.012, 0.012, 0.14), (0.03, side * 0.05, 3.05), "DARK", (0.0, 0.0, 0.0), bevel=0.0, rot=(0, 0.6, 0))
        p.box((0.01, 0.012, 0.19), (-0.05, side * 0.05, 2.95), "DARK", (0.0, 0.0, 0.0), bevel=0.0, rot=(0, 2.4, 0))
    p.tube([(0, 0, 3.24), (0, 0, 4.4)], 0.015, "METAL", (0.3, 0.3, 0.3), seg=6)


@prop("station", footprint=(1.1, 1.6))
def ticketGate(p):
    """Automatic ticket gate cabinet with flap doors and card reader."""
    grey = (0.62, 0.63, 0.64)
    p.box((0.32, 1.6, 1.0), (0, 0, 0.5), "PROP", grey, bevel=0.03, seg=3)
    p.box((0.3, 0.5, 0.06), (0, -0.55, 1.02), "PROP", (0.08, 0.08, 0.09), bevel=0.02)
    p.box((0.22, 0.22, 0.01), (0, -0.55, 1.055), "EMIS", (0.2, 0.55, 1.0), bevel=0.0)
    p.box((0.2, 0.3, 0.04), (0, 0.45, 1.02), "EMIS", (0.08, 0.6, 0.2), bevel=0.0)
    for side in (-1, 1):
        p.box((0.36, 0.05, 0.4), (side * 0.32, 0.0, 0.75), "PROP", (0.75, 0.2, 0.15), bevel=0.02)
    p.box((0.34, 1.62, 0.08), (0, 0, 0.04), "PROP", (0.05, 0.05, 0.05), bevel=0.01)


@prop("station", footprint=(0.9, 0.5))
def trashSort(p):
    """Station recycling bins: three slots (cans / bottles / burnables)."""
    for i, c in enumerate([(0.12, 0.3, 0.6), (0.6, 0.35, 0.05), (0.5, 0.08, 0.06)]):
        x = -0.3 + i * 0.3
        p.box((0.28, 0.45, 0.9), (x, 0, 0.45), "PROP", (0.6, 0.6, 0.62), bevel=0.02)
        p.box((0.24, 0.02, 0.15), (x, -0.23, 0.72), "PROP", c, bevel=0.0)
        p.cyl(0.07, 0.04, (x, -0.12, 0.92), "DARK", (0.0, 0.0, 0.0), verts=16)


@prop("station", footprint=(0.7, 0.7))
def stationPillar(p):
    """A square platform column clad in tiles, with a mirror and fire alarm."""
    p.box((0.62, 0.62, 4.5), (0, 0, 2.25), "PROP", (0.8, 0.8, 0.77), bevel=0.02)
    p.box((0.64, 0.64, 0.12), (0, 0, 0.06), "PROP", (0.2, 0.2, 0.21), bevel=0.01)
    for side in (-1, 1):
        p.box((0.6, 0.012, 0.18), (0, side * 0.316, 2.3), "PROP", (0.1, 0.25, 0.55), bevel=0.0)
    p.box((0.16, 0.06, 0.16), (0.2, -0.33, 1.4), "PROP", (0.75, 0.08, 0.06), bevel=0.02)
    p.box((0.04, 0.02, 0.04), (0.2, -0.36, 1.4), "EMIS", (1.0, 0.1, 0.05), bevel=0.0)


# ---------------------------------------------------------------------------
# dead mall
# ---------------------------------------------------------------------------
@prop("mall", footprint=(4.0, 0.4))
def storefront(p):
    """A 4 m shop front spanning a cell edge: aluminium mullions, dark glass,
    a lit sign band and a half-open roller shutter over the doorway.
    Centre at the edge, glass in the plane y = 0, outside is -Y."""
    alu = (0.55, 0.56, 0.58)
    glass = (0.035, 0.04, 0.045)
    H = 3.2
    p.box((4.0, 0.25, 0.55), (0, 0, H + 0.27), "PROP", (0.12, 0.12, 0.13), bevel=0.01)
    p.box((0.76, 0.02, 0.36), (0, -0.13, H + 0.27), "SIGN", (0.95, 0.9, 0.8), bevel=0.0, sign=1)
    for x in (-2.0, -0.75, 0.75, 2.0):
        p.box((0.08, 0.14, H), (x, 0, H / 2), "METAL", alu, bevel=0.006, seg=1)
    p.box((4.0, 0.14, 0.08), (0, 0, H), "METAL", alu, bevel=0.006, seg=1)
    for a, b in ((-2.0, -0.75), (0.75, 2.0)):
        p.box((b - a - 0.06, 0.02, H - 0.35), ((a + b) / 2, 0, (H - 0.35) / 2 + 0.3), "GLASS", glass, bevel=0.0)
        p.box((b - a, 0.16, 0.3), ((a + b) / 2, 0, 0.15), "METAL", alu, bevel=0.006, seg=1)
    # roller shutter, jammed a third of the way down over the doorway
    p.cyl(0.18, 1.5, (0, 0.18, H - 0.1), "METAL", (0.4, 0.4, 0.42), verts=16, axis="X")
    for k in range(8):
        z = H - 0.25 - k * 0.11
        p.box((1.5, 0.03, 0.1), (0, 0.05, z), "METAL", (0.5, 0.51, 0.52), bevel=0.0)
    p.box((1.5, 0.05, 0.04), (0, 0.05, H - 0.25 - 8 * 0.11 + 0.03), "METAL", (0.2, 0.2, 0.2), bevel=0.01)


@prop("mall", footprint=(1.6, 9.0))
def escalator(p):
    """A dead escalator rising 5 m into the dark: steps, balustrades with
    glass, black handrails, comb plates."""
    rise, run = 4.6, 8.0
    ang = math.atan2(rise, run)
    steel = (0.5, 0.5, 0.52)
    n = 26
    for k in range(n):
        t = k / (n - 1)
        y = -run / 2 + t * run
        z = t * rise
        p.box((1.0, run / n + 0.02, 0.04), (0, y, z + 0.1), "METAL", (0.3, 0.3, 0.31), bevel=0.004)
        p.box((1.0, 0.02, rise / n), (0, y - run / n / 2, z + 0.1 - rise / n / 2), "METAL", (0.25, 0.25, 0.26), bevel=0.002)
        p.box((0.02, run / n, 0.005), (-0.47, y, z + 0.125), "PROP", (0.7, 0.55, 0.05), bevel=0.0)
        p.box((0.02, run / n, 0.005), (0.47, y, z + 0.125), "PROP", (0.7, 0.55, 0.05), bevel=0.0)
    for side in (-1, 1):
        x = side * 0.62
        p.box((0.12, math.hypot(run, rise) + 1.0, 0.95), (x, 0, rise / 2 + 0.45), "METAL", steel, bevel=0.01, rot=(ang, 0, 0))
        p.box((0.03, math.hypot(run, rise) + 0.6, 0.85), (x, 0, rise / 2 + 1.2), "GLASS", (0.05, 0.06, 0.06), bevel=0.0, rot=(ang, 0, 0))
        p.tube([(x, -run / 2 - 1.2, 1.0), (x, -run / 2 - 0.4, 1.0), (x, run / 2 + 0.4, rise + 1.0), (x, run / 2 + 1.2, rise + 1.0)], 0.04, "PROP", (0.02, 0.02, 0.02), seg=8)
    p.box((1.4, 1.2, 0.08), (0, -run / 2 - 0.6, 0.04), "METAL", steel, bevel=0.005)
    p.box((1.4, 1.4, 0.3), (0, run / 2 + 0.7, rise - 0.05), "METAL", steel, bevel=0.005)
    p.box((1.5, math.hypot(run, rise), 0.6), (0, 0, rise / 2 - 0.35), "METAL", (0.42, 0.42, 0.44), bevel=0.01, rot=(ang, 0, 0))


@prop("mall", footprint=(2.4, 1.2))
def planter(p):
    """Raised planter box with a palm and low shrubs."""
    p.box((2.4, 1.2, 0.55), (0, 0, 0.275), "PROP", (0.45, 0.42, 0.37), bevel=0.02)
    p.box((2.26, 1.06, 0.04), (0, 0, 0.53), "PROP", (0.07, 0.05, 0.035), bevel=0.0)
    for i in range(14):
        a = R.random() * math.tau
        x, y = R.uniform(-0.95, 0.95), R.uniform(-0.4, 0.4)
        p.sphere(R.uniform(0.15, 0.26), (x, y, 0.6), "PROP", jitter((0.06, 0.15, 0.05), 0.3), scale=(1, 1, 0.7), seg=10, rings=6)
    trunk = (0.24, 0.18, 0.12)
    p.tube([(0.2, 0.0, 0.55), (0.22, 0.05, 1.6), (0.18, 0.08, 2.5)], 0.07, "WOOD", trunk, seg=10)
    for i in range(10):
        a = i / 10 * math.tau
        tip = (0.18 + math.cos(a) * 1.1, 0.08 + math.sin(a) * 1.1, 2.2 - R.random() * 0.4)
        mid = (0.18 + math.cos(a) * 0.55, 0.08 + math.sin(a) * 0.55, 2.62)
        p.tube([(0.18, 0.08, 2.5), mid, tip], 0.012, "PROP", (0.12, 0.2, 0.06), seg=4)
        for k in range(8):
            t = 0.25 + k / 10
            px = 0.18 + (tip[0] - 0.18) * t
            py = 0.08 + (tip[1] - 0.08) * t
            pz = 2.5 + (2.62 - 2.5) * min(1, t * 2) - max(0, t - 0.5) * 0.8
            p.box((0.32, 0.05, 0.004), (px, py, pz), "PROP", jitter((0.1, 0.22, 0.06), 0.2), bevel=0.0, rot=(0.4, 0, a + math.pi / 2))
            p.box((0.32, 0.05, 0.004), (px, py, pz), "PROP", jitter((0.1, 0.22, 0.06), 0.2), bevel=0.0, rot=(-0.4, 0, a + math.pi / 2))


@prop("mall", footprint=(5.0, 5.0))
def fountain(p):
    """Dry atrium fountain: stepped stone basin, centre tier, coins."""
    stone = (0.55, 0.53, 0.5)
    p.lathe([(0.0, 0.0), (2.4, 0.0), (2.45, 0.05), (2.45, 0.42), (2.3, 0.48), (2.2, 0.48), (2.2, 0.15), (0.0, 0.15)], (0, 0, 0), "PROP", stone, seg=48)
    p.lathe([(0.0, 0.15), (0.35, 0.15), (0.3, 0.9), (0.95, 1.05), (1.0, 1.15), (0.9, 1.18), (0.25, 1.08), (0.18, 1.6), (0.3, 1.7), (0.0, 1.75)], (0, 0, 0), "PROP", stone, seg=40)
    p.cyl(2.18, 0.02, (0, 0, 0.16), "PROP", (0.12, 0.15, 0.14), verts=48)  # stagnant water film
    for i in range(30):
        a = R.random() * math.tau
        r = R.uniform(0.5, 2.0)
        p.cyl(0.012, 0.003, (math.cos(a) * r, math.sin(a) * r, 0.172), "METAL", (0.7, 0.55, 0.25), verts=8, bevel=0.0)


@prop("mall", footprint=(1.6, 0.6))
def mallBench(p):
    wood = (0.32, 0.22, 0.13)
    p.box((1.6, 0.5, 0.06), (0, 0, 0.44), "WOOD", wood, bevel=0.01)
    for x in (-0.65, 0.65):
        p.box((0.08, 0.45, 0.42), (x, 0, 0.21), "METAL", (0.12, 0.12, 0.13), bevel=0.01)
    p.box((1.6, 0.06, 0.4), (0, 0.24, 0.72), "WOOD", wood, bevel=0.01, rot=(math.radians(-8), 0, 0))
    for x in (-0.65, 0.65):
        p.box((0.06, 0.06, 0.42), (x, 0.25, 0.62), "METAL", (0.12, 0.12, 0.13), bevel=0.008)


@prop("mall", footprint=(0.6, 1.0))
def cart(p):
    """Abandoned shopping cart."""
    wire = (0.55, 0.55, 0.57)
    for k in range(9):
        x = -0.24 + k * 0.06
        p.tube([(x, -0.42, 0.55), (x, 0.42, 0.62)], 0.004, "METAL", wire, seg=4)
    for k in range(6):
        z = 0.45 + k * 0.08
        p.tube([(-0.26, -0.42, z), (0.26, -0.42, z)], 0.004, "METAL", wire, seg=4)
        p.tube([(-0.28, 0.42, z + 0.07), (0.28, 0.42, z + 0.07)], 0.004, "METAL", wire, seg=4)
        p.tube([(-0.26, -0.42, z), (-0.28, 0.42, z + 0.07)], 0.004, "METAL", wire, seg=4)
        p.tube([(0.26, -0.42, z), (0.28, 0.42, z + 0.07)], 0.004, "METAL", wire, seg=4)
    p.tube([(-0.3, 0.5, 1.0), (0.3, 0.5, 1.0)], 0.015, "PROP", (0.6, 0.05, 0.04), seg=8)
    for x in (-0.22, 0.22):
        p.tube([(x, -0.42, 0.45), (x * 0.9, -0.38, 0.1), (x * 0.9, 0.38, 0.1), (x, 0.42, 0.5), (x * 1.3, 0.5, 1.0)], 0.01, "METAL", wire, seg=6)
        for y in (-0.36, 0.36):
            p.cyl(0.05, 0.03, (x * 0.9, y, 0.05), "PROP", (0.05, 0.05, 0.05), verts=12, axis="X")


@prop("mall", footprint=(0.5, 0.5))
def mannequinProp(p):
    """Faceless shop-window mannequin on a stand."""
    skin = (0.78, 0.77, 0.74)
    p.cyl(0.18, 0.02, (0, 0, 0.01), "METAL", (0.4, 0.4, 0.42), verts=24)
    p.tube([(0, 0, 0.02), (0, 0, 0.75)], 0.012, "METAL", (0.5, 0.5, 0.52), seg=6)
    for x in (-0.09, 0.09):
        p.tube([(x, 0, 0.05), (x * 1.1, 0.02, 0.5), (x, 0, 0.95)], 0.06, "PROP", skin, seg=10)
    p.sphere(0.17, (0, 0, 1.05), "PROP", skin, scale=(1.1, 0.75, 0.7), seg=16, rings=10)
    p.sphere(0.16, (0, 0, 1.33), "PROP", skin, scale=(1.05, 0.65, 1.15), seg=16, rings=10)
    for x in (-0.2, 0.2):
        p.tube([(x, 0, 1.48), (x * 1.15, -0.03, 1.2), (x * 1.1, -0.08, 0.95)], 0.035, "PROP", skin, seg=8)
    p.tube([(0, 0, 1.52), (0, 0, 1.6)], 0.045, "PROP", skin, seg=10)
    p.sphere(0.1, (0, 0, 1.72), "PROP", skin, scale=(0.85, 0.95, 1.2), seg=14, rings=10)


@prop("mall", footprint=(2.0, 1.2))
def kiosk(p):
    """Island kiosk with a shuttered counter."""
    p.box((2.0, 1.2, 1.05), (0, 0, 0.525), "PROP", (0.75, 0.73, 0.68), bevel=0.02)
    p.box((2.1, 1.3, 0.06), (0, 0, 1.08), "WOOD", (0.35, 0.22, 0.12), bevel=0.01)
    for x in (-0.95, 0.95):
        for y in (-0.55, 0.55):
            p.tube([(x, y, 1.1), (x, y, 2.4)], 0.02, "METAL", (0.5, 0.5, 0.52), seg=6)
    p.box((2.2, 1.4, 0.3), (0, 0, 2.55), "PROP", (0.6, 0.1, 0.08), bevel=0.02)
    p.box((0.52, 0.02, 0.26), (0, -0.71, 2.55), "SIGN", (0.95, 0.9, 0.8), bevel=0.0, sign=1)


@prop("mall", footprint=(1.2, 0.5))
def clothesRack(p):
    p.tube([(-0.55, 0, 0.0), (-0.55, 0, 1.45), (0.55, 0, 1.45), (0.55, 0, 0.0)], 0.012, "METAL", (0.6, 0.6, 0.62), seg=6)
    for x in (-0.55, 0.55):
        p.box((0.06, 0.45, 0.03), (x, 0, 0.015), "METAL", (0.5, 0.5, 0.52), bevel=0.005)
    for k in range(14):
        x = -0.48 + k * 0.074
        c = jitter(R.choice([(0.6, 0.55, 0.45), (0.15, 0.17, 0.25), (0.45, 0.08, 0.06), (0.75, 0.75, 0.72), (0.12, 0.25, 0.15)]), 0.2)
        p.box((0.025, 0.42, 0.75), (x, 0, 1.05), "FABRIC", c, bevel=0.01, rot=(0, R.uniform(-0.08, 0.08), 0))


# ---------------------------------------------------------------------------
# night school
# ---------------------------------------------------------------------------
@prop("school", footprint=(0.7, 1.0))
def schoolDesk(p):
    """Japanese classroom desk and chair: steel tube frames, plywood tops."""
    ply = (0.55, 0.4, 0.24)
    tube = (0.2, 0.23, 0.22)
    p.box((0.65, 0.45, 0.025), (0, 0, 0.72), "WOOD", ply, bevel=0.004)
    p.box((0.6, 0.38, 0.1), (0, 0.02, 0.64), "METAL", tube, bevel=0.004)
    for x in (-0.3, 0.3):
        p.tube([(x, -0.2, 0.0), (x, -0.2, 0.7), (x, 0.2, 0.7), (x, 0.2, 0.0)], 0.011, "METAL", tube, seg=6)
    p.box((0.4, 0.38, 0.02), (0, 0.48, 0.43), "WOOD", ply, bevel=0.004)
    p.box((0.38, 0.015, 0.25), (0, 0.68, 0.66), "WOOD", ply, bevel=0.004)
    for x in (-0.18, 0.18):
        p.tube([(x, 0.3, 0.0), (x, 0.3, 0.42), (x, 0.66, 0.42), (x, 0.66, 0.0)], 0.009, "METAL", tube, seg=6)
        p.tube([(x, 0.66, 0.42), (x, 0.69, 0.8)], 0.009, "METAL", tube, seg=6)


@prop("school", footprint=(1.6, 0.8))
def teacherDesk(p):
    p.box((1.5, 0.75, 0.03), (0, 0, 0.74), "PROP", (0.55, 0.56, 0.5), bevel=0.004)
    p.box((0.5, 0.7, 0.72), (0.48, 0, 0.36), "PROP", (0.55, 0.57, 0.52), bevel=0.004)
    p.box((0.5, 0.7, 0.72), (-0.48, 0, 0.36), "PROP", (0.55, 0.57, 0.52), bevel=0.004)
    for k in range(3):
        p.box((0.46, 0.004, 0.2), (0.48, -0.352, 0.14 + k * 0.23), "METAL", (0.5, 0.52, 0.47), bevel=0.002)
    p.box((0.3, 0.22, 0.04), (-0.3, -0.1, 0.775), "PROP", (0.2, 0.1, 0.05), bevel=0.004)
    p.box((0.21, 0.3, 0.01), (0.2, 0.0, 0.76), "PROP", (0.8, 0.8, 0.76), bevel=0.0, rot=(0, 0, 0.2))


@prop("school", wallMounted=True, floor=False, wall=0.05)
def blackboard(p):
    """Wall-mounted chalkboard with aluminium frame, chalk tray and erasers.
    Back at y = 0 (mount flush on a wall)."""
    p.box((3.6, 0.03, 1.2), (0, -0.015, 1.5), "PROP", (0.06, 0.17, 0.12), bevel=0.002)
    for z in (0.88, 2.12):
        p.box((3.66, 0.04, 0.04), (0, -0.02, z), "METAL", (0.6, 0.6, 0.62), bevel=0.006)
    for x in (-1.82, 1.82):
        p.box((0.04, 0.04, 1.28), (x, -0.02, 1.5), "METAL", (0.6, 0.6, 0.62), bevel=0.006)
    p.box((3.6, 0.1, 0.03), (0, -0.07, 0.87), "METAL", (0.6, 0.6, 0.62), bevel=0.004)
    for x in (-1.2, -0.3, 0.7):
        p.box((0.12, 0.05, 0.03), (x, -0.08, 0.9), "FABRIC", (0.1, 0.1, 0.1), bevel=0.006)
    for k in range(5):
        p.cyl(0.006, 0.07, (0.2 + k * 0.05, -0.08, 0.89), "PROP", ((0.85, 0.85, 0.82), (0.8, 0.3, 0.3), (0.85, 0.8, 0.3))[k % 3], verts=6, axis="X", bevel=0.0)
    # chalk scrawl (faint, broad strokes)
    for k in range(7):
        p.box((R.uniform(0.3, 1.0), 0.002, 0.02), (R.uniform(-1.2, 1.2), -0.032, R.uniform(1.1, 1.95)), "PROP", (0.28, 0.33, 0.3), bevel=0.0, rot=(0, R.uniform(-0.2, 0.2), 0))


@prop("school", footprint=(2.0, 0.4))
def shoeLocker(p):
    """Wooden shoe cubbies (getabako), 5 × 4."""
    wood = (0.4, 0.3, 0.18)
    p.box((2.0, 0.38, 1.6), (0, 0, 0.8), "WOOD", wood, bevel=0.006)
    for i in range(5):
        for j in range(4):
            x = -0.8 + i * 0.4
            z = 0.25 + j * 0.36
            p.box((0.36, 0.3, 0.3), (x, -0.05, z), "DARK", (0.03, 0.025, 0.02), bevel=0.0)
            if R.random() < 0.45:
                p.box((0.1, 0.25, 0.08), (x - 0.06, -0.1, z - 0.11), "PROP", (0.8, 0.8, 0.78), bevel=0.02)
                p.box((0.1, 0.25, 0.08), (x + 0.06, -0.1, z - 0.11), "PROP", (0.8, 0.8, 0.78), bevel=0.02)


# ---------------------------------------------------------------------------
# endless hotel
# ---------------------------------------------------------------------------
@prop("hotel", wallMounted=True, floor=False, wall=0.05)
def hotelDoor(p):
    """Guest-room door in its casing with a brass number plate and lever.
    Back at y = 0 against the wall; the plate uses the sign atlas."""
    wood = (0.24, 0.12, 0.06)
    trim = (0.55, 0.5, 0.42)
    p.box((1.0, 0.06, 2.15), (0, -0.03, 1.075), "WOOD", wood, bevel=0.008)
    for x in (-0.56, 0.56):
        p.box((0.12, 0.08, 2.25), (x, -0.04, 1.125), "WOOD", trim, bevel=0.01)
    p.box((1.24, 0.08, 0.12), (0, -0.04, 2.27), "WOOD", trim, bevel=0.01)
    for (x, z, w, h) in ((0, 1.6, 0.7, 0.75), (0, 0.6, 0.7, 0.75)):
        p.box((w, 0.012, h), (x, -0.065, z), "WOOD", (0.2, 0.1, 0.05), bevel=0.01)
    p.box((0.2, 0.012, 0.09), (0, -0.068, 1.72), "SIGN", (0.75, 0.55, 0.2), bevel=0.0, sign=1)
    p.box((0.04, 0.06, 0.16), (0.38, -0.08, 1.02), "METAL", (0.75, 0.6, 0.3), bevel=0.01)
    p.box((0.13, 0.02, 0.02), (0.33, -0.12, 1.06), "METAL", (0.75, 0.6, 0.3), bevel=0.008)
    p.box((0.05, 0.012, 0.05), (0.38, -0.07, 1.22), "EMIS", (0.9, 0.1, 0.05), bevel=0.0)


@prop("hotel", wallMounted=True, floor=False, wall=0.05)
def sconce(p):
    """Brass wall sconce with a pleated fabric shade (emissive)."""
    p.box((0.1, 0.03, 0.16), (0, -0.015, 1.75), "METAL", (0.6, 0.45, 0.2), bevel=0.01)
    p.tube([(0, -0.03, 1.75), (0, -0.14, 1.78), (0, -0.16, 1.86)], 0.008, "METAL", (0.6, 0.45, 0.2), seg=6)
    p.lathe([(0.11, 0.0), (0.07, 0.19)], (0, -0.16, 1.82), "EMIS", (1.4, 1.0, 0.6), seg=20)


@prop("hotel", footprint=(1.2, 0.45))
def consoleTable(p):
    wood = (0.2, 0.1, 0.05)
    p.box((1.2, 0.42, 0.04), (0, 0, 0.82), "WOOD", wood, bevel=0.008)
    for x in (-0.55, 0.55):
        for y in (-0.17, 0.17):
            p.tube([(x, y, 0.8), (x * 0.95, y * 0.9, 0.0)], 0.018, "WOOD", wood, seg=8)
    p.lathe([(0.0, 0.84), (0.07, 0.84), (0.11, 0.95), (0.08, 1.1), (0.05, 1.16), (0.06, 1.2), (0.0, 1.2)], (0.35, 0, 0), "PROP", (0.55, 0.1, 0.08), seg=20)
    for i in range(9):
        a = i / 9 * math.tau
        p.tube([(0.35, 0, 1.18), (0.35 + math.cos(a) * 0.12, math.sin(a) * 0.1, 1.42 + R.random() * 0.1)], 0.004, "PROP", (0.1, 0.18, 0.06), seg=4)
        p.sphere(0.035, (0.35 + math.cos(a) * 0.12, math.sin(a) * 0.1, 1.44 + R.random() * 0.1), "PROP", (0.45, 0.04, 0.05), seg=8, rings=5)
    p.box((0.9, 0.03, 0.7), (0, 0.19, 1.5), "METAL", (0.55, 0.45, 0.25), bevel=0.01)
    p.box((0.8, 0.01, 0.6), (0, 0.17, 1.5), "GLASS", (0.25, 0.27, 0.28), bevel=0.0)


@prop("hotel", footprint=(0.9, 0.55))
def roomServiceCart(p):
    linen = (0.75, 0.74, 0.7)
    p.box((0.9, 0.55, 0.02), (0, 0, 0.78), "FABRIC", linen, bevel=0.005)
    p.box((0.92, 0.57, 0.3), (0, 0, 0.64), "FABRIC", linen, bevel=0.01)
    for x in (-0.42, 0.42):
        for y in (-0.25, 0.25):
            p.tube([(x, y, 0.5), (x, y, 0.06)], 0.01, "METAL", (0.6, 0.6, 0.62), seg=6)
            p.cyl(0.04, 0.025, (x, y, 0.04), "PROP", (0.05, 0.05, 0.05), verts=10, axis="X")
    for x in (-0.2, 0.2):
        p.sphere(0.13, (x, 0, 0.84), "METAL", (0.7, 0.7, 0.72), scale=(1, 1, 0.55), seg=16, rings=8)
    p.cyl(0.02, 0.18, (0.36, 0.12, 0.88), "GLASS", (0.25, 0.08, 0.06), verts=10)


@prop("hotel", footprint=(0.8, 0.7))
def iceMachine(p):
    p.box((0.75, 0.7, 1.7), (0, 0, 0.85), "PROP", (0.62, 0.63, 0.64), bevel=0.012)
    p.box((0.5, 0.02, 0.3), (0, -0.36, 1.25), "DARK", (0.02, 0.02, 0.02), bevel=0.01)
    p.box((0.55, 0.03, 0.06), (0, -0.37, 1.48), "EMIS", (0.4, 0.75, 1.2), bevel=0.0)
    p.box((0.6, 0.12, 0.02), (0, -0.4, 0.9), "METAL", (0.5, 0.5, 0.52), bevel=0.004)


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------
def extract(ob):
    """Unique (pos, normal, colour, material, uv) vertices + triangle indices,
    converted to the game's axes (x, z, -y)."""
    me = ob.data
    me.calc_loop_triangles()
    try:
        cn = me.corner_normals
        norm = lambda li: cn[li].vector  # noqa: E731
    except AttributeError:
        me.calc_normals_split()
        norm = lambda li: me.loops[li].normal  # noqa: E731
    ao = me.color_attributes.get("ao")
    uvl = me.uv_layers.active
    mats = me.materials
    key2i, verts, idx = {}, [], []
    for tri in me.loop_triangles:
        m = mats[tri.material_index]
        kind = int(m["kind"])
        col = list(m["col"])
        sign = m.get("sign")
        for li in tri.loops:
            vi = me.loops[li].vertex_index
            co = me.vertices[vi].co
            n = norm(li)
            a = ao.data[li].color[0] if ao else 1.0
            a = 0.12 + 0.88 * a
            c = (col[0] * a, col[1] * a, col[2] * a) if kind != 7 else tuple(col)
            uv = tuple(uvl.data[li].uv) if (sign is not None and uvl) else (0.0, 0.0)
            q = lambda x: round(x * 160) / 160  # noqa: E731  (stored as 8 bit anyway)
            v = (round(co.x, 4), round(co.z, 4), round(-co.y, 4), round(n.x, 2), round(n.z, 2), round(-n.y, 2), q(c[0]), q(c[1]), q(c[2]), kind, int(sign or 0), round(uv[0], 4), round(uv[1], 4))
            i = key2i.get(v)
            if i is None:
                i = key2i[v] = len(verts)
                verts.append(v)
            idx.append(i)
    return verts, idx


def write_pack(path, items):
    """Layout (little endian):
    'NPRP' u32 version=1, u32 count, then per prop:
      u8 nameLen, name, pad to 4
      u32 nv, u32 ni, f32 bbox[6] (min xyz, max xyz in game axes)
      i16 pos[nv*3] quantised to bbox (pad to 4)
      i8  nrm[nv*3]                    (pad to 4)
      u8  rgbm[nv*4]: gamma-encoded colour + material id (+64 if sign)
      u16 uv[nv*2]
      u16/u32 idx[ni] (u32 when nv > 65535)                (pad to 4)
    """
    import numpy as np

    out = bytearray(b"NPRP" + struct.pack("<II", 1, len(items)))

    def pad():
        while len(out) % 4:
            out.append(0)

    for name, verts, idx in items:
        v = np.array([x[:9] for x in verts], dtype=np.float64)
        kinds = np.array([x[9] for x in verts], dtype=np.int32)
        signs = np.array([x[10] for x in verts], dtype=np.int32)
        uv = np.array([x[11:13] for x in verts], dtype=np.float64)
        lo, hi = v[:, :3].min(0), v[:, :3].max(0)
        ext = np.maximum(hi - lo, 1e-6)
        nb = name.encode()
        out += struct.pack("<B", len(nb)) + nb
        pad()
        out += struct.pack("<II6f", len(verts), len(idx), *lo, *hi)
        q = np.round((v[:, :3] - lo) / ext * 65535 - 32768).astype(np.int16)
        out += q.tobytes()
        pad()
        out += np.round(np.clip(v[:, 3:6], -1, 1) * 127).astype(np.int8).tobytes()
        pad()
        col = np.round(np.power(np.clip(v[:, 6:9], 0, 1), 1 / 2.2) * 255).astype(np.uint8)
        rgbm = np.concatenate([col, (kinds + 64 * (signs > 0)).astype(np.uint8)[:, None]], axis=1)
        out += rgbm.tobytes()
        out += np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16).tobytes()
        it = np.uint32 if len(verts) > 65535 else np.uint16
        out += np.array(idx, dtype=it).tobytes()
        pad()
    with open(path, "wb") as f:
        f.write(out)
    return len(out)


def preview(ob, path):
    """Render the AO-baked prop (vertex colour × material colour, unlit) from a
    three-quarter view for a quick visual check."""
    sc = bpy.context.scene
    for m in ob.data.materials:
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        at = nt.nodes.new("ShaderNodeVertexColor")
        at.layer_name = "ao"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = (*m["col"], 1)
        nt.links.new(at.outputs["Color"], mix.inputs[7])
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(mix.outputs[2], em.inputs["Color"])
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(em.outputs[0], o.inputs["Surface"])
    import mathutils

    bb = [ob.matrix_world @ mathutils.Vector(c) for c in ob.bound_box]
    lo = mathutils.Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = mathutils.Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = (lo + hi) / 2
    rad = (hi - lo).length / 2
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    d = mathutils.Vector((0.9, -1.6, 0.8)).normalized() * rad * 2.8
    cam.location = ctr + d
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.08, 0.08, 0.09, 1)
    sc.render.resolution_x = sc.render.resolution_y = 384
    sc.cycles.samples = 8
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def run(out, packs, only, prev=None):
    os.makedirs(out, exist_ok=True)
    mpath = os.path.join(out, "manifest.json")
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    by_pack = {}
    for name, (pack, fn, meta) in PROPS.items():
        if packs and pack not in packs:
            continue
        if only and name not in only:
            continue
        by_pack.setdefault(pack, []).append((name, fn, meta))
    for pack, lst in by_pack.items():
        items = []
        info = manifest.get(pack, {}).get("props", {}) if only else {}
        for name, fn, meta in lst:
            t0 = time.time()
            reset()
            p = Prop(name)
            fn(p)
            ob = p.finish(floor=meta.get("floor", True), wall=meta.get("wall"))
            verts, idx = extract(ob)
            items.append((name, verts, idx))
            if prev:
                os.makedirs(prev, exist_ok=True)
                preview(ob, os.path.join(prev, name + ".png"))
            info[name] = {"nv": len(verts), "tris": len(idx) // 3, **{k: v for k, v in meta.items() if k in ("footprint", "wallMounted")}}
            print(f"[prop] {pack}/{name}: {len(verts)} verts, {len(idx) // 3} tris, {time.time() - t0:.1f}s", flush=True)
        if only:
            # keep the other props of this pack: re-read is not supported, so rebuild whole pack
            pass
        size = write_pack(os.path.join(out, pack + ".bin"), items)
        manifest[pack] = {"file": pack + ".bin", "bytes": size, "props": info}
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = argv[0] if argv else "build/props"
    packs = set(argv[1].split(",")) if len(argv) > 1 and argv[1] else None
    only = set(argv[2].split(",")) if len(argv) > 2 and argv[2] else None
    prev = argv[3] if len(argv) > 3 else None
    run(out, packs, only, prev)

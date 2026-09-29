#!/usr/bin/env python3
"""
Generate RentEase app icons using Pillow + numpy.
Requires: pip3 install Pillow numpy

Design:
  - Deep royal-blue solid background
  - Simple white house outline: roof (left+right slopes only, open bottom)
    with two side walls — NO chimney, NO windows, NO fill
  - "RentEase" single line, bold white, centred inside the house frame
"""

import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SIZE = 1024


def find_font(bold=False):
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/SFCompactDisplay-Bold.otf",
        "/System/Library/Fonts/SFCompactDisplay-Regular.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def make_background(W):
    # Solid deep blue — no gradient complexity, clean and bold
    BG = (22, 60, 170)   # #163CAA — vivid royal blue
    img = Image.new('RGBA', (W, W), BG + (255,))
    return img


def apply_rounded_corners(img, radius):
    W, H = img.size
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W-1, H-1], radius=radius, fill=255)
    result = img.copy()
    result.putalpha(mask)
    return result


def make_icon(size=SIZE, adaptive=False):
    W = size
    img = make_background(W)

    if not adaptive:
        img = apply_rounded_corners(img, int(W * 0.22))

    draw = ImageDraw.Draw(img)

    WHITE = (255, 255, 255)
    cx = W // 2

    # ── Line weights ──────────────────────────────────────────────────────
    ROOF_W = max(8, int(W * 0.021))   # roof & wall lines
    WALL_W = max(8, int(W * 0.021))

    # ── House geometry ────────────────────────────────────────────────────
    # House occupies top 56% of icon. Text sits in lower 35%.
    peak_y  = int(W * 0.10)           # roof peak
    eave_y  = int(W * 0.44)           # where roof meets walls
    wall_b  = int(W * 0.62)           # bottom of walls (open)
    wall_l  = int(W * 0.18)           # left wall X
    wall_r  = int(W * 0.82)           # right wall X
    # roof overhang slightly wider than walls
    roof_l  = int(W * 0.14)
    roof_r  = int(W * 0.86)

    # Left roof slope: peak → roof_l
    draw.line([(cx, peak_y), (roof_l, eave_y)], fill=WHITE, width=ROOF_W)
    # Right roof slope: peak → roof_r
    draw.line([(cx, peak_y), (roof_r, eave_y)], fill=WHITE, width=ROOF_W)
    # Left eave (short horizontal overhang)
    draw.line([(roof_l, eave_y), (wall_l, eave_y)], fill=WHITE, width=WALL_W)
    # Right eave
    draw.line([(wall_r, eave_y), (roof_r, eave_y)], fill=WHITE, width=WALL_W)
    # Left wall (vertical, open bottom)
    draw.line([(wall_l, eave_y), (wall_l, wall_b)], fill=WHITE, width=WALL_W)
    # Right wall
    draw.line([(wall_r, eave_y), (wall_r, wall_b)], fill=WHITE, width=WALL_W)

    # ── "RentEase" — single line, bold white, centred inside house ────────
    # Target: text fits between walls with comfortable padding
    avail_w = wall_r - wall_l          # ~656 px at 1024
    text    = "RentEase"

    font_path = find_font(bold=True)
    # Binary search for the largest font size that fits in avail_w * 0.78
    target_w = int(avail_w * 0.78)
    lo, hi   = 20, int(W * 0.16)
    fnt      = None
    for _ in range(18):
        mid = (lo + hi) // 2
        try:
            f   = ImageFont.truetype(font_path, mid) if font_path else ImageFont.load_default()
            bb  = draw.textbbox((0, 0), text, font=f)
            tw  = bb[2] - bb[0]
            if tw <= target_w:
                fnt = f
                lo  = mid + 1
            else:
                hi  = mid - 1
        except Exception:
            break

    if fnt is None:
        fnt = ImageFont.load_default()

    bb  = draw.textbbox((0, 0), text, font=fnt)
    tw  = bb[2] - bb[0]
    th  = bb[3] - bb[1]

    # Centre text vertically in the wall area (between eave_y and wall_b)
    text_cy = (eave_y + wall_b) // 2
    tx = cx - tw // 2 - bb[0]
    ty = text_cy - th // 2 - bb[1]

    # Subtle dark shadow for depth
    draw.text((tx + 2, ty + 2), text, font=fnt, fill=(0, 0, 60, 90))
    # White text
    draw.text((tx, ty), text, font=fnt, fill=WHITE)

    return img


def main():
    os.makedirs('assets', exist_ok=True)

    print("Generating icon.png (1024×1024)…")
    img = make_icon(SIZE, adaptive=False)
    img.save('assets/icon.png')
    print("  ✓ assets/icon.png")

    print("Generating adaptive-icon.png (1024×1024, no rounded corners)…")
    img2 = make_icon(SIZE, adaptive=True)
    img2.save('assets/adaptive-icon.png')
    print("  ✓ assets/adaptive-icon.png")

    print("Done.")


if __name__ == '__main__':
    main()

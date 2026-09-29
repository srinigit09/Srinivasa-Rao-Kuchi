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

    WHITE      = (255, 255, 255)
    WHITE_DIM  = (200, 215, 255)      # slightly blue-tinted for label pill bg
    GOLD       = (255, 213, 90)       # warm gold accent for label text
    cx = W // 2

    # ── Line weights ──────────────────────────────────────────────────────
    LW = max(9, int(W * 0.023))       # all house lines same weight

    # ── House geometry ────────────────────────────────────────────────────
    # Push peak DOWN so it isn't clipped by rounded corners.
    # House occupies rows 14%–64% of icon height. Label sits 66%–88%.
    peak_y  = int(W * 0.155)          # roof peak — well clear of corner clip
    eave_y  = int(W * 0.455)          # where roof meets walls (eave line)
    wall_b  = int(W * 0.645)          # open bottom of walls
    wall_l  = int(W * 0.195)          # left wall X
    wall_r  = int(W * 0.805)          # right wall X
    overhang = int(W * 0.045)         # roof extends past walls on each side
    roof_l  = wall_l - overhang
    roof_r  = wall_r + overhang

    # Left roof slope
    draw.line([(cx, peak_y), (roof_l, eave_y)], fill=WHITE, width=LW)
    # Right roof slope
    draw.line([(cx, peak_y), (roof_r, eave_y)], fill=WHITE, width=LW)
    # Left eave cap (horizontal — makes it look like a real overhang)
    draw.line([(roof_l, eave_y), (wall_l, eave_y)], fill=WHITE, width=LW)
    # Right eave cap
    draw.line([(wall_r, eave_y), (roof_r, eave_y)], fill=WHITE, width=LW)
    # Left wall
    draw.line([(wall_l, eave_y), (wall_l, wall_b)], fill=WHITE, width=LW)
    # Right wall
    draw.line([(wall_r, eave_y), (wall_r, wall_b)], fill=WHITE, width=LW)

    # ── Centred arched door — sits flush at wall base ─────────────────────
    door_w  = int(W * 0.130)          # wider so it reads clearly at small sizes
    door_x  = cx - door_w // 2
    door_r  = door_w // 2             # arch radius = half width (full semicircle)
    arch_top = wall_b - door_r * 2    # top of the arch bounding box
    # Arch (top semicircle)
    draw.arc(
        [door_x, arch_top, door_x + door_w, arch_top + door_w],
        start=180, end=0, fill=WHITE, width=LW - 1,
    )
    # Left side of door down to wall base
    draw.line([(door_x,            arch_top + door_r), (door_x,            wall_b)], fill=WHITE, width=LW - 1)
    # Right side of door down to wall base
    draw.line([(door_x + door_w,   arch_top + door_r), (door_x + door_w,   wall_b)], fill=WHITE, width=LW - 1)

    # ── "RentEase" label — highlighted pill centred below house ──────────
    text     = "RentEase"
    font_path = find_font(bold=True)

    # Binary search: fit text to ~62% of wall width
    target_w = int((wall_r - wall_l) * 0.68)
    lo, hi, fnt = 20, int(W * 0.13), None
    for _ in range(20):
        mid = (lo + hi) // 2
        try:
            f  = ImageFont.truetype(font_path, mid) if font_path else ImageFont.load_default()
            bb = draw.textbbox((0, 0), text, font=f)
            if bb[2] - bb[0] <= target_w:
                fnt = f; lo = mid + 1
            else:
                hi = mid - 1
        except Exception:
            break
    if fnt is None:
        fnt = ImageFont.load_default()

    bb  = draw.textbbox((0, 0), text, font=fnt)
    tw  = bb[2] - bb[0]
    th  = bb[3] - bb[1]

    # Vertical centre: place label block in lower 28% of icon
    label_cy = int(W * 0.775)
    pad_x    = int(W * 0.045)
    pad_y    = int(W * 0.022)
    pill_x0  = cx - tw // 2 - pad_x - bb[0]
    pill_y0  = label_cy - th // 2 - pad_y - bb[1]
    pill_x1  = cx + tw // 2 + pad_x - bb[0]
    pill_y1  = label_cy + th // 2 + pad_y - bb[1]
    pill_r   = (pill_y1 - pill_y0) // 2

    # Semi-transparent white pill background
    pill_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    pill_drw = ImageDraw.Draw(pill_img)
    pill_drw.rounded_rectangle([pill_x0, pill_y0, pill_x1, pill_y1],
                                radius=pill_r, fill=(255, 255, 255, 90))
    img.alpha_composite(pill_img)
    draw = ImageDraw.Draw(img)

    # Text: gold colour for contrast and luxury feel
    tx = cx - tw // 2 - bb[0]
    ty = label_cy - th // 2 - bb[1]
    draw.text((tx + 2, ty + 3), text, font=fnt, fill=(0, 0, 40, 80))   # shadow
    draw.text((tx, ty), text, font=fnt, fill=GOLD)

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

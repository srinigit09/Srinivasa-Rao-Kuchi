#!/usr/bin/env python3
"""
Generate RentEase app icons using Pillow.
Requires: pip3 install Pillow numpy

Design:
  - Deep navy vignette background
  - Thin gold house outline: peaked roof + left/right walls (open bottom)
  - Small chimney top-right
  - Two outlined cross-windows inside the walls
  - "Rent" large bold white + "EASE" sky-blue, centred below house
  - Subtle blue glow behind text, thin gold rule below
"""

import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SIZE = 1024


def find_font(bold=False):
    """Return the best available system font path."""
    candidates_bold = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay-Bold.otf",
        "/System/Library/Fonts/SFPro.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    candidates_reg = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.otf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in (candidates_bold if bold else candidates_reg):
        if os.path.exists(path):
            return path
    return None


def make_background(W):
    """Radial vignette: bright royal-blue centre, very dark navy edges."""
    BG_CTR  = np.array([18, 58, 158], dtype=np.float32)
    BG_EDGE = np.array([ 6, 15,  58], dtype=np.float32)
    BG_BOT  = np.array([10, 28, 105], dtype=np.float32)
    cx, cy = W // 2, int(W * 0.42)
    max_r  = math.hypot(W * 0.72, W * 0.72)

    ys, xs = np.mgrid[0:W, 0:W].astype(np.float32)
    d    = np.clip(np.hypot(xs - cx, ys - cy) / max_r, 0.0, 1.0)
    t1   = (d ** 1.4)[..., None]
    vert = (ys / W * 0.35)[..., None]
    c1   = BG_CTR * (1 - t1) + BG_EDGE * t1
    c2   = c1 * (1 - vert) + BG_BOT * vert
    rgb  = np.clip(c2, 0, 255).astype(np.uint8)
    alpha = np.full((W, W, 1), 255, dtype=np.uint8)
    return Image.fromarray(np.concatenate([rgb, alpha], axis=-1), 'RGBA')


def apply_rounded_corners(img, radius):
    W, H = img.size
    mask = Image.new('L', (W, H), 0)
    d    = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=radius, fill=255)
    result = img.copy()
    result.putalpha(mask)
    return result


def draw_glow(img, cx, cy, rx, ry, color, strength=0.25):
    """Soft elliptical glow blended onto img."""
    W, H = img.size
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (xs - cx) / rx
    dy = (ys - cy) / ry
    d  = np.sqrt(np.clip(dx * dx + dy * dy, 0, None))
    a  = np.where(d < 1.0, (strength * (1.0 - d) ** 2.0 * 255).astype(np.float32), 0.0)
    glow = Image.fromarray(
        np.stack([
            np.full((H, W), color[0], dtype=np.uint8),
            np.full((H, W), color[1], dtype=np.uint8),
            np.full((H, W), color[2], dtype=np.uint8),
            np.clip(a, 0, 255).astype(np.uint8),
        ], axis=-1), 'RGBA')
    img.alpha_composite(glow)


def make_icon(size=SIZE, adaptive=False):
    W = size
    img = make_background(W)
    draw = ImageDraw.Draw(img)

    if not adaptive:
        img = apply_rounded_corners(img, W // 5)
        draw = ImageDraw.Draw(img)

    # ── Colours ────────────────────────────────────────────────────────────
    GOLD      = (255, 208,  80)
    GOLD_DIM  = (185, 145,  45)
    WHITE     = (235, 242, 255)
    ACCENT    = (110, 180, 255)
    GLOW_C    = ( 40, 100, 240)

    LINE = max(7, int(W * 0.019))
    THIN = max(4, int(W * 0.010))

    cx = W // 2

    # ── House geometry ──────────────────────────────────────────────────────
    h_left   = int(W * 0.14)
    h_right  = int(W * 0.86)
    h_peak_y = int(W * 0.065)
    h_wall_t = int(W * 0.355)
    h_wall_b = int(W * 0.535)
    overhang = int(W * 0.020)
    roof_l   = h_left  - overhang
    roof_r   = h_right + overhang

    lw = LINE
    tw = THIN

    # Roof slopes
    draw.line([(cx, h_peak_y), (roof_l, h_wall_t)], fill=GOLD, width=lw)
    draw.line([(cx, h_peak_y), (roof_r, h_wall_t)], fill=GOLD, width=lw)
    # Eave horizontals
    draw.line([(roof_l, h_wall_t), (h_left, h_wall_t)],  fill=GOLD, width=tw)
    draw.line([(h_right, h_wall_t), (roof_r, h_wall_t)], fill=GOLD, width=tw)
    # Walls
    draw.line([(h_left,  h_wall_t), (h_left,  h_wall_b)], fill=GOLD, width=lw)
    draw.line([(h_right, h_wall_t), (h_right, h_wall_b)], fill=GOLD, width=lw)

    # ── Chimney ─────────────────────────────────────────────────────────────
    chim_cx  = int(W * 0.625)
    chim_hw  = int(W * 0.022)
    t_chim   = (chim_cx - cx) / (roof_r - cx)
    chim_by  = int(h_peak_y + t_chim * (h_wall_t - h_peak_y))
    chim_ty  = chim_by - int(W * 0.065)
    # three sides (open bottom sits on roof)
    draw.line([(chim_cx - chim_hw, chim_ty), (chim_cx + chim_hw, chim_ty)],  fill=GOLD_DIM, width=tw)
    draw.line([(chim_cx - chim_hw, chim_ty), (chim_cx - chim_hw, chim_by)],  fill=GOLD_DIM, width=tw)
    draw.line([(chim_cx + chim_hw, chim_ty), (chim_cx + chim_hw, chim_by)],  fill=GOLD_DIM, width=tw)

    # ── Windows ─────────────────────────────────────────────────────────────
    win_sz   = int(W * 0.075)
    win_top  = h_wall_t + int(W * 0.030)
    win_bot  = win_top + win_sz
    # Left window: inset inside left wall
    lw_x = h_left  + int(W * 0.030)
    # Right window: inset inside right wall
    rw_x = h_right - int(W * 0.030) - win_sz

    for wx in (lw_x, rw_x):
        # Outline
        draw.rectangle([wx, win_top, wx + win_sz, win_bot], outline=GOLD_DIM, width=tw)
        # Cross dividers
        mid_x = wx + win_sz // 2
        mid_y = win_top + win_sz // 2
        draw.line([(mid_x, win_top), (mid_x, win_bot)],     fill=GOLD_DIM, width=max(2, tw // 2))
        draw.line([(wx, mid_y),      (wx + win_sz, mid_y)], fill=GOLD_DIM, width=max(2, tw // 2))

    # ── Text ─────────────────────────────────────────────────────────────────
    # "Rent" sits between walls (horizontally), below the open wall base
    text_area_w = h_right - h_left          # ~778 px at 1024
    padding_top = int(W * 0.030)

    # Load fonts
    font_bold = find_font(bold=True)
    font_reg  = find_font(bold=False)

    rent_size = int(text_area_w * 0.30)     # sized to fit comfortably
    ease_size = int(text_area_w * 0.20)

    try:
        fnt_rent = ImageFont.truetype(font_bold or font_reg, rent_size) if (font_bold or font_reg) else ImageFont.load_default()
        fnt_ease = ImageFont.truetype(font_reg  or font_bold, ease_size) if (font_reg or font_bold) else ImageFont.load_default()
    except Exception:
        fnt_rent = ImageFont.load_default()
        fnt_ease = ImageFont.load_default()

    # Measure
    bb_rent = draw.textbbox((0, 0), "Rent", font=fnt_rent)
    bb_ease = draw.textbbox((0, 0), "EASE", font=fnt_ease)
    rw = bb_rent[2] - bb_rent[0]
    rh = bb_rent[3] - bb_rent[1]
    ew = bb_ease[2] - bb_ease[0]
    eh = bb_ease[3] - bb_ease[1]

    gap_between = int(W * 0.014)
    total_h     = rh + gap_between + eh
    block_top   = h_wall_b + padding_top
    block_bot   = W - int(W * 0.055)        # leave bottom margin

    # Centre block vertically in available space
    avail     = block_bot - block_top
    block_top = block_top + max(0, (avail - total_h) // 2)

    rent_x = cx - rw // 2 - bb_rent[0]
    rent_y = block_top     - bb_rent[1]

    ease_x = cx - ew // 2 - bb_ease[0]
    ease_y = block_top + rh + gap_between - bb_ease[1]

    # Glow
    glow_cy = block_top + total_h // 2
    draw_glow(img, cx, glow_cy, int(W * 0.30), int(total_h * 0.85), GLOW_C, strength=0.30)
    draw = ImageDraw.Draw(img)

    # Shadow for depth
    shadow_off = max(2, int(W * 0.004))
    draw.text((rent_x + shadow_off, rent_y + shadow_off), "Rent", font=fnt_rent, fill=(0, 0, 0, 80))
    draw.text((ease_x + shadow_off, ease_y + shadow_off), "EASE", font=fnt_ease, fill=(0, 0, 0, 80))

    # Text
    draw.text((rent_x, rent_y), "Rent", font=fnt_rent, fill=WHITE)
    draw.text((ease_x, ease_y), "EASE", font=fnt_ease, fill=ACCENT)

    # ── Thin gold rule below EASE ────────────────────────────────────────────
    rule_y  = ease_y + bb_ease[1] + eh + int(W * 0.018)
    rule_hw = int(W * 0.11)
    draw.line([(cx - rule_hw, rule_y), (cx + rule_hw, rule_y)], fill=GOLD_DIM, width=max(2, int(W * 0.004)))

    # ── Roof peak dot ────────────────────────────────────────────────────────
    dot_r = int(W * 0.014)
    draw.ellipse([cx - dot_r, h_peak_y - dot_r, cx + dot_r, h_peak_y + dot_r], fill=GOLD)

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

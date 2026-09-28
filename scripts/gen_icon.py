#!/usr/bin/env python3
"""
Generate RentEase app icons (icon.png 1024x1024, adaptive-icon.png 1024x1024)
using only Python stdlib — no Pillow/cairosvg/canvas needed.

Design:
  - Deep blue gradient background (#1D4ED8 → #1E40AF)
  - White house silhouette centred
  - "RentEase" text below the house in bold white
  - Thin white keyhole dot inside the door to hint at property management
"""

import struct, zlib, math, os

SIZE = 1024

# ─── tiny PNG writer ────────────────────────────────────────────────────────
def png_chunk(tag: bytes, data: bytes) -> bytes:
    c = struct.pack('>I', len(data)) + tag + data
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return c + struct.pack('>I', crc)

def write_png(pixels, w, h, path):
    """pixels: flat list of (r,g,b,a) tuples, row-major"""
    raw = b''
    for y in range(h):
        raw += b'\x00'  # filter type None
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            raw += bytes([r, g, b, a])
    compressed = zlib.compress(raw, 9)
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    # rebuild with RGBA (colour type 6)
    ihdr_data = struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(png_chunk(b'IHDR', ihdr_data))
        f.write(png_chunk(b'IDAT', compressed))
        f.write(png_chunk(b'IEND', b''))

# ─── drawing helpers ─────────────────────────────────────────────────────────
def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def circle_aa(cx, cy, r, px, py):
    """Returns alpha 0–255 for smooth circle edge."""
    d = math.hypot(px - cx, py - cy)
    return max(0, min(255, int((r + 0.5 - d) * 255)))

def fill_rect(pixels, w, x0, y0, x1, y1, color):
    r, g, b, a = color
    for y in range(max(0, y0), min(SIZE, y1)):
        for x in range(max(0, x0), min(w, x1)):
            pixels[y * w + x] = (r, g, b, a)

def blend(bg, fg):
    """Alpha-blend fg over bg."""
    fa = fg[3] / 255
    return (
        int(bg[0] * (1 - fa) + fg[0] * fa),
        int(bg[1] * (1 - fa) + fg[1] * fa),
        int(bg[2] * (1 - fa) + fg[2] * fa),
        255,
    )

def draw_circle(pixels, w, cx, cy, r, color):
    r2, g2, b2, a2 = color
    for y in range(max(0, cy - r - 1), min(SIZE, cy + r + 2)):
        for x in range(max(0, cx - r - 1), min(w, cx + r + 2)):
            alpha = circle_aa(cx, cy, r, x, y)
            if alpha > 0:
                fa = alpha * a2 // 255
                pixels[y * w + x] = blend(pixels[y * w + x], (r2, g2, b2, fa))

def draw_line_thick(pixels, w, x0, y0, x1, y1, thick, color):
    """Draw a thick anti-aliased line via rect approximation."""
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length == 0:
        return
    nx, ny = -dy / length, dx / length  # normal
    pts = [
        (x0 + nx * thick, y0 + ny * thick),
        (x0 - nx * thick, y0 - ny * thick),
        (x1 - nx * thick, y1 - ny * thick),
        (x1 + nx * thick, y1 + ny * thick),
    ]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bx0, bx1 = int(min(xs)) - 1, int(max(xs)) + 2
    by0, by1 = int(min(ys)) - 1, int(max(ys)) + 2
    r2, g2, b2, a2 = color
    # point-in-parallelogram test
    for y in range(max(0, by0), min(SIZE, by1)):
        for x in range(max(0, bx0), min(w, bx1)):
            # distance to line segment
            lx, ly = x - x0, y - y0
            t = max(0, min(1, (lx * dx + ly * dy) / (length * length)))
            px2, py2 = x0 + t * dx - x, y0 + t * dy - y
            d = math.hypot(px2, py2)
            alpha = max(0, min(255, int((thick + 0.5 - d) * 200)))
            if alpha > 0:
                fa = alpha * a2 // 255
                pixels[y * w + x] = blend(pixels[y * w + x], (r2, g2, b2, fa))

def fill_polygon(pixels, w, poly, color):
    """Scanline fill for convex polygon. poly = list of (x,y)."""
    r2, g2, b2, a2 = color
    min_y = max(0, int(min(p[1] for p in poly)))
    max_y = min(SIZE - 1, int(max(p[1] for p in poly)))
    n = len(poly)
    for y in range(min_y, max_y + 1):
        intersects = []
        for i in range(n):
            x0f, y0f = poly[i]
            x1f, y1f = poly[(i + 1) % n]
            if (y0f <= y < y1f) or (y1f <= y < y0f):
                t = (y - y0f) / (y1f - y0f)
                intersects.append(x0f + t * (x1f - x0f))
        intersects.sort()
        for i in range(0, len(intersects) - 1, 2):
            xa, xb = int(intersects[i]), int(intersects[i + 1])
            for x in range(max(0, xa), min(w, xb + 1)):
                pixels[y * w + x] = blend(pixels[y * w + x], (r2, g2, b2, a2))

def draw_text_RE(pixels, w, cx, y_top, color):
    """
    Draw 'RentEase' as simple pixel-art using a bitmapped 5x7 font.
    Each char is 5 wide × 7 tall. Scale factor applied.
    """
    FONT = {
        'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
        'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
        'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
        'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
        'A': [0b00100, 0b01010, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
        'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
    }
    text = 'RENTEASE'
    FONT['E2'] = FONT['E']
    seq = ['R', 'E', 'N', 'T', 'E2', 'A', 'S', 'E']
    scale = 14
    gap = 3
    char_w = 5 * scale + gap
    total_w = char_w * len(seq) - gap
    start_x = cx - total_w // 2
    r2, g2, b2, _ = color
    for ci, ch in enumerate(seq):
        key = ch if ch != 'E2' else 'E'
        bitmap = FONT[key]
        ox = start_x + ci * char_w
        for row, bits in enumerate(bitmap):
            for col in range(5):
                if bits & (1 << (4 - col)):
                    px0 = ox + col * scale
                    py0 = y_top + row * scale
                    for dy in range(scale - 1):
                        for dx in range(scale - 1):
                            nx, ny = px0 + dx, py0 + dy
                            if 0 <= nx < w and 0 <= ny < SIZE:
                                pixels[ny * w + nx] = blend(pixels[ny * w + nx], (r2, g2, b2, 255))


# ─── main drawing ─────────────────────────────────────────────────────────────
def make_icon(size=SIZE, adaptive=False):
    pixels = [(0, 0, 0, 0)] * (size * size)
    W = size

    C1 = (29, 78, 216)    # #1D4ED8
    C2 = (30, 64, 175)    # #1E40AF

    # ── background: vertical gradient + rounded corners ─────────────────────
    radius = size // 6 if not adaptive else 0
    for y in range(size):
        t = y / size
        r, g, b = lerp_color(C1, C2, t)
        for x in range(size):
            pixels[y * W + x] = (r, g, b, 255)

    # rounded corners (mask out)
    if not adaptive:
        for y in range(size):
            for x in range(size):
                # four corners
                in_corner = False
                for cx2, cy2 in [(radius, radius), (size - radius, radius),
                                  (radius, size - radius), (size - radius, size - radius)]:
                    if math.hypot(x - cx2, y - cy2) > radius and x < radius or \
                       math.hypot(x - cx2, y - cy2) > radius and x > size - radius or \
                       math.hypot(x - cx2, y - cy2) > radius and y < radius or \
                       math.hypot(x - cx2, y - cy2) > radius and y > size - radius:
                        pass
                # proper rounded-corner masking
                in_safe = True
                if x < radius and y < radius:
                    in_safe = math.hypot(x - radius, y - radius) <= radius
                elif x > size - radius and y < radius:
                    in_safe = math.hypot(x - (size - radius), y - radius) <= radius
                elif x < radius and y > size - radius:
                    in_safe = math.hypot(x - radius, y - (size - radius)) <= radius
                elif x > size - radius and y > size - radius:
                    in_safe = math.hypot(x - (size - radius), y - (size - radius)) <= radius
                if not in_safe:
                    pixels[y * W + x] = (0, 0, 0, 0)

    # ── house body ──────────────────────────────────────────────────────────
    cx = size // 2
    # House sits in upper 60% of icon
    house_base_y = int(size * 0.72)
    house_top_y  = int(size * 0.22)   # roof peak
    house_left_x = int(size * 0.18)
    house_right_x= int(size * 0.82)
    house_mid_y  = int(size * 0.47)   # where roof meets walls

    WHITE = (255, 255, 255, 255)
    WHITE_T = (255, 255, 255, 220)

    # Roof triangle
    roof = [
        (cx,           house_top_y),
        (house_left_x - int(size * 0.04), house_mid_y),
        (house_right_x + int(size * 0.04), house_mid_y),
    ]
    fill_polygon(pixels, W, roof, WHITE)

    # Chimney (small rectangle top-right of roof)
    chim_x = int(size * 0.62)
    chim_w = int(size * 0.06)
    chim_h = int(size * 0.12)
    fill_rect(pixels, W, chim_x, house_top_y - chim_h + int(size*0.06), chim_x + chim_w, house_top_y + int(size*0.04), WHITE)

    # House body rectangle
    fill_rect(pixels, W, house_left_x, house_mid_y, house_right_x, house_base_y, WHITE)

    # Carve out door (background colour shows through) — centred, lower 35% of house body
    door_w = int(size * 0.14)
    door_h = int(size * 0.22)
    door_x = cx - door_w // 2
    door_y = house_base_y - door_h
    # door arch top radius
    door_r = door_w // 2
    for y in range(door_y, house_base_y):
        for x in range(door_x, door_x + door_w):
            if y < door_y + door_r:
                if math.hypot(x - (door_x + door_r), y - (door_y + door_r)) <= door_r:
                    t2 = y / size
                    r2, g2, b2 = lerp_color(C1, C2, t2)
                    pixels[y * W + x] = (r2, g2, b2, 255)
            else:
                t2 = y / size
                r2, g2, b2 = lerp_color(C1, C2, t2)
                pixels[y * W + x] = (r2, g2, b2, 255)

    # Door knob
    draw_circle(pixels, W, door_x + door_w - int(size * 0.025), door_y + door_h // 2, int(size * 0.018), WHITE)

    # Windows — two small squares (left and right of door)
    win_size = int(size * 0.10)
    win_y    = house_mid_y + int(size * 0.06)
    win_gap  = int(size * 0.06)
    # Left window
    lw_x = house_left_x + win_gap
    fill_rect(pixels, W, lw_x, win_y, lw_x + win_size, win_y + win_size, (255, 255, 255, 180))
    # window cross dividers (carve background colour)
    mid_win_x = lw_x + win_size // 2
    mid_win_y = win_y + win_size // 2
    for yy in range(win_y, win_y + win_size):
        t2 = yy / size
        r2, g2, b2 = lerp_color(C1, C2, t2)
        for thick in range(-1, 2):
            if 0 <= mid_win_x + thick < W:
                pixels[yy * W + mid_win_x + thick] = (r2, g2, b2, 255)
    for xx in range(lw_x, lw_x + win_size):
        t2 = mid_win_y / size
        r2, g2, b2 = lerp_color(C1, C2, t2)
        for thick in range(-1, 2):
            if 0 <= mid_win_y + thick < size:
                pixels[(mid_win_y + thick) * W + xx] = (r2, g2, b2, 255)

    # Right window
    rw_x = house_right_x - win_gap - win_size
    fill_rect(pixels, W, rw_x, win_y, rw_x + win_size, win_y + win_size, (255, 255, 255, 180))
    mid_win_x2 = rw_x + win_size // 2
    for yy in range(win_y, win_y + win_size):
        t2 = yy / size
        r2, g2, b2 = lerp_color(C1, C2, t2)
        for thick in range(-1, 2):
            if 0 <= mid_win_x2 + thick < W:
                pixels[yy * W + mid_win_x2 + thick] = (r2, g2, b2, 255)
    for xx in range(rw_x, rw_x + win_size):
        t2 = mid_win_y / size
        r2, g2, b2 = lerp_color(C1, C2, t2)
        for thick in range(-1, 2):
            if 0 <= mid_win_y + thick < size:
                pixels[(mid_win_y + thick) * W + xx] = (r2, g2, b2, 255)

    # ── "RentEase" text ─────────────────────────────────────────────────────
    text_y = house_base_y + int(size * 0.05)
    draw_text_RE(pixels, W, cx, text_y, WHITE)

    return pixels


def main():
    os.makedirs('assets', exist_ok=True)

    print("Generating icon.png (1024×1024)…")
    px = make_icon(SIZE, adaptive=False)
    write_png(px, SIZE, SIZE, 'assets/icon.png')
    print("  ✓ assets/icon.png")

    print("Generating adaptive-icon.png (1024×1024, no rounded corners)…")
    px2 = make_icon(SIZE, adaptive=True)
    write_png(px2, SIZE, SIZE, 'assets/adaptive-icon.png')
    print("  ✓ assets/adaptive-icon.png")

    print("Done.")


if __name__ == '__main__':
    main()

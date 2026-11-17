#!/usr/bin/env python3
"""
Brand asset generator for Ciana Technologies.

  python3 brand/make-brand.py            # build everything from brand/ciana-logo.png + brand/ciana-mark.png
                                         # (those two are drawn automatically the first time if missing)
  python3 brand/make-brand.py --redraw   # redraw the two master PNGs, then build everything

To use the OFFICIAL artwork: replace brand/ciana-logo.png (logo + "Ciana Technologies" text, transparent
background) and brand/ciana-mark.png (the CT symbol alone, square, transparent background), then run the
command above. It writes, for BOTH the client and the server:
  assets/ciana-logo.png            logo + name (admin panel, About)
  assets/ciana-mark.png            CT symbol alone (About / Contact dialogs)
  assets/ciana-installer.ico       installer + uninstaller icon
  assets/installerSidebar.bmp      installer welcome / finish page (164x314)
  assets/installerHeader.bmp       installer page header (150x57)
and  server/public/ciana-logo.png  for the admin panel.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
LOGO = os.path.join(ROOT, 'ciana-logo.png')
MARK = os.path.join(ROOT, 'ciana-mark.png')

STEEL = (45, 93, 124)      # "C" and "Technologies"
INK   = (10, 10, 10)       # "T" and "Ciana"
BLUE  = (47, 110, 165)
FONT_I = '/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf'
FONT_B = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def font(path, size):
    return ImageFont.truetype(path, size)


def draw_mark(size=512):
    """CT monogram: heavy italic C (steel blue) overlapped by a heavy italic T (black)."""
    S = size * 2
    img = Image.new('RGBA', (S * 2, S), (0, 0, 0, 0))   # wide canvas: nothing may be clipped
    f = font(FONT_I, int(S * 0.92))
    c = Image.new('RGBA', (S * 2, S), (0, 0, 0, 0)); t = Image.new('RGBA', (S * 2, S), (0, 0, 0, 0))
    ImageDraw.Draw(c).text((int(S * 0.02), int(S * 0.02)), 'C', font=f, fill=STEEL + (255,), stroke_width=int(S * 0.02), stroke_fill=STEEL + (255,))
    ImageDraw.Draw(t).text((int(S * 0.40), int(S * 0.02)), 'T', font=f, fill=INK + (255,), stroke_width=int(S * 0.02), stroke_fill=INK + (255,))
    img = Image.alpha_composite(img, c); img = Image.alpha_composite(img, t)
    img = img.crop(img.getbbox())
    side = max(img.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def draw_logo(mark):
    W, H = 1400, 620
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    m = mark.resize((300, 300), Image.LANCZOS)
    img.paste(m, ((W - 300) // 2, 10), m)
    d = ImageDraw.Draw(img)
    f = font(FONT_B, 112)
    a, b = 'Ciana ', 'Technologies'
    wa, wb = d.textlength(a, font=f), d.textlength(b, font=f)
    x = (W - (wa + wb)) / 2
    y = 350
    d.text((x, y), a, font=f, fill=INK + (255,))
    d.text((x + wa, y), b, font=f, fill=BLUE + (255,))
    return img.crop(img.getbbox())


def pad_to(img, w, h, bg, margin=0.9):
    """Fit img inside w x h (keeping aspect), centred on a bg-coloured canvas."""
    r = min(w * margin / img.width, h * margin / img.height)
    s = img.resize((max(1, int(img.width * r)), max(1, int(img.height * r))), Image.LANCZOS)
    out = Image.new('RGB', (w, h), bg)
    out.paste(s, ((w - s.width) // 2, (h - s.height) // 2), s)
    return out


def build(dest_assets):
    os.makedirs(dest_assets, exist_ok=True)
    logo = Image.open(LOGO).convert('RGBA'); mark = Image.open(MARK).convert('RGBA')
    logo.save(os.path.join(dest_assets, 'ciana-logo.png'))
    mark.resize((256, 256), Image.LANCZOS).save(os.path.join(dest_assets, 'ciana-mark.png'))
    # installer / uninstaller icon (multi-size, 32-bit)
    mark.save(os.path.join(dest_assets, 'ciana-installer.ico'),
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # welcome / finish sidebar 164x314: white page, logo on top, name + tagline under it
    W, H = 164, 314
    side = Image.new('RGB', (W, H), (255, 255, 255))
    lg = logo.copy(); r = (W - 24) / lg.width
    lg = lg.resize((W - 24, int(lg.height * r)), Image.LANCZOS)
    side.paste(lg, (12, 60), lg)
    d = ImageDraw.Draw(side)
    f1, f2 = font(FONT_B, 13), font('/System/Library/Fonts/Supplemental/Arial.ttf', 11)
    for txt, fnt, yy, col in (('Panic Alarm System', f1, 160, INK), ('Clinic emergency alerts', f2, 180, (87, 96, 106))):
        d.text(((W - d.textlength(txt, font=fnt)) / 2, yy), txt, font=fnt, fill=col)
    d.rectangle([0, H - 6, W, H], fill=BLUE)
    side.save(os.path.join(dest_assets, 'installerSidebar.bmp'), 'BMP')
    # page header 150x57
    pad_to(logo, 150, 57, (255, 255, 255), 0.92).save(os.path.join(dest_assets, 'installerHeader.bmp'), 'BMP')


if __name__ == '__main__':
    if '--redraw' in sys.argv or not (os.path.exists(LOGO) and os.path.exists(MARK)):
        mk = draw_mark(512); mk.save(MARK); draw_logo(mk).save(LOGO)
        print('drew', MARK, LOGO)
    for target in ('client', 'server'):
        build(os.path.join(REPO, target, 'assets'))
    import shutil
    shutil.copyfile(LOGO, os.path.join(REPO, 'server', 'public', 'ciana-logo.png'))
    print('brand assets written for client and server')

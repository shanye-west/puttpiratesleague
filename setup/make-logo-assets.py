"""Build the Putt Pirates app assets from the supplied logo JPEG.

The source is black artwork (L=0) on a uniform dark-grey field (L=44) with no
alpha. We key out the grey to transparency and recolour the art white, because
the app header is a dark teal gradient (#0b3d3a) — the original black mark would
be almost invisible on it.

Regenerates every app icon from putt-pirates-logo-source.jpg. Only needs to be
re-run if the logo itself changes:

    python3 -m venv /tmp/logo-venv && /tmp/logo-venv/bin/pip install Pillow
    /tmp/logo-venv/bin/python setup/make-logo-assets.py

Pillow is deliberately NOT a project dependency - this is a one-off asset build,
not part of the Vite pipeline.
"""
import os

from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "putt-pirates-logo-source.jpg")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rowdy-ui", "public")
TEAL = (11, 61, 58, 255)   # --brand-primary
TILE = (28, 28, 30, 255)   # --header-bg / manifest theme_color (#1c1c1e)

# --- 1. Key the grey background out, keeping anti-aliased edges -------------
g = Image.open(SRC).convert("L")
# Ramp alpha from fully opaque at L<=6 to fully clear at L>=40. The deadzone
# above 40 swallows JPEG noise in the flat background instead of leaving haze.
LO, HI = 6, 40
raw = g.point(lambda v: 255 if v <= LO else (0 if v >= HI else int(round(255 * (HI - v) / (HI - LO)))))
# The flat field isn't perfectly flat: JPEG ringing along the bottom/right edges
# dips to L=39-42, which the ramp would turn into a few counts of invisible haze
# -- enough to poison getbbox(). Clamp anything under the noise floor to zero.
alpha = raw.point(lambda a: 0 if a < 24 else a)

def tinted(rgb):
    im = Image.new("RGBA", g.size, rgb + (255,))
    im.putalpha(alpha)
    return im

white = tinted((255, 255, 255))
dark = tinted(TEAL[:3])   # for light surfaces, where a white mark would vanish

# --- 2. Crop to the artwork's true bounds so padding is ours to control -----
# Measure from solid pixels only, so soft edges can't drag the box outward.
bbox = alpha.point(lambda a: 255 if a >= 128 else 0).getbbox()
mark = white.crop(bbox)
print(f"source {g.size} -> art bbox {bbox} = {mark.size}")


def canvas(mark, size, coverage, bg=None):
    """Square `size` canvas with `mark` scaled to `coverage` of it, centred."""
    target = int(size * coverage)
    w, h = mark.size
    scale = target / max(w, h)
    m = mark.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    out.alpha_composite(m, ((size - m.size[0]) // 2, (size - m.size[1]) // 2))
    return out


# Header / boot splash: white on transparent, sits on the teal header + splash.
canvas(mark, 512, 0.94).save(f"{OUT}/images/puttpirates-logo.png")

# Light-surface mark: brand teal on transparent. The app has no dark mode
# (--card-bg is always #ffffff), so anything sitting on a card needs this one.
canvas(dark.crop(bbox), 512, 0.94).save(f"{OUT}/images/puttpirates-logo-dark.png")

# Home-screen icons: white on a solid near-black tile (matches the header) so they read on any launcher
# background (and in a light browser tab strip, for the favicon).
canvas(mark, 192, 0.76, TILE).save(f"{OUT}/pwa-192x192.png")
canvas(mark, 512, 0.76, TILE).save(f"{OUT}/pwa-512x512.png")

# Maskable: Android crops to a circle/squircle, so keep the art well inside the
# inner-80% safe zone and never rely on transparency.
canvas(mark, 512, 0.60, TILE).save(f"{OUT}/pwa-maskable-512x512.png")

# Favicon tile — small, so give the mark a little more room.
canvas(mark, 64, 0.82, TILE).save(f"{OUT}/favicon-64.png")
print("wrote: images/puttpirates-logo{,-dark}.png, pwa-192x192, pwa-512x512, pwa-maskable-512x512, favicon-64")

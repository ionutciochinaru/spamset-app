"""Draw the app icons from the Spamset watch launcher mark.

The mark is the watch app's (trex-workout-wearos, docs/play-submission/feature-graphic-src/icon.svg):
an ivory dumbbell rising at 35 degrees with an orange lightning cutout, on orange. Same geometry,
in its 248-unit box, drawn with Pillow (ImageMagick's SVG renderer mishandles the rotation).

    python3 tools/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ORANGE = (201, 74, 22, 255)  # #c94a16
IVORY = (238, 237, 228, 255)  # #eeede4
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

BOX = 248
# Dumbbell plates and bar: (x, y, width, height, corner radius), before rotation.
BARS = [(49, 102, 18, 44, 8), (73, 79, 28, 90, 10), (96, 108, 56, 32, 6), (147, 79, 28, 90, 10), (181, 102, 18, 44, 8)]
BOLT = [(126, 109), (114, 128), (123, 128), (121, 139), (136, 119), (126, 119), (131, 109)]
ANGLE = 35  # counterclockwise, as the SVG's rotate(-35)

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
SS = 4  # supersampling


def mark(size: int, scale: float, fill, bolt, background=CLEAR, corner: float = 0) -> Image.Image:
    """The dumbbell at `scale` of the canvas (1 = as on the watch icon), centred."""
    big = size * SS
    unit = big / BOX * scale
    off = big / 2 - BOX / 2 * unit
    layer = Image.new('RGBA', (big, big), CLEAR)
    draw = ImageDraw.Draw(layer)
    for x, y, w, h, r in BARS:
        draw.rounded_rectangle(
            (off + x * unit, off + y * unit, off + (x + w) * unit, off + (y + h) * unit), radius=r * unit, fill=fill)
    draw.polygon([(off + x * unit, off + y * unit) for x, y in BOLT], fill=bolt)
    layer = layer.rotate(ANGLE, resample=Image.BICUBIC, center=(big / 2, big / 2))

    canvas = Image.new('RGBA', (big, big), CLEAR)
    if background != CLEAR:
        ImageDraw.Draw(canvas).rounded_rectangle((0, 0, big - 1, big - 1), radius=corner * big, fill=background)
    canvas.alpha_composite(layer)
    return canvas.resize((size, size), Image.LANCZOS)


def silhouette(size: int, scale: float) -> Image.Image:
    """White dumbbell with the bolt cut out, for Android monochrome and notification icons."""
    solid = mark(size, scale, WHITE, (0, 0, 0, 255))
    alpha = solid.getchannel('A')
    # The bolt was drawn black: keep only the bright pixels.
    lum = solid.convert('L')
    mask = Image.composite(lum, Image.new('L', solid.size, 0), alpha)
    out = Image.new('RGBA', solid.size, WHITE)
    out.putalpha(mask)
    return out


def main() -> None:
    # iOS / store: full bleed, no transparency.
    mark(1024, 1, IVORY, ORANGE, ORANGE).convert('RGB').save(OUT / 'icon.png')
    # Android adaptive: the launcher shows the middle 72 of 108 units, so draw at 2/3 to match iOS.
    Image.new('RGB', (1024, 1024), ORANGE[:3]).save(OUT / 'android-icon-background.png')
    mark(1024, 2 / 3, IVORY, ORANGE).save(OUT / 'android-icon-foreground.png')
    silhouette(1024, 2 / 3).save(OUT / 'android-icon-monochrome.png')
    silhouette(96, 0.95).save(OUT / 'notification-icon.png')
    # Splash (shown at 220 pt on black) and web favicon: the rounded tile.
    mark(1024, 1, IVORY, ORANGE, ORANGE, corner=0.22).save(OUT / 'splash-icon.png')
    mark(48, 1, IVORY, ORANGE, ORANGE, corner=0.22).save(OUT / 'favicon.png')


if __name__ == '__main__':
    main()

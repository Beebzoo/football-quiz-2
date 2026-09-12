"""Make the home-screen icons out of the match ball.

    py -3 _tools/build-icons.py

WHY. Installing the app offered a black square with a white blob in it, left
over from the first week. The ball is the app's face everywhere else: the tab
favicon, the kick-off button, the splash before a round. The install prompt
should not be the one place it is missing.

WHAT IT DOES. assets/ball.png is a photograph on a white square, so the ball
is cut out with a circular mask rather than a colour key: the ball is mostly
white itself and keying on white would eat half of it. It is then set on the
night pitch the app already uses, with a gold rim and a glow behind it, so the
icon reads as this game rather than as a stock football.

TWO ICONS, NOT ONE. A maskable icon is cropped by the platform to whatever
shape it likes, a circle on Android, a squircle on iOS, and it only promises
to keep the middle 80%. So the maskable version sits the ball smaller inside a
full-bleed background, while the plain one fills the frame properly for
Windows and the browser tab.

SAFE TO RE-RUN."""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BALL = os.path.join(REPO, "assets", "ball.png")
OUT = os.path.join(REPO, "icons")

PITCH_IN = (17, 48, 31)      # centre of the background, the lit part of the pitch
PITCH_OUT = (6, 20, 12)      # the corners, where the floodlight does not reach
GOLD = (233, 184, 76)


def ball_cutout(size):
    """The ball, circular, on transparency."""
    im = Image.open(BALL).convert("RGBA")
    w, h = im.size
    # it is photographed centred and nearly fills the square, so the inscribed
    # circle is the ball; a pixel of slack keeps the white square's edge out
    r = min(w, h) // 2 - 2
    mask = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(mask).ellipse(
        [(w * 2 - r * 4, h * 2 - r * 4), (w * 2 + r * 4, h * 2 + r * 4)], fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)          # antialiased edge
    im.putalpha(mask)
    return im.crop((w // 2 - r, h // 2 - r, w // 2 + r, h // 2 + r)).resize(
        (size, size), Image.LANCZOS)


def background(size):
    """A round of pitch, lit from the middle."""
    bg = Image.new("RGB", (size, size), PITCH_OUT)
    px = bg.load()
    c = (size - 1) / 2
    far = math.hypot(c, c)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - c, y - c) / far)
            t = t ** 1.35                                  # hold the light in the middle
            px[x, y] = tuple(int(PITCH_IN[i] + (PITCH_OUT[i] - PITCH_IN[i]) * t) for i in range(3))
    return bg.convert("RGBA")


def icon(size, ball_frac, rim=True):
    img = background(size)

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    gr = int(size * ball_frac / 2 * 1.28)
    d.ellipse([(size // 2 - gr, size // 2 - gr), (size // 2 + gr, size // 2 + gr)],
              fill=GOLD + (70,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(size * 0.06)))

    bs = int(size * ball_frac)
    ball = ball_cutout(bs)
    off = (size - bs) // 2
    img.paste(ball, (off, off), ball)

    if rim:
        # a thin gold ring, the same one that frames the app itself
        ring = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        pad = int(size * 4 * (1 - ball_frac) / 2) - int(size * 0.012 * 4)
        rd.ellipse([(pad, pad), (size * 4 - pad, size * 4 - pad)],
                   outline=GOLD + (215,), width=max(4, int(size * 4 * 0.012)))
        img = Image.alpha_composite(img, ring.resize((size, size), Image.LANCZOS))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 0.84, True),
        ("icon-512.png", 512, 0.84, True),
        ("icon-180.png", 180, 0.84, True),        # apple touch icon
        # the platform will crop this one, so keep the ball inside the safe 80%
        ("icon-maskable-512.png", 512, 0.62, False),
    ]
    for name, size, frac, rim in jobs:
        icon(size, frac, rim).save(os.path.join(OUT, name), optimize=True)
        kb = os.path.getsize(os.path.join(OUT, name)) / 1024
        print(f"  {name:26} {size}x{size}  ball {int(frac*100)}%  {kb:.0f} KB")
    print("\nRemember the manifest lists them, and the maskable one separately.")


if __name__ == "__main__":
    main()

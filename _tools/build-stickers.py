"""Pull the cutout stickers out of a Canva PDF and make them web weight.

     py -3 _tools/build-stickers.py "Untitled design (6).pdf"

WHY A SCRIPT AND NOT A SAVE-AS. Canva exports one page per image at print
resolution, so the file that lands in the repo is 14MB of pictures nobody can
download on a pub wifi. This takes the largest image off each page, keeps its
transparency, trims the empty space around the cutout, and writes a PNG sized
for a phone.

TRANSPARENCY IS THE WHOLE POINT of these, so the alpha channel is carried
through by hand: PDF keeps the picture and its mask as two separate objects,
and reading only the first gives you a cutout on a black square.

THE TRIM MATTERS TOO. A Canva page is mostly empty, so an untrimmed sticker is
a small player in the middle of a large invisible rectangle, and every size
rule in the app would then be sizing the rectangle.

Safe to re-run: it overwrites what it wrote last time.
"""
import io, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")   # Python prints these names on a cp1252 console otherwise

import fitz                      # PyMuPDF
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "assets", "stickers")
MAX_H = 520                      # tall enough for a 260px pop-up on a 2x phone screen
MIN_PX = 40000                   # ignore logos and page furniture
QUALITY = 82                     # WebP: 8.1MB of PNG becomes 1.1MB at this, with the alpha intact

src = sys.argv[1] if len(sys.argv) > 1 else "Untitled design (6).pdf"
if not os.path.isabs(src):
    src = os.path.join(REPO, src)

doc = fitz.open(src)
os.makedirs(OUT, exist_ok=True)
for old in os.listdir(OUT):
    if old.endswith(".png") or old.endswith(".webp"):
        os.remove(os.path.join(OUT, old))

print(f"{doc.page_count} pages in {os.path.basename(src)}")
written, skipped = [], 0

for pno in range(doc.page_count):
    page = doc[pno]
    best = None
    for info in page.get_images(full=True):
        xref = info[0]
        try:
            d = doc.extract_image(xref)
        except Exception:
            continue
        w, h = d.get("width", 0), d.get("height", 0)
        if w * h < MIN_PX:
            continue
        if best is None or w * h > best[1] * best[2]:
            best = (xref, w, h)
    if not best:
        skipped += 1
        continue

    xref = best[0]
    # Pixmap resolves the image together with its soft mask, which is where the
    # transparency lives; extract_image would hand back the opaque picture only.
    pix = fitz.Pixmap(doc, xref)
    if pix.alpha == 0:
        smask = doc.xref_get_key(xref, "SMask")
        if smask and smask[0] == "xref":
            m = int(re.findall(r"(\d+)", smask[1])[0])
            try:
                pix = fitz.Pixmap(pix, fitz.Pixmap(doc, m))
            except Exception:
                pass
    if pix.colorspace and pix.colorspace.n == 4:      # CMYK from a print export
        pix = fitz.Pixmap(fitz.csRGB, pix)

    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")

    bbox = img.getbbox()                              # the cutout, without the empty page
    if bbox:
        img = img.crop(bbox)
    if img.height > MAX_H:
        img = img.resize((max(1, round(img.width * MAX_H / img.height)), MAX_H), Image.LANCZOS)

    # WebP, because these ship to a phone: the same 37 cutouts are 8.1MB as
    # PNG and 1.1MB here, with no visible difference at pop-up size.
    name = f"sticker-{pno + 1:02d}.webp"
    img.save(os.path.join(OUT, name), "WEBP", quality=QUALITY, method=6)
    written.append({"f": name, "w": img.width, "h": img.height,
                    "kb": round(os.path.getsize(os.path.join(OUT, name)) / 1024)})
    print(f"  {name}  {img.width}x{img.height}  {written[-1]['kb']}KB")

with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump([w["f"] for w in written], f)

# keep the service worker's precache list in step, so a re-run with a
# different page count cannot leave it pointing at files that are gone
swp = os.path.join(REPO, "sw.js")
sw = open(swp, encoding="utf-8").read()
lst = ", ".join(['"assets/stickers/index.json"'] + [f'"assets/stickers/{w["f"]}"' for w in written])
start, end = sw.index("/* STICKERS:BEGIN */"), sw.index("/* STICKERS:END */")
NL = chr(10)
sw = sw[:start] + "/* STICKERS:BEGIN */" + NL + "const STICKERS = [" + lst + "];" + NL + sw[end:]
open(swp, "w", encoding="utf-8", newline=NL).write(sw)
print("service worker precache list updated")

total = sum(w["kb"] for w in written)
print(f"\n{len(written)} stickers written, {skipped} pages had nothing usable")
print(f"total {total}KB, average {round(total / max(1, len(written)))}KB")
opaque = [w for w in written if w["kb"] > 90]
if opaque:
    print(f"heavy ones worth a look: {', '.join(w['f'] for w in opaque[:6])}")

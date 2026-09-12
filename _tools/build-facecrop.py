"""Crop the Manager Path portraits to the head, so a circle cannot behead anyone.

    py -3 _tools/build-facecrop.py            crop anything not square yet
    py -3 _tools/build-facecrop.py --force    redo every portrait
    py -3 _tools/build-facecrop.py --dry      report only, write nothing

WHY THIS EXISTS. The reveal shows the portrait in a 132px circle, and Commons
photos are as often a full-body touchline shot as a headshot: Kasper Hjulmand
is 386x1066 with his face in the top 11%. A circle crops the middle of that,
so the card showed his shirt and cut his head off. CSS can only guess at one
anchor for all 221, and no single anchor fits both a headshot and a man
standing on a touchline.

So the framing is decided here, once, per photo, and the file that ships is
already a square portrait. The app then just draws it: no object-position
guesswork, no per-image CSS, nothing to get wrong at runtime.

HOW. OpenCV's YuNet face detector, running locally on this machine (these are
photos of real people, so nothing about them leaves the laptop). The source is
re-fetched from Commons at 1000px wide rather than cropping the 400px copy on
disk, because a face box 80px wide upscaled into a 132px circle at 3x is a
smear. Crop, resize to 320, done: sharper on a phone AND about a fifth of the
weight, since a head is a much smaller picture than a man.

Faces YuNet cannot find (profiles, crowds, 1970s newsprint) keep their
original file and are listed at the end for a human look.

NEEDS: opencv-python (installed), and the YuNet model, downloaded once into
_tools/_models/ and not committed.

SAFE TO RE-RUN. A portrait already square is left alone unless --force."""
import csv
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import cv2
import numpy as np

# A Windows console is cp1252 and this prints Romanian and Hungarian names, so
# the run would otherwise die at the summary, after all the work is done.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACES = os.path.join(REPO, "assets", "faces")
MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_models")
MODEL = os.path.join(MODELS, "face_detection_yunet_2023mar.onnx")
MODEL_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/"
             "face_detection_yunet/face_detection_yunet_2023mar.onnx")
UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)"

FORCE = "--force" in sys.argv
DRY = "--dry" in sys.argv
FETCH_W = 1000          # what to ask Commons for
OUT = 320               # what ships: 132px circle at 2.4x
CONF = 0.6              # YuNet score below which a "face" is not one

# A detected box is eyebrows to chin. A portrait wants the whole head plus air
# around it, and the crop is squared on a point above the box centre because
# hair sits above the eyes and a chin needs less room than a forehead.
BOX_TO_CROP = 3.1       # crop side, in face-box heights
LIFT = 0.22             # how far above the box centre to sit, in box heights


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read()
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def commons_thumb(source_url, width):
    """The attribution file keeps the Commons page for every photo, which is
    the only durable handle on the original: the 400px thumbnail URL we saved
    last time cannot be talked into giving back a bigger one."""
    name = urllib.parse.unquote(source_url.rsplit("File:", 1)[-1])
    api = ("https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo"
           "&iiprop=url&iiurlwidth=%d&format=json&formatversion=2&titles=%s"
           % (width, urllib.parse.quote("File:" + name)))
    j = json.loads(get(api))
    pages = j.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None
    return pages[0]["imageinfo"][0].get("thumburl")


def detect(img, det):
    """YuNet has a working range, and a head that fills a 1000px photo sits
    above it: Cocu, Clough, Kubala and Kovacs all came back empty at full size
    and were found instantly at 500. So detection runs on a shrunk copy and
    the box is scaled back up. Two passes, because a face too small at 640 is
    then found at full size."""
    h, w = img.shape[:2]
    for target in (640, w):
        scale = min(1.0, target / float(w))
        small = cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1 else img
        det.setInputSize((small.shape[1], small.shape[0]))
        n, faces = det.detect(small)
        if faces is None or not len(faces):
            continue
        # A crowd behind a touchline is full of faces. The subject is the big
        # one: the photo is ON Commons because of him.
        best = max(faces, key=lambda f: f[2] * f[3])
        x, y, fw, fh, score = best[0], best[1], best[2], best[3], best[-1]
        if score < CONF or fw < small.shape[1] * 0.04:
            continue
        return (float(x) / scale, float(y) / scale, float(fw) / scale,
                float(fh) / scale, float(score))
    return None


def crop_square(img, box):
    h, w = img.shape[:2]
    x, y, fw, fh, _ = box
    cx = x + fw / 2
    cy = y + fh / 2 - fh * LIFT
    side = min(fh * BOX_TO_CROP, float(min(h, w)))

    # Slide the window back inside the picture rather than shrinking it: a
    # face near an edge should still come out the same size as everyone else.
    left = min(max(cx - side / 2, 0), w - side)
    top = min(max(cy - side / 2, 0), h - side)

    # The detector's box stops at the eyebrows and the chin, so the head is
    # taller than it says. Where the source is small the wanted crop does not
    # fit and the lift then shoves the chin onto the bottom edge, which the
    # circle would clip: check the whole head against the window and slide it
    # back. Both ends tight means the photo simply has no more to give, so
    # centre the head and take the least bad framing.
    head_top, head_bot = y - fh * 0.55, y + fh * 1.15
    room = side * 0.05
    if head_top < top + room:
        top = max(head_top - room, 0)
    if head_bot > top + side - room:
        top = min(head_bot + room - side, h - side)
    if head_top < top + room and head_bot > top + side - room:
        top = min(max((head_top + head_bot) / 2 - side / 2, 0), h - side)
    l, t, s = int(round(left)), int(round(top)), int(round(side))
    out = img[t:t + s, l:l + s]
    interp = cv2.INTER_AREA if s > OUT else cv2.INTER_CUBIC
    return cv2.resize(out, (OUT, OUT), interpolation=interp)


def is_square(path):
    img = cv2.imread(path)
    return img is not None and img.shape[0] == img.shape[1]


def note_the_crops(rows):
    """CC BY and CC BY-SA both ask you to say when you have changed the work,
    and a crop is a change. The credit file gains a column saying so, worked
    out from what is actually on disk rather than from this run, so it stays
    right whether the crop happened just now or three runs ago."""
    out = [["file", "manager", "license", "author", "source", "modified"]]
    for r in rows:
        square = is_square(os.path.join(FACES, r["file"]))
        out.append([r["file"], r["manager"], r["license"], r["author"], r["source"],
                    "cropped to the head and resized to %dpx" % OUT if square else ""])
    with open(os.path.join(FACES, "ATTRIBUTION.csv"), "w", encoding="utf8", newline="") as f:
        f.write("\n".join(";".join(c) for c in out) + "\n")


def main():
    os.makedirs(MODELS, exist_ok=True)
    if not os.path.exists(MODEL):
        print("fetching the YuNet model once ...")
        open(MODEL, "wb").write(get(MODEL_URL))

    rows = list(csv.DictReader(open(os.path.join(FACES, "ATTRIBUTION.csv"), encoding="utf8"),
                               delimiter=";"))
    index = json.load(open(os.path.join(FACES, "index.json"), encoding="utf8"))
    print("%d portraits, %d credited\n" % (len(index), len(rows)))

    det = cv2.FaceDetectorYN.create(MODEL, "", (320, 320), CONF, 0.3, 5000)
    todo = [r for r in rows if FORCE or not is_square(os.path.join(FACES, r["file"]))]
    print("%d to do (%d already square)\n" % (len(todo), len(rows) - len(todo)))

    done, missed, failed = [], [], []
    for i, r in enumerate(todo, 1):
        name, path = r["manager"], os.path.join(FACES, r["file"])
        try:
            url = commons_thumb(r["source"], FETCH_W)
            img = None
            if url:
                buf = np.frombuffer(get(url), np.uint8)
                img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
            if img is None:                       # commons said no; try what is on disk
                img = cv2.imread(path)
            if img is None:
                failed.append(name)
                continue
            box = detect(img, det)
            if box is None:
                missed.append(name)
                continue
            out = crop_square(img, box)
            if not DRY:
                cv2.imwrite(path, out, [cv2.IMWRITE_JPEG_QUALITY, 86])
            done.append((name, box[4], img.shape))
        except Exception as e:
            failed.append("%s (%s)" % (name, e))
        if i % 10 == 0 or i == len(todo):
            sys.stdout.write("\r  %d/%d  cropped %d, no face %d, failed %d"
                             % (i, len(todo), len(done), len(missed), len(failed)))
            sys.stdout.flush()
        time.sleep(0.15)                          # Commons throttles a burst hard
    print("")

    if not DRY:
        note_the_crops(rows)

    total = sum(os.path.getsize(os.path.join(FACES, f))
                for f in os.listdir(FACES) if f.endswith(".jpg"))
    print("\ncropped %d, no face found %d, failed %d" % (len(done), len(missed), len(failed)))
    print("faces folder now %.1f MB" % (total / 1024 / 1024))
    if missed:
        print("\nno face found, original kept, worth an eye (%d):" % len(missed))
        for n in missed:
            print("   " + n)
    if failed:
        print("\nfailed (%d): %s" % (len(failed), ", ".join(failed[:8])))
    if DRY:
        print("\n--dry, nothing written")


if __name__ == "__main__":
    main()

"""Turn the raw recordings in BALL2\\Sounds into something a phone can load.

    py -3 _tools/build-sounds.py [source-folder]     default: ../Sounds

WHY THIS IS A BUILD STEP
The sources are studio-weight WAV: the crowd bed alone is 61 seconds of 48kHz
24-bit mono, 8.5MB. That is fine sitting on the disk and absurd to send to a
phone on pub wifi, and this app is a PWA that would otherwise carry it in the
install.

There is no ffmpeg on this machine, so nothing here can encode to mp3 or opus.
What it can do is take out everything that costs bytes and buys nothing:

  24-bit -> 16-bit    the extra 8 bits are headroom for mixing, not listening
  48k -> 22.05k       crowd noise and a stadium roar hold nothing above 11kHz
                      that matters; scipy's resample_poly filters properly on
                      the way down rather than just dropping samples
  stereo -> mono      a roar is a wall of sound, not a stereo image
  61s -> 12s          for the bed only: broadband crowd hiss loops invisibly,
                      so the length was buying repetition insurance nobody
                      needs. The ends are crossfaded so the seam cannot be
                      heard.

That is ~9.4MB down to well under one, with no encoder involved.

Levels are normalised to a consistent peak so the bed sits under the game and
the goal cuts through it, rather than whichever happened to be recorded hotter
winning.
"""
import sys, wave, os
import numpy as np
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(REPO), "Sounds")
OUT = os.path.join(REPO, "assets", "sfx")
RATE = 22050


def read_wav(path):
    """Any bit depth in, float -1..1 mono out."""
    w = wave.open(path, "rb")
    ch, sw, fr, nf = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    raw = w.readframes(nf)
    w.close()
    if sw == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 3:
        # 24-bit has no numpy dtype: pad each sample up to 32-bit and shift down
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        pad = np.zeros((len(b), 4), dtype=np.uint8)
        pad[:, 1:] = b
        a = pad.view("<i4").ravel().astype(np.float32) / 2147483648.0
    elif sw == 4:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise SystemExit("unhandled sample width: %d bytes" % sw)
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, fr


def write_wav(path, a, rate=RATE):
    a = np.clip(a, -1.0, 1.0)
    pcm = (a * 32767.0).astype("<i2")
    w = wave.open(path, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(pcm.tobytes())
    w.close()
    return os.path.getsize(path)


def to_rate(a, fr, rate=RATE):
    if fr == rate:
        return a
    from math import gcd
    g = gcd(int(fr), int(rate))
    return resample_poly(a, rate // g, fr // g)


def normalise(a, peak):
    m = float(np.max(np.abs(a))) or 1.0
    return a * (peak / m)


def seamless_loop(a, seconds, rate=RATE, fade=0.6):
    """Take a chunk out of the middle and crossfade its tail over its head, so
    the end runs into the start with no click and no audible seam."""
    want = int(seconds * rate)
    f = int(fade * rate)
    if len(a) < want + f:
        return a
    start = (len(a) - (want + f)) // 2          # the middle is the steadiest part
    body = a[start:start + want].copy()
    tail = a[start + want:start + want + f]
    ramp = np.linspace(0.0, 1.0, f, dtype=np.float32)
    body[:f] = body[:f] * ramp + tail * (1.0 - ramp)
    return body


JOBS = [
    # source name,               output,      seconds (None = keep all), peak
    ("Goal Score.wav",           "goal.wav",  None, 0.92),
    ("White stadium noise.wav",  "crowd.wav", 12.0, 0.55),
]

if __name__ == "__main__":
    if not os.path.isdir(SRC):
        raise SystemExit("no source folder: " + SRC)
    os.makedirs(OUT, exist_ok=True)
    print("source: " + SRC)
    total_in = total_out = 0
    for name, out, secs, peak in JOBS:
        path = os.path.join(SRC, name)
        if not os.path.isfile(path):
            print("  !! missing, skipped: " + name)
            continue
        size_in = os.path.getsize(path)
        a, fr = read_wav(path)
        dur_in = len(a) / fr
        a = to_rate(a, fr)
        if secs:
            a = seamless_loop(a, secs)
        a = normalise(a, peak)
        size_out = write_wav(os.path.join(OUT, out), a)
        total_in += size_in
        total_out += size_out
        print("  %-24s %5.1fs %6.1f MB  ->  %-10s %5.1fs %6.1f KB" %
              (name, dur_in, size_in / 1048576, out, len(a) / RATE, size_out / 1024))
    if total_out:
        print("\n  %.1f MB -> %.0f KB  (%.0f%% smaller)" %
              (total_in / 1048576, total_out / 1024, 100 * (1 - total_out / total_in)))

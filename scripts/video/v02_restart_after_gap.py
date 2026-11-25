"""Video 2: "Restarting after a gap" (launch-kit.md section 4, video-formats.md script 2). Pillar 2, steps.

Usage (from scripts/video):
  python3 v02_restart_after_gap.py check                 # contrast + safe-box check of every frame
  python3 v02_restart_after_gap.py stills --out out/     # checked stills (--times 0,9,20.5,24)
  python3 v02_restart_after_gap.py render --out out/     # full MP4 with the code-made music bed

No numbers, so no "Sample data" chip. Pillar 2: no feature is named; the end screen is mark + name only.
"""
from __future__ import annotations

import argparse
import os
import sys

import careeros_video as cv
from careeros_video import (
    C, FPS, Frame, Style, TextBlock, Token, clamp01, contrast, draw_chip, draw_logo, draw_text_block,
    ease_in_out, ease_out_back, ease_out_cubic, lerp, make_backgrounds, pulse, render_video,
)
from PIL import Image, ImageDraw, ImageFilter

STEM = "2026-11-26-restart-after-gap"
END = 25.5
# Screen boundaries (launch-kit.md section 4).
S = [0.0, 4.5, 7.5, 11.0, 14.0, 18.5, 22.5, END]
STEP_SCREENS = {1: 1, 2: 2, 3: 3, 4: 4}  # screen index -> step number

STYLES = {
    "pop": Style("pop", "pop", vignette=0.55, grain=6, bar_glow=0.7, push=1.0, regrow=True, stagger=0.08, word_dur=0.34),
}

LOGO = os.environ.get("CAREEROS_MARK", cv.MARK_DARK)

# Text block positions: centred vertically around y = 760 (video-formats.md 1.4), left aligned at x = 80.
Y_TWO_88 = 760 - 88 * 1.2
Y_ONE_64 = 760 - 64 * 0.6
Y_TWO_64 = 760 - 64 * 1.2
Y_TWO_72 = 760 - 72 * 1.2


def words(s: str, color=C["fg"]) -> list[Token]:
    return [Token(w, color) for w in s.split()]


def text_blocks() -> list[TextBlock]:
    return [
        # Hook: line 1 at frame 0, line 2 at 0.4 s (launch kit).
        TextBlock([words("Back after a gap")], 88, 700, S[0], S[1], y_top=Y_TWO_88, force_visible=True),
        TextBlock([words("in your prep?")], 88, 700, 0.4, S[1], y_top=Y_TWO_88 + 88 * 1.2),
        TextBlock([words("Study one ordinary week.")], 64, 500, S[1], S[2], y_top=Y_ONE_64),
        TextBlock([words("Count the time per day.")], 64, 500, S[2], S[3], y_top=Y_ONE_64),
        TextBlock([words("Write the total down.")], 64, 500, S[3], S[4], y_top=Y_ONE_64),
        TextBlock([words("Plan the next week"), words("from that number.")], 64, 500, S[4], S[5], y_top=Y_TWO_64),
        TextBlock([words("A starting point,", C["primary"]), words("not a score.", C["primary"])], 72, 500, S[5], S[6], y_top=Y_TWO_72),
    ]


# ---------------------------------------------------------------- step track
TRACK_Y, TRACK_H, TRACK_GAP = 1230, 18, 20
TRACK_X0, TRACK_X1 = 80, 900
SEG_W = (TRACK_X1 - TRACK_X0 - 3 * TRACK_GAP) / 4


def track_state(t: float):
    """Per segment: (appear 0..1, fill 0..1, glow 0..1); plus the whole track's alpha."""
    segs = []
    for k in range(4):
        appear = ease_out_back((t - (2.0 + 0.12 * k)) / 0.45, 1.6)
        start = S[k + 1] + 0.3
        fill = ease_in_out((t - start) / 0.55)
        glow = 0.45 * fill * (1 - ease_in_out((t - (S[k + 2] + 0.2)) / 0.6))  # current step glows
        glow = max(glow, pulse(t, S[k + 1] + 1.6, 0.9) * fill)  # mid-screen beat
        glow = max(glow, pulse(t, 20.1 + 0.1 * k, 1.0))  # screen 6: all four steps light up
        segs.append((appear, fill, min(1.0, glow)))
    alpha = 1 - ease_in_out((t - (S[6] - 0.25)) / 0.4)
    return segs, alpha


def draw_track(fr: Frame, t: float, st: Style):
    segs, alpha = track_state(t)
    if alpha <= 0 or all(a <= 0 for a, _, _ in segs):
        return
    SS = 2
    x0r, y0r = 40, TRACK_Y - 60
    w, h = 900, 140
    layer = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    glow = Image.new("L", (w // 4, h // 4), 0)
    gd = ImageDraw.Draw(glow)
    for k, (appear, fill, gl) in enumerate(segs):
        if appear <= 0:
            continue
        sx = TRACK_X0 + k * (SEG_W + TRACK_GAP)
        cy = TRACK_Y + TRACK_H / 2
        hh = TRACK_H * clamp01(appear) / 2
        ww = SEG_W * (0.6 + 0.4 * min(appear, 1.1))
        bx0, bx1 = sx + (SEG_W - ww) / 2, sx + (SEG_W + ww) / 2
        # empty track: chart-6 outline (graphic contrast 4.1:1)
        d.rounded_rectangle(((bx0 - x0r) * SS, (cy - hh - y0r) * SS, (bx1 - x0r) * SS, (cy + hh - y0r) * SS),
                            radius=hh * SS, outline=C["chart6"] + (int(255 * clamp01(appear)),), width=3 * SS)
        if fill > 0:
            fx1 = bx0 + (bx1 - bx0) * fill
            d.rounded_rectangle(((bx0 - x0r) * SS, (cy - hh - y0r) * SS, (max(fx1, bx0 + 2 * hh) - x0r) * SS, (cy + hh - y0r) * SS),
                                radius=hh * SS, fill=C["primary"] + (255,))
            if gl > 0:
                gd.rounded_rectangle(((bx0 - 8 - x0r) / 4, (cy - hh - 8 - y0r) / 4, (fx1 + 8 - x0r) / 4, (cy + hh + 8 - y0r) / 4),
                                     radius=3, fill=int(255 * gl))
        fr.readable(f"track:{k + 1}", (sx, TRACK_Y, sx + SEG_W, TRACK_Y + TRACK_H))
    layer = layer.resize((w, h), Image.LANCZOS)
    region = fr.img.crop((x0r, y0r, x0r + w, y0r + h)).convert("RGBA")
    if glow.getbbox():
        m = glow.filter(ImageFilter.GaussianBlur(4)).resize((w, h), Image.BILINEAR).point(lambda v: int(v * st.bar_glow * alpha))
        region = Image.composite(Image.new("RGBA", region.size, C["primary"] + (255,)), region, m)
    region.alpha_composite(cv.with_alpha(layer, alpha))
    fr.img.paste(region.convert("RGB"), (x0r, y0r))


def draw_step_chip(fr: Frame, t: float):
    for screen, step in STEP_SCREENS.items():
        t0, t1 = S[screen], S[screen + 1]
        if t0 - 0.05 <= t < t1:
            a = ease_out_cubic((t - t0) / 0.25) * (1 - ease_in_out((t - (t1 - 0.22)) / 0.22))
            draw_chip(fr, f"Step {step}", a, flash=pulse(t, t0, 0.8))


def end_screen(fr: Frame, t: float, st: Style):
    """Pillar 2 end screen: mark above the name, nothing else (launch kit section 2)."""
    t0 = S[6]
    if t < t0 - 0.1:
        return
    drift = 1 + 0.012 * ease_in_out((t - t0) / (END - t0))
    cx, cy = 490, 825

    def y(v):
        return cy + (v - cy) * drift

    p = (t - (t0 + 0.1)) / 0.5
    if p > 0:
        draw_logo(fr, LOGO, cx, y(740), 160 * drift, clamp01(p * 2.5), 0.6 + 0.4 * ease_out_back(p, 1.8))
    draw_text_block(fr, TextBlock([[Token("CareerOS", C["primary"])]], 88 * drift, 700, t0 + 0.45, END + 1,
                                  align="center", x=cx, y_top=y(860)), st)


_BG: dict = {}


def frame_fn(style_name: str):
    st = STYLES[style_name]
    if style_name not in _BG:
        _BG[style_name] = make_backgrounds(st)
    bgs = _BG[style_name]
    blocks = text_blocks()

    def frame(t: float, check: bool = True):
        img = bgs[int(t * 10) % len(bgs)].copy()
        fr = Frame(img, t)
        draw_track(fr, t, st)
        draw_step_chip(fr, t)
        for b in blocks:
            draw_text_block(fr, b, st)
        end_screen(fr, t, st)
        if check:
            fr.check_safe()
        return fr.img
    return frame


def check_contrast(style_name: str):
    bgs = make_backgrounds(STYLES[style_name])
    worst = (0, 0, 0)
    for bg in bgs:
        box = bg.crop((80, 250, 900, 1400))
        worst = tuple(max(w, ch.getextrema()[1]) for w, ch in zip(worst, box.split()))
    return worst, {
        "fg": contrast(C["fg"], worst), "muted": contrast(C["muted"], worst),
        "primary text": contrast(C["primary"], worst), "chart-6 track": contrast(C["chart6"], worst),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["stills", "check", "render"])
    ap.add_argument("--style", default="pop", choices=list(STYLES))
    ap.add_argument("--out", default="out")
    ap.add_argument("--times", default="")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--music-seed", type=int, default=2, help="seed of the code-made music bed")
    ap.add_argument("--no-music", action="store_true", help="silent audio track instead")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    f = frame_fn(a.style)
    if a.cmd == "stills":
        times = [float(x) for x in a.times.split(",")] if a.times else [0.0, 9.0, 20.5, 24.0]
        for t in times:
            p = os.path.join(a.out, f"v02-{a.style}-{t:05.2f}.png")
            f(t).save(p)
            print(p)
    elif a.cmd == "check":
        worst, pairs = check_contrast(a.style)
        print("brightest bg", worst, {k: round(v, 2) for k, v in pairs.items()})
        if not (pairs["fg"] >= 4.5 and pairs["muted"] >= 4.5 and pairs["primary text"] >= 4.5 and pairs["chart-6 track"] >= 3):
            raise SystemExit("contrast check failed")
        n = round(END * FPS)
        for i in range(n):
            f(i / FPS)
        print(f"{n} frames inside the safe box")
    else:
        print(render_video(__name__ if __name__ != "__main__" else "v02_restart_after_gap", a.style, S, a.out, STEM,
                           None if a.no_music else a.music_seed, a.jobs))


if __name__ == "__main__":
    sys.exit(main())

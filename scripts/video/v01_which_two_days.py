"""Video 1: "Which two days did the work?" (launch-kit.md section 3, video-formats.md script 1).

Usage (from scripts/video):
  python3 v01_which_two_days.py check  --style pop                 # contrast + safe-box check of every frame
  python3 v01_which_two_days.py stills --style pop --out out/      # checked stills (--times 1.2,12.6,29)
  python3 v01_which_two_days.py render --style pop --out out/      # full MP4, one file per scene, then joined

Published version: style "pop" (product owner pick, 2026-11-24).
"""
from __future__ import annotations

import argparse
import os
import sys
from multiprocessing import Pool

from careeros_video import (
    C, FPS, BarChart, BarState, ChartState, Frame, Style, TextBlock, Token,
    clamp01, contrast, draw_chip, draw_logo, draw_text_block, ease_in_out, ease_out_back,
    ease_out_cubic, encode_scene, fmt_minutes, join_scenes, lerp, make_backgrounds, pulse, track,
)
import careeros_video as cv

STEM = "2026-11-24-which-two-days"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MINUTES = [20, 30, 25, 115, 20, 130, 60]  # sample week, video-formats.md 2.5
assert sum(MINUTES) == 400 and MINUTES[3] + MINUTES[5] == 245 and 400 - 245 == 155
BIG = {3, 5}  # Thu, Sat
REST = set(range(7)) - BIG
END = 30.5

# Screen boundaries (launch-kit.md section 3).
S = [0.0, 4.0, 7.5, 10.5, 14.5, 19.0, 23.0, 26.5, END]

STYLES = {
    "glide": Style("glide", "slide", bg_glow=0.10, bar_glow=0.55, push=1.06),
    "pop": Style("pop", "pop", vignette=0.55, grain=6, bar_glow=0.7, push=1.0, regrow=True, stagger=0.08, word_dur=0.34),
    "spotlight": Style("spotlight", "wipe", grain=4, bar_glow=0.25, band=0.13, push=1.06),
}


def count_token(target: int, t0: float, dur: float, suffix: str = "") -> Token:
    def text(t: float) -> str:
        p = ease_out_cubic((t - t0) / dur)
        return fmt_minutes(round(target * p / 5) * 5 if p < 1 else target) + suffix
    return Token(text, C["primary"], final=fmt_minutes(target) + suffix)


def words(s: str, color=C["fg"]) -> list[Token]:
    return [Token(w, color) for w in s.split()]


def text_blocks():
    return [
        TextBlock([words("Which two days"), words("did the work?")], 88, 700, S[0], S[1], force_visible=True),
        TextBlock([words("Here is a sample week.")], 72, 500, S[1], S[2]),
        TextBlock([words("Seven days:") + [count_token(400, S[2] + 0.25, 0.9, ".")]], 72, 500, S[2], S[3]),
        TextBlock([words("Thursday and Saturday"), words("hold") + [count_token(245, S[3] + 0.45, 0.8, ".")]], 64, 500, S[3], S[4]),
        TextBlock([words("The other five days"), words("hold") + [Token("2h 35m.", C["primary"])]], 64, 500, S[4], S[5]),
        TextBlock([words("We think memory"), words("keeps big days.")], 72, 500, S[5], S[6]),
        TextBlock([words("A count keeps all seven.")], 64, 500, S[6], S[7], y_top=1064),
    ]


CHART = BarChart(DAYS, MINUTES)

# Chart transforms, p' = s * p + b.
PUSH_ANCHOR = (80, CHART.bottom())  # grow up and to the right, so the chart stays in the safe box


def chart_state(t: float, st: Style) -> ChartState:
    bars = []
    focus4, focus5 = S[3], S[4]
    for i in range(7):
        b = BarState()
        # first screen: bars grow from zero in 0.8 s (staggered)
        b.grow = ease_out_back((t - 0.04 * i) / 0.56, 1.2) if t < 1.0 else 1.0
        is_big = i in BIG
        # focus screens
        on4 = 1.0 if is_big else 0.0
        on5 = 0.0 if is_big else 1.0
        foc = track(t, 0.0, [(focus4, 0.45, on4), (focus5, 0.45, on5), (S[5], 0.45, 0.0)])
        dim = track(t, 0.0, [(focus4, 0.45, 1 - on4), (focus5, 0.45, 1 - on5), (S[5], 0.45, 0.0)])
        b.outline, b.bold, b.dim, b.band = foc, foc, dim, foc
        # glow: steady on focused bars, plus the beats
        g = 0.55 * foc
        g += pulse(t, 1.75, 0.9) * 0.6  # S1 beat: whole chart breathes
        g = max(g, pulse(t, 8.75 + 0.06 * i, 0.8))  # S3 beat: every bar adds to the total
        g = max(g, pulse(t, 12.4, 1.0) if is_big else 0)  # S4 beat
        rest_order = sorted(REST).index(i) if i in REST else 0  # ripple over the five other days, top to bottom
        g = max(g, pulse(t, 16.4 + 0.08 * rest_order, 0.8) if not is_big else 0)  # S5 ripple
        g = max(g, pulse(t, 20.5, 1.1) if is_big else 0)  # S6: memory keeps the big days
        g = max(g, pulse(t, 24.3 + 0.12 * i, 0.7))  # S7: a count keeps all seven
        b.glow = min(1.0, g)
        if st.regrow:
            for ts, group in ((focus4, BIG), (focus5, REST), (S[5], set(range(7)))):
                if i in group and ts <= t < ts + 0.6:
                    b.grow = 0.3 + 0.7 * ease_out_back((t - ts) / 0.6, 1.6)
        bars.append(b)

    # transforms
    s_push = st.push
    bpx, bpy = PUSH_ANCHOR[0] * (1 - s_push), PUSH_ANCHOR[1] * (1 - s_push)
    s7, top7 = 0.78, 380
    b7x, b7y = 80 * (1 - s7), CHART.y_top * (1 - s7) + (top7 - CHART.y_top)
    keys = [(focus4, 1.4, 1), (focus5, 0.55, 0), (S[6], 0.6, 2)]
    targets = {0: (1.0, 0.0, 0.0), 1: (s_push, bpx, bpy), 2: (s7, b7x, b7y)}
    sc, bx, by = 1.0, 0.0, 0.0
    for start, dur, k in keys:
        if t < start:
            break
        e = ease_in_out((t - start) / dur)
        ts, tx, ty = targets[k]
        sc, bx, by = lerp(sc, ts, e), lerp(bx, tx, e), lerp(by, ty, e)
    alpha = 1 - ease_in_out((t - (S[7] - 0.25)) / 0.4)
    # end of S7 -> end screen: settle slightly smaller as it fades
    return ChartState(bars, sc, bx, by, alpha)


LOGO = os.environ.get("CAREEROS_MARK", cv.MARK_DARK)


def end_screen(fr: Frame, t: float, st: Style):
    t0 = S[7]
    if t < t0 - 0.1:
        return
    drift = 1 + 0.012 * ease_in_out((t - t0) / (END - t0))  # slow push on the whole block
    cx, cy = 490, 825  # centre of the safe box

    def y(v):  # positions scale around the block centre
        return cy + (v - cy) * drift

    # block layout (top to bottom): line, mark, name, small line
    blocks = [
        TextBlock([words("Free Chrome extension.")], 72 * drift, 500, t0 + 0.05, END + 1, align="center", x=490, y_top=y(560)),
        TextBlock([[Token("CareerOS", C["primary"])]], 88 * drift, 700, t0 + 0.55, END + 1, align="center", x=490, y_top=y(892)),
        TextBlock([words("Link in profile", C["muted"])], 40 * drift, 700, t0 + 1.1, END + 1, align="center", x=490, y_top=y(1020)),
    ]
    for b in blocks:
        b_style = st
        draw_text_block(fr, b, b_style)
    p = (t - (t0 + 0.3)) / 0.5
    if p > 0:
        sc = 0.6 + 0.4 * ease_out_back(p, 1.8) if st.word_anim != "wipe" else 0.85 + 0.15 * ease_out_cubic(p)
        draw_logo(fr, LOGO, 490, y(774), 160 * drift, clamp01(p * 2.5), sc)


_BG = {}


def frame_fn(style_name: str):
    st = STYLES[style_name]
    if style_name not in _BG:
        _BG[style_name] = make_backgrounds(st)
    bgs = _BG[style_name]
    blocks = text_blocks()

    def frame(t: float, check: bool = True):
        img = bgs[int(t * 10) % len(bgs)].copy()
        fr = Frame(img, t)
        cs = chart_state(t, st)
        CHART.draw(fr, cs, st)
        chip_alpha = 1 - ease_in_out((t - (S[7] - 0.25)) / 0.4)
        draw_chip(fr, "Sample data", chip_alpha, flash=pulse(t, 5.4, 1.0))
        for b in blocks:
            draw_text_block(fr, b, st)
        end_screen(fr, t, st)
        if check:
            fr.check_safe()
        return fr.img
    return frame


# ---------------------------------------------------------------- checks
def check_contrast(style_name: str):
    """Text and bars against the brightest background pixel in the safe box."""
    bgs = make_backgrounds(STYLES[style_name])
    brightest = max((bg.crop((80, 250, 900, 1400)).convert("L").getextrema()[1], i) for i, bg in enumerate(bgs))
    # find that pixel's colour roughly: use the max per channel in the box
    bg = bgs[brightest[1]].crop((80, 250, 900, 1400))
    worst = tuple(ch.getextrema()[1] for ch in bg.split())
    # band behind focused rows
    st = STYLES[style_name]
    if st.band:
        worst = tuple(max(w, int(lerp(a, p, st.band + st.bar_glow * 0.55))) for w, a, p in zip(worst, C["bg"], C["primary"]))
    pairs = {
        "fg": contrast(C["fg"], worst), "muted": contrast(C["muted"], worst),
        "primary text": contrast(C["primary"], worst), "chart-6 bar": contrast(C["chart6"], worst),
    }
    return worst, pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["stills", "check", "render", "frames"])
    ap.add_argument("--style", default="pop", choices=list(STYLES))
    ap.add_argument("--out", default="out")
    ap.add_argument("--times", default="")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--music-seed", type=int, default=1, help="seed of the code-made music bed")
    ap.add_argument("--no-music", action="store_true", help="silent audio track instead")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    f = frame_fn(a.style)
    if a.cmd in ("stills", "frames"):
        times = [float(x) for x in a.times.split(",")] if a.times else [1.2, 12.6, 29.0]
        for t in times:
            p = os.path.join(a.out, f"{a.style}-{t:05.2f}.png")
            f(t).save(p)
            print(p)
    elif a.cmd == "check":
        worst, pairs = check_contrast(a.style)
        print("brightest bg", worst, {k: round(v, 2) for k, v in pairs.items()})
        assert pairs["fg"] >= 4.5 and pairs["muted"] >= 4.5 and pairs["primary text"] >= 4.5 and pairs["chart-6 bar"] >= 3
        n = round(END * FPS)
        for i in range(n):
            f(i / FPS)
        print(f"{n} frames inside the safe box")
    else:
        parts = []
        jobs = []
        for k in range(len(S) - 1):
            parts.append(os.path.join(a.out, f"{a.style}-scene{k + 1}.mp4"))
            jobs.append((a.style, S[k], S[k + 1], parts[-1]))
        with Pool(a.jobs) as pool:
            pool.starmap(_render_scene, jobs)
        out = os.path.join(a.out, f"{STEM}.mp4")
        audio = None
        if not a.no_music:
            import careeros_music
            audio = os.path.join(a.out, f"{STEM}-music.wav")
            careeros_music.write_wav(audio, careeros_music.render(END, a.music_seed))
        join_scenes(parts, out, STEM, audio)
        print(out)


def _render_scene(style, t0, t1, path):
    encode_scene(frame_fn(style), t0, t1, path)


if __name__ == "__main__":
    sys.exit(main())

"""Video 3: "Which site took most of your week?" (content pillars section 2, idea 7). Pillar 1, chart as tiles, style B (#291).

Usage (from scripts/video):
  python3 v03_which_site.py check                 # contrast pairs, thumbnail, sample sums, safe box of every frame
  python3 v03_which_site.py stills --out out/     # stills (--times 0,0.45,9,14,18,26)
  python3 v03_which_site.py render --out out/     # out/2026-11-29-which-site-most.mp4 + .cover.jpg, with music

Sample data on screens 1 to 6 (video-formats.md 2.5, site table). Frame 0 is the cover.
"""
from __future__ import annotations

import argparse
import os
import sys

import careeros_bold as b
import careeros_video as cv
from careeros_video import C, FPS, Frame, clamp01, ease_in_out, ease_out_back, font, pulse, render_video
from PIL import Image, ImageDraw

STEM = "2026-11-29-which-site-most"
END = 28.0
# Screens: hook, total, leetcode, other two, view, by site, end (timing rule, video-formats.md 1.1).
S = [0.0, 4.0, 7.5, 12.0, 16.5, 21.0, 24.0, END]

SITES = ["leetcode.com", "neetcode.io", "greatfrontend.com"]
MINUTES = [190, 120, 90]  # sample site table: 3h 10m, 2h 00m, 1h 30m
assert sum(MINUTES) == 400 and MINUTES[1] + MINUTES[2] == 210, "sample site table must add up (6h 40m; 3h 30m)"

HOOK_PX = 116
HOOK = [[("Which site", False)], [("took", False), ("most", True)], [("of your week?", False)]]
BODY_PX = 96
LOGO = os.environ.get("CAREEROS_MARK", cv.MARK_DARK)
STYLES = {"bold": None}

GRID = b.TileGrid(SITES, [cv.fmt_minutes(m) for m in MINUTES], cols=1, tw=790, th=140, gap=22, y0=910, x0=95,
                  label_px=52, value_px=56, layout="row")


def screen_of(t: float) -> int:
    for k in range(len(S) - 1):
        if t < S[k + 1]:
            return k
    return len(S) - 2


def ramp(t: float, start: float, dur: float = 0.35) -> float:
    return ease_in_out((t - start) / dur)


def tile_states(t: float) -> tuple[list[b.TileState], list[str]]:
    """Lit, value shown, lift and scale per tile, by screen."""
    values = [cv.fmt_minutes(m) for m in MINUTES]
    lit = [0.0, 0.0, 0.0]
    shown = [0.0, 0.0, 0.0]
    # screen 1: leetcode.com lit with "?" from frame 0 (the cover asks, the video answers)
    q = 1 - ramp(t, S[1] - 0.1, 0.3)
    lit[0] = q
    if t < S[1]:
        values[0] = "?"
        shown[0] = 1.0
    # screen 3: leetcode.com lit with its time
    on3 = ramp(t, S[2] + 0.2) * (1 - ramp(t, S[3] - 0.1, 0.3))
    lit[0] = max(lit[0], on3)
    shown[0] = max(shown[0], ramp(t, S[2] + 0.2))
    # screen 4: the other two lit with their times
    on4 = ramp(t, S[3] + 0.2) * (1 - ramp(t, S[4] - 0.1, 0.3))
    for i in (1, 2):
        lit[i] = max(lit[i], on4)
        shown[i] = max(shown[i], ramp(t, S[3] + 0.2))
    # screen 5: all three lit; screen 6: all shown, unlit
    on5 = ramp(t, S[4] + 0.2) * (1 - ramp(t, S[5] - 0.1, 0.3))
    for i in range(3):
        lit[i] = max(lit[i], on5)
    if t >= S[2] + 0.2:
        shown = [max(s, ramp(t, S[2] + 0.2)) if i == 0 else s for i, s in enumerate(shown)]
    if t >= S[4]:
        shown = [1.0, 1.0, 1.0]
    alpha = 1 - ramp(t, S[6] - 0.3, 0.4)  # tiles leave before the end screen
    states = []
    for i in range(3):
        lift = b.ripple(t, 0.05, i, height=18)  # first second: a wave from the final state
        scale = 1.0 + 0.02 * pulse(t, 0.35, 0.5) * (1 if i == 0 else 0)  # the "?" tile bounces once
        scale += 0.02 * pulse(t, S[2] + 0.2, 0.5) * (1 if i == 0 else 0)
        scale += 0.02 * pulse(t, S[3] + 0.2, 0.5) * (1 if i in (1, 2) else 0)
        glow = 0.35 * pulse(t, 0.3, 0.8) * (1 if i == 0 else 0)
        states.append(b.TileState(lit=clamp01(lit[i]), lift=lift, scale=scale, glow=glow, alpha=alpha,
                                  value_alpha=shown[i]))
    return states, values


def texts(fr: Frame):
    t = fr.t
    y = 350
    # 1 hook: complete at frame 0
    b.draw_hook(fr, HOOK, HOOK_PX, y, t_in=0.0, t_out=S[1])
    # P10 line: who it is for and what it does, from 1.0 s
    if 1.0 <= t < S[1]:
        b.draw_hook(fr, [[("Interview prep, counted.", False)]], 64, 800, t_in=1.0, t_out=S[1], weight=600, in_dur=0.35)
    body = [
        (S[1], S[2], [[("A sample week:", False)], [("6h 40m", True)]]),
        (S[2], S[3], [[("leetcode.com took", False)], [("the most:", False), ("3h 10m", True)]]),
        (S[3], S[4], [[("The other two sites", False)], [("hold", False), ("3h 30m", True)]]),
        (S[4], S[5], [[("We think a count", False)], [("beats a guess.", False)]]),
        (S[5], S[6], [[("Your week,", False)], [("by site.", True)]]),
    ]
    for t0, t1, lines in body:
        if t0 - 0.05 <= t <= t1:
            b.draw_hook(fr, lines, b.fit_size(lines, BODY_PX), y + 60, t_in=t0, t_out=t1, weight=800, in_dur=0.35)


def end_screen(fr: Frame):
    """Free Chrome extension. / mark above CareerOS / Link in profile, on a card panel so `primary`
    and `muted` text keep 6.7:1 against the gradient (video-formats.md 1.3)."""
    t = fr.t
    t0 = S[6]
    if t < t0 - 0.05:
        return
    a = ramp(t, t0, 0.4)
    cx = 490
    panel = (80, 560, 900, 1120)  # 40 px padding around the 740 px line
    layer = Image.new("RGBA", (cv.W, cv.H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(panel, radius=40, fill=C["card"] + (int(245 * a),), outline=C["border"] + (int(255 * a),), width=3)
    f72, f88, f44 = font(64, 700), font(88, 700), font(44, 600)
    d.text((cx, 660), "Free Chrome extension.", font=f72, fill=C["fg"] + (int(255 * a),), anchor="mm")
    d.text((cx, 980), "CareerOS", font=f88, fill=C["primary"] + (int(255 * a),), anchor="mm")
    d.text((cx, 1065), "Link in profile", font=f44, fill=C["muted"] + (int(255 * a),), anchor="mm")
    fr.img.paste(layer, (0, 0), layer)
    for label, txt, f, yy in (("end:line", "Free Chrome extension.", f72, 660), ("end:name", "CareerOS", f88, 980),
                              ("end:link", "Link in profile", f44, 1065)):
        bb = f.getbbox(txt, anchor="mm")
        fr.readable(label, (cx + bb[0], yy + bb[1], cx + bb[2], yy + bb[3]))
    p = (t - (t0 + 0.15)) / 0.5
    if p > 0:
        cv.draw_logo(fr, LOGO, cx, 815, 160, clamp01(p * 2.5), 0.6 + 0.4 * ease_out_back(p, 1.8))


def frame_fn(style_name: str = "bold"):
    def frame(t: float, check: bool = True):
        fr = Frame(b.background(t), t)
        if t < S[6]:
            b.draw_label_chip(fr, "Sample data", alpha=1 - ramp(t, S[6] - 0.3, 0.3))
        states, values = tile_states(t)
        GRID.values = values
        GRID.draw(fr, states)
        texts(fr)
        end_screen(fr)
        if check:
            fr.check_safe()
        return fr.img
    return frame


def run_checks(f) -> list[str]:
    report = []
    for name, (v, need) in b.contrast_pairs().items():
        report.append(f"{name}: {v:.2f}:1 (needs {need})")
        if v < need:
            raise SystemExit(f"contrast check failed: {name}")
    end_pairs = {"primary on card (end name)": cv.contrast(C["primary"], C["card"]),
                 "fg on card (end line)": cv.contrast(C["fg"], C["card"])}
    for name, v in end_pairs.items():
        report.append(f"{name}: {v:.2f}:1 (needs 4.5)")
        if v < 4.5:
            raise SystemExit(f"contrast check failed: {name}")
    b.check_hook(HOOK, HOOK_PX)
    report.append(f"hook: {HOOK_PX} px, {len(HOOK)} lines, 13 characters a line at most")
    report.append(f"thumbnail: hook cap height {b.check_thumbnail(HOOK_PX):.1f} px at 200 px wide (needs 15)")
    n = round(END * FPS)
    for i in range(n):
        f(i / FPS)
    report.append(f"{n} frames inside the safe box")
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["stills", "check", "render"])
    ap.add_argument("--style", default="bold", choices=list(STYLES))
    ap.add_argument("--out", default="out")
    ap.add_argument("--times", default="")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--music-seed", type=int, default=3, help="seed of the code-made music bed")
    ap.add_argument("--no-music", action="store_true", help="silent audio track instead")
    a = ap.parse_args()
    if a.cmd != "check":
        os.makedirs(a.out, exist_ok=True)
    f = frame_fn(a.style)
    if a.cmd == "stills":
        times = [float(x) for x in a.times.split(",")] if a.times else [0.0, 0.45, 9.0, 14.0, 18.0, 26.0]
        for t in times:
            p = os.path.join(a.out, f"v03-{t:05.2f}.png")
            f(t).save(p)
            print(p)
    elif a.cmd == "check":
        print("\n".join(run_checks(f)))
    else:
        print(render_video(__name__ if __name__ != "__main__" else "v03_which_site", a.style, S, a.out, STEM,
                           None if a.no_music else a.music_seed, a.jobs, cover_t=0.0))


if __name__ == "__main__":
    sys.exit(main())

"""Video 4: "What does CareerOS never store?" (content pillars section 4, idea 2). Pillar 3, list as tiles, style B (#291, #294).

Usage (from scripts/video):
  python3 v04_never_stores.py check                 # contrast pairs, hook, thumbnail, safe box of every frame
  python3 v04_never_stores.py stills --out out/     # stills (--times 0,0.45,2,5,9,12,15,18,21,25)
  python3 v04_never_stores.py render --out out/     # out/2026-12-01-never-stores.mp4 + .cover.jpg, with music

No numbers, so no "Sample data" chip. Facts from brand-profile.md section 6 only: CareerOS never stores full
web addresses, page titles, page content or keystrokes; about your study time it stores the site name and the
start and end times (the account email and sign-in provider are stored too, hence "Your study time").
Frame 0 is the cover.
"""
from __future__ import annotations

import argparse
import os
import sys

import careeros_bold as b
import careeros_video as cv
from careeros_video import C, FPS, Frame, clamp01, ease_in_out, ease_out_back, font, pulse, render_video
from PIL import Image, ImageDraw

STEM = "2026-12-01-never-stores"
END = 26.5
# Screens: hook, 4 x "Never stores", your study time, public code, end (timing rule, video-formats.md 1.1).
S = [0.0, 4.0, 7.5, 10.5, 13.5, 16.0, 19.5, 23.0, END]

ITEMS = ["Full web addresses", "Page titles", "Page content", "Keystrokes"]
STATUS = "Not stored"

HOOK_PX = 116
HOOK = [[("What does", False)], [("CareerOS", False)], [("never store?", True)]]
BODY_PX = 96
LOGO = os.environ.get("CAREEROS_MARK", cv.MARK_DARK)
STYLES = {"bold": None}

GRID = b.TileGrid(ITEMS, [STATUS] * 4, cols=1, tw=790, th=102, gap=22, y0=915, x0=95,
                  label_px=48, value_px=44, layout="row")


def ramp(t: float, start: float, dur: float = 0.35) -> float:
    return ease_in_out((t - start) / dur)


def tile_states(t: float) -> list[b.TileState]:
    """Tile k lights on screen k + 2 and keeps its status word; on the cover row 1 only glows."""
    alpha = 1 - ramp(t, S[5] - 0.3, 0.4)  # tiles leave before "Your study time"
    states = []
    for k in range(4):
        start = S[k + 1] + 0.2
        on = ramp(t, start)
        lift = b.ripple(t, 0.05, k, height=18)  # first second: a wave from the final state
        scale = 1.0 + 0.02 * pulse(t, start, 0.5)
        glow = 0.3 * pulse(t, start, 0.7)
        if k == 0 and t < S[1] + 0.2:  # cover: row 1 glows but stays dark, so blue is only in the hook block
            glow = max(glow, (0.45 + 0.25 * pulse(t, 0.3, 0.8)) * (1 - ramp(t, S[1] - 0.1, 0.3)))  # fades, no pop
        states.append(b.TileState(lit=clamp01(on), lift=lift, scale=scale, glow=glow, alpha=alpha, value_alpha=on))
    return states


def texts(fr: Frame):
    t = fr.t
    y = 350
    b.draw_hook(fr, HOOK, HOOK_PX, y, t_in=0.0, t_out=S[1])  # complete at frame 0
    # P10 line: what it is, from 0.6 s
    if 0.6 <= t < S[1]:
        b.draw_hook(fr, [[("A study time tracker.", False)]], 64, 800, t_in=0.6, t_out=S[1], weight=600, in_dur=0.35)
    body = [(S[k + 1], S[k + 2], [[("Never stores", False)], [(ITEMS[k].lower(), True)]])
            for k in range(4)]
    body += [
        (S[5], S[6], [[("Site name,", True)], [("start and end times.", False)]]),
        (S[6], S[7], [[("The code is public", False)], [("on GitHub.", True)]]),
    ]
    for t0, t1, lines in body:
        if t0 - 0.05 <= t <= t1:
            yy = y + 60 if t0 < S[5] else 720
            b.draw_hook(fr, lines, b.fit_size(lines, BODY_PX), yy, t_in=t0, t_out=t1, weight=800, in_dur=0.35)
    if S[5] - 0.05 <= t < S[6]:
        b.draw_label_chip(fr, "Your study time", y=620, alpha=ramp(t, S[5], 0.3) * (1 - ramp(t, S[6] - 0.25, 0.25)))


def end_screen(fr: Frame):
    """Free Chrome extension. / mark above CareerOS / Link in profile, on a card panel (video-formats.md 1.3)."""
    t = fr.t
    t0 = S[7]
    if t < t0 - 0.05:
        return
    a = ramp(t, t0, 0.4)
    cx = 490
    panel = (80, 560, 900, 1120)  # 40 px padding around the 740 px line
    layer = Image.new("RGBA", (cv.W, cv.H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(panel, radius=40, fill=C["card"] + (int(245 * a),), outline=C["border"] + (int(255 * a),), width=3)
    f64, f88, f44 = font(64, 700), font(88, 700), font(44, 600)
    d.text((cx, 660), "Free Chrome extension.", font=f64, fill=C["fg"] + (int(255 * a),), anchor="mm")
    d.text((cx, 980), "CareerOS", font=f88, fill=C["primary"] + (int(255 * a),), anchor="mm")
    d.text((cx, 1065), "Link in profile", font=f44, fill=C["muted"] + (int(255 * a),), anchor="mm")
    fr.img.paste(layer, (0, 0), layer)
    for label, txt, f, yy in (("end:line", "Free Chrome extension.", f64, 660), ("end:name", "CareerOS", f88, 980),
                              ("end:link", "Link in profile", f44, 1065)):
        bb = f.getbbox(txt, anchor="mm")
        fr.readable(label, (cx + bb[0], yy + bb[1], cx + bb[2], yy + bb[3]))
    p = (t - (t0 + 0.15)) / 0.5
    if p > 0:
        cv.draw_logo(fr, LOGO, cx, 815, 160, clamp01(p * 2.5), 0.6 + 0.4 * ease_out_back(p, 1.8))


def frame_fn(style_name: str = "bold"):
    def frame(t: float, check: bool = True):
        fr = Frame(b.background(t), t)
        GRID.draw(fr, tile_states(t))
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
    for name, v in {"primary on card (end name)": cv.contrast(C["primary"], C["card"]),
                    "fg on card (end line)": cv.contrast(C["fg"], C["card"])}.items():
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
    ap.add_argument("--music-seed", type=int, default=4, help="seed of the code-made music bed")
    ap.add_argument("--no-music", action="store_true", help="silent audio track instead")
    a = ap.parse_args()
    if a.cmd != "check":
        os.makedirs(a.out, exist_ok=True)
    f = frame_fn(a.style)
    if a.cmd == "stills":
        times = [float(x) for x in a.times.split(",")] if a.times else [0.0, 0.45, 2.0, 5.0, 9.0, 12.0, 15.0, 18.0, 21.0, 25.0]
        for t in times:
            p = os.path.join(a.out, f"v04-{t:05.2f}.png")
            f(t).save(p)
            print(p)
    elif a.cmd == "check":
        print("\n".join(run_checks(f)))
    else:
        print(render_video(__name__ if __name__ != "__main__" else "v04_never_stores", a.style, S, a.out, STEM,
                           None if a.no_music else a.music_seed, a.jobs, cover_t=0.0))


if __name__ == "__main__":
    sys.exit(main())

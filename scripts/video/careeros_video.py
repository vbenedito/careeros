"""CareerOS short-video engine: draws 1080x1920 frames with Pillow and encodes them with ffmpeg.

A video is a list of scenes plus a `frame(t)` function built from the parts here:
background, text blocks with word animations, a horizontal bar chart, the
"Sample data" chip and the end screen. Every readable element reports its box,
and each frame is checked against the safe box (docs/marketing/video-formats.md 1.4).
"""
from __future__ import annotations

import math
import os
import subprocess
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Callable, Optional

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, features

W, H, FPS = 1080, 1920, 30
SAFE = (80, 250, 900, 1400)  # x0, y0, x1, y1: everything readable stays inside

# Dark theme, from video-formats.md 2.2 (sRGB of the OKLCH tokens).
C = {
    "bg": (0x0E, 0x0F, 0x12),
    "fg": (0xF5, 0xF5, 0xF5),
    "muted": (0xA4, 0xA4, 0xA4),
    "card": (0x18, 0x1D, 0x27),
    "primary": (0x79, 0xA1, 0xFC),
    "primary_fg": (0x0F, 0x0F, 0x0F),
    "border": (0x2E, 0x33, 0x3D),
    "chart6": (0x72, 0x74, 0x7B),
}

RAQM = features.check("raqm")


# ---------------------------------------------------------------- math helpers
def clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def ease_out_cubic(p: float) -> float:
    p = clamp01(p)
    return 1 - (1 - p) ** 3


def ease_in_out(p: float) -> float:
    p = clamp01(p)
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def ease_out_back(p: float, s: float = 1.7) -> float:
    p = clamp01(p) - 1
    return 1 + p * p * ((s + 1) * p + s)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(c1, c2, t: float):
    return tuple(int(round(lerp(a, b, t))) for a, b in zip(c1, c2))


def pulse(t: float, start: float, dur: float) -> float:
    """0 -> 1 -> 0 over [start, start + dur], smooth."""
    p = (t - start) / dur
    return math.sin(math.pi * p) ** 2 if 0 <= p <= 1 else 0.0


def track(t: float, initial: float, keys: list[tuple[float, float, float]], ease=ease_in_out) -> float:
    """Value that eases to each key (start, duration, value) in turn."""
    v = initial
    for start, dur, target in keys:
        if t < start:
            break
        v = lerp(v, target, ease((t - start) / dur) if dur > 0 else 1.0)
    return v


def fmt_minutes(m: int) -> str:
    """App duration format: 45m, 1h 05m."""
    h, mm = divmod(int(m), 60)
    return f"{mm}m" if h == 0 else f"{h}h {mm:02d}m"


def luminance(c) -> float:
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# ---------------------------------------------------------------- repo assets
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONT_WOFF2 = os.path.join(REPO, "apps", "web", "public", "fonts", "mona-sans-latin-wght.woff2")
MARK_DARK = os.path.join(REPO, "docs", "marketing", "brand", "careeros-mark-dark.svg")
CACHE = os.path.join(os.path.dirname(__file__), ".cache")


def _font_path() -> str:
    """Mona Sans (SIL OFL 1.1) from the repo, converted once to TTF for Pillow."""
    if os.environ.get("CAREEROS_FONT"):
        return os.environ["CAREEROS_FONT"]
    out = os.path.join(CACHE, "mona-sans-wght.ttf")
    if not os.path.exists(out):
        from fontTools.ttLib import TTFont  # needs the brotli package for woff2

        os.makedirs(CACHE, exist_ok=True)
        f = TTFont(FONT_WOFF2)
        f.flavor = None
        f.save(out)
    return out


# ---------------------------------------------------------------- fonts
FONT_PATH = _font_path()


@lru_cache(maxsize=512)
def font(size: float, weight: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT_PATH, round(size * 4) / 4)
    f.set_variation_by_axes([weight])
    return f


def text_kwargs():
    return {"features": ["tnum"]} if RAQM else {}


# ---------------------------------------------------------------- frame context
@dataclass
class Frame:
    img: Image.Image
    t: float
    boxes: list = field(default_factory=list)  # (label, box) of readable elements

    def readable(self, label: str, box):
        self.boxes.append((label, tuple(box)))

    def check_safe(self):
        x0, y0, x1, y1 = SAFE
        bad = [(l, b) for l, b in self.boxes if b[0] < x0 - 0.5 or b[1] < y0 - 0.5 or b[2] > x1 + 0.5 or b[3] > y1 + 0.5]
        if bad:
            raise AssertionError(f"t={self.t:.2f}s outside safe box: {bad}")


# ---------------------------------------------------------------- backgrounds
def make_backgrounds(style: "Style") -> list[Image.Image]:
    """Precomputed background frames (one, or a few for animated grain)."""
    base = Image.new("RGB", (W, H), C["bg"])
    if style.bg_glow:
        # Soft radial wash of primary from the top right, very low alpha.
        small = Image.new("L", (W // 8, H // 8), 0)
        d = ImageDraw.Draw(small)
        cx, cy, r = 980 // 8, 180 // 8, 1100 // 8
        for i in range(r, 0, -1):
            v = int(255 * (1 - i / r) ** 2)
            d.ellipse((cx - i, cy - i, cx + i, cy + i), fill=v)
        mask = small.resize((W, H), Image.BICUBIC).point(lambda v: int(v * style.bg_glow))
        base = Image.composite(Image.new("RGB", (W, H), C["primary"]), base, mask)
    if style.vignette:
        # radial falloff: darker towards the edges
        w8, h8 = W // 8, H // 8
        small = Image.radial_gradient("L").resize((w8, h8)).point(lambda v: int(min(255, max(0, (v - 150) * 2.2)) * style.vignette))
        mask = small.resize((W, H), Image.BICUBIC)
        base = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), base, mask)
    if not style.grain:
        return [base]
    frames = []
    for k in range(3):
        noise = Image.effect_noise((W // 2, H // 2), 64).resize((W, H), Image.NEAREST)
        # map noise (centred at 128) to a +-grain offset
        g = style.grain
        lut = [max(0, min(255, 128 + int((v - 128) * g / 64))) for v in range(256)]
        n = noise.point(lut)
        rgb = Image.merge("RGB", (n, n, n))
        frames.append(ImageChops.add(base, rgb, scale=1.0, offset=-128))
    return frames


# ---------------------------------------------------------------- styles
@dataclass
class Style:
    name: str
    word_anim: str  # "slide" | "pop" | "wipe"
    bg_glow: float = 0.0  # 0..1 alpha of the radial wash
    vignette: float = 0.0
    grain: int = 0  # +- levels
    bar_glow: float = 0.55  # glow strength on highlighted bars
    band: float = 0.0  # spotlight band behind focused rows
    push: float = 1.06  # push-in scale on the focus screen
    regrow: bool = False  # focused bars snap and re-grow on focus changes
    stagger: float = 0.07
    word_dur: float = 0.38


# ---------------------------------------------------------------- text
@dataclass
class Token:
    text: str | Callable[[float], str]
    color: tuple = C["fg"]
    final: Optional[str] = None  # text used for layout when `text` changes over time

    def at(self, t: float) -> str:
        return self.text(t) if callable(self.text) else self.text

    def layout_text(self) -> str:
        return self.final if self.final is not None else (self.text if isinstance(self.text, str) else "")


@dataclass
class TextBlock:
    lines: list[list[Token]]
    size: float
    weight: int
    t_in: float
    t_out: float
    x: float = 80
    y_top: float = 344
    force_visible: bool = False  # hook: readable at frame 0, motion is only a settle
    out_dur: float = 0.22
    align: str = "left"


@lru_cache(maxsize=4096)
def word_image(text: str, size: float, weight: int, color: tuple) -> tuple[Image.Image, int, int, tuple]:
    """RGBA image of one word; returns (img, pad_x, baseline_y, ink bbox relative to the origin)."""
    f = font(size, weight)
    bbox = f.getbbox(text, anchor="ls", **text_kwargs())
    pad = int(size * 0.3)
    w = int(bbox[2] - min(0, bbox[0])) + 2 * pad
    asc, desc = f.getmetrics()
    h = asc + desc + 2 * pad
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((pad, pad + asc), text, font=f, fill=color + (255,), anchor="ls", **text_kwargs())
    return img, pad, pad + asc, bbox


def with_alpha(img: Image.Image, a: float) -> Image.Image:
    if a >= 0.999:
        return img
    out = img.copy()
    out.putalpha(img.getchannel("A").point(lambda v: int(v * a)))
    return out


def draw_text_block(fr: Frame, b: TextBlock, style: Style):
    t = fr.t
    if t < b.t_in - 1.0 or t > b.t_out:
        return
    f = font(b.size, b.weight)
    asc, desc = f.getmetrics()
    lh = b.size * 1.2
    space = f.getlength(" ")
    out_p = ease_in_out((t - (b.t_out - b.out_dur)) / b.out_dur)
    idx = 0
    for li, line in enumerate(b.lines):
        baseline = b.y_top + li * lh + (lh - (asc + desc)) / 2 + asc
        widths = [f.getlength(tok.layout_text() or tok.at(t), **text_kwargs()) for tok in line]
        line_w = sum(widths) + space * (len(line) - 1)
        x = b.x if b.align == "left" else b.x - line_w / 2  # centred blocks: b.x is the centre
        line_start = b.t_in + li * 0.15
        for k, (tok, wdt) in enumerate(zip(line, widths)):
            text = tok.at(t)
            offset_in_line = sum(widths[:k]) + space * k
            img, pad, base_y, bbox = word_image(text, b.size, b.weight, tok.color)
            # --- in animation
            if style.word_anim == "wipe":
                p = (t - line_start) / 0.5
            else:
                p = (t - b.t_in - idx * style.stagger) / style.word_dur
            alpha, dx, dy, scale, clip = 1.0, 0.0, 0.0, 1.0, 1.0
            if style.word_anim == "slide":
                e = ease_out_cubic(p)
                alpha, dy = e, (1 - e) * 34
            elif style.word_anim == "pop":
                alpha = clamp01(p * 3)
                scale = 0.55 + 0.45 * ease_out_back(p, 2.2)
            elif style.word_anim == "wipe":
                e = ease_out_cubic(p)
                # reveal line from the left: word visible part = fraction of the line already wiped
                wiped = e * (line_w + 60) - offset_in_line
                clip = clamp01(wiped / max(wdt, 1))
                dx = (1 - e) * -18
            if b.force_visible:
                alpha, clip = 1.0, 1.0
                if style.word_anim == "pop":
                    scale = 0.975 + 0.025 * ease_out_back(clamp01(p + 0.35), 2.2)
                    dy = (1 - ease_out_cubic(clamp01(p + 0.3))) * 12
                elif style.word_anim == "wipe":
                    dx = (1 - ease_out_cubic(clamp01(p + 0.2))) * -14
                else:
                    dy = (1 - ease_out_cubic(clamp01(p + 0.25))) * 18
            # --- out animation
            if out_p > 0:
                alpha *= 1 - out_p
                dy -= 26 * out_p
            if alpha <= 0.003 or clip <= 0.001:
                x += wdt + space
                idx += 1
                continue
            im = img
            if clip < 1:
                cw = int(pad + (bbox[2]) * clip)
                im = img.crop((0, 0, max(1, cw), img.height))
            if scale != 1.0:
                nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
                im = im.resize((nw, nh), Image.BICUBIC)
                ox = x - pad * scale + (wdt * (1 - scale)) / 2
                oy = baseline - base_y * scale - (b.size * 0.35) * (1 - scale)
            else:
                ox, oy = x - pad, baseline - base_y
            ox, oy = ox + dx, oy + dy
            fr.img.paste(im, (int(round(ox)), int(round(oy))), with_alpha(im, alpha))
            # readable box: final resting position (ink box)
            fr.readable(f"text:{text}", (x + bbox[0], baseline + bbox[1], x + wdt, baseline + bbox[3]))
            x += wdt + space
            idx += 1


# ---------------------------------------------------------------- chip
def draw_chip(fr: Frame, text: str, alpha: float, flash: float = 0.0, x: float = 80, y: float = 262):
    if alpha <= 0:
        return
    f = font(40, 700)
    tw = f.getlength(text)
    asc, desc = f.getmetrics()
    padx, pady = 22, 10
    w, h = tw + 2 * padx, asc + desc + 2 * pady - 6
    layer = Image.new("RGBA", (int(w) + 8, int(h) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    border = mix(C["border"], C["primary"], flash)
    d.rounded_rectangle((2, 2, 2 + w, 2 + h), radius=h / 2, fill=C["bg"] + (255,), outline=border + (255,), width=3)
    d.text((2 + padx, 2 + h / 2), text, font=f, fill=C["muted"] + (255,), anchor="lm")
    fr.img.paste(layer, (int(x) - 2, int(y) - 2), with_alpha(layer, alpha))
    fr.readable("chip", (x, y, x + w, y + h))


# ---------------------------------------------------------------- bar chart
@dataclass
class BarState:
    grow: float = 1.0  # 0..1 of the bar length
    dim: float = 0.0  # 0 = primary, 1 = chart-6
    outline: float = 0.0
    glow: float = 0.0
    bold: float = 0.0
    band: float = 0.0


@dataclass
class ChartState:
    bars: list[BarState]
    scale: float = 1.0
    bx: float = 0.0  # p' = scale * p + (bx, by)
    by: float = 0.0
    alpha: float = 1.0


class BarChart:
    """Horizontal bars, video-formats.md 2.4 (rows 128 px apart, bars 56 px, radius 12)."""

    SS = 2  # supersampling for clean edges
    REGION = (0, 330, 1080, 1420)  # area the chart may occupy (full-res coords)

    def __init__(self, labels, minutes, x_label=80, x_bar=230, longest=390, y_top=590, pitch=122, thick=56, value_gap=24):
        self.labels, self.minutes = labels, minutes
        self.x_label, self.x_bar, self.y_top, self.pitch, self.thick, self.gap = x_label, x_bar, y_top, pitch, thick, value_gap
        mx = max(minutes)
        self.lengths = [m / mx * longest for m in minutes]  # linear scale from zero

    def bottom(self) -> float:
        return self.y_top + (len(self.labels) - 1) * self.pitch + self.thick

    def draw(self, fr: Frame, st: ChartState, style: Style):
        if st.alpha <= 0:
            return
        rx0, ry0, rx1, ry1 = self.REGION
        S = self.SS
        layer = Image.new("RGBA", ((rx1 - rx0) * S, (ry1 - ry0) * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        q = 4  # glow mask at quarter resolution
        glow = Image.new("L", ((rx1 - rx0) // q, (ry1 - ry0) // q), 0)
        gd = ImageDraw.Draw(glow)
        band = Image.new("L", ((rx1 - rx0) // q, (ry1 - ry0) // q), 0)
        bd = ImageDraw.Draw(band)
        s = st.scale

        def P(x, y):  # chart coords -> layer coords (supersampled)
            return ((s * x + st.bx - rx0) * S, (s * y + st.by - ry0) * S)

        def full(x, y):
            return (s * x + st.bx, s * y + st.by)

        for i, (lab, m, L, b) in enumerate(zip(self.labels, self.minutes, self.lengths, st.bars)):
            y0 = self.y_top + i * self.pitch
            y1 = y0 + self.thick
            cy = (y0 + y1) / 2
            length = max(0.0, L * b.grow)
            col = mix(C["primary"], C["chart6"], b.dim)
            x0, x1 = self.x_bar, self.x_bar + max(length, 0.01)
            # spotlight band and glow masks
            if b.band > 0:
                a0 = full(60, y0 - 22)
                a1 = full(920, y1 + 22)
                bd.rounded_rectangle(((a0[0] - rx0) / q, (a0[1] - ry0) / q, (a1[0] - rx0) / q, (a1[1] - ry0) / q), radius=6, fill=int(255 * b.band))
            if b.glow > 0 and length > 2:
                a0, a1 = full(x0 - 6, y0 - 6), full(x1 + 6, y1 + 6)
                gd.rounded_rectangle(((a0[0] - rx0) / q, (a0[1] - ry0) / q, (a1[0] - rx0) / q, (a1[1] - ry0) / q), radius=4, fill=int(255 * b.glow))
            # outline ring 4 px outside the bar
            if b.outline > 0 and length > 2:
                o = 4
                p0, p1 = P(x0 - o, y0 - o), P(x1 + o, y1 + o)
                d.rounded_rectangle((p0[0], p0[1], p1[0], p1[1]), radius=(12 + o) * s * S, outline=C["fg"] + (int(255 * b.outline),), width=max(1, round(o * s * S)))
            if length > 1:
                p0, p1 = P(x0, y0), P(x1, y1)
                r = min(12 * s * S, (p1[0] - p0[0]) / 2)
                d.rounded_rectangle((p0[0], p0[1], p1[0], p1[1]), radius=r, fill=col + (255,))
            # day label (regular -> bold crossfade)
            # regular stays fully drawn; bold fades in on top (no mid-fade dip in contrast)
            for wgt, a in ((500, 1.0 if b.bold < 0.999 else 0.0), (700, b.bold)):
                if a > 0.01:
                    fnt = font(56 * s * S, wgt)
                    px, py = P(self.x_label, cy)
                    if a >= 0.999:
                        d.text((px, py), lab, font=fnt, fill=C["fg"] + (255,), anchor="lm")
                    else:  # blend (ImageDraw on RGBA replaces pixels instead of blending)
                        tb = fnt.getbbox(lab, anchor="lm")
                        tmp = Image.new("RGBA", (int(tb[2] - tb[0]) + 8, int(tb[3] - tb[1]) + 8), (0, 0, 0, 0))
                        ImageDraw.Draw(tmp).text((4 - tb[0], 4 - tb[1]), lab, font=fnt, fill=C["fg"] + (int(255 * a),), anchor="lm")
                        layer.alpha_composite(tmp, (int(px + tb[0] - 4), int(py + tb[1] - 4)))
            f56 = font(56, 700 if b.bold > 0.5 else 500)
            lb = f56.getbbox(lab, anchor="lm")
            a0 = full(self.x_label + lb[0], cy + lb[1])
            a1 = full(self.x_label + lb[2], cy + lb[3])
            fr.readable(f"label:{lab}", (a0[0], a0[1], a1[0], a1[1]))
            # value text at the bar end, fades in as the bar arrives
            va = clamp01((b.grow - 0.55) / 0.35)
            if va > 0:
                vt = fmt_minutes(m)
                fnt = font(56 * s * S, 500)
                px, py = P(x1 + self.gap, cy)
                d.text((px, py), vt, font=fnt, fill=C["fg"] + (int(255 * va),), anchor="lm", **text_kwargs())
                vb = font(56, 500).getbbox(vt, anchor="lm", **text_kwargs())
                a0 = full(x0 + L + self.gap + vb[0], cy + vb[1])  # final resting place
                a1 = full(x0 + L + self.gap + vb[2], cy + vb[3])
                fr.readable(f"value:{vt}", (a0[0], a0[1], a1[0], a1[1]))
            # bar itself is a graphic that must be seen
            a0, a1 = full(x0, y0), full(x0 + L, y1)
            fr.readable(f"bar:{lab}", (a0[0], a0[1], a1[0], a1[1]))

        layer = layer.resize((rx1 - rx0, ry1 - ry0), Image.LANCZOS)
        base = fr.img
        region = base.crop(self.REGION).convert("RGBA")
        if style.band > 0 and band.getbbox():
            m = band.filter(ImageFilter.GaussianBlur(7)).resize((rx1 - rx0, ry1 - ry0), Image.BILINEAR)
            m = m.point(lambda v: int(v * style.band * st.alpha))
            region = Image.composite(Image.new("RGBA", region.size, C["primary"] + (255,)), region, m)
        if style.bar_glow > 0 and glow.getbbox():
            m = glow.filter(ImageFilter.GaussianBlur(5)).resize((rx1 - rx0, ry1 - ry0), Image.BILINEAR)
            m = m.point(lambda v: int(v * style.bar_glow * st.alpha))
            region = Image.composite(Image.new("RGBA", region.size, C["primary"] + (255,)), region, m)
        region.alpha_composite(with_alpha(layer, st.alpha))
        base.paste(region.convert("RGB"), self.REGION[:2])


# ---------------------------------------------------------------- logo
@lru_cache(maxsize=4)
def logo_image(svg_path: str, px: int) -> Image.Image:
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f"mark-{px}.png")
    subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), svg_path, "-o", out], check=True)
    return Image.open(out).convert("RGBA")


def draw_logo(fr: Frame, svg_path: str, cx: float, cy: float, size: float, alpha: float, scale: float = 1.0):
    """Uniform scale only: the mark is never stretched, recoloured or shadowed."""
    if alpha <= 0:
        return
    src = logo_image(svg_path, 512)
    px = max(1, int(round(size * scale)))
    im = src.resize((px, px), Image.LANCZOS)
    fr.img.paste(im, (int(round(cx - px / 2)), int(round(cy - px / 2))), with_alpha(im, alpha))
    fr.readable("logo", (cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2))


# ---------------------------------------------------------------- encoding
def encode_scene(frame_fn: Callable[[float], Image.Image], t0: float, t1: float, out_path: str):
    """Render frames [t0, t1) straight into one H.264 file (temp name, renamed on success)."""
    n0, n1 = round(t0 * FPS), round(t1 * FPS)
    tmp = out_path[:-4] + ".part.mp4"
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", "10M", "-maxrate", "12M", "-bufsize", "20M",
        "-g", "30", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-r", str(FPS), tmp,
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(n0, n1):
        p.stdin.write(frame_fn(n / FPS).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg failed for {out_path}")
    os.replace(tmp, out_path)


def join_scenes(parts: list[str], out_path: str, title: str):
    """Concat with -c copy, then add a silent stereo AAC track (music is added in each app)."""
    lst = out_path + ".txt"
    with open(lst, "w") as fh:
        fh.writelines(f"file '{os.path.abspath(p)}'\n" for p in parts)
    joined = out_path[:-4] + ".joined.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined], check=True)
    tmp = out_path[:-4] + ".part.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", joined,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
        "-map_metadata", "-1", "-metadata", f"title={title}", "-movflags", "+faststart", tmp,
    ], check=True)
    os.replace(tmp, out_path)
    os.remove(joined)
    os.remove(lst)

"""Bold style kit (style B, product owner 2026-11-28): parts for videos whose first frame is the cover.

Adds to the engine (careeros_video.py), which it reuses for fonts, colours, frames and encoding:

- `background(t)`: deep blue gradient from the tokens with a soft `primary` glow, panned slowly so
  the frame is never still. `bg_brightest()` gives the brightest pixel the safe box can show over
  the whole pan, for the contrast check.
- `draw_hook(...)`: big bold lines (108 px or more) with one phrase in a solid `primary` block and
  a light sweep across that block in the first second. Visible and complete at frame 0.
- `TileGrid`: rounded tiles (a day, a site, a fact) that can be lit (`primary` fill, glow) and
  can lift or bounce. Lit tiles carry dark text on the accent, so meaning never rests on colour
  alone: the label and value are always written.
- `check_thumbnail(...)`: the hook must stay readable at 200 px wide (cap height >= 15 px there).
- `contrast_pairs()`: every text/graphic colour pair this style uses, for the script's `check`.
- `save_cover` (from the engine): `render_video(..., cover_t=0.0)` writes `<stem>.cover.jpg`.

Rule for this style: frame 0 is the cover (YouTube may use it; Instagram gets the same image as
`cover_url`), so frame 0 must already show the full hook and the visual subject. Motion in the first
second starts from that final state (glow pulse, tile bounce, block sweep, background pan).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from careeros_video import C, SAFE, W, H, Frame, clamp01, contrast, ease_out_cubic, font, mix, pulse

DEEP = mix(C["bg"], C["primary"], 0.16)  # deep blue made from the background and primary tokens
SHINE = mix(C["primary"], C["fg"], 0.35)  # light sweep across the highlight block
HOOK_MIN_PX = 108  # smallest hook size; check_thumbnail measures the real cap height
PAN = 140  # px of vertical background drift over PAN_PERIOD seconds
PAN_PERIOD = 12.0


# ---------------------------------------------------------------- background
@lru_cache(maxsize=4)
def _tall_background(glow_x: int = 560, glow_y: int = 1060, glow_r: int = 600, glow_a: float = 0.30) -> Image.Image:
    """Gradient bg -> DEEP (top to bottom) plus a radial primary glow, PAN px taller than the frame."""
    h = H + PAN
    small_h = h // 4
    col = Image.new("RGB", (1, small_h))
    for y in range(small_h):
        col.putpixel((0, y), mix(C["bg"], DEEP, y / (small_h - 1)))
    im = col.resize((W, h), Image.BICUBIC)
    m = Image.new("L", (W // 4, h // 4), 0)
    r = glow_r // 4
    ImageDraw.Draw(m).ellipse((glow_x // 4 - r, glow_y // 4 - r, glow_x // 4 + r, glow_y // 4 + r), fill=int(255 * glow_a))
    m = m.filter(ImageFilter.GaussianBlur(r * 0.45)).resize((W, h), Image.BICUBIC)
    return Image.composite(Image.new("RGB", (W, h), C["primary"]), im, m)


def pan_offset(t: float) -> int:
    return int(round(PAN / 2 * (1 - math.cos(2 * math.pi * t / PAN_PERIOD))))


def background(t: float) -> Image.Image:
    return _tall_background().crop((0, pan_offset(t), W, pan_offset(t) + H))


@lru_cache(maxsize=1)
def bg_brightest() -> tuple:
    """Brightest background pixel the safe box can show at any pan offset."""
    x0, y0, x1, y1 = SAFE
    region = _tall_background().crop((x0, y0, x1, y1 + PAN))
    return max(region.get_flattened_data() if hasattr(region, "get_flattened_data") else region.getdata(), key=lambda p: sum(p))


# ---------------------------------------------------------------- hook text with a highlight block
def _block_box(x: float, y_top: float, w: float, size: float):
    pad = size * 0.14
    return (x - pad, y_top + size * 0.02, x + w + pad, y_top + size * 1.24)


def draw_hook(fr: Frame, lines: list[list[tuple[str, bool]]], size: float, y_top: float, t_in: float = 0.0,
              t_out: float = 1e9, x: float = 80, weight: int = 800, line_h: float = 1.2, out_dur: float = 0.25,
              in_dur: float = 0.0) -> float:
    """Lines of (text, highlighted) segments. With in_dur = 0 (the hook) the text is complete at t_in,
    so frame 0 is the cover; later screens use in_dur > 0 to rise in. The block gets a sweep at
    t_in + 0.15 s. Returns the y below the last line."""
    t = fr.t
    if t < t_in or t > t_out:
        return y_top + len(lines) * size * line_h
    a = 1.0 - clamp01((t - (t_out - out_dur)) / out_dur)
    dy = -24 * (1 - a)
    if in_dur > 0:
        e = ease_out_cubic((t - t_in) / in_dur)
        a *= e
        dy += 30 * (1 - e)
    f = font(size, weight)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for li, segs in enumerate(lines):
        yy = y_top + li * size * line_h + dy
        cx = x
        for k, (text, hl) in enumerate(segs):
            if k > 0:
                cx += f.getlength(" ") + (size * 0.14 if hl or segs[k - 1][1] else 0)
            elif hl:
                cx += size * 0.14  # keep the block's padding inside the safe box
            w = f.getlength(text)
            if hl:
                box = _block_box(cx, yy, w, size)
                d.rounded_rectangle(box, radius=size * 0.16, fill=C["primary"] + (255,))
                sweep = clamp01((t - t_in - 0.15) / 0.55)
                if 0 < sweep < 1:  # a light band crosses the block once
                    bx = box[0] + (box[2] - box[0] + 160) * ease_out_cubic(sweep) - 80
                    band = Image.new("L", (W, H), 0)
                    ImageDraw.Draw(band).polygon([(bx - 40, box[1]), (bx + 30, box[1]), (bx - 10, box[3]), (bx - 80, box[3])], fill=200)
                    clip = Image.new("L", (W, H), 0)
                    ImageDraw.Draw(clip).rounded_rectangle(box, radius=size * 0.16, fill=255)
                    band = ImageChops.multiply(band.filter(ImageFilter.GaussianBlur(10)), clip)
                    layer.paste(Image.new("RGBA", (W, H), SHINE + (255,)), (0, 0), band)
                d.text((cx, yy), text, font=f, fill=C["primary_fg"] + (255,), anchor="la")
                fr.readable(f"hook-block:{text}", box)
            else:
                d.text((cx, yy), text, font=f, fill=C["fg"] + (255,), anchor="la")
            ib = f.getbbox(text, anchor="la")
            fr.readable(f"hook:{text}", (cx + ib[0], yy - dy + ib[1], cx + ib[2], yy - dy + ib[3]))
            cx += w
    if a < 1:
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * a)))
    fr.img.paste(layer, (0, 0), layer)
    return y_top + len(lines) * size * line_h


def line_width(segs: list[tuple[str, bool]], size: float, weight: int = 800) -> float:
    """Width of one hook line, block padding included (same spacing as draw_hook)."""
    f = font(size, weight)
    w = 0.0
    for k, (text, hl) in enumerate(segs):
        if k > 0:
            w += f.getlength(" ") + (size * 0.14 if hl or segs[k - 1][1] else 0)
        elif hl:
            w += size * 0.14
        w += f.getlength(text) + (size * 0.14 if hl else 0)
    return w


def fit_size(lines: list[list[tuple[str, bool]]], max_px: float, min_px: float = 64, weight: int = 800,
             width: float = SAFE[2] - SAFE[0]) -> float:
    """Largest size from max_px down (2 px steps) where every line fits the safe box; never below min_px."""
    s = max_px
    while s > min_px and any(line_width(l, s, weight) > width for l in lines):
        s = max(min_px, s - 2)
    if any(line_width(l, s, weight) > width for l in lines):
        raise AssertionError(f"lines do not fit at {min_px}px: shorten the words or split the screen")
    return s


def check_hook(lines: list[list[tuple[str, bool]]], size: float):
    """video-formats.md 2.6: 108 px or more, at most 3 lines, at most 13 characters a line."""
    if size < HOOK_MIN_PX:
        raise AssertionError(f"hook {size}px is under {HOOK_MIN_PX}px")
    if len(lines) > 3:
        raise AssertionError(f"hook has {len(lines)} lines, 3 at most")
    for segs in lines:
        n = len(" ".join(text for text, _ in segs))
        if n > 13:
            raise AssertionError(f"hook line of {n} characters, 13 at most")


def check_thumbnail(size: float, weight: int = 800, width: int = 200, min_cap_px: float = 15.0) -> float:
    """Cap height of the hook when the 1080-wide frame is shown `width` px wide. Raises when too small."""
    b = font(size, weight).getbbox("H", anchor="ls")
    cap = (b[3] - b[1]) * width / W
    if cap < min_cap_px:
        raise AssertionError(f"hook {size}px: cap height {cap:.1f}px at {width}px wide, needs {min_cap_px}px")
    return cap


# ---------------------------------------------------------------- tiles
@dataclass
class TileState:
    lit: float = 0.0  # 0 = card, 1 = primary
    lift: float = 0.0  # px up
    scale: float = 1.0
    glow: float = 0.0  # extra glow on top of lit
    alpha: float = 1.0
    value_alpha: float = 1.0  # 0 hides the value (e.g. on the cover, before the answer)


@dataclass
class TileGrid:
    labels: list[str]
    values: list[str]
    x0: float = 80
    y0: float = 820
    cols: int = 4
    tw: float = 186
    th: float = 196
    gap: float = 20
    radius: float = 26
    label_px: float = 44
    value_px: float = 40
    layout: str = "stack"  # "stack": label above value; "row": label left, value right
    SS: int = 2

    def pos(self, i: int):
        return self.x0 + (i % self.cols) * (self.tw + self.gap), self.y0 + (i // self.cols) * (self.th + self.gap)

    def bottom(self) -> float:
        rows = math.ceil(len(self.labels) / self.cols)
        return self.y0 + rows * self.th + (rows - 1) * self.gap

    def draw(self, fr: Frame, states: list[TileState]):
        # region with room for glow and bounce
        pad = 110  # > 3x the glow blur, so the glow fades out before the region edge
        rx0, ry0 = max(0, int(self.x0 - pad)) // 4 * 4, max(0, int(self.y0 - pad)) // 4 * 4
        rx1 = min(W, int(self.x0 + self.cols * (self.tw + self.gap) + pad)) // 4 * 4
        ry1 = min(H, int(self.bottom() + pad)) // 4 * 4
        S = self.SS
        base = fr.img.crop((rx0, ry0, rx1, ry1)).convert("RGBA")
        glow = Image.new("L", ((rx1 - rx0) // 4, (ry1 - ry0) // 4), 0)
        gd = ImageDraw.Draw(glow)
        layer = Image.new("RGBA", ((rx1 - rx0) * S, (ry1 - ry0) * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for i, (lab, val, st) in enumerate(zip(self.labels, self.values, states)):
            if st.alpha <= 0:
                continue
            x, y = self.pos(i)
            cx, cy = x + self.tw / 2, y + self.th / 2 - st.lift
            w2, h2 = self.tw / 2 * st.scale, self.th / 2 * st.scale
            bx0, by0, bx1, by1 = cx - w2, cy - h2, cx + w2, cy + h2
            g = clamp01(st.lit * 0.95 + st.glow)
            if g > 0:
                gd.rounded_rectangle(((bx0 - rx0 - 6) / 4, (by0 - ry0 - 6) / 4, (bx1 - rx0 + 6) / 4, (by1 - ry0 + 6) / 4), radius=6, fill=int(255 * g * st.alpha))
            fill = mix(C["card"], C["primary"], st.lit)
            def L(px, py):
                return ((px - rx0) * S, (py - ry0) * S)
            p0, p1 = L(bx0, by0), L(bx1, by1)
            d.rounded_rectangle((p0[0], p0[1], p1[0], p1[1]), radius=self.radius * st.scale * S,
                                fill=fill + (int(255 * st.alpha),),
                                outline=(C["border"] + (int(255 * st.alpha * (1 - st.lit)),)) if st.lit < 1 else None, width=3 * S)
            lit_text = st.lit >= 0.5
            lcol = C["primary_fg"] if lit_text else C["muted"]
            vcol = C["primary_fg"] if lit_text else C["fg"]
            pad = 22 * st.scale
            if self.layout != "row":
                d.text(L(bx0 + pad, by0 + pad), lab, font=font(self.label_px * st.scale * S, 700), fill=lcol + (int(255 * st.alpha),), anchor="la")
            va = int(255 * st.alpha * clamp01(st.value_alpha))
            if self.layout == "row":
                d.text(L(bx0 + pad, (by0 + by1) / 2), lab, font=font(self.label_px * st.scale * S, 700), fill=(C["primary_fg"] if lit_text else C["fg"]) + (int(255 * st.alpha),), anchor="lm")
                if va:
                    d.text(L(bx1 - pad, (by0 + by1) / 2), val, font=font(self.value_px * st.scale * S, 800 if lit_text else 600),
                           fill=vcol + (va,), anchor="rm")
            elif va:
                d.text(L(bx0 + pad, by1 - pad), val, font=font(self.value_px * st.scale * S, 800 if lit_text else 600),
                       fill=vcol + (va,), anchor="ld")
            fr.readable(f"tile:{lab}", (min(x, bx0), min(y, by0), max(x + self.tw, bx1), max(y + self.th, by1)))
        layer = layer.resize((rx1 - rx0, ry1 - ry0), Image.LANCZOS)
        if glow.getbbox():
            m = glow.filter(ImageFilter.GaussianBlur(8)).resize((rx1 - rx0, ry1 - ry0), Image.BILINEAR)
            base = Image.composite(Image.new("RGBA", base.size, C["primary"] + (255,)), base, m)
        base.alpha_composite(layer)
        fr.img.paste(base.convert("RGB"), (rx0, ry0))


def ripple(t: float, start: float, i: int, height: float = 16.0, dur: float = 0.45, step: float = 0.06) -> float:
    """Lift of tile i in a left-to-right wave that starts and ends at rest."""
    return height * pulse(t, start + i * step, dur)



# ---------------------------------------------------------------- chip on the gradient
def draw_label_chip(fr: Frame, text: str, x: float = 80, y: float = 262, alpha: float = 1.0):
    """`Sample data` / tag chip: opaque `bg` fill, so muted text keeps its 7.69:1 on any gradient."""
    if alpha <= 0:
        return
    f = font(40, 700)
    tw = f.getlength(text)
    h = 66
    layer = Image.new("RGBA", (int(tw + 52), h + 6), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((2, 2, tw + 46, h), radius=h / 2, fill=C["bg"] + (255,), outline=C["border"] + (255,), width=3)
    d.text((24, 2 + (h - 2) / 2), text, font=f, fill=C["muted"] + (255,), anchor="lm")
    if alpha < 1:
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    fr.img.paste(layer, (int(x) - 2, int(y) - 2), layer)
    fr.readable("chip", (x, y, x + tw + 44, y + h - 2))


# ---------------------------------------------------------------- checks and cover
def contrast_pairs() -> dict[str, tuple[float, float]]:
    """name -> (measured ratio, needed ratio) for every pair this style uses."""
    hi = bg_brightest()
    return {
        "fg on brightest gradient": (contrast(C["fg"], hi), 4.5),
        "primary_fg on primary (block, lit tile)": (contrast(C["primary_fg"], C["primary"]), 4.5),
        "primary_fg on block sweep": (contrast(C["primary_fg"], SHINE), 4.5),
        "muted on card (stacked tile label)": (contrast(C["muted"], C["card"]), 4.5),
        "fg on card (tile value, row tile label)": (contrast(C["fg"], C["card"]), 4.5),
        "muted on bg (chip)": (contrast(C["muted"], C["bg"]), 4.5),
        "primary tile vs card tile (graphic)": (contrast(C["primary"], C["card"]), 3.0),
    }

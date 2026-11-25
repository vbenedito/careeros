# Video render scripts

Short vertical videos for YouTube Shorts, TikTok and Instagram Reels, drawn with code (#275). Pillow draws each frame. ffmpeg encodes one H.264 file per scene and joins them without re-encoding.

The rules the videos follow are in [video formats](../../docs/marketing/video-formats.md) and the [launch kit](../../docs/marketing/launch-kit.md). This folder only implements them.

## Files

| File | What it is |
|---|---|
| `careeros_video.py` | Engine: colors from the dark tokens, Mona Sans, word animations (`slide`, `pop`, `wipe`), the bar chart, the `Sample data` chip, the logo, encoding and the checks |
| `v01_which_two_days.py` | Video 1, `2026-11-24-which-two-days` (launch kit section 3). Published in style `pop` |

For a new video, copy `v01_which_two_days.py`, change the screens (`S`), the text blocks and the chart or end screen, and keep the engine.

## Setup (once)

- Python 3.11 or later, ffmpeg, `rsvg-convert` (librsvg, for the logo SVG).
- `pip install Pillow fontTools brotli` (Pillow 10.1 or later with libraqm for tabular numbers; `brotli` lets fontTools read the woff2 font).

The script reads the font (`apps/web/public/fonts`, SIL OFL 1.1) and the dark mark (`docs/marketing/brand`) from the repo. It converts the font to TTF once, into `.cache/` (git-ignored).

## Use

```sh
cd scripts/video
python3 v01_which_two_days.py check                 # contrast + safe box, every frame
python3 v01_which_two_days.py stills --out out/     # stills at 1.2 s, 12.6 s, 29 s (--times to change)
python3 v01_which_two_days.py render --out out/     # out/2026-11-24-which-two-days.mp4
```

`--style glide|pop|spotlight` picks one of the three styles shown to the product owner on 2026-11-24.

## Checks built in

- **Safe box.** Every readable element (text, chip, labels, values, bars, logo) records where it ends up. A frame stops the run when an element is outside x 80–900, y 250–1400 ([video formats](../../docs/marketing/video-formats.md) section 1.4).
- **Contrast.** `check` measures the text and bar colors against the brightest background pixel in the safe box, grain and glow included: text at least 4.5:1, bars at least 3:1.
- **Sample data.** The script asserts that the sample week adds up (400 minutes; Thu + Sat = 245).

## Output

1080 x 1920, 30 fps, H.264 at 10 Mbit/s, BT.709, plus a silent stereo AAC track. The music is picked in each app's commercial sound library, so the file has none. A stopped render never leaves a playable short file: each part is written as `*.part.mp4` and renamed only when ffmpeg exits 0.

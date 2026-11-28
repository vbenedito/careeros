# Video render scripts

Short vertical videos for YouTube Shorts, TikTok and Instagram Reels, drawn with code (#275). Pillow draws each frame. ffmpeg encodes one H.264 file per scene and joins them without re-encoding.

The rules the videos follow are in [video formats](../../docs/marketing/video-formats.md) and the [launch kit](../../docs/marketing/launch-kit.md). This folder only implements them.

## Files

| File | What it is |
|---|---|
| `careeros_video.py` | Engine: colors from the dark tokens, Mona Sans, word animations (`slide`, `pop`, `wipe`), the bar chart, the `Sample data` chip, the logo, encoding and the checks |
| `careeros_bold.py` | Style B kit (#291): gradient background with a slow pan, big hook with a `primary` block, tiles, the label chip, the contrast pairs and the thumbnail check. Frame 0 is the cover |
| `careeros_music.py` | Original lo-fi music bed (80 BPM, Fmaj7–Em7–Dm7–Cmaj7), synthesized in code: no samples, no license, no cost (#277, product-owner decision 2026-11-25) |
| `v01_which_two_days.py` | Video 1, `2026-11-24-which-two-days` (launch kit section 3). Chosen style: `pop` |
| `v03_which_site.py` | Video 3, `2026-11-29-which-site-most` (pillar 1, idea 7), style B. Writes `<stem>.cover.jpg` next to the MP4 |
| `v04_never_stores.py` | Video 4, `2026-12-01-never-stores` (pillar 3, idea 2), style B. Four tiles, facts from brand profile section 6 only |
| `v02_restart_after_gap.py` | Video 2, `2026-11-26-restart-after-gap` (launch kit section 4), style `pop`. Text-only steps video with a 4-step track; end screen mark + name (pillar 2) |

For a new video, copy the closest script (`v01` for a chart, `v02` for steps), change the screens (`S`), the text blocks and the visual, and keep the engine. `render_video()` in the engine renders the scenes in parallel, joins them and adds the music.

## Setup (once)

- Python 3.11 or later, ffmpeg, `rsvg-convert` (librsvg, for the logo SVG).
- `pip install Pillow fontTools brotli numpy scipy` (Pillow 10.1 or later with libraqm for tabular numbers; `brotli` lets fontTools read the woff2 font).

The script reads the font (`apps/web/public/fonts`, SIL OFL 1.1) and the dark mark (`docs/marketing/brand`) from the repo. It converts the font to TTF once, into `.cache/` (git-ignored).

## Use

```sh
cd scripts/video
python3 v01_which_two_days.py check                 # contrast + safe box, every frame
python3 v01_which_two_days.py stills --out out/     # stills at 1.2 s, 12.6 s, 29 s (--times to change)
python3 v01_which_two_days.py render --out out/     # out/2026-11-24-which-two-days.mp4, with music
python3 v01_which_two_days.py render --no-music     # silent audio track instead
python3 careeros_music.py --seconds 30 --seed 3 --out bed.wav   # music bed alone
```

`--style glide|pop|spotlight` picks one of the three styles shown to the product owner on 2026-11-24.

## Checks built in

- **Safe box.** Every readable element (text, chip, labels, values, bars, logo) records its resting position. A frame stops the run when one is outside x 80–900, y 250–1400 ([video formats](../../docs/marketing/video-formats.md) section 1.4). In-animations (a word popping in) can overshoot by a few pixels for about 0.1 s; that is not checked.
- **Contrast.** `check` measures the text and bar colors against the brightest background pixel in the safe box (gradient and grain included; the spotlight band too when the style has one): text at least 4.5:1, bars at least 3:1.
- **Hook and thumbnail (style B).** The hook is 110 px or more, at most 3 lines of 13 characters (`check_hook`), and its cap height is at least 15 px when the frame is shown 200 px wide (`check_thumbnail`).
- **Sample data.** The script asserts that the sample week adds up (400 minutes; Thu + Sat = 245).

## Output


1080 x 1920, 30 fps, H.264 at 10 Mbit/s, BT.709. Audio: the code-made music bed, normalised to -18 LUFS (peaks under -1.5 dBTP), stereo AAC 48 kHz; `--no-music` gives a silent track instead. A different `--music-seed` gives a different arrangement detail (same chords and tempo). The bed is original, so there is no license record, no Content ID match and no AI label. A failed or stopped render never leaves a finished-looking file: each part is written as `*.part.mp4`, renamed only when ffmpeg exits 0, and deleted when a frame fails.

Style B scripts also write `<stem>.cover.jpg` (1080 x 1920, frame 0) before the MP4, for Instagram's `cover_url`; a failed render removes it again. The render job (PST-34) keeps only the MP4 today; keeping and sending the cover is a pipeline change.

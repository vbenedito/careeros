# CareerOS video formats and example scripts

Type: living · Owner: product owner · Last reviewed: 2026-11-17

This is the sixth marketing document (issue #190, step 6 of the marketing process in [v1 discovery](../../specs/v1/00-discovery.md) D18). It turns the [content pillars](content-pillars.md) into five repeatable video formats, a visual kit, a music source, a free production workflow and three scripts that are ready to produce. It reads the [brand profile](brand-profile.md) (sections 6 and 10), the [persona](persona.md), the [voice](voice.md) (sections 5 and 7) and the [platform study](platform-study.md) (sections 6 and 9). They win if this page disagrees with them.

Inputs that are already decided: faceless account (D8); text on screen plus music, no voice (D13); free tools only, fewer posts at good quality (D14); start on YouTube Shorts and TikTok with one vertical file of 20 to 45 seconds, LinkedIn as a test slot from week 3; about 2 hours a week.

How to read it: a fact that comes from a page we read has a source tag like [V3]. The list is at the end. A fact with no tag is a choice we made or an **assumption**, and it says so. Next document: goals and calendar (#191).

## 1. Format templates

### 1.1 Rules for every format

**Timing rule (voice, section 5).** A screen stays on for `words / 2 + 1` seconds, rounded up to the next half second. Never less than 2.5 s.

| Words on screen | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 11 | 13 |
|---|---|---|---|---|---|---|---|---|---|
| Seconds | 2.5 | 3 | 3.5 | 4 | 4.5 | 5 | 6 | 6.5 | 7.5 |

A tag chip such as `Step 1`, `Myth` or `Fact` is not counted. Tags are part of the screen and never carry meaning by color alone.

**Text per screen.** One idea per screen. At most 2 lines. 3 to 7 words per line. Line length is limited by the safe box (section 1.4): about 17 characters per line at 88 px, 22 at 72 px and 24 at 64 px. Never one word alone on a line. Sentence case. Durations in the app format (`45m`, `1h 05m`). No emoji, no exclamation marks.

**Length.** 20 to 45 seconds in total (platform study, section 9). Between 5 and 9 screens. A reveal inside a screen (line 2 appears 3 seconds after line 1) is allowed when a screen is longer than 5 seconds, so something changes about every 2 to 4 seconds.

**One pillar per video** (content pillars, section 7). Pillars 1 to 3 may end with the name; pillar 4 videos are demos (section 1.7).

**Sound off first.** Every video must be complete with the sound off. The music is a bed, not the message (voice, section 5).

### 1.2 The hook screen (first 1 to 2 seconds)

The hook is screen 1. It is the strongest line the video can honestly pay off.

- It is on screen at frame 0. No black frame, no logo opening, no "hey", no title card.
- Something moves in the first 0.3 s: bars grow, or the first line fades in. A still frame is easy to scroll past.
- Layers: the visual (bars, a big number or a plain background), the text, and the music starting on the first beat. Sound is the weakest layer, so the text must work alone.
- 3 to 6 words, 7 at most. Use 88 px, bold (76 px if a line is longer than 17 characters; hook lines are at most 19 characters at 76 px, about 800 px wide).
- Content: a real question the reader asks ("Can a study tracker read my pages?"), a plain fact, or a plain claim that the video proves. Pillar 3 opens with the reader's doubt, not with the list (content pillars, section 4).
- It must be true to the video. The payoff comes inside the video, and never later than the second half. No clickbait, no "wait for it", no result promise, no hour target.
- Write 3 hooks that use different ideas (a question, a fact, a plain claim). Keep the one that is most specific and most honest. Do this for every video; it takes about 3 minutes.
- Do not start with "Did you know", "Stop", "Never", "Secret" or a number that is not in the video.

### 1.3 The end screen

Last 3 to 4 seconds. Same background as screen 1, so the video loops cleanly into the hook when it replays (assumption: a smooth loop helps replays; check in the analytics).

| Platform | End screen text | Notes |
|---|---|---|
| YouTube Shorts, TikTok | Line 1: `Free Chrome extension.` Line 2: `CareerOS` (logo placeholder). Small line: `Link in profile` | The link lives in the channel and bio profile with `utm_*` (platform study, section 7). There is no clickable link in a Shorts description [V9]. |
| LinkedIn | Same two lines. No "Link in profile". | The link goes in the post only in the link test weeks (platform study, section 8). |
| Pillar 2 videos (all platforms) | `CareerOS` only | Pillar 2 posts mention no feature (content pillars, section 3). |

- **Logo placeholder:** CareerOS has no logo yet (#195). Until then the end screen shows the word `CareerOS` in 88 px bold, `primary` color, on the background. Do not draw a temporary logo. When #195 ships, put the logo above the word and update this page.
- Wording follows the voice: "Free Chrome extension" and the name. No "Download now", no "Try it today", no "stays free".
- Never more than one call to action per video.
- The end screen is exempt from the 3-word line rule: the name stands alone on its line.

### 1.4 Safe zones (TikTok and Shorts overlays)

The apps draw buttons, the caption and the account name over the video. We did not find an official page with exact numbers that we could read, so these margins are **our conservative choice (assumption)**. Test every new template by uploading a private draft on both apps and looking at the overlay once (section 4.5).

Canvas: 1080 x 1920 px (9:16).

| Edge | Keep clear | Why |
|---|---|---|
| Top | 250 px | Search, tabs and account name |
| Bottom | 520 px | Caption, hashtags, music name, progress bar |
| Right | 180 px | Like, comment, share buttons |
| Left | 80 px | Phone corners and screen edge |

**Safe box:** x from 80 to 900, y from 250 to 1400. That is 820 x 1150 px. Everything that must be read (text, bars, values, the "Sample data" label) sits inside it. Only the background may go beyond it.

Layout inside the safe box:

- Main text block: centered vertically around y = 760 for one or two lines, left aligned at x = 80 (left aligned is easier to read than centered for 2 lines).
- Tag chip and "Sample data" label: top-left of the box, at y = 262.
- Charts: from y = 400 to y = 1300.
- End screen block: centered in the box.

### 1.5 Font size and contrast

| Element | Size (px at 1080 wide) | Weight | Color |
|---|---|---|---|
| Hook text (screen 1) | 88 (76 for a line of 18 or 19 characters) | Bold (700) | `foreground` |
| Body text | 72 | Medium (500) | `foreground` |
| Body text, a line longer than 22 characters | 64, never smaller | Medium (500) | `foreground` |
| Chart labels and values | 56 | Medium (500), tabular numbers | `foreground` |
| Tag chip, "Sample data" | 40 | Bold (700) | `muted-foreground` on `background`, or `primary-foreground` on `primary` |

- Minimum size for anything that must be read: 40 px (about 14 pt on a 390 pt wide phone). Body text is 64 px or more. If a line does not fit, shorten the words or split the screen; do not make the text smaller.
- Line height 1.2. Letter spacing normal. Two lines at most.
- **Contrast:** every text color pair is at least 4.5:1 (WCAG AA for normal text) [V10]. Graphical objects (bars, outlines) are at least 3:1 against the background. The pairs in section 2.2 are computed.
- Status or meaning is never shown by color alone: a highlighted bar also gets a label, an outline or a tag.
- No text on a photo or a gradient. Solid background only.

### 1.6 Captions, alt text and screen readers

- The text on screen is the caption (voice, section 5). There is no speech, so there is no auto-caption step.
- Every video has a text version: the screen texts in order, one per line. Paste it at the end of the caption (YouTube: description; TikTok: caption; LinkedIn: add as "Text version" or in the alt text field if the upload screen has one). It is the same message in plain words (voice, section 5).
- Alt text for a chart: one sentence that says what the chart shows, then the values with units, then "Sample data". Example in section 5.
- Save the text version as `<file name>.txt` next to the video (section 4.3).

### 1.7 Format by format

Seconds are the plan. The timing rule can stretch a screen, but keep the total at 20 to 45 s.

#### Format A: list (tag: list)

For pillar 1 ideas 4 and 8, pillar 2 ideas 5, 8 and 9, pillar 3 ideas 1, 2 and 10. Lists of 3 items are best; 4 is the limit.

| Time | Screen | Content |
|---|---|---|
| 0.0 to 4.0 | 1 Hook | The question or the claim that the list answers. At most 6 words. |
| 4.0 to 8.5 | 2 Item 1 | Number chip `1`, then at most 7 words (7 words need 4.5 s). |
| 8.5 to 13.0 | 3 Item 2 | Same layout. |
| 13.0 to 17.5 | 4 Item 3 | Same layout. (Item 4 only if needed, to 22.0.) |
| 17.5 to 22.0 | 5 Sum | One line that closes the list. At most 7 words. |
| 22.0 to 26.0 | 6 End | End screen (section 1.3). |

Screens: 6 (7 with a fourth item). Total: 26 to 30.5 s. A screen with fewer words may be shorter (timing rule). Items are parallel (same grammar) and each one is a fact or a step from the pillar page, not an opinion with no label. Never add a seventh word to make a list "sound good".

#### Format B: chart (tag: chart)

For pillar 1 ideas 2, 3, 7. Plain drawn bars (section 2.4). Always sample data. Not a demo.

| Time | Screen | Content |
|---|---|---|
| 0.0 to 4.0 | 1 Hook | The question the chart answers. Bars grow from zero in the first second. |
| 4.0 to 7.5 | 2 Frame | "Here is a sample week." The `Sample data` label is on every screen from here, and also on screen 1. |
| 7.5 to 11.5 | 3 Total | The total with a unit. |
| 11.5 to 19.0 | 4 and 5 Read | Two read-outs, one per screen. The chosen bars get the `primary` color and a text tag; the others use the grey. |
| 19.0 to 23.5 | 6 View | Our view, said as a belief ("We think ..."), at most 7 words. |
| 23.5 to 27.0 | 7 Close | The plain line that ties it to the reader. At most 5 words. |
| 27.0 to 31.0 | 8 End | End screen. No numbers, so no sample label. |

Screens: 8. Total: about 31 s. One chart per video. At most 7 bars. Bars start at zero, use a linear scale and carry their value as text. Every number has a unit. No second chart, no pie, no trend line, no "average", no percentage.

#### Format C: steps (tag: steps)

For pillar 2 ideas 3, 4 and 6, pillar 3 ideas 3 and 9, and the pillar 4 demos. Steps are things the reader does, in order.

| Time | Screen | Content |
|---|---|---|
| 0.0 to 4.5 | 1 Hook | The situation of the reader, as a question. At most 7 words. |
| 4.5 to 8.0 | 2 Step 1 | Chip `Step 1`, then an action: verb first. Slot by the timing rule (3 to 4.5 s). |
| 8.0 to 11.5 | 3 Step 2 | Same layout. |
| 11.5 to 15.0 | 4 Step 3 | Same layout. |
| 15.0 to 18.5 | 5 Step 4 (optional) | Same layout. 4 steps is the limit. |
| 18.5 to 22.5 | 6 Outcome | What the steps give you, in plain words. At most 6 words. |
| 22.5 to 25.5 | 7 End | End screen. |

Screens: 6 to 7. Total: 22 to 29 s (the slots above are examples; each screen follows the timing rule). Each step is one action, in the imperative. Steps never promise a result. CareerOS has no plan feature, so planning steps say "your own notes".

#### Format D: myth-vs-fact (tag: myth-vs-fact)

For pillar 1 idea 9, pillar 2 ideas 2 and 10, pillar 3 ideas 4, 6 and 8.

| Time | Screen | Content |
|---|---|---|
| 0.0 to 3.5 | 1 Hook | The reader's doubt, as a question. |
| 3.5 to 7.5 | 2 Myth | Chip `Myth`, then the wrong belief as a plain sentence of at most 6 words. Not a quote, not "people say". |
| 7.5 to 11.5 | 3 Fact | Chip `Fact`, then the true line, at most 6 words. |
| 11.5 to 24.0 | 4 to 6 Detail | One to three screens that explain the fact with exact product words. Slots follow the timing rule. |
| 24.0 to 28.0 | 7 Check | A line the reader can check (for example the public code). Optional. |
| 28.0 to 32.0 | 8 End | End screen. |

Screens: 6 to 8. Total: 28 to 45 s. The myth is something a careful reader might truly think. The fact uses only brand profile section 6 words. For pillar 1 and 2, the "fact" is our view and says so ("We think ..."). Never name or mock a tool, a person or a group in the myth.

#### Format E: question (tag: question)

For pillar 1 ideas 1 and 5, pillar 2 ideas 1, 6 and 7, pillar 3 ideas 5 and 7.

| Time | Screen | Content |
|---|---|---|
| 0.0 to 3.5 | 1 Hook | A real question the reader asks. The only question in the video. At most 5 words. |
| 3.5 to 7.0 | 2 Turn | A short sentence that opens the answer ("Not how much you think."). At most 5 words. |
| 7.0 to 10.5 | 3 Answer | The answer in plain words. At most 5 words. |
| 10.5 to 14.5 | 4 How or why | The rule, the number or the reason, with a unit. At most 6 words. |
| 14.5 to 18.5 | 5 Next step | One plain next step the reader can do alone. At most 6 words. |
| 18.5 to 22.0 | 6 End | End screen. |

Screens: 6. Total: about 22 s. The shortest format. Use it when the time budget is tight. Sample numbers need the label.

#### Demo videos (pillar 4)

A demo is any video that shows the extension or the dashboard UI. At most 1 in 10 posts; never two in a row (content pillars, section 6). Use format C or E. Only sample data in the dashboard and only shipped features. In this file, no demo script is included: the three examples are not demos.

### 1.8 Quick comparison

| Format | Screens | Seconds | Best for | Time to edit (assumption) |
|---|---|---|---|---|
| List | 6 to 7 | 26 to 31 | Facts and short answers | 20 min |
| Chart | 8 | about 31 | Pillar 1, "your real week" | 25 min |
| Steps | 6 to 7 | 22 to 29 | Habits, setup | 20 min |
| Myth-vs-fact | 6 to 9 | 28 to 45 | Pillar 3 doubts | 25 min |
| Question | 6 | about 22 | When time is short | 15 min |

## 2. Visual kit

### 2.1 Canvas

- 9:16, 1080 x 1920 px, 30 frames per second, constant frame rate.
- One master file for all apps (platform study, section 9). No watermark from any app. Export from the editor, never from a platform.
- Safe box: section 1.4. Guide overlay: make one PNG of the safe box once and keep it on a top track while editing; hide it before export.

### 2.2 Colors from the tokens

Colors come from `packages/shared/theme/tokens.css` ([tokens](../../packages/shared/theme/tokens.css), [design system](../design-system.md)). The hex values below are our own conversion of the OKLCH tokens (the standard OKLCH to sRGB formula, rounded to 8 bits). They are for the editor, which does not read OKLCH. If a hex value looks wrong next to the app, convert again from the token.

Default theme for videos is **dark** (the landing page is dark only; phones show dark videos with less glare). A light version is allowed for variety, not more than 1 in 4 videos.

| Role | Token | Dark | Light |
|---|---|---|---|
| Background | `background` | `#0E0F12` | `#FFFFFF` |
| Text | `foreground` | `#F5F5F5` | `#0A0A0A` |
| Secondary text, labels | `muted-foreground` | `#A4A4A4` | `#555555` |
| Panel (end card, chip) | `card` | `#181D27` | `#F2F5FC` |
| Accent, bars, end name | `primary` | `#79A1FC` | `#325AC2` |
| Text on accent | `primary-foreground` | `#0F0F0F` | `#FAFAFA` |
| Lines | `border` | `#2E333D` | `#DBDEE5` |
| Not highlighted bars | `chart-6` | `#72747B` | `#7D8086` |

Contrast, computed from the hex values with the WCAG formula:

| Pair | Dark | Light | Needed |
|---|---|---|---|
| `foreground` on `background` | 17.58:1 | 19.80:1 | 4.5:1 |
| `muted-foreground` on `background` | 7.69:1 | 7.46:1 | 4.5:1 |
| `muted-foreground` on `card` | 6.77:1 | 6.83:1 | 4.5:1 |
| `primary` on `background` | 7.59:1 | 6.22:1 | 4.5:1 (text) |
| `primary-foreground` on `primary` | 7.59:1 | 5.96:1 | 4.5:1 |
| `chart-6` bar on `background` | 4.11:1 | 3.96:1 | 3:1 (graphic) |

Use only these colors. Do not use `success`, `warning` or `destructive`: status colors carry a meaning in the product and a sample bar is not a status.

### 2.3 Typeface

**Mona Sans**, the same face as the landing headings (design system). It is under the SIL Open Font License 1.1 [V4], which allows use in video, also for a business. Download it from the [Mona Sans repository](https://github.com/github/mona-sans) [V4], install the variable font on the editing computer and keep the `OFL.txt` file next to it. Use weights 500 (body) and 700 (hook and tags). If the font cannot be installed, the fallback is the system font stack of the tokens (`system-ui`). Use numbers with tabular figures where the editor allows it.

I read the repository page, which names the license. I did not read the full text of `OFL.txt` (assumption: standard OFL 1.1 terms, which allow use and embedding; the license forbids selling the font alone).

### 2.4 Plain drawn bars for sample data

Charts are drawn with rectangles in the editor. They are not screenshots and not the app (so not demos).

- **Direction:** horizontal bars, one row per item, 7 rows at most. Rows are 130 px apart; the bar is 56 px thick; corner radius 12 px (the token radius, `0.625rem`, at video scale).
- **Layout inside the safe box:** label at x = 80 (56 px, `foreground`, 130 px wide, for example `Mon`), bar from x = 230, value text 24 px to the right of the bar end (56 px, tabular).
- **Scale:** every bar starts at zero and uses one linear scale. Set the longest bar to 450 px and give the others `value / longest * 450`. Write the minutes, then draw. Example (sample day chart): 2h 10m = 130 minutes = 450 px, so about 3.46 px per minute.
- **Color:** all bars `primary`. When two bars are the point of the screen, they stay `primary` and the others turn to `chart-6`. The bars that matter also get their label in bold and a 4 px `foreground` outline, so the meaning does not depend on color.
- **No** gridlines, axis, legend, shadows, 3D, gradients, icons, animated counters or trend lines. No "average" or percent. Values show as text on the bar row (app format).
- **Motion:** bars grow from zero in 0.8 s, once, on the first screen. Later screens only change color and outline.

### 2.5 How to label "Sample data"

- Text `Sample data`, 40 px, bold, `muted-foreground`, in a chip with a `border` outline. Position: top-left of the safe box, x = 80, y = 262.
- It is on **every screen that shows a number**, including the hook screen. Not on screens with no numbers.
- Also write "Sample data" in the caption and in the text version.
- The sample week is the one from the voice page and the landing page: **6h 40m** in total.

| Sample day | Time |
|---|---|
| Mon | 20m |
| Tue | 30m |
| Wed | 25m |
| Thu | 1h 55m |
| Fri | 20m |
| Sat | 2h 10m |
| Sun | 1h 00m |
| Total | 6h 40m |

| Sample site | Time |
|---|---|
| `leetcode.com` | 3h 10m |
| `neetcode.io` | 2h 00m |
| `greatfrontend.com` | 1h 30m |
| Total | 6h 40m |

Both tables add up to 6h 40m (400 minutes). In the day table, Thursday and Saturday hold 4h 05m (245 minutes, a clear majority). They are made-up numbers for drawing. They are never described as what users do. Re-use these tables in every chart so the sample stays consistent; add a new sample only with the same total and a check of the sum.

## 3. Music

CareerOS videos use a quiet music bed (D13). Music is licensed or royalty-free, and the license for each track is saved (platform study, section 7). A business account is limited on TikTok to commercially licensed sounds [V7, V8]; sources differ on which accounts (platform study, section 3).

### 3.1 Source choice

| Order | Source | Cost | What we verified | What we did not verify |
|---|---|---|---|---|
| 1. Main | **Pixabay Music** (pixabay.com/music) | Free | The Pixabay Content License lets you use content for free, without attribution, and modify or adapt it. You cannot sell or distribute it on a standalone basis, and you cannot use it in a misleading way [V5]. The Terms (read in the specialist review, 2026-11-17) allow commercial and non-commercial use with no attribution, but give **no warranty** and **no Content ID promise** [V5b]. | Composers may register a track later, so a claim can arrive after upload (secondary source, [V12]). The license page does not say how TikTok treats a baked-in track on a business account. **Assumption:** the license covers a commercial brand account on YouTube, TikTok and LinkedIn. The license record (section 3.3) must show that commercial use is covered. |
| 2. Backup, YouTube only | **YouTube Audio Library**, tracks marked "Attribution not required" | Free | YouTube says tracks in the library are known to it to be copyright-safe, so no Content ID claims on YouTube; Creative Commons tracks need the artist credit in the description [V6]. | The terms do not address use outside YouTube, and YouTube says it cannot give legal guidance for off-platform issues [V6]. A secondary article says use on TikTok and Instagram is generally fine but must be checked per track [V11]. **Treat these tracks as YouTube-only.** Use on TikTok or LinkedIn is an assumption and goes in the license record. Do not use "Attribution required" tracks. |
| 3. TikTok-only fallback | **TikTok Commercial Music Library** (in the app) | Free | A secondary article says it is the library for brand content on business accounts, and that clearance is specific to TikTok [V12]. | We could not read TikTok's page. Use only if TikTok blocks the file with music baked in. The file for TikTok is then a different export (no music, add in the app), which breaks the "one master" rule. |

**Steps after upload (Pixabay and any other track).**

1. **TikTok:** answer the Music Usage Confirmation when the app asks at upload (secondary source, [V13]; we did not read TikTok's own page). Say the account is a business account and the video is brand content.
2. **YouTube:** the next day, open YouTube Studio and check the video for a copyright or Content ID notice. Do this again after 7 days for the first 8 weeks.
3. If a claim or mute appears, follow the stop rule below.

Not used: music from the trending lists of any app, songs, music from other videos, and "free" music from a site with no written license. AI-generated music: not at the start. If a Pixabay track page says it is AI-generated, choose another track, because platforms may ask for an AI label for it (platform study, section 7).

**Stop rule.** If a platform mutes the video or shows a claim, take the video down on that platform, replace the track with one from another source, and write the case here with the date. Keep the license page and the dispute text for each track.

### 3.2 What to pick and how to use it

- **Style:** instrumental, calm, steady, no vocals, no drops, no loud intro. 70 to 100 beats per minute. Words that work in the search box: "lofi", "ambient", "calm", "focus", "minimal".
- **Length:** at least the video length plus 3 seconds, so no loop is needed. Cut at the end of the last screen.
- **Start:** the music starts on frame 0 on a clear beat. Screen changes land on a beat when it is easy, but do not move a screen to fit a beat; the reading time rule wins.
- **Fade:** fade in 0.3 s, fade out 1.0 s on the end screen.
- **Volume:** the music is the only sound, so it must not clip or be too quiet. Keep peaks below -1 dBFS and the overall loudness near -16 to -14 LUFS (assumption: a normal level for short social video; check on the phone at half volume). If the editor has no loudness meter, set the track so that it is comfortable at half volume on a phone.
- **Sound effects:** none. A tick on each screen change is allowed only if it is soft and the track stays the same.
- **Different tracks:** use at least 3 different tracks in the first 8 weeks, so the channel does not sound like one template (platform study, section 3, YouTube Shorts).

### 3.3 License record (per track)

Keep this in the calendar outside the repo (D17), one line per video:

| Field | Example |
|---|---|
| Video file name | `2026-12-03-real-week.mp4` |
| Track title and artist | as written on the page |
| Source and track page URL | Pixabay or YouTube Audio Library |
| License page URL and download date | the exact license text read that day |
| Screenshot | the track page, saved as PNG |
| AI-generated? | no |

Do not commit audio files, track files or font files to the repository.

## 4. Production workflow (free tools)

### 4.1 Tool choice

| Tool | What we verified | What we did not verify | Verdict |
|---|---|---|---|
| **Kdenlive** | Described on its site as a "Free and Open Source Video Editor"; works on Linux, Windows, macOS and BSD [V1]. | The page does not state the license text or watermark policy. **Assumption:** no watermark and no commercial limit, because it is open source software; check the first export. | **Chosen.** Free, no account, no cloud, no paid tier to hit. |
| **DaVinci Resolve (free)** | The free version exports up to Ultra HD 3840 x 2160 and 60 fps, 8-bit [V2]. | The page does not state commercial use or watermarks. | Backup if Kdenlive is hard to use. Check the license before the first use for a business. |
| **CapCut (free)** | Secondary sources: the free plan's terms restrict commercial use, and the paid plans include a commercial license (FluxNote, updated 2026-06-14) [V3a]. Templates and effects marked Pro export with a watermark; free export is 1080p (BIGVU, 2026-06-29) [V3b]. | We could not read CapCut's own terms or license page. Both sources are blogs. | **Not chosen** for the brand account until the product owner reads the terms by hand. A brand account is a commercial use; a free plan with a restriction is the wrong base for a process that must stay free and clean. |

Why not CapCut: the main help of CapCut is auto-captions and templates. We do not need either: our text is typed by us, and the format is fixed. So the cost of leaving it is low, and the risk of a license or watermark problem is avoided.

Other free tools: GIMP or any free image editor for the safe box PNG (optional).

### 4.2 One-time setup (week 0, about 90 minutes, outside the weekly budget)

1. Install Kdenlive and Mona Sans (section 2.3). Keep `OFL.txt`.
2. Make the **template project**: 1080 x 1920, 30 fps; the safe box guide on the top track; the colors of section 2.2 as saved color clips; one title clip style for each size in section 1.5; one end screen with the logo placeholder; one chart row (label, bar, value) that can be duplicated.
3. Save the template as `_template-dark.kdenlive` and `_template-light.kdenlive`.
4. Make the three working folders outside the repo (section 4.3).
5. Make the private test account on each app and upload the template once as a private draft to check the overlays against section 1.4.
6. Export a 10 s test file and check that it has no watermark.

### 4.3 File naming and folders

Folders are outside the repository (the calendar is outside the repo, D17). Only this document lives in the repository.

```
careeros-video/
  _template/        template projects, guide PNG, fonts, license notes
  2026-12-03-real-week/
    2026-12-03-real-week.kdenlive   project
    2026-12-03-real-week.mp4        master export
    2026-12-03-real-week.txt        captions, text version, alt text
    music.txt                       license record (section 3.3)
```

Pattern: `YYYY-MM-DD-topic.mp4` (platform study, section 9). Date = planned publish date. Topic = 2 to 4 lowercase words with hyphens, no spaces. If a re-export is needed, add `-v2`. The same stem for the project, the text file and the video.

### 4.4 Weekly batch (about 2 hours, 2 videos)

The time plan is an assumption. Measure it in weeks 1 and 2. If a week takes more than 2 hours, drop LinkedIn first (platform study, section 1).

| Step | Minutes | What |
|---|---|---|
| 1. Pick | 10 | Two ideas from the pillar mix (content pillars, section 6), from two different pillars if the mix allows. Check that no demo is planned back to back. Pick the format from the idea tag. |
| 2. Write | 20 | For each video: 3 hooks, pick 1; write the screens with the timing rule; run the voice checklist (voice, section 7). |
| 3. Edit | 45 | Duplicate the template, paste the text, draw the bars, add music, fade. About 22 minutes per video. |
| 4. Export and check | 10 | Export. Watch each video once on a phone with the sound off, then with sound at half volume. |
| 5. Captions and schedule | 25 | One caption per app; the text version; hashtags checked in the app; schedule on YouTube and TikTok (LinkedIn from week 3). |
| 6. Analytics and claims | 10 | Read each app's own numbers and write them in the calendar (platform study, section 8). Check last week's videos for music claims in YouTube Studio. |
| Total | 120 | |

Replies to comments are done in the 10 spare minutes of steps 5 and 6, in plain words (voice, section 2).

### 4.5 Export settings

Choices we made (assumption: they are common settings for short social video; check the first upload on each app).

| Setting | Value |
|---|---|
| Container, codec | MP4, H.264 |
| Size, frame rate | 1080 x 1920, 30 fps, constant |
| Scan, color | Progressive, sRGB, BT.709 |
| Video bitrate | 10 Mbit/s |
| Audio | AAC, 48 kHz, stereo, 192 kbit/s |
| Length | 20 to 45 s |
| Watermark | none |
| Metadata | no personal data in the file; set the title to the file name |

Preview step: for each new template, upload one private (unlisted or "only me") draft to YouTube and TikTok, open it on a phone, check that no text meets an app button or the caption area, then delete the draft.

### 4.6 Pre-publish checklist

Run it for every video. One "no" means: fix the video first.

**Voice (voice, section 7)**

1. Every fact matches brand profile section 6. I can point to the source.
2. Every number is a product fact or labeled sample. No user counts, ratings, quotes or "studies show".
3. Privacy lines are exact: no "100%", "no cookies", "open source", "never sees".
4. No job-offer promise, no hour target, no shame, no "grind".
5. No future feature, date or price. "Free" only. Nothing about the LeetCode per-problem feature.
6. No other tool named or mocked. No real user data, emails or browsing.
7. Short sentences, "you", no hype words, no exclamation marks, no emoji.
8. Durations in the app format; "CareerOS" spelled correctly.
9. Read the text aloud once: would a calm colleague say this?

**Video**

10. 20 to 45 s. 5 to 9 screens. Hook on screen at frame 0.
11. Every screen follows the timing rule. At most 2 lines, 3 to 7 words per line.
12. Text is 64 px or more (labels 40 px). All readable parts are inside the safe box.
13. Contrast checked with the pairs in section 2.2. Meaning never by color alone.
14. `Sample data` is on every screen that shows a number. Bars start at zero and use one scale.
15. **No UI in a non-demo video.** No screenshot or recording of the extension or the dashboard. If the video does show the UI, it is a demo: pillar 4, at most 1 in 10 posts, never two in a row, sample data only, shipped features only.
16. End screen follows section 1.3. One call to action only. The logo placeholder is used until #195 ships.
17. No watermark. The file name follows section 4.3.

**Music and AI labels (brand profile, section 10)**

18. The track is from a source in section 3.1. The license record exists and shows that commercial use on TikTok and LinkedIn is covered. The track page does not say AI-generated. After upload: the Music Usage Confirmation is answered (TikTok) and the video is checked for claims the next day (YouTube Studio).
19. AI labels: text and royalty-free music need none by the rules we read (platform study, section 7). If the video uses an AI voice or AI images: switch on the platform's own AI label in every app and add "Made with AI" to the caption. (None of the example scripts do.)

**Text on each app**

20. One caption for each app, not pasted from another app. 3 to 5 topic hashtags where the app uses them, checked on the app. At most one link, with `utm_*`.
21. YouTube: no link in the description. TikTok: link in bio. LinkedIn: link in the post only in the link test weeks.
22. The text version is in the caption or the description. The alt text is added where the app has the field.

## 5. Example scripts

Three scripts from three pillars and three formats. Each is ready to produce: copy the texts into the template, apply the timing, and use a calm instrumental track. Every fact comes from brand profile section 6 or from the labeled sample in section 2.5. None shows the UI, so none is a demo.

| # | Pillar and idea | Format | Platforms |
|---|---|---|---|
| 1 | Pillar 1, idea 3: "A week has seven days. Which two did the work?" | Chart | YouTube Shorts, TikTok |
| 2 | Pillar 2, idea 4: restarting after a gap | Steps | YouTube Shorts, TikTok, LinkedIn |
| 3 | Pillar 3, idea 4: "Can a study tracker read my pages?" | Myth-vs-fact | YouTube Shorts, TikTok |

### Script 1: Which two days did the work? (chart)

**Source:** content pillars, section 2, idea 3. Theme: your real week. Length: 30.5 s, 8 screens. Sample data on screens 1 to 7. Dark theme.

Visual: seven horizontal bars (section 2.4) with the sample day values (section 2.5). Day labels `Mon` to `Sun` at left, values at the end of each bar. All bars `primary` until screen 4. Text is 72 px; use 64 px for a line longer than 22 characters (screens 4 and 7).

| # | Time | On-screen text | Visual |
|---|---|---|---|
| 1 | 0.0 to 4.0 | Which two days / did the work? | Seven bars grow from zero in 0.8 s. `Sample data` chip. Hook text 88 px. |
| 2 | 4.0 to 7.5 | Here is a sample week. | Bars stay. Text 72 px above the chart. |
| 3 | 7.5 to 10.5 | Seven days: 6h 40m. | Bars stay. The total in `primary`. |
| 4 | 10.5 to 14.5 | Thursday and Saturday / hold 4h 05m. | `Thu` and `Sat` bars stay `primary` with a 4 px outline and bold labels. The other bars turn `chart-6`. |
| 5 | 14.5 to 19.0 | The other five days / hold 2h 35m. | The five other bars `primary` with outline; `Thu` and `Sat` turn `chart-6`. |
| 6 | 19.0 to 23.0 | We think memory / keeps big days. | All bars `primary` again, no outline. |
| 7 | 23.0 to 26.5 | A count keeps all seven. | Same chart, in the upper half; text below it. |
| 8 | 26.5 to 30.5 | Free Chrome extension. / CareerOS | End screen. Small line: `Link in profile`. Logo placeholder. No numbers, so no sample label. |

Check of the numbers (sample): Thu 1h 55m + Sat 2h 10m = 4h 05m (245 minutes, more than half of 400). The other five days: 20m + 30m + 25m + 20m + 1h 00m = 2h 35m. Total = 6h 40m. Word counts: screen 4 has 6 words (4 s), screen 5 has 7 words (4.5 s), screen 3 has 4 words (3 s).

**Hook alternatives not used:** "How much did you really study this week?" (pillar 1 idea 1, a different video) and "Seven days. Two did the work." (a claim, but less open than the question).

**Why it is honest:** the hook asks about a sample chart, and the video answers it on screen 4: in this sample, two days hold a clear majority of the week. The view on screen 6 is labeled "We think" and gives no percentage or average (content pillars, section 2).

**Music:** calm instrumental, about 80 beats per minute, 35 s or longer, from section 3.1.

**YouTube Shorts**

- Title: `Which two days did the work? A sample week`
- Description:
  ```
  A sample week: 6h 40m over seven days. Thursday and Saturday hold 4h 05m of it.
  We think memory keeps the big days. A count keeps all seven.
  Sample data. Not real user data.

  Text version:
  Which two days did the work? Here is a sample week. Seven days: 6h 40m. Thursday and Saturday hold 4h 05m. The other five days hold 2h 35m. We think memory keeps big days. A count keeps all seven. Free Chrome extension. CareerOS.

  #studyplan #codinginterview #leetcode #softwareengineer
  ```
- No link in the description. The link is in the channel profile.

**TikTok**

- Caption:
  ```
  Which two days did the work? A sample week: 6h 40m. Thursday and Saturday hold 4h 05m of it. We think a count keeps all seven days. Sample data.
  #studyplan #codinginterview #leetcode #softwareengineer
  ```
- Text version in the first comment or the caption if space allows. Link in bio.

**Alt text:** "Seven horizontal bars show a sample study week, Monday to Sunday: 20m, 30m, 25m, 1h 55m, 20m, 2h 10m, 1h 00m. Total 6h 40m. Thursday and Saturday together are 4h 05m. Sample data."

### Script 2: Restarting after a gap (steps, with LinkedIn)

**Source:** content pillars, section 3, idea 4 (marked LI). Theme: steady, not heroic. Length: 25.5 s, 7 screens. No numbers, so no sample label. Pillar 2: no feature is mentioned, and the video ends on the name only.

| # | Time | On-screen text | Visual |
|---|---|---|---|
| 1 | 0.0 to 4.5 | Back after a gap / in your prep? | Plain background. Line 1 appears at frame 0, line 2 at 0.4 s. Hook text 88 px. |
| 2 | 4.5 to 7.5 | Study one ordinary week. | Chip `Step 1`. One line at 64 px. |
| 3 | 7.5 to 11.0 | Count the time per day. | Chip `Step 2`. One line at 64 px. |
| 4 | 11.0 to 14.0 | Write the total down. | Chip `Step 3`. |
| 5 | 14.0 to 18.5 | Plan the next week / from that number. | Chip `Step 4`. |
| 6 | 18.5 to 22.5 | A starting point, / not a score. | No chip. Text in `primary`. |
| 7 | 22.5 to 25.5 | CareerOS | End screen, name only (logo placeholder). |

Step 2 uses a generic "count" so the reader can use any method; the end screen names the product only. "Plan" means the reader's own notes. CareerOS has no plan feature and the video does not say it has one.

**Hook alternatives not used:** "Some weeks are small." (idea 1, a different video) and "Back after a break?" (shorter, less specific).

**Why it is honest:** no result promise, no hour target, no comparison. "A starting point, not a score" is the pillar's own line.

**Music:** calm, slow, about 70 to 80 beats per minute, 30 s or longer.

**YouTube Shorts**

- Title: `Restarting after a long gap: four calm steps`
- Description:
  ```
  Restarting after a gap in your interview prep? Study one ordinary week. Count the time per day. Write the total down. Plan the next week from that number. It is a starting point, not a score.

  Text version:
  Back after a gap in your prep? Step 1: Study one ordinary week. Step 2: Count the time per day. Step 3: Write the total down. Step 4: Plan the next week from that number. A starting point, not a score. CareerOS.

  #studyplan #codinginterview #softwareengineer
  ```

**TikTok**

- Caption:
  ```
  Restarting after a long gap? Study one ordinary week. Count the time per day. Plan the next week from that number. A starting point, not a score.
  #studyplan #codinginterview #softwareengineer
  ```

**LinkedIn** (from week 3; native upload of the same file; link only in the link test weeks):

- Post text:
  ```
  Back after a long gap in your interview prep?

  Start small. Study one ordinary week. Count the time per day. Write the total down.
  Then plan the next week from that number.

  It is a starting point, not a score. Some weeks are small, and a small week still tells you something.

  Free Chrome extension and dashboard: https://careeros-taupe.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=restart-after-gap

  #studyplan #codinginterview #softwareengineer
  ```
- In weeks without the link test, delete the link line (platform study, section 8).
- Text version for screen readers: add the seven screen texts in order as the alt text of the video, if the upload screen has the field.

**Alt text:** "Four steps on a plain background: study one ordinary week, count the time per day, write the total down, plan the next week from that number. A starting point, not a score. CareerOS."

### Script 3: Can a study tracker read my pages? (myth-vs-fact)

**Source:** content pillars, section 4, idea 4. Theme: exactly what is stored. Length: 42.5 s, 9 screens. No sample numbers, so no sample label. Not a demo: no UI. Facts: brand profile section 6; voice, "Privacy, exactly". CareerOS is named on screen 9; the caption and the description name it from the first line.

| # | Time | On-screen text | Visual |
|---|---|---|---|
| 1 | 0.0 to 4.5 | Can a study tracker / read my pages? | Hook, 76 px (line 1 has 19 characters). Plain background. |
| 2 | 4.5 to 9.0 | It reads every page / that you open. | Chip `Myth` (outlined, `muted-foreground`). 7 words, 4.5 s. |
| 3 | 9.0 to 13.5 | It does not read / any page content. | Chip `Fact` (filled `primary`, `primary-foreground` text). 7 words, 4.5 s. |
| 4 | 13.5 to 19.5 | It uses the tab address / only for the site name. | Plain text. |
| 5 | 19.5 to 25.5 | It stores the site name, / start time and end time. | Chip `Your study time`. |
| 6 | 25.5 to 29.5 | Full web addresses / and page titles. | Chip `Never stores`. |
| 7 | 29.5 to 33.5 | Page content and / all your keystrokes. | Chip `Never stores`. Same layout as screen 6. |
| 8 | 33.5 to 38.5 | The code is public. / Check it on GitHub. | Plain text. |
| 9 | 38.5 to 42.5 | Free Chrome extension. / CareerOS | End screen. Small line: `Link in profile`. |

Notes for the editor:

- Screen 1 is about "a study tracker" on purpose: the question is general, and the answer on screens 3 to 7 is about CareerOS, which the end screen and the caption name. The video does not claim anything about other tools.
- Screen 4 says "uses the tab address". Do not change it to "never sees" or "never reads". The extension uses the address of the active tab to get the site name (voice, "Privacy, exactly").
- The chip "Your study time" on screen 5 keeps the line exact: the account email and the sign-in provider are stored too. If a viewer asks, answer in plain words (voice, section 2): "Your account email and sign-in provider are stored. For your study time, the site name and the start and end times."
- Do not add "100%", "no cookies", "open source" or "private by design".
- Do not show the Chrome permission window. Keep the video text-only.

**Hook alternatives not used:** "Does a study tracker watch everything you do?" (idea 1, a different video) and "What does a tracker see?" (vague).

**Why it is honest:** the hook asks a real doubt; screen 3 answers it; screens 4 to 7 give the exact facts; screen 8 gives the reader a way to check.

**Music:** calm, steady, 75 to 90 beats per minute, 45 s or longer.

**YouTube Shorts**

- Title: `Can a study tracker read your pages?`
- Description:
  ```
  CareerOS does not read page content. It uses the tab's address only to get the site name.
  About your study time, it stores the site name, start time and end time. It never stores full web addresses, page titles, page content or keystrokes. The code is public on GitHub.

  Text version:
  Can a study tracker read my pages? Myth: it reads every page that you open. Fact: it does not read any page content. It uses the tab address only for the site name. About your study time, it stores the site name, start time and end time. Never stores full web addresses, page titles, page content and all your keystrokes. The code is public. Check it on GitHub. Free Chrome extension. CareerOS.

  #chromeextension #privacy #codinginterview #softwareengineer
  ```

**TikTok**

- Caption:
  ```
  Can a study tracker read your pages? CareerOS does not read page content. About your study time, it stores the site name, start time and end time. Public code on GitHub.
  #chromeextension #privacy #codinginterview #softwareengineer
  ```

**Alt text:** "Text only. Myth: it reads every page that you open. Fact: it does not read any page content. It uses the tab address only for the site name. About your study time, it stores the site name, start time and end time. It never stores full web addresses, page titles, page content or keystrokes. The code is public. Check it on GitHub. Free Chrome extension. CareerOS."

### Check of the three scripts against section 4.6

| Check | Script 1 | Script 2 | Script 3 |
|---|---|---|---|
| Length 20 to 45 s | 30.5 s | 25.5 s | 42.5 s |
| Hook at frame 0, 7 words or fewer | Yes (6) | Yes (7) | Yes (7) |
| Numbers are labeled sample | Yes | No numbers | No numbers |
| No UI | Yes | Yes | Yes |
| Facts from brand profile section 6 or sample | Sample | None needed | Section 6 |
| One call to action | Yes | Name only | Yes |
| LeetCode per-problem feature | Not mentioned | Not mentioned | Not mentioned |
| Price wording | None | None | "Free" only |
| Hashtags (3 to 5) | 4 | 3 | 4 |

## 6. Not now

- A voice or AI voice (D13): add "Made with AI" and the platform label when it is tested (brand profile, section 10).
- Screen recordings of the extension and the dashboard: pillar 4 only, at most 1 in 10 posts.
- Face, hands, a real person or an avatar (D8).
- Trending sounds, duets, stitches, templates and effects of an app (not in the first 8 weeks, content pillars, section 8).
- Paid tools, paid music libraries and paid templates (D14).
- Any content about the LeetCode per-problem feature, or any price, plan or date.
- Instagram Reels: same master file later; its caption and label rules are in the platform study.

## 7. Open points

1. Safe zones are our conservative choice, not official numbers. Confirm them with the first private uploads (section 4.5) and update section 1.4.
2. Pixabay Music: no warranty and no Content ID promise [V5b]. Claims can come after upload, so the checks in section 3.1 stay in the weekly routine. Read the full Terms by hand before the first video and copy the music rule here with the date.
3. Whether music baked into the file is accepted on TikTok for a business account is not verified (platform study, assumption 4).
4. Kdenlive: confirm no watermark on the first export and read its license (GPL, assumption).
5. CapCut's own terms were not read. If the product owner wants it, read the commercial-use terms of the free plan first.
6. The weekly time plan (section 4.4) is an assumption. Replace it with measured minutes after weeks 1 and 2.
7. Logo and end screen: update sections 1.3 and 2 when #195 ships.
8. Review this page after the first 10 videos: compare scripts with what was published, and check the hook rules against each app's own retention numbers (platform study, section 8).

## Sources

All accessed 2026-11-17. "Secondary" means a blog or news article, used where the primary page could not be read.

- [V1] Kdenlive, home page: <https://kdenlive.org/>
- [V2] Blackmagic Design, DaVinci Resolve: <https://www.blackmagicdesign.com/products/davinciresolve>
- [V3a] FluxNote, "CapCut Questions Answered" (updated 2026-06-14), secondary: <https://fluxnote.io/guides/capcut-questions-answered>
- [V3b] BIGVU, "CapCut free vs Pro: what 2026's restructure actually gives you" (2026-06-29), secondary: <https://bigvu.tv/blog/capcut-free-vs-pro-what-2026s-restructure-actually-gives-you/>
- [V4] GitHub, Mona Sans repository (license: SIL Open Font License 1.1): <https://github.com/github/mona-sans>
- [V5] Pixabay, Content License summary: <https://pixabay.com/service/license-summary/>
- [V5b] Pixabay, Terms of Service (read in the specialist review of PR #204, 2026-11-17): <https://pixabay.com/service/terms/>
- [V6] YouTube Help, Audio Library: <https://support.google.com/youtube/answer/3376882>
- [V7] Social Media Today, TikTok music rules for businesses (2020-05-11), secondary: <https://www.socialmediatoday.com/news/tiktok-changes-rules-on-music-usage-by-businesses/577734/> (from platform study [S10])
- [V8] Buffer, how to schedule TikTok posts, secondary: <https://buffer.com/resources/how-to-schedule-tiktok-posts/> (from platform study [S8])
- [V9] YouTube Help, clickable links policy: <https://support.google.com/youtube/answer/13748639> (from platform study [S2])
- [V10] W3C, WCAG 2.2, success criterion 1.4.3 Contrast (Minimum): <https://www.w3.org/TR/WCAG22/#contrast-minimum> (cited from general knowledge; the page was not opened in this session)
- [V11] Thematic, YouTube Audio Library guide, secondary: <https://hellothematic.com/youtube-audio-library/>
- [V13] Epidemic Sound Help, how to post commercial content on TikTok, secondary (vendor help page; listed by search, not opened in this session): <https://help.epidemicsound.com/hc/en-us/articles/26251264491794-How-to-Post-Commercial-Content-on-TikTok>
- [V12] Uppbeat, "Copyright-safe music for Shorts, Reels and TikTok", secondary: <https://uppbeat.io/blog/royalty-free-and-copyright-free-music/copyright-safe-music-for-shorts-reels-and-tiktok-how-to-post-without-claims-or-mutes>

Internal: [brand profile](brand-profile.md), [persona](persona.md), [voice](voice.md), [platform study](platform-study.md), [content pillars](content-pillars.md), [design system](../design-system.md), [design tokens](../../packages/shared/theme/tokens.css), [v1 discovery](../../specs/v1/00-discovery.md).

Not readable by our tools, so not used as evidence: CapCut's own terms and license pages, TikTok's Commercial Music Library page, YouTube and TikTok overlay measurements, the `OFL.txt` text.

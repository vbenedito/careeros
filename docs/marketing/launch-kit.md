# CareerOS launch kit: week 1

Type: living · Owner: product owner · Last reviewed: 2026-11-20

Amended 2026-11-22 (#258): section 7: extension 0.3.1 is live.

Amended 2026-11-22 (#261, product owner): Instagram Reels from week 1, the same file as TikTok (sections 1, 5, 6 and 8).

Issue #246. Everything needed to publish the first two videos and to set up the profiles: the final scripts for videos 1 and 2, the bios, the bio links with `utm_*` tags, and the week-0 checklist. It reads the [brand profile](brand-profile.md), the [voice](voice.md), the [platform study](platform-study.md), the [video formats](video-formats.md) and the [goals and KPIs](goals-and-kpis.md). If this page disagrees with them, they win and this page is fixed.

Nothing here is new content. Videos 1 and 2 are scripts 1 and 2 of [video formats](video-formats.md) section 5, with the dates, file names and logo end screen added. The calendar with drafts and numbers stays outside the repo (D17).

## 1. Dates

| Video | Publish | Pillar, format | File stem | Platforms |
|---|---|---|---|---|
| 1. Which two days did the work? | Tue 2026-11-24 | Pillar 1, chart | `2026-11-24-which-two-days` | YouTube Shorts, TikTok, Instagram Reels |
| 2. Restarting after a gap | Thu 2026-11-26 | Pillar 2, steps | `2026-11-26-restart-after-gap` | YouTube Shorts, TikTok, Instagram Reels (LinkedIn from week 3) |

- Two videos a week, Tuesday and Thursday, as in [goals and KPIs](goals-and-kpis.md) section 2 (last post Thursday 2027-01-14).
- Post both videos at the same local time. Pick the time once, write it in the calendar, and keep it for the 8 weeks, so time of day is not a second variable.
- Thresholds lock on Mon 2026-11-23 ([goals and KPIs](goals-and-kpis.md) section 7). Week-0 numbers are written before Tue 24.

## 2. End screen with the logo

The logo shipped in #195, so the placeholder in [video formats](video-formats.md) section 1.3 is replaced (updated in the same PR):

- Both videos use the dark template (`_template-dark.kdenlive`). The mark is `brand/careeros-mark-dark.svg` (the dark variant is for dark surfaces, [brand README](brand/README.md)).
- Mark 160 px high, centred, above the word `CareerOS` (88 px bold, `primary`). Clear space: at least 40 px (one quarter of the mark height) around the mark; the word sits outside that space. The word is typed text in the video font (Mona Sans), a deliberate pairing with the mark; the Inter lockup files are for static images.
- Do not recolour, stretch or add a shadow to the mark.
- Video 1 end screen: `Free Chrome extension.` / mark / `CareerOS` / small line `Link in profile`.
- Video 2 end screen (pillar 2): mark / `CareerOS` only. No "Link in profile", no feature.

## 3. Video 1: Which two days did the work?

Script 1 of [video formats](video-formats.md) section 5, unchanged except the end screen. Length 30.5 s, 8 screens, dark theme. Sample data on screens 1 to 7. Sample week from video formats section 2.5 (Mon to Sun: 20m, 30m, 25m, 1h 55m, 20m, 2h 10m, 1h 00m; total 6h 40m).

| # | Time | On-screen text | Visual |
|---|---|---|---|
| 1 | 0.0 to 4.0 | Which two days / did the work? | Seven bars grow from zero in 0.8 s. `Sample data` chip. Hook text 88 px. |
| 2 | 4.0 to 7.5 | Here is a sample week. | Bars stay. Text 72 px above the chart. |
| 3 | 7.5 to 10.5 | Seven days: 6h 40m. | Bars stay. The total in `primary`. |
| 4 | 10.5 to 14.5 | Thursday and Saturday / hold 4h 05m. | `Thu` and `Sat` bars `primary` with a 4 px outline and bold labels. The other bars turn `chart-6`. |
| 5 | 14.5 to 19.0 | The other five days / hold 2h 35m. | The five other bars `primary` with outline; `Thu` and `Sat` turn `chart-6`. |
| 6 | 19.0 to 23.0 | We think memory / keeps big days. | All bars `primary` again, no outline. |
| 7 | 23.0 to 26.5 | A count keeps all seven. | Chart in the upper half, text below. |
| 8 | 26.5 to 30.5 | Free Chrome extension. / CareerOS | End screen of section 2. Small line `Link in profile`. |

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
- No link in the description. The link is in the channel profile (section 6).

**TikTok**

- Caption:
  ```
  Which two days did the work? A sample week: 6h 40m. Thursday and Saturday hold 4h 05m of it. We think a count keeps all seven days. Sample data.
  #studyplan #codinginterview #leetcode #softwareengineer
  ```
- Text version in the first comment. Link in bio.

**Instagram Reels**

- Caption: the same as TikTok. Text version in the first comment. Link in bio.

**Alt text:** "Seven horizontal bars show a sample study week, Monday to Sunday: 20m, 30m, 25m, 1h 55m, 20m, 2h 10m, 1h 00m. Total 6h 40m. Thursday and Saturday together are 4h 05m. Sample data."

## 4. Video 2: Restarting after a gap

Script 2 of [video formats](video-formats.md) section 5, unchanged except the end screen. Length 25.5 s, 7 screens, dark theme. No numbers, so no sample label. Pillar 2: no feature is named.

| # | Time | On-screen text | Visual |
|---|---|---|---|
| 1 | 0.0 to 4.5 | Back after a gap / in your prep? | Plain background. Line 1 at frame 0, line 2 at 0.4 s. Hook text 88 px. |
| 2 | 4.5 to 7.5 | Study one ordinary week. | Chip `Step 1`. One line at 64 px. |
| 3 | 7.5 to 11.0 | Count the time per day. | Chip `Step 2`. One line at 64 px. |
| 4 | 11.0 to 14.0 | Write the total down. | Chip `Step 3`. |
| 5 | 14.0 to 18.5 | Plan the next week / from that number. | Chip `Step 4`. |
| 6 | 18.5 to 22.5 | A starting point, / not a score. | No chip. Text in `primary`. |
| 7 | 22.5 to 25.5 | CareerOS | End screen of section 2, name only. |

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

**Instagram Reels**

- Caption: the same as TikTok. Link in bio.

**LinkedIn** (week 3 or later only): use the post text of video formats, script 2, with the link `https://careeros-taupe.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=restart-after-gap` only in a link-test week ([goals and KPIs](goals-and-kpis.md) section 7).

**Alt text:** "Four steps on a plain background: study one ordinary week, count the time per day, write the total down, plan the next week from that number. A starting point, not a score. CareerOS."

## 5. Bios

Same display name and the same handle on every platform ([platform study](platform-study.md) section 7). The handle and the account email are the product owner's choice (D19); `<handle>` below is that choice.

| Field | YouTube | TikTok | Instagram |
|---|---|---|---|
| Account | Brand channel, name `CareerOS`, handle `@<handle>` | Business account, name `CareerOS`, handle `@<handle>` | Professional account, type Creator (free Insights), name `CareerOS`, handle `@<handle>` |
| Profile picture | `brand/careeros-avatar-light-1024.png` | same | same |
| Bio | Channel description below | `Free Chrome extension that counts your study time on the sites you choose.` (74 characters; TikTok allows 80) | Same line as TikTok (74 characters; Instagram allows 150) |
| Link | Channel **Links**: title `Free Chrome extension`, URL in section 6 | **Website** field, URL in section 6 | **Links** field in the profile, URL in section 6 |

**YouTube channel description:**

```
Free Chrome extension and web dashboard that counts your study time on the sites you choose.

Short videos about your real study week, steady practice, and exactly what a study tracker stores.

It never stores full web addresses, page titles, page content or keystrokes. The code is public on GitHub.
```

Rules applied: the short product description from [voice](voice.md) section 3; "free" only; no emoji, no hashtags, no result promise; the privacy line uses only "never stores" items that are true in every version (voice, "Privacy, exactly"). The bio does not mention problem tracking (section 7).

LinkedIn Company Page (from week 3): tagline = the TikTok bio line; website = the LinkedIn link in section 6.

## 6. Bio links

From [goals and KPIs](goals-and-kpis.md) section 6. Copy them exactly; lowercase; only these three parameters.

| Place | URL |
|---|---|
| YouTube channel Links | `https://careeros-taupe.vercel.app/?utm_source=youtube&utm_medium=social&utm_campaign=bio` |
| TikTok Website field | `https://careeros-taupe.vercel.app/?utm_source=tiktok&utm_medium=social&utm_campaign=bio` |
| Instagram profile link | `https://careeros-taupe.vercel.app/?utm_source=instagram&utm_medium=social&utm_campaign=bio` |
| LinkedIn Company Page website (week 3) | `https://careeros-taupe.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=bio` |

**Phone test, for each link (before Tue 24):**

1. On the phone, open the app, go to the CareerOS profile, and tap the link from inside the app.
2. The CareerOS landing page opens, signed out. The address still shows the three `utm_*` parameters, or only them after a redirect (SEC-15 drops any other parameter the app adds).
3. Next day, in Vercel → Analytics → Referrers, check that a visit from that platform appears. Write the result in the calendar. If no referrer appears, note it: in-app browsers can hide the referrer, so the count is a lower bound ([goals and KPIs](goals-and-kpis.md) section 7).

Per-post link format, for a post that carries its own link (for example an Instagram Story link sticker or a YouTube description): `https://careeros-taupe.vercel.app/?utm_source=<source>&utm_medium=social&utm_campaign=<topic-slug>`. The topic slug is the topic part of the file stem, for example `restart-after-gap`. Copy it from the calendar. Videos 1 and 2 carry no link of their own.

Assumption: a TikTok business account shows the Website field without a follower minimum. If the field is not there, write it in the calendar and tell the tech lead before Tue 24: the TikTok upload of video 1 then needs an end screen without `Link in profile`.

## 7. Problem tracking in posts

Extension 0.3.0 (LeetCode problem names, off by default) is live in the store since 2026-11-20. Videos 1 and 2 do not mention it, and the bios do not either. Extension 0.3.1 is live since 2026-11-22. It adds NeetCode and renames the setting to "Track coding problems" (PRB-22). Posts about problem tracking may now use the wording of the [brand profile](brand-profile.md) section 11, with the exact privacy line in [voice](voice.md) ("Privacy, exactly"). A post that lists what is stored includes the opt-in clause about problem names.

## 8. Week-0 checklist

| Day | Who | What |
|---|---|---|
| Fri 2026-11-20 | Product owner | Choose the handle (check it is free on YouTube, TikTok, Instagram and LinkedIn, with 2 fallbacks) and the account email (D19). |
| Sat 2026-11-21 | Product owner | Create the YouTube brand channel, the TikTok business account and the Instagram Professional account (type Creator). Upload the light avatar. Paste the bios (section 5) and links (section 6). |
| Sat 2026-11-21 | Product owner | One-time Kdenlive setup if not done ([video formats](video-formats.md) section 4.2, about 90 minutes). |
| Sun 2026-11-22 | Product owner | Pick the two Pixabay tracks and fill the license records (video formats section 3.3). Edit videos 1 and 2. Export. Watch each on the phone, sound off, then at half volume. Run the pre-publish checklist (video formats section 4.6). |
| Sun 2026-11-22 | Product owner | Phone test of the bio links (section 6), including Instagram. |
| Mon 2026-11-23 | Product owner | Confirm or change the thresholds in [goals and KPIs](goals-and-kpis.md) section 7. After today they are locked. Check the Vercel referrer list for the phone-test visits. |
| Mon 2026-11-23 | Product owner | Write the week-0 numbers in the calendar: installs (store dashboard), sign-ups, site visitors (Vercel) for 2026-11-16 to 2026-11-22. |
| Mon 2026-11-23 | Product owner | Schedule video 1 on YouTube (Studio), TikTok (desktop scheduler) and Instagram Reels (same file as TikTok) for Tue 24; video 2 for Thu 26. Same time of day for both. |
| Tue 2026-11-24 | Product owner | Video 1 goes live. Answer the TikTok Music Usage Confirmation if asked. |
| Wed 2026-11-25 | Product owner | YouTube Studio: check video 1 for a copyright or Content ID notice (video formats section 3.1). |

## Open points

1. The handle and the account email (D19) are still open. Section 5 uses `<handle>` until then.
2. The TikTok Website field without a follower minimum is an assumption (section 6).
3. Review this page after the first 10 videos together with [video formats](video-formats.md).

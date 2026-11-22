# CareerOS goals and KPIs

Type: living · Owner: product owner · Last reviewed: 2026-11-22

Amended 2026-11-22 (#261, product owner): Instagram Reels from week 1; free measurement only; per-post links where a post carries its own link.

This is the seventh marketing document (issue #191, step 7 of the marketing process in [v1 discovery](../../specs/v1/00-discovery.md) D18). It reads the [brand profile](brand-profile.md), the [persona](persona.md), the [voice](voice.md), the [platform study](platform-study.md), the [content pillars](content-pillars.md) and the [video formats](video-formats.md). If this page disagrees with them, they win, except for the UTM values in section 6: the voice page and the platform study left those open, and this page fixes them.

The content calendar is the next step. It lives **outside the repo** (D17), because it holds drafts and weekly numbers. This page says what the calendar must record. It does not repeat the calendar.

How to read it: every number in this page is either a plan we chose (cadence, time budget, thresholds) or a rule for how to read data later. **There are no results here and no baselines.** Where no baseline exists, the page says "weeks 1 and 2 set the baseline".

## 1. The answer in short

- **Business goal.** Find out, in 8 weeks, whether short text-only videos bring careful working engineers to CareerOS, and at what cost in time. The goal is to measure (D14), not to grow a number.
- **North-star KPI per platform.** YouTube Shorts: average percentage viewed. TikTok: share of views that watch the full video. Instagram Reels: average watch time. LinkedIn (from week 3): link clicks per 1,000 impressions on the link-test posts. LinkedIn gets no baseline, only a hint (section 7).
- **Every threshold is relative to our own baseline** (weeks 1 and 2), and all thresholds are locked before the first post.
- **Time is a KPI too.** If a week takes more than 2 hours, drop Instagram first, then LinkedIn.

## 2. Business goal and SMART objective

**Business goal (8-week test, 2026-11-23 to 2027-01-17).** Learn which platform, if any, is worth the weekly time for CareerOS, by measuring attention on the videos and visits to the site, so the product owner can keep, drop or add platforms with data. This serves the awareness and consideration steps only. We do not claim that social posts cause installs.

**SMART objective.**

| Part | Content |
|---|---|
| Specific | Publish 16 videos (2 a week on YouTube Shorts, TikTok and Instagram Reels, the same file on all three) and 6 LinkedIn posts (1 a week from week 3). Record each platform's north-star KPI and supporting signals for every post. Decide the keep, drop and add questions in section 9. |
| Measurable | Posts published against plan (target: at least 14 of 16 videos). Average weekly time (target: 2 hours or less). Baseline written down for each north star. A decision recorded for each question in section 9. |
| Achievable | The plan fits one person and free tools (D14). The scripts for 3 videos are ready. Missing a post is allowed; catching up is not (section 8). |
| Relevant | It answers the open assumption that the persona uses short video and LinkedIn for study content (persona, assumption 6; platform study, section 10). |
| Time-bound | Baseline note: Thursday 2026-12-10 (day 7 of the fourth video). Last post: Thursday 2027-01-14. Review: Thursday 2027-01-21 or the next working day, after the last video has its 7 days of data. |

**Method.** Each platform's own analytics, plus the Vercel Web Analytics **Referrer** list for site visits (section 5). UTM reports are not available on our free plan (free only, for now), but every link keeps its `utm_*` tags. Section 5 describes a free CLI test that may give per-campaign visits. Numbers are written in the calendar outside the repo (platform study, section 8). They are never published as statistics unless real.

## 3. North-star KPI per platform

The north star is chosen by what each platform rewards (platform study, section 3). One metric each. Read it for each video at **day 7 after publishing**, so videos are compared on the same window. Use the median of the videos in a period, not the mean, because one video can be far above the rest.

| Platform | Win condition | North star | Why this one |
|---|---|---|---|
| YouTube Shorts | A Short is shown more if viewers do not swipe away and stay to the end. Our videos are 20 to 45 s, so retention is readable. | **Average percentage viewed** per Short. | The pillars name "watch time or retention" as the success signal (content pillars, sections 2 and 3). A percentage compares videos of different length. |
| TikTok | Finishing the video is the strongest sign that the video was worth watching (assumption; not verified for our account). | **Share of views that watched the full video.** | Same file as YouTube, so the same quality shows up as completion. A second platform with a different metric also tells us if the two audiences differ. |
| Instagram Reels | Watch time is a main ranking signal for Reels (assumption; not verified for our account). The same file as TikTok. | **Average watch time** per Reel. | Chosen like TikTok's: it shows whether people stay with the same file, and we read it next to YouTube and TikTok. Insights may show seconds, not a percentage; compare Reels of similar length only (assumption; confirm in week 1). |
| LinkedIn (test slot, from week 3) | A working engineer reads, reacts and visits the link. Video is weaker than documents there (platform study, section 3), so we test the link. | **Link clicks per 1,000 impressions**, on posts that carry the link (link-test weeks only). | The only LinkedIn question we need to answer is whether this audience goes to the site. |

Names in the apps may differ ("average percentage viewed", "watched full video", "clicks", "impressions"). In week 1, write the exact label of each number as the app shows it, in the calendar notes. If an app does not show a number, say so in the notes and use the closest one. Do not calculate a number the app does not give.

LinkedIn caveat: only about 3 posts carry the link (weeks 3, 5 and 7). That is too few to prove anything. Treat the result as a hint and say so at the review.

## 4. Supporting signals and pillar success signals

At most 3 supporting signals per platform. They check that the north star is not rising for a wrong reason.

| Platform | Supporting signals |
|---|---|
| YouTube Shorts | 1. Viewed vs swiped away (is the hook working?). 2. Shares. 3. Site visits from the `youtube.com` referrer (a lower bound, section 5). |
| TikTok | 1. Average watch time. 2. Shares and saves per 1,000 views. 3. Site visits from the `tiktok.com` referrer (a lower bound). |
| Instagram Reels | 1. Reach (how many accounts saw it). 2. Shares and saves per 1,000 plays. 3. Site visits from the `instagram.com` referrer (a lower bound). |
| LinkedIn | 1. Impressions per post, link weeks and no-link weeks side by side. 2. Comments: read the words, not only the count. 3. Site visits from the `linkedin.com` referrer (a lower bound). |

**Outcome signals (all sources, read weekly, judged at the review).** Site visitors (Vercel Web Analytics), Chrome Web Store installs, and new sign-ups. They are context. They are not tied to a platform or a video: the store listing and the database do not carry a source, and we do not add tracking to make them do so (SEC-01, SEC-15). Also compare the total weekly site visitors with week 0.

**Pillar success signals** (from content pillars, to be read for each video with the platform's own analytics, then grouped by pillar at the review):

| Pillar | Success signal |
|---|---|
| 1. Your real week | Watch time or retention on each video, and shares. |
| 2. Steady, not heroic | Shares and saves, and retention. On LinkedIn, comments and clicks on the UTM link. |
| 3. Exactly what is stored | Saves, and clicks on the profile link (if the app shows it; YouTube Studio does not) and on the UTM link. A privacy post with saves but no clicks still builds trust; judge it at the review. |
| 4. CareerOS at work | Clicks on the UTM link, and visits to the site or the store listing per hour spent. On LinkedIn, link clicks in the test weeks. |

The north star is the same for all pillars on a platform, so pillars can be compared fairly. The pillar signal explains why a pillar did well or badly.

## 5. Where each number is read

| Number | Where | Who and when | Notes |
|---|---|---|---|
| Views, average percentage viewed, viewed vs swiped away, shares | YouTube Studio analytics | Product owner, weekly (10 minutes) | Read each video at day 7. |
| Watched full video, average watch time, shares, saves | TikTok analytics (Business account) | Product owner, weekly | Same. |
| Plays, reach, saves, shares | Instagram Insights (Professional account, type Creator) | Product owner, weekly | Read each Reel at day 7. |
| Impressions, clicks, comments | LinkedIn Company Page analytics | Product owner, weekly | From week 3. |
| Site visitors by source | Vercel Web Analytics, Referrer list (path, referrer, country, device; SEC-15) | Product owner, weekly | A lower bound. Copy the numbers into `weekly-numbers.csv` every week: the free plan keeps about 1 month of data, so they expire. |
| Chrome Web Store installs | Chrome Web Store developer dashboard | Product owner, weekly | Total only. The store does not give us the source (assumption; check the dashboard). |
| New sign-ups | Counted from the database by the tech lead | Tech lead, weekly, as one number | A count only: no emails, names or ids leave the database. Not split by platform. |
| Time spent in the week | The batch log (minutes per step, video-formats section 4.4) | Product owner, weekly | Needed for "referrer visits per hour spent". |

**Plan fact.** UTM reports in Vercel Web Analytics are not available on our plan. They need Pro with the Web Analytics Plus add-on, or Enterprise ([Vercel docs: limits and pricing](https://vercel.com/docs/analytics/limits-and-pricing); [changelog: UTM parameter support](https://vercel.com/changelog/utm-parameter-support-in-web-analytics)). Product owner decision (2026-11-22): **free only, for now.** No Pro, no Web Analytics Plus. The free default (D14) is: **Referrer list plus the native app metrics are the main numbers.** The `utm_*` tags stay on every link so a later upgrade works without changing any bio. Whether to pay, or to build a redirect counter, is an 8-week review item (section 9).

**Free CLI test (once).** The product owner tests the free Vercel CLI one time ([Vercel docs: accessing metrics with the CLI](https://vercel.com/docs/analytics/accessing-metrics-with-vercel-cli)):

1. Install it: `npm i -g vercel`.
2. Log in: `vercel login`.
3. Link the project: run `vercel link` in a folder of the repo.
4. Run: `vercel metrics vercel.analytics.page_view.count --group-by utmSource --group-by utmCampaign`

The docs do not say if this returns UTM groups on the Hobby plan. If it does, read per-campaign visits weekly from it and copy them into `weekly-numbers.csv`. If it errors or returns no UTM groups, write that in the calendar and stay on the Referrer list. Never paste tokens anywhere (not in the calendar, the CSV, an issue or a chat).

**Phone test before the first post (platform study assumption 7).** From a phone, open each bio link from inside its own app: YouTube, TikTok, Instagram and, from week 3, LinkedIn. Then look in the Vercel dashboard and write down which referrer appears (for example `youtube.com`) or whether the visit shows as Direct. In-app browsers may send no referrer, so the Referrer counts are a **lower bound**, never a total. Write the test visits in the calendar notes so they are not read as real interest.

**Not tracked, on purpose.** No GA4 (D25). No custom events. No click tracking on the extension (SEC-15: the extension never sends analytics). No personal data in any number.

## 6. The UTM scheme

This closes the open point in voice (open point 1) and the "final list" left open in the platform study (section 7).

**Pattern.** `https://careeros-taupe.vercel.app/?utm_source=<source>&utm_medium=social&utm_campaign=<campaign>`

| Parameter | Allowed values | Rule |
|---|---|---|
| `utm_source` | `youtube`, `tiktok`, `instagram`, `linkedin` | The platform name, lowercase. One value for YouTube; not `youtube-shorts`. |
| `utm_medium` | `social` | Always `social`. No other value. |
| `utm_campaign` | `bio`, or a topic slug | `bio` = the link in a profile or bio. A topic slug = the link inside one post. |

- **Topic slug.** 2 to 4 lowercase words, joined by hyphens, letters and digits only, at most 30 characters, the same words as the topic in the file name (video-formats, section 4.3). One slug per idea; never reuse a slug for a different idea. Example: `restart-after-gap`. This matches the LinkedIn caption in video-formats, script 2.
- **Only these three parameters.** No `utm_content`, no `utm_term`. Fewer names are easier to type without mistakes.
- **Always link to the landing page `/`.** Do not add a path.
- **No personal data** in any value.

**Where the links go (platform study, sections 7 and 9).**

| Place | Link | Per-post attribution |
|---|---|---|
| YouTube channel profile | `...?utm_source=youtube&utm_medium=social&utm_campaign=bio` | No. Per-post numbers come from YouTube Studio. |
| TikTok bio | `...?utm_source=tiktok&utm_medium=social&utm_campaign=bio` | No. Per-post numbers come from TikTok analytics. |
| Instagram bio | `...?utm_source=instagram&utm_medium=social&utm_campaign=bio` | No. Per-post numbers come from Instagram Insights. |
| Instagram Story link sticker, YouTube video description | `...&utm_campaign=<topic-slug>` | Only if the free CLI test works (section 5); otherwise a referrer count. |
| LinkedIn Company Page (website field) | `...?utm_source=linkedin&utm_medium=social&utm_campaign=bio` | No. |
| LinkedIn post, link-test weeks only | `...?utm_source=linkedin&utm_medium=social&utm_campaign=<topic-slug>` | Only if the free CLI test works (section 5). Otherwise the tags are kept for a later upgrade, and per-post clicks come from LinkedIn analytics. |

The topic slug is the topic part of the calendar file name: `2026-11-26-restart-after-gap` gives `restart-after-gap`. Copy links from the calendar. Never type them.

A bio link is the same for every post. On our plan, the UTM values are not shown, so visits are read as a referrer count per platform, a lower bound. Per-post numbers come only from each app's own analytics.

**Check against SEC-15 (filtering).** SEC-15 drops every query parameter except `view` and `utm_*`, and the proxy redirects a signed-out `GET /?...` that has any non-`utm_*` parameter to `/` with only the `utm_*` parameters.

| Case | Result |
|---|---|
| Our three `utm_*` parameters on `/` | Kept. No redirect, because there is no other parameter. |
| Lowercase values, hyphens, digits | Safe. The lowercasing in SEC-15 applies to the path, and our values are lowercase already. |
| Extra parameters added by an app (for example a click id) | Dropped by the redirect. The `utm_*` values stay. Harmless. |
| A link to `/connect`, `/settings` or `/auth/*` | Never used. Those pages are not measured (SEC-15). |
| A signed-in visitor | Does not see the landing page, so is not counted there. The numbers are for new visitors only. |

## 7. Baselines and decision rules

**No baseline exists today.** There are no past posts and no outside benchmark we trust (platform study, section 2: we do not use follower counts or other accounts' numbers). So:

- **Weeks 1 and 2 set the baseline.** YouTube Shorts, TikTok and Instagram Reels: the median of the first 4 videos' (Reels') north star at day 7, written in the calendar on 2026-12-10. Each platform gets its own **B**. **LinkedIn gets no B.** It has about 3 link posts, too few for a baseline. Read the 3 link posts (weeks 3, 5 and 7) as a hint only.
- Also write the numbers for the week before the first post (installs, sign-ups, site visitors) as "week 0". It is a reading of the week, not a target.
- **Thresholds are locked on 2026-11-23, before the first post.** Any later change goes in the calendar notes with the date and the reason. Never change a threshold to fit a result.
- The factors 0.75 and 1.25 below are our starting values, not outside benchmarks. They are rules for when to look, not proof.

**Rules for one video (YouTube Shorts, TikTok and Instagram Reels), after the baseline exists:**

| Result at day 7 | Do this |
|---|---|
| North star below 0.75 x B, one video | Note it. No change. One video is noise. |
| Below 0.75 x B, two videos in a row | Change one thing in the next video: the hook (screen 1) or the length. Not both. Write which one. |
| Between 0.75 x B and 1.25 x B | Keep going. |
| Above 1.25 x B | Write what is different (format, pillar, hook). Make one more video with the same format in the next 2 weeks as a test. |
| North star at or above B, but viewed vs swiped away is low | The hook is the problem. Rewrite the first 2 seconds (video-formats, section 1.2). |
| North star at or above B, but the referrer count from that platform is 0 for 3 weeks | Check that the bio link is live and typed right. Remember the count is a lower bound: in-app browsers may hide the referrer. Then change the last screen wording, one change at a time. |
| Total weekly visitors are above week 0 but installs and sign-ups stay flat for 4 weeks | The content is not the blocker. Stop changing videos and review the landing page and the store listing (separate issue). |

**Rules for time (all platforms):**

| Result | Do this |
|---|---|
| A week takes more than 2 hours | Drop Instagram first, then LinkedIn (platform study, section 1). |
| Two weeks in a row take more than 2 hours, without Instagram and LinkedIn | Post 1 video a week. Fewer posts at good quality (D14). |
| A post is late or missed | Skip it. Do not publish two in one day to catch up. |

**LinkedIn link test (weeks 3 to 8).** The link is in the post on weeks 3, 5 and 7 and not in the post on weeks 4, 6 and 8 (platform study, section 8). One variable: the link. If the median impressions of the link posts are less than half of the median of the no-link posts, and the 3 link posts together got fewer than 5 link clicks (a chosen start value, not a benchmark), then stop putting the link in the post and keep it in the profile only. The platform sources disagree on the size of the link penalty (platform study, section 10, assumption 2), so we read our own data.

## 8. Guardrails against gaming

A KPI that can be pushed up with tricks is useless for a test whose goal is to measure. We do not do any of these:

- **No bought views, likes, followers or comments.** No services that promise them.
- **No engagement pods or "comment to boost" groups.** No asking friends or colleagues to like or comment in a wave on publish day.
- **No giveaway, "follow to get" or "comment to get the link" mechanics.**
- **No misleading hook to raise retention.** The hook must be true to the video (voice; video-formats, section 1.2). A high north star with angry comments is not a success.
- **No deleting weak posts to improve the median.** Every published video stays in the data.
- **No moving the goalposts.** Thresholds are locked (section 7). A miss means we change tactics first (hook, length, format), not the target.
- **No personal data in the numbers.** No names or handles of commenters in the calendar. Sign-ups are one number.
- **Own visits are marked.** Our own test visits and clicks are written in the calendar notes, so they are not read as interest.
- **Quality pair.** A rise in the north star is read together with shares and the comments. If comments point out a wrong or unclear fact about storage or privacy, stop publishing that idea, check it against the brand profile, and correct it in plain words (voice, section 2).

## 9. The 8-week review

When: after the last video has its day-7 numbers (about 2027-01-21). Who: the product owner, with the calendar numbers on the table. Update this page and the platform study afterwards, and change the date.

The review compares, for each platform: referrer visits to the site per hour spent (a lower bound), the total weekly visitors against week 0, the north star against B, and the time cost (platform study, section 8). It decides these questions:

| Question | Decide by this rule |
|---|---|
| **Keep or drop LinkedIn?** | Keep if (a) no week went over 2 hours because of it, and (b) its referrer visits per hour spent are at least as high as the lowest of the three video platforms. Otherwise drop it, or keep it as repost-only (platform study, section 8). Read the comments too: a few useful replies from working engineers also count for the persona question. If the 6 posts are inconclusive, say so; extend the test for 4 more weeks only if the time held. |
| **Keep YouTube Shorts and TikTok?** | For each: keep if the median north star of weeks 5 to 8 is at or above B and the time held. If one is clearly weaker on both north star and referrer visits per hour, keep it as repost-only. Weeks 5 and 6 are Christmas and New Year weeks. Views may fall for reasons that are not about the content (assumption). Judge by the trend over 4 or more videos, not by one week. |
| **Keep Instagram Reels?** | Same rule as the other video platforms: keep if the median north star of weeks 5 to 8 is at or above its B and the time held. If it is clearly weaker on both north star and referrer visits per hour, keep it as repost-only. Instagram is the first platform dropped when a week goes over 2 hours (section 7). |
| **Refresh pillar 3 (exactly what is stored)?** | It has 3 videos in this test, and its facts run out after about 8 weeks (content pillars, section 4). If its saves and visits are at or above the other pillars' median: keep it, with new hooks on the same facts (do not repost). If they are below and no clicks came: merge its best ideas into pillar 2 or 1, or drop it. Three videos is a small sample; say that when deciding. |
| **Keep the mix (40/30/20/10)?** | Compare the pillar medians of the north star. Change the mix only if one pillar is clearly above or clearly below the others. It must be so on both platforms. Keep the demo rule: at most 1 in 10 posts shows the UI. |
| **Kdenlive time check.** | Compare the measured edit minutes with the plan (45 minutes for 2 videos, video-formats section 4.4). If weeks 5 to 8 average more than the plan, fix the template and the workflow first. If it is still too slow, test the backup (DaVinci Resolve free, video-formats section 4.1). Do the same if a watermark or license problem appears. |
| **Pay for UTM reports, or build a redirect counter?** | A product owner decision, not made here. Use the result of the free CLI test (section 5) as input. Look at the lower-bound referrer counts and at whether any platform needs per-post visits to be judged. If the answer is no, stay on the free default. |
| **Persona assumption 6.** | Write what the data says about short video and LinkedIn for this persona (persona, "Assumptions to validate"). |
| **Product Hunt and Reddit.** | Decide whether either is ready, after the Reddit rules are read by hand (platform study, section 8). |

## 10. Open points

1. **Vercel plan.** UTM reports are not available on our plan (section 5); free only, for now. Run the phone test and the free CLI test before the first post. The 8-week review decides whether to pay or build a redirect counter.
2. **Native metric names.** The names in section 3 are written from the platform study and may differ in the apps. Confirm them in week 1.
3. **Thresholds.** The 0.75 and 1.25 factors, the "half" rule and the 14 of 16 posts target are our starting values. The product owner may change them before 2026-11-23, and only then.
4. **Christmas and New Year.** Weeks 5 and 6 may have unusual numbers. The calendar moves their posts away from 24 and 31 December. We have no data on how the audience behaves.
5. **Store listing.** The week-7 demo video links to the free extension. Check that the Chrome Web Store listing is live first (the listing is "submission in progress" in the docs index).
6. **Installs by source.** The store dashboard may not show where an install came from. If it does, add it here.

# CareerOS audience persona

Type: living · Owner: product owner · Last reviewed: 2026-11-17

This is the second marketing document (issue #186, step 2 of the marketing process in [v1 discovery](../../specs/v1/00-discovery.md) D18). It builds on the [brand profile](brand-profile.md) (sections 4, 7 and 10). Later documents read it: voice (#187), platform study (#188), content pillars (#189).

## How to read this page

- This is a **descriptive profile, not a real person**. It has no name, photo or invented life story.
- It is built from public posts and articles (see [Sources](#sources)). Where a claim has no source it says **assumption, to validate**.
- **No survey, no user data.** CareerOS has no numbers about its users that we can show (brand profile, section 6). This page has no statistics for the same reason.
- Quotes are short and come from one source each. They show how people talk. They are not testimonials and they are not about CareerOS.
- Research limit: many Reddit and Blind threads could not be opened by our tools (bot checks). The evidence is mostly articles, forum posts and store reviews by working engineers. Reddit voice is a gap (see [Assumptions to validate](#assumptions-to-validate)).

## Primary persona: the working engineer preparing for technical interviews

**Label:** "The part-time interview candidate". One developer, preparing alone, on top of a full-time job. This fits D6: an individual, no teams, no B2B.

### Situation and goals

- Works a full-time job (for example 9 to 6) and studies in the evenings and on weekends. Sources describe about 90 usable minutes on a work evening ([DEV Community](https://dev.to/alex_hunter_44f4c9ed6671e/leetcode-burnout-while-working-full-time-the-sustainable-survival-guide-ch1), [Taro](https://www.jointaro.com/question/QSp1Lvrp05sHWlYU3WGR/overwhelmed-with-interview-prep/)).
- Prepares for many things at once: algorithms, system design, front-end or full-stack topics, behavioral questions, projects ([Taro](https://www.jointaro.com/question/QSp1Lvrp05sHWlYU3WGR/overwhelmed-with-interview-prep/)). In practice this means many sites: LeetCode, NeetCode, GreatFrontEnd, docs, videos (brand profile, section 4).
- Wants a steady habit they can keep for weeks or months, not one heroic push. Several sources say this directly ([Senior Path](https://seniorpath.pages.dev/articles/execution-and-communication/keeping-interview-preparation-sustainable-without-burning-out), [Medium](https://medium.com/@sandeep.kumar.ece16/interview-preparation-issues-part-2-3e23ccdcfd75)).
- Wants to know if the plan is working. They need a plain answer to "how much did I really study this week, and where?" (product problem, [v0 scope](../../specs/v0/00-product.md) section 1).

Sophistication: a working developer. They know the tools and the jargon. They read permission prompts. Assumption, to validate: they are comfortable installing a Chrome extension but careful about it.

### Jobs to be done

| Type | Job |
|---|---|
| Functional | See my real study time per day and per site, without starting a timer. |
| Functional | Check if my week matched my plan, then plan the next week. |
| Emotional | Stop guessing. Feel calm that I did enough, or know clearly that I did not. |
| Emotional | Replace guilt with a number I can trust. |
| Social | Not applicable at first. This person studies alone. Assumption, to validate: they do not want to share or compare their hours. |

### Pains and fears

- **Overload and fading effort.** A burst of intense study, then a slow decline until you stop ([Medium](https://medium.com/@sandeep.kumar.ece16/interview-preparation-issues-part-2-3e23ccdcfd75)). One author says a past prep cycle caused burnout that took about two years to recover from ([Two Pug](https://twopug.com/interview-prep-keep-at-it), read via a mirror).
- **Guilt.** One source says people feel guilty about not doing more ([DEV Community](https://dev.to/alex_hunter_44f4c9ed6671e/leetcode-burnout-while-working-full-time-the-sustainable-survival-guide-ch1)). Another describes a "guilt spiral" after a missed day ([Senior Path](https://seniorpath.pages.dev/articles/execution-and-communication/keeping-interview-preparation-sustainable-without-burning-out)).
- **Comparing with others.** Writers warn readers not to compare themselves with unsustainable schedules or peers ([DEV Community](https://dev.to/alex_hunter_44f4c9ed6671e/leetcode-burnout-while-working-full-time-the-sustainable-survival-guide-ch1), [Medium](https://medium.com/@sandeep.kumar.ece16/interview-preparation-issues-part-2-3e23ccdcfd75)). This suggests the temptation is real (our reading).
- **Not knowing where the time goes.** One article suggests a one-day honest time audit (of phone use) to see where time goes ([YeetCode blog](https://yeetcode-static.pages.dev/blog/ten-minutes-a-day)).
- **Tools that ask too much.** A reviewer of another extension complains about a broad permission warning ([Chrome Web Store reviews](https://chromewebstore.google.com/detail/gfkgelnlcnomnahkfmhemgpahgmibofd/reviews?hl=en)). Internal research only. Never name or quote this extension in posts (brand profile section 10).
- Assumption, to validate: the biggest fear is "I studied a lot and still failed". We must never speak to that fear with promises (brand profile, section 10).

### Current workarounds

| Workaround | What the sources show | What goes wrong |
|---|---|---|
| Manual timer or LeetCode timer extension | A developer built a LeetCode timer because other tools were not built into the site, were broken, or manual timers were easy to forget ([LeetCode Discuss](https://leetcode.com/discuss/general-discussion/1475597/productivity-timer-analytics-tool)). A reviewer often forgets to stop a timer ([Chrome Web Store reviews](https://chromewebstore.google.com/detail/gfkgelnlcnomnahkfmhemgpahgmibofd/reviews?hl=en)). | Forgotten, only one site, sometimes unreliable. |
| Spreadsheet | A reviewer logs problems by hand in a spreadsheet and wants the extension to do it ([Chrome Web Store reviews](https://chromewebstore.google.com/detail/gfkgelnlcnomnahkfmhemgpahgmibofd/reviews?hl=en)). | Manual work. |
| Habit grid, daily checkboxes, index cards | One author tracked prep with a daily grid and cards ([Two Pug](https://twopug.com/interview-prep-keep-at-it)). | Counts days, not hours or sites. |
| Counting weeks, not hours | One author suggests measuring weekly consistency, not total problems solved ([DEV Community](https://dev.to/alex_hunter_44f4c9ed6671e/leetcode-burnout-while-working-full-time-the-sustainable-survival-guide-ch1)). | A week "counts" with no real time behind it. |
| Screen-time apps | Not found in our sources. Assumption, to validate: some use them and dislike that study is mixed with everything else (brand profile, section 5). | Too broad, too much data. |
| Nothing | Assumption, to validate: most people only estimate from memory. | A remembered week often feels bigger than the real one (brand profile, section 5; the feeling is our premise, not a measured fact). |

### Objections to CareerOS and honest answers

Answers come from the brand profile (sections 2, 3 and 6). Do not go beyond them.

| Objection | Honest answer |
|---|---|
| "Privacy: will it watch everything I do?" | No. It counts only on sites you choose, up to 12. It stores only the site name and the start and end times. It never stores full web addresses, page titles, page content or keystrokes. It never tracks incognito windows. The code is public on GitHub. |
| "The tab permission. It sounds like it can read my tabs." | The extension asks for four permissions: `tabs`, `idle`, `alarms` and `storage`. It has no content scripts and no host permissions, so it does not read page content. The `tabs` permission is used to know the site name of your active tab. Sites you did not choose are ignored. (Say only what SEC-01 and SEC-03 say.) |
| "Another tool to remember. I already forget timers." | There is no timer to start. You study as usual. It counts while you are active and pauses after 60 seconds without keyboard or mouse input. |
| "It will count when I am not really studying." | Not fully: it pauses after 60 seconds of no input. It keeps counting while a study tab plays sound, for up to 15 minutes without input. Say this plainly. It measures active time on chosen sites, not focus or learning. |
| "Will it make me an offer-winning candidate?" | No. It measures time. It cannot promise an interview result. |
| "What about solved problems, difficulty, topics?" | Not today. It is not a course, a question bank or a coach. Do not mention the v1 LeetCode feature until it ships (brand profile, section 11). |
| "Is it free? What is the catch?" | It is free. Say only "free". No "stays free" promise. |
| "Can I leave?" | Yes. You can delete your account at any time. Data is removed right away. Encrypted backups expire within 90 days. |

### Their own words

Short phrases, one per source, to guide language. Check each against the live page before using it in public. Do not present them as quotes about CareerOS.

| Phrase | Source | Topic |
|---|---|---|
| "Feel guilty you're not doing more." | [DEV Community](https://dev.to/alex_hunter_44f4c9ed6671e/leetcode-burnout-while-working-full-time-the-sustainable-survival-guide-ch1) | Guilt |
| "measure useful consistency instead of heroic hours" | [Senior Path](https://seniorpath.pages.dev/articles/execution-and-communication/keeping-interview-preparation-sustainable-without-burning-out) | What to measure |
| "this slow decay cycle continues till you just stop." | [Medium](https://medium.com/@sandeep.kumar.ece16/interview-preparation-issues-part-2-3e23ccdcfd75) | Fading effort |
| "Work will always be demanding." | [YeetCode blog](https://yeetcode-static.pages.dev/blog/ten-minutes-a-day) | Time |
| (paraphrase) Broad permission warnings put people off. Internal research only; never name or quote the extension in posts. | [Chrome Web Store reviews](https://chromewebstore.google.com/detail/gfkgelnlcnomnahkfmhemgpahgmibofd/reviews?hl=en) | Permissions |

Words and ideas that repeat across sources (our paraphrase): consistency over intensity, burnout, guilt, "usable" time after work, overwhelmed, too many topics, forgetting the timer. Use "consistency" and "your real week". Avoid "grind".

### Where they spend time online

Hints for the platform study (#188). This is **not a decision**.

- Interview-prep communities: LeetCode Discuss, Reddit (r/leetcode, r/cscareerquestions), Blind, Taro. Seen in our searches; we could not read most Reddit and Blind threads.
- Developer blogs: DEV Community, Medium, Hashnode.
- Chrome Web Store: people compare timer and tracker extensions there and read the reviews.
- Assumption, to validate: short video (YouTube Shorts, TikTok, Reels) and LinkedIn. We have no source for how this person uses them.

### Triggers: when they would want CareerOS

- Starting a new prep cycle, for example after a layoff or before applying (assumption, to validate).
- A bad week: they feel they studied "nothing" and cannot prove it either way.
- Burnout or a long gap: they want a gentler, steady restart (sources describe fading effort and burnout).
- A plan review, for example every Sunday: "did I follow my plan?"
- Seeing a timer fail: they forgot to start or stop it again.
- Spreading prep over many sites and wanting one total.

### What we must never say to them

From brand profile section 10. In short:

- No fake numbers, user counts, "studies show", ratings or "hours saved".
- No fake people or testimonials. Never present a quote above as praise for CareerOS.
- No job-offer promises. Never "get hired" or "land FAANG".
- No attacking or naming other trackers to look better.
- No real user data in posts or screenshots. Sample data only.
- No future features, dates or prices. No "stays free".
- No "no cookies" claim. No "open source" (say "public code on GitHub").
- No privacy overstatement. Say exactly what is stored.
- No shame or pressure. Our sources show guilt is already high. Do not add to it: no "you are behind", no "grind harder", no hour targets. This follows our point of view in section 7.

### Secondary variant

None for now. Our sources are mostly about working engineers. We found no source that shows a real difference for students or career changers. Do not invent one. Revisit if #188 or real feedback shows a second group.

## Assumptions to validate

1. This person prefers a calm, numbers-only tool and does not want to share or compare hours.
2. Screen-time apps and "nothing" are common workarounds. No source found.
3. Their main fear is failing after studying a lot.
4. They are careful with extension permissions and read the Chrome Web Store page before installing. One review supports a part of this.
5. Trigger moments (new prep cycle, after a layoff, Sunday plan review).
6. Which platforms they use, and how (short video, LinkedIn). This feeds #188.
7. Students and career changers may differ. No data.
8. Reddit and Blind voice. Most threads could not be read. Read them by hand and add phrases.
9. Four of the quoted phrases were confirmed word for word on 2026-11-17 by the specialist review. The Medium phrase is mid-sentence: quote it only with that in mind. The Chrome Web Store row is now a paraphrase.
10. Ask the first real users (for example with a short, voluntary question in the dashboard or on the Chrome Web Store page). Do not publish any answer as a statistic unless the numbers are real.

## Sources

Read for this page (all public, accessed 2026-11-17):

- DEV Community, "LeetCode burnout while working full-time" — <https://dev.to/alex_hunter_44f4c9ed6671e/leetcode-burnout-while-working-full-time-the-sustainable-survival-guide-ch1>
- Senior Path, "Keeping interview preparation sustainable without burning out" — <https://seniorpath.pages.dev/articles/execution-and-communication/keeping-interview-preparation-sustainable-without-burning-out>
- Medium (Sandeep Kumar), "Interview preparation issues, part 2" — <https://medium.com/@sandeep.kumar.ece16/interview-preparation-issues-part-2-3e23ccdcfd75>
- YeetCode blog, "10 minutes a day" — <https://yeetcode-static.pages.dev/blog/ten-minutes-a-day>
- Two Pug, "Interview prep: keep at it" (read through a mirror) — <https://twopug.com/interview-prep-keep-at-it>
- Taro, "Overwhelmed with interview prep" — <https://www.jointaro.com/question/QSp1Lvrp05sHWlYU3WGR/overwhelmed-with-interview-prep/>
- LeetCode Discuss, "[Productivity] Timer & Analytics Tool" — <https://leetcode.com/discuss/general-discussion/1475597/productivity-timer-analytics-tool>
- Chrome Web Store, reviews of "LeetCode Timer" — <https://chromewebstore.google.com/detail/gfkgelnlcnomnahkfmhemgpahgmibofd/reviews?hl=en>

Found in search but not readable by our tools (not used as evidence; read them by hand):

- r/leetcode, "how do you manage studying leetcode with full time job as software engineer?" — <https://redlib.hbubli.cc/r/leetcode/comments/168pqcf/how_do_you_manage_studying_leetcode_with_full>
- r/leetcode, "Got burned out" — <https://redlib.hbubli.cc/r/leetcode/comments/1haueny/got_burned_out>
- LeetCode Discuss, "does anyone else feel guilty when they're not preparing?" — <https://leetcode.com/discuss/post/8316302/does-anyone-else-feel-guilty-when-theyre-dg6a/>
- Blind, "How do you all get time to prepare for interviews with so much work" — <https://www.teamblind.com/post/interview-prep-how-v8d0bpmj>

Internal: [brand profile](brand-profile.md), [v1 discovery](../../specs/v1/00-discovery.md), [v0 product scope](../../specs/v0/00-product.md).

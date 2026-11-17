# CareerOS platform study

Type: living · Owner: product owner · Last reviewed: 2026-11-17

This is the fourth marketing document (issue #188, step 4 of the marketing process in [v1 discovery](../../specs/v1/00-discovery.md) D18). It answers D9: the wish is "all platforms", and the choice comes from this study. It reads the [brand profile](brand-profile.md), the [persona](persona.md) and the [voice](voice.md) first. They win if this page disagrees with them. Later documents read this page: content pillars (#189), video formats (#190), goals and calendar (#191).

How to read it: facts carry a source tag like [S12]; the Sources list is at the end. A fact with no tag is marked **assumption**. Numbers are quoted only with their source and date. We never use follower counts as a benchmark.

## 1. The answer in short

**Start with two platforms: YouTube Shorts and TikTok. LinkedIn is a test slot from week 3.**

- **YouTube Shorts and TikTok** share one vertical text-and-music video. The file is made once and uploaded twice. This is the cheapest way to start on two platforms (D14).
- **LinkedIn** is a test slot from week 3: 1 post a week, only if weeks 1 and 2 stayed within the time budget. It gets the same video as a native upload, with a caption written for LinkedIn. It is the best place we found for the working-engineer persona. This is our judgment; the persona has no source for LinkedIn use (persona, "Where they spend time online"). Video is weaker than documents on LinkedIn [S18, S20], so this is a test, not a commitment.
- **Stop rule:** if a week takes more than 2 hours, drop LinkedIn first.
- **LinkedIn admin:** the product owner accepted the admin role (Q31, 2026-11-17); the page is created when the week-3 test starts (section 7).
- **Wait:** Instagram Reels (first to add, same file), then dev.to or Hashnode, Threads, X, Bluesky. **Reddit:** listen only for now. **Product Hunt:** one launch later, not part of the start set.
- **Revisit after 8 weeks of measured posts** (section 8).

Why not "all platforms": one person with free tools and spare time (D14) cannot keep quality on ten platforms. Each extra platform adds its own rules, labels, captions and checks. Two platforms with one video file is the most we are sure can be held at quality. LinkedIn is added only if the time budget allows.

## 2. Inputs and limits of this study

**Inputs (decided earlier):**

| Input | Where | What it means here |
|---|---|---|
| Faceless CareerOS brand account | D8 | No person on camera. No personal-profile tactics. |
| English only | D10 | No language split. |
| Text on screen + music; AI voice may be tested later | D13 | Video must work with sound off. Music must be licensed. |
| Free tools only; fewer posts, good quality; goal is to measure | D14 | Free scheduling. A small start set. |
| UTM links, Vercel Web Analytics, no GA4 | D25 | Every link carries `utm_*`. |
| Handle and account email are open | D19, brand profile section 13 | This page does not choose them. |
| AI labels and "Made with AI" rule | brand profile section 10 | See section 7. |

**Limits (be honest about them):**

- Our tools could not open Reddit (blocked), and could not read the help pages of LinkedIn, Meta (Instagram) and X (blocked or robots rules). So **the rules of r/leetcode and r/cscareerquestions were not read**, and some platform facts come from reputable secondary articles. Each is tagged.
- We could not open profile pages of TikTok, Instagram, X, Threads or LinkedIn. Real examples there are few (section 3). A hand check is listed in section 10.
- The persona says short-video and LinkedIn use is an **assumption, to validate** (persona, assumption 6). This study does not remove that doubt. It is the reason for the 8-week test.
- Several sources are SEO and marketing blogs. We used them only where no primary page was readable, and we say so. Where two sources disagree, we show both.

## 3. Platform by platform

Each block covers: audience, format for a faceless text video, self-promotion, links, free scheduling, examples.

### LinkedIn

- **Audience.** The persona is a working engineer in a job-related context. We have no source that this person uses LinkedIn for study content (assumption). The best sign is a direct peer: NeetCode, an interview-prep product, calls LinkedIn its second-largest social channel in a 2026 brand story. The story's numbers are self-reported, so we do not reuse them [S20].
- **Format.** Native video of 30 to 90 seconds had a benchmark engagement rate of 5.60%, behind document posts at 6.60%. The article credits van der Blom's 2025 report, LinkedIn data and Sprout Social 2026, and says 91% of viewers watch muted, so captions matter [S18]. Our text-on-screen video is already caption-first. The same article says video worked better for visibility than for clicks [S18].
- **Self-promotion.** A product page or brand post is normal on LinkedIn. We found no formal rule against it. (Assumption: LinkedIn's own policy was not readable.)
- **Links.** Sources say a link in the post body lowers reach. They disagree on the size.
  - One article says about 60% and names no study. It also cites an analysis of 1.3 million posts with a median drop of 18.8% for one external link [S19].
  - Another says about 60%. It adds that the "link in first comment" trick is also penalized since early 2026 [S18].
  - Both are secondary. Treat it as "a penalty is likely; size unknown". We test it (section 8).
- **Free scheduling.** Yes, native and free for profiles and company pages: 10 minutes to 3 months ahead, one post at a time, no first-comment scheduling [S17].
- **Examples.** NeetCode on LinkedIn (see [S20]): faceless, utility posts as interview revision material, carousels, cheat sheets and infographics. It says video was tested first and did not suit the platform as well. No video examples from faceless accounts were verified.
- **Watch out.** A faceless brand needs a Company Page. A Company Page needs a personal LinkedIn account as admin (assumption, unverified). The admin is not visible on posts. The product owner accepted the admin role (Q31, 2026-11-17); the page is created when the week-3 test starts. See section 7.

### YouTube Shorts

- **Audience.** No source on our persona's use of Shorts (assumption). An interview-prep channel on YouTube: NeetCode (@NeetCode), whose About text points to neetcode.io [S31]. We could not confirm if it posts Shorts.
- **Format.** Up to 3 minutes; any upload of 3 minutes or less counts as a Short [S1, S3]. Our videos are shorter. Text-first, music-bed videos fit.
- **Self-promotion.** A brand channel is normal. The July 2025 "inauthentic content" update is a monetization rule. It targets mass-produced, repetitive channels, for example slideshows that share the same narration [S5]. We will not monetize. Still, vary the content so the channel does not look like one template with swapped words.
- **Links.** There is no clickable link in Shorts descriptions or comments. YouTube says this is to "reduce spam and scam attempts" [S2].
  - The link lives in the channel profile. Channel profile links are clickable, up to 14 [S2].
  - A Short can show one "related video" link to another video on the same channel [S6].
  - So the traffic path is: video, then channel page, then the profile link.
- **Free scheduling.** YouTube Studio has scheduling (assumption; the help page could not be read).
- **AI rules.** YouTube asks creators to disclose AI content that "seems realistic", including AI music that is the main focus of the video. Captions and cloning your own voice are listed as minor [S4]. Our royalty-free music and text need no label.
- **Examples.** NeetCode (above, [S31]). Short-form examples not verified.

### TikTok

- **Audience.** A 2026 SIGCSE paper analyzed 100 TikTok videos about computing careers and found useful content on daily work, internships and the tech industry. It does not measure how many students or engineers use TikTok for this [S11]. So: the content exists, our persona's use is **assumption**.
- **Format.** Short vertical video. Text-on-screen fits. (Assumption: no platform source read.) Maximum length not checked, because sources conflict. Our videos are 20 to 45 seconds.
- **Self-promotion.** Brand accounts are allowed. Business accounts have a music rule: they are limited to commercially licensed sounds. Sources differ on whether this applies to all business accounts or only verified ones [S8, S10]. Our music is licensed royalty-free anyway (D13).
- **Links.** Link in bio (assumption; no primary page read).
  - One bio link per account.
  - So attribution is per platform, not per post.
- **Free scheduling.** Desktop web scheduler is free, with a Business account. Sources differ on how far ahead (10 or 30 days) and on whether 10,000 followers are needed instead of a Business account. A scheduled post cannot be edited, only deleted and re-uploaded [S8, S9]. Verify at account creation.
- **AI rules.** TikTok requires a label for AI content with realistic images, audio or video, using its AI label or a caption or sticker [S7, 2023]. Text and royalty-free music: none needed.
- **Examples.** Not verified (profile pages blocked). See section 10.

### Instagram Reels

- **Audience.** No source for our persona (assumption).
- **Format.** Reels fit the same vertical file. Mosseri said in 2024 that your own logo on a Reel is fine; Reels showing other platforms' logos tend not to be recommended [S15]. Never upload a video with another app's watermark.
- **Originality.** A trade-news headline from 2026-04-30 says Instagram stopped recommending content from aggregators of reposted content [S34]. We could not read the article or the policy, so treat this as unverified. Our own content is original, but keep the file clean.
- **Links.** The Help Center lists the bio link as a clickable place [S16]. Attribution per platform only.
- **Free scheduling.** Reels can be scheduled in the app with a Creator or business account, about a month ahead [S14].
- **AI rules.** A realistic AI voiceover or AI vocals must be labeled before sharing [S12]. Separately, accounts that feature AI-generated people need an "AI-generated profile" label or lose reach [S13]. Our faceless account shows no AI person, so this does not apply. Keep it that way.
- **Examples.** Not verified.
- **Verdict.** Zero production cost once the master exists, but one more account, caption set and check. First to add.

### X

- **Audience.** Developer presence is likely (assumption). No source read.
- **Links.** Unclear. X's product head said on 2026-07-28 that links no longer need to go in replies. Musk replied on 2026-07-29: "We haven't for over a year." PPC Land says this is unverified, and its analysis of the open-sourced code found that linked posts tend to get lower predicted engagement [S21].
- **Format.** Text first; video works but is not the core format (assumption).
- **Scheduling.** Native scheduling exists (assumption; help page could not be read).
- **Examples.** Not verified (blocked).

### Threads

- **Audience.** 400 million monthly active users in August 2025 (TechCrunch via Buffer). Buffer has no tech-specific data. Link posts earn less median engagement than image posts [S22]. Persona fit: assumption.
- **Scheduling.** Meta announced web scheduling on 2024-08-15 as "coming soon" [S23]. Current status not verified.
- **Examples.** Not verified.

### Bluesky

- **Audience.** TechCrunch (2026-08-11, Similarweb data): the mobile app's quarterly average fell from about 22.1 million monthly users in Q4 2024 to about 10.7 million in Q2 2026. About 46 million accounts are registered. Bluesky publishes no official active-user figure [S24]. Developer presence is likely but small (assumption).
- **Scheduling.** No native scheduler that we know of (assumption).
- **Examples.** A handle search for "leetcode" returned individuals, not brands. One real example of a similar maker: `muragekibicho.bsky.social`, who describes building leetarxiv.com, a LeetCode-style site [S33].

### Reddit

- **Audience.** The strongest persona fit: r/leetcode and r/cscareerquestions are named in the persona's hints, though our tools could not read most threads (persona, "Where they spend time online").
- **Self-promotion.** Reddit's guide (Reddiquette) says you can post your own content within reason, and suggests about 1 in 10 of your posts be your own [S25]. Moderators set the real rules per subreddit, and a faceless new brand account that only promotes is the typical ban case [S26, third-party article, treat with care]. **We did not read the rules of the two subreddits.** Until someone reads them by hand, no posting.
- **Format.** Discussion and text. Video is not the format.
- **Use now.** Listen. Read threads to fill the persona gap (persona, assumption 8). Do not post as the brand.
- **Examples.** Not verified (blocked).

### dev.to and Hashnode

- **Audience.** Named in the persona hints. Our persona sources include dev.to articles on LeetCode burnout (persona, Sources).
- **Format.** Written articles, not video. More effort per post than a short video (assumption).
- **Self-promotion.** The dev.to Code of Conduct page does not mention promotion; the Terms of Service were not read [S28]. It asks authors to disclose AI help [S28].
- **Links.** Posts can link out (assumption).
- **Examples (verified, dev.to API, 2026-11-17).** Brand-style accounts publish interview-prep content with links to their sites: `useastra` ("Mass Recruiter or Product Company? How 28 Hiring Processes Differ", 2026-10-31), `fourleaf` ("Application manager interview questions, and what each one tests", 2026-11-11), and `blixwerk_7cdf1919283d2fab` (job-search posts that also promote a job-tracker template, 2026-10-28) [S29]. Also an individual: `devanshu_patil` (algorithm articles) [S29].

### Product Hunt (one-off)

- **What it is.** A launch day, not a channel. You can schedule up to 30 days ahead. The product must work in production, including sign-up. The help page says: "Ask for feedback, never for upvotes" [S27].
- **Fit.** CareerOS is a free Chrome extension with a dashboard. A launch could bring early feedback. Brand profile rules still apply: no user counts, no fake proof.
- **Example.** WakaTime, a developer time-tracking product, has launches by its maker on Product Hunt [S30].
- **When.** After the start set has run and the product has real users (not before the 8-week review). Assumption.

## 4. Field scan: who else is there

Public data only. No follower counts. This is a small, hand-picked field, not a full audit.

| Who | Type | Where we saw them | What they do |
|---|---|---|---|
| NeetCode | Aspirational: interview-prep brand | LinkedIn [S20], YouTube [S31] | Utility content, carousels, cheat sheets. Faceless on LinkedIn. Internal research only; never named in posts. |
| WakaTime | Adjacent: developer time tracking | Product Hunt [S30] | Launches of features and yearly "most used languages" reports by the maker. |
| useastra, fourleaf, blixwerk | Adjacent: job and interview content brands | dev.to [S29] | Data-style and Q&A articles, each with a link to its own site. |
| muragekibicho | Similar maker | Bluesky [S33] | Builds a LeetCode-style site; individual account. |

**White space (assumption, small sample).** In what we saw, nobody leads with "measure your real study week, and say exactly what is stored". NeetCode leads with revision material. The dev.to brands lead with hiring data or job-search tips. A calm, number-first, privacy-exact angle looks open. Pillars (#189) decide how to use it. Do not copy any account; do not name or mock any of them in posts (brand profile section 10).

## 5. Scoring

Scale 1 to 5 (5 is best). **Effort** is scored so that 5 means little effort. **Risk** is scored so that 5 means low risk. Scores are our judgment from the facts above; the weakest inputs are marked "assumption" in the text. Equal weights.

| Platform | Persona fit | Format fit (faceless text video) | Effort, free tools | Link and traffic | Risk | Total |
|---|---|---|---|---|---|---|
| **YouTube Shorts** | 3 | 5 | 5 | 2 | 4 | **19** |
| **LinkedIn** | 4 | 3 | 4 | 3 | 3 | **17** |
| **TikTok** | 3 | 5 | 4 | 2 | 3 | **17** |
| Instagram Reels | 2 | 4 | 4 | 2 | 3 | 15 |
| dev.to / Hashnode | 4 | 1 | 2 | 4 | 4 | 15 |
| X | 2 | 2 | 4 | 3 | 3 | 14 |
| Bluesky | 2 | 2 | 3 | 3 | 4 | 14 |
| Threads | 2 | 2 | 3 | 2 | 4 | 13 |
| Reddit | 5 | 1 | 2 | 2 | 1 | 11 |
| Product Hunt | one-off launch; not ranked | | | | | |

Notes on the scores:

- **YouTube Shorts** wins on format and effort: 3 minutes allowed, the file is reused, no music-account rule. Its link score is low because Shorts links are not clickable.
- **LinkedIn** ties with TikTok. It has the best persona fit we could argue and a real peer, but video is not its strongest format, and the link penalty is uncertain.
- **TikTok** has the right format and some sign that tech-career content lives there, but persona use is assumption and account rules are the most detailed (business music, labels).
- **Reddit** has the best persona fit and the worst risk. Rules unread, and a brand account would be seen as an ad. Wait.
- **dev.to** is a good fit for people and links, but it is writing, not our video format. A later option, not a start platform.
- A score of 3 for a platform is not "bad". It means "unproven for us".

## 6. Recommended start set and what waits

**Start set (D14: one person, free tools): YouTube Shorts and TikTok. LinkedIn is a week-3 test slot.**

| Platform | Role | Why now |
|---|---|---|
| YouTube Shorts | Main short-video home | Best total score. Longer life of a video on a channel page (assumption). Free tools. |
| TikTok | Same video, second audience | Costs one upload. Gives a second read on whether short video works for this persona. |
| LinkedIn (test slot, from week 3) | Professional reach; tests the persona assumption | Best persona argument we have; native scheduling is free [S17]. Video is weaker than documents here [S18, S20]. 1 post a week. |

**Cadence (assumption; #191 sets the final plan):** 2 new videos per week, each posted on YouTube Shorts and TikTok. From week 3, one of them also goes to LinkedIn, only if weeks 1 and 2 stayed within the time budget. **Stop rule: if a week takes more than 2 hours, drop LinkedIn first.** If it still takes too long, post 1 video per week. Fewer posts at good quality matters more than volume (D14).

**Why the others wait:**

- **Instagram Reels:** same file, but one more account, one more caption set and the AI-label and originality rules to watch. First to add if the 8-week review shows spare time. Add only if the extra upload takes under 10 minutes (assumption).
- **dev.to / Hashnode:** needs written articles. A later pillar, maybe one article per month with the same idea as a video.
- **X, Threads, Bluesky:** text-first, no proven persona fit, and in Bluesky's case a shrinking active base [S24]. Link behavior on X is disputed [S21].
- **Reddit:** rules unread; risk of a ban. Listen only. If a human later joins in, he or she follows each subreddit's rules and speaks as a person, not as the brand. Brand posts only if a rule read by hand allows it.
- **Product Hunt:** after real users exist. One launch, with no vote asking [S27].

## 7. Account setup notes (no account is created by this study)

The product owner decides the handle and the email (D19, brand profile section 13).

- **Handle.** Use the **same handle on every platform**. Check by hand if `careeros` is free on all platforms in use. Prepare 2 or 3 fallbacks before creating anything, so the accounts still match. Display name: "CareerOS" (voice: one word, capital C and OS). Handles and URLs may be lowercase.
- **Account type.** TikTok: a Business account, because the free desktop scheduler needs it [S8, S9]. Instagram (later): Creator or business, for scheduling [S14]. LinkedIn: a Company Page. **Admin:** a Company Page needs a personal LinkedIn account as admin (assumption, unverified). It is not visible on posts. The product owner accepted the admin role (Q31, 2026-11-17); the page is created when the week-3 test starts.
- **Avatar and banner.** CareerOS has no logo yet (#195). Do not make accounts with a temporary avatar if the logo can come first. If one is needed, use plain text on the brand blue. Never an AI-generated person (this is also what Instagram's "AI-generated profile" rule is about [S13]).
- **Bio text (all platforms).** Use the short form from the voice guide. Example: "Free Chrome extension that counts your study time on the sites you choose." No emoji, no hype words, no "stays free", no result promises.
- **Bio link with UTM.** Pattern from the voice guide:
  `https://careeros-taupe.vercel.app/?utm_source=<platform>&utm_medium=social&utm_campaign=bio`
  Use `youtube`, `tiktok`, `linkedin` for `utm_source`. A bio link is the same for every post, so **per-post attribution is not possible from the bio link**. Per-post results come from each platform's own analytics. Platform totals come from Vercel Web Analytics (D25).
- **Where the link goes.**
  - YouTube: channel profile links, not the Short description [S2].
  - TikTok: bio link (assumption).
  - LinkedIn: the post carries the link only in the posts chosen for the link test (section 8); the Company Page also has the website field (assumption).
  - On the video's last screen, say "Free Chrome extension. CareerOS." and "Link in profile" where the platform has no clickable link in the post (voice section 5).
- **AI labels.** Follow the brand profile (section 10): use the platform's own AI label when it is offered, and add "Made with AI" to the caption when a post uses an AI voice or AI images.
  - **Now (text and royalty-free music):** no label needed by the platforms' rules we read [S4, S7, S12]. Keep the music licence on file.
  - **When an AI voice is tested (D13):** switch the label on in **all three** apps and add "Made with AI". YouTube lists cloning your own voice as minor, but a realistic AI voice on TikTok and Instagram must be labeled [S4, S7, S12]. One rule for all is simpler and safer.
- **Music.** Use royalty-free or licensed tracks, and keep the licence for each. TikTok Business accounts are limited to commercially licensed sounds [S8, S10]. Whether a licence that covers social video also covers a track baked into a video file on all three apps is not verified (assumption). #190 picks the source.
- **Hashtags.** Brand profile: 3 to 5 topic hashtags, only where the platform uses them. We read no platform source that sets a different count, so keep 3 to 5 on all three (assumption).

## 8. Measure, and when to revisit

D14 says the goal is to measure. #191 sets the targets. This page sets the checks.

- **Before the first post:** confirm that Vercel Web Analytics shows `utm_*` values on our plan (assumption; not verified). If it does not, D25 needs a fix before launch.
- **Weekly (10 minutes):** read each platform's own analytics: views, watch time or retention, saves or shares, profile or link clicks. Write the numbers in the calendar outside the repo (D17). Never publish them as statistics unless real.
- **LinkedIn link test:** in weeks 3 to 8, post the same kind of video with the link in the post on some weeks and without on others (link only in the profile). Compare reach and visits with `utm_source=linkedin`. One variable, one change at a time.
- **Revisit trigger: after 8 weeks of measured posts (about 16 videos), or earlier if a platform costs more than 2 hours a week.** The review compares, for each platform: visits to the site from UTM links per hour spent, and views and retention per video. Set the thresholds in #191 before the first post, not after seeing the numbers.
- **What the review decides:**
  1. Drop the weakest platform, or keep it as repost-only.
  2. Add one from the waiting list. Reels first. dev.to if the persona's reading habits show up in the data.
  3. Fix the persona assumption 6 with what we saw (persona, "Assumptions to validate").
  4. Decide whether Product Hunt is ready, and whether any Reddit step is safe after the rules are read.
- Update this page at that review, and change the date.

## 9. One vertical video, many apps

Make **one master file**, then change only what each app needs.

**The master**

- Vertical 9:16, 1080 x 1920 (TikTok recommends this size [S9]; YouTube accepts up to 1080p [S1]).
- 20 to 45 seconds (assumption; #190 sets the format). Allowed lengths are far above this: Shorts up to 3 minutes [S1, S3], LinkedIn native video best at 30 to 90 seconds [S18].
- Text on screen follows the voice guide, section 5: one idea per screen, 3 to 7 words a line, "Sample data" label, text away from the edges and the app buttons, sound-off ready.
- Music baked into the file, royalty-free, licence kept.
- **No watermark** from any app. Export the master from the editor, not from a platform. Instagram tends not to recommend Reels showing other platforms' logos [S15].
- Same file name pattern for all uploads, for example `2026-12-03-real-week.mp4` (assumption; any clear pattern works).

**What changes per app**

| Part | YouTube Shorts | TikTok | LinkedIn |
|---|---|---|---|
| Title | Short title with the topic in plain words | none or the first line of the caption | none |
| Caption | 1 to 3 plain lines, 3 to 5 hashtags | 1 to 3 plain lines, 3 to 5 hashtags | Rewritten, 3 to 6 short lines, 3 to 5 hashtags |
| Link | Not in the description (not clickable); channel profile link | Bio link | Link in the post only in the test weeks |
| Captions or alt text | Same text as the screen text | Same | Add a text version for screen readers |
| AI label | Only if the rule applies (section 7) | Same | Same |
| Schedule | Studio (assumption) | Desktop web scheduler | Native scheduler [S17] |

Rules: write the caption for each app; do not paste the same caption on all three. Keep the **idea** the same. Run the voice checklist (voice, section 7) once per post. If you edit the video for one app, re-export the master and re-upload everywhere.

**Weekly batch (assumption, about 2 hours):** write and edit 2 masters; schedule them on YouTube Shorts and TikTok (LinkedIn from week 3); spend 10 minutes on analytics; reply to comments in plain words (voice, section 2).

## 10. Assumptions and open points

Assumptions to validate (the specialist review and the 8-week review should check them):

1. Our persona uses LinkedIn, YouTube Shorts and TikTok for study content (persona assumption 6). Not sourced.
2. LinkedIn link penalty size. Sources disagree [S18, S19].
3. TikTok scheduling limits (10 vs 30 days; Business account vs 10,000 followers) and which accounts have the commercial-music rule [S8, S9, S10].
4. A baked-in royalty-free track is accepted by all three apps. Not verified.
5. A LinkedIn Company Page needs a personal account as admin. Not verified. The owner accepted the role (Q31, 2026-11-17).
6. Scheduling in YouTube Studio, X and Threads, and no native scheduling on Bluesky. Not verified.
7. Vercel Web Analytics shows UTM values on our plan. Not verified.
8. Cadence of 2 videos a week and 20 to 45 seconds per video.
9. The rules of r/leetcode and r/cscareerquestions. **Not read.**
10. Real examples of faceless interview-prep video accounts on TikTok, YouTube Shorts and Instagram. **Not found by our tools.**

**Hand check (about 30 minutes, product owner or specialist):**

1. Read the rules in the sidebar of r/leetcode and r/cscareerquestions; copy the self-promotion rule into this page with the date.
2. On TikTok, YouTube Shorts and LinkedIn, search "leetcode", "coding interview", "interview prep" and "study plan". Note 3 accounts per platform that post text-on-screen or faceless content: what they post, how often, how they use links. Link them here. Do not copy.
3. Check on each platform that the handle is free, and read the current AI-label setting in the upload screen.

**Open for the product owner (D19):** handle, account email, custom domain in bios if ready. The LinkedIn admin question is closed (Q31, 2026-11-17).

## Sources

All accessed 2026-11-17. "Secondary" means a news or marketing article, used where the primary page could not be read.

- [S1] YouTube Help, Shorts: <https://support.google.com/youtube/answer/10059070>
- [S2] YouTube Help, clickable links policy: <https://support.google.com/youtube/answer/13748639>
- [S3] Social Media Today, 3-minute Shorts for all users (2025-01-09), secondary: <https://www.socialmediatoday.com/news/youtube-expands-3-minute-shorts-to-all-users/736967/>
- [S4] YouTube Help, disclose altered or synthetic content: <https://support.google.com/youtube/answer/14328491>
- [S5] Social Media Today, YouTube clarifies inauthentic content (effective 2025-07-15), secondary: <https://www.socialmediatoday.com/news/youtube-clarifies-monetization-update-inauthentic-repeated-content/752892/>
- [S6] Search Engine Journal, related video link in Shorts (2023-09-04), secondary: <https://www.searchenginejournal.com/youtube-adds-shorts-links-limits-links-elsewhere/495463>
- [S7] TikTok Newsroom, new labels for AI-generated content (2023-09-19): <https://newsroom.tiktok.com/new-labels-for-disclosing-ai-generated-content?lang=en>
- [S8] Buffer, how to schedule TikTok posts, secondary: <https://buffer.com/resources/how-to-schedule-tiktok-posts/>
- [S9] Adam Connell, schedule TikTok posts, secondary: <https://adamconnell.me/schedule-tiktok-posts/>
- [S10] Social Media Today, TikTok music rules for businesses (2020-05-11), secondary: <https://www.socialmediatoday.com/news/tiktok-changes-rules-on-music-usage-by-businesses/577734/>
- [S11] SIGCSE TS 2026, "Navigating Computing Careers: TikTok's Potential Role as an Informal Resource" (2026-02-20): <https://sigcse2026.sigcse.org/details/sigcse-ts-2026-Papers/57/Navigating-Computing-Careers-TikTok-s-Potential-Role-as-an-Informal-Resource>
- [S12] Instagram Help, AI labels: <https://help.instagram.com/761121959519495>
- [S13] MediaPost, Instagram "AI-generated profile" label and reach (2026), secondary: <https://mediapost.com/publications/article/417580/instagram-limits-reach-for-creator-profiles-withou.html>
- [S14] Buffer, how to schedule Instagram posts, secondary: <https://buffer.com/resources/how-to-schedule-instagram-posts/>
- [S15] Social Media Today, Mosseri on your own logo on a Reel (2024-10-23), secondary: <https://www.socialmediatoday.com/news/instagram-clarifies-that-including-your-own-logo-on-a-reel-is-ok/730852/>
- [S16] Instagram Help, where links can be clicked: <https://help.instagram.com/1625290947832099>
- [S17] Buffer, how to schedule LinkedIn posts, secondary: <https://buffer.com/resources/how-to-schedule-linkedin-posts/>
- [S18] Dataslayer, LinkedIn algorithm 2026 (2026-02-12, updated 2026-07), secondary: <https://dataslayer.ai/blog/linkedin-algorithm-february-2026-whats-working-now>
- [S19] Bulldog Reporter, "The LinkedIn link tax" (2026-08-26), secondary: <https://www.agilitypr.com/pr-news/social-media-influencer-marketing/the-linkedin-link-tax-why-sharing-your-blog-is-costing-you-60-percent-of-your-audience/>
- [S20] Influencer Marketing Hub, "How NeetCode Rebranded Technical Interview Prep on LinkedIn" (2026-02-17, a brand story with self-reported figures): <https://influencermarketinghub.com/how-neetcode-rebranded-technical-interview-prep-on-linkedin/>
- [S21] PPC Land, X link penalty statements (2026-07-28 and 2026-07-29), secondary: <https://ppc.land/x-drops-year-old-link-penalty-musk-tells-zuckerberg-on-platform/>
- [S22] Buffer, Threads stats (user figure from TechCrunch, 2025-08-12), secondary: <https://buffer.com/resources/threads-stats/>
- [S23] MacRumors, Threads scheduling announced (2024-08-15), secondary: <https://www.macrumors.com/2024/08/15/threads-analytics-post-scheduling>
- [S24] TechCrunch, Bluesky active user base (2026-08-11): <https://techcrunch.com/2026/08/11/blueskys-active-user-base-is-shrinking-as-its-focus-expands-beyond-the-app/>
- [S25] Reddit Help, Reddiquette: <https://support.reddithelp.com/hc/en-us/articles/205926439-Reddiquette>
- [S26] RedShip, Reddit self-promotion rules 2026 (third-party blog; treat with care): <https://redship.io/blog/reddit-self-promotion-rules-2026>
- [S27] Product Hunt Help, build your product page and launch: <https://help.producthunt.com/en/articles/17834537-4-build-your-product-page>
- [S28] DEV Community, Code of Conduct: <https://dev.to/code-of-conduct>
- [S29] DEV Community API, tag `interviewprep` (read 2026-11-17): <https://dev.to/api/articles?tag=interviewprep&top=30&per_page=8>; articles: <https://dev.to/useastra/mass-recruiter-or-product-company-how-28-hiring-processes-differ-33fl>, <https://dev.to/fourleaf/application-manager-interview-questions-and-what-each-one-tests-10p9>, <https://dev.to/blixwerk_7cdf1919283d2fab/applied-to-100-jobs-no-reply-the-pub-quiz-tiebreaker-3k88>, <https://dev.to/devanshu_patil/bit-manipulation-tricks-for-competitive-programming-and-technical-interviews-3ao2>
- [S30] Product Hunt, maker activity for WakaTime's maker: <https://www.producthunt.com/@alanhamlett/activity>
- [S31] YouTube, NeetCode channel: <https://www.youtube.com/@NeetCode>
- [S34] Tubefilter, Instagram and reposted content (2026-04-30), secondary; only the headline was seen, the page text could not be read: <https://tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator>
- [S33] Bluesky public API, actor search "leetcode" (read 2026-11-17): <https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=leetcode&limit=10>; profile: <https://bsky.app/profile/muragekibicho.bsky.social>

Internal: [brand profile](brand-profile.md), [persona](persona.md), [voice](voice.md), [v1 discovery](../../specs/v1/00-discovery.md).

Not readable by our tools, so not used as evidence: Reddit (r/leetcode and r/cscareerquestions rules), LinkedIn, Meta Business Suite and X help pages, TikTok, Instagram, X, Threads and LinkedIn profile pages.

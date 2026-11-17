# CareerOS brand profile

Type: living · Owner: product owner · Last reviewed: 2026-11-17

This is the first marketing document (issue #185, step 1 of the marketing process in [v1 discovery](../../specs/v1/00-discovery.md) D18). Every later marketing document and every post reads it first: persona (#186), voice (#187), platform study (#188), content pillars (#189), video formats (#190), goals and calendar (#191).

Sources of truth: [v1 discovery](../../specs/v1/00-discovery.md) (D1–D26), [product scope](../../specs/v0/00-product.md), [landing content](../landing/content.md), [security and privacy](../../specs/v0/07-security-privacy.md) (SEC-01), [Chrome Web Store listing](../chrome-web-store/listing.md), [design system](../design-system.md). If this page and a spec disagree, the spec wins and this page is fixed.

## 1. Positioning in one line

**CareerOS measures your interview-prep study time automatically, only on the sites you choose, and keeps everything else private.**

## 2. What CareerOS is

- A free Chrome extension (Chrome Web Store, version 0.2.3) and a web dashboard at https://careeros-taupe.vercel.app.
- It counts study time on the sites you mark as study sites, for example `leetcode.com` or `neetcode.io`.
- It shows that time by day and by site, week by week or month by month.
- It works without a timer. You study as usual; it counts while you are active.
- Its code is public on GitHub.

## 3. What CareerOS is not

- Not a course, a question bank or a coach. It does not teach; it measures.
- Not a screen-time or productivity tracker for your whole day. Sites you did not choose are ignored.
- Not a tool for teams, bootcamps or mentors (D6). It is for one person.
- Not a job-offer machine. It cannot promise an interview result.
- Not (today) a tracker of solved problems, difficulty or topics. v1 adds only time per LeetCode problem, and only if you turn it on (D11, D16).

## 4. Audience (short)

One person: a developer preparing for technical interviews (D6). They study on many sites: LeetCode, NeetCode, GreatFrontEnd, docs and videos. They want to know how much they really studied this week, and where. They care about privacy and they dislike tools that watch everything.

The full persona comes in #186.

## 5. The problem and the promise

**Problem.** Interview prep is spread over many sites. Manual timers get forgotten. Screen-time tools mix study with everything else and collect much more data than needed. So people guess, and a remembered week often feels bigger than the real one.

**Promise.** Pick your study sites once. Study as usual. See your real week: time per day and per site. Nothing else is tracked.

## 6. Proof points we can honestly claim

Only true, checkable facts. Each one comes from a spec or a public page.

| Claim | Source |
|---|---|
| Free. No paid plan today. | Landing FAQ; D22 |
| On the Chrome Web Store | [Listing](https://chromewebstore.google.com/detail/pddbflgidjmnhidineoejneeipaicgek) |
| Code is public on GitHub (say "public code", not "open source": there is no license) | Landing content §6 |
| Counts only on sites you choose, up to 12; subdomains included | TRK-03, DATA-01 |
| Pauses after 60 seconds without keyboard or mouse input | TRK-05 |
| Keeps counting while the study tab plays sound, for up to 15 minutes without input | TRK-05, TRK-06 |
| Stores only the site name and start and end times | SEC-01 |
| Never stores full web addresses, page titles, page content or keystrokes | SEC-01 |
| No content scripts; permissions are only `tabs`, `idle`, `alarms`, `storage` | SEC-01, SEC-03 |
| Never tracks incognito windows | SEC-01 |
| No ad trackers | SEC-15 |
| Works offline and uploads later | SYNC-01..08 |
| Works on more than one computer; the dashboard adds them up | Landing FAQ |
| Delete your account anytime; data is removed right away (encrypted backups expire within 90 days) | DASH-14, landing FAQ |
| Sign in with Google or GitHub | AUTH |

Do not use: user counts, ratings, reviews, testimonials, accuracy numbers, or "hours saved". We have none we can show.

## 7. Point of view

These are the beliefs our content stands on.

1. **You can only steer what you measure.** A measured week beats a remembered week.
2. **Steady beats heroic.** Several normal days add up and are easier to keep than one marathon Sunday.
3. **Privacy is not a feature to trade.** A study tracker should know less, not more. We say exactly what we store.
4. **Plain numbers, no drama.** Time per day and per site is enough to plan the next week.

What we reject: "grind 12 hours a day" culture; tools that collect everything "just in case"; the idea that more hours alone guarantee an offer.

## 8. How we sound (basics)

The full voice comes in #187. Until then:

- Clear, calm, confident. Short sentences. Second person ("you").
- Specific numbers instead of adjectives ("pauses after 60 seconds", not "smart idle detection").
- No hype words ("revolutionary", "supercharge", "10x"). No exclamation marks.
- English only (D10).

## 9. Social presence (decided)

- A faceless **CareerOS brand account**; no personal face (D8).
- English only (D10).
- Videos start as **text on screen + music**, no voice. An AI voice may be tested later (D13).
- **Free tools only** at the start. Fewer posts, good quality, measured (D14).
- Platforms are chosen by the platform study (D9, #188).
- Every social link carries `utm_*` parameters; no GA4 (D25).

## 10. Things we will never say or do

- **No fake numbers.** No invented stats, user counts, study results or "studies show".
- **No fake people.** No fake testimonials, reviews or quotes. No AI avatar presented as a real user.
- **No job-offer promises.** Never "get hired", "land FAANG", or any guaranteed result.
- **No attacking competitors.** We may explain how CareerOS works; we do not mock or name others to look better.
- **No personal data.** Never show real user data, emails or browsing in posts or screenshots. Sample data only, labeled as sample.
- **No future promises.** No features, dates or prices that are not shipped. A paid plan may come later (D5, D23); we do not hint at what it will be.
- **No "no cookies" claim.** The dashboard uses session cookies for sign-in.
- **No "open source" claim.** Say "public code on GitHub".
- **No privacy overstatement.** Say exactly what is stored (section 6). When LeetCode time per problem ships, it stores the problem name from the address, LeetCode only, and only if you turn it on (D11, D16). Update this page then.

## 11. Coming in v1 (say only after it ships)

- Time per LeetCode problem, from the address only. Off by default; you turn it on in Settings (D11, D16, D20).
- It stays free, like everything free today (D22).

Until the release is live, posts do not mention it.

## 12. Visual basics

Full rules live in the [design system](../design-system.md). For marketing:

- **Landing page:** dark only, with its own small palette; headings in Mona Sans.
- **Product (popup and dashboard):** shared tokens in `packages/shared/theme/tokens.css`, light and dark. Primary color is a blue (`oklch(0.5 0.17 265)` light, `oklch(0.72 0.14 265)` dark).
- **Store assets:** icon, screenshots and promo tiles in `docs/chrome-web-store/assets/`.
- **Rules to keep:** contrast at least WCAG AA; status is never shown by color alone; durations in the app format (`45m`, `1h 05m`); sample data only.
- **Accessibility:** captions or on-screen text on every video (our videos are text-first anyway); alt text on every image.

## 13. Open (product owner)

1. **Social handle and account email.** Which name (`@careeros`?) and which email: brand Gmail or domain email (D19).
2. **Custom domain.** Use it in bios and links if ready (D19).
3. **Public "stays free" line.** May posts say "everything free today stays free" (D22), or only "free"?
4. **AI disclosure.** How we label AI-made music, images or a future AI voice (D13).
5. **Emoji and hashtag policy.** For example: no emoji, 3 to 5 topic hashtags. To confirm in #187.
6. **Example posts.** 3 to 5 posts you like and 1 to 2 you dislike, with one line on why.
7. **Pronunciation of "CareerOS".** For a future AI voice: "career O S" or "career-oss"?
8. **Logo for social avatars.** Use the store icon (`icon-128.png`) or a new mark?

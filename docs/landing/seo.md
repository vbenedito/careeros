# Landing page — SEO plan (#98)

Status: **Decided** (tech lead, by delegation from the product owner) · 2026-11-10 · Part of #102.

## 0. How this plan was made

- **Search data (Ubersuggest, 2026-11-10):** volume and difficulty for 30 candidate keywords, in a saved Ubersuggest list "CareerOS landing" (§2).
  - Volumes are **global** monthly Google searches.
  - SEO difficulty is Ubersuggest's 0–100 score (Moz-based, US). It was measured for the 4 strongest candidates, the free plan's quota for this month.
- **Semrush:** connected, but the account has no API units, so it returned no data. Not needed for this plan.
- **Also done here:**
  - a live look at what ranks for each candidate search (§1);
  - a review of competitors' pages (`references.md`);
  - keyword clustering by search intent;
  - on-page, technical and AI-search checklists.
- **After launch:** Google Search Console and Bing Webmaster Tools (both free) show the real searches that bring visitors, and they drive the next copy changes. A `vercel.app` address can be verified now with a meta tag; the custom domain gets its own property when it arrives.

## 1. What ranks today (live searches, 2026-11-10)

| Search | Who ranks | What it means for us |
|---|---|---|
| study time tracker chrome extension | Almost all Chrome Web Store listings (StudyTimer Pro, Study Sync, Study tracker…), one Toggl blog post | People looking for a **tool** land on store listings. Our Chrome Web Store listing will be as important as the landing page; plan its title and description with the same keywords |
| track time spent on leetcode / leetcode time tracker | Store listings of small LeetCode-only timers (one has about 36 users and no ratings), GitHub repos | Open niche, weak competitors. "LeetCode" is the most specific term people use |
| coding interview preparation tracker | Spreadsheet-style trackers (problem lists), dev.to posts, prep courses | Here "tracker" means **progress** (problems solved), not time. Mention interview prep, but don't promise problem tracking (not in v0) |
| how many hours to study for coding interviews | Blogs (Design Gurus, Interview Kickstart, Tech Interview Handbook) | Informational intent: a future guide article could rank, not the landing page. Out of scope for now (§7) |
| automatic study hours tracker for developers privacy | Memtime, Timing, ActivityWatch, Everhour | Established desktop trackers own "automatic + private". We can't win the broad term; we can own "study" and "interview prep" combined with privacy |

## 2. Search data and keyword clusters

### 2.1 What the numbers say

| Keyword | Global searches / month | SEO difficulty | Read |
|---|---|---|---|
| study timer | 74,000 | — | Means "Pomodoro timer", not tracking. **Don't target**: wrong intent |
| study tracker | 6,600 | 28 | Broad (students, habits, planners). Worth appearing for, hard to own |
| website time tracker | 1,300 | — | General screen-time intent; secondary at best |
| automatic time tracker | 1,300 | — | Dominated by paid work-hour tools (highest ad price in the list); don't target |
| **study time tracker** | **1,000** | **19** | **Best fit: our exact product, real demand, low difficulty → primary** |
| study hours tracker | 480 | 12 | Same intent, easiest → secondary |
| time tracker chrome extension | 390 | — | Install intent; store listing + landing |
| leetcode tracker | 320 | 24 | Mostly "problems solved" trackers; mention LeetCode, don't promise problem tracking |
| coding interview prep / technical interview preparation | 320 each | — | Context words: use in copy, not as the target |
| study time tracker app | 170 | — | Secondary |
| time tracker for developers | 140 | — | Billing intent (very high ad price); skip |
| rescuetime alternative / wakatime alternative | 110 each | — | Future comparison pages (§7) |
| leetcode timer / leetcode progress tracker | 70 each | — | Small; FAQ and store listing |
| leetcode time tracker, neetcode tracker, private time tracker, track study hours | 10–40 | — | Long tail; covered naturally by the copy |
| "study time tracker chrome extension", "coding interview preparation tracker", "interview prep tracker", "how many hours to study for coding interviews" | ~0 | — | No measurable demand: **don't build titles around them** |

**Conclusion:**
- **Lead with "study time tracker"**: it names the product exactly and has real demand at low difficulty (19). "Study hours tracker" is even easier (12) but has half the searches, so it is the secondary term.
- **A caveat on the data:** volumes are global, while the difficulty scores are for the US.
- **Interview prep as context:** it sets us apart and converts the right visitors, but almost nobody searches for its long phrases.
- **LeetCode and the other platforms:** named as examples.

### 2.2 Clusters

| Cluster | Intent | Page | Primary keyword | Supporting keywords |
|---|---|---|---|---|
| **A. Study time tracking** | Commercial (find a tool) | Landing `/` | **study time tracker** | study hours tracker, study tracker, study time tracker app, track study hours |
| **B. Interview prep and platforms** | Commercial | Landing `/` (subline, how it works, FAQ) | coding interview prep (context) | technical interview preparation, leetcode tracker, leetcode timer, neetcode |
| **C. The extension** | Transactional (install) | Chrome Web Store listing; landing secondary CTA | time tracker chrome extension | website time tracker, study time tracker chrome extension |
| **D. Privacy** | Trust | Landing privacy section, `/privacy` | — (no measurable demand; a conversion point, not a search target) | private time tracker |
| **E. Alternatives and guides** | Comparison / informational | Future pages (§7) | rescuetime alternative, wakatime alternative | how much to study for interviews |

Rules: one cluster per page (no two pages targeting the same terms); clusters A, B and D share the landing page because it is the only marketing page; C belongs to the store listing.

## 3. On-page

| Element | Plan |
|---|---|
| `<title>` (≤ 60) | **Study Time Tracker for Coding Interviews \| CareerOS** (51 chars): the primary keyword first, then the context that sets us apart. Alternative: "Study Time Tracker for Interview Prep \| CareerOS" (48) |
| Meta description (≤ 155) | **A free study time tracker for interview prep: logs your study hours on LeetCode, NeetCode and the sites you choose. Automatic, private, no timers.** (146): primary and secondary keywords, platforms, the three promises |
| One `h1` | The hero headline (`content.md` §4.2). It should contain **"study"** and, ideally, **"study time"**; the subline then names "study time tracker" explicitly |
| Heading outline | `h2` per section: How it works · Your week, at a glance · Right there while you study · Only what it needs · Questions · Start measuring. FAQ questions are `h3` |
| Keyword placement | "Study time tracker" in the title, the subline, the first paragraph and the meta description; "study hours" once in the copy; natural language, no stuffing |
| Images | Descriptive `alt` ("CareerOS dashboard: study time per day this week, 6 h 40 min total"); modern formats (AVIF/WebP), explicit width and height |
| Internal links | Sign in, Privacy, and (once live) the Chrome Web Store listing |
| Third-party names | "LeetCode" and "NeetCode" used only to describe compatibility (nominative use), never in the logo or as if endorsed |

## 4. Structured data (JSON-LD)

- `WebSite` (name, url) and `Organization` (name, url, logo, `sameAs`: GitHub repository).
- `SoftwareApplication`:
  - `name`, `applicationCategory`: `BrowserApplication` (a value Google supports), `operatingSystem`: "Chrome (desktop)";
  - `offers` with `price: 0` and `priceCurrency`;
  - `description` matching the meta description.
- **No rich result is expected, and that's fine.** Google shows a software rich result only with real ratings or reviews (`aggregateRating` or `review`, per its [software app guidelines](https://developers.google.com/search/docs/appearance/structured-data/software-app)), and we have none: inventing them breaks Google's rules. Google also ended FAQ rich results for all sites in 2026 ([report](https://www.techwyse.com/news/ai-search/google-faq-rich-results-deprecated-2026)). The markup is still worth having: it states plainly what the product is, for search engines and AI tools. So the FAQ is marked up only as plain visible content, without `FAQPage`.
- **Validation:** Schema.org's [Schema Markup Validator](https://validator.schema.org/), not Google's Rich Results Test (it would flag the missing ratings).
- **CSP:** JSON-LD goes in `<script type="application/ld+json">`. HTML stops processing a script with a non-JavaScript type before the CSP check, so browsers neither run nor block it, even under the landing page's `script-src 'none'` (architecture §3). It needs no nonce or hash. An E2E check confirms zero CSP violations.

## 5. Technical

| Item | Plan |
|---|---|
| Canonical | `<link rel="canonical">` built from `SITE_URL` (the existing server setting), so moving to the custom domain is a configuration change. Old `vercel.app` URLs then redirect with 308 |
| `robots.txt` | Disallow only `/api` and `/auth`; link the sitemap. The `/landing/` assets stay crawlable (`/landing/index.html` itself redirects to `/`, architecture §3). App pages are **not** blocked here, because Google never sees a `noindex` on a URL that robots.txt blocks |
| `sitemap.xml` | `/` and `/privacy` only, built from `SITE_URL` |
| App pages | `noindex` on the sign-in, dashboard, settings and connect pages (meta robots); signed-out crawlers are redirected to sign-in anyway |
| Open Graph / Twitter | `og:title`, `og:description`, `og:url`, `og:type=website`, and a **1200×630 OG image** generated from the hero (built at build time, self-hosted); `twitter:card=summary_large_image` |
| Icons | Favicon and web manifest: follow-up (no icon mark exists yet) |
| Language | `<html lang="en">` |
| Speed | No client JavaScript needed for the landing content; system fonts (already the design system); hero image preloaded and sized; no third-party requests (SEC-15) |
| Theme | Dark only, as in the approved design (LAND) |

## 6. AI-search visibility

- Plain, factual sentences that answer the obvious questions (what it is, who it's for, what it collects, price, browsers). The FAQ does most of this.
- An `llms.txt` at the site root with a short Markdown description and links, as Supabase does. It's cheap, and optional for the first release.
- One consistent name and description everywhere (site, store listing, GitHub README), so tools that read several sources get the same story.

## 7. Out of scope now

- Comparison pages ("RescueTime alternative", "WakaTime alternative": about 110 searches a month each) and guides (cluster E): only once the landing page is live and Search Console shows demand.
- Portuguese version and `hreflang`: English only for now (product owner).
- Link building and directory submissions (Product Hunt, alternativeTo): a launch task for after the Chrome Web Store listing exists.

## 8. Measurable targets

| Target | Value | How it's checked |
|---|---|---|
| Lighthouse (mobile), SEO | 100 | CI or manual run on the Vercel preview, part of #101's acceptance |
| Lighthouse (mobile), Accessibility | 100 | Same |
| Lighthouse (mobile), Best Practices | 100 | Same |
| Lighthouse (mobile), Performance | ≥ 95 | Same |
| Core Web Vitals | LCP < 2.0 s, CLS < 0.05, INP < 200 ms | Lighthouse in the lab; Search Console field data after launch |
| Indexing | Landing and privacy indexed; app pages not indexed | Search Console coverage report, 2–4 weeks after launch |
| Structured data | No errors in the Schema Markup Validator | Before release |

## 9. Domain note

`careeros-taupe.vercel.app` works, but a custom domain earns more trust and keeps all ranking signals when the hosting changes. The product owner will buy one later. Everything here builds URLs from `SITE_URL`, so the switch is:
- add the domain in Vercel and update `SITE_URL`;
- update the Supabase Site URL, its redirect allow-list and the OAuth redirect URLs;
- **first ship an extension release built for the new origin.** One build setting, `VITE_DASHBOARD_ORIGIN`, drives `externally_connectable`, the extension's sender check and its "Open dashboard" link (AUTH-06). Unpacked builds don't auto-update, so old builds can no longer connect, check status or disconnect from the new domain; uploads keep working (they go straight to Supabase). (A transition build accepting both origins would need an AUTH-06 amendment and a code change in the sender check, so it is not planned);
- then add 308 redirects from the old address;
- everyone signs in again once (cookies belong to the old host).

Ideally the domain lands before the Chrome Web Store submission, so the first store version already uses it. The landing page should go live on the custom domain if it's ready by then: links and rankings built on `vercel.app` are partly lost in a move.

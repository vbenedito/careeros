# 00 — v1 discovery (grilling record)

Status: **Approved (2026-11-17)** — shared understanding confirmed; gate 5 issue list approved · Owner: product owner · Tech lead: Claude · Started: 2026-11-17

Amended 2026-11-19 (#233, proposal): D11 (and D15, D16, D20 where they say LeetCode) now also cover **NeetCode** (`neetcode.io`), by product-owner decision of 2026-11-19 on issue #233: NeetCode ships in extension 0.3.1 after 0.3.0 (LeetCode only, as built); one account setting for both sites, renamed (label proposed "Track coding problems", pending product-owner approval); the dashboard lists problems per site (domain + slug) with no merging across sites. Proposal in [01-problems](01-problems.md) (PRB-18..22). Status of the amended decisions: **Proposed** until the product owner approves the PR.

This page records the v1 discovery session: each question, the tech lead's recommendation, the product owner's answer, and open points. It is not a spec. Specs, ADRs and issues come after the product owner confirms a shared understanding (gate 5).

## Settled decisions

| # | Decision | Date |
|---|---|---|
| D1 | v1 has three tracks: **(M) marketing on social media**, **(P) product features**, **(Pay) a paid plan at the end of v1**. | 2026-11-17 |
| D2 | Marketing uses the **existing landing page**. No new marketing pages in v1 (so A5, the route-based CSP table, is not needed yet). | 2026-11-17 |
| D3 | Marketing starts first: define a persona, create social media accounts, make videos and posts. | 2026-11-17 |
| D4 | Product work runs in parallel: the first new feature is **finding which exercises the user works on, on LeetCode** (roadmap v1). | 2026-11-17 |
| D5 | The paid feature comes **at the end of v1**. | 2026-11-17 |
| D6 | v1 is for the **same person as v0**: an individual interview candidate. No B2B (bootcamps, mentors, teams). | 2026-11-17 |
| D7 | Marketing starts from an **audience persona**. The marketing work itself gets a process built with the marketing skills (persona, voice, which video types, etc.). | 2026-11-17 |
| D8 | Social media runs as a **CareerOS brand account** (no personal face). | 2026-11-17 |
| D9 | Platforms: the wish is all platforms, but the choice comes **after a study** of which platforms fit best (first step of the marketing process). | 2026-11-17 |
| D10 | Marketing language: **English**. | 2026-11-17 |
| D11 | LeetCode detection in v1: **time per problem from the URL** only (option a). No solved status, no difficulty or topics in v1. Changes SEC-01 (problem slug stored, LeetCode only). *Amended 2026-11-19 (#233, proposal): LeetCode and NeetCode, see the line under the status; D15, D16 and D20 follow.* | 2026-11-17 |
| D12 | Marketing documents are **public** (in the repo). Drafts and the calendar stay outside the repo (D17). | 2026-11-17 |
| D13 | Videos start as **text on screen + music** (no voice); test an **AI voice** later. The tech lead picks the marketing skills, finds examples and the cheapest way to start. | 2026-11-17 |
| D14 | **Free tools only** at the start; fewer posts, good quality; the goal is to measure. | 2026-11-17 |
| D15 | LeetCode problems are shown in the **dashboard** (list per week/month: name, total time, last day) **and the popup** (current problem, time today). | 2026-11-17 |
| D17 | `docs/marketing/` holds persona, voice, platform study and video formats. Drafts and the content calendar stay **outside the repo**. | 2026-11-17 |
| D18 | Marketing process approved: brand-profile → audience-research (persona) → voice-builder → competitor-analysis + social-strategy (platform study) → content-pillars → short-form-video-script + capcut (formats, example scripts) → goals-and-kpis → content-calendar. The product owner approves each document before the next step. | 2026-11-17 |
| D19 | Marketing starts **now**, without waiting for the custom domain. The product owner decides on the domain; if it is ready before the social accounts are created, they use it. | 2026-11-17 |
| D20 | The problem-tracking switch is **per account** (dashboard Settings; extensions follow via the 5-minute refresh). Problem names are built from the URL slug. | 2026-11-17 |
| D21 | **One ingest change** in v1: problem slug + E3 + E5 (one ADR, one migration, compatible with released extensions, Opus deep review). | 2026-11-17 |
| D22 | **Everything in v0 stays free**, including the new LeetCode time per problem. Premium only adds new things. | 2026-11-17 |
| D23 | The paid track **leans towards real payments** through a merchant of record with hosted checkout (tentative: "maybe A"). Final choice, the paid feature and the price come in a later paid-track round, with usage data. | 2026-11-17 |
| D24 | The **limits foundation (A1/A2)** ships early, in the same extension release as problem tracking: one server-owned source for limits, an error carrying `limit`/`plan`, only a `free` plan for now. | 2026-11-17 |
| D25 | **No GA4** (#138): Vercel Web Analytics + Search Console + `utm_*` on every social link; #138 closes with ADR-0010 as the answer. | 2026-11-17 |
| D26 | Small technical items: **add CodeQL**; **fix the 12 untested spec IDs**; #160, A6/T8 stay deferred; #78 stays parked. | 2026-11-17 |
| D16 | Problem tracking is **off by default**; the user turns it on in Settings; a one-time dashboard card announces it. | 2026-11-17 |

## Round 1 (2026-11-17)

**Q1 — What is v1 mainly about?** (a) paid plan + limits + marketing pages; (b) LeetCode exercise detection; (c) a paid plan whose main paid feature is (b).
- Recommendation: (c), in two steps (limits foundation first, then exercise detection as the first premium feature).
- Answer: a mix of (a) and (b). Focus on social media marketing using the current landing page (no new marketing pages now): create a persona, start the social media accounts, videos and posts. Meanwhile, improve the product with new features such as LeetCode exercise detection. The paid feature comes at the end of v1. → D1–D5.

**Q2 — Who is v1 for?** (a) the v0 individual interview candidate; (b) also B2B.
- Recommendation: (a).
- Answer: (a). → D6.

## Round 2 (2026-11-17)

**Q3 — What is "create a persona"?** (a) audience persona; (b) brand character; (c) both.
- Recommendation: (a) plus a brand voice document.
- Answer: (a). Build a marketing work process with the marketing skills; understand what type of videos to create. → D7.

**Q4 — Who is the face of the accounts?** (a) the product owner, building in public; (b) a CareerOS brand account; (c) both.
- Recommendation: (c), with (a) leading.
- Answer: (b). → D8.

**Q5 — Which platforms first?** (a) LinkedIn; (b) LinkedIn + one short-video format; (c) everything.
- Recommendation: (b).
- Answer: study which platforms are better first; the current idea is all platforms. → D9.

**Q6 — Which language?**
- Recommendation: English.
- Answer: English. → D10.

**Q7 — What should LeetCode exercise detection do?** (a) time per problem from the URL; (b) + solved status; (c) + difficulty and topics.
- Recommendation: (a) first, decide (b) after real use.
- Answer: (a) for v1. → D11.

## Round 3 (2026-11-17)

**Q8 — Where do the marketing documents live?** (a) repo for persona/voice/study, drafts outside; (b) all private; (c) all in the repo.
- Recommendation: (a).
- Answer: public. → D12 (drafts to confirm).

**Q9 — Sound of the videos?** (a) text + music; (b) own voice; (c) AI voice.
- Recommendation: (a), test (c) later.
- Answer: (a) first, then (a)+(c). Find the best skills, examples and the cheapest start. → D13.

**Q10 — Time and money?** (a) free, ~2 h/week, 2 posts/week; (b) ≤ US$30/month, ~4 h/week, 3–4 posts/week; (c) more.
- Recommendation: (b).
- Answer: free tools, fewer posts with quality, to measure. → D14.

**Q11 — What does the user see?** (a) dashboard list; (b) + popup line; (c) + detail page.
- Recommendation: (b).
- Answer: (b). → D15.

**Q12 — On by default?** (a) off, opt-in in Settings; (b) on.
- Recommendation: (a).
- Answer: (a). → D16.

## Round 4 (2026-11-17)

**Q13 — Do drafts go in the repo too?** (a) no, outside; (b) yes.
- Recommendation: (a). Answer: (a). → D17.

**Q14 — Approve the marketing process (7 steps, one skill and one document each)?**
- Recommendation: yes, in this order. Answer: yes. → D18.

**Q15 — Custom domain before the first post?** (a) yes, switch first; (b) start with a brand Gmail and `vercel.app`.
- Recommendation: (a).
- Answer: start now; the product owner will look at the domain. → D19.

**Q16 — Problem-tracking setting per account or per device?**
- Recommendation: per account. Answer: per account. → D20.

**Q17 — Fix E3/E5 in the same ingest change as the problem slug?**
- Recommendation: yes. Answer: yes. → D21.

## Round 5 (2026-11-17)

**Q18 — Does everything in v0 stay free?**
- Recommendation: yes. Answer: yes. → D22.

**Q19 — How does the paid track end?** (a) real payments via a merchant of record; (b) pricing + waitlist first.
- Recommendation: (b).
- Answer: maybe (a). → D23 (tentative).

**Q20 — When to build the limits foundation (A1/A2)?** (a) early, with problem tracking; (b) with the paid track.
- Recommendation: (a). Answer: (a). → D24.

**Q21 — Google Analytics (#138)?** (a) no, Vercel + Search Console + UTM; (b) GA4 with a banner.
- Recommendation: (a). Answer: (a). → D25.

**Q22 — Small technical items plan?**
- Recommendation: yes. Answer: yes. → D26.

## Facts gathered by the tech lead

- SEC-01 forbids collecting full URLs or paths, and the extension has no content scripts. SEC-03 permissions are `tabs`, `idle`, `alarms`, `storage`, with no host permissions (ADR-0006). Any exercise detection changes SEC-01 and needs a privacy review; reading LeetCode page content or LeetCode's API would also need new permissions and a new store review.
- The landing page says "Get started — it's free" and "There's no paid plan" (`docs/landing/content.md`, LAND-03 tested copy). This must change before the paid plan ships (D5).

## Open points (decided later, not blocking the v1 start)

- **Paid-track round** (near the end of v1): the paid feature, the price, the merchant of record, the privacy-page and landing-copy changes ("There's no paid plan"). Needs usage data: store installs, weekly users, site visits (tech lead gathers them), plus problem-tracking adoption.
- **Custom domain:** the product owner decides. If it is not ready when the social accounts are created, choose the account email then (brand Gmail vs domain email).
- **Platforms:** decided by the platform study (D9, D18 step 4).

## Gate 5: approved issue list (2026-11-17)

Specs and ADRs: `specs/v1/01-problems.md` (`PRB`), `specs/v1/02-entitlements.md` (`ENT`), amendments to SEC/SYNC/DATA/DASH/EXT-UI/ENV, ADR-0011 (ingest v2), ADR-0012 (entitlements), ADR-0006 dated update — all in #176.

| Issue | Title | Model · review |
|---|---|---|
| #175 | Discovery record (this page) | — · product owner's check |
| #176 | Specs PRB + ENT, amendments, ADR-0011/0012 | Opus · Sonnet |
| #177 | DB: entitlements | Sonnet · Opus |
| #178 | DB: ingest v2 + problem setting + E3/E5 | Opus · Opus |
| #179 | Extension: engine problem detection + ingest v2 client | Opus · Opus |
| #180 | Extension: popup line, setting, limit error | Sonnet · Sonnet |
| #181 | Web: problems list, switch, card, limit error, landing constants, privacy | Sonnet · Sonnet |
| #182 | Extension release 0.3.0 | Sonnet · product owner's check |
| #183 | CodeQL | Haiku · Sonnet |
| #184 | Spec-trace leftovers | Haiku · tech lead's check |
| #185–#191 | Marketing M1–M7: brand profile, persona, voice, platform study, pillars, video formats, goals + calendar | Sonnet (Opus for #185) · product owner's check |

Order: marketing stream #185 → #191 in sequence; product stream #175 → #176 → #177 → #178 → (#179 ∥ #181) → #180 → #182; #183 and #184 when a slot is free. At most two agents at once. #138 is closed with ADR-0010 as the answer (D25).

# Landing page — external references (#96)

Status: **Decided** (tech lead, by delegation from the product owner) · 2026-11-10 · Part of #102.

Links and our own notes only; no copied text or assets. Screenshots are not attached: this research environment can only open pages returned by web search, and several sites (linear.app, raycast.com, rescuetime.com) refused direct access. Each entry links to the page or to a published teardown of it. The product owner can open them for the visuals.

## 1. Same problem space

| Reference | What it does well — adopt | Avoid |
|---|---|---|
| **WakaTime** ([home](https://wakatime.com/), [why](https://wakatime.com/why-wakatime)) | Automatic tracking stated in the first line; the dashboard screenshot sits right under the hero, so the product is visible before any scrolling; one CTA ("Start for free") repeated at the end | No privacy statement on the page at all (only a footer link). For a tracker, that is the first question visitors have |
| **Toggl Track — automated tracker** ([page](https://toggl.com/track/automated-time-tracker/)) | A dedicated privacy section that answers "is this spying?" head-on and lists what it does **not** do (no screenshots, no mouse tracking); a short how-it-works; FAQ | Fifteen sections and six different CTA labels: long, repetitive and salesy. Enterprise logos we cannot (and should not) imitate |
| **RescueTime** ([privacy checklist](https://www.rescuetime.com/privacy_checklist)) | Privacy expressed as user controls: whitelist of sites, pause, delete everything | Records **all** computer time by default and narrows only on request. CareerOS is the opposite (only the sites you choose), which is a clear point of difference to state |
| **LeetCode Time Tracker** (Chrome extension, [store listing](https://chromewebstore.google.com/detail/leetcode-time-tracker/minocemndbbiabdpijinjcolnkecodho)) | Direct competitor for the same intent: no manual timer, times each LeetCode problem | LeetCode only, no cross-site picture, no dashboard, about 36 users and no ratings. It shows the niche is open, and that store listings rank for these searches (see the SEO plan) |
| **Memtime** ([home](https://memtime.com/)) | Leads with "automatic + private" as the core promise, for developers | Desktop app for billing hours; a different job from ours |

## 2. Developer-tool pages known for craft

| Reference | Adopt | Avoid |
|---|---|---|
| **Linear** ([teardown](https://landingdoctors.com/teardowns/linear-app), [about](https://linear.app/about)) | H1 and the single primary CTA fit on one screen on every device; system fonts and very little script, so LCP is under a second; large real product UI as the hero visual | The teardown's main criticism: the H1 names a category ("the system for…") instead of an outcome. Our H1 must state the outcome |
| **Raycast** ([design notes](https://www.webdesignhot.com/design.md/raycast/), [why](https://www.raycast.com/why)) | Real app screenshots, full bleed; surfaces lifted with tonal greys instead of shadows; restrained motion (fade and rise on scroll) switched off under reduced motion; compact content groups inside generous section spacing | Its dark-only look and live auto-typing mockup are heavy on JavaScript; we follow the visitor's theme and stay script-light |
| **Supabase** ([home](https://supabase.com/), [machine-readable home](https://supabase.com/homepage.md)) | A two-beat tagline; concrete specifics instead of adjectives; trust from facts (open source, compliance) rather than testimonials; a Markdown version of the page for AI tools | Feature sprawl: we have one product and should look like it |

## 3. Extension + web app in one story

| Reference | Adopt | Avoid |
|---|---|---|
| **Grammarly for your browser** ([page](https://www.grammarly.com/browser)) | Shows the extension **in context** (inside the sites people already use), not as an isolated screenshot; install CTA in the header and repeated; per-browser download links in the footer | Big audience numbers and media logos: we have none, and inventing them is out |
| **WakaTime** (again) | "Plugins collect, the web dashboard shows" told in one line, with the supported tools as a row of logos | — |

## 4. Patterns for CareerOS

1. **Hero:**
   - An outcome headline (what you get, not what we are) and a one-line subline that says *automatic*, *only the sites you choose* and *private*.
   - **One primary CTA** ("Get started", i.e. sign in) and one quiet secondary ("Install the extension").
   - The product visible on the first screen: the popup's current session beside the weekly chart.
2. **Show it in context:** the popup over a study site (a neutral mock of a problem page, not a real site's UI), then the dashboard week view.
3. **How it works in four steps:** install → choose your study sites → study as usual → see your week. Each step one line long.
4. **Privacy as a feature section**, phrased as what we never collect (URLs, page content, other sites) plus the controls: choose sites, turn tracking off, delete your account.
5. **Specifics over adjectives:**
   - "pauses after 60 seconds without input";
   - "keeps counting while the study tab plays sound, up to 15 minutes";
   - "only the sites you add".
   Every one is true to the v0 specs.
6. **Short FAQ** with direct answers (it also feeds search and AI answers).
7. **Final CTA, then the footer:** Privacy, GitHub, sign in.
8. **No social proof yet.** No invented testimonials, user counts or logos; trust comes from the privacy specifics and the public code on GitHub (the repository has no license yet, so it is "public", not "open source"; adding one is a product-owner decision).
9. **Speed as part of the design:** system fonts, little or no script on the page, sharp images in modern formats.

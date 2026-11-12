# Chrome Web Store listing

Everything to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) for CareerOS (issue #128, spec [STORE](../../specs/store/00-chrome-web-store.md)). Every claim matches specs/v0.

## Package

`pnpm --filter @careeros/extension release:store` with `apps/extension/.env.production` → `apps/extension/careeros-extension-<version>-store.zip`. It is the production build without the manifest `key` (STORE-01).

## Store listing tab

| Field | Value |
|---|---|
| Name | CareerOS (from the manifest) |
| Summary | Automatic study time tracker for interview prep. Counts only on the sites you choose: no URLs, no page content. (from the manifest, 111 characters) |
| Category | Productivity → Workflow & planning (alternative: Education) |
| Language | English |
| Store icon | `assets/icon-128.png` |
| Screenshots (1280×800) | `assets/screenshot-1-dashboard-week.png`, `assets/screenshot-2-how-it-works.png` (plus a popup screenshot if you take one, see below) |
| Small promo tile (440×280) | `assets/promo-small-440x280.png` |
| Marquee (1400×560, optional) | `assets/promo-marquee-1400x560.png` |
| Homepage URL | https://careeros-taupe.vercel.app |
| Support URL | https://github.com/vbenedito/careeros/issues |

**Description:**

> Updated 2026-11-11 (#137): the website now has cookieless page analytics (SEC-15), so the old line "No ads, no analytics, nothing sold" became "No ads, nothing sold. The extension sends no analytics." **Update the description in the store dashboard only after the first review is approved**, so the edit does not restart the review.

> Updated 2026-11-12 (#145): the site limit is now 12, so "up to 50" became "up to 12". **Update the description in the store dashboard together with the extension 0.2.1 package**, with both changes: this site limit and the analytics line above (#137).

```
CareerOS measures the time you spend studying for technical interviews, automatically, on the sites you choose.

Interview prep is spread across LeetCode, NeetCode, docs and videos. Timers get forgotten and screen-time apps mix study with everything else. CareerOS counts only what you call study.

HOW IT WORKS
• Pick your study sites (up to 12; subdomains included), for example leetcode.com or neetcode.io.
• Study as usual. Time counts only while a study site is the active tab and you are at the keyboard.
• Step away and it pauses after 60 seconds. A study tab playing sound (a video, not muted) keeps counting for up to 15 minutes without input.
• Sessions are saved on your computer first and uploaded every few minutes; offline, they wait up to 30 days.
• See your week on the web dashboard: time per day and per platform, across every computer you use.

PRIVATE BY DESIGN
• For your study it keeps only the site name, when you started and stopped, and a random ID for the computer.
• It reads the active tab's address only to get the site name. It never stores or sends full addresses, page titles, page content or the sites you did not choose, and never tracks incognito windows.
• No ads, nothing sold. The extension sends no analytics. Delete your account and your data anytime (see the privacy policy).

Sign in on the dashboard with Google or GitHub, then connect the extension from there. Free, no paid plan.

Privacy policy: https://careeros-taupe.vercel.app/privacy
```

## Privacy practices tab

**Single purpose:**
```
CareerOS measures how much time the user spends on the study websites they choose and shows it on their CareerOS dashboard.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Read the active tab's address to get its site name and check whether it is one of the user's chosen study sites. The address is never stored or sent; only the name of a chosen site is recorded. |
| `idle` | Pause tracking when the user has not used the keyboard or mouse for 60 seconds, so idle time is not counted as study. |
| `alarms` | Run a periodic check that keeps tracking accurate after sleep or browser restarts, and upload finished sessions every few minutes. |
| `storage` | Keep the user's sign-in, settings, chosen sites and not-yet-uploaded sessions on their computer, so no study time is lost offline. |

**Remote code:** No, I am not using remote code. (All code is in the package; the extension page CSP is `script-src 'self'`.)

**Data usage, what is collected:**

| Category | Collected | What exactly |
|---|---|---|
| Personally identifiable information | Yes | The account email, shown in the popup and used to sign in |
| Authentication information | Yes | The extension's own sign-in session (access and refresh tokens), stored locally |
| Web history | Yes | Only the site name of the user's chosen study sites, with start and end times. No full addresses, no other sites |
| Health, financial, personal communications, location, user activity, website content | No | — |

**Certifications (all three):** data is not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

**Privacy policy URL:** https://careeros-taupe.vercel.app/privacy

## Distribution tab

Free · Public · all regions.

## After the first upload (before publishing)

Status (2026-11-12): steps 1–4 done; **published** at https://chromewebstore.google.com/detail/pddbflgidjmnhidineoejneeipaicgek. Remaining: step 5, and the description update below.

1. The dashboard shows the item's **ID** (32 letters) as soon as the draft exists. Under **Package → View public key**, copy the item's **public key** (public by design, safe to share).
2. Send both to the tech lead: they go into `MANIFEST_KEYS.production` (`apps/extension/manifest.config.ts`), so the unpacked production build and the store item share **one ID** (STORE-05). The docs that name the old ID are updated in the same PR. **Done 2026-11-11** (#130): ID `pddbflgidjmnhidineoejneeipaicgek`.
3. In Vercel (Production): set `NEXT_PUBLIC_EXTENSION_ID` to the store ID and redeploy, so the dashboard talks to the store extension (AUTH-06).
4. Submit for review. When it is published, set `EXTENSION_INSTALL_URL` to the listing URL (`https://chromewebstore.google.com/detail/<slug>/<ID>`) and redeploy: the landing page's "Add to Chrome" then points to it (LAND-05).
5. Switch your own copy: in the dashboard, **Disconnect** the unpacked extension first (it uploads what is pending, AUTH-12), remove it, then install from the store and connect.

## Optional: a popup screenshot

The store accepts up to 5 screenshots. A real one of the popup helps reviewers and users: open the popup on a study site, take a screenshot, and place it on a 1280×800 canvas (dark background). Never use real personal data.

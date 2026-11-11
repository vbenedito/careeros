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

```
CareerOS measures the time you spend studying for technical interviews, automatically, on the sites you choose.

Interview prep is spread across LeetCode, NeetCode, docs and videos. Timers get forgotten and screen-time apps mix study with everything else. CareerOS counts only what you call study.

HOW IT WORKS
• Pick your study sites (up to 50; subdomains included), for example leetcode.com or neetcode.io.
• Study as usual. Time counts only while a study site is the active tab and you are at the keyboard.
• Step away and it pauses after 60 seconds. A study tab playing a video keeps counting for up to 15 minutes without input.
• Sessions are saved on your computer first and uploaded every few minutes, so nothing is lost offline.
• See your week on the web dashboard: time per day and per platform, across every computer you use.

PRIVATE BY DESIGN
• For your study it keeps only the site name and when you started and stopped.
• It reads the active tab's address only to get the site name. It never stores or sends full addresses, page titles, page content or the sites you did not choose, and never tracks incognito windows.
• No ads, no analytics, nothing sold. Delete your account and your data anytime.

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

1. The dashboard shows the item's **ID** (32 letters) as soon as the draft exists.
2. In Vercel (Production): set `NEXT_PUBLIC_EXTENSION_ID` to that ID and redeploy. The dashboard can then talk to the store extension (AUTH-06).
3. Submit for review. When it is published, set `EXTENSION_INSTALL_URL` to the listing URL (`https://chromewebstore.google.com/detail/<slug>/<ID>`) and redeploy: the landing page's "Add to Chrome" then points to it (LAND-05).
4. Remove your unpacked copy and install from the store: the store version has a different ID, so the unpacked one can no longer connect after step 2.

## Optional: a popup screenshot

The store accepts up to 5 screenshots. A real one of the popup helps reviewers and users: open the popup on a study site, take a screenshot, and place it on a 1280×800 canvas (dark background). Never use real personal data.

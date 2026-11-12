# ADR-0010 — Vercel Web Analytics on the website, cookieless, never in the extension

Status: **Accepted** (product owner, 2026-11-11, PR #139) · Date: 2026-11-11 · Issue: #137 · Follow-up: #138 (GA4, deferred)

## Context
We need simple traffic numbers for the website (page views, referrers, countries, devices) to measure the landing page and the launch. Constraints:
- SEC-15 said "no analytics" in v0; the privacy page, the landing "Never" list and the Chrome Web Store description promised it.
- The landing page (`/`) has `script-src 'none'` (LAND-06, ADR-0009); app pages use a per-request nonce with `'strict-dynamic'` and `connect-src 'self'` (SEC-09).
- No consent banner: whatever we add must set no cookies and store no personal identifiers.
- Some URLs carry data that must not leave the site: `/auth/callback?code=…`, `/connect` (extension handoff), `/sign-in?next=…`.
- The extension stays analytics-free (its store listing and SEC-01).
- Product decision (product owner, 2026-11-11): Vercel Web Analytics on all web pages, cookieless, no banner, never in the extension; GA4 deferred to #138.

## Options
1. **None** — keep SEC-15 as is. No new risk; no way to measure the launch.
2. **Vercel Web Analytics** — already our host. Cookieless; visitors are counted by a daily-rotating hash, not an identifier we hold. Script and endpoint are served from our own origin (`/_vercel/insights/script.js`, `/_vercel/insights/*`), so no third-party request and a narrow CSP change. `beforeSend` hook to drop or rewrite page views. Limited reports and a monthly event quota on the Hobby plan.
3. **Google Analytics 4** — rich reports, free. Sets cookies (consent banner under LGPD/GDPR), third-party script and endpoints (`googletagmanager.com`, `google-analytics.com`) in both CSPs, an inline bootstrap script. Deferred (#138).
4. **Cloudflare Web Analytics** — cookieless, free. Third-party script and beacon origin (`static.cloudflareinsights.com`, `cloudflareinsights.com`); one more processor for the privacy policy.
5. **Umami (self-hosted or cloud)** — cookieless, open source. Another service to host and secure (or another processor); third-party origin unless proxied.

## Decision
Option 2, Vercel Web Analytics, on production deployments on Vercel only (`VERCEL=1` and `VERCEL_ENV=production`; `lib/analytics/config.ts`). It is the only option that adds no processor, no cookie and no third-party origin.

- App pages (sign-in, privacy, dashboard, settings): `<Analytics />` from `@vercel/analytics/next` in the root layout, through `components/app/web-analytics.tsx` with `beforeSend` = `filterAnalyticsEvent` (`lib/analytics/before-send.ts`): page views of `/auth/*` and `/connect` are dropped; query strings are dropped except `view` (dashboard period) and `utm_*`; fragments are dropped.
- Landing page: `<script defer src="/_vercel/insights/script.js">` in the static HTML, only when enabled.
- No custom events, no user ids, nothing in the extension.

## Consequences
+ Launch and landing traffic become measurable with no consent banner and no new processor (Vercel already hosts the site).
+ App CSP (SEC-09) needs **no change**: the package inserts the script with `document.createElement` from a nonce'd bundle, which `'strict-dynamic'` allows (`'self'` covers it in older browsers), and page views go to the same origin (`connect-src 'self'`).
+ Local development, tests, CI and preview deployments load nothing, so the package's development script from `va.vercel-scripts.com` never runs and previews don't use the event quota.
− The landing CSP (LAND-06) is no longer script-free when enabled: `script-src <origin>/_vercel/insights/script.js` (that one URL, by path) and `connect-src <origin>/_vercel/insights/`. Still no inline script, no `'unsafe-inline'`. The origin is the build-time site URL, so on another hostname of the same deployment the script is blocked (no page view, a CSP report in the console).
− The landing page has no `beforeSend` (it runs no script of its own): its page views are sent as the Vercel script sends them. Only `/` uses that path, and signed-in visitors never reach it.
− The script's content is controlled by Vercel and not pinned or hashed by us; we trust it as we trust the host.
− Copy that promised "no analytics" changes in the same release: the privacy page (what, by whom, legal basis), the landing "Never" list ("Ad trackers or cookies"), and the Chrome Web Store description (the extension sends no analytics), which is edited in the store dashboard only after the first review is approved.
− Web Analytics must be enabled in the Vercel project; check the Hobby plan's event limit before launch.

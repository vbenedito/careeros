# 07 — Security & Privacy

Status: **Approved (2026-11-04)** · Applies to all v0 components.

Amended 2026-11-11 (#131): SEC-08 routes and check, SEC-09 headers as implemented.

Amended 2026-11-11 (#137): SEC-15 allows cookieless first-party page analytics on the website (Vercel Web Analytics, [ADR-0010](../../docs/adr/0010-web-analytics.md)); SEC-09 notes the analytics script needs no app CSP change; data inventory adds page views.

## 1. Data inventory (exhaustive)

| Data | Where | Why |
|---|---|---|
| Email, provider, auth ids, OAuth profile metadata (name, avatar URL) | Supabase Auth | Account; name/avatar arrive with the sign-in and are not used by CareerOS in v0 |
| Session records incl. IP address and user agent; auth audit log | Supabase Auth (platform) | Security of sign-in; not read by CareerOS code |
| Request logs incl. IP address | Vercel (platform) | Operations; short retention per Vercel plan |
| Page views on the website: page path, referrer, country, device and browser type (no cookies, no user ids) | Vercel Web Analytics | Measuring website traffic (SEC-15) |
| Tracked domains | `tracked_domains` | User's study-site list |
| Intervals: id, device_id, tracked domain, start, end | `study_sessions`, extension storage | The product |
| Extension session tokens | `chrome.storage.local` | Keep the extension connected |
| Tracking enabled flag, engine state, outbox, today's intervals | `chrome.storage.local` | Operation & offline resilience |

- **SEC-01** Nothing else is collected. Explicitly never: full URLs, paths, query strings, page titles, page content, keystrokes, form data, passwords, screenshots, or hosts of non-tracked sites. The extension has **no content scripts**. Of the user record, the extension's stored session keeps only the id, the **email** (shown in the popup and used to warn about a different account) and the token's non-personal fields (`aud`, `role`, `is_anonymous`); the name, avatar and linked identities that come with an OAuth session are stripped before it is written (#113). Tracked-site lists received from the server are validated with the shared domain schema before they are cached or shown. Incognito tabs are never tracked, even if the user allows the extension in incognito.
- **SEC-02** Hostnames of non-tracked tabs are evaluated in memory and discarded immediately; they are never persisted or logged.

## 2. Extension

- **SEC-03** Permissions: `tabs` (read active tab URL to derive hostname — ADR-0006), `idle`, `alarms`, `storage`. No host permissions: the Supabase API is reachable from the service worker via CORS (confirmed in real Chromium by the #12 integration test). No `<all_urls>`, no `scripting`, no `webRequest`.
- **SEC-04** Strict MV3 CSP; no remote code, no `eval`.
- **SEC-05** External messaging limited by AUTH-06/07.
- **SEC-06** Logs never contain tokens, emails or hosts of non-tracked sites. Debug logging is off in production builds.

## 3. Dashboard & backend

- **SEC-07** RLS enabled and forced on every table; covered by pgTAP tests (DATA §5). The Supabase **publishable key** (`sb_publishable_…`, formerly "anon") is public by design; the **secret key** (`sb_secret_…`, formerly "service_role", env `SUPABASE_SECRET_KEY`) is server-only (Vercel env), never shipped to the browser or the extension, and never prefixed `NEXT_PUBLIC_`.
- **SEC-08** Server routes that mutate (`/api/extension/link`, `/api/sites` and `/api/sites/[id]`, account deletion, `/auth/sign-in`, `/auth/sign-out`) require a matching `Origin` header (CSRF defense on top of `SameSite=Lax` cookies); all but the sign-in route also require an authenticated session. The check is `isSameOrigin` in `apps/web/lib/security/origin.ts`: the `Origin` header must equal the configured site URL.
- **SEC-09** Security headers (`apps/web/lib/security/headers.ts`):
  - **CSP** with a per-request **nonce**, set in the proxy (`apps/web/proxy.ts`, Next 16; formerly "middleware"). Directives: `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'` (plus `'unsafe-eval'` in dev only); `style-src 'self' 'nonce-…'` (`'unsafe-inline'` in dev only); `style-src-attr 'unsafe-inline'` (style attributes cannot run code); `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'` (the browser never calls Supabase directly); `object-src 'none'`; `base-uri 'self'`; `form-action 'self'` plus the Supabase origin and `https://accounts.google.com`, `https://github.com` (the sign-in redirect chain); `frame-ancestors 'none'`; `upgrade-insecure-requests` when the site URL is https. The nonce is also passed to `next-themes`' inline script and to `get-nonce` (Radix) — no `unsafe-inline` for scripts.
  - Vercel Web Analytics (SEC-15) needs no addition: the package inserts `/_vercel/insights/script.js` with `document.createElement` from a nonce'd bundle, which `'strict-dynamic'` allows (`'self'` in browsers without it), and sends page views to `/_vercel/insights/*` on this origin (`connect-src 'self'`). Amended 2026-11-11 (#137).
  - The signed-out landing page at `/` does not get this CSP: it sets its own, stricter one (LAND-06).
  - **Static headers** on every response, including API routes (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`. `X-Powered-By` is off.
  - **HSTS** (`max-age=63072000; includeSubDomains`) only for production builds whose `SITE_URL` is https.
- **SEC-10** All inputs validated with shared Zod schemas at the boundary and again by database constraints.
- **SEC-11** OAuth redirect URLs restricted to the dashboard origins in Supabase Auth settings.
- **SEC-12** Dependencies: lockfile committed; `pnpm audit` (high/critical) and GitHub Dependabot alerts enabled; no dependency added without an issue-level justification.

## 4. Privacy & LGPD

- **SEC-13** `/privacy` explains, in plain language (English; Portuguese version optional): the controller (product owner, contact email); what is collected (table above) and why; legal basis (LGPD art. 7 V — performance of the service the user signed up for); processors and **international transfer** (Supabase region chosen at setup, Vercel, Google/GitHub as identity providers); that data is never sold or shared for marketing; retention (until deletion; the project's encrypted weekly backups are kept 90 days (#31); platform logs per provider retention); data-subject rights (access via the dashboard, export and correction on request by email, deletion via DASH-14).
- **SEC-14** Account deletion removes all application data from the live database immediately (DATA-12). Disconnecting the extension clears its local data after the unsynced-data confirmation in AUTH-12. When the extension is no longer connected (account deleted, signed out everywhere), **Forget local data** (AUTH-11a) clears what the last account left on that computer.
- **SEC-15** Amended 2026-11-11 (#137). The website (landing `/`, `/privacy`, sign-in, dashboard and settings) may use **cookieless, first-party page analytics** only: Vercel Web Analytics ([ADR-0010](../../docs/adr/0010-web-analytics.md)), served from this origin (`/_vercel/insights/*`), on production deployments on Vercel only (`lib/analytics/config.ts`; never in local development, tests, CI or previews). Collected: page path, referrer, country, device and browser type. Never: cookies, user ids or other personal identifiers, custom events with personal data, other analytics or advertising scripts, any third-party script. Sensitive URLs are stripped before sending (`lib/analytics/before-send.ts`): page views of `/auth/*` and `/connect` are dropped, and query strings are removed except `view` (dashboard period) and `utm_*`. The **extension never sends analytics**. `/privacy` describes the analytics (SEC-13).

## 5. Acceptance criteria

1. Automated test asserts the manifest permission set equals SEC-03 exactly.
2. Automated test asserts persisted extension storage contains no key/value with URL paths or non-tracked hosts after a scripted browsing session.
3. pgTAP cross-user tests pass.
4. Independent security review (grill:security agent) of the auth handoff and RPCs finds no unresolved high-severity issue.

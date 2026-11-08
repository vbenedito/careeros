# 07 — Security & Privacy

Status: **Approved (2026-11-04)** · Applies to all v0 components.

## 1. Data inventory (exhaustive)

| Data | Where | Why |
|---|---|---|
| Email, provider, auth ids, OAuth profile metadata (name, avatar URL) | Supabase Auth | Account; name/avatar arrive with the sign-in and are not used by CareerOS in v0 |
| Session records incl. IP address and user agent; auth audit log | Supabase Auth (platform) | Security of sign-in; not read by CareerOS code |
| Request logs incl. IP address | Vercel (platform) | Operations; short retention per Vercel plan |
| Tracked domains | `tracked_domains` | User's study-site list |
| Intervals: id, device_id, tracked domain, start, end | `study_sessions`, extension storage | The product |
| Extension session tokens | `chrome.storage.local` | Keep the extension connected |
| Tracking enabled flag, engine state, outbox, today's intervals | `chrome.storage.local` | Operation & offline resilience |

- **SEC-01** Nothing else is collected. Explicitly never: full URLs, paths, query strings, page titles, page content, keystrokes, form data, passwords, screenshots, or hosts of non-tracked sites. The extension has **no content scripts**. Incognito tabs are never tracked, even if the user allows the extension in incognito.
- **SEC-02** Hostnames of non-tracked tabs are evaluated in memory and discarded immediately; they are never persisted or logged.

## 2. Extension

- **SEC-03** Permissions: `tabs` (read active tab URL to derive hostname — ADR-0006), `idle`, `alarms`, `storage`. No host permissions: the Supabase API is reachable from the service worker via CORS (confirmed in real Chromium by the #12 integration test). No `<all_urls>`, no `scripting`, no `webRequest`.
- **SEC-04** Strict MV3 CSP; no remote code, no `eval`.
- **SEC-05** External messaging limited by AUTH-06/07.
- **SEC-06** Logs never contain tokens, emails or hosts of non-tracked sites. Debug logging is off in production builds.

## 3. Dashboard & backend

- **SEC-07** RLS enabled and forced on every table; covered by pgTAP tests (DATA §5). The Supabase **publishable key** (`sb_publishable_…`, formerly "anon") is public by design; the **secret key** (`sb_secret_…`, formerly "service_role", env `SUPABASE_SECRET_KEY`) is server-only (Vercel env), never shipped to the browser or the extension, and never prefixed `NEXT_PUBLIC_`.
- **SEC-08** Server routes that mutate (`/api/extension/link`, account deletion) require an authenticated session and a matching `Origin` header (CSRF defense on top of `SameSite=Lax` cookies).
- **SEC-09** Security headers: CSP with per-request **nonces** set in middleware (self + Supabase; nonce also passed to `next-themes`' inline script — no `unsafe-inline` for scripts), `X-Frame-Options: DENY` / `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS in production.
- **SEC-10** All inputs validated with shared Zod schemas at the boundary and again by database constraints.
- **SEC-11** OAuth redirect URLs restricted to the dashboard origins in Supabase Auth settings.
- **SEC-12** Dependencies: lockfile committed; `pnpm audit` (high/critical) and GitHub Dependabot alerts enabled; no dependency added without an issue-level justification.

## 4. Privacy & LGPD

- **SEC-13** `/privacy` explains, in plain language (English; Portuguese version optional): the controller (product owner, contact email); what is collected (table above) and why; legal basis (LGPD art. 7 V — performance of the service the user signed up for); processors and **international transfer** (Supabase region chosen at setup, Vercel, Google/GitHub as identity providers); that data is never sold or shared for marketing; retention (until deletion; the project's encrypted weekly backups are kept 90 days (#31); platform logs per provider retention); data-subject rights (access via the dashboard, export and correction on request by email, deletion via DASH-14).
- **SEC-14** Account deletion removes all application data from the live database immediately (DATA-12). Disconnecting the extension clears its local data after the unsynced-data confirmation in AUTH-12.
- **SEC-15** No analytics/tracking scripts on the dashboard in v0.

## 5. Acceptance criteria

1. Automated test asserts the manifest permission set equals SEC-03 exactly.
2. Automated test asserts persisted extension storage contains no key/value with URL paths or non-tracked hosts after a scripted browsing session.
3. pgTAP cross-user tests pass.
4. Independent security review (grill:security agent) of the auth handoff and RPCs finds no unresolved high-severity issue.

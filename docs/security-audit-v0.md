# Security audit — v0

Issue #110 · 2026-11-09/10 · requested by the product owner before Gate 4 · follows the earlier [security & edge-case review](security-review-v0.md) (#30).

**Result: no Critical findings, and no way for one user to read or change another user's data.** Two High findings (upload flood, backup secret) and the Medium and Low findings below are fixed and merged, and production was checked afterwards. The independent reviews of the fixes found three more problems before merge, all fixed (see "Found while reviewing the fixes").

## Scope

| Component | Reviewed |
|---|---|
| Database (Supabase Postgres) | Every migration: tables, RLS, grants and default privileges, SECURITY DEFINER functions, `ingest_study_sessions`, totals RPCs, link quota, `private` schema |
| Dashboard (Next.js on Vercel) | `proxy.ts`, every route handler (sign-in, callback, sign-out, extension link, sites, account deletion), Server Components, CSP and headers, use of the secret key |
| Extension (Chrome MV3) | Manifest and permissions, `externally_connectable`, internal messages, session storage, sync, local-data lifecycle, popup |
| Supply chain and CI | Dependencies and lockfile, GitHub Actions (pinning, permissions, secrets), the backup workflow, git history |
| Production configuration | Supabase Auth settings, live dashboard headers and routes, GitHub repository settings, Vercel settings |

Out of scope: Supabase, Vercel, Google and GitHub as platforms; the user's own device and browser.

## Method

1. **Five independent reviews**, each by an agent that had not written the code: database; dashboard server; extension; supply chain/CI/secrets; and an attacker's view across components (an outsider, another user, a malicious web page, a malicious extension, a stolen session).
2. **Product-owner decisions** where a fix changes product behaviour (2026-11-10): upload caps of 1,000 rows/hour and 3,500/24 h with no overlapping intervals per device; an OAuth sign-in within 10 minutes before account deletion; the extension keeps the user's email but not their name or avatar.
3. **One issue and one pull request per area** (#111–#114 → PRs #116–#119), each with tests, green CI and its own independent review; every review finding was fixed or explicitly accepted before merge.
4. **Production probe**: a read-only script run by the product owner against the live dashboard and Supabase project using only public information (the publishable key from the extension build), never printing it.
5. **Owner settings checklist** (#115) for what only the account owner can change; each item checked through the GitHub API where possible.

## Findings and fixes

| Severity | Finding | Fix (merged) |
|---|---|---|
| High | **Upload flood.** 10,000 rows/hour per user, no daily cap, overlapping intervals accepted: a few throwaway accounts could fill the 500 MB database, which then turns read-only for everyone. | #116: 1,000 rows/hour and 3,500/24 h per user (`PT429`; the extension backs off for an hour and keeps the data), overlapping intervals from the same device skipped (DATA-09/09a), 128 kB payload limit |
| High | **Backup secret.** The full-power database URL was a repository secret visible to every step of the backup job, and the workflow could run from any branch. | #117: GitHub environment `production-backup` limited to `main`; the URL reaches only the dump step; repository-level copies deleted. Verified by a manual run from `main` (encrypted artifact produced) |
| Medium | **Extension data after the account is gone.** After account deletion or "Sign out of all devices" the extension kept the previous user's sites, totals and quarantine; with unsynced data of a gone account no other account could ever connect. | #118: **Forget local data** (AUTH-11a); every clear also replaces the device id and clears the sync status; an account epoch stops in-flight work from writing after a clear |
| Medium | **Account deletion with any live session**, however old it was. | #119: an OAuth sign-in within the last 10 minutes is required (AUTH-14) |
| Medium | **Repository and hosting settings**: `main` unprotected, no Dependabot, Vercel secret scope and preview protection, no per-IP limit on auth routes. | #115 (owner settings, below) |
| Low | Totals RPCs read every time-zone file on each call; extreme dates surfaced raw overflow errors. | #116: bounded dates, a cheap zone check |
| Low | Anonymous-sign-in JWTs were refused only by the ingest RPC. | #116: restrictive policies on both tables |
| Low | CSP allowed browser calls to Supabase; no COOP/CORP. | #119: `connect-src 'self'`; `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin` |
| Low | Server site list cached without validation; the extension stored the OAuth name, avatar and identities. | #118 (email kept by decision) |
| Low | No `SECURITY.md`, no release-age delay for new packages, `.gitignore` gaps for key files. | #117: 7-day `minimumReleaseAge` (temporary exclude list to be removed after 2026-11-13, #120), Dependabot with a matching 7-day cooldown |
| Docs | ADR-0003 and AUTH-09 understated what a dashboard XSS could do with the extension handoff. | #118 |
| Production | **The Email sign-in provider was enabled** in production, so anyone could sign up with an email and password, outside AUTH-01. Found by the probe. | Disabled by the product owner on 2026-11-10; the probe confirms `email: false` |

### Found while reviewing the fixes

The independent reviews of the PRs caught three problems in the first versions of the fixes. All were fixed before merge.

- **Recent sign-in could be faked (#119).** The first version accepted any fresh `amr` entry. A stolen session can create one without signing in again, by enrolling its own MFA factor or by redeeming an extension-link token (an `otp` entry). Now only `oauth` entries count; unit and integration tests cover both routes.
- **Unbounded memory from time-zone names (#116).** Replacing the costly time-zone lookup with "load the zone" let any name that parses as a POSIX spec (any name with a digit) stay in the database connection's cache for good, about 23 KB each (measured by the #116 reviewer on a local Postgres 16). Now digits are allowed only in the real names that contain one (`Etc/GMT±N`, four legacy US zones). A test keeps every real zone name accepted, and the reviewer's 50,000-name fuzz run against the final rule left the cache at about 3 MB.
- **Stale writes after a clear (#118).** A sync cycle or a site-list refresh in flight could write the previous account's sync status or sites back after Forget local data. They are now guarded by the account epoch.

## Evidence

- **Database:** 212 pgTAP tests, including catalog-wide checks in `060_security.test.sql`:
  - RLS is forced on every table;
  - no function is executable by `anon`;
  - every SECURITY DEFINER function pins `search_path=''`;
  - `private` is closed to clients;
  - a new table gets no client privileges by default.
- **Application:** 419 unit and component tests. The dashboard has integration tests against the local stack (same-origin checks, link quota, account deletion, the stale and non-OAuth sign-in refusals), and there are real-Chromium end-to-end tests.
- **CI:** every PR runs lint, typecheck, tests, build, the pgTAP suite and the full backup → restore round trip. `main` now requires both CI jobs.
- **Production probe** (2026-11-10, after the merges and the Email change):

| Check | Result |
|---|---|
| Dashboard headers | Nonce CSP with `connect-src 'self'`, `frame-ancestors 'none'`; HSTS; `X-Frame-Options: DENY`; `nosniff`; Referrer-Policy; Permissions-Policy; COOP and CORP `same-origin`; no `x-powered-by` |
| Supabase sign-in methods | Google and GitHub only; Email, phone and anonymous off |
| Anonymous reads and writes | Refused (`42501`) on both tables; `private` schema not exposed |
| Anonymous RPCs | All four refused |
| API schema listing | Empty for anonymous visitors |
| Dashboard API without a session | 401 for every route, including foreign-origin requests (the session check runs before the origin check) |
| Open redirect | `next=https://evil.example` becomes `/` |
| Secret files (`/.env`, `/.git/config`, path tricks) | Not served (redirect to sign-in) |

## Owner settings (#115)

| Setting | State | How it was checked |
|---|---|---|
| GitHub ruleset on `main`: no deletion or force-push; pull request required; both CI checks required; no bypass | Done | GitHub API |
| Private vulnerability reporting, Dependabot security updates, secret scanning with push protection | Done | GitHub API |
| Environment `production-backup` (`main` only) holding the database URL and the age recipient; repository-level copies deleted | Done | Backup run from `main` succeeded with the repository copies gone |
| Actions default token read-only | Done | Confirmed by the product owner |
| Vercel: secret key scoped to Production, Deployment Protection on previews, firewall rate limit on `/auth/sign-in` and `/auth/callback` | Done | Confirmed by the product owner |
| Supabase: Email provider and anonymous sign-ins off | Done | Production probe |
| Supabase: MFA enrollment off; manual identity linking off | Done | Confirmed by the product owner |
| Secret scanning validity checks and non-provider patterns | Off (optional) | GitHub API. Basic secret scanning and push protection already cover provider keys |

## Residual risks (accepted for v0)

- **Dashboard XSS is the worst case.** It could read the user's data and mint a lasting extension session (ADR-0003). Defences: nonce CSP with `strict-dynamic`, no third-party scripts, same-origin checks, the 5/min link quota.
- **Recent sign-in relies on the identity provider.** If Google or GitHub still has the person signed in on that computer, signing in again is one click (AUTH-14). Signing in again does not revoke the previous dashboard session, which expires normally.
- **Access tokens live up to 1 hour** after revocation or account deletion (Supabase default); writes fail anyway because the user is gone (AUTH-13).
- **Users can write junk about themselves** within the caps. It affects only their own data.
- **Auth endpoints rely on platform rate limits**: the Vercel firewall rule and Supabase's own limits.
- **Platform backups and logs** follow Supabase and Vercel retention, disclosed on `/privacy` (SEC-13).

## Follow-ups

- #120: remove the temporary `minimumReleaseAgeExclude` list after 2026-11-13.
- Re-run `security-probe.sh` after any change to auth settings, headers or routes, and before each release.

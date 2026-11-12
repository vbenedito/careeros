---
plugin: grill
version: 1.2.3
date: 2026-11-12
target: /home/claude/careeros
style: Paranoid Mode (Edge Case Gauntlet)
addons: [Assumptions audit, Scale stress, Hidden costs]
agents: [grill:recon (haiku), grill:architecture (sonnet), grill:error-handling (sonnet), grill:security (opus), grill:testing (sonnet), grill:edge-cases (opus)]
---

# CareerOS — codebase grill (v0 close-out), 2026-11-12

Scope: `main` at `01259e7` — Chrome MV3 extension, Next 16 dashboard and landing, Supabase schema/RPCs, CI and ops workflows. Read-only analysis; nothing was executed against production. All five deep-dive agents completed. Findings below are deduplicated; where agents disagreed, the stronger evidence wins. No `[CRITICAL]` findings.

Note on recon: it reported 26 migrations; the architecture agent counted 7 migration files. The difference does not affect any finding.

## 1. Findings by area

### Edge cases and data integrity (Paranoid Mode)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| E1 | HIGH | **Token refresh has no timeout and runs inside the auth lock, which has none either.** A stalled connection blocks every sync cycle ("skipped"), domain refresh, dashboard Connect and Disconnect (always SYNC_IN_PROGRESS) until Chrome kills the worker. A kill after the server rotated the refresh token but before storing it can force a reconnect. | `apps/extension/src/background/auth/supabase-backend.ts:148`, `auth/mutex.ts:11`, `sync/sync-service.ts:125` |
| E2 | MEDIUM | **Disconnect race:** an alarm cycle can start between `waitIdle` and taking the lock; the final sync (`ifIdle`) is skipped and the popup reports UNSYNCED_DATA, inviting the user to discard data that would upload seconds later. | `auth/auth-service.ts:230-243`, `background/index.ts:111-114` |
| E3 | MEDIUM | **Clock moved back > 30 min:** the engine accepts overlapping intervals; the server silently skips same-device overlaps (DATA-09a), so they are quarantined for good, and an all-overlap batch trips the SYNC-05b "server bug" backoff (1 h, "Sync error"). | `engine/engine.ts:195-198`, `migrations/20261110100000_security_hardening.sql:69-79`, `sync-service.ts:160` |
| E4 | MEDIUM | **Web: re-adding an existing site at exactly 12 returns 422 LIMIT_REACHED** (BEFORE INSERT limit trigger fires before the unique check). The extension handles this (#54); the web route doesn't, contradicting its own comment. | `apps/web/app/api/sites/route.ts:23-37`, `migrations/20261112100000_tracked_domain_limit_12.sql:18` |
| E5 | LOW | Ingest caps (1,000/h, 3,500/24 h) count pure retries; a multi-week offline backlog can age past 30 days before it uploads. | `migrations/20261110100000_security_hardening.sql:49-57` |
| E+ | GOOD | Idempotent ingest by client id; atomic engine+outbox writes; ±1 day totals window covers UTC−12…+14; DST-safe local midnight; Monday weeks; storage far below quota. | edge-cases agent |

### Error handling and observability

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| H1 | HIGH | **Nobody learns when production breaks.** No error tracking or alerting; `error.tsx` discards the error; only 4 server files log. | `apps/web/lib/log.ts:6`, `apps/web/app/error.tsx:6` |
| H2 | HIGH | **Upload failures and quarantine growth are invisible server-side**; extension failures only reach the local console and the user's popup. | `apps/extension/src/background/sync/sync-service.ts:146-196` |
| H3 | HIGH | **Production build doesn't validate the settings that broke this week** (`SITE_URL`, `NEXT_PUBLIC_EXTENSION_ID`, `NEXT_PUBLIC_SUPABASE_*`, `EXTENSION_INSTALL_URL`): silent fallbacks to the Vercel domain/localhost and the store search; a missing `SITE_URL` silently drops HSTS. | `apps/web/next.config.ts:5-12`, `lib/env.ts:55-61`, `lib/landing/links.ts:22-30` |
| H4 | MEDIUM | `/api/sites` 500s don't log the DB error (cause lost). | `app/api/sites/route.ts:40`, `sites/[id]/route.ts:22` |
| H5 | MEDIUM | Extension catch-alls return FAILED/INTERNAL with no error kind recorded. | `background/index.ts:208,216`, `messaging/external.ts:86`, `sync-service.ts:198` |
| H6 | MEDIUM | `/settings?error=delete` mixes "confirmation typed wrong" with "server failed". | `app/api/account/delete/route.ts:25,45` |
| H7 | MEDIUM | Backup workflow can lapse silently (missing config = green notice; schedules disabled after 60 days of inactivity). | `.github/workflows/backup.yml:38-49` |
| H+ | GOOD | Log hygiene: JSON, codes only, no PII, capped messages; env fail-fast where present. | `apps/web/lib/log.ts` |

### Security

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | LOW | **Landing `/` sends full URLs to analytics** (no `beforeSend` on the static page): an OAuth fallback (`/?code=…`, `/?error_description=…`) or a shared link with personal data in the query would be stored — breaks the SEC-15 promise. | `apps/web/lib/landing/page.ts:300` |
| S2 | LOW | **Vercel's analytics script runs on `/connect` and `/settings`**, the pages that mint extension sessions and delete accounts; the v0 audit's "no third-party scripts" residual-risk statement is now outdated. | `components/app/web-analytics.tsx:9-13`, `docs/history/security-audit-v0.md:90` |
| S3 | LOW | **Migrations auto-apply to production on merge with no required approver** in GitHub; no test that every RLS policy still compares with `auth.uid()`. | `.github/workflows/migrate.yml:18-23,45,144-152` |
| S+ | GOOD | Domain-limit migration keeps lock/`search_path`/revoke; insert-only grants; messaging rejects foreign senders/origins; popup has no `innerHTML`; landing CSP strict; 7-day release-age policy. | security agent |

### Testing and CI

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| T1 | HIGH | **The production migration path is untested:** CI applies all migrations to an empty DB; production gets incremental `db push` on live data, with no post-apply check. | `.github/workflows/migrate.yml:127-162`, `ci.yml:137` |
| T2 | HIGH | **Nothing is tested in production conditions:** hosted Supabase CORS/`Date` header, Vercel build-time env, store ID + `externally_connectable`, the store zip actually loading. | `scripts/ci/integration.sh:9-19`, `ci.yml:96` |
| T3 | MEDIUM | Coverage thresholds only on `packages/shared` and `engine`; none on `background/sync/**`, `background/auth/**`. | `vitest.config.ts:17-19` |
| T4 | MEDIUM | Account deletion: no DB-level proof that every user-owned row is gone (GDPR erasure). | `apps/web/tests/integration/settings.int.test.ts` |
| T5 | MEDIUM | Ingest idempotency is never tested under concurrency (parallel identical batches). | `supabase/tests/database/` |
| T6 | MEDIUM | Server readiness loop doesn't fail after 60 tries; tests then run against a dead server. Some sleeps in tests. | `scripts/ci/integration.sh:24` |
| T7 | MEDIUM | No dependency/security scanning (`pnpm audit`, CodeQL, secret scan), no `actionlint` in PR CI. | `.github/workflows/ci.yml` |
| T8 | LOW | Backend job is serial; it scales linearly with tests. | `ci.yml:101-185` |
| T+ | GOOD | SHA-pinned actions; backup→restore round trip each run; spec-ID traceability; real-Chromium extension E2E with the real handoff; hardened migrate workflow. | testing agent |

### Architecture (v1 readiness)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| A1 | HIGH | **Business limits live in three places with no single owner:** the 12-site limit is a SQL literal; the shared constant only drives messages; landing copy hard-codes "12". The 50→12 change needed a function rewrite plus hand edits everywhere. | `migrations/20261112100000_tracked_domain_limit_12.sql:18`, `packages/shared/src/constants.ts:45`, `apps/web/lib/landing/content.ts:42,52` |
| A2 | HIGH | **No entitlements model** for v1 premium; both clients map a hard-coded `hint === "DATA-01"`; landing says "There's no paid plan" (tested copy). | `app/api/sites/route.ts:37`, `background/domains/supabase-domains.ts:15`, `lib/landing/content.ts:66` |
| A3 | MEDIUM | Protocol versioning is a stub: `.strict()` reply schemas break on any added field; a parse failure is shown as "not installed" instead of "outdated". | `background/messaging/external.ts:16`, `apps/web/lib/extension/protocol.ts:12,36` |
| A4 | MEDIUM | Ingest SQL repeats constants (1830 s, 30 days, 5 min, 200, 10000) with no parity test. | `migrations/20261105120000_ingest_study_sessions.sql:51,52,85,95` |
| A5 | MEDIUM | Proxy's `pathname === "/"` CSP exception won't scale to v1 marketing pages (pricing needs checkout JS). | `apps/web/proxy.ts:71,83` |
| A6 | MEDIUM | Scale: dashboards aggregate raw rows on every load; three indexes on `study_sessions` (one possibly redundant). | `migrations/20261105120000…:91-97`, `20261105130000_totals_rpcs.sql:43-56` |
| A+ | GOOD | Proxy as one ordered gate; clean dependency direction; ingest RPC as the single write path with server-side re-validation. | architecture agent |

## 2. Edge Case Risk Matrix

| # | Scenario | Likelihood | Impact | Risk | Component | File |
|---|---|---|---|---|---|---|
| E1 | Hung refresh holds the auth lock; sync, Connect and Disconnect stuck | Medium | High | **High** | extension auth | `background/auth/supabase-backend.ts:148` |
| E2 | Cycle starts between `waitIdle` and the lock; user discards data that would upload | Low–Med | High | Medium | Disconnect | `background/auth/auth-service.ts:230` |
| E3 | Clock moved back > 30 min; overlaps quarantined, false backoff | Low | Med–High | Medium | engine + ingest | `background/sync/sync-service.ts:160` |
| E4 | Re-adding an existing site at exactly 12 returns 422 | Medium | Low | Medium | web sites API | `apps/web/app/api/sites/route.ts:37` |
| S1 | OAuth fallback or shared link puts personal data in landing analytics | Low | Medium | Low | landing analytics | `apps/web/lib/landing/page.ts:300` |
| E5 | Offline backlog hits ingest caps and ages past 30 days | Low | Medium | Low | ingest RPC | `migrations/20261110100000…:49` |

## 3. Add-on pressure tests

### Scale stress (100× users, bigger team)
1. **First to break:** dashboard reads — three RPCs over raw rows per load (A6). Watch p95 of `get_daily_totals`; add a daily rollup when it passes ~200 ms.
2. **Ingest contention:** per-user advisory lock + quota count on every 5-min batch from every client (A6).
3. **Proxy `getClaims()` on every request**, including the landing page.
4. **Team:** a single rule spans trigger, error hint, extension, web route and pgTAP (A1, A2); without a contract test for old extensions, server changes can break released clients (hidden cost 1).
5. **CI:** the serial backend job grows linearly (T8).

### Hidden costs
1. **Operational:** every server change must stay compatible with every released extension; nothing enforces it (old-client contract tests are missing).
2. **Debugging:** no production error signal (H1, H2); diagnosing means asking users for popup screenshots.
3. **Configuration:** build-time variables in the right Vercel project and scope, verified only by eye (H3) — two incidents this week.
4. **Onboarding:** a value change touches spec, constants, SQL, copy and docs together (A1); the spec-ID scheme is a strength but heavy.
5. **Data retention:** 90-day encrypted pre-migration dumps and 14-day screenshot artifacts carry storage cost and hold production data (T8).

### Assumptions audit
| Assumption | Quick validation |
|---|---|
| Hosted Supabase exposes `Date` to the extension (clock-ahead fix depends on it) | Post-deploy probe from the production origin (T2) |
| `NEXT_PUBLIC_*` are set in the project/scope that builds production | Build-time validation (H3) + smoke check of page source |
| Database error messages never carry user data | Grep migrations for `RAISE` with interpolated values |
| GitHub schedules (backup) stay enabled | Monthly "last scheduled run" check / freshness alert (H7) |
| Backups are restorable from production, not just CI | One restore drill into a scratch database |
| The service worker's single-cycle guard holds with two windows/profiles | Manual test with two profiles |
| Analytics never receives personal data | Probe `/` with a query string and inspect the beacon (S1) |
| Users rarely move clocks back > 30 min | Count quarantined overlaps once server-side metrics exist (H2) |

## 4. Executive summary

**Verdict.** CareerOS is in good shape for a v0: the security posture held after this week's changes (no critical, high or medium security findings), data writes are idempotent and well tested, and CI is unusually rigorous for the project's size. The biggest risk is not a bug in the code but **operating blind**: there is no signal when production, uploads or configuration go wrong (H1–H3, T2), and one extension failure mode (E1) can freeze sync until Chrome restarts the worker. For v1, the main structural gap is that limits are hard-coded in several places with no entitlements model (A1–A2).

**Top 3 actions**
1. **Fix E1 and E2 in the extension** (refresh timeout; "still syncing" instead of "unsynced" when the final sync was skipped) — small changes that remove the only paths to frozen sync and to users discarding data needlessly.
2. **See production:** fail the production build on missing/wrong settings (H3), add a post-deploy smoke check incl. the `Date`/CORS probe (T2), and add error reporting plus a daily server-side sync health check (H1, H2).
3. **Before v1 pricing work:** design entitlements once (A1, A2) — a server-owned limits source, an error contract carrying `limit` and `plan`, and forward-compatible protocol schemas (A3).

**Confidence**
| Recommendation | Confidence | What would raise it |
|---|---|---|
| E1 refresh timeout | High | A test with a never-resolving refresh |
| E2 disconnect race | Medium | A deterministic test interleaving alarm and Disconnect |
| H3 build validation | High | Already matched by two real incidents |
| T2 post-deploy smoke | High | — |
| T1 incremental-migration test | Medium | A migration that behaved differently on live data (none yet) |
| A1/A2 entitlements | High (direction), Medium (design) | v1 pricing decisions from discovery |
| S1–S3 | Medium | Probing the production beacon (S1) |

**Paranoid verdict.** The single scariest failure: a token refresh with no timeout inside a lock with no timeout (E1). One stalled connection on a flaky network stops every sync, domain refresh, Connect and Disconnect; Disconnect keeps saying "still syncing", and a frustrated user may discard data to get out. Nothing recovers until Chrome kills the worker.

## Fixing Plan

### Phase 1: Critical fixes
None.

### Phase 2: High-priority fixes (this sprint)
- **E1** — Hung refresh blocks sync/Connect/Disconnect (`background/auth/supabase-backend.ts:148`). **Fix:** race `refresh()` with a 15 s timeout → `"unavailable"`; add a lock-acquire timeout; test with a never-resolving refresh. **Effort:** < 1 day. **Files:** `background/auth/supabase-backend.ts`, `background/auth/mutex.ts`, tests.
- **H3** — Production build accepts missing/wrong settings (`apps/web/next.config.ts`). **Fix:** when `VERCEL_ENV=production`, require https `SITE_URL`, `NEXT_PUBLIC_EXTENSION_ID` matching `^[a-p]{32}$`, `NEXT_PUBLIC_SUPABASE_URL`, `EXTENSION_INSTALL_URL`; tests. **Effort:** < 1 day. **Files:** `apps/web/next.config.ts`, `apps/web/lib/env.ts`.
- **T2** — No production-condition checks. **Fix:** scheduled/post-deploy smoke workflow (read-only): landing canonical and install link, `/robots.txt`, `/sitemap.xml`, CORS preflight and `Date` exposure from the production origin. **Effort:** < 1 week. **Files:** `.github/workflows/smoke.yml`, `scripts/ci/smoke.ts`.
- **H1** — No production error signal. **Fix:** report from `error.tsx`/`global-error.tsx` and `instrumentation.ts` `onRequestError`; choose a tool (needs a decision: privacy and cost) or start with a Vercel log drain alert. **Effort:** < 1 day once chosen. **Files:** `apps/web/app/error.tsx`, `global-error.tsx`, `instrumentation.ts`.
- **H2** — Sync failures invisible. **Fix:** scheduled SQL health check (no client telemetry): new sessions per day vs. active users, ingest rejections; open an issue on anomalies. **Effort:** < 1 day. **Files:** `.github/workflows/health.yml`, SQL script.
- **T1** — Incremental migration path untested. **Fix:** CI step applying the previous release's migrations + seed, then the PR's new ones, then pgTAP; read-only post-apply smoke in `migrate.yml`. **Effort:** < 1 week. **Files:** `.github/workflows/ci.yml`, `migrate.yml`, `supabase/tests/`.
- **A1/A2** — Limits without an owner; no entitlements. **Fix:** in v1 design (ADR): server-owned limits, `get_entitlements()`, error contract with `limit`/`plan`, landing copy from constants. **Effort:** < 1 month (v1). **Files:** new migration, `packages/shared`, both clients, landing.

### Phase 3: Medium-priority improvements (next sprint)
- **E2** — Return SYNC_IN_PROGRESS when the final sync was skipped. < 1 day. `background/auth/auth-service.ts`.
- **E4** — Web: re-adding an existing site at the limit returns 200. < 1 day. `apps/web/app/api/sites/route.ts`.
- **E3** — Report overlap rejections separately; keep them out of the SYNC-05b check. < 1 week (RPC contract change; ADR). migration + `sync-service.ts`.
- **H4** — Log DB errors before 500 in `/api/sites`. < 1 day.
- **H5** — Record a coarse `lastErrorKind` in extension catch-alls. < 1 day.
- **H6** — Distinct delete-failure error and copy. < 1 day.
- **H7** — Backup config check fails the run; weekly freshness check. < 1 day. `.github/workflows/backup.yml`.
- **T3** — Coverage floors for `background/sync/**` and `background/auth/**`. < 1 day.
- **T4** — pgTAP: deleting a user leaves zero rows in every `user_id` table. < 1 day.
- **T5** — Concurrent identical ingest batches test. < 1 day.
- **T6** — Readiness loop fails when the server never starts; replace sleeps with polling. < 1 day.
- **T7** — `pnpm audit --prod`, `actionlint`, secret scan in CI. < 1 day.
- **A3** — Forward-compatible reply schemas; "outdated" instead of "not installed". < 1 day.
- **A4** — Extend DB parity tests to ingest literals. < 1 day.
- **A5** — Route-group CSP table before adding marketing pages. < 1 week (v1).
- **A6** — Measure p95; rollup only when needed; check redundant index. < 1 week (when needed).

### Phase 4: Low-priority cleanup (when touching these files)
- `apps/web/lib/landing/page.ts` — **S1:** filter analytics on `/` (hashed inline `beforeSend` or redirect query URLs to bare `/` except `utm_*`).
- `apps/web/components/app/web-analytics.tsx` — **S2:** don't load analytics on `/connect` and `/settings`; update ADR-0003/0010 residual risk.
- `.github/workflows/migrate.yml` — **S3:** required reviewer on the apply path (or a `production-migrate` environment); pgTAP check that every policy references `auth.uid()`.
- `supabase/migrations` (ingest) — **E5:** count only new rows toward ingest caps.
- `.github/workflows/ci.yml` — **T8:** split the backend job when it passes ~8 min.

### Dependency graph
- H2 (health check) is more useful after H1 (error reporting) defines where alerts go.
- E3 depends on an ingest RPC contract change → needs an ADR and backward compatibility with released extensions (same constraint as #150).
- A1/A2 depend on v1 pricing decisions (discovery); A3 should land before or with A2 (entitlements will add reply fields).
- S3 (required reviewer) changes the "migrations apply on merge" flow documented in #148 → product-owner decision.

### Estimated total effort
- Phase 1: 0 days
- Phase 2: ~6–8 days (excluding A1/A2, which belong to v1: ~2–4 weeks)
- Phase 3: ~6–8 days
- Phase 4: ~2 days (opportunistic)
- **Total (v0 hardening, excluding v1 entitlements): ~14–18 days**

# v0 test report

Spec: [`specs/v0/08-testing.md`](../../specs/v0/08-testing.md) (TEST). Status: **draft**. One manual result is pending, marked ⏳.

## 1. Automated tests

All layers run in CI on every pull request and on `main` (TEST §5). Figures from the CI run of `main` at `14c0eb7` (2026-11-09).

| Layer | Tool | Scope | Result |
|---|---|---|---|
| Unit and component | Vitest (+ Testing Library, jsdom) | Tracking engine (fake clock), domain rules, formatting, sync queue/backoff/quarantine, storage, message handlers, dashboard view models, popup and dashboard components | **396 tests** in 43 files, all passing |
| Database | pgTAP (`supabase test db`, Docker) | RLS isolation, constraints, triggers, RPC idempotency and validation, totals with time zones, cascade delete, link rate limit | **169 tests** in 7 files, all passing |
| Integration: dashboard | Vitest against the local Supabase stack and the built dashboard | Auth guard, extension link route, dashboard data and time zones, settings routes (sites CRUD, sign-out scopes, account deletion), privacy page, no third-party scripts | **34 tests**, all passing |
| Integration: extension | Vitest + Playwright (real Chromium, unpacked build) | Connection handoff, `/connect` page, domain sync, interval sync and quarantine, dashboard shell, pointer cursor and destructive colours | **28 tests**, all passing |
| E2E | Vitest + Playwright (real Chromium) | (a) Dashboard journey: period navigation, Settings site CRUD, delete account, sign-in loading state and first OAuth hop without CSP errors. (b) Extension smoke: real tracking on a local page under a tracked domain → outbox → popup → sync to Supabase; storage holds no paths or untracked hosts | **8 tests**, all passing |
| Backup → restore | `scripts/ops/backup-restore-test.sh` | Dump → age encryption → decrypt → fresh schema → restore → identical rows | Passing (31 users, 57 sites, 17 sessions restored identically) |

**Coverage (TEST §3):** `packages/shared` 100 % lines, 97.67 % branches; tracking engine 100 % lines, 99.16 % branches (threshold: 90 %). Overall: 83.97 % lines (83.34 % statements).

**Spec-to-test traceability:** test names carry requirement IDs (e.g. `TRK-05 …`, `SYNC-04 …`, `DASH-11 …`), so each acceptance criterion can be found with a search for its ID.

## 2. Manual checks (TEST §4)

Run by the product owner on production (`https://careeros-taupe.vercel.app`, extension production builds v0.1.0 and v0.1.1).

| # | Check | Result | Date |
|---|---|---|---|
| 1 | **Stopwatch accuracy:** 10-minute sessions with tab switches and idle pauses, compared with a phone stopwatch; within ±2 % | ✅ Passed, by the product owner's check. The per-session figures were not recorded (see below). | 2026-11-09 |
| 2 | **Media rule** with a real video (counts without input up to ~15 min, then pauses) | ✅ Passed | 2026-11-09 |
| 3 | **Real Google and GitHub sign-up** on production | ✅ Passed with both providers; no CSP errors in the console | 2026-11-08 |
| 4 | **Independent refresh soak**, extension and dashboard, 24 h | ⏳ **12 h passed** (tracking, sync and dashboard metrics all fine); the full 24 h is pending | 2026-11-09 |
| 5 | **Visual pass**, light/dark, 360 / 768 / 1440 px | ✅ Passed after fixes (below) | 2026-11-09 |

### Stopwatch sessions (check 1)

The product owner compared the popup's "Today" total before and after each session with a phone stopwatch (paused while away from the tracked site, and from 60 s after the last input, the idle threshold, TRK-05) and reported the result as within tolerance. The individual times were not written down, so this report records the check as passed by the product owner without per-session figures. The popup shows whole minutes, so each comparison is accurate to about one minute.

### Findings from the manual checks, all fixed before delivery

| Found in | Finding | Fix |
|---|---|---|
| Production launch | Supabase CLI 3 pushes migrations to the **local** stack unless `--remote` is given; the production database was empty | Docs corrected; dashboard and auth errors are now logged (#88, #89) |
| Production launch | Wrong secret key in Vercel gave a silent 500 on connect | Admin-call failures logged with their cause (#89) |
| Production launch | Activity bar showed 2m while the cards said 1m | Exact bar heights (#90) |
| Visual pass | Header overflowed below ~500 px (133 px at 360 px) | Header wraps by its own width (#91) |
| Visual pass | Phones were asked to install the extension | Phone/tablet message instead (#91) |
| Visual pass | Y-axis label "1h 00m" clipped | Axis sized to its longest label (#90) |
| Product owner review | No feedback while redirecting to the OAuth provider; arrow cursor on buttons; deletion controls not red | #93, #94, #95 |

## 3. Production launch checks (#31)

All passed on 2026-11-08: Supabase in São Paulo with migrations applied, auth settings matching spike 0003, real sign-up with both providers, Google app published, dashboard deployed, privacy page filled, production extension connected, tracked time visible on the dashboard, backup workflow green. Details: issue #31.

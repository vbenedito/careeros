# 08 — Testing Strategy

Status: **Approved (2026-11-04)**

Amended 2026-11-11 (#131): §2 layers, §3 coverage scope and §5 CI gates as implemented.

Amended 2026-11-12 (#142): responsive layout checks (TEST-01, §2.1), the Responsive layer in §2, §4 item 5 narrowed to colours and themes, §5 CI gates.

Amended 2026-11-12 (#157): spec-ID traceability check (TEST-02, §2.2) and the CI gate in §5.

Amended 2026-11-12 (#155, #156): §5 CI gates add the Markdown link check and the store package check.

Amended 2026-11-12 (#82): §6 test reliability rules (day boundaries, sync races, local auth rate limits).

Amended 2026-11-13 (grill T3–T6, S3, A4): coverage floors for the sync and auth modules (TEST-03), account-erasure, concurrent-ingest and RLS-policy tests (TEST-04, TEST-05, TEST-07), the integration server readiness check (TEST-06), database constant parity (TEST-08), and polling instead of fixed sleeps (§6).

## 1. Principles

- Test the rules where they live: pure logic gets fast unit tests; database rules get database tests; only critical journeys get E2E.
- Every acceptance criterion in specs 01–07 maps to at least one automated test or an explicit manual check listed in §4.
- Tests reference requirement IDs in their names (e.g. `TRK-05 pauses at idle detection`).

## 2. Layers

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | **Vitest** | Tracking engine (fake clock), domain normalization/matching, duration formatting, sync queue/backoff/quarantine logic, storage adapter, message handler validation, dashboard data transforms | local + CI |
| Component | Vitest + **Testing Library** (jsdom, opted in per file) | Popup states (`apps/extension/src/popup`); dashboard components such as the sidebar, redirect form and account settings (`apps/web/components`) | local + CI |
| Database | **pgTAP** via `supabase test db` (Docker) | RLS isolation, constraints, triggers, RPC idempotency/validation, totals with time zones, cascade delete | local (Docker Desktop) + CI |
| Integration | Vitest against local Supabase and one built dashboard server (`scripts/ci/integration.sh`) | `apps/web/tests/integration`: dashboard routes over HTTP (auth, dashboard data, settings, link route, privacy, landing). `apps/extension/tests/integration`: the built extension in real Chromium (Playwright library) — connect, `/connect` page, sync, tracked domains, dashboard shell | CI (+ local with Docker) |
| Responsive | Vitest driving the Playwright library, checks in `apps/extension/tests/support/responsive.ts` | TEST-01: landing (`apps/extension/tests/responsive`, `pnpm test:responsive`, no backend); privacy, sign-in, dashboard and settings (`apps/extension/tests/e2e/responsive.e2e.test.ts`, with the E2E suite) | CI (landing: local too) |
| E2E | Vitest driving the **Playwright** library (not `@playwright/test`); all E2E lives in `apps/extension/tests/e2e` | (a) `dashboard.e2e.test.ts`: dashboard with a seeded user and data: sign-in via test session, period navigation, settings domain CRUD, account deletion. (b) `tracking.e2e.test.ts`: extension smoke: load the unpacked development build in Chromium, track on a local test page served under a tracked test domain, popup shows time, outbox syncs to local Supabase. | CI |

`apps/web` has no Playwright dependency; browser tests of the dashboard run from `apps/extension`.

### 2.1 Responsive layout

- **TEST-01** Every page is checked in Chromium at 360, 390, 768, 1024 and 1440 px wide (`deviceScaleFactor` 1): the landing page (`renderLanding`, served without a backend, plus every CSS-only toggle state at 390 px and reduced motion at 360 px), privacy, sign-in, dashboard (week and month, with sample data) and settings, and the mobile drawer closed and open at 390 px. `assertResponsive` fails, naming the rule, width, element and its box, when:
  1. the document scrolls horizontally (`scrollWidth` > viewport width);
  2. a visible element extends beyond the viewport. Exempt only: content of a clipping box (`overflow` hidden/clip) or horizontal scroller (`overflow` auto/scroll) that itself fits the viewport, and visually hidden `.sr` / `.sr-only` elements. Fixed elements are always held to the viewport;
  3. text is clipped, by its own box or by a clipping ancestor (an ellipsis on the text's own box and scrollers are allowed). The landing site belt is skipped while it scrolls (a marquee) and checked with reduced motion;
  4. a group meant to be centred is not: each line of its children is centred in its parent's content box ±2 px (landing: the final CTA pair and the privacy badge row);
  5. at widths ≤ 768 px, a button, `a.btn`, `[role=button]` or the label of a checkbox/radio toggle is under 44 px tall.

  Each check saves full-page PNGs to `responsive-screenshots/`; CI uploads them as the artifacts `responsive-screenshots-landing` and `responsive-screenshots-app` (14 days).

### 2.2 Spec traceability

- **TEST-02** `pnpm check:spec-trace` (`scripts/ci/spec-trace.ts`) lists the requirement IDs defined in `specs/**` (the bold `**ID**` markers and the `PRD-nn` table rows of the product scope) and the IDs in test titles (Vitest `it`/`test`/`describe` titles in unit, component, integration and E2E tests, and pgTAP descriptions). It **fails** when a test names an ID that no spec defines (a typo or a renamed requirement; an ID-like token at the start of a test name with a prefix no spec uses is flagged too, except known non-requirement tokens such as `GMT-14`, `UTF-8` or `ADR-0004`) and **warns**, with a count, for defined IDs that no test names. IDs that are not testable by design (decisions, process, settings outside the repository) are listed with a one-line reason in `specs/untested-ids.json`; the check fails when a listed ID has gained a test or no longer exists, when the file is not an object of ID → non-empty reason, or when no ID is found at all. Prefix typos in the middle of a test name are not detected. A new ID needs a test or an entry in that file. CI runs it in `checks` and writes the counts (defined, tested, allow-listed, untested) to the job summary.

- **TEST-03** `apps/extension/src/background/sync/**` and `background/auth/**` have coverage floors (lines, branches, functions, statements) in the root `vitest.config.ts`, set to the values measured on 2026-11-13 rounded down (sync 88/89/76/88, auth measured 96/86/94/93, set one point lower: 95/85/93/92). Floors are raised when coverage rises and are never lowered to make a change pass. `scripts/ci/coverage-floors.test.ts` fails when a floor is removed.
- **TEST-04** pgTAP `080_account_erasure.test.sql`: deleting an `auth.users` row, as the account-deletion route does (DATA-12), leaves zero rows of that user in every table of `public` and `private` that has a `user_id` column, discovered from `information_schema` so a table added later is covered without editing the test. Another user's rows are untouched.
- **TEST-05** `apps/web/tests/integration/ingest-concurrency.int.test.ts`: parallel identical `ingest_study_sessions` calls (against local Supabase) all succeed, each confirms every id, and the database holds exactly one row per id (DATA-08, SYNC-04).
- **TEST-06** `scripts/ci/integration.sh` waits for the dashboard with `scripts/ci/wait-for-server.sh`, which exits non-zero, naming the reason and printing the end of the server log, when the URL never answers within the attempts or the server process exits first; no integration test runs against a dead server.
- **TEST-07** pgTAP `090_rls_policies.test.sql` enumerates `pg_policies` for `public`: every USING and WITH CHECK expression references `auth.uid()`, no policy lacks both expressions, and every table has RLS enabled. Exceptions are an allow-list in the test with a reason each and must be RESTRICTIVE (they can only narrow access); today only the two `*_no_anonymous` policies, which test the `is_anonymous` claim (AUTH-01).
- **TEST-08** `packages/shared/src/db-parity.test.ts` reads the latest migration that defines each of `private.parse_study_session`, `public.ingest_study_sessions`, `get_daily_totals`, `get_domain_totals` and `private.enforce_tracked_domain_limit`, and fails when a literal drifts from `packages/shared` or the spec: the 1830 s interval cap (also in the overlap look-back and the table CHECK), the 30-day age limit, the 5-minute future tolerance, the 200-element batch, the 128 kB payload, the 1,000 / 3,500 abuse limits (DATA-09), the 92-day totals range (DATA-10/11) and the 12-domain limit (DATA-01).

OAuth with real Google/GitHub is **not** automated (third-party consent screens); tests create users with the Supabase admin API in the local stack. Real providers are checked manually in the production setup (issue #31).

## 3. Coverage targets

- `packages/shared/src` and the tracking engine (`apps/extension/src/engine`): ≥ 90% lines, branches, functions and statements (thresholds in the root `vitest.config.ts`).
- Coverage is measured for `packages/*/src` and `apps/extension/src` only; `apps/web` is not included yet.
- Overall: no global gate; reviewers check that changed behavior has tests.

## 4. Manual checks (documented in delivery report)

1. Stopwatch accuracy: 3 scripted 10-minute sessions incl. tab switches and idle pauses; result within ±2% (PRD success criteria).
2. Media rule with a real video.
3. Real Google and GitHub sign-up on production.
4. Extension/dashboard independent refresh soak (24 h).
5. Light/dark visual pass of popup and dashboard. Layout at 360–1440 px is automated by TEST-01; this pass covers colours and both themes.

## 5. CI gates (pull requests)

Lint · typecheck · spec-ID traceability (TEST-02) · unit/component (with coverage thresholds) · landing responsive layout (TEST-01) · Markdown link check (relative links and anchors in `docs/`, `specs/`, `README.md`, `AGENTS.md`, `SECURITY.md`) · build (extension + dashboard) · store package check (production store zip built with placeholder public values; manifest and file list asserted, STORE) · database tests · integration and E2E (including the app pages' responsive layout) · backup → restore round trip. All must pass to merge. Jobs and steps: ENV-08.

## 6. Test reliability

- **Day boundaries.** A test that seeds "today", "this week" or "this month" and reads it back from the dashboard (rendered on the server, so a browser clock cannot be frozen) or the popup calls `clearOfMidnight()` (`apps/web/tests/integration/helpers.ts`) first: within a margin (3 min by default) of the next UTC or local midnight it waits until just after it. Weeks and months start at a UTC midnight, so this covers all three.
- **Sync races.** The extension may sync an interval as soon as it is closed. A test reading the outbox accepts the interval either still queued or already in the database, and checks the database in the second case; it never expects an exact outbox length before triggering a sync itself.
- **Auth rate limits.** The suites sign in many users from one IP. The local stack's `[auth.rate_limit]` in `supabase/config.toml` is raised for this (local only: production limits live in the Supabase dashboard, and `config.toml` is never pushed). The session helpers retry a 429 with backoff (`retryOn429`). The product's own 429 handling is AUTH-11.
- **Waiting.** Tests wait for a condition, not a fixed time (poll with a deadline and a message naming what is missing, as `waitForEngine` does). The remaining `setTimeout` calls are deliberate: the 429 backoff (`retryOn429`), the wait past a midnight boundary (`clearOfMidnight`) and the poll interval itself.

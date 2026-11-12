# 08 — Testing Strategy

Status: **Approved (2026-11-04)**

Amended 2026-11-11 (#131): §2 layers, §3 coverage scope and §5 CI gates as implemented.

Amended 2026-11-12 (#142): responsive layout checks (TEST-01, §2.1), the Responsive layer in §2, §4 item 5 narrowed to colours and themes, §5 CI gates.

Amended 2026-11-12 (#82): §6 test reliability rules (day boundaries, sync races, local auth rate limits).

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

Lint · typecheck · unit/component (with coverage thresholds) · landing responsive layout (TEST-01) · build (extension + dashboard) · database tests · integration and E2E (including the app pages' responsive layout) · backup → restore round trip. All must pass to merge. Jobs and steps: ENV-08.

## 6. Test reliability

- **Day boundaries.** A test that seeds "today", "this week" or "this month" and reads it back from the dashboard (rendered on the server, so a browser clock cannot be frozen) or the popup calls `clearOfMidnight()` (`apps/web/tests/integration/helpers.ts`) first: within a margin (3 min by default) of the next UTC or local midnight it waits until just after it. Weeks and months start at a UTC midnight, so this covers all three.
- **Sync races.** The extension may sync an interval as soon as it is closed. A test reading the outbox accepts the interval either still queued or already in the database, and checks the database in the second case; it never expects an exact outbox length before triggering a sync itself.
- **Auth rate limits.** The suites sign in many users from one IP. The local stack's `[auth.rate_limit]` in `supabase/config.toml` is raised for this (local only: production limits live in the Supabase dashboard, and `config.toml` is never pushed). The session helpers retry a 429 with backoff (`retryOn429`). The product's own 429 handling is AUTH-11.

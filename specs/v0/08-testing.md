# 08 — Testing Strategy

Status: **Approved (2026-11-04)**

Amended 2026-11-11 (#131): §2 layers, §3 coverage scope and §5 CI gates as implemented.

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
| E2E | Vitest driving the **Playwright** library (not `@playwright/test`); all E2E lives in `apps/extension/tests/e2e` | (a) `dashboard.e2e.test.ts`: dashboard with a seeded user and data: sign-in via test session, period navigation, settings domain CRUD, account deletion. (b) `tracking.e2e.test.ts`: extension smoke: load the unpacked development build in Chromium, track on a local test page served under a tracked test domain, popup shows time, outbox syncs to local Supabase. | CI |

`apps/web` has no Playwright dependency; browser tests of the dashboard run from `apps/extension`.

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
5. Light/dark visual pass of popup and dashboard at 360 px, 768 px, 1440 px.

## 5. CI gates (pull requests)

Lint · typecheck · unit/component (with coverage thresholds) · build (extension + dashboard) · database tests · integration and E2E · backup → restore round trip. All must pass to merge. Jobs and steps: ENV-08.

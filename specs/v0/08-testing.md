# 08 — Testing Strategy

Status: **Approved (2026-11-04)**

## 1. Principles

- Test the rules where they live: pure logic gets fast unit tests; database rules get database tests; only critical journeys get E2E.
- Every acceptance criterion in specs 01–07 maps to at least one automated test or an explicit manual check listed in §4.
- Tests reference requirement IDs in their names (e.g. `TRK-05 pauses at idle detection`).

## 2. Layers

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | **Vitest** | Tracking engine (fake clock), domain normalization/matching, duration formatting, sync queue/backoff/quarantine logic, storage adapter, message handler validation, dashboard data transforms | local + CI |
| Component | Vitest + **Testing Library** (jsdom) | Popup states, dashboard cards/legend/empty states | local + CI |
| Database | **pgTAP** via `supabase test db` (Docker) | RLS isolation, constraints, triggers, RPC idempotency/validation, totals with time zones, cascade delete | local (Docker Desktop) + CI |
| Integration | Vitest against local Supabase | Sync client ↔ real `ingest_study_sessions`; `/api/extension/link` route | CI (+ local with Docker) |
| E2E | **Playwright** | (a) Dashboard with a seeded user and data: sign-in via test session, period navigation, settings domain CRUD. (b) Extension smoke: load unpacked build in Chromium, track on a local test page served under a tracked test domain, popup shows time, outbox syncs to local Supabase. | CI |

OAuth with real Google/GitHub is **not** automated (third-party consent screens); tests create users with the Supabase admin API in the local stack. Real providers are checked manually in the production setup (issue #31).

## 3. Coverage targets

- `packages/shared` and the tracking engine: ≥ 90% lines/branches.
- Overall: no global gate; reviewers check that changed behavior has tests.

## 4. Manual checks (documented in delivery report)

1. Stopwatch accuracy: 3 scripted 10-minute sessions incl. tab switches and idle pauses; result within ±2% (PRD success criteria).
2. Media rule with a real video.
3. Real Google and GitHub sign-up on production.
4. Extension/dashboard independent refresh soak (24 h).
5. Light/dark visual pass of popup and dashboard at 360 px, 768 px, 1440 px.

## 5. CI gates (pull requests)

Lint · typecheck · unit/component · build (extension + dashboard) · database tests · E2E. All must pass to merge.

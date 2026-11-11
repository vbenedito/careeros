# CareerOS v0 — delivery report (Gate 4)

> Snapshot as of 2026-11-09. Later changes: landing page at `/`, dashboard moved to `/dashboard` (#125/#127); Chrome Web Store package and listing (#128), production extension ID now the store item's (#130).

Status: **final**, for the product owner's Gate 4 approval. Period: 2026-11-04 → 2026-11-09.

## 1. What was delivered

- **Dashboard (production):** https://careeros-taupe.vercel.app (Vercel, Supabase Cloud in São Paulo).
- **Chrome extension:** GitHub Release [v0.1.1](https://github.com/vbenedito/careeros/releases/tag/v0.1.1), installed unpacked (ENV-05a). It is built from `main` at `b72774f` and includes the popup polish from #94/#95; v0.1.0 was the first production release.
- **Code and docs:** this repository. README with the system-design flowchart, `docs/architecture.md` (now `docs/architecture/overview.md`), ADRs, specs, design system, operations, security review and security audit.

Scope delivered, against the approved product spec ([`specs/v0/00-product.md`](../../../specs/v0/00-product.md) §4):

| ID | Capability | Delivered |
|---|---|---|
| PRD-01 | Automatic tracking on chosen sites, with activity rules (focus, idle, media, midnight, crash/clock recovery) | ✅ |
| PRD-02 | Sign up / sign in with Google or GitHub | ✅ (production verified) |
| PRD-03 | Connect the extension from the dashboard | ✅ (production verified) |
| PRD-04 | Local persistence, batched idempotent sync | ✅ |
| PRD-05 | Tracked sites editable in the extension and the dashboard | ✅ |
| PRD-06 | Popup: status, today, current session, top 3, sync status (plus a toolbar badge, #63) | ✅ |
| PRD-07 | Setting to disable tracking | ✅ |
| PRD-08 | Dashboard: summary cards, daily bar chart, time-by-platform donut, week/month navigation | ✅ |
| PRD-09 | Settings: sites, extension connection, sign out, sign out everywhere, delete account | ✅ |
| PRD-10 | Light and dark themes; responsive dashboard | ✅ (visual pass 360–1440 px) |
| PRD-11 | Privacy page and full account/data deletion (LGPD) | ✅ (reviewed by the product owner, #80) |

## 2. Success criteria (PRD §7)

| Criterion | Status | Evidence |
|---|---|---|
| A new user goes from sign-up to their first tracked minutes on the dashboard without help, following on-screen guidance | ✅ | Product owner on production, 2026-11-08 (#31): sign-up → `/connect` → study → minutes on the dashboard |
| Tracked time within **±2 %** of a manual stopwatch in the scripted test | ✅ | Passed in the product owner's stopwatch sessions on 2026-11-09; per-session figures were not recorded ([test report](v0-test-report.md) §2) |
| No user can read or write another user's data | ✅ | pgTAP cross-user RLS tests (212 database tests), integration tests, independent security review ([review](../security-review-v0.md)) and pre-Gate-4 security audit: no Critical findings, every finding fixed and production probed ([audit](../security-audit-v0.md)) |
| No data beyond spec 07 is collected | ✅ | Manifest permission test (SEC-03), E2E storage check (no paths or untracked hosts), privacy page, security review |
| CI green; every v0 issue closed or explicitly deferred with a reason | ✅ | CI green on `main`; issue table below |

## 3. Issues

**Delivered (closed):** #1–#31 (the approved v0 backlog), #41 system-design flowchart, #61 and #71 (bugs found while testing), #63 toolbar badge, #80 privacy review, and the improvements added by the product owner during delivery: #93 sign-in loading state, #94 pointer cursor, #95 red deletion controls. #32 closes with this report.

**Not planned:** #47 daily devlog. It runs as a scheduled task outside the repository (product owner's decision).

**Deferred, with reasons** (label `backlog`):

| Issue | Topic | Why deferred |
|---|---|---|
| #54 | Domain sync refinements | Review findings for rare cases; the everyday flow works and is tested |
| #56 | Local store and queue refinements | Same: rare edge cases, no data loss in normal use |
| #58 | Sync refinements | Same: retry/backoff details |
| #60, #65 | Popup and popup settings refinements | Polish, not needed for the v0 journey |
| #68, #70 | Dashboard shell and period refinements | Polish |
| #76 | Chart colour contrast | Minor: the legend already carries the information |
| #78 | Settings polish | Rare cases (expired session during deletion, heading order, refresh timing) |
| #82 | E2E robustness at date boundaries | Rare test flakiness around midnight/Monday |
| #83 | Sync/disconnect edge cases | Clock more than 5 min fast; disconnect during a running sync; viewer-midnight attribution (as specified) |
| #102 (#96–#101) | Landing page | New feature outside the v0 spec; planned for a later iteration |

## 4. Known limitations

- **Extension updates are manual** (unpacked install): users replace the folder and reload. The Chrome Web Store is the next step.
- **Google sign-in branding is not verified:** Google's screen shows the Supabase project domain instead of CareerOS. A custom domain or brand verification removes it.
- **Free tiers:** the Supabase project pauses after a week without activity; the extension keeps unsynced time for 30 days, and restoring takes a few minutes ([operations](../../operations.md)). Vercel Hobby is non-commercial only.
- **Extension status is per browser:** the dashboard knows only about the extension in the same browser (no device registry in v0).
- **Time zones:** an interval that crosses the viewer's midnight counts on its start day when the device and the viewer are in different zones (DATA-10).

## 5. How it was built

- **Specification-Driven Development** with four approval gates: direction, specs and backlog, implementation, delivery. Ten specs with requirement IDs; eight ADRs; spike 0003 de-risked the extension handoff before building it.
- **One issue per branch, one PR per change, an independent review before every code merge** (a few docs and chore PRs, such as `.gitignore`, were approved by the product owner without one). The product owner approved each merge. Reviews ran as separate agents (security, edge cases, code review); their findings were fixed in the same PR or filed as deferred issues.
- **CI on every PR:** lint, typecheck, unit tests with coverage gates, builds, pgTAP, integration, E2E in real Chromium, and the backup → restore round trip.
- **Production verified by hand:** launch checks (#31), manual tests (TEST §4), and the fixes they produced (#88–#91).

## 6. Next steps (decided by the product owner on 2026-11-08)

1. The v0 backlog (deferred issues above).
2. Chrome Web Store publication: new store-assigned extension ID, listing, permission justification, review.
3. Landing page (#102): research, content, SEO and architecture plans and a design for approval before implementation.

All manual checks of TEST §4 passed ([test report](v0-test-report.md)). The security audit (#110) is complete and its fixes are merged and live ([audit](../security-audit-v0.md)). Problems found after delivery are reported by the product owner as issues.

Per `AGENTS.md`, no new iteration starts until the product owner approves this report.

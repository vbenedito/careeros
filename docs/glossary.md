# Glossary

Type: living · Owner: tech lead · Last reviewed: 2026-11-12

Terms used across the docs and the code. Each points to the requirement that defines it.

| Term | Meaning | Defined in |
|---|---|---|
| Account epoch | In-memory counter in the service worker that changes whenever the account behind local data changes (connect, session rejected, local data cleared). Work that started under an older value writes nothing. Code: `background/account-epoch.ts` | [SYNC-02a](../specs/v0/03-sync.md), AUTH-11 |
| ADR | Architecture Decision Record: why a decision with trade-offs was made | [docs/adr](adr/README.md) |
| Audible / media activity | A tab playing sound that is not muted. It keeps tracking going without input for up to `MEDIA_IDLE_CEILING_S` (15 min); this is the "media hold" in the engine | [TRK-06](../specs/v0/01-tracking.md), [ADR-0005](adr/0005-media-activity.md) |
| Backoff | Waiting longer after each failed sync: 1, 2, 4, 8, 16, 30 min (`BACKOFF_MIN`) | [SYNC-06](../specs/v0/03-sync.md) |
| Data owner | The user id whose tracking data is stored in the extension (`careeros.auth.dataOwner`). A different user must discard it before connecting | [AUTH-11](../specs/v0/02-auth.md), [ADR-0002](adr/0002-extension-storage.md) |
| Device id | Random UUID per extension install, sent with each interval; replaced when local data is cleared | [TRK-10](../specs/v0/01-tracking.md) |
| Engine | The pure tracking function `step(state, event, now, env)` in `apps/extension/src/engine` | [TRK-16](../specs/v0/01-tracking.md) |
| Gap rule | If no heartbeat or event ran for more than two heartbeat periods, the open interval closes at the last known-running moment | [TRK-14](../specs/v0/01-tracking.md) |
| Gate | A product-owner approval point: 1 direction, 2 specs and backlog, 3 implementation, 4 delivery, 5 any further iteration | [Contributing](process/contributing.md#gates) |
| Handoff | How the dashboard gives the extension its own session: `/api/extension/link` mints a single-use token hash, the page sends it in `CONNECT`, the extension calls `verifyOtp`. Code: `apps/web/app/api/extension/link/route.ts`, `apps/extension/src/background/auth/auth-service.ts` | [AUTH-08..10](../specs/v0/02-auth.md), [ADR-0003](adr/0003-extension-session-handoff.md) |
| Heartbeat | The `careeros.heartbeat` alarm every `HEARTBEAT_PERIOD_MIN` (1 min) that re-checks tab, focus and idle state | [TRK-13](../specs/v0/01-tracking.md) |
| Ingest | The RPC `ingest_study_sessions`, the only way intervals reach the database | [DATA-06..09a](../specs/v0/04-data-model.md), [ADR-0004](adr/0004-idempotent-ingest.md) |
| Interval | One continuous period of study on one domain, ≤ 30 min, never across local midnight. Stored as a row of `study_sessions` | [TRK-08..11](../specs/v0/01-tracking.md) |
| Outbox | The persistent queue of closed intervals in `chrome.storage.local`; an interval leaves it only when the server confirms its id | [SYNC-01](../specs/v0/03-sync.md) |
| Protocol version | Integer in every dashboard ↔ extension message (`PROTOCOL_VERSION`, now 1). A mismatch shows "Please update the extension" | [AUTH-07a](../specs/v0/02-auth.md) |
| Publishable key / secret key | Supabase API keys. The publishable key is public (RLS protects data); the secret key bypasses RLS and lives only in Vercel server env | [SEC-07](../specs/v0/07-security-privacy.md) |
| Quarantine | Intervals the server rejected. Kept locally, never retried, counted in the popup as "N not synced" | [SYNC-05](../specs/v0/03-sync.md) |
| RLS | Postgres Row Level Security: each user sees only their own rows | [DATA-04/05](../specs/v0/04-data-model.md) |
| SDD / spec-driven | Specification-Driven Development: a behavior is specified and approved in `specs/` before it is built; tests are named after requirement IDs | [specs/README.md](../specs/README.md) |
| Session (study) | Used in the table name `study_sessions`: one row is one interval | [DATA-02](../specs/v0/04-data-model.md) |
| Session (auth) | A Supabase sign-in (access + refresh token). The dashboard keeps one in cookies, the extension its own in storage; they never share one | [AUTH-02](../specs/v0/02-auth.md), [AUTH-10](../specs/v0/02-auth.md) |
| Study site / tracked domain | A hostname the user chose to track, e.g. `leetcode.com`; subdomains match. Up to 12 per user, stored in `tracked_domains` | [TRK-03](../specs/v0/01-tracking.md), [DATA-01](../specs/v0/04-data-model.md) |
| Sync cycle | One upload run of the service worker: batches of ≤ 200 intervals until the outbox is empty or a call fails | [SYNC-02..03](../specs/v0/03-sync.md) |
| Today (popup) | This device's total for today: synced today + outbox + open interval | [SYNC-12](../specs/v0/03-sync.md) |
| Tracking target | The tracked domain being studied right now, or none when tracking is paused | [TRK-01..07](../specs/v0/01-tracking.md) |
| Web Analytics | Vercel's cookieless page-view counting on the website (not the extension), only on production deployments on Vercel; sensitive URLs are stripped by `beforeSend`. Code: `lib/analytics/` | [SEC-15](../specs/v0/07-security-privacy.md), [ADR-0010](adr/0010-web-analytics.md) |

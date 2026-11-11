# ADR-0002 — `chrome.storage` instead of `localStorage`

Status: Accepted · Date: 2026-11-04

## Context
The master brief suggests `localStorage`. In Manifest V3 the background runs as a **service worker**, where `localStorage` does not exist, and the worker is terminated after ~30 s idle, so in-memory state is lost.

## Options
1. `localStorage` (popup only) — unavailable to the service worker, which owns tracking.
2. `chrome.storage.local` — async, available in all extension contexts, survives restarts, 10 MB quota.
3. IndexedDB — more capacity and queries; more code than needed.
4. `chrome.storage.session` — memory-only, cleared on browser restart.

## Decision
`chrome.storage.local` for everything that must survive: engine state, outbox, quarantine, today's synced intervals, cached tracked domains, tracking-enabled flag, `device_id`, auth session. `chrome.storage.session` is not used in v0 (no data needs to be memory-only once auth tokens must persist across restarts).

Expected footprint: ~150 bytes/interval × a few hundred pending intervals ≪ 10 MB.

## Consequences
+ Works with MV3 lifecycle; one storage API; easy to fake in tests.
− Tokens at rest in the profile directory (same exposure as any extension session); mitigated by SEC-06/SEC-14 and disconnect.

## Update 2026-11-11 (#131)
As built, `chrome.storage.local` holds these key groups (all prefixed `careeros.`):
- tracking: engine state, outbox, quarantine, today's synced intervals, dropped-interval counter (SYNC-07), tracking-enabled flag, device id, tracked-domain cache;
- sync: sync state (failures, backoff time, last outcome, last synced time);
- auth: session, `dataOwner` (the user whose data is on this device, AUTH-11), `needsReconnect` flag.

The stored session is trimmed before it is written: of the user record only `id`, `aud`, `role`, `email` and `is_anonymous` are kept; name, avatar and linked identities are dropped (SEC-01, #113).

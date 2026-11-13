# 03 — Synchronization

Status: **Approved (2026-11-04)** · Related ADRs: 0002 (storage), 0004 (idempotent ingest)

Amended 2026-11-11 (#131): SYNC-02 triggers, SYNC-06 error classes, SYNC-07 quarantine, cycle rules (SYNC-02a) to match the code.

Amended 2026-11-12 (#58, #83, #56, #65, #54; review of #150): Disconnect waits for a running cycle (SYNC-02b); "syncing" marker (SYNC-02c); future-dated rejections are retried (SYNC-05a, product owner decision A); empty confirmation is a call error (SYNC-05b); ingest timeout (SYNC-06a); unreadable entries counted (SYNC-07a); site-list refresh rules (SYNC-09a..c, SYNC-10a); popup "today" from the engine's calendar (SYNC-12a).

Amended 2026-11-12 (grill E1/E2/H5/A3): a skipped final sync replies "still syncing" (SYNC-02a, AUTH-12c); unexpected errors record a coarse error kind (SYNC-06b); a token request blocked by the auth lock backs off (AUTH-10c).

## 1. Objective

Move closed intervals from the extension to the backend reliably — no loss, no duplicates — and keep the tracked-domain list consistent between extension and dashboard.

## 2. Constants

| Name | Value |
|---|---|
| `SYNC_PERIOD_MIN` | 5 |
| `SYNC_BATCH_MAX` | 200 intervals |
| `BACKOFF_MIN` | 1, 2, 4, 8, 16, 30 (cap) minutes |
| `LOCAL_QUEUE_MAX_AGE_D` | 30 days |
| `INGEST_TIMEOUT_S` | 20 |
| `CLOCK_RETRY_MAX` | 3 |
| `CLOCK_SLACK_S` | 5 |
| `DEFERRED_RETRY_CAP_MIN` | 30 |
| `DISCONNECT_WAIT_S` | 30 |
| `DOMAINS_REFRESH` | on startup, each sync alarm (≤ `SYNC_PERIOD_MIN`), when the session's user changes, popup open |

## 3. Interval upload

- **SYNC-01** Closed intervals are appended to a persistent **outbox** in `chrome.storage.local`. An interval leaves the outbox only after the server confirms its `id`.
- **SYNC-02** A sync cycle runs every `SYNC_PERIOD_MIN` (`chrome.alarms`), at every service-worker start (this covers browser startup), and whenever the stored session is written (connect, reconnect, token refresh). Only one cycle runs at a time (an in-memory guard: Chrome runs a single service worker per extension, as in AUTH-10; a persisted lock could not be released by a killed worker).
- **SYNC-03** A cycle uploads the oldest ≤ `SYNC_BATCH_MAX` intervals through the RPC `ingest_study_sessions` (spec 04) and repeats while the outbox is non-empty and the previous call succeeded.
- **SYNC-04** **Idempotency:** the server inserts by client-generated `id` with `ON CONFLICT (id) DO NOTHING` and returns every `id` from the batch that now exists for the caller (new or previously inserted). Retrying a batch is always safe.
- **SYNC-05** Ids not returned were **rejected** (validation failure). They move to a local `quarantine` (kept, not retried, counted in the popup footer as "N not synced") so one bad record never blocks the queue — except as SYNC-05a and SYNC-05b say.
- **SYNC-05a** *(#58, #83; product owner decision A, 2026-11-12)* A device clock more than 5 minutes fast makes the server reject every new interval (DATA-07: `ended_at` in the future). The client tells these rejections apart using the server's clock from the RPC response's `Date` header: a rejected interval whose `ended_at` is more than `DATA-07`'s 5 minutes after the server's time minus `CLOCK_SLACK_S` (the header has whole seconds and the server compared at its own `now()`, so near-boundary rejections are retried, not quarantined) is **deferred** (`careeros.tracking.deferred`: interval, `retryAt`, `attempts`). Its due time is server-relative: it is retried once its `ended_at` is in the past by the server's clock, estimated each cycle from the **latest measured skew** (`serverSkewMs` = local − server, stored in the sync status and re-measured on every upload response), so a clock corrected meanwhile is taken into account. As a fallback it is also due at `retryAt` (local time, at most `DEFERRED_RETRY_CAP_MIN` after deferral), and immediately when `retryAt` lies more than that cap ahead of the local clock (the clock was moved back): a correction can never strand it. Deferred intervals go first in the next batch once due. After `CLOCK_RETRY_MAX` future-dated rejections of the same interval, or a rejection for any other reason, it goes to quarantine. Only retries the measured skew said were due count toward `CLOCK_RETRY_MAX` (or every retry while no skew is known); a cap-triggered retry while the skew is known is a check that does not count, so a clock hours ahead cannot use up the retries before the interval is due. Nothing retries forever: deferred intervals are dropped at `LOCAL_QUEUE_MAX_AGE_D` (SYNC-07). Deferred and quarantined intervals starting more than `LOCAL_QUEUE_MAX_AGE_D` in the future (recorded with a clock far ahead, then corrected) are dropped (deferred ones counted, SYNC-07). Without a `Date` header, rejections are quarantined as before and the worker logs `sync.server_time_unavailable` once per cycle (no details). *Server time source:* the response body cannot carry it additively — `ingest_study_sessions` returns `uuid[]`, and released clients accept a success only when the body is an array, so an object would turn every upload of an older extension into a sync error; the header is therefore the source (PostgREST exposes `Date` to CORS callers). Deferred intervals count as pending (popup, Disconnect, AUTH-11) and as today's time (SYNC-12); older than `LOCAL_QUEUE_MAX_AGE_D` they are dropped and counted like the outbox (SYNC-07). While a call defers intervals and the measured skew is over 5 minutes, the sync status holds `clockAheadMs` (cleared by the next call that defers nothing); the popup shows a hint to fix the computer's clock.
- **SYNC-05b** *(#56)* A call that confirms **none** of a batch of several intervals (other than future-dated ones, SYNC-05a) is treated as a call error, not as per-row rejections: nothing is quarantined, the cycle waits 60 min and shows "Sync error" (like a client error, SYNC-06), and the next cycle sends only the oldest interval (`probeNext`). If that one is rejected alone, it is quarantined (a per-row rejection) and the queue moves on.
- **SYNC-06** Error classes for a call:

| Response | Handling |
|---|---|
| Network error, 5xx, 429 | Exponential backoff per `BACKOFF_MIN`; success resets it |
| `ABUSE_LIMIT` (DATA-09) | Back off 60 min, then continue; never discards data |
| `PGRST301`/`PGRST303` (access token expired or invalid, e.g. device clock behind) | Refresh the token and retry the batch once; if it fails again, treat as "network error" (backoff) |
| `PT401` (no user), `23503` FK violation (user gone), HTTP 401, invalid refresh | AUTH-11 |
| 403 (missing grant: a deployment bug) and other 4xx for the whole call (malformed request) | Client error: back off 60 min, keep data, show "Sync error" in footer; never a sign-out |

Per-row rejections are not call errors; they go to quarantine (SYNC-05), except SYNC-05a/05b.
- **SYNC-06a** *(#58)* An ingest call that has not answered after `INGEST_TIMEOUT_S` (under the 30 s after which Chrome may stop an idle MV3 worker) is aborted and handled as a network error (backoff), so a stalled connection cannot hold the one-cycle guard (SYNC-02) — and with it the final sync of a Disconnect. When no access token can be had while the session is still stored (a temporary refresh failure, AUTH-10a), the cycle also backs off as "offline"; it records "not connected" only when the session is gone.
- **SYNC-06b** *(grill H5)* A cycle, a Disconnect, a Forget local data or a dashboard message that ends in an unexpected error logs a coarse error kind: the error's class name and, when it has one, its machine code (`lib/error-kind.ts`) — never its message, stack or data (SEC-06). A cycle also stores it as `lastErrorKind` in the sync status (cleared by the next completed cycle), so a "Sync error" can be diagnosed from the popup's storage without personal data.
- **SYNC-02a** Cycle rules:
  - A cycle first checks the backoff, then prunes (SYNC-07/08), then uploads.
  - When the outbox is empty, the status "ok" is written only if a session is still stored; a disconnected profile gets no sync status.
  - Each cycle records the account epoch when it starts. If the account changed meanwhile (connect, session rejected, local data cleared), the cycle writes nothing (no status, no settled batch). The epoch is held in memory and resets when the service worker restarts, which also ends any cycle in flight.
  - The final sync on disconnect (AUTH-12) ignores the backoff, and is skipped if a cycle is still running once the wait of SYNC-02b is over (inside the auth lock it never waits for a cycle, which may need that lock). A skipped final sync with intervals left makes Disconnect reply `SYNC_IN_PROGRESS`, not `UNSYNCED_DATA` (AUTH-12c).
- **SYNC-02b** *(#58, #65)* Disconnect first waits, **outside** the auth lock, for a cycle that is already running, at most `DISCONNECT_WAIT_S` (longer than one stalled ingest call, SYNC-06a, and enough for a usual multi-batch cycle). If the cycle has finished, it takes the lock and runs its final sync. If it is still running (a long backlog), Disconnect changes nothing and replies `SYNC_IN_PROGRESS` (AUTH-12b) — unless the user already confirmed discarding unsynced data.
- **SYNC-02c** *(#58)* When a cycle starts uploading (its first batch is not empty), it writes `syncingSince` (epoch ms) into the sync status; every status the cycle writes afterwards clears it. A worker killed mid-cycle leaves it set, so readers treat a mark older than 2 minutes as stale (`isSyncing` in `lib/sync-state.ts`). The popup shows "Syncing…" from it (EXT-UI footer).
- **SYNC-07** Outbox intervals older than `LOCAL_QUEUE_MAX_AGE_D` that still could not be synced are dropped and counted (the server would reject them anyway, DATA-07). Quarantined intervals older than `LOCAL_QUEUE_MAX_AGE_D` are deleted without being counted.
- **SYNC-07a** *(#56)* Outbox and deferred entries that fail validation when read (corrupted storage) are dropped and **counted** in the same `dropped` counter, once, with the next write of the list.
- **SYNC-08** Synced intervals for **today** are kept locally (for the popup's totals); older synced intervals are pruned.

## 4. Tracked domains

- **SYNC-09** The server table `tracked_domains` is the source of truth. The extension keeps a cached copy for offline use and refreshes it per `DOMAINS_REFRESH`.
- **SYNC-09a** *(#54)* When a session is adopted for a different user than the data owner, the previous cache is removed before the session is stored (AUTH-11).
- **SYNC-09b** *(#65)* A refresh writes the cache only if the account is still connected when the list arrives (and the account epoch has not changed, #113): a Disconnect that finished meanwhile is never undone.
- **SYNC-09c** *(#54)* Every sync alarm refreshes the list, so a long-lived worker picks up dashboard edits within `SYNC_PERIOD_MIN`. A write of the stored session runs a sync cycle (SYNC-02) but refreshes the list only when the session's **user** changed (connect, reconnect), not on a token refresh.
- **SYNC-10** Adding/removing a domain in the popup writes to the server first; on failure the UI shows an error and the cache is unchanged. (No offline edits in v0 — avoids conflict resolution.)
- **SYNC-10a** *(#54)* Adding a domain that is already tracked is a no-op success, also at the `DATA-01` limit (12): it is not sent when the cache has it, and a `LIMIT_REACHED` from the server is checked against the server's list (the limit trigger runs before the unique check).
- **SYNC-11** Removing a domain stops future tracking on it; historical intervals are kept.

## 5. Popup totals

- **SYNC-12** "Today" in the popup = synced intervals of today kept locally + outbox intervals of today + the open interval. It reflects **this device only** (no server round-trip, works offline); the dashboard shows all devices. The popup states this in a caption (EXT-UI-04).
- **SYNC-12a** *(#56)* "Today" starts at the last local midnight the **engine** uses to split intervals (`localDayStartMs` in `engine/engine.ts`, built on `localMidnightAfter`), in the popup and in the local store, so in time zones whose midnight is skipped or repeated by a DST change an interval at the boundary belongs to the same day everywhere.

## 6. Acceptance criteria

1. Going offline for 2 h then back online uploads every interval exactly once (count in DB equals count produced).
2. Killing the service worker mid-upload and retrying produces no duplicates.
3. A batch containing one invalid interval stores the valid ones and quarantines the invalid one.
4. A domain added in the dashboard is tracked by the extension within one sync cycle or on popup open.

# 03 — Synchronization

Status: **Approved (2026-11-04)** · Related ADRs: 0002 (storage), 0004 (idempotent ingest)

## 1. Objective

Move closed intervals from the extension to the backend reliably — no loss, no duplicates — and keep the tracked-domain list consistent between extension and dashboard.

## 2. Constants

| Name | Value |
|---|---|
| `SYNC_PERIOD_MIN` | 5 |
| `SYNC_BATCH_MAX` | 200 intervals |
| `BACKOFF_MIN` | 1, 2, 4, 8, 16, 30 (cap) minutes |
| `LOCAL_QUEUE_MAX_AGE_D` | 30 days |
| `DOMAINS_REFRESH` | on startup, each sync cycle, popup open |

## 3. Interval upload

- **SYNC-01** Closed intervals are appended to a persistent **outbox** in `chrome.storage.local`. An interval leaves the outbox only after the server confirms its `id`.
- **SYNC-02** A sync cycle runs every `SYNC_PERIOD_MIN` (`chrome.alarms`), on browser startup, and after reconnecting. Only one cycle runs at a time (a persisted lock with 2-minute expiry guards against overlapping wakes).
- **SYNC-03** A cycle uploads the oldest ≤ `SYNC_BATCH_MAX` intervals through the RPC `ingest_study_sessions` (spec 04) and repeats while the outbox is non-empty and the previous call succeeded.
- **SYNC-04** **Idempotency:** the server inserts by client-generated `id` with `ON CONFLICT (id) DO NOTHING` and returns every `id` from the batch that now exists for the caller (new or previously inserted). Retrying a batch is always safe.
- **SYNC-05** Ids not returned were **rejected** (validation failure). They move to a local `quarantine` (kept, not retried, counted in the popup footer as "N not synced") so one bad record never blocks the queue.
- **SYNC-06** Error classes for a call:

| Response | Handling |
|---|---|
| Network error, 5xx, 429 | Exponential backoff per `BACKOFF_MIN`; success resets it |
| `ABUSE_LIMIT` (DATA-09) | Back off 60 min, then continue; never discards data |
| 401/403, invalid refresh, FK violation (user gone) | AUTH-11 |
| Other 4xx for the whole call (malformed request) | Client bug: log, back off 60 min, keep data, show "Sync error" in footer |

Per-row rejections are not call errors; they go to quarantine (SYNC-05).
- **SYNC-07** Intervals older than `LOCAL_QUEUE_MAX_AGE_D` that still could not be synced are dropped and counted (the server would reject them anyway, DATA-07).
- **SYNC-08** Synced intervals for **today** are kept locally (for the popup's totals); older synced intervals are pruned.

## 4. Tracked domains

- **SYNC-09** The server table `tracked_domains` is the source of truth. The extension keeps a cached copy for offline use and refreshes it per `DOMAINS_REFRESH`.
- **SYNC-10** Adding/removing a domain in the popup writes to the server first; on failure the UI shows an error and the cache is unchanged. (No offline edits in v0 — avoids conflict resolution.)
- **SYNC-11** Removing a domain stops future tracking on it; historical intervals are kept.

## 5. Popup totals

- **SYNC-12** "Today" in the popup = synced intervals of today kept locally + outbox intervals of today + the open interval. It reflects **this device only** (no server round-trip, works offline); the dashboard shows all devices. The popup states this in a caption (EXT-UI-04).

## 6. Acceptance criteria

1. Going offline for 2 h then back online uploads every interval exactly once (count in DB equals count produced).
2. Killing the service worker mid-upload and retrying produces no duplicates.
3. A batch containing one invalid interval stores the valid ones and quarantines the invalid one.
4. A domain added in the dashboard is tracked by the extension within one sync cycle or on popup open.

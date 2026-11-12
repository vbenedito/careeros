# Extension design

Type: living · Owner: tech lead · Last reviewed: 2026-11-12

Low-level design of the Chrome MV3 extension in `apps/extension`. Rules are in [TRK](../../specs/v0/01-tracking.md), [AUTH](../../specs/v0/02-auth.md), [SYNC](../../specs/v0/03-sync.md), [EXT-UI](../../specs/v0/05-extension-ui.md) and [STORE](../../specs/store/00-chrome-web-store.md). The big picture is in the [overview](overview.md).

## Module map

```mermaid
flowchart TB
  CE["Chrome events<br/>tabs · windows · idle · alarms · ports"] --> CP["tracking/chrome-port.ts"]
  CP --> TR["tracking/tracker.ts<br/>serialized queue"]
  TR --> EN["engine/engine.ts + signals.ts<br/>pure"]
  TR --> ST["tracking/store.ts<br/>state + outbox in one write"]
  ST --> LS[("chrome.storage.local")]
  OB["tracking/outbox.ts"] --> LS
  SY["sync/sync-service.ts"] --> OB
  SY --> IN["sync/supabase-ingest.ts"]
  AU["auth/auth-service.ts"] --> BE["auth/supabase-backend.ts"]
  BE --> LS
  DS["domains/domain-service.ts"] --> LS
  EXT["messaging/external.ts<br/>dashboard"] --> AU
  INT["messaging/internal.ts<br/>popup"] --> DS
  INT --> AU
  POP["popup/ (React)"] -- "reads" --> LS
  POP -- "messages" --> INT
  IN --> SB["Supabase"]
  BE --> SB
  DS --> SB
```

| Path (`src/`) | Role | Main specs |
|---|---|---|
| `engine/signals.ts` | Engine A: folds Chrome observations into `Signals` and decides the tracking target | TRK-01..07 |
| `engine/engine.ts` | Engine B: `step(state, event, now, env) → { state, effects }`; opens, splits and closes intervals | TRK-08..16 |
| `background/index.ts` | Service worker entry: wires every module and registers all listeners synchronously | TRK-19, SYNC-02 |
| `background/tracking/chrome-port.ts` | Chrome adapter: tab, focus (500 ms debounce), idle, heartbeat alarm, popup port | TRK-02, 04, 06, 13, 18, 19 |
| `background/tracking/tracker.ts`, `queue.ts` | One serialized queue; each slot loads state, steps the engine, commits, answers re-query effects; 10 s timeout for events and `exclusive` tasks; a generation counter drops the writes of timed-out slots | TRK-12, 13, 17, 17a |
| `background/tracking/store.ts`, `keys.ts` | Storage schemas and keys; engine state and outbox written together | TRK-12, SYNC-01 |
| `background/tracking/outbox.ts` | Outbox, deferred (clock ahead), quarantine, synced-today, prune and counts | SYNC-01, 05, 05a, 07, 07a, 08 |
| `background/tracking/bootstrap.ts` | Start sequence; storage changes become engine events; `LocalData` hooks for auth | TRK-01, 19, AUTH-11/12 |
| `background/tracking/device.ts` | Random device id, UUID generator, local-midnight calendar (`engine.localDayStartMs` gives "today" from it) | TRK-09, 10, SYNC-12a |
| `background/sync/sync-service.ts` | Upload cycle, backoff, 20 s ingest timeout, skew measured per response, "syncing" mark and clock skew stored for the popup, bounded `waitIdle` for Disconnect | SYNC-02..08 |
| `background/sync/supabase-ingest.ts` | Calls `ingest_study_sessions`; maps errors to classes; reads the server's time from the `Date` header | SYNC-05a, 06, DATA-06..09 |
| `background/sync/triggers.ts` | Sync alarm → cycle + site list; session write → cycle, site list only when the user changed | SYNC-02, 09c |
| `background/auth/auth-service.ts` | Connect, token refresh, session rejected, disconnect (waits for a running upload first), forget local data; one lock | AUTH-07b, 10..12b |
| `background/auth/supabase-backend.ts`, `storage.ts`, `mutex.ts` | supabase-js session in `chrome.storage.local` (its own removals held back during a refresh); in-memory lock | AUTH-10, 10a, ADR-0002 |
| `background/account-epoch.ts` | In-memory counter of account changes; stale work writes nothing | SYNC-02a, AUTH-11 |
| `background/domains/` | Tracked-site cache and server edits | SYNC-09..11, 09b, 10a |
| `background/messaging/external.ts` | Messages from the dashboard origin | AUTH-06..07b, SEC-05 |
| `background/messaging/internal.ts` | Messages from the extension's own pages; answers also in builds without Supabase config | EXT-UI-05a, 05c, SEC-05 |
| `background/api/data-client.ts` | supabase-js data client that asks `AuthService` for each token | AUTH-10 |
| `background/badge.ts`, `lib/badge.ts` | Toolbar badge from the engine state | EXT-UI-10 |
| `popup/` | React popup: `App.tsx`, `views/` (Main, Settings), `components/`, `ui/` primitives, `data.ts` (storage reads + commands) | EXT-UI-01..10 |
| `lib/` | Code shared by worker and popup: `popup-messages.ts`, `popup-view.ts` (pure view model), `sync-state.ts`, `log.ts`, `config.ts`, `env.ts` | EXT-UI-05a, ENV-10 |

The engine has no Chrome API, storage or timer; everything Chrome-specific stays in `background/` (functional core, imperative shell). The popup has no Supabase client (EXT-UI-05a).

## Tracking state machine

The engine keeps at most one open interval. `trackingTarget(signals)` is the tracked domain being studied now, or `null`.

```mermaid
stateDiagram-v2
  [*] --> NotTracking
  NotTracking --> Tracking: target ≠ null and notBefore passed<br/>(open interval, new UUID)
  Tracking --> NotTracking: target = null<br/>(pause: idle, locked, unfocused, untracked tab, disabled, disconnected)
  Tracking --> Tracking: target changes domain<br/>(close, open new)
  Tracking --> Tracking: boundary passed: 30 min or local midnight<br/>(close at boundary, reopen)
  Tracking --> NotTracking: gap > 2 heartbeats or clock moved back<br/>(close at last heartbeat, RESYNC)
  NotTracking --> NotTracking: clock moved back<br/>(block new intervals until notBefore)
```

The target is non-null only when all of TRK-01 hold (connected, tracking on, domain list loaded, focused tracked tab) and the user is active, or idle with the media hold (TRK-05, TRK-06, [ADR-0005](../adr/0005-media-activity.md)). Every step persists the state (TRK-12).

What happens to a closed interval:

```mermaid
stateDiagram-v2
  [*] --> Open: eligible + active
  Open --> Closed: pause / domain change / 30 min / midnight / disabled / sign-out
  Closed --> Outbox: duration ≥ 5 s
  Closed --> [*]: duration < 5 s (discarded)
  Outbox --> Synced: server confirms id
  Outbox --> Quarantine: server rejects id
  Outbox --> [*]: older than 30 days (dropped, counted)
  Outbox --> Deferred: server rejects id, ended_at in its future (clock ahead)
  Deferred --> Synced: retried once ended_at passed on the server
  Deferred --> Quarantine: rejected otherwise, or 3 times in the future
  Synced --> [*]: pruned after today
```

## Sync cycle

`SyncService.run` allows one cycle at a time. It starts from the `careeros.sync` alarm, on every worker start and when a session is written (SYNC-02). The alarm and the worker start also refresh the site list; a session write does so only when its user changed (SYNC-09c, `sync/triggers.ts`).

```mermaid
sequenceDiagram
  participant Y as SyncService
  participant O as Outbox
  participant A as AuthService
  participant D as ingest_study_sessions
  Y->>Y: read sync state, skip if backing off (unless forced)
  Y->>O: prune (SYNC-07/08)
  loop while the outbox has intervals
    Y->>O: batch (due deferred first, then oldest; ≤ 200, or 1 after an empty confirmation)
    Y->>Y: first batch: write syncingSince (SYNC-02c)
    Y->>A: accessToken()
    Y->>D: batch + JWT (aborted after 20 s → unavailable)
    alt nothing confirmed of several (not explained by the clock)
      Y->>Y: call error: wait 1 hour, probe 1 interval next (SYNC-05b)
    else confirmed ids
      Y->>O: settle: confirmed → synced today; ended in the server's future (− 5 s slack) → deferred; others → quarantine
    else expired (PGRST301/303)
      Y->>A: accessToken({ forceRefresh }) and retry once
    else auth (401, PT401, 23503)
      Y->>A: sessionRejected() → "Reconnect"
    else unavailable (network, 429, 5xx, timeout, no token while the session is stored)
      Y->>Y: backoff 1, 2, 4, 8, 16, 30 min
    else abuse limit or client error
      Y->>Y: wait 1 hour
    end
  end
  Y->>Y: store outcome for the popup footer
```

If the account epoch changed during the cycle (connect, session rejected, local data cleared), the cycle writes nothing (SYNC-02a). Data is never discarded on failure. Every status the cycle writes clears `syncingSince`; a local store task that timed out (TRK-17a) ends the cycle as failed without settling.

Disconnect (popup or dashboard) first calls `SyncService.waitIdle(30 s)` outside the auth lock. If the cycle is still running, it replies `SYNC_IN_PROGRESS` (popup) / `UNSYNCED_DATA` (dashboard) and changes nothing; otherwise it takes the lock, closes the open interval and runs the final sync with `ifIdle` (SYNC-02b, AUTH-12b).

A deferred interval is due when `now − serverSkewMs ≥ ended_at` (latest measured skew), at its capped `retryAt` (≤ 30 min after deferral), or at once when `retryAt` is more than 30 min ahead of the local clock (clock moved back) — `deferredDue` in `tracking/outbox.ts`. Only skew-due retries (or any, while no skew is known) count toward `CLOCK_RETRY_MAX`. The server's time comes from the `Date` header only (the RPC returns `uuid[]`, which cannot grow a field without breaking released clients); when it is missing the cycle logs `sync.server_time_unavailable` once.

### Sync status for the popup (`careeros.sync.state`)

| Field | Meaning |
|---|---|
| `failures`, `notBefore` | Backoff (SYNC-06) |
| `lastOutcome` | `ok`, `offline`, `abuse`, `error`, `not-connected`, or null |
| `lastSyncedAt` | Epoch ms of the last cycle that emptied the outbox |
| `syncingSince` | Epoch ms the running cycle started uploading, else null; `isSyncing(state, now)` ignores a mark older than 2 min (SYNC-02c) |
| `clockAheadMs` | Device clock ahead of the server's while that causes rejections, else null (SYNC-05a) |
| `probeNext` | Next cycle sends one interval (SYNC-05b) |
| `serverSkewMs` | Latest measured local − server clock (ms), or null (SYNC-05a) |

`buildPopupView` (`lib/popup-view.ts`) turns these into `syncing`, `clockAheadMinutes` and `deferred` for the footer and the clock hint.

## Message protocol

### Popup → service worker

Validated by `PopupRequestSchema` (`lib/popup-messages.ts`). Accepted only from the extension's own pages (`sender.id` and a `chrome-extension://<id>/` URL); anything else gets no reply.

| Type | Payload | Reply |
|---|---|---|
| `AUTH_STATUS` | — | `{ connected, email, needsReconnect }` (never a token) |
| `DOMAINS_REFRESH` | — | `{ ok: true, domains }` or `{ ok: false, error }` |
| `DOMAINS_ADD` | `input` (≤ 2048 chars) | same |
| `DOMAINS_REMOVE` | `domain` (≤ 253 chars) | same |
| `TRACKING_SET` | `enabled` | `{ ok: true, enabled }` (the stored value afterwards) |
| `DISCONNECT` | `discardUnsynced` | `{ ok: true }`, `UNSYNCED_DATA` with `pending` (unsynced + quarantined), `unsynced`, `quarantined`, `SYNC_IN_PROGRESS`, or `FAILED` |
| `FORGET_LOCAL_DATA` | — | `{ ok: true }`, `CONNECTED` or `FAILED` |

Domain errors: `NOT_CONNECTED`, `INVALID_DOMAIN`, `LIMIT_REACHED`, `UNAVAILABLE`. In a build without Supabase config every command still gets a reply: site commands `{ ok: false, error: "NOT_CONFIGURED" }`, `DISCONNECT` and `FORGET_LOCAL_DATA` `FAILED` (EXT-UI-05c). While shown, the popup also holds the port `careeros.popup`, so the worker treats Chrome as focused (TRK-18).

### Dashboard → service worker

Validated by `ExtensionRequestSchema` (`packages/shared/src/schemas.ts`). Chrome delivers only messages from the `externally_connectable` origin; the handler checks `sender.origin` again and ignores other extensions (AUTH-06/07). Every message carries `protocolVersion`; this build supports `1` (`PROTOCOL_VERSION`).

| Type | Payload | Success reply |
|---|---|---|
| `PING` | — | `{ ok, protocolVersion, extensionVersion, connected, email? }` |
| `STATUS` | — | same as `PING` |
| `CONNECT` | `tokenHash` (16–512 chars) | `{ ok, protocolVersion, email? }` |
| `DISCONNECT` | — | `{ ok, protocolVersion }` |

| Error code | When |
|---|---|
| `UNSUPPORTED_PROTOCOL` | `protocolVersion` not supported (AUTH-07a) |
| `INVALID_TOKEN` | `verifyOtp` failed (expired, used, wrong) |
| `ALREADY_CONNECTED` | `CONNECT` for a different user while connected (AUTH-07b) |
| `UNSYNCED_DATA` | Another user's unsynced intervals are on this device, or `DISCONNECT` left intervals unsynced (AUTH-11/12) |
| `INTERNAL` | Unexpected failure; no details |

Invalid messages get no reply at all. From the dashboard, `DISCONNECT` never discards unsynced data.

## Storage keys

All in `chrome.storage.local` ([ADR-0002](../adr/0002-extension-storage.md)). `Forget local data`, disconnect and an account change clear the account's keys (AUTH-11/12, SEC-14).

| Key | Holds | Cleared with account data |
|---|---|---|
| `careeros.auth.session` | supabase-js session (access + refresh token) | yes (sign-out) |
| `careeros.auth.dataOwner` | User id that owns the local data | yes |
| `careeros.auth.needsReconnect` | Session became invalid; popup shows "Reconnect" | yes |
| `careeros.tracking.engine` | Engine state (signals, open interval, checkpoints) | yes |
| `careeros.tracking.outbox` | Closed intervals waiting for upload | yes |
| `careeros.tracking.deferred` | Intervals rejected as ending in the server's future: `{ interval, retryAt, attempts }` (SYNC-05a) | yes |
| `careeros.tracking.quarantine` | Intervals the server rejected | yes |
| `careeros.tracking.syncedToday` | Today's confirmed intervals, for popup totals | yes |
| `careeros.tracking.droppedCount` | Intervals dropped as too old or unreadable | yes |
| `careeros.domains.cache` | Tracked-domain list | yes (also when the session becomes invalid) |
| `careeros.sync.state` | Backoff, last outcome, last sync time, syncing mark, clock skew (see above) | yes |
| `careeros.device.id` | Random device id | replaced when local data is cleared |
| `careeros.settings.trackingEnabled` | Per-device switch; missing means on | no |

## Alarms and timers

| Name | Period | Purpose |
|---|---|---|
| `careeros.heartbeat` | `HEARTBEAT_PERIOD_MIN` (1 min) | Re-check tab, focus, idle and media; detects gaps (TRK-13/14) |
| `careeros.sync` | `SYNC_PERIOD_MIN` (5 min) | Sync cycle (SYNC-02) |
| Focus debounce | 500 ms (`FOCUS_DEBOUNCE_MS`) | Ignore short `WINDOW_ID_NONE` reports (TRK-18) |
| Tracker slot timeout | 10 s (`SLOT_TIMEOUT_MS`) | A hung Chrome API or storage call cannot freeze the queue (events and `exclusive` tasks) |
| Ingest timeout | 20 s (`INGEST_TIMEOUT_S`) | A stalled upload cannot hold the sync guard (SYNC-06a) |
| Disconnect wait | ≤ 30 s (`DISCONNECT_WAIT_S`) | Let a running cycle finish before the final sync; still running → `SYNC_IN_PROGRESS` (SYNC-02b) |

`chrome.idle.setDetectionInterval(60)` is set on every worker start (TRK-19).

## Build modes and manifest

`manifest.config.ts` builds `manifest.json` per mode; `vite.config.ts` injects the public build config (`__CAREEROS_CONFIG__`).

| | development | production |
|---|---|---|
| Command | `pnpm build` (+ `scripts/check-worker.ts`) | `pnpm build:prod` |
| Output | `dist/development` | `dist/production` |
| Name | CareerOS (dev) | CareerOS |
| ID (`MANIFEST_KEYS`) | `jfklbpedlpkginmdfckogdgaggmdmkbk` | `pddbflgidjmnhidineoejneeipaicgek` (the store item's key, STORE-05) |
| `VITE_DASHBOARD_ORIGIN` | defaults to `http://localhost:3000` | required, https |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | optional ("not configured") | required; key must be `sb_publishable_…` |
| Debug logs | on | off |

Every build: `minimum_chrome_version` 120, permissions exactly `alarms`, `idle`, `storage`, `tabs` (SEC-03), CSP `script-src 'self'; object-src 'self'` (SEC-04), `externally_connectable` = the dashboard origin only (AUTH-06). `assertNoSecrets` fails the build on a value that looks like a secret (SEC-07).

Packages (`scripts/zip.ts`):

| Script | Zip | Use |
|---|---|---|
| `release` | `careeros-extension-<version>.zip` | Unpacked production build, keeps the `key` (GitHub Release) |
| `release:store` | `careeros-extension-<version>-store.zip` | Chrome Web Store: same build without `key` (STORE-01) |

The version comes from `apps/extension/package.json`. Release steps: [release process](../process/release.md#extension).

## Tests

Unit tests sit next to the code (`*.test.ts`). `tests/integration` runs against the local Supabase stack; `tests/e2e` loads the built extension in Chromium with Playwright and drives the dashboard, including its responsive layout checks; `tests/responsive` checks the landing page's layout without a backend; both use `tests/support/responsive.ts` (TEST-01). See [TEST](../../specs/v0/08-testing.md).

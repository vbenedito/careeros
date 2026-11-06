# 01 — Tracking Engine (Chrome extension)

Status: **Approved (2026-11-04)** · Related ADRs: 0002 (storage), 0005 (media activity), 0006 (permissions)

## 1. Objective

Measure time the user spends actively studying on tracked domains, robust to MV3 service-worker termination, browser restarts and crashes, while collecting only what spec 07 allows.

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `IDLE_THRESHOLD_S` | 60 | `chrome.idle` detection interval (API minimum is 15 s). |
| `MEDIA_IDLE_CEILING_S` | 900 (15 min) | Max time without input while an eligible tab is audible (TRK-06). |
| `HEARTBEAT_PERIOD_MIN` | 1 | `chrome.alarms` checkpoint. Bounds data loss on crash. |
| `MAX_INTERVAL_S` | 1800 (30 min) | Long runs are rolled into consecutive intervals so the dashboard stays fresh. |
| `MIN_INTERVAL_S` | 5 | Shorter intervals are discarded as noise. |

## 3. Requirements

**Eligibility**

- **TRK-01** Tracking happens only when *all* hold: the user is connected (spec 02), tracking is enabled on this device (EXT-UI settings), the tracked-domain list is loaded, and there is an eligible tab. Nothing is assumed before it is reported: until the tracking setting and an idle state have been read on this worker, tracking does not start (fails closed).
- **TRK-02** A tab is evaluated only if its URL scheme is `http` or `https`. The extension reads the tab URL **only to extract the hostname**; the full URL, path, query, title and content are never stored or transmitted.
- **TRK-03** A hostname matches a tracked domain `d` when it equals `d` or ends with `.d` (after normalization: lowercase, trailing dot removed, leading `www.` removed). `leetcode.com` matches `leetcode.com` and `www.leetcode.com`, not `notleetcode.com`. The recorded domain is the **tracked domain**, not the raw hostname. If several match, the longest wins.
- **TRK-04** The tab must be the active tab of the last-focused window, and that window must be focused (`chrome.windows.WINDOW_ID_NONE` ⇒ not focused).

**Activity**

- **TRK-05** The user is *active* while `chrome.idle` reports `active`. When it reports `idle` (no input for `IDLE_THRESHOLD_S`) or `locked`, tracking pauses and the interval ends at the detection moment. The first 60 s after the last input are therefore counted (a short reading pause is still study); anything beyond is not.
- **TRK-06** Media exception (eligibility TRK-01..04 still required — an audible tab in an unfocused window is not tracked): while the eligible tab is `audible` (and not muted — Chrome reports muted tabs as audible), an `idle` state does **not** pause tracking. The heartbeat checks `chrome.idle.queryState(MEDIA_IDLE_CEILING_S)`; when it returns `idle`, tracking pauses and the interval ends at the detection moment. Media time without input is therefore credited up to the ceiling (worst case: ~15 min credited for a video left playing while away — an accepted trade-off, ADR-0005). Audio stopping while the user is `idle` pauses immediately; audio *starting* while the user is idle does not resume tracking (input is required). `locked` always pauses immediately.
- **TRK-07** Tracking resumes automatically when all TRK-01 conditions hold again. No manual pause/resume exists.

**Intervals**

- **TRK-08** An interval opens when tracking starts and closes on any pause, domain change, tab/window change that breaks eligibility, sign-out, tracking disabled, or when it reaches `MAX_INTERVAL_S` (immediately followed by a new interval if still eligible).
- **TRK-09** Intervals are split at **local midnight** of the device's time zone so each interval belongs to one calendar day.
- **TRK-09a** Boundaries are **computed, not observed**: whenever the engine processes any event, it first closes the open interval at every boundary that has passed (`started_at + MAX_INTERVAL_S`, local midnight) using the boundary timestamp itself, opening the follow-up interval at the same instant. Heartbeat timing therefore never makes an interval exceed `MAX_INTERVAL_S`.
- **TRK-10** Each closed interval has: `id` (UUIDv4, generated client-side at open), `device_id`, `domain`, `started_at`, `ended_at` (UTC ISO-8601, timestamps **truncated** to whole seconds). Intervals shorter than `MIN_INTERVAL_S` are discarded.
- **TRK-11** Intervals on one device never overlap.

**Lifecycle & recovery**

- **TRK-12** Engine state (`open interval`, `lastHeartbeatAt`, `lastInputAt` estimate) is persisted to `chrome.storage.local` on every transition and heartbeat; no state is kept only in memory.
- **TRK-13** A heartbeat alarm every `HEARTBEAT_PERIOD_MIN` re-evaluates eligibility (tabs, window focus, `idle.queryState`, `audible`) and updates `lastHeartbeatAt` (every processed event also updates it: it is the last moment the engine is known to have been running).
- **TRK-14** **Gap rule, applied to every event** (not only worker start): if an open interval exists and `now − lastHeartbeatAt > 2 × HEARTBEAT_PERIOD_MIN` (browser crash, OS sleep, worker suspended), the interval is closed at `lastHeartbeatAt` before the event is processed; eligibility is then re-evaluated from scratch (stored tab and idle observations are discarded and queried again).
- **TRK-15** System clock moving backwards (`now < lastHeartbeatAt`) closes the open interval at `lastHeartbeatAt` and starts fresh; no new interval starts before that moment, so intervals never overlap (TRK-11).
- **TRK-17** Engine events are processed **strictly one at a time** through a serialized queue in the adapter (each read-modify-write of persisted state completes before the next event starts), so near-simultaneous Chrome events (`onActivated` + `onFocusChanged`) cannot lose updates or create overlaps.
- **TRK-18** Window focus loss is confirmed after a 500 ms debounce, so transient `WINDOW_ID_NONE` reports while switching between Chrome windows do not split intervals.
- **TRK-19** `chrome.idle.setDetectionInterval(IDLE_THRESHOLD_S)` is called on every worker start (the setting is not guaranteed to persist). A worker start keeps the stored state and open interval (Chrome wakes the worker for every event) but re-queries the tab and idle state; a mismatch closes the interval when the fresh observation arrives.

**Architecture**

- **TRK-16** The engine is a **pure function** `(state, event, now) → (state, effects)` with no Chrome API calls; a thin adapter layer translates Chrome events into engine events and executes effects. This makes rules unit-testable with a fake clock.

## 4. Acceptance criteria

1. Given `leetcode.com` is tracked, when the user keeps an active focused tab on `www.leetcode.com/problems/x` and interacts for 10 min, then ~600 s are recorded under `leetcode.com` and no path is stored anywhere.
2. Given tracking, when the user stops interacting for 3 min (no media), then the interval ends 60 s after the last input.
3. Given an audible lecture on a tracked site and no input, tracking continues until 15 min without input (±1 heartbeat), then pauses; it resumes on the next input.
4. Switching to an untracked tab, another window, or minimizing Chrome closes the interval within 1 s of the event.
5. Killing the service worker mid-interval loses no time; killing the browser loses at most ~`HEARTBEAT_PERIOD_MIN`.
6. A 50-minute continuous run produces intervals of 30 + 20 min.
7. A run crossing local midnight produces two intervals, one per day.
8. Engine unit tests cover every rule above with a fake clock.

## 5. Known limitations (accepted for v0)

- Two Chrome profiles/devices used at the same moment can produce overlapping time across devices; it is counted twice. Rare for the target user; documented.
- The idle signal is OS-wide input; reading on a tracked page without touching input for > 60 s pauses tracking (unless audible).

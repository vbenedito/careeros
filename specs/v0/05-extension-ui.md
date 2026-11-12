# 05 — Extension UI (popup)

Status: **Approved (2026-11-04)** · Source: *V0 UI/UX Design and Implementation Brief* · Related ADRs: 0007 (UI stack)

Amended 2026-11-11 (#131): loading-sites state, meaning of "Paused — inactive", all footer texts, disconnected Settings view, dashboard link default, badge details, to match the code.

Amended 2026-11-12 (#58, #65): "Syncing…" footer state and the clock hint (product owner decision), Disconnect confirmation counts and "Try syncing again", replies in builds without Supabase config (EXT-UI-05c). The worker and the view model expose the state; the popup renders it in a follow-up change.

## 1. Direction

Minimal, product-oriented, glanceable. Tracking is automatic: **no pause/resume button**. The dashboard owns analytics.

Size: 360 px wide, height fits content (≤ 560 px). Theme follows the OS (`prefers-color-scheme`); no theme toggle in the popup. Design tokens (colors, radius, font) are the same CSS variables as the dashboard theme, so both feel like one product.

## 2. Main view — layout (top to bottom)

| # | Block | Content |
|---|---|---|
| 1 | **Header** | CareerOS wordmark/logo · settings icon button (`aria-label="Settings"`) |
| 2 | **Status** | Dot + label (see states) and, when relevant, one short hint |
| 3 | **Today card** (primary) | Total time today, largest type on screen (`2h 14m`), caption "Today on this device" |
| 4 | **Current session** (secondary) | Current domain + duration of the current run (`leetcode.com · 23m`); hidden when not tracking |
| 5 | **Top 3 today** | Up to 3 domains with time and a horizontal bar; bar width = domain time ÷ today's total (shared scale) |
| 6 | **Footer** | Sync status · extension version (`v<version>`) · "Open dashboard ↗" link (opens `/dashboard`) |

- **EXT-UI-01** The today total is the most prominent element; its card uses a subtle tinted background and border, no heavy shadow.
- **EXT-UI-02** Durations format as `0m`, `45m`, `1h 05m`; under one minute shows `<1m`. Live values update every second while the popup is open.
- **EXT-UI-03** No charts, streaks, goals, badges or other analytics.
- **EXT-UI-04** The "on this device" caption is always shown (SYNC-12).

### Status states

| State | Label | Hint / action |
|---|---|---|
| Tracking | ● Tracking | — |
| Paused | ○ Paused — inactive | "Resumes when you're back" |
| Not a study site | ○ Not tracking this site | "Add `<host>` to tracked sites" (button → adds it, SYNC-10) |
| No tracked sites | ○ No study sites yet | "Add this site" or "Manage sites" |
| Sites loading | ○ Loading your sites… | — (connected, site list not loaded yet, e.g. first open after connecting) |
| Disabled | ○ Tracking off | "Turn on in Settings" |
| Disconnected | ! Not connected | "Connect account" → opens dashboard `/connect` |

- "Paused — inactive" means: the active tab is on a tracked site but no interval is open — the user is idle or the screen is locked (TRK-05), the media ceiling was reached (TRK-06), or the engine has not resumed yet. It is decided in `lib/popup-view.ts` from storage, not from the idle state itself.
- The states are checked in this order: Disconnected, Disabled, Sites loading, No tracked sites, Tracking, Paused, Not a study site.
- **EXT-UI-05** "Add this site" is offered only for `http/https` pages and adds the page's normalized hostname (TRK-03; `www.` stripped, nothing else). Users who want a parent domain type it in Settings.
- **EXT-UI-05a** The popup holds **no Supabase client**. It reads state from `chrome.storage` and sends commands (add/remove site, toggle, disconnect) to the service worker via `chrome.runtime.sendMessage`; the worker is the single owner of auth and network (AUTH-10).
- **EXT-UI-05b** The footer shows the extension version. "Update available" in the popup is deferred: only protocol 1 exists in v0, and the dashboard already says "Please update the extension" when the protocol is older (AUTH-07a).
- **EXT-UI-05c** *(#65)* In a build without Supabase config, every popup command gets a reply: site commands `{ ok: false, error: "NOT_CONFIGURED" }`, Disconnect and Forget local data `FAILED`; the tracking switch still works (it is local). `TRACKING_SET` replies `{ ok: true, enabled }` with the value stored afterwards, which the switch shows instead of its old position while storage reloads.

### Sync footer states

`Synced · 2m ago` (also `just now`, `1h ago`) · `Not synced yet` (connected, nothing pending, never synced) · `3 pending` · `3 pending · retrying in 4m` (offline or abuse backoff still running) · `Offline · 3 pending` (backoff over) · `Sync error · 3 pending` · when not connected: `3 pending` or `Not synced`. Quarantined intervals add ` · 2 not synced` (SYNC-05) with the tooltip "These intervals were rejected by the server and are kept on this device." The labels are built in `lib/popup-view.ts`.

*(#58, product owner 2026-11-12)* `Syncing…` is shown while a cycle is uploading: `PopupView.syncing`, from `syncingSince` in the sync status (SYNC-02c). When the server rejects sessions because this computer's clock is fast (SYNC-05a), the popup shows a hint to correct the clock: `PopupView.clockAheadMinutes` (whole minutes, null when not applicable). Deferred sessions are part of the pending count (`PopupView.deferred` says how many of them wait for the clock).

- **EXT-UI-10** **Toolbar badge** on the extension icon: a small green dot while tracking, an amber `!` when not connected, nothing otherwise. The icon's tooltip states the same in words: "CareerOS — tracking leetcode.com", "CareerOS — not connected", "CareerOS — not tracking" (the manifest name, so "CareerOS (dev)" in dev builds). No live timer in the badge (#63). The rule is the pure `badgeFor` in `lib/badge.ts`; the worker (`background/badge.ts`) applies it with `chrome.action` whenever the stored engine state changes, and skips the calls when nothing changed. The dot is a one-space badge text on green `#16a34a`; the `!` is on amber `#b45309`.

## 3. Settings view (inside the popup, back arrow to main)

- **EXT-UI-06** **Tracking** switch (on by default). Off ⇒ closes any open interval and tracks nothing until turned on. Stored per device.
- **EXT-UI-07** **Tracked sites**: list with remove buttons and an input to add a domain (validated, normalized). Same server list as the dashboard (SYNC-09/10).
- **EXT-UI-08** **Account**: connected email · "Disconnect" (AUTH-12). *(#65)* When sessions are not on the server, the confirmation states how many (`pending` from the `UNSYNCED_DATA` reply: unsynced + quarantined, AUTH-12b) and offers **Try syncing again** before **Disconnect anyway**.
- **EXT-UI-08a** When not connected, Settings shows the Tracking switch, then "Connect your account to manage your tracked sites." with **Connect account** (opens the dashboard's `/connect`) instead of Tracked sites and Account. If the last account left local data, **Forget local data** (AUTH-11a) follows; afterwards the view says "Local data deleted."
- No other settings in v0.

## 4. Accessibility

- **EXT-UI-09** Keyboard reachable controls with visible focus; status conveyed by text, not color alone; contrast ≥ WCAG AA in both themes; bars have text values next to them.

## 5. Acceptance criteria

1. Each status and sync state renders correctly in light and dark (component tests with fixtures + visual check).
2. Opening the popup on an untracked `https` site and clicking "Add" makes the status switch to Tracking within 1 s (if the user is active).
3. Top 3 shows at most three rows, sorted by time, with bars proportional to today's total.

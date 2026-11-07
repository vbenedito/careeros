# 05 — Extension UI (popup)

Status: **Approved (2026-11-04)** · Source: *V0 UI/UX Design and Implementation Brief* · Related ADRs: 0007 (UI stack)

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
| 6 | **Footer** | Sync status · "Open dashboard ↗" link |

- **EXT-UI-01** The today total is the most prominent element; its card uses a subtle tinted background and border, no heavy shadow.
- **EXT-UI-02** Durations format as `0m`, `45m`, `1h 05m`; under one minute shows `<1m`. Live values update every second while the popup is open.
- **EXT-UI-03** No charts, streaks, goals, badges or other analytics.
- **EXT-UI-04** The "on this device" caption is always shown (SYNC-12).

### Status states

| State | Label | Hint / action |
|---|---|---|
| Tracking | ● Tracking | — |
| Idle pause | ○ Paused — inactive | "Resumes when you're back" |
| Not a study site | ○ Not tracking this site | "Add `<host>` to tracked sites" (button → adds it, SYNC-10) |
| No tracked sites | ○ No study sites yet | "Add this site" or "Manage sites" |
| Disabled | ○ Tracking off | "Turn on in Settings" |
| Disconnected | ! Not connected | "Connect account" → opens dashboard `/connect` |

- **EXT-UI-05** "Add this site" is offered only for `http/https` pages and adds the page's normalized hostname (TRK-03; `www.` stripped, nothing else). Users who want a parent domain type it in Settings.
- **EXT-UI-05a** The popup holds **no Supabase client**. It reads state from `chrome.storage` and sends commands (add/remove site, toggle, disconnect) to the service worker via `chrome.runtime.sendMessage`; the worker is the single owner of auth and network (AUTH-10).
- **EXT-UI-05b** The footer shows the extension version. "Update available" in the popup is deferred: only protocol 1 exists in v0, and the dashboard already says "Please update the extension" when the protocol is older (AUTH-07a).

### Sync footer states

`Synced · 2m ago` · `3 pending · retrying in 4m` · `Offline · 3 pending` · `Sync error · 3 pending` · `2 not synced` (quarantine, SYNC-05, with tooltip). `Syncing…` is deferred (a cycle takes under a second; #58).

## 3. Settings view (inside the popup, back arrow to main)

- **EXT-UI-06** **Tracking** switch (on by default). Off ⇒ closes any open interval and tracks nothing until turned on. Stored per device.
- **EXT-UI-07** **Tracked sites**: list with remove buttons and an input to add a domain (validated, normalized). Same server list as the dashboard (SYNC-09/10).
- **EXT-UI-08** **Account**: connected email · "Disconnect" (AUTH-12).
- No other settings in v0.

## 4. Accessibility

- **EXT-UI-09** Keyboard reachable controls with visible focus; status conveyed by text, not color alone; contrast ≥ WCAG AA in both themes; bars have text values next to them.

## 5. Acceptance criteria

1. Each status and sync state renders correctly in light and dark (component tests with fixtures + visual check).
2. Opening the popup on an untracked `https` site and clicking "Add" makes the status switch to Tracking within 1 s (if the user is active).
3. Top 3 shows at most three rows, sorted by time, with bars proportional to today's total.

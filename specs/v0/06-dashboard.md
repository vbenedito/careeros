# 06 — Web Dashboard

Status: **Approved (2026-11-04)** · Source: *V0 UI/UX Design and Implementation Brief* · Related ADRs: 0007 (UI stack)

Amended 2026-11-11 (#131): §2 route table and sign-in messages, DASH-07 component, error pages, to match `apps/web/app`.

Amended 2026-11-12 (grill E4, H4, H6): DASH-12 re-adding a tracked site at the limit succeeds and database errors are logged; DASH-14 separates a failed deletion from a wrong confirmation.

Amended 2026-11-12 (#68, #70, #76, #78): DASH-02 trigger label before hydration and drawer scroll-lock nonce; DASH-07 first-visit skeleton and UTC hint; DASH-09 chart colour contrast; DASH-11 temporary vs permanent load errors; DASH-14 Settings heading outline and expired session on Delete account.

## 1. Direction

Answers three questions: *how much did I study, how was it spread across days, on which platforms?* Visual language inspired by shadcn/ui dashboard blocks; product-oriented, minimal, light and dark.

## 2. Pages

| Route | Purpose | Auth |
|---|---|---|
| `/` | Landing page (LAND-01); signed-in visitors are redirected to `/dashboard` (LAND-02) | public |
| `/sign-in` | Google / GitHub buttons, one-line product description, link to privacy | public |
| `/auth/sign-in` (POST) | Starts the OAuth redirect for the chosen provider | public |
| `/auth/callback` | OAuth code exchange | public |
| `/auth/sign-out` (POST) | Sign out (this device, or all devices, AUTH-12a) | required |
| `/dashboard` | Metrics (this spec §4) | required |
| `/settings` | Tracked sites, extension connection, account | required |
| `/connect` | Extension connection flow (AUTH §3) with install guidance | required |
| `/privacy` | Privacy policy (spec 07) | public |
| `/api/sites` (POST), `/api/sites/[id]` (DELETE) | Add / remove a tracked site (DASH-12) | required |
| `/api/extension/link` (POST) | Token hash for the extension handoff (AUTH-08) | required |
| `/api/account/delete` (POST) | Account deletion (DASH-14) | required |
| `/api/client-error` (POST) | Error-page report to the server log (ENV-11) | public |

No other pages or navigation items in v0. The landing page's search files (`/robots.txt`, `/sitemap.xml`, `/opengraph-image`, `/icon.svg`) are public too (LAND-07).

- `/sign-in` shows a message for `?error=oauth` (cancelled, or no verified email), `?error=callback` (code exchange failed; also the fallback for unknown values) and `?error=provider` (provider not available). After account deletion it shows `?deleted=1`: "Your account and all of its data were deleted."
- `app/error.tsx` is the friendly fallback for an error in a page ("Something went wrong", **Try again**); `app/global-error.tsx` covers a failure of the root layout itself. Neither shows error details.

## 3. Shell

- **DASH-01** Collapsible sidebar (shadcn `Sidebar`, `collapsible="icon"`). Expanded: logo + "CareerOS", nav item **Dashboard**; bottom: **Settings** and the user menu (avatar, email, Sign out). Collapsed: icons with tooltips. State persisted in a cookie (component default).
- **DASH-02** Below `md`: sidebar becomes a drawer (`Sheet`) opened from a header button. Its scroll lock's `<style>` carries the CSP nonce (SEC-09). Before hydration the button's accessible name follows the CSS breakpoint ("Open menu" below `md`), so it is never wrong on a phone. Amended 2026-11-12 (#68).
- **DASH-03** Header: page title · period selector · theme toggle (Light / Dark / System via `next-themes`). When the header is too narrow for one row, the period selector moves to a second row; the page never scrolls sideways.

## 4. Dashboard page

**Period**

- **DASH-04** Period modes: **Week** (default, current week) and **Month**, with previous/next arrows and a "Today" shortcut. Next is disabled beyond the current period. Weeks start on **Monday**.
- **DASH-05** The selected period is reflected in the URL (`?view=week&date=2026-11-02`) so it survives reloads and can be shared with oneself.
- *Custom date range is deferred (see §7 deviations).*

**Summary cards** (one row ≥ `lg`, 1–3 columns responsive)

- **DASH-06** (1) **Today** — today's total, always "today" regardless of period. (2) **Selected period** — total for the selected week/month, titled "This week" / "This month" when the period is current, otherwise the period label (e.g. "Oct 2026"). (3) **Top platform** — top domain in the selected period with its time and share; "—" when no data.
- **DASH-07** All aggregations use the viewer's browser IANA time zone, passed to `get_daily_totals` / `get_domain_totals` (DATA-10/11). Server Components cannot see it, so a tiny client component (`components/dashboard/time-zone-sync.tsx`, on the dashboard page) writes it to a `tz` cookie (validated server-side against the IANA list); when the cookie is missing or differs from the browser's zone, it is set and the page refreshes once. On a first visit (no `tz` cookie yet) the dashboard shows its loading skeleton until the refreshed page arrives, so UTC days never flash by; the server also sends the UTC page with the hint, hidden by CSS and revealed after 4 s, so a failed hydration never leaves the skeleton up. When days fall back to UTC (the zone cannot be detected or stored, the cookie holds an invalid zone, or the database does not know it), the page shows a small hint: "Days are shown in UTC because your time zone couldn't be detected." Amended 2026-11-12 (#70).

**Study activity — bar chart** (primary, wider)

- **DASH-08** One bar per day of the period (7 or 28–31), y = hours/minutes, x = weekday (week) or day number (month). Today's bar uses the primary color; others a muted variant. Simple tooltip (date + duration) as provided by the chart component; no drill-down.

**Time by platform — pie chart** (secondary)

- **DASH-09** Donut chart of domain share for the selected period: top 5 domains + "Other" (keeps it readable). Legend lists domain, duration and percentage (percentages sum to 100 after rounding correction). Slice colours (`--chart-1`…`--chart-6`) reach 3:1 against the card in both themes and stay distinct from the status colours (`--success`, `--warning`, `--destructive`); ratios in [docs/design-system.md](../../docs/design-system.md). Amended 2026-11-12 (#76).

**Composition**

- **DASH-10** ≥ `xl`: bar chart `col-span-2`, pie `col-span-1`, side by side. Below: stacked, bar chart first.

**States**

- **DASH-11** Loading skeletons; empty state when the period has no data — includes a "Connect extension" CTA when `STATUS` reports the extension missing or not connected **in this browser** (there is no server-side device registry in v0); on a phone or tablet, where Chrome extensions cannot be installed, it explains instead that tracking runs in Chrome on a computer (no CTA; same for DASH-13 and `/connect`); error state: a temporary failure (no answer, timeout, overload) says so and offers **Try again**; a permanent one (the request is refused or the app and database disagree) says a retry won't help and offers none. Amended 2026-11-12 (#70).

## 5. Settings page

- **DASH-12** **Tracked sites**: list, add (validated/normalized), remove (confirm). Shared with the extension (SYNC-09). Amended 2026-11-12 (grill E4, H4): adding a site that is already tracked succeeds (`200` with the existing site) also when the account is at the limit (DATA-01); an unexpected database error is logged (`logServerError`, code and capped message, no input) before the `500`.
- **DASH-13** **Extension**: status via `STATUS` message (Connected as … / Not installed / Not connected), "Connect" (→ `/connect`) and "Disconnect".
- **DASH-14** **Account**: email and provider, Sign out, **Sign out of all devices** (AUTH-12a), **Delete account** (recent sign-in, AUTH-14; typed confirmation, DATA-12; afterwards redirect to `/sign-in?deleted=1`). If the session expired meanwhile, the API still answers `401 NOT_AUTHENTICATED` (AUTH-03) and the page sends the viewer to `/sign-in?next=/settings#delete-account`, never to a JSON page. Headings: `h1` Settings, an `h2` per card styled as a section title, `h3` inside a card (Delete account). Amended 2026-11-12 (#78). Amended 2026-11-12 (grill H6): `/settings?error=delete` means the typed confirmation did not match ("the confirmation didn't match"), `?error=failed` means the server could not delete the account ("We couldn't delete your account right now. Try again in a few minutes."; logged as `account_delete.failed`).

## 6. Data loading

- **DASH-15** Server Components fetch with the user's Supabase session (RLS applies); period changes navigate via URL. No client-side data cache library in v0.

## 7. Deviations from the UI brief (for approval)

| Brief | v0 decision | Why |
|---|---|---|
| Card 2 "This week" | "Selected period" total (reads "This week" by default) | With week/month navigation, a fixed "this week" card would contradict the chart beside it when viewing another period. Default view is identical to the brief. |
| Custom date range "if reasonable" | Deferred; week + month navigation only | Needs a range calendar, URL/validation rules and range limits; little value over week/month for v0. |
| Pie chart "if justified" | Kept as donut, top 5 + Other | shadcn charts (Recharts) make it cheap; capping slices keeps it readable. |
| Settings near sidebar bottom | Settings page with 3 sections | Needed for domain management (decision "both") and account deletion (LGPD). |

## 8. Acceptance criteria

1. Default load shows current week; cards, bar chart and pie agree with seeded data in E2E.
2. Navigating weeks/months updates URL and all period-bound widgets; "Today" card is unaffected.
3. Today's bar is highlighted only when today is within the period.
4. Sidebar collapses to icons with tooltips; mobile uses a drawer; no horizontal scroll at 360 px.
5. Light/dark/system theme works without flash on load.
6. Lighthouse accessibility ≥ 90 on the dashboard page.

# 00 — Product Scope (v0)

Status: **Approved (2026-11-04)** · Owner: product owner (Benedito) · Tech lead: Claude

## 1. Problem

People preparing for technical interviews study across many sites (LeetCode, NeetCode, GreatFrontEnd, docs, videos). They have no reliable, low-effort answer to: *"How much did I actually study, when, and where?"* Manual timers are forgotten; generic screen-time tools mix study with everything else and collect far more data than needed.

## 2. Objective

v0 measures **study time** automatically and privately, and shows it in a simple web dashboard.

- A Chrome extension measures time spent on domains the user marked as study sites.
- A web dashboard (independent of the extension) shows that time by day and by domain.
- Any person can sign up and use it (multi-user, self-service sign-up).

## 3. Users

| Persona | Need |
|---|---|
| **Interview candidate** (primary) | Know how much they studied this week, on which platforms, without manual work. |
| **Product owner** | A real, shareable product that also demonstrates engineering quality. |

## 4. In scope (v0)

| ID | Capability | Spec |
|---|---|---|
| PRD-01 | Automatic time tracking on user-selected study domains, with activity/inactivity rules | 01 |
| PRD-02 | Sign up / sign in with Google or GitHub on the dashboard | 02 |
| PRD-03 | Connect the extension to the account from the dashboard | 02 |
| PRD-04 | Local persistence and batched, idempotent sync to the backend | 03 |
| PRD-05 | Tracked-domain list editable from the extension **and** the dashboard | 03, 05, 06 |
| PRD-06 | Extension popup: tracking status, today's total, current session, top 3 domains, sync status | 05 |
| PRD-07 | Extension setting to disable tracking | 05 |
| PRD-08 | Dashboard: summary cards, daily bar chart, time-by-domain pie chart, week/month navigation | 06 |
| PRD-09 | Dashboard settings: tracked domains, extension connection, sign out, delete account | 06 |
| PRD-10 | Light and dark themes; responsive dashboard | 05, 06 |
| PRD-11 | Privacy policy page and full account/data deletion (LGPD) | 07 |

## 5. Out of scope (v0)

Not built in v0, even partially: exercise detection; platform-specific integrations; exercise results/attempts; spaced repetition; recommendations; AI insights; goals, streaks, gamification; advanced analytics, drill-downs, cross-filtering, calendar views; custom date-range picker; paid plans; mobile apps; Notion integrations; **Chrome Web Store publication** (v0 ships as an unpacked build); additional dashboard pages beyond Dashboard, Settings, Sign-in, Connect and Privacy.

See [`docs/roadmap.md`](../../docs/roadmap.md) for candidate future iterations.

## 6. Glossary

| Term | Meaning |
|---|---|
| **Tracked domain** | A normalized hostname the user marked as a study site, e.g. `leetcode.com` (lowercase, no `www.`; no public-suffix logic — `docs.python.org` stays `docs.python.org`). It also matches its subdomains (TRK-03). |
| **Eligible tab** | The active tab of the focused Chrome window whose host matches a tracked domain (TRK-03). |
| **Interval** | A contiguous period of tracked time on one tracked domain on one device. Immutable once closed. The unit of storage and sync. |
| **Session (UI)** | In the popup, the current uninterrupted run of intervals on the current domain. A display concept only. |
| **Device** | One Chrome profile with the extension installed, identified by a random `device_id` (new one whenever the extension's local data is cleared, AUTH-11a). |

## 7. Success criteria for v0

- A new user can go from sign-up to seeing their first tracked minutes on the dashboard without help, following on-screen guidance.
- Tracked time matches a manual stopwatch within **±2%** in the scripted manual test (spec 08), excluding deliberate idle periods.
- No user can read or write another user's data (verified by automated RLS tests).
- No data beyond what spec 07 lists is collected.
- CI is green; every v0 issue is closed or explicitly deferred with a reason.

# 01 — LeetCode time per problem

Status: **Proposed (2026-11-17)** · Issue: #176 · Source: [v1 discovery](00-discovery.md) D4, D11, D15, D16, D20, D21, D22 · Related ADRs: [0006](../../docs/adr/0006-tabs-permission.md) (permissions), [0011](../../docs/adr/0011-ingest-v2.md) (ingest v2)

Amended 2026-11-18 (#179): PRB-03..10 implemented in the extension (setting read and cached with the site list, detection, intervals, ingest v2), no longer proposed. PRB-05: "the user must track `leetcode.com` itself" means the tab's recorded tracked domain (TRK-03, longest match) is `PROBLEM_DOMAIN`; the slug rule is `problemSlugFromUrl` in `packages/shared`. The rest of this spec stays proposed.

Amended 2026-11-18 (#179, product owner): PRB-08 — an interval opened or closed by a problem split is kept even when shorter than `MIN_INTERVAL_S` (TRK-10), so the pieces add up to the domain time (PRB-07).

## 1. Objective

Show how much time the user spends on each LeetCode problem. The problem is read from the address of the active tab. Nothing else about the page is read or kept.

The feature is **free**, like everything in v0 (D22). It is **off by default** (D16).

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `PROBLEM_DOMAIN` | `leetcode.com` | The tracked domain whose tabs can carry a problem (TRK-03 match) |
| `PROBLEM_PATH_PREFIX` | `/problems/` | The path must start with it |
| `PROBLEM_SLUG_PATTERN` | `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Lowercase letters and digits, single hyphens between them |
| `PROBLEM_SLUG_MAX` | 100 | Characters |
| `PROBLEM_LIST_MAX` | 200 | Rows in the dashboard list for one period |

## 3. Requirements

**Setting**

- **PRB-01** The setting **Track LeetCode problems** belongs to the **account**, not to a device (D20). It is **off** for every account, new or existing, until the user turns it on (D16). It is stored on the server (DATA-13).
- **PRB-02** The user switches it in the dashboard **Settings** page (DASH-16). The popup has no switch for it.
- **PRB-03** The extension reads the setting with every tracked-site refresh (SYNC-09, SYNC-09c): on startup, on each sync alarm (at most `SYNC_PERIOD_MIN`), when the signed-in account changes, and when the popup opens. So a change in the dashboard reaches the extension within about 5 minutes. No new permission and no content script are needed (SEC-03, ADR-0006).
- **PRB-04** The extension **fails closed**: when it has not read the setting yet, cannot read it, or is not connected, the setting counts as off.

**Detection**

- **PRB-05** A tab has a **problem** only when all of these hold:
  1. the setting is on (PRB-04);
  2. the tab is eligible and its hostname matches the tracked domain `PROBLEM_DOMAIN` by the TRK-03 rule (so `leetcode.com` and its subdomains, such as `www.leetcode.com`; not `leetcode.cn`, not `notleetcode.com`). The user must track `leetcode.com` itself;
  3. the URL path starts with `PROBLEM_PATH_PREFIX`, and its next segment (up to the next `/` or the end of the path) matches `PROBLEM_SLUG_PATTERN` and has at most `PROBLEM_SLUG_MAX` characters. This segment is the **slug**.

  Examples: `/problems/two-sum/`, `/problems/two-sum/description/` and `/problems/two-sum/submissions/123/` all give `two-sum`. `/problemset/`, `/contest/weekly-contest-400/problems/two-sum/`, `/problems/Two-Sum/` and `/problems/two--sum/` give no problem. The slug is never changed to make it valid (no lowercasing, no trimming).
- **PRB-06** Only the slug is kept. The rest of the path, the query string, the fragment, the title and the page content are never stored, sent or logged (SEC-01). The URL is read in memory and dropped, as in TRK-02.
- **PRB-07** A time without a problem is still tracked as before, under the domain only. Turning the setting on or off never changes how much time is tracked; it only changes whether a slug is attached.

**Intervals**

- **PRB-08** An interval carries an optional `problem` (the slug, or none). The problem is part of what the engine compares: when the problem changes (another slug, a slug to none, none to a slug), the open interval closes and a new one opens at the same instant, as for a domain change (TRK-08). All other interval rules stay (TRK-09..11), with one exception (product owner, 2026-11-18): an interval **opened or closed by a problem split** (a change of problem on the same domain, including the PRB-09 close when the setting turns off) is kept even when it is shorter than `MIN_INTERVAL_S` (TRK-10); with the setting off it would have been part of a longer interval. Intervals not involved in a problem split keep the TRK-10 rule.
- **PRB-09** When the setting changes from on to off, the open interval closes at that moment if it has a problem, and the next one has none. Intervals already closed keep their slug in the outbox and are uploaded as they are; the server drops the slug when the setting is off at upload time (DATA-14).
- **PRB-10** The extension sends the slug only through the new ingest RPC (DATA-06b, ADR-0011). The current RPC never receives a slug.

**Dashboard**

- **PRB-11** When the setting is on, the dashboard shows a **LeetCode problems** card for the selected week or month (DASH-17). One row per problem: name, total time in the period, last day studied in the period. Sorted by time, longest first; ties by slug (A–Z). At most `PROBLEM_LIST_MAX` rows. Days use the viewer's time zone (DASH-07).
- **PRB-12** The **name** is built from the slug by this exact rule: split the slug on hyphens; upper-case the first character of each part and keep the rest as it is; join the parts with one space. Examples: `two-sum` → "Two Sum", `3sum` → "3sum", `lru-cache` → "Lru Cache". The real LeetCode title is never fetched. The rule is one pure function in `packages/shared`.
- **PRB-13** A one-time **announcement card** on the dashboard tells the user about the feature while the setting is off (DASH-18).

**Popup**

- **PRB-14** While the current interval has a problem, the popup shows one line under the current session: the problem name (PRB-12) and its time **today on this device** (`Two Sum · 18m today`), from the same local data as the today total (SYNC-12). Nothing is shown when there is no problem (EXT-UI-11).

**Privacy and data**

- **PRB-15** The slug is the only part of a path CareerOS keeps, and only for `PROBLEM_DOMAIN` (SEC-01). The privacy page says so (SEC-13).
- **PRB-16** Turning the setting **off**:
  - stops new slugs at once on the server (DATA-14) and within one refresh in the extension (PRB-03);
  - asks first, when the account has stored slugs: a confirm dialog "Also delete your problem history?" with two choices (product owner, 2026-11-17):
    - **Turn off and keep history**: stored slugs stay. The dashboard hides the problems card while the setting is off. It shows the card again, with the old data, when the setting is turned back on.
    - **Turn off and delete history**: every stored problem slug of the account is deleted (DATA-16). All study time stays: the intervals and every total are unchanged.
  - needs no dialog when the account has no stored slugs: the switch just turns off;
  - there is no separate delete button;
  - stored slugs are always deleted with the account (DATA-12).
- **PRB-17** Before the extension release that ships the feature (#182), the Chrome Web Store privacy answers and listing text are checked and updated if needed, so they mention that problem names from LeetCode addresses are stored when the user turns the feature on (STORE).

## 4. Acceptance criteria

1. Given `leetcode.com` is tracked and the setting is on, when the user works on `www.leetcode.com/problems/two-sum/description/?envType=x` for 10 min, then about 600 s are stored under `leetcode.com` with problem `two-sum`, and no other part of the URL is in storage, in the outbox, in the request body or in the database.
2. Given the setting is off (or not read yet), the same browsing stores the time with no problem.
3. Moving from `two-sum` to `3sum` in the same tab closes one interval and opens the next at the same instant; the times add up to the time on the domain.
4. Turning the setting off in the dashboard: the extension stops attaching slugs within one refresh, and the server stores no slug sent after the change.
5. The dashboard list for a seeded week shows the right names, totals, last days and order; the popup shows the current problem with today's time.
6. Released extension 0.2.3 keeps syncing unchanged against the new database (ADR-0011 compatibility tests).
7. Given an account with stored slugs, when the user turns the setting off and picks **Turn off and delete history**, then the account has no stored slug, `get_problem_totals` returns no rows, and `get_daily_totals` and `get_domain_totals` return the same values as before. With **Turn off and keep history**, the slugs are still there and come back when the setting is turned on again. Without stored slugs, no dialog is shown.

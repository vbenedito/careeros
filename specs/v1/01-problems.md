# 01 — LeetCode time per problem

Status: **Proposed (2026-11-17)** · Issue: #176 · Source: [v1 discovery](00-discovery.md) D4, D11, D15, D16, D20, D21, D22 · Related ADRs: [0006](../../docs/adr/0006-tabs-permission.md) (permissions), [0011](../../docs/adr/0011-ingest-v2.md) (ingest v2)

Amended 2026-11-27 (#241, NC-e): section 5 step 4 done: `get_problem_totals` is dropped by `20261127100000_drop_get_problem_totals.sql` (DATA-15 removed). Acceptance 7 now names `get_problem_totals_v2`. The tests of the old function moved to `get_problem_totals_v2` (110_ingest_v2, 130_problem_domains, `db-parity.test.ts`).

Amended 2026-11-18 (#179): PRB-03..10 implemented in the extension (setting read and cached with the site list, detection, intervals, ingest v2), no longer proposed. PRB-05: "the user must track `leetcode.com` itself" means the tab's recorded tracked domain (TRK-03, longest match) is `PROBLEM_DOMAIN`; the slug rule is `problemSlugFromUrl` in `packages/shared`. The rest of this spec stays proposed.

Amended 2026-11-18 (#179, product owner): PRB-08 — an interval opened or closed by a problem split is kept even when shorter than `MIN_INTERVAL_S` (TRK-10), so the pieces add up to the domain time (PRB-07).

Amended 2026-11-18 (#181): PRB-16 — the dialog also has Cancel; it is shown when the stored-slug check fails.

Amended 2026-11-18 (#180): PRB-14 implemented in the popup (EXT-UI-11): the time is the sum of this device's intervals of today with the same problem, plus the open interval, from the same local data as the today total.

Amended 2026-11-20 (#242, product owner): PRB-23 — problem tracking stays hidden in the dashboard until the store has extension 0.3.0, through the general extension feature gate (ENV-05c, `EXTENSION_STORE_VERSION`). Added: PRB-23, section 5 note. Status: **Approved** (priority hotfix).

Amended 2026-11-19 (#233, proposal, product owner decisions of the same day): problem tracking also covers **NeetCode** (`neetcode.io`). The domain becomes a list, `PROBLEM_DOMAINS` (PRB-18); the setting is one account setting for both sites, renamed **Track coding problems** (label approved 2026-11-19, PRB-22); the dashboard lists problems **per site**, a problem being the pair domain + slug (PRB-19); extension **0.3.1** ships it after 0.3.0 (LeetCode only, as built) without breaking 0.3.0 (PRB-20, PRB-21). Changed: PRB-01, 05, 06, 11, 12, 14, 15, 17 and acceptance 1 and 6; new: PRB-18..22, acceptance 8..12 and section 6. **Status of every item amended or added here: Proposed.** Everything not named stays as it was.

Amended 2026-11-20 (#237, NC-a): implemented in `20261120100000_problem_domains.sql` and `packages/shared` (`PROBLEM_DOMAINS` next to `PROBLEM_DOMAIN`, which stays until NC-b): the database part of PRB-18 (the list in `private.problem_domains()`, read by the domain check and the ingest validation; parity test), PRB-19 and PRB-20 (v1 and 0.3.0 unchanged; `get_problem_totals_v2`), acceptance 9 (database), 11 and 12 (database; pgTAP `130_problem_domains`), and section 5 step 1. Not yet implemented: the parser, extension, dashboard and store parts (NC-b..d) and the contract (NC-e). Status of those: **Proposed**.

Amended 2026-11-20 (#238, NC-b): implemented in packages/shared and apps/extension: PRB-05, 06, 08, 14, 18, 19 (extension part), 20 (tolerant outbox), acceptance 8, 9, 12 (extension), acceptance 10 (popup). PROBLEM_DOMAIN removed; the constants row is now PROBLEM_DOMAINS. Extension version 0.3.1 (not released).

Amended 2026-11-20 (#239, NC-c): implemented in apps/web: PRB-11, 12 (per site), 13, 15 (privacy page), 19 (dashboard), 22 (copy approved by the product owner 2026-11-20), acceptance 10 (dashboard); NeetCode copy gated by EXTENSION_FEATURES.problemTrackingNeetCode (0.3.1).

Amended 2026-11-20 (#239, product owner): PRB-22 — all NC-c wording is approved (settings, card, announcement, privacy page, landing FAQ 1). From now on, the wording of user-facing copy is approved by a specialist copy review agent ([agents.md](../../docs/process/agents.md) §2); PRB-21 store text included.

Amended 2026-11-20 (#240, NC-d): PRB-21 store text for 0.3.1 written (listing.md); submission waits for the PRB-22 guard count and section 5 step 2 deployed with a green smoke run.

## 1. Objective

Show how much time the user spends on each coding problem on LeetCode and NeetCode. The problem is read from the address of the active tab. Nothing else about the page is read or kept.

*Amended 2026-11-19 (#233, proposal):* NeetCode is added. The two sites are separate: a problem is the pair site + slug, and CareerOS never decides that a LeetCode problem and a NeetCode problem are the same one (slugs can differ, e.g. LeetCode `two-sum`, NeetCode `two-integer-sum`).

The feature is **free**, like everything in v0 (D22). It is **off by default** (D16).

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `PROBLEM_DOMAINS` | `leetcode.com`, `neetcode.io` | The tracked domains whose tabs can carry a problem (TRK-03 match; PRB-18). One list in `packages/shared`, repeated in the database (parity test). *Amended 2026-11-20 (#238, NC-b):* replaces the single `PROBLEM_DOMAIN` |
| `PROBLEM_PATH_PREFIX` | `/problems/` | The path must start with it, on every domain of `PROBLEM_DOMAINS` (both sites use it, #233). A site with another prefix would need a prefix per domain: that is a new amendment, not part of #233 |
| `PROBLEM_SLUG_PATTERN` | `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Lowercase letters and digits, single hyphens between them |
| `PROBLEM_SLUG_MAX` | 100 | Characters |
| `PROBLEM_LIST_MAX` | 200 | Rows in the dashboard list for one period, all sites together |

## 3. Requirements

**Setting**

- **PRB-01** The setting **Track LeetCode problems** belongs to the **account**, not to a device (D20). It is **off** for every account, new or existing, until the user turns it on (D16). It is stored on the server (DATA-13). *Amended 2026-11-19 (#233, proposal):* it is **one** setting for all sites of `PROBLEM_DOMAINS`, renamed **Track coding problems** (label approved 2026-11-19, PRB-22). It has no switch per site. The label is approved by the product owner (2026-11-19). The stored value (`track_problems`, DATA-13) and the route (`/api/settings/problems`) keep their names.
- **PRB-02** The user switches it in the dashboard **Settings** page (DASH-16). The popup has no switch for it.
- **PRB-03** The extension reads the setting with every tracked-site refresh (SYNC-09, SYNC-09c): on startup, on each sync alarm (at most `SYNC_PERIOD_MIN`), when the signed-in account changes, and when the popup opens. So a change in the dashboard reaches the extension within about 5 minutes. No new permission and no content script are needed (SEC-03, ADR-0006).
- **PRB-04** The extension **fails closed**: when it has not read the setting yet, cannot read it, or is not connected, the setting counts as off.

**Detection**

- **PRB-05** A tab has a **problem** only when all of these hold:
  1. the setting is on (PRB-04);
  2. the tab is eligible and its hostname matches a tracked domain that is **itself** one of `PROBLEM_DOMAINS` by the TRK-03 rule (so `leetcode.com`, `neetcode.io` and their subdomains, such as `www.leetcode.com` or `www.neetcode.io`; not `leetcode.cn`, not `notleetcode.com`, not `neetcode.io.evil.com`, not `notneetcode.io`). The user must track that domain itself. The slug belongs to the matched domain (PRB-19). *Amended 2026-11-19 (#233, proposal):* was the single `PROBLEM_DOMAIN`;
  3. the URL path starts with `PROBLEM_PATH_PREFIX`, and its next segment (up to the next `/` or the end of the path) matches `PROBLEM_SLUG_PATTERN` and has at most `PROBLEM_SLUG_MAX` characters. This segment is the **slug**.

  Examples: `/problems/two-sum/`, `/problems/two-sum/description/` and `/problems/two-sum/submissions/123/` all give `two-sum`. `/problemset/`, `/contest/weekly-contest-400/problems/two-sum/`, `/problems/Two-Sum/` and `/problems/two--sum/` give no problem. The slug is never changed to make it valid (no lowercasing, no trimming).

  NeetCode examples *(#233, proposal)*: with `neetcode.io` tracked, `https://neetcode.io/problems/two-integer-sum/question` and `https://www.neetcode.io/problems/two-integer-sum` both give the slug `two-integer-sum` on the domain `neetcode.io`; `/problems/two-integer-sum/solution` gives the same. `/roadmap`, `/practice` and `/problems/Two-Integer-Sum/question` give no problem. Lookalikes never give one: `https://neetcode.io.evil.com/problems/two-integer-sum/question`, `https://notneetcode.io/problems/two-integer-sum/question` and `https://neetcode.com/problems/two-integer-sum/question` (the hostname is not tracked, or is tracked as another domain, so the matched domain is not in `PROBLEM_DOMAINS`). With only `app.neetcode.io` tracked, the matched domain is `app.neetcode.io`, which is not in the list: no problem (same rule as for LeetCode).
- **PRB-06** Only the slug is kept (with the domain the interval already has). The rest of the path, the query string, the fragment, the title and the page content are never stored, sent or logged (SEC-01). The URL is read in memory and dropped, as in TRK-02.
- **PRB-07** A time without a problem is still tracked as before, under the domain only. Turning the setting on or off never changes how much time is tracked; it only changes whether a slug is attached.

**Intervals**

- **PRB-08** An interval carries an optional `problem` (the slug, or none). The problem is part of what the engine compares: when the problem changes (another slug, a slug to none, none to a slug), the open interval closes and a new one opens at the same instant, as for a domain change (TRK-08). All other interval rules stay (TRK-09..11), with one exception (product owner, 2026-11-18): an interval **opened or closed by a problem split** (a change of problem on the same domain, including the PRB-09 close when the setting turns off) is kept even when it is shorter than `MIN_INTERVAL_S` (TRK-10); with the setting off it would have been part of a longer interval. Intervals not involved in a problem split keep the TRK-10 rule.
- **PRB-09** When the setting changes from on to off, the open interval closes at that moment if it has a problem, and the next one has none. Intervals already closed keep their slug in the outbox and are uploaded as they are; the server drops the slug when the setting is off at upload time (DATA-14).
- **PRB-10** The extension sends the slug only through the new ingest RPC (DATA-06b, ADR-0011). The current RPC never receives a slug.

**Dashboard**

- **PRB-11** When the setting is on, the dashboard shows a **LeetCode problems** card for the selected week or month (DASH-17). One row per problem: name, total time in the period, last day studied in the period. Sorted by time, longest first; ties by slug (A–Z). At most `PROBLEM_LIST_MAX` rows. Days use the viewer's time zone (DASH-07). *Amended 2026-11-19 (#233, proposal):* the card lists problems **per site** (PRB-19): one row per pair domain + slug, with the site shown on the row (`Two Sum · leetcode.com`, `Two Integer Sum · neetcode.io`). The same slug on two sites gives two rows; times are never added across sites. Ties are broken by domain (A–Z), then slug (A–Z). The card title is "Coding problems" and its subtitle names LeetCode and NeetCode (DASH-17; wording pending, PRB-22).
- **PRB-12** The **name** is built from the slug by this exact rule: split the slug on hyphens; upper-case the first character of each part and keep the rest as it is; join the parts with one space. Examples: `two-sum` → "Two Sum", `3sum` → "3sum", `lru-cache` → "Lru Cache". The real title from the site is never fetched. *(#233, proposal: the rule is the same for both sites; the site is shown next to the name, PRB-11.)* The rule is one pure function in `packages/shared`.
- **PRB-13** A one-time **announcement card** on the dashboard tells the user about the feature while the setting is off (DASH-18).

**Popup**

- **PRB-14** While the current interval has a problem, the popup shows one line under the current session: the problem name (PRB-12) and its time **today on this device** (`Two Sum · 18m today`), from the same local data as the today total (SYNC-12). Nothing is shown when there is no problem (EXT-UI-11). *Amended 2026-11-19 (#233, proposal):* "same problem" means the same domain and slug: the time of `two-sum` on `leetcode.com` is not added to `two-sum` on `neetcode.io`. The line stays as it is; the site is already in the current-session line above it.

**Privacy and data**

- **PRB-15** The slug is the only part of a path CareerOS keeps, and only for the domains of `PROBLEM_DOMAINS` (SEC-01). The privacy page says so (SEC-13). *Amended 2026-11-19 (#233, proposal):* was `PROBLEM_DOMAIN`; the privacy page names both sites before extension 0.3.1 is submitted (PRB-22).
- **PRB-16** Turning the setting **off**:
  - stops new slugs at once on the server (DATA-14) and within one refresh in the extension (PRB-03);
  - asks first, when the account has stored slugs: a confirm dialog "Also delete your problem history?" with two choices (product owner, 2026-11-17), plus **Cancel**, which closes the dialog and leaves the setting on (product owner, 2026-11-18). If the check for stored slugs fails, the dialog is shown (asking is the safe side):
    - **Turn off and keep history**: stored slugs stay. The dashboard hides the problems card while the setting is off. It shows the card again, with the old data, when the setting is turned back on.
    - **Turn off and delete history**: every stored problem slug of the account is deleted (DATA-16). All study time stays: the intervals and every total are unchanged.
  - needs no dialog when the account has no stored slugs: the switch just turns off;
  - there is no separate delete button;
  - stored slugs are always deleted with the account (DATA-12).
- **PRB-17** Before the extension release that ships the feature (#182), the Chrome Web Store privacy answers and listing text are checked and updated if needed, so they mention that problem names from LeetCode addresses are stored when the user turns the feature on (STORE). Done for 0.3.0 (#182). *Amended 2026-11-19 (#233, proposal):* see PRB-21 for 0.3.1.

**NeetCode (#233, proposal)**

- **PRB-18** *(#233, proposal)* `PROBLEM_DOMAINS` is the one list of sites whose tabs can carry a problem: `leetcode.com`, `neetcode.io`. It lives in `packages/shared` and replaces `PROBLEM_DOMAIN` in the parser (`problemSlugFromUrl`), the schema checks and the extension. The database holds the same list in its check and in the ingest validation, and a parity test keeps the two equal (as for the other spec constants). Adding a third site later is an amendment with its own ADR check, not a code-only change.
- **PRB-19** *(#233, proposal)* A problem is the pair **domain + slug**, end to end: the interval has its domain (TRK-10) and its slug; the stored slug row belongs to a session of that domain (DATA-16); the popup line (PRB-14) and the dashboard list (PRB-11, DATA-15) group by the pair. There is no mapping between sites and no merging, in v1 or in the data (product owner, 2026-11-19).
- **PRB-20** *(#233, proposal)* **Compatibility.** Extension 0.3.0 (LeetCode only) keeps working, before and after the migration and the dashboard release: it only ever sends `problem` on `leetcode.com` intervals, which stay valid; on `neetcode.io` it sends time with no slug, as for any tracked site (PRB-07). Extension 0.2.3 and older never send a slug. The ingest wire contract does not change (ADR-0011, amended 2026-11-19). The rollout follows expand → deploy → contract ([release.md](../../docs/process/release.md)); the order is in section 5.
- **PRB-21** *(#233, proposal)* **Store, extension 0.3.1** (same kind of item as PRB-17). Before 0.3.1 is submitted: the extension version is bumped to 0.3.1; the listing description and the **Privacy practices** answers (`tabs` justification, "Web history" row) name NeetCode as well as LeetCode (STORE-02..06, [listing.md](../../docs/chrome-web-store/listing.md)); the permissions stay the same as 0.3.0 (STORE-08 check). The product owner approves the store text. 0.3.1 is submitted only after the dashboard release of section 5, step 2 is deployed and the smoke run is green.
- **PRB-22** *(#233, proposal)* **Copy.** The user-facing texts name both sites: the setting label and its line (DASH-16), the dashboard card title and empty state (DASH-17), the announcement card (DASH-18), the privacy page (SEC-13), landing FAQ 1 and the hero demo label ([content.md](../../docs/landing/content.md)), the store listing (PRB-21) and the marketing documents that name the feature. This spec fixes **what each text must say**; the **exact wording is left to the product owner**. Decided 2026-11-19: (a) the label is **"Track coding problems"** (approved); its help text names LeetCode and NeetCode; (b) the other wording (privacy paragraph, card text, announcement) is still the product owner's to approve; (c) the setting covers both sites, and the product owner confirmed on 2026-11-19 that no account uses the feature today. As a guard, before 0.3.1 is submitted the tech lead counts the accounts with the setting on; if there are any, they get a one-time dashboard notice that NeetCode is now included (a DASH-18 variant for accounts with the setting on) before 0.3.1 ships. Trade-off: the guard costs one query and a small notice, and avoids silently widening what an existing opt-in covers. Marketing documents follow the approved wording and are approved as in [agents.md](../../docs/process/agents.md) §2.

- **PRB-23** (#242) **Release gate.** Problem tracking is a dashboard feature that needs extension 0.3.0, so it uses the general gate of ENV-05c: `EXTENSION_FEATURES.problemTracking` = `0.3.0`, and it is live only when the server-only variable `EXTENSION_STORE_VERSION` (the version live in the Chrome Web Store, set by the product owner after each store approval) is at least that. Missing or empty = hidden; an invalid value fails the production build check and is never logged. While it is not live: no announcement card (DASH-18), no **Settings** problems section (DASH-16) and no problems card (DASH-17), so the dashboard looks as before problem tracking; `PUT /api/settings/problems` answers `404 NOT_FOUND`, so the UI and the API agree. Stored data (the setting, the slugs) and the database functions are untouched, and the extension is not affected: it only **reads** `account_settings.track_problems` under the user's session (DATA-13, PRB-03) and never calls the route. Once live, the behaviour is exactly as in PRB-01..22. The variable is read on every request (the pages are server-rendered with the session, so dynamic; nothing is baked in at build time); Vercel applies a changed variable only to new deployments, so changing it takes effect on a redeploy. NeetCode support needs 0.3.1; the NeetCode issues (section 6) add their own minimum to `EXTENSION_FEATURES`. The **copy** follows the same gate (product owner: every extension feature is synced): while it is not live, the privacy page omits the problem-name row, the announcement-flag row, the "LeetCode problems" section and the account-deletion sentence about problem names, and its "Nothing else" paragraph, landing FAQ 1 and the hero demo label read as before #226 (no exception sentence; "Only the site and the start and end times are saved."). The privacy page is server-rendered per request (it follows the running deployment); the landing page is static and reads the variable at build time, so the redeploy after changing it updates it (the documented step). Amended 2026-11-20 (#242): this replaces the first decision that the privacy page and landing are not gated.

## 4. Acceptance criteria

1. Given `leetcode.com` is tracked and the setting is on, when the user works on `www.leetcode.com/problems/two-sum/description/?envType=x` for 10 min, then about 600 s are stored under `leetcode.com` with problem `two-sum`, and no other part of the URL is in storage, in the outbox, in the request body or in the database.
2. Given the setting is off (or not read yet), the same browsing stores the time with no problem.
3. Moving from `two-sum` to `3sum` in the same tab closes one interval and opens the next at the same instant; the times add up to the time on the domain.
4. Turning the setting off in the dashboard: the extension stops attaching slugs within one refresh, and the server stores no slug sent after the change.
5. The dashboard list for a seeded week shows the right names, totals, last days and order; the popup shows the current problem with today's time.
6. Released extension 0.2.3 keeps syncing unchanged against the new database (ADR-0011 compatibility tests). *(#233: the same holds for 0.3.0 against the database after the NeetCode migration, acceptance 11.)*
7. Given an account with stored slugs, when the user turns the setting off and picks **Turn off and delete history**, then the account has no stored slug, `get_problem_totals_v2` returns no rows, and `get_daily_totals` and `get_domain_totals` return the same values as before. With **Turn off and keep history**, the slugs are still there and come back when the setting is turned on again. Without stored slugs, no dialog is shown.

*Added 2026-11-19 (#233, proposal). Tests are written in the implementation issues of section 6; until then PRB-18..22 are untested IDs, which is expected for a proposal.*

8. Given `neetcode.io` is tracked and the setting is on, when the user works on `https://www.neetcode.io/problems/two-integer-sum/question` for 10 min, then about 600 s are stored under `neetcode.io` with problem `two-integer-sum`, and nothing else of the URL is in storage, in the outbox, in the request body or in the database. The same address without `/question` gives the same result.
9. Lookalike hosts give no problem: `neetcode.io.evil.com`, `notneetcode.io` and `neetcode.com` with the path `/problems/two-integer-sum/question` store no slug (parser, extension and database: a direct v2 call with `problem` on a domain outside `PROBLEM_DOMAINS` makes only that element `invalid`).
10. Given two seeded weeks with `two-sum` on `leetcode.com` (20 min), `two-sum` on `neetcode.io` (5 min) and `two-integer-sum` on `neetcode.io` (7 min), the dashboard shows three rows, each with its site, in the order 20, 7, 5 min; the two `two-sum` times are not added. On the NeetCode `two-sum` tab the popup shows `Two Sum · 5m today`, counting only the NeetCode time.
11. Extension 0.3.0, run as a fixture against the database after the migration, syncs a batch with a `leetcode.com` interval with slug and a `neetcode.io` interval without slug: both confirmed, one slug row, no sync error. The released-extension contract test of ADR-0011 (0.2.3) still passes.
12. With the setting off, or with `neetcode.io` not tracked, the same NeetCode browsing stores the time with no problem. Turning the setting off and choosing **Turn off and delete history** deletes the slugs of both sites and leaves every study-time total unchanged (acceptance 7).

## 5. Compatibility and rollout *(#233, proposal)*

Follows [release.md](../../docs/process/release.md) (expand → deploy → contract). The dashboard deploys at the moment its PR merges and released extensions stay on the old API for weeks, so each step must keep the step before it working.

| Step | What | Why it is safe |
|---|---|---|
| 1. Expand (DB issue) | One migration: the check `study_session_problems_domain_check` widens from `domain = 'leetcode.com'` to the `PROBLEM_DOMAINS` list (drop and add the check; every stored row stays valid); the ingest validation in `private.ingest_sessions` accepts the list; a **new** function `get_problem_totals_v2` returns `domain, problem_slug, seconds, last_day` per row (the current `get_problem_totals` returns no domain, and a return type cannot change in place); `get_problem_totals` stays. pgTAP tests. Merged and applied (migrate workflow green) first | Only widens. The deployed dashboard still calls `get_problem_totals`; 0.3.0 and 0.2.3 send nothing new. No client can send a NeetCode slug yet |
| 2. Deploy code (web issue, then the shared+extension build) | The dashboard calls `get_problem_totals_v2` and shows the site per row; the Settings label, the announcement, the privacy page and the landing copy name both sites. This ships **before** 0.3.1 is submitted | Until 0.3.1 is installed there are only `leetcode.com` rows, which render as before |
| 3. Release 0.3.1 (store issue) | Version bump, store zip, listing and privacy answers (PRB-21); the product owner submits | Old installs keep working (PRB-20) |
| (each extension release) | The step that releases an extension ends, after the store approval, by setting `EXTENSION_STORE_VERSION` to the new version and redeploying (ENV-05c, PRB-23, [release.md](../../docs/process/release.md)): `0.3.0` after 0.3.0, `0.3.1` after 0.3.1 (the NeetCode issues add their minimum to `EXTENSION_FEATURES`). Until then the dashboard hides the feature, so nobody can turn on a setting the installed extension does not honour | The dashboard never offers a feature the store version cannot deliver |
| 4. Contract (#241, **done 2026-11-27**) | Drop `get_problem_totals` once no deployed dashboard calls it (the extension never does). No change to `ingest_study_sessions`; its own removal stays as in ADR-0011 | Nothing deployed uses it |

Rollback: step 1 is a widening, so it needs no undo. If 0.3.1 has a problem, the store rollback of release.md applies (rebuild the last good code with a higher version). Rows already stored for `neetcode.io` stay valid. A rollback build for 0.3.1 is 0.3.1 code with `neetcode.io` removed from `PROBLEM_DOMAINS` (the tolerant parse then keeps the time), or 0.3.0 code plus `parseIntervalTolerant`, released with a higher version number (release.md). A rollback to plain 0.3.0 code would reject queued NeetCode intervals whose problem is on an unknown domain (outbox schema check in `apps/extension/src/background/tracking/store.ts`), so NC-b must make the outbox parse tolerant (keep the time, drop a problem on an unknown domain) and test it.

## 6. Issues (proposed, #233)

Numbers are assigned when the product owner approves this proposal. Model and review follow [agents.md](../../docs/process/agents.md) §1–2. At most two at once, only where the file areas do not overlap (AGENTS.md §4).

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| NC-a | DB: the migration of section 5 step 1, pgTAP (widened check, NeetCode accepted by ingest v2 and refused outside the list, lookalike domain `invalid`, `get_problem_totals_v2` with two sites and the same slug, history delete across sites, grants as for `get_problem_totals`); adds `PROBLEM_DOMAINS` to `constants.ts` (keeping `PROBLEM_DOMAIN` until NC-b) and the parity test | `supabase/`, `packages/shared/src/constants.ts` and `db-parity.test.ts` | Sonnet · **Opus deep review** (database migration, ingest path) | First |
| NC-b | Shared + extension: parser and schemas use `PROBLEM_DOMAINS` and remove `PROBLEM_DOMAIN`; engine and popup key the problem by domain + slug; the outbox parse is tolerant (keep the time, drop a problem on an unknown domain) with a test; tests by ID (PRB-05, 08, 14, 18, 19; examples of acceptance 8, 9, 12); version 0.3.1 in `package.json` (not released) | `packages/shared`, `apps/extension` | Sonnet · **Opus deep review** (the domain gate is the privacy boundary of PRB-05) | After NC-a is merged and applied |
| NC-c | Web: problems card per site and `get_problem_totals_v2` (PRB-11, DASH-17), Settings label and line, "needs a problem site tracked" message (DASH-16), announcement, privacy page, landing FAQ 1 and hero label, docs (`architecture/`, `landing/content.md`); copy as approved by the product owner | `apps/web`, `docs/` | Sonnet · Sonnet (copy needs the product owner's approval, PRB-22) | After NC-b is merged (shared files) and the copy is approved |
| NC-d | Store: `listing.md` text and privacy answers for 0.3.1 (PRB-21), release notes line; the product owner submits the package | `docs/chrome-web-store/`, `specs/store/` | Sonnet · tech lead's check, product owner approves the store text | After NC-c is deployed and smoke is green |
| NC-e (#241, **done 2026-11-27**) | Contract: drop `get_problem_totals`; update `supabase/tests/database/110_ingest_v2.test.sql`, `db-parity.test.ts` and acceptance 7 | `supabase/` | Sonnet · **Opus deep review** (migration) | Later: only after the dashboard rollback window has passed, so no deployment that calls `get_problem_totals` can still be promoted |

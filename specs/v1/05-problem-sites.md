# 05 — Problem sites by example URL

Status: **Approved (2026-11-27)** · Issue: #245 · Builds on: [01-problems](01-problems.md) (PRB-01..23, NC-a..e), [02-entitlements](02-entitlements.md) (ENT) · Related ADRs: [0006](../../docs/adr/0006-tabs-permission.md) (permissions), [0011](../../docs/adr/0011-ingest-v2.md) (ingest v2), [0012](../../docs/adr/0012-entitlements.md) (entitlements), [0015](../../docs/adr/0015-user-problem-rules.md) (user problem rules, proposed)

Approved 2026-11-27 (#245, product owner): O1 build now as extension 0.4.0 (0.3.1 is live in the store); O2 never store the query or fragment; O3 rule label + id now, a per-problem name later (P1); O4 cap 5 user rules on `free`; O5 LeetCode and NeetCode stay built-in; O6 id kind `id`, at most 64 characters. All recommendations of section 8 accepted. The IDs are untested until PS-a..d add their tests.

Amended 2026-11-27 (#285, PS-a): implemented in `supabase/migrations/20261127200000_problem_rules.sql` and `supabase/tests/database/140_problem_rules.test.sql`: section 6 step 1 and PSR-09, PSR-13 (database part), PSR-15, PSR-16, PSR-22, PSR-23, PSR-24 and PSR-25 (confirmation); constants in `packages/shared/src/constants.ts` with parity tests; `plans.max_problem_rules`. Choices where the text left room: clients read only **active** rules (a tombstone is not readable); the RPCs are `add_problem_rule`, `remove_problem_rule(rule, delete_history)` and `delete_problem_history(domain)` (no list RPC: the list is a `SELECT` under RLS); the insert trigger of `study_session_problems` also accepts a direct insert for a domain with only a removed rule, so a restore from the backup can load history kept with **Remove and keep history**; `PSR-12`..`PSR-14`, `PSR-17`..`PSR-21` are not part of PS-a.

## 1. Objective

Today a problem site is a fixed list in code and in the database (`PROBLEM_DOMAINS` = `leetcode.com`, `neetcode.io`, PRB-18) with one fixed path rule (`/problems/<slug>`). A new site needs a migration, an extension release and a store review (#233).

This spec lets a user **add their own problem site** by pasting one example problem URL, for example:

`https://www.hellointerview.com/practice/system-design/cmlz26cxp08st08adxvy89hr1?q=non-functional-requirements`

The dashboard turns the example into a **problem rule** (site, path prefix, which segment is the problem id). The user checks what will be kept and confirms. From then on, CareerOS tracks time per problem on that site, **without a new extension release**. One extension release that understands rules is needed first (section 6).

The model stays the one of #233: a problem is the pair **domain + id** (PRB-19). Rules only add new ways to get an id from an address. LeetCode and NeetCode become **built-in rules** with the same shape.

### Answers to the questions of #245 (short)

| # | Question | Answer | Where |
|---|---|---|---|
| 1 | Store policy | Allowed. A rule is data (a domain, literal path segments, an id kind from a fixed list). The matcher is fixed code in the package. No regex, no script and no expression comes from the server. The "Remote code" answer stays **No** | PSR-17, PSR-18, ADR-0015 |
| 2 | Privacy | Only **one path segment** (the id) is kept, checked by a fixed pattern and a max length. A warning and a required confirmation guard against ids that name a person or a private link (PSR-25). The query string and the fragment are **never** kept, so `q` is not kept. The pasted example URL never leaves the browser | PSR-08..10, PSR-25 |
| 3 | Consent and scope | Rules belong to the account. Each rule is an opt-in for one site, and the account setting **Track coding problems** must also be on. Removing a rule asks whether to delete that site's problem history. LeetCode and NeetCode are built-in rules | PSR-01..04, PSR-13 |
| 4 | UX | Paste one URL; the dashboard proposes the rule and shows exactly what is kept (`cmlz26cxp08st08adxvy89hr1`) and what is not (`?q=…`). The row shows the rule's label and the id; a label per problem is a later step | PSR-11, PSR-12, PSR-14 |
| 5 | Safety | Rules only on the user's own tracked domains (TRK-03, exact match on the tracked domain); a cap per account (ENT); a strict template language with no user regex; lookalikes give nothing | PSR-05..07, PSR-15, PSR-16 |
| 6 | Sync | Rules are downloaded with the tracked sites (SYNC-09..09d). One extension release (0.4.0) learns rules; it is gated by `EXTENSION_FEATURES` (ENV-05c, PRB-23). After that, new sites need no release | PSR-19..21 |
| 7 | Data model and migration | Builds on NC-a..e: same table of problem ids, same `get_problem_totals_v2`, same setting. The fixed list becomes the built-in rules; user rules are a new table. Nothing of #233 is replaced | PSR-22..24, section 6 |

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `PROBLEM_RULE_PREFIX_MIN` | 1 | Literal segments before the id. At least one, so a rule never takes the first segment of every page (`/about`, `/pricing`) |
| `PROBLEM_RULE_PREFIX_MAX` | 3 | Literal segments before the id |
| `PROBLEM_RULE_SEGMENT_PATTERN` | `^[a-z0-9]+(?:[-_.][a-z0-9]+)*$` | Each literal segment of the prefix. Lowercase. Compared exactly (no lowercasing of the address) |
| `PROBLEM_RULE_SEGMENT_MAX` | 40 | Characters per literal segment |
| `PROBLEM_ID_KINDS` | `slug`, `id` | The fixed list of id kinds. A rule names one; it never carries its own pattern |
| `PROBLEM_SLUG_PATTERN` (kind `slug`) | `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Unchanged from PRB-05. Used by the built-in rules |
| `PROBLEM_ID_PATTERN` (kind `id`) | `^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$` | For user rules. Letters, digits, single `-` or `_` between them. No `%`, `@`, `.`, `=`, `+` or `~`, so an encoded value, an email or a file name is never an id |
| `PROBLEM_SLUG_MAX` | 100 | Characters, kind `slug` (unchanged, PRB-05) |
| `PROBLEM_ID_MAX` | 64 | Characters, kind `id`. Lower than the slug limit: most problem ids are short, and long random values are more often secret links (PSR-25). **Open decision O6** |
| `PROBLEM_RULE_RISKY_SEGMENTS` | `user`, `users`, `u`, `in`, `profile`, `profiles`, `account`, `accounts`, `share`, `shared`, `invite`, `d`, `token`, `s` | A prefix segment in this list shows the personal-data warning (PSR-25). Compared exactly, lowercase |
| `PROBLEM_ID_RANDOM_MIN` | 20 | An id this long or longer with both letters and digits and no `-` or `_` "looks random" and shows the warning (PSR-25) |
| `PROBLEM_RULE_LABEL_MAX` | 40 | Characters of the label the user types for a rule |
| `FREE_MAX_PROBLEM_RULES` | 5 | User rules per account on the free plan (ENT-01 column `max_problem_rules`). Built-in rules do not count. **Open decision O4** |
| `BUILT_IN_PROBLEM_RULES` | `leetcode.com` `/problems/` `slug`; `neetcode.io` `/problems/` `slug` | Exactly today's `PROBLEM_DOMAINS` + `PROBLEM_PATH_PREFIX` + `PROBLEM_SLUG_PATTERN`, written as rules. In `packages/shared`, repeated in the database (parity test) |

## 3. Requirements

**Rules and consent**

- **PSR-01** A **problem rule** has: a `domain` (one of the user's tracked domains, PSR-05), a `prefix` (1 to 3 literal path segments, PSR-06), an id `kind` (`slug` or `id`, PSR-07) and a `label` (text the user types, at most `PROBLEM_RULE_LABEL_MAX` characters; default: the domain). It has no other field the user sets (the server adds `confirmed_at` and `removed_at`, PSR-22, PSR-25). In particular it has no pattern, no regex, no script and no query or fragment part.
- **PSR-02** User rules belong to the **account** (like tracked sites, DATA-04), not to a device. Each user adds their own. No user ever sees or uses another user's rules.
- **PSR-03** A user rule is the user's **opt-in for that site**. It works only when the account setting **Track coding problems** is also on (PRB-01, PRB-04). With the setting off, no rule gives an id, built-in or not. The setting keeps its name and its stored value (`track_problems`).
- **PSR-04** LeetCode and NeetCode are **built-in rules** (`BUILT_IN_PROBLEM_RULES`). They are in the extension code and in the database, not in the user's rule list. The user cannot edit or delete them; they do not count against the cap (PSR-15). They behave exactly as PRB-05 says today. A user rule on a domain that has a built-in rule is refused in this version (open decision O5).

**The template language**

- **PSR-05** **Host.** A rule matches a tab only when the tab's **matched tracked domain** (TRK-03, longest match) is **equal to** the rule's `domain`. So `www.hellointerview.com` counts for a rule on `hellointerview.com` when the user tracks `hellointerview.com`. `hellointerview.com.evil.com`, `nothellointerview.com` and `hellointerview.co` never match. If the user tracks only `app.example.com`, a rule must be on `app.example.com`. The rule's domain must be in the user's tracked sites when the rule is created (PSR-11); if the site is removed later, the rule stays stored but gives no id (no tracked domain matches).
- **PSR-06** **Path prefix.** The path (`URL.pathname`, as the browser gives it, never decoded or lowercased) is split on `/`, empty segments dropped. The first `n` segments must be **equal** to the `n` literal segments of the prefix (`1 ≤ n ≤ 3`). Each literal segment matches `PROBLEM_RULE_SEGMENT_PATTERN` and has at most `PROBLEM_RULE_SEGMENT_MAX` characters. No wildcard, no optional segment, no alternatives.
- **PSR-07** **Id segment.** The segment right after the prefix is the **id**. It must match the pattern of the rule's `kind` (`PROBLEM_SLUG_PATTERN` or `PROBLEM_ID_PATTERN`) and the max length of that kind (`PROBLEM_SLUG_MAX` for `slug`, `PROBLEM_ID_MAX` for `id`); otherwise the tab has no problem. The id is never changed to make it valid (no lowercasing, no trimming, no decoding). Segments after the id are ignored. User rules use `id`; built-in rules use `slug`.
- **PSR-08** **Query and fragment.** The query string and the fragment are **never** read by the matcher, never stored and never sent, for every rule. There is no rule field to keep them. In the example, `?q=non-functional-requirements` is a sub-section of the problem; its time counts under the problem `cmlz26cxp08st08adxvy89hr1` (open decision O2).
- **PSR-09** **Several rules.** When more than one rule of the tab's domain matches, the one with the **longest prefix** wins; when the prefixes are equal, the rules are duplicates and the second one is refused at creation (PSR-11). Only **active** rules count for duplicates and for the cap: a removed rule (PSR-22) never blocks adding the same rule again. The id belongs to the domain, not to the rule (PRB-19): two rules on one domain that give the same id give the same problem.

  Examples, with `hellointerview.com` tracked and the rule `hellointerview.com` · `practice/system-design` · `id`:
  - `https://www.hellointerview.com/practice/system-design/cmlz26cxp08st08adxvy89hr1?q=non-functional-requirements` → `cmlz26cxp08st08adxvy89hr1`;
  - `…/practice/system-design/cmlz26cxp08st08adxvy89hr1/notes` → the same id;
  - `…/practice/system-design` (no id), `…/practice/behavioral/abc123`, `…/Practice/system-design/abc123`, `…/practice/system-design/abc%20123` → no problem;
  - `https://hellointerview.com.evil.com/practice/system-design/abc123` → no problem (not the tracked domain).

  Negative examples for **creating** a rule (PSR-25): pasting `https://example.com/u/john-doe`, `https://www.linkedin.com/in/jane-doe` or `https://docs.google.com/document/d/1AbC…xyz/edit` shows the personal-data warning, because the prefix has `u`, `in` or `d`. The Google Docs id is also longer than `PROBLEM_ID_MAX`, so it cannot be picked at all. The user should not confirm such a rule; the warning says why (it is advice, not a block, PSR-25).

**Privacy (SEC-01)**

- **PSR-10** What is kept per problem: the **id** (one path segment, PSR-07) with the domain the interval already has. Nothing else from the address, the title or the page. The URL is read in memory with the `tabs` permission and dropped, as in TRK-02 and PRB-06. No new permission, no host permission and no content script (SEC-03, ADR-0006). The SEC-01 exception would become (proposed amendment, section 3a): "when **Track coding problems** is on, the problem id from addresses of the built-in problem sites and of the problem sites the user adds, as their rule defines it (one path segment, a strict pattern); nothing else from those addresses and no path of any other site".
- **PSR-11** **The example URL never leaves the browser.** The dashboard parses the pasted URL in the page (a pure function in `packages/shared`). Only the rule (PSR-01) is sent to the server. The example URL is not stored, not logged and not sent to analytics (SEC-15).

**Dashboard UX**

- **PSR-12** **Add a problem site** (Settings, next to the setting of PRB-02). The user pastes one example URL. The dashboard:
  1. refuses a URL that is not `http:` or `https:`;
  2. finds the matched tracked domain (TRK-03). If there is none, it says the site must be a study site first and offers to add it (DASH-12); if the domain has a built-in rule, it says the site is already supported (PSR-04);
  3. proposes the id: the **last** path segment that matches `PROBLEM_ID_PATTERN`, has at most `PROBLEM_ID_MAX` characters and has at least `PROBLEM_RULE_PREFIX_MIN` valid literal segments before it, at most `PROBLEM_RULE_PREFIX_MAX` (in the example: prefix `practice/system-design`, id `cmlz26cxp08st08adxvy89hr1`). The user can pick another segment as the id; the segments before it become the prefix. A segment that does not fit the patterns cannot be picked, with a short reason;
  4. shows a **preview**: "We will keep: `cmlz26cxp08st08adxvy89hr1`" and "We never keep: the rest of the address (`?q=non-functional-requirements`)", plus the rule in words ("Pages under hellointerview.com/practice/system-design/…");
  5. shows the personal-data warning when PSR-25 applies;
  6. asks for a label (prefilled with the domain) and the required confirmation of PSR-25, then a confirm. Nothing is saved before the confirm.

  *Extension version note.* Rules work only in extension 0.4.0 or later. The dashboard does not know which version a user has installed (only the store version, ENV-05c). So the problem-sites list always shows one line under it: "Problem sites you add need CareerOS extension 0.4.0 or later. Chrome updates extensions on its own; until then, time on these sites is still tracked, without problem names." A user on 0.3.1 who adds a rule sees the rule in the list and the time under the site, but no problem rows for it until Chrome updates the extension (no error, no lost time).
- **PSR-13** **The list of problem sites** shows the built-in sites (not removable) and the user's rules (label, domain, prefix). **Remove** asks first, like PRB-16, when that domain has stored ids: **Remove and keep history**, **Remove and delete history** (deletes the stored ids of that domain only; all study time stays), **Cancel**. When that domain has no stored ids, no dialog; the remove still leaves a tombstone (PSR-22), because intervals may still be queued in the extension. When another rule remains on the same domain, the dialog says the history is shared by the domain.
- **PSR-14** **Names.** For a built-in rule the name is built as PRB-12 says. For a user rule the row shows the rule's **label** and the **id as it is** (`System design · cmlz26cxp08st08adxvy89hr1`; the id may be shortened in the middle on small screens, with the full id in a tooltip). CareerOS never fetches the page title. A user-typed name **per problem** is a later step (P1, open decision O3).

**Safety and limits**

- **PSR-15** **Cap.** The number of user rules per account is a plan limit (ENT-01: new column `max_problem_rules`, `FREE_MAX_PROBLEM_RULES` on `free`). The database enforces it in the insert path, as for DATA-01 (ENT-03). The limit error follows ENT-05..08: code `LIMIT_REACHED`, `hint` = `PSR-15` (a new rule has no released client that reads `DATA-01`, so it gets its own hint), the limit and the plan in the details, with `kind: "problem_rules"` added in `details` only. The dashboard says "You can add up to 5 problem sites." from the error (ENT-09). The landing page builds the number from the shared constants (ENT-10); a parity test keeps the migration and the constant equal (ENT-11).
- **PSR-16** **Validation in three places.** The same shared schema checks a rule in the dashboard (before saving), in the database (on insert: domain is one of the caller's tracked domains and has no built-in rule; prefix and kind valid; no duplicate prefix among the caller's active rules on the domain) and in the extension (on every download, PSR-19). An invalid rule is never stored, and a downloaded rule that fails the schema is dropped alone (the others keep working). Clients have no `UPDATE` (and no `INSERT` or `DELETE`) grant on `problem_rules`: a change is remove + add (like tracked sites, DATA-04). Only the definer remove RPC changes a row, by setting `removed_at` and clearing the prefix and label (PSR-22).

- **PSR-25** **Personal data in ids.** A rule could capture a person or a secret link instead of a problem (`/u/john-doe`, `/in/<name>`, `/users/<id>`, a shared document `/document/d/<link id>`). To prevent this:
  1. **Warning.** The dashboard shows a clear warning before the confirm when a prefix segment is in `PROBLEM_RULE_RISKY_SEGMENTS`, or when the proposed id has at least `PROBLEM_ID_RANDOM_MIN` characters, both letters and digits, and no `-` or `_` ("looks random"). Text (copy review): "This part of the address may name a person, an account or a private link. Only continue if it names a problem." The example URL of this spec shows the "looks random" warning (its id has 25 characters); that is expected: many problem ids are random, and the user decides.
  2. **Required confirmation.** Every new rule needs a ticked box: "This part of the address names a problem. It is not a person, an account or a private link." The API refuses a rule without `confirmedProblemId: true` (stored with the rule as `confirmed_at`).
  3. **Shorter ids.** The `id` kind allows at most `PROBLEM_ID_MAX` (64) characters, so very long link tokens cannot be picked.
  4. **Privacy page.** The text of PSR-18 tells the user not to add such pages and how to remove a site and its history.

  The warning is advice, not a block: a site can use `/u/` or `/d/` for problems. The block is the confirmation plus the length limit.

**Store policy**

- **PSR-17** A rule is **data**, interpreted by fixed code shipped in the package (the matcher of PSR-05..09). The matcher has no loops or branches driven by the rule other than "compare these literal segments, then check one segment against one of two fixed patterns". It never builds a `RegExp`, a `Function` or any code from server data, and the extension CSP stays `script-src 'self'` (SEC-04). The Chrome Web Store "Remote code" answer stays **No** (STORE-03).
- **PSR-18** **Store text** (same kind of item as PRB-17 and PRB-21), before 0.4.0 is submitted: the description, the `tabs` justification and the **Web history** row say "the problem identifier (one part of the address) from LeetCode, NeetCode and the problem sites you add" instead of naming only the two sites. The data category stays **Web history** (already declared); no new category. The privacy page (SEC-13) says the same, says that the example URL is not stored, lists the rules as account data, and says: "Only add pages where the address names a problem. Do not add pages whose address names a person, an account or a private link (for example a profile page or a shared document): CareerOS would store that part of the address as the problem id. You can remove a problem site and its history at any time." The product owner approves the store text; the copy review agent approves the wording ([agents.md](../../docs/process/agents.md) §2).

**Sync and release**

- **PSR-19** Each refresh of the tracked sites (SYNC-09, SYNC-09c) also reads the account's rules, with the same rules as the setting (SYNC-09d): validated with the shared schema, cached only when the account is still connected and its epoch is unchanged (SYNC-09b), removed with the cache (SYNC-09a). A failed read of the rules never fails the site-list refresh; the extension then uses the last good cached rules, or none. A new or removed rule reaches the extension within about `SYNC_PERIOD_MIN` (as PRB-03).
- **PSR-20** **Fail closed.** No rules cached, an invalid rule, the setting off or not read: the user rules give no id. Built-in rules follow PRB-04 as today.
- **PSR-21** **Release gate.** The extension that understands rules is **0.4.0**. `EXTENSION_FEATURES.problemRules = "0.4.0"` (ENV-05c). Until `EXTENSION_STORE_VERSION` is at least that, the dashboard hides **Add a problem site** and the user rule list, the API that adds rules answers `404 NOT_FOUND`, and the privacy page and landing copy read as before (as PRB-23). After 0.4.0, a new site needs **no** extension release.

**Data model**

- **PSR-22** A new table `problem_rules`: `id uuid`, `user_id` (default `auth.uid()`, FK cascade), `domain` (no FK to `tracked_domains`, so a removed site does not delete the rule, PSR-05), `prefix text[]` (null after removal), `kind text`, `label text` (null after removal), `confirmed_at timestamptz not null` (when the user ticked the PSR-25 confirmation), `created_at`, `removed_at` (null while active). A partial unique index on `(user_id, domain, prefix)` **where `removed_at` is null** enforces PSR-09 among active rules only. RLS forced: `SELECT` on own rows; add and remove only through definer RPCs that check PSR-15, PSR-16 and PSR-25 under the per-user lock (DATA-09); every row is deleted with the account (DATA-12).

  **Remove** (PSR-13):
  - **Remove and delete history**: the rule row and the stored ids of that domain are deleted (and any older removed row of that domain).
  - **Remove and keep history**: the row becomes a **tombstone**: `removed_at` is set and the `prefix` and `label` are cleared at once. Only the domain, the kind and the dates stay. Reason: the prefix and the label are the parts that can name a person (PSR-25), and the user chose to remove the rule, so they must go now; the domain is already stored with every interval of that site, so the tombstone adds no new personal data. The server needs the tombstone only to tell "rule removed" from "never had a rule" for intervals still queued (PSR-23 step 4).
  - A tombstone does not count against the cap, is not sent to the extension and is not shown. It is deleted when the user deletes that domain's history, when the user adds an active rule on the same domain again (the active rule then covers the domain), or with the account.

  **Re-adding** a removed rule is a normal add: the same checks, a new confirmation, a new row. Stored ids of that domain kept with **Remove and keep history** show again under the new rule (a problem is domain + id, PRB-19).
- **PSR-23** **Server check of an id.** `ingest_study_sessions_v2` keeps its wire contract (ADR-0011). Defence in depth: the server checks every id against the **built-in rules plus the caller's own rules**, never against a global list of user domains. For an element with `problem`, in this order:
  1. the setting is off → the time is stored, the id is dropped (DATA-14, unchanged);
  2. the domain has a **built-in** rule → the id must match `PROBLEM_SLUG_PATTERN` and `PROBLEM_SLUG_MAX`, else the element is **`invalid`** (unchanged);
  3. the domain has an **active** rule of the caller → the id must match `PROBLEM_ID_PATTERN` and `PROBLEM_ID_MAX`, else the element is **`invalid`**;
  4. the domain has only a **removed** rule of the caller (the user removed it while intervals were queued) → the time is stored, the id is **dropped**;
  5. the domain has **no** rule of the caller, active or removed, and no built-in rule (for example `neetcode.io.evil.com`, or another user's site) → the element is **`invalid`**, exactly as today (PRB acceptance 9, NC-a).

  The server never sees the path, so it cannot check the prefix; the prefix is checked only in the extension.
- **PSR-24** **Builds on #233, does not replace it.** The table `study_session_problems` (domain + id), `get_problem_totals_v2` (grouped by domain + id), the setting, the history delete (DATA-16, `set_problem_tracking`) and the popup line (PRB-14) all stay. Changes:
  - the column check on `problem_slug` widens to `PROBLEM_ID_PATTERN` and 100 characters (a widening: every stored slug fits). The column keeps its name to avoid a rename; the docs call it the problem id;
  - the literal domain check `study_session_problems_domain_check` is replaced by a **trigger** on insert into `study_session_problems` with the same rule as PSR-23 steps 2, 3 and 5 for the row's user: a built-in domain needs a slug; another domain needs an active rule of that user and an `id`-kind id of at most `PROBLEM_ID_MAX`. It raises `23514` like the check, so a direct insert outside the RPC is still refused (defence in depth). This is a widening for every row allowed today;
  - `private.problem_domains()` stays as the list of built-in rule domains (`BUILT_IN_PROBLEM_RULES`);
  - a per-domain history delete is added for PSR-13.

  Tests that must change in PS-a: `supabase/tests/database/110_ingest_v2.test.sql` (the DATA-16 cases near line 155: the `neetcode.com` row is still refused, now by the trigger with the same SQLSTATE, so only the title changes; the `Two-Sum` case is no longer refused by the column check, it is refused by the trigger because `leetcode.com` is built-in and needs a slug); `supabase/tests/database/130_problem_domains.test.sql` (the `neetcode.io.evil.com` check case keeps `23514`; the ingest cases of acceptance 9 stay `invalid`; new cases for steps 3 and 4); `packages/shared/src/db-parity.test.ts` (parity of `BUILT_IN_PROBLEM_RULES` with `private.problem_domains()` and the trigger, instead of the literal check; parity of `FREE_MAX_PROBLEM_RULES` with the `plans` row, ENT-11). `packages/shared/src/problems.test.ts` keeps every PRB-05 case unchanged.

## 3a. Amendments to approved specs (all **Proposed**)

If this proposal is approved, these approved or already-amended IDs change. Each gets a dated `Amended … (#245, proposal)` line in its own spec in the implementation issues, not in this spike.

| ID | Spec | Change | Status |
|---|---|---|---|
| SEC-01 | [07-security-privacy](../v0/07-security-privacy.md) | The problem-slug exception covers the problem id of the sites the user adds, by their rule (PSR-10, PSR-25) | Proposed |
| SEC-03 | [07-security-privacy](../v0/07-security-privacy.md) | The `tabs` reason says "for the problem sites, the problem id" instead of "for the problem domain". Permissions unchanged | Proposed |
| SEC-13 | [07-security-privacy](../v0/07-security-privacy.md) | Privacy page: sites you add, the example URL is not stored, rules are account data, the personal-data advice (PSR-18) | Proposed |
| TRK-02 | [01-tracking](../v0/01-tracking.md) | The path exception covers user rules (one segment, PSR-07) | Proposed |
| TRK-08 | [01-tracking](../v0/01-tracking.md) | A problem change on a user-rule site splits the interval, as for built-in sites | Proposed |
| SYNC-09d | [03-sync](../v0/03-sync.md) | Each refresh also reads the account's active rules (PSR-19) | Proposed |
| PRB-05 | [01-problems](01-problems.md) | Detection also uses user rules; built-in behaviour unchanged (PSR-04..09) | Proposed |
| PRB-06, PRB-15 | [01-problems](01-problems.md) | "Only the slug, only on `PROBLEM_DOMAINS`" becomes "only the id, only on built-in and user rule sites" | Proposed |
| PRB-12 | [01-problems](01-problems.md) | User-rule rows show the label and the id (PSR-14) | Proposed |
| PRB-18 | [01-problems](01-problems.md) | `PROBLEM_DOMAINS` becomes the built-in rules; adding a site is no longer only an amendment | Proposed |
| PRB-19 | [01-problems](01-problems.md) | "Slug" reads "id" (domain + id); no other change | Proposed |
| PRB acceptance 9 | [01-problems](01-problems.md) | Unchanged result (`invalid`) for a domain with no rule of the caller; new dropped-id case for a removed rule (PSR-23) | Proposed |
| DATA-06b | [04-data-model](../v0/04-data-model.md) | Ingest v2 checks ids by rule (PSR-23); wire contract unchanged | Proposed |
| DATA-12 | [04-data-model](../v0/04-data-model.md) | Account deletion also deletes `problem_rules` | Proposed |
| DATA-15a | [04-data-model](../v0/04-data-model.md) | No change in shape; rows can have user-rule domains | Proposed |
| DATA-16 | [04-data-model](../v0/04-data-model.md) | Domain check replaced by a trigger; slug check widened (PSR-24); per-domain delete | Proposed |
| new DATA ID | [04-data-model](../v0/04-data-model.md) | `problem_rules` table and RPCs (PSR-22) | Proposed |
| DASH-16 | [06-dashboard](../v0/06-dashboard.md) | Settings gets **Add a problem site** and the list (PSR-12, PSR-13) | Proposed |
| DASH-17 | [06-dashboard](../v0/06-dashboard.md) | Problem rows of user rules (PSR-14) | Proposed |
| EXT-UI-11 | [05-extension-ui](../v0/05-extension-ui.md) | Popup line shows the label and the id for user rules | Proposed |
| ENT-01, ENT-05 | [02-entitlements](02-entitlements.md) | New column `max_problem_rules`; hint `PSR-15` for this limit (PSR-15) | Proposed |
| STORE-03, STORE-04 | [00-chrome-web-store](../store/00-chrome-web-store.md) | Store text for 0.4.0 (PSR-18); permissions and "Remote code: No" unchanged | Proposed |
| ENV-05c | [09-environments](../v0/09-environments.md) | New gate `problemRules` = `0.4.0` (PSR-21) | Proposed |
| D11 | [00-discovery](00-discovery.md) | Time per problem from the URL also on sites the user adds | Proposed |

## 4. Acceptance criteria

1. Given `hellointerview.com` is tracked, the setting is on and the user added the rule `practice/system-design` · `id`, when the user works 10 min on the example URL, then about 600 s are stored under `hellointerview.com` with id `cmlz26cxp08st08adxvy89hr1`, and neither `q`, its value, nor any other part of the address is in storage, the outbox, the request body or the database.
2. The same browsing with the setting off, with no rule, with the rule removed, or before the rules were downloaded stores the time with no id.
3. Lookalike hosts and other paths give no id: `hellointerview.com.evil.com`, `nothellointerview.com`, `/practice/behavioral/…`, `/Practice/system-design/…`, an id with `%`, `@` or `.`.
4. Paste UX: for the example URL the dashboard proposes prefix `practice/system-design` and id `cmlz26cxp08st08adxvy89hr1`, shows the "keep / never keep" preview, and sends only `{domain, prefix, kind, label}` to the API (a test asserts the request body has no URL and no query).
5. The rule API refuses: a domain that is not tracked by the caller, `leetcode.com` and `neetcode.io` (built-in), a prefix with 0 or 4 segments, a segment with an upper-case letter or `%`, an unknown kind, a duplicate prefix, and a sixth rule on the free plan (`LIMIT_REACHED`, limit 5, plan `free`).
6. A rule from the server that fails the schema is dropped in the extension; the other rules and the built-in rules keep working; the site-list refresh still succeeds.
7. Extension 0.3.1 (and 0.3.0, 0.2.3), run as fixtures against the database after the migration, sync as before (ADR-0011 compatibility tests); LeetCode and NeetCode slugs are stored exactly as today.
8. With `two-sum` on `leetcode.com` and `cmlz26cxp08st08adxvy89hr1` on `hellointerview.com` in one week, the dashboard shows two rows, each with its site; the user rule row shows the label and the id. Removing the rule with **Remove and delete history** deletes only the `hellointerview.com` ids; every study-time total is unchanged.
9. While `EXTENSION_STORE_VERSION` is below 0.4.0, the dashboard shows no rule UI and the rule API answers 404.
10. Personal data (PSR-25): pasting `https://example.com/u/john-doe` or `https://www.linkedin.com/in/jane-doe` shows the warning; the example URL of section 1 shows the "looks random" warning; a Google Docs `/document/d/<44-character id>/edit` URL offers no id longer than 64 characters; the API refuses any rule without `confirmedProblemId: true`.
11. Ingest by rule (PSR-23): with the rule active, a bad id (`abc%20`, 65 characters) makes the element `invalid`; after the rule is removed, a queued interval with an id is stored without the id; a domain where the caller never had a rule (`hellointerview.com.evil.com`, or a site that only another user has a rule for) makes the element `invalid`.
12. Remove and re-add (PSR-22): after **Remove and keep history**, the rule row has no prefix and no label, the cap counts one rule less, and the extension no longer receives it; adding the same domain and prefix again succeeds (no duplicate error), needs the confirmation again, deletes the tombstone, and shows the kept ids of that domain again. After **Remove and delete history**, no row and no id of that domain remain.

## 5. Non-goals

- No regex, glob, wildcard or script from users or from the server.
- No query-string or fragment ids, in this version.
- No reading of the page (title, content, solved status): no content scripts, no host permissions (ADR-0006).
- No shared catalogue of rules between users, and no rules edited by the team without a release (built-ins stay in code). A "suggested rules" list could come later as data (P2).
- No merging of problems across sites (PRB-19).

**Known limits of the template language** (accepted for a simpler, safer language):
- Prefix segments must be lowercase (`PROBLEM_RULE_SEGMENT_PATTERN`): a site with `/Practice/…` in its paths cannot be added. Allowing upper case is easy later (a wider pattern, still compared exactly), but no known target site needs it.
- The id must be a whole path segment right after the prefix: no id in the query string or fragment, no id at the path root, no more than 3 prefix segments, no wildcard segment between the prefix and the id.
- Ids with `.`, `%`, `~` or other characters are not accepted.

## 6. Compatibility and rollout

Follows [release.md](../../docs/process/release.md) (expand → deploy → contract) and the order of [01-problems](01-problems.md) section 5.

| Step | What | Why it is safe |
|---|---|---|
| 1. Expand (DB) | One migration: `problem_rules` and its RPCs (add, list, remove, per-domain history delete); `max_problem_rules` on `plans`; widen the `problem_slug` check to `id`; drop the literal domain check; ingest v2 checks ids by rule (PSR-23). pgTAP | Only widens. 0.2.3, 0.3.0 and 0.3.1 send ids only on built-in domains, which stay valid |
| 2. Shared + extension 0.4.0 (not released) | Rule schema and matcher in `packages/shared` (`problemIdFromUrl`, built on `problemSlugFromUrl`); rules downloaded and cached (PSR-19); outbox parse stays tolerant | The built-in rules give the same result as today (same tests as PRB-05) |
| 3. Web (gated) | **Add a problem site**, list and remove dialog, names (PSR-12..14), privacy page and landing copy, all behind `EXTENSION_FEATURES.problemRules` | Hidden until the store has 0.4.0 (PSR-21) |
| 4. Release 0.4.0 (store) | Store text (PSR-18), STORE-08 check (permissions unchanged), submit; after approval set `EXTENSION_STORE_VERSION` to `0.4.0` and redeploy | Old installs keep working (acceptance 7) |
| 5. Contract | None needed for this proposal. The #233 contract step (NC-e, #241, PR #283) is already merged (2026-11-27): `get_problem_totals` is gone and `get_problem_totals_v2` is the only totals function, which this proposal keeps. `problemSlugFromUrl` stays as the built-in path of the matcher | — |

Rollback: step 1 only widens. If 0.4.0 has a problem, the store rollback of release.md applies; the gate is set back so the dashboard hides the rule UI. Stored ids of user rules stay valid rows.

## 7. Issues (proposed, #245)

Numbers are assigned when the product owner approves this proposal. Model and review follow [agents.md](../../docs/process/agents.md) §1–2. At most two at once, only where file areas do not overlap (AGENTS.md §4).

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| PS-a | DB: section 6 step 1, ENT column and parity test, pgTAP (rule insert checks, cap with hint `PSR-15`, confirmation required, built-in refused, lookalike refused, ingest by rule with the five cases of PSR-23, the trigger, per-domain delete, 0.3.x fixtures); the test changes listed in PSR-24 | `supabase/`, `packages/shared/src/constants.ts` | Sonnet · **Opus deep review** (migration, ingest path) | First |
| PS-b | Shared + extension: rule schema, matcher, proposal function (PSR-12 step 3), sync and cache (PSR-19, 20), tests by ID; version 0.4.0 (not released) | `packages/shared`, `apps/extension` | Sonnet · **Opus deep review** (privacy boundary of SEC-01) | After PS-a is applied |
| PS-c | Web: Settings UI, preview, personal-data warning and confirmation (PSR-25), extension version note, remove dialog, names, API route, gate, privacy page and landing copy, docs (`architecture/`) | `apps/web`, `docs/` | Sonnet · Sonnet + copy review agent | After PS-b is merged |
| PS-d | Store: `listing.md` text and privacy answers for 0.4.0 (PSR-18) | `docs/chrome-web-store/`, `specs/store/` | Sonnet · tech lead's check; product owner approves and submits | After PS-c is deployed and smoke is green |

## 8. Open decisions

Decided by the product owner on 2026-11-27: every recommendation below is accepted; O1 = build now, as 0.4.0, since 0.3.1 is live.

| # | Decision | Recommendation | Trade-off |
|---|---|---|---|
| O1 | Build it, and when | Build it **after 0.3.1 is live in the store**, as a v1 follow-up (0.4.0). Not in the current release | Waiting keeps one store review at a time; it delays sites like Hello Interview by one release cycle |
| O2 | Keep `?q=` (sub-section) | **No.** Never store the query or fragment; time on a sub-section counts under the problem | Simpler privacy story and store text; the user cannot see time per sub-section. A later rule field "one named query key" is possible but widens SEC-01 again |
| O3 | Opaque ids: show the id or a user label | Show the **rule label + the id** now (PSR-14). Add an optional **name per problem** (user-typed, stored per domain + id) as a P1 follow-up | Rows like `cmlz26cx…` are hard to read; a per-problem name is more UI and one more piece of stored user text |
| O4 | Cap on user rules | **5** per account on `free`, in `plans` (ENT) | Enough for the common sites; a user with many sites must remove one. Changing it later is a one-row migration |
| O5 | LeetCode and NeetCode | Keep them as **built-in rules** in code, not editable, not counted; refuse user rules on their domains in this version | Zero change for current users and the store text; a user cannot add another path on LeetCode (for example `/contest/…`) without a release |
| O6 | Id kind for user rules: pattern and max length | Kind `id` (letters of both cases, digits, `-`, `_`), at most **64** characters, which widens the stored-id check | Covers most sites (mixed-case and underscore ids) and blocks very long link tokens. Keeping only `slug` (100) needs no check change and fits the example, but fails on ids like `Ab_12`. A lower limit (for example 40) blocks more secret links but may refuse some real ids |

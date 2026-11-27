# 05 — Problem sites by example URL

Status: **Proposed (2026-11-27)** · Issue: #245 · Builds on: [01-problems](01-problems.md) (PRB-01..23, NC-a..e), [02-entitlements](02-entitlements.md) (ENT) · Related ADRs: [0006](../../docs/adr/0006-tabs-permission.md) (permissions), [0011](../../docs/adr/0011-ingest-v2.md) (ingest v2), [0012](../../docs/adr/0012-entitlements.md) (entitlements), [0015](../../docs/adr/0015-user-problem-rules.md) (user problem rules, proposed)

This is a **spike output**: a proposal, not approved work. Nothing here is built. The product owner decides whether and when to build it (section 8). Every ID in this spec is **Proposed**. They have no tests yet; untested IDs are expected for a proposal (as for PRB-18..22 in #233).

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
| 2 | Privacy | Only **one path segment** (the id) is kept, checked by a fixed pattern and a max length. The query string and the fragment are **never** kept, so `q` is not kept. The pasted example URL never leaves the browser | PSR-08..10 |
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
| `PROBLEM_ID_KINDS` | `slug`, `token` | The fixed list of id kinds. A rule names one; it never carries its own pattern |
| `PROBLEM_SLUG_PATTERN` (kind `slug`) | `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Unchanged from PRB-05. Used by the built-in rules |
| `PROBLEM_TOKEN_PATTERN` (kind `token`) | `^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$` | For user rules. Letters, digits, single `-` or `_` between them. No `%`, `@`, `.`, `=`, `+` or `~`, so an encoded value, an email or a file name is never an id |
| `PROBLEM_ID_MAX` | 100 | Characters, both kinds (same value as `PROBLEM_SLUG_MAX`) |
| `PROBLEM_RULE_LABEL_MAX` | 40 | Characters of the label the user types for a rule |
| `FREE_MAX_PROBLEM_RULES` | 5 | User rules per account on the free plan (ENT-01 column `max_problem_rules`). Built-in rules do not count. **Open decision O4** |
| `BUILT_IN_PROBLEM_RULES` | `leetcode.com` `/problems/` `slug`; `neetcode.io` `/problems/` `slug` | Exactly today's `PROBLEM_DOMAINS` + `PROBLEM_PATH_PREFIX` + `PROBLEM_SLUG_PATTERN`, written as rules. In `packages/shared`, repeated in the database (parity test) |

## 3. Requirements

**Rules and consent**

- **PSR-01** A **problem rule** has: a `domain` (one of the user's tracked domains, PSR-05), a `prefix` (1 to 3 literal path segments, PSR-06), an id `kind` (`slug` or `token`, PSR-07) and a `label` (text the user types, at most `PROBLEM_RULE_LABEL_MAX` characters; default: the domain). It has no other field. In particular it has no pattern, no regex, no script and no query or fragment part.
- **PSR-02** User rules belong to the **account** (like tracked sites, DATA-04), not to a device. Each user adds their own. No user ever sees or uses another user's rules.
- **PSR-03** A user rule is the user's **opt-in for that site**. It works only when the account setting **Track coding problems** is also on (PRB-01, PRB-04). With the setting off, no rule gives an id, built-in or not. The setting keeps its name and its stored value (`track_problems`).
- **PSR-04** LeetCode and NeetCode are **built-in rules** (`BUILT_IN_PROBLEM_RULES`). They are in the extension code and in the database, not in the user's rule list. The user cannot edit or delete them; they do not count against the cap (PSR-15). They behave exactly as PRB-05 says today. A user rule on a domain that has a built-in rule is refused in this version (open decision O5).

**The template language**

- **PSR-05** **Host.** A rule matches a tab only when the tab's **matched tracked domain** (TRK-03, longest match) is **equal to** the rule's `domain`. So `www.hellointerview.com` counts for a rule on `hellointerview.com` when the user tracks `hellointerview.com`. `hellointerview.com.evil.com`, `nothellointerview.com` and `hellointerview.co` never match. If the user tracks only `app.example.com`, a rule must be on `app.example.com`. The rule's domain must be in the user's tracked sites when the rule is created (PSR-11); if the site is removed later, the rule stays stored but gives no id (no tracked domain matches).
- **PSR-06** **Path prefix.** The path (`URL.pathname`, as the browser gives it, never decoded or lowercased) is split on `/`, empty segments dropped. The first `n` segments must be **equal** to the `n` literal segments of the prefix (`1 ≤ n ≤ 3`). Each literal segment matches `PROBLEM_RULE_SEGMENT_PATTERN` and has at most `PROBLEM_RULE_SEGMENT_MAX` characters. No wildcard, no optional segment, no alternatives.
- **PSR-07** **Id segment.** The segment right after the prefix is the **id**. It must match the pattern of the rule's `kind` (`PROBLEM_SLUG_PATTERN` or `PROBLEM_TOKEN_PATTERN`) and have at most `PROBLEM_ID_MAX` characters; otherwise the tab has no problem. The id is never changed to make it valid (no lowercasing, no trimming, no decoding). Segments after the id are ignored. User rules use `token`; built-in rules use `slug`.
- **PSR-08** **Query and fragment.** The query string and the fragment are **never** read by the matcher, never stored and never sent, for every rule. There is no rule field to keep them. In the example, `?q=non-functional-requirements` is a sub-section of the problem; its time counts under the problem `cmlz26cxp08st08adxvy89hr1` (open decision O2).
- **PSR-09** **Several rules.** When more than one rule of the tab's domain matches, the one with the **longest prefix** wins; when the prefixes are equal, the rules are duplicates and the second one is refused at creation (PSR-11). The id belongs to the domain, not to the rule (PRB-19): two rules on one domain that give the same id give the same problem.

  Examples, with `hellointerview.com` tracked and the rule `hellointerview.com` · `practice/system-design` · `token`:
  - `https://www.hellointerview.com/practice/system-design/cmlz26cxp08st08adxvy89hr1?q=non-functional-requirements` → `cmlz26cxp08st08adxvy89hr1`;
  - `…/practice/system-design/cmlz26cxp08st08adxvy89hr1/notes` → the same id;
  - `…/practice/system-design` (no id), `…/practice/behavioral/abc123`, `…/Practice/system-design/abc123`, `…/practice/system-design/abc%20123` → no problem;
  - `https://hellointerview.com.evil.com/practice/system-design/abc123` → no problem (not the tracked domain).

**Privacy (SEC-01)**

- **PSR-10** What is kept per problem: the **id** (one path segment, PSR-07) with the domain the interval already has. Nothing else from the address, the title or the page. The URL is read in memory with the `tabs` permission and dropped, as in TRK-02 and PRB-06. No new permission, no host permission and no content script (SEC-03, ADR-0006). The SEC-01 exception becomes: "when **Track coding problems** is on, the problem id from addresses of the built-in problem sites and of the problem sites the user adds, as their rule defines it (one path segment, a strict pattern); nothing else from those addresses and no path of any other site".
- **PSR-11** **The example URL never leaves the browser.** The dashboard parses the pasted URL in the page (a pure function in `packages/shared`). Only the rule (PSR-01) is sent to the server. The example URL is not stored, not logged and not sent to analytics (SEC-15).

**Dashboard UX**

- **PSR-12** **Add a problem site** (Settings, next to the setting of PRB-02). The user pastes one example URL. The dashboard:
  1. refuses a URL that is not `http:` or `https:`;
  2. finds the matched tracked domain (TRK-03). If there is none, it says the site must be a study site first and offers to add it (DASH-12); if the domain has a built-in rule, it says the site is already supported (PSR-04);
  3. proposes the id: the **last** path segment that matches `PROBLEM_TOKEN_PATTERN` and has at least `PROBLEM_RULE_PREFIX_MIN` valid literal segments before it, at most `PROBLEM_RULE_PREFIX_MAX` (in the example: prefix `practice/system-design`, id `cmlz26cxp08st08adxvy89hr1`). The user can pick another segment as the id; the segments before it become the prefix. A segment that does not fit the patterns cannot be picked, with a short reason;
  4. shows a **preview**: "We will keep: `cmlz26cxp08st08adxvy89hr1`" and "We never keep: the rest of the address (`?q=non-functional-requirements`)", plus the rule in words ("Pages under hellointerview.com/practice/system-design/…");
  5. asks for a label (prefilled with the domain) and a confirm. Nothing is saved before the confirm.
- **PSR-13** **The list of problem sites** shows the built-in sites (not removable) and the user's rules (label, domain, prefix). **Remove** asks first, like PRB-16, when that domain has stored ids: **Remove and keep history**, **Remove and delete history** (deletes the stored ids of that domain only; all study time stays), **Cancel**. When that domain has no stored ids, no dialog. When another rule remains on the same domain, the dialog says the history is shared by the domain.
- **PSR-14** **Names.** For a built-in rule the name is built as PRB-12 says. For a user rule the row shows the rule's **label** and the **id as it is** (`System design · cmlz26cxp08st08adxvy89hr1`; the id may be shortened in the middle on small screens, with the full id in a tooltip). CareerOS never fetches the page title. A user-typed name **per problem** is a later step (P1, open decision O3).

**Safety and limits**

- **PSR-15** **Cap.** The number of user rules per account is a plan limit (ENT-01: new column `max_problem_rules`, `FREE_MAX_PROBLEM_RULES` on `free`). The database enforces it in the insert path, as for DATA-01 (ENT-03). The limit error follows ENT-05..08: code `LIMIT_REACHED`, the limit and the plan in the details, with `kind: "problem_rules"` added in `details` only. The dashboard says "You can add up to 5 problem sites." from the error (ENT-09). The landing page builds the number from the shared constants (ENT-10); a parity test keeps the migration and the constant equal (ENT-11).
- **PSR-16** **Validation in three places.** The same shared schema checks a rule in the dashboard (before saving), in the database (on insert: domain is one of the caller's tracked domains and has no built-in rule; prefix and kind valid; no duplicate prefix on the domain) and in the extension (on every download, PSR-19). An invalid rule is never stored, and a downloaded rule that fails the schema is dropped alone (the others keep working). Rules have no `UPDATE`: a change is remove + add (like tracked sites, DATA-04).

**Store policy**

- **PSR-17** A rule is **data**, interpreted by fixed code shipped in the package (the matcher of PSR-05..09). The matcher has no loops or branches driven by the rule other than "compare these literal segments, then check one segment against one of two fixed patterns". It never builds a `RegExp`, a `Function` or any code from server data, and the extension CSP stays `script-src 'self'` (SEC-04). The Chrome Web Store "Remote code" answer stays **No** (STORE-03).
- **PSR-18** **Store text** (same kind of item as PRB-17 and PRB-21), before 0.4.0 is submitted: the description, the `tabs` justification and the **Web history** row say "the problem identifier (one part of the address) from LeetCode, NeetCode and the problem sites you add" instead of naming only the two sites. The data category stays **Web history** (already declared); no new category. The privacy page (SEC-13) says the same, says that the example URL is not stored, and lists the rules as account data. The product owner approves the store text; the copy review agent approves the wording ([agents.md](../../docs/process/agents.md) §2).

**Sync and release**

- **PSR-19** Each refresh of the tracked sites (SYNC-09, SYNC-09c) also reads the account's rules, with the same rules as the setting (SYNC-09d): validated with the shared schema, cached only when the account is still connected and its epoch is unchanged (SYNC-09b), removed with the cache (SYNC-09a). A failed read of the rules never fails the site-list refresh; the extension then uses the last good cached rules, or none. A new or removed rule reaches the extension within about `SYNC_PERIOD_MIN` (as PRB-03).
- **PSR-20** **Fail closed.** No rules cached, an invalid rule, the setting off or not read: the user rules give no id. Built-in rules follow PRB-04 as today.
- **PSR-21** **Release gate.** The extension that understands rules is **0.4.0**. `EXTENSION_FEATURES.problemRules = "0.4.0"` (ENV-05c). Until `EXTENSION_STORE_VERSION` is at least that, the dashboard hides **Add a problem site** and the user rule list, the API that adds rules answers `404 NOT_FOUND`, and the privacy page and landing copy read as before (as PRB-23). After 0.4.0, a new site needs **no** extension release.

**Data model**

- **PSR-22** A new table `problem_rules`: `id uuid`, `user_id` (default `auth.uid()`, FK cascade), `domain` (FK to the caller's `tracked_domains` row is not used, so a removed site does not delete the rule, PSR-05), `prefix text[]`, `kind text`, `label text`, `created_at`. RLS forced: `SELECT` and `DELETE` on own rows; insert only through a definer RPC that checks PSR-15 and PSR-16 under the per-user lock. Deleted with the account (DATA-12).
- **PSR-23** **Server check of an id.** `ingest_study_sessions_v2` keeps its wire contract (ADR-0011). For an element with `problem`, the server checks: the setting is on (DATA-14); the domain has a built-in rule **or** a user rule of the caller; the id matches the kind of that rule (`slug` for built-in, `token` for user rules) and `PROBLEM_ID_MAX`. When the id fails the pattern, the element is `invalid` as today. When the domain has **no** rule at upload time (the user removed it while intervals were queued), the time is stored and the id is dropped, like DATA-14 for the setting. The server never sees the path, so it cannot check the prefix; the prefix is checked only in the extension.
- **PSR-24** **Builds on #233, does not replace it.** The table `study_session_problems` (domain + id), `get_problem_totals_v2` (grouped by domain + id), the setting, the history delete (DATA-16, `set_problem_tracking`) and the popup line (PRB-14) all stay. Changes: the column check on `problem_slug` widens to the `token` pattern (a widening: every stored slug is a valid token); the literal domain check `study_session_problems_domain_check` is dropped (a widening) and the domain rule moves to the ingest check of PSR-23; `private.problem_domains()` stays as the list of built-in rule domains. The column keeps its name (`problem_slug`) to avoid a rename; the docs call it the problem id. A per-domain history delete is added for PSR-13.

## 4. Acceptance criteria

1. Given `hellointerview.com` is tracked, the setting is on and the user added the rule `practice/system-design` · `token`, when the user works 10 min on the example URL, then about 600 s are stored under `hellointerview.com` with id `cmlz26cxp08st08adxvy89hr1`, and neither `q`, its value, nor any other part of the address is in storage, the outbox, the request body or the database.
2. The same browsing with the setting off, with no rule, with the rule removed, or before the rules were downloaded stores the time with no id.
3. Lookalike hosts and other paths give no id: `hellointerview.com.evil.com`, `nothellointerview.com`, `/practice/behavioral/…`, `/Practice/system-design/…`, an id with `%`, `@` or `.`.
4. Paste UX: for the example URL the dashboard proposes prefix `practice/system-design` and id `cmlz26cxp08st08adxvy89hr1`, shows the "keep / never keep" preview, and sends only `{domain, prefix, kind, label}` to the API (a test asserts the request body has no URL and no query).
5. The rule API refuses: a domain that is not tracked by the caller, `leetcode.com` and `neetcode.io` (built-in), a prefix with 0 or 4 segments, a segment with an upper-case letter or `%`, an unknown kind, a duplicate prefix, and a sixth rule on the free plan (`LIMIT_REACHED`, limit 5, plan `free`).
6. A rule from the server that fails the schema is dropped in the extension; the other rules and the built-in rules keep working; the site-list refresh still succeeds.
7. Extension 0.3.1 (and 0.3.0, 0.2.3), run as fixtures against the database after the migration, sync as before (ADR-0011 compatibility tests); LeetCode and NeetCode slugs are stored exactly as today.
8. With `two-sum` on `leetcode.com` and `cmlz26cxp08st08adxvy89hr1` on `hellointerview.com` in one week, the dashboard shows two rows, each with its site; the user rule row shows the label and the id. Removing the rule with **Remove and delete history** deletes only the `hellointerview.com` ids; every study-time total is unchanged.
9. While `EXTENSION_STORE_VERSION` is below 0.4.0, the dashboard shows no rule UI and the rule API answers 404.

## 5. Non-goals

- No regex, glob, wildcard or script from users or from the server.
- No query-string or fragment ids, in this version.
- No reading of the page (title, content, solved status): no content scripts, no host permissions (ADR-0006).
- No shared catalogue of rules between users, and no rules edited by the team without a release (built-ins stay in code). A "suggested rules" list could come later as data (P2).
- No merging of problems across sites (PRB-19).

## 6. Compatibility and rollout

Follows [release.md](../../docs/process/release.md) (expand → deploy → contract) and the order of [01-problems](01-problems.md) section 5.

| Step | What | Why it is safe |
|---|---|---|
| 1. Expand (DB) | One migration: `problem_rules` and its RPCs (add, list, remove, per-domain history delete); `max_problem_rules` on `plans`; widen the `problem_slug` check to `token`; drop the literal domain check; ingest v2 checks ids by rule (PSR-23). pgTAP | Only widens. 0.2.3, 0.3.0 and 0.3.1 send ids only on built-in domains, which stay valid |
| 2. Shared + extension 0.4.0 (not released) | Rule schema and matcher in `packages/shared` (`problemIdFromUrl`, built on `problemSlugFromUrl`); rules downloaded and cached (PSR-19); outbox parse stays tolerant | The built-in rules give the same result as today (same tests as PRB-05) |
| 3. Web (gated) | **Add a problem site**, list and remove dialog, names (PSR-12..14), privacy page and landing copy, all behind `EXTENSION_FEATURES.problemRules` | Hidden until the store has 0.4.0 (PSR-21) |
| 4. Release 0.4.0 (store) | Store text (PSR-18), STORE-08 check (permissions unchanged), submit; after approval set `EXTENSION_STORE_VERSION` to `0.4.0` and redeploy | Old installs keep working (acceptance 7) |
| 5. Contract | None needed. `problemSlugFromUrl` stays as the built-in path of the matcher | — |

Rollback: step 1 only widens. If 0.4.0 has a problem, the store rollback of release.md applies; the gate is set back so the dashboard hides the rule UI. Stored ids of user rules stay valid rows.

## 7. Issues (proposed, #245)

Numbers are assigned when the product owner approves this proposal. Model and review follow [agents.md](../../docs/process/agents.md) §1–2. At most two at once, only where file areas do not overlap (AGENTS.md §4).

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| PS-a | DB: section 6 step 1, ENT column and parity test, pgTAP (rule insert checks, cap, built-in refused, lookalike refused, ingest by rule, dropped id when the rule is gone, per-domain delete, 0.3.x fixtures) | `supabase/`, `packages/shared/src/constants.ts` | Sonnet · **Opus deep review** (migration, ingest path) | First |
| PS-b | Shared + extension: rule schema, matcher, proposal function (PSR-12 step 3), sync and cache (PSR-19, 20), tests by ID; version 0.4.0 (not released) | `packages/shared`, `apps/extension` | Sonnet · **Opus deep review** (privacy boundary of SEC-01) | After PS-a is applied |
| PS-c | Web: Settings UI, preview, remove dialog, names, API route, gate, privacy page and landing copy, docs (`architecture/`) | `apps/web`, `docs/` | Sonnet · Sonnet + copy review agent | After PS-b is merged |
| PS-d | Store: `listing.md` text and privacy answers for 0.4.0 (PSR-18) | `docs/chrome-web-store/`, `specs/store/` | Sonnet · tech lead's check; product owner approves and submits | After PS-c is deployed and smoke is green |

## 8. Open decisions

Each needs the product owner's answer before PS-a starts.

| # | Decision | Recommendation | Trade-off |
|---|---|---|---|
| O1 | Build it, and when | Build it **after 0.3.1 is live in the store**, as a v1 follow-up (0.4.0). Not in the current release | Waiting keeps one store review at a time; it delays sites like Hello Interview by one release cycle |
| O2 | Keep `?q=` (sub-section) | **No.** Never store the query or fragment; time on a sub-section counts under the problem | Simpler privacy story and store text; the user cannot see time per sub-section. A later rule field "one named query key" is possible but widens SEC-01 again |
| O3 | Opaque ids: show the id or a user label | Show the **rule label + the id** now (PSR-14). Add an optional **name per problem** (user-typed, stored per domain + id) as a P1 follow-up | Rows like `cmlz26cx…` are hard to read; a per-problem name is more UI and one more piece of stored user text |
| O4 | Cap on user rules | **5** per account on `free`, in `plans` (ENT) | Enough for the common sites; a user with many sites must remove one. Changing it later is a one-row migration |
| O5 | LeetCode and NeetCode | Keep them as **built-in rules** in code, not editable, not counted; refuse user rules on their domains in this version | Zero change for current users and the store text; a user cannot add another path on LeetCode (for example `/contest/…`) without a release |
| O6 | Id kind for user rules | `token` (letters of both cases, digits, `-`, `_`), which widens the stored-id check | Covers most sites (mixed-case and underscore ids). Keeping only `slug` needs no check change and fits the example, but fails on ids like `Ab_12` |

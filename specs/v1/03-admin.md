# 03 — Internal admin dashboard

Status: **Accepted (2026-11-18, gate 5, #209)** · Issue: #208 · Source: product-owner decisions A1–A10 (2026-11-18, below) · Related ADRs: [0013](../../docs/adr/0013-admin-access.md) (admin access and private ledger)

Amended 2026-11-18 (#214): ADM-02 and acceptance 1: the 404 has the same status, the same "Page not found" content and `noindex` as an unknown path, and signed-out and non-admin responses are identical; exact HTML equality with an unmatched path is not required (Next.js 16 renders a matched route's `notFound()` as an error shell that shows the same page on the client).

Amended 2026-11-19 (#215): ADM-05 — a file with `corrects` replaces the named session's records in every total (cost, reviews, docs); the Sessions panel still lists both (product owner). ADM-11 findings are summed over the PR's review records. `findings` holds the first-round HIGH and MEDIUM counts of that review (ADM-06); a re-review record stores the new round's HIGH and MEDIUM in the same field, so the sum counts every round that was recorded.

Amended 2026-11-21 (#252, product owner: mockup approved, defaults taken): the page becomes visual ("hard to understand, more graphics, fewer tables"). New: ADM-10a (tokens per day by model), ADM-17 (overview cards), ADM-18 (production health, including CI and code scanning; limits 36 h and 8 d), ADM-19 (skills used per kind of work, counted per agent record), ADM-20 (rules for every chart). ADM-06 gains the kind `ideas` (brainstorms, specs, proposals; schema version stays 1, older files stay valid) and `skills` means the skills an agent used. Changed presentation, same data and same numbers: ADM-09, ADM-10, ADM-11, ADM-12, ADM-13, ADM-15 (each table moves into a folded "Details" under its chart or card). ADM-08 and ADM-16 gain the Actions reads of ADM-18 and their call budget. The out-of-scope line "live service status" is clarified. Built in ADM-e.

Amended 2026-11-28 (#260, product owner: "organize the posts on the admin page"): new ADM-21, a read-only **Posts** section with every post and the link to the live post per network. A9 and §4 change: scheduled and posted posts are now in scope; views and link clicks stay out (they come with the day-7 numbers, PST-27). Source: the post records and state files of the posts pipeline (PST-04, PST-07, PST-26), read like the ledger.

## 1. Objective

Give the product owner one private page that shows how the project is built: what each Claude session and agent did, what it cost in tokens, how many review rounds it needed, where v1 stands, which docs agents read, and how the parts connect. It must be **secure** and **cost little** to build and to run (A8).

Only the product owner sees it. For everyone else the page does not exist (404).

### Product-owner decisions (2026-11-18)

| # | Decision |
|---|---|
| A1 | A page inside CareerOS (`/admin`), not a Claude artifact. Simple, but secure |
| A2 | Admin = a private `admins` table. The product owner adds his own user id once, by hand, in the Supabase SQL editor (never in the repo). Server-side check; 404 for everyone else |
| A3 | Data source = a **ledger** written by Claude at the end of each session |
| A4 | The ledger is private: one JSON file per session in a private GitHub repo, read server-side with a read-only token stored in Vercel. No ledger table, no secret-holding workflow, no manual step per session |
| A5 | "Which docs Claude sees": a fixed map plus the per-task list from the ledger |
| A6 | "What connects to what": one static diagram, no live status |
| A7 | Panels: cost per issue, review rounds and findings per PR, v1 progress. GitHub data read live server-side with a cache |
| A8 | Must cost little to build and to run |
| A9 | Social media control comes later (before posting starts), after a marketing specialist validates the tracking approach (Q32). **Out of scope here** *(2026-11-28, #260: the list of scheduled and posted posts with links is in scope, ADM-21; views and link clicks are still later)* |
| A10 | Rule "write the ledger before ending a session" in `docs/process/agents.md` |

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `ADMIN_PATH` | `/admin` | The only admin route |
| `LEDGER_REPO` | `vbenedito/careeros-ops` | Private repository; server-only configuration, not a secret |
| `LEDGER_DIR` | `ledger/` | One file per session: `ledger/YYYY/YYYY-MM-DD-<session>.json` |
| `LEDGER_SCHEMA_VERSION` | 1 | Field `schema` in every file |
| `GITHUB_CACHE_S` | 600 | Seconds a GitHub listing (ledger tree, issues, PRs, checks) is cached |
| `PUBLIC_REPO` | `vbenedito/careeros` | Source of issues, PRs and CI status |

## 3. Requirements

**Access (ADR-0013)**

- **ADM-01** A table `admins (user_id uuid primary key references auth.users on delete cascade, created_at timestamptz not null default now())`. RLS is on. The only policy lets a signed-in user **select their own row**. No role gets insert, update or delete grants; rows are added only by the project owner in the SQL editor. No user id is ever in the repository.
- **ADM-02** Every request under `ADMIN_PATH` is checked **on the server**, before any data is read: the user is signed in (`getClaims()`, AUTH-02) **and** has a row in `admins`, read with the user's own session (no secret key). Otherwise the answer is the normal **404** page: the same status, the same "Page not found" content and `noindex` as for an unknown path, and the same response for a signed-out visitor and a signed-in non-admin (exact HTML equality with an unmatched path is not required): no redirect to sign-in, no "forbidden", no different timing on purpose.
- **ADM-03** The admin pages carry `noindex` and are not in the sitemap. They are not linked from the sidebar or anywhere else; the product owner opens the address directly.
- **ADM-04** The admin pages only **read**. They offer no action that writes to the database, GitHub or Vercel.

**Ledger (data source)**

- **ADM-05** One JSON file per Claude session in `LEDGER_REPO` under `LEDGER_DIR`. Files are written by the session that did the work (ADM-14) and never edited afterwards; a correction is a new file that names the one it corrects (`corrects`).
- **ADM-06** Schema version 1 (validated with a schema in `packages/shared`; a file that fails it is listed as "invalid file" with its name and skipped, never shown half-read):

  ```json
  {
    "schema": 1,
    "session": "2026-11-18-a",
    "date": "2026-11-18",
    "goal": "v1 stream A spec + #178",
    "corrects": null,
    "main": { "tokens": 250000, "measure": "estimate" },
    "agents": [
      {
        "model": "opus",
        "work": "author",
        "kind": "code",
        "issue": 178,
        "pr": 209,
        "tokens": 180000,
        "minutes": 42,
        "rounds": 1,
        "findings": { "high": 0, "medium": 2 },
        "files": ["docs/adr/0011-ingest-v2.md"],
        "skills": ["supabase:supabase"]
      }
    ]
  }
  ```

  `model`: `haiku` | `sonnet` | `opus`. `work`: `author` | `review` | `fix` | `other`. `kind`: `code` | `ideas` | `docs` | `marketing` | `video` | `post`. `issue`, `pr`, `minutes`, `findings` may be `null`. `skills` lists the skills the agent used (the `Skills used: …` line of its report; empty when none). `main.measure`: `estimate` | `measured` (from `/explain-usage`); `main.tokens` may be `null` (not measured). Sub-agent `tokens` are the exact numbers each agent reported. `findings` is the number of HIGH and MEDIUM findings a **review** reported in its first round.
- **ADM-07** The ledger holds no secrets, tokens, emails, URLs of private documents or user data. Names are spec IDs, issue and PR numbers, repo paths and skill names only.
- **ADM-08** The server reads the ledger through the GitHub REST API with a **fine-grained token that has read-only Contents access to `LEDGER_REPO` only**, from the server-only variable `OPS_LEDGER_TOKEN` (never `NEXT_PUBLIC_`, never logged, never sent to the browser, SEC-07). One tree listing per `GITHUB_CACHE_S`; each file is fetched once by its blob SHA and then served from the cache, because files never change (ADM-05). When the variable is missing or GitHub fails, the page still renders and says "Ledger unavailable" with the HTTP status only. In CI only, `OPS_GITHUB_API_STUB` (loopback `http://127.0.0.1:<port>`, needs `CI`, ignored on Vercel, a production build fails if it is set) points these reads at a local stub with invented data (TEST-01, #232). *(#252)* The same token and the same stub also serve the workflow-run reads of ADM-18: they read public data of `PUBLIC_REPO` and need no permission beyond the ones above (to be confirmed with the real token in the build PR; GitHub may ask for "Actions: read"; a 403 there means ADM-18 falls back to the unauthenticated public read, see ADM-16).

**Panels**

- **ADM-09** **Sessions**: one row per session, newest first: date, goal, main-session tokens with "estimate" or "measured", sub-agent tokens by model, number of agents. *(#252)* The table sits in a folded "Details: sessions" block after Reviews (order in ADM-17, ADM-20); the rows do not change.
- **ADM-10** **Cost per issue**: one row per issue: tokens by model (haiku, sonnet, opus) summed over every agent record with that issue, total, and the number of sessions. Main-session tokens are **not** split across issues; they appear as one line "Main sessions (estimate)" under the table. Records without an issue are summed in a row "No issue". *(#252)* This table is the second table inside the "Details" of the cost card (ADM-10a); rows and sums do not change.
- **ADM-11** **Reviews**: one row per PR that has review records: review rounds (largest `rounds` of its review records), HIGH and MEDIUM findings, model of the reviewer, and merge state from GitHub (ADM-12). *(#252)* The table sits in a folded "Details: reviews" block (ADM-20); rows do not change.
- **ADM-12** **v1 progress**: the issues of `PUBLIC_REPO` with label `v1`, read live from the GitHub REST API (cached `GITHUB_CACHE_S`, same token), each in one group: **done** (closed), **waiting for approval** (an open, non-draft PR with `Closes #N` and both required checks green), **blocked** (label `blocked`), **open** (all others). Counts per group and the list. *(#252)* Shown as the **progress card** of ADM-17: one stacked bar with a segment per group (width = share of all v1 issues), a headline sentence ("12 of 30 v1 issues are done (40%)"), and a legend with the group name and count. The lists of issues move into the folded "Details: issues" of the card; groups, order and rules do not change. Zero issues: "No v1 issues yet."
- **ADM-13** **Docs Claude sees**: (a) a fixed map, kept in code next to the page: always loaded (`AGENTS.md`, the handoff, memory), and per kind of task (code: the spec and ADRs the issue names, `docs/process/agents.md`; marketing: `docs/marketing/` and the matching skills; video: `docs/marketing/video-formats.md`); (b) per issue, the union of `files` and `skills` from the ledger. *(#252)* Shown in a folded "Details: docs Claude sees" block; content does not change.
- **ADM-15** **How it connects**: one static diagram, written by hand in the page (no diagram library, no live status): product owner → main session → sub-agents by model → GitHub (REST, git) → CI → Vercel; GitHub → Supabase through `migrate.yml`; Chrome Web Store; connectors. Each edge is labelled with what crosses it. *(#252)* Stays visible, below the cards, as the last block; no change to the diagram.

**Visual overview (#252)**

- **ADM-10a** *(#252)* **Agent cost chart**: stacked columns, one column per calendar day of the last 14 days (today last; "today" is the current date in `America/Sao_Paulo`, and a session belongs to the day written in its `date`), stacked by model in the fixed order haiku, sonnet, opus (`chart-1`, `chart-2`, `chart-3`; a model keeps its colour in every chart). Height = sub-agent tokens of that day: the sum of `tokens` over the agent records of every session whose `date` is that day, after `corrects` is applied (ADM-05). Days without a session are empty columns, not gaps. Y axis: 0 and two or three round ticks, written with `formatTokens`. Headline above the chart: total tokens of the 14 days and the model with the most ("1.2M tokens in 14 days, mostly opus"; on a tie, the larger model of opus, sonnet, haiku is named). A line under the chart: "Main sessions are not in this chart: they are an estimate and not split by model" (ADM-10). Source: ledger only. Empty: no agent record in the 14 days: "No agent records in the last 14 days." Error: "Ledger unavailable (HTTP n)" (ADM-08). Details: table per day (date, haiku, sonnet, opus, total) and the cost-per-issue table of ADM-10.
- **ADM-17** *(#252)* **Overview cards**: directly under the page title, four cards in this order: v1 progress (ADM-12), production health (ADM-18), agent cost (ADM-10a), skills used (ADM-19). Each card has a title (`h2`), one headline sentence, the chart, then its folded Details (ADM-20). Order of the page: the four cards (the cost-per-issue table is inside the cost card's Details), then Reviews, Sessions, Docs Claude sees, How it connects, each as a folded Details block except the diagram. Layout: below 768 px one column in the order above; from 768 px a two-column grid: progress and health side by side in the first row, then cost and then skills, each across both columns. The DOM order is the reading order in both layouts. Each card loads on its own source: a failing source shows its own message inside its card ("Ledger unavailable (HTTP n)" for cost and skills, "GitHub unavailable (HTTP n)" for progress and health) and never hides another card.
- **ADM-18** *(#252)* **Production health**: the last result of six workflows of `PUBLIC_REPO` on `main`, one row each, in this order: "Site check" (`smoke.yml`), "Daily health check" (`health.yml`), "Weekly backup" (`backup.yml`), "Database migrations" (`migrate.yml`), "CI" (`ci.yml`), "Code scanning" (`codeql.yml`). CI and code scanning have no limit and no bar (they run on pushes and pull requests; CodeQL also weekly), like database migrations. Each row shows: the name; a **status word with an icon** ("Passing", "Failing", "Stale", "Cancelled", "No run yet", "Unknown"); the age of the run ("3 hours ago"); and, for the first three, a thin bar of age against the limit with the limit written out ("limit 36 hours"). Rules: status comes from the newest **completed** run (`conclusion`): `success` = Passing; `failure`, `timed_out`, `startup_failure` = Failing; `cancelled`, `skipped` = Cancelled; anything else = Unknown. The age of a run is now minus its `updated_at`. A Passing run older than its limit is **Stale**. Limits: site check 36 hours, daily health check 36 hours (both run daily), weekly backup 8 days (the limit `health.yml` already uses). Backup freshness uses the newest run with `conclusion` success, so a failed run after a good one shows "Failing" and also "last good backup 3 days ago". Database migrations run only when a migration is merged, so they have no limit and no bar: the row shows the status and age, and "Runs when a migration is merged". Status colours and icons: Passing `success` with a check icon; Failing `destructive` with a cross icon; Stale, Cancelled, No run yet and Unknown `warning` with a warning icon. The age bar fills to the limit and stops at 100% (the word "Stale" says the rest). Every status other than Passing **needs attention**. Headline: "All 6 checks are fine" or "2 of 6 need attention: Weekly backup, Site check" (names in the row order). Read-only, as a **last result, not a live probe**: the page never calls production. Fields kept: `status`, `conclusion`, `updated_at` only (no logs, URLs, job names, commit messages or people, ADM-07). Source: GitHub REST, `GET /repos/{PUBLIC_REPO}/actions/workflows/{file}/runs?branch=main&status=completed&per_page=1` (and `status=success` for the backup), cached `GITHUB_CACHE_S`. Empty: a workflow with no run: "No run yet". Error: the row says "Unknown (HTTP n)"; when all rows fail, the card says "GitHub unavailable (HTTP n)". Details: table (workflow, status, run finished, limit).
- **ADM-19** *(#252)* **Skills used**: for each kind of work in the fixed order `code`, `ideas`, `docs`, `marketing`, `video`, `post`, horizontal bars of how many agent records of that kind list each skill (`skills` of ADM-06, after `corrects`). Per kind: the 3 most used skills (ties sorted by name, A to Z), then "Other" (the sum of the rest), then "No skill listed" (records with an empty `skills`, shown only when above 0). Bars share one scale across all kinds, so lengths can be compared; one colour (`chart-1`, "Other" and "No skill listed" in `chart-6`); every bar with a count above 0 is at least 4 px long; the skill name is written above each bar and the count at its end (direct labels, no legend needed). A kind with no record shows "No records" and is not hidden. Headline: "Most used: <skill> (n records, <kind>)" (ties: first by name, then by the kind order). Kinds as plain words: Code, Ideas, Docs, Marketing, Video, Post. From 768 px the six kinds flow in two columns. Source: ledger only. Empty: "No skills recorded yet." Error: "Ledger unavailable (HTTP n)". Details: table of every skill (kind, skill, records), alphabetical within a kind.
- **ADM-20** *(#252)* **Rules for every chart and Details block** on `/admin`:
  1. *Drawing.* Hand-written inline SVG in server components. No chart library and no client JavaScript for charts, no new dependency (ADM-16). The SVG scales with its box (`viewBox`, width 100%); labels, numbers and legends are HTML text beside it, so they wrap and zoom, never clip.
  2. *Colour.* Only design tokens (docs/design-system.md): the series colours of ADM-10a and ADM-19 are `chart-1..3` and `chart-6`; progress uses `success` (done), `primary` (waiting), `warning` (blocked) and `chart-6` (open); health uses `success`, `destructive` and `warning` as status. Segments are separated by a 2 px gap in the card colour, not a border. Light and dark both defined by the tokens; contrast of each mark with the card is at least 3:1 (the existing token test).
  3. *Never colour alone.* Every status has a word and an icon; every segment has its count in the legend or a direct label; the Details table holds every value.
  4. *Text alternative.* Each chart is `role="img"` with an `aria-label` that repeats its headline sentence, which holds the main numbers. The Details table is the full alternative. Marks carry a native `<title>` for the hover text; no value is only in a tooltip.
  5. *Details.* A native `<details>` with a `<summary>`, closed by default, labelled "Details: <what>" (e.g. "Details: tokens per day"), whole row clickable, at least 44 px high, works with keyboard (Enter, Space) and shows a focus ring. Tables inside scroll in their own box (`overflow-x: auto`), never the page.
  6. *Responsive (TEST-01).* No horizontal page scroll from 360 to 1440 px, in light and dark; no fixed pixel width on cards or charts; touch targets at least 44 px (summaries, any link). The TEST-01 check for `/admin` also runs with every Details block open (the test opens them in the browser; no query flag in the page).
  7. *Words.* Plain English, sentence case, short sentences, numbers with `formatTokens`, dates written "21 Nov" in chart ticks and `YYYY-MM-DD` in tables. Errors say what failed and give the HTTP status only (ADM-08).
  8. *Freshness.* A line under the page title: "GitHub data is up to 10 minutes old" (`GITHUB_CACHE_S`).

- **ADM-21** *(#260)* **Posts**: a card after the four overview cards, across the full width, titled "Posts". Source: the post records `posts/YYYY/<stem>.json` (`PostRecordSchema`, PST-04) and the state files `posts-state/YYYY/<stem>.json` (`PostStateSchema`, PST-07) in `LEDGER_REPO`, read with the same token, tree request and blob cache as the ledger (ADM-08, ADM-16, PST-26); other files there (such as `posts-state/tokens.json`) are not posts and are ignored. **One row per post** (the same video goes to several networks), newest first by the record's date and time: the YouTube title (else the slug), and the date written "Sun, Nov 29, 19:00" (the record's São Paulo time). Under it, one line per network in the order Instagram, TikTok, YouTube, LinkedIn: the network, the **effective status** (PST-07) as a word with an icon (Draft, Scheduled = record `ready` with no state yet, Publishing = `queued`, Published, Failed, Skipped), and for a published post an "Open" link to the live post (`url` of the state file; only an `https:` address without a user name or password becomes a link; new tab, `rel="noopener noreferrer"`, accessible name "Open <title> on <network> (opens in a new tab)", at least 44 px high). A failed post adds "(HTTP n)" from `error.http_status` only (PST-20). A network the record skipped and the pipeline never touched is not shown. Headline: "3 posts: 4 of 6 network posts are live" (live = Published). Empty: "No posts yet." Error: "Posts unavailable (HTTP n)". A record or state file that is not valid JSON, fails its schema, cannot be read, or (for a record) whose stem differs from its `date` and `slug` is listed by name as an invalid file and skipped (as in ADM-06); the other posts still show. When a post's state file is invalid, each of its planned networks says "Status unknown" with no link, never "Scheduled". Details (ADM-20): a table with one row per post and network: date, file stem, network, status, live since (`published_at`), link. No numbers (views, clicks) and no action (ADM-04): the pipeline's `hold` label and GitHub stay the controls.

**Process**

- **ADM-14** Before a session ends, the main session writes its ledger file (ADM-05, ADM-06) and pushes it to `LEDGER_REPO`. Rule in `docs/process/agents.md` §6 (A10). A session that cannot push says so in its last message to the product owner, with the file content kept out of the public repo.
- **ADM-16** Cost: no new paid service, no new database table besides `admins`, no scheduled job, no new runtime dependency unless a PR justifies it (AGENTS.md §3). GitHub calls stay within the authenticated REST limit (5,000 per hour) through the cache. *(#252)* The health card adds seven GET requests per `GITHUB_CACHE_S` (six workflows, plus one for the last good backup); with the ledger tree, the issue and pull-request listings and the check runs, a page view costs about 10-20 requests per 10 minutes, under 120 per hour at most, far below 5,000. The unauthenticated public limit is 60 per hour per IP address and Vercel IPs are shared, so the token (ADM-08) is sent and the unauthenticated read is only the fallback. The fallback can hit that limit: its rows then show "Unknown (HTTP 403)" or "(HTTP 429)" and the other cards stay. No new dependency for charts (ADM-20).

## 4. Out of scope

Social media numbers (A9: views, link clicks; the list of posts is in scope, ADM-21), live service status (a probe of production; ADM-18 only shows the last result of a workflow run), editing anything from the page, more than one admin role, an admin link in the sidebar.

## 5. Acceptance criteria

1. Signed out, signed in without an `admins` row, and signed in with one: `/admin` answers 404, 404, 200. The 404 has the same status, "Page not found" content and `noindex` as `/does-not-exist`, and the signed-out and non-admin responses are identical.
2. A signed-in user cannot insert, update or delete a row in `admins`, and cannot read another user's row (pgTAP).
3. With a ledger of two sessions (fixture), the sessions, cost-per-issue and reviews panels show the expected sums; an invalid file is listed as invalid and changes no sum.
4. Without `OPS_LEDGER_TOKEN`, the page renders with "Ledger unavailable"; the token never appears in the HTML, in client bundles or in logs (test on the built output).
5. The v1 progress panel puts a fixture of issues and PRs in the right groups.
6. `pnpm lint`, `typecheck`, `test`, `db:test` and the responsive checks pass.
7. *(#252)* With a ledger fixture over 20 days, the cost chart has 14 columns, today last, with the expected sums per model; an empty column for a day without sessions; a `corrects` file replaces the session it names (ADM-10a).
8. *(#252)* Fixtures of workflow runs give each status word of ADM-18 (Passing, Failing, Stale, Cancelled, No run yet, Unknown), the 8-day backup limit, and "last good backup" after a failed run; one failing request leaves the other rows.
9. *(#252)* A ledger with skills in all six kinds gives top 3, "Other" and "No skill listed" per kind and "No records" for an empty kind (ADM-19).
10. *(#252)* Every chart has an `aria-label` and a Details block that holds all its values; Details are closed by default and their summaries are at least 44 px high (ADM-20).
11. *(#252)* TEST-01 passes on `/admin` from 360 to 1440 px, light and dark, also with every Details block open.
12. *(#260)* With fixtures of records and state files, the Posts card lists the posts newest first, one row per post, with the effective status per network, an "Open" link only for a published post with an `https:` URL, "(HTTP n)" for a failed one, no line for a network that was never planned, and an invalid or unreadable file listed by name while the other posts still show, "Status unknown" for a post whose state file is invalid; `posts-state/tokens.json` is ignored (ADM-21).

## 6. Issues

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| ADM-a (#212) | Process: ledger rule and "Skills used" rule in `agents.md`; ledger schema README in the private repo; backfill of 2026-11-17/18 | `docs/process/`, private repo | Main session · tech lead's check | First (now) |
| ADM-b (#213) | DB: `admins` table, RLS, grants, pgTAP (ADM-01) | `supabase/` | Sonnet · **Opus deep review** (auth) | After #178 is merged and applied |
| ADM-c (#214) | Web: `/admin` guard and 404 (ADM-02..04), ledger reader with schema and cache (ADM-05..08), env check, sessions panel (ADM-09) | `apps/web/app/admin`, `apps/web/lib/admin`, `packages/shared` | Sonnet · **Opus deep review** (auth, secret) | After ADM-b; not at the same time as #181 (shared web files) |
| ADM-d (#215) | Web: cost, reviews, v1 progress, docs map, diagram panels (ADM-09..13, ADM-15) and the `v1` label on the v1 issues | `apps/web/app/admin` | Sonnet · Sonnet | After ADM-c |
| ADM-e (#252) | Web: overview cards, health, cost and skills charts and chart rules (ADM-10a, ADM-17..20); Details blocks for the existing panels | `apps/web/app/admin`, `apps/web/lib/admin` | Sonnet · Sonnet (UI, with the TEST-01 screenshots) | After PR #253 (this spec change) is merged |
| #260 | Posts card (ADM-21): reader of `posts/` and `posts-state/`, view, card, CI stub posts, spec | `apps/web/app/admin/`, `apps/web/lib/admin/`, `scripts/ci/github-stub.ts` | Sonnet · Sonnet review, copy review agent | 2026-11-28 |

# 03 — Internal admin dashboard

Status: **Accepted (2026-11-18, gate 5, #209)** · Issue: #208 · Source: product-owner decisions A1–A10 (2026-11-18, below) · Related ADRs: [0013](../../docs/adr/0013-admin-access.md) (admin access and private ledger)

Amended 2026-11-18 (#214): ADM-02 and acceptance 1: the 404 has the same status, the same "Page not found" content and `noindex` as an unknown path, and signed-out and non-admin responses are identical; exact HTML equality with an unmatched path is not required (Next.js 16 renders a matched route's `notFound()` as an error shell that shows the same page on the client).

Amended 2026-11-19 (#215): ADM-05 — a file with `corrects` replaces the named session's records in every total (cost, reviews, docs); the Sessions panel still lists both (product owner). ADM-11 findings are summed over the PR's review records. `findings` holds the first-round HIGH and MEDIUM counts of that review (ADM-06); a re-review record stores the new round's HIGH and MEDIUM in the same field, so the sum counts every round that was recorded.

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
| A9 | Social media control comes later (before posting starts), after a marketing specialist validates the tracking approach (Q32). **Out of scope here** |
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

  `model`: `haiku` | `sonnet` | `opus`. `work`: `author` | `review` | `fix` | `other`. `kind`: `code` | `docs` | `marketing` | `video` | `post`. `issue`, `pr`, `minutes`, `findings` may be `null`. `main.measure`: `estimate` | `measured` (from `/explain-usage`); `main.tokens` may be `null` (not measured). Sub-agent `tokens` are the exact numbers each agent reported. `findings` is the number of HIGH and MEDIUM findings a **review** reported in its first round.
- **ADM-07** The ledger holds no secrets, tokens, emails, URLs of private documents or user data. Names are spec IDs, issue and PR numbers, repo paths and skill names only.
- **ADM-08** The server reads the ledger through the GitHub REST API with a **fine-grained token that has read-only Contents access to `LEDGER_REPO` only**, from the server-only variable `OPS_LEDGER_TOKEN` (never `NEXT_PUBLIC_`, never logged, never sent to the browser, SEC-07). One tree listing per `GITHUB_CACHE_S`; each file is fetched once by its blob SHA and then served from the cache, because files never change (ADM-05). When the variable is missing or GitHub fails, the page still renders and says "Ledger unavailable" with the HTTP status only.

**Panels**

- **ADM-09** **Sessions**: one row per session, newest first: date, goal, main-session tokens with "estimate" or "measured", sub-agent tokens by model, number of agents.
- **ADM-10** **Cost per issue**: one row per issue: tokens by model (haiku, sonnet, opus) summed over every agent record with that issue, total, and the number of sessions. Main-session tokens are **not** split across issues; they appear as one line "Main sessions (estimate)" under the table. Records without an issue are summed in a row "No issue".
- **ADM-11** **Reviews**: one row per PR that has review records: review rounds (largest `rounds` of its review records), HIGH and MEDIUM findings, model of the reviewer, and merge state from GitHub (ADM-12).
- **ADM-12** **v1 progress**: the issues of `PUBLIC_REPO` with label `v1`, read live from the GitHub REST API (cached `GITHUB_CACHE_S`, same token), each in one group: **done** (closed), **waiting for approval** (an open, non-draft PR with `Closes #N` and both required checks green), **blocked** (label `blocked`), **open** (all others). Counts per group and the list.
- **ADM-13** **Docs Claude sees**: (a) a fixed map, kept in code next to the page: always loaded (`AGENTS.md`, the handoff, memory), and per kind of task (code: the spec and ADRs the issue names, `docs/process/agents.md`; marketing: `docs/marketing/` and the matching skills; video: `docs/marketing/video-formats.md`); (b) per issue, the union of `files` and `skills` from the ledger.
- **ADM-15** **How it connects**: one static diagram, written by hand in the page (no diagram library, no live status): product owner → main session → sub-agents by model → GitHub (REST, git) → CI → Vercel; GitHub → Supabase through `migrate.yml`; Chrome Web Store; connectors. Each edge is labelled with what crosses it.

**Process**

- **ADM-14** Before a session ends, the main session writes its ledger file (ADM-05, ADM-06) and pushes it to `LEDGER_REPO`. Rule in `docs/process/agents.md` §6 (A10). A session that cannot push says so in its last message to the product owner, with the file content kept out of the public repo.
- **ADM-16** Cost: no new paid service, no new database table besides `admins`, no scheduled job, no new runtime dependency unless a PR justifies it (AGENTS.md §3). GitHub calls stay within the authenticated REST limit (5,000 per hour) through the cache.

## 4. Out of scope

Social media control (A9: scheduled and posted posts, views, link clicks), live service status, editing anything from the page, more than one admin role, an admin link in the sidebar.

## 5. Acceptance criteria

1. Signed out, signed in without an `admins` row, and signed in with one: `/admin` answers 404, 404, 200. The 404 has the same status, "Page not found" content and `noindex` as `/does-not-exist`, and the signed-out and non-admin responses are identical.
2. A signed-in user cannot insert, update or delete a row in `admins`, and cannot read another user's row (pgTAP).
3. With a ledger of two sessions (fixture), the sessions, cost-per-issue and reviews panels show the expected sums; an invalid file is listed as invalid and changes no sum.
4. Without `OPS_LEDGER_TOKEN`, the page renders with "Ledger unavailable"; the token never appears in the HTML, in client bundles or in logs (test on the built output).
5. The v1 progress panel puts a fixture of issues and PRs in the right groups.
6. `pnpm lint`, `typecheck`, `test`, `db:test` and the responsive checks pass.

## 6. Issues (proposed)

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| ADM-a (#212) | Process: ledger rule and "Skills used" rule in `agents.md`; ledger schema README in the private repo; backfill of 2026-11-17/18 | `docs/process/`, private repo | Main session · tech lead's check | First (now) |
| ADM-b (#213) | DB: `admins` table, RLS, grants, pgTAP (ADM-01) | `supabase/` | Sonnet · **Opus deep review** (auth) | After #178 is merged and applied |
| ADM-c (#214) | Web: `/admin` guard and 404 (ADM-02..04), ledger reader with schema and cache (ADM-05..08), env check, sessions panel (ADM-09) | `apps/web/app/admin`, `apps/web/lib/admin`, `packages/shared` | Sonnet · **Opus deep review** (auth, secret) | After ADM-b; not at the same time as #181 (shared web files) |
| ADM-d (#215) | Web: cost, reviews, v1 progress, docs map, diagram panels (ADM-09..13, ADM-15) and the `v1` label on the v1 issues | `apps/web/app/admin` | Sonnet · Sonnet | After ADM-c |

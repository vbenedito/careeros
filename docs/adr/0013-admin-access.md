# ADR-0013 — Admin access by table, ledger in a private repository

Status: Accepted · Date: 2026-11-18 · Issue: #208 · Spec: [ADM](../../specs/v1/03-admin.md)

## Context
The product owner wants one private page, `/admin`, that shows how CareerOS is built: sessions, agents, tokens, review rounds, v1 progress (A1–A8). Constraints:
- The repository is **public**: the page code is public, so the page must hold no data and no admin identity.
- The data (token use per session and agent) is not user data, but it is private. It must never be in the public repo (handoff constraint) or in a public deployment artefact.
- It must cost little to build and to run (A8): Vercel free plan, Supabase free plan, no new service.
- Sessions run in a cloud sandbox that cannot reach production (`*.vercel.app`, the database), but can push to GitHub repos added to the session.

Two decisions: **who is admin** and **where the data lives**.

## Options — who is admin
1. **`admins` table, checked on the server, 404 otherwise** (A2). The user id is added once in the SQL editor; RLS lets a user read only their own row, so the check runs with the user's own session (no secret key). Needs one migration.
2. **Allowlist in an environment variable** (`ADMIN_USER_IDS` in Vercel). No migration, but the admin identity lives in deployment config, a change needs a redeploy, and it is a second place where authorization is decided (today it is all in the database).
3. **Role in Supabase `app_metadata`** (custom claim in the JWT). No table, but setting it needs the admin API or SQL on `auth.users`, the claim is cached in tokens until refresh, and it is less visible than a table.
4. **Vercel password protection or a separate deployment.** Password protection is a paid feature; a second deployment doubles config and still needs an identity check.

## Options — where the ledger lives
1. **One JSON file per session in a private GitHub repo, read server-side with a read-only fine-grained token** (A4). Sessions can already push to GitHub; no secret-holding workflow; files are immutable, so they cache well.
2. **A ledger table in Supabase.** The sandbox cannot reach the database, so writing would need a workflow holding a secret key, or a manual step per session.
3. **Files in the public repo.** Ruled out: the data is private.
4. **A Claude artifact or sheet.** Ruled out by A1 (the page is part of CareerOS) and not readable server-side by the app.

## Decision
Admin: **option 1** (table). Ledger: **option 1** (private repo).

- `admins (user_id)`: RLS on, one `select` policy `user_id = auth.uid()`, no write grants to `anon` or `authenticated`; account deletion cascades (DATA-12 pattern). The `/admin` server layout checks `getClaims()` and the row before rendering or fetching anything, and calls `notFound()` otherwise (ADM-02). Same 404 for signed out and not admin, so the page reveals nothing beyond what the public code already shows.
- Ledger: `vbenedito/careeros-ops` (private). Token: fine-grained, **Contents: read-only** on that repository only (it also reads public repos, which ADM-12 uses for issues and PRs), stored as the server-only `OPS_LEDGER_TOKEN` in Vercel (Production only), with an expiry the product owner chooses and a calendar reminder to rotate it. Files are fetched by blob SHA and cached forever; only the tree listing and the live GitHub reads are cached for `GITHUB_CACHE_S`.
- Writing: each session pushes its own file at the end (ADM-14). No workflow, no database write, no secret in CI.

## Consequences
+ No admin identity and no data in the public repo; the page code alone reveals nothing.
+ Authorization stays in the database, like the rest of the app, and is covered by pgTAP.
+ Running cost: one GitHub tree call per 10 minutes when the page is opened; no new service, table (besides `admins`) or job.
− A leaked `OPS_LEDGER_TOKEN` exposes the ledger (token counts, issue numbers) and allows reading public repos; it cannot write. Accepted: low-value data, read-only, single repo, expiring.
− Main-session tokens are only an estimate unless `/explain-usage` is run (A3).
− A session that ends without pushing loses its record; the rule (ADM-14) and the last message to the product owner are the safeguards, not a check.
− One more migration in `supabase/`; it waits until #178 is merged and applied (one area at a time).

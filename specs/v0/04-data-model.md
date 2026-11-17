# 04 — Data Model & Database

Status: **Approved (2026-11-04)** · Related ADRs: 0004 (idempotent ingest)

Amended 2026-11-11 (#131): `public.hostname` domain type, indexes, column-level grant, anonymous-JWT refusal, DATA-10 `NOT_AUTHENTICATED`, to match the migrations.

Amended 2026-11-12 (#145): limit 50 → 12; existing lists over the limit are kept; v1 premium may raise it.

Amended 2026-11-17 (#171): DATA-10 test note — `posix/` and `right/` zone copies are outside the "every real zone name" check; the validator is unchanged.

Amended 2026-11-17 (#176): proposed for v1 — DATA-01 limit from the plan ([ENT](../v1/02-entitlements.md)); problem slugs in a separate table `study_session_problems` (DATA-16); ingest v2 next to the current RPC (DATA-06b, [ADR-0011](../../docs/adr/0011-ingest-v2.md)); caps count only new rows (DATA-09b, grill E5); overlap rejections reported apart (grill E3); account setting (DATA-13, DATA-14); problem totals (DATA-15).

Supabase Postgres. All application tables live in `public`, have RLS **enabled and forced**, and reference `auth.users(id) ON DELETE CASCADE`, except `plans` (ENT-01, #176, proposed), which belongs to no user. Schema changes ship only as versioned migrations in `supabase/migrations/`.

## 1. Tables

### Domain type `public.hostname`

Both tables store hosts as `public.hostname`, a `text` domain that mirrors `isValidDomain()` in `packages/shared/src/domain.ts` (TRK-03). Its `CHECK` requires length ≤ 253 and rejects: uppercase letters; a leading `www.`; a trailing dot; a single label (at least two are required); labels that are empty, longer than 63 characters, or start or end with `-`; IP addresses (the last label must be 2–63 letters or an `xn--` punycode label); and any character other than `a-z`, `0-9`, `-` and `.`.

### `tracked_domains`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `user_id` | `uuid` not null | `default auth.uid()`, FK `auth.users` cascade |
| `domain` | `public.hostname` not null | normalized (TRK-03); see the domain type above |
| `created_at` | `timestamptz` not null | `default now()` |

- `UNIQUE (user_id, domain)` (its index also serves `user_id` lookups and the FK cascade).
- **DATA-01** A user may have at most **12** tracked domains (trigger-enforced). Lists that were already over the limit are kept: the user can remove sites but cannot add one while at or over the limit. *Amended 2026-11-17 (#176, proposed):* the number comes from the caller's plan (ENT-01..03; `free` = 12), and the error carries the limit and the plan (ENT-05, ENT-06). See [ENT](../v1/02-entitlements.md).

### `study_sessions` (stores intervals)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | client-generated (TRK-10) |
| `user_id` | `uuid` not null | `default auth.uid()`, FK cascade |
| `device_id` | `uuid` not null | |
| `domain` | `public.hostname` not null | same domain type |
| `started_at` | `timestamptz` not null | |
| `ended_at` | `timestamptz` not null | |
| `duration_s` | `integer` | `GENERATED ALWAYS AS (extract(epoch from ended_at - started_at)::integer) STORED` |
| `created_at` | `timestamptz` not null | `default now()` |

- **DATA-02** `CHECK (ended_at > started_at)` and `CHECK (ended_at - started_at <= interval '1830 seconds')` (`MAX_INTERVAL_S` + 30 s tolerance).
- **DATA-03** Rows are **immutable**: no UPDATE policy; DELETE only via account deletion cascade.
- Indexes: `(user_id, started_at)` for the totals (DATA-10/11); `(user_id, created_at)` for the abuse counts (DATA-09); `(user_id, device_id, started_at)` for the overlap check (DATA-09a).

No `profiles` table in v0: the dashboard passes the viewer's IANA time zone to queries (DASH-07).

## 2. Row Level Security

- **DATA-04** `tracked_domains`: `SELECT`, `INSERT`, `DELETE` where `user_id = (select auth.uid())`; no `UPDATE`.
- **DATA-05** `study_sessions`: `SELECT` where `user_id = (select auth.uid())`. `authenticated` has **no** `INSERT/UPDATE/DELETE` privilege on the table: `ingest_study_sessions` is the only write path (DATA-06), so its validation and abuse guard cannot be bypassed through PostgREST.
- Grants: `anon` has no table privileges; `authenticated` gets `SELECT` on `study_sessions`, `SELECT/DELETE` on `tracked_domains` plus `INSERT` on its `domain` column only (`id`, `user_id`, `created_at` always come from their defaults), and `EXECUTE` on the public RPCs only. Helpers live in a non-exposed `private` schema. Default privileges are revoked, so every future table and function needs an explicit grant.
- **Anonymous sign-ins** (disabled, AUTH-01) carry the role `authenticated`. Restrictive policies `tracked_domains_no_anonymous` and `study_sessions_no_anonymous` refuse any JWT with `is_anonymous = true` on every command, and `ingest_study_sessions` raises `NOT_AUTHENTICATED` for such a caller (`20261110100000_security_hardening.sql`).

## 3. Functions (RPC)

All use `SET search_path = ''`, fully qualified names, and validate inputs. Read functions are `SECURITY INVOKER` (RLS applies). The ingest function is `SECURITY DEFINER` (it must write to a table clients cannot write to) and therefore **never** takes a user id as input: it uses `auth.uid()` exclusively and raises if it is null. `EXECUTE` is revoked from `public`/`anon` and granted to `authenticated`.

### `ingest_study_sessions(sessions jsonb) → uuid[]`

- **DATA-06** Rejects (error) when there is no user or the JWT is anonymous (`NOT_AUTHENTICATED`, `PT401` → HTTP 401) or the payload is not an array, has > 200 elements or is larger than 128 kB (`22023` → HTTP 400).
- **DATA-07** Per element, accepts only if: valid UUIDs, valid domain, DATA-02 holds, `started_at >= now() - interval '30 days'`, `ended_at <= now() + interval '5 minutes'`. Invalid elements are skipped, not fatal. (The extension retries elements refused only for ending in the future, SYNC-05a.)
- **DATA-08** Skips invalid elements, inserts the rest with `user_id = auth.uid()` and `ON CONFLICT (id) DO NOTHING`, and returns the ids of the **valid** elements that exist with `user_id = auth.uid()` (SYNC-04); an invalid element is never confirmed, even if its id was stored earlier. An id that collides with another user's row is therefore not returned and ends in quarantine.
- **DATA-09** Abuse guard (call-level, two indexed counts per call): raises `ABUSE_LIMIT` (`PT429` → HTTP 429) when the caller already inserted ≥ 1,000 rows in the last hour or ≥ 3,500 rows in the last 24 hours. The counts are checked once per call, before the batch, so a user can exceed a cap by at most one batch (199 rows): harmless, and simpler than partial batches. A heavy real user creates ~18 rows a day; a 30-day offline backlog (≤ ~3,000 rows) fits in the daily cap and uploads over a few hours, the extension backing off on 429 without losing data (SYNC-06). *Changed by the product owner on 2026-11-10 (security audit #110): was > 10,000 per hour with no daily cap, which let a few throwaway accounts fill the free 500 MB database.*
- **DATA-09a** An element whose interval overlaps another interval of the **same user and device**, stored or earlier in the same batch, is skipped like an invalid element (not confirmed). Extension 0.2.3 quarantines it; extensions from 0.3.0 get the reason `overlap` from ingest v2, drop it and count its time apart (SYNC-05c, #176, proposed). A retry of a stored interval (same id) is not an overlap; adjacent intervals (`[start, end)`) do not overlap. Intervals from different devices may overlap (two computers). Checked under the per-user lock, so concurrent calls cannot both pass. This keeps one user's data consistent (no double-counted time from one device); it is **not** an abuse limit, since the client chooses `device_id`. Storage abuse is bounded by DATA-09.
- **DATA-09b** *(#176, grill E5, proposed)* The caps only stop **new** rows. Some batches hold only elements that are already stored for the caller (pure retries). Such a batch is confirmed, even when the caller is at a cap. A batch with at least one new row still raises `ABUSE_LIMIT` at the cap. This applies to both ingest RPCs. The reply of `ingest_study_sessions` keeps its type.

### `ingest_study_sessions_v2(sessions jsonb) → jsonb` *(#176, proposed)*

- **DATA-06b** A second ingest RPC, next to `ingest_study_sessions`, which keeps its contract for released extensions ([ADR-0011](../../docs/adr/0011-ingest-v2.md)). Same checks as DATA-06..09a (auth, batch size and bytes, per-element validation, overlap, abuse guard), same `SECURITY DEFINER` rules. Differences:
  - an element may carry `problem` (a slug, PRB-05). It is validated with the same pattern as `study_session_problems.problem_slug`. An invalid slug makes the element `invalid`. A `problem` on an element whose domain is not `leetcode.com` also makes that element `invalid`. Only that element is rejected, never the whole batch;
  - it returns `{"confirmed": [uuid…], "rejected": [{"id": uuid, "reason": "invalid" | "future" | "overlap"}]}`: `future` = only `ended_at` too far ahead (DATA-07), `overlap` = DATA-09a, `invalid` = anything else (grill E3). An element without a valid id is left out of both lists;
  - the slug is stored only when the caller's problem setting is on at call time (DATA-14).
  `ingest_study_sessions` never stores a slug (it ignores a `problem` key).

### `get_daily_totals(p_from date, p_to date, p_tz text) → table(day date, seconds bigint)`

- **DATA-10** Raises `NOT_AUTHENTICATED` (`PT401` → HTTP 401) when there is no user. Returns one row per day in `[p_from, p_to]` (zero-filled), summing `duration_s` of the caller's intervals by `(started_at AT TIME ZONE p_tz)::date`. Rejects ranges > 92 days or outside 0001-01-01..2999-12-31 (`INVALID_RANGE`; the dashboard never asks for dates before year 1000) and time zones that are not ≤ 64 characters of `[A-Za-z0-9_+/-]`, contain a digit (unless `Etc/GMT±N`, N ≤ 14, or one of `EST5EDT`, `CST6CDT`, `MST7MDT`, `PST8PDT`), or that the server cannot load (`INVALID_TIME_ZONE`). The zone is checked by loading it, not by scanning `pg_timezone_names` (which reads every zone file per call, #111). Names with a digit can parse as POSIX specs, and every distinct one would stay in the connection's zone cache; a pgTAP test keeps every real zone name allowed (the `posix/` and `right/` copies of the zone tree that some images list are not canonical names and may be refused).

### `get_domain_totals(p_from date, p_to date, p_tz text) → table(domain text, seconds bigint)`

- **DATA-11** Same filters, grouped by domain, ordered by seconds desc.

### `private.link_requests` (AUTH-08 rate limit)

`user_id` (FK → `auth.users`, cascade), `created_at`, index `(user_id, created_at)`; written and counted only by the definer function `public.consume_extension_link_quota() → boolean` (authenticated only; acts on `auth.uid()`; false after 5 requests in a rolling minute), called from the link route with the user's session; the caller's rows older than 1 h are deleted by the same function.

### `get_problem_totals(p_from date, p_to date, p_tz text) → table(problem_slug text, seconds bigint, last_day date)` *(#176, proposed)*

- **DATA-15** Same checks as DATA-10. For the caller's intervals with a slug (joined with `study_session_problems`), grouped by slug: total seconds and the last local day (`started_at AT TIME ZONE p_tz`) in `[p_from, p_to]`. Ordered by seconds desc, then slug; at most 200 rows (PRB-11). `SECURITY INVOKER`.

### `account_settings` *(#176, proposed)*

- **DATA-13** One row per user: `user_id` (PK, `default auth.uid()`, FK cascade), `track_problems boolean not null default false`, `updated_at timestamptz not null default now()`. No row means off (PRB-01). RLS forced: `SELECT`, `INSERT` and `UPDATE` of `track_problems` only where `user_id = (select auth.uid())`; anonymous JWTs refused, as for the other tables. No `DELETE` (the row goes with the account).
- **DATA-14** Server-side guard for PRB-16: `ingest_study_sessions_v2` reads `track_problems` **after** it has taken the caller's per-user ingest lock (DATA-09), so it cannot race `set_problem_tracking` (DATA-17), which takes the same lock. It stores no slug (no `study_session_problems` row) when the caller has no settings row or `track_problems` is false at that moment. The interval itself is still stored.

### `study_session_problems` *(#176, proposed)*

| Column | Type | Rules |
|---|---|---|
| `session_id` | `uuid` PK | part of the composite FK below |
| `user_id` | `uuid` not null | FK `auth.users` cascade; part of the composite FK below |
| `domain` | `public.hostname` not null | `CHECK (domain = 'leetcode.com')` (`PROBLEM_DOMAIN`); part of the composite FK below |
| `problem_slug` | `text` not null | PRB-05 slug; `CHECK` length ≤ 100 and `PROBLEM_SLUG_PATTERN` |

- **DATA-16** Slugs live in their own table, so they can be deleted while `study_sessions` stays immutable (DATA-03 unchanged; [ADR-0011](../../docs/adr/0011-ingest-v2.md)). Ownership is enforced by the schema: a composite FK `(session_id, user_id, domain)` → `study_sessions(id, user_id, domain)` `ON DELETE CASCADE` (with a `UNIQUE (id, user_id, domain)` constraint on `study_sessions`; its index is built in the migration with a plain `CREATE`, not `CONCURRENTLY`, because `supabase db push` runs each migration in a transaction; the table is small today, so the lock is short; see ADR-0011), so a slug row always belongs to a session row of the same user on `leetcode.com`. Only `ingest_study_sessions_v2` inserts rows, and only for a session row that **this call newly inserted**: a retry of an interval that is already stored never adds or re-adds a slug. RLS forced: `SELECT` only, where `user_id = (select auth.uid())`; clients have no `INSERT`, `UPDATE` or `DELETE` privilege (deleting goes through DATA-17 only); anonymous JWTs refused. Index `(user_id)`.
- **DATA-17** `set_problem_tracking(p_enabled boolean, p_delete_history boolean) → void`: the only path that deletes slugs. `SECURITY DEFINER` with `SET search_path = ''` and schema-qualified names; `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon`, then `GRANT EXECUTE … TO authenticated`; acting on `auth.uid()` exclusively (never a caller-supplied id); `NOT_AUTHENTICATED` without a user or with an anonymous JWT. In one transaction it takes the caller's per-user ingest lock (the same advisory lock as DATA-09, so no upload in flight can add a slug after the delete), upserts the caller's `account_settings` row, and, when `p_enabled` is false and `p_delete_history` is true, deletes every `study_session_problems` row of the caller. `p_delete_history` with `p_enabled` true is refused (`22023`). It never touches `study_sessions`.
- *Acceptance (pgTAP, #176):* `anon` and `public` have no `EXECUTE` on `set_problem_tracking`; `authenticated` has it; the function is `SECURITY DEFINER` with `search_path` set to empty.

## 4. Account deletion

- **DATA-12** A dashboard server route (service role) calls `auth.admin.deleteUser(user.id)` for the authenticated caller; cascades remove all application rows from the live database immediately. No soft delete in v0. Platform backups and auth audit logs follow Supabase's retention and are disclosed on the privacy page (SEC-13).

## 5. Acceptance criteria (pgTAP)

1. User A cannot select, insert or delete user B's rows in either table (including via RPCs).
2. `ingest_study_sessions` called twice with the same batch inserts once and returns the same ids.
3. Invalid elements are skipped and not returned.
4. Totals functions zero-fill days, respect time zone boundaries (an interval at 01:30 UTC on Tuesday counts on Tuesday in UTC and on Monday in `America/Sao_Paulo`, 22:30), and reject bad ranges/time zones.
5. Deleting a user removes all their rows.

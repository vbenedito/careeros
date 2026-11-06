# 04 — Data Model & Database

Status: **Approved (2026-11-04)** · Related ADRs: 0004 (idempotent ingest)

Supabase Postgres. All application tables live in `public`, have RLS **enabled and forced**, and reference `auth.users(id) ON DELETE CASCADE`. Schema changes ship only as versioned migrations in `supabase/migrations/`.

## 1. Tables

### `tracked_domains`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `user_id` | `uuid` not null | `default auth.uid()`, FK `auth.users` cascade |
| `domain` | `text` not null | normalized (TRK-03); `CHECK` regex for a valid hostname, length ≤ 253 |
| `created_at` | `timestamptz` not null | `default now()` |

- `UNIQUE (user_id, domain)`.
- **DATA-01** A user may have at most **50** tracked domains (trigger-enforced).

### `study_sessions` (stores intervals)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | client-generated (TRK-10) |
| `user_id` | `uuid` not null | `default auth.uid()`, FK cascade |
| `device_id` | `uuid` not null | |
| `domain` | `text` not null | same `CHECK` as above |
| `started_at` | `timestamptz` not null | |
| `ended_at` | `timestamptz` not null | |
| `duration_s` | `integer` | `GENERATED ALWAYS AS (extract(epoch from ended_at - started_at)::integer) STORED` |
| `created_at` | `timestamptz` not null | `default now()` |

- **DATA-02** `CHECK (ended_at > started_at)` and `CHECK (ended_at - started_at <= interval '1830 seconds')` (`MAX_INTERVAL_S` + 30 s tolerance).
- **DATA-03** Rows are **immutable**: no UPDATE policy; DELETE only via account deletion cascade.
- Index: `(user_id, started_at)`.

No `profiles` table in v0: the dashboard passes the viewer's IANA time zone to queries (DASH-07).

## 2. Row Level Security

- **DATA-04** `tracked_domains`: `SELECT`, `INSERT`, `DELETE` where `user_id = (select auth.uid())`; no `UPDATE`.
- **DATA-05** `study_sessions`: `SELECT` where `user_id = (select auth.uid())`. `authenticated` has **no** `INSERT/UPDATE/DELETE` privilege on the table: `ingest_study_sessions` is the only write path (DATA-06), so its validation and abuse guard cannot be bypassed through PostgREST.
- Grants: `anon` has no table privileges; `authenticated` gets `SELECT` on `study_sessions`, `SELECT/INSERT/DELETE` on `tracked_domains`, and `EXECUTE` on the public RPCs only. Helpers live in a non-exposed `private` schema.

## 3. Functions (RPC)

All use `SET search_path = ''`, fully qualified names, and validate inputs. Read functions are `SECURITY INVOKER` (RLS applies). The ingest function is `SECURITY DEFINER` (it must write to a table clients cannot write to) and therefore **never** takes a user id as input: it uses `auth.uid()` exclusively and raises if it is null. `EXECUTE` is revoked from `public`/`anon` and granted to `authenticated`.

### `ingest_study_sessions(sessions jsonb) → uuid[]`

- **DATA-06** Rejects (error) when the caller is anonymous (`PT401` → HTTP 401) or the payload is not an array or has > 200 elements (`22023` → HTTP 400).
- **DATA-07** Per element, accepts only if: valid UUIDs, valid domain, DATA-02 holds, `started_at >= now() - interval '30 days'`, `ended_at <= now() + interval '5 minutes'`. Invalid elements are skipped, not fatal.
- **DATA-08** Skips invalid elements, inserts the rest with `user_id = auth.uid()` and `ON CONFLICT (id) DO NOTHING`, and returns the ids of the **valid** elements that exist with `user_id = auth.uid()` (SYNC-04); an invalid element is never confirmed, even if its id was stored earlier. An id that collides with another user's row is therefore not returned and ends in quarantine.
- **DATA-09** Abuse guard (call-level, one indexed count per call): raises `ABUSE_LIMIT` (`PT429` → HTTP 429) when the caller already inserted > 10,000 rows in the last hour. Normal use is ≤ ~150/h; a 30-day offline backlog is ≤ ~3,000 rows, so legitimate catch-up never trips it.

### `get_daily_totals(p_from date, p_to date, p_tz text) → table(day date, seconds bigint)`

- **DATA-10** Returns one row per day in `[p_from, p_to]` (zero-filled), summing `duration_s` of the caller's intervals by `(started_at AT TIME ZONE p_tz)::date`. Rejects ranges > 92 days and unknown time zones (checked against `pg_timezone_names`).

### `get_domain_totals(p_from date, p_to date, p_tz text) → table(domain text, seconds bigint)`

- **DATA-11** Same filters, grouped by domain, ordered by seconds desc.

### `private.link_requests` (AUTH-08 rate limit)

`user_id` (FK → `auth.users`, cascade), `created_at`; written and counted only by the definer function `public.consume_extension_link_quota() → boolean` (authenticated only; acts on `auth.uid()`; false after 5 requests in a rolling minute), called from the link route with the user's session; the caller's rows older than 1 h are deleted by the same function.

## 4. Account deletion

- **DATA-12** A dashboard server route (service role) calls `auth.admin.deleteUser(user.id)` for the authenticated caller; cascades remove all application rows from the live database immediately. No soft delete in v0. Platform backups and auth audit logs follow Supabase's retention and are disclosed on the privacy page (SEC-13).

## 5. Acceptance criteria (pgTAP)

1. User A cannot select, insert or delete user B's rows in either table (including via RPCs).
2. `ingest_study_sessions` called twice with the same batch inserts once and returns the same ids.
3. Invalid elements are skipped and not returned.
4. Totals functions zero-fill days, respect time zone boundaries (an interval at 01:30 UTC on Tuesday counts on Tuesday in UTC and on Monday in `America/Sao_Paulo`, 22:30), and reject bad ranges/time zones.
5. Deleting a user removes all their rows.

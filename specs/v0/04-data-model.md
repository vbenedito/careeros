# 04 — Data Model & Database

Status: **Approved (2026-11-04)** · Related ADRs: 0004 (idempotent ingest)

Amended 2026-11-11 (#131): `public.hostname` domain type, indexes, column-level grant, anonymous-JWT refusal, DATA-10 `NOT_AUTHENTICATED`, to match the migrations.

Supabase Postgres. All application tables live in `public`, have RLS **enabled and forced**, and reference `auth.users(id) ON DELETE CASCADE`. Schema changes ship only as versioned migrations in `supabase/migrations/`.

## 1. Tables

### Domain type `public.hostname`

Both tables store hosts as `public.hostname`, a `text` domain that mirrors `isValidDomain()` in `packages/shared/src/domain.ts` (TRK-03). Its `CHECK` rejects: values longer than 253 characters; uppercase letters; a leading `www.`; a trailing dot; a single label (at least two are required); labels that are empty, longer than 63 characters, or start or end with `-`; IP addresses (the last label must be 2–63 letters or an `xn--` punycode label); and any character other than `a-z`, `0-9`, `-` and `.`.

### `tracked_domains`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `user_id` | `uuid` not null | `default auth.uid()`, FK `auth.users` cascade |
| `domain` | `public.hostname` not null | normalized (TRK-03); see the domain type above |
| `created_at` | `timestamptz` not null | `default now()` |

- `UNIQUE (user_id, domain)` (its index also serves `user_id` lookups and the FK cascade).
- **DATA-01** A user may have at most **50** tracked domains (trigger-enforced).

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
- **DATA-07** Per element, accepts only if: valid UUIDs, valid domain, DATA-02 holds, `started_at >= now() - interval '30 days'`, `ended_at <= now() + interval '5 minutes'`. Invalid elements are skipped, not fatal.
- **DATA-08** Skips invalid elements, inserts the rest with `user_id = auth.uid()` and `ON CONFLICT (id) DO NOTHING`, and returns the ids of the **valid** elements that exist with `user_id = auth.uid()` (SYNC-04); an invalid element is never confirmed, even if its id was stored earlier. An id that collides with another user's row is therefore not returned and ends in quarantine.
- **DATA-09** Abuse guard (call-level, two indexed counts per call): raises `ABUSE_LIMIT` (`PT429` → HTTP 429) when the caller already inserted ≥ 1,000 rows in the last hour or ≥ 3,500 rows in the last 24 hours. The counts are checked once per call, before the batch, so a user can exceed a cap by at most one batch (199 rows): harmless, and simpler than partial batches. A heavy real user creates ~18 rows a day; a 30-day offline backlog (≤ ~3,000 rows) fits in the daily cap and uploads over a few hours, the extension backing off on 429 without losing data (SYNC-06). *Changed by the product owner on 2026-11-10 (security audit #110): was > 10,000 per hour with no daily cap, which let a few throwaway accounts fill the free 500 MB database.*
- **DATA-09a** An element whose interval overlaps another interval of the **same user and device**, stored or earlier in the same batch, is skipped like an invalid element (not confirmed → client quarantine). A retry of a stored interval (same id) is not an overlap; adjacent intervals (`[start, end)`) do not overlap. Intervals from different devices may overlap (two computers). Checked under the per-user lock, so concurrent calls cannot both pass. This keeps one user's data consistent (no double-counted time from one device); it is **not** an abuse limit, since the client chooses `device_id`. Storage abuse is bounded by DATA-09.

### `get_daily_totals(p_from date, p_to date, p_tz text) → table(day date, seconds bigint)`

- **DATA-10** Raises `NOT_AUTHENTICATED` (`PT401` → HTTP 401) when there is no user. Returns one row per day in `[p_from, p_to]` (zero-filled), summing `duration_s` of the caller's intervals by `(started_at AT TIME ZONE p_tz)::date`. Rejects ranges > 92 days or outside 0001-01-01..2999-12-31 (`INVALID_RANGE`; the dashboard never asks for dates before year 1000) and time zones that are not ≤ 64 characters of `[A-Za-z0-9_+/-]`, contain a digit (unless `Etc/GMT±N`, N ≤ 14, or one of `EST5EDT`, `CST6CDT`, `MST7MDT`, `PST8PDT`), or that the server cannot load (`INVALID_TIME_ZONE`). The zone is checked by loading it, not by scanning `pg_timezone_names` (which reads every zone file per call, #111). Names with a digit can parse as POSIX specs, and every distinct one would stay in the connection's zone cache; a pgTAP test keeps every real zone name allowed.

### `get_domain_totals(p_from date, p_to date, p_tz text) → table(domain text, seconds bigint)`

- **DATA-11** Same filters, grouped by domain, ordered by seconds desc.

### `private.link_requests` (AUTH-08 rate limit)

`user_id` (FK → `auth.users`, cascade), `created_at`, index `(user_id, created_at)`; written and counted only by the definer function `public.consume_extension_link_quota() → boolean` (authenticated only; acts on `auth.uid()`; false after 5 requests in a rolling minute), called from the link route with the user's session; the caller's rows older than 1 h are deleted by the same function.

## 4. Account deletion

- **DATA-12** A dashboard server route (service role) calls `auth.admin.deleteUser(user.id)` for the authenticated caller; cascades remove all application rows from the live database immediately. No soft delete in v0. Platform backups and auth audit logs follow Supabase's retention and are disclosed on the privacy page (SEC-13).

## 5. Acceptance criteria (pgTAP)

1. User A cannot select, insert or delete user B's rows in either table (including via RPCs).
2. `ingest_study_sessions` called twice with the same batch inserts once and returns the same ids.
3. Invalid elements are skipped and not returned.
4. Totals functions zero-fill days, respect time zone boundaries (an interval at 01:30 UTC on Tuesday counts on Tuesday in UTC and on Monday in `America/Sao_Paulo`, 22:30), and reject bad ranges/time zones.
5. Deleting a user removes all their rows.

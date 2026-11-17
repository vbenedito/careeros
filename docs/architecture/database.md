# Database design

Type: living · Owner: tech lead · Last reviewed: 2026-11-17

Low-level design of the Supabase Postgres database in `supabase/`. The rules are in [DATA](../../specs/v0/04-data-model.md), [ENT](../../specs/v1/02-entitlements.md) and SEC-07; this page shows how the migrations implement them. The big picture is in the [overview](overview.md).

## Entity relationships

```mermaid
erDiagram
  AUTH_USERS ||--o{ TRACKED_DOMAINS : "user_id (on delete cascade)"
  AUTH_USERS ||--o{ STUDY_SESSIONS : "user_id (on delete cascade)"
  AUTH_USERS ||--o{ LINK_REQUESTS : "user_id (on delete cascade)"

  AUTH_USERS {
    uuid id PK
    text email
  }
  TRACKED_DOMAINS {
    uuid id PK "gen_random_uuid()"
    uuid user_id FK "default auth.uid()"
    hostname domain "unique per user"
    timestamptz created_at
  }
  STUDY_SESSIONS {
    uuid id PK "client UUID (idempotency key)"
    uuid user_id FK "default auth.uid()"
    uuid device_id
    hostname domain
    timestamptz started_at
    timestamptz ended_at
    integer duration_s "generated, stored"
    timestamptz created_at
  }
  LINK_REQUESTS {
    uuid user_id FK
    timestamptz created_at
  }
  PLANS {
    text id PK "free"
    integer max_tracked_domains "12 for free"
  }
```

`auth.users` belongs to Supabase Auth. `link_requests` lives in the `private` schema, which PostgREST does not expose. `plans` belongs to no user: it has no foreign key, and in v1 every account is on `free` through `private.plan_of` (no per-account plan record yet, ENT-02).

## Tables and types

| Object | Purpose | Rules in the database | Specs |
|---|---|---|---|
| Domain `public.hostname` | A normalized hostname | ≤ 253 chars, the `DOMAIN_PATTERN` regex, no leading `www.` | TRK-03 |
| `public.tracked_domains` | Study sites per user | `unique (user_id, domain)`; trigger `tracked_domains_limit` allows at most the number in the user's plan (12 on `free`; advisory lock per user; lists already over the limit are kept, deletes always allowed) | DATA-01, ENT-03, SYNC-09 |
| `public.study_sessions` | One row per closed interval | `ended_at > started_at`; length ≤ 1830 s; immutable | DATA-02, DATA-03 |
| `public.plans` | One row per plan, one column per limit; v1 has `free` with `max_tracked_domains = 12`. Changed only by a migration (`update public.plans set ... where id = 'free'`) | `id` primary key, `max_tracked_domains > 0` | ENT-01 |
| `private.link_requests` | Rate-limit log for extension links | Rows older than 1 hour pruned on each call | AUTH-08 |

`packages/shared/src/db-parity.test.ts` fails if the `hostname` regex or limits drift from `isValidDomain()` in `packages/shared/src/domain.ts`, and (ENT-11) if the `free` row set by the last migration differs from `ENTITLEMENTS` in `packages/shared`.

## Grants and RLS

Deny by default: the first migration revokes every client privilege and forces RLS; later migrations grant back only what DATA-04/05 allow. Default privileges also revoke access to future tables, sequences and functions, so a new object is never exposed by accident.

| Object | `authenticated` may | Policies |
|---|---|---|
| `tracked_domains` | `select`, `delete`, `insert (domain)` only | `*_select_own`, `*_insert_own`, `*_delete_own`: `user_id = (select auth.uid())`; restrictive `tracked_domains_no_anonymous` |
| `plans` | `select` only (no write grant, no write policy) | `plans_select_all` (`using (true)`: no user data); restrictive `plans_no_anonymous` |
| `study_sessions` | `select` only | `study_sessions_select_own`; restrictive `study_sessions_no_anonymous` |
| `private.*` | nothing | RLS forced on `link_requests` |
| `anon` | nothing on any table or function | — |

There is no `UPDATE` grant anywhere. `ingest_study_sessions` is the only write path for `study_sessions` (DATA-05, DATA-06).

## Functions (RPC)

| Function | Security | Grant | Does | Specs |
|---|---|---|---|---|
| `ingest_study_sessions(sessions jsonb) → uuid[]` | `definer`, `search_path = ''` | `authenticated` | Rejects no user / anonymous (`PT401`), non-array, > 200 items, > 128 kB (`22023`); per-user advisory lock; abuse caps 1,000/h and 3,500/24 h (`ABUSE_LIMIT`, `PT429`); skips invalid or overlapping elements; inserts with `on conflict (id) do nothing`; returns confirmed ids | DATA-06..09a, SYNC-04, [ADR-0004](../adr/0004-idempotent-ingest.md) |
| `private.parse_study_session(jsonb)` | invoker | none | Validates one element (UUIDs, ISO timestamps with whole seconds, domain, length, ≤ 30 days old, ≤ 5 min in the future); null when invalid | DATA-07 |
| `get_daily_totals(p_from, p_to, p_tz)` | `invoker` (RLS applies) | `authenticated` | One zero-filled row per local day; range ≤ 92 days; checks the time zone (`INVALID_RANGE`, `INVALID_TIME_ZONE`) | DATA-10 |
| `get_domain_totals(p_from, p_to, p_tz)` | `invoker` | `authenticated` | Seconds per domain, largest first | DATA-11 |
| `consume_extension_link_quota() → boolean` | `definer` | `authenticated` | Records one request for `auth.uid()`; false above 5 per minute | AUTH-08 |
| `private.plan_of(p_user_id uuid) → text` | `invoker`, `search_path = ''` | none | Plan of a user; `'free'` for everyone in v1. A later per-account plan changes only this function | ENT-02, ENT-12 |
| `private.enforce_tracked_domain_limit()` | `definer` | none (trigger) | Site limit: reads `max_tracked_domains` of `plan_of(new.user_id)` from `plans`; refuses the insert at or above it; a missing plan row refuses too (fail closed) | DATA-01, ENT-03, ENT-05 |

### Limit error (ENT-05, ENT-06)

When the site limit is reached, the trigger raises:

| Field | Value |
|---|---|
| `errcode` | `P0001` (unchanged; PostgREST answers HTTP 400) |
| `hint` | `DATA-01` (unchanged; released extension 0.2.3 maps it to `LIMIT_REACHED`) |
| `message` | `A user can track at most 12 domains` (same format; the number comes from the plan) |
| `detail` | `{"code":"LIMIT_REACHED","limit":12,"plan":"free"}` (new; PostgREST returns it as `details`) |

New fields are only added to `detail`, so older clients are unaffected. New clients read it with `LimitErrorDetailsSchema` / `parseLimitErrorDetails` in `packages/shared` and fall back to the hint when `details` is missing or invalid (ENT-07). The trigger runs on insert only, so a list already over the limit stays and its owner can still remove sites.

Account deletion has no RPC: the dashboard calls `auth.admin.deleteUser` with the secret key and the foreign keys cascade to every application row (DATA-12, AUTH-13).

## Indexes

| Index | Serves |
|---|---|
| `tracked_domains_user_domain_key` (unique) | Per-user lookups, duplicates, FK cascade |
| `study_sessions_pkey` (`id`) | Idempotent insert |
| `study_sessions_user_started_idx (user_id, started_at)` | Totals by period, FK cascade |
| `study_sessions_user_created_idx (user_id, created_at)` | Abuse-cap counts |
| `study_sessions_user_device_started_idx (user_id, device_id, started_at)` | Overlap check (DATA-09a) |
| `link_requests_user_created_idx (user_id, created_at)` | Quota count and prune |

## Retention and cleanup

| Data | Kept |
|---|---|
| `tracked_domains`, `study_sessions` | Until the user deletes them (sites) or the account (cascade). No soft delete |
| `private.link_requests` | Rows older than 1 hour are deleted by the next request of the same user |
| Backups | 90 days as encrypted workflow artifacts ([operations §4](../operations.md#4-backups)) |

There is no scheduled job (`pg_cron`) in the database.

## Migrations

Append-only; never edit an applied migration (AGENTS.md).

| File | Adds |
|---|---|
| `20261105100000_core_schema.sql` | `hostname` domain, both tables, site-limit trigger (50, lowered to 12 by `20261112100000`), forced RLS, revokes |
| `20261105110000_rls_policies.sql` | Grants, owner policies, default privileges |
| `20261105120000_ingest_study_sessions.sql` | `parse_study_session`, `ingest_study_sessions`, `created_at` index |
| `20261105130000_totals_rpcs.sql` | `get_daily_totals`, `get_domain_totals` |
| `20261105140000_extension_link_rate_limit.sql` | `link_requests`, `consume_extension_link_quota` |
| `20261110100000_security_hardening.sql` | Upload caps, payload size, overlap check and index, anonymous-refusing policies, bounded totals inputs (#110, #111) |
| `20261112100000_tracked_domain_limit_12.sql` | Site limit 50 → 12; existing rows kept (#145) |
| `20261117100000_entitlements.sql` | `plans` (`free` = 12), `private.plan_of`, site-limit trigger reads the plan and raises the error with `detail` (#177) |

How they reach production: [release process](../process/release.md#database-migrations).

## Tests (pgTAP)

`pnpm db:test` runs `supabase/tests/database` against the local stack; CI runs it on every pull request (ENV-08).

| File | Covers |
|---|---|
| `000_smoke` | pgTAP runner, schemas, Postgres ≥ 17 |
| `001_helpers` | Shared helpers (test users, role switching) |
| `010_schema` | Tables, types, constraints, trigger (DATA-01..03) |
| `020_rls` | Grants and cross-user isolation (DATA-04/05, SEC-07) |
| `030_ingest` | Ingest validation and idempotency (DATA-06..09, SYNC-04/05) |
| `040_totals` | Totals, time zones, ranges (DATA-10/11, DASH-07) |
| `050_link_quota` | Link rate limit (AUTH-08) |
| `060_security` | Caps, overlaps, payload size, anonymous callers, catalog-wide exposure checks |
| `070_domain_limit` | 12-site limit; lists over the limit can delete, not insert (DATA-01, #145) |
| `090_rls_policies` | Every policy ties access to the caller; `plans` is the one read-only reference exception (SEC-07, ENT-01) |
| `100_entitlements` | `plans`, `plan_of`, limit from the plan, error code, hint and details, changed `free` row (ENT-01..06) |

## Backups

Weekly data-only dump of `auth.users`, `auth.identities`, `tracked_domains` and `study_sessions`, encrypted with age; restore = migrations + dump. Procedure and checks: [operations §4](../operations.md#4-backups).

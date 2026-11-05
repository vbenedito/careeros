-- CareerOS v0 core schema (#5): tracked domains and study intervals.
-- Spec: specs/v0/04-data-model.md §1 (DATA-01, DATA-02, DATA-03). Policies and grants: #6.

-- ---------------------------------------------------------------------------------------------
-- Domain type: a normalized hostname (TRK-03), mirroring isValidDomain() in
-- packages/shared/src/domain.ts: same regex as DOMAIN_PATTERN, plus no leading www. and
-- at most 253 characters. A test in packages/shared keeps the two in sync.
-- ---------------------------------------------------------------------------------------------
create domain public.hostname as text
  check (
    length(value) <= 253
    and value ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{0,58}[a-z0-9])$'
    and value !~ '^www\.'
  );

comment on domain public.hostname is
  'Normalized hostname: lowercase, no www., no trailing dot, >= 2 labels, not an IP (TRK-03).';

-- Helpers live in a schema that PostgREST does not expose.
create schema if not exists private;

-- ---------------------------------------------------------------------------------------------
-- tracked_domains
-- ---------------------------------------------------------------------------------------------
create table public.tracked_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain public.hostname not null,
  created_at timestamptz not null default now(),
  constraint tracked_domains_user_domain_key unique (user_id, domain)
);

comment on table public.tracked_domains is 'Study sites chosen by each user (SYNC-09).';

-- The unique (user_id, domain) index also serves user_id lookups and the FK cascade.

-- DATA-01: at most 50 tracked domains per user. The advisory lock serializes concurrent
-- inserts for the same user so two parallel requests cannot both pass the count.
create function private.enforce_tracked_domain_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('tracked_domains:' || new.user_id::text, 0));
  if (select count(*) from public.tracked_domains where user_id = new.user_id) >= 50 then
    raise exception 'A user can track at most 50 domains'
      using errcode = 'P0001', hint = 'DATA-01';
  end if;
  return new;
end;
$$;

create trigger tracked_domains_limit
  before insert on public.tracked_domains
  for each row execute function private.enforce_tracked_domain_limit();

-- ---------------------------------------------------------------------------------------------
-- study_sessions (one row per closed interval, TRK-10)
-- ---------------------------------------------------------------------------------------------
create table public.study_sessions (
  -- Client-generated UUIDv4 (TRK-10, ADR-0004): the idempotency key for retried uploads.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id uuid not null,
  domain public.hostname not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_s integer generated always as (extract(epoch from ended_at - started_at)::integer) stored,
  created_at timestamptz not null default now(),
  -- DATA-02
  constraint study_sessions_positive_duration check (ended_at > started_at),
  constraint study_sessions_max_duration check (ended_at - started_at <= interval '1830 seconds')
);

comment on table public.study_sessions is
  'Closed study intervals; immutable once written (DATA-03).';

-- Totals by period (DATA-10/11) and the FK cascade both start from user_id.
create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at);

-- ---------------------------------------------------------------------------------------------
-- Deny by default: RLS on (and forced) from the first migration, so no table is ever exposed
-- without policies. Policies and grants are added in #6 (DATA-04, DATA-05).
-- ---------------------------------------------------------------------------------------------
alter table public.tracked_domains enable row level security;
alter table public.tracked_domains force row level security;
alter table public.study_sessions enable row level security;
alter table public.study_sessions force row level security;

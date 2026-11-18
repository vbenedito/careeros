-- Ingest v2, the problem setting and the problem history (#178).
-- Spec: specs/v0/04-data-model.md DATA-06b, DATA-09, DATA-09a, DATA-09b, DATA-13..17;
-- specs/v1/01-problems.md PRB-01, PRB-05, PRB-16; ADR-0011.
--
-- 1. One shared implementation, private.ingest_sessions(sessions, keep_problem), behind both
--    public functions, so validation, locking, caps and overlap rules cannot drift apart:
--    - ingest_study_sessions(sessions) → uuid[]: unchanged signature and reply for released
--      extensions (0.2.3); never keeps a slug, ignores a `problem` key.
--    - ingest_study_sessions_v2(sessions) → jsonb: {"confirmed": [uuid], "rejected":
--      [{"id": uuid, "reason": "invalid" | "future" | "overlap"}]}; stores the slug of a newly
--      inserted leetcode.com interval when the caller's setting is on (DATA-14).
-- 2. DATA-09b (grill E5): the abuse caps only stop batches that would insert a new row, so a
--    batch of pure retries is confirmed at the cap (both functions).
-- 3. account_settings (DATA-13) and study_session_problems (DATA-16).
-- 4. set_problem_tracking (DATA-17): the only write path for the setting and the only path that
--    deletes slugs, under the same per-user lock as ingest.
-- 5. get_problem_totals (DATA-15).

-- ---------------------------------------------------------------------------------------------
-- DATA-13: the account setting. No row means off (PRB-01).
-- Clients read their own row only. The only write path is set_problem_tracking (DATA-17), which
-- takes the per-user ingest lock, so a change of the setting is always ordered with uploads.
-- ---------------------------------------------------------------------------------------------
create table public.account_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  track_problems boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.account_settings is
  'One row per user (DATA-13). No row means every setting is off. Written only by set_problem_tracking.';

alter table public.account_settings enable row level security;
alter table public.account_settings force row level security;

revoke all on table public.account_settings from anon, authenticated;
grant select on table public.account_settings to authenticated;

create policy account_settings_select_own on public.account_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy account_settings_no_anonymous on public.account_settings
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------------------------------
-- DATA-16: problem slugs, in their own table so they can be deleted while study_sessions stays
-- immutable (DATA-03). The composite FK makes every row belong to a session of the same user on
-- the same domain; the CHECK limits that domain to PROBLEM_DOMAIN.
--
-- The UNIQUE constraint builds its index with a plain CREATE, not CONCURRENTLY: `supabase db
-- push` runs each migration in a transaction, where CONCURRENTLY cannot run. The table is small
-- today, so the write lock is short (ADR-0011 consequences).
-- ---------------------------------------------------------------------------------------------
alter table public.study_sessions
  add constraint study_sessions_id_user_domain_key unique (id, user_id, domain);

create table public.study_session_problems (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  domain public.hostname not null,
  problem_slug text not null,
  -- PROBLEM_DOMAIN (specs/v1/01-problems.md §2)
  constraint study_session_problems_domain_check check (domain = 'leetcode.com'),
  -- PROBLEM_SLUG_MAX and PROBLEM_SLUG_PATTERN (PRB-05); db-parity.test.ts keeps them equal to
  -- packages/shared.
  constraint study_session_problems_slug_check check (
    char_length(problem_slug) <= 100 and problem_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint study_session_problems_session_fkey foreign key (session_id, user_id, domain)
    references public.study_sessions (id, user_id, domain) on delete cascade
);

comment on table public.study_session_problems is
  'LeetCode problem slug of an interval (DATA-16). Inserted only by ingest_study_sessions_v2, '
  'deleted only by set_problem_tracking (or the account cascade).';

create index study_session_problems_user_idx on public.study_session_problems (user_id);

alter table public.study_session_problems enable row level security;
alter table public.study_session_problems force row level security;

-- Read-only for clients: no INSERT, UPDATE or DELETE privilege (DATA-16).
revoke all on table public.study_session_problems from anon, authenticated;
grant select on table public.study_session_problems to authenticated;

create policy study_session_problems_select_own on public.study_session_problems
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy study_session_problems_no_anonymous on public.study_session_problems
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------------------------------
-- Element parser with a reason. Replaces private.parse_study_session (which could only say
-- "invalid"): v2 must tell `future` (only ended_at too far ahead, DATA-07) from `invalid`.
-- Returns the parsed columns and reason = null when the element is valid. id is set whenever the
-- element has a valid UUID id, so a rejection can name it; an element without one has id = null
-- and is left out of both reply lists (DATA-06b).
-- with_problem = true (v2 only): a `problem` key that is present and not JSON null must be a
-- PRB-05 slug, and only on a PROBLEM_DOMAIN interval; otherwise the element is invalid.
-- ---------------------------------------------------------------------------------------------
create function private.parse_session_element(
  element jsonb,
  with_problem boolean,
  out id uuid,
  out device_id uuid,
  out domain public.hostname,
  out started_at timestamptz,
  out ended_at timestamptz,
  out problem text,
  out reason text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  -- TRK-10: UTC ISO-8601 with whole seconds, e.g. 2026-11-05T09:30:00Z
  iso_seconds constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$';
begin
  reason := 'invalid';

  if jsonb_typeof(element) is distinct from 'object'
     or jsonb_typeof(element -> 'id') is distinct from 'string' then
    return;
  end if;
  begin
    id := (element ->> 'id')::uuid;
  exception when others then
    id := null;                                                -- not a UUID: unnamed rejection
    return;
  end;

  if jsonb_typeof(element -> 'device_id') is distinct from 'string'
     or jsonb_typeof(element -> 'domain') is distinct from 'string'
     or jsonb_typeof(element -> 'started_at') is distinct from 'string'
     or jsonb_typeof(element -> 'ended_at') is distinct from 'string'
     or (element ->> 'started_at') !~ iso_seconds
     or (element ->> 'ended_at') !~ iso_seconds then
    return;
  end if;

  begin
    device_id := (element ->> 'device_id')::uuid;
    domain := (element ->> 'domain')::public.hostname;         -- TRK-03 rules (domain type)
    started_at := (element ->> 'started_at')::timestamptz;
    ended_at := (element ->> 'ended_at')::timestamptz;
  exception when others then
    return;                                                    -- e.g. 2026-13-45, bad UUID
  end;

  if ended_at <= started_at                                    -- DATA-02
     or ended_at - started_at > interval '1830 seconds'        -- DATA-02
     or started_at < now() - interval '30 days' then           -- DATA-07
    return;
  end if;

  -- DATA-06b, PRB-05: the slug is checked as stored, never changed to make it valid.
  if with_problem and (element ? 'problem') and jsonb_typeof(element -> 'problem') <> 'null' then
    if jsonb_typeof(element -> 'problem') <> 'string'
       or domain::text <> 'leetcode.com'                        -- PROBLEM_DOMAIN
       or char_length(element ->> 'problem') > 100              -- PROBLEM_SLUG_MAX
       or (element ->> 'problem') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then  -- PROBLEM_SLUG_PATTERN
      return;
    end if;
    problem := element ->> 'problem';
  end if;

  if ended_at > now() + interval '5 minutes' then              -- DATA-07
    reason := 'future';
    return;
  end if;

  reason := null;
end;
$$;

revoke all on function private.parse_session_element(jsonb, boolean) from public, anon, authenticated;

-- The old parser has no caller left (both RPCs use parse_session_element).
drop function private.parse_study_session(jsonb);

-- ---------------------------------------------------------------------------------------------
-- Shared implementation of both ingest RPCs (ADR-0011). Not SECURITY DEFINER itself: it runs
-- with the rights of the definer wrappers, which are its only callers (clients have no usage on
-- `private`). It acts on auth.uid() only.
-- Returns {"confirmed": [uuid, sorted], "rejected": [{"id", "reason"}]}. An id appears in at most
-- one list: confirmed wins (a batch may repeat an id; the first valid occurrence is stored).
-- ---------------------------------------------------------------------------------------------
create function private.ingest_sessions(sessions jsonb, keep_problem boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  element jsonb;
  p record;
  parsed public.study_sessions;
  accepted public.study_sessions[] := '{}';
  accepted_problems text[] := '{}';
  candidate public.study_sessions;
  rejected jsonb := '[]';
  has_new_row boolean;
  keep_slugs boolean := false;
  confirmed uuid[];
begin
  -- DATA-06
  -- Anonymous sign-ins are disabled (AUTH-01); refuse them anyway if ever enabled.
  if caller is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if sessions is null or jsonb_typeof(sessions) <> 'array' then
    raise exception 'INVALID_BATCH' using errcode = '22023', detail = 'sessions must be a JSON array';
  end if;
  if jsonb_array_length(sessions) > 200 then
    raise exception 'INVALID_BATCH' using errcode = '22023', detail = 'at most 200 sessions per call';
  end if;
  -- A real batch of 200 intervals is ~40 kB; junk keys must not make each call expensive.
  if octet_length(sessions::text) > 131072 then
    raise exception 'INVALID_BATCH' using errcode = '22023', detail = 'payload larger than 128 kB';
  end if;

  -- The per-user lock serializes concurrent calls of the same user (both RPCs and
  -- set_problem_tracking share the key), so parallel requests cannot all pass the caps or the
  -- overlap check, and a setting change is ordered with uploads (DATA-14, DATA-17).
  perform pg_advisory_xact_lock(hashtextextended('ingest_study_sessions:' || caller::text, 0));

  -- DATA-07: validate each element independently
  for element in select value from jsonb_array_elements(sessions) loop
    select * into p from private.parse_session_element(element, keep_problem);
    if p.reason is not null then
      if p.id is not null then
        rejected := rejected || jsonb_build_object('id', p.id, 'reason', p.reason);
      end if;
      continue;
    end if;
    parsed := null;
    parsed.id := p.id;
    parsed.device_id := p.device_id;
    parsed.domain := p.domain;
    parsed.started_at := p.started_at;
    parsed.ended_at := p.ended_at;
    -- DATA-09a: an interval may not overlap another interval of the same device, stored or
    -- earlier in this batch. A retry of a stored interval (same id) is not an overlap: it is
    -- confirmed again below (SYNC-04). Adjacent intervals ([start, end)) do not overlap.
    if exists (
      select 1 from public.study_sessions s
      where s.user_id = caller
        and s.device_id = parsed.device_id
        and s.id <> parsed.id
        and s.started_at > parsed.started_at - interval '1830 seconds'
        and s.started_at < parsed.ended_at
        and s.ended_at > parsed.started_at
    ) then
      rejected := rejected || jsonb_build_object('id', parsed.id, 'reason', 'overlap');
      continue;
    end if;
    foreach candidate in array accepted loop
      if candidate.id <> parsed.id
         and candidate.device_id = parsed.device_id
         and candidate.started_at < parsed.ended_at
         and candidate.ended_at > parsed.started_at then
        rejected := rejected || jsonb_build_object('id', parsed.id, 'reason', 'overlap');
        parsed.id := null;
        exit;
      end if;
    end loop;
    if parsed.id is not null then
      accepted := accepted || parsed;
      accepted_problems := array_append(accepted_problems, p.problem);  -- null when none
    end if;
  end loop;

  -- DATA-09, DATA-09b: two indexed counts, only when this call would insert a new row. A batch
  -- of pure retries (every accepted id already stored) is confirmed even at a cap.
  select exists (
    select 1 from unnest(accepted) as a
    where not exists (select 1 from public.study_sessions s where s.id = a.id)
  ) into has_new_row;
  if has_new_row and (
    (
      select count(*) from public.study_sessions
      where user_id = caller and created_at > now() - interval '1 hour'
    ) >= 1000
    or (
      select count(*) from public.study_sessions
      where user_id = caller and created_at > now() - interval '24 hours'
    ) >= 3500
  ) then
    raise exception 'ABUSE_LIMIT' using errcode = 'PT429';
  end if;

  -- DATA-14: read the setting after the lock, so set_problem_tracking cannot interleave.
  if keep_problem then
    select coalesce(
      (select st.track_problems from public.account_settings st where st.user_id = caller),
      false
    ) into keep_slugs;
  end if;

  -- DATA-08: insert for the caller only; duplicates (retries) are ignored. The first occurrence
  -- of an id repeated in the batch wins. DATA-16: a slug row only for a session row this call
  -- newly inserted, so a retry never adds or re-adds a slug.
  with batch as (
    select distinct on ((accepted[i]).id)
      (accepted[i]).id as id, (accepted[i]).device_id as device_id,
      (accepted[i]).domain as domain, (accepted[i]).started_at as started_at,
      (accepted[i]).ended_at as ended_at, accepted_problems[i] as problem
    from generate_subscripts(accepted, 1) as i
    order by (accepted[i]).id, i
  ),
  inserted as (
    insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
    select b.id, caller, b.device_id, b.domain, b.started_at, b.ended_at
    from batch b
    on conflict (id) do nothing
    returning id, user_id, domain
  )
  insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
  select i.id, i.user_id, i.domain, b.problem
  from inserted i
  join batch b on b.id = i.id
  where keep_slugs and b.problem is not null;

  -- SYNC-04: confirm every accepted id that now exists for the caller (new or from a previous
  -- attempt). An id owned by another user is not confirmed and ends in the client quarantine.
  select coalesce(array_agg(s.id order by s.id), '{}')
  into confirmed
  from public.study_sessions s
  where s.user_id = caller
    and s.id in (select a.id from unnest(accepted) as a);

  -- DATA-08: an accepted id that is not the caller's (it collides with another user's row) is
  -- rejected as invalid. Then one entry per id, first reason wins, never a confirmed id.
  rejected := rejected || coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'reason', 'invalid'))
    from unnest(accepted) as a
    where a.id <> all (confirmed)
  ), '[]');
  rejected := coalesce((
    select jsonb_agg(r.entry order by r.first_pos)
    from (
      select distinct on (e.value ->> 'id') e.value as entry, e.pos as first_pos
      from jsonb_array_elements(rejected) with ordinality as e(value, pos)
      where (e.value ->> 'id')::uuid <> all (confirmed)
      order by e.value ->> 'id', e.pos
    ) as r
  ), '[]');

  return jsonb_build_object('confirmed', to_jsonb(confirmed), 'rejected', rejected);
end;
$$;

revoke all on function private.ingest_sessions(jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- DATA-06..09b: the released contract. Same signature and reply (uuid[]); never keeps a slug.
-- SECURITY DEFINER: clients have no INSERT privilege on study_sessions (DATA-05).
-- ---------------------------------------------------------------------------------------------
create or replace function public.ingest_study_sessions(sessions jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  reply jsonb := private.ingest_sessions(sessions, false);
begin
  return array(
    select e.value::uuid
    from jsonb_array_elements_text(reply -> 'confirmed') with ordinality as e(value, pos)
    order by e.pos
  );
end;
$$;

-- `create or replace` keeps the existing privileges; restate them so this file is self-evident.
revoke all on function public.ingest_study_sessions(jsonb) from public, anon;
grant execute on function public.ingest_study_sessions(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- DATA-06b: ingest v2 (ADR-0011).
-- ---------------------------------------------------------------------------------------------
create function public.ingest_study_sessions_v2(sessions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.ingest_sessions(sessions, true);
end;
$$;

revoke all on function public.ingest_study_sessions_v2(jsonb) from public, anon;
grant execute on function public.ingest_study_sessions_v2(jsonb) to authenticated;

comment on function public.ingest_study_sessions_v2(jsonb) is
  'Idempotent batch upload of closed study intervals for auth.uid() (DATA-06b). Returns '
  '{"confirmed": [uuid], "rejected": [{"id": uuid, "reason": "invalid"|"future"|"overlap"}]}. '
  'Clients must match ids, not positions.';

-- ---------------------------------------------------------------------------------------------
-- DATA-17: the setting switch and the only path that deletes slugs.
-- ---------------------------------------------------------------------------------------------
create function public.set_problem_tracking(p_enabled boolean, p_delete_history boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_enabled is null or p_delete_history is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023',
      detail = 'p_enabled and p_delete_history are required';
  end if;
  if p_enabled and p_delete_history then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023',
      detail = 'history can only be deleted when turning the setting off';
  end if;

  -- Same lock as ingest (DATA-14): no upload in flight can add a slug after the delete.
  perform pg_advisory_xact_lock(hashtextextended('ingest_study_sessions:' || caller::text, 0));

  insert into public.account_settings (user_id, track_problems, updated_at)
  values (caller, p_enabled, now())
  on conflict (user_id) do update
    set track_problems = excluded.track_problems, updated_at = excluded.updated_at;

  -- PRB-16: study_sessions and every total stay unchanged.
  if not p_enabled and p_delete_history then
    delete from public.study_session_problems where user_id = caller;
  end if;
end;
$$;

revoke all on function public.set_problem_tracking(boolean, boolean) from public, anon;
grant execute on function public.set_problem_tracking(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- DATA-15: time per problem in a period. Same checks as DATA-10/11 (repeated on purpose, see
-- get_daily_totals); invoker, so RLS applies to both tables.
-- ---------------------------------------------------------------------------------------------
create function public.get_problem_totals(p_from date, p_to date, p_tz text)
returns table (problem_slug text, seconds bigint, last_day date)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  lower_at timestamptz;
  upper_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 92
     or p_from < date '0001-01-01' or p_to > date '2999-12-31' then
    raise exception 'INVALID_RANGE' using errcode = '22023',
      detail = 'from <= to, at most 92 days, between 0001-01-01 and 2999-12-31';
  end if;
  if p_tz is null or length(p_tz) > 64 or p_tz !~ '^[A-Za-z0-9_+/-]+$'
     or (p_tz ~ '[0-9]'
         and pg_catalog.upper(p_tz) !~ '^(ETC/)?GMT[+-]?([0-9]|1[0-4])$'
         and pg_catalog.upper(p_tz) not in ('EST5EDT', 'CST6CDT', 'MST7MDT', 'PST8PDT'))
  then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end if;
  begin
    perform pg_catalog.timezone(p_tz, pg_catalog.now());
  exception when invalid_parameter_value then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end;
  lower_at := (p_from - 1)::timestamp at time zone 'UTC';
  upper_at := (p_to + 2)::timestamp at time zone 'UTC';

  -- PRB-11: longest first, ties by slug (byte order, A-Z), at most PROBLEM_LIST_MAX rows.
  return query
  select p.problem_slug,
         sum(s.duration_s)::bigint as seconds,
         max((s.started_at at time zone p_tz)::date) as last_day
  from public.study_sessions s
  join public.study_session_problems p on p.session_id = s.id
  where s.user_id = (select auth.uid())
    and p.user_id = (select auth.uid())
    and s.started_at >= lower_at
    and s.started_at < upper_at
    and (s.started_at at time zone p_tz)::date between p_from and p_to
  group by p.problem_slug
  order by 2 desc, p.problem_slug collate pg_catalog."C"
  limit 200;
end;
$$;

revoke all on function public.get_problem_totals(date, date, text) from public, anon;
grant execute on function public.get_problem_totals(date, date, text) to authenticated;

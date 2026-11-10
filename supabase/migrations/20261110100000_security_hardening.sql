-- Security hardening from the pre-release audit (#110, #111).
-- Spec: specs/v0/04-data-model.md DATA-06, DATA-09 (updated), DATA-09a (new), DATA-04/05.
--
-- 1. Upload limits (High finding): one account could insert ~10,000 rows per hour with no daily
--    cap and overlapping intervals, enough for a few throwaway accounts to fill the free 500 MB
--    database. Product owner decision (2026-11-10): at most 1,000 rows per hour and 3,500 rows
--    per 24 hours per user, and no overlapping intervals from the same device.
-- 2. Oversized payloads are rejected before any per-element work.
-- 3. Anonymous sign-ins (disabled, AUTH-01) are refused by every table policy, not only ingest.

-- DATA-09a: the overlap lookup is a short range scan per element. An interval lasts at most
-- 1,830 s (DATA-02), so only rows that started up to that long before the new one can overlap it.
create index study_sessions_user_device_started_idx
  on public.study_sessions (user_id, device_id, started_at);

create or replace function public.ingest_study_sessions(sessions jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  element jsonb;
  parsed public.study_sessions;
  accepted public.study_sessions[] := '{}';
  candidate public.study_sessions;
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

  -- DATA-09: two indexed counts per call. The per-user lock serializes concurrent calls of the
  -- same user, so parallel requests cannot all pass the counts (or the overlap check below).
  perform pg_advisory_xact_lock(hashtextextended('ingest_study_sessions:' || caller::text, 0));
  if (
    select count(*) from public.study_sessions
    where user_id = caller and created_at > now() - interval '1 hour'
  ) >= 1000
  or (
    select count(*) from public.study_sessions
    where user_id = caller and created_at > now() - interval '24 hours'
  ) >= 3500 then
    raise exception 'ABUSE_LIMIT' using errcode = 'PT429';
  end if;

  -- DATA-07: validate each element independently
  for element in select value from jsonb_array_elements(sessions) loop
    parsed := private.parse_study_session(element);
    if parsed.id is null then
      continue;
    end if;
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
      continue;
    end if;
    foreach candidate in array accepted loop
      if candidate.id <> parsed.id
         and candidate.device_id = parsed.device_id
         and candidate.started_at < parsed.ended_at
         and candidate.ended_at > parsed.started_at then
        parsed.id := null;
        exit;
      end if;
    end loop;
    if parsed.id is not null then
      accepted := accepted || parsed;
    end if;
  end loop;

  -- DATA-08: insert for the caller only; duplicates (retries) are ignored
  insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
  select a.id, caller, a.device_id, a.domain, a.started_at, a.ended_at
  from unnest(accepted) as a
  on conflict (id) do nothing;

  -- SYNC-04: confirm every accepted id that now exists for the caller (new or from a previous
  -- attempt). An id owned by another user is not confirmed and ends in the client quarantine.
  select coalesce(array_agg(s.id order by s.id), '{}')
  into confirmed
  from public.study_sessions s
  where s.user_id = caller
    and s.id in (select a.id from unnest(accepted) as a);

  return confirmed;
end;
$$;

-- `create or replace` keeps the existing privileges; restate them so this file is self-evident.
revoke all on function public.ingest_study_sessions(jsonb) from public, anon;
grant execute on function public.ingest_study_sessions(jsonb) to authenticated;

-- 3. AUTH-01 / DATA-04/05: a Supabase anonymous sign-in carries role `authenticated`. The
-- feature is disabled; these restrictive policies refuse such a caller anyway, on every command.
create policy tracked_domains_no_anonymous on public.tracked_domains
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy study_sessions_no_anonymous on public.study_sessions
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------------------------------
-- Totals RPCs (#111, DATA-10/11): bounded dates (no raw 'date out of range' errors for extreme
-- values) and a cheap time-zone check. Same signatures, so existing grants stay.
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_daily_totals(p_from date, p_to date, p_tz text)
returns table (day date, seconds bigint)
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
  -- Input validation is repeated in both functions on purpose: a shared helper would have to
  -- live in a schema clients can use, and `private` stays closed to them (DATA §2).
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 92
     or p_from < date '0001-01-01' or p_to > date '2999-12-31' then
    raise exception 'INVALID_RANGE' using errcode = '22023',
      detail = 'from <= to, at most 92 days, between 0001-01-01 and 2999-12-31';
  end if;
  -- Same shape check as the dashboard (time-zone.ts), then the zone must load. Cheaper than
  -- scanning pg_timezone_names, which reads every zone file on each call (security audit, #111).
  -- POSIX-style specs (letters then an offset: 'ABC1', 'FOO-3BAR') are refused: each distinct
  -- one would stay in the backend's zone cache forever (unbounded memory per connection). The
  -- real zone files with that shape are allowed by name; Etc/GMT+N has a '/' and is unaffected.
  if p_tz is null or length(p_tz) > 64 or p_tz !~ '^[A-Za-z0-9_+/-]+$'
     or (p_tz ~ '^[A-Za-z]{3,}[+-]?[0-9]'
         and upper(p_tz) not in ('EST5EDT', 'CST6CDT', 'MST7MDT', 'PST8PDT', 'GMT0', 'GMT+0', 'GMT-0'))
  then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end if;
  begin
    perform pg_catalog.timezone(p_tz, pg_catalog.now());
  exception when invalid_parameter_value then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end;
  -- Coarse instant range for the (user_id, started_at) index, widened by a day on each side so
  -- DST and repeated/missing local midnights can never cut off an interval. The exact rule is
  -- the local-date filter below, identical in both functions, so they always agree.
  lower_at := (p_from - 1)::timestamp at time zone 'UTC';
  upper_at := (p_to + 2)::timestamp at time zone 'UTC';

  return query
  with totals as (
    select (s.started_at at time zone p_tz)::date as day, sum(s.duration_s)::bigint as seconds
    from public.study_sessions s
    where s.user_id = (select auth.uid())          -- also enforced by RLS; lets the index work
      and s.started_at >= lower_at
      and s.started_at < upper_at
      and (s.started_at at time zone p_tz)::date between p_from and p_to
    group by 1
  )
  -- Integer series of dates: independent of the session TimeZone and of DST.
  select (p_from + i)::date, coalesce(t.seconds, 0)::bigint
  from generate_series(0, p_to - p_from) as i
  left join totals t on t.day = p_from + i
  order by 1;
end;
$$;

-- DATA-11: same period, grouped by domain, largest first (ties by name for stable output).
create or replace function public.get_domain_totals(p_from date, p_to date, p_tz text)
returns table (domain text, seconds bigint)
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
  -- Input validation is repeated in both functions on purpose: a shared helper would have to
  -- live in a schema clients can use, and `private` stays closed to them (DATA §2).
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 92
     or p_from < date '0001-01-01' or p_to > date '2999-12-31' then
    raise exception 'INVALID_RANGE' using errcode = '22023',
      detail = 'from <= to, at most 92 days, between 0001-01-01 and 2999-12-31';
  end if;
  -- Same shape check as the dashboard (time-zone.ts), then the zone must load. Cheaper than
  -- scanning pg_timezone_names, which reads every zone file on each call (security audit, #111).
  -- POSIX-style specs (letters then an offset: 'ABC1', 'FOO-3BAR') are refused: each distinct
  -- one would stay in the backend's zone cache forever (unbounded memory per connection). The
  -- real zone files with that shape are allowed by name; Etc/GMT+N has a '/' and is unaffected.
  if p_tz is null or length(p_tz) > 64 or p_tz !~ '^[A-Za-z0-9_+/-]+$'
     or (p_tz ~ '^[A-Za-z]{3,}[+-]?[0-9]'
         and upper(p_tz) not in ('EST5EDT', 'CST6CDT', 'MST7MDT', 'PST8PDT', 'GMT0', 'GMT+0', 'GMT-0'))
  then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end if;
  begin
    perform pg_catalog.timezone(p_tz, pg_catalog.now());
  exception when invalid_parameter_value then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end;
  -- Coarse instant range for the (user_id, started_at) index, widened by a day on each side so
  -- DST and repeated/missing local midnights can never cut off an interval. The exact rule is
  -- the local-date filter below, identical in both functions, so they always agree.
  lower_at := (p_from - 1)::timestamp at time zone 'UTC';
  upper_at := (p_to + 2)::timestamp at time zone 'UTC';

  return query
  select s.domain::text, sum(s.duration_s)::bigint as seconds
  from public.study_sessions s
  where s.user_id = (select auth.uid())
    and s.started_at >= lower_at
    and s.started_at < upper_at
    and (s.started_at at time zone p_tz)::date between p_from and p_to
  group by s.domain
  order by 2 desc, 1;
end;
$$;

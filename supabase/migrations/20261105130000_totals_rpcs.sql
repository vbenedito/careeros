-- Dashboard totals (#8): daily totals and per-domain totals for a period.
-- Spec: specs/v0/04-data-model.md §3 (DATA-10, DATA-11), DASH-06..09.
--
-- Both functions are SECURITY INVOKER: RLS limits them to the caller's rows. They return
-- aggregates only (at most 92 small rows), so raw intervals never leave the database for the
-- dashboard — this keeps responses tiny and fast (and egress near zero).
--
-- Errors (PostgREST → HTTP): PT401 NOT_AUTHENTICATED → 401; 22023 INVALID_RANGE /
-- INVALID_TIME_ZONE → 400.

-- DATA-10: one row per day in [p_from, p_to], zero-filled, by the day the interval started
-- in the viewer's time zone.
create function public.get_daily_totals(p_from date, p_to date, p_tz text)
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
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 92 then
    raise exception 'INVALID_RANGE' using errcode = '22023', detail = 'from <= to, at most 92 days';
  end if;
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end if;
  -- [local midnight of p_from, local midnight after p_to) as instants
  lower_at := p_from::timestamp at time zone p_tz;
  upper_at := (p_to + 1)::timestamp at time zone p_tz;

  return query
  with totals as (
    select (s.started_at at time zone p_tz)::date as day, sum(s.duration_s)::bigint as seconds
    from public.study_sessions s
    where s.user_id = (select auth.uid())          -- also enforced by RLS; lets the index work
      and s.started_at >= lower_at
      and s.started_at < upper_at
    group by 1
  )
  select d::date, coalesce(t.seconds, 0)::bigint
  from generate_series(p_from, p_to, interval '1 day') as d
  left join totals t on t.day = d::date
  order by 1;
end;
$$;

-- DATA-11: same period, grouped by domain, largest first (ties by name for stable output).
create function public.get_domain_totals(p_from date, p_to date, p_tz text)
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
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 92 then
    raise exception 'INVALID_RANGE' using errcode = '22023', detail = 'from <= to, at most 92 days';
  end if;
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'INVALID_TIME_ZONE' using errcode = '22023', detail = 'IANA time zone expected';
  end if;
  -- [local midnight of p_from, local midnight after p_to) as instants
  lower_at := p_from::timestamp at time zone p_tz;
  upper_at := (p_to + 1)::timestamp at time zone p_tz;

  return query
  select s.domain::text, sum(s.duration_s)::bigint as seconds
  from public.study_sessions s
  where s.user_id = (select auth.uid())
    and s.started_at >= lower_at
    and s.started_at < upper_at
  group by s.domain
  order by 2 desc, 1;
end;
$$;

revoke all on function public.get_daily_totals(date, date, text) from public, anon;
revoke all on function public.get_domain_totals(date, date, text) from public, anon;
grant execute on function public.get_daily_totals(date, date, text) to authenticated;
grant execute on function public.get_domain_totals(date, date, text) to authenticated;

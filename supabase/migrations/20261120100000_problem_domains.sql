-- NeetCode problem domains, expand step (#237, NC-a of #233).
-- Spec: specs/v1/01-problems.md PRB-05, PRB-06, PRB-18..20, section 5 step 1;
-- specs/v0/04-data-model.md DATA-06b, DATA-15a, DATA-16; ADR-0011; docs/process/release.md.
--
-- Only widens (expand → deploy → contract):
--   - the sites whose intervals can carry a problem slug become the list PROBLEM_DOMAINS
--     ('leetcode.com', 'neetcode.io'), in private.problem_domains() (read by the v2 parser) and as
--     a literal in study_session_problems_domain_check; db-parity.test.ts keeps both equal to
--     packages/shared;
--   - get_problem_totals_v2 returns the domain per row (DATA-15a). get_problem_totals is NOT
--     changed here: the deployed dashboard still calls it (dropped later, NC-e).
-- Old clients: 0.2.3 (v1 ingest, never sends a slug) and 0.3.0 (v2, slug on leetcode.com only)
-- behave exactly as before; no released client can send a NeetCode slug yet.
-- The history delete (DATA-16, set_problem_tracking) deletes by user_id, so it already covers
-- every site; it is not changed.

-- ---------------------------------------------------------------------------------------------
-- PROBLEM_DOMAINS (PRB-18): the one list, in SQL. IMMUTABLE so the parser can inline it (the table CHECK holds the same list as a literal, kept equal by db-parity.test.ts);
-- changing the list later is a new migration (and an amendment of PRB-18), never an edit.
-- No client needs it: not granted (the definer ingest functions call it).
-- ---------------------------------------------------------------------------------------------
create function private.problem_domains()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array['leetcode.com', 'neetcode.io']::text[];
$$;

revoke all on function private.problem_domains() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- DATA-16: widen the domain check. Every stored row is on leetcode.com, so the new constraint
-- is valid for all of them and is added validated. The table is small; the lock is short.
-- ---------------------------------------------------------------------------------------------
-- The CHECK holds the list as a literal, not a call to private.problem_domains(): a function in a
-- CHECK needs EXECUTE for the inserting role (service_role would get 42501), and replacing the
-- function would never re-validate stored rows. db-parity.test.ts keeps this literal, the
-- function and PROBLEM_DOMAINS equal.
set local lock_timeout = '5s';
alter table public.study_session_problems
  drop constraint study_session_problems_domain_check;
alter table public.study_session_problems
  add constraint study_session_problems_domain_check
  check (domain::text in ('leetcode.com', 'neetcode.io'));

-- ---------------------------------------------------------------------------------------------
-- DATA-06b, PRB-05: the v2 element parser, same body as 20261118100000 except that the slug's
-- domain is checked against private.problem_domains() (exact match on the stored domain, so
-- 'neetcode.io.evil.com', 'notneetcode.io' and 'neetcode.com' are outside). The signature and
-- the out parameters are unchanged, so private.ingest_sessions (v1 and v2) needs no change.
-- ---------------------------------------------------------------------------------------------
create or replace function private.parse_session_element(
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
       or not (domain::text = any (private.problem_domains()))  -- PROBLEM_DOMAINS
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

-- ---------------------------------------------------------------------------------------------
-- DATA-15a: time per problem and site. Same checks, security model (SECURITY INVOKER, empty
-- search_path, STABLE) and grants as get_problem_totals; grouped by (domain, problem_slug), so the
-- same slug on two sites is two rows and is never summed (PRB-19). get_problem_totals stays.
-- ---------------------------------------------------------------------------------------------
create function public.get_problem_totals_v2(p_from date, p_to date, p_tz text)
returns table (domain text, problem_slug text, seconds bigint, last_day date)
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

  -- PRB-11: longest first, ties by domain then slug (byte order, A-Z), at most PROBLEM_LIST_MAX rows.
  return query
  select p.domain::text,
         p.problem_slug,
         sum(s.duration_s)::bigint as seconds,
         max((s.started_at at time zone p_tz)::date) as last_day
  from public.study_sessions s
  join public.study_session_problems p on p.session_id = s.id
  where s.user_id = (select auth.uid())
    and p.user_id = (select auth.uid())
    and s.started_at >= lower_at
    and s.started_at < upper_at
    and (s.started_at at time zone p_tz)::date between p_from and p_to
  group by p.domain, p.problem_slug
  order by 3 desc, p.domain::text collate pg_catalog."C", p.problem_slug collate pg_catalog."C"
  limit 200;
end;
$$;

revoke all on function public.get_problem_totals_v2(date, date, text) from public, anon;
grant execute on function public.get_problem_totals_v2(date, date, text) to authenticated;

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

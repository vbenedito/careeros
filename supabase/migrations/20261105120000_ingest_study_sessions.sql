-- ingest_study_sessions: the only write path for study intervals (#7).
-- Spec: specs/v0/04-data-model.md §3 (DATA-06..09), specs/v0/03-sync.md (SYNC-04..06), ADR-0004.
--
-- Errors use PostgREST's PTxxx codes so the HTTP status is meaningful to the extension:
--   PT401 NOT_AUTHENTICATED  → 401 (AUTH-11: reconnect)
--   PT429 ABUSE_LIMIT        → 429 (SYNC-06: back off 60 min, keep data)
--   22023 INVALID_BATCH      → 400 (client bug: malformed call)
-- Per-element problems are never errors: invalid elements are skipped and simply not returned,
-- and the extension moves them to its local quarantine (SYNC-05).

-- DATA-09: the abuse guard counts the caller's rows inserted in the last hour.
create index study_sessions_user_created_idx on public.study_sessions (user_id, created_at);

-- Parses and validates one batch element. Returns null when the element is invalid for any
-- reason (wrong shape, bad UUID, bad timestamp, bad domain, DATA-02/07 limits), so a single bad
-- element can never abort the batch.
create function private.parse_study_session(element jsonb)
returns public.study_sessions
language plpgsql
stable
set search_path = ''
as $$
declare
  parsed public.study_sessions;
  -- TRK-10: UTC ISO-8601 with whole seconds, e.g. 2026-11-05T09:30:00Z
  iso_seconds constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$';
begin
  if jsonb_typeof(element) is distinct from 'object'
     or jsonb_typeof(element -> 'id') is distinct from 'string'
     or jsonb_typeof(element -> 'device_id') is distinct from 'string'
     or jsonb_typeof(element -> 'domain') is distinct from 'string'
     or jsonb_typeof(element -> 'started_at') is distinct from 'string'
     or jsonb_typeof(element -> 'ended_at') is distinct from 'string'
     or (element ->> 'started_at') !~ iso_seconds
     or (element ->> 'ended_at') !~ iso_seconds then
    return null;
  end if;

  begin
    parsed.id := (element ->> 'id')::uuid;
    parsed.device_id := (element ->> 'device_id')::uuid;
    parsed.domain := (element ->> 'domain')::public.hostname;   -- TRK-03 rules (domain type)
    parsed.started_at := (element ->> 'started_at')::timestamptz;
    parsed.ended_at := (element ->> 'ended_at')::timestamptz;
  exception when others then
    return null;                                               -- e.g. 2026-13-45, bad UUID
  end;

  if parsed.ended_at <= parsed.started_at                              -- DATA-02
     or parsed.ended_at - parsed.started_at > interval '1830 seconds'  -- DATA-02
     or parsed.started_at < now() - interval '30 days'                 -- DATA-07
     or parsed.ended_at > now() + interval '5 minutes' then            -- DATA-07
    return null;
  end if;

  return parsed;
end;
$$;

revoke all on function private.parse_study_session(jsonb) from public, anon, authenticated;

-- SECURITY DEFINER: clients have no INSERT privilege on study_sessions (DATA-05). The function
-- therefore never accepts a user id: it writes and reads only rows of auth.uid().
create function public.ingest_study_sessions(sessions jsonb)
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
  confirmed uuid[];
begin
  -- DATA-06
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if sessions is null or jsonb_typeof(sessions) <> 'array' then
    raise exception 'INVALID_BATCH' using errcode = '22023', detail = 'sessions must be a JSON array';
  end if;
  if jsonb_array_length(sessions) > 200 then
    raise exception 'INVALID_BATCH' using errcode = '22023', detail = 'at most 200 sessions per call';
  end if;

  -- DATA-09 (one indexed count per call)
  if (
    select count(*) from public.study_sessions
    where user_id = caller and created_at > now() - interval '1 hour'
  ) > 10000 then
    raise exception 'ABUSE_LIMIT' using errcode = 'PT429';
  end if;

  -- DATA-07: validate each element independently
  for element in select value from jsonb_array_elements(sessions) loop
    parsed := private.parse_study_session(element);
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

revoke all on function public.ingest_study_sessions(jsonb) from public, anon;
grant execute on function public.ingest_study_sessions(jsonb) to authenticated;

comment on function public.ingest_study_sessions(jsonb) is
  'Idempotent batch upload of closed study intervals for auth.uid(); returns confirmed ids (SYNC-04).';

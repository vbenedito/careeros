-- DATA-01 amended (#145): at most 12 tracked domains per user (was 50).
-- Product owner decision (2026-11-12). Existing lists over the limit are kept: no rows are
-- deleted. Such users can still remove sites (the trigger runs on insert only), but every insert
-- is refused while they have 12 or more.
-- Same function, lock, error code, hint and message format as 20261105100000_core_schema.sql;
-- only the number changes, so released extensions keep mapping the error to LIMIT_REACHED.

create or replace function private.enforce_tracked_domain_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The advisory lock serializes concurrent inserts for the same user so two parallel requests
  -- cannot both pass the count. SECURITY DEFINER so the count sees all of the user's rows.
  perform pg_advisory_xact_lock(hashtextextended('tracked_domains:' || new.user_id::text, 0));
  if (select count(*) from public.tracked_domains where user_id = new.user_id) >= 12 then
    raise exception 'A user can track at most 12 domains'
      using errcode = 'P0001', hint = 'DATA-01';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_tracked_domain_limit() from public, anon, authenticated;

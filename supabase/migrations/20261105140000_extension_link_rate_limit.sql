-- Rate limit for minting extension connection tokens (#13).
-- Spec: specs/v0/02-auth.md AUTH-08, specs/v0/04-data-model.md (private.link_requests).
-- Enforced in Postgres because in-memory counters do not work across serverless instances.

create table private.link_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index link_requests_user_created_idx on private.link_requests (user_id, created_at);

-- Clients never touch the table directly (the private schema is closed to them).
alter table private.link_requests enable row level security;
alter table private.link_requests force row level security;

-- Records one token request for the caller and returns whether it is allowed:
-- at most 5 per rolling minute. Rows older than an hour are pruned on the way.
-- SECURITY DEFINER because the table lives in `private`; it only ever acts on auth.uid().
create function public.consume_extension_link_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  recent integer;
begin
  if caller is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;

  -- Serializes concurrent requests of the same user so they cannot all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('link_requests:' || caller::text, 0));

  delete from private.link_requests
  where user_id = caller and created_at < now() - interval '1 hour';

  select count(*) into recent
  from private.link_requests
  where user_id = caller and created_at > now() - interval '1 minute';

  if recent >= 5 then
    return false;
  end if;

  insert into private.link_requests (user_id) values (caller);
  return true;
end;
$$;

revoke all on function public.consume_extension_link_quota() from public, anon;
grant execute on function public.consume_extension_link_quota() to authenticated;

comment on function public.consume_extension_link_quota() is
  'AUTH-08: records an extension-link token request for auth.uid(); false when over 5/min.';

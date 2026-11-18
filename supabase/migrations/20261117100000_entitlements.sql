-- Entitlements foundation (#177). Spec: specs/v1/02-entitlements.md ENT-01..06; ADR-0012.
-- Every business limit has one owner: the database. A `plans` table holds one row per plan and
-- one column per limit; the DATA-01 trigger reads its number from the caller's plan instead of a
-- literal, and the error carries the limit and the plan. Nothing changes for users: the only
-- plan is `free`, and its limit is the same 12 as in 20261112100000_tracked_domain_limit_12.sql.
--
-- To change a limit later: a new migration with
--   update public.plans set max_tracked_domains = <n> where id = 'free';
-- The parity test (ENT-11) reads the last migration that sets the `free` row.

-- ---------------------------------------------------------------------------------------------
-- ENT-01: plans. Clients may read it, never write it; only migrations change it.
-- ---------------------------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  max_tracked_domains integer not null check (max_tracked_domains > 0)
);

comment on table public.plans is 'One row per plan, one column per limit (ENT-01). Changed only by migrations.';

insert into public.plans (id, max_tracked_domains) values ('free', 12);

alter table public.plans enable row level security;
alter table public.plans force row level security;

-- Deny by default, then grant back read access only (as for the other tables, #6).
revoke all on table public.plans from anon, authenticated;
grant select on table public.plans to authenticated;
-- Supabase also grants service_role broad table privileges by default; only a migration may
-- change plans (ENT-01), so take the write privileges away from it too.
revoke insert, update, delete, truncate on table public.plans from service_role;

-- The table holds no user data: every signed-in user may read every row. There is no INSERT,
-- UPDATE or DELETE grant and no write policy, so clients cannot change a limit.
create policy plans_select_all on public.plans
  for select to authenticated
  using (true);

-- Same guard as the user tables: a Supabase anonymous sign-in carries role `authenticated`
-- (disabled, AUTH-01); refuse it anyway.
create policy plans_no_anonymous on public.plans
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------------------------------
-- ENT-02: the plan of a user. v1 has no per-account plan record: everyone is on `free`.
-- A later per-account plan changes only this function (ENT-12).
-- ---------------------------------------------------------------------------------------------
create or replace function private.plan_of(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select 'free'::text;
$$;

revoke all on function private.plan_of(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- ENT-03, ENT-05, ENT-06: DATA-01 reads its number from the plan.
-- Same lock, errcode (P0001, so the same HTTP status), hint (DATA-01) and message format as
-- before; `detail` is new and additive: {"code":"LIMIT_REACHED","limit":12,"plan":"free"}.
-- Lists that are already over the limit are kept: the trigger runs on insert only, so such
-- users can still remove sites.
-- ---------------------------------------------------------------------------------------------
create or replace function private.enforce_tracked_domain_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limit integer;
begin
  -- The advisory lock serializes concurrent inserts for the same user so two parallel requests
  -- cannot both pass the count. SECURITY DEFINER so the count sees all of the user's rows.
  perform pg_advisory_xact_lock(hashtextextended('tracked_domains:' || new.user_id::text, 0));

  v_plan := private.plan_of(new.user_id);
  select p.max_tracked_domains into v_limit from public.plans p where p.id = v_plan;
  if v_limit is null then
    -- Fail closed: a plan without a row must never mean "no limit".
    raise exception 'Plan % has no limit row', v_plan using errcode = 'P0001', hint = 'ENT-03';
  end if;

  if (select count(*) from public.tracked_domains where user_id = new.user_id) >= v_limit then
    raise exception 'A user can track at most % domains', v_limit
      using errcode = 'P0001',
            hint = 'DATA-01',
            detail = jsonb_build_object('code', 'LIMIT_REACHED', 'limit', v_limit, 'plan', v_plan)::text;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_tracked_domain_limit() from public, anon, authenticated;

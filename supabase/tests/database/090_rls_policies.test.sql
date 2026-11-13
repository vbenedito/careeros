-- Every RLS policy on a public table ties access to the caller (grill S3, SEC-07, DATA-04).
-- A policy whose USING / WITH CHECK expression does not reference auth.uid() would grant rows to
-- everyone it applies to. pg_policies is enumerated, so a policy added later is checked
-- automatically. Exceptions are listed below with a reason and must be RESTRICTIVE (they can
-- only narrow access, never widen it).
begin;
select plan(7);

-- Allow-list: "table.policy" -> reason.
--   tracked_domains.tracked_domains_no_anonymous, study_sessions.study_sessions_no_anonymous:
--     restrictive policies that refuse anonymous-JWT callers (AUTH-01, security hardening); they
--     test the is_anonymous claim, not row ownership. Ownership is enforced by the permissive
--     *_own policies, which are checked by the rule.
create temp table policy_exceptions (policy_key text primary key, reason text not null) on commit drop;
insert into policy_exceptions values
  ('tracked_domains.tracked_domains_no_anonymous', 'restrictive anonymous-JWT refusal (AUTH-01)'),
  ('study_sessions.study_sessions_no_anonymous', 'restrictive anonymous-JWT refusal (AUTH-01)');

-- An expression "binds to the caller" when it compares an owner column (user_id or id, optionally
-- table-qualified) with auth.uid(), in either order, bare or wrapped in a subselect as pg_policies
-- prints it ("( SELECT auth.uid() AS uid)"). Merely mentioning auth.uid() is not enough:
-- `auth.uid() is not null` would grant every row to any signed-in user.
create function pg_temp.binds_to_caller(expr text)
returns boolean
language sql
immutable
as $$
  select expr is null or expr ~* (
    '(\m(\w+\.)?(user_id|id)\s*=\s*\(?\s*(select\s+)?auth\.uid\(\)(\s+as\s+uid)?\s*\)?)'
    || '|'
    || '(auth\.uid\(\)(\s+as\s+uid)?\s*\)?\s*=\s*(\w+\.)?(user_id|id)\M)'
  );
$$;

-- "table.policy" of every non-excepted public policy with an expression that does not bind to the caller.
create function pg_temp.unbound_policies()
returns text[]
language sql
stable
as $$
  select array_agg(tablename::text || '.' || policyname::text order by tablename, policyname)
  from pg_policies p
  where schemaname = 'public'
    and not exists (select 1 from policy_exceptions e where e.policy_key = p.tablename || '.' || p.policyname)
    and not (pg_temp.binds_to_caller(qual) and pg_temp.binds_to_caller(with_check));
$$;

select is(
  pg_temp.unbound_policies(),
  null::text[],
  'TEST-07 SEC-07 every RLS policy on a public table compares its owner column with auth.uid() in USING and WITH CHECK'
);

-- Negative cases: policies that mention auth.uid() without tying rows to the caller must be caught.
create policy bad_not_null on public.tracked_domains for select to authenticated
  using (auth.uid() is not null);
create policy bad_other_column on public.study_sessions for select to authenticated
  using (device_id = (select auth.uid()));
select is(
  pg_temp.unbound_policies(),
  array['study_sessions.bad_other_column', 'tracked_domains.bad_not_null'],
  'TEST-07 SEC-07 policies using auth.uid() is not null, or a non-owner column, fail the rule'
);
drop policy bad_not_null on public.tracked_domains;
drop policy bad_other_column on public.study_sessions;
select is(pg_temp.unbound_policies(), null::text[], 'TEST-07 SEC-07 the negative cases are removed again');

select is(
  (select array_agg(tablename || '.' || policyname order by tablename, policyname)
   from pg_policies
   where schemaname = 'public' and qual is null and with_check is null),
  null::text[],
  'TEST-07 SEC-07 no policy on a public table lacks both USING and WITH CHECK'
);

select is(
  (select array_agg(e.policy_key order by e.policy_key)
   from policy_exceptions e
   where not exists (
     select 1 from pg_policies p
     where p.schemaname = 'public'
       and p.tablename || '.' || p.policyname = e.policy_key
       and p.permissive = 'RESTRICTIVE'
   )),
  null::text[],
  'TEST-07 SEC-07 every allow-listed exception exists and is a RESTRICTIVE policy'
);

select ok(
  (select count(*) from pg_policies where schemaname = 'public') >= 4,
  'TEST-07 SEC-07 the enumeration sees the policies (guards against an empty pg_policies read)'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null::text[],
  'TEST-07 SEC-07 every public table has row level security enabled'
);

select * from finish();
rollback;

-- Entitlements foundation (#177): ENT-01..06 (specs/v1/02-entitlements.md), run as real roles.
-- The limit comes from public.plans through private.plan_of, and the error carries the limit and
-- the plan without changing the errcode or the hint that released extensions rely on.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select tests.create_user('erin');
select tests.create_user('frank');

-- =============================================================================================
-- ENT-01: the plans table
-- =============================================================================================
select has_table('public', 'plans', 'ENT-01 public.plans exists');
select results_eq(
  $$ select id, max_tracked_domains from public.plans order by id $$,
  $$ values ('free'::text, 12) $$,
  'ENT-01 exactly one plan: free with max_tracked_domains = 12'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.plans'::regclass),
  'ENT-01 plans has RLS enabled and forced'
);
select ok(
  has_table_privilege('authenticated', 'public.plans', 'select')
  and not has_table_privilege('authenticated', 'public.plans', 'insert')
  and not has_table_privilege('authenticated', 'public.plans', 'update')
  and not has_table_privilege('authenticated', 'public.plans', 'delete')
  and not has_table_privilege('authenticated', 'public.plans', 'truncate'),
  'ENT-01 authenticated may only select from plans'
);
select ok(
  not has_table_privilege('anon', 'public.plans', 'select')
  and not has_table_privilege('anon', 'public.plans', 'insert'),
  'ENT-01 anon has no access to plans'
);
select ok(
  not has_table_privilege('service_role', 'public.plans', 'insert')
  and not has_table_privilege('service_role', 'public.plans', 'update')
  and not has_table_privilege('service_role', 'public.plans', 'delete')
  and not has_table_privilege('service_role', 'public.plans', 'truncate'),
  'ENT-01 service_role cannot write plans: only a migration changes them'
);
select policies_are('public', 'plans', array['plans_select_all', 'plans_no_anonymous'],
  'ENT-01 plans has exactly a read policy and the anonymous guard');
select throws_ok(
  $$ insert into public.plans (id, max_tracked_domains, max_problem_rules) values ('x', -1, 5) $$,
  '23514', null, 'ENT-01 a plan limit must be positive (#285: every plan row now sets max_problem_rules too)'
);

-- Signed-in clients read the plans, and cannot change them.
select tests.authenticate_as(tests.user_id('erin'));
select results_eq(
  $$ select id, max_tracked_domains from public.plans $$,
  $$ values ('free'::text, 12) $$,
  'ENT-01 a signed-in client reads the free plan'
);
select throws_ok(
  $$ insert into public.plans (id, max_tracked_domains) values ('pro', 99) $$,
  '42501', null, 'ENT-01 a client cannot insert a plan'
);
select throws_ok(
  $$ update public.plans set max_tracked_domains = 99 where id = 'free' $$,
  '42501', null, 'ENT-01 a client cannot raise a limit'
);
select throws_ok(
  $$ delete from public.plans where id = 'free' $$,
  '42501', null, 'ENT-01 a client cannot delete a plan'
);
select tests.clear_authentication();
reset role;

select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.plans $$,
  '42501', null, 'ENT-01 anon cannot read plans'
);
select tests.clear_authentication();
reset role;

-- A Supabase anonymous sign-in carries role authenticated; the restrictive policy hides the rows.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.user_id('erin'), 'role', 'authenticated', 'is_anonymous', true)::text,
  true
);
set local role authenticated;
select is((select count(*)::int from public.plans), 0,
  'ENT-01 an anonymous sign-in sees no plans');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- ENT-02: private.plan_of
-- =============================================================================================
select is(private.plan_of(tests.user_id('erin')), 'free', 'ENT-02 every account is on the free plan');
select is(private.plan_of(gen_random_uuid()), 'free', 'ENT-02 a user without any record is on free');
select ok(
  not has_function_privilege('authenticated', 'private.plan_of(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.plan_of(uuid)', 'execute'),
  'ENT-02 clients cannot call private.plan_of'
);
select ok(
  (select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.plan_of(uuid)'::regprocedure),
  'ENT-02 plan_of pins an empty search_path'
);
select ok(
  (select 'search_path=""' = any(proconfig) from pg_proc
   where oid = 'private.enforce_tracked_domain_limit()'::regprocedure),
  'ENT-03 the limit trigger keeps its empty search_path'
);

-- =============================================================================================
-- ENT-03, ENT-05, ENT-06: the limit and the error, as the client sees them
-- =============================================================================================
select tests.authenticate_as(tests.user_id('erin'));
select lives_ok(
  $$ insert into public.tracked_domains (domain)
     select 'site' || n || '.test' from generate_series(1, 12) as n $$,
  'ENT-03 the number in the free row (12) domains are accepted'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('site13.test') $$,
  'P0001', 'A user can track at most 12 domains',
  'ENT-05 ENT-06 the 13th is refused with the same errcode and message as before'
);

-- Capture the whole error of the 13th insert (what PostgREST turns into code, message, hint, details).
do $$
declare
  v_state text;
  v_hint text;
  v_detail text;
begin
  insert into public.tracked_domains (domain) values ('site13.test');
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint,
    v_detail = pg_exception_detail;
  perform set_config('tests.err_state', v_state, true);
  perform set_config('tests.err_hint', v_hint, true);
  perform set_config('tests.err_detail', v_detail, true);
end;
$$;
select is(current_setting('tests.err_state'), 'P0001', 'ENT-05 ENT-06 errcode is P0001 (HTTP status unchanged)');
select is(current_setting('tests.err_hint'), 'DATA-01', 'ENT-05 ENT-06 hint is DATA-01 (released extension 0.2.3 keeps working)');
select is(
  current_setting('tests.err_detail')::jsonb,
  '{"code":"LIMIT_REACHED","limit":12,"plan":"free"}'::jsonb,
  'ENT-05 detail carries the code, the limit and the plan'
);

-- Unique-before-limit: under the limit a duplicate is a unique violation; at the limit the BEFORE
-- trigger answers first, exactly as before (the dashboard checks for an existing site itself).
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('site1.test') $$,
  'P0001', 'A user can track at most 12 domains',
  'DATA-01 ENT-06 at the limit a duplicate gets DATA-01, not 23505'
);
select lives_ok(
  $$ delete from public.tracked_domains where domain = 'site12.test' $$,
  'ENT-03 at the limit, a domain can be removed'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('site1.test') $$,
  '23505', null, 'ENT-03 under the limit a duplicate is still a unique violation (23505)'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- ENT-03: changing the free row changes the limit and the error, with no other change
-- =============================================================================================
update public.plans set max_tracked_domains = 13 where id = 'free';
select tests.authenticate_as(tests.user_id('erin'));
select lives_ok(
  $$ insert into public.tracked_domains (domain) values ('site12.test') $$,
  'ENT-03 with the free row at 13, the 12th domain is accepted (erin had 11)'
);
select lives_ok(
  $$ insert into public.tracked_domains (domain) values ('site13.test') $$,
  'ENT-03 with the free row at 13, the 13th domain is accepted'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('site14.test') $$,
  'P0001', 'A user can track at most 13 domains',
  'ENT-05 the message carries the plan''s number (13)'
);
select tests.clear_authentication();
reset role;

-- A lowered limit keeps existing rows: erin has 13, the limit is now 5. Deletes work, inserts do not.
update public.plans set max_tracked_domains = 5 where id = 'free';
select tests.authenticate_as(tests.user_id('erin'));
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('site14.test') $$,
  'P0001', 'A user can track at most 5 domains',
  'ENT-03 with the free row at 5 and 13 rows, an insert is refused'
);
select is((select count(*)::int from public.tracked_domains), 13,
  'DATA-01 ENT-03 lowering the limit keeps the existing rows');
select lives_ok(
  $$ delete from public.tracked_domains where domain in ('site1.test', 'site2.test') $$,
  'DATA-01 ENT-03 over the limit, deletes are allowed'
);
select tests.clear_authentication();
reset role;

-- Fail closed: if the plan row were missing, the trigger must not mean "no limit".
delete from public.plans where id = 'free';
select tests.authenticate_as(tests.user_id('frank'));
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('first.test') $$,
  'P0001', 'Plan free has no limit row',
  'ENT-03 a plan without a row refuses the insert instead of allowing it'
);
select tests.clear_authentication();
reset role;

select * from finish();
rollback;

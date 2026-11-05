-- RLS and grant tests for #6 (DATA-04, DATA-05, SEC-07), run as real client roles.
begin;
select plan(38);

select tests.create_user('alice');
select tests.create_user('bob');

-- Seed rows as the test superuser.
insert into public.tracked_domains (user_id, domain)
values
  (tests.user_id('alice'), 'leetcode.com'),
  (tests.user_id('bob'), 'neetcode.io');

insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
values
  ('a0000000-0000-4000-8000-000000000001', tests.user_id('alice'), gen_random_uuid(),
   'leetcode.com', '2026-11-05 09:00:00+00', '2026-11-05 09:30:00+00'),
  ('b0000000-0000-4000-8000-000000000001', tests.user_id('bob'), gen_random_uuid(),
   'neetcode.io', '2026-11-05 09:00:00+00', '2026-11-05 09:20:00+00');

-- =============================================================================================
-- anon (publishable key only): no access at all
-- =============================================================================================
select tests.authenticate_as_anon();

select throws_ok($$ select * from public.tracked_domains $$, '42501', null,
  'anon cannot read tracked_domains');
select throws_ok($$ select * from public.study_sessions $$, '42501', null,
  'anon cannot read study_sessions');
select throws_ok($$ insert into public.tracked_domains (user_id, domain)
  values (tests.user_id('alice'), 'evil.com') $$, '42501', null,
  'anon cannot insert tracked_domains');

select tests.clear_authentication();
reset role;

-- =============================================================================================
-- alice (authenticated): tracked_domains — only her own rows (DATA-04)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('alice'));

select is(auth.uid(), tests.user_id('alice'), 'auth.uid() is alice');

select results_eq(
  $$ select domain::text from public.tracked_domains $$,
  $$ values ('leetcode.com') $$,
  'DATA-04 alice sees only her tracked domains'
);

select lives_ok(
  $$ insert into public.tracked_domains (domain) values ('docs.python.org') $$,
  'DATA-04 alice can add a domain (user_id defaults to auth.uid())'
);
select is(
  (select user_id from public.tracked_domains where domain = 'docs.python.org'),
  tests.user_id('alice'),
  'the new row belongs to alice'
);

select throws_ok(
  $$ insert into public.tracked_domains (user_id, domain) values (tests.user_id('bob'), 'evil.com') $$,
  '42501', null,
  'DATA-04 alice cannot add a domain for bob'
);
select throws_ok(
  $$ insert into public.tracked_domains (id, domain) values (gen_random_uuid(), 'custom-id.com') $$,
  '42501', null,
  'clients cannot choose id (INSERT is granted on domain only)'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain, created_at) values ('backdated.com', '2000-01-01') $$,
  '42501', null,
  'clients cannot choose created_at'
);

select lives_ok(
  $$ delete from public.tracked_domains where domain = 'neetcode.io' $$,
  'deleting bob''s domain does not error...'
);
select lives_ok(
  $$ delete from public.tracked_domains where domain = 'docs.python.org' $$,
  'DATA-04 alice can delete her own domain'
);
select is_empty(
  $$ select 1 from public.tracked_domains where domain = 'docs.python.org' $$,
  'her domain is gone'
);

select throws_ok(
  $$ update public.tracked_domains set domain = 'changed.com' $$,
  '42501', null,
  'DATA-04 no UPDATE on tracked_domains'
);
select throws_ok($$ truncate public.tracked_domains $$, '42501', null,
  'no TRUNCATE on tracked_domains');

-- =============================================================================================
-- alice (authenticated): study_sessions — read-only, own rows (DATA-05)
-- =============================================================================================
select results_eq(
  $$ select id from public.study_sessions $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid) $$,
  'DATA-05 alice sees only her intervals'
);
select is_empty(
  $$ select 1 from public.study_sessions where id = 'b0000000-0000-4000-8000-000000000001' $$,
  'DATA-05 alice cannot read bob''s interval by id'
);

select throws_ok(
  $$ insert into public.study_sessions (id, device_id, domain, started_at, ended_at)
     values (gen_random_uuid(), gen_random_uuid(), 'leetcode.com',
             '2026-11-05 10:00:00+00', '2026-11-05 10:10:00+00') $$,
  '42501', null,
  'DATA-05 direct INSERT into study_sessions is denied (RPC is the only write path)'
);
select throws_ok(
  $$ update public.study_sessions set ended_at = ended_at + interval '1 minute' $$,
  '42501', null,
  'DATA-03 intervals cannot be updated'
);
select throws_ok(
  $$ delete from public.study_sessions $$,
  '42501', null,
  'DATA-03 intervals cannot be deleted by clients'
);
select throws_ok($$ truncate public.study_sessions $$, '42501', null,
  'no TRUNCATE on study_sessions');

-- =============================================================================================
-- DATA-01 still holds for real clients (the trigger does not depend on RLS)
-- =============================================================================================
select lives_ok(
  $$ insert into public.tracked_domains (domain)
     select 'site' || n || '.test' from generate_series(1, 49) as n $$,
  'alice fills up to 50 domains'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('one-too-many.test') $$,
  'P0001', 'A user can track at most 50 domains',
  'DATA-01 the 51st domain is rejected for authenticated users too'
);

select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Back as superuser: bob's data was untouched by alice
-- =============================================================================================
select is(
  (select count(*)::int from public.tracked_domains where user_id = tests.user_id('bob')),
  1, 'bob''s domain survived alice''s delete attempt'
);
select is(
  (select count(*)::int from public.study_sessions),
  2, 'no interval was added, changed or removed by clients'
);

-- bob sees only his own rows
select tests.authenticate_as(tests.user_id('bob'));
select results_eq(
  $$ select domain::text from public.tracked_domains $$,
  $$ values ('neetcode.io') $$,
  'bob sees only his tracked domains'
);
select results_eq(
  $$ select id from public.study_sessions $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'bob sees only his intervals'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Grants are exactly the spec (SEC-07)
-- =============================================================================================
select table_privs_are('public', 'tracked_domains', 'authenticated',
  array['SELECT', 'DELETE'], 'authenticated: SELECT/DELETE on tracked_domains (INSERT is per column)');
select column_privs_are('public', 'tracked_domains', 'domain', 'authenticated',
  array['SELECT', 'INSERT'], 'authenticated: INSERT only on tracked_domains.domain');
select column_privs_are('public', 'tracked_domains', 'user_id', 'authenticated',
  array['SELECT'], 'authenticated: cannot insert tracked_domains.user_id');
select table_privs_are('public', 'study_sessions', 'authenticated',
  array['SELECT'], 'authenticated: SELECT only on study_sessions');
select table_privs_are('public', 'tracked_domains', 'anon', array[]::text[],
  'anon: nothing on tracked_domains');
select table_privs_are('public', 'study_sessions', 'anon', array[]::text[],
  'anon: nothing on study_sessions');

-- =============================================================================================
-- Exact policy set, functions and default privileges
-- =============================================================================================
select policies_are('public', 'tracked_domains',
  array['tracked_domains_select_own', 'tracked_domains_insert_own', 'tracked_domains_delete_own'],
  'tracked_domains has exactly the DATA-04 policies');
select policies_are('public', 'study_sessions', array['study_sessions_select_own'],
  'study_sessions has exactly the DATA-05 policy');
select ok(
  not has_function_privilege('authenticated', 'private.enforce_tracked_domain_limit()', 'execute')
  and not has_function_privilege('anon', 'private.enforce_tracked_domain_limit()', 'execute'),
  'clients cannot call the private trigger function'
);
-- The limit trigger is SECURITY DEFINER owned by postgres and counts under FORCE RLS; that is
-- only complete because postgres bypasses RLS. Fail loudly if that ever changes.
select ok(
  (select r.rolbypassrls from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'private.enforce_tracked_domain_limit()'::regprocedure),
  'the limit trigger owner bypasses RLS, so its count sees every row of the user'
);
-- A function created by a future migration is not callable by clients until granted.
create function public.tmp_new_rpc() returns int language sql as $$ select 1 $$;
select ok(
  not has_function_privilege('anon', 'public.tmp_new_rpc()', 'execute')
  and not has_function_privilege('authenticated', 'public.tmp_new_rpc()', 'execute'),
  'new functions in public are not executable by anon/authenticated by default'
);

select * from finish();
rollback;

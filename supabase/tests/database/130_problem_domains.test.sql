-- Problem domains, expand step (#237, NC-a of #233): LeetCode and NeetCode.
-- Covers DATA-06b, DATA-15, DATA-15a, DATA-16, PRB-05, PRB-16, PRB-18, PRB-19, PRB-20 and
-- acceptance 8 (database part), 9, 11, 12 of specs/v1/01-problems.md.
begin;
select plan(66);

select tests.create_user('kai');
select tests.create_user('lea');
select tests.create_user('max');
select tests.create_user('nia');
select tests.create_user('oli');

-- =============================================================================================
-- PRB-18: the one list in SQL, and the widened check (DATA-16)
-- =============================================================================================
select is(private.problem_domains(), array['leetcode.com', 'neetcode.io'],
  'PRB-18 private.problem_domains() is exactly leetcode.com and neetcode.io');
select ok(not has_function_privilege('authenticated', 'private.problem_domains()', 'execute')
  and not has_function_privilege('anon', 'private.problem_domains()', 'execute'),
  'PRB-18 clients cannot call private.problem_domains()');
select ok(
  (select convalidated and position('neetcode.io' in pg_get_constraintdef(oid)) > 0
   from pg_constraint
   where conrelid = 'public.study_session_problems'::regclass
     and conname = 'study_session_problems_domain_check'),
  'DATA-16 the domain check exists and is validated');

-- Direct inserts run as the test superuser (clients cannot insert at all).
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
select ('c0000000-0000-4000-8000-00000000000' || n)::uuid, tests.user_id('nia'), gen_random_uuid(), d,
       now() - interval '3 hours', now() - interval '2 hours 50 minutes'
from (values (1, 'leetcode.com'), (2, 'neetcode.io'), (3, 'neetcode.com'),
             (4, 'notneetcode.io'), (5, 'neetcode.io.evil.com'), (6, 'app.neetcode.io')) as v(n, d);

select lives_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000001', tests.user_id('nia'), 'leetcode.com', 'two-sum') $$,
  'DATA-16 a slug row on leetcode.com is still accepted');
select lives_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000002', tests.user_id('nia'), 'neetcode.io', 'two-integer-sum') $$,
  'DATA-16 PRB-18 a slug row on neetcode.io is accepted by the widened check');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000003', tests.user_id('nia'), 'neetcode.com', 'two-sum') $$,
  '23514', null, 'DATA-16 PRB-05 neetcode.com is refused by the check');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000004', tests.user_id('nia'), 'notneetcode.io', 'two-sum') $$,
  '23514', null, 'DATA-16 PRB-05 notneetcode.io is refused by the check');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000005', tests.user_id('nia'), 'neetcode.io.evil.com', 'two-sum') $$,
  '23514', null, 'DATA-16 PRB-05 neetcode.io.evil.com is refused by the check');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000006', tests.user_id('nia'), 'app.neetcode.io', 'two-sum') $$,
  '23514', null, 'DATA-16 PRB-05 a subdomain such as app.neetcode.io is not in the list: refused by the check');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('c0000000-0000-4000-8000-000000000002', tests.user_id('oli'), 'neetcode.io', 'two-sum') $$,
  '23503', null, 'DATA-16 the composite FK still refuses a neetcode.io slug row for another user''s session');

-- =============================================================================================
-- Definitions and grants of get_problem_totals_v2 (DATA-15a): same security model as v1
-- =============================================================================================
select has_function('public', 'get_problem_totals_v2', array['date', 'date', 'text'],
  'DATA-15a get_problem_totals_v2 exists');
select has_function('public', 'get_problem_totals', array['date', 'date', 'text'],
  'DATA-15a get_problem_totals stays until the contract step (NC-e)');
select is(
  (select pg_get_function_result(oid) from pg_proc
   where oid = 'public.get_problem_totals_v2(date, date, text)'::regprocedure),
  'TABLE(domain text, problem_slug text, seconds bigint, last_day date)',
  'DATA-15a v2 returns domain, problem_slug, seconds, last_day');
select is(
  (select pg_get_function_result(oid) from pg_proc
   where oid = 'public.get_problem_totals(date, date, text)'::regprocedure),
  'TABLE(problem_slug text, seconds bigint, last_day date)',
  'DATA-15 get_problem_totals keeps its return type');
select isnt_definer('public', 'get_problem_totals_v2', array['date', 'date', 'text'],
  'DATA-15a v2 is SECURITY INVOKER');
select is(
  (select row(prosecdef, provolatile, proconfig, prolang, proacl)::text from pg_proc
   where oid = 'public.get_problem_totals_v2(date, date, text)'::regprocedure),
  (select row(prosecdef, provolatile, proconfig, prolang, proacl)::text from pg_proc
   where oid = 'public.get_problem_totals(date, date, text)'::regprocedure),
  'DATA-15a v2 has the same security mode, volatility, search_path, language and grants (ACL) as get_problem_totals');
select ok('search_path=""' = any ((select proconfig from pg_proc
   where oid = 'public.get_problem_totals_v2(date, date, text)'::regprocedure)),
  'DATA-15a v2 pins an empty search_path');
select ok(has_function_privilege('authenticated', 'public.get_problem_totals_v2(date, date, text)', 'execute'),
  'DATA-15a authenticated can call v2');
select ok(not has_function_privilege('anon', 'public.get_problem_totals_v2(date, date, text)', 'execute'),
  'DATA-15a anon cannot call v2');
select ok(not has_function_privilege('public', 'public.get_problem_totals_v2(date, date, text)', 'execute'),
  'DATA-15a PUBLIC has no EXECUTE on v2');

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.get_problem_totals_v2(current_date, current_date, 'UTC') $$,
  '42501', null, 'DATA-15a anon is refused by privileges');
select tests.clear_authentication();
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select * from public.get_problem_totals_v2(current_date, current_date, 'UTC') $$,
  'PT401', 'NOT_AUTHENTICATED', 'DATA-15a a request without auth.uid() is rejected');
reset role;
select tests.clear_authentication();

-- =============================================================================================
-- Ingest v2 stores a neetcode.io slug; a domain outside the list makes only that element
-- invalid (acceptance 9, DATA-06b)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('lea'));
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 lea turns the setting on');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('13000000-0000-4000-8000-000000000001', 'leetcode.com', interval '20 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('13000000-0000-4000-8000-000000000002', 'neetcode.io', interval '19 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('13000000-0000-4000-8000-000000000003', 'neetcode.io', interval '18 hours', interval '10 minutes'),
    tests.session('13000000-0000-4000-8000-000000000004', 'neetcode.com', interval '17 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('13000000-0000-4000-8000-000000000005', 'notneetcode.io', interval '16 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('13000000-0000-4000-8000-000000000006', 'neetcode.io.evil.com', interval '15 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('13000000-0000-4000-8000-000000000007', 'app.neetcode.io', interval '14 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('13000000-0000-4000-8000-000000000008', 'leetcode.cn', interval '13 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('13000000-0000-4000-8000-000000000009', 'neetcode.com', interval '12 hours', interval '10 minutes'),
    tests.session('13000000-0000-4000-8000-00000000000a', 'NeetCode.io', interval '11 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}'
  )),
  jsonb_build_object(
    'confirmed', jsonb_build_array(
      '13000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002',
      '13000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000009'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', '13000000-0000-4000-8000-000000000004', 'reason', 'invalid'),
      jsonb_build_object('id', '13000000-0000-4000-8000-000000000005', 'reason', 'invalid'),
      jsonb_build_object('id', '13000000-0000-4000-8000-000000000006', 'reason', 'invalid'),
      jsonb_build_object('id', '13000000-0000-4000-8000-000000000007', 'reason', 'invalid'),
      jsonb_build_object('id', '13000000-0000-4000-8000-000000000008', 'reason', 'invalid'),
      jsonb_build_object('id', '13000000-0000-4000-8000-00000000000a', 'reason', 'invalid'))),
  'PRB-05 DATA-06b a neetcode.io slug is kept; a slug on neetcode.com, notneetcode.io, neetcode.io.evil.com, app.neetcode.io or leetcode.cn or NeetCode.io (case) makes only that element invalid; the same domains without a slug are stored (PRB-07)'
);
select results_eq(
  $$ select session_id::text, domain::text, problem_slug from public.study_session_problems order by 1 $$,
  $$ values ('13000000-0000-4000-8000-000000000001', 'leetcode.com', 'two-sum'),
            ('13000000-0000-4000-8000-000000000002', 'neetcode.io', 'two-integer-sum') $$,
  'PRB-19 DATA-16 acceptance 8: one slug row per site, each with its own domain and slug; nothing else is stored'
);
select is(
  (select count(*)::int from public.study_sessions
   where id::text like '13000000-%' and domain::text in ('neetcode.com', 'neetcode.io')),
  3, 'PRB-07 the time of neetcode.io and of the domains outside the list is stored');
-- a retry is confirmed again and adds nothing
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('13000000-0000-4000-8000-000000000002', 'neetcode.io', interval '19 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}')),
  jsonb_build_object('confirmed', jsonb_build_array('13000000-0000-4000-8000-000000000002'), 'rejected', '[]'::jsonb),
  'SYNC-04 a retry of a stored neetcode.io interval is confirmed again');
select is((select count(*)::int from public.study_session_problems), 2,
  'DATA-16 the retry added no slug row');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Old clients (PRB-20, acceptance 11) and acceptance 12 (setting off)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('kai'));
-- Setting off (no row): the slug is dropped and the time kept, also on neetcode.io.
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('14000000-0000-4000-8000-000000000001', 'neetcode.io', interval '9 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}')) -> 'confirmed',
  jsonb_build_array('14000000-0000-4000-8000-000000000001'),
  'PRB-07 acceptance 12 with the setting off the neetcode.io interval is confirmed...');
select is((select count(*)::int from public.study_session_problems), 0,
  'DATA-14 acceptance 12 ...without a slug');
-- Extension 0.2.3 (v1) never stores a slug, also with the setting on and on neetcode.io.
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 kai turns the setting on');
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('14000000-0000-4000-8000-000000000002', 'neetcode.io', interval '8 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('14000000-0000-4000-8000-000000000003', 'leetcode.com', interval '7 hours', interval '10 minutes')
      || '{"problem": "two-sum"}')),
  array['14000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000003']::uuid[],
  'PRB-20 extension 0.2.3 (v1) still returns uuid[] and confirms both intervals');
select is((select count(*)::int from public.study_session_problems), 0,
  'PRB-10 PRB-20 the v1 function stores no slug, on either site');
-- Extension 0.3.0 fixture: a leetcode.com interval with a slug and a neetcode.io interval without.
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('14000000-0000-4000-8000-000000000004', 'leetcode.com', interval '6 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('14000000-0000-4000-8000-000000000005', 'neetcode.io', interval '5 hours', interval '10 minutes'))),
  jsonb_build_object('confirmed', jsonb_build_array('14000000-0000-4000-8000-000000000004',
                                                    '14000000-0000-4000-8000-000000000005'),
                     'rejected', '[]'::jsonb),
  'PRB-20 acceptance 11 the 0.3.0 batch (leetcode.com with slug, neetcode.io without) is confirmed, nothing rejected');
select results_eq(
  $$ select session_id::text, domain::text, problem_slug from public.study_session_problems $$,
  $$ values ('14000000-0000-4000-8000-000000000004', 'leetcode.com', 'two-sum') $$,
  'PRB-20 acceptance 11 exactly one slug row, the leetcode.com one');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- get_problem_totals_v2 with two sites (DATA-15a, PRB-19, acceptance 10)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('max'));
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 max turns the setting on');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('15000000-0000-4000-8000-000000000001', 'leetcode.com', interval '6 hours', interval '20 minutes')
      || '{"problem": "two-sum"}',
    tests.session('15000000-0000-4000-8000-000000000002', 'neetcode.io', interval '5 hours', interval '5 minutes')
      || '{"problem": "two-sum"}',
    tests.session('15000000-0000-4000-8000-000000000003', 'neetcode.io', interval '4 hours', interval '7 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('15000000-0000-4000-8000-000000000004', 'leetcode.com', interval '3 hours', interval '3 minutes')
      || '{"problem": "alpha-c"}',
    tests.session('15000000-0000-4000-8000-000000000005', 'neetcode.io', interval '2 hours 30 minutes', interval '3 minutes')
      || '{"problem": "alpha-b"}',
    tests.session('15000000-0000-4000-8000-000000000006', 'neetcode.io', interval '2 hours', interval '3 minutes')
      || '{"problem": "alpha-a"}',
    tests.session('15000000-0000-4000-8000-000000000007', 'neetcode.io', interval '1 hour', interval '10 minutes')
  )) -> 'rejected',
  '[]'::jsonb, 'max stores seven intervals, six with a slug, on two sites');

select results_eq(
  $$ select domain, problem_slug, seconds, last_day
     from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC') $$,
  $$ values ('leetcode.com'::text, 'two-sum'::text, 1200::bigint, ((now() - interval '6 hours') at time zone 'UTC')::date),
            ('neetcode.io', 'two-integer-sum', 420, ((now() - interval '4 hours') at time zone 'UTC')::date),
            ('neetcode.io', 'two-sum', 300, ((now() - interval '5 hours') at time zone 'UTC')::date),
            ('leetcode.com', 'alpha-c', 180, ((now() - interval '3 hours') at time zone 'UTC')::date),
            ('neetcode.io', 'alpha-a', 180, ((now() - interval '2 hours') at time zone 'UTC')::date),
            ('neetcode.io', 'alpha-b', 180, ((now() - interval '2 hours 30 minutes') at time zone 'UTC')::date) $$,
  'DATA-15a PRB-11 PRB-19 acceptance 10: the same slug on two sites is two rows (never summed); longest first, ties by domain then slug; only the caller''s rows'
);
select is(
  (select count(*)::int from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC')
   where problem_slug = 'two-sum'),
  2, 'PRB-19 two-sum appears once per site');
select is(
  (select array_agg(problem_slug order by problem_slug)
   from public.get_problem_totals_v2(current_date - 400, current_date - 350, 'UTC')),
  null::text[], 'DATA-15a a period without intervals has no rows');
select is(
  (select count(*)::int from public.get_problem_totals_v2(current_date - 6, current_date + 1, 'Asia/Tokyo')),
  6, 'DATA-15a a valid IANA time zone is accepted');
select throws_ok($$ select * from public.get_problem_totals_v2(current_date - 92, current_date, 'UTC') $$,
  '22023', 'INVALID_RANGE', 'DATA-15a ranges over 92 days are rejected as in DATA-10');
select throws_ok($$ select * from public.get_problem_totals_v2(current_date, current_date - 1, 'UTC') $$,
  '22023', 'INVALID_RANGE', 'DATA-15a from after to is rejected');
select throws_ok($$ select * from public.get_problem_totals_v2(null, current_date, 'UTC') $$,
  '22023', 'INVALID_RANGE', 'DATA-15a a null date is rejected');
select throws_ok($$ select * from public.get_problem_totals_v2(current_date, current_date, 'Mars/Base1') $$,
  '22023', 'INVALID_TIME_ZONE', 'DATA-15a bad time zones are rejected as in DATA-10');
select throws_ok($$ select * from public.get_problem_totals_v2(current_date, current_date, null) $$,
  '22023', 'INVALID_TIME_ZONE', 'DATA-15a a null time zone is rejected');

-- get_problem_totals (DATA-15) is unchanged: still three columns, still grouped by slug alone.
-- Until the dashboard moves to v2 no NeetCode slug exists in production (rollout section 5), so
-- this is not user-visible; it is dropped in NC-e together with this test.
select results_eq(
  $$ select problem_slug, seconds from public.get_problem_totals(current_date - 6, current_date, 'UTC') $$,
  $$ values ('two-sum'::text, 1500::bigint), ('two-integer-sum', 420), ('alpha-a', 180), ('alpha-b', 180), ('alpha-c', 180) $$,
  'DATA-15 get_problem_totals still works and is unchanged: grouped by slug alone (so it adds the two sites; v2 is the per-site function)');
select is(
  (select sum(seconds) from public.get_problem_totals(current_date - 6, current_date, 'UTC')),
  (select sum(seconds) from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC')),
  'DATA-15 DATA-15a v1 and v2 account for the same total time');

-- RLS: another user's rows never appear, on either site.
select is((select count(*)::int from public.study_session_problems), 6,
  'DATA-16 RLS: max sees only his own six slug rows (not lea''s or kai''s, on either site)');
select is((select count(*)::int from public.study_session_problems where domain::text = 'neetcode.io'), 4,
  'DATA-16 RLS: max reads his own neetcode.io slug rows');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('15000000-0000-4000-8000-000000000007', tests.user_id('max'), 'neetcode.io', 'two-sum') $$,
  '42501', null, 'DATA-16 a client cannot insert a neetcode.io slug row');
select throws_ok($$ delete from public.study_session_problems where domain::text = 'neetcode.io' $$,
  '42501', null, 'DATA-16 a client cannot delete slug rows directly');
select tests.clear_authentication();
reset role;

-- An anonymous sign-in sees nothing (restrictive policy), as for get_problem_totals.
select set_config('request.jwt.claims',
  json_build_object('sub', tests.user_id('max'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
select is((select count(*)::int from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC')), 0,
  'DATA-15a an anonymous JWT gets no rows (RLS), as for get_problem_totals');
reset role;
select tests.clear_authentication();

-- Another user sees only their own rows.
select tests.authenticate_as(tests.user_id('lea'));
select results_eq(
  $$ select domain, problem_slug, seconds from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC') order by 1, 2 $$,
  $$ values ('leetcode.com'::text, 'two-sum'::text, 600::bigint), ('neetcode.io', 'two-integer-sum', 600) $$,
  'DATA-15a lea sees only her own two rows, one per site');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- History delete covers both sites (DATA-17, PRB-16, acceptance 12)
-- =============================================================================================
create temp table max_before (daily text[], domains text[], sessions bigint) on commit drop;
grant select, insert, delete on max_before to authenticated;

select tests.authenticate_as(tests.user_id('max'));
select lives_ok($$ select public.set_problem_tracking(false, false) $$,
  'PRB-16 max turns off and keeps history');
select is((select count(*)::int from public.study_session_problems where domain::text = 'leetcode.com'), 2,
  'PRB-16 keeping history keeps the leetcode.com slug rows...');
select is((select count(*)::int from public.study_session_problems where domain::text = 'neetcode.io'), 4,
  'PRB-16 ...and the neetcode.io slug rows');
select is((select count(*)::int from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC')), 6,
  'PRB-16 the kept history is still listed per site');

insert into max_before
select (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date, 'UTC')),
       (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date, 'UTC')),
       (select count(*) from public.study_sessions);
select lives_ok($$ select public.set_problem_tracking(false, true) $$,
  'PRB-16 DATA-17 max turns off and deletes history');
select is((select count(*)::int from public.study_session_problems), 0,
  'PRB-16 acceptance 12 the slugs of both sites are deleted');
select is((select count(*)::int from public.get_problem_totals_v2(current_date - 6, current_date, 'UTC')), 0,
  'PRB-16 get_problem_totals_v2 returns no rows after the delete');
select is((select count(*)::int from public.get_problem_totals(current_date - 6, current_date, 'UTC')), 0,
  'PRB-16 get_problem_totals returns no rows after the delete');
select is((select count(*) from public.study_sessions), (select sessions from max_before),
  'PRB-16 no study_sessions row was touched');
select is(
  (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date, 'UTC')),
  (select daily from max_before), 'PRB-16 acceptance 12 get_daily_totals is unchanged by the delete');
select is(
  (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date, 'UTC')),
  (select domains from max_before), 'PRB-16 acceptance 12 get_domain_totals is unchanged by the delete');
select tests.clear_authentication();
reset role;

select is(
  (select count(*)::int from public.study_session_problems where user_id = tests.user_id('lea')), 2,
  'PRB-16 another user''s slug rows, on both sites, are untouched by max''s delete');

select * from finish();
rollback;

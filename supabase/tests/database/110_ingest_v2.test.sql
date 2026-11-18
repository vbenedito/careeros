-- Ingest v2, the problem setting and the problem history (#178, ADR-0011).
-- Compatibility test plan items 1 (old contract), 2 (v2), 3 (shared rules), 6 (grants) and
-- 7 (history delete); DATA-06b, DATA-09b, DATA-13..17, PRB-01, PRB-05, PRB-16.
begin;
select plan(110);

select tests.create_user('fay');
select tests.create_user('gus');
select tests.create_user('hal');
select tests.create_user('ivy');
select tests.create_user('jon');

-- =============================================================================================
-- Plan item 6: definitions and grants
-- =============================================================================================
select has_function('public', 'ingest_study_sessions_v2', array['jsonb'], 'DATA-06b ingest_study_sessions_v2 exists');
select is_definer('public', 'ingest_study_sessions_v2', array['jsonb'], 'DATA-06b v2 is SECURITY DEFINER');
select is(
  (select pg_get_function_result(oid) from pg_proc where oid = 'public.ingest_study_sessions_v2(jsonb)'::regprocedure),
  'jsonb', 'DATA-06b v2 returns jsonb'
);
select is(
  (select pg_get_function_result(oid) from pg_proc where oid = 'public.ingest_study_sessions(jsonb)'::regprocedure),
  'uuid[]', 'DATA-06 the released ingest_study_sessions still returns uuid[]'
);
select ok(
  (select bool_and('search_path=""' = any(proconfig)) from pg_proc
   where oid in ('public.ingest_study_sessions_v2(jsonb)'::regprocedure,
                 'public.set_problem_tracking(boolean, boolean)'::regprocedure,
                 'public.get_problem_totals(date, date, text)'::regprocedure,
                 'private.ingest_sessions(jsonb, boolean)'::regprocedure)),
  'DATA-06b DATA-15 DATA-17 the new functions pin an empty search_path'
);
select ok(has_function_privilege('authenticated', 'public.ingest_study_sessions(jsonb)', 'execute'),
  'DATA-06 authenticated can call ingest_study_sessions');
select ok(has_function_privilege('authenticated', 'public.ingest_study_sessions_v2(jsonb)', 'execute'),
  'DATA-06b authenticated can call ingest_study_sessions_v2');
select ok(not has_function_privilege('anon', 'public.ingest_study_sessions(jsonb)', 'execute'),
  'DATA-06 anon cannot call ingest_study_sessions');
select ok(not has_function_privilege('anon', 'public.ingest_study_sessions_v2(jsonb)', 'execute'),
  'DATA-06b anon cannot call ingest_study_sessions_v2');
select ok(not has_function_privilege('public', 'public.ingest_study_sessions_v2(jsonb)', 'execute'),
  'DATA-06b PUBLIC has no EXECUTE on ingest_study_sessions_v2');
select is_definer('public', 'set_problem_tracking', array['boolean', 'boolean'],
  'DATA-17 set_problem_tracking is SECURITY DEFINER');
select ok(has_function_privilege('authenticated', 'public.set_problem_tracking(boolean, boolean)', 'execute'),
  'DATA-17 authenticated can call set_problem_tracking');
select ok(not has_function_privilege('anon', 'public.set_problem_tracking(boolean, boolean)', 'execute'),
  'DATA-17 anon cannot call set_problem_tracking');
select ok(not has_function_privilege('public', 'public.set_problem_tracking(boolean, boolean)', 'execute'),
  'DATA-17 PUBLIC has no EXECUTE on set_problem_tracking');
select isnt_definer('public', 'get_problem_totals', array['date', 'date', 'text'],
  'DATA-15 get_problem_totals is SECURITY INVOKER');
select ok(has_function_privilege('authenticated', 'public.get_problem_totals(date, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.get_problem_totals(date, date, text)', 'execute'),
  'DATA-15 get_problem_totals: authenticated only');
select ok(not has_function_privilege('authenticated', 'private.ingest_sessions(jsonb, boolean)', 'execute'),
  'DATA-06b the shared implementation is not callable by clients');
-- DATA-14: the setting is read after the same per-user lock that set_problem_tracking takes.
select ok(
  (select strpos(prosrc, 'pg_advisory_xact_lock(hashtextextended(''ingest_study_sessions:'' || caller::text, 0))') > 0
          and strpos(prosrc, 'pg_advisory_xact_lock') < strpos(prosrc, 'from public.account_settings')
   from pg_proc where oid = 'private.ingest_sessions(jsonb, boolean)'::regprocedure)
  and (select strpos(prosrc, 'pg_advisory_xact_lock(hashtextextended(''ingest_study_sessions:'' || caller::text, 0))') > 0
          and strpos(prosrc, 'pg_advisory_xact_lock') < strpos(prosrc, 'delete from public.study_session_problems')
       from pg_proc where oid = 'public.set_problem_tracking(boolean, boolean)'::regprocedure),
  'DATA-14 DATA-17 ingest reads the setting, and set_problem_tracking deletes, only after the same per-user lock'
);

select tests.authenticate_as_anon();
select throws_ok($$ select public.ingest_study_sessions_v2('[]') $$, '42501', null,
  'DATA-06b anon is refused by privileges');
select throws_ok($$ select public.set_problem_tracking(true, false) $$, '42501', null,
  'DATA-17 anon cannot change the setting');
select tests.clear_authentication();
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', tests.user_id('fay'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
select throws_ok($$ select public.ingest_study_sessions_v2('[]') $$, 'PT401', 'NOT_AUTHENTICATED',
  'DATA-06b an anonymous sign-in cannot upload');
select throws_ok($$ select public.set_problem_tracking(true, false) $$, 'PT401', 'NOT_AUTHENTICATED',
  'DATA-17 an anonymous sign-in cannot change the setting');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.ingest_study_sessions_v2('[]') $$, 'PT401', 'NOT_AUTHENTICATED',
  'DATA-06b a request without auth.uid() is rejected');
select throws_ok($$ select public.set_problem_tracking(false, false) $$, 'PT401', 'NOT_AUTHENTICATED',
  'DATA-17 a request without auth.uid() is rejected');
select throws_ok($$ select * from public.get_problem_totals(current_date, current_date, 'UTC') $$,
  'PT401', 'NOT_AUTHENTICATED', 'DATA-15 a request without auth.uid() is rejected');
reset role;
select tests.clear_authentication();

-- =============================================================================================
-- DATA-13, DATA-16: tables, grants, RLS and constraints
-- =============================================================================================
select has_table('public'::name, 'account_settings'::name, 'DATA-13 account_settings exists');
select has_table('public'::name, 'study_session_problems'::name, 'DATA-16 study_session_problems exists');
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
   where oid in ('public.account_settings'::regclass, 'public.study_session_problems'::regclass)),
  'DATA-13 DATA-16 RLS is enabled and forced on both tables'
);
select policies_are('public', 'account_settings',
  array['account_settings_select_own', 'account_settings_no_anonymous'],
  'DATA-13 account_settings: own-row SELECT and the anonymous refusal');
select policies_are('public', 'study_session_problems',
  array['study_session_problems_select_own', 'study_session_problems_no_anonymous'],
  'DATA-16 study_session_problems: own-row SELECT and the anonymous refusal');
select is(
  (select array_agg(g.p order by g.p) from (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as g(p)
   where has_table_privilege('authenticated', 'public.study_session_problems', g.p)
      or has_table_privilege('anon', 'public.study_session_problems', g.p)
      or has_table_privilege('authenticated', 'public.account_settings', g.p)
      or has_table_privilege('anon', 'public.account_settings', g.p)),
  null::text[],
  'DATA-16 DATA-17 clients have no write privilege on study_session_problems or account_settings'
);
select ok(has_table_privilege('authenticated', 'public.study_session_problems', 'select')
  and has_table_privilege('authenticated', 'public.account_settings', 'select')
  and not has_table_privilege('anon', 'public.study_session_problems', 'select')
  and not has_table_privilege('anon', 'public.account_settings', 'select'),
  'DATA-13 DATA-16 authenticated may read both tables, anon may not');
select has_index('public', 'study_session_problems', 'study_session_problems_user_idx', array['user_id'],
  'DATA-16 index (user_id)');
select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'public.study_sessions'::regclass and contype = 'u'
            and conname = 'study_sessions_id_user_domain_key'),
  'DATA-16 study_sessions has UNIQUE (id, user_id, domain) for the composite FK'
);
select ok(
  (select confdeltype = 'c' and confrelid = 'public.study_sessions'::regclass and cardinality(conkey) = 3
   from pg_constraint where conname = 'study_session_problems_session_fkey'),
  'DATA-16 the composite FK references study_sessions and cascades on delete'
);

-- Constraint checks run as the test superuser (clients cannot insert at all).
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
values
  ('f0000000-0000-4000-8000-000000000001', tests.user_id('jon'), gen_random_uuid(),
   'leetcode.com', now() - interval '3 hours', now() - interval '2 hours 50 minutes'),
  ('f0000000-0000-4000-8000-000000000002', tests.user_id('jon'), gen_random_uuid(),
   'neetcode.io', now() - interval '3 hours', now() - interval '2 hours 50 minutes');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('f0000000-0000-4000-8000-000000000001', tests.user_id('ivy'), 'leetcode.com', 'two-sum') $$,
  '23503', null, 'DATA-16 a slug row for another user''s session is refused by the FK');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('f0000000-0000-4000-8000-000000000002', tests.user_id('jon'), 'neetcode.io', 'two-sum') $$,
  '23514', null, 'DATA-16 a slug row for a non-leetcode.com session is refused by the CHECK');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('f0000000-0000-4000-8000-000000000001', tests.user_id('jon'), 'leetcode.com', 'Two-Sum') $$,
  '23514', null, 'PRB-05 DATA-16 a slug outside PROBLEM_SLUG_PATTERN is refused by the CHECK');
select throws_ok(
  format($$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('f0000000-0000-4000-8000-000000000001', tests.user_id('jon'), 'leetcode.com', %L) $$, repeat('a', 101)),
  '23514', null, 'PRB-05 DATA-16 a slug longer than PROBLEM_SLUG_MAX is refused by the CHECK');
select lives_ok(
  format($$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('f0000000-0000-4000-8000-000000000001', tests.user_id('jon'), 'leetcode.com', %L) $$, repeat('a', 100)),
  'PRB-05 DATA-16 a slug of PROBLEM_SLUG_MAX characters is stored');

-- A client cannot write either table directly.
select tests.authenticate_as(tests.user_id('jon'));
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('f0000000-0000-4000-8000-000000000001', tests.user_id('jon'), 'leetcode.com', 'two-sum') $$,
  '42501', null, 'DATA-16 a client cannot insert a slug row');
select throws_ok($$ update public.study_session_problems set problem_slug = 'three-sum' $$,
  '42501', null, 'DATA-16 a client cannot update a slug row');
select throws_ok($$ delete from public.study_session_problems $$,
  '42501', null, 'DATA-16 a client cannot delete slug rows directly');
select throws_ok($$ insert into public.account_settings (track_problems) values (true) $$,
  '42501', null, 'DATA-13 DATA-17 a client cannot write its setting directly (only set_problem_tracking)');
select throws_ok($$ update public.account_settings set track_problems = true $$,
  '42501', null, 'DATA-13 DATA-17 a client cannot update its setting directly');
select is((select count(*)::int from public.study_session_problems), 1,
  'DATA-16 a client reads its own slug rows');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Plan item 2: v2 reply shape and reasons (DATA-06b)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('fay'));
select is(public.ingest_study_sessions_v2('[]'), '{"confirmed": [], "rejected": []}'::jsonb,
  'DATA-06b an empty batch: empty confirmed and rejected lists');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '10 minutes'),
    tests.session('f1000000-0000-4000-8000-000000000002', 'leetcode.com', interval '3 hours', interval '0'),
    tests.session('f1000000-0000-4000-8000-000000000003', 'leetcode.com', interval '-10 minutes', interval '1 minute'),
    tests.session('f1000000-0000-4000-8000-000000000004', 'leetcode.com', interval '1 hour 55 minutes', interval '10 minutes'),
    jsonb_build_object('id', 'not-a-uuid', 'device_id', gen_random_uuid(), 'domain', 'leetcode.com',
      'started_at', tests.iso(now() - interval '5 hours'), 'ended_at', tests.iso(now() - interval '4 hours 59 minutes')),
    '42'::jsonb
  )),
  jsonb_build_object(
    'confirmed', jsonb_build_array('f1000000-0000-4000-8000-000000000001'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', 'f1000000-0000-4000-8000-000000000002', 'reason', 'invalid'),
      jsonb_build_object('id', 'f1000000-0000-4000-8000-000000000003', 'reason', 'future'),
      jsonb_build_object('id', 'f1000000-0000-4000-8000-000000000004', 'reason', 'overlap'))),
  'DATA-06b one reason per rejected id (invalid, future, overlap); an element without a valid id is in neither list'
);
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '10 minutes'),
    tests.session('f1000000-0000-4000-8000-000000000004', 'leetcode.com', interval '1 hour 55 minutes', interval '10 minutes')
  )),
  jsonb_build_object(
    'confirmed', jsonb_build_array('f1000000-0000-4000-8000-000000000001'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', 'f1000000-0000-4000-8000-000000000004', 'reason', 'overlap'))),
  'DATA-06b SYNC-04 a retry is confirmed again; an overlap with a stored interval is reported as overlap'
);
select is((select count(*)::int from public.study_sessions where id::text like 'f1000000-%'), 1,
  'DATA-06b ADR-0004 the retry inserted nothing (exactly-once)');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f1000000-0000-4000-8000-000000000005', 'neetcode.io', interval '1 hour', interval '10 minutes'),
    tests.session('f1000000-0000-4000-8000-000000000006', 'neetcode.io', interval '55 minutes', interval '10 minutes'))),
  jsonb_build_object(
    'confirmed', jsonb_build_array('f1000000-0000-4000-8000-000000000005'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', 'f1000000-0000-4000-8000-000000000006', 'reason', 'overlap'))),
  'DATA-09a DATA-06b an overlap with an earlier element of the same batch is reported as overlap'
);
-- DATA-08: an id owned by another user is rejected as invalid, never confirmed.
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f0000000-0000-4000-8000-000000000002', 'leetcode.com', interval '7 hours', interval '5 minutes'))),
  jsonb_build_object('confirmed', '[]'::jsonb, 'rejected', jsonb_build_array(
    jsonb_build_object('id', 'f0000000-0000-4000-8000-000000000002', 'reason', 'invalid'))),
  'DATA-08 DATA-06b a colliding id of another user is rejected as invalid'
);

-- Slugs (setting off: no row yet, PRB-01)
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f2000000-0000-4000-8000-000000000001', 'leetcode.com', interval '8 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('f2000000-0000-4000-8000-000000000002', 'leetcode.com', interval '8 hours 20 minutes', interval '5 minutes')
      || '{"problem": "Two-Sum"}',
    tests.session('f2000000-0000-4000-8000-000000000003', 'neetcode.io', interval '8 hours 30 minutes', interval '5 minutes')
      || '{"problem": "two-sum"}',
    tests.session('f2000000-0000-4000-8000-000000000004', 'leetcode.com', interval '8 hours 40 minutes', interval '5 minutes')
      || jsonb_build_object('problem', repeat('a', 101)),
    tests.session('f2000000-0000-4000-8000-000000000005', 'leetcode.com', interval '8 hours 50 minutes', interval '5 minutes')
      || '{"problem": 42}',
    tests.session('f2000000-0000-4000-8000-000000000006', 'leetcode.com', interval '-10 minutes', interval '1 minute')
      || '{"problem": "two--sum"}',
    tests.session('f2000000-0000-4000-8000-000000000007', 'leetcode.com', interval '9 hours', interval '5 minutes')
      || '{"problem": null}'
  )),
  jsonb_build_object(
    'confirmed', jsonb_build_array('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000007'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', 'f2000000-0000-4000-8000-000000000002', 'reason', 'invalid'),
      jsonb_build_object('id', 'f2000000-0000-4000-8000-000000000003', 'reason', 'invalid'),
      jsonb_build_object('id', 'f2000000-0000-4000-8000-000000000004', 'reason', 'invalid'),
      jsonb_build_object('id', 'f2000000-0000-4000-8000-000000000005', 'reason', 'invalid'),
      jsonb_build_object('id', 'f2000000-0000-4000-8000-000000000006', 'reason', 'invalid'))),
  'PRB-05 DATA-06b a bad slug, a slug off leetcode.com or a non-string problem makes only that element invalid (even when also future); problem null means none'
);
select is((select count(*)::int from public.study_session_problems), 0,
  'PRB-01 DATA-14 with no settings row the slug is dropped and the interval stored');
select is((select count(*)::int from public.account_settings), 0, 'PRB-01 a new account has no settings row (off)');

-- Turn it on, then a slug is stored.
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 the user turns the setting on');
select is((select track_problems from public.account_settings), true, 'DATA-13 the user reads back the setting');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f2000000-0000-4000-8000-000000000011', 'leetcode.com', interval '10 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('f2000000-0000-4000-8000-000000000012', 'leetcode.com', interval '10 hours 20 minutes', interval '5 minutes'),
    -- already stored without a slug: a retry never adds one (DATA-16)
    tests.session('f2000000-0000-4000-8000-000000000001', 'leetcode.com', interval '8 hours', interval '10 minutes')
      || '{"problem": "two-sum"}'
  )) -> 'confirmed',
  jsonb_build_array('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011',
                    'f2000000-0000-4000-8000-000000000012'),
  'DATA-06b with the setting on, intervals with and without a slug are confirmed'
);
select results_eq(
  $$ select session_id::text, domain::text, problem_slug from public.study_session_problems order by 1 $$,
  $$ values ('f2000000-0000-4000-8000-000000000011', 'leetcode.com', 'two-sum') $$,
  'DATA-14 DATA-16 only the newly inserted interval with a slug got a slug row; a retry did not'
);

-- Same batch and payload errors as v1.
select throws_ok($$ select public.ingest_study_sessions_v2('{"id": 1}') $$, '22023', 'INVALID_BATCH',
  'DATA-06b a non-array payload is rejected');
select throws_ok($$ select public.ingest_study_sessions_v2(null) $$, '22023', 'INVALID_BATCH',
  'DATA-06b a null payload is rejected');
select throws_ok(
  $$ select public.ingest_study_sessions_v2(
       (select jsonb_agg(tests.session(gen_random_uuid(), 'leetcode.com', interval '1 hour', interval '1 minute'))
        from generate_series(1, 201))) $$,
  '22023', 'INVALID_BATCH', 'DATA-06b more than 200 sessions is rejected');
select throws_ok(
  $$ select public.ingest_study_sessions_v2(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '40 minutes', interval '1 minute')
         || jsonb_build_object('junk', repeat('x', 140000)))) $$,
  '22023', 'INVALID_BATCH', 'DATA-06b a payload larger than 128 kB is rejected');

-- =============================================================================================
-- Plan item 1: the old contract (DATA-06..09a), unchanged for extension 0.2.3
-- =============================================================================================
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('f3000000-0000-4000-8000-000000000001', 'leetcode.com', interval '12 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('f3000000-0000-4000-8000-000000000002', 'leetcode.com', interval '12 hours 30 minutes', interval '5 minutes')
      || '{"problem": "Not A Slug"}',
    tests.session('f3000000-0000-4000-8000-000000000003', 'leetcode.com', interval '13 hours', interval '0'),
    tests.session('f3000000-0000-4000-8000-000000000004', 'leetcode.com', interval '-10 minutes', interval '1 minute'),
    tests.session('f3000000-0000-4000-8000-000000000005', 'leetcode.com', interval '11 hours 55 minutes', interval '10 minutes')
  )),
  array['f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002']::uuid[],
  'DATA-06 the old function returns only the valid ids as uuid[]; invalid, future and overlapping elements are left out; a problem key is ignored'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('f3000000-0000-4000-8000-000000000001', 'leetcode.com', interval '12 hours', interval '10 minutes'),
    tests.session('f3000000-0000-4000-8000-000000000005', 'leetcode.com', interval '11 hours 55 minutes', interval '10 minutes'))),
  array['f3000000-0000-4000-8000-000000000001']::uuid[],
  'SYNC-04 the old function confirms a retry again and still leaves out the overlap'
);
select is(
  (select count(*)::int from public.study_session_problems where session_id::text like 'f3000000-%'), 0,
  'PRB-10 DATA-06b the old function never stores a slug, even with the setting on'
);

-- =============================================================================================
-- Plan item 3: shared rules
-- =============================================================================================
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('f3000000-0000-4000-8000-000000000001', 'leetcode.com', interval '12 hours', interval '10 minutes'))) -> 'confirmed',
  jsonb_build_array('f3000000-0000-4000-8000-000000000001'),
  'DATA-06b a batch sent through v1 and retried through v2 is confirmed by v2'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('f2000000-0000-4000-8000-000000000011', 'leetcode.com', interval '10 hours', interval '10 minutes'))),
  array['f2000000-0000-4000-8000-000000000011']::uuid[],
  'DATA-06b a batch sent through v2 and retried through v1 is confirmed by v1'
);
select is(
  (select count(*)::int from public.study_sessions
   where id in ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011')),
  2, 'ADR-0004 retries across v1 and v2 inserted each interval once'
);
select tests.clear_authentication();
reset role;

-- Caps count rows from both functions; DATA-09b (E5): pure retries are confirmed at a cap.
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
select gen_random_uuid(), tests.user_id('gus'), gen_random_uuid(), 'neetcode.io',
       now() - interval '20 hours', now() - interval '20 hours' + interval '10 seconds'
from generate_series(1, 997);   -- 997 rows created in this hour

select tests.authenticate_as(tests.user_id('gus'));
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('91000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '1 minute'))),
  array['91000000-0000-4000-8000-000000000001']::uuid[],
  'DATA-09 below the hourly cap v1 inserts (998 rows)'
);
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('91000000-0000-4000-8000-000000000002', 'leetcode.com', interval '1 hour', interval '1 minute'),
    tests.session('91000000-0000-4000-8000-000000000003', 'leetcode.com', interval '50 minutes', interval '1 minute'))) -> 'confirmed',
  jsonb_build_array('91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000003'),
  'DATA-09 below the hourly cap v2 inserts (1,000 rows now)'
);
select throws_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '40 minutes', interval '1 minute'))) $$,
  'PT429', 'ABUSE_LIMIT', 'DATA-09 the cap counts rows inserted by v2 when v1 is called');
select throws_ok(
  $$ select public.ingest_study_sessions_v2(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '40 minutes', interval '1 minute'))) $$,
  'PT429', 'ABUSE_LIMIT', 'DATA-09 DATA-06b v2 raises the same ABUSE_LIMIT at the cap');
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('91000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '1 minute'),
    tests.session('91000000-0000-4000-8000-000000000002', 'leetcode.com', interval '1 hour', interval '1 minute'))),
  array['91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002']::uuid[],
  'DATA-09b at the cap a batch of pure retries is confirmed by v1'
);
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('91000000-0000-4000-8000-000000000003', 'leetcode.com', interval '50 minutes', interval '1 minute'),
    tests.session('91000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '1 minute'))),
  jsonb_build_object('confirmed', jsonb_build_array('91000000-0000-4000-8000-000000000001',
                                                    '91000000-0000-4000-8000-000000000003'),
                     'rejected', '[]'::jsonb),
  'DATA-09b at the cap a batch of pure retries is confirmed by v2'
);
select throws_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session('91000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '1 minute'),
       tests.session(gen_random_uuid(), 'leetcode.com', interval '30 minutes', interval '1 minute'))) $$,
  'PT429', 'ABUSE_LIMIT', 'DATA-09b at the cap a batch with one new row is refused by v1');
select throws_ok(
  $$ select public.ingest_study_sessions_v2(jsonb_build_array(
       tests.session('91000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '1 minute'),
       tests.session(gen_random_uuid(), 'leetcode.com', interval '30 minutes', interval '1 minute'))) $$,
  'PT429', 'ABUSE_LIMIT', 'DATA-09b at the cap a batch with one new row is refused by v2');
select is((select count(*)::int from public.study_sessions), 1000,
  'DATA-09b the refused batches inserted nothing');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Plan item 7: history delete (DATA-17, PRB-16) and problem totals (DATA-15)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('ivy'));
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 ivy turns the setting on');
select is(
  jsonb_array_length(public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('99000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '10 minutes')
      || '{"problem": "two-sum"}')) -> 'confirmed'),
  1, 'ivy stores one interval with a slug');
select tests.clear_authentication();
reset role;

-- Totals before the delete, recorded as hal (created by the test superuser).
create temp table hal_before (daily text[], domains text[], sessions bigint) on commit drop;
grant select, insert, delete on hal_before to authenticated;

select tests.authenticate_as(tests.user_id('hal'));
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 hal turns the setting on');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('9a000000-0000-4000-8000-000000000001', 'leetcode.com', interval '5 hours', interval '20 minutes')
      || '{"problem": "two-sum"}',
    tests.session('9a000000-0000-4000-8000-000000000002', 'leetcode.com', interval '4 hours', interval '10 minutes')
      || '{"problem": "3sum"}',
    tests.session('9a000000-0000-4000-8000-000000000003', 'leetcode.com', interval '3 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('9a000000-0000-4000-8000-000000000004', 'leetcode.com', interval '2 hours', interval '10 minutes')
      || '{"problem": "lru-cache"}',
    tests.session('9a000000-0000-4000-8000-000000000005', 'leetcode.com', interval '1 hour', interval '15 minutes')
  )) -> 'rejected',
  '[]'::jsonb, 'hal stores five intervals, four with a slug');

select results_eq(
  $$ select problem_slug, seconds, last_day from public.get_problem_totals(current_date - 6, current_date, 'UTC') $$,
  $$ values ('two-sum', 1800::bigint, ((now() - interval '3 hours') at time zone 'UTC')::date),
            ('3sum', 600::bigint, ((now() - interval '4 hours') at time zone 'UTC')::date),
            ('lru-cache', 600::bigint, ((now() - interval '2 hours') at time zone 'UTC')::date) $$,
  'DATA-15 PRB-11 seconds per slug, longest first, ties by slug, last local day; only the caller''s rows'
);
select is(
  (select array_agg(problem_slug order by problem_slug)
   from public.get_problem_totals(current_date - 400, current_date - 350, 'UTC')),
  null::text[], 'DATA-15 a period without intervals has no rows');
select throws_ok($$ select * from public.get_problem_totals(current_date - 92, current_date, 'UTC') $$,
  '22023', 'INVALID_RANGE', 'DATA-15 ranges over 92 days are rejected as in DATA-10');
select throws_ok($$ select * from public.get_problem_totals(current_date, current_date, 'Mars/Base1') $$,
  '22023', 'INVALID_TIME_ZONE', 'DATA-15 bad time zones are rejected as in DATA-10');
select is((select count(*)::int from public.study_session_problems), 4,
  'DATA-16 RLS: hal sees only his own four slug rows');
select is((select count(*)::int from public.account_settings), 1,
  'DATA-13 RLS: hal sees only his own settings row');

select throws_ok($$ select public.set_problem_tracking(true, true) $$, '22023', 'INVALID_ARGUMENT',
  'DATA-17 deleting the history while turning the setting on is refused');
select throws_ok($$ select public.set_problem_tracking(null, false) $$, '22023', 'INVALID_ARGUMENT',
  'DATA-17 a null argument is refused');
select is((select count(*)::int from public.study_session_problems), 4,
  'DATA-17 a refused call deleted nothing');

-- Turn off and keep history
select lives_ok($$ select public.set_problem_tracking(false, false) $$,
  'PRB-16 DATA-17 turn off and keep history');
select is((select track_problems from public.account_settings), false, 'DATA-13 the setting is off');
select is((select count(*)::int from public.study_session_problems), 4,
  'PRB-16 turning off and keeping history keeps every slug row');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('9a000000-0000-4000-8000-000000000006', 'leetcode.com', interval '30 minutes', interval '5 minutes')
      || '{"problem": "two-sum"}')) -> 'confirmed',
  jsonb_build_array('9a000000-0000-4000-8000-000000000006'),
  'DATA-14 with the setting off the interval is stored...');
select is(
  (select count(*)::int from public.study_session_problems where session_id = '9a000000-0000-4000-8000-000000000006'),
  0, 'DATA-14 ...without its slug');
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'PRB-16 turning back on');
select is((select count(*)::int from public.get_problem_totals(current_date - 6, current_date, 'UTC')), 3,
  'PRB-16 the kept history comes back when the setting is on again');

-- Turn off and delete history
insert into hal_before
select (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date, 'UTC')),
       (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date, 'UTC')),
       (select count(*) from public.study_sessions);
select lives_ok($$ select public.set_problem_tracking(false, true) $$,
  'PRB-16 DATA-17 turn off and delete history');
select is((select count(*)::int from public.study_session_problems), 0,
  'PRB-16 DATA-17 every slug row of the caller is deleted');
select is((select track_problems from public.account_settings), false, 'DATA-17 the setting is off');
select is((select count(*)::int from public.get_problem_totals(current_date - 6, current_date, 'UTC')), 0,
  'PRB-16 get_problem_totals returns no rows after the delete');
select is((select count(*) from public.study_sessions), (select sessions from hal_before),
  'PRB-16 DATA-17 no study_sessions row was touched');
select is(
  (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date, 'UTC')),
  (select daily from hal_before),
  'PRB-16 get_daily_totals is unchanged by the delete');
select is(
  (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date, 'UTC')),
  (select domains from hal_before),
  'PRB-16 get_domain_totals is unchanged by the delete');

-- A retried interval never re-adds a deleted slug.
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'hal turns the setting on again');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('9a000000-0000-4000-8000-000000000001', 'leetcode.com', interval '5 hours', interval '20 minutes')
      || '{"problem": "two-sum"}')) -> 'confirmed',
  jsonb_build_array('9a000000-0000-4000-8000-000000000001'),
  'DATA-16 the retry of an interval whose slug was deleted is confirmed...');
select is((select count(*)::int from public.study_session_problems), 0,
  'DATA-16 ...and never re-adds the deleted slug');
select tests.clear_authentication();
reset role;

select is(
  (select count(*)::int from public.study_session_problems where user_id = tests.user_id('ivy')), 1,
  'PRB-16 DATA-17 another user''s slug rows are untouched by the delete');

-- Account deletion removes the setting and the slugs (DATA-12; also covered by 080).
delete from auth.users where id = tests.user_id('ivy');
select is(
  (select count(*)::int from public.study_session_problems where user_id = tests.user_id('ivy'))
  + (select count(*)::int from public.account_settings where user_id = tests.user_id('ivy')),
  0, 'DATA-12 PRB-16 deleting the account deletes its slugs and its setting');

select * from finish();
rollback;

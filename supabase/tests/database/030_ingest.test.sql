-- ingest_study_sessions tests for #7 (DATA-06..09, SYNC-04/05, ADR-0004).
begin;
select plan(33);

select tests.create_user('alice');
select tests.create_user('bob');

-- =============================================================================================
-- Definition and privileges
-- =============================================================================================
select has_function('public', 'ingest_study_sessions', array['jsonb'], 'ingest_study_sessions exists');
select is_definer('public', 'ingest_study_sessions', array['jsonb'], 'it is SECURITY DEFINER');
select ok(
  (select 'search_path=""' = any(proconfig) from pg_proc
   where oid = 'public.ingest_study_sessions(jsonb)'::regprocedure),
  'it pins an empty search_path'
);
select ok(has_function_privilege('authenticated', 'public.ingest_study_sessions(jsonb)', 'execute'),
  'authenticated can execute it');
select ok(not has_function_privilege('anon', 'public.ingest_study_sessions(jsonb)', 'execute'),
  'anon cannot execute it');
select ok(not has_function_privilege('authenticated', 'private.parse_study_session(jsonb)', 'execute'),
  'the private parser is not callable by clients');
select has_index('public', 'study_sessions', 'study_sessions_user_created_idx',
  array['user_id', 'created_at'], 'DATA-09 index (user_id, created_at)');

-- =============================================================================================
-- DATA-06: caller and batch shape
-- =============================================================================================
select tests.authenticate_as_anon();
select throws_ok($$ select public.ingest_study_sessions('[]') $$, '42501', null,
  'anon is refused by privileges');
select tests.clear_authentication();
reset role;

-- a Supabase anonymous sign-in (feature disabled, refused anyway)
select set_config('request.jwt.claims',
  json_build_object('sub', tests.user_id('alice'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
select throws_ok($$ select public.ingest_study_sessions('[]') $$, 'PT401', 'NOT_AUTHENTICATED',
  'an anonymous sign-in cannot upload');
reset role;

-- authenticated role but no user in the JWT (defense in depth)
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.ingest_study_sessions('[]') $$, 'PT401', 'NOT_AUTHENTICATED',
  'DATA-06 a request without auth.uid() is rejected');
reset role;

select tests.authenticate_as(tests.user_id('alice'));

select throws_ok($$ select public.ingest_study_sessions('{"id": 1}') $$, '22023', 'INVALID_BATCH',
  'DATA-06 a non-array payload is rejected');
select throws_ok($$ select public.ingest_study_sessions(null) $$, '22023', 'INVALID_BATCH',
  'DATA-06 a null payload is rejected');
select throws_ok(
  $$ select public.ingest_study_sessions(
       (select jsonb_agg(tests.session(gen_random_uuid(), 'leetcode.com', interval '1 hour', interval '1 minute'))
        from generate_series(1, 201))) $$,
  '22023', 'INVALID_BATCH',
  'DATA-06 more than 200 sessions is rejected'
);
select is(public.ingest_study_sessions('[]'), '{}'::uuid[], 'an empty batch returns no ids');

-- =============================================================================================
-- Happy path and idempotency (SYNC-04)
-- =============================================================================================
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('a1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '30 minutes'),
    tests.session('a1000000-0000-4000-8000-000000000002', 'neetcode.io', interval '1 hour', interval '20 minutes'),
    tests.session('a1000000-0000-4000-8000-000000000003', 'docs.python.org', interval '10 minutes', interval '5 minutes')
  )),
  array['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000003']::uuid[],
  'a valid batch returns every id'
);
select is(
  (select count(*)::int from public.study_sessions), 3, 'alice can read back her 3 intervals'
);
select is(
  (select sum(duration_s)::int from public.study_sessions), (30 + 20 + 5) * 60,
  'durations are computed by the database'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('a1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '30 minutes'),
    tests.session('a1000000-0000-4000-8000-000000000002', 'neetcode.io', interval '1 hour', interval '20 minutes'),
    tests.session('a1000000-0000-4000-8000-000000000003', 'docs.python.org', interval '10 minutes', interval '5 minutes')
  )),
  array['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000003']::uuid[],
  'SYNC-04 retrying the same batch confirms the same ids'
);
select is((select count(*)::int from public.study_sessions), 3,
  'ADR-0004 the retry inserted nothing (exactly-once)');
select bag_eq(
  $$ select unnest(public.ingest_study_sessions(jsonb_build_array(
       tests.session('a1000000-0000-4000-8000-000000000003', 'docs.python.org', interval '10 minutes', interval '5 minutes'),
       tests.session('a1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '30 minutes')))) $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid), ('a1000000-0000-4000-8000-000000000003'::uuid) $$,
  'the result is a set of ids, independent of input order'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('a1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '0')
  )),
  '{}'::uuid[],
  'DATA-08 an invalid element is not confirmed even if its id is already stored'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('a1000000-0000-4000-8000-000000000004', 'leetcode.com', interval '3 hours', interval '1 minute'),
    tests.session('a1000000-0000-4000-8000-000000000004', 'leetcode.com', interval '3 hours', interval '1 minute')
  )),
  array['a1000000-0000-4000-8000-000000000004']::uuid[],
  'a duplicate inside one batch is stored once'
);

-- The element's own user_id (if any) is ignored: rows always belong to the caller.
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('a1000000-0000-4000-8000-000000000005', 'leetcode.com', interval '4 hours', interval '1 minute')
      || jsonb_build_object('user_id', tests.user_id('bob'))
  )),
  array['a1000000-0000-4000-8000-000000000005']::uuid[],
  'a user_id inside an element is ignored...'
);

select tests.clear_authentication();
reset role;
select is(
  (select user_id from public.study_sessions where id = 'a1000000-0000-4000-8000-000000000005'),
  tests.user_id('alice'),
  '...and the row belongs to the caller'
);

-- =============================================================================================
-- DATA-07/08: invalid elements are skipped, valid ones in the same batch are kept
-- =============================================================================================
select tests.authenticate_as(tests.user_id('alice'));
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('a2000000-0000-4000-8000-000000000001', 'leetcode.com', interval '5 hours', interval '10 minutes'),
    -- invalid elements:
    tests.session('a2000000-0000-4000-8000-000000000002', 'www.leetcode.com', interval '5 hours', interval '1 minute'),
    tests.session('a2000000-0000-4000-8000-000000000003', 'leetcode.com', interval '5 hours', interval '1831 seconds'),
    tests.session('a2000000-0000-4000-8000-000000000004', 'leetcode.com', interval '5 hours', interval '0'),
    tests.session('a2000000-0000-4000-8000-000000000005', 'leetcode.com', interval '31 days', interval '1 minute'),
    tests.session('a2000000-0000-4000-8000-000000000006', 'leetcode.com', interval '-10 minutes', interval '1 minute'),
    tests.session('a2000000-0000-4000-8000-000000000007', 'leetcode.com', interval '5 hours', interval '1 minute')
      || '{"started_at": "2026-13-45T25:61:00Z"}',
    tests.session('a2000000-0000-4000-8000-000000000008', 'leetcode.com', interval '5 hours', interval '1 minute')
      || '{"ended_at": "2026-11-05T09:30:00.500Z"}',
    tests.session('a2000000-0000-4000-8000-000000000009', 'leetcode.com', interval '5 hours', interval '1 minute')
      || '{"started_at": "2026-11-05 09:00:00+00"}',
    tests.session('a2000000-0000-4000-8000-000000000010', 'leetcode.com', interval '5 hours', interval '1 minute')
      || '{"device_id": "device-1"}',
    tests.session('a2000000-0000-4000-8000-000000000011', 'leetcode.com', interval '5 hours', interval '1 minute')
      - 'domain',
    jsonb_build_object('id', 'not-a-uuid', 'device_id', gen_random_uuid(), 'domain', 'leetcode.com',
      'started_at', tests.iso(now() - interval '5 hours'), 'ended_at', tests.iso(now() - interval '4 hours 59 minutes')),
    '"just a string"'::jsonb,
    '42'::jsonb,
    'null'::jsonb
  )),
  array['a2000000-0000-4000-8000-000000000001']::uuid[],
  'DATA-07 only the valid element of a mixed batch is confirmed'
);
select is(
  (select count(*)::int from public.study_sessions where id::text like 'a2000000-%'), 1,
  'DATA-08 invalid elements were not stored'
);

select lives_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '30 days' - interval '1 minute', interval '30 seconds'),
       tests.session(gen_random_uuid(), 'leetcode.com', interval '-4 minutes', interval '30 seconds'))) $$,
  'DATA-07 boundaries: 30 days ago and up to 5 minutes in the future are accepted'
);
select is(
  (select count(*)::int from public.study_sessions where created_at = now() and domain = 'leetcode.com'
     and started_at < now() - interval '29 days'), 1,
  'the 30-day-old interval was stored'
);

-- =============================================================================================
-- DATA-08: an id owned by another user is never confirmed or overwritten
-- =============================================================================================
select tests.clear_authentication();
reset role;
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
values ('b9000000-0000-4000-8000-000000000001', tests.user_id('bob'), gen_random_uuid(),
        'neetcode.io', now() - interval '1 hour', now() - interval '50 minutes');

select tests.authenticate_as(tests.user_id('alice'));
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('b9000000-0000-4000-8000-000000000001', 'leetcode.com', interval '1 hour', interval '5 minutes')
  )),
  '{}'::uuid[],
  'DATA-08 a colliding id from another user is not confirmed (goes to quarantine)'
);
select tests.clear_authentication();
reset role;
select is(
  (select user_id || ' ' || domain from public.study_sessions where id = 'b9000000-0000-4000-8000-000000000001'),
  tests.user_id('bob') || ' neetcode.io',
  'bob''s row is unchanged'
);

-- =============================================================================================
-- DATA-09: abuse guard
-- =============================================================================================
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
select gen_random_uuid(), tests.user_id('bob'), gen_random_uuid(), 'neetcode.io',
       now() - interval '2 hours', now() - interval '2 hours' + interval '10 seconds'
from generate_series(1, 998);   -- bob now has 999 rows created in this hour (#111: cap 1,000)

select tests.authenticate_as(tests.user_id('bob'));
select lives_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'neetcode.io', interval '30 minutes', interval '1 minute'))) $$,
  'DATA-09 below 1,000 rows in the last hour the call is allowed'
);
select throws_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'neetcode.io', interval '20 minutes', interval '1 minute'))) $$,
  'PT429', 'ABUSE_LIMIT',
  'DATA-09 with 1,000 rows in the last hour the next call raises ABUSE_LIMIT (HTTP 429)'
);
select tests.clear_authentication();
reset role;

-- alice is not affected by bob's limit
select tests.authenticate_as(tests.user_id('alice'));
select lives_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '15 minutes', interval '1 minute'))) $$,
  'the abuse limit is per user'
);
select tests.clear_authentication();
reset role;

select * from finish();
rollback;

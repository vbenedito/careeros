-- Security hardening from the pre-release audit (#110, #111): upload caps (DATA-09), no overlaps
-- (DATA-09a), payload size (DATA-06), anonymous sign-ins refused by every table policy, and
-- catalog-wide checks so a future object cannot be exposed by accident.
begin;
select plan(27);

select tests.create_user('carol');
select tests.create_user('dave');
select tests.create_user('erin');

-- =============================================================================================
-- DATA-09: daily cap (3,500 rows per 24 hours), independent of the hourly one
-- =============================================================================================
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at, created_at)
select gen_random_uuid(), tests.user_id('carol'), gen_random_uuid(), 'leetcode.com',
       now() - interval '20 hours', now() - interval '20 hours' + interval '10 seconds',
       now() - interval '3 hours'                      -- outside the hourly window
from generate_series(1, 3499);

select tests.authenticate_as(tests.user_id('carol'));
select lives_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '30 minutes', interval '1 minute'))) $$,
  'DATA-09 below 3,500 rows in 24 hours the call is allowed'
);
select throws_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '20 minutes', interval '1 minute'))) $$,
  'PT429', 'ABUSE_LIMIT',
  'DATA-09 with 3,500 rows in 24 hours the next call raises ABUSE_LIMIT (HTTP 429)'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- DATA-09a: no overlapping intervals from the same device
-- =============================================================================================
select tests.authenticate_as(tests.user_id('dave'));
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'))),
  array['d1000000-0000-4000-8000-000000000001']::uuid[],
  'DATA-09a a first interval is accepted'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000002', 'leetcode.com', interval '1 hour 55 minutes', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'))),
  '{}'::uuid[],
  'DATA-09a an interval overlapping a stored one of the same device is not confirmed'
);
select is(
  (select count(*)::int from public.study_sessions where id = 'd1000000-0000-4000-8000-000000000002'),
  0,
  'DATA-09a and it is not stored'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000003', 'leetcode.com', interval '1 hour 55 minutes', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a2'))),
  array['d1000000-0000-4000-8000-000000000003']::uuid[],
  'DATA-09a the same times on another device are accepted (two computers)'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000004', 'leetcode.com', interval '1 hour 50 minutes', interval '5 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'))),
  array['d1000000-0000-4000-8000-000000000004']::uuid[],
  'DATA-09a an adjacent interval (starts where the last one ended) is accepted'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'))),
  array['d1000000-0000-4000-8000-000000000001']::uuid[],
  'DATA-09a SYNC-04 a retry of a stored interval (same id) is confirmed again, not an overlap'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000005', 'neetcode.io', interval '1 hour', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'),
    tests.session('d1000000-0000-4000-8000-000000000006', 'neetcode.io', interval '55 minutes', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'))),
  array['d1000000-0000-4000-8000-000000000005']::uuid[],
  'DATA-09a within one batch, an interval overlapping an earlier one of the same device is dropped'
);
-- The lookup only scans rows that started up to 1,830 s (the longest interval) earlier.
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000007', 'leetcode.com', interval '10 hours', interval '1830 seconds',
                  'd0000000-0000-4000-8000-0000000000a3'),
    tests.session('d1000000-0000-4000-8000-000000000008', 'leetcode.com', interval '10 hours' - interval '1830 seconds',
                  interval '1 minute', 'd0000000-0000-4000-8000-0000000000a3'))),
  array['d1000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000008']::uuid[],
  'DATA-09a a longest interval followed by an adjacent one: both accepted'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-000000000009', 'leetcode.com', interval '10 hours' - interval '1829 seconds',
                  interval '1 minute', 'd0000000-0000-4000-8000-0000000000a3'))),
  '{}'::uuid[],
  'DATA-09a a stored interval that started 1,829 s earlier still blocks an overlap (range bound)'
);
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('d1000000-0000-4000-8000-00000000000a', 'leetcode.com', interval '9 hours', interval '1 minute',
                  'd0000000-0000-4000-8000-0000000000a4'),
    tests.session('d1000000-0000-4000-8000-00000000000a', 'leetcode.com', interval '8 hours', interval '1 minute',
                  'd0000000-0000-4000-8000-0000000000a4'))),
  array['d1000000-0000-4000-8000-00000000000a']::uuid[],
  'DATA-08 an id repeated in one batch with other times is stored once (the first)'
);
select is(
  (select tests.iso(started_at) from public.study_sessions where id = 'd1000000-0000-4000-8000-00000000000a'),
  tests.iso(now() - interval '9 hours'),
  'DATA-08 the first occurrence wins'
);
select tests.clear_authentication();
reset role;

select tests.authenticate_as(tests.user_id('erin'));
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('e1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '2 hours', interval '10 minutes',
                  'd0000000-0000-4000-8000-0000000000a1'))),
  array['e1000000-0000-4000-8000-000000000001']::uuid[],
  'DATA-09a overlaps are per user: another user''s intervals never block yours'
);

-- =============================================================================================
-- DATA-06: payload size
-- =============================================================================================
select throws_ok(
  $$ select public.ingest_study_sessions(jsonb_build_array(
       tests.session(gen_random_uuid(), 'leetcode.com', interval '40 minutes', interval '1 minute')
         || jsonb_build_object('junk', repeat('x', 140000)))) $$,
  '22023', 'INVALID_BATCH',
  'DATA-06 a payload larger than 128 kB is rejected'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- AUTH-01: anonymous sign-ins are refused by every table policy
-- =============================================================================================
insert into public.tracked_domains (user_id, domain) values (tests.user_id('dave'), 'leetcode.com');

select set_config('request.jwt.claims',
  json_build_object('sub', tests.user_id('dave'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
select is((select count(*)::int from public.tracked_domains), 0,
  'AUTH-01 an anonymous sign-in sees no tracked domains, even its own');
select is((select count(*)::int from public.study_sessions), 0,
  'AUTH-01 an anonymous sign-in sees no study sessions');
select throws_ok($$ insert into public.tracked_domains (domain) values ('neetcode.io') $$, '42501', null,
  'AUTH-01 an anonymous sign-in cannot add a tracked domain');
select is(
  (select count(*)::int from public.get_daily_totals(current_date - 6, current_date, 'UTC') where seconds > 0),
  0,
  'AUTH-01 an anonymous sign-in gets no totals'
);
reset role;
select tests.clear_authentication();

select tests.authenticate_as(tests.user_id('dave'));
select is((select count(*)::int from public.tracked_domains), 1,
  'a normal sign-in still sees its own tracked domain');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Catalog-wide checks (deny by default must hold for every object, present and future)
-- =============================================================================================
select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
      and not (c.relrowsecurity and c.relforcerowsecurity)
    order by 1),
  '{}'::text[],
  'SEC-07 every table in public and private has RLS enabled and forced'
);
select is(
  array(
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1),
  '{}'::text[],
  'SEC-07 no function in public or private is executable by anon'
);
select is(
  array(
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1),
  '{}'::text[],
  'SEC-07 no private helper is executable by authenticated'
);
select is(
  array(
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce('search_path=""' = any(p.proconfig), false)
    order by 1),
  '{}'::text[],
  'SEC-07 every SECURITY DEFINER function pins an empty search_path'
);
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on private');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated has no usage on private');

-- Default privileges: a table created later is not exposed until a migration grants it.
create table public.audit_probe (x int);
select ok(
  not has_table_privilege('anon', 'public.audit_probe', 'select')
  and not has_table_privilege('authenticated', 'public.audit_probe', 'select,insert,update,delete'),
  'SEC-07 a new table gets no client privileges by default'
);

select * from finish();
rollback;

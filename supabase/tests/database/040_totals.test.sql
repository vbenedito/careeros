-- Totals RPC tests for #8 (DATA-10, DATA-11, DASH-07).
begin;
select plan(37);

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('carol');   -- no data
select tests.create_user('dave');    -- DST and tie-order fixtures

-- Fixture week: Mon 2026-11-02 .. Sun 2026-11-08 (UTC instants)
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
values
  -- Mon 09:00Z, 30 min
  (gen_random_uuid(), tests.user_id('alice'), gen_random_uuid(), 'leetcode.com',
   '2026-11-02 09:00:00+00', '2026-11-02 09:30:00+00'),
  -- Tue 01:30Z, 20 min: Tuesday in UTC, but Monday 22:30 in America/Sao_Paulo (UTC-3)
  (gen_random_uuid(), tests.user_id('alice'), gen_random_uuid(), 'neetcode.io',
   '2026-11-03 01:30:00+00', '2026-11-03 01:50:00+00'),
  -- Thu 12:00Z, 10 min
  (gen_random_uuid(), tests.user_id('alice'), gen_random_uuid(), 'leetcode.com',
   '2026-11-05 12:00:00+00', '2026-11-05 12:10:00+00'),
  -- Outside the week (previous month)
  (gen_random_uuid(), tests.user_id('alice'), gen_random_uuid(), 'docs.python.org',
   '2026-10-20 12:00:00+00', '2026-10-20 12:15:00+00'),
  -- Sunday 23:50 local in Sao Paulo = Monday 02:50Z of the NEXT week: inside the week only in Sao Paulo
  (gen_random_uuid(), tests.user_id('alice'), gen_random_uuid(), 'neetcode.io',
   '2026-11-09 02:50:00+00', '2026-11-09 02:55:00+00'),
  -- dave, Havana: clocks fall back at 01:00 -> 00:00 on Sun 2026-11-01, so local midnight
  -- happens twice. 04:30Z is the FIRST 00:30 local (UTC-4) of Nov 1.
  (gen_random_uuid(), tests.user_id('dave'), gen_random_uuid(), 'leetcode.com',
   '2026-11-01 04:30:00+00', '2026-11-01 04:40:00+00'),
  -- dave: 05:30Z on Sun 2026-11-01 is 01:30 EDT in New York and 00:30 (second pass) in Havana
  (gen_random_uuid(), tests.user_id('dave'), gen_random_uuid(), 'neetcode.io',
   '2026-11-01 05:30:00+00', '2026-11-01 05:40:00+00'),
  -- bob: must never appear in alice's totals
  (gen_random_uuid(), tests.user_id('bob'), gen_random_uuid(), 'leetcode.com',
   '2026-11-02 10:00:00+00', '2026-11-02 10:30:00+00');

-- =============================================================================================
-- Definition and privileges
-- =============================================================================================
select has_function('public', 'get_daily_totals', array['date', 'date', 'text'], 'get_daily_totals exists');
select has_function('public', 'get_domain_totals', array['date', 'date', 'text'], 'get_domain_totals exists');
select isnt_definer('public', 'get_daily_totals', array['date', 'date', 'text'], 'daily totals run as the caller (RLS applies)');
select isnt_definer('public', 'get_domain_totals', array['date', 'date', 'text'], 'domain totals run as the caller (RLS applies)');
select ok(
  has_function_privilege('authenticated', 'public.get_daily_totals(date, date, text)', 'execute')
  and has_function_privilege('authenticated', 'public.get_domain_totals(date, date, text)', 'execute'),
  'authenticated can execute both'
);
select ok(
  not has_function_privilege('anon', 'public.get_daily_totals(date, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.get_domain_totals(date, date, text)', 'execute'),
  'anon can execute neither'
);
select ok(not has_schema_privilege('authenticated', 'private', 'usage'),
  'the private schema stays closed to clients');

-- =============================================================================================
-- DATA-10: daily totals, zero-filled, time-zone aware
-- =============================================================================================
select tests.authenticate_as(tests.user_id('alice'));

select results_eq(
  $$ select day, seconds from public.get_daily_totals('2026-11-02', '2026-11-08', 'UTC') $$,
  $$ values ('2026-11-02'::date, 1800::bigint), ('2026-11-03', 1200), ('2026-11-04', 0),
            ('2026-11-05', 600), ('2026-11-06', 0), ('2026-11-07', 0), ('2026-11-08', 0) $$,
  'DATA-10 UTC week: one zero-filled row per day, only alice''s data'
);
select results_eq(
  $$ select day, seconds from public.get_daily_totals('2026-11-02', '2026-11-08', 'America/Sao_Paulo') $$,
  $$ values ('2026-11-02'::date, 3000::bigint), ('2026-11-03', 0), ('2026-11-04', 0),
            ('2026-11-05', 600), ('2026-11-06', 0), ('2026-11-07', 0), ('2026-11-08', 300) $$,
  'DATA-10 Sao Paulo week: 01:30Z Tuesday counts on Monday; 02:50Z next Monday counts on Sunday'
);
select is(
  (select count(*)::int from public.get_daily_totals('2026-11-01', '2026-11-30', 'UTC')), 30,
  'a month returns one row per day'
);
select is(
  (select sum(seconds)::int from public.get_daily_totals('2026-10-01', '2026-10-31', 'UTC')), 900,
  'October contains only the 15-minute interval'
);
select results_eq(
  $$ select day, seconds from public.get_daily_totals('2026-11-05', '2026-11-05', 'UTC') $$,
  $$ values ('2026-11-05'::date, 600::bigint) $$,
  'a single day works (the dashboard "Today" card)'
);

-- =============================================================================================
-- DATA-11: domain totals, largest first
-- =============================================================================================
select results_eq(
  $$ select domain, seconds from public.get_domain_totals('2026-11-02', '2026-11-08', 'UTC') $$,
  $$ values ('leetcode.com'::text, 2400::bigint), ('neetcode.io', 1200) $$,
  'DATA-11 per-domain totals for the week, largest first, only alice''s data'
);
select results_eq(
  $$ select domain, seconds from public.get_domain_totals('2026-11-02', '2026-11-08', 'America/Sao_Paulo') $$,
  $$ values ('leetcode.com'::text, 2400::bigint), ('neetcode.io', 1500) $$,
  'DATA-11 uses the same time-zone boundaries as the daily totals'
);
select is_empty(
  $$ select * from public.get_domain_totals('2026-12-01', '2026-12-31', 'UTC') $$,
  'no data in a period returns no domain rows'
);

-- =============================================================================================
-- Validation
-- =============================================================================================
select lives_ok($$ select * from public.get_daily_totals('2026-08-01', '2026-10-31', 'UTC') $$,
  'a 92-day range is accepted');
select throws_ok($$ select * from public.get_daily_totals('2026-08-01', '2026-11-01', 'UTC') $$,
  '22023', 'INVALID_RANGE', 'a 93-day range is rejected');
select throws_ok($$ select * from public.get_daily_totals('2026-11-08', '2026-11-02', 'UTC') $$,
  '22023', 'INVALID_RANGE', 'from after to is rejected');
select throws_ok($$ select * from public.get_domain_totals(null, '2026-11-02', 'UTC') $$,
  '22023', 'INVALID_RANGE', 'a null bound is rejected');
select throws_ok($$ select * from public.get_daily_totals('2026-11-02', '2026-11-08', 'Mars/Olympus_Mons') $$,
  '22023', 'INVALID_TIME_ZONE', 'an unknown time zone is rejected');
select throws_ok($$ select * from public.get_domain_totals('2026-11-02', '2026-11-08', null) $$,
  '22023', 'INVALID_TIME_ZONE', 'a null time zone is rejected');
select throws_ok($$ select * from public.get_daily_totals('2026-11-02', '2026-11-08', 'UTC; select 1') $$,
  '22023', 'INVALID_TIME_ZONE', '#111 a time zone with other characters is rejected before loading');
select throws_ok($$ select * from public.get_domain_totals('2026-11-02', '2026-11-08', repeat('A', 65)) $$,
  '22023', 'INVALID_TIME_ZONE', '#111 an over-long time zone is rejected');
select lives_ok($$ select * from public.get_daily_totals('2026-11-02', '2026-11-08', 'America/Sao_Paulo') $$,
  '#111 an IANA zone is accepted');
select lives_ok($$ select * from public.get_domain_totals('2026-11-02', '2026-11-08', 'Etc/GMT+3') $$,
  '#111 an Etc/GMT offset zone is accepted');
select throws_ok($$ select * from public.get_daily_totals('4713-01-01 BC', '4713-01-02 BC', 'UTC') $$,
  '22023', 'INVALID_RANGE', '#111 extreme dates are a clean INVALID_RANGE, not a date overflow');
select throws_ok($$ select * from public.get_domain_totals('5874897-12-30', '5874897-12-31', 'UTC') $$,
  '22023', 'INVALID_RANGE', '#111 far-future dates are rejected');

select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Isolation and callers without a user
-- =============================================================================================
select tests.authenticate_as(tests.user_id('bob'));
select results_eq(
  $$ select domain, seconds from public.get_domain_totals('2026-11-02', '2026-11-08', 'UTC') $$,
  $$ values ('leetcode.com'::text, 1800::bigint) $$,
  'bob sees only his own totals'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- DST, repeated midnights, session TimeZone and tie order (review of #42)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('dave'));
select results_eq(
  $$ select day, seconds from public.get_daily_totals('2026-11-01', '2026-11-01', 'America/Havana') $$,
  $$ values ('2026-11-01'::date, 1200::bigint) $$,
  'a repeated local midnight (Havana fall-back) does not drop the first local hour'
);
select results_eq(
  $$ select domain, seconds from public.get_domain_totals('2026-11-01', '2026-11-01', 'America/Havana') $$,
  $$ values ('leetcode.com'::text, 600::bigint), ('neetcode.io', 600) $$,
  'daily and domain totals agree on that day'
);
select results_eq(
  $$ select day, seconds from public.get_daily_totals('2026-10-31', '2026-11-02', 'America/New_York') $$,
  $$ values ('2026-10-31'::date, 0::bigint), ('2026-11-01', 1200), ('2026-11-02', 0) $$,
  'a 25-hour DST day (New York fall-back) counts correctly'
);
select is(
  (select array_agg(domain) from public.get_domain_totals('2026-10-31', '2026-11-02', 'America/New_York')),
  array['leetcode.com', 'neetcode.io'],
  'equal totals are ordered by domain name'
);
set local timezone = 'America/Havana';
select is(
  (select count(*)::int from public.get_daily_totals('2026-03-01', '2026-03-31', 'UTC')), 31,
  'zero-fill is independent of the session TimeZone (31 days in March)'
);
reset timezone;
select tests.clear_authentication();
reset role;

select tests.authenticate_as(tests.user_id('alice'));
select is(
  (select sum(seconds) from public.get_daily_totals('2026-11-02', '2026-11-08', 'America/Sao_Paulo')),
  (select sum(seconds) from public.get_domain_totals('2026-11-02', '2026-11-08', 'America/Sao_Paulo')),
  'the daily and domain totals of a period always sum to the same value'
);
select tests.clear_authentication();
reset role;

select ok(
  (select bool_and('search_path=""' = any(proconfig)) from pg_proc
   where oid in ('public.get_daily_totals(date, date, text)'::regprocedure,
                 'public.get_domain_totals(date, date, text)'::regprocedure)),
  'both functions pin an empty search_path'
);

select tests.authenticate_as(tests.user_id('carol'));
select is(
  (select sum(seconds)::int from public.get_daily_totals('2026-11-02', '2026-11-08', 'UTC')), 0,
  'a user without data gets zero-filled days'
);
select tests.clear_authentication();
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select * from public.get_daily_totals('2026-11-02', '2026-11-08', 'UTC') $$,
  'PT401', 'NOT_AUTHENTICATED', 'a request without a user is rejected');
reset role;

select * from finish();
rollback;

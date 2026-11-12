-- Schema tests for #5 (DATA §1, DATA-01, DATA-02). RLS isolation tests arrive with #6.
-- Runs as the test superuser inside a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- Fixture users (auth.users rows; ids are fixed for readability).
insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'alice@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'bob@example.test');

-- ---------------------------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------------------------
select has_table('public', 'tracked_domains', 'tracked_domains exists');
select has_table('public', 'study_sessions', 'study_sessions exists');
select col_is_pk('public', 'tracked_domains', 'id', 'tracked_domains.id is the PK');
select col_is_pk('public', 'study_sessions', 'id', 'study_sessions.id is the PK');
select col_type_is('public', 'study_sessions', 'domain', 'hostname', 'domain uses the hostname type');
select col_type_is('public', 'study_sessions', 'started_at', 'timestamp with time zone', 'started_at is timestamptz');
select col_is_unique('public', 'tracked_domains', array['user_id', 'domain'], 'UNIQUE (user_id, domain)');
select fk_ok('public', 'study_sessions', 'user_id', 'auth', 'users', 'id', 'study_sessions.user_id -> auth.users');
select fk_ok('public', 'tracked_domains', 'user_id', 'auth', 'users', 'id', 'tracked_domains.user_id -> auth.users');
select has_index('public', 'study_sessions', 'study_sessions_user_started_idx', array['user_id', 'started_at'], 'index (user_id, started_at)');
select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.tracked_domains'::regclass),
  true, 'RLS enabled and forced on tracked_domains'
);
select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.study_sessions'::regclass),
  true, 'RLS enabled and forced on study_sessions'
);

-- ---------------------------------------------------------------------------------------------
-- hostname domain (TRK-03 normalized form)
-- ---------------------------------------------------------------------------------------------
select lives_ok($$ select 'leetcode.com'::public.hostname $$, 'accepts leetcode.com');
select lives_ok($$ select 'docs.python.org'::public.hostname $$, 'accepts docs.python.org');
select lives_ok($$ select 'xn--bcher-kva.example'::public.hostname $$, 'accepts punycode');
select throws_ok($$ select 'LeetCode.com'::public.hostname $$, '23514', null, 'rejects uppercase');
select throws_ok($$ select 'localhost'::public.hostname $$, '23514', null, 'rejects single label');
select throws_ok($$ select '192.168.0.1'::public.hostname $$, '23514', null, 'rejects IPv4');
select throws_ok($$ select 'leetcode.com.'::public.hostname $$, '23514', null, 'rejects trailing dot');
select throws_ok($$ select '-bad.com'::public.hostname $$, '23514', null, 'rejects leading hyphen');
select throws_ok($$ select 'www.leetcode.com'::public.hostname $$, '23514', null, 'rejects leading www.');
select throws_ok($$ select 'a.xn--abc-'::public.hostname $$, '23514', null, 'rejects punycode ending in a hyphen');
select throws_ok($$ select 'https://leetcode.com/x'::public.hostname $$, '23514', null, 'rejects URLs');
select throws_ok(
  $$ select (repeat('a.', 127) || 'com')::public.hostname $$, '23514', null, 'rejects > 253 chars'
);
select lives_ok(
  $$ select (repeat('a', 63) || '.com')::public.hostname $$, 'accepts a 63-character label'
);
select throws_ok(
  $$ select (repeat('a', 64) || '.com')::public.hostname $$, '23514', null, 'rejects a 64-character label'
);
select lives_ok(
  $$ select (repeat('a.', 125) || 'com')::public.hostname $$, 'accepts exactly 253 characters'
);
select throws_ok($$ select 'under_score.com'::public.hostname $$, '23514', null, 'rejects underscores');
select lives_ok($$ select 'example.xn--p1ai'::public.hostname $$, 'accepts a punycode TLD');

-- ---------------------------------------------------------------------------------------------
-- study_sessions constraints (DATA-02) and generated duration
-- ---------------------------------------------------------------------------------------------
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
values (
  '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a1',
  '22222222-2222-4222-8222-222222222222', 'leetcode.com',
  '2026-11-05 09:00:00+00', '2026-11-05 09:30:00+00'
);

select is(
  (select duration_s from public.study_sessions where id = '11111111-1111-4111-8111-111111111111'),
  1800, 'duration_s is generated from the timestamps'
);

select lives_ok(
  $$ insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
     values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
             'leetcode.com', '2026-11-05 10:00:00+00', '2026-11-05 10:30:30+00') $$,
  'DATA-02 accepts 1830 s (MAX_INTERVAL_S + tolerance)'
);
select throws_ok(
  $$ insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
     values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
             'leetcode.com', '2026-11-05 10:00:00+00', '2026-11-05 10:30:31+00') $$,
  '23514', null, 'DATA-02 rejects 1831 s'
);
select throws_ok(
  $$ insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
     values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
             'leetcode.com', '2026-11-05 10:00:00+00', '2026-11-05 10:00:00+00') $$,
  '23514', null, 'DATA-02 rejects zero duration'
);
select throws_ok(
  $$ insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at, duration_s)
     values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(),
             'leetcode.com', '2026-11-05 11:00:00+00', '2026-11-05 11:10:00+00', 99999) $$,
  '428C9', null, 'duration_s cannot be written by clients'
);
select throws_ok(
  $$ insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
     values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000a1',
             gen_random_uuid(), 'leetcode.com', '2026-11-05 12:00:00+00', '2026-11-05 12:10:00+00') $$,
  '23505', null, 'interval id is unique (idempotency key)'
);

-- ---------------------------------------------------------------------------------------------
-- tracked_domains: uniqueness and the 12-domain limit (DATA-01, amended #145)
-- ---------------------------------------------------------------------------------------------
insert into public.tracked_domains (user_id, domain)
select '00000000-0000-4000-8000-0000000000a1', 'site' || n || '.test'
from generate_series(1, 11) as n;

select throws_ok(
  $$ insert into public.tracked_domains (user_id, domain)
     values ('00000000-0000-4000-8000-0000000000a1', 'site1.test') $$,
  '23505', null, 'same user cannot track the same domain twice'
);
select lives_ok(
  $$ insert into public.tracked_domains (user_id, domain)
     values ('00000000-0000-4000-8000-0000000000a1', 'site12.test') $$,
  'DATA-01 the 12th domain is accepted'
);
select throws_ok(
  $$ insert into public.tracked_domains (user_id, domain)
     values ('00000000-0000-4000-8000-0000000000a1', 'site13.test') $$,
  'P0001', 'A user can track at most 12 domains', 'DATA-01 the 13th domain is rejected'
);
select lives_ok(
  $$ insert into public.tracked_domains (user_id, domain)
     values ('00000000-0000-4000-8000-0000000000b2', 'site1.test') $$,
  'the limit and uniqueness are per user'
);

-- ---------------------------------------------------------------------------------------------
-- Client privileges never include writes to intervals or TRUNCATE (full grant checks: 020_rls)
-- ---------------------------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.study_sessions', 'select, insert, update, delete, truncate'),
  'anon has no privileges on study_sessions'
);
select ok(
  not has_table_privilege('authenticated', 'public.study_sessions', 'insert, update, delete, truncate'),
  'authenticated cannot write study_sessions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.tracked_domains', 'update, truncate'),
  'authenticated cannot update or truncate tracked_domains'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'the private schema is not usable by clients'
);

-- ---------------------------------------------------------------------------------------------
-- Account deletion cascades (DATA-12 relies on this)
-- ---------------------------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';

select is(
  (select count(*)::int from public.study_sessions where user_id = '00000000-0000-4000-8000-0000000000a1'),
  0, 'deleting a user removes their intervals'
);
select is(
  (select count(*)::int from public.tracked_domains where user_id = '00000000-0000-4000-8000-0000000000a1'),
  0, 'deleting a user removes their tracked domains'
);

select * from finish();
rollback;

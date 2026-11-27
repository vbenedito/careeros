-- User problem rules, expand step (#285, PS-a of #245).
-- Covers PSR-01..09, PSR-13, PSR-15, PSR-16, PSR-22..25, ENT-01, ENT-05, DATA-06b, DATA-12,
-- DATA-16, PRB-05, PRB-20 and acceptance 5, 7, 11 and 12 (database part) of
-- specs/v1/05-problem-sites.md. The old cases of 110 and 130 keep their meaning.
begin;
select plan(212);

select tests.create_user('rae');
select tests.create_user('sam');
select tests.create_user('tom');
select tests.create_user('uma');
select tests.create_user('vic');
select tests.create_user('wes');
select tests.create_user('xan');
select tests.create_user('yin');

-- =============================================================================================
-- PSR-22, PSR-16, ENT-01: table, columns, indexes, RLS and grants
-- =============================================================================================
select has_table('public'::name, 'problem_rules'::name, 'DATA-18 PSR-22 problem_rules exists');
select columns_are('public', 'problem_rules',
  array['id', 'user_id', 'domain', 'prefix', 'kind', 'label', 'confirmed_at', 'created_at', 'removed_at'],
  'PSR-01 PSR-08 PSR-22 DATA-18 problem_rules has exactly the rule fields, the confirmation and the dates: no pattern, no regex, no query part');
select col_not_null('public', 'problem_rules', 'confirmed_at', 'PSR-25 PSR-22 confirmed_at is NOT NULL');
select col_has_default('public', 'problem_rules', 'user_id', 'PSR-22 user_id defaults to auth.uid()');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.problem_rules'::regclass),
  'PSR-22 RLS is enabled and forced on problem_rules');
select policies_are('public', 'problem_rules',
  array['problem_rules_select_own', 'problem_rules_no_anonymous'],
  'PSR-22 problem_rules: own-row SELECT and the anonymous refusal');
select is(
  (select array_agg(g.p order by g.p) from (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as g(p)
   where has_table_privilege('authenticated', 'public.problem_rules', g.p)
      or has_table_privilege('anon', 'public.problem_rules', g.p)),
  null::text[],
  'PSR-16 clients have no INSERT, UPDATE, DELETE or TRUNCATE privilege on problem_rules');
select ok(has_table_privilege('authenticated', 'public.problem_rules', 'select')
  and not has_table_privilege('anon', 'public.problem_rules', 'select'),
  'PSR-22 authenticated may read problem_rules, anon may not');
select ok(
  (select i.indisunique and i.indpred is not null
          and pg_get_expr(i.indpred, i.indrelid) like '%removed_at IS NULL%'
   from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'problem_rules_active_key'),
  'PSR-09 PSR-22 the unique index on (user_id, domain, prefix) is partial: active rules only');
select is(
  (select array_agg(a.attname::text order by k.ord)
   from pg_index i join pg_class c on c.oid = i.indexrelid
   cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where c.relname = 'problem_rules_active_key'),
  array['user_id', 'domain', 'prefix'], 'PSR-22 the partial unique index is on (user_id, domain, prefix)');
select has_index('public', 'problem_rules', 'problem_rules_user_domain_idx', array['user_id', 'domain'],
  'PSR-23 index (user_id, domain) for the rule lookup of ingest');
select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.problem_rules'::regclass and contype = 'f'),
  1, 'PSR-05 PSR-22 the only foreign key is user_id (no FK from domain to tracked_domains)');
select ok(
  (select confdeltype = 'c' and confrelid = 'auth.users'::regclass
   from pg_constraint where conrelid = 'public.problem_rules'::regclass and contype = 'f'),
  'DATA-12 PSR-22 the user_id FK cascades on delete');
select is((select max_problem_rules from public.plans where id = 'free'), 5,
  'ENT-01 PSR-15 O4 the free plan allows 5 problem rules');
select col_not_null('public', 'plans', 'max_problem_rules', 'ENT-01 max_problem_rules is NOT NULL (fail closed)');

-- Definitions: SECURITY DEFINER with an empty search_path, granted to authenticated only.
select is_definer('public', 'add_problem_rule', array['text', 'text[]', 'text', 'text', 'boolean'],
  'PSR-16 add_problem_rule is SECURITY DEFINER');
select is_definer('public', 'remove_problem_rule', array['uuid', 'boolean'],
  'PSR-16 remove_problem_rule is SECURITY DEFINER');
select is_definer('public', 'delete_problem_history', array['text'],
  'PSR-13 delete_problem_history is SECURITY DEFINER');
select ok(
  (select bool_and('search_path=""' = any(proconfig)) from pg_proc
   where oid in ('public.add_problem_rule(text, text[], text, text, boolean)'::regprocedure,
                 'public.remove_problem_rule(uuid, boolean)'::regprocedure,
                 'public.delete_problem_history(text)'::regprocedure,
                 'private.delete_problem_domain_history(uuid, public.hostname)'::regprocedure,
                 'private.enforce_problem_rule_limit()'::regprocedure,
                 'private.check_problem_row()'::regprocedure,
                 'private.parse_session_element(jsonb, boolean)'::regprocedure)),
  'PSR-16 every new or changed function pins an empty search_path');
select ok(
  (select bool_and(prosecdef) from pg_proc
   where oid in ('private.enforce_problem_rule_limit()'::regprocedure,
                 'private.check_problem_row()'::regprocedure,
                 'private.delete_problem_domain_history(uuid, public.hostname)'::regprocedure))
  and (select not prosecdef and provolatile = 's' from pg_proc
       where oid = 'private.parse_session_element(jsonb, boolean)'::regprocedure),
  'PSR-23 PSR-24 the triggers and the delete helper are definer; the parser stays an invoker, stable function');
select ok(
  has_function_privilege('authenticated', 'public.add_problem_rule(text, text[], text, text, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_problem_rule(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.delete_problem_history(text)', 'execute'),
  'PSR-16 authenticated can call the three rule RPCs');
select ok(
  not has_function_privilege('anon', 'public.add_problem_rule(text, text[], text, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.remove_problem_rule(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.delete_problem_history(text)', 'execute')
  and not has_function_privilege('public', 'public.add_problem_rule(text, text[], text, text, boolean)', 'execute')
  and not has_function_privilege('public', 'public.remove_problem_rule(uuid, boolean)', 'execute')
  and not has_function_privilege('public', 'public.delete_problem_history(text)', 'execute'),
  'PSR-16 anon and PUBLIC have no EXECUTE on the rule RPCs');
select ok(
  not has_function_privilege('authenticated', 'private.enforce_problem_rule_limit()', 'execute')
  and not has_function_privilege('authenticated', 'private.check_problem_row()', 'execute')
  and not has_function_privilege('authenticated', 'private.delete_problem_domain_history(uuid, public.hostname)', 'execute')
  and not has_function_privilege('authenticated', 'private.parse_session_element(jsonb, boolean)', 'execute'),
  'PSR-16 clients cannot call the private helpers');
select ok(
  (select position('pg_advisory_xact_lock(hashtextextended(''ingest_study_sessions:'' || caller::text, 0))' in prosrc) > 0
          and position('pg_advisory_xact_lock' in prosrc) < position('insert into public.problem_rules' in prosrc)
   from pg_proc where oid = 'public.add_problem_rule(text, text[], text, text, boolean)'::regprocedure)
  and (select position('pg_advisory_xact_lock(hashtextextended(''ingest_study_sessions:'' || caller::text, 0))' in prosrc) > 0
          and position('pg_advisory_xact_lock' in prosrc) < position('delete from public.problem_rules' in prosrc)
   from pg_proc where oid = 'public.remove_problem_rule(uuid, boolean)'::regprocedure),
  'PSR-22 DATA-09 add and remove take the per-user ingest lock before they change a row');

-- Refusals before any user exists in the picture
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], 'id', 'x', true) $$,
  '42501', null, 'PSR-16 anon is refused by privileges (add)');
select throws_ok($$ select public.remove_problem_rule(gen_random_uuid(), false) $$,
  '42501', null, 'PSR-16 anon is refused by privileges (remove)');
select throws_ok($$ select public.delete_problem_history('hellointerview.com') $$,
  '42501', null, 'PSR-13 anon is refused by privileges (delete_problem_history)');
select throws_ok($$ select count(*) from public.problem_rules $$,
  '42501', null, 'PSR-22 anon cannot read problem_rules');
select tests.clear_authentication();
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', tests.user_id('rae'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], 'id', 'x', true) $$,
  'PT401', 'NOT_AUTHENTICATED', 'PSR-16 an anonymous sign-in cannot add a rule');
select throws_ok($$ select public.remove_problem_rule(gen_random_uuid(), false) $$,
  'PT401', 'NOT_AUTHENTICATED', 'PSR-16 an anonymous sign-in cannot remove a rule');
select throws_ok($$ select public.delete_problem_history('hellointerview.com') $$,
  'PT401', 'NOT_AUTHENTICATED', 'PSR-13 an anonymous sign-in cannot delete problem history');
select is((select count(*)::int from public.problem_rules), 0,
  'PSR-22 an anonymous JWT reads no rules (restrictive policy)');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], 'id', 'x', true) $$,
  'PT401', 'NOT_AUTHENTICATED', 'PSR-16 a request without auth.uid() cannot add a rule');
select throws_ok($$ select public.remove_problem_rule(gen_random_uuid(), false) $$,
  'PT401', 'NOT_AUTHENTICATED', 'PSR-16 a request without auth.uid() cannot remove a rule');
select throws_ok($$ select public.delete_problem_history('hellointerview.com') $$,
  'PT401', 'NOT_AUTHENTICATED', 'PSR-13 a request without auth.uid() cannot delete problem history');
reset role;
select tests.clear_authentication();

-- =============================================================================================
-- PSR-16, PSR-05..07, PSR-25: the add checks (acceptance 5). rae tracks seven sites.
-- =============================================================================================
select tests.authenticate_as(tests.user_id('rae'));
select lives_ok(
  $$ insert into public.tracked_domains (domain)
     values ('hellointerview.com'), ('app.example.com'), ('d3.example.net'), ('d4.example.net'),
            ('d5.example.net'), ('leetcode.com'), ('neetcode.io') $$,
  'TRK-03 rae tracks seven sites');

-- PSR-25: the confirmation is required
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'x', false) $$,
  '22023', 'CONFIRMATION_REQUIRED', 'PSR-25 a rule without confirmedProblemId is refused (false)');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'x', null) $$,
  '22023', 'CONFIRMATION_REQUIRED', 'PSR-25 a rule without confirmedProblemId is refused (null)');

-- PSR-05: tracked by the caller, exact match. A lookalike is not the tracked domain.
select throws_ok(
  $$ select public.add_problem_rule('untracked.example.org', array['practice'], 'id', 'x', true) $$,
  '22023', 'DOMAIN_NOT_TRACKED', 'PSR-05 PSR-16 a domain that is not tracked by the caller is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com.evil.com', array['practice'], 'id', 'x', true) $$,
  '22023', 'DOMAIN_NOT_TRACKED', 'PSR-05 lookalike: hellointerview.com.evil.com is refused');
select throws_ok(
  $$ select public.add_problem_rule('nothellointerview.com', array['practice'], 'id', 'x', true) $$,
  '22023', 'DOMAIN_NOT_TRACKED', 'PSR-05 lookalike: nothellointerview.com is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.co', array['practice'], 'id', 'x', true) $$,
  '22023', 'DOMAIN_NOT_TRACKED', 'PSR-05 lookalike: hellointerview.co is refused');
select throws_ok(
  $$ select public.add_problem_rule('example.com', array['practice'], 'id', 'x', true) $$,
  '22023', 'DOMAIN_NOT_TRACKED', 'PSR-05 the user tracks only app.example.com: a rule on example.com is refused');
select throws_ok(
  $$ select public.add_problem_rule('www.hellointerview.com', array['practice'], 'id', 'x', true) $$,
  '22023', 'INVALID_DOMAIN', 'PSR-05 TRK-03 www. is not a normalized hostname');
select throws_ok(
  $$ select public.add_problem_rule('HelloInterview.com', array['practice'], 'id', 'x', true) $$,
  '22023', 'INVALID_DOMAIN', 'PSR-05 TRK-03 an upper-case host is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com/practice', array['practice'], 'id', 'x', true) $$,
  '22023', 'INVALID_DOMAIN', 'PSR-05 a host with a path is refused');
select throws_ok(
  $$ select public.add_problem_rule('127.0.0.1', array['practice'], 'id', 'x', true) $$,
  '22023', 'INVALID_DOMAIN', 'PSR-05 an IP address is refused');

-- PSR-04, O5: built-in domains take no user rule (rae tracks both)
select throws_ok(
  $$ select public.add_problem_rule('leetcode.com', array['contest'], 'id', 'x', true) $$,
  '22023', 'BUILT_IN_DOMAIN', 'PSR-04 O5 a user rule on leetcode.com is refused');
select throws_ok(
  $$ select public.add_problem_rule('neetcode.io', array['courses'], 'id', 'x', true) $$,
  '22023', 'BUILT_IN_DOMAIN', 'PSR-04 O5 a user rule on neetcode.io is refused');

-- PSR-06: the prefix
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array[]::text[], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a prefix with 0 segments is refused (PROBLEM_RULE_PREFIX_MIN)');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['a', 'b', 'c', 'd'], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a prefix with 4 segments is refused (PROBLEM_RULE_PREFIX_MAX)');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['Practice'], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a segment with an upper-case letter is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['a%20b'], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a segment with % is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['a', ''], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 an empty segment is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['a/b'], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a segment that contains / is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['a', null], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a null segment is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['*'], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 PSR-17 no wildcard segment');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['-a'], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a segment starting with - is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array[['a'], ['b']], 'id', 'x', true) $$,
  '22023', 'INVALID_PREFIX', 'PSR-06 a two-dimensional array is refused');
select throws_ok(
  format($$ select public.add_problem_rule('hellointerview.com', array[%L], 'id', 'x', true) $$, repeat('a', 41)),
  '22023', 'INVALID_PREFIX', 'PSR-06 a segment of 41 characters is refused (PROBLEM_RULE_SEGMENT_MAX)');
select throws_ok(
  $$ select public.add_problem_rule(null, array['a'], 'id', 'x', true) $$,
  '22023', 'INVALID_ARGUMENT', 'PSR-16 a null domain is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', null, 'id', 'x', true) $$,
  '22023', 'INVALID_ARGUMENT', 'PSR-16 a null prefix is refused');

-- PSR-07: the kind comes from a fixed list; PSR-01: the label
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], 'regex', 'x', true) $$,
  '22023', 'INVALID_KIND', 'PSR-07 PSR-17 an unknown kind is refused');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], 'ID', 'x', true) $$,
  '22023', 'INVALID_KIND', 'PSR-07 the kind is compared exactly');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], null, 'x', true) $$,
  '22023', 'INVALID_ARGUMENT', 'PSR-16 a null kind is refused');
select throws_ok(
  format($$ select public.add_problem_rule('hellointerview.com', array['practice'], 'id', %L, true) $$, repeat('l', 41)),
  '22023', 'INVALID_LABEL', 'PSR-01 a label of 41 characters is refused (PROBLEM_RULE_LABEL_MAX)');
select is((select count(*)::int from public.problem_rules), 0,
  'PSR-16 every refused call stored nothing');

-- The first rule: the example of the spec
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'System design', true) $$,
  'PSR-12 PSR-16 the rule of the spec example is accepted');
select results_eq(
  $$ select domain::text, prefix, kind, label, removed_at is null, confirmed_at is not null
     from public.problem_rules $$,
  $$ values ('hellointerview.com', array['practice', 'system-design'], 'id', 'System design', true, true) $$,
  'PSR-01 PSR-22 PSR-25 the stored rule: domain, prefix, kind, label, active, confirmed');
select is((select user_id from public.problem_rules), tests.user_id('rae'),
  'PSR-02 the rule belongs to the caller');
select lives_ok(
  format($$ select public.add_problem_rule('hellointerview.com', array[%L, 'coding'], 'id', %L, true) $$,
         repeat('a', 40), repeat('l', 40)),
  'PSR-06 PSR-01 a segment and a label of exactly 40 characters are accepted');
select lives_ok(
  $$ select public.add_problem_rule('app.example.com', array['p'], 'slug', '   ', true) $$,
  'PSR-07 kind slug is accepted; a blank label is allowed');
select is((select label from public.problem_rules where domain::text = 'app.example.com'), 'app.example.com',
  'PSR-01 a blank label defaults to the domain');
select is((select count(*)::int from public.problem_rules where kind = 'slug'), 1, 'PSR-07 the stored kind is slug');

-- PSR-09: duplicates among active rules (same domain and prefix); a longer prefix is another rule
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'again', true) $$,
  '23505', 'DUPLICATE_RULE', 'PSR-09 PSR-16 a duplicate prefix on the domain is refused');
select throws_ok(
  $$ select public.add_problem_rule('app.example.com', array['p'], 'id', 'again', true) $$,
  '23505', 'DUPLICATE_RULE', 'PSR-09 a duplicate is refused whatever the kind or the label');
select lives_ok(
  $$ select public.add_problem_rule('d3.example.net', array['p'], 'id', 'D3', true) $$,
  'PSR-09 the same prefix on another domain is a different rule');
select lives_ok(
  $$ select public.add_problem_rule('d4.example.net', array['p'], 'id', 'D4', true) $$,
  'PSR-15 the fifth rule is accepted (cap 5 on free)');

-- PSR-15, ENT-05: the sixth rule. Capture the whole error (what PostgREST turns into code, message,
-- hint, details).
select throws_ok(
  $$ select public.add_problem_rule('d5.example.net', array['p'], 'id', 'D5', true) $$,
  'P0001', 'A user can add at most 5 problem rules',
  'PSR-15 ENT-05 acceptance 5: the sixth rule on the free plan is refused');
do $$
declare
  v_state text;
  v_hint text;
  v_detail text;
begin
  perform public.add_problem_rule('d5.example.net', array['p'], 'id', 'D5', true);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint,
    v_detail = pg_exception_detail;
  perform set_config('tests.err_state', v_state, true);
  perform set_config('tests.err_hint', coalesce(v_hint, ''), true);
  perform set_config('tests.err_detail', coalesce(v_detail, ''), true);
end;
$$;
select is(current_setting('tests.err_state'), 'P0001', 'PSR-15 ENT-05 errcode is P0001 (same HTTP status as DATA-01)');
select is(current_setting('tests.err_hint'), 'PSR-15', 'PSR-15 the hint is PSR-15, not DATA-01');
select is(
  current_setting('tests.err_detail')::jsonb,
  '{"code":"LIMIT_REACHED","limit":5,"plan":"free","kind":"problem_rules"}'::jsonb,
  'PSR-15 ENT-05 detail: code LIMIT_REACHED, the limit, the plan, and kind problem_rules');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'again', true) $$,
  '23505', 'DUPLICATE_RULE', 'PSR-09 at the cap a duplicate is still reported as a duplicate');
select is((select count(*)::int from public.problem_rules), 5, 'PSR-15 the refused calls stored nothing');
select is((select count(*)::int from public.tracked_domains), 7,
  'PSR-15 built-in sites and tracked sites do not count against the cap');

-- A client cannot write the table directly
select throws_ok(
  $$ insert into public.problem_rules (domain, prefix, kind, label, confirmed_at)
     values ('d5.example.net', array['p'], 'id', 'D5', now()) $$,
  '42501', null, 'PSR-16 a client cannot insert a rule');
select throws_ok($$ update public.problem_rules set label = 'x' $$,
  '42501', null, 'PSR-16 a client cannot update a rule (a change is remove + add)');
select throws_ok($$ delete from public.problem_rules $$,
  '42501', null, 'PSR-16 a client cannot delete a rule');
select is((select count(*)::int from public.problem_rules), 5, 'PSR-22 rae reads her own five active rules');
select tests.clear_authentication();
reset role;

-- The cap is a trigger on the insert path: it also binds a direct insert.
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('rae'), 'd5.example.net', array['p'], 'id', 'D5', now()) $$,
  'P0001', 'A user can add at most 5 problem rules', 'PSR-15 ENT-03 the cap binds every insert path (trigger)');

-- Table constraints (defence in depth behind the RPC)
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array['Bad'], 'id', 'x', now()) $$,
  '23514', null, 'PSR-06 the table refuses an upper-case segment');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array['a/b'], 'id', 'x', now()) $$,
  '23514', null, 'PSR-06 the table refuses a segment with /');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array['a', 'b', 'c', 'd'], 'id', 'x', now()) $$,
  '23514', null, 'PSR-06 the table refuses 4 segments');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array[]::text[], 'id', 'x', now()) $$,
  '23514', null, 'PSR-06 the table refuses 0 segments');
select throws_ok(
  format($$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array[%L], 'id', 'x', now()) $$, repeat('a', 41)),
  '23514', null, 'PSR-06 the table refuses a segment of 41 characters');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array['a'], 'regex', 'x', now()) $$,
  '23514', null, 'PSR-07 the table refuses an unknown kind');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', null, 'id', 'x', now()) $$,
  '23514', null, 'PSR-22 an active rule needs a prefix');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at, removed_at)
     values (tests.user_id('tom'), 'x1.example.net', array['a'], 'id', null, now(), now()) $$,
  '23514', null, 'PSR-22 a tombstone cannot keep its prefix');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at, removed_at)
     values (tests.user_id('tom'), 'x1.example.net', null, 'id', 'x', now(), now()) $$,
  '23514', null, 'PSR-22 a tombstone cannot keep its label');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label)
     values (tests.user_id('tom'), 'x1.example.net', array['a'], 'id', 'x') $$,
  '23502', null, 'PSR-25 the table refuses a rule without confirmed_at');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('tom'), 'x1.example.net', array['a'], 'id', '', now()) $$,
  '23514', null, 'PSR-01 the table refuses an empty label');
select throws_ok(
  $$ insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
     values (tests.user_id('rae'), 'd4.example.net', array['p'], 'id', 'dup', now()) $$,
  'P0001', null, 'PSR-09 PSR-15 at the cap the trigger answers before the unique index');

-- RLS: another user sees none of rae's rules
select tests.authenticate_as(tests.user_id('tom'));
select is((select count(*)::int from public.problem_rules), 0,
  'PSR-02 PSR-22 RLS: another user never sees rae''s rules');
select tests.clear_authentication();
reset role;

-- The cap follows the plan row (ENT-03): a higher number lets rae add, a lower number keeps her rows.
update public.plans set max_problem_rules = 6 where id = 'free';
select tests.authenticate_as(tests.user_id('rae'));
select lives_ok(
  $$ select public.add_problem_rule('d5.example.net', array['p'], 'id', 'D5', true) $$,
  'PSR-15 ENT-03 with the free row at 6, the sixth rule is accepted');
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['other'], 'id', 'x', true) $$,
  'P0001', 'A user can add at most 6 problem rules', 'PSR-15 the message carries the plan''s number (6)');
select tests.clear_authentication();
reset role;
update public.plans set max_problem_rules = 2 where id = 'free';
select tests.authenticate_as(tests.user_id('rae'));
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['other'], 'id', 'x', true) $$,
  'P0001', 'A user can add at most 2 problem rules', 'PSR-15 with the free row at 2 and 6 rules an add is refused');
select is((select count(*)::int from public.problem_rules), 6,
  'PSR-15 lowering the limit keeps the existing rules');
select tests.clear_authentication();
reset role;
update public.plans set max_problem_rules = 5 where id = 'free';

-- =============================================================================================
-- PSR-22, PSR-13, acceptance 12: remove and keep history = tombstone; it does not count
-- =============================================================================================
select tests.authenticate_as(tests.user_id('rae'));
select lives_ok(
  $$ select public.remove_problem_rule(
       (select id from public.problem_rules where domain::text = 'd5.example.net'), false) $$,
  'PSR-13 rae removes the d5 rule and keeps the history');
select lives_ok(
  $$ select public.remove_problem_rule(
       (select id from public.problem_rules where domain::text = 'd4.example.net'), false) $$,
  'PSR-13 rae removes the d4 rule and keeps the history');
select is((select count(*)::int from public.problem_rules), 4,
  'PSR-22 the client reads four active rules: the two tombstones are not readable');
select tests.clear_authentication();
reset role;
select results_eq(
  $$ select domain::text, removed_at is not null, prefix is null, label is null, kind, confirmed_at is not null,
            created_at is not null
     from public.problem_rules where removed_at is not null order by 1 $$,
  $$ values ('d4.example.net', true, true, true, 'id', true, true),
            ('d5.example.net', true, true, true, 'id', true, true) $$,
  'PSR-22 acceptance 12 a tombstone has no prefix and no label; the domain, the kind and the dates stay');
select tests.authenticate_as(tests.user_id('rae'));
select lives_ok(
  $$ select public.add_problem_rule('d4.example.net', array['p'], 'id', 'D4', true) $$,
  'PSR-22 acceptance 12 re-adding the removed rule succeeds; two tombstones did not count, so the fifth rule fits');
select throws_ok(
  $$ select public.add_problem_rule('d5.example.net', array['p'], 'id', 'D5', true) $$,
  'P0001', 'A user can add at most 5 problem rules', 'PSR-15 with five active rules the next one is refused');
select tests.clear_authentication();
reset role;
select results_eq(
  $$ select domain::text from public.problem_rules where removed_at is not null $$,
  $$ values ('d5.example.net') $$,
  'PSR-22 the re-add deleted the tombstone of its domain; the other tombstone stays');

-- =============================================================================================
-- Ingest by rule (PSR-23, acceptance 1, 2, 11): uma has a rule, the setting is on
-- =============================================================================================
select tests.authenticate_as(tests.user_id('uma'));
select lives_ok($$ insert into public.tracked_domains (domain) values ('hellointerview.com'), ('other.example.org') $$,
  'TRK-03 uma tracks two sites');
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 uma turns the setting on');
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'System design', true) $$,
  'PSR-16 uma adds the example rule');
-- the five cases of PSR-23 in one batch
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    -- 2. built-in: a slug is stored, a non-slug is invalid
    tests.session('b1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '40 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('b1000000-0000-4000-8000-000000000002', 'leetcode.com', interval '39 hours', interval '10 minutes')
      || '{"problem": "Two-Sum"}',
    tests.session('b1000000-0000-4000-8000-000000000003', 'neetcode.io', interval '38 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    -- 3. active rule: the id kind
    tests.session('b1000000-0000-4000-8000-000000000004', 'hellointerview.com', interval '37 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}',
    tests.session('b1000000-0000-4000-8000-000000000005', 'hellointerview.com', interval '36 hours', interval '10 minutes')
      || '{"problem": "Ab_12-cD"}',
    tests.session('b1000000-0000-4000-8000-000000000006', 'hellointerview.com', interval '35 hours', interval '10 minutes')
      || '{"problem": "abc%20"}',
    tests.session('b1000000-0000-4000-8000-000000000007', 'hellointerview.com', interval '34 hours', interval '10 minutes')
      || jsonb_build_object('problem', repeat('a', 65)),
    tests.session('b1000000-0000-4000-8000-000000000008', 'hellointerview.com', interval '33 hours', interval '10 minutes')
      || jsonb_build_object('problem', repeat('a', 64)),
    tests.session('b1000000-0000-4000-8000-000000000009', 'hellointerview.com', interval '32 hours', interval '10 minutes')
      || '{"problem": "abc.def"}',
    tests.session('b1000000-0000-4000-8000-00000000000a', 'hellointerview.com', interval '31 hours', interval '10 minutes')
      || '{"problem": "a--b"}',
    tests.session('b1000000-0000-4000-8000-00000000000b', 'hellointerview.com', interval '30 hours', interval '10 minutes')
      || '{"problem": "a@b"}',
    tests.session('b1000000-0000-4000-8000-00000000000c', 'hellointerview.com', interval '29 hours', interval '10 minutes')
      || '{"problem": "a=1"}',
    tests.session('b1000000-0000-4000-8000-00000000000d', 'hellointerview.com', interval '28 hours', interval '10 minutes')
      || '{"problem": 42}',
    tests.session('b1000000-0000-4000-8000-00000000000e', 'hellointerview.com', interval '27 hours', interval '10 minutes')
      || '{"problem": null}',
    tests.session('b1000000-0000-4000-8000-00000000000f', 'hellointerview.com', interval '26 hours', interval '10 minutes'),
    -- 5. no rule of the caller: lookalikes, a subdomain, a site without a rule
    tests.session('b1000000-0000-4000-8000-000000000010', 'hellointerview.com.evil.com', interval '25 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}',
    tests.session('b1000000-0000-4000-8000-000000000011', 'nothellointerview.com', interval '24 hours', interval '10 minutes')
      || '{"problem": "abc"}',
    tests.session('b1000000-0000-4000-8000-000000000012', 'app.hellointerview.com', interval '23 hours', interval '10 minutes')
      || '{"problem": "abc"}',
    tests.session('b1000000-0000-4000-8000-000000000013', 'other.example.org', interval '22 hours', interval '10 minutes')
      || '{"problem": "abc"}',
    tests.session('b1000000-0000-4000-8000-000000000014', 'other.example.org', interval '21 hours', interval '10 minutes')
  )),
  jsonb_build_object(
    'confirmed', jsonb_build_array(
      'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003',
      'b1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000005',
      'b1000000-0000-4000-8000-000000000008', 'b1000000-0000-4000-8000-00000000000e',
      'b1000000-0000-4000-8000-00000000000f', 'b1000000-0000-4000-8000-000000000014'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000002', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000006', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000007', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000009', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-00000000000a', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-00000000000b', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-00000000000c', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-00000000000d', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000010', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000011', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000012', 'reason', 'invalid'),
      jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000013', 'reason', 'invalid'))),
  'PSR-23 acceptance 11: built-in slug rules unchanged; with the rule active a bad id (%, 65 characters, ., --, @, =, non-string) makes only that element invalid; a domain where the caller has no rule (lookalikes, a subdomain, an unruled site) is invalid; the same domains without an id are stored'
);
select results_eq(
  $$ select session_id::text, domain::text, problem_slug from public.study_session_problems order by 1 $$,
  $$ values ('b1000000-0000-4000-8000-000000000001', 'leetcode.com', 'two-sum'),
            ('b1000000-0000-4000-8000-000000000003', 'neetcode.io', 'two-integer-sum'),
            ('b1000000-0000-4000-8000-000000000004', 'hellointerview.com', 'cmlz26cxp08st08adxvy89hr1'),
            ('b1000000-0000-4000-8000-000000000005', 'hellointerview.com', 'Ab_12-cD'),
            ('b1000000-0000-4000-8000-000000000008', 'hellointerview.com', repeat('a', 64)) $$,
  'PSR-23 PSR-10 acceptance 1: only the id is stored, with the domain; mixed case, _ and - are kept as sent; 64 characters fit');
select is(
  (select count(*)::int from public.study_sessions where id::text like 'b1000000-%' and domain::text = 'hellointerview.com'),
  5, 'PSR-23 the time of the rule site is stored whether or not it has an id (PRB-07)');
-- neetcode.io is built-in: it needs a slug, Ab_12 is not one
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('b1000000-0000-4000-8000-000000000020', 'neetcode.io', interval '20 hours', interval '10 minutes')
      || '{"problem": "Ab_12"}')) -> 'rejected',
  jsonb_build_array(jsonb_build_object('id', 'b1000000-0000-4000-8000-000000000020', 'reason', 'invalid')),
  'PSR-23 step 2 a built-in site still takes slugs only: Ab_12 is a valid id but not a slug');
-- a retry is confirmed and adds nothing
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('b1000000-0000-4000-8000-000000000004', 'hellointerview.com', interval '37 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}')),
  jsonb_build_object('confirmed', jsonb_build_array('b1000000-0000-4000-8000-000000000004'), 'rejected', '[]'::jsonb),
  'SYNC-04 a retry of a stored rule-site interval is confirmed again');
select is((select count(*)::int from public.study_session_problems), 5, 'DATA-16 the retry added no id row');
-- the v1 function never stores an id, with a rule or without
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('b1000000-0000-4000-8000-000000000021', 'hellointerview.com', interval '19 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}')),
  array['b1000000-0000-4000-8000-000000000021']::uuid[],
  'PRB-10 PRB-20 the v1 function ignores a problem key on a rule site');
select is((select count(*)::int from public.study_session_problems where session_id = 'b1000000-0000-4000-8000-000000000021'),
  0, 'PRB-10 the v1 function stored no id');
-- totals: the rule site shows with its domain and id (acceptance 8, database part)
select results_eq(
  $$ select domain, problem_slug, seconds from public.get_problem_totals_v2(current_date - 6, current_date + 1, 'UTC')
     where domain = 'hellointerview.com' order by problem_slug collate "C" $$,
  $$ values ('hellointerview.com'::text, 'Ab_12-cD', 600::bigint),
            ('hellointerview.com', repeat('a', 64), 600),
            ('hellointerview.com', 'cmlz26cxp08st08adxvy89hr1', 600) $$,
  'DATA-15a acceptance 8: get_problem_totals_v2 lists the rule-site ids with their domain');
select tests.clear_authentication();
reset role;

-- setting off (PSR-03, step 1): the interval is stored, the id dropped, even with an active rule
select tests.authenticate_as(tests.user_id('vic'));
select lives_ok($$ insert into public.tracked_domains (domain) values ('hellointerview.com') $$, 'TRK-03 vic tracks a site');
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'x', true) $$,
  'PSR-16 vic adds a rule');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('b2000000-0000-4000-8000-000000000001', 'hellointerview.com', interval '9 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}')) -> 'confirmed',
  jsonb_build_array('b2000000-0000-4000-8000-000000000001'),
  'PSR-03 PSR-23 step 1 with the setting off the rule-site interval is confirmed...');
select is((select count(*)::int from public.study_session_problems), 0,
  'PSR-03 DATA-14 acceptance 2 ...without an id');
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 vic turns the setting on');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('b2000000-0000-4000-8000-000000000002', 'hellointerview.com', interval '8 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}')) -> 'confirmed',
  jsonb_build_array('b2000000-0000-4000-8000-000000000002'), 'PSR-03 with the setting on the id is stored');
select is((select count(*)::int from public.study_session_problems), 1, 'PSR-03 one id row');
select tests.clear_authentication();
reset role;

-- another user's rule never covers the caller (PSR-23 step 5): wes has no rule on vic's site
select tests.authenticate_as(tests.user_id('wes'));
select lives_ok($$ insert into public.tracked_domains (domain) values ('hellointerview.com') $$, 'TRK-03 wes tracks the same site');
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 wes turns the setting on');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('b3000000-0000-4000-8000-000000000001', 'hellointerview.com', interval '9 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}',
    tests.session('b3000000-0000-4000-8000-000000000002', 'hellointerview.com', interval '8 hours', interval '10 minutes'))),
  jsonb_build_object(
    'confirmed', jsonb_build_array('b3000000-0000-4000-8000-000000000002'),
    'rejected', jsonb_build_array(
      jsonb_build_object('id', 'b3000000-0000-4000-8000-000000000001', 'reason', 'invalid'))),
  'PSR-23 acceptance 11 a site that only another user has a rule for makes the element invalid; the same site without an id is stored');
select is((select count(*)::int from public.problem_rules), 0, 'PSR-02 wes sees none of the rules of vic or uma');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- PSR-22, PSR-23 step 4, acceptance 11 and 12: remove and keep history, then re-add (sam)
-- =============================================================================================
select tests.authenticate_as(tests.user_id('sam'));
select lives_ok($$ insert into public.tracked_domains (domain) values ('hellointerview.com'), ('leetcode.com') $$,
  'TRK-03 sam tracks hellointerview.com and leetcode.com');
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 sam turns the setting on');
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'System design', true) $$,
  'PSR-16 sam adds the example rule');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('c1000000-0000-4000-8000-000000000001', 'hellointerview.com', interval '10 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}',
    tests.session('c1000000-0000-4000-8000-000000000002', 'hellointerview.com', interval '9 hours', interval '5 minutes')
      || '{"problem": "other-problem"}',
    tests.session('c1000000-0000-4000-8000-000000000003', 'leetcode.com', interval '8 hours', interval '20 minutes')
      || '{"problem": "two-sum"}')) -> 'rejected',
  '[]'::jsonb, 'sam stores two ids on the rule site and one on leetcode.com');
create temp table sam_before (daily text[], domains text[], sessions bigint) on commit drop;
grant select, insert, delete on sam_before to authenticated;
insert into sam_before
select (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date + 1, 'UTC')),
       (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date + 1, 'UTC')),
       (select count(*) from public.study_sessions);
select lives_ok(
  $$ select public.remove_problem_rule(
       (select id from public.problem_rules where domain::text = 'hellointerview.com'), false) $$,
  'PSR-13 acceptance 12 sam removes the rule and keeps the history');
select is((select count(*)::int from public.problem_rules), 0, 'PSR-22 the extension would receive no rule: a client reads none');
select is((select count(*)::int from public.study_session_problems where domain::text = 'hellointerview.com'), 2,
  'PSR-13 keeping the history keeps the stored ids');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('c1000000-0000-4000-8000-000000000004', 'hellointerview.com', interval '7 hours', interval '10 minutes')
      || '{"problem": "cmlz26cxp08st08adxvy89hr1"}',
    tests.session('c1000000-0000-4000-8000-000000000005', 'hellointerview.com', interval '6 hours', interval '10 minutes')
      || '{"problem": "abc%20"}')),
  jsonb_build_object('confirmed', jsonb_build_array('c1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000005'),
                     'rejected', '[]'::jsonb),
  'PSR-23 step 4 acceptance 11: after the rule is removed a queued interval is stored and its id is dropped (even an id that would not fit)');
select is(
  (select count(*)::int from public.study_session_problems where session_id::text like 'c1000000-%' and domain::text = 'hellointerview.com'),
  2, 'PSR-23 step 4 no id row was added for the queued intervals');
select is(
  (select count(*)::int from public.study_sessions where id in ('c1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000005')),
  2, 'PSR-23 step 4 the time of the queued intervals is stored');
-- the removed site gives no id; leetcode.com is unaffected
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('c1000000-0000-4000-8000-000000000006', 'leetcode.com', interval '5 hours', interval '10 minutes')
      || '{"problem": "three-sum"}')) -> 'confirmed',
  jsonb_build_array('c1000000-0000-4000-8000-000000000006'), 'PRB-05 leetcode.com is not affected by removing a user rule');
select tests.clear_authentication();
reset role;
select results_eq(
  $$ select count(*)::int, count(*) filter (where prefix is null and label is null and removed_at is not null)::int
     from public.problem_rules where user_id = tests.user_id('sam') $$,
  $$ values (1, 1) $$, 'PSR-22 acceptance 12 the removed rule is one tombstone with no prefix and no label');

-- remove errors
select tests.authenticate_as(tests.user_id('sam'));
select throws_ok($$ select public.remove_problem_rule(gen_random_uuid(), false) $$,
  'PT404', 'NOT_FOUND', 'PSR-13 an unknown rule is NOT_FOUND');
select throws_ok($$ select public.remove_problem_rule(null, false) $$,
  '22023', 'INVALID_ARGUMENT', 'PSR-13 a null rule id is refused');
select throws_ok($$ select public.remove_problem_rule(gen_random_uuid(), null) $$,
  '22023', 'INVALID_ARGUMENT', 'PSR-13 a null delete flag is refused');
select tests.clear_authentication();
reset role;
select tests.authenticate_as(tests.user_id('tom'));
-- re-add (PSR-22): a normal add; the tombstone goes; the kept ids show again under the new rule
select tests.authenticate_as(tests.user_id('sam'));
select throws_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'System design', false) $$,
  '22023', 'CONFIRMATION_REQUIRED', 'PSR-22 PSR-25 acceptance 12 re-adding needs a new confirmation');
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'System design 2', true) $$,
  'PSR-22 acceptance 12 adding the same domain and prefix again succeeds (no duplicate error)');
select tests.clear_authentication();
reset role;
select results_eq(
  $$ select count(*)::int, count(*) filter (where removed_at is null)::int, min(label)
     from public.problem_rules where user_id = tests.user_id('sam') $$,
  $$ values (1, 1, 'System design 2') $$,
  'PSR-22 the tombstone was deleted by the re-add: one active row remains');
select set_config('tests.sam_rule', (select id::text from public.problem_rules
  where user_id = tests.user_id('sam') and removed_at is null), true);
select tests.authenticate_as(tests.user_id('tom'));
select lives_ok($$ insert into public.tracked_domains (domain) values ('hellointerview.com') $$, 'TRK-03 tom tracks hellointerview.com');
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'system-design'], 'id', 'Tom', true) $$,
  'PSR-02 another user may add the same rule: each user has their own');
select throws_ok($$ select public.remove_problem_rule(current_setting('tests.sam_rule')::uuid, false) $$,
  'PT404', 'NOT_FOUND', 'PSR-16 a client cannot remove another user''s rule');
select tests.clear_authentication();
reset role;
select is((select count(*)::int from public.problem_rules where id = current_setting('tests.sam_rule')::uuid and removed_at is null), 1,
  'PSR-16 the refused remove changed nothing');
select tests.authenticate_as(tests.user_id('sam'));
select results_eq(
  $$ select domain, problem_slug from public.get_problem_totals_v2(current_date - 6, current_date + 1, 'UTC')
     where domain = 'hellointerview.com' order by 2 $$,
  $$ values ('hellointerview.com'::text, 'cmlz26cxp08st08adxvy89hr1'), ('hellointerview.com', 'other-problem') $$,
  'PSR-22 acceptance 12 the kept ids of the domain show again under the new rule (PRB-19)');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('c1000000-0000-4000-8000-000000000007', 'hellointerview.com', interval '4 hours', interval '10 minutes')
      || '{"problem": "third-one"}')) -> 'confirmed',
  jsonb_build_array('c1000000-0000-4000-8000-000000000007'), 'PSR-23 step 3 the re-added rule takes ids again');
select is((select count(*)::int from public.study_session_problems where domain::text = 'hellointerview.com'), 3,
  'PSR-23 step 3 three ids of the rule site are stored');

-- remove with a second rule on the same domain, and delete history (acceptance 8 and 12)
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice', 'coding'], 'id', 'Coding', true) $$,
  'PSR-09 a second rule on the same domain');
delete from sam_before;
insert into sam_before
select (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date + 1, 'UTC')),
       (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date + 1, 'UTC')),
       (select count(*) from public.study_sessions);
select lives_ok(
  $$ select public.remove_problem_rule(
       (select id from public.problem_rules where label = 'System design 2'), true) $$,
  'PSR-13 acceptance 8 sam removes a rule and deletes the history of the domain');
select is((select count(*)::int from public.study_session_problems where domain::text = 'hellointerview.com'), 0,
  'PSR-13 PSR-22 acceptance 12 no id of that domain remains');
select is((select count(*)::int from public.study_session_problems where domain::text = 'leetcode.com'), 2,
  'PSR-13 acceptance 8 the ids of another site are untouched');
select is((select array_agg(label) from public.problem_rules), array['Coding'],
  'PSR-13 the other rule of the domain remains; the removed row is gone, not a tombstone');
select tests.clear_authentication();
reset role;
select is((select count(*)::int from public.problem_rules where user_id = tests.user_id('sam')), 1,
  'PSR-22 delete history leaves no tombstone and no row of the removed rule');
select tests.authenticate_as(tests.user_id('sam'));
select is((select count(*)::int from public.get_problem_totals_v2(current_date - 6, current_date + 1, 'UTC')
           where domain = 'hellointerview.com'), 0,
  'PSR-13 get_problem_totals_v2 has no row of that domain after the delete');
select is(
  (select array_agg(row(day, seconds)::text order by day) from public.get_daily_totals(current_date - 6, current_date + 1, 'UTC')),
  (select daily from sam_before), 'PSR-13 acceptance 8 get_daily_totals is unchanged by the delete');
select is(
  (select array_agg(row(domain, seconds)::text order by domain) from public.get_domain_totals(current_date - 6, current_date + 1, 'UTC')),
  (select domains from sam_before), 'PSR-13 acceptance 8 get_domain_totals is unchanged by the delete');
select is((select count(*) from public.study_sessions), (select sessions from sam_before),
  'PSR-13 no study_sessions row was touched');

-- delete_problem_history: one domain only, tombstones of that domain, active rules stay
select lives_ok(
  $$ select public.remove_problem_rule((select id from public.problem_rules where label = 'Coding'), false) $$,
  'PSR-13 sam removes the last rule of the domain and keeps history');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('c1000000-0000-4000-8000-000000000008', 'leetcode.com', interval '3 hours', interval '10 minutes')
      || '{"problem": "four-sum"}')) -> 'confirmed',
  jsonb_build_array('c1000000-0000-4000-8000-000000000008'), 'sam stores one more leetcode.com id');
select tests.clear_authentication();
reset role;
select is((select count(*)::int from public.problem_rules where user_id = tests.user_id('sam') and removed_at is not null), 1,
  'PSR-22 sam has one tombstone');
select tests.authenticate_as(tests.user_id('sam'));
select throws_ok($$ select public.delete_problem_history('Bad Domain') $$,
  '22023', 'INVALID_DOMAIN', 'PSR-13 delete_problem_history refuses a bad domain');
select throws_ok($$ select public.delete_problem_history(null) $$,
  '22023', 'INVALID_ARGUMENT', 'PSR-13 delete_problem_history refuses null');
select lives_ok($$ select public.delete_problem_history('hellointerview.com') $$,
  'PSR-13 PSR-24 the per-domain history delete runs');
select tests.clear_authentication();
reset role;
select is((select count(*)::int from public.problem_rules where user_id = tests.user_id('sam')), 0,
  'PSR-22 the per-domain delete also deleted the tombstone of that domain');
select is((select count(*)::int from public.study_session_problems where user_id = tests.user_id('sam') and domain::text = 'leetcode.com'), 3,
  'PSR-24 the per-domain delete never touches another domain');
select tests.authenticate_as(tests.user_id('sam'));
select lives_ok($$ select public.delete_problem_history('leetcode.com') $$,
  'PSR-13 the per-domain delete also works on a built-in domain');
select is((select count(*)::int from public.study_session_problems), 0, 'PSR-24 every id of leetcode.com is deleted');
select is((select count(*) from public.study_sessions), (select sessions from sam_before) + 1,
  'PSR-24 no study_sessions row was deleted (the one new row came from the ingest above)');
select tests.clear_authentication();
reset role;

-- the delete of a domain does not touch another user's ids (tom, rule on the same domain)
select tests.authenticate_as(tests.user_id('tom'));
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 tom turns the setting on');
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('c2000000-0000-4000-8000-000000000001', 'hellointerview.com', interval '5 hours', interval '10 minutes')
      || '{"problem": "tom-problem"}')) -> 'confirmed',
  jsonb_build_array('c2000000-0000-4000-8000-000000000001'), 'tom stores an id on the same domain');
select tests.clear_authentication();
reset role;
select tests.authenticate_as(tests.user_id('sam'));
select lives_ok($$ select public.delete_problem_history('hellointerview.com') $$, 'PSR-13 sam deletes the domain history again');
select tests.clear_authentication();
reset role;
select is((select count(*)::int from public.study_session_problems where user_id = tests.user_id('tom')), 1,
  'PSR-02 PSR-13 another user''s ids on the same domain are untouched');

-- =============================================================================================
-- PSR-24, DATA-16: the trigger and the widened check (direct inserts, as the test superuser)
-- =============================================================================================
select ok(
  not exists (select 1 from pg_constraint
              where conrelid = 'public.study_session_problems'::regclass
                and conname = 'study_session_problems_domain_check'),
  'PSR-24 the literal domain check is gone');
select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.study_session_problems'::regclass and conname = 'study_session_problems_slug_check'),
  $c$CHECK (((char_length(problem_slug) <= 100) AND (problem_slug ~ '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$'::text)))$c$,
  'PSR-24 the stored-id check is widened to the id pattern, still 100 characters');
select ok(
  (select convalidated from pg_constraint
   where conrelid = 'public.study_session_problems'::regclass and conname = 'study_session_problems_slug_check'),
  'PSR-24 the widened check is validated');

insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
select ('d0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, u, gen_random_uuid(), d,
       now() - interval '3 hours', now() - interval '2 hours 50 minutes'
from (values
  (1, tests.user_id('uma'), 'hellointerview.com'),   -- active rule (uma)
  (2, tests.user_id('uma'), 'hellointerview.com'),
  (3, tests.user_id('uma'), 'hellointerview.com'),
  (4, tests.user_id('uma'), 'hellointerview.com'),
  (5, tests.user_id('uma'), 'other.example.org'),    -- no rule
  (6, tests.user_id('uma'), 'leetcode.com'),
  (7, tests.user_id('uma'), 'leetcode.com'),
  (8, tests.user_id('wes'), 'hellointerview.com'),   -- wes has no rule on it
  (9, tests.user_id('sam'), 'hellointerview.com'),   -- sam has a tombstone only (below)
  (10, tests.user_id('uma'), 'neetcode.io.evil.com')
) as v(n, u, d);
-- the rule of uma exists from the ingest section; sam gets a tombstone
insert into public.problem_rules (user_id, domain, kind, confirmed_at, removed_at)
values (tests.user_id('sam'), 'hellointerview.com', 'id', now(), now());

select lives_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000001', tests.user_id('uma'), 'hellointerview.com', 'Ab_12-cD') $$,
  'PSR-24 a user-rule id of the id kind (mixed case, _ and -) is accepted for a user with an active rule');
select throws_ok(
  format($$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000002', tests.user_id('uma'), 'hellointerview.com', %L) $$, repeat('a', 65)),
  '23514', null, 'PSR-24 PROBLEM_ID_MAX: an id of 65 characters is refused on a rule site');
select lives_ok(
  format($$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000003', tests.user_id('uma'), 'hellointerview.com', %L) $$, repeat('a', 64)),
  'PSR-24 an id of 64 characters is accepted on a rule site');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000004', tests.user_id('uma'), 'hellointerview.com', 'a.b') $$,
  '23514', null, 'PSR-24 an id with . is refused (column check)');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000005', tests.user_id('uma'), 'other.example.org', 'abc') $$,
  '23514', null, 'PSR-24 DATA-16 a domain with no rule of the user is refused with the same SQLSTATE as the old check');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000006', tests.user_id('uma'), 'leetcode.com', 'Two-Sum') $$,
  '23514', null, 'PSR-24 a built-in site needs a slug: Two-Sum is refused');
select lives_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000007', tests.user_id('uma'), 'leetcode.com', 'two-sum') $$,
  'PSR-24 a built-in site still takes a slug');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000008', tests.user_id('wes'), 'hellointerview.com', 'abc') $$,
  '23514', null, 'PSR-24 PSR-23 another user''s rule does not cover the row''s user');
select lives_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000009', tests.user_id('sam'), 'hellointerview.com', 'kept-id') $$,
  'PSR-22 PSR-24 an id of a domain with only a removed rule is accepted by a direct insert (restore of kept history)');
select throws_ok(
  $$ insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
     values ('d0000000-0000-4000-8000-000000000010', tests.user_id('uma'), 'neetcode.io.evil.com', 'two-sum') $$,
  '23514', null, 'PSR-24 PRB-05 a lookalike of a built-in domain is refused');

-- =============================================================================================
-- DATA-12: account deletion removes the rules
-- =============================================================================================
select cmp_ok((select count(*)::int from public.problem_rules where user_id = tests.user_id('rae')), '>', 0,
  'DATA-12 rae has rules before the account is deleted');
delete from auth.users where id = tests.user_id('rae');
select is((select count(*)::int from public.problem_rules where user_id = tests.user_id('rae')), 0,
  'DATA-12 PSR-22 deleting the account deletes its rules, tombstones included');

-- =============================================================================================
-- PRB-20, acceptance 7: extension fixtures 0.2.3, 0.3.0 and 0.3.1 against the new database.
-- xan has a user rule, the setting on and sends what each released version sends.
-- =============================================================================================
select tests.authenticate_as(tests.user_id('xan'));
select lives_ok($$ insert into public.tracked_domains (domain) values ('leetcode.com'), ('neetcode.io'), ('stackoverflow.com'), ('hellointerview.com') $$,
  'TRK-03 xan tracks four sites');
select lives_ok($$ select public.set_problem_tracking(true, false) $$, 'DATA-17 xan turns the setting on');
select lives_ok(
  $$ select public.add_problem_rule('hellointerview.com', array['practice'], 'id', 'x', true) $$,
  'PSR-16 xan has a rule that the old extensions know nothing about');
-- 0.2.3: v1 ingest, never sends a problem; the reply is uuid[]
select is(
  public.ingest_study_sessions(jsonb_build_array(
    tests.session('e1000000-0000-4000-8000-000000000001', 'leetcode.com', interval '30 hours', interval '10 minutes'),
    tests.session('e1000000-0000-4000-8000-000000000002', 'stackoverflow.com', interval '29 hours', interval '10 minutes'))),
  array['e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002']::uuid[],
  'PRB-20 acceptance 7 extension 0.2.3 (v1 batch) is confirmed as before');
-- 0.3.0: v2, a slug on leetcode.com only; null problem elsewhere
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('e2000000-0000-4000-8000-000000000001', 'leetcode.com', interval '28 hours', interval '10 minutes')
      || '{"problem": "two-sum"}',
    tests.session('e2000000-0000-4000-8000-000000000002', 'neetcode.io', interval '27 hours', interval '10 minutes'),
    tests.session('e2000000-0000-4000-8000-000000000003', 'stackoverflow.com', interval '26 hours', interval '10 minutes')
      || '{"problem": null}')),
  jsonb_build_object('confirmed', jsonb_build_array('e2000000-0000-4000-8000-000000000001',
                                                    'e2000000-0000-4000-8000-000000000002',
                                                    'e2000000-0000-4000-8000-000000000003'),
                     'rejected', '[]'::jsonb),
  'PRB-20 acceptance 7 extension 0.3.0 (v2 batch, slug on leetcode.com) is confirmed, nothing rejected');
-- 0.3.1: v2, slugs on leetcode.com and neetcode.io
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('e3000000-0000-4000-8000-000000000001', 'leetcode.com', interval '25 hours', interval '10 minutes')
      || '{"problem": "3sum"}',
    tests.session('e3000000-0000-4000-8000-000000000002', 'neetcode.io', interval '24 hours', interval '10 minutes')
      || '{"problem": "two-integer-sum"}',
    tests.session('e3000000-0000-4000-8000-000000000003', 'stackoverflow.com', interval '23 hours', interval '10 minutes'),
    tests.session('e3000000-0000-4000-8000-000000000004', 'hellointerview.com', interval '22 hours', interval '10 minutes'))),
  jsonb_build_object('confirmed', jsonb_build_array('e3000000-0000-4000-8000-000000000001',
                                                    'e3000000-0000-4000-8000-000000000002',
                                                    'e3000000-0000-4000-8000-000000000003',
                                                    'e3000000-0000-4000-8000-000000000004'),
                     'rejected', '[]'::jsonb),
  'PRB-20 acceptance 7 extension 0.3.1 (v2 batch, slugs on both built-in sites) is confirmed, nothing rejected');
select results_eq(
  $$ select session_id::text, domain::text, problem_slug from public.study_session_problems order by 1 $$,
  $$ values ('e2000000-0000-4000-8000-000000000001', 'leetcode.com', 'two-sum'),
            ('e3000000-0000-4000-8000-000000000001', 'leetcode.com', '3sum'),
            ('e3000000-0000-4000-8000-000000000002', 'neetcode.io', 'two-integer-sum') $$,
  'PRB-20 acceptance 7 LeetCode and NeetCode slugs are stored exactly as before; the v1 batch stored none');
select results_eq(
  $$ select domain, problem_slug, seconds from public.get_problem_totals_v2(current_date - 6, current_date + 1, 'UTC') order by 1, 2 $$,
  $$ values ('leetcode.com'::text, '3sum'::text, 600::bigint), ('leetcode.com', 'two-sum', 600),
            ('neetcode.io', 'two-integer-sum', 600) $$,
  'PRB-20 DATA-15a get_problem_totals_v2 returns the same rows for the old clients');
-- the same slugs on the built-in sites still fail as before when they are not slugs
select is(
  public.ingest_study_sessions_v2(jsonb_build_array(
    tests.session('e3000000-0000-4000-8000-000000000005', 'leetcode.com', interval '21 hours', interval '10 minutes')
      || '{"problem": "Two-Sum"}')) -> 'rejected',
  jsonb_build_array(jsonb_build_object('id', 'e3000000-0000-4000-8000-000000000005', 'reason', 'invalid')),
  'PRB-05 PRB-20 a non-slug on leetcode.com is still invalid');
select tests.clear_authentication();
reset role;

-- The built-in list in SQL is unchanged (PRB-18, PSR-04)
select is(private.problem_domains(), array['leetcode.com', 'neetcode.io'],
  'PSR-04 PRB-18 private.problem_domains() still lists exactly the built-in sites');

select * from finish();
rollback;

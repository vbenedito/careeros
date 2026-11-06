-- Extension-link rate limit tests for #13 (AUTH-08).
begin;
select plan(13);

select tests.create_user('alice');
select tests.create_user('bob');

select has_table('private', 'link_requests', 'private.link_requests exists');
select is_definer('public', 'consume_extension_link_quota', array[]::text[], 'quota function is SECURITY DEFINER');
select ok(
  (select 'search_path=""' = any(proconfig) from pg_proc
   where oid = 'public.consume_extension_link_quota()'::regprocedure),
  'it pins an empty search_path'
);
select ok(has_function_privilege('authenticated', 'public.consume_extension_link_quota()', 'execute'),
  'authenticated can call it');
select ok(not has_function_privilege('anon', 'public.consume_extension_link_quota()', 'execute'),
  'anon cannot call it');
select ok(not has_table_privilege('authenticated', 'private.link_requests', 'select, insert, delete'),
  'clients cannot touch the log directly');

-- alice: 5 requests per minute, then refused
select tests.authenticate_as(tests.user_id('alice'));
select results_eq(
  $$ select public.consume_extension_link_quota() from generate_series(1, 5) $$,
  $$ values (true), (true), (true), (true), (true) $$,
  'AUTH-08 the first 5 requests in a minute are allowed'
);
select is(public.consume_extension_link_quota(), false, 'AUTH-08 the 6th request is refused');
select tests.clear_authentication();
reset role;

-- bob is unaffected
select tests.authenticate_as(tests.user_id('bob'));
select is(public.consume_extension_link_quota(), true, 'the limit is per user');
select tests.clear_authentication();
reset role;

-- After a minute alice may request again; rows older than an hour are pruned
update private.link_requests set created_at = now() - interval '2 minutes'
where user_id = tests.user_id('alice');
insert into private.link_requests (user_id, created_at)
values (tests.user_id('alice'), now() - interval '2 hours');

select tests.authenticate_as(tests.user_id('alice'));
select is(public.consume_extension_link_quota(), true, 'requests older than a minute no longer count');
select tests.clear_authentication();
reset role;
select is(
  (select count(*)::int from private.link_requests
   where user_id = tests.user_id('alice') and created_at < now() - interval '1 hour'),
  0, 'rows older than an hour are pruned'
);

-- No user in the JWT
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.consume_extension_link_quota() $$, 'PT401', 'NOT_AUTHENTICATED',
  'a request without a user is rejected');
reset role;

-- Deleting the user removes their log rows
delete from auth.users where id = tests.user_id('alice');
select is(
  (select count(*)::int from private.link_requests where user_id = tests.user_id('alice')),
  0, 'the log is removed with the account'
);

select * from finish();
rollback;

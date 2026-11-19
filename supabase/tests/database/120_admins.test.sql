-- Admins table (#213): ADM-01, acceptance 2 of specs/v1/03-admin.md, run as real roles.
-- A signed-in user can read only their own row and can never write the table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select tests.create_user('gina');
select tests.create_user('hugo');
select tests.create_user('iris');

-- Rows are added by the project owner in the SQL editor. The `postgres` role is not a superuser on
-- hosted Supabase: it can add the row because it owns the table and has BYPASSRLS. Never a client.
insert into public.admins (user_id) values (tests.user_id('gina')), (tests.user_id('hugo'));

-- =============================================================================================
-- ADM-01: shape, RLS, grants
-- =============================================================================================
select has_table('public', 'admins', 'ADM-01 public.admins exists');
select col_is_pk('public', 'admins', 'user_id', 'ADM-01 user_id is the primary key');
select col_type_is('public', 'admins', 'user_id', 'uuid', 'ADM-01 user_id is a uuid');
select col_not_null('public', 'admins', 'created_at', 'ADM-01 created_at is not null');
select col_has_default('public', 'admins', 'created_at', 'ADM-01 created_at has a default');
select fk_ok('public', 'admins', 'user_id', 'auth', 'users', 'id', 'ADM-01 user_id references auth.users');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.admins'::regclass),
  'ADM-01 admins has RLS enabled and forced'
);
select ok(
  has_table_privilege('authenticated', 'public.admins', 'select')
  and not has_table_privilege('authenticated', 'public.admins', 'insert')
  and not has_table_privilege('authenticated', 'public.admins', 'update')
  and not has_table_privilege('authenticated', 'public.admins', 'delete')
  and not has_table_privilege('authenticated', 'public.admins', 'truncate'),
  'ADM-01 authenticated may only select from admins'
);
select ok(
  not has_table_privilege('anon', 'public.admins', 'select')
  and not has_table_privilege('anon', 'public.admins', 'insert')
  and not has_table_privilege('anon', 'public.admins', 'update')
  and not has_table_privilege('anon', 'public.admins', 'delete'),
  'ADM-01 anon has no access to admins'
);
select ok(
  not has_table_privilege('service_role', 'public.admins', 'insert')
  and not has_table_privilege('service_role', 'public.admins', 'update')
  and not has_table_privilege('service_role', 'public.admins', 'delete'),
  'ADM-01 service_role cannot write admins: rows are added by hand in the SQL editor'
);
select policies_are('public', 'admins', array['admins_select_own', 'admins_no_anonymous'],
  'ADM-01 admins has exactly the own-row read policy and the anonymous guard');

-- =============================================================================================
-- Acceptance 2: reads
-- =============================================================================================
select tests.authenticate_as(tests.user_id('gina'));
select results_eq(
  $$ select user_id from public.admins $$,
  $$ select tests.user_id('gina') $$,
  'ADM-01 an admin sees exactly their own row, not the other admin''s'
);
select tests.clear_authentication();
reset role;

select tests.authenticate_as(tests.user_id('iris'));
select is((select count(*)::int from public.admins), 0, 'ADM-01 a user without a row sees nothing');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Acceptance 2: no writes, not even on the own row
-- =============================================================================================
select tests.authenticate_as(tests.user_id('iris'));
select throws_ok(
  $$ insert into public.admins (user_id) values (tests.user_id('iris')) $$,
  '42501', null, 'ADM-01 a user cannot make themselves an admin'
);
select tests.clear_authentication();
reset role;

select tests.authenticate_as(tests.user_id('gina'));
select throws_ok(
  $$ insert into public.admins (user_id) values (tests.user_id('iris')) $$,
  '42501', null, 'ADM-01 an admin cannot add another admin'
);
select throws_ok(
  $$ update public.admins set created_at = now() where user_id = tests.user_id('gina') $$,
  '42501', null, 'ADM-01 an admin cannot update their own row'
);
select throws_ok(
  $$ delete from public.admins where user_id = tests.user_id('gina') $$,
  '42501', null, 'ADM-01 an admin cannot delete their own row'
);
select throws_ok(
  $$ delete from public.admins where user_id = tests.user_id('hugo') $$,
  '42501', null, 'ADM-01 an admin cannot delete another admin'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Anonymous callers
-- =============================================================================================
select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.admins $$,
  '42501', null, 'ADM-01 anon is refused when reading admins'
);
select tests.clear_authentication();
reset role;

-- A Supabase anonymous sign-in carries role authenticated; the restrictive policy hides the row.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.user_id('gina'), 'role', 'authenticated', 'is_anonymous', true)::text,
  true
);
set local role authenticated;
select is((select count(*)::int from public.admins), 0,
  'ADM-01 an anonymous sign-in sees no admin row, even with an admin id');
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- Cascade
-- =============================================================================================
delete from auth.users where id = tests.user_id('hugo');
select is(
  (select count(*)::int from public.admins where user_id = tests.user_id('hugo')),
  0, 'ADM-01 deleting the auth user deletes the admin row'
);
select is(
  (select count(*)::int from public.admins where user_id = tests.user_id('gina')),
  1, 'ADM-01 the cascade leaves other admins alone'
);

select * from finish();
rollback;

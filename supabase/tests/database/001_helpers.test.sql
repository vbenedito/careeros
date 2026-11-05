-- Shared pgTAP helpers for every database test file (#6).
--
-- Test files run in alphabetical order, each in its own session and its own rolled-back
-- transaction. This file is the exception: it COMMITS a `tests` schema so later files can use
-- the helpers. It only ever runs against the local / CI database (`supabase test db`); it is
-- not a migration and never reaches production. The schema is not exposed by PostgREST.
-- Never run `supabase test db --linked` against the production project.
--
-- Usage in a test file:
--   select tests.create_user('alice');                 -- ids are deterministic: tests.user_id('alice')
--   select tests.authenticate_as(tests.user_id('alice'));
--   ... assertions run as `authenticated` with auth.uid() = alice ...
--   select tests.clear_authentication(); reset role;   -- back to the test superuser

begin;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;

-- Deterministic user id for a short name, so tests can refer to users without variables.
create or replace function tests.user_id(name text)
returns uuid
language sql
immutable
as $$
  select (md5('careeros-test-user:' || name))::uuid;
$$;

-- Creates (or reuses) an auth.users row for `name` and returns its id.
create or replace function tests.create_user(name text)
returns uuid
language plpgsql
as $$
declare
  uid uuid := tests.user_id(name);
begin
  insert into auth.users (id, email, aud, role)
  values (uid, name || '@example.test', 'authenticated', 'authenticated')
  on conflict (id) do nothing;
  return uid;
end;
$$;

-- Switches the rest of the transaction to the `authenticated` role with JWT claims for `uid`,
-- exactly as PostgREST does for a signed-in request. auth.uid() then returns `uid`.
create or replace function tests.authenticate_as(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Switches to the `anon` role (a request with only the publishable key).
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Clears the JWT claims. Follow it with a plain `reset role;` to return to the test superuser
-- (the role switch back cannot be done from inside a function called as `authenticated`).
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

-- Clients may call the helpers only after switching role inside a test; they never see data.
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

select plan(4);
select has_function('tests', 'user_id', array['text'], 'tests.user_id exists');
select has_function('tests', 'create_user', array['text'], 'tests.create_user exists');
select has_function('tests', 'authenticate_as', array['uuid'], 'tests.authenticate_as exists');
select is(tests.user_id('alice'), tests.user_id('alice'), 'user ids are deterministic');
select * from finish();
commit;

-- Smoke test: proves the pgTAP runner is wired (issue #3).
-- Real database tests (RLS, RPCs, constraints) arrive with #5-#8.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_schema('public', 'public schema exists');
select has_schema('auth', 'Supabase auth schema exists');
select ok(
  current_setting('server_version_num')::int >= 170000,
  'Postgres major version is 17 or newer (supabase/config.toml db.major_version)'
);

select * from finish();
rollback;

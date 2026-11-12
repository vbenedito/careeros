-- Tracked-domain limit 12 for #145 (DATA-01 amended 2026-11-12), run as real client roles.
-- Accounts that already had more than 12 sites keep them: they can remove but not add.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select tests.create_user('carol');
select tests.create_user('dave');

select ok(
  (select prosrc like '%>= 12%' and prosrc like '%pg_advisory_xact_lock%'
   from pg_proc where oid = 'private.enforce_tracked_domain_limit()'::regprocedure),
  'DATA-01 the trigger function checks 12 and keeps the advisory lock'
);

-- =============================================================================================
-- carol: a new account fills up to 12, the 13th is refused
-- =============================================================================================
select tests.authenticate_as(tests.user_id('carol'));
select lives_ok(
  $$ insert into public.tracked_domains (domain)
     select 'site' || n || '.test' from generate_series(1, 12) as n $$,
  'DATA-01 12 domains are accepted'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('site13.test') $$,
  'P0001', 'A user can track at most 12 domains',
  'DATA-01 the 13th domain is refused'
);
select lives_ok(
  $$ delete from public.tracked_domains where domain = 'site12.test' $$,
  'DATA-01 at the limit, a domain can be removed'
);
select lives_ok(
  $$ insert into public.tracked_domains (domain) values ('site13.test') $$,
  'DATA-01 after removing one, one can be added again'
);
select tests.clear_authentication();
reset role;

-- =============================================================================================
-- dave: an account from before #145 with 14 rows keeps them; it can delete, not insert
-- =============================================================================================
-- Seed as superuser with the trigger off, as the old 50-domain limit allowed.
alter table public.tracked_domains disable trigger tracked_domains_limit;
insert into public.tracked_domains (user_id, domain)
select tests.user_id('dave'), 'old' || n || '.test' from generate_series(1, 14) as n;
alter table public.tracked_domains enable trigger tracked_domains_limit;

select tests.authenticate_as(tests.user_id('dave'));
select is(
  (select count(*)::int from public.tracked_domains),
  14, 'DATA-01 existing lists over the limit are kept'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('new.test') $$,
  'P0001', 'A user can track at most 12 domains',
  'DATA-01 with 14 domains, an insert is refused'
);
select lives_ok(
  $$ delete from public.tracked_domains where domain in ('old14.test', 'old13.test') $$,
  'DATA-01 with 14 domains, deletes are allowed'
);
select throws_ok(
  $$ insert into public.tracked_domains (domain) values ('new.test') $$,
  'P0001', 'A user can track at most 12 domains',
  'DATA-01 at exactly 12, an insert is still refused'
);
select lives_ok(
  $$ delete from public.tracked_domains where domain = 'old12.test' $$,
  'DATA-01 at 12, a delete is allowed'
);
select lives_ok(
  $$ insert into public.tracked_domains (domain) values ('new.test') $$,
  'DATA-01 under 12, an insert is accepted again'
);
select is(
  (select count(*)::int from public.tracked_domains),
  12, 'DATA-01 the list is back at the limit'
);
select tests.clear_authentication();
reset role;

select * from finish();
rollback;

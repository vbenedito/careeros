-- Account erasure (DATA-12, AUTH-13; grill T4): deleting an auth user, as the dashboard's
-- delete path does (auth admin deleteUser removes the auth.users row), leaves no row of that
-- user in any table with a user_id column. The tables are discovered from information_schema,
-- so a table added later is covered automatically: if it forgets `on delete cascade`, this fails.
begin;
select plan(5);

select tests.create_user('erased');
select tests.create_user('kept');

-- Known user-owned tables, seeded for both users. Tables discovered below that are not seeded
-- here are still checked (they must be empty for the erased user, which proves less, so add a
-- seed row for every new table).
insert into public.tracked_domains (user_id, domain)
values (tests.user_id('erased'), 'leetcode.com'), (tests.user_id('kept'), 'leetcode.com');
insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
values
  ('e0000000-0000-4000-8000-000000000001', tests.user_id('erased'), gen_random_uuid(),
   'leetcode.com', '2026-11-05 09:00:00+00', '2026-11-05 09:10:00+00'),
  ('e0000000-0000-4000-8000-000000000002', tests.user_id('kept'), gen_random_uuid(),
   'leetcode.com', '2026-11-05 09:00:00+00', '2026-11-05 09:10:00+00');
insert into private.link_requests (user_id)
values (tests.user_id('erased')), (tests.user_id('kept'));

-- Every base table in the application schemas that has a user_id column.
create temp table user_tables on commit drop as
select c.table_schema::text as schema_name, c.table_name::text as table_name
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.column_name = 'user_id'
  and c.table_schema in ('public', 'private')
  and t.table_type = 'BASE TABLE';

-- "schema.table" names that hold at least one row of `uid`.
create function pg_temp.tables_holding(uid uuid)
returns text[]
language plpgsql
as $$
declare
  t record;
  held text[] := '{}';
  n bigint;
begin
  for t in select * from user_tables order by 1, 2 loop
    execute format('select count(*) from %I.%I where user_id = $1', t.schema_name, t.table_name)
      into n using uid;
    if n > 0 then
      held := held || (t.schema_name || '.' || t.table_name);
    end if;
  end loop;
  return held;
end;
$$;

select ok(
  (select array_agg(schema_name || '.' || table_name order by 1) from user_tables)
    @> array['private.link_requests', 'public.study_sessions', 'public.tracked_domains'],
  'TEST-04 DATA-12 discovery finds the known user-owned tables'
);
select ok(
  pg_temp.tables_holding(tests.user_id('erased'))
    @> array['private.link_requests', 'public.study_sessions', 'public.tracked_domains'],
  'TEST-04 DATA-12 the user owns rows in the known tables before deletion'
);

-- The delete path: Supabase Auth's admin deleteUser removes the auth.users row.
delete from auth.users where id = tests.user_id('erased');

select is(
  pg_temp.tables_holding(tests.user_id('erased')),
  '{}'::text[],
  'TEST-04 DATA-12 after deleting the user no table with a user_id column holds a row of that user'
);
select is(
  (select count(*)::int from auth.users where id = tests.user_id('erased')),
  0, 'TEST-04 AUTH-13 the auth user is gone'
);
select ok(
  pg_temp.tables_holding(tests.user_id('kept'))
    @> array['private.link_requests', 'public.study_sessions', 'public.tracked_domains'],
  'TEST-04 DATA-12 deleting one user leaves another user''s rows untouched'
);

select * from finish();
rollback;

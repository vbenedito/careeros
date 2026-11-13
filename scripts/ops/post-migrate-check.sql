-- Read-only smoke check after `supabase db push` (ENV-08, grill T1). Raises an error, which fails
-- the migrate.yml step, when a public table has row level security off or the `private` schema is
-- reachable by API roles; otherwise returns two counts. Nothing is written (READ ONLY).
begin;
set transaction read only;

do $$
declare
  missing text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname)
    into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  if missing is not null then
    raise exception 'Row level security is NOT enabled on: %', missing;
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE')
     or has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'The private schema is reachable by anon or authenticated';
  end if;
end
$$;

select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity) as public_tables_with_rls,
  (select count(*) from supabase_migrations.schema_migrations) as applied_migrations;

rollback;

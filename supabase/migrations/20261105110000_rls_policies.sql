-- Row Level Security policies and grants (#6).
-- Spec: specs/v0/04-data-model.md §2 (DATA-04, DATA-05), SEC-07.
--
-- Model: deny by default. #5 revoked every client privilege; this migration grants back
-- exactly what the spec allows, and RLS restricts each grant to the caller's own rows.

-- ---------------------------------------------------------------------------------------------
-- tracked_domains (DATA-04): users read, add and remove their own study sites. No UPDATE:
-- changing a domain is remove + add, which keeps the 50-domain trigger the only write rule.
-- ---------------------------------------------------------------------------------------------
grant select, insert, delete on table public.tracked_domains to authenticated;

create policy tracked_domains_select_own on public.tracked_domains
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy tracked_domains_insert_own on public.tracked_domains
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy tracked_domains_delete_own on public.tracked_domains
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- study_sessions (DATA-05): read-only for clients. The only write path is the
-- ingest_study_sessions RPC (#7), so its validation and abuse guard cannot be bypassed.
-- Rows are immutable (DATA-03): no UPDATE or DELETE for anyone but the FK cascade.
-- ---------------------------------------------------------------------------------------------
grant select on table public.study_sessions to authenticated;

create policy study_sessions_select_own on public.study_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Future objects: never exposed by accident. Supabase's default privileges would grant
-- anon/authenticated full access to new tables and EXECUTE on new functions; every future
-- migration must grant explicitly instead.
-- ---------------------------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

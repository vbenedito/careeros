-- Admins table (#213, ADM-b). Spec: specs/v1/03-admin.md ADM-01, ADM-02; ADR-0013.
-- A user is an admin when a row with their id exists here. The server checks it with the user's
-- own session (a select of their own row), so no secret key is needed (ADM-02).
-- Rows are added only by the project owner, by hand, in the Supabase SQL editor. No user id is
-- ever in this repository: there is no seed row and no function that writes the table.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is 'Users who may open /admin (ADM-01). Rows are added by hand in the SQL editor; no client role can write.';

alter table public.admins enable row level security;
alter table public.admins force row level security;

-- Deny by default, then grant back read access only.
revoke all on table public.admins from public, anon, authenticated;
grant select on table public.admins to authenticated;
-- Only the project owner adds an admin, in the SQL editor: take the write privileges away from
-- service_role too (same as plans).
revoke insert, update, delete, truncate on table public.admins from service_role;

-- A signed-in user sees only their own row, which is all the server check needs (ADM-02).
-- There is no INSERT, UPDATE or DELETE grant and no write policy.
create policy admins_select_own on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Same guard as the other tables: an anonymous sign-in carries role `authenticated` (disabled,
-- AUTH-01); refuse it anyway.
create policy admins_no_anonymous on public.admins
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

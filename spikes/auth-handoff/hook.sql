-- Scenario C only (spike): reject sign-ups that are not Google/GitHub OAuth, and log the event
-- payload so the spike report shows exactly what the hook receives.
create table if not exists public.spike_hook_events (at timestamptz default now(), event jsonb);
grant insert on public.spike_hook_events to supabase_auth_admin;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  insert into public.spike_hook_events (event) values (event);
  if coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '') in ('google', 'github') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign up with Google or GitHub'));
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

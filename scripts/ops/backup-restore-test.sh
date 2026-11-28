#!/usr/bin/env bash
# Proves the backup procedure end to end against the local stack (#31): seed data → dump →
# encrypt with a throwaway age key → decrypt → fresh database from the migrations → restore →
# same rows. Destroys local data (runs `supabase db reset`). Used by CI; needs `age` on PATH.
set -euo pipefail
cd "$(dirname "$0")/../.."
# The local stack's well-known development credentials (not a secret).
export PGURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql_local() {
  docker exec -i supabase_db_careeros psql -U postgres -At -v ON_ERROR_STOP=1 -c "$1"
}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

uid=$(psql_local "select gen_random_uuid()")
psql_local "insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '$uid', 'authenticated', 'authenticated',
    'backup-$uid@example.test', now(), '{\"provider\":\"github\"}', '{}', now(), now());
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), '$uid', '$uid', 'github', '{\"sub\":\"$uid\"}', now(), now());
  insert into public.tracked_domains (user_id, domain) values ('$uid', 'leetcode.com');
  insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
  values ('$uid', '$uid', gen_random_uuid(), 'leetcode.com',
          now() - interval '1 hour', now() - interval '40 minutes');
  insert into public.account_settings (user_id, track_problems) values ('$uid', true);
  insert into public.admins (user_id) values ('$uid');
  insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
  values ('$uid', '$uid', 'leetcode.com', 'two-sum');
  -- Problem rules (PSR-22): five active rules (the free cap) incl. a custom site with a stored id,
  -- and a tombstone whose domain keeps an id. Proves the dump order (problem_rules before
  -- study_session_problems) and that the restore accepts a tombstone at the cap.
  insert into public.tracked_domains (user_id, domain) values ('$uid', 'hellointerview.com');
  insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
  select '$uid', d, array['practice'], 'id', d, now()
  from unnest(array['hellointerview.com', 'a1.example.net', 'a2.example.net', 'a3.example.net',
                    'a4.example.net']) as d;
  insert into public.problem_rules (user_id, domain, kind, confirmed_at, removed_at)
  values ('$uid', 'kept.example.net', 'id', now(), now());
  insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
  values (gen_random_uuid(), '$uid', gen_random_uuid(), 'hellointerview.com',
          now() - interval '3 hours', now() - interval '2 hours 50 minutes'),
         (gen_random_uuid(), '$uid', gen_random_uuid(), 'kept.example.net',
          now() - interval '4 hours', now() - interval '3 hours 50 minutes');
  insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
  select id, user_id, domain, case domain::text when 'kept.example.net' then 'kept-id' else 'Ab_12' end
  from public.study_sessions where user_id = '$uid' and domain::text in ('hellointerview.com', 'kept.example.net');" >/dev/null

fingerprint() {
  psql_local "select (select count(*) from auth.users) || ',' || (select count(*) from auth.identities)
    || ',' || (select count(*) from public.tracked_domains) || ',' || (select count(*) || ':'
    || coalesce(sum(duration_s), 0) from public.study_sessions)
    || ',' || (select count(*) filter (where track_problems) from public.account_settings)
    || ',' || (select count(*) from public.admins)
    || ',' || (select count(*) || ':' || coalesce(string_agg(problem_slug, '|' order by session_id), '')
    from public.study_session_problems)
    || ',' || (select count(*) || ':' || count(*) filter (where removed_at is null) || ':'
    || coalesce(string_agg(domain::text || '/' || kind || '/' || coalesce(array_to_string(prefix, '/'), '-')
         || '/' || coalesce(label, '-'), '|' order by domain), '') from public.problem_rules)"
}
before=$(fingerprint)

age-keygen -o "$work/key.txt" 2>/dev/null
recipient=$(grep -o 'age1[0-9a-z]*' "$work/key.txt")
# The same script as the backup and migration workflows (#147).
AGE_RECIPIENT="$recipient" scripts/ops/backup-encrypted.sh "$work/dump.age" >/dev/null
# The stored file must not be readable without the key.
if gzip -dc < "$work/dump.age" >/dev/null 2>&1; then echo "dump is not encrypted" >&2; exit 1; fi

pnpm exec supabase db reset >/dev/null
[ "$(fingerprint)" != "$before" ] || { echo "reset did not clear the data" >&2; exit 1; }

age --decrypt --identity "$work/key.txt" < "$work/dump.age" | gunzip | scripts/ops/db-restore.sh
after=$(fingerprint)
echo "before: $before"
echo "after:  $after"
[ "$before" = "$after" ] || { echo "restore mismatch" >&2; exit 1; }
echo "backup → restore round trip OK"

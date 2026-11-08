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
  values (gen_random_uuid(), '$uid', gen_random_uuid(), 'leetcode.com',
          now() - interval '1 hour', now() - interval '40 minutes');" >/dev/null

fingerprint() {
  psql_local "select (select count(*) from auth.users) || ',' || (select count(*) from auth.identities)
    || ',' || (select count(*) from public.tracked_domains) || ',' || (select count(*) || ':'
    || coalesce(sum(duration_s), 0) from public.study_sessions)"
}
before=$(fingerprint)

age-keygen -o "$work/key.txt" 2>/dev/null
recipient=$(grep -o 'age1[0-9a-z]*' "$work/key.txt")
scripts/ops/db-dump.sh | gzip -9 | age --encrypt --recipient "$recipient" > "$work/dump.age"
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

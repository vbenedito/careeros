#!/usr/bin/env bash
# Runs the auth-handoff spike for one scenario against a fresh local Supabase stack.
# Usage: spikes/auth-handoff/run.sh A|B|C     (from the repo root, Docker required)
#   A: Supabase defaults (email provider on)
#   B: email provider off
#   C: email provider on + before_user_created hook allowing only google/github
set -euo pipefail
scenario=$1
cfg=supabase/config.toml
cp "$cfg" /tmp/config.toml.orig
trap 'cp /tmp/config.toml.orig "$cfg"; pnpm exec supabase stop --no-backup >/dev/null 2>&1 || true' EXIT

# short OTP expiry so the expiry check runs quickly
python3 - "$cfg" "$scenario" <<'PY'
import sys, re
path, scenario = sys.argv[1], sys.argv[2]
s = open(path).read()
s = re.sub(r'(\[auth\.email\][\s\S]*?\notp_expiry = )\d+', r'\g<1>8', s, count=1)
if scenario == "B":
    s = re.sub(r'(\[auth\.email\][\s\S]*?\nenabled = )true', r'\g<1>false', s, count=1)
if scenario == "C":
    s = s.replace('# [auth.hook.before_user_created]\n# enabled = true\n# uri = "pg-functions://postgres/auth/before-user-created-hook"',
                  '[auth.hook.before_user_created]\nenabled = true\nuri = "pg-functions://postgres/public/hook_before_user_created"')
    assert '[auth.hook.before_user_created]\nenabled = true' in s, "hook block not found"
open(path, "w").write(s)
PY

pnpm exec supabase start -x studio,postgres-meta,imgproxy >/dev/null
eval "$(pnpm exec supabase status -o env | grep -E '^[A-Z_]+=')"
echo "status variables: $(pnpm exec supabase status -o env | grep -oE '^[A-Z_]+' | tr '\n' ' ')"

export SCENARIO=$scenario
export API_URL=${API_URL}
export PUBLISHABLE_KEY=${PUBLISHABLE_KEY:-${ANON_KEY:-}}
export SECRET_KEY=${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}
export MAILPIT_URL=${MAILPIT_URL:-${INBUCKET_URL:-http://127.0.0.1:54324}}
export DB_CONTAINER=supabase_db_careeros
export OTP_EXPIRY_S=8

if [ "$scenario" = C ]; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < spikes/auth-handoff/hook.sql >/dev/null
fi

node spikes/auth-handoff/spike.mjs | tee "spike-$scenario.json"

if [ "$scenario" = C ]; then
  echo "hook events (user.app_metadata only):"
  docker exec -i "$DB_CONTAINER" psql -U postgres -At -c \
    "select event -> 'user' -> 'app_metadata' from public.spike_hook_events order by at"
fi

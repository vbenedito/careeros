#!/usr/bin/env bash
# Builds and starts the dashboard against the running local Supabase stack, then runs the
# dashboard integration tests. Used by CI (backend job); works locally with Docker running.
set -euo pipefail
eval "$(pnpm exec supabase status -o env | grep -E '^[A-Z_]+=')"

export SITE_URL=http://localhost:3000
export NEXT_PUBLIC_SUPABASE_URL=$API_URL
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
export SUPABASE_SECRET_KEY=$SECRET_KEY
export NEXT_TELEMETRY_DISABLED=1

pnpm --filter @careeros/web build
pnpm --filter @careeros/web start -p 3000 > web-integration-server.log 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/sign-in && break; sleep 1; done

BASE_URL=$SITE_URL API_URL=$API_URL PUBLISHABLE_KEY=$PUBLISHABLE_KEY SECRET_KEY=$SECRET_KEY \
  DB_CONTAINER=supabase_db_careeros pnpm --filter @careeros/web test:integration

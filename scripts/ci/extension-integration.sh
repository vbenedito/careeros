#!/usr/bin/env bash
# Builds the development extension against the running local Supabase stack and runs the
# real-Chromium connection tests. Used by CI (backend job); works locally with Docker running.
set -euo pipefail
eval "$(pnpm exec supabase status -o env | grep -E '^[A-Z_]+=')"

VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY \
  pnpm --filter @careeros/extension build

API_URL=$API_URL PUBLISHABLE_KEY=$PUBLISHABLE_KEY SECRET_KEY=$SECRET_KEY \
  DB_CONTAINER=supabase_db_careeros pnpm --filter @careeros/extension test:integration

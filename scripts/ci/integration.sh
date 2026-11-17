#!/usr/bin/env bash
# Builds the dashboard and the development extension against the running local Supabase stack,
# starts one dashboard server, and runs both integration suites against it (dashboard HTTP tests,
# then real-Chromium extension tests), then the E2E journeys (TEST §2). Used by CI (backend job); works locally with Docker running
# and Playwright's Chromium installed.
set -euo pipefail
eval "$(pnpm exec supabase status -o env | grep -E '^[A-Z_]+=')"

export SITE_URL=http://localhost:3000
export NEXT_PUBLIC_SUPABASE_URL=$API_URL
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
export SUPABASE_SECRET_KEY=$SECRET_KEY
# The development extension build (pinned ID, apps/extension/manifest.config.ts).
export NEXT_PUBLIC_EXTENSION_ID=jfklbpedlpkginmdfckogdgaggmdmkbk
export NEXT_TELEMETRY_DISABLED=1

pnpm --filter @careeros/web build
VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY \
  pnpm --filter @careeros/extension build

pnpm --filter @careeros/web start -p 3000 > web-integration-server.log 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
# Fails the run (with the server log) when the server never answers or dies; no test runs then.
scripts/ci/wait-for-server.sh http://localhost:3000/sign-in "$server" web-integration-server.log

export DASHBOARD_URL=$SITE_URL API_URL PUBLISHABLE_KEY SECRET_KEY DB_CONTAINER=supabase_db_careeros
pnpm --filter @careeros/web test:integration
pnpm --filter @careeros/extension test:integration
pnpm --filter @careeros/extension test:e2e

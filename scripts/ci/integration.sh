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
# ADM-08, acceptance 4: a random canary in place of the ledger token. GitHub answers 401, so /admin
# shows "Ledger unavailable (HTTP 401)"; the canary must appear nowhere in the build, the HTML or the log.
OPS_LEDGER_TOKEN=canary_$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
export OPS_LEDGER_TOKEN

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
# The admin test rendered /admin as an admin with the canary token configured (its HTML is checked there).
# A missing build or an empty log must fail, not pass as "no leak" (grep exit 2 = error).
test -d apps/web/.next && test -s web-integration-server.log || {
  echo "Canary check: apps/web/.next or the server log is missing" >&2
  exit 1
}
canary_rc=0
grep -rqF -- "$OPS_LEDGER_TOKEN" apps/web/.next web-integration-server.log || canary_rc=$?
if [ "$canary_rc" -gt 1 ]; then
  echo "Canary check: grep failed (exit $canary_rc)" >&2
  exit 1
fi
if [ "$canary_rc" -eq 0 ]; then
  echo "OPS_LEDGER_TOKEN canary found in the build output or the server log" >&2
  exit 1
fi
pnpm --filter @careeros/extension test:integration
pnpm --filter @careeros/extension test:e2e

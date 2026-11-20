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
# ENV-05c, PRB-23 (#242): the dashboard hides features that need a newer extension than the store's. The suites
# test them against the extension built here, so the "store version" is this package's version.
EXTENSION_STORE_VERSION=$(node -p "require('./apps/extension/package.json').version")
export EXTENSION_STORE_VERSION
# ADM-08, acceptance 4: a random canary in place of the ledger token; it must appear nowhere in the
# build, the HTML or the log. TEST-01 (#232): /admin's GitHub reads go to a local stub with invented
# data (scripts/ci/github-stub.ts), which accepts only this token. The switch is read by the
# server started below only, and ignored on Vercel (githubApiBase in apps/web/lib/env.ts).
OPS_LEDGER_TOKEN=canary_$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
export OPS_LEDGER_TOKEN
export OPS_GITHUB_API_STUB=http://127.0.0.1:4010

pnpm --filter @careeros/web build
VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY \
  pnpm --filter @careeros/extension build

node scripts/ci/github-stub.ts 4010 > github-stub.log 2>&1 &
stub=$!
pnpm --filter @careeros/web start -p 3000 > web-integration-server.log 2>&1 &
server=$!
trap 'kill $server $stub 2>/dev/null || true' EXIT
scripts/ci/wait-for-server.sh http://127.0.0.1:4010/health "$stub" github-stub.log
# Fails the run (with the server log) when the server never answers or dies; no test runs then.
scripts/ci/wait-for-server.sh http://localhost:3000/sign-in "$server" web-integration-server.log

export DASHBOARD_URL=$SITE_URL API_URL PUBLISHABLE_KEY SECRET_KEY DB_CONTAINER=supabase_db_careeros
pnpm --filter @careeros/web test:integration
# The admin tests rendered /admin as an admin with the canary token configured (the HTML is checked there).
# A missing build or an empty log must fail, not pass as "no leak" (grep exit 2 = error).
test -d apps/web/.next && test -s web-integration-server.log || {
  echo "Canary check: apps/web/.next or the server log is missing" >&2
  exit 1
}
canary_rc=0
grep -rqF -- "$OPS_LEDGER_TOKEN" apps/web/.next web-integration-server.log github-stub.log || canary_rc=$?
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

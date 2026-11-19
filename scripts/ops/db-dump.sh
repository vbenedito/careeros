#!/usr/bin/env bash
# Writes a data-only dump of CareerOS to stdout (#31, docs/operations.md). The schema is not
# included: it is the migrations in this repository, so restore = migrations + this dump.
# Not included on purpose: private.link_requests (rate-limit state) and auth sessions (every
# user signs in and connects the extension again after a restore to a new project), and
# public.plans (configuration owned by the migrations, restored with the schema).
# public.admins IS dumped: it holds only user ids, and losing it would silently lock the admin out
# (rows are added by hand, so the migrations cannot recreate them). It references auth.users,
# which is dumped too, and pg_dump writes auth.users first (foreign-key order).
# pg_dump writes table data in foreign-key order (study_sessions before study_session_problems);
# backup-restore-test.sh proves the round trip in CI.
# Usage: PGURL=<postgres-url> scripts/ops/db-dump.sh
# The URL holds the database password: it is read from the environment and handed to Docker
# by name, so it never appears in a command line, process list or shell history.
set -euo pipefail
: "${PGURL:?set PGURL to the database connection string}"
export PGURL
# pg_dump must not be older than the server (supabase/config.toml: major_version = 17).
image=${PG_IMAGE:-postgres:17@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f}
docker run --rm --network host -e PGURL "$image" \
  sh -c 'pg_dump "$PGURL" --data-only --no-owner --no-privileges \
    --table=auth.users --table=auth.identities \
    --table=public.tracked_domains --table=public.study_sessions \
    --table=public.account_settings --table=public.study_session_problems \
    --table=public.admins'

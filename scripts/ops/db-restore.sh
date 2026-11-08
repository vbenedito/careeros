#!/usr/bin/env bash
# Restores a data-only dump made by db-dump.sh into a database that already has the schema
# (`supabase db reset` locally, or `supabase db push --remote` on a new project). One transaction: all
# or nothing. Usage: PGURL=<postgres-url> scripts/ops/db-restore.sh < dump.sql
# The URL is read from the environment, never from a command line (it holds the password).
set -euo pipefail
: "${PGURL:?set PGURL to the database connection string}"
export PGURL
image=${PG_IMAGE:-postgres:17@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f}
docker run --rm -i --network host -e PGURL "$image" \
  sh -c 'psql "$PGURL" --quiet --single-transaction --set ON_ERROR_STOP=1'

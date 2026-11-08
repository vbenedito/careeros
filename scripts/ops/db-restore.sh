#!/usr/bin/env bash
# Restores a data-only dump made by db-dump.sh into a database that already has the schema
# (`supabase db reset` locally, or `supabase db push` on a new project). One transaction: all
# or nothing. Usage: scripts/ops/db-restore.sh <postgres-url> < dump.sql
set -euo pipefail
url=${1:?usage: db-restore.sh <postgres-url> < dump.sql}
image=${PG_IMAGE:-postgres:17}
docker run --rm -i --network host -e PGURL="$url" "$image" \
  psql "$PGURL" --quiet --single-transaction --set ON_ERROR_STOP=1

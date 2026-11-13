#!/usr/bin/env bash
# Runs a read-only SQL file (it must open its own `begin; set transaction read only;`) against a
# database with psql and writes the CSV result to stdout (ENV-13, ENV-08; used by health.yml and
# migrate.yml). Same pinned PostgreSQL image as db-dump.sh.
# Usage: PGURL=<postgres-url> scripts/ops/db-readonly.sh scripts/ops/health.sql > out.csv
# The URL holds the database password: read from the environment and handed to Docker by name,
# so it never appears in a command line or process list. psql errors go to stderr; the caller
# redacts connection strings before showing them.
set -euo pipefail
: "${PGURL:?set PGURL to the database connection string}"
file=${1:?usage: db-readonly.sh <sql-file>}
export PGURL
here=$(cd "$(dirname "$file")" && pwd)
name=$(basename "$file")
if ! grep -qi '^set transaction read only;' "$here/$name"; then
  echo "refusing to run $name: it has no 'set transaction read only;' line" >&2
  exit 2
fi
image=${PG_IMAGE:-postgres:17@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f}
docker run --rm --network host -e PGURL \
  -v "$here/$name:/query.sql:ro" "$image" \
  sh -c 'psql "$PGURL" --no-psqlrc --quiet -v ON_ERROR_STOP=1 --csv -f /query.sql'

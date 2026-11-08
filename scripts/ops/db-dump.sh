#!/usr/bin/env bash
# Writes a data-only dump of CareerOS to stdout (#31, docs/operations.md). The schema is not
# included: it is the migrations in this repository, so restore = migrations + this dump.
# Usage: scripts/ops/db-dump.sh <postgres-url>   (pg_dump runs in Docker, matching the server major)
set -euo pipefail
url=${1:?usage: db-dump.sh <postgres-url>}
image=${PG_IMAGE:-postgres:17}
docker run --rm --network host -e PGURL="$url" "$image" \
  sh -c 'pg_dump "$PGURL" --data-only --no-owner --no-privileges \
    --table=auth.users --table=auth.identities \
    --table=public.tracked_domains --table=public.study_sessions'

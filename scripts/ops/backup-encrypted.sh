#!/usr/bin/env bash
# Writes an encrypted, compressed data-only dump of the database to <file> (#31, #147):
# db-dump.sh | gzip -9 | age. The plaintext never touches the disk. Used by backup.yml and by
# migrate.yml before it applies migrations.
# Usage: PGURL=<postgres-url> AGE_RECIPIENT=<age public key> scripts/ops/backup-encrypted.sh <file>
# The URL is read from the environment, never from a command line (it holds the password).
set -euo pipefail
: "${PGURL:?set PGURL to the database connection string}"
: "${AGE_RECIPIENT:?set AGE_RECIPIENT to the age public key}"
out=${1:?usage: backup-encrypted.sh <output file>}
umask 077
# Data only: the schema is the migrations (restore = migrations + this dump).
"$(dirname "$0")/db-dump.sh" \
  | gzip -9 \
  | age --encrypt --recipient "$AGE_RECIPIENT" > "$out"
test -s "$out"
ls -l "$out"

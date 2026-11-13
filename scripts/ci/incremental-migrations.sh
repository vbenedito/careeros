#!/usr/bin/env bash
# Incremental migration path (ENV-08, grill T1). Production gets `supabase db push` on a database
# that already has the previous migrations and data, but CI normally applies every migration to an
# empty database. When a change adds migrations, this script reproduces the production path on the
# local stack: apply ONLY the migrations of the base commit (read with `git show`, not from the
# working tree) and the seed, then apply the full set with `supabase migration up`, then run the
# pgTAP suite. Without new migrations it does nothing.
# Usage: BASE_SHA=<commit> scripts/ci/incremental-migrations.sh   (local stack running)
#   BASE_SHA: pull request base commit, or the push's "before" commit.
# A migration already on the base that was edited or deleted FAILS the run (AGENTS.md §3: never
# edit an applied migration).
set -euo pipefail
dir=supabase/migrations
base=${BASE_SHA:-}

if [ -z "$base" ] || [[ "$base" =~ ^0+$ ]]; then
  echo "No base commit (new branch?): skipping the incremental migration test."
  exit 0
fi
if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  git fetch --no-tags --depth=1 origin "$base" || {
    echo "::warning::Base commit ${base} cannot be fetched (force push?): skipping the incremental migration test."
    exit 0
  }
fi

added=() changed=()
while IFS=$'\t' read -r status path; do
  [ -n "$status" ] || continue
  if [ "$status" = "A" ]; then added+=("$path"); else changed+=("$status $path"); fi
done < <(git diff --name-status --no-renames "$base" HEAD -- "$dir")

if [ "${#changed[@]}" -gt 0 ]; then
  for entry in "${changed[@]}"; do
    echo "::error::A migration that exists on the base commit was changed or deleted (${entry}). Never edit an applied migration: add a new one."
  done
  exit 1
fi
if [ "${#added[@]}" -eq 0 ]; then
  echo "No new migrations since ${base:0:7}: skipping the incremental migration test."
  exit 0
fi
echo "New migrations since ${base:0:7}:"
printf '  %s\n' "${added[@]}"

# Swap in the base commit's migrations; always put the working tree's back.
work=$(mktemp -d)
mv "$dir" "$work/full"
mkdir "$dir"
restore() {
  if [ -d "$work/full" ]; then
    rm -rf "$dir"
    mv "$work/full" "$dir"
  fi
}
trap restore EXIT
while IFS= read -r file; do
  [ -n "$file" ] || continue
  git show "${base}:${file}" > "$dir/$(basename "$file")"
done < <(git ls-tree --name-only "$base" -- "$dir/")

echo "Applying the base migrations and the seed (what production already has)..."
pnpm exec supabase db reset
restore
trap - EXIT

echo "Applying the new migrations on top (supabase migration up)..."
pnpm exec supabase migration up

echo "Running the database tests on the incrementally migrated database..."
pnpm db:test

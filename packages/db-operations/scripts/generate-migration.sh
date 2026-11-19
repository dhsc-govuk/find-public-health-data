#!/usr/bin/env bash
# Runs drizzle-kit generate with the arguments given (e.g. --name create-topic), then keeps only
# the newest two snapshots in drizzle/meta. Each snapshot is a full copy of the schema, so keeping
# every one grows the repository by the whole schema with each migration. generate diffs the schema
# against the newest snapshot only, and the one before lets drizzle-kit drop undo the newest
# migration. The migrator reads only the SQL files and the journal.
set -euo pipefail
cd "$(dirname "$0")/.."

drizzle-kit generate "$@"

shopt -s nullglob
# Zero-padded names, so the glob's order is the migrations' order.
snapshots=(drizzle/meta/*_snapshot.json)
if [ "${#snapshots[@]}" -gt 2 ]; then
  rm -- "${snapshots[@]:0:${#snapshots[@]}-2}"
fi

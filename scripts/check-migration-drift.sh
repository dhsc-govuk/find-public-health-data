#!/usr/bin/env bash
# Fails when the schema differs from the latest snapshot in packages/db-operations/drizzle/meta:
# drizzle-kit generate, run against a copy of packages/db-operations/drizzle, would write a new
# migration. drizzle-kit check runs first, for migrations that collide with each other. Needs no
# database: drizzle-kit takes its settings from the flags below rather than drizzle.config.ts,
# which needs the connection env, so the flags must say what the config says (dialect, schema,
# casing).
set -euo pipefail
cd "$(dirname "$0")/../packages/db-operations"

# drizzle-kit loads the schema's workspace imports from dist, as the root db:generate does.
if ! build=$(pnpm --filter @fphd/config --filter @fphd/utils build 2>&1); then
  echo "${build}" >&2
  exit 1
fi

pnpm exec drizzle-kit check --dialect postgresql --out ./drizzle

# Inside the package, because drizzle-kit takes --out as a path relative to it.
copy=$(mktemp -d "${PWD}/.migration-drift.XXXXXX")
trap 'rm -rf "${copy}"' EXIT
cp -R drizzle/. "${copy}"

# No input, so a change drizzle-kit would ask about (a rename) fails rather than waits. drizzle-kit
# exits 0 even on a failed prompt, so success is its own report that nothing would be written.
if ! output=$(pnpm exec drizzle-kit generate --dialect postgresql --schema ../db/src/schema.ts \
  --casing snake_case --out "./$(basename "${copy}")" </dev/null 2>&1) ||
  ! grep -q 'No schema changes, nothing to migrate' <<<"${output}"; then
  echo "${output}" >&2
  echo 'The schema has changes no migration holds: run `pnpm db:generate --name <name>`.' >&2
  exit 1
fi

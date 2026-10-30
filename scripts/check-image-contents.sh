#!/usr/bin/env bash
# Checks a production image ships only what its app runs. No image carries TypeScript: the web
# apps run their `.ts` through Node's type stripping and the rest run compiled JavaScript, so the
# compiler only arrives through a dependency's optional peer, which `.pnpmfile.mjs` drops. Only
# the operations image carries the database operations: `@fphd/db-operations`, its migrations and
# its seed data. The operations image must still hold every migration its journal lists, the core
# data and the seed, none of which its smoke test reaches.
#
# ci.yml runs it against each image it builds, which on main are the images publish-images.yml
# pushes. It also runs by hand against any local tag:
#
#   scripts/check-image-contents.sh public-api fphd-ci/public-api:ci
set -euo pipefail

app=${1:-}
image=${2:-}
if [ -z "${app}" ] || [ -z "${image}" ]; then
  echo "usage: check-image-contents.sh <app> <image>" >&2
  exit 1
fi

# GitHub renders `::error::` as a job annotation; by hand the prefix is noise.
fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::${1}" >&2
  else
    echo "${1}" >&2
  fi
  exit 1
}

# Lists what the image holds under /app that matches the find expression given as arguments.
# Runs the image's own busybox find, bypassing the entrypoint, so nothing of the app starts.
find_in_image() {
  docker run --rm --entrypoint find "${image}" /app "$@"
}

typescript=$(find_in_image -path '*/node_modules/typescript')
[ -z "${typescript}" ] || fail "${app} ships TypeScript:
${typescript}"

case "${app}" in
  operations)
    # Run by the image's own Node, which prints each missing path. An empty or unreadable journal
    # counts as missing, so a pruned drizzle/ cannot pass by listing nothing.
    missing=$(docker run --rm -i --entrypoint node "${image}" --input-type=module - <<'EOF'
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = '/app/node_modules/@fphd/db-operations';
const journal = `${root}/drizzle/meta/_journal.json`;
const missing = [];
let entries = [];
try {
  entries = JSON.parse(readFileSync(journal, 'utf8')).entries ?? [];
} catch {}
if (entries.length === 0) missing.push(`${journal} (or its entries)`);
for (const { tag } of entries) {
  const migration = `${root}/drizzle/${tag}.sql`;
  if (!existsSync(migration)) missing.push(migration);
}
if (!existsSync(`${root}/data/topics.json`)) missing.push(`${root}/data/topics.json`);
const seed = `${root}/data/seed`;
if (!existsSync(seed) || !readdirSync(seed).some((name) => name.endsWith('.csv.gz'))) {
  missing.push(`${seed}/*.csv.gz`);
}
console.log(missing.join('\n'));
EOF
    )
    [ -z "${missing}" ] || fail "${app} is missing:
${missing}"
    ;;
  public-web | internal-web | public-api | internal-api)
    operations=$(find_in_image \
      -path '*/node_modules/@fphd/db-operations' -o -name '*.sql' -o -name '*.csv.gz' \
      -o -name 'drizzle.config.*')
    [ -z "${operations}" ] || fail "${app} ships database operations:
${operations}"
    ;;
  *)
    fail "check-image-contents.sh does not know the app ${app}"
    ;;
esac

echo "${app}: image contents as expected"

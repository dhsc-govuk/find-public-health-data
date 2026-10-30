#!/usr/bin/env bash
# Starts a production image and checks it comes up: a server logs `Listening` once bound, the
# operations CLI prints its usage and exits 2. Either shows that every module the app imports at
# runtime resolved from the tree `pnpm deploy --prod` pruned. The failure this catches is a runtime
# import declared as a devDependency, which compiles everywhere and is missing only here.
#
# ci.yml runs it against each image it builds, which on main are the images publish-images.yml
# pushes. It also runs by hand against any local tag:
#
#   scripts/smoke-image.sh public-web fphd-ci/public-web:ci
set -euo pipefail

app=${1:-}
image=${2:-}
if [ -z "${app}" ] || [ -z "${image}" ]; then
  echo "usage: smoke-image.sh <app> <image>" >&2
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

# The union of every app's required config; each app ignores the keys it does not read. DB_HOST
# points at nothing: an API logs the unreachable database and carries on serving, and a service
# container would add a minute per image for nothing this test checks.
env_args=(
  -e APP_ENV=dev
  -e DB_HOST=127.0.0.1
  -e DB_TLS=false
  -e POSTGRES_DB=fphd
  -e POSTGRES_USER=fphd
  -e POSTGRES_PASSWORD=smoke-test-only
  -e PUBLIC_API_PASSWORD=smoke-test-only
  -e INTERNAL_API_PASSWORD=smoke-test-only
  -e SESSION_JWT_SECRET=smoke-test-only-jwt-secret-at-least-32-bytes
  -e WEB_SESSION_SECRET=smoke-test-only-web-secret-at-least-32-bytes
  -e STORAGE_CONTAINER=uploads
  -e STORAGE_ACCOUNT_URL=https://smoketestonly.blob.core.windows.net
  -e AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000
)

if [ "${app}" = 'operations' ]; then
  # With no arguments the CLI prints its usage and exits 2, which means config.ts and every module
  # behind it resolved. Detached and polled so that an image which starts something long-running
  # fails in 30s instead of hanging until the job's 30-minute timeout.
  cid=$(docker run -d "${env_args[@]}" "${image}")
  status=''
  for _ in $(seq 1 30); do
    status=$(docker inspect -f '{{if .State.Running}}{{else}}{{.State.ExitCode}}{{end}}' "${cid}")
    if [ -n "${status}" ]; then break; fi
    sleep 1
  done
  logs=$(docker logs "${cid}" 2>&1)
  docker rm -f "${cid}" > /dev/null
  echo "${logs}"
  [ -n "${status}" ] || fail "${app} was still running after 30s, expected the usage and exit 2"
  [ "${status}" -eq 2 ] || fail "${app} exited ${status}, expected 2 (usage)"
  grep -q 'Usage: operations' <<<"${logs}" || fail "${app} did not print its usage"
  exit 0
fi

# A module missing from the pruned tree fails well before the bind, with ERR_MODULE_NOT_FOUND.
cid=$(docker run -d "${env_args[@]}" "${image}")
for _ in $(seq 1 30); do
  if docker logs "${cid}" 2>&1 | grep -q '"msg":"Listening"'; then break; fi
  sleep 1
done
logs=$(docker logs "${cid}" 2>&1)
docker rm -f "${cid}" > /dev/null
echo "${logs}"
grep -q '"msg":"Listening"' <<<"${logs}" || fail "${app} did not start"

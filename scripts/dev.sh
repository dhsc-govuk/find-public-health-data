#!/usr/bin/env bash
# Mixed local/Docker development: apps named as arguments run locally via pnpm;
# the rest run as Docker containers (built fresh, plus the database).
#
#   pnpm dev:mixed internal-api                 # internal-api local, the other apps in containers
#   pnpm dev:mixed internal-web internal-api    # internal pair local, public pair and worker in containers
#   pnpm dev:mixed public-web internal-web      # both webs local, both APIs and the worker in containers
#
# Ctrl-C stops the local apps and the app containers; the database stays up.
# All local is `pnpm dev`; all in containers is
# `docker compose --profile public-web --profile internal-web --profile public-api --profile internal-api --profile internal-worker up --build`.
set -euo pipefail
cd "$(dirname "$0")/.."

all_apps=(public-web internal-web public-api internal-api internal-worker)

usage() {
  echo "usage: pnpm dev:mixed <app>...   (equivalently: scripts/dev.sh <app>...)" >&2
  echo "  apps: ${all_apps[*]}" >&2
  echo "  named apps run locally; the rest run as Docker containers" >&2
}

if (($# == 0)); then
  usage
  exit 1
fi

local_apps=()
for arg in "$@"; do
  found=0
  for app in "${all_apps[@]}"; do
    if [[ $arg == "$app" ]]; then
      found=1
      break
    fi
  done
  if ((found == 0)); then
    echo "unknown app: $arg" >&2
    usage
    exit 1
  fi
  local_apps+=("$arg")
done

container_apps=()
for app in "${all_apps[@]}"; do
  is_local=0
  for l in "${local_apps[@]}"; do
    [[ $app == "$l" ]] && is_local=1
  done
  ((is_local == 0)) && container_apps+=("$app")
done

# db carries no profile, so it starts either way — including when every app is local
# and there are no app containers to ask for. bash 3.2 (the macOS default) treats an
# empty array under `set -u` as unbound, so that case can't share the code path.
#
# --wait blocks until every started container passes its healthcheck, matching what
# scripts/services.sh gives the other dev scripts. It covers the app containers too, so a
# local web app cannot start proxying to an API container that is still booting.
if ((${#container_apps[@]} > 0)); then
  profile_flags=()
  for app in "${container_apps[@]}"; do
    profile_flags+=(--profile "$app")
  done

  # Armed before the containers start, not after: `up --build` can run for minutes,
  # and a Ctrl-C partway through would otherwise leave the containers it had already
  # started behind. Cleanup is best-effort — the EXIT trap's status becomes the
  # script's, so a failing stop must not be what the run reports.
  stop_containers() {
    echo "Stopping containers: ${container_apps[*]}" >&2
    docker compose "${profile_flags[@]}" stop "${container_apps[@]}" || true
  }
  trap stop_containers EXIT

  echo "Starting containers: ${container_apps[*]} (+ db)" >&2
  docker compose "${profile_flags[@]}" up --detach --build --wait
else
  echo "Starting containers: db" >&2
  docker compose up --detach --build --wait
fi

filter_flags=()
for app in "${local_apps[@]}"; do
  filter_flags+=(--filter "@fphd/${app}")
done

echo "Running locally: ${local_apps[*]}" >&2
pnpm --parallel "${filter_flags[@]}" run dev

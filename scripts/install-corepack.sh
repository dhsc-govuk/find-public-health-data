#!/bin/sh
# Installs the corepack version that the catalog in pnpm-workspace.yaml pins, then enables it, so
# that `pnpm` runs the version package.json's packageManager names. Node stopped shipping corepack
# in version 25. Both Dockerfiles and .github/actions/setup-node-pnpm run this, which keeps the
# catalog the only place the version is written, and the lockfile entry puts it in the audit.
#
# POSIX sh, because the Alpine base image has no bash. Pass the workspace file's path when it is
# not in the current directory:
#
#   scripts/install-corepack.sh [path/to/pnpm-workspace.yaml]
set -eu

workspace=${1:-pnpm-workspace.yaml}
version=$(sed -n 's/^  corepack: \(.*\)$/\1/p' "${workspace}")

# Exactly one plain version. An empty match would install whatever npm calls latest, and two
# matches would join with a newline, which this pattern also rejects.
case "${version}" in
  "" | *[!0-9.]*)
    echo "Expected one exact corepack version in the catalog in ${workspace}, got '${version}'" >&2
    exit 1
    ;;
esac

npm install --global "corepack@${version}"
corepack enable

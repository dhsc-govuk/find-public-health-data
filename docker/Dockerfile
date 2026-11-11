# syntax=docker/dockerfile:1

# Production images, one per deployable app. The builder stage is shared, so the install and
# the workspace build are cached once across all of them. `--target` picks the runtime shape
# and `APP` picks the app. That is why six images come from three targets: the two web apps
# share one runtime stage, and the two APIs and the internal worker share another:
#
#   docker build -f docker/Dockerfile --target web --build-arg APP=public-web    -t public-web    .
#   docker build -f docker/Dockerfile --target web --build-arg APP=internal-web  -t internal-web  .
#   docker build -f docker/Dockerfile --target api --build-arg APP=public-api    -t public-api    .
#   docker build -f docker/Dockerfile --target api --build-arg APP=internal-api  -t internal-api  .
#   docker build -f docker/Dockerfile --target api --build-arg APP=internal-worker -t internal-worker .
#   docker build -f docker/Dockerfile --target operations --build-arg APP=operations -t operations .
#
# Add `--build-arg REVISION=$(git rev-parse HEAD)` to any of these to log the commit on start-up.
#
# ci.yml builds the server images together from docker/docker-bake.hcl, and the operations image
# through .github/actions/build-image, then smoke-tests and scans them. On a push to main,
# publish-images.yml pushes those images once every check has passed.
#
# docker/app.Dockerfile is the separate development image (see scripts/dev.sh); it keeps the
# whole workspace and devDependencies, which is exactly what these must not do.

# Pinned by digest, so the base cannot change underneath a rebuild and has a version Dependabot
# can raise — see .github/dependabot.yml. The Alpine release is named rather than left to the
# floating `26-alpine` alias: Dependabot resolves the alias to raise the digest, so the day Node
# retargets it, that bump would move the whole package set — including the `postgresql18-client`
# the operations stage asks for by name — without anyone choosing to.
#
# The runtime stage runs `apk upgrade` so security fixes apply at build time rather than waiting
# for the base image to be rebuilt with them — a red scan means a fix apk could not deliver,
# not upstream rebuild lag. The builder stage skips it; nothing in it ships.
FROM node:26-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Node stopped shipping corepack in version 25, so it comes from npm at the version the catalog
# pins. Corepack then fetches the pnpm that package.json's packageManager names and checks it
# against the hash there. Bind mounts rather than COPY, so neither file stays in the stage.
RUN --mount=type=bind,source=scripts/install-corepack.sh,target=/tmp/install-corepack.sh \
    --mount=type=bind,source=pnpm-workspace.yaml,target=/tmp/pnpm-workspace.yaml \
    sh /tmp/install-corepack.sh /tmp/pnpm-workspace.yaml
WORKDIR /repo

FROM base AS builder

# Copy the dependency files and patches before the source, so this layer and the fetch below stay
# cached until a dependency changes. Every app image shares this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline

# The whole workspace, so one build serves every image built from the same context. The packages
# the Node runtime consumes resolve to dist/ through their `default` export condition, so an
# unbuilt one would be missing at runtime rather than at build time. Only what `pnpm deploy`
# copies below reaches an image, so the other apps' output never does.
RUN pnpm build

# Fail here on an unknown APP, not at runtime with an empty image. Checked against the workspace
# so adding an app needs no edit to this file.
ARG APP
RUN test -n "${APP}" && test -d "apps/${APP}" \
      || { echo "APP build arg must name a directory in apps/ (got '${APP}')" >&2; exit 1; }

# Copies the app and only the workspace packages it actually depends on into a self-contained
# tree, with devDependencies pruned and each package cut down to its `files`. --legacy because
# the non-legacy implementation requires injected workspace packages, which this workspace does
# not use.
RUN pnpm deploy --filter "@fphd/${APP}" --prod --legacy /out

FROM node:26-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS runtime
ENV NODE_ENV=production
# Container Apps stops a revision with SIGTERM, and the kernel discards a default-action
# signal sent to PID 1 unless that process installed a handler — which Node does not do for
# SIGTERM. Without an init, every stop would wait out the full grace period and then SIGKILL.
#
# Every app starts with node, so the base image's npm goes: it would only carry CVEs that the
# OS-package scan does not see. The Node 26 image ships no yarn or corepack. Each path in full,
# since busybox sh has no brace expansion. scripts/check-image-contents.sh fails if any package
# manager is back.
RUN apk upgrade --no-cache \
  && apk add --no-cache tini \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]

FROM runtime AS api
COPY --from=builder --chown=node:node /out /app
# The commit, which the server logs on start-up. Declared last in each stage, so a new commit
# rebuilds no layer before it. Unset, the app logs `unknown`.
ARG REVISION
ENV REVISION=${REVISION}
# HOST and PORT come from the environment; the app defaults to 0.0.0.0 and its own port.
CMD ["node", "dist/server.js"]

FROM runtime AS web
COPY --from=builder --chown=node:node /out /app
# As in the api stage.
ARG REVISION
ENV REVISION=${REVISION}
# server.ts, not a compiled entrypoint: the web apps' server is run by Node's type stripping,
# which is why tsconfig.base.json sets erasableSyntaxOnly. Everything it imports from the
# workspace resolves to compiled dist/ output.
CMD ["node", "server.ts"]

FROM runtime AS operations
USER root
# The database has no public endpoint, so a container inside the VNet is the only path to it
# for ad-hoc work. psql is here for that; the CLI below covers the scripted jobs.
#
# Version 18 to match the server: psql itself would connect to a newer server, but pg_dump
# refuses to, so a client older than the server cannot back up the database this image exists
# to reach.
RUN apk add --no-cache postgresql18-client
USER node
COPY --from=builder --chown=node:node /out /app
# As in the api stage, though only the servers log it.
ARG REVISION
ENV REVISION=${REVISION}
# No default command worth running unattended — a job names the one it wants. Bare, this
# prints the usage and exits non-zero.
CMD ["node", "dist/cli.js"]

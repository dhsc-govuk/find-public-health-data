# syntax=docker/dockerfile:1

# Production images, one per deployable app. The builder stage is shared, so the install and
# the workspace build are cached once across all of them. `--target` picks the runtime shape
# and `APP` picks the app, which is why five images come out of three targets — the two web
# apps have identical runtime stages, as do the two APIs:
#
#   docker build -f docker/Dockerfile --target web --build-arg APP=public-web    -t public-web    .
#   docker build -f docker/Dockerfile --target web --build-arg APP=internal-web  -t internal-web  .
#   docker build -f docker/Dockerfile --target api --build-arg APP=public-api    -t public-api    .
#   docker build -f docker/Dockerfile --target api --build-arg APP=internal-api  -t internal-api  .
#   docker build -f docker/Dockerfile --target operations --build-arg APP=operations -t operations .
#
# Two workflows build this list, one matrix job per row, both through .github/actions/build-image
# so the flags live in one place: ci.yml on every pull request, publish-images.yml on main. Each
# builds, smoke-tests and scans; only the second pushes.
#
# docker/app.Dockerfile is the separate development image (see scripts/dev.sh); it keeps the
# whole workspace and devDependencies, which is exactly what these must not do.

# Pinned by digest, so the base cannot change underneath a rebuild and has a version Dependabot
# can raise — see .github/dependabot.yml. The Alpine release is named rather than left to the
# floating `24-alpine` alias: Dependabot resolves the alias to raise the digest, so the day Node
# retargets it, that bump would move the whole package set — including the `postgresql18-client`
# the operations stage asks for by name — without anyone choosing to.
#
# The runtime stage runs `apk upgrade` so security fixes apply at build time rather than waiting
# for the base image to be rebuilt with them — a red scan means a fix apk could not deliver,
# not upstream rebuild lag. The builder stage skips it; nothing in it ships.
FROM node:26-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS builder

# Deps layer keyed on the lockfile alone, so source edits don't re-download packages. Both
# this and the install below sit before `ARG APP`, so all five images share them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline

# Fail here on an unknown APP, not at runtime with an empty image. Checked against the workspace
# so adding an app needs no edit to this file.
ARG APP
RUN test -n "${APP}" && test -d "apps/${APP}" \
      || { echo "APP build arg must name a directory in apps/ (got '${APP}')" >&2; exit 1; }

# `...` builds the app's workspace dependencies first: the packages the Node runtime consumes
# resolve to dist/ through their `default` export condition, so an unbuilt one is missing at
# runtime rather than at build time.
RUN pnpm --filter "@fphd/${APP}..." build

# Copies the app and only the workspace packages it actually depends on into a self-contained
# tree, with devDependencies pruned and each package cut down to its `files`. --legacy because
# the non-legacy implementation requires injected workspace packages, which this workspace does
# not use.
RUN pnpm deploy --filter "@fphd/${APP}" --prod --legacy /out

FROM node:26-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS runtime
ENV NODE_ENV=production
# Container Apps stops a revision with SIGTERM, and the kernel discards a default-action
# signal sent to PID 1 unless that process installed a handler — which Node does not do for
# SIGTERM. Without an init, every stop would wait out the full grace period and then SIGKILL.
RUN apk upgrade --no-cache \
  && apk add --no-cache tini
WORKDIR /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]

FROM runtime AS api
COPY --from=builder --chown=node:node /out /app
# HOST and PORT come from the environment; the app defaults to 0.0.0.0 and its own port.
CMD ["node", "dist/server.js"]

FROM runtime AS web
COPY --from=builder --chown=node:node /out /app
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
# No default command worth running unattended — a job names the one it wants. Bare, this
# prints the usage and exits non-zero.
CMD ["node", "dist/cli.js"]

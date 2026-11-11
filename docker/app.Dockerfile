# syntax=docker/dockerfile:1

# Development-only image for running any one app as a container while others run
# locally (see scripts/dev.sh). Not a production image: it keeps the full workspace
# and devDependencies, so one Dockerfile serves every app and the apps share cached
# layers. Select the app with
# --build-arg APP=<public-web|internal-web|public-api|internal-api|internal-worker>.
FROM node:26-alpine3.24

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Node stopped shipping corepack in version 25; see the base stage in docker/Dockerfile.
RUN --mount=type=bind,source=scripts/install-corepack.sh,target=/tmp/install-corepack.sh \
    --mount=type=bind,source=pnpm-workspace.yaml,target=/tmp/pnpm-workspace.yaml \
    sh /tmp/install-corepack.sh /tmp/pnpm-workspace.yaml
WORKDIR /repo

# Deps layer keyed on the lockfile and patches alone, so source edits don't re-download packages.
# pnpm fetch fails without the patch files pnpm-workspace.yaml names.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline

ARG APP
RUN case "${APP}" in \
      public-web | internal-web | public-api | internal-api | internal-worker) ;; \
      *) echo "APP build arg must be one of: public-web internal-web public-api internal-api internal-worker (got '${APP}')" >&2; exit 1 ;; \
    esac
RUN pnpm --filter "@fphd/${APP}..." build

ENV NODE_ENV=production
ENV APP=${APP}
# `exec` so pnpm replaces the shell as PID 1 and SIGTERM reaches the server directly.
# compose sets `init: true`, and tini forwards the signal well enough that the shell
# form stopped promptly there too — but a bare `docker run` of this image has no init,
# and then the wrapping `sh -c` swallows SIGTERM and the stop takes the full 10s
# timeout before SIGKILL.
CMD ["sh", "-c", "exec pnpm --filter \"@fphd/$APP\" start"]

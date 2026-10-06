# Development-only image for running any one app as a container while others run
# locally (see scripts/dev.sh). Not a production image: it keeps the full workspace
# and devDependencies so one Dockerfile serves all four apps and layer caching is
# shared between them. Select the app with --build-arg APP=<public-web|internal-web|public-api|internal-api>.
FROM node:26-alpine3.24

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Deps layer keyed on the lockfile alone, so source edits don't re-download packages.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --prefer-offline

ARG APP
RUN case "${APP}" in \
      public-web | internal-web | public-api | internal-api) ;; \
      *) echo "APP build arg must be one of: public-web internal-web public-api internal-api (got '${APP}')" >&2; exit 1 ;; \
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

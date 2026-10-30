# @fphd/internal-api-features

Routes and repository functions only `internal_api` may run: today, topic administration and the
publisher's view of indicators, listed for the dashboard and read one at a time for the overview
page. The
`internal-` prefix is what `tools/artefact-boundary` keys on, so nothing here can reach a public
image.

Built package; consumed by `internal-api`, and by `@fphd/internal-web-features` for the contract.

| Entry         | Purpose                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `.`           | `internalApiRoutes` (every internal route in one router), `internalTopicsRouter`, `createInternalRepositories` and the repository types |
| `./contract`  | The zod schemas and inferred types for the internal API's request and response bodies, shared with the internal web loaders |
| `./testing`   | `createFakeInternalRepositories` for handler tests                                            |

Queries live in this package's repository files rather than `@fphd/db`, which is the public read
surface.

Each user sees the indicators their roles allow: the dashboard list is filtered in its query by
`indicatorListScope`, or by `ownTeamsListScope` under `teams=own`. A reviewer's list of indicators to
review is filtered by their reviewer rows instead. The overview read answers 404 for one
`canSeeIndicator` refuses, given the row's `indicatorAccess`. Every
route that edits an indicator sits behind `requireIndicatorEditor`, which checks `canEditIndicator`
against the indicator's team: a read answers 404 and a write 403 for a publisher outside it.

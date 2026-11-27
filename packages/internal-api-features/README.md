# @fphd/internal-api-features

The routes and repository functions that only `internal_api` may run. They cover:

- the publisher's work on an indicator: the dashboard list, the overview and its preview, starting a
  new indicator or an update to a live one, the task list's sections, uploading and checking the
  data table, and submitting, withdrawing or discarding a draft
- review: the IMRG manager assigns reviewers, reviewers respond and keep notes, and the publisher
  replies to a request for revisions
- sign-off: the core team decides on a submitted update and an admin confirms the publication date
- the workflow's queues and each indicator's history
- the lists a publisher chooses from: tags, data providers, confidence interval methods, and value
  types and units
- topic administration

`tools/artefact-boundary` uses the `internal-` prefix to keep this package out of the public images.

Built package; consumed by `internal-api`, and by `@fphd/internal-web-features` for the contract.

| Entry        | Purpose                                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | `internalApiRoutes`, one router with every internal route, and the `InternalApiDependencies` it takes. `createInternalRepositories` and the `InternalRepositories` type. `INTERNAL_API_BODY_LIMITS`, passed to `createApiApp`. The types the preview uses |
| `./contract` | The zod schemas and inferred types for the internal API's request and response bodies, shared with the internal web loaders                                                                                                                               |
| `./testing`  | `createFakeInternalRepositories`, `createRouterTestApp`, a test session and actor, and other helpers for handler tests                                                                                                                                    |

Queries live in this package's repository files rather than `@fphd/db`, which is the public read
surface.

The workflow's state machine, its step engine and scheduled publication are in
`@fphd/internal-workflow`; the step functions the routes call, and who may take each step, are here.

Each user sees the indicators their roles allow: the dashboard list is filtered in its query by
`indicatorListScope`, by `ownTeamsListScope` under `teams=own`, or by `otherTeamsListScope` under
`teams=other`. A reviewer's list of indicators to review is filtered by their reviewer rows instead.
Every route that names an indicator by `:id` sits behind `requireIndicatorAccess` with its own
check, such as `canEditIndicator`. The guard answers 404 for an indicator the user doesn't work on
(`canWorkOnIndicator`), whatever the method, and 403 when the route's check refuses a user who works
on it. The overview's detail and the preview sit behind `requireIndicatorViewer` instead, which
admits anyone `canSeeIndicator` lets see the indicator, every publisher included. The preview shows
a user who doesn't work on the indicator only its metadata.

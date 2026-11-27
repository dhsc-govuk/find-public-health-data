# @fphd/internal-web-features

The pages, route modules and loaders that only `internal-web` mounts. They cover:

- the indicators dashboard, and an indicator's overview and its preview
- the publishing journey: name and team, the task list and its sections, uploading and checking the
  data table, replying to a request for revisions, submitting, withdrawing, discarding a draft and
  starting an update
- review: assigning reviewers, reviewers' responses, the core team's decision on an update and the
  publication date
- the publisher guidance, the sign-in pages, topic administration and the manage-data landing page

Loaders call the internal API through the `ApiClient` in `@fphd/web-server/api-context` and check
its responses against `@fphd/internal-api-features/contract`.

Source-only package, bundled by Vite; no build step.

`apps/internal-web/src/routes.ts` references route modules here by file path, as React Router's
route config requires. The package's index exports what the app's own route files import, such as
the preview loader and the sign-in route. It also exports the page and route components that the
app-level tests use.

# @fphd/internal-web-features

The pages, route modules and loaders only `internal-web` mounts: the indicators dashboard, the
indicator overview and its preview, the publishing journey (name and team, the task list and its
sections, the data table upload and check, the reply to a request for revisions, submission,
withdrawal, discarding a draft and starting an update), the review steps (reviewer assignment,
review responses, the core team's decision on an update and the publication date), the publisher
guidance, the sign-in pages, topic administration and the manage-data landing page. Loaders call the
internal API through the `ApiClient` in `@fphd/web-server/api-context` and validate responses
against `@fphd/internal-api-features/contract`.

Source-only package, bundled by Vite; no build step.

`apps/internal-web/src/routes.ts` references route modules here by file path, as React Router's
route config requires. The barrel exports what the app's own route files import, such as the preview
loader and the sign-in route, and the page and route components for the app-level tests.

# @fphd/internal-web-features

The pages, route modules and loaders only `internal-web` mounts: the indicators dashboard, the
indicator overview page, topic administration and the manage-data landing page. Loaders call the
internal API through the `ApiClient` in `@fphd/web-server/api-context` and validate responses
against `@fphd/internal-api-features/contract`.

Source-only package, bundled by Vite; no build step.

`apps/internal-web/src/routes.ts` references route modules here by file path, as React Router's
route config requires. The barrel exports the page and route components for the app-level tests.

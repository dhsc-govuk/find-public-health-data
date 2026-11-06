# @fphd/public-web-features

The pages, route modules and loaders of the public site, mounted by both `public-web` and
`internal-web`. Loaders fetch through the `ApiClient` in `@fphd/web-server/api-context` and validate
responses against `@fphd/public-api-features/contract`; the browser never calls an API directly.

Source-only package, bundled by Vite; no build step.

Each app's `src/routes.ts` references route modules here by file path, as React Router's route
config requires. The barrel exports the page and route components, and the loader result types, for
the apps and their tests.

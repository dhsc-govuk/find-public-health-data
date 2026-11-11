# @fphd/public-web-features

The pages, route modules and loaders of the public site, mounted by both `public-web` and
`internal-web`. Loaders fetch through the `ApiClient` in `@fphd/web-server/api-context` and validate
responses against `@fphd/public-api-features/contract`; the browser never calls an API directly.

Source-only package, bundled by Vite; no build step.

Each app's `src/routes.ts` references route modules here by file path, as React Router's route
config requires. The barrel exports the page and route components, and the loader result types, for
the apps and their tests.

Indicator and topic charts use Recharts. They plot observations from route loaders and keep a
server-rendered table available without JavaScript. Trend lines and area comparisons use a shared
population segment. Scatter plots pair values from the same area and period. Spine charts in
comparison tables use the published range and benchmark, with text explaining each result.

Table loaders use the public API's `observationHistory` contract. Topic highlights request
`lastEightPeriodsPerSeries` to preserve eight periods, including null gaps, for their sparklines.

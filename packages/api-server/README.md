# @fphd/api-server

The Express app both API apps are built from. `public-api` and `internal-api` each call
`createApiApp`, mount `publicApiRoutes` from `@fphd/public-api-features` (and, for the internal
app, `internalApiRoutes`), then `addFallbackHandlers` and `startServer`.

Built package; consumed by the API apps and by `@fphd/internal-api-features`.

| Export                | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `createApiApp`        | `createBaseApp` from `@fphd/express` plus request logging, JSON bodies and the `/api` descriptor. `bodyLimits` lists the routes that raise the 100 kB body limit, each with its own |
| `addFallbackHandlers` | Mounted after every router: the JSON `not_found` fallback, and an error handler that returns JSON and attaches the error to the request log line |
| `requireJwtSession`   | Middleware that reads the session cookie, verifies the JWT and admits the sessions a check from `@fphd/auth/permissions` admits |
| `serverLogging`, `startServer` | Re-exported from `@fphd/express` so an API app depends on this package alone |

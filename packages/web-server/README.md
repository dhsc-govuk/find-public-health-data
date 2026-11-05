# @fphd/web-server

The Node host both web apps run on, and the server-side plumbing their loaders use.

Built package. `apps/*-web/server.ts` calls `startReactRouterServer`; everything else is
imported by `root.tsx`, `entry.server.tsx` and the feature packages' loaders.

| Entry                     | Purpose                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `.`                       | `startReactRouterServer`: Vite middleware in development, `createProductionHost` serving the client build and the server bundle otherwise; `serverLogging` |
| `./react-router`          | `createReactRouterApp`, the Express app around a React Router server build          |
| `./entry-server`          | The `handleRequest` and `handleError` each app's `entry.server.tsx` re-exports      |
| `./api-client`            | The `ApiClient` loaders call the APIs through, with path encoding, timeouts and error mapping in one place |
| `./api-context`           | `apiContext`, the React Router context that hands loaders the client               |
| `./logger-context`        | `loggerContext`, the request's logger, set before `extendContext` runs              |
| `./session`               | `sessionMiddleware`, `getSession`, `createSessionContext`, `createRequireSessionMiddleware` |
| `./flash`                 | The cookie-backed flash session for one-shot messages between requests             |
| `./fake-auth`, `./fake-auth-react-router` | Local sign-in for development and tests                              |
| `./request-id-headers`    | `forwardedRequestIdHeaders`, so an API logs a call under the page request's id     |

`api-client.ts` is also bundled for the browser. It must not import `@fphd/express` or anything
else Node-only.

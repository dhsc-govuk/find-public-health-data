# @fphd/express

The base Express app all four servers start from, and the middleware they share.

Built package; consumed by `@fphd/api-server` and `@fphd/web-server`, never by an app directly.

| Export                       | Purpose                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `createBaseApp`              | The `/livez` and `/readyz` probes and the security headers every response carries |
| `checkDependencies`          | Checks each dependency from start-up, logging "Dependency unreachable at start-up" and retrying until it answers |
| `requestId`, `REQUEST_ID_HEADER` | The per-request id middleware and the header it is carried in between the web apps and the APIs |
| `requestLogging`             | pino-http request logging, mounted by the consumer after any routes it wants kept out of the log |
| `serverLogging`              | The startup and shutdown log lines `startServer` emits                            |
| `startServer`                | Listens, and drains on SIGTERM or SIGINT within the configured timeout            |

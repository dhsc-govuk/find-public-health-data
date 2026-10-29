# @fphd/logger

`createLogger({ name, level, pretty, requestDetails })` returns a pino logger with the service
name on every line. `pretty` is for local development only; the transport it names is a
devDependency and is never resolved in production or in the browser. Pretty output prints each
request as one summary line unless `requestDetails` is set.

Built package with a `browser` export condition, so the same module serves Node and the web
bundles. Everything that logs goes through this package; see `agent-docs/logging.md` for what
is and is not logged.

`@fphd/logger/testing` exports `createCapturingLogger(name)`, a logger whose lines a test can read
back as parsed JSON. Its build output is left out of `files`, so it never reaches an image.

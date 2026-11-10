# @fphd/public-api-features

Every route on the public API surface, and the wire contract the web loaders validate against.
`publicApiRoutes` is mounted by both `public-api` and `internal-api`, so the internal API is a
superset of the public one by construction.

Built package.

| Entry        | Purpose                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `.`          | `publicApiRoutes`, and `areasRouter`, `indicatorsRouter`, `topicsRouter` individually                                  |
| `./contract` | The zod schemas and inferred types for every response body; `@fphd/public-web-features` parses API responses with them |

## Addressing an indicator

`/api/indicators/:indicator`, `/api/indicators/:indicator/data` and
`/api/indicators/:indicator/range` take either public identifier: a digits-only segment is the short
id, anything else is a slug, lower-cased before lookup. Both answer 200 — the API never redirects,
so a client that stored either address keeps working. Any slug a published version carries resolves,
including one a later publication replaced.

Detail, list and search bodies carry `slug` alongside `shortId`. That slug is the canonical one, the
latest published version's, and is what the web apps build links from; the API leaves choosing a
canonical address to them.

Route handlers never build queries. They call repository methods from `createRepositories` in
`@fphd/db`.

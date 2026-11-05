# @fphd/internal-read-models

The statements that write the read models, `available_data` and `observation_range`: the tables
derived from the published views that list which areas and value ranges each indicator has. They
live apart from `@fphd/db`, the public read surface, and the `internal-` prefix keeps them out of
the public images, as `tools/artefact-boundary` checks.

Built package; consumed by `@fphd/db-operations`, whose commands rebuild the read models. It depends
only on `@fphd/db` and `drizzle-orm`, so whatever runs it carries nothing else.

| Entry | Purpose                                                                                     |
| ----- | ------------------------------------------------------------------------------------------- |
| `.`   | `READ_MODEL_TABLES`, and `rebuildReadModelTables`, the whole rebuild inside the caller's transaction |

## Tests

The tests are in the integration tier, against a copy of the seeded template database, so they need
Postgres running (`pnpm services:up`). From the repository root:

```sh
INTEGRATION_DB=1 APP_ENV=test pnpm exec vitest run --project @fphd/internal-read-models
```

`pnpm test:integration` runs them with every other integration test.

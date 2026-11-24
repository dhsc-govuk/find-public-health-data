# @fphd/internal-read-models

The statements that write the read models: the tables derived from the published views.
`available_data` and `observation_range` list which areas and value ranges each indicator has;
`observation_series` and `observation_series_batch` hold the series each table and ranking shows, by
area, sex and period type, and the England trend a topic page shows. The series cache also retains
each sex's elected history for scatter plots; its variants list only offered table choices. They
live apart from `@fphd/db`, the public read surface, and the `internal-` prefix keeps them out of
the public images, as `tools/artefact-boundary` checks.

Built package; consumed by `@fphd/db-operations`, whose commands rebuild the read models, and by
`@fphd/internal-workflow`, whose scheduled publication refreshes them. It depends only on `@fphd/db`
and `drizzle-orm`, so whatever runs it carries nothing else. Publishing an indicator refreshes that
indicator's rows in the same transaction as its status change.

The standalone operations rebuild commits one indicator at a time and logs each indicator's
availability, range and series timings after commit. A row lock on the indicator serializes its
refresh with publication and other rebuilds. Other indicators can publish between commits. Readers
can see a mixture of old and rebuilt indicators during a rebuild, but all four models for an
indicator change together. A stopped job retains completed indicators; rerunning rebuilds them again
rather than resuming from a saved cursor.

Seeds, snapshot imports and live-data migrations still use the transaction-aware whole rebuild, with
its table lock, because their canonical changes and read models must commit together. Both paths
resolve the current published batch and its version's nullable `published_from` date before reading
observations. One shared condition includes only rows on or after that start date, or the whole
batch when it is null. Availability, ranges, elected series and England trends all use it. Queries
constrain the batch directly to keep per-indicator rebuilds efficient.

| Entry | Purpose                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`   | `READ_MODEL_TABLES`; `refreshIndicatorReadModels`, one indicator's refresh, and `rebuildReadModelTables`, the whole rebuild, each inside the caller's transaction |

Period types use whole calendar months with month-end clamping: `1-month`, `3-month`, and other
published lengths. Multiples of 12 months use years, such as `1-year`, `3-year`, and `5-year`. Other
spans use their inclusive day count, such as `500-day`. Each length has its own history; an `all`
choice elects one of those histories rather than combining lengths. The batch marker records the
series algorithm version. Readers use canonical histories for older versions until publication or
`pnpm db:rebuild-read-models` refreshes them. Deployment needs no manual rebuild. The cache period
column remains PostgreSQL `text`; widening its TypeScript type needs no migration.

Cumulative financial quarters carry `cumulative-quarter-YYYY-MM-DD`, where the date is the baseline.
Every endpoint shares that identity, including endpoints covering whole years. The newest published
baseline is displayed as one series; earlier baselines and ordinary annual rows remain stored. The
Pholio exporter writes this identity to `observation.period_type`. After deploying migration 0099,
re-export and import the data to populate it; an old export cannot recover the source quarter
identity. The import rebuilds the series caches.

## Tests

The tests are in the integration tier, against a copy of the seeded template database, so they need
Postgres running (`pnpm services:up`). From the repository root:

```sh
INTEGRATION_DB=1 APP_ENV=test pnpm exec vitest run --project @fphd/internal-read-models
```

`pnpm test:integration` runs them with every other integration test.

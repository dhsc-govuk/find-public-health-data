# @fphd/db-operations

Everything only the operations CLI and the test harness do to a database: bootstrap, migrate,
import core data, seed, reset, rebuild the read models and apply a live data migration package,
along with the migrations and data files they read. The API apps do not depend on it, so their
images carry none of it. The schema, client and repositories are in `@fphd/db`.

These connect as the owner login (`POSTGRES_USER`), through the operations CLI's config for the
root `db:*` commands, drizzle-kit's own config for `db:generate`/`db:studio` and
`createOwnerClient` from `@fphd/db/testing` for the test harness. The per-API roles are created by
`bootstrapRoles` (`pnpm db:bootstrap` locally, `operations db bootstrap` deployed), which must run
against a fresh server before the first migration: the grant migrations reference the roles.

The `@fphd/db-operations/data-migration-contract` subpath exposes package manifests, reviewed
relationship schemas and CSV table names without database operations. Export tooling uses it to
share the receiver's format.

## Layout

```
data/                 Core content (topics.json, ci-methods.json, classifications.json,
                      data-providers.json, value-types.json, units.json,
                      comparator-methods.json), the map from Fingertips' numerator and
                      denominator sources onto it, the dummy indicator relationship files
                      and the committed seed (seed/)
drizzle/              Generated migrations + drizzle-kit metadata — never edit applied ones
drizzle.config.ts     Reads the schema from ../db/src/schema.ts
src/
  bootstrap.ts        bootstrapRoles — the per-API login roles
  migrations.ts       migrateToLatest, and migration-status.ts to compare local and applied
  core-data.ts        importCoreData — loads the required core content (topics, CI methods,
                      classifications, data providers, value types, units, comparator
                      methods)
  topic-import.ts     upsertTopics, the topics half of the core data import
  legacy-sources.ts   Maps Fingertips' numerator and denominator sources onto the providers
  indicator-topic-import.ts
                      applyIndicatorTopics — the indicator relationship files
  seeding.ts          seedDummyTables — loads data/seed and the indicator relationships
  read-models.ts      rebuildReadModels — repopulates the cache tables from the published views
  reset.ts            resetDatabase — drops all application schema objects
  data-migration.ts   applyDataMigration — applies a live data migration package
  data-migration-contract.ts
                      The package format export tooling shares
                      (@fphd/db-operations/data-migration-contract)
  testing.ts          Builds the integration tier's template databases, and runs a migration
                      test's migrations (@fphd/db-operations/testing)
  index.ts            The package entry (@fphd/db-operations)
```

## Migrations

`pnpm check:migrations`, part of `pnpm check` and its own CI job, fails when the schema
differs from the latest snapshot in `drizzle/meta`, as it does when a schema change has no
migration. It runs drizzle-kit check for migrations that collide, then drizzle-kit generate
against a copy of `drizzle/`, refusing anything but "no schema changes". It compares the
schema with the snapshot, not with the migration SQL, so it cannot catch a hand-edited
migration that the snapshot does not match. It builds the two packages the schema imports
first.

A migration never edits an applied one. Until an environment holds publisher data the seed
cannot restore, a migration may drop data that a reset and reseed of the shared environments
restores, where that is cleaner than translating it; from then on every migration
translates. Either way, one that meets an answer it cannot translate stops with an error
rather than drop it, as 0034 and 0036 do.

## Core data import

The V2 taxonomy comes from the [taxonomy workbook](https://docs.google.com/spreadsheets/d/1BEmVbqbxgjD2fbvX6Fg9GlAQ44eKioII/edit).
`data/taxonomy-v2.json` records the source snapshot, its proposal status and workbook hash.
`topics.json` contains its 19 topics; `subtopics.json` contains 92 subtopics. Dental and oral
health and Sight and hearing have topic-level placements. The snapshot's `overrides` records
provisional placements separately from the source workbook, including indicator 276 under
Cancer → All cancers; confirm that placement before launch.

Topic memberships hold their primary placement flag. An indicator may have several subtopic
placements under the same topic; the subtopic bridge's foreign keys require both that topic
membership and a subtopic belonging to it. Each version has at most one primary topic and
one primary subtopic. Topic-level placements remain valid without subtopics. Draft copies
preserve placements, and the tagging page edits primary topics, subtopics and primary subtopics.
Population and area-context versions carry `is_area_context` and have no topic or
classification assignments.

V2 uses measure type (`indicator_type`), plans and programmes (`framework`) and life stage
(`life_stage`). The source's measure types and life-stage tags remain a first pass needing
subject matter review; this snapshot does not constitute production approval or change the
launch indicator selection.

Install V2 in development with `db reset` → deploy the V2 commit (which runs `db migrate`)
→ `db import-core-data` → `db migrate-live-data` for the approved package, or
`db seed-dummy-data` for the committed sample. Reset removes publisher drafts and publications.
Every existing development database must reset before loading V2; core-data imports upsert
rows and do not remove the former taxonomy. There is no in-place taxonomy upgrade command.
V1 migration packages must be regenerated as V2 packages before import.

```sh
pnpm db:import-core-data         # imports topics, classifications and the publisher's lists
```

Upserts matched on `id`: a rename — even one that changes the slug — updates the row in
place without changing the primary key. Rows in the database but absent from the file
are reported and left alone, never deleted. Re-runs are true no-ops (`updated_at`
untouched), so the import is safe to run repeatedly, in any environment. The import writes
as the Core data import system user, and each row it inserts or rewrites records an audit
entry in the upsert's transaction.

Lookups a publisher chooses from are core data under the service's own names, with fixed
ids, so every environment holds the same rows and the seed's relationship files can name
them by id: the CI methods, data providers, value types, units and comparator methods. No
new migration inserts a row of any of them. The value type and unit rows migration 0035
inserted carry the ids the files hold, and 0037 re-keys each comparator method a database
already held to the id `comparator-methods.json` gives its name, deleting those the file
lacks and stopping if a version names one of them. `value-types.json` and `units.json` list
their rows in the order the publisher's form shows them, which the import stores as each
row's `position`; code that behaves differently for a row keys it on the row's fixed id,
kept as a constant in `@fphd/utils/value-type-and-unit`. The seed and the published
snapshot still carry Pholio's `ci_method.csv.gz` and `comparator_method.csv.gz`, but
neither loads them: `seeding.ts` reads them only to point each version at the core row of
the same name, through a short map of the CI method names Pholio spells differently, and
stops at a row with no core counterpart.

`data-providers.json` holds the providers a numerator's or denominator's data comes from,
each with its named sources; a publisher may also choose a provider with no specific source.
It is the prototype's list plus the providers and sources the Fingertips data names that the
prototype leaves out. The seed and the snapshot carry Pholio's flat
`numerator_denominator_source.csv.gz`, which is staged but not loaded:
`legacy-numerator-denominator-sources.json` maps each of its names to the providers and
sources it stands for, or to none (for "Not applicable"), and a name the map lacks, or a
pair the core data does not hold, stops the load.

The data-loading commands (`db:import-core-data`, `db:seed-dummy-data`, `db:reset`) all
run through `apps/operations`, so a developer machine and a deployed job use one engine —
see the operations section of the root README.

## Integration tests

`src/*.integration.test.ts` need the local docker database up (`docker compose up -d db`), and
take their databases from `createTestDb()` in `@fphd/db/testing` as every other package's
do. The root Vitest global setup builds the templates those copy from with `setUpTestTemplate`
from `@fphd/db-operations/testing`.

A migration's own test puts rows in the shape the migration meets with `migrateBefore`, then
runs it with `migrateThrough`, which stops there, so a later migration never breaks it. Both are
in `@fphd/db-operations/testing`.

## Prerequisites

The workspace setup in the root `README.md`.

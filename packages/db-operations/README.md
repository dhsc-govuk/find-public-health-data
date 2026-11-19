# @fphd/db-operations

Everything only the operations CLI and the test harness do to a database: bootstrap, migrate, import
core data, seed, reset, rebuild the read models and apply a live data migration package, along with
the migrations and data files they read. The API apps do not depend on it, so their images carry
none of it. The schema, client and repositories are in `@fphd/db`.

These connect as the owner login (`POSTGRES_USER`), through the operations CLI's config for the root
`db:*` commands, drizzle-kit's own config for `db:generate`/`db:studio` and `createOwnerClient` from
`@fphd/db/testing` for the test harness. The per-API roles are created by `bootstrapRoles`
(`pnpm db:bootstrap` locally, `operations db bootstrap` deployed), which must run against a fresh
server before the first migration: the grant migrations reference the roles. `migrateToLatest` runs
the migrations as the `fphd_owner` group: see `owner-group.ts`.

The `@fphd/db-operations/data-migration-contract` subpath exposes package manifests, reviewed
relationship schemas and CSV table names without database operations. Export tooling uses it to
share the receiver's format.

## Layout

```
data/                 Core content (topics.json, ci-methods.json, classifications.json,
                      data-providers.json, value-types.json, units.json,
                      comparator-methods.json and the upload reference catalogs), the map
                      from Fingertips' numerator and denominator sources onto it, the dummy
                      indicator relationship files and the committed seed (seed/)
drizzle/              Generated migrations + drizzle-kit metadata — never edit applied ones
drizzle.config.ts     Reads the schema from ../db/src/schema.ts
src/
  bootstrap.ts        bootstrapRoles — the per-API login roles
  migrations.ts       migrateToLatest, and migration-status.ts to compare local and applied
  owner-group.ts      prepareOwnerGroup — the fphd_owner group that owns every object
  core-data.ts        importCoreData — loads the required core content (topics, CI methods,
                      classifications, data providers, value types, units, comparator
                      methods and upload reference data)
  topic-import.ts     upsertTopics, the topics half of the core data import
  legacy-sources.ts   Maps Fingertips' numerator and denominator sources onto the providers
  indicator-topic-import.ts
                      applyIndicatorTopics — the indicator relationship files
  seeding.ts          seedDummyTables — loads data/seed and the indicator relationships
  read-models.ts      rebuildReadModels — repopulates the cache tables from the published views,
                      through @fphd/internal-read-models
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

`pnpm check:migrations`, part of `pnpm check` and its own CI job, fails when the schema differs from
the latest snapshot in `drizzle/meta`, as it does when a schema change has no migration. It runs
drizzle-kit check for migrations that collide, then drizzle-kit generate against a copy of
`drizzle/`, refusing anything but "no schema changes". It compares the schema with the snapshot, not
with the migration SQL, so it cannot catch a hand-edited migration that the snapshot does not match.
It builds the two packages the schema imports first.

`drizzle/meta` keeps only the newest two snapshots. Each is a full copy of the schema, and
drizzle-kit generate diffs against the newest only. The one before lets `drizzle-kit drop` undo the
newest migration. `pnpm db:generate` deletes the older ones after generating, and
`pnpm check:migrations` fails when there are more than two. The migrator reads only the SQL files
and `_journal.json`.

The migrations start from one baseline, `0000_baseline`, which builds the whole schema and inserts
the system users and the Fingertips team. It keeps the timestamp of the migration it replaced, so a
database migrated before the baseline reports it as tampered and `db migrate` refuses that database
until it is reset.

A migration never edits an applied one. Until an environment holds publisher data the seed cannot
restore, a migration may drop data that a reset and reseed of the shared environments restores,
where that is cleaner than translating it; from then on every migration translates. Either way, one
that meets an answer it cannot translate stops with an error rather than drop it.

## Core data import

The topics, subtopics and tags follow the publisher design's tagging page, which DHSC has still to
agree. `topics.json` contains its 19 topics and `subtopics.json` its 87 subtopics. Dental and oral
health, Muscles, bones and joints, and Sight and hearing have no subtopics. `classifications.json`
holds its measure types (`indicator_type`), frameworks and programmes (`framework`), life stages
(`life_stage`) and risk factors (`risk_factor`), each dimension in the order the page lists it. The
import stores each classification's place in the file as its `position`, and the tagging page lists
each dimension in that order.

The Fingertips indicators' placements come from the V2
[taxonomy workbook](https://docs.google.com/spreadsheets/d/1BEmVbqbxgjD2fbvX6Fg9GlAQ44eKioII/edit).
`data/taxonomy-v2.json` records the source snapshot, its proposal status and workbook hash. The
migration tool's `generate-taxonomy-relationships` maps the workbook's names onto the lists above,
and stops on a name it has no mapping for. Only the workbook's Public Health Outcomes Framework maps
to a framework the lists hold. The snapshot's `overrides` records provisional placements separately
from the source workbook, including indicator 276 under Cancer → All cancers; confirm that placement
before launch.

An indicator may have several subtopic placements under the same topic. The subtopic bridge's
foreign keys require both that topic membership and a subtopic belonging to it. A topic with
subtopics needs at least one of them, which the tagging page and the migration tool both check.
Draft copies preserve placements. The workbook leaves 15 population and area-context indicators
untagged, and the relationship files list them in `areaContextIndicators`, with no topic or
classification.

The source's measure types and life-stage tags remain a first pass needing subject matter review;
this snapshot does not constitute production approval or change the launch indicator selection.

Install a changed taxonomy in development with `db reset` → deploy the commit (which runs
`db migrate`) → `db import-core-data` → `db migrate-live-data` for the approved package, or
`db seed-dummy-data` for the committed sample. Reset removes publisher drafts and publications.
Every existing development database must reset before loading it, because core-data imports upsert
rows and do not remove topics, subtopics or classifications the files no longer hold. There is no
in-place taxonomy upgrade command. Migration packages must be regenerated before import.

The import also upserts the teams and the fake people from `@fphd/auth`, matched on their fixed ids.
The internal apps sign the fake people in by those ids until sign-in goes through Entra, so every
environment needs them.

```sh
pnpm db:import-core-data         # imports topics, classifications and the publisher's lists
```

Upserts matched on `id`: a rename — even one that changes the slug — updates the row in place
without changing the primary key. Rows in the database but absent from the file are reported and
left alone, never deleted. Re-runs are true no-ops (`updated_at` untouched), so the import is safe
to run repeatedly, in any environment. The import writes as the Core data import system user. It
records nothing in the audit log, which is for changes made through the service.

Lookups a publisher chooses from are core data under the service's own names, with fixed ids, so
every environment holds the same rows and the seed's relationship files can name them by id: the CI
methods, data providers, value types, units and comparator methods. No migration inserts a row of
any of them. `value-types.json` and `units.json` list their rows in the order the publisher's form
shows them, which the import stores as each row's `position`; code that behaves differently for a
row keys it on the row's fixed id, kept as a constant in `@fphd/utils/value-type-and-unit`. The seed
and the published snapshot still carry Pholio's `ci_method.csv.gz` and `comparator_method.csv.gz`,
but neither loads them: `seeding.ts` reads them only to point each version at the core row of the
same name, through a short map of the CI method names Pholio spells differently, and stops at a row
with no core counterpart.

`data-providers.json` holds the providers a numerator's or denominator's data comes from, each with
its named sources; a publisher may also choose a provider with no specific source. It is the
prototype's list plus the providers and sources the Fingertips data names that the prototype leaves
out. The seed and the snapshot carry Pholio's flat `numerator_denominator_source.csv.gz`, which is
staged but not loaded: `legacy-numerator-denominator-sources.json` maps each of its names to the
providers and sources it stands for, or to none (for "Not applicable"), and a name the map lacks, or
a pair the core data does not hold, stops the load.

The data-loading commands (`db:import-core-data`, `db:seed-dummy-data`, `db:reset`) all run through
`apps/operations`, so a developer machine and a deployed job use one engine — see the operations
section of the root README.

## Upload reference data

`db import-core-data` loads the area types, dimensions, note types, areas and area relationships
required by upload validation. A freshly migrated database can accept a publisher upload after that
command.

`data/area-types.json`, `dimension-types.json`, `dimension-values.json` and `note-types.json`
contain the fixed lookup ids. They use the exporter's deterministic UUIDv7 mapping of Pholio keys.
The import validates ids, names and dimension parents, then upserts each list using one JSON
parameter.

`data/geography/` contains the full Pholio area catalog as gzipped CSV files. Its manifest records
the source backup digest, row counts, file sizes and SHA-256 digests. The import verifies these
before writing, copies the files into temporary tables and performs set-based upserts in one
transaction. This keeps the parameter count constant for the 73,302 areas and 158,929 relationships.

`area_neighbour.csv.gz` holds ranked NHS England peer groups. `area_category.csv.gz` holds IMD2025
and IMD2019 decile memberships for both local authority tiers on April 2023 geography, keyed by area
code and dimension value id. The import resolves each code to exactly one current area, retains
existing area ids and replaces obsolete memberships. These catalogs are imported separately from
seed and live-data packages. Refresh deprivation memberships with
`python3 packages/db-operations/data/geography/export-area-categories.py`; clear this worktree's
`node_modules/.cache/area-categories` first to fetch new responses. The exporter updates the
geography manifest's row count, size and digest.

Areas match on code and area type. Relationships match on their parent and child areas. Existing ids
are retained when those keys match. Multiple matching area or relationship versions stop the import
for review. The catalog preserves Pholio's codes and current status. Validity dates that Pholio does
not supply remain empty. Rows absent from the catalog are reported and retained. Current-area
lookups use a covering index on area type, status, name, code and id.

The seed and live-data package importers map their reference ids onto this catalog. Lookup names
identify area types, dimension types and notes. A value matches by dimension type and name, and an
area by code and mapped area type. A referenced value with no core counterpart stops the load. Core
reference rows are retained when loading the dummy seed.

Refresh the committed catalogs when reference data changes. See
[Refresh upload reference
data](../../tools/data-migration/README.md#refresh-upload-reference-data).
Deploy the operations image and run `db import-core-data` before applying a package that uses those
new rows. The export and receiver share format version 9, which carries the reference catalogs in
full in incremental packages.

A migration that adds a read model creates it empty. For an existing environment, run
`db rebuild-read-models` after `db migrate` and before rolling the apps to populate it for every
published indicator. The public API uses full-history fallbacks until the rebuild completes.
`db import-core-data` only imports reference data; the dummy seed, published-snapshot import and
live-data import rebuild read models themselves. Scheduled publication refreshes the published
indicator in the publication transaction.

## Integration tests

`src/*.integration.test.ts` need the local docker database up (`docker compose up -d db`), and take
their databases from `createTestDb()` in `@fphd/db/testing` as every other package's do. The root
Vitest global setup builds the templates those copy from with `setUpTestTemplate` from
`@fphd/db-operations/testing`.

The integration setup builds schema, core-data and seeded templates once per run. Use
`createTestDb({ template: 'core' })` for an empty service with its required reference catalogs.
Fresh-import tests use the schema template.

A migration's own test puts rows in the shape the migration meets with `migrateBefore`, then runs it
with `migrateThrough`, which stops there, so a later migration never breaks it. Both are in
`@fphd/db-operations/testing`.

## Prerequisites

The workspace setup in the root `README.md`.

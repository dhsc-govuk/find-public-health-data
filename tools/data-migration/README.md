# Live data migration

This tool builds the one-time Fingertips baseline and the ordered increments used while
publishing moves to this service. The operations image applies the packages with
`db migrate-live-data`.

## Prerequisites

- Install the repository's Node and pnpm versions and run `pnpm install`.
- Use a read-only `PHOLIO_CONNECTION_STRING` (SQL Server connection string) pointing at an
  immutable restored Pholio backup. Set `--expected-database` to the restored database's name.
- Keep source exports, prepared snapshots and archives in private storage outside the
  repository. The archive command also requires `tar` on the host.

## Safety and provenance

- `export-pholio` reads the source through separate requests. Export from an immutable
  restored backup so every table belongs to the same cut of the data.
- Production `export-pholio` exports only the indicators approved for launch, read from
  `data/approved-indicators.json`: the ids whose final priority is "prioritise" in DHSC's
  indicator prioritisation workbook, committed with that provenance. Pass
  `--approved-indicators` with another JSON file (the same shape, or a bare array such as
  `[108, 241]`) to override it. Explicit exclusions can further narrow the list; a requested
  indicator missing from Pholio stops export. The source manifest records the selection,
  exported count and non-approved count.
- Six provisional names in `src/pholio/indicator-names.ts` distinguish the life-expectancy,
  chlamydia and fuel-poverty datasets without merging or excluding their source ids. Each
  mapping checks the original source name and is recorded in `indicator_name_mappings` in
  the source manifest. A changed source name stops export for review.
- Observation pre-flight counts each intentional exclusion: non-approved indicators,
  explicit exclusions, test indicator 94204, placeholder note 506, empty sentinel rows,
  years before 1900, period formats absent from the indicator's Grouping metadata, and
  resolved duplicate keys (see below). Unknown areas, notes, metadata and dimension values
  stop export with source-row diagnostics. Historical dates and future periods are not
  excluded by the current Grouping baseline or data point.
- `scanned_observations` counts all source observations, including compound-age expansion.
  `source_observations` counts the selected observations after the base filters (test id,
  unapproved ids, note 506, empty sentinel rows and years before 1900).
  `excluded_observations` totals the remaining explicit-indicator, publication-format and
  duplicate exclusions, each counted independently during pre-flight. Written observations
  plus those exclusions must equal `source_observations`; written observations plus every
  reason in `observation_exclusions` must equal `scanned_observations`. A mismatch fails export.
- Area aliases prefer the non-n-prefixed code deterministically. Both source aliases map
  to the survivor, so their observations and relationships retain the same area identity.
- Preparation combines note types only when their tidied text and every other field match.
  It preserves every observation-note link, records the source-id aliases in
  `reference_name_aliases`, and updates the prepared file counts and hashes. Conflicting
  categories or other reference-name collisions stop preparation.
- Creation and migration audit timestamps use the indicator's `DateEnteredInPHOLIO`,
  never the export time. `indicator.data_updated_at` uses the latest successful
  `UploadJob.DateCreated` whose batch is still referenced by that indicator's
  `CoreDataSet` rows (`Status = 1000`), matching Fingertips' `DataChange.LastUploadedAt`.
  Without a matching successful upload, the update date stays null. Both production and
  development exports use this rule. Re-exporting unchanged source data writes the same
  rows, so an increment carries only real changes. The export time appears only in the
  manifest.
- The expected live database name must match `DB_NAME()`.
- UUIDs are deterministic from the source table and integer ID. The same source row keeps
  the same target ID across the baseline and every increment.
- The source manifest's `profile_metadata` preserves profile-specific names, including
  framework references, raw frequency prose and structured frequency labels. Preparation
  and increments retain that provenance independently of the generic display name.
- Each package names its schema format, source snapshot time, predecessor, row counts and
  SHA-256 digest for every file. The archive has a separate SHA-256 digest.
- An increment carries `ci_method`, `comparator_method` and `numerator_denominator_source` in
  full: the importer maps versions through them by name and stores none of their rows.
  When any reference list changes, the increment resends all remaining versions so their
  core methods and provider links are resolved again. Version files require both legacy source columns. Batches identify their owning version; versions point at their batch, and observation keys carry sorted dimension-value UUIDs. The receiver resolves the version/batch cycle inside its import transaction.
- Deleting a version also deletes the topic, classification and source rows the migration
  wrote for it. A version a publisher has added links or age ranges to is never deleted;
  the import stops and names the count.
- Financial cumulative-quarter data retains its cumulative date ranges; quarter numbers are never treated as distribution ranks. Repeated canonical observation keys stop the export with source-row diagnostics.
- The importer resumes an interrupted package download from the bytes it already has.
- A baseline only applies when every canonical target table and the migration ledger are
  empty. An increment only applies after its named predecessor, with a later cutoff.
- The importer takes an advisory lock and applies canonical rows, reviewed relationships,
  read models and the ledger record in one transaction. Reapplying the same package is an
  idempotent no-op; reusing its ID for different bytes fails.
- Topic and classification assignments must be supplied as a separately reviewed file.
  The demo profile heuristic is never accepted implicitly.

## Reviewed relationship file

The prepare step requires JSON accepted by the existing indicator relationship schema,
plus these fields:

```json
{
  "approval": {
    "approvedBy": "person or governance group",
    "approvedAt": "2026-09-22T12:00:00Z",
    "basis": "Reference to the reviewed mapping"
  },
  "indicators": [108, 241],
  "indicatorTopics": [],
  "indicatorDataUpdatedAt": {},
  "classifications": [],
  "indicatorClassifications": []
}
```

`indicators` must exactly match the indicators in the package. Each needs a topic assignment
or an explicit entry in `areaContextIndicators`; an area-context indicator cannot also
carry topics or classifications. `indicatorTopics` accepts `isPrimary` and
`indicatorSubtopics` contains `{ fingertipsId, topicId, subtopicId, isPrimary }` rows.
Packages use format version 3 and `canonical-v3`, so an older receiver refuses a
package rather than silently discarding the placement and area-context fields, and the
receiver refuses an older package, whose observations hold Pholio's Count as the count
even where it is the numerator.
Preparation checks coverage before writing prepared output; the importer verifies all
applied topic, subtopic and classification links before committing.

Generate draft relationships from the committed V2 workbook snapshot:

```sh
pnpm --filter @fphd/data-migration data-migration generate-taxonomy-relationships \
  --source ../../packages/db-operations/data/taxonomy-v2.json \
  --topics ../../packages/db-operations/data/topics.json \
  --subtopics ../../packages/db-operations/data/subtopics.json \
  --classifications ../../packages/db-operations/data/classifications.json \
  --output /secure/draft-taxonomy-relationships.json
```

`--indicators /secure/indicator-ids.json` limits the output to an exact selection and refuses
ids outside the workbook's in-scope list, except the reviewed provisional Cancer → All
cancers placement for explicitly selected indicator 276. That exception checks the excluded
source entry and carries a TODO for review before launch. It does not change publication
eligibility or supply approval metadata. Resolve differences with the launch list during review. The
workbook marks 15 indicators as area context and excludes other indicators; neither status
is replaced with a guessed assignment. The snapshot remains a proposal for iteration and
user testing, and its generated relationships require review before production use.

## Export pre-flight checks

Before streaming observations, `export-pholio` runs a slug check that cannot be retried cheaply
after a 29-million-row export:

- **Slug collisions**: no two exported indicator names may slugify to the same slug, since
  a slug belongs to exactly one indicator. The check names every colliding pair (source id
  and name) for an explicit naming decision before exporting again.

## Duplicate observation keys

Before comparing keys, pre-flight checks the period formats represented by each indicator's
Grouping rows: YearRange and annual, quarterly or monthly periodicity. A YearRange or format
not represented there is counted separately in the source manifest. The same check runs when
writing observations. Area type is not a publication gate: a grouping for England can support
published trust data. Sex and age do not filter inequality breakdowns, and the current
baseline and data point do not restrict historical coverage. Missing Grouping metadata does
not cause observations to be discarded.

Pholio keys rows on SexID, AgeID and YearRange, and codes "not applicable" as -1 in each.
FPHD maps a -1 sex or age, like persons and all ages, to no dimension row, and a -1 year range
to a one-year period, so a not-applicable row and the coded row it duplicates share one
observation key. Pre-flight resolves a repeated key only when
the choice is safe, and counts each dropped observation in the manifest:

- `duplicate_placeholder`: only one row carries measures, and every candidate has the same
  geographic note; the populated row stays.
- `duplicate_not_in_grouping`: only one candidate matches the indicator's grouped sex and
  age for that period format; that series stays, including a suppressed observation.
- `duplicate_identical`: every row carries the same measures and note; the coded row stays.
- `duplicate_superseded`: the measures differ and the indicator is listed in
  `--superseded-sentinel-rows`, a JSON array of indicator ids whose not-applicable rows are
  a stale upload; the coded row stays. The manifest records the list.

Any other repeated key stops the export with the source uids, for review with the data owner.
Sentinel measures alone do not make a row safe to discard: they can carry the published
suppression instead of an ungrouped value.
When a compound sex-and-age source row becomes two observations, resolving a duplicate
drops only the overlapping observation and retains its other half.

## Excluding indicators

Pass `--excluded-indicators` as a JSON array to omit specific approved indicators and
their observations, upload batches and bridge data from the export. The source manifest
records `excluded_indicators` and `excluded_observations` so the result is auditable.

```sh
# Apply an explicit decision to leave out an approved indicator:
pnpm --filter @fphd/data-migration data-migration export-pholio \
  --expected-database pholio_live_b \
  --out-dir /secure/fphd-snapshot-001 \
  --excluded-indicators '[108]'
```

The ids to exclude in production are a human decision documented alongside the reviewed
relationships file; the approved list itself is the committed `data/approved-indicators.json`.

## Build the baseline

Keep source credentials in the environment rather than a command argument.

```sh
export PHOLIO_CONNECTION_STRING='Server=…;Database=pholio_live_b;…'
pnpm --filter @fphd/data-migration data-migration export-pholio \
  --expected-database pholio_live_b \
  --out-dir /secure/fphd-snapshot-001

pnpm --filter @fphd/data-migration data-migration prepare-baseline \
  --directory /secure/fphd-snapshot-001 \
  --migration-id baseline-2026-09-22 \
  --relationships /secure/approved-indicator-relationships.json \
  --out-dir /secure/fphd-prepared-001

pnpm --filter @fphd/data-migration data-migration archive \
  --directory /secure/fphd-prepared-001 \
  --output /secure/baseline-2026-09-22.tar
```

Upload the archive to private migration storage. Pass a short-lived HTTPS URL and the
digest from the generated `.sha256` file to the operations job as
`DATA_MIGRATION_URL` and `DATA_MIGRATION_SHA256`.

Preparation never changes the source export. It tidies names, refuses ambiguous reference
name collisions and rekeys a staged copy, then renames the complete package into the new
output directory. Existing output is refused; a failed attempt removes its partial output,
so the same source can be retried or prepared under a different migration ID.

## Build transition increments

Export and prepare a new full snapshot with a new migration ID. Diff it against the full
snapshot used for the preceding package:

```sh
pnpm --filter @fphd/data-migration data-migration create-incremental \
  --previous /secure/fphd-prepared-001 \
  --current /secure/fphd-prepared-002 \
  --out-dir /secure/fphd-increment-002 \
  --migration-id increment-2026-09-23
```

The output must be a new directory. Increment preparation rejects existing paths, including
symlink aliases of either input, and stages the complete package before publishing it.
Failures remove the staged output and leave both full snapshots intact.

Archive and apply that output in the same way as the baseline. Retain each prepared full
snapshot until the next increment has been built. Comparing complete ordered snapshots
captures inserts, corrections and deletions without relying on source update timestamps.

## Apply and verify

Run schema migrations and core topic import before the first live data package:

```sh
pnpm db:migrate
pnpm db:import-core-data
DATA_MIGRATION_URL='https://…' DATA_MIGRATION_SHA256='…' pnpm db:migrate-live-data
```

The command logs the migration ID, package kind and per-table upsert and delete counts.
Verify the `data_migration` ledger, canonical counts, four read-model counts, search and a
representative indicator before directing traffic to the database.

## Test and structure

Run `pnpm vitest run --project @fphd/data-migration` and
`pnpm --filter @fphd/data-migration typecheck` from the repository root.

- `export-pholio.ts` reads Pholio (SQL Server) and writes the source export that both
  `prepare-baseline` and `export-dev-snapshot` take as input.
- `prepare-baseline.ts` verifies, normalises and deterministically rekeys that cut.
- `diff.ts` creates an ordered incremental package from two prepared full snapshots.
- `archive.ts` verifies package files before creating the private transport archive.
- `export-dev-snapshot.ts` produces a `verifyPublishedSnapshot`-compatible archive from
  Pholio for developer imports (see below).
- `taxonomy.ts` translates explicit workbook placements and tags without profile or name
  heuristics. `legacy-seed.ts` and `prototype-seed.ts` retain the historical maintenance
  workflows; production package construction does not call them.

## Build a dev snapshot from Pholio

`export-dev-snapshot` reads Pholio directly (currently via the benchmark VM's copy;
production via DHSC's SQL Managed Instance) and writes a `snapshot.tar` compatible with
`db import-published-snapshot`. It translates polarity, frequency and notes-and-caveats
into their service forms and rekeys every integer id to a deterministic UUIDv7. After export,
it checks the B fingerprint: 1,329 indicators and 29,656,329 eligible source observations before
intentional indicator, publication-format and duplicate exclusions. These counts omit test
indicator 94204. The source count is recorded during pre-flight; the archive records the
total excluded observations and their individual reasons, along with the source label
`PHOLIO_LIVE_B export` and source database `pholio_live_b`.

```sh
export PHOLIO_CONNECTION_STRING='Server=…;Database=pholio_live_b;…'
pnpm --filter @fphd/data-migration data-migration export-dev-snapshot \
  --out-dir /secure/fphd-dev-snapshot
```

Four source indicators (90366, 90776, 92774, 93280) are excluded because they share a
name with a newer indicator; the importer refuses an archive built with a different list.
The snapshot is not for production use; update it from Pholio when more recent content
is required.

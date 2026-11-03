# Seed data

Real Pholio data loaded as gzipped CSVs by `pnpm db:seed-dummy-data`. The nine Pholio
indicators came from the canonical bridge/registry migration; the three prototype showcase
additions come from the public Fingertips API and are imported through local Postgres.

## What is in it

Reference and registry CSVs provide the source ids used to map onto the committed core
catalogs. Core-data setup owns dimensions, area types, note types, areas and area
relationships. `ci_method.csv.gz` and `comparator_method.csv.gz` are Pholio's lists and
are not loaded: the methods are core data (`../ci-methods.json`,
`../comparator-methods.json`), and the seed maps its versions onto them by name. Areas,
observations and bridge rows contain:

- **12 indicators**, combining broad schema coverage with the prototype's showcase data:

  | ID | Indicator | Why |
  |---|---|---|
  | 108 | Under 75 mortality rate from all causes | DSR; sex, age, deprivation deciles |
  | 241 | Diabetes: QOF prevalence | Prototype showcase; GP, NHS and local-authority trends from 2009/10 |
  | 40501 | Under 75 mortality rate from cancer | DSR; same shapes, second mortality series |
  | 90851 | % resident in each deprivation quintile | Proportion; IMD2010/2015 quintiles |
  | 92026 | Reception prevalence of obesity | Proportion; ethnicity (17 groups), deprivation quintiles |
  | 92033 | Year 6 prevalence of obesity | Proportion; pairs with 92026 for comparisons |
  | 92443 | Smoking prevalence in adults (current) | Proportion; 15+ dimension types incl. socioeconomic, tenure, religion, sexuality |
  | 92708 | Resident population | Count; sex × age-band population pyramids |
  | 93622 | Community mental health contacts | Deprivation quintile within area (IMD2019) |
  | 93861 | Mortality attributable to particulate air pollution | Prototype showcase; England, regional, NHS and local-authority trends |
  | 93995 | Mortality rate for deaths involving diabetes | Prototype showcase; annual and rolling trends from 2001 |
  | 94194 | Emergency admissions for gastroenteritis (0–4) | Crude rate; deprivation deciles |

- **6,544 current areas**: England, 9 statistical regions, current local authorities,
  6,168 GP practices, 42 integrated care boards and 7 NHS regions.
- The nine Pholio indicators retain their existing focused date window. The prototype
  additions include their full published trend for the geographies above.

That yields 433,678 observations, 657,869 bridge rows and 67,978 observation notes.

## Semantics worth knowing

- An observation's aggregate ("Persons, all ages") is expressed by the **absence** of a
  dimension bridge row, not by aggregate-flagged dimension values. Some indicators have
  no fully-aggregate observations at all.
- `indicator_version.slug` is derived from the name by the export's `slug.py`, which mirrors
  `slugify` in `@fphd/utils/slug`. A name yielding no usable slug, or two names that slugify
  alike, stop the export with the indicators named: a slug belongs to one indicator, so a
  collision is settled in the source by renaming or excluding one of the pair, never by a
  suffix. A TypeScript test reads these CSVs and checks every slug against the TypeScript
  rule, so the two implementations cannot drift.
- Every seeded indicator loads as a single `published` version in the Fingertips team, which
  holds imported indicators and has no publishers, so only admins and IMRG managers see them.
  The files name the writer of each version and batch by user id: the PHOLIO migration system
  user for the nine Pholio indicators, and Test seed for the three from the Fingertips API.
  There are no draft rows in the seed.
- `observation.csv.gz` may carry a `created_by` column, which the load ignores: an
  observation's writer is its batch's uploader.
- The files carry no `upload_batch.indicator_version_id`, `indicator_version.upload_batch_id`
  or `observation.dimension_key`; the load derives them. Each batch belongs to its indicator's
  published version, each version points at its indicator's batch with the data table
  confirmed when the batch was uploaded, and each observation is keyed by its dimension values.
  The load stops if a published observation would fall outside its version's batch.
- `indicator_version.polarity` holds one of the service's values from `@fphd/utils/polarity`,
  not a reference to Pholio's polarity lookup. Both exports translate the lookup row's name
  with `export/polarity.py` and carry no `polarity` table; a name it has no value for stops
  the export.
- `indicator_version.update_frequency` likewise holds one of the service's values from
  `@fphd/utils/update-frequency` in place of Pholio's frequency lookup, translated by
  `export/update_frequency.py`; neither export carries a `frequency` table.
- `numerator_source_id` and `denominator_source_id` in `indicator_version.csv.gz` name rows
  of Pholio's `numerator_denominator_source.csv.gz`. The service has neither the columns nor
  the table: the load maps each name onto the core data providers through
  `../legacy-numerator-denominator-sources.json` and writes the result to
  `indicator_version_source`.
- `indicator_version.period_type` and `year_type` hold the service's values from
  `@fphd/utils/period-type`, and a year ending on a specified date holds its day and month
  in `year_end_day` and `year_end_month`. `export/year_type.py` translates each of Pholio's
  17 year types to them, and a name it has no translation for stops the export. Neither
  export carries a `year_type` table; migrations 0034 and 0036 hold the same translation for
  databases that already had Pholio's rows.
- `indicator_version.value_type_id` and `unit_id` point at the service's own rows, which are
  core data in `../value-types.json` and `../units.json`, so neither export carries a
  `value_type` or `unit` table. `export/value_type_and_unit.py` reads the ids from those files
  and translates Pholio's names; a unit outside the service's list becomes "Other", named in
  `unit_detail` as Pholio named it. Pholio's placeholders ("Unknown value type 21", "Unknown
  unit 54") translate as the value type or unit the public Fingertips API gives that id, a unit
  identified by its label and multiplier. `../../src/pholio-value-types-and-units.json` lists
  every Pholio value type and unit with what it becomes, and a test checks that each is a name
  the core data files hold. Any other value type, or a unit named with another placeholder,
  blank or over 100 characters, stops the export; a version with no unit keeps none. Migration
  0035 holds the same translation.
- `observation.count` and `observation.numerator` split Pholio's one Count: it is the numerator
  for an indicator whose value type is calculated from a numerator and a denominator (crude
  rate, directly standardised rate, indirectly standardised proportion and ratio, proportion
  and ratio), and the count otherwise. A survey indicator whose count is an estimated number of
  people, such as smoking prevalence (92443), keeps it as the count whatever its value type.
  `export/split-count-and-numerator.py` moves each count that is a numerator, by the lists in
  `export/count_and_numerator.py`. `countIsNumerator` in `@fphd/utils/value-type-and-unit`
  holds the same lists, and a test checks the committed seed against them. Migration 0052
  applied them to existing databases, so a change to them needs a data migration of its own.
- Pholio's disclosure control, caveats and notes prose becomes the service's answers:
  `export/notes_and_caveats.py` turns prose that is an answer in itself, such as "None
  applied" or "Not applicable", into that answer and drops it, matching the whole text
  against its `VOCABULARY`. Any other prose is kept as the detail of a yes
  (`disclosure_control`, `has_caveats`, `has_other_notes`), and blank prose leaves the
  question unanswered. Rounding has no Pholio field and stays unanswered. Migration 0022
  holds the same vocabulary for databases that already had the prose.
- Dimension type, dimension value and note type names are stored with their whitespace
  tidied (trimmed, each run of whitespace one space), the form uploaded data is matched in,
  and no two match once tidied. `export/tidy-reference-names.py` tidies them and merges rows
  that differ only in whitespace into the lowest id: a dimension type when its class and
  whether it is required agree and each of its values has a namesake in the survivor, a note
  type when the categories agree. Anything else that would merge stops it. The
  tidy-reference-names migration does the same to databases that already held the names, and
  a TypeScript test checks the committed CSVs against `tidyName` in `@fphd/utils`.

## Regenerating the base snapshot

The supported full-volume development path is `export-dev-snapshot` in
[the migration tool](../../../../tools/data-migration/README.md#build-a-dev-snapshot-from-pholio).
It reads `pholio_live_b` directly, checks the independently recorded 1,329 source
indicators (excluding test indicator 94204) and 29,656,329 observations, then
omits the four explicit retired-indicator exclusions. The benchmark counts are
an acceptance check, not production publication approval.

The TypeScript pipeline converts prose to plain text, normalises geography
labels and slugs, tidies reference names, checks for ambiguous duplicates and
rekeys the complete snapshot deterministically. It stamps both manifests with
`reference_names: "tidied"`. The resulting private archive is accepted by
`db import-published-snapshot`; do not commit it. The old A-clone Python snapshot
exporter is retired because its archives do not match the current receiver.

Topic and tag assignments come from the V2 taxonomy workbook snapshot in
`../taxonomy-v2.json`. `indicator-topics.json` and `indicator-classifications.json`
contain exactly its assignments for the 12 seed indicators. Resident population
has no topic or tags because it is area context. The full snapshot relationship
file uses the same source, including primary and secondary subtopic placements.
The profile and title heuristics have been retired. Production packages require
the separate approved indicator list and reviewed relationships described in the
migration tool's README.

The legacy base-seed and prototype regeneration scripts below remain historical
maintenance paths until their TypeScript replacements have been compared against
a complete source regeneration. They do not build production migration packages.

`export/export-seed.py` runs on the benchmark VM (`fphd-benchmark`, resource group
`find-public-health-data-alpha` — deallocated when idle; its public IP changes on start),
then `export/transform-uuids.py` rekeys the integer-keyed export to UUIDv7 locally:

```sh
scp export/export-seed.py fphd@<vm-ip>:/tmp/
ssh fphd@<vm-ip> 'MSSQL_PASSWORD=<sa-password> python3 /tmp/export-seed.py /tmp/seed-out'
scp 'fphd@<vm-ip>:/tmp/seed-out/*.csv.gz' .
python3 export/transform-uuids.py .
python3 export/strip-metadata-html.py .
python3 export/enrich-area-display.py .
python3 export/tidy-reference-names.py .
python3 export/reshape-indicator-versions.py .
python3 export/split-count-and-numerator.py .
```

`strip-metadata-html.py` converts the metadata prose from Pholio's HTML to the plain
text the pages store and render; `enrich-area-display.py` stamps each area type's display
group, copies explicit current status and validity dates from the verified core geography
snapshot, and strips the level suffixes from area names; `tidy-reference-names.py` tidies the
names uploaded data is matched to. Skipping any of them commits seeds the site would show
or match wrong. `reshape-indicator-versions.py` splits the Pholio shape into the
identity and version tables this service holds: `indicator.csv.gz` keeps
only the identity columns, `indicator_version.csv.gz` carries one published version per
indicator with the slug derived from its name, and `indicator_metadata.csv.gz` is folded
into it and removed. `split-count-and-numerator.py` runs last, as it reads the
versions' value types.

The transform assigns sequential UUIDv7 ids in source-id order, remaps every foreign key,
writes Pholio's `pholio-migration` writer as the PHOLIO migration user's id, and keeps the
public Fingertips indicator number in `indicator.short_id`. Adjust the indicator list,
geography set or year floors at the top of `export-seed.py`.

## Refreshing the prototype showcase locally

`export/import-prototype-indicators.py` imports Fingertips CSV/JSON downloads into the
local Docker database in one transaction. It validates geography coverage and foreign
keys, then writes only the changed seed tables to a staging directory. It never connects
to a remote database.

Start from the committed base seed, download indicator IDs 241, 93861 and 93995 plus area
types 6, 7, 221, 223, 501 and 502 from the public Fingertips API into a temporary
directory, then run:

```sh
docker compose up -d db
pnpm db:seed-dummy-data
python3 export/import-prototype-indicators.py \
  --data-csv /tmp/fphd-prototype-indicators.csv \
  --metadata-json /tmp/fphd-prototype-metadata.json \
  --area-types-json /tmp/fphd-area-types.json \
  --area-dir /tmp \
  --out-dir /tmp/fphd-seed-expanded
```

Validate the staging output before copying its nine `.csv.gz` files into this directory.
Then run `pnpm db:seed-dummy-data` — it imports the indicator relationships and rebuilds
the read models in the same command — to prove the committed files reproduce the local
database.

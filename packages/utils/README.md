# @fphd/utils

Small, side-effect-free helpers shared across the apps and packages that are not configuration.
Configuration and the shared zod instance stay in `@fphd/config`.

Built package with a `browser` export condition, so the same modules serve Node and the web bundles.
Nothing here may import Node-only code: the tsconfig types the source against the browser and leaves
out `@types/node`, so a `node:` import or a `process` reference fails `pnpm typecheck`.

There is no root export; import each module by its subpath.

## Modules

Text, names and addresses:

- `./control-character`: `CONTROL_CHARACTER` and `CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB`, the one
  definition of a control character refused in text.
- `./indicator-path`: `indicatorPath`, the address of the public indicator page for a slug, which
  both web apps serve.
- `./is-one-of`: `isOneOf`, a type guard for whether a value is one of a list of allowed values.
- `./short-id`: `SHORT_ID_PATTERN`, `MAX_SHORT_ID` and `isShortId`, the one definition of the public
  indicator number. It is a run of digits that an integer column can hold.
- `./slug`: `SLUG_PATTERN` and `SLUG_MAX_LENGTH`, the one definition of a URL slug. `slugify` and
  `slugProblem` derive a slug from a name and say why a name yields none. `RESERVED_SLUGS` and
  `isReservedSlug` are the path segments a slug may not take.
- `./tidy-name`: `tidyName`, the form in which uploaded names are matched to reference data. It
  trims a name and makes each run of whitespace one space.

Indicator vocabularies. Each module exports the allowed values as a constant list and the union type
of those values. Most also export a `*_LABELS` record of the words the pages show.

- `./calculated-by`: who calculated an indicator.
- `./ci-confidence-level`: the confidence levels of a version's intervals.
- `./ci-method-kind`: what choosing a confidence interval method asks of the publisher next.
- `./classification-dimension`: the classification dimensions, and `TAGGING_DIMENSIONS`, the ones
  the tagging page sets.
- `./disclosure-control`: whether disclosure control was applied.
- `./indicator-sort`: the sort orders of the indicator search, and `indicatorSort`, which reads one
  from a query value.
- `./indicator-status`: whether the public can see an indicator.
- `./indicator-step`: the workflow steps a draft version can take, in the order the workflow allows
  them.
- `./indicator-submission-status`: where a submission of a version for review stands.
- `./indicator-task-key`: the tasks on an indicator's draft, and `isFlaggable` and
  `FLAGGABLE_TASK_KEYS`, the tasks a reviewer may flag.
- `./polarity`: which way an indicator's values are better, and which way a goal is met.
- `./review-response-kind`: what a reviewer's response to a submission says, and
  `IMRG_DECISION_KINDS`, the responses that record a meeting's decision.
- `./sex-and-ages`: the sexes an indicator can cover, how its ages are given, and the units an age
  is given in with their length in days.
- `./source-part`: the numerator and the denominator, each of which names where its data comes from.
- `./update-frequency`: how often an indicator's data is updated.
- `./value-type-and-unit`: the value type and unit ids the code behaves on, the value types whose
  count is the numerator, how a value type is standardised, and `unitLabel`, the unit as the public
  reads it.

Periods, dates and observations:

- `./period-label`: `periodLabel`, the label of a period from its dates, such as "January to March
  2023" or "2022/23".
- `./period-type`: the period types and year types with their labels. `publicYearType` and
  `yearTypeValuesLabelled` convert between a stored year type and year end and the label the public
  reads.
- `./uk-time`: conversions between an instant and a date and time on the UK's clocks, GMT or BST as
  the date has it.
- `./observation-series`: `headlineSeries`, an area's headline series in date order, and
  `tableAreaSeries`, which keeps each area's complete headline history for the trend table.
- `./recent-trend`: `recentTrendDirection`, the direction of the last five values, with changes
  under 2% counted as no change.

The seed export's `packages/db-operations/data/seed/export/slug.py` mirrors `./slug` and must change
with it. `packages/db-operations/data/seed/export/tidy-reference-names.py` and the
tidy-reference-names migration mirror `./tidy-name` likewise.

## Prerequisites

The workspace setup in the root `README.md`.

## Testing

`vitest run --project @fphd/utils`, or the root `pnpm test:unit`.

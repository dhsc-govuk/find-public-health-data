import { AGE_UNIT_DESIGNATORS, AGE_UNITS, durationDays } from '@fphd/utils/age-range';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

import type { dimensionValueAgeRange } from './schema/dimension.ts';
import type { publishedDimensionValueAgeRange } from './schema/published.ts';

/** The age ranges of dimension values: the table, or the published view of it. */
export type AgeRanges = typeof dimensionValueAgeRange | typeof publishedDimensionValueAgeRange;

function days(value: SQLWrapper, unit: SQLWrapper): SQL {
  const lengths = AGE_UNITS.map((each) => sql.raw(`WHEN '${each}' THEN ${durationDays(1, each)}`));
  return sql`(${value} * CASE ${unit} ${sql.join(lengths, sql` `)} END)::float8`;
}

/**
 * Orders segments by the age of their `dimension_key`, as `ageRank` in
 * `@fphd/utils/observation-series` does: an age with no upper limit first, the earlier start
 * first, then a closed range, the longer first, then a segment with no age range.
 */
export function widestAgeFirst(dimensionKey: SQLWrapper, ages: AgeRanges): SQL {
  const from = days(ages.ageFromValue, ages.ageFromUnit);
  const under = days(ages.ageUnderValue, ages.ageUnderUnit);
  const ofKey = (value: SQL) => sql`(
    SELECT ${value} FROM ${ages}
    WHERE ${ages.id} = ANY(string_to_array(${dimensionKey}, ',')::uuid[])
      AND ${ages.ageFromValue} IS NOT NULL
    LIMIT 1
  )`;
  return sql`${ofKey(sql`${ages.ageUnderValue} IS NULL`)} DESC NULLS LAST,
    ${ofKey(sql`CASE WHEN ${ages.ageUnderValue} IS NULL THEN -${from} ELSE ${under} - ${from} END`)} DESC`;
}

/** An age range end as an ISO 8601 duration, as `isoDuration` in `@fphd/utils` writes it. */
export function isoDurationSql(value: SQLWrapper, unit: SQLWrapper): SQL<string | null> {
  const designators = AGE_UNITS.map((each) =>
    sql.raw(`WHEN '${each}' THEN '${AGE_UNIT_DESIGNATORS[each]}'`),
  );
  return sql<string | null>`'P' || ${value} || CASE ${unit} ${sql.join(designators, sql` `)} END`;
}

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
 * How the age of a `dimension_key` ranks, as `ageRank` in `@fphd/utils/observation-series`
 * ranks it. `open` is true for an age with no upper limit, false for a closed range and null for
 * a key with no age range. `span` orders ages within each: the earlier start first for an open
 * age, then the longer closed range.
 */
export function ageRankSql(dimensionKey: SQLWrapper, ages: AgeRanges): { open: SQL; span: SQL } {
  const from = days(ages.ageFromValue, ages.ageFromUnit);
  const under = days(ages.ageUnderValue, ages.ageUnderUnit);
  const ofKey = (value: SQL) => sql`(
    SELECT ${value} FROM ${ages}
    WHERE ${ages.id} = ANY(string_to_array(${dimensionKey}, ',')::uuid[])
    LIMIT 1
  )`;
  return {
    open: ofKey(sql`${ages.ageUnderValue} IS NULL`),
    span: ofKey(
      sql`CASE WHEN ${ages.ageUnderValue} IS NULL THEN -${from} ELSE ${under} - ${from} END`,
    ),
  };
}

/** Orders segments by the age of their `dimension_key`, widest first (see `ageRankSql`). */
export function widestAgeFirst(dimensionKey: SQLWrapper, ages: AgeRanges): SQL {
  const { open, span } = ageRankSql(dimensionKey, ages);
  return sql`${open} DESC NULLS LAST, ${span} DESC`;
}

/** An age range end as an ISO 8601 duration, matching `ISO_AGE_DURATION` in `@fphd/utils`. */
export function isoDurationSql(value: SQLWrapper, unit: SQLWrapper): SQL<string | null> {
  const designators = AGE_UNITS.map((each) =>
    sql.raw(`WHEN '${each}' THEN '${AGE_UNIT_DESIGNATORS[each]}'`),
  );
  return sql<string | null>`'P' || ${value} || CASE ${unit} ${sql.join(designators, sql` `)} END`;
}

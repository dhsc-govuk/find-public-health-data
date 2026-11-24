import { AGE_DIMENSION_NAME } from '@fphd/utils/observation-series';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

import { type AgeRanges, ageRankSql } from './age-span-sql.ts';
import type { dimensionType, dimensionValue } from './schema/dimension.ts';
import type { publishedDimensionType, publishedDimensionValue } from './schema/published.ts';

/** The dimension tables, or their published views, that rank a segment's dimensions. */
interface HeadlineDimensions {
  dimensionType: typeof dimensionType | typeof publishedDimensionType;
  dimensionValue: typeof dimensionValue | typeof publishedDimensionValue;
  dimensionValueAgeRange: AgeRanges;
}

/** How a `dimension_key` ranks for the headline, whatever its observations. */
interface KeyRank {
  /** The number of dimensions other than age. */
  otherDimensions: SQLWrapper;
  /** The number of dimensions. */
  dimensions: SQLWrapper;
  /** See `ageRankSql`. */
  ageOpen: SQLWrapper;
  ageSpan: SQLWrapper;
}

/** Observations sharing a dimension key and calendar-based period type, with that key's rank. */
interface HeadlineSegment extends KeyRank {
  /** The latest `to_date`, whether or not its value is suppressed. */
  latestPeriod: SQLWrapper;
  /** The number of points. */
  length: SQLWrapper;
  /** The approximate period length in days, shared by every point in the segment. */
  periodLength: SQLWrapper;
  /** The earliest point, as `from_date:to_date` text. */
  firstPoint: SQLWrapper;
}

/**
 * The rank of a `dimension_key`, as columns. Each is a lookup per key, so a query with many
 * segments works them out once for each distinct key and joins them in.
 */
export function dimensionKeyRank(
  dimensionKey: SQLWrapper,
  dimensions: HeadlineDimensions,
): Record<keyof KeyRank, SQL> {
  const age = ageRankSql(dimensionKey, dimensions.dimensionValueAgeRange);
  // Drizzle leaves out table names inside a CTE's select list, so the join names its own aliases.
  return {
    otherDimensions: sql`(
      SELECT count(*) FROM ${dimensions.dimensionValue} v
      JOIN ${dimensions.dimensionType} t ON t.id = v.dimension_type_id
      WHERE v.id = ANY(string_to_array(${dimensionKey}, ',')::uuid[])
        AND t.name <> ${AGE_DIMENSION_NAME}
    )`,
    dimensions: sql`cardinality(string_to_array(${dimensionKey}, ','))`,
    ageOpen: age.open,
    ageSpan: age.span,
  };
}

/**
 * Orders segments for the headline, as `headlineSeries` in `@fphd/utils/observation-series`
 * does. The rule is the fewest dimensions other than age, then the newest period, then the fewest
 * dimensions, then the widest age, then the most points, then the longest period type, then the
 * earliest first point. Callers add the dimension key as their final tie-breaker.
 */
export function headlineOrder(segment: HeadlineSegment): SQL[] {
  return [
    sql`${segment.otherDimensions}`,
    sql`${segment.latestPeriod} DESC`,
    sql`${segment.dimensions}`,
    sql`${segment.ageOpen} DESC NULLS LAST`,
    sql`${segment.ageSpan} DESC`,
    sql`${segment.length} DESC`,
    sql`${segment.periodLength} DESC`,
    sql`${segment.firstPoint} COLLATE "C"`,
  ];
}

/** The JavaScript dimension key: type name in C order, then each value's position in the key. */
export function dimensionKeyOrder(
  dimensionKey: SQLWrapper,
  dimensions: Pick<HeadlineDimensions, 'dimensionValue' | 'dimensionType'>,
): SQL<string> {
  return sql<string>`(select coalesce(string_agg(dt.name || ':' || dv.name, '|'
    order by dt.name COLLATE "C", key.position), '')
    from unnest(string_to_array(${dimensionKey}, ',')::uuid[])
      with ordinality as key(id, position)
    join ${dimensions.dimensionValue} dv on dv.id = key.id
    join ${dimensions.dimensionType} dt on dt.id = dv.dimension_type_id
    ) COLLATE "C"`;
}

import { AGE_DIMENSION_NAME } from '@fphd/utils/observation-series';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

import { type AgeRanges, widestAgeFirst } from './age-span-sql.ts';
import type { dimensionType, dimensionValue } from './schema/dimension.ts';
import type { publishedDimensionType, publishedDimensionValue } from './schema/published.ts';

/** The dimension tables, or their published views, that rank a segment's dimensions. */
export interface HeadlineDimensions {
  dimensionType: typeof dimensionType | typeof publishedDimensionType;
  dimensionValue: typeof dimensionValue | typeof publishedDimensionValue;
  dimensionValuePublic: AgeRanges;
}

/** A group of observations that share a dimension key. */
export interface HeadlineSegment {
  dimensionKey: SQLWrapper;
  /** The latest `to_date` with a non-null value. */
  latestValue: SQLWrapper;
  /** The number of points. */
  length: SQLWrapper;
  /** The earliest point, as `from_date:to_date` text. */
  firstPoint: SQLWrapper;
}

/**
 * Orders segments for the headline, as `headlineSeries` in `@fphd/utils/observation-series`
 * does. The rule is the fewest dimensions other than age, then the newest value, then the fewest
 * dimensions, then the widest age (see `widestAgeFirst`), then the most points, then the earliest
 * first point. Callers add their own final tie-breaker, such as the dimension key.
 */
export function headlineOrder(segment: HeadlineSegment, dimensions: HeadlineDimensions): SQL[] {
  const { dimensionType: types, dimensionValue: values } = dimensions;
  return [
    sql`(
      SELECT count(*) FROM ${values}
      JOIN ${types} ON ${types.id} = ${values.dimensionTypeId}
      WHERE ${values.id} = ANY(string_to_array(${segment.dimensionKey}, ',')::uuid[])
        AND ${types.name} <> ${AGE_DIMENSION_NAME}
    )`,
    sql`${segment.latestValue} DESC NULLS LAST`,
    sql`cardinality(string_to_array(${segment.dimensionKey}, ','))`,
    widestAgeFirst(segment.dimensionKey, dimensions.dimensionValuePublic),
    sql`${segment.length} DESC`,
    sql`${segment.firstPoint} COLLATE "C"`,
  ];
}

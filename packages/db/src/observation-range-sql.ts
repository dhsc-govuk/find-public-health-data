import { count, type SQLWrapper, sql } from 'drizzle-orm';

export function observationSegmentSql(valueName: SQLWrapper, typeName: SQLWrapper) {
  return sql<string>`coalesce(string_agg(${valueName}, '|' ORDER BY ${typeName} COLLATE "C"), '')`;
}

export function observationRangeSql(value: SQLWrapper) {
  return {
    min: sql<number>`min(${value})`.as('min'),
    max: sql<number>`max(${value})`.as('max'),
    p25: sql<number>`(percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY ${value}))[1]`.as(
      'p25',
    ),
    p75: sql<number>`(percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY ${value}))[2]`.as(
      'p75',
    ),
    // Ties stay in the group of their first rank because charts advance only past a cutoff.
    quintileCutoffs: sql<number[] | null>`CASE WHEN ${count()} >= 5 THEN
      percentile_disc(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY ${value})
    END`.as('quintile_cutoffs'),
  };
}

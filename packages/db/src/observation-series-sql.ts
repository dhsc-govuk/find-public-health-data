import { desc, type SQLWrapper, sql } from 'drizzle-orm';

export function headlineSeriesOrder(
  series: {
    dimensionKey: SQLWrapper;
    valueCount: SQLWrapper;
    periodLength: SQLWrapper;
    firstPoint: SQLWrapper;
  },
  dimensions: {
    dimensionValue: SQLWrapper;
    dimensionType: SQLWrapper;
  },
) {
  const key = sql`(select coalesce(string_agg(dt.name || ':' || dv.name, '|'
    order by dt.name COLLATE "C"), '')
    from ${dimensions.dimensionValue} dv
    join ${dimensions.dimensionType} dt on dt.id = dv.dimension_type_id
    where dv.id = any(string_to_array(${series.dimensionKey}, ',')::uuid[]))`;
  return [
    sql`cardinality(string_to_array(${series.dimensionKey}, ','))`,
    desc(series.valueCount),
    desc(series.periodLength),
    sql`${series.firstPoint} COLLATE "C"`,
    sql`${key} COLLATE "C"`,
  ];
}

import type { ObservationPeriodType } from '@fphd/utils/observation-series';
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

export function observationPeriodSql(fromDate: SQLWrapper, toDate: SQLWrapper) {
  const years = sql`(extract(year from ${toDate} + 1) - extract(year from ${fromDate}))::integer`;
  return sql<ObservationPeriodType>`case when ${years} > 0
    and to_char(${fromDate}, 'MM-DD') = to_char(${toDate} + 1, 'MM-DD')
    then ${years}::text || '-year'
    else (${toDate} - ${fromDate} + 1)::text || '-day' end`;
}

export function periodLengthSql(periodType: SQLWrapper) {
  return sql<number>`split_part(${periodType}, '-', 1)::numeric *
    case when ${periodType} like '%-year' then 365.25 else 1 end`;
}

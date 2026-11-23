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
    order by dt.name COLLATE "C", key.position), '')
    from unnest(string_to_array(${series.dimensionKey}, ',')::uuid[])
      with ordinality as key(id, position)
    join ${dimensions.dimensionValue} dv on dv.id = key.id
    join ${dimensions.dimensionType} dt on dt.id = dv.dimension_type_id
    )`;
  return [
    sql`cardinality(string_to_array(${series.dimensionKey}, ','))`,
    desc(series.valueCount),
    desc(series.periodLength),
    sql`${series.firstPoint} COLLATE "C"`,
    sql`${key} COLLATE "C"`,
  ];
}

export function observationPeriodSql(fromDate: SQLWrapper, toDate: SQLWrapper) {
  const months = sql`((extract(year from ${toDate} + 1) - extract(year from ${fromDate})) * 12
    + extract(month from ${toDate} + 1) - extract(month from ${fromDate}))::integer`;
  return sql<ObservationPeriodType>`(select case
    when months % 12 = 0 then (months / 12)::text || '-year'
    when months > 0 then months::text || '-month'
    else (${toDate} - ${fromDate} + 1)::text || '-day' end
    from (select case
      when month_count > 0
        and start_date + make_interval(months => month_count) = end_date then month_count
      when month_count > 1
        and extract(day from start_date) > extract(day from end_date - 1)
        and start_date + make_interval(months => month_count - 1) = end_date - 1
        then month_count - 1 end as months
      from (values (${fromDate}, ${toDate} + 1, ${months}))
        as spans(start_date, end_date, month_count)
      offset 0
    ) as whole_months)`;
}

export function periodLengthSql(periodType: SQLWrapper) {
  return sql<number>`split_part(${periodType}, '-', 1)::numeric *
    case when ${periodType} like '%-year' then 365.25
      when ${periodType} like '%-month' then 30.4375 else 1 end`;
}

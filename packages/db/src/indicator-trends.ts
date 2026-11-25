import { ENGLAND_AREA_CODE, OBSERVATION_SERIES_VERSION } from '@fphd/utils/observation-series';
import { recentTrendDirection, type TrendDirection } from '@fphd/utils/recent-trend';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseReader } from './client.ts';
import { dimensionKeyOrder, dimensionKeyRank, headlineOrder } from './headline-order.ts';
import { observationPeriodSql, periodLengthSql } from './observation-series-sql.ts';
import type { ViewSet } from './schema/index.ts';

/**
 * The trend of each indicator's headline series in one area, from its five latest valid values.
 * The series is chosen once per indicator, in the order `headlineOrder` gives, not per sex and
 * period type as the stored series are. Indicators without a single value for the area, such as those
 * whose values are all suppressed, are left out of the result. England reads the trend values
 * cached at publication and works out only the ones missing.
 */
export async function indicatorTrendDirections(
  db: DatabaseReader,
  views: ViewSet,
  ids: string[],
  areaCode = ENGLAND_AREA_CODE,
): Promise<Map<string, TrendDirection>> {
  const { observationSeriesBatch: batches } = views;
  if (ids.length === 0) return new Map();
  if (areaCode !== ENGLAND_AREA_CODE) return areaTrendDirections(db, views, ids, areaCode);
  const cached = await db
    .select({ id: batches.indicatorId, values: batches.trendValues })
    .from(batches)
    .where(and(inArray(batches.indicatorId, ids), eq(batches.version, OBSERVATION_SERIES_VERSION)));
  const result = new Map(
    cached.flatMap(({ id, values }) =>
      values === null ? [] : [[id, recentTrendDirection([...values].reverse())] as const],
    ),
  );
  const missing = ids.filter((id) => !result.has(id));
  if (!missing.length) return result;
  return new Map([
    ...result,
    ...(await areaTrendDirections(db, views, missing, ENGLAND_AREA_CODE)),
  ]);
}

async function areaTrendDirections(
  db: DatabaseReader,
  views: ViewSet,
  ids: string[],
  areaCode: string,
): Promise<Map<string, TrendDirection>> {
  const { area, observation } = views;
  const rows = await db.execute<{ indicator_id: string; values: number[] }>(sql`
    with cumulative_periods as (
      select ${observation.indicatorId} as indicator_id, ${observation.dimensionKey} as segment,
        max(${observation.periodType}) as period_type
      from ${observation}
      where ${inArray(observation.indicatorId, ids)} and ${observation.periodType} like 'cumulative-quarter-%'
      group by ${observation.indicatorId}, ${observation.dimensionKey}
    ), points as materialized (
      select ${observation.indicatorId} as indicator_id, ${observation.fromDate} as from_date,
        ${observation.toDate} as to_date, ${observation.value} as value,
        ${observation.dimensionKey} as segment,
        ${observationPeriodSql(observation.fromDate, observation.toDate, observation.periodType)} as period_type
      from ${observation}
      join ${area} on ${area.id} = ${observation.areaId} and ${area.code} = ${areaCode}
      left join cumulative_periods c on c.indicator_id = ${observation.indicatorId}
        and c.segment = ${observation.dimensionKey}
      where ${inArray(observation.indicatorId, ids)}
        and (c.period_type is null or ${observation.periodType} = c.period_type)
    ), series as (
      select distinct on (indicator_id) indicator_id, segment, period_type,
        bool_or(bool_or(value is not null)) over (partition by indicator_id) as has_value
      from points group by indicator_id, segment, period_type
      order by indicator_id, ${sql.join(
        headlineOrder({
          ...dimensionKeyRank(sql`segment`, views),
          latestPeriod: sql`max(to_date)`,
          length: sql`count(*)`,
          periodLength: periodLengthSql(sql`period_type`),
          firstPoint: sql`min(from_date::text || ':' || to_date::text)`,
        }),
        sql`, `,
      )}, ${dimensionKeyOrder(sql`segment`, views)}
    )
    select s.indicator_id,
      coalesce((array_agg(p.value order by p.from_date desc, p.to_date desc)
        filter (where p.value is not null))[1:5], '{}') as values
    from series s join points p on p.indicator_id = s.indicator_id and p.segment = s.segment
        and p.period_type = s.period_type
    where s.has_value
    group by s.indicator_id

  `);
  return new Map(
    rows.map(
      ({ indicator_id, values }) =>
        [indicator_id, recentTrendDirection([...values].reverse())] as const,
    ),
  );
}

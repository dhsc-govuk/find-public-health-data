import { ENGLAND_AREA_CODE, OBSERVATION_SERIES_VERSION } from '@fphd/utils/observation-series';
import {
  type TrendDirection,
  type TrendSettings,
  type TrendSummary,
  trendDirection,
} from '@fphd/utils/recent-trend';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseReader } from './client.ts';
import { dimensionKeyOrder, dimensionKeyRank, headlineOrder } from './headline-order.ts';
import {
  observationPeriodSql,
  periodLengthSql,
  trendSummarySql,
} from './observation-series-sql.ts';
import type { ViewSet } from './schema/index.ts';

/** What each indicator's recent trend depends on beyond its data. */
export async function indicatorTrendSettings(
  db: DatabaseReader,
  views: ViewSet,
  ids: string[],
): Promise<Map<string, TrendSettings>> {
  const { indicator, valueType } = views;
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: indicator.id, valueType: valueType.name })
    .from(indicator)
    .leftJoin(valueType, eq(valueType.id, indicator.valueTypeId))
    .where(inArray(indicator.id, ids));
  return new Map(rows.map(({ id, valueType }) => [id, { valueType }]));
}

/**
 * The trend summary of each indicator's headline series in one area. The series is chosen once
 * per indicator, in the order `headlineOrder` gives, not per sex and period type as the stored
 * series are. Indicators without a single value for the area, such as those whose values are all
 * suppressed, are left out of the result. England reads the summaries cached at publication and
 * works out only the ones missing.
 */
export async function indicatorTrendSummaries(
  db: DatabaseReader,
  views: ViewSet,
  ids: string[],
  areaCode = ENGLAND_AREA_CODE,
): Promise<Map<string, TrendSummary>> {
  const { observationSeriesBatch: batches } = views;
  if (ids.length === 0) return new Map();
  if (areaCode !== ENGLAND_AREA_CODE) return areaTrendSummaries(db, views, ids, areaCode);
  const cached = await db
    .select({ id: batches.indicatorId, trend: batches.trend })
    .from(batches)
    .where(and(inArray(batches.indicatorId, ids), eq(batches.version, OBSERVATION_SERIES_VERSION)));
  const result = new Map(
    cached.flatMap(({ id, trend }) => (trend === null ? [] : [[id, trend] as const])),
  );
  const missing = ids.filter((id) => !result.has(id));
  if (missing.length)
    for (const entry of await areaTrendSummaries(db, views, missing, ENGLAND_AREA_CODE))
      result.set(...entry);
  return result;
}

/** The recent trend of each indicator `indicatorTrendSummaries` summarises, by Fingertips' rules. */
export async function indicatorTrendDirections(
  db: DatabaseReader,
  views: ViewSet,
  ids: string[],
  areaCode = ENGLAND_AREA_CODE,
): Promise<Map<string, TrendDirection>> {
  const [settings, summaries] = await Promise.all([
    indicatorTrendSettings(db, views, ids),
    indicatorTrendSummaries(db, views, ids, areaCode),
  ]);
  return new Map(
    [...summaries].map(
      ([id, summary]) =>
        [id, trendDirection(summary, settings.get(id) ?? { valueType: null })] as const,
    ),
  );
}

async function areaTrendSummaries(
  db: DatabaseReader,
  views: ViewSet,
  ids: string[],
  areaCode: string,
): Promise<Map<string, TrendSummary>> {
  const { area, observation } = views;
  const rows = await db.execute<{ indicator_id: string; trend: TrendSummary }>(sql`
    with cumulative_periods as (
      select ${observation.indicatorId} as indicator_id, ${observation.dimensionKey} as segment,
        max(${observation.periodType}) as period_type
      from ${observation}
      where ${inArray(observation.indicatorId, ids)} and ${observation.periodType} like 'cumulative-quarter-%'
      group by ${observation.indicatorId}, ${observation.dimensionKey}
    ), points as materialized (
      select ${observation.indicatorId} as indicator_id, ${observation.fromDate} as from_date,
        ${observation.toDate} as to_date, ${observation.value} as value,
        coalesce(${observation.count}, ${observation.numerator}) as count,
        ${observation.denominator} as denominator, ${observation.lowerCi95} as lower_ci_95,
        ${observation.upperCi95} as upper_ci_95, ${observation.dimensionKey} as segment,
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
    select s.indicator_id, ${trendSummarySql({
      fromDate: sql`p.from_date`,
      toDate: sql`p.to_date`,
      value: sql`p.value`,
      count: sql`p.count`,
      denominator: sql`p.denominator`,
      lowerCi95: sql`p.lower_ci_95`,
      upperCi95: sql`p.upper_ci_95`,
      periodType: sql`p.period_type`,
    })} as trend
    from series s join points p on p.indicator_id = s.indicator_id and p.segment = s.segment
        and p.period_type = s.period_type
    where s.has_value
    group by s.indicator_id

  `);
  return new Map(rows.map(({ indicator_id, trend }) => [indicator_id, trend] as const));
}

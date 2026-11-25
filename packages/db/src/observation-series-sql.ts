import type { ObservationPeriodType } from '@fphd/utils/observation-series';
import { TREND_POINTS, type TrendSummary } from '@fphd/utils/recent-trend';
import { and, like, max, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { DatabaseReader } from './client.ts';
import type { observation as observationTable, ViewSet } from './schema/index.ts';

export function observationPeriodSql(
  fromDate: SQLWrapper,
  toDate: SQLWrapper,
  periodType?: SQLWrapper,
) {
  const months = sql`((extract(year from ${toDate} + 1) - extract(year from ${fromDate})) * 12
    + extract(month from ${toDate} + 1) - extract(month from ${fromDate}))::integer`;
  const duration = sql<ObservationPeriodType>`(select case
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
  return periodType ? sql<ObservationPeriodType>`coalesce(${periodType}, ${duration})` : duration;
}

export function periodLengthSql(periodType: SQLWrapper) {
  return sql<number>`case when ${periodType} like 'cumulative-quarter-%' then 91.3125
    else split_part(${periodType}, '-', 1)::numeric *
    case when ${periodType} like '%-year' then 365.25
      when ${periodType} like '%-month' then 30.4375 else 1 end end`;
}

// A baseline replaces annual twins only for the same population; other populations can publish
// annual data or a different cumulative cycle in the same batch.
export function cumulativePeriodsFor(
  db: DatabaseReader,
  observation: typeof observationTable | ViewSet['observation'],
  scope: SQL | undefined,
) {
  return db.$with('cumulative_periods').as(
    db
      .select({
        indicatorId: observation.indicatorId,
        dimensionKey: observation.dimensionKey,
        periodType: max(observation.periodType).as('cumulative_period_type'),
      })
      .from(observation)
      .where(and(scope, like(observation.periodType, 'cumulative-quarter-%')))
      .groupBy(observation.indicatorId, observation.dimensionKey),
  );
}

/**
 * The `TrendSummary` of a group of observations that form one series, as `summariseTrend` builds
 * it: an aggregate, so the read models can store it alongside the series they choose.
 */
export function trendSummarySql(points: {
  fromDate: SQLWrapper;
  toDate: SQLWrapper;
  value: SQLWrapper;
  count: SQLWrapper;
  denominator: SQLWrapper;
  lowerCi95: SQLWrapper;
  upperCi95: SQLWrapper;
  periodType: SQLWrapper;
}) {
  return sql<TrendSummary>`(SELECT jsonb_build_object(
    'annual', bool_and(${points.periodType} IN ('1-year', '1-day')),
    'run', max(r.run),
    'runHasCountEqualToDenominator',
      coalesce(bool_or(r.count = r.denominator) FILTER (WHERE r.n <= r.run), false),
    'points', coalesce(jsonb_agg(jsonb_build_object('value', r.value, 'count', r.count,
        'denominator', r.denominator, 'lowerCi95', r.lower_ci_95, 'upperCi95', r.upper_ci_95)
      ORDER BY r.n DESC) FILTER (WHERE r.n <= least(r.run, ${TREND_POINTS})), '[]'::jsonb)
  ) FROM (
    SELECT v.*,
      coalesce(min(v.n) FILTER (WHERE NOT v.valid) OVER (), count(*) OVER () + 1) - 1 AS run
    FROM (
      SELECT e.n, (e.row->>2)::float8 AS value, (e.row->>3)::float8 AS count,
        (e.row->>4)::float8 AS denominator, (e.row->>5)::float8 AS lower_ci_95,
        (e.row->>6)::float8 AS upper_ci_95,
        e.row->>2 IS NOT NULL AND e.row->>3 IS NOT NULL
          AND coalesce((e.row->>4)::float8 > 0, false)
          AND e.row->>5 IS NOT NULL AND e.row->>6 IS NOT NULL
          AND coalesce(((e.row->>0)::date + interval '1 year')::date
            = (lag(e.row->>0) OVER (ORDER BY e.n))::date, true) AS valid
      FROM jsonb_array_elements(jsonb_agg(jsonb_build_array(${points.fromDate}, ${points.toDate},
        ${points.value}, ${points.count}, ${points.denominator}, ${points.lowerCi95},
        ${points.upperCi95}) ORDER BY ${points.fromDate} DESC, ${points.toDate} DESC))
        WITH ORDINALITY AS e(row, n)
    ) v
  ) r)`;
}

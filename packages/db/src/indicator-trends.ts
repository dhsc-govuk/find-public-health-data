import { ENGLAND_AREA_CODE } from '@fphd/utils/observation-series';
import { recentTrendDirection, type TrendDirection } from '@fphd/utils/recent-trend';
import { inArray, sql } from 'drizzle-orm';
import type { DatabaseReader } from './client.ts';
import type { ViewSet } from './schema/index.ts';

/**
 * The trend of each indicator's least-disaggregated, longest series in one area, from its five
 * latest valid values. Indicators with no data for the area are left out of the result.
 * England reads the trend values cached at publication and works out only the ones missing.
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
    .where(inArray(batches.indicatorId, ids));
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
    with points as materialized (
      select ${observation.indicatorId} as indicator_id, ${observation.fromDate} as from_date,
        ${observation.toDate} as to_date, ${observation.value} as value,
        ${observation.dimensionKey} as segment
      from ${observation}
      join ${area} on ${area.id} = ${observation.areaId} and ${area.code} = ${areaCode}
      where ${inArray(observation.indicatorId, ids)}
    ), series as (
      select distinct on (indicator_id) indicator_id, segment
      from points group by indicator_id, segment
      order by indicator_id, cardinality(string_to_array(segment, ',')), count(value) desc, segment
    )
    select s.indicator_id,
      coalesce((array_agg(p.value order by p.from_date desc, p.to_date desc)
        filter (where p.value is not null))[1:5], '{}') as values
    from series s join points p on p.indicator_id = s.indicator_id and p.segment = s.segment
    group by s.indicator_id

  `);
  return new Map(
    rows.map(
      ({ indicator_id, values }) =>
        [indicator_id, recentTrendDirection([...values].reverse())] as const,
    ),
  );
}

import { recentTrendDirection, type TrendDirection } from '@fphd/utils/recent-trend';
import { inArray, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import {
  publishedArea as area,
  publishedObservationSeriesBatch as batches,
  publishedObservation as observation,
} from './schema/index.ts';

/** The least-disaggregated, longest England series, with only its five latest valid values returned. */
export async function indicatorTrendDirections(
  db: Database,
  ids: string[],
): Promise<Map<string, TrendDirection>> {
  if (ids.length === 0) return new Map();
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
  const rows = await db.execute<{ indicator_id: string; values: number[] }>(sql`
    with points as materialized (
      select ${observation.indicatorId} as indicator_id, ${observation.fromDate} as from_date,
        ${observation.toDate} as to_date, ${observation.value} as value,
        ${observation.dimensionKey} as segment
      from ${observation}
      join ${area} on ${area.id} = ${observation.areaId} and ${area.code} = 'E92000001'
      where ${inArray(observation.indicatorId, missing)}
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
  return new Map([
    ...result,
    ...rows.map(
      ({ indicator_id, values }) =>
        [indicator_id, recentTrendDirection([...values].reverse())] as const,
    ),
  ]);
}

import type { Database } from '@fphd/db';
import { type SQL, sql } from 'drizzle-orm';

import { replaceObservationSeries } from './observation-series.ts';

/** A transaction opened on a `Database`, as its `transaction` callback receives it. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The derived tables, so the rebuild, the seed's truncate and the row-count report agree. */
export const READ_MODEL_TABLES = [
  'available_data',
  'observation_range',
  'observation_series',
  'observation_series_batch',
] as const;

/** Matches `column` to `indicatorId`, or every row when it is undefined. */
function forIndicator(column: SQL, indicatorId: string | undefined): SQL {
  return indicatorId === undefined ? sql`TRUE` : sql`${column} = ${indicatorId}`;
}

/**
 * Replaces the read models' rows from the published views, for one indicator or for all.
 * DELETE rather than TRUNCATE takes only row locks, so readers see the previous rows until the
 * caller commits. Dimension rows are reached only through `published.observation`:
 * `published.observation_dimension` would join the observations again. The tables are deleted
 * from in `READ_MODEL_TABLES` order, as the rebuild locks them.
 */
async function replaceReadModelRows(
  tx: Database | Transaction,
  indicatorId: string | undefined,
): Promise<void> {
  await tx.execute(
    sql`DELETE FROM available_data WHERE ${forIndicator(sql`indicator_id`, indicatorId)}`,
  );
  await tx.execute(
    sql`DELETE FROM observation_range WHERE ${forIndicator(sql`indicator_id`, indicatorId)}`,
  );

  await tx.execute(sql`
    INSERT INTO available_data (indicator_id, area_type_id, area_type_name, area_count)
    SELECT o.indicator_id, a.area_type_id, MAX(at.name), COUNT(DISTINCT o.area_id)
    FROM published.observation o
    JOIN published.area a ON a.id = o.area_id
    JOIN published.area_type at ON at.id = a.area_type_id
    WHERE ${forIndicator(sql`o.indicator_id`, indicatorId)}
    GROUP BY o.indicator_id, a.area_type_id
  `);

  // Keep aligned with the newest migration inserting into observation_range, which reads the
  // tables; a test runs both against a seed whose data is all published.
  await tx.execute(sql`
    INSERT INTO observation_range
      (indicator_id, display_group, from_date, to_date, segment, min, max, p25, p75, quintile_cutoffs)
    WITH range_observations AS (
      SELECT
        o.indicator_id,
        at.display_group,
        o.from_date,
        o.to_date,
        o.value,
        coalesce(
          string_agg(dv.name, '|' ORDER BY dt.name COLLATE "C"),
          ''
        ) AS segment
      FROM published.observation o
      JOIN published.area a ON a.id = o.area_id
      JOIN published.area_type at ON at.id = a.area_type_id
      LEFT JOIN observation_dimension od ON od.observation_id = o.id
      LEFT JOIN published.dimension_type dt ON dt.id = od.dimension_type_id
      LEFT JOIN published.dimension_value dv ON dv.id = od.dimension_value_id
      WHERE o.value IS NOT NULL
        AND at.display_group IS NOT NULL
        AND ${forIndicator(sql`o.indicator_id`, indicatorId)}
      GROUP BY o.id, o.indicator_id, at.display_group, o.from_date, o.to_date, o.value
    ), distributions AS (
      SELECT
        ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment,
        min(ro.value) AS min, max(ro.value) AS max,
        percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY ro.value) AS quartiles,
        percentile_disc(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY ro.value) AS quintiles,
        count(*) AS n
      FROM range_observations ro
      GROUP BY ro.indicator_id, ro.display_group, ro.from_date, ro.to_date, ro.segment
    )
    SELECT
      indicator_id, display_group, from_date, to_date, segment, min, max,
      quartiles[1], quartiles[2],
      -- Each cutoff is the value at rank ceil(n × fifth). Tied values stay in the group
      -- of their first rank because the chart advances only past a cutoff.
      CASE WHEN n >= 5 THEN quintiles END
    FROM distributions
  `);

  await replaceObservationSeries(tx, indicatorId);
}

/**
 * Replaces one indicator's read-model rows from what is published for it, inside the caller's
 * transaction, so they change together with whatever published it. An indicator with nothing
 * published ends with no rows.
 */
export function refreshIndicatorReadModels(tx: Transaction, indicatorId: string): Promise<void> {
  return replaceReadModelRows(tx, indicatorId);
}

/**
 * Rebuilds every indicator's read-model rows inside the caller's transaction. The lock lets
 * readers through but holds back a per-indicator refresh until the rebuild commits, so none can
 * commit between the rebuild's DELETE and its INSERT and collide with it on a primary key.
 */
export async function rebuildReadModelTables(tx: Database | Transaction): Promise<void> {
  await tx.execute(
    sql`LOCK TABLE ${sql.raw(READ_MODEL_TABLES.join(', '))} IN SHARE ROW EXCLUSIVE MODE`,
  );
  await replaceReadModelRows(tx, undefined);
}

import { type Database, schema } from '@fphd/db';
import { type AnyColumn, and, countDistinct, eq, isNotNull, max, min, sql } from 'drizzle-orm';

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

function forIndicator(column: AnyColumn, indicatorId: string | undefined) {
  return indicatorId === undefined ? undefined : eq(column, indicatorId);
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
  const {
    availableData,
    observationRange,
    publishedObservation: o,
    publishedArea: a,
    publishedAreaType: at,
    observationDimension: od,
    publishedDimensionType: dt,
    publishedDimensionValue: dv,
  } = schema;

  await tx.delete(availableData).where(forIndicator(availableData.indicatorId, indicatorId));
  await tx.delete(observationRange).where(forIndicator(observationRange.indicatorId, indicatorId));

  await tx.insert(availableData).select(
    tx
      .select({
        indicatorId: o.indicatorId,
        areaTypeId: a.areaTypeId,
        areaTypeName: max(at.name).as('area_type_name'),
        areaCount: countDistinct(o.areaId).as('area_count'),
      })
      .from(o)
      .innerJoin(a, eq(a.id, o.areaId))
      .innerJoin(at, eq(at.id, a.areaTypeId))
      .where(forIndicator(o.indicatorId, indicatorId))
      .groupBy(o.indicatorId, a.areaTypeId),
  );

  // Keep aligned with the newest migration inserting into observation_range, which reads the
  // tables; a test runs both against a seed whose data is all published.
  const rangeObservations = tx.$with('range_observations').as(
    tx
      .select({
        indicatorId: o.indicatorId,
        displayGroup: at.displayGroup,
        fromDate: o.fromDate,
        toDate: o.toDate,
        value: o.value,
        segment:
          sql<string>`coalesce(string_agg(${dv.name}, '|' ORDER BY ${dt.name} COLLATE "C"), '')`.as(
            'segment',
          ),
      })
      .from(o)
      .innerJoin(a, eq(a.id, o.areaId))
      .innerJoin(at, eq(at.id, a.areaTypeId))
      .leftJoin(od, eq(od.observationId, o.id))
      .leftJoin(dt, eq(dt.id, od.dimensionTypeId))
      .leftJoin(dv, eq(dv.id, od.dimensionValueId))
      .where(
        and(
          isNotNull(o.value),
          isNotNull(at.displayGroup),
          forIndicator(o.indicatorId, indicatorId),
        ),
      )
      .groupBy(o.id, o.indicatorId, at.displayGroup, o.fromDate, o.toDate, o.value),
  );

  await tx
    .with(rangeObservations)
    .insert(observationRange)
    .select(
      tx
        .select({
          indicatorId: rangeObservations.indicatorId,
          displayGroup: rangeObservations.displayGroup,
          fromDate: rangeObservations.fromDate,
          toDate: rangeObservations.toDate,
          segment: rangeObservations.segment,
          min: min(rangeObservations.value).as('min'),
          max: max(rangeObservations.value).as('max'),
        })
        .from(rangeObservations)
        .groupBy(
          rangeObservations.indicatorId,
          rangeObservations.displayGroup,
          rangeObservations.fromDate,
          rangeObservations.toDate,
          rangeObservations.segment,
        ),
    );

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

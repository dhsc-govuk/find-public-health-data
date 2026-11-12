import { type Database, schema } from '@fphd/db';
import { and, count, countDistinct, eq, isNotNull, max, min, sql } from 'drizzle-orm';

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

export interface ReadModelTiming {
  table: 'available_data' | 'observation_range' | 'observation_series';
  milliseconds: number;
}

type OnTiming = (timing: ReadModelTiming) => void;

async function replaceReadModelRows(
  tx: Database | Transaction,
  indicatorId: string,
  onTiming?: OnTiming,
): Promise<void> {
  const {
    availableData,
    observationRange,
    observation: o,
    currentPublishedVersion,
    indicatorVersion,
    publishedArea: a,
    publishedAreaType: at,
    observationDimension: od,
    publishedDimensionType: dt,
    publishedDimensionValue: dv,
  } = schema;

  // The published view's ANY(all published batches) can scan the entire batch index even for
  // one indicator. Resolve the same visibility rule once, then constrain every read to its batch.
  const [published] = await tx
    .select({ uploadBatchId: indicatorVersion.uploadBatchId })
    .from(currentPublishedVersion)
    .innerJoin(indicatorVersion, eq(indicatorVersion.id, currentPublishedVersion.id))
    .where(eq(currentPublishedVersion.indicatorId, indicatorId));
  const uploadBatchId = published?.uploadBatchId;
  const visible = and(
    eq(o.indicatorId, indicatorId),
    uploadBatchId ? eq(o.uploadBatchId, uploadBatchId) : undefined,
  );

  let started = performance.now();
  await tx.delete(availableData).where(eq(availableData.indicatorId, indicatorId));
  if (uploadBatchId) {
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
        .where(visible)
        .groupBy(o.indicatorId, a.areaTypeId),
    );
  }
  onTiming?.({ table: 'available_data', milliseconds: performance.now() - started });

  started = performance.now();
  await tx.delete(observationRange).where(eq(observationRange.indicatorId, indicatorId));
  if (uploadBatchId) {
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
        .where(and(isNotNull(o.value), isNotNull(at.displayGroup), visible))
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
            p25: sql<number>`(percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY ${rangeObservations.value}))[1]`.as(
              'p25',
            ),
            p75: sql<number>`(percentile_cont(ARRAY[0.25, 0.75]) WITHIN GROUP (ORDER BY ${rangeObservations.value}))[2]`.as(
              'p75',
            ),
            // Each cutoff is the value at rank ceil(n × fifth). Tied values stay in the group
            // of their first rank because the chart advances only past a cutoff.
            quintileCutoffs: sql<number[] | null>`
            CASE WHEN ${count()} >= 5 THEN
              percentile_disc(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY ${rangeObservations.value})
            END
          `.as('quintile_cutoffs'),
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
  }
  onTiming?.({ table: 'observation_range', milliseconds: performance.now() - started });

  started = performance.now();
  await replaceObservationSeries(tx, indicatorId, uploadBatchId ?? undefined);
  onTiming?.({ table: 'observation_series', milliseconds: performance.now() - started });
}

/**
 * Replaces one indicator's read-model rows from what is published for it, inside the caller's
 * transaction, so they change together with whatever published it. An indicator with nothing
 * published ends with no rows.
 */
export async function refreshIndicatorReadModels(
  tx: Database | Transaction,
  indicatorId: string,
  onTiming?: OnTiming,
): Promise<void> {
  // Publishing also updates this row. Serializing before reading the published batch prevents a
  // rebuild from committing an older batch over a publication that finished while it waited.
  await tx
    .select({ id: schema.indicator.id })
    .from(schema.indicator)
    .where(eq(schema.indicator.id, indicatorId))
    .for('no key update');
  await replaceReadModelRows(tx, indicatorId, onTiming);
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
  for (const table of [
    schema.availableData,
    schema.observationRange,
    schema.observationSeries,
    schema.observationSeriesBatch,
  ]) {
    await tx.delete(table);
  }
  const published = await tx
    .select({ indicatorId: schema.currentPublishedVersion.indicatorId })
    .from(schema.currentPublishedVersion);
  for (const { indicatorId } of published) {
    await replaceReadModelRows(tx, indicatorId);
  }
}

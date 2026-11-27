import {
  cumulativePeriodsFor,
  type Database,
  observationRangeSql,
  observationSegmentSql,
  schema,
} from '@fphd/db';
import { and, countDistinct, eq, isNotNull, isNull, max, or, sql } from 'drizzle-orm';

import { replaceObservationSeries } from './observation-series.ts';
import { visibleObservations } from './observation-visibility.ts';

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

  // Resolving the published batch and cutoff once avoids repeating the version lookup for each model.
  const [published] = await tx
    .select({
      uploadBatchId: indicatorVersion.uploadBatchId,
      publishedFrom: indicatorVersion.publishedFrom,
    })
    .from(currentPublishedVersion)
    .innerJoin(indicatorVersion, eq(indicatorVersion.id, currentPublishedVersion.id))
    .where(eq(currentPublishedVersion.indicatorId, indicatorId));
  const uploadBatchId = published?.uploadBatchId;
  const publishedFrom = published?.publishedFrom ?? null;
  const visible = uploadBatchId
    ? and(
        visibleObservations(indicatorId, uploadBatchId, publishedFrom),
        eq(o.isCurrentSeries, true),
      )
    : undefined;

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
    const cumulativePeriods = cumulativePeriodsFor(tx, o, visible);
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
          segment: observationSegmentSql(dv.name, dt.name).as('segment'),
        })
        .from(o)
        .leftJoin(
          cumulativePeriods,
          and(
            eq(cumulativePeriods.indicatorId, o.indicatorId),
            eq(cumulativePeriods.dimensionKey, o.dimensionKey),
          ),
        )
        .innerJoin(a, eq(a.id, o.areaId))
        .innerJoin(at, eq(at.id, a.areaTypeId))
        .leftJoin(od, eq(od.observationId, o.id))
        .leftJoin(dt, eq(dt.id, od.dimensionTypeId))
        .leftJoin(dv, eq(dv.id, od.dimensionValueId))
        .where(
          and(
            isNotNull(o.value),
            isNotNull(at.displayGroup),
            visible,
            or(
              isNull(cumulativePeriods.periodType),
              eq(o.periodType, cumulativePeriods.periodType),
            ),
          ),
        )
        .groupBy(o.id, o.indicatorId, at.displayGroup, o.fromDate, o.toDate, o.value),
    );

    await tx
      .with(cumulativePeriods, rangeObservations)
      .insert(observationRange)
      .select(
        tx
          .select({
            indicatorId: rangeObservations.indicatorId,
            displayGroup: rangeObservations.displayGroup,
            fromDate: rangeObservations.fromDate,
            toDate: rangeObservations.toDate,
            segment: rangeObservations.segment,
            ...observationRangeSql(rangeObservations.value),
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
  await replaceObservationSeries(tx, indicatorId, uploadBatchId ?? undefined, publishedFrom);
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

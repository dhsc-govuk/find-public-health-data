import { type Database, schema } from '@fphd/db';
import {
  ENGLAND_AREA_CODE,
  ROLLING_PERIOD_THRESHOLD_DAYS,
  SEX_DIMENSION_NAME,
} from '@fphd/utils/observation-series';
import { and, count, desc, eq, not, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { Transaction } from './read-models.ts';

const {
  area,
  dimensionType,
  dimensionValue,
  observationSeries,
  observationSeriesBatch,
  observation,
} = schema;

type Executor = Database | Transaction;
type PeriodType = schema.ObservationSeriesVariant['periodType'];

/** The latest five non-null `column` values of a group, newest period first. */
function recentNonNull<T>(
  column: SQL | AnyPgColumn,
  points: { fromDate: SQL | AnyPgColumn; toDate: SQL | AnyPgColumn; value: SQL | AnyPgColumn },
) {
  return sql<T[]>`coalesce(
    (array_agg(${column} ORDER BY ${points.fromDate} DESC, ${points.toDate} DESC)
      FILTER (WHERE ${points.value} IS NOT NULL))[1:5],
    '{}'
  )`;
}

/** Orders segments with the fewest dimensions first, as the plainest series of a group. */
function fewestDimensions(dimensionKey: SQLWrapper) {
  return sql`cardinality(string_to_array(${dimensionKey}, ','))`;
}

/**
 * Inserts the series a table or ranking shows for each area, sex and period type of one
 * indicator's published data: the segment with the fewest dimensions, then the most points.
 */
async function insertSeries(
  tx: Executor,
  indicatorId: string,
  uploadBatchId: string,
): Promise<void> {
  const sexValues = tx.$with('sex_values').as(
    tx
      .select({
        id: sql<string>`${dimensionValue.id}::text`.as('id'),
        name: dimensionValue.name,
        sortOrder: dimensionValue.sortOrder,
      })
      .from(dimensionValue)
      .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId))
      .where(eq(dimensionType.name, SEX_DIMENSION_NAME)),
  );

  const source = tx.$with('source').as(
    tx
      .select({
        id: observation.id,
        areaId: observation.areaId,
        dimensionKey: observation.dimensionKey,
        fromDate: observation.fromDate,
        toDate: observation.toDate,
        value: observation.value,
      })
      .from(observation)
      .where(
        and(eq(observation.indicatorId, indicatorId), eq(observation.uploadBatchId, uploadBatchId)),
      ),
  );

  // A lateral projection reads each point once without materializing the entire batch for
  // two UNION ALL scans, which otherwise spills millions of observations to temporary files.
  const periods = sql`(VALUES ('all'), (CASE
    WHEN ${source.toDate} - ${source.fromDate} <= ${ROLLING_PERIOD_THRESHOLD_DAYS} THEN '1-year'
    ELSE '3-year'
  END)) AS periods(period_type)`;
  // Dimension keys contain UUIDs, so locale comparisons add cost without changing equality.
  const points = tx.$with('points').as(
    tx
      .select({
        id: source.id,
        areaId: source.areaId,
        dimensionKey: sql<string>`${source.dimensionKey} COLLATE "C"`.as('dimension_key'),
        fromDate: source.fromDate,
        toDate: source.toDate,
        value: source.value,
        periodType: sql<PeriodType>`periods.period_type`.as('period_type'),
      })
      .from(source)
      .crossJoinLateral(periods),
  );

  const segments = tx.$with('segments').as(
    tx
      .select({
        areaId: points.areaId,
        dimensionKey: points.dimensionKey,
        periodType: points.periodType,
        sex: sql<string>`coalesce(
          (SELECT ${sexValues.id} FROM ${sexValues}
           WHERE position(${sexValues.id} in ${points.dimensionKey}) > 0 LIMIT 1),
          ''
        )`.as('sex'),
        length: count().as('length'),
        firstPoint: sql<string>`min(${points.fromDate}::text || ':' || ${points.toDate}::text)`.as(
          'first_point',
        ),
        latestId: sql<string>`(array_agg(${points.id}
          ORDER BY ${points.fromDate} DESC, ${points.toDate} DESC))[1]`.as('latest_id'),
        rankingId: sql<string | null>`(array_agg(${points.id}
          ORDER BY ${points.toDate} DESC, ${points.fromDate} DESC)
          FILTER (WHERE ${points.value} IS NOT NULL))[1]`.as('ranking_id'),
        recentIds: recentNonNull<string>(points.id, points).as('recent_ids'),
        sparklineIds: sql<
          string[]
        >`(array_agg(${points.id} ORDER BY ${points.fromDate} DESC, ${points.toDate} DESC))[1:8]`.as(
          'sparkline_ids',
        ),
        recentValues: recentNonNull<number>(points.value, points).as('recent_values'),
      })
      .from(points)
      .groupBy(points.areaId, points.dimensionKey, points.periodType),
  );

  const areas = tx.$with('areas').as(
    tx
      .select({
        areaId: segments.areaId,
        aggregate: sql<boolean>`bool_or(${segments.sex} = '')`.as('aggregate'),
        single: sql<boolean>`bool_or(${segments.periodType} = '1-year')`.as('single'),
        rolling: sql<boolean>`bool_or(${segments.periodType} = '3-year')`.as('rolling'),
      })
      .from(segments)
      .groupBy(segments.areaId),
  );

  // An area with aggregate data offers only that; otherwise one choice per sex and, where the
  // area has both, per period type.
  const sexChoice = (periodType: Exclude<PeriodType, 'all'>, periodOrder: number) =>
    tx
      .select({
        areaId: areas.areaId,
        sex: sexValues.name,
        periodType: sql<PeriodType>`CASE
          WHEN ${areas.single} AND ${areas.rolling} THEN ${periodType} ELSE 'all'
        END`,
        sexOrder: sexValues.sortOrder,
        periodOrder: sql<number>`${periodOrder}::integer`,
      })
      .from(segments)
      .innerJoin(areas, eq(areas.areaId, segments.areaId))
      .innerJoin(sexValues, eq(sexValues.id, segments.sex))
      .where(
        and(
          not(sql`${areas.aggregate}`),
          sql`${periodType === '1-year' ? areas.single : areas.rolling}`,
        ),
      );
  const choices = tx.$with('choices').as(
    tx
      .select({
        areaId: areas.areaId,
        sex: sql<string>`''`.as('sex'),
        periodType: sql<PeriodType>`'all'`.as('period_type'),
        sexOrder: sql<number>`0`.as('sex_order'),
        periodOrder: sql<number>`0`.as('period_order'),
      })
      .from(areas)
      .where(sql`${areas.aggregate}`)
      .union(sexChoice('1-year', 0))
      .union(sexChoice('3-year', 1)),
  );

  const variants = tx.$with('variants').as(
    tx
      .select({
        areaId: choices.areaId,
        variants: sql<schema.ObservationSeriesVariant[]>`jsonb_agg(
          jsonb_build_object('sex', ${choices.sex}, 'periodType', ${choices.periodType})
          ORDER BY ${choices.sexOrder}, ${choices.sex}, ${choices.periodOrder}
        )`.as('variants'),
      })
      .from(choices)
      .groupBy(choices.areaId),
  );

  // Each segment is a candidate for all sexes together and for its own sex.
  const candidateColumns = {
    areaId: segments.areaId,
    dimensionKey: segments.dimensionKey,
    periodType: segments.periodType,
    length: segments.length,
    firstPoint: segments.firstPoint,
    latestId: segments.latestId,
    rankingId: segments.rankingId,
    recentIds: segments.recentIds,
    sparklineIds: segments.sparklineIds,
    recentValues: segments.recentValues,
  };
  const candidates = tx.$with('candidates').as(
    tx
      .select({ ...candidateColumns, sex: sql<string>`''`.as('sex') })
      .from(segments)
      .unionAll(
        tx
          .select({ ...candidateColumns, sex: sexValues.name })
          .from(segments)
          .innerJoin(sexValues, eq(sexValues.id, segments.sex)),
      ),
  );

  const winners = tx
    .$with('winners')
    .as(
      tx
        .selectDistinctOn([candidates.areaId, candidates.sex, candidates.periodType])
        .from(candidates)
        .orderBy(
          candidates.areaId,
          candidates.sex,
          candidates.periodType,
          fewestDimensions(candidates.dimensionKey),
          desc(candidates.length),
          sql`${candidates.firstPoint} COLLATE "C"`,
          sql`${candidates.dimensionKey} COLLATE "C"`,
        ),
    );

  await tx
    .with(sexValues, source, points, segments, areas, choices, variants, candidates, winners)
    .insert(observationSeries)
    .select(
      tx
        .select({
          uploadBatchId: sql<string>`${uploadBatchId}::uuid`.as('upload_batch_id'),
          indicatorId: sql<string>`${indicatorId}::uuid`.as('indicator_id'),
          areaId: winners.areaId,
          dimensionKey: winners.dimensionKey,
          sex: winners.sex,
          periodType: winners.periodType,
          variants: variants.variants,
          latestObservationId: winners.latestId,
          rankingObservationId: winners.rankingId,
          recentObservationIds: winners.recentIds,
          sparklineObservationIds: winners.sparklineIds,
          recentValues: winners.recentValues,
        })
        .from(winners)
        .innerJoin(variants, eq(variants.areaId, winners.areaId)),
    );
}

/**
 * The recent values of England's plainest 'all periods' series, the trend a topic page shows
 * for the indicator, or null when England has no data.
 */
async function englandTrend(
  tx: Executor,
  indicatorId: string,
  uploadBatchId: string,
): Promise<number[] | null> {
  const [trend] = await tx
    .select({ values: recentNonNull<number>(observation.value, observation) })
    .from(observation)
    .innerJoin(area, eq(area.id, observation.areaId))
    .where(
      and(
        eq(observation.indicatorId, indicatorId),
        eq(observation.uploadBatchId, uploadBatchId),
        eq(area.code, ENGLAND_AREA_CODE),
      ),
    )
    .groupBy(observation.areaId, observation.dimensionKey)
    .orderBy(
      fewestDimensions(observation.dimensionKey),
      desc(count(observation.value)),
      observation.dimensionKey,
    )
    .limit(1);
  return trend?.values ?? null;
}

export async function replaceObservationSeries(
  tx: Executor,
  indicatorId: string,
  uploadBatchId: string | undefined,
): Promise<void> {
  await tx.delete(observationSeries).where(eq(observationSeries.indicatorId, indicatorId));
  await tx
    .delete(observationSeriesBatch)
    .where(eq(observationSeriesBatch.indicatorId, indicatorId));
  if (!uploadBatchId) return;

  await insertSeries(tx, indicatorId, uploadBatchId);
  await tx.insert(observationSeriesBatch).values({
    uploadBatchId,
    indicatorId,
    trendValues: await englandTrend(tx, indicatorId, uploadBatchId),
  });
}

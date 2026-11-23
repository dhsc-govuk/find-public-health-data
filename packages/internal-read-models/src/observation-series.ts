import {
  type Database,
  headlineSeriesOrder,
  observationPeriodSql,
  periodLengthSql,
  schema,
} from '@fphd/db';
import {
  ENGLAND_AREA_CODE,
  OBSERVATION_SERIES_VERSION,
  SEX_DIMENSION_NAME,
} from '@fphd/utils/observation-series';
import { and, count, countDistinct, eq, not, or, type SQL, sql } from 'drizzle-orm';
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

  const periods = sql`(VALUES (
    ${observationPeriodSql(source.fromDate, source.toDate)}
  )) AS periods(period_type)`;
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
        length: count(points.value).as('length'),
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
        periodCount: countDistinct(segments.periodType).as('period_count'),
        sexIds: sql<string[]>`array_remove(array_agg(distinct ${segments.sex}), '')`.as(
          'area_sex_ids',
        ),
      })
      .from(segments)
      .groupBy(segments.areaId),
  );

  const sexChoices = tx
    .select({
      areaId: areas.areaId,
      sex: sexValues.name,
      periodType: sql<PeriodType>`CASE
        WHEN ${areas.periodCount} > 1 THEN ${segments.periodType} ELSE 'all'
      END`,
      sexOrder: sexValues.sortOrder,
      periodOrder: periodLengthSql(segments.periodType),
    })
    .from(segments)
    .innerJoin(areas, eq(areas.areaId, segments.areaId))
    .innerJoin(sexValues, eq(sexValues.id, segments.sex))
    .where(not(sql`${areas.aggregate}`));
  const choices = tx.$with('choices').as(
    tx
      .select({
        areaId: areas.areaId,
        sex: sql<string>`''`.as('choice_sex'),
        periodType: sql<PeriodType>`'all'`.as('choice_period_type'),
        sexOrder: sql<number>`0`.as('sex_order'),
        periodOrder: sql<number>`0`.as('period_order'),
      })
      .from(areas)
      .where(sql`${areas.aggregate}`)
      .union(sexChoices),
  );
  const seriesChoices = tx.$with('series_choices').as(
    tx
      .select({ areaId: choices.areaId, sex: choices.sex, periodType: choices.periodType })
      .from(choices)
      .union(
        tx
          .select({
            areaId: areas.areaId,
            sex: sql<string>`''`,
            periodType: sql<PeriodType>`'all'`,
          })
          .from(areas),
      )
      .union(
        tx
          .select({
            areaId: segments.areaId,
            sex: sexValues.name,
            periodType: sql<PeriodType>`'all'`,
          })
          .from(segments)
          .innerJoin(sexValues, eq(sexValues.id, segments.sex)),
      ),
  );

  // An all-period choice elects one complete series, so different lengths never share a history.
  const candidateColumns = {
    areaId: segments.areaId,
    dimensionKey: segments.dimensionKey,
    periodType: segments.periodType,
    length: segments.length,
    firstPoint: segments.firstPoint,
    periodLength: periodLengthSql(segments.periodType).as('period_length'),
    latestId: segments.latestId,
    rankingId: segments.rankingId,
    recentIds: segments.recentIds,
    sparklineIds: segments.sparklineIds,
    recentValues: segments.recentValues,
  };
  const candidates = tx.$with('candidates').as(
    tx
      .select({
        ...candidateColumns,
        sex: sql<string>`${seriesChoices.sex}`.as('sex'),
        periodType: sql<PeriodType>`${seriesChoices.periodType}`.as('period_type'),
      })
      .from(segments)
      .innerJoin(
        seriesChoices,
        and(
          eq(seriesChoices.areaId, segments.areaId),
          or(
            eq(seriesChoices.periodType, 'all'),
            eq(seriesChoices.periodType, segments.periodType),
          ),
          or(
            eq(seriesChoices.sex, ''),
            sql`${seriesChoices.sex} = (
          select ${sexValues.name} from ${sexValues} where ${sexValues.id} = ${segments.sex}
        )`,
          ),
        ),
      ),
  );

  const winners = tx.$with('winners').as(
    tx
      .selectDistinctOn([candidates.areaId, candidates.sex, candidates.periodType])
      .from(candidates)
      .orderBy(
        candidates.areaId,
        candidates.sex,
        candidates.periodType,
        ...headlineSeriesOrder(
          {
            dimensionKey: candidates.dimensionKey,
            valueCount: candidates.length,
            periodLength: candidates.periodLength,
            firstPoint: candidates.firstPoint,
          },
          { dimensionValue, dimensionType },
        ),
      ),
  );

  const headlines = tx.$with('headlines').as(
    tx
      .selectDistinctOn([winners.areaId])
      .from(winners)
      .where(sql`exists (select 1 from ${choices}
        where ${choices.areaId} = ${winners.areaId} and ${choices.sex} = ${winners.sex}
          and ${choices.periodType} = ${winners.periodType})`)
      .orderBy(
        winners.areaId,
        ...headlineSeriesOrder(
          {
            dimensionKey: winners.dimensionKey,
            valueCount: winners.length,
            periodLength: winners.periodLength,
            firstPoint: winners.firstPoint,
          },
          { dimensionValue, dimensionType },
        ),
      ),
  );
  const variants = tx.$with('variants').as(
    tx
      .select({
        areaId: choices.areaId,
        variants: sql<schema.ObservationSeriesVariant[]>`jsonb_agg(
        jsonb_build_object('sex', ${choices.sex}, 'periodType', ${choices.periodType},
          'sexes', coalesce((select jsonb_agg(${sexValues.name} order by ${sexValues.sortOrder}, ${sexValues.name})
            from ${sexValues} where ${sexValues.id} = any(${areas.sexIds})), '[]'::jsonb)) ||
        case when ${headlines.areaId} is not null then '{"headline":true}'::jsonb else '{}'::jsonb end
        order by ${choices.sexOrder}, ${choices.sex}, ${choices.periodOrder}
      )`.as('variants'),
      })
      .from(choices)
      .innerJoin(areas, eq(areas.areaId, choices.areaId))
      .leftJoin(
        headlines,
        and(
          eq(headlines.areaId, choices.areaId),
          eq(headlines.sex, choices.sex),
          eq(headlines.periodType, choices.periodType),
        ),
      )
      .groupBy(choices.areaId),
  );

  await tx
    .with(
      sexValues,
      source,
      points,
      segments,
      areas,
      choices,
      seriesChoices,
      candidates,
      winners,
      headlines,
      variants,
    )
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
    .groupBy(
      observation.areaId,
      observation.dimensionKey,
      observationPeriodSql(observation.fromDate, observation.toDate),
    )
    .orderBy(
      ...headlineSeriesOrder(
        {
          dimensionKey: observation.dimensionKey,
          valueCount: count(observation.value),
          periodLength: periodLengthSql(
            observationPeriodSql(observation.fromDate, observation.toDate),
          ),
          firstPoint: sql`min(${observation.fromDate}::text || ':' || ${observation.toDate}::text)`,
        },
        { dimensionValue, dimensionType },
      ),
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
    version: OBSERVATION_SERIES_VERSION,
  });
}

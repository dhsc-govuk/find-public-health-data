import {
  ENGLAND_AREA_CODE,
  OBSERVATION_SERIES_VERSION,
  observationSegmentKey,
  pairedAreaSexValues,
  pairedAreaValues,
  rankingAreaSeries,
  type ScatterArea,
  tableAreaSeries,
} from '@fphd/utils/observation-series';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  max,
  min,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, union } from 'drizzle-orm/pg-core';
import type { DatabaseReader } from './client.ts';
import { dimensionKeyOrder, dimensionKeyRank, headlineOrder } from './headline-order.ts';
import { getIndicatorObservationData } from './indicator-observation-repository.ts';
import { getIndicatorSeriesData } from './indicator-series-repository.ts';
import { observationPeriodSql, periodLengthSql } from './observation-series-sql.ts';
import type { ViewSet } from './schema/index.ts';

export async function getCachedScatterAreas(
  db: DatabaseReader,
  views: ViewSet,
  indicatorIds: [string, string],
  codes: string[],
): Promise<Map<string, ScatterArea[]> | undefined> {
  return (await getCachedScatterVariants(db, views, indicatorIds, codes, [''], []))?.get('');
}

async function getCachedScatterVariants(
  db: DatabaseReader,
  views: ViewSet,
  indicatorIds: [string, string],
  codes: string[],
  sexes: string[],
  sexedIndicatorIds: string[],
): Promise<Map<string, Map<string, ScatterArea[]>> | undefined> {
  const {
    area,
    observationSeriesBatch: batches,
    dimensionType,
    dimensionValue,
    observation,
    observationSeries: series,
  } = views;
  if (!codes.length) return new Map(sexes.map((sex) => [sex, new Map()]));
  const variants = db
    .$with('scatter_variants')
    .as(
      db
        .select({ sex: sql<string>`scatter_sex.sex`.as('sex') })
        .from(sql`unnest(${sql.param(sexes)}::text[]) as scatter_sex(sex)`),
    );
  const areas = db.$with('scatter_areas').as(
    db
      .select({
        id: area.id,
        code: area.code,
        name: area.name,
        position: sql<number>`array_position(${sql.param(codes)}::text[], ${area.code})`.as(
          'position',
        ),
      })
      .from(area)
      .where(inArray(area.code, codes)),
  );
  const selected = db.$with('scatter_series').as(
    db
      .select({
        indicatorId: series.indicatorId,
        areaId: series.areaId,
        dimensionKey: series.dimensionKey,
        sex: sql<string>`${series.sex}`.as('series_sex'),
        periodType: sql<string>`${series.periodType}`.as('series_period_type'),
        headline: sql<boolean>`${series.variants} @> jsonb_build_array(jsonb_build_object(
          'sex', ${series.sex}, 'periodType', ${series.periodType}, 'headline', true))`.as(
          'is_headline',
        ),
        latestId: series.latestObservationId,
        recentIds: series.recentObservationIds,
      })
      .from(series)
      .innerJoin(areas, eq(areas.id, series.areaId))
      .where(inArray(series.indicatorId, indicatorIds)),
  );
  const ids = db.$with('scatter_ids').as(
    db
      .selectDistinct({
        id: sql<string>`unnest(array_append(${selected.recentIds}, ${selected.latestId}))`.as(
          'scatter_id',
        ),
      })
      .from(selected),
  );
  const source = alias(observation, 'scatter_source');
  const periods = db.$with('scatter_periods').as(
    db
      .selectDistinct({
        indicatorId: source.indicatorId,
        dimensionKey: source.dimensionKey,
        fromDate: source.fromDate,
        toDate: source.toDate,
      })
      .from(selected)
      .innerJoin(source, eq(source.id, selected.latestId)),
  );
  // A scalar England lookup lets PostgreSQL use the area/period index before matching segments.
  const wanted = db.$with('scatter_wanted').as(
    union(
      db.select({ id: ids.id }).from(ids),
      db
        .select({ id: observation.id })
        .from(periods)
        .innerJoin(
          observation,
          and(
            eq(observation.indicatorId, periods.indicatorId),
            eq(
              observation.areaId,
              db
                .select({ id: areas.id })
                .from(areas)
                .where(eq(areas.code, ENGLAND_AREA_CODE))
                .limit(1),
            ),
            eq(observation.dimensionKey, periods.dimensionKey),
            eq(observation.fromDate, periods.fromDate),
            eq(observation.toDate, periods.toDate),
          ),
        ),
    ),
  );
  // ARRAY keeps the bounded ID set as a primary-key lookup rather than a join over all observations.
  const candidates = db.$with('scatter_candidates').as(
    db
      .select({
        id: observation.id,
        indicatorId: observation.indicatorId,
        areaId: observation.areaId,
        fromDate: observation.fromDate,
        toDate: observation.toDate,
        value: observation.value,
        dimensionKey: observation.dimensionKey,
      })
      .from(observation)
      .where(sql`${observation.id} = any(array(${db.select({ id: wanted.id }).from(wanted)}))`),
  );
  const keys = db
    .$with('scatter_keys')
    .as(db.selectDistinct({ dimensionKey: candidates.dimensionKey }).from(candidates));
  const dimensions = db.$with('scatter_dimensions').as(
    db
      .select({
        dimensionKey: keys.dimensionKey,
        sex: sql<
          string | null
        >`max(case when ${dimensionType.name} = 'Sex' then ${dimensionValue.name} end)`.as(
          'dimension_sex',
        ),
        data: sql<ScatterArea['observations'][number]['dimensions']>`jsonb_agg(jsonb_build_object(
        'type', ${dimensionType.name}, 'value', ${dimensionValue.name}) order by ${dimensionType.name})`.as(
          'data',
        ),
      })
      .from(keys)
      .innerJoin(
        dimensionValue,
        sql`${dimensionValue.id} = any(string_to_array(${keys.dimensionKey}, ',')::uuid[])`,
      )
      .innerJoin(dimensionType, eq(dimensionType.id, dimensionValue.dimensionTypeId))
      .groupBy(keys.dimensionKey),
  );
  const points = db.$with('scatter_points').as(
    db
      .select({
        id: candidates.id,
        indicatorId: candidates.indicatorId,
        areaId: candidates.areaId,
        fromDate: candidates.fromDate,
        toDate: candidates.toDate,
        value: candidates.value,
        dimensionKey: candidates.dimensionKey,
        periodType: observationPeriodSql(candidates.fromDate, candidates.toDate).as('period_type'),
        sex: variants.sex,
      })
      .from(candidates)
      .crossJoin(variants)
      .leftJoin(dimensions, eq(dimensions.dimensionKey, candidates.dimensionKey))
      .where(
        or(
          eq(variants.sex, ''),
          notInArray(candidates.indicatorId, sexedIndicatorIds),
          eq(dimensions.sex, variants.sex),
        ),
      ),
  );
  const firstAreas = db.$with('scatter_first_areas').as(
    db
      .selectDistinctOn([points.indicatorId, points.sex], {
        indicatorId: points.indicatorId,
        sex: sql<string>`${points.sex}`.as('first_sex'),
        areaId: points.areaId,
      })
      .from(points)
      .innerJoin(areas, eq(areas.id, points.areaId))
      .where(isNotNull(points.value))
      .orderBy(points.indicatorId, points.sex, areas.position),
  );
  const segments = db.$with('scatter_segments').as(
    db
      .select({
        indicatorId: points.indicatorId,
        sex: sql<string>`${points.sex}`.as('segment_sex'),
        dimensionKey: points.dimensionKey,
        periodType: points.periodType,
        length: count().as('segment_length'),
        latestPeriod: max(points.toDate).as('segment_latest_period'),
        firstPoint: min(sql<string>`${points.fromDate}::text || ':' || ${points.toDate}::text`).as(
          'first_point',
        ),
      })
      .from(points)
      .innerJoin(
        selected,
        and(
          eq(selected.indicatorId, points.indicatorId),
          eq(selected.areaId, points.areaId),
          eq(selected.dimensionKey, points.dimensionKey),
          or(
            and(
              or(eq(points.sex, ''), notInArray(points.indicatorId, sexedIndicatorIds)),
              sql`${selected.headline}`,
            ),
            and(eq(selected.sex, points.sex), eq(selected.periodType, 'all')),
          ),
        ),
      )
      .leftJoin(dimensions, eq(dimensions.dimensionKey, points.dimensionKey))
      .innerJoin(
        firstAreas,
        and(
          eq(firstAreas.indicatorId, points.indicatorId),
          eq(firstAreas.sex, points.sex),
          eq(firstAreas.areaId, points.areaId),
        ),
      )
      .groupBy(points.indicatorId, points.sex, points.dimensionKey, points.periodType),
  );
  const references = db.$with('scatter_references').as(
    db
      .selectDistinctOn([segments.indicatorId, segments.sex], {
        indicatorId: segments.indicatorId,
        sex: sql<string>`${segments.sex}`.as('reference_sex'),
        dimensionKey: segments.dimensionKey,
        length: sql<number>`${segments.length}`.as('reference_length'),
        firstPoint: sql<string>`${segments.firstPoint}`.as('reference_first_point'),
      })
      .from(segments)
      .orderBy(
        segments.indicatorId,
        segments.sex,
        ...headlineOrder({
          ...dimensionKeyRank(segments.dimensionKey, views),
          latestPeriod: segments.latestPeriod,
          length: segments.length,
          periodLength: periodLengthSql(segments.periodType),
          firstPoint: segments.firstPoint,
        }),
        dimensionKeyOrder(segments.dimensionKey, views),
      ),
  );
  const chosen = db.$with('scatter_chosen').as(
    db
      .selectDistinctOn([points.indicatorId, points.sex, points.areaId], {
        id: points.id,
        indicatorId: points.indicatorId,
        sex: sql<string>`${points.sex}`.as('chosen_sex'),
        areaId: points.areaId,
        fromDate: points.fromDate,
        toDate: points.toDate,
        dimensionKey: points.dimensionKey,
        value: points.value,
      })
      .from(points)
      .innerJoin(
        references,
        and(
          eq(references.indicatorId, points.indicatorId),
          eq(references.sex, points.sex),
          eq(references.dimensionKey, points.dimensionKey),
        ),
      )
      .where(isNotNull(points.value))
      .orderBy(
        points.indicatorId,
        points.sex,
        points.areaId,
        desc(points.toDate),
        desc(points.fromDate),
      ),
  );
  const loaded = await db
    .with(
      areas,
      selected,
      ids,
      periods,
      wanted,
      candidates,
      keys,
      dimensions,
      variants,
      points,
      firstAreas,
      segments,
      references,
      chosen,
    )
    .select({
      indicatorId: batches.indicatorId,
      sex: variants.sex,
      areaId: areas.id,
      areaCode: areas.code,
      areaName: areas.name,
      complete: eq(
        db.select({ value: count() }).from(wanted),
        db.select({ value: count() }).from(candidates),
      ) as SQL<boolean>,
      pointId: chosen.id,
      fromDate: chosen.fromDate,
      toDate: chosen.toDate,
      value: chosen.value,
      dimensions: dimensions.data,
    })
    .from(batches)
    .crossJoin(areas)
    .crossJoin(variants)
    .leftJoin(
      chosen,
      and(
        eq(chosen.indicatorId, batches.indicatorId),
        eq(chosen.sex, variants.sex),
        eq(chosen.areaId, areas.id),
      ),
    )
    .leftJoin(dimensions, eq(dimensions.dimensionKey, chosen.dimensionKey))
    .where(
      and(
        inArray(batches.indicatorId, indicatorIds),
        eq(batches.version, OBSERVATION_SERIES_VERSION),
      ),
    );
  // Historical area codes and incomplete rebuilds need canonical series election.
  const identities = new Map<string, Set<string>>();
  for (const row of loaded) {
    const ids = identities.get(row.areaCode) ?? new Set<string>();
    ids.add(row.areaId);
    identities.set(row.areaCode, ids);
  }
  if (
    new Set(loaded.map((row) => row.indicatorId)).size !== indicatorIds.length ||
    loaded.some((row) => !row.complete) ||
    [...identities.values()].some((ids) => ids.size > 1)
  )
    return undefined;
  const areasFor = (id: string, sex: string) =>
    codes.flatMap((code) => {
      const rows = loaded.filter(
        (row) => row.indicatorId === id && row.sex === sex && row.areaCode === code,
      );
      const first = rows[0];
      if (!first) return [];
      const observations = rows
        .flatMap((row) =>
          row.pointId && row.fromDate && row.toDate
            ? [
                {
                  fromDate: row.fromDate,
                  toDate: row.toDate,
                  value: row.value,
                  dimensions: row.dimensions ?? [],
                },
              ]
            : [],
        )
        .sort(
          (a, b) =>
            a.fromDate.localeCompare(b.fromDate) ||
            a.toDate.localeCompare(b.toDate) ||
            observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
        );
      return [{ areaCode: code, areaName: first.areaName, observations }];
    });
  return new Map(
    sexes.map((sex) => [sex, new Map(indicatorIds.map((id) => [id, areasFor(id, sex)]))]),
  );
}

export async function getIndicatorScatterData(
  db: DatabaseReader,
  views: ViewSet,
  indicatorIds: [string, string],
  codes: string[],
) {
  const cached = await getCachedScatterAreas(db, views, indicatorIds, codes);
  const data =
    cached ??
    new Map(
      [...(await getIndicatorObservationData(db, views, indicatorIds, codes))].map(
        ([id, entry]) => [
          id,
          entry.areaData.map((area) => ({
            ...area,
            observations: [...area.observations].sort(
              (a, b) =>
                a.fromDate.localeCompare(b.fromDate) ||
                a.toDate.localeCompare(b.toDate) ||
                observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
            ),
          })),
        ],
      ),
    );
  return pairedAreaValues(data.get(indicatorIds[0]) ?? [], data.get(indicatorIds[1]) ?? []);
}

export async function getPublishedIndicatorScatterData(
  db: DatabaseReader,
  views: ViewSet,
  shortIds: [number, number],
  codes: string[],
) {
  const { indicator: publishedIndicator } = views;
  const identities = await db
    .select({ id: publishedIndicator.id, shortId: publishedIndicator.shortId })
    .from(publishedIndicator)
    .where(inArray(publishedIndicator.shortId, shortIds));
  const ids = shortIds.map((shortId) => identities.find((row) => row.shortId === shortId)?.id);
  const [first, second] = ids;
  if (!first || !second || first === second) return undefined;
  const indicatorIds: [string, string] = [first, second];
  const ranking = await getIndicatorSeriesData(db, views, indicatorIds, codes, 'ranking');
  if (ranking) {
    const sexesByIndicator = indicatorIds.map((id) => ranking.get(id)?.sexes ?? []);
    const sexes = (sexesByIndicator.find((values) => values.length) ?? [])
      .filter((sex) => sexesByIndicator.every((values) => !values.length || values.includes(sex)))
      .sort((a, b) => (a === 'Female' ? -1 : b === 'Female' ? 1 : a.localeCompare(b)));
    const sexedIndicatorIds = indicatorIds.filter((_, index) => sexesByIndicator[index]?.length);
    const cached = await getCachedScatterVariants(
      db,
      views,
      indicatorIds,
      codes,
      ['', ...sexes],
      sexedIndicatorIds,
    );
    if (cached) {
      const pair = (sex: string) => {
        const data = cached.get(sex);
        const areas = (id: string) =>
          (data?.get(id) ?? []).map((area) => ({
            ...area,
            observations: area.observations.map((point) => ({
              ...point,
              dimensions: sex
                ? point.dimensions.filter(({ type }) => type !== 'Sex')
                : point.dimensions,
            })),
          }));
        return pairedAreaValues(areas(first), areas(second));
      };
      return {
        points: pair(''),
        variants: sexes.map((sex) => ({
          sex,
          axisSexes: sexesByIndicator.map((values) => (values.length ? sex : '')),
          points: pair(sex),
        })),
        rankings: indicatorIds.map((id) => ranking.get(id)?.areaData ?? []),
      };
    }
  }
  const data = await getIndicatorObservationData(db, views, indicatorIds, codes);
  const areas = indicatorIds.map((id) => data.get(id)?.areaData ?? []);
  const [x, y] = areas.map((areaData) => tableAreaSeries(areaData));
  return {
    ...pairedAreaSexValues(x ?? [], y ?? []),
    rankings: areas.map(rankingAreaSeries),
  };
}

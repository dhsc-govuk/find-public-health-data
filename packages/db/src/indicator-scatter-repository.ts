import {
  ENGLAND_AREA_CODE,
  observationSegmentKey,
  pairedAreaValues,
  type ScatterArea,
} from '@fphd/utils/observation-series';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  min,
  ne,
  notExists,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, union } from 'drizzle-orm/pg-core';
import type { Database } from './client.ts';
import { getIndicatorObservationData } from './indicator-observation-repository.ts';
import {
  publishedArea as area,
  publishedObservationSeriesBatch as batches,
  publishedDimensionType as dimensionType,
  publishedDimensionValue as dimensionValue,
  publishedObservation as observation,
  publishedIndicator,
  publishedObservationSeries as series,
} from './schema/index.ts';

export async function getCachedScatterAreas(
  db: Database,
  indicatorIds: [string, string],
  codes: string[],
): Promise<Map<string, ScatterArea[]> | undefined> {
  if (!codes.length) return new Map();
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
  const points = db.$with('scatter_points').as(
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
    .as(db.selectDistinct({ dimensionKey: points.dimensionKey }).from(points));
  const dimensions = db.$with('scatter_dimensions').as(
    db
      .select({
        dimensionKey: keys.dimensionKey,
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
  const firstAreas = db.$with('scatter_first_areas').as(
    db
      .selectDistinctOn([points.indicatorId], {
        indicatorId: points.indicatorId,
        areaId: points.areaId,
      })
      .from(points)
      .innerJoin(areas, eq(areas.id, points.areaId))
      .where(isNotNull(points.value))
      .orderBy(points.indicatorId, areas.position),
  );
  const segments = db.$with('scatter_segments').as(
    db
      .select({
        indicatorId: points.indicatorId,
        dimensionKey: points.dimensionKey,
        dimensions: sql<number>`cardinality(string_to_array(${points.dimensionKey}, ','))`.as(
          'dimension_count',
        ),
        length: count().as('segment_length'),
        firstPoint: min(sql<string>`${points.fromDate}::text || ':' || ${points.toDate}::text`).as(
          'first_point',
        ),
      })
      .from(points)
      .innerJoin(
        firstAreas,
        and(eq(firstAreas.indicatorId, points.indicatorId), eq(firstAreas.areaId, points.areaId)),
      )
      .groupBy(points.indicatorId, points.dimensionKey),
  );
  const references = db.$with('scatter_references').as(
    db
      .selectDistinctOn([segments.indicatorId], {
        indicatorId: segments.indicatorId,
        dimensionKey: segments.dimensionKey,
        dimensions: sql<number>`${segments.dimensions}`.as('reference_dimension_count'),
        length: sql<number>`${segments.length}`.as('reference_length'),
        firstPoint: sql<string>`${segments.firstPoint}`.as('reference_first_point'),
      })
      .from(segments)
      .orderBy(
        segments.indicatorId,
        segments.dimensions,
        desc(segments.length),
        segments.firstPoint,
        segments.dimensionKey,
      ),
  );
  const aligned = () =>
    db
      .select({
        id: points.id,
        indicatorId: points.indicatorId,
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
          eq(references.dimensionKey, points.dimensionKey),
        ),
      );
  const pairs = db.$with('scatter_pairs').as(
    db
      .select({
        areaId: points.areaId,
        fromDate: points.fromDate,
        toDate: points.toDate,
      })
      .from(points)
      .innerJoin(
        references,
        and(
          eq(references.indicatorId, points.indicatorId),
          eq(references.dimensionKey, points.dimensionKey),
        ),
      )
      .where(isNotNull(points.value))
      .groupBy(points.areaId, points.fromDate, points.toDate, points.dimensionKey)
      .having(eq(countDistinct(points.indicatorId), 2)),
  );
  const latest = db.$with('scatter_latest').as(
    db
      .select({ fromDate: pairs.fromDate, toDate: pairs.toDate })
      .from(pairs)
      .innerJoin(areas, eq(areas.id, pairs.areaId))
      .orderBy(asc(eq(areas.code, ENGLAND_AREA_CODE)), desc(pairs.toDate), desc(pairs.fromDate))
      .limit(1),
  );
  const chosen = db
    .$with('scatter_chosen')
    .as(
      aligned().innerJoin(
        latest,
        and(eq(latest.fromDate, points.fromDate), eq(latest.toDate, points.toDate)),
      ),
    );
  // Tied headline segments need the canonical label ordering rather than UUID ordering.
  const ambiguous = db
    .select({ id: segments.indicatorId })
    .from(segments)
    .innerJoin(
      references,
      and(
        eq(references.indicatorId, segments.indicatorId),
        eq(references.dimensions, segments.dimensions),
        eq(references.length, segments.length),
        eq(references.firstPoint, segments.firstPoint),
        ne(references.dimensionKey, segments.dimensionKey),
      ),
    );
  const loaded = await db
    .with(
      areas,
      selected,
      ids,
      periods,
      wanted,
      points,
      keys,
      dimensions,
      firstAreas,
      segments,
      references,
      pairs,
      latest,
      chosen,
    )
    .select({
      indicatorId: batches.indicatorId,
      areaId: areas.id,
      areaCode: areas.code,
      areaName: areas.name,
      complete: and(
        eq(db.select({ value: count() }).from(wanted), db.select({ value: count() }).from(points)),
        notExists(ambiguous),
      ) as SQL<boolean>,
      pointId: chosen.id,
      fromDate: chosen.fromDate,
      toDate: chosen.toDate,
      value: chosen.value,
      dimensions: dimensions.data,
    })
    .from(batches)
    .crossJoin(areas)
    .leftJoin(chosen, and(eq(chosen.indicatorId, batches.indicatorId), eq(chosen.areaId, areas.id)))
    .leftJoin(dimensions, eq(dimensions.dimensionKey, chosen.dimensionKey))
    .where(inArray(batches.indicatorId, indicatorIds));
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
  return new Map(
    indicatorIds.map((id) => [
      id,
      codes.flatMap((code) => {
        const rows = loaded.filter((row) => row.indicatorId === id && row.areaCode === code);
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
      }),
    ]),
  );
}

export async function getIndicatorScatterData(
  db: Database,
  indicatorIds: [string, string],
  codes: string[],
) {
  const cached = await getCachedScatterAreas(db, indicatorIds, codes);
  const data =
    cached ??
    new Map(
      [...(await getIndicatorObservationData(db, indicatorIds, codes, 'table'))].map(
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
  db: Database,
  shortIds: [number, number],
  codes: string[],
) {
  const identities = await db
    .select({ id: publishedIndicator.id, shortId: publishedIndicator.shortId })
    .from(publishedIndicator)
    .where(inArray(publishedIndicator.shortId, shortIds));
  const ids = shortIds.map((shortId) => identities.find((row) => row.shortId === shortId)?.id);
  const [first, second] = ids;
  if (!first || !second || first === second) return undefined;
  return getIndicatorScatterData(db, [first, second], codes);
}

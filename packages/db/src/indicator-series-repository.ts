import {
  ENGLAND_AREA_CODE,
  observationSegmentKey,
  type TableSeriesSelection,
} from '@fphd/utils/observation-series';
import { recentTrendDirection } from '@fphd/utils/recent-trend';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import type {
  IndicatorAreaData,
  IndicatorObservation,
} from './indicator-observation-repository.ts';
import {
  publishedArea as area,
  publishedObservationSeriesBatch as batches,
  publishedDimensionType as dimensionType,
  publishedDimensionValue as dimensionValue,
  publishedNoteType as noteType,
  publishedObservation as observation,
  publishedObservationNote as observationNote,
  publishedObservationSeries as series,
} from './schema/index.ts';

type Result = Map<string, { areaData: IndicatorAreaData[]; tableSeries?: TableSeriesSelection[] }>;

async function readPoints(db: Database, ids: string[], benchmarkIds: string[], englandId?: string) {
  if (!ids.length && !benchmarkIds.length) return [];
  return db.execute<{
    id: string;
    indicatorId: string;
    areaId: string;
    point: IndicatorObservation;
  }>(sql`
    with benchmarks as (
      select benchmark.id from ${observation} source
      join ${observation} benchmark on benchmark.indicator_id = source.indicator_id
        and benchmark.area_id = ${englandId ?? null}::uuid
        and benchmark.dimension_key = source.dimension_key
        and benchmark.from_date = source.from_date and benchmark.to_date = source.to_date
      where source.id = any(${`{${benchmarkIds.join(',')}}`}::uuid[])
    ), wanted as (select unnest(${`{${ids.join(',')}}`}::uuid[]) as id union select id from benchmarks)
    , points as materialized (
      select o.* from ${observation} o where o.id = any(array(select id from wanted))
    ), dimensions as materialized (
      select k.dimension_key, coalesce(jsonb_agg(jsonb_build_object(
        'type', dt.name, 'value', dv.name, 'dimensionClass', dt.dimension_class,
        'sortOrder', dv.sort_order) order by dt.name) filter (where dv.id is not null), '[]'::jsonb) as data
      from (select distinct dimension_key from points) k
      left join lateral unnest(string_to_array(k.dimension_key, ',')::uuid[]) key(id) on true
      left join ${dimensionValue} dv on dv.id = key.id
      left join ${dimensionType} dt on dt.id = dv.dimension_type_id
      group by k.dimension_key
    ), notes as materialized (
      select n.observation_id, jsonb_agg(jsonb_build_object('text', nt.text,
        'category', nt.category) order by nt.id) as data
      from ${observationNote} n join ${noteType} nt on nt.id = n.note_type_id
      where n.observation_id = any(array(select id from wanted))
      group by n.observation_id
    )
    select o.id, o.indicator_id as "indicatorId", o.area_id as "areaId", jsonb_build_object(
      'fromDate', o.from_date, 'toDate', o.to_date, 'value', o.value,
      'count', o.count, 'numerator', o.numerator, 'denominator', o.denominator,
      'lowerCi95', o.lower_ci_95, 'upperCi95', o.upper_ci_95,
      'lowerCi998', o.lower_ci_998, 'upperCi998', o.upper_ci_998,
      'dimensions', d.data, 'notes', coalesce(n.data, '[]'::jsonb)
    ) as point from points o join dimensions d on d.dimension_key = o.dimension_key
    left join notes n on n.observation_id = o.id
  `);
}

export async function getIndicatorSeriesData(
  db: Database,
  indicatorIds: string[],
  codes: string[],
  mode: 'ranking' | 'recent' | 'latest' | 'sparkline',
): Promise<Result | undefined> {
  if (!indicatorIds.length || !codes.length) return new Map();
  const areas = await db
    .select({ id: area.id, code: area.code, name: area.name })
    .from(area)
    .where(inArray(area.code, codes));
  if (new Set(areas.map(({ code }) => code)).size !== areas.length) return undefined;
  const loaded = await db
    .select({
      indicatorId: batches.indicatorId,
      series: {
        indicatorId: series.indicatorId,
        areaId: series.areaId,
        dimensionKey: series.dimensionKey,
        sex: series.sex,
        periodType: series.periodType,
        variants: series.variants,
        latestObservationId: series.latestObservationId,
        rankingObservationId: series.rankingObservationId,
        recentObservationIds: series.recentObservationIds,
        sparklineObservationIds:
          mode === 'sparkline' ? series.sparklineObservationIds : sql<string[] | null>`null`,
        recentValues: series.recentValues,
      },
    })
    .from(batches)
    .leftJoin(
      series,
      and(
        eq(series.indicatorId, batches.indicatorId),
        inArray(
          series.areaId,
          areas.map(({ id }) => id),
        ),
      ),
    )
    .where(inArray(batches.indicatorId, indicatorIds));
  // The batch marker distinguishes missing data from a read model awaiting its rebuild.
  if (new Set(loaded.map(({ indicatorId }) => indicatorId)).size !== indicatorIds.length)
    return undefined;
  const rows = loaded.flatMap((row) => (row.series ? [row.series] : []));
  if (mode === 'sparkline' && rows.some((row) => row.sparklineObservationIds === null))
    return undefined;
  const ordered = codes.flatMap((code) => {
    const match = areas.find((entry) => entry.code === code);
    return match ? [match] : [];
  });
  const rankingRows = new Map(
    indicatorIds.map((indicatorId) => {
      const selected = rows.filter((row) => row.indicatorId === indicatorId);
      const forArea = (id: string) => selected.filter((row) => row.areaId === id);
      const first = ordered.find((a) => forArea(a.id).length);
      const locals = ordered.filter((a) => a.code !== ENGLAND_AREA_CODE);
      const compared = locals.length ? locals : ordered;
      const variant = (first ? forArea(first.id)[0]?.variants : [])?.find((variant) =>
        compared.some((a) =>
          forArea(a.id).some(
            (row) => row.sex === variant.sex && row.periodType === variant.periodType,
          ),
        ),
      );
      return [
        indicatorId,
        compared.flatMap((a) =>
          forArea(a.id).filter(
            (row) => row.sex === variant?.sex && row.periodType === variant?.periodType,
          ),
        ),
      ] as const;
    }),
  );
  const wanted = new Set<string>();
  if (mode === 'ranking') {
    for (const selected of rankingRows.values())
      for (const row of selected)
        if (row.rankingObservationId) wanted.add(row.rankingObservationId);
  } else
    for (const row of rows) {
      wanted.add(row.latestObservationId);
      if (mode !== 'latest') for (const id of row.recentObservationIds) wanted.add(id);
    }
  if (mode === 'sparkline')
    for (const row of rows) for (const id of row.sparklineObservationIds ?? []) wanted.add(id);
  const england = areas.find((a) => a.code === ENGLAND_AREA_CODE);
  const benchmarkIds = england
    ? [
        ...new Set(
          mode === 'ranking'
            ? [...rankingRows.values()].flatMap((selected) =>
                selected.flatMap((row) =>
                  row.rankingObservationId ? [row.rankingObservationId] : [],
                ),
              )
            : rows.filter((row) => row.areaId !== england.id).map((row) => row.latestObservationId),
        ),
      ]
    : [];
  const extra = await readPoints(db, [...wanted], benchmarkIds, england?.id);
  const byId = new Map(extra.map((row) => [row.id, row.point]));
  // A publication can change after the marker read and hide the selected points.
  if ([...wanted].some((id) => !byId.has(id))) return undefined;
  const result: Result = new Map();
  for (const indicatorId of indicatorIds) {
    const selected = rows.filter((row) => row.indicatorId === indicatorId);
    const forArea = (id: string) => selected.filter((row) => row.areaId === id);
    if (mode === 'ranking') {
      const chosen = rankingRows.get(indicatorId) ?? [];
      const latest = chosen
        .flatMap((row) => {
          const point = row.rankingObservationId ? byId.get(row.rankingObservationId) : undefined;
          return point ? [point] : [];
        })
        .sort(
          (a, b) => b.toDate.localeCompare(a.toDate) || b.fromDate.localeCompare(a.fromDate),
        )[0];
      result.set(indicatorId, {
        areaData: ordered.map((a) => {
          const pointId = chosen.find((row) => row.areaId === a.id)?.rankingObservationId;
          const point =
            a.code === ENGLAND_AREA_CODE && ordered.some((area) => area.code !== ENGLAND_AREA_CODE)
              ? extra.find(
                  (row) =>
                    row.indicatorId === indicatorId &&
                    row.areaId === a.id &&
                    row.point.fromDate === latest?.fromDate &&
                    row.point.toDate === latest?.toDate &&
                    latest &&
                    observationSegmentKey(row.point) === observationSegmentKey(latest),
                )?.point
              : pointId
                ? byId.get(pointId)
                : undefined;
          return {
            areaCode: a.code,
            areaName: a.name,
            observations:
              point && point.fromDate === latest?.fromDate && point.toDate === latest?.toDate
                ? [point]
                : [],
          };
        }),
      });
      continue;
    }
    const choices = new Map<string, TableSeriesSelection>();
    const points = new Map<string, Map<string, IndicatorObservation>>();
    const add = (id: string, point: IndicatorObservation) => {
      let group = points.get(id);
      if (!group) {
        group = new Map();
        points.set(id, group);
      }
      group.set(`${point.fromDate}:${point.toDate}:${observationSegmentKey(point)}`, point);
    };
    const choice = (sex: string, periodType: TableSeriesSelection['periodType']) => {
      const key = `${sex}|${periodType}`;
      let entry = choices.get(key);
      if (!entry) {
        entry = { sex, periodType, segments: {}, trends: {}, rowOrder: {} };
        choices.set(key, entry);
      }
      return entry;
    };
    for (const a of ordered) {
      const areaRows = forArea(a.id);
      for (const [index, variant] of (
        areaRows[0]?.variants ?? [{ sex: '', periodType: 'all' as const }]
      ).entries()) {
        const entry = choice(variant.sex, variant.periodType);
        if (entry.rowOrder) entry.rowOrder[a.code] = index;
      }
      for (const row of areaRows) {
        const latest = byId.get(row.latestObservationId);
        if (!latest) continue;
        const entry = choice(row.sex, row.periodType);
        entry.segments[a.code] = observationSegmentKey(latest);
        if (entry.trends)
          entry.trends[a.code] = recentTrendDirection([...row.recentValues].reverse());
        add(a.id, latest);
        if (mode !== 'latest')
          for (const id of row.recentObservationIds) {
            const point = byId.get(id);
            if (point) add(a.id, point);
          }
      }
    }
    if (mode === 'sparkline')
      for (const row of extra) if (row.indicatorId === indicatorId) add(row.areaId, row.point);
    if (england)
      for (const row of extra)
        if (row.indicatorId === indicatorId && row.areaId === england.id)
          add(england.id, row.point);
    result.set(indicatorId, {
      tableSeries: [...choices.values()],
      areaData: ordered.map((a) => ({
        areaCode: a.code,
        areaName: a.name,
        observations: [...(points.get(a.id)?.values() ?? [])].sort(
          (a, b) =>
            a.fromDate.localeCompare(b.fromDate) ||
            a.toDate.localeCompare(b.toDate) ||
            observationSegmentKey(a).localeCompare(observationSegmentKey(b)),
        ),
      })),
    });
  }
  return result;
}

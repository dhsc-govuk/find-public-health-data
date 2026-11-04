import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import {
  publishedArea as area,
  publishedDimensionType as dimensionType,
  publishedDimensionValue as dimensionValue,
  publishedNoteType as noteType,
  publishedObservation as observation,
  publishedObservationNote as observationNote,
} from './schema/index.ts';

export interface ObservationDimensionValue {
  type: string;
  value: string;
  dimensionClass: string;
  sortOrder: number;
}

export interface IndicatorObservation {
  fromDate: string;
  toDate: string;
  value: number | null;
  lowerCi95: number | null;
  upperCi95: number | null;
  lowerCi998: number | null;
  upperCi998: number | null;
  count: number | null;
  numerator: number | null;
  denominator: number | null;
  dimensions: ObservationDimensionValue[];
  /** Note texts attached to the value, with their category ("quality", "disclosure"…). */
  notes: { text: string; category: string }[];
}

export interface IndicatorAreaData {
  areaCode: string;
  areaName: string;
  observations: IndicatorObservation[];
}

/**
 * All published observations for one indicator in one area, with their dimension labels.
 * An observation with no dimensions is the fully-aggregate value for its period.
 */
export async function getIndicatorObservationsForAreas(
  db: Database,
  indicatorId: string,
  areaCodes: string[],
): Promise<IndicatorAreaData[]> {
  return (await getIndicatorObservationsByIds(db, [indicatorId], areaCodes)).get(indicatorId) ?? [];
}

/** Load a table's indicators together so its query count does not grow with its rows. */
export async function getIndicatorObservationsByIds(
  db: Database,
  indicatorIds: string[],
  areaCodes: string[],
  tableSeries = false,
): Promise<Map<string, IndicatorAreaData[]>> {
  if (indicatorIds.length === 0 || areaCodes.length === 0) return new Map();
  const fields = {
    obsId: observation.id,
    indicatorId: observation.indicatorId,
    areaId: observation.areaId,
    dimensionKey: observation.dimensionKey,
    fromDate: observation.fromDate,
    toDate: observation.toDate,
    value: observation.value,
    lowerCi95: observation.lowerCi95,
    upperCi95: observation.upperCi95,
    lowerCi998: observation.lowerCi998,
    upperCi998: observation.upperCi998,
    count: observation.count,
    numerator: observation.numerator,
    denominator: observation.denominator,
    areaCode: area.code,
    areaName: area.name,
  };
  const query = db
    .select(fields)
    .from(observation)
    .innerJoin(area, and(eq(observation.areaId, area.id), inArray(area.code, areaCodes)))
    .where(inArray(observation.indicatorId, indicatorIds));
  type Row = Awaited<typeof query>[number];
  const rows: Row[] = tableSeries
    ? await (async () => {
        const sexes = await db
          .select({ id: dimensionValue.id })
          .from(dimensionValue)
          .innerJoin(dimensionType, eq(dimensionValue.dimensionTypeId, dimensionType.id))
          .where(eq(dimensionType.name, 'Sex'));
        const sex = sexes.length
          ? sql`case ${sql.join(
              sexes.map(({ id }) => sql`when position(${id} in p.dimension_key) > 0 then ${id}`),
              sql` `,
            )} else '' end`
          : sql`''`;
        // Each sex/period choice needs its least-disaggregated, longest series.
        // England also keeps other areas' selected segments for their benchmarks.
        return db.execute<Row>(sql`
          with table_points as materialized (
            select p.*, ${sex} as sex from (${query}) p
          ), segments as (
            select indicator_id, area_id, dimension_key, sex,
              count(*) as length,
              count(*) filter (where to_date - from_date > 400) as rolling_length,
              count(*) filter (where to_date - from_date <= 400) as single_length,
              min(from_date::text || ':' || to_date::text) as first_point,
              min(from_date::text || ':' || to_date::text) filter (where to_date - from_date > 400) as rolling_first,
              min(from_date::text || ':' || to_date::text) filter (where to_date - from_date <= 400) as single_first
            from table_points
            group by indicator_id, area_id, dimension_key, sex
          ), winners as materialized (
            select distinct on (indicator_id, area_id, sex_group, period_group)
              indicator_id, area_id, dimension_key
            from segments s
            cross join lateral (values (null::text), (s.sex)) sexes(sex_group)
            cross join lateral (values
              ('all', s.length, s.first_point),
              ('rolling', s.rolling_length, s.rolling_first),
              ('single', s.single_length, s.single_first)
            ) periods(period_group, length, first_point)
            where periods.length > 0
            order by indicator_id, area_id, sex_group, period_group,
              cardinality(string_to_array(dimension_key, ',')), periods.length desc,
              periods.first_point, dimension_key
          )
          select id as "obsId", indicator_id as "indicatorId", area_id as "areaId", dimension_key as "dimensionKey",
            from_date as "fromDate", to_date as "toDate", value,
            lower_ci_95 as "lowerCi95", upper_ci_95 as "upperCi95",
            lower_ci_998 as "lowerCi998", upper_ci_998 as "upperCi998",
            count, numerator, denominator, code as "areaCode", name as "areaName"
          from table_points p
          where exists (
            select 1 from winners w
            where w.indicator_id = p.indicator_id and w.dimension_key = p.dimension_key
              and (w.area_id = p.area_id or p.code = 'E92000001')
          )
          order by from_date, to_date, dimension_key
        `);
      })()
    : await query.orderBy(
        asc(observation.fromDate),
        asc(observation.toDate),
        asc(observation.dimensionKey),
      );

  const names = new Map(rows.map(({ areaCode, areaName }) => [areaCode, areaName]));
  const missing = areaCodes.filter((code) => !names.has(code));
  if (missing.length > 0) {
    const known = await db
      .select({ code: area.code, name: area.name })
      .from(area)
      .where(inArray(area.code, missing));
    for (const { code, name } of known) names.set(code, name);
  }
  const valueIds = [
    ...new Set(rows.flatMap(({ dimensionKey }) => dimensionKey.split(',').filter(Boolean))),
  ];
  const dimensionRows = valueIds.length
    ? await db
        .select({
          id: dimensionValue.id,
          type: dimensionType.name,
          value: dimensionValue.name,
          dimensionClass: dimensionType.dimensionClass,
          sortOrder: dimensionValue.sortOrder,
        })
        .from(dimensionValue)
        .innerJoin(dimensionType, eq(dimensionValue.dimensionTypeId, dimensionType.id))
        .where(inArray(dimensionValue.id, valueIds))
    : [];
  const dimensionsById = new Map(dimensionRows.map(({ id, ...dimension }) => [id, dimension]));

  const observationIds = `{${rows.map(({ obsId }) => obsId).join(',')}}`;
  const noteRows = rows.length
    ? await db
        .select({
          observationId: observationNote.observationId,
          text: noteType.text,
          category: noteType.category,
        })
        .from(observationNote)
        .innerJoin(noteType, eq(observationNote.noteTypeId, noteType.id))
        .where(sql`${observationNote.observationId} = any(${observationIds}::uuid[])`)
    : [];

  const notesByObservation = new Map<string, { text: string; category: string }[]>();
  for (const { observationId, ...note } of noteRows) {
    const existing = notesByObservation.get(observationId);
    if (existing) {
      existing.push(note);
    } else {
      notesByObservation.set(observationId, [note]);
    }
  }

  const byIndicator = new Map<string, Map<string, IndicatorObservation[]>>();
  for (const {
    obsId,
    indicatorId,
    areaId: _areaId,
    dimensionKey,
    areaCode,
    areaName: _areaName,
    ...observationRow
  } of rows) {
    const byArea = byIndicator.get(indicatorId) ?? new Map<string, IndicatorObservation[]>();
    const observations = byArea.get(areaCode) ?? [];
    observations.push({
      ...observationRow,
      dimensions: dimensionKey
        .split(',')
        .flatMap((id) => {
          const dimension = dimensionsById.get(id);
          return dimension ? [dimension] : [];
        })
        .sort((a, b) => a.type.localeCompare(b.type)),
      notes: notesByObservation.get(obsId) ?? [],
    });
    byArea.set(areaCode, observations);
    byIndicator.set(indicatorId, byArea);
  }
  return new Map(
    indicatorIds.map((id) => [
      id,
      areaCodes.flatMap((areaCode) => {
        const areaName = names.get(areaCode);
        return areaName
          ? [{ areaCode, areaName, observations: byIndicator.get(id)?.get(areaCode) ?? [] }]
          : [];
      }),
    ]),
  );
}

export async function getIndicatorObservations(
  db: Database,
  indicatorId: string,
  areaCode: string,
): Promise<IndicatorAreaData | undefined> {
  return (await getIndicatorObservationsForAreas(db, indicatorId, [areaCode]))[0];
}

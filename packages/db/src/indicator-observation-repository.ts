import {
  type TableSeriesSelection,
  tableAreaSeries,
  tableSummary,
} from '@fphd/utils/observation-series';
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
  return (
    (await getIndicatorObservationData(db, [indicatorId], areaCodes)).get(indicatorId)?.areaData ??
    []
  );
}

/** Load a table's indicators together so its query count does not grow with its rows. */
export async function getIndicatorObservationData(
  db: Database,
  indicatorIds: string[],
  areaCodes: string[],
  projection?: 'table' | 'summary' | 'ranking' | 'sparkline',
): Promise<Map<string, { areaData: IndicatorAreaData[]; tableSeries?: TableSeriesSelection[] }>> {
  if (indicatorIds.length === 0 || areaCodes.length === 0) return new Map();
  const requestedAreas =
    projection === 'ranking'
      ? await db
          .select({ id: area.id, code: area.code, name: area.name })
          .from(area)
          .where(inArray(area.code, areaCodes))
      : undefined;
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
    .where(
      and(
        inArray(observation.indicatorId, indicatorIds),
        requestedAreas
          ? inArray(
              observation.areaId,
              requestedAreas.map(({ id }) => id),
            )
          : undefined,
      ),
    );
  type Row = Awaited<typeof query>[number];
  const segments = sql`
    with table_points as materialized (
      select * from (${query}) p
    ), sex_values as materialized (
      select ${dimensionValue.id}::text as id, ${dimensionValue.name} as name, ${dimensionValue.sortOrder} as sort_order
      from ${dimensionValue}
      inner join ${dimensionType} on ${dimensionValue.dimensionTypeId} = ${dimensionType.id}
      where ${dimensionType.name} = 'Sex'
    ), segments as (
      select indicator_id, area_id, dimension_key,
        count(*) as length,
        count(*) filter (where to_date - from_date > 400) as rolling_length,
        count(*) filter (where to_date - from_date <= 400) as single_length,
        min(from_date::text || ':' || to_date::text) as first_point,
        min(from_date::text || ':' || to_date::text) filter (where to_date - from_date > 400) as rolling_first,
        min(from_date::text || ':' || to_date::text) filter (where to_date - from_date <= 400) as single_first
      from table_points
      group by indicator_id, area_id, dimension_key
    ), sex_segments as materialized (
      select s.*, coalesce((
        select id from sex_values where position(id in s.dimension_key) > 0 limit 1
      ), '') as sex
      from segments s
    )
  `;
  // Membership stays in subplans so low row estimates cannot produce repeated history scans.
  const rows: Row[] =
    projection === 'ranking'
      ? await db.execute<Row>(sql`
          ${segments}, data_areas as materialized (
            select distinct indicator_id, area_id, code from table_points
          ), first_areas as (
            select distinct on (indicator_id) indicator_id, area_id
            from data_areas
            join unnest(${`{${areaCodes.join(',')}}`}::text[]) with ordinality requested(code, position) using (code)
            order by indicator_id, requested.position
          ), first_metadata as (
            select s.indicator_id, s.area_id, bool_or(s.sex = '') as aggregate,
              bool_or(s.single_length > 0) as single, bool_or(s.rolling_length > 0) as rolling
            from sex_segments s join first_areas f using (indicator_id, area_id)
            group by s.indicator_id, s.area_id
          ), variant_choices as (
            select indicator_id, '' as sex, 'all' as period, 0 as sex_order, '' as sex_name, 0 as period_order
            from first_metadata where aggregate
            union all
            select distinct m.indicator_id, v.id, case when m.single and m.rolling then p.period else 'all' end,
              v.sort_order, v.name, p.position
            from first_metadata m
            join sex_segments s on s.indicator_id = m.indicator_id and s.area_id = m.area_id
            join sex_values v on v.id = s.sex
            cross join lateral (values ('single', m.single, 0), ('rolling', m.rolling, 1)) p(period, present, position)
            where not m.aggregate and p.present
          ), variants as (
            select *, dense_rank() over (partition by indicator_id order by sex_order, sex_name, period_order) as variant_rank
            from variant_choices
          ), winners as materialized (
            select distinct on (s.indicator_id, v.variant_rank, s.area_id)
              s.indicator_id, s.area_id, s.dimension_key, v.period, v.variant_rank
            from sex_segments s
            join variants v on v.indicator_id = s.indicator_id and (v.sex = '' or v.sex = s.sex)
            join data_areas a on a.indicator_id = s.indicator_id and a.area_id = s.area_id
            cross join lateral (values (
              case v.period when 'single' then s.single_length when 'rolling' then s.rolling_length else s.length end,
              case v.period when 'single' then s.single_first when 'rolling' then s.rolling_first else s.first_point end
            )) selected(length, first_point)
            where selected.length > 0 and (
              a.code <> 'E92000001' or not exists (
                select 1 from data_areas local where local.indicator_id = s.indicator_id and local.code <> 'E92000001'
              )
            )
            order by s.indicator_id, v.variant_rank, s.area_id,
              cardinality(string_to_array(s.dimension_key, ',')), selected.length desc,
              selected.first_point collate "C", s.dimension_key collate "C"
          ), chosen_variant as (
            select indicator_id, min(variant_rank) as variant_rank from winners group by indicator_id
          ), selected_winners as materialized (
            select w.* from winners w join chosen_variant v using (indicator_id, variant_rank)
          ), chosen_points as materialized (
            select p.* from table_points p
            where ((p.indicator_id, p.area_id, p.dimension_key, p.to_date - p.from_date > 400) in (
              select w.indicator_id, w.area_id, w.dimension_key, periods.rolling
              from selected_winners w cross join (values (false), (true)) periods(rolling)
              where w.period = 'all' or periods.rolling = (w.period = 'rolling')
            )) is true
          ), latest as materialized (
            select distinct on (indicator_id) indicator_id, from_date, to_date
            from chosen_points where value is not null
            order by indicator_id, to_date desc, from_date desc
          )
          select p.id as "obsId", p.indicator_id as "indicatorId", p.area_id as "areaId", p.dimension_key as "dimensionKey",
            p.from_date as "fromDate", p.to_date as "toDate", p.value,
            p.lower_ci_95 as "lowerCi95", p.upper_ci_95 as "upperCi95",
            p.lower_ci_998 as "lowerCi998", p.upper_ci_998 as "upperCi998",
            p.count, p.numerator, p.denominator, p.code as "areaCode", p.name as "areaName"
          from chosen_points p
          where p.value is not null and ((p.indicator_id, p.from_date, p.to_date) in (
            select indicator_id, from_date, to_date from latest
          )) is true
          order by p.from_date, p.to_date, p.dimension_key
        `)
      : projection
        ? await db.execute<Row>(sql`${segments}, winners as materialized (
            select distinct on (indicator_id, area_id, sex_group, period_group)
              indicator_id, area_id, dimension_key
            from sex_segments s
            cross join lateral (values (null::text), (s.sex)) sexes(sex_group)
            cross join lateral (values
              ('all', s.length, s.first_point),
              ('rolling', s.rolling_length, s.rolling_first),
              ('single', s.single_length, s.single_first)
            ) periods(period_group, length, first_point)
            where periods.length > 0
            order by indicator_id, area_id, sex_group, period_group,
              cardinality(string_to_array(dimension_key, ',')), periods.length desc,
              periods.first_point collate "C", dimension_key collate "C"
          )
          select id as "obsId", indicator_id as "indicatorId", area_id as "areaId", dimension_key as "dimensionKey",
            from_date as "fromDate", to_date as "toDate", value,
            lower_ci_95 as "lowerCi95", upper_ci_95 as "upperCi95",
            lower_ci_998 as "lowerCi998", upper_ci_998 as "upperCi998",
            count, numerator, denominator, code as "areaCode", name as "areaName"
          from table_points p
          where (p.indicator_id, p.area_id, p.dimension_key) in (
            select indicator_id, area_id, dimension_key from winners
          ) or (
            p.code = 'E92000001' and (p.indicator_id, p.dimension_key) in (
              select indicator_id, dimension_key from winners
            )
          )
          order by from_date, to_date, dimension_key
`)
        : await query.orderBy(
            asc(observation.fromDate),
            asc(observation.toDate),
            asc(observation.dimensionKey),
          );

  const names = new Map((requestedAreas ?? []).map(({ code, name }) => [code, name]));
  for (const { areaCode, areaName } of rows) names.set(areaCode, areaName);
  const missing = requestedAreas ? [] : areaCodes.filter((code) => !names.has(code));
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

  type Point = IndicatorObservation & { obsId: string };
  const byIndicator = new Map<string, Map<string, Point[]>>();
  for (const {
    obsId,
    indicatorId,
    areaId: _areaId,
    dimensionKey,
    areaCode,
    areaName: _areaName,
    ...observationRow
  } of rows) {
    const byArea = byIndicator.get(indicatorId) ?? new Map<string, Point[]>();
    const observations = byArea.get(areaCode) ?? [];
    observations.push({
      obsId,
      ...observationRow,
      dimensions: dimensionKey
        .split(',')
        .flatMap((id) => {
          const dimension = dimensionsById.get(id);
          return dimension ? [dimension] : [];
        })
        .sort((a, b) => a.type.localeCompare(b.type)),
      notes: [],
    });
    byArea.set(areaCode, observations);
    byIndicator.set(indicatorId, byArea);
  }
  const entries = indicatorIds.map((id) => {
    const areaData = areaCodes.flatMap((areaCode) => {
      const areaName = names.get(areaCode);
      return areaName
        ? [{ areaCode, areaName, observations: byIndicator.get(id)?.get(areaCode) ?? [] }]
        : [];
    });
    return {
      id,
      ...(projection === 'table' || projection === 'summary' || projection === 'sparkline'
        ? tableSummary(
            tableAreaSeries(areaData),
            projection === 'summary'
              ? 'latest'
              : projection === 'sparkline'
                ? 'sparkline'
                : 'recent',
          )
        : { areaData }),
    };
  });
  const points = entries.flatMap(({ areaData }) => areaData.flatMap((area) => area.observations));
  const observationIds = `{${points.map(({ obsId }) => obsId).join(',')}}`;
  const noteRows = points.length
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

  return new Map(
    entries.map(({ id, ...entry }) => [
      id,
      {
        ...entry,
        areaData: entry.areaData.map((area) => ({
          ...area,
          observations: area.observations.map(({ obsId, ...point }) => ({
            ...point,
            notes: notesByObservation.get(obsId) ?? [],
          })),
        })),
      },
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

import type { Polarity } from '@fphd/utils/polarity';
import type { AgeUnit } from '@fphd/utils/standard-dimension';
import type postgres from 'postgres';

import { ENGLAND_CODE } from './area-level-repository.ts';
import type { Database } from './client.ts';

/** A standard dimension column, or a custom dimension's, that `/v0/data` can filter on. */
export const DATA_FILTER_COLUMNS = [
  'sex',
  'age',
  'deprivation',
  'deprivationScheme',
  'ethnicity',
  'ethnicityScheme',
  'socioeconomicGroup',
  'socioeconomicGroupScheme',
  'religion',
  'religionScheme',
  'sexuality',
  'sexualityScheme',
  'category1Type',
  'category1',
] as const;

export type DataFilterColumn = (typeof DATA_FILTER_COLUMNS)[number];

/** Rows whose value in a column is one of `values`, or empty if `empty` is set. */
export interface DataFilter {
  values: readonly string[];
  empty: boolean;
}

/** An age band end, in days, for comparing ends written in different units. */
export interface AgeEndDays {
  from?: number;
  under?: number;
}

export interface DataQuery {
  shortIds?: readonly number[];
  /** Areas by code, whatever their boundaries, or a level's areas, or (neither) every area. */
  areas:
    | { kind: 'codes'; codes: readonly string[] }
    | { kind: 'level'; level: string; parent?: string; boundaries?: string }
    | { kind: 'all' };
  /** Periods ending on or after this date. */
  from?: string;
  /** Periods ending on or before this date. */
  to?: string;
  /** Only the N most recent periods of each indicator, for each area level. */
  latest?: number;
  /** `england`, or a level each area is compared with its parent of. */
  benchmark: string;
  filters: Partial<Record<DataFilterColumn, DataFilter>>;
  deprivationGroups?: number;
  ageRange?: AgeEndDays;
}

export type DataRowRecord = {
  shortId: number;
  indicatorSlug: string;
  indicatorName: string;
  polarity: Polarity | null;
  comparatorMethod: string | null;
  areaCode: string;
  areaName: string;
  areaLevel: string;
  areaValidFrom: string | null;
  areaValidTo: string | null;
  fromDate: string;
  toDate: string;
  sex: string | null;
  age: string | null;
  ageFromValue: number | null;
  ageFromUnit: AgeUnit | null;
  ageUnderValue: number | null;
  ageUnderUnit: AgeUnit | null;
  deprivation: number | null;
  deprivationGroups: number | null;
  deprivationScheme: string | null;
  ethnicity: string | null;
  ethnicityScheme: string | null;
  socioeconomicGroup: string | null;
  socioeconomicGroupScheme: string | null;
  religion: string | null;
  religionScheme: string | null;
  sexuality: string | null;
  sexualityScheme: string | null;
  category1Type: string | null;
  category1: string | null;
  value: number | null;
  lowerCi95: number | null;
  upperCi95: number | null;
  lowerCi998: number | null;
  upperCi998: number | null;
  count: number | null;
  numerator: number | null;
  denominator: number | null;
  note: string | null;
  benchmarkCode: string | null;
  benchmarkValue: number | null;
};

// The pivoted dimension columns, as SQL column names, for the filters above.
const FILTER_SQL: Record<DataFilterColumn, string> = {
  sex: 'sex',
  age: 'age',
  deprivation: 'deprivation::text',
  deprivationScheme: 'deprivation_scheme',
  ethnicity: 'ethnicity',
  ethnicityScheme: 'ethnicity_scheme',
  socioeconomicGroup: 'socioeconomic_group',
  socioeconomicGroupScheme: 'socioeconomic_group_scheme',
  religion: 'religion',
  religionScheme: 'religion_scheme',
  sexuality: 'sexuality',
  sexualityScheme: 'sexuality_scheme',
  category1Type: 'category1_type',
  category1: 'category1',
};

const ROWS_PER_BATCH = 1000;

/**
 * The rows `/v0/data` returns, in batches, so a large response streams rather than filling
 * memory. Each row carries its benchmark's value for the same indicator, period and breakdown.
 * An observation broken down by a value with no public name is left out.
 */
export function streamData(db: Database, query: DataQuery): AsyncIterable<DataRowRecord[]> {
  const sql = db.$client;
  const empty = sql``;

  const indicatorFilter =
    query.shortIds === undefined
      ? empty
      : sql`WHERE i.short_id = ANY(${query.shortIds as number[]}::int[])`;

  const levelFilter =
    query.areas.kind === 'level' ? sql`WHERE l.slug = ${query.areas.level}` : empty;

  let selected: postgres.PendingQuery<postgres.Row[]>;
  if (query.areas.kind === 'codes') {
    selected = sql`
      SELECT NULL::uuid AS indicator_id, al.* FROM area_level_of al
      WHERE al.code = ANY(${query.areas.codes as string[]}::text[])`;
  } else if (query.areas.kind === 'all') {
    selected = sql`SELECT NULL::uuid AS indicator_id, al.* FROM area_level_of al`;
  } else {
    const parent = query.areas.parent;
    const candidates =
      parent === undefined || parent === ENGLAND_CODE
        ? sql`SELECT * FROM area_level_of`
        : sql`
          SELECT * FROM area_level_of WHERE id IN (
            WITH RECURSIVE descendant(id) AS (
              SELECT r.child_area_id FROM published.area_relationship r
              JOIN published.area p ON p.id = r.parent_area_id
              WHERE p.code = ${parent}
              UNION
              SELECT r.child_area_id FROM published.area_relationship r
              JOIN descendant d ON d.id = r.parent_area_id
            )
            SELECT id FROM descendant
          )`;
    // Each indicator's areas as they stood on its boundary date: the one asked for, or the
    // latest date any area it has data for took its boundaries.
    const boundaryDate =
      query.areas.boundaries === undefined
        ? sql`
          SELECT o.indicator_id, max(c.valid_from) AS on_date
          FROM published.observation o
          JOIN candidate c ON c.id = o.area_id
          JOIN ind ON ind.id = o.indicator_id
          GROUP BY o.indicator_id`
        : sql`SELECT ind.id AS indicator_id, ${query.areas.boundaries}::date AS on_date FROM ind`;
    selected = sql`
      SELECT b.indicator_id, c.* FROM (${boundaryDate}) b
      JOIN candidate c
        ON (b.on_date IS NULL OR c.valid_from IS NULL OR c.valid_from <= b.on_date)
       AND (b.on_date IS NULL OR c.valid_to IS NULL OR c.valid_to >= b.on_date)`;
    return run(sql, query, indicatorFilter, levelFilter, candidates, selected);
  }
  return run(sql, query, indicatorFilter, levelFilter, sql`SELECT * FROM area_level_of`, selected);
}

function run(
  sql: postgres.Sql,
  query: DataQuery,
  indicatorFilter: postgres.PendingQuery<postgres.Row[]>,
  levelFilter: postgres.PendingQuery<postgres.Row[]>,
  candidates: postgres.PendingQuery<postgres.Row[]>,
  selected: postgres.PendingQuery<postgres.Row[]>,
): AsyncIterable<DataRowRecord[]> {
  const empty = sql``;
  const conditions: postgres.PendingQuery<postgres.Row[]>[] = [sql`d.hidden = 0`];

  if (query.from !== undefined) conditions.push(sql`r.to_date >= ${query.from}::date`);
  if (query.to !== undefined) conditions.push(sql`r.to_date <= ${query.to}::date`);
  if (query.latest !== undefined) conditions.push(sql`r.period_rank <= ${query.latest}`);
  if (query.deprivationGroups !== undefined) {
    conditions.push(sql`d.deprivation_groups = ${query.deprivationGroups}`);
  }
  for (const [column, filter] of Object.entries(query.filters) as [
    DataFilterColumn,
    DataFilter,
  ][]) {
    const expression = sql.unsafe(`d.${FILTER_SQL[column]}`);
    conditions.push(
      filter.empty
        ? sql`(${expression} = ANY(${filter.values as string[]}::text[]) OR ${expression} IS NULL)`
        : sql`${expression} = ANY(${filter.values as string[]}::text[])`,
    );
  }
  if (query.ageRange !== undefined) {
    const { from, under } = query.ageRange;
    conditions.push(sql`d.age_from_days IS NOT NULL`);
    if (from !== undefined) conditions.push(sql`d.age_from_days >= ${from}`);
    if (under !== undefined) {
      conditions.push(sql`d.age_under_days IS NOT NULL AND d.age_under_days <= ${under}`);
    }
  }

  const benchmark =
    query.benchmark === 'england'
      ? sql`
        LEFT JOIN LATERAL (
          SELECT a.id, a.code FROM published.area a WHERE a.code = ${ENGLAND_CODE} LIMIT 1
        ) bm ON true`
      : sql`
        LEFT JOIN (
          SELECT DISTINCT ON (up.start) up.start AS area_id, p.id, p.code
          FROM up
          JOIN published.area p ON p.id = up.id
          JOIN published.area_level l ON l.slug = ${query.benchmark}
            AND p.area_type_id = ANY(l.area_type_ids)
          ORDER BY up.start, up.depth
        ) bm ON bm.area_id = r.area_id`;
  const ancestors =
    query.benchmark === 'england'
      ? empty
      : sql`,
        up(start, id, depth) AS (
          SELECT s.id, r.parent_area_id, 1
          FROM (SELECT DISTINCT id FROM selected) s
          JOIN published.area_relationship r ON r.child_area_id = s.id
          UNION
          SELECT up.start, r.parent_area_id, up.depth + 1
          FROM up JOIN published.area_relationship r ON r.child_area_id = up.id
          WHERE up.depth < 8
        )`;

  const days = (value: string, unit: string) => `
    ${value} * CASE ${unit}
      WHEN 'year' THEN 365.25 WHEN 'month' THEN 365.25 / 12 WHEN 'week' THEN 7 ELSE 1 END`;

  const statement = sql`
    WITH RECURSIVE
    ind AS (
      SELECT i.id, i.short_id, i.slug, i.name, i.polarity, cm.name AS comparator_method
      FROM published.indicator i
      LEFT JOIN published.comparator_method cm ON cm.id = i.comparator_method_id
      ${indicatorFilter}
    ),
    area_level_of AS (
      SELECT DISTINCT ON (a.id) a.id, a.code, a.name, a.valid_from, a.valid_to, l.slug AS level
      FROM published.area a
      JOIN published.area_level l ON a.area_type_id = ANY(l.area_type_ids)
      ${levelFilter}
      ORDER BY a.id, l.display_order
    ),
    candidate AS (${candidates}),
    selected AS (${selected})${ancestors},
    obs AS (
      SELECT o.*, s.code AS area_code, s.name AS area_name, s.level, s.valid_from AS area_valid_from,
        s.valid_to AS area_valid_to,
        dense_rank() OVER (
          PARTITION BY o.indicator_id, s.level ORDER BY o.to_date DESC, o.from_date DESC
        ) AS period_rank
      FROM published.observation o
      JOIN ind ON ind.id = o.indicator_id
      JOIN selected s ON s.id = o.area_id AND (s.indicator_id IS NULL OR s.indicator_id = o.indicator_id)
      ${query.to === undefined ? empty : sql`WHERE o.to_date <= ${query.to}::date`}
    )
    SELECT
      ind.short_id AS "shortId",
      ind.slug AS "indicatorSlug",
      ind.name AS "indicatorName",
      ind.polarity,
      ind.comparator_method AS "comparatorMethod",
      r.area_code AS "areaCode",
      r.area_name AS "areaName",
      r.level AS "areaLevel",
      r.area_valid_from::text AS "areaValidFrom",
      r.area_valid_to::text AS "areaValidTo",
      r.from_date::text AS "fromDate",
      r.to_date::text AS "toDate",
      d.sex, d.age,
      d.age_from_value AS "ageFromValue", d.age_from_unit AS "ageFromUnit",
      d.age_under_value AS "ageUnderValue", d.age_under_unit AS "ageUnderUnit",
      d.deprivation, d.deprivation_groups AS "deprivationGroups",
      d.deprivation_scheme AS "deprivationScheme",
      d.ethnicity, d.ethnicity_scheme AS "ethnicityScheme",
      d.socioeconomic_group AS "socioeconomicGroup",
      d.socioeconomic_group_scheme AS "socioeconomicGroupScheme",
      d.religion, d.religion_scheme AS "religionScheme",
      d.sexuality, d.sexuality_scheme AS "sexualityScheme",
      d.category1_type AS "category1Type", d.category1,
      r.value,
      r.lower_ci_95 AS "lowerCi95", r.upper_ci_95 AS "upperCi95",
      r.lower_ci_998 AS "lowerCi998", r.upper_ci_998 AS "upperCi998",
      r.count, r.numerator, r.denominator,
      nt.code AS note,
      bm.code AS "benchmarkCode",
      b.value AS "benchmarkValue"
    FROM obs r
    JOIN ind ON ind.id = r.indicator_id
    LEFT JOIN LATERAL (
      SELECT
        max(vp.slug) FILTER (WHERE tp.standard_dimension = 'sex') AS sex,
        max(vp.slug) FILTER (WHERE tp.standard_dimension = 'age') AS age,
        max(vp.age_from_value) FILTER (WHERE tp.standard_dimension = 'age') AS age_from_value,
        max(vp.age_from_unit) FILTER (WHERE tp.standard_dimension = 'age') AS age_from_unit,
        max(vp.age_under_value) FILTER (WHERE tp.standard_dimension = 'age') AS age_under_value,
        max(vp.age_under_unit) FILTER (WHERE tp.standard_dimension = 'age') AS age_under_unit,
        max(${sql.unsafe(days('vp.age_from_value', 'vp.age_from_unit'))})
          FILTER (WHERE tp.standard_dimension = 'age') AS age_from_days,
        max(${sql.unsafe(days('vp.age_under_value', 'vp.age_under_unit'))})
          FILTER (WHERE tp.standard_dimension = 'age') AS age_under_days,
        max(vp.deprivation_group) FILTER (WHERE tp.standard_dimension = 'deprivation') AS deprivation,
        max(ds.groups) FILTER (WHERE tp.standard_dimension = 'deprivation') AS deprivation_groups,
        max(tp.slug) FILTER (WHERE tp.standard_dimension = 'deprivation') AS deprivation_scheme,
        max(vp.slug) FILTER (WHERE tp.standard_dimension = 'ethnicity') AS ethnicity,
        max(tp.slug) FILTER (WHERE tp.standard_dimension = 'ethnicity') AS ethnicity_scheme,
        max(vp.slug) FILTER (WHERE tp.standard_dimension = 'socioeconomic-group') AS socioeconomic_group,
        max(tp.slug) FILTER (WHERE tp.standard_dimension = 'socioeconomic-group')
          AS socioeconomic_group_scheme,
        max(vp.slug) FILTER (WHERE tp.standard_dimension = 'religion') AS religion,
        max(tp.slug) FILTER (WHERE tp.standard_dimension = 'religion') AS religion_scheme,
        max(vp.slug) FILTER (WHERE tp.standard_dimension = 'sexuality') AS sexuality,
        max(tp.slug) FILTER (WHERE tp.standard_dimension = 'sexuality') AS sexuality_scheme,
        max(tp.slug) FILTER (WHERE tp.id IS NOT NULL AND tp.standard_dimension IS NULL) AS category1_type,
        max(vp.slug) FILTER (WHERE tp.id IS NOT NULL AND tp.standard_dimension IS NULL) AS category1,
        count(*) FILTER (WHERE vp.id IS NULL OR tp.id IS NULL) AS hidden
      FROM published.observation_dimension od
      LEFT JOIN published.dimension_value_public vp ON vp.id = od.dimension_value_id
      LEFT JOIN published.dimension_type_public tp ON tp.id = od.dimension_type_id
      LEFT JOIN published.deprivation_scheme ds ON ds.id = od.dimension_type_id
      WHERE od.observation_id = r.id
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT min(np.code) AS code
      FROM published.observation_note n
      JOIN published.note_type_public np ON np.id = n.note_type_id
      WHERE n.observation_id = r.id
    ) nt ON true
    ${benchmark}
    LEFT JOIN published.observation b
      ON b.indicator_id = r.indicator_id
     AND b.area_id = bm.id
     AND b.from_date = r.from_date
     AND b.to_date = r.to_date
     AND b.dimension_key = r.dimension_key
    WHERE ${conditions.reduce((all, condition) => sql`${all} AND ${condition}`)}
    ORDER BY ind.short_id, r.area_code, r.from_date, r.to_date,
      d.sex NULLS FIRST, d.age NULLS FIRST, d.deprivation_scheme NULLS FIRST, d.deprivation NULLS FIRST,
      d.ethnicity_scheme NULLS FIRST, d.ethnicity NULLS FIRST, d.category1_type NULLS FIRST,
      d.category1 NULLS FIRST
  `;

  return statement.cursor(ROWS_PER_BATCH) as unknown as AsyncIterable<DataRowRecord[]>;
}

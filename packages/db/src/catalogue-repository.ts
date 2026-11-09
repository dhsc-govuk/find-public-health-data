import type { StandardDimension } from '@fphd/utils/standard-dimension';
import { sql } from 'drizzle-orm';

import type { Database } from './client.ts';
import { getPublishedIndicatorsByIds, type IndicatorDetail } from './indicator-repository.ts';

/** An indicator's metadata with what the public API adds: its data's levels, periods and so on. */
export interface CatalogueEntry {
  detail: IndicatorDetail;
  levels: { slug: string; name: string; areaCount: number }[];
  periods: {
    count: number;
    earliest: { fromDate: string; toDate: string } | null;
    latest: { fromDate: string; toDate: string } | null;
  };
  dimensions: {
    standardDimension: StandardDimension | null;
    typeSlug: string | null;
    valueSlug: string;
  }[];
  notes: { code: string; text: string }[];
}

/** Which indicators: those with these short ids or internal ids, or (neither) every one. */
export type CatalogueSelection = { shortIds?: readonly number[]; ids?: readonly string[] };

function uuidArray(ids: readonly string[]): string {
  return `{${ids.join(',')}}`;
}

/**
 * Published indicators with everything the public API's catalogue gives them, in short id order.
 * It runs the same number of statements however many indicators it returns.
 */
export async function listCatalogue(
  db: Database,
  selection: CatalogueSelection = {},
): Promise<CatalogueEntry[]> {
  const where =
    selection.ids !== undefined
      ? sql`WHERE id = ANY(${uuidArray(selection.ids)}::uuid[])`
      : selection.shortIds !== undefined
        ? sql`WHERE short_id = ANY(${`{${selection.shortIds.join(',')}}`}::int[])`
        : sql``;
  const indicators = await db.execute<{ id: string }>(
    sql`SELECT id FROM published.indicator ${where} ORDER BY short_id`,
  );
  const ids = indicators.map(({ id }) => id);
  if (ids.length === 0) return [];
  const idArray = uuidArray(ids);

  const [details, levels, periods, dimensions, notes] = await Promise.all([
    getPublishedIndicatorsByIds(db, ids),
    db.execute<{ indicatorId: string; slug: string; name: string; areaCount: number }>(sql`
      SELECT d.indicator_id AS "indicatorId", l.slug, l.name, sum(d.area_count)::int AS "areaCount"
      FROM published.available_data d
      JOIN published.area_level l ON d.area_type_id = ANY(l.area_type_ids)
      WHERE d.indicator_id = ANY(${idArray}::uuid[])
      GROUP BY d.indicator_id, l.slug, l.name, l.display_order
      ORDER BY l.display_order
    `),
    db.execute<{
      indicatorId: string;
      count: number;
      earliestFrom: string;
      earliestTo: string;
      latestFrom: string;
      latestTo: string;
    }>(sql`
      SELECT
        indicator_id AS "indicatorId",
        count(DISTINCT (from_date, to_date))::int AS count,
        ((array_agg(from_date ORDER BY to_date, from_date))[1])::text AS "earliestFrom",
        ((array_agg(to_date ORDER BY to_date, from_date))[1])::text AS "earliestTo",
        ((array_agg(from_date ORDER BY to_date DESC, from_date DESC))[1])::text AS "latestFrom",
        ((array_agg(to_date ORDER BY to_date DESC, from_date DESC))[1])::text AS "latestTo"
      FROM published.observation
      WHERE indicator_id = ANY(${idArray}::uuid[])
      GROUP BY indicator_id
    `),
    db.execute<{
      indicatorId: string;
      standardDimension: StandardDimension | null;
      typeSlug: string | null;
      valueSlug: string;
    }>(sql`
      SELECT DISTINCT
        o.indicator_id AS "indicatorId",
        tp.standard_dimension AS "standardDimension",
        tp.slug AS "typeSlug",
        vp.slug AS "valueSlug"
      FROM published.observation o
      JOIN published.observation_dimension od ON od.observation_id = o.id
      JOIN published.dimension_type_public tp ON tp.id = od.dimension_type_id
      JOIN published.dimension_value_public vp ON vp.id = od.dimension_value_id
      WHERE o.indicator_id = ANY(${idArray}::uuid[])
    `),
    db.execute<{ indicatorId: string; code: string; text: string }>(sql`
      SELECT DISTINCT o.indicator_id AS "indicatorId", np.code, nt.text
      FROM published.observation o
      JOIN published.observation_note n ON n.observation_id = o.id
      JOIN published.note_type nt ON nt.id = n.note_type_id
      JOIN published.note_type_public np ON np.id = nt.id
      WHERE o.indicator_id = ANY(${idArray}::uuid[])
      ORDER BY np.code
    `),
  ]);

  const byIndicator = <T extends { indicatorId: string }>(rows: Iterable<T>) =>
    Map.groupBy([...rows], (row) => row.indicatorId);
  const levelsOf = byIndicator(levels);
  const periodsOf = byIndicator(periods);
  const dimensionsOf = byIndicator(dimensions);
  const notesOf = byIndicator(notes);

  return ids.flatMap((id): CatalogueEntry[] => {
    const detail = details.get(id);
    if (detail === undefined) return [];
    const period = periodsOf.get(id)?.[0];
    return [
      {
        detail,
        levels: (levelsOf.get(id) ?? []).map(({ slug, name, areaCount }) => ({
          slug,
          name,
          areaCount,
        })),
        periods: {
          count: period?.count ?? 0,
          earliest: period ? { fromDate: period.earliestFrom, toDate: period.earliestTo } : null,
          latest: period ? { fromDate: period.latestFrom, toDate: period.latestTo } : null,
        },
        dimensions: (dimensionsOf.get(id) ?? []).map(
          ({ standardDimension, typeSlug, valueSlug }) => ({
            standardDimension,
            typeSlug,
            valueSlug,
          }),
        ),
        notes: (notesOf.get(id) ?? []).map(({ code, text }) => ({ code, text })),
      },
    ];
  });
}

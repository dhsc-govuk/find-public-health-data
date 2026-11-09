import { type SQL, sql } from 'drizzle-orm';

import type { Database } from './client.ts';

export type AreaLevelRow = {
  slug: string;
  name: string;
  hierarchy: 'administrative' | 'nhs' | null;
  parentLevels: string[];
};

/** The area levels that published data covers, in display order. */
export async function listAreaLevels(db: Database): Promise<AreaLevelRow[]> {
  const rows = await db.execute<AreaLevelRow>(sql`
    SELECT l.slug, l.name, l.hierarchy, l.parent_levels AS "parentLevels"
    FROM published.area_level l
    WHERE EXISTS (
      SELECT 1 FROM published.available_data d WHERE d.area_type_id = ANY(l.area_type_ids)
    )
    ORDER BY l.display_order
  `);
  return [...rows];
}

export type AreaRow = {
  code: string;
  name: string;
  level: string;
  validFrom: string | null;
  validTo: string | null;
};

export interface AreaFilters {
  codes?: readonly string[];
  /** A level's slug: every area of the level valid on `on`. */
  level?: string;
  /** An area's code: only areas within it. */
  parent?: string;
  /** The date boundaries are taken at, as an ISO date. Areas named by code are found whatever it is. */
  on?: string;
  /** Text the area's name contains, ignoring case. */
  name?: string;
}

/** The England area, which is the parent of every English area whether or not a link says so. */
export const ENGLAND_CODE = 'E92000001';

function codesArray(codes: readonly string[]): string {
  return `{${codes.map((code) => `"${code.replaceAll('"', '')}"`).join(',')}}`;
}

/**
 * Areas the public API names. An area in two levels, as a unitary authority is, takes the level
 * asked for, or else the first by display order. An area whose validity is unknown, as an NHS
 * organisation's is, counts as valid on any date.
 */
export async function findAreas(db: Database, filters: AreaFilters): Promise<AreaRow[]> {
  const conditions: SQL[] = [sql`true`];
  if (filters.on !== undefined) {
    conditions.push(
      sql`(a.valid_from IS NULL OR a.valid_from <= ${filters.on}::date)`,
      sql`(a.valid_to IS NULL OR a.valid_to >= ${filters.on}::date)`,
    );
  }
  if (filters.codes !== undefined) {
    conditions.push(sql`a.code = ANY(${codesArray(filters.codes)}::text[])`);
  }
  if (filters.level !== undefined) conditions.push(sql`l.slug = ${filters.level}`);
  if (filters.name !== undefined) {
    conditions.push(sql`a.name ILIKE ${`%${filters.name.replace(/[\\%_]/g, '\\$&')}%`}`);
  }
  if (filters.parent !== undefined && filters.parent !== ENGLAND_CODE) {
    conditions.push(sql`a.id IN (
      WITH RECURSIVE descendant(id) AS (
        SELECT r.child_area_id FROM published.area_relationship r
        JOIN published.area p ON p.id = r.parent_area_id
        WHERE p.code = ${filters.parent}
        UNION
        SELECT r.child_area_id FROM published.area_relationship r
        JOIN descendant d ON d.id = r.parent_area_id
      )
      SELECT id FROM descendant
    )`);
  }

  const rows = await db.execute<AreaRow>(sql`
    SELECT DISTINCT ON (a.code)
      a.code,
      a.name,
      l.slug AS level,
      a.valid_from::text AS "validFrom",
      a.valid_to::text AS "validTo"
    FROM published.area a
    JOIN published.area_level l ON a.area_type_id = ANY(l.area_type_ids)
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY a.code, l.display_order
  `);
  return [...rows];
}

export type AreaParentRow = AreaRow & { depth: number };

/** Every area above an area, nearest first, with England last. */
export async function listAreaAncestors(db: Database, code: string): Promise<AreaParentRow[]> {
  const rows = await db.execute<AreaParentRow>(sql`
    WITH RECURSIVE ancestor(id, depth) AS (
      SELECT r.parent_area_id, 1 FROM published.area_relationship r
      JOIN published.area c ON c.id = r.child_area_id
      WHERE c.code = ${code} AND r.parent_area_id <> c.id
      UNION
      SELECT r.parent_area_id, a.depth + 1 FROM published.area_relationship r
      JOIN ancestor a ON a.id = r.child_area_id
      WHERE a.depth < 10 AND r.parent_area_id <> r.child_area_id
    )
    SELECT DISTINCT ON (p.code)
      p.code,
      p.name,
      l.slug AS level,
      p.valid_from::text AS "validFrom",
      p.valid_to::text AS "validTo",
      min(a.depth) OVER (PARTITION BY p.code) AS depth
    FROM ancestor a
    JOIN published.area p ON p.id = a.id
    JOIN published.area_level l ON p.area_type_id = ANY(l.area_type_ids)
    WHERE p.code <> ${code}
    ORDER BY p.code, l.display_order
  `);
  return [...rows].sort(
    (a, b) =>
      Number(a.code === ENGLAND_CODE) - Number(b.code === ENGLAND_CODE) || a.depth - b.depth,
  );
}

import type { AgeUnit, StandardDimension } from '@fphd/utils/standard-dimension';
import { sql } from 'drizzle-orm';

import type { Database } from './client.ts';

/** A dimension type as the public API names it, with whether any published data uses it. */
export type PublicDimensionTypeRow = {
  id: string;
  name: string;
  standardDimension: StandardDimension | null;
  slug: string | null;
  release: string | null;
  ranked: string | null;
  within: 'england' | 'area' | null;
  boundaries: string | null;
  groups: number | null;
};

export type PublicDimensionValueRow = {
  dimensionTypeId: string;
  slug: string;
  name: string;
  sortOrder: number;
  ageFromValue: number | null;
  ageFromUnit: AgeUnit | null;
  ageUnderValue: number | null;
  ageUnderUnit: AgeUnit | null;
};

/**
 * The dimension types published data is broken down by, with their public names and values. A
 * type no published observation uses is left out, as is a value with no public name.
 */
export async function listPublicDimensions(
  db: Database,
): Promise<{ types: PublicDimensionTypeRow[]; values: PublicDimensionValueRow[] }> {
  const types = await db.execute<PublicDimensionTypeRow>(sql`
    SELECT
      dt.id,
      dt.name,
      p.standard_dimension AS "standardDimension",
      p.slug,
      ds.release,
      ds.ranked,
      ds.within,
      ds.boundaries,
      ds.groups
    FROM published.dimension_type dt
    JOIN published.dimension_type_public p ON p.id = dt.id
    LEFT JOIN published.deprivation_scheme ds ON ds.id = dt.id
    WHERE EXISTS (
      SELECT 1
      FROM published.dimension_value v
      JOIN published.observation_dimension od ON od.dimension_value_id = v.id
      WHERE v.dimension_type_id = dt.id
    )
    ORDER BY dt.name
  `);
  const values = await db.execute<PublicDimensionValueRow>(sql`
    SELECT
      v.dimension_type_id AS "dimensionTypeId",
      p.slug,
      v.name,
      v.sort_order AS "sortOrder",
      p.age_from_value AS "ageFromValue",
      p.age_from_unit AS "ageFromUnit",
      p.age_under_value AS "ageUnderValue",
      p.age_under_unit AS "ageUnderUnit"
    FROM published.dimension_value v
    JOIN published.dimension_value_public p ON p.id = v.id
    WHERE v.dimension_type_id = ANY(${`{${types.map(({ id }) => id).join(',')}}`}::uuid[])
    ORDER BY v.dimension_type_id, v.sort_order, v.name
  `);

  return { types: [...types], values: [...values] };
}

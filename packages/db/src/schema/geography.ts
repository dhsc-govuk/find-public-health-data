import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';

/** The hierarchies an area type belongs to. */
export const AREA_HIERARCHY_TYPES = ['NHS', 'Administrative'] as const;

export const areaType = pgTable(
  'area_type',
  {
    id: uuidPrimaryKey(),
    name: text().notNull().unique(),
    hierarchyType: text({ enum: AREA_HIERARCHY_TYPES }).notNull(),
    level: integer().notNull(),
    /** The user-facing level this type rolls into ("Local authorities"); null stays hidden. */
    displayGroup: text(),
    displayOrder: integer(),
  },
  (t) => [
    check(
      'area_type_hierarchy_type_check',
      sql`${t.hierarchyType} IN (${literals(AREA_HIERARCHY_TYPES)})`,
    ),
  ],
);

// The EXCLUDE USING gist constraint preventing overlapping validity ranges per area
// code cannot be expressed by Drizzle's schema API; it lives in a custom migration.
export const area = pgTable(
  'area',
  {
    id: uuidPrimaryKey(),
    code: text().notNull(),
    name: text().notNull(),
    areaTypeId: uuid()
      .notNull()
      .references(() => areaType.id),
    validFrom: date(),
    validTo: date(),
    isCurrent: boolean().notNull().default(true),
  },
  (t) => [
    check('area_validity_order_check', sql`${t.validTo} IS NULL OR ${t.validFrom} <= ${t.validTo}`),
    index('idx_area_code').on(t.code),
    index('idx_area_code_validity').on(t.code, t.validFrom, t.validTo),
    index('idx_area_type').on(t.areaTypeId),
    index('idx_area_validity').on(t.areaTypeId, t.validFrom, t.validTo),
  ],
);

export const areaRelationship = pgTable(
  'area_relationship',
  {
    id: uuidPrimaryKey(),
    parentAreaId: uuid()
      .notNull()
      .references(() => area.id),
    childAreaId: uuid()
      .notNull()
      .references(() => area.id),
    validFrom: date(),
    validTo: date(),
  },
  (t) => [
    check(
      'area_relationship_validity_order_check',
      sql`${t.validTo} IS NULL OR ${t.validFrom} <= ${t.validTo}`,
    ),
    index('idx_area_rel_parent').on(t.parentAreaId),
    index('idx_area_rel_child').on(t.childAreaId),
  ],
);

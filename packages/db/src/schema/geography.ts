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
    index('idx_area_type_current_name_code_id').on(t.areaTypeId, t.isCurrent, t.name, t.code, t.id),
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

/** The hierarchies the public API says an area level belongs to. */
export const AREA_LEVEL_HIERARCHIES = ['administrative', 'nhs'] as const;

/**
 * An area type as the public API names it: a level of geography without a boundary vintage, made
 * of the Fingertips area types that hold its areas. "UA unchanged" is in two levels, counties and
 * districts. `parent_levels` are the levels above it, nearest first, as slugs: the first is the
 * default parent for siblings, and each can be a benchmark. Hand-written reference data.
 */
export const areaLevel = pgTable(
  'area_level',
  {
    id: uuidPrimaryKey(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    hierarchy: text({ enum: AREA_LEVEL_HIERARCHIES }),
    displayOrder: integer().notNull(),
    parentLevels: text().array().notNull(),
    areaTypeIds: uuid().array().notNull(),
  },
  (t) => [
    check(
      'area_level_hierarchy_check',
      sql`${t.hierarchy} IN (${literals(AREA_LEVEL_HIERARCHIES)})`,
    ),
  ],
);

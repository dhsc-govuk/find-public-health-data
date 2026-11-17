import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';

/** The hierarchies an area type belongs to. */
export const AREA_HIERARCHY_TYPES = ['NHS', 'Administrative'] as const;

export const areaType = pgTable(
  'area_type',
  {
    id: uuidPrimaryKey(),
    name: text().notNull().unique(),
    hierarchyType: text({ enum: AREA_HIERARCHY_TYPES }).notNull(),
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
    index('idx_area_type_current_name_code_id').on(t.areaTypeId, t.isCurrent, t.name, t.code, t.id),
    index('idx_area_type_validity').on(t.areaTypeId, t.validFrom, t.validTo),
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
    index('idx_area_relationship_parent').on(t.parentAreaId),
    index('idx_area_relationship_child').on(t.childAreaId),
  ],
);

/** An area's statistical neighbours under a scheme, most similar first. Only the ranking is held. */
export const areaNeighbour = pgTable(
  'area_neighbour',
  {
    id: uuidPrimaryKey(),
    areaId: uuid()
      .notNull()
      .references(() => area.id),
    neighbourAreaId: uuid()
      .notNull()
      .references(() => area.id),
    scheme: text().notNull(),
    position: integer().notNull(),
  },
  (t) => [
    check('area_neighbour_position_check', sql`${t.position} > 0`),
    uniqueIndex('idx_area_neighbour_area_scheme_position').on(t.areaId, t.scheme, t.position),
  ],
);

import { AGE_UNITS } from '@fphd/utils/age-range';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';

/** The kinds of dimension an observation can be broken down by. */
export const DIMENSION_CLASSES = ['core', 'inequality', 'demographic', 'clinical'] as const;

export const dimensionType = pgTable(
  'dimension_type',
  {
    id: uuidPrimaryKey(),
    name: text().notNull().unique(),
    dimensionClass: text({ enum: DIMENSION_CLASSES }).notNull(),
    classificationScheme: text(),
    granularity: text(),
    isRequired: boolean().notNull().default(false),
  },
  (t) => [
    check(
      'dimension_type_dimension_class_check',
      sql`${t.dimensionClass} IN (${literals(DIMENSION_CLASSES)})`,
    ),
  ],
);

export const dimensionValue = pgTable(
  'dimension_value',
  {
    id: uuidPrimaryKey(),
    dimensionTypeId: uuid()
      .notNull()
      .references(() => dimensionType.id),
    parentId: uuid().references((): AnyPgColumn => dimensionValue.id),
    name: text().notNull(),
    code: text(),
    sortOrder: integer().notNull().default(0),
    isAggregate: boolean().notNull().default(false),
  },
  (t) => [
    unique('dimension_value_dimension_type_id_name_unique').on(t.dimensionTypeId, t.name),
    // Target for the bridge table's composite (value, type) foreign key.
    unique('dimension_value_id_dimension_type_id_unique').on(t.id, t.dimensionTypeId),
    index('idx_dimension_value_type').on(t.dimensionTypeId),
    index('idx_dimension_value_parent').on(t.parentId).where(sql`${t.parentId} IS NOT NULL`),
  ],
);

/**
 * The range of each age value that is one, from inclusive and under exclusive, as HL7 time period
 * ranges. A null upper bound means no upper limit. An age that isn't a range, such as All ages or
 * School age, has no row.
 */
export const dimensionValueAgeRange = pgTable(
  'dimension_value_age_range',
  {
    id: uuid()
      .primaryKey()
      .references(() => dimensionValue.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
    ageFromValue: smallint().notNull(),
    ageFromUnit: text({ enum: AGE_UNITS }).notNull(),
    ageUnderValue: smallint(),
    ageUnderUnit: text({ enum: AGE_UNITS }),
  },
  (t) => [
    check(
      'dimension_value_age_range_age_from_unit_check',
      sql`${t.ageFromUnit} IN (${literals(AGE_UNITS)})`,
    ),
    check(
      'dimension_value_age_range_age_under_check',
      sql`(${t.ageUnderValue} IS NULL) = (${t.ageUnderUnit} IS NULL) AND ${t.ageUnderUnit} IN (${literals(AGE_UNITS)})`,
    ),
  ],
);

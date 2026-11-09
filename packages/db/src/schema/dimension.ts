import { AGE_UNITS, STANDARD_DIMENSIONS } from '@fphd/utils/standard-dimension';
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
    schemeVersion: text(),
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
    unique().on(t.dimensionTypeId, t.name),
    // Target for the bridge table's composite (value, type) foreign key.
    unique().on(t.id, t.dimensionTypeId),
    index('idx_dim_val_type').on(t.dimensionTypeId),
    index('idx_dim_val_parent').on(t.parentId).where(sql`${t.parentId} IS NOT NULL`),
  ],
);

/**
 * How the public API names a dimension type: the standard dimension it belongs to (null for a
 * custom one) and its slug, a scheme's for a standard dimension with schemes or a custom
 * dimension's own. Reference data the core data import loads, apart from the upload formats.
 */
export const dimensionTypePublic = pgTable(
  'dimension_type_public',
  {
    id: uuid()
      .primaryKey()
      .references(() => dimensionType.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
    standardDimension: text({ enum: STANDARD_DIMENSIONS }),
    slug: text(),
  },
  (t) => [
    check(
      'dimension_type_public_standard_dimension_check',
      sql`${t.standardDimension} IN (${literals(STANDARD_DIMENSIONS)})`,
    ),
  ],
);

/**
 * How the public API names a dimension value, with an age band's range as HL7 time period
 * ranges (from inclusive, under exclusive) and a deprivation value's group. A value with no row
 * here, such as All ages, is never shown.
 */
export const dimensionValuePublic = pgTable(
  'dimension_value_public',
  {
    id: uuid()
      .primaryKey()
      .references(() => dimensionValue.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
    slug: text().notNull(),
    ageFromValue: smallint(),
    ageFromUnit: text({ enum: AGE_UNITS }),
    ageUnderValue: smallint(),
    ageUnderUnit: text({ enum: AGE_UNITS }),
    deprivationGroup: smallint(),
  },
  (t) => [
    check(
      'dimension_value_public_age_from_check',
      sql`(${t.ageFromValue} IS NULL) = (${t.ageFromUnit} IS NULL) AND ${t.ageFromUnit} IN (${literals(AGE_UNITS)})`,
    ),
    check(
      'dimension_value_public_age_under_check',
      sql`(${t.ageUnderValue} IS NULL) = (${t.ageUnderUnit} IS NULL) AND ${t.ageUnderUnit} IN (${literals(AGE_UNITS)})`,
    ),
    check(
      'dimension_value_public_deprivation_group_check',
      sql`${t.deprivationGroup} BETWEEN 1 AND 10`,
    ),
  ],
);

export const DEPRIVATION_WITHIN = ['england', 'area'] as const;

/** A deprivation scheme's parts: what was ranked, where, against which IMD release. */
export const deprivationScheme = pgTable(
  'deprivation_scheme',
  {
    id: uuid()
      .primaryKey()
      .references(() => dimensionType.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
    release: text().notNull(),
    ranked: text().notNull(),
    within: text({ enum: DEPRIVATION_WITHIN }).notNull(),
    boundaries: text(),
    groups: smallint().notNull(),
  },
  (t) => [
    check('deprivation_scheme_within_check', sql`${t.within} IN (${literals(DEPRIVATION_WITHIN)})`),
    check('deprivation_scheme_groups_check', sql`${t.groups} IN (5, 10)`),
  ],
);

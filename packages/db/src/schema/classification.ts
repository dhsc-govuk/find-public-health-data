import { z } from '@fphd/config';
import { CLASSIFICATION_DIMENSIONS } from '@fphd/utils/classification-dimension';
import { SLUG_PATTERN } from '@fphd/utils/slug';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { literals, timestamps, uuidPrimaryKey } from './helpers.ts';
import { indicatorVersion } from './indicator.ts';

/**
 * The classifications of every dimension in `@fphd/utils/classification-dimension`: one table
 * because the dimensions differ only in their vocabulary. Adding one extends
 * `CLASSIFICATION_DIMENSIONS`, with a migration for the check.
 */
export const classification = pgTable(
  'classification',
  {
    id: uuidPrimaryKey(),
    dimension: text({ enum: CLASSIFICATION_DIMENSIONS }).notNull(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    // The order the publisher's lists show the classifications in, that of classifications.json.
    position: smallint().notNull(),
    ...timestamps,
  },
  (t) => [
    check(
      'classification_dimension_check',
      sql`${t.dimension} IN (${literals(CLASSIFICATION_DIMENSIONS)})`,
    ),
    index('idx_classification_dimension').on(t.dimension),
  ],
);

/** The classifications of an indicator version, in every dimension. */
export const indicatorVersionClassification = pgTable(
  'indicator_version_classification',
  {
    indicatorVersionId: uuid().notNull(),
    classificationId: uuid().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'indicator_version_classification_pk',
      columns: [t.indicatorVersionId, t.classificationId],
    }),
    foreignKey({
      name: 'indicator_version_classification_version_fk',
      columns: [t.indicatorVersionId],
      foreignColumns: [indicatorVersion.id],
    }),
    foreignKey({
      name: 'indicator_version_classification_classification_fk',
      columns: [t.classificationId],
      foreignColumns: [classification.id],
    }),
    index('idx_indicator_version_classification_classification').on(t.classificationId),
  ],
);

/** A classification as the core data file states it, keyed by a fixed id. */
export const classificationRecordSchema = z.object({
  id: z.uuidv7(),
  dimension: z.enum(CLASSIFICATION_DIMENSIONS),
  slug: z.string().min(1).regex(SLUG_PATTERN, 'slug must be lowercase, hyphen-separated words'),
  name: z.string().min(1),
});

export type ClassificationRecord = z.infer<typeof classificationRecordSchema>;

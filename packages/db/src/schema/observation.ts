import { sql } from 'drizzle-orm';
import {
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dimensionValue } from './dimension.ts';
import { area } from './geography.ts';
import { literals, uuidPrimaryKey } from './helpers.ts';
import { indicator } from './indicator.ts';
import { uploadBatch } from './upload.ts';

/** What an observation's note is about. */
export const NOTE_TYPE_CATEGORIES = [
  'disclosure',
  'quality',
  'geographic',
  'methodological',
  'estimation',
  'missing',
  'contextual',
] as const;

export const noteType = pgTable(
  'note_type',
  {
    id: uuidPrimaryKey(),
    text: text().notNull().unique(),
    category: text({ enum: NOTE_TYPE_CATEGORIES }).notNull(),
  },
  (t) => [
    check('note_type_category_check', sql`${t.category} IN (${literals(NOTE_TYPE_CATEGORIES)})`),
  ],
);

// Explicit column names where Drizzle's snake_case transform would drop the
// underscore before digits (denominator2 -> denominator2, lowerCi95 -> lower_ci95).
export const observation = pgTable(
  'observation',
  {
    id: uuidPrimaryKey(),
    indicatorId: uuid()
      .notNull()
      .references(() => indicator.id),
    areaId: uuid()
      .notNull()
      .references(() => area.id),
    fromDate: date().notNull(),
    toDate: date().notNull(),
    value: doublePrecision(),
    count: doublePrecision(),
    numerator: doublePrecision(),
    denominator: doublePrecision(),
    denominator2: doublePrecision('denominator_2'),
    lowerCi95: doublePrecision('lower_ci_95'),
    upperCi95: doublePrecision('upper_ci_95'),
    lowerCi998: doublePrecision('lower_ci_998'),
    upperCi998: doublePrecision('upper_ci_998'),
    uploadBatchId: uuid().notNull(),
    // Written by whoever inserts the row, from the dimension values it is about to bridge to.
    dimensionKey: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Pairing upload_batch_id with indicator_id guarantees an observation's batch
    // belongs to the same indicator the observation records.
    foreignKey({
      columns: [t.uploadBatchId, t.indicatorId],
      foreignColumns: [uploadBatch.id, uploadBatch.indicatorId],
      name: 'observation_upload_batch_indicator_fk',
    }),
    check('observation_date_order_check', sql`${t.fromDate} <= ${t.toDate}`),
    // The natural key: one row per area, period and dimension values within a batch. Leading with
    // the batch, it also serves lookups by batch.
    uniqueIndex('idx_observation_batch_area_dates_dimension_key').on(
      t.uploadBatchId,
      t.areaId,
      t.fromDate,
      t.toDate,
      t.dimensionKey,
    ),
    index('idx_observation_indicator_dates').on(t.indicatorId, t.fromDate, t.toDate),
    index('idx_observation_indicator_area_from').on(t.indicatorId, t.areaId, t.fromDate),
  ],
);

// dimension_type_id is denormalised onto the bridge so the database itself can
// enforce at most one value per dimension type per observation; the composite
// foreign key keeps it consistent with the referenced dimension value.
export const observationDimension = pgTable(
  'observation_dimension',
  {
    id: uuidPrimaryKey(),
    observationId: uuid()
      .notNull()
      .references(() => observation.id, { onDelete: 'cascade' }),
    dimensionValueId: uuid().notNull(),
    dimensionTypeId: uuid().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.dimensionValueId, t.dimensionTypeId],
      foreignColumns: [dimensionValue.id, dimensionValue.dimensionTypeId],
      name: 'observation_dimension_value_type_fk',
    }),
    unique('observation_dimension_observation_id_dimension_type_id_unique').on(
      t.observationId,
      t.dimensionTypeId,
    ),
  ],
);

export const observationNote = pgTable(
  'observation_note',
  {
    id: uuidPrimaryKey(),
    observationId: uuid()
      .notNull()
      .references(() => observation.id, { onDelete: 'cascade' }),
    noteTypeId: uuid()
      .notNull()
      .references(() => noteType.id),
  },
  (t) => [
    unique('observation_note_observation_id_note_type_id_unique').on(t.observationId, t.noteTypeId),
  ],
);

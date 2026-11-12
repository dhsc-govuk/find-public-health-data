import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  type PgTableExtraConfigValue,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';
import { indicator, indicatorVersion } from './indicator.ts';
import { actorId } from './user.ts';

/** Where an upload stands, from receipt to processing. */
export const UPLOAD_BATCH_STATUSES = ['received', 'processed', 'failed'] as const;

export type UploadBatchStatus = (typeof UPLOAD_BATCH_STATUSES)[number];

export const uploadBatch = pgTable(
  'upload_batch',
  {
    id: uuidPrimaryKey(),
    indicatorId: uuid()
      .notNull()
      .references(() => indicator.id),
    // The version it was uploaded to, which keeps it even when no version points at it.
    indicatorVersionId: uuid().notNull(),
    originalFilename: text().notNull(),
    uploadedBy: actorId().notNull(),
    uploadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: text({ enum: UPLOAD_BATCH_STATUSES }).notNull().default('received'),
    validationResult: jsonb(),
    blobName: text(),
    byteSize: bigint({ mode: 'number' }),
    sha256: text(),
    rowCount: integer(),
    columnNames: text().array(),
  },
  // Annotated because indicator_version's foreign key refers back to this table.
  (t): PgTableExtraConfigValue[] => [
    check('upload_batch_status_check', sql`${t.status} IN (${literals(UPLOAD_BATCH_STATUSES)})`),
    check('upload_batch_sha256_check', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    // Target for the composite (batch, indicator) foreign keys of observation and indicator_version.
    unique('upload_batch_id_indicator_id_unique').on(t.id, t.indicatorId),
    // Pairing the version with indicator_id keeps a batch on a version of its own indicator.
    foreignKey({
      columns: [t.indicatorVersionId, t.indicatorId],
      foreignColumns: [indicatorVersion.id, indicatorVersion.indicatorId],
      name: 'upload_batch_indicator_version_fk',
    }),
    index('idx_upload_batch_indicator_version').on(t.indicatorVersionId),
  ],
);

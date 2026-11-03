import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';
import { actorId } from './user.ts';

/** The tables whose core data the import loads, each recording a created and an updated action. */
export const CORE_DATA_TABLES = [
  'subtopic',
  'ci_method',
  'classification',
  'data_provider',
  'data_provider_source',
  'value_type',
  'unit',
  'comparator_method',
] as const;

/** Every change the log records, named `<entity type>.<what happened>`. */
export const AUDIT_ACTIONS = [
  'topic.created',
  'topic.updated',
  'topic.deleted',
  'indicator.draft_created',
  'indicator.draft_updated',
  'indicator.draft_created_from_published',
  'indicator.data_table_confirmed',
  'indicator.submitted',
  'indicator.submission_withdrawn',
  'indicator.reviewers_assigned',
  'indicator.review_feedback_given',
  'indicator.changes_requested',
  'indicator.approved',
  'indicator.resubmitted',
  'indicator.revision_response_updated',
  'indicator.review_note_added',
  'indicator.review_note_updated',
  'upload_batch.loaded',
  'upload_batch.refused',
  'upload_batch.deleted',
  'data_migration.applied',
  ...CORE_DATA_TABLES.flatMap((table) => [`${table}.created`, `${table}.updated`] as const),
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** A field's value before and after a change; null where there was no row, or no value. */
export interface FieldChange {
  before: unknown;
  after: unknown;
}

export type AuditChanges = Record<string, FieldChange>;

/**
 * Who changed what, and when, for every write the internal API or an operations command makes.
 * Rows name people by `app_user` id alone, so anonymising a person never touches the log.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuidPrimaryKey(),
    // Insert time, not transaction start, so a writer that waited on a row records the later time.
    occurredAt: timestamp({ withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    actorId: actorId().notNull(),
    action: text({ enum: AUDIT_ACTIONS }).notNull(),
    entityType: text().notNull(),
    // Text, because a data migration's id is.
    entityId: text().notNull(),
    changes: jsonb().$type<AuditChanges>().notNull(),
    requestId: uuid(),
  },
  (t) => [
    check('audit_log_action_check', sql`${t.action} IN (${literals(AUDIT_ACTIONS)})`),
    check('audit_log_entity_type_check', sql`${t.entityType} = split_part(${t.action}, '.', 1)`),
    check('audit_log_changes_check', sql`jsonb_typeof(${t.changes}) = 'object'`),
    index('idx_audit_log_entity_type_entity_id_occurred_at').on(
      t.entityType,
      t.entityId,
      t.occurredAt,
    ),
  ],
);

import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';
import { actorId } from './user.ts';

/**
 * Every change the log records, named `<entity type>.<what happened>`. An indicator's history
 * reads three shapes, which must stay as they are: the `reviewerIds.after` of
 * `indicator.reviewers_assigned`, the field names of `indicator.draft_updated`, and the
 * `dataTableConfirmedAt.before` of `indicator.data_table_confirmed`.
 */
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
  'indicator.update_sent_to_imrg',
  'indicator.update_revisions_requested',
  'indicator.update_approved',
  'indicator.reviewers_assigned',
  'indicator.review_feedback_given',
  'indicator.changes_requested',
  'indicator.approved',
  'indicator.resubmitted',
  'indicator.revision_response_updated',
  'indicator.publication_scheduled',
  'indicator.publication_date_changed',
  'indicator.published',
  // Reviewers' notes, which publishers may not read: never show these in the indicator's history.
  'indicator.review_note_added',
  'indicator.review_note_updated',
  'upload_batch.loaded',
  'upload_batch.refused',
  'upload_batch.deleted',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** A field's value before and after a change; null where there was no row, or no value. */
export interface FieldChange {
  before: unknown;
  after: unknown;
}

export type AuditChanges = Record<string, FieldChange>;

/**
 * Who changed what, and when. The log records every change made through the service, which
 * means each write by the internal API and each scheduled publication. Imports, data migrations,
 * seeding and resets record nothing, because they load data rather than change it. Each row names
 * a person only by their `app_user` id, so anonymising a person never touches the log.
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
    // Text, because data migrations, whose ids are not UUIDs, were once logged.
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

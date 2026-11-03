import {
  INDICATOR_SUBMISSION_STATUSES,
  type IndicatorSubmissionStatus,
} from '@fphd/utils/indicator-submission-status';
import { FLAGGABLE_TASK_KEYS, type FlaggableTaskKey } from '@fphd/utils/indicator-task-key';
import { REVIEW_RESPONSE_KINDS } from '@fphd/utils/review-response-kind';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';
import { indicatorVersion } from './indicator.ts';
import { appUser } from './user.ts';

/** The statuses that end a submission, each recording who ended it and when. */
const ENDED_STATUSES = [
  'withdrawn',
  'changes_requested',
  'approved',
] as const satisfies readonly IndicatorSubmissionStatus[];

/**
 * One round of review of a version: inserted when the publisher submits it and updated as the
 * review goes on. The audit log keeps each change.
 */
export const indicatorVersionSubmission = pgTable(
  'indicator_version_submission',
  {
    id: uuidPrimaryKey(),
    indicatorVersionId: uuid().notNull(),
    indicatorId: uuid().notNull(),
    // 1 for a version's first submission, one more for each resubmission.
    number: integer().notNull(),
    status: text({ enum: INDICATOR_SUBMISSION_STATUSES }).notNull(),
    submittedBy: uuid().notNull(),
    // Insert time, not transaction start, so submissions sort in commit order.
    submittedAt: timestamp({ withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    endedBy: uuid(),
    endedAt: timestamp({ withTimezone: true }),
    // The publisher's reply to this round's feedback, written while its changes are requested.
    revisionResponse: text(),
  },
  (t) => [
    // Pairing the version with indicator_id keeps a submission on a version of its own indicator.
    foreignKey({
      name: 'indicator_version_submission_version_fk',
      columns: [t.indicatorVersionId, t.indicatorId],
      foreignColumns: [indicatorVersion.id, indicatorVersion.indicatorId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'indicator_version_submission_submitted_by_fk',
      columns: [t.submittedBy],
      foreignColumns: [appUser.id],
    }),
    foreignKey({
      name: 'indicator_version_submission_ended_by_fk',
      columns: [t.endedBy],
      foreignColumns: [appUser.id],
    }),
    check(
      'indicator_version_submission_status_check',
      sql`${t.status} IN (${literals(INDICATOR_SUBMISSION_STATUSES)})`,
    ),
    check('indicator_version_submission_number_check', sql`${t.number} > 0`),
    check(
      'indicator_version_submission_ended_check',
      sql`(${t.status} IN (${literals(ENDED_STATUSES)})) = (${t.endedBy} IS NOT NULL) AND (${t.endedBy} IS NULL) = (${t.endedAt} IS NULL)`,
    ),
    // Also serves the latest-submission lookup and the foreign key.
    uniqueIndex('idx_indicator_version_submission_indicator_version_id_number').on(
      t.indicatorVersionId,
      t.number,
    ),
    index('idx_indicator_version_submission_indicator_id_submitted_at').on(
      t.indicatorId,
      t.submittedAt,
    ),
  ],
);

/**
 * The reviewers assigned to a submission. Changing them deletes the rows of those removed; the
 * audit log keeps who was assigned when.
 */
export const indicatorVersionSubmissionReviewer = pgTable(
  'indicator_version_submission_reviewer',
  {
    submissionId: uuid().notNull(),
    reviewerId: uuid().notNull(),
    assignedBy: uuid().notNull(),
    assignedAt: timestamp({ withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    primaryKey({
      name: 'indicator_version_submission_reviewer_pk',
      columns: [t.submissionId, t.reviewerId],
    }),
    foreignKey({
      name: 'indicator_version_submission_reviewer_submission_fk',
      columns: [t.submissionId],
      foreignColumns: [indicatorVersionSubmission.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'indicator_version_submission_reviewer_reviewer_fk',
      columns: [t.reviewerId],
      foreignColumns: [appUser.id],
    }),
    foreignKey({
      name: 'indicator_version_submission_reviewer_assigned_by_fk',
      columns: [t.assignedBy],
      foreignColumns: [appUser.id],
    }),
    index('idx_indicator_version_submission_reviewer_reviewer_id').on(t.reviewerId),
  ],
);

/**
 * A reviewer's response to a submission, which ends it. A response is final: the app never
 * updates or deletes one. One per submission for now, by the unique index.
 */
export const indicatorVersionSubmissionResponse = pgTable(
  'indicator_version_submission_response',
  {
    id: uuidPrimaryKey(),
    submissionId: uuid().notNull(),
    reviewerId: uuid().notNull(),
    kind: text({ enum: REVIEW_RESPONSE_KINDS }).notNull(),
    // The day of the IMRG meeting that made the decision; none for feedback before it.
    imrgReviewedOn: date({ mode: 'string' }),
    clarificationRequest: text(),
    respondedAt: timestamp({ withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: 'indicator_version_submission_response_submission_fk',
      columns: [t.submissionId],
      foreignColumns: [indicatorVersionSubmission.id],
    }).onDelete('cascade'),
    // NO ACTION, not RESTRICT: deleting a version removes the reviewer rows and the responses in
    // one statement, and NO ACTION checks only at its end.
    foreignKey({
      name: 'indicator_version_submission_response_reviewer_fk',
      columns: [t.submissionId, t.reviewerId],
      foreignColumns: [
        indicatorVersionSubmissionReviewer.submissionId,
        indicatorVersionSubmissionReviewer.reviewerId,
      ],
    }),
    check(
      'indicator_version_submission_response_kind_check',
      sql`${t.kind} IN (${literals(REVIEW_RESPONSE_KINDS)})`,
    ),
    check(
      'indicator_version_submission_response_imrg_reviewed_on_check',
      sql`(${t.imrgReviewedOn} IS NULL) = (${t.kind} = 'pre_imrg_feedback')`,
    ),
    check(
      'indicator_version_submission_response_clarification_check',
      sql`${t.clarificationRequest} IS NULL OR (${t.kind} <> 'approved' AND ${t.clarificationRequest} <> '')`,
    ),
    uniqueIndex('idx_indicator_version_submission_response_submission_id').on(t.submissionId),
  ],
);

/** A task a response asks the publisher to revise, cleared when the publisher saves the task. */
export const indicatorVersionSubmissionFlag = pgTable(
  'indicator_version_submission_flag',
  {
    responseId: uuid().notNull(),
    taskKey: text().$type<FlaggableTaskKey>().notNull(),
    notes: text().notNull(),
    clearedBy: uuid(),
    clearedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({
      name: 'indicator_version_submission_flag_pk',
      columns: [t.responseId, t.taskKey],
    }),
    foreignKey({
      name: 'indicator_version_submission_flag_response_fk',
      columns: [t.responseId],
      foreignColumns: [indicatorVersionSubmissionResponse.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'indicator_version_submission_flag_cleared_by_fk',
      columns: [t.clearedBy],
      foreignColumns: [appUser.id],
    }),
    check(
      'indicator_version_submission_flag_task_key_check',
      sql`${t.taskKey} IN (${literals(FLAGGABLE_TASK_KEYS)})`,
    ),
    check('indicator_version_submission_flag_notes_check', sql`${t.notes} <> ''`),
    check(
      'indicator_version_submission_flag_cleared_check',
      sql`(${t.clearedBy} IS NULL) = (${t.clearedAt} IS NULL)`,
    ),
  ],
);

/**
 * A reviewer's working note on a version, kept across its submissions and read only by its
 * author. Writing one is not an edit of the version.
 */
export const indicatorVersionReviewNote = pgTable(
  'indicator_version_review_note',
  {
    id: uuidPrimaryKey(),
    // The submission the note was written in, which names the version.
    submissionId: uuid().notNull(),
    // A user, not a reviewer row, so removing the reviewer keeps their notes.
    authorId: uuid().notNull(),
    text: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().default(sql`clock_timestamp()`),
    updatedAt: timestamp({ withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    foreignKey({
      name: 'indicator_version_review_note_submission_fk',
      columns: [t.submissionId],
      foreignColumns: [indicatorVersionSubmission.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'indicator_version_review_note_author_fk',
      columns: [t.authorId],
      foreignColumns: [appUser.id],
    }),
    check('indicator_version_review_note_text_check', sql`${t.text} <> ''`),
    index('idx_indicator_version_review_note_submission_id_created_at').on(
      t.submissionId,
      t.createdAt,
    ),
  ],
);

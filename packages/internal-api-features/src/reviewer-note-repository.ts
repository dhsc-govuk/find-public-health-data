import { type Database, schema } from '@fphd/db';
import { type Actor, recordAudit } from '@fphd/db/audit-log';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';

import { type EditPrecondition, editVersion } from './edit-version.ts';
import type { Transaction } from './indicator-repository-sql.ts';

const {
  appUser,
  indicatorVersion,
  indicatorVersionReviewNote,
  indicatorVersionSubmission,
  indicatorVersionSubmissionReviewer,
  isUnpublished,
} = schema;

type Reader = Database | Transaction;

/** A reviewer's note. */
export interface ReviewerNoteRow {
  id: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A reviewer's note as its readers list it, with who wrote it. */
export interface ListedReviewerNoteRow extends ReviewerNoteRow {
  author: { id: string; name: string };
}

export type AddReviewerNoteResult =
  | { ok: true; note: ReviewerNoteRow }
  | { ok: false; reason: 'not_a_reviewer' };

export type UpdateReviewerNoteResult =
  | { ok: true; note: ReviewerNoteRow; changed: boolean }
  | { ok: false; reason: 'not_a_reviewer' | 'not_found' }
  | { ok: false; reason: 'changed'; version: string };

/** The version of a note an edit form shows: a hash of its text. */
export function reviewerNoteVersion({ text }: Pick<ReviewerNoteRow, 'text'>): string {
  return editVersion(text);
}

const noteColumns = {
  id: indicatorVersionReviewNote.id,
  text: indicatorVersionReviewNote.text,
  createdAt: indicatorVersionReviewNote.createdAt,
  updatedAt: indicatorVersionReviewNote.updatedAt,
};

const ofDraft = and(
  eq(indicatorVersion.id, indicatorVersionSubmission.indicatorVersionId),
  isUnpublished(indicatorVersion.status),
);

/** The id of the indicator's draft's latest submission, as a scalar subquery. */
function latestDraftSubmissionId(db: Reader, indicatorId: string): SQL {
  const latest = db
    .select({ id: indicatorVersionSubmission.id })
    .from(indicatorVersionSubmission)
    .innerJoin(indicatorVersion, ofDraft)
    .where(eq(indicatorVersionSubmission.indicatorId, indicatorId))
    .orderBy(desc(indicatorVersionSubmission.number))
    .limit(1);
  return sql`(${latest})`;
}

/** The actor's reviewer row on the indicator's draft's latest submission, as a condition. */
function reviewsLatest(db: Reader, indicatorId: string, actor: Actor): SQL | undefined {
  return and(
    eq(indicatorVersionSubmissionReviewer.submissionId, latestDraftSubmissionId(db, indicatorId)),
    eq(indicatorVersionSubmissionReviewer.reviewerId, actor.userId),
  );
}

/** Every reviewer's notes on every submission of the indicator's draft, newest first. */
export async function listReviewerNotes(
  db: Database,
  indicatorId: string,
): Promise<ListedReviewerNoteRow[]> {
  return db
    .select({ ...noteColumns, author: { id: appUser.id, name: appUser.displayName } })
    .from(indicatorVersionReviewNote)
    .innerJoin(
      indicatorVersionSubmission,
      eq(indicatorVersionSubmission.id, indicatorVersionReviewNote.submissionId),
    )
    .innerJoin(indicatorVersion, ofDraft)
    .innerJoin(appUser, eq(appUser.id, indicatorVersionReviewNote.authorId))
    .where(eq(indicatorVersionSubmission.indicatorId, indicatorId))
    .orderBy(desc(indicatorVersionReviewNote.createdAt), desc(indicatorVersionReviewNote.id));
}

/**
 * Adds the actor's note to the draft's latest submission, as long as they are assigned to it.
 * The insert selects from their reviewer row, so the check and the write are one statement.
 */
export function addReviewerNote(
  db: Database,
  indicatorId: string,
  text: string,
  actor: Actor,
): Promise<AddReviewerNoteResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(indicatorVersionReviewNote)
      .select(
        tx
          // Drizzle wants every column, in the table's order; now() dates both alike.
          .select({
            id: sql<string>`uuidv7()`.as('id'),
            submissionId: indicatorVersionSubmissionReviewer.submissionId,
            authorId: indicatorVersionSubmissionReviewer.reviewerId,
            text: sql<string>`${text}::text`.as('text'),
            createdAt: sql<Date>`now()`.as('created_at'),
            updatedAt: sql<Date>`now()`.as('updated_at'),
          })
          .from(indicatorVersionSubmissionReviewer)
          .where(reviewsLatest(tx, indicatorId, actor)),
      )
      .returning({ ...noteColumns, submissionId: indicatorVersionReviewNote.submissionId });

    if (row === undefined) return { ok: false, reason: 'not_a_reviewer' };

    const { submissionId, ...note } = row;
    await recordAudit(tx, actor, [
      {
        action: 'indicator.review_note_added',
        entityId: indicatorId,
        changes: { note: { before: null, after: { id: note.id, submissionId, text } } },
      },
    ]);
    return { ok: true, note };
  });
}

/**
 * Changes the text of one of the actor's notes on the indicator's draft, as long as they are
 * still assigned to its latest submission and the note is as the form showed it. Neither this
 * nor adding a note takes the draft's lock: each note has one author, and the row lock and the
 * version keep a stale form from overwriting it.
 */
export function updateReviewerNote(
  db: Database,
  indicatorId: string,
  noteId: string,
  text: string,
  precondition: EditPrecondition<Pick<ReviewerNoteRow, 'text'>>,
  actor: Actor,
): Promise<UpdateReviewerNoteResult> {
  return db.transaction(async (tx) => {
    const [reviewing] = await tx
      .select({ reviewerId: indicatorVersionSubmissionReviewer.reviewerId })
      .from(indicatorVersionSubmissionReviewer)
      .where(reviewsLatest(tx, indicatorId, actor));

    if (reviewing === undefined) return { ok: false, reason: 'not_a_reviewer' };

    const [current] = await tx
      .select({ ...noteColumns, submissionId: indicatorVersionReviewNote.submissionId })
      .from(indicatorVersionReviewNote)
      .innerJoin(
        indicatorVersionSubmission,
        eq(indicatorVersionSubmission.id, indicatorVersionReviewNote.submissionId),
      )
      .innerJoin(indicatorVersion, ofDraft)
      .where(
        and(
          eq(indicatorVersionReviewNote.id, noteId),
          eq(indicatorVersionReviewNote.authorId, actor.userId),
          eq(indicatorVersionSubmission.indicatorId, indicatorId),
        ),
      )
      .for('update', { of: indicatorVersionReviewNote });

    if (current === undefined) return { ok: false, reason: 'not_found' };

    const version = precondition.versionOf(current);
    if (version !== precondition.version) return { ok: false, reason: 'changed', version };

    const { submissionId, ...note } = current;
    if (note.text === text) return { ok: true, note, changed: false };

    const [updated] = await tx
      .update(indicatorVersionReviewNote)
      .set({ text, updatedAt: sql`clock_timestamp()` })
      .where(eq(indicatorVersionReviewNote.id, noteId))
      .returning(noteColumns);

    if (updated === undefined) throw new Error(`note ${noteId} vanished under its row lock`);

    await recordAudit(tx, actor, [
      {
        action: 'indicator.review_note_updated',
        entityId: indicatorId,
        changes: {
          note: {
            before: { id: noteId, submissionId, text: note.text },
            after: { id: noteId, submissionId, text },
          },
        },
      },
    ]);
    return { ok: true, note: updated, changed: true };
  });
}
